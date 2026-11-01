# 01 — The review task and building fixes

Status: done

Spec: `../spec.md` ("AI task", "Building and checking fixes", "Fakes").

## What

- `src/lib/profile-review.ts` (pure): the fix types, `buildFixes(profile, answer, skipped)` that builds merges and checks every fix, and `fixFingerprint`.
- `src/lib/ai/tasks/review-profile.ts`: `REVIEW_PROFILE_VERSION`, the answer schema, the prompt, the profile serialised for review (every entry, hidden courses included, with ids and raw dates), exported from the tasks index.
- `e2e/fake-ai.mts`: a `profile_review` answer.

No db, no job, no UI.

## Done when

- `profile-review.test.ts` covers the merge rules and every reason a fix is dropped.
- `review-profile.test.ts` covers what's sent and that the answer goes through `buildFixes`.
- lint, typecheck and tests pass.
