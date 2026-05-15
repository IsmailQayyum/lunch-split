"use server";

import { revalidatePath } from "next/cache";
import { customAlphabet } from "nanoid";
import { z } from "zod";

import { getRoster, putRoster, type Person } from "@/lib/store-roster";

const newId = customAlphabet(
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  10,
);

const optStr = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .or(z.literal(""))
    .transform((v) => v || undefined);

const personSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(80),
  email: z.string().email().optional().or(z.literal("")).transform((v) => v || undefined),
  whatsapp: optStr(40),
  jazzcash: optStr(40),
  easypaisa: optStr(40),
  iban: optStr(40),
  accountTitle: optStr(80),
  acceptsCash: z.boolean().default(true),
});

export async function listPeopleAction(): Promise<Person[]> {
  return await getRoster();
}

export async function upsertPersonAction(input: unknown): Promise<Person> {
  const data = personSchema.parse(input);
  const roster = await getRoster();
  const next: Person = {
    id: data.id ?? newId(),
    name: data.name,
    email: data.email ?? null,
    whatsapp: data.whatsapp ?? null,
    jazzcash: data.jazzcash ?? null,
    easypaisa: data.easypaisa ?? null,
    iban: data.iban ?? null,
    accountTitle: data.accountTitle ?? null,
    acceptsCash: data.acceptsCash,
  };
  if (data.id) {
    const idx = roster.findIndex((p) => p.id === data.id);
    if (idx === -1) throw new Error("Person not found");
    roster[idx] = next;
  } else {
    roster.push(next);
  }
  await putRoster(roster);
  revalidatePath("/people");
  revalidatePath("/tickets/new");
  return next;
}

export async function removePersonAction(id: string): Promise<void> {
  const roster = await getRoster();
  const updated = roster.filter((p) => p.id !== id);
  await putRoster(updated);
  revalidatePath("/people");
  revalidatePath("/tickets/new");
}
