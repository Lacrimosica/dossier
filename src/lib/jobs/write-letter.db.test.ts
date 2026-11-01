import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { MockProvider } from "@/lib/ai/providers/mock";
import { createTestClient, resetDatabase } from "@/test/db";

import { seedBuiltIns } from "../../../prisma/seed/built-ins";

import { writeLetterJob } from "./write-letter";

const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});
const provider = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("@/lib/ai", () => ({ getAiProvider: async () => provider.current }));
vi.mock("@/lib/ai/task-options", () => ({ loadTaskOptions: async () => ({ creativity: "BALANCED", strict: false, language: null }) }));
vi.mock("@/lib/profile-data", async () => {
  const { demoProfile } = await import("@/lib/demo-profile");
  return { loadProfile: async () => demoProfile(), loadFactTexts: async () => [] };
});
vi.mock("./runner", () => ({ defineJob: <T,>(definition: T) => definition }));

const prisma = () => db.client!;
const context = { id: "test-job", step: async () => {}, signal: new AbortController().signal };
const where = { applicationId_kind: { applicationId: "app-1", kind: "COVER_LETTER" as const } };
const resume = [{ id: "summary", label: "Summary", text: "Product designer who ships calm payments flows." }];
const answer = {
  recipient: "Ledgerly · Hiring team",
  greeting: "Dear Ledgerly team,",
  paragraphs: [{ label: "Opening", text: "Payments are where trust is won." }],
  signOff: "Warm regards,",
};

beforeEach(async () => {
  await resetDatabase(prisma());
  await seedBuiltIns(prisma());
  await prisma().application.create({
    data: {
      id: "app-1",
      company: "Ledgerly",
      role: "Senior Product Designer",
      location: "Amsterdam",
      language: "English",
      tone: "FORMAL",
      postingText: "Ledgerly is hiring a Senior Product Designer.",
      documents: { create: [{ kind: "RESUME", units: resume, themeId: "modern" }] },
    },
  });
});
afterAll(() => prisma().$disconnect());

describe("writeLetterJob", () => {
  it("writes the letter from the resume as it is, framed, in the resume's theme, with a version", async () => {
    const mock = new MockProvider({ reply: () => answer });
    provider.current = mock;
    const { units } = await writeLetterJob.run({ applicationId: "app-1" }, context);

    const prompt = mock.calls[0].messages.map((message) => message.content).join("\n");
    expect(prompt).toContain("Summary: Product designer who ships calm payments flows.");
    expect(mock.calls[0].system).toMatch(/Tone: Formal\./);
    // The sender, date and signature come from the profile, as at creation (E8-11).
    expect(units.map((unit) => unit.id)).toEqual(["sender", "date", "recipient", "greeting", "paragraph:1", "sign-off", "signature"]);
    const letter = await prisma().document.findUniqueOrThrow({ where, include: { versions: true } });
    expect(letter).toMatchObject({ units, themeId: "modern", writtenWith: "write-cover-letter@6" });
    expect(letter.versions.map((version) => version.cause)).toEqual(["WRITTEN"]);
  });

  it("keeps a letter written meanwhile, without asking the AI", async () => {
    const existing = [{ id: "paragraph:1", label: "Opening", text: "Written in another tab." }];
    await prisma().document.create({ data: { applicationId: "app-1", kind: "COVER_LETTER", units: existing } });
    const mock = new MockProvider({ reply: () => answer });
    provider.current = mock;
    expect(await writeLetterJob.run({ applicationId: "app-1" }, context)).toEqual({ units: existing });
    expect(mock.calls).toHaveLength(0);
  });
});
