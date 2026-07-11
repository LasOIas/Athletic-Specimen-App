// Check In tab rebuild (Mike pick X, 2026-07-10 atom-up) — behavior tests for the anon-only kiosk
// string builders publicCheckinHTML() + renderCheckinButton(row, query) in public/app.js.
// Same vm-sandbox harness as pools-page.test.js / myteam-page.test.js: app.js is a browser classic
// script, so we run it in a Node `vm` with browser stubs; pure.js is loaded FIRST into the same
// context; an epilogue bridges the lexically-scoped `state` + the builders to the test.
// Locked deltas (task-#10): NO signed-in hero on this tab, NO initials/avatar bubbles in result rows.
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
      build: () => publicCheckinHTML(),
      row: (r, q) => renderCheckinButton(r, q),
      getState: () => state,
    };`;
  const context = vm.createContext(sandbox);
  vm.runInContext(pureSrc, context, { filename: 'pure.js' });
  vm.runInContext(appSrc + epilogue, context, { filename: 'app.js' });
  return sandbox.__bridge;
}

const bridge = loadApp();

describe('publicCheckinHTML — anon-only kiosk (Mike pick X, no hero)', () => {
  it('renders the centered "Check in" title + search input + "new" button', () => {
    Object.assign(bridge.getState(), { myClaimedPlayer: null });
    const html = bridge.build();
    expect(html).toContain('class="cik-h">Check in<');
    expect(html).toContain('id="checkin-search"');
    expect(html).toContain('id="btn-checkin-new"');
  });

  it('NEVER renders the signed-in hero, even when a player is claimed (supersedes session-5 hero here)', () => {
    // The account/hub still consume state.myClaimedPlayer — but this tab is anon-only kiosk content.
    Object.assign(bridge.getState(), { myClaimedPlayer: { id: 'a1', name: 'Michael Olas' } });
    const html = bridge.build();
    expect(html).not.toContain('ckh-card');
    expect(html).not.toContain('ckh-alts');
    expect(html).not.toContain('has-hero');
  });
});

describe('renderCheckinButton — big tap rows, no bubbles (X)', () => {
  it('renders a ckx-row with the TAP TO CHECK IN tag + matched-prefix accent bold, NO avatar bubble', () => {
    const html = bridge.row({ id: 'p1', name: 'John Smith', group: '', checkedIn: false }, 'jo');
    expect(html).toContain('class="ckx-row"');
    expect(html).toContain('data-checkin-id="p1"'); // tap attr unchanged — handler keeps working
    expect(html).toContain('<b>Jo</b>hn Smith');    // matched prefix bolded
    expect(html).toContain('class="ckx-go">TAP TO CHECK IN<');
    expect(html).not.toContain('class="av"');        // NO initials/avatar bubble (Mike's delta)
    expect(html).not.toContain('ckh-');
  });

  it('grays an already-checked-in row with ALREADY IN (is-in)', () => {
    const html = bridge.row({ id: 'p2', name: 'Amy Lee', group: '', checkedIn: true }, 'am');
    expect(html).toContain('class="ckx-row is-in"');
    expect(html).toContain('class="ckx-go">ALREADY IN<');
    expect(html).not.toContain('TAP TO CHECK IN');
  });

  it('escapes the name FIRST, then wraps the matched prefix (no entity split)', () => {
    const html = bridge.row({ id: 'p3', name: 'Tom & Jerry', group: '', checkedIn: false }, 'tom &');
    expect(html).toContain('<b>Tom &amp;</b> Jerry');
  });

  it('keeps the group differentiator for same-name disambiguation (minus any skill data)', () => {
    const html = bridge.row({ id: 'p4', name: 'John Smith', group: 'Sunday Ballers', checkedIn: false }, 'john');
    expect(html).toContain('class="ckx-gp">Sunday Ballers<');
  });
});
