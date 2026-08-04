// Manage → Tournament is a PICKER over every tournament (2026-08-04).
//
// WHY THIS FILE EXISTS: Manage → Tournament jumped straight into ONE tournament — whichever sat at
// state.activeTournamentId — with no list and no way to reach a different one. Mike hit that with two
// events in play and ended up RENAMING an old tournament rather than managing two. The area now opens a
// list; tapping a row repoints state.activeTournamentId and opens the SAME sub-hub, unchanged.
//
// The four things pinned here, in order of what would hurt most if it regressed:
//   1. NO SUBTITLE CLAUSE IS EVER PRINTED FROM DATA THAT IS NOT LOADED. state.tournamentTeams belongs to
//      state.activeTournamentId and to nothing else, so a team count on any other row would be one
//      tournament's number printed under another's name. Same for a missing created_at or an unknown
//      status: the clause is dropped, never defaulted. (Mike's standing ruling, 2026-08-03 round.)
//   2. "PLAYERS SEE THIS" IS DERIVED BY CALLING publicLiveTournament(), the resolver every public surface
//      follows — not by re-deriving its rule. A label that drifts from the resolver tells him players are
//      watching a tournament they are not.
//   3. THE POLL CANNOT KNOCK HIM BACK TO THE LIST. The picker flags are module vars for the same reason
//      mgtView is: the 15s background sync repaints the Manage container in place.
//   4. THE ROWS ARE ACTUALLY WIRED. On 2026-08-03 a drag's Undo shipped completely inert while 37 green
//      unit tests called the function directly and never travelled the click path. So the taps below drive
//      attachHandlers' real #app-content delegate.
//
// WHAT THIS DOES NOT PROVE (§17): that the list LOOKS right on his phone (it renders on the shipped
// .mg-row / .mgv-rmeta / .mgt-on grammar, asserted here as class grammar, not as pixels), and nothing
// about the server — the picker only reads state that is already loaded.
//
// EXPLICITLY OUT OF SCOPE, and asserted as such below: choosing which tournament the public sees. There is
// no featured / is_public / public_active column on `tournaments` — publicLiveTournament resolves purely by
// STATUS — so an explicit choice needs a migration. This ships the LABEL and no column-dependent code.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const APP_SRC = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

const JUNE = { id: 'j-1', name: 'June 2026 tournament', status: 'completed', created_at: '2026-06-01T10:00:00Z' };
const JULY = { id: 'j-2', name: 'July 2026 tournament', status: 'pools', created_at: '2026-07-01T10:00:00Z' };
const AUG = { id: 'a-3', name: 'August 2026 tournament', status: 'setup', created_at: '2026-08-01T10:00:00Z' };

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
    ;globalThis.__bridge = {
      // Seed the admin state the picker reads. teamsFor names the tournament whose collections are loaded
      // (which is exactly what state.activeTournamentId means to tdbRefreshTournaments).
      seed: (list, opts) => {
        opts = opts || {};
        state.isAdmin = true;
        state.tournaments = list || [];
        state.activeTournamentId = ('active' in opts) ? opts.active : null;
        state.tournamentTeams = opts.teams || [];
        state.tournamentPools = opts.pools || [];
        state.tournamentMatches = opts.matches || [];
        state.players = []; state.checkedIn = []; state.pickupDays = []; state.currentSession = null;
        manageView = opts.manageView || 'tournament';
        mgtView = ('mgtView' in opts) ? opts.mgtView : null;
        mgtPickerOpen = !!opts.picker;
        mgtFromPicker = !!opts.fromPicker;
        // The picker's row tap kicks a refresh; stub it so these tests stay about the picker, not the DB.
        tdbRefreshTournaments = async () => { globalThis.__refreshes++; };
      },
      // What the Manage container paints right now — the same call the 15s poll makes.
      paint: () => manageContainerHTML(),
      resolver: () => { const t = publicLiveTournament(); return t ? t.id : null; },
      flags: () => ({ picker: mgtPickerOpen, fromPicker: mgtFromPicker, mgtView, manageView }),
      after: () => ({
        active: state.activeTournamentId,
        teams: (state.tournamentTeams || []).length,
        pools: (state.tournamentPools || []).length,
        matches: (state.tournamentMatches || []).length,
        refreshes: globalThis.__refreshes,
      }),
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
  const start = html.indexOf(`data-mgt-pick="${id}"`);
  if (start < 0) return '';
  const from = html.lastIndexOf('<a', start);
  const end = html.indexOf('</a>', start);
  return html.slice(from, end + 4);
}

describe('the picker list', () => {
  it('renders EVERY loaded tournament, newest first', () => {
    const { bridge } = loadApp();
    // Seeded oldest-first on purpose: the list must sort, not just echo the load order.
    bridge.seed([JUNE, JULY, AUG], { picker: true, active: JULY.id });
    const html = bridge.paint();
    expect(rowOrder(html)).toEqual(['August 2026 tournament', 'July 2026 tournament', 'June 2026 tournament']);
    [JUNE, JULY, AUG].forEach((t) => expect(html).toContain(`data-mgt-pick="${t.id}"`));
  });

  it('sorts a row carrying no created_at to the END rather than letting it jump the queue', () => {
    const { bridge } = loadApp();
    bridge.seed([{ id: 'no-date', name: 'Undated', status: 'setup' }, JULY, AUG], { picker: true, active: JULY.id });
    expect(rowOrder(bridge.paint())).toEqual(['August 2026 tournament', 'July 2026 tournament', 'Undated']);
  });

  it('uses the shipped Manage row grammar so it reads like the rest of Manage', () => {
    const { bridge } = loadApp();
    bridge.seed([JULY, AUG], { picker: true, active: JULY.id });
    const html = bridge.paint();
    expect(html).toContain('class="mg-row" data-mgt-pick=');
    expect(html).toContain('class="mg-rb"');
    expect(html).toContain('class="mg-rn"');
    expect(html).toContain('class="mg-rs"');
    expect(html).not.toContain('pd-card');
    expect(html).toContain('class="pd-htitle">Tournaments<');
  });

  it('keeps + Create another tournament on the list, where it belongs', () => {
    const { bridge } = loadApp();
    bridge.seed([JULY, AUG], { picker: true, active: JULY.id });
    const html = bridge.paint();
    expect(html).toContain('data-mgt-create');
    expect(html).toContain('Create another tournament');
    // ...and it is not a row: a create tap must never read as picking a tournament.
    expect(html).not.toContain('data-mgt-pick="create"');
  });

  it('its back button leaves the area for the Manage lead', () => {
    const { bridge } = loadApp();
    bridge.seed([JULY, AUG], { picker: true, active: JULY.id });
    expect(bridge.paint()).toContain('data-mg-area="lead"');
  });

  it('escapes the tournament name', () => {
    const { bridge } = loadApp();
    bridge.seed([{ id: 'x', name: '<img src=x> & "Mike\'s"', status: 'setup', created_at: '2026-08-02T00:00:00Z' }, AUG],
      { picker: true, active: 'x' });
    const html = bridge.paint();
    expect(html).not.toContain('<img src=x>');
    expect(html).toContain('&lt;img src=x&gt;');
  });
});

describe('every subtitle clause is backed by loaded state', () => {
  it('prints the stage word for each status', () => {
    const { bridge } = loadApp();
    bridge.seed([
      { id: 's', name: 'S', status: 'setup', created_at: '2026-08-04T00:00:00Z' },
      { id: 'p', name: 'P', status: 'pools', created_at: '2026-08-03T00:00:00Z' },
      { id: 'b', name: 'B', status: 'bracket', created_at: '2026-08-02T00:00:00Z' },
      { id: 'c', name: 'C', status: 'completed', created_at: '2026-08-01T00:00:00Z' },
    ], { picker: true });
    const html = bridge.paint();
    expect(rowFor(html, 's')).toContain('Setup');
    expect(rowFor(html, 'p')).toContain('Pool play');
    expect(rowFor(html, 'b')).toContain('Bracket');
    expect(rowFor(html, 'c')).toContain('Completed');
  });

  it('carries the stage word again as the right-hand state word, like the sub-hub rows', () => {
    const { bridge } = loadApp();
    bridge.seed([JULY, AUG], { picker: true });
    expect(rowFor(bridge.paint(), JULY.id)).toContain('<span class="mgv-rmeta">Pool play</span>');
  });

  it('prints NO stage word and NO state word for a status it does not know', () => {
    const { bridge } = loadApp();
    bridge.seed([{ id: 'weird', name: 'Weird', status: 'archived_by_someone', created_at: '2026-08-01T00:00:00Z' }, AUG],
      { picker: true });
    const row = rowFor(bridge.paint(), 'weird');
    expect(row).not.toContain('mgv-rmeta');
    expect(row).not.toContain('Setup');          // NOT defaulted to the sub-hub's fallback
    expect(row).not.toContain('archived_by_someone');
  });

  it('prints the team count ONLY on the tournament whose teams are actually loaded', () => {
    const { bridge } = loadApp();
    bridge.seed([JULY, AUG], { picker: true, active: JULY.id, teams: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] });
    const html = bridge.paint();
    expect(rowFor(html, JULY.id)).toContain('3 teams');
    // AUG's collections are not loaded. Borrowing July's count would print one tournament's number under
    // another's name — the exact thing the 2026-07-11 resolver note calls out.
    expect(rowFor(html, AUG.id)).not.toContain('team');
  });

  it('says "1 team", not "1 teams"', () => {
    const { bridge } = loadApp();
    bridge.seed([JULY, AUG], { picker: true, active: JULY.id, teams: [{ id: 'a' }] });
    expect(rowFor(bridge.paint(), JULY.id)).toContain('1 team ');
  });

  it('prints no team count at all when nothing is selected', () => {
    const { bridge } = loadApp();
    bridge.seed([JULY, AUG], { picker: true, active: null, teams: [{ id: 'a' }, { id: 'b' }] });
    const html = bridge.paint();
    expect(rowFor(html, JULY.id)).not.toContain('team');
    expect(rowFor(html, AUG.id)).not.toContain('team');
  });

  it('drops the created clause when created_at is missing or unparseable', () => {
    const { bridge } = loadApp();
    bridge.seed([
      { id: 'none', name: 'No date', status: 'setup' },
      { id: 'junk', name: 'Junk date', status: 'setup', created_at: 'not a date' },
      AUG,
    ], { picker: true });
    const html = bridge.paint();
    expect(rowFor(html, 'none')).not.toContain('Created');
    expect(rowFor(html, 'junk')).not.toContain('Created');
    expect(rowFor(html, 'junk')).not.toContain('Invalid Date');
    expect(rowFor(html, AUG.id)).toContain('Created');
  });

  it('leaves the sub-line empty rather than inventing filler when nothing is backed', () => {
    const { bridge } = loadApp();
    bridge.seed([{ id: 'bare', name: 'Bare' }, AUG], { picker: true });
    const row = rowFor(bridge.paint(), 'bare');
    expect(row).toContain('<div class="mg-rs"></div>');
    expect(row).not.toContain('—');
    expect(row).not.toContain('·');
  });
});

describe('the Players see this label', () => {
  it('lands on exactly the row publicLiveTournament() returns', () => {
    const { bridge } = loadApp();
    bridge.seed([JUNE, JULY, AUG], { picker: true, active: AUG.id });
    const liveId = bridge.resolver();
    expect(liveId).toBe(JULY.id);                       // the only pools/bracket row
    const html = bridge.paint();
    expect(rowFor(html, liveId)).toContain('Players see this');
    expect(rowFor(html, JUNE.id)).not.toContain('Players see this');
    expect(rowFor(html, AUG.id)).not.toContain('Players see this');
    expect(html.split('Players see this').length - 1).toBe(1);   // exactly one row claims it
  });

  it('follows the resolver when the ADMIN selection is itself live, rather than the first live row', () => {
    const { bridge } = loadApp();
    const secondLive = { id: 'live-2', name: 'Second live', status: 'bracket', created_at: '2026-05-01T00:00:00Z' };
    bridge.seed([JULY, secondLive], { picker: true, active: secondLive.id });
    // publicLiveTournament prefers state.activeTournamentId when that row is itself pools/bracket.
    expect(bridge.resolver()).toBe(secondLive.id);
    const html = bridge.paint();
    expect(rowFor(html, secondLive.id)).toContain('Players see this');
    expect(rowFor(html, JULY.id)).not.toContain('Players see this');
  });

  it('marks NO row and says so once when the resolver returns null', () => {
    const { bridge } = loadApp();
    bridge.seed([JUNE, AUG], { picker: true, active: AUG.id });   // completed + setup: nothing is live
    expect(bridge.resolver()).toBe(null);
    const html = bridge.paint();
    expect(html).not.toContain('Players see this');
    expect(html).toContain('Players are not being shown any tournament right now.');
    expect(html.split('Players are not being shown').length - 1).toBe(1);
  });

  it('drops that line the moment a tournament IS live', () => {
    const { bridge } = loadApp();
    bridge.seed([JUNE, JULY, AUG], { picker: true, active: AUG.id });
    expect(bridge.paint()).not.toContain('Players are not being shown');
  });
});

describe('picking a tournament', () => {
  it('a real tap on a row repoints activeTournamentId and opens the sub-hub', () => {
    const app = loadApp();
    app.bridge.seed([JUNE, JULY, AUG], { picker: true, active: JULY.id });
    const bound = app.tap('[data-mgt-pick]', 'data-mgt-pick', AUG.id);
    expect(bound).toBeGreaterThan(0);                    // the delegate exists at all
    expect(app.bridge.after().active).toBe(AUG.id);
    const flags = app.bridge.flags();
    expect(flags.picker).toBe(false);
    expect(flags.fromPicker).toBe(true);
    expect(flags.mgtView).toBe(null);
    // The sub-hub for the picked tournament, not the list.
    const html = app.bridge.paint();
    expect(html).toContain('class="pd-htitle">August 2026 tournament<');
    expect(html).toContain('data-mgt-view="registration"');
    expect(html).not.toContain('data-mgt-pick');
  });

  it('clears the previous tournament’s teams/pools/matches and kicks a refresh', () => {
    const app = loadApp();
    app.bridge.seed([JULY, AUG], {
      picker: true, active: JULY.id,
      teams: [{ id: 't' }], pools: [{ id: 'p' }], matches: [{ id: 'm' }],
    });
    app.tap('[data-mgt-pick]', 'data-mgt-pick', AUG.id);
    const after = app.bridge.after();
    expect(after).toMatchObject({ active: AUG.id, teams: 0, pools: 0, matches: 0, refreshes: 1 });
  });

  it('does not touch the loaded collections when the picked row is already the active one', () => {
    const app = loadApp();
    app.bridge.seed([JULY, AUG], { picker: true, active: JULY.id, teams: [{ id: 't' }, { id: 'u' }] });
    app.tap('[data-mgt-pick]', 'data-mgt-pick', JULY.id);
    const after = app.bridge.after();
    expect(after).toMatchObject({ active: JULY.id, teams: 2, refreshes: 0 });
    expect(app.bridge.flags().picker).toBe(false);
  });

  it('refuses to open a sub-hub over a row that is no longer in state', () => {
    const app = loadApp();
    app.bridge.seed([JULY, AUG], { picker: true, active: JULY.id });
    app.tap('[data-mgt-pick]', 'data-mgt-pick', 'deleted-under-him');
    expect(app.bridge.after().active).toBe(JULY.id);    // selection untouched
    expect(app.bridge.flags().picker).toBe(true);        // still on the list
    expect(app.bridge.paint()).toContain('data-mgt-pick');
  });
});

describe('back navigation', () => {
  it('the sub-hub returns to the LIST once he has arrived from it', () => {
    const { bridge } = loadApp();
    bridge.seed([JULY, AUG], { active: AUG.id, fromPicker: true });
    const html = bridge.paint();
    expect(html).toContain('data-mgt-tolist');
    expect(html).not.toContain('data-mg-area="lead"');
  });

  it('a real tap on that back button reopens the picker', () => {
    const app = loadApp();
    app.bridge.seed([JULY, AUG], { active: AUG.id, fromPicker: true });
    app.tap('[data-mgt-tolist]', 'data-mgt-tolist', '');
    const flags = app.bridge.flags();
    expect(flags.picker).toBe(true);
    expect(flags.fromPicker).toBe(false);
    const html = app.bridge.paint();
    expect(html).toContain('data-mgt-pick');
    expect(html).toContain('class="pd-htitle">Tournaments<');
  });

  it('stays reachable after a second tournament appears under a sub-hub he did not reach from the list', () => {
    // The create control on the sub-hub is how one tournament becomes two. If back still went to Manage,
    // the new one would only be reachable by leaving the area and coming back.
    const { bridge } = loadApp();
    bridge.seed([JULY, AUG], { active: AUG.id, fromPicker: false });
    expect(bridge.paint()).toContain('data-mgt-tolist');
  });

  it('keeps the shipped Manage-lead back button when there is only one tournament', () => {
    const { bridge } = loadApp();
    bridge.seed([AUG], { active: AUG.id });
    const html = bridge.paint();
    expect(html).toContain('data-mg-area="lead"');
    expect(html).not.toContain('data-mgt-tolist');
  });

  it('and on the empty state, where there is nothing to pick between at all', () => {
    const { bridge } = loadApp();
    bridge.seed([], { active: null });
    const html = bridge.paint();
    expect(html).toContain('data-mg-area="lead"');
    expect(html).not.toContain('data-mgt-tolist');
    expect(html).toContain('data-mgt-create');
  });

  it('leaves the sub-VIEW back button alone (it still returns to the sub-hub, not the list)', () => {
    const { bridge } = loadApp();
    bridge.seed([JULY, AUG], { active: AUG.id, fromPicker: true, mgtView: 'registration' });
    const html = bridge.paint();
    expect(html).toContain('data-mgt-back');
    expect(html).not.toContain('data-mgt-tolist');
  });
});

describe('entering Manage → Tournament', () => {
  it('lands on the PICKER when there is more than one tournament to pick between', () => {
    const app = loadApp();
    app.bridge.seed([JUNE, JULY, AUG], { manageView: 'lead', active: JULY.id });
    app.tap('[data-mg-area]', 'data-mg-area', 'tournament');
    const flags = app.bridge.flags();
    expect(flags.manageView).toBe('tournament');
    expect(flags.picker).toBe(true);
    expect(flags.mgtView).toBe(null);
    expect(app.bridge.paint()).toContain('data-mgt-pick');
  });

  it('goes straight into the only tournament’s sub-hub when there is exactly one', () => {
    const app = loadApp();
    app.bridge.seed([AUG], { manageView: 'lead', active: AUG.id });
    app.tap('[data-mg-area]', 'data-mg-area', 'tournament');
    expect(app.bridge.flags().picker).toBe(false);
    const html = app.bridge.paint();
    expect(html).toContain('class="pd-htitle">August 2026 tournament<');
    expect(html).not.toContain('data-mgt-pick');
    expect(html).toContain('data-mgt-create');           // creating another is still reachable from here
  });

  it('goes to the sub-hub empty state when there are none', () => {
    const app = loadApp();
    app.bridge.seed([], { manageView: 'lead', active: null });
    app.tap('[data-mg-area]', 'data-mg-area', 'tournament');
    expect(app.bridge.flags().picker).toBe(false);
    expect(app.bridge.paint()).toContain('No tournament yet.');
  });

  it('is a fresh landing: no stale sub-view and no stale from-the-list flag', () => {
    const app = loadApp();
    app.bridge.seed([JUNE, JULY, AUG], { manageView: 'lead', active: JULY.id, mgtView: 'bracket', fromPicker: true });
    app.tap('[data-mg-area]', 'data-mg-area', 'tournament');
    const flags = app.bridge.flags();
    expect(flags.mgtView).toBe(null);
    expect(flags.fromPicker).toBe(false);
  });
});

describe('the 15s background poll', () => {
  it('repaints the SUB-HUB he is on, never dropping him back to the list', () => {
    const app = loadApp();
    app.bridge.seed([JUNE, JULY, AUG], { picker: true, active: JULY.id });
    app.tap('[data-mgt-pick]', 'data-mgt-pick', AUG.id);
    // paint() is the exact call the poll's manage branch makes into the container.
    const first = app.bridge.paint();
    const second = app.bridge.paint();
    expect(second).toBe(first);
    expect(second).toContain('class="pd-htitle">August 2026 tournament<');
    expect(second).not.toContain('data-mgt-pick');
  });

  it('repaints an open SUB-VIEW rather than replacing it with the list', () => {
    const { bridge } = loadApp();
    // Both flags set at once is what a poll sees mid-flow if the picker flag were ever left standing.
    bridge.seed([JULY, AUG], { picker: true, active: AUG.id, mgtView: 'registration' });
    const html = bridge.paint();
    expect(html).toContain('class="pd-htitle">Registration<');
    expect(html).not.toContain('data-mgt-pick');
  });

  it('keeps repainting the LIST while he is on it', () => {
    const { bridge } = loadApp();
    bridge.seed([JULY, AUG], { picker: true, active: JULY.id });
    expect(bridge.paint()).toContain('data-mgt-pick');
    expect(bridge.paint()).toContain('data-mgt-pick');
  });
});

describe('wiring, copy, and what was deliberately NOT built', () => {
  it('every function the new call sites name is DEFINED', () => {
    const { bridge } = loadApp();
    ['buildMgTournamentPickerHTML', 'mgTournamentPickerList', 'mgtPickRowHTML', 'mgtHubBackToList',
      'mgOpenTournamentPicker', 'mgPickTournament', 'publicLiveTournament', 'mgShortDate',
      'repaintManage', 'tdbRefreshTournaments'].forEach((fn) =>
      expect(bridge.defined(fn), fn + ' is not defined').toBe('function'));
  });

  it('carries no em dash and no emoji anywhere in its copy', () => {
    const { bridge } = loadApp();
    bridge.seed([JUNE, AUG], { picker: true, active: AUG.id });   // the no-live-tournament line included
    const html = bridge.paint();
    expect(html).not.toContain('—');
    expect(html).not.toContain('&mdash;');
    expect(html).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });

  it('ships NO column-dependent code: the public tournament is LABELLED, never set', () => {
    // There is no featured / is_public / public_active column on `tournaments`; publicLiveTournament
    // resolves by STATUS alone. Reading a column that may not be applied is the silent-null failure this
    // project has been burned by, so the picker labels and stops. Comments may discuss it; code may not.
    const code = APP_SRC.split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    expect(code).not.toMatch(/is_public|public_active|featured/);
    const { bridge } = loadApp();
    bridge.seed([JUNE, JULY, AUG], { picker: true, active: AUG.id });
    const html = bridge.paint();
    // No switch, no radio, no "make this the public one" control anywhere on the list.
    expect(html).not.toMatch(/data-mgt-(setlive|public|feature)/);
    expect(html).not.toContain('mg-sw');
    expect(html).not.toMatch(/<input/);
  });
});
