"use client";

import { useState } from "react";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { formatMoney } from "@/lib/utils";

type Payer = {
  name: string;
  jazzcashNumber: string | null;
  easypaisaNumber: string | null;
  bankIban: string | null;
  bankAccountTitle: string | null;
  acceptsCash: boolean;
};

export function PaymentMethodsPanel({
  payer,
  amount,
  currency,
}: {
  payer: Payer;
  amount: number | null;
  currency: string;
}) {
  const hasAny =
    payer.jazzcashNumber || payer.easypaisaNumber || payer.bankIban || payer.acceptsCash;

  return (
    <Card className="mb-6">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted">You owe</div>
          <div className="text-3xl font-semibold">
            {amount != null ? formatMoney(amount, currency) : "—"}
          </div>
        </div>
        <div className="text-sm text-muted">Send to {payer.name}</div>
      </div>
      {!hasAny ? (
        <p className="text-sm text-muted">{payer.name} hasn't added payment details yet.</p>
      ) : (
        <div className="space-y-2">
          {payer.jazzcashNumber && (
            <CopyRow label="JazzCash" value={payer.jazzcashNumber} />
          )}
          {payer.easypaisaNumber && (
            <CopyRow label="EasyPaisa" value={payer.easypaisaNumber} />
          )}
          {payer.bankIban && (
            <CopyRow
              label={payer.bankAccountTitle ? `Bank (${payer.bankAccountTitle})` : "Bank"}
              value={payer.bankIban}
            />
          )}
          {payer.acceptsCash && (
            <div className="text-sm text-muted italic">Cash is fine too.</div>
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
      <div className="text-sm">
        <span className="text-muted mr-2">{label}</span>
        <span className="font-mono">{value}</span>
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
