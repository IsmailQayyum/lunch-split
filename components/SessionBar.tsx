import Link from "next/link";
import { getViewer } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { logoutAction } from "@/lib/actions/auth";

export async function SessionBar() {
  const [v, admin] = await Promise.all([getViewer(), isAdmin()]);
  return (
    <div className="border-b border-dashed border-ink-faint/40 bg-paper-light/60">
      <div className="max-w-[720px] mx-auto px-5 py-2 flex items-center justify-between text-[10px] font-mono tracking-wider uppercase">
        <Link href="/" className="text-ink-faint hover:text-ink">
          ◇ LUNCH SPLIT
        </Link>
        <div className="flex items-center gap-4">
          {admin && (
            <Link
              href="/admin"
              className="border border-saffron px-2 py-0.5 text-saffron hover:bg-saffron hover:text-paper-light transition-colors"
            >
              ★ ADMIN ON
            </Link>
          )}
          {v ? (
            <form action={logoutAction} className="flex items-center gap-3">
              <span className="text-ink-faint">
                SIGNED IN ·{" "}
                <span className="text-ink">{v.person?.name ?? v.email}</span>
              </span>
              <button
                type="submit"
                className="text-saffron hover:underline underline-offset-2"
              >
                SIGN OUT
              </button>
            </form>
          ) : (
            <Link href="/login" className="text-saffron hover:underline underline-offset-2">
              SIGN IN →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
