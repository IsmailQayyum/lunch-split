import "server-only";
import { cookies } from "next/headers";

// SECURITY: hardcoded shared password — acceptable for hobby/internal use only.
// Move to env var with a strong value before any real deployment.
export const ADMIN_PASSWORD = "iamthebest";

const ADMIN_COOKIE = "ls_admin";
const ADMIN_SILENT_COOKIE = "ls_admin_silent";
const ADMIN_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year

export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  return jar.get(ADMIN_COOKIE)?.value === "1";
}

// Whether admin has opted to suppress Slack notifications for their actions.
// Only meaningful when isAdmin() is also true.
export async function isAdminSilent(): Promise<boolean> {
  const jar = await cookies();
  return jar.get(ADMIN_SILENT_COOKIE)?.value === "1";
}

export async function setAdminSilent(silent: boolean): Promise<void> {
  const jar = await cookies();
  if (silent) {
    jar.set({
      name: ADMIN_SILENT_COOKIE,
      value: "1",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: ADMIN_MAX_AGE_SECONDS,
    });
  } else {
    jar.set({
      name: ADMIN_SILENT_COOKIE,
      value: "",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 0,
    });
  }
}

export async function enableAdmin(): Promise<void> {
  const jar = await cookies();
  jar.set({
    name: ADMIN_COOKIE,
    value: "1",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: ADMIN_MAX_AGE_SECONDS,
  });
}

export async function disableAdmin(): Promise<void> {
  const jar = await cookies();
  // Overwrite with an expired cookie carrying the same path the cookie was
  // set with. `jar.delete(name)` alone can leave the original cookie intact
  // when the request path differs from the cookie's path.
  jar.set({
    name: ADMIN_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  });
  jar.set({
    name: ADMIN_SILENT_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  });
}
