# Handoff: Manage (the organizer's control room)

## Overview

Manage is the organizer's side of the product: set a tournament up, open and close sign-ups, check players in, build teams and pools, run the bracket, keep the rules, and close the event out. 49 screens including the two check-in kiosk flows (a station a club runs on a laptop or tablet at the door).

## About the design files

The files in `design/` are **design references created in HTML** — prototypes that show the intended look and behaviour. They are not production code to copy.

The task is to **recreate these designs inside the target codebase's own environment** (React, Vue, SwiftUI, native, whatever it uses) using its established patterns, component library and routing. If no environment exists yet, pick the framework that fits the product and build the designs there.

`_as.css` is a single `@import` of the app's real shipped stylesheet
(`https://athletic-specimen.com/styles.css`) — so the prototypes inherit production
tokens live. In a real codebase, use the existing stylesheet/tokens rather than
re-importing that URL. `_rounds.css` and `_shared.css` are the round-by-round
additions made during design; treat them as the spec for what changed, not as
files to ship.

## Fidelity

**High fidelity.** Colors, type, spacing, radii, shadows, motion and copy are all final. Recreate the UI pixel-perfectly with the codebase's own primitives.

## How to open the prototypes

Every screen in `design/screens/` is a standalone HTML file — open it directly. The page file (e.g. `design/tournament.html`) is a **canvas**: it wraps the screens in a phone frame, has a state picker, and wires the navigation between them. Open the canvas to walk a flow; open a screen to inspect one state.

## Screens

Screenshots in `screenshots/`, full-height, 2×. Phone screens are 430px wide; kiosk screens are 980px.

### The hub — three phases of one page

| # | Screen id | Screenshot | Purpose |
| --- | --- | --- | --- |
| 1 | `mg-hub` | `01-mg-hub.png` | Manage hub, ordinary state. |
| 2 | `mg-hub-setup` | `02-mg-hub-setup.png` | Before sign-ups: setup work is what the page is about. |
| 3 | `mg-hub-live` | `03-mg-hub-live.png` | Game day: the live ops strip (nets in play, idle time) is on top. |

The hub is a five-part control room, in this order:

1. **Phase track** — Setup → Sign-ups → Check-in → Pools → Bracket → Done, with the current phase marked. It is the page's spine: everything below is scoped to where the tournament actually is.
2. **Quick actions** — Open / Close registration, Add a team. Primary + secondary buttons in a row.
3. **Needs you** — one-tap fixes for the things blocking progress (unpaid teams, unassigned players, a pool with the wrong count). Each item is an action, not a notification.
4. **Live ops strip** (game day only) — nets in play, which games are live, how long a net has been idle.
5. **Stateful rows** — the rest of the tools; a row highlights only when it is relevant to the current phase.

### Setup, players, teams

| # | Screen id | Screenshot | Purpose |
| --- | --- | --- | --- |
| 4 | `mg-tournament-new` | `04-mg-tournament-new.png` | Create a tournament. |
| 5 | `mg-checkin` | `05-mg-checkin.png` | Check players in from the organizer's phone. |
| 6 | `mg-checkin-undo` | `06-mg-checkin-undo.png` | The undo state right after a check-in. |
| 7 | `mg-players` | `07-mg-players.png` | Player list with search and Select mode. |
| 8 | `mg-player-edit` | `08-mg-player-edit.png` | Edit one player. |
| 9 | `mg-teams` | `09-mg-teams.png` | Teams and their rosters. |
| 10 | `mg-teams-empty` | `10-mg-teams-empty.png` | No teams yet. |
| 11 | `mg-teams-swap` | `11-mg-teams-swap.png` | Swap two players between teams. |
| 12–16 | `mg-teams-move-a` … `mg-teams-move-c` | `12-`…`16-` | The move-players flow, step by step (pick a player → pick a destination → confirm → result). |
| 17 | `mg-pickup-list` | `17-mg-pickup-list.png` | Pick-up players waiting for a team. |
| 18 | `mg-pickup-form` | `18-mg-pickup-form.png` | Add a pick-up player. |
| 19 | `mg-qr` | `19-mg-qr.png` | The QR players scan to self-check-in. |
| 20 | `mg-admins` | `20-mg-admins.png` | Who can manage this club. |
| 21 | `mg-admin-remove` | `21-mg-admin-remove.png` | Remove an admin (confirm). |
| 22 | `mg-activity` | `22-mg-activity.png` | Activity log — who changed what. |
| 23 | `cop-chat` | `23-cop-chat.png` | The organizer copilot panel (`body.copilot-open`). |
| 24 | `modal-confirm-danger` | `24-modal-confirm-danger.png` | The shared destructive-confirm modal. |

### Running the tournament

| # | Screen id | Screenshot | Purpose |
| --- | --- | --- | --- |
| 25 | `mgts-hub` | `25-mgts-hub.png` | The tournament's own control page (current design). |
| 26 | `mgts-hub-v1` | `26-mgts-hub-v1.png` | The earlier version, kept for reference — **superseded**. |
| 27 | `mgts-reset-confirm` | `27-mgts-reset-confirm.png` | Reset the tournament: type the name to confirm. |
| 28 | `mgts-delete-confirm` | `28-mgts-delete-confirm.png` | Delete the tournament: type the name to confirm. |
| 29 | `mgts-registration` | `29-mgts-registration.png` | Registration settings and status. |
| 30 | `mgts-teams-pay` | `30-mgts-teams-pay.png` | Who has paid — a plain left-aligned `PAYMENT` column head, checkmark discs for paid. |
| 31 | `mgts-team-add` | `31-mgts-team-add.png` | Add a team by hand, including the "Marked paid" switch. |
| 32 | `mgts-team-sheet` | `32-mgts-team-sheet.png` | One team: roster, payment, pool, games. |
| 33 | `mgts-pools-setup` | `33-mgts-pools-setup.png` | Draw the pools. |
| 34 | `mgts-pools-live` | `34-mgts-pools-live.png` | Pools running, with the controls panel: per-pool cards, **Edit nets** on each header, **Move ›** on every team row, and Reset pools in its own danger block. |
| 35 | `mgts-scoresheet` | `35-mgts-scoresheet.png` | The pool score sheet. |
| 36 | `mgts-bracket` | `36-mgts-bracket.png` | The organizer's bracket page. |
| 37 | `mgts-bracket-score` | `37-mgts-bracket-score.png` | The bracket score card: seeds, records, the stakes line, WINNER pill. |
| 38 | `mgbk-run` | `38-mgbk-run.png` | Run the whole bracket: 8 teams seeded out of pools, all 14 games, empty to champion. |
| 39 | `mgts-settings` | `39-mgts-settings.png` | Tournament settings (switches, fields, Save + status line). |
| 40 | `mgts-rules-view` | `40-mgts-rules-view.png` | The rules sheet as the organizer owns it: every section a card with an **Edit** pill, **Edit all** in the header, **+ Add a section** at the end. |
| 41 | `mged-editor` | `41-mged-editor.png` | The full rules editor. |
| 42 | `mgts-closeout` | `42-mgts-closeout.png` | Close the tournament out. |

### Check-in kiosk (980px — a station at the door)

| # | Screen id | Screenshot | Purpose |
| --- | --- | --- | --- |
| 43 | `ci-kiosk-idle` | `43-ci-kiosk-idle.png` | Idle attract state. |
| 44 | `ci-kiosk-results` | `44-ci-kiosk-results.png` | Search results for a name. |
| 45 | `ci-kiosk-confirm` | `45-ci-kiosk-confirm.png` | Confirm the person, check them in. |
| 46 | `kiosk-search` | `46-kiosk-search.png` | The alternate kiosk flow: search. |
| 47 | `kiosk-nomatch` | `47-kiosk-nomatch.png` | No match found. |
| 48 | `kiosk-register` | `48-kiosk-register.png` | Register at the door. |
| 49 | `kiosk-success` | `49-kiosk-success.png` | Checked in. |

Kiosk screens carry no `body` class and are styled by `_kiosk.css`; the others are `body.pd-public-active` (plus `copilot-open` on `cop-chat`).

## Interactions & behaviour

**Scoring** — the score card is shared with the player side (full spec in Components). Organizer specifics: the bracket card adds a **stakes line** ("Winner → Championship · G14 / Loser → losers bracket · G9") and shows seeds and pool records under each team name. A tie with no pick is refused.

**Running the bracket** (`mgbk-run`)

- The three ready games hold Nets 1–3 and show **LIVE**. Tapping one opens the card with both teams, seed, pool record and what is at stake.
- Saving advances the winner and drops the loser into their losers-bracket slot, so "Winner of G7" becomes a real team name, the next games unlock, nets reassign to whatever is playable, and the progress bar moves.
- Games still waiting on feeders are not tappable. Any finished game reopens to be corrected; if a correction invalidates later games, those clear themselves.
- One-step **Undo** after each save. **Clear every score** (tap twice) resets the tree.

**Pools controls** (`mgts-pools-live`)

- **Move ›** on a team row opens "Move Net Gains to → Pool B / Cancel" under the row; picking relocates the team to that pool's card with a green flash and updates both counts.
- **Edit nets** turns the nets label into a field and the button into **Save nets**.
- **Done** closes the controls panel.
- **Reset pools** asks you to type the tournament name (blocked while empty), then clears every score, DONE/LIVE badge and standing (0–0 / 0).

**Rules** (`mgts-rules-view`)

- Each section's **Edit** edits in place: head and every rule become prefilled fields, cursor in the name; **+ Add a rule** appends; Enter moves on; **Done** puts them back as text.
- **Edit all** in the header opens the full editor (`mged-editor`).
- Saved changes appear on the players' Rules page immediately.

**Settings and forms**

- Any toggle or typed change flips **Save** from disabled to live and the status line from "Saved" to "Unsaved changes"; saving returns it to "Saved". The handler is generic — the "Marked paid" switch on Add a team uses it too.
- Destructive actions live in a danger block behind a rule and require typing the tournament name.

**Navigation**

- Hub rows route to screens; a row pointing at a screen this page does not own jumps to the page that owns it and opens it directly.
- Page headers are sticky to the top of the scroll region, so the back chevron and title stay reachable at any scroll position.

## State

| State | Values | Drives |
| --- | --- | --- |
| `phase` | `setup` · `signups` · `checkin` · `pools` · `bracket` · `done` | the phase track, which hub rows highlight, which quick actions show |
| `registrationOpen` | bool | Open/Close registration |
| `needsYou[]` | `{kind, count, action}` | the Needs-you list |
| `nets[]` | `{id, game, since}` | live ops strip (idle time) |
| `players[]`, `teams[]` | rosters, paid flags, pool ids | players/teams screens, pools, check-in |
| `pools[]` | `{id, nets, teams[]}` | pool cards, moves, standings |
| `games[]` | `{id, net, teams, score, status, liveScore}` | score sheet, bracket, live ops |
| `bracketTree` | 14 games with feeders/losers links | `mgbk-run` advancement, clearing invalidated games |
| `undoStack` | last save | one-step Undo |
| `dirty` | bool per screen | Save button + status line |
| `selection` | ids | Select mode in the player list, move flow |

## The app shell (every screen sits in it)

```
#root > #app-shell
  ├── img.pd-watermark          background wordmark, opacity .07, decorative
  ├── header#app-header.pd-header   sticky, top: 0, z-index 60
  │     ├── .pd-wordmark  → .pd-wm-1 "ATHLETIC SPECIMEN" (display 800, tracked)
  │     │                   .pd-wm-2 "COLORADO" (11px, tracked, muted)
  │     ├── .shared-sync-notice "Updated 7:42 PM" — caption line under the wordmark
  │     └── .pd-avic  profile bubble, pinned far right, vertically centred on the block
  ├── #app-content              the app's scroll region
  │     └── .tab-panel.active > .container   one screen
  └── nav#bottom-nav            Home · Tournament · Manage (organizer build)
```

- Header is a 2-column grid (`minmax(0,1fr) auto`), 2 rows, `column-gap: 14px`, `row-gap: 1px`.
- Page headers inside a screen (`.ph-pagehdr` / `.pd-pagehdr`) are **sticky to the top of the scroll region** (`top: 0; z-index: 40`), span the gutters (`margin-inline: -8px; padding-inline: 8px`), and only show their hairline shadow once content is behind them. Back chevron + eyebrow + title live inside.
- The player build shows a two-item tab strip under the header (Home · Tournament) with an accent underline on the active tab; the organizer build shows `#bottom-nav` with three items, active item in `--accent` with `aria-current="page"`.
- Screens are authored mobile-first at a **430px** content width. Kiosk screens are the exception (designed for a laptop/tablet at ~980px).

## Shared components

**Card** — `.card`: `--card` fill, 1px `--border`, radius 16px, `--shadow-sm`, padding 14–16px. Section head inside is an 11px uppercase eyebrow in `--muted`.

**List row** — 12px vertical padding, 1px `--border` divider between siblings, hairline ring + soft outer glow (`0 1px 2px rgba(20,20,22,.06), 0 0 0 1px oklch(0.90 0.005 75)`). A row that is a link ends in a `›` chevron and says what tapping does ("Move ›"). Rows highlight only when relevant to the current phase.

**Primary button** — full width, height 46px, radius 14px, `--accent` fill, white 15px/600, drop shadow + 1px inner top highlight; hover `--brand-dark`; active `scale(.99)`; `transition: background-color .15s, transform .08s`.

**Secondary button** — white fill, height 42px, radius 13px, 1px `--border` ring, 14px/650 `--ink`; hover lifts `translateY(-1px)` and deepens the ring; active returns to rest.

**Danger block** — destructive actions live in their own block behind a rule at the bottom of a screen, with the confirm note attached; destructive confirms require typing the tournament name.

**Pill / badge** — `999px`, 12px, `--accent-soft`/`--accent` by default; LIVE uses `--live-soft` fill with `--live-ink` text and a 7px pulsing dot (1600ms, the only infinite animation in the system); DONE is a muted `.ftag`.

**Checkmark** — a green disc (`--live`) with a white stroke tick, used for completed/paid state.

**Stepper** — `.mgs-b` 46×46px, radius 14px, white, 1px `--border`, 18px/700 glyph; value `.mgs-val` min-width 46px, display 800 26px, `tabular-nums`.

**Switch** — 54×31px track, radius 999px, 25px white knob with `0 2px 5px rgba(20,20,22,.3)`; on = `--live-ink` track; knob travel 23px, 140ms `--e-press` with a 1.18 scaleX squash mid-travel.

**Text field** — white, radius 13px, 1px `--border`, 15px text, min-height 46px; focus adds `--brand-ring`. Any edit arms the screen's Save button and flips its status line to "Unsaved changes".

**Modal / popup** — `.popup-overlay` scrim (`oklch(0.62 0.02 75 / .28)`) with a centred `.popup-card.card` (max-width ≈ 430px, radius 16px). Head = eyebrow + title + 34px `×` close; body; foot with a border-top. Opening/closing uses `--m-surface` with `--e-arrive`.

**Score card** (the one card that does all scoring, shared by organizer and player) — head eyebrow reads `G2 · NET 1` (and `· DONE` when finished); title `Team A vs Team B`. Body is two rows divided by hairlines; each row is a 44px-min tap target (`.mgs-win`) with a radio dot, the team name, and a stepper. Tapping the team calls the win (dot fills `--accent`, row washes `--accent-soft`, name goes 700, WINNER pill appears); the stepper is only for when someone kept score. The hint line under the rows names what will be saved. Foot has two actions: primary — **Save score / Save winner / Update score / Finish game** — and secondary **Save live score / Update live score**.

**Live scoring** — the secondary action writes the running score onto the game and keeps it in progress: the schedule row shows the numbers in `--live-ink`, the LIVE pill stays, no DONE tag, no winner bolded, and standings do not move. The game carries `data-mgss-live="a-b"`; reopening prefills from it and the primary button becomes **Finish game**. Committing a final result clears the attribute; re-saving a finished game as live gives its result back to the standings.

**Bracket** — `.bt-pan` (horizontal scroller, hidden scrollbar, `overscroll-behavior-x: contain`) → `.bt-canvas` (position: relative) → `.bt-col` columns (flex, `justify-content: space-around`, `gap: 14px`) of `.bt-node` cards 176px wide. A TBD node is dashed with `--surface-2` fill and italic "Winner of G7" slots. Connectors are drawn into an inline `svg.bt-links` (`position: absolute; inset: 0`), stroke `oklch(0.86 0.006 75)`, `stroke-width: 1.5`.

  Geometry rules (both matter — see `_shared.js`): every later game is offset with `top` so its centre sits on the **exact midpoint of the two games feeding it**; each connector is drawn as a stub off each feeder, **one shared vertical riser**, and one horizontal into the middle of the destination. Measure LAYOUT (`offsetTop`/`offsetHeight`), never rendered rects — the cards animate in with a stagger and carry a 90ms transform transition, so rect-based measurement is always mid-flight (that bug produced off-centre lines, a bracket that drew late, and cards that visibly nudged).

## Motion system

Five durations and four curves; nothing else. Transform and opacity only, micro-moves under 10px, nothing over 200ms except the one celebration a tournament earns. Full reference page: `motion.html` (30 replayable demos of these exact app actions).

| Token | Value | What it is for |
| --- | --- | --- |
| `--m-tap` | `90ms` | the surface answering a finger (press scale) |
| `--m-state` | `140ms` | a value or state changing in place |
| `--m-elem` | `200ms` | an element entering or leaving |
| `--m-surface` | `300ms` | a screen, sheet or menu |
| `--m-cheer` | `460ms` | champion celebration only |

| Curve | Value | Use |
| --- | --- | --- |
| `--e-settle` | `cubic-bezier(.2,.7,.3,1)` | default; things coming to rest |
| `--e-arrive` | `cubic-bezier(.16,1,.3,1)` | surfaces arriving |
| `--e-leave` | `cubic-bezier(.4,0,1,1)` | things leaving |
| `--e-press` | `cubic-bezier(.34,1.4,.5,1)` | one overshoot, for commits |

Rules that matter when you port this:

- Animation `fill-mode` is **backwards, never both** — a finished animation must leave no transform behind (a lingering transform makes the element a stacking context and traps absolutely-positioned panels beneath later siblings).
- List stagger comes from `--m-i` set by `:nth-child()` and **capped at 9**, so a long roster never takes two seconds to land.
- `--m-scale` multiplies every duration; the reference page uses it as a speed control (`1×` on that page = 2× the app's authored durations, i.e. authored values are the fast end).
- Reduced motion: `body.no-motion` and `prefers-reduced-motion: reduce` both skip animation; height/opacity transitions fall back to instant.

## Design tokens

Every value below is a real custom property resolved from the running app
(`document.documentElement`). Colors are authored in OKLCH — keep them in OKLCH
if the target platform supports it, otherwise convert (do not eyeball hex).

### Color

| Token | Value | Used for |
| --- | --- | --- |
| `--ink` | `oklch(0.18 0.005 75)` | primary text, titles |
| `--text-2` | `oklch(0.30 0.005 75)` | secondary text |
| `--text-3` / `--muted` | `oklch(0.50 0.005 75)` | labels, captions, eyebrows |
| `--text-4` / `--faint` | `oklch(0.62 0.005 75)` | disabled, placeholder |
| `--bg` / `--surface-2` | `oklch(0.985 0.003 75)` | app background |
| `--card` / `--surface` | `oklch(0.97 0.003 75)` | card fill |
| `--surface-3` | `oklch(0.95 0.004 75)` | inset/again-recessed fill |
| `--border` / `--c-line` | `oklch(0.90 0.005 75)` | hairlines, 1px rings |
| `--border-2` | `oklch(0.85 0.006 75)` | stronger divider, hover ring |
| `--accent` / `--brand` / `--c-acc` | `oklch(0.55 0.07 240)` | primary action, links, active nav |
| `--brand-dark` | `oklch(0.48 0.08 240)` | primary hover |
| `--accent-soft` / `--brand-light` | `oklch(0.96 0.015 240)` | selected row wash, badge fill |
| `--accent-bd` | `oklch(0.86 0.03 240)` | selected row border |
| `--brand-ring` | `oklch(0.55 0.07 240 / .18)` | focus ring |
| `--live` / `--success` | `oklch(0.55 0.09 150)` | LIVE pill, in-progress |
| `--live-ink` | `oklch(0.40 0.09 150)` | live text, saved-score numerals |
| `--live-soft` / `--success-light` | `oklch(0.96 0.03 150)` | live pill fill, done-row wash |
| `--success-border` | `oklch(0.88 0.05 150)` | done-row border |
| `--danger` | `oklch(0.55 0.16 25)` | destructive text/button |
| `--danger-dark` | `oklch(0.48 0.16 25)` | destructive hover |
| `--danger-soft` / `--danger-light` | `oklch(0.95 0.03 25)` | destructive block fill |
| `--warn` | `oklch(0.58 0.10 70)` | needs-attention |
| `--gold` | `oklch(0.62 0.08 78)` | champion accents |
| `--gold-ink` | `oklch(0.46 0.06 78)` | champion text |
| `--gold-soft` | `oklch(0.92 0.06 85)` | champion fill |
| `--gold-bd` | `oklch(0.82 0.07 85)` | champion border |
| `--wm-opacity` | `.07` | background wordmark watermark |

### Type

- Display / numerals: `--font-display: 'Barlow Semi Condensed', 'Inter', sans-serif` — weights 600/700/800.
- Body / UI: `Inter` — 400, 500, 600, 650, 700, 800.
- Some organizer screens also load `Sora` 600–800 for page titles.
- Scale in use: 11px eyebrow (uppercase, `letter-spacing: .12em`, `--muted`), 12px caption/hint, 12.5–13px meta, 14px secondary button, 15px body and row titles, 17–20px card titles, 24–30px page titles (display 800), 26px stepper numerals (display 800, `font-variant-numeric: tabular-nums`).
- Minimum interactive font size is 13px; minimum tap target 44px.

### Radius

`--r-sm: 8px` · `--r-md: 13px` · `--r-lg: 16px`. Pills use `999px`. Primary buttons 14px, secondary 13px, steppers 14px, cards 16px.

### Shadow

- `--shadow-sm: 0 1px 2px oklch(0.18 0.005 75 / .06)`
- `--shadow` / `--shadow-md: 0 1px 2px oklch(0.18 0.005 75 / .06), 0 4px 14px oklch(0.18 0.005 75 / .05)`
- Row/ring pattern (list rows, tiles): `0 1px 2px rgba(20,20,22,.06), 0 0 0 1px oklch(0.90 0.005 75)`
- Sticky-header hairline (only once content is behind it): `0 8px 10px -12px rgba(20,20,22,.55)`
- Primary buttons carry a drop shadow plus a 1px inner top highlight; secondary buttons lift `translateY(-1px)` on hover instead of moving their label.

### Spacing

4px base. Common values: 8 / 11 / 12 / 14 / 16 / 20 / 26px. Card padding 14–16px, row vertical padding 12px, page gutters 16px (screens are laid out at a 430px design width).

## Assets

- Wordmark watermark / header lockup: `https://athletic-specimen.com/logo-mark.png` (decorative, opacity .07; also a 62px lockup at the top-right of the hub title block). Stripped from the capture rig, so absent from screenshots — use your codebase's brand asset.
- `mg-qr` shows a placeholder QR; generate the real one from the check-in URL.
- Icons: inline 24×24 SVG, `stroke-width: 2`, round caps/joins, `currentColor`.
- Fonts: Inter 400–800, Barlow Semi Condensed 600–800, Sora 600–800 on some organizer titles.

## Files

```
design/manage.html                   the Manage canvas (state picker, phone frame, routing)
design/check-in.html                 the kiosk canvas (the 7 kiosk screens)
design/move-players.html             the move-players flow canvas
design/screens/*.html                the 49 screens above, standalone
design/_as.css                       @import of the production stylesheet (tokens)
design/_rounds.css                   design-round CSS additions
design/_shared.css                   app-wide CSS (sticky headers, rows, buttons, score card, bracket)
design/_shared.js                    app-wide behaviour (score card + live scoring, pool moves, rules inline edit,
                                     settings dirty state, standings deltas, bracket geometry, sticky headers)
design/_kiosk.css                    kiosk-only styles
design/_bracket-run.css              the run-the-bracket screen
design/_motion-app.css / .js         the motion system in the app
design/_tournaments.js               tournament fixture data
```

`mgts-hub-v1` is included for history only — build `mgts-hub`.
