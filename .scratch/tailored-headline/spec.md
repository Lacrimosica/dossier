# Tailored headline

Status: done

Tickets: `issues/01`.

## Problem Statement

The headline under the name ("Senior Product Designer") is one line in the profile, and every resume prints it word for word. Someone applying to different kinds of jobs (data engineering one day, ML the next) needs a different headline for each, and a resume written in Italian still shows the English headline, because tailoring translates the summary and bullets but never touches the headline.

## Solution

A tailored resume gets its own headline, written by the AI for the posting in the resume's language, like the summary. It's a unit, so it can be edited, regenerated, refined in the chat and left out like any other part. The profile's headline stays what the base resume shows, and what the AI starts from.

## User Stories

1. As a job seeker, I want each tailored resume's headline written for that job, so that a data role and an ML role each lead with the right title.
2. As a job seeker, I want the headline in the resume's language, so that an Italian resume doesn't open with an English line.
3. As a job seeker, I want the headline built only from titles and skills in my profile, so that it never claims a title I haven't held (strict mode marks anything else "check this").
4. As a job seeker, I want to edit, regenerate or refine the headline like the summary, so that I keep the final say.
5. As a job seeker, I want to leave the headline out of one resume, so that a resume can go without it.
6. As a job seeker, I want resumes written before this change to keep showing my profile headline, so that nothing changes under me; editing or regenerating it there stores it for that resume.
7. As a job seeker, I want the base resume to keep my profile headline, so that the profile stays the source of truth.

## Implementation Decisions

- **Unit.** A new resume unit `headline` (label "Headline"), first in the resume's units. `unitName` calls it "headline".
- **Tailoring.** `tailor-resume` asks for `headline`: one short line (a title, optionally with a focus, e.g. "Data Engineer · Streaming and analytics"), for this job, using the candidate's real titles and skills, not the posting's title unless the candidate has held it. Bump `TAILOR_RESUME_VERSION`. The fact guard checks it like every unit in strict mode. An empty answer falls back to the profile's headline.
- **Regenerating.** `regenerate-unit` gets a sentence for the headline ("one short line under the name…"). Bump `REGENERATE_UNIT_VERSION`.
- **Rendering.** `resume-content.ts`: with units, the headline is the `headline` unit's text; a resume without one (older) shows the profile headline. `resume-document.tsx` renders it through `renderUnit({ id: "headline" })`, so it gets the toolbar.
- **Older resumes.** As with the letter's frame parts (E8-11): the application view shows a `headline` unit built from the profile when the resume doesn't store one, and storing happens on first edit or regenerate (`shown`). Leaving it out stores it empty, which hides it.
- **Connector.** `save_application` lets Claude pass a headline; without one, the profile's is stored. Docs for the connector tools mention it.
- **Elsewhere.** Agent drafts use `tailor-resume`, so they get it. Page-limit trimming never trims the headline. The demo resume units and `e2e/fake-ai.mts` (`tailored_resume`) get a headline.

## Testing Decisions

- `tailor-resume` (tasks.test): the headline unit comes first, falls back to the profile's when empty, and is guarded in strict mode.
- `resume-content.test`: the unit wins; without it, the profile headline shows; empty hides it.
- Application view component test: an older resume shows the profile headline as an editable unit.
- E2E: a new application's resume shows the fake AI's headline.

## Out of Scope

- Several saved headlines in the profile to pick from.
- Tailoring the base resume.
- Translating the rest of the profile for the base resume.
