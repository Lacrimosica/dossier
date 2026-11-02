import { describe, expect, it } from "vitest";

import { demoProfile } from "@/lib/demo-profile";

import sample from "../../../prisma/seed/prototype-sample.json";

import { claimSources, factSources, guardSources, guardUnits, sourcesFor, unverifiedFacts } from "./fact-guard";

const profile = demoProfile();
const extracted = {
  title: "Senior Product Designer · Ledgerly",
  company: "Ledgerly",
  role: "Senior Product Designer",
  location: "Amsterdam",
  mode: "Hybrid · 3 days in office",
  salary: "€75,000–€90,000",
  deadline: "2026-10-15",
  requirements: [],
  asksForReferences: false,
  language: "English",
};
const sources = sourcesFor(profile, extracted, sample.ledgerly.posting, 11);
const check = (text: string) => unverifiedFacts(text, sources);

describe("the fact guard (E6-6)", () => {
  it("lets through what the profile says, however it's formatted", () => {
    expect(check("Led the redesign of a portal used by 4,000+ dispatchers")).toEqual([]);
    expect(check("Led the redesign of a portal used by 4000 dispatchers")).toEqual([]);
    expect(check("Grew the note-taking app to 120k users")).toEqual([]);
    expect(check("Designed the app to 120,000 users")).toEqual([]);
    expect(check("Product designer with nine years of experience")).toEqual([]);
    expect(check("Product designer with 9 years of experience")).toEqual([]);
    expect(check("Mentored three junior designers at Northwind Logistics since Mar 2021.")).toEqual([]);
    expect(check("Took Deque's course on WCAG 2.2 audits over 6 weekend sessions, and a UX Writing Workshop in London.")).toEqual([]);
  });

  it("flags numbers the profile doesn't back", () => {
    expect(check("Led a team of 12 designers")).toEqual(["12"]);
    expect(check("Cut support tickets by 30%")).toEqual(["30%"]);
    expect(check("Managed a budget of €2.5m")).toEqual(["2.5m"]);
  });

  it("flags employers, schools and tools that aren't in the profile or the posting", () => {
    expect(check("Before Northwind, I worked at Google and studied at Stanford.")).toEqual(["Google", "Stanford"]);
    expect(check("Built dashboards in Tableau and ran A/B tests in Optimizely")).toEqual(["Tableau", "Optimizely"]);
  });

  it("ignores capitals that start a sentence or a bullet, and months, and 'I'", () => {
    expect(check("Excited to apply. Happily, I'm based in Rotterdam.\n- Shipped the carrier portal in March")).toEqual([]);
    // A headline's focus after " · " starts afresh; a name there is still a name.
    expect(check("Senior Product Designer · Complex tools and design systems")).toEqual([]);
    expect(check("Senior Product Designer · Ex-Google")).toEqual(["Ex-Google"]);
  });

  it("knows the posting's own names and the years of experience the profile adds up to", () => {
    expect(check("I'd love to help Ledgerly's payments team in Amsterdam.")).toEqual([]);
    expect(check("Eleven years of design, 11 in total.")).toEqual([]);
    expect(check("Twenty years of design")).toEqual(["Twenty"]);
  });

  it("flags acronyms and credentials the profile doesn't have", () => {
    expect(check("An MBA and a certified scrum master")).toEqual(["MBA", "certified"]);
    expect(check("An MSc in Design for Interaction from TU Delft")).toEqual([]);
    expect(check("Knows WCAG 2.2 well")).toEqual([]);
  });

  it("flags years the profile doesn't have", () => {
    expect(check("Designing since 2015")).toEqual([]);
    expect(check("Designing since 2009")).toEqual(["2009"]);
  });

  it("takes the profile's facts and the application's as backing too (PRO-14, APP-15)", () => {
    const told = { ...profile, facts: [{ id: "f1", text: "I spent a year at Klarna before design school." }] };
    const claim = "A year at Klarna, and a talk at Config.";
    expect(unverifiedFacts(claim, sourcesFor(profile, extracted, sample.ledgerly.posting, 11))).toEqual(["Klarna", "Config"]);
    expect(unverifiedFacts(claim, sourcesFor(told, extracted, sample.ledgerly.posting, 11))).toEqual(["Config"]);
    expect(unverifiedFacts(claim, guardSources(told, extracted, sample.ledgerly.posting, ["I gave a talk at Config last year."]))).toEqual([]);
  });
});

describe("claimSources (.scratch/resume-tailoring)", () => {
  const asked = {
    ...extracted,
    requirements: [
      { text: "Prototyping in FigJam", kind: "skill" as const, skill: "FigJam", years: null, language: null },
      { text: "Runs services on Kubernetes", kind: "skill" as const, skill: "Kubernetes", years: null, language: null },
      { text: "Knows Terraform", kind: "skill" as const, skill: "Terraform", years: null, language: null },
    ],
  };
  const match = {
    items: [
      { requirement: "Prototyping in FigJam", result: "covered" as const, skill: "Figma", experienceIds: ["e1"], note: null },
      { requirement: "Runs services on Kubernetes", result: "gap" as const, skill: null, experienceIds: [], note: null },
      { requirement: "Knows Terraform", result: "partial" as const, skill: "Terraform", experienceIds: [], note: null },
    ],
  };
  const today = new Date(2026, 8, 28);

  it("backs the job's details and the skills the match found, by the posting's names, but not the posting's other words", () => {
    const sources = claimSources(profile, asked, match, [], today);
    expect(unverifiedFacts("Senior Product Designer for Ledgerly in Amsterdam", sources)).toEqual([]);
    expect(unverifiedFacts("Prototyped in FigJam, provisioned with Terraform, deployed on Kubernetes", sources)).toEqual(["Kubernetes"]);
    expect(unverifiedFacts("Paid small businesses across Europe", sources)).toEqual(["Europe"]);
    expect(unverifiedFacts("Eleven years of design", sources)).toEqual([]);
  });

  it("backs no skill without a match, and takes the facts", () => {
    expect(unverifiedFacts("Prototyped in FigJam at Klarna", claimSources(profile, asked, null, ["A year at Klarna."], today))).toEqual(["FigJam"]);
  });
});

describe("guardUnits", () => {
  it("notes what couldn't be backed on each unit, skipping units built from the profile", () => {
    const units = guardUnits(
      [
        { id: "summary", label: "Summary", text: "Led a team of 12 at Google." },
        { id: "experience:e1", label: "Northwind Logistics role", text: "Led the carrier portal redesign", unverified: ["old"] },
        { id: "skills", label: "Skills", text: "Kubernetes · Figma" },
      ],
      factSources(["Northwind Logistics", "Led the carrier portal redesign", "Figma"]),
    );
    expect(units).toEqual([
      { id: "summary", label: "Summary", text: "Led a team of 12 at Google.", unverified: ["Google", "12"] },
      { id: "experience:e1", label: "Northwind Logistics role", text: "Led the carrier portal redesign" },
      { id: "skills", label: "Skills", text: "Kubernetes · Figma" },
    ]);
  });
});
