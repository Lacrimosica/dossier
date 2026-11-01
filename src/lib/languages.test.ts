import { describe, expect, it } from "vitest";

import { findLanguages, LANGUAGE_CODES, languageCode, languageName, spokenLanguageName } from "./languages";

describe("languageCode", () => {
  it("finds a language by its name in English, in another language, in itself, or by its code", () => {
    expect(languageCode("English")).toBe("en");
    expect(languageCode(" english ")).toBe("en");
    expect(languageCode("Inglese")).toBe("en");
    expect(languageCode("anglais")).toBe("en");
    expect(languageCode("Italiano")).toBe("it");
    expect(languageCode("Francese")).toBe("fr");
    expect(languageCode("Français")).toBe("fr");
    expect(languageCode("francais")).toBe("fr");
    expect(languageCode("فارسی")).toBe("fa");
    expect(languageCode("Persian")).toBe("fa");
    expect(languageCode("Farsi")).toBe("fa");
    expect(languageCode("Deutsch")).toBe("de");
    expect(languageCode("de")).toBe("de");
  });

  it("knows nothing it can't be sure of", () => {
    expect(languageCode("Klingon")).toBeNull();
    expect(languageCode("Engl")).toBeNull();
    expect(languageCode("  ")).toBeNull();
  });
});

describe("languageName", () => {
  it("names a language in a document's language, capitalised", () => {
    expect(languageName("en")).toBe("English");
    expect(languageName("en", "it")).toBe("Inglese");
    expect(languageName("en", "fr")).toBe("Anglais");
    expect(languageName("fa", "de")).toBe("Persisch");
    expect(languageName("it", "it")).toBe("Italiano");
  });

  it("names a profile language by its code, or as written without one", () => {
    expect(spokenLanguageName({ code: "nl", name: "Dutch" }, "it")).toBe("Olandese");
    expect(spokenLanguageName({ code: null, name: "Sicilian sign language" }, "it")).toBe("Sicilian sign language");
  });

  it("only offers codes it can name", () => {
    for (const code of LANGUAGE_CODES) expect(languageName(code)).not.toBe(code);
  });
});

describe("findLanguages", () => {
  it("finds a language however it's typed, with its English and own name", () => {
    expect(findLanguages("Ingl")[0]).toEqual({ code: "en", name: "English", native: "English" });
    expect(findLanguages("pers")[0]).toEqual({ code: "fa", name: "Persian", native: "فارسی" });
    expect(findLanguages("ital")[0].code).toBe("it");
  });

  it("puts a whole name before names that start with it", () => {
    expect(findLanguages("Dutch").map((match) => match.code)[0]).toBe("nl");
    expect(findLanguages("german").map((match) => match.code).slice(0, 1)).toEqual(["de"]);
  });

  it("finds nothing for nothing, and keeps to the limit", () => {
    expect(findLanguages(" ")).toEqual([]);
    expect(findLanguages("a", 5)).toHaveLength(5);
  });
});
