import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SignInWithGoogle } from "@/components/SignInWithGoogle";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");
  const { next } = await searchParams;
  const allowed = process.env.ALLOWED_EMAIL_DOMAIN ?? "puresquare.com";

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="text-5xl">🍱</div>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Lunch Split</h1>
          <p className="mt-2 text-muted text-sm">
            Track who owes what for office lunches. Sign in with your <strong>@{allowed}</strong>{" "}
            Google account.
          </p>
        </div>
        <div className="flex justify-center">
          <SignInWithGoogle next={next} />
        </div>
      </div>
    </main>
  );
}
