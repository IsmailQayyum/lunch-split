import Link from "next/link";
import { readIndexOrRebuild, type IndexEntry } from "@/lib/tickets-index";

export const dynamic = "force-dynamic";

function nowStamp() {
  const d = new Date();
  return d
    .toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    .toUpperCase();
}

function fmtBillDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  if (isToday) return "Today";
  if (isYesterday) return "Yesterday";
  return d
    .toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
    })
    .toUpperCase();
}

export default async function Home() {
  const index = await readIndexOrRebuild();
  const open = index
    .filter((e) => e.status === "open")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const closed = index
    .filter((e) => e.status === "closed")
    .sort((a, b) => (b.closedAt ?? b.createdAt).localeCompare(a.closedAt ?? a.createdAt))
    .slice(0, 8);

  const stillOwed = open.reduce((s, e) => {
    const pendingTotal = e.participants
      .filter((p) => p.status !== "confirmed" && p.status !== "cash")
      .reduce((x, p) => x + p.amountOwed, 0);
    // fallback for legacy entries without participants list
    if (pendingTotal === 0 && e.participants.length === 0) {
      return s + e.totalAmount * Math.max(0, 1 - e.settledCount / Math.max(1, e.participantCount));
    }
    return s + pendingTotal;
  }, 0);

  return (
    <main className="max-w-[560px] mx-auto px-5 pt-10 pb-16 animate-print">
      <header className="text-center stagger">
        <div className="eyebrow">EST. 2026 · #SECURE-LUNCH-INTERNAL</div>
        <h1 className="display-italic text-[80px] sm:text-[104px] mt-3 leading-[0.85]">
          Lunch
          <br />
          Split.
        </h1>
        <p className="text-ink-soft text-[13px] mt-5 max-w-[360px] mx-auto">
          One pays. The rest settle up. Track every rupee on a receipt that{" "}
          <em className="display-italic">actually prints out.</em>
        </p>
      </header>

      <div className="divider-dots my-10" />

      <div className="text-center">
        <Link href="/tickets/new">
          <button className="btn btn-lg">↓ Punch a new ticket</button>
        </Link>
        <p className="eyebrow mt-3">Takes ~ 20 SECONDS</p>
        <div className="mt-6 flex flex-col items-center gap-2">
          <Link href="/people" className="eyebrow ink-link">
            ⋯ MANAGE THE LUNCH ROSTER →
          </Link>
          <Link href="/setup" className="eyebrow ink-link">
            ⌁ WIRE UP THE SLACK SHORTCUT →
          </Link>
        </div>
      </div>

      {/* Unresolved */}
      <section className="mt-14">
        <div className="flex items-end justify-between mb-1">
          <div>
            <div className="eyebrow text-saffron">⚠ UNRESOLVED · {open.length}</div>
            <div className="display-italic text-[34px] leading-none mt-2">Still owed.</div>
          </div>
          {open.length > 0 && (
            <div className="text-right">
              <div className="eyebrow">OUTSTANDING</div>
              <div className="display text-[22px] num mt-1 text-saffron">
                ~ ₨ {Math.round(stillOwed).toLocaleString("en-PK")}
              </div>
            </div>
          )}
        </div>
        <div className="divider-dots my-4" />
        {open.length === 0 ? (
          <div className="text-center py-6 text-[13px] text-ink-soft italic">
            All clear. Nobody owes a rupee right now. <em className="display-italic">Mashallah.</em>
          </div>
        ) : (
          <ul className="space-y-1">
            {open.map((e, i) => (
              <BucketLine key={e.slug} entry={e} kind="open" delayMs={i * 50} />
            ))}
          </ul>
        )}
      </section>

      {/* Resolved */}
      <section className="mt-12">
        <div className="flex items-end justify-between mb-1">
          <div>
            <div className="eyebrow text-moss">✓ SETTLED · {closed.length}</div>
            <div className="display-italic text-[34px] leading-none mt-2">Closed books.</div>
          </div>
        </div>
        <div className="divider-dots my-4" />
        {closed.length === 0 ? (
          <div className="text-center py-6 text-[13px] text-ink-soft italic">
            No closed tickets yet.
          </div>
        ) : (
          <ul className="space-y-1">
            {closed.map((e, i) => (
              <BucketLine key={e.slug} entry={e} kind="closed" delayMs={i * 50} />
            ))}
          </ul>
        )}
      </section>

      <footer className="mt-16 text-center space-y-3">
        <div className="divider-double max-w-[180px] mx-auto" />
        <div className="eyebrow">
          NO ACCOUNTS · <span className="text-saffron">NO SIGN-IN</span> · BUILT FOR THE CREW
        </div>
        <div className="barcode max-w-[160px] mx-auto mt-4" />
        <div className="eyebrow mt-1">PRINTED · {nowStamp()}</div>
      </footer>
    </main>
  );
}

function BucketLine({
  entry,
  kind,
  delayMs,
}: {
  entry: IndexEntry;
  kind: "open" | "closed";
  delayMs: number;
}) {
  const settled = `${entry.settledCount}/${entry.participantCount}`;
  const pendingCount = entry.participantCount - entry.settledCount;

  const paid = entry.participants.filter(
    (p) => p.status === "confirmed" || p.status === "cash",
  );
  const pending = entry.participants.filter(
    (p) => p.status !== "confirmed" && p.status !== "cash",
  );
  const paidTotal = paid.reduce((s, p) => s + p.amountOwed, 0);
  const pendingTotal = pending.reduce((s, p) => s + p.amountOwed, 0);

  const dateBlock =
    kind === "closed" && entry.closedAt ? (
      <>
        <span>{fmtBillDate(entry.createdAt)}</span>
        <span className="mx-1 text-ink-faint/70">→</span>
        <span className="text-moss">{fmtBillDate(entry.closedAt)}</span>
      </>
    ) : (
      <span>{fmtBillDate(entry.createdAt)}</span>
    );

  return (
    <li
      className="relative group animate-fade-up"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <Link href={`/t/${entry.slug}`} className="block">
        <div className="line-item py-2.5 group-hover:text-saffron transition-colors">
          <div className="flex items-center gap-2 min-w-0">
            <span className="display-italic text-[20px] truncate">{entry.title}</span>
            {kind === "open" && pendingCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 border border-saffron text-saffron font-mono tracking-wider">
                {pendingCount} PENDING
              </span>
            )}
            {kind === "closed" && (
              <span className="text-[10px] text-moss font-mono tracking-wider">✓</span>
            )}
          </div>
          <span className="leader" />
          <div className="text-right shrink-0">
            <div className="display text-[18px] num">
              ₨ {entry.totalAmount.toLocaleString("en-PK")}
            </div>
            <div className="text-[10px] text-ink-faint mt-0.5 font-mono tracking-wider">
              {dateBlock} · {entry.payerName} · {settled}
            </div>
          </div>
        </div>
      </Link>

      {entry.participants.length > 0 && (
        <div
          className="
            absolute left-0 right-0 top-full mt-1 z-20
            invisible opacity-0 translate-y-1
            group-hover:visible group-hover:opacity-100 group-hover:translate-y-0
            transition-all duration-200 ease-out
            pointer-events-none
            bg-paper-light border border-ink/40 p-4 shadow-lg
          "
        >
          <div className="grid grid-cols-2 gap-4 text-[12px]">
            <div>
              <div className="eyebrow text-moss mb-2">
                ✓ PAID · {paid.length}
              </div>
              {paid.length === 0 ? (
                <div className="text-ink-faint italic text-[11px]">none yet</div>
              ) : (
                <ul className="space-y-0.5">
                  {paid.map((p, i) => (
                    <li
                      key={`paid-${i}`}
                      className="display-italic text-[15px] leading-tight flex items-baseline gap-2"
                    >
                      <span className="truncate flex-1">{p.name}</span>
                      <span className="text-[10px] font-mono num text-moss shrink-0">
                        ₨{p.amountOwed.toLocaleString("en-PK")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <div className="eyebrow text-saffron mb-2">
                ⚠ PENDING · {pending.length}
              </div>
              {pending.length === 0 ? (
                <div className="text-ink-faint italic text-[11px]">all settled</div>
              ) : (
                <ul className="space-y-0.5">
                  {pending.map((p, i) => (
                    <li
                      key={`pending-${i}`}
                      className="display-italic text-[15px] leading-tight flex items-baseline gap-2"
                    >
                      <span className="truncate flex-1">{p.name}</span>
                      <span className="text-[10px] font-mono num text-saffron shrink-0">
                        ₨{p.amountOwed.toLocaleString("en-PK")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          {(paidTotal > 0 || pendingTotal > 0) && (
            <div className="mt-3 pt-3 border-t border-dashed border-ink-faint/40 grid grid-cols-2 gap-4">
              <div className="flex items-baseline justify-between">
                <span className="eyebrow text-moss">RECEIVED</span>
                <span className="display text-[16px] num text-moss">
                  ₨{paidTotal.toLocaleString("en-PK")}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="eyebrow text-saffron">PENDING</span>
                <span className="display text-[16px] num text-saffron">
                  ₨{pendingTotal.toLocaleString("en-PK")}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
