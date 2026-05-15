import Link from "next/link";
import { NewTicketForm } from "./NewTicketForm";

export default function NewTicketPage() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-10">
      <header className="mb-6">
        <Link href="/" className="text-sm text-muted hover:underline">
          ← Back
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-2">New lunch ticket</h1>
        <p className="text-sm text-muted mt-1">
          Fill in your details (saved on this device for next time), then who joined and how much.
        </p>
      </header>
      <NewTicketForm />
    </main>
  );
}
