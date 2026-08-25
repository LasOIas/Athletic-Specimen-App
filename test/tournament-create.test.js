// Create a tournament from Manage — the full SCREEN (round 2026-08-04, superseding the 2026-08-03 popup).
//
// WHY THIS FILE EXISTS: Delete shipped on 2026-08-03 with no create path anywhere in Manage. Mike used it,
// deleted his July event, found nothing that could make a new one, and renamed the old JUNE row to
// "August 2026 tournament" as a workaround — which is why that row carries a null venmo_link and a null
// buy_in, and why his registration page shows the disabled "Venmo link coming soon" button. The sub-hub's
// empty state, the one screen he landed on, told him to "Create one from Open the old admin", a shell that
// was removed in session 10/14. So the app's only instruction to a stranded admin was impossible to follow.
// A create POPUP closed that hole the same day.
//
// WHAT CHANGED, and why these tests moved with it: the 2026-08-04 design round replaces that popup with a
// full SCREEN carrying Name / Date / Team size / Nets / Team cap / Buy-in and a "Manage it right away"
// switch. ONE create path, not two. Retired with the popup, and with them the assertions that pinned them:
//   * mgCreateTournamentDialogHTML / openMgCreateTournamentPopup / closeMgCreateTournamentPopup /
//     mgcSubmitCreate  →  buildMgTournamentNewHTML + mgntSubmitCreate
//   * mgCreateLiveWarning — it warned that "players will see this new one instead as soon as you create
//     it", which was true of a popup that left registration OPEN. The screen writes registration_open:false,
//     so the sentence would now warn about something that does not happen.
//   * data-mgt-create  →  data-mgtl-new (both entry points, one screen)
//
// The four things pinned here, in order of what would hurt most if it regressed:
//   1. THE WRITE IS REUSED, NOT REBUILT. tdbCreateTournament is shared with two co-pilot actions, so its
//      signature must not grow: everything the form adds goes through the EXISTING tdbSetTournamentFields
//      afterwards.
//   2. THE COLUMN-ABSENT PATH. event_date and team_cap arrive with migration 0057, which is NOT applied.
//      Sending a key for a column that does not exist is a PostgREST 42703 that fails the WHOLE update,
//      taking buy_in and registration_open down with it. So neither field is rendered and neither key is
//      sent until a loaded row proves the column is there.
//   3. A FAILED CREATE MOVES NOTHING. The Manage surface renders against state.activeTournamentId;
//      repointing it at a tournament that was never inserted renders a ghost.
//   4. THE BUTTON IS ACTUALLY WIRED. On 2026-08-03 a drag's Undo shipped completely inert in a real browser
//      while 37 green unit tests called the function directly and never travelled the click path. So the
//      gesture tests below drive attachHandlers' real #app-content delegate with a synthetic click.
//
// Harness: the recorder from tournament-delete.test.js, extended so an insert().select().single() hands back
// a row (the create path reads created.id), and so #app-content's delegated listeners can be captured.
//
// WHAT THIS DOES NOT PROVE (§17): that the server accepts the INSERT under the live RLS on `tournaments`
// (unsettled — the migrations and app.js's own comment disagree), that migration 0057 applies cleanly, or
// that the screen LOOKS right. It renders on the shipped .pk-fld / .pk-fv / .mges-half / .mg-sw kit, which
// is asserted here as class grammar, not as pixels.
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
  // listeners is what lets the gesture tests below travel the REAL path instead of calling the handler.
  const contentListeners = {};
  const appContentEl = makeEl();
  appContentEl.addEventListener = (type, fn) => { (contentListeners[type] = contentListeners[type] || []).push(fn); };
  // The screen reads its values back out of the DOM by id (mgntSubmitCreate). fieldValues lets a test hand
  // the form real typing without a full DOM.
  const fieldValues = {};
  const documentStub = {
    readyState: 'loading',
    getElementById: (id) => {
      if (id === 'app-content') return appContentEl;
      if (Object.prototype.hasOwnProperty.call(fieldValues, id)) {
        const el = makeEl(); el.value = fieldValues[id]; return el;
      }
      return null;
    },
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
  const epilogue = `
    ;globalThis.__bridge = {
      // Seed the manage state the flow reads, stub the one house dialog it uses, run the flow.
      create: async (fields, existing) => {
        state.isAdmin = true;
        state.tournaments = existing || [];
        state.activeTournamentId = (existing && existing[0]) ? existing[0].id : null;
        state.tournamentTeams = [{ id: 'old-team' }];
        state.tournamentPools = [{ id: 'old-pool' }];
        state.tournamentMatches = [{ id: 'old-match' }];
        state.seedOverride = { id: 'old', order: ['a'] };
        manageView = 'tournament'; mgtView = 'settings';
        mgTournamentPinned = false;
        appNotice = (o) => { globalThis.__notices.push(o); };
        const res = await mgTournamentCreate(fields);
        return { res, after: {
          activeTournamentId: state.activeTournamentId,
          teams: (state.tournamentTeams || []).length,
          pools: (state.tournamentPools || []).length,
          matches: (state.tournamentMatches || []).length,
          seedOverride: state.seedOverride,
          manageView, mgtView, pinned: mgTournamentPinned, makeActive: mgntMakeActive,
        } };
      },
      notices: () => globalThis.__notices.slice(),
      // The New tournament SCREEN, rendered. \`existing\` decides what tournamentColumnLoaded() can see, so a
      // row WITHOUT event_date/team_cap keys is the pre-0057 world and a row carrying them is the post one.
      screen: (existing) => {
        state.isAdmin = true;
        state.tournaments = existing || [];
        state.activeTournamentId = (existing && existing[0]) ? existing[0].id : null;
        state.tournamentTeams = []; state.tournamentPools = []; state.tournamentMatches = [];
        manageView = 'tournament-new';
        return buildMgTournamentNewHTML();
      },
      // The sub-hub, the other place the create screen is reached from.
      hub: (t) => {
        state.isAdmin = true;
        state.tournaments = t ? [t] : [];
        state.activeTournamentId = t ? t.id : null;
        state.tournamentTeams = []; state.tournamentPools = []; state.tournamentMatches = [];
        manageView = 'tournament'; mgtView = null;
        return buildManageTournamentHTML();
      },
      // Bind the real #app-content delegate. Nothing here calls a handler directly.
      bind: (opts) => {
        opts = opts || {};
        state.isAdmin = true;
        state.tournaments = opts.tournaments || [];
        manageView = opts.manageView || 'tournament'; mgtView = null;
        mgntMakeActive = ('makeActive' in opts) ? opts.makeActive : true;
        // The gesture path runs the WHOLE flow, notice included, and the house dialog wants a real DOM.
        appNotice = (o) => { globalThis.__notices.push(o); };
        attachHandlers();
      },
      view: () => manageView,
      switchOn: () => mgntMakeActive,
      defined: (n) => typeof globalThis[n],
    };`;
  const context = vm.createContext(sandbox);
  vm.runInContext(pureSrc, context, { filename: 'pure.js' });
  vm.runInContext(appSrc + epilogue, context, { filename: 'app.js' });
  return {
    bridge: sandbox.__bridge, calls, sandbox, fieldValues,
    // THE GESTURE. Dispatch a click whose target answers to one selector — exactly what a rendered control
    // is — through the real delegate.
    click(sel, extra) {
      const hit = Object.assign({
        tagName: 'BUTTON', id: '', dataset: {}, value: '',
        closest: (s) => (s === sel ? hit : null),
        getAttribute: () => null,
      }, extra || {});
      (contentListeners.click || []).forEach((fn) => fn({ target: hit, preventDefault: noop, stopPropagation: noop }));
      return (contentListeners.click || []).length;
    },
  };
}

const mutations = (calls) => calls.filter((c) => c.op !== 'select');
const inserts = (calls) => calls.filter((c) => c.op === 'insert');
const updates = (calls) => calls.filter((c) => c.op === 'update');
const rowOf = (rec) => (Array.isArray(rec.payload) ? rec.payload[0] : rec.payload) || {};
const JUNE_T = () => ({ id: JUNE, name: 'August 2026 tournament', status: 'setup' });
// The same row as it reads AFTER migration 0057 lands: select('*') hands back the new columns, empty.
const JUNE_0057 = () => ({ id: JUNE, name: 'August 2026 tournament', status: 'setup', event_date: null, team_cap: null });

describe('mgTournamentCreate — reuses the write, never rebuilds it', () => {
  it('inserts exactly ONE tournaments row, then settles the rest through the existing field writer', async () => {
    const { bridge, calls } = loadApp();
    const { res } = await bridge.create({ name: 'August 2026 tournament' });
    expect(res.ok).toBe(true);
    expect(res.id).toBe(NEW_ID);
    // Exactly two mutations, in this order: the shared insert, then ONE update on the row it returned.
    expect(mutations(calls).map((c) => c.table + ':' + c.op)).toEqual(['tournaments:insert', 'tournaments:update']);
  });

  it('trims the name before it is written', async () => {
    const { bridge, calls } = loadApp();
    await bridge.create({ name: '   August 2026 tournament \n ' });
    expect(inserts(calls).length).toBe(1);
    expect(rowOf(inserts(calls)[0]).name).toBe('August 2026 tournament');
  });

  it('passes Team size and Nets through tdbCreateTournament’s OWN parameters, not a new column list', async () => {
    const { bridge, calls } = loadApp();
    await bridge.create({ name: 'Aug', teamSize: '3', nets: '2' });
    const row = rowOf(inserts(calls)[0]);
    expect(row.team_size).toBe(3);
    expect(row.net_count).toBe(2);
    // Everything the form does not ask about keeps the helper's defaults, so Event settings stays the one
    // place a number can be changed.
    expect(row.pool_count).toBe(4);
  });

  it('falls back to the shipped defaults when a count is blank, zero or junk', async () => {
    for (const bad of ['', '0', '-2', 'abc']) {
      const { bridge, calls } = loadApp();
      await bridge.create({ name: 'Aug', teamSize: bad, nets: bad });
      const row = rowOf(inserts(calls)[0]);
      expect(row.team_size).toBe(4);
      expect(row.net_count).toBe(10);
    }
  });

  it('copies the scoring rules off the tournament Manage is pointed at, as the save-note promises', async () => {
    const { bridge, calls } = loadApp();
    await bridge.create({ name: 'Sept' }, [{
      id: JUNE, name: 'August 2026 tournament', status: 'setup',
      pool_target: 15, pool_cap: 18, bracket_target: 21, bracket_cap: 25, win_by_2: false,
    }]);
    const row = rowOf(inserts(calls)[0]);
    expect(row.pool_target).toBe(15);
    expect(row.pool_cap).toBe(18);
    expect(row.bracket_target).toBe(21);
    expect(row.bracket_cap).toBe(25);
    expect(row.win_by_2).toBe(false);
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

  // CHANGED by the 2026-08-04 round. The popup wrote no update at all when its two optional boxes were
  // blank; this screen always writes ONE, because registration_open:false is not optional — it is the
  // promise the screen's own copy makes twice ("nothing public until you open registration").
  it('still writes an update when every optional box is blank, carrying registration_open and nothing else', async () => {
    const { bridge, calls } = loadApp();
    await bridge.create({ name: 'Aug', buyIn: '   ', venmoLink: '' });
    expect(updates(calls).length).toBe(1);
    const p = updates(calls)[0].payload;
    expect(p.registration_open).toBe(false);
    // An empty box must never overwrite a value with ''.
    expect('buy_in' in p).toBe(false);
    expect('venmo_link' in p).toBe(false);
  });

  it('closes registration on the new row even though the shared insert opens it', async () => {
    const { bridge, calls } = loadApp();
    await bridge.create({ name: 'Aug' });
    // The shared helper still opens it — its co-pilot callers depend on that, so its signature is untouched.
    expect(rowOf(inserts(calls)[0]).registration_open).toBe(true);
    // ...and this screen closes it right after, so the copy and the database agree.
    expect(updates(calls)[0].payload.registration_open).toBe(false);
  });
});

// ── The two columns migration 0057 adds, which is NOT applied ─────────────────────────────────────────
// Reads are safe already (select('*') → undefined). WRITES are not: PostgREST answers an update naming an
// unknown column with 42703 and fails the WHOLE statement, so a stray event_date key would take buy_in and
// registration_open down with it.
describe('event_date and team_cap, before and after the migration', () => {
  it('sends NEITHER key when no loaded row carries the column', async () => {
    const { bridge, calls } = loadApp();
    // Even with real values in hand: the columns are not there, so they cannot be written.
    await bridge.create({ name: 'Sept', eventDate: '2026-09-19', teamCap: '12', buyIn: '$80 a team' }, [JUNE_T()]);
    const p = updates(calls)[0].payload;
    expect('event_date' in p).toBe(false);
    expect('team_cap' in p).toBe(false);
    // ...and the fields beside them still land, which is the whole point of not sending them.
    expect(p.buy_in).toBe('$80 a team');
    expect(p.registration_open).toBe(false);
  });

  it('sends BOTH once a loaded row proves the columns exist', async () => {
    const { bridge, calls } = loadApp();
    await bridge.create({ name: 'Sept', eventDate: '2026-09-19', teamCap: '12' }, [JUNE_0057()]);
    const p = updates(calls)[0].payload;
    expect(p.event_date).toBe('2026-09-19');
    expect(p.team_cap).toBe(12);
  });

  it('detects the column from a row that carries it as NULL, which is how an unset one reads', async () => {
    const { bridge, calls } = loadApp();
    await bridge.create({ name: 'Sept', eventDate: '2026-09-19' }, [{ id: 'x', name: 'X', status: 'setup', event_date: null }]);
    expect(updates(calls)[0].payload.event_date).toBe('2026-09-19');
  });

  it('sends nothing for either when the column exists but the box was left empty', async () => {
    const { bridge, calls } = loadApp();
    await bridge.create({ name: 'Sept', eventDate: '', teamCap: '' }, [JUNE_0057()]);
    const p = updates(calls)[0].payload;
    expect('event_date' in p).toBe(false);
    expect('team_cap' in p).toBe(false);
  });

  it('refuses a date that is not a plain YYYY-MM-DD rather than handing the column junk', async () => {
    const { bridge, calls } = loadApp();
    await bridge.create({ name: 'Sept', eventDate: 'next saturday' }, [JUNE_0057()]);
    expect('event_date' in updates(calls)[0].payload).toBe(false);
  });

  it('hides BOTH fields on the screen when the columns are absent, so nothing offers to save into them', () => {
    const { bridge } = loadApp();
    const html = bridge.screen([JUNE_T()]);
    expect(html).not.toContain('mgnt-date');
    expect(html).not.toContain('mgnt-cap');
    expect(html).not.toContain('>Date<');
    expect(html).not.toContain('>Team cap<');
    // An input that cannot save is worse than an absent one, but the rest of the form is untouched.
    expect(html).toContain('id="mgnt-name"');
    expect(html).toContain('id="mgnt-teamsize"');
    expect(html).toContain('id="mgnt-nets"');
    expect(html).toContain('id="mgnt-buyin"');
  });

  it('shows both the moment a loaded row carries the columns', () => {
    const { bridge } = loadApp();
    const html = bridge.screen([JUNE_0057()]);
    expect(html).toContain('id="mgnt-date"');
    expect(html).toContain('type="date"');
    expect(html).toContain('id="mgnt-cap"');
    expect(html).toContain('>Team cap<');
  });

  it('pairs Team cap with Buy-in in the two-up grid, and gives Buy-in the full row without it', () => {
    const { bridge } = loadApp();
    const withCap = bridge.screen([JUNE_0057()]);
    const capIdx = withCap.indexOf('id="mgnt-cap"');
    const half = withCap.lastIndexOf('mges-half', capIdx);
    expect(withCap.slice(half, capIdx + 400)).toContain('id="mgnt-buyin"');
    // Without the column there is nothing to pair it with, so it is not left in a one-cell grid.
    const noCap = bridge.screen([JUNE_T()]);
    const buyIdx = noCap.indexOf('id="mgnt-buyin"');
    expect(noCap.slice(0, buyIdx).lastIndexOf('mges-half')).toBeLessThan(noCap.indexOf('id="mgnt-teamsize"'));
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

describe('Manage it right away', () => {
  it('ON (the default) repoints activeTournamentId, pins it, and clears every cache from the old one', async () => {
    const { bridge } = loadApp();
    const { after } = await bridge.create({ name: 'August 2026 tournament' }, [JUNE_T()]);
    expect(after.activeTournamentId).toBe(NEW_ID);
    // Stale teams/pools/matches would render the OLD event under the NEW event's name for a round trip.
    expect(after.teams).toBe(0);
    expect(after.pools).toBe(0);
    expect(after.matches).toBe(0);
    expect(after.seedOverride).toBeNull();
    // Pinned, or the very next Manage row tap would run mgSyncActiveTournament and switch him back.
    expect(after.pinned).toBe(true);
    // Round 2026-08-04: it lands on the Manage HUB, whose card reports which tournament is being edited.
    expect(after.manageView).toBe('lead');
    expect(after.mgtView).toBeNull();
  });

  it('OFF leaves Manage editing the tournament it was already editing', async () => {
    const { bridge } = loadApp();
    const { res, after } = await bridge.create({ name: 'September 2026', makeActive: false }, [JUNE_T()]);
    expect(res.ok).toBe(true);
    expect(after.activeTournamentId).toBe(JUNE);
    // Not left null: that would hand the pointer back to the lead resolver and switch him anyway.
    expect(after.pinned).toBe(false);
    expect(after.manageView).toBe('lead');
  });

  it('resets the form switch to its default so the next create starts from ON', async () => {
    const { bridge } = loadApp();
    const { after } = await bridge.create({ name: 'September 2026', makeActive: false });
    expect(after.makeActive).toBe(true);
  });

  it('treats an omitted switch as ON, matching the screen’s default', async () => {
    const { bridge } = loadApp();
    const { after } = await bridge.create({ name: 'Aug' }, [JUNE_T()]);
    expect(after.activeTournamentId).toBe(NEW_ID);
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

  it('and puts the created row into the list so the hub card has something to name', async () => {
    const { bridge, sandbox } = loadApp();
    await bridge.create({ name: 'August 2026 tournament' });
    const listed = vm.runInContext('(state.tournaments || []).map((t) => t && t.id)', sandbox);
    expect(listed).toContain(NEW_ID);
  });

  it('says what is true of the row that now exists, in plain language with no em dash', async () => {
    const { bridge } = loadApp();
    await bridge.create({ name: 'August 2026 tournament' });
    const said = bridge.notices();
    expect(said.length).toBe(1);
    expect(said[0].title).toBe('Tournament created');
    expect(said[0].message).toContain('August 2026 tournament');
    expect(said[0].message).toContain('Manage edits now');
    expect(said[0].message).toContain('Registration stays closed until you open it.');
    expect(said[0].message).not.toContain('—');
    expect(said[0].message).not.toContain('did not save');
  });

  it('calls it a draft, not the managed one, when the switch was off', async () => {
    const { bridge } = loadApp();
    await bridge.create({ name: 'September 2026', makeActive: false }, [JUNE_T()]);
    expect(bridge.notices()[0].message).toContain('saved as a draft');
    expect(bridge.notices()[0].message).not.toContain('Manage edits now');
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

  it('does NOT report a failed create when only the follow-up write failed — the tournament exists', async () => {
    const { bridge } = loadApp({ failOn: (r) => r.op === 'update' });
    const { res, after } = await bridge.create({ name: 'August 2026 tournament', buyIn: '$80 a team' });
    expect(res.ok).toBe(true);                    // the row IS there; calling it a failure would strand him
    expect(after.activeTournamentId).toBe(NEW_ID);
    const said = bridge.notices()[0];
    expect(said.title).toBe('Tournament created');
    expect(said.message).toContain('buy-in');
    expect(said.message).toContain('Registration');
    expect(said.message).not.toContain('—');
  });

  // The consequence a silent failure would hide: the row keeps tdbCreateTournament's registration_open:true,
  // so it IS public, and the screen just promised the opposite.
  it('says registration is still OPEN when the follow-up write failed, rather than repeating the promise', async () => {
    const { bridge } = loadApp({ failOn: (r) => r.op === 'update' });
    await bridge.create({ name: 'Aug' });
    const msg = bridge.notices()[0].message;
    expect(msg).toContain('still OPEN');
    expect(msg).not.toContain('Registration stays closed until you open it.');
  });

  it('names both fields when both failed to save', async () => {
    const { bridge } = loadApp({ failOn: (r) => r.op === 'update' });
    await bridge.create({ name: 'Aug', buyIn: '$80 a team', venmoLink: 'https://venmo.com/u/x' });
    expect(bridge.notices()[0].message).toContain('buy-in and Venmo link');
  });
});

describe('the screen itself', () => {
  it('is built on the shipped field kit, not a second set of form classes', () => {
    const { bridge } = loadApp();
    const html = bridge.screen([JUNE_0057()]);
    ['pk-fld', 'pk-fl', 'pk-fv', 'mges-half', 'mges-swfield', 'pk-cta', 'pk-savenote'].forEach((c) =>
      expect(html, c + ' missing').toContain(c));
    // The retired popup's kit must not come back with it.
    expect(html).not.toContain('popup-edit-input');
    expect(html).not.toContain('popup-overlay');
    expect(html).not.toContain('mgc-name');
  });

  it('carries the back button, the title, the CTA and the inline failure slot', () => {
    const { bridge } = loadApp();
    const html = bridge.screen([JUNE_T()]);
    expect(html).toContain('class="pd-htitle">New tournament<');
    // Round 2026-08-25: the chooser screen retired with the switcher card, so back goes to the Manage HUB
    // (whose title's inline picker is where the choice lives now) instead of to a screen that no longer exists.
    expect(html).toContain('data-mg-area="lead"');
    expect(html).toContain('data-mgtl-create');
    expect(html).toContain('id="mgnt-msg"');
  });

  it('ships the Manage it right away switch, ON by default, on the shipped .mg-sw kit', () => {
    const { bridge } = loadApp();
    const html = bridge.screen([JUNE_T()]);
    expect(html).toContain('data-mgnt-active');
    expect(html).toContain('class="mg-sw on"');
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('Manage it right away');
  });

  it('prefills Team size and Nets from the tournament being copied, so next month is one field of typing', () => {
    const { bridge } = loadApp();
    const html = bridge.screen([{ id: 'x', name: 'Aug', status: 'setup', team_size: 3, net_count: 5 }]);
    expect(html).toMatch(/id="mgnt-teamsize"[^>]*value="3"/);
    expect(html).toMatch(/id="mgnt-nets"[^>]*value="5"/);
  });

  it('falls back to the shipped defaults when there is nothing to copy from', () => {
    const { bridge } = loadApp();
    const html = bridge.screen([]);
    expect(html).toMatch(/id="mgnt-teamsize"[^>]*value="4"/);
    expect(html).toMatch(/id="mgnt-nets"[^>]*value="10"/);
  });

  it('names the tournament its rules are copied from, and drops that sentence when there is none', () => {
    const { bridge } = loadApp();
    expect(bridge.screen([JUNE_T()])).toContain('Copies the scoring rules from August 2026 tournament.');
    const none = bridge.screen([]);
    expect(none).not.toContain('Copies the scoring rules');
    // The half that is always true stays either way.
    expect(none).toContain('Registration stays closed until you open it.');
  });

  it('escapes a tournament name that carries markup into the save-note', () => {
    const { bridge } = loadApp();
    const html = bridge.screen([{ id: 'a', name: '<img src=x onerror=alert(1)>', status: 'setup' }]);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });

  it('carries no em dash and no emoji anywhere in its copy', () => {
    const { bridge } = loadApp();
    const html = bridge.screen([JUNE_0057()]);
    expect(html).not.toContain('—');
    expect(html).not.toContain('&mdash;');
    expect(html).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });
});

describe('both entry points reach the SAME screen', () => {
  it('the EMPTY STATE offers a real create control, and no longer sends him to a shell that was deleted', () => {
    const { bridge } = loadApp();
    const html = bridge.hub(null);
    expect(html).toContain('data-mgtl-new');
    // The dead instruction. This is the exact copy that stranded him.
    expect(html).not.toContain('Open the old admin');
    expect(html).not.toContain('lands in a later slice');
    expect(html).toContain('No tournament yet.');
    expect(html).not.toContain('—');
  });

  it('the SUB-HUB offers one too, so next month can be set up while this one exists', () => {
    const { bridge } = loadApp();
    const html = bridge.hub(JUNE_T());
    expect(html).toContain('data-mgtl-new');
    expect(html).toContain('Create another tournament');
  });

  it('keeps that control OUT of the red Danger zone, which is for Reset and Delete only', () => {
    const { bridge } = loadApp();
    const html = bridge.hub(JUNE_T());
    const danger = html.slice(html.indexOf('mgv-danger'));
    expect(danger).not.toContain('data-mgtl-new');
    // ...and it sits under the rows, before the danger box starts.
    expect(html.indexOf('data-mgtl-new')).toBeGreaterThan(html.indexOf('data-mgt-view="closeout"'));
    expect(html.indexOf('data-mgtl-new')).toBeLessThan(html.indexOf('mgv-danger'));
    // It must not read as a sub-view row either.
    expect(html).not.toContain('data-mgt-view="create"');
  });

  it('leaves NO second create path behind: the popup and its hooks are gone', () => {
    const { bridge } = loadApp();
    ['openMgCreateTournamentPopup', 'closeMgCreateTournamentPopup', 'mgcSubmitCreate',
      'mgCreateTournamentDialogHTML', 'mgCreateLiveWarning'].forEach((fn) =>
      expect(bridge.defined(fn), fn + ' should have been removed with the popup').toBe('undefined'));
    expect(bridge.hub(JUNE_T())).not.toContain('data-mgt-create');
  });
});

// The 2026-08-03 lesson, banked: 672 green tests did not catch a completely inert Undo button, because every
// one of them called the function instead of travelling the click path. These drive the real delegate.
describe('the buttons are actually wired', () => {
  it('every function the new call sites name is DEFINED', () => {
    const { bridge } = loadApp();
    ['mgTournamentCreate', 'mgntSubmitCreate', 'buildMgTournamentNewHTML', 'mgntPresetFrom',
      'mgPickTournament', 'mgAdoptTournament',
      'tournamentHasEventDate', 'tournamentHasTeamCap', 'tournamentColumnLoaded',
      'tdbCreateTournament', 'tdbSetTournamentFields'].forEach((fn) =>
      expect(bridge.defined(fn), fn + ' is not defined').toBe('function'));
  });

  it('a real click on [data-mgtl-new] opens the create screen through attachHandlers’ own delegate', () => {
    // From the HUB now (the picker panel's footer row), not from the retired chooser screen.
    const app = loadApp();
    app.bridge.bind({ manageView: 'lead' });
    const bound = app.click('[data-mgtl-new]');
    expect(bound).toBeGreaterThan(0);            // the delegate exists at all
    expect(app.bridge.view()).toBe('tournament-new');
  });

  it('reaches it from the SUB-HUB as well, which is where a stranded admin lands', () => {
    const app = loadApp();
    app.bridge.bind({ manageView: 'tournament' });
    app.click('[data-mgtl-new]');
    expect(app.bridge.view()).toBe('tournament-new');
  });

  it('a real click on the switch flips it without a repaint, so half-typed fields survive', () => {
    const app = loadApp();
    app.bridge.bind({ manageView: 'tournament-new' });
    expect(app.bridge.switchOn()).toBe(true);
    app.click('[data-mgnt-active]');
    expect(app.bridge.switchOn()).toBe(false);
    app.click('[data-mgnt-active]');
    expect(app.bridge.switchOn()).toBe(true);
  });

  it('opening the screen resets that switch to ON, however it was left last time', () => {
    const app = loadApp();
    app.bridge.bind({ manageView: 'lead', makeActive: false });
    app.click('[data-mgtl-new]');
    expect(app.bridge.switchOn()).toBe(true);
  });

  it('a real click on the CTA reads the rendered fields and inserts, through the delegate', async () => {
    const app = loadApp();
    app.bridge.bind({ manageView: 'tournament-new' });
    Object.assign(app.fieldValues, {
      'mgnt-name': 'September 2026 Tournament', 'mgnt-teamsize': '3', 'mgnt-nets': '2', 'mgnt-buyin': '$80 a team',
    });
    app.click('[data-mgtl-create]');
    await new Promise((r) => setImmediate(r));
    const row = rowOf(inserts(app.calls)[0] || { payload: {} });
    expect(row.name).toBe('September 2026 Tournament');
    expect(row.team_size).toBe(3);
    expect(row.net_count).toBe(2);
  });

  it('and a click on something else creates nothing', () => {
    const app = loadApp();
    app.bridge.bind({ manageView: 'tournament-new' });
    app.click('[data-mgtl-nothing]');
    expect(inserts(app.calls)).toEqual([]);
    expect(app.bridge.view()).toBe('tournament-new');
  });
});
