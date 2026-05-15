import { NextResponse } from "next/server";
import { customAlphabet } from "nanoid";
import { z } from "zod";

import { newSlug } from "@/lib/slug";
import { splitEvenly } from "@/lib/shares";
import { putTicket } from "@/lib/store";
import { findPersonByEmail, getRoster } from "@/lib/store-roster";
import type { ParticipantStatus, Ticket } from "@/lib/types";

const newParticipantId = customAlphabet(
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  12,
);

// Minimal Slack payload — just title, total, and payer's email.
// Everything else looked up from the roster. Participants optional;
// people can self-add via the web "+ Add me" picker.
const payloadSchema = z.object({
  title: z.string().min(1).max(120),
  totalAmount: z.coerce.number().positive(),
  notes: z.string().max(500).optional().nullable(),

  payerEmail: z.string().email(),
  payerNameFallback: z.string().max(80).optional().nullable(),

  participants: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        email: z.string().email().optional().nullable(),
        whatsapp: z.string().max(40).optional().nullable(),
      }),
    )
    .optional()
    .default([]),
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

  // Look up payer in the shared roster (preferred) for their saved
  // payment methods. Fallback to the email + provided name if not found.
  const roster = await getRoster();
  const rosterPayer = findPersonByEmail(roster, data.payerEmail);

  const total = Math.round(data.totalAmount);
  const shares = data.participants.length > 0 ? splitEvenly(total, data.participants.length) : [];
  const slug = newSlug();
  const now = new Date().toISOString();

  const ticket: Ticket = {
    slug,
    title: data.title,
    totalAmount: total,
    currency: "PKR",
    notes: data.notes ?? null,
    payer: rosterPayer
      ? {
          name: rosterPayer.name,
          email: rosterPayer.email,
          whatsapp: rosterPayer.whatsapp,
          jazzcash: rosterPayer.jazzcash,
          easypaisa: rosterPayer.easypaisa,
          iban: rosterPayer.iban,
          accountTitle: rosterPayer.accountTitle,
          acceptsCash: rosterPayer.acceptsCash,
        }
      : {
          name: data.payerNameFallback || data.payerEmail.split("@")[0],
          email: data.payerEmail,
          whatsapp: null,
          jazzcash: null,
          easypaisa: null,
          iban: null,
          accountTitle: null,
          acceptsCash: true,
        },
    participants: data.participants.map((p, i) => ({
      id: newParticipantId(),
      name: p.name,
      email: p.email ?? null,
      whatsapp: p.whatsapp ?? null,
      amountOwed: shares[i],
      status: "pending" as ParticipantStatus,
      selfMarkedAt: null,
      confirmedAt: null,
    })),
    reminders: [],
    status: "open",
    createdAt: now,
    closedAt: null,
  };

  await putTicket(ticket);

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const ticketUrl = `${appUrl}/t/${slug}`;
  return NextResponse.json({
    ok: true,
    ticketUrl,
    slug,
    title: data.title,
    total,
    payerName: ticket.payer.name,
    payerInRoster: !!rosterPayer,
    participantCount: data.participants.length,
  });
}
