import "server-only";
import { customAlphabet } from "nanoid";
import { redis, CAS_LUA, casBackoff, CAS_MAX_ATTEMPTS } from "./redis";
import type { Group } from "./types";

const newGroupId = customAlphabet(
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  10,
);

const KEY = "groups";

function normalize(raw: unknown): Group | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.name !== "string") return null;
  if (typeof o.createdBy !== "string" || typeof o.createdAt !== "string") return null;
  const memberEmails = Array.isArray(o.memberEmails)
    ? (o.memberEmails.filter((e): e is string => typeof e === "string").map((e) =>
        e.toLowerCase(),
      ) as string[])
    : [];
  return {
    id: o.id,
    name: o.name,
    slackWebhookUrl:
      typeof o.slackWebhookUrl === "string" && o.slackWebhookUrl ? o.slackWebhookUrl : null,
    memberEmails,
    createdBy: o.createdBy.toLowerCase(),
    createdAt: o.createdAt,
  };
}

export async function getGroups(): Promise<Group[]> {
  const raw = await redis.get<string>(KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map(normalize).filter((g): g is Group => !!g);
  } catch {
    return [];
  }
}

export async function getGroup(id: string): Promise<Group | null> {
  const all = await getGroups();
  return all.find((g) => g.id === id) ?? null;
}

export async function getGroupsForEmail(email: string | null | undefined): Promise<Group[]> {
  if (!email) return [];
  const target = email.toLowerCase();
  const all = await getGroups();
  return all.filter((g) => g.memberEmails.includes(target));
}

export function isGroupMember(group: Group, email: string | null | undefined): boolean {
  if (!email) return false;
  return group.memberEmails.includes(email.toLowerCase());
}

export async function putGroups(groups: Group[]): Promise<void> {
  await redis.set(KEY, JSON.stringify(groups));
}

export async function updateGroups(
  mutator: (g: Group[]) => Group[] | Promise<Group[]>,
): Promise<Group[]> {
  for (let attempt = 0; attempt < CAS_MAX_ATTEMPTS; attempt++) {
    const currentRaw = (await redis.get<string>(KEY)) ?? "";
    let currentArr: Group[];
    try {
      currentArr = currentRaw ? JSON.parse(currentRaw) : [];
      if (!Array.isArray(currentArr)) currentArr = [];
      else currentArr = currentArr.map(normalize).filter((g): g is Group => !!g);
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
  throw new Error("updateGroups failed after retries");
}

export function mintGroupId(): string {
  return newGroupId();
}
