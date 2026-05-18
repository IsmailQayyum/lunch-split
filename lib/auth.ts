import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getRoster, type Person } from "@/lib/store-roster";

const COOKIE_NAME = "ls_session";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export type Viewer = { email: string; person: Person | null };

export async function getViewer(): Promise<Viewer | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const email = raw.trim().toLowerCase();
  if (!email) return null;
  const roster = await getRoster();
  const person =
    roster.find((p) => (p.email ?? "").toLowerCase() === email) ?? null;
  return { email, person };
}

export async function requireViewer(nextPath?: string): Promise<Viewer> {
  const v = await getViewer();
  if (!v) {
    const next = nextPath ? `?next=${encodeURIComponent(nextPath)}` : "";
    redirect(`/login${next}`);
  }
  return v;
}

export async function setSession(email: string): Promise<void> {
  const jar = await cookies();
  jar.set({
    name: COOKIE_NAME,
    value: email.trim().toLowerCase(),
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export function isPayer(
  viewer: Viewer | null,
  payerEmail: string | null | undefined,
): boolean {
  if (!viewer || !payerEmail) return false;
  return viewer.email === payerEmail.toLowerCase();
}

export function isSelf(
  viewer: Viewer | null,
  otherEmail: string | null | undefined,
): boolean {
  if (!viewer || !otherEmail) return false;
  return viewer.email === otherEmail.toLowerCase();
}
