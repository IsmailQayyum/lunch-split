import { put, list } from "@vercel/blob";
import type { Ticket } from "./types";

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
};

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
    const arr = (await res.json()) as IndexEntry[];
    return Array.isArray(arr) ? arr : [];
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
// rebuild it by scanning all ticket blobs. One-shot — afterwards the index
// is maintained incrementally on each putTicket.
export async function readIndexOrRebuild(): Promise<IndexEntry[]> {
  const current = await readIndex();
  if (current.length > 0) return current;

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
