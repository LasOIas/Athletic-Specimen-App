// Choose a tournament — the picker (round 2026-08-04 as a SCREEN, round 2026-08-25 as an INLINE PANEL).
//
// WHY THIS FILE EXISTS: Manage → Tournament jumped straight into ONE tournament — whichever sat at
// state.activeTournamentId — with no list and no way to reach a different one. Mike hit that with two
// events in play and ended up RENAMING an old tournament rather than managing two.
//
// WHAT CHANGED ON 2026-08-25, and why every CONTAINER assertion in this file moved: the choice stopped
// being a screen. "the tournament IS the page title": tapping it drops `.mgh-pick` over the rows, you pick,
// and you are switched where you stand — no navigation, no back button, nothing to return from. So
// `manageView === 'tournaments'`, buildMgTournamentListHTML, mgtlRowHTML, MGTL_NEW_ROW_HTML,
// data-mgtl-pick and data-mgtl-back are all retired, and the assertions that pinned them now pin the panel:
//   * the chooser's `<a class="mgv-trow">` + `.mgv-tdot` → `<button class="mgh-prow">` + `.is-on` (a fill,
//     not a dot: selection, not navigation).
//   * data-mgtl-pick → data-mgp-pick, opened by data-mgp-toggle, closed by a pick / a tap outside / Escape.
//   * the caption, the back button and the closing note → the one `.mgh-pnote` sentence inside the panel.
//   * "Players see this" → still dropped. Mike ANSWERED that open question in the handoff: active is an
//     ORGANIZER-SIDE POINTER ONLY and the public Tournament tab still follows the live event, so the picker
//     says nothing about the public at all. publicLiveTournament() is untouched (asserted below).
//
// The five things pinned here, in order of what would hurt most if it regressed:
//   1. NO SUBTITLE CLAUSE IS EVER PRINTED FROM DATA THAT IS NOT LOADED. state.tournamentTeams belongs to
//      state.activeTournamentId and to nothing else, so a team count on any other row would be one
//      tournament's number printed under another's name. Same for the date column that migration 0057 has
//      not added yet: the clause is dropped, never defaulted. (Mike's standing ruling, 2026-08-03 round.)
//   2. GROUPING IS BY PHASE and EXACTLY ONE ROW IS MARKED. The fill follows mgActiveTournament(), the same
//      resolver the title names, so the marked row and the title can never disagree.
//   3. A PICK STICKS — and now SURVIVES A RELOAD. mgSyncActiveTournament() re-glues the selection to the
//      lead resolver on every area entry; without the pin an explicit pick would be silently undone by the
//      very next row tap, which is the one way this feature could look broken while every builder was
//      correct. The pin is written to localStorage and rehydrated after the first list load.
//   4. THE FINISHED ROWS READ THE SAME SOURCE as the public Past-tournaments screen, so the two lists
//      cannot disagree about who won.
//   5. THE ROWS ARE ACTUALLY WIRED. On 2026-08-03 a drag's Undo shipped completely inert while 37 green
//      unit tests called the function directly and never travelled the click path. So the taps below drive
//      attachHandlers' real #app-content delegate.
//
// WHAT THIS DOES NOT PROVE (§17): that the panel LOOKS right on his phone (it renders on the shipped
// .mgh-prow / .mgh-pstate grammar, asserted here as class grammar, not as pixels), and nothing about the
// server — the picker only reads state that is already loaded.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const APP_SRC = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const mgSrc = readFileSync(new URL('../public/manage.js', import.meta.url), 'utf8');

const JUNE = { id: 'j-1', name: 'June 2026 tournament', status: 'completed', created_at: '2026-06-01T10:00:00Z' };
const JULY = { id: 'j-2', name: 'July 2026 tournament', status: 'pools', created_at: '2026-07-01T10:00:00Z' };
const AUG = { id: 'a-3', name: 'August 2026 tournament', status: 'setup', registration_open: true, created_at: '2026-08-01T10:00:00Z' };

function loadApp(opts0) {
  const store = Object.assign({}, (opts0 || {}).store);
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
  // The picker's Escape handler is bound on DOCUMENT, not on #app-content (a keypress with focus back on
  // <body> would never reach a container-scoped listener), so document's listeners are captured the same
  // way — otherwise the only thing a test could check is that the source string exists, which proves
  // nothing about whether the key actually closes the panel.
  const docListeners = {};
  const documentStub = {
    readyState: 'loading',
    getElementById: (id) => (id === 'app-content' ? appContentEl : null),
    querySelector: () => null, querySelectorAll: () => emptyList,
    createElement: () => makeEl(), createDocumentFragment: () => makeEl(),
    addEventListener: (type, fn) => { (docListeners[type] = docListeners[type] || []).push(fn); },
    removeEventListener: noop,
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
    addEventListener: noop, removeEventListener: noop, dispatchEvent: noop,
    matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop, removeEventListener: noop }),
    location: { href: 'http://localhost/', search: '', hash: '', pathname: '/', reload: noop },
    navigator: { onLine: true, userAgent: 'node', serviceWorker: { register: async () => ({}) } },
    requestAnimationFrame: noop, cancelAnimationFrame: noop,
    setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop, scrollTo: noop,
  };
  windowStub.window = windowStub;
  // A REAL in-memory store, because the pick now has to survive a reload and "did it write the key" is
  // exactly the thing a no-op stub cannot answer.
  const localStorageStub = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
    key: () => null, length: 0,
  };
  const sandbox = {
    window: windowStub, document: documentStub, localStorage: localStorageStub,
    // activateMainTab records the tab; without this the boot-paint test cannot travel the real path.
    sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop, clear: noop, key: () => null, length: 0 },
    navigator: windowStub.navigator, location: windowStub.location,
    requestAnimationFrame: noop, cancelAnimationFrame: noop,
    setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop,
    console, SUPABASE_URL: 'http://localhost', SUPABASE_KEY: 'anon',
    // Now that document's listeners are captured, a dispatched keydown reaches EVERY handler the app binds
    // there, including the co-pilot's `t instanceof Element` guard. A browser has Element; the vm does not.
    // A bare constructor is the honest stub: a plain-object target is not an instance, so that handler bails
    // exactly as it does in the browser when the key was not typed into #copilot-input.
    Element: function Element() {},
    // activateMainTab fires window.dispatchEvent(new Event('as-tab-changed')); windowStub.dispatchEvent is a
    // noop, but the constructor still has to exist for the argument to be built.
    Event: function Event(type) { this.type = type; },
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
        manageView = ('manageView' in opts) ? opts.manageView : 'lead';
        mgtView = ('mgtView' in opts) ? opts.mgtView : null;
        mgTournamentPinned = !!opts.pinned;
        mgHubPickerOpen = !!opts.pickerOpen;
        mgHubDoneText = '';
        // The row tap kicks a refresh; stub it so these tests stay about the chooser, not the DB.
        tdbRefreshTournaments = async () => { globalThis.__refreshes++; };
        loadTournamentHistory = async () => { globalThis.__historyLoads++; };
      },
      setActive: (id) => { state.activeTournamentId = id; },
      // The BOOT paint: first paint runs activateMainTab(activeMainTab) with the tab restored from storage.
      activateTab: (t) => { activateMainTab(t); },
      adoptStored: () => mgAdoptStoredTournament(),
      // What the Manage container paints right now — the same call the 15s poll makes.
      paint: () => manageContainerHTML(),
      resolver: () => { const t = publicLiveTournament(); return t ? t.id : null; },
      managed: () => { const t = mgActiveTournament(); return t ? t.id : null; },
      flags: () => ({ mgtView, manageView, pinned: mgTournamentPinned, pickerOpen: mgHubPickerOpen }),
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
  vm.runInContext(mgSrc, context, { filename: 'manage.js' });   // C102: the Manage block loads before app.js, as in index.html
  vm.runInContext(APP_SRC + epilogue, context, { filename: 'app.js' });
  const bridge = sandbox.__bridge;
  bridge.bind();
  return {
    bridge,
    store,
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
    // THE KEYPRESS. Same idea, on the document-level keydown the Escape close is bound to.
    press(key) {
      (docListeners.keydown || []).forEach((fn) => fn({ key, preventDefault: noop, stopPropagation: noop }));
      return (docListeners.keydown || []).length;
    },
  };
}

// Row order as rendered, by tournament name.
function rowOrder(html) {
  return (html.match(/class="mgh-pn">([^<]*)</g) || []).map((m) => m.replace(/^class="mgh-pn">/, '').replace(/<$/, ''));
}
// The whole <button> element for one tournament id.
function rowFor(html, id) {
  const start = html.indexOf(`data-mgp-pick="${id}"`);
  if (start < 0) return '';
  const from = html.lastIndexOf('<button', start);
  const end = html.indexOf('</button>', start);
  return html.slice(from, end + 9);
}
// Everything between a group label and the next one (or the New tournament footer).
function section(html, label) {
  const start = html.indexOf(`<div class="mgh-pgrp">${label}</div>`);
  if (start < 0) return '';
  const next = html.indexOf('<div class="mgh-pgrp">', start + 1);
  const end = next < 0 ? html.indexOf('class="mgh-pnew"', start) : next;
  return html.slice(start, end < 0 ? html.length : end);
}
// Just the panel.
function panel(html) {
  const start = html.indexOf('<div class="mgh-pick"');
  if (start < 0) return '';
  return html.slice(start, html.indexOf('</div></div>', start) + 12);
}

describe('the picker list', () => {
  it('renders EVERY loaded tournament, newest first', () => {
    const { bridge } = loadApp();
    // Seeded oldest-first on purpose: the list must sort, not just echo the load order.
    bridge.seed([JUNE, JULY, AUG], { active: JULY.id });
    const html = bridge.paint();
    expect(rowOrder(html)).toEqual(['August 2026 tournament', 'July 2026 tournament', 'June 2026 tournament']);
  });

  it('sorts a row carrying no created_at to the END rather than letting it jump the queue', () => {
    const { bridge } = loadApp();
    bridge.seed([{ id: 'x', name: 'Undated', status: 'setup' }, JULY, AUG], { active: JULY.id });
    expect(rowOrder(bridge.paint())).toEqual(['August 2026 tournament', 'July 2026 tournament', 'Undated']);
  });

  it('uses the design’s selection grammar: a fill, a state word, and NO chevron', () => {
    const { bridge } = loadApp();
    bridge.seed([JULY, AUG], { active: AUG.id });
    const html = bridge.paint();
    const row = rowFor(html, AUG.id);
    expect(row).toContain('class="mgh-prow is-on"');
    expect(row).toContain('class="mgh-pn">August 2026 tournament<');
    expect(row).toContain('class="mgh-pstate">Registration<');
    expect(row).not.toContain('mg-chev');
    expect(row).not.toContain('mgv-tdot');    // the retired chooser's radio dot
    expect(html).not.toContain('data-mgtl-pick');
  });

  it('renders the panel HIDDEN until the title is tapped, and never as a second screen', () => {
    const app = loadApp();
    app.bridge.seed([JULY, AUG], { active: AUG.id });
    expect(app.bridge.paint()).toContain('data-mgp-panel hidden');
    app.tap('[data-mgp-toggle]', 'data-mgp-toggle', '');
    expect(app.bridge.flags().pickerOpen).toBe(true);
    expect(app.bridge.flags().manageView).toBe('lead');   // no navigation happened
    const open = app.bridge.paint();
    expect(open).toContain('data-mgp-panel>');
    expect(open).toContain('aria-expanded="true"');
  });

  it('carries the scope sentence INSIDE the panel, where it is only read when relevant', () => {
    const { bridge } = loadApp();
    bridge.seed([JULY, AUG], { active: AUG.id });
    const html = bridge.paint();
    expect(html).toContain('Everything in Manage edits the one you pick. Finished tournaments stay open so you can fix a score after the fact.');
    expect(html).not.toContain('Every row below edits this one.');   // the retired footnote
    expect(html).not.toContain('Manage edits whichever one is filled in below.');
    expect(html).not.toContain('data-mgtl-back');                    // nothing to go back from
  });

  it('puts New tournament at the BOTTOM of the panel, as its footer row', () => {
    const { bridge } = loadApp();
    bridge.seed([JULY, AUG], { active: AUG.id });
    const html = bridge.paint();
    expect(html).toContain('class="mgh-pnew" data-mgtl-new');
    expect(html.indexOf('class="mgh-pnew"')).toBeGreaterThan(html.indexOf('data-mgp-pick'));
  });

  it('still offers the create row when there is nothing to choose between yet', () => {
    const { bridge } = loadApp();
    bridge.seed([], { active: null });
    const html = bridge.paint();
    expect(html).toContain('data-mgtl-new');
    expect(html).toContain('class="mgh-tname">No tournament yet<');
    expect(html).not.toContain('data-mgp-pick');
  });

  it('escapes the tournament name', () => {
    const { bridge } = loadApp();
    bridge.seed([{ id: 'x', name: '<img src=x onerror=alert(1)>', status: 'setup' }], { active: 'x' });
    const html = bridge.paint();
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });
});

describe('grouping by phase', () => {
  it('puts finished tournaments under Finished and everything else under This season', () => {
    const { bridge } = loadApp();
    bridge.seed([JUNE, JULY, AUG], { active: AUG.id });
    const html = bridge.paint();
    expect(section(html, 'This season')).toContain('August 2026 tournament');
    expect(section(html, 'This season')).toContain('July 2026 tournament');
    expect(section(html, 'Finished')).toContain('June 2026 tournament');
    expect(section(html, 'Finished')).not.toContain('July 2026 tournament');
  });

  it('omits a group that would be empty rather than printing a bare heading', () => {
    const noneFinished = loadApp();
    noneFinished.bridge.seed([JULY, AUG], { active: AUG.id });
    expect(noneFinished.bridge.paint()).not.toContain('>Finished</div>');

    const allFinished = loadApp();
    allFinished.bridge.seed([JUNE], { active: JUNE.id });
    expect(allFinished.bridge.paint()).not.toContain('>This season</div>');
  });

  it('prints the state word each phase can actually be backed by', () => {
    const { bridge } = loadApp();
    bridge.seed([
      { id: 'a', name: 'Reg', status: 'setup', registration_open: true, created_at: '2026-05-05' },
      { id: 'b', name: 'Closed', status: 'setup', registration_open: false, created_at: '2026-05-04' },
      { id: 'c', name: 'Pools', status: 'pools', created_at: '2026-05-03' },
      { id: 'd', name: 'Bracket', status: 'bracket', created_at: '2026-05-02' },
      { id: 'e', name: 'Done', status: 'completed', created_at: '2026-05-01' },
    ], { active: 'a' });
    const html = bridge.paint();
    expect(rowFor(html, 'a')).toContain('class="mgh-pstate">Registration<');
    expect(rowFor(html, 'b')).toContain('class="mgh-pstate">Setup<');
    expect(rowFor(html, 'c')).toContain('class="mgh-pstate">Pool play<');
    expect(rowFor(html, 'd')).toContain('class="mgh-pstate">Bracket<');
    expect(rowFor(html, 'e')).toContain('class="mgh-pstate">Finished<');
    // No column separates a draft from a scheduled event, so neither word is ever produced.
    expect(html).not.toContain('Draft');
    expect(html).not.toContain('Scheduled');
  });

  it('prints NO state word for a status it does not know, and groups it with This season', () => {
    const { bridge } = loadApp();
    bridge.seed([{ id: 'z', name: 'Odd', status: 'whatever', created_at: '2026-05-05' }], { active: 'z' });
    const html = bridge.paint();
    expect(rowFor(html, 'z')).not.toContain('class="mgh-pstate"');
    expect(section(html, 'This season')).toContain('Odd');
  });
});

describe('exactly one row is filled in', () => {
  it('marks the tournament the title names, and only that one', () => {
    const { bridge } = loadApp();
    bridge.seed([JUNE, JULY, AUG], { active: AUG.id, pinned: true });
    const html = bridge.paint();
    expect((html.match(/class="mgh-prow is-on"/g) || []).length).toBe(1);
    expect(rowFor(html, AUG.id)).toContain('is-on');
    expect(html).toContain('class="mgh-tname">August 2026 tournament<');
  });

  it('follows mgActiveTournament even when nothing was explicitly picked, so the title and the fill agree', () => {
    const { bridge } = loadApp();
    // Nothing active → the lead resolver returns the LIVE tournament, and that is the row that fills in.
    bridge.seed([JUNE, JULY, AUG], { active: null });
    expect(bridge.managed()).toBe(JULY.id);
    expect(rowFor(bridge.paint(), JULY.id)).toContain('is-on');
  });

  it('marks a FINISHED row when that is the one being managed (the design allows picking one)', () => {
    const { bridge } = loadApp();
    bridge.seed([JUNE, AUG], { active: JUNE.id, pinned: true });
    expect(rowFor(bridge.paint(), JUNE.id)).toContain('is-on');
  });
});

describe('every subtitle clause is backed by loaded state', () => {
  it('prints the team count ONLY on the tournament whose teams are actually loaded', () => {
    const { bridge } = loadApp();
    bridge.seed([JULY, AUG], { active: AUG.id, teams: [{ id: 't1' }, { id: 't2' }] });
    expect(rowFor(bridge.paint(), AUG.id)).toContain('2 teams');
    expect(rowFor(bridge.paint(), JULY.id)).not.toContain('teams');
  });

  it('says "1 team", not "1 teams"', () => {
    const { bridge } = loadApp();
    bridge.seed([AUG], { active: AUG.id, teams: [{ id: 't1' }] });
    expect(rowFor(bridge.paint(), AUG.id)).toContain('1 team<');
  });

  it('prints no team count at all when nothing is selected', () => {
    const { bridge } = loadApp();
    bridge.seed([JULY, AUG], { active: null, teams: [{ id: 't1' }, { id: 't2' }] });
    const html = bridge.paint();
    expect(rowFor(html, AUG.id)).not.toContain('teams');
    expect(rowFor(html, JULY.id)).not.toContain('teams');
  });

  it('drops the DATE clause entirely while migration 0057 is unapplied', () => {
    const { bridge } = loadApp();
    bridge.seed([AUG], { active: AUG.id, teams: [{ id: 't1' }] });
    const row = rowFor(bridge.paint(), AUG.id);
    expect(row).not.toMatch(/Mon|Tue|Wed|Thu|Fri|Sat|Sun/);
    expect(row).not.toContain('—');
    expect(row).not.toContain('No date');
  });

  it('prints it as "Sat Aug 22" once the column is there, and drops it again on a null or junk value', () => {
    const real = loadApp();
    real.bridge.seed([{ ...AUG, event_date: '2026-08-22' }], { active: AUG.id, teams: [{ id: 't1' }] });
    expect(rowFor(real.bridge.paint(), AUG.id)).toContain('Sat Aug 22 · 1 team');

    const nulled = loadApp();
    nulled.bridge.seed([{ ...AUG, event_date: null }], { active: AUG.id, teams: [{ id: 't1' }] });
    expect(rowFor(nulled.bridge.paint(), AUG.id)).toContain('1 team');
    expect(rowFor(nulled.bridge.paint(), AUG.id)).not.toMatch(/Mon|Tue|Wed|Thu|Fri|Sat|Sun/);

    const junk = loadApp();
    junk.bridge.seed([{ ...AUG, event_date: 'soon' }], { active: AUG.id, teams: [{ id: 't1' }] });
    expect(rowFor(junk.bridge.paint(), AUG.id)).not.toContain('Invalid Date');
  });

  it('adds the cap only when team_cap is a real number on a real column', () => {
    const capped = loadApp();
    capped.bridge.seed([{ ...AUG, team_cap: 12 }], { active: AUG.id, teams: [{ id: 't1' }, { id: 't2' }] });
    expect(rowFor(capped.bridge.paint(), AUG.id)).toContain('2 of 12 teams');

    const nulled = loadApp();
    nulled.bridge.seed([{ ...AUG, team_cap: null }], { active: AUG.id, teams: [{ id: 't1' }, { id: 't2' }] });
    const row = rowFor(nulled.bridge.paint(), AUG.id);
    expect(row).toContain('2 teams');
    expect(row).not.toMatch(/of \d+ teams/);
  });

  it('leaves the sub-line off entirely rather than inventing filler when nothing is backed', () => {
    const { bridge } = loadApp();
    bridge.seed([JULY, AUG], { active: null });
    expect(rowFor(bridge.paint(), AUG.id)).not.toContain('class="mgh-ps"');
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
    expect(row).not.toContain('class="mgh-ps"');
    expect(row).toContain('class="mgh-pstate">Finished<');   // the one thing it does know
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

  it('warms that history on the BOOT paint of the Manage tab, not only when he opens the panel', () => {
    const app = loadApp();
    app.bridge.seed([JUNE, AUG], { manageView: 'lead', active: AUG.id });
    app.bridge.activateTab('manage');
    expect(app.bridge.after().historyLoads).toBe(1);
    // and the tab being re-entered later cannot double-fetch it
    app.bridge.seed([JUNE, AUG], { manageView: 'lead', active: AUG.id, history: [] });
    app.bridge.activateTab('manage');
    expect(app.bridge.after().historyLoads).toBe(1);
  });

  it('loads that history lazily on entering the hub, once, and only when a finished row needs it', () => {
    const app = loadApp();
    app.bridge.seed([JUNE, AUG], { manageView: 'players', active: AUG.id });
    app.tap('[data-mg-area]', 'data-mg-area', 'lead');
    expect(app.bridge.after().historyLoads).toBe(1);
    // Already loaded (even as an empty list) → not read again on the next entry.
    app.bridge.seed([JUNE, AUG], { manageView: 'players', active: AUG.id, history: [] });
    app.tap('[data-mg-area]', 'data-mg-area', 'lead');
    expect(app.bridge.after().historyLoads).toBe(1);
    // No finished tournament at all → nothing to describe, so nothing is fetched.
    const none = loadApp();
    none.bridge.seed([JULY, AUG], { manageView: 'players', active: AUG.id });
    none.tap('[data-mg-area]', 'data-mg-area', 'lead');
    expect(none.bridge.after().historyLoads).toBe(0);
  });
});

describe('picking a tournament', () => {
  it('a real tap on a row repoints activeTournamentId and closes the panel where he stands', () => {
    const app = loadApp();
    app.bridge.seed([JUNE, JULY, AUG], { active: JULY.id, pickerOpen: true });
    const bound = app.tap('[data-mgp-pick]', 'data-mgp-pick', AUG.id);
    expect(bound).toBeGreaterThan(0);                    // the delegate exists at all
    expect(app.bridge.after().active).toBe(AUG.id);
    const flags = app.bridge.flags();
    expect(flags.manageView).toBe('lead');
    expect(flags.mgtView).toBe(null);
    expect(flags.pickerOpen).toBe(false);
    // The hub, naming the picked tournament in its title.
    const html = app.bridge.paint();
    expect(html).toContain('class="mgh-tname">August 2026 tournament<');
    expect(html).toContain('data-mgp-panel hidden');
  });

  it('PINS the pick, so the lead resolver stops overriding it', () => {
    const app = loadApp();
    // JULY is live, so the lead resolver would otherwise pull the selection back to it on every row tap.
    app.bridge.seed([JUNE, JULY, AUG], { active: JULY.id });
    app.tap('[data-mgp-pick]', 'data-mgp-pick', AUG.id);
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
    app.tap('[data-mgp-pick]', 'data-mgp-pick', AUG.id);
    const after = app.bridge.after();
    expect(after).toMatchObject({ active: AUG.id, teams: 0, pools: 0, matches: 0, refreshes: 1 });
  });

  it('does not touch the loaded collections when the picked row is already the active one', () => {
    const app = loadApp();
    app.bridge.seed([JULY, AUG], { active: JULY.id, teams: [{ id: 't' }, { id: 'u' }] });
    app.tap('[data-mgp-pick]', 'data-mgp-pick', JULY.id);
    const after = app.bridge.after();
    expect(after).toMatchObject({ active: JULY.id, teams: 2, refreshes: 0 });
    expect(app.bridge.flags().manageView).toBe('lead');
  });

  it('refuses to switch to a row that is no longer in state', () => {
    const app = loadApp();
    app.bridge.seed([JULY, AUG], { active: JULY.id });
    app.tap('[data-mgp-pick]', 'data-mgp-pick', 'deleted-under-him');
    expect(app.bridge.after().active).toBe(JULY.id);      // selection untouched
    expect(app.bridge.flags().manageView).toBe('lead');
    expect(app.bridge.paint()).toContain('data-mgp-pick');
  });
});

describe('the panel closes the way a menu closes', () => {
  it('a tap outside it shuts it, and does ONLY that', () => {
    const app = loadApp();
    app.bridge.seed([JULY, AUG], { active: AUG.id, pickerOpen: true });
    app.tap('[data-mg-area]', 'data-mg-area', 'players');
    expect(app.bridge.flags().pickerOpen).toBe(false);
    // Dismissing a menu costs the tap that dismissed it: falling through would repaint two or three times
    // for one tap and leave the later branches calling closest() on a node the first repaint detached.
    expect(app.bridge.flags().manageView).toBe('lead');
    // and the very next tap does act, so nothing is stuck
    app.tap('[data-mg-area]', 'data-mg-area', 'players');
    expect(app.bridge.flags().manageView).toBe('players');
  });

  it('the toggle closes it again on a second tap', () => {
    const app = loadApp();
    app.bridge.seed([JULY, AUG], { active: AUG.id, pickerOpen: true });
    app.tap('[data-mgp-toggle]', 'data-mgp-toggle', '');
    expect(app.bridge.flags().pickerOpen).toBe(false);
  });

  it('Escape closes it, through the real document-level keydown listener', () => {
    const app = loadApp();
    app.bridge.seed([JULY, AUG], { active: AUG.id, pickerOpen: true });
    expect(app.bridge.paint()).toContain('data-mgp-panel>');     // open before the key
    const bound = app.press('Escape');
    expect(bound).toBeGreaterThan(0);                            // the listener exists at all
    expect(app.bridge.flags().pickerOpen).toBe(false);
    expect(app.bridge.paint()).toContain('data-mgp-panel hidden');
  });

  it('leaves every other key alone, and is a no-op when the panel is already shut', () => {
    const open = loadApp();
    open.bridge.seed([JULY, AUG], { active: AUG.id, pickerOpen: true });
    open.press('a');
    open.press('Enter');
    expect(open.bridge.flags().pickerOpen).toBe(true);

    const shut = loadApp();
    shut.bridge.seed([JULY, AUG], { active: AUG.id });
    expect(() => shut.press('Escape')).not.toThrow();
    expect(shut.bridge.flags().pickerOpen).toBe(false);
  });

  it('entering any Manage area leaves it shut, so it never reopens behind a screen', () => {
    const app = loadApp();
    app.bridge.seed([JULY, AUG], { active: AUG.id, manageView: 'players', pickerOpen: true });
    app.tap('[data-mg-area]', 'data-mg-area', 'lead');
    expect(app.bridge.flags().pickerOpen).toBe(false);
  });
});

describe('the pick survives a reload', () => {
  it('writes the pinned id to localStorage on a real tap', () => {
    const app = loadApp();
    app.bridge.seed([JULY, AUG], { active: JULY.id });
    app.tap('[data-mgp-pick]', 'data-mgp-pick', AUG.id);
    expect(JSON.parse(app.store['as-manage-tournament'])).toEqual({ id: AUG.id });
  });

  it('rehydrates it after the first list load, and pins it so the resolver stands down', () => {
    const app = loadApp({ store: { 'as-manage-tournament': JSON.stringify({ id: AUG.id }) } });
    app.bridge.seed([JUNE, JULY, AUG], { active: null });
    app.bridge.adoptStored();
    expect(app.bridge.after().active).toBe(AUG.id);
    expect(app.bridge.flags().pinned).toBe(true);
    expect(app.bridge.resync()).toBe(AUG.id);   // JULY is live, and does NOT win
  });

  it('a stored id that no longer exists is dropped, never adopted, so nothing blanks the page', () => {
    const app = loadApp({ store: { 'as-manage-tournament': JSON.stringify({ id: 'deleted-last-month' }) } });
    app.bridge.seed([JULY, AUG], { active: null });
    app.bridge.adoptStored();
    expect(app.bridge.flags().pinned).toBe(false);
    expect(app.store['as-manage-tournament']).toBe(undefined);   // and the dead key is cleaned up
    expect(app.bridge.managed()).toBe(JULY.id);                  // the resolver takes over again
    expect(app.bridge.paint()).toContain('class="mgh-tname">July 2026 tournament<');
  });

  it('survives junk in the key rather than throwing on boot', () => {
    const app = loadApp({ store: { 'as-manage-tournament': 'not json' } });
    app.bridge.seed([JULY, AUG], { active: null });
    expect(() => app.bridge.adoptStored()).not.toThrow();
    expect(app.bridge.flags().pinned).toBe(false);
  });

  it('is read ONCE — a later list refresh cannot re-pin a tournament he has since switched away from', () => {
    const app = loadApp({ store: { 'as-manage-tournament': JSON.stringify({ id: AUG.id }) } });
    app.bridge.seed([JUNE, JULY, AUG], { active: null });
    app.bridge.adoptStored();
    app.bridge.setActive(JULY.id);
    app.bridge.adoptStored();
    expect(app.bridge.after().active).toBe(JULY.id);
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
    expect(html).not.toContain('data-mgp-pick');
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

  it('a hub control carrying data-mgt-view opens the area STRAIGHT onto that sub-view', () => {
    const app = loadApp();
    app.bridge.seed([JULY, AUG], { manageView: 'lead', active: AUG.id, pinned: true });
    app.tap('[data-mgt-view]', 'data-mgt-view', 'teamadd');
    expect(app.bridge.flags()).toMatchObject({ manageView: 'tournament', mgtView: 'teamadd' });
  });
});

describe('the 15s background poll', () => {
  it('repaints the HUB while he is on it, never swapping it for something else', () => {
    const { bridge } = loadApp();
    bridge.seed([JULY, AUG], { active: JULY.id });
    const first = bridge.paint();
    const second = bridge.paint();
    expect(second).toBe(first);
    expect(second).toContain('data-mgp-pick');
  });

  it('cannot close an OPEN panel out from under him, because the flag is a module var', () => {
    const app = loadApp();
    app.bridge.seed([JULY, AUG], { active: JULY.id, pickerOpen: true });
    app.bridge.paint(); app.bridge.paint();
    expect(app.bridge.flags().pickerOpen).toBe(true);
    expect(app.bridge.paint()).toContain('data-mgp-panel>');
  });

  it('repaints the SUB-HUB he is on after a pick, never dropping him back to the hub', () => {
    const app = loadApp();
    app.bridge.seed([JUNE, JULY, AUG], { active: JULY.id });
    app.tap('[data-mgp-pick]', 'data-mgp-pick', AUG.id);
    app.tap('[data-mg-area]', 'data-mg-area', 'tournament');
    // paint() is the exact call the poll's manage branch makes into the container.
    const first = app.bridge.paint();
    const second = app.bridge.paint();
    expect(second).toBe(first);
    expect(second).toContain('class="pd-htitle">August 2026 tournament<');
    expect(second).not.toContain('data-mgp-pick');
  });

  it('repaints an open SUB-VIEW rather than replacing it', () => {
    const { bridge } = loadApp();
    bridge.seed([JULY, AUG], { manageView: 'tournament', active: AUG.id, mgtView: 'registration' });
    const html = bridge.paint();
    // (2026-08-25) The screen is titled "Registration & public page" now — the row that opens it says
    // the same thing, because what the admin edits there is what a player sees.
    expect(html).toContain('class="pd-htitle">Registration &amp; public page<');
    expect(html).not.toContain('data-mgp-pick');
  });

  it('cannot unpin an explicit pick, because the flag is a module var like every other manage toggle', () => {
    const app = loadApp();
    app.bridge.seed([JUNE, JULY, AUG], { active: JULY.id });
    app.tap('[data-mgp-pick]', 'data-mgp-pick', AUG.id);
    app.bridge.paint(); app.bridge.paint();
    expect(app.bridge.flags().pinned).toBe(true);
    expect(app.bridge.after().active).toBe(AUG.id);
  });
});

describe('wiring, copy, and what was deliberately NOT built', () => {
  it('every function the new call sites name is DEFINED', () => {
    const { bridge } = loadApp();
    ['mgHubScopeHTML', 'mgHubPickerHTML', 'mgHubTrackHTML', 'mgHubActsHTML', 'mgNeedsRowsHTML',
      'mgHubStateChip', 'mgLocalTodayStr', 'manageHubPhaseIndex', 'manageNeedsYouCtx',
      'mgHubFlipRegistration', 'mgHubReuseRules', 'mgHubEnsureHistory',
      'mgSaveTournamentPin', 'mgAdoptStoredTournament',
      'buildMgTournamentNewHTML', 'mgTournamentPickerList',
      'mgtlSeasonSub', 'mgtlFinishedSub', 'mgTournamentPhase',
      'mgEventDateLabel', 'mgTeamsClause', 'mgManagedTeamCount', 'mgTournamentRowStage',
      'mgPickTournament', 'mgAdoptTournament', 'mgActiveTournament', 'publicLiveTournament',
      'loadTournamentHistory', 'repaintManage', 'tdbRefreshTournaments'].forEach((fn) =>
      expect(bridge.defined(fn), fn + ' is not defined').toBe('function'));
  });

  it('the chooser SCREEN’s surface is gone, so there is only ONE way to switch', () => {
    const { bridge } = loadApp();
    // mgSwitcherMetaText went with the card it wrote for (final review 2026-08-25): no builder called it,
    // and it had drifted — a closed setup event read "registration closed" where the shipped hub meta line
    // says "not open yet". A second, staler sentence for the same facts is a bug waiting for a caller.
    ['buildMgTournamentListHTML', 'mgtlRowHTML', 'mgSwitcherCardHTML', 'mgSwitcherMetaText',
      'buildMgTournamentPickerHTML', 'mgtPickRowHTML', 'mgtHubBackToList', 'mgOpenTournamentPicker']
      .forEach((fn) => expect(bridge.defined(fn), fn + ' should have been retired').toBe('undefined'));
    bridge.seed([JULY, AUG], { active: AUG.id });
    const html = bridge.paint();
    expect(html).not.toContain('data-mgt-pick');
    expect(html).not.toContain('data-mgtl-pick');
    expect(html).not.toContain('data-mgtl-back');
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
  // Tournament tab still follows the live event. So the picker must not carry a public-visibility concept
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
    expect(html).not.toMatch(/players (see|are)/i);
    expect(html).not.toMatch(/public(ly)? (sees|see|visible|shown)/i);
  });

  it('ships NO column-dependent public-visibility code', () => {
    // There is no featured / is_public / public_active column on `tournaments`; publicLiveTournament
    // resolves by STATUS alone. Comments may discuss it; code may not.
    // C102: the client is two files; a guard over one would pass vacuously. (APP_SRC itself stays app.js
    // only, because loadApp runs it in the vm alongside mgSrc.)
    const code = (APP_SRC + '\n' + mgSrc).split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    expect(code).not.toMatch(/is_public|public_active|featured/);
    const { bridge } = loadApp();
    bridge.seed([JUNE, JULY, AUG], { active: AUG.id });
    const html = bridge.paint();
    expect(html).not.toMatch(/data-mgtl-(setlive|public|feature)/);
    expect(html).not.toContain('mg-sw');
    expect(html).not.toMatch(/<input/);
  });
});
