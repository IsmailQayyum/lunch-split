// Client-safe types + constants. Kept out of lib/store-roster.ts so that
// importing WALLET_APPS from a client component doesn't drag the server-only
// Redis client (via the store module) into the client bundle.

export type WalletApp = "jazzcash" | "easypaisa" | "nayapay" | "sadapay";

export const WALLET_APPS: { id: WalletApp; label: string }[] = [
  { id: "jazzcash", label: "JazzCash" },
  { id: "easypaisa", label: "EasyPaisa" },
  { id: "nayapay", label: "NayaPay" },
  { id: "sadapay", label: "SadaPay" },
];

export type Person = {
  id: string;
  name: string;
  email: string | null;
  whatsapp: string | null;
  walletNumber: string | null;
  walletApps: WalletApp[];
  iban: string | null;
  accountTitle: string | null;
  acceptsCash: boolean;
  hasAccount: boolean;
};

export function findPersonByEmail(roster: Person[], email: string | null | undefined) {
  if (!email) return null;
  const target = email.toLowerCase();
  return roster.find((p) => (p.email ?? "").toLowerCase() === target) ?? null;
}
