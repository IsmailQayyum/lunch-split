"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import type { IndexEntry } from "@/lib/tickets-index";
import { isSettled } from "@/lib/types";
import { bulkDeleteTicketsAction } from "@/lib/actions/tickets";
import { computeBalances } from "@/lib/balances";
import { BalancesView } from "./BalancesView";

type Props = {
  entries: IndexEntry[];
  viewerEmail: string | null;
  isAdmin?: boolean;
  youOwe?: number;
  owedToYou?: number;
  youOweCount?: number;
  owedToYouCount?: number;
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
type ViewMode = "tickets" | "person";

export default function DashboardFilter({
  entries,
  viewerEmail,
  isAdmin = false,
  youOwe = 0,
  owedToYou = 0,
  youOweCount = 0,
  owedToYouCount = 0,
}: Props) {
  const loggedIn = viewerEmail !== null;
  const showBalances = loggedIn && (youOwe > 0 || owedToYou > 0);
  const [query, setQuery] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("tickets");
  const personMode = loggedIn && viewMode === "person";

  // Bulk-delete state
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dateFiltered = useMemo(() => {
    if (datePreset === "all") return entries;
    const now = new Date();
    let cutoff: Date;
    if (datePreset === "today") {
      cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (datePreset === "week") {
      cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else {
      cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
    return entries.filter((e) => new Date(e.createdAt) >= cutoff);
  }, [entries, datePreset]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return dateFiltered;
    return dateFiltered.filter((e) => {
      const haystack = [
        e.title,
        e.payerName,
        ...e.participants.map((p) => p.name),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [dateFiltered, query]);

  // Person-centric pivot of the same (date-filtered) tickets; the search box
  // matches people rather than tickets in this mode.
  const personBalances = useMemo(() => {
    if (!personMode || !viewerEmail) return [];
    const balances = computeBalances(dateFiltered, viewerEmail);
    const q = query.trim().toLowerCase();
    if (!q) return balances;
    return balances.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        (b.email ?? "").includes(q) ||
        b.owesYou.lines.some((l) => l.title.toLowerCase().includes(q)) ||
        b.youOwe.lines.some((l) => l.title.toLowerCase().includes(q)),
    );
  }, [personMode, viewerEmail, dateFiltered, query]);

  const open = filtered
    .filter((e) => e.status === "open")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const closed = filtered
    .filter((e) => e.status === "closed")
    .sort(
      (a, b) =>
        (b.closedAt ?? b.createdAt).localeCompare(a.closedAt ?? a.createdAt),
    );

  // Personal split of open tickets — only meaningful when logged in.
  const viewerParticipantOf = (e: IndexEntry) =>
    viewerEmail ? e.participants.find((p) => p.email === viewerEmail) ?? null : null;
  const isViewerPayerOf = (e: IndexEntry) =>
    !!viewerEmail && e.payerEmail === viewerEmail;
  const viewerSettledOn = (e: IndexEntry) => {
    const p = viewerParticipantOf(e);
    return !!p && isSettled(p.status);
  };

  const toPay = loggedIn
    ? open
        .filter((e) => !isViewerPayerOf(e) && viewerParticipantOf(e) !== null)
        .sort((a, b) => {
          const aDone = viewerSettledOn(a);
          const bDone = viewerSettledOn(b);
          if (aDone !== bDone) return aDone ? 1 : -1;
          return b.createdAt.localeCompare(a.createdAt);
        })
    : [];
  const toCollect = loggedIn ? open.filter((e) => isViewerPayerOf(e)) : [];
  const otherOpen = loggedIn
    ? open.filter((e) => !isViewerPayerOf(e) && viewerParticipantOf(e) === null)
    : [];

  const stillOwed = open.reduce((s, e) => {
    const pendingTotal = e.participants
      .filter((p) => !isSettled(p.status))
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

  function toggleSelect(slug: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
    setPwdError(null);
  }

  function selectAllVisible() {
    const all = new Set<string>();
    for (const e of filtered) {
      if (isAdmin || (viewerEmail && e.payerEmail === viewerEmail)) all.add(e.slug);
    }
    setSelected(all);
  }

  function runBulkDelete() {
    setPwdError(null);
    const slugs = Array.from(selected);
    if (slugs.length === 0) return;
    startTransition(async () => {
      try {
        const res = await bulkDeleteTicketsAction(slugs);
        exitSelectMode();
        if (res && typeof res.skipped === "number" && res.skipped > 0) {
          console.warn(
            `Bulk delete: ${res.deleted} deleted, ${res.skipped} skipped (not owned)`,
          );
        }
      } catch (e) {
        setPwdError((e as Error).message || "Delete failed.");
      }
    });
  }

  return (
    <>
      {/* Search + filters */}
      <div className="space-y-3 mb-8">
        {loggedIn && (
          <div className="flex" role="tablist" aria-label="Dashboard view">
            {(
              [
                ["tickets", "☰ BY TICKETS"],
                ["person", "◉ BY PERSON"],
              ] as [ViewMode, string][]
            ).map(([mode, label]) => (
              <button
                key={mode}
                role="tab"
                aria-selected={viewMode === mode}
                onClick={() => {
                  setViewMode(mode);
                  if (mode === "person") exitSelectMode();
                }}
                className={`flex-1 text-[11px] font-mono tracking-wider px-3 py-2 border transition-colors ${
                  viewMode === mode
                    ? "border-ink bg-ink text-paper-light"
                    : "border-ink-faint/40 text-ink-faint hover:border-ink hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="relative">
          <span className="absolute left-0 top-1/2 -translate-y-1/2 text-ink-faint text-[13px]">
            /
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              personMode
                ? "Search people, tickets..."
                : "Search tickets, payers, people..."
            }
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
        <div className="flex gap-2 flex-wrap items-center">
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
          <span className="flex-1" />
          {personMode ? null : !selectMode ? (
            (viewerEmail || isAdmin) && (
              <button
                type="button"
                onClick={() => setSelectMode(true)}
                className="text-[10px] font-mono tracking-wider px-2.5 py-1 border border-saffron/50 text-saffron hover:border-saffron transition-colors"
              >
                ✕ DELETE BILLS
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={exitSelectMode}
              className="text-[10px] font-mono tracking-wider px-2.5 py-1 border border-ink-faint/40 text-ink-faint hover:border-ink hover:text-ink transition-colors"
            >
              CANCEL
            </button>
          )}
        </div>
        {hasFilters && (
          <div className="text-[10px] font-mono tracking-wider text-ink-faint">
            {personMode
              ? `${personBalances.length} ${personBalances.length === 1 ? "PERSON" : "PEOPLE"} FOUND`
              : `${filtered.length} TICKET${filtered.length !== 1 ? "S" : ""} FOUND`}
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
        {selectMode && (
          <div className="text-[11px] font-mono tracking-wider text-saffron flex items-center gap-3 border-t border-dashed border-saffron/40 pt-3">
            <span>
              SELECT MODE · {selected.size} OF {filtered.length} TICKETS PICKED
            </span>
            <button
              type="button"
              onClick={selectAllVisible}
              className="text-ink-faint hover:text-ink underline-offset-2 hover:underline"
            >
              SELECT ALL VISIBLE
            </button>
            {selected.size > 0 && (
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-ink-faint hover:text-ink underline-offset-2 hover:underline"
              >
                CLEAR
              </button>
            )}
          </div>
        )}
      </div>

      {/* Personal balance — only when logged in and there's something to show */}
      {showBalances && (
        <section className="mb-10">
          <div className="grid grid-cols-2 gap-4">
            <div className="border-[1.5px] border-ink p-4">
              <div className="eyebrow text-saffron">⚠ BILLS YOU&apos;RE SETTLING</div>
              <div className="display text-[24px] num mt-2 text-saffron">
                ₨ {Math.round(youOwe).toLocaleString("en-PK")}
              </div>
              <div className="text-[10px] text-ink-faint mt-1 font-mono tracking-wider">
                {youOweCount === 0
                  ? "ALL CLEAR"
                  : `ACROSS ${youOweCount} OPEN TICKET${youOweCount !== 1 ? "S" : ""}`}
              </div>
            </div>
            <div className="border-[1.5px] border-ink p-4">
              <div className="eyebrow text-moss">✓ BILLS PEOPLE OWE YOU</div>
              <div className="display text-[24px] num mt-2 text-moss">
                ₨ {Math.round(owedToYou).toLocaleString("en-PK")}
              </div>
              <div className="text-[10px] text-ink-faint mt-1 font-mono tracking-wider">
                {owedToYouCount === 0
                  ? "ALL CLEAR"
                  : `ACROSS ${owedToYouCount} OPEN TICKET${owedToYouCount !== 1 ? "S" : ""}`}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Person-centric view — same tickets pivoted by counterparty */}
      {personMode ? (
        <section>
          <div className="flex items-end justify-between mb-1">
            <div>
              <div className="eyebrow text-saffron">
                ◉ BY PERSON · {personBalances.length}
              </div>
              <div className="display-italic text-[34px] leading-none mt-2">
                Who owes whom.
              </div>
            </div>
          </div>
          <div className="divider-dots my-4" />
          {personBalances.length === 0 ? (
            <div className="text-center py-6 text-[13px] text-ink-soft italic">
              {hasFilters ? (
                "No matching people."
              ) : (
                <>
                  All square. Nobody owes anybody a rupee.{" "}
                  <em className="display-italic">Mashallah.</em>
                </>
              )}
            </div>
          ) : (
            <BalancesView balances={personBalances} />
          )}
        </section>
      ) : !loggedIn ? (
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
                  <Link href="/login" className="ink-link">
                    Log in
                  </Link>{" "}
                  to see your tickets.
                </>
              )}
            </div>
          ) : (
            <ul className="space-y-1">
              {open.map((e, i) => (
                <BucketLine
                  key={e.slug}
                  entry={e}
                  kind="open"
                  delayMs={i * 50}
                  selectMode={selectMode}
                  selected={selected.has(e.slug)}
                  onToggle={toggleSelect}
                  canSelect={isAdmin || (!!viewerEmail && e.payerEmail === viewerEmail)}
                  viewerEmail={viewerEmail}
                />
              ))}
            </ul>
          )}
        </section>
      ) : (
        <>
          {/* Yours to pay */}
          <OpenSection
            title="Your share."
            eyebrow={`⚠ YOURS TO PAY · ${toPay.length}`}
            eyebrowTone="saffron"
            entries={toPay}
            selectMode={selectMode}
            selected={selected}
            onToggle={toggleSelect}
            isAdmin={isAdmin}
            viewerEmail={viewerEmail}
            emptyHint={null}
          />

          {/* Yours to collect */}
          <div className={toPay.length > 0 ? "mt-12" : ""}>
            <OpenSection
              title="Awaiting payment."
              eyebrow={`✓ YOURS TO COLLECT · ${toCollect.length}`}
              eyebrowTone="moss"
              entries={toCollect}
              selectMode={selectMode}
              selected={selected}
              onToggle={toggleSelect}
              isAdmin={isAdmin}
              viewerEmail={viewerEmail}
              emptyHint={null}
            />
          </div>

          {/* Other open tickets — only relevant for admins viewing the wider set */}
          {otherOpen.length > 0 && (
            <div className="mt-12">
              <OpenSection
                title="Other open tickets."
                eyebrow={`○ OTHER OPEN · ${otherOpen.length}`}
                eyebrowTone="ink"
                entries={otherOpen}
                selectMode={selectMode}
                selected={selected}
                onToggle={toggleSelect}
                isAdmin={isAdmin}
                viewerEmail={viewerEmail}
                emptyHint={null}
              />
            </div>
          )}

          {/* Empty state when literally nothing is open */}
          {open.length === 0 && (
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
          )}
        </>
      )}

      {/* Resolved — ticket view only */}
      {!personMode && (
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
            {hasFilters
              ? "No matching closed tickets."
              : !loggedIn
                ? "Settled bills will show up here once you log in."
                : "No closed tickets yet."}
          </div>
        ) : (
          <ul className="space-y-1">
            {closed.map((e, i) => (
              <BucketLine
                key={e.slug}
                entry={e}
                kind="closed"
                delayMs={i * 50}
                selectMode={selectMode}
                selected={selected.has(e.slug)}
                onToggle={toggleSelect}
                canSelect={isAdmin || (!!viewerEmail && e.payerEmail === viewerEmail)}
                viewerEmail={viewerEmail}
              />
            ))}
          </ul>
        )}
      </section>
      )}

      {/* Bottom action bar — only when in select mode + something picked */}
      {selectMode && selected.size > 0 && (
        <div
          className="
            fixed bottom-0 left-0 right-0 z-50 bg-paper-light border-t-[1.5px] border-ink
            shadow-[0_-8px_24px_rgba(21,17,11,0.15)]
          "
        >
          <div className="max-w-[560px] mx-auto px-5 py-3 flex items-center gap-3 flex-wrap">
            <div className="text-[12px] font-mono tracking-wider flex-1">
              <span className="text-saffron">
                DELETE {selected.size} BILL{selected.size !== 1 ? "S" : ""}
              </span>
              <span className="text-ink-faint ml-2">· {isAdmin ? "admin" : "yours only"}</span>
            </div>
            <button
              type="button"
              onClick={runBulkDelete}
              disabled={pending}
              className="
                text-[11px] font-mono tracking-wider px-3 py-1.5
                bg-saffron text-paper-light border border-saffron
                hover:bg-paper-light hover:text-saffron transition-colors
                disabled:opacity-40 disabled:cursor-not-allowed
              "
            >
              {pending ? "DELETING…" : `✕ DELETE ${selected.size}`}
            </button>
            <button
              type="button"
              onClick={exitSelectMode}
              disabled={pending}
              className="text-[11px] font-mono tracking-wider text-ink-faint hover:text-ink"
            >
              CANCEL
            </button>
            {pwdError && (
              <div className="w-full text-[11px] text-saffron font-mono tracking-wider">
                {pwdError}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function OpenSection({
  title,
  eyebrow,
  eyebrowTone,
  entries,
  selectMode,
  selected,
  onToggle,
  isAdmin,
  viewerEmail,
  emptyHint,
}: {
  title: string;
  eyebrow: string;
  eyebrowTone: "saffron" | "moss" | "ink";
  entries: IndexEntry[];
  selectMode: boolean;
  selected: Set<string>;
  onToggle: (slug: string) => void;
  isAdmin: boolean;
  viewerEmail: string | null;
  emptyHint: string | null;
}) {
  if (entries.length === 0 && !emptyHint) return null;
  const toneClass =
    eyebrowTone === "saffron"
      ? "text-saffron"
      : eyebrowTone === "moss"
        ? "text-moss"
        : "text-ink-faint";
  return (
    <section>
      <div className="flex items-end justify-between mb-1">
        <div>
          <div className={`eyebrow ${toneClass}`}>{eyebrow}</div>
          <div className="display-italic text-[34px] leading-none mt-2">
            {title}
          </div>
        </div>
      </div>
      <div className="divider-dots my-4" />
      {entries.length === 0 ? (
        <div className="text-center py-6 text-[13px] text-ink-soft italic">
          {emptyHint}
        </div>
      ) : (
        <ul className="space-y-1">
          {entries.map((e, i) => (
            <BucketLine
              key={e.slug}
              entry={e}
              kind="open"
              delayMs={i * 50}
              selectMode={selectMode}
              selected={selected.has(e.slug)}
              onToggle={onToggle}
              canSelect={isAdmin || (!!viewerEmail && e.payerEmail === viewerEmail)}
              viewerEmail={viewerEmail}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function BucketLine({
  entry,
  kind,
  delayMs,
  selectMode,
  selected,
  onToggle,
  canSelect,
  viewerEmail,
}: {
  entry: IndexEntry;
  kind: "open" | "closed";
  delayMs: number;
  selectMode: boolean;
  selected: boolean;
  onToggle: (slug: string) => void;
  canSelect: boolean;
  viewerEmail: string | null;
}) {
  const settled = `${entry.settledCount}/${entry.participantCount}`;
  const pendingCount = entry.participantCount - entry.settledCount;

  const paid = entry.participants.filter((p) => isSettled(p.status));
  const pending = entry.participants.filter((p) => !isSettled(p.status));
  const paidTotal = paid.reduce((s, p) => s + p.amountOwed, 0);
  const pendingTotal = pending.reduce((s, p) => s + p.amountOwed, 0);

  const isViewerPayer = !!viewerEmail && entry.payerEmail === viewerEmail;
  const viewerShare =
    viewerEmail && !isViewerPayer
      ? entry.participants.find((p) => p.email === viewerEmail) ?? null
      : null;
  const viewerShareSettled = !!viewerShare && isSettled(viewerShare.status);

  let personalLine: { text: string; tone: "saffron" | "moss" } | null = null;
  if (kind === "open") {
    if (isViewerPayer && pendingTotal > 0) {
      personalLine = {
        text: `₨${Math.round(pendingTotal).toLocaleString("en-PK")} pending`,
        tone: "saffron",
      };
    } else if (viewerShare) {
      personalLine = viewerShareSettled
        ? {
            text: `you paid ₨${Math.round(viewerShare.amountOwed).toLocaleString("en-PK")}`,
            tone: "moss",
          }
        : {
            text: `you owe ₨${Math.round(viewerShare.amountOwed).toLocaleString("en-PK")}`,
            tone: "saffron",
          };
    }
  }

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

  const innerLine = (
    <div
      className={`line-item py-2.5 transition-colors ${
        selectMode
          ? selected
            ? "text-saffron"
            : ""
          : "group-hover:text-saffron"
      }`}
    >
      {selectMode && (
        <span
          className={`shrink-0 inline-flex items-center justify-center w-5 h-5 mr-2 border-[1.5px] ${
            !canSelect
              ? "border-ink-faint/30 bg-ink-faint/10 text-ink-faint"
              : selected
                ? "border-saffron bg-saffron text-paper-light"
                : "border-ink-faint"
          }`}
          aria-hidden
        >
          {!canSelect ? "·" : selected ? "✓" : ""}
        </span>
      )}
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
        {personalLine && (
          <div
            className={`text-[10px] mt-0.5 font-mono tracking-wider ${
              personalLine.tone === "saffron" ? "text-saffron" : "text-moss"
            }`}
          >
            {personalLine.text}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <li
      className={`relative group animate-fade-up ${selectMode ? "" : "hover:z-30"}`}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      {selectMode ? (
        canSelect ? (
          <button
            type="button"
            onClick={() => onToggle(entry.slug)}
            className="block w-full text-left"
            aria-pressed={selected}
          >
            {innerLine}
          </button>
        ) : (
          <div className="block w-full text-left opacity-60 cursor-not-allowed" aria-disabled>
            {innerLine}
          </div>
        )
      ) : (
        <Link href={`/t/${entry.slug}`} className="block">
          {innerLine}
        </Link>
      )}

      {!selectMode && entry.participants.length > 0 && (
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
