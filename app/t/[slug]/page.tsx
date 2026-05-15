import Link from "next/link";
import Image from "next/image";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { participants, tickets, users, reminderLog } from "@/lib/db/schema";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoney, formatDate } from "@/lib/utils";
import { PaymentMethodsPanel } from "@/components/PaymentMethodsPanel";
import { ParticipantRow } from "@/components/ParticipantRow";
import { ReceiptUploader } from "@/components/ReceiptUploader";
import { CloseTicketButton } from "@/components/CloseTicketButton";

export default async function TicketPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const meId = session.user.id;
  const meEmail = session.user.email ?? "";

  const ticket = await db.query.tickets.findFirst({ where: eq(tickets.slug, slug) });
  if (!ticket) notFound();

  const payer = await db.query.users.findFirst({ where: eq(users.id, ticket.payerId) });
  if (!payer) notFound();

  const rows = await db.query.participants.findMany({
    where: eq(participants.ticketId, ticket.id),
  });

  const isPayer = ticket.payerId === meId;
  const myRow = rows.find((r) => r.userId === meId || r.pendingEmail === meEmail.toLowerCase());

  if (!isPayer && !myRow) {
    // Not authorized — show 403-style page
    return (
      <main className="max-w-xl mx-auto px-6 py-10">
        <Card>
          <h1 className="text-lg font-semibold">Not your ticket</h1>
          <p className="mt-2 text-sm text-muted">
            You're not listed on this ticket. Ask the payer to add you.
          </p>
          <Link href="/dashboard" className="inline-block mt-4 text-sm underline">
            Back to dashboard
          </Link>
        </Card>
      </main>
    );
  }

  const pendingCount = rows.filter((r) => r.status === "pending" || r.status === "self_marked")
    .length;
  const confirmedCount = rows.length - pendingCount;

  // Load latest reminder timestamps for rate-limit hint
  const allReminders = await db.query.reminderLog.findMany();
  const lastReminderByParticipant = new Map<string, Date>();
  for (const r of allReminders) {
    if (rows.some((p) => p.id === r.participantId)) {
      lastReminderByParticipant.set(r.participantId, new Date(r.sentAt));
    }
  }

  return (
    <main className="max-w-2xl mx-auto px-6 py-10">
      <header className="mb-6">
        <Link href="/dashboard" className="text-sm text-muted hover:underline">
          ← Dashboard
        </Link>
        <div className="flex items-start justify-between mt-2 gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{ticket.title}</h1>
            <p className="text-sm text-muted mt-1">
              Paid by {payer.name ?? payer.email} · {formatDate(ticket.createdAt)}
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

      {!isPayer && (
        <PaymentMethodsPanel
          payer={{
            name: payer.name ?? payer.email,
            jazzcashNumber: payer.jazzcashNumber,
            easypaisaNumber: payer.easypaisaNumber,
            bankIban: payer.bankIban,
            bankAccountTitle: payer.bankAccountTitle,
            acceptsCash: payer.acceptsCash,
          }}
          amount={myRow ? Number(myRow.amountOwed) : null}
          currency={ticket.currency}
        />
      )}

      {ticket.receiptUrl && (
        <Card className="mb-6">
          <div className="text-xs uppercase tracking-wider text-muted mb-2">Receipt</div>
          <Image
            src={ticket.receiptUrl}
            alt="Receipt"
            width={600}
            height={800}
            className="rounded-lg max-h-96 w-auto"
          />
        </Card>
      )}

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
              participant={{
                id: p.id,
                guestName: p.guestName,
                pendingEmail: p.pendingEmail,
                amountOwed: Number(p.amountOwed),
                status: p.status,
                isMe: p.userId === meId || p.pendingEmail === meEmail.toLowerCase(),
              }}
              isPayer={isPayer}
              ticketOpen={ticket.status === "open"}
              currency={ticket.currency}
              lastRemindedAt={lastReminderByParticipant.get(p.id) ?? null}
            />
          ))}
        </div>
      </section>

      {isPayer && (
        <section className="space-y-4">
          <ReceiptUploader slug={slug} hasReceipt={!!ticket.receiptUrl} />
          <CloseTicketButton slug={slug} status={ticket.status} />
        </section>
      )}
    </main>
  );
}
