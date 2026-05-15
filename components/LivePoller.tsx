"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Soft refresh every N seconds so participants see paid/confirmed updates
// without manual reload. Pauses when the tab is hidden.
export function LivePoller({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    function start() {
      if (timer) return;
      timer = setInterval(() => router.refresh(), intervalMs);
    }
    function stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }
    function onVisChange() {
      if (document.hidden) stop();
      else start();
    }

    start();
    document.addEventListener("visibilitychange", onVisChange);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisChange);
    };
  }, [router, intervalMs]);

  return null;
}
