"use client";

import { useTransition } from "react";
import { Button } from "./ui/button";
import { closeTicketAction, reopenTicketAction } from "@/lib/actions/tickets";

export function CloseTicketButton({
  slug,
  status,
}: {
  slug: string;
  status: "open" | "closed";
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant={status === "open" ? "outline" : "default"}
      onClick={() =>
        startTransition(async () => {
          if (status === "open") await closeTicketAction(slug);
          else await reopenTicketAction(slug);
        })
      }
      disabled={pending}
    >
      {pending ? "Saving…" : status === "open" ? "Close ticket" : "Reopen ticket"}
    </Button>
  );
}
