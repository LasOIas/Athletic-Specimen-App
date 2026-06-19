# C26 — Design System + Two-Surface Redesign Shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **First line of any subagent dispatch:** "Invoke lasolas-skill before doing anything else. Follow its pre-flight + 3-phase workflow + UI verification + vault writeback for this task." (rulebook §29)

**Goal:** Re-skin the Athletic Specimen app to the approved direction-A "Clean Light" design system and split the single `render()` into two clean surfaces (public view + admin console), each owning its own header, panels, and 4-item bottom nav — shell + skin only, no new features, no DB, no auth changes.

**Architecture:** Vanilla-JS SPA, single `public/app.js` (~9,300 lines), no router, one `render()` + `partialRender()`. C26 keeps that shape: `render()` becomes a 2-line switch (`state.isAdmin ? renderAdminShell() : renderPublicShell()`), each shell builds its own `#app-header` + `.tab-panel`s + `#bottom-nav`. No `state.isAdmin ?` ternaries interleaved inside shared panels. Low-level fragment builders are re-homed (re-wired, not rewritten). The new screens (public Home/Scores, admin Dashboard/Co-pilot) are read-only re-presentations of existing `state` (next-session, Live-Nets, checked-in count) + launchers to existing screens — no new data source.

**Tech Stack:** Vanilla JS (ES2015, no build step), template-literal HTML, plain CSS custom properties in `public/styles.css`, Google Fonts (Inter + Sora via CDN), inline SVG icons. Supabase/Vercel unchanged. Verification: `node --check`, the existing vitest suite (`/test`, pure.js only — must stay green/untouched), Chrome DevTools MCP browser gestures + screenshots at 1920 and 390.

## Global Constraints

Copied verbatim from the spec + the live rulebook gates. **Every task implicitly includes this section.**

- **Direction = A "Clean Light"** (Relay system, muted blue). Visual target = the approved mockups `.superpowers/brainstorm/direction-A-screens.html` (public) + `.superpowers/brainstorm/direction-A-admin.html` (admin). The mockups are the markup/CSS/SVG source of truth; the phone-frame chrome in them (`body{background:#10131a}`, `.phone`, `.notch`, `.sb`) is scaffolding — do NOT port it; the real surface is `.screen` = `var(--bg)`.
- **`state.isAdmin` = the surface switch.** Real auth is a later batch — do not touch the C21 login/JWT path.
- **No new features. No DB. No Auth changes.** Shell + skin only. New screens re-present existing state.
- **Players never see `players.skill`** on any public/player surface (rulebook §AS-1). Skill appears only on the admin roster.
- **No neon / glow. No emojis in UI** — SVG icons only (rulebook §AS-2/§AS-3).
- **Mobile-first.** Primary device is Mike's phone mid-session. Every visual change ships desktop AND mobile in the same task (§41).
- **§38 — three localhost direction options before shipping any visual change.** Build a quick local comparison, Mike picks one (or combines/rejects), then ship the pick. Never two, never one.
- **Bump `APP_VERSION` (`public/app.js:27`) AND `SW_VERSION` (`public/sw.js:3`) in LOCKSTEP** on every code change. Format `YYYY.MM.DD.N` (N resets daily). The version pill is how Mike verifies the live build.
- **`partialRender()` for background syncs, full `render()` only for explicit user actions** — never reintroduce the scroll-jump (`mike-preferences` §4). The surface split must preserve this: `partialRender()` still targets `.players` / `#js-sync-notice` / `#js-checkin-stats`.
- **`node --check public/app.js` after every edit.** Commit + push after every shipped item (Vercel auto-deploys).
- **§30 — write `12-history/task-#<id>-<slug>.md` BEFORE marking any task complete.** Next id continues the project counter (last was `task-#43`).
- **§48 — update `03-anatomy/PRODUCT-SURFACE.md` `verified_against` + any changed surface in the same change.**
- **Keep the vitest suite green** — pure.js is not touched by C26; if a step would touch it, stop and re-scope.

## Plan-time design decisions (locked here — implementation details inside the approved design)

These resolve gaps the spec left to plan time. They are inside the approved design, not new design-class questions.

### D1 — Token strategy: re-point legacy names + add canonical names (NOT a literal `:root` replace)
The spec says "replace `styles.css` `:root` lines 6–38 with the oklch block." Taken literally that orphans every existing `var(--brand)`, `var(--surface)`, `var(--text*)`, `var(--success)`, `var(--danger)`, `var(--r-*)`, `var(--shadow-*)` reference (hundreds across styles.css) → the app renders unstyled. **Resolution:** in the same `:root`, (a) ADD the canonical direction-A names the new components use, and (b) RE-POINT the existing legacy names to direction-A values so every existing component reskins coherently with zero breakage. Legacy names become aliases; new components use canonical names. This is what makes item 1 a coherent whole-app reskin rather than a half-migrated look. Exact block in Task 1.

### D2 — Per-surface tab persistence
Replace the single `as_main_tab` (`app.js:29`, `activateMainTab` `app.js:5736`) with two keys: `as_main_tab_public` (default `'home'`) and `as_main_tab_admin` (default `'dashboard'`). `render()`/`activateMainTab` read+write the key for the active surface. On surface switch (login → admin, logout → public) the correct default loads. Done in Task 2.

### D3 — IA remap (old panel → new surface/nav)
| Old panel id | Public surface | Admin surface |
|---|---|---|
| `session` | Home shows a read-only Next-Session card; full form N/A to public | behind Dashboard **Session** quick-action (panel `session`) |
| `players` | **Check In** nav tab (publicCheckin + stats) | **Players** nav tab (adminPlayers) |
| `teams` | (n/a public) | **Courts** nav tab (adminTeams: generate/Live-Nets) |
| `tournament` | **Bracket** nav tab (read-only) | behind Dashboard **Tournament** quick-action (panel `tournament`) |
| — (new) | **Home** nav tab | **Dashboard** (Home) nav tab |
| — (new) | **Scores** nav tab (Live-Nets read-only) | **Co-pilot** nav tab (static placeholder) |

Public bottom-nav (4): **Home · Check In · Scores · Bracket**. Admin bottom-nav (4): **Home(Dashboard) · Players · Courts · Co-pilot**. Tournament/Session/Check-in-mode/Generate-teams reachable from the admin **Dashboard quick-action tiles** (`activateMainTab` switches to the panel even though it has no nav button; Generate-teams = Courts). Check-in-mode quick-action opens the kiosk (existing `checkin.html` / kiosk flow — link, do not rebuild).

### D4 — What is explicitly NOT touched
Tournament engine (`buildTournamentTabHTML` internals, `bindTournamentTabV2`, pools/bracket/seeding), team-balancing, all sync internals (`SyncManager`, outbox, live-state, realtime), the C21 auth/RPC path, `pure.js`, `checkin.html` logic (only its banner emoji→SVG in Task 4). Fragment builders are RE-WIRED (moved/renamed/called from the new shells), never rewritten in their logic.

## File structure

- `public/styles.css` — Task 1 (`:root` tokens) + Task 4 (new component classes ported from the mockups; reconcile any dark hex). Largest CSS growth in Task 4.
- `public/index.html` — Task 1 (Google Fonts `<link>`s in `<head>`; reconcile the dark inline `<style>` lines 16–22 to the light system) + Task 4 (`viewport-fit=cover` on the viewport meta).
- `public/app.js` — Task 2 (split `render()` → `renderPublicShell()`/`renderAdminShell()`, extract inline fragment consts to functions, per-surface persistence), Task 3 (new screen builders + per-surface nav), Task 4 (emoji→SVG at the session-card rows, per-screen class application). `APP_VERSION` bump every task.
- `public/sw.js` — `SW_VERSION` bump every task (lockstep). No asset-list change unless self-hosting fonts (default: CDN).
- `public/checkin.html` — Task 4 only (banner emoji→SVG at lines 162–164; version-precached).
- `docs/superpowers/specs/2026-06-18-C26-design-system-two-surface-shell.md` — source spec (read-only reference).
- `C:\Ai Master\Projects\Athletic Specimen\03-anatomy\PRODUCT-SURFACE.md` — update each task (§48).

## Canonical SVG icon set (lift verbatim from the mockups when building)

Defined once here; reused across Tasks 3 + 4. Each is a 24×24 viewBox. Stroke icons use `fill="none" stroke="currentColor" stroke-width="1.9"` (nav) / `1.8` (rows). Source lines in `.superpowers/brainstorm/`:
- **home** `<path d="M3 11l9-8 9 8M5 10v10h14V10"/>`
- **check** `<path d="M9 11l3 3L22 4M21 12v7H3V5h11"/>`
- **bars (scores)** `<path d="M4 19V10M10 19V5M16 19v-7M22 19H2"/>`
- **bracket** `<path d="M6 4v16M6 8h6v4H6M18 12v8M18 12h-6"/>`
- **players** `<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 2.7-5 6-5s6 2 6 5"/>`
- **courts** = bars icon (`M4 19V10M10 19V5M16 19v-7M22 19H2`)
- **sparkle (co-pilot)** `<path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9z"/>`
- **calendar** `<rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9h18M8 2.5v4M16 2.5v4"/>`
- **clock** `<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>`
- **pin** `<path d="M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>`
- **search** `<circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>`
- **plus** `<path d="M12 5v14M5 12h14"/>`
- **gear** (full path) lifted from `direction-A-admin.html:109`
- **send** `<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>`

---

## Task 1 — Direction-A token system

Whole-app coherent reskin via tokens + fonts. No structural HTML change. After this task the existing app renders in warm-stone/Inter/Sora/muted-blue but with the OLD layout — that's expected (skin first, structure in 2–4).

**Files:**
- Modify: `public/styles.css:6-38` (the `:root` block)
- Modify: `public/index.html:5-8` (no — fonts go in `<head>`, see steps), `public/index.html:16-22` (dark inline `<style>` reconcile)
- Modify: `public/app.js:27` (`APP_VERSION`)
- Modify: `public/sw.js:3` (`SW_VERSION`)

**Interfaces:**
- Produces: the CSS custom properties `--bg --card --border --ink --muted --faint --accent --accent-soft --live --warn` (canonical, used by Tasks 3–4) AND re-pointed legacy aliases (`--brand --surface --text* --success --danger --shadow-* --r-*`) consumed by all existing components.

- [ ] **Step 1: §38 — build the three localhost token options.** Create a throwaway `public/dev-tokens.html` (git-ignored or deleted after) that renders 4–5 representative existing components (player card, check-in card, bottom nav, a court row, a button) three times with three token variants: (A) exact direction-A oklch as specced; (B) direction-A but accent one step more saturated (`oklch(0.55 0.10 240)`); (C) direction-A but slightly cooler stone (hue 250 instead of 75 on the neutrals). Screenshot all three at 390 + 1920. Present to Mike via AskUserQuestion with the screenshots. **Gate: Mike picks before any `styles.css` edit.**

- [ ] **Step 2: Replace the `:root` block** (`public/styles.css:6-38`) with the picked variant. Default (variant A) is:

```css
:root {
  /* direction-A "Clean Light" — canonical names (used by C26 components) */
  --bg:          oklch(0.985 0.003 75);   /* warm-stone app background */
  --card:        oklch(0.97 0.003 75);    /* card / surface */
  --border:      oklch(0.90 0.005 75);
  --ink:         oklch(0.18 0.005 75);     /* primary text */
  --muted:       oklch(0.50 0.005 75);     /* secondary text / labels */
  --faint:       oklch(0.62 0.005 75);     /* tertiary text / icon stroke */
  --accent:      oklch(0.55 0.07 240);     /* muted blue — single accent */
  --accent-soft: oklch(0.96 0.015 240);    /* accent tint (avatar bg, pills, icon tiles) */
  --live:        oklch(0.55 0.09 150);     /* muted green — live/positive/checked-in */
  --warn:        oklch(0.58 0.10 70);      /* amber — admin cautions only */
  --shadow:      0 1px 2px oklch(0.18 0.005 75 / .06), 0 4px 14px oklch(0.18 0.005 75 / .05);

  /* legacy aliases — re-pointed to direction-A so existing components reskin coherently */
  --brand:        var(--accent);
  --brand-dark:   oklch(0.48 0.08 240);
  --brand-light:  var(--accent-soft);
  --brand-ring:   oklch(0.55 0.07 240 / .18);
  --success:      var(--live);
  --success-light:oklch(0.95 0.03 150);
  --success-border:oklch(0.88 0.05 150);
  --danger:       oklch(0.55 0.16 25);
  --danger-dark:  oklch(0.48 0.16 25);
  --danger-light: oklch(0.95 0.03 25);
  --surface:      var(--card);
  --surface-2:    var(--bg);
  --surface-3:    oklch(0.95 0.004 75);
  --border-2:     oklch(0.85 0.006 75);
  --text:         var(--ink);
  --text-2:       oklch(0.30 0.005 75);
  --text-3:       var(--muted);
  --text-4:       var(--faint);
  --shadow-sm:    0 1px 2px oklch(0.18 0.005 75 / .06);
  --shadow-md:    var(--shadow);
  --r-sm: 8px; --r-md: 13px; --r-lg: 16px;
}
```

- [ ] **Step 3: Set the app background + base font.** Ensure `body` background is `var(--bg)` and `font-family` starts with `'Inter'` (the current `body` font-family is `system-ui…` at `styles.css:59` — prepend `'Inter',`). Add a base rule so Sora is available for headings/brand/scores: a `.brand, h1, h2, h3, h4, .statbig .n, .score, .av { font-family: 'Sora', 'Inter', sans-serif; }` block (refine exact selectors in Task 4; this is the base).

- [ ] **Step 4: Add Google Fonts to `index.html` `<head>`** (after the `<meta viewport>`, before the stylesheet `<link>`):

```html
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Sora:wght@600;700;800&display=swap" rel="stylesheet">
```

Note: Google CDN is a network dependency; `display=swap` avoids FOIT. Default is CDN (no SW precache of font files). If Mike later wants offline fonts, self-host + add to `sw.js` ASSETS — out of scope here.

- [ ] **Step 5: Reconcile the dark inline `<style>`** (`index.html:16-22`). The tournament `.table`/`.badge` rules use dark hex (`#333`, `#222`, `#ddd`). Re-point to tokens: `thead th` border `1px solid var(--border)`, `tbody td` border `1px solid var(--border)`, `.badge` `background:var(--accent-soft);color:var(--accent)`.

- [ ] **Step 6: Bump versions.** `public/app.js:27` `APP_VERSION` → `'2026.06.19.16'` (or next N for the build day); `public/sw.js:3` `SW_VERSION` → the same string. Lockstep.

- [ ] **Step 7: `node --check public/app.js`** → Expected: no output (exit 0). Run the vitest suite (`npm --prefix test test` or the repo's test command) → Expected: 19 passing (pure.js untouched).

- [ ] **Step 8: Browser verify (localhost) at 1920 + 390.** Serve `public/` locally; load `/`. §27 9-question check on the public Players/Check-in view: warm-stone bg, Inter body, Sora brand, muted-blue accents, **zero neon**, no broken `var()` (no unstyled white/black flashes), contrast on secondary text ≥4.5:1. Confirm Network tab shows the Inter+Sora css2 request 200. Screenshot both widths to `.playwright-mcp/`.

- [ ] **Step 9: Delete `public/dev-tokens.html`** (the §38 scratch page) so it never ships.

- [ ] **Step 10: Commit + push.**

```bash
git add public/styles.css public/index.html public/app.js public/sw.js
git commit -m "feat(redesign): C26 item 1 — direction-A token system (oklch warm-stone + Inter/Sora, legacy aliases re-pointed)"
git push origin main
```

- [ ] **Step 11: Verify on prod.** After Vercel deploys: load the live URL, confirm the version pill = the new version, computed `getComputedStyle(document.body).getPropertyValue('--accent')` resolves to the oklch blue, fonts loaded (Network 200), 212 players still load, 0 console errors. Screenshot prod 1920 + 390.

**Verification gate (Task 1):** direction-A tokens computed-live; Inter+Sora loaded (Network 200); secondary text ≥4.5:1; zero neon; no orphaned `var()` (no unstyled regions); 212 players load; 0 console errors; prod pill = new version. §41 both widths screenshotted. §30 history file written before completion.

---

## Task 2 — Two-surface split refactor

Behavior-preserving structural refactor: one `render()` → two shell functions. Same screens as today, just cleanly separated (no interleaved `isAdmin ?` inside shared panels) + per-surface persistence. The new screens come in Task 3. **No visual change expected** beyond Task 1's skin (so §38's "3 options" is N/A here — it's a non-visual refactor; state that explicitly and show a before/after screenshot proving parity).

**Files:**
- Modify: `public/app.js` — `render()` (`4738`), the inline fragment consts (`adminTeamsHTML` `4883`, `adminPlayersHTML` `4920`, `adminLoginHTML` `5144`, `publicCheckinHTML` `5154`), `activateMainTab` (`5734`), the global `activeMainTab` (`29`), the post-render init (`5577-5583`), `APP_VERSION` (`27`).
- Modify: `public/sw.js:3` (`SW_VERSION`).

**Interfaces:**
- Produces: `renderPublicShell() -> string`, `renderAdminShell() -> string`, extracted `adminPlayersHTML() -> string`, `adminTeamsHTML() -> string`, `adminLoginHTML() -> string`, `publicCheckinHTML() -> string` (top-level fns reading `state`), and per-surface persistence helpers `currentTabKey()` / surface-aware `activateMainTab(tab)`.
- Consumes: existing top-level `buildCheckinStatsHTML()` (`1211`), `buildTournamentTabHTML()` (`3161`), `captureTransientInteractionState()`, `restoreTransientInteractionState()`, `attachHandlers()`, `bindTournamentTabV2()`, etc. — unchanged.

- [ ] **Step 1: Extract the four inline fragment consts to top-level functions.** Move `adminTeamsHTML`/`adminPlayersHTML`/`adminLoginHTML`/`publicCheckinHTML` out of `render()` to top-level functions of the same name (e.g. `function adminPlayersHTML(){ … }`) returning the same string. They currently close over `render()` locals — pass those in or recompute from `state`/module scope: audit each for closed-over vars (`escapeHTML` is defined inside render — promote a module-level `escapeHTML` or inline the existing top-level one if present; `regMsg`/`checkMsg` from `messages`; `normalizedActiveGroup` etc. for adminPlayers). Keep logic byte-identical; only relocate + parameterize. After each extraction: `node --check`.

- [ ] **Step 2: Write `renderPublicShell()`.** Returns the full `#app-shell` string for the NON-admin surface: `#app-header` (brand + sync notice + version pill) + `#app-content` with the public panels (`tab-session` read-only Next-Session/empty, `tab-players` = `buildCheckinStatsHTML()` + `adminLoginHTML()` + `publicCheckinHTML()`, `tab-tournament` = `buildTournamentTabHTML()`) + the public `#bottom-nav` (current public nav: Check-in, Tournament-if-active). **This is the current non-admin branch, lifted verbatim — no new screens yet.**

- [ ] **Step 3: Write `renderAdminShell()`.** Returns the full `#app-shell` string for the admin surface: same header + the admin panels (`tab-session` admin form, `tab-players` = stats + `adminPlayersHTML()`, `tab-teams` = `adminTeamsHTML()`, `tab-tournament`) + the admin `#bottom-nav` (Session/Players/Teams/Tournament). **Current admin branch, lifted verbatim.**

- [ ] **Step 4: Reduce `render()` to the switch.** Replace the monolithic body with: capture scroll/interaction snapshot → `root.innerHTML = state.isAdmin ? renderAdminShell() : renderPublicShell()` → the existing post-render wiring (`attachHandlers()`, `bindTournamentTabV2()`, `bindPlayerRowHandlers()`, `bindSelectionHandlers()`, `updateBulkBarVisibility()`, `activateMainTab(...)`, `restoreTransientInteractionState(...)`, `refreshAzStripAvailability()`, scroll restore). Keep the `sanitized` `html.replace(/\n?\]\s*$/, '')` safety net applied to whichever shell ran.

- [ ] **Step 5: Per-surface persistence (D2).** Replace `let activeMainTab = sessionStorage.getItem('as_main_tab') || 'players'` (`app.js:29`) with surface-aware read: a helper `function currentTabKey(){ return state.isAdmin ? 'as_main_tab_admin' : 'as_main_tab_public'; }` and defaults (`admin → 'players'`, `public → 'players'` for now; Task 3 changes defaults to `dashboard`/`home`). `activateMainTab(tab)` writes `sessionStorage.setItem(currentTabKey(), tab)`. On `render()`, initialize `activeMainTab` from `currentTabKey()`. Drop the `if (!state.isAdmin && activeMainTab === 'teams')` guard once surfaces are separate (public has no `teams` panel).

- [ ] **Step 6: `node --check public/app.js`** → exit 0. Vitest → 19 green.

- [ ] **Step 7: Grep proof — no interleaved ternaries in shared panels.** Run `grep -n "state.isAdmin ?" public/app.js` and confirm the only remaining occurrences are inside `render()`'s top-level switch and inside per-surface builders — NOT inside a single shared panel string. Record before/after counts in the history file.

- [ ] **Step 8: Browser parity verify (localhost) 1920 + 390.** Public surface: identical to pre-refactor (login card, check-in, register, tournament-if-active, nav). Admin surface (log in with the owner code): identical (session form, players, teams, tournament, 4-nav). Switch back and forth (login/logout) — correct shell each time, correct per-surface tab restored. §27 check. Screenshot both surfaces both widths.

- [ ] **Step 9: Bump versions + commit + push + prod-verify** (same pattern as Task 1, message `feat(redesign): C26 item 2 — split render() into renderPublicShell()/renderAdminShell() (behavior-preserving)`). Prod: login/logout swaps shells, 212 players, 0 errors.

**Verification gate (Task 2):** signed-out shows only the public shell; sign-in swaps to the admin shell; grep shows zero interleaved `isAdmin ?` inside shared panels (before/after counts in history); every existing nav item still clicks to the right panel; per-surface tab persistence works across login/logout; `partialRender()` still updates the players list + sync notice without scroll-jump; 19 vitest green; 212 players; 0 console errors; prod re-verified both widths.

---

## Task 3 — Per-surface nav + IA (new screens)

Introduce the direction-A information architecture: the 4-item nav per surface and the NEW screens (public Home + Scores; admin Dashboard + Co-pilot placeholder). Ships in two reviewable increments: **3a public**, then **3b admin**. Each increment is its own §38/§41/version/commit cycle.

**Files:** `public/app.js` (new screen builders + per-surface nav markup + Dashboard quick-action wiring + defaults), `public/sw.js` (version). New CSS classes used here are styled in Task 4 — in Task 3 the screens are structurally present and functional but get their final polish in Task 4; keep them readable in the interim by reusing existing `.card` etc.

### Increment 3a — Public IA (Home + Scores)

**Interfaces:**
- Produces: `publicHomeHTML() -> string`, `publicScoresHTML() -> string`, panels `tab-home` + `tab-scores`, public bottom-nav with 4 `data-nav-tab` buttons (`home`/`players`/`scores`/`tournament`), public default tab `'home'`.
- Consumes: `state.currentSession` (Home Next-Session card), the Live-Nets derivation already in `render()` (`deriveLiveTeamMatchupsFromOrder`, `state.generatedTeams`, `state.liveMatchResults`) for Scores read-only, `buildTournamentTabHTML()` (Bracket, read-only for public).

- [ ] **Step 1: §38 — three localhost layouts for the public Home screen.** The Home screen is new; build 3 directional variants on localhost (e.g. A = mockup-exact [brand+live, Next-session card, Check-In CTA, "Live now · N courts" + court rows]; B = same but stats-forward [checked-in count chip up top]; C = same but CTA-first). Screenshot 390 + 1920; AskUserQuestion. **Gate before shipping.**

- [ ] **Step 2: Build `publicHomeHTML()`** porting `.brand/.live/.ld`, `.card/.lab/.srow` (Next-session, calendar/clock/pin SVG — see icon set), `.cta` "Check In" (wires to `activateMainTab('players')`/check-in), `.sec` "Live now · N courts", `.court` rows (read-only from Live-Nets state; **no scores submit, no skill**). Mockup source: `direction-A-screens.html:86-97`.

- [ ] **Step 3: Build `publicScoresHTML()`** porting `.brand` "Live scores" + `.live` "N playing", `.court` rows (live, "Net N · A vs B" + score), `.sec` "Up next" + queued `.court` rows. Read-only view of Live-Nets. Mockup source: `direction-A-screens.html:142-150`.

- [ ] **Step 4: Public bottom-nav → 4 items** (Home/Check In/Scores/Bracket) with the icon set (home/check/bars/bracket). `data-nav-tab` = `home`/`players`/`scores`/`tournament`. Bracket tab visible to public only when a tournament is active (keep the existing `tournaments.some(status pools|bracket|completed)` gate) else show Home/Check In/Scores (3) — confirm with Mike if the empty Bracket slot should hide or show an empty state.

- [ ] **Step 5: Wire panels + default.** Add `tab-home` + `tab-scores` panels to `renderPublicShell()`. Public default tab → `'home'` (D2). `activateMainTab` already toggles by id — no nav-button highlight needed for non-nav panels.

- [ ] **Step 6: `node --check` + vitest green + grep `📅|🕙|📍` over `public/` (these are still in the admin session card — Task 4; the new public Home uses SVG from the icon set, confirm 0 emoji in `publicHomeHTML`).**

- [ ] **Step 7: Browser verify** (localhost, public surface) 1920 + 390: Home renders (next-session true vs DB, live courts read-only, no skill), Scores renders, all 4 nav items click to the right panel fast, §27 9-question on Home + Scores + every nav. Screenshot.

- [ ] **Step 8: Bump versions + commit + push + prod-verify.** Message `feat(redesign): C26 item 3a — public IA (Home + Scores + 4-item nav)`.

### Increment 3b — Admin IA (Dashboard + Co-pilot placeholder)

**Interfaces:**
- Produces: `adminDashboardHTML() -> string`, `adminCopilotHTML() -> string` (static), panels `tab-dashboard` + `tab-copilot`, admin bottom-nav 4 (`dashboard`/`players`/`teams`/`copilot`), admin default tab `'dashboard'`, Dashboard quick-action click-wiring (`data-qa="checkin|generate|tournament|session"` → `activateMainTab`).
- Consumes: checked-in count + per-group breakdown (already computed for `buildCheckinStatsHTML`), `activateMainTab` for the quick-action launchers.

- [ ] **Step 1: §38 — three localhost layouts for the admin Dashboard.** Build 3 variants (A = mockup-exact [statcard + 2×2 quick-action grid + co-pilot teaser]; B = quick-actions as a single column list; C = statcard + horizontal quick-action chips). Screenshot; AskUserQuestion. **Gate.**

- [ ] **Step 2: Build `adminDashboardHTML()`** porting `.top` (`.brand` + `.abadge` ADMIN + `.gear`), `.statcard` (`.statbig` big Sora checked-in count + `.grpline` per-group), `.sec` "Quick actions", `.qgrid` of `.qa` tiles (Check-in mode, Generate teams, Tournament, Session — each `.ic` SVG + `.t` + `.s`), `.copilot` teaser. Quick-action tiles get `data-qa` attributes. Mockup source: `direction-A-admin.html:106-125`.

- [ ] **Step 3: Build `adminCopilotHTML()`** — **static placeholder, no AI logic** (that is C28). Port `.chat`/`.bub(.u,.a)`/`.acts`/`.inbar(.send)` rendered static (the mockup's example bubbles or a single "Co-pilot is coming" empty state — confirm copy with Mike in the §38 step). Mockup source: `direction-A-admin.html:144-162`.

- [ ] **Step 4: Admin bottom-nav → 4 items** (Home/Players/Courts/Co-pilot) with icons (home/players/courts/sparkle). `data-nav-tab` = `dashboard`/`players`/`teams`/`copilot`. **Tournament is NOT a nav tab** (Dashboard quick-action only). Rename the `teams` nav label to "Courts".

- [ ] **Step 5: Wire quick-actions + panels + default.** Add `tab-dashboard` + `tab-copilot` panels to `renderAdminShell()`. Admin default tab → `'dashboard'`. In `attachHandlers()`, delegate `data-qa` clicks: `checkin`→ open kiosk/check-in mode, `generate`→`activateMainTab('teams')`, `tournament`→`activateMainTab('tournament')`, `session`→`activateMainTab('session')`. Confirm the `session`/`tournament` panels still exist in `renderAdminShell()` even though they're not in the nav (reachable via quick-action).

- [ ] **Step 6: `node --check` + vitest green.**

- [ ] **Step 7: Browser verify** (localhost, admin surface) 1920 + 390: Dashboard renders (checked-in count cross-checked vs DB, per-group line, 4 quick-actions each navigating correctly, co-pilot teaser), Co-pilot placeholder renders static (no console error, no "not defined" — the §AS incident pattern), all 4 nav items click correctly, Tournament reachable via quick-action, §27 9-question on Dashboard + Co-pilot + each quick-action target. **Skill visible on Players (admin) but assert NOT on any public surface.** Screenshot.

- [ ] **Step 8: Bump versions + commit + push + prod-verify.** Message `feat(redesign): C26 item 3b — admin IA (Dashboard + Co-pilot placeholder + 4-item nav, Tournament→quick-action)`.

**Verification gate (Task 3):** both surfaces show their 4-item nav; every nav item AND every Dashboard quick-action clicks to the right panel fast; public Home/Scores are read-only and show NO skill; admin Dashboard count matches Supabase checked-in; Co-pilot renders a static shell with no error; Tournament reachable from the Dashboard quick-action (not the nav); `grep "📅\|🕙\|📍"` over the NEW builders = 0; 19 vitest green; prod re-verified both surfaces both widths.

---

## Task 4 — Mobile-first restyle + emoji→SVG

Reskin every screen to the direction-A component classes at 390px (then verify 1920), replace the remaining emoji with SVG, add `viewport-fit=cover` + notch-safe bottom nav. Largest item — ships **screen-by-screen** increments, each with the §27 9-question check, so a regression is caught per-screen not in a big-bang.

**Files:** `public/styles.css` (port the mockup component CSS: `.card .lab .srow .cta .sec .court .nav .brand .live .ld .ci-h .ci-sub .search .person .av .inpill .newbtn .toast .top .abadge .gear .statcard .statbig .grpline .qgrid .qa .copilot .chat .bub .acts .inbar .send .rsearch .chips .chip .prow .skill .grp .tg` — adapt to the existing class names where they differ), `public/app.js` (emoji→SVG at session-card rows `5213/5217/5221/5229/5233/5237`; apply component classes to existing markup), `public/index.html` (`viewport-fit=cover`), `public/checkin.html` (banner emoji→SVG `162-164`), `public/sw.js` (version).

- [ ] **Step 1: `viewport-fit=cover`.** Change `index.html:5-8` viewport meta to `content="width=device-width, initial-scale=1.0, viewport-fit=cover"`. Add `env(safe-area-inset-bottom)` padding to `#bottom-nav` so it clears the home indicator. **⚠ This exact change broke prod 2026-05-31 (`mike-preferences §6` / debugging) — ship it as the SMALLEST isolated change, verify on Mike's real iPhone before layering more.** Consider doing this step LAST or as its own micro-commit so it can be reverted cleanly.

- [ ] **Step 2: Emoji → SVG (app.js session card).** Replace the calendar/clock/pin emoji at `app.js:5213/5217/5221` (admin "What players will see") and `5229/5233/5237` (non-admin "Next Session") with the calendar/clock/pin SVGs from the icon set (the empty-state already uses an SVG calendar at `5244` — match that style). Then `grep -n "📅\|🕙\|📍" public/app.js` → 0.

- [ ] **Step 3: Emoji → SVG (checkin.html banner).** Replace the `📅`/`🕙`/`📍` `<span>`s at `checkin.html:162-164` with the calendar/clock/pin SVGs. Reconcile the banner's dark inline hex (`#262d38`) to the light tokens. `grep -n "📅\|🕙\|📍" public/checkin.html` → 0.

- [ ] **Step 4: Port component CSS, screen-by-screen.** For each screen in this order — public Home → Check In → Scores → Bracket, then admin Dashboard → Players → Courts → Co-pilot — copy the matching mockup CSS rules into `styles.css` (scoped to the screen's classes), apply the classes to the existing markup, and remove the now-redundant old per-screen CSS. After EACH screen: `node --check`, browser screenshot 390 + 1920, §27 9-question check on that screen + every modal/overlay it triggers, fix before moving on. Commit per screen (or per 2–3 screens) — batch the pushes.

- [ ] **Step 5: §38 — where a screen's restyle has real layout choices** (e.g. Check-in person-row density, Courts board layout), present 3 localhost options for that screen before shipping it. Mechanical 1:1 mockup ports don't need 3 options (state that); genuine layout forks do.

- [ ] **Step 6: Full grep sweep.** `grep -rn "📅\|🕙\|📍\|🗓\|⏰\|🕐" public/` → 0 (every emoji gone). Confirm no neon: visually scan for any glow/box-shadow-glow or saturated electric colors → 0.

- [ ] **Step 7: `node --check` + vitest 19 green.**

- [ ] **Step 8: Full reliability pass before final commit** (this is the redesign's last shell task — run the §27 9-question check on EVERY screen + modal on BOTH surfaces at 390 + 1920, cross-check the checked-in count + a player's In/Out + a live score against Supabase, console + network clean). Save screenshots to `.playwright-mcp/`.

- [ ] **Step 9: Bump versions + commit + push + prod-verify** (message `feat(redesign): C26 item 4 — mobile-first restyle + emoji→SVG + viewport-fit`). Prod 390 + 1920, all screens, 0 console errors, 212 players, version pill correct. **iPhone confirm from Mike on the notch/viewport-fit (rule #6).**

**Verification gate (Task 4):** every screen restyled to direction-A on 390 (verified 1920 too); `grep -rn` emoji over `public/` = 0; zero neon/glow; `viewport-fit=cover` shipped + bottom nav clears the notch (Mike's iPhone confirm); §27 9-question passes on every screen + modal on both surfaces; rendered values cross-checked vs Supabase; 19 vitest green; prod re-verified; PRODUCT-SURFACE.md updated.

---

## Self-review (run against the spec)

**1. Spec coverage:**
- Direction-A tokens (oklch + Inter/Sora + radii/shadow) → Task 1. ✓
- Surface-routing architecture (`render()` → `renderPublicShell()`/`renderAdminShell()`, re-homed fragments, per-surface persistence, no interleaved ternaries) → Task 2. ✓
- IA + nav per surface (public 4: Home/Check In/Scores/Bracket; admin 4: Dashboard/Players/Courts/Co-pilot; Tournament/Session/Check-in/Generate as Dashboard quick-actions) → Task 3 (3a public, 3b admin). ✓
- Per-screen layout (public Home/Check In/Scores/Bracket; admin Dashboard/Players/Courts/Co-pilot/Login) → Tasks 3 (new screens) + 4 (restyle of existing). ✓
- Component inventory + SVG icon set → canonical block here, applied in Tasks 3–4. ✓
- emoji→SVG (`app.js` session rows + checkin.html banner) → Task 4. ✓
- `viewport-fit=cover` + notch → Task 4 (flagged as the prod-breaking change, isolated). ✓
- Verification gate (tokens live, fonts 200, ≥4.5:1, signed-out=public only, no interleaved ternaries grep, nav clicks, emoji grep 0, 1920+390 screenshots + §27, prod re-verify, 212 players cross-check) → distributed across all four task gates. ✓
- Login reskin (`adminLoginHTML` C25 `<form>`) → Task 4 (admin screen restyle); structurally preserved in Task 2. ✓

**2. Placeholder scan:** Token block, SVG set, mockup source line refs, and version-bump/commit steps are concrete. The detailed restyle markup for Task 4 deliberately references the mockups + existing fragments by exact file:line as the source to port — that is a real artifact, not a "TBD". No "add error handling"/"similar to Task N" placeholders.

**3. Type/name consistency:** `renderPublicShell`/`renderAdminShell`, `adminPlayersHTML`/`adminTeamsHTML`/`adminLoginHTML`/`publicCheckinHTML`, `publicHomeHTML`/`publicScoresHTML`/`adminDashboardHTML`/`adminCopilotHTML`, `currentTabKey()`, `data-nav-tab`/`data-qa`, keys `as_main_tab_public`/`as_main_tab_admin` — used consistently across tasks. Canonical token names match the mockups exactly.

## Open question for Mike before/at build
- **Public Bracket nav slot when no tournament is active** (Task 3a Step 4): hide the 4th nav item (show 3) or keep it with an empty "no bracket yet" state? Default in plan = keep the existing active-tournament gate (hide when none). Confirm at the 3a §38 step.

## Notes
- C26 is multi-session: 4 member items = 4+ shipped increments (Task 3 ships as 3a+3b). Each is a task boundary (End-flight + notify). The umbrella vision: `docs/superpowers/specs/2026-06-18-app-redesign-vision-design.md`. Source spec: `docs/superpowers/specs/2026-06-18-C26-design-system-two-surface-shell.md`.
- §30 history file per shipped increment; Tasks From Claude C26 status kept current; `current.md`/`log.md` appended each increment.
