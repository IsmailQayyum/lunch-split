"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import { participants, reminderLog, tickets } from "@/lib/db/schema";
import { newSlug } from "@/lib/slug";
import { splitEvenly } from "@/lib/shares";
import { sendReminderEmail } from "@/lib/email";

const participantInputSchema = z.object({
  name: z.string().min(1).max(80),
  email: z.string().email().optional().or(z.literal("")).transform((v) => v || undefined),
  whatsapp: z.string().max(40).optional().or(z.literal("")).transform((v) => v || undefined),
  amount: z.number().nonnegative().optional(),
});

const createTicketSchema = z.object({
  title: z.string().min(1).max(120),
  totalAmount: z.number().positive(),
  notes: z.string().max(500).optional().or(z.literal("")).transform((v) => v || undefined),

  payer: z.object({
    name: z.string().min(1).max(80),
    email: z.string().email().optional().or(z.literal("")).transform((v) => v || undefined),
    whatsapp: z.string().max(40).optional().or(z.literal("")).transform((v) => v || undefined),
    jazzcash: z.string().max(40).optional().or(z.literal("")).transform((v) => v || undefined),
    easypaisa: z.string().max(40).optional().or(z.literal("")).transform((v) => v || undefined),
    iban: z.string().max(40).optional().or(z.literal("")).transform((v) => v || undefined),
    accountTitle: z.string().max(80).optional().or(z.literal("")).transform((v) => v || undefined),
    acceptsCash: z.boolean().default(true),
  }),

  participants: z.array(participantInputSchema).min(1),
  splitMode: z.enum(["even", "custom"]),
});

export async function createTicketAction(input: unknown) {
  const data = createTicketSchema.parse(input);

  // Compute shares
  let shares: number[];
  if (data.splitMode === "even") {
    shares = splitEvenly(Math.round(data.totalAmount), data.participants.length);
  } else {
    shares = data.participants.map((p) => Math.round(p.amount ?? 0));
  }

  const slug = newSlug();

  await db.transaction(async (tx) => {
    const [t] = await tx
      .insert(tickets)
      .values({
        slug,
        title: data.title,
        totalAmount: String(Math.round(data.totalAmount)),
        notes: data.notes ?? null,
        payerName: data.payer.name,
        payerEmail: data.payer.email ?? null,
        payerWhatsapp: data.payer.whatsapp ?? null,
        payerJazzcash: data.payer.jazzcash ?? null,
        payerEasypaisa: data.payer.easypaisa ?? null,
        payerIban: data.payer.iban ?? null,
        payerAccountTitle: data.payer.accountTitle ?? null,
        payerAcceptsCash: data.payer.acceptsCash,
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

  redirect(`/t/${slug}`);
}

async function loadTicket(slug: string) {
  const t = await db.query.tickets.findFirst({ where: eq(tickets.slug, slug) });
  if (!t) throw new Error("Ticket not found");
  return t;
}

async function loadParticipant(participantId: string) {
  const p = await db.query.participants.findFirst({ where: eq(participants.id, participantId) });
  if (!p) throw new Error("Participant not found");
  return p;
}

async function maybeCloseTicket(ticketId: string) {
  const rows = await db.query.participants.findMany({
    where: eq(participants.ticketId, ticketId),
  });
  const allDone = rows.every((r) => r.status === "confirmed" || r.status === "cash");
  if (allDone && rows.length > 0) {
    await db
      .update(tickets)
      .set({ status: "closed", closedAt: new Date() })
      .where(eq(tickets.id, ticketId));
  }
}

export async function markPaidAction(slug: string, participantId: string) {
  const p = await loadParticipant(participantId);
  if (p.status === "confirmed" || p.status === "cash") return;
  await db
    .update(participants)
    .set({ status: "self_marked", selfMarkedAt: new Date() })
    .where(eq(participants.id, participantId));
  revalidatePath(`/t/${slug}`);
}

export async function confirmPaidAction(slug: string, participantId: string) {
  const p = await loadParticipant(participantId);
  if (p.status === "confirmed" || p.status === "cash") return;
  await db
    .update(participants)
    .set({ status: "confirmed", confirmedAt: new Date() })
    .where(eq(participants.id, participantId));
  await maybeCloseTicket(p.ticketId);
  revalidatePath(`/t/${slug}`);
}

export async function markCashAction(slug: string, participantId: string) {
  const p = await loadParticipant(participantId);
  await db
    .update(participants)
    .set({ status: "cash", confirmedAt: new Date() })
    .where(eq(participants.id, participantId));
  await maybeCloseTicket(p.ticketId);
  revalidatePath(`/t/${slug}`);
}

export async function reopenParticipantAction(slug: string, participantId: string) {
  const p = await loadParticipant(participantId);
  await db
    .update(participants)
    .set({ status: "pending", confirmedAt: null, selfMarkedAt: null })
    .where(eq(participants.id, participantId));
  const t = await loadTicket(slug);
  if (t.status === "closed") {
    await db
      .update(tickets)
      .set({ status: "open", closedAt: null })
      .where(eq(tickets.id, t.id));
  }
  void p;
  revalidatePath(`/t/${slug}`);
}

export async function remindEmailAction(slug: string, participantId: string) {
  const t = await loadTicket(slug);
  const p = await loadParticipant(participantId);
  if (p.status === "confirmed" || p.status === "cash") {
    throw new Error("Already settled");
  }
  if (!p.email) throw new Error("No email on file for this participant");

  // Rate-limit: 1 email reminder per participant per hour
  const recent = await db
    .select({ sentAt: reminderLog.sentAt })
    .from(reminderLog)
    .where(eq(reminderLog.participantId, participantId))
    .orderBy(sql`${reminderLog.sentAt} desc`)
    .limit(1);
  if (recent[0] && Date.now() - new Date(recent[0].sentAt).getTime() < 60 * 60 * 1000) {
    throw new Error("Already reminded in the last hour");
  }

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  await sendReminderEmail({
    to: p.email,
    payerName: t.payerName,
    ticketTitle: t.title,
    amount: p.amountOwed,
    ticketUrl: `${appUrl}/t/${slug}`,
  });
  await db.insert(reminderLog).values({ participantId, channel: "email" });
  revalidatePath(`/t/${slug}`);
}

export async function logWhatsappReminderAction(slug: string, participantId: string) {
  await db.insert(reminderLog).values({ participantId, channel: "whatsapp" });
  void slug;
}

export async function closeTicketAction(slug: string) {
  const t = await loadTicket(slug);
  await db
    .update(tickets)
    .set({ status: "closed", closedAt: new Date() })
    .where(eq(tickets.id, t.id));
  revalidatePath(`/t/${slug}`);
}

export async function reopenTicketAction(slug: string) {
  const t = await loadTicket(slug);
  await db
    .update(tickets)
    .set({ status: "open", closedAt: null })
    .where(eq(tickets.id, t.id));
  revalidatePath(`/t/${slug}`);
}

export async function updateParticipantAmountAction(
  slug: string,
  participantId: string,
  amount: number,
) {
  const t = await loadTicket(slug);
  if (t.status !== "open") throw new Error("Ticket is closed");
  await db
    .update(participants)
    .set({ amountOwed: String(Math.round(amount)) })
    .where(eq(participants.id, participantId));
  revalidatePath(`/t/${slug}`);
}

export async function removeParticipantAction(slug: string, participantId: string) {
  const t = await loadTicket(slug);
  if (t.status !== "open") throw new Error("Ticket is closed");
  await db.delete(participants).where(eq(participants.id, participantId));
  revalidatePath(`/t/${slug}`);
}

export async function addParticipantAction(
  slug: string,
  name: string,
  amount: number,
  email?: string,
  whatsapp?: string,
) {
  const t = await loadTicket(slug);
  if (t.status !== "open") throw new Error("Ticket is closed");
  await db.insert(participants).values({
    ticketId: t.id,
    name,
    email: email || null,
    whatsapp: whatsapp || null,
    amountOwed: String(Math.round(amount)),
  });
  revalidatePath(`/t/${slug}`);
}
