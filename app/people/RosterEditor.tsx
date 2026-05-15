"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { upsertPersonAction, removePersonAction } from "@/lib/actions/roster";
import type { Person } from "@/lib/store-roster";

export function RosterEditor({ initial }: { initial: Person[] }) {
  const [roster, setRoster] = useState(initial);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState({ name: "", whatsapp: "", email: "" });
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function startNew() {
    setEditingId("new");
    setForm({ name: "", whatsapp: "", email: "" });
    setErr(null);
  }
  function startEdit(p: Person) {
    setEditingId(p.id);
    setForm({ name: p.name, whatsapp: p.whatsapp ?? "", email: p.email ?? "" });
    setErr(null);
  }
  function cancel() {
    setEditingId(null);
    setErr(null);
  }

  function save() {
    setErr(null);
    if (!form.name.trim()) return setErr("Name required");
    startTransition(async () => {
      try {
        const person = await upsertPersonAction({
          id: editingId === "new" ? undefined : editingId!,
          name: form.name.trim(),
          email: form.email.trim() || undefined,
          whatsapp: form.whatsapp.trim() || undefined,
        });
        setRoster((r) => {
          const idx = r.findIndex((x) => x.id === person.id);
          if (idx === -1) return [...r, person];
          const next = [...r];
          next[idx] = person;
          return next;
        });
        setEditingId(null);
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  function remove(id: string) {
    if (!confirm("Remove this person from the roster? Existing tickets keep their info.")) return;
    startTransition(async () => {
      try {
        await removePersonAction(id);
        setRoster((r) => r.filter((p) => p.id !== id));
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="eyebrow">{roster.length} ON THE LIST</div>
        {editingId !== "new" && (
          <Button size="sm" onClick={startNew}>
            + Add person
          </Button>
        )}
      </div>

      {editingId === "new" && (
        <FormCard
          title="NEW PERSON"
          form={form}
          setForm={setForm}
          err={err}
          pending={pending}
          onSave={save}
          onCancel={cancel}
        />
      )}

      {roster.length === 0 && editingId !== "new" && (
        <div className="text-center py-10 text-ink-soft italic text-[14px] border border-dashed border-ink-faint/50">
          Empty roster. Add the regular lunch crew once.
        </div>
      )}

      <div className="space-y-3">
        {roster.map((p) =>
          editingId === p.id ? (
            <FormCard
              key={p.id}
              title={`EDIT · ${p.name.toUpperCase()}`}
              form={form}
              setForm={setForm}
              err={err}
              pending={pending}
              onSave={save}
              onCancel={cancel}
              onDelete={() => remove(p.id)}
            />
          ) : (
            <div key={p.id} className="line-item py-2 group">
              <div className="min-w-0">
                <div className="display-italic text-[22px] truncate">{p.name}</div>
                <div className="text-[12px] text-ink-faint truncate mt-0.5">
                  {[p.whatsapp, p.email].filter(Boolean).join(" · ") || "no contact"}
                </div>
              </div>
              <span className="leader" />
              <button
                type="button"
                onClick={() => startEdit(p)}
                className="eyebrow ink-link shrink-0"
              >
                EDIT
              </button>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function FormCard({
  title,
  form,
  setForm,
  err,
  pending,
  onSave,
  onCancel,
  onDelete,
}: {
  title: string;
  form: { name: string; whatsapp: string; email: string };
  setForm: (v: { name: string; whatsapp: string; email: string }) => void;
  err: string | null;
  pending: boolean;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="border-2 border-dashed border-saffron/60 p-5 space-y-4 animate-fade-up">
      <div className="flex items-center justify-between">
        <div className="eyebrow text-saffron">{title}</div>
        <button onClick={onCancel} className="eyebrow ink-link" disabled={pending}>
          CANCEL
        </button>
      </div>
      <div className="grid grid-cols-2 gap-x-5 gap-y-3">
        <div className="space-y-2">
          <Label>NAME *</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Saad Iqbal"
          />
        </div>
        <div className="space-y-2">
          <Label>WHATSAPP</Label>
          <Input
            value={form.whatsapp}
            onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
            placeholder="03xx-xxxxxxx"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>EMAIL</Label>
        <Input
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="saad@puresquare.com"
          type="email"
        />
      </div>
      {err && <div className="text-[12px] text-saffron italic">{err}</div>}
      <div className="flex items-center justify-between">
        <Button size="sm" onClick={onSave} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={pending}
            className="eyebrow text-saffron ink-link"
          >
            REMOVE
          </button>
        )}
      </div>
    </div>
  );
}
