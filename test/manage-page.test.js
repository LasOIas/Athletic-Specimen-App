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
      buildTeams: (opts) => {
        opts = opts || {};
        mgtSize = (opts.size == null ? 4 : opts.size);
        mgtSwapKey = opts.swapKey || null;
        mgtSwapFrom = (opts.swapFrom == null ? null : opts.swapFrom);
        return buildManageTeamsHTML();
      },
      buildTournament: () => { manageView = 'tournament'; mgtView = null; return buildManageTournamentHTML(); },
      buildReg: () => { manageView = 'tournament'; mgtView = 'registration'; return buildMgRegistrationHTML(); },
      mgtContainer: (view) => { manageView = 'tournament'; mgtView = (view === undefined ? null : view); return manageContainerHTML(); },
      defaultAnnouncement: (t) => mgDefaultAnnouncement(t),
      annValue: (t) => mgAnnouncementValue(t),
      leadTournament: () => manageLeadTournament(),
      buildMgTeams: () => { manageView = 'tournament'; mgtView = 'teams'; return buildMgTeamsHTML(); },
      buildTeamSheet: (id) => buildMgTeamSheetHTML(mgFindTeam(id)),
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

// ── Task 4: Teams page (session-10 pick R5 TRIMMED) — chips + generate + stacked teams ────────
// Mockup r10-manage/k-h1: MAKE TEAMS · N CHECKED IN (size chips 2s/3s/4s/6s, 4s default) + Generate
// balanced teams + TODAY'S TEAMS (TEAM n label + names STACKED one-per-line) + tap a name → swap sheet.
// The casual live-courts board is CUT (Mike): NO net cards, NO report/clear result, skills manual-only.
function setTeams(extra = {}) {
  const st = bridge.getState();
  Object.assign(st, {
    players: [
      { id: 'p1', name: 'Mikey Olas', skill: 4.5 }, { id: 'p2', name: 'Sam Pat', skill: 3.0 },
      { id: 'p3', name: 'Vaughn Dickey', skill: 3.5 }, { id: 'p4', name: 'Abby Chen', skill: 3.0 },
      { id: 'p5', name: 'Aaron Wells', skill: 4.0 }, { id: 'p6', name: 'Bri Halloway', skill: 3.5 },
    ],
    checkedIn: Array.from({ length: 19 }, (_, i) => 'k' + i),
    generatedTeams: [],
    isAdmin: true,
    ...extra,
  });
}
const twoTeams = [
  [{ id: 'p1', name: 'Mikey Olas' }, { id: 'p2', name: 'Sam Pat' }],
  [{ id: 'p5', name: 'Aaron Wells' }, { id: 'p6', name: 'Bri Halloway' }],
];

describe('buildManageTeamsHTML — the Teams page (mockup k-h1, R5 trimmed)', () => {
  it('renders the back header + MAKE TEAMS section with the live checked-in count, no card', () => {
    setTeams();
    const html = bridge.buildTeams({});
    expect(html).toContain('data-mg-area="lead"');       // back to the Manage lead
    expect(html).toContain('>Teams<');                    // page title
    expect(html).toContain('Make teams · 19 checked in');  // header count from state.checkedIn.length
    expect(html).not.toContain('pd-card');
  });

  it('renders the four size chips with 4s active by default', () => {
    setTeams();
    const html = bridge.buildTeams({});                    // default size = 4
    ['2', '3', '4', '6'].forEach((s) => expect(html).toContain(`data-mgt-size="${s}"`));
    expect(html).toContain('>2s<');
    expect(html).toContain('>4s<');
    // exactly one chip is active, and it is the 4s chip
    expect(count(html, 'pl-on')).toBe(1);
    expect(html).toContain('pl-tab pl-on" data-mgt-size="4"');
  });

  it('honors a different selected size (6s active)', () => {
    setTeams();
    const html = bridge.buildTeams({ size: 6 });
    expect(html).toContain('pl-tab pl-on" data-mgt-size="6"');
    expect(count(html, 'pl-on')).toBe(1);
  });

  it('offers the Generate balanced teams CTA', () => {
    setTeams();
    const html = bridge.buildTeams({});
    expect(html).toContain('data-mgt-generate');
    expect(html).toContain('Generate balanced teams');
  });

  it('shows an honest empty state (still chips + CTA) when no teams are generated', () => {
    setTeams({ generatedTeams: [] });
    const html = bridge.buildTeams({});
    expect(html).toContain('No teams yet');
    expect(html).toContain('data-mgt-generate');          // can still generate
    expect(html).not.toContain("Today's teams");          // no teams section header when empty
  });

  it("labels the roster section Today's teams (NEVER tonight) and stacks names one per line", () => {
    setTeams({ generatedTeams: twoTeams });
    const html = bridge.buildTeams({});
    expect(html).toContain("Today's teams");
    expect(html.toLowerCase()).not.toContain('tonight');
    expect(html).toContain('>TEAM 1<');
    expect(html).toContain('>TEAM 2<');
    // each name is its own stacked line element (mgt-nm), not comma-joined on one line
    expect(html).toContain('class="mgt-nm"');
    expect(count(html, 'class="mgt-nm"')).toBe(4);         // 2 teams × 2 players
    expect(html).toContain('Mikey Olas');
    expect(html).toContain('Aaron Wells');
  });

  it('makes each name tappable to open the swap sheet (carries player key + from-team)', () => {
    setTeams({ generatedTeams: twoTeams });
    const html = bridge.buildTeams({});
    expect(html).toContain('data-mgt-swap="id:p1"');
    expect(html).toContain('data-mgt-from="0"');
    expect(html).toContain('Tap a name to swap');         // the helper note
  });

  it('has NO casual courts / report-result / net-card strings anywhere', () => {
    setTeams({ generatedTeams: twoTeams });
    const html = bridge.buildTeams({});
    expect(html).not.toMatch(/REPORT/i);
    expect(html).not.toContain('report-live-match-result');
    expect(html).not.toContain('court-stat');
    expect(html).not.toContain('live-net');
    expect(html).not.toMatch(/\bNet \d/);                  // no "Net 1" court labels
    expect(html).not.toContain('Won</button>');
  });

  it('opens the swap sheet listing the OTHER teams when a name is being swapped', () => {
    setTeams({ generatedTeams: twoTeams });
    // swapping Mikey (id:p1) out of team 0 → the sheet offers team 1 (TEAM 2) as a destination
    const html = bridge.buildTeams({ swapKey: 'id:p1', swapFrom: 0 });
    expect(html).toContain('data-mgt-to="1"');            // destination = the other team
    expect(html).not.toContain('data-mgt-to="0"');        // never the team the player is already on
    expect(html).toContain('Mikey Olas');                 // names the player being moved
    expect(html).toContain('data-mgt-cancel');            // a way out
  });
});

// ── Task 5: Tournament sub-hub (pick R2) + Registration (pick R7) ─────────────
// Mockups r10-manage/t-b (sub-hub) + r-b (registration). The sub-hub reuses the mg-row grammar with a
// data-mgt-view delegate; the Registration view leads with an EDITABLE announcement textarea (prefilled
// from tournaments.announcement OR a composed default that TOLERATES the column not existing yet), a Copy
// for GroupMe CTA, the Registration-open switch, and venmo/buy-in/team-size fields. The lead tournament is
// resolved by the reused T1 resolver (manageLeadTournament = publicLiveTournament || setup+reg-open).
function setTournamentState(t, extra = {}) {
  const st = bridge.getState();
  Object.assign(st, {
    tournaments: [t],
    activeTournamentId: t ? t.id : null,
    tournamentTeams: [
      { id: 't1', name: 'Sets & Reps', paid: false },
      { id: 't2', name: 'Dig It', paid: false },
      { id: 't3', name: 'Paid Squad', paid: true },
    ],
    players: [], checkedIn: [], currentSession: null, pickupDays: undefined,
    isAdmin: true,
    ...extra,
  });
}
const setupOpen = { id: 'T', name: 'July 2026', status: 'setup', registration_open: true, venmo_link: '', buy_in: '$80', team_size: 4 };

describe('buildManageTournamentHTML — the tournament sub-hub (pick R2, mockup t-b)', () => {
  it('renders the tournament name header, the stage sub-line, and all seven rows', () => {
    setTournamentState(setupOpen);
    const html = bridge.buildTournament();
    expect(html).toContain('class="pd-htitle">July 2026<');
    expect(html).toContain('class="mgt-stage">Setup · registration phase<');
    ['registration', 'teams', 'pools', 'bracket', 'settings', 'rules', 'closeout'].forEach((v) =>
      expect(count(html, `data-mgt-view="${v}"`)).toBe(1));
    expect(html).toContain('data-mg-area="lead"');   // back to the Manage lead
    expect(html).not.toContain('pd-card');
  });

  it('shows the green Open word + team count on the Registration row when open', () => {
    setTournamentState(setupOpen);
    const html = bridge.buildTournament();
    expect(html).toContain('class="mgt-on">Open<');
    expect(html).toContain('3 teams · close it when full');
  });

  it('shows Closed (no green word) on the Registration row when registration is closed', () => {
    // a pools-stage tournament with registration closed → resolved by publicLiveTournament
    setTournamentState({ id: 'T', name: 'July 2026', status: 'pools', registration_open: false });
    const html = bridge.buildTournament();
    expect(html).not.toContain('class="mgt-on"');
    expect(html).toContain('>Closed<');
    expect(html).toContain('class="mgt-stage">Pool play<'); // stage sub-line follows status
  });

  it('teams-and-payment + stage-honest subs read from state', () => {
    setTournamentState(setupOpen);
    const html = bridge.buildTournament();
    expect(html).toContain('3 registered · 2 unpaid');
    expect(html).toContain('Not drawn yet');   // pools sub in setup
    expect(html).toContain('After pool play'); // bracket sub before pools
    expect(html).toContain('4s co-ed · $80');  // settings one-liner from real fields
    expect(html).toContain('Edit what players read on the Rules page');
    expect(html).toContain('End the tournament · crown the champion');
  });

  it('honest empty state when there is no tournament to manage', () => {
    setTournamentState(null, { tournaments: [], activeTournamentId: null });
    const html = bridge.buildTournament();
    expect(html).toContain('No tournament yet');
  });

  it('the container dispatch shows the hub for null mgtView and a placeholder for the still-unbuilt sub-views', () => {
    setTournamentState(setupOpen);
    expect(bridge.mgtContainer()).toContain('data-mgt-view="registration"'); // hub
    // Task 6 built the teams view; 'pools' is still a placeholder until Task 7.
    const poolsView = bridge.mgtContainer('pools');
    expect(poolsView).toContain('Coming in the next slices.');
    expect(poolsView).toContain('data-mgt-back'); // placeholder returns to the hub, not the lead
  });
});

describe('buildMgRegistrationHTML — the Registration view (pick R7, mockup r-b)', () => {
  it('prefills the announcement textarea with the composed default when announcement is null', () => {
    setTournamentState(setupOpen); // announcement absent
    const html = bridge.buildReg();
    expect(html).toContain('id="mgr-ann"');
    expect(html).toContain('July 2026 — registration is open! $80, 4s co-ed. Register at athletic-specimen.com');
    expect(html).toContain('data-mgt-back');   // back returns to the sub-hub
    expect(html).not.toContain('pd-card');
  });

  it('prefers a persisted announcement over the default and tolerates the column being absent', () => {
    expect(bridge.annValue({ name: 'X', team_size: 4, announcement: 'Come play!' })).toBe('Come play!');
    // pre-migration: announcement === undefined → composed default (never a crash / never "undefined")
    const pre = bridge.annValue({ name: 'X', team_size: 4 });
    expect(pre).toContain('registration is open!');
    expect(pre).not.toContain('undefined');
  });

  it('composes the default gracefully when buy_in is missing', () => {
    expect(bridge.defaultAnnouncement({ name: 'July 2026', team_size: 4 }))
      .toBe('July 2026 — registration is open! 4s co-ed. Register at athletic-specimen.com');
    // with buy-in present it is folded in
    expect(bridge.defaultAnnouncement({ name: 'July 2026', team_size: 3, buy_in: '$60' }))
      .toBe('July 2026 — registration is open! $60, 3s co-ed. Register at athletic-specimen.com');
  });

  it('renders the Copy for GroupMe CTA', () => {
    setTournamentState(setupOpen);
    expect(bridge.buildReg()).toContain('data-mgr-copy');
    expect(bridge.buildReg()).toContain('Copy for GroupMe');
  });

  it('the switch reflects registration_open (on) / closed (off) and toggles the reg write path', () => {
    setTournamentState(setupOpen);
    const on = bridge.buildReg();
    expect(on).toContain('class="mg-sw on"');
    expect(on).toContain('data-mgr-regtoggle');
    setTournamentState({ id: 'T', name: 'July 2026', status: 'pools', registration_open: false });
    const off = bridge.buildReg();
    expect(off).toContain('data-mgr-regtoggle');
    expect(off).not.toContain('mg-sw on');
  });

  it('renders the venmo/buy-in/team-size fields with the values prefilled', () => {
    setTournamentState({ id: 'T', name: 'July 2026', status: 'setup', registration_open: true, venmo_link: 'https://venmo.com/u/mike', buy_in: '$80', team_size: 4 });
    const html = bridge.buildReg();
    expect(html).toContain('id="mgr-venmo"');
    expect(html).toContain('value="https://venmo.com/u/mike"');
    expect(html).toContain('id="mgr-buyin"');
    expect(html).toContain('value="$80"');
    expect(html).toContain('id="mgr-teamsize"');
  });

  it('honestly flags a missing Venmo link (pay button says coming soon)', () => {
    setTournamentState(setupOpen); // venmo_link ''
    expect(bridge.buildReg()).toContain('coming soon');
  });
});

// ── Named fix (T5 flag): manageLeadTournament must not strand the Manage → Tournament workflow ───────
// The old resolver was `publicLiveTournament() || setup+registration_open`. A setup tournament with
// registration CLOSED (the gap between "close registration" and "draw pools") resolved to null → the
// sub-hub + needs-you went blank mid-setup. Widened: live (pools/bracket) || most-recent SETUP regardless
// of registration_open ('completed' still excluded). state.tournaments loads created_at DESC, so the first
// setup match is the most-recent one.
describe('manageLeadTournament — the closed-setup fix', () => {
  const setLead = (tournaments, activeId = null) => Object.assign(bridge.getState(), {
    tournaments, activeTournamentId: activeId, isAdmin: true,
  });

  it('resolves a SETUP tournament even after registration is CLOSED (the strand fix)', () => {
    const closedSetup = { id: 'S', name: 'July 2026', status: 'setup', registration_open: false };
    setLead([closedSetup]);
    expect(bridge.leadTournament()).toBe(closedSetup);
  });

  it('still resolves an open-registration setup tournament', () => {
    const openSetup = { id: 'S', name: 'July 2026', status: 'setup', registration_open: true };
    setLead([openSetup]);
    expect(bridge.leadTournament()).toBe(openSetup);
  });

  it('prefers a live pools/bracket tournament over a setup draft', () => {
    const live = { id: 'L', name: 'Live', status: 'pools', registration_open: false };
    const setup = { id: 'S', name: 'Draft', status: 'setup', registration_open: false };
    // list is created_at DESC; live is followed regardless of order
    setLead([setup, live]);
    expect(bridge.leadTournament()).toBe(live);
  });

  it('picks the MOST-RECENT setup (first in the created_at-DESC list) when several exist', () => {
    const newer = { id: 'N', name: 'Newer', status: 'setup', registration_open: false };
    const older = { id: 'O', name: 'Older', status: 'setup', registration_open: true };
    setLead([newer, older]); // DESC → newer first
    expect(bridge.leadTournament()).toBe(newer);
  });

  it('excludes a completed tournament (returns null when only completed exists)', () => {
    setLead([{ id: 'C', name: 'Done', status: 'completed', registration_open: false }]);
    expect(bridge.leadTournament()).toBe(null);
  });
});

// ── Task 6: Teams & payment list + full-edit team sheet (pick R8, mockup tp-a) ────────────────────────
// buildMgTeamsHTML() = the list (name + first-name roster preview + PAID/TAP-WHEN-PAID tag + chevron +
// dashed "Add a team yourself"). buildMgTeamSheetHTML(team) = the body-level full-edit sheet (name, stacked
// editable roster, paid switch, move-to-pool ONLY when pools exist, withdraw ONLY mid-play, type-DELETE
// remove). Flat on stone, no pd-card.
function setTeamsFixture(extra = {}) {
  const st = bridge.getState();
  Object.assign(st, {
    tournaments: [{ id: 'T', name: 'July 2026', status: 'setup', registration_open: true, team_size: 4 }],
    activeTournamentId: 'T',
    tournamentTeams: [
      { id: 't1', name: 'Dink Responsibly', paid: true, roster: ['Riley Smith', 'Sam Lee', 'Jo Park', 'Casey Ng'] },
      { id: 't2', name: 'Sets & Reps', paid: false, roster: ['Drew Alton', 'Pat Boyd'] },
    ],
    tournamentPools: [], tournamentMatches: [], teamMembers: null,
    players: [], checkedIn: [], isAdmin: true,
    ...extra,
  });
}

describe('buildMgTeamsHTML — Teams & payment list (pick R8, mockup tp-a)', () => {
  it('renders the header (back to the sub-hub) and the N-in / N-paid section label', () => {
    setTeamsFixture();
    const html = bridge.buildMgTeams();
    expect(html).toContain('class="pd-htitle">Teams &amp; payment<');
    expect(html).toContain('data-mgt-back');           // back returns to the Tournament sub-hub
    expect(html).toContain('2 in · 1 paid');           // 2 registered, 1 paid
    expect(html).not.toContain('pd-card');
  });

  it('renders one row per team with the team name + a first-names roster preview', () => {
    setTeamsFixture();
    const html = bridge.buildMgTeams();
    expect(count(html, 'data-mgtp-team="t1"')).toBe(1);
    expect(count(html, 'data-mgtp-team="t2"')).toBe(1);
    expect(html).toContain('Dink Responsibly');
    expect(html).toContain('Sets &amp; Reps');
    expect(html).toContain('Riley · Sam · Jo · Casey'); // first names, joined by ' · ', from teams.roster
  });

  it('prefers team_members names for the preview when they are loaded', () => {
    setTeamsFixture({ teamMembers: [
      { id: 'p1', name: 'Alex Rivera', teamId: 't1', teamName: 'Dink Responsibly' },
      { id: 'p2', name: 'Bailey Fox', teamId: 't1', teamName: 'Dink Responsibly' },
    ] });
    expect(bridge.buildMgTeams()).toContain('Alex · Bailey'); // members override the roster jsonb
  });

  it('shows the PAID / TAP WHEN PAID tag as a tappable toggle (never a bare dot)', () => {
    setTeamsFixture();
    const html = bridge.buildMgTeams();
    expect(html).toContain('data-mgtp-paid="t1"');
    expect(html).toContain('data-mgtp-paid="t2"');
    expect(html).toContain('mgtp-tag paid');   // t1 is paid
    expect(html).toContain('>PAID<');
    expect(html).toContain('mgtp-tag unpaid');  // t2 is not
    expect(html).toContain('>TAP WHEN PAID<');
    expect(html).not.toMatch(/mt-pip|•/);       // no bare dots
  });

  it('offers the dashed "Add a team yourself" affordance', () => {
    setTeamsFixture();
    const html = bridge.buildMgTeams();
    expect(html).toContain('data-mgtp-add');
    expect(html).toContain('Add a team yourself');
  });

  it('honest empty state when no team has registered', () => {
    setTeamsFixture({ tournamentTeams: [] });
    const html = bridge.buildMgTeams();
    expect(html).toContain('No teams yet');
    expect(html).toContain('data-mgtp-add'); // can still add one by hand
    expect(html).not.toContain('data-mgtp-team');
  });
});

describe('buildMgTeamSheetHTML — the full-edit team sheet (pick R8)', () => {
  it('renders the editable name + a stacked, editable roster (one line per player + a blank add line)', () => {
    setTeamsFixture();
    const html = bridge.buildTeamSheet('t1');
    expect(html).toContain('id="mgts-name"');
    expect(html).toContain('value="Dink Responsibly"');
    expect(count(html, 'class="mgts-rline"')).toBe(5); // 4 players + 1 blank add line
    expect(html).toContain('value="Riley Smith"');
    expect(html).toContain('value="Casey Ng"');
  });

  it('shows the paid switch reflecting the team state', () => {
    setTeamsFixture();
    expect(bridge.buildTeamSheet('t1')).toContain('mg-sw on');  // t1 paid → on
    expect(bridge.buildTeamSheet('t2')).not.toContain('mg-sw on'); // t2 unpaid → off
  });

  it('shows the move-to-pool row ONLY when pools exist', () => {
    setTeamsFixture(); // no pools
    expect(bridge.buildTeamSheet('t1')).not.toContain('data-mgts="pool"');
    setTeamsFixture({ tournamentPools: [ { id: 'pa', label: 'A', display_order: 0 }, { id: 'pb', label: 'B', display_order: 1 } ] });
    const withPools = bridge.buildTeamSheet('t1');
    expect(withPools).toContain('data-mgts="pool"');
    expect(withPools).toContain('data-mgts-pool="pa"');
  });

  it('shows the withdraw row ONLY mid-play and states plainly that it forfeits remaining games', () => {
    setTeamsFixture(); // setup → no withdraw
    expect(bridge.buildTeamSheet('t1')).not.toContain('data-mgts="withdraw"');
    setTeamsFixture({ tournaments: [{ id: 'T', name: 'July 2026', status: 'pools', registration_open: false }] });
    const midPlay = bridge.buildTeamSheet('t1');
    expect(midPlay).toContain('data-mgts="withdraw"');
    expect(midPlay).toContain('Forfeits their remaining games');
  });

  it('always offers a type-DELETE remove and a quiet Done/close', () => {
    setTeamsFixture();
    const html = bridge.buildTeamSheet('t1');
    expect(html).toContain('data-mgts="remove"');
    expect(html).toContain('Remove this team');
    expect(html).toContain('data-mgts="close"'); // backdrop + Done both close
  });
});
