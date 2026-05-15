"use client";

import { useState } from "react";
import { Card } from "./ui/card";
import { Button } from "./ui/button";

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
    <Card className="mb-6">
      <div className="text-xs uppercase tracking-wider text-muted mb-3">
        Send payment to {payer.name}
      </div>
      {!hasAny ? (
        <p className="text-sm text-muted">{payer.name} didn't add payment details.</p>
      ) : (
        <div className="space-y-2">
          {payer.jazzcash && <CopyRow label="JazzCash" value={payer.jazzcash} />}
          {payer.easypaisa && <CopyRow label="EasyPaisa" value={payer.easypaisa} />}
          {payer.iban && (
            <CopyRow
              label={payer.accountTitle ? `Bank (${payer.accountTitle})` : "Bank"}
              value={payer.iban}
            />
          )}
          {payer.acceptsCash && (
            <div className="text-sm text-muted italic">Cash on the spot is fine.</div>
          )}
        </div>
      )}
    </Card>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between rounded-lg bg-border/30 px-3 py-2">
      <div className="text-sm min-w-0 flex-1">
        <span className="text-muted mr-2">{label}</span>
        <span className="font-mono break-all">{value}</span>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
