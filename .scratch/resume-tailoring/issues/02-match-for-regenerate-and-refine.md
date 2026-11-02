# 02 — The match and page limit for regenerate and refine

Status: done

Spec: `../spec.md` (Problem: "Regenerate and refine work without the match"; Decisions: "Match for regenerate and refine").

## What

- `RegenerateInput` and `RefineInput` gain `match: Match | null`, passed to `jobForPrompt`. The jobs (`src/lib/jobs/regenerate-unit.ts`, `refine.ts`) read it from `Application.match` with `matchSchema.safeParse`, null when it doesn't parse.
- Regenerating a role or project under a page limit asks for at most as many bullets as `pageFit` gives the most relevant roles (one page: 4, two pages: 5).
- Bump `REGENERATE_UNIT_VERSION` and `REFINE_CHAT_VERSION`.

## Done when

- Both tasks send `inProfile` per requirement when there's a match (tests), and the jobs pass the stored one.
- A regenerated role on a one-page resume is asked for 2–4 bullets (test).
- Lint, typecheck and tests pass.
