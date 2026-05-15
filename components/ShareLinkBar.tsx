"use client";

import { useState } from "react";

export function ShareLinkBar({ ticketUrl }: { ticketUrl: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mb-8 flex items-center gap-3 border-y border-dashed border-ink-faint py-2.5">
      <div className="eyebrow shrink-0">SHARE</div>
      <div className="font-mono text-[11px] truncate flex-1 text-ink-soft">{ticketUrl}</div>
      <button
        type="button"
        className="btn btn-outline btn-sm"
        onClick={() => {
          navigator.clipboard.writeText(ticketUrl);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "✓" : "Copy"}
      </button>
    </div>
  );
}
