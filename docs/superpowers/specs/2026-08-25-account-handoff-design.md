# Account handoff — design spec (2026-08-25)

**Source of truth:** Mike's Claude Design Account handoff (14 screens), archived at
`docs/design-handoffs/2026-08-24/account/` (text). The PNGs are unusable: eleven are blank (every
`.auth-page` overlay screen) and the three that rendered are desktop captures, so **the screen HTML plus
`_rounds.css:2306-2396` (the ACCOUNT + AUTH FLOW block, 33 selectors, none in prod) is the spec.** Builds
on the Home/shell/motion, Tournament and Manage rounds (v2026.08.24.5 → v2026.08.25.15). The recon
(5 Opus agents + critic, 286 reads; `scratchpad/recon-account.json`) is the ground truth for every delta.

## Scope: what actually changes

**Already prod:** the `.auth-page` overlay shell, the brand block, the sign-in title/sub, every field and
its attributes, the submit/toggle labels, the `.auth-err` box, the 16px `input.auth-input` iOS guard, the
`.pd-avic` bubble and its handler, the anon nav, the `.kc-*` confirm kit, the avatar disc, the
"Player · Team" line, sign-out itself, `detectSessionInUrl: true`.

**Real work — this round is auth behaviour more than pixels.** Prod makes exactly two Auth calls
(`signUp`, `signInWithPassword`); there is no forgot/reset, no change email/password, no confirm-screen,
no account edit page, and the account card is a read-only dialog. In build order:

1. **The auth page + the wall**: the CSS block, the Show/Hide reveal, the strength meter, 8 characters, the
   per-mode sub-line, "Forgot your password?", `required` + the design's error copy, the wall as the design's
   overlay WITH an exit, the wall's "Create an account" opening the sign-up form (a live bug).
2. **Forgot / reset**: the forgot screen, the sent screen, the recovery router, the reset screen, the done
   screen, the post-sign-in work after a recovery.
3. **The account card** as a navigation root: the `.acc-*` card, rows, the sign-out confirm, one edit
   overlay id.
4. **Name**, 5. **Email** (+ the pending screen), 6. **Password**.
7. **Tests + drive + vault.**

## Mike's decisions (AskUserQuestion 2026-08-25)

1. **The design's overlay wall, WITH an exit** (over keeping prod's in-tab "This page is yours"). The
   full-screen "Sign in to see the tournament" wall gains a back control and its copy is softened to what
   is actually public (anonymous Home keeps its live board; register and rules stay reachable).
2. **Build all fourteen now** (over "honest now, auth flows next").
3. **8 characters everywhere** (sign-up, reset, change).
4. **Confirm email stays ON** was his pick — and his dashboard read then showed it is **OFF** today. Ruling:
   the "Check your email" confirmation screen ships as the branch `signUp` takes when it returns no session
   (dormant while OFF, live the moment he flips it); no verify-later banner and no Unverified tag in either
   state (neither is buildable: ON gives no session to hang them on, OFF auto-confirms).
5. **The five Auth settings (his read):** Confirm email OFF · Secure email change OFF (one link, to the new
   address; the old address stays live until it is clicked) · Secure password change OFF · Minimum password
   length 6 (the client's 8 is stricter; no nonce for `updateUser`) · Site URL `https://athletic-specimen.com`.

## Decisions I made (stated once, Mike's to overrule)

### Cross-cutting

- **Every link returns to the site root.** `redirectTo` / `emailRedirectTo` = `location.origin` on `signUp`,
  `resend`, `resetPasswordForEmail`, `updateUser({ email })`. There is no `vercel.json`, so any deeper path
  404s; the root is the Site URL, so no allow-list entry is needed; `detectSessionInUrl` already consumes
  the fragment.
- **The recovery router ships in the SAME push as the forgot screen**, above `isNewSignIn` in
  `onAuthStateChange` (`event === 'PASSWORD_RECOVERY'`), any Supabase call inside it deferred with
  `setTimeout(0)` per the listener's storm guard. Today an unrouted recovery link is a silent sign-in.
- **Overlay ids:** `#auth-page` stays sign-in / create-account / forgot / forgot-sent / signup-sent (all
  pre-session or dormant states of one `authMode`); `#reset-page` (recovery, no back); `#acct-page` (the three
  edit screens, back rebuilds the card); `#gate-page` (the wall). The account card (`.popup-overlay`,
  z-index 12000) is torn down before an edit page opens and rebuilt by its back control — the z-index stack
  allows nothing else; its scrim-tap dismiss stays (it is a leaf again the moment an edit page is up).
- **Passwords:** never trimmed (prod's raw-value gate stays), never logged, never put in `state`, never
  echoed except by the reveal control; a drive never types a real password and never exercises the
  reveal. The client minimum is 8 in ONE constant (`AUTH_PASSWORD_MIN`) read by the gate, the placeholders,
  the error copy and the server-error mapping. Sign-in keeps no length gate.
- **"Current password" checks are a second `signInWithPassword`** against the signed-in account (the listener
  returns at `isNewSignIn === false`, so nothing re-runs); a failure reads "That password is wrong." and
  costs one auth rate-limit slot — the copy says so nowhere, the cooldown below covers it.
- **Every email send is awaited and can fail visibly.** Resend controls (signup-sent, forgot-sent,
  email-sent) call the real API, show "Sent again" only on success, disable for a 60s cooldown, and write a
  rate-limit or network failure into an `.auth-err` line the design forgot to draw on those screens.
  Supabase deliberately answers "success" to `resetPasswordForEmail` for unknown addresses, so the sent
  copy says the app asked for a link, never that one was delivered.
- **The strength meter is advisory and honest.** One bar, three filled states (the CSS wins over the README's
  "four-step"), labels that say what is measured: `Too short` (< 8) · `OK` (8+, under three character kinds)
  · `Good` (8+ with three kinds, or 12+ with two) — never "Strong". Fill colours as designed; the transition
  uses `--m-state` / `--e-settle` (the design's `.18s ease` is not one of the five durations). `--warn`'s
  "admin cautions only" comment gets a one-line amendment.
- **The reveal control** is the design's text Show/Hide inside the field, raised to the handoff's own floors:
  a 44px tap box (padding, not height) and 13px type (a documented iOS counter, `!important`).
- **CSS:** the `.au-*` and `.acc-*` families ported at the END of `styles.css` under an `ACCOUNT DESIGN
  ROUND - 2026-08-25` banner; the `.vb*` banner family is NOT ported (no banner ships). Four documented
  iOS counters (`.au-reveal` 13px, `.au-alt2` 13.5px, `.acc-out/.acc-close` 15px — matching the desktop
  capture, where prod's 16px rule had already won — and none on `.vb-a`). `.acc-row`'s `transform: none`
  is dropped (the shipped motion press-dip is Mike's round and stays); `.acc-rv` gets `white-space:
  normal` beside its `overflow-wrap: anywhere` (the `.ckx-nm` precedent). `.au-center` is dead on arrival
  and not ported. Desktop: the design ships none; the wall's `.auth-inner` 340px stands and the dead
  `.tn-gate` desktop clamp goes with the gate.
- **Copy law:** no em dashes; "night" nowhere; nothing the app cannot know ("It expires in an hour" is
  dropped, the expiry is a dashboard value; "Cancel this change" is dropped, GoTrue has no cancel). The
  two library facts that are true stay: "Until you tap it, sign in with your old address." (Secure email
  change OFF) and "You stay signed in on this phone." (`updateUser` returns a refreshed session).
- **Toasts** use `makeSaveToast` / `settleSaveToast` (z-index 10000), never the kiosk `.cik-toast`.
- **The DB half of a change is C101's:** `profiles.email` and `profiles.display_name` are written only by
  the INSERT trigger today. The Name screen writes `display_name` itself (see below); an email change
  leaves `profiles.email` stale until C101 lands a trigger or an RPC — the Manage admin-seat lookup keeps
  matching the old address, stated in the plan, not hidden.

### 1. The auth page and the wall (screens 01–03 + the sent branch)

- **Sign in / create account** keep prod's markup and ids; additions: `.au-field` wrapper + `.au-reveal`
  on the password; on create-account the `.au-strength` bar under the password, `data-min` = 8, placeholder
  "At least 8 characters", the sub-line "One account for every tournament you play." (sign-in keeps
  "Sign in to claim your team and follow your games."); `required` on every input; `.au-alt2` "Forgot your
  password?" between submit and the mode toggle; error copy: empties → "Fill in every field."; a malformed
  email → "That email doesn't look right." (client, before the server); the name rule keeps prod's
  `splitFullNameParts` message; short password → "Your password needs at least 8 characters." (no "new" on
  create-account); the server mappings stay (`friendlyAuthError`, its 6 → 8). The design's client-side
  "That password is wrong." on sign-in is never ported — sign-in submits and lets Supabase answer.
- **After a valid submit:** sign-in and an instant-session signup close the overlay in place (as today);
  a no-session signup (Confirm email ON) renders `authMode = 'signup-sent'` in `#auth-page`:
  `.au-mark.is-mail`, "Check your email", "We sent a link to <b>email</b>. Tap it, then sign in.",
  "Didn't get it? Resend" (`auth.resend({ type: 'signup', email, options: { emailRedirectTo } })`,
  cooldown, error line), "Back to sign in". The typed address is kept in memory for the resend; a reload
  loses it, and the screen says to sign in after the link either way.
- **The wall:** signed-out visits to the Tournament tab's personal views open `#gate-page.auth-page`
  (the same condition `buildTournamentGateHTML` uses today; register and rules stay in front of it):
  the brand block, "Sign in to see the tournament", "Your team, your games and your bracket run are for
  players. Takes a minute.", "Sign in" → `openAuthPage('signin')`, "New here? Create an account" →
  `openAuthPage('signup')`, and a `.auth-back` that returns to Home (`activateMainTab('home')`). The
  in-tab `.tn-gate` markup and its desktop clamp are retired; the tab renders an empty panel behind the
  overlay. Sign-out from the card lands in place (the wall appears only if the viewer is on a personal view).

### 2. Forgot / reset (screens 05–08)

- `authMode = 'forgot'`: `.auth-back` to sign-in, "Forgot your password?", "Enter your email and we'll send
  a link to set a new one.", the email field, "Send reset link" → `resetPasswordForEmail(email, {
  redirectTo: location.origin })` → `authMode = 'forgot-sent'`: `.au-mark.is-mail`, "Check your email",
  "If <b>email</b> has an account, a reset link is on its way.", "Didn't get it? Resend" (same call,
  cooldown, error line), "Back to sign in". The design's "Open the link from the email" primary is a canvas
  crutch and does not ship.
- **Router:** `PASSWORD_RECOVERY` → `openResetPage(session)`: `#reset-page.auth-page` with no back: "Set a
  new password", "For <b>email</b>", new password (reveal + meter, min 8), "Type it again" (`data-match`),
  "Save new password" → `updateUser({ password })` → the same overlay in its done state: `.au-mark.is-ok`,
  "Password changed", "You're signed in.", "Go to the tournament" (`activateMainTab('tournament')`).
  Validation order: empty → length → match. After `updateUser` succeeds the post-sign-in work runs
  explicitly (`afterSignInWork(session)`, extracted from the listener: role, tournaments, claimed player,
  name-fill) so an organizer recovering on a device that was already signed in gets Manage back.
- A recovery arriving while `#auth-page` is open closes it first (the listener's existing `closeAuthPage`).

### 3. The account card (screens 09, 14)

- `openAccountMenu` renders `.popup-card.card.acc-card`: `.acc-top` (`.acc-av` initial from the NAME, email
  as the fallback — `authInitial` changes with it, so the header chip too), `.acc-nm` name, `.acc-sub`
  "Player · Team" / role; `.acc-list` rows NAME / EMAIL / PASSWORD (`button.acc-row` with `.acc-rl`, `.acc-rv`,
  `.acc-chev`; the Email row carries a `Pending` `.acc-tag` with the new address only while
  `session.user.new_email` is set); `.acc-foot`: `.acc-out` "Sign out" (opens the confirm), `.acc-close`
  "Close" (dismisses in place — the design's jump to Home is a canvas artifact). Rows tear the card down and
  open `#acct-page` with the screen; `.auth-back` there calls `openAccountMenu()` again.
- **Sign out confirm:** the `.kc-card` dialog "Sign out?" / "You'll need your email and password to get back
  in." / danger "Sign out" / "Cancel" → prod's optimistic clear-render-signOut. `state.account` widens to
  `{ id, email, emailVerified, pendingEmail }` from the session user (free on every auth event).

### 4. Name (screen 10)

- "Your name" / "This is what teammates and organizers see." / First + Last prefilled from `accountName`
  / "Save". Validation: `required` + `splitFullNameParts` (two characters each). Write: a plain
  `profiles` update `{ first_name, last_name, display_name: first + ' ' + last }` for `auth.uid()` with a
  `.select('id')` read-back (the self-update policy; the build verifies the grant on prod before relying on
  it) — never `connect_profile_by_name`, which relinks roster rows under the new name and unlinks nothing.
  Then the `accountName` cache, `makeSaveToast('Name saved')`, back to the card.

### 5. Email (screens 11–12)

- "Change email" / New address + current password (reveal) / "We ask for your password to be sure it's you.
  The new address has to be confirmed before it takes over." / "Send confirmation". Validation: `required`,
  the email shape, then the current-password check; then `updateUser({ email }, { emailRedirectTo })`.
  Success → `#acct-page` pending state: `.au-mark.is-mail`, "Confirm your new email", "We sent a link to
  <b>new</b>. Until you tap it, sign in with your old address.", "Done" (back to the card), "Resend the
  link" (`auth.resend({ type: 'email_change', email: new })`, cooldown, error line). No "Cancel this
  change" (no API); the sentence "To keep your old address, just don't tap the link." replaces it.
  `state.account.pendingEmail` drives the card's tag; `profiles.email` sync is C101.

### 6. Password (screen 13)

- "Change password" / "You stay signed in on this phone." / Current (reveal) + New (reveal + meter, min 8) +
  "Type it again" (added; the design's reset screen has it, its change screen did not) / "Save".
  Validation: empties → length → match → new ≠ current ("Pick a password you haven't used here."). The
  current-password check, then `updateUser({ password })`, `makeSaveToast('Password saved')`, back to the
  card. "Forgot your current one?" opens `authMode = 'forgot'` in `#auth-page` (this round ships it).

### Continue with Google (added 2026-08-25)

Not one of the 14 screens: Mike's handoff draws no Google button anywhere (`grep -rn -i google` over
`docs/design-handoffs/2026-08-24/account/` returns only the webfont links), and there is no Google sign-in
in the repo today. It is a new element, decided in its own round after the recon (4 lenses plus a critic), whose digest and
design options are archived in the vault at `C:\Ai Master\Projects\Athletic Specimen\12-history\assets\`
as `2026-08-25-google-signin-recon-digest.md` and `2026-08-25-google-signin-design-options.md`. It ships as
Task 8, before the drive.

**Mike's four calls (AskUserQuestion, 2026-08-25).**

1. **Both forms, one string.** The button renders on sign-in AND on create-account, labelled "Continue
   with Google". Not on forgot, not on either sent screen, not on the wall, and never on a signed-in
   surface. One `formInner` template already serves both form states, so one insertion does it. "Continue"
   is the only one of Google's three approved strings that is honest here: a Supabase OAuth redirect has
   no separate sign-up, the first redirect creates the user, so "Sign up with Google" would lie to the
   returning player who taps it and lands in their existing account. The signed-in exclusion is not taste:
   `signInWithOAuth` removes the session before it builds a URL and that removal notifies nobody, so a
   signed-in person who taps and then backs out at Google looks signed in until their next reload.
2. **The name is asked for, and prefilled.** Google carries no `given_name` and no `family_name` on either
   provider path, only one display string (`full_name`, with `name` as its alias). `handle_new_user` seeds
   `display_name` from that string but `first_name` / `last_name` only from the keys the app's own
   `signUp` writes, so every Google user reaches the existing name-fill overlay with both names null and
   would reach it with or without this round. So the overlay stays, and it opens PREFILLED: the display
   string split on the last space, both halves run through `splitFullNameParts`, written into the two
   `value` attributes, escaped. The person taps Save or fixes the split. Nothing is written to `profiles`
   and no `player_claims` row is made until they do, which matters because `connect_profile_by_name`
   links roster rows on an exact name match and inserts APPROVED claims. A last-space split is a guess
   ("Mary Jo Van Der Berg" splits wrong), which is exactly why it is shown rather than applied. No
   migration and no silent seeding: seeding from the trigger would need a Supabase write and would make a
   roster claim from a string nobody confirmed.
3. **Under the primary, white, with an OR rule.** Full width, `#FFFFFF`, below the Sign in / Create
   account button, with a hairline "OR" divider row between them. The mark is Google's CURRENT gradient G,
   inline SVG, taken verbatim from their own bundle: the flat four-color G that every older tutorial shows
   appears in none of the 24 official SVGs and is the "outdated Google G" their guidelines list under
   Don't. Same 48px box and 11px radius as `.auth-submit`, which is the guidelines' own "approximately the
   same size and similar visual weight"; the divider reuses `.auth-label`'s type spec, so this adds a
   component and no new vocabulary. `#FFFFFF`, `#747775` and `#1F1F1F` are Google's Light theme values
   verbatim and are deliberately NOT tokenised: they are not ours to theme, the guidelines forbid a
   background other than their light, dark or neutral, and they forbid recoloring the mark. The face is
   Inter, not Google Sans (a documented deviation: a fourth webfont for one button is not worth the bytes).
   The mark paints its gradient through a `foreignObject`, which was verified in Chrome and never on WebKit,
   so the drive looks at it on a real iPhone. If it does not paint there the substitute is decided in
   advance: the bundle's own 80 by 80 PNG as a `data:` URI in an `<img>` in the same button and the same
   18px box, and the structural test becomes either/or. Never a flat, monochrome or redrawn G, on any
   platform: a broken gradient is a rendering bug, an outdated G is a compliance one.
   The order preserves the rank this round spent six tasks establishing, and it keeps First name, Last
   name, Email, Password and the meter above the fold at 390. `.au-google` and `.au-or` go under the
   ACCOUNT banner with a PORT NOTE naming the branding rules; no new `!important` (the label rides in a
   `<span>`, which production's `button { font-size: 16px !important }` guard does not reach), no wildcard
   motion selectors, and no transition of its own (the global button rule already supplies the tokens).
4. **Confirm email stays OFF, and that is the decision that matters.** No warning copy on the button and
   no same-email special case in the code: with Autoconfirm on, every existing password account is already
   confirmed, so Supabase links a Google identity to the same address non-destructively (same user id,
   both identities kept, everything keyed on `auth.uid()` intact). **Standing note: flipping Confirm email
   ON arms two failures and both become required work in the same push.** One, an unconfirmed password
   account that taps Continue with Google loses its password silently (`RemoveUnconfirmedIdentities` nulls
   `encrypted_password` and destroys the other identity rows; they stay signed in through Google, so
   nothing looks wrong until the day they try their password). Two, a Google-only user who tries to create
   a password account on the same address gets an obfuscated HTTP 200 with `identities: []` and no email
   is ever sent, so the "Check your email" branch this round already ships would leave them waiting
   forever; the fix is to read `data.user.identities.length === 0` as "that email already has an account"
   and route to sign-in. With the toggle OFF that same case returns a real 422 that `friendlyAuthError`
   already maps.

**Behaviour.** One awaited `signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin } })`
per tap, the button disabled synchronously before the first await and deliberately left disabled on the
success path because the page is leaving. The call returns `{ data: { provider, url }, error }` and never
a session; the library navigates the document itself, so the app never calls `location.assign`. A failure
writes one line into the same `.auth-err` box the form already renders, "Google did not answer. Try again,
or use your email.", and hands the button back. That line is deliberately not routed through
`friendlyAuthError` (no OAuth arm, so a raw server string would fall through), and it is the ONLY feedback
there is: an OAuth failure is never delivered to `onAuthStateChange`. `flowType` stays the client default,
which is implicit: the tokens come back in the URL fragment and `detectSessionInUrl` already consumes them,
and the recovery marker regex cannot match an OAuth fragment, so the two flows stay separate.

**One way back does NOT re-evaluate anything, and it leaves a dead button.** On iOS Safari the tap freezes
the page rather than unloading it: the person sees the consent screen, presses Back, and the page is
restored from the back/forward cache with every module `let` exactly as they left it, including the
disabled button and no error line to explain it. The app's existing `pageshow` hook only calls
`triggerRefresh`, which never touches the overlay. So this round adds its own module-scope `pageshow`
listener: on `event.persisted` it re-enables the button, repaints `#auth-page` if one is open, and drops
the persisted claim intent key, because no redirect completed. The in-memory flag stays, exactly as on the
failure path, so the email fallback still finishes the journey.

**The redirect destroys module state, and one piece of it has to survive.** A full page navigation
re-evaluates `app.js`, so every module `let` is back at its initializer. `claimIntent` is the one that
matters: without it, the person who tapped "claim your team", signed in with Google and came back lands on
the hub with no claim page and no explanation. It is persisted to `sessionStorage` under
`athletic_specimen_claim_intent` immediately before the call, restored on the line straight after
`let claimIntent = false;` (below the declaration, or the temporal dead zone kills the app at parse),
consumed on read, and the key removed at every clear site. Every access is wrapped in try/catch, because
Safari private mode and several in-app browsers throw on `sessionStorage` outright and the restore runs at
module scope. `sessionStorage` and not `localStorage`: the redirect returns to the same tab, and an
abandoned intent should die with the tab. A FAILED call drops the key but keeps the in-memory flag, so the
same person can finish with email and password and still land on the claim page. Known and accepted: the
register success screen's payoff (`regSubmittedTeam`, `regAutoAttached`, `pdTournamentView`, the
`accountName` the auto-attach needs) does not survive the redirect. The persisted intent turns that landing
into the claim page, which is where the person was heading; persisting the register payoff is not this
round's work.

**Not decided here, and not inspectable from the repo:** whether the Google provider is enabled in the
Supabase dashboard with a client id and secret; whether a Google Cloud OAuth client exists carrying
`https://<ref>.supabase.co/auth/v1/callback`; whether the Redirect URLs allow-list accepts `location.origin`
(a rejection lands the person on the Site URL root with a valid session and no error); what
`raw_user_meta_data` actually holds for a Google identity here; whether `sessionStorage` survives the round
trip on an iPhone, where Google may open in an in-app browser or a new tab; and the consent screen's
branding, which without verification or a Supabase custom domain shows the project ref, the first thing a
player sees. The plan's Task 8 carries all of them as its open list.

### Not ported, on purpose

The verify-later banner and the `.vb*` family; the Unverified tag; "Cancel this change"; "Open the link
from the email"; "It expires in an hour"; the client-side wrong-password rule; password trimming; Close →
Home; `.au-center`; `.acc-row { transform: none }`; the `.cik-toast` and the sessionStorage toast hand-off;
the design's sign-out destination (the no-exit wall); `aria-invalid` stays unset as in prod (a next-round
a11y item with the reveal's `aria-pressed`).

## Tests

- New `test/account-round.test.js` with a document-stub upgrade (the `manage-round` precedent: a capturing
  `createElement`, an id registry for `getElementById`/`querySelector`, `signOut`/`resend`/
  `resetPasswordForEmail`/`updateUser` recorders on the supa stub) so the DOM-mutating openers can be
  driven: `openAuthPage('signup')` renders the meter, `required`, the 8-character placeholder and the
  forgot link; `openAuthPage('signin')` renders no meter and no length gate on submit; the reveal toggles
  `type` and its label; `AUTH_PASSWORD_MIN` is the only 6/8 literal; a no-session signup renders the sent
  screen with a resend that awaits the stub and shows its error; the forgot flow calls
  `resetPasswordForEmail` with the root `redirectTo`; a synthetic `PASSWORD_RECOVERY` event opens
  `#reset-page` above the `isNewSignIn` gate; the reset screen refuses a mismatch and a short password
  before calling `updateUser`; `afterSignInWork` runs after a recovery; the card renders three rows, the
  confirm, and dismisses in place; a row tears the card down and opens `#acct-page`; Name refuses a
  one-letter part and writes the three columns with a read-back; Email checks the password first and
  renders the pending screen; Password checks all four rules; the CSS block ships once with exactly the
  documented `!important` counters and no `.vb`; no em dash and no "night" in any emitted string; the
  wall's alt opens the sign-up mode; `.tn-gate` is gone from app.js and styles.css.

- Task 8 adds its own block: the Google button renders exactly once on sign-in and once on
  create-account and on no other state, under the primary, carrying the current gradient mark and none
  of the four outdated hexes; one tap sends exactly one `signInWithOAuth` with the provider and the
  origin and disables the button synchronously, a second tap while it is in flight sends nothing, and
  a failed or thrown call writes the friendly line and never the raw server string; a pending claim
  intent is written to `sessionStorage` before the call and only then, a failed call drops the key but
  keeps the flag, the boot restore consumes the key and sits below the declaration (asserted against
  the SOURCE), and both a sign-out and the back chevron drop it; a Google user with no profile names
  is still ASKED, with the fields prefilled from `full_name` and nothing claimed until Save, while a
  one-word name prefills nothing; a persisted `pageshow` hands the disabled button back, rebound once, with
  the storage key dropped and the memory flag kept, while a non-persisted one changes nothing; and the pure
  splitter splits on the last space. The harness gains a
  real Map-backed `sessionStorage` for that half only, `signInWithOAuth` on the auth stub, `assign` /
  `replace` spies proving the app never navigates itself, and `'auth-google'` in `AUTH_CONTROL_IDS`.
  Every storage assertion reads a NAMED key, never `length`.

## Global constraints (every task)

- `APP_VERSION` continues `'2026.08.25.N'` from `.15` (`.16` first; a new local day restarts at `.1`);
  `node --check` both files after every edit; commit + push per task; chains gate on vitest's exit code.
- No em dashes; never "night"; no neon; skill never public; 390 primary / 1024 desktop; passwords never
  logged, echoed or typed by a drive; no Supabase write in a drive.
- Line endings: app.js LF, pure.js + styles.css CRLF; no new `!important` beyond the four documented
  counters; PORT NOTEs on every ported block; no wildcard motion selectors.
