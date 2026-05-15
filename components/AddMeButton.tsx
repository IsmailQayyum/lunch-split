"use client";

import { useState, useTransition } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { addParticipantAction } from "@/lib/actions/tickets";

type Props = {
  slug: string;
  suggestedAmount: number;
  currency: string;
};

export function AddMeButton({ slug, suggestedAmount, currency }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState(String(suggestedAmount));
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setErr(null);
    if (!name.trim()) return setErr("Name required");
    const amt = Number(amount);
    if (!amt || amt < 0) return setErr("Enter a valid amount");
    startTransition(async () => {
      try {
        await addParticipantAction(
          slug,
          name.trim(),
          amt,
          email.trim() || undefined,
          whatsapp.trim() || undefined,
        );
        setOpen(false);
        setName("");
        setWhatsapp("");
        setEmail("");
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        + Add me (joined late)
      </Button>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-bg/50 p-4 space-y-3">
      <div className="text-sm font-medium">Add yourself to this ticket</div>
      <div className="grid grid-cols-2 gap-3">
        <FieldX label="Name *" value={name} onChange={setName} placeholder="Your name" />
        <FieldX
          label="WhatsApp"
          value={whatsapp}
          onChange={setWhatsapp}
          placeholder="03xx-xxxxxxx"
        />
      </div>
      <FieldX
        label="Email (optional)"
        value={email}
        onChange={setEmail}
        placeholder="you@example.com"
        type="email"
      />
      <FieldX
        label={`Your share (suggested: ${currency} ${suggestedAmount})`}
        value={amount}
        onChange={setAmount}
        type="number"
      />
      {err && <div className="text-xs text-red-600">{err}</div>}
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? "Adding…" : "Add me"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function FieldX({
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
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
      />
    </div>
  );
}
