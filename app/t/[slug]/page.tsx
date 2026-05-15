import Link from "next/link";
import { notFound } from "next/navigation";

import { getTicket } from "@/lib/store";
import { formatMoney, formatDate } from "@/lib/utils";
import { PaymentMethodsPanel } from "@/components/PaymentMethodsPanel";
import { ParticipantRow } from "@/components/ParticipantRow";
import { CloseTicketButton } from "@/components/CloseTicketButton";
import { ShareLinkBar } from "@/components/ShareLinkBar";
import { TicketVisitRecorder } from "@/components/TicketVisitRecorder";

export const dynamic = "force-dynamic";

export default async function TicketPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
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

  return (
    <main className="max-w-2xl mx-auto px-6 py-10">
      <TicketVisitRecorder slug={slug} title={ticket.title} />

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

      <ShareLinkBar ticketUrl={ticketUrl} />

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

      <section className="mb-6">
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

      <section>
        <CloseTicketButton slug={slug} status={ticket.status} />
      </section>
    </main>
  );
}
