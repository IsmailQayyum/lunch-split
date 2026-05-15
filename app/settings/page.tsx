import Link from "next/link";
import { eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveSettingsAction } from "@/lib/actions/settings";
import { redirect } from "next/navigation";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const me = await db.query.users.findFirst({ where: eq(users.id, session.user.id) });
  if (!me) redirect("/");

  return (
    <main className="max-w-xl mx-auto px-6 py-10">
      <header className="mb-6">
        <Link href="/dashboard" className="text-sm text-muted hover:underline">
          ← Back
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-2">Payment settings</h1>
        <p className="text-sm text-muted mt-1">
          When you're the payer, these handles are shown on the ticket so people know where to send
          your share.
        </p>
      </header>

      <Card>
        <form action={saveSettingsAction} className="space-y-5">
          <Field
            label="JazzCash number"
            name="jazzcashNumber"
            placeholder="03xx-xxxxxxx"
            defaultValue={me.jazzcashNumber ?? ""}
          />
          <Field
            label="EasyPaisa number"
            name="easypaisaNumber"
            placeholder="03xx-xxxxxxx"
            defaultValue={me.easypaisaNumber ?? ""}
          />
          <Field
            label="Bank IBAN / account number"
            name="bankIban"
            placeholder="PKxx XXXX XXXX XXXX XXXX XXXX"
            defaultValue={me.bankIban ?? ""}
          />
          <Field
            label="Account title (name on bank account)"
            name="bankAccountTitle"
            placeholder="Ismail Qayyum"
            defaultValue={me.bankAccountTitle ?? ""}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="acceptsCash"
              defaultChecked={me.acceptsCash}
              className="h-4 w-4 rounded border-border"
            />
            I'm OK accepting cash on the spot
          </label>
          <div className="pt-2">
            <Button type="submit">Save</Button>
          </div>
        </form>
      </Card>
    </main>
  );
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} defaultValue={defaultValue} placeholder={placeholder} />
    </div>
  );
}
