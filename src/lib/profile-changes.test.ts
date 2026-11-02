import { describe, expect, it } from "vitest";

import { LanguageLevel } from "@/generated/prisma/enums";
import { demoProfile } from "@/lib/demo-profile";
import type { CourseItem, ExperienceItem, ProfileData } from "@/lib/profile";

import { changeText, checkProfileChanges, describeChange, MAX_CHANGES, profileChangeSchema, type ProfileChange, type ProfileChangeInput } from "./profile-changes";

const role = (id: string, fields: Partial<ExperienceItem> = {}): ExperienceItem => ({
  id,
  role: "Engineer",
  company: "Acme",
  location: "",
  startYear: 2021,
  startMonth: 3,
  endYear: 2024,
  endMonth: 5,
  current: false,
  bullets: "Built the billing service",
  skillIds: [],
  groupId: null,
  careerBreak: false,
  ...fields,
});

const course = (id: string, fields: Partial<CourseItem> = {}): CourseItem => ({
  id,
  name: "First aid",
  provider: "Red Cross",
  startYear: 2023,
  startMonth: 5,
  endYear: null,
  endMonth: null,
  duration: "",
  link: "",
  notes: "",
  onResumes: true,
  ...fields,
});

const profile = (fields: Partial<ProfileData> = {}): ProfileData => ({
  ...demoProfile(),
  experience: [role("acme")],
  experienceGroups: [],
  projects: [],
  education: [],
  courses: [course("aid")],
  skills: [{ id: "ts", name: "TypeScript" }],
  languages: [{ id: "en", code: "en", name: "English", level: LanguageLevel.C1 }],
  interests: ["Climbing"],
  facts: [],
  ...fields,
});

/** Parsed as an incoming change is, so added entries get their defaults. */
const changes = (...input: ProfileChangeInput[]): ProfileChange[] => input.map((change) => profileChangeSchema.parse(change));
const check = (...input: ProfileChangeInput[]) => checkProfileChanges(profile(), changes(...input));

describe("checkProfileChanges", () => {
  it("keeps a new course with its defaults filled in", () => {
    const result = check({ kind: "add", section: "courses", entry: { name: "AWS Solutions Architect", provider: "Amazon", startYear: 2025, startMonth: 3 } });
    expect(result.refused).toEqual([]);
    expect(result.changes).toEqual([
      {
        kind: "add",
        section: "courses",
        entry: { name: "AWS Solutions Architect", provider: "Amazon", duration: "", link: "", notes: "", startYear: 2025, startMonth: 3, endYear: null, endMonth: null },
      },
    ]);
  });

  it("trims text and drops list marks and blank points", () => {
    const result = check({ kind: "add", section: "experience", entry: { role: " Volunteer ", company: "Food bank", bullets: ["- Ran weekly shifts", "  ", "• Trained 30 volunteers"] } });
    expect(result.changes[0]).toMatchObject({ entry: { role: "Volunteer", bullets: ["Ran weekly shifts", "Trained 30 volunteers"] } });
  });

  it("refuses an entry without what it needs", () => {
    expect(check({ kind: "add", section: "courses", entry: { name: "" } }).refused[0].reason).toBe("A course or certificate needs a name.");
    expect(check({ kind: "add", section: "experience", entry: { role: "", company: "" } }).refused[0].reason).toBe("A role needs a job title or a company.");
  });

  it.each([
    [{ startYear: 2024, endYear: 2023, current: false }, "It ends before it starts."],
    [{ startYear: 2024, startMonth: 13, current: false }, "One of the months doesn't look right."],
    [{ startYear: 1850, current: false }, "One of the years doesn't look right."],
    [{ startYear: 2020, endYear: 2022, current: true }, "It can't both be ongoing and have an end date."],
    [{ startMonth: 4, current: false }, "A month needs its year."],
  ])("refuses impossible dates %o", (dates, reason) => {
    expect(check({ kind: "add", section: "experience", entry: { role: "Volunteer", ...dates } }).refused[0].reason).toBe(reason);
  });

  it("turns an added entry the profile has into an edit filling in what's new", () => {
    const result = check({ kind: "add", section: "experience", entry: { role: "engineer", company: "ACME", location: "Berlin", bullets: ["Built the billing service", "Led the move to Postgres"] } });
    expect(result.changes).toEqual([
      { kind: "edit", section: "experience", id: "acme", entry: { role: "engineer", company: "ACME", location: "Berlin", bullets: ["Built the billing service", "Led the move to Postgres"] } },
    ]);
  });

  it("leaves out an added course that's already there as it is", () => {
    expect(check({ kind: "add", section: "courses", entry: { name: "First Aid", provider: "red cross" } })).toEqual({
      changes: [{ kind: "edit", section: "courses", id: "aid", entry: { name: "First Aid", provider: "red cross" } }],
      refused: [],
    });
    expect(check({ kind: "add", section: "courses", entry: { name: "First aid", provider: "Red Cross" } })).toEqual({ changes: [], refused: [] });
  });

  it("keeps only what an edit changes, and refuses one that changes nothing", () => {
    expect(check({ kind: "edit", section: "experience", id: "acme", entry: { endMonth: 6, company: "Acme" } }).changes).toEqual([
      { kind: "edit", section: "experience", id: "acme", entry: { endMonth: 6 } },
    ]);
    expect(check({ kind: "edit", section: "experience", id: "acme", entry: { company: "Acme" } }).refused[0].reason).toBe("Your profile already says that.");
  });

  it("checks an edit's dates against the entry's own", () => {
    expect(check({ kind: "edit", section: "experience", id: "acme", entry: { endYear: 2019 } }).refused[0].reason).toBe("It ends before it starts.");
  });

  it("refuses an unknown entry", () => {
    expect(check({ kind: "edit", section: "courses", id: "nope", entry: { name: "X" } }).refused[0].reason).toBe("That course isn't in your profile any more.");
    expect(check({ kind: "addBullets", section: "experience", id: "aid", bullets: ["X"] }).refused[0].reason).toBe("That role isn't in your profile any more.");
  });

  it("adds only new points to an entry", () => {
    expect(check({ kind: "addBullets", section: "experience", id: "acme", bullets: ["built the billing  service", "Led the move to Postgres"] }).changes).toEqual([
      { kind: "addBullets", section: "experience", id: "acme", bullets: ["Led the move to Postgres"] },
    ]);
  });

  it("leaves out skills, languages, interests and facts the profile has", () => {
    const result = checkProfileChanges(
      profile({ facts: [{ id: "f", text: "I can relocate." }] }),
      changes(
        { kind: "addSkills", names: ["typescript", "Go", "go"] },
        { kind: "addLanguages", languages: [{ name: "English", level: LanguageLevel.C1 }, { name: "Italiano", level: LanguageLevel.B1 }] },
        { kind: "addInterests", names: ["climbing"] },
        { kind: "addFacts", texts: ["I can relocate.", "I hold a B driving licence."] },
      ),
    );
    expect(result.changes).toEqual([
      { kind: "addSkills", names: ["Go"] },
      { kind: "addLanguages", languages: [{ name: "Italiano", level: LanguageLevel.B1 }] },
      { kind: "addFacts", texts: ["I hold a B driving licence."] },
    ]);
  });

  it("keeps a new level for a language the profile has", () => {
    expect(check({ kind: "addLanguages", languages: [{ name: "Inglese", level: LanguageLevel.C2 }] }).changes).toHaveLength(1);
  });

  it("refuses facts beyond the limit", () => {
    const facts = Array.from({ length: 50 }, (_, index) => ({ id: `f${index}`, text: `Fact ${index}` }));
    expect(checkProfileChanges(profile({ facts }), changes({ kind: "addFacts", texts: ["One more"] })).refused).toHaveLength(1);
  });

  it("refuses text longer than the profile takes", () => {
    expect(check({ kind: "setBasics", basics: { headline: "x".repeat(301) } }).refused[0].reason).toMatch(/headline is longer/);
  });

  it("refuses changes beyond the cap", () => {
    const many = Array.from({ length: MAX_CHANGES + 2 }, (_, index): ProfileChangeInput => ({ kind: "addSkills", names: [`Skill ${index}`] }));
    const result = check(...many);
    expect(result.changes).toHaveLength(MAX_CHANGES);
    expect(result.refused).toHaveLength(2);
  });

  it("leaves out basics that are the same", () => {
    const own = profile();
    expect(checkProfileChanges(own, changes({ kind: "setBasics", basics: { city: own.basics.city, headline: "Data engineer" } })).changes).toEqual([
      { kind: "setBasics", basics: { headline: "Data engineer" } },
    ]);
  });

  it("links a role's skills by the profile's spelling", () => {
    expect(check({ kind: "add", section: "experience", entry: { role: "Volunteer", skills: ["typescript", "Excel"] } }).changes[0]).toMatchObject({
      entry: { skills: ["TypeScript", "Excel"] },
    });
  });
});

describe("describeChange", () => {
  it("shows an edit's dates before and after", () => {
    const [change] = changes({ kind: "edit", section: "experience", id: "acme", entry: { endMonth: 6 } });
    expect(describeChange(profile(), change)).toEqual({
      action: "Change a role",
      title: "Engineer · Acme",
      details: ["Dates: Mar 2021 – May 2024 → Mar 2021 – Jun 2024"],
      section: "experience",
    });
  });

  it("shows an added course", () => {
    const [change] = changes({ kind: "add", section: "courses", entry: { name: "AWS", provider: "Amazon", startYear: 2025, startMonth: 3 } });
    expect(describeChange(profile(), change)).toMatchObject({ action: "Add a course or certificate", title: "AWS · Amazon", details: ["Mar 2025"] });
  });
});

describe("changeText", () => {
  it("gives the words a change writes, for the fact guard", () => {
    const [change] = changes({ kind: "add", section: "experience", entry: { role: "Volunteer", company: "Food bank", bullets: ["Ran shifts for 30 people"], skills: ["Excel"], startYear: 2019 } });
    expect(changeText(change)).toBe("with Volunteer, Food bank, 2019\nRan shifts for 30 people");
    expect(changeText(change)).not.toContain("Excel");
  });
});
