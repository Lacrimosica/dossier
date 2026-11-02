# Locations for education

Status: done

Tickets: `issues/01`.

## Problem Statement

A role in the profile has a location ("Rotterdam, Netherlands"), and the resume can print it next to the company. A degree has none: Education only holds the degree, school, dates and notes. Where someone studied often matters as much as where they worked. A degree from abroad, a school whose name doesn't say which city or country it's in ("Politecnico", "University of Applied Sciences"), or a posting that asks about local qualifications all need it. Today the only workaround is to type the city into the school's name or the notes, which then prints in the wrong place and can't be switched off.

Importing a resume loses the location too: the extract-profile task reads a location for each role but not for each degree, so "University of Bologna, Italy" comes back as just the school.

## Solution

Each education entry gets a **Location** field, like a role's: free text, normally "City, Country". The resume prints it after the school the same way a role's location prints after its company, and under the same rules. Settings → Documents → "Work locations on resumes" becomes "Locations on resumes" and covers both roles and degrees: Never (the default), Always, or When the posting asks. The application's Locations switch shows or hides both at once. Imports read it, profile reviews keep it, backups carry it, and the AI never writes one.

## User Stories

1. As a job seeker who studied abroad, I want to add the city and country to each degree, so that a reader knows where I earned it.
2. As a job seeker, I want the degree's location next to the school on my resume, laid out like a role's, so that the resume reads consistently.
3. As a job seeker, I want one setting and one switch to decide whether locations show for roles and degrees together, so that a resume never shows one and not the other.
4. As a job seeker, I want degrees without a location to print as they do now, so that filling it in is optional.
5. As a job seeker importing a resume that names the city or country of my school, I want the import to fill the location in, so that I don't type it again.
6. As a job seeker, I want the location kept when a profile review merges or edits a degree, and shown in the review's preview, so that a fix doesn't lose it.
7. As a job seeker, I want the location in a data export and restored by a data import, and older exports to still import, so that backups stay complete.
8. As a job seeker, I want the location kept when I move an education entry to Courses and undo it, so that moving it never drops what I typed.
9. As a job seeker in strict mode, I want the AI to use only the location I typed, so that it never invents where I studied.

## Implementation Decisions

**Schema.** `Education` gains `location String @default("")`, like `Experience.location`. Migration `education_locations`.

**Profile.** `EducationItem` gains `location: string`; `profile-data.ts` and `demo-profile.ts` pass it through. Profile strength is unchanged.

**Profile section.** `education-section.tsx` gets a "Location" text field after School, with the same label, placeholder and autosave as the experience form. The list subtitle becomes school · location, as for roles. `educationFields` in the profile `actions.ts` gains `location: text(200)`, and `educationItem` returns it.

**Moving to Courses.** A course has no location. `moveEducationToCourses` keeps the education entry it returns for undo, so `restoreEducation` brings the location back. While it's a course the location is gone; that's acceptable and the toast doesn't need to say so.

**Setting and switch.** The `roleLocations` setting keeps its key and values (no settings migration) but its label becomes "Locations on resumes", and its doc comment and DEVELOPMENT.md say it covers roles and degrees. `showLocations` on the application and the Resume tab's Locations switch cover both too. The switch appears when any role *or* degree has a location.

**Tailoring.** `LOCATIONS_QUESTION` is reworded to ask whether the posting cares where the candidate has worked or studied (local qualifications, degree recognition, studying in a country). The tailoring prompt's education entries (`prompt-parts.ts`) include `location`. Bump `TAILOR_RESUME_VERSION`. The model still only decides whether locations show; it never writes one.

**Resume content.** The `education` entries in `ResumeContent` gain `location`: the trimmed location when locations show, otherwise "". The same `showLocations` option drives it as for roles.

**Resume document.** The education `EntryHead` passes `place={entry.location}`, so every theme lays it out as it lays out a role's place (inline after the school, or on the stacked second line).

**Fact guard.** The education texts it collects include `entry.location`.

**Import (AI).** `extract-profile` asks for `location` on each education entry ("the city and/or country of the school, if given"), cleaned like a role's. `profile-import.ts` adds it to the education schema, and the import preview's meta line shows it as for roles. `profile-import-apply.ts` needs no change beyond the field: `filled()` already keeps an existing value when the import has none. Bump the extract task's version.

**Profile review.** `review-profile` sends the location with each education entry, `TEXT_FIELDS.education` includes `"location"`, `profile-review-apply.ts` writes it, and the review dialog's preview line shows it next to the dates as for roles. Bump the review task's version.

**Connector.** get_profile's education entries include `location`. save_application is unchanged: it writes notes only, by id.

**Export/import.** The export's `education` schema gains `location: text.default("")`, so an export from before this change still imports.

**Fakes and seed.** The fake extract answer in `e2e/fake-ai.mts` gives a degree a location. The Jane Doe sample gives her degree a location, so the demo shows it when locations are on.

**Docs.** DEVELOPMENT.md (the "Work locations on resumes" paragraph) and README.md say degrees have a location too and the setting covers both.

## Testing Decisions

- **Resume content.** A degree's location shows when locations show and is empty otherwise; a degree without one is unchanged. Prior art: the location cases in `resume-content.test.ts`.
- **Resume document.** A degree's place renders next to the school in an inline and a stacked theme. Prior art: `resume-document.test.tsx`; update the snapshot.
- **Profile actions (db).** Saving and restoring an education entry keeps its location; moving it to Courses and back restores it. Prior art: `profile/actions.db.test.ts`.
- **Education section (component).** The Location field autosaves and shows in the subtitle. Prior art: `education-references.test.tsx` and the experience-section location tests.
- **Extract profile.** A degree's location is read and cleaned. Prior art: `extract-profile.test.ts`.
- **Profile review.** An edit fix carries the location and applies it. Prior art: `profile-review.test.ts`, `profile-review-apply.db.test.ts`.
- **Data export/import (db).** A round trip keeps it, and an education entry without `location` still imports.
- **Tailoring.** The prompt includes education locations, and the question mentions studying. Prior art: `tasks.test.ts`.

## Out of Scope

- Separate city and country fields, or a place picker. Roles use one free-text field and so does this.
- Locations for courses, projects or references.
- A separate setting or switch for education locations.
- The AI filling in a location the profile doesn't have, or guessing a school's city.

## Further Notes

Raised by the user: "the education section does not have the country or city associated to it". The setting is shared with roles on purpose: two switches for one kind of line would let a resume show where you worked but not where you studied, which reads as an omission. If that turns out to be wrong, splitting the setting later is cheap.
