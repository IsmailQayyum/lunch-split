"use server";

import { customAlphabet } from "nanoid";
import { z } from "zod";

import {
  getRoster,
  updateRoster,
  WALLET_APPS,
  type Person,
  type WalletApp,
} from "@/lib/store-roster";
import { requireViewer, getViewer, isSelf } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";

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

const walletAppEnum = z.enum(["jazzcash", "easypaisa", "nayapay", "sadapay"]);

const personSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(80),
  email: z.string().email().optional().or(z.literal("")).transform((v) => v || undefined),
  whatsapp: optStr(40),
  walletNumber: optStr(40),
  walletApps: z.array(walletAppEnum).optional().default([]),
  iban: optStr(40),
  accountTitle: optStr(80),
  acceptsCash: z.boolean().default(true),
});

export async function listPeopleAction(): Promise<Person[]> {
  return await getRoster();
}

export async function upsertPersonAction(input: unknown): Promise<Person> {
  const admin = await isAdmin();
  const viewer = admin ? await getViewer() : await requireViewer();
  const data = personSchema.parse(input);
  const walletApps = Array.from(new Set(data.walletApps)).filter((a): a is WalletApp =>
    WALLET_APPS.some((w) => w.id === a),
  );

  if (data.id) {
    // Editing an existing entry — only allowed on your own card (admin bypasses).
    const roster = await getRoster();
    const existing = roster.find((p) => p.id === data.id);
    if (!existing) throw new Error("Person not found");
    if (!admin && !isSelf(viewer, existing.email)) throw new Error("not_authorized");
  }
  // Creating a new entry — any signed-in viewer or admin can do it.

  const next: Person = {
    id: data.id ?? newId(),
    name: data.name,
    email: data.email ? data.email.trim().toLowerCase() : null,
    whatsapp: data.whatsapp ?? null,
    walletNumber: data.walletNumber ?? null,
    walletApps: data.walletNumber ? walletApps : [],
    iban: data.iban ?? null,
    accountTitle: data.accountTitle ?? null,
    acceptsCash: data.acceptsCash,
    hasAccount: false,
  };

  await updateRoster((roster) => {
    if (data.id) {
      const idx = roster.findIndex((p) => p.id === data.id);
      if (idx === -1) throw new Error("Person not found");
      // Preserve hasAccount from the existing record.
      next.hasAccount = roster[idx].hasAccount;
      roster[idx] = next;
    } else {
      roster.push(next);
    }
    return roster;
  });

  return next;
}

export async function removePersonAction(id: string): Promise<void> {
  const admin = await isAdmin();
  const viewer = admin ? await getViewer() : await requireViewer();
  const roster = await getRoster();
  const existing = roster.find((p) => p.id === id);
  if (!existing) return;
  if (!admin && !isSelf(viewer, existing.email)) throw new Error("not_authorized");
  await updateRoster((r) => r.filter((p) => p.id !== id));
}
