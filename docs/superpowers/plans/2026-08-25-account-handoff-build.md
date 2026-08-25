# Account Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. (This project's §38 rule: UI edits are executed INLINE by Fable unless Mike picks subagent-driven at the hand-back.)

**Goal:** Port Mike's Account handoff: the overlay wall with an exit, sign-in/sign-up polish (reveal, meter, 8 characters), forgot/reset with a recovery router, the account card as a navigation root with Name / Email / Password screens and a sign-out confirm, plus the dormant "Check your email" branch.

**Architecture:** Vanilla-JS SPA. Every auth surface is a body-appended `.auth-page` overlay (the `openNameFillOverlay` precedent) so `partialRender` never wipes it; four overlay ids (`#auth-page`, `#gate-page`, `#reset-page`, `#acct-page`); every Supabase Auth call awaited with a visible failure; one password-minimum constant. CSS appended under one banner. Tests are vm-sandbox string assertions with a document-stub upgrade that captures created overlays.

**Tech Stack:** vanilla JS, supabase-js 2.39.5 (`signUp`, `signInWithPassword`, `resend`, `resetPasswordForEmail`, `updateUser`, `signOut`, `onAuthStateChange`), vitest.

**Spec:** `docs/superpowers/specs/2026-08-25-account-handoff-design.md`

## Global Constraints

- `APP_VERSION` (near the top of `public/app.js`; grep `APP_VERSION`, it drifts every round) continues `'2026.08.25.N'` from `.15` (Task 1 = `.16`); a new local day restarts at `.1`.
- `node --check public/app.js && node --check public/pure.js` after every edit; commit + push per task; every chain gates on vitest's EXIT code.
- Line endings: `app.js` LF; `pure.js` + `styles.css` CRLF (count `\r\n` vs `\n` before and after). Never `git stash` a `public/` file.
- No em dashes; never "night"; no neon; skill never public; passwords never trimmed, logged, echoed or placed in `state`; a drive never types a real password; no Supabase write in a drive.
- New `!important` only as the four documented iOS counters (`.au-reveal` 13px, `.au-alt2` 13.5px, `.acc-out, .acc-close` 15px) with a PORT NOTE each; no wildcard motion selectors; PORT NOTEs on every ported block.
- Every `redirectTo` / `emailRedirectTo` is `location.origin`, and `flowType` stays the client default (implicit): the OAuth tokens come back in the URL fragment and `detectSessionInUrl` already consumes them.
- The design files: `docs/design-handoffs/2026-08-24/account/design/` (`_rounds.css:2306-2396` is the CSS; `screens/*.html` carry the markup — the PNGs are unusable).
- Test harness: `test/manage-round.test.js:11-127` (`loadApp()` + `__bridge`) with the document-stub upgrade defined in Task 1.

---

### Task 1: The auth page and the wall

**Files:**
- Modify: `public/pure.js` (add `passwordMeterScore`, export)
- Modify: `public/app.js` (`authMode` 6191; `openAuthPage` 6224; `renderAuthPageInner` 6234-6279; `friendlyAuthError` 6518; `onAuthSubmit` 6527-6570; `buildTournamentGateHTML` 3513; the `tn-signin` delegate 12796; the tournament tab branch 3705; the SIGNED_IN listener 13387; `activateMainTab`)
- Modify: `public/styles.css` (append the `ACCOUNT DESIGN ROUND - 2026-08-25` banner; retire `.tn-gate*` 2829-2835 and the desktop clamp 2923)
- Create: `test/account-round.test.js`

**Interfaces:**
- Produces: `AUTH_PASSWORD_MIN` (8); `openAuthPage(mode)` with `mode ∈ 'signin'|'signup'` (Task 2 adds `'forgot'`); `authMode ∈ 'signin'|'signup'|'signup-sent'` (Task 2 adds `'forgot'|'forgot-sent'`); `authFieldHTML(id, attrs, withMeter)`; `authMeterUpdate(inputEl)`; `authResend(kind)` with a shared cooldown; `openGatePage()` / `closeGatePage()`; pure `passwordMeterScore(v)`.
- Produces (test): the harness `installOverlayDom()` every later task reuses.

- [ ] **Step 1: Write the failing tests** — `test/account-round.test.js`. Copy `loadApp()` from `manage-round.test.js:11-127` (the whole epilogue), then extend the sandbox BEFORE `vm.createContext`:

```js
// Document-stub upgrade: created elements capture innerHTML, register by id, and answer querySelector
// for '#id' and for a small set of hook selectors the tests pre-register. Listeners are recorded so a test
// can fire them with a synthetic event.
function mkNode(tag) {
  const listeners = {};
  const node = {
    tagName: String(tag || 'div').toUpperCase(), id: '', className: '', hidden: false, disabled: false,
    value: '', type: '', textContent: '', dataset: {}, style: {}, attrs: {}, children: [], parent: null,
    _html: '', listeners,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'id') this.id = String(v); },
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    removeAttribute(k) { delete this.attrs[k]; },
    addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    removeEventListener() {}, focus() { this.focused = true; }, blur() {},
    appendChild(c) { this.children.push(c); c.parent = this; if (c.id) registry[c.id] = c; return c; },
    remove() { if (this.parent) this.parent.children = this.parent.children.filter((x) => x !== this); if (this.id) delete registry[this.id]; },
    querySelector(sel) { return resolve(sel, this); }, querySelectorAll(sel) { const r = resolve(sel, this); return r ? [r] : []; },
    closest(sel) { return matches(this, sel) ? this : (this.parent ? this.parent.closest(sel) : null); },
    contains() { return false },
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = String(v); this.children = []; },
  };
  return node;
}
const registry = {};                 // id -> node (body-appended overlays register their children lazily)
const hooks = {};                    // selector -> node, pre-registered per test via bridge.hook(sel, node)
function matches(node, sel) { if (sel.startsWith('#')) return node.id === sel.slice(1); return hooks[sel] === node; }
function resolve(sel, scope) {
  if (sel.startsWith('#')) return registry[sel.slice(1)] || null;
  return hooks[sel] || null;
}
```
Wire it: `documentStub.createElement = (tag) => mkNode(tag)`, `documentStub.getElementById = (id) => registry[id] || null`, `documentStub.querySelector = (sel) => resolve(sel)`, `documentStub.body = mkNode('body')` (its `appendChild` registers the overlay by id), and expose on the bridge: `doc`, `registry`, `hook: (sel, node) => { hooks[sel] = node; }`, `reset: () => { for (const k in registry) delete registry[k]; for (const k in hooks) delete hooks[k]; }`, `node: mkNode`, plus the supa stub recorders: `auth.signUp`, `auth.signInWithPassword`, `auth.resend`, `auth.resetPasswordForEmail`, `auth.updateUser`, `auth.signOut` each `async (...a) => { calls.push([name, ...a]); return next(name); }` with `bridge.supaNext(name, value)` to script the next response and `bridge.supaCalls()`.

Cases (each `beforeEach(() => bridge.reset())`):

```js
it('passwordMeterScore measures length and variety and never says Strong', () => {
  const s = bridge.meter;   // pure passwordMeterScore
  expect(s('')).toEqual({ score: 0, label: '' });
  expect(s('abc')).toEqual({ score: 1, label: 'Too short' });
  expect(s('password')).toEqual({ score: 2, label: 'OK' });
  expect(s('Passw0rd!')).toEqual({ score: 3, label: 'Good' });
  expect(s('aaaaaaaaaaa1')).toEqual({ score: 3, label: 'Good' });
  expect(JSON.stringify(s('Passw0rd!'))).not.toMatch(/Strong/);
});
it('create account renders the reveal, the meter, required, the 8-character placeholder and its own sub-line', () => {
  bridge.openAuth('signup'); const html = bridge.registry['auth-page'].innerHTML;
  expect(html).toContain('class="au-field"'); expect(html).toContain('data-reveal="auth-pass"');
  expect(html).toContain('class="au-strength" data-sbox'); expect(count(html, ' required')).toBe(4);
  expect(html).toContain('placeholder="At least 8 characters"');
  expect(html).toContain('One account for every tournament you play.');
  expect(html).not.toMatch(/—|&mdash;|night/i);
});
it('sign in renders no meter and keeps its sub-line', () => {
  bridge.openAuth('signin'); const html = bridge.registry['auth-page'].innerHTML;
  expect(html).not.toContain('au-strength'); expect(html).toContain('Sign in to claim your team and follow your games.');
  expect(html).toContain('data-reveal="auth-pass"');
});
it('AUTH_PASSWORD_MIN is the only place 8 lives', () => {
  expect(appSrc).toContain("const AUTH_PASSWORD_MIN = 8");
  expect(appSrc).not.toContain('password.length < 6'); expect(appSrc).not.toContain('at least 6 characters');
});
it('submit: empties, a bad email, a short password, each with the design copy and no network call', async () => { /* install #auth-email/#auth-pass/#auth-err/#auth-submit nodes via bridge.node + registry; call bridge.authSubmit() three times; assert err text and supaCalls().length === 0 */ });
it('a no-session signup renders the sent screen; Resend awaits the stub, shows its error, then cools down', async () => { /* supaNext('signUp', { data: { user: {}, session: null }, error: null }); submit valid; assert innerHTML has au-mark is-mail, "Check your email", the address; supaNext('resend', { error: { message: 'over rate limit' } }); fire the resend handler; assert .auth-err text contains 'try again' and the button disabled */ });
it('signUp and resend carry emailRedirectTo = the origin', async () => { /* assert the recorded call options.emailRedirectTo === 'http://localhost' (the sandbox origin) */ });
it('the wall is an overlay with a back control and its alt opens the sign-up form', () => {
  bridge.setSignedOut(); bridge.openGate(); const html = bridge.registry['gate-page'].innerHTML;
  expect(html).toContain('Sign in to see the tournament'); expect(html).toContain('class="auth-back"');
  expect(html).toContain('data-auth-view="signup"'); expect(html).not.toContain('Pools, bracket, scores');
  expect(appSrc).not.toContain('tn-gate-cta'); expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toContain('.tn-gate');
});
it('the CSS block ships once with exactly the documented counters and no banner family', () => {
  for (const sel of ['.au-field {', '.au-reveal {', '.au-strength {', '.au-mark {', '.au-alt2 {']) expect(count(css, sel)).toBe(1);
  expect(count(css, '.vb')).toBe(0); expect(css).not.toContain('.au-center');
  expect(css).toMatch(/\.au-reveal \{[^}]*font-size: 13px !important/);
});
```

- [ ] **Step 2: Run to verify it fails** — `cd test && npx vitest run account-round`.

- [ ] **Step 3: Implement — pure.js**

```js
// Password meter (Account handoff 2026-08-24, honest labels): what is MEASURED is length and character
// variety, so the labels say that and never "Strong". 0 empty · 1 under the minimum · 2 at the minimum
// with fewer than three kinds · 3 three kinds, or twelve+ characters with two.
function passwordMeterScore(v) {
  const s = String(v == null ? '' : v);
  if (!s.length) return { score: 0, label: '' };
  if (s.length < 8) return { score: 1, label: 'Too short' };
  let kinds = 0;
  if (/[a-z]/.test(s)) kinds++; if (/[A-Z]/.test(s)) kinds++; if (/[0-9]/.test(s)) kinds++; if (/[^A-Za-z0-9]/.test(s)) kinds++;
  if (kinds >= 3 || (s.length >= 12 && kinds >= 2)) return { score: 3, label: 'Good' };
  return { score: 2, label: 'OK' };
}
```

- [ ] **Step 4: Implement — app.js**

Near `authMode`:
```js
let authMode = 'signin';                 // 'signin' | 'signup' | 'signup-sent' (Task 2: 'forgot' | 'forgot-sent')
const AUTH_PASSWORD_MIN = 8;             // Mike 2026-08-25: one number for sign-up, reset and change (server minimum is 6)
let authSentEmail = '';                  // the address a sent screen resends to (memory only; a reload loses it)
let authResendUntil = 0;                 // cooldown deadline (ms) shared by every Resend control
```
`openAuthPage(mode)`: `authMode = mode === 'signup' ? 'signup' : 'signin';` (Task 2 extends).

Field helper + meter + reveal (add above `renderAuthPageInner`):
```js
function authFieldHTML(id, attrs, withMeter) {
  return `<div class="au-field"><input class="auth-input" id="${id}" type="password" required ${attrs} />`
    + `<button type="button" class="au-reveal" data-reveal="${id}" aria-pressed="false">Show</button></div>`
    + (withMeter ? `<div class="au-strength" data-sbox><span class="au-sbar"><span class="au-sfill"></span></span><span class="au-slab"></span></div>` : '');
}
function authMeterUpdate(input) {
  const box = input && input.form ? input.form.querySelector('[data-sbox]') : null;
  if (!box) return;
  const m = passwordMeterScore(input.value);
  box.classList.remove('is-1', 'is-2', 'is-3'); if (m.score) box.classList.add('is-' + m.score);
  const lab = box.querySelector('.au-slab'); if (lab) lab.textContent = m.label;
}
function authBindOverlay(el) { // shared by every overlay: the reveal control + the meter
  el.addEventListener('click', (ev) => {
    const r = ev.target.closest('[data-reveal]'); if (!r) return;
    const inp = el.querySelector('#' + r.getAttribute('data-reveal')); if (!inp) return;
    const hidden = inp.type === 'password'; inp.type = hidden ? 'text' : 'password';
    r.textContent = hidden ? 'Hide' : 'Show'; r.setAttribute('aria-pressed', hidden ? 'true' : 'false');
  });
  el.addEventListener('input', (ev) => { if (ev.target && ev.target.hasAttribute && ev.target.hasAttribute('data-strength')) authMeterUpdate(ev.target); });
}
```
`renderAuthPageInner`: add `const sent = authMode === 'signup-sent';` and a `sent` branch rendering (inside `.auth-inner`): `<div class="au-mark is-mail">…mail svg…</div><h2 class="auth-title">Check your email</h2><p class="auth-sub">We sent a link to <span class="au-em">${escapeHTML(authSentEmail)}</span>. Tap it, then sign in.</p><div class="auth-err" id="auth-err" role="alert" hidden></div><button type="button" class="auth-alt" id="auth-resend">Didn't get it? Resend</button><button type="button" class="au-alt2" id="auth-alt">Back to sign in</button>` (its `#auth-alt` sets `authMode='signin'`); the form branch: title/sub per mode (`signup` sub "One account for every tournament you play."), `required` on the four inputs, the password via `authFieldHTML('auth-pass', \`autocomplete="${signup ? 'new-password' : 'current-password'}" placeholder="${signup ? 'At least ' + AUTH_PASSWORD_MIN + ' characters' : 'Your password'}"${signup ? ' data-strength' : ''}\`, signup)`; call `authBindOverlay(el)` once after `innerHTML`.

`onAuthSubmit`: replace the two client checks:
```js
  if (!email || !password || (signup && (!(firstEl && firstEl.value.trim()) || !(lastEl && lastEl.value.trim())))) { showErr('Fill in every field.'); return; }
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(email)) { showErr("That email doesn't look right."); return; }
  if (signup && password.length < AUTH_PASSWORD_MIN) { showErr('Your password needs at least ' + AUTH_PASSWORD_MIN + ' characters.'); return; }
```
(keep the name rule after), `signUp` options gain `emailRedirectTo: location.origin`, the no-session branch becomes `authSentEmail = email; authMode = 'signup-sent'; renderAuthPageInner(); return;`, `friendlyAuthError`'s 6 → `AUTH_PASSWORD_MIN`.

`authResend(kind)`:
```js
async function authResend(kind, emailOverride) {
  const btn = document.getElementById(kind === 'email_change' ? 'acct-resend' : 'auth-resend');
  const err = document.getElementById(kind === 'email_change' ? 'acct-err' : 'auth-err');
  const note = (m) => { if (err) { err.textContent = m; err.hidden = !m; } };
  if (Date.now() < authResendUntil) { note('Give it a minute, then try again.'); return; }
  const email = emailOverride || authSentEmail; if (!email || !supabaseClient) return;
  if (btn) btn.disabled = true;
  try {
    const res = kind === 'reset'
      ? await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: location.origin })
      : await supabaseClient.auth.resend({ type: kind, email, options: { emailRedirectTo: location.origin } });
    if (res && res.error) { note(/rate|limit/i.test(res.error.message || '') ? 'Too many emails just now. Wait a minute, then try again.' : 'That did not send. Check the connection and try again.'); if (btn) btn.disabled = false; return; }
    note(''); authResendUntil = Date.now() + 60000; if (btn) btn.textContent = 'Sent again';
    setTimeout(() => { if (btn) { btn.disabled = false; } }, 60000);
  } catch (_) { note('That did not send. Check the connection and try again.'); if (btn) btn.disabled = false; }
}
```
The wall:
```js
function closeGatePage() { const el = document.getElementById('gate-page'); if (el) el.remove(); }
function openGatePage() {
  if (state.authSession || document.getElementById('gate-page')) return;
  const el = document.createElement('div'); el.id = 'gate-page'; el.className = 'auth-page';
  el.innerHTML = `<button type="button" class="auth-back" data-gate-back aria-label="Back to Home">${PK_BACK_SVG}</button>
    <div class="auth-inner"><div class="auth-brand"><img class="auth-logo" src="logo-mark.png" alt="Athletic Specimen" /><div class="auth-wm"><div class="auth-wm-1">ATHLETIC SPECIMEN</div><div class="auth-wm-2">COLORADO</div></div></div>
      <h2 class="auth-title">Sign in to see the tournament</h2>
      <p class="auth-sub">Your team, your games and your bracket run are for players. Takes a minute.</p>
      <button type="button" class="auth-submit" data-auth-view="signin">Sign in</button>
      <button type="button" class="auth-alt" data-auth-view="signup">New here? Create an account</button></div>`;
  document.body.appendChild(el);
  el.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-gate-back]')) { closeGatePage(); activateMainTab('home'); return; }
    const v = ev.target.closest('[data-auth-view]'); if (v) openAuthPage(v.getAttribute('data-auth-view'));
  });
}
```
`buildTournamentGateHTML` → `return '<div class="tn-gate-slot" aria-hidden="true"></div>';` and the tab branch keeps calling it; `activateMainTab(tab)`: after the panel switch, `if (tab === 'tournament' && !state.authSession && !['register', 'rules'].includes(pdTournamentView)) openGatePage(); else closeGatePage();`; the boot paint path that restores the tab does the same once; the listener's SIGNED_IN branch calls `closeGatePage()` beside `closeAuthPage()`; the `[data-role="tn-signin"]` delegate stays for any old hook. `APP_VERSION = '2026.08.25.16'`.

- [ ] **Step 5: CSS** — append the banner `/* ===== ACCOUNT DESIGN ROUND - 2026-08-25 (Mike's Claude Design handoff, "Account") ===== */` then `_rounds.css:2314-2348` (skip 2313 `.au-center`), with: `.au-reveal { … font-size: 13px !important; /* PORT NOTE: counters prod's button { font-size: 16px !important } iOS guard; the design's 12.5px sits under the handoff's own 13px floor */ padding: 12px 2px; min-height: 44px; }` (the 44px tap box; keep `bottom: 7px` → adjust to `bottom: -4px` so the text baseline stays where the design drew it — verify in the drive), `.au-sfill { transition: width var(--m-state) var(--e-settle), background-color var(--m-state) var(--e-settle); }`, `.au-alt2 { font-size: 13.5px !important; /* PORT NOTE: iOS counter */ }`. Delete `styles.css:2829-2835` and `2923` with a one-line PORT NOTE each. Amend `--warn`'s comment at line 18 to "amber — admin cautions and the password meter's middle step".

- [ ] **Step 6: Run the suite, commit + push** — `feat(account): the auth page - Show/Hide, an honest strength meter, 8 characters, the design's error copy, the sent screen with a real Resend, the wall as an overlay with an exit - v2026.08.25.16`

---

### Task 2: Forgot / reset and the recovery router

**Files:**
- Modify: `public/app.js` (`renderAuthPageInner` modes `forgot` / `forgot-sent` + the `.au-alt2` link on sign-in; `openResetPage` / `closeResetPage` / `onResetSave`; the listener 13371-13432: a `PASSWORD_RECOVERY` branch above `isNewSignIn` and the deferred block extracted into `runPostSignInWork()`)
- Modify: `test/account-round.test.js`

**Interfaces:** Produces `runPostSignInWork()` (the deferred role/tournaments/claimed/name-fill block, callable from the reset-done path); `openResetPage(session)`; `authMode` gains `'forgot' | 'forgot-sent'`; `openAuthPage('forgot')`.

- [ ] **Step 1: Tests**
```js
it('sign in carries the forgot link; the forgot screen asks Supabase with the root redirectTo and renders the sent screen', async () => {
  bridge.openAuth('signin'); expect(bridge.registry['auth-page'].innerHTML).toContain('data-auth-view="forgot"');
  bridge.openAuth('forgot'); expect(bridge.registry['auth-page'].innerHTML).toContain('Send reset link');
  /* install #fg-email with a value; supaNext('resetPasswordForEmail', { data: {}, error: null }); fire submit */
  expect(bridge.supaCalls().at(-1)).toEqual(['resetPasswordForEmail', 'a@b.co', { redirectTo: 'http://localhost' }]);
  const html = bridge.registry['auth-page'].innerHTML;
  expect(html).toContain('a reset link is on its way'); expect(html).not.toContain('expires in an hour'); expect(html).not.toContain('Open the link from the email');
});
it('a PASSWORD_RECOVERY event opens #reset-page even for a device that was already signed in, without closing anything else', async () => {
  bridge.setSignedIn({ id: 'u1', email: 'a@b.co' }); await bridge.authEvent('PASSWORD_RECOVERY', { user: { id: 'u1', email: 'a@b.co' } });
  await bridge.flushTimers(); expect(bridge.registry['reset-page']).toBeTruthy();
  expect(bridge.registry['reset-page'].innerHTML).toContain('For <span class="au-em">a@b.co</span>');
  expect(bridge.registry['reset-page'].innerHTML).not.toContain('auth-back');
});
it('the reset screen refuses a mismatch and a short password before calling updateUser, then shows done and runs the post-sign-in work', async () => { /* install #rs-new/#rs-again/#reset-err; submit short → copy; mismatch → "Those two passwords don't match."; valid → supaCalls has ['updateUser', { password }]; done html has "Password changed" and "You're signed in."; bridge.postSignInRuns() === 1 */ });
it('the reset path never trims the password', async () => { /* '12345678 ' (nine with a space) is sent untouched */ });
```
- [ ] **Step 2: Implement** — `renderAuthPageInner`: `forgot` (back → signin; "Reset your password" / "Enter your email and we'll send a link to set a new one." / `#fg-email` required / "Send reset link" / `.auth-alt` "Back to sign in") and `forgot-sent` (mark, "Check your email", "If <span class="au-em">email</span> has an account, a reset link is on its way.", `#auth-err`, `#auth-resend` "Didn't get it? Resend" → `authResend('reset', authSentEmail)`, `.au-alt2` "Back to sign in"); the sign-in form gains `<button type="button" class="au-alt2" data-auth-view="forgot">Forgot your password?</button>` between submit and the toggle, handled by `el`'s click delegate → `authMode='forgot'; renderAuthPageInner()`. `onAuthSubmit` gets a `forgot` branch: validate email shape → `resetPasswordForEmail(email, { redirectTo: location.origin })` → on error the mapped line; on success `authSentEmail = email; authMode = 'forgot-sent'; renderAuthPageInner()`.

Listener refactor: move the body of the `setTimeout(async () => { … }, 0)` at 13402-13431 into `async function runPostSignInWork() { … }` (identical body) and call `setTimeout(() => { void runPostSignInWork(); }, 0)` from the listener. Add, first thing inside `if (session) {`:
```js
      if (event === 'PASSWORD_RECOVERY') {
        // Account round 2026-08-25: a recovery link is NOT a sign-in. Keep the session (updateUser needs it),
        // never run the heavy path yet, and open the reset screen out-of-band (a DOM write is safe here;
        // no supabase call happens inside the callback).
        state.authSession = session; state.account = { id: session.user.id, email };
        setTimeout(() => { try { closeAuthPage(); closeGatePage(); openResetPage(session); } catch (_) {} }, 0);
        return;
      }
```
`openResetPage(session)` (the `openNameFillOverlay` shape, id `reset-page`, no back): "Set a new password" / "For <span class="au-em">email</span>." / `authFieldHTML('rs-new', 'data-min data-strength autocomplete="new-password" placeholder="At least 8 characters"', true)` / "Type it again" `#rs-again` / `#reset-err` / "Save password". `onResetSave`: empties → 'Fill in every field.'; `< AUTH_PASSWORD_MIN` → 'Your new password needs at least 8 characters.'; mismatch → "Those two passwords don't match."; `updateUser({ password })` (raw value) → error → `friendlyAuthError`; success → the overlay's done state (`.au-mark.is-ok`, "Password changed", "You're signed in.", `#reset-go` "Go to the tournament" → `closeResetPage(); activateMainTab('tournament')`) and `void runPostSignInWork()`. `APP_VERSION = '2026.08.25.17'`.
- [ ] **Step 3: Run, commit + push** — `feat(account): forgot and reset - the forgot screen, the sent screen, a recovery router above the sign-in gate, the reset screen with type-it-again, the post-sign-in work after a recovery - v2026.08.25.17`

---

### Task 3: The account card as a navigation root + the sign-out confirm

**Files:**
- Modify: `public/app.js` (`openAccountMenu` 6672-6717; `authInitial` 6800; the listener's `state.account` 13385; new `openAcctPage(view)` / `closeAcctPage()` / `renderAcctPageInner()` scaffold; `confirmSignOut()`)
- Modify: `public/styles.css` (append `_rounds.css:2351-2381` with the substitutions)
- Modify: `test/account-round.test.js`

**Interfaces:** Produces `acctView ∈ 'name'|'email'|'email-sent'|'password'`, `openAcctPage(view)`, `renderAcctPageInner()` with a `switch` Tasks 4-6 fill; `state.account.emailVerified`, `state.account.pendingEmail`; `authInitial()` from the name.

- [ ] **Step 1: Tests**
```js
it('the card: initial from the name, three rows, Pending tag only with a pending email, Sign out opens the confirm, Close dismisses in place', () => {
  bridge.setSignedIn({ id: 'u1', email: 'morgan@email.com', pendingEmail: null }, { first: 'Morgan', last: 'Blake' });
  bridge.openMenu(); const html = bridge.registry['account-menu'].innerHTML;
  expect(html).toContain('class="acc-av">M<'); expect(count(html, 'class="acc-row"')).toBe(3);
  expect(html).not.toContain('acc-tag'); expect(html).not.toContain('data-nav-tab="home"');
  bridge.setSignedIn({ id: 'u1', email: 'morgan@email.com', pendingEmail: 'm@work.com' }, { first: 'Morgan', last: 'Blake' });
  bridge.openMenu(); expect(bridge.registry['account-menu'].innerHTML).toContain('class="acc-tag">Pending<');
});
it('a row tears the card down and opens #acct-page; its back rebuilds the card', () => { /* fire the row click via the recorded listener with a synthetic target whose closest('[data-acct-view]') returns { getAttribute: () => 'name' }; expect registry['account-menu'] undefined and registry['acct-page'] defined; fire back → registry['account-menu'] defined */ });
it('Sign out asks first, then runs the optimistic sign-out', async () => { /* hook '#app-confirm-yes' → resolve; assert supaCalls includes ['signOut', { scope: 'local' }] only after confirm */ });
it('the initial falls back to the email when no name is cached', () => { /* accountName null → 'M' from morgan@ */ });
```
- [ ] **Step 2: Implement** — listener 13385: `state.account = { id: session.user.id, email, emailVerified: !!session.user.email_confirmed_at, pendingEmail: session.user.new_email || null };` (also in the recovery branch). `authInitial()`: `const n = accountName && accountName.first ? accountName.first : ((state.account && state.account.email) || ''); return (n.trim()[0] || '?').toUpperCase();`. `openAccountMenu` body:
```js
  const fullName = …(as today)…; const teamLine = roleLabel;
  el.innerHTML = '<div class="popup-card card acc-card" role="dialog" aria-modal="true">'
    + '<div class="acc-top"><div class="acc-av">' + escapeHTML(authInitial()) + '</div><div class="acc-who"><div class="acc-nm">' + escapeHTML(fullName || email) + '</div><div class="acc-sub">' + escapeHTML(teamLine) + '</div></div></div>'
    + '<div class="acc-list">'
    + accRow('name', 'Name', fullName || 'Add your name', '')
    + accRow('email', 'Email', email, state.account && state.account.pendingEmail ? '<span class="acc-tag">Pending</span>' : '')
    + accRow('password', 'Password', 'Change', '')
    + '</div><div class="acc-foot"><button type="button" class="acc-out" id="am-signout">Sign out</button><button type="button" class="acc-close" id="am-close">Close</button></div></div>';
```
with `function accRow(view, label, value, tag) { return '<button type="button" class="acc-row" data-acct-view="' + view + '"><span class="acc-rl">' + label + '</span><span class="acc-rv">' + escapeHTML(value) + '</span>' + tag + '<span class="acc-chev">' + MG_CHEV_SVG_INLINE + '</span></button>'; }` (reuse the chevron path from `MG_CHEV`). Handlers: `#am-close` and scrim tap remove (as today); `[data-acct-view]` → `el.remove(); openAcctPage(view)`; `#am-signout` → `el.remove(); confirmSignOut()` where `confirmSignOut` = `if (await appConfirm({ title: 'Sign out?', message: "You'll need your email and password to get back in.", confirmText: 'Sign out', danger: true })) { …the existing optimistic block… } else openAccountMenu();`. `openAcctPage(view)`: `acctView = view; closeAcctPage(); const el = document.createElement('div'); el.id = 'acct-page'; el.className = 'auth-page'; document.body.appendChild(el); renderAcctPageInner(); authBindOverlay(el);` with a `.auth-back` (`data-acct-back`) → `closeAcctPage(); openAccountMenu();` (email-sent's back goes to the card too — the design's "back to email" would re-enter a form whose password field is gone). `renderAcctPageInner` switch: Task 3 renders a placeholder title per view ("Your name" / "Change email" / "Change password") that Tasks 4-6 replace. `APP_VERSION = '2026.08.25.18'`.
- [ ] **Step 3: CSS** — `_rounds.css:2351-2381`: `.acc-row:active { background: var(--accent-soft); }` (drop `transform: none`, PORT NOTE: the shipped press-dip stays), `.acc-rv { … white-space: normal; overflow-wrap: anywhere; }`, `.acc-out, .acc-close { … font-size: 15px !important; /* PORT NOTE: iOS counter */ }`; retire the empty `.am-card` rule and `.am-avatar/.am-role` with a PORT NOTE (grep app.js for `am-` first).
- [ ] **Step 4: Run, commit + push** — `feat(account): the account card as a navigation root - name, email and password rows, the Pending tag, Sign out behind a confirm, one edit overlay - v2026.08.25.18`

---

### Task 4: Name

**Files:** `public/app.js` (`renderAcctPageInner` case 'name'; `onAcctNameSave`), `test/account-round.test.js`.

- [ ] **Step 1: Tests** — renders prefilled first/last from `accountName` and the sentence "This is what teammates and organizers see."; a one-letter part → `splitFullNameParts`'s message and no write; a valid save calls `from('profiles').update({ first_name, last_name, display_name: 'Morgan Blake' }).eq('id','u1').select('id')` (record the chain on the `from` stub), zero rows → the status line "That did not save. Check you are signed in, then try again." and no toast; one row → `accountName` updated, `makeSaveToast('Name saved')` recorded, the card reopened.
- [ ] **Step 2: Implement** — case 'name': `<form id="acct-form" novalidate autocomplete="on"><h2 class="auth-title">Your name</h2><p class="auth-sub">This is what teammates and organizers see.</p>` + first/last (`required`, prefilled, the sign-up attributes) + `#acct-err` + "Save". `onAcctNameSave`: `splitFullNameParts` → error; `const { data, error } = await supabaseClient.from('profiles').update({ first_name, last_name, display_name: first + ' ' + last }).eq('id', state.account.id).select('id'); if (error || !Array.isArray(data) || !data.length) { showErr(…); return; } accountName = { first, last }; closeAcctPage(); openAccountMenu(); settleSaveToast(makeSaveToast('Saving…'), true, 'Name saved');` (read `makeSaveToast`/`settleSaveToast` 5064-5078 for the exact contract). `APP_VERSION = '2026.08.25.19'`.
- [ ] **Step 3: Run, commit + push** — `feat(account): Your name - a plain profile update with a read-back, display_name kept in step - v2026.08.25.19`

---

### Task 5: Email + the pending screen

**Files:** `public/app.js` (cases 'email' and 'email-sent'; `onAcctEmailSave`; `authResend('email_change', …)`), `test/account-round.test.js`.

- [ ] **Step 1: Tests** — renders the current address in the sub-line, the new-email field, the password field with a reveal, the two-sentence note; empties / bad email copy with no call; a wrong password (`signInWithPassword` → error) → "That password is wrong." and no `updateUser`; a right one → `updateUser({ email: 'm@work.com' }, { emailRedirectTo: 'http://localhost' })` and the pending screen ("We sent a link to <span class="au-em">m@work.com</span>. Until you tap it, sign in with your old address.", "To keep your old address, just don't tap the link.", "Done", `#acct-resend`), no "Cancel this change"; Resend → `resend({ type: 'email_change', email: 'm@work.com', … })`; the password value is never placed on `state` (assert `JSON.stringify(state)` lacks it).
- [ ] **Step 2: Implement** — case 'email': "Change email" / "Right now it's <span class="au-em">email</span>." / `#ae-new` (email, required) / `#ae-pass` via `authFieldHTML('ae-pass', 'data-current autocomplete="current-password" placeholder="Current password"', false)` / `<p class="au-note">We ask for your password to be sure it's you. The new address has to be confirmed before it takes over.</p>` / `#acct-err` / "Send confirmation". `onAcctEmailSave`: validate; `const chk = await supabaseClient.auth.signInWithPassword({ email: state.account.email, password }); if (chk.error) { showErr('That password is wrong.'); return; } const res = await supabaseClient.auth.updateUser({ email: newEmail }, { emailRedirectTo: location.origin }); if (res.error) { showErr(/already/i.test(res.error.message || '') ? 'That email already has an account.' : friendlyAuthError(res.error)); return; } acctPendingEmail = newEmail; authSentEmail = newEmail; acctView = 'email-sent'; renderAcctPageInner();` and `state.account.pendingEmail = newEmail`. Case 'email-sent': mark, "Confirm your new email", the sentences, `#acct-err`, "Done" (→ card), `#acct-resend` "Resend the link" → `authResend('email_change', acctPendingEmail)`. `APP_VERSION = '2026.08.25.20'`.
- [ ] **Step 3: Run, commit + push** — `feat(account): Change email - a password check, updateUser with the root redirect, the pending screen with a real Resend and no cancel the API cannot honour - v2026.08.25.20`

---

### Task 6: Password

**Files:** `public/app.js` (case 'password'; `onAcctPasswordSave`), `test/account-round.test.js`.

- [ ] **Step 1: Tests** — renders current + new (meter) + type-it-again + "You stay signed in on this phone." + "Forgot your current one?"; the four refusals in order (empties, short, mismatch, same-as-current "Pick a password you haven't used here.") with no call; a wrong current → "That password is wrong."; a valid change → `updateUser({ password })`, `makeSaveToast` 'Password saved', the card reopened; the forgot link closes the page and opens `#auth-page` in `forgot` mode.
- [ ] **Step 2: Implement** — case 'password': "Change password" / "You stay signed in on this phone." / `#ap-cur` (reveal) / `#ap-new` (reveal + meter, `data-min`) / `#ap-again` "Type it again" / `#acct-err` / "Save password" / `.auth-alt` `data-auth-view="forgot"` "Forgot your current one?" → `closeAcctPage(); openAuthPage('forgot')`. `onAcctPasswordSave`: the four rules → `signInWithPassword` check → `updateUser({ password: next })` → toast, card. `APP_VERSION = '2026.08.25.21'`.
- [ ] **Step 3: Run, commit + push** — `feat(account): Change password - current-password check, type it again, never the same one, honest meter - v2026.08.25.21`

---

### Task 8: Continue with Google

> Sits BEFORE Task 7 on purpose: Task 7 is the round's single drive and its only vault write, so the
> Google button has to be in the bytes that drive looks at. Build order for the round is 4, 5, 6, 8, 7.

**Files:**
- Modify: `public/pure.js` (`splitFullName`, plus its `module.exports` entry)
- Modify: `public/app.js` (the `AUTH_*` const block beside `AUTH_MAIL_SVG` `:6203`; `authGoogleButtonHTML`
  beside `authFieldHTML` `:6265`; the `formInner` tail, between the submit at `:6357` and the forgot
  ternary at `:6358`; the per-paint id bind beside `#auth-alt` in `renderAuthPageInner` `:6375`; the
  claim-intent helpers immediately ABOVE `let claimIntent = false;` `:6395` and the boot call immediately
  BELOW it; the three clear sites `:6372`, `:7080`, `:7099`; `onGoogleSignIn` beside `onAuthSubmit`
  `:6665`; `nameFromSessionMetadata` beside `promptNameFillIfNeeded` `:6905`, the fall-through at `:6931`,
  and `openNameFillOverlay` `:6934`)
- Modify: `public/styles.css` (append `.au-google` and `.au-or` at the END of the file, inside the
  `ACCOUNT DESIGN ROUND - 2026-08-25` banner opened at `:6037`; the file ends at 6141 today)
- Modify: `test/account-round.test.js` (`AUTH_CONTROL_IDS`; `supaStub.auth`; the `from` stub; the
  `location` stub; the sandbox's two storages; the bridge epilogue; `bridge.reset`; a new `describe`
  block appended after the last one)
- Create: nothing.

Line numbers are from `a248410` and they drift with every task that lands before this one. GREP EACH ANCHOR
BY NAME and treat the number as a hint, never as the target.

**Interfaces:**
- Consumes (Tasks 1 to 3): `renderAuthPageInner`'s one `formInner` template, which already serves both
  `signin` and `signup` (the only per-mode differences in that tail are the two ternaries at `:6358` and
  `:6359`); its per-paint id binds (`#auth-alt` `:6375`, `#auth-resend` `:6381`) as the shape to copy; the
  `#auth-err` line every form state renders; `authBindOverlay`'s one-delegate-per-overlay rule (which is
  exactly what this task must NOT reuse); the `AUTH_*` const block; `closeGatePage`; and the harness names
  `bridge.reset` / `bridge.openAuth` / `bridge.supaNext` / `bridge.supaCalls` / `bridge.registry` /
  `bridge.flushTimers` / `bridge.getClaimIntent` / `bridge.setClaimIntent` / `bridge.nameFill` /
  `bridge.authEvent` / `bridge.setSignedIn` / `bridge.setSignedOut` / `bridge.getState`.
  `authFieldHTML` is the SHAPE the new markup helper copies (a plain string builder called from inside
  `formInner`), not a function this task calls.
- Produces (app): `AUTH_GOOGLE_SVG`, `AUTH_GOOGLE_LABEL` (`'Continue with Google'`),
  `AUTH_CLAIM_INTENT_KEY` (`'athletic_specimen_claim_intent'`), `authGoogleButtonHTML()`,
  `async function onGoogleSignIn()`, `authPersistClaimIntent()`, `authRestoreClaimIntent()`,
  `authForgetClaimIntent()`, `authClearClaimIntent()`, `nameFromSessionMetadata(session)`,
  `onAuthPageShow(event)` plus its module-scope `window.addEventListener('pageshow', onAuthPageShow)`, and
  `openNameFillOverlay(prefill)` gaining ONE optional argument (its other caller, the register success
  screen at `public/app.js:299`, passes nothing and is untouched).
- Produces (pure): `splitFullName(full)`.
- Produces (test): `bridge.session`, `bridge.assigns()`, `bridge.restoreClaimIntent()`,
  `bridge.getAccountName()`, `bridge.connectRuns()`, `bridge.resetConnects()`,
  `bridge.setConnectAttempted(v)`, `bridge.splitName(v)`, `bridge.pageshow(persisted)`, and
  `bridge.openAcct(view)` if the harness does not already expose one by the time this task runs.
- `onGoogleSignIn`, `onAuthPageShow`, `authPersistClaimIntent`, `authRestoreClaimIntent`,
  `authForgetClaimIntent`, `authClearClaimIntent` and `nameFromSessionMetadata` MUST be top level
  `function` declarations: the bridge
  epilogue is a template string concatenated onto `app.js` inside the same vm context, so it can only
  close over top level names.

**Mike's four calls (AskUserQuestion, 2026-08-25), which the steps below implement and may not drift from:**

1. **Screens.** The button appears on BOTH the sign-in and the create-account forms, with one string,
   "Continue with Google". Not on forgot, not on either sent screen, not on the wall, and never on a
   signed-in surface (`#acct-page`, the account card). The last part is not taste: `signInWithOAuth`'s
   first act is `await this._removeSession()` and that function notifies nobody
   (gotrue-js 2.62.2 `GoTrueClient.ts:516-517`, `:1951-1955`), so a signed-in person who taps it and then
   backs out at Google looks signed in until their next reload, when they are not (HAZARD H4).
2. **The name.** Keep the name-fill overlay, PREFILL it from the Google identity's
   `user_metadata.full_name` (fallback `name`), split on the LAST space, and let the person tap Save or
   fix the split. Nothing is claimed on a roster until they save. No migration, no silent seeding.
   Google sends no `given_name` and no `family_name` on either provider path
   (supabase/auth `internal/api/provider/google.go:13-22`, `:120-131` and `oidc.go:107-117`; contrast
   Azure at `oidc.go:251-256`, which does set them), so a last-space split is the only name available and
   it is a GUESS: "Mary Jo Van Der Berg" splits wrong. `connect_profile_by_name` links roster rows on an
   exact name match and inserts APPROVED `player_claims` (`db/migrations/0053_tournament_identity.sql:73-127`),
   which is not a claim to make on somebody's behalf from a string they never typed here.
3. **The look.** Full width, white (`#FFFFFF`), UNDER the primary Sign in / Create account button, with an
   OR hairline divider row above it. The mark is Google's CURRENT gradient G, inline SVG. Same 48px height
   and 11px radius as `.auth-submit` (`public/styles.css:2084`), which is literally the "approximately the
   same size and similar visual weight" the guidelines ask for. The divider reuses `.auth-label`'s type
   spec (`public/styles.css:2076`). New CSS is `.au-google` and `.au-or` under the ACCOUNT banner, with a
   PORT NOTE naming Google's branding rules for the hardcoded white and the mark. No new `!important`, no
   wildcard motion selectors, no em dashes.
4. **Confirm email stays OFF.** No warning copy on the button, and no handling of the obfuscated
   fake-success signup (HAZARD H3) in this task. Step 12 carries the standing note instead.

**Hazards this task honors,** numbered as in the recon digest
(`C:\Ai Master\Projects\Athletic Specimen\12-history\assets\2026-08-25-google-signin-recon-digest.md`),
so the numbering stays auditable:

| # | The failure | Where it is answered |
| --- | --- | --- |
| H1 | `claimIntent` dies in the redirect and the person lands on the hub with no explanation | Step 4 |
| H4 | a signed-in person who taps Google and backs out is silently signed out | Mike's call 1, Step 2 (the button is emitted from `formInner` only) |
| H5 | a test that pins the four outdated hexes ships a logo the guidelines list under Don't | Steps 1, 9, 10 |
| H6 | a delegate bind would duplicate the `data-auth-view` namespace and break the listener count | Step 3 |
| H7 | an unguarded bind throws on forgot and both sent screens | Step 3 |
| H9 | the harness's inert `sessionStorage` makes every intent assertion vacuously true | Step 8 |
| H10 | `authRestoreClaimIntent()` above the declaration hits the temporal dead zone and kills the app at parse | Step 4, plus the source assertion in Step 9 |
| H11 | `sessionStorage` throws outright in Safari private mode and several in-app browsers | Step 4 (every access wrapped) |
| H12 | the register-then-Google path loses its payoff and its auto-attach | Step 12, accepted and recorded |
| H13 | Google's mark is the most saturated object on a deliberately matte screen | Step 10 (18px on white, the only two levers we have) |
| H14 | the gradient mark is untested on WebKit, which is every iPhone at the tournament | Step 1 (the fallback rule) and Task 7's drive |
| H16 | switching `flowType` to pkce would put a `?code=` in the query this build never exchanges | Step 5 (the client is left alone) |
| **H17** | **NEW. iOS bfcache: tap Google, press Back at the consent screen, and the page restores WITHOUT re-evaluating `app.js`, so `#auth-google` is still disabled and there is no error line to explain it** | **Step 6** |

H2 and H3 are armed only by the Confirm email toggle and are the standing note in Step 12. H15 (the wall
can flash for a frame on return) needs no code: the identical ordering already exists for a persisted
session reload.

- [ ] **Step 1: The mark and the two strings.** Add beside `AUTH_MAIL_SVG` (`public/app.js:6203`).

Provenance: Google's own bundle, `developers.google.com/static/identity/images/signin-assets.zip`
(HTTP 200, 855303 bytes, 24 SVGs), file
`Android + Web/SVG/Light/Theme=Light, Show text=No, Shape=Square, Platform=Android+Web.svg`, with only the
two button chrome paths removed, the `viewBox` cropped to `10 10 20 20` and the Figma ids renamed to `g`.
No path data, no color and no gradient stop was touched, which is the route the guidelines sanction ("If
you need to create your own custom size Google logo, start with any of the logo sizes included in the
download bundle"). The extraction and its provenance are recorded in the vault at
`C:\Ai Master\Projects\Athletic Specimen\12-history\assets\2026-08-25-google-signin-design-options.md`
(the recon digest that adjudicated it is beside it as `...-google-signin-recon-digest.md`), and the mark
itself is reproduced IN FULL at the end of this step, so nothing here depends on a temp folder surviving.
Verified safe for a single-quoted JS string literal: 0 single quotes, 0 backticks, 0 `${`, 0 backslashes,
0 em dashes, and 0 of the four outdated hexes.

```js
// Google sign-in (Account round 2026-08-25, Mike's call 3). The mark is Google's CURRENT asset: a masked
// conic gradient. The flat four-color G that every older tutorial shows is the "outdated Google G" their
// guidelines list under Don't, and it appears in ZERO of the 24 SVGs in the official bundle. Do not swap
// it for a hand-drawn one: the size and the color of the G are the two things the guidelines say outright
// may not be changed, and a monochrome G is listed under Don't as well.
const AUTH_GOOGLE_SVG = '<svg viewBox="10 10 20 20" ... </svg>';   // see the joining rule below
// One of Google's three approved strings ("Sign in with Google" / "Sign up with Google" / "Continue with
// Google"). "Continue" is the only one that is honest on BOTH screens: a Supabase OAuth redirect has no
// separate sign-up, the first redirect creates the user, so a button that said "Sign up with Google" on
// one screen would lie to the returning player who taps it and lands in their existing account.
const AUTH_GOOGLE_LABEL = 'Continue with Google';
```

**If WebKit does not paint it (H14), the decision rule, decided here so the drive does not have to
improvise.** The mark paints its gradient through a `foreignObject` holding a CSS `conic-gradient`. That
was verified in Chrome inline, as `<img src>` and as a CSS `background-image`; Safari, and therefore every
iPhone at the tournament, was not tested. Task 7's drive looks at it on Mike's real phone. If it does not
render there, the substitute is the official PNG from the same bundle,
`Android + Web/PNG @2x/Light/Theme=Light, Show text=No, Shape=Square, Platform=Android+Web@2x.png`
(80 by 80, 2947 bytes), inlined as a `data:image/png;base64,` URI in an `<img>` inside the SAME button, in
the same 18px box, with `alt=""` and `aria-hidden="true"`. Never a flat four-color G, never a monochrome
one, never a redrawn one: those are the three things the guidelines list under Don't, and a broken gradient
is a rendering bug while an outdated G is a compliance one.

One honest caveat to weigh at the drive rather than discover after it: that PNG is the COMPLETE icon-only
button, its white fill and its 1px `#747775` stroke included, and there is no bare-G asset in the bundle at
any size or in any format. At 18px inside our labelled button its stroke reads as a thin ring around the
mark. The alternative Google documents for that asset is to use it AS the complete 40px icon-only button,
which is a different button from the one Mike picked. Default to the 18px `<img>`; if the ring looks wrong
on the phone, that is Mike's call in the moment, and either way the label and the layout do not move.

The test assertion that changes with it: the structural pin in the first case becomes either/or
(`conic-gradient(` OR `data:image/png;base64,`), while the negative assertion on the four outdated hexes
stays absolute and unconditional.

**How to build that string:** take the 65 lines of the mark below and join them with NO separator (the line
breaks are whitespace between tags and carry no meaning), then wrap the result in single quotes. The joined
string is exactly 10208 characters. Do not reflow it, do not pretty-print it, do not let an editor wrap it.
`node --check public/app.js` catches a bad join immediately, and the structural test pins `conic-gradient(`
and `mask0_g`, which a truncated paste loses.

The mark, verbatim:

```svg
<svg viewBox="10 10 20 20" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
<mask id="mask0_g" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="10" y="10" width="20" height="20">
<path d="M29.3987 18.1814H19.9849V22.0445H25.3598C25.1286 23.294 24.4294 24.3596 23.3676 25.0712C22.4746 25.6716 21.3266 26.0211 19.9849 26.0211C17.3864 26.0211 15.1823 24.2666 14.3947 21.9004C14.1952 21.2989 14.0853 20.6599 14.0853 19.9983C14.0853 19.3367 14.1952 18.6966 14.3947 18.0962C15.1823 15.7311 17.3864 13.9755 19.9849 13.9755C21.4524 13.9755 22.767 14.4816 23.8039 15.4713L26.6653 12.6057C24.936 10.9908 22.6786 10 19.9849 10C16.0832 10 12.705 12.2414 11.0618 15.5076C10.383 16.8592 10 18.3834 10 19.9994C10 21.6155 10.383 23.1396 11.0618 24.4913C12.705 27.7597 16.0832 30 19.9849 30C22.6797 30 24.9485 29.1137 26.6018 27.5861C28.4887 25.8452 29.5732 23.2702 29.5732 20.2275C29.5732 19.5182 29.5131 18.835 29.3987 18.1825V18.1814Z" fill="#E94FFF"/>
</mask>
<g mask="url(#mask0_g)">
<g filter="url(#filter0_f_g)">
<g clip-path="url(#paint0_angular_g_clip_path)" data-figma-skip-parse="true"><g transform="matrix(0.00804129 -0.00805186 0.00804128 0.00805186 19.6819 19.7927)"><foreignObject x="-2105.64" y="-2105.64" width="4211.29" height="4211.29"><div xmlns="http://www.w3.org/1999/xhtml" style="background:conic-gradient(from 90deg,rgba(255, 70, 65, 1) 0deg,rgba(255, 70, 65, 1) 4.14555deg,rgba(49, 134, 255, 1) 39.154deg,rgba(49, 134, 255, 1) 72.0044deg,rgba(0, 165, 183, 1) 96.7463deg,rgba(14, 188, 95, 1) 120.897deg,rgba(14, 188, 95, 1) 154.722deg,rgba(108, 196, 0, 1) 179.136deg,rgba(255, 204, 0, 1) 203.588deg,rgba(255, 211, 20, 1) 226.915deg,rgba(255, 204, 0, 1) 251.688deg,rgba(255, 106, 43, 1) 273.129deg,rgba(253, 70, 65, 1) 289.305deg,rgba(255, 70, 65, 1) 359.593deg,rgba(255, 70, 65, 1) 360deg);height:100%;width:100%;opacity:1"></div></foreignObject></g></g><path d="M7.25922 19.7927C7.25922 12.6759 13.0209 6.90668 20.1283 6.90668C27.2357 6.90668 32.9973 12.6759 32.9973 19.7927C32.9973 26.9094 27.2357 32.6786 20.1283 32.6786C13.0209 32.6786 7.25921 26.9094 7.25922 19.7927Z" data-figma-gradient-fill="{&#34;type&#34;:&#34;GRADIENT_ANGULAR&#34;,&#34;stops&#34;:[{&#34;color&#34;:{&#34;r&#34;:1.0,&#34;g&#34;:0.27450981736183167,&#34;b&#34;:0.25490197539329529,&#34;a&#34;:1.0},&#34;position&#34;:0.011515417136251926},{&#34;color&#34;:{&#34;r&#34;:0.19215686619281769,&#34;g&#34;:0.52549022436141968,&#34;b&#34;:1.0,&#34;a&#34;:1.0},&#34;position&#34;:0.10876122117042542},{&#34;color&#34;:{&#34;r&#34;:0.19215686619281769,&#34;g&#34;:0.52549022436141968,&#34;b&#34;:1.0,&#34;a&#34;:1.0},&#34;position&#34;:0.20001229643821716},{&#34;color&#34;:{&#34;r&#34;:0.0,&#34;g&#34;:0.64705884456634521,&#34;b&#34;:0.71764707565307617,&#34;a&#34;:1.0},&#34;position&#34;:0.26873961091041565},{&#34;color&#34;:{&#34;r&#34;:0.054901961237192154,&#34;g&#34;:0.73725491762161255,&#34;b&#34;:0.37254902720451355,&#34;a&#34;:1.0},&#34;position&#34;:0.33582508563995361},{&#34;color&#34;:{&#34;r&#34;:0.054901961237192154,&#34;g&#34;:0.73725491762161255,&#34;b&#34;:0.37254902720451355,&#34;a&#34;:1.0},&#34;position&#34;:0.42978334426879883},{&#34;color&#34;:{&#34;r&#34;:0.42528781294822693,&#34;g&#34;:0.77231442928314209,&#34;b&#34;:0.0,&#34;a&#34;:1.0},&#34;position&#34;:0.49760133028030396},{&#34;color&#34;:{&#34;r&#34;:1.0,&#34;g&#34;:0.80000001192092896,&#34;b&#34;:0.0,&#34;a&#34;:1.0},&#34;position&#34;:0.56552332639694214},{&#34;color&#34;:{&#34;r&#34;:1.0,&#34;g&#34;:0.82745099067687988,&#34;b&#34;:0.078431375324726105,&#34;a&#34;:1.0},&#34;position&#34;:0.63031959533691406},{&#34;color&#34;:{&#34;r&#34;:1.0,&#34;g&#34;:0.80000001192092896,&#34;b&#34;:0.0,&#34;a&#34;:1.0},&#34;position&#34;:0.69913208484649658},{&#34;color&#34;:{&#34;r&#34;:1.0,&#34;g&#34;:0.41842123866081238,&#34;b&#34;:0.16917318105697632,&#34;a&#34;:1.0},&#34;position&#34;:0.75869029760360718},{&#34;color&#34;:{&#34;r&#34;:0.99215686321258545,&#34;g&#34;:0.27450981736183167,&#34;b&#34;:0.25490197539329529,&#34;a&#34;:1.0},&#34;position&#34;:0.80362409353256226},{&#34;color&#34;:{&#34;r&#34;:1.0,&#34;g&#34;:0.27450981736183167,&#34;b&#34;:0.25490197539329529,&#34;a&#34;:1.0},&#34;position&#34;:0.99887031316757202}],&#34;stopsVar&#34;:[{&#34;color&#34;:{&#34;r&#34;:1.0,&#34;g&#34;:0.27450981736183167,&#34;b&#34;:0.25490197539329529,&#34;a&#34;:1.0},&#34;position&#34;:0.011515417136251926},{&#34;color&#34;:{&#34;r&#34;:0.19215686619281769,&#34;g&#34;:0.52549022436141968,&#34;b&#34;:1.0,&#34;a&#34;:1.0},&#34;position&#34;:0.10876122117042542},{&#34;color&#34;:{&#34;r&#34;:0.19215686619281769,&#34;g&#34;:0.52549022436141968,&#34;b&#34;:1.0,&#34;a&#34;:1.0},&#34;position&#34;:0.20001229643821716},{&#34;color&#34;:{&#34;r&#34;:0.0,&#34;g&#34;:0.64705884456634521,&#34;b&#34;:0.71764707565307617,&#34;a&#34;:1.0},&#34;position&#34;:0.26873961091041565},{&#34;color&#34;:{&#34;r&#34;:0.054901961237192154,&#34;g&#34;:0.73725491762161255,&#34;b&#34;:0.37254902720451355,&#34;a&#34;:1.0},&#34;position&#34;:0.33582508563995361},{&#34;color&#34;:{&#34;r&#34;:0.054901961237192154,&#34;g&#34;:0.73725491762161255,&#34;b&#34;:0.37254902720451355,&#34;a&#34;:1.0},&#34;position&#34;:0.42978334426879883},{&#34;color&#34;:{&#34;r&#34;:0.42528781294822693,&#34;g&#34;:0.77231442928314209,&#34;b&#34;:0.0,&#34;a&#34;:1.0},&#34;position&#34;:0.49760133028030396},{&#34;color&#34;:{&#34;r&#34;:1.0,&#34;g&#34;:0.80000001192092896,&#34;b&#34;:0.0,&#34;a&#34;:1.0},&#34;position&#34;:0.56552332639694214},{&#34;color&#34;:{&#34;r&#34;:1.0,&#34;g&#34;:0.82745099067687988,&#34;b&#34;:0.078431375324726105,&#34;a&#34;:1.0},&#34;position&#34;:0.63031959533691406},{&#34;color&#34;:{&#34;r&#34;:1.0,&#34;g&#34;:0.80000001192092896,&#34;b&#34;:0.0,&#34;a&#34;:1.0},&#34;position&#34;:0.69913208484649658},{&#34;color&#34;:{&#34;r&#34;:1.0,&#34;g&#34;:0.41842123866081238,&#34;b&#34;:0.16917318105697632,&#34;a&#34;:1.0},&#34;position&#34;:0.75869029760360718},{&#34;color&#34;:{&#34;r&#34;:0.99215686321258545,&#34;g&#34;:0.27450981736183167,&#34;b&#34;:0.25490197539329529,&#34;a&#34;:1.0},&#34;position&#34;:0.80362409353256226},{&#34;color&#34;:{&#34;r&#34;:1.0,&#34;g&#34;:0.27450981736183167,&#34;b&#34;:0.25490197539329529,&#34;a&#34;:1.0},&#34;position&#34;:0.99887031316757202}],&#34;transform&#34;:{&#34;m00&#34;:16.082571029663086,&#34;m01&#34;:16.082569122314453,&#34;m02&#34;:3.5993347167968750,&#34;m10&#34;:-16.103721618652344,&#34;m11&#34;:16.103721618652344,&#34;m12&#34;:19.792665481567383},&#34;opacity&#34;:1.0,&#34;blendMode&#34;:&#34;NORMAL&#34;,&#34;visible&#34;:true}"/>
</g>
<g filter="url(#filter1_f_g)">
<ellipse cx="20.0496" cy="20.2413" rx="5.39634" ry="2.83537" transform="rotate(24.4473 20.0496 20.2413)" fill="#3186FF"/>
</g>
<g filter="url(#filter2_f_g)">
<ellipse cx="33.3538" cy="18.2155" rx="7.43918" ry="3.09357" fill="#3186FF"/>
</g>
<g filter="url(#filter3_f_g)">
<ellipse cx="25.2744" cy="16.2195" rx="7.40854" ry="2.37805" fill="#FF4641"/>
</g>
<g filter="url(#filter4_f_g)">
<ellipse cx="29.5427" cy="12.9268" rx="7.40854" ry="2.37805" fill="#FF5B8B"/>
</g>
<g filter="url(#filter5_f_g)">
<ellipse cx="24.4817" cy="19.878" rx="8.5061" ry="3.10976" fill="#3186FF"/>
</g>
<g filter="url(#filter6_f_g)">
<ellipse cx="25.1842" cy="14.0197" rx="4.53882" ry="2.37805" transform="rotate(-28.6599 25.1842 14.0197)" fill="#FF4641"/>
</g>
</g>
<defs>
<filter id="filter0_f_g" x="5.25922" y="4.90668" width="29.7381" height="29.772" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feFlood flood-opacity="0" result="BackgroundImageFix"/>
<feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
<feGaussianBlur stdDeviation="1" result="effect1_foregroundBlur_g"/>
</filter>
<clipPath id="paint0_angular_g_clip_path"><path d="M7.25922 19.7927C7.25922 12.6759 13.0209 6.90668 20.1283 6.90668C27.2357 6.90668 32.9973 12.6759 32.9973 19.7927C32.9973 26.9094 27.2357 32.6786 20.1283 32.6786C13.0209 32.6786 7.25921 26.9094 7.25922 19.7927Z"/></clipPath><filter id="filter1_f_g" x="12.9977" y="14.828" width="14.1038" height="10.8265" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feFlood flood-opacity="0" result="BackgroundImageFix"/>
<feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
<feGaussianBlur stdDeviation="1" result="effect1_foregroundBlur_g"/>
</filter>
<filter id="filter2_f_g" x="23.9146" y="13.1219" width="18.8784" height="10.1871" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feFlood flood-opacity="0" result="BackgroundImageFix"/>
<feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
<feGaussianBlur stdDeviation="1" result="effect1_foregroundBlur_g"/>
</filter>
<filter id="filter3_f_g" x="15.8659" y="11.8415" width="18.8171" height="8.7561" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feFlood flood-opacity="0" result="BackgroundImageFix"/>
<feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
<feGaussianBlur stdDeviation="1" result="effect1_foregroundBlur_g"/>
</filter>
<filter id="filter4_f_g" x="20.1341" y="8.54878" width="18.8171" height="8.7561" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feFlood flood-opacity="0" result="BackgroundImageFix"/>
<feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
<feGaussianBlur stdDeviation="1" result="effect1_foregroundBlur_g"/>
</filter>
<filter id="filter5_f_g" x="13.9756" y="14.7683" width="21.0122" height="10.2195" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feFlood flood-opacity="0" result="BackgroundImageFix"/>
<feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
<feGaussianBlur stdDeviation="1" result="effect1_foregroundBlur_g"/>
</filter>
<filter id="filter6_f_g" x="19.0404" y="9.00419" width="12.2878" height="10.0309" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feFlood flood-opacity="0" result="BackgroundImageFix"/>
<feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
<feGaussianBlur stdDeviation="1" result="effect1_foregroundBlur_g"/>
</filter>
</defs>
</svg>
```

- [ ] **Step 2: The button markup, once, for both modes.** Add the helper beside `authFieldHTML`
(`public/app.js:6265`) and slot the call into `formInner` between `public/app.js:6357` and `:6358`.

```js
// The OR rule and the provider button, as one part, because they are never useful apart. The label rides
// in a SPAN on purpose: production ships button { font-size: 16px !important } (styles.css:241) as a
// blanket iOS guard, and a span is not a button, so Google's 14/20 lands with plain specificity and this
// round adds no fifth !important counter. The divider's text is lowercase in the markup and uppercased by
// .au-or, exactly the way .auth-label already uppercases "Email" and "Password".
function authGoogleButtonHTML() {
  return `<div class="au-or">or</div>
        <button type="button" class="au-google" id="auth-google">${AUTH_GOOGLE_SVG}<span>${AUTH_GOOGLE_LABEL}</span></button>`;
}
```

```
public/app.js:6357   <button type="submit" class="auth-submit" id="auth-submit">${signup ? 'Create account' : 'Sign in'}</button>
NEW                  ${authGoogleButtonHTML()}
public/app.js:6358   ${signup ? '' : '<button type="button" class="au-alt2" data-auth-view="forgot">Forgot your password?</button>'}
public/app.js:6359   <button type="button" class="auth-alt" id="auth-alt">${signup ? 'Already have an account? Sign in' : 'New here? Create an account'}</button>
```

One insertion serves both screens by construction, which is Mike's call 1. `type="button"` is not
optional: the control sits inside `#auth-form` and a submit would fire `onAuthSubmit`. The markup goes in
`formInner` ONLY, so `sentInner`, `forgotInner` and `forgotSentInner` never carry it, and `#gate-page`
(`openGatePage`, `:6855`) is not touched at all. `authGoogleButtonHTML()` is called on every paint of
`formInner` and its result is used by two of the five states, which is how the whole function already works
(the template is built, then one branch is chosen); it is a string concat with no DOM and no cost worth
restructuring for.

- [ ] **Step 3: The bind. Per paint, BY ID, guarded.** Beside the `#auth-alt` bind at
`public/app.js:6375-6379`.

```js
  // Per-paint id bind, the same shape as #auth-alt above and #auth-resend below. The innerHTML swap
  // replaces the child nodes, so this cannot stack. NOT a delegate on the overlay and NOT data-auth-view:
  // openAuthPage already binds one click delegate on the element itself (:6252-6257) and it consumes
  // data-auth-view, so a Google control carrying that attribute would set authMode = 'google' and repaint
  // an unknown mode, while a SECOND delegate on the element would stack one more handler per repaint (the
  // comment at :6248-6252 records that incident). The `if (g)` is what keeps forgot, forgot-sent and
  // signup-sent from throwing: those markups never declare the id, and addEventListener on null is a
  // TypeError inside the paint.
  const g = el.querySelector('#auth-google');
  if (g) g.addEventListener('click', () => onGoogleSignIn());
```

`() => onGoogleSignIn()` and not `() => { onGoogleSignIn(); }`: the tests await the value the listener
returns, exactly as the two Resend cases already do.

- [ ] **Step 4: The claim intent that survives the redirect.** The const and the four helpers go
immediately ABOVE `let claimIntent = false;` (`public/app.js:6395`); the boot call goes on the line
immediately BELOW it. Anywhere higher and the call hits `let`'s temporal dead zone and kills the app at
parse.

```js
// A Google sign-in is a full page navigation away and back, so app.js is re-evaluated from scratch and
// every module `let` is back at its initializer. claimIntent is the one that matters: without this, the
// person who tapped "claim your team", signed in with Google, and came back, lands on the hub with no
// claim page and no explanation. Password sign-in never had this problem because the page never unloads.
// sessionStorage, not localStorage: the redirect returns to the SAME tab, and an abandoned intent should
// die with the tab instead of haunting a visit next week. Every access is wrapped: Safari private mode
// and several in-app browsers throw on sessionStorage outright, and the restore runs at module scope,
// where a throw is fatal instead of merely broken. (The app's own sessionStorage calls at :5124, :5127,
// :13162 and :13251 are unwrapped and predate this task; widening that is not this task's job.)
const AUTH_CLAIM_INTENT_KEY = 'athletic_specimen_claim_intent';
function authPersistClaimIntent() {
  if (!claimIntent) return;
  try { sessionStorage.setItem(AUTH_CLAIM_INTENT_KEY, '1'); } catch (_) {}
}
function authForgetClaimIntent() {
  // The KEY only. The in-memory flag is deliberately left alone, so a Google call that FAILS still lets
  // the same person finish with email and password and land on the claim page they asked for.
  try { sessionStorage.removeItem(AUTH_CLAIM_INTENT_KEY); } catch (_) {}
}
function authRestoreClaimIntent() {
  let v = null;
  try { v = sessionStorage.getItem(AUTH_CLAIM_INTENT_KEY); } catch (_) { return; }
  authForgetClaimIntent();   // consumed on read: a reload that never reaches SIGNED_IN must not leave it armed
  if (v === '1') claimIntent = true;
}
function authClearClaimIntent() {
  claimIntent = false;
  authForgetClaimIntent();
}
```

Then, in file order:

```js
let claimIntent = false;      // a signed-out "claim" tap, auto-open the page after sign-in
authRestoreClaimIntent();     // must sit BELOW the declaration: `let` has a temporal dead zone
```

The three clear sites each become `authClearClaimIntent();`, replacing the bare assignment:
`public/app.js:6372` (the back chevron inside `renderAuthPageInner`), `:7080` (the consume inside the
fresh-SIGNED_IN branch of `onAuthEvent`) and `:7099` (the signed-out branch). The three SETTERS stay bare
assignments and are untouched: `:305` (the register success screen's "Sign in"), `:4234` (the join sheet)
and `:13424` (the hub's `#pd-claim` row).

- [ ] **Step 5: The call.** Top level, beside `onAuthSubmit` (`public/app.js:6665`).

```js
// The whole Google path, in one function. signInWithOAuth returns { data: { provider, url }, error } and
// NEVER a session (gotrue-js 2.62.2 GoTrueClient.ts:1786): in a browser it calls
// window.location.assign(url) itself unless skipBrowserRedirect is set (:1783-1785), so on the success
// path the lines after the await may never run. flowType stays the client default, which is implicit
// (DEFAULT_OPTIONS at GoTrueClient.ts:95-104): the client at public/app.js:31-33 sets no flowType, the
// tokens come back in the URL FRAGMENT, and detectSessionInUrl already consumes them. Switching to pkce
// would put a ?code= in the query that this build never exchanges.
async function onGoogleSignIn() {
  const btn = document.getElementById('auth-google');
  // Belt and suspenders: a disabled <button> emits no click in a real browser, but the test fires the
  // bound closure directly, and a double tap must never send two authorize requests.
  if (btn && btn.disabled) return;
  const errEl = document.getElementById('auth-err');
  const showErr = (msg) => { if (errEl) { errEl.textContent = msg; errEl.hidden = false; } };
  if (errEl) errEl.hidden = true;
  if (!supabaseClient) { showErr('Sign-in is unavailable right now.'); return; }
  if (btn) btn.disabled = true;
  // Written BEFORE the call, never after: the library navigates the document itself.
  authPersistClaimIntent();
  const fail = () => {
    // Deliberately NOT routed through friendlyAuthError: that map has no OAuth arm, so "Unsupported
    // provider: provider is not enabled" would fall through its final `return m` and put a raw server
    // string in front of a player. This line is the ONLY feedback there is, because an OAuth failure is
    // never delivered to onAuthStateChange (_initialize returns the error and notifies nobody,
    // GoTrueClient.ts:305-320).
    showErr('Google did not answer. Try again, or use your email.');
    authForgetClaimIntent();   // no redirect happened, so no key should outlive this tap
    if (btn) btn.disabled = false;
  };
  try {
    const res = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.origin },   // the round's law, and the only value the allow-list
                                                  // accepts beside the Site URL (Step 12, item 3)
    });
    if (res && res.error) fail();
  } catch (_) { fail(); }
}
```

The button is deliberately left DISABLED on the success path: the page is leaving.

- [ ] **Step 6: The bfcache dead button (H17).** Top level, immediately after `onGoogleSignIn`.

On iOS Safari the tap does not unload the page, it FREEZES it. The person taps Continue with Google, sees
the consent screen, presses Back, and the page is restored from the back/forward cache: `app.js` is not
re-evaluated, every module `let` is exactly as they left it, and `#auth-google` is still disabled with no
error line to explain it. The app's existing `pageshow` hook (`ensureAuthorityRefreshHooks`,
`public/app.js:1503-1507`) only calls `triggerRefresh('pageshow')`, which never touches the overlay. This
is the one path where the failure is invisible: nothing errored, so nothing is shown, and the button is
simply dead.

```js
// H17. A bfcache restore is the one way back from Google that does NOT re-evaluate app.js, so the module
// state the redirect was supposed to destroy is all still here, including the disabled button. Repaint
// the overlay, which hands back a fresh enabled control and clears any stale error line. The button is
// re-enabled explicitly as well, because in a real browser the repaint replaces the node while the test
// harness reuses one registry node per id, and the assertion has to see the same thing in both.
// The key goes too: no redirect completed, so nothing should be waiting in storage for the next boot.
// The in-memory flag stays, exactly as on the failure path in onGoogleSignIn.
function onAuthPageShow(event) {
  if (!event || !event.persisted) return;
  authForgetClaimIntent();
  const btn = document.getElementById('auth-google');
  if (btn) btn.disabled = false;
  if (document.getElementById('auth-page')) renderAuthPageInner();
}
window.addEventListener('pageshow', onAuthPageShow);
```

The registration is at module scope on purpose: `ensureAuthorityRefreshHooks` runs from init, which
`readyState: 'loading'` keeps from running in the harness, so a listener added there could not be reached
by a test. The bridge calls `onAuthPageShow` directly and one source assertion proves the app registers
it, the same split the boot restore uses.

- [ ] **Step 7: The name, prefilled (Mike's call 2).** The split is PURE and lives in `public/pure.js`
beside `splitFullNameParts` (`:677`), with an entry in `module.exports`; the session read and the prefill
live in `app.js`.

```js
// pure.js. Google supplies ONE display string and never given_name / family_name, so first and last have
// to be guessed by splitting it. Last space, not first: "Mary Jo Van Der Berg" is a person, and putting
// the whole run in `first` is the guess a human can correct in one field instead of two. Returns null
// rather than a half-answer for one word or nothing, so the caller asks instead of guessing.
function splitFullName(full) {
  const whole = String(full == null ? '' : full).trim().replace(/\s+/g, ' ');
  const cut = whole.lastIndexOf(' ');
  if (cut < 1) return null;
  return { first: whole.slice(0, cut), last: whole.slice(cut + 1) };
}
```

```js
// app.js, beside promptNameFillIfNeeded (:6905). full_name and name are the two aliases both Google
// provider paths carry (provider/google.go:120-131 and oidc.go:107-117); given_name and family_name are
// carried by NEITHER. The halves run through the app's own splitFullNameParts so a prefill can never seed
// something the Save button would then refuse.
function nameFromSessionMetadata(session) {
  const md = (session && session.user && session.user.user_metadata) || {};
  const nm = splitFullName(md.full_name || md.name || '');
  if (!nm) return null;
  const parts = splitFullNameParts(nm.first, nm.last);
  return parts.ok ? { first: parts.first, last: parts.last } : null;
}
```

The name is `nameFromSessionMetadata` and not `googleNameFromSession` because that is what it does: it
reads `user_metadata`, and it fires for ANY session that reaches the ask, which includes an older password
account whose `signUp` wrote `full_name` but never `first_name` / `last_name`. That is intended, not a leak:
the prefill is just as right for them, and it only ever runs on the branch that was already going to ask.

`openNameFillOverlay` (`:6934`) takes an optional seed and writes it into the two `value` attributes,
escaped. The no-stack guard at `:6935` stays, the ids stay `namefill-first` / `namefill-last`, and there is
still no back control, so the only exits are saving or reloading:

```js
function openNameFillOverlay(prefill) {
  if (document.getElementById('namefill-page')) return; // never stack
  // Account round Task 8: an OPTIONAL seed, used only by the Google path. The other caller (the register
  // success screen, :299) passes nothing and renders exactly as it did. Escaped, because it is a string
  // from an identity provider going straight into an attribute.
  const seed = prefill || {};
  const firstVal = seed.first ? ` value="${escapeHTML(seed.first)}"` : '';
  const lastVal = seed.last ? ` value="${escapeHTML(seed.last)}"` : '';
  ... unchanged ...
        <input class="auth-input" id="namefill-first" type="text" autocomplete="given-name" autocapitalize="words" spellcheck="false" placeholder="First"${firstVal} />
  ... unchanged ...
        <input class="auth-input" id="namefill-last" type="text" autocomplete="family-name" autocapitalize="words" spellcheck="false" placeholder="Last"${lastVal} />
}
```

and the fall-through at `public/app.js:6931` becomes:

```js
  // Every new Google user reaches this line today with ZERO code changes: handle_new_user seeds
  // display_name from raw_user_meta_data->>'full_name' but first_name / last_name ONLY from the
  // first_name / last_name keys the app's own signUp writes (0053_tournament_identity.sql:58-68), and
  // Google sends neither. So the prompt is unavoidable; prefilling it is what makes it one tap.
  openNameFillOverlay(nameFromSessionMetadata(state.authSession)); // either name missing, ask once
```

`onNameFillSave` is UNCHANGED. Nothing reaches `profiles` and no `player_claims` row is written until the
person taps Save, which is the whole point of the call.

- [ ] **Step 8: The harness, additively.** Nothing below renames an existing bridge key or changes an
existing stub's shape for an existing caller. Find each anchor by NAME: Tasks 5 and 6 will have moved the
line numbers.

`AUTH_CONTROL_IDS` (the array that ends with the Task 4 ids), append:
```js
  // Task 8: the OAuth button, the name overlay's controls (openNameFillOverlay binds #namefill-form back
  // after its innerHTML swap, so the id has to exist before the bind), and the claim page's three, so
  // #claim-page renders for real instead of relying on a swallowed throw.
  'auth-google', 'namefill-form', 'namefill-first', 'namefill-last', 'namefill-err', 'namefill-save',
  'claim-back', 'claim-search', 'claim-results',
```

`supaStub.auth`, one line beside `signOut: rec('signOut')`:
```js
      signInWithOAuth: rec('signInWithOAuth'),
```

The `from` stub, one key added to the object `select()` returns (purely additive: nothing calls `.is`
today):
```js
      // Task 8: the claim page reads the two unclaimed lists with .is(col, null) and awaits both through
      // Promise.allSettled, so .is has to answer with a THENABLE. It never chains .eq here, because
      // fetchCommunityId resolves to null in this sandbox (its maybeSingle answers { data: {} }).
      is: () => Promise.resolve({ data: [], error: null }),
```

The `location` stub, so a case can PROVE the app never navigates on its own (the LIBRARY navigates):
```js
  const assigns = [];
  // ...inside windowStub.location:
    assign: (u) => { assigns.push(String(u)); }, replace: (u) => { assigns.push(String(u)); },
```

The two storages. sessionStorage becomes REAL for the Task 8 half; localStorage stays inert:
```js
  // sessionStorage is REAL from Task 8 on: the OAuth redirect tears the page down, so the claim intent has
  // to survive in storage and a test has to be able to see what was written. localStorage stays inert on
  // purpose, nothing in this round reads it. Blast radius, checked: the app touches bare sessionStorage in
  // loadLocal (:5124, :5127), which readyState 'loading' keeps from running at load, and in
  // activateMainTab (:13162, :13251), so the Task 1 case that calls bridge.tab(...) now writes a real key.
  // That is why EVERY assertion below reads a NAMED key and none of them reads length.
  const sessionMap = new Map();
  const sessionStorageStub = {
    getItem: (k) => (sessionMap.has(String(k)) ? sessionMap.get(String(k)) : null),
    setItem: (k, v) => { sessionMap.set(String(k), String(v)); },
    removeItem: (k) => { sessionMap.delete(String(k)); },
    clear: () => sessionMap.clear(),
    key: (i) => (Array.from(sessionMap.keys())[i] ?? null),
    get length() { return sessionMap.size; },
  };
```
then in the sandbox: `localStorage: storageStub(), sessionStorage: sessionStorageStub,`.

The bridge epilogue (the template string), SEVEN bridge keys plus one spy, the spy in the shape the file
already uses for `runPostSignInWork` and `render`:
```js
    // Task 8 spy: nothing may be claimed on a roster until the person taps Save, and
    // connect_profile_by_name is the call that would do it. The real function still runs; this counts.
    ;let __connects = 0;
    const __connect = connectProfileByName;
    connectProfileByName = async function (...a) { __connects += 1; return __connect(...a); };
```
```js
      restoreClaimIntent: () => authRestoreClaimIntent(),
      // H17: the handler is called DIRECTLY, because windowStub.addEventListener is a noop and a
      // recording window stub would be a bigger change than this task needs. One source assertion in the
      // next step proves the app actually subscribes.
      pageshow: (persisted) => onAuthPageShow({ persisted: !!persisted }),
      // Only if the harness does not already expose an opener by the time this task runs (Tasks 5 and 6
      // may add one): the never-on-a-signed-in-surface case renders all three edit views for real.
      openAcct: (view) => openAcctPage(view),
      getAccountName: () => accountName,
      connectRuns: () => __connects,
      splitName: (v) => splitFullName(v),   // the pure helper, the way bridge.meter exposes passwordMeterScore
      resetConnects: () => { __connects = 0; },
      // identityConnectAttempted is a module flag with no reset today, so whichever case runs the
      // both-names path first silently disarms every later one. reset() clears it (nothing in Tasks 1 to 4
      // depends on it being sticky).
      setConnectAttempted: (v) => { identityConnectAttempted = !!v; },
```
and after load: `bridge.assigns = () => assigns;` plus
```js
  // A named-key view of the real sessionStorage. get() answers null (never undefined) for a missing key,
  // so an assertion reads the same way as the DOM API it stands in for.
  bridge.session = {
    get: (k) => (sessionMap.has(String(k)) ? sessionMap.get(String(k)) : null),
    set: (k, v) => { sessionMap.set(String(k), String(v)); },
    keys: () => Array.from(sessionMap.keys()),
  };
```

`bridge.reset`, three lines beside `supaCalls.length = 0;`:
```js
    sessionMap.clear();
    assigns.length = 0;
    bridge.resetConnects();
    bridge.setConnectAttempted(false);
```

- [ ] **Step 9: The vitest cases.** A new `describe('Account round Task 8 - Continue with Google', ...)`
appended after the last block, with `beforeEach(() => bridge.reset())`. The module-scope helpers `count`,
`fillSignup`, `css` and `appSrc` are already there. One spelling note: the copy guard below is written
`/\u2014|&mdash;|night/i`, with the ESCAPE and not the character. Write yours that way: the literal em
dashes already in the file are pre-existing test regexes from Tasks 1 to 3, and nothing new in this round
adds one.

```js
it('splitFullName splits on the LAST space and refuses a single word', () => {
  const s = bridge.splitName;
  expect(s('Morgan Reyes')).toEqual({ first: 'Morgan', last: 'Reyes' });
  expect(s('  Morgan   Reyes ')).toEqual({ first: 'Morgan', last: 'Reyes' });
  expect(s('Mary Jo Van Der Berg')).toEqual({ first: 'Mary Jo Van Der', last: 'Berg' });
  expect(s('Morgan')).toBe(null);
  expect(s('')).toBe(null);
  expect(s(null)).toBe(null);
  expect(s(undefined)).toBe(null);
});

it('the Google button renders once on sign in and once on create account, with the current gradient mark', () => {
  for (const mode of ['signin', 'signup']) {
    bridge.reset();
    bridge.openAuth(mode);
    const html = bridge.registry['auth-page'].innerHTML;
    expect(count(html, 'id="auth-google"')).toBe(1);            // one button, never one per render
    expect(html).toContain('<button type="button" class="au-google" id="auth-google">');
    expect(html).toContain('Continue with Google');
    expect(count(html, 'class="au-or"')).toBe(1);
    // Under the primary, never above it: the rank this round spent six tasks establishing.
    expect(html.indexOf('id="auth-submit"')).toBeLessThan(html.indexOf('id="auth-google"'));
    // The mark is Google's CURRENT asset, a masked conic gradient. The flat four-color G is the
    // "outdated Google G" their guidelines list under Don't, and it is in none of the 24 official SVGs.
    // Either the gradient SVG or, if WebKit forced the documented fallback, the official PNG. The
    // negative below is NOT either/or: the outdated G is never allowed, on any platform.
    expect(html.includes('conic-gradient(') || html.includes('data:image/png;base64,')).toBe(true);
    if (html.includes('conic-gradient(')) expect(html).toContain('mask0_g');
    for (const dead of ['#4285F4', '#34A853', '#FBBC05', '#EA4335']) expect(html).not.toContain(dead);
    expect(html).not.toMatch(/\u2014|&mdash;|night/i);          // the round's standing copy guard
  }
});

it('the Google button never appears on forgot, forgot-sent or signup-sent', async () => {
  bridge.openAuth('forgot');
  expect(bridge.registry['auth-page'].innerHTML).not.toContain('id="auth-google"');
  bridge.registry['fg-email'].value = 'a@b.co';
  bridge.supaNext('resetPasswordForEmail', { data: {}, error: null });
  await bridge.authSubmit();
  expect(bridge.registry['auth-page'].innerHTML).toContain('Check your email');
  expect(bridge.registry['auth-page'].innerHTML).not.toContain('id="auth-google"');
  bridge.reset();
  bridge.openAuth('signup');
  fillSignup();
  bridge.supaNext('signUp', { data: { user: {}, session: null }, error: null });
  await bridge.authSubmit();
  expect(bridge.registry['auth-page'].innerHTML).toContain('Check your email');
  expect(bridge.registry['auth-page'].innerHTML).not.toContain('id="auth-google"');
});

it('no signed-in surface carries it, and the wall does not either', () => {
  bridge.setSignedOut();
  bridge.openGate();
  expect(bridge.registry['gate-page'].innerHTML).not.toContain('auth-google');
  // The real reason, not a style rule: signInWithOAuth removes the session before it builds a URL and
  // that removal notifies nobody, so a signed-in person who taps it and backs out at Google looks signed
  // in until their next reload (H4). So this asserts the RENDERED signed-in surfaces, not the source.
  bridge.reset();
  bridge.setSignedIn({ id: 'u1', email: 'morgan@email.com' }, { first: 'Morgan', last: 'Blake' });
  bridge.openMenu();
  expect(bridge.registry['account-menu'].innerHTML).not.toContain('auth-google');
  for (const view of ['name', 'email', 'password']) {
    bridge.openAcct(view);
    expect(bridge.registry['acct-page'].innerHTML).not.toContain('auth-google');
  }
  // One emission site in the whole file: the helper called from formInner, and nothing else.
  expect(count(appSrc, 'id="auth-google"')).toBe(1);
});

it('a bfcache restore hands the dead button back (H17)', async () => {
  bridge.openAuth('signin');
  const btn = bridge.registry['auth-google'];
  bridge.setClaimIntent(true);
  let release;
  bridge.supaNext('signInWithOAuth', new Promise((r) => { release = r; }));
  const inFlight = btn.listeners.click[0]();
  release({ data: { provider: 'google', url: 'https://accounts.google.com/x' }, error: null });
  await inFlight;
  expect(btn.disabled).toBe(true);                    // left disabled on purpose: the page was leaving
  expect(bridge.session.get('athletic_specimen_claim_intent')).toBe('1');

  bridge.pageshow(false);                             // a plain pageshow is not a restore
  expect(btn.disabled).toBe(true);

  bridge.pageshow(true);                              // iOS Back from the consent screen
  expect(btn.disabled).toBe(false);                   // the dead button is alive again
  expect(btn.listeners.click.length).toBe(1);         // and bound exactly once by the repaint
  expect(bridge.registry['auth-err'].hidden).toBe(true);
  // Nothing completed, so nothing waits in storage for the next boot; the memory flag still serves the
  // email path the person can fall back to.
  expect(bridge.session.get('athletic_specimen_claim_intent')).toBe(null);
  expect(bridge.getClaimIntent()).toBe(true);
  // The bridge proves the behaviour; only the SOURCE proves the app subscribes at all.
  expect(appSrc).toContain("window.addEventListener('pageshow', onAuthPageShow)");
});

it('a tap calls signInWithOAuth with google and the origin, exactly once, and disables while it awaits', async () => {
  bridge.openAuth('signin');
  const btn = bridge.registry['auth-google'];
  expect(btn.listeners.click.length).toBe(1);   // bound by the render, once, by id
  expect(btn.disabled).toBe(false);
  let release;
  bridge.supaNext('signInWithOAuth', new Promise((r) => { release = r; }));
  const inFlight = btn.listeners.click[0]();
  expect(btn.disabled).toBe(true);              // set synchronously, before the first await
  release({ data: { provider: 'google', url: 'https://accounts.google.com/o/oauth2/v2/auth?x=1' }, error: null });
  await inFlight;
  const calls = bridge.supaCalls().filter((c) => c[0] === 'signInWithOAuth');
  expect(calls.length).toBe(1);
  expect(calls[0][1]).toEqual({ provider: 'google', options: { redirectTo: 'http://localhost' } });
  expect(bridge.supaCalls().map((c) => c[0])).toEqual(['signInWithOAuth']);
  expect(btn.disabled).toBe(true);              // left disabled on the success path: the page is leaving
  // The LIBRARY navigates, never the app. These spies exist to prove the app does not.
  expect(bridge.assigns()).toEqual([]);
});

it('a second tap while the first is in flight does not send a second signInWithOAuth', async () => {
  bridge.openAuth('signin');
  const btn = bridge.registry['auth-google'];
  let release;
  bridge.supaNext('signInWithOAuth', new Promise((r) => { release = r; }));
  const first = btn.listeners.click[0]();
  const second = btn.listeners.click[0]();
  release({ data: { provider: 'google', url: 'https://accounts.google.com/x' }, error: null });
  await Promise.all([first, second]);
  expect(bridge.supaCalls().filter((c) => c[0] === 'signInWithOAuth').length).toBe(1);
});

it('a failed signInWithOAuth shows a visible error line and hands the button back', async () => {
  bridge.openAuth('signin');
  const btn = bridge.registry['auth-google'];
  const err = bridge.registry['auth-err'];
  bridge.supaNext('signInWithOAuth', { data: { provider: 'google', url: null }, error: { message: 'Unsupported provider: provider is not enabled' } });
  await btn.listeners.click[0]();
  expect(err.hidden).toBe(false);
  expect(err.textContent).toBe('Google did not answer. Try again, or use your email.');
  expect(err.textContent).not.toContain('provider is not enabled');   // never the raw server string
  expect(btn.disabled).toBe(false);
  expect(bridge.registry['auth-page'].innerHTML).toContain('class="auth-err" id="auth-err"');
});

it('a thrown signInWithOAuth reads the same way', async () => {
  bridge.openAuth('signin');
  const btn = bridge.registry['auth-google'];
  bridge.supaNext('signInWithOAuth', Promise.reject(new Error('network down')));
  await btn.listeners.click[0]();
  expect(bridge.registry['auth-err'].hidden).toBe(false);
  expect(bridge.registry['auth-err'].textContent).toBe('Google did not answer. Try again, or use your email.');
  expect(btn.disabled).toBe(false);
});

it('a pending claim intent is written to sessionStorage before the OAuth call, and only then', async () => {
  bridge.openAuth('signin');
  bridge.setClaimIntent(true);
  expect(bridge.session.get('athletic_specimen_claim_intent')).toBe(null);
  let release;
  bridge.supaNext('signInWithOAuth', new Promise((r) => { release = r; }));
  const inFlight = bridge.registry['auth-google'].listeners.click[0]();
  expect(bridge.session.get('athletic_specimen_claim_intent')).toBe('1');   // before the await resolves
  release({ data: { provider: 'google', url: 'https://accounts.google.com/x' }, error: null });
  await inFlight;
  expect(bridge.session.get('athletic_specimen_claim_intent')).toBe('1');
});

it('no pending intent writes nothing, and a failed call drops the key but keeps the intent', async () => {
  bridge.openAuth('signin');
  expect(bridge.getClaimIntent()).toBe(false);
  bridge.supaNext('signInWithOAuth', { data: { provider: 'google', url: 'https://x' }, error: null });
  await bridge.registry['auth-google'].listeners.click[0]();
  expect(bridge.session.keys()).not.toContain('athletic_specimen_claim_intent');
  bridge.reset();
  bridge.openAuth('signin');
  bridge.setClaimIntent(true);
  bridge.supaNext('signInWithOAuth', { data: null, error: { message: 'nope' } });
  await bridge.registry['auth-google'].listeners.click[0]();
  // No redirect happened, so no key may outlive the tap. The MEMORY flag stays armed on purpose: the
  // same person can now finish with email and password and still land on the claim page they asked for.
  expect(bridge.session.get('athletic_specimen_claim_intent')).toBe(null);
  expect(bridge.getClaimIntent()).toBe(true);
});

it('a persisted intent is restored by the boot restore, and the key is consumed', () => {
  expect(bridge.getClaimIntent()).toBe(false);
  bridge.session.set('athletic_specimen_claim_intent', '1');
  bridge.restoreClaimIntent();
  expect(bridge.getClaimIntent()).toBe(true);
  expect(bridge.session.get('athletic_specimen_claim_intent')).toBe(null);
});

it('the restore runs at boot, below the declaration', () => {
  // The bridge can call the function; only the SOURCE proves the app calls it, and the call MUST sit
  // below `let claimIntent` or the temporal dead zone throws at load and the whole app is dead.
  const decl = appSrc.indexOf('let claimIntent = false');
  const call = appSrc.indexOf('\nauthRestoreClaimIntent();');
  expect(decl).toBeGreaterThan(-1);
  expect(call).toBeGreaterThan(decl);
});

it('an absent or junk key leaves the flag alone', () => {
  bridge.restoreClaimIntent();
  expect(bridge.getClaimIntent()).toBe(false);
  bridge.session.set('athletic_specimen_claim_intent', 'nonsense');
  bridge.restoreClaimIntent();
  expect(bridge.getClaimIntent()).toBe(false);
  expect(bridge.session.get('athletic_specimen_claim_intent')).toBe(null);   // junk is consumed too
});

it('a restored intent opens the claim page once, and a second SIGNED_IN does not reopen it', async () => {
  bridge.setSignedOut();
  bridge.session.set('athletic_specimen_claim_intent', '1');
  bridge.restoreClaimIntent();
  const session = { user: { id: 'u1', email: 'a@b.co' } };
  await bridge.authEvent('SIGNED_IN', session);
  await bridge.flushTimers();
  expect(bridge.registry['claim-page']).toBeTruthy();
  expect(bridge.getClaimIntent()).toBe(false);
  bridge.registry['claim-page'].remove();
  await bridge.authEvent('SIGNED_IN', session);
  await bridge.flushTimers();
  expect(bridge.registry['claim-page']).toBeFalsy();      // not a new sign-in, no intent
});

it('signing out and dismissing the overlay both drop a persisted intent', async () => {
  bridge.session.set('athletic_specimen_claim_intent', '1');
  bridge.setClaimIntent(true);
  await bridge.authEvent('SIGNED_OUT', null);
  expect(bridge.getClaimIntent()).toBe(false);
  expect(bridge.session.get('athletic_specimen_claim_intent')).toBe(null);
  bridge.reset();
  bridge.openAuth('signin');
  bridge.setClaimIntent(true);
  bridge.session.set('athletic_specimen_claim_intent', '1');
  bridge.registry['auth-back'].listeners.click[0]();
  expect(bridge.registry['auth-page']).toBeFalsy();
  expect(bridge.getClaimIntent()).toBe(false);
  expect(bridge.session.get('athletic_specimen_claim_intent')).toBe(null);
});

it('a Google user with no profile names gets the name prompt, PREFILLED from full_name', async () => {
  bridge.setSignedIn({ id: 'g1', email: 'morgan@gmail.com' });
  bridge.getState().authSession.user.user_metadata = { full_name: 'Morgan Reyes', name: 'Morgan Reyes' };
  bridge.supaNext('profileRead', { data: { first_name: null, last_name: null }, error: null });
  await bridge.nameFill();
  const page = bridge.registry['namefill-page'];
  expect(page).toBeTruthy();                               // still ASKED, never assumed
  expect(page.innerHTML).toContain("What's your name?");
  expect(page.innerHTML).toContain('value="Morgan"');
  expect(page.innerHTML).toContain('value="Reyes"');
  expect(page.innerHTML).not.toMatch(/\u2014|&mdash;|night/i);
  // Nothing is claimed until Save: connect_profile_by_name inserts APPROVED player_claims, and that is
  // not a claim to make from a string the person never typed here.
  expect(bridge.connectRuns()).toBe(0);
  expect(bridge.getAccountName()).toBe(null);
});

it('a one-word or missing Google name prefills nothing and still asks', async () => {
  for (const meta of [{ full_name: 'Morgan' }, { name: 'Morgan' }, {}, undefined]) {
    bridge.reset();
    bridge.setSignedIn({ id: 'g1', email: 'm@gmail.com' });
    bridge.getState().authSession.user.user_metadata = meta;
    bridge.supaNext('profileRead', { data: { first_name: null, last_name: null }, error: null });
    await bridge.nameFill();
    expect(bridge.registry['namefill-page']).toBeTruthy();
    expect(bridge.registry['namefill-page'].innerHTML).not.toContain('value="Morgan"');
    expect(bridge.connectRuns()).toBe(0);
  }
});

it('a Google user whose profile already carries both names is never prompted', async () => {
  bridge.setSignedIn({ id: 'g1', email: 'morgan@gmail.com' });
  bridge.getState().authSession.user.user_metadata = { full_name: 'Morgan Reyes' };
  bridge.supaNext('profileRead', { data: { first_name: 'Morgan', last_name: 'Reyes' }, error: null });
  await bridge.nameFill();
  expect(bridge.registry['namefill-page']).toBeFalsy();
  expect(bridge.getAccountName()).toEqual({ first: 'Morgan', last: 'Reyes' });
  expect(bridge.connectRuns()).toBe(1);                    // names the person DID confirm, once
});

it('the CSS block ships once, with Google\'s own values and no new !important', () => {
  expect(count(css, '.au-google {')).toBe(1);
  expect(count(css, '.au-or {')).toBe(1);
  // Google's Light theme values, verbatim and deliberately NOT tokenised: they are not ours to theme.
  expect(css).toMatch(/\.au-google \{[^}]*background: #FFFFFF/);
  expect(css).toMatch(/\.au-google \{[^}]*border: 1px solid #747775/);
  expect(css).toMatch(/\.au-google \{[^}]*border-radius: 11px/);
  expect(css).toMatch(/\.au-google \{[^}]*min-height: 48px/);
  expect(css).toMatch(/\.au-google span \{[^}]*font-size: 14px/);
  expect(css).not.toMatch(/\.au-google[^}]*!important/);
  expect(css).not.toMatch(/\.au-or[^}]*!important/);
  // The only saturated colour this round adds is Google's, inside their mark and their fill. Nothing in
  // the block may reach for a colour of our own beyond the app's tokens (the divider's rule and label).
  const blk = css.slice(css.indexOf('.au-google {'), css.indexOf('.au-or::before'));
  const ours = (blk.match(/#[0-9A-Fa-f]{3,8}\b/g) || []).filter((h) => !['#FFFFFF', '#747775', '#1F1F1F', '#F2F2F2'].includes(h));
  expect(ours).toEqual([]);
});
```

- [ ] **Step 10: The CSS.** Append at the END of `public/styles.css` (6141 lines today), inside the
`ACCOUNT DESIGN ROUND - 2026-08-25` banner opened at `:6037`. CRLF.

```css
/* ===== CONTINUE WITH GOOGLE ===== */
/* PORT NOTE: this is NOT a port. Mike's Account handoff draws no Google button on any of its 14 screens
   (grep -rn -i google over docs/design-handoffs/2026-08-24/account/ returns only the webfont links), so
   this block is new and the geometry is matched to .auth-submit (styles.css:2084) on purpose: same 48px
   box, same 11px radius, same Inter face, so the two read as one pair. That match is also what Google's
   guidelines ask for in words ("approximately the same size and similar visual weight").
   GOOGLE'S RULES, not ours: #FFFFFF, #747775 and #1F1F1F are their Light theme values verbatim, from
   developers.google.com/identity/branding-guidelines and from the SVGs in signin-assets.zip. They are
   deliberately NOT tokenised and must not follow our palette: the guidelines forbid a background other
   than their light, dark or neutral, forbid recoloring the mark, and forbid an outdated G. That is also
   why the most saturated object on a deliberately matte screen is allowed to stay: it is held at 18px on
   a white field, which are the only two levers we have and both are already at the quiet end.
   NOTE 1: the label rides in a SPAN. Production ships button { font-size: 16px !important }
   (styles.css:241) as a blanket iOS guard, and a span is not a button, so Google's 14/20 lands with plain
   specificity and this block adds no fifth !important counter.
   NOTE 2: no transition is declared here on purpose. The global rule at styles.css:4472-4479 already
   transitions background-color, border-color, color and transform on the motion tokens, and :4481
   supplies the press. Declaring our own would opt out of the token system.
   NOTE 3: the face is Inter, not Google Sans. Documented deviation: the app loads Inter, Sora and Barlow
   only (index.html:23) and a fourth family for one button is not worth the bytes on tournament wifi. */
.au-google {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  min-height: 48px;       /* the .auth-submit box, so the pair reads as one */
  margin-top: 0;          /* the .au-or row owns the 18px above and below */
  padding: 0 12px;        /* Google's Web spec: 12px left, 10px after the logo, 12px right */
  background: #FFFFFF;
  border: 1px solid #747775;
  border-radius: 11px;
  color: #1F1F1F;
  cursor: pointer;
}
.au-google svg { flex: none; width: 18px; height: 18px; }
.au-google span { font-family: inherit; font-size: 14px; line-height: 20px; font-weight: 500; }
/* #F2F2F2 is Google's own Neutral fill, so even the hover stays inside their palette. */
@media (hover: hover) and (pointer: fine) { .au-google:hover { background: #F2F2F2; } }
.au-google:disabled { opacity: .65; cursor: default; }

/* The OR rule between the primary and the provider button. Same type spec as .auth-label
   (styles.css:2076), so this adds a component and not a new vocabulary. */
.au-or {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 18px 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: var(--muted);
}
.au-or::before, .au-or::after { content: ""; flex: 1; height: 1px; background: var(--border); }
```

- [ ] **Step 11: Version, checks, commit and push.** `APP_VERSION` is `'2026.08.25.N'`, where N is the
next unused number when Task 8 is dispatched. THE CONTROLLER STATES N AT DISPATCH; do not guess it here.
`.24` is already taken by Task 4's fix round, and Tasks 5 to 7 have not consumed theirs yet. `node --check public/app.js && node --check
public/pure.js`. Line endings: `app.js` LF, `pure.js` and `styles.css` CRLF, counted before and after.
`cd test && npx vitest run account-round`, and gate the push on its exit code.

Commit message:

```
feat(account): Continue with Google - one button on both forms under the primary, the claim intent survives the redirect, the name screen prefilled from Google - v2026.08.25.N
```

- [ ] **Step 12: The standing note and the open list, both carried into Task 7's vault write.**

**Standing note, Confirm email (Mike's call 4).** It is OFF today, and OFF is the safe state for both
halves of this feature. Flipping it ON arms two failures and both become required work IN THE SAME PUSH:

- **H2, an unconfirmed password account loses its password silently.** With Autoconfirm on, every password
  signup is confirmed on the spot, so linking a Google identity to the same address is non-destructive:
  same user id, both identities kept (supabase/auth `internal/models/linking.go:62-205`, applied at
  `internal/api/external.go:319-341`). Turn Confirm email ON and an unconfirmed account can exist; when
  that person taps Continue with Google, `RemoveUnconfirmedIdentities` nulls `encrypted_password` and
  destroys the other identity rows (`external.go:409-416`, `internal/models/user.go:1020-1051`). They stay
  signed in through Google, so nothing looks wrong until the day they try their password.
- **H3, the reverse dead end.** With Confirm email ON, a Google-only user who tries to create a password
  account on the same address gets an obfuscated HTTP 200 with a fake user, `identities: []`, and no email
  is ever sent (`internal/api/signup.go:280-300`, `:347-378`). The app's current no-session branch
  (`public/app.js:6701-6708`) renders "Check your email" and the person waits forever. The fix, when it is
  needed: treat `Array.isArray(res.data.user.identities) && res.data.user.identities.length === 0` as
  "that email already has an account" and route to sign-in. With Confirm email OFF the same case returns a
  real 422 that `friendlyAuthError` already maps (`public/app.js:6627`).

**Also known and accepted, not fixed here (H12):** the register-then-Google path loses its payoff.
`regSubmittedTeam` (`:3507`), `regAutoAttached` (`:3511`), `pdTournamentView` (`:3499`) and `accountName`
all reset in the redirect, and the auto-attach at `:4043` needs `accountName`, which stays null for a
Google user until a name is saved. The persisted claim intent turns that landing into the CLAIM PAGE,
which is where the person was heading. Do not widen Task 8 to persist the register payoff.

**Open, and only Mike or one real Google login can close them.** Every one is a way this is green in
vitest, green in the drive, and still broken for the first player who taps it:

1. **Is the Google provider enabled in the Supabase dashboard**, with a client id and secret? A wrong
   secret fails at the token exchange, which is AFTER Google's consent screen, so it is invisible until
   somebody actually signs in.
2. **Does a Google Cloud OAuth client exist**, with `https://<ref>.supabase.co/auth/v1/callback` in its
   Authorized redirect URIs? The ref is `mlzblkzflgylnjorgjcp`, read from `public/supabase-config.js:5`;
   the pattern is from `supabase.com/docs/guides/auth/social-login/auth-google.md`. The exact string is
   DERIVED and must be read off the dashboard before it is saved anywhere.
3. **The Redirect URLs allow-list.** With Site URL `https://athletic-specimen.com`, `location.origin`
   should match on hostname, scheme and port with no dashboard change
   (supabase/auth `internal/utilities/request.go:109-113`), but the allow-list is a separate field and is
   UNCONFIRMED. If it is rejected the person lands on the Site URL root with a valid session and NO error
   (`request.go:75-89`, `:129-136`).
4. **One real login on an address that already has a password account.** The source says it links cleanly,
   same user id, both identities kept, so everything keyed on `auth.uid()` survives. Verify it once before
   this reaches players, and check afterwards that the `profiles` row, the claimed player and the team
   history all survived.
5. **Does `sessionStorage` survive the round trip on Mike's actual phone.** The whole intent design rests
   on the redirect returning to the SAME tab. If Google opens in an iOS in-app browser or a new tab the
   intent is lost and the person lands on the hub. The failure is soft (they can tap claim again), which
   is why sessionStorage is still the right choice, but it should be SEEN once rather than assumed.
6. **What `raw_user_meta_data` actually holds for a Google identity here.** The prefill reads `full_name`
   with `name` as the fallback, both of which the provider source says are present on both paths, but only
   a real login proves it. It does NOT change the answer: neither path carries `given_name` or
   `family_name`.
7. **Consent-screen branding.** Without it the consent screen shows `mlzblkzflgylnjorgjcp.supabase.co`,
   which Supabase's own doc says "does not inspire trust and can make your application more susceptible to
   successful phishing attempts". The two fixes are brand verification (a few business days) or a Supabase
   custom domain. Mike's call, and it is the first thing a player will see.
8. **Whether Google's app verification objects to Inter in place of Google Sans**, and whether Google Sans
   may be served as a webfont at all. The guidelines state the font requirement without stating a
   tolerance.

---

### Task 7: Verification + the vault

- [ ] **Step 1: Bytes on prod** — `APP_VERSION` matches; `grep -c` for `openGatePage`, `passwordMeterScore`, `PASSWORD_RECOVERY`, `openResetPage`, `openAcctPage`, `acc-card` in the served files.
- [ ] **Step 2: Drive (read-only; Mike's Chrome; §63):** in a 390 frame with every auth write stubbed (`signUp`, `signInWithPassword`, `resend`, `resetPasswordForEmail`, `updateUser`, `signOut`, the profiles update): the card (rows, initial, no tag), each edit screen's markup, the reveal on a DUMMY value typed by the script (never a real password), the meter's labels for `abc` / `password` / `Passw0rd!`, the forgot screen (no send), the wall by setting `state.authSession = null` in the frame and activating the Tournament tab (then restore), the sign-out confirm (cancel). **Google (Task 8):** `#auth-google` is present exactly once on the sign-in form and once on create account at 390 and absent on forgot (`document.getElementById('auth-google') === null`); its `getBoundingClientRect()` matches `#auth-submit`'s width with a height at or above 44; the inner SVG carries the conic gradient and none of the four outdated hexes, checked ON A REAL iPHONE as well, because the mark paints through a `foreignObject` and WebKit was never tested (if it does not paint there, Task 8 Step 1 carries the decision rule: the bundle's official PNG as a data URI in the same button, never a flat or monochrome G); and ONE real tap navigates to `accounts.google.com`, where the drive CANCELS (no account picked, nothing signed in) and then returns and confirms the app boots clean. A `redirect_uri_mismatch` or a "provider is not enabled" page there is itself the useful fact: it means the Supabase or Google console side is not wired. Console clean, and specifically no `sessionStorage` exception. Screenshots if capture works; facts either way.
- [ ] **Step 3: Restore the tab.**
- [ ] **Step 4: Vault:** log, current, decisions (anything decided in build), debugging, NOW, Tasks (C100 DONE; C101 gains the `profiles.email` sync), `12-history/task-#4-account-handoff-session18.md` BEFORE marking done; plus Task 8's standing note (flipping Confirm email ON arms H2 and H3 and makes both required work in the same push) and its open list.
- [ ] **Step 5: Hand back** with AskUserQuestion: Task 10 of the Manage plan (canvas consent) / C101 the data round / C102 the extraction.
