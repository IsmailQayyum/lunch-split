import Link from "next/link";
import { and, desc, eq, isNull } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { participants, tickets } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SignOutButton } from "@/components/SignOutButton";
import { formatMoney, relativeTime } from "@/lib/utils";
import { redirect } from "next/navigation";

export default async function Dashboard() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const meId = session.user.id;
  const meEmail = (session.user.email ?? "").toLowerCase();

  // Backfill any pending-email participant rows that match my email (e.g. added via Slack
  // before I first signed in). Idempotent and cheap.
  if (meEmail) {
    await db
      .update(participants)
      .set({ userId: meId })
      .where(
        and(isNull(participants.userId), eq(participants.pendingEmail, meEmail)),
      );
  }

  // Tickets I'm payer on
  const payerRows = await db.query.tickets.findMany({
    where: eq(tickets.payerId, meId),
    orderBy: [desc(tickets.createdAt)],
    limit: 50,
  });

  // Tickets I'm a participant on
  const participantRows = await db
    .select({
      ticket: tickets,
      participant: participants,
    })
    .from(participants)
    .innerJoin(tickets, eq(participants.ticketId, tickets.id))
    .where(eq(participants.userId, meId))
    .orderBy(desc(tickets.createdAt))
    .limit(50);

  // For payer-side cards, count pending participants
  const ticketIds = payerRows.map((t) => t.id);
  const allParticipantsForMine =
    ticketIds.length > 0
      ? await db.query.participants.findMany({
          where: (p, { inArray }) => inArray(p.ticketId, ticketIds),
        })
      : [];
  const pendingCountByTicket = new Map<string, number>();
  for (const p of allParticipantsForMine) {
    if (p.status === "pending" || p.status === "self_marked") {
      pendingCountByTicket.set(p.ticketId, (pendingCountByTicket.get(p.ticketId) ?? 0) + 1);
    }
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">🍱 Lunch Split</h1>
          <p className="text-sm text-muted">Signed in as {session.user.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/settings">
            <Button variant="ghost" size="sm">
              Settings
            </Button>
          </Link>
          <SignOutButton />
        </div>
      </header>

      <div className="mb-8">
        <Link href="/tickets/new">
          <Button size="lg">+ New lunch ticket</Button>
        </Link>
      </div>

      <section className="mb-10">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted mb-3">
          You owe
        </h2>
        {participantRows.length === 0 ? (
          <Card className="text-sm text-muted">Nothing to settle. Treat yourself.</Card>
        ) : (
          <div className="space-y-3">
            {participantRows.map(({ ticket, participant }) => (
              <Link key={participant.id} href={`/t/${ticket.slug}`}>
                <Card className="flex items-center justify-between hover:bg-border/20 transition cursor-pointer">
                  <div>
                    <div className="font-medium">{ticket.title}</div>
                    <div className="text-xs text-muted mt-1">
                      {relativeTime(ticket.createdAt)} ·{" "}
                      <span
                        className={
                          participant.status === "confirmed" || participant.status === "cash"
                            ? "text-emerald-600"
                            : participant.status === "self_marked"
                              ? "text-amber-600"
                              : "text-red-600"
                        }
                      >
                        {labelFor(participant.status)}
                      </span>
                    </div>
                  </div>
                  <div className="text-lg font-semibold">
                    {formatMoney(Number(participant.amountOwed), ticket.currency)}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted mb-3">
          Tickets you paid
        </h2>
        {payerRows.length === 0 ? (
          <Card className="text-sm text-muted">
            You haven't paid for a lunch yet. Hit "New lunch ticket" above.
          </Card>
        ) : (
          <div className="space-y-3">
            {payerRows.map((t) => {
              const pending = pendingCountByTicket.get(t.id) ?? 0;
              return (
                <Link key={t.id} href={`/t/${t.slug}`}>
                  <Card className="flex items-center justify-between hover:bg-border/20 transition cursor-pointer">
                    <div>
                      <div className="font-medium">{t.title}</div>
                      <div className="text-xs text-muted mt-1">
                        {relativeTime(t.createdAt)} ·{" "}
                        {t.status === "closed" ? (
                          <span className="text-emerald-600">Closed</span>
                        ) : pending > 0 ? (
                          <span className="text-amber-600">{pending} pending</span>
                        ) : (
                          <span className="text-emerald-600">All paid</span>
                        )}
                      </div>
                    </div>
                    <div className="text-lg font-semibold">
                      {formatMoney(Number(t.totalAmount), t.currency)}
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function labelFor(s: string) {
  switch (s) {
    case "pending":
      return "Pending";
    case "self_marked":
      return "Marked paid, awaiting confirmation";
    case "confirmed":
      return "Confirmed";
    case "cash":
      return "Paid in cash";
    default:
      return s;
  }
}
