import { describe, expect, it } from "vitest";

import { LanguageLevel } from "@/generated/prisma/enums";
import { demoProfile } from "@/lib/demo-profile";

import { MockProvider } from "../providers/mock";

import { profileChat, PROFILE_CHAT_VERSION, recentTurns, type ProfileChatAnswer } from "./profile-chat";

const options = { creativity: "EXPRESSIVE" as const, strict: true, language: null };
const base = demoProfile();
// A course kept off resumes, which the chat still sees, so it can be corrected.
const profile = { ...base, courses: [...base.courses, { ...base.courses[0], id: "hidden", name: "Hidden course", onResumes: false }] };
const [first] = profile.experience;

const empty: ProfileChatAnswer = {
  reply: "",
  question: false,
  declined: false,
  addExperience: [],
  addProjects: [],
  addEducation: [],
  addCourses: [],
  edits: [],
  addBullets: [],
  skills: [],
  languages: [],
  interests: [],
  facts: [],
  basics: [],
};
const said = (text: string) => [{ role: "user" as const, text }];

describe("profileChat", () => {
  it("sends every entry with its id and raw dates, and nothing private", async () => {
    const provider = new MockProvider({ reply: () => ({ ...empty, reply: "Hi" }) });
    const { data, promptVersion } = await profileChat(provider, { turns: said("Hello"), profile, today: new Date(2026, 10, 2) }, options);
    expect(data).toEqual({ reply: "Hi", question: false, declined: false, changes: [], refused: [] });
    expect(promptVersion).toBe(PROFILE_CHAT_VERSION);

    const call = provider.calls[0];
    const text = call.messages.map((message) => message.content).join("\n");
    expect(call.json?.name).toBe("profile_chat");
    expect(text).toContain("Today is 2026-11-02.");
    expect(text).toContain(`"id": "${first.id}"`);
    expect(text).toContain(`"startYear": ${first.startYear}`);
    expect(text).toContain('"name": "Hidden course"');
    expect(call.messages.at(-1)).toEqual({ role: "user", content: "Hello" });
    for (const secret of [profile.basics.email, profile.basics.phone, profile.basics.name, ...profile.references.map((reference) => reference.name)]) {
      expect(text).not.toContain(secret);
    }
  });

  it("turns the answer into checked changes, marking what the candidate didn't say", async () => {
    const provider = new MockProvider({
      reply: () => ({
        ...empty,
        reply: "Here's your certificate.",
        addCourses: [{ name: "AWS Solutions Architect", provider: "Amazon Web Services", duration: "", link: "", notes: "", startYear: 2025, startMonth: 3, endYear: null, endMonth: null }],
        edits: [
          { section: "experience", id: first.id, field: "endYear", value: "2026" },
          { section: "experience", id: first.id, field: "current", value: "false" },
          { section: "experience", id: "gone", field: "role", value: "X" },
          { section: "courses", id: "hidden", field: "startYear", value: "soon" },
        ],
        skills: ["AWS"],
        languages: [{ name: "Italian", level: LanguageLevel.B1 }],
      }),
    });
    const { data } = await profileChat(provider, { turns: said("I got my AWS Solutions Architect cert from Amazon in March 2025, and I left in 2026."), profile }, options);
    expect(data.changes.map(({ change }) => change.kind)).toEqual(["add", "edit", "addSkills", "addLanguages"]);
    expect(data.changes[0]).toEqual({ change: expect.objectContaining({ section: "courses" }), unverified: expect.arrayContaining(["Services"]) });
    expect(data.changes[1]).toEqual({ change: { kind: "edit", section: "experience", id: first.id, entry: { endYear: 2026, current: false } }, unverified: [] });
    expect(data.refused).toEqual([{ change: expect.objectContaining({ id: "gone" }), reason: "That role isn't in your profile any more." }]);
  });

  it("makes no changes when it declines", async () => {
    const provider = new MockProvider({ reply: () => ({ ...empty, declined: true, reply: "I can only help with your profile.", skills: ["Cooking"] }) });
    const { data } = await profileChat(provider, { turns: said("What's the weather?"), profile }, options);
    expect(data).toMatchObject({ declined: true, changes: [] });
  });
});

describe("recentTurns", () => {
  it("keeps the last turns within the limit, and always the newest", () => {
    const turns = Array.from({ length: 30 }, (_, index) => ({ role: "user" as const, text: `Message ${index}` }));
    expect(recentTurns(turns)).toHaveLength(20);
    expect(recentTurns(turns).at(-1)?.text).toBe("Message 29");
    const long = [{ role: "user" as const, text: "a".repeat(8_000) }, { role: "assistant" as const, text: "b".repeat(8_000) }, { role: "user" as const, text: "c".repeat(20_000) }];
    expect(recentTurns(long)).toEqual([{ role: "user", text: "c".repeat(12_000) }]);
  });
});
