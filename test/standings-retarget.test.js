// Standings page deletion + retargets (Mike pick K, 2026-07-10) — behavior test for the Tournament hub
// row that used to open the (now-deleted) public Standings page. The row is relabeled "Seeding" and
// retargeted to the Pools & schedule page's Seeding tab via data-tn-view="pools" data-pools-tab="seeding".
// Same Node `vm` sandbox harness as test/pools-page.test.js (app.js is a browser classic script), with the
// epilogue bridging buildTournamentHubHTML() + `state` out to the test.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

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
      buildHub: () => buildTournamentHubHTML(),
      getState: () => state,
    };`;
  const context = vm.createContext(sandbox);
  vm.runInContext(pureSrc, context, { filename: 'pure.js' });
  vm.runInContext(appSrc + epilogue, context, { filename: 'app.js' });
  return sandbox.__bridge;
}

const bridge = loadApp();

// 2 pools (A/B), 4 teams. Deterministic finals so t1 "Ballin" is the unambiguous overall leader (+12 diff).
const POOLS = [{ id: 'p1', label: 'A' }, { id: 'p2', label: 'B' }];
const TEAMS = [
  { id: 't1', name: 'Ballin', pool_id: 'p1' },
  { id: 't2', name: 'Dinks', pool_id: 'p1' },
  { id: 't3', name: 'Block Party', pool_id: 'p2' },
  { id: 't4', name: 'Net Gains', pool_id: 'p2' },
];
const MATCHES = [
  { id: 'gA1', pool_id: 'p1', phase: 'pool', net: 1, queue_order: 1, status: 'final', team_a_id: 't1', team_b_id: 't2', winner_team_id: 't1', score_a: 15, score_b: 3 },
  { id: 'gB1', pool_id: 'p2', phase: 'pool', net: 2, queue_order: 1, status: 'final', team_a_id: 't3', team_b_id: 't4', winner_team_id: 't4', score_a: 10, score_b: 15 },
];

function setState(extra = {}) {
  const st = bridge.getState();
  Object.assign(st, {
    tournaments: [{ id: 'T', name: 'Summer Slam', status: 'pools' }],
    activeTournamentId: 'T',
    tournamentTeams: TEAMS, tournamentMatches: MATCHES, tournamentPools: POOLS,
    account: null, teamMembers: [], isAdmin: false, loaded: true,
    ...extra,
  });
}

describe('Tournament hub — Standings row folds into the Pools Seeding tab (Mike K)', () => {
  let html;
  beforeEach(() => { setState(); html = bridge.buildHub(); });

  it('retargets the row to the Pools & schedule Seeding tab', () => {
    expect(html).toContain('data-tn-view="pools" data-pools-tab="seeding"');
  });

  it('relabels the row "Seeding" (the dead "Standings" page + its nav target are gone)', () => {
    expect(html).toContain('>Seeding<');
    expect(html).not.toContain('data-nav-tab="standings"');
    expect(html).not.toContain('>Standings<');
  });

  it('keeps the leader value on the row once a pool game is final', () => {
    expect(html).toContain('Leader');
    expect(html).toContain('Ballin'); // the overall leader name is still shown as the row value
  });
});
