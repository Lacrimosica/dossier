import { z } from "zod";

import { LanguageLevel } from "@/generated/prisma/enums";
import { isSpokenLanguage } from "@/lib/languages";
import {
  formatDateRange,
  languageLevelLabel,
  MAX_FACTS,
  sameName,
  type CourseItem,
  type EducationItem,
  type ExperienceItem,
  type ProfileData,
  type ProjectItem,
} from "@/lib/profile";

// Profile changes (.scratch/profile-chat): additions and edits to the profile
// that the profile chat proposes and the connector's update_profile sends.
// Whatever wrote them, they're checked here against the profile before
// they're shown or applied, and applied only by applyProfileChanges. Nothing
// here ever deletes: the editor and the profile review do that.

export const CHANGE_SECTIONS = ["experience", "projects", "education", "courses"] as const;
export type ChangeSection = (typeof CHANGE_SECTIONS)[number];

/** The most changes one message or call makes; more is a resume, which import is for. */
export const MAX_CHANGES = 20;
/** The most interests the Interests card keeps. */
const MAX_INTERESTS = 50;

// Lenient on purpose: a wrong year or a long name is refused with a reason
// by checkProfileChanges, rather than failing the whole answer.
const text = z.string().max(20_000);
const lines = z.array(text).max(50);
const year = z.number().int().nullable();
const month = z.number().int().nullable();

const experienceFields = {
  role: text,
  company: text,
  location: text,
  bullets: lines,
  /** Skill names, added to the profile when new and linked to the role. */
  skills: z.array(text).max(50),
  startYear: year,
  startMonth: month,
  endYear: year,
  endMonth: month,
  current: z.boolean(),
};
const projectFields = {
  name: text,
  link: text,
  bullets: lines,
  skills: z.array(text).max(50),
  startYear: year,
  startMonth: month,
  endYear: year,
  endMonth: month,
  current: z.boolean(),
};
const educationFields = {
  degree: text,
  school: text,
  location: text,
  notes: text,
  startYear: year,
  startMonth: month,
  endYear: year,
  endMonth: month,
  current: z.boolean(),
};
const courseFields = { name: text, provider: text, duration: text, link: text, notes: text, startYear: year, startMonth: month, endYear: year, endMonth: month };

/** What an added entry may leave out. */
const blanks = { startYear: year.default(null), startMonth: month.default(null), endYear: year.default(null), endMonth: month.default(null) };

const experienceEntry = z.object({
  ...experienceFields,
  company: text.default(""),
  location: text.default(""),
  bullets: lines.default([]),
  skills: experienceFields.skills.default([]),
  ...blanks,
  current: z.boolean().default(false),
});
const projectEntry = z.object({ ...projectFields, link: text.default(""), bullets: lines.default([]), skills: projectFields.skills.default([]), ...blanks, current: z.boolean().default(false) });
const educationEntry = z.object({
  ...educationFields,
  school: text.default(""),
  location: text.default(""),
  notes: text.default(""),
  ...blanks,
  current: z.boolean().default(false),
});
const courseEntry = z.object({ ...courseFields, provider: text.default(""), duration: text.default(""), link: text.default(""), notes: text.default(""), ...blanks });

const id = z.string().min(1).max(100);
const basicsKeys = z.enum(["headline", "summary", "city", "country"]);

export const profileChangeSchema = z.union([
  z.object({ kind: z.literal("add"), section: z.literal("experience"), entry: experienceEntry }),
  z.object({ kind: z.literal("add"), section: z.literal("projects"), entry: projectEntry }),
  z.object({ kind: z.literal("add"), section: z.literal("education"), entry: educationEntry }),
  z.object({ kind: z.literal("add"), section: z.literal("courses"), entry: courseEntry }),
  // An edit gives only what changes; bullets replace the entry's, skills are linked on top of its own.
  z.object({ kind: z.literal("edit"), section: z.literal("experience"), id, entry: z.object(experienceFields).partial() }),
  z.object({ kind: z.literal("edit"), section: z.literal("projects"), id, entry: z.object(projectFields).partial() }),
  z.object({ kind: z.literal("edit"), section: z.literal("education"), id, entry: z.object(educationFields).partial() }),
  z.object({ kind: z.literal("edit"), section: z.literal("courses"), id, entry: z.object(courseFields).partial() }),
  z.object({ kind: z.literal("addBullets"), section: z.enum(["experience", "projects"]), id, bullets: lines.min(1) }),
  z.object({ kind: z.literal("addSkills"), names: z.array(text).min(1).max(50) }),
  z.object({ kind: z.literal("addLanguages"), languages: z.array(z.object({ name: text, level: z.enum(LanguageLevel) })).min(1).max(20) }),
  z.object({ kind: z.literal("addInterests"), names: z.array(text).min(1).max(MAX_INTERESTS) }),
  z.object({ kind: z.literal("addFacts"), texts: z.array(text).min(1).max(MAX_FACTS) }),
  z.object({ kind: z.literal("setBasics"), basics: z.partialRecord(basicsKeys, text) }),
]);
export type ProfileChange = z.infer<typeof profileChangeSchema>;
/** A change as written, before the defaults of an added entry are filled in. */
export type ProfileChangeInput = z.input<typeof profileChangeSchema>;

type Entries = { experience: ExperienceItem; projects: ProjectItem; education: EducationItem; courses: CourseItem };
type AddChange = Extract<ProfileChange, { kind: "add" }>;
type EditChange = Extract<ProfileChange, { kind: "edit" }>;

/** The longest each text may be, as the profile editor's actions allow. */
const LIMITS: Record<string, number> = {
  role: 200, company: 200, location: 200, name: 200, link: 500, degree: 200, school: 200, notes: 5000, provider: 200, duration: 100,
  headline: 300, summary: 5000, city: 120, country: 120,
};
const MAX_BULLETS = 10_000;
const MAX_SKILL = 100;
const MAX_INTEREST = 100;
const MAX_FACT = 1000;

/** What a section calls one entry, for reasons and cards. */
const NOUN: Record<ChangeSection, string> = { experience: "role", projects: "project", education: "degree", courses: "course" };

export type RefusedChange = { change: ProfileChange; reason: string };

/**
 * The changes that can apply to this profile, tidied, and the rest with a
 * reason the user can read. An added entry that's already in the profile
 * (matched as import matches it) becomes an edit of it; skills, languages and
 * interests the profile has are left out, and a change left with nothing to
 * do goes. Nothing here touches the database.
 */
export function checkProfileChanges(profile: ProfileData, changes: readonly ProfileChange[]): { changes: ProfileChange[]; refused: RefusedChange[] } {
  const kept: ProfileChange[] = [];
  const refused: RefusedChange[] = [];
  // What the profile has, and what earlier changes in this batch add, so nothing is added twice.
  const skills = profile.skills.map((skill) => skill.name);
  const languages: { code?: string | null; name: string; level: LanguageLevel }[] = [...profile.languages];
  const interests = [...profile.interests];
  const facts = profile.facts.map((fact) => fact.text);
  for (const [index, raw] of changes.entries()) {
    const refuse = (reason: string) => refused.push({ change: raw, reason });
    if (index >= MAX_CHANGES) {
      refuse(`That's more than ${MAX_CHANGES} changes at once. Send the rest separately.`);
      continue;
    }
    const change = tidy(raw);
    const problem = textProblem(change);
    if (problem) {
      refuse(problem);
      continue;
    }

    if (change.kind === "add") {
      const missing = requiredMissing(change);
      if (missing) {
        refuse(missing);
        continue;
      }
      const datesProblem = spanProblem(change.entry);
      if (datesProblem) {
        refuse(datesProblem);
        continue;
      }
      const twin = findTwin(profile, change);
      if (!twin) {
        kept.push(withKnownSkills(profile, change));
        continue;
      }
      const edit = editFromTwin(change, twin);
      const result = checkEdit(profile, edit);
      if (typeof result === "string") continue; // Already there as it is: nothing to add.
      kept.push(result);
      continue;
    }

    if (change.kind === "edit") {
      const result = checkEdit(profile, change);
      if (typeof result === "string") refuse(result);
      else kept.push(result);
      continue;
    }

    if (change.kind === "addBullets") {
      const entry = findEntry(profile, change.section, change.id);
      if (!entry) {
        refuse(`That ${NOUN[change.section]} isn't in your profile any more.`);
        continue;
      }
      const known = new Set(splitLines(entry.bullets).map(lineKey));
      const bullets = distinct(change.bullets).filter((line) => !known.has(lineKey(line)));
      if (bullets.length > 0) kept.push({ ...change, bullets });
      continue;
    }

    if (change.kind === "addSkills") {
      const names = distinct(change.names).filter((name) => !skills.some((known) => sameName(known, name)));
      skills.push(...names);
      if (names.length > 0) kept.push({ ...change, names });
      continue;
    }

    if (change.kind === "addLanguages") {
      const added = change.languages.filter(
        (language, at) =>
          language.name &&
          !change.languages.slice(0, at).some((earlier) => sameName(earlier.name, language.name)) &&
          !languages.some((known) => isSpokenLanguage(known, language.name) && known.level === language.level),
      );
      languages.push(...added);
      if (added.length > 0) kept.push({ ...change, languages: added });
      continue;
    }

    if (change.kind === "addInterests") {
      const names = distinct(change.names).filter((name) => !interests.some((known) => sameName(known, name)));
      if (names.length === 0) continue;
      if (interests.length + names.length > MAX_INTERESTS) {
        refuse(`Your profile keeps up to ${MAX_INTERESTS} interests. Remove some first.`);
        continue;
      }
      interests.push(...names);
      kept.push({ ...change, names });
      continue;
    }

    if (change.kind === "addFacts") {
      const texts = distinct(change.texts).filter((fact) => !facts.some((known) => sameName(known, fact)));
      if (texts.length === 0) continue;
      if (facts.length + texts.length > MAX_FACTS) {
        refuse(`That's ${MAX_FACTS} facts already. Remove one you no longer need first.`);
        continue;
      }
      facts.push(...texts);
      kept.push({ ...change, texts });
      continue;
    }

    const basics = Object.fromEntries(Object.entries(change.basics).filter(([key, value]) => value !== profile.basics[key as keyof typeof change.basics]));
    if (Object.keys(basics).length > 0) kept.push({ ...change, basics });
  }
  return { changes: kept, refused };
}

/** An edit as it will apply, or why it can't. */
function checkEdit(profile: ProfileData, change: EditChange): EditChange | string {
  const entry = findEntry(profile, change.section, change.id);
  if (!entry) return `That ${NOUN[change.section]} isn't in your profile any more.`;
  const after = { ...entry, ...change.entry } as Record<string, unknown>;
  const datesProblem = spanProblem(after as DateFields);
  if (datesProblem) return datesProblem;
  if (requiredMissing({ kind: "add", section: change.section, entry: after } as AddChange)) return `A ${NOUN[change.section]} can't be left without a name.`;

  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(change.entry)) {
    if (key === "skills") {
      const linked = new Set((entry as { skillIds?: string[] }).skillIds ?? []);
      const names = distinct(value as string[]).filter((name) => {
        const known = profile.skills.find((skill) => sameName(skill.name, name));
        return !known || !linked.has(known.id);
      });
      if (names.length > 0) fields.skills = names;
    } else if (key === "bullets") {
      const bullets = distinct(value as string[]);
      if (bullets.join("\n") !== splitLines((entry as { bullets: string }).bullets).join("\n")) fields.bullets = bullets;
    } else if (value !== (entry as Record<string, unknown>)[key]) {
      fields[key] = value;
    }
  }
  if (Object.keys(fields).length === 0) return "Your profile already says that.";
  return { ...change, entry: fields } as EditChange;
}

/** The entry an added one repeats, matched as a resume import matches it. */
function findTwin(profile: ProfileData, change: AddChange): Entries[ChangeSection] | undefined {
  switch (change.section) {
    case "experience":
      return profile.experience.find((entry) => !entry.careerBreak && sameName(entry.role, change.entry.role) && sameName(entry.company, change.entry.company));
    case "projects":
      return profile.projects.find((entry) => sameName(entry.name, change.entry.name));
    case "education":
      return profile.education.find((entry) => sameName(entry.degree, change.entry.degree) && sameName(entry.school, change.entry.school));
    case "courses":
      return profile.courses.find((entry) => sameName(entry.name, change.entry.name) && sameName(entry.provider, change.entry.provider));
  }
}

/** An added entry that's already there, as an edit filling in what it says: empty text and missing dates keep the profile's. */
function editFromTwin(change: AddChange, twin: Entries[ChangeSection]): EditChange {
  const entry: Record<string, unknown> = {};
  const hasDates = change.entry.startYear !== null;
  for (const [key, value] of Object.entries(change.entry)) {
    if (["startYear", "startMonth", "endYear", "endMonth", "current"].includes(key)) {
      if (hasDates) entry[key] = value;
    } else if (key === "bullets") {
      const own = splitLines((twin as { bullets: string }).bullets);
      const known = new Set(own.map(lineKey));
      const added = (value as string[]).filter((line) => !known.has(lineKey(line)));
      if (added.length > 0) entry.bullets = [...own, ...added];
    } else if (key === "skills") {
      if ((value as string[]).length > 0) entry.skills = value;
    } else if (typeof value === "string" && value !== "") {
      entry[key] = value;
    }
  }
  return { kind: "edit", section: change.section, id: twin.id, entry } as EditChange;
}

/** An added role or project links its skills by the profile's spelling ("figma" is the profile's "Figma"). */
function withKnownSkills(profile: ProfileData, change: AddChange): AddChange {
  if (change.section !== "experience" && change.section !== "projects") return change;
  const skills = distinct(change.entry.skills.map((name) => profile.skills.find((skill) => sameName(skill.name, name))?.name ?? name));
  return { ...change, entry: { ...change.entry, skills } } as AddChange;
}

/** Trimmed text, bullets without list marks, and no blank lines or names. */
function tidy(change: ProfileChange): ProfileChange {
  const clean = (value: unknown): unknown =>
    typeof value === "string"
      ? value.trim()
      : Array.isArray(value)
        ? value.map((item) => (typeof item === "string" ? item.trim().replace(/^[-*•·]\s+/, "") : clean(item))).filter((item) => item !== "")
        : value && typeof value === "object"
          ? Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, clean(inner)]))
          : value;
  return clean(change) as ProfileChange;
}

/** A text that's longer than the profile takes, in words the user can act on. */
function textProblem(change: ProfileChange): string | null {
  const tooLong = (value: string, max: number) => value.length > max;
  if (change.kind === "add" || change.kind === "edit") {
    for (const [key, value] of Object.entries(change.entry)) {
      if (typeof value === "string" && LIMITS[key] && tooLong(value, LIMITS[key])) return `The ${key} is longer than your profile takes (${LIMITS[key]} characters).`;
      if (key === "bullets" && Array.isArray(value) && tooLong(value.join("\n"), MAX_BULLETS)) return "Those points are longer than your profile takes.";
      if (key === "skills" && Array.isArray(value) && value.some((name) => tooLong(String(name), MAX_SKILL))) return "A skill's name is too long.";
    }
  }
  if (change.kind === "addBullets" && tooLong(change.bullets.join("\n"), MAX_BULLETS)) return "Those points are longer than your profile takes.";
  if (change.kind === "addSkills" && change.names.some((name) => tooLong(name, MAX_SKILL))) return "A skill's name is too long.";
  if (change.kind === "addLanguages" && change.languages.some((language) => tooLong(language.name, MAX_SKILL))) return "A language's name is too long.";
  if (change.kind === "addInterests" && change.names.some((name) => tooLong(name, MAX_INTEREST))) return "An interest is too long. Keep each to a few words.";
  if (change.kind === "addFacts" && change.texts.some((fact) => tooLong(fact, MAX_FACT))) return `A fact is longer than ${MAX_FACT} characters. Split it up.`;
  if (change.kind === "setBasics") {
    for (const [key, value] of Object.entries(change.basics)) if (tooLong(value, LIMITS[key])) return `The ${key} is longer than your profile takes (${LIMITS[key]} characters).`;
  }
  return null;
}

/** Why an added entry can't be saved without more, or null. */
function requiredMissing(change: AddChange): string | null {
  const { entry } = change;
  switch (change.section) {
    case "experience":
      return "role" in entry && (entry.role || entry.company) ? null : "A role needs a job title or a company.";
    case "projects":
      return "name" in entry && entry.name ? null : "A project needs a name.";
    case "education":
      return "degree" in entry && (entry.degree || entry.school) ? null : "A degree needs a name or a school.";
    case "courses":
      return "name" in entry && entry.name ? null : "A course or certificate needs a name.";
  }
}

type DateFields = { startYear: number | null; startMonth: number | null; endYear: number | null; endMonth: number | null; current?: boolean };

/** Why these dates can't be right, or null. */
function spanProblem(span: DateFields): string | null {
  const years = [span.startYear, span.endYear].filter((value): value is number => value !== null);
  if (years.some((value) => value < 1900 || value > 2100)) return "One of the years doesn't look right.";
  const months = [span.startMonth, span.endMonth].filter((value): value is number => value !== null);
  if (months.some((value) => value < 1 || value > 12)) return "One of the months doesn't look right.";
  if ((span.startMonth !== null && span.startYear === null) || (span.endMonth !== null && span.endYear === null)) return "A month needs its year.";
  if (span.current && span.endYear !== null) return "It can't both be ongoing and have an end date.";
  if (span.startYear !== null && span.endYear !== null) {
    const start = span.startYear * 12 + (span.startMonth ?? 1);
    const end = span.endYear * 12 + (span.endMonth ?? 12);
    if (end < start) return "It ends before it starts.";
  }
  return null;
}

export function findEntry<S extends ChangeSection>(profile: ProfileData, section: S, entryId: string): Entries[S] | undefined {
  return (profile[section] as unknown as readonly Entries[S][]).find((entry) => entry.id === entryId);
}

const splitLines = (value: string) => value.split("\n").map((line) => line.trim()).filter(Boolean);
const lineKey = (line: string) => line.trim().replace(/\s+/g, " ").toLowerCase();
/** Each once, ignoring case and spacing, in order. */
const distinct = (values: string[]) => values.filter((value, at) => value !== "" && !values.slice(0, at).some((earlier) => lineKey(earlier) === lineKey(value)));

// ─── Showing a change ────────────────────────────────────────────────────────

/** A change in words, for its card in the chat and for the connector's answer. */
export type ChangeView = {
  /** "Add a course", "Change a role" */
  action: string;
  /** What it's about: "AWS Solutions Architect · Amazon Web Services" */
  title: string;
  /** What it says, one line each: dates, points, "Dates: Mar 2021 – May 2024 → Mar 2021 – Jun 2024". */
  details: string[];
  /** The profile section it lands in, for a link. */
  section: "basics" | "skills" | ChangeSection | "facts";
};

const ADD_ACTION: Record<ChangeSection, string> = { experience: "Add a role", projects: "Add a project", education: "Add a degree", courses: "Add a course or certificate" };
const EDIT_ACTION: Record<ChangeSection, string> = { experience: "Change a role", projects: "Change a project", education: "Change a degree", courses: "Change a course" };
/** What each field is called on screen. */
export const FIELD_LABEL: Record<string, string> = {
  role: "Title", company: "Company", location: "Location", name: "Name", link: "Link", degree: "Degree", school: "School", notes: "Notes",
  provider: "Provided by", duration: "Length", headline: "Headline", summary: "Summary", city: "City", country: "Country",
  bullets: "Points", skills: "Skills", names: "Names", texts: "Facts", startYear: "Start year", startMonth: "Start month", endYear: "End year", endMonth: "End month", current: "Ongoing",
};

function titleOf(section: ChangeSection, entry: Record<string, unknown>): string {
  const parts =
    section === "experience" ? [entry.role, entry.company] : section === "projects" ? [entry.name] : section === "education" ? [entry.degree, entry.school] : [entry.name, entry.provider];
  return parts.filter((part) => typeof part === "string" && part.trim()).join(" · ");
}

function datesOf(entry: Partial<DateFields>): string {
  return formatDateRange({ startYear: entry.startYear ?? null, startMonth: entry.startMonth ?? null, endYear: entry.endYear ?? null, endMonth: entry.endMonth ?? null, current: entry.current ?? false });
}

export function describeChange(profile: ProfileData, change: ProfileChange): ChangeView {
  switch (change.kind) {
    case "add": {
      const entry = change.entry as Record<string, unknown> & Partial<DateFields>;
      const details = [
        datesOf(entry),
        typeof entry.location === "string" ? entry.location : "",
        typeof entry.duration === "string" && entry.duration ? `Length: ${entry.duration}` : "",
        typeof entry.notes === "string" ? entry.notes : "",
        typeof entry.link === "string" ? entry.link : "",
        ...(Array.isArray(entry.bullets) ? (entry.bullets as string[]).map((line) => `• ${line}`) : []),
        Array.isArray(entry.skills) && entry.skills.length > 0 ? `Skills: ${(entry.skills as string[]).join(", ")}` : "",
      ].filter(Boolean);
      return { action: ADD_ACTION[change.section], title: titleOf(change.section, entry), details, section: change.section };
    }
    case "edit": {
      const before = (findEntry(profile, change.section, change.id) ?? {}) as Record<string, unknown> & Partial<DateFields>;
      const after = { ...before, ...change.entry } as Record<string, unknown> & Partial<DateFields>;
      const details: string[] = [];
      if (["startYear", "startMonth", "endYear", "endMonth", "current"].some((key) => key in change.entry)) {
        details.push(`Dates: ${datesOf(before) || "none"} → ${datesOf(after) || "none"}`);
      }
      for (const [key, value] of Object.entries(change.entry)) {
        if (typeof value === "string" && FIELD_LABEL[key]) details.push(`${FIELD_LABEL[key]}: ${String(before[key] ?? "") || "empty"} → ${String(value) || "empty"}`);
      }
      if ("bullets" in change.entry && change.entry.bullets) details.push("Points:", ...change.entry.bullets.map((line) => `• ${line}`));
      if ("skills" in change.entry && change.entry.skills?.length) details.push(`Add skills: ${change.entry.skills.join(", ")}`);
      return { action: EDIT_ACTION[change.section], title: titleOf(change.section, before), details, section: change.section };
    }
    case "addBullets": {
      const entry = findEntry(profile, change.section, change.id) as Record<string, unknown> | undefined;
      return {
        action: change.section === "experience" ? "Add to a role" : "Add to a project",
        title: entry ? titleOf(change.section, entry) : "",
        details: change.bullets.map((line) => `• ${line}`),
        section: change.section,
      };
    }
    case "addSkills":
      return { action: change.names.length === 1 ? "Add a skill" : "Add skills", title: change.names.join(", "), details: [], section: "skills" };
    case "addLanguages":
      return {
        action: change.languages.length === 1 ? "Add a language" : "Add languages",
        title: change.languages.map((language) => `${language.name} (${languageLevelLabel(language.level)})`).join(", "),
        details: [],
        section: "skills",
      };
    case "addInterests":
      return { action: change.names.length === 1 ? "Add an interest" : "Add interests", title: change.names.join(", "), details: [], section: "skills" };
    case "addFacts":
      return { action: change.texts.length === 1 ? "Add a fact about you" : "Add facts about you", title: "", details: change.texts, section: "facts" };
    case "setBasics":
      return {
        action: "Change your basics",
        title: "",
        details: Object.entries(change.basics).map(([key, value]) => `${FIELD_LABEL[key]}: ${profile.basics[key as keyof typeof change.basics] || "empty"} → ${value || "empty"}`),
        section: "basics",
      };
  }
}

/** Fields that hold names, which the fact guard checks word by word. */
const NAME_FIELDS = new Set(["role", "company", "location", "name", "link", "degree", "school", "provider", "duration", "headline", "city", "country"]);

/**
 * The words a change would put in the profile, for the fact guard. Its names
 * go in one sentence after a lowercase word: the guard takes a capital that
 * starts a line for grammar, but a company on its own is a name all the same.
 * Points, notes and facts are sentences, one per line. Skills are names the
 * user gave, and months were said as words ("March"), so neither is checked.
 */
export function changeText(change: ProfileChange): string {
  const fields = (entry: Record<string, unknown>) => {
    const names: string[] = [];
    const sentences: string[] = [];
    for (const [key, value] of Object.entries(entry)) {
      if (key === "skills" || key.endsWith("Month")) continue;
      if (typeof value === "number") names.push(String(value));
      else if (typeof value === "string" && value) (NAME_FIELDS.has(key) ? names : sentences).push(value);
      else if (Array.isArray(value)) sentences.push(...value.map(String));
    }
    return [names.length > 0 ? `with ${names.join(", ")}` : "", ...sentences].filter(Boolean).join("\n");
  };
  switch (change.kind) {
    case "add":
    case "edit":
      return fields(change.entry);
    case "addBullets":
      return change.bullets.join("\n");
    case "addFacts":
      return change.texts.join("\n");
    case "setBasics":
      return fields(change.basics);
    default:
      return "";
  }
}

/** "section:id" of the entry an edit or addBullets changes, to notice a save since the proposal; null for the rest. */
export function changedEntryKey(change: ProfileChange): string | null {
  return change.kind === "edit" || change.kind === "addBullets" ? `${change.section}:${change.id}` : null;
}

// ─── Undo ────────────────────────────────────────────────────────────────────

/** What applying changes did, to take it back (newest first), and only where nothing changed since. */
export const undoStepSchema = z.union([
  /** An added entry; `version` is its updatedAt when added. */
  z.object({ kind: z.literal("removeEntry"), section: z.enum(CHANGE_SECTIONS), id, version: z.string() }),
  /** An edited entry's earlier fields, and the skill links the edit added. */
  z.object({
    kind: z.literal("restoreEntry"),
    section: z.enum(CHANGE_SECTIONS),
    id,
    version: z.string(),
    before: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
    linkedSkillIds: z.array(id),
  }),
  /** Skills it created; each goes only while nothing else links to it. */
  z.object({ kind: z.literal("removeSkills"), ids: z.array(id) }),
  z.object({ kind: z.literal("removeLanguages"), ids: z.array(id) }),
  z.object({ kind: z.literal("languageLevels"), levels: z.array(z.object({ id, level: z.enum(LanguageLevel) })) }),
  z.object({ kind: z.literal("removeInterests"), names: z.array(z.string()) }),
  z.object({ kind: z.literal("removeFacts"), ids: z.array(id) }),
  z.object({ kind: z.literal("restoreBasics"), before: z.partialRecord(basicsKeys, z.string()) }),
]);
export type UndoStep = z.infer<typeof undoStepSchema>;
