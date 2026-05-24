"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createGroupAction } from "@/lib/actions/groups";
import type { Person } from "@/lib/store-roster";

type Props = {
  roster: Person[];
  viewerEmail: string;
};

export function NewGroupForm({ roster, viewerEmail }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [webhook, setWebhook] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const eligible = useMemo(
    () =>
      roster
        .filter((p) => p.email && p.email !== viewerEmail)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [roster, viewerEmail],
  );

  function toggle(email: string) {
    setSelected((s) => (s.includes(email) ? s.filter((e) => e !== email) : [...s, email]));
  }

  function submit() {
    setErr(null);
    if (!name.trim()) return setErr("Name required");
    startTransition(async () => {
      try {
        const group = await createGroupAction({
          name: name.trim(),
          slackWebhookUrl: webhook.trim() || undefined,
          memberEmails: selected,
        });
        router.push(`/groups/${group.id}`);
        router.refresh();
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  return (
    <div className="border-2 border-dashed border-saffron/60 p-5 space-y-5">
      <div className="space-y-3">
        <Label>GROUP NAME *</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Design pod lunch"
        />
      </div>
      <div className="space-y-3">
        <Label>SLACK WEBHOOK URL</Label>
        <Input
          value={webhook}
          onChange={(e) => setWebhook(e.target.value)}
          placeholder="https://hooks.slack.com/triggers/…"
          type="url"
        />
        <p className="text-[11px] text-ink-faint">
          Optional. Without it, this group&apos;s bills won&apos;t post to Slack.
        </p>
      </div>

      <div className="space-y-3">
        <Label>MEMBERS</Label>
        <p className="text-[11px] text-ink-faint">
          You&apos;re added automatically. Pick others from the roster — only people
          with an email on file can be added.
        </p>
        {eligible.length === 0 ? (
          <div className="text-[12px] text-ink-soft italic text-center py-4 border border-dashed border-ink-faint/50">
            No other people with emails on file yet.
          </div>
        ) : (
          <ul className="max-h-72 overflow-y-auto border-[1.5px] border-ink-faint/60">
            {eligible.map((p) => {
              const on = selected.includes(p.email!);
              return (
                <li key={p.id} className="border-b border-dashed border-ink-faint/40 last:border-b-0">
                  <button
                    type="button"
                    onClick={() => toggle(p.email!)}
                    className={`w-full text-left py-2 px-3 transition-colors hover:bg-paper-deep/40 ${
                      on ? "bg-paper-deep/30" : ""
                    }`}
                    aria-pressed={on}
                  >
                    <div className="line-item">
                      <span className="display-italic text-[18px] truncate">{p.name}</span>
                      <span className="leader" />
                      <span className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] font-mono text-ink-faint hidden sm:inline">
                          {p.email}
                        </span>
                        <span
                          className={`inline-flex items-center justify-center w-5 h-5 border-[1.5px] border-ink ${
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
      </div>

      {err && <div className="text-[12px] text-saffron italic">{err}</div>}
      <div className="flex items-center justify-between">
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? "Creating…" : "Create group"}
        </Button>
      </div>
    </div>
  );
}
