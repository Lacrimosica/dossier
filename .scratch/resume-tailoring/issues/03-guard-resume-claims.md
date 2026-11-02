# 03 — The fact guard checks resume claims without the posting

Status: done

Blocked by: 02

Spec: `../spec.md` (Problem: "The fact guard trusts the posting"; Decisions: "Claims about the candidate").

## What

- `claimSources(profile, extracted, match, facts)` in `fact-guard.ts`: the profile and facts as now, the job's title, company, role and location, and for each match item covered or partial, the posting's short skill name for that requirement (`extracted.requirements`, found by its text). Not the raw posting.
- Resume units use it in `tailor-resume`, in `regenerate-unit` and `refine-chat` when the document is the resume, and in the connector's `save_application` (`src/lib/connector/write.ts`). Letters and emails keep `guardSources`.

## Done when

- A tailored bullet naming a gap tool that's in the posting is flagged; one naming a covered skill in the posting's spelling isn't; a letter paragraph naming the posting's product isn't (tests).
- `fact-guard.test.ts` covers `claimSources`.
- Lint, typecheck and tests pass. DEVELOPMENT.md's fact guard sentence says what backs resume claims.

## Comments

- Side effect worth knowing: a headline or summary that borrows the posting's domain ("Product Designer · Payments") is now flagged when the profile has no payments work. That's the point, but expect a few more "check this" marks on those two units.
