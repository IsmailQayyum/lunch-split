"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  updateGroupAction,
  deleteGroupAction,
  leaveGroupAction,
} from "@/lib/actions/groups";
import type { Person } from "@/lib/store-roster";
import type { Group } from "@/lib/types";

type Props = {
  group: Group;
  roster: Person[];
  viewerEmail: string | null;
  canEdit: boolean;
  ticketCount: number;
};

export function GroupEditor({ group, roster, viewerEmail, canEdit, ticketCount }: Props) {
  const router = useRouter();
  const [name, setName] = useState(group.name);
  const [webhook, setWebhook] = useState(group.slackWebhookUrl ?? "");
  const [memberEmails, setMemberEmails] = useState<string[]>(group.memberEmails);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const eligible = useMemo(
    () =>
      roster
        .filter((p) => p.email && p.email !== group.createdBy)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [roster, group.createdBy],
  );

  function toggle(email: string) {
    if (!canEdit) return;
    setMemberEmails((s) =>
      s.includes(email) ? s.filter((e) => e !== email) : [...s, email],
    );
  }

  function save() {
    setErr(null);
    setInfo(null);
    if (!name.trim()) return setErr("Name required");
    startTransition(async () => {
      try {
        await updateGroupAction(group.id, {
          name: name.trim(),
          slackWebhookUrl: webhook.trim() || undefined,
          memberEmails,
        });
        setInfo("Saved.");
        router.refresh();
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  function remove() {
    setErr(null);
    if (ticketCount > 0) {
      setErr("Can't delete: this group still has bills. Remove them first.");
      return;
    }
    if (!confirm(`Delete group "${group.name}"? This cannot be undone.`)) return;
    startTransition(async () => {
      try {
        await deleteGroupAction(group.id);
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  function leave() {
    setErr(null);
    if (!confirm(`Leave "${group.name}"?`)) return;
    startTransition(async () => {
      try {
        await leaveGroupAction(group.id);
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  const isMember = !!viewerEmail && memberEmails.includes(viewerEmail);
  const isCreator = viewerEmail === group.createdBy;

  return (
    <div className="border-2 border-dashed border-saffron/60 p-5 space-y-5">
      <div className="space-y-3">
        <Label>GROUP NAME</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!canEdit || pending}
        />
      </div>
      <div className="space-y-3">
        <Label>SLACK WEBHOOK URL</Label>
        <Input
          value={webhook}
          onChange={(e) => setWebhook(e.target.value)}
          placeholder="https://hooks.slack.com/triggers/…"
          type="url"
          disabled={!canEdit || pending}
        />
        <p className="text-[11px] text-ink-faint">
          Bills under this group post here. Leave blank to keep them silent.
        </p>
      </div>

      <div className="space-y-3">
        <Label>MEMBERS</Label>
        <p className="text-[11px] text-ink-faint">
          Creator <span className="font-mono">{group.createdBy}</span> is always a
          member.
        </p>
        <ul className="max-h-72 overflow-y-auto border-[1.5px] border-ink-faint/60">
          {eligible.length === 0 ? (
            <li className="text-[12px] text-ink-soft italic text-center py-4">
              No other people with emails on file yet.
            </li>
          ) : (
            eligible.map((p) => {
              const on = memberEmails.includes(p.email!);
              return (
                <li
                  key={p.id}
                  className="border-b border-dashed border-ink-faint/40 last:border-b-0"
                >
                  <button
                    type="button"
                    onClick={() => toggle(p.email!)}
                    disabled={!canEdit || pending}
                    className={`w-full text-left py-2 px-3 transition-colors ${
                      canEdit ? "hover:bg-paper-deep/40" : "cursor-default opacity-80"
                    } ${on ? "bg-paper-deep/30" : ""}`}
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
            })
          )}
        </ul>
      </div>

      {err && <div className="text-[12px] text-saffron italic">{err}</div>}
      {info && <div className="text-[12px] text-moss italic">{info}</div>}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        {canEdit ? (
          <Button size="sm" onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        ) : (
          <span className="eyebrow text-ink-faint">VIEW ONLY</span>
        )}
        <div className="flex items-center gap-4">
          {isMember && !isCreator && (
            <button
              type="button"
              onClick={leave}
              disabled={pending}
              className="eyebrow ink-link"
            >
              LEAVE GROUP
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="eyebrow text-saffron ink-link"
            >
              DELETE GROUP
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
