import { put, list } from "@vercel/blob";
import type { Ticket, ParticipantStatus } from "./types";

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

const PATH = "tickets-index.json";

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
  try {
    const { blobs } = await list({ prefix: PATH });
    const exact = blobs.find((b) => b.pathname === PATH);
    if (!exact) return [];
    const bustUrl = `${exact.url}?t=${Date.now()}`;
    const res = await fetch(bustUrl, { cache: "no-store" });
    if (!res.ok) return [];
    const arr = await res.json();
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((e: { slug?: unknown }) => typeof e.slug === "string")
      .map((e) => normalizeEntry(e as Partial<IndexEntry> & { slug: string }));
  } catch {
    return [];
  }
}

async function writeIndex(entries: IndexEntry[]): Promise<void> {
  await put(PATH, JSON.stringify(entries), {
    access: "public",
    contentType: "application/json",
    allowOverwrite: true,
    addRandomSuffix: false,
    cacheControlMaxAge: 0,
  });
}

export async function upsertIndexEntry(entry: IndexEntry): Promise<void> {
  const current = await readIndex();
  const idx = current.findIndex((e) => e.slug === entry.slug);
  if (idx === -1) {
    current.unshift(entry);
  } else {
    current[idx] = entry;
  }
  await writeIndex(current);
}

// If the index is missing/empty (e.g., first run after this feature ships),
// rebuild it by scanning all ticket blobs. Also backfills "stale" entries
// — ones whose participantCount > 0 but participants[] is empty (created
// before the per-participant detail was added to the index).
export async function readIndexOrRebuild(): Promise<IndexEntry[]> {
  const current = await readIndex();

  // Full rebuild path when empty
  if (current.length === 0) {
    const { blobs } = await list({ prefix: "tickets/" });
    const ticketBlobs = blobs.filter((b) => b.pathname.endsWith(".json"));
    if (ticketBlobs.length === 0) return [];

    const tickets = (
      await Promise.all(
        ticketBlobs.map(async (b) => {
          try {
            const res = await fetch(`${b.url}?t=${Date.now()}`, { cache: "no-store" });
            if (!res.ok) return null;
            return (await res.json()) as Ticket;
          } catch {
            return null;
          }
        }),
      )
    ).filter((t): t is Ticket => !!t);

    const rebuilt = tickets
      .map(toIndexEntry)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    await writeIndex(rebuilt);
    return rebuilt;
  }

  // Backfill stale entries
  const stale = current.filter(
    (e) => e.participantCount > 0 && (!e.participants || e.participants.length === 0),
  );
  if (stale.length === 0) return current;

  const { blobs } = await list({ prefix: "tickets/" });
  const byPath = new Map(blobs.map((b) => [b.pathname, b]));
  let mutated = false;
  for (const e of stale) {
    const b = byPath.get(`tickets/${e.slug}.json`);
    if (!b) continue;
    try {
      const res = await fetch(`${b.url}?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) continue;
      const t = (await res.json()) as Ticket;
      const fresh = toIndexEntry(t);
      const idx = current.findIndex((x) => x.slug === e.slug);
      if (idx >= 0) {
        current[idx] = fresh;
        mutated = true;
      }
    } catch {
      // skip
    }
  }
  if (mutated) await writeIndex(current);
  return current;
}
