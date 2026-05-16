"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { customAlphabet } from "nanoid";
import { z } from "zod";

import { newSlug } from "@/lib/slug";
import { splitEvenly } from "@/lib/shares";
import { sendReminderEmail } from "@/lib/email";
import { getTicket, putTicket, updateTicket } from "@/lib/store";
import type { Participant, Ticket, ParticipantStatus } from "@/lib/types";
import {
  notifyMarkPaid,
  notifyConfirmed,
  notifyMarkCash,
  notifyTicketClosed,
  notifyTicketReopened,
  notifyTicketCreated,
} from "@/lib/slack-notify";

const newParticipantId = customAlphabet("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 12);

const opt = z.string().optional().or(z.literal("")).transform((v) => v || undefined);

const participantInputSchema = z.object({
  name: z.string().min(1).max(80),
  email: z.string().email().optional().or(z.literal("")).transform((v) => v || undefined),
  whatsapp: opt,
  amount: z.number().nonnegative().optional(),
});

const walletAppEnum = z.enum(["jazzcash", "easypaisa", "nayapay", "sadapay"]);

const createTicketSchema = z.object({
  title: z.string().min(1).max(120),
  totalAmount: z.number().positive(),
  notes: opt,
  payer: z.object({
    name: z.string().min(1).max(80),
    email: z.string().email().optional().or(z.literal("")).transform((v) => v || undefined),
    whatsapp: opt,
    walletNumber: opt,
    walletApps: z.array(walletAppEnum).optional().default([]),
    iban: opt,
    accountTitle: opt,
    acceptsCash: z.boolean().default(true),
  }),
  participants: z.array(participantInputSchema).min(1),
  splitMode: z.enum(["even", "custom"]),
});

export async function createTicketAction(input: unknown) {
  const data = createTicketSchema.parse(input);

  let shares: number[];
  if (data.splitMode === "even") {
    shares = splitEvenly(Math.round(data.totalAmount), data.participants.length);
  } else {
    shares = data.participants.map((p) => Math.round(p.amount ?? 0));
  }

  const slug = newSlug();
  const now = new Date().toISOString();
  const ticket: Ticket = {
    slug,
    title: data.title,
    totalAmount: Math.round(data.totalAmount),
    currency: "PKR",
    notes: data.notes ?? null,
    payer: {
      name: data.payer.name,
      email: data.payer.email ?? null,
      whatsapp: data.payer.whatsapp ?? null,
      walletNumber: data.payer.walletNumber ?? null,
      walletApps: data.payer.walletNumber ? data.payer.walletApps : [],
      iban: data.payer.iban ?? null,
      accountTitle: data.payer.accountTitle ?? null,
      acceptsCash: data.payer.acceptsCash,
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
  notifyTicketCreated(ticket).catch(() => {});
  redirect(`/t/${slug}?created=1`);
}

function findParticipant(t: Ticket, id: string): Participant {
  const p = t.participants.find((x) => x.id === id);
  if (!p) throw new Error("Participant not found");
  return p;
}

function autoCloseIfDone(t: Ticket): Ticket {
  if (t.participants.length === 0) return t;
  const allDone = t.participants.every((p) => p.status === "confirmed" || p.status === "cash");
  if (allDone && t.status === "open") {
    return { ...t, status: "closed", closedAt: new Date().toISOString() };
  }
  return t;
}

async function mutateParticipant(
  slug: string,
  participantId: string,
  fn: (p: Participant) => Participant,
  autoClose = true,
) {
  await updateTicket(slug, (t) => {
    const updated = {
      ...t,
      participants: t.participants.map((p) => (p.id === participantId ? fn(p) : p)),
    };
    return autoClose ? autoCloseIfDone(updated) : updated;
  });
  revalidatePath(`/t/${slug}`);
}

export async function markPaidAction(slug: string, participantId: string) {
  await mutateParticipant(slug, participantId, (p) => {
    if (p.status === "confirmed" || p.status === "cash") return p;
    return { ...p, status: "self_marked", selfMarkedAt: new Date().toISOString() };
  }, false);
  // Fire-and-forget Slack notification
  getTicket(slug).then((t) => {
    if (!t) return;
    const p = t.participants.find((x) => x.id === participantId);
    if (p) notifyMarkPaid(t, p);
  }).catch(() => {});
}

export async function confirmPaidAction(slug: string, participantId: string) {
  await mutateParticipant(slug, participantId, (p) => {
    if (p.status === "confirmed" || p.status === "cash") return p;
    return { ...p, status: "confirmed", confirmedAt: new Date().toISOString() };
  });
  getTicket(slug).then((t) => {
    if (!t) return;
    const p = t.participants.find((x) => x.id === participantId);
    if (p) notifyConfirmed(t, p);
    if (t.status === "closed") notifyTicketClosed(t);
  }).catch(() => {});
}

export async function markCashAction(slug: string, participantId: string) {
  await mutateParticipant(slug, participantId, (p) => ({
    ...p,
    status: "cash",
    confirmedAt: new Date().toISOString(),
  }));
  getTicket(slug).then((t) => {
    if (!t) return;
    const p = t.participants.find((x) => x.id === participantId);
    if (p) notifyMarkCash(t, p);
    if (t.status === "closed") notifyTicketClosed(t);
  }).catch(() => {});
}

export async function reopenParticipantAction(slug: string, participantId: string) {
  await updateTicket(slug, (t) => {
    const updated = {
      ...t,
      participants: t.participants.map((p) =>
        p.id === participantId
          ? { ...p, status: "pending" as ParticipantStatus, selfMarkedAt: null, confirmedAt: null }
          : p,
      ),
    };
    return updated.status === "closed"
      ? { ...updated, status: "open" as const, closedAt: null }
      : updated;
  });
  revalidatePath(`/t/${slug}`);
}

export async function remindEmailAction(slug: string, participantId: string) {
  const t = await getTicket(slug);
  if (!t) throw new Error("Ticket not found");
  const p = findParticipant(t, participantId);
  if (p.status === "confirmed" || p.status === "cash") throw new Error("Already settled");
  if (!p.email) throw new Error("No email on file for this participant");

  // Rate-limit: 1 email reminder per participant per hour
  const lastEmail = t.reminders
    .filter((r) => r.participantId === participantId && r.channel === "email")
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt))[0];
  if (lastEmail && Date.now() - new Date(lastEmail.sentAt).getTime() < 60 * 60 * 1000) {
    throw new Error("Already reminded by email in the last hour");
  }

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  await sendReminderEmail({
    to: p.email,
    payerName: t.payer.name,
    ticketTitle: t.title,
    amount: String(p.amountOwed),
    ticketUrl: `${appUrl}/t/${slug}`,
  });
  await updateTicket(slug, (cur) => ({
    ...cur,
    reminders: [
      ...cur.reminders,
      { participantId, sentAt: new Date().toISOString(), channel: "email" as const },
    ],
  }));
  revalidatePath(`/t/${slug}`);
}

export async function logWhatsappReminderAction(slug: string, participantId: string) {
  await updateTicket(slug, (cur) => ({
    ...cur,
    reminders: [
      ...cur.reminders,
      { participantId, sentAt: new Date().toISOString(), channel: "whatsapp" as const },
    ],
  }));
}

export async function closeTicketAction(slug: string) {
  await updateTicket(slug, (t) => ({ ...t, status: "closed", closedAt: new Date().toISOString() }));
  revalidatePath(`/t/${slug}`);
  getTicket(slug).then((t) => {
    if (t) notifyTicketClosed(t);
  }).catch(() => {});
}

export async function reopenTicketAction(slug: string) {
  await updateTicket(slug, (t) => ({ ...t, status: "open", closedAt: null }));
  revalidatePath(`/t/${slug}`);
  getTicket(slug).then((t) => {
    if (t) notifyTicketReopened(t);
  }).catch(() => {});
}

export async function updateParticipantAmountAction(
  slug: string,
  participantId: string,
  amount: number,
) {
  await updateTicket(slug, (t) => {
    if (t.status !== "open") throw new Error("Ticket is closed");
    return {
      ...t,
      participants: t.participants.map((p) =>
        p.id === participantId ? { ...p, amountOwed: Math.round(amount) } : p,
      ),
    };
  });
  revalidatePath(`/t/${slug}`);
}

export async function removeParticipantAction(slug: string, participantId: string) {
  await updateTicket(slug, (t) => {
    if (t.status !== "open") throw new Error("Ticket is closed");
    return { ...t, participants: t.participants.filter((p) => p.id !== participantId) };
  });
  revalidatePath(`/t/${slug}`);
}

export async function addParticipantAction(
  slug: string,
  name: string,
  amount: number,
  email?: string,
  whatsapp?: string,
) {
  await updateTicket(slug, (t) => {
    if (t.status !== "open") throw new Error("Ticket is closed");
    return {
      ...t,
      participants: [
        ...t.participants,
        {
          id: newParticipantId(),
          name,
          email: email || null,
          whatsapp: whatsapp || null,
          amountOwed: Math.round(amount),
          status: "pending",
          selfMarkedAt: null,
          confirmedAt: null,
        },
      ],
    };
  });
  revalidatePath(`/t/${slug}`);
}
