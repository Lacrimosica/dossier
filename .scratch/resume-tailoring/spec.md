# Resume tailoring: context and guardrails

Status: in progress

Tickets: `issues/01` to `issues/05`.

## Problem Statement

The writing tasks tailor the resume and letter from too little of the job, and the guardrails around them have a hole where invented claims are most likely.

- **The posting never reaches the writer.** `tailor-resume`, `write-cover-letter`, `regenerate-unit` and `refine-chat` see the job only through `jobForPrompt`: title, company, role, location and the requirement list, each "shortened to the essentials". What the job does day to day, the product, the team, the domain and the posting's own wording are dropped. The raw posting is passed to each task, but only to the fact guard. So a bullet can only be pulled toward a ten-line checklist, and the letter is told to name "the contact person the posting names" and to take "the problem the job is there to solve" from a posting it can't see.
- **The fact guard trusts the posting.** `guardSources` counts the whole posting as backing. If the model copies a tool the candidate lacks from the posting into a bullet ("Deployed services on Kubernetes"), the guard finds "Kubernetes" in the posting and stays quiet. Research on LLM resume rewriting (arXiv 2608.26171) found "JD-baited" claims in 47% of unguarded runs; this is the case the guard most needs to catch, and the one it can't.
- **Regenerate and refine work without the match.** Both call `jobForPrompt(extracted, null)`, so the model sees "Kubernetes" as a requirement with no sign that it's a gap. Regenerate also ignores the page limit, so a role can come back with five bullets on a one-page resume.
- **Rewording loses specifics and gains scope.** Nothing tells the model to keep numbers and tools when rewording, to keep "helped" or "contributed to", or to keep a tool in the role where it was used. Those are the failures that survive prompt guardrails and human review most often (arXiv 2608.26171: qualifier drops and plausible new claims removed only 54.5% of the time). Skill names in the profile pass the guard wherever they appear, so a skill moving between roles is never flagged.
- **The wording reads as a model's.** "Start with a verb" plus "rephrase freely" pulls toward stock verbs (spearheaded, leveraged, orchestrated, honed, streamlined: in 52% of 2025 resumes per Simplify's data) and uniform bullets, which hiring managers name as the main sign of an AI resume (Resume Genius 2026: unnatural phrasing 51%, generic language 44%).
- **Every role gets the same room.** 2–5 bullets for every role, however old or unrelated, unless a page limit is set. Common advice is roughly 10–15 years of detail, with fewer bullets for older roles.

## Solution

Give the writers the posting, keep the guard's backing to what can back a claim, give regenerate and refine what tailoring has, and add shared bullet rules. Then measure with an adversarial live run.

## User Stories

1. As a job seeker, I want my tailored resume to speak to what the job actually involves, not only its requirement list, so that the right bullets lead.
2. As a job seeker, I want my cover letter to address the contact person the posting names and the problem it describes, so that it doesn't read as generic.
3. As a job seeker, I want "check this" on any tool or skill in my resume that I don't have, even when the posting asks for it, so that I never send a claim I can't back.
4. As a job seeker, I want a regenerated part or a chat edit to know which requirements I don't meet, so that it doesn't write them in.
5. As a job seeker, I want a regenerated role to respect my page limit.
6. As a job seeker, I want rewording to keep my numbers, tools and how much of the work was mine, so that the resume stays true and specific.
7. As a job seeker, I want plain wording without stock AI phrases, so that the resume reads as mine.
8. As a job seeker, I want recent and relevant roles to get the room, and old unrelated ones less, so that the page goes to what matters.
9. As a developer, I want a live check against trap requirements, so that prompt changes are judged by numbers.

## Implementation Decisions

- **Posting in the prompt (01).** The writing tasks add `postingForPrompt(posting)` (already capped at 20,000 characters, wrapped in `<posting>`) to the user message, after the structured job. `UNTRUSTED_POSTING` already covers it. The structured job stays: it carries the match, which says what's covered and what's a gap. Version bumps for all four tasks.
- **Match for regenerate and refine (02).** Their inputs gain `match: Match | null`; the jobs read it from `Application.match` (`matchSchema.safeParse`). Regenerate asks for at most the bullets the page limit allows (shared with `pageFit`).
- **Claims about the candidate (03).** A new `claimSources(profile, extracted, match, facts)` backs resume text with the profile, the facts, the job's title, company, role and location, and the posting's short skill name for each requirement the match marks covered or partial (so "PostgreSQL" for the profile's "Postgres" is fine). Never the raw posting: a gap stays flagged. Resume units in every task (tailor, regenerate, refine) use it. The cover letter and email keep `guardSources`, since talking about the company's product from the posting is their job.
- **Bullet rules (04).** Two constants in `prompt-parts.ts`, used by every task that writes resume bullets: `BULLET_RULES` (keep numbers, tools and names; keep who did what; a tool only in the entry where it was used; lead with the result that matters most) and `PLAIN_WORDING` (plain verbs, no stock ones or buzzword adjectives, varied starts and lengths). `tailor-resume` also says: gaps never go in, use the posting's spelling for a skill the candidate has, and weight bullets by recency and relevance (with today's date so "recent" means something). Every role is kept: a missing role reads as a gap in the history.
- **Live check (05).** `tasks.live.test.ts` gains an adversarial run: a posting with requirements the demo profile lacks, a profile bullet with "helped", and a tool used in one role only. It prints and counts gap tools in resume units, lost qualifiers and tools outside their role.

## Testing Decisions

- `tasks.test.ts`: each writing task sends the posting inside `<posting>`; regenerate and refine send the match; regenerate states the bullet cap under a page limit; tailor, regenerate and refine send the bullet rules; a resume bullet with a gap tool from the posting is flagged, a covered skill in the posting's spelling isn't, the letter can still name the posting's product.
- `fact-guard.test.ts`: `claimSources` backs covered requirement skills and the job's company, not the posting's other words.
- Job tests for regenerate and refine pass the stored match.
- The live run is judged by reading its output; it's skipped in CI like the existing one.

## Out of Scope

- Choosing projects per job like courses (changes what the user sees; needs a decision).
- Running the fact guard when strict mode is off.
- A second "evaluator" model pass comparing each bullet with its source. Worth it only if the live check shows the rules aren't enough.
- Mirroring the posting's job title in the headline. The headline keeps titles the candidate has held (.scratch/tailored-headline).

## Sources

- Mitigating Fabrication in Multi-Stage LLM Pipelines for Hiring, arXiv 2608.26171.
- Grounded Optimization, arXiv 2607.01457.
- Simplify, "Can recruiters tell if AI wrote your resume?" (simplify.jobs).
- Resume Genius 2026 Hiring Insights (via resumegeni.com).
- Monster, The Muse and Resume Worded on how far back a resume goes.
