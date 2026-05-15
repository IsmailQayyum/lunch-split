import Link from "next/link";
import { NewTicketForm } from "./NewTicketForm";
import { getRoster } from "@/lib/store-roster";

export const dynamic = "force-dynamic";

export default async function NewTicketPage() {
  const roster = await getRoster();
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
        <div className="eyebrow">NEW ORDER · DRAFT</div>
        <h1 className="display-italic text-[56px] mt-3 leading-[0.9]">Punch a ticket.</h1>
        <p className="text-ink-soft text-[14px] mt-3 max-w-[360px] mx-auto">
          Fill it once, share once — the rest settle up on their own.
        </p>
      </header>
      <div className="divider-dots mb-8" />
      <NewTicketForm roster={roster} />
    </main>
  );
}
