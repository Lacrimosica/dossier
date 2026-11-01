import type { CourseItem, DateSpan, EducationItem, ExperienceItem, ProfileData, ProjectItem } from "@/lib/profile";

// The profile review (.scratch/profile-review): the AI says what looks wrong,
// this module builds each fix from the profile itself and drops any fix that
// would put something into the profile it doesn't already say. That's what
// keeps the review within "zero invented facts" (PRD §12) without the fact
// guard: a merge is assembled here, never written by the model, and an edit
// can only reuse an entry's own dates and bullets.

export const REVIEW_SECTIONS = ["experience", "projects", "education", "courses"] as const;
export type ReviewSection = (typeof REVIEW_SECTIONS)[number];

type Entries = { experience: ExperienceItem; projects: ProjectItem; education: EducationItem; courses: CourseItem };
export type ReviewEntry = Entries[ReviewSection];

/** What the model answers, before anything in it is trusted. */
export type ReviewAnswer = {
  merges: { section: ReviewSection; ids: string[]; keep: string; bullets: string[] | null; reason: string }[];
  edits: { section: ReviewSection; id: string; dates: DateSpan | null; bullets: string[] | null; reason: string }[];
  deletions: { section: ReviewSection; id: string; reason: string }[];
  skillMerges: { ids: string[]; keep: string; reason: string }[];
};

type SectionFix<S extends ReviewSection> =
  /** `after` is the kept entry as it will be; the others are deleted. */
  | { kind: "merge"; section: S; ids: string[]; keep: string; after: Entries[S]; reason: string }
  | { kind: "edit"; section: S; id: string; after: Entries[S]; reason: string }
  | { kind: "delete"; section: S; id: string; reason: string };

/** A fix the user can apply, built from the profile and safe to apply as it is. */
export type ProfileFix =
  | { [S in ReviewSection]: SectionFix<S> }[ReviewSection]
  | { kind: "mergeSkills"; ids: string[]; keep: string; reason: string };

/** The most fixes one review shows; a profile needing more is better reviewed again after. */
export const MAX_FIXES = 50;
const MAX_REASON = 300;

const TEXT_FIELDS = {
  experience: ["role", "company", "location"],
  projects: ["name", "link"],
  education: ["degree", "school"],
  courses: ["name", "provider", "duration", "link"],
} as const satisfies { [S in ReviewSection]: readonly (keyof Entries[S])[] };

const DEFAULT_REASONS = {
  merge: "These look like the same entry.",
  edit: "Its dates or points don't add up.",
  delete: "This entry looks empty.",
  mergeSkills: "These look like the same skill.",
} as const;

/** Identifies a fix across reviews, so one the user skipped isn't proposed again. */
export function fixFingerprint(fix: Pick<ProfileFix, "kind"> & { section?: ReviewSection; ids?: string[]; id?: string }): string {
  const ids = fix.ids ?? (fix.id ? [fix.id] : []);
  return `${fix.kind}:${fix.section ?? "skills"}:${[...ids].sort().join(",")}`;
}

/**
 * The fixes to show for an answer: each one built from the profile, in the
 * answer's order (merges, edits, deletions, then skills), without fixes
 * that point at entries that aren't there, touch an entry an earlier fix
 * already touches, change nothing, or were skipped before.
 */
export function buildFixes(profile: ProfileData, answer: ReviewAnswer, skipped: readonly string[] = []): ProfileFix[] {
  const fixes: ProfileFix[] = [];
  const claimed = new Set<string>();
  const wasSkipped = new Set(skipped);
  const reason = (text: string, kind: ProfileFix["kind"]) => text.trim().slice(0, MAX_REASON) || DEFAULT_REASONS[kind];

  /** Adds a fix unless it was skipped or one of its entries is already in a fix. */
  const add = (fix: ProfileFix, keys: string[]) => {
    if (fixes.length >= MAX_FIXES || wasSkipped.has(fixFingerprint(fix)) || keys.some((key) => claimed.has(key))) return;
    keys.forEach((key) => claimed.add(key));
    fixes.push(fix);
  };

  for (const merge of answer.merges) {
    const ids = [...new Set(merge.ids)];
    const entries = ids.map((id) => find(profile, merge.section, id));
    const kept = entries.find((entry) => entry?.id === merge.keep);
    if (ids.length < 2 || !kept || entries.some((entry) => !entry)) continue;
    const others = (entries as ReviewEntry[]).filter((entry) => entry !== kept);
    const after = merged(merge.section, kept, others, merge.bullets);
    add({ kind: "merge", section: merge.section, ids, keep: kept.id, after, reason: reason(merge.reason, "merge") } as ProfileFix, keysFor(merge.section, ids));
  }

  for (const edit of answer.edits) {
    const entry = find(profile, edit.section, edit.id);
    const after = entry && edited(edit.section, entry, edit);
    if (!after) continue;
    add({ kind: "edit", section: edit.section, id: entry.id, after, reason: reason(edit.reason, "edit") } as ProfileFix, keysFor(edit.section, [entry.id]));
  }

  for (const deletion of answer.deletions) {
    if (!find(profile, deletion.section, deletion.id)) continue;
    add({ kind: "delete", section: deletion.section, id: deletion.id, reason: reason(deletion.reason, "delete") }, keysFor(deletion.section, [deletion.id]));
  }

  const skillIds = new Set(profile.skills.map((skill) => skill.id));
  for (const merge of answer.skillMerges) {
    const ids = [...new Set(merge.ids)];
    if (ids.length < 2 || !ids.includes(merge.keep) || ids.some((id) => !skillIds.has(id))) continue;
    add({ kind: "mergeSkills", ids, keep: merge.keep, reason: reason(merge.reason, "mergeSkills") }, keysFor("skills", ids));
  }

  return fixes;
}

function keysFor(section: ReviewSection | "skills", ids: string[]): string[] {
  return ids.map((id) => `${section}:${id}`);
}

function find(profile: ProfileData, section: ReviewSection, id: string): ReviewEntry | undefined {
  return (profile[section] as readonly ReviewEntry[]).find((entry) => entry.id === id);
}

/** Bullets and notes are compared ignoring case, spacing and a leading list mark. */
function lineKey(line: string): string {
  return line.trim().replace(/^[-*•·]\s+/, "").replace(/\s+/g, " ").toLowerCase();
}

/** Each distinct line once, in order, as the profile wrote it. */
function distinctLines(lines: string[]): string[] {
  const seen = new Map<string, string>();
  for (const line of lines.map((text) => text.trim()).filter(Boolean)) if (!seen.has(lineKey(line))) seen.set(lineKey(line), line);
  return [...seen.values()];
}

/**
 * The lines the model chose, as the profile wrote them, when every one of
 * them is among `pool`; null when it chose none or made one up.
 */
function chosenLines(pool: string[], chosen: string[] | null): string[] | null {
  if (!chosen) return null;
  const byKey = new Map(pool.map((line) => [lineKey(line), line]));
  const picked = distinctLines(chosen);
  if (picked.length === 0 || picked.some((line) => !byKey.has(lineKey(line)))) return null;
  return picked.map((line) => byKey.get(lineKey(line))!);
}

function hasBullets(section: ReviewSection): section is "experience" | "projects" {
  return section === "experience" || section === "projects";
}

const startMonths = (entry: Omit<DateSpan, "current">) => entry.startYear! * 12 + (entry.startMonth ?? 1);
const endMonths = (entry: Omit<DateSpan, "current">) => entry.endYear! * 12 + (entry.endMonth ?? 12);

/** The kept entry with what the others add: empty fields filled, every point once, the widest dates, every skill. */
function merged(section: ReviewSection, kept: ReviewEntry, others: ReviewEntry[], bullets: string[] | null): ReviewEntry {
  const all = [kept, ...others];
  const fields = all as unknown as Record<string, unknown>[];
  const result: Record<string, unknown> = { ...kept };

  for (const field of TEXT_FIELDS[section]) {
    result[field] = fields.map((entry) => entry[field] as string).find((value) => value.trim() !== "") ?? "";
  }

  if (hasBullets(section)) {
    const pool = distinctLines(fields.flatMap((entry) => (entry.bullets as string).split("\n")));
    result.bullets = (chosenLines(pool, bullets) ?? pool).join("\n");
    result.skillIds = [...new Set(fields.flatMap((entry) => entry.skillIds as string[]))];
  } else {
    result.notes = distinctLines(fields.map((entry) => entry.notes as string)).join("\n");
  }

  const spans = all as Omit<DateSpan, "current">[];
  const start = spans.filter((entry) => entry.startYear !== null).sort((a, b) => startMonths(a) - startMonths(b))[0];
  const end = spans.filter((entry) => entry.endYear !== null).sort((a, b) => endMonths(b) - endMonths(a))[0];
  const current = section !== "courses" && (all as DateSpan[]).some((entry) => entry.current);
  Object.assign(result, {
    startYear: start?.startYear ?? null,
    startMonth: start?.startMonth ?? null,
    endYear: current ? null : (end?.endYear ?? null),
    endMonth: current ? null : (end?.endMonth ?? null),
  });
  if (section === "courses") result.onResumes = (all as CourseItem[]).some((entry) => entry.onResumes);
  else result.current = current;

  return result as ReviewEntry;
}

/**
 * The entry with the edit's dates and points, when they only reuse what the
 * entry already has and make sense; null otherwise, or when nothing changes.
 */
function edited(section: ReviewSection, entry: ReviewEntry, edit: ReviewAnswer["edits"][number]): ReviewEntry | null {
  const result: Record<string, unknown> = { ...entry };

  if (edit.dates) {
    const dates = { ...edit.dates, current: section === "courses" ? false : edit.dates.current };
    const years = new Set([entry.startYear, entry.endYear].filter((year) => year !== null));
    const months = new Set([entry.startMonth, entry.endMonth].filter((month) => month !== null));
    const known = (year: number | null, month: number | null) =>
      (year === null ? month === null : years.has(year)) && (month === null || months.has(month));
    if (!known(dates.startYear, dates.startMonth) || !known(dates.endYear, dates.endMonth)) return null;
    if (dates.endYear !== null && (dates.startYear === null || dates.current || endMonths(dates) < startMonths(dates))) return null;
    Object.assign(result, { startYear: dates.startYear, startMonth: dates.startMonth, endYear: dates.endYear, endMonth: dates.endMonth });
    if (section !== "courses") result.current = dates.current;
  }

  if (edit.bullets) {
    if (!hasBullets(section)) return null;
    const chosen = chosenLines(distinctLines((entry as ExperienceItem | ProjectItem).bullets.split("\n")), edit.bullets);
    if (!chosen) return null;
    result.bullets = chosen.join("\n");
  }

  const before = entry as unknown as Record<string, unknown>;
  return Object.keys(result).some((key) => result[key] !== before[key]) ? (result as ReviewEntry) : null;
}
