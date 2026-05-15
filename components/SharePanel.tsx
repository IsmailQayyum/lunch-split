"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Card } from "./ui/card";
import { Button } from "./ui/button";

type Props = {
  ticketUrl: string;
  slackText: string;
  shortText: string;
};

export function SharePanel({ ticketUrl, slackText, shortText }: Props) {
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [hasShare, setHasShare] = useState(false);

  useEffect(() => {
    QRCode.toDataURL(ticketUrl, {
      width: 180,
      margin: 1,
      color: { dark: "#111111", light: "#ffffff00" },
    })
      .then(setQr)
      .catch(() => setQr(null));
    setHasShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, [ticketUrl]);

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  }

  function whatsappAny() {
    // wa.me with no number = lets user pick contact/group on send
    window.open(
      `https://wa.me/?text=${encodeURIComponent(shortText)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  async function nativeShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Lunch split", text: shortText, url: ticketUrl });
      } catch {}
    }
  }

  return (
    <Card className="mb-6 border-emerald-500/30 bg-emerald-500/5">
      <div className="flex items-start gap-4">
        {qr && (
          <img
            src={qr}
            alt="QR code"
            className="rounded-md shrink-0 hidden sm:block"
            width={140}
            height={140}
          />
        )}
        <div className="flex-1 min-w-0">
          <h2 className="font-medium">Share with the group</h2>
          <p className="text-xs text-muted mt-1">
            Drop this in <code className="font-mono">#secure-lunch-internal</code> so everyone
            knows.
          </p>

          <div className="mt-4 space-y-2">
            <pre className="rounded-lg bg-bg/60 border border-border p-3 text-xs whitespace-pre-wrap font-mono overflow-x-auto">
              {slackText}
            </pre>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => copy(slackText, "slack")}>
                {copied === "slack" ? "Copied!" : "Copy Slack message"}
              </Button>
              <Button size="sm" variant="outline" onClick={whatsappAny}>
                Share via WhatsApp
              </Button>
              <Button size="sm" variant="outline" onClick={() => copy(ticketUrl, "url")}>
                {copied === "url" ? "Copied!" : "Copy link only"}
              </Button>
              {hasShare && (
                <Button size="sm" variant="outline" onClick={nativeShare}>
                  Share…
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
