import { readIndexOrRebuild } from "@/lib/tickets-index";
import { getRoster } from "@/lib/store-roster";
import { getViewer } from "@/lib/auth";
import { isAdminSilent } from "@/lib/admin";
import { disableAdminAction, toggleAdminSilentAction } from "@/lib/actions/admin";
import DashboardFilter from "@/components/DashboardFilter";
import { RosterEditor } from "@/app/people/RosterEditor";

export async function AdminDashboard() {
  const [index, roster, viewer, silent] = await Promise.all([
    readIndexOrRebuild(),
    getRoster(),
    getViewer(),
    isAdminSilent(),
  ]);

  return (
    <div className="space-y-10">
      <div className="rounded border border-saffron/60 p-5">
        <div className="eyebrow text-saffron">ADMIN MODE · ON</div>
        <p className="text-[13px] text-ink-soft mt-2">
          You can manage every ticket, profile, and participant in the system —
          on this page and inline across the app.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <form action={disableAdminAction}>
            <button type="submit" className="btn btn-outline btn-sm">
              ↑ Disable admin mode
            </button>
          </form>
          <form action={toggleAdminSilentAction}>
            <button
              type="submit"
              className="btn btn-outline btn-sm"
              aria-pressed={silent}
              title={
                silent
                  ? "Slack is muted for your actions. Click to re-enable."
                  : "Slack notifications fire for your actions. Click to mute."
              }
            >
              {silent ? "🔕 Slack muted · turn ON" : "🔔 Slack ON · mute"}
            </button>
          </form>
        </div>
        <p className="text-[11px] text-ink-faint mt-3">
          {silent
            ? "Your admin actions won't post to the shared channel until you turn Slack back on."
            : "Mute to avoid spamming the shared channel while you fix tickets."}
        </p>
      </div>

      <section>
        <div className="eyebrow mb-3">⎯ ALL TICKETS ⎯</div>
        <div className="divider-dots mb-6" />
        <DashboardFilter
          entries={index}
          viewerEmail={viewer?.email ?? null}
          isAdmin
        />
      </section>

      <section>
        <div className="eyebrow mb-3">⎯ ALL PEOPLE ⎯</div>
        <div className="divider-dots mb-6" />
        <RosterEditor initial={roster} viewerEmail={viewer?.email ?? null} isAdmin />
      </section>
    </div>
  );
}
