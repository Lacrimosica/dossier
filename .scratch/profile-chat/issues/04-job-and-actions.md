# 04 — The profile chat job and actions

Status: done
Blocked by: 03

Spec: `../spec.md` ("Job", "Actions", "Unverified words").

## What

- `profile-chat` job in `src/lib/jobs/`, registered in `definitions.ts`. Its input is the conversation plus the entry versions, and its result is the reply, the checked changes and their unverified words. A new message cancels an earlier job, and retention sweeps it.
- In `src/app/(app)/profile/actions.ts`: `sendProfileChat`, `applyProfileChangesAction` (re-checks against the profile as it is now, and in strict mode refuses a change with unverified words unless it's marked confirmed), `undoProfileChangesAction` and a `discardProfileChat` that deletes the job.
- Friendly `ActionError` copy for stale entries, too many changes and a missing AI provider.

## Done when

`actions.db.test.ts` (or a new `profile-chat.db.test.ts`) covers the job's result, apply re-checking, the strict-mode refusal and confirmation, undo, and discard deleting the job.
