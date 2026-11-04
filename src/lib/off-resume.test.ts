import { describe, expect, it } from "vitest";

import type { Trimmed, Unit } from "@/lib/application-data";
import { demoProfile, demoResumeUnits } from "@/lib/demo-profile";
import { documentLabels, ENGLISH_LABELS } from "@/lib/document-labels";
import type { ProfileData } from "@/lib/profile";

import { addToResume, offResume, type OffResumeItem } from "./off-resume";

const keys = (items: OffResumeItem[]) => items.map((item) => item.key);
const profile = demoProfile();

/** The demo resume with both courses, so nothing's missing to start with. */
const complete = (): Unit[] => {
  const units = demoResumeUnits();
  const [, second] = profile.courses;
  const at = units.findIndex((unit) => unit.id.startsWith("publication:"));
  units.splice(at, 0, { id: `course:${second.id}`, label: second.name, text: second.notes });
  return units;
};

const role = (id: string, groupId: string | null = null): ProfileData["experience"][number] => ({ ...profile.experience[0], id, groupId, role: "Designer", company: id });
const unit = (id: string): Unit => ({ id, label: id, text: "" });

describe("offResume", () => {
  it("finds nothing when the resume has it all", () => {
    expect(offResume(profile, complete(), [], ENGLISH_LABELS)).toEqual([]);
  });

  it("lists the entries a resume doesn't have, with what they'd add", () => {
    const added = { ...role("new"), bullets: "- Led the portal\n\nBuilt the system" };
    const items = offResume({ ...profile, experience: [...profile.experience, added] }, complete(), [], ENGLISH_LABELS);
    expect(items).toEqual([
      {
        kind: "entry",
        key: "experience:new",
        name: "Designer at new",
        unit: { id: "experience:new", label: "new role", text: "Led the portal\nBuilt the system" },
      },
    ]);
  });

  it("lists the courses tailoring passed over", () => {
    expect(keys(offResume(profile, demoResumeUnits(), [], ENGLISH_LABELS))).toEqual([`course:${profile.courses[1].id}`]);
  });

  it("leaves out courses and publications kept off resumes", () => {
    const off = {
      ...profile,
      courses: profile.courses.map((course) => ({ ...course, onResumes: false })),
      publications: profile.publications.map((publication) => ({ ...publication, onResumes: false })),
    };
    const units = complete().filter((entry) => !entry.id.startsWith("course:") && !entry.id.startsWith("publication:"));
    expect(offResume(off, units, [], ENGLISH_LABELS)).toEqual([]);
  });

  it("doesn't list again what's in the Left out list", () => {
    const units = complete();
    const at = units.findIndex((entry) => entry.id.startsWith("experience:"));
    const [cut] = units.splice(at, 1);
    const trimmed: Trimmed = [{ kind: "unit", unit: cut, index: at, byHand: true }];
    expect(offResume(profile, units, trimmed, ENGLISH_LABELS)).toEqual([]);
  });

  it("lists skills, languages and interests one by one, whatever their case or separators", () => {
    const units = complete().map((entry) => {
      if (entry.id === "skills") return { ...entry, text: "FIGMA, Prototyping" };
      if (entry.id === "languages") return { ...entry, text: "Dutch: Native" };
      if (entry.id === "interests") return { ...entry, text: "" };
      return entry;
    });
    const items = offResume({ ...profile, skills: [{ id: "s1", name: "Figma" }, { id: "s2", name: "Prototyping" }, { id: "s3", name: "Go" }] }, units, [], ENGLISH_LABELS);
    expect(keys(items)).toEqual(["skill:s3", "language:language-2", "language:language-3", ...profile.interests.map((interest) => `interest:${interest}`)]);
  });

  it("doesn't mistake one skill for a longer one", () => {
    const units = complete().map((entry) => (entry.id === "skills" ? { ...entry, text: "Google Analytics · C++" } : entry));
    const items = offResume({ ...profile, skills: [{ id: "s1", name: "Go" }, { id: "s2", name: "C" }] }, units, [], ENGLISH_LABELS);
    expect(keys(items)).toEqual(["skill:s1", "skill:s2"]);
  });

  it("keeps a skill with a comma in its name whole", () => {
    const units = complete().map((entry) => (entry.id === "skills" ? { ...entry, text: "HTML, CSS · Figma" } : entry));
    expect(offResume({ ...profile, skills: [{ id: "s1", name: "HTML, CSS" }] }, units, [], ENGLISH_LABELS)).toEqual([]);
  });

  it("doesn't offer the items of a section left out whole", () => {
    const units = complete().filter((entry) => entry.id !== "skills");
    const trimmed: Trimmed = [{ kind: "unit", unit: unit("skills"), index: 3, byHand: true }];
    expect(offResume(profile, units, trimmed, ENGLISH_LABELS)).toEqual([]);
  });

  it("knows a language written in the resume's language, and offers one in it", () => {
    const labels = documentLabels("Italian");
    const units = complete().map((entry) => (entry.id === "languages" ? { ...entry, text: "Olandese: Madrelingua" } : entry));
    const items = offResume(profile, units, [], labels);
    expect(keys(items)).toEqual(["language:language-2", "language:language-3"]);
    expect(items[0]).toMatchObject({ text: expect.stringMatching(/^Inglese: /) });
  });
});

describe("addToResume", () => {
  const ids = (units: Unit[]) => units.map((entry) => entry.id);
  const add = (units: Unit[], from: ProfileData, key: string) => {
    const item = offResume(from, units, [], ENGLISH_LABELS).find((entry) => entry.key === key)!;
    const changed = addToResume(units, item, from);
    return { units, changed };
  };

  it("puts a role where the profile has it", () => {
    const from = { ...profile, experience: [role("a"), role("b"), role("c")] };
    const { units, changed } = add([unit("summary"), unit("experience:a"), unit("experience:c"), unit("skills")], from, "experience:b");
    expect(ids(units)).toEqual(["summary", "experience:a", "experience:b", "experience:c", "skills"]);
    expect(changed).toBe("experience:b");
  });

  it("keeps a role in its group, so the headings keep the order tailoring chose", () => {
    const from = { ...profile, experience: [role("a1", "A"), role("a2", "A"), role("b1", "B")] };
    const { units } = add([unit("experience:b1"), unit("experience:a1"), unit("skills")], from, "experience:a2");
    expect(ids(units)).toEqual(["experience:b1", "experience:a1", "experience:a2", "skills"]);
  });

  it("starts a group's roles after the others", () => {
    const from = { ...profile, experience: [role("a1", "A"), role("b1", "B")] };
    const { units } = add([unit("summary"), unit("experience:b1"), unit("skills")], from, "experience:a1");
    expect(ids(units)).toEqual(["summary", "experience:b1", "experience:a1", "skills"]);
  });

  it("puts the first of its kind where its section goes", () => {
    const from = { ...profile, projects: [{ ...profile.projects[0], id: "p" }] };
    const { units } = add([unit("summary"), unit("experience:e"), unit("skills"), unit("interests")], from, "project:p");
    expect(ids(units)).toEqual(["summary", "experience:e", "project:p", "skills", "interests"]);
  });

  it("puts a course after the others, the first the page limit cuts", () => {
    const units = demoResumeUnits();
    const key = `course:${profile.courses[1].id}`;
    add(units, profile, key);
    expect(ids(units).filter((id) => id.startsWith("course:"))).toEqual([`course:${profile.courses[0].id}`, key]);
    expect(ids(units).indexOf(key)).toBeLessThan(ids(units).findIndex((id) => id.startsWith("publication:")));
  });

  it("adds a skill to the end of the line", () => {
    const { units, changed } = add([{ id: "skills", label: "Skills", text: "Figma" }], { ...profile, skills: [{ id: "s", name: "Figma" }, { id: "t", name: "Go" }] }, "skill:t");
    expect(units[0].text).toBe("Figma · Go");
    expect(changed).toBe("skills");
  });

  it("fills an empty line, and writes a line the resume doesn't have", () => {
    const from = { ...profile, interests: ["Bouldering"] };
    const { units } = add([{ id: "interests", label: "Interests", text: " " }], from, "interest:Bouldering");
    expect(units[0].text).toBe("Bouldering");
    const made = add([unit("summary"), unit("interests")], { ...profile, skills: [{ id: "s", name: "Go" }] }, "skill:s");
    expect(made.units[1]).toEqual({ id: "skills", label: "Skills", text: "Go" });
  });
});
