# Groups for experience, projects and education

Status: needs-triage

Slice 1 (experience groups end to end) is done; the other slices in Further Notes are still open.

## Problem Statement

Every role in the profile lands under one "Experience" heading on the resume. That fits a straight career, but not someone with two kinds of work behind them. A person moving from tech into the non-profit sector has third-sector roles (paid or volunteer) and corporate tech roles. They want the resume to show them as two blocks, for example "Esperienze nel terzo settore" and "Esperienze professionali", so that a reader sees both sides at a glance.

Today the only way to fake this is to reorder roles by hand and hope the dates don't make it look odd. The blocks also need a different order per job. A non-profit posting should open with the third-sector roles, while a tech posting should open with the tech ones. Tailoring can't help, because it keeps every role in the profile's order under one heading.

The same need shows up elsewhere. Projects split into "Open source" and "Community projects", and education into "Degrees" and "Third-sector training". Group headings also have to work on resumes written in other languages, and a resume imported with its own headings ("Volunteer experience") loses them today.

## Solution

The person can create their own **groups** in the Experience, Projects and Education sections, each with a name they write ("Esperienze nel terzo settore", "Esperienze professionali"), and put each entry in one group. Groups are optional: a profile without groups works and looks exactly as it does now.

On a resume, each group becomes its own heading with its entries under it. Entries without a group go under the section's usual translated heading ("Experience", "Projects", "Education").

A group can also have names in other languages. A resume uses the group's name in its own language when there is one. Otherwise, a tailored resume gets a heading translated by the AI for that resume, which the person can edit. A group can be kept off resumes altogether, and a single tailored resume can drop a whole group in one step.

On a tailored resume, the AI picks which group comes first in each section for that posting. Entries stay in the profile's order within each group. The person can still move blocks around in the editor afterwards.

Groups can come from three places: the person makes them, a resume import creates them from the resume's own headings, or a profile review suggests them. Imports and suggestions are only applied when the person accepts them.

## User Stories

### Making and managing groups

1. As a job seeker with two kinds of work history, I want to create named groups for my experience, so that my resume shows them as separate blocks.
2. As a job seeker, I want to group my projects and my education the same way, so that every long section can be split.
3. As a job seeker, I want to name each group in my own words and language ("Esperienze nel terzo settore"), so that the heading reads the way I want.
4. As a job seeker, I want to put each entry in a group from the entry's form, so that sorting my history is quick.
5. As a job seeker, I want to leave an entry without a group, so that I don't have to sort everything at once.
6. As a job seeker, I want to rename a group, and have every resume use the new name, so that a typo is fixed in one place.
7. As a job seeker, I want to reorder groups within a section, so that my base resume shows the group I care about most first.
8. As a job seeker, I want to delete a group without losing its entries, so that removing a heading never removes my history.
9. As a job seeker, I want to undo deleting a group, as with other entries, so that a slip isn't permanent.
10. As a job seeker, I want each section in my profile to show entries under their groups, so that I can see the structure my resume will have.
11. As a job seeker who doesn't use groups, I want my profile and resumes to look exactly as they do now, so that the feature costs me nothing.
12. As a job seeker, I want "newest first" and manual ordering to keep working within each group, so that ordering behaves as I expect.
13. As a job seeker, I want a promotion (two roles at one company) to stay together under the company when both roles are in the same group, so that promotions read as they do now.

### Resumes

14. As a job seeker, I want my base resume to show one heading per group, in my group order, so that it matches my profile.
15. As a job seeker, I want entries without a group shown under the section's translated heading, after my groups, so that nothing goes missing.
16. As a job seeker pivoting into non-profit work, I want a tailored resume for a non-profit posting to open with my third-sector group, so that the most relevant experience is read first.
17. As a job seeker, I want a tailored resume for a tech posting to open with my tech group, so that the same profile serves both directions.
18. As a job seeker, I want tailoring never to move an entry into a different group, rename a group or drop a group, so that the structure I chose stays mine.
19. As a job seeker, I want to change a tailored resume's group order in the editor, so that I keep the final say.
20. As a job seeker, I want the resume's page-fit and timeline layouts to handle several headings per section, so that every theme still looks right.

### Headings in other languages

21. As a job seeker who writes resumes in several languages, I want to give a group a name in each language ("Non-profit experience" next to "Esperienze nel terzo settore"), so that an English resume gets an English heading.
22. As a job seeker, I want a resume in a language with no name for a group to fall back to the group's main name on my base resume, so that the heading is never empty.
23. As a job seeker, I want a tailored resume in a language with no name for a group to get a heading translated by the AI, so that the resume reads in one language.
24. As a job seeker, I want to edit that translated heading in the resume editor, so that I can fix the wording.
25. As a job seeker, I want to save an edited translated heading to the group in my profile, so that I write it only once.

### Keeping groups off resumes

26. As a job seeker, I want to switch a whole group off resumes, so that a group I keep only for my records never shows.
27. As a job seeker, I want entries in a switched-off group never to reach the AI or a resume, base or tailored, so that the switch is reliable.
28. As a job seeker, I want to remove a whole group from one tailored resume in one step, and undo it, so that an off-topic block doesn't need deleting entry by entry.

### Groups from imports and profile reviews

29. As a job seeker importing a resume that already has separate headings ("Volunteer experience", "Work experience"), I want the import to create matching groups and put each entry in its group, so that my structure carries over.
30. As a job seeker re-importing, I want headings that match a group I already have to reuse that group, so that importing twice doesn't duplicate groups.
31. As a job seeker, I want the import preview to show the groups it will create, so that I know what's about to change.
32. As a job seeker, I want a profile review to suggest grouping entries when my history covers clearly different fields, so that I discover the feature when it would help.
33. As a job seeker, I want to accept, edit or dismiss a suggested group like any other review fix, so that the AI never restructures my profile on its own.

### Connector and backups

34. As a job seeker using the Claude connector, I want get_profile to show my groups and each entry's group, and save_application to keep entries grouped, so that Claude-written drafts have the same structure.
35. As a job seeker, I want my groups in a data export and restored by a data import, so that a backup is complete.
36. As a job seeker, I want an export from before this change to still import, so that old backups keep working.

## Implementation Decisions

**Domain term.** A **group** is a named block of entries within one profile section, made by the person or accepted from an import or a review. User-facing copy says "group". Each entry is in at most one group. Add it to GLOSSARY.md.

**Schema.** A new `EntryGroup` model:
- `section`: a new `GroupSection` enum (`experience` | `project` | `education`)
- `name` (default empty): the main name, used when no other name fits
- `names` (JSON, default `{}`): a map from a "Write documents in" language tag (`en`, `it`, …) to that language's name, checked by a zod schema in `application-data.ts`
- `onResumes` (default true), meaning the same as on Course and Publication
- `sort`, `createdAt`, `updatedAt`

`Experience`, `Project` and `Education` each gain an optional `groupId` with `onDelete: SetNull`, so deleting a group leaves its entries ungrouped instead of deleting them. An entry's group must belong to the same section. Actions enforce this.

Courses and publications aren't grouped. Courses already have their own block, and publications keep the profile's order word for word (#218).

**Profile data.** The profile type gains `groups: { id, section, name, names, onResumes }[]` in `sort` order. Experience, project and education items each gain `groupId: string | null`. Profile strength is unchanged.

**Profile sections.** Each of the three sections gets a small "Groups" area: add, rename (autosave), names in other languages, "Show on resumes", reorder and remove with undo. It reuses the entry-list patterns. The other-language names are rows of language select plus name, offering the "Write documents in" languages. When a section has groups, each entry's form has a "Group" select (with "No group" first), and the list shows entries under group subheadings. With no groups, the section looks as it does today, apart from an "Add a group" action. Undoing a removed group restores it with its names and puts its entries back in it.

**Ordering.** Each section's order setting (`experienceOrder`, `projectOrder`, `educationOrder`) applies within each group. Moving an entry to another group keeps its `sort` and doesn't renumber the others. Entries are reordered within their group in the profile list.

**Heading names.** `groupHeading(group, languageTag)` returns `names[languageTag]` when set, otherwise `name`. Ungrouped entries use the section's translated label (`labels.experience`, `labels.projects`, `labels.education`). No new translated label is needed.

**Resume content.** `experience`, `projects` and `education` in `ResumeContent` each become a list of sections: `{ groupId: string | null, title: string, entries: [...] }`. For experience, `entries` are the existing company groups, worked out within the section, so `companyGroups` runs per group.
- Groups with `onResumes` off, and their entries, are left out of every resume.
- Base resume: groups in `sort` order, each titled by `groupHeading`, then the ungrouped entries.
- Tailored resume: sections in the order their first entry unit appears. Unit order already decides entry order (`withUnit`), so the editor's move up/down changes group order with no new state. A section's title is the text of its `group:<id>` unit when there is one, otherwise `groupHeading`.
- A section without groups gives one section titled with its usual label, so the output matches today's.

**Heading units.** A tailored resume stores a `group:<id>` unit for each group whose heading was translated by the AI, labelled "<group name> heading". It's edited like the headline unit. The resume editor offers "Save to profile" on it, which writes the text into the group's `names` under the resume's language.

**Removing a group from one resume.** The resume editor gets a "Remove group" action on each group heading. It deletes that group's entry units (and its heading unit) from this resume in one step, with undo. Nothing changes in the profile.

**Resume document.** Render one `DocumentSection` per section entry instead of one per section. Page-limit and timeline code that assumes a single block per section (`page-limit.ts`, and the text collected at the top of `resume-document.tsx`) loops over sections instead.

**Tailoring (AI).** The tailor-resume answer gains:
- `groupOrder: string[]`: group ids, most relevant to the posting first, across all three sections
- `groupHeadings: { id, heading }[]`: a heading in the resume's language for each group with no name in that language

The prompt lists each entry with its group name, plus each group's main name and whether it needs a heading. The instruction says to order groups by relevance to the posting, to translate headings faithfully without adding claims, and never to move entries between groups or leave a group out.
- `resumeUnits` emits each section's entry units group by group in that order, then the ungrouped entries. Entries stay in profile order within a group. It also emits a `group:<id>` unit for each translated heading.
- Unknown ids are ignored. Groups the model left out follow in profile order, and a missing heading falls back to `name`.
- Translating a heading isn't inventing a fact, so strict mode allows it. The fact guard doesn't check heading units.
- Bump `TAILOR_RESUME_VERSION`.

**Cover letter.** No change. It's written from the tailored resume's text.

**Import (AI).** The extract-profile answer gains a `group` string on each experience, project and education entry: the resume heading it was under when the resume has more than one heading for that kind of entry, otherwise empty. The instruction says to copy headings word for word and to leave `group` empty when the resume uses one standard heading ("Experience", "Education"). Bump its version.
- Applying an import matches each heading to an existing group in the same section by name or any of its `names`, ignoring case and spacing (as `companyKey` does). Unmatched headings become new groups, and their entries are assigned to them.
- The import preview lists the groups to be created.
- A full replace clears groups too.

**Profile review (AI).** Profile review gains a `group` fix: `{ kind: "group"; section; name; ids; reason }`. Accepting it creates the group with the name as shown (editable before accepting) and assigns those entries. It's suggested only when a section has at least four ungrouped entries that clearly split into different fields, and never when the section already has groups. Its fingerprint and conflict keys follow the existing fixes. Bump the review task's version.

**Connector.** get_profile includes `groups` (without `onResumes`-off groups or their entries) and each entry's `groupId`. save_application accepts optional `groupOrder` and `groupHeadings`, and writes the units the same way tailoring does.

**Export/import.** The data export gains `groups` and each entry's `groupId`. Data import restores them, and treats both as optional so older exports still load.

**Fakes and seed.** The fake AI's tailor answer gains `groupOrder: []` and `groupHeadings: []`. The fake extract answer gives `group: ""`, and the fake review answer gives no group fix by default. Jane Doe's demo profile stays ungrouped, so the default look stays covered by the e2e tests. A db test fixture covers a grouped profile with an Italian main name and an English name.

**Docs.** DEVELOPMENT.md and README.md describe groups, their languages, and how imports and reviews create them.

## Testing Decisions

Test behaviour you can see from outside, at the highest existing seam.

- **Resume content (pure).**
  - No groups gives today's single section per kind.
  - Groups come out in `sort` order with the ungrouped entries last.
  - A promotion split across two groups shows in both.
  - A switched-off group and its entries are gone.
  - A tailored resume follows unit order, and a heading unit replaces the title.
  - `groupHeading` picks the language's name or falls back to `name`.

  Prior art: the experience and location cases in `resume-content.test.ts`.
- **Resume document.** Several headings render per section, a group heading prints as typed, and an ungrouped heading is translated. Prior art: `resume-document.test.tsx`.
- **Tailor-resume answer → units.**
  - `groupOrder` puts the units in group order, unknown ids are dropped, and missing groups follow in profile order.
  - Headings become `group:<id>` units only for groups without a name in the resume's language.
  - Switched-off groups never reach the prompt.

  Prior art: the tailor-resume task tests.
- **Profile actions (db).**
  - Create, rename, set names, switch off, reorder and remove a group; removed groups leave their entries ungrouped, and undo puts them back.
  - Assign an entry, and refuse a group from another section.
  - "Save to profile" from a heading unit writes the name.

  Prior art: `profile/actions.db.test.ts`.
- **Profile sections (component).** The group select appears only when the section has groups, entries show under their groups, and names in other languages autosave. Prior art: the experience-section tests.
- **Resume editor (component).** "Remove group" removes its units in one step and undo restores them.
- **Profile import (db + extract).** Separate headings create groups, re-import reuses them, a single standard heading creates none, and a full replace clears them. Prior art: the profile-import-apply db tests.
- **Profile review.** A group fix applies, and it isn't offered for a section that already has groups. Prior art: the profile-review-apply tests.
- **Data export/import (db).** A round trip keeps groups, names and assignments, and an old export without them still imports.
- **Connector write (db).** save_application with `groupOrder` and `groupHeadings` writes the units in order.
- **Accessibility.** `e2e/accessibility.spec.ts` covers the profile screen with the new controls and the resume editor's heading actions.

## Out of Scope

- Groups for courses and publications.
- Groups across sections (a Projects entry under an Experience heading).
- Tailoring creating, renaming or reassigning groups, or dropping a whole group by itself. Group structure stays the person's choice, and the AI only suggests it through profile review (story 33).

## Further Notes

Suggested by the user, who is moving from tech into the non-profit sector and wants "Esperienze nel terzo settore" and "Esperienze professionali" kept apart. Suggested slicing: (1) experience groups end to end, (2) projects and education, (3) headings in other languages, (4) keeping groups off resumes and "Remove group", (5) import, (6) profile review suggestions.
