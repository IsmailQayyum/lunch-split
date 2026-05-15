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

function relTime(iso: string) {
  const t = new Date(iso).getTime();
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
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

  const unresolvedTotal = open.reduce((s, e) => s + e.totalAmount, 0);
  const stillOwed = open.reduce(
    (s, e) => s + e.totalAmount * Math.max(0, 1 - e.settledCount / Math.max(1, e.participantCount)),
    0,
  );

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

      {/* CTA */}
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

      {/* Unresolved bucket */}
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

      {/* Resolved bucket */}
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

      {/* Footer */}
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
  return (
    <li className="animate-fade-up" style={{ animationDelay: `${delayMs}ms` }}>
      <Link href={`/t/${entry.slug}`} className="group block">
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
            <div className="text-[10px] text-ink-faint mt-0.5">
              {entry.payerName} · {settled} · {relTime(entry.createdAt)}
            </div>
          </div>
        </div>
      </Link>
    </li>
  );
}
