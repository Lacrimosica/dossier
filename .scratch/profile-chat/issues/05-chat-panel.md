# 05 — The "Add with AI" panel

Status: done
Blocked by: 04

Spec: `../spec.md` ("Panel", stories 1–19).

## What

- `src/app/(app)/profile/profile-chat.tsx`: the button in the profile header, plus a side panel (a sheet on narrow screens) from `ui/` primitives, modelled on `applications/[id]/refine-panel.tsx`. It has the messages, the text box (Enter sends, Shift+Enter is a new line), progress, and change cards with Apply, Edit (inline, reusing the section's fields), Dismiss and "Apply all".
- After applying, the card shows "Added" or "Changed" with a link that scrolls to and highlights the entry, the section refreshes, and `toastResult` offers Undo.
- "Check this" on unverified words. In strict mode Apply stays off until the change is edited or "This is right" is ticked.
- The conversation is component state only. The panel shows the usual notice when no AI provider is set up.

## Done when

`profile-chat.test.tsx` covers each card type, Apply, Edit, Dismiss, "Apply all", Undo, the strict-mode lock, and closing forgetting the chat. It works by keyboard alone, and focus returns to the button on close.
