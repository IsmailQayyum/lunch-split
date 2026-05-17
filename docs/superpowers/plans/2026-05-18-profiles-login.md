# Profiles & Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add email-only logins to Lunch Split so creating tickets and self-acting ("I paid") require a signed-in viewer, payer-only actions are gated to the payer, and roster cards are self-edit-only.

**Architecture:** Identity is the existing roster `Person` matched by case-insensitive email. Session is a single HttpOnly cookie (`ls_session`) holding the lowercased email — no password, no verification, no server-side session store. Every gated server action calls a helper to resolve the viewer and check the rule (`viewer-is-payer`, `viewer-is-participant`, `viewer-is-self`). UI mirrors the rules but the server is authoritative.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Upstash Redis (existing roster/ticket storage), `cookies()` from `next/headers` for session.

**Verification baseline:** This repo has no test framework. Each task verifies with `npm run build` (catches type/wiring breakage) and a focused manual smoke. The full 13-row smoke matrix from the spec runs once at the end (Task 8).

**Commit style:** match recent commits — single-line imperative subject, optional body. Co-author trailer per repo norm.

---

## File map

**New files:**
- `lib/auth.ts` — `getViewer`, `requireViewer`, `setSession`, `clearSession`, role helpers.
- `lib/actions/auth.ts` — `loginAction(email)`, `logoutAction()`.
- `app/login/page.tsx` — server component wrapper.
- `app/login/LoginForm.tsx` — client form (uses `useTransition` like every other form here).
- `components/SessionBar.tsx` — server component, top bar mounted in root layout.

**Modified files:**
- `lib/wallet-apps.ts` — add optional `hasAccount?: boolean` to `Person`.
- `lib/store-roster.ts` — `normalize()` defaults missing `hasAccount` to `false`; add `setHasAccount()` helper used by `loginAction`.
- `lib/tickets-index.ts` — `IndexEntry` gains `payerEmail: string | null`; `toIndexEntry` + `normalizeEntry` updated.
- `lib/actions/tickets.ts` — every action gains a gate call at the top; `bulkDeleteTicketsAction` loses its `password` param and filters by payer.
- `lib/actions/roster.ts` — `upsertPersonAction` and `removePersonAction` enforce self-only edits; new entries require sign-in.
- `app/layout.tsx` — render `<SessionBar />` above `{children}`.
- `app/page.tsx` — footer copy; pass `viewerEmail` to `DashboardFilter`.
- `app/t/[slug]/page.tsx` — resolve viewer once; compute `isPayer`; pass `viewerEmail` + `isPayer` into child components.
- `app/tickets/new/page.tsx` — `requireViewer()` (redirects); pass viewer's `Person` into the form.
- `app/tickets/new/NewTicketForm.tsx` — drop `PayerPicker`, fix payer to viewer, remove `lunch-split:me-id` localStorage.
- `app/people/page.tsx` — pass `viewerEmail` to `RosterEditor`.
- `app/people/RosterEditor.tsx` — split into "YOU" (editable) + "THE CREW" (read-only). "+ Add person" stays for any signed-in viewer.
- `components/ParticipantRow.tsx` — `viewerEmail` + `isPayer` props; gate button visibility.
- `components/CloseTicketButton.tsx` — hide unless `isPayer`.
- `components/AddMeButton.tsx` — collapse to one-tap if signed in; show "Sign in to add yourself" link if signed out.
- `components/DashboardFilter.tsx` — `viewerEmail` prop; bulk-select checkboxes only on payer's own bills; password input removed.
- `.env.example` — remove `BULK_DELETE_PASSWORD` line.

**Deleted files:**
- `components/PayerPicker.tsx`.

---

## Task 1: Identity foundation — `Person.hasAccount`, auth helpers, login + logout, SessionBar

**Files:**
- Modify: `lib/wallet-apps.ts`
- Modify: `lib/store-roster.ts`
- Create: `lib/auth.ts`
- Create: `lib/actions/auth.ts`
- Create: `app/login/page.tsx`
- Create: `app/login/LoginForm.tsx`
- Create: `components/SessionBar.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1.1: Add `hasAccount` to `Person`**

In `lib/wallet-apps.ts`, update the `Person` type:

```ts
export type Person = {
  id: string;
  name: string;
  email: string | null;
  whatsapp: string | null;
  walletNumber: string | null;
  walletApps: WalletApp[];
  iban: string | null;
  accountTitle: string | null;
  acceptsCash: boolean;
  hasAccount: boolean;
};
```

- [ ] **Step 1.2: Default missing `hasAccount` in normalizer**

In `lib/store-roster.ts`, inside `normalize()`, add this line in the returned object (alongside the other field defaults):

```ts
hasAccount: typeof o.hasAccount === "boolean" ? o.hasAccount : false,
```

- [ ] **Step 1.3: Add a `claimAccountByEmail` helper**

Append to `lib/store-roster.ts`:

```ts
// Find or create a roster Person for `email` (case-insensitive) and mark
// hasAccount=true. Used by login. Returns the resolved Person.
export async function claimAccountByEmail(email: string, fallbackName?: string): Promise<Person> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) throw new Error("email required");

  let resolved: Person | null = null;
  await updateRoster((roster) => {
    const idx = roster.findIndex((p) => (p.email ?? "").toLowerCase() === normalized);
    if (idx === -1) {
      const fresh: Person = {
        id: crypto.randomUUID().slice(0, 10),
        name: fallbackName?.trim() || normalized.split("@")[0],
        email: normalized,
        whatsapp: null,
        walletNumber: null,
        walletApps: [],
        iban: null,
        accountTitle: null,
        acceptsCash: true,
        hasAccount: true,
      };
      roster.push(fresh);
      resolved = fresh;
    } else {
      const existing = roster[idx];
      const next: Person = {
        ...existing,
        email: normalized,
        hasAccount: true,
      };
      roster[idx] = next;
      resolved = next;
    }
    return roster;
  });
  if (!resolved) throw new Error("claimAccountByEmail: resolved is null after update");
  return resolved;
}
```

- [ ] **Step 1.4: Create `lib/auth.ts`**

Create file `lib/auth.ts`:

```ts
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
  const person = roster.find((p) => (p.email ?? "").toLowerCase() === email) ?? null;
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

export function isPayer(viewer: Viewer | null, payerEmail: string | null | undefined): boolean {
  if (!viewer || !payerEmail) return false;
  return viewer.email === payerEmail.toLowerCase();
}

export function isSelf(viewer: Viewer | null, otherEmail: string | null | undefined): boolean {
  if (!viewer || !otherEmail) return false;
  return viewer.email === otherEmail.toLowerCase();
}
```

- [ ] **Step 1.5: Create `lib/actions/auth.ts`**

Create file `lib/actions/auth.ts`:

```ts
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
    // Surface to the form via a query param.
    redirect(`/login?error=invalid_email`);
  }
  const { email, next } = parsed.data;
  await claimAccountByEmail(email);
  await setSession(email);
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  redirect(target);
}

export async function logoutAction() {
  await clearSession();
  redirect("/");
}
```

- [ ] **Step 1.6: Create `/login` page**

Create file `app/login/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const v = await getViewer();
  if (v) redirect("/");
  const { next, error } = await searchParams;
  return (
    <main className="max-w-[420px] mx-auto px-5 pt-16 pb-16 animate-print">
      <Link href="/" className="eyebrow ink-link">
        ← BACK
      </Link>
      <header className="text-center mt-10 mb-8">
        <div className="eyebrow">SIGN IN</div>
        <h1 className="display-italic text-[56px] mt-3 leading-[0.9]">Who are you?</h1>
        <p className="text-ink-soft text-[13px] mt-4 max-w-[320px] mx-auto">
          One field, no password. Your email is your account.
        </p>
      </header>
      <div className="divider-dots mb-8" />
      <LoginForm next={next} error={error} />
      <div className="divider-double max-w-[180px] mx-auto mt-12" />
      <div className="eyebrow text-center mt-4 text-ink-faint">
        NO PASSWORD · NO INBOX ROUND-TRIP
      </div>
    </main>
  );
}
```

- [ ] **Step 1.7: Create `/login` form (client)**

Create file `app/login/LoginForm.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction } from "@/lib/actions/auth";

export function LoginForm({ next, error }: { next?: string; error?: string }) {
  const [email, setEmail] = useState("");
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("email", email);
    if (next) fd.set("next", next);
    startTransition(async () => {
      await loginAction(fd);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label>EMAIL</Label>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          autoFocus
        />
      </div>
      {error === "invalid_email" && (
        <div className="text-[12px] text-saffron italic">That doesn't look like an email.</div>
      )}
      <Button type="submit" disabled={pending || !email.trim()} size="lg">
        {pending ? "Signing in…" : "↓ Sign in"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 1.8: Create `SessionBar`**

Create file `components/SessionBar.tsx`:

```tsx
import Link from "next/link";
import { getViewer } from "@/lib/auth";
import { logoutAction } from "@/lib/actions/auth";

export async function SessionBar() {
  const v = await getViewer();
  return (
    <div className="border-b border-dashed border-ink-faint/40 bg-paper-light/60">
      <div className="max-w-[720px] mx-auto px-5 py-2 flex items-center justify-between text-[10px] font-mono tracking-wider uppercase">
        <Link href="/" className="text-ink-faint hover:text-ink">
          ◇ LUNCH SPLIT
        </Link>
        {v ? (
          <form action={logoutAction} className="flex items-center gap-3">
            <span className="text-ink-faint">
              SIGNED IN ·{" "}
              <span className="text-ink">{v.person?.name ?? v.email}</span>
            </span>
            <button
              type="submit"
              className="text-saffron hover:underline underline-offset-2"
            >
              SIGN OUT
            </button>
          </form>
        ) : (
          <Link href="/login" className="text-saffron hover:underline underline-offset-2">
            SIGN IN →
          </Link>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 1.9: Mount SessionBar in root layout**

In `app/layout.tsx`, modify the body content:

```tsx
import { SessionBar } from "@/components/SessionBar";

// inside RootLayout return:
return (
  <html lang="en" className={`${fraunces.variable} ${mono.variable}`}>
    <body className="antialiased min-h-screen">
      <SessionBar />
      {children}
    </body>
  </html>
);
```

- [ ] **Step 1.10: Build + smoke**

Run: `npm run build`
Expected: clean build (no type errors).

Smoke (manually, with `npm run dev`):
1. Visit `/` — top bar shows "SIGN IN →".
2. Click → `/login` form loads.
3. Submit a valid email — redirected to `/`, top bar now shows "SIGNED IN · <name>".
4. Click "SIGN OUT" — back to "SIGN IN →".

- [ ] **Step 1.11: Commit**

```bash
git add lib/wallet-apps.ts lib/store-roster.ts lib/auth.ts lib/actions/auth.ts \
        app/login app/layout.tsx components/SessionBar.tsx
git commit -m "$(cat <<'EOF'
Add typed-email login (cookie session, no password)

Person gains hasAccount flag; first sign-in upserts a roster entry and
flips the flag. SessionBar renders globally; /login is single email field
backed by an HttpOnly cookie session.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Server-side gates on every mutating action

Server-side authority. UI changes come later; without these gates the UI changes are decoration.

**Files:**
- Modify: `lib/actions/tickets.ts`
- Modify: `lib/actions/roster.ts`

- [ ] **Step 2.1: Add gate helpers at top of `lib/actions/tickets.ts`**

Below the existing imports, add:

```ts
import { getViewer, requireViewer, isPayer as viewerIsPayer, isSelf } from "@/lib/auth";

async function requirePayer(slug: string) {
  const viewer = await requireViewer();
  const t = await getTicket(slug);
  if (!t) throw new Error("Ticket not found");
  if (!viewerIsPayer(viewer, t.payer.email)) throw new Error("not_authorized");
  return { viewer, ticket: t };
}

async function requirePayerOrSelfForParticipant(slug: string, participantId: string) {
  const viewer = await requireViewer();
  const t = await getTicket(slug);
  if (!t) throw new Error("Ticket not found");
  const p = t.participants.find((x) => x.id === participantId);
  if (!p) throw new Error("Participant not found");
  if (viewerIsPayer(viewer, t.payer.email)) return { viewer, ticket: t, participant: p };
  if (isSelf(viewer, p.email)) return { viewer, ticket: t, participant: p };
  throw new Error("not_authorized");
}

async function requireSelfForParticipant(slug: string, participantId: string) {
  const viewer = await requireViewer();
  const t = await getTicket(slug);
  if (!t) throw new Error("Ticket not found");
  const p = t.participants.find((x) => x.id === participantId);
  if (!p) throw new Error("Participant not found");
  if (!isSelf(viewer, p.email)) throw new Error("not_authorized");
  return { viewer, ticket: t, participant: p };
}
```

- [ ] **Step 2.2: Gate `createTicketAction` — force payer to viewer**

Replace the existing `createTicketAction` body. After `const data = createTicketSchema.parse(input);`, insert:

```ts
const viewer = await requireViewer();
// Always pin payer.email to the viewer (defense against client tampering).
data.payer.email = viewer.email;
```

(The rest of the action body stays the same — `shares`, `ticket`, `putTicket`, etc.)

- [ ] **Step 2.3: Gate participant lifecycle actions**

In `lib/actions/tickets.ts`, at the start of each function listed, add the gate. Show full replaced bodies:

```ts
export async function markPaidAction(slug: string, participantId: string) {
  await requireSelfForParticipant(slug, participantId);
  // ... existing body unchanged from here
  const { before, after, participant } = await mutateParticipant(
    slug,
    participantId,
    (p) => {
      if (p.status === "confirmed" || p.status === "cash") return p;
      return { ...p, status: "self_marked", selfMarkedAt: new Date().toISOString() };
    },
    false,
  );
  const beforeP = before.participants.find((x) => x.id === participantId);
  if (beforeP && beforeP.status !== participant.status) {
    await notifySlack(
      `🟡 *${participant.name}* marked paid on *${after.title}*\n₨ ${participant.amountOwed.toLocaleString("en-PK")} · awaiting ${after.payer.name}'s confirmation`,
    );
  }
}

export async function confirmPaidAction(slug: string, participantId: string) {
  await requirePayer(slug);
  // ... existing body unchanged
  const { before, after, participant } = await mutateParticipant(slug, participantId, (p) => {
    if (p.status === "confirmed" || p.status === "cash") return p;
    return { ...p, status: "confirmed", confirmedAt: new Date().toISOString() };
  });
  const beforeP = before.participants.find((x) => x.id === participantId);
  if (beforeP && beforeP.status !== participant.status) {
    await notifySlack(
      `✅ *${participant.name}* settled on *${after.title}*\n₨ ${participant.amountOwed.toLocaleString("en-PK")} · ${settledOf(after)}/${after.participants.length} done`,
    );
  }
  await notifyAutoCloseIfFlipped(before, after);
}

export async function markCashAction(slug: string, participantId: string) {
  await requirePayer(slug);
  // ... existing body unchanged
  const { before, after, participant } = await mutateParticipant(slug, participantId, (p) => ({
    ...p,
    status: "cash",
    confirmedAt: new Date().toISOString(),
  }));
  const beforeP = before.participants.find((x) => x.id === participantId);
  if (beforeP && beforeP.status !== "cash") {
    await notifySlack(
      `💵 *${participant.name}* paid cash on *${after.title}*\n₨ ${participant.amountOwed.toLocaleString("en-PK")} · ${settledOf(after)}/${after.participants.length} done`,
    );
  }
  await notifyAutoCloseIfFlipped(before, after);
}

export async function reopenParticipantAction(slug: string, participantId: string) {
  await requirePayerOrSelfForParticipant(slug, participantId);
  // ... existing body unchanged
  await updateTicket(slug, (t) => {
    const updated = {
      ...t,
      participants: t.participants.map((p) =>
        p.id === participantId
          ? { ...p, status: "pending" as ParticipantStatus, selfMarkedAt: null, confirmedAt: null }
          : p,
      ),
    };
    return updated.status === "closed"
      ? { ...updated, status: "open" as const, closedAt: null }
      : updated;
  });
  revalidatePath(`/t/${slug}`);
}

export async function remindEmailAction(slug: string, participantId: string) {
  await requirePayer(slug);
  // ... existing body unchanged from the original `const t = await getTicket(slug);`
  const t = await getTicket(slug);
  if (!t) throw new Error("Ticket not found");
  const p = findParticipant(t, participantId);
  if (p.status === "confirmed" || p.status === "cash") throw new Error("Already settled");
  if (!p.email) throw new Error("No email on file for this participant");
  const lastEmail = t.reminders
    .filter((r) => r.participantId === participantId && r.channel === "email")
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt))[0];
  if (lastEmail && Date.now() - new Date(lastEmail.sentAt).getTime() < 60 * 60 * 1000) {
    throw new Error("Already reminded by email in the last hour");
  }
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  await sendReminderEmail({
    to: p.email,
    payerName: t.payer.name,
    ticketTitle: t.title,
    amount: String(p.amountOwed),
    ticketUrl: `${appUrl}/t/${slug}`,
  });
  await updateTicket(slug, (cur) => ({
    ...cur,
    reminders: [
      ...cur.reminders,
      { participantId, sentAt: new Date().toISOString(), channel: "email" as const },
    ],
  }));
  revalidatePath(`/t/${slug}`);
}

export async function logWhatsappReminderAction(slug: string, participantId: string) {
  await requirePayer(slug);
  await updateTicket(slug, (cur) => ({
    ...cur,
    reminders: [
      ...cur.reminders,
      { participantId, sentAt: new Date().toISOString(), channel: "whatsapp" as const },
    ],
  }));
}
```

- [ ] **Step 2.4: Gate ticket lifecycle + participant mutation actions**

```ts
export async function closeTicketAction(slug: string) {
  await requirePayer(slug);
  // ... existing body unchanged
  let wasOpen = false;
  const after = await updateTicket(slug, (t) => {
    wasOpen = t.status === "open";
    return { ...t, status: "closed", closedAt: new Date().toISOString() };
  });
  revalidatePath(`/t/${slug}`);
  if (wasOpen) {
    await notifySlack(
      `🔒 *${after.title}* closed by *${after.payer.name}*\n${settledOf(after)}/${after.participants.length} settled at close\n${ticketUrl(after.slug)}`,
    );
  }
}

export async function deleteTicketAction(slug: string) {
  await requirePayer(slug);
  await deleteTicket(slug);
  revalidatePath("/");
  redirect("/");
}

export async function reopenTicketAction(slug: string) {
  await requirePayer(slug);
  // ... existing body unchanged
  let wasClosed = false;
  const after = await updateTicket(slug, (t) => {
    wasClosed = t.status === "closed";
    return { ...t, status: "open", closedAt: null };
  });
  revalidatePath(`/t/${slug}`);
  if (wasClosed) {
    await notifySlack(
      `🔓 *${after.title}* reopened by *${after.payer.name}*\n${ticketUrl(after.slug)}`,
    );
  }
}

export async function updateParticipantAmountAction(
  slug: string,
  participantId: string,
  amount: number,
) {
  await requirePayer(slug);
  await updateTicket(slug, (t) => {
    if (t.status !== "open") throw new Error("Ticket is closed");
    return {
      ...t,
      participants: t.participants.map((p) =>
        p.id === participantId ? { ...p, amountOwed: Math.round(amount) } : p,
      ),
    };
  });
  revalidatePath(`/t/${slug}`);
}

export async function removeParticipantAction(slug: string, participantId: string) {
  await requirePayerOrSelfForParticipant(slug, participantId);
  await updateTicket(slug, (t) => {
    if (t.status !== "open") throw new Error("Ticket is closed");
    return { ...t, participants: t.participants.filter((p) => p.id !== participantId) };
  });
  revalidatePath(`/t/${slug}`);
}
```

- [ ] **Step 2.5: Restrict `addParticipantAction` to self-add**

Replace the entire `addParticipantAction` function:

```ts
export async function addParticipantAction(
  slug: string,
  amount: number,
) {
  const viewer = await requireViewer();
  await updateTicket(slug, (t) => {
    if (t.status !== "open") throw new Error("Ticket is closed");
    if (t.participants.some((p) => (p.email ?? "").toLowerCase() === viewer.email)) {
      throw new Error("email_already_on_ticket");
    }
    const person = viewer.person;
    return {
      ...t,
      participants: [
        ...t.participants,
        {
          id: newParticipantId(),
          name: person?.name ?? viewer.email.split("@")[0],
          email: viewer.email,
          whatsapp: person?.whatsapp ?? null,
          amountOwed: Math.round(amount),
          status: "pending",
          selfMarkedAt: null,
          confirmedAt: null,
        },
      ],
    };
  });
  revalidatePath(`/t/${slug}`);
}
```

(Callers in Task 4 are updated to the new signature.)

- [ ] **Step 2.6: Rework `bulkDeleteTicketsAction` to require sign-in + payer-only**

Replace `bulkDeleteTicketsAction`:

```ts
export async function bulkDeleteTicketsAction(slugs: string[]): Promise<{ deleted: number; skipped: number }> {
  const viewer = await requireViewer();
  if (!Array.isArray(slugs) || slugs.length === 0) return { deleted: 0, skipped: 0 };
  const targets = Array.from(new Set(slugs)).slice(0, 200);
  let deleted = 0;
  let skipped = 0;
  for (const slug of targets) {
    try {
      const t = await getTicket(slug);
      if (!t) {
        skipped++;
        continue;
      }
      if (!viewerIsPayer(viewer, t.payer.email)) {
        skipped++;
        continue;
      }
      await deleteTicket(slug);
      deleted++;
    } catch (e) {
      console.error(`bulk delete failed for ${slug}:`, e);
      skipped++;
    }
  }
  revalidatePath("/");
  return { deleted, skipped };
}
```

- [ ] **Step 2.7: Gate roster actions for self-only edits**

In `lib/actions/roster.ts`, add the gate. Replace `upsertPersonAction` and `removePersonAction`:

```ts
import { requireViewer, isSelf } from "@/lib/auth";

export async function upsertPersonAction(input: unknown): Promise<Person> {
  const viewer = await requireViewer();
  const data = personSchema.parse(input);
  const walletApps = Array.from(new Set(data.walletApps)).filter((a): a is WalletApp =>
    WALLET_APPS.some((w) => w.id === a),
  );

  if (data.id) {
    // Editing an existing entry — only allowed on your own card.
    const roster = await getRoster();
    const existing = roster.find((p) => p.id === data.id);
    if (!existing) throw new Error("Person not found");
    if (!isSelf(viewer, existing.email)) throw new Error("not_authorized");
  }
  // Creating a new entry — any signed-in viewer can do it.

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
  const viewer = await requireViewer();
  const roster = await getRoster();
  const existing = roster.find((p) => p.id === id);
  if (!existing) return;
  if (!isSelf(viewer, existing.email)) throw new Error("not_authorized");
  await updateRoster((r) => r.filter((p) => p.id !== id));
}
```

- [ ] **Step 2.8: Build**

Run: `npm run build`
Expected: clean build. (One known site to adjust comes in Task 4 — `addParticipantAction` signature changed. If the build fails on `AddMeButton.tsx`, Task 4 fixes it. For this task, expect either a clean build or a failure isolated to `AddMeButton.tsx`'s call site. If the latter, proceed to commit — the build will go green at end of Task 4.)

Actually — to keep each commit shippable, also patch the caller now. In `components/AddMeButton.tsx`, find the existing `addParticipantAction(slug, p.name, amt, p.email ?? undefined, p.whatsapp ?? undefined)` and `addParticipantAction(slug, name.trim(), amt, ...)` invocations. Both happen inside the `submit()` function. Replace the whole `submit()` body with a temporary stub that no-ops (the proper rewrite is Task 4):

```ts
function submit() {
  setErr("Add-me UI is being upgraded — sign-in required.");
}
```

This keeps the build green between commits.

Run: `npm run build` again.
Expected: clean build.

- [ ] **Step 2.9: Commit**

```bash
git add lib/actions/tickets.ts lib/actions/roster.ts components/AddMeButton.tsx
git commit -m "$(cat <<'EOF'
Gate server actions by viewer role

Confirm/cash/close/delete/reopen/remind/edit are payer-only. Self-mark
(I-paid) requires the participant. Reopen/remove permit payer or self.
Bulk-delete loses its password param and filters to bills the viewer owns.
Roster upsert/delete restrict to self-only; new entries require sign-in.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Tickets index gains `payerEmail`, DashboardFilter gates bulk delete

**Files:**
- Modify: `lib/tickets-index.ts`
- Modify: `components/DashboardFilter.tsx`
- Modify: `app/page.tsx`
- Modify: `.env.example`

- [ ] **Step 3.1: Add `payerEmail` to `IndexEntry`**

In `lib/tickets-index.ts`:

```ts
export type IndexEntry = {
  slug: string;
  title: string;
  totalAmount: number;
  currency: string;
  payerName: string;
  payerEmail: string | null;
  status: "open" | "closed";
  createdAt: string;
  closedAt: string | null;
  participantCount: number;
  settledCount: number;
  participants: IndexParticipant[];
};
```

Update `normalizeEntry`:

```ts
function normalizeEntry(e: Partial<IndexEntry> & { slug: string }): IndexEntry {
  return {
    slug: e.slug,
    title: e.title ?? "",
    totalAmount: e.totalAmount ?? 0,
    currency: e.currency ?? "PKR",
    payerName: e.payerName ?? "",
    payerEmail: typeof e.payerEmail === "string" ? e.payerEmail.toLowerCase() : null,
    status: e.status ?? "open",
    createdAt: e.createdAt ?? new Date().toISOString(),
    closedAt: e.closedAt ?? null,
    participantCount: e.participantCount ?? 0,
    settledCount: e.settledCount ?? 0,
    participants: Array.isArray(e.participants) ? e.participants : [],
  };
}
```

Update `toIndexEntry`:

```ts
export function toIndexEntry(t: Ticket): IndexEntry {
  return {
    slug: t.slug,
    title: t.title,
    totalAmount: t.totalAmount,
    currency: t.currency,
    payerName: t.payer.name,
    payerEmail: t.payer.email ? t.payer.email.toLowerCase() : null,
    status: t.status,
    createdAt: t.createdAt,
    closedAt: t.closedAt,
    participantCount: t.participants.length,
    settledCount: t.participants.filter(
      (p) => p.status === "confirmed" || p.status === "cash",
    ).length,
    participants: t.participants.map((p) => ({
      name: p.name,
      status: p.status,
      amountOwed: p.amountOwed,
    })),
  };
}
```

- [ ] **Step 3.2: Plumb `viewerEmail` through to DashboardFilter**

In `app/page.tsx`, modify the top:

```tsx
import { getViewer } from "@/lib/auth";

export default async function Home() {
  const [index, viewer] = await Promise.all([readIndexOrRebuild(), getViewer()]);
  return (
    <main className="max-w-[560px] mx-auto px-5 pt-10 pb-16 animate-print">
      {/* ... existing header / divider / CTA section unchanged ... */}
      <DashboardFilter entries={index} viewerEmail={viewer?.email ?? null} />
      {/* ... existing footer ... */}
    </main>
  );
}
```

(Keep the rest of `Home()` exactly as it is — same JSX, same `nowStamp()` etc. Only the index/viewer fetch and the `DashboardFilter` props change.)

- [ ] **Step 3.3: Update `DashboardFilter` — accept `viewerEmail`, gate bulk delete**

In `components/DashboardFilter.tsx`:

(a) Update `Props`:
```ts
type Props = {
  entries: IndexEntry[];
  viewerEmail: string | null;
};
```

(b) Update the function signature:
```ts
export default function DashboardFilter({ entries, viewerEmail }: Props) {
```

(c) Update `runBulkDelete` — drop password handling:

```ts
function runBulkDelete() {
  setPwdError(null);
  const slugs = Array.from(selected);
  if (slugs.length === 0) return;
  startTransition(async () => {
    try {
      const res = await bulkDeleteTicketsAction(slugs);
      exitSelectMode();
      if (res && typeof res.skipped === "number" && res.skipped > 0) {
        console.warn(`Bulk delete: ${res.deleted} deleted, ${res.skipped} skipped (not owned)`);
      }
    } catch (e) {
      setPwdError((e as Error).message || "Delete failed.");
    }
  });
}
```

(d) Remove the `password` state and `pwdError`/password input from the bottom action bar. Replace the bottom bar (the `selectMode && selected.size > 0` block) with:

```tsx
{selectMode && selected.size > 0 && (
  <div
    className="
      fixed bottom-0 left-0 right-0 z-50 bg-paper-light border-t-[1.5px] border-ink
      shadow-[0_-8px_24px_rgba(21,17,11,0.15)]
    "
  >
    <div className="max-w-[560px] mx-auto px-5 py-3 flex items-center gap-3 flex-wrap">
      <div className="text-[12px] font-mono tracking-wider flex-1">
        <span className="text-saffron">
          DELETE {selected.size} BILL{selected.size !== 1 ? "S" : ""}
        </span>
        <span className="text-ink-faint ml-2">· yours only</span>
      </div>
      <button
        type="button"
        onClick={runBulkDelete}
        disabled={pending}
        className="
          text-[11px] font-mono tracking-wider px-3 py-1.5
          bg-saffron text-paper-light border border-saffron
          hover:bg-paper-light hover:text-saffron transition-colors
          disabled:opacity-40 disabled:cursor-not-allowed
        "
      >
        {pending ? "DELETING…" : `✕ DELETE ${selected.size}`}
      </button>
      <button
        type="button"
        onClick={exitSelectMode}
        disabled={pending}
        className="text-[11px] font-mono tracking-wider text-ink-faint hover:text-ink"
      >
        CANCEL
      </button>
      {pwdError && (
        <div className="w-full text-[11px] text-saffron font-mono tracking-wider">
          {pwdError}
        </div>
      )}
    </div>
  </div>
)}
```

(`pwdError` is kept as a generic "error" line for bulk delete failures. The unused `password` state and its handlers should be deleted from the component — search for `password,` `setPassword,` and the password input JSX block, remove them all.)

(e) Hide the "✕ DELETE BILLS" entry in the filter toolbar when `!viewerEmail`. Replace the existing toggle:

```tsx
{!selectMode ? (
  viewerEmail && (
    <button
      type="button"
      onClick={() => setSelectMode(true)}
      className="text-[10px] font-mono tracking-wider px-2.5 py-1 border border-saffron/50 text-saffron hover:border-saffron transition-colors"
    >
      ✕ DELETE BILLS
    </button>
  )
) : (
  <button
    type="button"
    onClick={exitSelectMode}
    className="text-[10px] font-mono tracking-wider px-2.5 py-1 border border-ink-faint/40 text-ink-faint hover:border-ink hover:text-ink transition-colors"
  >
    CANCEL
  </button>
)}
```

(f) Filter the checkbox visibility per row. Update the `BucketLine` call sites to pass an extra prop, and the `BucketLine` to respect it. Find each call:

```tsx
<BucketLine
  key={e.slug}
  entry={e}
  kind="open"          {/* or "closed" */}
  delayMs={i * 50}
  selectMode={selectMode}
  selected={selected.has(e.slug)}
  onToggle={toggleSelect}
/>
```

Add a new prop `canSelect`:

```tsx
<BucketLine
  key={e.slug}
  entry={e}
  kind="open"
  delayMs={i * 50}
  selectMode={selectMode}
  selected={selected.has(e.slug)}
  onToggle={toggleSelect}
  canSelect={!!viewerEmail && e.payerEmail === viewerEmail}
/>
```

And update `BucketLine`'s signature + render:

```tsx
function BucketLine({
  entry,
  kind,
  delayMs,
  selectMode,
  selected,
  onToggle,
  canSelect,
}: {
  entry: IndexEntry;
  kind: "open" | "closed";
  delayMs: number;
  selectMode: boolean;
  selected: boolean;
  onToggle: (slug: string) => void;
  canSelect: boolean;
}) {
  // ... existing body unchanged until the `innerLine` checkbox span ...
```

Inside `innerLine`, replace the `{selectMode && (<span ...>)}` with:

```tsx
{selectMode && (
  <span
    className={`shrink-0 inline-flex items-center justify-center w-5 h-5 mr-2 border-[1.5px] ${
      !canSelect
        ? "border-ink-faint/30 bg-ink-faint/10"
        : selected
          ? "border-saffron bg-saffron text-paper-light"
          : "border-ink-faint"
    }`}
    aria-hidden
  >
    {!canSelect ? "·" : selected ? "✓" : ""}
  </span>
)}
```

And gate the click handler — only enable `onToggle` if `canSelect`. Update the outer-button block:

```tsx
{selectMode ? (
  canSelect ? (
    <button
      type="button"
      onClick={() => onToggle(entry.slug)}
      className="block w-full text-left"
      aria-pressed={selected}
    >
      {innerLine}
    </button>
  ) : (
    <div className="block w-full text-left opacity-60 cursor-not-allowed" aria-disabled>
      {innerLine}
    </div>
  )
) : (
  <Link href={`/t/${entry.slug}`} className="block">
    {innerLine}
  </Link>
)}
```

Also update `selectAllVisible` to only pick rows you can delete:

```ts
function selectAllVisible() {
  const all = new Set<string>();
  for (const e of filtered) {
    if (viewerEmail && e.payerEmail === viewerEmail) all.add(e.slug);
  }
  setSelected(all);
}
```

- [ ] **Step 3.4: Remove `BULK_DELETE_PASSWORD` from `.env.example`**

In `.env.example`, delete any line mentioning `BULK_DELETE_PASSWORD` (search the file — it isn't present in the current `.env.example` excerpt above, but verify with `grep BULK_DELETE_PASSWORD .env.example` and remove if found).

- [ ] **Step 3.5: Build + smoke**

Run: `npm run build`
Expected: clean.

Smoke:
1. Signed out → home page → no "✕ DELETE BILLS" toggle.
2. Sign in → "✕ DELETE BILLS" appears.
3. Click → checkboxes only on bills where you're payer (others show a `·` placeholder, can't be ticked).
4. Tick one, hit "✕ DELETE N" — no password prompt, bill deletes.

- [ ] **Step 3.6: Commit**

```bash
git add lib/tickets-index.ts components/DashboardFilter.tsx app/page.tsx .env.example
git commit -m "$(cat <<'EOF'
Gate bulk delete by viewer = payer; drop password gate

IndexEntry gains payerEmail (lazy backfill on next mutation). DashboardFilter
hides bulk-select for signed-out viewers, shows checkboxes only on bills you
own. BULK_DELETE_PASSWORD env var goes away.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Ticket detail — gate UI per viewer role, rebuild AddMeButton

**Files:**
- Modify: `app/t/[slug]/page.tsx`
- Modify: `components/ParticipantRow.tsx`
- Modify: `components/CloseTicketButton.tsx`
- Modify: `components/AddMeButton.tsx`

- [ ] **Step 4.1: Resolve viewer in the ticket page, pass props down**

In `app/t/[slug]/page.tsx`:

```tsx
import { getViewer, isPayer as viewerIsPayer } from "@/lib/auth";

// inside TicketPage, after `const ticket = await getTicket(slug); if (!ticket) notFound();`
const viewer = await getViewer();
const isPayer = viewerIsPayer(viewer, ticket.payer.email);
```

Pass to children:

```tsx
<ParticipantRow
  key={p.id}
  slug={slug}
  ticketUrl={ticketUrl}
  ticketTitle={ticket.title}
  payerName={effectivePayer.name}
  participant={{
    id: p.id,
    name: p.name,
    email: p.email,
    whatsapp: p.whatsapp,
    amountOwed: p.amountOwed,
    status: p.status,
  }}
  ticketOpen={ticket.status === "open"}
  currency={ticket.currency}
  lastRemindedAt={lastReminderByParticipant.get(p.id) ?? null}
  viewerEmail={viewer?.email ?? null}
  isPayer={isPayer}
/>
```

For `CloseTicketButton`:

```tsx
<CloseTicketButton slug={slug} status={ticket.status} isPayer={isPayer} />
```

For `AddMeButton` (only the props change; rendered block stays inside the existing `{ticket.status === "open" && ...}` guard):

```tsx
<AddMeButton
  slug={slug}
  suggestedAmount={suggestedAmount}
  currency={ticket.currency}
  viewer={viewer ? { email: viewer.email, name: viewer.person?.name ?? viewer.email.split("@")[0] } : null}
  alreadyOnTicket={
    !!viewer && ticket.participants.some((p) => (p.email ?? "").toLowerCase() === viewer.email)
  }
/>
```

- [ ] **Step 4.2: Update `ParticipantRow` — viewerEmail + isPayer props, gate buttons**

In `components/ParticipantRow.tsx`, update `Props`:

```ts
type Props = {
  slug: string;
  ticketUrl: string;
  ticketTitle: string;
  payerName: string;
  participant: {
    id: string;
    name: string;
    email: string | null;
    whatsapp: string | null;
    amountOwed: number;
    status: Status;
  };
  ticketOpen: boolean;
  currency: string;
  lastRemindedAt: Date | null;
  viewerEmail: string | null;
  isPayer: boolean;
};
```

Update function signature to destructure the new props.

Then derive role flags inside the component (just below `const waNumber = …`):

```ts
const isMyRow =
  !!viewerEmail && !!participant.email && viewerEmail === participant.email.toLowerCase();
const canSelfMark = isMyRow;
const canPayerAct = isPayer;
```

Replace the action-buttons block (the `{!settled && ticketOpen && (...)}` JSX) with role-gated rendering:

```tsx
{!settled && ticketOpen && (canSelfMark || canPayerAct) && (
  <div className="flex flex-wrap items-center gap-2 mt-3 pl-0.5">
    {canSelfMark && (
      <Button
        size="sm"
        onClick={() => run("self_marked", () => markPaidAction(slug, participant.id))}
        disabled={pending || status === "self_marked"}
      >
        {status === "self_marked" ? "Sent" : "I paid"}
      </Button>
    )}
    {canPayerAct && (
      <Button
        size="sm"
        variant="outline"
        onClick={() => run("confirmed", () => confirmPaidAction(slug, participant.id))}
        disabled={pending}
      >
        Confirm
      </Button>
    )}

    {(canPayerAct || canSelfMark) && (
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="btn btn-ghost btn-sm"
          aria-label="More"
        >
          ⋯
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 w-56 bg-paper-light border border-ink z-10 text-[11px] uppercase tracking-wider shadow-lg">
            {canPayerAct && (
              <MenuItem
                disabled={!waNumber}
                onClick={() => {
                  setMenuOpen(false);
                  openWhatsapp();
                }}
              >
                {waNumber ? "Nudge on WhatsApp" : "No WhatsApp on file"}
              </MenuItem>
            )}
            {canPayerAct && (
              <MenuItem
                disabled={!participant.email}
                onClick={() => {
                  setMenuOpen(false);
                  run(null, () => remindEmailAction(slug, participant.id));
                }}
              >
                {participant.email ? "Email reminder" : "No email on file"}
              </MenuItem>
            )}
            {canPayerAct && (
              <MenuItem
                onClick={() => {
                  setMenuOpen(false);
                  run("cash", () => markCashAction(slug, participant.id));
                }}
              >
                Paid in cash
              </MenuItem>
            )}
            {(canPayerAct || canSelfMark) && (
              <MenuItem
                onClick={() => {
                  setMenuOpen(false);
                  setHidden(true);
                  run(null, () => removeParticipantAction(slug, participant.id));
                }}
              >
                Remove entry
              </MenuItem>
            )}
            {canPayerAct && lastRemindedAt && (
              <div className="px-3 py-2 text-[10px] text-ink-faint normal-case tracking-normal border-t border-ink-faint/30">
                last nudged {relTime(lastRemindedAt)}{recentlyReminded ? " (recent)" : ""}
              </div>
            )}
          </div>
        )}
      </div>
    )}
  </div>
)}
```

Replace the settled-row reopen button — gate to `canSelfMark || canPayerAct`:

```tsx
{settled && ticketOpen && (canSelfMark || canPayerAct) && (
  <div className="mt-2">
    <button
      type="button"
      className="eyebrow ink-link"
      onClick={() => run("pending", () => reopenParticipantAction(slug, participant.id))}
    >
      Reopen
    </button>
  </div>
)}
```

- [ ] **Step 4.3: Update `CloseTicketButton` — hide unless payer**

Replace the component:

```tsx
"use client";

import { useTransition } from "react";
import { Button } from "./ui/button";
import {
  closeTicketAction,
  reopenTicketAction,
  deleteTicketAction,
} from "@/lib/actions/tickets";

export function CloseTicketButton({
  slug,
  status,
  isPayer,
}: {
  slug: string;
  status: "open" | "closed";
  isPayer: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [deletePending, startDelete] = useTransition();

  if (!isPayer) return null;

  return (
    <div className="flex items-center gap-3">
      <Button
        variant={status === "open" ? "outline" : "default"}
        size="sm"
        onClick={() =>
          startTransition(async () => {
            if (status === "open") await closeTicketAction(slug);
            else await reopenTicketAction(slug);
          })
        }
        disabled={pending || deletePending}
      >
        {pending ? "Saving…" : status === "open" ? "Tear off & close" : "Reopen ticket"}
      </Button>
      <button
        type="button"
        className="eyebrow text-saffron hover:underline disabled:opacity-50"
        disabled={pending || deletePending}
        onClick={() => {
          if (
            !confirm(
              "Permanently delete this bill? This removes it from the channel index and can't be undone.",
            )
          )
            return;
          startDelete(async () => {
            await deleteTicketAction(slug);
          });
        }}
      >
        {deletePending ? "Deleting…" : "✕ Delete bill"}
      </button>
    </div>
  );
}
```

- [ ] **Step 4.4: Rebuild `AddMeButton` — one-tap for signed-in, sign-in prompt otherwise**

Replace the entire `components/AddMeButton.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { addParticipantAction } from "@/lib/actions/tickets";

type Props = {
  slug: string;
  suggestedAmount: number;
  currency: string;
  viewer: { email: string; name: string } | null;
  alreadyOnTicket: boolean;
};

export function AddMeButton({ slug, suggestedAmount, currency, viewer, alreadyOnTicket }: Props) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(suggestedAmount));
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!viewer) {
    return (
      <div className="text-center">
        <Link
          href={`/login?next=${encodeURIComponent(`/t/${slug}`)}`}
          className="btn btn-outline btn-sm"
        >
          Sign in to add yourself
        </Link>
      </div>
    );
  }

  if (alreadyOnTicket) return null;

  function submit() {
    setErr(null);
    const amt = Number(amount);
    if (!amt || amt < 0) return setErr("Enter a valid amount.");
    startTransition(async () => {
      try {
        await addParticipantAction(slug, amt);
        setOpen(false);
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  if (!open) {
    return (
      <div className="text-center">
        <button onClick={() => setOpen(true)} className="btn btn-outline btn-sm">
          + Add me (joined late)
        </button>
      </div>
    );
  }

  return (
    <div className="border-2 border-dashed border-ink-faint/60 p-5 space-y-4 animate-fade-up">
      <div className="flex items-center justify-between">
        <div className="eyebrow text-saffron">+ JOINING LATE</div>
        <button
          type="button"
          className="eyebrow ink-link"
          onClick={() => setOpen(false)}
          disabled={pending}
        >
          CANCEL
        </button>
      </div>

      <div className="text-[13px] text-ink-soft">
        Adding <span className="display-italic text-[18px]">{viewer.name}</span> ·{" "}
        <span className="text-ink-faint">{viewer.email}</span>
      </div>

      <div className="space-y-2">
        <Label>
          YOUR SHARE · suggested {currency} {suggestedAmount.toLocaleString("en-PK")}
        </Label>
        <Input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>

      {err && <div className="text-[12px] text-saffron italic">{err}</div>}
      <Button onClick={submit} disabled={pending}>
        {pending ? "Adding…" : "Add me to the ticket"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 4.5: Build + smoke**

Run: `npm run build`
Expected: clean.

Smoke:
1. Signed out → ticket page → buttons absent on rows; "Sign in to add yourself" link below participants; CloseTicketButton hidden.
2. Sign in as payer → Confirm/Cash/Remind/⋯ on every row; Close + Delete visible.
3. Sign in as a participant whose email is on the ticket → "I paid" on your row only; nothing on others'.
4. Sign in as a bystander → no action buttons anywhere on the ticket.
5. "+ Add me" as a signed-in viewer NOT on the ticket → one-tap adds you. Reopen page; row appears.

- [ ] **Step 4.6: Commit**

```bash
git add app/t components/ParticipantRow.tsx components/CloseTicketButton.tsx components/AddMeButton.tsx
git commit -m "$(cat <<'EOF'
Branch ticket-detail UI on viewer role

Pass viewerEmail + isPayer into ParticipantRow / CloseTicketButton /
AddMeButton from the server. Self-mark only on your own row; payer-only
actions hidden for non-payers; close + delete hidden unless payer.
AddMeButton collapses to a one-tap "+ Add me" for signed-in viewers, falls
back to a "Sign in to add yourself" link when logged out.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: New-ticket form — fix payer to viewer, delete PayerPicker

**Files:**
- Modify: `app/tickets/new/page.tsx`
- Modify: `app/tickets/new/NewTicketForm.tsx`
- Delete: `components/PayerPicker.tsx`

- [ ] **Step 5.1: Gate the page + pass viewer's Person**

Replace `app/tickets/new/page.tsx`:

```tsx
import Link from "next/link";
import { NewTicketForm } from "./NewTicketForm";
import { getRoster, claimAccountByEmail } from "@/lib/store-roster";
import { requireViewer } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function NewTicketPage({
  searchParams,
}: {
  searchParams: Promise<{ title?: string; total?: string; from?: string }>;
}) {
  const viewer = await requireViewer("/tickets/new");
  // Ensure the viewer has a Person row (covers the case where login created
  // an entry but the user later removed it).
  const me = viewer.person ?? (await claimAccountByEmail(viewer.email));
  const roster = await getRoster();
  const sp = await searchParams;
  const fromSlack = sp.from === "slack";
  return (
    <main className="max-w-[560px] mx-auto px-5 pt-8 pb-16 animate-print">
      <div className="flex items-center justify-between">
        <Link href="/" className="eyebrow ink-link">
          ← BACK TO COUNTER
        </Link>
        <Link href="/people" className="eyebrow ink-link">
          MANAGE ROSTER →
        </Link>
      </div>
      <header className="text-center mt-8 mb-6">
        <div className="eyebrow">
          {fromSlack ? "FROM SLACK · FINISH IT UP" : "NEW ORDER · DRAFT"}
        </div>
        <h1 className="display-italic text-[56px] mt-3 leading-[0.9]">
          {fromSlack ? "Finish your ticket." : "Punch a ticket."}
        </h1>
        <p className="text-ink-soft text-[14px] mt-3 max-w-[420px] mx-auto">
          {fromSlack
            ? "Title and total already filled in from Slack. Just pick the crew."
            : "Fill it once, share once — the rest settle up on their own."}
        </p>
      </header>
      <div className="divider-dots mb-8" />
      <NewTicketForm
        roster={roster}
        payer={me}
        initialTitle={sp.title ?? ""}
        initialTotal={sp.total ?? ""}
      />
    </main>
  );
}
```

- [ ] **Step 5.2: Rewrite `NewTicketForm` — fixed payer**

Replace `app/tickets/new/NewTicketForm.tsx`:

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PersonPicker } from "@/components/PersonPicker";
import { createTicketAction } from "@/lib/actions/tickets";
import { splitEvenly } from "@/lib/shares";
import type { Person } from "@/lib/store-roster";

export function NewTicketForm({
  roster: initialRoster,
  payer,
  initialTitle = "",
  initialTotal = "",
}: {
  roster: Person[];
  payer: Person;
  initialTitle?: string;
  initialTotal?: string;
}) {
  const [roster, setRoster] = useState(initialRoster);

  const [title, setTitle] = useState(initialTitle);
  const [total, setTotal] = useState(initialTotal);
  const [notes, setNotes] = useState("");
  const [splitMode, setSplitMode] = useState<"even" | "custom">("even");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const totalNum = Math.round(Number(total) || 0);
  const selected = useMemo(
    () => selectedIds.map((id) => roster.find((p) => p.id === id)).filter((x): x is Person => !!x),
    [selectedIds, roster],
  );
  const evenShares =
    splitMode === "even" && totalNum > 0 && selected.length > 0
      ? splitEvenly(totalNum, selected.length)
      : null;

  function togglePerson(id: string) {
    if (id === payer.id) return; // never add the payer to participants
    setSelectedIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function onPersonAdded(p: Person) {
    setRoster((r) => (r.some((x) => x.id === p.id) ? r : [...r, p]));
    setSelectedIds((s) => (s.includes(p.id) ? s : [...s, p.id]));
  }

  function submit() {
    setError(null);
    if (!title.trim()) return setError("What did you eat? Give it a title.");
    if (!totalNum) return setError("Bill total needs a number.");
    if (selected.length === 0) return setError("Pick at least one person.");

    const participants = selected.map((p, i) => ({
      name: p.name,
      email: p.email ?? undefined,
      whatsapp: p.whatsapp ?? undefined,
      amount:
        splitMode === "custom"
          ? Number(customAmounts[p.id] ?? "0") || 0
          : evenShares
            ? evenShares[i]
            : undefined,
    }));

    startTransition(async () => {
      try {
        await createTicketAction({
          title: title.trim(),
          totalAmount: totalNum,
          notes: notes.trim() || undefined,
          payer: {
            name: payer.name,
            email: payer.email ?? undefined,
            whatsapp: payer.whatsapp ?? undefined,
            walletNumber: payer.walletNumber ?? undefined,
            walletApps: payer.walletApps ?? [],
            iban: payer.iban ?? undefined,
            accountTitle: payer.accountTitle ?? undefined,
            acceptsCash: payer.acceptsCash,
          },
          participants,
          splitMode,
        });
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  const payerHasMethod = payer.walletNumber || payer.iban || payer.acceptsCash;

  return (
    <div className="space-y-10 stagger">
      {/* PAYER (you) */}
      <section>
        <div className="eyebrow mb-4 text-saffron">§ 01 · WHO PAID</div>
        <div className="line-item py-3 border-y-[1.5px] border-ink">
          <span className="display-italic text-[22px] text-saffron">{payer.name}</span>
          <span className="leader" />
          <span className="eyebrow text-ink-faint">YOU</span>
        </div>
        {!payerHasMethod ? (
          <div className="mt-4 text-[12px] text-saffron italic">
            Heads up — you have no payment methods saved.{" "}
            <Link href="/people" className="ink-link">
              Add them in your profile →
            </Link>
          </div>
        ) : (
          <div className="mt-4 text-[12px] text-ink-soft">
            Payment via{" "}
            {[
              payer.walletNumber && `Mobile (${payer.walletApps.length} apps)`,
              payer.iban && "Bank",
              payer.acceptsCash && "Cash",
            ]
              .filter(Boolean)
              .join(" · ")}{" "}
            <Link href="/people" className="ink-link ml-1">
              edit →
            </Link>
          </div>
        )}
      </section>

      <div className="divider-dots" />

      {/* THE LUNCH */}
      <section>
        <div className="eyebrow mb-4 text-saffron">§ 02 · THE LUNCH</div>
        <div className="space-y-6">
          <Pair label="WHAT'D YOU EAT? *" value={title} onChange={setTitle} placeholder="Karahi Friday at Bundu Khan" />
          <Pair label="TOTAL (PKR) *" value={total} onChange={setTotal} placeholder="3500" type="number" />
          <Pair label="NOTES (OPTIONAL)" value={notes} onChange={setNotes} placeholder="Tip included; Foodpanda delivery" />
        </div>
      </section>

      <div className="divider-dots" />

      {/* PARTICIPANTS */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="eyebrow text-saffron">§ 03 · WHO ELSE JOINED</div>
          <div className="inline-flex border-[1.5px] border-ink text-[10px] font-mono">
            <button
              type="button"
              onClick={() => setSplitMode("even")}
              className={`px-3 py-1 uppercase tracking-wide transition ${
                splitMode === "even"
                  ? "bg-ink text-paper-light"
                  : "hover:bg-paper-deep"
              }`}
            >
              Even
            </button>
            <button
              type="button"
              onClick={() => setSplitMode("custom")}
              className={`px-3 py-1 uppercase tracking-wide transition border-l-[1.5px] border-ink ${
                splitMode === "custom"
                  ? "bg-ink text-paper-light"
                  : "hover:bg-paper-deep"
              }`}
            >
              Custom
            </button>
          </div>
        </div>

        <PersonPicker
          roster={roster.filter((p) => p.id !== payer.id)}
          selectedIds={selectedIds}
          onToggle={togglePerson}
          onAdded={onPersonAdded}
        />

        {selected.length > 0 && (
          <div className="mt-6 space-y-3 animate-fade-up">
            <div className="eyebrow">
              {selected.length} SELECTED ·{" "}
              {splitMode === "even" && totalNum > 0 ? (
                <span>~₨ {Math.floor(totalNum / selected.length).toLocaleString("en-PK")} each</span>
              ) : (
                <span>set shares below</span>
              )}
            </div>

            <div className="space-y-2">
              {selected.map((p, i) => (
                <div key={p.id} className="line-item">
                  <span className="display-italic text-[19px]">{p.name}</span>
                  <span className="leader" />
                  {splitMode === "custom" ? (
                    <div className="w-28">
                      <Input
                        type="number"
                        placeholder="₨"
                        value={customAmounts[p.id] ?? ""}
                        onChange={(e) =>
                          setCustomAmounts((m) => ({ ...m, [p.id]: e.target.value }))
                        }
                        className="text-right"
                      />
                    </div>
                  ) : (
                    <span className="display text-[20px] num">
                      ₨ {(evenShares ? evenShares[i] : 0).toLocaleString("en-PK")}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 eyebrow">
          <Link href="/people" className="ink-link">
            ⋯ MANAGE THE FULL ROSTER →
          </Link>
        </div>
      </section>

      <div className="divider-double" />

      {error && (
        <div className="text-[13px] text-saffron border-l-2 border-saffron pl-3 italic">
          {error}
        </div>
      )}

      <div className="flex flex-col items-center gap-4 pt-2">
        <Button onClick={submit} disabled={pending} size="lg">
          {pending ? "Printing…" : "↓ Print this ticket"}
        </Button>
        <div className="eyebrow text-ink-faint">NO CONFIRMATIONS · INSTANT</div>
      </div>
    </div>
  );
}

function Pair({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} type={type} />
    </div>
  );
}
```

- [ ] **Step 5.3: Delete `components/PayerPicker.tsx`**

Run: `rm /home/huzz/clones/lunch-split/components/PayerPicker.tsx`

- [ ] **Step 5.4: Build + smoke**

Run: `npm run build`
Expected: clean.

Smoke:
1. Signed out → visit `/tickets/new` → bounced to `/login?next=/tickets/new`.
2. Sign in → land back on `/tickets/new` → "WHO PAID" shows your name + "YOU" tag, no picker.
3. Create a ticket → check the ticket's "SERVED BY" displays your name; viewing the same ticket while signed in as that account shows payer-only actions.

- [ ] **Step 5.5: Commit**

```bash
git add app/tickets components/
git commit -m "$(cat <<'EOF'
Fix new-ticket payer to the viewer; drop PayerPicker

/tickets/new is login-required. The form no longer asks 'who paid' — that's
you. PayerPicker.tsx and the localStorage 'me-id' hack are gone.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Roster page — split into "YOU" (editable) and "THE CREW" (read-only)

**Files:**
- Modify: `app/people/page.tsx`
- Modify: `app/people/RosterEditor.tsx`

- [ ] **Step 6.1: Pass viewer email to the editor**

Replace `app/people/page.tsx`:

```tsx
import Link from "next/link";
import { getRoster } from "@/lib/store-roster";
import { getViewer } from "@/lib/auth";
import { RosterEditor } from "./RosterEditor";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const [roster, viewer] = await Promise.all([getRoster(), getViewer()]);
  return (
    <main className="max-w-[560px] mx-auto px-5 pt-8 pb-16 animate-print">
      <Link href="/" className="eyebrow ink-link">
        ← BACK
      </Link>
      <header className="text-center mt-8 mb-6">
        <div className="eyebrow">THE ROSTER</div>
        <h1 className="display-italic text-[56px] mt-3 leading-[0.9]">The lunch crew.</h1>
        <p className="text-ink-soft text-[14px] mt-3 max-w-[400px] mx-auto">
          One shared list. You edit your own card; anyone signed in can add new names.
        </p>
      </header>
      <div className="divider-dots mb-8" />
      <RosterEditor initial={roster} viewerEmail={viewer?.email ?? null} />
    </main>
  );
}
```

- [ ] **Step 6.2: Two-section roster editor**

In `app/people/RosterEditor.tsx`:

(a) Update prop type + signature:

```ts
export function RosterEditor({
  initial,
  viewerEmail,
}: {
  initial: Person[];
  viewerEmail: string | null;
}) {
```

(b) After the existing `useState` / cache hooks, add helpers:

```ts
const myCard = viewerEmail
  ? roster.find((p) => (p.email ?? "").toLowerCase() === viewerEmail) ?? null
  : null;
const others = roster.filter((p) => p !== myCard);
```

(c) Replace the existing render (everything inside the returned JSX) with:

```tsx
return (
  <div className="space-y-10">
    {!viewerEmail && (
      <div className="border border-dashed border-saffron/50 p-4 text-center text-[13px] text-ink-soft italic">
        Sign in to edit your card.{" "}
        <a href="/login" className="ink-link">
          Sign in →
        </a>
      </div>
    )}

    {/* YOU */}
    {viewerEmail && (
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="eyebrow text-saffron">YOU</div>
          {!myCard && editingId !== "new-self" && (
            <Button size="sm" onClick={() => { setEditingId("new-self"); setForm({ ...emptyForm, email: viewerEmail }); setErr(null); }}>
              Fill out your card
            </Button>
          )}
        </div>
        {editingId === "new-self" ? (
          <FormCard
            title="YOUR CARD"
            form={form}
            setForm={setForm}
            err={err}
            pending={pending}
            onSave={save}
            onCancel={cancel}
          />
        ) : myCard ? (
          editingId === myCard.id ? (
            <FormCard
              title={`YOUR CARD · ${myCard.name.toUpperCase()}`}
              form={form}
              setForm={setForm}
              err={err}
              pending={pending}
              onSave={save}
              onCancel={cancel}
              onDelete={() => remove(myCard.id)}
            />
          ) : (
            <PersonLine person={myCard} editable onEdit={() => startEdit(myCard)} highlight />
          )
        ) : (
          <div className="text-center text-[13px] text-ink-soft italic py-6 border border-dashed border-ink-faint/50">
            No card yet for {viewerEmail}. Fill yours so others can pay you.
          </div>
        )}
      </section>
    )}

    {/* THE CREW */}
    <section>
      <div className="flex items-center justify-between mb-4">
        <div className="eyebrow">{others.length} ON THE CREW</div>
        {viewerEmail && editingId !== "new" && (
          <Button size="sm" variant="outline" onClick={startNew}>
            + Add name
          </Button>
        )}
      </div>

      {editingId === "new" && (
        <FormCard
          title="NEW PERSON"
          form={form}
          setForm={setForm}
          err={err}
          pending={pending}
          onSave={save}
          onCancel={cancel}
        />
      )}

      {others.length === 0 && editingId !== "new" && (
        <div className="text-center py-10 text-ink-soft italic text-[14px] border border-dashed border-ink-faint/50">
          Empty roster. Add a name above.
        </div>
      )}

      <div className="space-y-3">
        {others.map((p) => (
          <PersonLine key={p.id} person={p} />
        ))}
      </div>
    </section>
  </div>
);
```

(d) Inside the same file, replace the existing inline read-only row JSX with a small `PersonLine` helper. Add this near the bottom (alongside `FormCard` and `F`):

```tsx
function PersonLine({
  person,
  editable = false,
  onEdit,
  highlight = false,
}: {
  person: Person;
  editable?: boolean;
  onEdit?: () => void;
  highlight?: boolean;
}) {
  return (
    <div className={`line-item py-2 group ${highlight ? "border-l-2 border-saffron pl-2" : ""}`}>
      <div className="min-w-0">
        <div className="display-italic text-[22px] truncate">{person.name}</div>
        <div className="text-[12px] text-ink-faint truncate mt-0.5">
          {[person.whatsapp, person.email].filter(Boolean).join(" · ") || "no contact"}
          {(person.walletNumber || person.iban) && (
            <span className="ml-2 text-moss">· receives payments</span>
          )}
        </div>
      </div>
      <span className="leader" />
      {editable ? (
        <button type="button" onClick={onEdit} className="eyebrow ink-link shrink-0">
          EDIT
        </button>
      ) : (
        <span className="eyebrow text-ink-faint shrink-0">VIEW ONLY</span>
      )}
    </div>
  );
}
```

(e) Tweak `save()` so the "new-self" mode also flips `editingId` back to `null` correctly. Modify just the `setEditingId(null)` line at the end of the existing `save()`'s success branch to behave correctly for both "new" and "new-self" — the existing logic already does this, so no change is needed beyond also adding the explicit reset of `editingId` after the new-self save (the existing code already calls `setEditingId(null)`).

- [ ] **Step 6.3: Build + smoke**

Run: `npm run build`
Expected: clean.

Smoke:
1. Signed out → `/people` → "Sign in to edit your card" notice; everyone in "THE CREW" section is view-only; "+ Add name" button hidden.
2. Sign in (fresh email not in roster) → "YOU" section shows "Fill out your card" button.
3. Click → form prefilled with your email → save → row appears in "YOU" with EDIT.
4. Anyone in "THE CREW" still appears view-only (no EDIT).
5. "+ Add name" works for any signed-in viewer.

- [ ] **Step 6.4: Commit**

```bash
git add app/people/
git commit -m "$(cat <<'EOF'
Split /people into 'You' (editable) and 'Crew' (view-only)

Your card lives in its own section, editable only by you. Everyone else is
read-only. Signed-out viewers see the whole crew as view-only with a
sign-in nudge; '+ Add name' is gated to signed-in viewers.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Home page footer copy

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 7.1: Swap the footer eyebrow**

In `app/page.tsx`, locate the footer block:

```tsx
<div className="eyebrow">
  NO ACCOUNTS · <span className="text-saffron">NO SIGN-IN</span> · BUILT FOR THE CREW
</div>
```

Replace with:

```tsx
<div className="eyebrow">
  ACCOUNTS · <span className="text-saffron">YOURS ALONE</span> · BUILT FOR THE CREW
</div>
```

- [ ] **Step 7.2: Build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 7.3: Commit**

```bash
git add app/page.tsx
git commit -m "$(cat <<'EOF'
Drop 'no accounts' footer line; we have accounts now

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Full smoke matrix from spec section 8

No new code. Walk all 13 scenarios manually with `npm run dev`, with at least three test emails handy (call them A, B, C). A creates a ticket and is the payer; B is added as a participant with their email; C is added name-only.

- [ ] **Step 8.1: Run `npm run build` one more time — clean.**

- [ ] **Step 8.2: Walk the matrix:**

| # | Scenario | Pass criterion |
|---|---|---|
| 1 | Fresh visitor → home page | Dashboard visible; no action buttons; footer no longer claims "no accounts" |
| 2 | Sign in with brand-new email | Lands on home; SessionBar shows local-part; `/people` shows your card editable |
| 3 | Sign in with an email already in roster (no `hasAccount` yet) | Linked to existing Person; payment methods preserved; `hasAccount` flips true (verify via Redis or by checking the Person's data persists across sessions) |
| 4 | Signed in → create ticket | Payer fixed to you, not pickable; ticket created with `payer.email = you` |
| 5 | Signed-out viewer on `/t/<slug>` | Full ticket visible; only "Sign in →" link below participants |
| 6 | Signed in as a participant on someone else's ticket | "I paid" only on your row; no Confirm/Cash anywhere |
| 7 | Signed in as the payer | Confirm / Cash / Remind / ⋯ Remove on every row; Close + Delete visible |
| 8 | Signed in as bystander (neither payer nor participant) | No action buttons anywhere on the ticket |
| 9 | Hand-rolled action call (DevTools console) as wrong role | Server returns `not_authorized`; no state change |
| 10 | Home page bulk-delete as a payer | Checkboxes only on your own bills; password input gone |
| 11 | Edit roster card that isn't yours | UI doesn't expose edit; direct `upsertPersonAction` for someone else's id throws |
| 12 | Sign out → reload → action attempt | Buttons gone; stale-tab action fails with clear error |
| 13 | Legacy ticket (pre-auth, `payer.email = null`) | Renders; participants self-mark works; payer-only buttons absent from everyone |

- [ ] **Step 8.3: Final commit if any small fixes surface during smoke**

```bash
git add -p   # stage relevant hunks only
git commit -m "$(cat <<'EOF'
Polish from smoke-matrix walkthrough

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

(If no fixes needed, skip this step.)

---

## Self-review summary

- **Spec coverage:** every spec §5 file maps to a task. Spec §6 edge cases — email normalisation in `setSession`/`claimAccountByEmail`/`upsertPersonAction`, lazy-recreate of `Person` in `getViewer`, add-me race check in `addParticipantAction`. All covered.
- **Placeholder scan:** no TBDs; every code block is complete; commands are exact.
- **Type consistency:** `Viewer` shape (`{ email, person }`), `isPayer(viewer, payerEmail)`, `isSelf(viewer, email)`, `ParticipantRow` `viewerEmail+isPayer`, `AddMeButton` `viewer+alreadyOnTicket`, `DashboardFilter` `viewerEmail`, `BucketLine` `canSelect`, `IndexEntry.payerEmail` — all stable across tasks.
