# Profile review

Status: done

Tickets: `issues/01`–`04`, in order.

## Problem Statement

A profile collects mistakes over time. The same job gets added twice: once from an import and once by hand, or twice from two imports where the resume worded it differently ("Sr. Software Engineer" at "Acme Inc." and "Senior Software Engineer" at "ACME"). Import only treats two roles as the same when role and company match exactly, ignoring case. It also compares each new entry only with what was in the profile before the import, so a resume that lists a role twice adds it twice.

Other inconsistencies creep in the same way: an end date before the start, "current" ticked on a role that has ended, the same skill under two names ("JS" and "JavaScript"), a bullet repeated, an entry left empty. Each one makes every resume Dossier writes a little worse. Tailoring can't fix them, because it treats the profile as the truth.

Fixing them today means finding them by eye and merging by hand: copying bullets from one entry to the other, re-ticking skills, then deleting the spare. Nothing points them out.

## Solution

A **Review my profile** action on the profile screen. The AI reads the whole profile and proposes fixes: merge these two roles, correct these dates, combine these two skills, remove this empty entry. Each fix comes with a short reason.

Nothing changes on its own. The proposals open in a review dialog, one card per fix, showing before and after. The user applies or skips each one, or applies them all. Applying runs in one transaction. Skipped fixes are remembered and not proposed again.

The AI can only rearrange what is already in the profile. It chooses *what* to fix: which entries are the same, which one to keep. Code builds the result from the entries themselves, and checks every fix before the user sees it: ids must exist, and edits may only use values the entry already has. A fix that breaks those rules is dropped.

The review runs as a background job with progress steps, like a resume import, because it can take a while on a large profile.

## User Stories

1. As a job seeker, I want a "Review my profile" button on the profile screen, so that I can check my profile for mistakes whenever I like.
2. As a job seeker, I want the AI to find the same role entered twice, even when it's worded differently, so that duplicates from imports don't pile up.
3. As a job seeker, I want the AI to find the same project, degree or course entered twice, so that every section stays clean, not just experience.
4. As a job seeker, I want a proposed merge to keep every bullet and skill from both entries, without repeats, so that merging never loses anything I wrote.
5. As a job seeker, I want a merged entry to keep the earliest start and the latest end of the entries merged, so that the dates stay right.
6. As a job seeker, I want the AI to point out dates that contradict each other (an end before a start, "current" with an end date), so that my resume doesn't show impossible dates.
7. As a job seeker, I want the AI to find the same skill under two names, so that "JS" and "JavaScript" become one skill, linked to every role that used either.
8. As a job seeker, I want the AI to find bullets repeated inside one entry, so that a resume never says the same thing twice.
9. As a job seeker, I want the AI to find empty or near-empty entries, so that I can remove what an import left behind.
10. As a job seeker, I want each fix to come with a short reason in plain words, so that I understand why it's proposed.
11. As a job seeker, I want to see each fix as before and after, so that I know exactly what will change.
12. As a job seeker, I want to apply or skip each fix on its own, so that I keep the final say.
13. As a job seeker, I want an "Apply all" button, so that I don't have to click through many obvious fixes.
14. As a job seeker, I want skipped fixes not to be proposed again, so that two entries I've said are different stop coming back.
15. As a job seeker, I want to see a friendly message when the review finds nothing, so that I know my profile is in good shape.
16. As a job seeker, I want the review to run in the background with progress, so that I can keep using Dossier while it works.
17. As a job seeker, I want a fix to be skipped with a note if I've changed that entry since the review, so that an old proposal never overwrites a newer edit.
18. As a job seeker, I want a fix that would add a name, number, date or bullet not already in the entries it touches to be dropped, so that the review never invents facts, whatever the strict-mode setting.
19. (Merged into 18.)
20. As a job seeker, I want the AI never to rewrite my wording beyond merging and removing repeats, so that my profile still sounds like me.
21. As a job seeker, I want manually ordered sections to keep their order after a merge, so that the review doesn't undo my ordering.
22. As a job seeker without an AI provider set up, I want the button to explain that a provider is needed and link to Settings, so that I know why it's unavailable.
23. As a job seeker, I want the review's result deleted once I've applied or discarded it, so that a copy of my profile doesn't linger in a job.
24. As a job seeker, I want to be offered a review after a merge import, so that duplicates from that import get caught straight away.
25. As a job seeker using a screen reader, I want the review dialog and its cards fully labelled and keyboard-usable, so that it meets the same WCAG 2.2 AA bar as the rest.

## Implementation Decisions

**Domain term.** A **review** is one AI pass over the profile. It produces **fixes**. A fix is one proposed change: `merge`, `edit`, `delete` or `mergeSkills`.

**AI task.** A new task `review-profile` in `src/lib/ai/tasks/`, exported from the tasks index with `REVIEW_PROFILE_VERSION`. Its input is the whole profile, serialised by its own function, not by `profileForPrompt`, which leaves out courses hidden from resumes and is shaped for tailoring. Every experience, project, education, course and skill goes in with its id and all of its fields, plus the list of skipped fixes ("the user said these are fine"). Basics, facts, publications, references and languages are left out of the first version.

Its answer, checked with zod. It's four flat lists rather than one union, because small local models and strict JSON-schema modes handle plain objects best:

- `merges`: `section` (experience | projects | education | courses), `ids` (two or more), `keep` (one of `ids`), `bullets` (the bullets to keep, or null for all of them), `reason`
- `edits`: `section`, `id`, `dates` (or null), `bullets` (or null), `reason`
- `deletions`: `section`, `id`, `reason`
- `skillMerges`: `ids` (two or more skill ids), `keep` (one of `ids`), `reason`

The prompt asks only for the kinds of problem listed in the user stories.

**Building and checking fixes.** `src/lib/profile-review.ts` (pure, no db) takes the profile and the answer and returns the fixes to show, each with the entry as it will be after.

A merge is built in code, never written by the model:
- Text fields (role, company, name, school…) come from the kept entry; an empty one is filled from the first other entry that has it.
- Bullets: the ones the model chose, if every one of them is a bullet of the merged entries (ignoring case and spacing); otherwise all of them, repeats removed. Notes the same way, as one block per distinct note.
- Dates: the earliest start and the latest end; "current" when any of them is.
- Skills: every skill linked to any of them. "Show on resumes" (courses): on when any of them is.

An edit may only:
- change dates to years and months the entry already has (a swapped start and end, a dropped end), or clear them, or switch "current", and the result must make sense (start before end);
- keep a subset of the entry's bullets (removing repeats), in any order.

A fix is dropped when any id doesn't exist in its section, `keep` isn't one of `ids`, an id appears in an earlier fix, an edit breaks the rules above or changes nothing, or it matches a skipped fix. Because nothing new can get in, the fact guard isn't needed, whatever the strict-mode setting.

**Job.** A `review-profile` job in `src/lib/jobs/`, registered in `jobs/definitions.ts`, modelled on `import-profile`. Steps: "Reading your profile", "Looking for mistakes". Its result is the model's answer (shape-checked, nothing more) and when every entry was last saved (`updatedAt` by `section:id`). The fixes are never stored: the dialog and the apply action both rebuild them with `buildFixes` from the profile as it is then, so only values read from the database are ever written back. The job is deleted when the user applies or discards, and the retention sweep removes it if they never do. Starting a new review discards any earlier one.

**Applying.** A `applyProfileReview` Server Action in the profile `actions.ts` takes the job id and the fingerprints of the chosen fixes, rebuilds the fixes, and in one transaction (`settleProfileReview` in `src/lib/profile-review-apply.ts`):
- skips any fix whose entries' `updatedAt` has changed since the review, and counts them for the toast
- `merge`: updates the `keep` entry with `merged`, moves skill links from the others onto it (ignoring links it already has), deletes the others. Its `sort` stays, so manual order holds.
- `edit`: updates only the fields in `patch`
- `delete`: deletes the entry
- `mergeSkills`: keeps the skill with the chosen `name`, moves every `ExperienceSkill` and `ProjectSkill` link from the others onto it, deletes the others

Then it saves the fixes not applied to `reviewSkipped`, deletes the job, revalidates and toasts ("Applied 4 fixes. 1 was skipped because you changed that entry after the review.").

A `discardProfileReview` action deletes the job and also stores its fixes as skipped.

**Skipped fixes.** A new `reviewSkipped` setting in `settings.ts`: a list of fingerprints, `kind:section:sorted ids`, capped (say 200, oldest dropped first). A fingerprint whose ids no longer all exist is pruned whenever it's read. This is a setting, not a model, so data export and import already cover it.

**Profile screen.** A "Review my profile" button in the profile header, next to Import, disabled with an explanation when no AI provider is set up. It starts the job and opens the review on the profile screen with the shared `JobProgress` and `useJob`. When it's done:
- with fixes: a dialog lists one card per fix, showing the reason, a before and after view (for a merge, the entries side by side and the merged result), and an Apply/Skip toggle that starts on Apply. The footer has "Apply" (the chosen ones) and "Discard".
- without fixes: a toast, "Your profile looks consistent. Nothing to fix.", and the job is deleted.

After a merge import, the import's success toast offers "Review my profile".

**Errors.** AI failures surface the way import's do, with retry. An answer that fails the schema counts as a failure. An answer whose fixes are all dropped counts as "nothing to fix".

**Fakes.** `e2e/fake-ai.mts` answers review requests by merging the first two roles that share a company and the first two skills with the same name ignoring punctuation and ".js", so a spec gets fixes once it sets up such duplicates. The demo seed stays clean: the e2e spec adds its own duplicates.

**Docs.** DEVELOPMENT.md gets a "Profile review" section (task, job, checks, skipped fixes). README.md's profile bullet mentions it.

## Testing Decisions

A good test checks what a user can see: which fixes reach the dialog, what the profile looks like after applying them, what's remembered as skipped. It doesn't test the prompt's wording.

Seams, from highest to lowest:

- **Building and checking fixes (pure).** `profile-review.test.ts`: a merge combines text, bullets, dates and skills as described; an invented bullet falls back to all bullets; unknown id, `keep` outside `ids`, an edit with a new year or bullet, or nonsense dates each drop the fix; overlapping fixes keep the first; skipped fingerprints are filtered. This is the most important test, because it's what keeps the AI from changing facts.
- **Task.** `review-profile` answer parsing and the serialised profile (hidden courses included, every id present). Prior art: the extract-profile and tasks tests.
- **Applying (db).** `profile-review.db.test.ts`: a merge combines skill links and deletes the others, keeps `sort`; `mergeSkills` moves links from both experiences and projects; an entry edited after the review is skipped and counted; unchosen fixes land in `reviewSkipped`; the job is deleted. Prior art: `profile-import-apply.db.test.ts`.
- **Dialog (component).** Cards render reason and before/after, toggling Skip, "check this" mark, empty result toast. Prior art: `profile-import.test.tsx`.
- **E2E.** Start a review on the seeded duplicates with the fake AI, apply, and see one role and one skill left. The axe run in `e2e/accessibility.spec.ts` opens the dialog.

Coverage thresholds must not drop.

## Out of Scope

- Rule-based duplicate matching (normalising company suffixes and the like) without AI. The review needs an AI provider.
- Fixing import itself so that one file can't add the same role twice. Worth a separate small issue: it's a few lines in `profile-import-apply.ts`.
- Reviewing basics, facts, publications, references and languages.
- Rewriting or improving bullets, spelling or tone. The review fixes consistency, not style.
- Running reviews on a schedule or on every save.
- Undo after applying. Each fix is shown before and after, and applying is a deliberate step; a backup or data export covers the rest.
- Reviewing documents already written from the old profile.

## Further Notes

- Privacy: the review sends the whole profile to the AI provider, as tailoring already does. The job holding its result is deleted on apply or discard and swept like an import's. Fixes are never logged.
- The building and checks in `profile-review.ts` are the point of the design: the AI chooses *what* to fix, but the result can only be built from what the profile already says. That's what keeps Dossier's "zero invented facts" promise (PRD §12).
- Decided in triage (1 November 2026): toggles start on Apply; a merge import offers a review; the demo seed carries no duplicates.
- Related, separate: `.scratch/import-duplicates/` (one file adding the same role twice).
