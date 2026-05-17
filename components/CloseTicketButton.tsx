"use client";

import { useTransition } from "react";
import { Button } from "./ui/button";
import {
  closeTicketAction,
  reopenTicketAction,
  deleteTicketAction,
} from "@/lib/actions/tickets";

export function CloseTicketButton({
  slug,
  status,
}: {
  slug: string;
  status: "open" | "closed";
}) {
  const [pending, startTransition] = useTransition();
  const [deletePending, startDelete] = useTransition();

  return (
    <div className="flex items-center gap-3">
      <Button
        variant={status === "open" ? "outline" : "default"}
        size="sm"
        onClick={() =>
          startTransition(async () => {
            if (status === "open") await closeTicketAction(slug);
            else await reopenTicketAction(slug);
          })
        }
        disabled={pending || deletePending}
      >
        {pending ? "Saving…" : status === "open" ? "Tear off & close" : "Reopen ticket"}
      </Button>
      <button
        type="button"
        className="eyebrow text-saffron hover:underline disabled:opacity-50"
        disabled={pending || deletePending}
        onClick={() => {
          if (
            !confirm(
              "Permanently delete this bill? This removes it from the channel index and can't be undone.",
            )
          )
            return;
          startDelete(async () => {
            await deleteTicketAction(slug);
          });
        }}
      >
        {deletePending ? "Deleting…" : "✕ Delete bill"}
      </button>
    </div>
  );
}
