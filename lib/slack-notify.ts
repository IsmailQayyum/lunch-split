import "server-only";
import { isAdminSilent } from "@/lib/admin";
import { getGroup } from "@/lib/store-groups";

// Best-effort push to a Slack "From a webhook" workflow.
// Webhooks live on each Group — bills route to their group's channel only.
// Tickets without a groupId (legacy, pre-feature) post nowhere.
// Admins can suppress all Slack output via the toggle on the admin dashboard.
export async function notifySlack(
  text: string,
  opts?: { groupId?: string | null },
): Promise<void> {
  if (await isAdminSilent()) return;
  const groupId = opts?.groupId ?? null;
  if (!groupId) return;
  const group = await getGroup(groupId);
  const url = group?.slackWebhookUrl;
  if (!url) return;

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("Slack notify non-2xx:", res.status, body);
    }
  } catch (err) {
    console.error("Slack notify failed:", err);
  } finally {
    clearTimeout(timeout);
  }
}

export function ticketUrl(slug: string): string {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  return `${appUrl}/t/${slug}`;
}
