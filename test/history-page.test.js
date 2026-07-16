// Past tournaments page (Mike pick Z, 2026-07-10 atom-up) — behavior tests for buildHistoryPageHTML()
// in public/app.js after the History tabs (Tournaments/Leaderboard/Champions) are retired into ONE
// year-grouped list. Same vm-sandbox harness as checkin-page.test.js / pools-page.test.js: app.js is a
// browser classic script, so we run it in a Node `vm` with browser stubs; pure.js is loaded FIRST into
// the same context; an epilogue bridges the lexically-scoped `state` + the builder to the test.
// Locked deltas (task-#11): tabs die; title "Past tournaments"; rows = trophy tile + name + "N teams ·
// <champion|No champion recorded>" + chevron; grouped under a hairline year label (descending).
import { describe, it, expect } from 'vitest';
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
    readyState: 'loading',
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
      build: () => buildHistoryPageHTML(),
      getState: () => state,
    };`;
  const context = vm.createContext(sandbox);
  vm.runInContext(pureSrc, context, { filename: 'pure.js' });
  vm.runInContext(appSrc + epilogue, context, { filename: 'app.js' });
  return sandbox.__bridge;
}

const bridge = loadApp();

// Real-shaped history rows (as loadTournamentHistory() produces them): {id,name,date,teamCount,champion}.
// June 2026 mirrors prod: 18 teams, NO champion recorded.
const HISTORY = [
  { id: 't3', name: 'July 2026', date: '2026-07-01T12:00:00Z', teamCount: 12, champion: { name: 'Dink Responsibly' } },
  { id: 't2', name: 'June 2026', date: '2026-06-15T12:00:00Z', teamCount: 18, champion: null },
  { id: 't1', name: 'Fall Classic 2025', date: '2025-10-04T12:00:00Z', teamCount: 8, champion: { name: 'Old Squad' } },
];

describe('buildHistoryPageHTML — Past tournaments one-list (Mike pick Z)', () => {
  it('titles the page "Past tournaments" and retires the tab strip', () => {
    Object.assign(bridge.getState(), { tournamentHistory: HISTORY });
    const html = bridge.build();
    expect(html).toContain('Past tournaments');
    expect(html).not.toContain('data-pd-history-tab');
    expect(html).not.toContain('pd-seg');
    expect(html).not.toContain('>Leaderboard<');
    expect(html).not.toContain('>Champions<');
    expect(html).not.toContain('pd-card'); // flat on stone, no frosted card
  });

  it('groups rows under a hairline year label, newest year first', () => {
    Object.assign(bridge.getState(), { tournamentHistory: HISTORY });
    const html = bridge.build();
    expect(html).toContain('class="ht-year">2026<');
    expect(html).toContain('class="ht-year">2025<');
    expect(html.indexOf('>2026<')).toBeLessThan(html.indexOf('>2025<')); // descending
  });

  it('renders the June 2026 row honestly — 18 teams, no champion recorded', () => {
    Object.assign(bridge.getState(), { tournamentHistory: HISTORY });
    const html = bridge.build();
    expect(html).toContain('class="ht-row"');
    expect(html).toContain('June 2026');
    expect(html).toContain('18 teams · No champion recorded');
  });

  it('enriches a row with the champion when one exists', () => {
    Object.assign(bridge.getState(), { tournamentHistory: HISTORY });
    const html = bridge.build();
    expect(html).toContain('12 teams · Champions · Dink Responsibly');
  });

  it('uses the singular "team" for a one-team tournament', () => {
    Object.assign(bridge.getState(), {
      tournamentHistory: [{ id: 'x', name: 'Solo 2026', date: '2026-01-01T00:00:00Z', teamCount: 1, champion: null }],
    });
    const html = bridge.build();
    expect(html).toContain('1 team · No champion recorded');
    expect(html).not.toContain('1 teams');
  });

  it('shows a flat loading line before the lazy cache resolves', () => {
    const s = bridge.getState();
    delete s.tournamentHistory;
    const html = bridge.build();
    expect(html).toContain('Loading');
    expect(html).not.toContain('pd-card');
  });

  it('shows honest empty copy when no tournament has finished', () => {
    Object.assign(bridge.getState(), { tournamentHistory: [] });
    const html = bridge.build();
    expect(html).toContain('No tournaments finished yet. The first one lands here.');
  });
});
