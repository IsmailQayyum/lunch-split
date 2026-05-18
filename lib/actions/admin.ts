"use server";

import { redirect } from "next/navigation";
import { ADMIN_PASSWORD, enableAdmin, disableAdmin } from "@/lib/admin";

export async function enableAdminAction(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  if (password !== ADMIN_PASSWORD) {
    redirect("/admin?error=bad_password");
  }
  await enableAdmin();
  redirect("/admin");
}

export async function disableAdminAction() {
  await disableAdmin();
  redirect("/");
}
