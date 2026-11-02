# 02 — `update_profile` in the Claude connector

Status: done
Blocked by: 01

Spec: `../spec.md` ("Connector", stories 20–24).

## What

- `update_profile` in `src/lib/connector/tools.ts`: input `{ changes, words }`, annotations `readOnlyHint: false, destructiveHint: false`. It checks, applies with the versions read in the same transaction, and answers `{ applied, refused, check_these, link }`.
- `check_these` from `unverifiedFacts` with `words` as the source.
- A line in `get_profile`'s description, and in the connector's server instructions, pointing to `update_profile`: read the profile first, use its ids, only what the user said, ask when something's missing.
- DEVELOPMENT.md: the tool, in the connector's part (the full "Profile chat" section comes in 06).

## Done when

`tools.db.test.ts` covers an add, an edit by id, a refused change with its reason, `check_these`, and that nothing is ever deleted. Calling it from Claude Desktop against `docker compose up` adds a course, which shows in Courses.
