# One resume can add the same entry twice

Status: ready-for-agent

## Problem

Merging an imported resume matches each entry against the profile as it was before the import: `applyImportedProfile` in `src/lib/profile-import-apply.ts` loads `roles`, `known` (projects), `degrees`, `courses`, `publications` and `references` once, before its loops, and never adds what it creates to them. So a resume that lists the same role twice (a CV with a summary table and a detailed history, say, or an AI extraction that repeats one) adds both, even though a second import of the same file would match.

## Fix

Push each entry `create`d in those loops onto the list it's matched against, so a later entry from the same file matches it and is merged like any other match (the file's later copy fills what's empty, skills are added). The same for skills already works through `applySkills`.

Replace mode has the same gap and gets the same fix, since the lists start empty after the clear.

## Tests

In `profile-import-apply.db.test.ts`: an import listing one role (same role and company, different case), one project, one degree and one course twice each ends up with one of each, with the bullets and skills of the later copy merged in. Both merge and replace.

## Out of scope

Near-matches ("Sr." vs "Senior", "Acme Inc." vs "ACME"): that's the AI profile review (`.scratch/profile-review/`).
