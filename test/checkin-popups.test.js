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
  const press = (key, attrs, value) => {
    const ev = { key, target: target(Array.isArray(attrs) ? attrs : [attrs], value), preventDefault: noop, stopPropagation: noop };
    for (const cb of keys) cb(ev);
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
      withDelegate((tap) => { tap('data-mgck-edit', 'id:p1'); });
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

  it('Enter and Space on the pencil open the same card the tap opens', () => {
    bridge.seed(roster, []);
    bridge.setView('checkin');
    const opened = [];
    const undo = bridge.swapOpeners((k) => opened.push(k), () => {});
    try {
      withDelegate((tap, press) => { press('Enter', 'data-mgck-edit', 'id:p2'); press(' ', 'data-mgck-edit', 'id:p2'); });
      expect(opened).toEqual(['id:p2', 'id:p2']);
    } finally { undo(); }
  });

  it('the pencil is quiet at rest and legible on a checked-in row', () => {
    expect(cssLF).toContain('.mgck-edit {');
    expect(cssLF).toContain('.mgck-edit + .mgck-sk { margin-left: 10px; }');
    expect(cssLF).toContain('.ckx-row.is-in .mgck-edit { color: oklch(0.45 0.01 75); }');
  });
});
