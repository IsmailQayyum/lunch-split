import { Button } from "@/components/ui/button";
import { disableAdminAction } from "@/lib/actions/admin";

export function AdminDashboard() {
  return (
    <div className="space-y-8">
      <div className="rounded border border-ink-faint p-5">
        <div className="eyebrow text-saffron">ADMIN MODE · ON</div>
        <p className="text-[13px] text-ink-soft mt-2">
          You can manage every ticket, profile, and participant in the system.
        </p>
      </div>

      <form action={disableAdminAction}>
        <Button type="submit" variant="ghost" size="sm">
          ↑ Disable admin mode
        </Button>
      </form>
    </div>
  );
}
