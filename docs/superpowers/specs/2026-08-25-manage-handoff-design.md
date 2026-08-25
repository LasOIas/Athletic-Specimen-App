# Manage handoff — design spec (2026-08-25)

**Source of truth:** Mike's Claude Design Manage handoff (49 screens incl. the check-in kiosk), archived
at `docs/design-handoffs/2026-08-24/manage/` (text) with the PNGs in
`C:\Users\OlasM\Downloads\Athletic Specimen manage page.zip`. Builds on the Home + shell + motion port
(v2026.08.24.5) and the Tournament port (v2026.08.25.4, spec `2026-08-25-tournament-handoff-design.md`).
The recon (9 Opus agents + critic, 656 file reads; `scratchpad/recon-manage.json`) is the ground truth
for every delta below. The screens win over the README where they disagree.

## Scope: what actually changes

**27 of 49 screens are prod byte-for-byte** and ship nothing: all seven kiosk screens (43–49;
`_kiosk.css` is a verbatim lift of `checkin.html`'s own `<style>`), mg-checkin + undo (05/06), mg-players
(07), mg-player-edit (08), mg-pickup-list/form (17/18), the QR modal chrome (19), mg-tournament-new (04),
mg-teams-empty (10), mgts-teams-pay (30), mgts-team-sheet (32), both type-the-name confirms (27/28 —
Delete the tournament already exists), modal-confirm-danger (24), mgts-pools-setup (33), the top of
mgts-pools-live (34) and the score sheet (35 — prod's card is ahead of the design after 08-25),
mged-editor (41), mgts-closeout (42), mg-admins (20), mg-admin-remove (21), mg-activity (22, markup),
cop-chat (23), mgts-hub-v1 (26, superseded). **Screens 9 and 11–16 are prod as it stood before
2026-08-07** and ship nothing (Mike's call, below).

The round's real work, in build order:

1. **Foundations** — the 08-05b field style, the 08-23 button restyle on markup that exists today, the
   Manage vocabulary sweep (Championship / Semifinals / done), C81 (the dead QR URL), the scoreless-final
   guard, `@keyframes m-menu`, the popup-edit-input `!important` drop.
2. **The Manage hub** (08-23) — tournament-as-title with the inline picker (the chooser screen retires),
   the phase track, quick actions, Needs-you with in-row fixes, state chips, the "This tournament" group,
   the corner mark.
3. **The "On the nets" strip** on game day — the honest subset.
4. **Manage › Tournament** (08-24) — the when-line, the same track, four stat tiles, tournament-scoped
   Needs-you, rows regrouped Sign-ups / Play / The event / After it ends, new rows, Create another
   tournament, the closing note; cross-area routing from the hub.
5. **Add a team** as a roster form with a Marked-paid switch.
6. **Event settings** as named cards with a sentence per row, a "Where" group, Saved / Unsaved changes,
   the derived summary line.
7. **The Rules sheet** as per-section cards whose Edit pills open the one editor.
8. **Pool controls** as per-pool cards: Edit nets inline, Move before play, Reset pools in the danger block.
9. **The organizer's bracket** — progress strip, champion block, the bracket card's seed/record line,
   stakes wording, WINNER pill, keyboard reach.
10. **The canvas** — retire the stale move/swap screens (C93) and re-snapshot mg-teams from prod.
11. **Verification** in Mike's Chrome + the vault.

## Mike's decisions (AskUserQuestion 2026-08-25, all the recommended option)

1. **Teams stay read-only; 2026-08-07 stands.** Screens 9 and 11 are prod before "remove all ways to switch
   players"; 12–16 are three alternative directions from 08-03, not a flow. Nothing ships in the app. The
   canvas screens retire and screen 9 is re-snapshotted from today's builder. The read-only guard in
   `test/manage-page.test.js:622-644` keeps its teeth and is re-asserted against the new Teams markup.
2. **The Rules sheet: the card look, ONE editor.** Cards, Edit pills, Edit all and Add a section as drawn;
   every Edit opens the existing full-screen editor at that section. No inline field editing, no second
   serializer, no poll hazard. Honours 2026-07-12 and the August drawing at once.
3. **A pool moves only before play starts.** The Move row renders while the pool has no final game; once
   play starts it goes and the note says so. "Scores follow the team" never ships (it is false).
4. **UI now, one data round after.** Six drawn behaviours need database work and become one follow-up
   migration round with its own spec: undo a bracket save (C79), a scoreless POOL winner (C86), paid
   reaching the activity log (C87), "clear every score" keeping the tree, the activity log in prose with
   people's names, a pool-move RPC. This round ports every surface the database can honour today.

## Decisions I made (stated once, Mike's to overrule)

### Cross-cutting

- **Facts the database cannot state are dropped, never printed:** minutes a net has been idle (no
  `started_at`), "both teams checked in" and a per-tournament checked-in count (check-in is a club-roster
  fact), a start time and a check-in open time (no time column), "closes Fri Aug 21" (no close date),
  "0/18 games" before a draw (the tile shows the real count with no denominator until matches exist),
  bracket nets reassigning themselves, "Scores follow the team". `event_date` and `team_cap` ARE live
  (0057 applied 2026-08-04; the migration file's header is stale) and print behind their column guards.
- **Copy law:** every em dash in the design's Manage copy becomes a comma or a sentence break; "Casual
  nights between tournaments" becomes "Casual games between tournaments"; "Championship, never Final"
  reaches Manage (`mgBracketSideName`: Grand final → Championship, the last round of each side →
  Semifinals; "already final" → "already done"; the pools meta "games final" → "games done";
  `matches.round_label` is stored and untouched). The score card's hint stays the derived sentence.
- **One right-hand chip class.** The hub adopts prod's `.mgv-rmeta` (the design's `.mgh-state` is the same
  affordance under a second name); `.mgv-rmeta` gains the design's `.is-warn` colour and its ≤380px hide.
- **One score card, prod's, with prod's hooks.** The design renamed `data-mgss-winner` → `data-mgss-win`
  and dropped the pool card's winner row and the bracket card's steppers; none of that is adopted. The
  bracket card gains three additive things (below).
- **No `.mgh-undo` strips.** The design's own generator emits Needs-you rows without one, and no in-row
  write has a reversing RPC this round. The registration flip gets the design's `.mgh-done.is-under`
  confirmation ("Registration closed" / "Registration is open") with no Undo link — the switch is its own
  undo, as the design's comment says.
- **The 08-23 button restyle ships now**, re-mapped to prod's markup: `.mgs-cta` → `#mgss-sheet
  .mgv-scfinal`, `.mgs-b` → `#mgss-sheet .mgv-scb`, `.mtv-obtn`, `#player-edit-modal .pe-save/.pe-cancel`,
  `#team-pay-modal .mgv-tpay`, `.pd-bk-chip`, plus the new `.mgh-act/.mgh-nact/.mgh-done/.mgh-prow` members
  when the hub lands. `.mgv-modebtn/.mgv-picked` (the move feature) are not ported.
- **The 08-05b field style ships app-wide** as authored (`#app-shell .pk-fld/.pk-fl/input.pk-fv:not(.mgv-sv)`
  …), including on the public register form and the two `type="date"` pickers; verified on prod in the
  drive. Its two `.mgv-nfld` lines are already live and are omitted.
- **Desktop:** no new `@media` rules — every new surface renders inside `#tab-manage .container`'s 720px
  column by inheritance. Any future Manage desktop rule is written `body.pd-public-active #tab-manage …`.
- **`!important` carve-out:** only the documented iOS font-size / min-height counters on compact controls
  (`.pc-*`, `.rlv-*`, `.mgh-nact`, `.set-*`), each with a PORT NOTE, matching the 08-25 precedent. Inputs
  stay 16px (iOS zoom guard); the design's 15px never lands.
- **Motion:** `@keyframes m-menu` is added; `.mgh-pick` gets an explicit menu rule and `.mgh-pick > *`
  its own explicit rise, gated on `body.m-enter` like everything else; no wildcard selectors. `.mgh-done`
  plays `m-tick` explicitly. The motion-port guard's allow-list widens by exactly `.mgh-pick`.

### The Manage hub (screens 01–03)

- **Title block:** `.mgh-scope` = eyebrow "Manage", a `<button class="mgh-title">` carrying the tournament
  name (25px display 800) and a caret, `.mgh-meta` = the existing `mgSwitcherMetaText` facts with the
  phase clause in `<b>` (live-ink; `.is-off` muted when closed), the 62px `.mgh-mark` top-right (a
  separate element; the `.pd-watermark` hide behind Manage stays). Prod's `.mg-h1`, the `.mgv-tsw` card
  and "Every row below edits this one." retire.
- **Inline picker:** `.mgh-pick` absolute over the rows, groups "This season" / "Finished" from
  `mgTournamentPickerList` + `mgTournamentPhase`, rows = name + the existing `mgtlSeasonSub` /
  `mgtlFinishedSub` sub + `.mgh-pstate` word, the picked row `.is-on` (fill + inset ring, no dot, no
  chevron), a `.mgh-pnew` "New tournament" footer row (→ `manageView='tournament-new'`) and the note
  "Everything in Manage edits the one you pick. Finished tournaments stay open so you can fix a score
  after the fact." Open/closed lives in a module var `mgHubPickerOpen` (survives the container swap; closes
  on pick, on a tap outside, on Escape). Picking reuses `mgPickTournament` without its
  `manageView='lead'` line. **The chooser screen retires:** `buildMgTournamentListHTML`, the
  `'tournaments'` view and its CSS go; the New-tournament back button becomes `data-mg-area="lead"`;
  `loadTournamentHistory()` fires once on the hub's first paint so Finished rows keep their "12 teams ·
  Net Gains won" sub. The pure helpers (`mgSwitcherMetaText`, `mgEventDateLabel`, `mgTournamentPhase`,
  `mgTeamsClause`, `mgtlSeasonSub`, `mgtlFinishedSub`) stay exported.
- **The pick persists:** `state.activeTournamentId` + `mgTournamentPinned` are saved to localStorage and
  rehydrated on boot, falling through to the resolver when the stored id no longer exists (a deleted
  tournament never blanks the page). After a pick, per-tournament chips and tiles render only from the
  tournament row itself (`t.*`) until the async refresh lands, so nothing paints zero-then-right.
- **Phase track:** six cells, `.mgh-track/.mgh-step` with `.is-done/.is-now`, from a pure
  `manageHubPhaseIndex(t, today)`: completed → 5 Done, bracket → 4, pools → 3, setup → 2 Check-in when
  `event_date` is today, else 1 Sign-ups when `registration_open`, else 0 Setup. Shared with the
  tournament page.
- **Quick actions:** `.mgh-acts` two-up. Primary by phase: setup → "Open registration", sign-ups →
  "Close registration" (both = the shipped `mgrToggleRegistration` write + read-back, with a status target
  on the hub so a refused write is never silent), pools/bracket → "Open score sheet" (→ the tournament's
  Pools view), done → no primary (the secondary alone). Secondary "Add a team" → the tournament's
  `teamadd` view. Labels on a `<span>` (prod forces 16px on `<button>`).
- **Needs you:** a pure `manageNeedsYouModel(t, teams, days, pools, matches, tournaments, scope)` replaces
  the three-kind model, rendered as `.mgh-nrow` (`.mgh-nbody` title + sub, `.mgh-nact` verb; `.is-go`
  neutral ring = a jump, accent ring = a fix) with the `.mgh-sectn` count and the head "Before you open"
  in setup. Kinds, in order: sign-ups not open (setup, closed → "Open", the flip) · unpaid ("2 of 6 teams
  haven't paid" / "Block Party · Dig Deep, the other 4 are paid" → "See who paid", jump) · pools not drawn
  (setup, ≥2 teams, no pools → "Draw", jump to the two-step draw; no invented pool count) · venue not set
  (column loaded, empty → "Set", jump to settings) · entry fee not set (→ "Set") · no rules ("Reuse" writes
  the most recent finished tournament's rules through `tdbSetTournamentFields` with read-back and shows the
  confirmation strip; when no prior rules exist, "Write" jumps to Rules) · a live game with no score
  ("Net 3 has no score" / "G11 is on and nothing is entered" → "Enter", opens the score card) · prod's
  Venmo and no-pickup-day items stay (`scope:'hub'` only). A completed tournament lists only the club-level
  items. Titles are model-controlled; subs escape names.
- **Rows:** "This tournament" head + the Tournament row (`.mgh-trow`, sub "Registration, teams, pools,
  bracket", chip from `mgTournamentRowStage` reworded: "Not open yet" / "Pools not drawn" (warn) / "Pools
  drawn" / "Pools live" / "Bracket live" / "Finished"); "Everything" head + Pickup days ("Casual games
  between tournaments"; chip "2 scheduled" / "Next up Jul 16" / "None yet"), Check-in ("Tap names as people
  arrive"; chip "Opens Sat" from `event_date` when in the future, "Today" on the day, none otherwise),
  Players ("The roster everyone is picked from"; chip "233 on file" — the club roster, honestly), Teams
  ("Who is playing with who"; chip `mgTeamsClause` → "6 of 12" / "12 teams" / "None yet"), Admins ("Seats &
  activity log"; chip "N seats" only once `mgSeats` is loaded, otherwise none). Routes unchanged.

### The "On the nets" strip (screen 03)

- Renders only while `status` is pools or bracket. `.mgh-live` card: head "On the nets" + "N playing · M
  idle" (distinct live nets vs `net_count`); one `.mgh-lnet` row per net 1..`net_count`: the net tile, the
  matchup ("Net Gains vs Block Party"), the context ("Pool A · G12" or "Winners · G7"; "· no score yet"
  when live with no points, `.is-late` wash), an idle net reads "Idle" / "G14 can start" when an unplayed,
  fully-seeded game is queued for it (via `pickPoolCurrentGames`, which finally gets a caller — C77) or
  "Nothing queued". No minutes column anywhere.

### Manage › Tournament (screens 25, 27–32, 24)

- `.tv-when` = `mgEventDateLabel(event_date)` (guarded) · venue (guarded) · "4s co-ed" · buy-in. No time.
- The same six-step track; four `.tv-stat` tiles: Teams in (count; `/cap` when `team_cap`), Paid
  (`paid/teams`), Nets, Games (`done/total` once matches exist, else the count alone). `.is-attn` on unpaid,
  `.is-live` on games while live.
- Tournament-scoped Needs-you (the same model, `scope:'tournament'`).
- Rows regrouped with `.pl-sect` heads. **Sign-ups:** Registration & public page (sub "Open · what players
  see" / "Closed · what players see"; chip OPEN/CLOSED), Teams & payment ("6 registered · 2 unpaid · rosters
  and buy-in"; chip "2 UNPAID"/"ALL PAID"), Add a team ("For the pair who paid you at the net" → `teamadd`).
  **Play:** Pools & schedule ("Not drawn · 2 pools of 6 across 3 nets" via `mgPoolsDrawHint`'s clamp, or
  the live sub; chip TO DO / LIVE / DONE), Score sheet ("Enter pool results as each game finishes" → the
  Pools view; the row is omitted before the draw), Bracket & scores ("Double elimination · opens when pool
  play finishes"; chip LOCKED/LIVE/DONE), Rules sheet (`mgRuleLine` for both phases · "N sections live").
  **The event:** Event settings ("4s co-ed · $80 a team · 12-team cap · 3 nets", cap guarded),
  Announcement ("The note at the top of the public page" → `openManageEditor('announcement')` directly),
  Player view ("Open this tournament the way players see it" → the Tournament tab; rendered only when the
  active tournament IS `publicLiveTournament()`, so the row never lies). **After it ends:** Close out
  (chip NOT YET / DONE). Then the dashed "Create another tournament" (→ `tournament-new`), the `.tv-note`
  "Everything on this page edits <name> only. Switch tournaments from the title on Manage.", and the
  shipped danger block verbatim. `appPrompt` gains a `danger` flag so Delete's confirm is red.
- Registration page: title "Registration & public page"; the venue stays on Event settings (one editor
  per column pair); `.mgr-status` reads "Saved" at rest and "Unsaved changes" while dirty.
- Cross-area routing: `data-mgt-view` taps from the hub (`manageView==='lead'`) set
  `manageView='tournament'` + `mgtView` and repaint — one delegate branch above the existing one.

### Add a team (screen 31)

- A `teamadd` view on the `.rf-*` kit: Team name, `team_size` player rows with a typeahead over the club
  roster (`state.players` names; admin-only surface), "Payment" divider, the "Marked paid" switch ("$80 a
  team · no Venmo record for teams you add"), "Add team". Submit = `tdbAddTeam` → `tdbSetTeamRoster` →
  `tdbSetTeamPaid` in sequence with each error surfaced in the form's status line (a failure after the
  insert says which step failed and leaves the form filled); success returns to Teams & payment. Partial
  rosters are allowed (it is the at-the-net path; `register_team` is not used). No activity-log claim.

### Event settings (screen 39)

- Four groups: The basics (Name stacked, Team size "a side", Nets "courts"), Scoring (Pool to/cap paired,
  Bracket to/cap paired, Win by 2, Grand final reset — the two switches stay tap-to-apply per 2026-08-04,
  laid out as `.set-row`s), **Where** (Venue, Address, stacked, guarded by `tournamentHasVenue()`), Money
  (Buy-in). Every input id unchanged. Intro: "These decide how the day runs. Scoring here sets the rule
  line on every score card." `.set-sum` from a pure `settingsRuleSummary(t)` ("Pool to 15, cap 20 ·
  bracket to 21, cap 25 · win by 2."; a null cap drops its clause; no "win by 2" when off). Status "Saved" /
  "Unsaved changes" driven by `mgSyncSaveButton`, never stomping "Saving…" or an error. CSS authored as
  `input.set-in/.set-num/.set-money/.set-wide` with `flex: none; min-width: auto` so the 62px / 148px boxes
  exist.

### The Rules sheet (screen 40)

- Manage-only builder over a pure `rulesToSections(md)` (sections split on blank lines exactly as
  `rulesToHTML` does; each `{ head, bodyHTML, startOffset }`). Each section = `.rlv-card` (`.is-note` when
  headless) with the head and an Edit pill; header "Edit all"; "+ Add a section"; intro "This is the page
  players read. Every section here is yours to edit. Tap one to change its wording or bullets."; footer
  "Saved changes show up on the players' Rules page straight away." Edit → `openManageEditor('rules')`
  with the textarea's caret at that section's `startOffset` and scrolled into view; Add a section → the
  editor with "\n\n## New section\n- " appended in the textarea (unsaved until Save). `rulesToHTML` and the
  public Rules page are untouched. Empty rules keep prod's `.mgru-empty` inside one card with "Write".

### Pool controls (screen 34)

- `mgPoolsControlsHTML` emits `.pc-top` (note + Done) and a `.pc-card` per pool: head = name + "Nets 1-3"
  + "Edit nets"; rows = team + "Move ›" (only while the pool has no `final` match). Edit nets → the label
  becomes an inline field prefilled `cur.join(', ')`, the button "Save nets"; Save keeps prod's parse,
  dedupe, min-1 validation and `tdbSetPoolNets` re-lay, with "Re-assigns its unplayed games." as the field's
  hint. Move → an inline `.pc-pick` strip ("Move Net Gains to → Pool B / Cancel") → `tdbMoveTeamToPool` +
  refresh + a green flash on the new card. The note reads "Move a team to another pool before play
  starts, change the nets a pool plays on, or start the draw over." Reset pools sits in the shipped
  `.mgv-danger` block: "Clears every pool result and draws new pools from the registered teams at random.
  Pool play starts over." + "Asks you to type the tournament name before anything happens."; the typed-name
  `appPrompt` stays. The design's `.pc-toggle` on the head is dropped (the collapsed row + Done suffice).
  The drawn-not-started step keeps its current look (`mgPoolTeamsBlockHTML` splits from the controls).

### The organizer's bracket (screens 36–38)

- Above the round groups: `.bkr-strip` — eyebrow "DOUBLE ELIMINATION · 8 TEAMS · 3 NETS", "N of M games
  in", the bar, and a now-line: "On the nets now: G1 on Net 1, G2 on Net 2. Tap a game to pick its
  winner." (live = `status==='live'`, nets from the stored `matches.net`) / "Every game is in. <Champion>
  takes it." / "No game is playable, the next round needs results first." Once decided, `.bkr-champ`
  ("CHAMPION" / name / "Seed 1 · 3–0 in pools · won the championship, G14"). No Undo strip, no "Clear every
  score", no net reassignment, no "No net" / queued states (all the data round's, or refused).
- Round headers: Winners bracket · G1–G4 / Losers bracket · G5–G6 / Winners semifinal · G11 / Losers
  semifinal · G13 / Championship · G14 (the public's vocabulary).
- The bracket score card gains: a `.mgs-rsub`-equivalent line under each name ("Seed 2 · 2–1 in pools",
  phase 'main' only; omitted before seeding), the stakes block ("Winner → Championship · G14" / "Loser →
  losers bracket · G9"; terminal outcomes "champion" / "runner-up" / "third place" (the losers-semifinal
  loser) / "eliminated"), and a WINNER pill revealed on `.is-won` beside the steppers. Steppers, "Save live
  score" and the leader-naming primary stay. Reopening a scoreless final keeps the primary disabled until a
  point is entered.
- Resolved rows get `role="button" tabindex="0"` and Enter/Space open the card; Escape closes it.

### The canvas (C93)

- Via the Claude Design MCP on project `f34a8182-…`: delete `mg-teams-swap` and the five `mg-teams-move-*`
  screens; rewrite `mg-teams` from today's `buildManageTeamsHTML` output (no grip, no swap copy, "Regenerate
  any time to rebuild the teams"). The archived handoff text under `docs/` is left as delivered.

### Not ported, on purpose

- The move/swap flow (`_rounds.css:365-605`, screens 9/11–16) — Mike's call 1.
- Inline rules editing (`_shared.css:300-438` behaviour, `_shared.js:629-735`) — Mike's call 2.
- "Scores follow the team", a pool-move RPC — Mike's call 3.
- The Undo strips, "Clear every score", net reassignment, activity-log prose and names, an attributable
  paid event, a scoreless pool winner — Mike's call 4 (the data round).
- The two-tap arm as a destructive confirm; the inline type-the-name strip that accepts any text.
- The design's `data-mgss-win` / `data-mgss-row` hooks; the aria-label-keyed card CSS; the pool card
  without a winner row; the bracket card without steppers; "Tap the team that won, score is optional".
- A Location field on the Registration page (venue is edited once, on Event settings).
- "10:00 AM", "Opens Sat 9:30 AM", "closes Fri Aug 21", idle minutes, "both teams checked in", "22 of 24
  in", "0/18 games" pre-draw, "Changing scoring updates the rules sheet players read", "tap one to change
  its … order", the README's per-phase row highlight and its "unassigned players / wrong pool count" kinds.
- The `.pd-watermark` `display:block !important`; `#app-header` sticky; `.ph-pagehdr`; the scroll rules
  the shell round refused.
- Screen 28's stale background clauses ("closes Fri 6 PM", "$480 of $640 collected", …).

## Tests

- New `test/manage-round.test.js` (harness copied from `manage-page.test.js`): the hub emits
  `.mgh-eyebrow/.mgh-title/.mgh-meta/.mgh-pick` and not `.mg-h1`/`.mgv-tsw`; six `.mgh-step` with exactly one
  `.is-now` from `manageHubPhaseIndex`; every chip's text comes from state and none prints unloaded data;
  the Needs-you model's kinds and order per scope; the read-only Teams guard re-asserted on the new
  markup; the tournament page's groups, tiles and row order (delete/reset last); `settingsRuleSummary`,
  `rulesToSections`; the pool controls' Move gating; the bracket vocabulary and the card's additive lines;
  `@keyframes m-menu` present and no wildcard matches `.mgh-pick`; no em dash and no "night" in any
  Manage-emitted string; skill values on Manage and on no public builder; C81 (no `vercel.app` literal;
  the QR derives from `location.origin`).
- Rewritten: `manage-page` (hub assertions, `mges-half`, `pk-fv` on settings, rules `rl-body`, bracket
  "Grand final" strings, "already final"), `tournament-switcher` (the meta-sentence pure tests kept
  verbatim; container assertions re-pointed to `.mgh-*`), `tournament-picker` (its five invariants
  re-pointed at the inline panel; not deleted), `tournament-create` (row order), `motion-port` (the
  `.mgh-pick` allow-list), `supabase-writes` (no new RPCs this round; the list is untouched).

## Global constraints (every task)

- `APP_VERSION` → `'2026.08.25.N'` continuing from `.4`; `node --check public/app.js` (and `pure.js`)
  after every edit; commit + push per task; every commit chain gates on vitest's exit code.
- No em dashes; never "night/tonight"; no neon; skill never on a public surface; 390 primary / 1024
  desktop; Manage is organizer-only.
- `partialRender`/`repaintManage` for background syncs; `mEnter()` only on real navigation; the dirty
  guards (`manageSettingsDirty` etc.) keep the 15s poll off any view holding a live input.
- Prod is running the live August 2026 bracket: every drive is read-only; localhost boots against prod
  Supabase, so write legs are stubbed in frames.
- Appended CSS with `PORT NOTE`s; the only new `!important`s are the documented iOS counters.
