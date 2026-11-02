# Optional title and location for roles

Status: ready-for-agent

Tickets: `issues/01`.

## Problem Statement

A role's location seems to be required, but some roles don't have one. Remote work, a career break and a freelance stretch for clients in several countries all lack a single place. The same is true of the title: a career break can go without one, and someone may leave the role empty and put only the company.

The data already lets both be empty. `Experience.role` and `Experience.location` are `String @default("")`, the profile `actions.ts` validates them with `text(200)` (no minimum), and the form doesn't mark them required. A career break even drops its location in `resume-content.ts`. Nothing in the form says so, though: the Location field has no hint, so it reads as something you must fill in.

The real problem is how the resume prints an entry with an empty part. `EntryHead` in `resume-document.tsx` assumes that a title is always there, and in some layouts it leaves blank space, empty elements or stray separators:

- **Stacked (Brief), a role under its company after a promotion:** with no title the line reads " | 2020 – 2022", starting with a stray pipe. With no title and no dates it renders an empty `<p>`, which is a blank line.
- **Stacked, a single role:** with neither company nor title, the first line is an empty name cell next to the dates. If there is a place, the second line is an empty cell next to the place, so the head is two lines with nothing on the left.
- **Inline and timeline (every other theme):** with no title, the company prints after an empty bold `<span>`, so the entry has no bold name at all. With no title, company or place, the head still renders an empty `<p>`; in a theme that puts the dates at the end of the line, those dates sit next to nothing.

## Solution

The title and location of a role stay optional, and the form says so. The resume builds each entry's head from the parts that are actually there. An empty part leaves no gap, empty line, leftover separator or empty element, in every theme and in each place where a head is drawn: a single role, a company's head after a promotion, the roles under it, degrees, projects and courses (they share `EntryHead`).

## User Stories

1. As a job seeker with a remote job, I want to leave the location empty without the form suggesting it's missing, so that I don't make up a city.
2. As a job seeker, I want a role without a location to print exactly like one when locations are switched off, with no gap where the place would be.
3. As a job seeker who only gives the company for a role, I want the company printed as the entry's name, in bold, so that the entry still has a heading.
4. As a job seeker with a promotion where one role has no title, I want that line to show only its dates, with no stray "|".
5. As a job seeker using the Brief theme, I want an entry with no title, company or location to take one line, not two half-empty ones.
6. As a job seeker, I want the same rules on base and tailored resumes, in the preview, and in the downloaded PDF.

## Implementation Decisions

**Data.** Nothing to change. `role` and `location` are already optional in the schema (`@default("")`), the action (`text(200)`), extract-profile (`text`, cleaned), profile import, data export/import and profile review. No migration.

**Form.** In `experience-section.tsx`, the Location field gets a hint: "Optional. Leave it empty for remote work, or type “Remote” if you want it on the resume." Keep the hint short. A career break already hides the field. Leave the Role field's label as it is: the list falls back to "New role", and the resume rules below cover an empty title.

**Remote is plain text.** There is no "remote" flag. Someone who wants "Remote" printed types it, and it is treated like any other place (including the one-place-per-company rule in `resume-content.ts`). A remote flag would mean another field, translations and tailoring rules for no clear gain.

**`EntryHead` rules.** Rewrite `EntryHead` so that every line is built from its non-empty parts (trimmed, as `resume-content.ts` already trims them), and a line or element with nothing in it isn't rendered:

- *Inline and timeline.* The name is the title, or the organisation when there's no title, shown as `.entryTitle` (bold). The rest of the line is what remains of organisation, `at` and place, joined as now (", " after the name, " · " between the rest). If there's no name, the place (or `at`) leads the line, not bold. If the line is empty, there's no `<p>`; with dates, the head is just the dates. If the head has nothing at all, it renders nothing.
- *Stacked, single entry.* The first line's name is organisation, then title, then `at`, whichever comes first. The second line holds the next one of those, with the place at its end. If the first line has no name, everything moves up: the place goes on the first line next to the dates and there's no second line. Keep `.dates` always rendered when the head has a first line, so the grid columns still line up (the existing comment explains why).
- *Stacked, nested (a role under its company).* The line is the title, then " | " and the dates only when there's a title. Without a title it's just the dates. Without either it's no `<p>`; the place, if any, stays on its own.
- The `.stacked .entryHead > :nth-child(even)` alignment counts elements, so when a cell is dropped, check that the dates and place still land in the end column. Render an empty first cell only where the grid needs one, and say why in a comment.

**Resume content.** No change in behaviour. `companies()` already sets a break's company and location to "" and gives a break with no title `labels.careerBreak`. A non-break role with no title stays "" here; the document decides how to show it.

**Other views.** The profile list subtitle, the import preview and the profile review preview already filter empty parts (`filter(Boolean)` / `join`), so nothing changes there. Check, and leave them alone if they're correct.

**AI.** No prompt changes and no version bumps. Profile review must not suggest adding a missing location. The prompt doesn't today; if a test shows it does, add one line saying a role may have no location.

**Docs.** In DEVELOPMENT.md, next to the "Work locations on resumes" paragraph, add one sentence: a role's title and location are optional, and the resume leaves out what's empty.

## Testing Decisions

- **Resume document (component).** Add cases to `resume-document.test.tsx` for an inline theme (Editorial), a timeline theme (Chronicle) and the stacked theme (Brief):
  - a role with company and no title or place (company is bold, no empty span, no separator);
  - a role with no title, company or place (no empty `<p>`);
  - a promotion where one role has no title (no "|");
  - a role with a place but no company or title, stacked (one line).
  Assert on text and structure (no empty elements in `.entryHead`), not only snapshots. Update the snapshots.
- **Resume content.** One case: a role with an empty location and locations shown keeps `location: ""` and doesn't block one place from going on the company line. Prior art: the location cases in `resume-content.test.ts`.
- **Experience section (component).** The Location field shows its hint, and saving it empty works. Prior art: `experience-section.test.tsx`.
- **e2e.** The accessibility and resume specs still pass. Empty headings or paragraphs could trip axe, so run `e2e/accessibility.spec.ts`.

## Out of Scope

- A "remote" or "hybrid" flag, or a work-mode field.
- Making Company optional in a new way. It already is; the rules above cover it.
- Changing which locations show (the Settings → Documents setting and the application's Locations switch).
- Locations for degrees, which `.scratch/education-locations` covers. Its `EntryHead` change (`place={entry.location}` for education) gets these rules for free.

## Further Notes

The user raised it: "the location of an experience is an obligatory field, not null… for remote jobs or career breaks it wouldn't make sense; the renderer should not leave empty space when the job title and location are not included". The column is `NOT NULL DEFAULT ''`, not required in the form, and this spec keeps it that way. Making it nullable would mean every reader checking for both `null` and `""` for no gain. The user-visible bug is in the renderer.
