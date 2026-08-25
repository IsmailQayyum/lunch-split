import Link from "next/link";
import { redirect } from "next/navigation";
import { readIndexOrRebuild } from "@/lib/tickets-index";
import { computeBalances } from "@/lib/balances";
import { getViewer } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { BalancesView } from "./BalancesView";

export const dynamic = "force-dynamic";

export default async function BalancesPage() {
  const [entries, viewer, admin] = await Promise.all([
    readIndexOrRebuild(),
    getViewer(),
    isAdmin(),
  ]);

  if (!viewer && !admin) {
    redirect("/login?next=/balances");
  }

  const balances = viewer ? computeBalances(entries, viewer.email) : [];

  return (
    <main className="max-w-[560px] mx-auto px-5 pt-8 pb-16 animate-print">
      <Link href="/" className="eyebrow ink-link">
        ← BACK
      </Link>
      <header className="text-center mt-8 mb-6">
        <div className="eyebrow">BALANCES</div>
        <h1 className="display-italic text-[56px] mt-3 leading-[0.9]">By person.</h1>
        <p className="text-ink-soft text-[14px] mt-3 max-w-[440px] mx-auto">
          Every open rupee, tallied per person across all tickets. Confirm a
          whole tab in one go, or pick the tickets that actually got paid.
        </p>
      </header>
      <div className="divider-dots mb-8" />

      {!viewer ? (
        <div className="border border-dashed border-saffron/50 p-4 text-center text-[13px] text-ink-soft italic">
          Admin mode has no personal ledger — balances are person-to-person.{" "}
          <a href="/login" className="ink-link">
            Sign in as yourself →
          </a>
        </div>
      ) : balances.length === 0 ? (
        <div className="text-center py-10 text-ink-soft italic text-[14px] border border-dashed border-ink-faint/50">
          All square. Nobody owes anybody a rupee.{" "}
          <em className="display-italic">Mashallah.</em>
        </div>
      ) : (
        <BalancesView balances={balances} />
      )}
    </main>
  );
}
