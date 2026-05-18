import Link from "next/link";
import { isAdmin } from "@/lib/admin";
import { AdminLogin } from "./AdminLogin";
import { AdminDashboard } from "./AdminDashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const admin = await isAdmin();
  const { error } = await searchParams;

  return (
    <main className={`mx-auto px-5 pt-16 pb-16 animate-print ${admin ? "max-w-[560px]" : "max-w-[420px]"}`}>
      <Link href="/" className="eyebrow ink-link">
        ← BACK
      </Link>
      <header className="text-center mt-10 mb-8">
        <div className="eyebrow">ADMIN</div>
        <h1 className="display-italic text-[56px] mt-3 leading-[0.9]">
          {admin ? "All-access" : "Locked"}
        </h1>
        <p className="text-ink-soft text-[13px] mt-4 max-w-[360px] mx-auto">
          {admin
            ? "Admin mode is on. Tickets, profiles, and participants across the system are now editable from anywhere in the app."
            : "Enter the shared password to enable admin mode for this browser."}
        </p>
      </header>
      <div className="divider-dots mb-8" />
      {admin ? <AdminDashboard /> : <AdminLogin error={error} />}
    </main>
  );
}
