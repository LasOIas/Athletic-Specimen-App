# Public Dashboard Remake — Slice 1 (no-auth spectator/live shell) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remake the Athletic Specimen public (player/spectator-facing) surface into the locked-mockup dashboard — new Home spectator shell + Standings + History scaffold + tournament entry gateway + a 3-item bottom nav — with **no auth and no DB migration**, reusing the existing render/sync/compute machinery in `app.js`.

**Architecture:** Extend `public/app.js` in place (locked decision, 2026-07-08 — defers the C67 ES-module restructure to the admin rebuild). New pure data-shaping helpers go in `public/pure.js` (vitest-tested, the established pattern). New/rebuilt HTML-string render functions go in `public/app.js` and are verified through the connected browser (§27/§40/§41). New CSS goes in `public/styles.css`, namespaced `pd-*` to avoid colliding with the existing 9,200-line stylesheet. The remake **reuses** `computeStandings`, `computeSeeding`, `computeChampion`, `pickPoolCurrentGames`, `buildPublicLiveCourtsHTML`, `buildPublicTournamentLiveHTML`, `buildBracketHTML`, `buildPoolPlayHTML`.

**Tech Stack:** Vanilla-JS single-file SPA (no build step, no framework), Supabase (read-only anon for this slice), Vercel (auto-deploy on push to `main`), vitest (pure-function tests), connected-browser verification.

## Global Constraints

- **Design system (Direction-A):** warm-stone `--bg`, muted-blue `--accent`, muted-green `--live`; Inter body / Sora headings; inline SVG icons. Tokens already exist in `styles.css:6-44` — only `--accent-bd: oklch(0.86 0.03 240)`, `--live-ink: oklch(0.40 0.09 150)`, `--gold: oklch(0.62 0.08 78)`, `--gold-soft: oklch(0.92 0.06 85)`, `--gold-bd: oklch(0.82 0.07 85)` are missing and get added in Task 1.
- **§51 no neon / electric / glowing colors.** **§11 no emoji** anywhere (code, output, UI). **§27 plain English + true data** (no fabricated scores/skill).
- **Vocabulary (mike-preferences, 2026-07-08):** NEVER "night / tonight / your night." Name the tournament by its `name`, the session by date, "your team", "your games." This applies to UI copy AND commit/PR text.
- **Privacy floor:** NO skill ratings and NO player skill on any public surface. Public headcount stays **count-only** (never names) where it already is. Rosters may show player **names** only (existing behavior).
- **§41:** every screen ships **desktop AND mobile in the same change**; phone-first; large thumb targets; zero horizontal scroll.
- **Render discipline:** `partialRender()` for background Supabase syncs, `render()` only for explicit user actions (mobile scroll-jump prevention). Any new tab panel that shows live data must be handled in `partialRender()` exactly like the existing per-tab short-circuits, never via a background `render()`.
- **Per-edit gate:** run `node --check public/app.js` after every `app.js` edit; run `npx vitest run` after every `pure.js`/test edit. Bump `APP_VERSION` (`public/app.js:~22`, format `YYYY.MM.DD.N`) — **once, at the merge/ship task (Task 8)**, not per intermediate commit (this slice builds on a branch; see Execution Handoff).
- **Deferred to later slices (do NOT build here):** the personal My-Night hero, My Team screen, the real "claim your team" action, "your record"/"You" highlights, the sport-switcher's actual multi-sport switching, and Supabase Auth. Where a mockup shows a personal element, Slice 1 renders the **spectator variant** (personal element omitted) or an **inert placeholder** (a claim affordance that opens a "sign-in coming soon" note).

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `public/pure.js` | Pure, testable data-shaping helpers | **Add** `shapeStandingsByPool()`, `computeAllTimeLeaderboard()`. Reuse existing `computeStandings`/`computeSeeding`/`computeChampion`. |
| `public/app.js` | All HTML-string render functions + shell + routing | **Modify** `renderPublicShell()` (header + panels), `buildPublicNavInnerHTML()` (3 items), `publicHomeHTML()` (spectator rebuild), `activateMainTab()` (NAV_ANCHOR), the boot-tab guards (~8070), `partialRender()` short-circuits (~1313). **Add** `buildPublicHeaderHTML()`, `buildStandingsPageHTML()`, `buildHistoryPageHTML()`, `loadTournamentHistory()`. |
| `public/styles.css` | Design tokens + component CSS | **Add** 5 tokens + the `pd-*` namespaced component kit (tiles/grid, standings tables, history tabs, sport-pill, claim card). |
| `test/public-dashboard.test.js` | vitest for the new pure helpers | **Create.** |

**Namespacing rule (load-bearing):** every NEW css class introduced by this slice is prefixed `pd-`. Do not reuse the mockups' generic class names (`.card`, `.game`, `.st`, `.grid`, `.tile`, `.seg`, `.nav`) verbatim — they collide with existing app styles. When porting mockup markup, rename each class to its `pd-` equivalent (`.card`→`.pd-card`, `.st`→`.pd-st`, `.seg`→`.pd-seg`, etc.). Existing shared primitives (`.container`, tokens, existing court-row markup from `buildPublicLiveCourtsHTML`) are reused as-is.

---

## Task 1: Design tokens + `pd-*` component CSS kit

**Files:**
- Modify: `public/styles.css:6-44` (token block) and append a new `pd-*` section at end of file.

**Interfaces:**
- Produces: CSS classes consumed by Tasks 2/5/6/7 — `.pd-sportpill`, `.pd-avic`, `.pd-tiles`, `.pd-tile`, `.pd-seg`, `.pd-seg-s`, `.pd-card`, `.pd-colh`, `.pd-st`, `.pd-st-you`, `.pd-youcard`, `.pd-medal`, `.pd-pt`, `.pd-plc`, `.pd-rec2`, `.pd-cw`, `.pd-claimbtn`, `.pd-claimrow`, `.pd-thero`. Plus tokens `--accent-bd`, `--live-ink`, `--gold`, `--gold-soft`, `--gold-bd`.

- [ ] **Step 1: Add the 5 missing tokens.** In `styles.css` `:root` (after line 18, the `--warn` line), add:
```css
  --accent-bd:  oklch(0.86 0.03 240);      /* accent border — pills, You-highlight, claim card */
  --live-ink:   oklch(0.40 0.09 150);      /* live text on live-soft */
  --gold:       oklch(0.62 0.08 78);       /* champion/records accent (matte, non-neon per §51) */
  --gold-soft:  oklch(0.92 0.06 85);
  --gold-bd:    oklch(0.82 0.07 85);
```

- [ ] **Step 2: Append the `pd-*` component kit** at the end of `styles.css`. Port the component rules from the locked mockups, renaming every class to its `pd-` form. Source of truth per component:
  - sport-pill + account icon: `docs/superpowers/specs/2026-07-08-public-dashboard-mockups/signin-variations.html:34-38` (`.sportpill`→`.pd-sportpill`, `.avic`→`.pd-avic`).
  - tile grid: `home-final.html:60-65` (`.grid`→`.pd-tiles`, `.tile`→`.pd-tile`, `.ti`→`.pd-ti`, `.tt`→`.pd-tt`, `.ts`→`.pd-ts`).
  - segmented toggle: `standings.html:40-42` (`.seg`→`.pd-seg`, `.seg .s`→`.pd-seg-s`, `.on`→`.pd-seg-s.pd-on`).
  - standings tables: `standings.html:43-63` (`.ph`→`.pd-ph`, `.colh`→`.pd-colh`, `.st`→`.pd-st`, `.st.you`→`.pd-st.pd-you`, `.youtag`→`.pd-youtag`, `.rec`→`.pd-rec`, `.df`→`.pd-df`, `.medal`/`.m1..m3`→`.pd-medal`/`.pd-m1..3`, `.youcard`→`.pd-youcard`, `.foot`→`.pd-foot`).
  - history: `history.html:44-68` (`.yourrec`→`.pd-yourrec`, `.pt`→`.pd-pt`, `.plc`→`.pd-plc`, `.rec2`→`.pd-rec2`, `.cw`→`.pd-cw`).
  - claim card / hero: `signin-variations.html:60-73` (`.claimrow`→`.pd-claimrow`, `.thero`→`.pd-thero`, `.claimbtn`→`.pd-claimbtn`).
  - shared `.pd-card` (base card): from `home-final.html:38`.
  Keep every `var(--token)` reference intact (the tokens now all exist). Do NOT copy the mockups' `.phone`/`.scr`/`body`/`.stage` chrome — that's mockup scaffolding, not app CSS.

- [ ] **Step 3: Verify no collision.** Grep the file for each new class name to confirm it appears only in the new block:
```bash
grep -nE '\.pd-(card|tile|st|seg|pt|plc|rec2|cw|sportpill|avic|youcard|medal|claimbtn|claimrow|thero|colh|tiles)\b' public/styles.css | sort
```
Expected: every match is inside the appended `pd-*` section (no pre-existing definition).

- [ ] **Step 4: Commit.**
```bash
git add public/styles.css
git commit -m "feat(public): add pd-* component CSS kit + 5 direction-A tokens for the dashboard remake"
```

---

## Task 2: Public header — brand + sport-switcher pill + account icon

**Files:**
- Modify: `public/app.js` — `renderPublicShell()` header (`app.js:7301-7304`).
- Create (in `app.js`, near `renderPublicShell`): `buildPublicHeaderHTML()`.

**Interfaces:**
- Produces: `buildPublicHeaderHTML(): string` — the inner HTML for `#app-header` on the public surface. Consumed by `renderPublicShell()`.
- The sport-switcher pill is **inert** this slice (label `Volleyball`, chevron, no menu). The account icon is a person glyph that, when tapped, opens an inert "Accounts are coming soon" note (a simple `appAlert`/toast — reuse the existing lightweight alert helper; grep `function appAlert`/`function appConfirm` and use whichever exists). No auth.

- [ ] **Step 1: Write `buildPublicHeaderHTML()`.** Insert above `renderPublicShell()` (before `app.js:7297`):
```javascript
// Public header (dashboard remake, Slice 1): brand + inert sport-switcher pill + spectator account icon.
// The sport pill and account action are placeholders this slice — SportPack + Supabase Auth are later tracks.
function buildPublicHeaderHTML() {
  return `
    <div class="pd-brand">Athletic Specimen</div>
    <div class="pd-hgrp">
      <button type="button" class="pd-sportpill" id="pd-sport" aria-label="Sport: Volleyball">
        Volleyball
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
      </button>
      <button type="button" class="pd-avic" id="pd-account" aria-label="Account">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/></svg>
      </button>
    </div>`;
}
```
Add matching `.pd-brand`/`.pd-hgrp` rules to the `pd-*` CSS block (flex row, space-between; brand = Sora 800 15.5px; `.pd-hgrp` gap 9px) — mirror `signin-variations.html:31-33,32`.

- [ ] **Step 2: Wire it into the shell.** Replace the public header body in `renderPublicShell()` (`app.js:7301-7304`):
```javascript
  <header id="app-header" class="pd-header">
    <span class="app-header-mode">PUBLIC</span>
    ${buildPublicHeaderHTML()}
    <div id="js-sync-notice">${sharedSyncNoticeHTML}</div>
  </header>
```
Keep `#js-sync-notice` present (partialRender depends on it — see `architecture.md`). The `PUBLIC` mode chip and sync notice may be visually de-emphasized via CSS but must remain in the DOM.

- [ ] **Step 3: Wire the inert actions.** In `attachHandlers()` (delegated on `#app-content` or a new `#app-header` listener — grep how existing header taps like `.app-header-brand` are bound, ~`app.js:8826+`), add: tapping `#pd-account` or `#pd-sport` calls the existing alert helper with "Accounts are coming soon" / "More sports are coming soon." Idempotent binding (guard with a `dataset` flag like the existing `navTabBound` pattern at `app.js:8841`).

- [ ] **Step 4: `node --check` + browser verify.**
```bash
node --check public/app.js
```
Then serve `public/` and load on desktop 1920 + mobile 390: header shows brand + Volleyball pill + person icon, no horizontal scroll, tapping the pill/icon shows the coming-soon note. Save a screenshot to `.playwright-mcp/`.

- [ ] **Step 5: Commit.**
```bash
git add public/app.js public/styles.css
git commit -m "feat(public): dashboard header — brand, inert sport pill, spectator account icon"
```

---

## Task 3: Bottom nav → 3 items (Home · Check In · Live)

**Files:**
- Modify: `public/app.js` — `buildPublicNavInnerHTML()` (`app.js:7270-7295`).

**Interfaces:**
- Produces: a 3-button public nav. Internal tab key for the third item stays `scores` (renaming the tab id ripples through `partialRender`/boot/`activateMainTab`; only the **label + icon** change to "Live"). Bracket + Register move off the nav — Bracket becomes a Home tile (Task 5), Register becomes the entry-gateway claim card (Task 5).

- [ ] **Step 1: Replace `buildPublicNavInnerHTML()` body** with exactly three buttons (Home `data-nav-tab="home"`, Check In `data-nav-tab="players"`, Live `data-nav-tab="scores"`), using the nav SVGs from `home-final.html:99-101` (Home = house, Check In = person-check, Live = activity-pulse). Delete the conditional Bracket/Register 4th button block (`app.js:7284-7294`).
```javascript
function buildPublicNavInnerHTML() {
  return `
    <button class="nav-btn" data-nav-tab="home">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>
      <span>Home</span>
    </button>
    <button class="nav-btn" data-nav-tab="players">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="8" r="4"/><path d="m16.5 11 2 2 4-4"/></svg>
      <span>Check In</span>
    </button>
    <button class="nav-btn" data-nav-tab="scores">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l3 8 4-16 3 8h4"/></svg>
      <span>Live</span>
    </button>`;
}
```

- [ ] **Step 2: Confirm `refreshTournamentLive` still works.** This function rebuilds `#bottom-nav` innerHTML on a background tournament state change (see `app.js:3863-3867` comment) to show/hide the old Bracket button. With the button gone the rebuild is a no-op but harmless — verify it still calls `buildPublicNavInnerHTML()` and doesn't reference the removed button. Grep `buildPublicNavInnerHTML` for all callers.

- [ ] **Step 3: `node --check` + browser verify** the nav shows exactly 3 items on desktop + mobile, all three navigate, active state highlights correctly.

- [ ] **Step 4: Commit.**
```bash
git add public/app.js
git commit -m "feat(public): 3-item bottom nav (Home / Check In / Live), Bracket+Register move to Home"
```

---

## Task 4: Sub-tab routing plumbing (Standings + History panels)

**Files:**
- Modify: `public/app.js` — `renderPublicShell()` (`app.js:7305-7327`, add panels), `activateMainTab()` NAV_ANCHOR (`app.js:8779`), boot-tab guards (`app.js:8070-8076` and the mirror at `8358-8360`), `partialRender()` (`app.js:~1313`).

**Interfaces:**
- Produces: two new public tab-panels `#tab-standings` and `#tab-history`, reachable via `data-nav-tab="standings"` / `data-nav-tab="history"` from Home tiles (Task 5). Neither has a bottom-nav button; both anchor their nav highlight to `home` (mirrors the existing `tournament`/`session` → `dashboard` anchor pattern). Content builders `buildStandingsPageHTML()` / `buildHistoryPageHTML()` are created in Tasks 6/7 — this task wires empty-safe placeholders that call them.

- [ ] **Step 1: Add the two panels** inside `#app-content` in `renderPublicShell()` (after the `#tab-tournament` panel, `app.js:7326`):
```javascript
    <div id="tab-standings" class="tab-panel">
      <div class="container">
        ${buildStandingsPageHTML()}
      </div>
    </div>
    <div id="tab-history" class="tab-panel">
      <div class="container">
        ${buildHistoryPageHTML()}
      </div>
    </div>
```
(Define temporary stubs `function buildStandingsPageHTML(){return '';}` / `function buildHistoryPageHTML(){return '';}` now if implementing strictly task-by-task, replaced in Tasks 6/7.)

- [ ] **Step 2: Anchor the nav highlight.** In `activateMainTab()` extend `NAV_ANCHOR` (`app.js:8779`) so the public tile-pages highlight Home:
```javascript
  const NAV_ANCHOR = { tournament: state.isAdmin ? 'dashboard' : 'home', session: 'dashboard', standings: 'home', history: 'home' };
```
(Admin `tournament` keeps its existing `dashboard` anchor; public `tournament`/`standings`/`history` anchor to `home`.)

- [ ] **Step 3: Boot-tab validity guards.** At `app.js:8072` and its mirror `8358`, `standings`/`history` are valid only on the public surface and only as sub-pages — if a stale value is restored with no route, fall back to `home`. Extend the existing non-admin guard:
```javascript
if (!state.isAdmin && ['teams', 'session'].includes(activeMainTab)) activeMainTab = 'home';
// standings/history persist fine (they're valid public sub-pages); no extra guard needed unless a panel is absent.
```
Confirm `#tab-standings`/`#tab-history` always exist in the public shell so a restored tab never lands on a missing panel.

- [ ] **Step 4: partialRender short-circuit.** In `partialRender()` (`app.js:~1313`, alongside the existing `activeMainTab === 'home'`/`'scores'`/`'tournament'` short-circuits), add branches for `standings`/`history` that re-render their panel content in place when they're the active tab and a background sync arrives (so live standings update without a scroll-jumping full `render()`):
```javascript
  if (!playersEl && activeMainTab === 'standings') {
    const el = document.querySelector('#tab-standings .container');
    if (el) el.innerHTML = buildStandingsPageHTML();
    return;
  }
  if (!playersEl && activeMainTab === 'history') {
    const el = document.querySelector('#tab-history .container');
    if (el) el.innerHTML = buildHistoryPageHTML();
    return;
  }
```
Match the exact guard shape of the existing `home`/`scores` short-circuits (copy their structure verbatim, swap the id + builder).

- [ ] **Step 5: `node --check` + browser verify** by temporarily adding a `data-nav-tab="standings"` link in the console (or wait for Task 5): navigating to `standings`/`history` shows the (empty for now) panel, Home stays highlighted, back-nav works, no console errors.

- [ ] **Step 6: Commit.**
```bash
git add public/app.js
git commit -m "feat(public): route Standings + History as Home-anchored sub-tabs (panels, nav-anchor, partialRender)"
```

---

## Task 5: Home spectator shell rebuild (Option A hybrid, spectator variant)

**Files:**
- Modify: `public/app.js` — `publicHomeHTML()` (`app.js:2463-2530`).

**Interfaces:**
- Consumes: `publicLiveTournament()`, `getPublicLiveData()`, `buildPublicLiveCourtsHTML()`, `publicHubStatus()`, `state.currentSession`, `state.checkedIn`, `formatSessionDate()` (all existing).
- Produces: the rebuilt Home. **Spectator variant** = the Option A layout **minus the personal hero** (`home-final.html:80-85` is deferred). Structure top→bottom:
  1. **Tournament entry gateway** (when `publicLiveTournament()` is non-null): the claim-in-hero card (`signin-variations.html` Option C, `:162-167`) — tournament name + "N teams · Pools underway · K nets live" + an inert **"Playing? Claim your team"** `.pd-claimbtn` that opens the "coming soon" note. When no live tournament but one has `registration_open`, show the existing register CTA reworded (no "night").
  2. **"On the courts" live board** — reuse `buildPublicLiveCourtsHTML()` + `buildPublicTournamentLiveHTML()` output inside a `.pd-card` with an `On the courts` eyebrow (this is the same data the Live tab shows; keep the existing court-row markup).
  3. **Tile grid** (`.pd-tiles`) — **three** tiles for Slice 1: **Standings** (`data-nav-tab="standings"`, subtitle = leader or "live"), **Bracket** (`data-nav-tab="tournament"`, subtitle = round/status), **History** (`data-nav-tab="history"`, subtitle "Past tournaments"). **My Team tile is omitted** (needs auth — Slice 3). Tile SVGs from `home-final.html:92-95`.
  4. **No active tournament state:** casual live status + next-session card (existing `sessionCard` markup, `app.js:2510-2519`, reworded to name the date, never "night") + the Check In CTA (`data-nav-tab="players"`).

- [ ] **Step 1: Confirm reuse points.** Read `buildPublicLiveCourtsHTML()` and `getPublicLiveData()` (grep for their definitions) to confirm the returned HTML/shape you'll embed. Confirm `publicLiveTournament()` returns the tournament object with `.name` and `.status`.

- [ ] **Step 2: Rebuild `publicHomeHTML()`.** Replace the function body (`app.js:2463-2530`) to emit, in order: gateway card → courts card → tile grid → (fallback) session card + Check In CTA. Bind:
  - claim card header: `escapeHTML(tourney.name)`; sub-line built from `state.tournamentTeams.length` + status + live-net count (derive nets from `state.tournamentMatches` live rows, reuse the count already computed for the courts board).
  - tile subtitles: Standings → top seed/leader name from `computeStandings(state.tournamentTeams, state.tournamentMatches)[0]?.name` (or "Live") ; Bracket → `tourney.status === 'bracket' ? 'In progress' : 'After pools'`; History → `Past tournaments`.
  - Preserve the `#ph-tiles`/`#ph-courts`/`#ph-tourney` in-place-update ids OR migrate the partialRender home short-circuit (`app.js:~1313`) to rebuild the whole `.home-screen` — pick the lower-risk option and keep the home short-circuit consistent with what it targets. **Reuse the existing `!state.loaded` cold-start guards** (`app.js:2472-2473`) so no hard-empty flash before first sync.
  - All personal copy omitted; no "You"/"your record"; no skill.

- [ ] **Step 3: Port the markup** from `home-final.html` (courts card `:86-90`, tile grid `:91-96`) and `signin-variations.html` Option C (`:162-167`), renaming classes to `pd-*`. Wire tiles with `data-nav-tab` (the existing delegated `#app-content` handler at `app.js:8843` already routes in-content `[data-nav-tab]` clicks — no new handler needed).

- [ ] **Step 4: `node --check` + browser verify (desktop + mobile), against REAL data.** Load a live tournament in the DB (or the existing June 2026 tournament). Confirm: courts board matches the Live tab; tiles navigate to Standings/Bracket/History; claim button shows the coming-soon note; no-tournament state shows the session card + Check In; **cross-check one rendered value (e.g. the leader name in the Standings tile) against the DB via Supabase MCP** (§27). Screenshot both viewports to `.playwright-mcp/`.

- [ ] **Step 5: Commit.**
```bash
git add public/app.js
git commit -m "feat(public): rebuild Home as the spectator dashboard — gateway card, live board, Standings/Bracket/History tiles"
```

---

## Task 6: Standings page (Option A — by pool + Pools/Overall toggle)

**Files:**
- Create: `public/pure.js` — `shapeStandingsByPool()`.
- Create: `test/public-dashboard.test.js` — tests for `shapeStandingsByPool()`.
- Modify: `public/app.js` — replace the `buildStandingsPageHTML()` stub.

**Interfaces:**
- Consumes: `computeStandings(teams, matches)` (returns `{teamId,name,wins,losses,pointDiff,rank}[]`, `pure.js:280`), `computeSeeding(teams, matches)` (`{teamId,name,winPct,pointDiff,seed}[]`, `pure.js:354`), `state.tournamentPools`, `state.tournamentTeams`, `state.tournamentMatches`.
- Produces:
  - `shapeStandingsByPool(pools, teams, matches): { poolName, nets, rows }[]` where `rows` is that pool's `computeStandings` subset (filtered to the pool's team ids, re-ranked 1..n within the pool), `nets` is the pool's net range label (e.g. "Nets 1–3"). Pure, deterministic.
  - `buildStandingsPageHTML(): string` — the Option A page: a `.pd-seg` **Pools | Overall seeding** toggle + per-pool `.pd-card` mini-tables (Pools view) or one overall `.pd-card` seed table + the `.pd-foot` "Seeded by win %, then point differential. Top 8 make the bracket." (Overall view). Toggle state held in a module var (e.g. `pdStandingsView`, default `'pools'`), flipped by a delegated click handler that calls `partialRender()`/re-renders the panel. **No "You" highlight this slice** (needs a claimed team).

- [ ] **Step 1: Read the pool shape.** Read `buildPoolPlayHTML()` (`app.js:4061`) and the `state.tournamentPools` population (`app.js:3727`) to confirm each pool object's fields (name/label, team ids, nets). Write `shapeStandingsByPool` against those exact field names.

- [ ] **Step 2: Write the failing test.** In `test/public-dashboard.test.js`:
```javascript
import { describe, it, expect } from 'vitest';
import { shapeStandingsByPool } from '../public/pure.js';

describe('shapeStandingsByPool', () => {
  it('ranks teams within their own pool and labels the net range', () => {
    const pools = [{ name: 'Pool A', teamIds: ['t1', 't2'], nets: [1, 2, 3] }];
    const teams = [{ id: 't1', name: 'Ballin' }, { id: 't2', name: 'Dinks' }];
    const matches = [
      { phase: 'pool', status: 'final', team_a_id: 't1', team_b_id: 't2',
        winner_team_id: 't1', score_a: 21, score_b: 10 },
    ];
    const out = shapeStandingsByPool(pools, teams, matches);
    expect(out).toHaveLength(1);
    expect(out[0].poolName).toBe('Pool A');
    expect(out[0].nets).toBe('Nets 1–3');
    expect(out[0].rows.map((r) => r.name)).toEqual(['Ballin', 'Dinks']);
    expect(out[0].rows[0].rank).toBe(1);
  });
});
```

- [ ] **Step 3: Run it — expect fail.**
```bash
npx vitest run test/public-dashboard.test.js
```
Expected: FAIL (`shapeStandingsByPool is not a function`).

- [ ] **Step 4: Implement `shapeStandingsByPool`** in `pure.js` (near `computeStandings`), with the CommonJS export guard the file already uses (grep the bottom of `pure.js` for the `module.exports` block and add the new fn there):
```javascript
function shapeStandingsByPool(pools, teams, matches) {
  const all = computeStandings(teams || [], matches || []);   // ranked across everyone
  const byId = {}; all.forEach((r) => { byId[r.teamId] = r; });
  const netLabel = (nets) => {
    const ns = (nets || []).slice().sort((a, b) => a - b);
    if (!ns.length) return '';
    return ns.length === 1 ? ('Net ' + ns[0]) : ('Nets ' + ns[0] + '–' + ns[ns.length - 1]);
  };
  return (pools || []).map((p) => {
    const ids = p.teamIds || p.teams || [];       // confirm exact field in Step 1
    const rows = ids.map((id) => byId[id]).filter(Boolean)
      .sort((x, y) => (x.rank - y.rank));
    rows.forEach((r, i) => { r.rank = i + 1; });  // re-rank within the pool
    return { poolName: p.name || p.label || '', nets: netLabel(p.nets), rows };
  });
}
```
Adjust `ids`/`nets` field access to match Step 1's findings.

- [ ] **Step 5: Run the test — expect pass.**
```bash
npx vitest run test/public-dashboard.test.js
```
Expected: PASS.

- [ ] **Step 6: Implement `buildStandingsPageHTML()`** in `app.js` (replace the Task-4 stub). Port `standings.html` col A markup (`:77-93`) → `pd-*`. Pools view: one `.pd-card` per `shapeStandingsByPool(...)` entry with `.pd-ph` header (poolName + nets) + `.pd-colh` + `.pd-st` rows (rank, `escapeHTML(name)`, `wins–losses`, signed `pointDiff` with `.pd-df.pd-p`/`.pd-df.pd-n` sign class). Overall view: one `.pd-card` from `computeSeeding(...)` + the `.pd-foot`. Empty state (no pool games final yet): a centered "Standings appear once pool games are scored" message. Add the `.pd-seg` toggle bound to `pdStandingsView`.

- [ ] **Step 7: Toggle handler.** Add a delegated click handler (idempotent, in `attachHandlers`) for `.pd-seg-s[data-pd-view]` that sets `pdStandingsView` and re-renders `#tab-standings .container` in place (no full `render()`).

- [ ] **Step 8: `node --check` + `vitest` + browser verify** on a real pools tournament: both toggle views render correct W–L + diff, cross-check one pool's ranking against the DB (§27), desktop + mobile, no horizontal scroll, no console errors. Screenshot.

- [ ] **Step 9: Commit.**
```bash
git add public/pure.js public/app.js test/public-dashboard.test.js
git commit -m "feat(public): Standings page — by-pool + overall-seeding toggle (shapeStandingsByPool, tested)"
```

---

## Task 7: History scaffold (Option C — tabbed Tournaments / Leaderboard / Champions)

**Files:**
- Create: `public/pure.js` — `computeAllTimeLeaderboard()`.
- Modify: `test/public-dashboard.test.js` — tests for `computeAllTimeLeaderboard()`.
- Modify: `public/app.js` — replace the `buildHistoryPageHTML()` stub; add `loadTournamentHistory()`.

**Interfaces:**
- Consumes: `computeChampion(mainMatches, teams)` (`pure.js:376`, returns `{teamId,name}|null`), the tournaments list (`state.tournaments`), and a new read-only loader.
- Produces:
  - `loadTournamentHistory(): Promise<void>` — a **read-only anon SELECT** that, for each `status === 'completed'` tournament, fetches its teams + main-phase matches once and stores `state.tournamentHistory = [{ id, name, date, teamCount, champion }]` (champion via `computeChampion`). No migration, no write. Cache in `state`; refresh on the same authority hooks as other loads. If the query returns nothing/omits data, `state.tournamentHistory = []`.
  - `computeAllTimeLeaderboard(history): { mostTitles, mostWins?, longestStreak? }` — aggregates titles per team across `history`. **Titles are fully derivable** (champion per completed tournament). Wins/streak require per-match history not loaded this slice → return them as `null` and the UI shows "needs full match history" honest placeholders (spec §6.4/§9 route the retention model to the accounts track).
  - `buildHistoryPageHTML(): string` — Option C tabbed shell (`history.html` col C, `:124-131`): **Tournaments** (chronological `.pd-pt` rows: name + "Champion · TEAM · N teams"; no personal placement badge — deferred), **Leaderboard** (`.pd-rec2` "Most titles" from `computeAllTimeLeaderboard`; "Most wins"/"Longest streak" = honest "coming soon" rows), **Champions** (`.pd-cw` wall: date + trophy + champion team). "Your record" `.pd-yourrec` card is **omitted** (needs auth). Tab state in a module var `pdHistoryTab` (default `'tournaments'`).

- [ ] **Step 1: Write the failing test** for `computeAllTimeLeaderboard`:
```javascript
import { computeAllTimeLeaderboard } from '../public/pure.js';

describe('computeAllTimeLeaderboard', () => {
  it('counts titles per champion team across completed tournaments', () => {
    const history = [
      { champion: { teamId: 'a', name: 'Ballin' } },
      { champion: { teamId: 'a', name: 'Ballin' } },
      { champion: { teamId: 'b', name: 'Diggers' } },
      { champion: null },
    ];
    const out = computeAllTimeLeaderboard(history);
    expect(out.mostTitles).toEqual({ name: 'Ballin', count: 2 });
    expect(out.mostWins).toBeNull();
    expect(out.longestStreak).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect fail.** `npx vitest run test/public-dashboard.test.js`

- [ ] **Step 3: Implement `computeAllTimeLeaderboard`** in `pure.js` (+ export guard):
```javascript
function computeAllTimeLeaderboard(history) {
  const titles = {};
  (history || []).forEach((h) => {
    if (!h || !h.champion) return;
    const c = h.champion;
    titles[c.teamId] = titles[c.teamId] || { name: c.name || '', count: 0 };
    titles[c.teamId].count += 1;
  });
  const ranked = Object.keys(titles).map((k) => titles[k])
    .sort((x, y) => (y.count - x.count) || String(x.name).localeCompare(String(y.name)));
  return { mostTitles: ranked[0] || null, mostWins: null, longestStreak: null };
}
```

- [ ] **Step 4: Run — expect pass.** `npx vitest run test/public-dashboard.test.js`

- [ ] **Step 5: Implement `loadTournamentHistory()`** in `app.js`. Model it on the existing tournament load (grep the code around `app.js:3715-3731` that reads `state.tournaments`/`state.tournamentPools` and follow the same Supabase client + anon read pattern). For each completed tournament: select its teams + `phase='main'` matches, compute champion, push `{id,name,date,teamCount,champion}`. Wrap in try/catch → on error set `state.tournamentHistory = []` (History must never block boot; the app works offline). Call it from the same place the main tournament data loads (and gate the History tab render on `state.tournamentHistory` presence with a loading state).

- [ ] **Step 6: Implement `buildHistoryPageHTML()`** in `app.js` (replace stub). Port `history.html` col C (`:122-131`) → `pd-*`. Render the three tabs from `state.tournamentHistory` + `computeAllTimeLeaderboard(state.tournamentHistory)`. Champions/Tournaments = real data; Leaderboard non-title rows + "your record" = honest "coming soon" placeholders. Empty state (no completed tournaments): "Past tournaments show up here after your first completed tournament." Tab handler mirrors Task 6's toggle (delegated, idempotent, in-place re-render).

- [ ] **Step 7: `node --check` + `vitest` + browser verify** on real data (the DB has completed tournaments — confirm via Supabase MCP): Champions wall lists each completed tournament's champion, Tournaments tab matches, Leaderboard "Most titles" cross-checks the DB, coming-soon rows read honestly (no fabricated numbers). Desktop + mobile, no console errors. Screenshot.

- [ ] **Step 8: Commit.**
```bash
git add public/pure.js public/app.js test/public-dashboard.test.js
git commit -m "feat(public): History scaffold — tabbed Tournaments/Leaderboard/Champions (computeAllTimeLeaderboard, tested)"
```

---

## Task 8: End-to-end verification, version bump, ship, vault write-back

**Files:**
- Modify: `public/app.js:~22` (`APP_VERSION`).
- Modify: vault `01-state/*` + `12-history/`.

- [ ] **Step 1: Full local pass.** `node --check public/app.js` clean; `npx vitest run` all green (existing 174 + new). Grep the diff for `render()` misuse: no NEW background/sync path calls `render()` (only `partialRender()`), and no `night`/`tonight` copy:
```bash
git diff main --  public/app.js | grep -nEi "\brender\(\)|tonight|your night|\bnight\b" || echo "clean"
```
Resolve any hit.

- [ ] **Step 2: Exhaustive connected-browser verification (§27/§40/§41)** on localhost, then a Vercel **preview** deploy of the branch — desktop 1920 + mobile 390, signed-out (spectator):
  - Home: gateway card, live board, three tiles all navigate; no-tournament fallback shows session + Check In.
  - Standings: both toggle views correct vs DB.
  - History: three tabs, champions vs DB, honest placeholders.
  - Live tab (relabeled): live board renders read-only.
  - Check In tab: unchanged, still works.
  - 0 console errors on every surface; no horizontal scroll; no skill/ratings anywhere; no emoji; no neon; no "night" copy.
  - Cross-check at least one rendered value per data screen against Supabase MCP.

- [ ] **Step 3: Bump `APP_VERSION`** to today's `YYYY.MM.DD.N` (`public/app.js:~22`). `node --check`.

- [ ] **Step 4: Merge the branch to `main` + push** (single production deploy). Confirm the version pill shows the new version on prod, spot-check Home on mobile.
```bash
git checkout main && git merge --no-ff <branch> && git push origin main
```

- [ ] **Step 5: Vault write-back** (per `CLAUDE.md` session-end + §30): `12-history/task-#<id>-public-dashboard-slice-1.md` (all template sections) BEFORE marking complete; `01-state/log.md` (newest at top); `01-state/current.md`; `01-state/decisions.md` (the extend-in-place-over-C67 call, the `pd-*` namespacing, History thin-data deferral); `01-state/NOW.md` next action = Identity & Accounts (Slice 2). Update `Tasks From Claude.md`.

- [ ] **Step 6: Final commit** (vault is a separate repo/dir — commit there per its rules).

---

## Self-Review

**Spec coverage** (`2026-07-08-public-dashboard-remake-design.md`):
- §5 IA (nav Home·Check In·Live; tiles → Standings/Bracket/History) → Tasks 3, 5. ✓
- §5 header (brand + sport-switcher + account state) → Task 2. ✓
- §6.1 Home Option A **spectator variant** (personal hero deferred) → Task 5. ✓
- §6.3 Standings Option A (by pool + toggle) → Task 6. ✓
- §6.4 History Option C (tabbed; your-record deferred; thin-data noted) → Task 7. ✓
- §6.5 entry gateway (spectate-first, claim-in-card inert) → Task 5 (gateway card) + Task 2 (account icon). ✓
- §6.2 My Team Option B → **explicitly deferred** (auth) — omitted, tile not shown. ✓ (documented, not a gap)
- §7 states (no-tournament, signed-out, cold-start `loaded` gate) → Tasks 5/6/7 empty states + reused `state.loaded` guards. ✓
- §8 success criteria (mobile+desktop, 0 errors, no skill/night/emoji/neon, spectator read-only, DB cross-check) → Task 8. ✓
- §4 design system + partialRender discipline + §41 → Global Constraints + every task. ✓

**Placeholder scan:** the large HTML bodies point at exact locked mockup line ranges + the `pd-*` namespacing rule + explicit data bindings (not "TBD"); pure helpers + tests carry full code. Two field-shape confirmations (pool object fields in Task 6 Step 1; tournament-load pattern in Task 7 Step 5) are real read-first steps against named functions, not deferrals.

**Type consistency:** `computeStandings` rows use `pointDiff`/`wins`/`losses`/`rank`/`name`/`teamId`; `computeChampion` returns `{teamId,name}`; `computeAllTimeLeaderboard` consumes `{champion:{teamId,name}}`; `shapeStandingsByPool` returns `{poolName,nets,rows}`. Consistent across Tasks 5/6/7.

**Known Slice-1 limitation (surfaced, not hidden):** History Leaderboard beyond titles + all personal/"You" data are honest placeholders until the accounts + history-retention tracks land — matches spec §6.4/§9 and Slice sequencing.

---

## Execution Handoff

**Branch strategy (recommended):** build Slice 1 on a feature branch (or worktree via `superpowers:using-git-worktrees`). Each task commits to the branch; **`main` stays deployable** the whole time; verify the full slice on localhost + a Vercel preview; then Task 8 bumps the version and merges to `main` for **one** production deploy. This respects "commit + push after every fix" without deploying half-built intermediates to the live app Mike runs tournaments on.

Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, two-stage review between tasks, fast iteration. (REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`; each dispatch's first line invokes lasolas-skill per §29; subagents commit, the controller pushes per §21.)

**2. Inline Execution** — execute tasks in this session with checkpoints. (REQUIRED SUB-SKILL: `superpowers:executing-plans`.)
