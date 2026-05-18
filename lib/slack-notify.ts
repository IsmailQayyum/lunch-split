import "server-only";
import { isAdmin } from "@/lib/admin";

// Best-effort push to a Slack "From a webhook" workflow.
// The workflow's trigger schema must declare a single string variable named `text`,
// and its message step should post {{text}} into #secure-lunch-internal.
// If SLACK_NOTIFY_WEBHOOK_URL is unset, this is a silent no-op — so local dev
// and previews don't need Slack wiring.
// Admin viewers also skip notifications — admin acts on others' behalf and
// shouldn't surface their corrective edits in the shared channel.
export async function notifySlack(text: string): Promise<void> {
  const url = process.env.SLACK_NOTIFY_WEBHOOK_URL;
  if (!url) return;
  if (await isAdmin()) return;
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
