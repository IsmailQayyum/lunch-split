import Link from "next/link";
import { readIndexOrRebuild } from "@/lib/tickets-index";
import DashboardFilter from "@/components/DashboardFilter";
import { getViewer } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";

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
  const [index, viewer, admin] = await Promise.all([
    readIndexOrRebuild(),
    getViewer(),
    isAdmin(),
  ]);

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
          <Link href="/setup" className="eyebrow ink-link">
            ⌁ WIRE UP THE SLACK SHORTCUT →
          </Link>
        </div>
      </div>

      <div className="divider-dots my-10" />

      <DashboardFilter entries={index} viewerEmail={viewer?.email ?? null} isAdmin={admin} />

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
