import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { LanguageLevel } from "@/generated/prisma/enums";
import { profileChangeSchema, type ProfileChange, type ProfileChangeInput } from "@/lib/profile-changes";
import { entryVersions } from "@/lib/profile-review-apply";
import { saveSettings } from "@/lib/settings-data";
import { createTestClient, resetDatabase } from "@/test/db";

import { applyProfileChanges, undoProfileChanges } from "./profile-changes-apply";

const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});

const prisma = () => db.client!;
const changes = (...input: ProfileChangeInput[]): ProfileChange[] => input.map((change) => profileChangeSchema.parse(change));

beforeEach(async () => {
  await resetDatabase(prisma());
  await prisma().skill.create({ data: { id: "ts", name: "TypeScript", sort: 0 } });
  await prisma().experience.create({
    data: { id: "acme", role: "Engineer", company: "Acme", startYear: 2021, startMonth: 3, endYear: 2024, endMonth: 5, bullets: "Built billing", sort: 5, skills: { create: [{ skillId: "ts" }] } },
  });
  await prisma().course.create({ data: { id: "aid", name: "First aid", sort: 3 } });
  await prisma().language.create({ data: { id: "en", code: "en", name: "English", level: LanguageLevel.B2, sort: 0 } });
  await prisma().profileField.create({ data: { key: "interests", value: "Climbing" } });
});

afterAll(async () => {
  await prisma().$disconnect();
});

describe("applyProfileChanges", () => {
  it("adds a role with its skills, after the rest in date order", async () => {
    const { applied } = await applyProfileChanges(
      prisma(),
      changes({ kind: "add", section: "experience", entry: { role: "Volunteer", company: "Food bank", bullets: ["Ran shifts", "Trained people"], skills: ["TypeScript", "Excel"], startYear: 2019 } }),
      null,
    );
    expect(applied).toHaveLength(1);
    const added = await prisma().experience.findFirstOrThrow({ where: { role: "Volunteer" }, include: { skills: { include: { skill: true } } } });
    expect(added).toMatchObject({ company: "Food bank", bullets: "Ran shifts\nTrained people", startYear: 2019, sort: 6 });
    expect(added.skills.map((link) => link.skill.name).sort()).toEqual(["Excel", "TypeScript"]);
  });

  it("puts an added course first when the section is ordered by hand", async () => {
    await saveSettings({ courseOrder: "manual" });
    await applyProfileChanges(prisma(), changes({ kind: "add", section: "courses", entry: { name: "AWS", provider: "Amazon" } }), null);
    expect(await prisma().course.findFirstOrThrow({ where: { name: "AWS" } })).toMatchObject({ sort: 2 });
  });

  it("edits only the fields given, and links new skills", async () => {
    await applyProfileChanges(prisma(), changes({ kind: "edit", section: "experience", id: "acme", entry: { endMonth: 6, skills: ["Go"] } }), null);
    const row = await prisma().experience.findUniqueOrThrow({ where: { id: "acme" }, include: { skills: { include: { skill: true } } } });
    expect(row).toMatchObject({ role: "Engineer", endYear: 2024, endMonth: 6, bullets: "Built billing" });
    expect(row.skills.map((link) => link.skill.name).sort()).toEqual(["Go", "TypeScript"]);
  });

  it("adds points after an entry's own", async () => {
    await applyProfileChanges(prisma(), changes({ kind: "addBullets", section: "experience", id: "acme", bullets: ["Led the move to Postgres"] }), null);
    expect((await prisma().experience.findUniqueOrThrow({ where: { id: "acme" } })).bullets).toBe("Built billing\nLed the move to Postgres");
  });

  it("leaves alone an entry saved after the proposal", async () => {
    const versions = await entryVersions(prisma());
    await prisma().experience.update({ where: { id: "acme" }, data: { location: "Berlin" } });
    const result = await applyProfileChanges(
      prisma(),
      changes({ kind: "edit", section: "experience", id: "acme", entry: { endMonth: 6 } }, { kind: "addSkills", names: ["Go"] }),
      versions,
    );
    expect(result.stale).toHaveLength(1);
    expect(result.applied).toEqual([{ kind: "addSkills", names: ["Go"] }]);
    expect((await prisma().experience.findUniqueOrThrow({ where: { id: "acme" } })).endMonth).toBe(5);
  });

  it("adds skills, languages, interests, facts and basics", async () => {
    await applyProfileChanges(
      prisma(),
      changes(
        { kind: "addSkills", names: ["Go"] },
        { kind: "addLanguages", languages: [{ name: "Italiano", level: LanguageLevel.B1 }, { name: "Inglese", level: LanguageLevel.C1 }] },
        { kind: "addInterests", names: ["Chess"] },
        { kind: "addFacts", texts: ["I can start in January."] },
        { kind: "setBasics", basics: { headline: "Data engineer" } },
      ),
      null,
    );
    expect(await prisma().skill.count()).toBe(2);
    expect(await prisma().language.findMany({ orderBy: { sort: "asc" }, select: { code: true, level: true } })).toEqual([
      { code: "en", level: LanguageLevel.C1 },
      { code: "it", level: LanguageLevel.B1 },
    ]);
    expect((await prisma().profileField.findUniqueOrThrow({ where: { key: "interests" } })).value).toBe("Climbing\nChess");
    expect(await prisma().fact.findMany({ select: { text: true, applicationId: true } })).toEqual([{ text: "I can start in January.", applicationId: null }]);
    expect((await prisma().profileField.findUniqueOrThrow({ where: { key: "headline" } })).value).toBe("Data engineer");
  });
});

describe("undoProfileChanges", () => {
  it("takes back everything it did", async () => {
    const { undo } = await applyProfileChanges(
      prisma(),
      changes(
        { kind: "add", section: "experience", entry: { role: "Volunteer", skills: ["Excel"] } },
        { kind: "edit", section: "experience", id: "acme", entry: { endMonth: 6, bullets: ["Rewrote billing"], skills: ["Go"] } },
        { kind: "addLanguages", languages: [{ name: "Italian", level: LanguageLevel.B1 }, { name: "English", level: LanguageLevel.C1 }] },
        { kind: "addInterests", names: ["Chess"] },
        { kind: "addFacts", texts: ["I can start in January."] },
        { kind: "setBasics", basics: { headline: "Data engineer" } },
      ),
      null,
    );
    expect(await undoProfileChanges(prisma(), undo)).toEqual({ kept: 0 });

    expect(await prisma().experience.count()).toBe(1);
    const acme = await prisma().experience.findUniqueOrThrow({ where: { id: "acme" }, include: { skills: true } });
    expect(acme).toMatchObject({ endMonth: 5, bullets: "Built billing" });
    expect(acme.skills.map((link) => link.skillId)).toEqual(["ts"]);
    expect(await prisma().skill.findMany({ select: { name: true } })).toEqual([{ name: "TypeScript" }]);
    expect(await prisma().language.findMany({ select: { code: true, level: true } })).toEqual([{ code: "en", level: LanguageLevel.B2 }]);
    expect((await prisma().profileField.findUniqueOrThrow({ where: { key: "interests" } })).value).toBe("Climbing");
    expect(await prisma().fact.count()).toBe(0);
    expect(await prisma().profileField.findUnique({ where: { key: "headline" } })).toBeNull();
  });

  it("leaves an entry changed since, and a skill something else now uses", async () => {
    const { undo } = await applyProfileChanges(
      prisma(),
      changes({ kind: "add", section: "courses", entry: { name: "AWS" } }, { kind: "addSkills", names: ["Go"] }),
      null,
    );
    await prisma().course.updateMany({ where: { name: "AWS" }, data: { provider: "Amazon" } });
    const go = await prisma().skill.findUniqueOrThrow({ where: { name: "Go" } });
    await prisma().experienceSkill.create({ data: { experienceId: "acme", skillId: go.id } });

    expect(await undoProfileChanges(prisma(), undo)).toEqual({ kept: 1 });
    expect(await prisma().course.count({ where: { name: "AWS" } })).toBe(1);
    expect(await prisma().skill.count({ where: { name: "Go" } })).toBe(1);
  });
});
