// My Team page rebuild (Mike pick Q, 2026-07-10 atom-up single-scroll) — behavior tests for the string
// builder buildMyTeamPageHTML() in public/app.js. Same vm-sandbox harness as pools-page.test.js:
// app.js is a browser classic script, so we run it in a Node `vm` with browser stubs; pure.js is loaded
// FIRST into the same context; an epilogue bridges the lexically-scoped `state` + the builder to the test.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const EN = '–'; // EN DASH — the record / score separator the builder emits

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
      build: () => buildMyTeamPageHTML(),
      getState: () => state,
    };`;
  const context = vm.createContext(sandbox);
  vm.runInContext(pureSrc, context, { filename: 'pure.js' });
  vm.runInContext(appSrc + epilogue, context, { filename: 'app.js' });
  return sandbox.__bridge;
}

const bridge = loadApp();

const POOLS = [{ id: 'p1', label: 'A' }, { id: 'p2', label: 'B' }];
const TEAMS = [
  { id: 't1', name: 'Ballin', pool_id: 'p1' },
  { id: 't2', name: 'Dinks', pool_id: 'p1' },
  { id: 't5', name: 'Kings', pool_id: 'p1' },
  { id: 't3', name: 'Block Party', pool_id: 'p2' },
];
// t1 (my team): two pool wins final (2–0), a live game up next, a scheduled game after.
const MATCHES = [
  { id: 'gA1', pool_id: 'p1', phase: 'pool', net: 1, queue_order: 1, status: 'final', team_a_id: 't1', team_b_id: 't2', winner_team_id: 't1', score_a: 15, score_b: 12, updated_at: '2026-07-10T18:00:00Z' },
  { id: 'gA2', pool_id: 'p1', phase: 'pool', net: 1, queue_order: 2, status: 'final', team_a_id: 't1', team_b_id: 't5', winner_team_id: 't1', score_a: 21, score_b: 10, updated_at: '2026-07-10T18:20:00Z' },
  { id: 'gA3', pool_id: 'p1', phase: 'pool', net: 1, queue_order: 3, status: 'live', team_a_id: 't1', team_b_id: 't2', score_a: 5, score_b: 4 },
  { id: 'gA4', pool_id: 'p1', phase: 'pool', net: 1, queue_order: 4, status: 'scheduled', team_a_id: 't1', team_b_id: 't5' },
];
const MEMBERS = [
  { id: 'm1', teamId: 't1', teamName: 'Ballin', name: 'Mike Olas', initials: 'MO', claimedBy: 'acc1' },
  { id: 'm2', teamId: 't1', teamName: 'Ballin', name: 'Sam Pat', initials: 'SP', claimedBy: 'other' },
  { id: 'm3', teamId: 't2', teamName: 'Dinks', name: 'Someone Else', initials: 'SE', claimedBy: 'x' },
];

function setState(extra = {}) {
  const st = bridge.getState();
  Object.assign(st, {
    tournaments: [{ id: 'T', name: 'Summer Slam', status: 'pools' }],
    activeTournamentId: 'T',
    tournamentTeams: TEAMS, tournamentMatches: MATCHES, tournamentPools: POOLS,
    account: { id: 'acc1' }, teamMembers: MEMBERS, isAdmin: false,
    ...extra,
  });
}

const count = (hay, needle) => hay.split(needle).length - 1;

describe('buildMyTeamPageHTML — signed-in + claimed (single scroll)', () => {
  let html;
  beforeEach(() => { setState(); html = bridge.build(); });

  it('renders the flat scoreboard hero with the team name and big record', () => {
    expect(html).toContain('class="mt-hero"');
    expect(html).toContain('class="mt-team">Ballin<');
    expect(html).toContain('class="mt-rn">2' + EN + '0<'); // 2–0 lives inside mt-rn
    expect(html).not.toContain('pd-card');   // de-carded, flat on stone
  });

  it('renders the eyebrow with tournament · pool · seed', () => {
    expect(html).toContain('Summer Slam · Pool A · Seed 1');
  });

  it('renders one pip per known game — 2 wins + 2 unplayed', () => {
    expect(count(html, 'class="mt-pip w"')).toBe(2);
    expect(count(html, 'class="mt-pip"')).toBe(2);   // the two scheduled/live (unplayed) games
    expect(count(html, 'class="mt-pip l"')).toBe(0);
  });

  it('shows the up-next strip with a filled-blue NET tile and the HAPPENING NOW label', () => {
    expect(html).toContain('class="mt-next"');
    expect(html).toContain('class="mt-nettile"');
    expect(html).toContain('>NET<');
    expect(html).toContain('UP NEXT — HAPPENING NOW'); // gA3 is live, no games ahead
    expect(html).toContain('vs Dinks');
  });

  it('stacks BOTH Games and Roster sections in one render — no toggle', () => {
    expect(html).toContain('>Games<');
    expect(html).toContain('>Roster<');
    expect(html).not.toContain('data-pd-myteam-tab');
    expect(html).not.toContain('pd-seg');
  });

  it('renders game rows with a W/L letter, the score, vs opponent, and Net · R# meta', () => {
    expect(html).toContain('class="mt-wl w">W<');
    expect(html).toContain('15' + EN + '12');        // my score first
    expect(html).toContain('21' + EN + '10');
    expect(html).toContain('Net 1 · R1');
    expect(html).toContain('Net 1 · R2');
  });

  it('renders roster rows with initials chips and the You pill on the claimed player only', () => {
    expect(html).toContain('Mike Olas');
    expect(html).toContain('Sam Pat');
    expect(html).not.toContain('Someone Else');      // that member is on t2, not my team
    expect(count(html, 'class="mt-you"')).toBe(1);   // exactly the claimed player
  });
});

describe('buildMyTeamPageHTML — empty / unclaimed states (de-carded, copy kept)', () => {
  it('prompts sign-in when there is no account', () => {
    setState({ account: null });
    const html = bridge.build();
    expect(html).toContain('Sign in and claim your name on Home');
    expect(html).not.toContain('pd-card');
  });

  it('prompts a claim when signed in but no team is claimed', () => {
    setState({ teamMembers: [{ id: 'z', teamId: 't1', teamName: 'Ballin', name: 'Nobody', initials: 'N', claimedBy: 'nope' }] });
    const html = bridge.build();
    expect(html).toContain('Claim your name to see your team');
    expect(html).not.toContain('pd-card');
  });

  it('shows the no-tournament line when none is live', () => {
    setState({ tournaments: [], activeTournamentId: null });
    const html = bridge.build();
    expect(html).toContain('No tournament right now');
    expect(html).not.toContain('pd-card');
  });
});
