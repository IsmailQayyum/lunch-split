"use client";

import { useEffect, useState, useTransition } from "react";
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

type Status = "pending" | "self_marked" | "confirmed" | "cash";

// Hold the optimistic status for this long after the click. Vercel Blob's
// CDN is eventually-consistent — a read in the first ~10s after a write can
// return the pre-write content. 30s is a comfortable safety floor and well
// past the observed window.
const STICKY_HOLD_MS = 30_000;

const stickyKey = (slug: string, pid: string) => `lp:row:${slug}:${pid}`;

function readSticky(slug: string, pid: string): Status | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(stickyKey(slug, pid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { status?: unknown; at?: unknown };
    if (typeof parsed.status !== "string" || typeof parsed.at !== "number") return null;
    if (Date.now() - parsed.at >= STICKY_HOLD_MS) {
      window.localStorage.removeItem(stickyKey(slug, pid));
      return null;
    }
    return parsed.status as Status;
  } catch {
    return null;
  }
}

function writeSticky(slug: string, pid: string, status: Status) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      stickyKey(slug, pid),
      JSON.stringify({ status, at: Date.now() }),
    );
  } catch {
    /* quota or disabled — silently ignore */
  }
}

function clearSticky(slug: string, pid: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(stickyKey(slug, pid));
  } catch {
    /* ignore */
  }
}

function stickyRemainingMs(slug: string, pid: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(stickyKey(slug, pid));
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { at?: unknown };
    if (typeof parsed.at !== "number") return 0;
    return Math.max(0, STICKY_HOLD_MS - (Date.now() - parsed.at));
  } catch {
    return 0;
  }
}

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
    status: Status;
  };
  ticketOpen: boolean;
  currency: string;
  lastRemindedAt: Date | null;
  viewerEmail: string | null;
  isPayer: boolean;
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
  viewerEmail,
  isPayer,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hidden, setHidden] = useState(false);

  // Sticky local override, persisted to localStorage so it survives a page
  // refresh during the blob CDN's eventual-consistency window. Held for
  // STICKY_HOLD_MS measured from the click time stored alongside the value
  // — so navigating away and back doesn't reset the clock.
  const [localStatus, setLocalStatus] = useState<Status | null>(null);

  // Hydrate from localStorage on mount. Initialized to null on render so SSR
  // and first client render match; the override snaps in just after hydration.
  useEffect(() => {
    const stored = readSticky(slug, participant.id);
    if (stored) setLocalStatus(stored);
  }, [slug, participant.id]);

  // Schedule the cleanup based on remaining time in the hold window. Re-runs
  // whenever the local status changes (e.g., user does another action), so a
  // fresh click extends the hold.
  useEffect(() => {
    if (localStatus === null) return;
    const remaining = stickyRemainingMs(slug, participant.id);
    if (remaining === 0) {
      setLocalStatus(null);
      clearSticky(slug, participant.id);
      return;
    }
    const t = setTimeout(() => {
      setLocalStatus(null);
      clearSticky(slug, participant.id);
    }, remaining);
    return () => clearTimeout(t);
  }, [localStatus, slug, participant.id]);

  const status = localStatus ?? participant.status;
  const settled = status === "confirmed" || status === "cash";
  const waNumber = normalizeWhatsapp(participant.whatsapp);

  const isMyRow =
    !!viewerEmail && !!participant.email && viewerEmail === participant.email.toLowerCase();
  const canSelfMark = isMyRow;
  const canPayerAct = isPayer;

  function run(opt: Status | null, fn: () => Promise<unknown>) {
    setErr(null);
    if (opt) {
      setLocalStatus(opt);
      writeSticky(slug, participant.id, opt);
    }
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        setErr((e as Error).message);
        if (opt) {
          setLocalStatus(null);
          clearSticky(slug, participant.id);
        }
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

  if (hidden) return null;

  return (
    <div className="group">
      <div className={`line-item ${settled ? "opacity-60" : ""}`}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="display-italic text-[19px] truncate">{participant.name}</span>
          {status === "confirmed" && (
            <span className="stamp text-moss animate-stamp">✓ Paid</span>
          )}
          {status === "cash" && (
            <span className="stamp text-moss animate-stamp">Cash</span>
          )}
          {status === "self_marked" && (
            <span className="stamp text-saffron">Awaiting</span>
          )}
        </div>
        <span className="leader" />
        <span className="display text-[22px] num shrink-0">
          ₨ {participant.amountOwed.toLocaleString("en-PK")}
        </span>
      </div>

      <div className="text-[11px] text-ink-faint flex items-center gap-2 mt-0.5 ml-0.5">
        <span>
          {[participant.whatsapp, participant.email].filter(Boolean).join(" · ") || "no contact"}
        </span>
        {status === "pending" && <span className="text-saffron">· pending</span>}
      </div>

      {err && <div className="text-[11px] text-saffron mt-1">{err}</div>}

      {!settled && ticketOpen && (canSelfMark || canPayerAct) && (
        <div className="flex flex-wrap items-center gap-2 mt-3 pl-0.5">
          {canSelfMark && (
            <Button
              size="sm"
              onClick={() => run("self_marked", () => markPaidAction(slug, participant.id))}
              disabled={pending || status === "self_marked"}
            >
              {status === "self_marked" ? "Sent" : "I paid"}
            </Button>
          )}
          {canPayerAct && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => run("confirmed", () => confirmPaidAction(slug, participant.id))}
              disabled={pending}
            >
              Confirm
            </Button>
          )}

          {(canPayerAct || canSelfMark) && (
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
                  {canPayerAct && (
                    <MenuItem
                      disabled={!waNumber}
                      onClick={() => {
                        setMenuOpen(false);
                        openWhatsapp();
                      }}
                    >
                      {waNumber ? "Nudge on WhatsApp" : "No WhatsApp on file"}
                    </MenuItem>
                  )}
                  {canPayerAct && (
                    <MenuItem
                      disabled={!participant.email}
                      onClick={() => {
                        setMenuOpen(false);
                        run(null, () => remindEmailAction(slug, participant.id));
                      }}
                    >
                      {participant.email ? "Email reminder" : "No email on file"}
                    </MenuItem>
                  )}
                  {canPayerAct && (
                    <MenuItem
                      onClick={() => {
                        setMenuOpen(false);
                        run("cash", () => markCashAction(slug, participant.id));
                      }}
                    >
                      Paid in cash
                    </MenuItem>
                  )}
                  {(canPayerAct || canSelfMark) && (
                    <MenuItem
                      onClick={() => {
                        setMenuOpen(false);
                        setHidden(true);
                        run(null, () => removeParticipantAction(slug, participant.id));
                      }}
                    >
                      Remove entry
                    </MenuItem>
                  )}
                  {canPayerAct && lastRemindedAt && (
                    <div className="px-3 py-2 text-[10px] text-ink-faint normal-case tracking-normal border-t border-ink-faint/30">
                      last nudged {relTime(lastRemindedAt)}{recentlyReminded ? " (recent)" : ""}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {settled && ticketOpen && (canSelfMark || canPayerAct) && (
        <div className="mt-2">
          <button
            type="button"
            className="eyebrow ink-link"
            onClick={() => run("pending", () => reopenParticipantAction(slug, participant.id))}
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
