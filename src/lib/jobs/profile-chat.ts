import "server-only";

import { z } from "zod";

import { JobStatus } from "@/generated/prisma/enums";
import { getAiProvider } from "@/lib/ai";
import { loadTaskOptions } from "@/lib/ai/task-options";
import { profileChat } from "@/lib/ai/tasks";
import { prisma } from "@/lib/prisma";
import { profileChangeSchema } from "@/lib/profile-changes";
import { loadProfile } from "@/lib/profile-data";
import { entryVersions } from "@/lib/profile-review-apply";

import { cancelJob, defineJob } from "./runner";

/** The key of the profile chat's jobs; there's one at a time. */
export const PROFILE_CHAT_KEY = "profile-chat";

const turn = z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(20_000) });

/**
 * Answers a message in the profile chat (.scratch/profile-chat): the reply
 * and the changes it proposes, checked against the profile, with when each
 * entry was last saved so applying can notice a later edit. Nothing changes
 * here, and the conversation isn't kept anywhere else: the panel deletes the
 * job once it has shown the answer, and the retention sweep takes any left.
 */
export const profileChatJob = defineJob({
  type: "profile-chat",
  input: z.object({ turns: z.array(turn).min(1).max(100) }),
  result: z.object({
    reply: z.string(),
    question: z.boolean(),
    declined: z.boolean(),
    changes: z.array(z.object({ change: profileChangeSchema, unverified: z.array(z.string()) })),
    refused: z.array(z.object({ change: profileChangeSchema, reason: z.string() })),
    versions: z.record(z.string(), z.string()),
  }),
  async run({ turns }, { step, signal }) {
    await step("Thinking");
    const [provider, options, profile, versions] = await Promise.all([getAiProvider(), loadTaskOptions(), loadProfile(), entryVersions(prisma)]);
    const { data } = await profileChat(provider, { turns, profile }, { ...options, signal });
    return { ...data, versions };
  },
});

export type ProfileChatJobResult = z.infer<typeof profileChatJob.result>;

/** Deletes the chat's jobs, or one of them; one still under way is stopped first. */
export async function discardProfileChats(id?: string): Promise<void> {
  const where = { type: profileChatJob.type, ...(id ? { id } : {}) };
  const unfinished = await prisma.job.findMany({ where: { ...where, status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] } }, select: { id: true } });
  for (const job of unfinished) await cancelJob(job.id);
  await prisma.job.deleteMany({ where });
}
