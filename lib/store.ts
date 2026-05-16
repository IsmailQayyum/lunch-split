import { put, head } from "@vercel/blob";
import type { Ticket } from "./types";
import { upsertIndexEntry, toIndexEntry } from "./tickets-index";

const PREFIX = "tickets/";

function pathFor(slug: string) {
  return `${PREFIX}${slug}.json`;
}

export async function getTicket(slug: string): Promise<Ticket | null> {
  const path = pathFor(slug);
  let url: string;
  let stamp: number;
  try {
    // head() hits Vercel Blob's metadata API directly — not the CDN — so
    // it's guaranteed fresh after a put().
    const meta = await head(path);
    url = meta.url;
    stamp = meta.uploadedAt.getTime();
  } catch {
    // BlobNotFoundError (or transient failure) -> treat as missing
    return null;
  }
  // Use uploadedAt as cache-bust: it changes on every overwrite, so each
  // version gets a deterministically-unique URL the CDN hasn't seen.
  // Date.now()-based busting was not reliable — the CDN appeared to serve
  // stale content under the same path despite the changing query string.
  const bustUrl = `${url}?v=${stamp}`;
  const res = await fetch(bustUrl, { cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as Ticket;
}

export async function putTicket(ticket: Ticket): Promise<void> {
  await put(pathFor(ticket.slug), JSON.stringify(ticket), {
    access: "public",
    contentType: "application/json",
    allowOverwrite: true,
    addRandomSuffix: false,
    cacheControlMaxAge: 0,
  });
  // Best-effort index update — don't fail the save if this errors
  try {
    await upsertIndexEntry(toIndexEntry(ticket));
  } catch (e) {
    console.error("Tickets index update failed:", e);
  }
}

export async function updateTicket(
  slug: string,
  mutator: (t: Ticket) => Ticket | Promise<Ticket>,
): Promise<Ticket> {
  const current = await getTicket(slug);
  if (!current) throw new Error("Ticket not found");
  const next = await mutator(current);
  await putTicket(next);
  return next;
}
