# 01 — The posting in the writing prompts

Status: done

Spec: `../spec.md` (Problem: "The posting never reaches the writer"; Decisions: "Posting in the prompt").

## What

`tailor-resume`, `write-cover-letter`, `regenerate-unit` and `refine-chat` add `postingForPrompt(posting)` to the user message after "The job:", with a line saying it's the posting as published. The `posting` input's doc comment changes from "for the fact guard" to what it's now for. Bump each task's `*_VERSION`.

## Done when

- Each of the four tasks sends the posting inside `<posting>` (tests).
- Lint, typecheck and tests pass. DEVELOPMENT.md says the writers read the posting.
