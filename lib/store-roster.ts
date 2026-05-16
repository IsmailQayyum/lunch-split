import "server-only";
import { redis, CAS_LUA, casBackoff, CAS_MAX_ATTEMPTS } from "./redis";
import { WALLET_APPS, type Person, type WalletApp } from "./wallet-apps";

// Re-export so existing server-side import sites keep working without churn.
export { WALLET_APPS, findPersonByEmail } from "./wallet-apps";
export type { Person, WalletApp } from "./wallet-apps";

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
