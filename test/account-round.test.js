// Account handoff round (2026-08-25), Task 1: the auth page and the wall.
// Guards the behaviour half of the round's first push:
//   1. passwordMeterScore - the pure, honest strength read (never "Strong"),
//   2. the create-account screen: the reveal control, the meter, `required`, the 8-character placeholder
//      and its own sub-line; the sign-in screen keeps its own sub-line and ships no meter,
//   3. AUTH_PASSWORD_MIN as the only place the client minimum lives,
//   4. the three client submit rules in the design's words, none of which touches the network,
//   5. the sent screen a no-session signUp renders, and a Resend that AWAITS the API and shows its failure,
//   6. every link back to the site root (emailRedirectTo = location.origin),
//   7. the wall as a body-appended overlay with an exit, opened at navigation time,
//   8. the ported CSS block: one copy of each selector, the documented iOS counters, no banner family.
//
// Harness copied from manage-round.test.js (app.js is a browser classic script, so it runs in a Node vm
// with browser stubs; pure.js loads first into the same context). THE DIFFERENCE: manage-round drives
// BUILDERS (pure string functions), and this round's screens are OPENERS - they createElement, set
// innerHTML, appendChild to <body>, then querySelector their own controls back. So the document stub
// grows exactly three things: created nodes capture innerHTML, an id registry answers getElementById and
// querySelector('#id'), and a small hooks map answers the attribute selectors a delegate uses. Listeners
// are recorded so a test can fire one with a synthetic event. Later tasks in this round reuse it.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const registry = {};   // id -> node. Body-appended overlays register themselves; their children are seeded.
const hooks = {};      // selector -> node, pre-registered per test via bridge.hook(sel, node)

// The ids every .auth-page render queries back after its innerHTML swap. innerHTML is captured as a
// STRING (there is no parser here), so the controls a handler binds have to exist in the registry first.
const AUTH_CONTROL_IDS = [
  'auth-back', 'auth-alt', 'auth-form', 'auth-email', 'auth-pass',
  'auth-first', 'auth-last', 'auth-err', 'auth-submit', 'auth-resend',
];

function matches(node, sel) {
  if (sel.startsWith('#')) return node.id === sel.slice(1);
  return hooks[sel] === node;
}
function resolve(sel) {
  if (typeof sel !== 'string') return null;
  if (sel.startsWith('#')) return registry[sel.slice(1)] || null;
  return hooks[sel] || null;
}

function mkNode(tag) {
  const listeners = {};
  const node = {
    tagName: String(tag || 'div').toUpperCase(), id: '', className: '', hidden: false, disabled: false,
    value: '', type: '', textContent: '', dataset: {}, style: {}, attrs: {}, children: [], parent: null,
    _html: '', listeners,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'id') this.id = String(v); },
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    hasAttribute(k) { return k in this.attrs; },
    removeAttribute(k) { delete this.attrs[k]; },
    addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    removeEventListener() {}, focus() { this.focused = true; }, blur() {},
    appendChild(c) { this.children.push(c); c.parent = this; if (c.id) registry[c.id] = c; return c; },
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter((x) => x !== this);
      if (this.id) delete registry[this.id];
    },
    querySelector(sel) { return resolve(sel); },
    querySelectorAll(sel) { const r = resolve(sel); return r ? [r] : []; },
    closest(sel) { return matches(this, sel) ? this : (this.parent ? this.parent.closest(sel) : null); },
    contains() { return false; },
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = String(v); this.children = []; },
  };
  return node;
}

function loadApp() {
  const pureSrc = readFileSync(new URL('../public/pure.js', import.meta.url), 'utf8');
  const src = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const noop = () => {};
  const makeEl = () => mkNode('div');
  const documentStub = {
    readyState: 'loading', // keeps the bottom bootstrap from calling init() at load
    getElementById: (id) => registry[id] || null,
    querySelector: (sel) => resolve(sel),
    // An ARRAY, never a bare object: layoutBracketTree spreads its result, so the stub has to be iterable.
    querySelectorAll: (sel) => { const r = resolve(sel); return r ? [r] : []; },
    createElement: (tag) => mkNode(tag),
    createDocumentFragment: () => mkNode('fragment'),
    addEventListener: noop, removeEventListener: noop,
    head: makeEl(), body: mkNode('body'), documentElement: makeEl(),
  };
  // The auth half of the client, recorded. Every method pushes its arguments and answers whatever the
  // test scripted for it (one shot), so a case can drive the no-session branch, a rate limit or a hard
  // failure without a network anywhere near it.
  const supaCalls = [];
  const supaScript = {};
  const rec = (name) => async (...a) => {
    supaCalls.push([name, ...a]);
    if (name in supaScript) { const v = supaScript[name]; delete supaScript[name]; return v; }
    return { data: {}, error: null };
  };
  const supaStub = {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: noop } } }),
      getSession: async () => ({ data: { session: null } }),
      getUser: async () => ({ data: { user: null } }),
      signUp: rec('signUp'),
      signInWithPassword: rec('signInWithPassword'),
      resend: rec('resend'),
      resetPasswordForEmail: rec('resetPasswordForEmail'),
      updateUser: rec('updateUser'),
      signOut: rec('signOut'),
    },
    from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }) }),
    channel: () => ({ on: () => ({ subscribe: noop }) }),
    removeChannel: noop, rpc: async () => ({ data: null, error: null }),
  };
  const windowStub = {
    supabase: { createClient: () => supaStub },
    addEventListener: noop, removeEventListener: noop, dispatchEvent: noop,
    matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop, removeEventListener: noop }),
    location: { href: 'http://localhost/', origin: 'http://localhost', search: '', hash: '', pathname: '/', reload: noop },
    navigator: { onLine: true, userAgent: 'node', serviceWorker: { register: async () => ({}) } },
    requestAnimationFrame: noop, cancelAnimationFrame: noop,
    setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop, scrollTo: noop,
  };
  windowStub.window = windowStub;
  const storageStub = () => ({ getItem: () => null, setItem: noop, removeItem: noop, clear: noop, key: () => null, length: 0 });
  const sandbox = {
    window: windowStub, document: documentStub,
    localStorage: storageStub(), sessionStorage: storageStub(),
    navigator: windowStub.navigator, location: windowStub.location,
    requestAnimationFrame: noop, cancelAnimationFrame: noop,
    setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop,
    Event: class { constructor(type) { this.type = type; } },
    console, SUPABASE_URL: 'http://localhost', SUPABASE_KEY: 'anon',
  };
  sandbox.globalThis = sandbox; sandbox.self = sandbox;
  const epilogue = `
    ;globalThis.__bridge = {
      meter: (v) => passwordMeterScore(v),
      getState: () => state,
      openAuthPage: (mode) => openAuthPage(mode),
      openGate: () => openGatePage(),
      authSubmit: () => onAuthSubmit({ preventDefault() {} }),
      tab: (t) => activateMainTab(t),
      setView: (v) => { pdTournamentView = v; },
      // The module vars the overlays keep between renders. reset() clears them so a cooldown or a typed
      // address can never leak from one case into the next (this suite shares one vm context).
      resetAuthVars: () => { authMode = 'signin'; authSentEmail = ''; authResendUntil = 0; },
    };`;
  const context = vm.createContext(sandbox);
  vm.runInContext(pureSrc, context, { filename: 'pure.js' });
  vm.runInContext(src + epilogue, context, { filename: 'app.js' });
  const bridge = sandbox.__bridge;
  bridge.doc = documentStub;
  bridge.registry = registry;
  bridge.node = mkNode;
  bridge.hook = (sel, node) => { hooks[sel] = node; };
  bridge.supaCalls = () => supaCalls;
  bridge.supaNext = (name, value) => { supaScript[name] = value; };
  bridge.reset = () => {
    for (const k of Object.keys(registry)) delete registry[k];
    for (const k of Object.keys(hooks)) delete hooks[k];
    for (const k of Object.keys(supaScript)) delete supaScript[k];
    supaCalls.length = 0;
    documentStub.body.children = [];
    bridge.resetAuthVars();
    bridge.getState().authSession = null;
    bridge.getState().account = null;
    for (const id of AUTH_CONTROL_IDS) { const n = mkNode('div'); n.id = id; registry[id] = n; }
  };
  bridge.setSignedOut = () => { bridge.getState().authSession = null; bridge.getState().account = null; };
  bridge.setSignedIn = () => { bridge.getState().authSession = { user: { id: 'u1', email: 'a@b.co' } }; };
  bridge.openAuth = (mode) => { bridge.openAuthPage(mode); return registry['auth-page']; };
  return bridge;
}

const bridge = loadApp();
const count = (hay, needle) => hay.split(needle).length - 1;

const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const appSrc = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// Fill the four create-account inputs with something that passes every client rule.
function fillSignup(email = 'morgan@email.com', password = 'Passw0rd!') {
  bridge.registry['auth-first'].value = 'Morgan';
  bridge.registry['auth-last'].value = 'Reyes';
  bridge.registry['auth-email'].value = email;
  bridge.registry['auth-pass'].value = password;
}

describe('Account round Task 1 - the auth page and the wall', () => {
  beforeEach(() => bridge.reset());

  it('passwordMeterScore measures length and variety and never says Strong', () => {
    const s = bridge.meter;
    expect(s('')).toEqual({ score: 0, label: '' });
    expect(s('abc')).toEqual({ score: 1, label: 'Too short' });
    expect(s('password')).toEqual({ score: 2, label: 'OK' });
    expect(s('Passw0rd!')).toEqual({ score: 3, label: 'Good' });
    expect(s('aaaaaaaaaaa1')).toEqual({ score: 3, label: 'Good' });
    expect(JSON.stringify(s('Passw0rd!'))).not.toMatch(/Strong/);
    expect(s(null)).toEqual({ score: 0, label: '' });
  });

  it('create account renders the reveal, the meter, required, the 8-character placeholder and its own sub-line', () => {
    bridge.openAuth('signup');
    const html = bridge.registry['auth-page'].innerHTML;
    expect(html).toContain('class="au-field"');
    expect(html).toContain('data-reveal="auth-pass"');
    expect(html).toContain('class="au-strength" data-sbox');
    expect(count(html, ' required')).toBe(4);
    expect(html).toContain('placeholder="At least 8 characters"');
    expect(html).toContain('One account for every tournament you play.');
    expect(html).not.toMatch(/—|&mdash;|night/i);
  });

  it('sign in renders no meter and keeps its sub-line', () => {
    bridge.openAuth('signin');
    const html = bridge.registry['auth-page'].innerHTML;
    expect(html).not.toContain('au-strength');
    expect(html).toContain('Sign in to claim your team and follow your games.');
    expect(html).toContain('data-reveal="auth-pass"');
    expect(count(html, ' required')).toBe(2);
  });

  it('the reveal control swaps the input type and its own label, both ways', () => {
    bridge.openAuth('signup');
    const rev = bridge.node('button');
    rev.setAttribute('data-reveal', 'auth-pass');
    rev.textContent = 'Show';
    bridge.hook('[data-reveal]', rev);
    const pass = bridge.registry['auth-pass'];
    pass.type = 'password';
    const fire = bridge.registry['auth-page'].listeners.click[0];
    fire({ target: rev });
    expect(pass.type).toBe('text');
    expect(rev.textContent).toBe('Hide');
    expect(rev.getAttribute('aria-pressed')).toBe('true');
    fire({ target: rev });
    expect(pass.type).toBe('password');
    expect(rev.textContent).toBe('Show');
    expect(rev.getAttribute('aria-pressed')).toBe('false');
  });

  it('AUTH_PASSWORD_MIN is the only place 8 lives', () => {
    expect(appSrc).toContain('const AUTH_PASSWORD_MIN = 8');
    expect(appSrc).not.toContain('password.length < 6');
    expect(appSrc).not.toContain('at least 6 characters');
    expect(appSrc).not.toContain('At least 6 characters');
  });

  it('submit refuses empties, a bad email and a short password in the design copy, with no network call', async () => {
    bridge.openAuth('signup');
    const err = bridge.registry['auth-err'];

    fillSignup();
    bridge.registry['auth-last'].value = '';
    await bridge.authSubmit();
    expect(err.textContent).toBe('Fill in every field.');
    expect(err.hidden).toBe(false);

    fillSignup('nope');
    await bridge.authSubmit();
    expect(err.textContent).toBe("That email doesn't look right.");

    fillSignup('morgan@email.com', 'short1');
    await bridge.authSubmit();
    expect(err.textContent).toBe('Your password needs at least 8 characters.');

    expect(bridge.supaCalls().length).toBe(0);
  });

  it('sign in never applies the length gate', async () => {
    bridge.openAuth('signin');
    bridge.registry['auth-email'].value = 'morgan@email.com';
    bridge.registry['auth-pass'].value = 'short1';
    await bridge.authSubmit();
    expect(bridge.supaCalls().map((c) => c[0])).toEqual(['signInWithPassword']);
  });

  it('a no-session signup renders the sent screen; Resend awaits the stub, shows its error, then cools down', async () => {
    bridge.openAuth('signup');
    fillSignup();
    bridge.supaNext('signUp', { data: { user: {}, session: null }, error: null });
    await bridge.authSubmit();

    const html = bridge.registry['auth-page'].innerHTML;
    expect(html).toContain('au-mark is-mail');
    expect(html).toContain('Check your email');
    expect(html).toContain('morgan@email.com');
    expect(html).toContain('Back to sign in');
    expect(html).not.toMatch(/—|&mdash;|night/i);

    bridge.supaNext('resend', { data: null, error: { message: 'email rate limit exceeded' } });
    await bridge.registry['auth-resend'].listeners.click[0]();
    expect(bridge.registry['auth-err'].textContent).toContain('try again');
    expect(bridge.registry['auth-err'].hidden).toBe(false);
    expect(bridge.registry['auth-resend'].disabled).toBe(true);
  });

  it('signUp and resend carry emailRedirectTo = the origin', async () => {
    bridge.openAuth('signup');
    fillSignup();
    bridge.supaNext('signUp', { data: { user: {}, session: null }, error: null });
    await bridge.authSubmit();
    const signUp = bridge.supaCalls().find((c) => c[0] === 'signUp');
    expect(signUp[1].options.emailRedirectTo).toBe('http://localhost');

    bridge.supaNext('resend', { data: {}, error: null });
    await bridge.registry['auth-resend'].listeners.click[0]();
    const resend = bridge.supaCalls().find((c) => c[0] === 'resend');
    expect(resend[1].type).toBe('signup');
    expect(resend[1].email).toBe('morgan@email.com');
    expect(resend[1].options.emailRedirectTo).toBe('http://localhost');
    expect(bridge.registry['auth-resend'].textContent).toBe('Sent again');
  });

  it('the wall is an overlay with a back control and its alt opens the sign-up form', () => {
    bridge.setSignedOut();
    bridge.openGate();
    const html = bridge.registry['gate-page'].innerHTML;
    expect(html).toContain('Sign in to see the tournament');
    expect(html).toContain('class="auth-back"');
    expect(html).toContain('data-auth-view="signup"');
    expect(html).not.toContain('Pools, bracket, scores');
    expect(appSrc).not.toContain('tn-gate-cta');
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toContain('.tn-gate');

    const alt = bridge.node('button');
    alt.setAttribute('data-auth-view', 'signup');
    bridge.hook('[data-auth-view]', alt);
    bridge.registry['gate-page'].listeners.click[0]({ target: alt });
    expect(bridge.registry['auth-page'].innerHTML).toContain('One account for every tournament you play.');
  });

  it('the Tournament tab raises the wall for a signed-out viewer, never over register or rules, never signed in', () => {
    bridge.setSignedOut();
    bridge.setView('hub');
    bridge.tab('tournament');
    expect(bridge.registry['gate-page']).toBeTruthy();

    bridge.tab('home');
    expect(bridge.registry['gate-page']).toBeFalsy();

    for (const view of ['register', 'rules']) {
      bridge.setView(view);
      bridge.tab('tournament');
      expect(bridge.registry['gate-page']).toBeFalsy();
    }

    bridge.setView('hub');
    bridge.setSignedIn();
    bridge.tab('tournament');
    expect(bridge.registry['gate-page']).toBeFalsy();
  });

  it('the CSS block ships once with exactly the documented counters and no banner family', () => {
    for (const sel of ['.au-field {', '.au-reveal {', '.au-strength {', '.au-mark {', '.au-alt2 {']) {
      expect(count(css, sel)).toBe(1);
    }
    expect(count(css, '.vb')).toBe(0);
    expect(css).not.toContain('.au-center');
    expect(css).toMatch(/\.au-reveal \{[^}]*font-size: 13px !important/);
    expect(css).toMatch(/\.au-alt2 \{[^}]*font-size: 13\.5px !important/);
    expect(css).toContain('ACCOUNT DESIGN ROUND - 2026-08-25');
  });
});
