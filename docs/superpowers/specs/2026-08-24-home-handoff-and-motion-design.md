# Home handoff + Motion system — design spec (2026-08-24)

**Source of truth:** Mike's own Claude Design handoffs, delivered 2026-08-24 as five zips
(home, motion, tournament, manage, account). Text files archived at
`docs/design-handoffs/2026-08-24/<name>/` (screens + CSS/JS + README; the PNG screenshots stay in
`C:\Users\OlasM\Downloads\Athletic Specimen <name>.zip`). **This slice ports HOME + the app-wide
layer + MOTION.** Tournament, Manage (incl. check-in) and Account are separate slices.

All five zips carry byte-identical `_shared.css`, `_shared.js`, `_motion-app.css`, `_motion-app.js`,
`_rounds.css` and `_tournaments.js` — the app-wide layer is ONE artifact.

## Where the design and the README disagree, the SCREENS + the dated `_rounds.css` / `_shared.css` comments win

The README is cross-handoff boilerplate. Verified-false README lines (do NOT implement): email
validation on the register form (no email field exists); "Fill in every field." (string does not
exist); a toast after submit (the success screen IS the confirmation); the install hint shown "only
when standalone-capable" (prod's inverse is correct: it shows in `display-mode: browser`);
CLOSED in `--muted` (the round was commissioned to make it red); the Details card's 36px/10px/20px
numbers (the CSS says 30px/9px/16px); the `oklch(0.62 0.02 75 / .28)` scrim (the screens render
prod's scrim untouched).

## Mike's four decisions (AskUserQuestion, 2026-08-24 — all the recommended option)

1. **Venue data → add columns.** Migration `0058`: `tournaments.venue text`, `tournaments.venue_address
   text`, both nullable, no defaults (0057's reasoning). Edited in Manage → Event settings. Client
   gated on `tournamentColumnLoaded()` exactly like 0057: until the migration is applied the venue row
   keeps an honest fallback and the Copy action does not render. Mike applies the migration (C90
   precedent: via the Supabase MCP after he authorises it).
2. **Motion → the full system, guarded.** All five layers ship; every ENTRANCE rule is gated behind
   `body.m-enter`, which only real navigation sets (`activateMainTab`, the Tournament sub-page push)
   for 700ms — `partialRender` (the 15s poll) and keystroke repaints never set it. Wildcards narrowed to
   prod's explicit classes. The MutationObserver is NOT ported; `mPlay()` is called at the explicit
   sites (score value bump, winner-row flash). Prod's existing motions (the two toasts, the register
   sheet, the QR modal, the check-in press) move onto the new durations/curves, keeping their SHAPE (the
   sheet still travels the full height; the check-in row keeps its 1px dip).
3. **Rules → sheet on Home, page stays.** The Details card's Rules action opens the whole
   `tournaments.rules` document (`rulesToHTML`, one formatter, one column — a subset is impossible) in a
   body-appended `#hm-rules-modal.popup-overlay`. The Tournament hub row and the register form's "Read the
   rules" keep the full page and its `rulesReturnView` back-stack. **The Rules action does not render when
   the tournament has no rules text** (no stub on the front door).
4. **Shell layer → app-wide now.** Header grid (sync line under the avatar), sticky `.pd-pagehdr`,
   watermark 300px/.075, scrollbar restyle, `.pl-sect` accent heads. The six `_shared.css` blocks that
   belong to other screens (score card, pools caption, event-settings cards, rules editor, pools
   controls, bracket flow override + live scoring) wait for their handoffs.

## Decisions I made (CORE-2 straight take, stated once)

- **Keep the Mike-verified payment sub-line** "Teams pay to register. Your spot is held once it's sent."
  The design shortened it to "Teams pay to register." (drops the only held-spot promise on the screen;
  Mike signed the long line off on 2026-07-16). Mike can overrule.
- **Venue mapping** (the design shows THREE values: name, descriptor line, clipboard string; the
  schema gets TWO): row fact = `venue`, row sub-line = `venue_address`, clipboard =
  `venue + ', ' + venue_address`. Every shown value is real. Fallback row when unset: fact
  "Location", sub "Posted in GroupMe" (today's honest copy, in the card's two-line grammar).
- **The Rules button's `:focus` defect** (the handoff's `.hmv-copy:focus` hides its only label, so the
  button goes blank green on tap): every `:focus` selector in `_rounds.css:1730-1737` is dropped; the
  copy confirmation is driven by `.is-done` alone (the round's own comment says `:focus` was the
  canvas stand-in). `.hmv-copy` gets a `:focus-visible` ring instead.
- **`body.no-motion` and `data-m-leave` are not ported** — nothing in the app sets or emits them; the
  OS `prefers-reduced-motion` setting governs. Prod's reduce block gains `animation-delay: 0ms
  !important` (without it a reduce-motion user gets a blank staggered page).
- **No `scroll-behavior: smooth` on `.tab-panel`.** The app restores `scrollTop` programmatically after
  every partial repaint; smooth would animate those restores — the exact scroll-jump class Mike rates
  worst. Scrollbar styling ships; the "manners" retarget to the real scroller (`.tab-panel`), not
  `html/body/#app-content`, which never scroll in prod.
- **`.hm-detail:last-of-type` → `:last-child`** (a live prod bug: the third Details row draws a stray
  hairline today because `.hm-a2hs` is the last sibling).
- **CSS lands appended** to `public/styles.css` (one file, one request, the 2026-08-03 precedent), the
  motion JS lands in `public/app.js` (no build step). The only `!important` added is the documented
  iOS zoom-guard counter (`font-size: 12.5px !important` on `.hmv-copy`).
- **Tournament-live entrance on phones**: `.hm-rail`/`.hm-board` are `display: contents` below 1024px,
  so the stagger targets their children there (the handoff only ever captured the ≥1024 branch).

## Global constraints (every task)

- `APP_VERSION` (`public/app.js:28`) bumps to `'2026.08.24.N'` on every push; `node --check public/app.js`
  after every edit; commit + push per shipped task.
- `partialRender()` for background syncs; never a full `render()` from a poll.
- No em dashes in player-facing copy. No neon (§51). Player skill never on a public surface.
- 390px is the primary viewport; desktop is `@media (min-width: 1024px)`.
- Tests: vitest, NO jsdom — builders are asserted as strings through the `vm` sandbox bridge
  (`test/manage-page.test.js` pattern); wiring is asserted at source level.
- Appended CSS wins by order; no `!important` escalation beyond the one documented above.

## Recon record

`C:\Users\OlasM\AppData\Local\Temp\claude\...\scratchpad\recon.json` (7 Opus agents, 2026-08-24) —
the per-area design-vs-prod deltas with file:line anchors; the vault's `12-history` entry for this
task carries the digest.
