// The text of a tailored document's unit, as saved.

import type { Unit } from "./application-data";
import type { ProfileData } from "./profile";

/** Bullet characters a model may add even when asked not to, and people type out of habit. */
const BULLET = /^\s*(?:[-*•·]|\d+[.)])\s+/;

/** A role's or project's bullets are one per line, without bullet characters or empty lines. */
export function bulletLines(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(BULLET, "").trim())
    .filter(Boolean)
    .join("\n");
}

/** Whether a unit holds a role or a project, whose text is a list of bullets. */
export function isBulletUnit(unitId: string): boolean {
  return unitId.startsWith("experience:") || unitId.startsWith("project:");
}

/**
 * The skills under a role or project on a tailored resume: the unit's own,
 * or the profile entry's while it has none. Null for any other unit.
 */
export function unitSkills(unit: Pick<Unit, "id" | "skills">, profile: Pick<ProfileData, "experience" | "projects" | "skills">): string[] | null {
  if (!isBulletUnit(unit.id)) return null;
  if (unit.skills) return unit.skills;
  const entry = unit.id.startsWith("experience:")
    ? profile.experience.find((item) => `experience:${item.id}` === unit.id)
    : profile.projects.find((item) => `project:${item.id}` === unit.id);
  const names = new Map(profile.skills.map((skill) => [skill.id, skill.name]));
  return entry?.skillIds.flatMap((id) => names.get(id) ?? []) ?? [];
}

/** Skill names as written: trimmed, without empty ones, each once whatever its case. */
export function cleanSkills(names: readonly string[]): string[] {
  const seen = new Set<string>();
  return names.flatMap((name) => {
    const clean = name.trim();
    if (!clean || seen.has(clean.toLowerCase())) return [];
    seen.add(clean.toLowerCase());
    return [clean];
  });
}

/** Whether two skill lists are the same, in the same order. */
export const sameSkills = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((name, index) => name === b[index]);

/** Whether a unit holds a publication (#218): the user's citation, which the AI never rewrites. */
export function isPublicationUnit(unitId: string): boolean {
  return unitId.startsWith("publication:");
}

/** Whether a unit holds one of the courses & certificates tailoring kept. */
export function isCourseUnit(unitId: string): boolean {
  return unitId.startsWith("course:");
}

/** What a tailored resume calls its parts for the entries that have them. */
export const roleUnitLabel = (entry: { company: string; role: string }) => `${entry.company || entry.role} role`;
export const projectUnitLabel = (entry: { name: string }) => `${entry.name || "Untitled"} project`;
export const educationUnitLabel = (entry: { degree: string; school: string }) => entry.degree || entry.school;

/** Text for a unit as written in the editor: a role's or project's bullets cleaned up, anything else trimmed. */
export function cleanUnitText(unitId: string, text: string): string {
  return isBulletUnit(unitId) ? bulletLines(text) : text.trim();
}

/**
 * How a unit is called in a sentence, after "the": "summary", "opening
 * paragraph", or a role's, project's, degree's, course's or publication's own name, e.g. "Northwind Logistics role".
 */
export function unitName(unit: { id: string; label: string }): string {
  const label = unit.label.trim();
  if (["experience:", "project:", "education:", "course:", "publication:"].some((prefix) => unit.id.startsWith(prefix))) return label || "entry";
  if (unit.id.startsWith("paragraph:")) {
    const name = label.toLowerCase() || "paragraph";
    return /\bparagraph$/.test(name) ? name : `${name} paragraph`;
  }
  return label.toLowerCase() || "part";
}

/**
 * What the chat calls the parts picked with Ask AI: `label` on its "About:"
 * chip, `name` after "the". One part is its own label; an employer's roles
 * together are "All 5 Northwind Logistics roles", "Northwind Logistics roles".
 */
export function targetName(units: { id: string; label: string }[]): { label: string; name: string } {
  if (units.length === 1) return { label: units[0].label, name: unitName(units[0]) };
  const labels = [...new Set(units.map((unit) => unit.label.trim()))];
  if (labels.length === 1 && / role$/.test(labels[0])) return { label: `All ${units.length} ${labels[0]}s`, name: `${labels[0]}s` };
  const listed = labels.length <= 1 ? labels.join("") : `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
  return { label: listed, name: listed };
}
