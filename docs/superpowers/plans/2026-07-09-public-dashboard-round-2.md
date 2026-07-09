# Public Dashboard Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the locked Round 2 design — bottom nav becomes Home · Check In · Tournament (Live tab removed, live board on Home, Home tiles gone, Tournament = tile hub) plus the one-tap Check In hero on both check-in surfaces.

**Architecture:** Vanilla-JS SPA — all UI is template-literal builders in `public/app.js` rendered into `#app-shell`; styles in `public/styles.css` (oklch token system at the top); pure testable logic in `public/pure.js` with vitest tests in `test/pure.test.js`. The standalone QR page `public/checkin.html` is self-contained (own inline CSS + supabase client). Spec: `docs/superpowers/specs/2026-07-08-public-dashboard-remake-design.md` **§12** (the locked picks — read it before building).

**Tech Stack:** Vanilla JS, Supabase (supabase-js v2), vitest, Vercel (auto-deploy on push to main).

## Global Constraints

- Bump `APP_VERSION` in `public/app.js` (top of file, ~line 27, format `'YYYY.MM.DD.N'`) in EVERY commit that touches code. Prod is at `2026.07.09.2` — slices take `.3`, `.4`, `.5`, `.6`.
- Run `node --check public/app.js` after every app.js edit; `npx vitest run` must be fully green before every commit (baseline 195 tests).
- `partialRender()` for anything triggered by a background sync; full `render()` only for explicit user actions (mobile scroll-jump rule).
- No emoji anywhere; no neon — colors ONLY via the existing CSS custom properties in `public/styles.css` (`--accent`, `--live`, `--live-soft`, `--live-ink`, `--accent-soft`, `--accent-bd`, `--muted`, etc.). Inline SVG icons only.
- Copy: plain English; NEVER "night"/"tonight"; name the tournament by its name. No skill ratings on any public surface.
- Desktop AND mobile (390px) ship in the same change (§41).
- **§38 marker (per slice, before the first UI-file edit):** the picks are locked (spec §12) but the marker is HEAD-scoped and expires on every commit. Run:
  `node "C:/Users/OlasM/.claude/hooks/ui38-mark.mjs" --decision=3-options-shown --reason="Round 2 locked picks (spec §12, Mike 2026-07-09): <slice name>" public/app.js public/styles.css public/checkin.html`
- Line anchors below were verified 2026-07-09 at HEAD `9300fcc` — **re-grep every anchor before editing** (the file shifts as slices land).
- Each task = one commit (builder commits; the controller pushes after review).

---

### Task 1: Tournament hub (additive — Slice A)

**Files:**
- Modify: `public/app.js` (`buildTournamentTabHTML` ~5031, `renderPublicShell` ~8097, `pdPageHeaderHTML` ~7880, the public content click handling)
- Modify: `public/styles.css` (new `.tn-*` classes)

**Interfaces:**
- Produces: `pdTournamentView` (module var, `'hub' | 'board'`), `buildTournamentHubHTML()`, `buildPublicTournamentRootHTML()` — Task 2 relies on these names exactly.
- Consumes (existing): `state.tournaments`, `state.activeTournamentId`, `state.tournamentTeams`, `state.tournamentMatches`, `myTeamInfo()` (~3907), `computeTeamRecord`, `computeStandings`, `escapeHTML`, `pdPageHeaderHTML(title)` (~7880), `buildTournamentTabHTML()` (~5031, untouched inside).

- [ ] **Step 0: §38 marker** (Global Constraints command, slice name "Tournament hub").

- [ ] **Step 1: Find how public content clicks route.** The Home tiles (`publicHomeHTML` ~2567) are `<button data-nav-tab="...">` and they work, so a delegated handler beyond `#bottom-nav` exists. Run:
`grep -n "data-nav-tab" public/app.js | grep -iv "button class=\"nav-btn\""` and `grep -n "closest('\[data-nav-tab\]')" public/app.js`
Expected: the `#bottom-nav` listener (~9634) plus at least one content-level delegated listener (likely on `#app-content` or `document`). Note its location — the hub tiles reuse `data-nav-tab` for Standings/My Team/History and need TWO new custom actions handled in that same delegated place: `data-tn-view="board"` (Pools & schedule / Bracket tiles / Register CTA) and `data-tn-view="hub"` (the board's back button).

- [ ] **Step 2: Add the module var + hub builder** directly above `buildTournamentTabHTML()` (~5031):

```js
// Round 2 (2026-07-09, spec §12.4 — Mike's locked §38 pick A "tile hub"): the public Tournament tab
// is a hub (header card + tiles). The pre-existing public register/pool/bracket surface becomes the
// 'board' sub-view behind the Pools & schedule / Bracket tiles. Admin branch untouched.
let pdTournamentView = 'hub'; // 'hub' | 'board' — module var survives partialRender

function buildTournamentHubHTML() {
  const list = state.tournaments || [];
  const active = state.activeTournamentId ? list.find((x) => x.id === state.activeTournamentId) : null;
  const show = active || list[0] || null;
  const teams = (active ? state.tournamentTeams : []) || [];
  const matches = (active ? state.tournamentMatches : []) || [];
  const isLive = !!(show && (show.status === 'pools' || show.status === 'bracket'));
  const liveNets = new Set(matches.filter((m) => m.status === 'live' && m.net).map((m) => m.net)).size;
  const regOpen = !!(show && show.registration_open && show.status === 'setup');
  const bits = show ? [
    teams.length ? teams.length + ' teams' : '',
    show.status === 'setup' ? (regOpen ? 'Registration open' : 'Registration closed')
      : show.status === 'pools' ? 'Pools underway'
      : show.status === 'bracket' ? 'Bracket underway' : 'Completed',
  ].filter(Boolean).join(' · ') : '';
  const header = show
    ? `<div class="pd-card pd-thero"><div class="tn-head"><div>
         <span class="pd-eyebrow">Tournament</span>
         <div class="pd-h">${escapeHTML(show.name || 'Tournament')}</div>
         <div class="pd-sub">${escapeHTML(bits)}</div>
       </div>${isLive ? '<span class="tn-live"><span class="tn-dot"></span>Live</span>' : ''}</div>
       ${regOpen ? `<button type="button" class="pd-claimbtn" data-tn-view="board">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 14l2 2 4-4"/></svg>
         Register your team
       </button>` : ''}</div>`
    : `<div class="pd-card pd-thero"><span class="pd-eyebrow">Tournament</span>
       <div class="pd-h">No tournament scheduled</div>
       <div class="pd-sub">${state.loaded ? 'Check back soon.' : 'Loading…'}</div></div>`;
  const standings = show ? computeStandings(teams, matches) : [];
  const anyFinal = matches.some((m) => m.phase === 'pool' && m.status === 'final');
  const mine = myTeamInfo();
  const myRec = mine ? computeTeamRecord(mine.teamId, matches, teams) : null;
  const tile = (attrs, svg, title, sub) => `<button type="button" class="pd-tile" ${attrs}>
      <span class="pd-ti"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svg}</svg></span>
      <span class="pd-tt">${escapeHTML(title)}</span><span class="pd-ts">${escapeHTML(sub)}</span></button>`;
  const tiles = [
    show ? tile('data-tn-view="board"', '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', 'Pools & schedule',
      show.status === 'setup' ? 'Before pool play' : liveNets ? (liveNets + (liveNets === 1 ? ' net live' : ' nets live')) : 'Every game by net') : '',
    show ? tile('data-nav-tab="standings"', '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M21 20H3"/>', 'Standings',
      (anyFinal && standings[0]) ? ('Leader: ' + (standings[0].name || '—')) : 'By pool') : '',
    show ? tile('data-tn-view="board"', '<circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="12" r="2"/><path d="M8 6h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8"/><path d="M13 12h3"/>', 'Bracket',
      show.status === 'bracket' ? 'In progress' : show.status === 'completed' ? 'Final' : 'After pools') : '',
    mine ? tile('data-nav-tab="myteam"', '<circle cx="12" cy="8" r="4"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/>', 'My Team',
      (myRec ? myRec.wins + '–' + myRec.losses + ' · ' : '') + 'Your games') : '',
    tile('data-nav-tab="history"', '<path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v4a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4a3 3 0 0 0 3 3"/><path d="M17 6h3a3 3 0 0 1-3 3"/>', 'Past tournaments', 'Champions & records'),
  ].filter(Boolean).join('');
  return `${header}<div class="pd-tiles">${tiles}</div>`;
}

// The public Tournament tab root: hub, or the pre-existing board surface with a back-to-hub header.
// Admin keeps buildTournamentTabHTML() directly (its own branch inside that function).
function buildPublicTournamentRootHTML() {
  if (state.isAdmin) return buildTournamentTabHTML();
  if (pdTournamentView !== 'board') return buildTournamentHubHTML();
  return `<div class="pd-pagehdr">
      <button type="button" class="pd-back" data-tn-view="hub" aria-label="Back to Tournament"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg></button>
      <div class="pd-htitle">Tournament</div>
    </div>` + buildTournamentTabHTML();
}
```

- [ ] **Step 3: Route every PUBLIC render of the tournament tab through the root.** `grep -n "buildTournamentTabHTML()" public/app.js` — expected call sites: `renderPublicShell` (~8099), `partialRenderTournament`'s tab rebuild, and admin shell/paths. Replace ONLY the public-shell + public partial-render call sites with `buildPublicTournamentRootHTML()` (it self-guards on `state.isAdmin`, so routing all shared public/tournament-tab call sites through it is safe; admin-only call sites stay).

- [ ] **Step 4: Wire `data-tn-view` clicks** in the delegated content handler found in Step 1:

```js
const tnBtn = e.target.closest('[data-tn-view]');
if (tnBtn && !state.isAdmin) {
  pdTournamentView = tnBtn.getAttribute('data-tn-view') === 'board' ? 'board' : 'hub';
  const c = document.querySelector('#tab-tournament .container');
  if (c) c.innerHTML = buildPublicTournamentRootHTML();
  if (pdTournamentView === 'board') layoutBracketTree(); // the board may show the bracket tree
  const panel = document.getElementById('tab-tournament');
  if (panel) panel.scrollTop = 0; // a sub-page open/back is an explicit user action — top is correct
  return;
}
```

- [ ] **Step 5: Re-point the shared page-header back button.** In `pdPageHeaderHTML` (~7880) change `data-nav-tab="home"` → `data-nav-tab="tournament"` and `aria-label="Back to Home"` → `aria-label="Back to Tournament"` (Standings/My Team/History are Tournament content now; the Home tiles still exist until Task 2, so both entries work during the interim).

- [ ] **Step 6: Add the hub CSS** to `public/styles.css` next to the `.pd-tiles` block (~3036):

```css
/* Round 2 — Tournament hub (spec §12.4) */
.tn-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.tn-live { display: inline-flex; align-items: center; gap: 6px; background: var(--live-soft);
  border: 1px solid oklch(0.85 0.05 150); color: var(--live-ink); border-radius: 999px;
  padding: 4px 10px; font-size: 12px; font-weight: 700; flex: none; }
.tn-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--live); }
```

- [ ] **Step 7: Verify.** `node --check public/app.js` → clean. `npx vitest run` → 195 passed. Serve locally (`npx serve public` or the project's usual local run), browser at 390×844 AND ≥1280 wide: Tournament tab (reach via a Home tile) shows hub header + tiles; Pools & schedule → board with back button; back → hub; Standings tile → Standings page whose back chevron returns to the HUB; no console errors; hub also correct with NO tournament (temporarily point `state.tournaments` empty via devtools to see the empty state).

- [ ] **Step 8: Bump `APP_VERSION` to `'2026.07.09.3'` and commit.**

```bash
git add public/app.js public/styles.css
git commit -m "feat: public Tournament tab is a tile hub (Round 2 slice A, spec 12.4) - v2026.07.09.3"
```

---

### Task 2: IA cutover — nav swap, Live tab removal, Home tiles gone (Slice B)

**Files:**
- Modify: `public/app.js` (`buildPublicNavInnerHTML` ~7834, `renderPublicShell` ~8069, `publicHomeHTML` ~2559, `publicScoresHTML` ~2667 [delete], `partialRender` scores short-circuit ~1375-1395 [delete], `activateMainTab` NAV_ANCHOR ~9581, saved-tab restore)

**Interfaces:**
- Consumes: `buildPublicTournamentRootHTML()` and `pdTournamentView` from Task 1 (exact names).
- Produces: the final 3-item public nav (`home`, `players`, `tournament`); `#tab-scores` no longer exists — later tasks must not reference it.

- [ ] **Step 0: §38 marker** (slice name "IA cutover").

- [ ] **Step 1: Swap the nav button.** In `buildPublicNavInnerHTML()` (~7834) replace the whole `scores` button with:

```js
    <button class="nav-btn" data-nav-tab="tournament">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v4a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4a3 3 0 0 0 3 3"/><path d="M17 6h3a3 3 0 0 1-3 3"/></svg>
      <span>Tournament</span>
    </button>
```

- [ ] **Step 2: Home tournament branch — tiles out, legend parity in.** In `publicHomeHTML()` (~2590-2607): delete the `<div class="pd-tiles">…</div>` block and the now-unused `tile`/`tileSVG` helpers at the top of the function (~2561-2571) — first `grep -n "pd-tile" public/app.js` to confirm the only remaining `.pd-tile` producers are the Task-1 hub and Home (then delete only Home's). Wrap the board card with the shared legend so the Live tab's legend survives the move:

```js
      ${boardHTML ? `<div class="pd-card">${boardHTML}${PUBLIC_COURT_LEGEND}</div>` : ''}
```

- [ ] **Step 3: Remove the Live tab end-to-end (public).** Order matters; re-grep each anchor first:
  1. `renderPublicShell` (~8092-8096): delete the `#tab-scores` panel div.
  2. `partialRender` (~1375-1395): delete the entire `if (!playersEl && activeMainTab === 'scores') { … }` short-circuit block (comment included).
  3. Delete `function publicScoresHTML() { … }` (~2667-2706) whole.
  4. `grep -n "scores" public/app.js` — the ONLY remaining hits must be admin/tournament-mode code that never referenced the public tab (e.g. score modals, `set_live_score`); zero hits for `tab-scores`, `publicScoresHTML`, `data-nav-tab="scores"`, `activeMainTab === 'scores'`. Keep `getPublicLiveData`, `buildPublicLiveCourtsHTML`, `buildPublicTournamentLiveHTML`, `PUBLIC_COURT_LEGEND` — Home uses them.

- [ ] **Step 4: Saved-tab migration.** Find the restore: `grep -n "activeMainTab" public/app.js | head -30` → locate where it initializes from storage. Add, where the public shell decides the boot tab: if the restored value is `'scores'` (or any tab whose panel no longer exists in the public shell) → fall back to `'home'`. A returning spectator whose last tab was Live must land on Home, not a blank panel.

- [ ] **Step 5: NAV_ANCHOR re-point.** In `activateMainTab` (~9581-9583) replace the public anchor map with:

```js
    : { standings: 'tournament', history: 'tournament', myteam: 'tournament' };
```

(`tournament` leaves the map — it has its own nav button now and `hasOwnButton` handles it.)

- [ ] **Step 6: Verify.** `node --check` clean; `npx vitest run` 195 passed. Browser 390 + desktop: nav reads Home · Check In · Tournament with the trophy icon; Home (tournament live-ish state or casual) has NO tiles and the board card carries the legend; Tournament nav button opens the hub; Standings/My Team/History highlight the Tournament nav item; devtools `localStorage` seeded with the old `'scores'` tab value boots to Home; 0 console errors. Also confirm a background sync doesn't error (watch one 15s poll tick in console).

- [ ] **Step 7: Bump `APP_VERSION` to `'2026.07.09.4'` and commit.**

```bash
git add public/app.js
git commit -m "feat: nav = Home / Check In / Tournament; Live tab folds into Home; tiles removed (Round 2 slice B, spec 12.1-12.2) - v2026.07.09.4"
```

---

### Task 3: Check In one-tap hero, in-app (Slice C)

**Files:**
- Modify: `public/pure.js` (new `checkinHeroModel`), `test/pure.test.js` (its tests)
- Modify: `public/app.js` (`publicCheckinHTML` ~7806, `buildCheckinStatsHTML` ~1298, the auth sign-in transition block, the kiosk handler block ~9967-10060, sign-out cleanup ~7793-7803)
- Modify: `public/styles.css` (new `.ckh-*` classes)

**Interfaces:**
- Produces: `checkinHeroModel(rows)` in pure.js (Task 4 reuses the same shape client-side); `state.myClaimedPlayer` (`{id, name} | null`); `loadMyClaimedPlayer()`.
- Consumes: `performKioskToggle(player, isIn)` (closure inside the kiosk handler block ~9998 — the hero tap reuses it), `playerIdentityKey`, `state.checkedIn`, `buildCheckinStatsHTML`.

- [ ] **Step 0: §38 marker** (slice name "Check In one-tap hero in-app").

- [ ] **Step 1: Write the failing tests.** Match `test/pure.test.js`'s existing import style (grep how it imports from `public/pure.js`), then add:

```js
describe('checkinHeroModel', () => {
  it('returns the single claimed player', () => {
    expect(checkinHeroModel([{ id: 'a1', name: 'Michael Olas' }])).toEqual({ id: 'a1', name: 'Michael Olas' });
  });
  it('is null when nothing is claimed', () => {
    expect(checkinHeroModel([])).toBeNull();
    expect(checkinHeroModel(null)).toBeNull();
  });
  it('is null when ambiguous (2+ claimed rows)', () => {
    expect(checkinHeroModel([{ id: 'a', name: 'x' }, { id: 'b', name: 'y' }])).toBeNull();
  });
  it('is null on malformed rows', () => {
    expect(checkinHeroModel([{ id: null, name: '' }])).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure.** `npx vitest run` → the 4 new tests FAIL (`checkinHeroModel is not defined`); the 195 baseline still passes.

- [ ] **Step 3: Implement in `public/pure.js`** (follow the file's existing export pattern exactly — it is both a browser script and a vitest import):

```js
// Round 2 (spec §12.3): the check-in one-tap hero shows ONLY for an unambiguous claimed player.
// 0 rows (unclaimed) or 2+ rows (ambiguous claim data) -> null -> the kiosk stays search-first.
function checkinHeroModel(rows) {
  if (!Array.isArray(rows) || rows.length !== 1) return null;
  const p = rows[0] || {};
  if (!p.id || !p.name) return null;
  return { id: p.id, name: String(p.name) };
}
```

- [ ] **Step 4: Run tests.** `npx vitest run` → 199 passed.

- [ ] **Step 5: The resolve fetch (storm-safe).** Anon lacks SELECT on `players.claimed_by_profile` (see app.js ~3867 comment) — this read runs ONLY signed-in. Add near `myTeamInfo()` (~3907):

```js
// Round 2 (spec §12.3): resolve MY claimed player (for the check-in one-tap hero). Authed-only —
// anon SELECT on claimed_by_profile errors by design. Called from the GENUINE sign-in transition
// only (v2026.07.09.2 storm rule: never per auth event) + initial restore; cleared on sign-out.
async function loadMyClaimedPlayer() {
  if (!supabaseClient || !state.account) { state.myClaimedPlayer = null; return; }
  try {
    const { data, error } = await supabaseClient
      .from('players').select('id,name').eq('claimed_by_profile', state.account.id).limit(2);
    if (error) throw error;
    state.myClaimedPlayer = checkinHeroModel(data || []);
  } catch (err) {
    console.error('loadMyClaimedPlayer', err);
    state.myClaimedPlayer = null; // fail safe -> search-first kiosk
  }
  if (!state.isAdmin && activeMainTab === 'players') partialRender();
}
```

Call it from the SAME gated block that runs the other heavy sign-in work (grep the v09.2 storm-fix comment — `grep -n "genuine" public/app.js` / `grep -n "2026.07.09" public/app.js` — and add `void loadMyClaimedPlayer();` beside the existing deriveRole/refresh calls, for BOTH the genuine sign-in transition and the initial-session restore path). In the sign-out cleanup (`openAccountMenu` optimistic path ~7798 AND the `SIGNED_OUT` handler) add `state.myClaimedPlayer = null;`.

- [ ] **Step 6: The hero markup.** In `publicCheckinHTML()` (~7806): when `state.myClaimedPlayer` is set, render the hero variant; otherwise the existing kiosk unchanged. Replace the function body's return with:

```js
function publicCheckinHTML() {
  const me = state.myClaimedPlayer;
  const searchBlock = `
    <div class="cik-search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
      <input id="checkin-search" type="text" placeholder="Start typing your name&hellip;" autocapitalize="words" autocomplete="off" spellcheck="false" aria-label="Type your name" />
    </div>
    <div id="checkin-results"></div>
    <button class="cik-new" id="btn-checkin-new" type="button">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
      I'm new &mdash; add me
    </button>`;
  const heroBlock = me ? `
    <div class="ckh-card" id="ckh-card">${checkinHeroInnerHTML()}</div>
    <div class="ckh-alts"><span class="ckh-alt-label">Checking in someone else? Use the search below.</span></div>` : `
    <div class="cik-mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 12.5l2.5 2.5L15.5 9"/><circle cx="12" cy="12" r="9"/></svg></div>`;
  return `
  <div class="ci-kiosk is-idle${me ? ' has-hero' : ''}">
    ${heroBlock}
    <h2 class="cik-h">Check in</h2>
    <p class="cik-sub">Type your name, then tap it</p>
    ${searchBlock}
    <div id="checkin-toast" class="cik-toast" role="status" aria-live="polite" hidden></div>
    <div id="checkin-admin-panel" class="cik-adminpanel" hidden>${adminLoginHTML()}</div>
    <button class="cik-admin" id="btn-open-admin" type="button">Admin</button>
  </div>
  `;
}

// The hero card body — split out so the tap handler can refresh JUST the card in place.
function checkinHeroInnerHTML() {
  const me = state.myClaimedPlayer;
  if (!me) return '';
  const row = (state.players || []).find((p) => String(p.id) === String(me.id));
  const isIn = row ? (state.checkedIn || []).includes(playerIdentityKey(row)) : false;
  const initials = me.name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return `
      <span class="ckh-av">${escapeHTML(initials)}</span>
      <span class="ckh-eyebrow">Signed in</span>
      <div class="ckh-name">${escapeHTML(me.name)}</div>
      <button type="button" class="ckh-btn${isIn ? ' is-in' : ''}" id="ckh-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12.5l2.5 2.5L15.5 9"/><circle cx="12" cy="12" r="9"/></svg>
        ${isIn ? "You're checked in" : 'Check in'}
      </button>`;
}
```

When the hero shows, the big `.cik-mark` icon is dropped and the heading/search sit below the card — the mockup's "search demoted" reading; the `.has-hero` class top-aligns the container (Step 8 CSS). Keep the `#js-checkin-stats` div where it is in `renderPublicShell` (~8088) but make its PUBLIC output the quiet line — in `buildCheckinStatsHTML()` (~1298) add as the first line:

```js
  if (!state.isAdmin) return `<div class="ckh-count">${state.checkedIn.length} checked in</div>`;
```

- [ ] **Step 7: The one-tap handler.** Inside the kiosk handler block (after the `checkinResults.addEventListener` at ~10035), same closure so `performKioskToggle` is in scope:

```js
    // Round 2: the one-tap hero. Tapping YOUR OWN signed-in card checks you in directly (no confirm —
    // the confirm popup exists for mis-taps on OTHER people's names). Checked-in tap -> confirm check-OUT.
    const heroCard = document.getElementById('ckh-card');
    if (heroCard) {
      heroCard.addEventListener('click', (e) => {
        if (!e.target.closest('#ckh-btn')) return;
        const me = state.myClaimedPlayer;
        const player = me && (state.players || []).find((p) => String(p.id) === String(me.id));
        if (!player) { showCheckinToast('Still loading — one second, then tap again'); return; }
        const isIn = (state.checkedIn || []).includes(playerIdentityKey(player));
        const after = () => { const c = document.getElementById('ckh-card'); if (c) c.innerHTML = checkinHeroInnerHTML(); };
        if (isIn) { openKioskConfirm(player, true, () => { performKioskToggle(player, true); after(); }); }
        else { performKioskToggle(player, false); after(); }
      });
    }
```

(`performKioskToggle` already refreshes `#js-checkin-stats` + the results — the `after()` refresh flips the hero button in place. The card is rebuilt only by full `render()`, which re-runs `attachHandlers`, so the listener binding survives partialRender.)

- [ ] **Step 8: CSS.** Add to `public/styles.css` next to the `.cik-*` block (~2243):

```css
/* Round 2 — check-in one-tap hero (spec §12.3, Mike's locked pick A) */
#tab-players > .container:has(.ci-kiosk.has-hero) { justify-content: flex-start; }
.ckh-card { background: oklch(0.98 0.004 75 / 0.30); -webkit-backdrop-filter: blur(3px) saturate(1.05);
  backdrop-filter: blur(3px) saturate(1.05); border: 1.5px solid var(--accent-bd);
  border-radius: var(--r-lg); box-shadow: var(--shadow); padding: 24px 18px 18px;
  text-align: center; width: 100%; max-width: 400px; margin: 4px auto 18px; }
.ckh-av { width: 56px; height: 56px; border-radius: 50%; background: var(--accent-soft);
  border: 1px solid var(--accent-bd); color: var(--accent); font-family: 'Sora','Inter',sans-serif;
  font-weight: 800; font-size: 21px; display: inline-flex; align-items: center; justify-content: center; }
.ckh-eyebrow { display: block; font-size: 11px; font-weight: 700; letter-spacing: .7px;
  text-transform: uppercase; color: var(--muted); margin-top: 12px; }
.ckh-name { font-family: 'Sora','Inter',sans-serif; font-weight: 800; font-size: 23px; color: var(--ink); margin-top: 2px; }
.ckh-btn { width: 100%; margin-top: 16px; min-height: 52px; border: none; border-radius: var(--r-md);
  background: var(--accent); color: #fff; font-weight: 700; font-size: 17px;
  display: inline-flex; align-items: center; justify-content: center; gap: 9px; }
.ckh-btn svg { width: 20px; height: 20px; }
.ckh-btn.is-in { background: var(--live-soft); color: var(--live-ink); border: 1px solid oklch(0.85 0.05 150); }
.ckh-alts { text-align: center; margin-bottom: 6px; }
.ckh-alt-label { font-size: 13px; font-weight: 600; color: var(--muted); }
.ckh-count { text-align: center; font-size: 13px; font-weight: 600; color: var(--muted); padding: 10px 0 0; }
```

- [ ] **Step 9: Verify.** `node --check` clean; `npx vitest run` 199 passed. Browser signed OUT: kiosk identical to before (centered, search-first), public count line reads "N checked in". Signed IN with a claimed player (seed one on a throwaway or use the owner session if a claimed row exists — prod claims are empty by design, so locally stub `state.myClaimedPlayer = { id: <real player id>, name: '<their name>' }` in devtools to drive the UI, AND separately verify `loadMyClaimedPlayer()` runs without error signed-in): hero card renders, one tap → toast + button flips to "You're checked in" + count increments; tap again → confirm popup → check-out. 390 + desktop, 0 console errors.

- [ ] **Step 10: Bump `APP_VERSION` to `'2026.07.09.5'` and commit.**

```bash
git add public/pure.js test/pure.test.js public/app.js public/styles.css
git commit -m "feat: check-in one-tap hero for signed-in claimed players (Round 2 slice C, spec 12.3) - v2026.07.09.5"
```

---

### Task 4: checkin.html one-tap hero (Slice D)

**Files:**
- Modify: `public/checkin.html` (486 lines: inline CSS block, the kiosk markup, the script at ~237-486)

**Interfaces:**
- Consumes: the page's existing anon client `sb` (~246), its existing tap→`sb.rpc('check_in', { p_id })` path (~379) and toast/success helpers — grep the function that checks in a tapped suggestion and REUSE it for the hero tap.
- Mirrors: `checkinHeroModel`'s exactly-one rule (inline — the page has no module system).

- [ ] **Step 0: §38 marker** (slice name "checkin.html hero").

- [ ] **Step 1: The session-carrying read.** After the existing `const sb = …` (~246) add:

```js
      // Round 2 (spec §12.3): if the visitor is signed into the app on THIS device/browser, their
      // persisted session is in localStorage (same origin) — read it to offer a one-tap hero.
      // READ-ONLY auth client: autoRefreshToken:false so this stateless kiosk never writes tokens.
      // Any failure -> the anon kiosk below is untouched (the hero is best-effort).
      const sbUser = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: false } });
      async function tryRenderHero() {
        try {
          const { data: sess } = await sbUser.auth.getSession();
          const user = sess && sess.session && sess.session.user;
          if (!user) return;
          const { data, error } = await sbUser.from('players')
            .select('id,name').eq('claimed_by_profile', user.id).limit(2);
          if (error || !Array.isArray(data) || data.length !== 1 || !data[0].id || !data[0].name) return;
          renderCheckinHero(data[0]);
        } catch (_) { /* best-effort */ }
      }
```

- [ ] **Step 2: The hero card.** Add a `renderCheckinHero(player)` that injects the card ABOVE the existing search input (grep the search input's id in the page), with the same visual system as the app hero (this page has its OWN inline CSS — copy the `.ckh-*` rules from Task 3 Step 8 into the page's `<style>` block, adjusting only if the page's CSS variables differ; the page loads Inter+Sora already, line 9-11). The card: initials avatar, SIGNED IN eyebrow, name, one accent button "Check in". The button's click calls the page's EXISTING check-in-by-player path (the same function a tapped suggestion uses — pass the fetched `{id, name}` row; if that function expects a full row from its own roster fetch, look the player up in the page's loaded roster by id and fall back to hiding the hero if absent). After success reuse the page's existing success screen/vibration; if the page tracks `checked_in`, a checked-in player's hero button renders the muted "You're checked in" state instead.

- [ ] **Step 3: Call it.** Invoke `tryRenderHero()` after the page's initial roster/session-banner load completes (grep the init/boot call at the bottom of the script; run after it so the roster lookup in Step 2 has data).

- [ ] **Step 4: Verify.** Serve locally; open `checkin.html` in a browser profile with NO app session → page byte-identical behavior to today (search, I'm new, banner). Then in a profile where the app is signed in (or after signing in via the app on localhost): hero renders IF a claimed row exists (else stub the query result in devtools to drive the UI once); tap → the page's normal success screen; 0 console errors both ways; mobile 390 + desktop.

- [ ] **Step 5: Commit.** `checkin.html` has no APP_VERSION, but the paired app.js bump rule still applies only to app.js changes — this slice touches ONLY checkin.html; still bump `APP_VERSION` to `'2026.07.09.6'` in app.js so the deploy is verifiable by the version pill (comment-free bump commit is fine).

```bash
git add public/checkin.html public/app.js
git commit -m "feat: checkin.html one-tap hero via carried session (Round 2 slice D, spec 12.3) - v2026.07.09.6"
```

---

### Task 5: Final verification + writebacks (controller — not a builder dispatch)

- [ ] Push all slices; confirm Vercel deploy (version pill `v2026.07.09.6` on prod).
- [ ] §27 pass on PROD, 390 + desktop: nav trio · Home (no tiles, board+legend) · Tournament hub → each tile → back paths · Check In (signed-out kiosk + count line; signed-in owner session hero state) · checkin.html untouched-anon behavior. 0 console errors across all pages; watch ≥60s signed-in for any request-storm regression (the v09.1 lesson).
- [ ] Cross-check ONE rendered value against the DB (e.g. the hub's "N teams" vs `select count(*) from teams where tournament_id = …`).
- [ ] Vault: log.md + current.md + NOW.md + 12-history per task; Me/log.md + Me/decision-log.md + queue.md seed #1 progress note.

## Deviation rule

Any blocker, failing gate, or discovery that contradicts this plan: STOP the slice and report back to the controller (do not improvise around a failing verify).
