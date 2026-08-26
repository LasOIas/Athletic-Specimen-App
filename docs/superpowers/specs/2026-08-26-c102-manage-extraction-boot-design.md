# C102: extract Manage out of app.js and collapse the boot renders. Design.

Date: 2026-08-26. Baseline: HEAD `38284e6`, `APP_VERSION = '2026.08.25.50'` (`public/app.js:34`),
vitest 39 files / 1233 tests green. Recon: four read-only lenses plus a synthesis (digest archived at
`12-history/assets/2026-08-26-c102-recon-digest.md` at the round's end). Every line number below was read
from the repo at that HEAD; the plan re-reads them before each task because the split shifts every number
past the cut.

## 1. Goal

Two mechanical changes with no visible difference, proven rather than promised:

1. **The boot paints once where it can, and never more than twice.** Today a signed-in owner's cold boot
   runs `render()` three or four times inside ~900ms, and the number changes from boot to boot.
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
| The cut | **The Manage block only**, `app.js:8131-13285`. The 489 delegate lines inside `attachHandlers` and the 101-line Manage short-circuit inside `partialRender` stay in `app.js` | The HTML diff cannot see handlers, and `openQrModal` is nested inside `attachHandlers` (not a global), so a moved delegate would throw at tap time |
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
| R3 | `runPostSignInWork`, `app.js:7322` | `state.role` and `state.isAdmin` from `deriveRole()` (up to three tries 400ms apart), plus refreshed `state.tournaments` and `state.teamMembers` | whether `#tab-manage` exists at all (`renderPublicShell`, `app.js:13325`) and the Manage nav button (`buildPublicNavInnerHTML`, `app.js:7899`); the Home hero and My Team tile from `teamMembers` |
| R4 | `promptNameFillIfNeeded`, `app.js:7213`; twin site `onNameFillSave`, `app.js:7716` | the module cache `accountName` after a `profiles` read | one character: the header chip's initial (`authInitial`, `app.js:7936`) |

Honest counts today: an anonymous visitor gets exactly 1 (R2's signed-in branch needs a session and
`isNewSignIn`; the no-session branch renders only when `wasSignedIn`, false at boot). A signed-in player
gets 2 or 3. Mike (owner) gets 3 or 4, and `loadLocal` hard-clears `isAdmin` (`app.js:5192`) so his admin
flip happens on EVERY boot. Which count he gets depends on whether `INITIAL_SESSION` settles before or
after the boot paint, so the same cold boot does not produce the same number twice.

### 4.2 The shape: targeted repaints, not a session wait

Recon offered three shapes. The chosen one is **targeted repaints** (R2 and R4 stop calling `render()`;
R3 calls it only when the admin flag actually flipped). Rejected: waiting for the session before the first
paint (adds a new race and a new cap to the single most load-bearing line in the app, the one that closed
"it loads funky" on 2026-07-12, for a benefit the targeted shape already delivers), and a same-tick render
coalescer (R1 to R4 are spread over hundreds of frames; it would collapse none of them).

What this delivers, stated plainly: anonymous 1 (unchanged); signed-in player 1; **Mike at most 2, never
3 or 4.** One paint for an owner would need either awaiting `deriveRole()` before the first paint (an RPC
that already retries three times) or shipping the Manage panel in every spectator's shell (today
`manageContainerHTML()` runs only inside `state.isAdmin ? ... : ''`, `app.js:13325-13329`). Both are worse
than the second paint.

### 4.3 The edits

**A new helper beside `buildPublicHeaderHTML` (`app.js:7918`):**

```js
// C102 (2026-08-26): the header's children only. buildPublicHeaderHTML returns children with no wrapping
// element, and the header's click delegate is bound on #app-header itself (attachHandlers), so swapping
// the children keeps every tap working. Never replace the #app-header element.
function repaintAccountChip() {
  const h = document.getElementById('app-header');
  if (h) h.innerHTML = buildPublicHeaderHTML();
}
```

**R4, both sites (`app.js:7213` and `app.js:7716`), one obligation each.** Replace `render()` with
`repaintAccountChip()` inside the same guard:

```js
if (state.loaded && bootPaintDone) { try { repaintAccountChip(); } catch (_) {} }
```

Both sites change in the same commit. A regression at either one is the same bug (the chip wears the
email's letter until the next nav tap).

**R2 (`app.js:7377`).** Replace `render()` with the three in-place repaints the sign-in actually needs:

```js
if (state.loaded && bootPaintDone) {
  try { repaintAccountChip(); partialRender(); syncGatePage(); } catch {}
}
```

- `repaintAccountChip()` because `partialRender()` never touches the header.
- `partialRender()` because it already rebuilds the active tab in place: Home (`app.js:775-789`), Manage,
  History and My Team, and the Tournament tab through `partialRenderTournament()` (`app.js:3027`), whose
  container rebuild is exactly what turns the signed-out gate body into the hub. It preserves scroll and
  skips a dirty form, both of which `render()` does worse.
- `syncGatePage()` (`app.js:7154`) must be explicit: `render()` reaches it only through `activateMainTab`
  (`app.js:13994`) and `partialRender()` does not reach it at all. It is idempotent and already called
  from three sites.
- No nav swap: the nav's only auth dependency is the `isAdmin` branch (`app.js:7899`), and R2 never
  changes `isAdmin`.

**R3 (`app.js:7322`).** Capture the flag around `deriveRole()`, never read one set elsewhere:

```js
const wasAdmin = state.isAdmin;          // BEFORE the deriveRole() loop at app.js:7296
...
if (state.loaded && bootPaintDone) {
  try {
    if (wasAdmin !== state.isAdmin) { render(); }   // the shell gains or loses #tab-manage: only render() can
    else {
      // Same surgical nav swap as refreshTournamentLive (app.js:3151): the click handler is delegated on
      // #bottom-nav, so an innerHTML swap keeps navigation working and nobody's scroll resets.
      const nav = document.getElementById('bottom-nav');
      if (nav) { nav.innerHTML = buildPublicNavInnerHTML(); activateMainTab(activeMainTab); }
      partialRender();
    }
  } catch {}
}
```

`partialRender()` in the else branch carries `state.teamMembers` onto the Home hero and My Team. The nav
swap covers `checkinNavVisible()` changing under a refreshed session list.

Build order inside the round: R4 first (blast radius one button, test exists in invertible form), then R2,
then R3 last, because R3's failure costs Mike his Manage tab.

### 4.4 What must not reopen

| Must not reopen | How it could | The guard |
|---|---|---|
| The Manage tab missing for an owner | a mis-scoped `isAdmin` comparison; the bounce guards at `app.js:13855` and `13879` would keep kicking a saved `manage` tab Home, so the symptom is confusing, not obvious | compare before and after AROUND `deriveRole()`; test: role resolves to `owner`, `renderCount` +1 exactly, shell contains `id="tab-manage"` |
| The wall | `render()` reaches `syncGatePage()` through `activateMainTab`; a targeted repaint does not | call it explicitly in R2; test: `#gate-page` absent after a sign-in from the Tournament tab |
| The name chip | two R4 sites, one obligation | change both in one commit; assert the header markup carries the new letter, not merely that no render happened |
| The flash (v.34) | not reopened by anything here; fewer paints cannot flash more | leave `activateMainTab`'s gate (`app.js:13948-13949`) untouched |
| "It loads funky" (2026-07-12) | only a session wait could, by delaying the first paint | no session wait |
| A silently unbound listener | `attachHandlers()` runs inside `render()`; a swap that replaces an element carrying a directly bound listener kills it | swap CHILDREN, never elements, for `#app-header` and `#bottom-nav`; both delegates sit on the parent |
| The pre-paint drop | R2/R3/R4 must still do nothing before the boot paint | keep the `state.loaded && bootPaintDone` guard on all three; test: `setPainted(false)`, fire `INITIAL_SESSION`, `renderCount` unchanged |

### 4.5 Tests (all on the existing `test/account-round.test.js` bridge: `renderCount()`, `setPainted`, `authEvent`, `nameFill`, `authInitial`)

1. R4: the case at `account-round.test.js:1200-1211` flips `toBe(before + 1)` to `toBe(before)` and adds an
   assertion that the header markup carries `A`. The twin at `:1366-1380` (name save) flips the same way.
   Read both cases first: their comments explain why the render existed.
2. R2: a signed-in non-admin auth event after the paint leaves `renderCount` unchanged, the header carries
   the signed-in chip, `#gate-page` is absent afterwards, and the Tournament container was rebuilt.
3. R3 admin: role resolves to `owner`, `renderCount` +1 exactly, the shell contains `id="tab-manage"`.
4. R3 non-admin: role resolves to null, `renderCount` +0, the nav was rebuilt.
5. Pre-paint: `setPainted(false)`, fire `INITIAL_SESSION`, `renderCount` unchanged.
6. The boot probe (the srcdoc iframe banked at `debugging.md`, entry "flashes like 5 times") on Mike's
   signed-in session shows at most 2 `render()` calls, down from 3 or 4, and on an anonymous session 1.

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
executable statements; every `const` initializer is a plain literal (two independent scans agreed).

Two functions inside the block are **not** Manage-specific and are consumed by public builders:
`pickupDaySet` (`app.js:8264`; callers `publicHomeHTML`, `checkinNavVisible`) and `canScoreMatch`
(`app.js:12199`; callers `buildBracketNodeHTML`, `buildPoolsSchedulePageHTML`, and the shared score card).
Both are hoisted back into `app.js` beside their public callers as part of the same commit. This is the
one place the cut is not a pure line range and it gets its own line in the review.

`manage.js` needs no CommonJS export guard at its foot: zero test files `require()` `app.js`; the harness
loads both through `vm.runInContext`.

### 5.2 What stays, and why

| Stays in `app.js` | Where | Why |
|---|---|---|
| the `tdb*` data layer | 2065-3176 | every function shared; three `manage-round` slice pairs use `tdb*` markers; 55 write sites under NF-2's scan |
| the Manage delegates inside `attachHandlers` | 14046-14603 | Mike's cut; `openQrModal`/`closeQrModal`/`checkinKioskUrl` are nested in `attachHandlers` at column 0 and are NOT globals |
| `partialRender`'s Manage short-circuit | 794-888 | it is `partialRender`'s own body; it only runs after the boot paint, so the cross-file call resolves |
| the co-pilot (`copilotShellHTML` and all of 13389-13838) | | zero Manage tokens in that span |
| `APP_VERSION`, the SW registration, `render`, `partialRender`, `partialRenderTournament` | | `version-source.test.js` needs no change; the `partialRender()` rule names no file |

### 5.3 The contract between the two files

Both are plain classic scripts sharing one global lexical record. Proven by three independent Node vm
probe runs: top-level function declarations become `window` properties; top-level `let`/`const` are NOT
`window` properties but resolve across scripts in both directions, and an assignment from one script is
seen by the other. Three rules, all mechanically checkable:

1. **No name is declared in both files.** A duplicate top-level `let`/`const`/`function` is a
   `SyntaxError` that kills the ENTIRE second script at load, and `node --check` on each file alone passes.
   The gate: `node --check` on the concatenation `cat manage.js app.js`, plus the suite (which loads both
   into one context).
2. **`manage.js` is declarations-only.** Function declarations and `let`/`const` with literal initializers.
   No top-level executable statement, ever. This is what makes loading it first safe. A guard test asserts
   it (every depth-0 line of `manage.js` starts a declaration, a comment, or a blank).
3. **Cross-file references resolve at call time, both directions.** `app.js` calls into `manage.js` from
   `saveLocal`, `partialRender`, `renderPublicShell`, `activateMainTab`, `refreshTournamentLive`,
   `tdbRefreshTournaments` (`mgAdoptStoredTournament`), the account row and the whole `attachHandlers`
   delegate; `manage.js` calls back for `state`, `escapeHTML`, `tdb*`, `appNotice`, `appConfirm`,
   `appPrompt`, `partialRender`, `render` and the rest. Nothing is imported or exported.

### 5.4 The load order (the decisive ruling)

```
index.html:117  qrcode CDN            defer
index.html:119  supabase UMD          defer
index.html:121  /supabase-config.js   defer
index.html:123  /pure.js              defer
index.html:124  /manage.js            defer   <-- NEW, immediately BEFORE app.js
index.html:125  /app.js               defer
```

`manage.js` loads **before** `app.js`. `init()` runs synchronously at the end of `app.js`'s own evaluation
(all scripts are `defer`, so `readyState` is `interactive` and the `else` branch at `app.js:15191` fires),
and `loadLocal()` reaches `saveLocal()` (`app.js:5251`), which calls `mgSaveTournamentPin()` (`app.js:5269`)
inside a `try/catch` that logs and swallows (`app.js:5273-5275`). A `manage.js` placed AFTER `app.js` has
not executed yet at that moment, so the `ReferenceError` is swallowed and `canRunAdminSharedBackfill()`
and `queueGroupCatalogSync()` (`app.js:5270-5272`) silently never run on any boot that takes that path.
No crash, no red test, intermittent by stored shape. Loading first is safe because of contract rule 2. The
index.html comment block (`index.html:114-115`) gains `manage` in its dependency chain sentence.

### 5.5 Delivery

- `public/sw.js:8-21` gains `'/manage.js',` beside `'/pure.js'`. That one line joins it to both `ASSETS`
  (precache) and `NETWORK_FIRST_PATHS`. Without it the file falls to the cache-first branch
  (`sw.js:74-76`), which never writes to the cache, so the app half-boots offline and never self-heals.
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
`test/tournament-create.test.js` changes only its two loaders (`:213-214`), never its two probes. The
epilogue's collaborator swaps by bare assignment (`tdbAddTeam = ...`, `openMgScoreSheet = ...`,
`repaintManage = ...`) keep working: a reassignment from one script is seen by code inside the other.

### 5.7 The source guards

A negative assertion (`not.toContain`) goes vacuous the instant its subject leaves the scanned file: the
slice is empty and `expect('').not.toContain(x)` passes. A positive one fails loudly. So:

| Bucket | Files | Change |
|---|---|---|
| whole-client scans that must never go blind | `test/supabase-writes.test.js:85-95` (NF-2) | a third `it` for `public/manage.js` reusing `unguardedWrites(url, label)`. Seven write sites move with the block (`pickup_days` update/insert/delete, `check_in`, `check_out`, `register_player`, `players` insert). Proof: delete one `{ error }` capture in `manage.js`, watch NF-2 go red, restore, green |
| version wiring, file-specific by design | `test/version-source.test.js` | no change |
| every other whole-file `appSrc` read | `manage-round.test.js:352`, `account-round.test.js:416`, `tournament-picker.test.js:44`, `tournament-switcher.test.js:35`, `tournament-round.test.js:14`, `motion-port.test.js:11`, `pool-schedule.test.js:186`, `bracket-endgame.test.js:120`, `home-details-card.test.js:164` | the scanned string becomes `appSrc + '\n' + mgSrc`. One rule, nine files, removes the whole vacuous class. `bracket-endgame.test.js:132,139` slice to end of file and get re-read by hand |
| the RPC-literal guard | `manage-round.test.js:2554` | survives unchanged (every `MUTATING_RPCS` name has a call site outside the block) but widens to the concatenation anyway |

The slice pairs `manage-round.test.js:2106, 2500, 2578` use `tdb*` markers and stay safe;
`:2580` (`mgBracketClearAll` to `mgBracketReset`) and `:3368` (`mgtGenerateTeams`) move with the block and
are fixed by the concatenation rule; the delegate-string guards at `:489, 731, 936` stay safe under this
cut. `account-round.test.js:2279` is a single-file TDZ ordering check and gains a cross-file sibling: no
`manage.js` top-level binding is READ at `app.js` top level (rule 2's mirror).

### 5.8 The equivalence proof

Every Manage builder is a pure string builder reachable through the existing `manage-round` bridge. Build
`scratchpad/c102/equiv.mjs` (scratchpad, never the repo): `loadApp()` copied from
`manage-round.test.js:17-345` with the file list as a parameter, the fixtures copied verbatim
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

- **§38 exemption (Mike's call).** Before the first edit of the split, in the build session:
  `node "C:/Users/OlasM/.claude/hooks/ui38-mark.mjs" --decision=exempt --reason="C102 pure code move, no rendered string changes" public/app.js public/manage.js public/index.html`.
  The marker is file-scoped and session-fresh, so it is minted in the session that edits, naming all three
  files. It lands permanently on the picks ledger. The moment one rendered string, class or style changes,
  the full three-option round applies instead.
- **Re-arm the UI gate for the new file.** `C:/Ai Master/LasOlas/projects/athletic-specimen.md` frontmatter
  `uiTest` becomes `"public[\\/](app\.js|manage\.js|.*\.html|.*\.css)$"`. Without it §38 and six
  `@uiTest` packs go silent for the app's largest UI surface, permanently and invisibly. Verification: after
  the change, an `Edit` of over 400 chars of markup to `public/manage.js` without a fresh marker is BLOCKED.
- **Every subagent dispatch** invokes `lasolas-skill` on its first line (§29); subagents commit, the
  controller pushes (§21); `APP_VERSION` bumps on every code change; `node --check` on both files and on
  their concatenation after every edit.

### 5.10 Ship

Bump, `node --check` both files and the concatenation, commit, push. The boot probe trace compared against
the boot round's: identical. Every moved function resolves as `typeof window.<fn> === 'function'` inside
the frame; every moved binding resolves by bare identifier (a `window.<name>` lookup returns `undefined`
even when the split is correct). Facts-only drive at 390 and 1280: every Manage sub-view opens, one
destructive control reached but NOT fired (June's data is irreplaceable), one background poll observed
calling `partialRender()` and not `render()`, zero console errors.

## 6. Build order (the plan expands each into steps)

| Task | Deliverable | Closes with |
|---|---|---|
| T0 | baseline pinned: HEAD, suite count, the boot probe trace, `equiv.mjs` + `before.json`, `app.js` line-ending counts (CRLF 0) | four artifacts in the scratchpad |
| T1 | R4: `repaintAccountChip()`, both sites | tests 1; suite green |
| T2 | R2: chip + `partialRender()` + `syncGatePage()` | tests 2 and 5; suite green |
| T3 | R3: `wasAdmin` flip guard, nav swap + `partialRender()` otherwise | tests 3 and 4; the probe shows at most 2 |
| T4 | ship the boot round: bump, push, drive | zero console errors, Manage tab present, name letter on the chip |
| T5 | `public/manage.js` created from `8131-13285` (re-read), `pickupDaySet` + `canScoreMatch` hoisted back, script tag before `app.js` | `node --check` both + concatenation; declarations-only scan zero; no duplicate name |
| T6 | `sw.js` `ASSETS` + the two guard tests (index.html vs ASSETS; declarations-only) | each guard red when its rule is broken, green restored |
| T7 | 21 harnesses rewired (+2 lines), the two hand cases | 39 files / 1233 tests green, zero tests changed in what they assert |
| T8 | source guards widened, NF-2's third `it` | the red-then-green NF-2 proof |
| T9 | `equiv.mjs` after the split | `diff before.json after.json` empty |
| T10 | the `uiTest` regex re-armed | a large markup edit to `manage.js` is blocked |
| T11 | ship the split: bump, push, probe, drive | identical trace, every function and binding resolves, zero console errors |
| T12 | write-back: 12-history (before any completion mark), `log.md`, `current.md`, `decisions.md` (the load order, the cut), `debugging.md` (the duplicate-declaration failure, unbanked today), and the stale line-number pass: `current.md` (the `app.js:2928-2936` cite), `debugging.md` (`render()` at ~4717), `03-anatomy/file-map.md` (~9,700 lines), `PRODUCT-SURFACE.md` (~10k, the dead vercel URL), and the three wrong `APP_VERSION` line numbers in `CLAUDE.md`, `mike-preferences.md`, `sw.js:4` | the history file exists; `require-task-history.mjs` lets the completion through |

## 7. Hazards, ranked, with the guard that closes each

1. **Load order.** Manage after app silently skips the shared backfill (§5.4). Guard: manage first + the
   declarations-only test.
2. **NF-2 coverage shrinks silently.** Seven write sites leave the scan, suite stays green. Guard: the
   third `it`, proven red-then-green.
3. **Vacuous negatives.** Guard: the `appSrc + mgSrc` rule in nine files.
4. **The UI gate goes quiet on Manage.** Guard: the `uiTest` regex, proven by a blocked edit.
5. **A duplicate declaration kills the second script, `node --check` passes.** Guard: check the
   concatenation; the suite loads both in one context. Bank it in `debugging.md`.
6. **§38 blocks the move mid-flight.** Guard: the exemption minted in the build session, naming all three
   files.
7. **A moved delegate would break the QR modal.** Closed by the cut: delegates stay.
8. **The service worker never caches an unlisted file.** Guard: the `ASSETS` line + the index.html guard.
9. **The CSS half is not a move.** Closed by scope: its own round.
10. **Vault line numbers go stale on the same commit.** Guard: T12's pass; CORE-5 says point at one owner
    rather than restating numbers.

## 8. Open, and how each closes

- `document.readyState` is `interactive` when `app.js` runs (spec-derived from `defer`; the branch at
  `app.js:15184-15190` would be dead). The banked srcdoc probe closes it in one run during T0.
- Whether any error boundary catches a top-level throw during script execution (`app.js:943` declares
  `_errorBoundaryShown`; `index.html:100-110` catches script LOAD failures only). Decides how hazard 5
  looks in the field. Read during T5.
- `refreshTournamentLive`'s off-tab full `render()` fallback (`app.js:3152-3153`) is a fifth path to a
  whole-shell rebuild. Named for the CSS-and-minors round together with its re-entrancy guard, not this one.
