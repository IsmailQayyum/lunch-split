import { readIndexOrRebuild } from "@/lib/tickets-index";
import { getRoster } from "@/lib/store-roster";
import { getViewer } from "@/lib/auth";
import { disableAdminAction } from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";
import DashboardFilter from "@/components/DashboardFilter";
import { RosterEditor } from "@/app/people/RosterEditor";

export async function AdminDashboard() {
  const [index, roster, viewer] = await Promise.all([
    readIndexOrRebuild(),
    getRoster(),
    getViewer(),
  ]);

  return (
    <div className="space-y-10">
      <div className="rounded border border-saffron/60 p-5">
        <div className="eyebrow text-saffron">ADMIN MODE · ON</div>
        <p className="text-[13px] text-ink-soft mt-2">
          You can manage every ticket, profile, and participant in the system —
          on this page and inline across the app.
        </p>
        <form action={disableAdminAction} className="mt-4">
          <Button type="submit" variant="ghost" size="sm">
            ↑ Disable admin mode
          </Button>
        </form>
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
