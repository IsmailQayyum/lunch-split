import "server-only";
import type { Ticket, ParticipantStatus } from "./types";
import { redis, CAS_LUA, casBackoff, CAS_MAX_ATTEMPTS } from "./redis";

export type IndexParticipant = { name: string; status: ParticipantStatus; amountOwed: number };

export type IndexEntry = {
  slug: string;
  title: string;
  totalAmount: number;
  currency: string;
  payerName: string;
  status: "open" | "closed";
  createdAt: string;
  closedAt: string | null;
  participantCount: number;
  settledCount: number;
  participants: IndexParticipant[];
};

function normalizeEntry(e: Partial<IndexEntry> & { slug: string }): IndexEntry {
  return {
    slug: e.slug,
    title: e.title ?? "",
    totalAmount: e.totalAmount ?? 0,
    currency: e.currency ?? "PKR",
    payerName: e.payerName ?? "",
    status: e.status ?? "open",
    createdAt: e.createdAt ?? new Date().toISOString(),
    closedAt: e.closedAt ?? null,
    participantCount: e.participantCount ?? 0,
    settledCount: e.settledCount ?? 0,
    participants: Array.isArray(e.participants) ? e.participants : [],
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
    status: t.status,
    createdAt: t.createdAt,
    closedAt: t.closedAt,
    participantCount: t.participants.length,
    settledCount: t.participants.filter(
      (p) => p.status === "confirmed" || p.status === "cash",
    ).length,
    participants: t.participants.map((p) => ({
      name: p.name,
      status: p.status,
      amountOwed: p.amountOwed,
    })),
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

// The blob-era rebuild fallback (scan all ticket blobs to reconstruct the
// index) is no longer needed — Redis preserves the index reliably. Keep
// the function name so callers (e.g., the home page) don't break.
export async function readIndexOrRebuild(): Promise<IndexEntry[]> {
  return readIndex();
}
