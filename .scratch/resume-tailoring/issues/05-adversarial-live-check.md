# 05 — An adversarial live check

Status: ready-for-human

Blocked by: 01, 02, 03, 04

Spec: `../spec.md` (Decisions: "Live check").

## What

A second case in `src/lib/ai/tasks/tasks.live.test.ts`: the demo profile against a posting that asks for tools it lacks, with a bullet that says "helped" and a skill linked to one role only. It prints the resume and counts, per run: gap tools in resume units, gap tools the guard flagged, lost qualifiers and skills outside their role. The assertions are loose (the guard flags every gap tool that got in); the counts are for reading.

## Done when

- The case runs with `AI_LIVE=…` and is skipped otherwise; typecheck passes.
- Run against at least one provider by a human, results noted under Comments.

## Comments

- The case is written ("keeps out what the posting baits for…" in `tasks.live.test.ts`): the demo profile with a "Helped the engineers…" bullet on Fieldnote, and a Ledgerly posting that also asks for Kubernetes, Terraform and Salesforce. It prints baited claims (and how many the guard missed), whether the qualifier survived, and skills named outside their only role; it fails only if a baited tool got in unflagged. Not run here: no Ollama container or provider key in this environment. Run with `AI_LIVE=mistral docker/bin/yarn vitest run src/lib/ai/tasks/tasks.live.test.ts` (or `ollama`/`lmstudio`), ideally once on the commit before this change for a baseline, and note the counts here.
