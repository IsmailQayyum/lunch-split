"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
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
      width: 200,
      margin: 1,
      color: { dark: "#1a1610", light: "#00000000" },
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
    <section className="mb-8 border-2 border-dashed border-saffron/60 bg-paper-light/60 p-5 sm:p-6 relative animate-fade-up">
      <div className="absolute -top-3 left-4 bg-paper px-2 eyebrow text-saffron">
        ⌃ FRESH TICKET · SHARE NOW
      </div>

      <div className="flex flex-col sm:flex-row gap-5 items-start mt-2">
        {qr && (
          <div className="shrink-0 mx-auto sm:mx-0">
            <img src={qr} alt="QR code" className="w-[140px] h-[140px]" width={140} height={140} />
            <div className="eyebrow text-center mt-1">SCAN ME</div>
          </div>
        )}
        <div className="flex-1 min-w-0 w-full">
          <pre className="text-[11px] leading-[1.7] whitespace-pre-wrap font-mono border-l-2 border-ink-faint/40 pl-3 py-1 max-h-[140px] overflow-auto">
            {slackText}
          </pre>
          <div className="flex flex-wrap gap-2 mt-4">
            <Button size="sm" onClick={() => copy(slackText, "slack")}>
              {copied === "slack" ? "✓ Copied" : "Copy Slack message"}
            </Button>
            <Button size="sm" variant="outline" onClick={whatsappAny}>
              WhatsApp it
            </Button>
            <Button size="sm" variant="ghost" onClick={() => copy(ticketUrl, "url")}>
              {copied === "url" ? "✓ Copied" : "Just the link"}
            </Button>
            {hasShare && (
              <Button size="sm" variant="ghost" onClick={nativeShare}>
                Share…
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
