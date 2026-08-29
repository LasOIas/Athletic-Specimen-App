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
    };`;
  const context = vm.createContext(sandbox);
  vm.runInContext(pureSrc, context, { filename: 'pure.js' });
  vm.runInContext(mgSrc, context, { filename: 'manage.js' });   // manage.js loads before app.js, as index.html does
  vm.runInContext(appSrc + epilogue, context, { filename: 'app.js' });
  return sandbox.__bridge;
}

const bridge = loadApp();

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
  });
});
