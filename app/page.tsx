import Link from "next/link";
import { readIndexOrRebuild } from "@/lib/tickets-index";
import DashboardFilter from "@/components/DashboardFilter";
import { getViewer } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { isSettled } from "@/lib/types";

export const dynamic = "force-dynamic";

function nowStamp() {
  const d = new Date();
  return d
    .toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    .toUpperCase();
}

export default async function Home() {
  const [allEntries, viewer, admin] = await Promise.all([
    readIndexOrRebuild(),
    getViewer(),
    isAdmin(),
  ]);

  const visibleEntries = admin
    ? allEntries
    : viewer
      ? allEntries.filter(
          (e) =>
            e.payerEmail === viewer.email ||
            e.participants.some((p) => p.email === viewer.email),
        )
      : [];

  let youOwe = 0;
  let owedToYou = 0;
  let youOweCount = 0;
  let owedToYouCount = 0;
  if (viewer) {
    for (const e of allEntries) {
      if (e.status !== "open") continue;
      const isPayer = e.payerEmail === viewer.email;
      let entryYouOwe = 0;
      let entryOwedToYou = 0;
      for (const p of e.participants) {
        const pending = !isSettled(p.status);
        if (!pending) continue;
        if (isPayer) entryOwedToYou += p.amountOwed;
        else if (p.email === viewer.email) entryYouOwe += p.amountOwed;
      }
      if (entryYouOwe > 0) {
        youOwe += entryYouOwe;
        youOweCount += 1;
      }
      if (entryOwedToYou > 0) {
        owedToYou += entryOwedToYou;
        owedToYouCount += 1;
      }
    }
  }

  return (
    <main className="max-w-[560px] mx-auto px-5 pt-10 pb-16 animate-print">
      <header className="text-center stagger">
        <div className="eyebrow">EST. 2026 · #SECURE-LUNCH-INTERNAL</div>
        <h1 className="display-italic text-[80px] sm:text-[104px] mt-3 leading-[0.85]">
          Lunch
          <br />
          Split.
        </h1>
        <p className="text-ink-soft text-[13px] mt-5 max-w-[360px] mx-auto">
          One pays. The rest settle up. Track every rupee on a receipt that{" "}
          <em className="display-italic">actually prints out.</em>
        </p>
      </header>

      <div className="divider-dots my-10" />

      <div className="text-center">
        <Link href="/tickets/new">
          <button className="btn btn-lg">↓ Punch a new ticket</button>
        </Link>
        <p className="eyebrow mt-3">Takes ~ 20 SECONDS</p>
        <div className="mt-6 flex flex-col items-center gap-2">
          <Link href="/people" className="eyebrow ink-link">
            ⋯ MANAGE THE LUNCH ROSTER →
          </Link>
        </div>
      </div>

      <div className="divider-dots my-10" />

      <DashboardFilter
        entries={visibleEntries}
        viewerEmail={viewer?.email ?? null}
        isAdmin={admin}
        youOwe={youOwe}
        owedToYou={owedToYou}
        youOweCount={youOweCount}
        owedToYouCount={owedToYouCount}
      />

      <footer className="mt-16 text-center space-y-3">
        <div className="divider-double max-w-[180px] mx-auto" />
        <div className="eyebrow">
          ACCOUNTS · <span className="text-saffron">YOURS ALONE</span> · BUILT FOR THE CREW
        </div>
        <div className="barcode max-w-[160px] mx-auto mt-4" />
        <div className="eyebrow mt-1">PRINTED · {nowStamp()}</div>
      </footer>
    </main>
  );
}
