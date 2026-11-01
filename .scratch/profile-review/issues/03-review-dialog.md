# 03 — "Review my profile" on the profile screen

Status: ready-for-agent
Blocked by: 02

Spec: `../spec.md` ("Profile screen", "Errors").

## What

The header button (disabled without an AI provider), progress with `JobProgress`/`useJob`, the dialog with one card per fix (reason, before and after, Apply/Skip starting on Apply), Apply and Discard, the "nothing to fix" toast.

## Done when

A component test covers the cards, toggling, apply and the empty result; the screen passes axe.
