import "server-only";
import type { Ticket, ParticipantStatus } from "./types";
import { redis, CAS_LUA, casBackoff, CAS_MAX_ATTEMPTS } from "./redis";

export type IndexParticipant = {
  name: string;
  email: string | null;
  status: ParticipantStatus;
  amountOwed: number;
};

export type IndexEntry = {
  slug: string;
  title: string;
  totalAmount: number;
  currency: string;
  payerName: string;
  payerEmail: string | null;
  status: "open" | "closed";
  createdAt: string;
  closedAt: string | null;
  participantCount: number;
  settledCount: number;
  participants: IndexParticipant[];
  groupId: string | null;
};

function normalizeParticipant(p: Partial<IndexParticipant>): IndexParticipant {
  return {
    name: p.name ?? "",
    email: typeof p.email === "string" ? p.email.toLowerCase() : null,
    status: p.status ?? "pending",
    amountOwed: p.amountOwed ?? 0,
  };
}

function normalizeEntry(e: Partial<IndexEntry> & { slug: string }): IndexEntry {
  return {
    slug: e.slug,
    title: e.title ?? "",
    totalAmount: e.totalAmount ?? 0,
    currency: e.currency ?? "PKR",
    payerName: e.payerName ?? "",
    payerEmail: typeof e.payerEmail === "string" ? e.payerEmail.toLowerCase() : null,
    status: e.status ?? "open",
    createdAt: e.createdAt ?? new Date().toISOString(),
    closedAt: e.closedAt ?? null,
    participantCount: e.participantCount ?? 0,
    settledCount: e.settledCount ?? 0,
    participants: Array.isArray(e.participants)
      ? e.participants.map((p) => normalizeParticipant(p as Partial<IndexParticipant>))
      : [],
    groupId: typeof e.groupId === "string" ? e.groupId : null,
  };
}

const KEY = "tickets:index";

export function toIndexEntry(t: Ticket): IndexEntry {
  return {
    slug: t.slug,
    title: t.title,
    totalAmount: t.totalAmount,
    currency: t.currency,
    payerName: t.payer.name,
    payerEmail: t.payer.email ? t.payer.email.toLowerCase() : null,
    status: t.status,
    createdAt: t.createdAt,
    closedAt: t.closedAt,
    participantCount: t.participants.length,
    settledCount: t.participants.filter(
      (p) => p.status === "confirmed" || p.status === "cash",
    ).length,
    participants: t.participants.map((p) => ({
      name: p.name,
      email: p.email ? p.email.toLowerCase() : null,
      status: p.status,
      amountOwed: p.amountOwed,
    })),
    groupId: t.groupId ?? null,
  };
}

export async function readIndex(): Promise<IndexEntry[]> {
  const raw = await redis.get<string>(KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((e: { slug?: unknown }) => typeof e?.slug === "string")
      .map((e) => normalizeEntry(e as Partial<IndexEntry> & { slug: string }));
  } catch {
    return [];
  }
}

export async function upsertIndexEntry(entry: IndexEntry): Promise<void> {
  for (let attempt = 0; attempt < CAS_MAX_ATTEMPTS; attempt++) {
    const currentRaw = (await redis.get<string>(KEY)) ?? "";
    let currentArr: IndexEntry[];
    try {
      currentArr = currentRaw ? JSON.parse(currentRaw) : [];
      if (!Array.isArray(currentArr)) currentArr = [];
    } catch {
      currentArr = [];
    }

    const idx = currentArr.findIndex((e) => e.slug === entry.slug);
    if (idx === -1) currentArr.unshift(entry);
    else currentArr[idx] = entry;

    const nextStr = JSON.stringify(currentArr);

    if (currentRaw === "") {
      // First-ever write — use NX semantics so we don't trample a concurrent
      // initial-create. set() returns null when nx fails.
      const ok = await redis.set(KEY, nextStr, { nx: true });
      if (ok !== null) return;
    } else {
      const result = (await redis.eval(CAS_LUA, [KEY], [currentRaw, nextStr])) as string;
      if (result === nextStr) return;
    }

    await casBackoff();
  }
  throw new Error("upsertIndexEntry failed after retries");
}

export async function removeIndexEntry(slug: string): Promise<void> {
  for (let attempt = 0; attempt < CAS_MAX_ATTEMPTS; attempt++) {
    const currentRaw = (await redis.get<string>(KEY)) ?? "";
    if (!currentRaw) return;
    let currentArr: IndexEntry[];
    try {
      currentArr = JSON.parse(currentRaw);
      if (!Array.isArray(currentArr)) return;
    } catch {
      return;
    }
    const filtered = currentArr.filter((e) => e.slug !== slug);
    if (filtered.length === currentArr.length) return; // wasn't in the index
    const nextStr = JSON.stringify(filtered);
    const result = (await redis.eval(CAS_LUA, [KEY], [currentRaw, nextStr])) as string;
    if (result === nextStr) return;
    await casBackoff();
  }
  throw new Error("removeIndexEntry failed after retries");
}

// Bump when IndexEntry/IndexParticipant gains a field that older entries
// won't carry — ensureIndexFresh() will scan ticket:* and rewrite the
// index once, then short-circuit on subsequent reads.
const INDEX_VERSION = 3;
const VERSION_KEY = "tickets:index:version";
const TICKET_KEY_PREFIX = "ticket:";

async function rebuildIndexFromTickets(): Promise<void> {
  const entries: IndexEntry[] = [];
  let cursor: string | number = 0;
  do {
    const [next, keys] = (await redis.scan(cursor, {
      match: `${TICKET_KEY_PREFIX}*`,
      count: 200,
    })) as [string, string[]];
    cursor = next;
    for (const key of keys) {
      if (!key.startsWith(TICKET_KEY_PREFIX)) continue;
      const raw = await redis.get<string>(key);
      if (!raw) continue;
      try {
        const ticket = JSON.parse(raw) as Ticket;
        if (!ticket?.slug) continue;
        entries.push(toIndexEntry({ ...ticket, groupId: ticket.groupId ?? null }));
      } catch {
        // skip corrupted blob
      }
    }
  } while (String(cursor) !== "0");

  entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  await redis.set(KEY, JSON.stringify(entries));
}

async function ensureIndexFresh(): Promise<void> {
  const stored = await redis.get<string>(VERSION_KEY);
  const current = stored ? Number(stored) : 0;
  if (current === INDEX_VERSION) return;
  await rebuildIndexFromTickets();
  await redis.set(VERSION_KEY, String(INDEX_VERSION));
}

export async function readIndexOrRebuild(): Promise<IndexEntry[]> {
  try {
    await ensureIndexFresh();
  } catch (e) {
    console.error("Tickets index rebuild failed:", e);
  }
  return readIndex();
}
