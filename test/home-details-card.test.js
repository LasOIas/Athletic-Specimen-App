// Home Details card + the Home rules sheet + the register PAYMENT heading (design round 2026-08-24, Mike's
// Claude Design handoff). String assertions on the builders through the vm-sandbox harness
// (manage-page.test.js pattern) plus source-level assertions for the wiring — the suite has no DOM.
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
      setTournaments: (list) => { state.tournaments = list; state.activeTournamentId = null; },
      home: () => publicHomeHTML(),
      regTournament: () => publicHomeRegTournament(),
      rulesModal: (t) => hmRulesModalHTML(t),
      register: () => buildRegisterPageHTML(),
    };`;
  const context = vm.createContext(sandbox);
  vm.runInContext(pureSrc, context, { filename: 'pure.js' });
  vm.runInContext(appSrc + epilogue, context, { filename: 'app.js' });
  return sandbox.__bridge;
}

const bridge = loadApp();
const reg = { id: 't1', name: 'August 2026 Tournament', status: 'setup', registration_open: true, team_size: 4, net_count: 3, buy_in: '$80 a team', rules: '## The basics\n- 4s co-ed' };
const noRules = { ...reg, rules: '' };
const withVenue = { ...reg, venue: 'Woodmen Valley Park', venue_address: '1000 Woodmen Valley Rd, Colorado Springs, CO' };

describe('Home Details card (design round 2026-08-24)', () => {
  it('boxes the three rows in .hmv-dcard with one head and no bare DETAILS label', () => {
    bridge.setTournaments([reg]);
    const html = bridge.home();
    expect(html).toContain('<div class="hmv-dcard"><div class="hmv-dhead"><span>Details</span></div>');
    expect(html).not.toContain('<div class="hm-sect">Details</div>');
    expect(html.match(/class="hm-detail"/g)).toHaveLength(3);
    expect(html.match(/class="hmv-dico"/g)).toHaveLength(3);
    expect(html.match(/class="hmv-dtx"/g)).toHaveLength(3);
  });
  it('splits each row into an ink fact and a muted qualifier', () => {
    bridge.setTournaments([reg]);
    const html = bridge.home();
    expect(html).toContain('<b>4 per team, co-ed</b><span>at least 1 guy + 1 girl</span>');
    expect(html).toContain('<b>Pool play → double-elim bracket</b><span>win by 2</span>');
  });
  it('colours only the state word of the registration divider', () => {
    bridge.setTournaments([reg]);
    expect(bridge.home()).toContain('<div class="hm-status"><span>Registration <b>open</b></span></div>');
    bridge.setTournaments([{ ...reg, registration_open: false }]);
    const closed = bridge.home();
    expect(closed).toContain('<div class="hm-status is-closed"><span>Registration <b>closed</b></span></div>');
    expect(closed).not.toContain('hm-cta');
  });
});

describe('the venue row', () => {
  it('falls back honestly when the columns are not loaded, with no Copy action', () => {
    bridge.setTournaments([reg]);
    const html = bridge.home();
    expect(html).toContain('<b>Location</b><span>Posted in GroupMe</span>');
    expect(html).not.toContain('data-hm-copy');
  });
  it('falls back when the columns exist but the venue is blank', () => {
    bridge.setTournaments([{ ...reg, venue: null, venue_address: null }]);
    expect(bridge.home()).toContain('<b>Location</b><span>Posted in GroupMe</span>');
  });
  it('renders the venue, its address line and an escaped clipboard payload', () => {
    bridge.setTournaments([{ ...withVenue, venue: 'Woodmen "Valley" Park' }]);
    const html = bridge.home();
    expect(html).toContain('<b>Woodmen &quot;Valley&quot; Park</b><span>1000 Woodmen Valley Rd, Colorado Springs, CO</span>');
    expect(html).toContain('data-hm-copy="Woodmen &quot;Valley&quot; Park, 1000 Woodmen Valley Rd, Colorado Springs, CO"');
    expect(html).toContain('<span class="hmv-cidle">');
    expect(html).toContain('<span class="hmv-cdone">');
    expect(html).toContain('Copy address');
    expect(html).toContain('Address copied');
  });
  it('copies the venue alone when there is no address line', () => {
    bridge.setTournaments([{ ...withVenue, venue_address: '' }]);
    const html = bridge.home();
    expect(html).toContain('data-hm-copy="Woodmen Valley Park"');
    expect(html).toContain('<b>Woodmen Valley Park</b></span>'); // no empty qualifier span
  });
});

describe('the Rules action', () => {
  it('renders on the roster row only when the tournament has rules text', () => {
    bridge.setTournaments([reg]);
    expect(bridge.home()).toContain('class="hmv-copy hmv-rules" data-hm-rules');
    bridge.setTournaments([noRules]);
    expect(bridge.home()).not.toContain('data-hm-rules');
  });
  it('never emits the modal inside the Home container (it is body-appended, poll-immune)', () => {
    bridge.setTournaments([reg]);
    expect(bridge.home()).not.toContain('hm-rules-modal');
  });
});

describe('the Home rules sheet builder', () => {
  it('renders the whole rules document in the popup kit with both closers and a11y wiring', () => {
    const html = bridge.rulesModal(reg);
    expect(html).toContain('<div class="popup-card card" role="dialog" aria-modal="true" aria-labelledby="hm-rules-title">');
    expect(html).toContain('<span class="hmv-reyebrow">August 2026 Tournament</span>');
    expect(html).toContain('<h3 class="hmv-rtitle" id="hm-rules-title">Rules</h3>');
    expect(html).toContain('<div class="rl-body">');
    expect(html).toContain('The basics');
    expect(html.match(/data-hm-rules-close/g)).toHaveLength(2);
    expect(html).toContain('>Got it</button>');
  });
  it('returns nothing for a tournament without rules (the action is not rendered either)', () => {
    expect(bridge.rulesModal(noRules)).toBe('');
    expect(bridge.rulesModal({ ...reg, rules: null })).toBe('');
  });
});

describe('wiring (source-level — the suite has no DOM)', () => {
  const src = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  it('the sheet is body-appended on the popup overlay, with backdrop + Escape closers', () => {
    const fn = src.slice(src.indexOf('function openHomeRules('), src.indexOf('function hmCopyAddress('));
    expect(fn).toContain("scrim.id = 'hm-rules-modal'");
    expect(fn).toContain("scrim.className = 'popup-overlay'");
    expect(fn).toContain('document.body.appendChild(scrim)');
    expect(fn).toContain('publicHomeRegTournament()');
    expect(src).toContain("if (ev.key === 'Escape') closeHomeRules();");
  });
  it('the #app-content delegate routes both actions', () => {
    expect(src).toContain("e.target.closest('[data-hm-copy]')");
    expect(src).toContain("e.target.closest('[data-hm-rules]')");
  });
  it('copy writes the attribute to the clipboard and holds .is-done', () => {
    const start = src.indexOf('function hmCopyAddress(');
    const fn = src.slice(start, start + 900);
    expect(fn).toContain('navigator.clipboard.writeText(text)');
    expect(fn).toContain("btn.classList.add('is-done')");
  });
});

describe('register form (design round 2026-08-24)', () => {
  it('marks the PAYMENT heading and keeps the Mike-verified held-spot line', () => {
    bridge.setTournaments([reg]);
    const html = bridge.register();
    expect(html.match(/class="rf-divlab is-pay"/g)).toHaveLength(1);
    expect(html).toContain("Teams pay to register. Your spot is held once it's sent.");
  });
});
