"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import { GroupSection, JobStatus, LanguageLevel } from "@/generated/prisma/enums";
import { action, ActionError } from "@/lib/action";
import { companyKey } from "@/lib/companies";
import { findSpokenLanguage } from "@/lib/language-data";
import { LANGUAGE_CODES, languageName, spokenLanguage } from "@/lib/languages";
import { prisma } from "@/lib/prisma";
import { BIRTH_ON_RESUMES, fieldsFromBasics, inEntryOrder, INTERESTS_KEY, interestsFromValue } from "@/lib/profile";
import { findOrCreateSkill, firstSort, nextSort } from "@/lib/profile-entries";
import { isAiConfigured } from "@/lib/ai/config";
import { discardProfileImports, importProfileJob } from "@/lib/jobs/import-profile";
import { discardProfileChats, PROFILE_CHAT_KEY, profileChatJob } from "@/lib/jobs/profile-chat";
import { discardProfileReviews, reviewProfileJob, type ReviewProfileResult } from "@/lib/jobs/review-profile";
import { startJob } from "@/lib/jobs/runner";
import { isPhotoDataUrl, PHOTO_KEY, PHOTO_MAX_LENGTH, PHOTO_ON_RESUMES_KEY } from "@/lib/photo";
import { sourcesFor, unverifiedFacts } from "@/lib/ai/fact-guard";
import { changeText, checkProfileChanges, MAX_CHANGES, profileChangeSchema, undoStepSchema } from "@/lib/profile-changes";
import { applyProfileChanges, undoProfileChanges } from "@/lib/profile-changes-apply";
import { loadProfile, loadProfileName } from "@/lib/profile-data";
import { importCounts } from "@/lib/profile-import";
import { applyImportedProfile } from "@/lib/profile-import-apply";
import { MAX_FIXES } from "@/lib/profile-review";
import { settleProfileReview } from "@/lib/profile-review-apply";
import { loadSettings, saveSettings } from "@/lib/settings-data";

// Every profile change saves through these actions; they all check the
// session (action()) and validate their input.

const text = (max: number) => z.string().max(max);

/** Saves the Basics section (PRO-1, PRO-2); autosaved as you type. */
export const saveBasics = action(
  z.object({
    name: text(200),
    headline: text(300),
    email: text(320),
    phone: text(60),
    dob: z.union([z.literal(""), z.iso.date()]),
    website: text(500),
    address: text(300),
    city: text(120),
    country: text(120),
    linkedin: text(500),
    summary: text(5000),
    birthOnResumes: z.enum(BIRTH_ON_RESUMES),
  }),
  async (basics) => {
    const before = await loadProfileName();
    await prisma.$transaction(
      Object.entries(fieldsFromBasics(basics)).map(([key, value]) =>
        value === null
          ? prisma.profileField.deleteMany({ where: { key } })
          : prisma.profileField.upsert({ where: { key }, create: { key, value }, update: { value } }),
      ),
    );
    // The sidebar shows the name.
    if (before !== basics.name) revalidatePath("/", "layout");
    return null;
  },
);

// ─── Photo (#224) ────────────────────────────────────────────────────────────

/** "Show on resumes" is on unless its row says "false". */
const photoOnResumesRow = (onResumes: boolean) =>
  onResumes
    ? prisma.profileField.deleteMany({ where: { key: PHOTO_ON_RESUMES_KEY } })
    : prisma.profileField.upsert({
        where: { key: PHOTO_ON_RESUMES_KEY },
        create: { key: PHOTO_ON_RESUMES_KEY, value: "false" },
        update: { value: "false" },
      });

/** Saves the cropped photo, or puts a removed one back as it was (Undo). */
export const savePhoto = action(
  z.object({ src: z.string().max(PHOTO_MAX_LENGTH).refine(isPhotoDataUrl), onResumes: z.boolean() }),
  async ({ src, onResumes }) => {
    await prisma.$transaction([
      prisma.profileField.upsert({ where: { key: PHOTO_KEY }, create: { key: PHOTO_KEY, value: src }, update: { value: src } }),
      photoOnResumesRow(onResumes),
    ]);
    return null;
  },
);

/** The photo's "Show on resumes". */
export const setPhotoOnResumes = action(z.object({ onResumes: z.boolean() }), async ({ onResumes }) => {
  await photoOnResumesRow(onResumes);
  return null;
});

export const removePhoto = action(z.object({}), async () => {
  await prisma.profileField.deleteMany({ where: { key: { in: [PHOTO_KEY, PHOTO_ON_RESUMES_KEY] } } });
  return null;
});

const id = z.string().min(1);
const skillName = z.string().trim().min(1, "Type a skill first.").max(100);

/** Adds a skill (PRO-3). An existing one, in any case, is returned instead of a duplicate. */
export const addSkill = action(z.object({ name: skillName }), ({ name }) => findOrCreateSkill(name));

/** Removes a skill; the database also detaches it from every role (PRO-3). */
export const removeSkill = action(z.object({ id }), async ({ id }) => {
  await prisma.skill.deleteMany({ where: { id } });
  return null;
});

const level = z.enum(LanguageLevel);

/**
 * Adds a language with its level (PRO-4): the one picked from the list, or one
 * typed by name, which is stored by its code when it's known (.scratch/language-codes).
 * Adding one that exists, under any of its names, updates its level instead.
 */
export const addLanguage = action(
  z.object({
    name: z.string().trim().min(1, "Type a language first.").max(100),
    code: z.string().refine((code) => LANGUAGE_CODES.includes(code)).nullable().default(null),
    level,
  }),
  async ({ name, code, level }) => {
    const spoken = code ? { code, name: languageName(code) } : spokenLanguage(name);
    const existing = await findSpokenLanguage(prisma, spoken);
    const language = existing
      ? await prisma.language.update({ where: { id: existing.id }, data: { ...spoken, level } })
      : await prisma.language.create({ data: { ...spoken, level, sort: await nextSort(prisma.language) } });
    return { language: { id: language.id, code: language.code, name: language.name, level: language.level }, added: !existing };
  },
);

export const setLanguageLevel = action(z.object({ id, level }), async ({ id, level }) => {
  await prisma.language.updateMany({ where: { id }, data: { level } });
  return null;
});

export const removeLanguage = action(z.object({ id }), async ({ id }) => {
  await prisma.language.deleteMany({ where: { id } });
  return null;
});

/** Saves the interests in their order: the whole list, as each add or remove changes it. */
export const saveInterests = action(
  z.object({ interests: z.array(z.string().trim().max(100)).max(50) }),
  async ({ interests }) => {
    const kept = interestsFromValue(interests.join("\n"));
    const value = kept.join("\n");
    await (value
      ? prisma.profileField.upsert({ where: { key: INTERESTS_KEY }, create: { key: INTERESTS_KEY, value }, update: { value } })
      : prisma.profileField.deleteMany({ where: { key: INTERESTS_KEY } }));
    return { interests: kept };
  },
);

/**
 * The entries a name change reaches: this one, or with `everywhere` all with
 * the same name, case and spacing aside. None if it was removed in another tab.
 */
function idsToRename<T extends { id: string }>(entries: T[], name: (entry: T) => string, id: string, everywhere: boolean): string[] {
  const entry = entries.find((other) => other.id === id);
  const key = entry ? companyKey(name(entry)) : null;
  return entries.filter((other) => other.id === id || (everywhere && key !== null && companyKey(name(other)) === key)).map((other) => other.id);
}

// ─── Experience (PRO-5, PRO-6) ───────────────────────────────────────────────

const year = z.number().int().min(1900).max(2100).nullable();
const month = z.number().int().min(1).max(12).nullable();
const dateSpan = { startYear: year, startMonth: month, endYear: year, endMonth: month, current: z.boolean() };

const experienceFields = z.object({
  id,
  role: text(200),
  company: text(200),
  location: text(200),
  bullets: text(10_000),
  careerBreak: z.boolean(),
  ...dateSpan,
});

const experienceItem = (entry: {
  id: string;
  role: string;
  company: string;
  location: string;
  bullets: string;
  startYear: number | null;
  startMonth: number | null;
  endYear: number | null;
  endMonth: number | null;
  current: boolean;
  careerBreak: boolean;
  groupId: string | null;
}, skillIds: string[] = []) => ({
  id: entry.id,
  role: entry.role,
  company: entry.company,
  location: entry.location,
  bullets: entry.bullets,
  startYear: entry.startYear,
  startMonth: entry.startMonth,
  endYear: entry.endYear,
  endMonth: entry.endMonth,
  current: entry.current,
  skillIds,
  groupId: entry.groupId,
  careerBreak: entry.careerBreak,
});

/** An experience group's id, or null when it's gone (removed in another tab): the role goes under the section's own heading. */
async function experienceGroupId(groupId: string | null | undefined): Promise<string | null> {
  if (!groupId) return null;
  const group = await prisma.entryGroup.findFirst({ where: { id: groupId, section: GroupSection.EXPERIENCE }, select: { id: true } });
  return group?.id ?? null;
}

/**
 * "+ Add a role": a blank entry, last in date order (it has no dates yet), first in an order set by hand.
 * Added under a group's heading, it's in that group.
 */
export const createExperience = action(z.object({ groupId: id.nullish() }), async ({ groupId }) => {
  const manual = (await loadSettings()).experienceOrder === "manual";
  const sort = manual ? await firstSort(prisma.experience) : await nextSort(prisma.experience);
  return experienceItem(await prisma.experience.create({ data: { sort, groupId: await experienceGroupId(groupId) } }));
});

/**
 * Autosaves a role. Saving one that was just removed does nothing. The company
 * isn't autosaved: it's set with setExperienceCompany, so a debounced save
 * can't put back a name that was just changed on every role at the company.
 */
export const saveExperience = action(experienceFields.omit({ company: true }), async ({ id, ...data }) => {
  await prisma.experience.updateMany({ where: { id }, data });
  return null;
});

/** Removes a role and its skill links; the toast's Undo calls restoreExperience. */
export const removeExperience = action(z.object({ id }), async ({ id }) => {
  await prisma.experience.deleteMany({ where: { id } });
  return null;
});

/** Puts a removed role back, with the links to skills that still exist, in its group if that still exists. */
export const restoreExperience = action(
  experienceFields.extend({ skillIds: z.array(id), groupId: id.nullable() }),
  async ({ skillIds, groupId, ...entry }) => {
    const skills = await prisma.skill.findMany({ where: { id: { in: skillIds } }, select: { id: true } });
    const restored = await prisma.experience.upsert({
      where: { id: entry.id },
      create: {
        ...entry,
        groupId: await experienceGroupId(groupId),
        sort: await nextSort(prisma.experience),
        skills: { create: skills.map((skill) => ({ skillId: skill.id })) },
      },
      update: {},
    });
    return experienceItem(restored, skills.map((skill) => skill.id));
  },
);

/** Puts a role under a group's heading, or (null) under the section's own. */
export const setExperienceGroup = action(z.object({ id, groupId: id.nullable() }), async ({ id, groupId }) => {
  const group = await experienceGroupId(groupId);
  if (groupId && !group) throw new ActionError("That group was removed in the meantime. Reload the page and try again.");
  await prisma.experience.updateMany({ where: { id }, data: { groupId: group } });
  return null;
});

// ─── Experience groups (.scratch/experience-groups) ─────────────────────────

const groupName = text(200);
const groupItem = ({ id, name }: { id: string; name: string }) => ({ id, name });

/** The next `sort` among the experience groups, so a new or restored group goes last. */
async function nextGroupSort(db: Prisma.TransactionClient) {
  const { _max } = await db.entryGroup.aggregate({ where: { section: GroupSection.EXPERIENCE }, _max: { sort: true } });
  return (_max.sort ?? -1) + 1;
}

/** "+ Add a group": last of the groups, with the name typed. */
export const createExperienceGroup = action(z.object({ name: groupName }), async ({ name }) =>
  groupItem(
    await prisma.entryGroup.create({
      data: { section: GroupSection.EXPERIENCE, name, sort: await nextGroupSort(prisma) },
    }),
  ),
);

/** Autosaves a group's name; every resume's heading follows it. */
export const renameExperienceGroup = action(z.object({ id, name: groupName }), async ({ id, name }) => {
  await prisma.entryGroup.updateMany({ where: { id, section: GroupSection.EXPERIENCE }, data: { name } });
  return null;
});

/**
 * Removes a group; its roles stay, under the section's own heading. Answers
 * with those roles, so the toast's Undo can put them back in it.
 */
export const removeExperienceGroup = action(z.object({ id }), async ({ id }) =>
  prisma.$transaction(async (tx) => {
    const roles = await tx.experience.findMany({ where: { groupId: id }, select: { id: true } });
    await tx.entryGroup.deleteMany({ where: { id, section: GroupSection.EXPERIENCE } });
    return roles.map((role) => role.id);
  }),
);

/**
 * Undo for removeExperienceGroup: the group again, back at `index` among the
 * groups, with the roles that were in it and are still without one.
 */
export const restoreExperienceGroup = action(
  z.object({ id, name: groupName, roleIds: z.array(id), index: z.number().int().min(0) }),
  async ({ id, name, roleIds, index }) =>
    prisma.$transaction(async (tx) => {
      const group = await tx.entryGroup.upsert({
        where: { id },
        create: { id, section: GroupSection.EXPERIENCE, name, sort: await nextGroupSort(tx) },
        update: {},
      });
      const others = await tx.entryGroup.findMany({
        where: { section: GroupSection.EXPERIENCE, id: { not: id } },
        orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
        select: { id: true },
      });
      const order = others.map((other) => other.id).toSpliced(index, 0, id);
      for (const [sort, groupId] of order.entries()) await tx.entryGroup.update({ where: { id: groupId }, data: { sort } });
      const moved = await tx.experience.findMany({ where: { id: { in: roleIds }, groupId: null }, select: { id: true } });
      await tx.experience.updateMany({ where: { id: { in: moved.map((role) => role.id) } }, data: { groupId: group.id } });
      return { group: groupItem(group), roleIds: moved.map((role) => role.id) };
    }),
);

/** Saves the groups' order: `ids` is every experience group, in the new order. Base resumes follow it. */
export const reorderExperienceGroups = action(z.object({ ids: z.array(id) }), async ({ ids }) => {
  await prisma.$transaction(async (tx) => {
    const known = new Set((await tx.entryGroup.findMany({ where: { section: GroupSection.EXPERIENCE }, select: { id: true } })).map((group) => group.id));
    if (ids.length !== known.size || new Set(ids).size !== ids.length || !ids.every((groupId) => known.has(groupId))) {
      throw new ActionError("The list changed in the meantime. Reload the page and try again.");
    }
    for (const [sort, groupId] of ids.entries()) await tx.entryGroup.update({ where: { id: groupId }, data: { sort } });
  });
  return null;
});

/** Attaches a skill to a role, or detaches it (PRO-6). */
export const setExperienceSkill = action(
  z.object({ experienceId: id, skillId: id, attached: z.boolean() }),
  async ({ experienceId, skillId, attached }) => {
    if (attached) {
      await prisma.experienceSkill.createMany({ data: [{ experienceId, skillId }], skipDuplicates: true });
    } else {
      await prisma.experienceSkill.deleteMany({ where: { experienceId, skillId } });
    }
    return null;
  },
);

/** "New skill? Type it and press Enter": adds it to the profile if it's new and attaches it (PRO-6). */
export const attachNewSkill = action(
  z.object({ experienceId: id, name: skillName }),
  async ({ experienceId, name }) => {
    const result = await findOrCreateSkill(name);
    await prisma.experienceSkill.createMany({
      data: [{ experienceId, skillId: result.skill.id }],
      skipDuplicates: true,
    });
    return result;
  },
);

/**
 * "Use one name": gives every role at any of these spellings of a company the
 * name chosen, so they group as one company on resumes. Answers with the
 * roles renamed.
 */
export const unifyCompanyName = action(
  z.object({ names: z.array(text(200)).min(2), to: z.string().trim().min(1).max(200) }),
  async ({ names, to }) => {
    const keys = new Set(names.map(companyKey));
    const roles = await prisma.experience.findMany({ select: { id: true, company: true } });
    const ids = roles.filter((role) => keys.has(companyKey(role.company))).map((role) => role.id);
    await prisma.experience.updateMany({ where: { id: { in: ids } }, data: { company: to } });
    return ids;
  },
);

/**
 * Sets a role's company when its Company field is left. With `everywhere`, it
 * goes on every role at the same company (companyKey), so renaming a company
 * keeps its roles together. Answers with the roles renamed.
 */
export const setExperienceCompany = action(
  z.object({ id, company: text(200), everywhere: z.boolean() }),
  async ({ id, company, everywhere }) => {
    const roles = await prisma.experience.findMany({ select: { id: true, company: true } });
    const ids = idsToRename(roles, (role) => role.company, id, everywhere);
    await prisma.experience.updateMany({ where: { id: { in: ids } }, data: { company } });
    return ids;
  },
);

/** "They're different": these spellings aren't offered as one company again (companiesKeptApart). */
export const keepCompaniesApart = action(z.object({ fingerprint: z.string().min(1).max(2000) }), async ({ fingerprint }) => {
  const { companiesKeptApart } = await loadSettings();
  if (!companiesKeptApart.includes(fingerprint)) await saveSettings({ companiesKeptApart: [...companiesKeptApart, fingerprint] });
  return null;
});

// ─── Projects (PRO-13) ───────────────────────────────────────────────────────

const projectFields = z.object({
  id,
  name: text(200),
  link: text(500),
  bullets: text(10_000),
  ...dateSpan,
});

const projectItem = (entry: z.infer<typeof projectFields>, skillIds: string[] = []) => ({
  id: entry.id,
  name: entry.name,
  link: entry.link,
  bullets: entry.bullets,
  startYear: entry.startYear,
  startMonth: entry.startMonth,
  endYear: entry.endYear,
  endMonth: entry.endMonth,
  current: entry.current,
  skillIds,
});

/** "+ Add a project": a blank entry, placed like a new role. */
export const createProject = action(z.object({}), async () => {
  const manual = (await loadSettings()).projectOrder === "manual";
  const sort = manual ? await firstSort(prisma.project) : await nextSort(prisma.project);
  return projectItem(await prisma.project.create({ data: { sort } }));
});

/** Autosaves a project. Saving one that was just removed does nothing. */
export const saveProject = action(projectFields, async ({ id, ...data }) => {
  await prisma.project.updateMany({ where: { id }, data });
  return null;
});

/** Removes a project and its skill links; the toast's Undo calls restoreProject. */
export const removeProject = action(z.object({ id }), async ({ id }) => {
  await prisma.project.deleteMany({ where: { id } });
  return null;
});

/** Puts a removed project back, with the links to skills that still exist. */
export const restoreProject = action(projectFields.extend({ skillIds: z.array(id) }), async ({ skillIds, ...entry }) => {
  const skills = await prisma.skill.findMany({ where: { id: { in: skillIds } }, select: { id: true } });
  const restored = await prisma.project.upsert({
    where: { id: entry.id },
    create: {
      ...entry,
      sort: await nextSort(prisma.project),
      skills: { create: skills.map((skill) => ({ skillId: skill.id })) },
    },
    update: {},
  });
  return projectItem(restored, skills.map((skill) => skill.id));
});

/** Attaches a skill to a project, or detaches it. */
export const setProjectSkill = action(
  z.object({ projectId: id, skillId: id, attached: z.boolean() }),
  async ({ projectId, skillId, attached }) => {
    if (attached) {
      await prisma.projectSkill.createMany({ data: [{ projectId, skillId }], skipDuplicates: true });
    } else {
      await prisma.projectSkill.deleteMany({ where: { projectId, skillId } });
    }
    return null;
  },
);

/** "New skill? Type it and press Enter" on a project: adds it to the profile if it's new and attaches it. */
export const attachNewProjectSkill = action(z.object({ projectId: id, name: skillName }), async ({ projectId, name }) => {
  const result = await findOrCreateSkill(name);
  await prisma.projectSkill.createMany({ data: [{ projectId, skillId: result.skill.id }], skipDuplicates: true });
  return result;
});

// ─── Education (PRO-7) ───────────────────────────────────────────────────────

const educationFields = z.object({
  id,
  degree: text(200),
  school: text(200),
  location: text(200),
  notes: text(5000),
  ...dateSpan,
});

const educationItem = (entry: z.infer<typeof educationFields>) => ({
  id: entry.id,
  degree: entry.degree,
  school: entry.school,
  location: entry.location,
  notes: entry.notes,
  startYear: entry.startYear,
  startMonth: entry.startMonth,
  endYear: entry.endYear,
  endMonth: entry.endMonth,
  current: entry.current,
});

export const createEducation = action(z.object({}), async () => {
  const manual = (await loadSettings()).educationOrder === "manual";
  const sort = manual ? await firstSort(prisma.education) : await nextSort(prisma.education);
  return educationItem(await prisma.education.create({ data: { sort } }));
});

/** Autosaves an entry. The school is set with setEducationSchool, like a role's company (saveExperience). */
export const saveEducation = action(educationFields.omit({ school: true }), async ({ id, ...data }) => {
  await prisma.education.updateMany({ where: { id }, data });
  return null;
});

/** Sets an entry's school when its field is left; with `everywhere`, on every entry at that school. Answers with the entries changed. */
export const setEducationSchool = action(
  z.object({ id, school: text(200), everywhere: z.boolean() }),
  async ({ id, school, everywhere }) => {
    const entries = await prisma.education.findMany({ select: { id: true, school: true } });
    const ids = idsToRename(entries, (entry) => entry.school, id, everywhere);
    await prisma.education.updateMany({ where: { id: { in: ids } }, data: { school } });
    return ids;
  },
);

export const removeEducation = action(z.object({ id }), async ({ id }) => {
  await prisma.education.deleteMany({ where: { id } });
  return null;
});

export const restoreEducation = action(educationFields, async (entry) =>
  educationItem(
    await prisma.education.upsert({
      where: { id: entry.id },
      create: { ...entry, sort: await nextSort(prisma.education) },
      update: {},
    }),
  ),
);

/**
 * "Move to courses & certificates": the entry becomes a course with the same
 * name, school (as provider), dates and notes, in one go. Undo moves it back
 * with restoreEducation and removeCourse.
 */
export const moveEducationToCourses = action(z.object({ id }), async ({ id }) => {
  const manual = (await loadSettings()).courseOrder === "manual";
  return prisma.$transaction(async (tx) => {
    const entry = await tx.education.findUnique({ where: { id } });
    if (!entry) throw new ActionError("That entry is no longer there. Reload the page and try again.");
    const sort = manual ? await firstSort(tx.course) : await nextSort(tx.course);
    const course = await tx.course.create({
      data: {
        name: entry.degree,
        provider: entry.school,
        startYear: entry.startYear,
        startMonth: entry.startMonth,
        // Still under way: no end yet, as a course without "Present" has.
        endYear: entry.current ? null : entry.endYear,
        endMonth: entry.current ? null : entry.endMonth,
        notes: entry.notes,
        sort,
      },
    });
    await tx.education.delete({ where: { id } });
    return { education: educationItem(entry), course: courseItem(course) };
  });
});

// ─── Courses & certificates ──────────────────────────────────────────────────

const courseFields = z.object({
  id,
  name: text(200),
  provider: text(200),
  duration: text(100),
  link: text(500),
  notes: text(5000),
  onResumes: z.boolean(),
  startYear: year,
  startMonth: month,
  endYear: year,
  endMonth: month,
});

const courseItem = (entry: z.infer<typeof courseFields>) => ({
  id: entry.id,
  name: entry.name,
  provider: entry.provider,
  duration: entry.duration,
  link: entry.link,
  notes: entry.notes,
  onResumes: entry.onResumes,
  startYear: entry.startYear,
  startMonth: entry.startMonth,
  endYear: entry.endYear,
  endMonth: entry.endMonth,
});

/** "+ Add a course": a blank entry, placed like a new role. */
export const createCourse = action(z.object({}), async () => {
  const manual = (await loadSettings()).courseOrder === "manual";
  const sort = manual ? await firstSort(prisma.course) : await nextSort(prisma.course);
  return courseItem(await prisma.course.create({ data: { sort } }));
});

/**
 * Autosaves a course. Saving one that was just removed does nothing. The
 * provider is set with setCourseProvider, like a role's company (saveExperience).
 */
export const saveCourse = action(courseFields.omit({ provider: true }), async ({ id, ...data }) => {
  await prisma.course.updateMany({ where: { id }, data });
  return null;
});

/** Sets a course's provider when its field is left; with `everywhere`, on every course it ran. Answers with the courses changed. */
export const setCourseProvider = action(
  z.object({ id, provider: text(200), everywhere: z.boolean() }),
  async ({ id, provider, everywhere }) => {
    const courses = await prisma.course.findMany({ select: { id: true, provider: true } });
    const ids = idsToRename(courses, (course) => course.provider, id, everywhere);
    await prisma.course.updateMany({ where: { id: { in: ids } }, data: { provider } });
    return ids;
  },
);

export const removeCourse = action(z.object({ id }), async ({ id }) => {
  await prisma.course.deleteMany({ where: { id } });
  return null;
});

export const restoreCourse = action(courseFields, async (entry) =>
  courseItem(
    await prisma.course.upsert({
      where: { id: entry.id },
      create: { ...entry, sort: await nextSort(prisma.course) },
      update: {},
    }),
  ),
);

// ─── Publications (#218) ─────────────────────────────────────────────────────

const publicationFields = z.object({
  id,
  citation: text(3000),
  link: text(500),
  onResumes: z.boolean(),
});

const publicationItem = (entry: z.infer<typeof publicationFields>) => ({
  id: entry.id,
  citation: entry.citation,
  link: entry.link,
  onResumes: entry.onResumes,
});

/** "+ Add a publication": a blank entry at the top, where the newest usually goes. */
export const createPublication = action(z.object({}), async () =>
  publicationItem(await prisma.publication.create({ data: { sort: await firstSort(prisma.publication) } })),
);

/** Autosaves a publication. Saving one that was just removed does nothing. */
export const savePublication = action(publicationFields, async ({ id, ...data }) => {
  await prisma.publication.updateMany({ where: { id }, data });
  return null;
});

export const removePublication = action(z.object({ id }), async ({ id }) => {
  await prisma.publication.deleteMany({ where: { id } });
  return null;
});

/** Puts a removed publication back; the list then saves its place in the order. */
export const restorePublication = action(publicationFields, async (entry) =>
  publicationItem(
    await prisma.publication.upsert({
      where: { id: entry.id },
      create: { ...entry, sort: await nextSort(prisma.publication) },
      update: {},
    }),
  ),
);

/** Saves the publications' order: `ids` is every publication, in the new order. */
export const reorderPublications = action(z.object({ ids: z.array(id) }), async ({ ids }) => {
  await prisma.$transaction(async (tx) => {
    const known = new Set((await tx.publication.findMany({ select: { id: true } })).map((entry) => entry.id));
    if (ids.length !== known.size || new Set(ids).size !== ids.length || !ids.every((entryId) => known.has(entryId))) {
      throw new ActionError("The list changed in the meantime. Reload the page and try again.");
    }
    for (const [sort, entryId] of ids.entries()) await tx.publication.update({ where: { id: entryId }, data: { sort } });
  });
  return null;
});

// ─── Order (E4-9) ────────────────────────────────────────────────────────────

const section = z.enum(["experience", "project", "education", "course"]);
type Section = z.infer<typeof section>;

/** Each ordered section's setting. */
const ORDER_SETTING = {
  experience: "experienceOrder",
  project: "projectOrder",
  education: "educationOrder",
  course: "courseOrder",
} as const;

/** The section's table, as far as ordering needs it. */
function entries(db: Prisma.TransactionClient, section: Section) {
  const select = { id: true, sort: true, startYear: true, startMonth: true } as const;
  const setSort = (entryId: string, sort: number) => ({ where: { id: entryId }, data: { sort } });
  if (section === "experience") {
    return { list: () => db.experience.findMany({ select }), setSort: (entryId: string, sort: number) => db.experience.update(setSort(entryId, sort)) };
  }
  if (section === "project") {
    return { list: () => db.project.findMany({ select }), setSort: (entryId: string, sort: number) => db.project.update(setSort(entryId, sort)) };
  }
  if (section === "education") {
    return { list: () => db.education.findMany({ select }), setSort: (entryId: string, sort: number) => db.education.update(setSort(entryId, sort)) };
  }
  return { list: () => db.course.findMany({ select }), setSort: (entryId: string, sort: number) => db.course.update(setSort(entryId, sort)) };
}

/**
 * Saves an order set by hand: `ids` is every entry of the section, in the new
 * order. From then on the section keeps that order instead of dates.
 */
export const reorderEntries = action(z.object({ section, ids: z.array(id) }), async ({ section, ids }) => {
  await prisma.$transaction(async (tx) => {
    const table = entries(tx, section);
    const known = new Set((await table.list()).map((entry) => entry.id));
    if (ids.length !== known.size || new Set(ids).size !== ids.length || !ids.every((entryId) => known.has(entryId))) {
      throw new ActionError("The list changed in the meantime. Reload the page and try again.");
    }
    for (const [sort, entryId] of ids.entries()) await table.setSort(entryId, sort);
    await saveSettings({ [ORDER_SETTING[section]]: "manual" }, tx);
  });
  return null;
});

/** Goes back to date order; returns the section's ids in that order for the list. */
export const sortEntriesByDate = action(z.object({ section }), async ({ section }) => {
  await saveSettings({ [ORDER_SETTING[section]]: "date" });
  return inEntryOrder(await entries(prisma, section).list(), "date").map((entry) => entry.id);
});

// ─── Import from a resume (E4-10) ───────────────────────────────────────────

/**
 * Merges the profile read from a resume into the profile, or replaces it.
 * Nothing goes into the profile before this: the read profile waits in its
 * job, and is taken from there rather than from the browser. Then the job is
 * deleted, with the resume's text.
 */
export const applyProfileImport = action(
  z.object({ jobId: id, mode: z.enum(["merge", "replace"]) }),
  async ({ jobId, mode }, { toast }) => {
    const job = await prisma.job.findUnique({ where: { id: jobId }, select: { type: true, status: true, result: true } });
    if (job?.type !== importProfileJob.type || job.status !== JobStatus.DONE) {
      throw new ActionError("That resume isn't read yet, or it's no longer there. Choose the file again.");
    }
    const { profile } = importProfileJob.result.parse(job.result);
    await applyImportedProfile(prisma, profile, mode);
    await prisma.job.deleteMany({ where: { id: jobId } });
    revalidatePath("/", "layout");
    toast(`${mode === "replace" ? "Your profile now holds" : "Added to your profile"}: ${importCounts(profile)}.`);
    return null;
  },
);

/** "Choose another file": the reading is deleted, with the resume's text, and stopped if it's under way. */
export const discardProfileImport = action(z.object({ jobId: id }), async ({ jobId }) => {
  await discardProfileImports(jobId);
  return null;
});

// ─── Profile review (.scratch/profile-review) ───────────────────────────────

/** "Review my profile": starts a review, discarding any earlier one. */
export const startProfileReview = action(z.object({}), async () => {
  if (!(await isAiConfigured())) throw new ActionError("Choose an AI provider in Settings first: it's what reviews your profile.");
  await discardProfileReviews();
  return { jobId: await startJob(reviewProfileJob, {}, { key: "profile-review" }) };
});

/** A finished review's result, or an error the user can act on. */
async function finishedReview(jobId: string): Promise<ReviewProfileResult> {
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { type: true, status: true, result: true } });
  if (job?.type !== reviewProfileJob.type || job.status !== JobStatus.DONE) {
    throw new ActionError("That review isn't finished, or it's no longer there. Review your profile again.");
  }
  return reviewProfileJob.result.parse(job.result);
}

const fingerprints = z.array(z.string().max(4_000)).max(MAX_FIXES);

/** Applies the fixes the user kept (by fixFingerprint); the rest won't be proposed again. */
export const applyProfileReview = action(z.object({ jobId: id, apply: fingerprints }), async ({ jobId, apply }, { toast }) => {
  const review = await finishedReview(jobId);
  const { applied, changed } = await settleProfileReview(prisma, { jobId, ...review }, apply);
  revalidatePath("/", "layout");
  const done =
    applied === 0 ? "Nothing changed." : applied === 1 ? "Applied 1 fix." : `Applied ${applied} fixes.`;
  const stale =
    changed === 0
      ? ""
      : changed === 1
        ? " One was left out because you changed that entry after the review."
        : ` ${changed} were left out because you changed those entries after the review.`;
  toast(done + stale);
  return null;
});

/** "Discard": none of the fixes are applied, and none are proposed again. A review still under way is just stopped. */
export const discardProfileReview = action(z.object({ jobId: id }), async ({ jobId }) => {
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { type: true, status: true } });
  if (job?.type === reviewProfileJob.type && job.status === JobStatus.DONE) {
    await settleProfileReview(prisma, { jobId, ...(await finishedReview(jobId)) }, []);
  } else {
    await discardProfileReviews(jobId);
  }
  return null;
});

// ─── Profile chat (.scratch/profile-chat) ───────────────────────────────────

const chatTurn = z.object({ role: z.enum(["user", "assistant"]), text: z.string().trim().min(1).max(4000) });

/** Sends the chat's conversation, ending with the new message; an answer still on its way is dropped. */
export const sendProfileChat = action(z.object({ turns: z.array(chatTurn).min(1).max(100) }), async ({ turns }) => {
  if (!(await isAiConfigured())) throw new ActionError("Choose an AI provider in Settings first: it's what reads your messages.");
  if (turns.at(-1)?.role !== "user") throw new ActionError("Write a message first.");
  await discardProfileChats();
  return { jobId: await startJob(profileChatJob, { turns }, { key: PROFILE_CHAT_KEY }) };
});

/** Deletes an answer once it's shown, or stops one on its way, so the conversation isn't kept. */
export const discardProfileChat = action(z.object({ jobId: id }), async ({ jobId }) => {
  await discardProfileChats(jobId);
  return null;
});

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many.replace("#", String(count)));

/**
 * Applies changes from the chat, checked again against the profile as it is
 * now. In strict mode a change with names or numbers the user didn't say
 * needs their confirmation first. Answers with the profile, for the editor,
 * and what Undo needs.
 */
export const applyProfileChat = action(
  z.object({
    changes: z.array(z.object({ change: profileChangeSchema, confirmed: z.boolean() })).min(1).max(MAX_CHANGES),
    versions: z.record(z.string(), z.string()),
    /** What the user wrote in the chat, which backs what the changes say. */
    words: z.string().max(400_000),
  }),
  async ({ changes, versions, words }) => {
    const [profile, { strict }] = await Promise.all([loadProfile(), loadSettings()]);
    if (strict) {
      const sources = sourcesFor(profile, null, words);
      const unsure = changes.filter(({ change, confirmed }) => !confirmed && unverifiedFacts(changeText(change), sources).length > 0);
      if (unsure.length > 0) throw new ActionError("Check the marked words first: you didn't mention them, and your profile doesn't have them.");
    }
    const checked = checkProfileChanges(profile, changes.map(({ change }) => change));
    if (checked.changes.length === 0) {
      throw new ActionError(checked.refused[0]?.reason ?? "Your profile already has all of that.");
    }
    const { applied, stale, undo } = await applyProfileChanges(prisma, checked.changes, versions);
    revalidatePath("/", "layout");
    const left = stale.length + checked.refused.length;
    const message =
      applied.length === 0
        ? "Nothing changed: you edited those entries in the meantime."
        : `${plural(applied.length, "Saved to your profile.", "Saved # changes to your profile.")}${left > 0 ? ` ${plural(left, "One was left out because its entry changed.", "# were left out because their entries changed.")}` : ""}`;
    return { profile: await loadProfile(), undo, applied: applied.length, message };
  },
);

/** The toast's Undo: takes back what the chat saved, except entries changed since. */
export const undoProfileChat = action(z.object({ undo: z.array(undoStepSchema).max(MAX_CHANGES * 4) }), async ({ undo }) => {
  const { kept } = await undoProfileChanges(prisma, undo);
  revalidatePath("/", "layout");
  return { profile: await loadProfile(), message: kept === 0 ? "Undone." : plural(kept, "Undone, except one entry you changed since.", "Undone, except # entries you changed since.") };
});

// ─── References (PRO-8) ──────────────────────────────────────────────────────

const referenceFields = z.object({
  id,
  name: text(200),
  relation: text(200),
  company: text(200),
  email: text(320),
  phone: text(60),
});

const referenceItem = (entry: z.infer<typeof referenceFields>) => ({
  id: entry.id,
  name: entry.name,
  relation: entry.relation,
  company: entry.company,
  email: entry.email,
  phone: entry.phone,
});

export const createReference = action(z.object({}), async () =>
  referenceItem(await prisma.reference.create({ data: { sort: await nextSort(prisma.reference) } })),
);

export const saveReference = action(referenceFields, async ({ id, ...data }) => {
  await prisma.reference.updateMany({ where: { id }, data });
  return null;
});

export const removeReference = action(z.object({ id }), async ({ id }) => {
  await prisma.reference.deleteMany({ where: { id } });
  return null;
});

export const restoreReference = action(referenceFields, async (entry) =>
  referenceItem(
    await prisma.reference.upsert({
      where: { id: entry.id },
      create: { ...entry, sort: await nextSort(prisma.reference) },
      update: {},
    }),
  ),
);
