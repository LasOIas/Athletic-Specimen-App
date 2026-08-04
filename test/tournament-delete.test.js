// Delete the whole tournament (design round 2026-08-03, README §7) — the Danger zone's irreversible row.
//
// WHY THIS FILE EXISTS, and it is one reason: A DELETE THAT REPORTS SUCCESS WITHOUT PROVING IT.
// The RLS policies on these tables are USING row FILTERS, not RAISE guards. A session that has drifted to
// anon, or off its organizer membership, gets a DELETE that matches ZERO rows and comes back `error: null`.
// Every check in the client passes, the toast says "Tournament deleted", and the event is still there. For
// the full RESET that was recoverable — you tap it again. For a DELETE it is worse than a crash: Mike would
// believe the event is gone and stop looking. So tdbDeleteTournament re-selects the row and REQUIRES it to
// be absent, and these tests fail the build if that guard is ever weakened or dropped.
//
// The second thing pinned here is the blast radius. Every child table's tournament_id FK is ON DELETE
// CASCADE (db/migrations/0001_tournament_schema.sql), so deleting the ONE tournaments row is the whole
// operation — and the statement must stay scoped to .eq('id', ...) because the June 2026 event (18 teams /
// 71 hand-authored matches that exist only in the DB) lives in the same table.
//
// Harness: the recorder from tournament-reset.test.js — every mutating call is captured with its table,
// payload and filters, so the tests assert the exact statements issued rather than mocking a database.
//
// WHAT THIS DOES NOT PROVE (§17): that the server accepts the DELETE, or which RLS policy set is actually
// live on `tournaments` (the migration files and app.js's own comments disagree, and settling that needs
// Mike's DB access). The read-back is precisely what makes the button honest either way.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const JULY = '0f37a9dc-0a62-473b-8096-f74234affc48';
const JUNE = 'cee5b605-587c-449b-87a6-3e7e3a0c557a';

// `survivors[table]` = the row count the read-back finds (the silent-RLS-denial case: the delete "succeeds"
// with error:null but the row is still there). `readErr` makes the read-back itself fail.
function makeRecorder({ failOn, survivors, readErr } = {}) {
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
      const rec = { table, op: 'select', payload: null, filters: [], head: false };
      let pushed = false;
      const push = () => { if (!pushed) { pushed = true; calls.push(rec); } };
      const chain = {
        delete() { rec.op = 'delete'; push(); return chain; },
        update(payload) { rec.op = 'update'; rec.payload = payload; push(); return chain; },
        insert(payload) { rec.op = 'insert'; rec.payload = payload; push(); return chain; },
        upsert(payload) { rec.op = 'upsert'; rec.payload = payload; push(); return chain; },
        select(_cols, opts) { if (opts && opts.head) rec.head = true; push(); return chain; },
        eq(col, val) { rec.filters.push([col, val]); return chain; },
        in(col, val) { rec.filters.push([col, val]); return chain; },
        order() { return chain; },
        limit() { return chain; },
        single() { return chain; },
        maybeSingle() { return chain; },
        then(resolve) {
          const isReadBack = rec.op === 'select' && rec.head;
          const error = (failOn && failOn(rec)) ? { message: 'simulated ' + rec.table + ' failure' }
            : (isReadBack && readErr) ? { message: 'simulated read-back failure' } : null;
          const count = (rec.op === 'select' && survivors && survivors[rec.table] != null) ? survivors[rec.table] : 0;
          return Promise.resolve({ data: [], error, count }).then(resolve);
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
  const documentStub = {
    readyState: 'loading',
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => emptyList,
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
  const notices = [];
  sandbox.__notices = notices;
  const epilogue = `
    ;globalThis.__bridge = {
      del: (t) => tdbDeleteTournament(t),
      // Drive the whole button: seed the manage state, stub the two house dialogs (both are DOM), run it.
      run: async (t, teams, typed) => {
        state.isAdmin = true;
        state.tournaments = t ? [t] : [];
        state.activeTournamentId = t ? t.id : null;
        state.tournamentTeams = teams || [];
        state.tournamentPools = [{ id: 'pool-1' }];
        state.tournamentMatches = [{ id: 'match-1' }];
        state.seedOverride = { id: t ? t.id : null, order: ['a'] };
        manageView = 'tournament'; mgtView = 'settings';
        appPrompt = async (o) => { globalThis.__notices.push({ kind: 'prompt', o }); return typed; };
        appNotice = (o) => { globalThis.__notices.push({ kind: 'notice', o }); };
        await mgTournamentDelete();
        return {
          activeTournamentId: state.activeTournamentId,
          tournaments: (state.tournaments || []).map((x) => x.id),
          teams: (state.tournamentTeams || []).length,
          pools: (state.tournamentPools || []).length,
          matches: (state.tournamentMatches || []).length,
          seedOverride: state.seedOverride,
          mgtView,
        };
      },
      notices: () => globalThis.__notices.slice(),
      hub: (t, teams) => {
        state.tournaments = t ? [t] : [];
        state.activeTournamentId = t ? t.id : null;
        state.tournamentTeams = teams || [];
        manageView = 'tournament'; mgtView = null;
        return buildManageTournamentHTML();
      },
    };`;
  const context = vm.createContext(sandbox);
  vm.runInContext(pureSrc, context, { filename: 'pure.js' });
  vm.runInContext(appSrc + epilogue, context, { filename: 'app.js' });
  return { bridge: sandbox.__bridge, calls, notices };
}

const mutations = (calls) => calls.filter((c) => c.op !== 'select');
const scopeOf = (rec) => rec.filters.map(([c, v]) => c + '=' + v).join(',');
const JULY_T = () => ({ id: JULY, name: 'July 26 2026 tournament', status: 'pools' });

describe('tdbDeleteTournament — one row, and it has to be gone', () => {
  it('deletes exactly ONE row and lets the cascade take the children', async () => {
    const { bridge, calls } = loadApp();
    await bridge.del(JULY_T());
    const m = mutations(calls);
    expect(m.map((c) => c.table + ':' + c.op)).toEqual(['tournaments:delete']);
    // Hand-deleting children would only widen the blast radius: every child FK is ON DELETE CASCADE.
    ['matches', 'pools', 'teams', 'team_members', 'tournament_players'].forEach((t) =>
      expect(m.map((c) => c.table)).not.toContain(t));
  });

  it('scopes the delete to that one id, so the June event is untouchable', async () => {
    const { bridge, calls } = loadApp();
    await bridge.del(JULY_T());
    const del = mutations(calls)[0];
    expect(scopeOf(del)).toBe('id=' + JULY);
    expect(del.filters.length).toBeGreaterThan(0); // an unfiltered delete would empty the table
    expect(JSON.stringify(calls)).not.toContain(JUNE);
  });

  it('reads the row back, scoped to the same id', async () => {
    const { bridge, calls } = loadApp();
    await bridge.del(JULY_T());
    const readBacks = calls.filter((c) => c.op === 'select' && c.table === 'tournaments');
    expect(readBacks.length).toBe(1);
    expect(scopeOf(readBacks[0])).toBe('id=' + JULY);
    // ...and AFTER the delete, or it would be proving nothing.
    expect(calls.indexOf(readBacks[0])).toBeGreaterThan(calls.findIndex((c) => c.op === 'delete'));
  });

  // THE test. Deletes that match zero rows return error:null under a USING row filter.
  it('REFUSES to report success when the row survived a silently filtered delete', async () => {
    const { bridge } = loadApp({ survivors: { tournaments: 1 } });
    await expect(bridge.del(JULY_T())).rejects.toThrow('The delete did not go through');
  });

  it('refuses just as hard when the read-back itself fails — an unproven delete is not a delete', async () => {
    const { bridge } = loadApp({ readErr: true });
    await expect(bridge.del(JULY_T())).rejects.toThrow('The delete did not go through');
  });

  it('the failure message tells the admin what to actually do about it', async () => {
    const { bridge } = loadApp({ survivors: { tournaments: 1 } });
    await expect(bridge.del(JULY_T())).rejects.toThrow(/signed in as an admin/);
  });

  it('surfaces a real DELETE error rather than swallowing it', async () => {
    const { bridge } = loadApp({ failOn: (r) => r.table === 'tournaments' && r.op === 'delete' });
    await expect(bridge.del(JULY_T())).rejects.toBeTruthy();
  });

  it('refuses without a tournament, and writes nothing', async () => {
    const { bridge, calls } = loadApp();
    await expect(bridge.del(null)).rejects.toThrow('No tournament.');
    await expect(bridge.del({ name: 'no id' })).rejects.toThrow('No tournament.');
    expect(mutations(calls)).toEqual([]);
  });
});

describe('the Delete button on the sub-hub', () => {
  const teams = [{ id: 'a', name: 'Champs' }, { id: 'b', name: 'The Dawg House' }];

  it('does nothing at all unless the tournament NAME is typed exactly', async () => {
    const wrong = loadApp();
    const r1 = await wrong.bridge.run(JULY_T(), teams, 'july 26 2026 tournament'); // wrong case
    expect(mutations(wrong.calls)).toEqual([]);
    expect(r1.activeTournamentId).toBe(JULY);

    const cancelled = loadApp();
    await cancelled.bridge.run(JULY_T(), teams, null);                              // dialog cancelled
    expect(mutations(cancelled.calls)).toEqual([]);

    const blank = loadApp();
    await blank.bridge.run(JULY_T(), teams, '');
    expect(mutations(blank.calls)).toEqual([]);
  });

  it('deletes on the exact name, and stops pointing at the dead tournament afterwards', async () => {
    const { bridge, calls } = loadApp();
    const after = await bridge.run(JULY_T(), teams, 'July 26 2026 tournament');
    expect(mutations(calls).map((c) => c.table + ':' + c.op)).toContain('tournaments:delete');
    // The whole Manage area renders against activeTournamentId — leaving it on a gone id renders a ghost.
    expect(after.activeTournamentId).toBeNull();
    expect(after.tournaments).not.toContain(JULY);
    expect(after.teams).toBe(0);
    expect(after.pools).toBe(0);
    expect(after.matches).toBe(0);
    expect(after.seedOverride).toBeNull();
    expect(after.mgtView).toBeNull();   // back to the sub-hub, not a sub-view of nothing
  });

  it('KEEPS pointing at the tournament when the delete could not be proven', async () => {
    const { bridge } = loadApp({ survivors: { tournaments: 1 } });
    const after = await bridge.run(JULY_T(), teams, 'July 26 2026 tournament');
    // It is still there, so the app must still be managing it — clearing state here would hide a live event.
    expect(after.activeTournamentId).toBe(JULY);
    expect(after.tournaments).toContain(JULY);
  });

  it('says it failed instead of saying it worked', async () => {
    const { bridge } = loadApp({ survivors: { tournaments: 1 } });
    await bridge.run(JULY_T(), teams, 'July 26 2026 tournament');
    const said = bridge.notices().filter((n) => n.kind === 'notice').map((n) => n.o.title + ' ' + n.o.message).join(' | ');
    expect(said).toMatch(/Could not delete/);
    expect(said).not.toMatch(/deleted|is gone/i);
  });

  it('only says it is gone once the read-back proved it', async () => {
    const { bridge } = loadApp();
    await bridge.run(JULY_T(), teams, 'July 26 2026 tournament');
    const said = bridge.notices().filter((n) => n.kind === 'notice').map((n) => n.o.title).join(' | ');
    expect(said).toContain('Tournament deleted');
  });

  it('the confirm names what goes, counts the real teams, and carries no em dash', async () => {
    const { bridge } = loadApp();
    await bridge.run(JULY_T(), teams, null);
    const prompt = bridge.notices().find((n) => n.kind === 'prompt');
    expect(prompt.o.title).toBe('Delete this tournament');
    expect(prompt.o.message).toContain('2 teams');                 // the REAL count, not the mock's 6
    expect(prompt.o.message).toContain('their payments and every result');
    expect(prompt.o.message).toContain('for players too');
    expect(prompt.o.message).toContain('It cannot be undone.');
    expect(prompt.o.message).toContain('Type the tournament name to confirm.');
    // The handoff shipped this sentence with an em dash. It is two plain sentences now.
    expect(prompt.o.message).not.toContain('—');
    expect(prompt.o.message).not.toContain('&mdash;');
    expect(prompt.o.placeholder).toBe('July 26 2026 tournament');
  });

  it('reads singular when there is one team and drops the count when there are none', async () => {
    const one = loadApp();
    await one.bridge.run(JULY_T(), [{ id: 'a', name: 'Solo' }], null);
    expect(one.bridge.notices().find((n) => n.kind === 'prompt').o.message).toContain('1 team,');

    const none = loadApp();
    await none.bridge.run(JULY_T(), [], null);
    const msg = none.bridge.notices().find((n) => n.kind === 'prompt').o.message;
    expect(msg).toContain('the event and every result');
    expect(msg).not.toMatch(/\b0 teams\b/);
  });

  it('is wired on the sub-hub and is not a sub-view row', () => {
    const { bridge } = loadApp();
    const html = bridge.hub(JULY_T(), teams);
    expect(html).toContain('data-mgt-delete');
    expect(html).not.toContain('data-mgt-view="delete"');
  });
});
