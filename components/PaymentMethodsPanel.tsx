"use client";

import { useState } from "react";

type Payer = {
  name: string;
  jazzcash: string | null;
  easypaisa: string | null;
  iban: string | null;
  accountTitle: string | null;
  acceptsCash: boolean;
};

export function PaymentMethodsPanel({ payer }: { payer: Payer }) {
  const hasAny = payer.jazzcash || payer.easypaisa || payer.iban || payer.acceptsCash;

  return (
    <section>
      <div className="eyebrow mb-4 text-center">⎯ SEND PAYMENT TO ⎯</div>
      {!hasAny ? (
        <p className="text-[12px] text-ink-faint italic text-center">
          {payer.name} didn't add payment details.
        </p>
      ) : (
        <div className="space-y-2">
          {payer.jazzcash && <PayLine label="JazzCash" value={payer.jazzcash} />}
          {payer.easypaisa && <PayLine label="EasyPaisa" value={payer.easypaisa} />}
          {payer.iban && (
            <PayLine
              label={payer.accountTitle ? `Bank · ${payer.accountTitle}` : "Bank"}
              value={payer.iban}
            />
          )}
          {payer.acceptsCash && (
            <div className="text-[12px] text-ink-soft italic text-center pt-1">
              · Cash on the spot is fine ·
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function PayLine({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group flex items-center justify-between gap-3 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="eyebrow">{label}</div>
        <div className="font-mono text-[14px] num truncate mt-0.5">{value}</div>
      </div>
      <button
        type="button"
        className="btn btn-outline btn-sm shrink-0"
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "✓ Copied" : "Copy"}
      </button>
    </div>
  );
}
