"use client";

import { useState, useTransition } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { upsertPersonAction } from "@/lib/actions/roster";
import type { Person } from "@/lib/store-roster";

type Props = {
  roster: Person[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onAdded: (person: Person) => void;
};

export function PersonPicker({ roster, selectedIds, onToggle, onAdded }: Props) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
        setAdding(false);
        setName("");
        setWhatsapp("");
        setEmail("");
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  const selectedCount = selectedIds.length;

  return (
    <div className="space-y-4">
      {roster.length === 0 && !adding && (
        <div className="text-[12px] text-ink-soft italic text-center py-3 border border-dashed border-ink-faint/50">
          No saved people yet. Add the lunch crew once — pick them later.
        </div>
      )}

      {roster.length > 0 && (
        <>
          <div className="flex items-center justify-between text-[11px] tracking-wider font-mono">
            <span className="eyebrow">{selectedCount} OF {roster.length} SELECTED</span>
            {selectedCount > 0 && (
              <button
                type="button"
                className="eyebrow ink-link"
                onClick={() => selectedIds.forEach(onToggle)}
              >
                CLEAR
              </button>
            )}
          </div>
          <ul className="border-t border-dashed border-ink-faint/50">
            {roster.map((p) => {
              const on = selectedIds.includes(p.id);
              return (
                <li
                  key={p.id}
                  className="border-b border-dashed border-ink-faint/50"
                >
                  <button
                    type="button"
                    onClick={() => onToggle(p.id)}
                    className={`w-full text-left transition-colors py-2.5 group ${
                      on ? "" : "hover:text-saffron"
                    }`}
                    aria-pressed={on}
                  >
                    <div className="line-item">
                      <span
                        className={`display-italic text-[20px] truncate ${
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
        </>
      )}

      {!adding ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="eyebrow ink-link"
        >
          + ADD A NEW PERSON TO THE ROSTER
        </button>
      ) : (
        <div className="border-2 border-dashed border-saffron/60 p-4 space-y-4 animate-fade-up">
          <div className="flex items-center justify-between">
            <div className="eyebrow text-saffron">NEW · SAVES FOR NEXT TIME</div>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="eyebrow ink-link"
              disabled={pending}
            >
              CANCEL
            </button>
          </div>
          <div className="grid grid-cols-2 gap-x-5 gap-y-3">
            <Field label="NAME *" value={name} onChange={setName} placeholder="Saad Iqbal" />
            <Field label="WHATSAPP" value={whatsapp} onChange={setWhatsapp} placeholder="03xx-xxxxxxx" />
          </div>
          <Field label="EMAIL (OPTIONAL)" value={email} onChange={setEmail} placeholder="saad@puresquare.com" type="email" />
          {err && <div className="text-[11px] text-saffron italic">{err}</div>}
          <Button size="sm" onClick={addPerson} disabled={pending}>
            {pending ? "Saving…" : "Save & Pick"}
          </Button>
        </div>
      )}
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
