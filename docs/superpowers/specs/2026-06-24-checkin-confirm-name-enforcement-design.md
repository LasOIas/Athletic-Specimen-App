# Check-in confirm popup + first/last name enforcement — design

**Date:** 2026-06-24
**Batch:** C47 tail (grew out of rank35/44; rescoped by Mike into a real feature)
**Status:** design approved + §38 popup pick made (Option A center modal). Awaiting spec review → plan.

## Problem (Mike's words)
> "the players should just have to click the name and then a pop up comes up saying checkin or cancel,
> also with this we need to make it so every player has to put their first and last names otherwise it
> won't work, this needs to be enforced with new players cause that's how we get mixed up a lot with who
> is who."

Two real problems on the check-in surfaces:
1. **No confirmation on tap** — tapping a name checks in (or toggles) *immediately*, so a mis-tap silently
   checks in the wrong person.
2. **Single-name players** — new players can be added with just a first name, so the roster has ambiguous
   entries ("which Mike?"). This is the root of the "who is who" mix-ups.

## Ground truth (verified in code, 2026-06-24)
- `/checkin.html` register **already enforces** first+last (`checkin.html:420`).
- The two `app.js` doors do **NOT**: the in-app kiosk "I'm new" register (`app.js:~6608`, registers a
  single `name`) and the admin **Add/Update Player** modal (single `#admin-player-name` field,
  `app.js:5321`).
- Tap-to-check-in is immediate on both surfaces: `/checkin.html` suggestion `li` click →
  `checkInExisting` (`checkin.html:310`); the in-app kiosk big-name button toggles via
  `checkInPlayer`/`checkOutPlayer`.
- The native dialogs to remove live in `/checkin.html`: `alert()` fallback (`349`) + `confirm()`
  duplicate-name (`358`).

## Scope (Mike's decisions)
- **Confirm popup on BOTH surfaces** (in-app Check In tab + `/checkin.html`).
- **Enforce first+last EVERYWHERE new players are added** (admin Add-Player + both kiosk register paths).
- Popup visual = **§38 Option A — center modal card** (picked from 3 mockups: center modal / bottom sheet /
  inline expand). Reuses the app's existing `.popup-overlay`/`.popup-card` component on the in-app surface.

## Design

### Part A — confirm-on-tap popup
A styled center-modal confirm dialog: dimmed backdrop, card with the person's name (+ avatar initials),
a one-line question, a primary action button, and Cancel.

- **In-app Check In tab (`app.js`):** tapping a name no longer calls `checkInPlayer`/`checkOutPlayer`
  directly. It opens the confirm modal whose primary action is **state-aware**: "Check in" if the player
  is currently out, "Check out" if currently in (read from `state.checkedIn`, the live truth — see
  debugging.md "state.checkedIn is the live check-in truth"). Confirm runs the existing path; Cancel closes.
  Built on the existing `.popup-overlay`/`.popup-card` so it inherits the C48.2 `.popup` fade.
- **`/checkin.html`:** tapping a suggestion opens an equivalent modal **"Check in [Name]?" → Check in /
  Cancel** (check-in only — no toggle). A new lightweight `.dialog-*` component styled with the page's
  existing tokens. The native `confirm()` (duplicate-name) and `alert()` (error fallback) are **removed**;
  the duplicate-name case routes through this same confirm modal, and errors use the existing inline
  `.error` element (`#checkinError`/`#registerError`). Folds in rank35/44; the `finally`/cleanup path
  resets the row/button state on cancel and on error.

### Part B — first/last name enforcement
- **Shared rule (pure helper, TDD):** `isValidFullName(name)` → true iff, after `trim()` +
  whitespace-collapse, the name has **≥2 words** and each word is ≥1 char. ("Mike" → false; "Mike O" →
  true.) Add to `public/pure.js` (the tested pure-logic module) with unit tests in `/test`.
  - Open question for the plan: should the last word require ≥2 chars (reject "Mike O")? Default = ≥1 char
    (accept a last initial) unless Mike says stricter. Mike's AskUserQuestion answer = "Approved — build
    the mockups" (did not ask for stricter), so default to ≥1 char.
- **Apply at every add/register door**, blocking with an inline styled error ("Please enter a first and
  last name") when invalid:
  - in-app kiosk "I'm new" register (`app.js`),
  - admin Add/Update Player save handler (`app.js`, `#btn-save-player`),
  - `/checkin.html` register (already enforced — align the message + route through `isValidFullName`).
- **No retroactive rename** of the existing 212 roster rows. Existing single-name players remain; a data
  cleanup is a separate, later item if Mike wants it (flag in the history file).

### Error handling
No native `alert`/`confirm`/`prompt` anywhere on the check-in surfaces after this change. All feedback =
the existing inline `.error` pattern + the styled confirm modal.

### Components / boundaries
- `isValidFullName()` — pure, one job (name validity), tested in isolation.
- in-app confirm modal — reuses `.popup-overlay`/`.popup-card` + a small open/confirm/cancel controller.
- `/checkin.html` confirm modal — a self-contained `.dialog` block + show/hide helpers; no app.js coupling.

## Files touched
- `public/pure.js` — add `isValidFullName` (+ CJS export); tests in `test/`.
- `public/app.js` — in-app kiosk tap → confirm modal; in-app register + admin Add-Player → enforce
  `isValidFullName`; confirm-modal markup/CSS (reusing `.popup-*`).
- `public/checkin.html` — tap suggestion → confirm modal; remove native `confirm()`/`alert()`; route
  register through `isValidFullName`; add `.dialog` component.
- `public/styles.css` — confirm-modal `.dialog-*` styles if not fully covered by existing `.popup-*`.
- `APP_VERSION` (`public/app.js` ~22) + `SW_VERSION` lockstep (checkin.html is SW-precached).

## Verification plan
- `node --check public/app.js`; vitest green incl. new `isValidFullName` tests.
- Localhost browser (desktop + 390): tap a name → modal opens → Confirm checks in (DB cross-check) →
  Cancel closes with no write; mis-tap is recoverable. New-player + admin-add with a single name → blocked
  with inline error; with first+last → succeeds.
- Prod after deploy (both surfaces): same gestures, 0 console errors, prod DB left clean.
- §27 9-question + §41 (desktop + mobile) on both surfaces.

## Risks
- `app.js` is large (~9,700 lines) — the in-app kiosk tap handler must change from direct-action to
  modal-gated without breaking the existing toggle semantics or the C48.3 surgical-render path. Trace the
  current handler before editing.
- The in-app confirm modal must not be captured/wiped by background `partialRender` (cf. the C36/C48
  modal-capture bugs) — it lives outside `.players`, like the player-edit modal.
- checkin.html is SW-precached → version bump must be lockstep or the kiosk serves stale.
