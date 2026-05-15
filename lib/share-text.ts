import type { Ticket } from "./types";

export function slackShareText(t: Ticket, ticketUrl: string): string {
  const lines: string[] = [];
  lines.push(`🍱 *${t.title}* — paid by ${t.payer.name}`);
  lines.push(`Total: Rs. ${t.totalAmount.toLocaleString("en-PK")}`);
  const splits = t.participants
    .map((p) => `• *${p.name}* — Rs. ${p.amountOwed.toLocaleString("en-PK")}`)
    .join("\n");
  if (splits) lines.push(splits);
  if (t.payer.jazzcash) lines.push(`💸 JazzCash: \`${t.payer.jazzcash}\``);
  if (t.payer.easypaisa) lines.push(`💸 EasyPaisa: \`${t.payer.easypaisa}\``);
  if (t.payer.iban) lines.push(`🏦 IBAN: \`${t.payer.iban}\``);
  lines.push("");
  lines.push(`Mark yourself paid: ${ticketUrl}`);
  return lines.join("\n");
}

export function shortShareText(t: Ticket, ticketUrl: string): string {
  return `🍱 ${t.title} — Rs. ${t.totalAmount.toLocaleString("en-PK")} (${t.payer.name} paid). Settle up: ${ticketUrl}`;
}
