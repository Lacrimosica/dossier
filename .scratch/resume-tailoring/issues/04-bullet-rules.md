# 04 — Shared bullet rules and plain wording

Status: done

Spec: `../spec.md` (Problem: "Rewording loses specifics…", "The wording reads as a model's", "Every role gets the same room"; Decisions: "Bullet rules").

## What

- `BULLET_RULES` and `PLAIN_WORDING` in `prompt-parts.ts`, in the system prompt of `tailor-resume`, of `regenerate-unit` for resume bullets, and of `refine-chat`.
- `tailor-resume` instructions: gaps never go in; the posting's spelling for a skill the candidate has; recent and relevant roles get up to 5 bullets, older unrelated ones 1–2; today's date in the system prompt.
- Bump the three versions (once with 01 and 02 if they land together).

## Done when

- Tests check the three tasks send the rules, and tailor sends today's date.
- Lint, typecheck and tests pass. DEVELOPMENT.md describes how bullets are weighted.
