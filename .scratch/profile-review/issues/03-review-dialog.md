# 03 — "Review my profile" on the profile screen

Status: done
Blocked by: 02

Spec: `../spec.md` ("Profile screen", "Errors").

## What

The header button (disabled without an AI provider), progress with `JobProgress`/`useJob`, the dialog with one card per fix (reason, before and after, Apply/Skip starting on Apply), Apply and Discard, the "nothing to fix" toast.

## Done when

A component test covers the cards, toggling, apply and the empty result; the screen passes axe.

## Comments

- 1 November 2026: built as its own page, `/profile/review?job=…`, like `/profile/import`, rather than a dialog: it survives a reload, follows the import's phases (start, progress, results) and gives a long list of fixes room. The header link is "Review my profile". Not yet seen in a browser: the e2e spec in 04 drives it.
