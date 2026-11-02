# 03 — The profile chat AI task

Status: done
Blocked by: 01

Spec: `../spec.md` ("AI task", "Fakes").

## What

- `src/lib/ai/tasks/profile-chat.ts`: `PROFILE_CHAT_VERSION`, the answer schema (`reply`, `changes`, `question`, plus a `declined` flag as in `refine-chat`), the instructions, and the prompt built from the profile with ids (no contact details, references or photo), the facts, today's date and the last 20 turns, capped in characters. Exported from the tasks index.
- The answer goes through `checkProfileChanges`, and unverified words are worked out from the person's messages.
- `e2e/fake-ai.mts`: a `profile_chat` answer ("certificate" → one course, "when" → a question, otherwise a short reply).

No job, no UI.

## Done when

`profile-chat.test.ts` covers what's sent and what's left out, the turn cap, a declined request, a question with no changes, and that an invalid change from the model never reaches the result. `tasks.test.ts` lists the new task if it lists the others.
