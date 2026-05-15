import Link from "next/link";
import { notFound } from "next/navigation";

import { getTicket } from "@/lib/store";
import { formatMoney, formatDate } from "@/lib/utils";
import { slackShareText, shortShareText } from "@/lib/share-text";
import { PaymentMethodsPanel } from "@/components/PaymentMethodsPanel";
import { ParticipantRow } from "@/components/ParticipantRow";
import { CloseTicketButton } from "@/components/CloseTicketButton";
import { ShareLinkBar } from "@/components/ShareLinkBar";
import { TicketVisitRecorder } from "@/components/TicketVisitRecorder";
import { SharePanel } from "@/components/SharePanel";
import { LivePoller } from "@/components/LivePoller";
import { AddMeButton } from "@/components/AddMeButton";

export const dynamic = "force-dynamic";

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

  const pendingCount = ticket.participants.filter(
    (r) => r.status === "pending" || r.status === "self_marked",
  ).length;
  const confirmedCount = ticket.participants.length - pendingCount;

  const lastReminderByParticipant = new Map<string, Date>();
  for (const r of ticket.reminders) {
    const t = new Date(r.sentAt);
    const cur = lastReminderByParticipant.get(r.participantId);
    if (!cur || t > cur) lastReminderByParticipant.set(r.participantId, t);
  }

  const appUrl = process.env.APP_URL ?? "";
  const ticketUrl = `${appUrl}/t/${slug}`;
  const slackText = slackShareText(ticket, ticketUrl);
  const shortText = shortShareText(ticket, ticketUrl);
  const justCreated = created === "1";

  // Suggested amount for an "Add me" late joiner: current per-person average
  const suggestedAmount =
    ticket.participants.length > 0
      ? Math.round(
          ticket.participants.reduce((a, p) => a + p.amountOwed, 0) /
            ticket.participants.length,
        )
      : Math.round(ticket.totalAmount / 4);

  return (
    <main className="max-w-2xl mx-auto px-6 py-10">
      <TicketVisitRecorder slug={slug} title={ticket.title} />
      {ticket.status === "open" && <LivePoller />}

      <header className="mb-6">
        <Link href="/" className="text-sm text-muted hover:underline">
          ← Home
        </Link>
        <div className="flex items-start justify-between mt-2 gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{ticket.title}</h1>
            <p className="text-sm text-muted mt-1">
              Paid by {ticket.payer.name} · {formatDate(ticket.createdAt)}
              {ticket.status === "closed" && (
                <span className="ml-2 text-emerald-600">· Closed</span>
              )}
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider text-muted">Total</div>
            <div className="text-2xl font-semibold">
              {formatMoney(ticket.totalAmount, ticket.currency)}
            </div>
          </div>
        </div>
        {ticket.notes && <p className="text-sm text-muted mt-3">{ticket.notes}</p>}
      </header>

      {justCreated ? (
        <SharePanel ticketUrl={ticketUrl} slackText={slackText} shortText={shortText} />
      ) : (
        <ShareLinkBar ticketUrl={ticketUrl} />
      )}

      <PaymentMethodsPanel
        payer={{
          name: ticket.payer.name,
          jazzcash: ticket.payer.jazzcash,
          easypaisa: ticket.payer.easypaisa,
          iban: ticket.payer.iban,
          accountTitle: ticket.payer.accountTitle,
          acceptsCash: ticket.payer.acceptsCash,
        }}
      />

      <section className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted">
            Participants ({confirmedCount}/{ticket.participants.length} settled)
          </h2>
        </div>
        <div className="space-y-2">
          {ticket.participants.map((p) => (
            <ParticipantRow
              key={p.id}
              slug={slug}
              ticketUrl={ticketUrl}
              ticketTitle={ticket.title}
              payerName={ticket.payer.name}
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

      {ticket.status === "open" && (
        <section className="mb-6">
          <AddMeButton
            slug={slug}
            suggestedAmount={suggestedAmount}
            currency={ticket.currency}
          />
        </section>
      )}

      <section>
        <CloseTicketButton slug={slug} status={ticket.status} />
      </section>
    </main>
  );
}
