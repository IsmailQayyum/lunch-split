import type { Ticket, Participant } from "./types";

const webhookUrl = () => process.env.SLACK_WEBHOOK_URL;
const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";

type SlackBlock =
  | { type: "section"; text: { type: "mrkdwn"; text: string } }
  | { type: "context"; elements: { type: "mrkdwn"; text: string }[] };

async function post(blocks: SlackBlock[]): Promise<void> {
  const url = webhookUrl();
  if (!url) return; // silently skip if not configured

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks }),
    });
  } catch (e) {
    console.error("Slack notification failed:", e);
  }
}

function ticketLink(ticket: Ticket): string {
  return `<${appUrl()}/t/${ticket.slug}|${ticket.title}>`;
}

function money(amount: number): string {
  return `₨ ${amount.toLocaleString("en-PK")}`;
}

export async function notifyMarkPaid(
  ticket: Ticket,
  participant: Participant,
): Promise<void> {
  await post([
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${participant.name}* marked themselves as paid on ${ticketLink(ticket)}`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `${money(participant.amountOwed)} → *${ticket.payer.name}* · awaiting confirmation`,
        },
      ],
    },
  ]);
}

export async function notifyConfirmed(
  ticket: Ticket,
  participant: Participant,
): Promise<void> {
  const remaining = ticket.participants.filter(
    (p) =>
      p.id !== participant.id &&
      p.status !== "confirmed" &&
      p.status !== "cash",
  ).length;

  await post([
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${ticket.payer.name}* confirmed payment from *${participant.name}* on ${ticketLink(ticket)} ✓`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `${money(participant.amountOwed)} received${remaining > 0 ? ` · ${remaining} still pending` : " · all settled!"}`,
        },
      ],
    },
  ]);
}

export async function notifyMarkCash(
  ticket: Ticket,
  participant: Participant,
): Promise<void> {
  const remaining = ticket.participants.filter(
    (p) =>
      p.id !== participant.id &&
      p.status !== "confirmed" &&
      p.status !== "cash",
  ).length;

  await post([
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${participant.name}* settled in cash on ${ticketLink(ticket)} ✓`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `${money(participant.amountOwed)} by hand${remaining > 0 ? ` · ${remaining} still pending` : " · all settled!"}`,
        },
      ],
    },
  ]);
}

export async function notifyTicketClosed(ticket: Ticket): Promise<void> {
  await post([
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${ticketLink(ticket)} is fully settled! All ${ticket.participants.length} participants paid *${ticket.payer.name}* ✓`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Total: ${money(ticket.totalAmount)} · closed`,
        },
      ],
    },
  ]);
}

export async function notifyTicketReopened(ticket: Ticket): Promise<void> {
  await post([
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${ticketLink(ticket)} was reopened ⚠`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Total: ${money(ticket.totalAmount)} · payer: *${ticket.payer.name}*`,
        },
      ],
    },
  ]);
}

export async function notifyTicketCreated(ticket: Ticket): Promise<void> {
  const names =
    ticket.participants.length > 0
      ? ticket.participants.map((p) => p.name).join(", ")
      : "no participants yet";

  await post([
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `New ticket: ${ticketLink(ticket)} punched by *${ticket.payer.name}*`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `${money(ticket.totalAmount)} · ${names}`,
        },
      ],
    },
  ]);
}
