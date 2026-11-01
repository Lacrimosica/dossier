import { describe, expect, it } from "vitest";

import { demoProfile } from "@/lib/demo-profile";
import type { CourseItem, ExperienceItem, ProfileData } from "@/lib/profile";

import { buildFixes, fixEntryKeys, fixFingerprint, MAX_FIXES, MAX_SKIPPED, rememberSkipped, type ReviewAnswer } from "./profile-review";

const role = (id: string, fields: Partial<ExperienceItem> = {}): ExperienceItem => ({
  id,
  role: "Senior Software Engineer",
  company: "Acme",
  location: "",
  startYear: 2021,
  startMonth: 3,
  endYear: null,
  endMonth: null,
  current: true,
  bullets: "",
  skillIds: [],
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
  onResumes: false,
  ...fields,
});

const profile = (fields: Partial<ProfileData>): ProfileData => ({
  ...demoProfile(),
  experience: [],
  projects: [],
  education: [],
  courses: [],
  skills: [],
  ...fields,
});

const answer = (fields: Partial<ReviewAnswer>): ReviewAnswer => ({ merges: [], edits: [], deletions: [], skillMerges: [], ...fields });
const merge = (ids: string[], keep = ids[0], bullets: string[] | null = null) => ({ section: "experience" as const, ids, keep, bullets, reason: "Same role." });

describe("buildFixes: merges", () => {
  const duplicates = profile({
    experience: [
      role("a", { role: "Sr. Software Engineer", company: "Acme Inc.", startYear: 2021, startMonth: 6, current: false, endYear: 2023, endMonth: 1, bullets: "Led the payments team\nShipped the new checkout", skillIds: ["s1"] }),
      role("b", { company: "ACME", location: "Berlin", startYear: 2020, startMonth: 11, bullets: "- Shipped the new  checkout\nHired four engineers", skillIds: ["s1", "s2"] }),
    ],
  });

  it("builds the merged entry from the entries: kept text, empty fields filled, every bullet once, widest dates, every skill", () => {
    const [fix] = buildFixes(duplicates, answer({ merges: [merge(["a", "b"])] }));
    expect(fix).toMatchObject({ kind: "merge", section: "experience", ids: ["a", "b"], keep: "a", reason: "Same role." });
    expect(fix.kind === "merge" && fix.after).toEqual({
      id: "a",
      role: "Sr. Software Engineer",
      company: "Acme Inc.",
      location: "Berlin",
      // The earliest start; "current" from b wins over a's end.
      startYear: 2020,
      startMonth: 11,
      endYear: null,
      endMonth: null,
      current: true,
      bullets: "Led the payments team\nShipped the new checkout\nHired four engineers",
      skillIds: ["s1", "s2"],
    });
  });

  it("keeps the bullets the model chose, in the profile's wording, but all of them when it made one up", () => {
    const chosen = buildFixes(duplicates, answer({ merges: [merge(["a", "b"], "b", ["hired four engineers", "Led the payments team"])] }));
    expect(chosen[0].kind === "merge" && chosen[0].after).toMatchObject({ id: "b", role: "Senior Software Engineer", bullets: "Hired four engineers\nLed the payments team" });

    const invented = buildFixes(duplicates, answer({ merges: [merge(["a", "b"], "a", ["Grew revenue by 40%"])] }));
    expect(invented[0].kind === "merge" && invented[0].after).toMatchObject({ bullets: "Led the payments team\nShipped the new checkout\nHired four engineers" });
  });

  it("takes the latest end when none is current, and combines notes and 'Show on resumes' for courses", () => {
    const ended = buildFixes(
      profile({ experience: [role("a", { current: false, endYear: 2022, endMonth: 4 }), role("b", { current: false, endYear: 2022, endMonth: null })] }),
      answer({ merges: [merge(["a", "b"])] }),
    );
    // A year without a month counts as its end: December.
    expect(ended[0].kind === "merge" && ended[0].after).toMatchObject({ endYear: 2022, endMonth: null, current: false });

    const courses = buildFixes(
      profile({ courses: [course("c", { notes: "Grade A" }), course("d", { notes: "grade a\n", onResumes: true, link: "https://example.com/cert", startYear: 2023, startMonth: 4 })] }),
      answer({ merges: [{ section: "courses", ids: ["c", "d"], keep: "c", bullets: null, reason: "" }] }),
    );
    expect(courses[0]).toMatchObject({ reason: "These look like the same entry." });
    expect(courses[0].kind === "merge" && courses[0].after).toEqual(
      course("c", { notes: "Grade A", onResumes: true, link: "https://example.com/cert", startYear: 2023, startMonth: 4 }),
    );
  });

  it("drops a merge with fewer than two entries, an unknown id, a keep outside its ids or entries from another section", () => {
    const fixes = buildFixes(
      duplicates,
      answer({
        merges: [merge(["a", "a"]), merge(["a", "zz"]), merge(["a", "b"], "zz"), { ...merge(["a", "b"]), section: "projects" }],
      }),
    );
    expect(fixes).toEqual([]);
  });
});

describe("buildFixes: edits", () => {
  const entry = role("a", { startYear: 2023, startMonth: 2, endYear: 2021, endMonth: 9, current: true, bullets: "Built the API\nbuilt the API\nWrote the docs" });
  const edit = (fields: Partial<ReviewAnswer["edits"][number]>) => ({ section: "experience" as const, id: "a", dates: null, bullets: null, reason: "Dates swapped.", ...fields });
  const dates = { startYear: 2021, startMonth: 9, endYear: 2023, endMonth: 2, current: false };

  it("swaps dates and removes repeated bullets using only what the entry has", () => {
    const [fix] = buildFixes(profile({ experience: [entry] }), answer({ edits: [edit({ dates, bullets: ["Built the API", "Wrote the docs"] })] }));
    expect(fix.kind === "edit" && fix.after).toEqual({ ...entry, ...dates, bullets: "Built the API\nWrote the docs" });
  });

  it("drops an edit with a new year or month, dates that still don't add up, an invented bullet or no change", () => {
    const fixes = buildFixes(
      profile({ experience: [entry] }),
      answer({
        edits: [
          edit({ dates: { ...dates, endYear: 2024 } }),
          edit({ dates: { ...dates, startMonth: 1 } }),
          edit({ dates: { ...dates, current: true } }),
          edit({ dates: { ...dates, startYear: 2023, endYear: 2021 } }),
          edit({ dates: { ...dates, startYear: null, startMonth: null } }),
          edit({ bullets: ["Built the API", "Won an award"] }),
          edit({ bullets: ["Built the API", "Wrote the docs"], section: "education" }),
          edit({}),
        ],
      }),
    );
    expect(fixes).toEqual([]);
  });

  it("can drop an end date, and gives a course no 'current'", () => {
    const [ended] = buildFixes(profile({ experience: [entry] }), answer({ edits: [edit({ dates: { startYear: 2023, startMonth: 2, endYear: null, endMonth: null, current: true } })] }));
    expect(ended.kind === "edit" && ended.after).toMatchObject({ endYear: null, endMonth: null, current: true });

    const [shortCourse] = buildFixes(
      profile({ courses: [course("c", { startYear: 2024, startMonth: 1, endYear: 2023, endMonth: 6 })] }),
      answer({ edits: [{ section: "courses", id: "c", dates: { startYear: 2023, startMonth: 6, endYear: 2024, endMonth: 1, current: true }, bullets: null, reason: "Swapped." }] }),
    );
    expect(shortCourse.kind === "edit" && shortCourse.after).toEqual(course("c", { startYear: 2023, startMonth: 6, endYear: 2024, endMonth: 1 }));
  });
});

describe("buildFixes: deletions, skills and the rules for every fix", () => {
  const skills = [
    { id: "s1", name: "JavaScript" },
    { id: "s2", name: "JS" },
    { id: "s3", name: "React" },
  ];

  it("deletes entries that exist and merges skills that exist", () => {
    const fixes = buildFixes(
      profile({ experience: [role("a"), role("b")], skills }),
      answer({
        deletions: [{ section: "experience", id: "b", reason: "Empty." }, { section: "experience", id: "zz", reason: "Empty." }],
        skillMerges: [
          { ids: ["s1", "s2"], keep: "s1", reason: "Same skill." },
          { ids: ["s3", "zz"], keep: "s3", reason: "" },
          { ids: ["s3", "s3"], keep: "s3", reason: "" },
        ],
      }),
    );
    expect(fixes).toEqual([
      { kind: "delete", section: "experience", id: "b", reason: "Empty." },
      { kind: "mergeSkills", ids: ["s1", "s2"], keep: "s1", reason: "Same skill." },
    ]);
  });

  it("puts each entry in one fix at most: the first wins", () => {
    const fixes = buildFixes(
      profile({ experience: [role("a"), role("b"), role("c")] }),
      answer({ merges: [merge(["a", "b"]), merge(["b", "c"])], deletions: [{ section: "experience", id: "a", reason: "" }, { section: "experience", id: "c", reason: "" }] }),
    );
    expect(fixes.map(fixFingerprint)).toEqual(["merge:experience:a,b", "delete:experience:c"]);
  });

  it("leaves out fixes the user skipped, whatever the order of their ids", () => {
    const skipped = [fixFingerprint({ kind: "merge", section: "experience", ids: ["b", "a"] }), fixFingerprint({ kind: "mergeSkills", ids: ["s2", "s1"] })];
    expect(skipped).toEqual(["merge:experience:a,b", "mergeSkills:skills:s1,s2"]);
    const fixes = buildFixes(
      profile({ experience: [role("a"), role("b")], skills }),
      answer({ merges: [merge(["a", "b"])], skillMerges: [{ ids: ["s1", "s2"], keep: "s2", reason: "" }] }),
      skipped,
    );
    expect(fixes).toEqual([]);
  });

  it("shows a reason in the review's own words, short, and no more than the most fixes", () => {
    const many = Array.from({ length: MAX_FIXES + 5 }, (_, index) => role(`r${index}`, { role: "", company: "" }));
    const fixes = buildFixes(
      profile({ experience: many }),
      answer({ deletions: many.map((entry, index) => ({ section: "experience" as const, id: entry.id, reason: index === 0 ? "x".repeat(400) : " " })) }),
    );
    expect(fixes).toHaveLength(MAX_FIXES);
    expect(fixes[0].reason).toHaveLength(300);
    expect(fixes[1].reason).toBe("This entry looks empty.");
  });
});

describe("rememberSkipped and fixEntryKeys", () => {
  it("keeps earlier fingerprints whose entries are all there, adds new ones once, and drops the oldest past the limit", () => {
    const known = profile({ experience: [role("a"), role("b")], skills: [{ id: "s1", name: "JS" }] });
    expect(rememberSkipped(known, ["merge:experience:a,b", "merge:experience:a,gone", "delete:skills:s1", "nonsense"], ["delete:experience:a", "merge:experience:a,b"])).toEqual([
      "merge:experience:a,b",
      "delete:skills:s1",
      "delete:experience:a",
    ]);
    const many = Array.from({ length: MAX_SKIPPED + 3 }, () => "delete:experience:a");
    const added = many.map((_, index) => `merge:experience:a,b${"".padEnd(index, ",a")}`);
    const kept = rememberSkipped(known, [], added);
    expect(kept).toHaveLength(MAX_SKIPPED);
    expect(kept.at(-1)).toBe(added.at(-1));
  });

  it("names the entries a fix changes, and none for skills", () => {
    expect(fixEntryKeys({ kind: "delete", section: "courses", id: "c", reason: "" })).toEqual(["courses:c"]);
    expect(fixEntryKeys({ kind: "mergeSkills", ids: ["s1", "s2"], keep: "s1", reason: "" })).toEqual([]);
  });
});
