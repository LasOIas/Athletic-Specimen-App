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
import { describe, it, expect, afterEach } from 'vitest';
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
      // Task 8 (pool controls): netsEdit / moveTeam set the two module vars a tap would set, so the open
      // panel can be built in any of its states. Both are set on EVERY call, never only when passed, so a
      // case that leaves a picker open cannot leak it into the next one.
      buildMgPools: (opts) => {
        opts = opts || {};
        manageView = 'tournament'; mgtView = 'pools';
        mgpPoolFilter = (opts.filter === undefined ? null : opts.filter);
        mgpControlsOpen = !!opts.controls;
        mgpNetsEditPoolId = (opts.netsEdit === undefined ? null : opts.netsEdit);
        mgpMoveTeamId = (opts.moveTeam === undefined ? null : opts.moveTeam);
        return buildMgPoolsHTML();
      },
      netsDirty: () => manageNetsDirty(),
      moveTeamId: () => mgpMoveTeamId,
      netsEditId: () => mgpNetsEditPoolId,
      // Fix round 1: the tdb read-back guards are only provable by DRIVING the write against a fake
      // PostgREST chain. supabaseClient is a const, but its "from" is a plain property, so it can be
      // swapped for the length of one case. Returns its own undo.
      swapSupaFrom: (fn) => { const was = supabaseClient.from; supabaseClient.from = fn; return () => { supabaseClient.from = was; }; },
      moveTeamToPool: (teamId, poolId) => tdbMoveTeamToPool(teamId, poolId),
      // The two writes the open Pool controls can make, swapped for recorders (plus the team sheet, so a
      // Move tap that leaked through to it is visible rather than silent). This suite is offline — no tdb
      // call is ever real — and any of them may throw to drive its refusal branch.
      // Fix round 1: these six live in the SHARED vm context, so leaving them swapped would quietly break
      // every later test in the file. The returned "restore" puts the originals back and every caller runs
      // it in a finally.
      mockPoolWrites: (o) => {
        o = o || {};
        const calls = [];
        const was = { tdbMoveTeamToPool, tdbSetPoolNets, tdbRefreshTournaments, repaintManage, appNotice, openMgTeamSheet };
        tdbMoveTeamToPool = async (teamId, poolId) => { calls.push(['move', teamId, poolId]); if (o.move) return o.move(teamId, poolId); };
        tdbSetPoolNets = async (pool, nets) => { calls.push(['nets', pool && pool.id, nets]); if (o.nets) return o.nets(pool, nets); };
        tdbRefreshTournaments = async () => { calls.push(['refresh']); if (o.refresh) return o.refresh(); };
        repaintManage = () => { calls.push(['repaint']); };
        appNotice = (n) => { calls.push(['notice', n && n.title]); };
        openMgTeamSheet = (id) => { calls.push(['sheet', id]); };
        const restore = () => {
          tdbMoveTeamToPool = was.tdbMoveTeamToPool;
          tdbSetPoolNets = was.tdbSetPoolNets;
          tdbRefreshTournaments = was.tdbRefreshTournaments;
          repaintManage = was.repaintManage;
          appNotice = was.appNotice;
          openMgTeamSheet = was.openMgTeamSheet;
        };
        return { calls, restore };
      },
      buildScoreSheet: (m, w) => buildMgScoreSheetHTML(m, w),
      buildBracket: (opts) => { opts = opts || {}; manageView = 'tournament'; mgtView = 'bracket'; state.seedOverride = (opts.seedOverride === undefined ? null : opts.seedOverride); mgBracketShowDone = !!opts.showDone; return buildMgBracketHTML(); },
      buildSettings: () => { manageView = 'tournament'; mgtView = 'settings'; return buildMgSettingsHTML(); },
      // Task 6: the pure helper the Scoring card's summary line derives from (pure.js loads into this same
      // context, so the app sees it as a global exactly the way the browser does).
      ruleSummary: (t) => settingsRuleSummary(t),
      buildRules: () => { manageView = 'tournament'; mgtView = 'rules'; return buildMgRulesHTML(); },
      // Task 7: the pure helper the rules cards are built from (pure.js loads into this same context),
      // and the one editor every card's Edit pill opens, with its new { caret, append } options.
      rulesSections: (t) => rulesToSections(t),
      openEditor: (kind, opts) => openManageEditor(kind, opts),
      rulesDirty: () => manageRulesDirty(),
      attachHandlers: () => attachHandlers(),
      // openManageEditor puts the caret in a 60ms timeout; the sandbox stubs setTimeout to a noop, so a
      // test that wants the caret swaps in an immediate one for the length of the call.
      swapTimeout: (fn) => { const prev = globalThis.setTimeout; globalThis.setTimeout = fn; return prev; },
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
      // Task 5 (Add a team): the screen's submit path, its typeahead and its dirty guard. mockTeamAdd
      // swaps the three writes and the success tail for recorders — this suite is offline, so no write
      // is ever real; each option may throw to drive that step's failure branch.
      teamAddSubmit: () => mgTeamAddSubmit(),
      teamAddDirty: () => manageTeamAddDirty(),
      teamAddMatches: (q) => mgTeamAddMatches(q),
      teamAddMenu: (q) => mgTeamAddMenuHTML(mgTeamAddMatches(q)),
      setMgtView: (v) => { manageView = 'tournament'; mgtView = (v === undefined ? null : v); },
      mgtViewNow: () => mgtView,
      togglePaid: (btn) => mgTeamAddTogglePaid(btn),
      // Fix round 1: the poll guard is proven by DRIVING partialRender, not by grepping app.js for its
      // call site. bootPaintDone gates partialRender and activeMainTab picks its branch, so both are set
      // and restored by the test that uses them.
      poll: () => partialRender(),
      setTab: (v) => { activeMainTab = v; },
      tabNow: () => activeMainTab,
      setBoot: (v) => { bootPaintDone = !!v; },
      // Task 9 (the organizer's bracket): the keyboard path has to reach the SAME opener a tap reaches, so
      // the test swaps openMgScoreSheet for a recorder and drives the real keydown listener. Returns its
      // own undo — this suite shares one vm context, so leaving it swapped would break every later case.
      mockOpenScore: () => {
        const calls = [];
        const was = openMgScoreSheet;
        openMgScoreSheet = (id) => { calls.push(id); };
        return { calls, restore: () => { openMgScoreSheet = was; } };
      },
      // Fix round 1: the REAL opener, so the focus move after the mount is provable. And the bound-once
      // flag, which outlives #app-content on purpose — a test that wants to watch the document listeners
      // being bound has to clear it first, and the bound-once case leaves it set between its two calls.
      openScore: (id) => openMgScoreSheet(id),
      resetDocKeys: () => { mgDocKeysBound = false; },
      docKeysBound: () => mgDocKeysBound,
      mockTeamAdd: (o) => {
        o = o || {};
        const calls = [];
        tdbAddTeam = async (id, nm) => { calls.push(['add', id, nm]); return o.add ? o.add(id, nm) : { id: 'newteam', name: nm }; };
        tdbSetTeamRoster = async (id, r) => { calls.push(['roster', id, r]); if (o.roster) return o.roster(id, r); };
        tdbSetTeamPaid = async (id, v) => { calls.push(['paid', id, v]); if (o.paid) return o.paid(id, v); };
        tdbRefreshTournaments = async () => { calls.push(['refresh']); };
        repaintManage = () => { calls.push(['repaint', mgtView]); };
        return calls;
      },
      // Fix wave (2026-08-25): the hub's registration flip, DRIVEN, so a silently refused write (the RLS
      // shape — no error raised, no row changed, which is what mgVerifyTournamentFields exists to catch)
      // is provably reported on #mgh-status instead of dying quietly. Every swap is restored by the
      // returned undo; this suite shares one vm context, so a leaked swap would break every later case.
      flipReg: (open) => mgHubFlipRegistration(open),
      mockFlip: (o) => {
        o = o || {};
        const calls = [];
        const was = { tdbSetTournamentFields, mgVerifyTournamentFields, repaintManage };
        tdbSetTournamentFields = async (id, f) => { calls.push(['fields', id, f]); if (o.write) return o.write(id, f); };
        mgVerifyTournamentFields = async () => { calls.push(['verify']); return o.unsaved || []; };
        repaintManage = () => { calls.push(['repaint']); };
        return { calls, restore: () => {
          tdbSetTournamentFields = was.tdbSetTournamentFields;
          mgVerifyTournamentFields = was.mgVerifyTournamentFields;
          repaintManage = was.repaintManage;
        } };
      },
      // Fix wave: the 15s poll's tab branch. refreshTournamentLive picks its branch off activeMainTab, so
      // which collections a Manage-tab poll reloads is only provable by DRIVING it with every collaborator
      // swapped for a recorder — a grep of app.js proves nothing about which branch runs.
      refreshLive: () => refreshTournamentLive(),
      mockPoll: () => {
        const calls = [];
        const was = { tdbRefreshTournaments, tdbListTournaments, partialRender, partialRenderTournament, render };
        tdbRefreshTournaments = async () => { calls.push('refresh'); };
        tdbListTournaments = async () => { calls.push('list'); return state.tournaments || []; };
        partialRender = () => { calls.push('partialRender'); };
        partialRenderTournament = () => { calls.push('partialRenderTournament'); };
        render = () => { calls.push('render'); };
        return { calls, restore: () => {
          tdbRefreshTournaments = was.tdbRefreshTournaments;
          tdbListTournaments = was.tdbListTournaments;
          partialRender = was.partialRender;
          partialRenderTournament = was.partialRenderTournament;
          render = was.render;
        } };
      },
      // Fix wave: every team-sheet write runs through mgtsWrite, whose catch was a console.warn — a pool
      // move the DB refused looked exactly like one that landed. Driven directly; mockPoolWrites records
      // the notice it now raises.
      teamSheetWrite: (fn) => mgtsWrite(fn),
      // Fix wave: the double-tap guard on Save nets. Driven through the real delegate by its own test.
      saveNets: (poolId) => mgPoolsSaveNets(poolId),
    };`;
  const context = vm.createContext(sandbox);
  vm.runInContext(pureSrc, context, { filename: 'pure.js' });
  vm.runInContext(appSrc + epilogue, context, { filename: 'app.js' });
  // Task 5: the Add-a-team submit path and its dirty guard read REAL elements (#mgta-name, the
  // .rf-pinput rows, the paid switch, #tab-manage, the status line), so their tests install their own
  // behind this stub and restore it afterwards.
  sandbox.__bridge.doc = documentStub;
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
      { id: 't1', name: 'Dink Responsibly', seed: 1 }, { id: 't2', name: 'Sets and Reps', seed: 2 },
      { id: 't3', name: 'Block Party', seed: 3 }, { id: 't4', name: 'Net Gains', seed: 4 },
      { id: 't5', name: 'Ace Holes', seed: 5 }, { id: 't6', name: 'Dig It', seed: 6 },
      { id: 't7', name: 'Kitchen Sync', seed: 7 }, { id: 't8', name: 'Paddle Boat', seed: 8 },
    ],
    tournamentPools: [],
    // Task 9 additions to the same fixture: the REAL wiring (winner_next_match_id / loser_next_match_id),
    // teams[].seed the way generate_bracket_atomic writes it, and a short pool round so the score card's
    // "Seed 2 · 2–0 in pools" sub-line has a record to read (computeSeeding only counts phase 'pool').
    tournamentMatches: [
      // Winners R1, all four finished (held back behind the closing row by default)
      { id: 'w1a', tournament_id: 'T', phase: 'main', side: 'winners', round: 1, slot: 0, round_label: 'WB R1 M1', net: 1, queue_order: 0, status: 'final', team_a_id: 't1', team_b_id: 't2', winner_team_id: 't1', score_a: 21, score_b: 14, winner_next_match_id: 'w2a', loser_next_match_id: 'l1a', version: 1 },
      { id: 'w1b', tournament_id: 'T', phase: 'main', side: 'winners', round: 1, slot: 1, round_label: 'WB R1 M2', net: 2, queue_order: 1, status: 'final', team_a_id: 't3', team_b_id: 't4', winner_team_id: 't3', score_a: 21, score_b: 18, winner_next_match_id: 'w2a', loser_next_match_id: 'l1a', version: 1 },
      { id: 'w1c', tournament_id: 'T', phase: 'main', side: 'winners', round: 1, slot: 2, round_label: 'WB R1 M3', net: 1, queue_order: 2, status: 'final', team_a_id: 't5', team_b_id: 't6', winner_team_id: 't5', score_a: 21, score_b: 9, winner_next_match_id: 'w2b', loser_next_match_id: 'l1b', version: 1 },
      { id: 'w1d', tournament_id: 'T', phase: 'main', side: 'winners', round: 1, slot: 3, round_label: 'WB R1 M4', net: 2, queue_order: 3, status: 'final', team_a_id: 't7', team_b_id: 't8', winner_team_id: 't7', score_a: 21, score_b: 12, winner_next_match_id: 'w2b', loser_next_match_id: 'l1b', version: 1 },
      // Losers R1, both ready to play (round 1 of 2, so it stays a plain "bracket" group)
      { id: 'l1a', tournament_id: 'T', phase: 'main', side: 'losers', round: 1, slot: 0, round_label: 'LB R1 M1', net: 1, queue_order: 4, status: 'scheduled', team_a_id: 't2', team_b_id: 't4', winner_next_match_id: 'l2a', loser_next_match_id: null, version: 0 },
      { id: 'l1b', tournament_id: 'T', phase: 'main', side: 'losers', round: 1, slot: 1, round_label: 'LB R1 M2', net: 2, queue_order: 5, status: 'scheduled', team_a_id: 't6', team_b_id: 't8', winner_next_match_id: 'l2a', loser_next_match_id: null, version: 0 },
      // Winners R2, both live (round 2 of 3, still a plain "bracket" group)
      { id: 'w2a', tournament_id: 'T', phase: 'main', side: 'winners', round: 2, slot: 0, round_label: 'WB R2 M1', net: 1, queue_order: 6, status: 'live', team_a_id: 't1', team_b_id: 't3', score_a: 18, score_b: 15, winner_next_match_id: 'w3a', loser_next_match_id: 'l2a', version: 1 },
      { id: 'w2b', tournament_id: 'T', phase: 'main', side: 'winners', round: 2, slot: 1, round_label: 'WB R2 M2', net: 2, queue_order: 7, status: 'live', team_a_id: 't5', team_b_id: 't7', score_a: 7, score_b: 4, winner_next_match_id: 'w3a', loser_next_match_id: 'l2a', version: 1 },
      // Losers R2, the last losers round, still waiting on its feeders
      { id: 'l2a', tournament_id: 'T', phase: 'main', side: 'losers', round: 2, slot: 0, round_label: 'LB R2 M1', net: 1, queue_order: 8, status: 'scheduled', team_a_id: null, team_b_id: null, source_a: 'Winner of LB R1 M1', source_b: 'Winner of LB R1 M2', winner_next_match_id: 'gf', loser_next_match_id: null, version: 0 },
      // Winners R3, the last winners round
      { id: 'w3a', tournament_id: 'T', phase: 'main', side: 'winners', round: 3, slot: 0, round_label: 'WB R3 M1', net: 1, queue_order: 9, status: 'scheduled', team_a_id: null, team_b_id: null, source_a: 'Winner of WB R2 M1', source_b: 'Winner of WB R2 M2', winner_next_match_id: 'gf', loser_next_match_id: 'l2a', version: 0 },
      // The championship
      { id: 'gf', tournament_id: 'T', phase: 'main', side: 'grand_final', round: 1, slot: 0, round_label: 'Grand Final', net: 1, queue_order: 10, status: 'scheduled', team_a_id: null, team_b_id: null, source_a: 'Winner of WB R3 M1', source_b: 'Winner of LB R2 M1', winner_next_match_id: null, loser_next_match_id: null, version: 0 },
      // A short pool round behind the bracket: t1 2–0, t3 2–1, t2 0–2, t4 0–1.
      { id: 'pA1', tournament_id: 'T', pool_id: 'p1', phase: 'pool', net: 1, queue_order: 1, status: 'final', team_a_id: 't1', team_b_id: 't2', winner_team_id: 't1', score_a: 15, score_b: 9, version: 1 },
      { id: 'pA2', tournament_id: 'T', pool_id: 'p1', phase: 'pool', net: 1, queue_order: 2, status: 'final', team_a_id: 't1', team_b_id: 't3', winner_team_id: 't1', score_a: 15, score_b: 13, version: 1 },
      { id: 'pA3', tournament_id: 'T', pool_id: 'p1', phase: 'pool', net: 2, queue_order: 3, status: 'final', team_a_id: 't3', team_b_id: 't2', winner_team_id: 't3', score_a: 15, score_b: 7, version: 1 },
      { id: 'pA4', tournament_id: 'T', pool_id: 'p1', phase: 'pool', net: 2, queue_order: 4, status: 'final', team_a_id: 't3', team_b_id: 't4', winner_team_id: 't3', score_a: 15, score_b: 11, version: 1 },
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

// Task 8 (pool controls): a pools-status tournament seeded through seedHub, with two teams per pool so
// every card has rows to move. `matches` is what each case actually varies — it decides which pool has
// already played, which is the whole of the Move rule.
function seedPools(bridge, o) {
  o = o || {};
  const pools = (o.pools || [{ id: 'p1', label: 'A' }, { id: 'p2', label: 'B' }])
    .map((p, i) => Object.assign({ display_order: i }, p));
  const teams = o.teams || [
    { id: 't1', name: 'Dink Responsibly', pool_id: 'p1', paid: true },
    { id: 't2', name: 'Sets and Reps', pool_id: 'p1', paid: true },
    { id: 't3', name: 'Block Party', pool_id: 'p2', paid: true },
    { id: 't4', name: 'Net Gains', pool_id: 'p2', paid: true },
  ];
  return seedHub(bridge, Object.assign({ status: 'pools', name: 'August 2026', net_count: 3 }, o.tournament),
    { teams, pools, matches: o.matches || [] });
}

// Pool play with nothing final anywhere, so every pool is still movable.
const UNPLAYED = [
  { id: 'a1', phase: 'pool', pool_id: 'p1', net: 1, status: 'scheduled', team_a_id: 't1', team_b_id: 't2', queue_order: 1 },
  { id: 'a2', phase: 'pool', pool_id: 'p1', net: 2, status: 'scheduled', team_a_id: 't1', team_b_id: 't2', queue_order: 2 },
  { id: 'a3', phase: 'pool', pool_id: 'p1', net: 3, status: 'live', team_a_id: 't2', team_b_id: 't1', score_a: 4, score_b: 3, queue_order: 3 },
  { id: 'b1', phase: 'pool', pool_id: 'p2', net: 4, status: 'scheduled', team_a_id: 't3', team_b_id: 't4', queue_order: 1 },
];

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

  it('the Check-in chip carries the DATE, says Today on the day, and nothing once it is past', () => {
    const today = new Date();
    const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const shift = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return d; };
    // A bare weekday reads identically for this Saturday and one five weeks out, so the chip names the day.
    const soon = shift(3);
    seedHub(bridge, { status: 'setup', registration_open: true, name: 'A', event_date: iso(soon) });
    const label = soon.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    expect(bridge.buildManage()).toContain(`class="mgv-rmeta">Opens ${label}<`);
    expect(bridge.buildManage()).not.toMatch(/Opens (Mon|Tue|Wed|Thu|Fri|Sat|Sun)</);

    seedHub(bridge, { status: 'setup', registration_open: true, name: 'A', event_date: iso(today) });
    expect(bridge.buildManage()).toContain('class="mgv-rmeta">Today<');

    // Past, and absent: the row says nothing rather than counting backwards.
    seedHub(bridge, { status: 'setup', registration_open: true, name: 'A', event_date: iso(shift(-2)) });
    let html = bridge.buildManage();
    expect(html).not.toContain('Opens ');
    expect(html).not.toContain('>Today<');
    seedHub(bridge, { status: 'setup', registration_open: true, name: 'A' });
    html = bridge.buildManage();
    expect(html).not.toContain('Opens ');
    expect(html).not.toContain('>Today<');
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
    // The panel opens on a TAP, and body.m-enter is only ever set by a real navigation, so the open gesture
    // plays through prod's explicit player (mPlay(panel, 'm-in', 300)) instead of the entrance gate.
    expect(css).toContain('.mgh-pick.m-in {');
    expect(css).toContain('.mgh-pick.m-in > * {');
    expect(appSrc).toContain("mPlay(document.querySelector('#tab-manage [data-mgp-panel]'), 'm-in', 300)");
    // and no prototype wildcard came along with it (comments stripped: the PORT NOTE names the wildcards it
    // rewrote away, and a note is not a rule)
    for (const bad of ['[class*="-pick"]', '[class*="-menu"]', '[class*="dropdown"]']) {
      expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toContain(bad);
    }
    expect(css).toContain('.mgh-scope > .mgh-mark {');
    // Comments stripped: the PORT NOTES deliberately name the two classes these guards ban.
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(rules).not.toContain('.mgh-state');
    expect(rules).not.toContain('.mgh-undo');
  });
});

describe('Task 3 live strip', () => {
  it('the live strip lists every net, names the game on it, and prints no minutes', () => {
    seedHub(bridge, { status: 'pools', net_count: 2, name: 'A' }, { matches: [
      { id: 'm1', phase: 'pool', pool_id: 'p1', net: 1, status: 'live', score_a: 3, score_b: 1, team_a_id: 't1', team_b_id: 't2', queue_order: 4 },
      { id: 'm2', phase: 'pool', pool_id: 'p1', net: 2, status: 'scheduled', team_a_id: 't3', team_b_id: 't4', queue_order: 5 }],
      pools: [{ id: 'p1', label: 'A' }], teams: [{ id: 't1', name: 'Net Gains' }, { id: 't2', name: 'Block Party' }, { id: 't3', name: 'X' }, { id: 't4', name: 'Y' }] });
    const html = bridge.buildManage();
    expect(html).toContain('>On the nets<');
    expect(html).toContain('1 playing · 1 idle');
    expect(html).toContain('Net Gains vs Block Party');
    expect(html).toContain('Pool A · G4');
    expect(html).toContain('G5 can start');
    expect(html).not.toMatch(/\d+ min</);
    expect(html).not.toContain('checked in');
  });

  it('a silent net says no score yet and nothing else claims a duration', () => {
    seedHub(bridge, { status: 'pools', net_count: 1, name: 'A' }, { matches: [
      { id: 'm1', phase: 'pool', pool_id: 'p1', net: 1, status: 'live', score_a: 0, score_b: 0, team_a_id: 't1', team_b_id: 't2', queue_order: 1 }],
      pools: [{ id: 'p1', label: 'A' }], teams: [{ id: 't1', name: 'Net Gains' }, { id: 't2', name: 'Block Party' }] });
    const html = bridge.buildManage();
    expect(html).toContain('class="mgh-lnet is-late"');
    expect(html).toContain('Pool A · G1 · no score yet');
    expect(html).not.toMatch(/\d+ min</);
  });

  it('an idle net with nothing queued says so honestly, and a live net never shows Idle', () => {
    seedHub(bridge, { status: 'pools', net_count: 1, name: 'A' }, { matches: [], pools: [{ id: 'p1', label: 'A' }], teams: [] });
    const html = bridge.buildManage();
    expect(html).toContain('class="mgh-lnet is-idle"');
    expect(html).toContain('Nothing queued');
    expect(html).toContain('0 playing · 1 idle');
  });

  it('a bracket game prints its side and the Championship label, not a pool letter', () => {
    seedHub(bridge, { status: 'bracket', net_count: 1, name: 'A' }, { matches: [
      { id: 'gf', phase: 'main', side: 'grand_final', round: 1, slot: 0, net: 1, status: 'live', score_a: 5, score_b: 4, team_a_id: 't1', team_b_id: 't2', queue_order: 9 }],
      teams: [{ id: 't1', name: 'Net Gains' }, { id: 't2', name: 'Block Party' }] });
    const html = bridge.buildManage();
    expect(html).toContain('Championship · G1');
  });

  it('the strip is absent outside game day, without nets configured, and off a stale collection', () => {
    const liveMatch = { id: 'm1', phase: 'pool', pool_id: 'p1', net: 1, status: 'live', score_a: 3, score_b: 1, team_a_id: 't1', team_b_id: 't2', queue_order: 4 };

    seedHub(bridge, { status: 'setup', net_count: 2, name: 'A' }, { matches: [liveMatch] });
    expect(bridge.buildManage()).not.toContain('On the nets');

    seedHub(bridge, { status: 'pools', net_count: 0, name: 'A' }, { matches: [liveMatch] });
    expect(bridge.buildManage()).not.toContain('On the nets');

    seedHub(bridge, { status: 'pools', net_count: 2, name: 'A' }, { matches: [liveMatch] });
    bridge.getState().activeTournamentId = 'somebody-else';
    expect(bridge.buildManage()).not.toContain('On the nets');
  });

  it('an idle net never offers a game whose team is currently live on another net', () => {
    const liveWX = { id: 'live1', phase: 'pool', pool_id: 'p1', net: 1, status: 'live', score_a: 5, score_b: 3, team_a_id: 'w', team_b_id: 'x', queue_order: 1 };

    // W and X are live on net 1. Net 2's only queued game reuses X, so net 2 must read Idle and
    // must NOT offer that game as startable while X is still mid-match on net 1 (fix round 1,
    // 2026-08-25: pickPoolCurrentGames needs the live match in its input to know X is busy).
    seedHub(bridge, { status: 'pools', net_count: 2, name: 'A' }, { matches: [liveWX,
      { id: 'q2', phase: 'pool', pool_id: 'p1', net: 2, status: 'scheduled', team_a_id: 'x', team_b_id: 'z', queue_order: 2 }],
      pools: [{ id: 'p1', label: 'A' }],
      teams: [{ id: 'w', name: 'W' }, { id: 'x', name: 'X' }, { id: 'z', name: 'Z' }] });
    let html = bridge.buildManage();
    expect(html).toContain('>Idle<');
    expect(html).not.toContain('can start');
    expect(html).toContain('Nothing queued');

    // Control: same live game on net 1, but net 2's queued game is between two teams that are
    // both free — it DOES read as startable.
    seedHub(bridge, { status: 'pools', net_count: 2, name: 'A' }, { matches: [liveWX,
      { id: 'q2', phase: 'pool', pool_id: 'p1', net: 2, status: 'scheduled', team_a_id: 'y', team_b_id: 'z', queue_order: 2 }],
      pools: [{ id: 'p1', label: 'A' }],
      teams: [{ id: 'w', name: 'W' }, { id: 'x', name: 'X' }, { id: 'y', name: 'Y' }, { id: 'z', name: 'Z' }] });
    html = bridge.buildManage();
    expect(html).toContain('G2 can start');
  });

  it('the header playing count is clamped to net_count, not to whatever net value a row carries', () => {
    seedHub(bridge, { status: 'pools', net_count: 2, name: 'A' }, { matches: [
      { id: 'stray', phase: 'pool', pool_id: 'p1', net: 5, status: 'live', score_a: 4, score_b: 2, team_a_id: 't1', team_b_id: 't2', queue_order: 1 }],
      pools: [{ id: 'p1', label: 'A' }], teams: [{ id: 't1', name: 'W' }, { id: 't2', name: 'X' }] });
    const html = bridge.buildManage();
    expect(html).toContain('0 playing · 2 idle');
    expect(html).not.toContain('5</span>');
    expect((html.match(/class="mgh-lnet/g) || []).length).toBe(2);
  });

  it('the live-strip CSS ships, minus the minutes column', () => {
    expect(css).toContain('.mgh-live {');
    expect(css).toContain('.mgh-livehd {');
    expect(css).toContain('.mgh-lnet {');
    expect(css).toContain('.mgh-lnn {');
    expect(css).toContain('.mgh-lnt {');
    expect(css).toContain('.mgh-lns {');
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toContain('.mgh-lnm');
  });
});

// ── Task 4: Manage › Tournament — the one-page control room (screen 25, mgts-hub) ────────────────────
// It was seven undifferentiated rows under a stage word. It is now: the when-line, the SAME six-step
// track the hub draws, four numbers, a tournament-scoped Needs-you list, then every surface grouped by
// the question it answers, and the two irreversible things last behind their own rule.
describe('Task 4 the tournament page', () => {
  it('the tournament page: when-line, track, four tiles, scoped needs, grouped rows, note, danger last', () => {
    seedHub(bridge, { status: 'setup', registration_open: true, name: 'August 2026 Tournament', event_date: '2026-08-22', venue: 'Washington Park', team_size: 4, buy_in: '$80 a team', net_count: 3, team_cap: 12 },
      { teams: [{ id: 't1', name: 'Block Party', paid: false }, { id: 't2', name: 'X', paid: true }] });
    const html = bridge.buildTournament();
    expect(html).toContain('class="tv-when"><b>Sat Aug 22</b> · Washington Park · 4s co-ed · $80 a team<');
    expect(html).not.toContain('10:00');
    expect(count(html, 'class="mgh-step')).toBe(6);
    expect(html).toMatch(/class="tv-stat[^"]*"><span class="tv-sn">2<small>\/12<\/small><\/span><span class="tv-sl">Teams in/);
    expect(html).toContain('<span class="tv-sn">1<small>/2</small></span><span class="tv-sl">Paid</span>');
    expect(html).toContain('<span class="tv-sn">3</span><span class="tv-sl">Nets</span>');
    expect(html).toContain('<span class="tv-sn">0</span><span class="tv-sl">Games</span>');
    expect(html).not.toContain('/18');
    for (const h of ['Sign-ups', 'Play', 'The event', 'After it ends']) expect(html).toContain(`>${h}<`);
    expect(html).toContain('Registration &amp; public page');
    expect(html).toContain('data-mgt-view="teamadd"');
    // Fix wave: this used to assert `data-mgt-view="scoresheet"` was absent — a view name the app has
    // never emitted, so it passed whether or not the row rendered. The row's own text is the real check.
    expect(html).not.toContain('>Score sheet<'); // omitted before the draw
    expect(html).toContain('data-mgt-announce');
    expect(html).not.toContain('closes ');
    expect(html).toContain('12-team cap');
    expect(html).toContain('Everything on this page edits August 2026 Tournament only. Switch tournaments from the title on Manage.');
    expect(html.indexOf('data-mgtl-new')).toBeGreaterThan(html.indexOf('data-mgt-view="closeout"'));
    expect(html.indexOf('mgv-danger')).toBeGreaterThan(html.indexOf('data-mgtl-new'));
    expect(html).not.toContain('mgt-stage');
    expect(html).not.toMatch(/—|&mdash;|night/i);
  });

  // The Needs-you list here is the TOURNAMENT scope: the club-level items (the Venmo link, "no pickup day
  // set") belong to the hub and must not follow the admin into a page that edits one event.
  it('the Needs-you list is tournament-scoped, so the hub-only items never appear here', () => {
    seedHub(bridge, { status: 'setup', registration_open: true, name: 'August', venmo_link: '', buy_in: '' },
      { teams: [], pickupDays: [] });
    const html = bridge.buildTournament();
    expect(html).toContain('>Needs you<');
    expect(html).toContain("Entry fee isn't set");   // titles emit RAW (fixed copy + counts)
    expect(html).not.toContain('Add the Venmo link');
    expect(html).not.toContain('No pickup day set');
  });

  // The Score sheet row is the SAME destination as Pools & schedule, so it only earns its own row once
  // there are pool games to enter. Before the draw it would open an empty board.
  it('the Score sheet row appears only once pool matches exist, and shares the pools destination', () => {
    const seedPools = (matches) => seedHub(bridge, { status: 'pools', name: 'August', net_count: 2 }, {
      teams: [{ id: 't1', name: 'A', paid: true }, { id: 't2', name: 'B', paid: true }],
      pools: [{ id: 'p1', label: 'A' }], matches,
    });
    seedPools([]);
    expect(bridge.buildTournament()).not.toContain('>Score sheet<');
    seedPools([{ id: 'g1', phase: 'pool', pool_id: 'p1', net: 1, queue_order: 1, status: 'scheduled', team_a_id: 't1', team_b_id: 't2' }]);
    const html = bridge.buildTournament();
    expect(html).toContain('>Score sheet<');
    expect(html).toContain('Enter pool results as each game finishes');
    expect(count(html, 'data-mgt-view="pools"')).toBeGreaterThanOrEqual(2);
    expect(html).toContain('<span class="tv-sn">0<small>/1</small></span><span class="tv-sl">Games</span>');
  });

  it('Player view renders only when the active tournament is the public one', () => {
    seedHub(bridge, { id: 'A', status: 'setup', registration_open: true, name: 'August' });
    bridge.getState().tournaments.push({ id: 'B', name: 'The live one', status: 'pools' });
    expect(bridge.buildTournament()).not.toContain('data-nav-tab="tournament"');
    seedHub(bridge, { id: 'A', status: 'pools', name: 'August' });
    const html = bridge.buildTournament();
    expect(html).toContain('data-nav-tab="tournament"');
    expect(html).toContain('Open this tournament the way players see it');
  });

  // Every clause the schema cannot back is DROPPED rather than invented (Mike's standing ruling). A
  // tournament loaded WITHOUT the 0057/0058 columns prints no date, no cap and no venue at all.
  it('drops the date, the cap and the venue when their columns are not loaded', () => {
    const st = bridge.getState();
    Object.assign(st, {
      tournaments: [{ id: 'T', name: 'August', status: 'setup', registration_open: true, team_size: 4, buy_in: '$80 a team', net_count: 2 }],
      activeTournamentId: 'T', tournamentTeams: [], tournamentPools: [], tournamentMatches: [],
      players: [], checkedIn: [], pickupDays: [], isAdmin: true,
    });
    const html = bridge.buildTournament();
    expect(html).toContain('class="tv-when">4s co-ed · $80 a team<');
    expect(html).not.toContain('-team cap');
    expect(html).not.toContain('Washington Park');
    expect(html).toContain('<span class="tv-sn">0</span><span class="tv-sl">Teams in</span>');
  });

  it('the Announcement row opens the editor, and the delete confirm is red', () => {
    expect(appSrc).toContain("data-mgt-announce]')) { openManageEditor('announcement')");
    expect(appSrc).toMatch(/function appPrompt\(\{[^}]*danger[^}]*\}/);
    expect(appSrc).toContain("(danger ? ' mgv-del' : '')");
    expect(appSrc).toMatch(/confirmText: 'Delete tournament',\s*\n\s*danger: true,/);
    expect(css).toContain('.kc-confirm.mgv-del');
  });

  it('the Registration screen is titled for the public page and rests on a Saved status line', () => {
    seedHub(bridge, { status: 'setup', registration_open: true, name: 'August' });
    const reg = bridge.buildReg();
    expect(reg).toContain('class="pd-htitle">Registration &amp; public page<');
    expect(reg).toContain('class="mgr-status" id="mgr-status" role="status" aria-live="polite">Saved<');
    expect(bridge.buildSettings()).toContain('id="mges-status" role="status" aria-live="polite">Saved<');
  });

  // DRIVE 2026-08-25 + final review: the scoped Needs-you list on THIS page carries the same two WRITING
  // items the hub does (Open registration, Reuse rules), but #mgh-status and the confirmation strip were
  // emitted only by the hub's quick-actions block — so a refused write here said nothing at all, and a
  // write that landed showed no confirmation. One status target and one strip, shared by both pages.
  it('the tournament page carries the status target and the confirmation strip, one of each per page', () => {
    seedHub(bridge, { status: 'setup', registration_open: false, name: 'August', rules: '' }, { teams: [] });
    expect(count(bridge.buildTournament(), 'id="mgh-status"')).toBe(1);
    expect(count(bridge.buildManage(), 'id="mgh-status"')).toBe(1);
    // The strip can only ever mean "the write landed" — both pages draw it from the same mgHubDoneText.
    bridge.setHub({ doneText: 'Registration is open' });
    try {
      const page = bridge.buildTournament();
      expect(count(page, 'class="mgh-done is-under"')).toBe(1);
      expect(page).toContain('Registration is open');
      expect(count(bridge.buildManage(), 'class="mgh-done is-under"')).toBe(1);
    } finally { bridge.setHub({}); }
  });

  it('a silently refused registration flip says so on the #mgh-status both pages emit', async () => {
    seedHub(bridge, { status: 'setup', registration_open: false, name: 'August' }, { teams: [] });
    expect(bridge.buildTournament()).toContain('id="mgh-status"');
    const doc = bridge.doc;
    const realGet = doc.getElementById;
    const line = { textContent: '', classList: { add: () => {}, remove: () => {} } };
    doc.getElementById = (id) => (id === 'mgh-status' ? line : null);
    // The RLS shape: the write raises nothing, the read-back shows the column never moved.
    const { calls, restore } = bridge.mockFlip({ unsaved: ['registration_open'] });
    try {
      await bridge.flipReg(true);
      expect(calls.map((c) => c[0])).toEqual(['fields', 'verify', 'repaint']);
      expect(line.textContent).toContain('That did not save');
    } finally { restore(); doc.getElementById = realGet; }
  });

  // DRIVE 2026-08-25: both rows read "N of M games final". "done" is this app's word (Task 1 locks it on
  // the pools meta) and "final" is the bracket vocabulary the round retired.
  it('the Pools and Bracket rows say games DONE, never games final', () => {
    seedHub(bridge, { status: 'pools', name: 'August', net_count: 2 }, {
      teams: [{ id: 't1', name: 'A', paid: true }, { id: 't2', name: 'B', paid: true }],
      pools: [{ id: 'p1', label: 'A' }],
      matches: [
        { id: 'g1', phase: 'pool', pool_id: 'p1', net: 1, queue_order: 1, status: 'final', team_a_id: 't1', team_b_id: 't2', winner_team_id: 't1', score_a: 15, score_b: 9 },
        { id: 'g2', phase: 'pool', pool_id: 'p1', net: 1, queue_order: 2, status: 'scheduled', team_a_id: 't1', team_b_id: 't2' },
        { id: 'm1', phase: 'main', side: 'winners', round: 1, slot: 0, net: 1, queue_order: 3, status: 'final', team_a_id: 't1', team_b_id: 't2', winner_team_id: 't1', score_a: 21, score_b: 12 },
        { id: 'm2', phase: 'main', side: 'grand_final', round: 1, slot: 0, net: 1, queue_order: 4, status: 'scheduled', team_a_id: 't1', team_b_id: 't2' },
      ],
    });
    const html = bridge.buildTournament();
    expect(count(html, '1 of 2 games done')).toBe(2);   // the Pools row and the Bracket row
    expect(html).not.toMatch(/games? final/);
  });

  // DRIVE 2026-08-25 on the live August bracket: the row read "26 of 31" under a strip reading "26 of 30".
  // The strip excludes an unplayed reset game; the row counted every main row. One helper now, both callers.
  it('the Bracket row and the bracket strip agree, both leaving out an unplayed reset game', () => {
    seedHub(bridge, { status: 'bracket', name: 'August', net_count: 2 }, {
      teams: [{ id: 't1', name: 'A', seed: 1 }, { id: 't2', name: 'B', seed: 2 }, { id: 't3', name: 'C', seed: 3 }],
      pools: [],
      matches: [
        { id: 'w1', phase: 'main', side: 'winners', round: 1, slot: 0, round_label: 'WB R1 M1', net: 1, queue_order: 0, status: 'final', team_a_id: 't1', team_b_id: 't2', winner_team_id: 't1', score_a: 21, score_b: 10, version: 1 },
        { id: 'l1', phase: 'main', side: 'losers', round: 1, slot: 0, round_label: 'LB R1 M1', net: 2, queue_order: 1, status: 'final', team_a_id: 't2', team_b_id: 't3', winner_team_id: 't2', score_a: 21, score_b: 12, version: 1 },
        { id: 'gf', phase: 'main', side: 'grand_final', round: 1, slot: 0, round_label: 'Grand Final', net: 1, queue_order: 2, status: 'final', team_a_id: 't1', team_b_id: 't2', winner_team_id: 't1', score_a: 21, score_b: 15, version: 1 },
        // The reset game only gets played when the losers side wins the first championship. It never was.
        { id: 'gf2', phase: 'main', side: 'grand_final', round: 2, slot: 0, round_label: 'Grand Final Reset', net: 1, queue_order: 3, status: 'scheduled', team_a_id: null, team_b_id: null, version: 0 },
      ],
    });
    expect(bridge.buildTournament()).toContain('3 of 3 games done');
    expect(bridge.buildBracket()).toContain('3 of 3 games in');
  });

  it('the page CSS ships', () => {
    ['.tv-when {', '.tv-stats {', '.tv-stat {', '.tv-sn {', '.tv-sl {', '.tv-note {',
      '.tv-stat.is-attn .tv-sn', '.tv-stat.is-live .tv-sn'].forEach((sel) => expect(css).toContain(sel));
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toContain('.mgt-stage');
  });
});

// ── Task 5: Add a team (screen 31, mgts-team-add) ─────────────────────────────────────────────────────
// The organizer's own roster form, built on the SAME .rf-* kit the public registration page uses so the
// two screens read as one form. Three things are new: a typeahead under each player slot (the club
// players already on file), a Marked-paid switch where the public form carries the Venmo CTA, and a
// submit that is three writes deep — add the team, set its roster, mark it paid — each able to fail on
// its own and each with its own honest line. Nothing here claims an activity-log entry.

// A minimal element the submit path can read and write: a value, attributes, a status line's text.
function mkEl(extra) {
  const classes = new Set();
  return Object.assign({
    tagName: 'INPUT', value: '', textContent: '', innerHTML: '', disabled: false,
    attrs: {},
    classes,   // fix round 1: a REAL class set, so a toggle can be asserted rather than grepped
    getAttribute(k) { return (k in this.attrs) ? this.attrs[k] : null; },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    classList: {
      add: (c) => classes.add(c), remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c), toggle: (c) => (classes.has(c) ? classes.delete(c) : classes.add(c)),
    },
  }, extra || {});
}
const docOrig = { getElementById: bridge.doc.getElementById, querySelector: bridge.doc.querySelector, querySelectorAll: bridge.doc.querySelectorAll };

// Install a live Add-a-team form behind the vm's document stub: the name field, the player slots, the
// paid switch and the status line, exactly as mgTeamAddSubmit reaches for them.
function installTeamAddForm(opts) {
  const o = opts || {};
  const name = mkEl({ value: o.name == null ? '' : o.name });
  const status = mkEl({ tagName: 'P' });
  const paid = mkEl({ tagName: 'BUTTON', attrs: { 'aria-checked': o.paid ? 'true' : 'false' } });
  const save = mkEl({ tagName: 'BUTTON' });
  const rows = (o.roster || []).map((v) => mkEl({ value: v }));
  bridge.doc.getElementById = (id) => (id === 'mgta-name' ? name : (id === 'mgta-status' ? status : null));
  bridge.doc.querySelectorAll = (sel) => (sel === '#tab-manage .rf-pinput' ? rows.slice() : []);
  bridge.doc.querySelector = (sel) => (sel === '[data-mgta-paid]' ? paid : (sel === '[data-mgta-save]' ? save : null));
  return { name, status, paid, save, rows };
}

// Install #tab-manage carrying N text fields plus the Marked-paid switch, optionally with the caret in
// the first field and optionally with the switch already flipped on.
function installTeamAddPanel(values, focused, paidOn) {
  const fields = (values || []).map((v) => mkEl({ value: v }));
  const sw = mkEl({ tagName: 'BUTTON', attrs: { 'aria-checked': paidOn ? 'true' : 'false' } });
  const panel = {
    scrollTop: 0,
    contains: (n) => fields.indexOf(n) >= 0,
    querySelectorAll: () => fields.slice(),
    querySelector: (sel) => (sel === '[data-mgta-paid][aria-checked="true"]'
      ? (sw.getAttribute('aria-checked') === 'true' ? sw : null) : null),
  };
  bridge.doc.getElementById = (id) => (id === 'tab-manage' ? panel : null);
  bridge.doc.activeElement = focused ? fields[0] : null;
  return { fields, sw, panel };
}

describe('Task 5 add a team', () => {
  afterEach(() => { Object.assign(bridge.doc, docOrig); bridge.doc.activeElement = null; });

  it('Add a team: name, team_size rows, the paid switch, no log claim', () => {
    seedHub(bridge, { status: 'setup', registration_open: false, name: 'A', team_size: 4, buy_in: '$80 a team' });
    const html = bridge.mgtContainer('teamadd');
    expect(html).toContain('class="pd-htitle">Add a team<');
    expect(count(html, 'class="rf-pinput')).toBe(4);
    expect(html).toContain('4 per team');
    expect(html).toContain('data-mgta-paid');
    expect(html).toContain('$80 a team · no Venmo record for teams you add');
    expect(html).toContain('data-mgta-save');
    expect(html).not.toMatch(/activity log/i);
  });

  // The kit is the public register form's, so the two screens read as one: the same page section, the same
  // field, the same numbered rows, the same divider and the same full-width CTA. Only the payment block
  // and the typeahead hooks differ.
  it('the screen is the register kit, sized by team_size, with a back button and a status line', () => {
    seedHub(bridge, { status: 'setup', registration_open: false, name: 'A', team_size: 6, buy_in: '' });
    const html = bridge.mgtContainer('teamadd');
    expect(html).toContain('data-mgt-back');
    expect(html).toContain('class="rf-page mgv-taform"');
    expect(html).toContain('class="rf-tinput" id="mgta-name"');
    expect(count(html, 'class="rf-prow mgv-tarow"')).toBe(6);
    expect(html).toContain('6 per team · at least 1 guy + 1 girl');
    expect(html).toContain('First and Last Name');
    expect(html).toContain('class="rf-cta" data-mgta-save>Add team<');
    expect(html).toContain('class="mgr-status" id="mgta-status"');
    // blank buy_in falls back to the league default rather than printing an empty sentence
    expect(html).toContain('$80 a team · no Venmo record for teams you add');
    expect(html).toContain('role="switch" aria-checked="false"');
    expect(html).not.toContain('Coming in the next slices');
    expect(html).not.toMatch(/—|&mdash;/);
  });

  it('no tournament: an honest empty state instead of a form that writes nowhere', () => {
    const st = bridge.getState();
    Object.assign(st, { tournaments: [], activeTournamentId: null, tournamentTeams: [], tournamentPools: [], tournamentMatches: [], players: [], checkedIn: [], pickupDays: [], isAdmin: true });
    const html = bridge.mgtContainer('teamadd');
    expect(html).toContain('class="pd-htitle">Add a team<');
    expect(html).toContain('class="pd-empty"');
    expect(html).not.toContain('data-mgta-save');
  });

  // The typeahead is the organizer typing against players already on file. Prefix, case-insensitive, six
  // at most, and the menu prints a name and its initials — never a skill rating (admin-only data that has
  // no business on a roster form).
  it('the typeahead matches club players by name prefix, six at most, and never prints a skill', () => {
    seedHub(bridge, { status: 'setup', registration_open: false, name: 'A', team_size: 4 }, { players: [
      { id: 1, name: 'Harper Ellis', skill: 9 }, { id: 2, name: 'Harper Quinn', skill: 3 },
      { id: 3, name: 'harper zane', skill: 5 }, { id: 4, name: 'Harper Ackley', skill: 5 },
      { id: 5, name: 'Harper Bly', skill: 5 }, { id: 6, name: 'Harper Cole', skill: 5 },
      { id: 7, name: 'Harper Dove', skill: 5 }, { id: 8, name: 'Sam Reed', skill: 7 },
    ] });
    expect(bridge.teamAddMatches('harp').length).toBe(6);
    expect(Array.from(bridge.teamAddMatches('HARPER E'))).toEqual(['Harper Ellis']);
    expect(Array.from(bridge.teamAddMatches('reed'))).toEqual([]);   // a prefix, never a substring
    expect(Array.from(bridge.teamAddMatches('   '))).toEqual([]);
    const menu = bridge.teamAddMenu('harper e');
    expect(menu).toContain('class="mgv-taitem" data-mgta-pick="Harper Ellis"');
    expect(menu).toContain('class="mgv-tan">Harper Ellis<');
    expect(menu).toContain('class="mgv-tainit">HE<');
    expect(menu).not.toMatch(/skill/i);
    expect(menu).not.toMatch(/[79]/);
  });

  // The Teams & payment list's dashed row was a name-only appPrompt. It opens the real screen now, and the
  // prompt is gone rather than left behind as a second, weaker way to do the same thing.
  it('the Teams and payment list opens this screen, and the name-only prompt is retired', () => {
    seedHub(bridge, { status: 'setup', registration_open: false, name: 'A' }, { teams: [] });
    const list = bridge.buildMgTeams();
    expect(list).toContain('class="pk-add" data-mgt-view="teamadd"');
    expect(list).toContain('Add a team yourself');
    expect(list).not.toContain('data-mgtp-add');
    expect(appSrc).not.toContain('mgTeamAddPrompt');
  });

  // The 15s poll repaints the Manage container. Anything unsaved sitting in it must survive — and on this
  // screen that includes the Marked-paid SWITCH, the one control that holds a decision without holding
  // text. A repaint rebuilds it at aria-checked="false", so before fix round 1 flipping it on and pausing
  // silently un-marked the team as paid with nothing on screen to say so.
  it('the poll guard: typed text, the caret, or the paid switch all count as unsaved work', () => {
    bridge.setMgtView('teams');
    installTeamAddPanel(['Dig Deep', 'Harper Ellis'], false, false);
    expect(bridge.teamAddDirty()).toBe(false);        // wrong view: nothing to protect
    bridge.setMgtView('teamadd');
    installTeamAddPanel(['', '', '', ''], false, false);
    expect(bridge.teamAddDirty()).toBe(false);        // untouched form: the poll may repaint
    installTeamAddPanel(['', 'Harper Ellis', '', ''], false, false);
    expect(bridge.teamAddDirty()).toBe(true);         // typed but unfocused still blocks it
    installTeamAddPanel(['', '', '', ''], true, false);
    expect(bridge.teamAddDirty()).toBe(true);         // the caret alone blocks it
    installTeamAddPanel(['', '', '', ''], false, true);
    expect(bridge.teamAddDirty()).toBe(true);         // Marked paid ON with nothing typed: still unsaved
  });

  // The WIRING, driven rather than grepped: partialRender rebuilds the Manage container on a clean form
  // and bails (sync notice only) on a dirty one.
  it('the background poll repaints a clean Add a team screen and bails on a dirty one', () => {
    seedHub(bridge, { id: 'T', status: 'setup', registration_open: false, name: 'A', team_size: 4 });
    bridge.setMgtView('teamadd');
    const prevTab = bridge.tabNow();
    const container = mkEl({ tagName: 'DIV', innerHTML: 'STALE' });
    const notice = mkEl({ tagName: 'DIV' });
    const rootEl = mkEl({ tagName: 'DIV', hasChildNodes: () => true });
    let fields = [];
    const sw = mkEl({ tagName: 'BUTTON', attrs: { 'aria-checked': 'false' } });
    const panel = {
      scrollTop: 0,
      contains: (n) => fields.indexOf(n) >= 0,
      querySelectorAll: () => fields.slice(),
      querySelector: (sel) => (sel === '.container' ? container
        : (sel === '[data-mgta-paid][aria-checked="true"]'
          ? (sw.getAttribute('aria-checked') === 'true' ? sw : null) : null)),
    };
    bridge.doc.getElementById = (id) => (id === 'root' ? rootEl
      : (id === 'js-sync-notice' ? notice : (id === 'tab-manage' ? panel : null)));
    bridge.doc.querySelector = () => null;   // no .players — partialRender takes the Manage branch
    bridge.doc.activeElement = null;
    bridge.setBoot(true);
    bridge.setTab('manage');
    try {
      fields = [mkEl({ value: '' }), mkEl({ value: '' })];
      bridge.poll();
      expect(container.innerHTML).toContain('class="pd-htitle">Add a team<');   // clean: repainted
      container.innerHTML = 'STALE';
      fields = [mkEl({ value: 'Dig Deep' }), mkEl({ value: '' })];
      bridge.poll();
      expect(container.innerHTML).toBe('STALE');                                 // typed: bailed
      fields = [mkEl({ value: '' }), mkEl({ value: '' })];
      sw.setAttribute('aria-checked', 'true');
      bridge.poll();
      expect(container.innerHTML).toBe('STALE');                                 // the switch alone bails
    } finally {
      bridge.setBoot(false);
      bridge.setTab(prevTab);
    }
  });

  it('submit: the team, then its roster, then the paid flag, then back to Teams and payment', async () => {
    seedHub(bridge, { id: 'T', status: 'setup', registration_open: false, name: 'A', team_size: 4 });
    bridge.setMgtView('teamadd');
    const calls = bridge.mockTeamAdd({});
    const form = installTeamAddForm({ name: '  Dig Deep  ', roster: ['Harper Ellis', '', ' Sam Reed '], paid: true });
    await bridge.teamAddSubmit();
    expect(Array.from(calls, (c) => c[0])).toEqual(['add', 'roster', 'paid', 'refresh', 'repaint']);
    expect(calls[0][1]).toBe('T');
    expect(calls[0][2]).toBe('Dig Deep');             // trimmed before it reaches the write
    expect(calls[1][1]).toBe('newteam');
    expect(Array.from(calls[1][2])).toEqual(['Harper Ellis', 'Sam Reed']);   // blanks dropped, names trimmed
    expect(calls[2][2]).toBe(true);
    expect(bridge.mgtViewNow()).toBe('teams');
    expect(form.status.textContent).toBe('Adding…');
  });

  it('submit: an empty name writes nothing and says so', async () => {
    seedHub(bridge, { id: 'T', status: 'setup', registration_open: false, name: 'A', team_size: 4 });
    bridge.setMgtView('teamadd');
    const calls = bridge.mockTeamAdd({});
    const form = installTeamAddForm({ name: '   ', roster: ['Harper Ellis'], paid: true });
    await bridge.teamAddSubmit();
    expect(calls.length).toBe(0);
    expect(form.status.textContent).toBe('Give the team a name first.');
    expect(bridge.mgtViewNow()).toBe('teamadd');
  });

  // tdbAddTeam throws its own player-readable line on a duplicate name (the data-layer guard). It is shown
  // verbatim: a generic "could not add" would hide the one fact that tells the organizer what to do.
  it('submit: a duplicate name surfaces the write helper own message and stops', async () => {
    seedHub(bridge, { id: 'T', status: 'setup', registration_open: false, name: 'A', team_size: 4 });
    bridge.setMgtView('teamadd');
    const calls = bridge.mockTeamAdd({ add: () => { throw new Error('A team named "Dig Deep" is already in this tournament.'); } });
    const form = installTeamAddForm({ name: 'Dig Deep', roster: ['Harper Ellis'], paid: true });
    await bridge.teamAddSubmit();
    expect(Array.from(calls, (c) => c[0])).toEqual(['add']);
    expect(form.status.textContent).toBe('A team named "Dig Deep" is already in this tournament.');
    expect(bridge.mgtViewNow()).toBe('teamadd');
    expect(form.name.value).toBe('Dig Deep');          // the form is left filled
  });

  it('submit: a silent insert (no row back) never claims success', async () => {
    seedHub(bridge, { id: 'T', status: 'setup', registration_open: false, name: 'A', team_size: 4 });
    bridge.setMgtView('teamadd');
    const calls = bridge.mockTeamAdd({ add: () => null });
    const form = installTeamAddForm({ name: 'Dig Deep', roster: [], paid: false });
    await bridge.teamAddSubmit();
    expect(Array.from(calls, (c) => c[0])).toEqual(['add']);
    expect(form.status.textContent).toBe('That did not save. Check you are signed in as an admin, then try again.');
    expect(bridge.mgtViewNow()).toBe('teamadd');
  });

  // A failure AFTER the insert is not a failed add: the team is in. The line says so, the form stays put,
  // and the collections are refreshed so the new team is visible under Teams & payment.
  it('submit: a roster failure says the team is in and refreshes anyway', async () => {
    seedHub(bridge, { id: 'T', status: 'setup', registration_open: false, name: 'A', team_size: 4 });
    bridge.setMgtView('teamadd');
    const calls = bridge.mockTeamAdd({ roster: () => { throw new Error('sync_team_roster failed'); } });
    const form = installTeamAddForm({ name: 'Dig Deep', roster: ['Harper Ellis'], paid: true });
    await bridge.teamAddSubmit();
    expect(Array.from(calls, (c) => c[0])).toEqual(['add', 'roster', 'refresh']);
    expect(form.status.textContent).toBe('The team is in, but its roster did not save. Open it under Teams & payment to add the names.');
    expect(bridge.mgtViewNow()).toBe('teamadd');
    expect(form.name.value).toBe('Dig Deep');
  });

  it('submit: a paid failure says the team is in and refreshes anyway', async () => {
    seedHub(bridge, { id: 'T', status: 'setup', registration_open: false, name: 'A', team_size: 4 });
    bridge.setMgtView('teamadd');
    const calls = bridge.mockTeamAdd({ paid: () => { throw new Error('rls'); } });
    const form = installTeamAddForm({ name: 'Dig Deep', roster: ['Harper Ellis'], paid: true });
    await bridge.teamAddSubmit();
    expect(Array.from(calls, (c) => c[0])).toEqual(['add', 'roster', 'paid', 'refresh']);
    expect(form.status.textContent).toBe('The team is in, but it could not be marked paid. Open it under Teams & payment.');
    expect(bridge.mgtViewNow()).toBe('teamadd');
  });

  it('submit: no names typed skips the roster write, the switch off skips the paid write', async () => {
    seedHub(bridge, { id: 'T', status: 'setup', registration_open: false, name: 'A', team_size: 4 });
    bridge.setMgtView('teamadd');
    const calls = bridge.mockTeamAdd({});
    installTeamAddForm({ name: 'Solo', roster: ['', '   '], paid: false });
    await bridge.teamAddSubmit();
    expect(Array.from(calls, (c) => c[0])).toEqual(['add', 'refresh', 'repaint']);
    expect(bridge.mgtViewNow()).toBe('teams');
  });

  // The switch is LOCAL until submit — no team exists yet, so there is nothing to write to. Driven through
  // a real element: aria-checked flips both ways, .on follows it, and no tdb* write is issued.
  it('the paid switch flips in place and never writes on tap', () => {
    seedHub(bridge, { id: 'T', status: 'setup', registration_open: false, name: 'A', team_size: 4 });
    bridge.setMgtView('teamadd');
    const calls = bridge.mockTeamAdd({});
    const sw = mkEl({ tagName: 'BUTTON', attrs: { 'aria-checked': 'false' } });
    bridge.togglePaid(sw);
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(sw.classes.has('on')).toBe(true);
    bridge.togglePaid(sw);
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(sw.classes.has('on')).toBe(false);
    expect(calls.length).toBe(0);                     // a tap writes NOTHING: no team exists yet
    expect(() => bridge.togglePaid(null)).not.toThrow();
  });


  // Fix round 1, IMPORTANT 1: tdbAddTeam's duplicate-name check is a SELECT and then an INSERT, not one
  // atomic statement, so two overlapping submits both read "no team by that name" and both insert. A
  // double tap on a slow connection created the team twice. The insert is gated now, and the CTA greys.
  it('submit: a double tap on Add team inserts the team once', async () => {
    seedHub(bridge, { id: 'T', status: 'setup', registration_open: false, name: 'A', team_size: 4 });
    bridge.setMgtView('teamadd');
    let release;
    const gate = new Promise((r) => { release = r; });          // hold the insert open across both taps
    const calls = bridge.mockTeamAdd({ add: () => gate.then(() => ({ id: 'newteam', name: 'Dig Deep' })) });
    const form = installTeamAddForm({ name: 'Dig Deep', roster: [], paid: false });
    const first = bridge.teamAddSubmit();
    expect(form.save.disabled).toBe(true);            // the CTA greys the moment the insert goes out
    const second = bridge.teamAddSubmit();            // the double tap
    release();
    await Promise.all([first, second]);
    expect(Array.from(calls, (c) => c[0])).toEqual(['add', 'refresh', 'repaint']);   // exactly ONE add
    expect(form.save.disabled).toBe(false);           // and comes back however the path ended
    expect(bridge.mgtViewNow()).toBe('teams');
  });

  // A failed insert must leave the button usable — the organizer's next act is to retype and try again.
  it('submit: the CTA comes back after a failed insert', async () => {
    seedHub(bridge, { id: 'T', status: 'setup', registration_open: false, name: 'A', team_size: 4 });
    bridge.setMgtView('teamadd');
    bridge.mockTeamAdd({ add: () => { throw new Error('A team named "Dig Deep" is already in this tournament.'); } });
    const form = installTeamAddForm({ name: 'Dig Deep', roster: [], paid: false });
    await bridge.teamAddSubmit();
    expect(form.save.disabled).toBe(false);
    expect(form.status.textContent).toBe('A team named "Dig Deep" is already in this tournament.');
  });

  // Fix round 1, SMALL: both guard branches used to return in silence, which reads as a dead button.
  it('submit: the guard branches say why instead of doing nothing', async () => {
    seedHub(bridge, { id: 'T', status: 'setup', registration_open: false, name: 'A', team_size: 4 });
    bridge.setMgtView('teamadd');
    const calls = bridge.mockTeamAdd({});
    const st = bridge.getState();
    st.isAdmin = false;
    let form = installTeamAddForm({ name: 'Dig Deep', roster: [], paid: false });
    await bridge.teamAddSubmit();
    expect(form.status.textContent).toBe('Sign in as an admin to add a team.');
    st.isAdmin = true;
    st.tournaments = []; st.activeTournamentId = null;
    form = installTeamAddForm({ name: 'Dig Deep', roster: [], paid: false });
    await bridge.teamAddSubmit();
    expect(form.status.textContent).toBe('No tournament is selected.');
    expect(calls.length).toBe(0);
  });

  it('the Add a team CSS ships', () => {
    ['.mgv-taform {', '.mgv-tarow {', '.mgv-tamenu {', '.mgv-taitem {', '.mgv-tainit {', '.mgv-tab {', '.mgv-tan {', '.mgv-tapay {']
      .forEach((sel) => expect(css).toContain(sel));
    // ported ONCE — a second copy would mean the block was appended twice
    expect(count(css, '.mgv-taform {')).toBe(1);
    expect(count(css, '.mgv-tamenu {')).toBe(1);
    expect(css).toContain('Round 2026-08-05 - organizer "Add a team"');
  });
});

// ── Task 6: Event settings (screen 39, mgts-settings) ─────────────────────────────────────────────────
// Mike on the shipped screen: "this entire page looks awful, fix it." It was eleven bare underlined inputs
// in one wall — shouting caps labels, "POOL TO" and "POOL CAP" with no hint of what either means, and two
// switches wedged into a field row. Nothing on it said what a setting DOES.
// Now: four named groups on cards, one row per setting, every row a plain label with a sentence under it,
// the live venue columns given a group of their own (the design handoff forgot them), and the scoring
// knobs restated as the one line players read on a score card. Every input id and every save hook is
// byte-identical — the save engine, the input delegate, the focusout safety net and the toggle handler all
// key on them, so restyling the page must not move a single one of them.
describe('Task 6 Event settings', () => {
  it('settingsRuleSummary', () => {
    const s = bridge.ruleSummary;
    expect(s({ pool_target: 15, pool_cap: 20, bracket_target: 21, bracket_cap: 25, win_by_2: true })).toBe('Pool to 15, cap 20 · bracket to 21, cap 25 · win by 2.');
    expect(s({ pool_target: 15, pool_cap: null, bracket_target: 21, bracket_cap: null, win_by_2: false })).toBe('Pool to 15 · bracket to 21.');
  });

  it('settings: four cards, every id kept, Where guarded, Saved at rest, the true intro', () => {
    seedHub(bridge, { status: 'setup', name: 'A', team_size: 4, net_count: 3, pool_target: 15, pool_cap: 20, bracket_target: 21, bracket_cap: 25, win_by_2: true, buy_in: '$80 a team', venue: 'P', venue_address: 'Q' });
    const html = bridge.buildSettings();
    for (const h of ['The basics', 'Scoring', 'Where', 'Money']) expect(html).toContain(`>${h}<`);
    for (const id of ['mges-name', 'mges-teamsize', 'mges-nets', 'mges-pooltarget', 'mges-poolcap', 'mges-brackettarget', 'mges-bracketcap', 'mges-buyin', 'mges-venue', 'mges-venueaddr']) expect(html).toContain(`id="${id}"`);
    expect(html).toContain('Scoring here sets the rule line on every score card.');
    expect(html).toContain('class="set-sum">Pool to 15, cap 20 · bracket to 21, cap 25 · win by 2.<');
    expect(html).toContain('id="mges-status" role="status" aria-live="polite">Saved<');
    expect(html).toContain('data-mges-toggle="win_by_2"');
    expect(html).not.toContain('mges-half');
  });

  it('every row carries its sentence, the switches keep their shipped markup, and the copy holds the line', () => {
    seedHub(bridge, { status: 'setup', name: 'A', team_size: 4, net_count: 3, pool_target: 15, pool_cap: 20, bracket_target: 21, bracket_cap: 25, win_by_2: true, grand_final_reset: false, buy_in: '$80 a team', venue: 'P', venue_address: 'Q' });
    const html = bridge.buildSettings();
    // one sentence per row: ten settings on this screen once the venue columns are loaded
    expect(count(html, 'class="set-h"')).toBe(10);
    expect(count(html, 'class="set-row')).toBe(10);
    expect(count(html, 'class="set-card"')).toBe(4);
    ['What players see on the front page', 'Players per side on the court', 'Courts you have for the day',
      'First to the target, capped so a close game ends', 'A game ends on a two-point lead',
      'The losers-bracket team gets a second championship game', 'The park players see on the front page',
      'What Copy address puts on their clipboard', 'Per team, as free text']
      .forEach((s) => expect(html).toContain(s));
    // the two switches are the SAME element the toggle handler has always found (tap-to-apply, 2026-08-04)
    expect(html).toContain('<button type="button" class="mg-sw on" data-mges-toggle="win_by_2" role="switch" aria-checked="true" aria-label="Win by 2"></button>');
    expect(html).toContain('<button type="button" class="mg-sw" data-mges-toggle="grand_final_reset" role="switch" aria-checked="false" aria-label="Grand final reset"></button>');
    expect(html).toContain('Grand final reset<'); // the design's own label, kept
    expect(html).toContain('>Tournament name<'); // the design's label (mgts-settings.html:40) and production's
    // the four paired scoring fields show only a two-letter chip, so each carries its own accessible name —
    // without it a screen reader reads "to", "cap", "to", "cap" and never says which game they belong to
    ['Pool to', 'Pool cap', 'Bracket to', 'Bracket cap'].forEach((n) => expect(count(html, `aria-label="${n}"`)).toBe(1));
    // the Save hook the edit engine resolves, once, inside the foot
    expect(count(html, 'data-mg-save="settings"')).toBe(1);
    expect(html).toContain('<div class="set-foot">');
    expect(html).not.toMatch(/—|&mdash;/); // §51 copy law
  });

  it('the Where group is gated on the loaded columns, and the summary follows the knobs', () => {
    seedHub(bridge, { status: 'setup', name: 'A', pool_target: 15, pool_cap: null, bracket_target: 21, bracket_cap: null, win_by_2: false });
    const st = bridge.getState();
    st.tournaments = [{ id: 'T', name: 'A', status: 'setup', pool_target: 15, pool_cap: null, bracket_target: 21, bracket_cap: null, win_by_2: false }];
    const html = bridge.buildSettings();
    expect(html).not.toContain('>Where<');
    expect(html).not.toContain('id="mges-venue"');
    expect(count(html, 'class="set-card"')).toBe(3);
    expect(html).toContain('class="set-sum">Pool to 15 · bracket to 21.<');
  });

  it('a tournament carrying no scoring targets prints no summary line at all', () => {
    seedHub(bridge, { status: 'setup', name: 'A' });
    const st = bridge.getState();
    st.tournaments = [{ id: 'T', name: 'A', status: 'setup', win_by_2: false }];
    // the helper returns '' — an empty <p class="set-sum"> would leave a gap advertising a sentence that
    // is not there, so the element goes with it
    expect(bridge.ruleSummary(st.tournaments[0])).toBe('');
    expect(bridge.buildSettings()).not.toContain('set-sum');
  });

  it('the Event settings CSS ships, authored to beat prod input[type=...]', () => {
    ['.set-intro {', '.set-card {', '.set-row {', '.set-l {', '.set-h {', '.set-ctl {', '.set-pair {',
      '.set-mini {', 'input.set-in {', 'input.set-num {', 'input.set-wide {', 'input.set-money {',
      '.set-u {', '.set-sum {', '.set-foot {'].forEach((sel) => expect(css).toContain(sel));
    expect(count(css, 'input.set-in {')).toBe(1);      // ported ONCE
    expect(css).toContain('input.set-in:focus');       // the accent ring survives the port
    // prod's input[type=...] block declares flex:1/min-width:0, so the port has to say the opposite out loud
    expect(count(css, 'flex: none;\n  min-width: auto;')).toBe(4);
    expect(css).toMatch(/input\.set-in \{[^}]*font:[^;]*16px/);  // iOS zoom guard, not the design's 15px
    expect(css).toContain('Round 2026-08-24 — "this entire page looks awful, fix it"');
    expect(css).not.toMatch(/\.set-(in|num|money|wide)[^{]*\{[^}]*!important/);
  });
});

// ── Task 7: the Rules sheet as cards ──────────────────────────────────────────────────────────────────
// Mike's banner on the handoff was "this page needs help, make it look like its editable". Spec decision 2
// takes the card LOOK with ONE editor: a card per section, an Edit pill that opens the existing full-screen
// editor AT that section, "Edit all" in the header, "+ Add a section" at the end. Deliberately NOT ported:
// the design's inline field editing — it never saved, and its serializer rewrote numbered lists as bullets.
describe('Task 7 rules cards', () => {
  it('rulesToSections mirrors rulesToHTML grouping and carries offsets', () => {
    const md = '## Format\n- 4s co-ed\n\nWoodmen Valley Park · $80 a team';
    const s = bridge.rulesSections(md);
    expect(s.length).toBe(2);
    expect(s[0].head).toBe('Format'); expect(s[0].startOffset).toBe(0);
    expect(s[1].head).toBe(''); expect(s[1].startOffset).toBe(md.indexOf('Woodmen'));
    expect(s[0].bodyHTML).toContain('rl-li');
  });

  it('the rules view: a card per section, Edit pills, Edit all, Add a section, no inline inputs', () => {
    seedHub(bridge, { status: 'setup', name: 'A', rules: '## Format\n- 4s\n\n## Between games\n1. Winners stay\n\nBring cash' });
    const html = bridge.buildRules();
    expect(count(html, 'class="rlv-card')).toBe(3);
    expect(count(html, 'data-rlv-edit=')).toBe(3);
    expect(html).toContain('class="rlv-card is-note"');
    expect(html).toContain('data-mgru-edit>');
    expect(html).toContain('Edit all');
    expect(html).toContain('data-rlv-add');
    expect(html).toContain('Every section here is yours to edit. Tap one to change its wording or bullets.');
    expect(html).not.toContain('<input');
    expect(html).not.toMatch(/—|&mdash;/);
    expect(html).toContain('rl-num');
  });

  it("each Edit pill carries its own section's offset, and the head is drawn once", () => {
    const rules = '## Format\n- 4s\n\n## Between games\n1. Winners stay\n\nBring cash';
    seedHub(bridge, { status: 'setup', name: 'A', rules });
    const html = bridge.buildRules();
    // the offsets are the REAL character positions in the stored text, so the caret lands on the section
    [0, rules.indexOf('## Between games'), rules.indexOf('Bring cash')]
      .forEach((off) => expect(html).toContain(`data-rlv-edit="${off}"`));
    // "Format" appears in the card head and nowhere else — the "## " line is lifted out of the body
    expect(count(html, '>Format<')).toBe(1);
    expect(count(html, 'class="rl-h"')).toBe(2);   // two headed sections; the note card has no head
    expect(html).toContain('class="rlv-lines rl-body"');
    expect(html).toContain('class="rlv-foot">Saved changes show up on the players\' Rules page straight away.<');
  });

  it('the view stays read-only markup: no textarea, no second serializer, no inline field kit', () => {
    seedHub(bridge, { status: 'setup', name: 'A', rules: '## Format\n- 4s' });
    const html = bridge.buildRules();
    expect(html).not.toContain('<textarea');
    expect(html).not.toMatch(/rlv-tin\b/);
    expect(html).not.toMatch(/rlv-lin\b/);   // the \b so the ported .rlv-lines never reads as .rlv-lin
    expect(html).not.toContain('contenteditable');
    expect(bridge.rulesDirty()).toBe(false);   // nothing on the panel for a background poll to clobber
  });

  it('escapes the section head — a rules column can never inject markup into a card', () => {
    seedHub(bridge, { status: 'setup', name: 'A', rules: '## Heads up <script>alert(1)</script>\n- be cool' });
    const html = bridge.buildRules();
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(count(html, '&lt;script&gt;')).toBe(1);
  });

  it('empty rules: the honest prompt lives inside one card, with a Write pill that seeds a section', () => {
    seedHub(bridge, { status: 'setup', name: 'A', rules: null });
    const html = bridge.buildRules();
    expect(html).toContain('mgru-empty');
    expect(html).toContain('No rules yet');
    expect(html).toContain('data-mgru-edit');    // the block itself still opens the editor
    expect(count(html, 'class="rlv-card')).toBe(1);
    expect(html).toContain('data-rlv-add');
    expect(html).not.toContain('data-rlv-edit=');
    expect(html).not.toContain('undefined');
  });

  it('the rules-card CSS ships, with the iOS font-size guard countered on every pill', () => {
    ['.rlv-intro {\n', '.rlv-card {\n', '.rlv-hd {\n', '\n.rlv-lines {', '.rlv-add {\n', '.rlv-plus {', '.rlv-foot {']
      .forEach((sel) => expect(count(css, sel)).toBe(1));
    // fix round 1 — the two rules that looked right in the mockup and did nothing against production:
    // prod's .rl-h keeps a padding-bottom the round never reset, and prod's .rl-p/.rl-li set their own
    // colour, so a container-level colour can never reach them
    expect(count(css, '.rlv-hd .rl-h { flex: 1; min-width: 0; margin: 0; padding: 0; border: 0; }')).toBe(1);
    expect(count(css, '.rlv-card.is-note .rlv-lines .rl-p,\n.rlv-card.is-note .rlv-lines .rl-li { color: var(--muted); }')).toBe(1);
    expect(css).not.toContain('.rl-h::after');   // production has no ::after to cancel
    expect(css).toContain('.rlv-card.is-note .rlv-hd { justify-content: flex-end; }'); // a headless card
    // prod ships button { font-size: 16px !important } as an iOS zoom guard, so each pill says its size back
    expect(css).toContain('.rlv-add { min-height: 46px; height: 46px; font-size: 13.5px !important; }');
    expect(css).toMatch(/\.rlv-edit,\n\.rlv-hedit \{ min-height: 30px; height: 30px; font-size: 12px !important; \}/);
    // the whole-sheet text cursor is gone with the whole-sheet tap target
    expect(css).toContain('.mgru-view { cursor: default; }');
    expect(css).not.toContain('.mgru-view { cursor: text; }');
    // the inline-editing kit is NOT ported — no RULE may reference it (a PORT NOTE names what it bans, so
    // the comments come out first; §41 lesson, 2026-08-24)
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');
    [/\.rlv-tin\b/, /\.rlv-lin\b/, /\.rlv-more\b/, /\.rlv-card\.is-new\b/].forEach((re) => expect(rules).not.toMatch(re));
  });
});

// The one editor, opened at a section. openManageEditor mounts on document.body through createElement, so
// the shared harness stub (querySelector → null) cannot see the textarea. This installs the smallest
// element stub that can: it builds its textarea's value out of the markup openManageEditor writes, which is
// exactly what a browser does, so the append maths is driven for real rather than simulated.
function withEditorDOM(fn) {
  const doc = bridge.doc;
  const realCreate = doc.createElement;
  const noop = () => {};
  // `carets` records every setSelectionRange the editor performs, so a test can prove WHERE it opened.
  const ta = {
    value: '', scrollTop: 0, clientHeight: 0, carets: [],
    focus: noop, blur: noop,
    setSelectionRange: (a) => { ta.carets.push(a); },
  };
  const unesc = (v) => String(v).replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  const el = {
    id: '', className: '', style: {}, dataset: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    appendChild: noop, remove: noop, addEventListener: noop,
    set innerHTML(html) {
      const m = String(html).match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/);
      ta.value = m ? unesc(m[1]) : '';
    },
    get innerHTML() { return ''; },
    querySelector: (sel) => (sel === '#mged-ta' ? ta : { addEventListener: noop }),
  };
  doc.createElement = () => el;
  // run the 60ms focus timeout inline, so the caret path is DRIVEN rather than skipped
  const realTimeout = bridge.swapTimeout((cb) => { cb(); return 0; });
  try { return fn(ta); } finally { doc.createElement = realCreate; bridge.swapTimeout(realTimeout); }
}

// The REAL click delegate, captured off the #app-content element attachHandlers binds it to. Driving it
// with a synthetic event is what proves a tap reaches the editor with the right caret and that the hooks
// are checked in the right order — a grep of app.js proves neither.
function withDelegate(fn) {
  const doc = bridge.doc;
  const realGet = doc.getElementById;
  const noop = () => {};
  let handler = null;
  const appContent = {
    dataset: {}, style: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    addEventListener: (type, cb) => { if (type === 'click') handler = cb; },
    removeEventListener: noop,
    querySelector: () => null, querySelectorAll: () => ({ forEach: noop, length: 0 }),
  };
  doc.getElementById = (id) => (id === 'app-content' ? appContent : null);
  // the later bindings in attachHandlers want DOM this harness does not have; the click delegate is bound
  // first, so it is already captured by the time any of them complain
  try { bridge.attachHandlers(); } catch (_) { /* nothing after the delegate matters here */ }
  finally { doc.getElementById = realGet; }
  if (!handler) throw new Error('the #app-content click delegate was never bound');
  // One synthetic tap. `attrs` is every hook the tapped node sits under, so a control nested inside
  // another hook's block (the empty state's Write pill) can be reproduced exactly.
  const tap = (attrs, value) => {
    const list = Array.isArray(attrs) ? attrs : [attrs];
    const target = {
      tagName: 'BUTTON', dataset: {},
      classList: { contains: () => false },
      closest: (sel) => (list.some((a) => sel === '[' + a + ']')
        ? { getAttribute: (name) => (list.includes(name) ? (value == null ? '' : value) : null), dataset: {} }
        : null),
    };
    return handler({ target, preventDefault: noop, stopPropagation: noop });
  };
  return fn(tap);
}

describe('Task 7 the one editor, opened at a section', () => {
  it('Add a section appends the scaffold to a written document, keeping what is already there', () => {
    seedHub(bridge, { status: 'setup', name: 'A', rules: '## Format\n- 4s\n' });
    withEditorDOM((ta) => {
      bridge.openEditor('rules', { append: '\n\n## New section\n- ' });
      expect(ta.value).toBe('## Format\n- 4s\n\n## New section\n- ');
    });
  });

  it('Add a section on an EMPTY document opens with the scaffold alone, not two blank lines above it', () => {
    seedHub(bridge, { status: 'setup', name: 'A', rules: '' });
    withEditorDOM((ta) => {
      bridge.openEditor('rules', { append: '\n\n## New section\n- ' });
      expect(ta.value).toBe('## New section\n- ');
    });
    seedHub(bridge, { status: 'setup', name: 'A', rules: '   \n\n ' });
    withEditorDOM((ta) => {
      bridge.openEditor('rules', { append: '\n\n## New section\n- ' });
      expect(ta.value).toBe('## New section\n- ');
    });
  });

  it('an Edit pill opens the SAME document untouched — a caret is not an edit', () => {
    const rules = '## Format\n- 4s\n\n## Between games\n1. Winners stay';
    seedHub(bridge, { status: 'setup', name: 'A', rules });
    withEditorDOM((ta) => {
      bridge.openEditor('rules', { caret: rules.indexOf('## Between games') });
      expect(ta.value).toBe(rules);
    });
  });

  it('the existing one-argument callers are untouched: the document opens exactly as stored', () => {
    seedHub(bridge, { status: 'setup', name: 'A', rules: '## Format\n- 4s\n' });
    withEditorDOM((ta) => {
      bridge.openEditor('rules');
      expect(ta.value).toBe('## Format\n- 4s\n');
    });
  });

  // fix round 1: this used to grep app.js for the delegate's source. A substring proves nothing about what
  // a tap DOES, so every case below drives the captured delegate instead.
  it('a section Edit pill opens the editor at ITS offset', () => {
    const rules = '## Format\n- 4s\n\n## Between games\n1. Winners stay';
    seedHub(bridge, { status: 'setup', name: 'A', rules });
    bridge.setMgtView('rules');
    const off = rules.indexOf('## Between games');
    const seen = withDelegate((tap) => withEditorDOM((ta) => {
      tap('data-rlv-edit', String(off));
      return { value: ta.value, carets: ta.carets.slice() };
    }));
    expect(seen.value).toBe(rules);       // a caret is not an edit
    expect(seen.carets).toEqual([off]);
  });

  it('a non-numeric offset falls back to the top of the document rather than NaN', () => {
    seedHub(bridge, { status: 'setup', name: 'A', rules: '## Format\n- 4s' });
    bridge.setMgtView('rules');
    const carets = withDelegate((tap) => withEditorDOM((ta) => {
      tap('data-rlv-edit', 'nonsense');
      return ta.carets.slice();
    }));
    expect(carets).toEqual([0]);
  });

  it('an Add-a-section tap appends the scaffold through the delegate', () => {
    seedHub(bridge, { status: 'setup', name: 'A', rules: '## Format\n- 4s\n' });
    bridge.setMgtView('rules');
    const seen = withDelegate((tap) => withEditorDOM((ta) => {
      tap('data-rlv-add');
      return { value: ta.value, carets: ta.carets.slice() };
    }));
    expect(seen.value).toBe('## Format\n- 4s\n\n## New section\n- ');
    expect(seen.carets).toEqual([seen.value.length]);   // caret waiting after the new bullet
  });

  it('the check order holds: the empty state Write pill seeds a section, it does not open blank', () => {
    // the Write pill sits INSIDE the .mgru-empty block, so a real tap matches both hooks at once. If
    // [data-mgru-edit] were checked first, the pill would silently become a second plain Edit.
    seedHub(bridge, { status: 'setup', name: 'A', rules: '' });
    bridge.setMgtView('rules');
    const value = withDelegate((tap) => withEditorDOM((ta) => {
      tap(['data-rlv-add', 'data-mgru-edit']);
      return ta.value;
    }));
    expect(value).toBe('## New section\n- ');
  });

  it('the header Edit all still opens the whole document with the caret at the end', () => {
    seedHub(bridge, { status: 'setup', name: 'A', rules: '## Format\n- 4s' });
    bridge.setMgtView('rules');
    const seen = withDelegate((tap) => withEditorDOM((ta) => {
      tap('data-mgru-edit');
      return { value: ta.value, carets: ta.carets.slice() };
    }));
    expect(seen.value).toBe('## Format\n- 4s');
    expect(seen.carets).toEqual([seen.value.length]);   // no options at all: the 2026-07-12 behaviour
  });
});

// ── Task 8: Pool controls ─────────────────────────────────────────────────────────────────────────────
// The open panel is a card per pool now. Three things in it are load-bearing and none is cosmetic:
//   1. a team MOVES ONLY BEFORE ITS POOL HAS PLAYED (Mike, spec decision 3) — tdbMoveTeamToPool writes
//      teams.pool_id and nothing else, so a team with finished games would leave them behind and drop out
//      of the new pool's standings. The design's "Scores follow the team" was simply false and never ships.
//   2. the inline nets field prefills the PARSED list, never the rendered "Nets 1-3" label — parseInt('1-3')
//      is 1, so saving the label back would silently collapse the pool onto one net.
//   3. the two half-finished actions (a typed field, an open picker) block the 15s poll.
// Every case drives the real builder or the real click delegate; none greps app.js for a substring.
describe('Task 8 pool controls', () => {
  it('a card per pool, Edit nets in the header, Move only before play, reset in the danger block', () => {
    seedPools(bridge, { pools: [{ id: 'p1', label: 'A' }, { id: 'p2', label: 'B' }], matches: [
      { id: 'm1', phase: 'pool', pool_id: 'p1', net: 1, status: 'final', team_a_id: 't1', team_b_id: 't2', score_a: 15, score_b: 9, winner_team_id: 't1', queue_order: 1 },
      { id: 'm2', phase: 'pool', pool_id: 'p2', net: 2, status: 'scheduled', team_a_id: 't3', team_b_id: 't4', queue_order: 1 }] });
    const html = bridge.buildMgPools({ controls: true });
    expect(count(html, 'class="pc-card"')).toBe(2);
    expect(count(html, 'data-pc-editnets=')).toBe(2);
    expect(html).toContain('>Nets 1<');
    expect(html).toMatch(/pc-card"[\s\S]*Pool B[\s\S]*data-pc-move=/);
    expect(html.split('Pool B')[0]).not.toContain('data-pc-move=');   // pool A has a final game: no Move
    // the sharp version of the line above: the pools tab strip also says "Pool B", so slice the CARDS
    const cardA = html.slice(html.indexOf('data-pc-card="p1"'), html.indexOf('data-pc-card="p2"'));
    const cardB = html.slice(html.indexOf('data-pc-card="p2"'));
    expect(cardA).toContain('data-mgps-team="t1"');   // the row is still there, and still opens the sheet
    expect(cardA).not.toContain('data-pc-move=');     // it just cannot be moved any more
    expect(cardA).not.toContain('>Move<');
    expect(count(cardB, 'data-pc-move=')).toBe(2);    // pool B has not played: both its teams can move
    expect(html).toContain('before play starts');
    expect(html).not.toContain('Scores follow the team');
    expect(html).toContain('class="mgv-danger"');
    expect(html).toContain('draws new pools from the registered teams at random');
    expect(html).toContain('data-mgps-reset');
    expect(html).not.toContain('Close controls');
    expect(html).not.toContain('pc-toggle');
    expect(html.slice(html.indexOf('>Pool controls<'))).not.toContain('—');   // copy law: no em dashes
  });

  // Fix round 1 (the controller's ruling): the panel note above the cards is no explanation once you have
  // scrolled to the third pool, so the card that has withheld Move says why on itself.
  it('a pool that has played carries the locked line; a movable one does not', () => {
    seedPools(bridge, { matches: [
      { id: 'm1', phase: 'pool', pool_id: 'p1', net: 1, status: 'final', team_a_id: 't1', team_b_id: 't2', score_a: 15, score_b: 9, winner_team_id: 't1', queue_order: 1 },
      { id: 'm2', phase: 'pool', pool_id: 'p2', net: 2, status: 'scheduled', team_a_id: 't3', team_b_id: 't4', queue_order: 1 }] });
    const html = bridge.buildMgPools({ controls: true });
    const cardA = html.slice(html.indexOf('data-pc-card="p1"'), html.indexOf('data-pc-card="p2"'));
    const cardB = html.slice(html.indexOf('data-pc-card="p2"'));
    expect(cardA).toContain('<span class="pc-lock">Play has started, teams stay put.</span>');
    expect(cardB).not.toContain('pc-lock');
    expect(count(html, 'class="pc-lock"')).toBe(1);
    // nothing final anywhere: neither card claims play has started
    seedPools(bridge, { matches: UNPLAYED });
    expect(bridge.buildMgPools({ controls: true })).not.toContain('pc-lock');
  });

  // Fix round 1: tdbDrawPoolsAtomic clamps to at least one pool, so a 2-3 team event is ONE pool. Move used
  // to render there on `movable` alone while the picker needed another pool to exist — so the tap set
  // mgpMoveTeamId, drew nothing, offered no Cancel, and manageNetsDirty() then bailed every background sync
  // on a live-scoring page until the panel was closed.
  it('a one-pool event offers no Move at all, and never claims play has started to explain it', () => {
    seedPools(bridge, {
      pools: [{ id: 'p1', label: 'A' }],
      teams: [{ id: 't1', name: 'Dink Responsibly', pool_id: 'p1' }, { id: 't2', name: 'Sets and Reps', pool_id: 'p1' }, { id: 't3', name: 'Block Party', pool_id: 'p1' }],
      matches: [{ id: 'a1', phase: 'pool', pool_id: 'p1', net: 1, status: 'scheduled', team_a_id: 't1', team_b_id: 't2', queue_order: 1 }],
    });
    const html = bridge.buildMgPools({ controls: true });
    expect(count(html, 'class="pc-card"')).toBe(1);
    expect(html).toContain('data-mgps-team="t1"');   // the rows are all still there
    expect(html).not.toContain('data-pc-move=');     // there is simply nowhere to move to
    expect(html).not.toContain('pc-lock');           // and nothing has been played, so no lock line either
    // and the dead-end state cannot be reached even if the module var somehow named a team
    const forced = bridge.buildMgPools({ controls: true, moveTeam: 't1' });
    expect(forced).not.toContain('class="pc-pick"');
    expect(forced).not.toContain('data-pc-pick=');
  });

  it('the collapsed row and the drawn-not-started step are untouched by any of it', () => {
    seedPools(bridge, { matches: UNPLAYED });
    const shut = bridge.buildMgPools();
    expect(shut).toContain('data-mgps-controls');
    expect(shut).toContain('Move teams · edit nets · reset pools');
    expect(shut).not.toContain('pc-card');
    // the two-step draw flow shares no markup with the controls any more, and never showed Edit nets
    seedPools(bridge, { tournament: { status: 'setup' }, matches: [] });
    const drawn = bridge.buildMgPools();
    expect(drawn).toContain('Start pool play');
    expect(drawn).toContain('data-mgps-team="t1"');
    expect(drawn).toContain('class="mgps-pteam"');
    expect(drawn).not.toContain('pc-card');
    expect(drawn).not.toContain('Edit nets');
  });

  it('the inline nets field prefills the parsed list, never the label', () => {
    seedPools(bridge, { matches: UNPLAYED });
    const shut = bridge.buildMgPools({ controls: true });
    expect(shut).toContain('>Nets 1-3<');                     // formatNetList, plain hyphen
    const open = bridge.buildMgPools({ controls: true, netsEdit: 'p1' });
    expect(open).toContain('value="1, 2, 3"');                // the PARSED list, so parseInt never sees 1-3
    expect(open).not.toMatch(/value="[^"]*1-3/);
    expect(open).toContain('id="pc-nin-p1"');
    expect(open).toContain('data-pc-savenets="p1"');
    expect(open).toContain('Re-assigns its unplayed games.');
    expect(count(open, 'data-pc-editnets=')).toBe(1);         // pool B still offers its own
    expect(open).not.toContain('>Nets 1-3<');                 // the label is GONE while the field is open
  });

  it('the move picker offers the other pools, never its own, and names the team it is moving', () => {
    seedPools(bridge, { matches: UNPLAYED });
    const open = bridge.buildMgPools({ controls: true, moveTeam: 't1' });
    expect(open).toContain('class="pc-pick"');
    expect(open).toContain('Move <b>Dink Responsibly</b> to');
    expect(open).toContain('data-pc-pick="t1:p2"');
    expect(open).not.toContain('data-pc-pick="t1:p1"');
    expect(open).toContain('data-pc-cancel');
    expect(count(open, 'class="pc-pick"')).toBe(1);           // one picker at a time
    // a team in a pool that HAS played can never have one, even if the module var somehow named it
    seedPools(bridge, { matches: [{ id: 'f1', phase: 'pool', pool_id: 'p1', net: 1, status: 'final', team_a_id: 't1', team_b_id: 't2', score_a: 15, score_b: 9, winner_team_id: 't1', queue_order: 1 }] });
    expect(bridge.buildMgPools({ controls: true, moveTeam: 't1' })).not.toContain('class="pc-pick"');
  });

  it('the delegate: Move opens the picker BEFORE the team sheet, and a pick writes, refreshes, repaints', async () => {
    seedPools(bridge, { matches: UNPLAYED });
    bridge.setMgtView('pools');
    bridge.buildMgPools({ controls: true });
    const { calls, restore } = bridge.mockPoolWrites({});
    try {
      const opened = await withDelegate(async (tap) => {
        // a real tap on the Move label matches BOTH hooks — the label sits inside the row that carries
        // data-mgps-team. If the order were wrong this would also open the team sheet on top of the picker.
        tap(['data-pc-move', 'data-mgps-team'], 't1');
        const was = bridge.moveTeamId();
        tap('data-pc-pick', 't1:p2');
        await new Promise((r) => setTimeout(r, 0));
        return was;
      });
      expect(opened).toBe('t1');
      expect(calls).toEqual([['repaint'], ['move', 't1', 'p2'], ['refresh'], ['repaint']]);
      expect(calls.some((c) => c[0] === 'sheet')).toBe(false);
      expect(bridge.moveTeamId()).toBe(null);
    } finally { restore(); }
  });

  it('the delegate: the team row itself still opens the team sheet, and Cancel closes the picker', () => {
    seedPools(bridge, { matches: UNPLAYED });
    bridge.setMgtView('pools');
    bridge.buildMgPools({ controls: true, moveTeam: 't1' });
    const { calls, restore } = bridge.mockPoolWrites({});
    try {
      withDelegate((tap) => {
        tap('data-mgps-team', 't1');          // the name, not the Move label
        tap('data-pc-cancel');
      });
      expect(calls).toContainEqual(['sheet', 't1']);
      expect(bridge.moveTeamId()).toBe(null);
    } finally { restore(); }
  });

  // Fix round 1: opening a picker is not a reason to throw away a net list typed into another card — that
  // is the same unsaved-work defect the poll guard exists to prevent, reached through a different door.
  it('opening a move picker keeps an open nets field, and Done clears both', () => {
    seedPools(bridge, { matches: UNPLAYED });
    bridge.setMgtView('pools');
    bridge.buildMgPools({ controls: true, netsEdit: 'p1' });
    const { calls, restore } = bridge.mockPoolWrites({});
    try {
      withDelegate((tap) => { tap(['data-pc-move', 'data-mgps-team'], 't3'); });
      expect(bridge.moveTeamId()).toBe('t3');
      expect(bridge.netsEditId()).toBe('p1');     // the typed field survived the unrelated tap
      withDelegate((tap) => { tap('data-mgps-controls'); });   // Done
      expect(bridge.moveTeamId()).toBe(null);
      expect(bridge.netsEditId()).toBe(null);
      expect(calls.length).toBeGreaterThan(0);
    } finally { restore(); }
  });

  it('a refused move says why and leaves the picker open, rather than reporting a move that never happened', async () => {
    seedPools(bridge, { matches: UNPLAYED });
    bridge.setMgtView('pools');
    bridge.buildMgPools({ controls: true, moveTeam: 't1' });
    const { calls, restore } = bridge.mockPoolWrites({ move: () => { throw new Error('The move did not save. Check you are signed in as an admin.'); } });
    try {
      await withDelegate(async (tap) => {
        tap('data-pc-pick', 't1:p2');
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(calls.map((c) => c[0])).toEqual(['move', 'notice']);
      expect(calls).toContainEqual(['notice', 'Could not move the team']);
      expect(bridge.moveTeamId()).toBe('t1');   // still open on the team that did not move
    } finally { restore(); }
  });

  // Fix round 1: the write and the redraw fail for different reasons. A refresh that fails AFTER the move
  // landed must not be reported as a failed move — that notice invites a second tap on a write that worked.
  it('a landed move whose refresh fails is never reported as a failed move', async () => {
    seedPools(bridge, { matches: UNPLAYED });
    bridge.setMgtView('pools');
    bridge.buildMgPools({ controls: true, moveTeam: 't1' });
    const { calls, restore } = bridge.mockPoolWrites({ refresh: () => { throw new Error('Failed to fetch'); } });
    try {
      await withDelegate(async (tap) => {
        tap('data-pc-pick', 't1:p2');
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(calls).toEqual([['move', 't1', 'p2'], ['refresh'], ['notice', 'The team moved']]);
      expect(calls).not.toContainEqual(['notice', 'Could not move the team']);
      expect(bridge.moveTeamId()).toBe(null);   // the picker closed: the move DID happen
    } finally { restore(); }
  });

  it('the delegate: Edit nets opens the field and Save nets writes what was TYPED in it', async () => {
    seedPools(bridge, { matches: UNPLAYED });
    bridge.setMgtView('pools');
    bridge.buildMgPools({ controls: true });
    const { calls, restore } = bridge.mockPoolWrites({});
    const doc = bridge.doc;
    const realGet = doc.getElementById;
    doc.getElementById = (id) => (id === 'pc-nin-p1' ? { value: ' 2, 3 ,' } : null);
    try {
      await withDelegate(async (tap) => {
        tap('data-pc-editnets', 'p1');
        expect(bridge.netsEditId()).toBe('p1');
        tap('data-pc-savenets', 'p1');
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(calls).toEqual([['repaint'], ['nets', 'p1', [2, 3]], ['refresh'], ['repaint']]);
      expect(bridge.netsEditId()).toBe(null);   // the field closed with the save that succeeded
    } finally { restore(); doc.getElementById = realGet; }
  });

  // Fix round 1: the field the repaint just drew is a new element, so the caret has to be put in it one
  // tick later. The sandbox stubs setTimeout to a noop, so the test swaps in an immediate one.
  it('the delegate: Edit nets puts the caret in the field it just opened', () => {
    seedPools(bridge, { matches: UNPLAYED });
    bridge.setMgtView('pools');
    bridge.buildMgPools({ controls: true });
    const { calls, restore } = bridge.mockPoolWrites({});
    const doc = bridge.doc;
    const realGet = doc.getElementById;
    const focused = [];
    doc.getElementById = (id) => (id === 'pc-nin-p1' ? { value: '1, 2, 3', focus: () => focused.push(id) } : null);
    const realTimeout = bridge.swapTimeout((cb) => { cb(); return 0; });
    try {
      withDelegate((tap) => { tap('data-pc-editnets', 'p1'); });
      expect(focused).toEqual(['pc-nin-p1']);
      expect(calls).toContainEqual(['repaint']);   // and the focus happens AFTER the repaint drew it
    } finally { bridge.swapTimeout(realTimeout); restore(); doc.getElementById = realGet; }
  });

  it('a refused nets write says why and brings the field back so the list can be fixed', async () => {
    seedPools(bridge, { matches: UNPLAYED });
    bridge.setMgtView('pools');
    bridge.buildMgPools({ controls: true, netsEdit: 'p1' });
    const { calls, restore } = bridge.mockPoolWrites({ nets: () => { throw new Error('A pool needs at least one net.'); } });
    const doc = bridge.doc;
    const realGet = doc.getElementById;
    doc.getElementById = (id) => (id === 'pc-nin-p1' ? { value: 'nonsense' } : null);
    try {
      await withDelegate(async (tap) => {
        tap('data-pc-savenets', 'p1');
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(calls).toEqual([['nets', 'p1', []], ['repaint'], ['notice', 'Could not update nets']]);
      expect(bridge.netsEditId()).toBe('p1');
    } finally { restore(); doc.getElementById = realGet; }
  });

  // Fix round 1: RLS on teams is a row FILTER, not a RAISE — an UPDATE from a session that has drifted off
  // organizer membership matches zero rows and comes back error: null. Driven against a fake PostgREST
  // chain, because a grep for ".select('id')" proves nothing about what the function DOES with the result.
  it('tdbMoveTeamToPool refuses to report a move that RLS silently dropped', async () => {
    const seen = [];
    let rows = [];
    const undo = bridge.swapSupaFrom((table) => {
      seen.push(['from', table]);
      return { update: (patch) => {
        seen.push(['update', patch]);
        return { eq: (col, val) => {
          seen.push(['eq', col, val]);
          return { select: (cols) => { seen.push(['select', cols]); return Promise.resolve({ data: rows, error: null }); } };
        } };
      } };
    });
    try {
      await expect(bridge.moveTeamToPool('t1', 'p2')).rejects.toThrow('The move did not save. Check you are signed in as an admin.');
      expect(seen).toEqual([['from', 'teams'], ['update', { pool_id: 'p2' }], ['eq', 'id', 't1'], ['select', 'id']]);
      // the row comes back: the same call resolves, with no invented error
      rows = [{ id: 't1' }];
      await expect(bridge.moveTeamToPool('t1', 'p2')).resolves.toBeUndefined();
    } finally { undo(); }
  });

  it('the poll guard: a typed nets field or an open picker is unsaved work', () => {
    seedPools(bridge, { matches: UNPLAYED });
    bridge.buildMgPools({ controls: true });
    expect(bridge.netsDirty()).toBe(false);
    bridge.buildMgPools({ controls: true, netsEdit: 'p1' });
    expect(bridge.netsDirty()).toBe(true);
    bridge.buildMgPools({ controls: true, moveTeam: 't1' });
    expect(bridge.netsDirty()).toBe(true);
    bridge.buildMgPools({ controls: true });
    expect(bridge.netsDirty()).toBe(false);
  });

  // The WIRING, driven rather than grepped: partialRender rebuilds the Manage container with the controls
  // idle and bails (sync notice only) with a nets field open or a picker waiting.
  it('the background poll repaints an idle panel and bails on an open nets field', () => {
    seedPools(bridge, { matches: UNPLAYED });
    const prevTab = bridge.tabNow();
    const container = mkEl({ tagName: 'DIV', innerHTML: 'STALE' });
    const notice = mkEl({ tagName: 'DIV' });
    const rootEl = mkEl({ tagName: 'DIV', hasChildNodes: () => true });
    const panel = { scrollTop: 0, contains: () => false, querySelectorAll: () => [], querySelector: (sel) => (sel === '.container' ? container : null) };
    const doc = bridge.doc;
    const realGet = doc.getElementById;
    const realQuery = doc.querySelector;
    doc.getElementById = (id) => (id === 'root' ? rootEl : (id === 'js-sync-notice' ? notice : (id === 'tab-manage' ? panel : null)));
    doc.querySelector = () => null;   // no .players — partialRender takes the Manage branch
    doc.activeElement = null;
    bridge.setBoot(true);
    bridge.setTab('manage');
    try {
      bridge.buildMgPools({ controls: true });
      bridge.poll();
      expect(container.innerHTML).toContain('class="pc-card"');   // idle: repainted
      container.innerHTML = 'STALE';
      bridge.buildMgPools({ controls: true, netsEdit: 'p1' });
      bridge.poll();
      expect(container.innerHTML).toBe('STALE');                  // half-typed nets: bailed
      bridge.buildMgPools({ controls: true, moveTeam: 't1' });
      bridge.poll();
      expect(container.innerHTML).toBe('STALE');                  // an open picker: bailed too
    } finally {
      bridge.setBoot(false);
      bridge.setTab(prevTab);
      doc.getElementById = realGet;
      doc.querySelector = realQuery;
      doc.activeElement = undefined;
    }
  });

  // Final review: Save nets shipped with no in-flight guard. A double-tap sent the SAME stale row version
  // twice, so the per-row CAS in tdbSetPoolNets threw "Another device just updated a game" over a write
  // that had already landed, and the field reopened on a pool whose nets were correct.
  it('a double-tap on Save nets writes once, and the button greys while it is in flight', async () => {
    seedPools(bridge, { matches: UNPLAYED });
    bridge.setMgtView('pools');
    bridge.buildMgPools({ controls: true, netsEdit: 'p1' });
    let release;
    const gate = new Promise((r) => { release = r; });
    const { calls, restore } = bridge.mockPoolWrites({ nets: () => gate });
    const doc = bridge.doc;
    const realGet = doc.getElementById;
    const realQuery = doc.querySelector;
    const btn = { disabled: false };
    doc.getElementById = (id) => (id === 'pc-nin-p1' ? { value: '2, 3' } : null);
    doc.querySelector = (sel) => (sel === '[data-pc-savenets]' ? btn : null);
    try {
      await withDelegate(async (tap) => {
        tap('data-pc-savenets', 'p1');
        tap('data-pc-savenets', 'p1');   // the second tap of a double-tap, while the first is still open
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(calls.filter((c) => c[0] === 'nets')).toEqual([['nets', 'p1', [2, 3]]]);
      expect(btn.disabled).toBe(true);
      release();
      await new Promise((r) => setTimeout(r, 0));
      expect(btn.disabled).toBe(false);
    } finally { restore(); doc.getElementById = realGet; doc.querySelector = realQuery; }
  });

  // Final review: the team sheet's pool selector calls mgtsWrite, whose catch was a bare console.warn.
  // A refused move left the tapped pill looking selected with nothing said, which is the exact silent-
  // refusal shape the rest of this round has been closing.
  it('a refused team-sheet write says so instead of dying in a console.warn', async () => {
    seedPools(bridge, { matches: UNPLAYED });
    const { calls, restore } = bridge.mockPoolWrites({});
    try {
      await bridge.teamSheetWrite(() => { throw new Error('Another device just updated this team.'); });
      expect(calls.filter((c) => c[0] === 'notice')).toEqual([['notice', 'That did not save']]);
      expect(calls[calls.length - 1]).toEqual(['repaint']);   // and the list under the sheet still repaints
    } finally { restore(); }
  });

  it('the pool-controls CSS kit is ported, minus the toggle and the type-the-name strip', () => {
    const body = css.replace(/\/\*[\s\S]*?\*\//g, '');   // PORT NOTEs name what they ban
    expect(body).toContain('.pc-card {');
    expect(body).toContain('.pc-hd {');
    expect(body).toContain('.pc-pick {');
    // Final review: a bare `.pc-nin` (0,1,0) LOSES to production's `input[type="text"], …` block (0,1,1)
    // on padding, border, radius, height, background and font — the field rendered as prod's grey box.
    // `input.pc-nin` ties on specificity and wins on source order, the Task 6 `input.set-in` pattern.
    expect(count(body, 'input.pc-nin {')).toBe(1);
    expect(count(body, 'input.pc-nin:focus {')).toBe(1);
    expect(body).not.toMatch(/(^|\n)\.pc-nin[\s:{]/);
    expect(body).toContain('.pc-nhint {');
    expect(body).toContain('.pc-lock {');
    expect(body).not.toContain('.pc-toggle');
    expect(body).not.toContain('.pc-confirm');
    expect(body).not.toContain('.pc-cin');
    expect(body).not.toContain('.pc-cgo');
    expect(body).not.toContain('.mgps-editnets');   // its markup went with the old controls
    // the iOS button-rule counters, which a plain class selector loses to
    expect(body).toContain('.pc-done { min-height: 32px; height: 32px; font-size: 12.5px !important; }');
    expect(body).toContain('.pc-nbtn { min-height: 30px; height: 30px; font-size: 12px !important; }');
    expect(body).toContain('.pc-team { min-height: 0; color: var(--ink); font-size: 15px !important; }');
  });

  it('the version bumped with the change', () => {
    expect(appSrc).toContain("const APP_VERSION = '2026.08.25.14'");
  });
});

// ── Final review fix wave: the Manage tab's 15s poll ──────────────────────────────────────────────────
// refreshTournamentLive branches on activeMainTab. Manage had no branch of its own, so it fell into the
// off-tab else, which reloads state.tournaments and NOTHING else — the hub's live strip, the tournament
// page's tiles and both Needs-you lists moved only on the organizer's own writes. A score entered on a
// second phone left this one reading a frozen board for as long as it sat there.
describe('the poll refreshes the Manage tab', () => {
  // A tournament still in SETUP, so publicLiveTournament() is null and Home falls to the off-tab branch:
  // that is what makes the two tabs distinguishable here rather than both repainting for their own reasons.
  it('reloads the collections and repaints in place on Manage, and does not on Home', async () => {
    seedHub(bridge, { status: 'setup', registration_open: false, name: 'August', net_count: 2 }, { teams: [] });
    const prevTab = bridge.tabNow();
    const { calls, restore } = bridge.mockPoll();
    try {
      bridge.setTab('manage');
      await bridge.refreshLive();
      expect(calls).toEqual(['refresh', 'partialRender']);

      calls.length = 0;
      bridge.setTab('home');
      await bridge.refreshLive();
      expect(calls).toEqual(['list']);
    } finally { restore(); bridge.setTab(prevTab); }
  });

  it('leaves a non-admin on Manage in the off-tab branch, which loads no collections', async () => {
    seedHub(bridge, { status: 'setup', registration_open: false, name: 'August', net_count: 2 }, { teams: [] });
    const prevTab = bridge.tabNow();
    bridge.getState().isAdmin = false;
    const { calls, restore } = bridge.mockPoll();
    try {
      bridge.setTab('manage');
      await bridge.refreshLive();
      expect(calls).toEqual(['list']);
    } finally { restore(); bridge.setTab(prevTab); bridge.getState().isAdmin = true; }
  });
});

// ── Task 9: the organizer's bracket ───────────────────────────────────────────────────────────────────
// Screens 37 (the bracket score card) + 38 (mgbk-run) of the 2026-08-25 Manage handoff. Spec decision 4:
// the UI ships now and the DB gaps go to their own round, so what lands here is the progress strip, the
// champion block, the card's three additive lines, the Done pill and keyboard reach — and NOTHING that
// needs a write the schema hasn't got (no undo strip, no clear-every-score, no net reassignment).
//
// The 8-team fixture above is mid-play and every number in the strip is checkable by hand:
// G1–G4 winners R1 (final), G5–G6 losers R1 (up next), G7–G8 winners R2 (LIVE on nets 1 and 2),
// G9 losers R2, G10 winners R3, G11 the championship — 11 games, 4 in, two live.

// The REAL keydown listeners, captured the way withDelegate captures the click one. The bracket's
// Enter/Space reach is bound on #app-content and the score card's Escape on document, so both lists are
// collected and driven with a synthetic event: a grep of app.js proves neither is actually wired.
function withKeys(fn, times) {
  const doc = bridge.doc;
  const realGet = doc.getElementById;
  const realAdd = doc.addEventListener;
  const noop = () => {};
  const onEl = [];
  const onDoc = [];
  // A FRESH #app-content per attachHandlers call, because that is what production does: renderPublicShell()
  // rebuilds the node on every full render(), which is exactly why its dataset guard cannot keep a
  // document-level listener from stacking.
  const makeAppContent = () => ({
    dataset: {}, style: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    addEventListener: (type, cb) => { if (type === 'keydown') onEl.push(cb); },
    removeEventListener: noop,
    querySelector: () => null, querySelectorAll: () => ({ forEach: noop, length: 0 }),
  });
  let appContent = makeAppContent();
  doc.getElementById = (id) => (id === 'app-content' ? appContent : null);
  doc.addEventListener = (type, cb) => { if (type === 'keydown') onDoc.push(cb); };
  // The document listeners are bound once for the life of the page and this suite shares one vm context,
  // so the flag is cleared first or a later case would capture nothing. `times` > 1 is how the bound-once
  // guard itself is proven: the flag is NOT cleared between the repeats, only the node is replaced.
  bridge.resetDocKeys();
  try {
    for (let i = 0; i < (times || 1); i += 1) {
      appContent = makeAppContent();
      // the later bindings in attachHandlers want DOM this harness has not got; both keydown blocks are
      // bound before any of them complain
      try { bridge.attachHandlers(); } catch (_) { /* nothing after the keydown bindings matters here */ }
    }
  } finally { doc.getElementById = realGet; doc.addEventListener = realAdd; }
  // One synthetic key press. `hooks` is every attribute the focused node sits under, so a row can be
  // reproduced exactly; `list` picks which set of listeners hears it (the element's, or document's).
  const press = (key, hooks, value, list) => {
    const names = hooks == null ? [] : (Array.isArray(hooks) ? hooks : [hooks]);
    let prevented = false;
    const target = {
      tagName: 'DIV', dataset: {}, classList: { contains: () => false },
      closest: (sel) => (names.some((a) => sel === '[' + a + ']')
        ? { getAttribute: (name) => (names.includes(name) ? (value == null ? '' : value) : null), dataset: {} }
        : null),
    };
    (list || onEl).forEach((cb) => cb({ key, target, preventDefault: () => { prevented = true; }, stopPropagation: noop }));
    return prevented;
  };
  return fn({ press, onEl, onDoc });
}

// Every game played out, so the champion block and the "done" progress word are both on screen. t1 takes
// the championship from the winners side (slot a), which is the no-reset path computeChampion decides on.
function setDecidedBracketFixture() {
  setMainBracketFixture();
  const st = bridge.getState();
  const pairs = { l2a: ['t2', 't6'], w3a: ['t1', 't5'], gf: ['t1', 't2'] };
  const wins = { l1a: 't2', l1b: 't6', w2a: 't1', w2b: 't5', l2a: 't2', w3a: 't1', gf: 't1' };
  st.tournamentMatches.forEach((m) => {
    if (pairs[m.id]) { m.team_a_id = pairs[m.id][0]; m.team_b_id = pairs[m.id][1]; }
    if (wins[m.id]) { m.status = 'final'; m.winner_team_id = wins[m.id]; m.score_a = 21; m.score_b = 15; }
  });
}

describe('Task 9 the progress strip', () => {
  it('reads the event off the tournament and the count off the games', () => {
    setMainBracketFixture();
    const html = bridge.buildBracket();
    expect(html).toContain('DOUBLE ELIMINATION · 8 TEAMS · 2 NETS');
    expect(html).toMatch(/\d+ of \d+ games in/);
    expect(html).toContain('class="bkr-count">4 of 11 games in<');
    expect(html).toContain('<span style="width:36%">');   // 4 of 11
  });

  it('the now-line names the live games and their nets', () => {
    setMainBracketFixture();
    const html = bridge.buildBracket();
    expect(html).toContain('On the nets now: <b>G7 on Net 1</b>, <b>G8 on Net 2</b>. Tap a game to pick its winner.');
  });

  it('the now-line names what is up next when nothing is on a net', () => {
    setMainBracketFixture();
    bridge.getState().tournamentMatches.forEach((m) => { if (m.status === 'live') m.status = 'scheduled'; });
    const html = bridge.buildBracket();
    expect(html).toContain('Up next: <b>G5</b>, <b>G6</b>, <b>G7</b>. Tap a game to pick its winner.');
  });

  it('the now-line says so plainly when the next round is waiting on results', () => {
    setMainBracketFixture();
    bridge.getState().tournamentMatches.forEach((m) => {
      if (m.phase === 'main' && m.team_a_id && m.team_b_id) {
        m.status = 'final'; m.winner_team_id = m.team_a_id; m.score_a = 21; m.score_b = 15;
      }
    });
    const html = bridge.buildBracket();
    expect(html).toContain('No game is playable, the next round needs results first.');
    expect(html).not.toMatch(/—|&mdash;/);
  });

  it('an unplayed reset game is not in the total, so the count can actually reach the end', () => {
    setMainBracketFixture();
    bridge.getState().tournamentMatches.push({ id: 'gf2', tournament_id: 'T', phase: 'main', side: 'grand_final',
      round: 2, slot: 0, round_label: 'Grand Final Reset', net: 1, queue_order: 11, status: 'scheduled',
      team_a_id: null, team_b_id: null, source_a: 'Winner of Grand Final', source_b: 'Loser of Grand Final',
      winner_next_match_id: null, loser_next_match_id: null, version: 0 });
    expect(bridge.buildBracket()).toContain('class="bkr-count">4 of 11 games in<');
  });

  it('rides between the controls and the board, and brings nothing from the data round with it', () => {
    setMainBracketFixture();
    const html = bridge.buildBracket();
    expect(html.indexOf('data-mgbk-players')).toBeLessThan(html.indexOf('class="bkr-strip"'));
    expect(html.indexOf('class="bkr-strip"')).toBeLessThan(html.indexOf('class="mgv-bkr"'));
    expect(html).not.toContain('bkr-undo');
    expect(html).not.toContain('Clear every score');
    expect(html).not.toContain('Undo');
    expect(html).toContain('data-mgbk-reset');   // the one destructive control this page already had
  });
});

describe('Task 9 the champion block', () => {
  it('names the champion, the seed, the pool record and the deciding game', () => {
    setDecidedBracketFixture();
    const html = bridge.buildBracket();
    expect(html).toContain('class="bkr-champe">Champion<');
    expect(html).toContain('class="bkr-champn">Dink Responsibly<');
    expect(html).toContain('class="bkr-champs">Seed 1 · 2–0 in pools · won the championship, G11<');
    expect(html).toContain('Every game is in. <b>Dink Responsibly</b> takes it.');
    expect(html.indexOf('class="bkr-champ"')).toBeLessThan(html.indexOf('class="bkr-strip"'));
  });

  it('drops a clause whose fact is missing', () => {
    setDecidedBracketFixture();
    const st = bridge.getState();
    st.tournamentMatches = st.tournamentMatches.filter((m) => m.phase !== 'pool'); // no pools played
    st.tournamentTeams.forEach((tm) => { delete tm.seed; });                       // pre-0049 rows
    expect(bridge.buildBracket()).toContain('class="bkr-champs">won the championship, G11<');
  });

  it('an undecided bracket renders no champion block at all', () => {
    setMainBracketFixture();
    expect(bridge.buildBracket()).not.toContain('bkr-champ');
  });

  it('a finished round reads done, never final', () => {
    setDecidedBracketFixture();
    const html = bridge.buildBracket();
    expect(html).toContain('class="mgv-bkrs">done<');
    expect(html).not.toContain('class="mgv-bkrs">final<');
  });
});

describe('Task 9 the bracket score card', () => {
  const match = (id) => bridge.getState().tournamentMatches.find((m) => m.id === id);

  it('carries the seed and pool record, the stakes and a WINNER pill, and keeps the steppers', () => {
    setMainBracketFixture();
    const html = bridge.buildScoreSheet(match('w2a'));
    expect(html).toMatch(/class="mgv-scsub">Seed \d · \d–\d in pools</);
    expect(html).toContain('class="mgv-scsub">Seed 1 · 2–0 in pools<');
    expect(html).toContain('class="mgv-scsub">Seed 3 · 2–1 in pools<');
    expect(html).toContain('<b>Winner</b> → winners bracket · G10');
    expect(html).toContain('<b>Loser</b> → losers bracket · G9');
    expect(html).toContain('class="mgv-scwpill" aria-hidden="true">Winner<');
    expect(count(html, 'data-mgss-step=')).toBe(4);
    expect(html).toContain('data-mgss="live"');
    expect(html).not.toMatch(/—|&mdash;/);
  });

  it('keeps every hook and class the row already had', () => {
    setMainBracketFixture();
    const html = bridge.buildScoreSheet(match('w2a'));
    expect(count(html, 'class="mgv-scrow')).toBe(2);
    expect(count(html, 'class="mgv-scwin" data-mgss-winner=')).toBe(2);
    expect(count(html, 'class="mgv-scdot" aria-hidden="true"')).toBe(2);
    expect(count(html, 'class="mgv-scname"')).toBe(2);
    expect(count(html, 'class="mgv-scstep"')).toBe(2);
    expect(count(html, 'class="mgv-scnb"')).toBe(2);   // the name + sub wrapper keeps the 44px target whole
    expect(html).toContain('id="mgss-a"');
    expect(html).toContain('id="mgss-b"');
  });

  it('the championship names the terminal outcomes, never a game that does not exist', () => {
    setMainBracketFixture();
    const gf = match('gf');
    gf.team_a_id = 't1'; gf.team_b_id = 't2';
    const html = bridge.buildScoreSheet(gf);
    expect(html).toContain('<b>Winner</b> → champion');
    expect(html).toContain('<b>Loser</b> → runner-up');
  });

  // Fix round 1: grand_final_reset defaults TRUE, and pure.js wires BOTH ends of the championship into the
  // reset game — so the Winner/Loser form said "Championship · G12" twice and named no outcome at all. The
  // reset is only played when the LOSERS-side team wins (0039 ends the tournament the moment the
  // winners-side team does), so the card names the two teams instead of the two ends.
  it('a reset championship names the two teams, because both of its ends feed the same game', () => {
    setMainBracketFixture();
    const st = bridge.getState();
    const gf = match('gf');
    gf.team_a_id = 't1'; gf.team_b_id = 't2';               // slot a = winners side, slot b = losers side
    gf.winner_next_match_id = 'gf2'; gf.loser_next_match_id = 'gf2';
    st.tournamentMatches.push({ id: 'gf2', tournament_id: 'T', phase: 'main', side: 'grand_final', round: 2,
      slot: 0, round_label: 'Grand Final Reset', net: 1, queue_order: 11, status: 'scheduled',
      team_a_id: null, team_b_id: null, source_a: 'Winner of Grand Final', source_b: 'Loser of Grand Final',
      winner_next_match_id: null, loser_next_match_id: null, version: 0 });
    const html = bridge.buildScoreSheet(gf);
    expect(html).toContain('<b>Dink Responsibly</b> wins → champion');
    expect(html).toContain('<b>Sets and Reps</b> wins → Championship · G12');
    expect(html).not.toContain('<b>Winner</b> →');
    expect(html).not.toContain('<b>Loser</b> →');
    expect(html).not.toMatch(/—|&mdash;/);
    // and the reset game ITSELF is the decider, so it keeps the Winner / Loser form
    const reset = match('gf2');
    reset.team_a_id = 't2'; reset.team_b_id = 't1';
    const resetHtml = bridge.buildScoreSheet(reset);
    expect(resetHtml).toContain('<b>Winner</b> → champion');
    expect(resetHtml).toContain('<b>Loser</b> → runner-up');
  });

  it('the last losers round sends its loser to third place', () => {
    setMainBracketFixture();
    const l2 = match('l2a');
    l2.team_a_id = 't2'; l2.team_b_id = 't6';
    const html = bridge.buildScoreSheet(l2);
    expect(html).toContain('<b>Winner</b> → Championship · G11');
    expect(html).toContain('<b>Loser</b> → third place');
  });

  it('a pool card has no seed line, no stakes and no pill', () => {
    setPoolsFixture();
    const html = bridge.buildScoreSheet(match('gA2'));
    expect(html).not.toContain('mgv-scsub');
    expect(html).not.toContain('mgv-scstake');
    expect(html).not.toContain('mgv-scwpill');
    expect(html).toContain('class="mgv-scname"');
    expect(count(html, 'data-mgss-step=')).toBe(4);
  });
});

describe('Task 9 keyboard reach', () => {
  it('a resolved row is a button the keyboard can land on; a placeholder is not', () => {
    setMainBracketFixture();
    const html = bridge.buildBracket();
    expect(html).toContain('<div class="mgv-bkm is-live" role="button" tabindex="0" data-mgbk-score="w2a">');
    expect(html).toContain('class="mgv-bkm is-tbd"');
    expect(html).not.toMatch(/class="mgv-bkm is-tbd"[^>]*tabindex/);
    expect(count(html, 'tabindex="0"')).toBe(count(html, 'data-mgbk-score="'));
  });

  it('Enter and Space open the same score card the tap opens, and Space never scrolls the page', () => {
    setMainBracketFixture();
    bridge.buildBracket();   // puts Manage on the bracket page, the way a tap would
    const mock = bridge.mockOpenScore();
    try {
      withKeys(({ press }) => {
        expect(press('Enter', 'data-mgbk-score', 'w2a')).toBe(true);
        expect(press(' ', 'data-mgbk-score', 'w2b')).toBe(true);
        press('a', 'data-mgbk-score', 'w2a');            // any other key is left alone
        press('Enter', 'data-mgbk-showdone', '');        // and a non-row hook never opens a card
      });
      expect(mock.calls).toEqual(['w2a', 'w2b']);
    } finally { mock.restore(); }
  });

  // Fix round 1: renderPublicShell() rebuilds #app-content on every full render(), so its dataset guard
  // dies with the old node and attachHandlers runs the Manage block again. Anything it binds on DOCUMENT
  // would stack one copy per render; the module flag is what stops it.
  it('the document key listeners bind once, however many times #app-content is rebuilt', () => {
    const once = withKeys(({ onDoc }) => onDoc.length);
    let twiceDoc = null;
    const twice = withKeys(({ onDoc, onEl }) => {
      twiceDoc = onDoc;
      expect(onEl.length).toBe(4);   // the ELEMENT listeners do re-bind: they ride on the new node
      expect(bridge.docKeysBound()).toBe(true);
      return onDoc.length;
    }, 2);
    // The Manage block's document PAIR (the hub picker's Escape + the score card's) binds once for the
    // life of the page, so a second render adds exactly ONE listener, not three. That one is the
    // copilot's Enter handler, which has re-bound with #app-content since long before this round and is
    // not this task's to change — it is ledgered, not silently absorbed into this assertion.
    expect(twice - once).toBe(1);
    // and functionally: one Escape still closes the card exactly once, never twice over
    const doc = bridge.doc;
    const realGet = doc.getElementById;
    let removed = 0;
    doc.getElementById = (id) => (id === 'mgss-sheet' ? { remove: () => { removed += 1; } } : null);
    try {
      twiceDoc.forEach((cb) => cb({ key: 'Escape', target: { closest: () => null }, preventDefault: () => {}, stopPropagation: () => {} }));
      expect(removed).toBe(1);
    } finally { doc.getElementById = realGet; }
  });

  // Fix round 1: opened from the keyboard, the row that fired still holds focus behind an aria-modal card,
  // so a second Enter would tear the card down and rebuild it — losing the pick.
  it('opening the card moves focus into it', () => {
    setMainBracketFixture();
    const doc = bridge.doc;
    const realCreate = doc.createElement;
    let focused = 0;
    const closeBtn = { focus: () => { focused += 1; } };
    const scrim = {
      id: '', className: '', style: {}, innerHTML: '',
      addEventListener: () => {},
      querySelector: (sel) => (sel === '[data-mgss="close"]' ? closeBtn : null),
      querySelectorAll: () => ({ forEach: () => {} }),
    };
    doc.createElement = () => scrim;
    const realTimeout = bridge.swapTimeout((cb) => { cb(); return 0; });
    try {
      bridge.openScore('w2a');
      expect(scrim.id).toBe('mgss-sheet');
      expect(scrim.innerHTML).toContain('data-mgss="close"');
      expect(focused).toBe(1);
    } finally { doc.createElement = realCreate; bridge.swapTimeout(realTimeout); }
  });

  it('Escape closes the score card', () => {
    withKeys(({ press, onDoc }) => {
      const doc = bridge.doc;
      const realGet = doc.getElementById;
      let removed = 0;
      doc.getElementById = (id) => (id === 'mgss-sheet' ? { remove: () => { removed += 1; } } : null);
      try {
        press('Escape', null, null, onDoc);
        expect(removed).toBe(1);
        removed = 0;
        press('Enter', null, null, onDoc);
        expect(removed).toBe(0);
      } finally { doc.getElementById = realGet; }
    });
  });
});

describe('Task 9 the ported CSS', () => {
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '');   // PORT NOTEs name what they ban

  it('ports the strip and the champion block from _bracket-run.css', () => {
    expect(body).toContain('.bkr-strip {');
    expect(body).toContain('.bkr-eye {');
    expect(body).toContain('.bkr-count {');
    expect(body).toContain('.bkr-bar {');
    expect(body).toContain('.bkr-now {');
    expect(body).toContain('.bkr-champ {');
    expect(body).toContain('.bkr-champe {');
    expect(body).toContain('.bkr-champn {');
    expect(body).toContain('.bkr-champs {');
    expect(body).toContain('.mgv-bkpill.is-done {');
    expect(body).not.toContain('.bkr-undo');   // the data round's, not this one's
  });

  it('renames the card lines onto production classes, never an aria-label selector', () => {
    expect(body).toContain('.mgv-scsub');
    expect(body).toContain('.mgv-scwpill');
    expect(body).toContain('.mgv-scstake');
    expect(body).toContain('.mgv-scstk');
    expect(body).toContain('.mgv-scnb');
    expect(body).not.toContain('[aria-label="Pick the winner"]');
    expect(body).toMatch(/#mgss-sheet \.mgv-scrow \{[^}]*position: relative/);
    // Fix round 1: the round's 12px gap is scoped to the bracket card, so the POOL card keeps prod's 11px
    expect(body).toContain('#mgss-sheet .mgv-scwin { position: relative; }');
    expect(body).toContain('#mgss-sheet .mgv-scwin:has(.mgv-scsub) { min-height: 62px; gap: 12px; }');
    expect(body).not.toContain('.mgv-scwin { position: relative; gap: 12px; }');
  });

  it('the old .mgv-bknext block went with its markup', () => {
    expect(appSrc).not.toContain('mgv-bknext');
    expect(body).not.toContain('mgv-bknext');   // only the PORT NOTE naming the removal still says it
    expect(css).toContain('.mgv-bknext block that lived here');
  });
});
