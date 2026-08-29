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
    expect(cssLF).not.toMatch(/^\.pe-in \{[^}]*margin-left:\s*auto/m);
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
    expect(cssLF).toContain('background: var(--accent-soft);');
    expect(cssLF).toContain('.pe-mark {');
    expect(cssLF).toContain('.pe-eyebrow {');
    expect(cssLF).toContain('.pe-sect:not(:first-child) { margin-top: 20px; }');
  });
});
