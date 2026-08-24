# Handoff: Tournament (the player side of an event)

## Overview

The Tournament tab is everything a player does at an event: get in, register, read the rules, follow pools and standings, follow the bracket, look after their own team, and report a score. 25 screens, one tab, four sub-areas (hub · pools · bracket · my team) plus the sign-in / claim-your-spot flow that gates them.

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

Screenshots in `screenshots/`, full-height, 2×, 430px design width.

### Hub and registration

| # | Screen id | Screenshot | Purpose |
| --- | --- | --- | --- |
| 1 | `tn-hub` | `01-tn-hub.png` | The tournament's front page: status line, then rows for Rules, Pools & schedule, Bracket, My team. Each row states what it holds ("Double elimination · all 14 games"). |
| 2 | `tn-gate` | `02-tn-gate.png` | Signed out: nothing in the tournament is public, so the tab asks you to sign in first. |
| 3 | `tn-register-form` | `03-tn-register-form.png` | Register a team (team name, player rows, payment). |
| 4 | `tn-register-closed` | `04-tn-register-closed.png` | Sign-ups closed — short page, no form. |
| 5 | `tn-register-success` | `05-tn-register-success.png` | Registered, signed in: what happens next. |
| 6 | `tn-register-success-signedout` | `06-tn-register-success-signedout.png` | Registered without an account — offers to claim the spot. |
| 7 | `tn-rules` | `07-tn-rules.png` | Rules as players read them: sections with a head and a list of lines. |

### Pools

| # | Screen id | Screenshot | Purpose |
| --- | --- | --- | --- |
| 8 | `pl-pools` | `08-pl-pools.png` | Pool standings (seed · team · W–L · Diff, the player's own row tagged **You** with "You play at nets 1 & 2"), then the games list per net. Pool tabs A/B/C/Seeding across the top. |
| 9 | `pl-seeding` | `09-pl-seeding.png` | Cross-pool seeding table — how the bracket will be drawn. |
| 10 | `pl-empty` | `10-pl-empty.png` | Pools not drawn yet. |

**Game row** (`.pl-g`): `G1` round tag, the matchup (winner bolded, loser plain, `vs` in `--muted`), score `21–13`, and a status tag — `DONE` (`.ftag`, muted) or a **LIVE** pill. 11px left/right padding, 1px `oklch(0.82 0.008 75)` side borders, hairline divider between rows, grouped under a `NET 1` label.

### Bracket

| # | Screen id | Screenshot | Purpose |
| --- | --- | --- | --- |
| 11 | `bk-pre` | `11-bk-pre.png` | The shape before seeding — every slot a placeholder, no scores, no team names, so it cannot be mistaken for a drawn bracket. |
| 12 | `bk-live` | `12-bk-live.png` | The real double-elimination bracket: Winners / Losers / Championship tabs, seeded teams, scores, LIVE game, pinch or drag to zoom. |
| 13 | `bk-champion` | `13-bk-champion.png` | Champion state (gold tokens, the one celebration in the motion system). |

Wording rules the design settled on: **"Championship", never "Final"**, everywhere. Only the rounds that actually feed the championship are labelled **Semifinals** (G11 winners, G13 losers). Connectors are drawn between games, never around them.

### My team, history, and getting in

| # | Screen id | Screenshot | Purpose |
| --- | --- | --- | --- |
| 14 | `pd-team-peek` | `14-pd-team-peek.png` | Tap any team name anywhere → its record, roster and remaining games. |
| 15 | `mt-myteam` | `15-mt-myteam.png` | My team: roster, record, next game, and the score-report entry point. |
| 16 | `mt-report-score` | `16-mt-report-score.png` | The player's own report-score screen (the standalone version of the score card). |
| 17 | `mt-empty` | `17-mt-empty.png` | Not on a team yet. |
| 18 | `ht-history` | `18-ht-history.png` | Past tournaments and results. |
| 19 | `auth-signin` | `19-auth-signin.png` | Sign in (also in the Account handoff). |
| 20 | `auth-signup` | `20-auth-signup.png` | Create account. |
| 21 | `claim-search` | `21-claim-search.png` | "Claim your spot": find yourself on a registered roster. |
| 22 | `claim-confirm` | `22-claim-confirm.png` | Confirm that is you. |
| 23 | `claim-success` | `23-claim-success.png` | Claimed. |
| 24 | `namefill` | `24-namefill.png` | Fill in your name when the roster only had a placeholder. |
| 25 | `account-menu` | `25-account-menu.png` | The account modal over the tournament page. |

## Interactions & behaviour

**Scoring from the public pages** — a game a player can see is a game they can score.

- **Pools**: tapping a game row opens the score card with that game's teams and `G2 · NET 1` in the eyebrow. Steppers for a real score, or tap a team to call it. Saving writes the score onto the row, bolds the winner, clears the LIVE pill, adds `DONE`, and moves the standings.
- **Bracket**: tapping a game opens the winner-only version of the same card (no steppers by default; "Save winner"). Saving marks the winning team in the node and appends `· Done`. A game still waiting on a feeder ("Winner of G7") does not open.
- **Live scoring** (both): the secondary action saves the running score and keeps the game in progress — numbers in `--live-ink`, LIVE pill intact, standings untouched, `data-mgss-live="a-b"` on the game. Reopening prefills it and the primary button reads **Finish game**.
- Tapping a **team name** inside a game opens the team peek instead — only taps on the game itself open the score card.
- Standings move by the **difference** an edit makes, not by recomputing the season: correcting 21–13 to 22–13 shifts one point of differential. Then the table re-sorts (wins, then differential) and renumbers.
- Closing the card returns you to the page you were on. Only the standalone report-score screen navigates back to My team.

**Bracket behaviour**

- Winners / Losers / Championship are tabs; the pane scrolls horizontally with the scrollbar hidden and `overscroll-behavior-x: contain`; pinch or drag to zoom.
- Nodes align and connectors draw on the first frame, from layout measurement — switching tabs must never move a card (see the geometry note in Components).

**Navigation**

- Hub rows route to screens; a row pointing at a screen this page does not own **jumps to the page that owns it and opens it directly** (the Bracket row is the case that mattered — it must land on the live bracket, not the sample shape).
- Back chevron in the sticky page header returns to the hub; the header stays reachable at any scroll position.

**Gate**

- Signed out, the tab shows `tn-gate` — nothing inside the tournament is public.
- Registering without an account offers **claim your spot**: search → confirm → success, then name-fill if the roster only had a placeholder.

## State

| State | Values | Drives |
| --- | --- | --- |
| `phase` | `registration` · `closed` · `pools` · `bracket` · `done` | which hub rows are live, which bracket screen shows |
| `isSignedIn`, `hasClaimedSpot` | bool | gate vs hub, claim flow |
| `myTeamId` | id or null | My team, the "You" row in standings, next-game block |
| `games[]` | `{id, net, teamA, teamB, scoreA, scoreB, status: pending/live/done, liveScore}` | pool rows, bracket nodes, score card |
| `standings[]` | `{team, w, l, diff}` | pool tables (derived; edits apply as deltas) |
| `bracket` | node tree with feeders | bracket layout, "Winner of G7" slots, advancement |
| `activePoolTab`, `activeBracketSide` | tab keys | pools/bracket tabs |
| score card | `{gameId, a, b, pick, isLive}` | the card's own state |

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

- Wordmark watermark / header lockup: `https://athletic-specimen.com/logo-mark.png` (decorative, opacity .07). Stripped from the capture rig, so absent from screenshots — use your codebase's brand asset.
- Icons: inline 24×24 SVG, `stroke-width: 2`, round caps/joins, `currentColor`.
- Fonts: Inter 400–800, Barlow Semi Condensed 600–800.

## Files

```
design/tournament.html               the Tournament canvas (state picker, phone frame, routing)
design/screens/*.html                the 25 screens above, standalone
design/_as.css                       @import of the production stylesheet (tokens)
design/_rounds.css                   design-round CSS additions
design/_shared.css                   app-wide CSS (sticky headers, rows, buttons, score card, bracket)
design/_shared.js                    app-wide behaviour (score card + live scoring, standings deltas, bracket geometry, sticky headers)
design/_motion-app.css / .js         the motion system in the app
design/_tournaments.js               tournament fixture data
```
