// Pure person-centric balance math over the denormalized tickets index.
// No "server-only" here: this module is also exercised by scripts/smoke.ts,
// so IndexEntry must stay a type-only import (tickets-index is server-only).
import type { IndexEntry } from "./tickets-index";
import { isSettled, type ParticipantStatus } from "./types";

export type BalanceLine = {
  slug: string;
  title: string;
  createdAt: string;
  amount: number;
  status: Extract<ParticipantStatus, "pending" | "self_marked">;
};

export type PersonBalance = {
  // Lowercased email, or `name:<normalized name>` for guests without one.
  key: string;
  name: string;
  // null ⇒ unlinked guest: shown for information, not bulk-confirmable.
  email: string | null;
  owesYou: { total: number; lines: BalanceLine[] }; // viewer is the payer
  youOwe: { total: number; lines: BalanceLine[] }; // counterparty is the payer
};

type Direction = "owesYou" | "youOwe";

export function computeBalances(entries: IndexEntry[], viewerEmail: string): PersonBalance[] {
  const viewer = viewerEmail.toLowerCase();
  const byKey = new Map<string, PersonBalance>();

  const add = (
    dir: Direction,
    who: { name: string; email: string | null },
    line: BalanceLine,
  ) => {
    const email = who.email ? who.email.toLowerCase() : null;
    const key = email ?? `name:${who.name.trim().toLowerCase()}`;
    let person = byKey.get(key);
    if (!person) {
      person = {
        key,
        name: who.name,
        email,
        owesYou: { total: 0, lines: [] },
        youOwe: { total: 0, lines: [] },
      };
      byKey.set(key, person);
    }
    person[dir].total += line.amount;
    person[dir].lines.push(line);
  };

  for (const entry of entries) {
    if (entry.status !== "open") continue;
    const payerEmail = entry.payerEmail ? entry.payerEmail.toLowerCase() : null;
    const viewerIsPayer = payerEmail === viewer;

    for (const p of entry.participants) {
      if (isSettled(p.status)) continue;
      const status = p.status as BalanceLine["status"];
      const pEmail = p.email ? p.email.toLowerCase() : null;
      const line: BalanceLine = {
        slug: entry.slug,
        title: entry.title,
        createdAt: entry.createdAt,
        amount: p.amountOwed,
        status,
      };
      if (viewerIsPayer) {
        // Defensive: a pending self-share on the viewer's own ticket is not a debt.
        if (pEmail === viewer) continue;
        add("owesYou", { name: p.name, email: pEmail }, line);
      } else if (pEmail === viewer) {
        add("youOwe", { name: entry.payerName, email: payerEmail }, line);
      }
    }
  }

  const people = Array.from(byKey.values());
  for (const person of people) {
    person.owesYou.lines.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    person.youOwe.lines.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  people.sort(
    (a, b) =>
      b.owesYou.total - a.owesYou.total ||
      b.youOwe.total - a.youOwe.total ||
      a.name.localeCompare(b.name),
  );
  return people.filter((p) => p.owesYou.total > 0 || p.youOwe.total > 0);
}
