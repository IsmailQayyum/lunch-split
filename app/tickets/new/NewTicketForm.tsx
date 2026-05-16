"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PersonPicker } from "@/components/PersonPicker";
import { PayerPicker } from "@/components/PayerPicker";
import { createTicketAction } from "@/lib/actions/tickets";
import { splitEvenly } from "@/lib/shares";
import type { Person } from "@/lib/store-roster";

const ME_KEY = "lunch-split:me-id";

export function NewTicketForm({
  roster: initialRoster,
  initialTitle = "",
  initialTotal = "",
}: {
  roster: Person[];
  initialTitle?: string;
  initialTotal?: string;
}) {
  const [roster, setRoster] = useState(initialRoster);
  const [payerId, setPayerId] = useState<string | null>(null);

  const [title, setTitle] = useState(initialTitle);
  const [total, setTotal] = useState(initialTotal);
  const [notes, setNotes] = useState("");
  const [splitMode, setSplitMode] = useState<"even" | "custom">("even");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    try {
      const saved = localStorage.getItem(ME_KEY);
      if (saved && roster.some((p) => p.id === saved)) setPayerId(saved);
    } catch {}
  }, [roster]);

  const totalNum = Math.round(Number(total) || 0);
  const payer = payerId ? roster.find((p) => p.id === payerId) : null;
  const selected = useMemo(
    () => selectedIds.map((id) => roster.find((p) => p.id === id)).filter((x): x is Person => !!x),
    [selectedIds, roster],
  );
  const evenShares =
    splitMode === "even" && totalNum > 0 && selected.length > 0
      ? splitEvenly(totalNum, selected.length)
      : null;

  function togglePerson(id: string) {
    if (id === payerId) return; // don't add payer to participants
    setSelectedIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function onPersonAdded(p: Person) {
    setRoster((r) => (r.some((x) => x.id === p.id) ? r : [...r, p]));
    if (!payerId) {
      // Default the new person to the payer if none picked yet — common pattern
    }
    setSelectedIds((s) => (s.includes(p.id) ? s : [...s, p.id]));
  }

  function selectAsPayer(id: string) {
    setPayerId(id);
    setSelectedIds((s) => s.filter((x) => x !== id));
    try {
      localStorage.setItem(ME_KEY, id);
    } catch {}
  }

  function submit() {
    setError(null);
    if (!payer) {
      setError("Pick yourself as the payer first.");
      return;
    }
    if (!title.trim()) return setError("What did you eat? Give it a title.");
    if (!totalNum) return setError("Bill total needs a number.");
    if (selected.length === 0) return setError("Pick at least one person.");

    const participants = selected.map((p, i) => ({
      name: p.name,
      email: p.email ?? undefined,
      whatsapp: p.whatsapp ?? undefined,
      amount:
        splitMode === "custom"
          ? Number(customAmounts[p.id] ?? "0") || 0
          : evenShares
            ? evenShares[i]
            : undefined,
    }));

    startTransition(async () => {
      try {
        await createTicketAction({
          title: title.trim(),
          totalAmount: totalNum,
          notes: notes.trim() || undefined,
          payer: {
            name: payer.name,
            email: payer.email ?? undefined,
            whatsapp: payer.whatsapp ?? undefined,
            walletNumber: payer.walletNumber ?? undefined,
            walletApps: payer.walletApps ?? [],
            iban: payer.iban ?? undefined,
            accountTitle: payer.accountTitle ?? undefined,
            acceptsCash: payer.acceptsCash,
          },
          participants,
          splitMode,
        });
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  const payerHasMethod = payer && (payer.walletNumber || payer.iban || payer.acceptsCash);

  return (
    <div className="space-y-10 stagger">
      {/* PAYER */}
      <section>
        <div className="eyebrow mb-4 text-saffron">§ 01 · WHO PAID</div>
        {roster.length === 0 ? (
          <div className="text-[13px] text-ink-soft italic border border-dashed border-ink-faint/50 p-4 text-center">
            Empty roster.{" "}
            <Link href="/people" className="ink-link">
              Add the lunch crew first →
            </Link>
          </div>
        ) : (
          <>
            <PayerPicker
              roster={roster}
              selectedId={payerId}
              onSelect={selectAsPayer}
              onAdded={(p) => setRoster((r) => (r.some((x) => x.id === p.id) ? r : [...r, p]))}
            />
            {payer && !payerHasMethod && (
              <div className="mt-4 text-[12px] text-saffron italic">
                Heads up — {payer.name} has no payment methods saved.{" "}
                <Link href="/people" className="ink-link">
                  Add them in the roster →
                </Link>
              </div>
            )}
            {payer && payerHasMethod && (
              <div className="mt-4 text-[12px] text-ink-soft">
                Payment via{" "}
                {[
                  payer.walletNumber && `Mobile (${payer.walletApps.length} apps)`,
                  payer.iban && "Bank",
                  payer.acceptsCash && "Cash",
                ]
                  .filter(Boolean)
                  .join(" · ")}{" "}
                <Link href="/people" className="ink-link ml-1">
                  edit →
                </Link>
              </div>
            )}
          </>
        )}
      </section>

      <div className="divider-dots" />

      {/* THE LUNCH */}
      <section>
        <div className="eyebrow mb-4 text-saffron">§ 02 · THE LUNCH</div>
        <div className="space-y-6">
          <Pair label="WHAT'D YOU EAT? *" value={title} onChange={setTitle} placeholder="Karahi Friday at Bundu Khan" />
          <Pair label="TOTAL (PKR) *" value={total} onChange={setTotal} placeholder="3500" type="number" />
          <Pair label="NOTES (OPTIONAL)" value={notes} onChange={setNotes} placeholder="Tip included; Foodpanda delivery" />
        </div>
      </section>

      <div className="divider-dots" />

      {/* PARTICIPANTS */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="eyebrow text-saffron">§ 03 · WHO ELSE JOINED</div>
          <div className="inline-flex border-[1.5px] border-ink text-[10px] font-mono">
            <button
              type="button"
              onClick={() => setSplitMode("even")}
              className={`px-3 py-1 uppercase tracking-wide transition ${
                splitMode === "even"
                  ? "bg-ink text-paper-light"
                  : "hover:bg-paper-deep"
              }`}
            >
              Even
            </button>
            <button
              type="button"
              onClick={() => setSplitMode("custom")}
              className={`px-3 py-1 uppercase tracking-wide transition border-l-[1.5px] border-ink ${
                splitMode === "custom"
                  ? "bg-ink text-paper-light"
                  : "hover:bg-paper-deep"
              }`}
            >
              Custom
            </button>
          </div>
        </div>

        <PersonPicker
          roster={roster.filter((p) => p.id !== payerId)}
          selectedIds={selectedIds}
          onToggle={togglePerson}
          onAdded={onPersonAdded}
        />

        {selected.length > 0 && (
          <div className="mt-6 space-y-3 animate-fade-up">
            <div className="eyebrow">
              {selected.length} SELECTED ·{" "}
              {splitMode === "even" && totalNum > 0 ? (
                <span>~₨ {Math.floor(totalNum / selected.length).toLocaleString("en-PK")} each</span>
              ) : (
                <span>set shares below</span>
              )}
            </div>

            <div className="space-y-2">
              {selected.map((p, i) => (
                <div key={p.id} className="line-item">
                  <span className="display-italic text-[19px]">{p.name}</span>
                  <span className="leader" />
                  {splitMode === "custom" ? (
                    <div className="w-28">
                      <Input
                        type="number"
                        placeholder="₨"
                        value={customAmounts[p.id] ?? ""}
                        onChange={(e) =>
                          setCustomAmounts((m) => ({ ...m, [p.id]: e.target.value }))
                        }
                        className="text-right"
                      />
                    </div>
                  ) : (
                    <span className="display text-[20px] num">
                      ₨ {(evenShares ? evenShares[i] : 0).toLocaleString("en-PK")}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 eyebrow">
          <Link href="/people" className="ink-link">
            ⋯ MANAGE THE FULL ROSTER →
          </Link>
        </div>
      </section>

      <div className="divider-double" />

      {error && (
        <div className="text-[13px] text-saffron border-l-2 border-saffron pl-3 italic">
          {error}
        </div>
      )}

      <div className="flex flex-col items-center gap-4 pt-2">
        <Button onClick={submit} disabled={pending} size="lg">
          {pending ? "Printing…" : "↓ Print this ticket"}
        </Button>
        <div className="eyebrow text-ink-faint">NO CONFIRMATIONS · INSTANT</div>
      </div>
    </div>
  );
}

function Pair({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} type={type} />
    </div>
  );
}
