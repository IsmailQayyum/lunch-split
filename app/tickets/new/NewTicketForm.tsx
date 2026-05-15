"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTicketAction } from "@/lib/actions/tickets";
import { splitEvenly } from "@/lib/shares";

type Row = { email: string; name?: string; amount?: string };

export function NewTicketForm({ allowedDomain }: { allowedDomain: string }) {
  const [title, setTitle] = useState("");
  const [total, setTotal] = useState("");
  const [notes, setNotes] = useState("");
  const [splitMode, setSplitMode] = useState<"even" | "custom">("even");
  const [rows, setRows] = useState<Row[]>([{ email: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const totalNum = Math.round(Number(total) || 0);
  const evenShares =
    splitMode === "even" && totalNum > 0 && rows.length > 0
      ? splitEvenly(totalNum, rows.length)
      : null;

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  function addRow() {
    setRows((r) => [...r, { email: "" }]);
  }
  function removeRow(i: number) {
    setRows((r) => (r.length === 1 ? r : r.filter((_, idx) => idx !== i)));
  }

  function submit() {
    setError(null);
    const participants = rows
      .map((r) => ({
        email: r.email.trim().toLowerCase(),
        name: r.name?.trim() || undefined,
        amount: r.amount ? Number(r.amount) : undefined,
      }))
      .filter((r) => r.email);

    if (participants.length === 0) {
      setError("Add at least one other person");
      return;
    }
    if (participants.some((p) => !p.email.endsWith(`@${allowedDomain}`))) {
      setError(`All emails must end in @${allowedDomain}`);
      return;
    }
    startTransition(async () => {
      try {
        await createTicketAction({
          title: title.trim(),
          totalAmount: totalNum,
          notes: notes.trim() || undefined,
          participants,
          splitMode,
        });
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <Card>
      <div className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="title">What did you eat?</Label>
          <Input
            id="title"
            placeholder="e.g. KFC lunch — Friday"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="total">Total bill (PKR)</Label>
          <Input
            id="total"
            type="number"
            inputMode="numeric"
            placeholder="3500"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            required
          />
        </div>

        <div>
          <Label>Split mode</Label>
          <div className="mt-2 inline-flex rounded-lg border border-border p-1 text-sm">
            <button
              type="button"
              onClick={() => setSplitMode("even")}
              className={`px-3 py-1 rounded-md ${splitMode === "even" ? "bg-fg text-bg" : ""}`}
            >
              Even
            </button>
            <button
              type="button"
              onClick={() => setSplitMode("custom")}
              className={`px-3 py-1 rounded-md ${splitMode === "custom" ? "bg-fg text-bg" : ""}`}
            >
              Custom
            </button>
          </div>
          {splitMode === "even" && totalNum > 0 && rows.length > 0 && (
            <p className="text-xs text-muted mt-2">
              Each person owes ~Rs. {Math.floor(totalNum / (rows.length + 1))}. Your share is the
              remainder.
            </p>
          )}
        </div>

        <div>
          <Label>People (not including you)</Label>
          <div className="mt-2 space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  type="email"
                  placeholder={`person@${allowedDomain}`}
                  value={r.email}
                  onChange={(e) => updateRow(i, { email: e.target.value })}
                />
                {splitMode === "custom" && (
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="Rs."
                    className="w-28"
                    value={r.amount ?? ""}
                    onChange={(e) => updateRow(i, { amount: e.target.value })}
                  />
                )}
                {splitMode === "even" && evenShares && (
                  <div className="w-28 text-sm text-muted text-right">
                    Rs. {evenShares[i] ?? 0}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  className="text-muted hover:text-red-600 px-2"
                  aria-label="Remove"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addRow}
            className="mt-3 text-sm font-medium text-fg/80 hover:text-fg"
          >
            + Add another
          </button>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="notes">Notes (optional)</Label>
          <Input
            id="notes"
            placeholder="e.g. Delivery via Foodpanda; Saad joined late"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {error && <div className="text-sm text-red-600">{error}</div>}

        <div className="flex gap-2 pt-2">
          <Button onClick={submit} disabled={pending} size="lg">
            {pending ? "Creating…" : "Create ticket"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
