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
//   8. the ported CSS block: one copy of each selector, the documented iOS counters, no banner family,
//   9. (fix round 1) the auth error map's narrow length rule, the meter's fallback scope, a Resend that
//      never fails silently, the cooldown handing back its own label, and the one-delegate-per-overlay
//      binding that a per-render bind would have cancelled out.
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
  // Task 2: the forgot screen's field and every control on #reset-page.
  'fg-email', 'reset-form', 'rs-new', 'rs-again', 'reset-err', 'reset-save', 'reset-go',
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
  const classes = new Set();
  const node = {
    tagName: String(tag || 'div').toUpperCase(), id: '', className: '', hidden: false, disabled: false,
    value: '', type: '', textContent: '', dataset: {}, style: {}, attrs: {}, children: [], parent: null,
    _html: '', listeners, classes,
    // Set-backed, so a class the app adds is actually OBSERVABLE - authMeterUpdate's is-N step is the
    // whole behaviour of the meter and a noop classList would have made it untestable.
    classList: {
      add(...c) { c.forEach((x) => classes.add(x)); },
      remove(...c) { c.forEach((x) => classes.delete(x)); },
      toggle(c, force) { const on = force === undefined ? !classes.has(c) : !!force; if (on) classes.add(c); else classes.delete(c); return on; },
      contains: (c) => classes.has(c),
    },
    setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'id') this.id = String(v); },
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    hasAttribute(k) { return k in this.attrs; },
    removeAttribute(k) { delete this.attrs[k]; },
    addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    removeEventListener() {}, focus() { this.focused = true; }, blur() {},
    _clearListeners() { for (const k of Object.keys(listeners)) delete listeners[k]; },
    appendChild(c) { this.children.push(c); c.parent = this; if (c.id) registry[c.id] = c; return c; },
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter((x) => x !== this);
      if (this.id) delete registry[this.id];
    },
    // The real DOM finds an id only INSIDE the element being queried. Modelling that is what stops a
    // render that did NOT declare a control from binding a handler to it anyway (the form state was
    // silently binding #auth-resend, so the sent screen's test fired the form state's stale closure).
    _owns(sel) {
      if (!sel.startsWith('#')) return true;
      if (!this._html) return true;   // a bare fixture node that never had markup set
      return this._html.includes('id="' + sel.slice(1) + '"');
    },
    querySelector(sel) { return this._owns(sel) ? resolve(sel) : null; },
    querySelectorAll(sel) { const r = this.querySelector(sel); return r ? [r] : []; },
    closest(sel) { return matches(this, sel) ? this : (this.parent ? this.parent.closest(sel) : null); },
    contains() { return false; },
    get innerHTML() { return this._html; },
    set innerHTML(v) {
      this._html = String(v);
      this.children = [];
      // An innerHTML swap REPLACES the subtree: every control the new markup declares is a brand new
      // element, so whatever a previous render bound to it is gone. Without this the same registry node
      // collects one handler per render and a test ends up firing a stale binding.
      for (const id of Object.keys(registry)) {
        if (id !== this.id && this._html.includes('id="' + id + '"')) registry[id]._clearListeners();
      }
    },
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
  // Task 2: the deferred sites (the recovery router, the focus nudges) are setTimeout(0) callbacks, so a
  // noop stub would swallow the whole router. They QUEUE instead, and only flushTimers() runs them - the
  // Task 1 cases never flush, so for them the queue behaves exactly like the noop it replaces.
  const timers = [];
  sandbox.setTimeout = (fn) => { if (typeof fn === 'function') timers.push(fn); return 0; };
  const epilogue = `
    // Task 2 spy: the extracted post-sign-in work is the one thing the recovery router must NOT run and
    // the reset-done path MUST run. The real function still runs - this only counts the calls.
    ;let __postRuns = 0;
    const __postWork = runPostSignInWork;
    runPostSignInWork = async function () { __postRuns += 1; return __postWork(); };
    ;globalThis.__bridge = {
      authEvent: (event, session) => onAuthEvent(event, session),
      // The sandbox's location.hash is empty, so the fragment flag a real recovery link sets is set here.
      setRecoveryPending: (v) => { authRecoveryPending = !!v; },
      recoveryPending: () => authRecoveryPending,
      getClaimIntent: () => claimIntent,
      setClaimIntent: (v) => { claimIntent = !!v; },
      resetSave: () => onResetSave({ preventDefault() {} }),
      postSignInRuns: () => __postRuns,
      resetPostRuns: () => { __postRuns = 0; },
      meter: (v) => passwordMeterScore(v),
      getState: () => state,
      openAuthPage: (mode) => openAuthPage(mode),
      openGate: () => openGatePage(),
      authSubmit: () => onAuthSubmit({ preventDefault() {} }),
      resend: (kind, email) => authResend(kind, email),
      friendlyError: (err, signup) => friendlyAuthError(err, signup),
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
  // The sandbox QUEUES setTimeout work (see above) and only flushTimers runs it, so a cooldown callback
  // never fires on its own. A case that wants to see the far side of the cooldown swaps in an immediate
  // setTimeout and restores the queue with the returned undo.
  bridge.swapTimeout = (fn) => { const prev = sandbox.setTimeout; sandbox.setTimeout = fn; return () => { sandbox.setTimeout = prev; }; };
  // Drains the queued setTimeout(0) work. Callbacks are CALLED, never awaited: the post-sign-in retry
  // loop parks on a timer promise by design, and awaiting it would hang the suite. The cap is a guard
  // against a callback that re-queues itself forever.
  bridge.flushTimers = async () => {
    for (let i = 0; timers.length && i < 50; i++) {
      const fn = timers.shift();
      try { fn(); } catch (_) { /* a deferred site swallows its own errors; so does this */ }
      await Promise.resolve();
    }
  };
  bridge.reset = () => {
    timers.length = 0;
    bridge.resetPostRuns();
    bridge.setRecoveryPending(false);
    bridge.setClaimIntent(false);
    for (const k of Object.keys(registry)) delete registry[k];
    for (const k of Object.keys(hooks)) delete hooks[k];
    for (const k of Object.keys(supaScript)) delete supaScript[k];
    supaCalls.length = 0;
    documentStub.body.children = [];
    bridge.resetAuthVars();
    bridge.getState().authSession = null;
    bridge.getState().account = null;
    // FRESH nodes, not cleared ones: a control carries listeners, classes and a value, and every one of
    // those has to start empty or a case inherits the previous case's bindings.
    for (const id of AUTH_CONTROL_IDS) { const n = mkNode('div'); n.id = id; registry[id] = n; }
  };
  bridge.setSignedOut = () => { bridge.getState().authSession = null; bridge.getState().account = null; };
  // A device that is ALREADY signed in: both halves of the state a real session leaves behind, so the
  // listener's isNewSignIn gate reads false for the same account (Task 2's recovery case).
  bridge.setSignedIn = (user) => {
    const u = user || { id: 'u1', email: 'a@b.co' };
    bridge.getState().authSession = { user: u };
    bridge.getState().account = { id: u.id, email: u.email };
  };
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

  it('the overlay delegate is bound once per overlay, not once per render', () => {
    // The regression guard for the fix that moved authBindOverlay out of renderAuthPageInner: a mode
    // toggle re-renders the SAME element, and a second identical reveal handler would cancel the first
    // out (Show -> Hide -> Show in one tap).
    bridge.openAuth('signin');
    const page = bridge.registry['auth-page'];
    // Two click delegates, both bound by openAuthPage: the reveal (Task 1) and the view switch behind
    // "Forgot your password?" (Task 2). What matters is that neither GROWS when the mode repaints.
    expect(page.listeners.click.length).toBe(2);
    expect(page.listeners.input.length).toBe(1);
    bridge.registry['auth-alt'].listeners.click[0]();   // "New here? Create an account"
    expect(page.innerHTML).toContain('One account for every tournament you play.');
    expect(page.listeners.click.length).toBe(2);
    expect(page.listeners.input.length).toBe(1);
  });

  it('the meter delegate scores the typed value and paints its step, with no form in scope', () => {
    // The reset and change-password screens put the password OUTSIDE a <form>, so input.form is null and
    // the meter has to fall back to the overlay wrapper.
    bridge.openAuth('signup');
    const page = bridge.registry['auth-page'];
    const inner = bridge.node('div');
    const box = bridge.node('div');
    const lab = bridge.node('span');
    bridge.hook('.auth-inner', inner);
    bridge.hook('[data-sbox]', box);
    bridge.hook('.au-slab', lab);
    const inp = bridge.node('input');
    inp.setAttribute('data-strength', '');
    inp.form = null;
    inp.parent = inner;
    const type = (v) => { inp.value = v; page.listeners.input[0]({ target: inp }); };

    type('abc');
    expect(lab.textContent).toBe('Too short');
    expect(box.classList.contains('is-1')).toBe(true);

    type('password');
    expect(lab.textContent).toBe('OK');
    expect(box.classList.contains('is-1')).toBe(false);
    expect(box.classList.contains('is-2')).toBe(true);

    type('Passw0rd!');
    expect(lab.textContent).toBe('Good');
    expect(box.classList.contains('is-2')).toBe(false);
    expect(box.classList.contains('is-3')).toBe(true);

    type('');
    expect(lab.textContent).toBe('');
    for (const c of ['is-1', 'is-2', 'is-3']) expect(box.classList.contains(c)).toBe(false);
  });

  it('the auth error map catches a length complaint and leaves the character-class one alone', () => {
    const f = bridge.friendlyError;
    expect(f({ message: 'Password should be at least 6 characters.' }))
      .toBe('Your password needs at least 8 characters.');
    // Supabase's character-class refusal LISTS the digits. Matching a bare digit mapped it to the length
    // copy and told people the wrong thing to fix (review, fix round 1).
    const charClass = { message: 'Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, 0123456789.' };
    expect(f(charClass)).toBe(charClass.message);
    expect(appSrc).not.toContain('/(characters|short|\\d)/i');
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

    // The sent render is the ONLY thing that declares #auth-resend, so it owns the one handler on it.
    const btn = bridge.registry['auth-resend'];
    expect(btn.listeners.click.length).toBe(1);

    bridge.supaNext('resend', { data: null, error: { message: 'email rate limit exceeded' } });
    await btn.listeners.click[0]();
    expect(bridge.registry['auth-err'].textContent).toContain('try again');
    expect(bridge.registry['auth-err'].hidden).toBe(false);
    expect(btn.disabled).toBe(true);
  });

  it('a Resend with no address in memory says so instead of doing nothing', async () => {
    // The shape a reload leaves behind: the sent screen is gone and authSentEmail is empty.
    bridge.openAuth('signup');
    await bridge.resend('signup');
    expect(bridge.registry['auth-err'].textContent).toBe('Something went wrong. Try again.');
    expect(bridge.registry['auth-err'].hidden).toBe(false);
    expect(bridge.supaCalls().length).toBe(0);
  });

  it('the cooldown hands back both the button and its own label', async () => {
    bridge.openAuth('signup');
    fillSignup();
    bridge.supaNext('signUp', { data: { user: {}, session: null }, error: null });
    await bridge.authSubmit();
    const btn = bridge.registry['auth-resend'];
    bridge.supaNext('resend', { data: {}, error: null });
    const undo = bridge.swapTimeout((fn) => fn());   // run the cooldown callback the moment it is set
    try { await btn.listeners.click[0](); } finally { undo(); }
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe("Didn't get it? Resend");
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

// Account handoff round (2026-08-25), Task 2: forgot / reset and the recovery router.
// Guards the second push: the forgot screen and its sent state, the PASSWORD_RECOVERY branch that sits
// ABOVE the listener's isNewSignIn gate (so a recovery link works on a device that is already signed in),
// the reset screen's validation order, and the post-sign-in work running once, after the save.
describe('Account round Task 2 - forgot, reset and the recovery router', () => {
  beforeEach(() => bridge.reset());

  // Opens #reset-page the way a real recovery link does: the event, then the deferred callback.
  async function recover(user = { id: 'u1', email: 'a@b.co' }) {
    bridge.setSignedIn(user);
    await bridge.authEvent('PASSWORD_RECOVERY', { user });
    await bridge.flushTimers();
    return bridge.registry['reset-page'];
  }

  it('sign in carries the forgot link; the forgot screen asks Supabase with the root redirectTo and renders the sent screen', async () => {
    bridge.openAuth('forgot');   // Task 3 opens this mode straight from the account card
    expect(bridge.registry['auth-page'].innerHTML).toContain('Send reset link');

    bridge.openAuth('signin');
    const page = bridge.registry['auth-page'];
    expect(page.innerHTML).toContain('data-auth-view="forgot"');
    expect(page.innerHTML).toContain('Forgot your password?');

    // The link is a view switch INSIDE the overlay, so a real tap reaches every delegate bound on it.
    const link = bridge.node('button');
    link.setAttribute('data-auth-view', 'forgot');
    bridge.hook('[data-auth-view]', link);
    page.listeners.click.forEach((fn) => fn({ target: link }));
    expect(page.innerHTML).toContain('Reset your password');
    expect(page.innerHTML).toContain("Enter your email and we'll send a link to set a new one.");

    bridge.registry['fg-email'].value = 'a@b.co';
    bridge.supaNext('resetPasswordForEmail', { data: {}, error: null });
    await bridge.authSubmit();
    expect(bridge.supaCalls().at(-1)).toEqual(['resetPasswordForEmail', 'a@b.co', { redirectTo: 'http://localhost' }]);

    const html = page.innerHTML;
    expect(html).toContain('Check your email');
    expect(html).toContain('a reset link is on its way');
    expect(html).toContain('a@b.co');
    expect(html).not.toContain('expires in an hour');
    expect(html).not.toContain('Open the link from the email');
    expect(html).not.toMatch(/—|&mdash;|night/i);
  });

  it('the forgot screen refuses an empty and a malformed address before the network', async () => {
    bridge.openAuth('forgot');
    const err = bridge.registry['auth-err'];

    bridge.registry['fg-email'].value = '';
    await bridge.authSubmit();
    expect(err.textContent).toBe('Fill in every field.');

    bridge.registry['fg-email'].value = 'nope';
    await bridge.authSubmit();
    expect(err.textContent).toBe("That email doesn't look right.");
    expect(bridge.supaCalls().length).toBe(0);
  });

  it("the sent screen's Resend asks for another reset link, not a signup link", async () => {
    bridge.openAuth('forgot');
    bridge.registry['fg-email'].value = 'a@b.co';
    bridge.supaNext('resetPasswordForEmail', { data: {}, error: null });
    await bridge.authSubmit();

    const btn = bridge.registry['auth-resend'];
    expect(btn.listeners.click.length).toBe(1);
    bridge.supaNext('resetPasswordForEmail', { data: {}, error: null });
    await btn.listeners.click[0]();
    expect(bridge.supaCalls().at(-1)).toEqual(['resetPasswordForEmail', 'a@b.co', { redirectTo: 'http://localhost' }]);
    expect(bridge.supaCalls().some((c) => c[0] === 'resend')).toBe(false);
  });

  it('a PASSWORD_RECOVERY event opens #reset-page even for a device that was already signed in, without closing anything else', async () => {
    const page = await recover();
    expect(page).toBeTruthy();
    expect(page.innerHTML).toContain('Set a new password');
    expect(page.innerHTML).toContain('For <span class="au-em">a@b.co</span>');
    expect(page.innerHTML).toContain('Save password');
    // No back control: the only ways off this screen are a saved password or a reload.
    expect(page.innerHTML).not.toContain('auth-back');
    // The session is KEPT (updateUser needs it) and the heavy sign-in path is NOT run on a recovery.
    expect(bridge.getState().authSession).toBeTruthy();
    expect(bridge.getState().account.email).toBe('a@b.co');
    expect(bridge.postSignInRuns()).toBe(0);
    expect(bridge.supaCalls().length).toBe(0);
    // The branch is worthless unless the extracted listener is the one actually registered.
    expect(appSrc).toContain('onAuthStateChange(onAuthEvent)');
  });

  it('the reset screen refuses a mismatch and a short password before calling updateUser, then shows done and runs the post-sign-in work', async () => {
    const page = await recover();
    const err = bridge.registry['reset-err'];

    await bridge.resetSave();
    expect(err.textContent).toBe('Fill in every field.');

    bridge.registry['rs-new'].value = 'short1';
    bridge.registry['rs-again'].value = 'short1';
    await bridge.resetSave();
    expect(err.textContent).toBe('Your new password needs at least 8 characters.');

    bridge.registry['rs-new'].value = 'Passw0rd!';
    bridge.registry['rs-again'].value = 'Passw0rd?';
    await bridge.resetSave();
    expect(err.textContent).toBe("Those two passwords don't match.");
    expect(bridge.supaCalls().length).toBe(0);

    bridge.registry['rs-again'].value = 'Passw0rd!';
    bridge.supaNext('updateUser', { data: {}, error: null });
    await bridge.resetSave();
    expect(bridge.supaCalls().at(-1)).toEqual(['updateUser', { password: 'Passw0rd!' }]);
    expect(page.innerHTML).toContain('au-mark is-ok');
    expect(page.innerHTML).toContain('Password changed');
    expect(page.innerHTML).toContain("You're signed in.");
    expect(page.innerHTML).toContain('Go to the tournament');
    expect(page.innerHTML).not.toMatch(/—|&mdash;|night/i);
    expect(bridge.postSignInRuns()).toBe(1);
  });

  it('a failed updateUser keeps the form and says why', async () => {
    await recover();
    bridge.registry['rs-new'].value = 'Passw0rd!';
    bridge.registry['rs-again'].value = 'Passw0rd!';
    bridge.supaNext('updateUser', { data: null, error: { message: 'Password should be at least 6 characters.' } });
    await bridge.resetSave();
    expect(bridge.registry['reset-err'].textContent).toBe('Your password needs at least 8 characters.');
    expect(bridge.registry['reset-save'].disabled).toBe(false);
    expect(bridge.registry['reset-page'].innerHTML).not.toContain('Password changed');
    expect(bridge.postSignInRuns()).toBe(0);
  });

  it('a fresh device that gets SIGNED_IN before PASSWORD_RECOVERY lands on ONE reset screen and never runs the sign-in path', async () => {
    // The real ordering on a device with no prior session: supabase-js consumes `#...&type=recovery`,
    // emits SIGNED_IN, then PASSWORD_RECOVERY. Gating on the second event alone let the first one run
    // the whole sign-in path and stack the name prompt over the reset screen (review, fix round 1).
    bridge.setSignedOut();
    bridge.setRecoveryPending(true);   // what the fragment sets at module load
    const session = { user: { id: 'u1', email: 'a@b.co' } };

    await bridge.authEvent('SIGNED_IN', session);
    await bridge.flushTimers();
    const page = bridge.registry['reset-page'];
    expect(page).toBeTruthy();
    expect(bridge.postSignInRuns()).toBe(0);
    expect(bridge.registry['namefill-page']).toBeFalsy();

    await bridge.authEvent('PASSWORD_RECOVERY', session);
    await bridge.flushTimers();
    // The SAME element: a rebuild would wipe whatever is already typed into it.
    expect(bridge.registry['reset-page']).toBe(page);
    expect(bridge.postSignInRuns()).toBe(0);
    expect(bridge.registry['namefill-page']).toBeFalsy();

    // The heavy work runs once, on the far side of the save, and the flag stops routing after that.
    bridge.registry['rs-new'].value = 'Passw0rd!';
    bridge.registry['rs-again'].value = 'Passw0rd!';
    bridge.supaNext('updateUser', { data: {}, error: null });
    await bridge.resetSave();
    expect(bridge.postSignInRuns()).toBe(1);
    expect(bridge.recoveryPending()).toBe(false);
  });

  it('the reverse order (PASSWORD_RECOVERY first) routes the trailing SIGNED_IN to the same screen', async () => {
    bridge.setSignedOut();
    const session = { user: { id: 'u1', email: 'a@b.co' } };
    await bridge.authEvent('PASSWORD_RECOVERY', session);
    await bridge.flushTimers();
    const page = bridge.registry['reset-page'];
    expect(page).toBeTruthy();
    expect(bridge.recoveryPending()).toBe(true);   // latched by whichever event arrives first

    await bridge.authEvent('SIGNED_IN', session);
    await bridge.flushTimers();
    expect(bridge.registry['reset-page']).toBe(page);
    expect(bridge.postSignInRuns()).toBe(0);
    expect(bridge.registry['namefill-page']).toBeFalsy();
  });

  it('a plain SIGNED_IN with no recovery pending still runs the sign-in path', async () => {
    bridge.setSignedOut();
    await bridge.authEvent('SIGNED_IN', { user: { id: 'u1', email: 'a@b.co' } });
    await bridge.flushTimers();
    expect(bridge.registry['reset-page']).toBeFalsy();
    expect(bridge.postSignInRuns()).toBe(1);
  });

  it('signing out drops a pending recovery so the next sign-in is a plain one', async () => {
    bridge.setRecoveryPending(true);
    await bridge.authEvent('SIGNED_OUT', null);
    expect(bridge.recoveryPending()).toBe(false);
  });

  it('the chevron walks back a step on the forgot screens and still closes the overlay on sign-in', async () => {
    bridge.openAuth('forgot');
    expect(bridge.registry['auth-page'].innerHTML).toContain('aria-label="Back to sign in"');
    bridge.registry['auth-back'].listeners.click[0]();
    expect(bridge.registry['auth-page'].innerHTML).toContain('Sign in to claim your team and follow your games.');

    // forgot-sent walks back to the forgot form, the way the design drew its chevron.
    bridge.openAuth('forgot');
    bridge.registry['fg-email'].value = 'a@b.co';
    bridge.supaNext('resetPasswordForEmail', { data: {}, error: null });
    await bridge.authSubmit();
    expect(bridge.registry['auth-page'].innerHTML).toContain('aria-label="Back"');
    bridge.registry['auth-back'].listeners.click[0]();
    expect(bridge.registry['auth-page'].innerHTML).toContain('Send reset link');

    // Sign-in's chevron is still the exit, and it still abandons a pending claim.
    bridge.openAuth('signin');
    bridge.setClaimIntent(true);
    expect(bridge.registry['auth-page'].innerHTML).toContain('aria-label="Close sign in"');
    bridge.registry['auth-back'].listeners.click[0]();
    expect(bridge.registry['auth-page']).toBeFalsy();
    expect(bridge.getClaimIntent()).toBe(false);
  });

  it('the reset path never trims the password', async () => {
    await recover();
    const typed = '12345678 ';   // nine characters; the last one is a space somebody chose
    bridge.registry['rs-new'].value = typed;
    bridge.registry['rs-again'].value = typed;
    bridge.supaNext('updateUser', { data: {}, error: null });
    await bridge.resetSave();
    expect(bridge.supaCalls().at(-1)).toEqual(['updateUser', { password: typed }]);
  });
});
