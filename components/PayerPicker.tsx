"use client";

import { useState, useTransition } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { upsertPersonAction } from "@/lib/actions/roster";
import type { Person } from "@/lib/store-roster";

type Props = {
  roster: Person[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdded: (person: Person) => void;
};

export function PayerPicker({ roster, selectedId, onSelect, onAdded }: Props) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function pick(id: string) {
    onSelect(id);
    setOpen(false);
    setAdding(false);
  }

  function addPerson() {
    setErr(null);
    if (!name.trim()) return setErr("Name required");
    startTransition(async () => {
      try {
        const person = await upsertPersonAction({
          name: name.trim(),
          email: email.trim() || undefined,
          whatsapp: whatsapp.trim() || undefined,
        });
        onAdded(person);
        onSelect(person.id);
        setAdding(false);
        setOpen(false);
        setName("");
        setWhatsapp("");
        setEmail("");
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  const selected = roster.find((p) => p.id === selectedId);

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 py-3 px-1 border-y-[1.5px] border-ink hover:bg-paper-light/50 transition-colors text-left"
        aria-expanded={open}
      >
        <span className="flex-1 min-w-0">
          {!selected ? (
            <span className="text-ink-soft">Tap to pick who paid…</span>
          ) : (
            <span className="display-italic text-[20px] truncate text-saffron">
              {selected.name}
            </span>
          )}
        </span>
        <span className="eyebrow shrink-0 text-saffron">
          {selected ? "CHANGE " : ""}
          <span className="ml-1">{open ? "▴" : "▾"}</span>
        </span>
      </button>

      {open && (
        <div className="border-[1.5px] border-ink bg-paper-light shadow-md animate-fade-up">
          {roster.length === 0 && !adding && (
            <div className="text-[12px] text-ink-soft italic text-center py-6 px-3">
              No saved people yet. Add yourself below.
            </div>
          )}

          {roster.length > 0 && (
            <ul className="max-h-[300px] overflow-y-auto">
              {roster.map((p) => {
                const on = selectedId === p.id;
                return (
                  <li
                    key={p.id}
                    className="border-b border-dashed border-ink-faint/40 last:border-b-0"
                  >
                    <button
                      type="button"
                      onClick={() => pick(p.id)}
                      className={`w-full text-left py-2.5 px-3 transition-colors hover:bg-paper-deep/40 ${
                        on ? "bg-paper-deep/30" : ""
                      }`}
                      aria-pressed={on}
                    >
                      <div className="line-item">
                        <span
                          className={`display-italic text-[19px] truncate ${
                            on ? "text-saffron" : "text-ink-soft"
                          }`}
                        >
                          {p.name}
                        </span>
                        <span className="leader" />
                        <span
                          className={`inline-flex items-center justify-center w-5 h-5 rounded-full border-[1.5px] shrink-0 ${
                            on ? "border-saffron bg-saffron" : "border-ink-faint"
                          }`}
                          aria-hidden
                        >
                          {on && <span className="w-2 h-2 rounded-full bg-paper-light"></span>}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {adding ? (
            <div className="p-3 border-t border-dashed border-ink-faint/50 space-y-3 bg-paper">
              <div className="flex items-center justify-between">
                <div className="eyebrow text-saffron">NEW · SAVES TO ROSTER</div>
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  className="eyebrow ink-link"
                  disabled={pending}
                >
                  CANCEL
                </button>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <F label="NAME *" value={name} onChange={setName} placeholder="You" />
                <F label="WHATSAPP" value={whatsapp} onChange={setWhatsapp} placeholder="03xx-xxxxxxx" />
              </div>
              <F label="EMAIL" value={email} onChange={setEmail} placeholder="you@example.com" type="email" />
              {err && <div className="text-[11px] text-saffron italic">{err}</div>}
              <Button size="sm" onClick={addPerson} disabled={pending}>
                {pending ? "Saving…" : "Save & Pick"}
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 p-3 border-t border-dashed border-ink-faint/50 bg-paper">
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="eyebrow ink-link"
              >
                + NEW PERSON
              </button>
              <Button size="sm" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
            </div>
          )}
        </div>
      )}
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
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} type={type} />
    </div>
  );
}
