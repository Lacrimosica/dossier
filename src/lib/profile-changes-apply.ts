import "server-only";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { findSpokenLanguage } from "@/lib/language-data";
import { spokenLanguage } from "@/lib/languages";
import { INTERESTS_KEY, interestsFromValue, sameName } from "@/lib/profile";
import { changedEntryKey, type ChangeSection, type ProfileChange, type UndoStep } from "@/lib/profile-changes";
import { sorter } from "@/lib/profile-import-apply";
import { settingsFromRows } from "@/lib/settings";

type Tx = Prisma.TransactionClient;

/** What applying did: the changes that landed, those left alone because their entry was saved since, and how to take it back. */
export type AppliedChanges = { applied: ProfileChange[]; stale: ProfileChange[]; undo: UndoStep[] };

const SORT_SECTION = { experience: "experience", projects: "project", education: "education", courses: "course" } as const;
const ORDER_SETTING = { experience: "experienceOrder", projects: "projectOrder", education: "educationOrder", courses: "courseOrder" } as const;
const DATE_KEYS = ["startYear", "startMonth", "endYear", "endMonth", "current"];

/**
 * Applies checked changes (checkProfileChanges) in one transaction
 * (.scratch/profile-chat). An added entry lands where an imported one would:
 * first in a section ordered by hand, else by date. An edit or new points for
 * an entry saved after `versions` were taken (by "section:id") are left alone
 * and reported; pass null when the changes were made against the profile as
 * it is now (the connector).
 */
export async function applyProfileChanges(db: PrismaClient, changes: readonly ProfileChange[], versions: Record<string, string> | null): Promise<AppliedChanges> {
  return db.$transaction(
    async (tx) => {
      const result: AppliedChanges = { applied: [], stale: [], undo: [] };
      const createdSkills: string[] = [];
      const order = settingsFromRows(await tx.setting.findMany({ where: { key: { in: Object.values(ORDER_SETTING) } } }));
      const sorters = new Map<ChangeSection, () => number>();
      const nextSort = async (section: ChangeSection) => {
        if (!sorters.has(section)) sorters.set(section, await sorter(tx, SORT_SECTION[section], order[ORDER_SETTING[section]] === "manual"));
        return sorters.get(section)!();
      };

      for (const change of changes) {
        const key = changedEntryKey(change);
        if (key && versions) {
          const [section, entryId] = key.split(":") as [ChangeSection, string];
          const row = await readEntry(tx, section, entryId);
          if (!row || row.updatedAt.toISOString() !== versions[key]) {
            result.stale.push(change);
            continue;
          }
        }
        const steps = await applyOne(tx, change, nextSort, createdSkills);
        if (!steps) {
          result.stale.push(change);
          continue;
        }
        result.applied.push(change);
        result.undo.push(...steps);
      }
      // First, so undo (newest first) gets to it last, once the entries linking these skills are gone.
      if (createdSkills.length > 0) result.undo.unshift({ kind: "removeSkills", ids: createdSkills });
      return result;
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}

/** Applies one change; null when its entry is gone. */
async function applyOne(tx: Tx, change: ProfileChange, nextSort: (section: ChangeSection) => Promise<number>, createdSkills: string[]): Promise<UndoStep[] | null> {
  switch (change.kind) {
    case "add": {
      const sort = await nextSort(change.section);
      const { section } = change;
      let created: { id: string; updatedAt: Date };
      if (change.section === "experience" || change.section === "projects") {
        const { skills, bullets, ...fields } = change.entry;
        const skillIds = await skillIdsFor(tx, skills, createdSkills);
        const data = { ...fields, bullets: bullets.join("\n"), sort, skills: { create: skillIds.map((skillId) => ({ skillId })) } };
        created =
          change.section === "experience"
            ? await tx.experience.create({ data: data as Prisma.ExperienceCreateInput })
            : await tx.project.create({ data: data as Prisma.ProjectCreateInput });
      } else if (change.section === "education") {
        created = await tx.education.create({ data: { ...change.entry, sort } });
      } else {
        created = await tx.course.create({ data: { ...change.entry, sort } });
      }
      return [{ kind: "removeEntry", section, id: created.id, version: created.updatedAt.toISOString() }];
    }

    case "edit":
    case "addBullets": {
      const row = await readEntry(tx, change.section, change.id);
      if (!row) return null;
      const fields: Record<string, unknown> =
        change.kind === "addBullets" ? { bullets: [...String(row.bullets ?? "").split("\n").filter((line) => line.trim()), ...change.bullets] } : { ...change.entry };
      const skills = Array.isArray(fields.skills) ? (fields.skills as string[]) : [];
      delete fields.skills;
      if (Array.isArray(fields.bullets)) fields.bullets = (fields.bullets as string[]).join("\n");
      // An edit to any date sets them all, so the span stays as it was checked.
      if (DATE_KEYS.some((key) => key in fields)) for (const key of DATE_KEYS) if (key in row && !(key in fields)) fields[key] = row[key];
      const before = Object.fromEntries(Object.keys(fields).map((key) => [key, row[key] as string | number | boolean | null]));
      const linked = new Set(row.skillIds);
      const linkedSkillIds = (await skillIdsFor(tx, skills, createdSkills)).filter((skillId) => !linked.has(skillId));
      const updated = await updateEntry(tx, change.section, change.id, fields, linkedSkillIds);
      return [{ kind: "restoreEntry", section: change.section, id: change.id, version: updated.updatedAt.toISOString(), before, linkedSkillIds }];
    }

    case "addSkills":
      await skillIdsFor(tx, change.names, createdSkills);
      return [];

    case "addLanguages": {
      const added: string[] = [];
      const levels: { id: string; level: (typeof change.languages)[number]["level"] }[] = [];
      let sort = ((await tx.language.aggregate({ _max: { sort: true } }))._max.sort ?? -1) + 1;
      for (const { name, level } of change.languages) {
        // "Italiano" is the `it` already there (.scratch/language-codes).
        const spoken = spokenLanguage(name);
        const existing = await findSpokenLanguage(tx, spoken);
        if (existing) {
          if (existing.level !== level) levels.push({ id: existing.id, level: existing.level });
          await tx.language.update({ where: { id: existing.id }, data: { ...spoken, level } });
        } else {
          added.push((await tx.language.create({ data: { ...spoken, level, sort: sort++ } })).id);
        }
      }
      return [
        ...(added.length > 0 ? [{ kind: "removeLanguages" as const, ids: added }] : []),
        ...(levels.length > 0 ? [{ kind: "languageLevels" as const, levels }] : []),
      ];
    }

    case "addInterests": {
      const row = await tx.profileField.findUnique({ where: { key: INTERESTS_KEY } });
      const known = interestsFromValue(row?.value);
      const added = change.names.filter((name) => !known.some((interest) => sameName(interest, name)));
      const value = interestsFromValue([...known, ...added].join("\n")).join("\n");
      await tx.profileField.upsert({ where: { key: INTERESTS_KEY }, create: { key: INTERESTS_KEY, value }, update: { value } });
      return added.length > 0 ? [{ kind: "removeInterests", names: added }] : [];
    }

    case "addFacts": {
      let sort = ((await tx.fact.aggregate({ _max: { sort: true } }))._max.sort ?? -1) + 1;
      const ids: string[] = [];
      for (const text of change.texts) ids.push((await tx.fact.create({ data: { applicationId: null, text, sort: sort++ }, select: { id: true } })).id);
      return [{ kind: "removeFacts", ids }];
    }

    case "setBasics": {
      const rows = await tx.profileField.findMany({ where: { key: { in: Object.keys(change.basics) } } });
      const before = Object.fromEntries(Object.keys(change.basics).map((key) => [key, rows.find((row) => row.key === key)?.value ?? ""]));
      await writeBasics(tx, change.basics);
      return [{ kind: "restoreBasics", before }];
    }
  }
}

/**
 * Takes back what applyProfileChanges did, newest first. An entry saved
 * since is left as it is, and counted; a skill it created goes only while
 * nothing links to it.
 */
export async function undoProfileChanges(db: PrismaClient, steps: readonly UndoStep[]): Promise<{ kept: number }> {
  return db.$transaction(
    async (tx) => {
      let kept = 0;
      for (const step of steps.toReversed()) {
        switch (step.kind) {
          case "removeEntry": {
            const where = { id: step.id, updatedAt: new Date(step.version) };
            const { count } = await deleteEntries(tx, step.section, where);
            if (count === 0 && (await readEntry(tx, step.section, step.id))) kept++;
            break;
          }
          case "restoreEntry": {
            const row = await readEntry(tx, step.section, step.id);
            if (!row) break;
            if (row.updatedAt.toISOString() !== step.version) {
              kept++;
              break;
            }
            await updateEntry(tx, step.section, step.id, step.before, []);
            if (step.section === "experience") await tx.experienceSkill.deleteMany({ where: { experienceId: step.id, skillId: { in: step.linkedSkillIds } } });
            if (step.section === "projects") await tx.projectSkill.deleteMany({ where: { projectId: step.id, skillId: { in: step.linkedSkillIds } } });
            break;
          }
          case "removeSkills":
            await tx.skill.deleteMany({ where: { id: { in: step.ids }, experiences: { none: {} }, projects: { none: {} } } });
            break;
          case "removeLanguages":
            await tx.language.deleteMany({ where: { id: { in: step.ids } } });
            break;
          case "languageLevels":
            for (const { id, level } of step.levels) await tx.language.updateMany({ where: { id }, data: { level } });
            break;
          case "removeInterests": {
            const row = await tx.profileField.findUnique({ where: { key: INTERESTS_KEY } });
            const value = interestsFromValue(row?.value)
              .filter((interest) => !step.names.some((name) => sameName(name, interest)))
              .join("\n");
            await (value
              ? tx.profileField.update({ where: { key: INTERESTS_KEY }, data: { value } })
              : tx.profileField.deleteMany({ where: { key: INTERESTS_KEY } }));
            break;
          }
          case "removeFacts":
            await tx.fact.deleteMany({ where: { id: { in: step.ids } } });
            break;
          case "restoreBasics":
            await writeBasics(tx, step.before);
            break;
        }
      }
      return { kept };
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}

/** Basics as ProfileField rows: an empty one is removed, as the editor does. */
async function writeBasics(tx: Tx, basics: Record<string, string | undefined>): Promise<void> {
  for (const [key, value] of Object.entries(basics)) {
    if (value) await tx.profileField.upsert({ where: { key }, create: { key, value }, update: { value } });
    else await tx.profileField.deleteMany({ where: { key } });
  }
}

/** Each skill's id, by name ignoring case, creating the new ones (noted in `created`). */
async function skillIdsFor(tx: Tx, names: readonly string[], created: string[]): Promise<string[]> {
  const ids: string[] = [];
  let sort: number | null = null;
  for (const name of names) {
    let skill = await tx.skill.findUnique({ where: { name } });
    if (!skill) {
      sort ??= ((await tx.skill.aggregate({ _max: { sort: true } }))._max.sort ?? -1) + 1;
      skill = await tx.skill.create({ data: { name, sort: sort++ } });
      created.push(skill.id);
    }
    if (!ids.includes(skill.id)) ids.push(skill.id);
  }
  return ids;
}

type EntryRow = Record<string, unknown> & { updatedAt: Date; skillIds: string[] };

async function readEntry(tx: Tx, section: ChangeSection, id: string): Promise<EntryRow | null> {
  const include = { skills: { select: { skillId: true } } } as const;
  const row =
    section === "experience"
      ? await tx.experience.findUnique({ where: { id }, include })
      : section === "projects"
        ? await tx.project.findUnique({ where: { id }, include })
        : section === "education"
          ? await tx.education.findUnique({ where: { id } })
          : await tx.course.findUnique({ where: { id } });
  if (!row) return null;
  return { ...row, skillIds: "skills" in row ? row.skills.map((link) => link.skillId) : [] };
}

async function updateEntry(tx: Tx, section: ChangeSection, id: string, data: Record<string, unknown>, skillIds: string[]): Promise<{ updatedAt: Date }> {
  const links = { create: skillIds.map((skillId) => ({ skillId })) };
  if (section === "experience") return tx.experience.update({ where: { id }, data: { ...data, skills: links } as Prisma.ExperienceUpdateInput });
  if (section === "projects") return tx.project.update({ where: { id }, data: { ...data, skills: links } as Prisma.ProjectUpdateInput });
  if (section === "education") return tx.education.update({ where: { id }, data: data as Prisma.EducationUpdateInput });
  return tx.course.update({ where: { id }, data: data as Prisma.CourseUpdateInput });
}

function deleteEntries(tx: Tx, section: ChangeSection, where: { id: string; updatedAt: Date }) {
  if (section === "experience") return tx.experience.deleteMany({ where });
  if (section === "projects") return tx.project.deleteMany({ where });
  if (section === "education") return tx.education.deleteMany({ where });
  return tx.course.deleteMany({ where });
}
