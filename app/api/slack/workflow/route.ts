import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { participants, tickets } from "@/lib/db/schema";
import { newSlug } from "@/lib/slug";
import { splitEvenly } from "@/lib/shares";

const payloadSchema = z.object({
  title: z.string().min(1).max(120),
  totalAmount: z.coerce.number().positive(),
  notes: z.string().max(500).optional().nullable(),

  payerName: z.string().min(1).max(80),
  payerEmail: z.string().email().optional().nullable(),
  payerWhatsapp: z.string().max(40).optional().nullable(),
  payerJazzcash: z.string().max(40).optional().nullable(),
  payerEasypaisa: z.string().max(40).optional().nullable(),
  payerIban: z.string().max(40).optional().nullable(),

  participants: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        email: z.string().email().optional().nullable(),
        whatsapp: z.string().max(40).optional().nullable(),
      }),
    )
    .min(1),
});

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
    return NextResponse.json(
      { error: "bad_payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const total = Math.round(data.totalAmount);
  const shares = splitEvenly(total, data.participants.length);
  const slug = newSlug();

  await db.transaction(async (tx) => {
    const [t] = await tx
      .insert(tickets)
      .values({
        slug,
        title: data.title,
        totalAmount: String(total),
        notes: data.notes ?? null,
        payerName: data.payerName,
        payerEmail: data.payerEmail ?? null,
        payerWhatsapp: data.payerWhatsapp ?? null,
        payerJazzcash: data.payerJazzcash ?? null,
        payerEasypaisa: data.payerEasypaisa ?? null,
        payerIban: data.payerIban ?? null,
      })
      .returning();
    await tx.insert(participants).values(
      data.participants.map((p, i) => ({
        ticketId: t.id,
        name: p.name,
        email: p.email ?? null,
        whatsapp: p.whatsapp ?? null,
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
    participantCount: data.participants.length,
  });
}
