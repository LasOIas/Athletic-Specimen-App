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
      needsYou: (ctx) => manageNeedsYouModel(ctx),
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
      buildMgPools: (opts) => { opts = opts || {}; manageView = 'tournament'; mgtView = 'pools'; mgpPoolFilter = (opts.filter === undefined ? null : opts.filter); mgpControlsOpen = !!opts.controls; return buildMgPoolsHTML(); },
      buildScoreSheet: (m) => buildMgScoreSheetHTML(m),
      buildBracket: (opts) => { opts = opts || {}; manageView = 'tournament'; mgtView = 'bracket'; state.seedOverride = (opts.seedOverride === undefined ? null : opts.seedOverride); mgBracketShowDone = !!opts.showDone; return buildMgBracketHTML(); },
      buildSettings: () => { manageView = 'tournament'; mgtView = 'settings'; return buildMgSettingsHTML(); },
      buildRules: () => { manageView = 'tournament'; mgtView = 'rules'; return buildMgRulesHTML(); },
      buildCloseout: (opts) => {
        opts = opts || {};
        manageView = 'tournament'; mgtView = 'closeout';
        mgCloseoutChampId = ('champId' in opts) ? opts.champId : undefined;
        return buildMgCloseoutHTML();
      },
      closeoutContainer: () => { manageView = 'tournament'; mgtView = 'closeout'; return manageContainerHTML(); },
      buildChampPicker: (teams, sel) => buildMgChampionPickerHTML(teams, sel),
      // Task 11 (Admins, pick R6): drive buildMgAdminsHTML via manageContainerHTML with injected module
      // state (seat/log data normally loads lazily via the 0051 RPCs — the tests inject it directly).
      buildAdmins: (opts) => {
        opts = opts || {};
        manageView = 'admins';
        mgAdminsView = opts.view || 'seats';
        mgSeats = ('seats' in opts) ? opts.seats : null;
        mgSeatsLoading = !!opts.seatsLoading;
        mgSeatsError = opts.seatsError || '';
        mgAssignOpen = !!opts.assign;
        mgLog = ('log' in opts) ? opts.log : null;
        mgLogLoading = !!opts.logLoading;
        mgLogError = opts.logError || '';
        return manageContainerHTML();
      },
      // Task 12 (Co-pilot, Mike §6): the admin-only floating bubble + chat-on-stone shell fragment.
      copilotShell: () => copilotShellHTML(),
    };`;
  const context = vm.createContext(sandbox);
  vm.runInContext(pureSrc, context, { filename: 'pure.js' });
  vm.runInContext(appSrc + epilogue, context, { filename: 'app.js' });
  return sandbox.__bridge;
}

const bridge = loadApp();
const count = (hay, needle) => hay.split(needle).length - 1;

// ── the pure needs-you model ──────────────────────────────────────────────────
// UPDATED by the Manage handoff (2026-08-25): the model takes ONE ctx object and every item now carries the
// verb that fixes it plus where that verb goes. The three kinds pinned here are the ones that shipped in
// session 10 and survived the rebuild unchanged in meaning — venmo, unpaid, noday — re-asserted against the
// new signature. The round's new items (sign-ups, pools, venue, fee, rules, silent net) are covered in
// manage-round.test.js, next to the hub that renders them.
describe('manageNeedsYouModel — pure attention model', () => {
  // Satisfied on every OTHER axis, so each test below moves exactly one thing.
  const base = { id: 'T', name: 'July 2026', status: 'setup', registration_open: true,
    buy_in: '$80 a team', rules: '## Format', venue: 'Washington Park' };
  const openNoVenmo = { ...base, venmo_link: '' };
  const openWithVenmo = { ...base, venmo_link: 'https://venmo.com/u/x' };
  const ctx = (t, teams, days) => ({ t, teams, pickupDays: days, pools: [], matches: [],
    tournaments: [], scope: 'hub', venueLoaded: true });

  it('flags a missing venmo link only while registration is open', () => {
    const items = bridge.needsYou(ctx(openNoVenmo, [], ['a-day']));
    expect(items.some((i) => i.id === 'venmo')).toBe(true);
    // reg closed → the venmo nudge disappears (nobody is paying yet); the sign-ups item is what blocks
    const closed = bridge.needsYou(ctx({ ...openNoVenmo, registration_open: false }, [], ['a-day']));
    expect(closed.some((i) => i.id === 'venmo')).toBe(false);
    expect(closed.some((i) => i.id === 'signups')).toBe(true);
    // venmo present → no nudge
    const paidLink = bridge.needsYou(ctx(openWithVenmo, [], ['a-day']));
    expect(paidLink.some((i) => i.id === 'venmo')).toBe(false);
  });

  it('flags unpaid teams with a pluralized count title and names who is still out', () => {
    const teams = [
      { id: 't1', name: 'Sets & Reps', paid: false },
      { id: 't2', name: 'Dig It', paid: false },
      { id: 't3', name: 'Paid Squad', paid: true },
    ];
    const items = bridge.needsYou(ctx(openWithVenmo, teams, ['a-day']));
    const unpaid = items.find((i) => i.id === 'unpaid');
    expect(unpaid).toBeTruthy();
    expect(unpaid.title).toBe("2 of 3 teams haven't paid");
    expect(unpaid.sub).toBe('Sets & Reps · Dig It, the other 1 is paid');
    expect(unpaid.verb).toBe('See who paid');
    expect(unpaid.kind).toBe('jump');
    // one unpaid team → singular grammar
    const one = bridge.needsYou(ctx(openWithVenmo, [{ id: 't1', name: 'Solo', paid: false }], ['a-day']));
    expect(one.find((i) => i.id === 'unpaid').title).toBe("1 of 1 team hasn't paid");
    expect(one.find((i) => i.id === 'unpaid').sub).toBe('Solo, none are paid yet');
    // all paid → no unpaid item
    const allPaid = bridge.needsYou(ctx(openWithVenmo, [{ id: 't3', name: 'Paid Squad', paid: true }], ['a-day']));
    expect(allPaid.some((i) => i.id === 'unpaid')).toBe(false);
  });

  it('flags no pickup day when the (already-upcoming) day set is empty', () => {
    expect(bridge.needsYou(ctx(openWithVenmo, [], [])).some((i) => i.id === 'noday')).toBe(true);
    expect(bridge.needsYou(ctx(openWithVenmo, [], ['a-day'])).some((i) => i.id === 'noday')).toBe(false);
  });

  it('returns [] when nothing needs attention', () => {
    const teams = [{ id: 't3', name: 'Paid Squad', paid: true }];
    expect(bridge.needsYou(ctx(openWithVenmo, teams, ['a-day']))).toEqual([]);
  });

  it('every item carries a verb and somewhere for it to go', () => {
    const teams = [{ id: 't1', name: 'X', paid: false }];
    const items = bridge.needsYou(ctx(openNoVenmo, teams, []));
    expect(items.map((i) => i.id)).toEqual(['unpaid', 'venmo', 'noday']);
    items.forEach((i) => {
      expect(i.verb).toBeTruthy();
      expect(['jump', 'fix']).toContain(i.kind);
      const t = i.target || {};
      expect(!!(t.view || t.area || t.matchId || t.action)).toBe(true);
    });
  });
});

// ── the Manage hub builder ────────────────────────────────────────────────────
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

describe('buildManagePageHTML — the Manage hub (title block, then the flat rows)', () => {
  // UPDATED by the Manage handoff (2026-08-25). The `.mg-h1` heading and the `.mgv-tsw` switcher card both
  // retired: "Manage" is an eyebrow now and the TOURNAMENT is the page title, with the picker inside it.
  it('renders the title block, both sections, and de-carded flat rows', () => {
    setManageState();
    const html = bridge.buildManage();
    expect(html).toContain('class="mgh-eyebrow">Manage<');
    expect(html).toContain('class="mgh-tname">July 2026<');
    expect(html).not.toContain('mg-h1');
    expect(html).toContain('>Needs you<');
    expect(html).toContain('>Everything<');
    expect(html).not.toContain('pd-card');
    expect(html).toContain('class="mg-chev"');
  });

  it('renders exactly the six EVERYTHING area rows (no needs-you sharing an area)', () => {
    // satisfied state → NEEDS YOU is omitted, so each area id appears once (its EVERYTHING row only)
    setManageState({
      tournaments: [{ id: 'T', name: 'July 2026', status: 'setup', registration_open: true,
        venmo_link: 'https://venmo.com/u/x', buy_in: '$80 a team', rules: '## Format' }],
      tournamentTeams: [{ id: 't3', name: 'Paid Squad', paid: true }],
      currentSession: { date: '2999-01-01', time: '10:00 AM', location: 'Gym' },
    });
    const html = bridge.buildManage();
    ['tournament', 'pickup', 'checkin', 'players', 'teams', 'admins'].forEach((area) => {
      expect(count(html, `data-mg-area="${area}"`)).toBe(1);
    });
  });

  // UPDATED by the 2026-08-25 handoff. The subtitle carries what the row LEADS INTO; where the work stands
  // moved to the right-hand chip, and the club roster count is a chip too. Both facts are still on the page.
  it('shows real one-line status subs pulled from state', () => {
    setManageState();
    const html = bridge.buildManage();
    expect(html).toContain('class="mgh-tname">July 2026<');           // the title names it
    expect(html).toContain('registration open');                      // the meta clause
    expect(html).toContain('Registration, teams, pools, bracket');    // the row leads into these
    expect(html).toContain('class="mgv-rmeta">233 on file<');         // players row chip
    expect(html).toContain('The roster everyone is picked from');
  });

  it('surfaces the needs-you rows when work is pending (venmo + unpaid + noday)', () => {
    setManageState();
    const html = bridge.buildManage();
    expect(html).toContain("2 of 2 teams haven't paid");
    expect(html).toContain('Add the Venmo link');
    expect(html).toContain('No pickup day set');
  });

  it('omits the NEEDS YOU section entirely when nothing needs attention', () => {
    setManageState({
      tournaments: [{ id: 'T', name: 'July 2026', status: 'setup', registration_open: true,
        venmo_link: 'https://venmo.com/u/x', buy_in: '$80 a team', rules: '## Format' }],
      tournamentTeams: [{ id: 't3', name: 'Paid Squad', paid: true }],
      currentSession: { date: '2999-01-01', time: '10:00 AM', location: 'Gym' }, // far-future upcoming day
    });
    const html = bridge.buildManage();
    expect(html).not.toContain('>Needs you<');
    expect(html).not.toContain('mgh-nrow');
    expect(html).toContain('>Everything<'); // the rest of the hub still renders
  });

  it('no longer carries the old-admin escape hatch (Task 14: old shell deleted)', () => {
    setManageState();
    const html = bridge.buildManage();
    expect(html).not.toContain('data-mg-old');
    expect(html).not.toContain('Open the old admin');
    expect(html).not.toContain('mg-oldlink');
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
    expect(html).toContain('No pickup days scheduled. Add one to open Check In.');
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
// balanced teams + TODAY'S TEAMS (TEAM n label + names STACKED one-per-line), READ-ONLY since 2026-08-07.
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

  // 2026-08-07 (Mike: "remove the drag and drop player feature from the teams that are generated", then
  // "remove all ways to switch players"). The board is READ-ONLY: a name carries no hooks, there is no drag
  // grip, no swap sheet, no Undo strip and no drift warning. Generate is the only control that changes it.
  // This test replaces the two that asserted the swap sheet — it locks the removal so a future round cannot
  // quietly reintroduce a move affordance without deciding to.
  it('renders the team board READ-ONLY — no swap, drag, undo or drift affordance survives', () => {
    setTeams({ generatedTeams: twoTeams });
    const html = bridge.buildTeams({});
    // tap-to-swap
    expect(html).not.toContain('data-mgt-swap');
    expect(html).not.toContain('data-mgt-from');
    expect(html).not.toContain('data-mgt-to');
    expect(html).not.toContain('data-mgt-cancel');
    expect(html).not.toContain('mgt-sheet');
    expect(html).not.toMatch(/Tap a name/i);
    // the drag gesture and its two riders
    expect(html).not.toContain('data-mgt-grip');
    expect(html).not.toContain('mgv-hnd');
    expect(html).not.toContain('data-mgv-undo');
    expect(html).not.toContain('mgv-undo');
    expect(html).not.toContain('mgv-warn');
    expect(html).not.toMatch(/Drag a name/i);
    // ...while the board itself still renders, and Generate still works
    expect(html).toContain('class="mgt-nm"');
    expect(html).toContain('Mikey Olas');
    expect(html).toContain('data-mgt-generate');
    expect(html).toContain('Regenerate any time');
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

// Round 2026-08-25 re-point: the muted stage sub-line is gone. Where the tournament stands is drawn by the
// SAME six-step track the Manage hub uses (mgHubTrackHTML), so these three assertions read the track now.
// The rows are no longer "seven": they are grouped by the question they answer and Needs-you sits above
// them, which is why a per-view COUNT of 1 no longer holds — a needs-you item hooks the same view.
describe('buildManageTournamentHTML — the tournament sub-hub (pick R2, mockup t-b)', () => {
  it('renders the tournament name header, the phase track, and every sub-view row', () => {
    setTournamentState(setupOpen);
    const html = bridge.buildTournament();
    expect(html).toContain('class="pd-htitle">July 2026<');
    expect(html).not.toContain('mgt-stage');
    expect(count(html, 'class="mgh-step')).toBe(6);            // the track replaces the stage word
    expect(html).toContain('class="mgh-step is-now">Sign-ups'); // setup + registration open
    ['registration', 'teams', 'teamadd', 'pools', 'bracket', 'settings', 'rules', 'closeout'].forEach((v) =>
      expect(count(html, `data-mgt-view="${v}"`)).toBeGreaterThanOrEqual(1));
    expect(html).toContain('data-mg-area="lead"');   // back to the Manage lead
    expect(html).not.toContain('pd-card');
  });

  it('shows the green Open word on the Registration row when open, with no unbacked clause', () => {
    setTournamentState(setupOpen);
    const html = bridge.buildTournament();
    expect(html).toContain('class="mgt-on">Open<');
    // Round 2026-08-03 (README §7), still law: subtitles carry real status. The prototype's "6 of 12
    // teams · closes Fri 6 PM" is NOT rendered - there is no team-cap column loaded on this row and no
    // close-time column at all, and Mike's ruling was to drop unbacked clauses rather than invent a figure.
    expect(html).toContain('Open</span> · what players see');
    expect(html).not.toContain('-team cap');    // team_cap is not on the loaded row
    expect(html).not.toMatch(/closes \w+ \d/);  // no invented close time
    expect(html).toContain('class="mgv-rmeta"'); // the right-hand state word
  });

  it('shows Closed (no green word) on the Registration row when registration is closed', () => {
    // a pools-stage tournament with registration closed → resolved by publicLiveTournament
    setTournamentState({ id: 'T', name: 'July 2026', status: 'pools', registration_open: false });
    const html = bridge.buildTournament();
    expect(html).not.toContain('class="mgt-on"');
    expect(html).toContain('>Closed<');
    expect(html).toContain('class="mgh-step is-now">Pools');   // the track follows status
  });

  it('teams-and-payment + stage-honest subs read from state', () => {
    setTournamentState(setupOpen);
    const html = bridge.buildTournament();
    expect(html).toContain('3 registered · 2 unpaid · rosters and buy-in');
    expect(html).not.toContain('collected');   // no invented money total
    // Round 2026-08-03: the pools/bracket subs carry real status plus a state word.
    expect(html).toContain('Not drawn');                       // pools sub in setup
    expect(html).toContain('>To do<');                         // its state word
    expect(html).toContain('opens when pool play finishes');   // bracket sub before pools
    expect(html).toContain('>Locked<');                        // its state word
    expect(html).toContain('4s co-ed · $80');  // settings one-liner from real fields
    // Rules sub reports real content state. It deliberately does NOT date the sheet: tournaments
    // .updated_at moves on any field write, so "updated Jul 28" would be a lie.
    expect(html).toContain('· not written yet');
    expect(html).not.toMatch(/updated \w+ \d/);
    expect(html).toContain('Crowns the champion and archives the event');
  });

  it('honest empty state when there is no tournament to manage', () => {
    setTournamentState(null, { tournaments: [], activeTournamentId: null });
    const html = bridge.buildTournament();
    expect(html).toContain('No tournament yet');
  });

  // C80 (2026-07-26): scoring the grand final auto-completes the tournament server-side without recording a
  // champion, and close_tournament then refuses to run. The completed screen must still offer the crown.
  it('a completed tournament with NO stored champion offers to record the one the bracket picked', () => {
    setTournamentState(
      { id: 'T', name: 'July 2026', status: 'completed', registration_open: false, champion_team_id: null },
      {
        tournamentTeams: [{ id: 't1', name: 'Sets & Reps' }, { id: 't2', name: 'Dig It' }],
        tournamentMatches: [
          { phase: 'main', side: 'grand_final', round: 1, status: 'final', team_a_id: 't1', team_b_id: 't2', winner_team_id: 't1' },
        ],
      },
    );
    const html = bridge.buildCloseout();
    expect(html).toContain('data-mgco-record');
    expect(html).toContain('Record Sets &amp; Reps as champion');
    expect(html).toContain('WON THE BRACKET, NOT RECORDED');
    expect(html).toContain('data-mgco-change');   // can override the pick
    expect(html).toContain('data-mgco-reopen');   // reopen still available
    expect(html).not.toContain('No champion recorded');
  });

  it('a completed tournament with a STORED champion just shows it, no record CTA', () => {
    setTournamentState(
      { id: 'T', name: 'July 2026', status: 'completed', registration_open: false, champion_team_id: 't2' },
      { tournamentTeams: [{ id: 't1', name: 'Sets & Reps' }, { id: 't2', name: 'Dig It' }], tournamentMatches: [] },
    );
    const html = bridge.buildCloseout();
    expect(html).toContain('Dig It');
    expect(html).not.toContain('data-mgco-record');
    expect(html).not.toContain('data-mgco-change');
    expect(html).toContain('data-mgco-reopen');
  });

  it('a completed tournament with no champion and no bracket answer still lets you pick one', () => {
    setTournamentState(
      { id: 'T', name: 'July 2026', status: 'completed', registration_open: false, champion_team_id: null },
      { tournamentTeams: [{ id: 't1', name: 'Sets & Reps' }], tournamentMatches: [] },
    );
    const html = bridge.buildCloseout();
    expect(html).toContain('NO CHAMPION RECORDED');
    expect(html).toContain('Pick the winning team');
    expect(html).toContain('data-mgco-record');
    expect(html).toContain('data-mgco-change');
  });

  it('the container dispatch shows the hub for null mgtView and a placeholder for the still-unbuilt sub-views', () => {
    setTournamentState(setupOpen);
    expect(bridge.mgtContainer()).toContain('data-mgt-view="registration"'); // hub
    // Task 7 filled 'pools'; Task 8 filled 'bracket' — both dispatch to their real views (own back button,
    // no placeholder copy). No sub-view still shows the "Coming in the next slices." placeholder.
    const bracketView = bridge.mgtContainer('bracket');
    expect(bracketView).not.toContain('Coming in the next slices.');
    expect(bracketView).toContain('data-mgt-back'); // real view returns to the hub via the header back button
    // 'pools' now dispatches to the real Pools & schedule view (its own back button, no placeholder copy).
    const poolsView = bridge.mgtContainer('pools');
    expect(poolsView).not.toContain('Coming in the next slices.');
    expect(poolsView).toContain('data-mgt-back');
  });
});

describe('buildMgRegistrationHTML — the Registration view (pick R7, mockup r-b)', () => {
  it('shows the announcement in a tap-to-edit read block with the composed default when announcement is null', () => {
    setTournamentState(setupOpen); // announcement absent
    const html = bridge.buildReg();
    // §38 pick C (2026-07-12): the inline textarea is retired for a read block + full-screen editor.
    expect(html).not.toContain('id="mgr-ann"');
    expect(html).toContain('class="mgr-annview" data-mgr-edit');
    expect(html).toContain('data-mgr-edit'); // tap the block (or the Edit link) → openManageEditor('announcement')
    expect(html).toContain('July 2026. Registration is open! $80, 4s co-ed. Register at athletic-specimen.com');
    expect(html).toContain('data-mgt-back');   // back returns to the sub-hub
    expect(html).not.toContain('pd-card');
  });

  it('prefers a persisted announcement over the default and tolerates the column being absent', () => {
    expect(bridge.annValue({ name: 'X', team_size: 4, announcement: 'Come play!' })).toBe('Come play!');
    // pre-migration: announcement === undefined → composed default (never a crash / never "undefined")
    const pre = bridge.annValue({ name: 'X', team_size: 4 });
    expect(pre).toContain('Registration is open!');
    expect(pre).not.toContain('undefined');
  });

  it('composes the default gracefully when buy_in is missing', () => {
    expect(bridge.defaultAnnouncement({ name: 'July 2026', team_size: 4 }))
      .toBe('July 2026. Registration is open! 4s co-ed. Register at athletic-specimen.com');
    // with buy-in present it is folded in
    expect(bridge.defaultAnnouncement({ name: 'July 2026', team_size: 3, buy_in: '$60' }))
      .toBe('July 2026. Registration is open! $60, 3s co-ed. Register at athletic-specimen.com');
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

  it('falls back to a completed tournament as a last resort (Task 10: reopen must be reachable)', () => {
    // Changed by Task 10 (pick R12): a just-closed tournament stays manageable so the admin can reopen it.
    const done = { id: 'C', name: 'Done', status: 'completed', registration_open: false, updated_at: '2026-07-10T00:00:00Z' };
    setLead([done]);
    expect(bridge.leadTournament()).toBe(done);
  });

  it('still prefers a setup/live tournament over a completed one (completed is only the last resort)', () => {
    const done = { id: 'C', name: 'Done', status: 'completed', registration_open: false, updated_at: '2026-07-10T00:00:00Z' };
    const setup = { id: 'S', name: 'Next', status: 'setup', registration_open: false };
    setLead([done, setup]);
    expect(bridge.leadTournament()).toBe(setup);
  });

  it('returns the MOST-RECENT completed when several completed exist and nothing is live/setup', () => {
    const older = { id: 'O', name: 'Older', status: 'completed', registration_open: false, updated_at: '2026-06-01T00:00:00Z' };
    const newer = { id: 'N', name: 'Newer', status: 'completed', registration_open: false, updated_at: '2026-07-01T00:00:00Z' };
    setLead([older, newer]);
    expect(bridge.leadTournament().id).toBe('N');
  });

  it('returns null when there is genuinely no tournament', () => {
    setLead([]);
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

  // Round 2026-08-03 (README §8): the row-level PAID / TAP WHEN PAID toggle is GONE. It was a
  // hit-sized button sitting next to the chevron that opens the team, so a mis-tap flipped a
  // payment. Rows now only REPORT state; marking paid moved into the team popup.
  it('reports paid state on the row and no longer carries the toggle', () => {
    setTeamsFixture();
    const html = bridge.buildMgTeams();
    expect(html).toContain('mgv-pmeta is-paid');    // t1 is paid
    expect(html).toContain('>Paid<');
    expect(html).toContain('mgv-pmeta is-unpaid');  // t2 is not
    expect(html).toContain('>Unpaid<');
    // The whole row opens the team; the destructive toggle is not on it.
    expect(html).toContain('data-mgtp-team="t1"');
    expect(html).not.toContain('data-mgtp-paid=');
    expect(html).not.toContain('TAP WHEN PAID');
    expect(html).not.toMatch(/mt-pip|•/);           // no bare dots
  });

  it('offers the dashed "Add a team yourself" affordance', () => {
    setTeamsFixture();
    const html = bridge.buildMgTeams();
    expect(html).toContain('data-mgt-view="teamadd"');
    expect(html).toContain('Add a team yourself');
  });

  it('honest empty state when no team has registered', () => {
    setTeamsFixture({ tournamentTeams: [] });
    const html = bridge.buildMgTeams();
    expect(html).toContain('No teams yet');
    expect(html).toContain('data-mgt-view="teamadd"'); // can still add one by hand
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

// ── Task 7 (pick R9): Pools & schedule admin — score on the schedule ──────────
const EN = '–'; // EN DASH — the score / record separator the builders emit

function setPoolsFixture(extra = {}) {
  const st = bridge.getState();
  Object.assign(st, {
    tournaments: [{
      id: 'T', name: 'July 2026', status: 'pools', registration_open: false,
      team_size: 4, net_count: 2, pool_count: 2,
      pool_target: 15, pool_cap: 20, bracket_target: 21, bracket_cap: 25, win_by_2: true,
    }],
    activeTournamentId: 'T',
    tournamentTeams: [
      { id: 't1', name: 'Dink Responsibly', pool_id: 'p1', paid: true },
      { id: 't2', name: 'Sets & Reps', pool_id: 'p1', paid: true },
      { id: 't3', name: 'Block Party', pool_id: 'p2', paid: true },
      { id: 't4', name: 'Net Gains', pool_id: 'p2', paid: true },
    ],
    tournamentPools: [{ id: 'p1', label: 'A', display_order: 0 }, { id: 'p2', label: 'B', display_order: 1 }],
    tournamentMatches: [
      { id: 'gA1', tournament_id: 'T', pool_id: 'p1', phase: 'pool', net: 1, queue_order: 1, status: 'final', team_a_id: 't1', team_b_id: 't2', winner_team_id: 't1', score_a: 15, score_b: 12, version: 1 },
      { id: 'gA2', tournament_id: 'T', pool_id: 'p1', phase: 'pool', net: 1, queue_order: 2, status: 'live', team_a_id: 't1', team_b_id: 't2', score_a: 12, score_b: 9, version: 1 },
      { id: 'gA3', tournament_id: 'T', pool_id: 'p1', phase: 'pool', net: 1, queue_order: 3, status: 'scheduled', team_a_id: 't1', team_b_id: 't2', version: 0 },
      { id: 'gB1', tournament_id: 'T', pool_id: 'p2', phase: 'pool', net: 2, queue_order: 1, status: 'scheduled', team_a_id: 't3', team_b_id: 't4', version: 0 },
    ],
    players: [], checkedIn: [], teamMembers: null, isAdmin: true,
    ...extra,
  });
}

describe('buildMgPoolsHTML — post-draw scored schedule (reuses the public pl-* grammar)', () => {
  let html;
  beforeEach(() => { setPoolsFixture(); html = bridge.buildMgPools({ filter: 'A' }); });

  it('renders Pool A / Pool B / Seeding tabs with the admin data-mgps-tab hook', () => {
    expect(html).toContain('data-mgps-tab="A"');
    expect(html).toContain('data-mgps-tab="B"');
    expect(html).toContain('data-mgps-tab="seeding"');
    expect(html).toContain('class="pl-tab'); // reuses the locked public tab grammar
  });

  it('reuses standings-lite (pl-srow) and the net hairline (pl-net)', () => {
    expect(html).toContain('class="pl-srow');
    expect(html).toContain('class="pl-colh"');
    expect(html).toContain('class="pl-net"');
    expect(html).toContain('>NET 1<');
  });

  it('puts a SCORE button only on unscored rows, EDIT on finals, LIVE on live', () => {
    expect(html).toContain('class="mgps-score"');
    expect(html).toContain('data-mgps-score="gA3"');
    expect(html).toContain('data-mgps-score="gA1"');
    expect(html).toContain('>EDIT<');
    expect(html).toContain('class="pl-g live"');
    expect(html).toContain('data-mgps-score="gA2"');
    expect(count(html, '>LIVE<')).toBe(1);
    expect(html).not.toContain('data-team-peek'); // no read-only public peek in admin rows
  });

  it('offers the Pool controls entry and never uses pd-card chrome', () => {
    expect(html).toContain('Pool controls');
    expect(html).toContain('data-mgps-controls');
    expect(html).not.toContain('pd-card');
  });

  it('expands the controls to per-team taps + edit nets + a type-name reset', () => {
    const open = bridge.buildMgPools({ filter: 'A', controls: true });
    expect(open).toContain('data-mgps-team="t1"');     // tap a team → the T6 team sheet
    expect(open).toContain('data-mgps-editnets="p1"'); // edit a pool's nets
    expect(open).toContain('data-mgps-reset');         // reset pools (type-name unlock)
  });
});

describe('buildMgPoolsHTML — pre-draw and drawn-not-started (two-step flow)', () => {
  it('pre-draw shows a pools-count field, a read-only format preset, and the Draw CTA', () => {
    setPoolsFixture({
      tournaments: [{ id: 'T', name: 'July 2026', status: 'setup', team_size: 4, net_count: 2, pool_count: 2, pool_target: 15, pool_cap: 20, bracket_target: 21, bracket_cap: 25, win_by_2: true }],
      tournamentPools: [], tournamentMatches: [],
    });
    const html = bridge.buildMgPools();
    expect(html).toContain('id="mgps-poolcount"');
    expect(html).toContain('data-mgps-draw');
    expect(html).toContain('Draw pools');
    expect(html).toContain('Event settings'); // preset-edit-lives-there note
    expect(html).toContain('First to 15');     // read-only preset sub reflects the row
    expect(html).not.toContain('data-mgps-tab');
  });

  it('drawn-but-not-started shows the pools + a Start pool play CTA (step two)', () => {
    setPoolsFixture({
      tournaments: [{ id: 'T', name: 'July 2026', status: 'setup', team_size: 4, net_count: 2, pool_count: 2 }],
      tournamentMatches: [],
    });
    const html = bridge.buildMgPools();
    expect(html).toContain('data-mgps-start');
    expect(html).toContain('Start pool play');
    expect(html).toContain('data-mgps-team="t1"');
    expect(html).not.toContain('data-mgps-tab');
  });
});

describe('buildMgScoreSheetHTML — the shared score sheet (T7 defines, T8 reuses)', () => {
  it('a live pool row: matchup title, meta line, two steppers, final CTA + quiet live', () => {
    setPoolsFixture();
    const html = bridge.buildScoreSheet(bridge.getState().tournamentMatches.find((m) => m.id === 'gA2'));
    expect(html).toContain('Dink Responsibly');
    expect(html).toContain('Sets &amp; Reps');
    expect(html).toContain('Pool A');
    expect(html).toContain('Net 1');
    expect(html).toContain('Pool games go to 15, win by 2, cap 20.'); // targets from the tournament fields, now the hint sentence (2026-08-25)
    expect(html).toContain('data-mgss-step="a"');
    expect(html).toContain('data-mgss-step="b"');
    expect(html).toContain('id="mgss-a"');
    expect(html).toContain('id="mgss-b"');
    expect(html).toContain('Dink Responsibly wins 12' + EN + '9'); // leader-first final label
    expect(html).toContain('data-mgss="final"');
    expect(html).toContain('>Update live score<'); // the live game's secondary (design round 2026-08-24 copy)
    expect(html).toContain('data-mgss="live"');
  });

  // Round 2026-08-03 (README §11): the pools slide-up became a centred popup on the shared dialog kit. Every
  // row does BOTH jobs — a winner radio and a pill stepper — and every existing hook survived the move.
  it('is a centred popup whose rows carry a winner radio beside the stepper (hooks kept)', () => {
    setPoolsFixture();
    const html = bridge.buildScoreSheet(bridge.getState().tournamentMatches.find((m) => m.id === 'gA2'));
    expect(html).toContain('class="mgv-schead"');       // header block of the popup card
    expect(html).toContain('class="mgv-scbox"');        // one framed box holding both rows
    expect(html).toContain('data-mgss-winner="a"');     // tap a team to mark them the winner
    expect(html).toContain('data-mgss-winner="b"');
    // The design's hint said "The score is optional." The DB disagrees: submit_match_score
    // derives the winner from the scores and rejects a tie, so a scoreless final is impossible
    // today. The copy must not promise it. (Making it true = a scoreless-final RPC.)
    expect(html).toContain('Tap a team to mark them the winner, then enter the score.');
    expect(html).not.toContain('The score is optional');
    expect(html).toContain('class="mgss-sval mgv-scval"'); // the stepper value keeps its .mgss-sval hook
    expect(html).toContain('class="mgss-sbtn mgv-scb"');   // and the ± keep .mgss-sbtn
    expect(html).toContain('Pool A · Game 2 ·');        // Rn → Gn in the context line
  });

  it('disables the final CTA on a tie (0-0 scheduled game)', () => {
    setPoolsFixture();
    const html = bridge.buildScoreSheet(bridge.getState().tournamentMatches.find((m) => m.id === 'gA3'));
    expect(html).toContain('disabled');
  });

  it('a final row opens in EDIT mode (edit write, same-winner note, no live link)', () => {
    setPoolsFixture();
    const html = bridge.buildScoreSheet(bridge.getState().tournamentMatches.find((m) => m.id === 'gA1'));
    expect(html).toContain('data-mgss="edit"');
    expect(html).toContain('Same winner');
    expect(html).not.toContain('Just update the live score');
  });

  it('is match-generic — a bracket (phase main) row renders with the bracket target', () => {
    const bm = { id: 'bm1', tournament_id: 'T', phase: 'main', round_label: 'WB R1 M1', net: 3, status: 'scheduled', team_a_id: 't1', team_b_id: 't3', version: 0 };
    setPoolsFixture({ tournamentMatches: [bm] });
    const html = bridge.buildScoreSheet(bm);
    expect(html).toContain('Dink Responsibly');
    expect(html).toContain('Net 3');
    expect(html).toContain('Bracket games go to 21'); // bracket_target from the fixture → proves phase-generic (hint sentence, 2026-08-25)
    expect(html).toContain('data-mgss="final"');
  });
});

// ── Task 8 (pick R10-C): Bracket admin — by-round rows + the reused score sheet ───────────────
// Mockups r10-manage/bk2-c (live by-round rows) + bk-c (pre-bracket seeding) + bk2-e (the editor sheet =
// T7's openMgScoreSheet, reused — NOT a second editor). buildMgBracketHTML dispatches on tournament.status:
// pre-bracket (setup/pools) → seeding list (rank + ▲/▼) + Generate; live (bracket) → rows grouped BY ROUND
// (Winners/Losers/Grand Final), each resolved row opens openMgScoreSheet; completed → final rows + a quiet
// close-out line. Unresolved (TBD) rows render muted + non-tappable.

// A 6-team double-elim mid-play: WB R1 both final, WB R2 both live, LB R1 up-next (both teams set), Grand
// Final still TBD. Group state priority (live → up-next → final → unresolved) drives the group order.
function setBracketLiveFixture(extra = {}) {
  const st = bridge.getState();
  Object.assign(st, {
    tournaments: [{ id: 'T', name: 'July 2026', status: 'bracket', registration_open: false,
      team_size: 4, net_count: 2, bracket_target: 21, bracket_cap: 25, win_by_2: true }],
    activeTournamentId: 'T',
    tournamentTeams: [
      { id: 't1', name: 'Dink Responsibly' }, { id: 't2', name: 'Sets & Reps' },
      { id: 't3', name: 'Block Party' }, { id: 't4', name: 'Net Gains' },
      { id: 't5', name: 'Ace Holes' }, { id: 't6', name: 'Dig It' },
    ],
    tournamentPools: [],
    tournamentMatches: [
      // Winners R1 — both final (winner-first "def." rows)
      { id: 'bm-w1a', tournament_id: 'T', phase: 'main', side: 'winners', round: 1, slot: 0, round_label: 'WB R1 M1', net: 1, queue_order: 0, status: 'final', team_a_id: 't1', team_b_id: 't2', winner_team_id: 't1', score_a: 21, score_b: 14, version: 1 },
      { id: 'bm-w1b', tournament_id: 'T', phase: 'main', side: 'winners', round: 1, slot: 1, round_label: 'WB R1 M2', net: 2, queue_order: 1, status: 'final', team_a_id: 't3', team_b_id: 't4', winner_team_id: 't3', score_a: 21, score_b: 18, version: 1 },
      // Losers R1 — up next (both teams set, not started) — plays earlier (q2) than WB R2 but is NOT live
      { id: 'bm-l1a', tournament_id: 'T', phase: 'main', side: 'losers', round: 1, slot: 0, round_label: 'LB R1 M1', net: 1, queue_order: 2, status: 'scheduled', team_a_id: 't2', team_b_id: 't4', version: 0 },
      // Winners R2 — both LIVE at once
      { id: 'bm-w2a', tournament_id: 'T', phase: 'main', side: 'winners', round: 2, slot: 0, round_label: 'WB R2 M1', net: 1, queue_order: 3, status: 'live', team_a_id: 't1', team_b_id: 't3', score_a: 18, score_b: 15, version: 1 },
      { id: 'bm-w2b', tournament_id: 'T', phase: 'main', side: 'winners', round: 2, slot: 1, round_label: 'WB R2 M2', net: 2, queue_order: 4, status: 'live', team_a_id: 't5', team_b_id: 't6', score_a: 7, score_b: 4, version: 1 },
      // Grand Final — still TBD (neither slot resolved)
      { id: 'bm-gf', tournament_id: 'T', phase: 'main', side: 'grand_final', round: 1, slot: 0, round_label: 'Grand Final', net: 1, queue_order: 9, status: 'scheduled', team_a_id: null, team_b_id: null, source_a: 'Winner of WB R2 M1', source_b: 'Loser of LB R2 M1', version: 0 },
    ],
    players: [], checkedIn: [], teamMembers: null, isAdmin: true,
    ...extra,
  });
}
const BEN = '–'; // EN DASH — the bracket score separator

describe('buildMgBracketHTML — live by-round rows (pick R10-C, mockup bk2-c)', () => {
  let html;
  beforeEach(() => { setBracketLiveFixture(); html = bridge.buildBracket(); });

  // Round 2026-08-03 (README §10): rounds became BOXED groups (.mgv-bkr) with a tinted header carrying the
  // group name, its game-number range and its progress — the same grouping language the pool net groups use.
  it('groups games into boxed rounds with a name, a game range and a progress word', () => {
    expect(html).toContain('class="mgv-bkr"');
    expect(html).toContain('class="mgv-bkrh"');
    expect(html).toContain('<span>Winners semifinal · G4' + BEN + 'G5</span>'); // the live pair
    expect(html).toContain('<span>Championship · G6</span>');
    expect(html).toContain('class="mgv-bkrs">live now<');
    expect(html).toContain('class="mgv-bkrs">up next<');
    expect(html).not.toContain('pd-card');
  });

  it('orders the groups active-first: live round, then up-next, then still-unresolved', () => {
    const iLive = html.indexOf('Winners semifinal');      // live → top
    const iUp = html.indexOf('Losers semifinal');         // up next (plays earlier, q2) but comes AFTER live
    const iGf = html.indexOf('Championship');             // unresolved → last
    expect(iLive).toBeGreaterThanOrEqual(0);
    expect(iLive).toBeLessThan(iUp);
    expect(iUp).toBeLessThan(iGf);
  });

  it('shows multiple live rows at once, each a two-line scoreboard with a Live pill', () => {
    expect(count(html, 'class="mgv-bkpill is-live">Live<')).toBe(2);
    expect(count(html, 'class="mgv-bkm is-live"')).toBe(2);
    expect(html).toContain('class="mgv-bks">18<');   // right-aligned tabular score column, one per line
    expect(html).toContain('class="mgv-bks">15<');
    expect(html).toContain('class="mgv-bks">7<');
    expect(html).toContain('class="mgv-bks">4<');
  });

  it('names the game number over a net chip in the left rail', () => {
    expect(html).toContain('<span class="mgv-bkid">G4</span><span class="mgv-bknet">Net 1</span>');
    expect(html).toContain('<span class="mgv-bkid">G5</span><span class="mgv-bknet">Net 2</span>');
  });

  it('shows the Up next pill on a ready-but-unscored game with a start hint, and no score', () => {
    expect(html).toContain('class="mgv-bkpill is-next">Up next<');
    expect(html).toContain('starts when Net 1 opens'); // the net sub for an up-next game
  });

  // Finished games are held back so the board shows what is live or next; Show reveals them so a wrong score
  // can still be corrected (README §10 + "State: showFinished, default false").
  it('hides the already-final games behind a closing Show row by default', () => {
    expect(html).not.toContain('data-mgbk-score="bm-w1a"'); // WB R1 is final → off the board
    expect(html).not.toContain('data-mgbk-score="bm-w1b"');
    expect(html).toContain('data-mgbk-showdone');
    expect(html).toContain('G1' + BEN + 'G2 already done');
    expect(html).toContain('class="mgv-bkdonel">Show<');
  });

  it('reveals the finished games on Show, winner-first with a green check and the final score', () => {
    const open = bridge.buildBracket({ showDone: true });
    expect(open).toContain('data-mgbk-score="bm-w1a"');
    expect(open).toContain('class="mgv-bkl is-win"');
    expect(open).toContain('class="mgv-bkw"');            // the check glyph on the winner
    expect(open).toContain('class="mgv-bks">21<');
    expect(open).toContain('class="mgv-bks">14<');
    expect(open).toContain('Tap to edit');
    expect(open).toContain('class="mgv-bkdonel">Hide<');
  });

  it('makes every resolved row (live, up-next) open the shared openMgScoreSheet', () => {
    expect(html).toContain('data-mgbk-score="bm-w2a"'); // live
    expect(html).toContain('data-mgbk-score="bm-l1a"'); // up next
    expect(bridge.buildBracket({ showDone: true })).toContain('data-mgbk-score="bm-w1a"'); // final, once shown
  });

  it('renders a placeholder game muted, score-less and non-tappable, naming its feeder', () => {
    expect(html).toContain('class="mgv-bkm is-tbd"');
    expect(html).not.toContain('data-mgbk-score="bm-gf"'); // no score hook on a placeholder row
    expect(html).toContain('Winner of G4');                // the feeder, rewritten to its game number
    expect(html).toContain('class="mgv-bkrs">needs G4<');  // and the group says what it is waiting on
  });

  it('puts the controls at the top and closes the page with Reset under a hairline', () => {
    expect(html).toContain('data-mgbk-players');
    expect(html).toContain("Full bracket tree · the players' view");
    expect(html).toContain('data-mgbk-reset');
    expect(html).toContain('class="pl-sect mgv-dsect"');   // the plain closing hairline
    expect(html.indexOf('data-mgbk-players')).toBeLessThan(html.indexOf('class="mgv-bkr"'));
    expect(html.indexOf('class="mgv-bkr"')).toBeLessThan(html.indexOf('data-mgbk-reset'));
  });
});

describe('buildMgBracketHTML — completed (mockup bk2-c, quiet close-out pointer)', () => {
  it('shows the final rows plus the quiet close-out line', () => {
    setBracketLiveFixture({
      tournaments: [{ id: 'T', name: 'July 2026', status: 'completed', registration_open: false, bracket_target: 21, bracket_cap: 25, win_by_2: true }],
      tournamentMatches: [
        { id: 'bm-w1a', tournament_id: 'T', phase: 'main', side: 'winners', round: 1, slot: 0, round_label: 'WB R1 M1', net: 1, queue_order: 0, status: 'final', team_a_id: 't1', team_b_id: 't2', winner_team_id: 't1', score_a: 21, score_b: 14, version: 1 },
        { id: 'bm-gf', tournament_id: 'T', phase: 'main', side: 'grand_final', round: 1, slot: 0, round_label: 'Grand Final', net: 1, queue_order: 9, status: 'final', team_a_id: 't1', team_b_id: 't3', winner_team_id: 't1', score_a: 21, score_b: 19, version: 1 },
      ],
    });
    const html = bridge.buildBracket();
    expect(html).toContain('Tournament completed. Close-out lives in its own page.');
    // Every game is final here, so hiding them would empty the page — the board keeps them on screen and
    // renders no Show row at all (round 2026-08-03).
    expect(html).toContain('data-mgbk-score="bm-w1a"');
    expect(html).toContain('class="mgv-bkl is-win"'); // the final rows still render, winner in green
    expect(html).not.toContain('data-mgbk-showdone');
    expect(html).toContain('data-mgbk-reset');        // reset still available
    expect(html).toContain('<span>Championship · G2</span>');
  });
});

// A pre-bracket state: pools drawn + scored, no bracket yet — the seeding list (bk-c) + Generate.
function setBracketSeedingFixture(extra = {}) {
  const st = bridge.getState();
  Object.assign(st, {
    tournaments: [{ id: 'T', name: 'July 2026', status: 'pools', registration_open: false,
      team_size: 4, net_count: 2, pool_count: 1, pool_target: 15, pool_cap: 20, bracket_target: 21, bracket_cap: 25, win_by_2: true }],
    activeTournamentId: 'T',
    tournamentTeams: [
      { id: 't1', name: 'Dink Responsibly', pool_id: 'p1' }, { id: 't2', name: 'Block Party', pool_id: 'p1' },
      { id: 't3', name: 'Net Gains', pool_id: 'p1' }, { id: 't4', name: 'Dig It', pool_id: 'p1' },
    ],
    tournamentPools: [{ id: 'p1', label: 'A', display_order: 0 }],
    tournamentMatches: [
      { id: 'gA1', tournament_id: 'T', pool_id: 'p1', phase: 'pool', net: 1, queue_order: 1, status: 'final', team_a_id: 't1', team_b_id: 't2', winner_team_id: 't1', score_a: 15, score_b: 8, version: 1 },
      { id: 'gA2', tournament_id: 'T', pool_id: 'p1', phase: 'pool', net: 1, queue_order: 2, status: 'final', team_a_id: 't3', team_b_id: 't4', winner_team_id: 't3', score_a: 15, score_b: 11, version: 1 },
      { id: 'gA3', tournament_id: 'T', pool_id: 'p1', phase: 'pool', net: 1, queue_order: 3, status: 'final', team_a_id: 't1', team_b_id: 't3', winner_team_id: 't1', score_a: 15, score_b: 13, version: 1 },
    ],
    players: [], checkedIn: [], teamMembers: null, isAdmin: true,
    ...extra,
  });
}

describe('buildMgBracketHTML — pre-bracket seeding (pick R10-C, mockup bk-c)', () => {
  it('renders the seeding list with rank + ▲/▼ reorder hooks and the Generate CTA', () => {
    setBracketSeedingFixture();
    const html = bridge.buildBracket();
    expect(html).toContain('Seeding · from pool results');
    expect(html).toContain('class="mgbk-seed"');
    expect(html).toContain('data-mgbk-seedup="t1"');
    expect(html).toContain('data-mgbk-seeddown="t1"');
    expect(html).toContain('data-mgbk-generate');
    expect(html).toContain('Generate the bracket');
    expect(html).not.toContain('pd-card');
  });

  it('enables Generate only when every pool game is final', () => {
    setBracketSeedingFixture();
    expect(bridge.buildBracket()).toContain('data-mgbk-generate>'); // all final → enabled
    // one pool game still open → Generate is locked + the provisional note shows
    setBracketSeedingFixture({
      tournamentMatches: [
        { id: 'gA1', tournament_id: 'T', pool_id: 'p1', phase: 'pool', net: 1, queue_order: 1, status: 'final', team_a_id: 't1', team_b_id: 't2', winner_team_id: 't1', score_a: 15, score_b: 8, version: 1 },
        { id: 'gA2', tournament_id: 'T', pool_id: 'p1', phase: 'pool', net: 1, queue_order: 2, status: 'live', team_a_id: 't3', team_b_id: 't4', score_a: 9, score_b: 7, version: 1 },
      ],
    });
    const open = bridge.buildBracket();
    expect(open).toContain('data-mgbk-generate disabled');
    expect(open).toContain('provisional');
  });

  it('applies the admin ▲/▼ seed override when it is a valid permutation of the current teams', () => {
    setBracketSeedingFixture();
    const computed = bridge.buildBracket();
    // by win% then diff, t1 (2-0) seeds first
    expect(computed.indexOf('Dink Responsibly')).toBeLessThan(computed.indexOf('Dig It'));
    // now force an override that puts Dig It (t4) first
    const custom = bridge.buildBracket({ seedOverride: { id: 'T', order: ['t4', 't3', 't1', 't2'] } });
    const firstSeedNamePos = custom.indexOf('Dig It');
    expect(firstSeedNamePos).toBeGreaterThanOrEqual(0);
    expect(custom.indexOf('Dig It')).toBeLessThan(custom.indexOf('Dink Responsibly'));
    expect(custom).toContain('data-mgbk-seedreset'); // a custom order offers a reset-to-computed
  });

  it('is honest when pools have not been drawn yet (points to Pools & schedule)', () => {
    setBracketSeedingFixture({
      tournaments: [{ id: 'T', name: 'July 2026', status: 'setup', registration_open: true, team_size: 4 }],
      tournamentPools: [], tournamentMatches: [],
    });
    const html = bridge.buildBracket();
    expect(html).toContain('Draw pools and play them out first');
    expect(html).not.toContain('data-mgbk-generate');
  });
});

// ── Task 9: Event settings (pick R11, mockup es-b) + Rules sheet (pick R11b, mockup ru-d) ─────────────
// A tournament carrying every scoring knob (real tournaments.* columns per the recon map §4).
const fullKnobT = {
  id: 'T', name: 'July 2026 tournament', status: 'setup', registration_open: true,
  team_size: 4, net_count: 3, pool_target: 15, pool_cap: 20, bracket_target: 21, bracket_cap: 25,
  match_cap: 21, win_by_2: true, grand_final_reset: true, buy_in: '$80 a team',
};

describe('buildMgSettingsHTML — all-knobs-flat event settings (pick R11, mockup es-b)', () => {
  it('renders the Event settings header with a back-to-hub button', () => {
    setTournamentState(fullKnobT);
    const html = bridge.buildSettings();
    expect(html).toContain('class="pd-htitle">Event settings<');
    expect(html).toContain('data-mgt-back'); // back returns to the sub-hub, not the Manage lead
    expect(html).not.toContain('pd-card');
  });

  it('renders every knob flat + editable, prefilled from the real columns', () => {
    setTournamentState(fullKnobT);
    const html = bridge.buildSettings();
    // full-width text fields
    expect(html).toContain('id="mges-name"');
    expect(html).toContain('value="July 2026 tournament"');
    expect(html).toContain('id="mges-buyin"');
    expect(html).toContain('value="$80 a team"');
    // two-across numeric pairs — real column values
    expect(html).toContain('id="mges-teamsize"');
    expect(html).toContain('id="mges-nets"');
    expect(html).toContain('id="mges-pooltarget"');
    expect(html).toContain('id="mges-poolcap"');
    expect(html).toContain('id="mges-brackettarget"');
    expect(html).toContain('id="mges-bracketcap"');
    expect(html).toContain('value="15"'); // pool target
    expect(html).toContain('value="20"'); // pool cap
    expect(html).toContain('value="21"'); // bracket target
    expect(html).toContain('value="25"'); // bracket cap
    // 2026-08-25 (Manage handoff, Task 6): the flat wall became named groups on cards. This fixture carries
    // no venue columns, so the guarded "Where" group is absent and three cards ship.
    expect(count(html, 'class="set-card"')).toBe(3);
    expect(html).not.toContain('>Where<');
    expect(html).not.toContain('mges-half');
  });

  it('gives every numeric input the iOS numeric keyboard + 16px guard', () => {
    setTournamentState(fullKnobT);
    const html = bridge.buildSettings();
    // one inputmode="numeric" per numeric field (6: team size, nets, pool to/cap, bracket to/cap)
    expect(count(html, 'inputmode="numeric"')).toBe(6);
    // 2026-08-25 (Task 6): the fields moved off .pk-fv onto the card kit's own .set-in. The 16px iOS zoom
    // guard travelled with them — it is asserted against styles.css in manage-round.test.js, which reads it.
    expect(count(html, 'class="set-in set-num"')).toBe(6);
    expect(html).not.toContain('class="pk-fv"');
  });

  it('renders win-by-2 and grand-final-reset as mg-sw switches (not text), reflecting the booleans', () => {
    setTournamentState(fullKnobT);
    const html = bridge.buildSettings();
    expect(html).toContain('data-mges-toggle="win_by_2"');
    expect(html).toContain('data-mges-toggle="grand_final_reset"');
    // both true → both switches on
    expect(count(html, 'class="mg-sw on"')).toBe(2);
    expect(count(html, 'aria-checked="true"')).toBe(2);
    // both off → neither switch on
    const off = (setTournamentState({ ...fullKnobT, win_by_2: false, grand_final_reset: false }), bridge.buildSettings());
    expect(off).not.toContain('class="mg-sw on"');
    expect(count(off, 'aria-checked="false"')).toBe(2);
  });

  it('dispatches through manageContainerHTML (real view, no placeholder)', () => {
    setTournamentState(fullKnobT);
    const view = bridge.mgtContainer('settings');
    expect(view).not.toContain('Coming in the next slices.');
    expect(view).toContain('data-mgt-back');
    expect(view).toContain('id="mges-name"');
  });
});

describe('buildMgRulesHTML — one-sheet rules editor (pick R11b, mockup ru-d)', () => {
  it('renders rules as the public formatted page (rulesToHTML) with a tap-to-edit affordance, not a textarea', () => {
    setTournamentState({ ...fullKnobT, rules: '## Format\n- 4s co-ed — 1 guy + 1 girl' });
    const html = bridge.buildRules();
    expect(html).toContain('class="pd-htitle">Rules sheet<');
    // §38 pick C (2026-07-12): view = the public render (rl-body), no inline textarea/Save CTA.
    expect(html).not.toContain('id="mgru-ta"');
    expect(html).not.toContain('data-mgru-save');
    // 2026-08-25 (Manage handoff, Task 7): the flat sheet became a card per section. Same formatter, same
    // ONE editor — each card's Edit pill opens it at that section's offset, and the header opens it at the top.
    expect(html).toContain('class="rl-body mgru-view"'); // the sheet wrapper, still the public formatter's
    expect(html).toContain('class="rlv-card"');      // one card per section
    expect(html).toContain('rl-h');                  // "## Format" → a heading, now in the card's header row
    expect(html).toContain('4s co-ed — 1 guy + 1 girl');
    expect(html).toContain('data-mgru-edit');        // header "Edit all" → the editor at the top
    expect(html).toContain('class="pd-hdr-edit rlv-hedit" data-mgru-edit>');
    expect(html).toContain('Edit all');
    expect(html).toContain('data-rlv-edit="0"');     // the section's own pill, carrying its caret offset
    expect(html).toContain('data-mgt-back');
    expect(html).not.toContain('pd-card');
  });

  it('shows an honest empty state (never "undefined") when rules is unset, still tappable to edit', () => {
    setTournamentState({ ...fullKnobT, rules: null });
    const html = bridge.buildRules();
    expect(html).not.toContain('id="mgru-ta"');
    expect(html).not.toContain('undefined');
    expect(html).toContain('mgru-empty');           // honest admin prompt, not the public "coming soon" stub
    expect(html).toContain('No rules yet');
    expect(html).toContain('data-mgru-edit');        // the empty prompt opens the editor too
  });

  it('escapes rules content (never injects markup) in the textarea + dirty-guard attribute', () => {
    setTournamentState({ ...fullKnobT, rules: '## Heads up <script>alert(1)</script> & be cool' });
    const html = bridge.buildRules();
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('dispatches through manageContainerHTML (real view, no placeholder)', () => {
    setTournamentState({ ...fullKnobT, rules: '## Format' });
    const view = bridge.mgtContainer('rules');
    expect(view).not.toContain('Coming in the next slices.');
    expect(view).toContain('mgru-view');       // the real rendered view, not a placeholder
    expect(view).toContain('data-mgru-edit');
    expect(view).toContain('data-mgt-back');
  });
});

// ── Task 10: Close out — champion + end/reopen (pick R12, THE June fix, mockup co-a) ──────────────
describe('buildMgCloseoutHTML — deliberate close-out (pick R12)', () => {
  // A bracket-stage tournament whose grand final is decided → computeChampion suggests t1 (Sets & Reps).
  const bracketT = { id: 'T', name: 'July 2026', status: 'bracket', registration_open: false };
  const GF = [{ id: 'm', phase: 'main', side: 'grand_final', round: 1, status: 'final',
    team_a_id: 't1', team_b_id: 't2', winner_team_id: 't1' }];

  it('active (bracket): CHAMPION section + matte-gold card with the bracket suggestion + End CTA + honest note', () => {
    setTournamentState(bracketT, { tournamentMatches: GF });
    const html = bridge.buildCloseout();
    expect(html).toContain('class="pl-sect">Champion<');
    expect(html).toContain('class="mgco-card"');
    expect(html).toContain('FROM THE BRACKET');
    expect(html).toContain('Sets &amp; Reps');            // computeChampion suggestion (t1), escaped
    expect(html).toContain('data-mgco-change');           // CHANGE opens the picker
    expect(html).toContain('data-mgco-end');              // End the tournament CTA
    expect(html).toContain('>End the tournament<');
    expect(html).toContain('Moves it to Past tournaments'); // honest note
    expect(html).toContain('you can reopen from there');
    expect(html).not.toContain('pd-card');                // flat on stone
    expect(html).not.toContain('data-mgco-reopen');       // active state has no reopen
  });

  it('active with no decided champion (pools): eyebrow PICK THE CHAMPION, still change + end', () => {
    setTournamentState({ id: 'T', name: 'July 2026', status: 'pools', registration_open: false }, { tournamentMatches: [] });
    const html = bridge.buildCloseout();
    expect(html).toContain('PICK THE CHAMPION');
    expect(html).not.toContain('FROM THE BRACKET');
    expect(html).toContain('data-mgco-change');
    expect(html).toContain('data-mgco-end');
  });

  it('honors a manual CHANGE override (module var mgCloseoutChampId)', () => {
    setTournamentState(bracketT, { tournamentMatches: GF });
    const html = bridge.buildCloseout({ champId: 't2' }); // admin overrode the bracket suggestion
    expect(html).toContain('Dig It');       // t2
    expect(html).toContain('YOUR PICK');
    expect(html).not.toContain('Sets &amp; Reps'); // the bracket suggestion is no longer shown
    expect(html).toContain('data-mgco-end');
  });

  it('honors an explicit "no champion" override and still lets you end', () => {
    setTournamentState(bracketT, { tournamentMatches: GF });
    const html = bridge.buildCloseout({ champId: '' });
    expect(html).toContain('No champion recorded');
    expect(html).toContain('data-mgco-end');       // ending with no champion is allowed
    expect(html).toContain('data-mgco-change');     // can still pick one
  });

  it('completed: recorded champion card + Reopen row + Past-tournaments line, no End CTA', () => {
    // manageLeadTournament must resolve a completed tournament so reopen is reachable.
    setTournamentState({ id: 'T', name: 'July 2026', status: 'completed', registration_open: false, champion_team_id: 't3' });
    const html = bridge.buildCloseout();
    expect(html).toContain('Paid Squad');        // the STORED champion (t3), resolved by name
    expect(html).toContain('data-mgco-reopen');  // the reopen affordance
    expect(html).toContain('>Reopen the tournament<');
    expect(html).toContain('Past tournaments');
    expect(html).not.toContain('data-mgco-end'); // a completed tournament is not "ended" again
    expect(html).not.toContain('data-mgco-change');
  });

  // Rewritten 2026-07-26 (C80). This used to assert a dead end: "No champion recorded" and nothing but a
  // Reopen button. Scoring the grand final auto-completes the tournament without writing a champion
  // (0005_c21_rpc_submit_match_score.sql:65), so that state is reachable by simply FINISHING the event —
  // the screen now has to offer a way out of it, not just describe it.
  it('completed with no champion recorded: offers the crown, still reopenable', () => {
    setTournamentState(
      { id: 'T', name: 'July 2026', status: 'completed', registration_open: false, champion_team_id: null },
      { tournamentMatches: [] }, // explicit: no bracket to derive from
    );
    const html = bridge.buildCloseout();
    expect(html).toContain('NO CHAMPION RECORDED');
    expect(html).toContain('data-mgco-record');   // the way out
    expect(html).toContain('data-mgco-reopen');
  });

  // 2026-08-04: setup is no longer an empty dead end. It still crowns nobody and still offers none of the
  // played close-out controls, but it now carries the one thing that WAS missing — ending an event that never
  // played, instead of forcing Delete (which destroys the teams and their paid flags). Full coverage of that
  // action lives in test/tournament-end-unplayed.test.js; this keeps pinning what setup must NOT offer.
  it('setup: no champion, none of the played close-out controls, but a way to end it', () => {
    setTournamentState({ id: 'T', name: 'July 2026', status: 'setup', registration_open: true });
    const html = bridge.buildCloseout();
    expect(html).toContain('No games were played, so there is no champion to crown.');
    expect(html).toContain('data-mgco-endunplayed');
    expect(html).not.toContain('data-mgco-end>');   // the RPC close-out CTA (close_tournament refuses setup)
    expect(html).not.toContain('data-mgco-reopen');
    expect(html).not.toContain('data-mgco-change');
    expect(html).not.toContain('data-mgco-record');
  });

  it('escapes a team name with markup in the champion card', () => {
    setTournamentState({ id: 'T', name: 'July 2026', status: 'completed', champion_team_id: 'evil' },
      { tournamentTeams: [{ id: 'evil', name: '<img src=x onerror=alert(1)>', paid: true }] });
    const html = bridge.buildCloseout();
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img');
  });

  it('dispatches through manageContainerHTML (real view, own back button, no placeholder)', () => {
    setTournamentState(bracketT, { tournamentMatches: GF });
    const view = bridge.closeoutContainer();
    expect(view).not.toContain('Coming in the next slices.');
    expect(view).toContain('data-mgt-back');
    expect(view).toContain('data-mgco-end');
  });
});

describe('buildMgChampionPickerHTML — the CHANGE picker sheet (body-level)', () => {
  const teams = [
    { id: 't1', name: 'Sets & Reps', paid: false },
    { id: 't2', name: 'Dig It', paid: false },
    { id: 't3', name: 'Paid Squad', paid: true },
  ];
  it('lists every team as a pickable row plus a "no champion" option, marking the current pick', () => {
    const html = bridge.buildChampPicker(teams, 't2');
    expect(count(html, 'data-mgco-pick=')).toBe(4); // 3 teams + the no-champion option
    expect(html).toContain('data-mgco-pick="t1"');
    expect(html).toContain('data-mgco-pick="t3"');
    expect(html).toContain('data-mgco-pick=""'); // the "No champion" option
    expect(html).toContain('Sets &amp; Reps');
    expect(html).toContain('No champion');
    expect(html).toContain('mgco-pick-on'); // the selected row is marked
  });
  it('escapes team names in the picker', () => {
    const html = bridge.buildChampPicker([{ id: 'x', name: '<b>x</b>', paid: false }], null);
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('&lt;b&gt;');
  });
});

// ── Task 11: Admins — seats + activity log (session-10 pick R6, mockups m-c + m-b) ────────────────────
// buildMgAdminsHTML() dispatches on the module var mgAdminsView: 'seats' (four seat rows from
// list_admin_seats — OWNER filled pill / ADMIN outline / OFF waiting) + an Activity log row → 'log'
// (day-grouped rows from read_action_log, time · "<b>actor</b> summary"). Owner-gating keys on
// state.masterAdminAuthenticated (the owner-role server session): only the owner can assign a waiting
// seat or remove a filled non-owner seat. Flat on stone, no pd-card, labeled pills never dots, NO undo.
function setAdminsState(extra = {}) {
  const st = bridge.getState();
  Object.assign(st, { isAdmin: true, masterAdminAuthenticated: true, currentSession: null, ...extra });
}
const OWNER_SEAT = { display_name: 'Mikey Olas', email: 'olasmikey@gmail.com', role: 'owner' };
const ORG_SEAT = { display_name: 'Kc Vaughn', email: 'kc@example.com', role: 'organizer' };

describe('buildMgAdminsHTML — the 4-seat roster (pick R6, mockup m-c)', () => {
  it('dispatches through manageContainerHTML (real view, own back button, no placeholder)', () => {
    setAdminsState();
    const html = bridge.buildAdmins({ seats: [OWNER_SEAT] });
    expect(html).not.toContain('Coming in the next slices.');
    expect(html).toContain('class="pd-htitle">Admins<');
    expect(html).toContain('data-mg-area="lead"'); // back to the Manage lead
    expect(html).not.toContain('pd-card');
  });

  it('renders the owner with a filled OWNER pill + name and email, never editable', () => {
    setAdminsState();
    const html = bridge.buildAdmins({ seats: [OWNER_SEAT] });
    expect(html).toContain('Mikey Olas');
    expect(html).toContain('olasmikey@gmail.com');
    expect(html).toContain('class="mgad-pill ow">OWNER<');
    // the owner row is never a remove target
    expect(html).not.toContain('data-mgad-remove="olasmikey@gmail.com"');
  });

  it('fills exactly four seats: owner + organizer + two waiting (OFF) seats', () => {
    setAdminsState();
    const html = bridge.buildAdmins({ seats: [OWNER_SEAT, ORG_SEAT] });
    expect(count(html, 'class="mgad-pill ow"')).toBe(1);   // one owner
    expect(count(html, 'class="mgad-pill ad"')).toBe(1);   // one organizer → ADMIN outline pill
    expect(count(html, 'class="mgad-pill off"')).toBe(2);  // two empty seats → OFF pill
    expect(html).toContain('Kc Vaughn');
    expect(html).toContain('>Seat 3<');
    expect(html).toContain('>Seat 4<');
    // the FIRST empty seat carries the explainer; the rest just say "Waiting"
    expect(html).toContain('Waiting. They create an account, you flip it on');
    expect(html).not.toMatch(/•/); // labeled pills, never bare dots
  });

  it('OWNER can assign a waiting seat (data-mgad-seat) and remove a filled non-owner (data-mgad-remove)', () => {
    setAdminsState({ masterAdminAuthenticated: true });
    const html = bridge.buildAdmins({ seats: [OWNER_SEAT, ORG_SEAT] });
    expect(html).toContain('data-mgad-seat');                       // waiting seats are tappable
    expect(html).toContain('data-mgad-remove="kc@example.com"');    // the organizer seat is removable
  });

  it('a NON-owner admin (organizer) sees the roster read-only — no assign, no remove', () => {
    setAdminsState({ masterAdminAuthenticated: false });
    const html = bridge.buildAdmins({ seats: [OWNER_SEAT, ORG_SEAT] });
    expect(html).not.toContain('data-mgad-seat');
    expect(html).not.toContain('data-mgad-remove');
    expect(html).toContain('Only the owner can add or remove admins.');
    // still shows the pills / roster
    expect(html).toContain('class="mgad-pill ow"');
    expect(html).toContain('class="mgad-pill ad"');
  });

  it('the Activity log row is present and carries NO undo this slice', () => {
    setAdminsState();
    const html = bridge.buildAdmins({ seats: [OWNER_SEAT] });
    expect(html).toContain('data-mgad-log');
    expect(html).toContain('>Activity log<');
    expect(html.toLowerCase()).not.toContain('undo');
  });

  it('opening a waiting seat reveals the rf-grammar email field + Make them an admin (owner)', () => {
    setAdminsState();
    const html = bridge.buildAdmins({ seats: [OWNER_SEAT], assign: true });
    expect(html).toContain('id="mgad-email"');
    expect(html).toContain('data-mgad-make');
    expect(html).toContain('Make them an admin');
  });

  it('shows an honest loading line before the seats RPC returns, no fake seats', () => {
    setAdminsState();
    const html = bridge.buildAdmins({ seats: null, seatsLoading: true });
    expect(html).toContain('Loading the admin seats');
    expect(html).not.toContain('class="mgad-pill');
  });

  it('surfaces a friendly load error (incl. the pre-0051 "still updating" notice)', () => {
    setAdminsState();
    const html = bridge.buildAdmins({ seats: null, seatsError: 'Admins tools aren’t available yet — the server is still updating. Try again in a minute.' });
    expect(html).toContain('the server is still updating');
    expect(html).not.toContain('class="mgad-pill');
  });

  it('escapes a hostile display name / email in a seat row', () => {
    setAdminsState();
    const html = bridge.buildAdmins({ seats: [OWNER_SEAT, { display_name: '<img src=x onerror=alert(1)>', email: 'x@y.z', role: 'organizer' }] });
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img');
  });
});

describe('buildMgLogHTML — the day-grouped activity log (pick R6, mockup m-b)', () => {
  // Build timestamps relative to "now" so the day labels are deterministic (Today / Yesterday).
  const iso = (dayOffset, h, m) => {
    const d = new Date(); d.setDate(d.getDate() - dayOffset); d.setHours(h, m, 0, 0);
    return d.toISOString();
  };

  it('renders day headers with time + "<b>actor</b> summary" rows, newest group first', () => {
    setAdminsState();
    const log = [
      { at: iso(0, 21, 12), actor: 'Mikey', summary: 'closed registration' },
      { at: iso(0, 20, 44), actor: 'Mikey', summary: 'marked Dig It paid' },
      { at: iso(1, 19, 2), actor: 'Kc', summary: 'generated teams · 4s' },
    ];
    const html = bridge.buildAdmins({ view: 'log', log });
    expect(html).toContain('class="pd-htitle">Activity log<');
    expect(html).toContain('data-mgad-seats'); // back to the seats view
    expect(html).toContain('class="mgad-day">Today<');
    expect(html).toContain('class="mgad-day">Yesterday<');
    expect(html).toContain('<b>Mikey</b> closed registration');
    expect(html).toContain('<b>Kc</b> generated teams · 4s');
    expect(html).toContain('class="mgad-lt"'); // the faint Barlow time column
    // Today's group renders before Yesterday's
    expect(html.indexOf('>Today<')).toBeLessThan(html.indexOf('>Yesterday<'));
  });

  it('shows the honest empty state when nothing is logged', () => {
    setAdminsState();
    const html = bridge.buildAdmins({ view: 'log', log: [] });
    expect(html).toContain('Nothing logged yet.');
    expect(html).not.toContain('class="mgad-lg"');
  });

  it('shows a loading line before the log RPC returns', () => {
    setAdminsState();
    const html = bridge.buildAdmins({ view: 'log', log: null, logLoading: true });
    expect(html).toContain('Loading the activity log');
  });

  it('escapes actor + summary content (never injects markup)', () => {
    setAdminsState();
    const log = [{ at: iso(0, 12, 0), actor: '<b>x</b>', summary: '<script>alert(1)</script>' }];
    const html = bridge.buildAdmins({ view: 'log', log });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<b>x</b>');
  });

  it('coalesces a missing actor to a plain fallback rather than empty bold', () => {
    setAdminsState();
    const html = bridge.buildAdmins({ view: 'log', log: [{ at: iso(0, 9, 5), actor: null, summary: 'did a thing' }] });
    expect(html).toContain('did a thing');
    expect(html).toContain('<b>Someone</b>');
  });
});

// ── Task 12 (session-10 §6): Co-pilot floating bubble + chat-on-stone ──────────
// Mike's design: a small admin-only bubble above the bottom nav → tap opens a full-screen
// chat on the stone bg + watermark (no card/panel chrome), reusing the shipped copilot flow.
describe('copilotShellHTML — admin-only co-pilot bubble + chat-on-stone', () => {
  it('renders the round fab and the full-screen chat for an admin', () => {
    const st = bridge.getState();
    st.isAdmin = true; st.copilotMessages = [];
    const html = bridge.copilotShell();
    expect(html).toContain('class="cop-fab"');   // the round floating bubble
    expect(html).toContain('data-cop-open');       // tap opens the chat
    expect(html).toContain('id="cop-chat"');       // the on-stone chat view
    expect(html).toContain('data-cop-close');      // back chevron closes it
    expect(html).toContain('>Co-pilot<');          // quiet header title, nothing else
  });

  it('reuses the shipped copilot flow ids so the bound handlers work unchanged', () => {
    const st = bridge.getState(); st.isAdmin = true; st.copilotMessages = [];
    const html = bridge.copilotShell();
    expect(html).toContain('id="copilot-thread"');
    expect(html).toContain('id="copilot-input"');
    expect(html).toContain('data-role="copilot-send"');
  });

  it('renders nothing for a non-admin (no bubble leaks onto the public shell)', () => {
    const st = bridge.getState(); st.isAdmin = false;
    expect(bridge.copilotShell()).toBe('');
  });

  it('shows the greeting when the thread is empty and never says "tonight"', () => {
    const st = bridge.getState(); st.isAdmin = true; st.copilotMessages = [];
    const html = bridge.copilotShell();
    expect(html).toContain('cop-greet');
    expect(html.toLowerCase()).not.toContain('tonight');
  });

  it('rebuilds prior messages from state (poll/rebuild-safe) instead of the greeting', () => {
    const st = bridge.getState(); st.isAdmin = true;
    st.copilotMessages = [{ id: 'cm1', role: 'user', text: 'how many here?' }];
    const html = bridge.copilotShell();
    expect(html).toContain('how many here?');
    expect(html).not.toContain('cop-greet');
  });

  it('draws a 4-point sparkle path (no emoji) and stays card-free on stone', () => {
    const st = bridge.getState(); st.isAdmin = true; st.copilotMessages = [];
    const html = bridge.copilotShell();
    expect(html).toContain('M12 3l1.8 4.2');   // the sparkle SVG path, not an emoji glyph
    expect(html).not.toContain('pd-card');
  });
});
