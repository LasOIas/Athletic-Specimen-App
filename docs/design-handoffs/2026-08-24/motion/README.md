# Handoff: Motion (the system, and every action expressed in it)

## Overview

Every state in the app used to swap instantly: a score landed with no acknowledgement, a screen appeared with no origin, a number changed and nobody saw it. `motion.html` is the system that fixes it — **five durations, four curves**, and 30 replayable demos of real app actions built in them. This handoff is the spec for porting that system, not a screen flow.

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

## What is on the page

Screenshots in `screenshots/` (`01-page-full.png` is the whole page, 1×; the rest are 2× section captures).

| # | Section | Screenshot | Contents |
| --- | --- | --- | --- |
| 1 | Whole page | `01-page-full.png` | Everything, in order. |
| 2 | Duration scale | `02-duration-scale.png` | The five durations as cards: **Tap 90ms · press**, **State 140ms**, **Element 200ms**, **Surface 300ms**, **Celebration 460ms**, each with a one-line job description and a sweep bar that replays on tap. |
| 3 | Controls | `03-speed-controls.png` | Speed (½× · 1× · 2×), Reduced motion (Off · On), **Play everything**. |
| 4 | Tap & commit | `04-group-tap-and-commit.png` | 6 demos: button press, label→done swap, state swap, checkbox tick into a green disc, switch, inline confirm. |
| 5 | Scoring | `05-group-scoring.png` | 4 demos: stepper number bump, score row landing with a green wash, winner going bold, LIVE dot pulse. |
| 6 | Getting around | `06-group-getting-around.png` | 5 demos: push, pop, tab underline, menu open with staggered items, bottom sheet + scrim. |
| 7 | Lists that change | `07-group-lists-that-change.png` | 5 demos: list arrive (stagger), row leave with the gap closing by transform, two rows trading places, sequential arrival, reorder. |
| 8 | State, changing | `08-group-state-changing.png` | 4 demos: progress track, count change, badge change, phase advance. |
| 9 | Getting attention | `09-group-getting-attention.png` | 4 demos: toast in/out, needs-you nudge, error shake, focus ring. |
| 10 | Once a tournament | `10-group-once-a-tournament.png` | 2 demos: champion crown and confetti — the only place the system spends real time. |

Every demo card replays on tap or hover, and plays once when it first scrolls into view.

## The system

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


### Rules the demos encode

- **Transform and opacity only.** The one exception is a height transition when a panel opens or closes (`grow`/`shrink`/`collapse` in `_shared.js`), so rows below glide instead of jumping — 200ms in, 180ms out.
- **Micro-moves under 10px.** Row enter is `translateY(10px)`; label swaps are 7–9px; nothing travels further.
- **Nothing over 200ms except the celebration.** Surfaces get 300ms because they are the whole screen.
- **A commit overshoots once** (`--e-press`), and only once: press is `scale(.955)` at 34% and back.
- **Layout is never animated.** When a row leaves, the gap closes with a `translateY` on the rows below, not a margin.
- **Stagger is a property, not markup**: `--m-i` from `:nth-child()`, capped at 9. List steps are 40–45ms; sequential arrivals 70ms.
- **The only infinite animation** is the LIVE dot (1600ms ease-in-out, opacity 1→.35 and `scale(.82)`).
- **Reduced motion** (`body.no-motion` or `prefers-reduced-motion: reduce`) skips every animation and makes the height transitions instant.
- **Fill mode backwards, never both** — see the note in the table above; `both` leaves a transform behind and traps absolutely-positioned panels under later siblings.

### Implementation notes

- Durations and curves are custom properties, so a component can say `transition: transform var(--m-tap) var(--e-press)` and never hard-code a number.
- `--m-scale` multiplies every duration through `calc()`; the page's speed control sets it on `:root`. Ship with the authored values (the page's own `1×` is deliberately 2× slower so the demos are readable).
- Demo playback works by adding `.run` to a card, removing it on `animationend`, and forcing a reflow before re-adding — that is what makes a demo replayable.
- Autoplay-on-scroll uses a plain scroll/poll check rather than IntersectionObserver, because the observer does not fire inside every preview host.

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

- No images. Everything on the page is CSS and inline 24×24 SVG (`stroke-width: 2`, round caps/joins, `currentColor`).
- Fonts: Inter 400–800, Barlow Semi Condensed 600–800.

## Files

```
design/motion.html                   the reference page (30 demos + controls)
design/_motion.css                   the reference page's own styles and demo animations
design/_motion-app.css               the motion system as the app uses it (tokens, stagger, reduced motion)
design/_motion-app.js                the app-side motion behaviour
design/_as.css                       @import of the production stylesheet (tokens)
design/_rounds.css / _shared.css     app CSS the demos borrow their components from
design/_shared.js                    app-wide behaviour (height transitions live here)
design/_tournaments.js               fixture data
```

Port `_motion-app.css` first — it is the system. `motion.html` and `_motion.css` are the documentation and can stay a design artefact, but keeping them alive in the codebase (a `/motion` route) is how the system stays honest.
