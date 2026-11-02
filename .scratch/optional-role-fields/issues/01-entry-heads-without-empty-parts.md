# 01 — Entry heads without empty parts

Status: ready-for-agent

Spec: `../spec.md` (all of it).

## What

- `EntryHead` in `src/components/documents/resume-document.tsx` builds each line from its non-empty parts, in inline, timeline and stacked layouts, including nested roles after a promotion:
  - no empty `.entryTitle` span: without a title, the organisation becomes the bold name;
  - no stray " | " in a nested stacked role without a title;
  - no empty `<p>` and no second stacked line with nothing on the left;
  - the head renders nothing when it has nothing.
- Stacked grid alignment (`.stacked .entryHead > :nth-child(even)`) still puts the dates and place in the end column.
- The experience form's Location field gets a hint saying it's optional, with remote work as the example.
- One sentence in DEVELOPMENT.md.

## Done when

- A role with no title and/or no location prints with no gap, stray separator or blank line in Editorial, Chronicle and Brief, and every other theme, on base and tailored resumes and in the PDF.
- The tests in the spec pass, and the snapshots are updated.
- Lint, typecheck, tests and the accessibility and resume e2e specs pass.

## Comments

- 2026-11-02: Implemented in `EntryHead` (`resume-document.tsx`), with the Location hint in `experience-section.tsx`, tests in `resume-document.test.tsx`, `resume-content.test.ts` and `experience-section.test.tsx`, and a sentence in DEVELOPMENT.md. The demo snapshots didn't change. Lint, typecheck, unit tests and the accessibility, resume and profile e2e specs pass. Not committed yet.
