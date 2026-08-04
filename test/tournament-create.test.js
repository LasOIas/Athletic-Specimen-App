// Create a tournament from Manage (2026-08-03) — the missing half of the Danger zone.
//
// WHY THIS FILE EXISTS: Delete shipped on 2026-08-03 with no create path anywhere in Manage. Mike used it,
// deleted his July event, found nothing that could make a new one, and renamed the old JUNE row to
// "August 2026 tournament" as a workaround — which is why that row carries a null venmo_link and a null
// buy_in, and why his registration page shows the disabled "Venmo link coming soon" button. The sub-hub's
// empty state, the one screen he landed on, told him to "Create one from Open the old admin", a shell that
// was removed in session 10/14. So the app's only instruction to a stranded admin was impossible to follow.
//
// The three things pinned here, in order of what would hurt most if it regressed:
//   1. THE WRITE IS REUSED, NOT REBUILT. tdbCreateTournament is shared with two co-pilot actions, so it must
//      still be called with just the name and its own defaults, exactly ONCE, and buy_in/venmo_link must go
//      through the EXISTING tdbSetTournamentFields afterwards rather than being bolted onto its signature.
//   2. A FAILED CREATE MOVES NOTHING. The Manage surface renders against state.activeTournamentId; repointing
//      it at a tournament that was never inserted renders a ghost, which is the failure mode the delete
//      read-back exists to prevent, arriving from the other direction.
//   3. THE BUTTON IS ACTUALLY WIRED. On 2026-08-03 a drag's Undo shipped completely inert in a real browser
//      while 37 green unit tests called the function directly and never travelled the click path. So the
//      gesture test below drives attachHandlers' real #app-content delegate with a synthetic click rather
//      than trusting that a handler exists somewhere.
//
// Harness: the recorder from tournament-delete.test.js, extended so an insert().select().single() hands back
// a row (the create path reads created.id), and so #app-content's delegated listeners can be captured.
//
// WHAT THIS DOES NOT PROVE (§17): that the server accepts the INSERT under the live RLS on `tournaments`
// (unsettled — the migrations and app.js's own comment disagree), or that the dialog LOOKS right. The
// .pe-* polish from the 2026-08-03 round is written as `#player-edit-modal .pe-*`, so this dialog renders on
// the shared popup kit; that is asserted as class grammar here, not as pixels.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const NEW_ID = 'bb1f0e2c-77a1-4a3e-9c2e-6f0f1d2a3b4c';
const JUNE = 'cee5b605-587c-449b-87a6-3e7e3a0c557a';

// failOn(rec) marks a statement as failing. Inserts that ran through .single() return a ROW, because
// tdbCreateTournament reads .id off it and the whole flow branches on that.
function makeRecorder({ failOn, noRow } = {}) {
  const noop = () => {};
  const calls = [];
  const client = {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: noop } } }),
      getSession: async () => ({ data: { session: null } }),
      getUser: async () => ({ data: { user: null } }),
    },
    channel: () => ({ on: () => ({ subscribe: noop }) }),
    removeChannel: noop,
    rpc: async () => ({ data: null, error: null }),
    from(table) {
      const rec = { table, op: 'select', payload: null, filters: [], single: false };
      let pushed = false;
      const push = () => { if (!pushed) { pushed = true; calls.push(rec); } };
      const chain = {
        delete() { rec.op = 'delete'; push(); return chain; },
        update(payload) { rec.op = 'update'; rec.payload = payload; push(); return chain; },
        insert(payload) { rec.op = 'insert'; rec.payload = payload; push(); return chain; },
        upsert(payload) { rec.op = 'upsert'; rec.payload = payload; push(); return chain; },
        select() { push(); return chain; },
        eq(col, val) { rec.filters.push([col, val]); return chain; },
        in(col, val) { rec.filters.push([col, val]); return chain; },
        order() { return chain; },
        limit() { return chain; },
        single() { rec.single = true; return chain; },
        maybeSingle() { rec.single = true; return chain; },
        then(resolve) {
          const error = (failOn && failOn(rec)) ? { message: 'simulated ' + rec.table + ' ' + rec.op + ' failure' } : null;
          let data = [];
          if (rec.op === 'insert' && rec.single && !error) {
            const row = (Array.isArray(rec.payload) ? rec.payload[0] : rec.payload) || {};
            data = noRow ? null : { id: NEW_ID, ...row };
          }
          return Promise.resolve({ data, error, count: 0 }).then(resolve);
        },
      };
      return chain;
    },
  };
  return { client, calls };
}

function loadApp(opts) {
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
  // #app-content is the element attachHandlers() delegates every in-content click onto. Capturing its
  // listeners is what lets the gesture test below travel the REAL path instead of calling the handler.
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
  const { client, calls } = makeRecorder(opts);
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
  sandbox.__notices = [];
  sandbox.__opened = [];
  const epilogue = `
    ;globalThis.__bridge = {
      // Seed the manage state the dialog reads, stub the one house dialog the flow uses, run the flow.
      create: async (fields, existing) => {
        state.isAdmin = true;
        state.tournaments = existing || [];
        state.activeTournamentId = (existing && existing[0]) ? existing[0].id : null;
        state.tournamentTeams = [{ id: 'old-team' }];
        state.tournamentPools = [{ id: 'old-pool' }];
        state.tournamentMatches = [{ id: 'old-match' }];
        state.seedOverride = { id: 'old', order: ['a'] };
        manageView = 'tournament'; mgtView = 'settings';
        appNotice = (o) => { globalThis.__notices.push(o); };
        const res = await mgTournamentCreate(fields);
        return { res, after: {
          activeTournamentId: state.activeTournamentId,
          teams: (state.tournamentTeams || []).length,
          pools: (state.tournamentPools || []).length,
          matches: (state.tournamentMatches || []).length,
          seedOverride: state.seedOverride,
          manageView, mgtView,
        } };
      },
      notices: () => globalThis.__notices.slice(),
      // The dialog + both entry points, rendered.
      dialog: (existing) => { state.tournaments = existing || []; return mgCreateTournamentDialogHTML(); },
      warning: (existing) => { state.tournaments = existing || []; return mgCreateLiveWarning(); },
      hub: (t) => {
        state.isAdmin = true;
        state.tournaments = t ? [t] : [];
        state.activeTournamentId = t ? t.id : null;
        state.tournamentTeams = []; state.tournamentPools = []; state.tournamentMatches = [];
        manageView = 'tournament'; mgtView = null;
        return buildManageTournamentHTML();
      },
      // THE GESTURE. Bind the real #app-content delegate, then dispatch a click whose target answers to
      // [data-mgt-create] — exactly what the rendered button is. Nothing here calls the opener directly.
      gesture: (sel) => {
        state.isAdmin = true;
        manageView = 'tournament'; mgtView = null;
        openMgCreateTournamentPopup = () => { globalThis.__opened.push('open'); };
        attachHandlers();
        const hit = { tagName: 'BUTTON', id: '', dataset: {}, value: '', closest: (s) => (s === sel ? hit : null) };
        const ev = { target: hit, preventDefault: () => {}, stopPropagation: () => {} };
        return { handlers: globalThis.__contentClickCount, ev };
      },
      opened: () => globalThis.__opened.slice(),
      defined: (n) => typeof globalThis[n],
    };`;
  const context = vm.createContext(sandbox);
  vm.runInContext(pureSrc, context, { filename: 'pure.js' });
  vm.runInContext(appSrc + epilogue, context, { filename: 'app.js' });
  return {
    bridge: sandbox.__bridge, calls, sandbox,
    // Fire every captured #app-content click listener with a synthetic event.
    click(sel) {
      const info = sandbox.__bridge.gesture(sel);
      (contentListeners.click || []).forEach((fn) => fn(info.ev));
      return (contentListeners.click || []).length;
    },
  };
}

const mutations = (calls) => calls.filter((c) => c.op !== 'select');
const inserts = (calls) => calls.filter((c) => c.op === 'insert');
const updates = (calls) => calls.filter((c) => c.op === 'update');
const rowOf = (rec) => (Array.isArray(rec.payload) ? rec.payload[0] : rec.payload) || {};
const JUNE_T = () => ({ id: JUNE, name: 'August 2026 tournament', status: 'setup' });

describe('mgTournamentCreate — reuses the write, never rebuilds it', () => {
  it('inserts exactly ONE tournaments row and nothing else when no extras are given', async () => {
    const { bridge, calls } = loadApp();
    const { res } = await bridge.create({ name: 'August 2026 tournament' });
    expect(res.ok).toBe(true);
    expect(res.id).toBe(NEW_ID);
    expect(mutations(calls).map((c) => c.table + ':' + c.op)).toEqual(['tournaments:insert']);
  });

  it('trims the name before it is written', async () => {
    const { bridge, calls } = loadApp();
    await bridge.create({ name: '   August 2026 tournament \n ' });
    expect(inserts(calls).length).toBe(1);
    expect(rowOf(inserts(calls)[0]).name).toBe('August 2026 tournament');
  });

  it('leaves the counts on tdbCreateTournament’s own defaults, so Event settings stays the one place', async () => {
    const { bridge, calls } = loadApp();
    await bridge.create({ name: 'August 2026 tournament' });
    const row = rowOf(inserts(calls)[0]);
    expect(row.pool_count).toBe(4);
    expect(row.net_count).toBe(10);
    expect(row.team_size).toBe(4);
    // The whole reason the write is reused: a new tournament has to be registerable immediately.
    expect(row.registration_open).toBe(true);
  });

  it('does not smuggle buy_in or venmo_link into the insert — other callers share that signature', async () => {
    const { bridge, calls } = loadApp();
    await bridge.create({ name: 'August 2026 tournament', buyIn: '$80 a team', venmoLink: 'https://venmo.com/u/athleticspecimen' });
    const row = rowOf(inserts(calls)[0]);
    expect(row.buy_in).toBeUndefined();
    expect(row.venmo_link).toBeUndefined();
  });

  it('writes buy_in and venmo_link through the EXISTING field writer, scoped to the new row', async () => {
    const { bridge, calls } = loadApp();
    await bridge.create({ name: 'August 2026 tournament', buyIn: '$80 a team', venmoLink: 'https://venmo.com/u/athleticspecimen' });
    const upd = updates(calls).filter((c) => c.table === 'tournaments');
    expect(upd.length).toBe(1);
    expect(upd[0].payload.buy_in).toBe('$80 a team');
    expect(upd[0].payload.venmo_link).toBe('https://venmo.com/u/athleticspecimen');
    expect(upd[0].payload.updated_at).toBeTruthy();          // tdbSetTournamentFields' own stamp
    expect(upd[0].filters).toEqual([['id', NEW_ID]]);
    // ...and AFTER the insert, or there would be no id to scope it to.
    expect(calls.indexOf(upd[0])).toBeGreaterThan(calls.findIndex((c) => c.op === 'insert'));
  });

  it('trims those two as well, and writes ONLY the one that was filled in', async () => {
    const onlyBuy = loadApp();
    await onlyBuy.bridge.create({ name: 'Aug', buyIn: '  $80 a team  ' });
    const a = updates(onlyBuy.calls)[0];
    expect(a.payload.buy_in).toBe('$80 a team');
    expect('venmo_link' in a.payload).toBe(false);

    const onlyVenmo = loadApp();
    await onlyVenmo.bridge.create({ name: 'Aug', venmoLink: ' https://venmo.com/u/x ' });
    const b = updates(onlyVenmo.calls)[0];
    expect(b.payload.venmo_link).toBe('https://venmo.com/u/x');
    expect('buy_in' in b.payload).toBe(false);
  });

  it('writes NO update at all when both extras are blank or whitespace', async () => {
    const { bridge, calls } = loadApp();
    await bridge.create({ name: 'Aug', buyIn: '   ', venmoLink: '' });
    expect(updates(calls)).toEqual([]);
    // An empty box must never overwrite a value with ''.
    expect(mutations(calls).map((c) => c.op)).toEqual(['insert']);
  });
});

describe('the name is required', () => {
  it('refuses an empty, missing or whitespace-only name and writes NOTHING', async () => {
    for (const name of ['', '   ', '\t\n ', undefined, null]) {
      const { bridge, calls } = loadApp();
      const { res, after } = await bridge.create({ name });
      expect(res.ok).toBe(false);
      expect(res.error).toBe('Give the tournament a name.');
      expect(mutations(calls)).toEqual([]);
      expect(after.activeTournamentId).toBeNull();
    }
  });

  it('refuses a non-admin outright', async () => {
    const { bridge, calls, sandbox } = loadApp();
    vm.runInContext('state.isAdmin = false; globalThis.__r = mgTournamentCreate({ name: "Sneaky" });', sandbox);
    const res = await sandbox.__r;
    expect(res.ok).toBe(false);
    expect(mutations(calls)).toEqual([]);
    expect(bridge).toBeTruthy();
  });
});

describe('on success it lands the admin on the NEW tournament', () => {
  it('repoints activeTournamentId and clears every cache from the old one', async () => {
    const { bridge } = loadApp();
    const { after } = await bridge.create({ name: 'August 2026 tournament' }, [JUNE_T()]);
    expect(after.activeTournamentId).toBe(NEW_ID);
    // Stale teams/pools/matches would render the OLD event under the NEW event's name for a round trip.
    expect(after.teams).toBe(0);
    expect(after.pools).toBe(0);
    expect(after.matches).toBe(0);
    expect(after.seedOverride).toBeNull();
    expect(after.manageView).toBe('tournament');
    expect(after.mgtView).toBeNull();          // the new tournament's sub-hub, not the old one's sub-view
  });

  // Found by this file, 2026-08-03. tdbRefreshTournaments NULLS activeTournamentId when the id is missing
  // from the list it just read (the 2026-06-27 stale-tournament guard). Selecting the new row BEFORE that
  // refresh handed the entire outcome to one SELECT: a read that had not caught up wiped the selection and
  // dropped the admin back on the empty state, having just been told the tournament was created. The
  // recorder's list read returns [] on purpose here, which is that case in its most extreme form.
  it('stays pointed at the new tournament even when the list read comes back without it', async () => {
    const { bridge } = loadApp();
    const { res, after } = await bridge.create({ name: 'August 2026 tournament' }, [JUNE_T()]);
    expect(res.ok).toBe(true);
    expect(after.activeTournamentId).toBe(NEW_ID);
  });

  it('and puts the created row into the list so the sub-hub has something to render', async () => {
    const { bridge, sandbox } = loadApp();
    await bridge.create({ name: 'August 2026 tournament' });
    const listed = vm.runInContext('(state.tournaments || []).map((t) => t && t.id)', sandbox);
    expect(listed).toContain(NEW_ID);
  });

  it('says it is created and open, in plain language with no em dash', async () => {
    const { bridge } = loadApp();
    await bridge.create({ name: 'August 2026 tournament' });
    const said = bridge.notices();
    expect(said.length).toBe(1);
    expect(said[0].title).toBe('Tournament created');
    expect(said[0].message).toContain('August 2026 tournament');
    expect(said[0].message).toContain('open for registration');
    expect(said[0].message).not.toContain('—');
    expect(said[0].message).not.toContain('did not save');
  });
});

describe('on failure it changes nothing and says so', () => {
  it('keeps pointing at the old tournament when the insert fails', async () => {
    const { bridge } = loadApp({ failOn: (r) => r.op === 'insert' });
    const { res, after } = await bridge.create({ name: 'August 2026 tournament' }, [JUNE_T()]);
    expect(res.ok).toBe(false);
    // The Manage surface renders against this. Repointing it at a row that was never inserted is a ghost.
    expect(after.activeTournamentId).toBe(JUNE);
    expect(after.teams).toBe(1);
    expect(after.pools).toBe(1);
    expect(after.matches).toBe(1);
    expect(after.seedOverride).not.toBeNull();
    expect(after.mgtView).toBe('settings');   // not even the view moved
  });

  it('never claims success, and states that nothing changed', async () => {
    const { bridge } = loadApp({ failOn: (r) => r.op === 'insert' });
    const { res } = await bridge.create({ name: 'August 2026 tournament' });
    expect(res.error).toContain('Nothing here changed.');
    expect(bridge.notices().map((n) => n.title).join(' ')).not.toContain('Tournament created');
  });

  it('refuses just as hard when the insert comes back with no row', async () => {
    const { bridge } = loadApp({ noRow: true });
    const { res, after } = await bridge.create({ name: 'August 2026 tournament' }, [JUNE_T()]);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('Nothing here changed.');
    expect(after.activeTournamentId).toBe(JUNE);
  });

  it('does NOT report a failed create when only the buy-in write failed — the tournament exists', async () => {
    const { bridge } = loadApp({ failOn: (r) => r.op === 'update' });
    const { res, after } = await bridge.create({ name: 'August 2026 tournament', buyIn: '$80 a team' });
    expect(res.ok).toBe(true);                    // the row IS there; calling it a failure would strand him
    expect(after.activeTournamentId).toBe(NEW_ID);
    const said = bridge.notices()[0];
    expect(said.title).toBe('Tournament created');
    expect(said.message).toContain('buy-in did not save');
    expect(said.message).toContain('Registration');
    expect(said.message).not.toContain('—');
  });

  it('names both fields when both failed to save', async () => {
    const { bridge } = loadApp({ failOn: (r) => r.op === 'update' });
    await bridge.create({ name: 'Aug', buyIn: '$80 a team', venmoLink: 'https://venmo.com/u/x' });
    expect(bridge.notices()[0].message).toContain('buy-in and Venmo link did not save');
  });
});

describe('the live-tournament warning', () => {
  it('is silent when there is no tournament at all', () => {
    const { bridge } = loadApp();
    expect(bridge.warning([])).toBe('');
    expect(bridge.dialog([])).not.toContain('still running');
  });

  it('is silent when every tournament is completed', () => {
    const { bridge } = loadApp();
    expect(bridge.warning([{ id: 'a', name: 'July', status: 'completed' }])).toBe('');
  });

  it('warns when one is not completed, naming it, in one plain sentence', () => {
    const { bridge } = loadApp();
    const w = bridge.warning([JUNE_T()]);
    expect(w).toContain('August 2026 tournament');
    expect(w).toContain('has not finished yet');
    expect(w.split('. ').length).toBe(1);        // one sentence, not a block
    expect(w).not.toContain('—');
  });

  it('tells the truth about WHICH tournament the public keeps, because a running one outranks a new draft', () => {
    const { bridge } = loadApp();
    // status pools/bracket wins the public resolver, so the new setup row does NOT take the public over.
    const running = bridge.warning([{ id: 'a', name: 'July 26', status: 'pools' }]);
    expect(running).toContain('is still running');
    expect(running).toContain('until you close it out');
    // a setup one loses the public to the newer draft, which is the opposite claim.
    const draft = bridge.warning([{ id: 'a', name: 'July 26', status: 'setup' }]);
    expect(draft).toContain('will see this new one instead');
    expect(running).not.toBe(draft);
  });

  it('rides in the dialog, and only then', () => {
    const { bridge } = loadApp();
    expect(bridge.dialog([JUNE_T()])).toContain('has not finished yet');
    expect(bridge.dialog([{ id: 'a', name: 'July', status: 'completed' }])).not.toContain('has not finished yet');
  });

  it('escapes a tournament name that carries markup', () => {
    const { bridge } = loadApp();
    const html = bridge.dialog([{ id: 'a', name: '<img src=x onerror=alert(1)>', status: 'setup' }]);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });
});

describe('the dialog itself', () => {
  it('carries the three fields, and only those three', () => {
    const { bridge } = loadApp();
    const html = bridge.dialog([]);
    ['mgc-name', 'mgc-buyin', 'mgc-venmo'].forEach((id) => expect(html).toContain('id="' + id + '"'));
    expect(html).toContain('>Name<');
    expect(html).toContain('>Buy-in<');
    expect(html).toContain('>Venmo link<');
    // Counts are NOT here: Event settings and the Pools steppers already own them.
    expect(html).not.toContain('mgc-poolcount');
    expect(html).not.toContain('mgc-nets');
    expect(html).not.toContain('mgc-teamsize');
  });

  it('is built on the shared popup kit, with the Edit-player dialog’s header / body / action-bar grammar', () => {
    const { bridge } = loadApp();
    const html = bridge.dialog([]);
    ['popup-header', 'popup-body', 'edit-actions', 'popup-edit-label', 'popup-edit-input'].forEach((c) =>
      expect(html).toContain(c));
    ['pe-head', 'pe-body', 'pe-actions', 'pe-save', 'pe-cancel'].forEach((c) => expect(html).toContain(c));
    expect(html).toContain('data-mgc-save');
    expect(html).toContain('data-mgc-close');
    expect(html).toContain('id="mgc-msg"');       // the inline error slot the name check writes into
  });

  it('carries no em dash and no emoji anywhere in its copy', () => {
    const { bridge } = loadApp();
    const html = bridge.dialog([JUNE_T()]);
    expect(html).not.toContain('—');
    expect(html).not.toContain('&mdash;');
    expect(html).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });
});

describe('both entry points', () => {
  it('the EMPTY STATE offers a real create control, and no longer sends him to a shell that was deleted', () => {
    const { bridge } = loadApp();
    const html = bridge.hub(null);
    expect(html).toContain('data-mgt-create');
    // The dead instruction. This is the exact copy that stranded him.
    expect(html).not.toContain('Open the old admin');
    expect(html).not.toContain('lands in a later slice');
    expect(html).toContain('No tournament yet.');
    expect(html).not.toContain('—');
  });

  it('the SUB-HUB offers one too, so next month can be set up while this one exists', () => {
    const { bridge } = loadApp();
    const html = bridge.hub(JUNE_T());
    expect(html).toContain('data-mgt-create');
    expect(html).toContain('Create another tournament');
  });

  it('keeps that control OUT of the red Danger zone, which is for Reset and Delete only', () => {
    const { bridge } = loadApp();
    const html = bridge.hub(JUNE_T());
    const danger = html.slice(html.indexOf('mgv-danger'));
    expect(danger).not.toContain('data-mgt-create');
    // ...and it sits under the rows, before the danger box starts.
    expect(html.indexOf('data-mgt-create')).toBeGreaterThan(html.indexOf('data-mgt-view="closeout"'));
    expect(html.indexOf('data-mgt-create')).toBeLessThan(html.indexOf('mgv-danger'));
    // It must not read as a sub-view row either.
    expect(html).not.toContain('data-mgt-view="create"');
  });
});

// The 2026-08-03 lesson, banked: 672 green tests did not catch a completely inert Undo button, because every
// one of them called the function instead of travelling the click path. These drive the real delegate.
describe('the button is actually wired', () => {
  it('every function the new call sites name is DEFINED', () => {
    const { bridge } = loadApp();
    ['mgTournamentCreate', 'openMgCreateTournamentPopup', 'closeMgCreateTournamentPopup',
      'mgcSubmitCreate', 'mgCreateTournamentDialogHTML', 'mgCreateLiveWarning',
      'tdbCreateTournament', 'tdbSetTournamentFields'].forEach((fn) =>
      expect(bridge.defined(fn), fn + ' is not defined').toBe('function'));
  });

  it('a real click on [data-mgt-create] reaches the dialog through attachHandlers’ own delegate', () => {
    const app = loadApp();
    const bound = app.click('[data-mgt-create]');
    expect(bound).toBeGreaterThan(0);            // the delegate exists at all
    expect(app.bridge.opened()).toEqual(['open']);
  });

  it('and a click on something else does not open it', () => {
    const app = loadApp();
    app.click('[data-mgt-nothing]');
    expect(app.bridge.opened()).toEqual([]);
  });
});
