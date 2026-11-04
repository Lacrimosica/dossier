import type { Trimmed, Unit } from "@/lib/application-data";
import { publicationLabel } from "@/lib/citation";
import { languagesLine, type DocumentLabels } from "@/lib/document-labels";
import { spokenLanguageName } from "@/lib/languages";
import { resumeCourses, resumePublications, sameName, type ProfileData } from "@/lib/profile";
import { bulletLines, educationUnitLabel, projectUnitLabel, roleUnitLabel } from "@/lib/unit-text";

// What the profile has and a tailored resume doesn't. Document.trimmed only
// knows what the page limit or "Leave out" took off, so this is worked out by
// comparing the two each time: it also finds what tailoring passed over and
// what was added to the profile after the resume was written, without a date
// to compare or anything to keep up to date.

/** A whole part of the resume: a role, project, degree, course or publication. */
type OffResumeEntry = { kind: "entry"; key: string; name: string; unit: Unit };
/** One item of a part that's a single line of text: a skill, language or interest. */
type OffResumeLine = { kind: "line"; key: string; name: string; unitId: LineUnitId; text: string };
export type OffResumeItem = OffResumeEntry | OffResumeLine;

const LINE_UNITS = { skills: "Skills", languages: "Languages", interests: "Interests" } as const;
type LineUnitId = keyof typeof LINE_UNITS;

/** The parts of a resume in the order tailoring writes them, for a new part with nothing of its kind to sit by. */
const SECTIONS = ["headline", "summary", "experience:", "project:", "skills", "education:", "course:", "publication:", "languages", "interests"];
const sectionOf = (unitId: string) => SECTIONS.findIndex((section) => (section.endsWith(":") ? unitId.startsWith(section) : unitId === section));

/** The items of a line of text, however it was edited; a name with a comma in it stays whole too. */
function lineItems(text: string): string[] {
  const parts = text.split(/[·•|;\n]/);
  return [...parts, ...parts.flatMap((part) => part.split(","))].map((part) => part.trim()).filter(Boolean);
}

/**
 * What's in the profile but not on the resume, and not listed already in
 * `trimmed`: entries first, in the profile's order, then skills, languages
 * and interests. A section left out whole goes back whole, so its items aren't
 * offered one by one. Bullets added to a role that's on the resume can't be
 * told from the ones tailoring rewrote, so they aren't listed.
 */
export function offResume(profile: ProfileData, units: readonly Unit[], trimmed: Trimmed, labels: DocumentLabels): OffResumeItem[] {
  const leftOut = new Set(trimmed.flatMap((item) => (item.kind === "unit" ? [item.unit.id] : [])));
  const taken = (id: string) => leftOut.has(id) || units.some((unit) => unit.id === id);
  const entry = (name: string, unit: Unit): OffResumeItem[] => (taken(unit.id) ? [] : [{ kind: "entry", key: unit.id, name, unit }]);

  const lineOf = (unitId: LineUnitId, pieces: { key: string; name: string; present: string[]; text: string }[]): OffResumeItem[] => {
    if (leftOut.has(unitId)) return [];
    const items = lineItems(units.find((unit) => unit.id === unitId)?.text ?? "");
    return pieces.flatMap(({ key, name, present, text }) =>
      items.some((item) => present.some((known) => sameName(known, item))) ? [] : [{ kind: "line" as const, key, name, unitId, text }],
    );
  };
  // Languages are written "Dutch: Native", in the resume's language or as the profile has them.
  const languagesOn = lineItems(units.find((unit) => unit.id === "languages")?.text ?? "").map((item) => item.split(":")[0].trim());

  return [
    ...profile.experience.flatMap((role) =>
      entry(role.careerBreak ? role.role.trim() || labels.careerBreak : [role.role, role.company].map((part) => part.trim()).filter(Boolean).join(" at "), {
        id: `experience:${role.id}`,
        label: roleUnitLabel(role),
        text: bulletLines(role.bullets),
      }),
    ),
    ...profile.projects.flatMap((project) =>
      entry(project.name.trim() || "Untitled project", { id: `project:${project.id}`, label: projectUnitLabel(project), text: bulletLines(project.bullets) }),
    ),
    ...profile.education.flatMap((degree) =>
      entry([degree.degree, degree.school].map((part) => part.trim()).filter(Boolean).join(", "), {
        id: `education:${degree.id}`,
        label: educationUnitLabel(degree),
        text: degree.notes.trim(),
      }),
    ),
    ...resumeCourses(profile.courses).flatMap((course) =>
      entry(course.name.trim(), { id: `course:${course.id}`, label: course.name.trim(), text: course.notes.trim() }),
    ),
    ...resumePublications(profile.publications)
      .filter((publication) => publication.citation.trim())
      .flatMap((publication) => {
        const label = publicationLabel(publication.citation);
        return entry(label, { id: `publication:${publication.id}`, label, text: publication.citation.trim() });
      }),
    ...lineOf(
      "skills",
      profile.skills.map((skill) => ({ key: `skill:${skill.id}`, name: skill.name, present: [skill.name], text: skill.name })),
    ),
    ...(leftOut.has("languages")
      ? []
      : profile.languages.flatMap((language): OffResumeItem[] => {
          const spoken = spokenLanguageName(language, labels.locale);
          if (languagesOn.some((name) => sameName(name, spoken) || sameName(name, language.name))) return [];
          const text = languagesLine([language], labels);
          return [{ kind: "line", key: `language:${language.id}`, name: text, unitId: "languages", text }];
        })),
    ...lineOf(
      "interests",
      profile.interests.map((interest) => ({ key: `interest:${interest}`, name: interest, present: [interest], text: interest })),
    ),
  ];
}

/**
 * Where a new entry goes among the units. Roles stay within their experience
 * group, since a heading sits where its first role is and an added role
 * mustn't move it; courses go last among courses, which are kept by relevance
 * for the page limit to cut from the end.
 */
function placeOf(units: readonly Unit[], unitId: string, profile: ProfileData): number {
  const [prefix, id] = [unitId.slice(0, unitId.indexOf(":") + 1), unitId.slice(unitId.indexOf(":") + 1)];
  const inProfile = (entries: readonly { id: string }[]) => entries.map((entry) => `${prefix}${entry.id}`);
  const role = prefix === "experience:" ? profile.experience.find((entry) => entry.id === id) : undefined;
  const siblings =
    prefix === "experience:"
      ? inProfile(profile.experience.filter((entry) => entry.groupId === role?.groupId))
      : prefix === "project:"
        ? inProfile(profile.projects)
        : prefix === "education:"
          ? inProfile(profile.education)
          : prefix === "publication:"
            ? inProfile(profile.publications)
            : [];
  const at = siblings.indexOf(unitId);
  // Before the next one in the profile's order that's on the resume, or after the one before it.
  if (at >= 0) {
    const next = units.findIndex((unit) => siblings.indexOf(unit.id) > at);
    if (next >= 0) return next;
    const before = units.findLastIndex((unit) => siblings.includes(unit.id));
    if (before >= 0) return before + 1;
  }
  const section = sectionOf(unitId);
  return units.findLastIndex((unit) => sectionOf(unit.id) >= 0 && sectionOf(unit.id) <= section) + 1;
}

/** Puts the item on the resume, in `units`, and returns the id of the part that changed. */
export function addToResume(units: Unit[], item: OffResumeItem, profile: ProfileData): string {
  if (item.kind === "entry") {
    units.splice(placeOf(units, item.unit.id, profile), 0, item.unit);
    return item.unit.id;
  }
  const line = units.find((unit) => unit.id === item.unitId);
  if (line) line.text = line.text.trim() ? `${line.text.trim()} · ${item.text}` : item.text;
  else units.splice(placeOf(units, item.unitId, profile), 0, { id: item.unitId, label: LINE_UNITS[item.unitId], text: item.text });
  return item.unitId;
}
