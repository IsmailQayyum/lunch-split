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
  allowedEmails?: string[] | null;
};

export function PersonPicker({
  roster,
  selectedIds,
  onToggle,
  onAdded,
  allowedEmails,
}: Props) {
  const [open, setOpen] = useState(false);
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

  const selected = roster.filter((p) => selectedIds.includes(p.id));
  const visibleRoster = allowedEmails
    ? roster.filter((p) => {
        if (selectedIds.includes(p.id)) return true;
        return !!p.email && allowedEmails.includes(p.email.toLowerCase());
      })
    : roster;

  return (
    <div className="space-y-3">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 py-3 px-1 border-y-[1.5px] border-ink hover:bg-paper-light/50 transition-colors text-left"
        aria-expanded={open}
      >
        <span className="flex-1 min-w-0">
          {selected.length === 0 ? (
            <span className="text-ink-soft">Tap to pick people from the roster…</span>
          ) : (
            <span className="display-italic text-[19px] truncate">
              {selected.map((p) => p.name).join(", ")}
            </span>
          )}
        </span>
        <span className="eyebrow shrink-0 text-saffron">
          {selected.length > 0 ? `${selected.length} PICKED ` : ""}
          <span className="ml-1">{open ? "▴" : "▾"}</span>
        </span>
      </button>

      {/* Inline expansion — pushes everything below it down */}
      {open && (
        <div className="border-[1.5px] border-ink bg-paper-light shadow-md animate-fade-up">
          {visibleRoster.length === 0 && !adding && (
            <div className="text-[12px] text-ink-soft italic text-center py-6 px-3">
              {allowedEmails
                ? "No group members in the roster yet. Add someone below."
                : "No saved people yet. Add the lunch crew below."}
            </div>
          )}

          {visibleRoster.length > 0 && (
            <ul className="max-h-72 overflow-y-auto scroll-fade">
              {visibleRoster.map((p) => {
                const on = selectedIds.includes(p.id);
                return (
                  <li
                    key={p.id}
                    className="border-b border-dashed border-ink-faint/40 last:border-b-0"
                  >
                    <button
                      type="button"
                      onClick={() => onToggle(p.id)}
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
                <F label="NAME *" value={name} onChange={setName} placeholder="Saad" />
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
              <Button size="sm" onClick={() => setOpen(false)} disabled={pending}>
                Done · {selected.length}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2 animate-fade-up">
          {selected.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onToggle(p.id)}
              className="group inline-flex items-center gap-2 px-2.5 py-1 bg-ink text-paper-light text-[12px] font-mono hover:bg-saffron transition-colors"
              title="Tap to remove"
            >
              <span className="display-italic text-[15px] not-italic">{p.name}</span>
              <span className="text-paper-light/70 group-hover:text-paper-light">×</span>
            </button>
          ))}
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
