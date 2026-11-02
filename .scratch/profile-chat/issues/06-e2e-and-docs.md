# 06 — End-to-end test, accessibility and docs

Status: done
Blocked by: 02, 05

Spec: `../spec.md` ("Testing Decisions", "Docs").

## What

- `e2e/profile-chat.spec.ts`: open the panel, send "add my certificate…", apply the card, see it in Courses, undo it, see it gone.
- `e2e/accessibility.spec.ts`: the profile screen with the panel open and a card shown.
- DEVELOPMENT.md: a "Profile chat" section after "Profile review" (change types, checking, applying and undo, the job, the connector tool). README.md: both ways in, under the profile features.
- Raise coverage thresholds in `vitest.config.mts` if they went up. Never lower them.

## Done when

`docker/bin/yarn build && docker/bin/yarn test:e2e` passes, along with lint, typecheck and tests.
