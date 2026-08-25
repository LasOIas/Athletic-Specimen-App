// Venue columns (migration 0058, design round 2026-08-24 "Home"). Column-gated exactly like 0057: the
// Event settings fields render ONLY when the loaded rows carry the keys, and the field engine writes
// them as free text (blank clears). Same vm-sandbox harness as manage-page.test.js.
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
      setTournaments: (list) => { state.tournaments = list; state.activeTournamentId = list[0] ? list[0].id : null; },
      hasVenue: () => tournamentHasVenue(),
      buildSettings: () => { manageView = 'tournament'; mgtView = 'settings'; return buildMgSettingsHTML(); },
      fieldText: (id, t) => mgFieldCurrentText(id, t),
      fieldWrite: (id, raw, t) => mgFieldWrite(id, raw, t),
      settingsIds: () => MGES_FIELD_IDS.slice(),
    };`;
  const context = vm.createContext(sandbox);
  vm.runInContext(pureSrc, context, { filename: 'pure.js' });
  vm.runInContext(appSrc + epilogue, context, { filename: 'app.js' });
  return sandbox.__bridge;
}

const bridge = loadApp();
const base = { id: 't1', name: 'August 2026 Tournament', status: 'setup', registration_open: true, team_size: 4, net_count: 3, buy_in: '$80 a team' };

describe('venue columns are gated on the loaded rows (0057 pattern)', () => {
  it('reports absent when the rows carry no venue keys, and renders no venue fields', () => {
    bridge.setTournaments([{ ...base }]);
    expect(bridge.hasVenue()).toBe(false);
    const html = bridge.buildSettings();
    expect(html).not.toContain('id="mges-venue"');
    expect(html).not.toContain('id="mges-venueaddr"');
    // 2026-08-25 (Manage handoff, Task 6): the two fields live in a "Where" group of their own, so the
    // whole group has to disappear with them — an empty named card would advertise a setting that is not there.
    expect(html).not.toContain('>Where<');
  });
  it('reports present only when BOTH keys are on the row', () => {
    bridge.setTournaments([{ ...base, venue: null }]);
    expect(bridge.hasVenue()).toBe(false);
    bridge.setTournaments([{ ...base, venue: null, venue_address: null }]);
    expect(bridge.hasVenue()).toBe(true);
  });
  it('renders Venue + Address fields prefilled and escaped once the columns exist', () => {
    bridge.setTournaments([{ ...base, venue: 'Woodmen "Valley" Park', venue_address: '1000 Woodmen Valley Rd, Colorado Springs, CO' }]);
    const html = bridge.buildSettings();
    expect(html).toContain('id="mges-venue"');
    expect(html).toContain('value="Woodmen &quot;Valley&quot; Park"');
    expect(html).toContain('id="mges-venueaddr"');
    expect(html).toContain('value="1000 Woodmen Valley Rd, Colorado Springs, CO"');
    expect(bridge.settingsIds()).toEqual(expect.arrayContaining(['mges-venue', 'mges-venueaddr']));
    // both fields sit under one named group, each with the sentence that says where the value shows up
    expect(html).toContain('>Where<');
    expect(html).toContain('The park players see on the front page');
    expect(html).toContain('What Copy address puts on their clipboard');
  });
});

describe('the field engine writes venue columns as free text', () => {
  const t = { ...base, venue: 'Woodmen Valley Park', venue_address: null };
  it('reads the current text off the row', () => {
    expect(bridge.fieldText('mges-venue', t)).toBe('Woodmen Valley Park');
    expect(bridge.fieldText('mges-venueaddr', t)).toBe('');
  });
  it('an unchanged value is not a write', () => {
    expect(bridge.fieldWrite('mges-venue', ' Woodmen Valley Park ', t)).toBeNull();
  });
  it('a new value writes the column; a blank clears it to null', () => {
    expect(bridge.fieldWrite('mges-venue', 'Washington Park', t)).toEqual({ fields: { venue: 'Washington Park' } });
    expect(bridge.fieldWrite('mges-venueaddr', '701 S Franklin St, Denver, CO', t)).toEqual({ fields: { venue_address: '701 S Franklin St, Denver, CO' } });
    expect(bridge.fieldWrite('mges-venue', '', t)).toEqual({ fields: { venue: null } });
  });
});
