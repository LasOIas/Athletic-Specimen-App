# C32 Public Live Hub — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline) or
> superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Redesign the public (no-login) Home tab into a glanceable live status hub (layout C): two stat
tiles (count-only headcount + adaptive live tile), the existing casual-courts board, a tournament strip
that links to the Bracket tab, and a compact session card beside the Check In button — auto-updating live.

**Architecture:** A new pure `publicHubStatus()` decides which tile/label renders; `publicHomeHTML()` is
rewritten to layout C using it + the existing `getPublicLiveData()`/`buildPublicLiveCourtsHTML()`; new
`.ph-*` CSS (tokens only); a surgical public-Home branch in `partialRender()` keeps it live without a
scroll jump. No DB, no migration, read-only except the existing Check In CTA.

**Tech Stack:** vanilla JS (`public/app.js`, `public/pure.js`), `public/styles.css`, vitest.

## Global Constraints
- Bump `APP_VERSION` (`public/app.js`) + `SW_VERSION` (`public/sw.js`) in lockstep every code change.
- `node --check public/app.js` (and pure.js/sw.js) after each edit; vitest green.
- Players never see skill; no neon; no emoji (inline SVG only); mobile-first.
- Direction-A tokens only (`--accent`,`--live`,`--live-soft`,`--accent-soft`,`--muted`,`--faint`,`--border`,`--card`,`--bg`,`--r-*`).
- `partialRender()` for live updates (never full `render()` for background sync where avoidable); preserve scroll.
- No DB change, no migration, no new write surface.
- §38: layout C chosen from 3 localhost options — mark `3-options-shown` for app.js + styles.css.

---

### Task 1: `publicHubStatus` pure helper (TDD)

**Files:**
- Modify: `public/pure.js` (add function + export)
- Test: `test/pure.test.js`

**Interfaces:**
- Produces: `publicHubStatus({ checkedInCount, liveCourtCount, tournamentStatus }) -> { here, liveTile, liveCount, tournamentLive }`
  where `liveTile ∈ 'courts'|'tournament'|'none'`, `tournamentLive` boolean.

- [ ] **Step 1: Write failing tests** in `test/pure.test.js` (add `publicHubStatus` to the `require` destructure):
```javascript
describe('publicHubStatus (C32 — public hub tile logic)', () => {
  it('courts live → courts tile with the count', () => {
    expect(publicHubStatus({ checkedInCount: 12, liveCourtCount: 3, tournamentStatus: 'pools' }))
      .toEqual({ here: 12, liveTile: 'courts', liveCount: 3, tournamentLive: true });
  });
  it('no casual courts but a live tournament → tournament tile', () => {
    expect(publicHubStatus({ checkedInCount: 8, liveCourtCount: 0, tournamentStatus: 'bracket' }))
      .toEqual({ here: 8, liveTile: 'tournament', liveCount: 0, tournamentLive: true });
  });
  it('nothing live → none', () => {
    expect(publicHubStatus({ checkedInCount: 5, liveCourtCount: 0, tournamentStatus: 'setup' }))
      .toEqual({ here: 5, liveTile: 'none', liveCount: 0, tournamentLive: false });
  });
  it('coerces/guards missing inputs', () => {
    expect(publicHubStatus({})).toEqual({ here: 0, liveTile: 'none', liveCount: 0, tournamentLive: false });
  });
});
```
- [ ] **Step 2: Run** `npx vitest run` — expect FAIL ("publicHubStatus is not a function").
- [ ] **Step 3: Implement** in `public/pure.js` (before the `module.exports` block):
```javascript
// C32: single source of truth for the public hub's stat tiles. liveTile prioritises casual courts,
// then a live tournament, else nothing. Pure so the render stays a thin formatter.
function publicHubStatus(input) {
  const i = input || {};
  const here = Math.max(0, Number(i.checkedInCount) || 0);
  const liveCourtCount = Math.max(0, Number(i.liveCourtCount) || 0);
  const tournamentLive = i.tournamentStatus === 'pools' || i.tournamentStatus === 'bracket';
  let liveTile = 'none';
  if (liveCourtCount > 0) liveTile = 'courts';
  else if (tournamentLive) liveTile = 'tournament';
  return { here, liveTile, liveCount: liveCourtCount, tournamentLive };
}
```
Add `publicHubStatus` to the `module.exports` object.
- [ ] **Step 4: Run** `npx vitest run` — expect PASS (all green).
- [ ] **Step 5: Commit** `git add public/pure.js test/pure.test.js && git commit -m "feat(public): publicHubStatus helper for the live-hub tiles (C32, TDD)"`

---

### Task 2: Rewrite `publicHomeHTML()` to layout C + CSS

**Files:**
- Modify: `public/app.js` — `publicHomeHTML()` (currently ~line 2327) + add a small active-tournament resolver
- Modify: `public/styles.css` — add `.ph-tiles`, `.ph-tile*`, `.ph-tourney`, `.ph-bottom`, `.ph-cta-compact`

**Interfaces:**
- Consumes: `publicHubStatus` (Task 1), `getPublicLiveData()`, `buildPublicLiveCourtsHTML()`,
  `state.checkedIn`, `state.tournaments`, `state.activeTournamentId`, `state.currentSession`,
  `formatSessionDate()`, `escapeHTML()`.

- [ ] **Step 1: §38 mark** (layout C chosen from 3 mockups):
```
node "C:/Users/OlasM/.claude/hooks/ui38-mark.mjs" --decision=3-options-shown --reason="C32 public live-hub Home: Mike picked layout C (dashboard tiles) from 3 localhost mockups (status-feed/action-stack/tiles)." public/app.js
node "C:/Users/OlasM/.claude/hooks/ui38-mark.mjs" --decision=3-options-shown --reason="C32 public live-hub Home: layout C (tiles) CSS." public/styles.css
```
- [ ] **Step 2: Add the active-tournament resolver** in `public/app.js` just above `publicHomeHTML()`:
```javascript
// C32: the public-facing "live" tournament (the one the public Bracket tab follows), or null.
function publicLiveTournament() {
  const list = state.tournaments || [];
  const byId = state.activeTournamentId ? list.find((t) => t.id === state.activeTournamentId) : null;
  const live = (byId && (byId.status === 'pools' || byId.status === 'bracket')) ? byId
    : list.find((t) => t.status === 'pools' || t.status === 'bracket') || null;
  return live;
}
```
- [ ] **Step 3: Replace `publicHomeHTML()`** with layout C:
```javascript
// C32: PUBLIC Home = live status hub (layout C — dashboard tiles). Read-only except the Check In CTA.
// Count-only headcount (never names), no skill, no fabricated scores. Auto-updates via partialRender.
function publicHomeHTML() {
  const liveData = getPublicLiveData();
  const courtsHTML = buildPublicLiveCourtsHTML();
  const tourney = publicLiveTournament();
  const st = publicHubStatus({
    checkedInCount: (state.checkedIn || []).length,
    liveCourtCount: liveData.liveCount,
    tournamentStatus: tourney ? tourney.status : null,
  });
  const liveTile = st.liveTile === 'courts'
    ? `<div class="ph-tile is-live"><div class="ph-tile-num"><span class="ph-dot"></span>${st.liveCount}</div><div class="ph-tile-lab">${st.liveCount === 1 ? 'court live now' : 'courts live now'}</div></div>`
    : st.liveTile === 'tournament'
    ? `<div class="ph-tile is-live"><div class="ph-tile-num"><span class="ph-dot"></span></div><div class="ph-tile-lab">tournament live</div></div>`
    : `<div class="ph-tile is-idle"><div class="ph-tile-num">&mdash;</div><div class="ph-tile-lab">no games yet</div></div>`;
  const tilesHTML = `<div class="ph-tiles" id="ph-tiles">
    <div class="ph-tile is-here"><div class="ph-tile-num">${st.here}</div><div class="ph-tile-lab">here tonight</div></div>
    ${liveTile}
  </div>`;
  const courtsSection = courtsHTML
    ? `<div class="ph-sec">On the courts</div><div id="ph-courts">${courtsHTML}</div>` : '<div id="ph-courts"></div>';
  const tourneyStrip = tourney
    ? `<button type="button" class="ph-tourney" data-nav-tab="tournament" id="ph-tourney">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4a2 2 0 0 1-2-2V5h4M18 9h2a2 2 0 0 0 2-2V5h-4M6 5h12v3a6 6 0 0 1-12 0Z"/><path d="M9 18h6M10 21h4M12 14v4"/></svg>
        <span class="ph-tourney-t">${escapeHTML(tourney.name || 'Tournament')} &mdash; ${tourney.status === 'bracket' ? 'bracket' : 'pool play'}</span>
        <span class="ph-tourney-go">live &rarr;</span>
      </button>` : '<span id="ph-tourney"></span>';
  const sessionCard = state.currentSession
    ? `<div class="ph-card ph-sescard">
        <div class="ph-lab">Next session</div>
        <div class="ph-srow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9h18M8 2.5v4M16 2.5v4"/></svg><b>${escapeHTML(formatSessionDate(state.currentSession.date))}</b></div>
        <div class="ph-srow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg><b>${escapeHTML(state.currentSession.time || '')}</b></div>
        <div class="ph-srow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/></svg>${escapeHTML(state.currentSession.location || '')}</div>
      </div>`
    : `<div class="ph-card ph-sescard ph-empty">No session scheduled yet &mdash; check back soon.</div>`;
  return `<div class="home-screen">
    <div class="ph-brand">Athletic Specimen</div>
    ${tilesHTML}
    ${courtsSection}
    ${tourneyStrip}
    <div class="ph-bottom">
      ${sessionCard}
      <button type="button" class="ph-cta ph-cta-compact" data-nav-tab="players"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 11l3 3L20 6"/><path d="M20 12v7H4V5h11"/></svg>Check In</button>
    </div>
  </div>`;
}
```
- [ ] **Step 4: Add CSS** to `public/styles.css` (append near the existing `.ph-*` block):
```css
/* C32: public live-hub tiles + tournament strip + bottom row (layout C) */
.ph-tiles{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:0 0 13px}
.ph-tile{border:1px solid var(--border);border-radius:var(--r-md);padding:14px;box-shadow:var(--shadow-sm)}
.ph-tile-num{font-family:'Sora',system-ui,sans-serif;font-size:30px;font-weight:700;line-height:1;display:flex;align-items:center;gap:8px}
.ph-tile-lab{font-size:12px;color:var(--muted);margin-top:5px}
.ph-tile.is-here{background:var(--accent-soft)}
.ph-tile.is-here .ph-tile-num{color:var(--brand-dark)}
.ph-tile.is-live{background:var(--live-soft)}
.ph-tile.is-live .ph-tile-num{color:var(--live)}
.ph-tile.is-idle .ph-tile-num{color:var(--faint)}
.ph-tile .ph-dot{width:11px;height:11px;border-radius:99px;background:var(--live);box-shadow:0 0 0 4px var(--live-soft)}
.ph-tourney{display:flex;align-items:center;gap:9px;width:100%;text-align:left;background:var(--accent-soft);border:1px solid var(--border);border-radius:var(--r-md);padding:11px 13px;margin-top:9px;box-shadow:var(--shadow-sm);cursor:pointer;color:var(--brand-dark)}
.ph-tourney-t{font-family:'Sora',system-ui,sans-serif;font-weight:600;font-size:13.5px}
.ph-tourney-go{font-size:11.5px;color:var(--muted);margin-left:auto}
.ph-bottom{display:flex;gap:9px;margin-top:13px;align-items:stretch}
.ph-bottom .ph-sescard{flex:1;margin:0}
.ph-cta-compact{flex:0 0 118px;flex-direction:column;gap:7px;margin:0}
```
(Keep the existing `.ph-card`,`.ph-lab`,`.ph-srow`,`.ph-sec`,`.ph-cta`,`.ph-brand` rules — reused.)
- [ ] **Step 5: Verify** `node --check public/app.js` clean; `npx vitest run` green (no pure change, sanity).
- [ ] **Step 6: Commit** `git add public/app.js public/styles.css && git commit -m "feat(public): live-hub Home redesign — stat tiles + tournament strip (C32, layout C)"`

---

### Task 3: Surgical live update of the public Home (preserve scroll)

**Files:**
- Modify: `public/app.js` — `partialRender()` (~line 1289, add a public-home branch before the full-render fall-through)

**Interfaces:**
- Consumes: `publicHomeHTML()` regions (`#ph-tiles`, `#ph-courts`, `#ph-tourney`), `buildSharedSyncNoticeHTML()`.

- [ ] **Step 1: §38 mark** (logic-only partialRender branch, no layout change):
```
node "C:/Users/OlasM/.claude/hooks/ui38-mark.mjs" --decision=exempt --reason="C32: surgical public-home partialRender branch (in-place innerHTML of existing hub regions) — no layout/UI change, preserves scroll." public/app.js
```
- [ ] **Step 2: Add the public-home branch** inside `partialRender()`, immediately after the kiosk
  short-circuit block (after its closing `}` at the `if (!playersEl){...}` end, before `if (!syncNoticeEl || !playersEl) { render(); return; }`):
```javascript
  // C32: public live-hub Home updates in place (no full render → no scroll jump) when the viewer is on
  // the Home tab. Mirrors the kiosk short-circuit. The public shell has no `.players`, so without this
  // a background sync would fall through to a full render() and yank a spectator to the top.
  if (!playersEl && activeMainTab === 'home') {
    const tilesEl = document.getElementById('ph-tiles');
    const courtsEl = document.getElementById('ph-courts');
    const tourneyEl = document.getElementById('ph-tourney');
    if (tilesEl && courtsEl && tourneyEl) {
      const fresh = document.createElement('div');
      fresh.innerHTML = publicHomeHTML();
      const pick = (id) => fresh.querySelector('#' + id);
      if (syncNoticeEl) syncNoticeEl.innerHTML = buildSharedSyncNoticeHTML();
      tilesEl.replaceWith(pick('ph-tiles'));
      courtsEl.replaceWith(pick('ph-courts'));
      tourneyEl.replaceWith(pick('ph-tourney'));
      return;
    }
  }
```
- [ ] **Step 3: Verify** `node --check public/app.js` clean.
- [ ] **Step 4: Bump versions** — `APP_VERSION` (`public/app.js`) and `SW_VERSION` (`public/sw.js`) to the next `2026.06.24.N`.
- [ ] **Step 5: Commit + push** `git add public/app.js public/sw.js && git commit -m "feat(public): live-hub auto-updates in place (no scroll jump) (C32)" && git push origin main`

---

### Task 4: Live verification on prod (Playwright) + write-backs

- [ ] **Step 1:** Poll the deployed `app.js` for the new version (curl loop).
- [ ] **Step 2:** Playwright signed-OUT, phone (≤430px) + desktop: load Home → tiles show "0 here / no games yet" (or current), session card + Check In present, 0 console errors.
- [ ] **Step 3:** Temporarily flip ~8 `players.checked_in=true` (DB) → reload public Home → "here tonight" reflects the count (no names anywhere); flip back.
- [ ] **Step 4:** Generate teams as admin (second context) so casual nets are live → public Home live tile = "N courts live now", board shows nets; reset `live_state`.
- [ ] **Step 5:** With a live tournament (or a synthetic `pools` one) → live tile reads "tournament live" + the strip shows and its tap lands on the Bracket tab. Clean up any synthetic tournament.
- [ ] **Step 6:** Signed-out DOM/network audit: **0** skill values on Home.
- [ ] **Step 7: Write-backs** — `01-state/log.md`, `current.md`, `NOW.md`, `decisions.md`, `Tasks From Claude.md` (C32 status), `03-anatomy/PRODUCT-SURFACE.md`, and `12-history/task-#16-C32-public-live-hub.md` BEFORE marking the task complete (§30).

---

## Self-Review
- **Spec coverage:** tiles (Task 2) ✓; count-only headcount (Task 1/2) ✓; casual board (Task 2 reuse) ✓;
  tournament strip→Bracket (Task 2) ✓; adaptive live tile (Task 1) ✓; live auto-update + preserve scroll
  (Task 3) ✓; empty states (Task 2) ✓; read-only + Check In (Task 2) ✓; verification gate (Task 4) ✓.
- **Placeholders:** none — all code shown.
- **Type consistency:** `publicHubStatus` return shape identical in Task 1 def, test, and Task 2 use;
  region IDs `ph-tiles`/`ph-courts`/`ph-tourney` consistent between Task 2 (render) and Task 3 (update).
