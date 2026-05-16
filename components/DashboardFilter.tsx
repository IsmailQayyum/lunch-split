"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { IndexEntry } from "@/lib/tickets-index";

type Props = {
  entries: IndexEntry[];
};

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
    .toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
    .toUpperCase();
}

type DatePreset = "all" | "today" | "week" | "month";

export default function DashboardFilter({ entries }: Props) {
  const [query, setQuery] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");

  const filtered = useMemo(() => {
    let results = entries;

    // Text search
    const q = query.trim().toLowerCase();
    if (q) {
      results = results.filter((e) => {
        const haystack = [
          e.title,
          e.payerName,
          ...e.participants.map((p) => p.name),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
    }

    // Date filter
    if (datePreset !== "all") {
      const now = new Date();
      let cutoff: Date;
      if (datePreset === "today") {
        cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (datePreset === "week") {
        cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else {
        cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }
      results = results.filter((e) => new Date(e.createdAt) >= cutoff);
    }

    return results;
  }, [entries, query, datePreset]);

  const open = filtered
    .filter((e) => e.status === "open")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const closed = filtered
    .filter((e) => e.status === "closed")
    .sort(
      (a, b) =>
        (b.closedAt ?? b.createdAt).localeCompare(a.closedAt ?? a.createdAt),
    );

  const stillOwed = open.reduce((s, e) => {
    const pendingTotal = e.participants
      .filter((p) => p.status !== "confirmed" && p.status !== "cash")
      .reduce((x, p) => x + p.amountOwed, 0);
    if (pendingTotal === 0 && e.participants.length === 0) {
      return (
        s +
        e.totalAmount *
          Math.max(0, 1 - e.settledCount / Math.max(1, e.participantCount))
      );
    }
    return s + pendingTotal;
  }, 0);

  const hasFilters = query.trim() !== "" || datePreset !== "all";

  return (
    <>
      {/* Search + filters */}
      <div className="space-y-3 mb-8">
        <div className="relative">
          <span className="absolute left-0 top-1/2 -translate-y-1/2 text-ink-faint text-[13px]">
            /
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tickets, payers, people..."
            className="field-underline pl-4 text-[13px]"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-0 top-1/2 -translate-y-1/2 text-ink-faint hover:text-saffron text-[11px] font-mono tracking-wider"
            >
              CLEAR
            </button>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {(["all", "today", "week", "month"] as DatePreset[]).map((p) => (
            <button
              key={p}
              onClick={() => setDatePreset(p)}
              className={`text-[10px] font-mono tracking-wider px-2.5 py-1 border transition-colors ${
                datePreset === p
                  ? "border-ink bg-ink text-paper-light"
                  : "border-ink-faint/40 text-ink-faint hover:border-ink hover:text-ink"
              }`}
            >
              {p === "all"
                ? "ALL TIME"
                : p === "today"
                  ? "TODAY"
                  : p === "week"
                    ? "THIS WEEK"
                    : "THIS MONTH"}
            </button>
          ))}
        </div>
        {hasFilters && (
          <div className="text-[10px] font-mono tracking-wider text-ink-faint">
            {filtered.length} TICKET{filtered.length !== 1 ? "S" : ""} FOUND
            {hasFilters && (
              <button
                onClick={() => {
                  setQuery("");
                  setDatePreset("all");
                }}
                className="ml-3 text-saffron hover:underline"
              >
                RESET
              </button>
            )}
          </div>
        )}
      </div>

      {/* Unresolved */}
      <section>
        <div className="flex items-end justify-between mb-1">
          <div>
            <div className="eyebrow text-saffron">
              ⚠ UNRESOLVED · {open.length}
            </div>
            <div className="display-italic text-[34px] leading-none mt-2">
              Still owed.
            </div>
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
            {hasFilters ? (
              "No matching open tickets."
            ) : (
              <>
                All clear. Nobody owes a rupee right now.{" "}
                <em className="display-italic">Mashallah.</em>
              </>
            )}
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
            <div className="display-italic text-[34px] leading-none mt-2">
              Closed books.
            </div>
          </div>
        </div>
        <div className="divider-dots my-4" />
        {closed.length === 0 ? (
          <div className="text-center py-6 text-[13px] text-ink-soft italic">
            {hasFilters ? "No matching closed tickets." : "No closed tickets yet."}
          </div>
        ) : (
          <ul className="space-y-1">
            {closed.map((e, i) => (
              <BucketLine
                key={e.slug}
                entry={e}
                kind="closed"
                delayMs={i * 50}
              />
            ))}
          </ul>
        )}
      </section>
    </>
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
      className="relative group animate-fade-up hover:z-30"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <Link href={`/t/${entry.slug}`} className="block">
        <div className="line-item py-2.5 group-hover:text-saffron transition-colors">
          <div className="flex items-center gap-2 min-w-0">
            <span className="display-italic text-[20px] truncate">
              {entry.title}
            </span>
            {kind === "open" && pendingCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 border border-saffron text-saffron font-mono tracking-wider">
                {pendingCount} PENDING
              </span>
            )}
            {kind === "closed" && (
              <span className="text-[10px] text-moss font-mono tracking-wider">
                ✓
              </span>
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
            absolute left-0 right-0 top-full mt-1 z-30
            invisible opacity-0 translate-y-1
            group-hover:visible group-hover:opacity-100 group-hover:translate-y-0
            transition-all duration-200 ease-out
            pointer-events-none
            bg-paper-light border-[1.5px] border-ink p-4 shadow-xl
          "
        >
          <div className="grid grid-cols-2 gap-4 text-[12px]">
            <div>
              <div className="eyebrow text-moss mb-2">✓ PAID · {paid.length}</div>
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
                <div className="text-ink-faint italic text-[11px]">
                  all settled
                </div>
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
