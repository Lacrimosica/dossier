# Languages as codes

Status: ready-for-agent

Tickets: `issues/01`–`03`, in order.

## Problem Statement

A language in the profile is free text, unique only ignoring case. Imports from resumes in different languages add the same language under different names: "English", "Italian", "French", "Persian" next to "Inglese", "Italiano", "Francese". Every resume then lists them twice. A resume written in Italian prints "English" because the profile does, and matching a posting's "Fluent Italian" fails when the profile says "Italiano".

## Solution

A language is stored as a language code (`en`, `it`, `fr`, `fa`), not a name. Adding one is picking it from a list you can search in any language ("Inglese", "English" and "anglais" all find `en`). Each document names it in its own language through `Intl.DisplayNames`: an Italian resume says "Inglese: madrelingua", an English one "English: Native". Existing languages are converted once; two that turn out to be the same are merged, keeping the higher level. A language the list doesn't know can still be added by name.

## User Stories

1. As a job seeker, I want "English" and "Inglese" to be one language in my profile, so that resumes don't list it twice.
2. As a job seeker, I want my existing duplicates merged automatically, keeping the higher level, so that I don't clean them by hand.
3. As a job seeker, I want to find a language by typing its name in English, in my own language or in itself, so that adding one is quick.
4. As a job seeker, I want each resume to name my languages in the resume's language, so that an Italian resume says "Inglese".
5. As a job seeker, I want importing a resume in any language to recognise languages I already have, so that imports stop adding duplicates.
6. As a job seeker, I want a posting's language requirement matched however either side names it, so that "Fluent Italian" finds "Italiano".
7. As a job seeker, I want to add a language that isn't in the list (a regional or sign language) by name, so that nothing I speak is left out.
8. As a job seeker, I want older data exports to import cleanly, so that backups still work.

## Implementation Decisions

- **Model.** `Language` gets `code String? @unique` (a BCP 47 language subtag, lower case, e.g. `en`, `fa`, `yue`). `name` stays for a language without a code and loses its unique index; uniqueness is by code, or by name ignoring case for those without one. Migration adds the column; the conversion is code, not SQL (below).
- **Lookup** (`src/lib/languages.ts`, pure, shared with the browser): a list of ISO 639-1 codes plus a few 639-3 ones people list on resumes; `languageName(code, locale)` with `Intl.DisplayNames` (falling back to English, then the code); `findLanguages(query)` for the picker, matching the name in English, in the UI's locales (`DOCUMENT_LANGUAGES`' tags) and in itself, ignoring case and accents; `languageCode(name)` for an exact match the same way, plus aliases Intl doesn't give ("Farsi", "Mandarin", "Flemish"). `languagesLine` names each language in `labels.locale`.
- **Converting existing data.** An idempotent `convertLanguages()` at startup (`instrumentation.ts`, next to the job recovery): for each row without a code whose name `languageCode` knows, set the code; when two rows share a code, keep the one with the higher level (then the lower `sort`), delete the other. Unknown names stay as they are. Logged as a count, never the names.
- **Profile screen.** The Languages card's text field becomes a combobox (`ui/` primitives) over `findLanguages`, showing each match's English name and its own name ("Persian · فارسی"), with "Add “…” as written" last for anything else. Adding a language already there updates its level, by code, as now (PRO-4). The list shows each language's English name, or its own name when it has no code.
- **Import.** `extract-profile` still returns names; `applyImportedProfile` maps them with `languageCode` and merges by code.
- **Matching.** `match-requirements` sends the profile's languages by English name and compares by code: a requirement's language (an English name) goes through `languageCode`.
- **Tailoring and the fact guard.** Tailored languages lines are already written from the profile in the resume's language. `guardSources` adds each language's name in the document's language, so a translated name isn't marked "check this".
- **Connector.** `get_profile` returns each language's English name and code; writing languages isn't a connector feature.
- **Export and import.** `data-export` includes `code`; `data-import` accepts files without it and converts names with `languageCode`, merging as at startup. Bump the export format version if it has one.
- **Demo and samples.** The demo seed and `language-samples.ts` use codes.

## Testing Decisions

- `languages.test.ts`: `languageCode` for "English", "Inglese", "anglais", "فارسی", "Farsi", "english " → the right code, unknown → null; `findLanguages` ranks a prefix match first; `languageName` in a few locales.
- `convertLanguages` (db): English + Inglese become one row with the higher level; an unknown name stays; running twice changes nothing.
- Languages card (component): typing "Ingl" offers English; adding a duplicate updates the level; "as written" adds a custom one.
- `profile-import-apply.db.test`: an imported "Italiano" merges with an existing `it`.
- `match-requirements`: "Italian" requirement covered by a profile `it` stored from "Italiano".
- `resume-content`/`document-labels`: an Italian resume names `en` "Inglese".
- `data-import.db.test`: an old export with "English" and "Inglese" imports as one language.
- E2E: the profile spec adds a language through the picker. axe covers the combobox.

## Out of Scope

- Dialects and scripts (`pt-BR`, `zh-Hant`) as separate entries: the base language only.
- Translating skills or other profile text.
- Reviewing languages in Review my profile: codes make duplicates impossible.
