"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  getGroup,
  getGroups,
  mintGroupId,
  updateGroups,
} from "@/lib/store-groups";
import { readIndexOrRebuild } from "@/lib/tickets-index";
import { requireViewer, getViewer } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import type { Group } from "@/lib/types";

const webhookSchema = z
  .string()
  .trim()
  .url()
  .max(500)
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? v : undefined));

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(200);

const createGroupSchema = z.object({
  name: z.string().min(1).max(80),
  slackWebhookUrl: webhookSchema,
  memberEmails: z.array(emailSchema).max(200).optional().default([]),
});

const updateGroupSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  slackWebhookUrl: webhookSchema,
  memberEmails: z.array(emailSchema).max(200).optional(),
});

function dedupeEmails(emails: string[]): string[] {
  return Array.from(new Set(emails.map((e) => e.toLowerCase())));
}

export async function createGroupAction(input: unknown): Promise<Group> {
  const viewer = await requireViewer();
  const data = createGroupSchema.parse(input);
  const id = mintGroupId();
  const now = new Date().toISOString();
  const memberEmails = dedupeEmails([...(data.memberEmails ?? []), viewer.email]);
  const group: Group = {
    id,
    name: data.name.trim(),
    slackWebhookUrl: data.slackWebhookUrl ?? null,
    memberEmails,
    createdBy: viewer.email,
    createdAt: now,
  };
  await updateGroups((groups) => [...groups, group]);
  revalidatePath("/groups");
  return group;
}

export async function updateGroupAction(id: string, input: unknown): Promise<Group> {
  const admin = await isAdmin();
  const viewer = admin ? await getViewer() : await requireViewer();
  const data = updateGroupSchema.parse(input);
  const existing = await getGroup(id);
  if (!existing) throw new Error("Group not found");
  if (!admin && viewer?.email !== existing.createdBy) throw new Error("not_authorized");

  let result!: Group;
  await updateGroups((groups) => {
    const idx = groups.findIndex((g) => g.id === id);
    if (idx === -1) throw new Error("Group not found");
    const cur = groups[idx];
    const next: Group = {
      ...cur,
      name: data.name?.trim() ?? cur.name,
      slackWebhookUrl:
        data.slackWebhookUrl === undefined ? cur.slackWebhookUrl : data.slackWebhookUrl,
      memberEmails:
        data.memberEmails === undefined
          ? cur.memberEmails
          : dedupeEmails([...data.memberEmails, cur.createdBy]),
    };
    groups[idx] = next;
    result = next;
    return groups;
  });
  revalidatePath(`/groups/${id}`);
  revalidatePath("/groups");
  return result;
}

export async function deleteGroupAction(id: string): Promise<void> {
  const admin = await isAdmin();
  const viewer = admin ? await getViewer() : await requireViewer();
  const existing = await getGroup(id);
  if (!existing) return;
  if (!admin && viewer?.email !== existing.createdBy) throw new Error("not_authorized");

  const index = await readIndexOrRebuild();
  if (index.some((e) => e.groupId === id)) {
    throw new Error("group_has_tickets");
  }
  await updateGroups((groups) => groups.filter((g) => g.id !== id));
  revalidatePath("/groups");
  redirect("/groups");
}

export async function leaveGroupAction(id: string): Promise<void> {
  const viewer = await requireViewer();
  const existing = await getGroup(id);
  if (!existing) return;
  if (!existing.memberEmails.includes(viewer.email)) return;
  if (existing.createdBy === viewer.email) {
    throw new Error("creator_cannot_leave");
  }
  await updateGroups((groups) => {
    const idx = groups.findIndex((g) => g.id === id);
    if (idx === -1) return groups;
    const cur = groups[idx];
    groups[idx] = {
      ...cur,
      memberEmails: cur.memberEmails.filter((e) => e !== viewer.email),
    };
    return groups;
  });
  revalidatePath("/groups");
  redirect("/groups");
}

export async function listGroupsForViewerAction(): Promise<Group[]> {
  const admin = await isAdmin();
  const viewer = await getViewer();
  const all = await getGroups();
  if (admin) return all;
  if (!viewer) return [];
  return all.filter((g) => g.memberEmails.includes(viewer.email));
}
