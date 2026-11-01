import "server-only";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { loadProfile } from "@/lib/profile-data";
import { buildFixes, fixEntryKeys, fixFingerprint, rememberSkipped, type ProfileFix, type ReviewAnswer, type ReviewSection } from "@/lib/profile-review";
import { loadSettings, saveSettings } from "@/lib/settings-data";

type Tx = Prisma.TransactionClient;

/** When each entry the review can change was last saved, by "section:id", so a later edit can be noticed. */
export async function entryVersions(db: Tx | PrismaClient): Promise<Record<string, string>> {
  const select = { id: true, updatedAt: true } as const;
  const sections: Record<ReviewSection, { id: string; updatedAt: Date }[]> = {
    experience: await db.experience.findMany({ select }),
    projects: await db.project.findMany({ select }),
    education: await db.education.findMany({ select }),
    courses: await db.course.findMany({ select }),
  };
  return Object.fromEntries(
    Object.entries(sections).flatMap(([section, rows]) => rows.map((row) => [`${section}:${row.id}`, row.updatedAt.toISOString()])),
  );
}

/**
 * Settles a finished review in one transaction: applies the chosen fixes
 * (by fixFingerprint), rebuilt from the profile as it is now, and remembers
 * the rest as skipped. A chosen fix whose entries were saved after the
 * review is left out, and not remembered, so the next review can propose it
 * again. The review's job goes with it.
 */
export async function settleProfileReview(
  db: PrismaClient,
  review: { jobId: string; answer: ReviewAnswer; versions: Record<string, string> },
  chosen: readonly string[],
): Promise<{ applied: number; changed: number }> {
  const [profile, { reviewSkipped }] = await Promise.all([loadProfile(), loadSettings()]);
  const fixes = buildFixes(profile, review.answer, reviewSkipped);
  const wanted = new Set(chosen);
  return db.$transaction(
    async (tx) => {
      const now = await entryVersions(tx);
      const skipped: string[] = [];
      let applied = 0;
      let changed = 0;
      // In buildFixes' order: entries first, so a merged role's skills all still exist; skills after.
      for (const fix of fixes) {
        const fingerprint = fixFingerprint(fix);
        if (!wanted.has(fingerprint)) skipped.push(fingerprint);
        else if (fixEntryKeys(fix).some((key) => now[key] !== review.versions[key])) changed++;
        else {
          await applyFix(tx, fix);
          applied++;
        }
      }
      await saveSettings({ reviewSkipped: rememberSkipped(profile, reviewSkipped, skipped) }, tx);
      await tx.job.deleteMany({ where: { id: review.jobId } });
      return { applied, changed };
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}

async function applyFix(tx: Tx, fix: ProfileFix): Promise<void> {
  if (fix.kind === "mergeSkills") return mergeSkills(tx, fix.ids, fix.keep);
  if (fix.kind === "delete") return remove(tx, fix.section, [fix.id]);
  await save(tx, fix);
  if (fix.kind === "merge") await remove(tx, fix.section, fix.ids.filter((id) => id !== fix.keep));
}

const dates = (entry: { startYear: number | null; startMonth: number | null; endYear: number | null; endMonth: number | null }) => ({
  startYear: entry.startYear,
  startMonth: entry.startMonth,
  endYear: entry.endYear,
  endMonth: entry.endMonth,
});

/** Writes a merged or edited entry; a merge also gets every skill its entries had. */
async function save(tx: Tx, fix: Extract<ProfileFix, { after: unknown }>): Promise<void> {
  const id = fix.kind === "merge" ? fix.keep : fix.id;
  switch (fix.section) {
    case "experience": {
      const { role, company, location, current, bullets, skillIds } = fix.after;
      await tx.experience.update({ where: { id }, data: { role, company, location, ...dates(fix.after), current, bullets } });
      if (fix.kind === "merge") await tx.experienceSkill.createMany({ data: skillIds.map((skillId) => ({ experienceId: id, skillId })), skipDuplicates: true });
      return;
    }
    case "projects": {
      const { name, link, current, bullets, skillIds } = fix.after;
      await tx.project.update({ where: { id }, data: { name, link, ...dates(fix.after), current, bullets } });
      if (fix.kind === "merge") await tx.projectSkill.createMany({ data: skillIds.map((skillId) => ({ projectId: id, skillId })), skipDuplicates: true });
      return;
    }
    case "education": {
      const { degree, school, current, notes } = fix.after;
      await tx.education.update({ where: { id }, data: { degree, school, ...dates(fix.after), current, notes } });
      return;
    }
    case "courses": {
      const { name, provider, duration, link, notes, onResumes } = fix.after;
      await tx.course.update({ where: { id }, data: { name, provider, ...dates(fix.after), duration, link, notes, onResumes } });
      return;
    }
  }
}

/** Deletes entries; their skill links go with them (PRO-3). */
async function remove(tx: Tx, section: ReviewSection, ids: string[]): Promise<void> {
  const where = { id: { in: ids } };
  if (section === "experience") await tx.experience.deleteMany({ where });
  else if (section === "projects") await tx.project.deleteMany({ where });
  else if (section === "education") await tx.education.deleteMany({ where });
  else await tx.course.deleteMany({ where });
}

/** Moves every role's and project's link to the other skills onto the kept one, then deletes the others. */
async function mergeSkills(tx: Tx, ids: string[], keep: string): Promise<void> {
  const others = ids.filter((id) => id !== keep);
  const where = { skillId: { in: others } };
  const roles = await tx.experienceSkill.findMany({ where, select: { experienceId: true } });
  const projects = await tx.projectSkill.findMany({ where, select: { projectId: true } });
  await tx.experienceSkill.createMany({ data: roles.map(({ experienceId }) => ({ experienceId, skillId: keep })), skipDuplicates: true });
  await tx.projectSkill.createMany({ data: projects.map(({ projectId }) => ({ projectId, skillId: keep })), skipDuplicates: true });
  await tx.skill.deleteMany({ where: { id: { in: others } } });
}
