"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  ADMIN_PASSWORD,
  enableAdmin,
  disableAdmin,
  isAdmin,
  isAdminSilent,
  setAdminSilent,
} from "@/lib/admin";

export async function enableAdminAction(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  if (password !== ADMIN_PASSWORD) {
    redirect("/admin?error=bad_password");
  }
  await enableAdmin();
  revalidatePath("/", "layout");
  redirect("/admin");
}

export async function disableAdminAction() {
  await disableAdmin();
  // Invalidate the layout cache so SessionBar drops the "ADMIN ON" badge on
  // the next render. Without this, the soft client navigation after redirect()
  // can leave the cached SessionBar in place even though the cookie is cleared.
  revalidatePath("/", "layout");
  redirect("/");
}

export async function toggleAdminSilentAction() {
  if (!(await isAdmin())) throw new Error("not_admin");
  await setAdminSilent(!(await isAdminSilent()));
  revalidatePath("/admin");
}
