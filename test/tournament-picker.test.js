// Choose a tournament — the switcher's list screen (round 2026-08-04).
//
// WHY THIS FILE EXISTS: Manage → Tournament jumped straight into ONE tournament — whichever sat at
// state.activeTournamentId — with no list and no way to reach a different one. Mike hit that with two
// events in play and ended up RENAMING an old tournament rather than managing two.
//
// WHAT CHANGED SINCE THE FIRST FIX, and why every assertion in this file moved: the first attempt put a
// PICKER inside Manage → Tournament. Mike's design round the same day put the choice one level up instead —
// the Manage HUB carries a card naming the tournament it is pointed at, and the list is its own screen
// behind that card (manageView === 'tournaments'), with New tournament at the top of it. The interim
// picker's whole surface is retired, and with it the assertions that pinned it:
//   * mgtPickerOpen / mgtFromPicker / mgtHubBackToList → gone; the sub-hub's back button is the Manage hub
//     again, unconditionally, because the hub is where the switch now lives.
//   * buildMgTournamentPickerHTML / mgtPickRowHTML → buildMgTournamentListHTML / mgtlRowHTML
//   * data-mgt-pick / data-mgt-tolist → data-mgtl-pick / data-mgtl-back / data-mgtl-new
//   * "Players see this" → dropped. Mike ANSWERED that open question in the handoff: active is an
//     ORGANIZER-SIDE POINTER ONLY and the public Tournament tab still follows the live event, so the list
//     says nothing about the public at all. publicLiveTournament() is untouched (asserted below).
//
// The five things pinned here, in order of what would hurt most if it regressed:
//   1. NO SUBTITLE CLAUSE IS EVER PRINTED FROM DATA THAT IS NOT LOADED. state.tournamentTeams belongs to
//      state.activeTournamentId and to nothing else, so a team count on any other row would be one
//      tournament's number printed under another's name. Same for the date column that migration 0057 has
//      not added yet: the clause is dropped, never defaulted. (Mike's standing ruling, 2026-08-03 round.)
//   2. GROUPING IS BY PHASE and EXACTLY ONE ROW IS MARKED. The filled dot follows mgActiveTournament(), the
//      same resolver the hub's card names, so the marked row and the card can never disagree.
//   3. A PICK STICKS. mgSyncActiveTournament() re-glues the selection to the lead resolver on every area
//      entry; without the pin an explicit pick would be silently undone by the very next row tap, which is
//      the one way this feature could look broken while every builder function was correct.
//   4. THE FINISHED ROWS READ THE SAME SOURCE as the public Past-tournaments screen, so the two lists
//      cannot disagree about who won.
//   5. THE ROWS ARE ACTUALLY WIRED. On 2026-08-03 a drag's Undo shipped completely inert while 37 green
//      unit tests called the function directly and never travelled the click path. So the taps below drive
//      attachHandlers' real #app-content delegate.
//
// WHAT THIS DOES NOT PROVE (§17): that the list LOOKS right on his phone (it renders on the shipped
// .mg-row / .mgv-trow / .mgv-tdot / .mgv-rmeta grammar, asserted here as class grammar, not as pixels), and
// nothing about the server — the chooser only reads state that is already loaded.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const APP_SRC = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

const JUNE = { id: 'j-1', name: 'June 2026 tournament', status: 'completed', created_at: '2026-06-01T10:00:00Z' };
const JULY = { id: 'j-2', name: 'July 2026 tournament', status: 'pools', created_at: '2026-07-01T10:00:00Z' };
const AUG = { id: 'a-3', name: 'August 2026 tournament', status: 'setup', registration_open: true, created_at: '2026-08-01T10:00:00Z' };

function loadApp() {
  const pureSrc = readFileSync(new URL('../public/pure.js', import.meta.url), 'utf8');
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
  // #app-content is the element attachHandlers() delegates every in-content click onto. Capturing its
  // listeners is what lets the taps below travel the REAL path instead of calling a handler.
  const contentListeners = {};
  const appContentEl = makeEl();
  appContentEl.addEventListener = (type, fn) => { (contentListeners[type] = contentListeners[type] || []).push(fn); };
  const documentStub = {
    readyState: 'loading',
    getElementById: (id) => (id === 'app-content' ? appContentEl : null),
    querySelector: () => null, querySelectorAll: () => emptyList,
    createElement: () => makeEl(), createDocumentFragment: () => makeEl(),
    addEventListener: noop, removeEventListener: noop,
    head: makeEl(), body: makeEl(), documentElement: makeEl(),
  };
  const client = {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: noop } } }),
      getSession: async () => ({ data: { session: null } }),
      getUser: async () => ({ data: { user: null } }),
    },
    channel: () => ({ on: () => ({ subscribe: noop }) }),
    removeChannel: noop,
    rpc: async () => ({ data: null, error: null }),
    from: () => {
      const chain = {
        select: () => chain, eq: () => chain, in: () => chain, order: () => chain,
        limit: () => chain, single: () => chain, maybeSingle: () => chain,
        insert: () => chain, update: () => chain, delete: () => chain, upsert: () => chain,
        then: (resolve) => Promise.resolve({ data: [], error: null, count: 0 }).then(resolve),
      };
      return chain;
    },
  };
  const windowStub = {
    supabase: { createClient: () => client },
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
    ;globalThis.__refreshes = 0;
    ;globalThis.__historyLoads = 0;
    ;globalThis.__bridge = {
      // Seed the admin state the chooser reads. teams names the tournament whose collections are loaded
      // (which is exactly what state.activeTournamentId means to tdbRefreshTournaments).
      seed: (list, opts) => {
        opts = opts || {};
        state.isAdmin = true;
        state.tournaments = list || [];
        state.activeTournamentId = ('active' in opts) ? opts.active : null;
        state.tournamentTeams = opts.teams || [];
        state.tournamentPools = opts.pools || [];
        state.tournamentMatches = opts.matches || [];
        state.tournamentHistory = opts.history;
        state.players = []; state.checkedIn = []; state.pickupDays = []; state.currentSession = null;
        manageView = ('manageView' in opts) ? opts.manageView : 'tournaments';
        mgtView = ('mgtView' in opts) ? opts.mgtView : null;
        mgTournamentPinned = !!opts.pinned;
        // The row tap kicks a refresh; stub it so these tests stay about the chooser, not the DB.
        tdbRefreshTournaments = async () => { globalThis.__refreshes++; };
        loadTournamentHistory = async () => { globalThis.__historyLoads++; };
      },
      // What the Manage container paints right now — the same call the 15s poll makes.
      paint: () => manageContainerHTML(),
      resolver: () => { const t = publicLiveTournament(); return t ? t.id : null; },
      managed: () => { const t = mgActiveTournament(); return t ? t.id : null; },
      flags: () => ({ mgtView, manageView, pinned: mgTournamentPinned }),
      after: () => ({
        active: state.activeTournamentId,
        teams: (state.tournamentTeams || []).length,
        pools: (state.tournamentPools || []).length,
        matches: (state.tournamentMatches || []).length,
        refreshes: globalThis.__refreshes,
        historyLoads: globalThis.__historyLoads,
      }),
      // Run the lead resolver's re-glue, which is what every Manage row tap does on the way in.
      resync: () => { mgSyncActiveTournament(); return state.activeTournamentId; },
      bind: () => { attachHandlers(); },
      defined: (n) => typeof globalThis[n],
    };`;
  const context = vm.createContext(sandbox);
  vm.runInContext(pureSrc, context, { filename: 'pure.js' });
  vm.runInContext(APP_SRC + epilogue, context, { filename: 'app.js' });
  const bridge = sandbox.__bridge;
  bridge.bind();
  return {
    bridge,
    // THE GESTURE. Dispatch a click whose target answers to one selector and carries one attribute —
    // exactly what a rendered row/button is — through the real delegate.
    tap(sel, attr, value) {
      const hit = {
        tagName: 'A', id: '', dataset: {}, value: '',
        closest: (s) => (s === sel ? hit : null),
        getAttribute: (a) => (a === attr ? value : null),
      };
      (contentListeners.click || []).forEach((fn) => fn({ target: hit, preventDefault: noop, stopPropagation: noop }));
      return (contentListeners.click || []).length;
    },
  };
}

// Row order as rendered, by tournament name.
function rowOrder(html) {
  return (html.match(/class="mg-rn">([^<]*)</g) || []).map((m) => m.replace(/^class="mg-rn">/, '').replace(/<$/, ''));
}
// The whole <a> element for one tournament id.
function rowFor(html, id) {
  const start = html.indexOf(`data-mgtl-pick="${id}"`);
  if (start < 0) return '';
  const from = html.lastIndexOf('<a', start);
  const end = html.indexOf('</a>', start);
  return html.slice(from, end + 4);
}
// Everything between a section label and the next one.
function section(html, label) {
  const start = html.indexOf(`<div class="pl-sect">${label}</div>`);
  if (start < 0) return '';
  const next = html.indexOf('<div class="pl-sect">', start + 1);
  return html.slice(start, next < 0 ? html.length : next);
}

describe('the chooser list', () => {
  it('renders EVERY loaded tournament, newest first', () => {
    const { bridge } = loadApp();
    // Seeded oldest-first on purpose: the list must sort, not just echo the load order.
    bridge.seed([JUNE, JULY, AUG], { active: JULY.id });
    const html = bridge.paint();
    expect(rowOrder(html)).toEqual(['August 2026 tournament', 'July 2026 tournament', 'June 2026 tournament']);
    [JUNE, JULY, AUG].forEach((t) => expect(html).toContain(`data-mgtl-pick="${t.id}"`));
  });

  it('sorts a row carrying no created_at to the END rather than letting it jump the queue', () => {
    const { bridge } = loadApp();
    bridge.seed([{ id: 'no-date', name: 'Undated', status: 'setup' }, JULY, AUG], { active: JULY.id });
    expect(rowOrder(bridge.paint())).toEqual(['August 2026 tournament', 'July 2026 tournament', 'Undated']);
  });

  it('uses the design’s selection grammar: a dot in the lead, a state word, and NO chevron', () => {
    const { bridge } = loadApp();
    bridge.seed([JULY, AUG], { active: JULY.id });
    const html = bridge.paint();
    expect(html).toContain('class="mg-row mgv-trow');
    expect(html).toContain('class="mgv-tdot" aria-hidden="true"');
    expect(html).toContain('class="mg-rb"');
    expect(html).toContain('class="mg-rn"');
    expect(html).toContain('class="mg-rs"');
    // A selection, not a drill-in. A chevron here would promise a screen that does not open.
    expect(html).not.toContain('mg-chev');
    expect(html).not.toContain('pd-card');
    expect(html).toContain('class="pd-htitle">Tournaments<');
  });

  it('carries the caption and the back button the design specifies', () => {
    const { bridge } = loadApp();
    bridge.seed([JULY, AUG], { active: JULY.id });
    const html = bridge.paint();
    expect(html).toContain('class="mgv-tcap">Manage edits whichever one is filled in below.<');
    expect(html).toContain('data-mgtl-back');
  });

  it('puts New tournament at the TOP of the list, above the first section', () => {
    const { bridge } = loadApp();
    bridge.seed([JULY, AUG], { active: JULY.id });
    const html = bridge.paint();
    expect(html).toContain('data-mgtl-new');
    expect(html).toContain('class="mgv-tnew"');
    expect(html).toContain('New tournament');
    expect(html).toContain('Starts as a draft, nothing public until you open registration');
    expect(html.indexOf('data-mgtl-new')).toBeLessThan(html.indexOf('<div class="pl-sect">'));
    // ...and it is not a row: a create tap must never read as picking a tournament.
    expect(html).not.toContain('data-mgtl-pick="new"');
  });

  it('still offers the create row when there is nothing to choose between yet', () => {
    const { bridge } = loadApp();
    bridge.seed([], { active: null });
    const html = bridge.paint();
    expect(html).toContain('data-mgtl-new');
    expect(html).toContain('No tournament yet.');
    expect(html).not.toContain('data-mgtl-pick');
  });

  it('escapes the tournament name', () => {
    const { bridge } = loadApp();
    bridge.seed([{ id: 'x', name: '<img src=x> & "Mike\'s"', status: 'setup', created_at: '2026-08-02T00:00:00Z' }, AUG],
      { active: 'x' });
    const html = bridge.paint();
    expect(html).not.toContain('<img src=x>');
    expect(html).toContain('&lt;img src=x&gt;');
  });
});

describe('grouping by phase', () => {
  it('puts finished tournaments under Finished and everything else under This season', () => {
    const { bridge } = loadApp();
    bridge.seed([JUNE, JULY, AUG], { active: AUG.id });
    const html = bridge.paint();
    expect(rowOrder(section(html, 'This season'))).toEqual(['August 2026 tournament', 'July 2026 tournament']);
    expect(rowOrder(section(html, 'Finished'))).toEqual(['June 2026 tournament']);
    // Order on the page: This season first, then Finished.
    expect(html.indexOf('>This season<')).toBeLessThan(html.indexOf('>Finished<'));
  });

  it('omits a section that would be empty rather than printing a bare heading', () => {
    const noneFinished = loadApp();
    noneFinished.bridge.seed([JULY, AUG], { active: AUG.id });
    expect(noneFinished.bridge.paint()).not.toContain('>Finished<');

    const allFinished = loadApp();
    allFinished.bridge.seed([JUNE], { active: JUNE.id });
    expect(allFinished.bridge.paint()).not.toContain('>This season<');
  });

  it('shows the closing note only when there is a finished one to pick', () => {
    const withFinished = loadApp();
    withFinished.bridge.seed([JUNE, AUG], { active: AUG.id });
    expect(withFinished.bridge.paint()).toContain('Pick a finished one to fix a score after the fact.');

    const without = loadApp();
    without.bridge.seed([JULY, AUG], { active: AUG.id });
    expect(without.bridge.paint()).not.toContain('Pick a finished one');
  });

  it('prints the state word each phase can actually be backed by', () => {
    const { bridge } = loadApp();
    bridge.seed([
      { id: 'reg', name: 'R', status: 'setup', registration_open: true, created_at: '2026-08-05T00:00:00Z' },
      { id: 'setup', name: 'S', status: 'setup', registration_open: false, created_at: '2026-08-04T00:00:00Z' },
      { id: 'p', name: 'P', status: 'pools', created_at: '2026-08-03T00:00:00Z' },
      { id: 'b', name: 'B', status: 'bracket', created_at: '2026-08-02T00:00:00Z' },
      { id: 'c', name: 'C', status: 'completed', created_at: '2026-08-01T00:00:00Z' },
    ], { active: null });
    const html = bridge.paint();
    expect(rowFor(html, 'reg')).toContain('<span class="mgv-rmeta">Registration</span>');
    expect(rowFor(html, 'setup')).toContain('<span class="mgv-rmeta">Setup</span>');
    expect(rowFor(html, 'p')).toContain('<span class="mgv-rmeta">Pool play</span>');
    expect(rowFor(html, 'b')).toContain('<span class="mgv-rmeta">Bracket</span>');
    expect(rowFor(html, 'c')).toContain('<span class="mgv-rmeta">Finished</span>');
    // Draft and Scheduled are in the design's phase model but have NO column behind them. Printing either
    // would be a guess wearing the clothes of a state.
    expect(html).not.toContain('>Draft<');
    expect(html).not.toContain('>Scheduled<');
  });

  it('prints NO state word for a status it does not know, and groups it with This season', () => {
    const { bridge } = loadApp();
    bridge.seed([{ id: 'weird', name: 'Weird', status: 'archived_by_someone', created_at: '2026-08-01T00:00:00Z' }, AUG],
      { active: null });
    const html = bridge.paint();
    const row = rowFor(html, 'weird');
    expect(row).not.toContain('mgv-rmeta');
    expect(row).not.toContain('Setup');          // NOT defaulted to the sub-hub's fallback
    expect(row).not.toContain('archived_by_someone');
    expect(rowOrder(section(html, 'This season'))).toContain('Weird');
  });
});

describe('exactly one row is filled in', () => {
  it('marks the tournament the hub card names, and only that one', () => {
    const { bridge } = loadApp();
    bridge.seed([JUNE, JULY, AUG], { active: AUG.id });
    const html = bridge.paint();
    expect(bridge.managed()).toBe(AUG.id);
    expect(rowFor(html, AUG.id)).toContain('mgv-trow is-active');
    expect(rowFor(html, JULY.id)).not.toContain('is-active');
    expect(rowFor(html, JUNE.id)).not.toContain('is-active');
    expect(html.split('is-active').length - 1).toBe(1);
  });

  it('follows mgActiveTournament even when nothing was explicitly picked, so the card and the dot agree', () => {
    const { bridge } = loadApp();
    bridge.seed([JUNE, JULY, AUG], { active: null });
    const managed = bridge.managed();
    expect(managed).toBe(JULY.id);      // the lead resolver's pick: the live one
    const html = bridge.paint();
    expect(rowFor(html, managed)).toContain('is-active');
    expect(html.split('is-active').length - 1).toBe(1);
  });

  it('marks a FINISHED row when that is the one being managed (the design allows picking one)', () => {
    const { bridge } = loadApp();
    bridge.seed([JUNE, AUG], { active: JUNE.id, pinned: true });
    expect(rowFor(bridge.paint(), JUNE.id)).toContain('is-active');
  });
});

describe('every subtitle clause is backed by loaded state', () => {
  it('prints the team count ONLY on the tournament whose teams are actually loaded', () => {
    const { bridge } = loadApp();
    bridge.seed([JULY, AUG], { active: JULY.id, teams: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] });
    const html = bridge.paint();
    expect(rowFor(html, JULY.id)).toContain('3 teams');
    // AUG's collections are not loaded. Borrowing July's count would print one tournament's number under
    // another's name — the exact thing the 2026-07-11 resolver note calls out.
    expect(rowFor(html, AUG.id)).not.toContain('team');
  });

  it('says "1 team", not "1 teams"', () => {
    const { bridge } = loadApp();
    bridge.seed([JULY, AUG], { active: JULY.id, teams: [{ id: 'a' }] });
    expect(rowFor(bridge.paint(), JULY.id)).toContain('1 team<');
  });

  it('prints no team count at all when nothing is selected', () => {
    const { bridge } = loadApp();
    bridge.seed([JULY, AUG], { active: null, teams: [{ id: 'a' }, { id: 'b' }] });
    const html = bridge.paint();
    expect(rowFor(html, JULY.id)).not.toContain('team');
    expect(rowFor(html, AUG.id)).not.toContain('team');
  });

  it('drops the DATE clause entirely while migration 0057 is unapplied', () => {
    const { bridge } = loadApp();
    // No loaded row carries event_date, so the column does not exist as far as this app can tell.
    bridge.seed([JULY, AUG], { active: JULY.id, teams: [{ id: 'a' }] });
    const row = rowFor(bridge.paint(), JULY.id);
    expect(row).toContain('1 team');
    expect(row).not.toMatch(/Mon|Tue|Wed|Thu|Fri|Sat|Sun/);
    expect(row).not.toContain('Invalid Date');
  });

  it('prints it as "Sat Aug 22" once the column is there, and drops it again on a null or junk value', () => {
    const { bridge } = loadApp();
    bridge.seed([
      { id: 'dated', name: 'Dated', status: 'setup', event_date: '2026-08-22', created_at: '2026-08-03T00:00:00Z' },
      { id: 'nulled', name: 'Nulled', status: 'setup', event_date: null, created_at: '2026-08-02T00:00:00Z' },
      { id: 'junk', name: 'Junk', status: 'setup', event_date: 'next saturday', created_at: '2026-08-01T00:00:00Z' },
    ], { active: null });
    const html = bridge.paint();
    expect(rowFor(html, 'dated')).toContain('Sat Aug 22');
    expect(rowFor(html, 'nulled')).toContain('<div class="mg-rs"></div>');
    expect(rowFor(html, 'junk')).toContain('<div class="mg-rs"></div>');
    expect(html).not.toContain('Invalid Date');
  });

  it('adds the cap only when team_cap is a real number on a real column', () => {
    const withCap = loadApp();
    withCap.bridge.seed([{ id: 'c', name: 'Capped', status: 'setup', team_cap: 12 }],
      { active: 'c', teams: [{ id: 'a' }, { id: 'b' }] });
    expect(rowFor(withCap.bridge.paint(), 'c')).toContain('2 of 12 teams');

    const nullCap = loadApp();
    nullCap.bridge.seed([{ id: 'c', name: 'Uncapped', status: 'setup', team_cap: null }],
      { active: 'c', teams: [{ id: 'a' }, { id: 'b' }] });
    expect(rowFor(nullCap.bridge.paint(), 'c')).toContain('2 teams');

    const noColumn = loadApp();
    noColumn.bridge.seed([{ id: 'c', name: 'Pre-0057', status: 'setup' }],
      { active: 'c', teams: [{ id: 'a' }, { id: 'b' }] });
    const row = rowFor(noColumn.bridge.paint(), 'c');
    expect(row).toContain('2 teams');
    expect(row).not.toContain('of');
  });

  it('leaves the sub-line empty rather than inventing filler when nothing is backed', () => {
    const { bridge } = loadApp();
    bridge.seed([{ id: 'bare', name: 'Bare' }, AUG], { active: null });
    const row = rowFor(bridge.paint(), 'bare');
    expect(row).toContain('<div class="mg-rs"></div>');
    expect(row).not.toContain('—');
    expect(row).not.toContain('·');
  });

  it('never prints the design’s "$480 collected", because buy_in is display TEXT and not a number', () => {
    const { bridge } = loadApp();
    bridge.seed([{ id: 'c', name: 'Money', status: 'setup', buy_in: '$80 a team' }],
      { active: 'c', teams: [{ id: 'a' }, { id: 'b' }] });
    const row = rowFor(bridge.paint(), 'c');
    expect(row).not.toContain('collected');
    expect(row).not.toContain('$');
  });
});

describe('the Finished rows read the public history, not a second derivation', () => {
  it('prints the team count and the champion from state.tournamentHistory', () => {
    const { bridge } = loadApp();
    bridge.seed([JUNE, AUG], {
      active: AUG.id,
      history: [{ id: JUNE.id, name: 'June 2026 tournament', teamCount: 8, champion: { id: 't1', name: 'The Dawg House' } }],
    });
    expect(rowFor(bridge.paint(), JUNE.id)).toContain('8 teams · The Dawg House won');
  });

  it('drops both clauses until history has loaded, rather than guessing at them', () => {
    const { bridge } = loadApp();
    bridge.seed([JUNE, AUG], { active: AUG.id });   // history undefined = never loaded
    const row = rowFor(bridge.paint(), JUNE.id);
    expect(row).toContain('<div class="mg-rs"></div>');
    expect(row).toContain('<span class="mgv-rmeta">Finished</span>');   // the one thing it does know
  });

  it('prints the team count alone when no champion was recorded', () => {
    const { bridge } = loadApp();
    bridge.seed([JUNE, AUG], { active: AUG.id, history: [{ id: JUNE.id, teamCount: 6, champion: null }] });
    const row = rowFor(bridge.paint(), JUNE.id);
    expect(row).toContain('6 teams');
    expect(row).not.toContain('won');
  });

  it('escapes a champion name that carries markup', () => {
    const { bridge } = loadApp();
    bridge.seed([JUNE, AUG], { active: AUG.id, history: [{ id: JUNE.id, teamCount: 4, champion: { name: '<b>x</b>' } }] });
    const html = bridge.paint();
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });

  it('loads that history lazily on entering the screen, once', () => {
    const app = loadApp();
    app.bridge.seed([JUNE, AUG], { manageView: 'lead', active: AUG.id });
    app.tap('[data-mg-area]', 'data-mg-area', 'tournaments');
    expect(app.bridge.after().historyLoads).toBe(1);
    // Already loaded (even as an empty list) → not read again on the next entry.
    app.bridge.seed([JUNE, AUG], { manageView: 'lead', active: AUG.id, history: [] });
    app.tap('[data-mg-area]', 'data-mg-area', 'tournaments');
    expect(app.bridge.after().historyLoads).toBe(1);
  });
});

describe('picking a tournament', () => {
  it('a real tap on a row repoints activeTournamentId and returns to the Manage hub', () => {
    const app = loadApp();
    app.bridge.seed([JUNE, JULY, AUG], { active: JULY.id });
    const bound = app.tap('[data-mgtl-pick]', 'data-mgtl-pick', AUG.id);
    expect(bound).toBeGreaterThan(0);                    // the delegate exists at all
    expect(app.bridge.after().active).toBe(AUG.id);
    const flags = app.bridge.flags();
    expect(flags.manageView).toBe('lead');
    expect(flags.mgtView).toBe(null);
    // The hub, naming the picked tournament in its card.
    const html = app.bridge.paint();
    expect(html).toContain('class="mg-h1">Manage<');
    expect(html).toContain('class="mgv-tswn">August 2026 tournament<');
    expect(html).not.toContain('data-mgtl-pick');
  });

  it('PINS the pick, so the lead resolver stops overriding it', () => {
    const app = loadApp();
    // JULY is live, so the lead resolver would otherwise pull the selection back to it on every row tap.
    app.bridge.seed([JUNE, JULY, AUG], { active: JULY.id });
    app.tap('[data-mgtl-pick]', 'data-mgtl-pick', AUG.id);
    expect(app.bridge.flags().pinned).toBe(true);
    expect(app.bridge.resync()).toBe(AUG.id);
  });

  it('and WITHOUT a pick the resolver still does its job, exactly as it shipped', () => {
    const app = loadApp();
    app.bridge.seed([JUNE, JULY, AUG], { active: AUG.id, manageView: 'lead' });
    expect(app.bridge.resync()).toBe(JULY.id);   // re-glued to the live tournament
  });

  it('clears the previous tournament’s teams/pools/matches and kicks a refresh', () => {
    const app = loadApp();
    app.bridge.seed([JULY, AUG], {
      active: JULY.id,
      teams: [{ id: 't' }], pools: [{ id: 'p' }], matches: [{ id: 'm' }],
    });
    app.tap('[data-mgtl-pick]', 'data-mgtl-pick', AUG.id);
    const after = app.bridge.after();
    expect(after).toMatchObject({ active: AUG.id, teams: 0, pools: 0, matches: 0, refreshes: 1 });
  });

  it('does not touch the loaded collections when the picked row is already the active one', () => {
    const app = loadApp();
    app.bridge.seed([JULY, AUG], { active: JULY.id, teams: [{ id: 't' }, { id: 'u' }] });
    app.tap('[data-mgtl-pick]', 'data-mgtl-pick', JULY.id);
    const after = app.bridge.after();
    expect(after).toMatchObject({ active: JULY.id, teams: 2, refreshes: 0 });
    expect(app.bridge.flags().manageView).toBe('lead');
  });

  it('refuses to switch to a row that is no longer in state', () => {
    const app = loadApp();
    app.bridge.seed([JULY, AUG], { active: JULY.id });
    app.tap('[data-mgtl-pick]', 'data-mgtl-pick', 'deleted-under-him');
    expect(app.bridge.after().active).toBe(JULY.id);      // selection untouched
    expect(app.bridge.flags().manageView).toBe('tournaments');  // still on the list
    expect(app.bridge.paint()).toContain('data-mgtl-pick');
  });
});

describe('navigation', () => {
  it('the hub card routes to the chooser', () => {
    const app = loadApp();
    app.bridge.seed([JULY, AUG], { manageView: 'lead', active: AUG.id });
    const html = app.bridge.paint();
    expect(html).toContain('class="mgv-tsw" data-mg-area="tournaments"');
    app.tap('[data-mg-area]', 'data-mg-area', 'tournaments');
    expect(app.bridge.flags().manageView).toBe('tournaments');
    expect(app.bridge.paint()).toContain('data-mgtl-pick');
  });

  it('the chooser’s back button leaves for the Manage hub', () => {
    const app = loadApp();
    app.bridge.seed([JULY, AUG], { active: AUG.id });
    app.tap('[data-mgtl-back]', 'data-mgtl-back', '');
    expect(app.bridge.flags().manageView).toBe('lead');
    expect(app.bridge.paint()).toContain('class="mg-h1">Manage<');
  });

  it('back from the chooser leaves the active tournament exactly where it was', () => {
    const app = loadApp();
    app.bridge.seed([JULY, AUG], { active: AUG.id, pinned: true });
    app.tap('[data-mgtl-back]', 'data-mgtl-back', '');
    expect(app.bridge.after().active).toBe(AUG.id);
    expect(app.bridge.flags().pinned).toBe(true);
  });

  it('the SUB-HUB’s back button goes to the Manage hub, always, now that the switch lives there', () => {
    const one = loadApp();
    one.bridge.seed([AUG], { manageView: 'tournament', active: AUG.id });
    expect(one.bridge.paint()).toContain('data-mg-area="lead"');

    const many = loadApp();
    many.bridge.seed([JULY, AUG], { manageView: 'tournament', active: AUG.id });
    const html = many.bridge.paint();
    expect(html).toContain('data-mg-area="lead"');
    expect(html).not.toContain('data-mgt-tolist');   // the interim picker's hook, retired
  });

  it('leaves the sub-VIEW back button alone (it still returns to the sub-hub)', () => {
    const { bridge } = loadApp();
    bridge.seed([JULY, AUG], { manageView: 'tournament', active: AUG.id, mgtView: 'registration' });
    const html = bridge.paint();
    expect(html).toContain('data-mgt-back');
    expect(html).not.toContain('data-mgt-tolist');
  });

  it('the New tournament screen’s back button returns to the chooser', () => {
    const { bridge } = loadApp();
    bridge.seed([JULY, AUG], { manageView: 'tournament-new', active: AUG.id });
    expect(bridge.paint()).toContain('data-mg-area="tournaments"');
  });
});

describe('entering Manage → Tournament', () => {
  it('goes STRAIGHT into the managed tournament’s sub-hub — it is no longer the screen that asks which', () => {
    const app = loadApp();
    app.bridge.seed([JUNE, JULY, AUG], { manageView: 'lead', active: AUG.id, pinned: true });
    app.tap('[data-mg-area]', 'data-mg-area', 'tournament');
    expect(app.bridge.flags().manageView).toBe('tournament');
    const html = app.bridge.paint();
    expect(html).toContain('class="pd-htitle">August 2026 tournament<');
    expect(html).not.toContain('data-mgtl-pick');
  });

  it('goes to the sub-hub empty state when there are none', () => {
    const app = loadApp();
    app.bridge.seed([], { manageView: 'lead', active: null });
    app.tap('[data-mg-area]', 'data-mg-area', 'tournament');
    expect(app.bridge.paint()).toContain('No tournament yet.');
  });

  it('is a fresh landing: no stale sub-view', () => {
    const app = loadApp();
    app.bridge.seed([JUNE, JULY, AUG], { manageView: 'lead', active: JULY.id, mgtView: 'bracket' });
    app.tap('[data-mg-area]', 'data-mg-area', 'tournament');
    expect(app.bridge.flags().mgtView).toBe(null);
  });
});

describe('the 15s background poll', () => {
  it('repaints the CHOOSER while he is on it, never swapping it for something else', () => {
    const { bridge } = loadApp();
    bridge.seed([JULY, AUG], { active: JULY.id });
    const first = bridge.paint();
    const second = bridge.paint();
    expect(second).toBe(first);
    expect(second).toContain('data-mgtl-pick');
  });

  it('repaints the SUB-HUB he is on after a pick, never dropping him back to the list', () => {
    const app = loadApp();
    app.bridge.seed([JUNE, JULY, AUG], { active: JULY.id });
    app.tap('[data-mgtl-pick]', 'data-mgtl-pick', AUG.id);
    app.tap('[data-mg-area]', 'data-mg-area', 'tournament');
    // paint() is the exact call the poll's manage branch makes into the container.
    const first = app.bridge.paint();
    const second = app.bridge.paint();
    expect(second).toBe(first);
    expect(second).toContain('class="pd-htitle">August 2026 tournament<');
    expect(second).not.toContain('data-mgtl-pick');
  });

  it('repaints an open SUB-VIEW rather than replacing it', () => {
    const { bridge } = loadApp();
    bridge.seed([JULY, AUG], { manageView: 'tournament', active: AUG.id, mgtView: 'registration' });
    const html = bridge.paint();
    expect(html).toContain('class="pd-htitle">Registration<');
    expect(html).not.toContain('data-mgtl-pick');
  });

  it('cannot unpin an explicit pick, because the flag is a module var like every other manage toggle', () => {
    const app = loadApp();
    app.bridge.seed([JUNE, JULY, AUG], { active: JULY.id });
    app.tap('[data-mgtl-pick]', 'data-mgtl-pick', AUG.id);
    app.bridge.paint(); app.bridge.paint();
    expect(app.bridge.flags().pinned).toBe(true);
    expect(app.bridge.after().active).toBe(AUG.id);
  });
});

describe('wiring, copy, and what was deliberately NOT built', () => {
  it('every function the new call sites name is DEFINED', () => {
    const { bridge } = loadApp();
    ['buildMgTournamentListHTML', 'buildMgTournamentNewHTML', 'mgTournamentPickerList', 'mgtlRowHTML',
      'mgtlSeasonSub', 'mgtlFinishedSub', 'mgSwitcherCardHTML', 'mgSwitcherMetaText', 'mgTournamentPhase',
      'mgEventDateLabel', 'mgTeamsClause', 'mgManagedTeamCount', 'mgTournamentRowStage',
      'mgPickTournament', 'mgAdoptTournament', 'mgActiveTournament', 'publicLiveTournament',
      'loadTournamentHistory', 'repaintManage', 'tdbRefreshTournaments'].forEach((fn) =>
      expect(bridge.defined(fn), fn + ' is not defined').toBe('function'));
  });

  it('the interim picker’s surface is gone, so there is only ONE way to switch', () => {
    const { bridge } = loadApp();
    ['buildMgTournamentPickerHTML', 'mgtPickRowHTML', 'mgtHubBackToList', 'mgOpenTournamentPicker']
      .forEach((fn) => expect(bridge.defined(fn), fn + ' should have been retired').toBe('undefined'));
    bridge.seed([JULY, AUG], { active: AUG.id });
    expect(bridge.paint()).not.toContain('data-mgt-pick');
  });

  it('carries no em dash and no emoji anywhere in its copy', () => {
    const { bridge } = loadApp();
    bridge.seed([JUNE, JULY, AUG], { active: AUG.id, history: [{ id: JUNE.id, teamCount: 8, champion: { name: 'Dawgs' } }] });
    const html = bridge.paint();
    expect(html).not.toContain('—');
    expect(html).not.toContain('&mdash;');
    expect(html).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });

  // Mike ANSWERED this in the handoff: "active" is an ORGANIZER-SIDE POINTER ONLY, and the public
  // Tournament tab still follows the live event. So the chooser must not carry a public-visibility concept
  // at all, and publicLiveTournament() must keep resolving by STATUS exactly as it always has.
  it('says nothing about what the public sees, and does not touch the public resolver', () => {
    const { bridge } = loadApp();
    bridge.seed([JUNE, JULY, AUG], { active: AUG.id, pinned: true });
    // The organizer is pointed at AUG; the public resolver still returns the LIVE tournament.
    expect(bridge.managed()).toBe(AUG.id);
    expect(bridge.resolver()).toBe(JULY.id);
    const html = bridge.paint();
    expect(html).not.toContain('Players see this');
    expect(html).not.toContain('Players are not being shown');
    // No row claims the public, and nothing on the page reads as a control over what they watch. (The one
    // sentence that does say "public" is the create row's "nothing public until you open registration",
    // which is about REGISTRATION, a real column, and is not a claim about the Tournament tab.)
    expect(html).not.toMatch(/players (see|are)/i);
    expect(html).not.toMatch(/public(ly)? (sees|see|visible|shown)/i);
  });

  it('ships NO column-dependent public-visibility code', () => {
    // There is no featured / is_public / public_active column on `tournaments`; publicLiveTournament
    // resolves by STATUS alone. Comments may discuss it; code may not.
    const code = APP_SRC.split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    expect(code).not.toMatch(/is_public|public_active|featured/);
    const { bridge } = loadApp();
    bridge.seed([JUNE, JULY, AUG], { active: AUG.id });
    const html = bridge.paint();
    expect(html).not.toMatch(/data-mgtl-(setlive|public|feature)/);
    expect(html).not.toContain('mg-sw');
    expect(html).not.toMatch(/<input/);
  });
});
