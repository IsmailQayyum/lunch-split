"use client";

import { useState } from "react";
import { WALLET_APPS, type WalletApp } from "@/lib/store-roster";

type Payer = {
  name: string;
  walletNumber: string | null;
  walletApps: WalletApp[];
  iban: string | null;
  accountTitle: string | null;
  acceptsCash: boolean;
};

function labelFor(id: WalletApp): string {
  return WALLET_APPS.find((w) => w.id === id)?.label ?? id;
}

export function PaymentMethodsPanel({ payer }: { payer: Payer }) {
  const hasAny = payer.walletNumber || payer.iban || payer.acceptsCash;

  return (
    <section className="border-y border-dashed border-ink-faint/40 py-5 my-6 bg-paper-light/30 -mx-2 px-2">
      <div className="eyebrow mb-4 text-center">
        ⎯ SEND PAYMENT TO <span className="text-saffron">{payer.name.toUpperCase()}</span> ⎯
      </div>
      {!hasAny ? (
        <p className="text-[12px] text-ink-faint italic text-center">
          {payer.name} didn't add payment details.
        </p>
      ) : (
        <div className="space-y-5 max-w-[440px] mx-auto">
          {payer.walletNumber && (
            <PayBlock label="MOBILE NUMBER" value={payer.walletNumber}>
              {payer.walletApps.length > 0 && (
                <div className="mt-2">
                  <div className="text-[10px] tracking-wider font-mono uppercase text-ink-faint mb-1.5">
                    USE WITH:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {payer.walletApps.map((a) => (
                      <span
                        key={a}
                        className="text-[10px] tracking-wider font-mono uppercase px-2 py-0.5 border border-ink/40"
                      >
                        {labelFor(a)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </PayBlock>
          )}

          {payer.iban && (
            <PayBlock
              label={payer.accountTitle ? `BANK · ${payer.accountTitle.toUpperCase()}` : "BANK / IBAN / RAAST"}
              value={payer.iban}
            />
          )}

          {payer.acceptsCash && (
            <div className="text-[12px] text-ink-soft italic text-center">
              · or just hand the cash over on the spot ·
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function PayBlock({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className="flex items-center justify-between gap-3 mt-1.5">
        <div className="font-mono text-[16px] num truncate flex-1 select-all">{value}</div>
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
      {children}
    </div>
  );
}
