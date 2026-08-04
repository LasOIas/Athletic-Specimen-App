// The Manage hub's switcher card (round 2026-08-04, design handoff "Tournament switcher on Manage").
//
// WHY THIS FILE EXISTS: the Manage tab used to be implicitly bound to whatever the single "current"
// tournament was, and never said so. With two events in play that is a trap — every row on the hub edits
// SOMETHING, and nothing on the screen named which. Mike hit it and ended up renaming an old tournament
// rather than managing two. The hub now opens by naming the tournament it is pointed at, with a caption
// that states the rule out loud: "Every row below edits this one."
//
// The four things pinned here, in order of what would hurt most if it regressed:
//   1. THE CARD NAMES THE MANAGED TOURNAMENT, and the caption's promise is kept — Needs you and the
//      Tournament row report on the SAME tournament the card names. A card naming one tournament over
//      another one's rows is worse than no card, because it is confidently wrong.
//   2. EVERY META CLAUSE IS BACKED. The design's line reads "Sat Aug 22 · registration open · 6 of 12
//      teams". The date needs migration 0057's event_date column and the cap needs its team_cap column,
//      and 0057 is NOT applied. Each clause is DROPPED when its value is absent — no placeholder, no em
//      dash, no invented number (Mike's standing ruling from the 2026-08-03 round).
//   3. THE TOURNAMENT ROW STOPPED REPEATING THE NAME. The card owns it now; the row says what it leads
//      into and where that work stands.
//   4. THE BUTTON RESET GOTCHA. Production ships `button { justify-content:center }`, which centres a
//      single-column grid track. The card is a button, so styles.css must undo it on BOTH axes or the
//      whole card reads centre-aligned on his phone.
//
// WHAT THIS DOES NOT PROVE (§17): that it LOOKS right on his phone. The CSS assertion below checks that the
// gotcha's declarations SHIP, not that the rendered card is left-aligned in a browser.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const APP_SRC = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const CSS_SRC = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');

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
  const documentStub = {
    readyState: 'loading',
    getElementById: () => null,
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
    ;globalThis.__bridge = {
      seed: (list, opts) => {
        opts = opts || {};
        state.isAdmin = true;
        state.tournaments = list || [];
        state.activeTournamentId = ('active' in opts) ? opts.active : ((list && list[0]) ? list[0].id : null);
        state.tournamentTeams = opts.teams || [];
        state.tournamentPools = ('pools' in opts) ? opts.pools : [];
        state.tournamentMatches = opts.matches || [];
        state.players = opts.players || [];
        state.checkedIn = opts.checkedIn || [];
        state.pickupDays = opts.pickupDays || [];
        state.pickupDaysLoaded = true;
        state.currentSession = null;
        manageView = 'lead'; mgtView = null;
        mgTournamentPinned = !!opts.pinned;
      },
      hub: () => buildManagePageHTML(),
      meta: (t) => mgSwitcherMetaText(t),
      dateLabel: (v) => mgEventDateLabel(v),
      phase: (t) => mgTournamentPhase(t),
      teamsClause: (t) => mgTeamsClause(t),
      hasDate: () => tournamentHasEventDate(),
      hasCap: () => tournamentHasTeamCap(),
      needs: () => manageNeedsYou().map((n) => n.sub),
    };`;
  const context = vm.createContext(sandbox);
  vm.runInContext(pureSrc, context, { filename: 'pure.js' });
  vm.runInContext(APP_SRC + epilogue, context, { filename: 'app.js' });
  return { bridge: sandbox.__bridge };
}

// The EVERYTHING section's Tournament row, so a name found there is genuinely in the row and not on the
// card. Selected by its title, because a needs-you row can carry data-mg-area="tournament" too.
function tournamentRow(html) {
  const name = html.indexOf('class="mg-rn">Tournament<');
  if (name < 0) return '';
  const start = html.lastIndexOf('<a', name);
  return html.slice(start, html.indexOf('</a>', name) + 4);
}
// Just the switcher card + its caption.
function card(html) {
  const start = html.indexOf('class="mgv-tsw"');
  if (start < 0) return '';
  const end = html.indexOf('</p>', html.indexOf('mgv-tswf', start));
  return html.slice(html.lastIndexOf('<button', start), end + 4);
}

const AUG = { id: 'a-3', name: 'August 2026 Tournament', status: 'setup', registration_open: true };
// The same row as it reads AFTER migration 0057 lands: select('*') hands back the new columns.
const AUG_0057 = { ...AUG, event_date: '2026-08-22', team_cap: 12 };

describe('the switcher card', () => {
  it('is the first thing under the heading, above Needs you, on the design’s grammar', () => {
    const { bridge } = loadApp();
    bridge.seed([AUG], { teams: [{ id: 't1' }] });
    const html = bridge.hub();
    expect(html.indexOf('mg-h1')).toBeLessThan(html.indexOf('mgv-tsw'));
    expect(html.indexOf('mgv-tsw')).toBeLessThan(html.indexOf('>Everything<'));
    expect(html).toContain('class="mgv-tsw" data-mg-area="tournaments"');
    expect(html).toContain('class="mgv-tswlab">Managing<');
    expect(html).toContain('class="mgv-tswact">Switch');
    expect(html).toContain('class="mgv-tswn"');
    expect(html).toContain('class="mgv-tswm"');
  });

  it('sits above Needs you when there is something pending', () => {
    const { bridge } = loadApp();
    bridge.seed([AUG], { teams: [{ id: 't1', name: 'Block Party', paid: false }] });
    const html = bridge.hub();
    expect(html).toContain('>Needs you<');
    expect(html.indexOf('mgv-tsw')).toBeLessThan(html.indexOf('>Needs you<'));
  });

  it('names the tournament Manage is pointed at, escaped', () => {
    const { bridge } = loadApp();
    bridge.seed([AUG]);
    expect(bridge.hub()).toContain('class="mgv-tswn">August 2026 Tournament<');

    const evil = loadApp();
    evil.bridge.seed([{ id: 'x', name: '<img src=x> & "Mike\'s"', status: 'setup' }]);
    const html = evil.bridge.hub();
    expect(html).not.toContain('<img src=x>');
    expect(html).toContain('&lt;img src=x&gt;');
  });

  it('carries the caption that states the rule', () => {
    const { bridge } = loadApp();
    bridge.seed([AUG]);
    expect(bridge.hub()).toContain('<p class="mgv-tswf">Every row below edits this one.</p>');
  });

  it('names the PICKED tournament, not the one the lead resolver would infer', () => {
    const { bridge } = loadApp();
    const live = { id: 'live', name: 'July 2026 Tournament', status: 'pools' };
    // The resolver would pick the live tournament; the organizer explicitly picked the setup one.
    bridge.seed([live, AUG], { active: AUG.id, pinned: true });
    expect(bridge.hub()).toContain('class="mgv-tswn">August 2026 Tournament<');
  });

  it('keeps the caption’s promise: Needs you reports on the tournament the card names', () => {
    const { bridge } = loadApp();
    const live = { id: 'live', name: 'July 2026 Tournament', status: 'pools' };
    bridge.seed([live, AUG], {
      active: AUG.id, pinned: true,
      teams: [{ id: 't1', name: 'Block Party', paid: false }],
    });
    const html = bridge.hub();
    expect(html).toContain('class="mgv-tswn">August 2026 Tournament<');
    // The needs-you model runs against the SAME tournament, so its team facts belong to the named one.
    expect(html).not.toContain('July 2026 Tournament');
  });

  it('is omitted entirely when there is no tournament to name', () => {
    const { bridge } = loadApp();
    bridge.seed([]);
    const html = bridge.hub();
    expect(html).not.toContain('mgv-tsw');
    expect(html).not.toContain('Every row below edits this one.');
    expect(html).toContain('No tournament yet');   // the Tournament row still says so honestly
  });
});

describe('the meta line prints only what is backed', () => {
  it('reads date · phase · teams once every column is there', () => {
    const { bridge } = loadApp();
    bridge.seed([AUG_0057], { teams: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }, { id: 6 }] });
    expect(bridge.hub()).toContain('class="mgv-tswm">Sat Aug 22 · registration open · 6 of 12 teams<');
  });

  it('DROPS the date clause while migration 0057 is unapplied, without a placeholder', () => {
    const { bridge } = loadApp();
    bridge.seed([AUG], { teams: [{ id: 1 }, { id: 2 }] });
    expect(bridge.hasDate()).toBe(false);
    const c = card(bridge.hub());
    expect(c).toContain('registration open · 2 teams');
    expect(c).not.toMatch(/Mon|Tue|Wed|Thu|Fri|Sat|Sun/);
    expect(c).not.toContain('—');
    expect(c).not.toContain('Invalid Date');
    expect(c).not.toContain('No date');
  });

  it('DROPS the cap while team_cap is unapplied, rather than inventing one', () => {
    const { bridge } = loadApp();
    bridge.seed([AUG], { teams: [{ id: 1 }, { id: 2 }] });
    expect(bridge.hasCap()).toBe(false);
    const c = card(bridge.hub());
    expect(c).toContain('2 teams');
    expect(c).not.toMatch(/of \d+ teams/);
  });

  it('drops the date again when the column exists but the value is null or junk', () => {
    const nulled = loadApp();
    nulled.bridge.seed([{ ...AUG, event_date: null, team_cap: null }], { teams: [{ id: 1 }] });
    expect(nulled.bridge.hasDate()).toBe(true);          // the COLUMN is there
    const c = card(nulled.bridge.hub());
    expect(c).toContain('registration open · 1 team');   // the VALUE is not
    expect(c).not.toMatch(/Mon|Tue|Wed|Thu|Fri|Sat|Sun/);

    const junk = loadApp();
    junk.bridge.seed([{ ...AUG, event_date: 'soon' }], { teams: [{ id: 1 }] });
    expect(card(junk.bridge.hub())).not.toContain('Invalid Date');
  });

  it('drops the team clause when the loaded teams belong to a different tournament', () => {
    const { bridge } = loadApp();
    const other = { id: 'other', name: 'Other', status: 'setup', registration_open: true };
    // state.tournamentTeams belongs to activeTournamentId; the card is naming a row it is not loaded for.
    bridge.seed([AUG, other], { active: null, teams: [{ id: 1 }, { id: 2 }] });
    const c = card(bridge.hub());
    expect(c).not.toContain('team');
  });

  it('parses a date-only column as LOCAL midnight, so a Saturday event never prints as Friday', () => {
    const { bridge } = loadApp();
    // new Date('2026-08-22') is UTC midnight, which is Aug 21 anywhere west of Greenwich.
    expect(bridge.dateLabel('2026-08-22')).toBe('Sat Aug 22');
    expect(bridge.dateLabel('2026-01-01')).toBe('Thu Jan 1');
    ['', null, undefined, 'not a date', '2026-13-45x'].forEach((v) => expect(bridge.dateLabel(v)).toBe(''));
  });

  it('says the phase in words the columns can back, and nothing else', () => {
    const { bridge } = loadApp();
    bridge.seed([AUG]);
    expect(bridge.phase({ status: 'setup', registration_open: true })).toBe('registration');
    expect(bridge.phase({ status: 'setup', registration_open: false })).toBe('setup');
    expect(bridge.phase({ status: 'pools' })).toBe('pools');
    expect(bridge.phase({ status: 'bracket' })).toBe('bracket');
    expect(bridge.phase({ status: 'completed' })).toBe('finished');
    // No column separates a draft from a scheduled event, so neither word is ever produced.
    expect(bridge.phase({ status: 'whatever' })).toBe('');
    expect(bridge.phase(null)).toBe('');
  });

  it('carries no em dash and no emoji', () => {
    const { bridge } = loadApp();
    bridge.seed([AUG_0057], { teams: [{ id: 1 }] });
    const c = card(bridge.hub());
    expect(c).not.toContain('—');
    expect(c).not.toContain('&mdash;');
    expect(c).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });
});

describe('the Tournament row stopped repeating the name', () => {
  it('says what it leads into, plus where that work stands', () => {
    const { bridge } = loadApp();
    bridge.seed([AUG], { teams: [{ id: 't1', paid: true }], pools: [] });
    const row = tournamentRow(bridge.hub());
    expect(row).toContain('Registration, teams, pools, bracket · pools not drawn');
    // The card states the name once. Repeating it here is what the design removed.
    expect(row).not.toContain('August 2026 Tournament');
    expect(row).not.toContain('Registration open');
  });

  it('reports the real stage for every status', () => {
    const drawn = loadApp();
    drawn.bridge.seed([AUG], { pools: [{ id: 'p1' }] });
    expect(tournamentRow(drawn.bridge.hub())).toContain('pools drawn');

    const running = loadApp();
    running.bridge.seed([{ ...AUG, status: 'pools' }]);
    expect(tournamentRow(running.bridge.hub())).toContain('pool play running');

    const bracket = loadApp();
    bracket.bridge.seed([{ ...AUG, status: 'bracket' }]);
    expect(tournamentRow(bracket.bridge.hub())).toContain('bracket running');

    const done = loadApp();
    done.bridge.seed([{ ...AUG, status: 'completed' }]);
    expect(tournamentRow(done.bridge.hub())).toContain('finished');
  });

  it('drops the stage clause rather than reporting another tournament’s draw', () => {
    const { bridge } = loadApp();
    const other = { id: 'other', name: 'Other', status: 'setup', registration_open: true };
    bridge.seed([AUG, other], { active: null, pools: [{ id: 'p1' }] });
    const row = tournamentRow(bridge.hub());
    expect(row).toContain('Registration, teams, pools, bracket');
    expect(row).not.toContain('pools drawn');
    expect(row).not.toContain('pools not drawn');
  });

  it('still says so plainly when there is no tournament at all', () => {
    const { bridge } = loadApp();
    bridge.seed([]);
    expect(tournamentRow(bridge.hub())).toContain('No tournament yet');
  });
});

// The design calls this out as the one thing that will silently look wrong if it is missed.
describe('the shipped CSS', () => {
  it('undoes production’s button { justify-content:center } on BOTH axes for the card', () => {
    const block = CSS_SRC.slice(CSS_SRC.indexOf('.mgv-tsw {'), CSS_SRC.indexOf('.mgv-tswtop'));
    expect(block).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(block).toContain('justify-content: stretch');
    expect(block).toContain('justify-items: stretch');
    expect(block).toContain('text-align: left');
  });

  it('does the same for the New tournament row, which is a button too', () => {
    const block = CSS_SRC.slice(CSS_SRC.indexOf('.mgv-tnew {'), CSS_SRC.indexOf('.mgv-tnewic'));
    expect(block).toContain('justify-content: flex-start');
  });

  it('ships the round’s classes exactly once each, so nothing was pasted twice', () => {
    // Anchored to a line start so a selector reading `.mgv-trow.is-active .mgv-tdot` is not counted as a
    // second `.mgv-tdot` rule, and so a mention inside a comment is not counted at all.
    ['.mgv-tsw', '.mgv-tswn', '.mgv-tcap', '.mgv-tnew', '.mgv-tdot', '.mgv-tnote'].forEach((sel) => {
      const hits = CSS_SRC.split('\n').filter((l) => l.trim().startsWith(sel + ' {'));
      expect(hits.length, sel + ' is duplicated or missing').toBe(1);
    });
  });

  it('does NOT re-declare the rules that shipped with the previous round', () => {
    // .mg-row:has(.mgv-rmeta) and .mgv-rmeta came with the 2026-08-03 sub-hub block; the chooser reuses
    // them. A second copy would be two places to change one layout rule. (Comments may name them; only a
    // line that OPENS a rule counts.)
    const opens = (sel) => CSS_SRC.split('\n').filter((l) => l.trim().startsWith(sel + ' {')).length;
    expect(opens('.mg-row:has(.mgv-rmeta)')).toBe(1);
    expect(opens('.mgv-rmeta')).toBe(1);
  });

  it('draws the selected dot with the accent and the unselected one with the neutral ring', () => {
    const dot = CSS_SRC.slice(CSS_SRC.indexOf('\n.mgv-tdot {'), CSS_SRC.indexOf('\n.mgv-tnote {'));
    expect(dot).toContain('oklch(0.84 0.006 75)');        // the round's one new value
    expect(dot).toContain('background: var(--accent)');
    expect(dot).toContain('box-shadow: inset 0 0 0 4px #fff');
  });
});
