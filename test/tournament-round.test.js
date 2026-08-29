// The Tournament design round (2026-08-25, Mike's Claude Design handoff) — locks for what the port changed:
// "Championship, never Final" on every player-facing string, the hub row grammar, the pools row grammar
// (A vs B with the winner in .win, DONE), the You row's net line, the pure teamNetRange helper, and
// source-level guards against the prototype crutches the recon said must NOT ship. Same vm-sandbox harness
// as manage-page.test.js; the suite has no DOM.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const pure = require('../public/pure.js');
const strip = (s) => s.replace(/\r\n/g, '\n');
const mgGuardSrc = readFileSync(new URL('../public/manage.js', import.meta.url), 'utf8');
const appSrcText = strip(readFileSync(new URL('../public/app.js', import.meta.url), 'utf8')
  + '\n' + mgGuardSrc);   // C102: the client is two files; a guard over one would pass vacuously
const cssText = strip(readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');

function loadApp() {
  const pureSrc = readFileSync(new URL('../public/pure.js', import.meta.url), 'utf8');
  const appSrc = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const mgSrc = readFileSync(new URL('../public/manage.js', import.meta.url), 'utf8');
  const noop = () => {};
  const emptyList = { forEach: noop, length: 0, item: () => null };
  const makeEl = () => ({
    style: {}, dataset: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    setAttribute: noop, getAttribute: () => null, removeAttribute: noop,
    appendChild: noop, removeChild: noop, remove: noop,
    addEventListener: noop, removeEventListener: noop,
    querySelector: () => null, querySelectorAll: () => emptyList,
    closest: () => null, contains: () => false,
    textContent: '', innerHTML: '', scrollTop: 0, offsetHeight: 0,
  });
  const documentStub = {
    readyState: 'loading', // keeps the bottom bootstrap from calling init() at load
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => emptyList,
    createElement: () => makeEl(), createDocumentFragment: () => makeEl(),
    addEventListener: noop, removeEventListener: noop,
    head: makeEl(), body: makeEl(), documentElement: makeEl(),
  };
  const supaStub = {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: noop } } }),
      getSession: async () => ({ data: { session: null } }),
      getUser: async () => ({ data: { user: null } }),
    },
    from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }) }),
    channel: () => ({ on: () => ({ subscribe: noop }) }),
    removeChannel: noop, rpc: async () => ({ data: null, error: null }),
  };
  const windowStub = {
    supabase: { createClient: () => supaStub },
    addEventListener: noop, removeEventListener: noop,
    matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop, removeEventListener: noop }),
    location: { href: 'http://localhost/', search: '', hash: '', pathname: '/', reload: noop },
    navigator: { onLine: true, userAgent: 'node', serviceWorker: { register: async () => ({}) } },
    requestAnimationFrame: noop, cancelAnimationFrame: noop,
    setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop, scrollTo: noop,
  };
  windowStub.window = windowStub;
  const localStorageStub = { getItem: () => null, setItem: noop, removeItem: noop, clear: noop, key: () => null, length: 0 };
  const sandbox = {
    window: windowStub, document: documentStub, localStorage: localStorageStub,
    navigator: windowStub.navigator, location: windowStub.location,
    requestAnimationFrame: noop, cancelAnimationFrame: noop,
    setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop,
    console, SUPABASE_URL: 'http://localhost', SUPABASE_KEY: 'anon',
  };
  sandbox.globalThis = sandbox; sandbox.self = sandbox;
  const epilogue = `
    ;globalThis.__bridge = {
      hub: () => buildTournamentHubHTML(),
      pools: () => buildPoolsSchedulePageHTML(),
      myteam: () => buildMyTeamPageHTML(),
      bracketNode: (m, opts) => buildBracketNodeHTML(m, [m], state.tournamentTeams, false, new Set(), {}, { byId: {}, byRoundLabel: {} }, opts || { readOnly: true }),
      sheet: (m, pick) => buildMgScoreSheetHTML(m, pick),
      canScore: (m) => canScoreMatch(m),
      bracketPage: () => buildBracketPageHTML(),
      setSide: (s) => { state.bracketSide = s; },
      getState: () => state,
      setPoolFilter: (v) => { pdPoolFilter = v; },
      setTournamentView: (v) => { pdTournamentView = v; },
    };`;
  const context = vm.createContext(sandbox);
  vm.runInContext(pureSrc, context, { filename: 'pure.js' });
  vm.runInContext(mgSrc, context, { filename: 'manage.js' });   // C102: the Manage block loads before app.js, as in index.html
  vm.runInContext(appSrc + epilogue, context, { filename: 'app.js' });
  return sandbox.__bridge;
}

const bridge = loadApp();

// 2 pools, 4 teams; t1 "Ballin" is MY team (claimed player p1 on t1), 1-0 in pool A with a next game on net 2.
const POOLS = [{ id: 'p1', label: 'A' }, { id: 'p2', label: 'B' }];
const TEAMS = [
  { id: 't1', name: 'Ballin', pool_id: 'p1' },
  { id: 't2', name: 'Dinks', pool_id: 'p1' },
  { id: 't3', name: 'Block Party', pool_id: 'p2' },
  { id: 't4', name: 'Net Gains', pool_id: 'p2' },
];
const MATCHES = [
  { id: 'gA1', pool_id: 'p1', phase: 'pool', net: 1, queue_order: 1, status: 'final', team_a_id: 't1', team_b_id: 't2', winner_team_id: 't1', score_a: 15, score_b: 12 },
  { id: 'gA2', pool_id: 'p1', phase: 'pool', net: 2, queue_order: 2, status: 'scheduled', team_a_id: 't2', team_b_id: 't1' },
  { id: 'gB1', pool_id: 'p2', phase: 'pool', net: 3, queue_order: 1, status: 'final', team_a_id: 't3', team_b_id: 't4', winner_team_id: 't4', score_a: 18, score_b: 21 },
];

function setState(extra = {}) {
  const st = bridge.getState();
  Object.assign(st, {
    tournaments: [{ id: 'T', name: 'August 2026 Tournament', status: 'pools', net_count: 3 }],
    activeTournamentId: 'T',
    tournamentTeams: TEAMS, tournamentMatches: MATCHES, tournamentPools: POOLS,
    account: { id: 'u1', email: 'p@x.y' }, isAdmin: false, loaded: true,
    // myTeamInfo() resolves through resolveMyTeam(account.id, teamMembers): the member row carries claimedBy
    teamMembers: [{ id: 'p1', teamId: 't1', teamName: 'Ballin', name: 'Mikey Olas', initials: 'MO', claimedBy: 'u1' }],
    ...extra,
  });
}

describe('teamNetRange (pure) — the nets MY pool games sit on, in poolNetRange grammar', () => {
  const g = (a, b, net) => ({ phase: 'pool', team_a_id: a, team_b_id: b, net });
  it('contiguous, single, non-contiguous, unknown team, no net', () => {
    expect(pure.teamNetRange('t1', [g('t1', 't2', 1), g('t1', 't3', 2), g('t2', 't3', 3)])).toBe('Nets 1-2');
    expect(pure.teamNetRange('t1', [g('t1', 't2', 3)])).toBe('Net 3');
    expect(pure.teamNetRange('t1', [g('t1', 't2', 1), g('t1', 't3', 3)])).toBe('Nets 1, 3');
    expect(pure.teamNetRange('t9', [g('t1', 't2', 1)])).toBe('');
    expect(pure.teamNetRange('t1', [g('t1', 't2', null)])).toBe('');
  });
});

describe('"Championship, never Final" (player-facing)', () => {
  it('the pure labels', () => {
    expect(pure.bracketRoundLabel({ side: 'grand_final', round: 1 })).toBe('Championship');
    expect(pure.bracketRoundLabel({ side: 'grand_final', round: 2 })).toBe('Championship (if necessary)');
    expect(pure.bracketRoundLabel({ side: 'winners', round: 2 })).toBe('Winners round 2');
    expect(pure.tournamentStageModel({ status: 'completed' }, []).stageLabel).toBe('Complete');
  });
  it('the public bracket + hub builders carry no Final string', () => {
    const pub = appSrcText.slice(appSrcText.indexOf('function buildBracketNodeHTML('), appSrcText.indexOf('function resolveRegisterTournament('));
    const code = pub.replace(/\/\/[^\n]*/g, ''); // comments may still mention the old word
    expect(code).not.toMatch(/['"`]Final['"`]/);
    expect(code).not.toContain('games final');
    expect(code).not.toContain('in the final');
    expect(code).toContain("['grand_final', 'Championship']");
    expect(code).toContain("' · Done'");
    expect(code).toContain('in the championship');
  });
});

describe('hub rows (design round 2026-08-23)', () => {
  it('record on the sub line, a sentence in the stat, the games-done caption, the leader kept', () => {
    setState();
    const html = bridge.hub();
    expect(html).toContain('<span class="tn-rec">1-0</span>');
    expect(html).toContain('Next on <b>net 2</b>');
    expect(html).not.toContain('Net 2 next');
    expect(html).toContain('<span class="tn-statsub">games done</span>');
    expect(html).toMatch(/tn-prog-n">2 of 3 games</);
    expect(html).toContain('<span class="tn-sub">Where teams stand</span>');
    expect(html).toContain('Ballin'); // the leader name stays in the stat (Mike 2026-08-25)
    expect(html).not.toContain('>Leader<');
  });
});

describe('pools rows (design round 2026-08-22)', () => {
  it('"A vs B" with the winner in .win, DONE, "games done", and the You net line on the pool tab only', () => {
    setState();
    bridge.setTournamentView('pools'); bridge.setPoolFilter('A');
    const html = bridge.pools();
    expect(html).toContain('<span class="win">');
    expect(html).not.toContain('class="def"');
    expect(html).not.toContain('def.');
    expect(html).toContain('>DONE<');
    expect(html).not.toContain('>FINAL<');
    expect(html).toMatch(/games? done</);
    expect(html).toContain('<span class="pl-youname">');
    expect(html).toContain('<span class="pl-younet">You play at nets 1-2</span>');
    bridge.setPoolFilter('seeding');
    const seeding = bridge.pools();
    expect(seeding).toContain('pl-youtag');
    expect(seeding).not.toContain('pl-younet');
  });
  it('a spectator with no team sees no You line and no chip', () => {
    setState({ account: null, myClaimedPlayer: null, tournamentPickedTeamId: null, teamMembers: [] });
    bridge.setTournamentView('pools'); bridge.setPoolFilter('A');
    const html = bridge.pools();
    expect(html).not.toContain('pl-younet');
    expect(html).not.toContain('<b>');
  });
});

describe('bracket geometry + view (design round 2026-08-24, Mike 2026-08-25: 1:1 open, no re-fit on a side switch)', () => {
  const layout = appSrcText.slice(appSrcText.indexOf('function layoutBracketTree()'), appSrcText.indexOf('let btView = null;'));
  it('centres a fed game on its feeders from LAYOUT measurement and draws stub + shared riser + horizontal', () => {
    expect(layout).toContain('const offsetIn = (node)');
    expect(layout).toContain("n.style.top = dy + 'px'");
    expect(layout).toMatch(/d="M\$\{mx\} \$\{lo\} V\$\{hi\}"/);   // the one shared riser
    expect(layout).toMatch(/d="M\$\{f\.x \+ f\.w\} \$\{ys\[i\]\} H\$\{mx\}"/); // a stub per feeder (keeps .on per feeder)
    expect(layout).not.toContain('offsetLeft, y: n.offsetTop'); // the raw reads are gone
  });
  it('opens at 1:1 anchored to the first column; the pane hugs the tree', () => {
    expect(layout).toContain('if (btScale == null) { btScale = 1; btX = 0; btY = 0; }');
    expect(layout).toContain('const vh = Math.min(Math.max(240, H), vhCap);');
  });
  it('a side-tab switch never re-fits', () => {
    const i = appSrcText.indexOf("if (role === 'tv2-bracket-side')");
    const h = appSrcText.slice(i, i + 500);
    expect(h).not.toContain('btResetView()');
    expect(h).toContain('btX = 0; btY = 0;');
  });
  it('Semifinals / Championship column labels over a .bk-gid game range', () => {
    const b = appSrcText.slice(appSrcText.indexOf('function buildBracketHTML('), appSrcText.indexOf('function layoutBracketTree()'));
    expect(b).toContain("'Semifinals'");
    expect(b).toContain("'Championship'");
    expect(b).toContain('<span class="bk-gid">');
  });
  it('the tabs hold "Championship" on one line, the label lifts out of the column flow', () => {
    expect(cssText).toContain('.bt-sides button { font-size: 14px !important; white-space: nowrap; }');
    expect(cssText).toMatch(/\.bt-rlabel \{ position: absolute; top: 0; left: 0; right: 0;/);
    expect(cssText).toMatch(/\.bt-col \{ position: relative;[^}]*padding-top: 34px; \}/);
  });
});

describe('public scoring for signed-in players (Mike 2026-08-25, reversing the 2026-07-11 read-only call)', () => {
  it('canScoreMatch: admin any two-team game; a player only a not-final one; anon nothing', () => {
    setState();
    expect(bridge.canScore(MATCHES[1])).toBe(true);   // scheduled, two teams
    expect(bridge.canScore(MATCHES[0])).toBe(false);  // final -> organizer-only (0039)
    expect(bridge.canScore({ id: 'x', team_a_id: 't1', team_b_id: null, status: 'scheduled' })).toBe(false);
    setState({ isAdmin: true });
    expect(bridge.canScore(MATCHES[0])).toBe(true);
    setState({ account: null, teamMembers: [] });
    expect(bridge.canScore(MATCHES[1])).toBe(false);
  });
  it('pool rows: the not-final games carry the hook, the finished one does not; the tip replaces the legend', () => {
    setState(); bridge.setTournamentView('pools'); bridge.setPoolFilter('A');
    const html = bridge.pools();
    expect(html).toContain('data-pg-score="gA2"');
    expect(html).not.toContain('data-pg-score="gA1"');
    expect(html).toContain('<p class="pl-sect pl-tip">Tap any game to enter its score.</p>');
    expect(html).not.toContain('pl-legend');
    setState({ account: null, teamMembers: [] });
    const anon = bridge.pools();
    expect(anon).not.toContain('data-pg-score');
    expect(anon).not.toContain('pl-tip');
  });
  it('bracket nodes: a two-team not-final node is tappable for a signed-in player; TBD and final are not', () => {
    setState();
    const open = { id: 'b1', phase: 'main', side: 'winners', round: 1, slot: 0, status: 'scheduled', team_a_id: 't1', team_b_id: 't2' };
    const html = bridge.bracketNode(open);
    expect(html).toContain('data-pg-score="b1"');
    expect(html).toContain(' tappable');
    expect(bridge.bracketNode({ ...open, id: 'b2', team_b_id: null, source_b: 'Winner of WB R1 M1' })).not.toContain('data-pg-score');
    expect(bridge.bracketNode({ ...open, id: 'b3', status: 'final', winner_team_id: 't1', score_a: 21, score_b: 15 })).not.toContain('data-pg-score');
    setState({ account: null, teamMembers: [] });
    expect(bridge.bracketNode(open)).not.toContain('data-pg-score');
  });
  it('the score sheet: rule sentence from the tournament settings, a scoreless bracket winner can be saved, a pool game cannot', () => {
    setState({ tournaments: [{ id: 'T', name: 'August 2026 Tournament', status: 'bracket', pool_target: 15, pool_cap: 20, bracket_target: 21, bracket_cap: 25, win_by_2: true }] });
    const poolGame = { ...MATCHES[1], tournament_id: 'T' };
    const pool = bridge.sheet(poolGame, null);
    expect(pool).toContain('Pool games go to 15, win by 2, cap 20.');
    expect(pool).toContain('data-mgss="final" disabled');
    expect(pool).not.toContain('&mdash;');
    const br = { id: 'b1', tournament_id: 'T', phase: 'main', side: 'winners', round: 1, status: 'scheduled', team_a_id: 't1', team_b_id: 't2', score_a: 0, score_b: 0 };
    const bracket = bridge.sheet(br, 'a');
    expect(bracket).toContain('Bracket games go to 21, win by 2, cap 25.');
    expect(bracket).toContain('>Save winner · Ballin<');
    expect(bracket).not.toContain('data-mgss="final" disabled');
    expect(bracket).toContain('>Save live score<');
    const champ = bridge.sheet({ ...br, id: 'gf', side: 'grand_final', round: 1 }, null);
    expect(champ).toContain('The championship goes to 21, win by 2, no cap.');
    expect(champ).toContain('data-mgss="final" disabled'); // no pick yet
  });
  it('the sheet is gated by canScoreMatch, not by isAdmin; the live save refuses 0-0; a public save repaints the tab', () => {
    // C101 Task 5: the window was a fixed 5200 characters, which the new doClear pushed the tail out of.
    // It now runs to the next function, so the whole body is read whatever gets added inside it.
    const fn = appSrcText.slice(appSrcText.indexOf('function openMgScoreSheet('), appSrcText.indexOf('async function mgPoolsDraw('));
    expect(fn).not.toContain('if (!state.isAdmin) return;');
    expect(fn).toContain('if (!canScoreMatch(match)) return;');
    expect(fn).toContain("fail('Add a point to at least one team first.')");
    expect(fn).toContain("if (activeMainTab === 'manage') repaintManage(); else partialRenderTournament();");
    expect(fn).toContain("tdbSubmitBracketResult(match, pick, '', '')");
    expect(appSrcText).toContain("e.target.closest('[data-pg-score]')");
    expect(appSrcText).toContain("e.target.closest('[data-mt-report]')");
  });
  it('My Team: tile only when a net is known, "after Gn" from the queue, Report score on the next game', () => {
    setState();
    const html = bridge.myteam();
    expect(html).toContain('class="mtv-ntile"');
    expect(html).toContain('class="mtv-ntn">2<');
    expect(html).toContain('class="mtv-nvs">vs<');
    expect(html).toContain('<b>Dinks</b>');
    expect(html).toContain('class="mtv-nstage">Pool play<');
    expect(html).toContain('data-mt-report="gA2"');
    expect(html).toContain('>Report score<');
    expect(html).not.toContain('mtv-nwhen'); // nothing ahead of gA2 on net 2
    const t = pure.computeTeamRunTimeline('t1', MATCHES, TEAMS);
    expect(t.next).toMatchObject({ id: 'gA2', phase: 'pool', side: null, afterGame: null, net: 2 });
    const queued = pure.computeTeamRunTimeline('t1', [
      ...MATCHES.filter((m) => m.id !== 'gA2'),
      { id: 'x1', pool_id: 'p1', phase: 'pool', net: 2, queue_order: 2, status: 'scheduled', team_a_id: 't3', team_b_id: 't4' },
      { id: 'gA2', pool_id: 'p1', phase: 'pool', net: 2, queue_order: 4, status: 'scheduled', team_a_id: 't2', team_b_id: 't1' },
    ], TEAMS);
    expect(queued.next.afterGame).toBe(2);
    const bracketNext = pure.computeTeamRunTimeline('t1', [{ id: 'b1', phase: 'main', side: 'losers', round: 1, net: null, status: 'scheduled', team_a_id: 't1', team_b_id: 't2', queue_order: 1 }], TEAMS);
    expect(bracketNext.next).toMatchObject({ id: 'b1', phase: 'main', side: 'losers', afterGame: null, net: null });
  });
});

describe('the sample bracket before seeding (design round 2026-08-24, Mike 2026-08-25: build it, keep the seeding chip)', () => {
  it('registration: a sample built from the registered count, three sides, placeholders only, no chip', () => {
    setState({ tournaments: [{ id: 'T', name: 'August 2026 Tournament', status: 'setup', registration_open: true, grand_final_reset: true }], tournamentMatches: [] });
    bridge.setTournamentView('bracket'); bridge.setSide(null);
    const html = bridge.bracketPage();
    expect(html).toContain('class="bk-pv"');
    expect(html).toContain('>Sample bracket<');
    expect(html).toContain('<b>4 teams</b> registered so far');
    expect(html).toContain('Seeds fill in when the last pool game is played. The shape stays the same.');
    expect(html).not.toContain('&mdash;');
    expect(html).toContain('class="bt-sides"');
    expect(html).toContain('>Championship<');
    expect(html).toContain('class="bt-pan pd-bk-ro bk-pv-pan" data-role="bt-pan"');
    expect(html).toContain('class="bt-name bt-tbd">Seed 1<');
    expect(html).toContain('class="bt-name bt-tbd">Seed 4<');
    expect(html).toContain('>Winner of G1<');
    expect(html).toContain('data-mid="W1-0" data-next="W2-0"');
    expect(html).not.toContain('pd-bk-pre"');
    expect(html).not.toContain('data-pools-tab="seeding"');
    expect(html).not.toContain('bt-livetag');
    // Winners side: G1–G2 then the Semifinals column (G3, feeds the championship)
    expect(html).toContain('Semifinals<span class="bk-gid">');
  });
  it('the side tabs swap panes through state.bracketSide; the championship column reads Championship + the if-necessary game', () => {
    setState({ tournaments: [{ id: 'T', name: 'August 2026 Tournament', status: 'setup', grand_final_reset: true }], tournamentMatches: [] });
    bridge.setTournamentView('bracket'); bridge.setSide('grand_final');
    const html = bridge.bracketPage();
    expect(html).toContain('data-side="grand_final" class="on"');
    expect(html).toContain('Championship<span class="bk-gid">');
    expect(html).toContain('· if necessary</div>');
    expect(html).toContain('The winners side champion meets the losers side champion.');
    bridge.setSide('losers');
    expect(bridge.bracketPage()).toContain('>Loser of G1<');
    bridge.setSide(null);
  });
  it('pools: same sample with "in the tournament" copy, the progress bar and the seeding chip kept', () => {
    setState();
    bridge.setTournamentView('bracket'); bridge.setSide(null);
    const html = bridge.bracketPage();
    expect(html).toContain('<b>4 teams</b> in the tournament');
    expect(html).toContain('2 of 3 games done');
    expect(html).toContain('data-tn-view="pools" data-pools-tab="seeding"');
    expect(html).not.toContain('battling through pools');
  });
  it('the hub Bracket row is never dead and says how many games the draw will have', () => {
    setState();
    const html = bridge.hub();
    expect(html).not.toContain('is-locked');
    expect(html).toContain('Double elimination · all 6 games'); // 4 teams: W1-0, W1-1, W2-0, L1-0, L2-0, GF (the reset is not promised)
    expect(pure.generateDoubleElim(4, true).realMatches.filter((m) => !m.isReset).length).toBe(6);
  });
});

describe('port guards (things the recon said must NOT ship)', () => {
  it('the prototype bracket shim and the retired grammar are absent from styles.css', () => {
    expect(cssText).not.toMatch(/\.bt-pan\s*>\s*\.bt-canvas\s*\{[^}]*position:\s*relative/);
    expect(cssText).not.toMatch(/\.pl-g \.gt \.def\b/);
    expect(cssText).toContain('.pl-g .gt .win { color: oklch(0.40 0.09 150); }');
    expect(cssText).toContain('.tn-statsub {');
  });
  it('the desktop Manage bar clamp is a real rule now (the dangling-comma bug)', () => {
    expect(cssText).toMatch(/body\.pd-public-active \.mgp-movebar \{ left: 50%; transform: translateX\(-50%\); width: 100%; max-width: 720px; \}/);
  });
  it('no em dash in the new player-facing strings', () => {
    const pub = appSrcText.slice(appSrcText.indexOf('function buildBracketHTML('), appSrcText.indexOf('function resolveRegisterTournament('));
    expect(pub).not.toContain('&mdash;');
  });
});
