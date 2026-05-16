import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getTicket } from "@/lib/store";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const ticket = await getTicket(slug);
  if (!ticket) return { title: "Ticket not found · Lunch Split" };
  const settled = ticket.participants.filter(
    (p) => p.status === "confirmed" || p.status === "cash",
  ).length;
  const total = ticket.participants.length;
  const names = ticket.participants.map((p) => p.name);
  const namesList = names.length > 0 ? names.join(", ") : "no participants yet";
  const desc = `₨${ticket.totalAmount.toLocaleString("en-PK")} paid by ${ticket.payer.name} · ${settled}/${total} settled\n${namesList}`;
  const appUrl = process.env.APP_URL ?? "https://lunch-split.vercel.app";
  return {
    title: `${ticket.title} · Lunch Split`,
    description: desc,
    openGraph: {
      title: `🍱 ${ticket.title} — ₨${ticket.totalAmount.toLocaleString("en-PK")}`,
      description: `Paid by ${ticket.payer.name} · ${settled}/${total} settled\nSplitting between: ${namesList}`,
      type: "website",
      url: `${appUrl}/t/${slug}`,
      siteName: "Lunch Split",
    },
    twitter: {
      card: "summary_large_image",
      title: `🍱 ${ticket.title} — ₨${ticket.totalAmount.toLocaleString("en-PK")}`,
      description: `Paid by ${ticket.payer.name} · ${settled}/${total} settled\nSplitting between: ${namesList}`,
    },
  };
}
import { findPersonByEmail, getRoster } from "@/lib/store-roster";
import { slackShareText, shortShareText } from "@/lib/share-text";
import type { PayerProfile } from "@/lib/types";
import { PaymentMethodsPanel } from "@/components/PaymentMethodsPanel";
import { ParticipantRow } from "@/components/ParticipantRow";
import { CloseTicketButton } from "@/components/CloseTicketButton";
import { TicketVisitRecorder } from "@/components/TicketVisitRecorder";
import { SharePanel } from "@/components/SharePanel";
import { LivePoller } from "@/components/LivePoller";
import { AddMeButton } from "@/components/AddMeButton";
import { ShareLinkBar } from "@/components/ShareLinkBar";

export const dynamic = "force-dynamic";

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d
    .toLocaleString("en-GB", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    .toUpperCase();
}

function fmtDateOnly(iso: string) {
  return new Date(iso)
    .toLocaleDateString("en-GB", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
    .toUpperCase();
}

export default async function TicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { slug } = await params;
  const { created } = await searchParams;
  const ticket = await getTicket(slug);
  if (!ticket) notFound();

  // Pull the payer's *current* payment methods from the roster so updates
  // there reflect on every ticket they're paying. Fall back to the snapshot
  // taken when the ticket was created if they're no longer in the roster.
  const roster = await getRoster();
  const liveMatch = findPersonByEmail(roster, ticket.payer.email);
  const effectivePayer: PayerProfile = liveMatch
    ? {
        name: liveMatch.name,
        email: liveMatch.email,
        whatsapp: liveMatch.whatsapp,
        walletNumber: liveMatch.walletNumber,
        walletApps: liveMatch.walletApps,
        iban: liveMatch.iban,
        accountTitle: liveMatch.accountTitle,
        acceptsCash: liveMatch.acceptsCash,
      }
    : ticket.payer;
  const liveTicket = { ...ticket, payer: effectivePayer };

  const pendingCount = ticket.participants.filter(
    (r) => r.status === "pending" || r.status === "self_marked",
  ).length;
  const confirmedCount = ticket.participants.length - pendingCount;
  const subtotal = ticket.participants.reduce((s, p) => s + p.amountOwed, 0);

  const lastReminderByParticipant = new Map<string, Date>();
  for (const r of ticket.reminders) {
    const t = new Date(r.sentAt);
    const cur = lastReminderByParticipant.get(r.participantId);
    if (!cur || t > cur) lastReminderByParticipant.set(r.participantId, t);
  }

  const appUrl = process.env.APP_URL ?? "";
  const ticketUrl = `${appUrl}/t/${slug}`;
  const slackText = slackShareText(liveTicket, ticketUrl);
  const shortText = shortShareText(liveTicket, ticketUrl);
  const justCreated = created === "1";

  const suggestedAmount =
    ticket.participants.length > 0
      ? Math.round(subtotal / ticket.participants.length)
      : Math.round(ticket.totalAmount / 4);

  return (
    <main className="max-w-[520px] mx-auto px-5 pt-6 pb-12 animate-print">
      <TicketVisitRecorder slug={slug} title={ticket.title} />
      {ticket.status === "open" && <LivePoller />}

      {/* Back link */}
      <div className="mb-4">
        <Link href="/" className="eyebrow ink-link">
          ← BACK
        </Link>
      </div>

      {/* Receipt header */}
      <header className="text-center stagger">
        <div className="eyebrow">
          DIGITAL RECEIPT ·{" "}
          {ticket.status === "open" ? (
            <span className="text-saffron inline-flex items-center gap-1">
              <span className="animate-pulse-dot">●</span> LIVE
            </span>
          ) : (
            <span className="text-moss">✓ CLOSED</span>
          )}
        </div>
        <h1 className="display-italic text-[44px] sm:text-[56px] mt-3 leading-[0.9]">
          {ticket.title}
        </h1>
        <div className="mt-4">
          <div className="eyebrow">BILL DATE</div>
          <div className="display-italic text-[20px] mt-1">{fmtDateOnly(ticket.createdAt)}</div>
          <div className="text-[10px] text-ink-faint font-mono tracking-wider mt-0.5">
            CREATED {fmtDate(ticket.createdAt)}
          </div>
        </div>
        <div className="text-[12px] text-ink-soft mt-4">
          SERVED BY{" "}
          <span className="display-italic text-[18px] mx-1">{effectivePayer.name}</span>
        </div>
      </header>

      <div className="divider-double my-8" />

      {/* Counter / progress strip */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="eyebrow">SETTLED</div>
          <div className="display text-[28px] num mt-1">
            {confirmedCount}
            <span className="text-ink-faint">/{ticket.participants.length}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="eyebrow">PENDING</div>
          <div className="display text-[28px] num mt-1 text-saffron">{pendingCount}</div>
        </div>
      </div>

      <div className="divider-dots mb-6" />

      {justCreated && (
        <SharePanel ticketUrl={ticketUrl} slackText={slackText} shortText={shortText} />
      )}
      {!justCreated && <ShareLinkBar ticketUrl={ticketUrl} />}

      {/* Itemized */}
      <section>
        <div className="eyebrow mb-4 text-center">⎯ ITEMIZED ⎯</div>
        {ticket.participants.length === 0 && (
          <div className="border-2 border-dashed border-saffron/50 p-5 text-center mb-4">
            <div className="display-italic text-[26px] mb-2">No-one's on the list yet.</div>
            <div className="text-[13px] text-ink-soft">
              Be the first — tap{" "}
              <span className="display-italic text-[17px] text-saffron">+ Add me</span> below.
            </div>
          </div>
        )}
        <div className="space-y-3">
          {ticket.participants.map((p) => (
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
            />
          ))}
        </div>
      </section>

      <div className="divider-dots my-6" />

      {/* Totals block */}
      <section className="space-y-2">
        <div className="line-item text-[13px] text-ink-soft">
          <span>SUBTOTAL</span>
          <span className="leader" />
          <span className="num">₨ {subtotal.toLocaleString("en-PK")}</span>
        </div>
        <div className="line-item">
          <span className="display-italic text-[22px]">Total</span>
          <span className="leader" />
          <span className="display text-[32px] num">
            ₨ {ticket.totalAmount.toLocaleString("en-PK")}
          </span>
        </div>
      </section>

      <div className="divider-double my-8" />

      {/* Payment */}
      <PaymentMethodsPanel
        payer={{
          name: effectivePayer.name,
          walletNumber: effectivePayer.walletNumber,
          walletApps: effectivePayer.walletApps ?? [],
          iban: effectivePayer.iban,
          accountTitle: effectivePayer.accountTitle,
          acceptsCash: effectivePayer.acceptsCash,
        }}
      />

      {/* Add me */}
      {ticket.status === "open" && (
        <>
          <div className="divider-dots my-8" />
          <AddMeButton
            slug={slug}
            suggestedAmount={suggestedAmount}
            currency={ticket.currency}
          />
        </>
      )}

      <div className="divider-dots my-8" />

      {/* Notes if any */}
      {ticket.notes && (
        <>
          <div className="text-[12px] text-ink-soft italic text-center max-w-[420px] mx-auto">
            "{ticket.notes}"
          </div>
          <div className="divider-dots my-8" />
        </>
      )}

      {/* Close ticket */}
      <div className="flex justify-center">
        <CloseTicketButton slug={slug} status={ticket.status} />
      </div>

      {/* Receipt footer */}
      <footer className="text-center mt-12 space-y-4">
        <div className="divider-double max-w-[180px] mx-auto" />
        <div className="eyebrow">THANK YOU — KEEP THE CHANGE</div>
        <div className="barcode max-w-[220px] mx-auto" />
        <div className="eyebrow">TRX · {slug.toUpperCase()}</div>
      </footer>
    </main>
  );
}
