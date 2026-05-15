"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { redirect } from "next/navigation";

const settingsSchema = z.object({
  jazzcashNumber: z.string().max(40).optional().nullable(),
  easypaisaNumber: z.string().max(40).optional().nullable(),
  bankIban: z.string().max(40).optional().nullable(),
  bankAccountTitle: z.string().max(80).optional().nullable(),
  acceptsCash: z.boolean(),
});

export async function saveSettingsAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const parsed = settingsSchema.parse({
    jazzcashNumber: emptyToNull(formData.get("jazzcashNumber")),
    easypaisaNumber: emptyToNull(formData.get("easypaisaNumber")),
    bankIban: emptyToNull(formData.get("bankIban")),
    bankAccountTitle: emptyToNull(formData.get("bankAccountTitle")),
    acceptsCash: formData.get("acceptsCash") === "on",
  });
  await db.update(users).set(parsed).where(eq(users.id, session.user.id));
  revalidatePath("/settings");
  revalidatePath("/dashboard");
}

function emptyToNull(v: FormDataEntryValue | null) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length === 0 ? null : s;
}
