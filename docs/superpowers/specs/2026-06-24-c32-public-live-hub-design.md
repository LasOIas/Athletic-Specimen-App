# C32 — Public Live Hub (public Home redesign) — Design

**Status:** approved (design) — 2026-06-24
**Batch:** C32 (player/public experience). Folds in §49 items **#2** (public home = live status hub),
**#7** (live checked-in count), **#1** (public live board, already exists — kept), and surfaces
**tournament-live status** on the public side. Out of scope: #4 self-serve scoring, #8 self-checkout,
#6 per-match tournament scores on Home, #12 streaks (separate, some brainstorm-gated).

## Goal
Turn the public (no-login) **Home** tab into a glanceable **live status hub** that answers "what's
happening right now?" — how many are here, what's live, the next session, and a one-tap Check In — while
staying strictly read-only and skill-free.

## Background (what already exists — do not rebuild)
Shipped in C26 item 3a (`public/app.js`):
- `publicHomeHTML()` — brand + "Live now · N" pill + Next-session card + Check In CTA + "On the courts" rows.
- `publicScoresHTML()` — the Scores tab (live court board + up-next + empty state). **Unchanged by this work.**
- `getPublicLiveData()` — derives casual Live Nets matchups/results/waiting/liveCount from the synced
  `live_state` row (admin-written, anon-readable). Team NUMBERS + win/loss only; no names, no skill, no score.
- `buildPublicLiveCourtsHTML()` — the court rows shared by Home + Scores.
- The casual Live Nets already persist to the DB (`live_state`, C22) and are read publicly across devices.
- Realtime: the public client subscribes to `players` (drives the checked-in count) and to `live_state`
  (drives the casual court board). Tournament data refreshes via `queueTournamentRefresh()`.

This work **redesigns `publicHomeHTML()`** (and adds a small pure status helper). It does not touch the
Scores tab, the tournament engine, the sync layer's contracts, or any DB schema.

## Chosen design — Layout C (dashboard tiles)
Picked from 3 §38 localhost mockups (A status-feed / B action-stack / **C tiles**). Phone-first.

Top → bottom on the public Home:
1. **Brand line** — "Athletic Specimen".
2. **Two stat tiles** (2-up grid):
   - **Here tonight** — big number = `state.checkedIn.length`. **Count only, never names** (Mike's call).
     Zero → big "0" with label "here tonight" (no special-casing needed).
   - **Adaptive live tile** — one of, in priority order:
     - casual nets playing > 0 → big "N" + "courts live now" (green/live treatment);
     - else a tournament is live (`status` ∈ {`pools`,`bracket`}) → "Tournament" + "live now" (live treatment);
     - else → "—" + "no games yet" (muted).
3. **"On the courts" board** — `buildPublicLiveCourtsHTML()` (casual Live Nets), unchanged. Omitted when empty.
4. **Tournament strip** — shown only when a tournament is live: a tappable row "‹name› — pool play|bracket"
   with a "live →" affordance that calls the existing in-content `[data-nav-tab]` navigation to the
   **Bracket** tab (`data-nav-tab="tournament"` on public, or the public bracket tab id). Full tournament
   detail stays in that tab — not duplicated on Home.
5. **Bottom row** — compact Next-session card (date/time/location, existing SVG icons) **beside** the
   **Check In** button (`data-nav-tab="players"` — unchanged behavior).
6. **Empty / pre-session state** — no session: the session card shows "No session scheduled yet." No live
   play: tiles show "0 here / no games yet," the courts board is omitted, the Check In button stays.

All colors from the existing direction-A tokens (`--accent`, `--live`, `--live-soft`, `--accent-soft`,
etc.). **No neon, no emoji (inline SVG only), no skill anywhere on this surface.**

## Pure status helper (TDD)
Add to `public/pure.js`, exported, unit-tested:

```
publicHubStatus({ checkedInCount, liveCourtCount, tournamentStatus }) -> {
  here: <integer>,                       // checkedInCount (>= 0)
  liveTile: 'courts' | 'tournament' | 'none',
  liveCount: <integer>,                  // courts count when liveTile==='courts', else 0
  tournamentLive: <boolean>              // tournamentStatus is 'pools' or 'bracket'
}
```
Rules: `liveTile='courts'` iff `liveCourtCount > 0`; else `'tournament'` iff tournamentStatus ∈
{`pools`,`bracket`}; else `'none'`. `tournamentLive` = tournamentStatus ∈ {`pools`,`bracket`}. Pure,
deterministic — the single source of truth for which tile/label renders, so the render function stays a
thin formatter.

## Data flow
- `here` ← `state.checkedIn.length`.
- `liveCourtCount` ← `getPublicLiveData().liveCount` (casual nets currently playing).
- `tournamentStatus` ← the active public tournament's status (the same one the public Bracket tab follows;
  reuse the existing active-tournament resolution — `state.tournaments` + the public follow logic in
  `tdbRefreshTournaments`). Tournament name from that row.
- `publicHomeHTML()` calls `publicHubStatus(...)` + `buildPublicLiveCourtsHTML()` and renders layout C.

## Live auto-update
The hub must update without a manual reload, using `partialRender()` (never full `render()`), preserving
scrollTop so a spectator isn't yanked to the top:
- **Headcount** — already refreshes on the `players` realtime channel.
- **Casual courts + live tile** — already refresh on the `live_state` realtime channel.
- **Tournament strip/tile** — ensure `queueTournamentRefresh()`'s completion triggers a public
  `partialRender` so the strip appears/updates when a tournament goes live or changes phase.
Requirement: confirm each of the three updates re-renders only the Home content via `partialRender`.

## Constraints
- Bump `APP_VERSION` + `SW_VERSION` (lockstep) per change; `node --check public/app.js` after each edit.
- §38 satisfied (3 localhost options shown; C chosen). §41: verify desktop AND phone in the same change.
- Players never see skill; no neon; no emoji (SVG only). Mobile-first.
- No DB change, no migration, no new write surface. Read-only + the existing Check In CTA.
- `partialRender` for all live updates (no full `render()`), preserve scroll.

## Verification gate
- vitest: `publicHubStatus` cases (courts-live, tournament-live-no-courts, nothing-live, zero here) green.
- Live on prod (Playwright, signed OUT), phone (≤430px) + desktop (≥1920px):
  - tiles show correct count + adaptive live label cross-checked vs `state`/DB;
  - check a player in (admin, second context) → public headcount increments live (no reload, no scroll jump);
  - with casual nets running → board + "N courts live now" tile correct;
  - with a tournament live (and no casual nets) → live tile reads "Tournament live" + the strip shows and
    its "live →" lands on the Bracket tab;
  - signed-out DOM/network audit: **zero** skill values on the Home; 0 console errors.
- Prod left clean (any test check-ins/live_state reverted).

## Write-backs
`01-state/log.md`, `current.md`, `NOW.md`, `decisions.md` (the count-only + layout-C + tournament-as-link
choices), `Tasks From Claude.md` (C32 status), `03-anatomy/PRODUCT-SURFACE.md` (the new Home hub), and a
`12-history/task-#<id>-C32-public-live-hub.md` before completion.
