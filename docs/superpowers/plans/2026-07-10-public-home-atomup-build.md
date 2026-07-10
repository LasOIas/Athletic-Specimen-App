# Public Home Atom-Up Rebuild — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the public Home page to the locked atom-up spec (`docs/superpowers/specs/2026-07-10-public-home-atomup-redesign.md`) — new shared public chrome (Barlow display, tamed watermark, floating rounded nav, simplified header), an exclusive four-state Home, rail+board desktop — then delete the old Home UI code.

**Architecture:** Extend `public/app.js` in place (C67 module split stays deferred). New pure view-models in `public/pure.js` (TDD, vitest). New CSS lives in `public/styles.css` under a new `hm-*` (home) + `pnav-*` (public nav) namespace; the shared chrome pieces are deliberately reusable so the Tournament/Check-In redesign sessions inherit them. Old `ph-*` Home kit and superseded blocks are deleted in a final, separate commit after Mike verifies on his phone.

**Tech Stack:** vanilla JS SPA (`public/app.js`), pure helpers `public/pure.js`, vitest (run from `test/`), Supabase reads already in `state`, Vercel deploy on push.

## Global Constraints

- Bump `APP_VERSION` (`public/app.js:30`, format `YYYY.MM.DD.N`) in EVERY code commit; run `node --check public/app.js` after every edit; commit AND push per task (project deploy hygiene).
- `partialRender()` for background syncs — never full `render()` on a poll. The Home short-circuit at `public/app.js:1373-1383` must keep working (it re-calls `publicHomeHTML()`).
- §51: matte/muted only — every color below is copied from the spec; no neon, no glow shadows, no emoji (SVG icons only).
- §41: desktop AND mobile ship in the SAME plan (Tasks 4 is not optional).
- Fonts: display face becomes **Barlow Semi Condensed 600/700/800** on the public surface; Inter body unchanged; 16px minimum on inputs.
- Home is the everyone surface: identical signed-in or signed-out. NO personal content (no personal hero, no claim button) on Home.
- Copy rules: never "night/tonight"; label things by what they are (tournament NAME, "your team", "you're up next").
- Tests: add to `test/pure.test.js` (or a new `test/home-state.test.js`); run `cd test && npx vitest run`; suite must stay green (currently ~237 passing).

## File Structure

- `public/index.html` + `public/checkin.html` — font link swap (add Barlow Semi Condensed).
- `public/styles.css` — new tokens + `pnav-*` floating nav + header tweak + watermark restyle + new `hm-*` Home kit + desktop media block. Old `ph-*` kit removed in Task 6.
- `public/pure.js` — new: `publicHomeState`, `homeNetBlocksModel`, `homeComingUpModel`, `homeTopStandingsModel`. CommonJS export block at `public/pure.js:1341-1364` gains the new names.
- `public/app.js` — rewrite `publicHomeHTML()` (2585-2671); restyle-driven edits to `renderPublicShell()` (8687-8734), `buildPublicHeaderHTML()` (8472-8486), `buildPublicNavInnerHTML()` (8453-8467); claim entry relocated to `buildTournamentHubHTML()` (5040-5087).
- `test/home-state.test.js` — new test file for the state machine + shaping models.

---

### Task 1: Shared chrome — fonts, tokens, watermark, floating nav, simplified header

**Files:**
- Modify: `public/index.html:9-11` (font link)
- Modify: `public/checkin.html:9-11` (font link)
- Modify: `public/styles.css` (`:root` tokens ~6-51; `.pd-watermark` 3024-3035; `.pd-scrim` 3036-3048; `.pd-wordmark` 3049-3056; add `pnav-*` block)
- Modify: `public/app.js` (`buildPublicHeaderHTML` 8472-8486; `renderPublicShell` 8691-8692; `buildPublicNavInnerHTML` 8453-8467; `APP_VERSION` line 30)

**Interfaces:**
- Produces: CSS classes `pnav` (on the existing `#bottom-nav` when public), token `--font-display`, restyled `.pd-watermark`. Later tasks assume the watermark img keeps class `pd-watermark` and the nav keeps id `#bottom-nav`.

- [ ] **Step 1: Swap font links.** In BOTH `public/index.html` and `public/checkin.html`, replace the Google Fonts href with:

```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Sora:wght@600;700;800&family=Barlow+Semi+Condensed:wght@600;700;800&display=swap" rel="stylesheet">
```

(Sora stays loaded — the admin surface still uses it until its own rebuild.)

- [ ] **Step 2: Add tokens.** In `public/styles.css` `:root` (after `--gold-ink`, ~line 25), add:

```css
  --font-display: 'Barlow Semi Condensed', 'Inter', sans-serif;  /* public display face (atom-up 2026-07-10) */
  --wm-opacity: .07;                                             /* tamed watermark strength */
```

- [ ] **Step 3: Restyle the watermark; retire the scrim on public pages.** Replace the `.pd-watermark` rules (styles.css:3024-3035) with:

```css
.pd-watermark{
  display: none; position: fixed; z-index: 0; pointer-events: none;
  left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: min(340px, 80vw); height: auto;
  opacity: var(--wm-opacity); filter: grayscale(1);
}
body.pd-public-active .pd-watermark{ display: block; }
```

Delete the `.pd-scrim` rules (3036-3044) and its reveal rule; in `renderPublicShell` (`public/app.js:8692`) delete the `<div class="pd-scrim"></div>` line. Grep-gate: `grep -n "pd-scrim" public/*.js public/*.css public/*.html` → 0 hits.

- [ ] **Step 4: Public display face.** In styles.css, scope the display font for the public surface (near the `.pd-wordmark` block):

```css
body.pd-public-active h1, body.pd-public-active h2, body.pd-public-active h3,
body.pd-public-active .pd-wordmark, body.pd-public-active .score,
body.pd-public-active .statbig .n { font-family: var(--font-display); }
```

(Admin keeps Sora via the base rule at styles.css:84.)

- [ ] **Step 5: Simplify the header.** In `buildPublicHeaderHTML()` (`public/app.js:8472-8486`) delete the sport-pill span (`pd-sportpill`) so the header is wordmark + `#pd-account` only. Grep-gate: `grep -n "pd-sportpill" public/app.js public/styles.css` → CSS rule may remain for now (removed in Task 6); JS emits none.

- [ ] **Step 6: Floating rounded nav (mobile, public only).** Append to styles.css:

```css
/* pnav — floating full-width rounded public nav (atom-up rung 5, pick H1) */
body.pd-public-active #bottom-nav{
  left: 12px; right: 12px; bottom: 12px; width: auto;
  border-radius: 18px; border: 1px solid var(--border);
  background: oklch(1 0 0 / .82);
  -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
  box-shadow: 0 4px 14px oklch(0.18 0.005 75 / .10);
}
```

Verify the existing safe-area / `env()` padding on `#bottom-nav` still applies (do not remove any `env(safe-area-inset-bottom)` handling; the 12px offset ADDS to it). Tab panels need matching bottom padding so content clears the floating bar: check the existing `#app-content` / `.tab-panel` bottom spacing and increase by 12px for `body.pd-public-active` if content is cut.

- [ ] **Step 7: Verify + ship.** `node --check public/app.js`; `cd test && npx vitest run` (green); browser pass at 390px AND 1280px on localhost: all PUBLIC pages (Home, Check In, Tournament hub, Standings, Bracket, History) render with new nav/watermark/fonts, zero console errors — this task intentionally re-chromes every public page. Bump `APP_VERSION` to today's next N. Commit:

```bash
git add public/index.html public/checkin.html public/styles.css public/app.js
git commit -m "feat(public): shared chrome - Barlow display, tamed watermark, floating rounded nav, header simplification (atom-up spec 1)"
git push origin main
```

---

### Task 2: Pure state machine + Home view-models (TDD)

**Files:**
- Modify: `public/pure.js` (new functions + export block 1341-1364)
- Create: `test/home-state.test.js`

**Interfaces:**
- Consumes: existing pure helpers `sessionIsUpcoming` (pure.js:1325), `computeStandings` (280).
- Produces (exact signatures — Task 3 renders from these, never from raw state):
  - `publicHomeState({ liveTournament, regTournament, session, todayStr, hasLiveCourts })` → `'tournament_live' | 'session_live' | 'registration' | 'quiet'`
  - `homeNetBlocksModel(matches, teams, labelPrefix)` → `[{ label:'NET 1', a:{name,score}, b:{name,score}, status:'playing' }]` (live/in-progress games only, sorted by net)
  - `homeComingUpModel(matches, teams, labelPrefix)` → `[{ label:'Net 1', text:'TeamA vs TeamB' }]` (earliest scheduled game per net, only nets with a queue)
  - `homeTopStandingsModel(standings, n)` → `[{ rank:1, name, record:'3-0' }]`

- [ ] **Step 1: Write failing tests** in `test/home-state.test.js`:

```js
const { publicHomeState, homeNetBlocksModel, homeComingUpModel, homeTopStandingsModel } = require('../public/pure.js');
const { describe, it, expect } = require('vitest');

describe('publicHomeState — exclusive with precedence (spec §2)', () => {
  const base = { liveTournament: null, regTournament: null, session: null, todayStr: '2026-07-10', hasLiveCourts: false };
  it('live tournament wins over everything', () => {
    expect(publicHomeState({ ...base, liveTournament: { id: 1, status: 'pools' },
      regTournament: { id: 2 }, session: { date: '2026-07-10' }, hasLiveCourts: true })).toBe('tournament_live');
  });
  it('live session beats registration', () => {
    expect(publicHomeState({ ...base, regTournament: { id: 2 },
      session: { date: '2026-07-10' }, hasLiveCourts: true })).toBe('session_live');
  });
  it('a STALE session never renders live (the June-28 bug)', () => {
    expect(publicHomeState({ ...base, session: { date: '2026-06-28' }, hasLiveCourts: true })).toBe('quiet');
  });
  it('todays session without live courts is still session_live (check-in phase)', () => {
    expect(publicHomeState({ ...base, session: { date: '2026-07-10' } })).toBe('session_live');
  });
  it('registration when nothing is live', () => {
    expect(publicHomeState({ ...base, regTournament: { id: 2 } })).toBe('registration');
  });
  it('quiet when nothing at all', () => { expect(publicHomeState(base)).toBe('quiet'); });
});

describe('homeNetBlocksModel', () => {
  const teams = [{ id: 1, name: 'Dink Responsibly' }, { id: 2, name: 'Lawn and Order' }, { id: 3, name: 'Ballin' }, { id: 4, name: 'That One Team' }];
  it('shapes live games per net, sorted', () => {
    const m = [
      { net: 2, team1_id: 3, team2_id: 4, score1: 8, score2: 7, status: 'live' },
      { net: 1, team1_id: 1, team2_id: 2, score1: 15, score2: 12, status: 'live' },
      { net: 1, team1_id: 3, team2_id: 4, status: 'scheduled' },
    ];
    const out = homeNetBlocksModel(m, teams, 'NET');
    expect(out.map(b => b.label)).toEqual(['NET 1', 'NET 2']);
    expect(out[0].a).toEqual({ name: 'Dink Responsibly', score: 15 });
    expect(out[0].status).toBe('playing');
  });
  it('empty when nothing live', () => {
    expect(homeNetBlocksModel([{ net: 1, status: 'scheduled' }], teams, 'NET')).toEqual([]);
  });
});

describe('homeComingUpModel', () => {
  const teams = [{ id: 5, name: 'Block Party' }, { id: 6, name: 'Net Ninjas' }];
  it('earliest scheduled game per net', () => {
    const m = [
      { net: 1, team1_id: 5, team2_id: 6, status: 'scheduled', sort_order: 9 },
      { net: 1, team1_id: 6, team2_id: 5, status: 'scheduled', sort_order: 4 },
      { net: 2, team1_id: 5, team2_id: 6, status: 'live' },
    ];
    const out = homeComingUpModel(m, teams, 'Net');
    expect(out).toEqual([{ label: 'Net 1', text: 'Net Ninjas vs Block Party' }]);
  });
});

describe('homeTopStandingsModel', () => {
  it('takes n with rank + W-L record', () => {
    const standings = [
      { name: 'Dink Responsibly', wins: 3, losses: 0 },
      { name: 'Sets on the Beach', wins: 2, losses: 1 },
      { name: 'Lawn and Order', wins: 2, losses: 1 },
      { name: 'Net Gains', wins: 0, losses: 3 },
    ];
    const out = homeTopStandingsModel(standings, 3);
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ rank: 1, name: 'Dink Responsibly', record: '3-0' });
  });
});
```

**IMPORTANT — ground the fixtures first:** before finalizing the tests, read the REAL match/team row shapes used by `buildPublicLiveCourtsHTML` (app.js:2429-2443) and `buildPublicTournamentLiveHTML` (2448-2518) — field names for net, team refs, scores, and status differ between the casual courts model and tournament `matches` rows. Make the models accept the TOURNAMENT row shape and add a thin adapter (or a second labelPrefix call) for the casual courts; adjust fixtures to the verified shape. Do not invent field names.

- [ ] **Step 2: Run tests, verify they fail.** `cd test && npx vitest run home-state` → FAIL (functions not exported).

- [ ] **Step 3: Implement in `public/pure.js`** (before the export block):

```js
// ── Public Home state machine (atom-up spec 2026-07-10 §2) ──
// Exclusive with precedence: tournament_live > session_live > registration > quiet.
function publicHomeState(o) {
  if (o.liveTournament) return 'tournament_live';
  var sessionToday = !!(o.session && o.session.date && sessionIsUpcoming(o.session.date, o.todayStr));
  if (sessionToday) return 'session_live';
  if (o.regTournament) return 'registration';
  return 'quiet';
}
```

(Note: `hasLiveCourts` deliberately does NOT make a stale session live — the date gate is the truth source; live-court data from a past session is ignored. Implement `homeNetBlocksModel` / `homeComingUpModel` / `homeTopStandingsModel` per the verified row shapes; each ≤ 20 lines, no state access, no DOM.) Add all four to the CommonJS export block.

- [ ] **Step 4: Run tests green.** `cd test && npx vitest run` — new tests pass, full suite stays green.

- [ ] **Step 5: Commit** (pure-only, no APP_VERSION bump needed — but bump anyway per project rule since pure.js ships to the client):

```bash
git add public/pure.js test/home-state.test.js public/app.js
git commit -m "feat(public): Home state machine + net-block/coming-up/top-standings view-models (TDD, atom-up spec 2)"
git push origin main
```

---

### Task 3: Rebuild `publicHomeHTML()` — four states, mobile

**Files:**
- Modify: `public/app.js:2585-2671` (`publicHomeHTML` full rewrite) + the `#pd-claim` handler block (10277-10281 stays; the BUTTON just no longer renders on Home)
- Modify: `public/styles.css` (new `hm-*` kit appended)

**Interfaces:**
- Consumes: Task 2 models; existing `publicLiveTournament()` (2521), `sessionIsUpcoming`, `getPublicLiveData()` (2410), `computeStandings` (pure), `escapeHTML`, `loadTournamentHistory()` (8631).
- Produces: `publicHomeHTML()` same signature/return (string) — the shell mount (8701) and partialRender short-circuit (1373-1383) keep working untouched. Section markup uses ONLY `hm-*` classes (new) so Task 6 can delete `ph-*` wholesale.

- [ ] **Step 1: New CSS kit.** Append to `public/styles.css` (values verbatim from the locked mockups — `canvas-v8-dayof.html`):

```css
/* ── hm-* : atom-up public Home kit (2026-07-10 spec) — card-free ── */
.hm{ position: relative; z-index: 1; }
.hm-lead{ display: grid; grid-template-columns: 1fr auto; align-items: center; column-gap: 10px; padding: 12px 2px 6px; }
.hm-eyebrow{ display: flex; align-items: center; gap: 7px; font-size: 11px; font-weight: 700; letter-spacing: .1em; color: var(--live-ink); text-transform: uppercase; }
.hm-eyebrow .hm-dot{ width: 7px; height: 7px; border-radius: 50%; background: var(--live); }
.hm-eyebrow.is-quiet{ color: var(--muted); } .hm-eyebrow.is-quiet .hm-dot{ background: var(--faint); }
.hm-lead h1{ font-family: var(--font-display); font-size: 27px; font-weight: 700; margin: 8px 0 4px; }
.hm-meta{ font-size: 13px; color: var(--muted); }
.hm-logo{ height: 96px; justify-self: end; }
.hm-cta{ grid-column: 1 / -1; margin-top: 14px; width: 100%; padding: 13px 0; background: var(--accent); color: #fff; border: none; border-radius: 11px; font: 600 15px 'Inter', sans-serif; }
.hm-sect{ font-size: 11px; font-weight: 700; letter-spacing: .12em; color: var(--muted); text-transform: uppercase; margin: 20px 2px 8px; }
.hm-nethead{ display: flex; align-items: center; gap: 10px; font: 700 12.5px var(--font-display); letter-spacing: .12em; color: var(--ink); }
.hm-nethead::after{ content: ''; flex: 1; height: 1px; background: var(--border); }
.hm-netblock{ margin-bottom: 16px; }
.hm-game{ display: flex; align-items: center; padding: 8px 2px 0; }
.hm-teams{ flex: 1; min-width: 0; }
.hm-teams .hm-row{ display: flex; justify-content: space-between; align-items: baseline; padding: 1.5px 0; }
.hm-teams .hm-nm{ font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hm-teams .hm-sc{ font-family: var(--font-display); font-size: 15px; font-weight: 700; margin-left: 12px; }
.hm-pill{ font-size: 11px; font-weight: 700; padding: 4px 9px; border-radius: 99px; margin-left: 12px; background: var(--live-soft); color: var(--live-ink); }
.hm-pill.is-done{ background: oklch(0.94 0.004 75); color: var(--muted); }
.hm-mini{ display: flex; justify-content: space-between; align-items: baseline; padding: 8px 2px; border-bottom: 1px solid var(--border); font-size: 14px; }
.hm-mini:last-of-type{ border-bottom: none; }
.hm-mini .hm-rk{ color: var(--muted); font: 700 12px var(--font-display); margin-right: 8px; }
.hm-mini .hm-rec{ font-family: var(--font-display); font-weight: 700; }
.hm-link{ display: flex; justify-content: space-between; align-items: center; padding: 12px 2px; font: 600 13.5px 'Inter', sans-serif; color: var(--brand-dark); }
.hm-detail{ display: flex; gap: 12px; padding: 10px 2px; border-bottom: 1px solid var(--border); font-size: 14px; align-items: center; }
.hm-detail:last-of-type{ border-bottom: none; }
.hm-detail svg{ width: 18px; height: 18px; stroke: var(--faint); fill: none; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; flex: none; }
.hm-detail .hm-d2{ color: var(--muted); margin-left: auto; font-size: 13px; }
```

- [ ] **Step 2: Rewrite `publicHomeHTML()`** (app.js:2585-2671) as a state switch. Structure (full markup per spec §2; the lead block is shared):

```js
function publicHomeHTML() {
  const t = publicLiveTournament();
  const reg = state.tournaments.find(x => x.registration_open && x.status === 'setup');
  const todayStr = localDateStr(new Date());   // reuse the existing date helper used with sessionIsUpcoming
  const st = publicHomeState({
    liveTournament: t, regTournament: reg,
    session: state.currentSession, todayStr,
    hasLiveCourts: getPublicLiveData().liveCount > 0,
  });
  if (st === 'tournament_live') return hmTournamentLiveHTML(t);
  if (st === 'session_live')    return hmSessionLiveHTML();
  if (st === 'registration')    return hmRegistrationHTML(reg);
  return hmQuietHTML();
}
```

Each `hm*HTML` builder emits exactly the spec state: shared lead (`hm-lead` with eyebrow/title/meta + `<img class="hm-logo" src="/logo-mark.png">`), then the state's sections (`LIVE NOW` net blocks from `homeNetBlocksModel`, `COMING UP` from `homeComingUpModel`, `STANDINGS · TOP 3` from `homeTopStandingsModel(computeStandings(...), 3)`, `Full standings & schedule ›` link with `data-nav-tab="tournament"` navigation; registration = lead + Register CTA (`data-tn-view="register"` route, reusing the shipped join-sheet flow at 5287+) + the four `hm-detail` rows (omit the date row — tournaments have no date column; location row = `posted in GroupMe`); session = lead + `Check in` CTA (routes to `activateMainTab('players')`) + `ON THE COURTS` blocks via the casual adapter; quiet = muted lead + past-tournaments minis from `loadTournamentHistory()` data + champions link). Cross-state rule: in `session_live`, if `reg` exists append ONE `hm-link` row `Registration open — ${escapeHTML(reg.name)} ›` routing to the register view. ALL dynamic text through `escapeHTML`. No personal hero, no `#pd-claim` — delete those branches from the new builders (the old code they lived in is removed wholesale by this rewrite; `buildPersonalHeroHTML` itself stays for the Tournament-tab session and is deletion-gated in Task 6 if still uncalled).

- [ ] **Step 3: Verify.** `node --check public/app.js`; `cd test && npx vitest run` green; localhost §27 pass at 390px on all four states (force states by stubbing `state` in the console or temporarily flipping fixtures): every rendered value TRUE vs DB, singular/plural correct ("1 team in"), no run-together labels (the 2643 bug class is gone with the old banner), watermark behind text everywhere, one state at a time. Bump `APP_VERSION`.

- [ ] **Step 4: Commit + push:**

```bash
git add public/app.js public/styles.css
git commit -m "feat(public): Home rebuilt - exclusive four-state page, card-free net-header grammar, no personalization (atom-up spec 3)"
git push origin main
```

---

### Task 4: Desktop rail + board (≥1024)

**Files:**
- Modify: `public/styles.css` (extend the existing `body.pd-public-active` desktop media block, 3532-3636+)

**Interfaces:**
- Consumes: Task 3's `hm-*` markup untouched — desktop is CSS-only (media-scoped; mobile byte-identical, same §13.8 technique).

- [ ] **Step 1: Add the rail+board grid** inside `@media (min-width: 1024px)`:

```css
@media (min-width: 1024px){
  body.pd-public-active #tab-home .hm{ max-width: 1140px; margin: 0 auto; }
  body.pd-public-active #tab-home .hm.is-live{ display: grid; grid-template-columns: 360px 1fr; column-gap: 40px; align-items: start; }
  /* rail = lead + coming-up + standings + link; board = LIVE NOW section */
  body.pd-public-active #tab-home .hm.is-live .hm-rail{ grid-column: 1; }
  body.pd-public-active #tab-home .hm.is-live .hm-board{ grid-column: 2; display: block; }
  body.pd-public-active #tab-home .hm.is-live .hm-board .hm-netgrid{ display: grid; grid-template-columns: 1fr 1fr; column-gap: 32px; }
  body.pd-public-active #tab-home .hm:not(.is-live){ max-width: 640px; }
}
```

For this to bind, Task 3's `hmTournamentLiveHTML` must wrap its sections as `<div class="hm is-live"><div class="hm-rail">lead + coming-up + standings + link</div><div class="hm-board"><div class="hm-sect">Live now</div><div class="hm-netgrid">…netblocks…</div></div></div>` — mobile CSS renders these wrappers as plain blocks in source order (rail content first) which matches the locked mobile order EXCEPT the board must come before coming-up/standings on mobile. Resolve with `display: contents` on mobile exactly like §13.8 did: `.hm-rail, .hm-board{ display: contents; }` as the base rule + explicit `order` on children for the mobile sequence (lead → LIVE NOW → coming up → standings → link), and override to block columns in the ≥1024 media query. Copy the technique from the shipped 13.8 wrappers at styles.css:3532+.
- The top tab strip on desktop already exists from §13.8 (verify it renders with the new chrome; the floating mobile bar is display-hidden ≥1024 exactly as the current nav is — check and keep that rule).

- [ ] **Step 2: Verify both surfaces.** Browser: 1280px day-of Home = rail left (title/stats/logo, coming up, standings) + nets 2-across right; reg/casual/quiet centered at 640px; 390px = byte-identical section order to Task 3 (diff a DOM snapshot before/after this commit at 390px to prove mobile untouched). `node --check`; vitest green; bump `APP_VERSION`.

- [ ] **Step 3: Commit + push:**

```bash
git add public/styles.css public/app.js
git commit -m "feat(public): Home desktop rail+board at >=1024, mobile byte-identical (atom-up spec 4)"
git push origin main
```

---

### Task 5: Claim entry relocation to the Tournament hub

**Files:**
- Modify: `public/app.js` (`buildTournamentHubHTML` 5040-5087; the `#pd-claim` click handler 10277-10281 — keep, it now binds on the hub)

**Interfaces:**
- Consumes: existing `openClaimPage()` (8143), `myTeamInfo()`, hub tile grammar (pd-tile).
- Produces: the claim entry lives ONLY on the Tournament hub; Home is claim-free (spec: personal layer belongs to the Tournament tab).

- [ ] **Step 1:** In `buildTournamentHubHTML()`, for a signed-in-or-not user with NO claimed team while a claimable tournament exists, render one hub row/tile `Playing? Claim your team` with `id="pd-claim"` (same id so the 10277 handler binds unchanged — verify the handler uses delegation or re-binds after hub render; if it queries at startup only, move the binding into the delegated body click handler used by the hub's other buttons). Claimed users keep the existing My Team tile (untouched).
- [ ] **Step 2:** Verify: signed-out → hub shows the claim row → tap → auth page with `claimIntent` resume (existing 8125/10554 flow) → claim page. Home shows no claim UI in any state. `node --check`; vitest green; §27 tap-through on localhost; bump `APP_VERSION`.
- [ ] **Step 3: Commit + push:**

```bash
git add public/app.js
git commit -m "feat(public): claim entry moves to the Tournament hub - Home is the everyone surface (atom-up spec 5)"
git push origin main
```

**→ STOP HERE: Mike verifies the new Home on his phone (all reachable states) before Task 6.**

---

### Task 6: Old-Home-UI deletion (own commit, AFTER Mike's phone verify)

**Files:**
- Modify: `public/app.js`, `public/styles.css`

**Interfaces:**
- Consumes: nothing new. Pure deletion with grep-gates.

- [ ] **Step 1: Delete dead JS.** Remove (they became unreferenced when Task 3's rewrite landed — verify each with grep BEFORE deleting; a hit outside old-Home code = STOP and report):
  - old Home constants/pieces: `PUBLIC_COURT_LEGEND` (2533) and any leftover `regGateway`/`tilesHTML`/`sessionCard` fragments if the rewrite left helpers behind
  - `buildPublicRegisterHTML` (4995-5032, the retired legacy register screen) — grep `buildPublicRegisterHTML` → only its definition remains
  - `buildPersonalHeroHTML` (2542-2583) — ONLY if grep shows no caller (it may already be re-used by the Tournament tab; if any caller exists, keep and note)
- [ ] **Step 2: Delete dead CSS.** Remove the `ph-*` Home kit (styles.css ~1750-1858: `.home-screen` casual rules, `.ph-card`, `.ph-tiles`, `.ph-tile*`, `.ph-dot`, `.ph-bottom`), `.pd-sportpill`, and any `#tab-home` desktop rules in 3532+ that referenced deleted markup. Grep-gate per class name: `grep -n "ph-tile\|ph-card\|ph-tiles\|ph-dot\|ph-bottom\|pd-sportpill" public/` → 0 hits in JS; CSS selectors deleted.
- [ ] **Step 3: Verify nothing broke.** `node --check public/app.js`; `cd test && npx vitest run` green (delete any vitest cases that tested removed helpers ONLY if the helper is gone — list them in the commit message); full §27 browser pass on all public pages at 390 + 1280, zero console errors; bump `APP_VERSION`.
- [ ] **Step 4: Commit + push:**

```bash
git add public/app.js public/styles.css test/
git commit -m "chore(public): delete old Home UI (ph-* kit, legacy register screen, retired banner/legend) per atom-up spec 4 deletion scope"
git push origin main
```

---

## Self-review notes (done at write time)

- Spec coverage: §1 system → Task 1+3 CSS; §2 states + precedence + cross-state link → Tasks 2-3; §3 desktop → Task 4; §4 deletion → Task 6; §5 build notes (TDD/pure/shared chrome/fonts) → Tasks 1-2; personal-layer relocation implication → Task 5.
- Known unknowns called out to the implementer instead of invented: exact tournament/casual match row field names (Task 2 Step 1 grounding note), nav safe-area padding (Task 1 Step 6), `#pd-claim` binding style (Task 5), `buildPersonalHeroHTML` liveness (Task 6).
- Types consistent: the four model signatures in Task 2 are the only contract Task 3 renders from.
