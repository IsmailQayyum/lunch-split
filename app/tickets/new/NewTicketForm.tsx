"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  const [rows, setRows] = useState<Row[]>([
    { name: "", email: "", whatsapp: "", amount: "" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        setPayer({ ...emptyProfile, ...saved });
        if (saved.name) setShowPayer(false); // collapse if already saved
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
      setError("Add your name (you're the payer)");
      setShowPayer(true);
      return;
    }
    if (!title.trim()) {
      setError("Add a title");
      return;
    }
    if (!totalNum) {
      setError("Add the bill total");
      return;
    }
    const participants = rows
      .map((r) => ({
        name: r.name.trim(),
        email: r.email.trim() || undefined,
        whatsapp: r.whatsapp.trim() || undefined,
        amount: r.amount ? Number(r.amount) : undefined,
      }))
      .filter((r) => r.name);

    if (participants.length === 0) {
      setError("Add at least one other person");
      return;
    }

    // Persist payer profile for next time
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
    <div className="space-y-6">
      <Card>
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setShowPayer((v) => !v)}
        >
          <div>
            <h2 className="font-medium">Your details</h2>
            <p className="text-xs text-muted">
              {payer.name
                ? `Saved: ${payer.name}${payer.whatsapp ? " · " + payer.whatsapp : ""}`
                : "Tap to fill — saved on this device"}
            </p>
          </div>
          <span className="text-muted">{showPayer ? "−" : "+"}</span>
        </div>
        {showPayer && (
          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Your name *"
                value={payer.name}
                onChange={(v) => updatePayer({ name: v })}
                placeholder="Ismail Qayyum"
              />
              <Field
                label="WhatsApp"
                value={payer.whatsapp}
                onChange={(v) => updatePayer({ whatsapp: v })}
                placeholder="03xx-xxxxxxx"
              />
            </div>
            <Field
              label="Email (for receiving reminders if someone marks paid)"
              value={payer.email}
              onChange={(v) => updatePayer({ email: v })}
              placeholder="you@example.com"
              type="email"
            />
            <div className="border-t border-border pt-4">
              <div className="text-xs uppercase tracking-wider text-muted mb-3">
                Payment methods (shown to your colleagues so they know where to send)
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label="JazzCash"
                    value={payer.jazzcash}
                    onChange={(v) => updatePayer({ jazzcash: v })}
                    placeholder="03xx-xxxxxxx"
                  />
                  <Field
                    label="EasyPaisa"
                    value={payer.easypaisa}
                    onChange={(v) => updatePayer({ easypaisa: v })}
                    placeholder="03xx-xxxxxxx"
                  />
                </div>
                <Field
                  label="Bank IBAN / account number"
                  value={payer.iban}
                  onChange={(v) => updatePayer({ iban: v })}
                  placeholder="PKxx XXXX XXXX XXXX XXXX XXXX"
                />
                <Field
                  label="Account title"
                  value={payer.accountTitle}
                  onChange={(v) => updatePayer({ accountTitle: v })}
                  placeholder="Name on bank account"
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={payer.acceptsCash}
                    onChange={(e) => updatePayer({ acceptsCash: e.target.checked })}
                    className="h-4 w-4 rounded border-border"
                  />
                  Cash on the spot is fine
                </label>
              </div>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="font-medium mb-4">The lunch</h2>
        <div className="space-y-4">
          <Field
            label="What did you eat? *"
            value={title}
            onChange={setTitle}
            placeholder="KFC lunch — Friday"
          />
          <Field
            label="Total bill (PKR) *"
            value={total}
            onChange={setTotal}
            placeholder="3500"
            type="number"
          />
          <Field
            label="Notes"
            value={notes}
            onChange={setNotes}
            placeholder="Delivery via Foodpanda; tip included"
          />
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-medium">Who joined (not including you)</h2>
          <div className="inline-flex rounded-lg border border-border p-1 text-sm">
            <button
              type="button"
              onClick={() => setSplitMode("even")}
              className={`px-3 py-1 rounded-md ${
                splitMode === "even" ? "bg-fg text-bg" : ""
              }`}
            >
              Even
            </button>
            <button
              type="button"
              onClick={() => setSplitMode("custom")}
              className={`px-3 py-1 rounded-md ${
                splitMode === "custom" ? "bg-fg text-bg" : ""
              }`}
            >
              Custom
            </button>
          </div>
        </div>

        {splitMode === "even" && totalNum > 0 && (
          <p className="text-xs text-muted mb-3">
            Each person: ~Rs. {Math.floor(totalNum / Math.max(rows.length, 1))}
          </p>
        )}

        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <Input
                className="col-span-4"
                placeholder="Name"
                value={r.name}
                onChange={(e) => updateRow(i, { name: e.target.value })}
              />
              <Input
                className="col-span-3"
                placeholder="WhatsApp"
                value={r.whatsapp}
                onChange={(e) => updateRow(i, { whatsapp: e.target.value })}
              />
              <Input
                className="col-span-3"
                placeholder="Email (optional)"
                type="email"
                value={r.email}
                onChange={(e) => updateRow(i, { email: e.target.value })}
              />
              {splitMode === "custom" ? (
                <Input
                  className="col-span-2"
                  type="number"
                  placeholder="Rs."
                  value={r.amount}
                  onChange={(e) => updateRow(i, { amount: e.target.value })}
                />
              ) : (
                <div className="col-span-2 text-right text-sm text-muted pr-2">
                  {evenShares ? `Rs. ${evenShares[i]}` : "—"}
                </div>
              )}
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="col-span-12 text-xs text-muted hover:text-red-600 -mt-2 text-right pr-1"
              >
                remove
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addRow}
          className="mt-4 text-sm font-medium text-fg/80 hover:text-fg"
        >
          + Add another
        </button>
      </Card>

      {error && (
        <div className="text-sm text-red-600 bg-red-50/50 border border-red-200/50 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <Button onClick={submit} disabled={pending} size="lg">
          {pending ? "Creating…" : "Create ticket"}
        </Button>
      </div>
    </div>
  );
}

function Field({
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
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
      />
    </div>
  );
}
