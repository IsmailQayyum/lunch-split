import { put, list } from "@vercel/blob";

export type Person = {
  id: string;
  name: string;
  email: string | null;
  whatsapp: string | null;
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
    return Array.isArray(arr) ? arr : [];
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
