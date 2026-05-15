"use client";

import { useState } from "react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

export function ShareLinkBar({ ticketUrl }: { ticketUrl: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Card className="mb-4 flex items-center gap-2 py-3">
      <div className="text-xs text-muted shrink-0">Share link:</div>
      <div className="font-mono text-xs truncate flex-1">{ticketUrl}</div>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          navigator.clipboard.writeText(ticketUrl);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </Button>
    </Card>
  );
}
