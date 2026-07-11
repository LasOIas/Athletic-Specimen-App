# Public Subpage Restyle — Implementation Plan (session-9 §38 picks)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax. Every builder's FIRST action: invoke
> `lasolas-skill` (§29). Builders commit; the CONTROLLER reviews + pushes (§21).

**Goal:** Restyle every remaining public subpage to the locked 2026-07-10 atom-up system
per Mike's seven session-9 picks, and delete the dead legacy register branch.

**Architecture:** Vanilla-JS string builders in `public/app.js` + one CSS file
`public/styles.css`. Each task = one shippable slice (version bump, vitest green,
`node --check`, own commit). No framework, no new files. Pure logic stays in
`public/pure.js` (TDD via vitest, `test/`).

**Tech stack:** vanilla JS, vitest (`npx vitest run`, 288 green at baseline `d279638`),
Supabase anon reads (already wired), Vercel auto-deploy on push.

## Global constraints (every task)

- Locked system: stone bg (body `--surface-3`), **Barlow Semi Condensed** display via
  `var(--font-display)`, THE muted blue `var(--accent)` (§51 matte — NO neon, no glow),
  hairline section labels, flat on stone (NO frosted `.pd-card` on restyled pages),
  SVG icons only (no emoji), plain-English copy, no "night/tonight", no spots-copy.
- **Skill ratings NEVER render on any public surface** (admin-only rule).
- §41: desktop (≥1024 media block, styles.css ~3544+) ships in the SAME slice as mobile.
- Bump `APP_VERSION` (`public/app.js:30`, format `2026.07.10.N` continuing from .18)
  in EVERY slice; `node --check public/app.js`; `npx vitest run` green before commit.
- The §38 marker: controller runs `ui38-mark.mjs --decision=3-options-shown
  --reason="build slice N under Mike's session-9 picks (task-#6..#11 history files)"`
  before each builder edits UI files.
- New CSS classes are namespaced per-kit as specified; delete superseded CSS in the
  SAME slice (grep-gate: `grep -c "classname" public/*.{js,html}` must be 0 before
  deleting a rule; report counts in the commit message).
- Copy style for tags: Barlow 700 caps letterspaced; live = `--live/-soft/-ink` greens;
  FINAL/UP NEXT tags muted.
- Real-data honesty: every state renders only true data (e.g. History shows
  "No champion recorded" for June 2026).

## Locked-pick reference (Mike, session 9 — history files task-#6…#11)

1. **Pools & schedule (H):** POOL A/B/C **+ SEEDING** tabs (filled-blue active, outline
   inactive) → per-pool standings-lite table (# / Team / W–L / Diff) → GAMES · NETS n–m
   section with per-net blue hairline labels and rows `**winner** def. loser · score`,
   live = green score + LIVE pill, queued = muted + UP NEXT.
2. **Standings (K):** the separate page DIES; Seeding = 4th tab on Pools & schedule;
   hub row + bracket seeding chip retarget there.
3. **Bracket (M):** one quiet status line (`● Live · Double elimination · <round>`)
   above the UNCHANGED bt-* tree; pre/completed states de-carded (flat).
4. **My team (Q):** flat scoreboard hero (eyebrow → team → big record → pips) →
   up-next strip (48px filled-blue NET tile) → stacked GAMES then ROSTER sections —
   **no Games/Roster toggle**.
5. **Check In (X, no bubbles):** anon-only kiosk — centered Barlow "Check in" title,
   blue-bordered search, results = BIG bordered tap rows (matched prefix accent bold,
   right tag TAP TO CHECK IN / grayed ALREADY IN), dashed "I'm new — add me".
   **NO signed-in hero on this tab** (supersedes the session-5 hero HERE only);
   **no initials bubbles** in result rows. Kiosk `checkin.html` untouched.
6. **History (Z):** tabs die; ONE year-grouped list of tournament rows
   (blue trophy icon tile + name + "N teams · <champion|No champion recorded>" + chevron).
7. **Sign-in/claim (AD+AC hybrid):** big centered brand block (logo ~110px + Barlow
   wordmark) up top, form in the lower half with **hairline-underline fields**
   (rf-* grammar) + caps muted labels + full-width blue CTA; quiet "Admin sign-in"
   stays at the bottom; claim page adopts the same field/CTA grammar. Mechanics
   (email+password, create toggle, onAuthSubmit, admin panel) untouched.

---

### Task 1: Shared subpage chrome + Pools & schedule rebuild (picks 1+2's tab)

**Files:**
- Modify: `public/app.js` — `buildPoolsSchedulePageHTML` (5849), `pdPoolFilter` (5220),
  the `data-pd-pool` click handler (search `data-pd-pool` in attachHandlers),
  `pdPageHeaderHTML` (9050), the pools/bracket inline headers (5856, 5445, 5247).
- Modify: `public/styles.css` — `.pd-pagehdr/.pd-htitle` block (~2941), new `pl-*` kit,
  the ≥1024 pools rules (~3600-3626 replaced).
- Test: `test/pools-page.test.js` (new).

**Interfaces:**
- Consumes: `shapeStandingsByPool(pools, teams, matches)`, `computeSeeding(teams,
  matches)`, `computeStandings`, `formatNetList`, `teamNameById`, `escapeHTML`,
  `myTeamInfo()` (You-row), `state.tournament*` — all existing.
- Produces: `buildPoolsSchedulePageHTML()` renders the tabbed page;
  `pdPoolFilter` values become `'A'|'B'|'C'|…|'seeding'` (default = first pool label);
  nav target for other pages: `data-tn-view="pools"` + optional
  `data-pools-tab="seeding"` attribute the handler honors.

- [ ] **Step 1: failing tests** — `test/pools-page.test.js`: with a fake `state`
  (2 pools A/B, 4 teams, matches incl. one live), assert `buildPoolsSchedulePageHTML()`
  contains: `pl-tab` for "Pool A", "Pool B", "Seeding"; the active tab class `pl-on`;
  the standings-lite header cells `W–L`/`Diff`; a `NET 1` hairline label; `LIVE` pill
  ONLY on the live game's row; `UP NEXT` on a scheduled row; NO `pd-card`, NO
  `pd-pool-chip`, NO "Now playing" cluster string. With `pdPoolFilter='seeding'`
  (export a setter or set via the module var pattern used by tests today — follow
  `pdTournamentView` test precedent), assert the seed table + pool badge chips render.
- [ ] **Step 2: run** `npx vitest run test/pools-page.test.js` — FAIL.
- [ ] **Step 3: implement.** Header: keep `.pd-pagehdr` structure, restyle CSS:
  `.pd-htitle { font: 700 22px/1.05 var(--font-display); }` (drop Sora here; desktop
  override ~3587 keeps a larger size). Rebuild the builder to the locked structure:

```html
<div class="pd-pagehdr">…back + eyebrow(name) + <div class="pd-htitle">Pools &amp; schedule</div></div>
<p class="pl-meta">Round {r} of {R} · {done} of {total} games final</p>
<div class="pl-tabs">
  <button class="pl-tab pl-on" data-pl-tab="A">Pool A</button>… 
  <button class="pl-tab" data-pl-tab="seeding">Seeding</button>
</div>
<!-- pool tab body -->
<div class="pl-sect">Pool A standings</div>
<div class="pl-colh"><span class="c1">#</span><span class="c2">Team</span><span class="c3">W–L</span><span class="c4">Diff</span></div>
<div class="pl-srow{ .pl-you when myTeamInfo teamId matches}"><span class="c1">1</span><span class="c2">Name<span class="pl-youtag">You</span></span><span class="c3">2–0</span><span class="c4 {n when negative}">+14</span></div>…
<div class="pl-sect">Games · Nets 1–3</div>
<div class="pl-net">NET 1</div>
<div class="pl-g"><span class="rd">R1</span><span class="gt"><b>Winner</b> <span class="def">def.</span> <span class="lose">Loser</span></span><span class="sc">15–12</span><span class="ftag">FINAL</span></div>
<div class="pl-g live"><span class="rd">R3</span><span class="gt">A <span class="vs">vs</span> B</span><span class="sc">12–9</span><span class="pill">LIVE</span></div>
<div class="pl-g"><span class="rd">R4</span><span class="gt up">A vs B</span><span class="ftag">UP NEXT</span></div>
<!-- seeding tab body -->
<div class="pl-sect">Overall seeding</div>
…same row grammar with .c1=Seed and a pool badge: <span class="pl-pl">A</span>
<p class="pl-foot">Seeded by win %, then point diff — this sets the bracket order.</p>
```

  Round meta derivation: round = max `queue_order` with any final +1 (cap at max);
  totals from pool-phase matches with both teams. Rows keep `tapname`/`data-team-peek`
  on team names inside GAMES rows (peek survives). Empty state: keep the honest
  `pd-empty`-equivalent line (`pl-empty`, same copy).
  CSS kit (mockup-exact, from `r1-pools/gen3.mjs`/`gen4.mjs`): tabs
  `flex;gap:7-8px; font:700 12-13px var(--font-display); caps; padding:9px;
  radius:11px; border:1.5px solid oklch(0.86 0.03 240); color:var(--accent);
  bg oklch(0.985 0.003 75 / .6)`, active `bg/border var(--accent), #fff`;
  `.pl-sect` = Barlow 700 13px caps `.14em` + `::after` hairline `var(--border)`;
  `.pl-net` = 11.5px Barlow accent + accent hairline `oklch(0.86 0.03 240)`;
  srow/colh column widths c1 20-34px · c2 flex · c3 34px right · c4 36px right,
  diff positive `var(--live-ink)` / negative+zero `var(--muted)`; `.pl-you` row =
  accent-soft wash + `pl-youtag` (existing pd-youtag values). `.pl-pl` badge =
  Barlow 700 10px, accent on `var(--accent-soft)`, 1px `oklch(0.86 0.03 240)`,
  radius 6px. Handler: replace the `data-pd-pool` delegate with `data-pl-tab`
  (same container-swap partial repaint; NO full render()).
  Desktop ≥1024: replace the pools column rules (~3600-3626) with a centered
  `max-width: 640px` column for `#tab-tournament .pl-*` (tabs stretch, tables
  breathe) — the tab structure replaces the multi-column reflow.
- [ ] **Step 4:** run the new test file + full `npx vitest run` — all green
  (fix any legacy test asserting the old cluster/chips strings).
- [ ] **Step 5:** grep-gate `pd-pool-chip|pd-pool-live|pd-pool-sechd` == 0 in app.js →
  delete their CSS blocks (~3168-3260 as applicable). Keep `pd-pool-game` etc. ONLY if
  still referenced (report counts).
- [ ] **Step 6:** bump `APP_VERSION` → `2026.07.10.19`; `node --check public/app.js`.
- [ ] **Step 7: commit** `feat(public): pools & schedule rebuilt to Mike's H pick - pool
  tabs + standings-lite + net-hairline games + seeding 4th tab - v2026.07.10.19`.

### Task 2: Standings page deletion + retargets (pick 2)

**Files:**
- Modify: `public/app.js` — delete `buildStandingsPageHTML` (9127) + `pdStandingsView`
  (~9060) + the `data-pd-standings-view` handler (10847); partial-repaint branch 1451
  (drop `'standings'`); saved-tab map 10759 (`standings: 'tournament'` stays as the
  bounce — verify it routes to the tournament tab, not a dead panel); hub row 5358
  (`data-nav-tab="standings"` → `data-tn-view="pools" data-pools-tab="seeding"`,
  label "Seeding", value = leader name unchanged); bracket seed chip 5469 (same
  retarget); Home top-3 link unchanged (routes to the tournament tab already);
  `#tab-standings` panel in the public shell (9268) removed.
- Modify: `public/styles.css` — delete `.pd-st/.pd-first/.pd-you(tag)/.pd-colh/.pd-rk/
  .pd-tm/.pd-rec/.pd-df` ONLY where orphaned (grep-gate; `pl-you*` replaced the You
  styling in Task 1); delete the ≥1024 `#tab-standings` clamp (~3629).
- Test: update any test referencing `buildStandingsPageHTML` / `#tab-standings`.

**Interfaces:**
- Consumes: Task 1's `data-pools-tab="seeding"` nav attribute.
- Produces: no public Standings page; `computeStandings/shapeStandingsByPool/
  computeSeeding` REMAIN (pools page + Home consume them).

- [ ] **Step 1:** failing check — grep `buildPoolsSchedulePageHTML` handler honors
  `data-pools-tab` (add a vitest asserting the hub HTML contains
  `data-tn-view="pools" data-pools-tab="seeding"`).
- [ ] **Step 2:** implement deletions + retargets. The `data-tn-view` delegate: when the
  tapped element has `data-pools-tab`, set `pdPoolFilter='seeding'` before the repaint.
- [ ] **Step 3:** grep-gates: `buildStandingsPageHTML|pdStandingsView|
  data-pd-standings-view|data-nav-tab="standings"|#tab-standings` all 0 in
  app.js/index.html (admin surfaces excluded — they don't use these).
- [ ] **Step 4:** full vitest green; `node --check`; bump → `2026.07.10.20`.
- [ ] **Step 5: commit** `feat(public): standings page folds into pools seeding tab
  (Mike pick K) - hub + bracket chip retargeted, page deleted - v2026.07.10.20`.

### Task 3: Bracket page M restyle (pick 3)

**Files:**
- Modify: `public/app.js` — `buildBracketPageHTML` (5423-5501): header keeps
  back/eyebrow/Barlow title; the status pill moves OUT of the header into ONE quiet
  status line under it; pre + completed states de-carded.
- Modify: `public/styles.css` — `pd-bk-*`: replace `.pd-bk-precard` (frosted pd-card)
  with flat `.pd-bk-pre` (no bg/border; icon tile stays accent-soft); statusline class.
- Test: `test/bracket-page.test.js` (new or extend existing bracket tests).

**Interfaces:**
- Consumes: `buildBracketHTML` read-only tree (UNTOUCHED — hard rules), `bracketOutcome`,
  `bracketStatusLine`, `computeTeamRecord`.
- Produces: same function signature; states: pre (flat), live (statusline + tree),
  completed (champions strip + gold champ game + tree + persist line — unchanged
  logic, de-carded chrome).

- [ ] **Step 1:** failing tests: live state HTML contains `pd-bk-statusline` with
  `Double elimination ·` and does NOT contain `pd-card`; pre state (registration)
  contains the honest copy and no `pd-card`; the seeding chip carries
  `data-tn-view="pools" data-pools-tab="seeding"` (from Task 2).
- [ ] **Step 2:** implement:

```html
<div class="pd-bk-statusline"><span class="pd-bk-sl-dot"></span><b>Live</b> · Double elimination · {round}</div>
```

  `.pd-bk-statusline{display:flex;align-items:center;gap:8px;font-size:12.5px;
  color:var(--muted);margin:0 0 8px} .pd-bk-statusline b{color:var(--live-ink);
  font-weight:600}` (dot = existing `.pd-bk-sl-dot`). Pre state: same inner elements
  (`pd-bk-preic/preh/pres/prog/chip`) inside a plain `<div class="pd-bk-pre">`
  (padding 8px 0). Completed: champions strip (`pd-bk-champbar`, gold — unchanged),
  tree, persist line; remove any `pd-card` wrapper.
- [ ] **Step 3:** vitest green; `node --check`; bump → `2026.07.10.21`.
- [ ] **Step 4: commit** `feat(public): bracket page tree-first (Mike pick M) - quiet
  status line, flat pre/completed states, tree untouched - v2026.07.10.21`.

### Task 4: My team Q rebuild (pick 4)

**Files:**
- Modify: `public/app.js` — `buildMyTeamPageHTML` (9066-9125) rebuilt; delete
  `pdMyTeamTab` (9064) + `data-pd-myteam-tab` handler (10863); partial branch 1451
  keeps `'myteam'`.
- Modify: `public/styles.css` — `mt-*` kit updated (drop the pd-card wrapper deps;
  hero/next/section styles per the locked mockup q.html in scratchpad r1-pools).
- Test: extend the existing my-team tests (grep `buildMyTeamPageHTML` in test/).

**Interfaces:**
- Consumes: `myTeamInfo()`, `computeTeamRecord`, `computeTeamRunTimeline`,
  `state.teamMembers`, `publicLiveTournament` — unchanged.
- Produces: same signature; single-scroll layout.

- [ ] **Step 1:** failing tests: output contains `mt-hero`, the record `2–0` inside
  `mt-rn`, section labels `Games` and `Roster` BOTH present in one render, NO
  `data-pd-myteam-tab`, NO `pd-card`; roster row shows the You pill on the claimed
  player; pips = one per known game (existing semantics).
- [ ] **Step 2:** implement per the locked structure (task-#9 history): centered
  `mt-hero` (eyebrow `tournament · Pool X · Seed N` → `mt-team` Barlow 26 →
  `mt-rn` Barlow 54 → `mt-pips`), hairline, `mt-next` strip (48px `--accent` NET tile:
  `.mt-nettile` restyled filled-blue w/ white text; label "UP NEXT — HAPPENING NOW"
  when `tl.next.isNow`, else "UP NEXT" + eta/games-ahead copy unchanged), then
  `pl-sect`-style GAMES rows (`W/L` letter `var(--live-ink)`/danger-muted + score bold
  + `vs opp` + right `Net n · R#` Barlow) then ROSTER rows (avatar initials chip
  accent-soft + name + blue YOU pill). Keep all empty/unclaimed states' copy,
  de-carded.
- [ ] **Step 3:** grep-gate `pdMyTeamTab|data-pd-myteam-tab|pd-seg` (pd-seg only if
  fully orphaned after Tasks 2+4 — report) → delete orphaned CSS.
- [ ] **Step 4:** vitest green; `node --check`; bump → `2026.07.10.22`.
- [ ] **Step 5: commit** `feat(public): my team single-scroll (Mike pick Q) - flat
  scoreboard + stacked games/roster, toggle retired - v2026.07.10.22`.

### Task 5: Check In X rebuild (pick 5)

**Files:**
- Modify: `public/app.js` — `publicCheckinHTML` (8953-8978): remove the hero block +
  `ckh-alts` (anon-only kiosk now); `checkinHeroInnerHTML` (8981) + its `ckh-card`
  refresh (11212) retire IF no other caller (grep-gate; `loadMyClaimedPlayer` and
  `state.myClaimedPlayer` STAY — My team/hub consume them); the checkin result-row
  renderer (`#checkin-results` population — find `checkin-results` writes) restyles
  rows to X.
- Modify: `public/styles.css` — `cik-*` restyle + new `ckx-*` result rows; delete
  `ckh-*` when orphaned (grep-gate).
- Test: extend check-in tests (grep `publicCheckinHTML` in test/).

**Interfaces:**
- Consumes: existing search/checkin handlers (`checkin-search` input events,
  `btn-checkin-new`) — ids unchanged so handlers keep working.
- Produces: same function signature; anon-only content.

- [ ] **Step 1:** failing tests: `publicCheckinHTML()` contains `cik-h` "Check in",
  the search input id `checkin-search`, `btn-checkin-new`; does NOT contain
  `ckh-card` even when `state.myClaimedPlayer` is set.
- [ ] **Step 2:** implement: centered Barlow title (`.cik-h { font-family:
  var(--font-display); }`), search box restyle (1.5px `oklch(0.86 0.03 240)` border,
  radius 12px, accent icon; keeps the iOS 16px input rule), result rows:

```html
<div class="ckx-row" data-…existing tap attrs…>
  <span class="ckx-nm"><b>{typed prefix}</b>{rest}</span>
  <span class="ckx-go">TAP TO CHECK IN</span>
</div>
<div class="ckx-row is-in">…<span class="ckx-go">ALREADY IN</span></div>
```

  `.ckx-row{display:flex;align-items:center;gap:12px;padding:14px 12px;border:1.5px
  solid oklch(0.86 0.03 240);border-radius:12px;margin-bottom:8px;
  bg oklch(0.985 0.003 75 / .7)} .ckx-nm{flex:1;font-size:17px;font-weight:600}
  .ckx-nm b{color:var(--accent)} .ckx-go{font:700 12px var(--font-display);
  letter-spacing:.06em;color:var(--accent)} .is-in{opacity:.55}
  .is-in .ckx-go{color:var(--live-ink)}` — NO initials/avatar bubbles (Mike's delta).
  Prefix-bold uses the existing escaped match logic — escape FIRST, then wrap the
  matched prefix (never wrap before escaping). "I'm new — add me" → dashed accent
  border restyle of `.cik-new`. Disambiguation rows (same-name) keep their existing
  fields minus any skill data (already absent) and adopt the same row style.
- [ ] **Step 3:** grep-gates: `ckh-` count in app.js == 0 → delete `ckh-*` CSS
  (2188-2205); `.cik-admin/.cik-adminpanel` dead CSS (noted session 8) deleted too
  (kiosk has its own markup — verify checkin.html doesn't reference these class names;
  if it does, leave them and say so in the commit).
- [ ] **Step 4:** vitest green; `node --check`; bump → `2026.07.10.23`.
- [ ] **Step 5: commit** `feat(public): check-in tab anon-first kiosk (Mike pick X, no
  bubbles) - hero retired on this tab, big tap rows - v2026.07.10.23`.

### Task 6: History Z one-list (pick 6)

**Files:**
- Modify: `public/app.js` — the History page builder (search `History & records` at
  9210 and its tab structure): tabs (Tournaments/Leaderboard/Champions) die; one
  year-grouped list; title becomes "Past tournaments"; `pdPageHeaderHTML('Past
  tournaments')`.
- Modify: `public/styles.css` — new `ht-*` row kit; delete orphaned history-tab CSS.
- Test: extend history tests.

**Interfaces:**
- Consumes: `loadTournamentHistory()` cache (`state.tournamentHistory`),
  `pdFormatMonthYear`, `computeChampion` results already shaped by the loader.
- Produces: rows tap into the existing per-tournament results path (keep the current
  `data-` attrs the old Tournaments tab rows used — grep them and reuse).

- [ ] **Step 1:** failing tests: builder output contains "Past tournaments", a `ht-year`
  label "2026", a row with "June 2026" + "No champion recorded", and does NOT contain
  the Leaderboard/Champions tab strings.
- [ ] **Step 2:** implement: `.ht-year` = `pl-sect` grammar; `.ht-row` = 38px accent-soft
  trophy icon tile + name (600 15px) + sub 12px muted (`{teams} teams ·
  {champion ? 'Champions — '+name : 'No champion recorded'}`) + chevron; group rows by
  `new Date(completed_at||created_at).getFullYear()` descending, rows newest-first.
  Loading state: existing lazy-load line, restyled flat; empty state honest copy
  ("No tournaments finished yet — the first one lands here.").
- [ ] **Step 3:** vitest green; `node --check`; bump → `2026.07.10.24`.
- [ ] **Step 4: commit** `feat(public): past tournaments one-list (Mike pick Z) - tabs
  retired, year-grouped rows - v2026.07.10.24`.

### Task 7: Sign-in + claim AD+AC hybrid (pick 7)

**Files:**
- Modify: `public/app.js` — `renderAuthPageInner` (8545-8600): reorder to brand-block-
  top + form-below; field markup swaps boxed inputs for hairline-underline fields;
  `openClaimPage` (8624+): the claim page's inputs/CTA adopt the same field grammar
  (structure/states unchanged).
- Modify: `public/styles.css` — `auth-*` restyle (logo ~110px, Barlow wordmark, field
  underline styles reusing the rf-* values: `border-bottom:1.5px solid
  oklch(0.86 0.03 240)`, label caps 11px muted, 16px min font-size iOS guard KEPT).
- Test: none automated beyond vitest green (overlay is DOM-built; §27 browser pass
  covers it) — but grep-gate that ids `auth-email/auth-pass/auth-submit/auth-alt/
  auth-admin/admin-code/admin-login-form` all survive (handlers bind by id).

- [ ] **Step 1:** implement CSS+markup swap; ALL element ids unchanged.
- [ ] **Step 2:** manual browser check on localhost:8123 — sign-in opens from the
  avatar, create-account toggle works, admin panel reveals, claim page fields match;
  console clean.
- [ ] **Step 3:** vitest green; `node --check`; bump → `2026.07.10.25`.
- [ ] **Step 4: commit** `feat(public): sign-in + claim restyle (Mike AD+AC hybrid) -
  big brand block + hairline fields, mechanics untouched - v2026.07.10.25`.

### Task 8: Dead-code deletion (register legacy) + final sweep

**Files:**
- Modify: `public/app.js` — delete `buildPublicRegisterHTML` (5169-5206) and the
  ENTIRE `if (!state.isAdmin) {…}` branch inside `buildTournamentTabHTML`
  (6082-~6105+, through its last public-only return): both call sites
  (`buildPublicTournamentRootHTML:5394`, admin shell :9888) are admin-context, so the
  branch is unreachable (session-9 recon, task-#1 history). Add a one-line comment
  in `buildTournamentTabHTML`: admin-only by both call sites.
- Modify: `public/styles.css` — delete `reg-*` rules ONLY where grep-gated orphaned
  (`reg-` classes may be shared with the live `buildRegisterPageHTML` — CHECK; the
  new page uses `rf-*`, but verify `reg-screen/reg-card/reg-input/reg-remind/reg-pay/
  reg-venmo/reg-check/reg-primary/reg-teamspill/reg-regrow/reg-paidtag/reg-regchev/
  reg-label/reg-h1/reg-sub` counts individually).
- Test: delete/adjust any test asserting the legacy register screen.

- [ ] **Step 1:** grep-gates BEFORE deleting: `buildPublicRegisterHTML` == 1 definition
  + 1 call (the dead branch); each reg-* class counted; paste counts in the commit.
- [ ] **Step 2:** delete; full vitest green; `node --check`; bump → `2026.07.10.26`.
- [ ] **Step 3: commit** `chore(public): legacy register screen deleted - dead
  !isAdmin branch in buildTournamentTabHTML unreachable (both call sites admin) -
  v2026.07.10.26`.

---

## Verification gate (controller, after each push + at the end — task #5 in-chat)

§27 on prod per page at 390px AND ≥1024 (restore 1920×1080 after): 9 questions +
one rendered value cross-checked vs the DB via the anon client (e.g. pools tab team
W–L vs matches; seeding order vs computeSeeding of real rows). The anon register
flow (Home → Register → form) MUST be re-smoked after every slice that touches
`buildPublicTournamentRootHTML` routing (launch-night lesson). Console clean.
Version pill == pushed version.

## Self-review notes
- Spec coverage: picks 1-7 → Tasks 1-7; dead-code item → Task 8; retargets (hub row,
  bracket chip, saved-tab bounce) → Tasks 2-3. Home/gate/hub/rules/register pages
  untouched (already on the system).
- Type consistency: `pdPoolFilter` gains `'seeding'`; `data-pl-tab` (Task 1) is what
  Task 2's retargets set via `data-pools-tab` → the delegate maps it; all other
  signatures unchanged.
- No placeholders: every task carries exact anchors, class values, and copy.
