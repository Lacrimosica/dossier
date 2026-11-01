import { DOCUMENT_LANGUAGES } from "@/lib/document-language";

// Spoken languages as codes (.scratch/language-codes). A resume imported in
// Italian says "Inglese" where an English one says "English": both are `en`,
// so the profile holds the language once and each document names it in its
// own language. Names come from Intl.DisplayNames, on the server and in the
// browser alike.

/** ISO 639-1, plus a few ISO 639-3 languages people list on resumes that have no two-letter code. */
const CODES = [
  "aa ab af ak am an ar as av ay az ba be bg bi bm bn bo br bs ca ce ch co cr cs cv cy da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv",
  "ha he hi ho hr ht hu hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms",
  "mt my na nb nd ne ng nl nn no nr nv ny oc oj om or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti",
  "tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi yo za zh zu fil yue ckb prs haw gsw",
]
  .join(" ")
  .split(" ");

/** Names Intl doesn't give, as people write them. */
const ALIASES: Record<string, string> = {
  farsi: "fa",
  mandarin: "zh",
  "mandarin chinese": "zh",
  cantonese: "yue",
  flemish: "nl",
  castilian: "es",
  "brazilian portuguese": "pt",
  "swiss german": "gsw",
  sorani: "ckb",
};

const displays = new Map<string, Intl.DisplayNames>();
function display(locale: string): Intl.DisplayNames | null {
  if (!displays.has(locale)) {
    try {
      displays.set(locale, new Intl.DisplayNames([locale], { type: "language", fallback: "none" }));
    } catch {
      return null;
    }
  }
  return displays.get(locale)!;
}

const nameIn = (code: string, locale: string) => {
  try {
    return display(locale)?.of(code) ?? null;
  } catch {
    return null;
  }
};

/** The codes Intl can name, so none of them shows as a bare code. */
export const LANGUAGE_CODES: readonly string[] = CODES.filter((code) => nameIn(code, "en"));

/**
 * A language's name in a locale ("it" → "Inglese" for `en`), else in English,
 * else its code. Capitalised, as it starts an item wherever it's shown:
 * Italian and French write "inglese" and "anglais" in a sentence.
 */
export function languageName(code: string, locale = "en"): string {
  const name = nameIn(code, locale) ?? nameIn(code, "en") ?? code;
  return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
}

/** Lower case, without accents or extra spaces: "Français " → "francais". */
const normal = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

// Every language by its name in English, in each language documents are written in, and in itself.
const SEARCH_LOCALES = [...new Set(["en", ...DOCUMENT_LANGUAGES.map((language) => language.tag)])];
let index: Map<string, Set<string>> | null = null;
function names(): Map<string, Set<string>> {
  if (!index) {
    index = new Map(
      LANGUAGE_CODES.map((code) => [
        code,
        new Set([...SEARCH_LOCALES, code].flatMap((locale) => nameIn(code, locale) ?? []).map(normal)),
      ]),
    );
    for (const [alias, code] of Object.entries(ALIASES)) index.get(code)?.add(alias);
  }
  return index;
}

/** The code for a language's name in any of those languages, or its code ("Inglese", "en" → `en`); null when unknown. */
export function languageCode(name: string): string | null {
  const wanted = normal(name);
  if (!wanted) return null;
  if (LANGUAGE_CODES.includes(wanted)) return wanted;
  for (const [code, known] of names()) if (known.has(wanted)) return code;
  return null;
}

export type LanguageMatch = { code: string; name: string; native: string };

/** Languages for the picker: whole names first, then names that start with what was typed, then words that do. */
export function findLanguages(query: string, limit = 8): LanguageMatch[] {
  const wanted = normal(query);
  if (!wanted) return [];
  const scored = [...names()].flatMap(([code, known]) => {
    let best = Infinity;
    for (const name of known) {
      if (name === wanted) best = Math.min(best, 0);
      else if (name.startsWith(wanted)) best = Math.min(best, 1);
      else if (name.split(/[ ()-]/).some((word) => word.startsWith(wanted))) best = Math.min(best, 2);
    }
    return best < Infinity ? [{ code, best, name: languageName(code) }] : [];
  });
  return scored
    .sort((a, b) => a.best - b.best || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(({ code, name }) => ({ code, name, native: languageName(code, code) }));
}

/**
 * What a language typed or imported by name is stored as: its code and English
 * name when it's known ("Inglese" → `en`, "English"), else the name as written.
 */
export function spokenLanguage(name: string): { code: string | null; name: string } {
  const code = languageCode(name);
  return code ? { code, name: languageName(code) } : { code: null, name: name.trim() };
}

/** A profile language's name for a document in `locale`: its code's name there, or the name as written. */
export const spokenLanguageName = (language: { code?: string | null; name: string }, locale: string) =>
  language.code ? languageName(language.code, locale) : language.name;

/** Whether a profile language is the one a posting or model names, in any language: "Italiano" is `it`. */
export function isSpokenLanguage(language: { code?: string | null; name: string }, name: string): boolean {
  if (language.name.trim().localeCompare(name.trim(), undefined, { sensitivity: "accent" }) === 0) return true;
  return Boolean(language.code) && languageCode(name) === language.code;
}

/** A language's names in every language documents are written in and in itself, for the fact guard. */
export function languageNames(code: string): string[] {
  return [...new Set([...SEARCH_LOCALES, code].map((locale) => languageName(code, locale)))];
}
