import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import { participants, tickets, users } from "@/lib/db/schema";
import { newSlug } from "@/lib/slug";
import { splitEvenly } from "@/lib/shares";

const ALLOWED = process.env.ALLOWED_EMAIL_DOMAIN ?? "puresquare.com";

const payloadSchema = z.object({
  payerEmail: z.string().email(),
  payerName: z.string().optional(),
  payerSlackId: z.string().optional(),
  title: z.string().min(1).max(120),
  totalAmount: z.coerce.number().positive(),
  notes: z.string().max(500).optional().nullable(),
  participants: z
    .array(
      z.object({
        email: z.string().email(),
        name: z.string().optional(),
        slackId: z.string().optional(),
      }),
    )
    .min(1),
});

async function getOrCreateUser(email: string, name?: string, slackId?: string) {
  const lower = email.toLowerCase();
  const existing = await db.query.users.findFirst({ where: eq(users.email, lower) });
  if (existing) {
    if (slackId && !existing.slackUserId) {
      await db.update(users).set({ slackUserId: slackId }).where(eq(users.id, existing.id));
    }
    return existing;
  }
  const [created] = await db
    .insert(users)
    .values({ email: lower, name: name ?? null, slackUserId: slackId ?? null })
    .returning();
  return created;
}

export async function POST(req: Request) {
  const expected = process.env.SLACK_WORKFLOW_SECRET;
  const provided = req.headers.get("x-slack-workflow-secret");
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_payload", details: parsed.error.flatten() }, {
      status: 400,
    });
  }
  const data = parsed.data;

  // Domain check on all emails
  const allEmails = [data.payerEmail, ...data.participants.map((p) => p.email)];
  for (const e of allEmails) {
    if (!e.toLowerCase().endsWith(`@${ALLOWED}`)) {
      return NextResponse.json({ error: `email_not_in_${ALLOWED}` }, { status: 400 });
    }
  }

  // Resolve payer + participants
  const payer = await getOrCreateUser(data.payerEmail, data.payerName, data.payerSlackId);
  const otherList = data.participants.filter(
    (p) => p.email.toLowerCase() !== data.payerEmail.toLowerCase(),
  );
  if (otherList.length === 0) {
    return NextResponse.json({ error: "no_other_participants" }, { status: 400 });
  }
  const otherUsers = await Promise.all(
    otherList.map((p) => getOrCreateUser(p.email, p.name, p.slackId)),
  );

  const total = Math.round(data.totalAmount);
  const shares = splitEvenly(total, otherUsers.length);
  const slug = newSlug();

  await db.transaction(async (tx) => {
    const [t] = await tx
      .insert(tickets)
      .values({
        slug,
        payerId: payer.id,
        title: data.title,
        totalAmount: String(total),
        notes: data.notes ?? null,
      })
      .returning();
    await tx.insert(participants).values(
      otherUsers.map((u, i) => ({
        ticketId: t.id,
        userId: u.id,
        pendingEmail: u.email,
        pendingSlackId: u.slackUserId,
        guestName: u.name ?? u.email.split("@")[0],
        amountOwed: String(shares[i]),
      })),
    );
  });

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const ticketUrl = `${appUrl}/t/${slug}`;
  return NextResponse.json({
    ok: true,
    ticketUrl,
    slug,
    title: data.title,
    total,
    participantCount: otherUsers.length,
  });
}
