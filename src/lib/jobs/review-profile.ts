import "server-only";

import { z } from "zod";

import { JobStatus } from "@/generated/prisma/enums";
import { getAiProvider } from "@/lib/ai";
import { loadTaskOptions } from "@/lib/ai/task-options";
import { reviewProfile } from "@/lib/ai/tasks";
import { reviewAnswerSchema } from "@/lib/ai/tasks/review-profile";
import { prisma } from "@/lib/prisma";
import { loadProfile } from "@/lib/profile-data";
import { REVIEW_PROFILE_STEPS } from "@/lib/profile-review";
import { entryVersions } from "@/lib/profile-review-apply";
import { loadSettings } from "@/lib/settings-data";

import { cancelJob, defineJob } from "./runner";

/**
 * Reviews the profile for duplicates and contradictions (.scratch/profile-review).
 * Nothing changes here: the model's answer waits in the job, with when each
 * entry was last saved, until the user applies or discards its fixes, and
 * the job goes then. It holds ids and the model's reasons, not the profile.
 */
export const reviewProfileJob = defineJob({
  type: "review-profile",
  input: z.object({}),
  result: z.object({ answer: reviewAnswerSchema, versions: z.record(z.string(), z.string()), reviewedWith: z.string() }),
  async run(_input, { step, signal }) {
    await step(REVIEW_PROFILE_STEPS[0]);
    const [provider, options, profile, versions, { reviewSkipped }] = await Promise.all([
      getAiProvider(),
      loadTaskOptions(),
      loadProfile(),
      entryVersions(prisma),
      loadSettings(),
    ]);
    await step(REVIEW_PROFILE_STEPS[1]);
    const { data, promptVersion } = await reviewProfile(provider, { profile, skipped: reviewSkipped }, { ...options, signal });
    return { answer: data, versions, reviewedWith: promptVersion };
  },
});

export type ReviewProfileResult = z.infer<typeof reviewProfileJob.result>;

/** Deletes a review, or all of them; one still under way is stopped first. */
export async function discardProfileReviews(id?: string): Promise<void> {
  const where = { type: reviewProfileJob.type, ...(id ? { id } : {}) };
  const unfinished = await prisma.job.findMany({ where: { ...where, status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] } }, select: { id: true } });
  for (const job of unfinished) await cancelJob(job.id);
  await prisma.job.deleteMany({ where });
}
