import Link from "next/link";
import { getRoster } from "@/lib/store-roster";
import { getViewer } from "@/lib/auth";
import { RosterEditor } from "./RosterEditor";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const [roster, viewer] = await Promise.all([getRoster(), getViewer()]);
  return (
    <main className="max-w-[560px] mx-auto px-5 pt-8 pb-16 animate-print">
      <Link href="/" className="eyebrow ink-link">
        ← BACK
      </Link>
      <header className="text-center mt-8 mb-6">
        <div className="eyebrow">THE ROSTER</div>
        <h1 className="display-italic text-[56px] mt-3 leading-[0.9]">The lunch crew.</h1>
        <p className="text-ink-soft text-[14px] mt-3 max-w-[400px] mx-auto">
          One shared list. You edit your own card; anyone signed in can add new names.
        </p>
      </header>
      <div className="divider-dots mb-8" />
      <RosterEditor initial={roster} viewerEmail={viewer?.email ?? null} />
    </main>
  );
}
