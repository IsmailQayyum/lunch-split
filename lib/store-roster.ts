import { put, list } from "@vercel/blob";

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
  // Mobile number — typically shared across multiple wallet apps
  walletNumber: string | null;
  walletApps: WalletApp[];
  // Bank
  iban: string | null;
  accountTitle: string | null;
  acceptsCash: boolean;
};

const PATH = "roster.json";

// Migrate old shape (separate jazzcash/easypaisa fields) to new shape.
function normalize(raw: unknown): Person | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.name !== "string") return null;

  // New fields, if present
  let walletNumber = typeof o.walletNumber === "string" ? o.walletNumber : null;
  let walletApps = Array.isArray(o.walletApps)
    ? (o.walletApps.filter((a): a is WalletApp =>
        WALLET_APPS.some((w) => w.id === a),
      ) as WalletApp[])
    : [];

  // Legacy: if old jazzcash/easypaisa fields are set, fold into new model
  const legacyJazz = typeof o.jazzcash === "string" ? o.jazzcash : null;
  const legacyEasy = typeof o.easypaisa === "string" ? o.easypaisa : null;
  if (!walletNumber && (legacyJazz || legacyEasy)) {
    walletNumber = legacyJazz || legacyEasy;
    const apps = new Set<WalletApp>(walletApps);
    if (legacyJazz && legacyJazz === walletNumber) apps.add("jazzcash");
    if (legacyEasy && legacyEasy === walletNumber) apps.add("easypaisa");
    walletApps = Array.from(apps);
  }

  return {
    id: o.id,
    name: o.name,
    email: typeof o.email === "string" ? o.email : null,
    whatsapp: typeof o.whatsapp === "string" ? o.whatsapp : null,
    walletNumber,
    walletApps,
    iban: typeof o.iban === "string" ? o.iban : null,
    accountTitle: typeof o.accountTitle === "string" ? o.accountTitle : null,
    acceptsCash: typeof o.acceptsCash === "boolean" ? o.acceptsCash : true,
  };
}

export async function getRoster(): Promise<Person[]> {
  try {
    const { blobs } = await list({ prefix: PATH });
    const exact = blobs.find((b) => b.pathname === PATH);
    if (!exact) return [];
    const bustUrl = `${exact.url}?t=${Date.now()}`;
    const res = await fetch(bustUrl, { cache: "no-store" });
    if (!res.ok) return [];
    const arr = await res.json();
    if (!Array.isArray(arr)) return [];
    return arr.map(normalize).filter((p): p is Person => !!p);
  } catch {
    return [];
  }
}

export async function putRoster(roster: Person[]): Promise<void> {
  await put(PATH, JSON.stringify(roster), {
    access: "public",
    contentType: "application/json",
    allowOverwrite: true,
    addRandomSuffix: false,
    cacheControlMaxAge: 0,
  });
}

export function findPersonByEmail(roster: Person[], email: string | null | undefined) {
  if (!email) return null;
  const target = email.toLowerCase();
  return roster.find((p) => (p.email ?? "").toLowerCase() === target) ?? null;
}
