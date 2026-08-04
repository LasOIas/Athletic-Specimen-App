// Drag to move players between pickup teams (design round 2026-08-03 README §6, Mike's pick: direction B).
//
// WHY THIS FILE EXISTS: the gesture has three visual states and one mutation, and the mutation is the same
// rule the shipped tap-to-swap sheet uses. The failure this locks against is the two routes DISAGREEING —
// the mid-drag hint promising "you'll swap with Morgan Ellis" and the drop trading someone else. app.js
// computes the preview by running the real move and diffing it, so these tests pin that the preview, the
// commit and the Undo are one computation rather than three implementations of one rule.
//
// It also pins the two judgement calls: the drift warning only fires as a CONSEQUENCE of a move (never on a
// freshly generated board), and it only ever WARNS — no drag is blocked (README open question 3 is still
// open with Mike; MGT_DRIFT_WARN_AT carries that in a comment).
//
// Harness: the vm-sandbox pattern from tournament-reset.test.js (app.js is a browser classic script). No
// Supabase is needed — the drag persists to localStorage via saveLocal, so the stub records setItem calls.
//
// WHAT THIS DOES NOT PROVE (§17): that a real finger on a real phone lands on the right row. The pointer
// plumbing (setPointerCapture, elementFromPoint hit-testing, touch-action) is DOM-only and is verified by
// hand on a device. Everything a browser is not required to decide is tested here.
//
// ⚠ AND ONE THING THIS FILE STRUCTURALLY CANNOT CATCH — read before trusting a green run here.
// These tests invoke the mutation directly (`undo: () => mgtUndoLastMove()`); they never travel the CLICK
// DELEGATE. On 2026-08-03 all 37 of them passed while Undo was DEAD in a real browser: the delegate checked
// `mgtDragSuppressClick` (armed by the drop that had just happened) and returned BEFORE reaching the
// `[data-mgv-undo]` branch, so the first tap on Undo — the only tap anyone makes — did nothing. Caught by
// driving real PointerEvents in Chrome, not here. Fixed at the delegate (app.js, manageView === 'teams'
// branch) by letting a deliberate Undo tap through the suppressor.
// A unit test asserting that ordering could only restate the implementation, so the evidence deliberately
// lives in the browser pass + that code comment. If you touch the suppressor, re-drive it in a browser:
// drop a player, then TAP Undo as the very next action, and confirm the rosters revert.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function loadApp() {
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
      const chain = new Proxy({}, {
        get: (_t, prop) => (prop === 'then'
          ? (resolve) => Promise.resolve({ data: [], error: null, count: 0 }).then(resolve)
          : () => chain),
      });
      return chain;
    },
  };
  const stored = {};
  const writes = [];
  const localStorageStub = {
    getItem: (k) => (k in stored ? stored[k] : null),
    setItem: (k, v) => { stored[k] = String(v); writes.push(k); },
    removeItem: (k) => { delete stored[k]; }, clear: noop, key: () => null, length: 0,
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
  const sandbox = {
    window: windowStub, document: documentStub, localStorage: localStorageStub,
    navigator: windowStub.navigator, location: windowStub.location,
    requestAnimationFrame: noop, cancelAnimationFrame: noop,
    setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop,
    console, SUPABASE_URL: 'http://localhost', SUPABASE_KEY: 'anon',
  };
  sandbox.globalThis = sandbox; sandbox.self = sandbox;
  sandbox.__lsWrites = writes; // the localStorage keys app.js wrote, readable from inside the vm context
  const epilogue = `
    ;globalThis.__bridge = {
      // The roster also goes into state.players AND state.checkedIn: serializeGeneratedTeamsForStorage only
      // persists a board whose members are known players and whose membership matches the checked-in set
      // exactly. Seeding both is what makes the saveLocal assertions real instead of passing silently over
      // a write that never happened.
      setTeams: (teams) => {
        state.generatedTeams = teams;
        state.players = teams.flat().map((p) => ({ ...p }));
        state.checkedIn = teams.flat().map((p) => playerIdentityKey(p));
        mgtLastMove = null;
      },
      teams: () => state.generatedTeams,
      names: (i) => state.generatedTeams[i].map((p) => p.name),
      totals: () => state.generatedTeams.map((t) => teamSkillTotal(t)),
      model: (from, playerIndex, to) => mgtDragModel(state.generatedTeams, from, playerIndex, to),
      // Stands in for pointerdown: everything the DOM layer would have resolved off the grip's row.
      grab: (from, playerIndex) => {
        const p = state.generatedTeams[from][playerIndex];
        mgtDrag = { key: playerIdentityKey(p), from, playerIndex, name: p.name,
                    skillText: mgpSkillText(p.skill), unrated: !(Number(p.skill) > 0),
                    pointerId: 1, startX: 0, startY: 0, active: true, over: null, lift: null, slot: null };
      },
      dragging: () => !!mgtDrag,
      drop: (to) => mgtDragCommit(to),
      // The hovered team, the way mgtDragHover decides it: your own team is never a drop target.
      hover: (to) => { if (mgtDrag) mgtDrag.over = (to === mgtDrag.from ? null : to); },
      // The REAL pointerup path (teardown, commit ordering, click suppression), not just the commit.
      release: (cancelled) => { mgtDragPointerUp({ pointerId: 1 }, !!cancelled); },
      suppressed: () => mgtDragSuppressClick,
      cancel: () => { mgtDrag = null; },
      undo: () => mgtUndoLastMove(),
      lastMove: () => mgtLastMove,
      render: () => { manageView = 'teams'; return buildManageTeamsHTML(); },
      deltaHTML: (d) => mgtDeltaHTML(d),
      rowHint: (m) => mgtRowHintHTML(m),
      lift: (n, s, u) => mgtLiftHTML(n, s, u),
      driftAt: () => MGT_DRIFT_WARN_AT,
      slop: () => MGT_DRAG_SLOP,
      writes: () => globalThis.__lsWrites.slice(),
    };`;
  const context = vm.createContext(sandbox);
  vm.runInContext(pureSrc, context, { filename: 'pure.js' });
  vm.runInContext(appSrc + epilogue, context, { filename: 'app.js' });
  return sandbox.__bridge;
}

// The prototype's three rosters (mg-teams-move-b*.html), names and skills verbatim. NOTE: the prototype's
// printed team totals (21.0 / 14.5 / 25.5) do not add up from its own rosters — it is mock data. These tests
// therefore assert against totals COMPUTED from the rosters, never against the mock's headline numbers.
const board = () => ([
  [{ id: 'p1', name: 'Sam Okafor', skill: 8 }, { id: 'p2', name: 'Casey Lin', skill: 6 },
   { id: 'p3', name: 'Skyler Hayes', skill: 4.5 }, { id: 'p4', name: 'Devon Park', skill: 2.5 }],
  [{ id: 'p5', name: 'Jordan Reyes', skill: 7.5 }, { id: 'p6', name: 'Riley Chen', skill: 6.5 },
   { id: 'p7', name: 'Taylor Nguyen', skill: 4 }, { id: 'p8', name: 'Quinn Alvarez', skill: 3 }],
  [{ id: 'p9', name: 'Avery Brooks', skill: 7 }, { id: 'p10', name: 'Jamie Cruz', skill: 6.5 },
   { id: 'p11', name: 'Rowan Diaz', skill: 5.5 }, { id: 'p12', name: 'Morgan Ellis', skill: 0 }],
]);

describe('resting state — the grip is the affordance', () => {
  it('every name carries the grip INSIDE .mgt-nm, which is what fires the CSS guard', () => {
    const b = loadApp();
    b.setTeams(board());
    const html = b.render();
    // 12 players, 12 grips.
    expect(html.split('class="mgv-hnd"').length - 1).toBe(12);
    // The guard is `.mgt-nm:has(.mgv-hnd)`: production .mgt-nm is space-between with exactly two children,
    // so a grip rendered as a SIBLING of .mgt-nm (not inside it) would leave every name centred.
    const firstRow = html.slice(html.indexOf('<div class="mgt-nm"'));
    expect(firstRow.indexOf('class="mgv-hnd"')).toBeLessThan(firstRow.indexOf('class="mgt-nmn"'));
    expect(html).not.toContain('</div><svg class="mgv-hnd"');
  });

  it('the grip opts out of browser panning, or a phone scrolls instead of dragging', () => {
    const b = loadApp();
    b.setTeams(board());
    expect(b.render()).toContain('touch-action:none');
  });

  it('each team row carries its own index, so a drop never depends on sibling position', () => {
    const b = loadApp();
    b.setTeams(board());
    const html = b.render();
    ['0', '1', '2'].forEach((i) => expect(html).toContain(`data-mgt-team="${i}"`));
  });

  it('says how to use it, and keeps the shipped tap route alive alongside the drag', () => {
    const b = loadApp();
    b.setTeams(board());
    const html = b.render();
    expect(html).toContain('Drag a name by its handle onto another team.');
    expect(html).toContain('Tap a name to swap players between teams');
    // The tap hook is untouched — the two routes share one mutation, so losing it would be a regression.
    expect(html).toContain('data-mgt-swap=');
  });

  it('a resting board has no Undo strip and no warning — nothing has happened yet', () => {
    const b = loadApp();
    b.setTeams(board());
    const html = b.render();
    expect(html).not.toContain('mgv-undo');
    expect(html).not.toContain('mgv-warn');
  });
});

describe('mid-drag — the preview IS the move', () => {
  it('names the player you would trade with, by closest skill', () => {
    const b = loadApp();
    b.setTeams(board());
    // Riley Chen (6.5) from Team 2 over Team 3 → closest there is Jamie Cruz (6.5).
    const m = b.model(1, 1, 2);
    expect(m.mode).toBe('swap');
    expect(m.partnerName).toBe('Jamie Cruz');
  });

  it('the hint the row shows is built from that same model, not a second lookup', () => {
    const b = loadApp();
    b.setTeams(board());
    const hint = b.rowHint(b.model(1, 1, 2));
    expect(hint).toContain('mgv-rowhint');
    expect(hint).toContain('Drop to swap with');
    expect(hint).toContain('<b>Jamie Cruz &middot; 6.5</b>');
  });

  it('an unrated partner reads as unrated, never as 0.0', () => {
    const b = loadApp();
    b.setTeams(board());
    // Devon Park (2.5) onto Team 3: closest is Morgan Ellis (unrated → counts as 0).
    const m = b.model(0, 3, 2);
    expect(m.partnerName).toBe('Morgan Ellis');
    expect(m.partnerSkill).toBe('unrated');
    expect(b.rowHint(m)).toContain('Morgan Ellis &middot; unrated');
  });

  it('previews the delta on BOTH team headers, and they cancel out', () => {
    const b = loadApp();
    b.setTeams(board());
    const m = b.model(1, 1, 2); // Riley 6.5 <-> Jamie 6.5: a dead-even trade
    expect(m.deltas[1] + m.deltas[2]).toBe(0);
    const m2 = b.model(0, 0, 2); // Sam 8.0 <-> Avery 7.0
    expect(m2.deltas[0]).toBe(-1);
    expect(m2.deltas[2]).toBe(1);
    expect(m2.deltas[1]).toBe(0); // the team nobody touched never previews a change
  });

  it('the delta chip signs itself and says nothing when nothing changes', () => {
    const b = loadApp();
    expect(b.deltaHTML(6.5)).toContain('+6.5');
    expect(b.deltaHTML(-6.5)).toContain('&minus;6.5');
    expect(b.deltaHTML(0)).toBe('');       // "0" would be a number to interpret, not information
    expect(b.deltaHTML(NaN)).toBe('');
  });

  it('a SHORT target takes a move, and the hint says so instead of naming a partner', () => {
    const b = loadApp();
    const t = board();
    t[2] = t[2].slice(0, 2); // Team 3 is a body short
    b.setTeams(t);
    const m = b.model(0, 0, 2);
    expect(m.mode).toBe('move');
    expect(m.partnerName).toBe('');
    expect(b.rowHint(m)).toContain('Drop to add them to this team');
  });

  it('hovering the team it came from previews nothing at all', () => {
    const b = loadApp();
    b.setTeams(board());
    expect(b.model(1, 1, 1)).toBeNull();
  });

  it('a bad target previews nothing rather than throwing under the finger', () => {
    const b = loadApp();
    b.setTeams(board());
    expect(b.model(1, 1, 9)).toBeNull();
    expect(b.model(1, 99, 2)).toBeNull();
    expect(b.model(-1, 0, 2)).toBeNull();
  });

  it('the lifted card carries the same three children as the row it left', () => {
    const b = loadApp();
    const html = b.lift('Riley Chen', '6.5', false);
    expect(html).toContain('class="mgv-hnd"');
    expect(html).toContain('<span class="mgt-nmn">Riley Chen</span>');
    expect(html).toContain('<span class="mgt-nsk">6.5</span>');
    expect(b.lift('Morgan Ellis', '–', true)).toContain('class="mgt-nsk n"');
  });

  it('previewing changes nothing — a hover is not a move', () => {
    const b = loadApp();
    b.setTeams(board());
    const before = JSON.stringify(b.teams());
    b.model(1, 1, 2);
    b.model(0, 0, 2);
    expect(JSON.stringify(b.teams())).toBe(before);
  });
});

describe('the drop — one mutation, one write path', () => {
  it('lands exactly what the preview promised', () => {
    const b = loadApp();
    b.setTeams(board());
    const before = b.totals().map(Number);
    const promised = b.model(1, 1, 2);            // Riley Chen <-> Jamie Cruz
    b.grab(1, 1);
    expect(b.drop(2)).toBe(true);
    expect(b.names(1)).toContain('Jamie Cruz');
    expect(b.names(1)).not.toContain('Riley Chen');
    expect(b.names(2)).toContain('Riley Chen');
    expect(b.names(2)).not.toContain('Jamie Cruz');
    // ...and every team's total moved by exactly the delta its header previewed.
    b.totals().map(Number).forEach((after, i) => {
      expect(Number((after - before[i]).toFixed(1))).toBe(promised.deltas[i]);
    });
  });

  it('persists through the shipped teams write path (saveLocal), not a second route', () => {
    const b = loadApp();
    b.setTeams(board());
    b.grab(1, 1);
    b.drop(2);
    expect(b.writes()).toContain('athletic_specimen_generated_team_keys');
  });

  it('carries the SAME player objects across, so identity keys survive the move', () => {
    const b = loadApp();
    const t = board();
    const riley = t[1][1];
    b.setTeams(t);
    b.grab(1, 1);
    b.drop(2);
    expect(b.teams()[2].find((p) => p.name === 'Riley Chen')).toBe(riley);
  });

  it('a drop on its own team commits nothing and arms no Undo', () => {
    const b = loadApp();
    b.setTeams(board());
    const before = JSON.stringify(b.teams());
    b.grab(1, 1);
    expect(b.drop(1)).toBe(false);
    expect(JSON.stringify(b.teams())).toBe(before);
    expect(b.lastMove()).toBeNull();
  });

  it('a drop with no drag in flight is a no-op', () => {
    const b = loadApp();
    b.setTeams(board());
    expect(b.drop(2)).toBe(false);
  });

  // REGRESSION: the release used to tear the gesture down before committing, and mgtDragCommit reads the
  // in-flight mgtDrag — so every real drop landed nothing while the preview had promised a swap. Testing
  // mgtDragCommit alone could never catch it; this drives the actual pointerup.
  it('releasing over a team really applies the move, and ends the gesture', () => {
    const b = loadApp();
    b.setTeams(board());
    b.grab(1, 1);
    b.hover(2);
    b.release(false);
    expect(b.names(2)).toContain('Riley Chen');
    expect(b.names(1)).toContain('Jamie Cruz');
    expect(b.dragging()).toBe(false);
    expect(b.lastMove()).not.toBeNull();
  });

  it('releasing over its own team, or over nothing, changes nothing', () => {
    const own = loadApp();
    own.setTeams(board());
    const before = JSON.stringify(own.teams());
    own.grab(1, 1);
    own.hover(1);                 // back over the team it came from
    own.release(false);
    expect(JSON.stringify(own.teams())).toBe(before);
    expect(own.lastMove()).toBeNull();

    const nowhere = loadApp();
    nowhere.setTeams(board());
    nowhere.grab(1, 1);           // released without ever hovering a row
    nowhere.release(false);
    expect(nowhere.lastMove()).toBeNull();
  });

  it('a cancelled gesture (a call, a notification) drops nothing', () => {
    const b = loadApp();
    b.setTeams(board());
    const before = JSON.stringify(b.teams());
    b.grab(1, 1);
    b.hover(2);
    b.release(true);              // pointercancel
    expect(JSON.stringify(b.teams())).toBe(before);
    expect(b.dragging()).toBe(false);
  });

  it('a completed drag swallows the click it trails, so the swap sheet does not also open', () => {
    const b = loadApp();
    b.setTeams(board());
    b.grab(1, 1);
    b.hover(2);
    b.release(false);
    expect(b.suppressed()).toBe(true);
  });
});

describe('the Undo strip', () => {
  it('appears after a drop and names both players', () => {
    const b = loadApp();
    b.setTeams(board());
    b.grab(1, 1);
    b.drop(2);
    const html = b.render();
    expect(html).toContain('class="mgv-undo"');
    expect(html).toContain('data-mgv-undo');
    expect(html).toContain('<b>Riley Chen</b> and <b>Jamie Cruz</b> swapped');
  });

  it('reads as a move, not a swap, when the target was short', () => {
    const b = loadApp();
    const t = board();
    t[2] = t[2].slice(0, 2);
    b.setTeams(t);
    b.grab(0, 0);
    b.drop(2);
    expect(b.render()).toContain('<b>Sam Okafor</b> moved to Team 3');
  });

  it('restores the exact rosters, through the same write path', () => {
    const b = loadApp();
    b.setTeams(board());
    const before = JSON.stringify(b.teams());
    b.grab(1, 1);
    b.drop(2);
    expect(JSON.stringify(b.teams())).not.toBe(before);
    expect(b.undo()).toBe(true);
    expect(JSON.stringify(b.teams())).toBe(before);
    expect(b.writes()).toContain('athletic_specimen_generated_team_keys');
  });

  it('is spent once — a second Undo cannot walk the board backwards', () => {
    const b = loadApp();
    b.setTeams(board());
    b.grab(1, 1);
    b.drop(2);
    expect(b.undo()).toBe(true);
    expect(b.undo()).toBe(false);
    expect(b.render()).not.toContain('mgv-undo');
  });

  it('undoing also clears the warning it caused', () => {
    const b = loadApp();
    const t = board();
    t[1] = [{ id: 'x1', name: 'Low One', skill: 1 }, { id: 'x2', name: 'Low Two', skill: 1 }];
    t[2] = [{ id: 'y1', name: 'High One', skill: 10 }, { id: 'y2', name: 'High Two', skill: 9 }];
    b.setTeams(t);
    b.grab(1, 0);
    b.drop(2);
    expect(b.render()).toContain('mgv-warn');
    b.undo();
    expect(b.render()).not.toContain('mgv-warn');
  });
});

describe('the skill-drift warning', () => {
  it('fires when the drop leaves the board far apart, naming the two teams in TEAM order', () => {
    const b = loadApp();
    // Team 1 sits in the middle on purpose: the warning must name the two EXTREMES (2 and 3), and it must
    // name them low-index-first the way the design's sentence reads, not high-team-first.
    b.setTeams([
      [{ id: 'm1', name: 'Mid One', skill: 5 }, { id: 'm2', name: 'Mid Two', skill: 5 }],        // 10.0
      [{ id: 'x1', name: 'Low One', skill: 1 }, { id: 'x2', name: 'Low Two', skill: 1 }],        //  2.0
      [{ id: 'y1', name: 'High One', skill: 10 }, { id: 'y2', name: 'Even Steven', skill: 1 }],  // 11.0
    ]);
    b.grab(1, 0);
    b.drop(2);              // Low One trades with Even Steven — the totals do not move, the gap stays 9.0
    const html = b.render();
    expect(html).toContain('class="mgv-warn"');
    expect(html).toContain('Team 2 and Team 3 are <b>9.0</b> apart on skill.');
    expect(html).toContain('Drag one more player to even them up.');
  });

  it('stays quiet on a balanced trade, or it would cry wolf on every drag', () => {
    const b = loadApp();
    b.setTeams(board());
    b.grab(1, 1); // Riley 6.5 <-> Jamie 6.5 — a dead-even trade
    b.drop(2);
    expect(b.render()).not.toContain('mgv-warn');
  });

  it('never fires on a board nobody has touched, only as a consequence of a move', () => {
    const b = loadApp();
    b.setTeams([
      [{ id: 'a', name: 'A', skill: 1 }],
      [{ id: 'b', name: 'B', skill: 10 }],
    ]);
    expect(b.render()).not.toContain('mgv-warn'); // 9.0 apart, but nobody dragged anything
  });

  it('WARNS ONLY — the move is already applied when the warning renders', () => {
    const b = loadApp();
    const t = board();
    t[1] = [{ id: 'x1', name: 'Low One', skill: 1 }, { id: 'x2', name: 'Low Two', skill: 1 }];
    t[2] = [{ id: 'y1', name: 'High One', skill: 10 }, { id: 'y2', name: 'High Two', skill: 9 }];
    b.setTeams(t);
    b.grab(1, 0);
    expect(b.drop(2)).toBe(true);          // the drop succeeded despite the drift
    expect(b.names(2)).toContain('Low One'); // and it really moved
    expect(b.render()).toContain('mgv-warn');
  });

  it('the threshold is a single named constant, so Mike can settle it in one place', () => {
    const b = loadApp();
    expect(b.driftAt()).toBe(8);
    // Sanity on the two reference points from the round: the prototype's 11.0 fires, its "apart" 3.5 does not.
    expect(11).toBeGreaterThanOrEqual(b.driftAt());
    expect(3.5).toBeLessThan(b.driftAt());
  });
});

describe('copy law + gesture rails', () => {
  it('nothing the drag renders carries an em dash or an emoji', () => {
    const b = loadApp();
    const t = board();
    t[1] = [{ id: 'x1', name: 'Low One', skill: 1 }, { id: 'x2', name: 'Low Two', skill: 1 }];
    t[2] = [{ id: 'y1', name: 'High One', skill: 10 }, { id: 'y2', name: 'High Two', skill: 9 }];
    b.setTeams(t);
    b.grab(1, 0);
    b.drop(2);
    const html = b.render() + b.rowHint(b.model(0, 0, 1)) + b.lift('X', '1.0', false);
    expect(html).not.toContain('—');
    expect(html).not.toContain('&mdash;');
    expect(html).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });

  it('escapes player names — a roster is user input', () => {
    const b = loadApp();
    b.setTeams([
      [{ id: 'x', name: '<img src=x onerror=alert(1)>', skill: 5 }, { id: 'y', name: 'Plain', skill: 5 }],
      [{ id: 'z', name: '"><script>', skill: 5 }, { id: 'w', name: 'Also Plain', skill: 5 }],
    ]);
    b.grab(0, 0);
    b.drop(1);
    const html = b.render() + b.rowHint(b.model(1, 0, 0));
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;img');
  });

  it('a press has to travel before it becomes a drag, so a grip TAP still works', () => {
    const b = loadApp();
    expect(b.slop()).toBeGreaterThan(0);
  });
});
