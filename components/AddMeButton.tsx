"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { addParticipantAction } from "@/lib/actions/tickets";

type Props = {
  slug: string;
  suggestedAmount: number;
  currency: string;
  viewer: { email: string; name: string } | null;
  alreadyOnTicket: boolean;
};

export function AddMeButton({ slug, suggestedAmount, currency, viewer, alreadyOnTicket }: Props) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(suggestedAmount));
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!viewer) {
    return (
      <div className="text-center">
        <Link
          href={`/login?next=${encodeURIComponent(`/t/${slug}`)}`}
          className="btn btn-outline btn-sm"
        >
          Sign in to add yourself
        </Link>
      </div>
    );
  }

  if (alreadyOnTicket) return null;

  function submit() {
    setErr(null);
    const amt = Number(amount);
    if (!amt || amt < 0) return setErr("Enter a valid amount.");
    startTransition(async () => {
      try {
        await addParticipantAction(slug, amt);
        setOpen(false);
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  if (!open) {
    return (
      <div className="text-center">
        <button onClick={() => setOpen(true)} className="btn btn-outline btn-sm">
          + Add me (joined late)
        </button>
      </div>
    );
  }

  return (
    <div className="border-2 border-dashed border-ink-faint/60 p-5 space-y-4 animate-fade-up">
      <div className="flex items-center justify-between">
        <div className="eyebrow text-saffron">+ JOINING LATE</div>
        <button
          type="button"
          className="eyebrow ink-link"
          onClick={() => setOpen(false)}
          disabled={pending}
        >
          CANCEL
        </button>
      </div>

      <div className="text-[13px] text-ink-soft">
        Adding <span className="display-italic text-[18px]">{viewer.name}</span> ·{" "}
        <span className="text-ink-faint">{viewer.email}</span>
      </div>

      <div className="space-y-2">
        <Label>
          YOUR SHARE · suggested {currency} {suggestedAmount.toLocaleString("en-PK")}
        </Label>
        <Input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>

      {err && <div className="text-[12px] text-saffron italic">{err}</div>}
      <Button onClick={submit} disabled={pending}>
        {pending ? "Adding…" : "Add me to the ticket"}
      </Button>
    </div>
  );
}
