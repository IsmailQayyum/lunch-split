import { put, list } from "@vercel/blob";
import type { Ticket } from "./types";
import { upsertIndexEntry, toIndexEntry } from "./tickets-index";

const PREFIX = "tickets/";

function pathFor(slug: string) {
  return `${PREFIX}${slug}.json`;
}

export async function getTicket(slug: string): Promise<Ticket | null> {
  const path = pathFor(slug);
  const { blobs } = await list({ prefix: path });
  const exact = blobs.find((b) => b.pathname === path);
  if (!exact) return null;
  // Cache-bust to force a fresh fetch (CDN can serve stale after overwrites).
  const bustUrl = `${exact.url}?t=${Date.now()}`;
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
