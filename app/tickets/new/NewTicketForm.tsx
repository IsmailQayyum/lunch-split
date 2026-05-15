"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PersonPicker } from "@/components/PersonPicker";
import { createTicketAction } from "@/lib/actions/tickets";
import { splitEvenly } from "@/lib/shares";
import type { Person } from "@/lib/store-roster";

type PayerProfile = {
  name: string;
  email: string;
  whatsapp: string;
  jazzcash: string;
  easypaisa: string;
  iban: string;
  accountTitle: string;
  acceptsCash: boolean;
};

const PROFILE_KEY = "lunch-split:payer-profile";

const emptyProfile: PayerProfile = {
  name: "",
  email: "",
  whatsapp: "",
  jazzcash: "",
  easypaisa: "",
  iban: "",
  accountTitle: "",
  acceptsCash: true,
};

export function NewTicketForm({ roster: initialRoster }: { roster: Person[] }) {
  const [roster, setRoster] = useState(initialRoster);
  const [payer, setPayer] = useState<PayerProfile>(emptyProfile);
  const [showPayer, setShowPayer] = useState(true);
  const [title, setTitle] = useState("");
  const [total, setTotal] = useState("");
  const [notes, setNotes] = useState("");
  const [splitMode, setSplitMode] = useState<"even" | "custom">("even");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        setPayer({ ...emptyProfile, ...saved });
        if (saved.name) setShowPayer(false);
      }
    } catch {}
  }, []);

  const totalNum = Math.round(Number(total) || 0);
  const selected = useMemo(
    () => selectedIds.map((id) => roster.find((p) => p.id === id)).filter((x): x is Person => !!x),
    [selectedIds, roster],
  );
  const evenShares =
    splitMode === "even" && totalNum > 0 && selected.length > 0
      ? splitEvenly(totalNum, selected.length)
      : null;

  function togglePerson(id: string) {
    setSelectedIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function onPersonAdded(p: Person) {
    setRoster((r) => (r.some((x) => x.id === p.id) ? r : [...r, p]));
    setSelectedIds((s) => (s.includes(p.id) ? s : [...s, p.id]));
  }

  function updatePayer(patch: Partial<PayerProfile>) {
    setPayer((p) => ({ ...p, ...patch }));
  }

  function submit() {
    setError(null);
    if (!payer.name.trim()) {
      setError("You haven't told us your name. (You're the payer.)");
      setShowPayer(true);
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

    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(payer));
    } catch {}

    startTransition(async () => {
      try {
        await createTicketAction({
          title: title.trim(),
          totalAmount: totalNum,
          notes: notes.trim() || undefined,
          payer,
          participants,
          splitMode,
        });
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <div className="space-y-10 stagger">
      {/* PAYER */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="eyebrow text-saffron">§ 01 · YOU (THE PAYER)</div>
          <button
            type="button"
            onClick={() => setShowPayer((v) => !v)}
            className="eyebrow ink-link cursor-pointer"
          >
            {showPayer ? "COLLAPSE" : "EDIT"}
          </button>
        </div>
        {!showPayer ? (
          <div className="text-[14px]">
            <span className="display-italic text-[24px]">{payer.name || "—"}</span>
            <span className="text-ink-faint ml-2 text-[12px]">
              {payer.whatsapp || payer.email || "no contact saved"}
            </span>
            <span className="text-ink-faint ml-2 text-[12px]">· saved on this device</span>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <Pair label="YOUR NAME *" value={payer.name} onChange={(v) => updatePayer({ name: v })} placeholder="Ismail Qayyum" />
              <Pair label="WHATSAPP" value={payer.whatsapp} onChange={(v) => updatePayer({ whatsapp: v })} placeholder="03xx-xxxxxxx" />
            </div>
            <Pair label="EMAIL" value={payer.email} onChange={(v) => updatePayer({ email: v })} placeholder="you@example.com" type="email" />

            <div className="pt-2">
              <div className="eyebrow mb-3">PAYMENT METHODS</div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <Pair label="JAZZCASH" value={payer.jazzcash} onChange={(v) => updatePayer({ jazzcash: v })} placeholder="03xx-xxxxxxx" />
                <Pair label="EASYPAISA" value={payer.easypaisa} onChange={(v) => updatePayer({ easypaisa: v })} placeholder="03xx-xxxxxxx" />
              </div>
              <div className="mt-4">
                <Pair label="IBAN / BANK ACCOUNT" value={payer.iban} onChange={(v) => updatePayer({ iban: v })} placeholder="PKxx XXXX XXXX XXXX XXXX XXXX" />
              </div>
              <div className="mt-4">
                <Pair label="ACCOUNT TITLE" value={payer.accountTitle} onChange={(v) => updatePayer({ accountTitle: v })} placeholder="Name on bank account" />
              </div>
              <label className="flex items-center gap-2 mt-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={payer.acceptsCash}
                  onChange={(e) => updatePayer({ acceptsCash: e.target.checked })}
                  className="h-4 w-4 accent-[color:var(--saffron)] border-ink"
                />
                <span className="text-[13px]">Cash on the spot is fine.</span>
              </label>
            </div>
          </div>
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

      {/* PEOPLE */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="eyebrow text-saffron">§ 03 · WHO JOINED</div>
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
          roster={roster}
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
