"use client";

import { useState, useTransition } from "react";
import { Button } from "./ui/button";
import { formatMoney, relativeTime } from "@/lib/utils";
import {
  markPaidAction,
  confirmPaidAction,
  markCashAction,
  remindAction,
  removeParticipantAction,
  reopenParticipantAction,
} from "@/lib/actions/tickets";

type Props = {
  slug: string;
  participant: {
    id: string;
    guestName: string;
    pendingEmail: string | null;
    amountOwed: number;
    status: "pending" | "self_marked" | "confirmed" | "cash";
    isMe: boolean;
  };
  isPayer: boolean;
  ticketOpen: boolean;
  currency: string;
  lastRemindedAt: Date | null;
};

export function ParticipantRow({
  slug,
  participant,
  isPayer,
  ticketOpen,
  currency,
  lastRemindedAt,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const settled = participant.status === "confirmed" || participant.status === "cash";

  function run(fn: () => Promise<unknown>) {
    setErr(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  const recentlyReminded =
    lastRemindedAt && Date.now() - lastRemindedAt.getTime() < 60 * 60 * 1000;

  return (
    <div
      className={`rounded-xl border border-border p-3 flex items-center justify-between gap-3 ${
        settled ? "opacity-60" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate">
          {participant.guestName}
          {participant.isMe && <span className="ml-2 text-xs text-muted">(you)</span>}
        </div>
        <div className="text-xs text-muted mt-0.5 truncate">
          {participant.pendingEmail} ·{" "}
          <span
            className={
              participant.status === "confirmed" || participant.status === "cash"
                ? "text-emerald-600"
                : participant.status === "self_marked"
                  ? "text-amber-600"
                  : "text-red-600"
            }
          >
            {label(participant.status)}
          </span>
        </div>
        {err && <div className="text-xs text-red-600 mt-1">{err}</div>}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <div className="font-semibold text-sm">
          {formatMoney(participant.amountOwed, currency)}
        </div>

        {/* Participant self-actions */}
        {participant.isMe && !settled && ticketOpen && (
          <Button
            size="sm"
            onClick={() => run(() => markPaidAction(slug, participant.id))}
            disabled={pending || participant.status === "self_marked"}
          >
            {participant.status === "self_marked" ? "Awaiting confirm" : "I paid"}
          </Button>
        )}

        {/* Payer actions */}
        {isPayer && !settled && ticketOpen && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => run(() => confirmPaidAction(slug, participant.id))}
              disabled={pending}
            >
              Confirm
            </Button>
            <div className="relative">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="More"
              >
                ⋯
              </Button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 w-44 rounded-lg border border-border bg-bg shadow-lg z-10 text-sm">
                  <MenuItem
                    onClick={() => {
                      setMenuOpen(false);
                      run(() => markCashAction(slug, participant.id));
                    }}
                  >
                    Mark cash paid
                  </MenuItem>
                  <MenuItem
                    disabled={!!recentlyReminded}
                    onClick={() => {
                      setMenuOpen(false);
                      run(() => remindAction(slug, participant.id));
                    }}
                  >
                    {recentlyReminded
                      ? `Reminded ${relativeTime(lastRemindedAt!)}`
                      : "Send reminder email"}
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      setMenuOpen(false);
                      run(() => removeParticipantAction(slug, participant.id));
                    }}
                  >
                    Remove
                  </MenuItem>
                </div>
              )}
            </div>
          </>
        )}

        {/* Payer reopen for already-settled rows */}
        {isPayer && settled && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => run(() => reopenParticipantAction(slug, participant.id))}
          >
            Reopen
          </Button>
        )}
      </div>
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="block w-full text-left px-3 py-2 hover:bg-border/30 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

function label(s: string) {
  switch (s) {
    case "pending":
      return "Pending";
    case "self_marked":
      return "Marked paid, awaiting confirm";
    case "confirmed":
      return "Confirmed";
    case "cash":
      return "Paid in cash";
    default:
      return s;
  }
}
