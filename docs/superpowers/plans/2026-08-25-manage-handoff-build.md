# Manage Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. (This project's §38 rule: UI edits are executed INLINE by Fable; research fans out.)

**Goal:** Port Mike's Manage handoff into the real app: the control-room hub, the tournament page, Add a team, Event settings cards, the Rules cards, the pool controls, the organizer's bracket strip, plus the small fixes the recon surfaced — without any of the six behaviours that need database work.

**Architecture:** Vanilla-JS SPA (`public/app.js` template-literal builders, `public/pure.js` tested helpers, one `public/styles.css`). Every new surface is a builder that reads `state` and returns a string, repainted through `repaintManage()`; every write goes through the existing `tdb*` layer with read-back. New CSS is appended under one banner (`MANAGE DESIGN ROUND - 2026-08-25`) with PORT NOTEs. Tests are vm-sandbox string assertions (no DOM).

**Tech Stack:** vanilla JS, Supabase JS (PostgREST + SECURITY DEFINER RPCs), vitest, Vercel static.

**Spec:** `docs/superpowers/specs/2026-08-25-manage-handoff-design.md`

## Global Constraints

- `APP_VERSION` (`public/app.js` ~line 28) → `'2026.08.25.N'`, continuing from `.4` (Task 1 = `.5`).
- `node --check public/app.js && node --check public/pure.js` after every edit.
- Commit + push per task. Every commit chain gates on vitest's EXIT CODE:
  `(cd test && npx vitest run > "$TEMP/v.log" 2>&1; rc=$?; grep -E "×|→|Tests |Test Files" "$TEMP/v.log"; exit $rc) && git add -A && git commit -q -m "…" && git push -q`
  (the pre-push gate needs `run-gate.mjs`'s green marker; run it as the project's git pack instructs).
- No em dashes anywhere in emitted copy; never "night"/"tonight"; no neon; skill values never on a public builder; inputs stay 16px.
- No new `!important` except the documented iOS font-size / min-height counters, each with a PORT NOTE.
- `styles.css` is CRLF; source guards strip `/* */` comments, so PORT NOTEs may name banned strings.
- Prod runs the live August 2026 bracket: drives are read-only; never save a score; localhost boots against prod Supabase, so stub write legs in frames.
- The design files are at `docs/design-handoffs/2026-08-24/manage/design/` (`_rounds.css`, `_shared.css`, `_bracket-run.css`, `_motion-app.css`, `screens/*.html`). Line refs below are into those files and into `public/app.js` / `public/pure.js` / `public/styles.css` at `2e222ec`.
- Test harness for every new test: copy `test/manage-page.test.js:11-127` (`loadApp()` + `__bridge` epilogue) and add bridge entries as each task needs.

---

### Task 1: Foundations — field style, button restyle, vocabulary, C81, small guards

**Files:**
- Modify: `public/styles.css` (append a new banner block; one `!important` removed at ~885)
- Modify: `public/app.js` (`mgBracketSideName` ~10451, `mgBracketLiveHTML` ~10514, `mgPoolsScheduleHTML` ~9929, `buildMgScoreSheetHTML` ~10120, `openQrModal` + Copy URL ~12040-12095)
- Modify: `public/index.html:85`
- Modify: `test/manage-page.test.js` (~1265, ~1305, ~1360 "Grand final"/"already final" strings), `test/motion-port.test.js` (~44 allow-list)
- Create: `test/manage-round.test.js`

**Interfaces:**
- Produces: `checkinKioskUrl()` in app.js (returns `location.origin + '/checkin.html'`).
- Produces: Manage bracket vocabulary: `mgBracketSideName` returns `'Championship'` / `'Winners semifinal'` / `'Losers semifinal'` / `'Winners bracket'` / `'Losers bracket'`.

- [ ] **Step 1: Write the failing tests** — create `test/manage-round.test.js` with the harness and these cases:

```js
describe('Task 1 foundations', () => {
  it('Manage bracket vocabulary: Championship and semifinals, never final', () => {
    const b = bridge; // seeded with an 8-team main bracket fixture (copy from manage-page.test.js ~1240)
    const html = b.buildBracket();
    expect(html).toContain('Championship · G');
    expect(html).toMatch(/Winners semifinal · G\d+/);
    expect(html).toMatch(/Losers semifinal · G\d+/);
    expect(html).not.toContain('Grand final');
    expect(html).not.toContain('bracket final');
    expect(html).not.toContain('already final');
  });
  it('the pools meta says games done', () => {
    expect(bridge.buildMgPools()).toMatch(/of \d+ games? done<\/p>/);
    expect(bridge.buildMgPools()).not.toMatch(/games? final<\/p>/);
  });
  it('C81: the QR encodes the current origin, never the dead host', () => {
    expect(appSrc).not.toContain('athletic-specimen-app.vercel.app');
    expect(appSrc).toContain("location.origin + '/checkin.html'");
    expect(indexSrc).not.toContain('vercel.app');
  });
  it('a scoreless final bracket game keeps the primary disabled until a point is entered', () => {
    const html = bridge.buildScoreSheet({ id: 'm1', phase: 'main', side: 'winners', round: 1, status: 'final',
      team_a_id: 't1', team_b_id: 't2', winner_team_id: 't1', score_a: null, score_b: null, tournament_id: 'x' });
    expect(html).toMatch(/class="mgv-scfinal" data-mgss="edit" disabled/);
  });
  it('the 08-05b field style and the 08-23 button restyle are in styles.css once', () => {
    expect(count(css, '#app-shell input.pk-fv:not(.mgv-sv)')).toBe(1);
    expect(count(css, '#player-edit-modal .pe-save')).toBeGreaterThanOrEqual(1);
    expect(css).toContain('@keyframes m-menu');
    expect(css).not.toMatch(/\.popup-edit-input\s*\{[^}]*!important/);
  });
});
```

(`count(s, needle)` = `s.split(needle).length - 1`; `css`, `appSrc`, `indexSrc` read via `readFileSync` with `\r\n` normalised to `\n`.)

- [ ] **Step 2: Run to verify it fails** — `cd test && npx vitest run manage-round` → 5 failures.

- [ ] **Step 3: Implement**

`public/app.js`:
- `mgBracketSideName` (~10451):
  ```js
  function mgBracketSideName(g, maxRounds) {
    if (g.side === 'grand_final') return 'Championship';
    const base = g.side === 'winners' ? 'Winners' : 'Losers';
    return (g.round >= ((maxRounds || {})[g.side] || 0)) ? base + ' semifinal' : base + ' bracket';
  }
  ```
- `mgBracketLiveHTML` ~10514: `already final` → `already done`.
- `mgPoolsScheduleHTML` ~9929: `game${total === 1 ? '' : 's'} final` → `game${total === 1 ? '' : 's'} done`.
- `buildMgScoreSheetHTML` ~10120: `const canFinal = match.phase === 'main' ? (!!pick && !(a === b && a > 0) && !(isFinal && a === 0 && b === 0)) : a !== b;`
- Add next to `openQrModal` (~12040): `function checkinKioskUrl() { return location.origin + '/checkin.html'; }`; use it for the QRCode `text` (~12048) and the Copy URL string (~12082); in `openQrModal` set `document.getElementById('qrModalUrl').textContent = checkinKioskUrl()` (null-guarded). `index.html:85` → `<div class="qr-modal-url" id="qrModalUrl"></div>`.
- `APP_VERSION = '2026.08.25.5'`.

`public/styles.css` (append, new banner `/* ===== MANAGE DESIGN ROUND - 2026-08-25 (Mike's Claude Design handoff, "Manage") ===== */`):
- Port `_rounds.css:1592-1623` verbatim (omit 1624-1625, already live at 3653-3660). PORT NOTE: app-wide field style, Mike 2026-08-05b.
- Port `_rounds.css:2161-2246` with substitutions: `.mgs-cta` → `#mgss-sheet .mgv-scfinal`; `.mgs-b` → `#mgss-sheet .mgv-scb`; drop `.mgv-modebtn`, `.mgv-picked`, `.mgv-tn.is-sel`, `.mgv-trow.is-active` (the last is the retired chooser); keep `.mtv-obtn`, `#player-edit-modal .pe-save/.pe-cancel`, `#team-pay-modal .mgv-tpay`, `.pd-bk-chip`, and the `.mgh-*` members (they match nothing until Task 2 and are harmless).
- Remove `!important` from `.popup-edit-input { padding: 10px 12px !important; }` at ~885 (the scoped 3414 rule then wins; update the PORT NOTE at 3405-3409 to say it is resolved).
- Add `@keyframes m-menu { from { opacity: 0; transform: scaleY(.88) translateY(-6px) } }` beside the other keyframes (~4656-4669).
- `test/motion-port.test.js` ~44: widen the m-rise allow-list to include `.mgh-pick`.

- [ ] **Step 4: Run all tests** — `cd test && npx vitest run` → update `manage-page.test.js` ~1265/~1305/~1360 to the new strings (`Championship · G6`, `already done`); expect green.

- [ ] **Step 5: Commit + push** — `feat(manage): foundations - field style, button restyle, Championship vocabulary on Manage, QR derives from origin (C81), scoreless-final guard - v2026.08.25.5`

---

### Task 2: The Manage hub

**Files:**
- Modify: `public/pure.js` (replace `manageNeedsYouModel` 1642-1676; add `manageHubPhaseIndex`; export both)
- Modify: `public/app.js` (module vars ~7004; `buildManagePageHTML` 7230-7273; `mgSwitcherCardHTML` 7164 retired; `mgRowHTML` 7223; `manageContainerHTML` 7375-7390; `buildMgTournamentListHTML` 8319-8342 + `mgtlRowHTML` + `MGTL_NEW_ROW_HTML` retired; New-tournament back button ~8372; `mgPickTournament` 8623-8642; `saveLocal` 5139-5163 + its loader; the Manage click delegate ~11800-11930; area-entry loads ~12008-12025)
- Modify: `public/styles.css` (append `_rounds.css:1106-1518` with substitutions; retire 4088-4192)
- Modify: `test/manage-page.test.js` (~208-248), `test/tournament-switcher.test.js` (container assertions), `test/tournament-picker.test.js` (re-point), `test/manage-round.test.js`

**Interfaces:**
- Produces (pure.js): `manageHubPhaseIndex(t, todayStr)` → 0..5; `manageNeedsYouModel(ctx)` where `ctx = { t, teams, pickupDays, pools, matches, tournaments, scope, venueLoaded }` → `[{ id, title, sub, verb, kind:'jump'|'fix', target:{ area?, view?, matchId? } }]`.
- Produces (app.js): `mgHubScopeHTML(t)`, `mgHubPickerHTML(t)`, `mgHubTrackHTML(t)` (shared with Task 4), `mgHubActsHTML(t)`, `mgNeedsRowsHTML(items, headLabel)` (shared with Task 4), `mgHubStateChip(text, warn)`; module vars `mgHubPickerOpen`, `mgHubDoneText`.

- [ ] **Step 1: Write the failing tests**

```js
describe('Task 2 hub', () => {
  it('phase index', () => {
    const p = bridge.phaseIndex;
    expect(p({ status: 'setup', registration_open: false }, '2026-08-20')).toBe(0);
    expect(p({ status: 'setup', registration_open: true }, '2026-08-20')).toBe(1);
    expect(p({ status: 'setup', registration_open: false, event_date: '2026-08-22' }, '2026-08-22')).toBe(2);
    expect(p({ status: 'pools' }, '2026-08-22')).toBe(3);
    expect(p({ status: 'bracket' }, '2026-08-22')).toBe(4);
    expect(p({ status: 'completed' }, '2026-08-22')).toBe(5);
  });
  it('needs-you model, hub scope, order and copy', () => {
    const items = bridge.needsYou({ t: { id: 'a', status: 'setup', registration_open: false, buy_in: '', rules: '', venue: '' },
      teams: [{ name: 'Block Party', paid: false }, { name: 'Dig Deep', paid: false }, { name: 'X', paid: true }],
      pickupDays: [], pools: [], matches: [], tournaments: [{ id: 'old', status: 'completed', rules: '## Format\n- 4s' }], scope: 'hub', venueLoaded: true });
    expect(items.map((i) => i.id)).toEqual(['signups', 'unpaid', 'pools', 'venue', 'fee', 'rules', 'venmo', 'noday']);
    expect(items[1].title).toBe("2 of 3 teams haven't paid");
    expect(items[1].sub).toBe('Block Party · Dig Deep, the other 1 is paid');
    expect(items[5].verb).toBe('Reuse');
    items.forEach((i) => { expect(i.title + i.sub).not.toMatch(/—|&mdash;|night/i); });
  });
  it('tournament scope drops the club-level items and a finished tournament lists none', () => {
    const items = bridge.needsYou({ t: { id: 'a', status: 'completed' }, teams: [], pickupDays: [], pools: [], matches: [], tournaments: [], scope: 'tournament', venueLoaded: true });
    expect(items).toEqual([]);
  });
  it('the hub: title block, picker, track, actions, chips; no card, no h1', () => {
    seedHub(bridge, { status: 'setup', registration_open: true, name: 'August 2026 Tournament', event_date: '2026-08-22' });
    const html = bridge.buildManage();
    expect(html).toContain('class="mgh-eyebrow">Manage<');
    expect(html).toContain('class="mgh-tname">August 2026 Tournament<');
    expect(html).toContain('class="mgh-meta">');
    expect(html).toContain('class="mgh-pick"');
    expect(count(html, 'class="mgh-step')).toBe(6);
    expect(count(html, 'is-now')).toBe(1);
    expect(html).toContain('<span>Close registration</span>');
    expect(html).toContain('<span>Add a team</span>');
    expect(html).toContain('>This tournament<');
    expect(html).toContain('>Everything<');
    expect(html).toContain('Casual games between tournaments');
    expect(html).not.toContain('mg-h1');
    expect(html).not.toContain('mgv-tsw');
    expect(html).not.toContain('mgh-undo');
    expect(html).not.toContain('mgh-state');
    expect(html).not.toMatch(/—|&mdash;|night/i);
    for (const a of ['tournament', 'pickup', 'checkin', 'players', 'teams', 'admins']) expect(count(html, `data-mg-area="${a}"`)).toBe(1);
  });
  it('chips never print unloaded data', () => {
    seedHub(bridge, { status: 'setup', registration_open: true, name: 'A' }, { seats: null });
    const html = bridge.buildManage();
    expect(html).not.toMatch(/\d+ seats?</);
  });
});
```

- [ ] **Step 2: Run** → failures.

- [ ] **Step 3: Implement — pure.js**

```js
// The hub's six-step track (Manage handoff 08-23). Check-in is the day itself: the only tournament fact
// the schema carries for it is event_date (0057, applied). todayStr is 'YYYY-MM-DD' (local), passed in.
function manageHubPhaseIndex(t, todayStr) {
  if (!t) return 0;
  if (t.status === 'completed') return 5;
  if (t.status === 'bracket') return 4;
  if (t.status === 'pools') return 3;
  const ed = t.event_date ? String(t.event_date).slice(0, 10) : '';
  if (ed && todayStr && ed === String(todayStr).slice(0, 10)) return 2;
  return t.registration_open ? 1 : 0;
}
const MANAGE_HUB_STEPS = ['Setup', 'Sign-ups', 'Check-in', 'Pools', 'Bracket', 'Done'];

// Needs you (Manage handoff 08-23/08-24). Every item is backed by a loaded column; nothing here invents a
// minute, a check-in or a pool count. kind 'jump' = a neutral-ring verb that navigates; 'fix' = an accent
// verb that writes (only the registration flip and the rules reuse do). scope 'hub' adds the club-level
// items (venmo, noday); scope 'tournament' is the tournament page's list. A finished tournament lists no
// tournament-scoped item.
function manageNeedsYouModel(ctx) {
  const c = ctx || {};
  const t = c.t || {};
  const teams = Array.isArray(c.teams) ? c.teams : [];
  const days = Array.isArray(c.pickupDays) ? c.pickupDays : [];
  const pools = Array.isArray(c.pools) ? c.pools : [];
  const matches = Array.isArray(c.matches) ? c.matches : [];
  const all = Array.isArray(c.tournaments) ? c.tournaments : [];
  const scope = c.scope === 'tournament' ? 'tournament' : 'hub';
  const items = [];
  const finished = t.status === 'completed';
  const nm = (x) => (x && x.name) ? String(x.name) : 'Team';
  if (!finished && t.id) {
    if (t.status === 'setup' && !t.registration_open) {
      items.push({ id: 'signups', title: "Sign-ups aren't open", sub: 'Nothing is public until you open them', verb: 'Open', kind: 'fix', target: { action: 'regopen' } });
    }
    const unpaid = teams.filter((tm) => tm && !tm.paid);
    if (unpaid.length) {
      const paid = teams.length - unpaid.length;
      items.push({ id: 'unpaid', title: unpaid.length + ' of ' + teams.length + ' team' + (teams.length === 1 ? '' : 's') + (unpaid.length === 1 ? " hasn't" : " haven't") + ' paid',
        sub: unpaid.map(nm).join(' · ') + (paid ? ', the other ' + paid + (paid === 1 ? ' is' : ' are') + ' paid' : ', none are paid yet'),
        verb: 'See who paid', kind: 'jump', target: { view: 'teams' } });
    }
    if (t.status === 'setup' && teams.length >= 2 && !pools.length) {
      items.push({ id: 'pools', title: "Pools aren't drawn", sub: teams.length + ' teams in, drawing takes a second', verb: 'Draw', kind: 'jump', target: { view: 'pools' } });
    }
    if (c.venueLoaded && !(t.venue && String(t.venue).trim())) {
      items.push({ id: 'venue', title: "Venue isn't set", sub: 'Players get no address and no directions', verb: 'Set', kind: 'jump', target: { view: 'settings' } });
    }
    if (!(t.buy_in && String(t.buy_in).trim())) {
      items.push({ id: 'fee', title: "Entry fee isn't set", sub: 'Registration cannot take payment without it', verb: 'Set', kind: 'jump', target: { view: 'settings' } });
    }
    if (!(t.rules && String(t.rules).trim())) {
      const prior = all.filter((x) => x && x.id !== t.id && x.rules && String(x.rules).trim())
        .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0];
      items.push(prior
        ? { id: 'rules', title: 'No rules posted', sub: (prior.name || 'The last tournament') + "'s rules can be reused as they are", verb: 'Reuse', kind: 'fix', target: { action: 'reuserules', from: prior.id } }
        : { id: 'rules', title: 'No rules posted', sub: 'Players read them on the Rules page', verb: 'Write', kind: 'jump', target: { view: 'rules' } });
    }
    const silent = matches.find((m) => m && m.status === 'live' && !(Number(m.score_a) > 0 || Number(m.score_b) > 0) && m.net != null);
    if (silent) {
      items.push({ id: 'silent', title: 'Net ' + silent.net + ' has no score', sub: (silent.queue_order ? 'G' + silent.queue_order + ' is on' : 'A game is on') + ' and nothing is entered', verb: 'Enter', kind: 'jump', target: { matchId: silent.id } });
    }
  }
  if (scope === 'hub') {
    const venmo = t.venmo_link == null ? '' : String(t.venmo_link).trim();
    if (t.registration_open && !venmo) items.push({ id: 'venmo', title: 'Add the Venmo link', sub: 'The register page\'s pay button says "coming soon"', verb: 'Add', kind: 'jump', target: { view: 'registration' } });
    if (!days.length) items.push({ id: 'noday', title: 'No pickup day set', sub: 'The Check In tab stays hidden until one exists', verb: 'Add', kind: 'jump', target: { area: 'pickup' } });
  }
  return items;
}
```
Export `manageHubPhaseIndex`, `MANAGE_HUB_STEPS` (keep `manageNeedsYouModel` exported). Update `test/pure.test.js`'s existing `manageNeedsYouModel` cases to the new signature (`{ t, teams, pickupDays, scope:'hub' }`) — the three old kinds map to `venmo`/`unpaid`/`noday`.

- [ ] **Step 4: Implement — app.js**

Module vars (near `mgTournamentPinned`, ~7004): `let mgHubPickerOpen = false; let mgHubDoneText = '';`

`manageNeedsYou()` (7082) → 
```js
function manageNeedsYouCtx(scope) {
  const t = mgActiveTournament();
  const loaded = t && state.activeTournamentId === t.id;
  return { t, teams: loaded ? (state.tournamentTeams || []) : [], pickupDays: manageUpcomingPickupDays(),
    pools: loaded && Array.isArray(state.tournamentPools) ? state.tournamentPools : [],
    matches: loaded && Array.isArray(state.tournamentMatches) ? state.tournamentMatches : [],
    tournaments: state.tournaments || [], scope, venueLoaded: tournamentHasVenue() };
}
function manageNeedsYou() { return manageNeedsYouModel(manageNeedsYouCtx('hub')); }
```

New builders (replace `mgSwitcherCardHTML`):
```js
function mgLocalTodayStr() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function mgHubMetaHTML(t) {
  const phase = mgTournamentPhase(t);
  const off = phase === 'setup' || phase === 'finished';
  return [
    tournamentHasEventDate() ? escapeHTML(mgEventDateLabel(t.event_date)) : '',
    phase ? `<b${off ? ' class="is-off"' : ''}>${escapeHTML(phase === 'setup' ? 'not open yet' : MGT_PHASE_SENTENCE[phase])}</b>` : '',
    escapeHTML(mgTeamsClause(t)),
  ].filter(Boolean).join(' · ');
}
function mgHubPickerHTML(t) {
  const list = mgTournamentPickerList();
  const activeId = t ? String(t.id) : '';
  const row = (x) => {
    const phase = mgTournamentPhase(x);
    const sub = phase === 'finished' ? mgtlFinishedSub(x) : mgtlSeasonSub(x);
    return `<button type="button" class="mgh-prow${String(x.id) === activeId ? ' is-on' : ''}" data-mgp-pick="${escapeHTMLText(String(x.id))}">`
      + `<span class="mgh-pb"><span class="mgh-pn">${escapeHTML(x.name || 'Tournament')}</span>${sub ? `<span class="mgh-ps">${escapeHTML(sub)}</span>` : ''}</span>`
      + (phase ? `<span class="mgh-pstate">${escapeHTML(MGT_PHASE_WORD[phase])}</span>` : '') + `</button>`;
  };
  const grp = (label, rows) => rows.length ? `<div class="mgh-pgrp">${label}</div>` + rows.map(row).join('') : '';
  return `<div class="mgh-pick" data-mgp-panel${mgHubPickerOpen ? '' : ' hidden'}>`
    + grp('This season', list.filter((x) => mgTournamentPhase(x) !== 'finished'))
    + grp('Finished', list.filter((x) => mgTournamentPhase(x) === 'finished'))
    + `<button type="button" class="mgh-pnew" data-mgtl-new><span class="mgh-pnewic">${MGV_PLUS_SVG}</span>New tournament</button>`
    + `<p class="mgh-pnote">Everything in Manage edits the one you pick. Finished tournaments stay open so you can fix a score after the fact.</p></div>`;
}
function mgHubScopeHTML(t) {
  const name = t ? (t.name || 'Tournament') : 'No tournament yet';
  return `<div class="mgh-scope"><div class="mgh-eyebrow">Manage</div>`
    + `<img class="mgh-mark" src="/logo-mark.png" alt="" aria-hidden="true" />`
    + `<button type="button" class="mgh-title" data-mgp-toggle aria-expanded="${mgHubPickerOpen ? 'true' : 'false'}"><span class="mgh-tname">${escapeHTML(name)}</span>${MGV_CHEVDOWN_SVG.replace('<svg ', '<svg class="mgh-car" ')}</button>`
    + (t ? `<div class="mgh-meta">${mgHubMetaHTML(t)}</div>` : '')
    + mgHubPickerHTML(t) + `</div>`;
}
function mgHubTrackHTML(t) {
  const now = manageHubPhaseIndex(t, mgLocalTodayStr());
  return `<div class="mgh-track" aria-label="Where this tournament is">`
    + MANAGE_HUB_STEPS.map((s, i) => `<span class="mgh-step${i < now ? ' is-done' : (i === now ? ' is-now' : '')}">${s}</span>`).join('') + `</div>`;
}
function mgHubActsHTML(t) {
  if (!t) return '';
  let primary = '';
  if (t.status === 'setup') primary = t.registration_open
    ? `<button type="button" class="mgh-act is-primary" data-mgh-reg="close"><span>Close registration</span></button>`
    : `<button type="button" class="mgh-act is-primary" data-mgh-reg="open"><span>Open registration</span></button>`;
  else if (t.status === 'pools' || t.status === 'bracket') primary = `<button type="button" class="mgh-act is-primary" data-mgt-view="pools"><span>Open score sheet</span></button>`;
  const done = mgHubDoneText
    ? `<div class="mgh-done is-under">${MGH_TICK_SVG}<span class="mgh-donetxt">${escapeHTML(mgHubDoneText)}</span></div>` : '';
  return `<div class="mgh-acts"><div class="mgh-face">${primary}<button type="button" class="mgh-act" data-mgt-view="teamadd"><span>Add a team</span></button></div>${done}`
    + `<p class="mgr-status" id="mgh-status" role="status" aria-live="polite"></p></div>`;
}
const MGH_TICK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
function mgNeedsRowsHTML(items, headLabel) {
  if (!items.length) return '';
  const hook = (it) => it.target.view ? ` data-mgt-view="${it.target.view}"` : it.target.area ? ` data-mg-area="${it.target.area}"`
    : it.target.matchId ? ` data-mgh-score="${escapeHTMLText(String(it.target.matchId))}"` : ` data-mgh-fix="${it.target.action}"${it.target.from ? ` data-mgh-from="${escapeHTMLText(String(it.target.from))}"` : ''}`;
  return `<div class="pl-sect mgh-sect is-attn">${headLabel}<span class="mgh-sectn">${items.length}</span></div>`
    + items.map((it) => `<div class="mg-row mgh-nrow"><div class="mgh-face">`
      + `<button type="button" class="mgh-nbody"${hook(it)}><span class="mgh-nn">${it.title}</span><span class="mgh-ns">${escapeHTML(it.sub)}</span></button>`
      + `<button type="button" class="mgh-nact${it.kind === 'jump' ? ' is-go' : ''}"${hook(it)}><span>${it.verb}</span></button></div></div>`).join('');
}
function mgHubStateChip(text, warn) { return text ? `<span class="mgv-rmeta${warn ? ' is-warn' : ''}">${escapeHTML(text)}</span>` : ''; }
function mgRowHTML(area, name, subHTML, chipHTML) {
  return `<a class="mg-row${area === 'tournament' ? ' mgh-trow' : ''}" data-mg-area="${area}">
      <div class="mg-rb"><div class="mg-rn">${name}</div><div class="mg-rs">${subHTML}</div></div>
      ${chipHTML || ''}${MG_CHEV}
    </a>`;
}
```
`buildManagePageHTML`:
```js
function buildManagePageHTML() {
  const t = mgActiveTournament();
  const needs = manageNeedsYou();
  const setupHead = t && t.status === 'setup' && !t.registration_open;
  const stage = t ? mgTournamentRowStage(t) : '';
  const stageChip = { 'pools not drawn': ['Pools not drawn', true], 'pools drawn': ['Pools drawn', false], 'pool play running': ['Pools live', false], 'bracket running': ['Bracket live', false], finished: ['Finished', false] }[stage]
    || (t && t.status === 'setup' && !t.registration_open ? ['Not open yet', true] : null);
  const days = manageUpcomingPickupDays();
  const pickupChip = days.length ? (days.length === 1 ? 'Next up ' + formatSessionDate(days[0].day || days[0].date) : days.length + ' scheduled') : 'None yet';
  const today = mgLocalTodayStr();
  const ed = t && tournamentHasEventDate() && t.event_date ? String(t.event_date).slice(0, 10) : '';
  const checkinChip = ed ? (ed === today ? 'Today' : (ed > today ? 'Opens ' + mgEventDateLabel(ed).split(' ')[0] : '')) : '';
  const roster = (state.players || []).length;
  const teamsClause = t ? mgTeamsClause(t) : '';
  const teamsChip = teamsClause ? teamsClause.replace(/ teams?$/, (m) => (/ of /.test(teamsClause) ? '' : m)) : (t ? 'None yet' : '');
  const seatsChip = Array.isArray(mgSeats) ? mgSeats.filter((s) => s && s.filled).length + ' seats' : '';
  const rows = `<div class="pl-sect mgh-sect">This tournament</div>`
    + mgRowHTML('tournament', 'Tournament', t ? 'Registration, teams, pools, bracket' : 'No tournament yet', stageChip ? mgHubStateChip(stageChip[0], stageChip[1]) : '')
    + `<div class="pl-sect mgh-sect">Everything</div>`
    + mgRowHTML('pickup', 'Pickup days', 'Casual games between tournaments', mgHubStateChip(pickupChip))
    + mgRowHTML('checkin', 'Check-in', 'Tap names as people arrive', mgHubStateChip(checkinChip))
    + mgRowHTML('players', 'Players', 'The roster everyone is picked from', mgHubStateChip(roster + ' on file'))
    + mgRowHTML('teams', 'Teams', 'Who is playing with who', mgHubStateChip(teamsChip))
    + mgRowHTML('admins', 'Admins', 'Seats &amp; activity log', mgHubStateChip(seatsChip));
  return mgHubScopeHTML(t) + (t ? mgHubTrackHTML(t) : '') + mgHubActsHTML(t)
    + mgNeedsRowsHTML(needs, setupHead ? 'Before you open' : 'Needs you') + rows;
}
```
(Check the exact shape of `mgSeats` rows in `buildMgSeatsHTML` ~7445 before writing the seats filter; print nothing when the shape does not carry a filled flag.)

Retire: `mgSwitcherCardHTML`, `buildMgTournamentListHTML`, `mgtlRowHTML`, `MGTL_NEW_ROW_HTML`, the `manageView === 'tournaments'` branch (7386), the `data-mgtl-back` handler and the `tournaments` area entry (~12008). Keep `mgTournamentPickerList`, `mgtlSeasonSub`, `mgtlFinishedSub`. New-tournament back button (~8372): `data-mgtl-back` → `data-mg-area="lead"`. Hub first paint: in the `data-mg-area="lead"` entry path (and boot), call `loadTournamentHistory()` once if `state.tournamentHistory` is not an array.

Delegates (Manage click delegate, BEFORE the `manageView === 'tournament'` block):
- `[data-mgp-toggle]` → `mgHubPickerOpen = !mgHubPickerOpen; repaintManage();`
- `[data-mgp-pick]` → `mgHubPickerOpen = false; mgPickTournament(id)` (remove `manageView = 'lead'` from `mgPickTournament` since the hub is already the view; keep `mgtView = null`).
- a tap anywhere else while open → `mgHubPickerOpen = false; repaintManage()` (do this at the top of the delegate when the target is not inside `[data-mgp-panel]`/`[data-mgp-toggle]`); Escape keydown does the same.
- `[data-mgh-reg]` → `mgHubFlipRegistration(open)`: `tdbSetTournamentFields(t.id, { registration_open })` + `mgVerifyTournamentFields` read-back (copy `mgrToggleRegistration` 8923-8937 with the status target `#mgh-status`), on success `mgHubDoneText = open ? 'Registration is open' : 'Registration closed'`, repaint, clear `mgHubDoneText` on the next navigation.
- `[data-mgh-fix="reuserules"]` → `tdbSetTournamentFields(t.id, { rules: from.rules })` + read-back; `mgHubDoneText = 'Rules reused from ' + from.name`; repaint. `[data-mgh-fix="regopen"]` → the flip.
- `[data-mgh-score]` → `openMgScoreSheet(match)` for that id.
- Cross-area: `[data-mgt-view]` when `manageView !== 'tournament'` → `manageView = 'tournament'; mgtView = view; mgSyncActiveTournament(); repaintManage(); scrollTop 0`.
- `[data-mgtl-new]` from the hub already routes to `tournament-new` — keep.

Persistence: in `saveLocal` add `mgActiveTournamentId: state.activeTournamentId, mgTournamentPinned` (only when pinned); in the loader, if a stored id exists in `state.tournaments` after the first list load, adopt it + pin, else ignore.

`APP_VERSION = '2026.08.25.6'`.

- [ ] **Step 5: CSS** — append `_rounds.css:1106-1518` verbatim with: `.mgh-state` rules (1461-1473) rewritten onto `.mgv-rmeta` (add `.mgv-rmeta.is-warn { color: oklch(0.50 0.11 70) }` and `@media (max-width:380px) { .mg-row .mgv-rmeta { display: none } }`); drop `.mgh-undo` rules (1405-1418 keep `.mgh-done.is-under`); `#tab-manage .mgh-sect` block (1250-1281) NOT ported (`.pl-sect` is live) except `.mgh-sectn` (1290-1302); add `.mgh-scope > .mgh-mark` from `_shared.css:703-716`; add the motion rules `.mgh-done:not([hidden]) { animation: m-tick var(--m-state) var(--e-press) backwards }`, `body.m-enter .mgh-pick:not([hidden]) { animation: m-menu var(--m-surface) var(--e-arrive) backwards; transform-origin: top center }`, `body.m-enter .mgh-pick:not([hidden]) > * { animation: m-rise var(--m-elem) var(--e-settle) backwards }`. Retire `styles.css:4088-4192` (the `.mgv-tsw*/.mgv-tcap/.mgv-tnew*/.mgv-trow/.mgv-tdot/.mgv-tnote` block) — delete it, with a one-line PORT NOTE where it was.

- [ ] **Step 6: Tests** — rewrite `manage-page.test.js:208-248` to the new assertions; `tournament-switcher.test.js`: keep 220-293 (pure meta) verbatim, re-point 150-212/302-323/347-381 to `.mgh-tname` / `.mgh-meta` / `.mgv-rmeta` chip text / the new CSS block; `tournament-picker.test.js`: replace `paint()` with `buildManagePageHTML()` and re-point its five invariants at `.mgh-prow`, `.is-on` (exactly one), `.mgh-pstate`, the `mgtlFinishedSub` source and the unloaded-data guard; keep the exported-symbol guard minus `mgSwitcherCardHTML`. Run the suite green.

- [ ] **Step 7: Commit + push** — `feat(manage): the control-room hub - tournament as the title with an inline picker, phase track, quick actions, Needs-you fixes, state chips; the chooser screen retires; the pick persists - v2026.08.25.6`

---

### Task 3: The "On the nets" strip

**Files:**
- Modify: `public/app.js` (new `mgHubLiveStripHTML(t)`; `buildManagePageHTML` inserts it after the actions when `t.status` is pools/bracket)
- Modify: `public/styles.css` (port `_rounds.css:1420-1460` minus the `.mgh-lnm` duration column)
- Test: `test/manage-round.test.js`

**Interfaces:** Consumes `pickPoolCurrentGames(matches, netCount)` (pure.js ~967 — read it first and match its signature); `bracketGameNumbers` for bracket game ids.

- [ ] **Step 1: Test**
```js
it('the live strip lists every net, names the game on it, and prints no minutes', () => {
  seedHub(bridge, { status: 'pools', net_count: 2, name: 'A' }, { matches: [
    { id: 'm1', phase: 'pool', pool_id: 'p1', net: 1, status: 'live', score_a: 3, score_b: 1, team_a_id: 't1', team_b_id: 't2', queue_order: 4 },
    { id: 'm2', phase: 'pool', pool_id: 'p1', net: 2, status: 'scheduled', team_a_id: 't3', team_b_id: 't4', queue_order: 5 }],
    pools: [{ id: 'p1', label: 'A' }], teams: [{ id: 't1', name: 'Net Gains' }, { id: 't2', name: 'Block Party' }, { id: 't3', name: 'X' }, { id: 't4', name: 'Y' }] });
  const html = bridge.buildManage();
  expect(html).toContain('>On the nets<');
  expect(html).toContain('1 playing · 1 idle');
  expect(html).toContain('Net Gains vs Block Party');
  expect(html).toContain('Pool A · G4');
  expect(html).toContain('G5 can start');
  expect(html).not.toMatch(/\d+ min</);
  expect(html).not.toContain('checked in');
});
```
- [ ] **Step 2: Implement**
```js
function mgHubLiveStripHTML(t) {
  if (!t || (t.status !== 'pools' && t.status !== 'bracket')) return '';
  const teams = state.tournamentTeams || []; const pools = state.tournamentPools || [];
  const matches = (state.tournamentMatches || []).filter((m) => m && m.team_a_id && m.team_b_id);
  const nets = Number(t.net_count) > 0 ? Number(t.net_count) : 0;
  if (!nets) return '';
  const main = matches.filter((m) => m.phase === 'main');
  const gn = main.length ? bracketGameNumbers(main).byId : {};
  const ctx = (m) => {
    const g = m.phase === 'main' ? ('G' + (gn[m.id] || '')) : ('G' + (m.queue_order || ''));
    const where = m.phase === 'main' ? (m.side === 'grand_final' ? 'Championship' : (m.side === 'losers' ? 'Losers' : 'Winners')) : ('Pool ' + ((pools.find((p) => p.id === m.pool_id) || {}).label || ''));
    return where + ' · ' + g;
  };
  const live = matches.filter((m) => m.status === 'live' && m.net != null);
  const queued = matches.filter((m) => m.status !== 'final' && m.status !== 'live').sort((a, b) => (a.queue_order || 0) - (b.queue_order || 0));
  const playing = new Set(live.map((m) => Number(m.net))).size;
  const rows = [];
  for (let n = 1; n <= nets; n++) {
    const m = live.find((x) => Number(x.net) === n);
    if (m) {
      const silent = !(Number(m.score_a) > 0 || Number(m.score_b) > 0);
      rows.push(`<div class="mgh-lnet${silent ? ' is-late' : ''}"><span class="mgh-lnn">${n}</span><span class="mgh-lnb"><span class="mgh-lnt">${escapeHTML(teamNameById(teams, m.team_a_id))} vs ${escapeHTML(teamNameById(teams, m.team_b_id))}</span><span class="mgh-lns">${escapeHTML(ctx(m))}${silent ? ' · no score yet' : ''}</span></span></div>`);
    } else {
      const next = queued.find((x) => Number(x.net) === n) || null;
      rows.push(`<div class="mgh-lnet is-idle"><span class="mgh-lnn">${n}</span><span class="mgh-lnb"><span class="mgh-lnt">Idle</span><span class="mgh-lns">${next ? escapeHTML((next.phase === 'main' ? 'G' + (gn[next.id] || '') : 'G' + (next.queue_order || '')) + ' can start') : 'Nothing queued'}</span></span></div>`);
    }
  }
  return `<div class="mgh-live"><div class="mgh-livehd"><span>On the nets</span><span class="mgh-liveq">${playing} playing · ${nets - playing} idle</span></div>${rows.join('')}</div>`;
}
```
(If `pickPoolCurrentGames` already answers "next on net n" in a rounds-aware way, use it instead of the naive `queued.find` — read pure.js:967-982 first; C77 wants it called.)
- [ ] **Step 3: CSS** — port `_rounds.css:1420-1460` omitting `.mgh-lnm`; `.is-late` washes `.mgh-lns` only.
- [ ] **Step 4: Run, commit + push** — `feat(manage): the game-day On the nets strip, the honest subset - v2026.08.25.7`

---

### Task 4: Manage › Tournament

**Files:**
- Modify: `public/app.js` (`buildManageTournamentHTML` 8424-8524; `MGT_SUB_TITLES` 8224 — registration title; `buildMgRegistrationHTML` 8533 title + status seed; `mgSyncSaveButton` ~8780 writes the status text; `appPrompt` 6115-6140 `danger` flag; `mgTournamentDelete` ~10697 passes it; the `[data-mgt-view]` delegate: `editor` → `openManageEditor('announcement')`, `scoresheet` → `pools`)
- Modify: `public/styles.css` (port `_rounds.css:2247-2305`; `.kc-confirm.mgv-del` already live at 3510)
- Modify: `test/manage-page.test.js` (~683-703, ~722), `test/tournament-create.test.js:685-686`, `test/tournament-stage.test.js` (the `.mgt-stage` line), `test/manage-round.test.js`

- [ ] **Step 1: Tests**
```js
it('the tournament page: when-line, track, four tiles, scoped needs, grouped rows, note, danger last', () => {
  seedHub(bridge, { status: 'setup', registration_open: true, name: 'August 2026 Tournament', event_date: '2026-08-22', venue: 'Washington Park', team_size: 4, buy_in: '$80 a team', net_count: 3, team_cap: 12 },
    { teams: [{ id: 't1', name: 'Block Party', paid: false }, { id: 't2', name: 'X', paid: true }] });
  const html = bridge.buildTournament();
  expect(html).toContain('class="tv-when"><b>Sat Aug 22</b> · Washington Park · 4s co-ed · $80 a team<');
  expect(html).not.toContain('10:00');
  expect(count(html, 'class="mgh-step')).toBe(6);
  expect(html).toMatch(/class="tv-stat[^"]*"><span class="tv-sn">2<small>\/12<\/small><\/span><span class="tv-sl">Teams in</);
  expect(html).toContain('<span class="tv-sn">1<small>/2</small></span><span class="tv-sl">Paid</span>');
  expect(html).toContain('<span class="tv-sn">3</span><span class="tv-sl">Nets</span>');
  expect(html).toContain('<span class="tv-sn">0</span><span class="tv-sl">Games</span>');
  expect(html).not.toContain('/18');
  for (const h of ['Sign-ups', 'Play', 'The event', 'After it ends']) expect(html).toContain(`>${h}<`);
  expect(html).toContain('Registration &amp; public page');
  expect(html).toContain('data-mgt-view="teamadd"');
  expect(html).not.toContain('data-mgt-view="scoresheet"'); // omitted before the draw
  expect(html).toContain('data-mgt-announce');
  expect(html).not.toContain('closes ');
  expect(html).toContain('12-team cap');
  expect(html).toContain('Everything on this page edits August 2026 Tournament only. Switch tournaments from the title on Manage.');
  expect(html.indexOf('data-mgtl-new')).toBeGreaterThan(html.indexOf('data-mgt-view="closeout"'));
  expect(html.indexOf('mgv-danger')).toBeGreaterThan(html.indexOf('data-mgtl-new'));
  expect(html).not.toContain('mgt-stage');
});
it('Player view renders only when the active tournament is the public one', () => { /* seed a pinned non-lead tournament; expect no data-nav-tab="tournament" row; seed the lead; expect it */ });
```
- [ ] **Step 2: Implement** `buildManageTournamentHTML` (keep the header, the empty branch, the `create` and `danger` strings verbatim):
```js
  const when = [
    tournamentHasEventDate() && mgEventDateLabel(t.event_date) ? `<b>${escapeHTML(mgEventDateLabel(t.event_date))}</b>` : '',
    tournamentHasVenue() && t.venue ? escapeHTML(String(t.venue)) : '',
    `${size}s co-ed`, buyIn ? escapeHTML(buyIn) : '',
  ].filter(Boolean).join(' · ');
  const paid = nTeams - unpaid;
  const cap = tournamentHasTeamCap() && Number(t.team_cap) > 0 ? Number(t.team_cap) : 0;
  const gamesDone = finalCt(matches), gamesTotal = matches.length;
  const tile = (n, label, cls) => `<div class="tv-stat${cls || ''}"><span class="tv-sn">${n}</span><span class="tv-sl">${label}</span></div>`;
  const stats = `<div class="tv-stats">`
    + tile(`${nTeams}${cap ? `<small>/${cap}</small>` : ''}`, 'Teams in')
    + tile(`${paid}<small>/${nTeams}</small>`, 'Paid', unpaid ? ' is-attn' : '')
    + tile(String(nets), 'Nets')
    + tile(gamesTotal ? `${gamesDone}<small>/${gamesTotal}</small>` : '0', 'Games', (t.status === 'pools' || t.status === 'bracket') ? ' is-live' : '')
    + `</div>`;
  const needs = mgNeedsRowsHTML(manageNeedsYouModel(manageNeedsYouCtx('tournament')), 'Needs you');
  const regSub = (t.registration_open ? `<span class="mgt-on">Open</span>` : 'Closed') + ' · what players see';
  const teamsSub2 = nTeams ? `${nTeams} registered · ${unpaid ? unpaid + ' unpaid' : 'all paid'} · rosters and buy-in` : 'No teams yet · rosters and buy-in';
  const drawSub = !pools.length ? `Not drawn · ${escapeHTML(mgPoolsDrawHint(nTeams, t.pool_count || Math.max(1, Math.round(nTeams / 6)), nets || 1))}` : poolsSub;
  const rulesSub2 = `${escapeHTML(mgRuleLine(scoringRulesFor('pool', t)))} · ${escapeHTML(mgRuleLine(scoringRulesFor('main', t)))}` + (rulesText ? ` · ${rulesSections ? plural(rulesSections, 'section') + ' live' : 'live'}` : ' · not written yet');
  const settingsSub2 = [`${size}s co-ed`, buyIn ? escapeHTML(buyIn) : '', cap ? `${cap}-team cap` : '', nets ? plural(nets, 'net') : ''].filter(Boolean).join(' · ');
  const showPlayerView = (publicLiveTournament() || {}).id === t.id;
  const rows2 = `<div class="pl-sect">Sign-ups</div>`
    + mgtRowHTML('registration', 'Registration &amp; public page', regSub, t.registration_open ? 'Open' : 'Closed')
    + mgtRowHTML('teams', 'Teams &amp; payment', teamsSub2, unpaid ? `${unpaid} unpaid` : (nTeams ? 'All paid' : ''))
    + mgtRowHTML('teamadd', 'Add a team', 'For the pair who paid you at the net')
    + `<div class="pl-sect">Play</div>`
    + mgtRowHTML('pools', 'Pools &amp; schedule', drawSub, poolsMeta)
    + (poolMatches.length ? mgtRowHTML('pools', 'Score sheet', 'Enter pool results as each game finishes') : '')
    + mgtRowHTML('bracket', 'Bracket &amp; scores', bracketSub, bracketMeta)
    + mgtRowHTML('rules', 'Rules sheet', rulesSub2)
    + `<div class="pl-sect">The event</div>`
    + mgtRowHTML('settings', 'Event settings', settingsSub2)
    + `<a class="mg-row" data-mgt-announce><div class="mg-rb"><div class="mg-rn">Announcement</div><div class="mg-rs">The note at the top of the public page</div></div>${MG_CHEV}</a>`
    + (showPlayerView ? `<a class="mg-row" data-nav-tab="tournament"><div class="mg-rb"><div class="mg-rn">Player view</div><div class="mg-rs">Open this tournament the way players see it</div></div>${MG_CHEV}</a>` : '')
    + `<div class="pl-sect">After it ends</div>`
    + mgtRowHTML('closeout', 'Close out', 'Crowns the champion and archives the event', t.status === 'completed' ? 'Done' : 'Not yet');
  const note = `<p class="tv-note">Everything on this page edits ${escapeHTML(t.name || 'this tournament')} only. Switch tournaments from the title on Manage.</p>`;
  return header + `<div class="tv-when">${when}</div>` + mgHubTrackHTML(t) + stats + needs + rows2 + create + note + danger;
```
(`mgPoolsDrawHint` signature: read ~9862 first; keep its clamp. The Score sheet row shares `data-mgt-view="pools"`.)
Delegates: `[data-mgt-announce]` → `openManageEditor('announcement')`. `appPrompt({ …, danger: true })` → `class="kc-confirm mgv-del"` on the confirm button; `mgTournamentDelete` passes `danger: true`. `MGT_SUB_TITLES.registration = 'Registration & public page'`; `buildMgRegistrationHTML` status renders `Saved`; `mgSyncSaveButton` sets the screen's `.mgr-status` text to `Unsaved changes` / `Saved` when it is not mid-write and not `.is-bad`. Remove `MGT_STAGE_SUBLINE` and the `.mgt-stage` line. `APP_VERSION = '2026.08.25.8'`.
- [ ] **Step 3: CSS** — port `_rounds.css:2247-2305` verbatim (`.tv-when/.tv-stats/.tv-stat/.tv-sn/.tv-sl/.tv-note/.is-attn/.is-live`).
- [ ] **Step 4: Tests** — `manage-page.test.js` 683-703/722 (row ids now include `teamadd`, the announce hook, no `mgt-stage`), `tournament-create.test.js:685-686` (holds: new < closeout is false → assert create AFTER closeout and BEFORE danger, unchanged), `tournament-stage.test.js` (drop the `.mgt-stage` assertion; assert the track instead). Green.
- [ ] **Step 5: Commit + push** — `feat(manage): the tournament page - when-line, phase track, four tiles, scoped Needs-you, rows grouped by question, Announcement and Player view rows, red Delete confirm - v2026.08.25.8`

---

### Task 5: Add a team

**Files:**
- Modify: `public/app.js` (new `buildMgTeamAddHTML()`; `buildManageTournamentContainerHTML` gains `teamadd`; `MGT_SUB_TITLES.teamadd = 'Add a team'`; `mgTeamAddSubmit()`; the Teams list's `.pk-add` (~9468) → `data-mgt-view="teamadd"`; delegates for `[data-mgta-save]`, the typeahead input/pick; retire `mgTeamAddPrompt` 9601-9614 and its `data-mgtp-add` handler)
- Modify: `public/styles.css` (port `_rounds.css:1519-1591`)
- Test: `test/manage-round.test.js`, `test/manage-page.test.js` (any `data-mgtp-add` assertion)

- [ ] **Step 1: Tests**
```js
it('Add a team: name, team_size rows, the paid switch, no log claim', () => {
  seedHub(bridge, { status: 'setup', registration_open: false, name: 'A', team_size: 4, buy_in: '$80 a team' });
  const html = bridge.mgtContainer('teamadd');
  expect(html).toContain('class="pd-htitle">Add a team<');
  expect(count(html, 'class="rf-pinput')).toBe(4);
  expect(html).toContain('4 per team');
  expect(html).toContain('data-mgta-paid');
  expect(html).toContain('$80 a team · no Venmo record for teams you add');
  expect(html).toContain('data-mgta-save');
  expect(html).not.toMatch(/activity log/i);
});
```
- [ ] **Step 2: Implement** — the builder on the `.rf-*` kit exactly as `screens/mgts-team-add.html:35` lays it out (`section.rf-page.mgv-taform` › `.rf-sect` "Team name" + `input.rf-tinput#mgta-name` › `.rf-plhead` "Players" + `.rf-plhint` "N per team · at least 1 guy + 1 girl" › N `.rf-prow.mgv-tarow` with `.rf-pnum` + `input.rf-pinput` placeholder "First and Last Name" + a `.mgv-tamenu` list under the focused row › `.rf-divlab` "Payment" › `.mgr-tog.mgv-tapay` "Marked paid" / the buy-in sentence + `button.mg-sw[data-mgta-paid][role=switch]` › `button.rf-cta[data-mgta-save]` "Add team" › `p.mgr-status#mgta-status`). Typeahead: on `input` in a `.rf-pinput`, filter `state.players` names (`playerDisplayName` or the field the Players screen uses) by prefix, render up to 6 `.mgv-taitem` buttons; tapping fills the input. Submit:
```js
async function mgTeamAddSubmit() {
  const t = mgActiveTournament(); if (!t) return;
  const name = (document.getElementById('mgta-name') || {}).value || '';
  const roster = [...document.querySelectorAll('#tab-manage .rf-pinput')].map((i) => i.value.trim()).filter(Boolean);
  const paid = (document.querySelector('[data-mgta-paid]') || {}).getAttribute && document.querySelector('[data-mgta-paid]').getAttribute('aria-checked') === 'true';
  const note = (msg, bad) => mgNoteStatus('mgta-status', msg, bad);
  if (!name.trim()) { note('Give the team a name first.', true); return; }
  note('Adding…');
  let team;
  try { team = await tdbAddTeam(t.id, name.trim()); } catch (e) { note('Could not add the team. ' + MG_SAVE_FAILED, true); return; }
  if (!team || !team.id) { note(MG_SAVE_FAILED, true); return; }
  if (roster.length) { try { await tdbSetTeamRoster(team.id, roster); } catch (e) { note('The team is in, but its roster did not save. Open it under Teams & payment to add the names.', true); await tdbRefreshTournaments(); return; } }
  if (paid) { try { await tdbSetTeamPaid(team.id, true); } catch (e) { note('The team is in, but it could not be marked paid. Open it under Teams & payment.', true); await tdbRefreshTournaments(); return; } }
  await tdbRefreshTournaments();
  mgtView = 'teams'; repaintManage();
}
```
(Read `tdbAddTeam` 2112-2130, `tdbSetTeamRoster` 2174-2181, `tdbSetTeamPaid` 2155-2159 and `mgNoteStatus` ~8765 for exact return shapes before wiring.) `APP_VERSION = '2026.08.25.9'`.
- [ ] **Step 3: CSS** — port `_rounds.css:1519-1591` verbatim.
- [ ] **Step 4: Run, commit + push** — `feat(manage): Add a team as a roster form with a Marked-paid switch - v2026.08.25.9`

---

### Task 6: Event settings cards

**Files:**
- Modify: `public/pure.js` (`settingsRuleSummary(t)`, exported)
- Modify: `public/app.js` (`buildMgSettingsHTML` 8964-9000; `mgSyncSaveButton` ~8780 status text — done in Task 4, verify)
- Modify: `public/styles.css` (port `_shared.css:206-297` authored as `input.set-in` etc. with `flex: none; min-width: auto`, `.set-in { font-size: 16px }`)
- Modify: `test/manage-page.test.js:1475,1484`, `test/tournament-venue.test.js` (ids unchanged; assert the "Where" card), `test/tournament-edit-save.test.js` (selector holds), `test/pure.test.js`, `test/manage-round.test.js`

- [ ] **Step 1: Tests**
```js
it('settingsRuleSummary', () => {
  const s = bridge.ruleSummary;
  expect(s({ pool_target: 15, pool_cap: 20, bracket_target: 21, bracket_cap: 25, win_by_2: true })).toBe('Pool to 15, cap 20 · bracket to 21, cap 25 · win by 2.');
  expect(s({ pool_target: 15, pool_cap: null, bracket_target: 21, bracket_cap: null, win_by_2: false })).toBe('Pool to 15 · bracket to 21.');
});
it('settings: four cards, every id kept, Where guarded, Saved at rest, the true intro', () => {
  seedHub(bridge, { status: 'setup', name: 'A', team_size: 4, net_count: 3, pool_target: 15, pool_cap: 20, bracket_target: 21, bracket_cap: 25, win_by_2: true, buy_in: '$80 a team', venue: 'P', venue_address: 'Q' });
  const html = bridge.buildSettings();
  for (const h of ['The basics', 'Scoring', 'Where', 'Money']) expect(html).toContain(`>${h}<`);
  for (const id of ['mges-name','mges-teamsize','mges-nets','mges-pooltarget','mges-poolcap','mges-brackettarget','mges-bracketcap','mges-buyin','mges-venue','mges-venueaddr']) expect(html).toContain(`id="${id}"`);
  expect(html).toContain('Scoring here sets the rule line on every score card.');
  expect(html).toContain('class="set-sum">Pool to 15, cap 20 · bracket to 21, cap 25 · win by 2.<');
  expect(html).toContain('id="mges-status" role="status" aria-live="polite">Saved<');
  expect(html).toContain('data-mges-toggle="win_by_2"');
  expect(html).not.toContain('mges-half');
});
```
- [ ] **Step 2: Implement** pure:
```js
function settingsRuleSummary(t) {
  const x = t || {};
  const cap = (v) => (v != null && v !== '' && !isNaN(Number(v))) ? ', cap ' + Number(v) : '';
  const parts = ['Pool to ' + (x.pool_target != null ? x.pool_target : '') + cap(x.pool_cap),
    'bracket to ' + (x.bracket_target != null ? x.bracket_target : (x.match_cap != null ? x.match_cap : '')) + cap(x.bracket_cap)];
  if (x.win_by_2 == null || !!x.win_by_2) parts.push('win by 2');
  return parts.join(' · ') + '.';
}
```
app.js `buildMgSettingsHTML`: header + `<p class="set-intro">These decide how the day runs. Scoring here sets the rule line on every score card.</p>` + cards per `screens/mgts-settings.html:38-81` (`.pl-sect` + `.set-card` › `.set-row` › `.set-l` + `.set-h` / `.set-ctl`): The basics — Name (`.is-stack`, `input.set-in.set-wide#mges-name`, "What players see on the front page"), Team size (`input.set-in.set-num#mges-teamsize` + `.set-u` "a side", "Players per side on the court"), Nets (`#mges-nets` + "courts", "Courts you have for the day"); Scoring — Pool play (`.set-pair`: `.set-mini` TO `#mges-pooltarget`, CAP `#mges-poolcap`; "First to the target, capped so a close game ends"), Bracket (`#mges-brackettarget` / `#mges-bracketcap`), Win by 2 (the switch, "A game ends on a two-point lead"), Grand final reset (the switch, "The losers-bracket team gets a second championship game"); Where (guarded) — Venue (`.is-stack`, `#mges-venue`, "The park players see on the front page"), Address (`#mges-venueaddr`, "What Copy address puts on their clipboard"); Money — Buy-in (`input.set-in.set-money#mges-buyin`, "Per team, as free text"); then `<p class="set-sum">…</p>` under Scoring, and `.set-foot` = `mgSaveBtnHTML('settings')` + `<p class="mgr-status" id="mges-status" role="status" aria-live="polite">Saved</p>`. Switch markup byte-identical to today's. `APP_VERSION = '2026.08.25.10'`.
- [ ] **Step 3: CSS** — port `_shared.css:206-297` with the `input.` prefix on `.set-in/.set-num/.set-money/.set-wide`, add `flex: none; min-width: auto;` to each, `font-size: 16px` (PORT NOTE: iOS zoom guard), keep `.set-in:focus` ring.
- [ ] **Step 4: Run, commit + push** — `feat(manage): Event settings as named cards with a sentence per row, a Where group, Saved / Unsaved changes, the derived rule summary - v2026.08.25.10`

---

### Task 7: The Rules sheet cards

**Files:**
- Modify: `public/pure.js` (`rulesToSections(text)`, exported)
- Modify: `public/app.js` (`buildMgRulesHTML` 9007-9025; `openManageEditor` ~9097 gains `{ caret, append }` options; delegates `[data-rlv-edit]`, `[data-rlv-add]`)
- Modify: `public/styles.css` (port `_shared.css:300-388` (the card look; NOT the `.rlv-tin/.rlv-lin` input rules 389-409) + the `.rlv-*` counters from 657-683)
- Modify: `test/manage-page.test.js:1518,1522`, `test/rules-format.test.js` (unchanged), `test/manage-round.test.js`

- [ ] **Step 1: Tests**
```js
it('rulesToSections mirrors rulesToHTML grouping and carries offsets', () => {
  const md = '## Format\n- 4s co-ed\n\nWoodmen Valley Park · $80 a team';
  const s = bridge.rulesSections(md);
  expect(s.length).toBe(2);
  expect(s[0].head).toBe('Format'); expect(s[0].startOffset).toBe(0);
  expect(s[1].head).toBe(''); expect(s[1].startOffset).toBe(md.indexOf('Woodmen'));
  expect(s[0].bodyHTML).toContain('rl-li');
});
it('the rules view: a card per section, Edit pills, Edit all, Add a section, no inline inputs', () => {
  seedHub(bridge, { status: 'setup', name: 'A', rules: '## Format\n- 4s\n\n## Between games\n1. Winners stay\n\nBring cash' });
  const html = bridge.buildRules();
  expect(count(html, 'class="rlv-card')).toBe(3);
  expect(count(html, 'data-rlv-edit=')).toBe(3);
  expect(html).toContain('class="rlv-card is-note"');
  expect(html).toContain('data-mgru-edit>');
  expect(html).toContain('Edit all');
  expect(html).toContain('data-rlv-add');
  expect(html).toContain('Every section here is yours to edit. Tap one to change its wording or bullets.');
  expect(html).not.toContain('<input');
  expect(html).not.toMatch(/—|&mdash;/);
  expect(html).toContain('rl-num');
});
```
- [ ] **Step 2: Implement** pure:
```js
// The rules document as sections, for the organizer's card view. Grouping is EXACTLY rulesToHTML's (a
// blank line ends a section; a "## " line is the head), and each section carries the character offset of
// its first line in the ORIGINAL text so an editor can put the caret there. bodyHTML is rulesToHTML's
// output for that section alone (escape-first, same formatter).
function rulesToSections(text) {
  if (text == null) return [];
  const src = String(text);
  const lines = src.split(/\r?\n/);
  const out = [];
  let cur = null, pos = 0;
  const flush = () => { if (cur && cur.lines.length) out.push({ head: cur.head, startOffset: cur.start, bodyHTML: rulesToHTML(cur.lines.join('\n')).replace(/^<div class="rl-sect">|<\/div>$/g, '') }); cur = null; };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); pos += raw.length + 1; continue; }
    if (!cur) cur = { head: '', start: pos, lines: [] };
    if (line.startsWith('## ') && !cur.lines.length) cur.head = line.slice(3).trim();
    cur.lines.push(raw);
    pos += raw.length + 1;
  }
  flush();
  return out;
}
```
app.js `buildMgRulesHTML`: header with `<button type="button" class="pd-hdr-edit rlv-hedit" data-mgru-edit>${PENCIL_SVG}Edit all</button>`; intro `<p class="rlv-intro">This is the page players read. Every section here is yours to edit. Tap one to change its wording or bullets.</p>`; empty → one `.rlv-card` holding the existing `.mgru-empty` block with its "Write" pill (`data-rlv-add`); else `rulesToSections(t.rules).map((s, i) => `<div class="rlv-card${s.head ? '' : ' is-note'}"><div class="rlv-hd">${s.head ? `<div class="rl-h">${escapeHTML(s.head)}</div>` : ''}<button type="button" class="rlv-edit" data-rlv-edit="${s.startOffset}">${PENCIL_SVG}Edit</button></div><div class="rlv-lines rl-body">${s.bodyHTML}</div></div>`)` + `<button type="button" class="rlv-add" data-rlv-add><span class="rlv-plus">+</span> Add a section</button>` + `<p class="rlv-foot">Saved changes show up on the players' Rules page straight away.</p>`. Delegates: `[data-rlv-edit]` → `openManageEditor('rules', { caret: Number(offset) })`; `[data-rlv-add]` → `openManageEditor('rules', { append: '\n\n## New section\n- ' })`. In `openManageEditor`, after the textarea mounts: if `append`, `ta.value = (ta.value.replace(/\s+$/, '')) + append` and caret to the end; if `caret` is a number, `ta.setSelectionRange(caret, caret)` then scroll it into view (`ta.scrollTop` from the line count, or `ta.blur(); ta.focus()` after setting). `manageRulesDirty` stays `false` (still no inline input). `APP_VERSION = '2026.08.25.11'`.
- [ ] **Step 3: CSS** — port `_shared.css:300-388` (cards, heads, pills, add, foot, intro) + the `.rlv-edit/.rlv-hedit/.rlv-add` counters from 657-683 with PORT NOTEs; skip every `.rlv-tin/.rlv-lin/.rlv-more` rule.
- [ ] **Step 4: Tests** — `manage-page.test.js:1518,1522` → `rlv-card` / `data-mgru-edit>` + `Edit all`. Green.
- [ ] **Step 5: Commit + push** — `feat(manage): the Rules sheet as per-section cards whose Edit pills open the one editor at that section; Add a section - v2026.08.25.11`

---

### Task 8: Pool controls

**Files:**
- Modify: `public/app.js` (`mgPoolsControlsHTML` 9983-9995; `mgPoolTeamsBlockHTML` 9893-9908 keeps serving the drawn-not-started step; new `mgPoolCardHTML(pool, teams, matches)`; module vars `mgpMoveTeamId`, `mgpNetsEditPoolId`; delegates `[data-pc-move]`, `[data-pc-pick]`, `[data-pc-cancel]`, `[data-pc-editnets]`, `[data-pc-savenets]`; `mgPoolsEditNets` 10294-10307 split into parse+write reused by the inline save; `mgPoolsResetPools` unchanged)
- Modify: `public/styles.css` (port `_shared.css:439-534, 611-654` minus `.pc-toggle` and the `.pc-confirm/.pc-cin/.pc-cgo` strip; the `.pc-*` counters from 657-683)
- Modify: `test/manage-page.test.js` (any `mgps-editnets`/`Close controls` assertion), `test/manage-round.test.js`

- [ ] **Step 1: Tests**
```js
it('pool controls: a card per pool, Edit nets in the header, Move only before play, reset in the danger block', () => {
  seedPools(bridge, { pools: [{ id: 'p1', label: 'A' }, { id: 'p2', label: 'B' }], matches: [
    { id: 'm1', phase: 'pool', pool_id: 'p1', net: 1, status: 'final', team_a_id: 't1', team_b_id: 't2', score_a: 15, score_b: 9, winner_team_id: 't1', queue_order: 1 },
    { id: 'm2', phase: 'pool', pool_id: 'p2', net: 2, status: 'scheduled', team_a_id: 't3', team_b_id: 't4', queue_order: 1 }] });
  const html = bridge.buildMgPools({ controls: true });
  expect(count(html, 'class="pc-card"')).toBe(2);
  expect(count(html, 'data-pc-editnets=')).toBe(2);
  expect(html).toContain('>Nets 1<');
  expect(html).toMatch(/pc-card"[\s\S]*Pool B[\s\S]*data-pc-move=/);
  expect(html.split('Pool B')[0]).not.toContain('data-pc-move=');   // pool A has a final game: no Move
  expect(html).toContain('before play starts');
  expect(html).not.toContain('Scores follow the team');
  expect(html).toContain('class="mgv-danger"');
  expect(html).toContain('draws new pools from the registered teams at random');
  expect(html).not.toContain('Close controls');
  expect(html).not.toContain('pc-toggle');
});
it('the inline nets field prefills the parsed list, never the label', () => {
  /* set mgpNetsEditPoolId = 'p1' with nets [1,2,3]; expect value="1, 2, 3" and a Save nets button; expect no "Nets 1-3" in the input value */
});
```
- [ ] **Step 2: Implement** — `mgPoolsControlsHTML` open branch:
```js
  return `<div class="pl-sect">Pool controls</div>`
    + `<div class="pc-top"><p class="pc-note">Move a team to another pool before play starts, change the nets a pool plays on, or start the draw over.</p><button type="button" class="pc-done" data-mgps-controls>Done</button></div>`
    + pools.map((p) => mgPoolCardHTML(p, teams, pools, matches)).join('')
    + `<div class="pl-sect mgv-dsect" aria-hidden="true"></div><div class="mgv-danger"><div class="mgv-drow"><span class="mgv-dtxt"><span class="mgv-dt">Reset pools</span><span class="mgv-dd">Clears every pool result and draws new pools from the registered teams at random. Pool play starts over.</span></span><button type="button" class="mgts-danger mgv-dbtn" data-mgps-reset>Reset</button></div><div class="mgv-dnote">Asks you to type the tournament name before anything happens.</div></div>`;
```
`mgPoolCardHTML`: head `.pc-hd` = `.pc-name` "Pool A" + (editing ? `<input class="pc-nin" id="pc-nin-${id}" value="${cur.join(', ')}" inputmode="numeric" aria-label="Nets for pool A"><span class="pc-nhint">Re-assigns its unplayed games.</span>` + `button.pc-nbtn[data-pc-savenets=id]` "Save nets" : `.pc-nets` "Nets 1-3" (hyphen; `formatNetList`) + `button.pc-nbtn[data-pc-editnets=id]` "Edit nets"); rows = teams in the pool as `.pc-team` (name + (movable ? `<span class="pc-move" data-pc-move="${teamId}">Move ${MG_CHEV}</span>` : '')) with, when `mgpMoveTeamId === teamId`, a `.pc-pick` strip under it: `Move <b>${name}</b> to →` + one `button.pc-pbtn[data-pc-pick="${teamId}:${otherPoolId}"]` per other pool + `button.pc-pcancel[data-pc-cancel]`. `movable = !matches.some((m) => m.pool_id === pool.id && m.status === 'final')`. Delegates: move pick → `await tdbMoveTeamToPool(teamId, poolId)` (read 2230-2234; check `{error}`), `mgpMoveTeamId = null`, `await tdbRefreshTournaments()`, `repaintManage()`, then `mPlay(card, 'm-flash', 600)` on the new pool's card; save nets → reuse `mgPoolsEditNets`'s parse + `tdbSetPoolNets` with the input value, `mgpNetsEditPoolId = null`, refresh + repaint. `APP_VERSION = '2026.08.25.12'`.
- [ ] **Step 3: CSS** — port the `.pc-*` kit as scoped; PORT NOTE each `!important` counter.
- [ ] **Step 4: Run, commit + push** — `feat(manage): pool controls as per-pool cards - Edit nets inline, Move before play starts, Reset pools in the danger block - v2026.08.25.12`

---

### Task 9: The organizer's bracket

**Files:**
- Modify: `public/app.js` (`buildMgBracketHTML` ~10352; new `mgBracketStripHTML(t, main, teams)`, `mgBracketChampHTML(t, main, teams)`; `mgScoreNextHTML` 10015-10024; `buildMgScoreSheetHTML` row() 10093-10104 + a `mgScoreSubLine(match, side)`; `mgBracketRowHTML` 10573 role/tabindex; the `[data-mgbk-score]` delegate gains keydown Enter/Space; the sheet gains Escape)
- Modify: `public/styles.css` (port `_bracket-run.css:1-45, 85-110` + `.mgv-bkpill.is-done`; port `_shared.css:137-182` onto `.mgv-sc*` as class modifiers: `.mgv-scsub`, `.mgv-scwpill`, `.mgv-scstake/.mgv-scstk`)
- Modify: `test/manage-page.test.js` (score sheet `mgv-bknext` assertions), `test/manage-round.test.js`

- [ ] **Step 1: Tests**
```js
it('the strip: eyebrow, count, now-line from live games; the champion block when decided', () => {
  const html = bridge.buildBracket(); // 8-team fixture with G1 live on net 1
  expect(html).toContain('DOUBLE ELIMINATION · 8 TEAMS · 3 NETS');
  expect(html).toMatch(/\d+ of \d+ games in/);
  expect(html).toContain('On the nets now: <b>G1 on Net 1</b>');
  expect(html).not.toContain('bkr-undo');
  expect(html).not.toContain('Clear every score');
});
it('the bracket card: seed and record line, stakes with round names and outcomes, a WINNER pill, steppers kept', () => {
  const html = bridge.buildScoreSheet(fixtureMainMatchG1);
  expect(html).toMatch(/class="mgv-scsub">Seed \d · \d–\d in pools</);
  expect(html).toContain('<b>Winner</b> → ');
  expect(html).toContain('<b>Loser</b> → losers bracket · G');
  expect(html).toContain('class="mgv-scwpill">Winner<');
  expect(count(html, 'data-mgss-step=')).toBe(4);
  expect(html).toContain('data-mgss="live"');
  expect(html).not.toMatch(/—|&mdash;/);
});
it('a pool card has no seed line and no stakes', () => { const html = bridge.buildScoreSheet(fixturePoolMatch); expect(html).not.toContain('mgv-scsub'); expect(html).not.toContain('mgv-scstake'); });
```
- [ ] **Step 2: Implement**
```js
function mgBracketStripHTML(t, main, teams) {
  const gn = bracketGameNumbers(main).byId;
  const total = main.filter((m) => !(m.side === 'grand_final' && Number(m.round) === 2 && !m.team_a_id && !m.team_b_id && m.status !== 'final')).length;
  const done = main.filter((m) => m.status === 'final').length;
  const nets = Number(t.net_count) || 0;
  const live = main.filter((m) => m.status === 'live' && m.net != null).sort((a, b) => a.net - b.net);
  const playable = main.filter((m) => m.status !== 'final' && m.team_a_id && m.team_b_id);
  let now;
  if (live.length) now = 'On the nets now: ' + live.map((m) => `<b>G${gn[m.id]} on Net ${m.net}</b>`).join(', ') + '. Tap a game to pick its winner.';
  else if (playable.length) now = 'Up next: ' + playable.slice(0, 3).map((m) => `<b>G${gn[m.id]}</b>`).join(', ') + '. Tap a game to pick its winner.';
  else if (done === total && total) now = 'Every game is in.';
  else now = 'No game is playable, the next round needs results first.';
  return `<div class="bkr-strip"><div class="bkr-eye">DOUBLE ELIMINATION · ${teams.length} TEAMS · ${nets} NETS</div>`
    + `<div class="bkr-count">${done} of ${total} games in</div><div class="bkr-bar"><span style="width:${total ? Math.round(done / total * 100) : 0}%"></span></div>`
    + `<p class="bkr-now">${now}</p></div>`;
}
```
Champion: `computeChampion(main, teams)` (pure.js ~415) or `t.champion_team_id`; when present, `<div class="bkr-champ"><div class="bkr-champe">Champion</div><div class="bkr-champn">${name}</div><div class="bkr-champs">Seed N · W–L in pools · won the championship, G14</div></div>` above the strip, and the now-line reads `Every game is in. ${name} takes it.`. `buildMgBracketHTML` = header + controls + champ + strip + board + reset.
Score card: `mgScoreSubLine(match, side)` → for phase 'main' only: `Seed ${team.seed} · ${w}–${l} in pools` from `computeSeeding(teams, poolMatches)` (find the team's wins/losses; omit when `seed` is null). Insert inside `.mgv-scwin` after the name as `<span class="mgv-scsub">…</span>` (wrap name+sub in `<span class="mgv-scnb">` so the 44px target holds); add `<span class="mgv-scwpill" aria-hidden="true">Winner</span>` after the stepper inside `.mgv-scrow` for phase 'main' (CSS reveals it on `.is-won`). `mgScoreNextHTML` →
```js
function mgScoreNextHTML(match) {
  if (!match || match.phase !== 'main') return '';
  const main = (state.tournamentMatches || []).filter((x) => x.phase === 'main');
  const byId = {}; main.forEach((x) => { byId[x.id] = x; });
  const gn = bracketGameNumbers(main).byId;
  const maxRounds = { winners: 0, losers: 0 };
  main.forEach((x) => { if (x.side === 'winners' || x.side === 'losers') maxRounds[x.side] = Math.max(maxRounds[x.side], x.round || 0); });
  const dest = (id) => { const d = byId[id]; if (!d) return ''; const side = d.side === 'grand_final' ? 'Championship' : (d.side === 'losers' ? 'losers bracket' : 'winners bracket'); return `${side} · G${gn[d.id]}`; };
  const isChamp = match.side === 'grand_final';
  const win = match.winner_next_match_id && byId[match.winner_next_match_id] ? dest(match.winner_next_match_id) : (isChamp ? 'champion' : '');
  const lose = match.loser_next_match_id && byId[match.loser_next_match_id] ? dest(match.loser_next_match_id)
    : (isChamp ? 'runner-up' : (match.side === 'losers' && (match.round || 0) >= maxRounds.losers ? 'third place' : 'eliminated'));
  return `<div class="mgv-scstake"><span class="mgv-scstk"><b>Winner</b> → ${escapeHTML(win)}</span><span class="mgv-scstk"><b>Loser</b> → ${escapeHTML(lose)}</span></div>`;
}
```
(For the championship with a reset game pending, `winner_next_match_id` points at the reset game and reads "Championship · G15" honestly.) Keyboard: `role="button" tabindex="0"` on resolved `.mgv-bkm`; keydown Enter/Space on `[data-mgbk-score]` → the same open; Escape on the sheet → close. `APP_VERSION = '2026.08.25.13'`.
- [ ] **Step 3: CSS** — `_bracket-run.css` strip + champ (7-45, 85-110) and `.mgv-bkpill.is-done`; the card lines from `_shared.css:137-182` renamed onto `.mgv-scsub/.mgv-scwpill/.mgv-scstake/.mgv-scstk` with the pill positioned after the stepper (`.mgv-scrow` gets `position: relative`; the pill absolute right 12px, hidden until `.is-won`).
- [ ] **Step 4: Tests** — `manage-page.test.js` `mgv-bknext` assertions → the new block. Green.
- [ ] **Step 5: Commit + push** — `feat(manage): the organizer's bracket - progress strip, champion block, seed and record on the card, stakes naming the round and the outcome, WINNER pill, keyboard reach - v2026.08.25.13`

---

### Task 10: The canvas (C93)

**Files:** the Claude Design project `f34a8182-85de-4658-8a17-b99bc3b9e5b8` via `mcp__claude-design__*` (load with ToolSearch: `list_files`, `delete_files`, `write_files`, `read_file`).

- [ ] **Step 1:** `list_files` → confirm `screens/mg-teams-swap.html`, `screens/mg-teams-move-a.html`, `-b`, `-b2`, `-b3`, `-c` exist; read `manage.html` to see IDS (line 68) and `move-players.html`.
- [ ] **Step 2:** Render today's `buildManageTeamsHTML()` through the vm harness with the fixture from `manage-page.test.js` (12 checked in, 4s, three generated teams) and write it into `screens/mg-teams.html`'s `.container` (keep the screen's shell markup; replace only the body), removing the grip SVG, `data-mgt-swap/-from/-grip`, `.mgv-note` and the swap footer.
- [ ] **Step 3:** `delete_files` the six stale screens; `write_files` `manage.html` with `mg-teams-swap` removed from IDS; `move-players.html` gets a one-paragraph note at the top ("Retired 2026-08-25: generated teams are read-only (decision 2026-08-07). Kept for history.") rather than deletion.
- [ ] **Step 4:** Vault: `Tasks From Claude.md` C93 → DONE with the file list.

---

### Task 11: Verification in Mike's Chrome + the vault

- [ ] **Step 1: Bytes on prod** — `curl -s https://athletic-specimen.com/app.js | grep -c "mgh-scope\|buildMgTeamAddHTML\|rulesToSections\|bkr-strip\|checkinKioskUrl"` ≥ 5; `APP_VERSION` matches.
- [ ] **Step 2: Drive (read-only, tab 416606342 or a fresh tab; §63 claude-in-chrome only):** as Mike's admin session on prod: the hub at 390 (frame) and 1280 — title block, picker open/close, six-step track with the right `is-now`, chips, Needs-you rows, the live strip on the August bracket (LIVE games named by net, no minutes); tournament page — when-line, tiles, groups, order; Event settings — four cards, `Saved`, type a character → `Unsaved changes` (then revert, do not save); Rules — cards, tap Edit → the editor opens at that section (close without saving); Pools controls — cards, Edit nets field prefilled `1, 2, 3` (cancel), no Move on pools with finals; the bracket — strip, vocabulary, open a card (WINNER pill on the picked row, seed line, stakes), close without saving; Add a team screen renders (do not submit); the QR modal shows `https://athletic-specimen.com/checkin.html`. Console clean. Screenshots to `12-history/assets/2026-08-25-manage-*.png`.
- [ ] **Step 3: Restore the tab** (frames removed, `activateMainTab('home')`).
- [ ] **Step 4: Vault** — `log.md` entry, `current.md` "Right now", `decisions.md` (anything decided during the build), `debugging.md` (new patterns), `NOW.md`, `Tasks From Claude.md` (C99 DONE, C81 DONE, C93 DONE, C77 note; new task for the data round listing the six RPC gaps), `12-history/task-#3-manage-handoff-session18.md` BEFORE marking done.
- [ ] **Step 5: Hand back** with AskUserQuestion: the data round spec (Recommended) / C100 Account.
