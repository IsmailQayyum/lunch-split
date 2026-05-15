// Normalize a WhatsApp number to wa.me format (no +, no spaces, no dashes).
export function normalizeWhatsapp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.replace(/[\s\-()]/g, "").trim();
  if (s.startsWith("+")) s = s.slice(1);
  if (s.startsWith("00")) s = s.slice(2);
  // Pakistani local format: 03xx... → 92 3xx...
  if (s.startsWith("0") && s.length === 11) s = "92" + s.slice(1);
  return /^\d{7,15}$/.test(s) ? s : null;
}

export function whatsappUrl(number: string, text: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

export function reminderText(opts: {
  payerName: string;
  ticketTitle: string;
  amount: string;
  ticketUrl: string;
  currency: string;
}) {
  return `Salam! Quick reminder for *${opts.ticketTitle}* — your share is ${opts.currency} ${opts.amount}. ${opts.payerName} is waiting on you. Mark yourself paid here: ${opts.ticketUrl}`;
}
