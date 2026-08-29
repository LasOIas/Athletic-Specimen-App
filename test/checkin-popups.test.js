// Check-in pop-ups round (2026-08-29): the pencil, the card, the add path, the groups removal.
// Same vm-sandbox harness as test/manage-page.test.js, loading pure.js, then manage.js, then app.js, the
// order public/index.html uses. There is NO DOM in this suite (no jsdom, no happy-dom, and no per-file
// vitest environment pragma anywhere - writing that pragma's literal name in a comment makes vitest read
// the next word as an environment and fail the file, so it is spelled out here in words instead), so
// every case here is one of three shapes: a builder string, a delegate tap through withDelegate, or a
// source guard. openPlayerEditPopup cannot execute here at all, because modal.querySelector('.pe-card')
// is null and it returns at app.js:137-138, so its markup is pinned by a slice of its source. Anything
// needing a live element is a drive fact in the spec's 7.4.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const appSrc = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const mgSrc = readFileSync(new URL('../public/manage.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
const cssLF = css.replace(/\r/g, '');

// Blank comments while preserving length and newlines, so a rewritten comment can neither trip nor fool a
// scan. Copied from test/supabase-writes.test.js:20-27.
function stripComments(src) {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  out = out.replace(/(?<!:)\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
  return out;
}

// The source between two top-level declarations. The shape test/register-auto-attach.test.js:140 uses.
function slice(src, fromDecl, toDecl) {
  const a = src.indexOf(fromDecl);
  const b = src.indexOf(toDecl, a + 1);
  if (a < 0 || b < 0) throw new Error('slice bounds not found: ' + fromDecl + ' .. ' + toDecl);
  return src.slice(a, b);
}

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
    readyState: 'loading', // keeps the bottom bootstrap from calling init() at load
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => emptyList,
    createElement: () => makeEl(), createDocumentFragment: () => makeEl(),
    addEventListener: noop, removeEventListener: noop,
    head: makeEl(), body: makeEl(), documentElement: makeEl(),
  };
  const supaStub = {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: noop } } }),
      getSession: async () => ({ data: { session: null } }),
      getUser: async () => ({ data: { user: null } }),
    },
    from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }) }),
    channel: () => ({ on: () => ({ subscribe: noop }) }),
    removeChannel: noop, rpc: async () => ({ data: null, error: null }),
  };
  const windowStub = {
    supabase: { createClient: () => supaStub },
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
      getState: () => state,
      doc: document,
      setView: (v) => { manageView = v; },
      mode: () => ({ mode: peMode, origin: peOrigin, key: peReturnKey }),
      step: (v, d) => peSkillStep(v, d),
      attachHandlers: () => attachHandlers(),
      list: (opts) => { opts = opts || {}; manageView = 'checkin'; mgckFilter = opts.filter || 'all'; mgckQ = opts.q || ''; return mgckListHTML(checkinConsoleModel(mgckRows(), mgckFilter, mgckQ)); },
      seed: (players, checkedIn) => { state.players = players.slice(); state.checkedIn = (checkedIn || []).slice(); state.loaded = true; },
      swapOpeners: (openEdit, toggleRow) => {
        const a = openPlayerEditPopup, b = mgckToggleRow;
        openPlayerEditPopup = openEdit; mgckToggleRow = toggleRow;
        return () => { openPlayerEditPopup = a; mgckToggleRow = b; };
      },
      strip: () => mgckStripHTML(),
      setStrip: (o) => { o = o || {}; mgckLast = (o.last === undefined ? null : o.last); mgckNotice = (o.notice === undefined ? null : o.notice); },
      readStrip: () => ({ last: mgckLast, notice: mgckNotice }),
      toggleByKey: (k, d, o) => mgckToggleByKey(k, d, o),
      swapRepaint: (fn) => { const a = mgckRepaint, b = repaintManage; mgckRepaint = fn; repaintManage = fn; return () => { mgckRepaint = a; repaintManage = b; }; },
      checkinPage: () => { manageView = 'checkin'; return buildManageCheckinHTML(); },
      addFromCard: (n, s, i) => mgckAddFromCard(n, s, i),
      swapSupaRpc: (fn) => { const was = supabaseClient.rpc; supabaseClient.rpc = async (...a) => fn(...a); return () => { supabaseClient.rpc = was; }; },
      swapUpdateFields: (fn) => { const was = updatePlayerFieldsSupabase; updatePlayerFieldsSupabase = fn; return () => { updatePlayerFieldsSupabase = was; }; },
      swapOutbox: (fn) => { const was = outboxEnqueue; outboxEnqueue = fn; return () => { outboxEnqueue = was; }; },
      swapAddOpener: (fn) => { const was = openPlayerAddPopup; openPlayerAddPopup = fn; return () => { openPlayerAddPopup = was; }; },
      close: () => closePlayerEditPopup(),
      restoreFocus: () => peRestoreFocus(),
      setReturnKey: (k) => { peReturnKey = String(k || ''); },
      cardNotice: (t, k) => mgckCardNotice(t, k),
    };`;
  const context = vm.createContext(sandbox);
  vm.runInContext(pureSrc, context, { filename: 'pure.js' });
  vm.runInContext(mgSrc, context, { filename: 'manage.js' });   // manage.js loads before app.js, as index.html does
  vm.runInContext(appSrc + epilogue, context, { filename: 'app.js' });
  return sandbox.__bridge;
}

const bridge = loadApp();

// One synthetic tap (or key press) through the REAL #app-content delegates attachHandlers binds. Copied
// from test/manage-round.test.js:1623-1658 and widened to collect the keydown listeners too, because the
// pencil ships role="button" tabindex="0" and its Enter/Space path is a second binding, not the click one.
// Driving the real delegate is what proves the hooks are checked in the right ORDER; a grep proves nothing
// about order. `attrs` is every hook the tapped node sits under, so a control nested inside another hook's
// block (the pencil inside the row button) can be reproduced exactly.
function withDelegate(fn) {
  const doc = bridge.doc;
  const realGet = doc.getElementById;
  const noop = () => {};
  let click = null;
  const keys = [];
  const appContent = {
    dataset: {}, style: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    addEventListener: (type, cb) => { if (type === 'click') click = cb; if (type === 'keydown') keys.push(cb); },
    removeEventListener: noop,
    querySelector: () => null, querySelectorAll: () => ({ forEach: noop, length: 0 }),
  };
  doc.getElementById = (id) => (id === 'app-content' ? appContent : null);
  // the later bindings in attachHandlers want DOM this harness does not have; the delegates are bound
  // first, so they are already captured by the time any of them complain
  try { bridge.attachHandlers(); } catch (_) { /* nothing after the delegates matters here */ }
  finally { doc.getElementById = realGet; }
  if (!click) throw new Error('the #app-content click delegate was never bound');
  const target = (list, value) => ({
    tagName: 'BUTTON', dataset: {},
    classList: { contains: () => false },
    closest: (sel) => (list.some((a) => sel === '[' + a + ']')
      ? { getAttribute: (name) => (list.includes(name) ? (value == null ? '' : value) : null), dataset: {} }
      : null),
  });
  const tap = (attrs, value) => click({
    target: target(Array.isArray(attrs) ? attrs : [attrs], value),
    preventDefault: noop, stopPropagation: noop,
  });
  // press RETURNS whether preventDefault ran, the way test/manage-round.test.js:3007-3022 does it, because
  // "Space never scrolls the roster out from under the card" is a promise a noop stub can never keep.
  const press = (key, attrs, value) => {
    let prevented = false;
    const ev = {
      key, target: target(Array.isArray(attrs) ? attrs : [attrs], value),
      preventDefault: () => { prevented = true; }, stopPropagation: noop,
    };
    for (const cb of keys) cb(ev);
    return prevented;
  };
  return fn(tap, press);
}

describe('Task 2: the close button is pinned right in every pop-up', () => {
  it('the title block takes the slack and the close button carries the auto margin', () => {
    expect(cssLF).toContain('.popup-header .pe-who,\n.popup-header .hmv-rtitles { flex: 1 1 auto; min-width: 0; }');
    expect(cssLF).toContain('.popup-header .pe-in { margin-left: 0; }');
    expect(cssLF).toContain('.popup-header .pe-x,\n.popup-header .hmv-rx { margin-left: auto; }');
    expect(cssLF).toContain('.popup-header .pe-in + .pe-x { margin-left: 10px; }');
  });

  it('the base .pe-in rule no longer carries the auto margin it used to push the close button with', () => {
    // Task 3 gave the pill its skin, so the base rule is a block now and not the one-liner Task 2 left
    // behind. This is the same guard, stricter: the block still opens on flex: none, and NO base .pe-in
    // rule in the file carries margin-left: auto, which the literal-only check could never say.
    expect(cssLF).toContain('.pe-in {\n  position: relative;\n  flex: none;\n');
    expect(cssLF).not.toContain('.pe-in { flex: none; margin-left: auto; }');
    expect(cssLF).not.toMatch(/^\.pe-in\s*\{[^}]*margin-left:\s*auto/m);
  });

  it('the empty .pe-in spacer is gone from the card, so an out player has no phantom child', () => {
    expect(appSrc).not.toContain('<span class="pe-in" aria-hidden="true"></span>');
    expect(appSrc).toContain('const inHTML = isIn ? `<span class="mgp-in pe-in">IN</span>` : \'\';');
  });
});

describe('Task 3: the card header and its section heads', () => {
  // openPlayerEditPopup cannot run without a DOM (app.js:137-138), so its markup is pinned by its source.
  const card = () => slice(appSrc, 'function openPlayerEditPopup(', 'function closeInlineEditRow(');

  it('the header carries the watermark, the eyebrow and the tile, and the pill only when it is true', () => {
    const s = card();
    expect(s).toContain('class="pe-mark" aria-hidden="true"');
    expect(s).toContain('class="pe-eyebrow"');
    expect(s).toContain('const inHTML = isIn ? `<span class="mgp-in pe-in">IN</span>` : \'\';');
  });

  it('the eyebrow follows the surface, not only the mode', () => {
    const s = card();
    expect(s).toContain("'Roster · new player'");
    expect(s).toContain("'Roster · check-in'");
    expect(s).toContain("'Roster · players'");   // this spec's own string: the handoff only drew check-in
    // The three strings alone would still pass with the ternary inverted, which IS the failure this case
    // is named after, so the wiring is pinned too. And the bindings it reads are pinned at their load
    // state, because an arrow body in the bridge is never evaluated: without this, deleting `let peOrigin`
    // (app.js:105) would fail nothing until Task 7 consumed it.
    expect(s).toContain("peOrigin === 'checkin' ? 'Roster · check-in' : 'Roster · players'");
    expect(bridge.mode()).toEqual({ mode: 'edit', origin: 'checkin', key: '' });
  });

  it('PLAYER comes before STATUS, and Skill stays a field label', () => {
    const s = card();
    const player = s.indexOf('<div class="pl-sect pe-sect">Player</div>');
    const status = s.indexOf('<div class="pl-sect pe-sect">Status</div>');
    expect(player).toBeGreaterThan(-1);
    expect(status).toBeGreaterThan(player);
    expect(s).toContain('<label class="popup-edit-label" for="pe-skill">Skill</label>');
  });

  it('the card takes focus on the dialog, never on a field (Bug A, 2026-06-21, stands)', () => {
    const s = card();
    expect(s).not.toContain('.select()');
    expect(s).not.toMatch(/getElementById\('pe-(first|last|skill)'\)\.focus\(\)/);
    expect(appSrc).toContain('class="popup-card card pe-card" role="dialog" aria-modal="true" tabindex="-1"');
  });

  it('the header treatment is in styles.css once, on tokens', () => {
    // The block is SLICED, not scanned. A bare toContain on 'background: var(--accent-soft);' proves
    // nothing about this header: the literal occurs 65 times in styles.css and was already true at the
    // parent commit, where the old .pe-av carried it. [^}] spans newlines in JS, so the match runs from
    // the selector to the block's first closing brace, and the m flag keeps the descendant rules out.
    const heads = cssLF.match(/^\.pe-head\s*\{[^}]*\}/gm) || [];
    expect(heads).toHaveLength(1);   // the "once" the title has always claimed, now actually asserted
    const head = heads[0];
    expect(head).toContain('background: var(--accent-soft);');
    expect(head).toContain('border-bottom: 1px solid var(--accent-bd);');
    expect(head).toContain('margin: 0;');   // .popup-header:864 ships margin-bottom: 12px into this element
    expect(head).toContain('padding: 16px 14px 15px 16px;');
    expect(head).toContain('position: relative;');
    expect(head).toContain('overflow: hidden;');
    expect(head).toContain('flex: none;');
    expect(cssLF).toContain('.pe-mark {');
    expect(cssLF).toContain('.pe-eyebrow {');
    expect(cssLF).toContain('.pe-sect:not(:first-child) { margin-top: 20px; }');
  });
});

describe('Task 4: the stepper, and unrated is skill 0', () => {
  // README:404 states the empty-field behaviour transposed; the handoff's own code (_shared.js:1197-1199)
  // is authoritative: the first tap UP from unrated is the smallest real rating, the first tap DOWN is the
  // explicit zero Mike's 2026-08-29 call made meaningful.
  it('steps in halves, clamps 0 to 10, and always returns one decimal', () => {
    expect(bridge.step('', 0.5)).toBe('0.5');
    // Review M1: the plus case is the ONLY discriminator against README:404's transposed rule. The minus
    // case returns '0.0' under BOTH readings, because the clamp swallows 0 - 0.5. It is a pin, not a guard.
    expect(bridge.step('', -0.5)).toBe('0.0');
    expect(bridge.step('10', 0.5)).toBe('10.0');
    expect(bridge.step('0', -0.5)).toBe('0.0');
    expect(bridge.step('6', 0.5)).toBe('6.5');
    for (const v of ['', '0', '3.5', '10']) {
      for (const d of [0.5, -0.5]) expect(bridge.step(v, d)).toMatch(/^\d+\.\d$/);
    }
  });

  it('the card prefills blank for an unrated player and shows the en dash placeholder', () => {
    const s = slice(appSrc, 'function openPlayerEditPopup(', 'function closeInlineEditRow(');
    expect(s).toContain("? Number(player.skill).toFixed(1) : ''");
    expect(s).toContain('placeholder="&#8211;"');
    expect(s).toContain('data-pe-skill="-0.5"');
    expect(s).toContain('data-pe-skill="0.5"');
    expect(s).toContain('aria-label="Lower skill"');
    expect(s).toContain('aria-label="Raise skill"');
  });

  it('a blank rating saves as 0 instead of aborting in silence', () => {
    // stripComments, because the replacement's OWN comment quotes the abort it removed, verbatim and on
    // purpose - that quote is the record of what changed. A raw slice would read the prose and fail the
    // very guard the prose documents, so this one scan reads code only.
    const save = slice(stripComments(appSrc), 'function ensureSaveDelegationBound()', 'function ensureHeaderTapToTop()');
    expect(save).not.toContain('if (!name || Number.isNaN(skill)) return;');
    expect(save).toContain('if (Number.isNaN(skill)) skill = 0;');
    expect(save).toContain('if (!name) { if (nameInput) nameInput.focus(); return; }');
  });

  it('the stepper frame and its buttons are in styles.css, with the native spinners suppressed', () => {
    expect(cssLF).toContain('.pe-stepper {');
    expect(cssLF).toContain('.pe-sb {');
    expect(cssLF).toContain('#player-edit-modal .pe-skillin::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }');
    // The value box is SLICED, not scanned. Production's global input[type="number"] rule
    // (styles.css:264) sets flex: 1 at :276. That was inert while .pe-skillrow was a grid; inside the
    // flex .pe-stepper it is live, and without the reset the 74px is a flex BASIS the browser grows
    // past. [^}] spans newlines in JS, so the match runs to the block's first closing brace, and the m
    // flag keeps the ::-webkit- and :focus rules out: they are separate blocks, hence the length of 1.
    const skillin = cssLF.match(/^#player-edit-modal \.pe-skillin\s*\{[^}]*\}/gm) || [];
    expect(skillin).toHaveLength(1);
    expect(skillin[0]).toContain('flex: none;');
    expect(skillin[0]).toContain('width: 74px;');
  });
});

describe('Task 5: the status button is a draft, not a write', () => {
  // There is no DOM here, so "nothing is written" is proved by READING the branch: a toggle that touches
  // no state, no RPC and no saveLocal cannot write. The live behaviour is a drive fact (spec 7.4).
  const branch = () => {
    const s = slice(stripComments(appSrc), 'function ensureSaveDelegationBound()', 'function ensureHeaderTapToTop()');
    const a = s.indexOf("const inBtn = e.target.closest('[data-pe-in]');");
    const b = s.indexOf("const btn = e.target.closest('.btn-save-edit');", a + 1);
    if (a < 0 || b < 0) throw new Error('the [data-pe-in] branch is not above the save branch');
    return s.slice(a, b);
  };

  it('the toggle writes nothing: no state, no RPC, no saveLocal, no attendance writer', () => {
    const b = branch();
    expect(b).not.toContain('state.');
    expect(b).not.toContain('mgckToggleByKey');
    expect(b).not.toContain('supabaseClient');
    expect(b).not.toContain('saveLocal');
    expect(b).toContain("inBtn.setAttribute('aria-pressed'");
    expect(b).toContain('peInPillNode()');
  });

  it('the card emits the button with both icons, the label and the pressed state', () => {
    const s = slice(appSrc, 'function openPlayerEditPopup(', 'function closeInlineEditRow(');
    expect(s).toContain('class="pe-inbtn${isIn ? \' is-in\' : \'\'}" data-pe-in aria-pressed="${isIn ? \'true\' : \'false\'}"');
    expect(s).toContain('class="pe-ico pe-ico-in"');
    expect(s).toContain('class="pe-ico pe-ico-out"');
    expect(s).toContain('<span data-pe-inlabel>${isIn ? \'Check out\' : \'Check in\'}</span>');
  });

  it('peInPillNode rebuilds exactly the markup the opener emits, so the two cannot drift', () => {
    const fn = slice(appSrc, 'function peInPillNode()', 'function openPlayerEditPopup(');
    expect(fn).toContain("s.className = 'mgp-in pe-in';");
    expect(fn).toContain("s.textContent = 'IN';");
  });

  it('the out-state block, the in-state swap and the label size are pinned by value, not by selector', () => {
    // The block is SLICED, not scanned, the way the stepper case two describes above does it. A scan for
    // '.pe-inbtn {' proves only that the selector exists: all three green values could go grey and stay
    // green. [^}] spans newlines, so the match runs to the block's first closing brace, and the m flag
    // keeps :hover, :active and the .is-in rules out, because they are separate blocks.
    const inbtn = cssLF.match(/^\.pe-inbtn\s*\{[^}]*\}/gm) || [];
    expect(inbtn).toHaveLength(1);
    expect(inbtn[0]).toContain('border: 1px solid oklch(0.80 0.10 150);');
    expect(inbtn[0]).toContain('background: oklch(0.95 0.045 150);');
    expect(inbtn[0]).toContain('color: oklch(0.40 0.11 150);');
    // The label's size lives on the SPAN, and this is the rule that makes it real. The button's own
    // font-size cannot win: button { font-size: 16px !important } (styles.css:241, the iOS zoom guard)
    // beats every specificity in the same origin, and a span declaring no size of its own inherits that
    // computed 16px. Delete this rule and the label ships 2px over the approved design.
    const inlabel = cssLF.match(/^\.pe-inbtn \[data-pe-inlabel\]\s*\{[^}]*\}/gm) || [];
    expect(inlabel).toHaveLength(1);
    expect(inlabel[0]).toContain('font-size: 14px;');
    // Both halves of the icon swap, and the quiet in-state.
    expect(cssLF).toContain('.pe-inbtn .pe-ico-out,\n.pe-inbtn.is-in .pe-ico-in { display: none; }');
    expect(cssLF).toContain('.pe-inbtn.is-in .pe-ico-out { display: block; }');
    expect(cssLF).toContain('.pe-inbtn.is-in { border-color: var(--border); background: #fff; color: var(--ink); }');
  });
});

describe('Task 6: the pencil, and the tap that must not check anyone in', () => {
  // playerIdentityKey (pure.js:11) returns `id:<id>` for a saved player, so `id:p1` is the key the row
  // builder really emits and the key the delegate really carries. The tap harness passes the value through
  // untouched, so using the real shape here keeps the case honest about the console's identity grammar.
  const roster = [{ id: 'p1', name: 'Blake Harmon', skill: 6 }, { id: 'p2', name: 'Riley Chen', skill: 0 }];

  it('every row carries a pencil between the name and the rating', () => {
    bridge.seed(roster, []);
    const html = bridge.list();
    expect(html).toContain('class="mgck-edit" role="button" tabindex="0" data-mgck-edit="id:p1"');
    expect(html).toContain('aria-label="Edit Blake Harmon"');
    const nm = html.indexOf('class="ckx-nm"');
    const pen = html.indexOf('class="mgck-edit"');
    const sk = html.indexOf('class="mgck-sk');
    expect(pen).toBeGreaterThan(nm);
    expect(sk).toBeGreaterThan(pen);
  });

  it('a tap on the pencil opens the card and never toggles the row', () => {
    bridge.seed(roster, []);
    bridge.setView('checkin');
    const opened = []; const toggled = [];
    const undo = bridge.swapOpeners((k) => opened.push(k), (k) => toggled.push(k));
    try {
      // BOTH hooks, because that is what the DOM really hands the delegate: the pencil is a child of the
      // row <button>, so a real tap on it answers closest('[data-mgck-id]') as well. Claim only the pencil
      // hook and the row toggle finds nothing to toggle, and the case passes with the two branches in
      // EITHER order - which is the one thing it exists to rule out. Mutation-proved in fix round 1: move
      // the [data-mgck-edit] branch below the row toggle in app.js and this line goes red.
      withDelegate((tap) => { tap(['data-mgck-edit', 'data-mgck-id'], 'id:p1'); });
      expect(opened).toEqual(['id:p1']);
      expect(toggled).toEqual([]);
    } finally { undo(); }
  });

  it('a tap on the row itself still toggles, so the console did not lose its one-tap check-in', () => {
    bridge.seed(roster, []);
    bridge.setView('checkin');
    const opened = []; const toggled = [];
    const undo = bridge.swapOpeners((k) => opened.push(k), (k) => toggled.push(k));
    try {
      withDelegate((tap) => { tap('data-mgck-id', 'id:p1'); });
      expect(toggled).toEqual(['id:p1']);
      expect(opened).toEqual([]);
    } finally { undo(); }
  });

  it('Enter and Space on the pencil open the same card the tap opens, and Space never scrolls', () => {
    bridge.seed(roster, []);
    bridge.setView('checkin');
    const opened = [];
    const undo = bridge.swapOpeners((k) => opened.push(k), () => {});
    try {
      withDelegate((tap, press) => {
        // the focused pencil sits inside the row here too, for the same reason the tap case does
        expect(press('Enter', ['data-mgck-edit', 'data-mgck-id'], 'id:p2')).toBe(true);
        expect(press(' ', ['data-mgck-edit', 'data-mgck-id'], 'id:p2')).toBe(true);
        press('a', ['data-mgck-edit', 'data-mgck-id'], 'id:p2');   // any other key is left alone
        press('Enter', 'data-mgck-id', 'id:p1');                   // and the row itself is not a pencil
      });
      expect(opened).toEqual(['id:p2', 'id:p2']);
    } finally { undo(); }
  });

  it('the pencil keydown is gated to the check-in console, so it cannot fire on another Manage view', () => {
    bridge.seed(roster, []);
    bridge.setView('players');
    const opened = [];
    const undo = bridge.swapOpeners((k) => opened.push(k), () => {});
    try {
      // Without the manageView gate this listener would answer an Enter anywhere in Manage. The Players
      // list has its own opener and its own hooks; two openers racing one key is the bug this rules out.
      withDelegate((tap, press) => { press('Enter', 'data-mgck-edit', 'id:p2'); });
      expect(opened).toEqual([]);
    } finally { undo(); bridge.setView('checkin'); }
  });

  it('the public kiosk row stays pencil-free and rating-free (spec 7.3, AS-1)', () => {
    // The kiosk builds its rows in a DIFFERENT function, and the skill rating plus the edit affordance are
    // admin-only. Nothing stops a later task from reusing the console's builder on the kiosk except this.
    const kiosk = slice(appSrc, 'function renderCheckinButton(', 'function highlightMatch(');
    expect(kiosk).toContain('data-checkin-id=');
    expect(kiosk).not.toContain('mgck-edit');
    expect(kiosk).not.toContain('mgck-sk');
  });

  it('the pencil is quiet at rest and legible on a checked-in row', () => {
    // The block is SLICED, not scanned, the way the .pe-head and .pe-inbtn cases above do it. A bare
    // toContain('.mgck-edit {') proves the selector exists and nothing else: the rest ink, the 34x34 hit
    // box and the whole focus chip could all be deleted and stay green. [^}] spans newlines in JS, so the
    // match runs to the block's first closing brace, and the m flag keeps the descendant, :hover and
    // .is-in rules out, which is why the length is 1.
    const pen = cssLF.match(/^\.mgck-edit\s*\{[^}]*\}/gm) || [];
    expect(pen).toHaveLength(1);
    expect(pen[0]).toContain('width: 34px;');
    expect(pen[0]).toContain('height: 34px;');
    expect(pen[0]).toContain('color: oklch(0.62 0.01 75);');
    expect(cssLF).toContain('.mgck-edit svg { width: 15px; height: 15px; }');
    // The focus chip is what makes the keyboard path visible at all, so it is pinned by value too.
    expect(cssLF).toContain('.mgck-edit:hover,\n.mgck-edit:focus-visible {');
    expect(cssLF).toContain('.mgck-edit + .mgck-sk { margin-left: 10px; }');
    // .ckx-row.is-in is opacity .55 and opacity on the parent caps every child, so this is a DARKER ink
    // and not an override. Delete it and the pencil goes invisible on every checked-in row.
    expect(cssLF).toContain('.ckx-row.is-in .mgck-edit { color: oklch(0.45 0.01 75); }');
  });
});

describe('Task 7: the save writes back in place and the strip stays honest', () => {
  it('the card message carries no UNDO, because one button cannot undo a multi-field write', () => {
    bridge.setStrip({ notice: 'Riley Chen updated' });
    const s = bridge.strip();
    expect(s).toContain('Riley Chen updated');
    expect(s).not.toContain('data-mgck-undo');
  });

  it('a plain row tap still gets its UNDO', () => {
    bridge.setStrip({ last: { key: 'id:p1', name: 'Riley Chen', dir: 'in' } });
    const s = bridge.strip();
    expect(s).toContain('Riley Chen checked in');
    expect(s).toContain('data-mgck-undo');
  });

  it('the card message wins while it is set', () => {
    bridge.setStrip({ last: { key: 'id:p1', name: 'Riley Chen', dir: 'in' }, notice: 'Riley Chen updated' });
    expect(bridge.strip()).not.toContain('data-mgck-undo');
  });

  it('a row toggle clears the card message, so UNDO comes straight back', () => {
    bridge.seed([{ id: 'p1', name: 'Riley Chen', skill: 6 }], []);
    bridge.setStrip({ notice: 'Riley Chen updated' });
    const undo = bridge.swapRepaint(() => {});
    try {
      bridge.toggleByKey('id:p1', 'in');
      const after = bridge.readStrip();
      expect(after.notice).toBe(null);
      expect(after.last).toBeTruthy();
      expect(bridge.getState().checkedIn).toContain('id:p1');
    } finally { undo(); }
  });

  it('a silent toggle writes the roster and leaves mgckLast alone, which is what the card needs', () => {
    bridge.seed([{ id: 'p2', name: 'Blake Harmon', skill: 6 }], []);
    bridge.setStrip({ last: null, notice: null });
    const undo = bridge.swapRepaint(() => {});
    try {
      bridge.toggleByKey('id:p2', 'in', { silent: true });
      expect(bridge.getState().checkedIn).toContain('id:p2');
      expect(bridge.readStrip().last).toBe(null);
    } finally { undo(); }
  });

  it('the save repaints in place, never with a full render, and only toggles on a real difference', () => {
    // stripComments, the way the blank-rating case above does it: the replacement's OWN comment names the
    // render() it removed, and that sentence is the record of what changed. A raw slice would read the
    // prose and fail the very guard the prose documents. The slice then starts at the save branch's own
    // marker, so the CANCEL branch's render() (app.js:469, not this task's) is out of scope.
    const save = slice(stripComments(appSrc), 'function ensureSaveDelegationBound()', 'function ensureHeaderTapToTop()');
    const branch = save.slice(save.indexOf("const btn = e.target.closest('.btn-save-edit');"));
    // A bare not.toContain('render();') could never pass here, because the GUARDED `else render();`
    // fallback is deliberate - the file seam must not throw if manage.js ever fails to load. What went is
    // the UNCONDITIONAL statement, render() alone on its own line, so that is what is pinned.
    expect(branch.split('\n').filter((l) => l.trim() === 'render();')).toEqual([]);
    expect(branch).toContain('else render();');
    expect(branch).toContain('mgckCardNotice');
    expect(branch).toContain('repaintManage');
    const cmp = branch.indexOf('wantIn !== isInNow');
    const call = branch.indexOf('mgckToggleByKey(');
    expect(cmp).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(cmp);
    // ONCE. The attendance writer is reached from exactly one place in this branch, so a second call
    // cannot creep in behind the comparison and flip the player straight back.
    expect(branch.split('mgckToggleByKey(').length - 1).toBe(1);
  });

  it('close hands focus back to the pencil that opened the card, by key', () => {
    // stripComments, per the fix-round review: the sibling guard below already does it, and a future
    // comment naming the selector would otherwise hollow this out in silence. The slice spans BOTH halves
    // of the focus return, closePlayerEditPopup and peRestoreFocus, because fix round 1 split it in two.
    const s = slice(stripComments(appSrc), 'function closePlayerEditPopup()', 'function peSkillStep(');
    expect(s).toContain('.mgck-edit[data-mgck-edit=');
    expect(s).toContain('peReturnKey');
  });

  it('Escape closes without saving and Enter in a field saves', () => {
    const s = slice(appSrc, 'function ensurePlayerEditKeysBound()', 'function ensureSaveDelegationBound()');
    expect(s).toContain("if (e.key === 'Escape')");
    expect(s).toContain('closePlayerEditPopup()');
    expect(s).toContain("e.key === 'Enter'");
    expect(s).toContain("classList.contains('popup-edit-input')");
  });
});

describe('Task 8: adding a player from the console header', () => {
  it('the page header carries the Add player pill', () => {
    bridge.seed([{ id: 'p1', name: 'Blake Harmon', skill: 6 }], []);
    const html = bridge.checkinPage();
    expect(html).toContain('class="mgck-add" data-mgck-new');
    expect(html).toContain('<span>Add player</span>');
    const hdr = html.indexOf('class="pd-pagehdr"');
    const pill = html.indexOf('class="mgck-add"');
    const hdrEnd = html.indexOf('class="mgck-meta"');
    expect(pill).toBeGreaterThan(hdr);
    expect(pill).toBeLessThan(hdrEnd);
  });

  it('a tap on the pill opens the card in its new-player state', () => {
    bridge.setView('checkin');
    const opened = [];
    const undo = bridge.swapAddOpener(() => opened.push('new'));
    try {
      // the pill sits in the page header, not in a row, so this is the whole attribute set a real tap
      // hands the delegate: no [data-mgck-id] under it, and no [data-mg-area] either (the back button
      // carries that one and is a SIBLING, not an ancestor).
      withDelegate((tap) => { tap('data-mgck-new'); });
      expect(opened).toEqual(['new']);
    } finally { undo(); }
  });

  it('a rated new player registers once with two keys and gets one follow-up write for the rating', async () => {
    bridge.seed([], []);
    const calls = []; const fields = [];
    const undoRepaint = bridge.swapRepaint(() => {});
    const undoRpc = bridge.swapSupaRpc((name, args) => { calls.push([name, args]); return { data: [{ id: 'p-new' }], error: null }; });
    const undoFields = bridge.swapUpdateFields(async (id, f) => { fields.push([id, f]); return true; });
    try {
      await bridge.addFromCard('Zoe Park', 6.5, false);
      expect(calls.length).toBe(1);
      expect(calls[0][0]).toBe('register_player');
      expect(calls[0][1]).toEqual({ p_name: 'Zoe Park', p_checked_in: false });
      expect('p_group' in calls[0][1]).toBe(false);
      expect(fields).toEqual([['p-new', { skill: 6.5 }]]);
      // OUT is the card's default, and the card's own door is the only one that honours it.
      expect(bridge.getState().checkedIn).toEqual([]);
    } finally { undoFields(); undoRpc(); undoRepaint(); }
  });

  it('an unrated new player takes no follow-up write at all', async () => {
    bridge.seed([], []);
    const fields = [];
    const undoRepaint = bridge.swapRepaint(() => {});
    const undoRpc = bridge.swapSupaRpc(() => ({ data: [{ id: 'p-new2' }], error: null }));
    const undoFields = bridge.swapUpdateFields(async (id, f) => { fields.push([id, f]); return true; });
    try {
      await bridge.addFromCard('Ari Vance', 0, true);
      expect(fields).toEqual([]);
      expect(bridge.getState().checkedIn.length).toBe(1);
      // and it is the ID key, not the local one the optimistic check-in wrote. The key changes under the
      // entry when the insert returns, and saveLocal deletes any entry whose key no longer matches a
      // roster row - so without the carry-across this list is EMPTY and the player reads OUT.
      expect(bridge.getState().checkedIn).toEqual(['id:p-new2']);
    } finally { undoFields(); undoRpc(); undoRepaint(); }
  });

  it('a failed register enqueues exactly one outbox row, carrying the rating and no group', async () => {
    bridge.seed([], []);
    const rows = [];
    const undoRepaint = bridge.swapRepaint(() => {});
    const undoRpc = bridge.swapSupaRpc(() => { throw new Error('offline'); });
    const undoOut = bridge.swapOutbox((op) => rows.push(op));
    try {
      await bridge.addFromCard('Noa Whitfield', 4.5, true);
      expect(rows.length).toBe(1);
      expect(rows[0].kind).toBe('register');
      expect(rows[0].payload).toEqual({ name: 'Noa Whitfield', checked_in: true, skill: 4.5 });
      expect('group' in rows[0].payload).toBe(false);
    } finally { undoOut(); undoRpc(); undoRepaint(); }
  });

  it('a queued register replays its rating too, because register_player only ever inserts skill 0', () => {
    // The outbox row above is worthless if the replay drops the rating: the row is deleted the moment it
    // lands, so a rating lost here is lost for good. Ordering matters as much as presence - the follow-up
    // write has to sit AFTER the error throw, or a register that failed would still get a skill write.
    const s = slice(stripComments(appSrc), 'async function flushOutbox()', 'function makeSaveToast(');
    expect(s).toContain("op.kind === 'register' && Number(op.payload.skill) > 0");
    expect(s).toContain('updatePlayerFieldsSupabase(regRow.id, { skill: Number(op.payload.skill) })');
    expect(s.indexOf('if (res && res.error) throw res.error;')).toBeLessThan(s.indexOf('op.payload.skill'));
  });

  it('the add card has no roster row behind it, so the save finds its row inside the card', () => {
    // The Save button sits in .edit-actions, a SIBLING of .popup-body, so btn.closest('.edit-row') is null
    // in BOTH modes: the edit card is only ever found by findInlineEditRowByPlayerKey, and the add card
    // has no key to be found by. Without the card-scoped fallback the add card's Save returns at
    // `if (!row) return;` and the button is dead - it reads no name, no rating and no status.
    const save = slice(appSrc, 'function ensureSaveDelegationBound()', 'function ensureHeaderTapToTop()');
    const branch = save.slice(save.indexOf("const btn = e.target.closest('.btn-save-edit');"));
    expect(branch).toContain("card.querySelector('.edit-row')");
    expect(branch.indexOf("card.querySelector('.edit-row')")).toBeLessThan(branch.indexOf('if (!row) return;'));
  });

  it('the three refusals run while the card is still open, before it closes', () => {
    const save = slice(appSrc, 'function ensureSaveDelegationBound()', 'function ensureHeaderTapToTop()');
    const add = save.slice(save.indexOf("if (peMode === 'new') {"), save.indexOf("const inBtnEl ="));
    expect(add).toContain('state.loaded');
    expect(add).toContain('isValidFullName');
    expect(add).toContain('is already on the roster');
    expect(add.indexOf('is already on the roster')).toBeLessThan(add.indexOf('closePlayerEditPopup()'));
    expect(add).toContain("say('Enter a first and last name')");
    expect(add).toContain("say('Still loading. One second, then tap again.')");
  });

  it('the card carries a status line for those refusals, and the add card says Add player', () => {
    const s = slice(appSrc, 'function openPlayerEditPopup(', 'function closeInlineEditRow(');
    expect(s).toContain('<p class="pe-msg" id="pe-msg" role="status" aria-live="polite"></p>');
    // The mode is a PARAMETER with an edit default, so every existing one-argument caller keeps the card
    // it had and nothing but openPlayerAddPopup can put it in its new state.
    expect(s).toContain('function openPlayerEditPopup(playerKey, mode) {');
    expect(s).toContain("peMode = (mode === 'new') ? 'new' : 'edit';");
    expect(s).toContain("openPlayerEditPopup('', 'new');");
    // the handoff's action-bar copy: the add card's primary is not "Save changes"
    expect(s).toContain("peMode === 'new' ? 'Add player' : 'Save changes'");
    // The blocks are SLICED, not scanned, the way Task 6's pencil case is: a bare toContain('.mgck-add {')
    // proves the selector exists and nothing else - the right-hand pin could be deleted and stay green.
    const pill = cssLF.match(/^\.mgck-add\s*\{[^}]*\}/gm) || [];
    expect(pill).toHaveLength(1);
    expect(pill[0]).toContain('margin-left: auto;');
    expect(pill[0]).toContain('border-radius: 999px;');
    expect(cssLF).toContain('.mgck-add svg { width: 14px; height: 14px; }');
    expect(cssLF).toContain('.pe-msg { font-size: 12.5px; color: var(--danger); margin: 10px 0 0; }');
    expect(cssLF).toContain('.pe-msg:empty { display: none; }');
  });
});

// A DOM stub just big enough for closePlayerEditPopup and peRestoreFocus to run: a modal to find, a body
// to blank, and a pencil that RECORDS the selector it was focused through. Same monkey-patch-and-restore
// shape withDelegate uses above. Nothing here fakes the repaint: that is the point of the pair of cases
// below, which prove close no longer focuses and peRestoreFocus is the only thing that does.
function withCloseDOM(fn) {
  const doc = bridge.doc;
  const realGet = doc.getElementById;
  const realQS = doc.querySelector;
  const order = [];
  const modal = { style: { display: 'flex' }, setAttribute: () => {}, querySelector: () => null };
  doc.getElementById = (id) => {
    if (id === 'player-edit-modal') return modal;
    if (id === 'player-edit-modal-body') return { innerHTML: 'the open card' };
    return null;
  };
  doc.querySelector = (sel) => {
    const m = /^\.mgck-edit\[data-mgck-edit="(.*)"\]$/.exec(String(sel));
    if (!m) return null;
    return { focus: () => order.push('focus:' + m[1]) };
  };
  try { return fn(order); } finally { doc.getElementById = realGet; doc.querySelector = realQS; }
}

describe('Task 7 fix round 1: the focus return lands after the repaint, and no message outlives the page', () => {
  // -- Important 1: the focus return was a no-op, because the repaint ran after it --

  it('close PARKS the focus return instead of spending it, because the repaint that follows destroys the pencil', () => {
    bridge.setReturnKey('id:p1');
    const seen = withCloseDOM((order) => { bridge.close(); return order.slice(); });
    // Nothing was focused. mgckRepaint replaces #mgck-list's innerHTML, which is where every .mgck-edit
    // lives, so a focus set here would land on an element removed a moment later and drop to document.body.
    expect(seen).toEqual([]);
  });

  it('peRestoreFocus focuses the pencil the parked key names, and spends the key exactly once', () => {
    bridge.setReturnKey('id:p1');
    const seen = withCloseDOM((order) => {
      bridge.close();
      bridge.restoreFocus();
      bridge.restoreFocus();   // the key is spent: a second call must not focus anything again
      return order.slice();
    });
    expect(seen).toEqual(['focus:id:p1']);
  });

  it('a close with no origin key focuses nothing at all, which is the add card', () => {
    bridge.setReturnKey('');
    const seen = withCloseDOM((order) => { bridge.close(); bridge.restoreFocus(); return order.slice(); });
    expect(seen).toEqual([]);
  });

  it('the save calls the focus return AFTER the repaint, never before it', () => {
    // The save delegate binds on `document`, which this harness stubs as a noop, so no case in this file
    // can execute the save branch. The ORDER of the three calls is therefore pinned in the source, which
    // is exactly the order the review found inverted.
    const save = slice(stripComments(appSrc), 'function ensureSaveDelegationBound()', 'function ensureHeaderTapToTop()');
    const branch = save.slice(save.indexOf("const btn = e.target.closest('.btn-save-edit');"));
    const close = branch.indexOf('closePlayerEditPopup()');
    const notice = branch.indexOf('mgckCardNotice');
    const repaint = branch.indexOf('repaintManage');
    const restore = branch.indexOf('peRestoreFocus()');
    expect(close).toBeGreaterThan(-1);
    expect(notice).toBeGreaterThan(close);
    expect(restore).toBeGreaterThan(notice);
    expect(restore).toBeGreaterThan(repaint);
    // ONCE, so a stray earlier call cannot satisfy the ordering above while still firing too soon.
    expect(branch.split('peRestoreFocus()').length - 1).toBe(1);
  });

  it('close itself no longer focuses anything, it only parks the key', () => {
    const c = slice(stripComments(appSrc), 'function closePlayerEditPopup()', 'function peRestoreFocus()');
    expect(c).toContain('pePendingFocusKey = peReturnKey;');
    expect(c).not.toContain('.focus()');
    expect(c).not.toContain('querySelector');
  });

  it('the Escape arm closes and restores focus without ever reaching Save', () => {
    const keys = slice(stripComments(appSrc), 'function ensurePlayerEditKeysBound()', 'function ensureSaveDelegationBound()');
    const arm = keys.slice(keys.indexOf("if (e.key === 'Escape')"), keys.indexOf("if (e.key === 'Enter'"));
    expect(arm).toContain('closePlayerEditPopup()');
    // Escape repaints nothing, so the return can be spent immediately.
    expect(arm).toContain('peRestoreFocus()');
    expect(arm).not.toContain('btn-save-edit');
    expect(arm).not.toContain('.click()');
  });

  // -- Important 2: the card message outlived the page --

  it('re-entering Check-in clears the card message, so a saved card cannot greet the next visit', () => {
    bridge.seed([{ id: 'p1', name: 'Riley Chen', skill: 6 }], []);
    bridge.setStrip({ last: { key: 'id:p1', name: 'Riley Chen', dir: 'in' }, notice: 'Riley Chen updated' });
    const undo = bridge.swapRepaint(() => {});
    try {
      withDelegate((tap) => { tap(['data-mg-area'], 'checkin'); });
      // All four strip inputs, not three: the filter and the query are already pinned by the Manage round.
      expect(bridge.readStrip()).toEqual({ last: null, notice: null });
      expect(bridge.strip()).toBe('');
    } finally { undo(); }
  });

  // -- Important 3: the two hidden toggles decided whether the notice was ever SEEN --

  it('the strip renders hidden with nothing to say, and visible for a card message', () => {
    bridge.seed([{ id: 'p1', name: 'Riley Chen', skill: 6 }], []);
    bridge.setStrip({ last: null, notice: null });
    expect(bridge.checkinPage()).toContain('<div class="mgck-strip" id="mgck-strip" hidden>');
    bridge.setStrip({ notice: 'Riley Chen updated' });
    const shown = bridge.checkinPage();
    expect(shown).toContain('<div class="mgck-strip" id="mgck-strip">');
    expect(shown).not.toContain('id="mgck-strip" hidden');
    expect(shown).toContain('Riley Chen updated');
  });

  it('the repaint hides the strip on the SAME test the builder uses, so a notice is never painted into a hidden div', () => {
    // mgckRepaint swaps #mgck-strip's innerHTML in place and needs no DOM here, so its one deciding line
    // is pinned by value. Revert it to !mgckLast and every card notice renders invisible.
    const r = slice(stripComments(mgSrc), 'function mgckRepaint()', 'function mgckToggleByKey(');
    expect(r).toContain('stripEl.hidden = !(mgckLast || mgckNotice);');
  });

  // -- Important 4: mgckCardNotice's body, the interface this task PRODUCES --

  it('mgckCardNotice sets the message, drops the UNDO pointer and repaints exactly once', () => {
    bridge.seed([{ id: 'p1', name: 'Riley Chen', skill: 6 }], []);
    bridge.setStrip({ last: { key: 'id:p1', name: 'Riley Chen', dir: 'in' }, notice: null });
    let paints = 0;
    const undo = bridge.swapRepaint(() => { paints += 1; });
    try {
      bridge.cardNotice('Riley Chen updated', 'id:p1');
      expect(paints).toBe(1);
      const after = bridge.readStrip();
      expect(after.notice).toBe('Riley Chen updated');
      expect(after.last).toBe(null);
      expect(bridge.strip()).toContain('Riley Chen updated');
      expect(bridge.strip()).not.toContain('data-mgck-undo');
    } finally { undo(); }
  });

  it('the flash row is queried AFTER the repaint, because the repaint replaces the row it targets', () => {
    bridge.seed([{ id: 'p1', name: 'Riley Chen', skill: 6 }], []);
    const doc = bridge.doc;
    const realQS = doc.querySelector;
    const order = [];
    const undo = bridge.swapRepaint(() => { order.push('repaint'); });
    doc.querySelector = (sel) => {
      if (String(sel).indexOf('.ckx-row[data-mgck-id=') === 0) order.push('query:' + sel);
      return null;   // off screen: the flash is skipped and nothing throws
    };
    try {
      bridge.cardNotice('Riley Chen updated', 'id:p1');
      expect(order).toEqual(['repaint', 'query:.ckx-row[data-mgck-id="id:p1"]']);
    } finally { undo(); doc.querySelector = realQS; }
  });

  it('a notice with no key repaints and never looks for a row to flash', () => {
    const doc = bridge.doc;
    const realQS = doc.querySelector;
    let queries = 0;
    const undo = bridge.swapRepaint(() => {});
    doc.querySelector = () => { queries += 1; return null; };
    try {
      bridge.cardNotice('Riley Chen updated', '');
      expect(queries).toBe(0);
      expect(bridge.readStrip().notice).toBe('Riley Chen updated');
    } finally { undo(); doc.querySelector = realQS; }
  });

  // -- Minor 7: the clear sat above the guard, so a miss wiped the strip and then returned --

  it('a toggle against a key that is not on the roster leaves the card message alone', () => {
    bridge.seed([{ id: 'p1', name: 'Riley Chen', skill: 6 }], []);
    bridge.setStrip({ notice: 'Riley Chen updated' });
    const undo = bridge.swapRepaint(() => {});
    try {
      bridge.toggleByKey('id:nobody', 'in');
      // The function returned without repainting, so wiping the module var would have left the DOM and
      // the state out of step until something else happened to repaint.
      expect(bridge.readStrip().notice).toBe('Riley Chen updated');
    } finally { undo(); }
  });
});
