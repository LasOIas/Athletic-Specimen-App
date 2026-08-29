// End a tournament that never played (2026-08-04) — the Close out screen's setup branch.
//
// WHY THIS FILE EXISTS, and it is the same reason as tournament-delete.test.js: A WRITE THAT REPORTS SUCCESS
// WITHOUT PROVING IT. This action does NOT go through close_tournament — that RPC accepts only 'pools' or
// 'bracket' and RAISEs "Nothing to close yet" from 'setup' (db/migrations/0050_closeout.sql:50-55), which is
// exactly the dead end this feature fills. So the write is a direct field update through tdbSetTournamentFields,
// and a direct update has no RAISE to hide behind: the RLS policies on `tournaments` are USING row FILTERS, so
// a session that has drifted to anon or off its organizer membership gets an UPDATE matching ZERO rows and
// `error: null`. Every client check passes, the screen says "Tournament ended", and the event is still sitting
// in setup with registration open, still competing with the real next event on the public registration surface
// (app.js selects `registration_open && status === 'setup'` in three places). tdbEndTournamentUnplayed
// re-selects the row and REQUIRES status === 'completed'; these tests fail the build if that guard is weakened.
//
// The second thing pinned here is that this action is CONSTRUCTIVE. It writes exactly three columns on exactly
// one row and deletes NOTHING — the registered teams, their paid flags, the rosters and the rules sheet all
// survive, which is the promise the on-screen copy makes. A future edit that starts deleting fails these tests.
//
// Harness: the recorder from tournament-reset.test.js / tournament-delete.test.js, extended so a `.single()`
// select resolves to a ROW (this read-back reads a value, it does not count rows like the other two do).
//
// WHAT THIS DOES NOT PROVE (§17): that the server accepts the UPDATE, or which RLS policy set is live on
// `tournaments`. The read-back is precisely what makes the button honest either way.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const JULY = '0f37a9dc-0a62-473b-8096-f74234affc48';
const JUNE = 'cee5b605-587c-449b-87a6-3e7e3a0c557a';

// `statusAfter` is what the read-back finds (the silent-RLS-denial case passes 'setup': the update "succeeded"
// with error:null but nothing moved). `noRow` makes the read-back come back empty; `readErr` makes it fail.
function makeRecorder({ failOn, statusAfter, noRow, readErr } = {}) {
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
          const isReadBack = rec.op === 'select' && rec.single && rec.table === 'tournaments';
          const error = (failOn && failOn(rec)) ? { message: 'simulated ' + rec.table + ' failure' }
            : (isReadBack && readErr) ? { message: 'simulated read-back failure' } : null;
          // `statusAfter === undefined` means "not specified" → the happy path. An explicitly falsy value
          // ('' or null) is a REAL case (a row that came back without a usable status) and must survive here.
          const data = isReadBack
            ? (noRow ? null : { id: JULY, status: statusAfter === undefined ? 'completed' : statusAfter })
            : [];
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
      end: (t) => tdbEndTournamentUnplayed(t),
      // Drive the whole button: seed the manage state, stub the two house dialogs (both are DOM), run it.
      // \`answer\` is what the admin taps in the confirm (true = go ahead, false = cancel).
      run: async (t, teams, answer, opts) => {
        const o = opts || {};
        state.isAdmin = o.isAdmin === false ? false : true;
        state.tournaments = t ? [t] : [];
        state.activeTournamentId = t ? t.id : null;
        state.tournamentTeams = teams || [];
        state.tournamentPools = [];
        state.tournamentMatches = [];
        manageView = 'tournament'; mgtView = 'closeout';
        appConfirm = async (arg) => { globalThis.__notices.push({ kind: 'confirm', o: arg }); return answer; };
        appNotice = (arg) => { globalThis.__notices.push({ kind: 'notice', o: arg }); };
        await mgCloseoutEndUnplayed();
        return {
          activeTournamentId: state.activeTournamentId,
          status: (state.tournaments[0] || {}).status,
          teams: (state.tournamentTeams || []).length,
          mgtView,
        };
      },
      notices: () => globalThis.__notices.slice(),
      // The Close out screen for a given tournament + teams + matches.
      closeout: (t, teams, matches) => {
        state.tournaments = t ? [t] : [];
        state.activeTournamentId = t ? t.id : null;
        state.tournamentTeams = teams || [];
        state.tournamentMatches = matches || [];
        state.tournamentPools = [];
        manageView = 'tournament'; mgtView = 'closeout';
        return buildMgCloseoutHTML();
      },
    };`;
  const context = vm.createContext(sandbox);
  vm.runInContext(pureSrc, context, { filename: 'pure.js' });
  vm.runInContext(mgSrc, context, { filename: 'manage.js' });   // C102: the Manage block loads before app.js, as in index.html
  vm.runInContext(appSrc + epilogue, context, { filename: 'app.js' });
  return { bridge: sandbox.__bridge, calls, notices: sandbox.__notices };
}

const mutations = (calls) => calls.filter((c) => c.op !== 'select');
const scopeOf = (rec) => rec.filters.map(([c, v]) => c + '=' + v).join(',');
const SETUP_T = () => ({ id: JULY, name: 'August 2026 tournament', status: 'setup' });
const TEAMS = [{ id: 'a', name: 'Champs', paid: true }, { id: 'b', name: 'The Dawg House', paid: false }];

describe('tdbEndTournamentUnplayed — the write, and the proof it landed', () => {
  it('issues exactly ONE mutating statement, an update on tournaments', async () => {
    const { bridge, calls } = loadApp();
    await bridge.end(SETUP_T());
    expect(mutations(calls).map((c) => c.table + ':' + c.op)).toEqual(['tournaments:update']);
  });

  it('DELETES nothing — the teams, their payments and the rosters are the whole point', async () => {
    const { bridge, calls } = loadApp();
    await bridge.end(SETUP_T());
    expect(mutations(calls).filter((c) => c.op === 'delete')).toEqual([]);
    ['teams', 'matches', 'pools', 'team_members', 'tournament_players'].forEach((t) =>
      expect(mutations(calls).map((c) => c.table)).not.toContain(t));
  });

  it('sets exactly the three fields close_tournament would set, and nothing else', async () => {
    const { bridge, calls } = loadApp();
    await bridge.end(SETUP_T());
    const row = mutations(calls)[0];
    // updated_at rides along from tdbSetTournamentFields itself (every field write stamps it).
    expect(Object.keys(row.payload).sort()).toEqual(['champion_team_id', 'registration_open', 'status', 'updated_at']);
    expect(row.payload.status).toBe('completed');
    expect(row.payload.registration_open).toBe(false);
    expect(row.payload.champion_team_id).toBeNull();
    // Mike's content is not this action's business.
    ['rules', 'announcement', 'name', 'seed_override', 'venmo_link', 'buy_in'].forEach((k) =>
      expect(row.payload).not.toHaveProperty(k));
  });

  it('scopes the update to that one id, so the June event is untouchable', async () => {
    const { bridge, calls } = loadApp();
    await bridge.end(SETUP_T());
    const row = mutations(calls)[0];
    expect(scopeOf(row)).toBe('id=' + JULY);
    expect(row.filters.length).toBeGreaterThan(0); // an unfiltered update would complete every tournament
    expect(JSON.stringify(calls)).not.toContain(JUNE);
  });

  it('reads the row back AFTER the write, scoped to the same id', async () => {
    const { bridge, calls } = loadApp();
    await bridge.end(SETUP_T());
    const readBacks = calls.filter((c) => c.op === 'select' && c.table === 'tournaments');
    expect(readBacks.length).toBe(1);
    expect(scopeOf(readBacks[0])).toBe('id=' + JULY);
    expect(calls.indexOf(readBacks[0])).toBeGreaterThan(calls.findIndex((c) => c.op === 'update'));
  });

  // THE test. A USING row filter turns a denied UPDATE into zero rows + error:null.
  it('REFUSES to report success when the row is STILL in setup after a silently filtered update', async () => {
    const { bridge } = loadApp({ statusAfter: 'setup' });
    await expect(bridge.end(SETUP_T())).rejects.toThrow('Ending the tournament did not go through');
  });

  it('refuses for any status that is not completed, not just setup', async () => {
    for (const s of ['pools', 'bracket', '', null]) {
      const { bridge } = loadApp({ statusAfter: s });
      await expect(bridge.end(SETUP_T())).rejects.toThrow('did not go through');
    }
  });

  it('refuses when the read-back finds no row at all', async () => {
    const { bridge } = loadApp({ noRow: true });
    await expect(bridge.end(SETUP_T())).rejects.toThrow('did not go through');
  });

  it('refuses just as hard when the read-back ITSELF fails — an unproven write is not a write', async () => {
    const { bridge } = loadApp({ readErr: true });
    await expect(bridge.end(SETUP_T())).rejects.toThrow('did not go through');
  });

  it('the failure message tells the admin what to actually do about it', async () => {
    const { bridge } = loadApp({ statusAfter: 'setup' });
    await expect(bridge.end(SETUP_T())).rejects.toThrow(/signed in as an admin/);
  });

  it('surfaces a real UPDATE error rather than swallowing it', async () => {
    const { bridge } = loadApp({ failOn: (r) => r.table === 'tournaments' && r.op === 'update' });
    await expect(bridge.end(SETUP_T())).rejects.toBeTruthy();
  });

  it('refuses without a tournament, and writes nothing', async () => {
    const { bridge, calls } = loadApp();
    await expect(bridge.end(null)).rejects.toThrow('No tournament.');
    await expect(bridge.end({ name: 'no id' })).rejects.toThrow('No tournament.');
    expect(mutations(calls)).toEqual([]);
  });
});

describe('the Close out screen at setup — a real action instead of a dead end', () => {
  it('offers the action, where there used to be nothing at all', () => {
    const { bridge } = loadApp();
    const html = bridge.closeout(SETUP_T(), TEAMS, []);
    expect(html).toContain('data-mgco-endunplayed');
    expect(html).toContain('End this tournament without playing it');
    // The dead end is gone.
    expect(html).not.toContain('Nothing to close yet');
  });

  it('says what it does and what survives, naming the real team count', () => {
    const { bridge } = loadApp();
    const html = bridge.closeout(SETUP_T(), TEAMS, []);
    expect(html).toContain('No games were played, so there is no champion to crown.');
    expect(html).toContain('Moves it to Past tournaments and closes registration.');
    expect(html).toContain('Your 2 registered teams, their payments, the rosters and the rules sheet are kept.');
    expect(html).toContain('You can reopen it');
  });

  it('reads singular for one team, and says nothing is deleted when there are none', () => {
    const { bridge } = loadApp();
    const one = bridge.closeout(SETUP_T(), [{ id: 'a', name: 'Solo' }], []);
    expect(one).toContain('Your 1 registered team, their payments');
    const none = bridge.closeout(SETUP_T(), [], []);
    expect(none).toContain('Nothing is deleted.');
    expect(none).not.toMatch(/\b0 registered teams\b/);
  });

  it('is NOT Danger-zone grammar: no red box, no typed name, one tap', () => {
    const { bridge } = loadApp();
    const html = bridge.closeout(SETUP_T(), TEAMS, []);
    expect(html).not.toContain('mgv-danger');
    expect(html).not.toContain('mgts-danger');
    expect(html).not.toMatch(/[Tt]ype the tournament name/);
    // It uses the screen's own primary CTA, the same component the active branch ends with.
    expect(html).toContain('class="mgt-cta" data-mgco-endunplayed');
  });

  it('keeps the copy law: no em dash, no emoji, no inline styles', () => {
    const { bridge } = loadApp();
    const html = bridge.closeout(SETUP_T(), TEAMS, []);
    expect(html).not.toContain('—');
    expect(html).not.toContain('&mdash;');
    expect(html).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    expect(html).not.toContain('style="');
  });

  it('never offers a champion on an event with no games', () => {
    const { bridge } = loadApp();
    const html = bridge.closeout(SETUP_T(), TEAMS, []);
    expect(html).not.toContain('data-mgco-change');   // the picker
    expect(html).not.toContain('data-mgco-record');   // the record-a-champion CTA
    expect(html).not.toContain('data-mgco-end"');     // the played close-out CTA is not here either
  });

  it('escapes a tournament name that carries markup (it is never rendered raw here)', () => {
    const { bridge } = loadApp();
    const html = bridge.closeout({ id: JULY, name: '<img src=x onerror=alert(1)>', status: 'setup' }, TEAMS, []);
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('onerror=');
  });
});

// The empty middle: the REAL close-out (champion picker + close_tournament) still owns pools/bracket. This
// change is the setup branch only, and these tests fail if it ever bleeds into a live tournament.
describe('the pools / bracket close-out path is untouched', () => {
  ['pools', 'bracket'].forEach((status) => {
    it(`still renders the champion card and the End CTA at ${status}, and never the setup action`, () => {
      const { bridge } = loadApp();
      const html = bridge.closeout({ id: JULY, name: 'August 2026 tournament', status }, TEAMS, []);
      expect(html).toContain('data-mgco-end>');           // the RPC-backed close-out CTA
      expect(html).toContain('End the tournament</button>');
      expect(html).toContain('data-mgco-change');          // the champion picker
      expect(html).toContain('mgco-card');
      expect(html).not.toContain('data-mgco-endunplayed'); // the direct write must not reach a live tournament
      expect(html).not.toContain('End this tournament without playing it');
    });
  });
});

// The completed branch is NOT restructured by this feature, but one sentence in it was made false: an event
// ended without playing lands there with no champion and no games, and the note claimed the tournament had
// "finished". The fix is that one sentence, stated so it is true in both worlds.
//
// It is deliberately NOT branched on "this tournament has no matches". A completed event whose matches have
// not LOADED yet is indistinguishable from one that never played, so branching would print a confident false
// claim during the load window — the exact failure class this whole task is about. One true sentence wins.
describe('the completed screen — the sentence this feature made false', () => {
  const DONE_T = () => ({ id: JULY, name: 'August 2026 tournament', status: 'completed', champion_team_id: null });
  const PLAYED = [
    { id: 'm1', phase: 'main', side: 'grand_final', round: 1, team_a_id: 'a', team_b_id: 'b', status: 'final', winner_team_id: 'a' },
  ];

  it('no longer claims the tournament FINISHED, because it might never have been played', () => {
    const { bridge } = loadApp();
    const html = bridge.closeout(DONE_T(), TEAMS, []);
    expect(html).not.toContain('The tournament finished without a champion');
    expect(html).toContain('No champion is written down for this tournament. This records one and closes it back up.');
  });

  it('says the same true thing for a bracket that DID finish without recording its winner (C80)', () => {
    const { bridge } = loadApp();
    const html = bridge.closeout(DONE_T(), TEAMS, PLAYED);
    expect(html).toContain('No champion is written down for this tournament.');
    expect(html).not.toContain('The tournament finished without a champion');
  });

  // Everything else about the completed branch is left alone: C80's derived champion + one-tap record, the
  // picker, the reopen row, and a stored champion rendering plainly.
  it('leaves the C80 record-the-champion offer exactly as it was', () => {
    const { bridge } = loadApp();
    const html = bridge.closeout(DONE_T(), TEAMS, PLAYED);
    expect(html).toContain('WON THE BRACKET, NOT RECORDED');
    expect(html).toContain('data-mgco-record');
    expect(html).toContain('data-mgco-change');
    expect(html).toContain('Record Champs as champion');
  });

  it('leaves the no-answer case exactly as it was', () => {
    const { bridge } = loadApp();
    const html = bridge.closeout(DONE_T(), TEAMS, []);
    expect(html).toContain('NO CHAMPION RECORDED');
    expect(html).toContain('Pick the winning team');
    expect(html).toContain('data-mgco-record');
  });

  it('leaves a recorded champion exactly as it was', () => {
    const { bridge } = loadApp();
    const html = bridge.closeout({ ...DONE_T(), champion_team_id: 'a' }, TEAMS, []);
    expect(html).toContain('Champs');
    expect(html).not.toContain('data-mgco-record');
    expect(html).toContain('Reopen to fix a score or re-crown');
  });

  it('never offers the setup action once the tournament is completed', () => {
    const { bridge } = loadApp();
    expect(bridge.closeout(DONE_T(), TEAMS, [])).not.toContain('data-mgco-endunplayed');
    expect(bridge.closeout(DONE_T(), TEAMS, PLAYED)).not.toContain('data-mgco-endunplayed');
  });
});

describe('the End without playing button', () => {
  it('confirms in one plain sentence that names the event and counts the real teams', async () => {
    const { bridge } = loadApp();
    await bridge.run(SETUP_T(), TEAMS, false);
    const c = bridge.notices().find((n) => n.kind === 'confirm');
    expect(c.o.title).toBe('End without playing');
    expect(c.o.message).toContain('This ends August 2026 tournament without any games being played.');
    expect(c.o.message).toContain('Its 2 registered teams and their payments are kept.');
    expect(c.o.message).toContain('It moves to Past tournaments and registration closes.');
    expect(c.o.message).toContain('You can reopen it.');
    expect(c.o.confirmText).toBe('End the tournament');
    expect(c.o.danger).toBe(true);            // danger-STYLED, but still one tap
    expect(c.o.message).not.toContain('—');
    expect(c.o.message).not.toMatch(/[Tt]ype the/);
  });

  it('counts singular, and drops the count when no team registered', async () => {
    const one = loadApp();
    await one.bridge.run(SETUP_T(), [{ id: 'a', name: 'Solo' }], false);
    expect(one.bridge.notices().find((n) => n.kind === 'confirm').o.message)
      .toContain('Its 1 registered team and their payments are kept.');

    const none = loadApp();
    await none.bridge.run(SETUP_T(), [], false);
    const msg = none.bridge.notices().find((n) => n.kind === 'confirm').o.message;
    expect(msg).toContain('Nothing is deleted.');
    expect(msg).not.toMatch(/\b0 registered teams\b/);
  });

  it('writes NOTHING when the confirm is cancelled', async () => {
    const { bridge, calls } = loadApp();
    const after = await bridge.run(SETUP_T(), TEAMS, false);
    expect(mutations(calls)).toEqual([]);
    expect(after.status).toBe('setup');
  });

  it('writes NOTHING when the caller is not an admin', async () => {
    const { bridge, calls } = loadApp();
    await bridge.run(SETUP_T(), TEAMS, true, { isAdmin: false });
    expect(mutations(calls)).toEqual([]);
    expect(bridge.notices()).toEqual([]);   // it does not even ask
  });

  it('ends it on a yes, and only claims so after the read-back proved it', async () => {
    const { bridge, calls } = loadApp();
    await bridge.run(SETUP_T(), TEAMS, true);
    expect(mutations(calls).map((c) => c.table + ':' + c.op)).toEqual(['tournaments:update']);
    const said = bridge.notices().filter((n) => n.kind === 'notice').map((n) => n.o.title + ' ' + n.o.message).join(' | ');
    expect(said).toContain('Tournament ended');
    expect(said).toContain('is in Past tournaments');
    expect(said).toContain('Its teams and their payments are still there.');
  });

  it('says it FAILED instead of saying it worked when the write could not be proven', async () => {
    const { bridge } = loadApp({ statusAfter: 'setup' });
    await bridge.run(SETUP_T(), TEAMS, true);
    const said = bridge.notices().filter((n) => n.kind === 'notice').map((n) => n.o.title + ' ' + n.o.message).join(' | ');
    expect(said).toContain('Could not end the tournament');
    expect(said).toMatch(/signed in as an admin/);
    expect(said).not.toMatch(/Tournament ended|is in Past tournaments/);
  });

  it('changes no client state on a failed write — the screen keeps offering the action', async () => {
    const { bridge, calls } = loadApp({ statusAfter: 'setup' });
    const after = await bridge.run(SETUP_T(), TEAMS, true);
    expect(after.activeTournamentId).toBe(JULY);
    expect(after.status).toBe('setup');       // still in setup, and the app still says so
    expect(after.teams).toBe(2);              // nothing was dropped client-side
    expect(after.mgtView).toBe('closeout');
    // It stopped at the read-back: no refresh round trip was made on the failure path.
    expect(calls.filter((c) => c.op === 'select' && c.table === 'tournaments').length).toBe(1);
  });
});
