import { z } from "zod";

import type { DateSpan, ProfileData } from "@/lib/profile";
import { REVIEW_SECTIONS, type ReviewAnswer } from "@/lib/profile-review";

import { system, type Task } from "./prompt-parts";

export const REVIEW_PROFILE_VERSION = "review-profile@1";

// The profile review (.scratch/profile-review): the model looks for the same
// entry entered twice and for entries that contradict themselves. It only
// points at entries by id; buildFixes assembles every fix from the profile,
// each time they're shown or applied, so nothing the model wrote is ever
// saved. Four plain lists rather than one union, which small local models
// and strict JSON-schema modes handle best.

const section = z.enum(REVIEW_SECTIONS);
/** The answer's shape; buildFixes decides what in it can be trusted. */
export const reviewAnswerSchema = z.object({
  merges: z.array(z.object({ section, ids: z.array(z.string()), keep: z.string(), bullets: z.array(z.string()).nullable(), reason: z.string() })),
  edits: z.array(
    z.object({
      section,
      id: z.string(),
      dates: z
        .object({
          startYear: z.number().int().nullable(),
          startMonth: z.number().int().nullable(),
          endYear: z.number().int().nullable(),
          endMonth: z.number().int().nullable(),
          current: z.boolean(),
        })
        .nullable(),
      bullets: z.array(z.string()).nullable(),
      reason: z.string(),
    }),
  ),
  deletions: z.array(z.object({ section, id: z.string(), reason: z.string() })),
  skillMerges: z.array(z.object({ ids: z.array(z.string()), keep: z.string(), reason: z.string() })),
}) satisfies z.ZodType<ReviewAnswer>;

const INSTRUCTIONS = `You check a job seeker's profile for mistakes that crept in while it was entered by hand or imported from resumes, and answer as JSON. You don't write or improve anything: you point at entries by their id, and the app makes the changes once the candidate agrees.

Look only for these:
- merges: two or more entries in one section that are the same role, project, degree or course, even when worded differently ("Sr. Software Engineer" at "Acme Inc." and "Senior Software Engineer" at "ACME"), usually with overlapping dates. keep is the id of the most complete one. bullets: for experience and projects, the bullets the merged entry should keep, copied exactly from the entries, leaving out ones that say the same thing twice; null to keep them all. Two different roles at the same company (a promotion) are not the same entry.
- edits: an entry whose own dates contradict each other (an end before its start, an end date with current set to true) or that repeats a bullet. dates: the corrected dates, using only years and months the entry already has, or null to leave them. bullets: the entry's bullets without the repeats, copied exactly, or null to leave them.
- deletions: an entry with nothing useful in it, such as no title or name and no bullets or notes.
- skillMerges: two or more skills that are the same skill under different names ("JS" and "JavaScript", "React" and "React.js"). keep is the id of the name to keep, usually the fuller one. Related but different skills ("React" and "React Native") are not the same.

Each fix has a reason: one short, plain sentence the candidate will read, such as "Both are your role at Acme from 2021, entered twice."
Put each entry in one fix at most. When nothing is wrong, answer with empty lists; don't look for problems that aren't there.
Leave alone anything in "alreadyChecked": the candidate has said those are fine.`;

/** Every entry the review looks at, with its id and raw dates; contact details and references stay out. */
export function profileForReview(profile: ProfileData, skipped: readonly string[]): string {
  const skillNames = new Map(profile.skills.map((skill) => [skill.id, skill.name]));
  const bullets = (text: string) => text.split("\n").map((line) => line.trim()).filter(Boolean);
  const dates = ({ startYear, startMonth, endYear, endMonth }: Omit<DateSpan, "current">) => ({ startYear, startMonth, endYear, endMonth });
  return JSON.stringify(
    {
      experience: profile.experience.map((entry) => ({
        id: entry.id,
        role: entry.role,
        company: entry.company,
        location: entry.location,
        ...dates(entry),
        current: entry.current,
        bullets: bullets(entry.bullets),
        skills: entry.skillIds.flatMap((id) => skillNames.get(id) ?? []),
      })),
      projects: profile.projects.map((entry) => ({
        id: entry.id,
        name: entry.name,
        ...dates(entry),
        current: entry.current,
        bullets: bullets(entry.bullets),
        skills: entry.skillIds.flatMap((id) => skillNames.get(id) ?? []),
      })),
      education: profile.education.map((entry) => ({ id: entry.id, degree: entry.degree, school: entry.school, ...dates(entry), current: entry.current, notes: entry.notes })),
      // All of them, those kept off resumes too: a hidden copy is still a copy.
      courses: profile.courses.map((entry) => ({ id: entry.id, name: entry.name, provider: entry.provider, ...dates(entry), duration: entry.duration, notes: entry.notes })),
      skills: profile.skills.map(({ id, name }) => ({ id, name })),
      ...(skipped.length > 0 ? { alreadyChecked: skipped } : {}),
    },
    null,
    2,
  );
}

/** What the model thinks the profile needs, for buildFixes; `skipped` holds fingerprints the user turned down. */
export const reviewProfile: Task<{ profile: ProfileData; skipped: readonly string[] }, ReviewAnswer> = async (provider, { profile, skipped }, { signal }) => {
  const answer = await provider.complete({
    system: system(INSTRUCTIONS),
    messages: [{ role: "user", content: `The candidate's profile:\n${profileForReview(profile, skipped)}` }],
    schema: reviewAnswerSchema,
    schemaName: "profile_review",
    // Comparing, not writing: stay literal, and let it think it through.
    creativity: "FAITHFUL",
    signal,
  });
  return { data: answer, promptVersion: REVIEW_PROFILE_VERSION };
};
