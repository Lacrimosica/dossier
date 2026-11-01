import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { loadProfile } from "@/lib/profile-data";
import { fixFingerprint, type ReviewAnswer } from "@/lib/profile-review";
import { loadSettings, saveSettings } from "@/lib/settings-data";
import { createTestClient, resetDatabase } from "@/test/db";

import { entryVersions, settleProfileReview } from "./profile-review-apply";

const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});

const prisma = () => db.client!;

const answer = (fields: Partial<ReviewAnswer>): ReviewAnswer => ({ merges: [], edits: [], deletions: [], skillMerges: [], ...fields });
const mergeRoles = { section: "experience" as const, ids: ["a", "b"], keep: "a", bullets: null, reason: "Entered twice." };
const mergeSkills = { ids: ["js", "javascript"], keep: "javascript", reason: "Same skill." };

/** A review of the profile as it is now, with its job. */
async function review(fields: Partial<ReviewAnswer>) {
  const job = await prisma().job.create({ data: { type: "review-profile", status: "DONE", input: {} } });
  return { jobId: job.id, answer: answer(fields), versions: await entryVersions(prisma()) };
}

beforeEach(async () => {
  await resetDatabase(prisma());
  await prisma().skill.createMany({
    data: [
      { id: "js", name: "JS", sort: 0 },
      { id: "javascript", name: "JavaScript", sort: 1 },
      { id: "figma", name: "Figma", sort: 2 },
    ],
  });
  await prisma().experience.create({
    data: { id: "a", role: "Sr. Engineer", company: "Acme Inc.", startYear: 2021, startMonth: 6, endYear: 2023, endMonth: 1, bullets: "Led payments", sort: 4, skills: { create: [{ skillId: "js" }] } },
  });
  await prisma().experience.create({
    data: { id: "b", role: "Senior Engineer", company: "ACME", location: "Berlin", startYear: 2020, current: true, bullets: "led payments\nHired four", sort: 1, skills: { create: [{ skillId: "figma" }, { skillId: "js" }] } },
  });
  await prisma().project.create({ data: { id: "p", name: "Checkout", skills: { create: [{ skillId: "js" }, { skillId: "javascript" }] } } });
});
afterAll(() => prisma().$disconnect());

describe("settleProfileReview", () => {
  it("merges roles into the kept one, with every skill, its own place in the order, and the other deleted", async () => {
    const settled = await review({ merges: [mergeRoles] });
    expect(await settleProfileReview(prisma(), settled, [fixFingerprint({ kind: "merge", ...mergeRoles })])).toEqual({ applied: 1, changed: 0 });

    const roles = await prisma().experience.findMany({ include: { skills: { select: { skillId: true }, orderBy: { skillId: "asc" } } } });
    expect(roles).toEqual([
      expect.objectContaining({
        id: "a",
        role: "Sr. Engineer",
        company: "Acme Inc.",
        location: "Berlin",
        startYear: 2020,
        startMonth: null,
        endYear: null,
        endMonth: null,
        current: true,
        bullets: "Led payments\nHired four",
        sort: 4,
        skills: [{ skillId: "figma" }, { skillId: "js" }],
      }),
    ]);
    // The review's job goes once it's settled.
    expect(await prisma().job.count()).toBe(0);
  });

  it("merges skills: every role's and project's link moves to the kept one", async () => {
    const settled = await review({ skillMerges: [mergeSkills] });
    expect(await settleProfileReview(prisma(), settled, [fixFingerprint({ kind: "mergeSkills", ...mergeSkills })])).toEqual({ applied: 1, changed: 0 });

    const profile = await loadProfile();
    expect(profile.skills.map((skill) => skill.name)).toEqual(["JavaScript", "Figma"]);
    expect(profile.experience.find((entry) => entry.id === "a")?.skillIds).toEqual(["javascript"]);
    expect(profile.experience.find((entry) => entry.id === "b")?.skillIds.sort()).toEqual(["figma", "javascript"]);
    expect(profile.projects[0].skillIds).toEqual(["javascript"]);
  });

  it("applies a role merge and a skill merge together, entries first", async () => {
    const settled = await review({ merges: [mergeRoles], skillMerges: [mergeSkills] });
    const both = [fixFingerprint({ kind: "merge", ...mergeRoles }), fixFingerprint({ kind: "mergeSkills", ...mergeSkills })];
    expect(await settleProfileReview(prisma(), settled, both)).toEqual({ applied: 2, changed: 0 });
    expect((await loadProfile()).experience).toEqual([expect.objectContaining({ id: "a", skillIds: expect.arrayContaining(["javascript", "figma"]) })]);
  });

  it("edits dates and deletes entries", async () => {
    await prisma().education.create({ data: { id: "e", degree: "MSc", school: "TU", startYear: 2019, endYear: 2017 } });
    await prisma().course.create({ data: { id: "c" } });
    const edit = { section: "education" as const, id: "e", dates: { startYear: 2017, startMonth: null, endYear: 2019, endMonth: null, current: false }, bullets: null, reason: "Swapped." };
    const deletion = { section: "courses" as const, id: "c", reason: "Empty." };
    const settled = await review({ edits: [edit], deletions: [deletion] });
    await settleProfileReview(prisma(), settled, [fixFingerprint({ kind: "edit", ...edit }), fixFingerprint({ kind: "delete", ...deletion })]);

    expect(await prisma().education.findUnique({ where: { id: "e" } })).toMatchObject({ startYear: 2017, endYear: 2019 });
    expect(await prisma().course.count()).toBe(0);
  });

  it("leaves out a fix whose entry was saved after the review, without remembering it as skipped", async () => {
    const settled = await review({ merges: [mergeRoles] });
    await prisma().experience.update({ where: { id: "b" }, data: { bullets: "Something new" } });
    expect(await settleProfileReview(prisma(), settled, [fixFingerprint({ kind: "merge", ...mergeRoles })])).toEqual({ applied: 0, changed: 1 });
    expect(await prisma().experience.count()).toBe(2);
    expect((await loadSettings()).reviewSkipped).toEqual([]);
  });

  it("remembers fixes not chosen, keeps earlier ones whose entries are still there, and doesn't propose them again", async () => {
    await saveSettings({ reviewSkipped: ["delete:experience:gone", "delete:projects:p"] });
    const settled = await review({ merges: [mergeRoles], skillMerges: [mergeSkills] });
    expect(await settleProfileReview(prisma(), settled, [])).toEqual({ applied: 0, changed: 0 });
    expect((await loadSettings()).reviewSkipped).toEqual(["delete:projects:p", "merge:experience:a,b", "mergeSkills:skills:javascript,js"]);
    expect(await prisma().experience.count()).toBe(2);

    // Asked again, the same answer has nothing left to propose.
    const again = await review({ merges: [mergeRoles], skillMerges: [mergeSkills] });
    expect(await settleProfileReview(prisma(), again, [fixFingerprint({ kind: "merge", ...mergeRoles })])).toEqual({ applied: 0, changed: 0 });
    expect(await prisma().experience.count()).toBe(2);
  });
});
