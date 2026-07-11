// Slice 2 (2026-07-09, spec §13.3) — behavior tests for the public Bracket page pure helpers in
// public/pure.js: bracketOutcome (completed-state champion + runner-up + deciding game) and
// bracketStatusLine (live-state "current round" label). Loaded via Node CJS require, matching the suite.
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const pure = require('../public/pure.js');
const { bracketOutcome, bracketStatusLine } = pure;

const TEAMS = [
  { id: 't1', name: 'Dink Responsibly' },
  { id: 't2', name: 'Block Party' },
  { id: 't3', name: 'Served Cold' },
  { id: 't4', name: 'Sandbaggers' },
];

// A finished double-elim where the winners-bracket team took the grand final in one game (no reset).
const COMPLETED_NO_RESET = [
  { id: 'w1', side: 'winners', round: 1, slot: 0, status: 'final', team_a_id: 't1', team_b_id: 't4', winner_team_id: 't1', queue_order: 1 },
  { id: 'w2', side: 'winners', round: 1, slot: 1, status: 'final', team_a_id: 't2', team_b_id: 't3', winner_team_id: 't2', queue_order: 2 },
  { id: 'wf', side: 'winners', round: 2, slot: 0, status: 'final', team_a_id: 't1', team_b_id: 't2', winner_team_id: 't1', queue_order: 3 },
  { id: 'lf', side: 'losers', round: 2, slot: 0, status: 'final', team_a_id: 't2', team_b_id: 't3', winner_team_id: 't2', queue_order: 5 },
  { id: 'gf', side: 'grand_final', round: 1, slot: 0, status: 'final', team_a_id: 't1', team_b_id: 't2', winner_team_id: 't1', queue_order: 6 },
];

// A finished double-elim that required a bracket reset (grand final game 2 decided it).
const COMPLETED_RESET = [
  { id: 'wf', side: 'winners', round: 2, slot: 0, status: 'final', team_a_id: 't1', team_b_id: 't2', winner_team_id: 't1', queue_order: 3 },
  { id: 'gf', side: 'grand_final', round: 1, slot: 0, status: 'final', team_a_id: 't1', team_b_id: 't2', winner_team_id: 't2', queue_order: 6 },
  { id: 'gf2', side: 'grand_final', round: 2, slot: 0, status: 'final', team_a_id: 't1', team_b_id: 't2', winner_team_id: 't1', queue_order: 7 },
];

describe('bracketOutcome', () => {
  it('returns null while no champion is decided', () => {
    const live = [
      { id: 'w1', side: 'winners', round: 1, slot: 0, status: 'final', team_a_id: 't1', team_b_id: 't4', winner_team_id: 't1', queue_order: 1 },
      { id: 'gf', side: 'grand_final', round: 1, slot: 0, status: 'scheduled', team_a_id: null, team_b_id: null, queue_order: 6 },
    ];
    expect(bracketOutcome(live, TEAMS)).toBeNull();
    expect(bracketOutcome([], TEAMS)).toBeNull();
    expect(bracketOutcome(null, TEAMS)).toBeNull();
  });

  it('names the champion, runner-up, and the deciding game (no reset)', () => {
    const o = bracketOutcome(COMPLETED_NO_RESET, TEAMS);
    expect(o.championId).toBe('t1');
    expect(o.championName).toBe('Dink Responsibly');
    expect(o.runnerUpId).toBe('t2');
    expect(o.runnerUpName).toBe('Block Party');
    expect(o.decidingMatchId).toBe('gf');
  });

  it('uses the reset game (grand final 2) as the decider when one was played', () => {
    const o = bracketOutcome(COMPLETED_RESET, TEAMS);
    expect(o.championId).toBe('t1');
    expect(o.runnerUpId).toBe('t2');
    expect(o.decidingMatchId).toBe('gf2');
  });
});

describe('bracketStatusLine', () => {
  it('returns null when nothing is in play (empty / all final)', () => {
    expect(bracketStatusLine([])).toBeNull();
    expect(bracketStatusLine(null)).toBeNull();
    expect(bracketStatusLine(COMPLETED_NO_RESET)).toBeNull();
  });

  it('names the round of the live game when one is live', () => {
    const main = [
      { id: 'w1', side: 'winners', round: 1, slot: 0, status: 'final', team_a_id: 't1', team_b_id: 't4', winner_team_id: 't1', queue_order: 1 },
      { id: 'wf', side: 'winners', round: 2, slot: 0, status: 'live', team_a_id: 't1', team_b_id: 't2', queue_order: 3 },
      { id: 'lb', side: 'losers', round: 1, slot: 0, status: 'scheduled', team_a_id: 't3', team_b_id: 't4', queue_order: 4 },
    ];
    expect(bracketStatusLine(main)).toBe('Winners round 2');
  });

  it('falls back to the soonest unplayed game (lowest queue_order) when nothing is live', () => {
    const main = [
      { id: 'lb', side: 'losers', round: 1, slot: 0, status: 'scheduled', team_a_id: 't3', team_b_id: 't4', queue_order: 4 },
      { id: 'wf', side: 'winners', round: 2, slot: 0, status: 'scheduled', team_a_id: 't1', team_b_id: 't2', queue_order: 3 },
    ];
    expect(bracketStatusLine(main)).toBe('Winners round 2');
  });

  it('labels the losers bracket and the grand final (incl. reset)', () => {
    expect(bracketStatusLine([{ id: 'l', side: 'losers', round: 3, status: 'live', team_a_id: 't1', team_b_id: 't2', queue_order: 5 }])).toBe('Losers round 3');
    expect(bracketStatusLine([{ id: 'g', side: 'grand_final', round: 1, status: 'live', team_a_id: 't1', team_b_id: 't2', queue_order: 6 }])).toBe('Grand final');
    expect(bracketStatusLine([{ id: 'g2', side: 'grand_final', round: 2, status: 'live', team_a_id: 't1', team_b_id: 't2', queue_order: 7 }])).toBe('Grand final (reset)');
  });

  it('ignores games missing a team (not yet playable)', () => {
    const main = [
      { id: 'gf', side: 'grand_final', round: 1, slot: 0, status: 'scheduled', team_a_id: null, team_b_id: null, queue_order: 6 },
    ];
    expect(bracketStatusLine(main)).toBeNull();
  });
});

// ── buildBracketPageHTML() restyle (Mike pick M, 2026-07-10 atom-up) ─────────────────────────────────────
// Same vm-sandbox harness as test/pools-page.test.js: app.js is a browser classic script (touches
// window/document/supabase at load), so we run it inside a Node `vm` sandbox with minimal browser stubs,
// pure.js loaded FIRST into the same context (its top-level declarations become globals app.js calls), and an
// appended epilogue bridges the lexically-scoped `state` + the builder out to the test.
//
// Pick M invariants under test: (1) the status pill is OUT of the header — status lives in ONE quiet line
// under the title, "● Live · Double elimination · <round>", bold-green ONLY when live; (2) pre + completed
// states are de-carded (flat, NO frosted .pd-card, NO .pd-bk-pill anywhere); (3) the pre state carries honest
// copy + the seeding-chip retarget (data-tn-view="pools" data-pools-tab="seeding"); (4) the bt-* tree stays
// present + read-only (pd-bk-ro) and the champions strip / persist line survive on completed.
function loadApp() {
  const pureSrc = readFileSync(new URL('../public/pure.js', import.meta.url), 'utf8');
  const appSrc = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
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
      build: () => buildBracketPageHTML(),
      getState: () => state,
    };`;
  const context = vm.createContext(sandbox);
  vm.runInContext(pureSrc, context, { filename: 'pure.js' });
  vm.runInContext(appSrc + epilogue, context, { filename: 'app.js' });
  return sandbox.__bridge;
}

const bridge = loadApp();

const BK_TEAMS = [
  { id: 't1', name: 'Ballin' },
  { id: 't2', name: 'Dinks' },
  { id: 't3', name: 'Block Party' },
  { id: 't4', name: 'Net Gains' },
];

// LIVE: winners round 1 final, winners round 2 in progress, no champion decided.
const BK_LIVE = [
  { id: 'w1', phase: 'main', side: 'winners', round: 1, slot: 0, status: 'final', team_a_id: 't1', team_b_id: 't2', winner_team_id: 't1', score_a: 21, score_b: 15 },
  { id: 'w2', phase: 'main', side: 'winners', round: 2, slot: 0, status: 'live', team_a_id: 't1', team_b_id: 't3', score_a: 12, score_b: 9 },
];

// COMPLETED: a decided grand final (round 1) — champion crowned (t1 Ballin over t3 Block Party).
const BK_DONE = [
  { id: 'w1', phase: 'main', side: 'winners', round: 1, slot: 0, status: 'final', team_a_id: 't1', team_b_id: 't2', winner_team_id: 't1', score_a: 21, score_b: 15 },
  { id: 'gf1', phase: 'main', side: 'grand_final', round: 1, slot: 0, status: 'final', team_a_id: 't1', team_b_id: 't3', winner_team_id: 't1', score_a: 21, score_b: 18 },
];

// PRE / pools running: no main-phase matches, pool games in progress (one final, one scheduled).
const BK_POOL = [
  { id: 'gA1', phase: 'pool', status: 'final', team_a_id: 't1', team_b_id: 't2', winner_team_id: 't1', score_a: 15, score_b: 12 },
  { id: 'gA2', phase: 'pool', status: 'scheduled', team_a_id: 't3', team_b_id: 't4' },
];

function bkSetState(tournament, matches) {
  const st = bridge.getState();
  Object.assign(st, {
    tournaments: [tournament],
    activeTournamentId: tournament.id,
    tournamentTeams: BK_TEAMS,
    tournamentMatches: matches,
    tournamentPools: [],
    account: null, teamMembers: [], isAdmin: false, bracketSide: null,
  });
}

describe('buildBracketPageHTML — live state (Mike pick M)', () => {
  let html;
  beforeEach(() => { bkSetState({ id: 'T', name: 'Summer Slam', status: 'bracket' }, BK_LIVE); html = bridge.build(); });

  it('renders ONE quiet status line "● Live · Double elimination · <round>" under the title', () => {
    expect(html).toContain('class="pd-bk-statusline"');
    expect(html).toContain('<span class="pd-bk-sl-dot"></span>');
    expect(html).toContain('<b>Live</b>');
    expect(html).toContain('Double elimination ·');
    expect(html).toContain('Winners round 2'); // bracketStatusLine focus = the live match
  });

  it('has NO header status pill and NO frosted card', () => {
    expect(html).not.toContain('pd-bk-pill');
    expect(html).not.toContain('pd-card');
    expect(html).not.toContain('pd-bk-hdr');
  });

  it('renders the read-only bt-* tree (UNTOUCHED, pd-bk-ro scope)', () => {
    expect(html).toContain('bt-pan');
    expect(html).toContain('pd-bk-ro');
  });

  it('keeps the header: back button + eyebrow + Barlow title "Bracket"', () => {
    expect(html).toContain('class="pd-pagehdr"');
    expect(html).toContain('class="pd-back"');
    expect(html).toContain('class="pd-htitle">Bracket<');
  });
});

describe('buildBracketPageHTML — pre state, registration (setup + open)', () => {
  let html;
  beforeEach(() => { bkSetState({ id: 'T', name: 'Summer Slam', status: 'setup', registration_open: true }, []); html = bridge.build(); });

  it('is flat (pd-bk-pre) with NO card and NO pill', () => {
    expect(html).toContain('class="pd-bk-pre"');
    expect(html).not.toContain('pd-card');
    expect(html).not.toContain('pd-bk-pill');
  });

  it('shows the honest registration copy (never "battling through pools")', () => {
    expect(html).toContain('The bracket comes after pool play');
    expect(html).not.toContain('battling through pools');
  });

  it('omits the seeding chip during registration (no seeds exist yet)', () => {
    expect(html).not.toContain('data-pools-tab="seeding"');
  });
});

describe('buildBracketPageHTML — pre state, pools running', () => {
  let html;
  beforeEach(() => { bkSetState({ id: 'T', name: 'Summer Slam', status: 'pools' }, BK_POOL); html = bridge.build(); });

  it('is flat (pd-bk-pre) with NO card', () => {
    expect(html).toContain('class="pd-bk-pre"');
    expect(html).not.toContain('pd-card');
  });

  it('carries the seeding chip retarget to the Pools Seeding tab (Task 2 wiring)', () => {
    expect(html).toContain('data-tn-view="pools" data-pools-tab="seeding"');
  });

  it('shows the live pool-progress line', () => {
    expect(html).toContain('1 of 2 games final');
  });
});

describe('buildBracketPageHTML — completed state (champions strip, de-carded)', () => {
  let html;
  beforeEach(() => { bkSetState({ id: 'T', name: 'Summer Slam', status: 'completed' }, BK_DONE); html = bridge.build(); });

  it('renders the matte-gold champions strip + persist line, unchanged logic', () => {
    expect(html).toContain('class="pd-bk-champbar"');
    expect(html).toContain('Champions — Ballin');
    expect(html).toContain('2–0'); // champion record via computeTeamRecord (won w1 + gf1)
    expect(html).toContain('class="pd-bk-persist"');
  });

  it('is de-carded and pill-free (no frosted card, no header pill)', () => {
    expect(html).not.toContain('pd-card');
    expect(html).not.toContain('pd-bk-pill');
  });

  it('renders the read-only bt-* tree (UNTOUCHED)', () => {
    expect(html).toContain('bt-pan');
    expect(html).toContain('pd-bk-ro');
  });

  it('emits no live status line when there is no live game', () => {
    expect(html).not.toContain('<b>Live</b>');
  });
});
