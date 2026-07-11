// Pools & schedule page rebuild (Mike pick H, 2026-07-10 atom-up) — behavior tests for the string
// builder buildPoolsSchedulePageHTML() in public/app.js. app.js is a browser classic script (it touches
// window/document/supabase at load), so — unlike the pure.js suites — we execute it inside a Node `vm`
// sandbox with minimal browser stubs. pure.js is loaded FIRST into the same context (its top-level
// function declarations become globals that app.js calls); an epilogue appended to app.js bridges the
// lexically-scoped `state` / `pdPoolFilter` / `pdTournamentView` and the builder out to the test.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const EN = '–'; // EN DASH — the record / score / header separator the builder emits

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
      build: () => buildPoolsSchedulePageHTML(),
      getState: () => state,
      setPoolFilter: (v) => { pdPoolFilter = v; },
      setTournamentView: (v) => { pdTournamentView = v; },
    };`;
  const context = vm.createContext(sandbox);
  vm.runInContext(pureSrc, context, { filename: 'pure.js' });
  vm.runInContext(appSrc + epilogue, context, { filename: 'app.js' });
  return sandbox.__bridge;
}

const bridge = loadApp();

// 2 pools (A/B), 4 teams (2 each), pool games incl. one live + one scheduled in pool A.
const POOLS = [{ id: 'p1', label: 'A' }, { id: 'p2', label: 'B' }];
const TEAMS = [
  { id: 't1', name: 'Ballin', pool_id: 'p1' },
  { id: 't2', name: 'Dinks', pool_id: 'p1' },
  { id: 't3', name: 'Block Party', pool_id: 'p2' },
  { id: 't4', name: 'Net Gains', pool_id: 'p2' },
];
const MATCHES = [
  { id: 'gA1', pool_id: 'p1', phase: 'pool', net: 1, queue_order: 1, status: 'final', team_a_id: 't1', team_b_id: 't2', winner_team_id: 't1', score_a: 15, score_b: 12 },
  { id: 'gA2', pool_id: 'p1', phase: 'pool', net: 1, queue_order: 2, status: 'live', team_a_id: 't1', team_b_id: 't2', score_a: 12, score_b: 9 },
  { id: 'gA3', pool_id: 'p1', phase: 'pool', net: 1, queue_order: 3, status: 'scheduled', team_a_id: 't1', team_b_id: 't2' },
  { id: 'gB1', pool_id: 'p2', phase: 'pool', net: 2, queue_order: 1, status: 'final', team_a_id: 't3', team_b_id: 't4', winner_team_id: 't4', score_a: 18, score_b: 21 },
];

function setState(extra = {}) {
  const st = bridge.getState();
  Object.assign(st, {
    tournaments: [{ id: 'T', name: 'Summer Slam', status: 'pools' }],
    activeTournamentId: 'T',
    tournamentTeams: TEAMS, tournamentMatches: MATCHES, tournamentPools: POOLS,
    account: null, teamMembers: [], isAdmin: false,
    ...extra,
  });
}

const count = (hay, needle) => hay.split(needle).length - 1;

describe('buildPoolsSchedulePageHTML — pool tab (default = first pool)', () => {
  let html;
  beforeEach(() => { setState(); bridge.setTournamentView('pools'); bridge.setPoolFilter('all'); html = bridge.build(); });

  it('renders a Pool A / Pool B / Seeding tab strip', () => {
    expect(html).toContain('class="pl-tab pl-on" data-pl-tab="A"');
    expect(html).toContain('data-pl-tab="B"');
    expect(html).toContain('data-pl-tab="seeding"');
    expect(html).toContain('>Pool A<');
    expect(html).toContain('>Pool B<');
    expect(html).toContain('>Seeding<');
    // exactly one tab is active, and it is Pool A (the first pool), not Seeding
    expect(count(html, 'pl-on')).toBe(1);
    expect(html).not.toContain('data-pl-tab="seeding" class');
  });

  it('renders the standings-lite header cells W' + EN + 'L and Diff', () => {
    expect(html).toContain('class="pl-colh"');
    expect(html).toContain('W' + EN + 'L');
    expect(html).toContain('>Diff<');
    // the leader row shows a W–L record (1–0) built with the en dash
    expect(html).toContain('1' + EN + '0');
  });

  it('labels each net with a blue NET hairline', () => {
    expect(html).toContain('class="pl-net"');
    expect(html).toContain('>NET 1<');
  });

  it('flags LIVE only on the live game row, and UP NEXT on the scheduled row', () => {
    expect(html).toContain('class="pl-g live"');
    expect(count(html, '>LIVE<')).toBe(1);   // exactly the one live game
    expect(html).toContain('>UP NEXT<');     // the scheduled game
    expect(html).toContain('>FINAL<');       // the completed game
  });

  it('keeps the tap-a-team peek attributes on team names in game rows', () => {
    expect(html).toContain('class="tapname" data-team-peek="t1"');
    expect(html).toContain('data-team-peek="t2"');
  });

  it('drops the superseded chrome: no pd-card, no pd-pool-chip, no "Now playing" cluster', () => {
    expect(html).not.toContain('pd-card');
    expect(html).not.toContain('pd-pool-chip');
    expect(html).not.toContain('Now playing');
    expect(html).not.toContain('pd-pool-live');
  });
});

describe('buildPoolsSchedulePageHTML — seeding tab', () => {
  let html;
  beforeEach(() => { setState(); bridge.setTournamentView('pools'); bridge.setPoolFilter('seeding'); html = bridge.build(); });

  it('activates the Seeding tab', () => {
    expect(html).toContain('class="pl-tab pl-on" data-pl-tab="seeding"');
    expect(count(html, 'pl-on')).toBe(1);
  });

  it('renders the overall seed table with per-team pool badges', () => {
    expect(html).toContain('Overall seeding');
    expect(html).toContain('class="pl-pl">A<'); // pool A badge chip
    expect(html).toContain('class="pl-pl">B<'); // pool B badge chip
    // seeded rows still use the standings-lite grammar (W–L column present)
    expect(html).toContain('class="pl-srow');
    expect(html).toContain('class="pl-foot"');
  });
});

describe('buildPoolsSchedulePageHTML — empty state', () => {
  it('shows the honest schedule-pending line when no pools are drawn', () => {
    setState({ tournamentPools: [], tournamentMatches: [] });
    bridge.setTournamentView('pools'); bridge.setPoolFilter('all');
    const html = bridge.build();
    expect(html).toContain('class="pl-empty"');
    expect(html).toContain('The schedule appears here once pool play is drawn.');
    expect(html).not.toContain('pd-card');
  });
});
