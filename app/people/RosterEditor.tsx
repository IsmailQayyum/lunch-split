"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { upsertPersonAction, removePersonAction } from "@/lib/actions/roster";
import { WALLET_APPS, type Person, type WalletApp } from "@/lib/wallet-apps";

type FormState = {
  name: string;
  whatsapp: string;
  email: string;
  walletNumber: string;
  walletApps: WalletApp[];
  iban: string;
  accountTitle: string;
  acceptsCash: boolean;
};

const emptyForm: FormState = {
  name: "",
  whatsapp: "",
  email: "",
  walletNumber: "",
  walletApps: [],
  iban: "",
  accountTitle: "",
  acceptsCash: true,
};

const CACHE_KEY = "lunch-split:roster-cache";
const CACHE_TTL_MS = 3 * 60 * 1000;

type Cache = { roster: Person[]; ts: number };

function readCache(): Cache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cache;
    if (Date.now() - parsed.ts > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(roster: Person[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ roster, ts: Date.now() }));
  } catch {}
}

function mergeBySSR(ssr: Person[], cached: Person[]): Person[] {
  const map = new Map<string, Person>();
  for (const p of ssr) map.set(p.id, p);
  for (const p of cached) map.set(p.id, p);
  return Array.from(map.values());
}

export function RosterEditor({ initial }: { initial: Person[] }) {
  const [roster, setRoster] = useState(initial);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const c = readCache();
    if (!c) return;
    setRoster(mergeBySSR(initial, c.roster));
  }, [initial]);

  function syncRoster(next: Person[]) {
    setRoster(next);
    writeCache(next);
  }

  function startNew() {
    setEditingId("new");
    setForm(emptyForm);
    setErr(null);
  }
  function startEdit(p: Person) {
    setEditingId(p.id);
    setForm({
      name: p.name,
      whatsapp: p.whatsapp ?? "",
      email: p.email ?? "",
      walletNumber: p.walletNumber ?? "",
      walletApps: p.walletApps ?? [],
      iban: p.iban ?? "",
      accountTitle: p.accountTitle ?? "",
      acceptsCash: p.acceptsCash ?? true,
    });
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
          walletNumber: form.walletNumber.trim() || undefined,
          walletApps: form.walletApps,
          iban: form.iban.trim() || undefined,
          accountTitle: form.accountTitle.trim() || undefined,
          acceptsCash: form.acceptsCash,
        });
        const idx = roster.findIndex((x) => x.id === person.id);
        const next =
          idx === -1
            ? [...roster, person]
            : roster.map((x) => (x.id === person.id ? person : x));
        syncRoster(next);
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
        syncRoster(roster.filter((p) => p.id !== id));
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
                  {(p.walletNumber || p.iban) && (
                    <span className="ml-2 text-moss">· receives payments</span>
                  )}
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
  form: FormState;
  setForm: (v: FormState) => void;
  err: string | null;
  pending: boolean;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const set = (patch: Partial<FormState>) => setForm({ ...form, ...patch });
  function toggleApp(app: WalletApp) {
    const has = form.walletApps.includes(app);
    set({ walletApps: has ? form.walletApps.filter((a) => a !== app) : [...form.walletApps, app] });
  }
  return (
    <div className="border-2 border-dashed border-saffron/60 p-5 space-y-5 animate-fade-up">
      <div className="flex items-center justify-between">
        <div className="eyebrow text-saffron">{title}</div>
        <button onClick={onCancel} className="eyebrow ink-link" disabled={pending}>
          CANCEL
        </button>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-x-5 gap-y-3">
          <F label="NAME *" value={form.name} onChange={(v) => set({ name: v })} placeholder="Saad Iqbal" />
          <F label="WHATSAPP" value={form.whatsapp} onChange={(v) => set({ whatsapp: v })} placeholder="03xx-xxxxxxx" />
        </div>
        <F label="EMAIL" value={form.email} onChange={(v) => set({ email: v })} placeholder="saad@puresquare.com" type="email" />
      </div>

      <div className="divider-dots" />

      <div className="space-y-4">
        <div className="eyebrow">MOBILE NUMBER</div>
        <F
          label="MOBILE NUMBER"
          value={form.walletNumber}
          onChange={(v) => set({ walletNumber: v })}
          placeholder="03xx-xxxxxxx"
        />
        {form.walletNumber && (
          <div>
            <div className="eyebrow mb-2">APPS THAT USE THIS NUMBER</div>
            <div className="flex flex-wrap gap-2">
              {WALLET_APPS.map((app) => {
                const on = form.walletApps.includes(app.id);
                return (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => toggleApp(app.id)}
                    className={`px-3 py-1.5 border-[1.5px] text-[12px] font-mono uppercase tracking-wider transition ${
                      on
                        ? "bg-ink text-paper-light border-ink"
                        : "border-ink-faint hover:border-ink"
                    }`}
                  >
                    {on ? "✓ " : ""}
                    {app.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="divider-dots" />

        <div className="eyebrow">BANK / IBAN / RAAST</div>
        <F
          label="IBAN OR ACCOUNT NUMBER"
          value={form.iban}
          onChange={(v) => set({ iban: v })}
          placeholder="PKxx XXXX XXXX XXXX XXXX XXXX"
        />
        <F
          label="ACCOUNT TITLE"
          value={form.accountTitle}
          onChange={(v) => set({ accountTitle: v })}
          placeholder="Name on bank account"
        />

        <label className="flex items-center gap-2 cursor-pointer pt-2">
          <input
            type="checkbox"
            checked={form.acceptsCash}
            onChange={(e) => set({ acceptsCash: e.target.checked })}
            className="h-4 w-4 accent-[color:var(--saffron)]"
          />
          <span className="text-[13px]">Cash is fine.</span>
        </label>
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
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} type={type} />
    </div>
  );
}
