// Auto-attach after registration (Mike, 2026-08-04):
//   "after you register, the 'claim your spot on ...' does not work. also i dont even like how
//    it is. if i am logged into the app A.S knows who i am and should automatically attach me
//    to me, its the same first and last name."
//
// WHAT WAS ACTUALLY WRONG. Nothing server-side. `connect_profile_by_name` (migration 0053)
// already links EVERY unclaimed exact-name match across BOTH worlds - `tournament_players` and
// the pickup `players` roster - idempotently, in one SECURITY DEFINER call. The defect was
// purely WHEN the client called it: `promptNameFillIfNeeded` fires it once per session at
// sign-in and latches `identityConnectAttempted`, which is strictly BEFORE the registration
// that creates the roster row. So it always ran with nothing to find, never ran again, and the
// user was left staring at a "Claim your spot on X" tap for a row the app could have matched
// by name on its own.
//
// These tests pin the fix at the seam that broke: the connect fires AFTER the register write,
// and the success screen only claims attachment when the server says a row was actually linked.
// Duplicate names are deliberately NOT defended against - Mike: "dont worry about duplicated no
// one has both the same first and last names." The RPC still reports `collision` when a
// same-name row belongs to SOMEONE ELSE, and that path is untouched.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// `linked` is what connect_profile_by_name reports back (tournament_linked > 0 = attached).
// `rpcThrows` proves a failed link never costs the user their registration.
function loadApp({ linked = 1, rpcThrows = false, signedIn = true, named = true } = {}) {
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
    readyState: 'loading',
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => emptyList,
    createElement: () => makeEl(), createDocumentFragment: () => makeEl(),
    addEventListener: noop, removeEventListener: noop,
    head: makeEl(), body: makeEl(), documentElement: makeEl(),
  };
  const rpcCalls = [];
  const client = {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: noop } } }),
      getSession: async () => ({ data: { session: null } }),
      getUser: async () => ({ data: { user: null } }),
    },
    channel: () => ({ on: () => ({ subscribe: noop }) }),
    removeChannel: noop,
    async rpc(name, args) {
      rpcCalls.push({ name, args });
      if (name === 'connect_profile_by_name') {
        if (rpcThrows) return { data: null, error: { message: 'simulated connect failure' } };
        return { data: { tournament_linked: linked, pickup_claimed: 0, collision: false }, error: null };
      }
      return { data: null, error: null };
    },
    from() {
      const chain = {
        delete: () => chain, update: () => chain, insert: () => chain, upsert: () => chain,
        select: () => chain, eq: () => chain, in: () => chain, order: () => chain,
        limit: () => chain, single: () => chain, maybeSingle: () => chain,
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
  const sandbox = {
    window: windowStub, document: documentStub,
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop, clear: noop, key: () => null, length: 0 },
    navigator: windowStub.navigator, location: windowStub.location,
    requestAnimationFrame: noop, cancelAnimationFrame: noop,
    setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop,
    console, SUPABASE_URL: 'http://localhost', SUPABASE_KEY: 'anon',
  };
  sandbox.globalThis = sandbox; sandbox.self = sandbox;

  const epilogue = `
    ;globalThis.__bridge = {
      // Drive ONLY the post-write half of submitRegisterForm - the part this fix changed.
      // The register write itself is already covered elsewhere; re-driving it here would test
      // the stub, not the seam.
      attach: async () => {
        state.authSession = ${signedIn ? '{ user: { id: "u1" } }' : 'null'};
        accountName = ${named ? '{ first: "Jordan", last: "Reyes" }' : 'null'};
        regAutoAttached = false;
        if (state.authSession && accountName && accountName.first && accountName.last) {
          try {
            const res = await connectProfileByName(accountName.first, accountName.last);
            regAutoAttached = !!(res && Number(res.tournament_linked) > 0);
          } catch (err) { /* swallowed by design - the team IS registered */ }
        }
        return regAutoAttached;
      },
      successHTML: (team, attached) => { regAutoAttached = attached; return buildRegisterSuccessHTML(team); },
    };
  `;
  vm.createContext(sandbox);
  vm.runInContext(pureSrc + '\n' + appSrc + epilogue, sandbox, { filename: 'app.js' });
  return { bridge: sandbox.__bridge, rpcCalls };
}

// ⚠ HONEST COVERAGE NOTE - read before trusting a green run here.
// `submitRegisterForm` needs a live DOM (form fields, the container swap), so the bridge below
// drives the post-write half rather than the real function. Measured: against the pre-fix
// app.js only ONE of these tests failed - the success-screen branch, which calls the real
// `buildRegisterSuccessHTML`. The others exercise the real `connectProfileByName` and its RPC
// contract, but the GATE around it is duplicated in the bridge, so they cannot catch someone
// deleting the call from `submitRegisterForm`. The seam test immediately below closes exactly
// that hole, and it is a source assertion on purpose: it is the only thing that fails if the
// call is removed.
describe('the seam that actually broke: the connect runs AFTER the register write', () => {
  it('submitRegisterForm calls connectProfileByName after tdbRegisterTeam, not before', () => {
    const src = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
    const fn = src.slice(src.indexOf('async function submitRegisterForm'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    const write = body.indexOf('tdbRegisterTeam(');
    const connect = body.indexOf('connectProfileByName(');
    expect(write).toBeGreaterThan(-1);
    // The whole bug was ordering: the sign-in-time call ran BEFORE any roster row existed.
    expect(connect).toBeGreaterThan(write);
    // And it must not be GATED behind the once-per-session latch that caused the defect.
    // Checked against code with comments stripped - the explanation above the call names the
    // latch on purpose, and an assertion that reads prose would fail on its own documentation.
    const code = body.replace(/\/\/[^\n]*/g, '');
    expect(code).not.toContain('identityConnectAttempted');
  });
});

describe('auto-attach after registering (the claim tap this replaces)', () => {
  it('fires connect_profile_by_name with the signed-in name and reports attached', async () => {
    const { bridge, rpcCalls } = loadApp({ linked: 1 });
    const attached = await bridge.attach();
    expect(attached).toBe(true);
    const call = rpcCalls.find((c) => c.name === 'connect_profile_by_name');
    expect(call).toBeTruthy();
    expect(call.args).toEqual({ p_first: 'Jordan', p_last: 'Reyes' });
  });

  it('does NOT claim attachment when the server linked nothing', async () => {
    // The name on the roster did not match the account name. Saying "you're on the roster"
    // here would be the exact lie this project rates worst.
    const { bridge } = loadApp({ linked: 0 });
    expect(await bridge.attach()).toBe(false);
  });

  it('never fires for a signed-out registrant', async () => {
    const { bridge, rpcCalls } = loadApp({ signedIn: false });
    expect(await bridge.attach()).toBe(false);
    expect(rpcCalls.some((c) => c.name === 'connect_profile_by_name')).toBe(false);
  });

  it('never fires when the account has no first+last name to match on', async () => {
    const { bridge, rpcCalls } = loadApp({ named: false });
    expect(await bridge.attach()).toBe(false);
    expect(rpcCalls.some((c) => c.name === 'connect_profile_by_name')).toBe(false);
  });

  it('a failed link never costs the registration - it degrades to the manual claim', async () => {
    const { bridge } = loadApp({ rpcThrows: true });
    expect(await bridge.attach()).toBe(false); // no throw escaped
  });
});

describe('the success screen tells the truth about what happened', () => {
  it('attached: points at My Team and does NOT ask for a claim', () => {
    const { bridge } = loadApp();
    const html = bridge.successHTML('Net Gains', true);
    expect(html).toContain("You're on the roster");
    expect(html).toContain('data-nav-tab="myteam"');
    expect(html).not.toContain('reg-page-claim');
    expect(html).not.toContain('Claim your spot');
  });

  it('not attached: keeps the manual claim affordance as the fallback', () => {
    const { bridge } = loadApp();
    const html = bridge.successHTML('Net Gains', false);
    expect(html).toContain('reg-page-claim');
    expect(html).toContain('Claim your spot on Net Gains');
    expect(html).not.toContain("You're on the roster");
  });

  it('escapes the team name in both branches', () => {
    const { bridge } = loadApp();
    const nasty = '<img src=x onerror=alert(1)>';
    expect(bridge.successHTML(nasty, false)).not.toContain('<img src=x');
    expect(bridge.successHTML(nasty, true)).not.toContain('<img src=x');
  });

  it('carries no em dash in either branch (AS copy law)', () => {
    const { bridge } = loadApp();
    expect(bridge.successHTML('Net Gains', true)).not.toContain('—');
    expect(bridge.successHTML('Net Gains', false)).not.toContain('—');
  });
});
