import "server-only";
import type { Ticket } from "./types";
import { upsertIndexEntry, toIndexEntry } from "./tickets-index";
import { redis, CAS_LUA, casBackoff, CAS_MAX_ATTEMPTS } from "./redis";

const keyTicket = (slug: string) => `ticket:${slug}`;

export async function getTicket(slug: string): Promise<Ticket | null> {
  const raw = await redis.get<string>(keyTicket(slug));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Ticket;
  } catch {
    return null;
  }
}

export async function putTicket(ticket: Ticket): Promise<void> {
  await redis.set(keyTicket(ticket.slug), JSON.stringify(ticket));
  try {
    await upsertIndexEntry(toIndexEntry(ticket));
  } catch (e) {
    console.error("Tickets index update failed:", e);
  }
}

// Atomic read-modify-write via Lua-based CAS. The mutator runs on the
// JS side (so it can be arbitrary), and we only commit if the underlying
// key still holds exactly the value we read. On conflict, we retry with
// the fresh value — works because participant mutations are idempotent
// or naturally re-applicable.
export async function updateTicket(
  slug: string,
  mutator: (t: Ticket) => Ticket | Promise<Ticket>,
): Promise<Ticket> {
  for (let attempt = 0; attempt < CAS_MAX_ATTEMPTS; attempt++) {
    const currentRaw = await redis.get<string>(keyTicket(slug));
    if (!currentRaw) throw new Error("Ticket not found");

    let current: Ticket;
    try {
      current = JSON.parse(currentRaw) as Ticket;
    } catch {
      throw new Error("Ticket corrupted");
    }

    const next = await mutator(current);
    const nextStr = JSON.stringify(next);

    const result = (await redis.eval(CAS_LUA, [keyTicket(slug)], [
      currentRaw,
      nextStr,
    ])) as string;

    if (result === nextStr) {
      try {
        await upsertIndexEntry(toIndexEntry(next));
      } catch (e) {
        console.error("Tickets index update failed:", e);
      }
      return next;
    }

    // CAS lost — somebody else wrote in between. Back off briefly and retry.
    await casBackoff();
  }
  throw new Error("updateTicket failed after retries (high contention)");
}
