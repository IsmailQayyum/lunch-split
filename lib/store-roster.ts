import "server-only";
import { redis, CAS_LUA, casBackoff, CAS_MAX_ATTEMPTS } from "./redis";

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

const KEY = "roster";

// Migrate old shape (separate jazzcash/easypaisa fields) to new shape.
function normalize(raw: unknown): Person | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.name !== "string") return null;

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
  const raw = await redis.get<string>(KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map(normalize).filter((p): p is Person => !!p);
  } catch {
    return [];
  }
}

export async function putRoster(roster: Person[]): Promise<void> {
  await redis.set(KEY, JSON.stringify(roster));
}

// Atomic CAS-based mutator. Prefer this over the read/putRoster pattern in
// action handlers — eliminates race conditions when two edits land at once.
export async function updateRoster(
  mutator: (r: Person[]) => Person[] | Promise<Person[]>,
): Promise<Person[]> {
  for (let attempt = 0; attempt < CAS_MAX_ATTEMPTS; attempt++) {
    const currentRaw = (await redis.get<string>(KEY)) ?? "";
    let currentArr: Person[];
    try {
      currentArr = currentRaw ? JSON.parse(currentRaw) : [];
      if (!Array.isArray(currentArr)) currentArr = [];
      else currentArr = currentArr.map(normalize).filter((p): p is Person => !!p);
    } catch {
      currentArr = [];
    }

    const next = await mutator(currentArr);
    const nextStr = JSON.stringify(next);

    if (currentRaw === "") {
      const ok = await redis.set(KEY, nextStr, { nx: true });
      if (ok !== null) return next;
    } else {
      const result = (await redis.eval(CAS_LUA, [KEY], [currentRaw, nextStr])) as string;
      if (result === nextStr) return next;
    }

    await casBackoff();
  }
  throw new Error("updateRoster failed after retries");
}

export function findPersonByEmail(roster: Person[], email: string | null | undefined) {
  if (!email) return null;
  const target = email.toLowerCase();
  return roster.find((p) => (p.email ?? "").toLowerCase() === target) ?? null;
}
