import type { Ticket } from "./types";

export function slackShareText(t: Ticket, ticketUrl: string): string {
  const lines: string[] = [];
  lines.push(`🍱 *${t.title}* — paid by ${t.payer.name}`);
  lines.push(`Total: Rs. ${t.totalAmount.toLocaleString("en-PK")}`);
  const splits = t.participants
    .map((p) => `• *${p.name}* — Rs. ${p.amountOwed.toLocaleString("en-PK")}`)
    .join("\n");
  if (splits) lines.push(splits);
  if (t.payer.walletNumber) {
    const apps = t.payer.walletApps.length > 0 ? ` (${t.payer.walletApps.join(", ")})` : "";
    lines.push(`📱 Mobile: \`${t.payer.walletNumber}\`${apps}`);
  }
  if (t.payer.iban) lines.push(`🏦 Bank: \`${t.payer.iban}\``);
  lines.push("");
  lines.push(`Mark yourself paid: ${ticketUrl}`);
  return lines.join("\n");
}

export function shortShareText(t: Ticket, ticketUrl: string): string {
  return `🍱 ${t.title} — Rs. ${t.totalAmount.toLocaleString("en-PK")} (${t.payer.name} paid). Settle up: ${ticketUrl}`;
}
