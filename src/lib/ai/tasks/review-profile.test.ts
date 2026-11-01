import { describe, expect, it } from "vitest";

import { demoProfile } from "@/lib/demo-profile";
import { buildFixes } from "@/lib/profile-review";

import { MockProvider } from "../providers/mock";

import { reviewProfile, REVIEW_PROFILE_VERSION } from "./review-profile";

const options = { creativity: "EXPRESSIVE" as const, strict: true, language: null };
const base = demoProfile();
const [first] = base.experience;
// A copy of the first role, as a second import would add it, and a course kept off resumes.
const profile = {
  ...base,
  experience: [...base.experience, { ...first, id: "copy", role: first.role.toUpperCase() }],
  courses: [...base.courses, { ...base.courses[0], id: "hidden", name: "Hidden course", onResumes: false }],
};
const empty = { merges: [], edits: [], deletions: [], skillMerges: [] };

describe("reviewProfile", () => {
  it("sends every entry with its id and raw dates, hidden courses too, and nothing private", async () => {
    const provider = new MockProvider({ reply: () => empty });
    const { data, promptVersion } = await reviewProfile(provider, { profile, skipped: ["merge:experience:x,y"] }, options);
    expect(data).toEqual(empty);
    expect(promptVersion).toBe(REVIEW_PROFILE_VERSION);

    const call = provider.calls[0];
    const text = call.messages.map((message) => message.content).join("\n");
    expect(call.json?.name).toBe("profile_review");
    expect(call.system).toMatch(/promotion/);
    expect(text).toContain('"id": "copy"');
    expect(text).toContain(`"startYear": ${first.startYear}`);
    expect(text).toContain('"name": "Hidden course"');
    expect(text).toContain(`"id": "${base.skills[0].id}"`);
    expect(text).toContain('"alreadyChecked": [\n    "merge:experience:x,y"');
    for (const secret of [profile.basics.email, profile.basics.phone, ...profile.references.map((reference) => reference.name), ...profile.facts.map((fact) => fact.text)]) {
      expect(text).not.toContain(secret);
    }
  });

  it("answers what the model said, for buildFixes to build from the profile", async () => {
    const merges = [
      { section: "experience", ids: [first.id, "copy", "gone"], keep: first.id, bullets: null, reason: "Entered twice." },
      { section: "experience", ids: [first.id, "copy"], keep: "copy", bullets: null, reason: "Entered twice." },
    ];
    const provider = new MockProvider({ reply: () => ({ ...empty, merges }) });
    const { data } = await reviewProfile(provider, { profile, skipped: [] }, options);
    expect(buildFixes(profile, data)).toEqual([
      { kind: "merge", section: "experience", ids: [first.id, "copy"], keep: "copy", after: expect.objectContaining({ id: "copy", role: first.role.toUpperCase() }), reason: "Entered twice." },
    ]);
  });

  it("asks again when the answer doesn't have the shape", async () => {
    let calls = 0;
    const provider = new MockProvider({ reply: () => (++calls === 1 ? { merges: "none" } : empty) });
    await expect(reviewProfile(provider, { profile, skipped: [] }, options)).resolves.toMatchObject({ data: empty });
    expect(provider.calls).toHaveLength(2);
  });
});
