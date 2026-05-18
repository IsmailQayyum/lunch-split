"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  addParticipantByPayerAction,
} from "@/lib/actions/tickets";
import { upsertPersonAction } from "@/lib/actions/roster";
import type { Person } from "@/lib/store-roster";

type Props = {
  slug: string;
  currency: string;
  suggestedAmount: number;
  roster: Person[];
  excludeEmails: string[];
};

type Mode = "pick" | "new";

export function AddPersonPanel({
  slug,
  currency,
  suggestedAmount,
  roster,
  excludeEmails,
}: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("pick");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [amount, setAmount] = useState(String(suggestedAmount));
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const excludeSet = useMemo(
    () => new Set(excludeEmails.map((e) => e.toLowerCase())),
    [excludeEmails],
  );
  const available = useMemo(
    () => roster.filter((p) => !p.email || !excludeSet.has(p.email.toLowerCase())),
    [roster, excludeSet],
  );
  const picked = pickedId ? available.find((p) => p.id === pickedId) ?? null : null;

  function reset() {
    setMode("pick");
    setPickedId(null);
    setName("");
    setEmail("");
    setWhatsapp("");
    setAmount(String(suggestedAmount));
    setErr(null);
  }

  function close() {
    setOpen(false);
    reset();
  }

  function submit() {
    setErr(null);
    const amt = Number(amount);
    if (!amt || amt < 0) return setErr("Enter a valid amount.");

    startTransition(async () => {
      try {
        if (mode === "new") {
          if (!name.trim()) {
            setErr("Name required.");
            return;
          }
          // Save to roster first so they're picked next time too.
          const person = await upsertPersonAction({
            name: name.trim(),
            email: email.trim() || undefined,
            whatsapp: whatsapp.trim() || undefined,
          });
          await addParticipantByPayerAction(slug, {
            name: person.name,
            email: person.email ?? undefined,
            whatsapp: person.whatsapp ?? undefined,
            amount: amt,
          });
        } else {
          if (!picked) {
            setErr("Pick someone, or tap '+ new person'.");
            return;
          }
          await addParticipantByPayerAction(slug, {
            name: picked.name,
            email: picked.email ?? undefined,
            whatsapp: picked.whatsapp ?? undefined,
            amount: amt,
          });
        }
        close();
      } catch (e) {
        const msg = (e as Error).message;
        setErr(
          msg === "email_already_on_ticket"
            ? "That person is already on the ticket."
            : msg,
        );
      }
    });
  }

  if (!open) {
    return (
      <div className="text-center">
        <button onClick={() => setOpen(true)} className="btn btn-outline btn-sm">
          + Add someone else
        </button>
      </div>
    );
  }

  return (
    <div className="border-2 border-dashed border-ink-faint/60 p-5 space-y-4 animate-fade-up">
      <div className="flex items-center justify-between">
        <div className="eyebrow text-saffron">+ ADD TO TICKET</div>
        <button
          type="button"
          className="eyebrow ink-link"
          onClick={close}
          disabled={pending}
        >
          CANCEL
        </button>
      </div>

      {/* Mode toggle */}
      <div className="inline-flex border-[1.5px] border-ink text-[10px] font-mono">
        <button
          type="button"
          onClick={() => {
            setMode("pick");
            setErr(null);
          }}
          className={`px-3 py-1 uppercase tracking-wide transition ${
            mode === "pick" ? "bg-ink text-paper-light" : "hover:bg-paper-deep"
          }`}
        >
          From roster
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("new");
            setPickedId(null);
            setErr(null);
          }}
          className={`px-3 py-1 uppercase tracking-wide transition border-l-[1.5px] border-ink ${
            mode === "new" ? "bg-ink text-paper-light" : "hover:bg-paper-deep"
          }`}
        >
          + New person
        </button>
      </div>

      {mode === "pick" ? (
        available.length === 0 ? (
          <div className="text-[12px] text-ink-soft italic">
            Everyone in your roster is already on this ticket. Tap{" "}
            <span className="display-italic text-[14px]">+ New person</span> to add someone fresh.
          </div>
        ) : (
          <ul className="max-h-60 overflow-y-auto border-[1.5px] border-ink scroll-fade">
            {available.map((p) => {
              const on = pickedId === p.id;
              return (
                <li
                  key={p.id}
                  className="border-b border-dashed border-ink-faint/40 last:border-b-0"
                >
                  <button
                    type="button"
                    onClick={() => setPickedId(on ? null : p.id)}
                    className={`w-full text-left py-2.5 px-3 transition-colors hover:bg-paper-deep/40 ${
                      on ? "bg-paper-deep/30" : ""
                    }`}
                    aria-pressed={on}
                  >
                    <div className="line-item">
                      <span
                        className={`display-italic text-[19px] truncate ${
                          on ? "text-ink" : "text-ink-soft"
                        }`}
                      >
                        {p.name}
                      </span>
                      <span className="leader" />
                      <span className="flex items-center gap-2 shrink-0">
                        {p.whatsapp && (
                          <span className="text-[10px] font-mono text-ink-faint hidden sm:inline">
                            {p.whatsapp}
                          </span>
                        )}
                        <span
                          className={`inline-flex items-center justify-center w-5 h-5 border-[1.5px] border-ink transition-all ${
                            on ? "bg-ink" : "bg-transparent"
                          }`}
                          aria-hidden
                        >
                          {on && (
                            <span className="text-paper-light text-[11px] leading-none">✓</span>
                          )}
                        </span>
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )
      ) : (
        <div className="space-y-3">
          <div className="eyebrow text-ink-faint">SAVES TO ROSTER TOO</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <F label="NAME *" value={name} onChange={setName} placeholder="Saad" />
            <F
              label="WHATSAPP"
              value={whatsapp}
              onChange={setWhatsapp}
              placeholder="03xx-xxxxxxx"
            />
          </div>
          <F
            label="EMAIL"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            type="email"
          />
        </div>
      )}

      <div className="space-y-2">
        <Label>
          THEIR SHARE · suggested {currency} {suggestedAmount.toLocaleString("en-PK")}
        </Label>
        <Input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>

      {err && <div className="text-[12px] text-saffron italic">{err}</div>}

      <Button onClick={submit} disabled={pending}>
        {pending ? "Adding…" : "Add to ticket"}
      </Button>
    </div>
  );
}

function F({
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
