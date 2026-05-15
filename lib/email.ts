import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.EMAIL_FROM ?? "Lunch Split <onboarding@resend.dev>";

export const resend = apiKey ? new Resend(apiKey) : null;

type ReminderArgs = {
  to: string;
  payerName: string;
  ticketTitle: string;
  amount: string;
  ticketUrl: string;
};

export function reminderEmailHtml(a: ReminderArgs) {
  return `<!doctype html>
<html><body style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; background:#f6f6f4; padding:24px;">
  <div style="max-width:520px; margin:0 auto; background:white; border-radius:12px; padding:28px; border:1px solid #eee;">
    <h2 style="margin:0 0 4px; font-size:20px;">Lunch payment reminder</h2>
    <p style="margin:0 0 16px; color:#666; font-size:14px;">From ${escapeHtml(a.payerName)}</p>
    <p style="font-size:15px; line-height:1.5;">
      You owe <strong>${escapeHtml(a.amount)}</strong> for <strong>${escapeHtml(a.ticketTitle)}</strong>.
      Open the ticket to see ${escapeHtml(a.payerName)}'s payment details and mark yourself paid once you've sent it.
    </p>
    <a href="${a.ticketUrl}" style="display:inline-block; margin-top:8px; background:#111; color:white; padding:10px 18px; border-radius:8px; text-decoration:none; font-weight:600;">
      Open ticket
    </a>
    <p style="color:#888; font-size:12px; margin-top:24px;">If this isn't you, just ignore — this is an internal PureSquare tool.</p>
  </div>
</body></html>`;
}

export async function sendReminderEmail(a: ReminderArgs) {
  if (!resend) {
    console.warn("RESEND_API_KEY missing; would have sent reminder to", a.to);
    return { ok: false as const, reason: "no-resend-key" };
  }
  const res = await resend.emails.send({
    from,
    to: a.to,
    subject: `Reminder: Rs. ${a.amount} for ${a.ticketTitle}`,
    html: reminderEmailHtml(a),
  });
  if (res.error) return { ok: false as const, reason: res.error.message };
  return { ok: true as const, id: res.data?.id };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
