import Link from "next/link";
import { eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { NewTicketForm } from "./NewTicketForm";
import { redirect } from "next/navigation";

export default async function NewTicketPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const me = await db.query.users.findFirst({ where: eq(users.id, session.user.id) });
  if (!me) redirect("/");

  const hasPaymentHandle =
    !!me.jazzcashNumber || !!me.easypaisaNumber || !!me.bankIban || me.acceptsCash;

  return (
    <main className="max-w-2xl mx-auto px-6 py-10">
      <header className="mb-6">
        <Link href="/dashboard" className="text-sm text-muted hover:underline">
          ← Back
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-2">New lunch ticket</h1>
      </header>

      {!hasPaymentHandle && (
        <div className="mb-6 rounded-lg border border-amber-400/50 bg-amber-400/10 p-4 text-sm">
          You don't have any payment method saved.{" "}
          <Link href="/settings" className="underline font-medium">
            Add one in settings
          </Link>{" "}
          so your colleagues know where to send the money.
        </div>
      )}

      <NewTicketForm
        allowedDomain={process.env.ALLOWED_EMAIL_DOMAIN ?? "puresquare.com"}
      />
    </main>
  );
}
