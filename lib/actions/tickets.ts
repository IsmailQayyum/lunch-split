"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { participants, reminderLog, tickets, users } from "@/lib/db/schema";
import { newSlug } from "@/lib/slug";
import { splitEvenly } from "@/lib/shares";
import { sendReminderEmail } from "@/lib/email";

const participantInputSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  amount: z.number().nonnegative().optional(),
});

const createTicketSchema = z.object({
  title: z.string().min(1).max(120),
  totalAmount: z.number().positive(),
  notes: z.string().max(500).optional().nullable(),
  participants: z.array(participantInputSchema).min(1),
  splitMode: z.enum(["even", "custom"]),
});

const ALLOWED = process.env.ALLOWED_EMAIL_DOMAIN ?? "puresquare.com";

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  return session.user;
}

async function getOrCreateUserByEmail(email: string, name?: string) {
  const lower = email.toLowerCase();
  if (!lower.endsWith(`@${ALLOWED}`)) {
    throw new Error(`All participants must use @${ALLOWED} emails`);
  }
  const existing = await db.query.users.findFirst({ where: eq(users.email, lower) });
  if (existing) return existing;
  const [created] = await db
    .insert(users)
    .values({ email: lower, name: name ?? null })
    .returning();
  return created;
}

export async function createTicketAction(input: unknown) {
  const me = await requireUser();
  const data = createTicketSchema.parse(input);

  // Resolve or stub-create all participants. Filter out the payer if listed.
  const others = data.participants.filter(
    (p) => p.email.toLowerCase() !== me.email?.toLowerCase(),
  );
  if (others.length === 0) {
    throw new Error("Add at least one other person besides yourself");
  }

  const resolved = await Promise.all(
    others.map(async (p) => ({ ...p, user: await getOrCreateUserByEmail(p.email, p.name) })),
  );

  // Compute shares
  let shares: number[];
  if (data.splitMode === "even") {
    shares = splitEvenly(Math.round(data.totalAmount), resolved.length);
  } else {
    shares = resolved.map((p) => Math.round(p.amount ?? 0));
    const sum = shares.reduce((a, b) => a + b, 0);
    if (sum > Math.round(data.totalAmount)) {
      throw new Error("Sum of shares exceeds total");
    }
  }

  const slug = newSlug();

  await db.transaction(async (tx) => {
    const [t] = await tx
      .insert(tickets)
      .values({
        slug,
        payerId: me.id,
        title: data.title,
        totalAmount: String(Math.round(data.totalAmount)),
        notes: data.notes ?? null,
      })
      .returning();
    await tx.insert(participants).values(
      resolved.map((p, i) => ({
        ticketId: t.id,
        userId: p.user.id,
        pendingEmail: p.user.email,
        guestName: p.user.name ?? p.email.split("@")[0],
        amountOwed: String(shares[i]),
      })),
    );
  });

  revalidatePath("/dashboard");
  redirect(`/t/${slug}`);
}

async function loadTicketBySlug(slug: string) {
  const t = await db.query.tickets.findFirst({ where: eq(tickets.slug, slug) });
  if (!t) throw new Error("Ticket not found");
  const rows = await db.query.participants.findMany({
    where: eq(participants.ticketId, t.id),
  });
  const payer = await db.query.users.findFirst({ where: eq(users.id, t.payerId) });
  return { ticket: t, participants: rows, payer };
}

async function assertParticipantAccess(slug: string, participantId: string) {
  const me = await requireUser();
  const { ticket, participants: rows, payer } = await loadTicketBySlug(slug);
  const p = rows.find((r) => r.id === participantId);
  if (!p) throw new Error("Participant not found");
  const isPayer = ticket.payerId === me.id;
  const isSelf = p.userId === me.id;
  return { me, ticket, participant: p, isPayer, isSelf, allParticipants: rows, payer };
}

async function maybeCloseTicket(ticketId: string) {
  const rows = await db.query.participants.findMany({
    where: eq(participants.ticketId, ticketId),
  });
  const allDone = rows.every((r) => r.status === "confirmed" || r.status === "cash");
  if (allDone) {
    await db
      .update(tickets)
      .set({ status: "closed", closedAt: new Date() })
      .where(eq(tickets.id, ticketId));
  }
}

export async function markPaidAction(slug: string, participantId: string) {
  const { isSelf, participant, ticket } = await assertParticipantAccess(slug, participantId);
  if (!isSelf) throw new Error("Only the participant can mark themselves paid");
  if (participant.status === "confirmed" || participant.status === "cash") return;
  await db
    .update(participants)
    .set({ status: "self_marked", selfMarkedAt: new Date() })
    .where(eq(participants.id, participantId));
  revalidatePath(`/t/${slug}`);
  // Don't auto-close; payer must confirm.
  void ticket;
}

export async function confirmPaidAction(slug: string, participantId: string) {
  const { isPayer, participant, ticket } = await assertParticipantAccess(slug, participantId);
  if (!isPayer) throw new Error("Only the payer can confirm");
  if (participant.status === "confirmed" || participant.status === "cash") return;
  await db
    .update(participants)
    .set({ status: "confirmed", confirmedAt: new Date() })
    .where(eq(participants.id, participantId));
  await maybeCloseTicket(ticket.id);
  revalidatePath(`/t/${slug}`);
}

export async function markCashAction(slug: string, participantId: string) {
  const { isPayer, ticket } = await assertParticipantAccess(slug, participantId);
  if (!isPayer) throw new Error("Only the payer can mark cash");
  await db
    .update(participants)
    .set({ status: "cash", confirmedAt: new Date() })
    .where(eq(participants.id, participantId));
  await maybeCloseTicket(ticket.id);
  revalidatePath(`/t/${slug}`);
}

export async function reopenParticipantAction(slug: string, participantId: string) {
  const { isPayer, ticket } = await assertParticipantAccess(slug, participantId);
  if (!isPayer) throw new Error("Only the payer can reopen");
  await db
    .update(participants)
    .set({ status: "pending", confirmedAt: null, selfMarkedAt: null })
    .where(eq(participants.id, participantId));
  // If ticket was closed, reopen it
  if (ticket.status === "closed") {
    await db
      .update(tickets)
      .set({ status: "open", closedAt: null })
      .where(eq(tickets.id, ticket.id));
  }
  revalidatePath(`/t/${slug}`);
}

export async function remindAction(slug: string, participantId: string) {
  const { isPayer, participant, payer, ticket } = await assertParticipantAccess(slug, participantId);
  if (!isPayer) throw new Error("Only the payer can send reminders");
  if (participant.status === "confirmed" || participant.status === "cash") {
    throw new Error("Already settled");
  }

  // Rate-limit: 1 reminder per participant per hour
  const recent = await db
    .select({ sentAt: reminderLog.sentAt })
    .from(reminderLog)
    .where(eq(reminderLog.participantId, participantId))
    .orderBy(sql`${reminderLog.sentAt} desc`)
    .limit(1);
  if (recent[0] && Date.now() - new Date(recent[0].sentAt).getTime() < 60 * 60 * 1000) {
    throw new Error("Already reminded in the last hour");
  }

  const to = participant.pendingEmail ?? "";
  if (!to) throw new Error("No email on file for this participant");

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  await sendReminderEmail({
    to,
    payerName: payer?.name ?? "Your colleague",
    ticketTitle: ticket.title,
    amount: participant.amountOwed,
    ticketUrl: `${appUrl}/t/${slug}`,
  });
  await db.insert(reminderLog).values({ participantId });
  revalidatePath(`/t/${slug}`);
}

export async function closeTicketAction(slug: string) {
  const me = await requireUser();
  const t = await db.query.tickets.findFirst({ where: eq(tickets.slug, slug) });
  if (!t) throw new Error("Ticket not found");
  if (t.payerId !== me.id) throw new Error("Only the payer can close");
  await db
    .update(tickets)
    .set({ status: "closed", closedAt: new Date() })
    .where(eq(tickets.id, t.id));
  revalidatePath("/dashboard");
  revalidatePath(`/t/${slug}`);
}

export async function reopenTicketAction(slug: string) {
  const me = await requireUser();
  const t = await db.query.tickets.findFirst({ where: eq(tickets.slug, slug) });
  if (!t) throw new Error("Ticket not found");
  if (t.payerId !== me.id) throw new Error("Only the payer can reopen");
  await db
    .update(tickets)
    .set({ status: "open", closedAt: null })
    .where(eq(tickets.id, t.id));
  revalidatePath(`/t/${slug}`);
}

export async function setReceiptUrlAction(slug: string, url: string) {
  const me = await requireUser();
  const t = await db.query.tickets.findFirst({ where: eq(tickets.slug, slug) });
  if (!t) throw new Error("Ticket not found");
  if (t.payerId !== me.id) throw new Error("Only the payer can attach a receipt");
  await db.update(tickets).set({ receiptUrl: url }).where(eq(tickets.id, t.id));
  revalidatePath(`/t/${slug}`);
}

export async function updateParticipantAmountAction(
  slug: string,
  participantId: string,
  amount: number,
) {
  const { isPayer, ticket } = await assertParticipantAccess(slug, participantId);
  if (!isPayer) throw new Error("Only the payer can edit amounts");
  if (ticket.status !== "open") throw new Error("Ticket is closed");
  await db
    .update(participants)
    .set({ amountOwed: String(Math.round(amount)) })
    .where(eq(participants.id, participantId));
  revalidatePath(`/t/${slug}`);
}

export async function removeParticipantAction(slug: string, participantId: string) {
  const { isPayer, ticket } = await assertParticipantAccess(slug, participantId);
  if (!isPayer) throw new Error("Only the payer can remove participants");
  if (ticket.status !== "open") throw new Error("Ticket is closed");
  await db.delete(participants).where(eq(participants.id, participantId));
  revalidatePath(`/t/${slug}`);
}

export async function addParticipantAction(slug: string, email: string, amount: number) {
  const me = await requireUser();
  const t = await db.query.tickets.findFirst({ where: eq(tickets.slug, slug) });
  if (!t) throw new Error("Ticket not found");
  if (t.payerId !== me.id) throw new Error("Only the payer can add");
  if (t.status !== "open") throw new Error("Ticket is closed");
  const u = await getOrCreateUserByEmail(email);
  await db.insert(participants).values({
    ticketId: t.id,
    userId: u.id,
    pendingEmail: u.email,
    guestName: u.name ?? email.split("@")[0],
    amountOwed: String(Math.round(amount)),
  });
  revalidatePath(`/t/${slug}`);
}

export async function backfillMyPendingParticipantsAction() {
  const me = await requireUser();
  if (!me.email) return;
  await db
    .update(participants)
    .set({ userId: me.id })
    .where(and(isNull(participants.userId), eq(participants.pendingEmail, me.email.toLowerCase())));
  revalidatePath("/dashboard");
}
