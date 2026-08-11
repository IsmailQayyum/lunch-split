import Link from "next/link";
import { getGroups } from "@/lib/store-groups";
import { getRoster } from "@/lib/store-roster";
import { getViewer } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { NewGroupForm } from "./NewGroupForm";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  const [allGroups, roster, viewer, admin] = await Promise.all([
    getGroups(),
    getRoster(),
    getViewer(),
    isAdmin(),
  ]);

  const visible = admin
    ? allGroups
    : viewer
      ? allGroups.filter((g) => g.memberEmails.includes(viewer.email))
      : [];

  return (
    <main className="max-w-[560px] mx-auto px-5 pt-8 pb-16 animate-print">
      <Link href="/" className="eyebrow ink-link">
        ← BACK
      </Link>
      <header className="text-center mt-8 mb-6">
        <div className="eyebrow">GROUPS</div>
        <h1 className="display-italic text-[56px] mt-3 leading-[0.9]">Your crews.</h1>
        <p className="text-ink-soft text-[14px] mt-3 max-w-[440px] mx-auto">
          Groups bundle members and route Slack notifications. A bill posts only
          to its group&apos;s webhook — no more broadcasting every lunch to the
          whole channel.
        </p>
      </header>
      <div className="divider-dots mb-8" />

      {!viewer && !admin ? (
        <div className="border border-dashed border-saffron/50 p-4 text-center text-[13px] text-ink-soft italic">
          Sign in to create or join a group.{" "}
          <a href="/login" className="ink-link">
            Sign in →
          </a>
        </div>
      ) : (
        <>
          <section className="mb-10">
            <div className="eyebrow mb-3">{visible.length} VISIBLE TO YOU</div>
            {visible.length === 0 ? (
              <div className="text-center py-10 text-ink-soft italic text-[14px] border border-dashed border-ink-faint/50">
                No groups yet. Create one below.
              </div>
            ) : (
              <ul className="space-y-2">
                {visible.map((g) => (
                  <li key={g.id} className="line-item py-2">
                    <Link href={`/groups/${g.id}`} className="min-w-0 flex-1 group">
                      <div className="display-italic text-[22px] truncate group-hover:text-saffron transition-colors">
                        {g.name}
                      </div>
                      <div className="text-[12px] text-ink-faint truncate mt-0.5">
                        {g.memberEmails.length} member
                        {g.memberEmails.length === 1 ? "" : "s"}
                        {g.slackWebhookUrl ? " · Slack on" : " · no webhook"}
                      </div>
                    </Link>
                    <span className="leader" />
                    <Link
                      href={`/groups/${g.id}`}
                      className="eyebrow ink-link shrink-0"
                    >
                      OPEN
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {viewer && (
            <section>
              <div className="eyebrow mb-3">⎯ NEW GROUP ⎯</div>
              <div className="divider-dots mb-6" />
              <NewGroupForm roster={roster} viewerEmail={viewer.email} />
            </section>
          )}
        </>
      )}
    </main>
  );
}
