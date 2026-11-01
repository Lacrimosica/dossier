import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { importedLanguages } from "@/lib/data-import";
import { createTestClient, resetDatabase } from "@/test/db";

import { convertLanguages } from "./language-data";

const db = createTestClient();

beforeEach(async () => {
  await resetDatabase(db);
});

afterAll(() => db.$disconnect());

const rows = () => db.language.findMany({ orderBy: { sort: "asc" }, select: { code: true, name: true, level: true } });

describe("convertLanguages (.scratch/language-codes)", () => {
  it("gives languages saved by name their codes, merging the same language under two names with the better level", async () => {
    await db.language.createMany({
      data: [
        { name: "English", level: "C1", sort: 0 },
        { name: "Italian", level: "NATIVE", sort: 1 },
        { name: "Inglese", level: "C2", sort: 2 },
        { name: "Italiano", level: "B1", sort: 3 },
        { name: "Klingon", level: "A1", sort: 4 },
      ],
    });
    expect(await convertLanguages(db)).toBe(4);
    expect(await rows()).toEqual([
      { code: "en", name: "English", level: "C2" },
      { code: "it", name: "Italian", level: "NATIVE" },
      { code: null, name: "Klingon", level: "A1" },
    ]);
    // Once is enough.
    expect(await convertLanguages(db)).toBe(0);
  });

  it("merges into a language that already has its code", async () => {
    await db.language.create({ data: { code: "fr", name: "French", level: "B1", sort: 1 } });
    await db.language.create({ data: { name: "Français", level: "C1", sort: 0 } });
    await convertLanguages(db);
    expect(await rows()).toEqual([{ code: "fr", name: "French", level: "C1" }]);
  });
});

describe("importedLanguages", () => {
  const at = new Date("2026-10-01T00:00:00Z");
  it("converts an older file's languages saved by name, one per code with the better level", () => {
    const file = [
      { id: "a", code: null, name: "English", level: "C1" as const, sort: 0, createdAt: at },
      { id: "b", code: null, name: "Inglese", level: "NATIVE" as const, sort: 1, createdAt: at },
      { id: "c", code: null, name: "Klingon", level: "A1" as const, sort: 2, createdAt: at },
      { id: "d", code: "fa", name: "Persian", level: "B2" as const, sort: 3, createdAt: at },
    ];
    expect(importedLanguages(file).map(({ id, code, name, level }) => ({ id, code, name, level }))).toEqual([
      { id: "a", code: "en", name: "English", level: "NATIVE" },
      { id: "c", code: null, name: "Klingon", level: "A1" },
      { id: "d", code: "fa", name: "Persian", level: "B2" },
    ]);
  });
});
