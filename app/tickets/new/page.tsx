import Link from "next/link";
import { NewTicketForm } from "./NewTicketForm";
import { getRoster, claimAccountByEmail } from "@/lib/store-roster";
import { getGroups } from "@/lib/store-groups";
import { requireViewer } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function NewTicketPage({
  searchParams,
}: {
  searchParams: Promise<{ title?: string; total?: string; from?: string }>;
}) {
  const viewer = await requireViewer("/tickets/new");
  // Ensure the viewer has a Person row (covers the case where login created
  // an entry but the user later removed it).
  const me = viewer.person ?? (await claimAccountByEmail(viewer.email));
  const [roster, allGroups, admin] = await Promise.all([
    getRoster(),
    getGroups(),
    isAdmin(),
  ]);
  const visibleGroups = admin
    ? allGroups
    : allGroups.filter((g) => g.memberEmails.includes(viewer.email));
  const sp = await searchParams;
  const fromSlack = sp.from === "slack";
  return (
    <main className="max-w-[560px] mx-auto px-5 pt-8 pb-16 animate-print">
      <div className="flex items-center justify-between">
        <Link href="/" className="eyebrow ink-link">
          ← BACK TO COUNTER
        </Link>
        <Link href="/people" className="eyebrow ink-link">
          MANAGE ROSTER →
        </Link>
      </div>
      <header className="text-center mt-8 mb-6">
        <div className="eyebrow">
          {fromSlack ? "FROM SLACK · FINISH IT UP" : "NEW ORDER · DRAFT"}
        </div>
        <h1 className="display-italic text-[56px] mt-3 leading-[0.9]">
          {fromSlack ? "Finish your ticket." : "Punch a ticket."}
        </h1>
        <p className="text-ink-soft text-[14px] mt-3 max-w-[420px] mx-auto">
          {fromSlack
            ? "Title and total already filled in from Slack. Just pick the crew."
            : "Fill it once, share once — the rest settle up on their own."}
        </p>
      </header>
      <div className="divider-dots mb-8" />
      {visibleGroups.length === 0 ? (
        <div className="border-2 border-dashed border-saffron/60 p-6 text-center space-y-3">
          <div className="eyebrow text-saffron">NO GROUPS YET</div>
          <p className="text-[13px] text-ink-soft">
            Every bill belongs to a group. Create one first to pick the people
            it&apos;s shared with and the Slack channel that hears about it.
          </p>
          <Link href="/groups" className="ink-link eyebrow inline-block">
            CREATE A GROUP →
          </Link>
        </div>
      ) : (
        <NewTicketForm
          roster={roster}
          payer={me}
          groups={visibleGroups}
          initialTitle={sp.title ?? ""}
          initialTotal={sp.total ?? ""}
        />
      )}
    </main>
  );
}
