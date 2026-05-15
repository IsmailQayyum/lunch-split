"use client";

import { useEffect } from "react";
import { recordVisit } from "./RecentTickets";

export function TicketVisitRecorder({ slug, title }: { slug: string; title: string }) {
  useEffect(() => {
    recordVisit(slug, title);
  }, [slug, title]);
  return null;
}
