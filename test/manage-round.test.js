// Manage handoff round (2026-08-25), Task 1: the foundations every later task in the round assumes.
// Guards five things at once, because they are app-wide and cheap to regress:
//   1. the Manage bracket vocabulary ("Championship", "Winners/Losers semifinal", "already done"),
//   2. the pools meta saying "games done" rather than "games final",
//   3. C81, the check-in QR deriving from location.origin instead of the dead vercel.app host,
//   4. the scoreless bracket-final guard on the shared score card,
//   5. the ported CSS: the 08-05b field style, the 08-23 button restyle, @keyframes m-menu, and the
//      dropped .popup-edit-input !important.
// Harness copied from manage-page.test.js (app.js is a browser classic script, so it runs in a Node vm
// with browser stubs; pure.js loads first into the same context). ONE deliberate difference: the
// buildScoreSheet bridge forwards the optional winner argument, because openMgScoreSheet seeds the pick
// from winner_team_id on a finished game and the scoreless guard is only reachable with a pick in hand.
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
      needsYou: (ctx) => manageNeedsYouModel(ctx),
      phaseIndex: (t, today) => manageHubPhaseIndex(t, today),
      hubSteps: () => MANAGE_HUB_STEPS.slice(),
      // Task 2 (the hub): mgSeats loads lazily via the 0051 RPC, so the tests inject it directly, and the
      // two hub module vars are set the way a tap would set them (they survive the container swap).
      setSeats: (v) => { mgSeats = v; },
      setHub: (o) => { o = o || {}; mgHubPickerOpen = !!o.pickerOpen; mgHubDoneText = o.doneText || ''; },
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
      buildScoreSheet: (m, w) => buildMgScoreSheetHTML(m, w),
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

const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const appSrc = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const indexSrc = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// An 8-team double elimination main bracket, mid-play, seeded the way the bracket tests in
// manage-page.test.js seed theirs (phase 'main' rows carrying side / round / round_label).
// Winners runs to round 3 and losers to round 2, so BOTH branches of mgBracketSideName are on screen at
// once: a plain "bracket" group and a "semifinal" group on each side, plus the Championship.
// Winners R1 is finished, so the closing "already done" row renders too.
function setMainBracketFixture(extra = {}) {
  const st = bridge.getState();
  Object.assign(st, {
    tournaments: [{ id: 'T', name: 'August 2026', status: 'bracket', registration_open: false,
      team_size: 4, net_count: 2, bracket_target: 21, bracket_cap: 25, win_by_2: true }],
    activeTournamentId: 'T',
    tournamentTeams: [
      { id: 't1', name: 'Dink Responsibly' }, { id: 't2', name: 'Sets and Reps' },
      { id: 't3', name: 'Block Party' }, { id: 't4', name: 'Net Gains' },
      { id: 't5', name: 'Ace Holes' }, { id: 't6', name: 'Dig It' },
      { id: 't7', name: 'Kitchen Sync' }, { id: 't8', name: 'Paddle Boat' },
    ],
    tournamentPools: [],
    tournamentMatches: [
      // Winners R1, all four finished (held back behind the closing row by default)
      { id: 'w1a', tournament_id: 'T', phase: 'main', side: 'winners', round: 1, slot: 0, round_label: 'WB R1 M1', net: 1, queue_order: 0, status: 'final', team_a_id: 't1', team_b_id: 't2', winner_team_id: 't1', score_a: 21, score_b: 14, version: 1 },
      { id: 'w1b', tournament_id: 'T', phase: 'main', side: 'winners', round: 1, slot: 1, round_label: 'WB R1 M2', net: 2, queue_order: 1, status: 'final', team_a_id: 't3', team_b_id: 't4', winner_team_id: 't3', score_a: 21, score_b: 18, version: 1 },
      { id: 'w1c', tournament_id: 'T', phase: 'main', side: 'winners', round: 1, slot: 2, round_label: 'WB R1 M3', net: 1, queue_order: 2, status: 'final', team_a_id: 't5', team_b_id: 't6', winner_team_id: 't5', score_a: 21, score_b: 9, version: 1 },
      { id: 'w1d', tournament_id: 'T', phase: 'main', side: 'winners', round: 1, slot: 3, round_label: 'WB R1 M4', net: 2, queue_order: 3, status: 'final', team_a_id: 't7', team_b_id: 't8', winner_team_id: 't7', score_a: 21, score_b: 12, version: 1 },
      // Losers R1, both ready to play (round 1 of 2, so it stays a plain "bracket" group)
      { id: 'l1a', tournament_id: 'T', phase: 'main', side: 'losers', round: 1, slot: 0, round_label: 'LB R1 M1', net: 1, queue_order: 4, status: 'scheduled', team_a_id: 't2', team_b_id: 't4', version: 0 },
      { id: 'l1b', tournament_id: 'T', phase: 'main', side: 'losers', round: 1, slot: 1, round_label: 'LB R1 M2', net: 2, queue_order: 5, status: 'scheduled', team_a_id: 't6', team_b_id: 't8', version: 0 },
      // Winners R2, both live (round 2 of 3, still a plain "bracket" group)
      { id: 'w2a', tournament_id: 'T', phase: 'main', side: 'winners', round: 2, slot: 0, round_label: 'WB R2 M1', net: 1, queue_order: 6, status: 'live', team_a_id: 't1', team_b_id: 't3', score_a: 18, score_b: 15, version: 1 },
      { id: 'w2b', tournament_id: 'T', phase: 'main', side: 'winners', round: 2, slot: 1, round_label: 'WB R2 M2', net: 2, queue_order: 7, status: 'live', team_a_id: 't5', team_b_id: 't7', score_a: 7, score_b: 4, version: 1 },
      // Losers R2, the last losers round, still waiting on its feeders
      { id: 'l2a', tournament_id: 'T', phase: 'main', side: 'losers', round: 2, slot: 0, round_label: 'LB R2 M1', net: 1, queue_order: 8, status: 'scheduled', team_a_id: null, team_b_id: null, source_a: 'Winner of LB R1 M1', source_b: 'Winner of LB R1 M2', version: 0 },
      // Winners R3, the last winners round
      { id: 'w3a', tournament_id: 'T', phase: 'main', side: 'winners', round: 3, slot: 0, round_label: 'WB R3 M1', net: 1, queue_order: 9, status: 'scheduled', team_a_id: null, team_b_id: null, source_a: 'Winner of WB R2 M1', source_b: 'Winner of WB R2 M2', version: 0 },
      // The championship
      { id: 'gf', tournament_id: 'T', phase: 'main', side: 'grand_final', round: 1, slot: 0, round_label: 'Grand Final', net: 1, queue_order: 10, status: 'scheduled', team_a_id: null, team_b_id: null, source_a: 'Winner of WB R3 M1', source_b: 'Winner of LB R2 M1', version: 0 },
    ],
    players: [], checkedIn: [], teamMembers: null, isAdmin: true,
    ...extra,
  });
}

// Pool play with one game finished out of four, so the meta line has a count to print.
function setPoolsFixture(extra = {}) {
  const st = bridge.getState();
  Object.assign(st, {
    tournaments: [{
      id: 'T', name: 'August 2026', status: 'pools', registration_open: false,
      team_size: 4, net_count: 2, pool_count: 2,
      pool_target: 15, pool_cap: 20, bracket_target: 21, bracket_cap: 25, win_by_2: true,
    }],
    activeTournamentId: 'T',
    tournamentTeams: [
      { id: 't1', name: 'Dink Responsibly', pool_id: 'p1', paid: true },
      { id: 't2', name: 'Sets and Reps', pool_id: 'p1', paid: true },
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

describe('Task 1 foundations', () => {
  it('Manage bracket vocabulary: Championship and semifinals, never final', () => {
    setMainBracketFixture();
    const html = bridge.buildBracket();
    expect(html).toContain('Championship · G');
    expect(html).toMatch(/Winners semifinal · G\d+/);
    expect(html).toMatch(/Losers semifinal · G\d+/);
    expect(html).not.toContain('Grand final');
    expect(html).not.toContain('bracket final');
    expect(html).not.toContain('already final');
    // the plain rounds keep the plain word, so "semifinal" still means something
    expect(html).toMatch(/Winners bracket · G\d+/);
    expect(html).toMatch(/Losers bracket · G\d+/);
  });

  it('the pools meta says games done', () => {
    setPoolsFixture();
    expect(bridge.buildMgPools()).toMatch(/of \d+ games? done<\/p>/);
    expect(bridge.buildMgPools()).not.toMatch(/games? final<\/p>/);
  });

  it('C81: the QR encodes the current origin, never the dead host', () => {
    expect(appSrc).not.toContain('athletic-specimen-app.vercel.app');
    expect(appSrc).toContain("location.origin + '/checkin.html'");
    expect(indexSrc).not.toContain('vercel.app');
  });

  it('a scoreless final bracket game keeps the primary disabled until a point is entered', () => {
    setMainBracketFixture();
    const base = { id: 'm1', tournament_id: 'T', phase: 'main', side: 'winners', round: 1, round_label: 'WB R1 M1',
      net: 1, status: 'final', team_a_id: 't1', team_b_id: 't2', winner_team_id: 't1', score_a: null, score_b: null, version: 1 };
    // openMgScoreSheet seeds the pick from winner_team_id on a finished game, so the sheet is built with a
    // pick in hand. Without the guard the primary would offer to save a 0-0 the RPC refuses.
    expect(bridge.buildScoreSheet(base, 'a')).toMatch(/class="mgv-scfinal" data-mgss="edit" disabled/);
    // the guard is narrow: the same game with a real score still saves
    expect(bridge.buildScoreSheet({ ...base, score_a: 21, score_b: 15 }, 'a')).toContain('class="mgv-scfinal" data-mgss="edit">');
  });

  it('the 08-05b field style and the 08-23 button restyle are in styles.css once', () => {
    expect(count(css, '#app-shell input.pk-fv:not(.mgv-sv)')).toBe(1);
    expect(count(css, '#player-edit-modal .pe-save')).toBeGreaterThanOrEqual(1);
    expect(css).toContain('@keyframes m-menu');
    expect(css).not.toMatch(/\.popup-edit-input\s*\{[^}]*!important/);
  });
});

// ── Task 2: the Manage hub ────────────────────────────────────────────────────────────────────────────
// The hub stopped being a directory. Seeded through the real state the builders read, with the defaults a
// SATISFIED tournament carries so that "needs you" only fires when a test asks for it: every field the
// model checks is filled in, one upcoming pickup day exists, and mgSeats is loaded. Anything a test wants
// missing it passes explicitly.
function seedHub(bridge, row, extras) {
  const e = extras || {};
  const t = Object.assign({
    id: 'T', venmo_link: 'https://venmo.com/u/x', buy_in: '$80 a team',
    rules: '## Format\n- 4s', venue: 'Washington Park', venue_address: '1 Park Rd',
  }, row || {});
  const st = bridge.getState();
  Object.assign(st, {
    tournaments: [t],
    activeTournamentId: t.id,
    tournamentTeams: e.teams || [],
    tournamentPools: ('pools' in e) ? e.pools : [],
    tournamentMatches: e.matches || [],
    tournamentHistory: e.history,
    players: e.players || [],
    checkedIn: [],
    pickupDays: ('pickupDays' in e) ? e.pickupDays : [{ id: 'd1', day: '2999-01-01' }],
    pickupDaysLoaded: true,
    currentSession: null,
    teamMembers: null,
    isAdmin: true,
  });
  bridge.setSeats(('seats' in e) ? e.seats : [{ email: 'a@b.co', role: 'owner' }, { email: 'c@d.co', role: 'admin' }, {}]);
  bridge.setHub({ pickerOpen: !!e.pickerOpen, doneText: e.doneText || '' });
  return t;
}

describe('Task 2 hub', () => {
  it('phase index', () => {
    const p = bridge.phaseIndex;
    expect(p({ status: 'setup', registration_open: false }, '2026-08-20')).toBe(0);
    expect(p({ status: 'setup', registration_open: true }, '2026-08-20')).toBe(1);
    expect(p({ status: 'setup', registration_open: false, event_date: '2026-08-22' }, '2026-08-22')).toBe(2);
    expect(p({ status: 'pools' }, '2026-08-22')).toBe(3);
    expect(p({ status: 'bracket' }, '2026-08-22')).toBe(4);
    expect(p({ status: 'completed' }, '2026-08-22')).toBe(5);
    expect(bridge.hubSteps()).toEqual(['Setup', 'Sign-ups', 'Check-in', 'Pools', 'Bracket', 'Done']);
  });

  it('needs-you model, hub scope, order and copy', () => {
    const items = bridge.needsYou({ t: { id: 'a', status: 'setup', registration_open: false, buy_in: '', rules: '', venue: '' },
      teams: [{ name: 'Block Party', paid: false }, { name: 'Dig Deep', paid: false }, { name: 'X', paid: true }],
      pickupDays: [], pools: [], matches: [], tournaments: [{ id: 'old', status: 'completed', rules: '## Format\n- 4s' }], scope: 'hub', venueLoaded: true });
    // BRIEF FIX: the brief's expected array also carried 'venmo', but its own fixture closes registration
    // and the shipped venmo rule (spec: "prod's Venmo item stays") only fires while registration is OPEN.
    // The rule is kept and the fixture's expectation corrected; the open case is asserted right below.
    expect(items.map((i) => i.id)).toEqual(['signups', 'unpaid', 'pools', 'venue', 'fee', 'rules', 'noday']);
    expect(items[1].title).toBe("2 of 3 teams haven't paid");
    expect(items[1].sub).toBe('Block Party · Dig Deep, the other 1 is paid');
    expect(items[5].verb).toBe('Reuse');
    items.forEach((i) => { expect(i.title + i.sub).not.toMatch(/—|&mdash;|night/i); });
  });

  it('the venmo item still fires only while registration is open', () => {
    const ctx = { t: { id: 'a', status: 'setup', registration_open: true, buy_in: '$80', rules: 'x', venue: 'y', venmo_link: '' },
      teams: [], pickupDays: [{ day: '2999-01-01' }], pools: [], matches: [], tournaments: [], scope: 'hub', venueLoaded: true };
    expect(bridge.needsYou(ctx).map((i) => i.id)).toEqual(['venmo']);
    expect(bridge.needsYou({ ...ctx, t: { ...ctx.t, registration_open: false } }).map((i) => i.id)).toEqual(['signups']);
    expect(bridge.needsYou({ ...ctx, t: { ...ctx.t, venmo_link: 'https://venmo.com/u/x' } })).toEqual([]);
  });

  it('tournament scope drops the club-level items and a finished tournament lists none', () => {
    const items = bridge.needsYou({ t: { id: 'a', status: 'completed' }, teams: [], pickupDays: [], pools: [], matches: [], tournaments: [], scope: 'tournament', venueLoaded: true });
    expect(items).toEqual([]);
  });

  it('the hub: title block, picker, track, actions, chips; no card, no h1', () => {
    seedHub(bridge, { status: 'setup', registration_open: true, name: 'August 2026 Tournament', event_date: '2026-08-22' });
    const html = bridge.buildManage();
    expect(html).toContain('class="mgh-eyebrow">Manage<');
    expect(html).toContain('class="mgh-tname">August 2026 Tournament<');
    expect(html).toContain('class="mgh-meta">');
    expect(html).toContain('class="mgh-pick"');
    expect(count(html, 'class="mgh-step')).toBe(6);
    expect(count(html, 'is-now')).toBe(1);
    expect(html).toContain('<span>Close registration</span>');
    expect(html).toContain('<span>Add a team</span>');
    expect(html).toContain('>This tournament<');
    expect(html).toContain('>Everything<');
    expect(html).toContain('Casual games between tournaments');
    expect(html).not.toContain('mg-h1');
    expect(html).not.toContain('mgv-tsw');
    expect(html).not.toContain('mgh-undo');
    expect(html).not.toContain('mgh-state');
    expect(html).not.toMatch(/—|&mdash;|night/i);
    for (const a of ['tournament', 'pickup', 'checkin', 'players', 'teams', 'admins']) expect(count(html, `data-mg-area="${a}"`)).toBe(1);
  });

  it('chips never print unloaded data', () => {
    seedHub(bridge, { status: 'setup', registration_open: true, name: 'A' }, { seats: null });
    const html = bridge.buildManage();
    expect(html).not.toMatch(/\d+ seats?</);
  });

  it('the state chips read the one chip class, and the blocking one takes the warning ink', () => {
    seedHub(bridge, { status: 'setup', registration_open: false, name: 'A', team_cap: 12 },
      { teams: [{ id: 't1', paid: true }, { id: 't2', paid: true }], pools: [], players: [{ id: 'p1' }, { id: 'p2' }] });
    const html = bridge.buildManage();
    expect(html).toContain('class="mgv-rmeta is-warn">Pools not drawn<');
    expect(html).toContain('class="mgv-rmeta">2 of 12<');
    expect(html).toContain('class="mgv-rmeta">2 on file<');
    expect(html).toContain('class="mgv-rmeta">2 seats<');   // an empty seat row carries no email
  });

  it('the primary action follows the phase, and a finished tournament keeps only the secondary', () => {
    seedHub(bridge, { status: 'setup', registration_open: false, name: 'A' });
    expect(bridge.buildManage()).toContain('<span>Open registration</span>');
    seedHub(bridge, { status: 'pools', name: 'A' });
    expect(bridge.buildManage()).toContain('<span>Open score sheet</span>');
    seedHub(bridge, { status: 'completed', name: 'A' });
    const done = bridge.buildManage();
    expect(done).not.toContain('mgh-act is-primary');
    expect(done).toContain('<span>Add a team</span>');
  });

  it('the confirmation strip carries no Undo, and only shows what a write actually said', () => {
    seedHub(bridge, { status: 'setup', registration_open: true, name: 'A' }, { doneText: 'Registration is open' });
    const html = bridge.buildManage();
    expect(html).toContain('class="mgh-done is-under"');
    expect(html).toContain('Registration is open');
    expect(html).not.toContain('data-mgh-undo');
    seedHub(bridge, { status: 'setup', registration_open: true, name: 'A' });
    expect(bridge.buildManage()).not.toContain('mgh-done');
  });

  it('the picker groups by phase, marks exactly one row, and opens off the module var', () => {
    const st = bridge.getState();
    seedHub(bridge, { id: 'T', status: 'setup', registration_open: true, name: 'August 2026' });
    st.tournaments = [{ id: 'T', status: 'setup', registration_open: true, name: 'August 2026', created_at: '2026-08-01' },
      { id: 'J', status: 'completed', name: 'July 2026', created_at: '2026-07-01' }];
    const shut = bridge.buildManage();
    expect(shut).toContain('data-mgp-panel hidden');
    expect(shut).toContain('>This season</div>');
    expect(shut).toContain('>Finished</div>');
    expect(count(shut, 'class="mgh-prow')).toBe(2);
    expect(count(shut, 'mgh-prow is-on')).toBe(1);
    expect(shut).toContain('class="mgh-pstate">Finished<');
    expect(shut).toContain('data-mgtl-new');
    bridge.setHub({ pickerOpen: true });
    const open = bridge.buildManage();
    expect(open).toContain('data-mgp-panel>');
    expect(open).toContain('aria-expanded="true"');
  });

  it('a Finished picker row says nothing until the shared history cache has loaded', () => {
    const st = bridge.getState();
    seedHub(bridge, { id: 'T', status: 'setup', registration_open: true, name: 'August 2026' });
    st.tournaments = [{ id: 'T', status: 'setup', name: 'August 2026', created_at: '2026-08-01' },
      { id: 'J', status: 'completed', name: 'July 2026', created_at: '2026-07-01' }];
    expect(bridge.buildManage()).not.toContain('8 teams');
    st.tournamentHistory = [{ id: 'J', teamCount: 8, champion: { name: 'Net Gains' } }];
    expect(bridge.buildManage()).toContain('8 teams · Net Gains won');
  });

  it('the needs-you rows carry a verb, a hook and the section count', () => {
    seedHub(bridge, { status: 'setup', registration_open: false, name: 'A', buy_in: '' },
      { teams: [{ id: 't1', name: 'Block Party', paid: false }] });
    const html = bridge.buildManage();
    expect(html).toContain('>Before you open<');
    expect(html).toContain('class="mgh-sectn">');
    expect(html).toContain('class="mgh-nact" data-mgh-fix="regopen"><span>Open</span>');   // a fix keeps the accent ring
    expect(html).toContain('class="mgh-nact is-go" data-mgt-view="teams"><span>See who paid</span>');
    expect(html).toContain('data-mgh-fix="regopen"');
    expect(html).not.toContain('mgh-undo');
  });

  it('the retired chooser is gone from the source and from the stylesheet', () => {
    // Needled at the DEFINITION, not the bare name: the retirement comment left behind names what it
    // retired, and a note is not a call site.
    expect(appSrc).not.toContain('function buildMgTournamentListHTML');
    expect(appSrc).not.toContain('function mgtlRowHTML');
    expect(appSrc).not.toContain('const MGTL_NEW_ROW_HTML');
    expect(appSrc).not.toContain("closest('[data-mgtl-back]')");
    expect(appSrc).not.toContain("if (manageView === 'tournaments')");
    expect(appSrc).not.toContain("data-mg-area=\"tournaments\"");
    expect(css).not.toMatch(/^\.mgv-tsw \{/m);
    expect(css).not.toMatch(/^\.mgv-tdot \{/m);
  });

  it('the hub CSS block ships, with the chip rewritten onto the one prod chip class', () => {
    expect(css).toContain('.mgh-tname {');
    expect(css).toContain('.mgh-track {');
    expect(css).toContain('.mgh-pick {');
    expect(css).toContain('.mgv-rmeta.is-warn {');
    expect(css).toContain('.mgh-scope > .mgh-mark {');
    // Comments stripped: the PORT NOTES deliberately name the two classes these guards ban.
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(rules).not.toContain('.mgh-state');
    expect(rules).not.toContain('.mgh-undo');
  });
});
