"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { setSession, clearSession } from "@/lib/auth";
import { claimAccountByEmail } from "@/lib/store-roster";

const loginSchema = z.object({
  email: z.string().email(),
  next: z.string().optional(),
});

export async function loginAction(formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) {
    redirect(`/login?error=invalid_email`);
  }
  const { email, next } = parsed.data;
  await claimAccountByEmail(email);
  await setSession(email);
  const target =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  redirect(target);
}

export async function logoutAction() {
  await clearSession();
  redirect("/");
}
