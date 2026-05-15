"use client";

import { useState, useTransition } from "react";
import { Button } from "./ui/button";
import { formatMoney, relativeTime } from "@/lib/utils";
import { normalizeWhatsapp, whatsappUrl, reminderText } from "@/lib/whatsapp";
import {
  markPaidAction,
  confirmPaidAction,
  markCashAction,
  remindEmailAction,
  logWhatsappReminderAction,
  removeParticipantAction,
  reopenParticipantAction,
} from "@/lib/actions/tickets";

type Props = {
  slug: string;
  ticketUrl: string;
  ticketTitle: string;
  payerName: string;
  participant: {
    id: string;
    name: string;
    email: string | null;
    whatsapp: string | null;
    amountOwed: number;
    status: "pending" | "self_marked" | "confirmed" | "cash";
  };
  ticketOpen: boolean;
  currency: string;
  lastRemindedAt: Date | null;
};

export function ParticipantRow({
  slug,
  ticketUrl,
  ticketTitle,
  payerName,
  participant,
  ticketOpen,
  currency,
  lastRemindedAt,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const settled = participant.status === "confirmed" || participant.status === "cash";
  const waNumber = normalizeWhatsapp(participant.whatsapp);

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

  function openWhatsapp() {
    if (!waNumber) return;
    const url = whatsappUrl(
      waNumber,
      reminderText({
        payerName,
        ticketTitle,
        amount: String(participant.amountOwed),
        ticketUrl,
        currency,
      }),
    );
    window.open(url, "_blank", "noopener,noreferrer");
    // Log async, no await
    void logWhatsappReminderAction(slug, participant.id);
  }

  return (
    <div
      className={`rounded-xl border border-border p-3 flex items-center justify-between gap-3 ${
        settled ? "opacity-60" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate">{participant.name}</div>
        <div className="text-xs text-muted mt-0.5 truncate">
          {[participant.whatsapp, participant.email].filter(Boolean).join(" · ") || "no contact"}{" "}
          ·{" "}
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

        {!settled && ticketOpen && (
          <>
            <Button
              size="sm"
              onClick={() => run(() => markPaidAction(slug, participant.id))}
              disabled={pending || participant.status === "self_marked"}
              title="Mark this person as paid (anyone can do this)"
            >
              {participant.status === "self_marked" ? "Awaiting confirm" : "I paid"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => run(() => confirmPaidAction(slug, participant.id))}
              disabled={pending}
              title="Payer: confirm receipt"
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
                <div className="absolute right-0 top-full mt-1 w-52 rounded-lg border border-border bg-bg shadow-lg z-10 text-sm">
                  <MenuItem
                    disabled={!waNumber}
                    onClick={() => {
                      setMenuOpen(false);
                      openWhatsapp();
                    }}
                  >
                    {waNumber ? "Nudge on WhatsApp" : "No WhatsApp on file"}
                  </MenuItem>
                  <MenuItem
                    disabled={!participant.email}
                    onClick={() => {
                      setMenuOpen(false);
                      run(() => remindEmailAction(slug, participant.id));
                    }}
                  >
                    {participant.email ? "Send reminder email" : "No email on file"}
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      setMenuOpen(false);
                      run(() => markCashAction(slug, participant.id));
                    }}
                  >
                    Mark cash paid
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      setMenuOpen(false);
                      run(() => removeParticipantAction(slug, participant.id));
                    }}
                  >
                    Remove
                  </MenuItem>
                  {lastRemindedAt && (
                    <div className="px-3 py-2 text-xs text-muted border-t border-border">
                      Last nudged {relativeTime(lastRemindedAt)}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {settled && ticketOpen && (
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
