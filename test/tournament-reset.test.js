// Full tournament reset (Mike, 2026-07-26: "admins need a reset full tournament ability").
//
// WHY THIS FILE EXISTS: tdbResetTournamentFull is the only client function that deletes matches AND pools
// with no phase filter. The tables are shared by every tournament in the community, so a dropped or wrong
// `tournament_id` filter would take out the June 2026 event (18 teams / 71 hand-authored matches that exist
// ONLY in the DB). These tests pin the scoping, the FK-safe order, and the blast radius so a future edit
// cannot quietly widen it.
//
// Harness: the same vm-sandbox pattern as manage-page.test.js (app.js is a browser classic script), except
// the Supabase client is a RECORDER — every .delete()/.update()/.insert() is captured with its table,
// payload and filters, so the test asserts the exact statements issued rather than mocking a database.
//
// WHAT THIS DOES NOT PROVE (§17, stated rather than implied — there is no local Postgres for this project):
// that the server ACCEPTS the statements. RLS permission, the FK on-delete behavior and the real row counts
// are verified out-of-band against prod by REST after a real admin tap. The FKs this relies on, from
// db/migrations/0001_tournament_schema.sql: matches.winner_next_match_id / loser_next_match_id -> matches(id)
// ON DELETE SET NULL (line 64/66, so a bulk match delete cannot trip the self-reference), teams.pool_id ->
// pools(id) ON DELETE SET NULL (line 30), matches.pool_id -> pools(id) ON DELETE CASCADE (line 48).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const JULY = '0f37a9dc-0a62-473b-8096-f74234affc48';
const JUNE = 'cee5b605-587c-449b-87a6-3e7e3a0c557a';

// A chainable Supabase stub that records mutating calls. `failOn(rec)` returns true to make that one
// statement resolve with an error (used for the partial-failure tests).
function makeRecorder(failOn, leftovers) {
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
      const rec = { table, op: 'select', payload: null, filters: [] };
      let pushed = false;
      const push = () => { if (!pushed) { pushed = true; calls.push(rec); } };
      const chain = {
        delete() { rec.op = 'delete'; push(); return chain; },
        update(payload) { rec.op = 'update'; rec.payload = payload; push(); return chain; },
        insert(payload) { rec.op = 'insert'; rec.payload = payload; push(); return chain; },
        upsert(payload) { rec.op = 'upsert'; rec.payload = payload; push(); return chain; },
        // Recorded too (the read-back is a select), but push() keeps whatever op was already set so a
        // chain like .insert(rows).select() stays recorded as an insert, not a select.
        select() { push(); return chain; },
        eq(col, val) { rec.filters.push([col, val]); return chain; },
        in(col, val) { rec.filters.push([col, val]); return chain; },
        order() { return chain; },
        limit() { return chain; },
        single() { return chain; },
        then(resolve) {
          const error = failOn && failOn(rec) ? { message: 'simulated ' + rec.table + ' failure' } : null;
          // `leftovers` simulates the silent-RLS-denial case: the deletes "succeed" (error null) but the
          // rows are still there, so the read-back count comes back non-zero.
          const count = (rec.op === 'select' && leftovers && leftovers[rec.table] != null) ? leftovers[rec.table] : 0;
          return Promise.resolve({ data: [], error, count }).then(resolve);
        },
      };
      return chain;
    },
  };
  return { client, calls };
}

function loadApp(failOn, leftovers) {
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
  const { client, calls } = makeRecorder(failOn, leftovers);
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
    ;globalThis.__bridge = {
      resetFull: (t) => tdbResetTournamentFull(t),
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
  return { bridge: sandbox.__bridge, calls };
}

const mutations = (calls) => calls.filter((c) => c.op !== 'select');
const scopeOf = (rec) => rec.filters.map(([c, v]) => c + '=' + v).join(',');

describe('tdbResetTournamentFull — the escape hatch back to a clean setup', () => {
  it('issues exactly four writes in FK-safe order: matches, pools, teams, tournaments', async () => {
    const { bridge, calls } = loadApp();
    await bridge.resetFull({ id: JULY, name: 'July 26 2026 tournament' });
    const m = mutations(calls);
    expect(m.map((c) => c.table + ':' + c.op)).toEqual([
      'matches:delete',
      'pools:delete',
      'teams:update',
      'tournaments:update',
    ]);
  });

  it('scopes EVERY statement to the one tournament so the June event is untouchable', async () => {
    const { bridge, calls } = loadApp();
    await bridge.resetFull({ id: JULY, name: 'July 26 2026 tournament' });
    const m = mutations(calls);
    expect(scopeOf(m[0])).toBe('tournament_id=' + JULY);   // matches
    expect(scopeOf(m[1])).toBe('tournament_id=' + JULY);   // pools
    expect(scopeOf(m[2])).toBe('tournament_id=' + JULY);   // teams
    expect(scopeOf(m[3])).toBe('id=' + JULY);              // the tournaments row itself
    // Nothing anywhere in the reset may reference the other tournament.
    expect(JSON.stringify(m)).not.toContain(JUNE);
    // Every mutating statement carries a filter. An unfiltered delete would be community-wide.
    m.forEach((c) => expect(c.filters.length).toBeGreaterThan(0));
  });

  it('never DELETES a team, a member, a person or a pickup player — progress only', async () => {
    const { bridge, calls } = loadApp();
    await bridge.resetFull({ id: JULY, name: 'July 26 2026 tournament' });
    const deletes = mutations(calls).filter((c) => c.op === 'delete').map((c) => c.table);
    expect(deletes).toEqual(['matches', 'pools']);
    ['teams', 'team_members', 'tournament_players', 'players', 'profiles'].forEach((t) =>
      expect(deletes).not.toContain(t));
  });

  it('touches only pool_id and seed on teams, so paid and roster survive', async () => {
    const { bridge, calls } = loadApp();
    await bridge.resetFull({ id: JULY, name: 'July 26 2026 tournament' });
    const teamsUpdate = mutations(calls).find((c) => c.table === 'teams');
    expect(Object.keys(teamsUpdate.payload).sort()).toEqual(['pool_id', 'seed']);
    expect(teamsUpdate.payload.pool_id).toBeNull();
    expect(teamsUpdate.payload.seed).toBeNull();
    expect(teamsUpdate.payload).not.toHaveProperty('paid');
    expect(teamsUpdate.payload).not.toHaveProperty('roster');
    expect(teamsUpdate.payload).not.toHaveProperty('name');
  });

  it('puts the tournament row back to setup and clears the seed order + champion, leaving registration alone', async () => {
    const { bridge, calls } = loadApp();
    await bridge.resetFull({ id: JULY, name: 'July 26 2026 tournament' });
    const tRow = mutations(calls).find((c) => c.table === 'tournaments');
    expect(tRow.payload.status).toBe('setup');
    expect(tRow.payload.seed_override).toBeNull();
    expect(tRow.payload.champion_team_id).toBeNull();
    // Registration state, rules and the announcement are Mike's content, not progress.
    expect(tRow.payload).not.toHaveProperty('registration_open');
    expect(tRow.payload).not.toHaveProperty('rules');
    expect(tRow.payload).not.toHaveProperty('announcement');
  });

  it('stops at the failing statement so a retry can finish the job (matches fails)', async () => {
    const { bridge, calls } = loadApp((rec) => rec.table === 'matches' && rec.op === 'delete');
    await expect(bridge.resetFull({ id: JULY, name: 'July 26 2026 tournament' })).rejects.toBeTruthy();
    const m = mutations(calls);
    expect(m.map((c) => c.table)).toEqual(['matches']); // never went on to drop pools
  });

  it('stops at the failing statement so a retry can finish the job (pools fails)', async () => {
    const { bridge, calls } = loadApp((rec) => rec.table === 'pools' && rec.op === 'delete');
    await expect(bridge.resetFull({ id: JULY, name: 'July 26 2026 tournament' })).rejects.toBeTruthy();
    const m = mutations(calls);
    expect(m.map((c) => c.table)).toEqual(['matches', 'pools']); // teams untouched
  });

  it('is idempotent — a second run issues the same statements and still succeeds', async () => {
    const { bridge, calls } = loadApp();
    const t = { id: JULY, name: 'July 26 2026 tournament' };
    await bridge.resetFull(t);
    const first = mutations(calls).map((c) => c.table + ':' + c.op);
    await bridge.resetFull(t);
    const second = mutations(calls).map((c) => c.table + ':' + c.op).slice(first.length);
    expect(second).toEqual(first);
  });

  // The silent-denial case. RLS in 0052 is a USING row FILTER, not a RAISE: a session that has drifted off
  // its organizer membership gets deletes that match zero rows and return `error: null`. Without the
  // read-back the button would report success over a completely untouched tournament.
  it('refuses to report success when the deletes were silently filtered to zero rows', async () => {
    const { bridge } = loadApp(null, { pools: 1, matches: 1 });
    await expect(bridge.resetFull({ id: JULY, name: 'July 26 2026 tournament' }))
      .rejects.toThrow('The reset did not go through');
  });

  it('catches a silent denial even when only ONE table survived', async () => {
    const onlyMatches = loadApp(null, { pools: 0, matches: 1 });
    await expect(onlyMatches.bridge.resetFull({ id: JULY, name: 'x' })).rejects.toThrow('did not go through');
    const onlyPools = loadApp(null, { pools: 2, matches: 0 });
    await expect(onlyPools.bridge.resetFull({ id: JULY, name: 'x' })).rejects.toThrow('did not go through');
  });

  it('reads the leftover counts back scoped to the same tournament, never community-wide', async () => {
    const { bridge, calls } = loadApp();
    await bridge.resetFull({ id: JULY, name: 'July 26 2026 tournament' });
    const readBacks = calls.filter((c) => c.op === 'select' && (c.table === 'pools' || c.table === 'matches'));
    expect(readBacks.length).toBe(2);
    readBacks.forEach((c) => expect(scopeOf(c)).toBe('tournament_id=' + JULY));
  });

  it('refuses without a tournament', async () => {
    const { bridge, calls } = loadApp();
    await expect(bridge.resetFull(null)).rejects.toThrow('No tournament.');
    expect(mutations(calls)).toEqual([]);
  });
});

describe('the Reset the whole tournament control on the sub-hub', () => {
  const teams = [{ id: 'a', name: 'Champs', paid: true }, { id: 'b', name: 'The Dawg House', paid: true }];

  it('renders at EVERY status, because escaping a bad state is the whole point', () => {
    const { bridge } = loadApp();
    ['setup', 'pools', 'bracket', 'completed'].forEach((status) => {
      const html = bridge.hub({ id: JULY, name: 'July 26 2026 tournament', status }, teams);
      expect(html).toContain('data-mgt-fullreset');
      expect(html).toContain('Reset the whole tournament');
    });
  });

  // Design round 2026-08-03 (README §7): the loose reset button became a bordered Danger zone
  // holding TWO rows, Reset and Delete, each with its own description and right-aligned button.
  it('lives in the Danger zone beside Delete, and does not become a sub-view row', () => {
    const { bridge } = loadApp();
    const html = bridge.hub({ id: JULY, name: 'July 26 2026 tournament', status: 'pools' }, teams);
    expect(html).toContain('class="mgv-danger"');
    expect(html).toContain('data-mgt-fullreset');
    expect(html).toContain('data-mgt-delete');   // the destructive sibling shares the box
    // Neither may carry data-mgt-view, or tapping would open a sub-view instead of acting.
    expect(html).not.toContain('data-mgt-view="fullreset"');
    expect(html).not.toContain('data-mgt-view="delete"');
    // The seven real sub-view rows are still exactly seven.
    ['registration', 'teams', 'pools', 'bracket', 'settings', 'rules', 'closeout'].forEach((v) =>
      expect(html.split(`data-mgt-view="${v}"`).length - 1).toBe(1));
  });

  it('says what each action takes and keeps, in plain copy with no em dash and no emoji', () => {
    const { bridge } = loadApp();
    const html = bridge.hub({ id: JULY, name: 'July 26 2026 tournament', status: 'pools' }, teams);
    const zone = html.slice(html.indexOf('class="mgv-danger"'));
    // Reset is the recoverable one: it says what SURVIVES.
    expect(zone).toMatch(/[Rr]egistered teams and their payments are kept/);
    // Delete is the irreversible one: it must say so, and say it takes the players' copy too.
    expect(zone).toContain('cannot be undone');
    expect(zone).toMatch(/[Bb]oth ask you to type the tournament name/);
    // The copy law still holds on the new strings (the handoff shipped 4 em dashes here).
    expect(zone).not.toContain('—');
    expect(zone).not.toContain('&mdash;');
    expect(zone).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u); // no emoji
  });

  it('is absent when there is no tournament to reset', () => {
    const { bridge } = loadApp();
    const html = bridge.hub(null, []);
    expect(html).toContain('No tournament yet');
    expect(html).not.toContain('data-mgt-fullreset');
  });
});
