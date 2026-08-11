"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTicketGroupAction } from "@/lib/actions/tickets";
import type { Group } from "@/lib/types";

type Props = {
  slug: string;
  currentGroupId: string | null;
  groups: Group[];
  canUnassign: boolean;
};

export function TicketGroupPicker({ slug, currentGroupId, groups, canUnassign }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(currentGroupId ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const current = groups.find((g) => g.id === currentGroupId) ?? null;

  function save(next: string) {
    setErr(null);
    setInfo(null);
    setValue(next);
    startTransition(async () => {
      try {
        await setTicketGroupAction(slug, { groupId: next || null });
        setInfo("Group updated.");
        router.refresh();
      } catch (e) {
        setErr((e as Error).message);
        setValue(currentGroupId ?? "");
      }
    });
  }

  return (
    <div className="border border-dashed border-saffron/50 p-4 space-y-3">
      <div className="eyebrow text-saffron">ADMIN · GROUP ASSIGNMENT</div>
      <div className="text-[12px] text-ink-soft">
        Current:{" "}
        {current ? (
          <span className="display-italic text-[16px] not-italic">
            {current.name}
            {current.slackWebhookUrl ? " · Slack on" : " · silent"}
          </span>
        ) : (
          <span className="italic text-ink-faint">unassigned (legacy)</span>
        )}
      </div>
      <select
        value={value}
        onChange={(e) => save(e.target.value)}
        disabled={pending}
        className="w-full border-[1.5px] border-ink bg-paper px-3 py-2 text-[14px] font-mono"
      >
        {canUnassign && <option value="">— unassigned —</option>}
        {!canUnassign && !current && <option value="">— pick a group —</option>}
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
            {g.slackWebhookUrl ? "  · Slack on" : "  · silent"}
          </option>
        ))}
      </select>
      {err && <div className="text-[11px] text-saffron italic">{err}</div>}
      {info && <div className="text-[11px] text-moss italic">{info}</div>}
    </div>
  );
}
