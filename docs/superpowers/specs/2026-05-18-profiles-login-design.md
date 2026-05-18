# Profiles & Login — Design

**Date:** 2026-05-18
**Status:** Approved, awaiting implementation plan
**Scope:** Add email-only logins to Lunch Split. View and available actions
change based on the signed-in viewer's relationship to the ticket. No
passwords, no inbox round-trip.

---

## 1. Goals

- Signed-in users can create tickets and act on their own row ("I paid").
- The ticket payer is the only person who can confirm payments, mark cash,
  send reminders, remove participants, close, or delete a ticket.
- Existing share-a-link flow keeps working: anyone with a `/t/<slug>` URL
  can see the ticket without signing in. Sign-in is only required to *act*.
- Profiles & payment methods are now per-user — your card on `/people` is
  yours alone to edit.

## 2. Non-goals

- No password support.
- No email verification (magic-link). Cookie holds a self-declared email.
  Architecture accommodates a magic-link upgrade later without restructuring.
- No admin / moderator role.
- No per-user analytics, audit log, or activity feed.
- No new test framework. Verification is type-check + manual smoke matrix.

## 3. Identity model

The existing `Person` in the roster *is* the account. There is no separate
users table.

A `Person` gains one new optional field:

```ts
hasAccount: boolean;  // flipped true on first successful sign-in for this email
```

All other `Person` fields stay as-is (`name`, `email`, `whatsapp`,
`walletNumber`, `walletApps`, `iban`, `accountTitle`, `acceptsCash`).

**Login flow:**

1. User opens `/login` and types their email.
2. Server normalises `email.trim().toLowerCase()`.
3. Roster lookup by case-insensitive email:
   - **Found** → set `hasAccount = true` on that `Person`; set cookie.
   - **Not found** → create a fresh `Person` with `name = email.split("@")[0]`,
     `hasAccount = true`; set cookie.
4. Redirect to the `?next=` URL if present and same-origin, else `/`.

**Session = single HttpOnly cookie:**

- Name: `ls_session`
- Value: the viewer's email (lowercased)
- `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in production (off locally
  for HTTP dev), `Max-Age` = 30 days, rolling refresh on each request that
  reads the cookie.
- No server-side session store — the cookie *is* the session.

**Server helper — `lib/auth.ts`:**

```ts
export async function getViewer(): Promise<{ email: string; person: Person | null } | null>
export async function requireViewer(): Promise<{ email: string; person: Person }>
export async function setSession(email: string): Promise<void>
export async function clearSession(): Promise<void>
```

`requireViewer()` throws (or, on routes, `redirect("/login?next=…")`) if no
cookie. Lazy-recreates the `Person` from the cookie email if it was deleted
while signed in.

**Three viewer-to-ticket relationships** the rest of the design hangs on:

- **payer** — `viewer.email === ticket.payer.email`
- **participant** — `viewer.email === some participant.email` on this ticket
- **bystander** — neither

## 4. Route & action permission map

### Routes

| Route | Today | After |
|---|---|---|
| `/` (home) | Public | Public read. Bulk-select checkbox only on bills where viewer is payer. |
| `/t/[slug]` | Public | Public read. Action buttons branch on viewer role. |
| `/tickets/new` | Public | Login required. Redirect to `/login?next=/tickets/new`. |
| `/people` | Public, fully editable | Public read; only the viewer's own card editable. "+ Add person" still works for any signed-in viewer. |
| `/setup` | Public | Public (Slack docs only). |
| `/login` | n/a | **New.** Single email field → cookie → redirect. |
| `/api/auth/logout` | n/a | **New.** POST clears cookie, redirects to `/`. |

### Server actions

| Action | Allowed for |
|---|---|
| `createTicketAction` | any signed-in viewer; forces `payer.email = viewer.email` |
| `addParticipantAction` ("Add me") | signed-in viewer adds **themselves** only (name/email/whatsapp pulled from their `Person`) |
| `markPaidAction` | signed-in viewer matching `participant.email` |
| `confirmPaidAction` | payer only |
| `markCashAction` | payer only |
| `reopenParticipantAction` | payer, OR the participant on their own row |
| `remindEmailAction` | payer only |
| `logWhatsappReminderAction` | payer only |
| `removeParticipantAction` | payer, OR the participant on their own row |
| `updateParticipantAmountAction` | payer only |
| `closeTicketAction` / `reopenTicketAction` | payer only |
| `deleteTicketAction` | payer only |
| `bulkDeleteTicketsAction` | each slug filtered to those where viewer is payer; the `password` param and `BULK_DELETE_PASSWORD` env var are removed |
| `upsertPersonAction` | new entry: any signed-in viewer. Editing existing entry: only if `viewer.email === person.email` |
| `removePersonAction` | only if `viewer.email === person.email` |
| `listPeopleAction` | public (no sensitive payload) |

**Cross-cutting rules:**

1. Every gated action runs its check **server-side** in the action body —
   never trust the client. Throws a string error (e.g. `"not_authorized"`,
   `"not_signed_in"`, `"email_already_on_ticket"`) which the existing client
   `setErr` / `catch` path already renders.
2. UI hides buttons the viewer can't use, but the server enforces — a stale
   page or a hand-rolled `fetch` can't slip through.

## 5. UI changes per file

### New files

| File | Purpose |
|---|---|
| `lib/auth.ts` | `getViewer`, `requireViewer`, `setSession`, `clearSession` |
| `app/login/page.tsx` | Email field + Sign in button (server action). Receipt-aesthetic styling. |
| `app/api/auth/logout/route.ts` | POST handler — clears cookie, redirects `/`. |
| `components/SessionBar.tsx` | Top strip on every page: `Signed in as <name> · sign out` OR `Sign in →`. |

### Modified files

| File | Change |
|---|---|
| `app/layout.tsx` | Render `<SessionBar />` above `{children}`. |
| `app/page.tsx` | Footer drops the "NO ACCOUNTS · NO SIGN-IN" line. Pass `viewerEmail` to `DashboardFilter`. |
| `app/t/[slug]/page.tsx` | Resolve viewer once; compute `isPayer`; pass `viewerEmail` + `isPayer` into child components. |
| `app/tickets/new/page.tsx` | `requireViewer()` server-side. Pass the viewer's `Person` into the form. |
| `app/tickets/new/NewTicketForm.tsx` | Drop `PayerPicker`. Show fixed "PAID BY · <you>" row. Remove the `localStorage` `me-id` hack. |
| `app/people/page.tsx` | Pass `viewerEmail` to `RosterEditor`. |
| `app/people/RosterEditor.tsx` | Two sections — "YOU" (your card, editable) and "THE CREW" (read-only). "+ Add person" still available for signed-in viewers. |
| `components/ParticipantRow.tsx` | New `viewerEmail` + `isPayer` props. "I paid" only on the viewer's own row. "Confirm" / "Cash" / "Remind" / "⋯ Remove" / amount edit only when `isPayer`. Settled-row "Reopen" for payer + the participant on their own row. |
| `components/CloseTicketButton.tsx` | Hides entirely unless `isPayer`. |
| `components/AddMeButton.tsx` | Big simplification. Signed in → one-tap "+ Add me to this ticket" using your Person (optional inline amount input). Signed out → button label "Sign in to add yourself" linking to `/login?next=/t/<slug>`. Two-mode "Pick / Type new" UI removed. |
| `components/DashboardFilter.tsx` | `viewerEmail` prop. Bulk-select checkboxes only on rows where `entry.payerEmail === viewerEmail`. Password input row removed. "✕ DELETE BILLS" entry hidden when signed out. |
| `lib/tickets-index.ts` | `IndexEntry` gains `payerEmail: string \| null`. Lazy backfill via `normalizeEntry` for legacy entries (treat missing as null). |
| `lib/store-roster.ts` | `normalize()` defaults missing `hasAccount` to `false`. |
| `lib/types.ts` | (no change — `Participant` and `PayerProfile` already carry `email`.) |
| `lib/actions/tickets.ts` | Each action body starts with the matching gate call (`requireViewer()`, payer check, participant check, etc.). |
| `lib/actions/roster.ts` | `upsertPersonAction` and `removePersonAction` enforce self-only edit/delete; new-entry create allowed for any signed-in viewer. |

### Deleted files

| File | Reason |
|---|---|
| `components/PayerPicker.tsx` | No longer reachable — payer is always the viewer. |

### Copy touch-ups

- `app/page.tsx` footer: replace `"NO ACCOUNTS · NO SIGN-IN · BUILT FOR THE CREW"`
  with something in the same printed-ticket voice, e.g.
  `"ACCOUNTS · YOURS ALONE · BUILT FOR THE CREW"`.
- `/login` page uses Fraunces + JetBrains Mono, `divider-dots`, eyebrow text —
  match the rest of the app's printed-receipt aesthetic.

## 6. Error handling & edge cases

- **Email normalisation** — always `email.trim().toLowerCase()` on the way in
  (login, roster upsert, ticket creation). One canonical form.
- **Viewer's `Person` was deleted while signed in.** `getViewer()` returns
  `{ email, person: null }`. Next gated action lazy-recreates the `Person`
  from the cookie email and proceeds. No forced sign-out.
- **Login email collides with an existing roster entry that has no
  `hasAccount`.** Expected case (teammate added them earlier). Flip
  `hasAccount = true`; keep existing data intact.
- **Different-cased version of an existing email.** Normalised lookup finds
  the existing Person; no duplicate created.
- **Logged-out viewer hits "Sign in to add yourself".** Redirect to
  `/login?next=/t/<slug>`. After login, they land back on the ticket and
  click "+ Add me" again. No auto-replay of the action — keeps the flow
  simple.
- **Public ticket page shown to a logged-out viewer.** Renders fully. Action
  buttons replaced with a single ghost link "Sign in →".
- **Bulk-delete includes a slug the viewer doesn't own.** Server filters it
  out silently and returns `{ deleted, skipped }`. UI shouldn't allow it,
  but defense-in-depth.
- **Two browser tabs, sign out in one.** Cookie cleared globally. Other tab
  renders cached state until next request, then any action fails with
  `not_signed_in`. User re-signs-in.
- **Add-me race.** Server-side check: if any participant on the ticket has
  `email === viewer.email`, throw `email_already_on_ticket`.

## 7. Migration & backfill

All changes are **additive**. No data destruction. No required scripts.

- **Existing roster entries** — `normalize()` already defaults missing fields;
  add one line for `hasAccount`. Existing data preserved.
- **Existing tickets where `ticket.payer.email === null`** (pre-auth tickets).
  No one matches the payer check, so payer-only actions are unavailable on
  them. Participants can still self-mark and view. Acceptable orphan state;
  no migration required.
- **Tickets index entries** — `payerEmail` added to `IndexEntry`. Lazy
  backfill: any entry missing `payerEmail` gets filled the next time the
  ticket is mutated (existing `upsertIndexEntry` path). For instant
  correctness on the home page bulk-delete filter, a one-shot rebuild script
  could be added but is not required.
- **`BULK_DELETE_PASSWORD` env var** — unused after this change. Remove from
  `.env.example`.

## 8. Verification

No test framework exists in the repo today. Adding one is out of scope.

**Automated baseline:**
- `npm run build` must pass — TypeScript catches most prop/permission wiring
  bugs once `Person.hasAccount`, `viewerEmail`, and `isPayer` are threaded
  through.

**Manual smoke matrix** — run before merging:

| # | Scenario | Pass criterion |
|---|---|---|
| 1 | Fresh visitor → home page | Dashboard visible; no action buttons; footer no longer claims "no accounts" |
| 2 | Sign in with brand-new email | Lands on home; SessionBar shows local-part; `/people` shows your card editable |
| 3 | Sign in with an email already in roster (no `hasAccount` yet) | Linked to existing Person; payment methods preserved; `hasAccount` flips true |
| 4 | Signed in → create ticket | Payer fixed to you, not pickable; ticket created with `payer.email = you` |
| 5 | Signed-out viewer on `/t/<slug>` | Full ticket visible; only "Sign in →" link below participants |
| 6 | Signed in as a participant on someone else's ticket | "I paid" only on your row; no Confirm/Cash anywhere |
| 7 | Signed in as the payer | Confirm / Cash / Remind / ⋯ Remove on every row; Close + Delete visible |
| 8 | Signed in as bystander (neither payer nor participant) | No action buttons anywhere on the ticket |
| 9 | Hand-rolled action call (DevTools fetch) as wrong role | Server returns `not_authorized`; no state change |
| 10 | Home page bulk-delete as a payer | Checkboxes only on your own bills; password input gone |
| 11 | Edit roster card that isn't yours | UI doesn't expose edit; direct `upsertPersonAction` for someone else's id throws |
| 12 | Sign out → reload → action attempt | Buttons gone; stale-tab action fails with clear error |
| 13 | Legacy ticket (pre-auth, `payer.email = null`) | Renders; participants self-mark works; payer-only buttons absent from everyone |

## 9. Future-friendly notes

- Swapping the typed-email cookie for a magic-link verified cookie later only
  changes `/login` and adds a token store. The rest of the app reads identity
  via `getViewer()` and doesn't care how the cookie was set.
- A future "admin" role would mean adding `isAdmin: boolean` to `Person` and a
  single new check in the payer-only actions. Not needed for v1.
- The `Person` record carrying both account identity and payment methods is
  intentional — it means a roster entry "becomes" an account the moment its
  owner signs in, with no data migration. If profile and payment-method
  needs diverge later, split is straightforward.
