import { z } from "zod";

import { HEADLINE_UNIT, unitsSchema, type Extracted, type Match, type Unit } from "@/lib/application-data";
import { publicationLabel } from "@/lib/citation";
import { documentLabels, ENGLISH_LABELS, languagesLine, type DocumentLabels } from "@/lib/document-labels";
import { resumeCourses, resumePublications, sameName, type ProfileData } from "@/lib/profile";
import type { RoleLocations } from "@/lib/settings";

import { claimSources, guardUnits } from "../fact-guard";
import type { AIProvider } from "../provider";

import {
  applicationFacts,
  BULLET_RULES,
  candidateFacts,
  CREATIVITY,
  jobForPrompt,
  languageRule,
  localDate,
  NO_EM_DASHES,
  PLAIN_WORDING,
  postingAsPublished,
  profileForPrompt,
  system,
  truthfulness,
  UNTRUSTED_POSTING,
  type TaskOptions,
  type TaskResult,
} from "./prompt-parts";

export const TAILOR_RESUME_VERSION = "tailor-resume@9";

const answerSchema = z.object({
  /** The line under the name, for this job (.scratch/tailored-headline). */
  headline: z.string(),
  summary: z.string(),
  roles: z.array(z.object({ id: z.string(), bullets: z.array(z.string()) })),
  projects: z.array(z.object({ id: z.string(), bullets: z.array(z.string()) })),
  /** The profile's skills, most relevant first; leave out ones that don't help. */
  skills: z.array(z.string()),
  education: z.array(z.object({ id: z.string(), notes: z.string() })),
  /** Only the courses that help with this job, most relevant first. */
  courses: z.array(z.object({ id: z.string(), notes: z.string() })),
});

const INSTRUCTIONS = `You tailor a candidate's resume to one job, as JSON.

- headline: the one short line under the candidate's name, for this job: a title, optionally with a focus after " · " (e.g. "Data Engineer · Streaming and analytics"). Use titles the candidate has held and skills they have, not the job's title unless they've held it. Start from their own headline.
- summary: 2–3 sentences in the first person without "I" at the start of every sentence, about the candidate as this job would see them.
- roles: every role from the profile, by id. Recent roles and those closest to this job get the most bullets (up to 5); older roles that don't bear on it get 1–2. Lead with what this job cares about, keep each bullet to about a line, and start with a verb.
- projects: every project from the profile, by id, with 1–3 bullets each, written like the roles' bullets: what was built and what it shows that this job cares about.
- skills: the candidate's own skills, most relevant to this job first. Copy their names exactly; you may leave out ones that don't help.
- Read the posting for what the job does day to day and what it values, and let that decide what leads. Requirements marked "gap" are what the candidate doesn't have: never write them into the resume, not even in other words. When the posting names a skill the candidate has under another spelling ("PostgreSQL" for "Postgres"), use the posting's in bullets and the summary.
- education: every entry by id, with its notes shortened or left empty.
- courses: only the courses and certificates from the profile that help with this job, by id, most relevant first, with their notes shortened or left empty. Leave out the rest; an empty list is fine.
- The profile's publications go on the resume word for word, so don't answer with them; the summary may mention them.`;

/**
 * Settings → "Work locations on resumes" is "When the posting asks": the
 * model says whether this posting cares where the candidate has worked. It
 * only decides whether the locations typed in the profile are printed; it
 * never writes one.
 */
const withLocations = answerSchema.extend({ showLocations: z.boolean() });
const LOCATIONS_QUESTION =
  "- showLocations: true when the posting cares where the candidate has worked: experience in a country, region or market, being local or able to relocate, or work authorisation somewhere. Otherwise false. The resume then shows the location each role has in the profile.";

/** SET-9: asked for when "Resume length" has a limit; anything still over is trimmed afterwards (E10-10). */
function pageFit(maxPages: number | null | undefined): string | null {
  if (maxPages === 1) {
    return "The resume has to fit on one page: keep the summary to two sentences, give the most relevant roles 3–4 bullets and older roles 2, keep education, course and project notes to a few words, and list only the courses that matter most.";
  }
  if (maxPages === 2) {
    return "The resume has to fit on two pages: keep the summary to three sentences, give the most relevant roles 4–5 bullets and older roles 2–3, and keep education, course and project notes short.";
  }
  return null;
}

export type TailorInput = {
  profile: ProfileData;
  extracted: Extracted;
  match: Match | null;
  /** What the candidate tells the AI for this application (APP-15). */
  facts: string[];
  /** The posting as pasted: read by the model for what the job is, never backing a claim. */
  posting: string;
  /** For which roles are recent. */
  today?: Date;
  /** Settings → "Work locations on resumes"; only "posting" asks the model. */
  locations?: RoleLocations;
};

/** The units, and whether the resume shows each role's location when tailoring decided it (null: the setting decides). */
export type TailoredResume = TaskResult<Unit[]> & { showLocations: boolean | null };

/** APP-4: the tailored resume as units (headline, summary, each role, each project, skills, each degree, the courses that help, each publication, languages). */
export async function tailorResume(
  provider: AIProvider,
  { profile, extracted, match, facts, posting, today = new Date(), locations = "never" }: TailorInput,
  options: TaskOptions,
): Promise<TailoredResume> {
  const askLocations = locations === "posting";
  const answer = await provider.complete({
    system: system(
      INSTRUCTIONS,
      askLocations ? LOCATIONS_QUESTION : null,
      `Today is ${localDate(today)}.`,
      pageFit(options.maxPages),
      BULLET_RULES,
      truthfulness(options.strict),
      candidateFacts(profile, facts),
      CREATIVITY[options.creativity],
      languageRule(options.language),
      UNTRUSTED_POSTING,
      PLAIN_WORDING,
      NO_EM_DASHES,
    ),
    messages: [
      {
        role: "user",
        content: [
          `The candidate's profile:\n${profileForPrompt(profile)}`,
          `The job:\n${jobForPrompt(extracted, match)}`,
          postingAsPublished(posting),
          applicationFacts(facts),
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    schema: askLocations ? withLocations : answerSchema,
    schemaName: "tailored_resume",
    creativity: options.creativity,
    signal: options.signal,
  });
  // The languages line in the resume's language: the chosen one, or the posting's.
  const units = resumeUnits(profile, answer, documentLabels(options.language ?? extracted.language));
  // E6-6: in strict mode, note what the profile doesn't back; the posting's wishes don't count.
  return {
    data: options.strict ? guardUnits(units, claimSources(profile, extracted, match, facts, today)) : units,
    promptVersion: TAILOR_RESUME_VERSION,
    // Asked for, the answer was checked against withLocations.
    showLocations: askLocations ? (answer as z.infer<typeof withLocations>).showLocations : null,
  };
}

/**
 * Turns the answer into units, trusting nothing: an empty headline is the
 * profile's (as is a missing one, from the connector), unknown roles, projects,
 * degrees and courses are dropped, skills must be the profile's own, and a role or
 * project the model skipped keeps its bullets from the profile. Courses are the
 * exception: the resume has only those the model chose, in its order. The publications and languages
 * come from the profile, publications word for word (#218), and languages with their levels in
 * the words of `labels`.
 */
export function resumeUnits(
  profile: ProfileData,
  answer: Omit<z.infer<typeof answerSchema>, "headline"> & { headline?: string },
  labels: DocumentLabels = ENGLISH_LABELS): Unit[] {
  const roles = new Map(answer.roles.map((role) => [role.id, role.bullets]));
  const projects = new Map(answer.projects.map((project) => [project.id, project.bullets]));
  const notes = new Map(answer.education.map((entry) => [entry.id, entry.notes]));
  const skills = [
    ...new Set(answer.skills.flatMap((name) => profile.skills.find((skill) => sameName(skill.name, name))?.name ?? [])),
  ];
  const units: Unit[] = [
    { id: HEADLINE_UNIT, label: "Headline", text: answer.headline?.trim() || profile.basics.headline.trim() },
    { id: "summary", label: "Summary", text: answer.summary.trim() },
    ...profile.experience.map((entry) => {
      const bullets = (roles.get(entry.id) ?? entry.bullets.split("\n")).map((line) => line.trim()).filter(Boolean);
      return { id: `experience:${entry.id}`, label: `${entry.company || entry.role} role`, text: bullets.join("\n") };
    }),
    ...profile.projects.map((entry) => {
      const bullets = (projects.get(entry.id) ?? entry.bullets.split("\n")).map((line) => line.trim()).filter(Boolean);
      return { id: `project:${entry.id}`, label: `${entry.name || "Untitled"} project`, text: bullets.join("\n") };
    }),
    { id: "skills", label: "Skills", text: skills.join(" · ") },
    ...profile.education.map((entry) => ({
      id: `education:${entry.id}`,
      label: entry.degree || entry.school,
      text: (notes.get(entry.id) ?? entry.notes).trim(),
    })),
    ...courseUnits(profile, answer.courses),
    ...resumePublications(profile.publications).map((entry) => ({
      id: `publication:${entry.id}`,
      label: publicationLabel(entry.citation),
      text: entry.citation.trim(),
    })),
    {
      id: "languages",
      label: "Languages",
      text: languagesLine(profile.languages, labels),
    },
  ];
  return unitsSchema.parse(units);
}

/** The courses the model chose, in its order: each once, only those shown on resumes. */
function courseUnits(profile: ProfileData, chosen: { id: string; notes: string }[]): Unit[] {
  const courses = new Map(resumeCourses(profile.courses).map((entry) => [entry.id, entry]));
  const seen = new Set<string>();
  return chosen.flatMap(({ id, notes }) => {
    const entry = courses.get(id);
    if (!entry || seen.has(id)) return [];
    seen.add(id);
    return [{ id: `course:${id}`, label: entry.name.trim(), text: notes.trim() }];
  });
}
