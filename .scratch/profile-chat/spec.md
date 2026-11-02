# Add to the profile by chat

Status: done

## Problem Statement

Adding something small to the profile takes a lot of clicking. A new certificate means opening Courses, adding an entry, then filling in name, provider, month and year, and link one field at a time. A role you forgot means the same in Experience, plus bullets and skills. A fact about yourself ("I can start in January", "I hold a B driving licence") goes in Facts. People often think of these things in passing, mid-search, and would rather just say them: "add my AWS Solutions Architect cert, March 2025" or "I volunteered at the food bank from 2019 to 2021, organising weekly shifts for 30 people".

Importing a resume handles text in bulk, but it wants a whole resume and a preview round trip. The Claude connector can read the profile (`get_profile`), but it can't write to it, so asking Claude "add this to my Dossier profile" fails there too.

## Solution

Two ways in, both writing through the same checked **profile changes**:

1. **Chat on the profile page.** An "Add with AI" panel on `/profile` where the person describes what to add or fix in plain words. The AI answers briefly and proposes changes as cards ("Add course: AWS Solutions Architect – Associate, Amazon Web Services, 03/2025"). Each card can be applied, edited or dismissed, and nothing is saved until the person applies it. An applied change can be undone. When something needed is missing (an end date, the issuer), the AI asks instead of guessing.
2. **`update_profile` in the Claude connector.** Claude, working from the person's own words in its chat, sends the same kind of changes. Dossier checks and applies them and answers with what it did and a link to the profile.

The AI only structures what the person said. It never invents employers, dates, numbers or degrees, and it never deletes anything.

## User Stories

### Chat on the profile page

1. As a job seeker, I want to type "add my AWS Solutions Architect cert from March 2025" and get a ready-made course entry, so that I don't fill in a form field by field.
2. As a job seeker, I want to describe a past role in a sentence or two and get an experience entry with role, company, dates and bullets, so that forgotten work is quick to add.
3. As a job seeker, I want to say a fact about myself ("I can relocate within the EU") and have it saved as a profile fact, so that tailoring can use it.
4. As a job seeker, I want to add skills, languages and interests by naming them, so that I don't hunt for the right card.
5. As a job seeker, I want to change an existing entry by describing it ("my Acme role ended in June 2024, not May"), so that small fixes don't need the editor.
6. As a job seeker, I want to add a bullet to an existing role ("add to my Acme job that I led the migration to Postgres"), so that achievements I remember later land in the right place.
7. As a job seeker, I want the AI to ask me when something it needs is missing, so that it never fills a gap with a guess.
8. As a job seeker, I want every proposed change shown as a card before anything is saved, so that the AI never edits my profile on its own.
9. As a job seeker, I want to edit a proposed change before applying it, so that I can fix a wrong month or wording without starting over.
10. As a job seeker, I want to apply one change, or all of them at once, so that a long message doesn't mean many clicks.
11. As a job seeker, I want to undo an applied change from the toast, so that a slip isn't permanent.
12. As a job seeker, I want an applied change to show up in its profile section straight away, so that I can see where it went.
13. As a job seeker, I want an edit to an entry I changed meanwhile to be refused with a plain message, so that the chat never overwrites newer work.
14. As a job seeker, I want words in a change that I didn't say (a company name, a number) to be marked "Check this", so that a slip by the model is easy to spot.
15. As a job seeker in strict mode, I want such changes held back until I edit or confirm them, so that strict mode keeps meaning no invented facts.
16. As a job seeker using a local model, I want the chat to work with whichever AI provider I set up, so that nothing leaves my machine unless I chose that.
17. As a job seeker, I want the conversation to be forgotten when I close the panel, so that no chat log about me piles up.
18. As a job seeker without an AI provider set up, I want the panel to say so and link to Settings, so that I know why it can't answer.
19. As a keyboard or screen-reader user, I want the panel, its cards and their buttons to be reachable and announced, so that I can use it like the rest of the app.

### Claude connector

20. As a job seeker using Claude, I want to say "add this certificate to my Dossier profile" and have Claude save it, so that I don't switch to the app for small additions.
21. As a job seeker, I want Claude to read my profile first and change existing entries by their ids, so that it doesn't add duplicates.
22. As a job seeker, I want the tool to answer with what was added or changed, what it refused and why, and a link to the profile, so that Claude can tell me exactly what happened.
23. As a job seeker, I want names or numbers Dossier couldn't find in what was sent flagged back to Claude, so that it asks me to check them.
24. As a job seeker, I want the tool to never delete anything, so that a confused chat can't wipe my history.

## Implementation Decisions

**Domain term.** A **profile change** is one checked addition or edit to the profile, proposed by the AI or sent by the connector, and applied only through `applyProfileChanges`. User-facing copy says "change". Add it to GLOSSARY.md.

**Change types** (`src/lib/profile-changes.ts`, pure, shared with the browser):
- `add` with a `section` and the entry's fields, for `experience`, `projects`, `education` and `courses`. The fields are the same as an imported entry (`importedProfileSchema` in `profile-import.ts`), without `unverified`. Certificates are courses: Courses already holds "courses & certificates" (provider, dates, duration, link, notes).
- `edit` with a `section`, an entry `id`, and only the fields to change. Dates count as one field (`startYear`, `startMonth`, `endYear`, `endMonth`, `current` together).
- `addBullets` with a `section` (`experience` or `projects`), an `id` and the new bullets, added after the entry's own.
- `addSkills`, `addLanguages` (name and level), `addInterests`, `addFacts` (profile facts, `applicationId` null) and `setBasics` (`headline`, `summary`, and `city` and `country` only; contact details stay with the editor).
- No deletions, no groups, no references, no publications, no photo. Those stay in the editor (Out of Scope).

**Checking** (`checkProfileChanges(profile, changes)`, pure): drops what can't apply and says why, in plain words: an unknown id or one from another section, an `edit` that changes nothing, impossible dates (end before start, month out of range, both an end and `current`), a skill or language the profile already has (it becomes a no-op with no error), more than `MAX_CHANGES` (20) changes. It also enforces the existing limits (facts' `MAX_FACTS`, text lengths in the profile actions' schemas). Courses and experience added with the same name and company as an existing entry become an `edit` of it, matching import's `sameName` rule, so the chat and the connector can't make duplicates.

**Unverified words.** `unverifiedFacts` from `src/lib/ai/fact-guard.ts`, with the person's words as the source (their chat messages, or what the connector sent for the connector), marks names and numbers in a change that aren't there. In the panel the card says "Check this" with the words. In strict mode, such a card's Apply is off until the person edits the change or ticks "This is right". The connector returns them as `check_these`.

**Applying** (`src/lib/profile-changes-apply.ts`, `server-only`): `applyProfileChanges(db, changes, versions)` runs one transaction and reuses the import's helpers (skill linking, `findOrCreateSkill`, `findSpokenLanguage`, the sort helpers in `profile-entries.ts`, the section order settings), so an added entry lands where an imported one would. An `edit` or `addBullets` whose entry's `updatedAt` differs from the version the proposal was made against is skipped and reported (story 13), like profile review does with `entryVersions`. It returns what each change did and what's needed to undo it: the created ids for added entries, and the earlier fields for edits.

**Undo.** `undoProfileChanges` deletes what was added and puts back the earlier fields of what was edited, unless the entry changed again since. It reuses the existing `restore*` patterns where they fit. Skills, languages, interests and facts that were added are removed only if nothing else links to them.

**AI task** (`src/lib/ai/tasks/profile-chat.ts`, `PROFILE_CHAT_VERSION = "profile-chat@1"`): sends the profile with ids (as `profileForPrompt`, without contact details, references or photo), the person's facts, today's date, and the conversation so far (the last 20 turns, capped in characters for local models). It answers:
```ts
{ reply: string; changes: ProfileChange[]; question: boolean }
```
`question` is true when the reply asks for something missing, and then `changes` holds only what's already certain. The instructions: use only the person's words; never invent employers, dates, numbers, degrees or skills; ask when a needed field is missing (a role without a company, a course without a name); prefer editing an existing entry over adding a near-duplicate; write bullets with the existing `BULLET_RULES`, `NO_EM_DASHES` and `PLAIN_WORDING`, in the profile's language; refuse anything that isn't about the profile (`declined`-style, as `refine-chat` does), with a short reply. The model's changes go through `checkProfileChanges` before anything is shown. Exported from the tasks index.

**Job** (`src/lib/jobs/profile-chat.ts`, registered in `definitions.ts`): local models are slow, so a message runs as a background job like `refine`. Its input is the conversation and the entry versions it was asked against, and its result is the reply, the checked changes and their unverified words. The panel deletes the job once it has shown the answer, and retention sweeps any left over. Only one runs at a time (a new message cancels the earlier one).

**Actions** (`src/app/(app)/profile/actions.ts`): `sendProfileChat` (starts the job), `applyProfileChangesAction` (checks again against the profile as it is now, then applies) and `undoProfileChangesAction`. Every one goes through `action()`, and the errors are `ActionError`s with the usual friendly copy.

**Panel** (`src/app/(app)/profile/profile-chat.tsx`): an "Add with AI" button in the profile header opens a side panel (a sheet on narrow screens) built from `ui/` primitives, following `refine-panel.tsx`. It has the messages, a text box (Enter sends, Shift+Enter is a new line), progress while the job runs, and under each AI reply its change cards. A card names the section and shows the entry as it will read, or for an edit the fields before and after. It has Apply, Edit (an inline form reusing that section's fields) and Dismiss, plus "Apply all" when there are several. After applying, the card shows "Added" or "Changed" with a link that scrolls to and highlights the entry, and the toast offers Undo. The conversation lives in the component's state only and is gone when the panel closes (story 17). With no AI provider set up, the panel shows the same notice the other AI features show.

**Connector** (`src/lib/connector/tools.ts`): a new `update_profile` tool with `annotations: { readOnlyHint: false, destructiveHint: false }`. Its input is `{ changes: ProfileChange[], words: string }`, where `words` is what the user said, used as the source for unverified words. Its description says to call `get_profile` first, use the ids from it, only use what the user said, and ask the user when something is missing. It checks, applies with versions read in the same transaction, and answers `{ applied, refused: [{ change, reason }], check_these, link }`. `get_profile`'s answer already has the ids it needs; its description gains a line pointing to `update_profile`. The server instructions in the connector mention it.

**Fakes.** `e2e/fake-ai.mts` gains a `profile_chat` answer: a message containing "certificate" proposes one course, one containing "when" gets a question back, anything else gets a short reply and no changes.

**Docs.** DEVELOPMENT.md gains a "Profile chat" section next to "Profile review", covering the change types, checking, applying and undo, the job, and the connector tool. README.md mentions both ways in under the profile features. Data export and import need no change because nothing new is stored.

## Testing Decisions

Test what you can see from outside, at the highest seam that exists.

- **Checking (pure, `profile-changes.test.ts`).** Every reason a change is dropped. An add matching an existing entry becomes an edit. Known skills and languages become no-ops. Date rules. The cap. Prior art: `profile-review.test.ts`.
- **Applying and undo (db, `profile-changes-apply.db.test.ts`).** Each change type lands with the right sort under both manual and date order. Skills get linked. A stale edit is skipped and reported. Undo removes adds and restores edits, and leaves alone an entry changed since. Prior art: `profile-import-apply.db.test.ts`, `profile-review-apply.db.test.ts`.
- **AI task (`profile-chat.test.ts`).** What's sent: no contact details, references or photo, and the turns are capped. The answer goes through `checkProfileChanges`. Unverified words are worked out from the person's messages. Prior art: `review-profile.test.ts`.
- **Job and actions (db).** The job's result shape. Apply re-checks against the current profile. Strict mode refuses a change with unverified words unless it's confirmed.
- **Connector (db, `tools.db.test.ts`).** `update_profile` applies, refuses with reasons, returns `check_these`, and never deletes.
- **Panel (component, `profile-chat.test.tsx`).** Cards render per change type. Apply, Edit and Dismiss work. "Apply all" works. Undo from the toast works. Apply is disabled in strict mode for an unverified card. Closing forgets the chat.
- **End to end.** `e2e/profile-chat.spec.ts`: send "add my certificate…", apply the card, see it in Courses, undo it. `e2e/accessibility.spec.ts` covers the open panel with a card.

## Out of Scope

- Deleting entries, references, publications, photo, contact details and groups through chat or the connector. The editor and profile review do these.
- Keeping chat history between visits.
- Reading files in the chat (a certificate PDF, a LinkedIn export). Import covers files.
- Chat that rewrites the whole profile or restyles every bullet. That's a different feature, and closer to profile review.
- A connector tool to undo. The person undoes in the app, or asks Claude to send an edit.

## Further Notes

Requested by the user ("a small chat box for adding experiences or certificates or facts about me to the profile through AI… sort of like an MCP"). Decisions made while writing this, open to change at triage: changes are confirmed per card in the app, but applied straight away by the connector (Claude asks the user in its own chat, and every write shows in the profile with its link); certificates stay in Courses; no deletions; the chat isn't stored.

Suggested order: 01 changes core → 02 connector tool (usable on its own) → 03 AI task → 04 job and actions → 05 panel → 06 e2e and docs.
