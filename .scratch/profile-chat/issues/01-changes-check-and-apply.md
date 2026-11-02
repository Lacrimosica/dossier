# 01 — Profile changes: types, checking, applying and undo

Status: done

Spec: `../spec.md` ("Change types", "Checking", "Unverified words", "Applying", "Undo").

## What

- `src/lib/profile-changes.ts` (pure, browser-safe): the `ProfileChange` zod schema and type, `MAX_CHANGES`, and `checkProfileChanges(profile, changes)`, which returns `{ changes, refused: { change, reason }[] }`. Adds that match an existing entry become edits, and known skills and languages become no-ops.
- `src/lib/profile-changes-apply.ts` (`server-only`): `applyProfileChanges(db, changes, versions)` in one transaction, reusing the import's helpers (`profile-import-apply.ts`, `profile-entries.ts`) and `entryVersions` from `profile-review-apply.ts`. It returns per-change results with undo data. Also `undoProfileChanges(db, undo)`.
- Pull out any helper from `profile-import-apply.ts` that both need instead of copying it, and keep the import's behaviour unchanged.
- GLOSSARY.md: **profile change**.

No AI, no job, no UI.

## Done when

- `profile-changes.test.ts` covers every reason a change is refused, add → edit matching, no-ops, date rules and the cap.
- `profile-changes-apply.db.test.ts` covers each change type under manual and date order, skill linking, facts' limit, stale edits skipped, and undo (including leaving alone an entry changed since).
- `profile-import-apply.db.test.ts` still passes untouched.
- lint, typecheck and tests pass.
