"use client";

import { useState, useTransition, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { addParticipantAction } from "@/lib/actions/tickets";
import { listPeopleAction, upsertPersonAction } from "@/lib/actions/roster";
import type { Person } from "@/lib/store-roster";

type Props = {
  slug: string;
  suggestedAmount: number;
  currency: string;
};

export function AddMeButton({ slug, suggestedAmount, currency }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"pick" | "new">("pick");
  const [roster, setRoster] = useState<Person[]>([]);
  const [pickedId, setPickedId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState(String(suggestedAmount));
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    listPeopleAction().then((r) => {
      setRoster(r);
      if (r.length === 0) setMode("new");
    });
  }, [open]);

  function submit() {
    setErr(null);
    const amt = Number(amount);
    if (!amt || amt < 0) return setErr("Enter a valid amount.");

    if (mode === "pick") {
      const p = roster.find((x) => x.id === pickedId);
      if (!p) return setErr("Pick yourself from the roster.");
      startTransition(async () => {
        try {
          await addParticipantAction(slug, p.name, amt, p.email ?? undefined, p.whatsapp ?? undefined);
          setOpen(false);
        } catch (e) {
          setErr((e as Error).message);
        }
      });
    } else {
      if (!name.trim()) return setErr("Name required.");
      startTransition(async () => {
        try {
          // Save to roster for next time
          await upsertPersonAction({
            name: name.trim(),
            email: email.trim() || undefined,
            whatsapp: whatsapp.trim() || undefined,
          });
          await addParticipantAction(
            slug,
            name.trim(),
            amt,
            email.trim() || undefined,
            whatsapp.trim() || undefined,
          );
          setOpen(false);
        } catch (e) {
          setErr((e as Error).message);
        }
      });
    }
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

      {roster.length > 0 && (
        <div className="inline-flex border-[1.5px] border-ink text-[10px] font-mono">
          <button
            type="button"
            onClick={() => setMode("pick")}
            className={`px-3 py-1 uppercase tracking-wide ${
              mode === "pick" ? "bg-ink text-paper-light" : "hover:bg-paper-deep"
            }`}
          >
            Pick from roster
          </button>
          <button
            type="button"
            onClick={() => setMode("new")}
            className={`px-3 py-1 uppercase tracking-wide border-l-[1.5px] border-ink ${
              mode === "new" ? "bg-ink text-paper-light" : "hover:bg-paper-deep"
            }`}
          >
            Type new
          </button>
        </div>
      )}

      {mode === "pick" ? (
        <div className="flex flex-wrap gap-2">
          {roster.map((p) => {
            const on = pickedId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPickedId(p.id)}
                className={`px-3 py-1.5 border-[1.5px] transition-all duration-150 ${
                  on ? "bg-ink text-paper-light border-ink" : "border-ink-faint hover:border-ink"
                }`}
              >
                <span className="display-italic text-[17px] leading-none">{p.name}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-x-5 gap-y-3">
            <Field label="NAME *" value={name} onChange={setName} placeholder="Your name" />
            <Field label="WHATSAPP" value={whatsapp} onChange={setWhatsapp} placeholder="03xx-xxxxxxx" />
          </div>
          <Field label="EMAIL" value={email} onChange={setEmail} placeholder="you@example.com" type="email" />
          <div className="eyebrow text-ink-faint italic">SAVES TO ROSTER FOR NEXT TIME</div>
        </div>
      )}

      <Field
        label={`YOUR SHARE · suggested ${currency} ${suggestedAmount.toLocaleString("en-PK")}`}
        value={amount}
        onChange={setAmount}
        type="number"
      />
      {err && <div className="text-[12px] text-saffron italic">{err}</div>}
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
