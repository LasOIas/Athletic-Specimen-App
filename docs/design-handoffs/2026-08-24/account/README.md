# Handoff: Account (getting in, and changing your details)

## Overview

Everything behind the profile bubble, and everything that happens before a player has an account: the wall, sign in, create account, verify-later, forgot password, and the account card with its three edit screens plus sign-out. 14 screens in three groups.

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

### Getting in

| # | Screen id | Screenshot | Purpose |
| --- | --- | --- | --- |
| 1 | `auth-gate` | `01-auth-gate.png` | "Sign in to see the tournament" — nothing in a tournament is public, so this is the wall. |
| 2 | `auth-signin` | `02-auth-signin.png` | Sign in: email + password (Show/Hide), Forgot password, Create account. |
| 3 | `auth-signup` | `03-auth-signup.png` | Create account: name, email, password with a strength meter. |
| 4 | `auth-verify-banner` | `04-auth-verify-banner.png` | Home with a dismissible "Confirm your email" banner + **Resend** — the verify-later path. |

### Forgot it

| # | Screen id | Screenshot | Purpose |
| --- | --- | --- | --- |
| 5 | `auth-forgot` | `05-auth-forgot.png` | Ask for a reset link. |
| 6 | `auth-forgot-sent` | `06-auth-forgot-sent.png` | Check your email. |
| 7 | `auth-reset` | `07-auth-reset.png` | Set a new password: strength meter, Show/Hide, type-it-again. |
| 8 | `auth-reset-done` | `08-auth-reset-done.png` | Password changed. |

### Changing it

| # | Screen id | Screenshot | Purpose |
| --- | --- | --- | --- |
| 9 | `account-hub` | `09-account-hub.png` | The account card: avatar disc, name, email, "Player · Net Gains", then rows for **Name**, **Email** (with an *Unverified* tag when it applies) and **Password**, plus **Sign out**. Close returns to Home when there is no back stack. |
| 10 | `account-name` | `10-account-name.png` | *Your name* — first and last, prefilled. "This is what teammates and organizers see." |
| 11 | `account-email` | `11-account-email.png` | *Change email* — new address plus current password (Show toggle) to prove it is you. |
| 12 | `account-email-sent` | `12-account-email-sent.png` | *Confirm your new email* — the old address stays until the link is clicked; Resend or Cancel. |
| 13 | `account-password` | `13-account-password.png` | *Change password* — current, then new with a strength meter and Show toggles. "You stay signed in on this phone." |
| 14 | `account-signout` | `14-account-signout.png` | *Sign out?* — "You'll need your email and password to get back in." |

## Interactions & behaviour

- The **profile bubble** in the app header opens the account card as a modal over whatever page you were on.
- Every row on the card opens its own screen; **Sign out** opens the confirm rather than signing out on the tap.
- **Validation** (real, on all forms): empty fields → "Fill in every field."; malformed email address; wrong current password; too-short new password; mismatched confirmation. A valid submit navigates and lands a toast on the next screen.
- **Password reveal** is a control inside the field (Show / Hide), not an icon-only button; the strength meter is a four-step bar under the field.
- **Verify later**: signing up lands on Home with the confirm-email banner; **Resend** confirms in place; the banner is dismissible and the account row keeps an *Unverified* tag until the link is clicked.
- **Changing email** does not change it immediately — it sends a confirmation and shows the pending state, with Resend and Cancel.
- Auth screens are built on the app's existing `auth-*` classes; only the reveal control, strength meter, field marks, account rows and banner are new.

## State

| State | Values | Drives |
| --- | --- | --- |
| `session` | `null` · `{userId, name, email, emailVerified, team}` | gate vs hub, banner, row tags |
| `pendingEmail` | address or null | `account-email-sent`, Resend / Cancel |
| `resetToken` | token or null | `auth-reset` reachable at all |
| form state | field values, per-field errors, reveal flags, strength score | every form screen |
| `toast` | message | confirmation after a valid submit |

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

- Avatar is a letter disc (initial, `--accent-soft` fill, `--accent` text) — no uploaded photos in this design.
- Wordmark watermark / header lockup: `https://athletic-specimen.com/logo-mark.png` (decorative). Stripped from the capture rig, so absent from screenshots.
- Icons: inline 24×24 SVG, `stroke-width: 2`, round caps/joins, `currentColor`.
- Fonts: Inter 400–800, Barlow Semi Condensed 600–800.

## Files

```
design/account.html                  the Account canvas (all 14 states + routing)
design/screens/*.html                the 14 screens above, standalone
design/_account.js                   the account/auth behaviour (validation, reveal, meter, navigation)
design/_as.css                       @import of the production stylesheet (tokens)
design/_rounds.css                   design-round CSS additions
design/_shared.css                   app-wide CSS (sticky headers, rows, buttons)
design/_shared.js                    app-wide behaviour
design/_motion-app.css / .js         the motion system in the app
design/_tournaments.js               tournament fixture data
```
