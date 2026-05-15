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
    if (!name.trim()) return setErr("Need a name.");
    const amt = Number(amount);
    if (!amt || amt < 0) return setErr("Enter a valid amount.");
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
      <div className="text-center">
        <button onClick={() => setOpen(true)} className="btn btn-outline btn-sm">
          + Add me (joined late)
        </button>
      </div>
    );
  }

  return (
    <div className="border-2 border-dashed border-ink-faint/60 p-5 space-y-4 animate-fade-up">
      <div className="flex items-center justify-between">
        <div className="eyebrow text-saffron">+ JOINING LATE</div>
        <button
          type="button"
          className="eyebrow ink-link"
          onClick={() => setOpen(false)}
          disabled={pending}
        >
          CANCEL
        </button>
      </div>
      <div className="grid grid-cols-2 gap-x-5 gap-y-4">
        <Field label="NAME *" value={name} onChange={setName} placeholder="Your name" />
        <Field label="WHATSAPP" value={whatsapp} onChange={setWhatsapp} placeholder="03xx-xxxxxxx" />
      </div>
      <Field label="EMAIL" value={email} onChange={setEmail} placeholder="you@example.com" type="email" />
      <Field
        label={`YOUR SHARE · suggested ${currency} ${suggestedAmount.toLocaleString("en-PK")}`}
        value={amount}
        onChange={setAmount}
        type="number"
      />
      {err && <div className="text-[11px] text-saffron italic">{err}</div>}
      <Button onClick={submit} disabled={pending}>
        {pending ? "Adding…" : "Add me to the ticket"}
      </Button>
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
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} type={type} />
    </div>
  );
}
