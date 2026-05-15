"use server";

import { revalidatePath } from "next/cache";
import { customAlphabet } from "nanoid";
import { z } from "zod";

import { getRoster, putRoster, type Person } from "@/lib/store-roster";

const newId = customAlphabet(
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  10,
);

const personSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(80),
  email: z.string().email().optional().or(z.literal("")).transform((v) => v || undefined),
  whatsapp: z.string().max(40).optional().or(z.literal("")).transform((v) => v || undefined),
});

export async function listPeopleAction(): Promise<Person[]> {
  return await getRoster();
}

export async function upsertPersonAction(input: unknown): Promise<Person> {
  const data = personSchema.parse(input);
  const roster = await getRoster();
  let person: Person;
  if (data.id) {
    const idx = roster.findIndex((p) => p.id === data.id);
    if (idx === -1) throw new Error("Person not found");
    person = {
      id: data.id,
      name: data.name,
      email: data.email ?? null,
      whatsapp: data.whatsapp ?? null,
    };
    roster[idx] = person;
  } else {
    person = {
      id: newId(),
      name: data.name,
      email: data.email ?? null,
      whatsapp: data.whatsapp ?? null,
    };
    roster.push(person);
  }
  await putRoster(roster);
  revalidatePath("/people");
  revalidatePath("/tickets/new");
  return person;
}

export async function removePersonAction(id: string): Promise<void> {
  const roster = await getRoster();
  const next = roster.filter((p) => p.id !== id);
  await putRoster(next);
  revalidatePath("/people");
  revalidatePath("/tickets/new");
}
