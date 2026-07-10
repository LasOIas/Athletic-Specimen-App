# Public Home — atom-up redesign (LOCKED design spec)

**Date:** 2026-07-10 (session 7)
**Status:** DESIGN LOCKED — every decision below is a recorded Mike pick from the
atom-up ladder (one primitive per round, rendered variants, his pick each rung;
picks ledger `C:/Ai Master/Me/picks/picks.jsonl`).
**Scope:** the public **Home page** (all four states) + the shared visual system it
introduces. Other public pages (Tournament tab, Check In) adopt the system in later
focused sessions — this spec does not redesign them.
**Supersedes:** the Home sections of `2026-07-08-public-dashboard-remake-design.md`
(§5 Home, §12 Round-2 Home, §13 slices as they apply to Home). Mike, verbatim:
*"i want to start over with new dashboard ideas … and when we find what i want then
delete any code related to the old ui."*

---

## 1. The locked visual system (new — replaces the pd-* Home look)

| Primitive | LOCKED value |
|---|---|
| Background | warm stone `oklch(0.985 0.003 75)` + the cross logo as a **tamed watermark**: grayscale, ~7% opacity (`.06–.07`), centered, `z-index` BELOW all content, `pointer-events:none`. It can never collide with text again. |
| Display face | **Barlow Semi Condensed** 600/700/800 — page titles, wordmark, section/net labels, scores, record numerals. Google Fonts. **Replaces Sora on the public surface.** |
| Body face | Inter (unchanged), 16px minimum on inputs (iOS zoom guard stays). |
| Accent | THE muted blue `oklch(0.55 0.07 240)`; strong form `oklch(0.48 0.08 240)` for active nav/links. |
| Status colors | unchanged semantic set: live green `oklch(0.55 0.09 150)` (+ soft/ink forms), gold champion set, danger `oklch(0.55 0.16 25)`, all matte (§51). |
| Surfaces | **NO cards.** Content sits directly on the stone. No borders/shadows/frosted boxes on Home. Section labels = small caps muted labels (11px, .12em). |
| Net separation | **labeled net-header lines**: `NET 1` in Barlow 700 ~12.5px caps + a hairline rule filling the rest of the row; the game (2 team rows + score column + status pill) sits under its net header. One block per net, ~16px between blocks. |
| Bottom nav | **floating full-width rounded bar**: 12px side margins, 12px bottom offset, 18px radius, 1px border, frosted white `oklch(1 0 0 / .82)` + `backdrop-filter: blur(8px)`, soft shadow. Icons + labels: **Home · Check In · Tournament** (SVG icons, never emoji). |
| Header | two-line wordmark `ATHLETIC SPECIMEN` / `COLORADO` (Barlow 800, letterspaced) left + profile bubble right. Nothing else. |
| Status pills | `Playing` = live-soft/live-ink; `Final` = neutral gray soft + muted ink. |

## 2. Home content — four states (all locked)

Home is **the everyone surface**: it renders identically signed-in or not. Mike,
verbatim: *"the home page is for those not signed into the app … it just shows kinda
everything … to have it personalized that will be in the tournament tab."* → **NO
personal/my-team content on Home, ever.** The personal layer ("your team", claim
hand-offs, you-highlights) belongs to the Tournament tab (future session).

Every state leads with the same **lead block** grammar (no card): eyebrow (status
dot + small caps) → Barlow title → muted meta line → optional CTA button, with the
**logo mark (~96px) filling the open space right of the text block** (Mike's
directive: "add the logo to be inside the tournament card in the open space to the
right, fill it").

### 2a. Tournament day (live)
1. Lead: eyebrow `● POOL PLAY · LIVE` (or `BRACKET · LIVE`) · title = tournament name
   · meta = `24 of 36 games done · 18 teams · 9 nets` (values from DB). No CTA.
2. `LIVE NOW` — one net block per net with a live game (net-header line + matchup +
   running score + `Playing` pill).
3. `COMING UP` — the next scheduled game per net: `Net N · TeamA vs TeamB`, right cell `next`.
4. `STANDINGS · TOP 3` — rank, name, W-L record (Barlow numerals).
5. `Full standings & schedule ›` link row → Tournament tab.

### 2b. Registration open
1. Lead: eyebrow `● REGISTRATION OPEN` · title · meta `4s co-ed · $80 a team · N teams in`
   (real count, singular/plural correct) · CTA **Register your team** (full-width,
   accent) · logo right.
2. `DETAILS` — icon rows (SVG): date + time · location (posted in GroupMe) ·
   `4 per team, co-ed — at least 1 guy + 1 girl` · `Pool play → double-elim bracket — win by 2`.
   Values bind to the tournament row; omit a row when the field is empty.
3. Nothing else. (Mike rejected who's-in, past-tournaments, and bare variants.)

### 2c. Casual session day
1. Lead: eyebrow `● SESSION LIVE` · title = session name (e.g. `Sunday Pick-up`) ·
   meta `19 checked in · 4 teams · 2 courts` · CTA **Check in** · logo right.
2. `ON THE COURTS` — same net-block grammar with `COURT N` labels.

### 2d. Quiet (nothing scheduled)
1. Lead: muted eyebrow `● NOTHING ON RIGHT NOW` (gray dot) · title `Next tournament soon`
   · meta `Announced here and in GroupMe` · no CTA · logo right.
2. `PAST TOURNAMENTS` — recent completed tournaments (name + `N teams · completed`) +
   `Champions, records & results ›` link row.

**State selection must be TRUE (§27):** live tournament state only when the
tournament is actually live TODAY; casual state only for a genuinely active
session. The current prod bug class — June 28's session rendering "2 courts live
now" weeks later next to "No session scheduled yet" — must be impossible: one
state machine picks exactly ONE state; stale sessions (not today) never render as
live. **Precedence when several are true:** live tournament (2a) > live casual
session (2c) > registration open (2b) > quiet (2d). While registration is open AND
a session is live, the casual state leads and a one-line registration link row
(`Registration open — July 2026 Tournament ›`) sits directly under the courts
board; that row is the only cross-state element allowed.

## 3. Desktop (≥1024) — LOCKED: rail + board

- Top **tab strip** under the header (Home · Check In · Tournament, underline
  active) — the floating bottom bar is mobile-only.
- 1140px container. Two columns: **left rail ~360px** = lead block (title, stats,
  logo) + COMING UP + STANDINGS TOP 3 + link; **right** = LIVE NOW nets in a
  **2-across grid**.
- Reg-open / casual / quiet states use the same rail-left (lead + secondary
  section) with the main column carrying the state's list content; single-column
  centered (~560px) is acceptable for the quiet state.
- Mobile (<1024) byte-behavior unchanged by desktop CSS (media-scoped, as §13.8 did).

## 4. Old-UI deletion (Mike's explicit instruction)

After the new Home ships and Mike verifies on his phone, DELETE the old Home-path
code rather than leaving it dormant: the tile/stat-tile Home (`pd-*` Home
composition, home stat tiles, gateway/registration banner row with its
run-together-label bug, watermark-collision CSS, `pd-home-active` scoping hacks,
legend paragraph) and any Home-only helpers that no longer have callers. The
Tournament/Check-In pages keep their current code until their own focused
sessions. Deletion lands as its own reviewed commit (grep-gate: no dead
references), after — not with — the build commit.

## 5. Build notes

- Division of labor: Opus builder slices against this spec, controller-reviewed
  (§58); TDD for the state machine + shaping helpers (pure.js: state selection,
  net-block model, coming-up queue, top-3 shaping).
- APP_VERSION bump + `node --check` + commit/push per slice; §27 browser pass at
  390px and 1280px on prod data; §41 both surfaces in the same slice.
- Fonts: add Barlow Semi Condensed to the Google Fonts loads (both index.html and
  any standalone pages that render Home-style headers).
- The watermark, fonts, nav bar, and header are SHARED system pieces — build them
  as reusable CSS (new tokens/classes), not Home-only styles, so the Tournament
  and Check In redesign sessions inherit them.
- Reference mockups (session 7 scratchpad `ladder/`): `canvas-v8-dayof.html`
  (day-of mobile), `rung9-b-details.html` (reg-open), `rung10-casual.html` /
  `rung10-quiet.html` (other states), `rung11-b-rail.html` (desktop). Screenshots
  alongside.

## 6. Out of scope (parked for the next focused sessions)

- Tournament tab redesign (inherits the system; carries the personal/my-team layer).
- Check In page redesign (one-tap hero grammar re-skin).
- Admin dashboard remake (spec `2026-07-09-admin-dashboard-remake-design.md`, gated
  on RLS Arc 2 per Mike's ordering).
