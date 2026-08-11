"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PersonPicker } from "@/components/PersonPicker";
import { createTicketAction } from "@/lib/actions/tickets";
import { splitEvenly } from "@/lib/shares";
import type { Person } from "@/lib/store-roster";
import type { Group } from "@/lib/types";

export function NewTicketForm({
  roster: initialRoster,
  payer,
  groups,
  initialTitle = "",
  initialTotal = "",
}: {
  roster: Person[];
  payer: Person;
  groups: Group[];
  initialTitle?: string;
  initialTotal?: string;
}) {
  const [roster, setRoster] = useState(initialRoster);

  const [groupId, setGroupId] = useState<string>(groups.length === 1 ? groups[0].id : "");
  const [title, setTitle] = useState(initialTitle);
  const [total, setTotal] = useState(initialTotal);
  const [notes, setNotes] = useState("");
  const [splitMode, setSplitMode] = useState<"even" | "custom">("even");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const activeGroup = useMemo(
    () => groups.find((g) => g.id === groupId) ?? null,
    [groups, groupId],
  );
  const allowedEmails = activeGroup ? activeGroup.memberEmails : null;

  const totalNum = Math.round(Number(total) || 0);
  const selected = useMemo(
    () => selectedIds.map((id) => roster.find((p) => p.id === id)).filter((x): x is Person => !!x),
    [selectedIds, roster],
  );
  // The payer is always part of the split — they ate too.
  // Split total across (payer + selected others). First share goes to the payer.
  const splitCount = selected.length + 1;
  const evenShares =
    splitMode === "even" && totalNum > 0 && selected.length > 0
      ? splitEvenly(totalNum, splitCount)
      : null;
  const payerShare = evenShares ? evenShares[0] : 0;

  function togglePerson(id: string) {
    if (id === payer.id) return; // never add the payer to participants
    setSelectedIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function onPersonAdded(p: Person) {
    setRoster((r) => (r.some((x) => x.id === p.id) ? r : [...r, p]));
    setSelectedIds((s) => (s.includes(p.id) ? s : [...s, p.id]));
  }

  function submit() {
    setError(null);
    if (!groupId) return setError("Pick a group for this bill.");
    if (!title.trim()) return setError("What did you eat? Give it a title.");
    if (!totalNum) return setError("Bill total needs a number.");
    if (selected.length === 0) return setError("Pick at least one person.");

    // Payer goes first; their participant row is auto-marked confirmed server-side.
    const payerParticipant = {
      name: payer.name,
      email: payer.email ?? undefined,
      whatsapp: payer.whatsapp ?? undefined,
      amount:
        splitMode === "custom"
          ? Number(customAmounts[payer.id] ?? "0") || 0
          : evenShares
            ? evenShares[0]
            : undefined,
    };
    const others = selected.map((p, i) => ({
      name: p.name,
      email: p.email ?? undefined,
      whatsapp: p.whatsapp ?? undefined,
      amount:
        splitMode === "custom"
          ? Number(customAmounts[p.id] ?? "0") || 0
          : evenShares
            ? evenShares[i + 1]
            : undefined,
    }));
    const participants = [payerParticipant, ...others];

    startTransition(async () => {
      try {
        await createTicketAction({
          title: title.trim(),
          totalAmount: totalNum,
          notes: notes.trim() || undefined,
          payer: {
            name: payer.name,
            email: payer.email ?? undefined,
            whatsapp: payer.whatsapp ?? undefined,
            walletNumber: payer.walletNumber ?? undefined,
            walletApps: payer.walletApps ?? [],
            iban: payer.iban ?? undefined,
            accountTitle: payer.accountTitle ?? undefined,
            acceptsCash: payer.acceptsCash,
          },
          participants,
          splitMode,
          groupId,
        });
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  const payerHasMethod = payer.walletNumber || payer.iban || payer.acceptsCash;

  return (
    <div className="space-y-10 stagger">
      {/* GROUP */}
      <section>
        <div className="eyebrow mb-4 text-saffron">§ 00 · GROUP *</div>
        <div className="space-y-2">
          <Label>WHICH GROUP IS THIS FOR?</Label>
          <select
            value={groupId}
            onChange={(e) => {
              setGroupId(e.target.value);
              // Drop any picks that aren't in the new group.
              const next = groups.find((g) => g.id === e.target.value);
              if (next) {
                setSelectedIds((s) =>
                  s.filter((id) => {
                    const p = roster.find((x) => x.id === id);
                    return !!p?.email && next.memberEmails.includes(p.email.toLowerCase());
                  }),
                );
              }
            }}
            className="w-full border-[1.5px] border-ink bg-paper px-3 py-2 text-[15px] font-mono"
          >
            <option value="">— pick a group —</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
                {g.slackWebhookUrl ? "  · Slack on" : "  · silent"}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-ink-faint">
            Only this group&apos;s Slack channel hears about the bill.
          </p>
        </div>
      </section>

      <div className="divider-dots" />

      {/* PAYER (you) */}
      <section>
        <div className="eyebrow mb-4 text-saffron">§ 01 · WHO PAID</div>
        <div className="line-item py-3 border-y-[1.5px] border-ink">
          <span className="display-italic text-[22px] text-saffron">{payer.name}</span>
          <span className="leader" />
          <span className="eyebrow text-ink-faint">YOU</span>
        </div>
        {!payerHasMethod ? (
          <div className="mt-4 text-[12px] text-saffron italic">
            Heads up — you have no payment methods saved.{" "}
            <Link href="/people" className="ink-link">
              Add them in your profile →
            </Link>
          </div>
        ) : (
          <div className="mt-4 text-[12px] text-ink-soft">
            Payment via{" "}
            {[
              payer.walletNumber && `Mobile (${payer.walletApps.length} apps)`,
              payer.iban && "Bank",
              payer.acceptsCash && "Cash",
            ]
              .filter(Boolean)
              .join(" · ")}{" "}
            <Link href="/people" className="ink-link ml-1">
              edit →
            </Link>
          </div>
        )}
      </section>

      <div className="divider-dots" />

      {/* THE LUNCH */}
      <section>
        <div className="eyebrow mb-4 text-saffron">§ 02 · THE LUNCH</div>
        <div className="space-y-6">
          <Pair label="WHAT'D YOU EAT? *" value={title} onChange={setTitle} placeholder="Karahi Friday at Bundu Khan" />
          <Pair label="TOTAL (PKR) *" value={total} onChange={setTotal} placeholder="3500" type="number" />
          <Pair label="NOTES (OPTIONAL)" value={notes} onChange={setNotes} placeholder="Tip included; Foodpanda delivery" />
        </div>
      </section>

      <div className="divider-dots" />

      {/* PARTICIPANTS */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="eyebrow text-saffron">§ 03 · WHO ELSE JOINED</div>
          <div className="inline-flex border-[1.5px] border-ink text-[10px] font-mono">
            <button
              type="button"
              onClick={() => setSplitMode("even")}
              className={`px-3 py-1 uppercase tracking-wide transition ${
                splitMode === "even"
                  ? "bg-ink text-paper-light"
                  : "hover:bg-paper-deep"
              }`}
            >
              Even
            </button>
            <button
              type="button"
              onClick={() => setSplitMode("custom")}
              className={`px-3 py-1 uppercase tracking-wide transition border-l-[1.5px] border-ink ${
                splitMode === "custom"
                  ? "bg-ink text-paper-light"
                  : "hover:bg-paper-deep"
              }`}
            >
              Custom
            </button>
          </div>
        </div>

        <PersonPicker
          roster={roster.filter((p) => p.id !== payer.id)}
          selectedIds={selectedIds}
          onToggle={togglePerson}
          onAdded={onPersonAdded}
          allowedEmails={allowedEmails}
        />

        {selected.length > 0 && (
          <div className="mt-6 space-y-3 animate-fade-up">
            <div className="eyebrow">
              SPLITTING {splitCount} WAYS ·{" "}
              {splitMode === "even" && totalNum > 0 ? (
                <span>~₨ {Math.floor(totalNum / splitCount).toLocaleString("en-PK")} each</span>
              ) : (
                <span>set shares below</span>
              )}
            </div>

            <div className="space-y-2">
              {/* Payer's own share — already paid (they paid the bill) */}
              <div className="line-item">
                <span className="display-italic text-[19px] text-saffron">{payer.name}</span>
                <span className="text-[10px] font-mono uppercase tracking-wide text-ink-faint ml-2">
                  · paid
                </span>
                <span className="leader" />
                {splitMode === "custom" ? (
                  <div className="w-28">
                    <Input
                      type="number"
                      placeholder="₨"
                      value={customAmounts[payer.id] ?? ""}
                      onChange={(e) =>
                        setCustomAmounts((m) => ({ ...m, [payer.id]: e.target.value }))
                      }
                      className="text-right"
                    />
                  </div>
                ) : (
                  <span className="display text-[20px] num text-saffron">
                    ₨ {payerShare.toLocaleString("en-PK")}
                  </span>
                )}
              </div>

              {selected.map((p, i) => (
                <div key={p.id} className="line-item">
                  <span className="display-italic text-[19px]">{p.name}</span>
                  <span className="leader" />
                  {splitMode === "custom" ? (
                    <div className="w-28">
                      <Input
                        type="number"
                        placeholder="₨"
                        value={customAmounts[p.id] ?? ""}
                        onChange={(e) =>
                          setCustomAmounts((m) => ({ ...m, [p.id]: e.target.value }))
                        }
                        className="text-right"
                      />
                    </div>
                  ) : (
                    <span className="display text-[20px] num">
                      ₨ {(evenShares ? evenShares[i + 1] : 0).toLocaleString("en-PK")}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 eyebrow">
          <Link href="/people" className="ink-link">
            ⋯ MANAGE THE FULL ROSTER →
          </Link>
        </div>
      </section>

      <div className="divider-double" />

      {error && (
        <div className="text-[13px] text-saffron border-l-2 border-saffron pl-3 italic">
          {error}
        </div>
      )}

      <div className="flex flex-col items-center gap-4 pt-2">
        <Button onClick={submit} disabled={pending} size="lg">
          {pending ? "Printing…" : "↓ Print this ticket"}
        </Button>
        <div className="eyebrow text-ink-faint">NO CONFIRMATIONS · INSTANT</div>
      </div>
    </div>
  );
}

function Pair({
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
