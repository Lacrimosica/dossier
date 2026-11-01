# 02 — The review job, applying and skipping

Status: done
Blocked by: 01

Spec: `../spec.md` ("Job", "Applying", "Skipped fixes").

## What

- `review-profile` job in `src/lib/jobs/`, registered in `definitions.ts`, with the `updatedAt` of every entry a fix touches. Starting one discards an earlier one; retention sweeps it like an import.
- `startProfileReview`, `applyProfileReview` and `discardProfileReview` actions in the profile `actions.ts`.
- `reviewSkipped` setting (capped, pruned of ids that are gone).

## Done when

`profile-review.db.test.ts` covers merges (skill links, `sort`), skill merges (experience and project links), edits, deletions, stale entries skipped and counted, skipped fixes stored, and the job deleted.
