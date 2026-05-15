# Lunch Split

Internal tool for `#secure-lunch-internal`: when one person pays for the group lunch, this tracks who owes what, lets people self-mark when they've sent money, and lets the payer confirm receipt. Closes automatically when everyone's settled.

Designed to **not** require any Slack app install or admin approval. Authenticates via Google Workspace SSO restricted to `@puresquare.com`. Slack integration is via native Workflow Builder (a workspace feature, not an installed app).

## Stack

- Next.js 15 (App Router) + TypeScript
- Auth.js v5 with Google provider, JWT sessions
- Neon Postgres (serverless) + Drizzle ORM
- Resend for reminder emails
- Vercel Blob for receipt photos
- Tailwind CSS

## One-time setup

### 1. Provision external services

All on free tiers. Total monthly cost: **$0**.

#### Google OAuth
1. https://console.cloud.google.com → APIs & Services → Credentials → **Create OAuth client ID** → Web application.
2. Authorized redirect URI:
   - Local: `http://localhost:3000/api/auth/callback/google`
   - Prod: `https://<your-vercel-domain>/api/auth/callback/google`
3. Copy the Client ID and Secret into `.env.local`.
4. (Optional, recommended) On the OAuth consent screen, set **User type: Internal** so only `@puresquare.com` accounts can even reach the sign-in screen.

#### Neon Postgres
1. https://neon.tech → create a project.
2. Copy the **pooled** connection string (the one that includes `-pooler` in the host) → `DATABASE_URL`.

#### Resend
1. https://resend.com → API Keys → create.
2. For dev, use Resend's `onboarding@resend.dev` as `EMAIL_FROM` (no domain verification needed).
3. For prod, verify a domain (or subdomain) in Resend → Domains. Then set `EMAIL_FROM=Lunch Split <lunch@yourdomain>`.

#### Vercel Blob
1. From your Vercel project → Storage → Create → Blob.
2. Copy the `BLOB_READ_WRITE_TOKEN`.

### 2. Local env

Copy `.env.example` → `.env.local` and fill in.

```bash
cp .env.example .env.local
# edit .env.local
```

Generate `AUTH_SECRET`:
```bash
openssl rand -base64 32
```

Generate `SLACK_WORKFLOW_SECRET`:
```bash
openssl rand -hex 32
```

### 3. Database migration

```bash
npm run db:push      # for first-time setup or quick iteration
# OR for proper migration tracking:
npm run db:generate  # regenerates SQL after schema changes
npm run db:migrate   # applies pending migrations
```

`npm run db:push` is the fastest way to get your local Neon DB matching the schema. Use `db:generate` + `db:migrate` once you're in production.

### 4. Run

```bash
npm run dev
```

Visit http://localhost:3000.

## Deploy to Vercel

1. `npm i -g vercel && vercel` (or push to GitHub and import via the Vercel dashboard).
2. In Vercel project settings → Environment Variables, add every variable from `.env.example` (values from your `.env.local`).
3. Set `APP_URL` to your production URL.
4. Redeploy.

## Slack Workflow Builder setup

This is the "feels like a bot" entrypoint. Workflows aren't apps — they don't require admin approval.

### Create the workflow

1. In Slack, open `#secure-lunch-internal`.
2. Click the `+` shortcut button at the top of the channel → **Workflows** → **New Workflow** → **Build Workflow**.
3. **Trigger**: choose **From a shortcut in this channel**. Name it something like `New lunch split`.
4. **Step 1 — Open a form** ("Lunch details"):
   - Field: `Title` (short text, required)
   - Field: `Total amount in PKR` (number, required)
   - Field: `Participants` (Person — multi-select, required)
   - Field: `Notes` (long text, optional)
5. **Step 2 — Send a webhook**:
   - URL: `https://<your-vercel-domain>/api/slack/workflow`
   - Method: POST
   - **Header**: name `X-Slack-Workflow-Secret`, value = the `SLACK_WORKFLOW_SECRET` you set in Vercel.
   - **Body** (JSON):
     ```json
     {
       "payerEmail": "{{person_who_started_workflow.email}}",
       "payerName":  "{{person_who_started_workflow.real_name}}",
       "payerSlackId": "{{person_who_started_workflow.id}}",
       "title":   "{{form.title}}",
       "totalAmount": "{{form.total_amount_in_pkr}}",
       "notes":   "{{form.notes}}",
       "participants": [
         {
           "email": "{{form.participants[0].email}}",
           "name":  "{{form.participants[0].real_name}}",
           "slackId": "{{form.participants[0].id}}"
         }
         // Slack repeats the array for each selected user — see step below
       ]
     }
     ```
   - Slack's webhook step has limited support for true arrays from multi-selects. If your tenant's Workflow Builder UI doesn't allow templating an array directly, you have two options:
     - **A. Use a "Send to many people" workflow pattern**: split the workflow into "Repeat for each participant" — Slack will call the webhook once per person. Adjust the body to send a single participant per call, and the webhook handler aggregates by `slug` (out of scope for v1 — see "Known limitations" below).
     - **B. Use the participants-as-string fallback**: have the form ask for a comma-separated list of emails as a text field instead of a Person multi-select. The webhook still works the same.
   - For an initial setup, **option B** is the most reliable path. Replace the Participants form field with a single long-text field `participants_csv` and use this body:
     ```json
     {
       "payerEmail":  "{{person_who_started_workflow.email}}",
       "title":       "{{form.title}}",
       "totalAmount": "{{form.total_amount_in_pkr}}",
       "notes":       "{{form.notes}}",
       "participants_csv": "{{form.participants_csv}}"
     }
     ```
     If you do this, the webhook needs to parse the CSV. (TODO if you adopt option B — currently the handler expects the array form.)
   - **Capture response variables**: Slack lets you map the response JSON. Add a variable for `ticketUrl` (path: `ticketUrl`).
6. **Step 3 — Send a message** to `#secure-lunch-internal`:
   ```
   🍱 New lunch ticket from <@{{person_who_started_workflow.id}}>: *{{form.title}}*
   Total: Rs. {{form.total_amount_in_pkr}}  •  Split among {{form.participants.length}} people
   {{step_2_response.ticketUrl}}
   ```
7. **Publish**.

Now anyone in the channel can hit the `+` shortcut to file a new lunch ticket.

### Privacy/visibility note

Workflows are not Slack "apps" and don't require admin approval to publish. However, a workspace admin can still **see** workflows under `Tools → Workflow Builder` if they specifically look. The workflow shows the author (you) and the webhook URL on inspection. The webhook URL itself doesn't reveal what the app does — but if you'd rather have *zero* Slack-side footprint, skip the workflow entirely and just create tickets in the web app, then paste the URL into the channel manually.

## Troubleshooting

- **`Configuration` error on sign-in**: check `AUTH_GOOGLE_ID`/`SECRET` are set and the redirect URI in the Google Cloud Console matches `<APP_URL>/api/auth/callback/google`.
- **`AccessDenied` after Google sign-in**: your Google account is not `@puresquare.com`, or the `hd` claim doesn't match. If you're on a personal Gmail by accident, sign out and switch accounts.
- **Reminder emails not arriving**: check `RESEND_API_KEY` and that `EMAIL_FROM` matches a verified Resend sender (or `onboarding@resend.dev` for dev). Look at https://resend.com/emails for delivery status.
- **Receipt upload fails with 401**: confirm `BLOB_READ_WRITE_TOKEN` is set in env.
- **Slack webhook 401**: header name and value must match `SLACK_WORKFLOW_SECRET` exactly — case-sensitive.

## Known limitations (v1)

- **No bot DMs**. Reminders are email-only.
- **No scheduled auto-reminders**. The payer presses "Send reminder" per-person.
- **No real payment processing**. People pay through JazzCash/EasyPaisa/bank as today; the app only tracks state.
- **Slack workflow multi-select arrays**: depending on your Slack tenant, the Workflow Builder UI may make it awkward to template a JSON array from a multi-user picker. If you hit this, swap the form field to a comma-separated text field of emails and extend the webhook handler to parse it (small change, see `app/api/slack/workflow/route.ts`).

## File map

```
app/
  page.tsx                              sign-in landing
  layout.tsx, globals.css
  dashboard/page.tsx                    list of my tickets
  settings/page.tsx                     payment-handle settings
  tickets/new/page.tsx + NewTicketForm  create a ticket
  t/[slug]/page.tsx                     ticket detail view
  api/auth/[...nextauth]/route.ts       Auth.js handlers
  api/blob/upload/route.ts              Vercel Blob upload token endpoint
  api/slack/workflow/route.ts           Slack workflow webhook entry
auth.ts                                 Auth.js config + @puresquare.com guard
middleware.ts                           auth gate for non-public routes
lib/
  db/schema.ts                          Drizzle schema (4 tables)
  db/index.ts                           Drizzle client (Neon HTTP)
  actions/tickets.ts                    server actions for ticket lifecycle
  actions/settings.ts                   server action for saving payment handles
  email.ts                              Resend client + reminder template
  shares.ts                             splitEvenly helper
  slug.ts                               nanoid 8-char slugs
  utils.ts                              cn(), formatMoney(), relativeTime()
components/
  ui/                                   button, input, label, card
  PaymentMethodsPanel.tsx               JazzCash/EasyPaisa/IBAN with copy buttons
  ParticipantRow.tsx                    per-participant row + action menu
  ReceiptUploader.tsx                   Vercel Blob client upload
  CloseTicketButton.tsx
  SignInWithGoogle.tsx, SignOutButton.tsx
drizzle/                                generated migrations
```
