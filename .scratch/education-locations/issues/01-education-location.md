# 01 — A location for each degree

Status: done

Spec: `../spec.md` (all of it).

## What

- `Education.location` (migration `education_locations`), through `EducationItem`, profile data, the demo profile and the seed.
- A Location field in the education form and in the list subtitle; `saveEducation` / `restoreEducation` keep it, including undo after moving to Courses.
- Resume content and document: the degree's place after the school, under the same `showLocations` rule as roles.
- "Work locations on resumes" relabelled "Locations on resumes"; the Locations switch shows when a role or a degree has a location; the tailoring question covers where the candidate studied. Bump `TAILOR_RESUME_VERSION`.
- Extract-profile reads it (bump its version); profile review sends, compares and applies it (bump its version); the fact guard and get_profile include it.
- Data export/import with `location` optional for older exports.
- Fake AI and Jane Doe sample give a degree a location.

## Done when

- A degree's location can be typed in the profile and prints on base and tailored resumes when locations show, in every theme.
- An imported resume fills it in; a profile review keeps it; a backup round trip keeps it and an older export still loads.
- Tests as in the spec; lint, typecheck, tests and the affected e2e specs (accessibility, profile, resume) pass.
- DEVELOPMENT.md and README.md describe it.
