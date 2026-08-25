"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { customAlphabet } from "nanoid";
import { z } from "zod";

import { newSlug } from "@/lib/slug";
import { splitEvenly } from "@/lib/shares";
import { sendReminderEmail } from "@/lib/email";
import { notifySlack, ticketUrl } from "@/lib/slack-notify";
import { getTicket, putTicket, updateTicket, deleteTicket } from "@/lib/store";
import { getGroup } from "@/lib/store-groups";
import { isSettled, type Participant, type Ticket, type ParticipantStatus } from "@/lib/types";
import { requireViewer, getViewer, isPayer as viewerIsPayer, isSelf } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";

async function requireViewerOrAdmin() {
  const admin = await isAdmin();
  const viewer = admin ? await getViewer() : await requireViewer();
  return { viewer, admin };
}

async function requirePayer(slug: string) {
  const { viewer, admin } = await requireViewerOrAdmin();
  const t = await getTicket(slug);
  if (!t) throw new Error("Ticket not found");
  if (!admin && !viewerIsPayer(viewer, t.payer.email)) throw new Error("not_authorized");
  return { viewer, ticket: t, admin };
}

async function requirePayerOrSelfForParticipant(slug: string, participantId: string) {
  const { viewer, admin } = await requireViewerOrAdmin();
  const t = await getTicket(slug);
  if (!t) throw new Error("Ticket not found");
  const p = t.participants.find((x) => x.id === participantId);
  if (!p) throw new Error("Participant not found");
  if (admin) return { viewer, ticket: t, participant: p, admin };
  if (viewerIsPayer(viewer, t.payer.email)) return { viewer, ticket: t, participant: p, admin };
  if (isSelf(viewer, p.email)) return { viewer, ticket: t, participant: p, admin };
  throw new Error("not_authorized");
}

async function requireSelfForParticipant(slug: string, participantId: string) {
  const { viewer, admin } = await requireViewerOrAdmin();
  const t = await getTicket(slug);
  if (!t) throw new Error("Ticket not found");
  const p = t.participants.find((x) => x.id === participantId);
  if (!p) throw new Error("Participant not found");
  if (!admin && !isSelf(viewer, p.email)) throw new Error("not_authorized");
  return { viewer, ticket: t, participant: p, admin };
}

function settledOf(t: Ticket): number {
  return t.participants.filter((p) => isSettled(p.status)).length;
}

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
  groupId: z.string().min(1),
});

export async function createTicketAction(input: unknown) {
  const data = createTicketSchema.parse(input);
  const { viewer, admin } = await requireViewerOrAdmin();
  if (viewer) {
    // Pin payer.email to the viewer (defense against client tampering).
    data.payer.email = viewer.email;
  } else if (!data.payer.email) {
    // Admin without a session must supply a payer email in the form.
    throw new Error("payer_email_required");
  }

  const group = await getGroup(data.groupId);
  if (!group) throw new Error("group_not_found");
  const payerEmail = (data.payer.email ?? "").toLowerCase();
  if (!admin && !group.memberEmails.includes(payerEmail)) {
    throw new Error("not_group_member");
  }

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
    participants: data.participants.map((p, i) => {
      const isPayer =
        !!data.payer.email && (p.email ?? "").toLowerCase() === data.payer.email.toLowerCase();
      return {
        id: newParticipantId(),
        name: p.name,
        email: p.email ?? null,
        whatsapp: p.whatsapp ?? null,
        amountOwed: shares[i],
        status: (isPayer ? "confirmed" : "pending") as ParticipantStatus,
        selfMarkedAt: null,
        confirmedAt: isPayer ? now : null,
      };
    }),
    reminders: [],
    status: "open",
    createdAt: now,
    closedAt: null,
    groupId: group.id,
  };

  await putTicket(ticket);
  await notifySlack(
    `🍱 *${ticket.title}* — new lunch ticket\n₨ ${ticket.totalAmount.toLocaleString("en-PK")} · paid by ${ticket.payer.name} · ${ticket.participants.length} to settle\n${ticketUrl(slug)}`,
    { groupId: ticket.groupId },
  );
  redirect(`/t/${slug}?created=1`);
}

function findParticipant(t: Ticket, id: string): Participant {
  const p = t.participants.find((x) => x.id === id);
  if (!p) throw new Error("Participant not found");
  return p;
}

function autoCloseIfDone(t: Ticket): Ticket {
  if (t.participants.length === 0) return t;
  const allDone = t.participants.every((p) => isSettled(p.status));
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
): Promise<{ before: Ticket; after: Ticket; participant: Participant }> {
  let before!: Ticket;
  const after = await updateTicket(slug, (t) => {
    before = t;
    const updated = {
      ...t,
      participants: t.participants.map((p) => (p.id === participantId ? fn(p) : p)),
    };
    return autoClose ? autoCloseIfDone(updated) : updated;
  });
  revalidatePath(`/t/${slug}`);
  const participant = after.participants.find((x) => x.id === participantId)!;
  return { before, after, participant };
}

async function notifyAutoCloseIfFlipped(before: Ticket, after: Ticket) {
  if (before.status === "open" && after.status === "closed") {
    await notifySlack(
      `🎉 *${after.title}* — everyone settled\n₨ ${after.totalAmount.toLocaleString("en-PK")} collected · ${after.participants.length}/${after.participants.length} done\n${ticketUrl(after.slug)}`,
      { groupId: after.groupId },
    );
  }
}

export async function markPaidAction(slug: string, participantId: string) {
  await requireSelfForParticipant(slug, participantId);
  const { before, after, participant } = await mutateParticipant(
    slug,
    participantId,
    (p) => {
      if (isSettled(p.status)) return p;
      return { ...p, status: "self_marked", selfMarkedAt: new Date().toISOString() };
    },
    false,
  );
  const beforeP = before.participants.find((x) => x.id === participantId);
  if (beforeP && beforeP.status !== participant.status) {
    await notifySlack(
      `🟡 *${participant.name}* marked paid on *${after.title}*\n₨ ${participant.amountOwed.toLocaleString("en-PK")} · awaiting ${after.payer.name}'s confirmation`,
      { groupId: after.groupId },
    );
  }
}

export async function confirmPaidAction(slug: string, participantId: string) {
  await requirePayer(slug);
  const { before, after, participant } = await mutateParticipant(slug, participantId, (p) => {
    if (isSettled(p.status)) return p;
    return { ...p, status: "confirmed", confirmedAt: new Date().toISOString() };
  });
  const beforeP = before.participants.find((x) => x.id === participantId);
  if (beforeP && beforeP.status !== participant.status) {
    await notifySlack(
      `✅ *${participant.name}* settled on *${after.title}*\n₨ ${participant.amountOwed.toLocaleString("en-PK")} · ${settledOf(after)}/${after.participants.length} done`,
      { groupId: after.groupId },
    );
  }
  await notifyAutoCloseIfFlipped(before, after);
}

export async function markCashAction(slug: string, participantId: string) {
  await requirePayer(slug);
  const { before, after, participant } = await mutateParticipant(slug, participantId, (p) => ({
    ...p,
    status: "cash",
    confirmedAt: new Date().toISOString(),
  }));
  const beforeP = before.participants.find((x) => x.id === participantId);
  if (beforeP && beforeP.status !== "cash") {
    await notifySlack(
      `💵 *${participant.name}* paid cash on *${after.title}*\n₨ ${participant.amountOwed.toLocaleString("en-PK")} · ${settledOf(after)}/${after.participants.length} done`,
      { groupId: after.groupId },
    );
  }
  await notifyAutoCloseIfFlipped(before, after);
}

export async function reopenParticipantAction(slug: string, participantId: string) {
  await requirePayerOrSelfForParticipant(slug, participantId);
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
  await requirePayer(slug);
  const t = await getTicket(slug);
  if (!t) throw new Error("Ticket not found");
  const p = findParticipant(t, participantId);
  if (isSettled(p.status)) throw new Error("Already settled");
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
  await requirePayer(slug);
  await updateTicket(slug, (cur) => ({
    ...cur,
    reminders: [
      ...cur.reminders,
      { participantId, sentAt: new Date().toISOString(), channel: "whatsapp" as const },
    ],
  }));
}

export async function closeTicketAction(slug: string) {
  await requirePayer(slug);
  let wasOpen = false;
  const after = await updateTicket(slug, (t) => {
    wasOpen = t.status === "open";
    return { ...t, status: "closed", closedAt: new Date().toISOString() };
  });
  revalidatePath(`/t/${slug}`);
  if (wasOpen) {
    await notifySlack(
      `🔒 *${after.title}* closed by *${after.payer.name}*\n${settledOf(after)}/${after.participants.length} settled at close\n${ticketUrl(after.slug)}`,
      { groupId: after.groupId },
    );
  }
}

export async function deleteTicketAction(slug: string) {
  await requirePayer(slug);
  await deleteTicket(slug);
  revalidatePath("/");
  redirect("/");
}

export async function bulkDeleteTicketsAction(
  slugs: string[],
): Promise<{ deleted: number; skipped: number }> {
  const { viewer, admin } = await requireViewerOrAdmin();
  if (!Array.isArray(slugs) || slugs.length === 0) return { deleted: 0, skipped: 0 };
  const targets = Array.from(new Set(slugs)).slice(0, 200);
  let deleted = 0;
  let skipped = 0;
  for (const slug of targets) {
    try {
      const t = await getTicket(slug);
      if (!t) {
        skipped++;
        continue;
      }
      if (!admin && !viewerIsPayer(viewer, t.payer.email)) {
        skipped++;
        continue;
      }
      await deleteTicket(slug);
      deleted++;
    } catch (e) {
      console.error(`bulk delete failed for ${slug}:`, e);
      skipped++;
    }
  }
  revalidatePath("/");
  return { deleted, skipped };
}

export async function bulkConfirmSharesAction(
  items: { slug: string; email: string }[],
): Promise<{ confirmed: number; skipped: number }> {
  const { viewer, admin } = await requireViewerOrAdmin();
  if (!Array.isArray(items) || items.length === 0) return { confirmed: 0, skipped: 0 };

  // Dedupe (slug, email) pairs, cap 200, then group by slug so each ticket
  // is a single CAS pass regardless of how many shares it settles.
  const bySlug = new Map<string, Set<string>>();
  let pairs = 0;
  for (const item of items) {
    const slug = typeof item?.slug === "string" ? item.slug : "";
    const email = typeof item?.email === "string" ? item.email.toLowerCase() : "";
    if (!slug || !email) continue;
    const emails = bySlug.get(slug) ?? new Set<string>();
    if (!emails.has(email)) {
      if (pairs >= 200) break;
      emails.add(email);
      pairs++;
    }
    bySlug.set(slug, emails);
  }

  let confirmed = 0;
  let skipped = 0;
  type GroupSummary = {
    payerName: string;
    personNames: Set<string>;
    total: number;
    count: number;
    slugs: Set<string>;
    closedTitles: string[];
  };
  const byGroup = new Map<string | null, GroupSummary>();

  for (const [slug, emails] of bySlug) {
    try {
      const t = await getTicket(slug);
      if (!t || (!admin && !viewerIsPayer(viewer, t.payer.email))) {
        skipped += emails.size;
        continue;
      }
      let before!: Ticket;
      const now = new Date().toISOString();
      const after = await updateTicket(slug, (cur) => {
        before = cur;
        const updated = {
          ...cur,
          participants: cur.participants.map((p) =>
            p.email && emails.has(p.email.toLowerCase()) && !isSettled(p.status)
              ? { ...p, status: "confirmed" as const, confirmedAt: now }
              : p,
          ),
        };
        return autoCloseIfDone(updated);
      });
      revalidatePath(`/t/${slug}`);

      const flipped = after.participants.filter((p, i) => p.status !== before.participants[i]?.status);
      const flippedEmails = new Set(flipped.map((p) => (p.email ?? "").toLowerCase()));
      confirmed += flipped.length;
      // Requested emails that matched nothing unsettled on this ticket.
      skipped += Array.from(emails).filter((e) => !flippedEmails.has(e)).length;
      if (flipped.length === 0) continue;

      const summary = byGroup.get(after.groupId) ?? {
        payerName: after.payer.name,
        personNames: new Set<string>(),
        total: 0,
        count: 0,
        slugs: new Set<string>(),
        closedTitles: [],
      };
      for (const p of flipped) {
        summary.personNames.add(p.name);
        summary.total += p.amountOwed;
        summary.count++;
      }
      summary.slugs.add(slug);
      if (before.status === "open" && after.status === "closed") summary.closedTitles.push(after.title);
      byGroup.set(after.groupId, summary);
    } catch (e) {
      console.error(`bulk confirm failed for ${slug}:`, e);
      skipped += emails.size;
    }
  }

  // One aggregated message per group instead of one per ticket.
  for (const [groupId, s] of byGroup) {
    const names = Array.from(s.personNames).join(", ");
    const tickets = s.slugs.size;
    let text = `✅ *${s.payerName}* confirmed ${s.count} payment${s.count === 1 ? "" : "s"} from *${names}* — ₨ ${s.total.toLocaleString("en-PK")} across ${tickets} ticket${tickets === 1 ? "" : "s"}`;
    if (s.closedTitles.length > 0) {
      text += `\n🎉 fully settled: ${s.closedTitles.join(", ")}`;
    }
    await notifySlack(text, { groupId });
  }

  revalidatePath("/");
  revalidatePath("/balances");
  return { confirmed, skipped };
}

export async function bulkMarkPaidAction(
  slugs: string[],
): Promise<{ marked: number; skipped: number }> {
  const { viewer } = await requireViewerOrAdmin();
  if (!viewer) throw new Error("admin_no_self");
  if (!Array.isArray(slugs) || slugs.length === 0) return { marked: 0, skipped: 0 };
  const targets = Array.from(new Set(slugs.filter((s) => typeof s === "string" && s))).slice(0, 200);

  let marked = 0;
  let skipped = 0;
  type GroupSummary = { personName: string; payerNames: Set<string>; total: number; count: number };
  const byGroup = new Map<string | null, GroupSummary>();

  for (const slug of targets) {
    try {
      const t = await getTicket(slug);
      if (!t) {
        skipped++;
        continue;
      }
      let before!: Ticket;
      const now = new Date().toISOString();
      // Only the viewer's own pending shares; self_marked stays untouched and
      // there is no autoClose, matching markPaidAction.
      const after = await updateTicket(slug, (cur) => {
        before = cur;
        return {
          ...cur,
          participants: cur.participants.map((p) =>
            (p.email ?? "").toLowerCase() === viewer.email && p.status === "pending"
              ? { ...p, status: "self_marked" as const, selfMarkedAt: now }
              : p,
          ),
        };
      });
      revalidatePath(`/t/${slug}`);

      const flipped = after.participants.filter((p, i) => p.status !== before.participants[i]?.status);
      if (flipped.length === 0) {
        skipped++;
        continue;
      }
      marked += flipped.length;
      const summary = byGroup.get(after.groupId) ?? {
        personName: flipped[0].name,
        payerNames: new Set<string>(),
        total: 0,
        count: 0,
      };
      summary.payerNames.add(after.payer.name);
      summary.total += flipped.reduce((a, p) => a + p.amountOwed, 0);
      summary.count += flipped.length;
      byGroup.set(after.groupId, summary);
    } catch (e) {
      console.error(`bulk mark paid failed for ${slug}:`, e);
      skipped++;
    }
  }

  for (const [groupId, s] of byGroup) {
    await notifySlack(
      `🟡 *${s.personName}* marked ${s.count} payment${s.count === 1 ? "" : "s"} paid — ₨ ${s.total.toLocaleString("en-PK")} · awaiting ${Array.from(s.payerNames).join(", ")}'s confirmation`,
      { groupId },
    );
  }

  revalidatePath("/");
  revalidatePath("/balances");
  return { marked, skipped };
}

export async function reopenTicketAction(slug: string) {
  await requirePayer(slug);
  let wasClosed = false;
  const after = await updateTicket(slug, (t) => {
    wasClosed = t.status === "closed";
    return { ...t, status: "open", closedAt: null };
  });
  revalidatePath(`/t/${slug}`);
  if (wasClosed) {
    await notifySlack(
      `🔓 *${after.title}* reopened by *${after.payer.name}*\n${ticketUrl(after.slug)}`,
      { groupId: after.groupId },
    );
  }
}

const setGroupSchema = z.object({
  groupId: z.string().min(1).nullable(),
});

export async function setTicketGroupAction(slug: string, input: unknown) {
  const { viewer, admin } = await requirePayer(slug);
  const { groupId } = setGroupSchema.parse(input);
  if (groupId) {
    const group = await getGroup(groupId);
    if (!group) throw new Error("group_not_found");
    if (!admin && (!viewer || !group.memberEmails.includes(viewer.email))) {
      throw new Error("not_group_member");
    }
  } else if (!admin) {
    throw new Error("only_admin_can_unassign");
  }
  await updateTicket(slug, (t) => ({ ...t, groupId }));
  revalidatePath(`/t/${slug}`);
  revalidatePath("/groups");
  if (groupId) revalidatePath(`/groups/${groupId}`);
}

export async function updateParticipantAmountAction(
  slug: string,
  participantId: string,
  amount: number,
) {
  await requirePayer(slug);
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
  await requirePayerOrSelfForParticipant(slug, participantId);
  await updateTicket(slug, (t) => {
    if (t.status !== "open") throw new Error("Ticket is closed");
    return { ...t, participants: t.participants.filter((p) => p.id !== participantId) };
  });
  revalidatePath(`/t/${slug}`);
}

const addByPayerSchema = z.object({
  name: z.string().min(1).max(80),
  email: z.string().email().optional().or(z.literal("")).transform((v) => v || undefined),
  whatsapp: opt,
  amount: z.number().nonnegative(),
});

export async function addParticipantByPayerAction(slug: string, input: unknown) {
  await requirePayer(slug);
  const data = addByPayerSchema.parse(input);
  const normalizedEmail = data.email?.toLowerCase();
  await updateTicket(slug, (t) => {
    if (t.status !== "open") throw new Error("Ticket is closed");
    if (
      normalizedEmail &&
      t.participants.some((p) => (p.email ?? "").toLowerCase() === normalizedEmail)
    ) {
      throw new Error("email_already_on_ticket");
    }
    return {
      ...t,
      participants: [
        ...t.participants,
        {
          id: newParticipantId(),
          name: data.name.trim(),
          email: normalizedEmail ?? null,
          whatsapp: data.whatsapp ?? null,
          amountOwed: Math.round(data.amount),
          status: "pending",
          selfMarkedAt: null,
          confirmedAt: null,
        },
      ],
    };
  });
  revalidatePath(`/t/${slug}`);
}

export async function addParticipantAction(slug: string, amount: number) {
  const { viewer } = await requireViewerOrAdmin();
  if (!viewer) throw new Error("admin_no_self");
  await updateTicket(slug, (t) => {
    if (t.status !== "open") throw new Error("Ticket is closed");
    if (t.participants.some((p) => (p.email ?? "").toLowerCase() === viewer.email)) {
      throw new Error("email_already_on_ticket");
    }
    const person = viewer.person;
    return {
      ...t,
      participants: [
        ...t.participants,
        {
          id: newParticipantId(),
          name: person?.name ?? viewer.email.split("@")[0],
          email: viewer.email,
          whatsapp: person?.whatsapp ?? null,
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
