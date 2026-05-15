import { put, list } from "@vercel/blob";

export type Person = {
  id: string;
  name: string;
  email: string | null;
  whatsapp: string | null;
  // Payment methods — used when this person is the payer on a ticket.
  jazzcash: string | null;
  easypaisa: string | null;
  iban: string | null;
  accountTitle: string | null;
  acceptsCash: boolean;
};

const PATH = "roster.json";

export async function getRoster(): Promise<Person[]> {
  try {
    const { blobs } = await list({ prefix: PATH });
    const exact = blobs.find((b) => b.pathname === PATH);
    if (!exact) return [];
    const res = await fetch(exact.url, { cache: "no-store" });
    if (!res.ok) return [];
    const arr = (await res.json()) as Person[];
    if (!Array.isArray(arr)) return [];
    // Backfill new fields on old entries
    return arr.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email ?? null,
      whatsapp: p.whatsapp ?? null,
      jazzcash: p.jazzcash ?? null,
      easypaisa: p.easypaisa ?? null,
      iban: p.iban ?? null,
      accountTitle: p.accountTitle ?? null,
      acceptsCash: p.acceptsCash ?? true,
    }));
  } catch {
    return [];
  }
}

export async function putRoster(roster: Person[]): Promise<void> {
  await put(PATH, JSON.stringify(roster), {
    access: "public",
    contentType: "application/json",
    allowOverwrite: true,
    addRandomSuffix: false,
    cacheControlMaxAge: 0,
  });
}

export function findPersonByEmail(roster: Person[], email: string | null | undefined) {
  if (!email) return null;
  const target = email.toLowerCase();
  return roster.find((p) => (p.email ?? "").toLowerCase() === target) ?? null;
}
