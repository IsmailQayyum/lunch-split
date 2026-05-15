"use client";

import { useState, useTransition } from "react";
import { Button } from "./ui/button";
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

function relTime(d: Date | null) {
  if (!d) return "";
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

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
    void logWhatsappReminderAction(slug, participant.id);
  }

  const recentlyReminded =
    lastRemindedAt && Date.now() - lastRemindedAt.getTime() < 60 * 60 * 1000;

  return (
    <div className="group">
      {/* Top line: dot-leader between name and amount */}
      <div className={`line-item ${settled ? "opacity-60" : ""}`}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="display-italic text-[19px] truncate">{participant.name}</span>
          {participant.status === "confirmed" && (
            <span className="stamp text-moss animate-stamp">✓ Paid</span>
          )}
          {participant.status === "cash" && (
            <span className="stamp text-moss animate-stamp">Cash</span>
          )}
          {participant.status === "self_marked" && (
            <span className="stamp text-saffron">Awaiting</span>
          )}
        </div>
        <span className="leader" />
        <span className="display text-[22px] num shrink-0">
          ₨ {participant.amountOwed.toLocaleString("en-PK")}
        </span>
      </div>

      {/* Sub-line: contact info */}
      <div className="text-[11px] text-ink-faint flex items-center gap-2 mt-0.5 ml-0.5">
        <span>
          {[participant.whatsapp, participant.email].filter(Boolean).join(" · ") || "no contact"}
        </span>
        {participant.status === "pending" && <span className="text-saffron">· pending</span>}
      </div>

      {err && <div className="text-[11px] text-saffron mt-1">{err}</div>}

      {/* Actions */}
      {!settled && ticketOpen && (
        <div className="flex flex-wrap items-center gap-2 mt-3 pl-0.5">
          <Button
            size="sm"
            onClick={() => run(() => markPaidAction(slug, participant.id))}
            disabled={pending || participant.status === "self_marked"}
          >
            {participant.status === "self_marked" ? "Sent" : "I paid"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => run(() => confirmPaidAction(slug, participant.id))}
            disabled={pending}
          >
            Confirm
          </Button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="btn btn-ghost btn-sm"
              aria-label="More"
            >
              ⋯
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-paper-light border border-ink z-10 text-[11px] uppercase tracking-wider shadow-lg">
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
                  {participant.email ? "Email reminder" : "No email on file"}
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setMenuOpen(false);
                    run(() => markCashAction(slug, participant.id));
                  }}
                >
                  Paid in cash
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setMenuOpen(false);
                    run(() => removeParticipantAction(slug, participant.id));
                  }}
                >
                  Remove entry
                </MenuItem>
                {lastRemindedAt && (
                  <div className="px-3 py-2 text-[10px] text-ink-faint normal-case tracking-normal border-t border-ink-faint/30">
                    last nudged {relTime(lastRemindedAt)}{recentlyReminded ? " (recent)" : ""}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {settled && ticketOpen && (
        <div className="mt-2">
          <button
            type="button"
            className="eyebrow ink-link"
            onClick={() => run(() => reopenParticipantAction(slug, participant.id))}
          >
            Reopen
          </button>
        </div>
      )}
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
      className="block w-full text-left px-3 py-2 hover:bg-paper-deep disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      {children}
    </button>
  );
}
