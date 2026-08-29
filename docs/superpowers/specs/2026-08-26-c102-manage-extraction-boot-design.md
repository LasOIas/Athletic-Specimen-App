# C102: extract Manage out of app.js and collapse the boot renders. Design.

Date: 2026-08-26. Baseline: HEAD `38284e6`, `APP_VERSION = '2026.08.25.50'` (`public/app.js:34`),
vitest 39 files / 1233 tests green. Recon: four read-only lenses plus a synthesis (digest archived at
`12-history/assets/2026-08-26-c102-recon-digest.md` at the round's end). Every line number below was read
from the repo at that HEAD; the plan re-reads them before each task because the split shifts every number
past the cut.

## 1. Goal

Two mechanical changes with no visible difference, proven rather than promised:

1. **The boot paints once where it can, and never more than twice** (plus one on the 5000ms boot valve
   path, `app.js:15109`, which is unchanged). Today a signed-in owner's cold boot runs `render()` three or
   four times inside ~900ms, and the number changes from boot to boot.
2. **The Manage surfaces leave `public/app.js`.** One contiguous block of 5,155 lines moves verbatim into
   a new classic script, `public/manage.js`, behind the same globals. `app.js` drops from 15,194 lines to
   roughly 10,040.

"No behaviour change" is the whole deliverable. It is proven with (a) the full suite green with no test
deleted, skipped or weakened, (b) a byte-for-byte diff of every Manage builder's HTML before and after the
split, (c) a boot render trace identical before and after the split and showing the new counts after the
boot round, and (d) a facts-only drive of the live app in Mike's Chrome at 390 and 1280.

## 2. Mike's calls (2026-08-26, all the recommended option)

| Fork | Call | Why |
|---|---|---|
| The cut | **The Manage block only**, `app.js:8131-13285`. The 558 delegate lines inside `attachHandlers` (`app.js:14046-14603`) and the 95-line Manage short-circuit inside `partialRender` (`app.js:794-888`) stay in `app.js` | The HTML diff cannot see handlers, and `openQrModal` is nested inside `attachHandlers` (not a global), so a moved delegate would throw at tap time |
| Order | **Boot round first, then the split** | Three surgical edits Mike can see, tests already exist in invertible form, three one-line reverts if wrong; gives the split a stable trace to compare against |
| Scope | **`app.js` split + boot now. The Manage CSS and the eight named minors get their own round** | The CSS is not a move (419 scattered selector lines; cascade position is an input); the minors are behaviour changes and would break the "pure move" claim |
| Gate + build | **§38 exempt for the pure move; subagent-driven build** | The exemption reason on the picks ledger: "C102 pure code move, no rendered string changes". Honest only while the diff stays a move |

Settled without a fork: one file named `manage.js` (matching `pure.js`); a classic script, not ES modules
(`export` kills the globals, banked in `debugging.md`); the `tdb*` data layer (`app.js:2065-3176`) stays in
`app.js` (every function in it is shared; the co-pilot reaches `tdbCreateTournament` and
`tdbGenerateBracket`); no Manage helper moves to `pure.js` this round.

## 3. Non-goals

- No change to any rendered string, class name, style value, RPC call, or event binding.
- No CSS split. No orphan removal (per `decisions.md` orphan removal belongs with an extraction, but it is a
  behaviour change and gets its own commit in the CSS round, once the block is isolated and the orphans
  are visible).
- No change to the motion gate (`activateMainTab`, v.34), the 5000ms boot valve, the 15s poll, the service
  worker's strategy, or `APP_VERSION`'s home.
- No new abstraction: no module loader, no registry, no `window.Manage` namespace.

## 4. Part A: the boot round

### 4.1 The four renders today

One painter, `render()` (`app.js:13840`), and four boot-reachable callers. R2, R3 and R4 share the gate
`if (state.loaded && bootPaintDone)`, so each fires only when its trigger lands AFTER the boot paint.

| # | Site | What it needs that the previous paint lacked | What it changes on screen |
|---|---|---|---|
| R1 | the boot IIFE, `app.js:15108` | the whole boot gather (`loadSession`, `loadPickupDays`, `tdbRefreshTournaments`) raced against the valve | everything; this is the paint |
| R2 | `onAuthEvent`, `app.js:7377` | `state.authSession` and `state.account`, set two lines earlier | the header chip; the Tournament tab body (signed-out shows only the gate, `app.js:3770`); the wall via `syncGatePage` |
| R3 | `runPostSignInWork`, `app.js:7322` | `state.role` and `state.isAdmin` from `deriveRole()` (up to three tries 400ms apart), plus refreshed `state.tournaments` and `state.teamMembers` | whether `#tab-manage` exists at all (`renderPublicShell`, `app.js:13288`, the `isAdmin` branch at 13325-13329) and the Manage nav button (`buildPublicNavInnerHTML`, `app.js:7886`, the `isAdmin` branch at 7899); the Home hero and My Team tile from `teamMembers` |
| R4 | three sites, one obligation: `promptNameFillIfNeeded`, `app.js:7213`; `onNameFillSave`, `app.js:7276` (the one-time name-fill overlay's save; UNGUARDED today, no `state.loaded && bootPaintDone` wrapper); `onAcctNameSave`, `app.js:7716` (the account card's name save) | the module cache `accountName` (written at exactly 7209, 7273, 7401 on sign-out, 7712) | one character: the header chip's initial (`authInitial`, `app.js:7936`) |

Honest counts today: an anonymous visitor gets exactly 1 (R2's signed-in branch needs a session and
`isNewSignIn`; the no-session branch renders only when `wasSignedIn`, false at boot). A signed-in player
gets 2 or 3. Mike (owner) gets 3 or 4, and `loadLocal` hard-clears `isAdmin` (`app.js:5193`) so his admin
flip happens on EVERY boot (`app.js:7306` is the only line in the client that sets it true). Which count
he gets depends on whether `INITIAL_SESSION` settles before or after the boot paint, so the same cold boot
does not produce the same number twice. Every count here and below is plus one on the 5000ms valve path.

### 4.2 The shape: targeted repaints, not a session wait

Recon offered three shapes. The chosen one is **targeted repaints** (R2 and R4 stop calling `render()`;
R3 calls it only when the admin flag actually flipped). Rejected: waiting for the session before the first
paint (adds a new race and a new cap to the single most load-bearing line in the app, the one that closed
"it loads funky" on 2026-07-12, for a benefit the targeted shape already delivers), and a same-tick render
coalescer (R1 to R4 are spread over hundreds of frames; it would collapse none of them).

What this delivers, stated plainly: anonymous 1 (unchanged); signed-in player 1; **Mike at most 2, never
3 or 4.** One exception, stated so nobody tests against a false claim: `partialRender()` has in-place
branches for Home (`app.js:775`), Manage (794), History and My Team (891) and Tournament (911), but none for
the Check In tab (`players`); with the kiosk search idle it reaches the unconditional `render()` at
`app.js:928`. So a viewer sitting on Check In at sign-in still gets a full paint from R2 and from R3's
non-admin branch: signed-in player 2 there, Mike 3. The paint is correct (`render()` does more, not less);
closing that gap is a `partialRender` branch of its own and out of this round's scope. One paint for an
owner would need either awaiting `deriveRole()` before the first paint (an RPC
that already retries three times) or shipping the Manage panel in every spectator's shell (today
`manageContainerHTML()` runs only inside `state.isAdmin ? ... : ''`, `app.js:13325-13329`). Both are worse
than the second paint.

### 4.3 The edits

**Two new helpers beside `buildPublicHeaderHTML` (`app.js:7918`).** `<header id="app-header">`
(`app.js:13293-13296`) holds THREE children: the `PUBLIC` badge (`.app-header-mode`), the
`buildPublicHeaderHTML()` interpolation (`.pd-wordmark` + `.pd-hgrp`), and `#js-sync-notice`, which
`partialRender` looks up on every background sync (`app.js:736`; the comment at `app.js:7917` says so).
So the repaint targets the chip's own container, `.pd-hgrp`, and never the header. The chip markup moves
into a builder that `buildPublicHeaderHTML` also calls, so the header string stays byte-identical:

```js
// C102 (2026-08-26): the account chip's own markup, shared by the header builder and the targeted repaint.
function accountChipHTML() {
  return state.authSession
    ? `<button type="button" class="pd-avic is-signedin" id="pd-account" aria-label="Account: signed in">${escapeHTML(authInitial())}</button>`
    : `<button type="button" class="pd-avic" id="pd-account" aria-label="Sign in">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/></svg>
      </button>`;
}
// Repaint ONLY .pd-hgrp: #app-header also carries the PUBLIC badge and #js-sync-notice (partialRender
// depends on it), and the header's click delegate is bound on #app-header itself, so a child swap keeps
// every tap working. Never touch the #app-header element or its other children.
function repaintAccountChip() {
  const g = document.querySelector('#app-header .pd-hgrp');
  if (g) g.innerHTML = accountChipHTML();
}
```

`buildPublicHeaderHTML` then interpolates `${accountChipHTML()}` inside `.pd-hgrp` in place of the
ternary, with the whitespace kept exactly so the shell string does not change by a byte (5.8's diff pins
it).

**R4, three sites, one obligation each.** `promptNameFillIfNeeded` (`app.js:7213`) and `onAcctNameSave`
(`app.js:7716`) replace `render()` with `repaintAccountChip()` inside the same guard:

```js
if (state.loaded && bootPaintDone) { try { repaintAccountChip(); } catch (_) {} }
```

`onNameFillSave` (`app.js:7276`) calls `render()` with no guard today; it gets the same guarded line, so a
repaint can never fire into a splash-only DOM. It also calls `partialRender()` beside the chip repaint,
because `connectProfileByName` can set `state.identityCollision`, which the Tournament hub renders, and the
old full render carried that row immediately. All three change in the same commit. A regression at any one
is the same bug (the chip wears the email's letter until the next nav tap).

**R2 (`app.js:7377`).** Replace `render()` with the three in-place repaints the sign-in actually needs:

```js
if (state.loaded && bootPaintDone) {
  try { repaintAccountChip(); } catch (_) {}
  try { syncGatePage(); } catch (_) {}          // closeGatePage ran above; this states the decision explicitly
  try { partialRender(); } catch (_) {}         // the active tab, in place
  try { repaintSignedInPanels(); } catch (_) {} // the hidden Tournament and My Team panels (built as Task 2 shipped)
}
```

Four separate trys so one failure never blocks the others; the order is chip, wall, active tab, hidden
panels.

- `repaintAccountChip()` because `partialRender()` never touches the header.
- `partialRender()` because it already rebuilds the active tab in place: Home (`app.js:775-789`), Manage,
  History and My Team, and the Tournament tab through `partialRenderTournament()` (`app.js:3027`), whose
  container rebuild is exactly what turns the signed-out gate body into the hub. It preserves scroll and
  skips a dirty form, both of which `render()` does worse.
- `syncGatePage()` (`app.js:7154`) is explicit so the wall decision is stated, not inherited:
  `closeGatePage()` already ran four lines above (`app.js:7373`), `render()` would reach `syncGatePage()`
  through `activateMainTab` (`app.js:13994`), and `partialRender()` does not reach it at all. It is
  idempotent, already called from three sites, and for a signed-in user it closes, never opens.
- No nav swap: the nav's only auth dependency is the `isAdmin` branch (`app.js:7899`), and R2 never
  changes `isAdmin`.
- `repaintSignedInPanels()` rebuilds the two auth-branching panels that are not the active tab
  (Tournament unless its form is dirty, My Team), because the shell keeps every panel mounted and
  `partialRender()` repaints only the active one; without it a sign-in from Home leaves the Tournament
  gate body under a closed wall.

**R3 (`app.js:7322`).** Capture the flag around `deriveRole()`, never read one set elsewhere:

```js
const wasAdmin = state.isAdmin;          // BEFORE the deriveRole() loop at app.js:7296
...
if (state.loaded && bootPaintDone) {
  try {
    // The shell gains or loses #tab-manage and the Manage nav button only when the flag flips, and only
    // render() builds the shell. Otherwise the nav is byte-identical (its two inputs, checkinNavVisible()
    // and isAdmin, are untouched by this function), so an in-place repaint carries the refreshed
    // tournaments and teamMembers onto the Home hero and My Team.
    if (wasAdmin !== state.isAdmin) render();
    else { partialRender(); repaintSignedInPanels(); }   // teamMembers land on the My Team page too, which may be hidden
  } catch {}
}
```

No nav swap in the else branch: `buildPublicNavInnerHTML` (`app.js:7886`) has exactly two conditionals,
`checkinNavVisible()` (pickup days and the session row, which `runPostSignInWork` never touches) and
`state.isAdmin` (unchanged by definition in that branch), so a swap would rebuild the same string.

Build order inside the round: R4 first (blast radius one button, test exists in invertible form), then R2,
then R3 last, because R3's failure costs Mike his Manage tab.

### 4.4 What must not reopen

| Must not reopen | How it could | The guard |
|---|---|---|
| The Manage tab missing for an owner | a mis-scoped `isAdmin` comparison; the bounce guards at `app.js:13855` and `13879` would keep kicking a saved `manage` tab Home, so the symptom is confusing, not obvious | compare before and after AROUND `deriveRole()`; test: role resolves to `owner`, `renderCount` +1 exactly, shell contains `id="tab-manage"` |
| The wall | `closeGatePage()` runs before R2 today and `render()` would re-run `syncGatePage()` through `activateMainTab`; a targeted repaint inherits neither decision | call `syncGatePage()` explicitly in R2; test: `#gate-page` absent after a sign-in from the Tournament tab |
| The signed-out body on a hidden panel | `partialRender` repaints the active tab only | `repaintSignedInPanels()` in R2 and in R3's non-admin branch; test: sign in on Home, the Tournament container is the hub |
| The sync notice and the PUBLIC badge | a repaint of `#app-header`'s innerHTML would delete `#js-sync-notice` (then `partialRender`'s lookup at `app.js:736` is null until the next full render) and the `.app-header-mode` badge | repaint `.pd-hgrp` only; test: after the repaint `#js-sync-notice` still exists and `.app-header-mode` still reads `PUBLIC` |
| The name chip | three R4 sites, one obligation | change all three in one commit; assert the header markup carries the new letter, not merely that no render happened |
| The flash (v.34) | not reopened by anything here; fewer paints cannot flash more | leave `activateMainTab`'s gate (`app.js:13948-13949`) untouched |
| "It loads funky" (2026-07-12) | only a session wait could, by delaying the first paint | no session wait |
| A silently unbound listener | `attachHandlers()` runs inside `render()`; a swap that replaces an element carrying a directly bound listener kills it | swap CHILDREN, never elements, for `#app-header` and `#bottom-nav`; both delegates sit on the parent |
| The pre-paint drop | R2/R3/R4 must still do nothing before the boot paint | keep the `state.loaded && bootPaintDone` guard on all three; test: `setPainted(false)`, fire `INITIAL_SESSION`, `renderCount` unchanged |

### 4.5 Tests (all on the existing `test/account-round.test.js` bridge: `renderCount()`, `setPainted`, `authEvent`, `nameFill`, `authInitial`)

The sandbox's `activeMainTab` defaults to `players` (`app.js:36`) and `setPainted` sets only the two
gates, so every case below that expects no render sets the tab first (`bridge.tab('tournament')` or
`bridge.tab('home')`, adding a `tab` setter to the bridge if one is missing) and says why in a comment:
on the Check In tab `partialRender` still falls through to `render()` (4.2).

1. R4 (`promptNameFillIfNeeded`): the case at `account-round.test.js:1200-1211` flips `toBe(before + 1)`
   to `toBe(before)` and adds an assertion that the chip markup carries `A`. The account-card twin at
   `:1364-1380` (name save) flips the same way. Read both cases first: their comments explain why the
   render existed.
2. R4 (`onNameFillSave`): saving the one-time name fill after the paint leaves `renderCount` unchanged and
   the chip carries the new letter; before the paint (`setPainted(false)`) it neither renders nor throws.
3. The header survives the repaint: after any of the three R4 paths, `#js-sync-notice` still exists and
   `.app-header-mode` still reads `PUBLIC` (the sandbox registry holds the elements by id/class).
4. R2: on the Tournament tab, a signed-in non-admin auth event after the paint leaves `renderCount`
   unchanged, the chip carries the signed-in letter, `#gate-page` is absent afterwards, and the Tournament
   container was rebuilt (the hub, not the gate body).
5. R3 admin: role resolves to `owner`, `renderCount` +1 exactly, the shell contains `id="tab-manage"`.
6. R3 non-admin: on the Home tab, role resolves to null, `renderCount` +0, the Home container was rebuilt.
7. Pre-paint: `setPainted(false)`, fire `INITIAL_SESSION`, `renderCount` unchanged.
8. The boot probe (the srcdoc iframe banked at `debugging.md`, entry "flashes like 5 times") on Mike's
   signed-in session, landing on Home, shows at most 2 `render()` calls, down from 3 or 4, and on an
   anonymous session 1.

### 4.6 Ship

Bump `APP_VERSION`, `node --check public/app.js`, commit, push. Facts-only drive at 390 and 1280 with the
extension confirmed connected first: zero console errors; the Manage tab present for the owner on a cold
boot; the header chip carries the name's letter, not the email's.

## 5. Part B: the split

### 5.1 What moves

One contiguous verbatim block, **`public/app.js:8131-13285`** (line numbers as of `38284e6`; the plan
re-reads them after the boot round), from the banner comment `// ── Manage tab (session-10 pick R1)` through
the closing brace of `mgTournamentCreate`, into a new `public/manage.js`. 5,155 lines, 210 top-level
functions, 63 top-level `let`/`const`. Written LF, matching `app.js`. The block has zero top-level
executable statements: every column-0 line starts a declaration, a comment, a closing brace or a template
continuation, and `node --check` passes on the slice standalone, on `app.js` minus the slice, and on their
concatenation (all three run during the spec review). Two initializers are not literals but depend on
nothing in `app.js`: `let mgSelected = new Set()` (`app.js:8148`) and `let mgCloseoutChampId = undefined`
(8222).

Two functions inside the block are **not** Manage-specific and are consumed by public builders:
`pickupDaySet` (`app.js:8264`; callers `publicHomeHTML`, `checkinNavVisible`) and `canScoreMatch`
(`app.js:12199`; exactly two callers outside the block, `buildBracketNodeHTML` at 3272 and
`buildPoolsSchedulePageHTML` at 4504; its third caller `openMgScoreSheet` at 12314 moves with the block).
Both are hoisted back into `app.js` beside their public callers as part of the same commit. This is the
one place the cut is not a pure line range and it gets its own line in the review.

`manage.js` needs no CommonJS export guard at its foot: zero test files `require()` `app.js`; the harness
loads both through `vm.runInContext`.

### 5.2 What stays, and why

| Stays in `app.js` | Where | Why |
|---|---|---|
| the `tdb*` data layer (2065-2957) and the render/sync layer after it | 2065-3176 | every function shared; three `manage-round` slice pairs use `tdb*` markers; 55 write sites under NF-2's scan. Two of them reach INTO the block: `mgActiveTournament()` from `tdbMoveTeamToPool` (`app.js:2272`) and the write `mgTournamentPinned = false` in `tdbRefreshTournaments` (`app.js:2917`) |
| the Manage delegates inside `attachHandlers` | 14046-14603 (558 lines) | Mike's cut; `openQrModal`/`closeQrModal`/`checkinKioskUrl` are nested in `attachHandlers` at column 0 and are NOT globals |
| `partialRender`'s Manage short-circuit | 794-888 | it is `partialRender`'s own body; it only runs after the boot paint, so the cross-file call resolves |
| the co-pilot (`copilotShellHTML` and all of 13389-13838) | | zero Manage tokens in that span |
| `APP_VERSION`, the SW registration, `render`, `partialRender`, `partialRenderTournament` | | `version-source.test.js` needs no change; the `partialRender()` rule names no file |

### 5.3 The contract between the two files

Both are plain classic scripts sharing one global lexical record. Proven by three independent Node vm
probe runs: top-level function declarations become `window` properties; top-level `let`/`const` are NOT
`window` properties but resolve across scripts in both directions, and an assignment from one script is
seen by the other. Three rules, all mechanically checkable:

1. **No name is declared in both files.** Two failure shapes, measured: a duplicate top-level `let` or
   `const` (or a `let`/`const` over an existing `function`) is a `SyntaxError` that kills the ENTIRE second
   script at load while `node --check` on each file alone passes; a duplicate top-level `function` is
   LEGAL, the second declaration silently wins, and `node --check` passes even on the concatenation. With
   210 functions moving, a stale twin left behind in `app.js` would surface only as wrong behaviour. The
   gate is therefore a name-intersection check (the sets of top-level declared names, `^(async )?function X`
   and `^(let|const) X`, in the two files must be disjoint), plus `node --check` on the concatenation for
   the `let`/`const` half, plus the suite (which loads both into one context). Today the 273 names have
   zero collisions.
2. **`manage.js` is declarations-only.** Function declarations, and `let`/`const` whose initializer
   depends on nothing declared in `app.js` (literals, `new Set()`, `undefined`). No top-level executable
   statement, ever. This is what makes loading it first safe. A guard test asserts it to exactly that rule
   (every depth-0 line of `manage.js` starts a declaration, a comment, a closing brace, a template
   continuation, or is blank), written so it is green on day one.
3. **Cross-file references resolve at call time, both directions.** `app.js` calls into `manage.js` from
   `saveLocal` (`mgSaveTournamentPin`), `partialRender`, `renderPublicShell`, `activateMainTab`,
   `refreshTournamentLive`, `tdbRefreshTournaments` (`mgAdoptStoredTournament`), `tdbMoveTeamToPool`
   (`mgActiveTournament`, `app.js:2272`), the account row and the whole `attachHandlers` delegate;
   `manage.js` calls back for `state`, `escapeHTML`, `tdb*`, `appNotice`, `appConfirm`, `appPrompt`,
   `partialRender`, `render` and the rest. Across the seam there is exactly one binding READ
   (`MG_CHEV` from `accRow`, `app.js:7443`) and exactly one binding WRITE (`mgTournamentPinned = false` in
   `tdbRefreshTournaments`, `app.js:2917`); everything else is a function call. Both directions and the
   cross-script assignment were proven by three independent Node vm probe runs. Nothing is imported or
   exported.

### 5.4 The load order (the decisive ruling)

Today (`public/index.html`, every script tag preceded by its own comment line):

```
index.html:117  qrcode CDN            defer
index.html:119  supabase UMD          defer
index.html:121  /supabase-config.js   defer
index.html:123  /pure.js              defer
index.html:124  <!-- Main App ... -->
index.html:125  /app.js               defer
```

The new tag and its comment go between `:123` and the Main App comment, so the order becomes pure,
manage, app: `<!-- Manage surfaces (the admin tab): declarations only; MUST load before app.js -->` then
`<script src="/manage.js" defer></script>`. The comment block at `index.html:114-115` gains `manage` in
its dependency chain sentence.

`manage.js` loads **before** `app.js`. `init()` runs synchronously at the end of `app.js`'s own evaluation
(all scripts are `defer`, so `readyState` is `interactive` and the `else` branch at `app.js:15189-15192`
calls `init()` at 15190), and `loadLocal()` reaches `saveLocal()` (the conditional call at `app.js:5246`),
which calls `mgSaveTournamentPin()` (`app.js:5269`) inside a `try/catch` that logs and swallows
(`app.js:5273-5275`). A `manage.js` placed AFTER `app.js` has not executed yet at that moment, so the
`ReferenceError` is swallowed and `canRunAdminSharedBackfill()` and `queueGroupCatalogSync()`
(`app.js:5270-5272`) silently never run on any boot that takes that path. No crash, no red test,
intermittent by stored shape. Loading first is safe because of contract rule 2.

That is the ONLY synchronous path into the block. Two more exist and are gated shut at that instant, named
so T5 does not re-derive them: `init()` calls `render()` at `app.js:15053` only when `!supabaseClient`,
and that `render()` reaches `manageContainerHTML()` (13327) only inside `state.isAdmin ? ... : ''`, and
`mgSyncActiveTournament()` / `mgHubEnsureHistory()` (13952, 13957) only behind
`tab === 'manage' && state.isAdmin`; `loadLocal` clears `isAdmin` at 5193 and nothing sets it before
`runPostSignInWork`. The eight top-level IIFEs in `app.js` (275, 395, 541, 555, 574, 630, 13506, and
`wireQrModal` at 14651, itself nested in `attachHandlers`) bind listeners only.

### 5.5 Delivery

- `public/sw.js:8-21` gains `'/manage.js',` beside `'/pure.js'`. That one line joins it to both `ASSETS`
  (precache) and `NETWORK_FIRST_PATHS`. Without it the file falls to the cache-first branch
  (`sw.js:76-78`), which never writes to the cache, so the app half-boots offline and never self-heals.
- A guard test: every `<script src="/...">` in `public/index.html` appears in `sw.js`'s `ASSETS`. No test
  today would catch the omission.
- `APP_VERSION` stays at `app.js:34` and gets its normal bump. The cache name derives from the `?v=`
  registration param; no script tag carries a query string; a bump activates a new worker with a new cache
  and re-fetches everything network-first.

### 5.6 The harness

21 test files load `app.js` through `vm.runInContext`. With `manage.js` first, each gains exactly two
lines and the epilogue stays on `app.js`:

```js
const pureSrc = readFileSync(new URL('../public/pure.js',   import.meta.url), 'utf8');
const mgSrc   = readFileSync(new URL('../public/manage.js', import.meta.url), 'utf8');   // NEW
const appSrc  = readFileSync(new URL('../public/app.js',    import.meta.url), 'utf8');
...
vm.runInContext(pureSrc, context, { filename: 'pure.js'   });
vm.runInContext(mgSrc,   context, { filename: 'manage.js' });                            // NEW
vm.runInContext(appSrc + epilogue, context, { filename: 'app.js' });                     // unchanged
```

Separate `runInContext` calls, not one concatenation, so a throw keeps the right filename in its stack.
Two harnesses need hand work: `test/register-auto-attach.test.js:125` is one concatenated call and gains
its term in the right position (`pureSrc + '\n' + mgSrc + '\n' + appSrc + epilogue`);
`test/tournament-create.test.js` gains the `mgSrc` read beside `:96-97` and changes only its two loaders
(`:213-214`), never its two probes at 445 and 507. The
epilogue's collaborator swaps by bare assignment (`tdbAddTeam = ...`, `openMgScoreSheet = ...`,
`repaintManage = ...`) keep working: a reassignment from one script is seen by code inside the other.

### 5.7 The source guards

A negative assertion (`not.toContain`) goes vacuous the instant its subject leaves the scanned file: the
slice is empty and `expect('').not.toContain(x)` passes. A positive one fails loudly. So:

| Bucket | Files | Change |
|---|---|---|
| whole-client scans that must never go blind | `test/supabase-writes.test.js:85-95` (NF-2) | a third file-scan `it` (the file's fourth `it`; the heuristic self-check at :94 is the third) for `public/manage.js` reusing `unguardedWrites(url, label)`. Seven write sites move with the block (`pickup_days` update/insert/delete, `check_in`, `check_out`, `register_player`, `players` insert). Proof: delete one `{ error }` capture in `manage.js`, watch NF-2 go red, restore, green |
| version wiring, file-specific by design | `test/version-source.test.js` | no change |
| every other whole-file `appSrc` read | `manage-round.test.js:352`, `account-round.test.js:416`, `tournament-picker.test.js:44`, `tournament-switcher.test.js:35`, `tournament-round.test.js:14`, `motion-port.test.js:11`, `pool-schedule.test.js:186`, `bracket-endgame.test.js:120`, `home-details-card.test.js:164`, `team-payment-popup.test.js:200` (its `not.toContain("from('teams').update({ paid")` at :205 is exactly the vacuous shape) | the scanned string becomes `appSrc + '\n' + mgSrc`. One rule, ten files, removes the whole vacuous class. `bracket-endgame.test.js:132,139` slice to end of file and get re-read by hand |
| whole-file read scoped to a function that stays | `register-auto-attach.test.js:140` (slices to `submitRegisterForm`, `app.js:4066`) | safe, no change; named so the next reader does not re-derive it |
| the RPC-literal guard | `manage-round.test.js:2554` | survives unchanged (every `MUTATING_RPCS` name has a call site outside the block) but widens to the concatenation anyway |

The slice pairs `manage-round.test.js:2106, 2500, 2577` use `tdb*` markers and stay safe;
`:2580` (`mgBracketClearAll` to `mgBracketReset`) and `:3368` (`mgtGenerateTeams`) move with the block and
are fixed by the concatenation rule; the delegate-string guards at `:489, 731, 936` stay safe under this
cut. `account-round.test.js:2279` is a single-file TDZ ordering check and gains a cross-file sibling: no
`manage.js` top-level binding is READ at `app.js` top level (rule 2's mirror).

### 5.8 The equivalence proof

Every Manage builder is a pure string builder reachable through the existing `manage-round` bridge. Build
`scratchpad/c102/equiv.mjs` (scratchpad, never the repo): `loadApp()` copied from
`manage-round.test.js:17-346` with the file list as a parameter, the fixtures copied verbatim
(`setMainBracketFixture`, `setPoolsFixture`, `seedHub`, `seedPools`, the UNDRAWN / DRAWN / UNPLAYED match
sets), the full builder matrix rendered and JSON-stringified:

```
node equiv.mjs --files=public/app.js                    > before.json    # at the boot round's HEAD
node equiv.mjs --files=public/manage.js,public/app.js   > after.json     # post-split, manage FIRST
diff before.json after.json                                              # must be empty
```

The matrix: `manageContainerHTML()` for `manageView` in `lead`, `pickup`, `pickup-form`, `players`,
`teams`, `admins`, `checkin`, `tournament` (the picker, the sub-hub, event settings, pools at each of the
three match sets, the bracket at the main fixture, the closeout), plus the score sheet and team sheet
builders, each at admin and at owner. What the diff cannot see, stated plainly: delegate behaviour (covered
by the driven click tests `withDelegate`/`withKeys`, which do not move) and which of `render()` /
`partialRender()` a path calls (unchanged by a move).

### 5.9 The gates

- **§38 exemption (Mike's call).** Before the first edit of the split, in the build session, from the repo
  root (`ui38-mark.mjs:32` resolves the project from `process.cwd()`):
  `node "C:/Users/OlasM/.claude/hooks/ui38-mark.mjs" --decision=exempt --reason="C102 pure code move, no rendered string changes" public/app.js public/manage.js public/index.html`.
  The marker is file-scoped and session-fresh, so it is minted in the session that edits, naming all three
  files. It lands permanently on the picks ledger. The moment one rendered string, class or style changes,
  the full three-option round applies instead.
- **Re-arm the UI gate for the new file: TWO maps.** The hard PreToolUse block reads a RegExp literal at
  `C:/Users/OlasM/.claude/hooks/_vault-map.mjs:13` (`ui38-gate.mjs:23` imports `projectFor` from it and
  tests `proj.uiTest` at :50-52); the six `@uiTest` packs (`testing-data/8`, `mcp-tools/19`, `ui/27`,
  `ui/40`, `ui/41`, `ui/ui-verification`) read the addendum frontmatter string through `canon.mjs:109` and
  `engine.mjs:230`. Both change in the same commit:
  `_vault-map.mjs:13` becomes `uiTest: /(^|\/)public\/(app\.js|manage\.js|[^/]+\.(html|css))$/i`, and
  `C:/Ai Master/LasOlas/projects/athletic-specimen.md:7` becomes
  `uiTest: "public[\\/](app\.js|manage\.js|.*\.html|.*\.css)$"`. Changing only the addendum would leave
  §38 permanently silent on `manage.js`. Verification: after both changes, an `Edit` of over 400 chars of
  markup to `public/manage.js` without a fresh marker is BLOCKED.
- **Every subagent dispatch** invokes `lasolas-skill` on its first line (§29); subagents commit, the
  controller pushes (§21); `APP_VERSION` bumps on every code change; `node --check` on both files and on
  their concatenation after every edit.

### 5.10 Ship

Bump, `node --check` both files and the concatenation, commit, push. The boot probe trace compared against
the boot round's: identical. Every moved function resolves as `typeof window.<fn> === 'function'` inside
the frame; every moved binding resolves by bare identifier (a `window.<name>` lookup returns `undefined`
even when the split is correct); from the `app.js` side, `mgActiveTournament` resolves as a function and
`mgTournamentPinned` by bare identifier. Facts-only drive at 390 and 1280: every Manage sub-view opens, one
destructive control reached but NOT fired (June's data is irreplaceable), one background poll observed
calling `partialRender()` and not `render()`, zero console errors.

## 6. Build order (the plan expands each into steps)

| Task | Deliverable | Closes with |
|---|---|---|
| T0 | baseline pinned: HEAD, suite count, the boot probe trace, `equiv.mjs` + `before.json`, `app.js` line-ending counts (CRLF 0) | four artifacts in the scratchpad |
| T1 | R4: `accountChipHTML()` + `repaintAccountChip()`, all three sites, `onNameFillSave` gaining the guard | tests 1 to 3; suite green |
| T2 | R2: chip + `partialRender()` + `syncGatePage()` | tests 4 and 7; suite green |
| T3 | R3: `wasAdmin` flip guard, `partialRender()` otherwise | tests 5 and 6; the probe (test 8) shows at most 2 |
| T4 | ship the boot round: bump, push, drive | zero console errors, Manage tab present, name letter on the chip |
| T5 | `public/manage.js` created from `8131-13285` (re-read), `pickupDaySet` + `canScoreMatch` hoisted back, script tag + comment before `app.js` | `node --check` both + concatenation; declarations-only scan zero; the top-level name sets of the two files disjoint |
| T6 | `sw.js` `ASSETS` + the three guard tests (index.html vs ASSETS; declarations-only; name-intersection) | each guard red when its rule is broken, green restored |
| T7 | 21 harnesses rewired (+2 lines), the two hand cases | 39 files / 1233 tests green, zero tests changed in what they assert |
| T8 | source guards widened, NF-2's third `it` | the red-then-green NF-2 proof |
| T9 | `equiv.mjs` after the split | `diff before.json after.json` empty |
| T10 | both `uiTest` maps re-armed (`_vault-map.mjs:13` and the addendum frontmatter) | a large markup edit to `manage.js` is blocked |
| T11 | ship the split: bump, push, probe, drive | identical trace, every function and binding resolves, zero console errors |
| T12 | write-back: 12-history (before any completion mark), `log.md`, `current.md`, `decisions.md` (the load order, the cut), `debugging.md` (the duplicate-declaration failure, unbanked today), and the stale line-number pass: `current.md` (the `app.js:2928-2936` cite), `debugging.md` (`render()` at ~4717), `03-anatomy/file-map.md` (~9,700 lines), `PRODUCT-SURFACE.md` (~10k, the dead vercel URL), and the three wrong `APP_VERSION` line numbers in `CLAUDE.md`, `mike-preferences.md`, `sw.js:4` | the history file exists; `require-task-history.mjs` lets the completion through |

## 7. Hazards, ranked, with the guard that closes each

1. **Load order.** Manage after app silently skips the shared backfill (§5.4). Guard: manage first + the
   declarations-only test.
2. **NF-2 coverage shrinks silently.** Seven write sites leave the scan, suite stays green. Guard: the
   third `it`, proven red-then-green.
3. **Vacuous negatives.** Guard: the `appSrc + mgSrc` rule in nine files.
4. **The UI gate goes quiet on Manage.** Guard: both `uiTest` maps, proven by a blocked edit.
5. **A duplicate `let`/`const` kills the second script while `node --check` passes; a duplicate
   `function` is silent and the second wins.** Guard: the name-intersection test plus `node --check` on the
   concatenation; the suite loads both in one context. Bank both halves in `debugging.md`.
6. **§38 blocks the move mid-flight.** Guard: the exemption minted in the build session, naming all three
   files.
7. **A moved delegate would break the QR modal.** Closed by the cut: delegates stay.
8. **The service worker never caches an unlisted file.** Guard: the `ASSETS` line + the index.html guard.
9. **The CSS half is not a move.** Closed by scope: its own round.
10. **Vault line numbers go stale on the same commit.** Guard: T12's pass; CORE-5 says point at one owner
    rather than restating numbers.

## 8. Open, and how each closes

- `document.readyState` is `interactive` when `app.js` runs (spec-derived from `defer`; the branch at
  `app.js:15184-15188` would be dead). The banked srcdoc probe closes it in one run during T0.
- Whether any error boundary catches a top-level throw during script execution (`app.js:943` declares
  `_errorBoundaryShown`; `index.html:100-110` catches script LOAD failures only). Decides how hazard 5
  looks in the field. Read during T5.
- `refreshTournamentLive`'s off-tab full `render()` fallback (`app.js:3153`) is a fifth path to a
  whole-shell rebuild. Named for the CSS-and-minors round together with its re-entrancy guard, not this one.
