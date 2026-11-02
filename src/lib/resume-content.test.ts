import { describe, expect, it } from "vitest";

import { documentLabels } from "@/lib/document-labels";
import { demoProfile, demoResumeUnits } from "@/lib/demo-profile";
import type { ProfileData } from "@/lib/profile";

import { contactItems, displayLink, resumeContent } from "./resume-content";

const today = new Date(2026, 8, 28);

/** Every company on the resume, whichever heading it's under. */
const companies = (content: ReturnType<typeof resumeContent>) => content.experience.flatMap((section) => section.companies);

describe("contactItems", () => {
  const { basics } = demoProfile();

  it("lists email, phone, city and country, website and LinkedIn", () => {
    expect(contactItems(basics, today)).toEqual([
      "jane.doe@example.com",
      "+31 6 1234 5678",
      "Rotterdam, Netherlands",
      "example.com",
      "linkedin.com/in/janedoe-example",
    ]);
  });

  it("adds the age or the date of birth only when chosen", () => {
    expect(contactItems({ ...basics, birthOnResumes: "age" }, today).at(-1)).toBe("Age 34");
    expect(contactItems({ ...basics, birthOnResumes: "age", dob: "" }, today)).toHaveLength(5);
    expect(contactItems({ ...basics, birthOnResumes: "date" }, today).at(-1)).toBe("Born April 18, 1992");
    expect(contactItems({ ...basics, birthOnResumes: "date" }, today, documentLabels("German")).at(-1)).toBe("Geboren am 18. April 1992");
    expect(contactItems({ ...basics, birthOnResumes: "date", dob: "" }, today)).toHaveLength(5);
  });

  it("skips what's empty", () => {
    expect(contactItems({ ...basics, phone: " ", city: "", website: "" }, today)).toEqual([
      "jane.doe@example.com",
      "Netherlands",
      "linkedin.com/in/janedoe-example",
    ]);
  });
});

describe("resumeContent", () => {
  const profile = demoProfile();

  it("builds the base resume from the profile", () => {
    const content = resumeContent(profile, { today });
    expect(content.name).toBe("Jane Doe");
    expect(companies(content).map((company) => [company.company, company.dates])).toEqual([
      ["Northwind Logistics", "Mar 2021 – Present"],
      ["Fieldnote", "Jun 2018 – Feb 2021"],
      ["Studio Brik", "Sep 2015 – May 2018"],
    ]);
    expect(companies(content)[0].roles[0].bullets).toHaveLength(3);
    expect(companies(content)[2].roles[0].skills).toEqual(["HTML & CSS", "Interaction design"]);
    expect(content.education[0]).toMatchObject({ dates: "2013 – 2015", notes: "Thesis on trust in automated scheduling tools" });
    expect(content.skills).toBe(
      "Interaction design · Design systems · Prototyping · User research · Figma · HTML & CSS · Workshop facilitation",
    );
    expect(content.languages).toBe("Dutch: Native · English: Fluent (C2) · German: Intermediate (B1)");
    expect(content.interests).toBe("Long-distance cycling · Risograph printing · Community garden volunteer");
  });

  it("includes references only when asked", () => {
    expect(resumeContent(profile).references).toEqual([]);
    expect(resumeContent(profile, { includeReferences: true }).references[0]).toEqual({
      id: "r1",
      name: "John Doe",
      role: "Former manager, Northwind Logistics",
      contact: "john.doe@example.com",
    });
  });

  it("leaves an empty profile empty, apart from a placeholder name", () => {
    const empty: ProfileData = {
      basics: { ...profile.basics, ...Object.fromEntries(Object.keys(profile.basics).map((key) => [key, ""])), birthOnResumes: "none" },
      skills: [],
      languages: [],
      interests: [],
      experience: [],
      experienceGroups: [],
      projects: [],
      education: [],
      courses: [],
      publications: [],
      references: [],
      facts: [],
      photo: null,
    };
    expect(resumeContent(empty)).toEqual({
      name: "Your name",
      headline: "",
      photo: null,
      contacts: [],
      summary: "",
      experience: [],
      projects: [],
      education: [],
      courses: [],
      publications: [],
      skills: "",
      languages: "",
      interests: "",
      references: [],
    });
  });

  it("takes a tailored resume's text from its units", () => {
    const content = resumeContent(profile, { units: demoResumeUnits() });
    expect(content.summary).toMatch(/^Senior product designer with nine years of making complex/);
    expect(companies(content)[0].roles[0].bullets[0]).toBe(
      "Led the redesign of the carrier portal used daily by 4,000+ dispatchers: a dense, high-stakes workflow",
    );
    // Role skills still come from the profile (RES-6).
    expect(companies(content)[0].roles[0].skills).toContain("Design systems");
    expect(content.skills).toMatch(/^Design systems · User research · Figma · /);
    expect(content.languages).toBe("Dutch: Native · English: Fluent (C2) · German: Intermediate (B1)");
    expect(content.interests).toBe("Long-distance cycling · Risograph printing · Community garden volunteer");
    // A tailored resume without an interests unit has none.
    expect(resumeContent(profile, { units: demoResumeUnits().filter((unit) => unit.id !== "interests") }).interests).toBe("");
  });

  it("takes the headline from a tailored resume's own, the profile's without one, and none when it was left out", () => {
    const units = demoResumeUnits();
    const withHeadline = (text: string | null) =>
      resumeContent(profile, { units: text === null ? units.filter((unit) => unit.id !== "headline") : units.map((unit) => (unit.id === "headline" ? { ...unit, text } : unit)) }).headline;
    expect(withHeadline(" Product Designer · Payments ")).toBe("Product Designer · Payments");
    // A version saved before resumes had their own headline.
    expect(withHeadline(null)).toBe(profile.basics.headline);
    expect(withHeadline("")).toBe("");
  });

  it("lays out projects like roles, with their link as a resume shows it (PRO-13)", () => {
    expect(resumeContent(profile).projects).toEqual([
      {
        id: "p1",
        name: "Tidewater design tokens",
        link: "github.com/janedoe/tidewater",
        dates: "Jan 2023 – Present",
        bullets: profile.projects[0].bullets.split("\n"),
        skills: ["Design systems", "Figma", "HTML & CSS"],
      },
    ]);
    expect(displayLink("https://www.example.com/work/")).toBe("example.com/work");
    expect(displayLink(" http://github.com/jane ")).toBe("github.com/jane");
    // A tailored resume takes a project's bullets from its unit, and leaves out one without a unit.
    const tailored = resumeContent(profile, { units: [{ id: "project:p1", label: "Tidewater project", text: "Shipped a token pipeline" }] });
    expect(tailored.projects.map((project) => project.bullets)).toEqual([["Shipped a token pipeline"]]);
    expect(resumeContent(profile, { units: [] }).projects).toEqual([]);
  });

  it("shows publications word for word, with their link, and not the ones kept off resumes (#218)", () => {
    expect(resumeContent(profile).publications).toEqual([
      {
        id: "u1",
        citation: profile.publications[0].citation,
        link: "doi.org/10.5555/12345678",
        href: "https://doi.org/10.5555/12345678",
      },
    ]);
    const hidden = { ...profile, publications: [{ ...profile.publications[0], onResumes: false }, { id: "u2", citation: " ", link: "", onResumes: true }] };
    expect(resumeContent(hidden).publications).toEqual([]);
    // A tailored resume takes the citation from its unit, and a DOI on its own opens at doi.org.
    const doi = { ...profile, publications: [{ ...profile.publications[0], link: "10.1038/s41388-024-03270-3" }] };
    expect(resumeContent(doi, { units: [{ id: "publication:u1", label: "Publication", text: "Doe, J. (2016). *Edited.*" }] }).publications).toEqual([
      { id: "u1", citation: "Doe, J. (2016). *Edited.*", link: "doi.org/10.1038/s41388-024-03270-3", href: "https://doi.org/10.1038/s41388-024-03270-3" },
    ]);
    expect(resumeContent(profile, { units: [] }).publications).toEqual([]);
  });

  it("lists courses & certificates apart from degrees, without the ones kept off resumes", () => {
    expect(resumeContent(profile).courses).toEqual([
      {
        id: "c1",
        name: "Accessibility for Designers",
        provider: "Deque University",
        dates: "Mar 2023 – May 2023",
        duration: "6 weekend sessions",
        link: "example.com/certificates/jane-doe-a11y",
        notes: "WCAG 2.2 audits of real product flows",
      },
      { id: "c2", name: "UX Writing Workshop", provider: "Content Design London", dates: "Oct 2021", duration: "2 days", link: "", notes: "" },
    ]);
    const hidden = { ...profile, courses: [{ ...profile.courses[0], onResumes: false }, { ...profile.courses[1], name: " " }] };
    expect(resumeContent(hidden).courses).toEqual([]);
  });

  it("gives a tailored resume only the courses it has units for, in their order, never a hidden one", () => {
    const units = [
      { id: "course:c2", label: "UX Writing Workshop", text: "Microcopy for forms" },
      { id: "course:c1", label: "Accessibility for Designers", text: "" },
    ];
    expect(resumeContent(profile, { units }).courses.map((entry) => [entry.id, entry.notes])).toEqual([
      ["c2", "Microcopy for forms"],
      ["c1", ""],
    ]);
    const hidden = { ...profile, courses: profile.courses.map((entry) => ({ ...entry, onResumes: entry.id !== "c2" })) };
    expect(resumeContent(hidden, { units }).courses.map((entry) => entry.id)).toEqual(["c1"]);
    expect(resumeContent(profile, { units: [] }).courses).toEqual([]);
  });

  it("includes only the parts a tailored resume has units for, in their order", () => {
    const units = [
      { id: "experience:e2", label: "Fieldnote role", text: "Ran research" },
      { id: "experience:e1", label: "Northwind Logistics role", text: "Led the portal redesign" },
      { id: "experience:gone", label: "Deleted role", text: "Ignored" },
      { id: "education:d1", label: "MSc", text: "" },
    ];
    const content = resumeContent(profile, { units });
    expect(content.summary).toBe("");
    expect(companies(content).map((company) => [company.company, company.roles[0].bullets])).toEqual([
      ["Fieldnote", ["Ran research"]],
      ["Northwind Logistics", ["Led the portal redesign"]],
    ]);
    expect(content.education.map((entry) => entry.school)).toEqual(["TU Delft"]);
    expect(content.skills).toBe("");
    expect(content.languages).toBe("");
  });
  describe("roles at one company", () => {
    // Jane was promoted at Northwind: the demo's first role, split in two.
    const [northwind, ...rest] = profile.experience;
    const promoted: ProfileData = {
      ...profile,
      experience: [
        { ...northwind, id: "senior", role: "Lead Product Designer", startYear: 2023, startMonth: 4 },
        ...rest,
        { ...northwind, id: "junior", company: "  northwind logistics", current: false, endYear: 2023, endMonth: 3 },
      ],
    };

    it("prints a company's roles together under it, with the span they cover", () => {
      const content = resumeContent(promoted, { today });
      expect(companies(content).map((company) => [company.company, company.dates, company.roles.map((role) => role.id)])).toEqual([
        ["Northwind Logistics", "Mar 2021 – Present", ["senior", "junior"]],
        ["Fieldnote", "Jun 2018 – Feb 2021", [rest[0].id]],
        ["Studio Brik", "Sep 2015 – May 2018", [rest[1].id]],
      ]);
      expect(companies(content)[0].roles.map((role) => role.dates)).toEqual(["Apr 2023 – Present", "Mar 2021 – Mar 2023"]);
    });

    it("groups a tailored resume's roles the same way, whatever the order of its units", () => {
      const units = [
        { id: "experience:junior", label: "Northwind", text: "Ran research" },
        { id: `experience:${rest[0].id}`, label: "Fieldnote", text: "Shipped" },
        { id: "experience:senior", label: "Northwind", text: "Led the team" },
      ];
      const content = resumeContent(promoted, { units });
      expect(companies(content).map((company) => company.roles.map((role) => role.bullets[0]))).toEqual([
        ["Ran research", "Led the team"],
        ["Shipped"],
      ]);
    });

    it("shows locations only when asked: once for a company in one place, on each role after a move", () => {
      expect(companies(resumeContent(promoted)).every((company) => !company.location && company.roles.every((role) => !role.location))).toBe(true);

      const shown = companies(resumeContent(promoted, { showLocations: true }))[0];
      expect(shown.location).toBe(northwind.location.trim());
      expect(shown.roles.map((role) => role.location)).toEqual(["", ""]);

      const moved = { ...promoted, experience: promoted.experience.map((role) => (role.id === "senior" ? { ...role, location: "Remote" } : role)) };
      const split = companies(resumeContent(moved, { showLocations: true }))[0];
      expect(split.location).toBe("");
      expect(split.roles.map((role) => role.location)).toEqual(["Remote", northwind.location.trim()]);
    });

    it("leaves a role without a location out of its company's places (.scratch/optional-role-fields)", () => {
      const remote = { ...promoted, experience: promoted.experience.map((role) => (role.id === "senior" ? { ...role, location: "  " } : role)) };
      const [company] = companies(resumeContent(remote, { showLocations: true }));
      expect(company.location).toBe(northwind.location.trim());
      expect(company.roles.map((role) => role.location)).toEqual(["", ""]);
    });
  });

  describe("experience groups (.scratch/experience-groups)", () => {
    const [northwind, fieldnote, brik] = profile.experience;
    const grouped: ProfileData = {
      ...profile,
      experienceGroups: [
        { id: "nonprofit", name: "Esperienze nel terzo settore" },
        { id: "tech", name: "  Esperienze professionali " },
      ],
      experience: [
        { ...northwind, groupId: "tech" },
        { ...fieldnote, groupId: "nonprofit" },
        { ...brik, groupId: null },
      ],
    };
    const headings = (content: ReturnType<typeof resumeContent>) =>
      content.experience.map((section) => [section.title, section.companies.map((company) => company.company)]);

    it("gives a profile without groups the one heading it always had", () => {
      const content = resumeContent(profile, {}, documentLabels("Italian"));
      expect(content.experience).toHaveLength(1);
      expect(content.experience[0]).toMatchObject({ groupId: null, title: "Esperienza professionale" });
    });

    it("puts each group under its own heading, as typed, in the groups' order, then the roles without one under Other experience", () => {
      expect(headings(resumeContent(grouped, {}, documentLabels("Italian")))).toEqual([
        ["Esperienze nel terzo settore", ["Fieldnote"]],
        ["Esperienze professionali", ["Northwind Logistics"]],
        ["Altre esperienze", ["Studio Brik"]],
      ]);
    });

    it("leaves out a group without roles, names an unnamed one like the section, and treats a removed group as none", () => {
      const content = resumeContent({
        ...grouped,
        experienceGroups: [{ id: "empty", name: "Volunteering" }, { id: "nonprofit", name: " " }],
      });
      expect(headings(content)).toEqual([
        ["Experience", ["Fieldnote"]],
        ["Other experience", ["Northwind Logistics", "Studio Brik"]],
      ]);
    });

    it("keeps a promotion together only within one group", () => {
      const split: ProfileData = {
        ...grouped,
        experience: [...grouped.experience, { ...northwind, id: "junior", groupId: "nonprofit", current: false, endYear: 2021, endMonth: 1 }],
      };
      expect(headings(resumeContent(split))).toEqual([
        ["Esperienze nel terzo settore", ["Fieldnote", "Northwind Logistics"]],
        ["Esperienze professionali", ["Northwind Logistics"]],
        ["Other experience", ["Studio Brik"]],
      ]);
    });

    it("titles an untitled career break in the resume's language, without a company or place, by date in its group", () => {
      const pause = { ...northwind, id: "pause", role: "", company: "Old employer", location: "Torino", careerBreak: true, groupId: "tech", startYear: 2026, startMonth: 1 };
      const content = resumeContent({ ...grouped, experience: [pause, ...grouped.experience] }, { showLocations: true }, documentLabels("Italian"));
      const [first] = content.experience.find((section) => section.groupId === "tech")!.companies;
      expect(first).toMatchObject({ company: "", location: "", roles: [{ id: "pause", role: "Pausa di carriera", location: "" }] });
      const titled = resumeContent({ ...grouped, experience: [{ ...pause, role: "Sabbatical" }] });
      expect(titled.experience[0].companies[0].roles[0].role).toBe("Sabbatical");
    });

    it("orders a tailored resume's headings by where their first role's unit is", () => {
      const units = [
        { id: `experience:${brik.id}`, label: "Studio Brik", text: "Built sites" },
        { id: `experience:${northwind.id}`, label: "Northwind", text: "Led the team" },
        { id: `experience:${fieldnote.id}`, label: "Fieldnote", text: "Ran research" },
      ];
      expect(headings(resumeContent(grouped, { units }))).toEqual([
        ["Other experience", ["Studio Brik"]],
        ["Esperienze professionali", ["Northwind Logistics"]],
        ["Esperienze nel terzo settore", ["Fieldnote"]],
      ]);
    });
  });
});
