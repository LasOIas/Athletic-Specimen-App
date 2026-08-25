# Account Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. (This project's §38 rule: UI edits are executed INLINE by Fable unless Mike picks subagent-driven at the hand-back.)

**Goal:** Port Mike's Account handoff: the overlay wall with an exit, sign-in/sign-up polish (reveal, meter, 8 characters), forgot/reset with a recovery router, the account card as a navigation root with Name / Email / Password screens and a sign-out confirm, plus the dormant "Check your email" branch.

**Architecture:** Vanilla-JS SPA. Every auth surface is a body-appended `.auth-page` overlay (the `openNameFillOverlay` precedent) so `partialRender` never wipes it; four overlay ids (`#auth-page`, `#gate-page`, `#reset-page`, `#acct-page`); every Supabase Auth call awaited with a visible failure; one password-minimum constant. CSS appended under one banner. Tests are vm-sandbox string assertions with a document-stub upgrade that captures created overlays.

**Tech Stack:** vanilla JS, supabase-js 2.39.5 (`signUp`, `signInWithPassword`, `resend`, `resetPasswordForEmail`, `updateUser`, `signOut`, `onAuthStateChange`), vitest.

**Spec:** `docs/superpowers/specs/2026-08-25-account-handoff-design.md`

## Global Constraints

- `APP_VERSION` (`public/app.js` line 28) continues `'2026.08.25.N'` from `.15` (Task 1 = `.16`); a new local day restarts at `.1`.
- `node --check public/app.js && node --check public/pure.js` after every edit; commit + push per task; every chain gates on vitest's EXIT code.
- Line endings: `app.js` LF; `pure.js` + `styles.css` CRLF (count `\r\n` vs `\n` before and after). Never `git stash` a `public/` file.
- No em dashes; never "night"; no neon; skill never public; passwords never trimmed, logged, echoed or placed in `state`; a drive never types a real password; no Supabase write in a drive.
- New `!important` only as the four documented iOS counters (`.au-reveal` 13px, `.au-alt2` 13.5px, `.acc-out, .acc-close` 15px) with a PORT NOTE each; no wildcard motion selectors; PORT NOTEs on every ported block.
- Every `redirectTo` / `emailRedirectTo` is `location.origin`.
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

### Task 7: Verification + the vault

- [ ] **Step 1: Bytes on prod** — `APP_VERSION` matches; `grep -c` for `openGatePage`, `passwordMeterScore`, `PASSWORD_RECOVERY`, `openResetPage`, `openAcctPage`, `acc-card` in the served files.
- [ ] **Step 2: Drive (read-only; Mike's Chrome; §63):** in a 390 frame with every auth write stubbed (`signUp`, `signInWithPassword`, `resend`, `resetPasswordForEmail`, `updateUser`, `signOut`, the profiles update): the card (rows, initial, no tag), each edit screen's markup, the reveal on a DUMMY value typed by the script (never a real password), the meter's labels for `abc` / `password` / `Passw0rd!`, the forgot screen (no send), the wall by setting `state.authSession = null` in the frame and activating the Tournament tab (then restore), the sign-out confirm (cancel). Console clean. Screenshots if capture works; facts either way.
- [ ] **Step 3: Restore the tab.**
- [ ] **Step 4: Vault** — log, current, decisions (anything decided in build), debugging, NOW, Tasks (C100 DONE; C101 gains the `profiles.email` sync), `12-history/task-#4-account-handoff-session18.md` BEFORE marking done.
- [ ] **Step 5: Hand back** with AskUserQuestion: Task 10 of the Manage plan (canvas consent) / C101 the data round / C102 the extraction.
