"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { BalanceLine, PersonBalance } from "@/lib/balances";
import { bulkConfirmSharesAction, bulkMarkPaidAction } from "@/lib/actions/tickets";

function fmt(n: number) {
  return `₨ ${Math.round(n).toLocaleString("en-PK")}`;
}

function fmtDate(iso: string) {
  return new Date(iso)
    .toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
    .toUpperCase();
}

type Note = { key: string; text: string; tone: "moss" | "saffron" };

export function BalancesView({ balances }: { balances: PersonBalance[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Selection keys: `${personKey}|${direction}|${slug}`
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [actingKey, setActingKey] = useState<string | null>(null);
  const [note, setNote] = useState<Note | null>(null);

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelected = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const clearPersonSelection = (personKey: string) => {
    setSelected((prev) => {
      const next = new Set<string>();
      for (const k of prev) if (!k.startsWith(`${personKey}|`)) next.add(k);
      return next;
    });
  };

  const runConfirm = (person: PersonBalance, lines: BalanceLine[]) => {
    if (!person.email || lines.length === 0) return;
    const email = person.email;
    setActingKey(person.key);
    setNote(null);
    startTransition(async () => {
      try {
        const slugs = Array.from(new Set(lines.map((l) => l.slug)));
        const res = await bulkConfirmSharesAction(slugs.map((slug) => ({ slug, email })));
        setNote({
          key: person.key,
          tone: "moss",
          text: `${res.confirmed} CONFIRMED${res.skipped ? ` · ${res.skipped} SKIPPED` : ""}`,
        });
        clearPersonSelection(person.key);
        router.refresh();
      } catch (e) {
        setNote({ key: person.key, tone: "saffron", text: (e as Error).message });
      } finally {
        setActingKey(null);
      }
    });
  };

  const runMarkPaid = (person: PersonBalance, lines: BalanceLine[]) => {
    if (lines.length === 0) return;
    setActingKey(person.key);
    setNote(null);
    startTransition(async () => {
      try {
        const res = await bulkMarkPaidAction(Array.from(new Set(lines.map((l) => l.slug))));
        setNote({
          key: person.key,
          tone: "moss",
          text: `${res.marked} MARKED PAID${res.skipped ? ` · ${res.skipped} SKIPPED` : ""}`,
        });
        clearPersonSelection(person.key);
        router.refresh();
      } catch (e) {
        setNote({ key: person.key, tone: "saffron", text: (e as Error).message });
      } finally {
        setActingKey(null);
      }
    });
  };

  return (
    <ul className="space-y-6">
      {balances.map((person, i) => {
        const isOpen = expanded.has(person.key);
        const acting = pending && actingKey === person.key;

        const owesLines = person.owesYou.lines;
        const owedSelected = owesLines.filter((l) =>
          selected.has(`${person.key}|owesYou|${l.slug}`),
        );
        const confirmTargets = owedSelected.length > 0 ? owedSelected : owesLines;

        const payableLines = person.youOwe.lines.filter((l) => l.status === "pending");
        const paySelected = payableLines.filter((l) =>
          selected.has(`${person.key}|youOwe|${l.slug}`),
        );
        const payTargets = paySelected.length > 0 ? paySelected : payableLines;

        return (
          <li
            key={person.key}
            className="animate-fade-up"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <button
              type="button"
              onClick={() => toggleExpanded(person.key)}
              className="block w-full text-left group"
              aria-expanded={isOpen}
            >
              <div className="line-item py-2.5 transition-colors group-hover:text-saffron">
                <div className="min-w-0">
                  <div className="display-italic text-[24px] truncate leading-tight">
                    {person.name}
                  </div>
                  <div className="text-[10px] text-ink-faint font-mono tracking-wider mt-0.5">
                    {person.email ?? "NO EMAIL ON FILE"} · {isOpen ? "▾ HIDE" : "▸ DETAILS"}
                  </div>
                </div>
                <span className="leader" />
                <div className="text-right shrink-0">
                  {person.owesYou.total > 0 && (
                    <div className="text-[12px] font-mono tracking-wider text-saffron">
                      OWES YOU <span className="display text-[18px] num">{fmt(person.owesYou.total)}</span>
                      <span className="text-ink-faint">
                        {" "}
                        · {person.owesYou.lines.length} TICKET
                        {person.owesYou.lines.length === 1 ? "" : "S"}
                      </span>
                    </div>
                  )}
                  {person.youOwe.total > 0 && (
                    <div className="text-[12px] font-mono tracking-wider text-rust mt-0.5">
                      YOU OWE <span className="display text-[18px] num">{fmt(person.youOwe.total)}</span>
                      <span className="text-ink-faint">
                        {" "}
                        · {person.youOwe.lines.length} TICKET
                        {person.youOwe.lines.length === 1 ? "" : "S"}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </button>

            {isOpen && (
              <div className="mt-2 mb-2 pl-3 border-l border-dashed border-ink-faint/40">
                {owesLines.length > 0 && (
                  <section className="mb-4">
                    <div className="eyebrow text-saffron mb-2">
                      OWES YOU · {fmt(person.owesYou.total)}
                    </div>
                    <ul className="space-y-1">
                      {owesLines.map((line, j) => (
                        <ShareLine
                          key={`${line.slug}-${j}`}
                          line={line}
                          selectable={!!person.email}
                          selected={selected.has(`${person.key}|owesYou|${line.slug}`)}
                          onToggle={() => toggleSelected(`${person.key}|owesYou|${line.slug}`)}
                        />
                      ))}
                    </ul>
                    {person.email ? (
                      <button
                        type="button"
                        onClick={() => runConfirm(person, confirmTargets)}
                        disabled={pending}
                        className="btn btn-sm mt-3"
                      >
                        {acting
                          ? "CONFIRMING…"
                          : owedSelected.length > 0
                            ? `✓ CONFIRM SELECTED (${owedSelected.length})`
                            : `✓ CONFIRM ALL (${owesLines.length})`}
                      </button>
                    ) : (
                      <div className="text-[11px] text-ink-faint font-mono tracking-wider mt-2 italic">
                        No email on file — confirm on the ticket itself.
                      </div>
                    )}
                  </section>
                )}

                {person.youOwe.lines.length > 0 && (
                  <section className="mb-2">
                    <div className="eyebrow text-rust mb-2">
                      YOU OWE · {fmt(person.youOwe.total)}
                    </div>
                    <ul className="space-y-1">
                      {person.youOwe.lines.map((line, j) => (
                        <ShareLine
                          key={`${line.slug}-${j}`}
                          line={line}
                          selectable={line.status === "pending"}
                          selected={selected.has(`${person.key}|youOwe|${line.slug}`)}
                          onToggle={() => toggleSelected(`${person.key}|youOwe|${line.slug}`)}
                        />
                      ))}
                    </ul>
                    {payableLines.length > 0 && (
                      <button
                        type="button"
                        onClick={() => runMarkPaid(person, payTargets)}
                        disabled={pending}
                        className="btn-outline btn-sm mt-3"
                      >
                        {acting
                          ? "MARKING…"
                          : paySelected.length > 0
                            ? `🟡 MARK SELECTED PAID (${paySelected.length})`
                            : `🟡 MARK ALL PAID (${payableLines.length})`}
                      </button>
                    )}
                  </section>
                )}

                {note && note.key === person.key && (
                  <div
                    className={`text-[11px] font-mono tracking-wider mt-2 ${
                      note.tone === "moss" ? "text-moss" : "text-saffron"
                    }`}
                  >
                    {note.text}
                  </div>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ShareLine({
  line,
  selectable,
  selected,
  onToggle,
}: {
  line: BalanceLine;
  selectable: boolean;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="line-item py-1.5">
      {selectable ? (
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={selected}
          className={`shrink-0 inline-flex items-center justify-center w-5 h-5 mr-2 border-[1.5px] transition-colors ${
            selected ? "border-saffron bg-saffron text-paper-light" : "border-ink-faint"
          }`}
        >
          {selected ? "✓" : ""}
        </button>
      ) : (
        <span
          className="shrink-0 inline-flex items-center justify-center w-5 h-5 mr-2 border-[1.5px] border-ink-faint/30 bg-ink-faint/10 text-ink-faint"
          aria-hidden
        >
          ·
        </span>
      )}
      <div className="flex items-center gap-2 min-w-0">
        <Link
          href={`/t/${line.slug}`}
          className="ink-link text-[14px] truncate"
          title={line.title}
        >
          {line.title}
        </Link>
        {line.status === "self_marked" && (
          <span className="text-[10px] px-1.5 py-0.5 border border-saffron text-saffron font-mono tracking-wider shrink-0">
            🟡 SAYS PAID
          </span>
        )}
      </div>
      <span className="leader" />
      <div className="text-right shrink-0">
        <span className="display text-[15px] num">{fmt(line.amount)}</span>
        <span className="text-[10px] text-ink-faint font-mono tracking-wider ml-2">
          {fmtDate(line.createdAt)}
        </span>
      </div>
    </li>
  );
}
