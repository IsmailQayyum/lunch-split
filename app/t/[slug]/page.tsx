import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { db } from "@/lib/db";
import { participants, tickets, reminderLog } from "@/lib/db/schema";
import { Card } from "@/components/ui/card";
import { formatMoney, formatDate } from "@/lib/utils";
import { PaymentMethodsPanel } from "@/components/PaymentMethodsPanel";
import { ParticipantRow } from "@/components/ParticipantRow";
import { CloseTicketButton } from "@/components/CloseTicketButton";
import { ShareLinkBar } from "@/components/ShareLinkBar";
import { TicketVisitRecorder } from "@/components/TicketVisitRecorder";

export default async function TicketPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ticket = await db.query.tickets.findFirst({ where: eq(tickets.slug, slug) });
  if (!ticket) notFound();

  const rows = await db.query.participants.findMany({
    where: eq(participants.ticketId, ticket.id),
  });

  const pendingCount = rows.filter(
    (r) => r.status === "pending" || r.status === "self_marked",
  ).length;
  const confirmedCount = rows.length - pendingCount;

  // Last reminder timestamp per participant for rate-limit hint
  const allReminders = await db.query.reminderLog.findMany();
  const lastReminderByParticipant = new Map<string, Date>();
  for (const r of allReminders) {
    if (rows.some((p) => p.id === r.participantId)) {
      lastReminderByParticipant.set(r.participantId, new Date(r.sentAt));
    }
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
              Paid by {ticket.payerName} · {formatDate(ticket.createdAt)}
              {ticket.status === "closed" && (
                <span className="ml-2 text-emerald-600">· Closed</span>
              )}
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider text-muted">Total</div>
            <div className="text-2xl font-semibold">
              {formatMoney(Number(ticket.totalAmount), ticket.currency)}
            </div>
          </div>
        </div>
        {ticket.notes && <p className="text-sm text-muted mt-3">{ticket.notes}</p>}
      </header>

      <ShareLinkBar ticketUrl={ticketUrl} />

      <PaymentMethodsPanel
        payer={{
          name: ticket.payerName,
          jazzcash: ticket.payerJazzcash,
          easypaisa: ticket.payerEasypaisa,
          iban: ticket.payerIban,
          accountTitle: ticket.payerAccountTitle,
          acceptsCash: ticket.payerAcceptsCash,
        }}
      />

      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted">
            Participants ({confirmedCount}/{rows.length} settled)
          </h2>
        </div>
        <div className="space-y-2">
          {rows.map((p) => (
            <ParticipantRow
              key={p.id}
              slug={slug}
              ticketUrl={ticketUrl}
              ticketTitle={ticket.title}
              payerName={ticket.payerName}
              participant={{
                id: p.id,
                name: p.name,
                email: p.email,
                whatsapp: p.whatsapp,
                amountOwed: Number(p.amountOwed),
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
