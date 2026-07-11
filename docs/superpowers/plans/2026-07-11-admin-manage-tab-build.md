# Admin Manage Tab — Implementation Plan (session-10 locked picks)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax. Every builder's FIRST action: invoke
> `lasolas-skill` (§29). Builders commit; the CONTROLLER reviews + pushes (§21).
> Builders never touch the connected browser.

**Goal:** Build Mike's locked Manage tab (spec `2026-07-11-admin-manage-tab-design.md`,
`4a7d964` + the §6 Co-pilot resolution) inside the public shell, then retire the code
logins + lock RLS + delete the old admin shell.

**Architecture:** Vanilla-JS string builders in `public/app.js` + `public/styles.css`,
pure logic in `public/pure.js` (TDD, vitest). Admin = public shell + a 4th nav tab
(`isAdmin`-gated). DB via `db/migrations/` (on-disk numbering continues at **0046**)
applied through the authed Supabase MCP by the controller. Each task = one shippable
slice: version bump, vitest green, `node --check`, own commit.

**Tech stack:** vanilla JS, vitest (`npx vitest run`, 337 green at baseline `4a7d964`),
Supabase (anon reads + RPCs), Vercel auto-deploy on push.

## Global constraints (every task)

- Locked system: stone bg, **Barlow Semi Condensed** via `var(--font-display)`, muted
  blue `var(--accent)` (§51 matte, no neon/glow), flat on stone (NO pd-card), hairline
  `pl-sect`-grammar section labels, rf-* hairline-underline fields, SVG only, plain
  English, never "night/tonight", labeled tags never bare dots, iOS 16px input guard.
- **Skill ratings render ONLY on admin surfaces** (Manage Players/edit sheet), never
  public. §41: desktop ≥1024 (top strip + centered ~720px `#tab-manage` column) ships
  in the SAME slice as mobile.
- Bump `APP_VERSION` (`public/app.js:30`, format `2026.07.11.N`, N from 1) EVERY
  slice; `node --check public/app.js`; full `npx vitest run` green before commit.
- The §38 marker: controller runs `ui38-mark.mjs --decision=3-options-shown
  --reason="build slice N under Mike's session-10 picks (task-#9 history)"` before
  each builder edits UI files.
- New CSS namespaced per-kit as specified; superseded CSS deleted in the SAME slice
  behind grep-gates (`grep -c "class" public/*.{js,html}` == 0 first; counts in the
  commit body).
- Anchors below come from the recon map (`2026-07-11-admin-phase-recon-map.md`) at
  v2026.07.10.26 — **re-grep every anchor before editing** (earlier slices shift lines).
- The LIVE anon register flow (`buildRegisterPageHTML`, rf-*) and the public pages
  stay untouched unless a task names them. Anon register re-smoke (Home → Register →
  form) after every slice that touches nav/routing/auth (controller).
- Migrations: file in `db/migrations/`, applied by the CONTROLLER via Supabase MCP,
  integration-checked on throwaway fixtures, baseline verified after (233 players /
  18 June teams intact).

## Old-shell transition rule (Tasks 1-12)

From Task 1, admins land on the PUBLIC shell + Manage. The old admin shell code stays
in the tree, reachable ONLY via a quiet `Open the old admin` row at the bottom of the
Manage lead (temporary — deleted in Task 14). Never delete old-shell code before Task
14 except where a task explicitly says so (Task 4's courts board).

---

### Task 1: Manage shell — 4th nav tab + lead page (pick R1)

**Files:**
- Modify: `public/app.js` — `buildPublicNavInnerHTML` (~9160s; the nav builder with
  `checkinNavVisible()`), `renderPublicShell` panels block (~9198: add `#tab-manage`),
  the boot/render branch that routes `state.isAdmin` to `renderAdminShell` (~9985:
  `state.isAdmin ? renderAdminShell(...) : renderPublicShell()` — admins now get
  renderPublicShell; keep renderAdminShell reachable via the temporary row's handler
  `renderOldAdminShell()` wrapper), `activateMainTab` + saved-tab map (add 'manage',
  bounce non-admins to 'home'), partialRender branch ~1450 (add 'manage').
- Create in app.js: `buildManagePageHTML()`, `manageNeedsYou()` (thin: calls the pure
  model with state), delegated `data-mg-area` click handler (container-swap partial
  repaint like `data-tn-view` — NO full render()).
- Modify: `public/pure.js` — new pure `manageNeedsYouModel(t, teams, pickupDays)`.
- Modify: `public/styles.css` — new `mg-*` kit + `#tab-manage` desktop clamp in the
  ≥1024 block (~3555: `body.pd-public-active #tab-manage > .container { max-width:
  720px; }`).
- Test: `test/manage-page.test.js` (new, vm-sandbox harness — copy the pattern from
  `test/myteam-page.test.js`).

**Interfaces:**
- Consumes: `state.isAdmin` (deriveRole path), `publicLiveTournament()`,
  `state.tournamentTeams`, `escapeHTML`, `pdPageHeaderHTML`.
- Produces: `buildManagePageHTML()`; nav emits `data-nav-tab="manage"` (trophy-strip
  icon: the sliders SVG `M4 21v-7 / M4 10V3 / M12 21v-9 / M12 8V3 / M20 21v-5 /
  M20 12V3 / M1 14h6 / M9 8h6 / M17 16h6`); pure
  `manageNeedsYouModel(t, teams, pickupDays) -> [{id:'venmo'|'unpaid'|'noday',
  title, sub, area}]`; `data-mg-area` values: `'tournament'|'pickup'|'players'|
  'teams'|'admins'` + module var `manageView` ('lead'|area) surviving partialRender.

- [ ] **Step 1: failing tests** — `manageNeedsYouModel`: reg open + no venmo_link →
  a `venmo` item; teams with `paid=false` → `unpaid` item titled "N teams haven't
  paid"; no upcoming pickup day → `noday` item; all satisfied → `[]`.
  `buildManagePageHTML()`: contains `class="mg-h1">Manage<`, `NEEDS YOU` only when
  items exist, `EVERYTHING` rows with `data-mg-area="tournament"` … `"admins"`, each
  with a one-line status sub (e.g. `July 2026 · Registration open · 5 teams in`), NO
  `pd-card`. Non-admin: `buildPublicNavInnerHTML()` does NOT contain
  `data-nav-tab="manage"`; admin state: it does.
- [ ] **Step 2:** run new tests — FAIL.
- [ ] **Step 3: implement.** Lead structure (mockup a.html, r10-manage):

```html
<div class="mg-h1">Manage</div>
<div class="pl-sect">Needs you</div>
<a class="mg-row" data-mg-area="{item.area}">
  <div class="mg-rb"><div class="mg-rn">{title}</div><div class="mg-rs">{sub}</div></div>
  <svg class="mg-chev">…chevron…</svg>
</a>
<div class="pl-sect">Everything</div>
… five area rows, same grammar …
<button class="mg-oldlink" data-mg-old>Open the old admin</button>
```

  CSS: `.mg-h1{font:700 22px/1.05 var(--font-display)} .mg-row{display:flex;
  align-items:center;gap:12px;padding:12px 2px;border-top:1px solid var(--border)}
  .pl-sect+.mg-row{border-top:none} .mg-rn{font-size:15px;font-weight:600}
  .mg-rs{font-size:12.5px;color:var(--muted);margin-top:2px}
  .mg-chev{width:16px;height:16px;color:var(--faint);flex:none}
  .mg-oldlink{display:block;width:100%;margin-top:26px;background:none;border:none;
  color:var(--faint);font-size:12.5px;text-align:center}` (temporary, dies Task 14).
  `data-mg-old` handler → `renderAdminShell` path exactly as the old boot branch did.
  Non-admin taps/deep-links to 'manage' bounce to 'home' (saved-tab + activateMainTab).
- [ ] **Step 4:** full vitest green; `node --check`; bump → `2026.07.11.1`.
- [ ] **Step 5: commit** `feat(admin): Manage tab shell - 4th nav item + needs-you
  lead, admins now on the public shell (old admin behind a temporary link) -
  v2026.07.11.1`.

### Task 2: Pickup days — multi-day schema + list/form (pick R3 hybrid)

**Files:**
- Create: `db/migrations/0046_pickup_days.sql`.
- Modify: `public/app.js` — new `buildPickupDaysHTML()` (list) +
  `buildPickupDayFormHTML(day)` (form) rendered inside `#tab-manage` via
  `manageView='pickup'|'pickup-form'`; `saveSession`/`clearSession` (~7458/7480)
  re-pointed at the new table (multi-row); `sessionIsToday`/`sessionIsUpcoming`
  consumers (grep both in app.js + pure.js) now evaluate against the SET of days
  (`pickupDays.some(...)`); QR modal reuse (`openQrModal` ~10790); the
  `start_new_session` flow row (master-admin gate REMOVED — all 4 admins per spec §1).
- Modify: `public/pure.js` — `sessionIsToday(days, today)` reworked to accept an
  array (keep a same-name wrapper so checkin.html's mirror comment stays true —
  verify checkin.html:324's inline logic separately and leave the kiosk untouched).
- Test: extend `test/manage-page.test.js` + the existing sessionIsToday tests
  (`grep sessionIsToday test/`).

**Interfaces:**
- Consumes: Task 1's `manageView` routing + `mg-*` kit.
- Produces: `state.pickupDays` (array, loaded with the boot sync + 15s poll),
  `buildPickupDaysHTML()`, rows `data-pk-day="<id>"`, dashed `data-pk-add`.

- [ ] **Step 1: migration 0046** — `create table if not exists pickup_days (id
  uuid primary key default gen_random_uuid(), day date not null, time_label text,
  location text, community_id uuid default '2c3bcfa9-305e-448b-924b-da90c029f575',
  created_at timestamptz default now());` + RLS: anon SELECT (the public day-of gate
  reads it), writes via the blanket authenticated policy until Task 13 locks it.
  Backfill: insert the current `sessions` id=1 row if one exists. (`sessions` table
  STAYS until Task 14's sweep — read-path flips now.)
- [ ] **Step 2: failing tests** — list: rows sorted soonest-first, weekday tag (THU),
  `NEXT UP` live-ink tag on the soonest only, dashed `Add a pickup day`; form:
  DATE/TIME/LOCATION rf-grammar fields + `Save` + the note "The Check In tab appears
  for everyone that day" + ON THE DAY rows (Share the check-in QR · Start a fresh
  sheet) + red `Remove this pickup day`; pure: `sessionIsToday([{day:today}], today)`
  true, empty set false; Home CTA + nav gate flip on the day-of.
- [ ] **Step 3:** implement (structure = mockups p-h1/p-h2). Empty list state:
  "No pickup days scheduled — add one to open Check In." Multi-day = each day gates
  its own date only.
- [ ] **Step 4:** controller applies 0046 via MCP + throwaway integration check;
  vitest green; `node --check`; bump → `2026.07.11.2`.
- [ ] **Step 5: commit** `feat(admin): pickup days - multi-day schema (0046) + list
  and form-first editing (Mike R3 hybrid) - v2026.07.11.2`.

### Task 3: Players directory (pick R4)

**Files:**
- Modify: `public/app.js` — new `buildManagePlayersHTML()` (`manageView='players'`):
  header + `Select` toggle, search input (reuses the kiosk search grammar,
  id `mg-player-search`), meta line, A–Z list with letter anchors; tap row → the
  EXISTING `openPlayerEditPopup` (~113 — skill @132 stays admin-only); bulk mode =
  checkboxes + a bottom action bar (bulk check-in/out via the existing per-id
  `check_in`/`check_out` RPC loop ~12111 pattern; bulk group via
  `updatePlayerFieldsSupabase` ~7547); group manager reached from the meta line's
  group count (reuses `ensureGroupCatalogEntrySupabase`/rename/delete ~7592-7700).
- Modify: `public/styles.css` — `mgp-*` rows kit (name 15/600, letter anchor Barlow
  800 12px faint, `IN` tag `font:700 10.5px var(--font-display);color:var(--live-ink)`,
  skill right-aligned `font:800 14px var(--font-display);color:var(--accent)`).
- Test: extend `test/manage-page.test.js`.

**Interfaces:**
- Consumes: `state.players`, `state.checkedIn`, `playerIdentityKey`,
  `openPlayerEditPopup`, the RPC helpers above.
- Produces: `buildManagePlayersHTML()`; rows `data-mgp-id`; search filter =
  case-insensitive substring (same as kiosk), NO initials bubbles anywhere.

- [ ] **Step 1: failing tests** — output contains `Search or add a player`, the meta
  counts (`233` from fixture), letter anchors render once per letter, checked-in row
  carries `>IN<` and never a bare dot, skill values render (admin surface), no
  `ckx-`/`pd-card` classes.
- [ ] **Step 2:** implement per mockup l-b; Select mode toggles `.mgp-sel` checkboxes
  + the action bar (Check in · Check out · Move to group · Cancel).
- [ ] **Step 3:** vitest green; `node --check`; bump → `2026.07.11.3`.
- [ ] **Step 4: commit** `feat(admin): players one-directory (Mike R4-B) - search +
  select bulk + edit sheet reuse, skills admin-only - v2026.07.11.3`.

### Task 4: Teams page + courts board deletion (pick R5 trimmed)

**Files:**
- Modify: `public/app.js` — new `buildManageTeamsHTML()` (`manageView='teams'`):
  size chips (2s/3s/4s/6s), `Generate balanced teams` (reuses
  `generateBalancedGroups` ~11241 path), `TODAY'S TEAMS` stacked-name lists, tap a
  name → swap sheet (pick the other team). **DELETE the courts/live-nets board:**
  the courts tab renderer + `report result`/`clear result` handlers (~11296/11350)
  + court advancement + the ±0.1 skill-delta writes + `saveLiveStateToSupabase`'s
  court payload (~6915 — keep TEAM persistence: strip courts from the payload,
  keep teams; grep `live_state` consumers). Old admin shell references to the courts
  panel: leave dormant (they die in Task 14) — delete only shared/public-reachable
  courts code paths + the handlers named above.
- Modify: `public/styles.css` — `mgt-*` kit (chips = the pl-tab grammar; team label
  Barlow 800 12px muted; stacked names 14.5px with faint hairlines between).
- Test: extend `test/manage-page.test.js`; fix any test asserting report-result.

**Interfaces:**
- Consumes: `state.checkedIn`, `generateBalancedGroups`, `state.teams` (casual).
- Produces: `buildManageTeamsHTML()`; team persistence unchanged shape minus courts.

- [ ] **Step 1: failing tests** — chips render with `4s` active default; the teams
  section labeled `Today's teams` (NEVER "tonight"); names stacked one per line;
  no `REPORT`/net-card strings; generate from N checked-in.
- [ ] **Step 2:** implement per mockup k-h1 (stacked delta included).
- [ ] **Step 3:** grep-gates: the deleted handler/class names == 0 outside the
  dormant old-shell block; report counts.
- [ ] **Step 4:** vitest green; `node --check`; bump → `2026.07.11.4`.
- [ ] **Step 5: commit** `feat(admin): teams page (Mike R5 trimmed) - chips +
  generate + stacked teams; casual courts board deleted, skills manual-only -
  v2026.07.11.4`.

### Task 5: Tournament sub-hub + Registration (picks R2 + R7)

**Files:**
- Create: `db/migrations/0047_tournament_announcement.sql` — `alter table tournaments
  add column if not exists announcement text;`.
- Modify: `public/app.js` — `buildManageTournamentHTML()` (`manageView='tournament'`):
  page header (tournament name) + stage sub-line + the seven rows (Registration ·
  Teams & payment · Pools & schedule · Bracket & scores · Event settings · Rules
  sheet · Close out), `data-mgt-view` delegate; `buildMgRegistrationHTML()`:
  THE ANNOUNCEMENT editable textarea (persists via `tdbSetTournamentFields` ~3504
  gaining `announcement`) + `Copy for GroupMe` (navigator.clipboard) + CONTROLS
  (open/close switch → the existing `tv2-toggle-registration` write path ~10304;
  venmo/buy-in/team-size fields row → `tdbSetTournamentFields`).
- Modify: `public/styles.css` — switch component `.mg-sw` (44×26 pill, live green
  when on — the mockup t-c grammar), announcement box (1.5px muted-blue border,
  radius 12).
- Test: extend `test/manage-page.test.js`.

**Interfaces:**
- Consumes: Task 1 routing; `tdbSetTournamentFields(fields)` (signature unchanged,
  now accepts `announcement`).
- Produces: `data-mgt-view` values `'registration'|'teams'|'pools'|'bracket'|
  'settings'|'rules'|'closeout'` — Tasks 6-10 render into them. Default announcement
  when column null: composed from name/buy_in/team_size ("<name> — registration is
  open! <buy_in>, <team_size>s co-ed. Register at athletic-specimen.com").

- [ ] **Step 1:** failing tests — hub contains all 7 rows + stage sub-line;
  Registration view contains the textarea with the default composition when
  `announcement` null, the switch reflecting `registration_open`, venmo field.
- [ ] **Step 2:** implement (mockups t-b + r-b); controller applies 0047.
- [ ] **Step 3:** vitest green; `node --check`; bump → `2026.07.11.5`.
- [ ] **Step 4: commit** `feat(admin): tournament sub-hub + registration page -
  editable persisted announcement (0047) + controls (Mike R2/R7) - v2026.07.11.5`.

### Task 6: Teams & payment + full-edit popup (pick R8)

**Files:**
- Modify: `public/app.js` — `buildMgTeamsHTML()` (list per mockup tp-a: name +
  roster preview + PAID/TAP WHEN PAID tag + chevron + dashed `Add a team yourself`
  → `tdbAddTeam` ~3468) + `openMgTeamSheet(teamId)`: a body-level sheet (the
  register join-sheet pattern — body-level = poll-clobber-immune) with stacked
  editable roster (`tdbSetTeamRoster` ~3530), rename (`tdbRenameTeam` ~3519), paid
  toggle (`tdbSetTeamPaid` ~3511), move-to-pool when pools exist
  (`tdbMoveTeamToPool` ~3586), withdraw mid-play (`tdbWithdrawTeam` ~3543 — sheet
  copy states plainly: "forfeits their remaining games"), remove
  (`tdbDeleteTeam` ~3562, type-DELETE confirm).
- Test: extend `test/manage-page.test.js` (list states: 0 teams honest empty copy;
  paid/unpaid tags; preview line).

**Interfaces:**
- Consumes: the tdb* helpers above (signatures unchanged).
- Produces: `openMgTeamSheet(teamId)` — Task 7's pool view reuses it for team taps.

- [ ] **Step 1:** failing tests → **Step 2:** implement → **Step 3:** vitest green;
  `node --check`; bump → `2026.07.11.6`.
- [ ] **Step 4: commit** `feat(admin): teams & payment list + full-edit team sheet
  (Mike R8) - v2026.07.11.6`.

### Task 7: Pools & schedule admin — score on the schedule (pick R9)

**Files:**
- Create: `db/migrations/0048_atomic_pool_ops.sql` — `draw_pools_atomic(tournament_id,
  pool_count)` + `start_pool_play_atomic(tournament_id)` SECURITY DEFINER RPCs
  wrapping today's client sequences (`tdbDrawPools` ~3601 delete+insert+update;
  `tdbStartPoolPlay` ~3647 delete+insert+status) in single transactions; EXECUTE to
  authenticated only; in-body `is_organizer` guard.
- Modify: `public/app.js` — `buildMgPoolsHTML()`: REUSE `buildPoolsSchedulePageHTML`'s
  shaped data (grep ~5849) rendered with admin verbs: `SCORE` outline button on
  unscored rows → score sheet (`tdbSubmitResult` ~3707 → submit_match_score), live
  rows tap-to-update (`tdbSetLiveScore` ~3725), finals `EDIT` (`tdbEditMatchScore`
  ~3739); pre-draw state = pools count + nets + format preset fields + `Draw pools &
  build the schedule` → the new RPC; POOL CONTROLS row → move teams
  (`tdbMoveTeamToPool`) / edit nets (`tdbSetPoolNets` ~3766) / reset pools
  (type-name unlock, `tv2-reset-pools` ~10477 path).
- Test: extend `test/manage-page.test.js` (SCORE on unscored only, LIVE pill rows
  tappable, EDIT on finals, pre-draw state fields).

**Interfaces:**
- Consumes: Task 6's `openMgTeamSheet`; the score sheet component (shared with Task
  8 — name it `openMgScoreSheet(matchId)`; steppers + `Final — <team> wins` +
  quiet `Just update the live score`).
- Produces: `openMgScoreSheet(matchId)` (Task 8 reuses); `draw_pools_atomic` /
  `start_pool_play_atomic` (Task 13 relies on them being DEFINER).

- [ ] **Step 1:** migration file + failing tests → **Step 2:** implement →
  **Step 3:** controller applies 0048 + integration check (draw on a throwaway
  tournament; baseline intact) → **Step 4:** vitest green; `node --check`; bump →
  `2026.07.11.7`.
- [ ] **Step 5: commit** `feat(admin): pools admin - score on the schedule (Mike R9)
  + atomic draw/start RPCs (0048) - v2026.07.11.7`.

### Task 8: Bracket admin — by-round rows + editor (pick R10-C)

**Files:**
- Create: `db/migrations/0049_seed_override.sql` — `alter table tournaments add
  column if not exists seed_override jsonb;` (persisted with Generate; replaces the
  transient `state.seedOverride`).
- Modify: `public/app.js` — `buildMgBracketHTML()`: live state = compact rows grouped
  by round (Winners R2 · Losers R1 · finals; matchup + net/meta sub + green live
  score / final score / UP NEXT tag), tap ANY game → `openMgScoreSheet` (Task 7);
  pre-bracket = seeding rows with ▲/▼ (the existing seed-override component
  ~`tdbGenerateBracket` 3837 flow) + `Generate the bracket` (persists the override
  into 0049's column, passes it to `generate_bracket_atomic`); `Reset the bracket`
  row (type-name unlock → `tdbResetBracket` ~3831 + `clear_bracket_atomic` where
  applicable). Public read-only tree link row ("Full bracket tree — the players'
  view") → the public bracket page.
- Test: extend `test/manage-page.test.js` (grouping order, multiple LIVE rows at
  once, UP NEXT tag, seeding pre-state).

- [ ] **Step 1:** migration + failing tests → **Step 2:** implement (mockups
  bk2-c + bk2-e) → **Step 3:** controller applies 0049 → **Step 4:** vitest green;
  `node --check`; bump → `2026.07.11.8`.
- [ ] **Step 5: commit** `feat(admin): bracket admin - by-round tap-to-score rows +
  editor sheet + persisted seed override (0049) (Mike R10) - v2026.07.11.8`.

### Task 9: Event settings + Rules editor (picks R11 + R11b)

**Files:**
- Modify: `public/app.js` — `buildMgSettingsHTML()`: ALL knobs flat, rf-grammar,
  two-across where short (name / team size+nets / pool to+cap / bracket to+cap /
  win-by-2+grand-final-reset / buy-in), every field saves through
  `tdbSetTournamentFields` on change (no guard rails — Mike declined; the
  DESTRUCTIVE redraw/reset unlocks live in Tasks 7-8, not here). Retire the
  duplicate settings modal `openTournamentSettingsModal` (~4587) IF grep shows its
  only opener was the old shell (report; else leave for Task 14).
  `buildMgRulesHTML()`: one editable sheet prefilled from `tournaments.rules`,
  `Save — players see it right away` → `tdbSetTournamentFields({rules})`, hint line
  "## makes a heading · - makes a bullet".
- Test: extend `test/manage-page.test.js` (all knobs present + editable; rules
  textarea prefilled; hint line).

- [ ] **Step 1:** failing tests → **Step 2:** implement (mockups es-b + ru-d) →
  **Step 3:** vitest green; `node --check`; bump → `2026.07.11.9`.
- [ ] **Step 4: commit** `feat(admin): event settings all-knobs-flat + rules sheet
  editor (Mike R11) - v2026.07.11.9`.

### Task 10: Close out — champion + end/reopen (pick R12)

**Files:**
- Create: `db/migrations/0050_closeout.sql` — `alter table tournaments add column if
  not exists champion_team_id uuid references teams(id) on delete set null;` +
  `close_tournament(tournament_id, champion_team_id)` / `reopen_tournament(
  tournament_id)` SECURITY DEFINER RPCs (is_organizer-guarded; close sets
  status='completed' + champion + registration_open=false; reopen restores
  status='bracket' and clears nothing else).
- Modify: `public/app.js` — `buildMgCloseoutHTML()`: matte-gold champion card
  (`FROM THE BRACKET` + `computeChampion` suggestion + CHANGE → team picker sheet)
  + `End the tournament` CTA + honest note; ended state shows `Reopen` row.
  History/loader: prefer the STORED champion over computed (grep
  `loadTournamentHistory` + `computeChampion` consumers ~recon anchors; public
  History rows show `Champions — <name>` from the stored value when set).
- Test: extend `test/manage-page.test.js` + history tests (stored champion wins
  over computed; "No champion recorded" only when both absent).

- [ ] **Step 1:** migration + failing tests → **Step 2:** implement (mockup co-a) →
  **Step 3:** controller applies 0050 + integration check → **Step 4:** vitest
  green; `node --check`; bump → `2026.07.11.10`.
- [ ] **Step 5: commit** `feat(admin): deliberate close-out - stored champion +
  end/reopen RPCs (0050) (Mike R12, the June fix) - v2026.07.11.10`.

### Task 11: Admins page — seats + activity log (pick R6)

**Files:**
- Create: `db/migrations/0051_admin_seats_and_log.sql` — `set_member_role(target_email
  text, new_role community_role)` SECURITY DEFINER, in-body `is_owner` guard
  (owner-only promote/demote; resolves email → profile → upsert membership) +
  `read_action_log(limit_n int default 50)` SECURITY DEFINER, `is_organizer` guard,
  returning (at, actor_label, summary) from `action_log` newest-first.
- Modify: `public/app.js` — `buildMgAdminsHTML()`: 4 seat rows (Mike OWNER filled
  pill; empty seats "Waiting — they create an account, you flip it on" + OFF outline
  pill; tap a waiting seat → email field + `Make them an admin` → set_member_role),
  `Activity log` row → `buildMgLogHTML()` (day-grouped rows: time Barlow faint ·
  "<b>who</b> did what"; from read_action_log).
- Test: extend `test/manage-page.test.js` (seat states, OWNER pill, log rows shape).

- [ ] **Step 1:** migration + failing tests → **Step 2:** implement (mockups m-c +
  m-b's log grammar) → **Step 3:** controller applies 0051 (verify: anon EXECUTE
  denied on both fns; owner path works via Mike's session) → **Step 4:** vitest
  green; `node --check`; bump → `2026.07.11.11`.
- [ ] **Step 5: commit** `feat(admin): admins seats + owner promote RPC + activity
  log read (0051) (Mike R6) - v2026.07.11.11`.

### Task 12: Co-pilot bubble + chat-on-stone (Mike's §6 design)

**Files:**
- Modify: `public/app.js` — floating bubble: a small round button above the bottom
  nav (right-aligned, admin-only, hidden on the chat itself), tap → the co-pilot
  chat as a full view on the stone bg + watermark (NO panel chrome): reuse the
  existing `adminCopilotHTML` (~9251) message flow restyled — user bubbles accent-
  soft right, assistant bubbles bg-white left, input bar above the nav; the
  copilot's confirm-gated write tools untouched (`COPILOT_TOOLS` ~9385).
- Modify: `supabase/functions/copilot/index.ts` (~48-60) — gate re-home:
  `app_metadata.admin === true` → verify the caller's JWT + `caller_role(community)
  in ('owner','organizer')` via a service-role lookup. Controller deploys the edge
  function + verifies a REAL account passes and anon/player 401s.
- Modify: `public/styles.css` — `.cop-fab` (46px round, bg `var(--accent)`, white
  sparkle SVG, `bottom: calc(84px + env(safe-area-inset-bottom))`, right 18px,
  §51 shadow soft not glow) + chat bubble kit restyle.
- Test: extend `test/manage-page.test.js` (bubble markup admin-only).

- [ ] **Step 1:** failing tests → **Step 2:** implement → **Step 3:** edge fn
  deploy + gate verify (controller) → **Step 4:** vitest green; `node --check`;
  bump → `2026.07.11.12`.
- [ ] **Step 5: commit** `feat(admin): co-pilot floating bubble + chat-on-stone
  restyle + role-gated edge fn (Mike's design) - v2026.07.11.12`.

### Task 13: Codes retirement + RLS lock (GATED — controller-led, Opus assists)

**HARD GATE before ANY step:** Mike has signed into prod on his phone and driven
every Manage screen against the real July tournament (controller confirms via
AskUserQuestion). STOP if not.

**Files:**
- Create: `db/migrations/0052_rls_lockdown.sql` — drop the blanket `c21/c22/
  live_state admin all` policies; revoke `authenticated` direct DML grants on every
  table the recon lists (writes now flow ONLY through the DEFINER RPCs built above +
  the pre-existing ones); convert `apply_net_count_change` + `generate_bracket_atomic`
  to SECURITY DEFINER (recon landmine — they break otherwise); fix the 0019
  audit-actor derivation to `caller_role`; revoke the stray anon DML grants
  (groups/scoring_presets/attendance_sessions/check_ins). Anon READ policies and the
  anon RPCs (register_team, check_in/out, submit first-score) stay.
- Modify: `public/app.js` — the kill list (recon §3, verbatim): `adminLoginHTML`
  (8217-8229), `adminLoginWithCode` (8765-8789), `onAdminLoginSubmit` (8791-8834),
  the auth-page "Admin sign-in" link/panel (8496-8520), the `.local`/`isLocalCode`
  branch (10881-10890), the 3 write-only sessionStorage flags + setters, dead CSS
  `.auth-admin/.auth-adminpanel` (styles.css 3065-3067). RE-GREP all anchors first.
- Delete: `supabase/functions/admin_login/` (whole function; controller removes the
  deployed fn too).
- DB cleanup: delete the 2 synthetic `.local` auth.users + their profiles.
- Test: delete/adjust any test referencing the code login.

- [ ] **Step 1:** Mike-gate confirmed → **Step 2:** app.js kill list (grep-gates ==
  0; counts in commit) → **Step 3:** controller applies 0052 + deletes the edge fn +
  `.local` users → **Step 4: adversarial verify** (fresh-context agent, the Arc-1
  pattern): a real `player`-role account CANNOT write tournaments/matches/players
  directly; anon register + check-in + spectator reads all still work; Mike's owner
  session drives every Manage write; copilot works for owner, 401s for player →
  **Step 5:** vitest green; `node --check`; bump → `2026.07.11.13`.
- [ ] **Step 6: commit** `feat(auth): code logins retired + RLS locked (0052) - email
  and password only, 4 role-gated admins, blanket policies dropped - v2026.07.11.13`.

### Task 14: Old admin shell deletion + final sweep

**Files:**
- Modify: `public/app.js` — delete `renderAdminShell` (~9672) + every old-shell tab
  builder/handler it exclusively owns (the dashboard/session/players/teams/courts/
  tournament-manage panels, `manageSettingsPageHTML` ~6392, the old admin toolbar,
  `canAccessOperatorSafetyControls` ~6521 and its gates, the Task 1 `mg-oldlink` row
  + `renderOldAdminShell` wrapper, the `data-mg-old` handler). Grep-gate EVERY
  deleted symbol == 0 before removing its CSS.
- Modify: `public/styles.css` — the old admin kits (admin-toolbar ~516, ad-qa, the
  Sora admin styling) where grep-gated orphaned; per-class counts in the commit.
- Modify: `public/index.html` if any old-shell scaffolding exists (grep).
- Test: delete tests asserting old-shell markup (grep `renderAdminShell|ad-qa` in
  test/).

- [ ] **Step 1:** grep-gate inventory FIRST (paste counts) → **Step 2:** delete →
  **Step 3:** full vitest green; `node --check`; bump → `2026.07.11.14` →
- [ ] **Step 4: commit** `chore(admin): old admin shell deleted - Manage tab is the
  only admin surface - v2026.07.11.14`.

---

## Verification gate (controller, after each push + at the end)

§27 per new/changed screen at 390 AND ≥1024 (restore 1920×1080 after): 9 questions +
one rendered value cross-checked vs the DB (e.g. teams-paid counts vs rows; pickup
day vs pickup_days). Anon register re-smoke after Tasks 1, 12, 13, 14 (nav/auth
touched). Console clean; version pill == pushed. Phase gate order: Tasks 1-12 →
MIKE'S PHONE VERIFY → Task 13 (with its adversarial verify) → Task 14. Seed the 3
co-admin memberships whenever the accounts exist (R6 UI or controller SQL — one
INSERT each, recon §4).

## Self-review notes
- Spec coverage: R1→T1 · R2→T5 · R3→T2 · R4→T3 · R5→T4 · R6→T11 · R7→T5 · R8→T6 ·
  R9→T7 · R10→T8 · R11+R11b→T9 · R12→T10 · R13 desktop→every task's §41 line ·
  §6 co-pilot→T12 · cuts→T4/T13/T14 · net-new table (spec §5) fully mapped
  (0046-0052 + seat RPC + log RPC + atomic RPCs + persisted seeds + champion).
- Type consistency: `manageView` (T1) consumed T2-T11; `data-mgt-view` (T5) consumed
  T6-T10; `openMgScoreSheet` defined T7, reused T8; `openMgTeamSheet` defined T6,
  reused T7; migration numbering 0046-0052 sequential.
- No placeholders: every task carries exact anchors (re-grep rule stated), structures,
  RPC names/signatures, and commit messages.
