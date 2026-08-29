// The team payment popup (#team-pay-modal) — Mark as paid + Withdraw team (design round 2026-08-03 §8).
//
// WHY THIS FILE EXISTS: the round moved the paid control OFF the list row ("move the paid function inside
// the team you click open") and into a popup, and added a Withdraw action to its footer. Two failure modes
// come with that move and both are money-shaped, which is the kind Mike notices at the courts:
//
//   1. A paid toggle that reports PAID over a write RLS silently filtered to zero rows. The same USING-row-
//      filter trap tdbDeleteTournament guards against: error:null, no rows touched. mgTeamTogglePaid
//      re-reads the team from the server after the write and refuses to show Paid unless the server says
//      Paid, so this file pins that behaviour with a DB stub that accepts the write and changes nothing.
//   2. Withdraw taking the wrong route mid-play. Deleting a team row that has already played nulls
//      team_a_id/team_b_id on its matches (the FK is ON DELETE SET NULL) and silently corrupts everyone
//      else's standings. Before the draw there are no games and the registration should simply go. This
//      file pins the route each stage takes.
//
// Harness: the vm sandbox, over a small FAKE DB rather than a call recorder — the read-back only means
// something if the reads see what the writes did. `denyWrites` makes every write a no-op that still returns
// error:null, which is exactly the silent-denial shape.
//
// WHAT THIS DOES NOT PROVE (§17): the real RLS decision, or that the popup's DOM updates in a browser.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const T_ID = '0f37a9dc-0a62-473b-8096-f74234affc48';

// A tiny in-memory Postgres stand-in. Enough of PostgREST's chain to serve the app's real queries.
function makeDb({ denyWrites } = {}) {
  const noop = () => {};
  const tables = {
    tournaments: [{ id: T_ID, name: 'July 26 2026 tournament', status: 'setup', buy_in: '$80 a team', venmo_link: '' }],
    teams: [
      { id: 'team-sharks', tournament_id: T_ID, name: 'Sand Sharks', paid: false, roster: ['Elliot Vance', 'Harper Vale'], created_at: '2026-07-22T00:00:00Z' },
      { id: 'team-gains', tournament_id: T_ID, name: 'Net Gains', paid: true, roster: ['Jordan Reyes'], created_at: '2026-07-21T00:00:00Z' },
    ],
    pools: [], matches: [], team_members: [], tournament_players: [],
  };
  const writes = [];
  const rpcs = [];
  const client = {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: noop } } }),
      getSession: async () => ({ data: { session: null } }),
      getUser: async () => ({ data: { user: null } }),
    },
    channel: () => ({ on: () => ({ subscribe: noop }) }),
    removeChannel: noop,
    rpc: async (name, args) => {
      rpcs.push({ name, args });
      // C101 Task 3: set_team_paid is a real write door now, so the fake DB has to BE one - the read-back
      // only means something if the read sees what the write did. denyWrites keeps its meaning: the
      // statement matches zero rows and still comes back error:null.
      if (name === 'set_team_paid') {
        const row = (tables.teams || []).find((t) => t.id === args.p_team);
        if (!row) return { data: null, error: { message: 'That team is not here any more.' } };
        writes.push({ table: 'teams', op: 'rpc:set_team_paid', payload: { paid: !!args.p_paid }, filters: [['id', args.p_team]] });
        if (!denyWrites) row.paid = !!args.p_paid;
        return { data: denyWrites ? null : { ...row }, error: null };
      }
      return { data: null, error: null };
    },
    from(table) {
      const filters = [];
      let op = 'select', payload = null;
      const match = (row) => filters.every(([c, v]) => String(row[c]) === String(v));
      const chain = {
        select() { return chain; },
        update(p) { op = 'update'; payload = p; return chain; },
        delete() { op = 'delete'; return chain; },
        insert(p) { op = 'insert'; payload = p; return chain; },
        eq(c, v) { filters.push([c, v]); return chain; },
        in() { return chain; },
        order() { return chain; },
        limit() { return chain; },
        single() { return chain; },
        maybeSingle() { return chain; },
        then(resolve) {
          const rows = tables[table] || [];
          if (op === 'select') return Promise.resolve({ data: rows.filter(match), error: null, count: rows.filter(match).length }).then(resolve);
          writes.push({ table, op, payload, filters: filters.slice() });
          // denyWrites is the silent-RLS-denial shape: the statement matches ZERO rows and still returns
          // error:null, so nothing changes and nothing complains.
          if (!denyWrites) {
            if (op === 'update') rows.filter(match).forEach((r) => Object.assign(r, payload));
            if (op === 'delete') tables[table] = rows.filter((r) => !match(r));
          }
          return Promise.resolve({ data: [], error: null, count: 0 }).then(resolve);
        },
      };
      return chain;
    },
  };
  return { client, tables, writes, rpcs };
}

function loadApp(opts) {
  const pureSrc = readFileSync(new URL('../public/pure.js', import.meta.url), 'utf8');
  const appSrc = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const mgSrc = readFileSync(new URL('../public/manage.js', import.meta.url), 'utf8');
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
  const { client, tables, writes, rpcs } = makeDb(opts);
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
  sandbox.__said = [];
  const epilogue = `
    ;globalThis.__bridge = {
      boot: async (status, matches) => {
        state.isAdmin = true;
        state.activeTournamentId = ${JSON.stringify(T_ID)};
        await tdbRefreshTournaments();
        if (status) state.tournaments[0].status = status;
        state.tournamentMatches = matches || [];
        manageView = 'tournament'; mgtView = 'teams';
        appNotice = (o) => { globalThis.__said.push(o); };
        appConfirm = async () => globalThis.__confirmAnswer !== false;
      },
      answerConfirm: (v) => { globalThis.__confirmAnswer = v; },
      team: (id) => mgFindTeam(id),
      popup: (id) => buildMgTeamPayModalHTML(mgFindTeam(id)),
      list: () => buildMgTeamsHTML(),
      pay: (id) => mgTeamTogglePaid(id),
      withdraw: (id) => mgtpWithdraw(id),
      signOut: () => { state.isAdmin = false; },
      said: () => globalThis.__said.slice(),
    };`;
  const context = vm.createContext(sandbox);
  vm.runInContext(pureSrc, context, { filename: 'pure.js' });
  vm.runInContext(mgSrc, context, { filename: 'manage.js' });   // C102: the Manage block loads before app.js, as in index.html
  vm.runInContext(appSrc + epilogue, context, { filename: 'app.js' });
  return { bridge: sandbox.__bridge, tables, writes, rpcs };
}

describe('Mark as paid', () => {
  // C101 Task 3 / migration 0060 FLIPS this: paid was a bare `from('teams').update({ paid })`, which
  // could never leave an audit row (action_log has RLS on and zero policies). It is now one DEFINER RPC
  // that writes the flag AND the log row and hands the row back.
  it('writes paid on that team only, through the set_team_paid RPC', async () => {
    const { bridge, tables, writes, rpcs } = loadApp();
    await bridge.boot('setup');
    await bridge.pay('team-sharks');
    expect(writes.filter((x) => x.op === 'update' && x.table === 'teams').length).toBe(0); // the old door is gone
    expect(rpcs.filter((r) => r.name === 'set_team_paid').length).toBe(1);
    expect(rpcs.find((r) => r.name === 'set_team_paid').args).toEqual({ p_team: 'team-sharks', p_paid: true });
    expect(tables.teams.find((t) => t.id === 'team-sharks').paid).toBe(true);
    expect(tables.teams.find((t) => t.id === 'team-gains').paid).toBe(true); // untouched
  });

  it('repaints the popup and the list row off the RETURNED row, not off a re-read', async () => {
    const { bridge } = loadApp();
    await bridge.boot('setup');
    await bridge.pay('team-sharks');
    const after = bridge.popup('team-sharks');
    expect(after).toContain('mgv-pmeta is-paid');
    expect(after).toContain('>Mark as unpaid<');
  });

  it('a silently refused RPC restores the button and says so, and never reports Paid', async () => {
    const { bridge, tables } = loadApp({ denyWrites: true });
    await bridge.boot('setup');
    await bridge.pay('team-sharks');
    expect(tables.teams.find((t) => t.id === 'team-sharks').paid).toBe(false);
    expect(bridge.said().map((n) => `${n.title} ${n.message}`).join(' ')).toMatch(/did not save|Could not save/i);
    expect(bridge.popup('team-sharks')).toContain('mgv-pmeta is-unpaid');
  });

  it('the direct paid door is gone from the source entirely', () => {
    const mgGuardSrc = readFileSync(new URL('../public/manage.js', import.meta.url), 'utf8');
    const src = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8')
      + '\n' + mgGuardSrc;   // C102: the client is two files; a guard over one would pass vacuously
    // Comments come out first: tdbSetTeamPaid's own header NAMES the door it replaced, which is exactly
    // what a header should do, and a guard that reads comments bans the explanation along with the code
    // (the 2026-08-24 §41 lesson).
    const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(?<!:)\/\/[^\n]*/g, ' ');
    expect(code).not.toContain("from('teams').update({ paid");
    expect(code).toContain("rpc('set_team_paid'");
  });

  it('moves the popup state word, the button and the list row together', async () => {
    const { bridge } = loadApp();
    await bridge.boot('setup');
    expect(bridge.popup('team-sharks')).toContain('mgv-pmeta is-unpaid');
    expect(bridge.popup('team-sharks')).toContain('>Mark as paid<');
    expect(bridge.list()).toContain('2 in · 1 paid');

    await bridge.pay('team-sharks');

    const after = bridge.popup('team-sharks');
    expect(after).toContain('mgv-pmeta is-paid');
    expect(after).toContain('>Paid<');
    expect(after).toContain('>Mark as unpaid<');   // the control is a toggle, so a mis-tap is recoverable
    const list = bridge.list();
    expect(list).toContain('2 in · 2 paid');
    expect(list).not.toContain('is-unpaid');
  });

  it('toggles back to unpaid', async () => {
    const { bridge, tables } = loadApp();
    await bridge.boot('setup');
    await bridge.pay('team-gains');    // starts paid
    expect(tables.teams.find((t) => t.id === 'team-gains').paid).toBe(false);
    expect(bridge.popup('team-gains')).toContain('mgv-pmeta is-unpaid');
  });

  // The money one. A write the server filtered to zero rows comes back error:null.
  it('refuses to show PAID when the server never recorded it', async () => {
    const { bridge, tables } = loadApp({ denyWrites: true });
    await bridge.boot('setup');
    await bridge.pay('team-sharks');
    expect(tables.teams.find((t) => t.id === 'team-sharks').paid).toBe(false);
    expect(bridge.popup('team-sharks')).toContain('mgv-pmeta is-unpaid');
    const said = bridge.said().map((s) => s.title + ' ' + s.message).join(' | ');
    expect(said).toMatch(/did not save/i);
    expect(said).toMatch(/signed in as an admin/);
  });

  it('says nothing when the write really landed', async () => {
    const { bridge } = loadApp();
    await bridge.boot('setup');
    await bridge.pay('team-sharks');
    expect(bridge.said()).toEqual([]);
  });

  it('does not write for a non-admin, or for a team that is not there', async () => {
    const notAdmin = loadApp();
    await notAdmin.bridge.boot('setup');
    notAdmin.bridge.signOut();
    await notAdmin.bridge.pay('team-sharks');
    expect(notAdmin.writes.filter((x) => x.table === 'teams')).toEqual([]);
    expect(notAdmin.tables.teams.find((t) => t.id === 'team-sharks').paid).toBe(false);

    const gone = loadApp();
    await gone.bridge.boot('setup');
    await gone.bridge.pay('no-such-team');
    expect(gone.writes.filter((x) => x.table === 'teams')).toEqual([]);
  });
});

describe('Withdraw team', () => {
  it('BEFORE the draw removes the registration', async () => {
    const { bridge, tables } = loadApp();
    await bridge.boot('setup');
    bridge.answerConfirm(true);
    await bridge.withdraw('team-sharks');
    expect(tables.teams.map((t) => t.id)).toEqual(['team-gains']);
  });

  it('MID-PLAY forfeits their remaining games and never deletes the row', async () => {
    // Deleting a team that has already played nulls team_a_id/team_b_id on those matches (ON DELETE SET
    // NULL) and silently distorts every other team's record. Mid-play the answer is a forfeit, not a delete.
    const { bridge, tables, writes, rpcs } = loadApp();
    await bridge.boot('pools', [
      { id: 'm-played', phase: 'pool', status: 'final', team_a_id: 'team-sharks', team_b_id: 'team-gains' },
      { id: 'm-todo', phase: 'pool', status: 'scheduled', team_a_id: 'team-sharks', team_b_id: 'team-gains', version: 0 },
      { id: 'm-other', phase: 'pool', status: 'scheduled', team_a_id: 'team-gains', team_b_id: 'team-x', version: 0 },
    ]);
    bridge.answerConfirm(true);
    await bridge.withdraw('team-sharks');
    expect(tables.teams.map((t) => t.id)).toContain('team-sharks');
    expect(writes.filter((x) => x.table === 'teams' && x.op === 'delete')).toEqual([]);
    // Exactly their ONE unplayed game is forfeited: not the finished one, not somebody else's.
    const scored = rpcs.filter((r) => r.name === 'submit_match_score');
    expect(scored.map((r) => r.args.p_match)).toEqual(['m-todo']);
    expect(scored[0].args.p_score_b).toBeGreaterThan(scored[0].args.p_score_a); // the opponent wins
  });

  it('asks first, and a No leaves everything alone', async () => {
    const { bridge, tables, writes } = loadApp();
    await bridge.boot('setup');
    bridge.answerConfirm(false);
    await bridge.withdraw('team-sharks');
    expect(tables.teams.map((t) => t.id)).toContain('team-sharks');
    expect(writes.filter((x) => x.table === 'teams')).toEqual([]);
  });

  it('ignores an unknown team instead of throwing', async () => {
    const { bridge, writes } = loadApp();
    await bridge.boot('setup');
    bridge.answerConfirm(true);
    await bridge.withdraw('team-that-left');
    expect(writes.filter((x) => x.table === 'teams')).toEqual([]);
  });
});

describe('the popup and the row it opens from', () => {
  it('carries both hooks, and the destructive one is inside the popup only', async () => {
    const { bridge } = loadApp();
    await bridge.boot('setup');
    const popup = bridge.popup('team-sharks');
    expect(popup).toContain('data-mgtp-paid="team-sharks"');
    expect(popup).toContain('data-mgtp-withdraw="team-sharks"');
    // The list row REPORTS state and opens the team. It carries no paid toggle and no withdraw.
    const list = bridge.list();
    expect(list).toContain('data-mgtp-team="team-sharks"');
    expect(list).not.toContain('data-mgtp-paid');
    expect(list).not.toContain('data-mgtp-withdraw');
  });

  // C101 Task 3 / migration 0060 FLIPS this: set_team_paid writes teams AND action_log in one DEFINER
  // call, so the popup may claim the entry now, and the handoff's own sentence comes back.
  it('claims the activity-log entry it now really writes', async () => {
    const { bridge } = loadApp();
    await bridge.boot('setup');
    const popup = bridge.popup('team-sharks');
    expect(popup).toContain('Logged in the activity log with your name.');
    expect(popup).not.toContain('Every admin sees this straight away.');
    expect(popup).not.toContain('—');
  });

  it('keeps the copy law', async () => {
    const { bridge } = loadApp();
    await bridge.boot('setup');
    const html = bridge.popup('team-sharks') + bridge.list();
    expect(html).not.toContain('—');
    expect(html).not.toContain('&mdash;');
    expect(html).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });
});
