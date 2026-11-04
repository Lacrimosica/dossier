import { describe, expect, it } from "vitest";

import { bulletLines, cleanSkills, cleanUnitText, isBulletUnit, sameSkills, targetName, unitName, unitSkills } from "./unit-text";

describe("unit text", () => {
  it("keeps bullets one per line, without bullet characters or empty lines", () => {
    expect(bulletLines("- Led the portal\n\n• Built the system\n2) Ran research\n* Mentored")).toBe(
      "Led the portal\nBuilt the system\nRan research\nMentored",
    );
  });

  it("leaves a hyphen that isn't a bullet alone", () => {
    expect(bulletLines("Front-end work\n-40% support tickets")).toBe("Front-end work\n-40% support tickets");
  });

  it("cleans a role's text as bullets and trims anything else", () => {
    expect(isBulletUnit("experience:e1")).toBe(true);
    expect(isBulletUnit("project:p1")).toBe(true);
    expect(isBulletUnit("summary")).toBe(false);
    expect(cleanUnitText("project:p1", "• Built it\n\n• Shipped it")).toBe("Built it\nShipped it");
    expect(cleanUnitText("experience:e1", " - One \n - Two ")).toBe("One\nTwo");
    expect(cleanUnitText("paragraph:1", "  First line.\n\nSecond.  ")).toBe("First line.\n\nSecond.");
  });
});

describe("unitName", () => {
  it("names a unit as a sentence would", () => {
    expect(unitName({ id: "summary", label: "Summary" })).toBe("summary");
    expect(unitName({ id: "sign-off", label: "Sign-off" })).toBe("sign-off");
    expect(unitName({ id: "paragraph:1", label: "Opening" })).toBe("opening paragraph");
    expect(unitName({ id: "paragraph:2", label: "Middle paragraph" })).toBe("middle paragraph");
    expect(unitName({ id: "experience:e1", label: "Northwind Logistics role" })).toBe("Northwind Logistics role");
    expect(unitName({ id: "education:d1", label: "MSc Design for Interaction" })).toBe("MSc Design for Interaction");
    expect(unitName({ id: "course:c1", label: "UX Writing Workshop" })).toBe("UX Writing Workshop");
    expect(unitName({ id: "course:c2", label: "" })).toBe("entry");
  });
});

describe("targetName", () => {
  it("names one part, or an employer's roles together", () => {
    expect(targetName([{ id: "summary", label: "Summary" }])).toEqual({ label: "Summary", name: "summary" });
    const roles = ["e1", "e2", "e3"].map((id) => ({ id: `experience:${id}`, label: "Northwind Logistics role" }));
    expect(targetName(roles)).toEqual({ label: "All 3 Northwind Logistics roles", name: "Northwind Logistics roles" });
    expect(targetName([{ id: "summary", label: "Summary" }, roles[0]])).toEqual({
      label: "Summary and Northwind Logistics role",
      name: "Summary and Northwind Logistics role",
    });
  });
});

describe("unitSkills", () => {
  const profile = {
    skills: [
      { id: "s1", name: "Figma" },
      { id: "s2", name: "Kotlin" },
    ],
    experience: [{ id: "e1", skillIds: ["s2", "s1"] }],
    projects: [{ id: "p1", skillIds: ["s1"] }],
  } as unknown as Parameters<typeof unitSkills>[1];

  it("follows the profile entry until the resume has its own", () => {
    expect(unitSkills({ id: "experience:e1" }, profile)).toEqual(["Kotlin", "Figma"]);
    expect(unitSkills({ id: "project:p1" }, profile)).toEqual(["Figma"]);
    expect(unitSkills({ id: "experience:e1", skills: [] }, profile)).toEqual([]);
    expect(unitSkills({ id: "experience:gone" }, profile)).toEqual([]);
    expect(unitSkills({ id: "summary" }, profile)).toBeNull();
  });

  it("cleans and compares lists", () => {
    expect(cleanSkills([" Figma ", "", "figma", "Kotlin"])).toEqual(["Figma", "Kotlin"]);
    expect(sameSkills(["A", "B"], ["A", "B"])).toBe(true);
    expect(sameSkills(["A", "B"], ["B", "A"])).toBe(false);
  });
});
