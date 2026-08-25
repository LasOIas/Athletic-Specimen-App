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
