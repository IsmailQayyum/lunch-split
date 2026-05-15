"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTicketAction } from "@/lib/actions/tickets";
import { splitEvenly } from "@/lib/shares";

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

type Row = { name: string; email: string; whatsapp: string; amount: string };

export function NewTicketForm() {
  const [payer, setPayer] = useState<PayerProfile>(emptyProfile);
  const [showPayer, setShowPayer] = useState(true);
  const [title, setTitle] = useState("");
  const [total, setTotal] = useState("");
  const [notes, setNotes] = useState("");
  const [splitMode, setSplitMode] = useState<"even" | "custom">("even");
  const [rows, setRows] = useState<Row[]>([{ name: "", email: "", whatsapp: "", amount: "" }]);
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
  const evenShares =
    splitMode === "even" && totalNum > 0 && rows.length > 0
      ? splitEvenly(totalNum, rows.length)
      : null;

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  function addRow() {
    setRows((r) => [...r, { name: "", email: "", whatsapp: "", amount: "" }]);
  }
  function removeRow(i: number) {
    setRows((r) => (r.length === 1 ? r : r.filter((_, idx) => idx !== i)));
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

    const participants = rows
      .map((r) => ({
        name: r.name.trim(),
        email: r.email.trim() || undefined,
        whatsapp: r.whatsapp.trim() || undefined,
        amount: r.amount ? Number(r.amount) : undefined,
      }))
      .filter((r) => r.name);

    if (participants.length === 0) return setError("Add at least one other person.");

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
      {/* PAYER SECTION */}
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
          <div className="text-sm">
            <span className="display-italic text-[22px]">{payer.name || "—"}</span>
            <span className="text-ink-faint ml-2 text-[11px]">
              {payer.whatsapp || payer.email || "no contact saved"}
            </span>
            <span className="text-ink-faint ml-2 text-[11px]">· saved on this device</span>
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
                <span className="text-[12px]">Cash on the spot is fine.</span>
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

      {/* PARTICIPANTS */}
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

        {splitMode === "even" && totalNum > 0 && (
          <div className="text-[11px] text-ink-faint mb-4 italic">
            Each person: ~ ₨ {Math.floor(totalNum / Math.max(rows.length, 1)).toLocaleString("en-PK")}
            <span className="ml-1 text-ink-soft">(you take the rounding remainder)</span>
          </div>
        )}

        <div className="space-y-5">
          {rows.map((r, i) => (
            <div key={i} className="space-y-3 animate-fade-up">
              <div className="flex items-baseline justify-between">
                <div className="eyebrow">ENTRY {String(i + 1).padStart(2, "0")}</div>
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    className="eyebrow text-saffron ink-link"
                  >
                    REMOVE
                  </button>
                )}
              </div>
              <div className="grid grid-cols-12 gap-x-4 gap-y-3">
                <div className="col-span-12 sm:col-span-5">
                  <Input placeholder="Name" value={r.name} onChange={(e) => updateRow(i, { name: e.target.value })} />
                </div>
                <div className="col-span-6 sm:col-span-4">
                  <Input placeholder="WhatsApp" value={r.whatsapp} onChange={(e) => updateRow(i, { whatsapp: e.target.value })} />
                </div>
                <div className="col-span-6 sm:col-span-3 num">
                  {splitMode === "custom" ? (
                    <Input
                      placeholder="₨ amount"
                      type="number"
                      value={r.amount}
                      onChange={(e) => updateRow(i, { amount: e.target.value })}
                    />
                  ) : (
                    <div className="border-b-[1.5px] border-ink-faint pb-2 text-right text-[14px] num">
                      ₨ {(evenShares ? evenShares[i] : 0).toLocaleString("en-PK")}
                    </div>
                  )}
                </div>
                <div className="col-span-12">
                  <Input placeholder="Email (optional, for reminders)" type="email" value={r.email} onChange={(e) => updateRow(i, { email: e.target.value })} />
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addRow}
          className="mt-6 eyebrow ink-link"
        >
          + ADD ANOTHER LINE
        </button>
      </section>

      <div className="divider-double" />

      {error && (
        <div className="text-[12px] text-saffron border-l-2 border-saffron pl-3 italic">
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
