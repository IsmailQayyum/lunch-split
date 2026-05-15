"use client";

import { useState, useTransition } from "react";
import { upload } from "@vercel/blob/client";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { setReceiptUrlAction } from "@/lib/actions/tickets";

export function ReceiptUploader({ slug, hasReceipt }: { slug: string; hasReceipt: boolean }) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    setErr(null);
    setUploading(true);
    try {
      const blob = await upload(`receipts/${slug}/${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
      });
      startTransition(async () => {
        try {
          await setReceiptUrlAction(slug, blob.url);
        } catch (e) {
          setErr((e as Error).message);
        }
      });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-medium text-sm">Receipt photo</div>
          <div className="text-xs text-muted mt-0.5">
            {hasReceipt ? "Uploaded. Pick another to replace it." : "Optional — helps everyone verify the total."}
          </div>
        </div>
        <label>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={uploading || pending}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <span className="inline-flex items-center justify-center h-9 px-4 text-sm font-medium rounded-lg border border-border hover:bg-border/30 cursor-pointer">
            {uploading || pending ? "Uploading…" : hasReceipt ? "Replace" : "Upload"}
          </span>
        </label>
      </div>
      {err && <div className="text-xs text-red-600 mt-2">{err}</div>}
    </Card>
  );
}
