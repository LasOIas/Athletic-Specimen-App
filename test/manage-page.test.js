// Manage tab — Task 1 (session-10 pick R1): the admin Manage shell lands on the PUBLIC shell as a 4th
// nav item + a needs-you lead page. Behavior tests for the pure model manageNeedsYouModel() (pure.js),
// the string builders buildManagePageHTML() + buildPublicNavInnerHTML() (app.js). Same vm-sandbox harness
// as myteam-page.test.js: app.js is a browser classic script, so we run it in a Node `vm` with browser
// stubs; pure.js is loaded FIRST into the same context; an epilogue bridges the lexically-scoped `state`,
// the module var `manageView`, and the builders to the test.
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
      needsYou: (t, teams, days) => manageNeedsYouModel(t, teams, days),
      buildManage: () => buildManagePageHTML(),
      buildNav: () => buildPublicNavInnerHTML(),
      getState: () => state,
      buildPickup: () => buildPickupDaysHTML(),
      buildPickupForm: (id) => { pickupEditId = (id == null ? null : id); manageView = 'pickup-form'; return buildPickupDayFormHTML(); },
      checkinNav: () => checkinNavVisible(),
      buildPlayers: (opts) => {
        opts = opts || {};
        mgPlayerQuery = opts.query || '';
        mgSelectMode = !!opts.select;
        mgSelected = new Set(opts.selected || []);
        mgGroupsOpen = !!opts.groups;
        mgMoveOpen = !!opts.move;
        return buildManagePlayersHTML();
      },
    };`;
  const context = vm.createContext(sandbox);
  vm.runInContext(pureSrc, context, { filename: 'pure.js' });
  vm.runInContext(appSrc + epilogue, context, { filename: 'app.js' });
  return sandbox.__bridge;
}

const bridge = loadApp();
const count = (hay, needle) => hay.split(needle).length - 1;

// ── the pure needs-you model ──────────────────────────────────────────────────
describe('manageNeedsYouModel — pure attention model', () => {
  const openNoVenmo = { id: 'T', name: 'July 2026', status: 'setup', registration_open: true, venmo_link: '' };
  const openWithVenmo = { id: 'T', name: 'July 2026', status: 'setup', registration_open: true, venmo_link: 'https://venmo.com/u/x' };

  it('flags a missing venmo link only while registration is open', () => {
    const items = bridge.needsYou(openNoVenmo, [], ['a-day']);
    expect(items.some((i) => i.id === 'venmo')).toBe(true);
    // reg closed → the venmo nudge disappears (nobody is paying yet)
    const closed = bridge.needsYou({ ...openNoVenmo, registration_open: false }, [], ['a-day']);
    expect(closed.some((i) => i.id === 'venmo')).toBe(false);
    // venmo present → no nudge
    const paidLink = bridge.needsYou(openWithVenmo, [], ['a-day']);
    expect(paidLink.some((i) => i.id === 'venmo')).toBe(false);
  });

  it('flags unpaid teams with a pluralized count title', () => {
    const teams = [
      { id: 't1', name: 'Sets & Reps', paid: false },
      { id: 't2', name: 'Dig It', paid: false },
      { id: 't3', name: 'Paid Squad', paid: true },
    ];
    const items = bridge.needsYou(openWithVenmo, teams, ['a-day']);
    const unpaid = items.find((i) => i.id === 'unpaid');
    expect(unpaid).toBeTruthy();
    expect(unpaid.title).toBe("2 teams haven't paid");
    // one unpaid team → singular grammar
    const one = bridge.needsYou(openWithVenmo, [{ id: 't1', name: 'Solo', paid: false }], ['a-day']);
    expect(one.find((i) => i.id === 'unpaid').title).toBe("1 team hasn't paid");
    // all paid → no unpaid item
    const allPaid = bridge.needsYou(openWithVenmo, [{ id: 't3', name: 'Paid Squad', paid: true }], ['a-day']);
    expect(allPaid.some((i) => i.id === 'unpaid')).toBe(false);
  });

  it('flags no pickup day when the (already-upcoming) day set is empty', () => {
    expect(bridge.needsYou(openWithVenmo, [], []).some((i) => i.id === 'noday')).toBe(true);
    expect(bridge.needsYou(openWithVenmo, [], ['a-day']).some((i) => i.id === 'noday')).toBe(false);
  });

  it('returns [] when nothing needs attention', () => {
    const teams = [{ id: 't3', name: 'Paid Squad', paid: true }];
    expect(bridge.needsYou(openWithVenmo, teams, ['a-day'])).toEqual([]);
  });

  it('every item carries a deep-link area', () => {
    const teams = [{ id: 't1', name: 'X', paid: false }];
    const items = bridge.needsYou(openNoVenmo, teams, []);
    expect(items.length).toBe(3);
    items.forEach((i) => expect(['tournament', 'pickup', 'players', 'teams', 'admins']).toContain(i.area));
  });
});

// ── the Manage lead page builder ──────────────────────────────────────────────
function setManageState(extra = {}) {
  const st = bridge.getState();
  Object.assign(st, {
    tournaments: [{ id: 'T', name: 'July 2026', status: 'setup', registration_open: true, venmo_link: '' }],
    activeTournamentId: 'T',
    tournamentTeams: [
      { id: 't1', name: 'Sets & Reps', paid: false },
      { id: 't2', name: 'Dig It', paid: false },
    ],
    players: Array.from({ length: 233 }, (_, i) => ({ id: 'p' + i, name: 'P' + i })),
    checkedIn: Array.from({ length: 19 }, (_, i) => 'k' + i),
    currentSession: null,
    pickupDays: undefined,
    isAdmin: true,
    ...extra,
  });
}

describe('buildManagePageHTML — the Manage lead (flat, needs-you first)', () => {
  it('renders the flush title, both sections, and de-carded flat rows', () => {
    setManageState();
    const html = bridge.buildManage();
    expect(html).toContain('class="mg-h1">Manage<');
    expect(html).toContain('>Needs you<');
    expect(html).toContain('>Everything<');
    expect(html).not.toContain('pd-card');
    expect(html).toContain('class="mg-chev"');
  });

  it('renders exactly the five EVERYTHING area rows (no needs-you sharing an area)', () => {
    // satisfied state → NEEDS YOU is omitted, so each area id appears once (its EVERYTHING row only)
    setManageState({
      tournaments: [{ id: 'T', name: 'July 2026', status: 'setup', registration_open: true, venmo_link: 'https://venmo.com/u/x' }],
      tournamentTeams: [{ id: 't3', name: 'Paid Squad', paid: true }],
      currentSession: { date: '2999-01-01', time: '10:00 AM', location: 'Gym' },
    });
    const html = bridge.buildManage();
    ['tournament', 'pickup', 'players', 'teams', 'admins'].forEach((area) => {
      expect(count(html, `data-mg-area="${area}"`)).toBe(1);
    });
  });

  it('shows real one-line status subs pulled from state', () => {
    setManageState();
    const html = bridge.buildManage();
    expect(html).toContain('July 2026');           // tournament row sub
    expect(html).toContain('Registration open');
    expect(html).toContain('233 on the roster');   // players row sub
    expect(html).toContain('19 checked in');
  });

  it('surfaces the needs-you rows when work is pending (venmo + unpaid + noday)', () => {
    setManageState();
    const html = bridge.buildManage();
    expect(html).toContain("2 teams haven't paid");
    expect(html).toContain('Add the Venmo link');
    expect(html).toContain('No pickup day set');
  });

  it('omits the NEEDS YOU section entirely when nothing needs attention', () => {
    setManageState({
      tournaments: [{ id: 'T', name: 'July 2026', status: 'setup', registration_open: true, venmo_link: 'https://venmo.com/u/x' }],
      tournamentTeams: [{ id: 't3', name: 'Paid Squad', paid: true }],
      currentSession: { date: '2999-01-01', time: '10:00 AM', location: 'Gym' }, // far-future upcoming day
    });
    const html = bridge.buildManage();
    expect(html).not.toContain('>Needs you<');
    expect(html).toContain('>Everything<'); // the rest of the lead still renders
  });

  it('carries the temporary Open-the-old-admin escape hatch', () => {
    setManageState();
    const html = bridge.buildManage();
    expect(html).toContain('data-mg-old');
    expect(html).toContain('Open the old admin');
  });
});

// ── the nav gains a 4th item ONLY for admins ─────────────────────────────────
describe('buildPublicNavInnerHTML — the Manage nav item is admin-only', () => {
  it('a spectator sees no Manage tab', () => {
    const st = bridge.getState();
    Object.assign(st, { isAdmin: false, currentSession: null });
    const nav = bridge.buildNav();
    expect(nav).not.toContain('data-nav-tab="manage"');
    expect(nav).toContain('data-nav-tab="home"');       // the public tabs are still there
    expect(nav).toContain('data-nav-tab="tournament"');
  });

  it('an admin gets the 4th Manage item', () => {
    const st = bridge.getState();
    Object.assign(st, { isAdmin: true, currentSession: null });
    const nav = bridge.buildNav();
    expect(nav).toContain('data-nav-tab="manage"');
    expect(nav).toContain('>Manage<');
  });
});

// ── Task 2: Pickup days list + form ──────────────────────────────────────────
const todayStr = (() => {
  const n = new Date(); const p = (x) => String(x).padStart(2, '0');
  return n.getFullYear() + '-' + p(n.getMonth() + 1) + '-' + p(n.getDate());
})();
function setPickup(rows, loaded = true) {
  const st = bridge.getState();
  Object.assign(st, { pickupDays: rows, pickupDaysLoaded: loaded, currentSession: null });
}

describe('buildPickupDaysHTML — the multi-day list (mockup p-h1)', () => {
  it('renders upcoming days soonest-first with a weekday tag, date·time, place', () => {
    // deliberately out of order → the builder sorts ascending
    setPickup([
      { id: 'b', day: '2999-07-23', time_label: '7:00 PM', location: 'Cherry Creek courts' },
      { id: 'a', day: '2999-07-16', time_label: '7:00 PM', location: 'Cherry Creek courts' },
    ]);
    const html = bridge.buildPickup();
    expect(html).toContain('>Pickup days<');
    expect(html).toContain('>Scheduled<');
    expect(html).toContain('class="pk-wk"');            // weekday tag
    expect(html).toContain('July 16 · 7:00 PM');        // sorted first row: date · time
    expect(html).toContain('Cherry Creek courts');
    // soonest-first: July 16 appears before July 23
    expect(html.indexOf('July 16')).toBeLessThan(html.indexOf('July 23'));
    expect(html).not.toContain('pd-card');
  });

  it('puts the NEXT UP live-ink tag on the soonest day ONLY', () => {
    setPickup([
      { id: 'a', day: '2999-07-16', time_label: '7:00 PM', location: 'X' },
      { id: 'b', day: '2999-07-23', time_label: '7:00 PM', location: 'Y' },
    ]);
    const html = bridge.buildPickup();
    expect(count(html, 'NEXT UP')).toBe(1);
    expect(html).toContain('class="pk-next">NEXT UP<');
  });

  it('always offers the dashed Add a pickup day', () => {
    setPickup([{ id: 'a', day: '2999-07-16', time_label: '', location: '' }]);
    const html = bridge.buildPickup();
    expect(html).toContain('data-pk-add');
    expect(html).toContain('Add a pickup day');
  });

  it('shows the honest empty state (and still the Add) when no upcoming days', () => {
    setPickup([]);
    const html = bridge.buildPickup();
    expect(html).toContain('No pickup days scheduled — add one to open Check In.');
    expect(html).toContain('data-pk-add');
    expect(count(html, 'NEXT UP')).toBe(0);
  });

  it('drops past days from the upcoming list', () => {
    setPickup([{ id: 'old', day: '2000-01-01', time_label: '', location: '' }]);
    const html = bridge.buildPickup();
    expect(html).toContain('No pickup days scheduled');
  });
});

describe('buildPickupDayFormHTML — the form-first edit (mockup p-h2)', () => {
  it('renders DATE/TIME/LOCATION fields + Save + the check-in note for an existing day', () => {
    setPickup([{ id: 'd1', day: '2999-07-16', time_label: '7:00 PM', location: 'Cherry Creek courts' }]);
    const html = bridge.buildPickupForm('d1');
    expect(html).toContain('id="pk-date"');
    expect(html).toContain('value="2999-07-16"');
    expect(html).toContain('id="pk-time"');
    expect(html).toContain('value="7:00 PM"');
    expect(html).toContain('id="pk-location"');
    expect(html).toContain('value="Cherry Creek courts"');
    expect(html).toContain('data-pk-save');
    expect(html).toContain('The Check In tab appears for everyone that day');
    expect(html).toContain('July 16');                  // form title from the day
  });

  it('shows the ON THE DAY rows + red Remove for an existing day', () => {
    setPickup([{ id: 'd1', day: '2999-07-16', time_label: '7:00 PM', location: 'X' }]);
    const html = bridge.buildPickupForm('d1');
    expect(html).toContain('>On the day<');
    expect(html).toContain('Share the check-in QR');
    expect(html).toContain('data-pk-qr');
    expect(html).toContain('Start a fresh sheet');
    expect(html).toContain('data-pk-fresh');
    expect(html).toContain('Remove this pickup day');
    expect(html).toContain('data-pk-remove="d1"');
  });

  it('a NEW (unsaved) day shows just the fields — no day-of actions, no Remove', () => {
    setPickup([]);
    const html = bridge.buildPickupForm(null);
    expect(html).toContain('New pickup day');
    expect(html).toContain('id="pk-date"');
    expect(html).toContain('data-pk-save');
    expect(html).not.toContain('Remove this pickup day');
    expect(html).not.toContain('data-pk-fresh');
  });
});

describe('checkinNavVisible — day-of gate reads the pickup SET', () => {
  it('is visible when a pickup day in the set is TODAY', () => {
    setPickup([{ id: 't', day: todayStr, time_label: '7:00 PM', location: 'X' }]);
    expect(bridge.checkinNav()).toBe(true);
  });
  it('is hidden when the only days are future/past', () => {
    setPickup([{ id: 'f', day: '2999-01-01', time_label: '', location: '' }]);
    expect(bridge.checkinNav()).toBe(false);
    setPickup([]);
    expect(bridge.checkinNav()).toBe(false);
  });
  it('pre-migration falls back to the legacy session row for the gate', () => {
    const st = bridge.getState();
    Object.assign(st, { pickupDays: [], pickupDaysLoaded: false, currentSession: { date: todayStr } });
    expect(bridge.checkinNav()).toBe(true);
  });
});

// ── Task 3: Players directory (session-10 pick R4-B) — one A–Z directory ──────
// A small named roster for the A–Z / IN / skill assertions; a 233-row roster for the meta-count assertion.
function setPlayersNamed(extra = {}) {
  const st = bridge.getState();
  Object.assign(st, {
    players: [
      { id: 'p1', name: 'Aaron Wells', skill: 3.0, groups: ['Club'] },
      { id: 'p2', name: 'Abby Chen',   skill: 3.5, groups: ['Club'] },
      { id: 'p3', name: 'Ben Okafor',  skill: 4.0, groups: ['Club'] },
      { id: 'p4', name: 'Mikey Olas',  skill: 4.5, groups: ['Club'] },
    ],
    checkedIn: ['id:p4'],           // playerIdentityKey({id:'p4'}) === 'id:p4' → Mikey shows IN
    groups: ['All', 'Club'],        // getAvailableGroups() drops 'All' → 1 group
    isAdmin: true,
    ...extra,
  });
}
function setPlayers233(extra = {}) {
  const st = bridge.getState();
  Object.assign(st, {
    players: Array.from({ length: 233 }, (_, i) => ({ id: 'p' + i, name: 'P' + i + ' Player', skill: 3 })),
    checkedIn: Array.from({ length: 19 }, (_, i) => 'k' + i),
    groups: ['All', 'Club'],
    isAdmin: true,
    ...extra,
  });
}

describe('buildManagePlayersHTML — the A–Z directory (mockup l-b)', () => {
  it('renders the search box, the meta counts, and no card/kiosk chrome', () => {
    setPlayers233();
    const html = bridge.buildPlayers({});
    expect(html).toContain('id="mg-player-search"');
    expect(html).toContain('Search or add a player');
    expect(html).toContain('<b>233</b>');            // roster count from the fixture
    expect(html).toContain('<b>19</b> checked in');  // state.checkedIn.length
    expect(html).toContain('<b>1</b> group');        // catalog count (Club); singular grammar
    expect(html).not.toContain('pd-card');
    expect(html).not.toContain('ckx-');
    expect(html).not.toMatch(/avatar|initial/i);     // NO initials bubbles anywhere
  });

  it('renders one letter anchor per letter over an alphabetical list', () => {
    setPlayersNamed();
    const html = bridge.buildPlayers({});
    // sorted: Aaron, Abby, Ben, Mikey → A (once, for two A-names), B, M
    expect(count(html, 'class="mgp-al">A</span>')).toBe(1);
    expect(count(html, 'class="mgp-al">B</span>')).toBe(1);
    expect(count(html, 'class="mgp-al">M</span>')).toBe(1);
    // Aaron sorts before Ben
    expect(html.indexOf('Aaron Wells')).toBeLessThan(html.indexOf('Ben Okafor'));
  });

  it('marks the checked-in player with a quiet IN label — never a bare dot', () => {
    setPlayersNamed();
    const html = bridge.buildPlayers({});
    expect(html).toContain('class="mgp-in">IN</span>');
    expect(count(html, '>IN<')).toBe(1);             // only Mikey (id:p4) is checked in
    expect(html).not.toContain('•');                 // the tag is a label, never a bullet
  });

  it('renders skill values right-aligned (admin-only surface)', () => {
    setPlayersNamed();
    const html = bridge.buildPlayers({});
    expect(html).toContain('class="mgp-sk"');
    expect(html).toContain('>3.0<');
    expect(html).toContain('>4.5<');
  });

  it('exposes the group count as a tappable group-manager trigger', () => {
    setPlayersNamed();
    const html = bridge.buildPlayers({});
    expect(html).toContain('data-mgp-groups');
    // opening it renders the inline group section with the existing group + an add field
    const open = bridge.buildPlayers({ groups: true });
    expect(open).toContain('Club');
    expect(open).toContain('data-mgp-gadd');
  });
});

describe('buildManagePlayersHTML — live search + add-a-player', () => {
  it('filters case-insensitively and highlights the match; no add-row on a hit', () => {
    setPlayersNamed();
    const html = bridge.buildPlayers({ query: 'aa' });
    expect(html).toContain('data-mgp-id="id:p1"');   // Aaron Wells matched
    expect(html).toContain('<b>Aa</b>ron Wells');    // highlightMatch bolds the matched prefix
    expect(html).not.toContain('Ben Okafor');
    expect(html).not.toContain('data-mgp-add');
  });

  it('offers the dashed "Add …" row when the search has no match', () => {
    setPlayersNamed();
    const html = bridge.buildPlayers({ query: 'Zztop Nobody' });
    expect(html).toContain('data-mgp-add="Zztop Nobody"');
    expect(html).toContain('as a new player');
    expect(html).not.toContain('Aaron Wells');
  });
});

describe('buildManagePlayersHTML — Select (bulk) mode', () => {
  it('reveals per-row checkboxes and the four-action bottom bar', () => {
    setPlayersNamed();
    const html = bridge.buildPlayers({ select: true });
    expect(html).toContain('class="mgp-cb"');
    expect(html).toContain('class="mgp-bar"');
    expect(html).toContain('data-mgp-bulk="in"');
    expect(html).toContain('data-mgp-bulk="out"');
    expect(html).toContain('data-mgp-bulk="move"');
    expect(html).toContain('data-mgp-bulk="cancel"');
    expect(html).toContain('Check in');
    expect(html).toContain('Check out');
    expect(html).toContain('Move to group');
    expect(html).toContain('>Cancel<');              // the header Select button flips to Cancel
  });

  it('a selected row carries the .on state', () => {
    setPlayersNamed();
    const html = bridge.buildPlayers({ select: true, selected: ['id:p1'] });
    expect(html).toContain('class="mgp-row on" data-mgp-id="id:p1"');
  });

  it('normal mode has no bar and no checkboxes', () => {
    setPlayersNamed();
    const html = bridge.buildPlayers({});
    expect(html).not.toContain('class="mgp-bar"');
    expect(html).not.toContain('class="mgp-cb"');
    expect(html).toContain('>Select<');              // header button reads Select
  });
});
