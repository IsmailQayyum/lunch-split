import Link from "next/link";
import { RecentTickets } from "@/components/RecentTickets";

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

export default function Home() {
  return (
    <main className="max-w-[520px] mx-auto px-5 pt-10 pb-16 animate-print">
      {/* Letterhead */}
      <header className="text-center stagger">
        <div className="eyebrow">EST. 2026 · #SECURE-LUNCH-INTERNAL</div>
        <h1 className="display-italic text-[80px] sm:text-[104px] mt-3 leading-[0.85]">
          Lunch
          <br />
          Split.
        </h1>
        <p className="text-ink-soft text-[13px] mt-5 max-w-[320px] mx-auto">
          One pays. The rest settle up. Track every rupee on a receipt that{" "}
          <em className="display-italic">actually prints out.</em>
        </p>
      </header>

      <div className="divider-dots my-10" />

      {/* The order CTA */}
      <div className="text-center">
        <Link href="/tickets/new">
          <button className="btn btn-lg">↓ Punch a new ticket</button>
        </Link>
        <p className="eyebrow mt-3">Takes ~ 20 SECONDS</p>
      </div>

      <div className="divider-dots my-10" />

      {/* Recent (localStorage) */}
      <RecentTickets />

      {/* Promo footer */}
      <footer className="mt-16 text-center space-y-3">
        <div className="divider-double max-w-[180px] mx-auto" />
        <div className="eyebrow">SERVED COLD ·{" "}
          <span className="text-saffron">NO ACCOUNTS</span> ·{" "}
          <span className="text-saffron">NO SIGN-IN</span>
        </div>
        <p className="text-[11px] text-ink-faint max-w-[300px] mx-auto leading-relaxed">
          Anyone with a ticket link can view and act on it. Same trust as a shared note in the
          channel — built for the lunch crew, not for the world.
        </p>
        <div className="barcode max-w-[160px] mx-auto mt-6" />
        <div className="eyebrow mt-1">PRINTED · {nowStamp()}</div>
      </footer>
    </main>
  );
}
