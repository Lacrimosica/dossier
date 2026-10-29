# Courses & certificates

Status: ready-for-agent

## Problem Statement

The profile has one Education section for "degrees, courses and certificates". A weekend UX-writing workshop, a three-evening first-aid course or a one-month online course has to be entered as if it were a degree: "Degree or course", "School", a start and end date and a "Still studying" box. None of that fits. There's nowhere to say who ran it, how long it took or where the certificate can be checked.

On a resume these short courses then land under "Education", right next to an MSc, which makes both look worse. Tailoring can't help either, because the AI has to keep every education entry. It can't drop a course that's irrelevant to the job or put the relevant one first. So a candidate with many small courses either clutters every resume or leaves them out of the profile altogether.

## Solution

A new, optional profile section, **Courses & certificates**, sits right after Education. It's for anything shorter or less formal than a degree: workshops, short courses, bootcamps, trainings and certificates. Each entry has a name, a provider, a date (a single month, or a short range), an optional length in the person's own words ("3 weekend sessions", "16 hours"), an optional link to a certificate, notes, and a "Show on resumes" switch.

Education goes back to being about degrees and longer programmes, and its copy says so.

On a resume, courses get their own "Courses & certificates" block after Education. When a resume is tailored, the AI keeps only the courses that help with the job, most relevant first. Degrees always stay.

Courses already stored under Education don't move by themselves. Each Education entry gets a "Move to courses & certificates" action, so the person decides which ones to move.

Importing a resume puts degrees into Education and short courses, workshops and certificates into Courses & certificates.

## User Stories

1. As a job seeker, I want a separate Courses & certificates section in my profile, so that short courses aren't entered as if they were degrees.
2. As a job seeker, I want to add a course with its name, so that I can record what I took.
3. As a job seeker, I want to record who ran the course (a studio, a trainer, a platform, a meetup), so that employers know where it came from.
4. As a job seeker, I want to give a course a single month and year, so that a one-day or one-weekend course doesn't need a start and an end.
5. As a job seeker, I want to optionally give an end month and year, so that a course spread over a month of weekends shows as a short range.
6. As a job seeker, I want to describe the length in my own words ("3 sessions", "16 hours", "4 weekends"), so that the effort shows without a rigid unit.
7. As a job seeker, I want to add a link to a certificate or the course page, so that an employer can check it.
8. As a job seeker, I want to add notes to a course (what I built, the topic, the grade), so that the AI has something to work with.
9. As a job seeker, I want to keep a course in my profile but off my resumes, so that minor or outdated courses don't clutter them.
10. As a job seeker, I want courses ordered newest first by default, so that recent learning shows first.
11. As a job seeker, I want to reorder courses by hand, as I can roles, projects and degrees, so that I control what comes first.
12. As a job seeker, I want to go back to date order after reordering, so that I can undo a manual order.
13. As a job seeker, I want to delete a course and undo the deletion, as with other entries, so that a slip isn't permanent.
14. As a job seeker, I want course edits to save automatically, like the rest of the profile, so that I never lose work.
15. As a job seeker, I want the section to be optional and not count towards Profile strength, so that a profile without courses can still reach 100%.
16. As a job seeker, I want the Education form to talk about degrees ("Degree", a degree-focused hint), so that it's clear what belongs there.
17. As a job seeker with courses already under Education, I want a "Move to courses & certificates" action on each Education entry, so that I can tidy up without retyping.
18. As a job seeker, I want a moved entry to keep its name, school (as the provider), dates and notes, so that nothing is lost when I move it.
19. As a job seeker, I want to be able to undo a move, so that moving the wrong entry is harmless.
20. As a job seeker, I want my base resume to show courses in their own "Courses & certificates" block after Education, so that degrees and courses are clearly apart.
21. As a job seeker, I want each course on a resume to show its name, provider, dates and, when there is one, its length and link, so that it reads like a proper entry.
22. As a job seeker, I want a course's notes to appear on the base resume as they do for degrees, so that the detail I wrote isn't lost.
23. As a job seeker, I want a tailored resume to keep only the courses that matter for the job, most relevant first, so that the resume stays focused.
24. As a job seeker, I want the AI to keep degrees on every tailored resume, as it does now, so that my formal education never disappears.
25. As a job seeker, I want the AI to shorten or empty a course's notes for a tailored resume, as it does for degrees, so that the resume fits its page limit.
26. As a job seeker in strict mode, I want the AI never to invent a course, provider, date, length or certificate, so that my resume stays truthful.
27. As a job seeker, I want courses switched off with "Show on resumes" never to appear on any resume, base or tailored, so that the switch is reliable.
28. As a job seeker, I want to edit, remove or reorder a course's block on a tailored resume like any other unit, so that I keep the final say.
29. As a job seeker writing in another language, I want the "Courses & certificates" heading translated in every resume language Dossier supports, so that a German resume says it in German.
30. As a job seeker importing an existing resume, I want degrees to land in Education and short courses, workshops and certificates in Courses & certificates, so that the import gets it right.
31. As a job seeker re-importing a resume, I want courses already in my profile to be matched rather than duplicated, as degrees are, so that importing twice is safe.
32. As a job seeker, I want the import preview to count courses, so that I know what's about to be added.
33. As a job seeker using the Claude connector, I want get_profile to include my courses with their ids, so that Claude can tailor with them.
34. As a job seeker using the Claude connector, I want save_application to accept course units, so that Claude-written drafts can include relevant courses.
35. As a job seeker, I want my courses in a data export and restored by a data import, so that a backup is complete.
36. As a job seeker, I want an export from before this change to still import, so that old backups keep working.
37. As a job seeker trying the demo, I want Jane Doe's profile to include a couple of courses, so that I can see how the section looks.
38. As a job seeker using a screen reader, I want the new section and its form to be fully labelled and keyboard-usable, so that it meets the same WCAG 2.2 AA bar as the rest.
39. As a job seeker, I want an empty Courses & certificates section to say what belongs there, so that I know when to use it instead of Education.

## Implementation Decisions

**Domain term.** The entry is a **Course**: anything shorter or less formal than a degree, including certificates. The section and resume heading are "Courses & certificates". The tailored-resume unit prefix is `course:`.

**Schema.** A new `Course` model next to `Education`:
- `name`, `provider` (strings, default empty)
- `startYear`, `startMonth` (optional): when it happened, or when it began
- `endYear`, `endMonth` (optional): only when it ran over more than one month
- `duration` (free text, default empty), e.g. "3 weekend sessions"
- `link` (default empty): a certificate or course page
- `notes` (default empty)
- `onResumes` (default true), with the same meaning as on Publication
- `sort`, `createdAt`, `updatedAt`
- No `current` flag. A course still in progress just has no end.
- Private unless included in a document, like the other profile models.

`Education` is unchanged in the schema; only its copy changes. Its doc comment becomes "A degree or longer programme".

**Dates.** A course is shown with the existing date-range formatting: a single month when there's no end, and a range otherwise. The date order (newest first) sorts by end date, falling back to start date, the same rule experience, projects and education use.

**Ordering.** A new `courseOrder` setting (`date` | `manual`, defaulting to `date`) works the same way as `educationOrder` (E4-9). The reorder and sort-by-date actions accept `course` as a section.

**Profile section.** Add it to the profile's section list right after Education, marked optional (#216). Its hint says it's for workshops, short courses, bootcamps and certificates. The form has Name, Provider, When (month/year), an optional "Until" (month/year), Length, Link, Notes and "Show on resumes". It reuses the shared entry list (add, autosave, remove with undo, reorder, sort by date). The entry summary shows the name as title, the provider as subtitle, and dates plus length as meta.

**Education copy.** The first field's label becomes "Degree". The section hint becomes "Degrees and longer programmes", with a pointer to Courses & certificates for anything shorter. The model's doc comment and the import prompt change to match.

**Move to courses.** A new Server Action moves one Education entry into a new Course in a single transaction: degree → name, school → provider, dates → dates (`current` dropped), notes → notes, `onResumes` true. It then deletes the Education entry and returns what an undo needs. Undo reverses the move. It's offered as an entry action on Education entries in the profile only.

**Profile data.** The profile type gains `courses: CourseItem[]`, loaded and ordered like education. Profile strength is unchanged, because courses are optional.

**Resume content.** The resume content gains a `courses` list (`id`, `name`, `provider`, `dates`, `duration`, `link`/`href` shown like a publication link, `notes`).
- Base resume: courses with `onResumes`, in profile order.
- Tailored resume: exactly the `course:` units, in unit order, like every other entry.
- The resume document renders a "Courses & certificates" section after Education, using the same entry head as Education, with length and link in the meta line and notes underneath.

**Labels.** The document labels gain `courses`, translated for every language that already has an `education` label.

**Tailoring (AI).** The tailor-resume answer gains `courses: { id, notes }[]`. The instructions say: courses that help with this job only, most relevant first, notes shortened or empty, and it's fine to leave them all out. Education keeps "every entry by id".
- Courses with `onResumes` off are never sent to the model.
- A course id the model returns that isn't in the profile is ignored.
- Bump the task's `*_VERSION`.
- The page-fit hints mention course notes alongside education notes.
- Add `course` to the fact guard's credential vocabulary only if strict-mode tests show a gap. "certificate" is already covered.

**Import (AI).** The extract-profile schema gains `courses` (name, provider, dates, duration, link, notes). The instruction splits the old line: degrees and longer programmes go to `education`; workshops, short courses, bootcamps and certificates go to `courses`. Bump its version. Applying an import matches existing courses by name and provider (the way degrees are matched) and fills empty fields. A full replace clears courses too and resets `courseOrder`. The import preview counts courses.

**Connector.** get_profile includes courses (with ids, without anything hidden by `onResumes`). save_application accepts `courses: { id, notes }[]` (default empty, same note length cap as education) and writes `course:` units.

**Unit labels.** `course:` units get the course name as their label, falling back to "entry", like the other entry prefixes.

**Export/import.** The data export gains `courses`. Data import restores them, and treats `courses` as optional so older exports still load.

**Fakes and seed.** The fake AI answers tailor and extract requests with a `courses` field. Jane Doe's demo profile gets two courses (one single-month workshop, one month-long course with a certificate link) and loses any course-like entries from Education.

**Docs.** DEVELOPMENT.md and README.md describe the new section, and the README profile bullet lists it.

## Testing Decisions

A good test checks behaviour you can see from outside: what a profile action stores, what a resume shows, what units a tailoring answer produces, what an export contains. It doesn't check how a component or helper is put together. Prefer the highest existing seam; no new seams are needed.

Seams, from highest to lowest:

- **Resume content (pure).** Base resume shows only `onResumes` courses in profile order; tailored resume shows exactly its `course:` units in their order; empty profile has no courses block. Prior art: the publications and projects cases in the resume-content tests (#218, PRO-13).
- **Resume document.** The "Courses & certificates" block renders after Education, with dates, length and link, and the labels come out translated. Prior art: the resume-document tests and snapshot.
- **Tailor-resume answer → units.** Courses the model keeps become `course:` units in its order, skipped courses produce no unit, hidden courses are never in the prompt, and unknown ids are dropped. Prior art: the tasks tests for tailor-resume.
- **Profile actions (db).** Create, save, remove/restore, reorder and sort-by-date for courses, plus move-to-courses and its undo. Prior art: the publication cases in the profile actions db tests.
- **Profile section (component).** The form's fields, autosave, the hint, and the Move action on Education entries. Prior art: the publications-section and education-references component tests.
- **Profile import (db + extract).** Degrees and courses go to the right sections, re-import matches rather than duplicates, and full replace clears courses. Prior art: the profile-import-apply db tests and extract-profile tests.
- **Data export/import (db).** Round trip includes courses, and an export without `courses` still imports. Prior art: the data-export and data-import db tests.
- **Connector write (db).** save_application with `courses` writes `course:` units. Prior art: the connector write db tests.
- **Sections.** Courses & certificates sits after Education and is optional. Prior art: the sections tests.
- **Accessibility (e2e).** The existing axe run on the profile screen covers the new section once demo data has courses. Opening the section in that spec is enough.

Coverage thresholds must not drop.

## Out of Scope

- Expiry dates, credential IDs, or flagging expired certificates.
- Linking courses to skills (as roles and projects do).
- A separate "Certifications" section apart from courses.
- Automatically sorting existing Education entries into courses, with AI or with rules.
- Showing courses in cover letters beyond what the AI already reads from the profile.
- Changes to resume themes beyond adding the new block in the existing style.

## Further Notes

- This follows the pattern Publications (#218) set for adding a profile model, from schema to resume block to unit prefix. Use it as the template.
- Privacy: courses are profile data and are kept to the same rules: never logged, and only on a document when included.
- No GLOSSARY.md or ADRs exist yet. "Course" may be worth adding to the glossary once it's built.
