import Link from "next/link";
import { notFound } from "next/navigation";
import { getGroup } from "@/lib/store-groups";
import { getRoster } from "@/lib/store-roster";
import { readIndexOrRebuild } from "@/lib/tickets-index";
import { getViewer } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { GroupEditor } from "./GroupEditor";

export const dynamic = "force-dynamic";

export default async function GroupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [group, roster, index, viewer, admin] = await Promise.all([
    getGroup(id),
    getRoster(),
    readIndexOrRebuild(),
    getViewer(),
    isAdmin(),
  ]);
  if (!group) notFound();

  const isMember = !!viewer && group.memberEmails.includes(viewer.email);
  const canEdit = admin || (viewer?.email === group.createdBy);

  if (!admin && !isMember) {
    return (
      <main className="max-w-[560px] mx-auto px-5 pt-8 pb-16 animate-print">
        <Link href="/groups" className="eyebrow ink-link">
          ← BACK
        </Link>
        <div className="mt-10 text-center border border-dashed border-saffron/50 p-6">
          <div className="eyebrow text-saffron mb-2">PRIVATE GROUP</div>
          <p className="text-[13px] text-ink-soft">
            You&apos;re not a member of <em>{group.name}</em>.
          </p>
        </div>
      </main>
    );
  }

  const groupTickets = index.filter((e) => e.groupId === group.id);

  return (
    <main className="max-w-[560px] mx-auto px-5 pt-8 pb-16 animate-print">
      <Link href="/groups" className="eyebrow ink-link">
        ← ALL GROUPS
      </Link>
      <header className="text-center mt-8 mb-6">
        <div className="eyebrow">GROUP</div>
        <h1 className="display-italic text-[48px] mt-3 leading-[0.9]">{group.name}</h1>
        <p className="text-ink-soft text-[12px] mt-3 font-mono">
          {group.memberEmails.length} member{group.memberEmails.length === 1 ? "" : "s"} ·{" "}
          {group.slackWebhookUrl ? "Slack on" : "no webhook"}
        </p>
      </header>
      <div className="divider-dots mb-8" />

      <GroupEditor
        group={group}
        roster={roster}
        viewerEmail={viewer?.email ?? null}
        canEdit={canEdit}
        ticketCount={groupTickets.length}
      />

      <section className="mt-10">
        <div className="eyebrow mb-3">⎯ BILLS IN THIS GROUP ⎯</div>
        <div className="divider-dots mb-6" />
        {groupTickets.length === 0 ? (
          <div className="text-center py-10 text-ink-soft italic text-[14px] border border-dashed border-ink-faint/50">
            No bills under this group yet.
          </div>
        ) : (
          <ul className="space-y-2">
            {groupTickets.map((e) => (
              <li key={e.slug} className="line-item py-2">
                <Link
                  href={`/t/${e.slug}`}
                  className="min-w-0 flex-1 group display-italic text-[20px] truncate hover:text-saffron"
                >
                  {e.title}
                </Link>
                <span className="leader" />
                <span className="eyebrow text-ink-faint shrink-0">
                  {e.status === "closed" ? "CLOSED" : `${e.settledCount}/${e.participantCount}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
