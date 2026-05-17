import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const v = await getViewer();
  if (v) redirect("/");
  const { next, error } = await searchParams;
  return (
    <main className="max-w-[420px] mx-auto px-5 pt-16 pb-16 animate-print">
      <Link href="/" className="eyebrow ink-link">
        ← BACK
      </Link>
      <header className="text-center mt-10 mb-8">
        <div className="eyebrow">SIGN IN</div>
        <h1 className="display-italic text-[56px] mt-3 leading-[0.9]">Who are you?</h1>
        <p className="text-ink-soft text-[13px] mt-4 max-w-[320px] mx-auto">
          One field, no password. Your email is your account.
        </p>
      </header>
      <div className="divider-dots mb-8" />
      <LoginForm next={next} error={error} />
      <div className="divider-double max-w-[180px] mx-auto mt-12" />
      <div className="eyebrow text-center mt-4 text-ink-faint">
        NO PASSWORD · NO INBOX ROUND-TRIP
      </div>
    </main>
  );
}
