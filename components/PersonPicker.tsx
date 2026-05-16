"use client";

import { useEffect, useState, useTransition } from "react";
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
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Close on Esc + lock body scroll while open
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setAdding(false);
      }
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

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

  function closeAll() {
    setOpen(false);
    setAdding(false);
  }

  const selected = roster.filter((p) => selectedIds.includes(p.id));

  return (
    <div className="space-y-3">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(true)}
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
          <span className="ml-1">▾</span>
        </span>
      </button>

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

      {/* Centered modal */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-[100] bg-ink/40 backdrop-blur-[2px] animate-fade-up"
            onClick={closeAll}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[110] w-[calc(100vw-2rem)] max-w-md max-h-[85vh] flex flex-col bg-paper-light border-[1.5px] border-ink shadow-2xl animate-fade-up"
          >
            <header className="px-4 py-3 border-b border-dashed border-ink-faint/50 flex items-center justify-between shrink-0">
              <div>
                <div className="eyebrow text-saffron">PICK PEOPLE</div>
                <div className="text-[11px] text-ink-faint mt-0.5">
                  {selected.length} of {roster.length} selected
                </div>
              </div>
              <button onClick={closeAll} className="eyebrow ink-link" aria-label="Close">
                CLOSE
              </button>
            </header>

            <div className="flex-1 overflow-y-auto">
              {roster.length === 0 && !adding && (
                <div className="text-[12px] text-ink-soft italic text-center py-8 px-4">
                  No saved people yet. Add the lunch crew below.
                </div>
              )}
              {roster.length > 0 && (
                <ul>
                  {roster.map((p) => {
                    const on = selectedIds.includes(p.id);
                    return (
                      <li
                        key={p.id}
                        className="border-b border-dashed border-ink-faint/40 last:border-b-0"
                      >
                        <button
                          type="button"
                          onClick={() => onToggle(p.id)}
                          className={`w-full text-left py-2.5 px-4 transition-colors hover:bg-paper-deep/40 ${
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
                                  <span className="text-paper-light text-[11px] leading-none">
                                    ✓
                                  </span>
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

              {adding && (
                <div className="p-4 border-t border-dashed border-ink-faint/50 space-y-3 bg-paper">
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
              )}
            </div>

            {!adding && (
              <footer className="flex items-center justify-between gap-3 px-4 py-3 border-t border-dashed border-ink-faint/50 bg-paper shrink-0">
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="eyebrow ink-link"
                >
                  + NEW PERSON
                </button>
                <Button size="sm" onClick={closeAll} disabled={pending}>
                  Done · {selected.length}
                </Button>
              </footer>
            )}
          </div>
        </>
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
