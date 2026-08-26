# C102 Implementation Plan: the boot round, then the Manage extraction

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the boot paint at most twice for an owner and once for everyone else, then move the Manage block out of `public/app.js` into `public/manage.js` behind the same globals, with no behaviour change, proven.

**Architecture:** Part A replaces three of the four boot-time `render()` calls with in-place repaints (`repaintAccountChip()` for the header chip, `partialRender()` + `syncGatePage()` for a sign-in, a full `render()` only when `state.isAdmin` actually flips). Part B cuts `app.js:8131-13285` verbatim into `public/manage.js`, a second classic script loaded BEFORE `app.js` (it is declarations-only, and `app.js`'s synchronous `init()` reaches into it), hoists the two public helpers back, precaches the new file, rewires 21 vm harnesses and ten source guards, and proves identity with a builder-matrix HTML diff.

**Tech Stack:** vanilla JS classic scripts (`public/app.js` LF, `public/pure.js`), Supabase JS 2.39.5, a service worker (`public/sw.js`), vitest 2 in `test/` (Node `vm` sandboxes), Vercel static hosting.

**Spec:** `docs/superpowers/specs/2026-08-26-c102-manage-extraction-boot-design.md` (commit `3f836bb`). The spec is the authority; this plan is its argument. Line numbers below were read at HEAD `38284e6` / `3f836bb`; every task re-reads its own lines before editing because Part A shifts Part B's numbers.

## Global Constraints

- `APP_VERSION` at `public/app.js:34` bumps on EVERY code change, format `'YYYY.MM.DD.N'`, N resets to 1 each new day. Today's first bump is `'2026.08.26.1'`.
- `node --check public/app.js` after every edit of it; from Task 5 on, ALSO `node --check public/manage.js` AND `node --check` on the concatenation (`cat public/manage.js public/app.js > "$SCRATCH/concat.js"; node --check "$SCRATCH/concat.js"`).
- The suite: `cd test && npx vitest run` must be 39 files (42 from Task 6 on, see the task) green with NO test deleted, skipped or weakened. Baseline 1233 tests.
- `partialRender()` for every background sync, never `render()`.
- Copy law: no em dashes anywhere (code comments, tests, commit messages included); never the word "night"; no `!important` outside the documented iOS counters.
- Line endings: `public/app.js` and the new `public/manage.js` are LF; `public/styles.css` and `public/pure.js` are CRLF. `git config core.autocrlf` is true and there is no `.gitattributes`: NEVER `git stash` a `public/` file. Write files with the same endings they have.
- No behaviour change. No rendered string, class name, style value, RPC call or event binding changes. If a task cannot be completed without one, STOP and report `DONE_WITH_CONCERNS` naming the string.
- Subagents commit; the controller pushes (§21). Commit messages follow the repo style: `type(scope): plain sentence - vYYYY.MM.DD.N`, no em dashes.
- Every subagent dispatch's first line invokes `lasolas-skill` (§29).
- The scratchpad for this round: `C:/Users/OlasM/AppData/Local/Temp/claude/C--Users-OlasM-OneDrive-Athletic-Specimen-App/cc8a1cfd-5548-46de-a7f5-c253f6bf1735/scratchpad/c102/` (`$SCRATCH` below). Instruments live there, never in the repo.
- The §38 exemption for Part B is minted by the controller from the repo root BEFORE Task 5's dispatch: `node "C:/Users/OlasM/.claude/hooks/ui38-mark.mjs" --decision=exempt --reason="C102 pure code move, no rendered string changes" public/app.js public/manage.js public/index.html`. Part A's edits are small and carry no markup change except the `accountChipHTML` factoring; if the gate blocks Task 1, the controller mints the same exemption for `public/app.js` with the reason "C102 boot round, header chip factored into accountChipHTML, byte-identical shell".

---

## File structure

| File | Responsibility after C102 |
|---|---|
| `public/app.js` | state, data layer (`tdb*`), public builders, `render`/`partialRender`, the auth flow, `attachHandlers` (including the Manage delegates), boot. ~10,040 lines |
| `public/manage.js` (new) | the Manage surfaces: 210 functions and 63 bindings, declarations only. Loaded before `app.js` |
| `public/index.html` | script order: supabase, config, pure, manage, app |
| `public/sw.js` | `ASSETS` gains `/manage.js` |
| `test/*.test.js` | 21 vm harnesses load `manage.js` before `app.js`; ten whole-file guards scan both; `supabase-writes.test.js` scans `manage.js` too |
| `test/client-files.test.js` (new) | three structural guards: precache list, declarations-only, disjoint names |

---

## Task 0: Pin the baseline (controller, inline)

**Files:**
- Create: `$SCRATCH/equiv.mjs`, `$SCRATCH/before.json`, `$SCRATCH/baseline.md`
- Modify: nothing in the repo

**Interfaces:**
- Produces: `equiv.mjs --files=<comma list>` printing a JSON object of builder name to HTML string, used verbatim by Task 9.

- [ ] **Step 1: Record HEAD, the suite and the line endings**

```bash
cd "C:/Users/OlasM/OneDrive/Athletic Specimen App"
git rev-parse --short HEAD                              # expect 3f836bb
(cd test && npx vitest run 2>&1 | tail -4)              # expect 39 files, 1233 tests, all green
wc -l public/app.js                                     # 15194
grep -c $'\r' public/app.js                             # 0 (LF file)
```
Write the four numbers into `$SCRATCH/baseline.md`.

- [ ] **Step 2: Build the equivalence instrument**

Create `$SCRATCH/equiv.mjs`. It is `test/manage-round.test.js`'s own `loadApp()` (lines 17-346, copied verbatim) with two changes: the file list comes from `--files=`, and the four fixtures plus the builder matrix run at the end and print JSON. Copy `setMainBracketFixture` (`:360`), `setPoolsFixture` (`:406`), `seedPools` (`:436`), `UNDRAWN` / `DRAWN` / `UNPLAYED` (`:454-470`) and `seedHub` (`:518`) verbatim as well, with the exact argument shapes the test file's own cases pass them (grep each name's first call site and copy that call). The tail of the script:

```js
// --- appended after the verbatim copies ---
const files = (process.argv.find((a) => a.startsWith('--files=')) || '--files=public/app.js')
  .slice('--files='.length).split(',');
const bridge = loadApp(files);   // loadApp now takes the list and runs one vm.runInContext per file, in order,
                                 // with { filename } set to the basename; the epilogue is appended to the LAST file only
const out = {};
const take = (name, fn) => { try { out[name] = fn(); } catch (e) { out[name] = 'THROW ' + e.message; } };
take('lead', () => bridge.buildManage());
take('nav', () => bridge.buildNav());
take('pickup', () => bridge.buildPickup());
take('pickup-form-new', () => bridge.buildPickupForm(null));
take('players', () => bridge.buildPlayers());
take('teams', () => bridge.buildTeams());
take('tournament-picker', () => bridge.buildTournament());
seedHub(bridge, { id: 't1', name: 'August 2026', status: 'setup' }, {});     // copy the row shape from the first seedHub call in the test file
for (const v of [null, 'registration', 'teams', 'pools', 'bracket', 'settings', 'rules', 'closeout']) {
  take('mgt:' + (v || 'hub'), () => bridge.mgtContainer(v));
}
take('mg-teams', () => bridge.buildMgTeams());
seedPools(bridge, { matches: UNDRAWN });   take('pools:undrawn', () => bridge.buildMgPools());
seedPools(bridge, { matches: DRAWN });     take('pools:drawn', () => bridge.buildMgPools());
seedPools(bridge, { matches: UNPLAYED });  take('pools:unplayed', () => bridge.buildMgPools());
setMainBracketFixture(); take('bracket', () => bridge.buildBracket({}));
take('bracket:done', () => bridge.buildBracket({ showDone: true }));
take('settings', () => bridge.buildSettings());
take('rules', () => bridge.buildRules());
take('closeout', () => bridge.closeoutContainer());
take('admins', () => bridge.buildAdmins());
take('checkin-nav', () => bridge.checkinNav());
process.stdout.write(JSON.stringify(out, null, 1));
```
Adjust the `seedHub` / `seedPools` argument shapes to what the test file actually passes (read the first call of each). Every `take` key must be present in the output; a `THROW` value is acceptable ONLY if it is identical before and after, and the count of THROW entries is written into `baseline.md`.

- [ ] **Step 3: Write `before.json`**

```bash
node "$SCRATCH/equiv.mjs" --files=public/app.js > "$SCRATCH/before.json"
node -e "const o=require('$SCRATCH/before.json'); console.log(Object.keys(o).length, 'builders;', Object.values(o).filter(v=>String(v).startsWith('THROW')).length, 'throws')"
```
Expected: at least 24 builders. Record both counts in `baseline.md`. Note: Part A does not touch any Manage builder, so `before.json` taken now is valid for Task 9; Task 9 re-takes it at Task 4's HEAD anyway and diffs the two (must be identical) before diffing against the split.

- [ ] **Step 4: The boot probe (if the Chrome extension is connected; otherwise record "probe deferred to Task 4")**

The banked instrument (`debugging.md`, "flashes like 5 times"): in Mike's Chrome, on `https://athletic-specimen.com`, a same-origin `srcdoc` iframe of `/index.html` with a `<script>` injected into `<head>` that registers a capturing `DOMContentLoaded` listener before `app.js`'s own and wraps `render`, `activateMainTab`, `runPostSignInWork`, `promptNameFillIfNeeded`, pushing `{ name, t: performance.now() }` into `window.__flash.events`; read the events after 9s. Save the event list to `$SCRATCH/probe-baseline.json`. Expected today for Mike's signed-in session: 3 or 4 `render` entries.

---

## Task 1: R4, the header chip repaints on its own (three sites)

**Files:**
- Modify: `public/app.js` (`buildPublicHeaderHTML` at 7918-7933; `promptNameFillIfNeeded` at 7213; `onNameFillSave` at 7276; `onAcctNameSave` at 7716; `APP_VERSION` at 34)
- Test: `test/account-round.test.js` (the bridge epilogue at 249-330; the cases at 1200-1211 and 1364-1380; new cases)

**Interfaces:**
- Produces: `accountChipHTML()` (returns the chip button markup, signed-in or signed-out, byte-identical to what `buildPublicHeaderHTML` inlined); `repaintAccountChip()` (writes `accountChipHTML()` into `#app-header .pd-hgrp`'s innerHTML, no-op when the element is absent). Tasks 2 and 3 call `repaintAccountChip()`.

- [ ] **Step 1: Read the three sites and the two existing cases first**

`sed -n 7205,7222p public/app.js`, `sed -n 7256,7282p public/app.js`, `sed -n 7708,7722p public/app.js`, `sed -n 7915,7935p public/app.js`, and `sed -n 1198,1212p test/account-round.test.js`, `sed -n 1362,1382p test/account-round.test.js`. The two cases assert `toBe(before + 1)` and their comments say why the render existed. Those comments get rewritten, not deleted.

- [ ] **Step 2: Add the bridge hooks the new cases need**

In the epilogue (`test/account-round.test.js`, inside the `globalThis.__bridge = {` object, after the `renderCount` line), add:

```js
      // C102 Task 1: the chip repaint and the shared chip builder, so a case can prove the header element
      // itself is never rewritten (it also carries the PUBLIC badge and #js-sync-notice).
      repaintChip: () => repaintAccountChip(),
      chipHTML: () => accountChipHTML(),
      nameFillSave: () => onNameFillSave({ preventDefault() {} }),
```

- [ ] **Step 3: Write the failing tests**

Add a `describe('C102 Task 1: the header chip repaints on its own', ...)` block at the end of the file, before any `afterAll`:

```js
describe('C102 Task 1: the header chip repaints on its own', () => {
  // The sandbox resolves '#id' from the registry and any other selector from bridge.hook(sel, node).
  // A header node and a hooked .pd-hgrp node are staged so the case can see WHICH element was written.
  function stageHeader() {
    const header = bridge.node('header'); header.id = 'app-header'; bridge.registry['app-header'] = header;
    header.innerHTML = '<span class="app-header-mode">PUBLIC</span><div class="pd-hgrp"></div><div id="js-sync-notice">x</div>';
    const grp = bridge.node('div'); bridge.hook('#app-header .pd-hgrp', grp);
    const notice = bridge.node('div'); notice.id = 'js-sync-notice'; bridge.registry['js-sync-notice'] = notice;
    return { header, grp, notice };
  }

  it('accountChipHTML is exactly what the header builder inlines (signed out and signed in)', () => {
    // The shell string must not change by a byte: the chip builder is a factoring, not a redesign.
    bridge.setSignedOut();
    expect(bridge.chipHTML()).toContain('class="pd-avic" id="pd-account" aria-label="Sign in"');
    bridge.setSignedIn({ id: 'u1', email: 'morgan@email.com' }, null);
    expect(bridge.chipHTML()).toBe('<button type="button" class="pd-avic is-signedin" id="pd-account" aria-label="Account: signed in">M</button>');
  });

  it('repaintAccountChip writes .pd-hgrp only and never the header element', () => {
    const { header, grp } = stageHeader();
    const headerBefore = header.innerHTML;
    bridge.setSignedIn({ id: 'u1', email: 'morgan@email.com' }, { first: 'Ada', last: 'Blake' });
    bridge.repaintChip();
    expect(grp.innerHTML).toContain('>A<');
    expect(header.innerHTML).toBe(headerBefore);            // the PUBLIC badge and #js-sync-notice survive
    expect(bridge.registry['js-sync-notice']).toBeTruthy();
  });

  it('repaintAccountChip is a no-op with no header on screen', () => {
    bridge.setSignedIn({ id: 'u1', email: 'morgan@email.com' }, null);
    expect(() => bridge.repaintChip()).not.toThrow();
  });

  it('the name-fill save repaints the chip without a full render, and does nothing before the boot paint', async () => {
    const { grp } = stageHeader();
    bridge.setSignedIn({ id: 'u1', email: 'morgan@email.com' }, null);
    bridge.registry['namefill-first'].value = 'Ada';
    bridge.registry['namefill-last'].value = 'Blake';
    bridge.setPainted(true);
    const before = bridge.renderCount();
    await bridge.nameFillSave();
    expect(bridge.authInitial()).toBe('A');
    expect(bridge.renderCount()).toBe(before);
    expect(grp.innerHTML).toContain('>A<');
    // Before the paint the guard holds: no render, no throw, the cache still updates.
    bridge.setAccountName(null);
    bridge.setPainted(false);
    bridge.registry['namefill-first'].value = 'Ada';
    bridge.registry['namefill-last'].value = 'Blake';
    await bridge.nameFillSave();
    expect(bridge.renderCount()).toBe(before);
    expect(bridge.authInitial()).toBe('A');
  });
});
```

Then flip the two existing cases. At `:1200-1211` ("the header chip repaints when the profile name lands after sign-in"): stage the header with the same `stageHeader` shape (inline the four lines), change `expect(bridge.renderCount()).toBe(before + 1)` to `toBe(before)` and add `expect(grp.innerHTML).toContain('>A<')`; rewrite the comment to: "C102: the chip has its own repaint now, so the name landing after sign-in never rebuilds six tab panels for one letter." At `:1364-1380` (name save): same flip, `toBe(renders)`, same comment style, plus the `grp` assertion.

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cd test && npx vitest run account-round.test.js`
Expected: the four new cases FAIL (`repaintAccountChip is not defined` / `accountChipHTML is not defined`), the two flipped cases FAIL on `toBe(before)`.

- [ ] **Step 5: Implement**

In `public/app.js`, replace the body of `buildPublicHeaderHTML` (7918-7933) and add the two helpers directly after it. The `.pd-hgrp` interpolation keeps the EXACT whitespace of the old ternary's branches so the shell string is unchanged:

```js
function buildPublicHeaderHTML() {
  return `
    <div class="pd-wordmark">
      <div class="pd-wm-1">ATHLETIC SPECIMEN</div>
      <div class="pd-wm-2">COLORADO</div>
    </div>
    <div class="pd-hgrp">
      ${accountChipHTML()}
    </div>`;
}

// C102 (2026-08-26): the account chip's own markup, shared by the header builder and the targeted repaint.
// Byte-identical to the ternary the header builder inlined before, so the shell string never changed.
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
Verify byte-identity of the shell before committing: `node -e` that loads the old and new `buildPublicHeaderHTML` outputs is overkill; instead `git diff public/app.js` must show the ternary's two branch lines moving into `accountChipHTML` with their leading whitespace unchanged and the `.pd-hgrp` block's other lines unchanged. Task 9's equivalence diff is the final word.

Then the three sites:
- `:7213` (`promptNameFillIfNeeded`): `if (state.loaded && bootPaintDone) { try { render(); } catch (_) {} }` becomes `if (state.loaded && bootPaintDone) { try { repaintAccountChip(); } catch (_) {} }` and the comment above it becomes: "C102 (2026-08-26): the chip draws its initial from this cache, and the sign-in repaint has already happened by the time this read resolves, so repaint the chip alone; a full render() rebuilt six tab panels for one letter."
- `:7276` (`onNameFillSave`): `try { render(); } catch (_) {}` becomes `if (state.loaded && bootPaintDone) { try { repaintAccountChip(); } catch (_) {} }` with the comment: "C102: the chip alone, behind the same boot gate as every other post-boot repaint."
- `:7716` (`onAcctNameSave`): same replacement as 7213; comment: "C102: only the chip wears the name's letter; repaint it alone (the card behind already shows the new name)."

Bump `APP_VERSION` to `'2026.08.26.1'`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --check public/app.js && cd test && npx vitest run`
Expected: 39 files, 1237 tests (1233 + 4), all green.

- [ ] **Step 7: Commit**

```bash
git add public/app.js test/account-round.test.js
git commit -m "perf(boot): the header chip repaints on its own at all three name sites, no full render for one letter - v2026.08.26.1"
```

---

## Task 2: R2, a sign-in repaints in place

**Files:**
- Modify: `public/app.js` (`onAuthEvent`'s signed-in branch at 7377; `APP_VERSION`)
- Test: `test/account-round.test.js`

**Interfaces:**
- Consumes: `repaintAccountChip()` from Task 1.
- Produces: nothing new. R2's guarded block is the shape Task 3's else branch mirrors.

- [ ] **Step 1: Read the site and the two helpers**

`sed -n 7362,7395p public/app.js` (the branch), `sed -n 7150,7160p public/app.js` (`syncGatePage`), `sed -n 732,740p public/app.js` and `sed -n 905,929p public/app.js` (`partialRender`'s root guard and its tournament branch plus the unconditional `render()` at the end).

- [ ] **Step 2: Add the spies and hooks the cases need**

In the epilogue, next to the `render` spy, add a `partialRender` spy of the same shape:

```js
    ;let __partials = 0;
    const __partial = partialRender;
    partialRender = function () { __partials += 1; return __partial(); };
```
and in the bridge object:
```js
      partialCount: () => __partials,
      tournamentRoot: () => buildPublicTournamentRootHTML(),
```

- [ ] **Step 3: Write the failing tests**

```js
describe('C102 Task 2: a sign-in repaints in place', () => {
  // partialRender needs #root with children or it falls back to render(); the Tournament branch rebuilds
  // '#tab-tournament .container'. Both are staged so the case exercises the real in-place path.
  function stageShell() {
    const root = bridge.node('div'); root.id = 'root'; root.hasChildNodes = () => true; bridge.registry.root = root;
    const panel = bridge.node('div'); panel.id = 'tab-tournament'; bridge.registry['tab-tournament'] = panel;
    const c = bridge.node('div'); bridge.hook('#tab-tournament .container', c);
    const grp = bridge.node('div'); bridge.hook('#app-header .pd-hgrp', grp);
    return { c, grp };
  }
  const session = { user: { id: 'u9', email: 'kai@email.com', email_confirmed_at: '2026-08-01T00:00:00Z' } };

  it('on the Tournament tab: no full render, the chip and the tab body repaint, the wall drops', () => {
    const { c, grp } = stageShell();
    bridge.setSignedOut();
    bridge.setPainted(true);
    bridge.tab('tournament');                                  // opens the wall for a signed-out viewer
    expect(bridge.registry['gate-page']).toBeTruthy();
    const gateBody = bridge.tournamentRoot();                  // what the signed-out panel shows
    const renders = bridge.renderCount();
    const partials = bridge.partialCount();
    bridge.authEvent('SIGNED_IN', session);
    expect(bridge.renderCount()).toBe(renders);
    expect(bridge.partialCount()).toBe(partials + 1);
    expect(grp.innerHTML).toContain('is-signedin');
    expect(bridge.registry['gate-page']).toBeFalsy();
    expect(c.innerHTML).toBe(bridge.tournamentRoot());         // rebuilt from the signed-in state
    expect(c.innerHTML).not.toBe(gateBody);
  });

  it('before the boot paint a restored session paints nothing (the boot render carries it)', () => {
    stageShell();
    bridge.setSignedOut();
    bridge.setPainted(false);
    const renders = bridge.renderCount();
    const partials = bridge.partialCount();
    bridge.authEvent('INITIAL_SESSION', session);
    expect(bridge.getState().authSession).toBeTruthy();
    expect(bridge.renderCount()).toBe(renders);
    expect(bridge.partialCount()).toBe(partials);
  });

  it('a repeat auth event for the same account paints nothing at all', () => {
    stageShell();
    bridge.setPainted(true);
    bridge.authEvent('SIGNED_IN', session);
    const renders = bridge.renderCount();
    const partials = bridge.partialCount();
    bridge.authEvent('TOKEN_REFRESHED', session);
    expect(bridge.renderCount()).toBe(renders);
    expect(bridge.partialCount()).toBe(partials);
  });
});
```
If `bridge.tab('tournament')` does not open the wall in this sandbox (it runs `syncGatePage` through `activateMainTab`; confirm with `grep -n "syncGatePage" public/app.js`), open it with `bridge.openGate()` after the tab call and keep the assertion.

- [ ] **Step 4: Run to verify the first case fails**

Run: `cd test && npx vitest run account-round.test.js -t "C102 Task 2"`
Expected: the first case FAILS on `renderCount` (+1 today) or `partialCount` (+0 today); the other two PASS already (they pin the guards that must survive).

- [ ] **Step 5: Implement**

At `public/app.js:7377`, replace
```js
    if (state.loaded && bootPaintDone) { try { render(); } catch {} }   // show signed-in immediately
```
with
```js
    // C102 (2026-08-26): a sign-in changes the chip, the Tournament tab body (the wall's gate body becomes
    // the hub) and the wall itself. Each has an in-place repaint; a full render() rebuilt every panel and
    // reset the viewer's scroll for it. Three separate trys so one failure never blocks the others.
    // partialRender has no in-place branch for the Check In tab and falls through to render() there.
    if (state.loaded && bootPaintDone) {
      try { repaintAccountChip(); } catch (_) {}
      try { syncGatePage(); } catch (_) {}      // closeGatePage ran above; this states the decision explicitly
      try { partialRender(); } catch (_) {}
    }
```
Rewrite the "bootPaintDone gate (2026-07-12)" comment above it to keep its first two sentences and drop "this renders immediately, unchanged". Bump `APP_VERSION` to `'2026.08.26.2'`.

- [ ] **Step 6: Run the suite**

Run: `node --check public/app.js && cd test && npx vitest run`
Expected: 39 files, 1240 tests, green. If any OTHER case in `account-round.test.js` now fails on a render count, read it: it encoded R2's render on purpose and gets the same flip with a comment saying why.

- [ ] **Step 7: Commit**

```bash
git add public/app.js test/account-round.test.js
git commit -m "perf(boot): a sign-in repaints the chip, the wall and the tab in place instead of a full render - v2026.08.26.2"
```

---

## Task 3: R3, a full render only when the admin flag flips

**Files:**
- Modify: `public/app.js` (`runPostSignInWork` at 7294-7324; `APP_VERSION`)
- Test: `test/account-round.test.js`

**Interfaces:**
- Consumes: the `partialRender` spy and `partialCount()` from Task 2.
- Produces: nothing new.

- [ ] **Step 1: Read the function and how the sandbox answers its calls**

`sed -n 7288,7326p public/app.js`. Then in `test/account-round.test.js:130-200`: `fetchCommunityId`'s `.from('communities').select().eq().maybeSingle()` answers from the SAME recorder as the profile read (`rec('profileRead')`), and `rpc(...)` answers from `rec('rpc')`, both scriptable with `bridge.supaNext(name, value)`. `runPostSignInWork` retries `deriveRole` with a 400ms `setTimeout` that this sandbox only queues, so every case scripts a TRUTHY role (`'owner'` or `'player'`) so the loop exits on the first try. `asCommunityId` is a module cache with no reset: add a bridge setter.

- [ ] **Step 2: Add the bridge entries**

```js
      postWork: () => runPostSignInWork(),
      setCommunityId: (v) => { asCommunityId = v; },
      setAdmin: (v) => { state.isAdmin = !!v; },
```
(`runPostSignInWork` is the spied binding by the time the arrow runs; the spy counts and forwards.)

- [ ] **Step 3: Write the failing tests**

```js
describe('C102 Task 3: the role result renders only when the admin flag flips', () => {
  function stageHome() {
    const root = bridge.node('div'); root.id = 'root'; root.hasChildNodes = () => true; bridge.registry.root = root;
    const panel = bridge.node('div'); panel.id = 'tab-home'; bridge.registry['tab-home'] = panel;
    const c = bridge.node('div'); bridge.hook('.container', c);
    const grp = bridge.node('div'); bridge.hook('#app-header .pd-hgrp', grp);
    return { c };
  }
  const session = { user: { id: 'u9', email: 'kai@email.com' } };

  it('an owner gets exactly one full render (the shell gains the Manage tab)', async () => {
    stageHome();
    bridge.setSignedIn(session.user, null);
    bridge.setAdmin(false);
    bridge.setCommunityId('c1');
    bridge.setPainted(true);
    bridge.tab('home');
    bridge.supaNext('rpc', { data: 'owner', error: null });
    const renders = bridge.renderCount();
    await bridge.postWork();
    expect(bridge.getState().role).toBe('owner');
    expect(bridge.getState().isAdmin).toBe(true);
    expect(bridge.renderCount()).toBe(renders + 1);
  });

  it('a player gets no full render: the Home tab repaints in place', async () => {
    const { c } = stageHome();
    bridge.setSignedIn(session.user, null);
    bridge.setAdmin(false);
    bridge.setCommunityId('c1');
    bridge.setPainted(true);
    bridge.tab('home');
    bridge.supaNext('rpc', { data: 'player', error: null });
    const renders = bridge.renderCount();
    const partials = bridge.partialCount();
    await bridge.postWork();
    expect(bridge.getState().isAdmin).toBe(false);
    expect(bridge.renderCount()).toBe(renders);
    expect(bridge.partialCount()).toBe(partials + 1);
    expect(c.innerHTML.length).toBeGreaterThan(0);              // the Home container was rebuilt
  });

  it('an owner who is already admin (a re-derive) does not render again', async () => {
    stageHome();
    bridge.setSignedIn(session.user, null);
    bridge.setAdmin(true);
    bridge.setCommunityId('c1');
    bridge.setPainted(true);
    bridge.tab('home');
    bridge.supaNext('rpc', { data: 'owner', error: null });
    const renders = bridge.renderCount();
    await bridge.postWork();
    expect(bridge.renderCount()).toBe(renders);
  });

  it('before the boot paint the role result paints nothing', async () => {
    stageHome();
    bridge.setSignedIn(session.user, null);
    bridge.setAdmin(false);
    bridge.setCommunityId('c1');
    bridge.setPainted(false);
    bridge.supaNext('rpc', { data: 'owner', error: null });
    const renders = bridge.renderCount();
    const partials = bridge.partialCount();
    await bridge.postWork();
    expect(bridge.getState().isAdmin).toBe(true);
    expect(bridge.renderCount()).toBe(renders);
    expect(bridge.partialCount()).toBe(partials);
  });
});
```
The `it` for the owner asserts the render count and the flag; the shell string carrying `id="tab-manage"` for an admin is already pinned by `manage-page.test.js` (grep `tab-manage` there) and does not need a second copy here. If `promptNameFillIfNeeded` (fired void from the function) leaves a `namefill-page` node behind, the per-case `reset()` already clears the registry.

- [ ] **Step 4: Run to verify the second case fails**

Run: `cd test && npx vitest run account-round.test.js -t "C102 Task 3"`
Expected: "a player gets no full render" FAILS (+1 render today); the owner case PASSES today too (it already renders exactly once) and stays as the guard.

- [ ] **Step 5: Implement**

In `runPostSignInWork` (`public/app.js:7294`), capture the flag as the first line of the `try`, and replace the render at the end:

```js
async function runPostSignInWork() {
  try {
    const wasAdmin = state.isAdmin;   // C102: captured BEFORE deriveRole, compared after; never a flag set elsewhere
    for (let i = 0; i < 3; i++) {
      ...unchanged...
    }
    ...unchanged through void promptNameFillIfNeeded();...
    // bootPaintDone gate (2026-07-12): mid-boot the role/admin state just set above is carried by the
    // single boot render(); painting here would swap the splash for half-loaded content.
    // C102 (2026-08-26): the shell gains or loses #tab-manage and the Manage nav button only when the flag
    // flips, and only render() builds the shell. Otherwise the nav is byte-identical (its two inputs,
    // checkinNavVisible() and isAdmin, are untouched here), so an in-place repaint carries the refreshed
    // tournaments and teamMembers onto the Home hero and My Team without resetting anyone's scroll.
    if (state.loaded && bootPaintDone) {
      try { if (wasAdmin !== state.isAdmin) render(); else partialRender(); } catch {}
    }
  } catch (err) { console.error('Role derive error', err); }
}
```
Bump `APP_VERSION` to `'2026.08.26.3'`.

- [ ] **Step 6: Run the suite**

Run: `node --check public/app.js && cd test && npx vitest run`
Expected: 39 files, 1244 tests, green.

- [ ] **Step 7: Commit**

```bash
git add public/app.js test/account-round.test.js
git commit -m "perf(boot): the role result renders the shell only when the admin flag flips, else repaints in place - v2026.08.26.3"
```

---

## Task 4: Ship the boot round (controller, inline)

**Files:**
- Modify: nothing (push + drive)

- [ ] **Step 1: Push and confirm prod serves the version**

```bash
git push origin main
sleep 60; curl -s https://athletic-specimen.com/app.js | grep -o "APP_VERSION = '[^']*'"     # expect 2026.08.26.3
```

- [ ] **Step 2: The probe, on Mike's session (extension connected first)**

Run the Task 0 srcdoc probe again. Expected: `render` entries at most 2 on Home (one boot paint plus the admin flip), `partialRender` present once, and no `render` after the name lands. Save to `$SCRATCH/probe-boot.json`. If the extension is not connected, say so and rely on the 1244 tests; do not claim the probe ran.

- [ ] **Step 3: Facts-only drive at 390 and 1280**

Cold load signed in: zero console errors; the Manage nav button present; the header chip carries the NAME's letter (not the email's) within two seconds of the paint; the PUBLIC badge and the sync line under the avatar present; open Tournament while signed out in a second tab: the wall shows, sign in, the wall drops and the hub shows without a page flash. Record each fact in `$SCRATCH/drive-boot.md`.

- [ ] **Step 4: Vault**

Append one line at the top of `01-state/log.md` ("boot round live at v2026.08.26.3: three sites, at most two paints for an owner") and update `NOW.md`'s latest paragraph. Task 12 does the full write-back.

---

## Task 5: Create `public/manage.js` and load it before `app.js`

**Files:**
- Create: `public/manage.js`, `$SCRATCH/cut.mjs`
- Modify: `public/app.js` (the block leaves; `pickupDaySet` and `canScoreMatch` return beside their public callers; `APP_VERSION`), `public/index.html:114-125`

**Interfaces:**
- Produces: `public/manage.js`, declarations only, LF, loaded from `index.html` immediately before `/app.js`. Every name it declares is unchanged. Tasks 6 to 11 depend on the file existing at that path with that contract.

- [ ] **Step 1: Re-read the edges (the boot round shifted nothing above 8131, but confirm)**

```bash
grep -n "^// ── Manage tab (session-10 pick R1)" public/app.js        # the banner, expect 8131 + (lines Tasks 1-3 added above it)
grep -n "^function renderPublicShell" public/app.js                  # the first non-Manage function after the block
grep -n "^function pickupDaySet\|^function canScoreMatch\|^function mgTournamentCreate" public/app.js
grep -n "^function checkinNavVisible\|^function buildBracketNodeHTML" public/app.js
```
The block is the banner line through the closing `}` of `mgTournamentCreate` (the line reading `}` two lines above `function renderPublicShell`, with the blank lines between belonging to `app.js`).

- [ ] **Step 2: Write the cut script (scratchpad) and run it**

`$SCRATCH/cut.mjs`:
```js
import { readFileSync, writeFileSync } from 'node:fs';
const REPO = 'C:/Users/OlasM/OneDrive/Athletic Specimen App/';
const src = readFileSync(REPO + 'public/app.js', 'utf8');
if (src.includes('\r')) throw new Error('app.js has CR bytes; stop');
const lines = src.split('\n');
const at = (re) => { const i = lines.findIndex((l) => re.test(l)); if (i < 0) throw new Error('marker missing ' + re); return i; };
const start = at(/^\/\/ ── Manage tab \(session-10 pick R1\)/);
const shell = at(/^function renderPublicShell\(\)/);
let end = shell - 1; while (lines[end].trim() === '') end--;          // the closing brace of mgTournamentCreate
if (lines[end] !== '}') throw new Error('block does not end on a bare brace: ' + lines[end]);
let block = lines.slice(start, end + 1);
// Hoist a function (and the contiguous // comment lines directly above it) OUT of the block, return its text.
function hoist(name) {
  const i = block.findIndex((l) => l.startsWith('function ' + name + '('));
  if (i < 0) throw new Error(name + ' not in block');
  let a = i; while (a > 0 && block[a - 1].startsWith('//')) a--;
  let b = i; while (block[b] !== '}') b++;
  const text = block.slice(a, b + 1);
  block = block.slice(0, a).concat(block.slice(b + 1));
  return text;
}
const pickup = hoist('pickupDaySet');
const canScore = hoist('canScoreMatch');
const rest = lines.slice(0, start).concat(lines.slice(end + 1));
// pickupDaySet goes directly above checkinNavVisible; canScoreMatch directly above buildBracketNodeHTML.
const insert = (arr, re, text) => { const i = arr.findIndex((l) => re.test(l)); if (i < 0) throw new Error('site missing ' + re); return arr.slice(0, i).concat(text, [''], arr.slice(i)); };
let out = insert(rest, /^function checkinNavVisible\(\)/, pickup);
out = insert(out, /^function buildBracketNodeHTML\(/, canScore);
writeFileSync(REPO + 'public/app.js', out.join('\n'));
const header = [
  '// public/manage.js: the Manage surfaces (the admin tab), extracted from app.js in C102 (2026-08-26).',
  '// A classic script sharing the global lexical record with app.js. DECLARATIONS ONLY: function declarations',
  '// and let/const whose initializer depends on nothing in app.js. It loads BEFORE app.js (index.html), because',
  '// app.js runs init() synchronously and saveLocal reaches mgSaveTournamentPin during that call. A duplicate',
  '// top-level name across the two files is a load-time SyntaxError (let/const) or a silent override (function);',
  '// test/client-files.test.js guards both. Nothing here is imported or exported.',
  '',
];
writeFileSync(REPO + 'public/manage.js', header.concat(block, ['']).join('\n'));
console.log('moved', block.length, 'lines; app.js now', out.length, 'lines');
```
Run: `node "$SCRATCH/cut.mjs"`. Expected: `moved 51xx lines; app.js now ~100xx lines` (5,155 minus the two hoisted functions and their comments, plus two blank lines added around each hoist).

- [ ] **Step 3: Check the three syntaxes and the contract**

```bash
node --check public/app.js && node --check public/manage.js
cat public/manage.js public/app.js > "$SCRATCH/concat.js" && node --check "$SCRATCH/concat.js"
grep -c $'\r' public/manage.js                                                    # 0
# no name declared in both files:
node -e "
const fs=require('fs');const names=(f)=>new Set([...fs.readFileSync(f,'utf8').matchAll(/^(?:async )?(?:function|let|const)\s+([A-Za-z_\$][\w\$]*)/gm)].map(m=>m[1]));
const a=names('public/app.js'),m=names('public/manage.js');const both=[...m].filter(n=>a.has(n));console.log('manage declares',m.size,'dup',both);if(both.length)process.exit(1)"
# declarations only at depth 0 of manage.js:
node -e "
const L=require('fs').readFileSync('public/manage.js','utf8').split('\n');let depth=0,bad=[];
for(let i=0;i<L.length;i++){const l=L[i];if(depth===0&&l.trim()&&!/^(\/\/|\/\*|\*|(async )?function |let |const |})/.test(l)&&!l.startsWith(' ')&&!l.startsWith('\`'))bad.push(i+1+': '+l.slice(0,60));
for(const ch of l.replace(/\/\/.*$/,'')){if(ch==='{')depth++;else if(ch==='}')depth--;}}
console.log('depth-0 non-declaration lines:',bad.length);bad.slice(0,10).forEach(x=>console.log(x));if(bad.length)process.exit(1)"
```
Expected: all pass. The depth counter is a heuristic (braces inside template literals and strings); if it reports lines that are template continuations or string contents, read each one; a real top-level statement is a STOP.

- [ ] **Step 4: The script tag and its comment**

In `public/index.html`, between the `/pure.js` tag (`:123`) and the `<!-- Main App` comment, insert:
```html
  <!-- Manage surfaces (the admin tab): declarations only, shares app.js's globals; MUST load before app.js (C102) -->
  <script src="/manage.js" defer></script>
```
and in the comment block at `:114-115` change `(supabase UMD -> config -> pure -> app)` to `(supabase UMD -> config -> pure -> manage -> app)`.

- [ ] **Step 5: Bump and run the suite, expecting the harness failures Task 7 will fix**

Bump `APP_VERSION` to `'2026.08.26.4'`. Run `cd test && npx vitest run 2>&1 | tail -30`. Expected: many files RED with `ReferenceError: manageView is not defined` / `mgX is not defined` (the harnesses load only `app.js`). That is the expected state between Tasks 5 and 7; record the failing file count in the report. `version-source.test.js` must still be green.

- [ ] **Step 6: Commit (the suite is red by design until Task 7; say so in the message)**

```bash
git add public/app.js public/manage.js public/index.html
git commit -m "refactor(manage): the Manage block moves verbatim to public/manage.js, loaded before app.js; pickupDaySet and canScoreMatch hoisted back (harness rewire follows in the next commits) - v2026.08.26.4"
```

---

## Task 6: Precache the file and add the three structural guards

**Files:**
- Modify: `public/sw.js:8-21`
- Create: `test/client-files.test.js`

**Interfaces:**
- Consumes: `public/manage.js` from Task 5.
- Produces: `test/client-files.test.js` (three guards). The suite's file count becomes 40.

- [ ] **Step 1: Write the failing guards**

`test/client-files.test.js`:
```js
// C102 (2026-08-26): the client is three classic scripts sharing one global record. These guards pin the
// three facts that keep that safe and that nothing else in the suite would notice breaking:
// 1. every script index.html loads is precached by the service worker (an unlisted file is served
//    cache-first by sw.js and never enters the cache, so the app half-boots offline and never self-heals);
// 2. manage.js is declarations-only (it loads before app.js, whose init() reaches into it synchronously);
// 3. no top-level name is declared in both files (a let/const twin is a load-time SyntaxError that kills the
//    whole second script while node --check passes; a function twin is legal and silently wins).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../public/' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const html = read('index.html');
const sw = read('sw.js');
const app = read('app.js');
const manage = read('manage.js');

describe('client files', () => {
  it('every local script index.html loads is in the service worker precache list', () => {
    const scripts = [...html.matchAll(/<script src="(\/[^"?]+)"/g)].map((m) => m[1]);
    expect(scripts).toContain('/manage.js');
    expect(scripts.indexOf('/manage.js')).toBeLessThan(scripts.indexOf('/app.js'));   // the load order
    expect(scripts.indexOf('/pure.js')).toBeLessThan(scripts.indexOf('/manage.js'));
    const assets = sw.slice(sw.indexOf('const ASSETS = ['), sw.indexOf('];', sw.indexOf('const ASSETS = [')));
    for (const s of scripts) expect(assets, s + ' is loaded by index.html but not precached').toContain("'" + s + "'");
  });

  it('manage.js is declarations only at depth 0', () => {
    const lines = manage.split('\n');
    let depth = 0; const bad = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const code = l.replace(/\/\/.*$/, '');
      if (depth === 0 && l.trim() && !l.startsWith(' ') && !l.startsWith('`')
        && !/^(\/\/|\/\*|\*|(async )?function |let |const |})/.test(l)) bad.push((i + 1) + ': ' + l.slice(0, 60));
      for (const ch of code) { if (ch === '{') depth++; else if (ch === '}') depth--; }
    }
    expect(bad, 'top-level statements in manage.js (it must stay declarations-only):\n' + bad.join('\n')).toEqual([]);
    // and no initializer reaches into app.js: the only non-literal shapes allowed are new Set() and undefined
    const inits = [...manage.matchAll(/^(?:let|const)\s+\w+\s*=\s*(.+?);\s*(?:\/\/.*)?$/gm)].map((m) => m[1].trim());
    const allowed = (v) => /^(['"`].*['"`]|-?\d+(\.\d+)?|true|false|null|undefined|\[\]|\{\}|new Set\(\)|new Map\(\))$/.test(v);
    expect(inits.filter((v) => !allowed(v))).toEqual([]);
  });

  it('no top-level name is declared in both app.js and manage.js', () => {
    const names = (src) => [...src.matchAll(/^(?:async )?(?:function|let|const)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
    const a = new Set(names(app));
    const dup = names(manage).filter((n) => a.has(n));
    expect(dup).toEqual([]);
    expect(names(manage).length).toBeGreaterThan(250);   // the block carried 273 declarations
  });
});
```
If the initializer census reports a shape that is not in `allowed` but depends on nothing in `app.js` (read the line), add that exact shape to `allowed` with a comment naming the line; never widen to a wildcard.

- [ ] **Step 2: Run to verify the precache guard fails**

Run: `cd test && npx vitest run client-files.test.js`
Expected: the first `it` FAILS ("/manage.js is loaded by index.html but not precached"); the other two PASS (Task 5's cut satisfies them; if not, the cut is wrong and this task reports BLOCKED with the lines).

- [ ] **Step 3: Implement**

In `public/sw.js` `ASSETS`, after `'/app.js',` add `'/manage.js',` (before `'/pure.js',`). No other change; `NETWORK_FIRST_PATHS = new Set(ASSETS)` picks it up.

- [ ] **Step 4: Prove each guard can fail, then restore**

Temporarily remove the `'/manage.js',` line: guard 1 red. Restore. Temporarily append `manageView = 'x';` to `manage.js`: guard 2 red. Restore. Temporarily add `let manageView2 = 1;` to both files: guard 3 red. Restore. `git diff --stat` must show only `public/sw.js` and the new test after the restores.

- [ ] **Step 5: Commit**

```bash
git add public/sw.js test/client-files.test.js
git commit -m "test(client): precache manage.js and pin the three facts of the two-script client (precache list, declarations only, disjoint names)"
```
(No `APP_VERSION` bump: `sw.js` is fetched by URL with `?v=` from `app.js`; the bump lands with Task 7's commit, which is the next code change. If the reviewer asks for one here, bump to `.5` and renumber the later tasks.)

---

## Task 7: Rewire the 21 vm harnesses

**Files:**
- Modify (two lines each, the `readFileSync` and the `runInContext`): `test/account-round.test.js:24,332`, `test/bracket-page.test.js:170`, `test/checkin-page.test.js:69`, `test/history-page.test.js:69`, `test/home-details-card.test.js:68`, `test/manage-page.test.js:125`, `test/manage-round.test.js:18,339`, `test/myteam-page.test.js:68`, `test/pools-page.test.js:72`, `test/standings-retarget.test.js:67`, `test/team-payment-popup.test.js:161`, `test/tournament-create.test.js:96,213`, `test/tournament-delete.test.js:153`, `test/tournament-edit-save.test.js:202`, `test/tournament-end-unplayed.test.js:158`, `test/tournament-picker.test.js:188`, `test/tournament-reset.test.js:125`, `test/tournament-round.test.js:83`, `test/tournament-switcher.test.js:125`, `test/tournament-venue.test.js:69`, and the concatenated loader `test/register-auto-attach.test.js:125`.

**Interfaces:**
- Consumes: `public/manage.js` (Task 5).
- Produces: every harness loads `pure.js`, then `manage.js`, then `app.js + epilogue`, each in its own `runInContext` with `{ filename }`.

- [ ] **Step 1: List every loader and its `readFileSync`**

```bash
grep -n "runInContext(" test/*.test.js | grep -v "tournament-create.test.js:4[45]\|tournament-create.test.js:50"
grep -n "readFileSync(new URL('../public/app.js'" test/*.test.js
```
Expected: 21 files with a `pureSrc` line directly followed by an `appSrc + epilogue` line (some name it `src` or `APP_SRC`), plus `register-auto-attach.test.js`'s single concatenated call. `version-source.test.js` reads `app.js` as a string only and is NOT touched.

- [ ] **Step 2: Apply the two-line change to each vm harness**

For every file, next to the `app.js` read add (matching the local variable style):
```js
  const mgSrc = readFileSync(new URL('../public/manage.js', import.meta.url), 'utf8');
```
and between the `pure.js` and the `app.js` `runInContext` calls add:
```js
  vm.runInContext(mgSrc, context, { filename: 'manage.js' });   // C102: the Manage block loads before app.js, as in index.html
```
using the same context variable name the file uses (`context` or `sandbox`). The epilogue stays on the `app.js` call. Where a file reads `app.js` twice (once for the vm, once as a whole-file string for guards), only the vm read gets a sibling here; Task 8 handles the guard string.

For `test/register-auto-attach.test.js:125`:
```js
  vm.runInContext(pureSrc + '\n' + mgSrc + '\n' + appSrc + epilogue, sandbox, { filename: 'app.js' });
```
with its `mgSrc` read added beside the `appSrc` read.

For `test/tournament-create.test.js`: the read goes beside `:96-97`, the load between `:213` and `:214`; the two probe `runInContext` calls at 445 and 507 are untouched.

- [ ] **Step 3: Run the suite**

Run: `cd test && npx vitest run 2>&1 | tail -8`
Expected: 40 files, 1247 tests (1244 + the 3 guards), all green. Any remaining `ReferenceError` names a harness that was missed or loads in the wrong order: fix that file, never the app.

- [ ] **Step 4: Confirm nothing was weakened**

```bash
git diff --stat test/ | tail -1                                     # 22 files changed
git diff test/ | grep "^[-+]" | grep -v "^[-+][-+]" | grep -v "mgSrc\|manage.js" | head   # must print nothing
```
The second command proves every changed line mentions `mgSrc` or `manage.js`; anything else is a change to what a test asserts and is not allowed in this task.

- [ ] **Step 5: Bump and commit**

Bump `APP_VERSION` to `'2026.08.26.5'` (the harness change is test-only, but the commit carries the `sw.js` change's version bump from Task 6; see that task's note).
```bash
git add public/app.js test/
git commit -m "test(harness): every vm harness loads manage.js before app.js, as index.html does - v2026.08.26.5"
```

---

## Task 8: Widen the source guards and NF-2

**Files:**
- Modify: `test/supabase-writes.test.js:85-95`, `test/manage-round.test.js:352,2554`, `test/account-round.test.js:416`, `test/tournament-picker.test.js:44`, `test/tournament-switcher.test.js:35`, `test/tournament-round.test.js:14`, `test/motion-port.test.js:11`, `test/pool-schedule.test.js:186`, `test/bracket-endgame.test.js:120,132,139`, `test/home-details-card.test.js:164`, `test/team-payment-popup.test.js:200`

**Interfaces:**
- Consumes: `public/manage.js`.
- Produces: every whole-client source guard scans `app.js + '\n' + manage.js`; NF-2 scans `manage.js` as a third file.

- [ ] **Step 1: NF-2's third file scan (write it first, watch it pass, then prove it can fail)**

In `test/supabase-writes.test.js`, after the `public/checkin.html` `it` (`:90-93`), add:
```js
  it('public/manage.js has no bare/unguarded Supabase write', () => {
    // C102: seven write sites moved here with the Manage block (pickup_days update/insert/delete, check_in,
    // check_out, register_player, the players insert). Without this scan they leave NF-2's coverage silently.
    const offenders = unguardedWrites(new URL('../public/manage.js', import.meta.url), 'manage.js');
    expect(offenders, `Unguarded Supabase write(s), capture { error } (or route through a guarded tdb* helper):\n${offenders.join('\n')}`).toEqual([]);
  });
```
(The existing `app.js` `it` at `:86-89` carries a pre-copy-law dash in its message; leave that line as it is, and write the new one as above.) Run `npx vitest run supabase-writes.test.js`: green. Then in `public/manage.js` find the `pickup_days` insert, temporarily change `const { error } = await` to `await` on that line, run again: RED naming `manage.js:<line>`. Restore the line exactly (`git diff public/manage.js` must be empty).

- [ ] **Step 2: The whole-file scans**

In each of the ten files, where the guard string is read from `public/app.js`, add the `manage.js` read and concatenate. Example for `test/manage-round.test.js:352`:
```js
const appSrc = (readFileSync(new URL('../public/app.js', import.meta.url), 'utf8')
  + '\n' + readFileSync(new URL('../public/manage.js', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');   // C102: the client is two files; a guard over one would pass vacuously
```
Apply the same shape (keeping each file's variable name and any `.replace(/\r\n/g, '\n')` it already had) at: `account-round.test.js:416`, `tournament-picker.test.js:44`, `tournament-switcher.test.js:35`, `tournament-round.test.js:14`, `motion-port.test.js:11`, `pool-schedule.test.js:186`, `bracket-endgame.test.js:120`, `home-details-card.test.js:164`, `team-payment-popup.test.js:200`.

`manage-round.test.js:2554` (the RPC-literal guard) reads `appSrc`, so it is covered by the line above; change its message text from `never called from app.js` to `never called from the client`.

`bracket-endgame.test.js:132,139` slice from a marker to the END of the string; with the concatenation the tail now includes all of `manage.js`. Read both assertions: if either is a `not.toContain` over that tail, bound the slice to the next `\nfunction ` after the marker instead, so it asserts what it asserted before.

- [ ] **Step 3: Run the suite**

Run: `cd test && npx vitest run 2>&1 | tail -8`
Expected: 40 files, 1248 tests, green. A guard that goes RED here found a real difference between the concatenation and the old single file: read it; the likely cause is a positional slice (`indexOf` of a marker that now appears in both files). Fix the slice bound, never the assertion.

- [ ] **Step 4: Commit**

```bash
git add test/
git commit -m "test(guards): every whole-client source guard scans app.js and manage.js together; NF-2 scans manage.js"
```

---

## Task 9: Prove the move (controller, inline)

**Files:**
- Create: `$SCRATCH/after.json`, `$SCRATCH/before-at-boot.json`

- [ ] **Step 1: Re-take the baseline at the boot round's HEAD and confirm Part A changed no Manage builder**

```bash
git stash list | wc -l                                  # must be 0 (never stash public/ files)
git worktree add "$SCRATCH/wt-boot" v-boot-round 2>/dev/null || git worktree add "$SCRATCH/wt-boot" <Task 3 commit sha>
(cd "$SCRATCH/wt-boot" && node "$SCRATCH/equiv.mjs" --files=public/app.js) > "$SCRATCH/before-at-boot.json"
diff "$SCRATCH/before.json" "$SCRATCH/before-at-boot.json" && echo "Part A changed no Manage builder"
git worktree remove "$SCRATCH/wt-boot"
```
(`equiv.mjs` resolves `public/...` relative to its `REPO` constant; point it at the worktree with an env var or a `--repo=` flag added in Task 0.)

- [ ] **Step 2: The split**

```bash
node "$SCRATCH/equiv.mjs" --files=public/manage.js,public/app.js > "$SCRATCH/after.json"
diff "$SCRATCH/before-at-boot.json" "$SCRATCH/after.json" && echo "IDENTICAL"
```
Expected: `IDENTICAL`. Any difference is a behaviour change smuggled into the move: STOP, read the differing key, find the cause in the cut (the two hoisted functions are the first suspects), fix, re-run. Record the builder count and the THROW count (must equal Task 0's) in `$SCRATCH/baseline.md`.

- [ ] **Step 3: Also prove the wrong order fails**

```bash
node "$SCRATCH/equiv.mjs" --files=public/app.js,public/manage.js > "$SCRATCH/wrong-order.json" 2>&1; echo "exit $?"
```
Expected: either a throw or a `THROW` entry (a TDZ read or a missing name). If the wrong order ALSO produces an identical file, the instrument is not exercising the seam; say so in the ledger and add a builder that reads a Manage binding at load.

---

## Task 10: Re-arm the UI gate for the new file (controller, inline)

**Files:**
- Modify: `C:/Users/OlasM/.claude/hooks/_vault-map.mjs:13`, `C:/Ai Master/LasOlas/projects/athletic-specimen.md:7`

- [ ] **Step 1: Both maps**

`_vault-map.mjs:13`: `uiTest: /(^|\/)public\/(app\.js|[^/]+\.(html|css))$/i` becomes `uiTest: /(^|\/)public\/(app\.js|manage\.js|[^/]+\.(html|css))$/i`.
`athletic-specimen.md:7`: `uiTest: "public[\\/](app\.js|.*\.html|.*\.css)$"` becomes `uiTest: "public[\\/](app\.js|manage\.js|.*\.html|.*\.css)$"`.

- [ ] **Step 2: Prove the gate blocks**

Delete `.claude/markers/ui-options.json` (the exemption marker; it is re-minted if needed). Attempt an `Edit` on `public/manage.js` that inserts a 500-character HTML comment containing `class="x"` at the end of the file. Expected: the §38 gate BLOCKS it. Do not override; the block is the proof. Then run `node C:/Users/OlasM/.claude/hooks/lasolas/lasolas.mjs build` if the canon needs a rebuild after the addendum edit (its output says), and `node C:/Users/OlasM/.claude/hooks/lasolas/lasolas-tests.mjs` for the suite.

- [ ] **Step 3: Record**

One line in the LasOlas change-log (`C:/Ai Master/LasOlas/_archive/change-log.md`): "2026-08-26 athletic-specimen uiTest gains manage.js (C102 split)".

---

## Task 11: Ship the split (controller, inline)

- [ ] **Step 1: Final checks and push**

```bash
node --check public/app.js && node --check public/manage.js && cat public/manage.js public/app.js > "$SCRATCH/concat.js" && node --check "$SCRATCH/concat.js"
(cd test && npx vitest run 2>&1 | tail -4)     # 40 files, 1248 tests
wc -l public/app.js public/manage.js            # ~10,04x and ~5,16x
git push origin main
sleep 60; curl -s https://athletic-specimen.com/manage.js | head -3; curl -s https://athletic-specimen.com/app.js | grep -o "APP_VERSION = '[^']*'"
```

- [ ] **Step 2: The probe, compared**

Run the srcdoc probe again on Mike's session. Expected: the same `render` / `partialRender` sequence as `$SCRATCH/probe-boot.json` (Task 4). Extend the injected script with: `for (const fn of ['manageContainerHTML','mgActiveTournament','openMgScoreSheet','mgTournamentCreate']) events.push({ name: 'fn:' + fn, ok: typeof window[fn] === 'function' })` and `events.push({ name: 'binding:manageView', ok: (() => { try { return typeof manageView === 'string'; } catch (e) { return false; } })() })` (the bare identifier; `window.manageView` is `undefined` even when correct). Every `ok` must be true.

- [ ] **Step 3: Facts-only drive at 390 and 1280, signed in as the owner**

Zero console errors on the cold load (the first fact is `document.visibilityState`, per the banked lesson). Manage opens; each area opens: Tournament (the picker, a sub-hub, Event settings, Pools, Bracket, Rules, Close out), Pickup days (list and the form), Players, Teams, Admins, Check-in. The score sheet opens on a bracket game and is closed WITHOUT scoring. One destructive control (Reset the bracket's unlock) is reached and NOT fired. Watch one 15s poll tick on the Manage tab: the network shows the poll and no full-shell rebuild (the wrapped `render` count in the probe does not increase). Application tab: the cache `athletic-specimen-cache-2026.08.26.5` lists `/manage.js`. Record every fact in `$SCRATCH/drive-split.md`.

---

## Task 12: Write-back (controller, inline)

- [ ] **Step 1: The history file BEFORE any completion mark**

`C:/Ai Master/Projects/Athletic Specimen/12-history/task-#6-c102-manage-extraction-boot-session18.md` with the frontmatter shape of `task-#5-c101-data-round-session18.md`, sections: what shipped (versions, commits, line counts, test counts), process (recon, the four forks, the spec's 12-finding edit pass, subagent-driven build), verification (the suite, the equivalence diff, the probe traces, the drives), owed/open (the Check In `partialRender` branch; the CSS round; the eight minors), next.

- [ ] **Step 2: Archive the instruments**

Copy `$SCRATCH/recon-c102/DIGEST.md` to `12-history/assets/2026-08-26-c102-recon-digest.md`, `$SCRATCH/c102-spec-review.md` to `12-history/assets/2026-08-26-c102-spec-review.md`, the SDD ledger to `12-history/assets/2026-08-26-c102-sdd-ledger.md`, `baseline.md` and the two probe JSONs beside them.

- [ ] **Step 3: The state files**

`01-state/log.md`: one entry at the top (the round in five sentences). `01-state/current.md`: replace the "C102 OPENED" paragraph with "C102 DONE" and the facts. `01-state/NOW.md`: the latest paragraph and the next action. `01-state/decisions.md`: append to the 2026-08-26 C102 entry the two rulings made during the build (any Ruling lines from the ledger). `01-state/debugging.md`: a new entry "Symptom: the whole second script is dead at load (or a function silently does the old thing) after a two-file split" with the duplicate-declaration facts (let/const SyntaxError vs function override, `node --check` passing either way, the name-intersection guard). `01-state/Tasks From Claude.md`: the C102 row becomes DONE for the app.js split + boot; a new row for the CSS split + the eight minors.

- [ ] **Step 4: The stale line numbers**

`current.md` (the `app.js:2928-2936` registration hazard cite: re-grep and fix), `debugging.md` (`render()` at ~4717: fix to the new line), `03-anatomy/file-map.md` (app.js ~9,700 lines: two files now, with counts), `PRODUCT-SURFACE.md` (single app.js ~10k and the dead vercel URL), `CLAUDE.md:38` (`APP_VERSION` "line ~22"), `02-identity/mike-preferences.md:29` and `public/sw.js:4` (~27): all say "app.js:34" or, better, "the `const APP_VERSION` line in app.js". The `CLAUDE.md` and `sw.js` edits are one more commit with a version bump (`.6`), pushed.

- [ ] **Step 5: Hand back**

The end-flight message with the AskUserQuestion (one Recommended option) offering the next round: the CSS split + the eight minors recon, or Task 10 of the Manage plan on Mike's canvas consent.

---

## Self-review

**Spec coverage.** 4.3 three edits: Tasks 1, 2, 3. 4.4 guards: the Task 1 header test (sync notice, badge), Task 2 (wall, pre-paint), Task 3 (flip capture, pre-paint). 4.5 tests 1-8: Task 1 (1-3), Task 2 (4, 7), Task 3 (5, 6), Task 4 (8). 4.6: Task 4. 5.1 the cut + hoists: Task 5. 5.3 contract: Task 5 step 3 + Task 6 guards. 5.4 load order: Task 5 step 4 + Task 6 guard 1. 5.5 precache: Task 6. 5.6 harness: Task 7. 5.7 guards + NF-2: Task 8. 5.8 equivalence: Tasks 0 and 9. 5.9 gates: the Global Constraints exemption + Task 10. 5.10 ship: Task 11. Section 6 T12: Task 12. Section 8 open items: `readyState` closes in Task 0/4's probe (add `events.push({ name: 'readyState', v: document.readyState })` at the injected script's first line); the error-boundary question is read during Task 5 (grep `_errorBoundaryShown` and record what triggers it in the report).

**Placeholders.** None: every code step carries the code. Two shapes are read at execution time by design (the `seedHub`/`seedPools` argument shapes in Task 0, the `bracket-endgame` slice bounds in Task 8) and each says which lines to read.

**Type consistency.** `accountChipHTML()` / `repaintAccountChip()` (Task 1) are the names Tasks 2 and 3 use; `partialCount()` (Task 2) is what Task 3 asserts; `mgSrc` is the variable every Task 7 and Task 8 edit uses; the version sequence is `.1 .2 .3` (boot) `.4` (cut) `.5` (harness, carrying sw.js) `.6` (write-back pointers).
