import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RecentTickets } from "@/components/RecentTickets";

export default function Home() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-12">
      <header className="text-center space-y-3 mb-10">
        <div className="text-5xl">🍱</div>
        <h1 className="text-3xl font-semibold tracking-tight">Lunch Split</h1>
        <p className="text-muted text-sm max-w-md mx-auto">
          One person pays. Everyone settles up. Mark, confirm, nudge — close the loop without
          chasing in DMs.
        </p>
      </header>

      <div className="flex justify-center mb-8">
        <Link href="/tickets/new">
          <Button size="lg">+ New lunch ticket</Button>
        </Link>
      </div>

      <RecentTickets />

      <Card className="mt-10 text-xs text-muted">
        No accounts, no sign-up. Anyone with a ticket link can view and act on it — same trust
        model as a shared note. Built for #secure-lunch-internal.
      </Card>
    </main>
  );
}
