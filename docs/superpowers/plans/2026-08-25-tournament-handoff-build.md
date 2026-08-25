# Tournament Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **LasOlas §38 (2026-07-18) overrides the line above for THIS project: all UI edits are Fable 5 INLINE, never dispatched.** Research may fan out; every edit to `public/app.js`, `public/pure.js`, `public/styles.css` is inline.

**Goal:** Port Mike's Tournament handoff into the shipped app: the copy and hub/pools deltas, the bracket's real geometry and 1:1 opening view, public scoring for signed-in players (pool rows, bracket nodes, My Team), and the sample bracket before seeding.

**Architecture:** Same shape as the Home port — string builders in `public/app.js`, pure helpers in `public/pure.js`, CSS appended to `public/styles.css` under a banner with `PORT NOTE`s, body-appended sheets, `partialRenderTournament()` after a public write. Scoring reuses prod's Manage score sheet (`openMgScoreSheet` / `buildMgScoreSheetHTML`) restyled, with a scoped gate instead of the admin-only return. The sample bracket rides the real `.bt-*` furniture and `layoutBracketTree`.

**Tech Stack:** Vanilla JS, Supabase DEFINER RPCs (`submit_match_score`, `set_live_score`, `edit_match_score`), vitest vm-sandbox string assertions.

**Spec:** `docs/superpowers/specs/2026-08-25-tournament-handoff-design.md`. Handoff: `docs/design-handoffs/2026-08-24/tournament/`.

## Global Constraints

- `APP_VERSION` (`public/app.js:28`) → `'2026.08.25.N'`, N increments per push (starts `.1`).
- `node --check public/app.js` and `public/pure.js` after every edit. Commit + push per task. Every chain gates on vitest's exit code: `(cd test && npx vitest run > "$TEMP/v.log" 2>&1; rc=$?; grep -E "×|→|Tests |Test Files" "$TEMP/v.log"; exit $rc) && git …`.
- No em dashes in player-facing copy (`→` and `–` scores are value glyphs). No neon. Skill never public. 390 primary, `@media (min-width:1024px)` desktop.
- Player-facing "Final" is gone; Manage and stored `round_label` untouched.
- Tests: string assertions on builders via the vm bridge (`test/manage-page.test.js:11-60` harness), source guards on `app.js` / `styles.css` (CRLF-normalised, comments stripped).
- Baseline before Task 1: **36 files / 855 tests green**.

---

### Task 1: Copy sweep + hub and pools deltas (no capability change)

**Files:**
- Modify: `public/pure.js` (`bracketRoundLabel` ~1261, `tournamentStageModel` completed branch ~1777, new `teamNetRange` after `poolNetRange` ~1008, exports)
- Modify: `public/app.js` — `buildBracketHTML` sideDefs (~3199), `buildBracketNodeHTML` meta (~3127), `buildBracketPageHTML` pre progress "games final" (~3667) + champ strip (~3695), `buildTournamentHubHTML` (~3499 countLabel, ~3531-3539 My team row, ~3559 pools stat, ~3571 Seeding row, ~3584 completed Bracket sub), `buildPoolsSchedulePageHTML` (~4226 meta, ~4280 finished row), `poolStandRowHTML` (~4171, gains `netLine`)
- Modify: `public/styles.css` — 2900-2904 dangling comma; 2496 `.def`; 3152-3155 You row; 3182-3187 your-team chip; 3176-3181 comment; append the TOURNAMENT ROUND banner + `.tn-rec/.tn-statsub`, `.pl-g .gt .win`, `.pl-youname/.pl-younet`
- Test: `test/pools-page.test.js:140`, `test/standings-retarget.test.js:111-115`, `test/tournament-stage.test.js:99-104`, `test/bracket-page.test.js:90-91`, new `test/tournament-round.test.js`

**Interfaces:**
- Produces: `teamNetRange(teamId, matches)` → `'Nets 1-2'` / `'Net 3'` / `''` (pure); `poolStandRowHTML(rank, teamId, name, wins, losses, diff, badge, myTeamId, netLine)`.

- [ ] **Step 1: Failing tests** — `test/tournament-round.test.js` (harness copied from `manage-page.test.js:11-60`; epilogue exposes `hub: () => buildTournamentHubHTML()`, `pools: () => buildPoolsSchedulePageHTML()`, `setState: (fn) => fn(state)`, `setPoolFilter: (v) => { pdPoolFilter = v; }`); pure cases via `createRequire`:

```js
describe('teamNetRange (pure)', () => {
  const g = (a, b, net) => ({ phase: 'pool', team_a_id: a, team_b_id: b, net });
  it('reuses poolNetRange grammar for the nets MY pool games sit on', () => {
    expect(teamNetRange('t1', [g('t1','t2',1), g('t1','t3',2), g('t2','t3',3)])).toBe('Nets 1-2');
    expect(teamNetRange('t1', [g('t1','t2',3)])).toBe('Net 3');
    expect(teamNetRange('t1', [g('t1','t2',1), g('t1','t3',3)])).toBe('Nets 1, 3');
    expect(teamNetRange('t9', [g('t1','t2',1)])).toBe('');
    expect(teamNetRange('t1', [g('t1','t2',null)])).toBe('');
  });
});
describe('Championship, never Final (player-facing)', () => {
  it('bracketRoundLabel + tournamentStageModel', () => {
    expect(bracketRoundLabel({ side: 'grand_final', round: 1 })).toBe('Championship');
    expect(bracketRoundLabel({ side: 'grand_final', round: 2 })).toBe('Championship (if necessary)');
    expect(bracketRoundLabel({ side: 'winners', round: 2 })).toBe('Winners round 2');
    expect(tournamentStageModel({ status: 'completed' }, []).stageLabel).toBe('Complete');
  });
  it('the public builders carry no Final', () => {
    const src = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
    const pub = src.slice(src.indexOf('function buildBracketHTML('), src.indexOf('function resolveRegisterTournament('));
    expect(pub).not.toMatch(/['"`]Final['"`]/);
    expect(pub).not.toContain('games final');
    expect(pub).toContain("['grand_final', 'Championship']");
    expect(pub).toContain("' · Done'");
    expect(pub).toContain('in the championship');
  });
});
describe('hub rows (design round 2026-08-23)', () => {
  // fixture: one pools-status tournament, 4 teams, my team t1 with a next game on net 2; see the test file for setState
  it('record on the sub line, sentence in the stat, games-done caption, leader kept', () => {
    const html = bridge.hub();
    expect(html).toContain('<span class="tn-rec">1-0</span>');
    expect(html).toContain('Next on <b>net 2</b>');
    expect(html).toContain('<span class="tn-statsub">games done</span>');
    expect(html).toMatch(/tn-prog-n">\d+ of \d+ games</);
    expect(html).toContain('<span class="tn-sub">Where teams stand</span>');
    expect(html).toContain('>Leader<'); // sub? no: the leader NAME stays in the stat — assert the team name
  });
});
describe('pools rows (design round 2026-08-22)', () => {
  it('A vs B with the winner in .win, DONE, games done, the You net line', () => {
    const html = bridge.pools();
    expect(html).toContain('<span class="win">');
    expect(html).not.toContain('def.');
    expect(html).toContain('>DONE<'); expect(html).not.toContain('>FINAL<');
    expect(html).toMatch(/games done</);
    expect(html).toContain('<span class="pl-youname">');
    expect(html).toContain('<span class="pl-younet">You play at nets 1-2</span>');
    bridge.setPoolFilter('seeding');
    expect(bridge.pools()).not.toContain('pl-younet'); // the Seeding tab stays one line
  });
});
```

(Exact fixtures are written in the file; the `hub` fixture: `state.tournaments=[{id:'T',name:'August 2026 Tournament',status:'pools',net_count:3}]`, `activeTournamentId='T'`, 4 teams, pool matches with `queue_order`/`net`, one final; `myClaimedPlayer`/`tournamentPickedTeamId` set so `myTeamInfo()` resolves t1.)

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement** — pure.js:

```js
// bracketRoundLabel: player-facing "Championship, never Final" (design round 2026-08-24)
if (m.side === 'grand_final') return (Number(m.round) === 2) ? 'Championship (if necessary)' : 'Championship';
// tournamentStageModel completed branch:
return { phase: 'completed', stageLabel: 'Complete', count: total, total, pct: 100, activeView: null };
// after poolNetRange:
// The nets ONE team's own pool games sit on, in poolNetRange's grammar ("Nets 1-2"). '' when unknown.
function teamNetRange(teamId, matches) {
  if (!teamId) return '';
  const mine = (Array.isArray(matches) ? matches : []).filter((m) => m && (m.phase ? m.phase === 'pool' : true)
    && (m.team_a_id === teamId || m.team_b_id === teamId));
  return poolNetRange(mine);
}
```
(and add `teamNetRange` to the `module.exports` guard at the bottom of pure.js.)

app.js edits (each a one-line string change unless noted): `['grand_final', 'Championship']`; node meta `' · Done'`; champ strip `' · beat ' + escapeHTML(outcome.runnerUpName) + ' in the championship'`; pre progress `games done`; hub `countLabel` pools branch `+ ' games'`; hub completed Bracket sub `'Bracket complete'`; pools meta `games done`; finished pool row:

```js
return `<div class="pl-g"><span class="rd">G${escapeHTML(String(order))}</span><span class="gt"><span class="win">${w}</span> <span class="vs">vs</span> <span class="lose">${l}</span></span><span class="sc">${escapeHTML(String(ws))}${EN}${escapeHTML(String(ls))}</span><span class="ftag">DONE</span></div>`;
```
Hub My team row (replace the `stat` derivation and the push):
```js
    let stat = CHEV;
    let recHTML = '';
    if (peek) {
      recHTML = `<span class="tn-rec">${escapeHTML(peek.wins + '-' + peek.losses)}</span>`;
      const nextNet = peek.next && peek.next.net;
      stat = peek.live ? 'Playing now' : (nextNet ? ('Next on <b>net ' + escapeHTML(String(nextNet)) + '</b>') : CHEV);
    }
    rows.push(row('data-nav-tab="myteam"', '', ICON.team, 'My team', escapeHTML(nm) + poolPart + recHTML, stat));
```
Pools stat: `escapeHTML(poolDone + '/' + poolTotal) + '<span class="tn-statsub">games done</span>'`. Seeding row: `'Where teams stand'` as the sub, stat unchanged (`leader ? escapeHTML(leader) : CHEV`). `poolStandRowHTML` gains `netLine`: when `mine`, `c2` becomes `<span class="pl-youname">${badge}${name}${youTag}</span>${netLine ? `<span class="pl-younet">You play at ${escapeHTML(netLine.toLowerCase())}</span>` : ''}`; the pool tab passes `teamNetRange(myTeamId, poolMatches)`, the Seeding tab passes `''`.

CSS: fix 2900-2904 (`.mgp-bar, .mgp-movebar { left:50%; transform:translateX(-50%); width:100%; max-width:720px; }` then `.pd-thero .pd-h { font-size: 22px; }` as its own rule); drop `.pl-g .gt .def,` from 2496 and retire the 3176-3181 `:has(.def)` rules with a note; edit 3152-3155 to add `border-top-color: var(--border); border-radius: 0;`; replace 3182-3187 with the chip (`font-weight:500; padding:1px 6px; border-radius:6px; background:var(--accent-soft); box-shadow: inset 0 0 0 1px var(--accent-bd)` and `.pl-g .gt .win b { color: inherit }`); append:

```css
/* ============================================================
   TOURNAMENT DESIGN ROUND - 2026-08-25 (Mike's Claude Design handoff, "Tournament").
   Blocks ported from _rounds.css (2026-08-22/23/24) + _shared.css. PORT NOTES inline.
   ============================================================ */
/* hub: the record rides the sub line; the stat is a sentence */
.tn-rec { margin-left: 6px; padding-left: 7px; border-left: 1px solid var(--border); font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; }
.tn-row[data-nav-tab="myteam"] .tn-stat b { font-weight: 700; color: var(--ink); }
.tn-row.is-now .tn-stat { display: flex; flex-direction: column; align-items: flex-end; line-height: 1.2; }
.tn-statsub { margin-top: 2px; font-size: 9px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
/* pools: "A vs B", the winner carries the result in green */
.pl-g .gt .win { color: oklch(0.40 0.09 150); }
.pl-g .gt .win b, .pl-g .gt .win .tapname { color: inherit; }
/* the You row: name line + the nets you play on */
.pl-srow.pl-you .c2:has(.pl-younet) { display: grid; gap: 1px; }
.pl-srow.pl-you .pl-youname { display: flex; align-items: center; gap: 7px; min-width: 0; }
.pl-srow.pl-you .pl-younet { font: 700 10px var(--font-display); letter-spacing: .1em; text-transform: uppercase; color: var(--brand-dark); }
```

- [ ] **Step 4: Update the four existing assertions**, run the suite, commit + push `v2026.08.25.1`.

---

### Task 2: Bracket geometry, labels and the 1:1 opening view

**Files:**
- Modify: `public/app.js` — `layoutBracketTree` (~3244-3293), `roundLabelFor` in `buildBracketHTML` (~3218-3227), the side-tab handler (~11338-11341: drop `btResetView()`)
- Modify: `public/styles.css` — `.bt-sc` rules (~1816-1819), `.bt-rlabel`/`.bt-col` (~1798-1802), append `.bk-gid`, `.bt-sides` nowrap + media, the stagger selector, the ≥1024 prose clamp
- Test: `test/bracket-page.test.js`, `test/tournament-round.test.js`

- [ ] **Step 1: Failing tests** — source guards: `layoutBracketTree` contains `offsetIn(` and `style.top`; the connector path string contains a shared riser (`'V' +`); `buildBracketHTML` emits `<span class="bk-gid">`; the live status/side handler no longer calls `btResetView()` on a side tap; `styles.css` has `.bt-sides button { white-space: nowrap`.

- [ ] **Step 2: Implement `layoutBracketTree`'s geometry** (replacing the `pos` build and connector loop):

```js
  // Design round 2026-08-24: measure LAYOUT (offset chain), centre every game on the midpoint of its
  // feeders, then draw a stub off each feeder, ONE shared riser, one line into the destination.
  const offsetIn = (node) => { let x = 0, y = 0, el = node; while (el && el !== canvas) { x += el.offsetLeft; y += el.offsetTop; el = el.offsetParent; } return { x, y }; };
  const nodes = [...canvas.querySelectorAll('.bt-node')];
  nodes.forEach((n) => { n.style.top = ''; });
  const pos = {};
  nodes.forEach((n) => { const o = offsetIn(n); pos[n.getAttribute('data-mid')] = { n, x: o.x, y: o.y, w: n.offsetWidth, h: n.offsetHeight, path: n.classList.contains('path'), feeders: [] }; });
  nodes.forEach((n) => { const to = pos[n.getAttribute('data-next')]; if (to) to.feeders.push(pos[n.getAttribute('data-mid')]); });
  // columns left to right: a fed game moves to its feeders' midpoint (feeders are already placed by then)
  [...canvas.querySelectorAll('.bt-col')].forEach((col) => {
    col.querySelectorAll('.bt-node').forEach((n) => {
      const p = pos[n.getAttribute('data-mid')];
      if (!p || !p.feeders.length) return;
      const mid = p.feeders.reduce((s, f) => s + f.y + f.h / 2, 0) / p.feeders.length;
      const dy = Math.round(mid - (p.y + p.h / 2));
      if (dy) { n.style.top = dy + 'px'; p.y += dy; }
    });
  });
  let paths = '';
  Object.values(pos).forEach((to) => {
    if (!to.feeders.length) return;
    const x2 = to.x, y2 = to.y + to.h / 2;
    const mx = Math.min(...to.feeders.map((f) => f.x + f.w)) + Math.max(12, (x2 - Math.max(...to.feeders.map((f) => f.x + f.w))) / 2);
    const ys = to.feeders.map((f) => f.y + f.h / 2);
    to.feeders.forEach((f, i) => { paths += `<path class="bt-link${f.path && to.path ? ' on' : ''}" d="M${f.x + f.w} ${ys[i]} H${mx}" />`; });
    const lo = Math.min(...ys, y2), hi = Math.max(...ys, y2);
    if (hi - lo > 1) paths += `<path class="bt-link" d="M${mx} ${lo} V${hi}" />`;
    paths += `<path class="bt-link${to.path && to.feeders.some((f) => f.path) ? ' on' : ''}" d="M${mx} ${y2} H${x2}" />`;
  });
  svg.innerHTML = paths;
```
and the view: `pan.style.height = Math.min(H, vh) + 'px'; btView = { W, H, vw: avail, vh: Math.min(H, vh), fit, max: … }; if (btScale == null) { btScale = 1; btX = 0; btY = 0; }` (fit stays the zoom-out floor). Re-measure `W`/`H` AFTER the `style.top` pass (a shifted node can extend the canvas). Side tap: remove `btResetView()`, set `btX = 0; btY = 0;`.

`roundLabelFor(r)` → `roundLabelHTML(r)`:
```js
  const maxRound = Math.max(...sideMatches.map((m) => Number(m.round) || 0));
  const roundLabelHTML = (r) => {
    const range = roundLabelFor(r);
    const name = side === 'grand_final' ? (r === 1 ? 'Championship' : '') : (r === maxRound && sideDefs.length > 1 ? 'Semifinals' : '');
    return name ? `${name}<span class="bk-gid">${escapeHTML(range)}</span>` : escapeHTML(range);
  };
```
CSS: `.bt-col { position: relative; padding-top: 34px; }`, `.bt-rlabel { position: absolute; top: 0; left: 0; right: 0; line-height: 1.25; }`, `.bk-gid { display:block; margin-top:2px; font-weight:600; color:var(--muted); letter-spacing:.06em; }`, `.bt-sides button { white-space: nowrap; }` + `@media (max-width: 430px) { .bt-sides button { font-size: 14px !important; padding-left: 6px; padding-right: 6px; } }` (PORT NOTE: `!important` counters prod's global button font-size guard), `.bt-sc { margin-left:auto; padding-left:8px; font: 700 12.5px 'Inter', sans-serif; font-variant-numeric: tabular-nums; color: var(--muted); } .bt-row.win .bt-sc { color: var(--ink); } .bt-sc.bt-livesc, .bt-node.pd-bk-live .bt-sc { color: var(--live-ink); }`, the stagger selector gains `body.m-enter #app-content > .tab-panel.active > .container .bt-col > *`, and inside the desktop block `body.pd-public-active #tab-tournament :is(.pd-bk-pres, .pd-bk-preh, .bk-pv, .bk-pv-ss) { max-width: 640px; }`.

- [ ] **Step 3: Suite green, commit + push `v2026.08.25.2`.**

---

### Task 3: Public scoring for signed-in players + the My Team next-game card

**Files:**
- Modify: `public/app.js` — `buildMgScoreSheetHTML` (~9904-9970: eyebrow/hint/primary/quiet), `openMgScoreSheet` (~9974: gate, doFinal, doLive, after), `buildPoolsSchedulePageHTML` (rows gain `data-pg-score`, legend → tip), `buildBracketNodeHTML` (~3162: tappable hook), `buildBracketHTML` hint (~3210), the `#app-content` delegate (after `[data-team-peek]`), `buildMyTeamPageHTML` (~6691-6701)
- Modify: `public/pure.js` — `computeTeamRunTimeline` (`next` gains `id`, `phase`, `side`, `afterGame`)
- Modify: `public/styles.css` — restyle `#mgss-sheet .mgv-sc*` (append overrides), `.mgv-sclive` → the white secondary, `.mt-next` (2142), append `.mtv-*`, `.pl-tip`, the ≥1024 `.mtv-nfoot` rule
- Test: `test/pools-page.test.js`, `test/myteam-page.test.js`, `test/manage-page.test.js` (unchanged hooks must still pass), `test/tournament-round.test.js`

- [ ] **Step 1: Failing tests** — pools: `data-pg-score="gA2"` on the live + upcoming rows, NOT on the final row, `class="pl-sect pl-tip">Tap any game to enter its score.<`; bracket node: `data-pg-score` on a both-teams non-final node when `state.account` is set, absent when signed out; My Team: `class="mtv-ntile"`, `class="mtv-nvs">vs<`, `<b>Dinks</b>`, `class="mtv-nwhen">after G3<`, `class="mtv-nstage">Pool play<`, `data-mt-report="m9"`; pure: `computeTeamRunTimeline(...).next` has `id`, `phase:'pool'`, `side:null`, `afterGame: 3`; source: `openMgScoreSheet` no longer contains `if (!state.isAdmin) return;`, contains `canScoreMatch(`; the live path contains `'Add a point to at least one team first.'`; `mgScoreHint(` derives from `scoringRulesFor`.

- [ ] **Step 2: Implement the sheet**

```js
// Who may open the sheet on THIS device for THIS match. Admins: anything with two teams (Manage fixes
// finals). Signed-in players (design round 2026-08-24, Mike 2026-08-25): a game with two teams that is not
// final — the DB refuses a player's overwrite anyway (0039), so the card never offers it. Anon: nothing.
function canScoreMatch(match) {
  if (!match || !match.team_a_id || !match.team_b_id) return false;
  if (state.isAdmin) return true;
  if (!state.account) return false;
  return match.status !== 'final';
}
// The rule line, in plain words from the tournament's own settings (Mike: "always say what the tournament settings have").
function mgScoreHint(match, rules) {
  const who = match.phase === 'main'
    ? ((match.side === 'grand_final' && Number(match.round) === 1) ? 'The championship goes' : 'Bracket games go')
    : 'Pool games go';
  return who + ' to ' + rules.target + (rules.winBy2 ? ', win by 2' : '') + (rules.cap != null ? ', cap ' + rules.cap + '.' : ', no cap.');
}
```
In `buildMgScoreSheetHTML`: drop `bits.push(mgRuleLine(rules))`; hint becomes `mgScoreHint(match, rules) + ' ' + (isFinal ? 'Fixing the score. Same winner only.' : (match.phase === 'main' ? 'Tap the team that won. Add the score if you kept one.' : 'Tap a team to mark them the winner, then enter the score.'))`; primary disabled rule: `const canFinal = match.phase === 'main' ? !!pick && !(a === b && a > 0) : a !== b;`; `mgScoreFinalLabel` gains the scoreless bracket case (`if (a === 0 && b === 0 && pick) return 'Save winner · ' + (pick === 'a' ? aName : bName);` — pass `pick` in); quiet button class stays `mgv-sclive`, copy `Save live score` / `Update live score` when `match.status === 'live'`.

In `openMgScoreSheet`: `if (!canScoreMatch(match)) return;` replaces the two early returns; `sync()` uses the same `canFinal` rule; `doFinal`: `if (match.phase === 'main' && a === 0 && b === 0) await tdbSubmitBracketResult(match, pick, '', ''); else { if (a === b) { fail('A game can\'t end in a tie.'); return; } … }`; `doLive`: `if (a === 0 && b === 0) { fail('Add a point to at least one team first.'); return; }`; both end with `const after = () => (activeMainTab === 'manage' ? repaintManage() : partialRenderTournament()); after();`.

Hooks: pools live/upcoming rows get ` data-pg-score="${escapeHTML(g.id)}"` (the final row gets none); the legend block becomes `<p class="pl-sect pl-tip">Tap any game to enter its score.</p>` rendered only when `state.account || state.isAdmin`; `buildBracketNodeHTML`: `const hook = (ro && (state.account || state.isAdmin) && aKnown && bKnown && m.status !== 'final') ? ` data-pg-score="${escapeHTML(m.id)}" tabindex="0"` : '';` on the node, class `tappable` alongside; the read-only hint reads `'Tap a game to enter its score · tap a team for its record · pinch or drag to zoom'` when signed in. Delegate (after the `[data-team-peek]` branch): `const pg = e.target.closest('[data-pg-score]'); if (pg) { openMgScoreSheet(pg.getAttribute('data-pg-score')); return; }` and `const mtr = e.target.closest('[data-mt-report]'); if (mtr) { openMgScoreSheet(mtr.getAttribute('data-mt-report')); return; }`.

`computeTeamRunTimeline`: in the pool branch compute `const ahead = list.filter(m => m.phase === 'pool' && m.status !== 'final' && m.net === n.net && (Number(m.queue_order)||0) < (Number(n.queue_order)||0)); const afterGame = ahead.length ? Math.max(...ahead.map(m => Number(m.queue_order)||0)) : null;` and add `id: n.id, phase: 'pool', side: null, afterGame` to `next`; the bracket branch adds `id: n.id, phase: 'main', side: n.side || null, afterGame: null`.

My Team `nextStrip`:
```js
  const nx = tl.next;
  const stageWord = !nx ? '' : nx.phase === 'main'
    ? ('Bracket · ' + (nx.side === 'grand_final' ? 'Championship' : nx.side === 'losers' ? 'Losers' : 'Winners'))
    : 'Pool play';
  const nextStrip = nx ? `<div class="mt-next">
      ${nx.net ? `<div class="mtv-ntile"><span class="mtv-ntl">Net</span><b class="mtv-ntn">${escapeHTML(String(nx.net))}</b></div>` : ''}
      <div class="mtv-nbody">
        <div class="mtv-nhead"><span class="mt-nl">Your next game</span></div>
        <div class="mtv-nopp"><span class="mtv-nvs">vs</span><b>${escapeHTML(nx.oppName || 'TBD')}</b></div>
        ${nx.afterGame ? `<div class="mtv-nwhen">after G${escapeHTML(String(nx.afterGame))}</div>` : ''}
      </div>
      <div class="mtv-nfoot"><span class="mtv-nstage${nx.side === 'losers' ? ' is-elim' : ''}">${escapeHTML(stageWord)}</span>${(state.account && nx.id) ? `<button type="button" class="mtv-obtn" data-mt-report="${escapeHTML(String(nx.id))}">${nx.isNow ? 'Finish game' : 'Report score'}</button>` : ''}</div>
    </div>` : '';
```
CSS: `.mt-next` edit (align-items stretch, gap 12, padding 11px 12px, flex-wrap wrap); append `.mtv-ntile/.mtv-ntl/.mtv-ntn/.mtv-nbody/.mtv-nopp/.mtv-nvs/.mtv-nopp b/.mtv-nhead/.mtv-nwhen/.mtv-nfoot/.mtv-nstage/.is-elim/.mtv-obtn` verbatim from `_rounds.css:1876-1968` (keeping `font-size: 13.5px !important` on `.mtv-obtn`, PORT NOTE) plus `.pl-tip`; the sheet overrides: `#mgss-sheet .mgv-sccard { width: min(380px, calc(100vw - 1.25rem)); }`, `.mgv-scb { width: 40px; height: 40px; border-radius: 10px; font-size: 18px !important; }`, `.mgv-scval { min-width: 46px; font: 800 26px var(--font-display); }`, `.mgv-scfoot { display: flex; flex-direction: column; gap: 8px; }`, `.mgv-sclive { width: 100%; height: 42px; min-height: 0; border: 0; border-radius: 13px; background: #fff; box-shadow: 0 1px 2px rgba(20,20,22,.05), 0 0 0 1px var(--border); font: 650 14px 'Inter', sans-serif; color: var(--ink); }`; inside the desktop block `body.pd-public-active .mt-next { flex-wrap: nowrap; } body.pd-public-active .mtv-nfoot { flex: none; margin: 0 0 0 auto; padding-top: 0; border-top: 0; }`.

- [ ] **Step 3: Suite green, commit + push `v2026.08.25.3`.**

---

### Task 4: The sample bracket before seeding

**Files:**
- Modify: `public/app.js` — new `buildBracketPreviewHTML(show, teams)` before `buildBracketPageHTML`; the `pre` branch of `buildBracketPageHTML`; the hub Bracket row (~3585-3587)
- Modify: `public/styles.css` — append `.bk-pv*`
- Test: `test/bracket-page.test.js` (both pre describes), `test/tournament-round.test.js`

- [ ] **Step 1: Failing tests** — pre state: `class="bk-pv"`, `>Sample bracket<`, `4 teams registered so far` (setup) / `4 teams in the tournament` (pools), `class="bt-sides"` with `>Championship<`, `class="bt-name bt-tbd">Seed 1<`, `>Winner of G1<`, `class="bk-pv-pan"`, `data-role="bt-pan"`, `1 of 2 games done` (pools), `data-pools-tab="seeding"` kept (pools), absent (setup), no `pd-bk-pre`, no em dash; hub: no `is-locked`, `Double elimination · all 6 games`.

- [ ] **Step 2: Implement**

```js
// The SAMPLE bracket (design round 2026-08-24, Mike: "a sample bracket based off the number of registered
// teams"). Built from generateDoubleElim(N) — the same generator tdbGenerateBracket uses — rendered on the
// real .bt-* furniture with data-mid / data-next so layoutBracketTree centres and connects it. Every slot
// is a placeholder ("Seed 3", "Winner of G4"); nothing claims to be a result.
function buildBracketPreviewHTML(show, teams) {
  const N = (teams || []).length;
  const gen = generateDoubleElim(N, !!(show && show.grand_final_reset));
  const real = gen.realMatches || [];
  if (!real.length) return '';
  const synth = real.map((m) => ({ id: m.key, side: m.side, round: m.round, slot: m.slot, round_label: m.key }));
  const gn = bracketGameNumbers(synth.slice());
  const gOf = (key) => gn.byId[key] ? 'G' + gn.byId[key] : key;
  const src = (s) => !s ? 'TBD' : s.seed ? ('Seed ' + s.seed) : ((s.type === 'winner' ? 'Winner of ' : 'Loser of ') + gOf(s.of));
  const sideDefs = [['winners', 'Winners'], ['losers', 'Losers'], ['grand_final', 'Championship']].filter(([s]) => real.some((m) => m.side === s));
  let side = state.bracketSide || 'winners';
  if (!sideDefs.some(([s]) => s === side)) side = sideDefs[0][0];
  const sideMatches = real.filter((m) => m.side === side);
  const rounds = [...new Set(sideMatches.map((m) => m.round))].sort((a, b) => a - b);
  const maxRound = Math.max(...sideMatches.map((m) => m.round));
  const cols = rounds.map((r) => {
    const rm = sideMatches.filter((m) => m.round === r).sort((a, b) => a.slot - b.slot);
    const range = rm.length === 1 ? gOf(rm[0].key) : gOf(rm[0].key) + '–' + gOf(rm[rm.length - 1].key);
    const name = side === 'grand_final' ? (r === 1 ? 'Championship' : '') : (r === maxRound && sideDefs.length > 1 ? 'Semifinals' : '');
    const label = name ? `${name}<span class="bk-gid">${escapeHTML(range)}</span>` : escapeHTML(range);
    return `<div class="bt-col"><div class="bt-rlabel">${label}</div>${rm.map((m) => {
      const next = m.winnerNext && m.winnerNext.key ? ` data-next="${escapeHTML(m.winnerNext.key)}"` : '';
      return `<div class="bt-node" data-mid="${escapeHTML(m.key)}"${next}><div class="bt-meta">${escapeHTML(gOf(m.key))}${m.isReset ? ' · if necessary' : ''}</div>
        <div class="bt-row"><span class="bt-name bt-tbd">${escapeHTML(src(m.aSource))}</span></div><div class="bt-vs">vs</div><div class="bt-row"><span class="bt-name bt-tbd">${escapeHTML(src(m.bSource))}</span></div></div>`;
    }).join('')}</div>`;
  }).join('');
  const tabs = `<div class="bt-sides">${sideDefs.map(([s, lbl]) => `<button type="button" data-role="tv2-bracket-side" data-side="${s}" class="${s === side ? 'on' : ''}">${lbl}</button>`).join('')}</div>`;
  const ss = { winners: 'Lose once and you drop to the losers side.', losers: 'Lose here and you are out.', grand_final: 'The winners side champion meets the losers side champion.' }[side] || '';
  return `${tabs}<div class="bt-bar"><span class="bt-hint">Sample shape · pinch or drag to zoom</span></div>
    <div class="bk-pv-pane"><div class="bk-pv-ss">${ss}</div>
    <div class="bt-pan pd-bk-ro bk-pv-pan" data-role="bt-pan"><div class="bt-canvas" data-role="bt-canvas"><svg class="bt-links" data-role="bt-links" xmlns="http://www.w3.org/2000/svg"></svg><div class="bt-cols" data-role="bt-cols">${cols}</div></div></div></div>`;
}
```
`pre` branch: `const games = generateDoubleElim(teams.length, !!show.grand_final_reset).realMatches.filter((m) => !m.isReset).length;` → head `<div class="bk-pv"><div class="bk-pv-h">Sample bracket</div><div class="bk-pv-s">Built from the <b>${teams.length} teams</b> ${isReg ? 'registered so far' : 'in the tournament'}. Double elimination, so there are two sides: win and you stay on the winners side, lose and you get a second life on the losers side. Seeds fill in when the last pool game is played. The shape stays the same.</div></div>` + `buildBracketPreviewHTML(show, teams)` (or, with fewer than 2 teams, the existing paragraph) + `${progress}${seedChip}`. Hub row: `rows.push(row('data-tn-view="bracket"', '', ICON.trophy, 'Bracket', 'Double elimination · all ' + games + ' games', CHEV))` for both the setup and pools cases (with `games` from the same helper; if `teams.length < 2` keep prod's sub).
CSS (verbatim except the shim): `.bk-pv`, `.bk-pv-h`, `.bk-pv-s`, `.bk-pv-s b`, `.bk-pv-pan .bt-node { background: var(--surface-2); border-style: dashed; }`, `.bk-pv-pan .bt-meta { color: var(--muted); }`, `.bk-pv-pane .bk-pv-ss { margin: 0 0 8px; }`, `.bk-pv-ss { font: 400 12px 'Inter', sans-serif; color: var(--muted); text-wrap: pretty; }` — PORT NOTE: `_rounds.css:2113-2116` (`height:auto; overflow-x:auto; .bt-canvas { position:relative }`) is the prototype's no-JS crutch and is NOT ported; `layoutBracketTree` sizes and pans the preview like the live tree.

- [ ] **Step 3: Suite green, commit + push `v2026.08.25.4`.**

---

### Task 5: Verification drive + vault

- [ ] In Mike's Chrome on prod (extension connected), read-only unless a score is entered on a REAL game (do not — prod is mid-tournament): hub rows at 390; pools rows (vs/win/DONE/tip/You line); bracket live at 1:1 with centred connectors, Semifinals/Championship labels, side tabs hold; the sample bracket via a synthetic setup tournament rendered in a frame with the poll neutralised; My Team card; the score card opened on an upcoming game and CLOSED without saving (write legs stubbed in the frame); 1280 for each; console clean; prod bytes.
- [ ] Vault: log, current, decisions (public scoring returns; 1:1 view; the sample bracket; the one-card decision), debugging (anything new), NOW, Tasks (C98 done), 12-history `task-#2-tournament-handoff-session18.md`.

## Self-review
- Spec coverage: copy sweep (T1) · hub rows (T1, Bracket row T4) · pools rows + You line + tip (T1/T3) · geometry/labels/view/tabs/scores (T2) · public scoring + card + My Team (T3) · sample bracket (T4) · desktop clamps (T2/T3) · dangling comma (T1) · verify + vault (T5).
- Names: `teamNetRange`, `canScoreMatch`, `mgScoreHint`, `buildBracketPreviewHTML`, `next.id/phase/side/afterGame`, `data-pg-score`, `data-mt-report` — consistent across tasks and tests.
