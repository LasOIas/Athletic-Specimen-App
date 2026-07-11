# Admin Manage Tab — Design Spec (session 10, atom-up, ALL PICKS LOCKED)

**Date:** 2026-07-11 · **Status:** locked by Mike (13 ladder rounds, ui38 ledger)
**Ground truth:** `2026-07-11-admin-phase-recon-map.md` (`bf8e0b7`) — capability
checklist, code-login kill list, live auth state, landmines. Read it with this spec.
**Supersedes:** `2026-07-09-admin-dashboard-remake-design.md` in full (its IA is dead;
its content designs were re-opened and re-picked below).

## 1. The model (Mike, 2026-07-11, verbatim intent)

> "take out the nlvb2025 and asvb2025 log ins and only having it be the person sign in
> that we set it to, there are 4 of us that will have access, right now just use mine.
> …when they sign in with said email and password the app shows the same as the public
> page but with a manage tab that has access to everything, i mean everything is
> changable by the admins"

- **One app.** No separate admin shell. Admins see the public app (Home · Check In
  day-of · Tournament) **plus a Manage tab** in the same nav (mobile floating bar,
  desktop top strip). `renderAdminShell` and the whole old admin UI are DELETED at the
  end of this phase (own commit, grep-gated), like the old public Home.
- **Auth:** email+password accounts only. Role owner/organizer → `isAdmin` (already
  live, `deriveRole`/`caller_role`, v2026.07.09.7). 4 full-power admins ("everything
  is changable"); Mike's account (owner) is seeded today, the other 3 are one
  memberships INSERT each (recon §4). No approval queues anywhere (standing rule).
- **Code logins (nlvb2025/kcvb2025/asvb2025) RETIRE as the LAST slice**, gated on
  Manage proven on prod with Mike's real account. Per recon §3 the retirement cut
  must also: re-home the Co-pilot edge-fn gate off `app_metadata.admin` (else admin
  copilot 401s), fix the audit-actor derivation (0019), delete the `.local` synthetic
  users, and land TOGETHER with the blanket-RLS lock (drop `c21/c22` + revoke
  `authenticated` table grants + convert the 2 SECURITY-INVOKER RPCs to DEFINER) —
  otherwise every self-registered account keeps DB-wide writes.
- **group_admin scoping dies with the codes.** The DB role enum has no group_admin;
  `state.limitedGroup` is set only by the code path. All 4 admins are full-power
  (Mike's explicit model). Owner-only today's operator-safety gating collapses to:
  all 4 admins see everything ("everything changeable").

## 2. Locked picks — the thirteen rounds (ui38 ledger, session 10)

### R1 · Manage lead — pick A: needs-you first, flat rows
Title `Manage` flush top (Barlow 22). `NEEDS YOU` hairline section: action rows for
whatever needs attention (venmo link missing · unpaid teams · no pickup day) — plain
rows, urgency carried by the section label, no dots/badges. Then `EVERYTHING`: flat
rows **Tournament · Pickup days · Players · Teams · Admins**, each name + one-line
muted status + chevron. No tiles, no cards. Needs-you rows deep-link into the area
that fixes them. Empty needs-you = section omitted entirely.

### R2 · Manage → Tournament — pick B: plain sub-hub
Page header (back + tournament name Barlow 22) + muted stage sub-line ("Setup ·
registration phase"). Rows only: **Registration · Teams & payment · Pools & schedule ·
Bracket & scores · Event settings · Rules sheet · Close out** — every action one tap
deeper, status inline per row (green "Open" word on Registration when open). No
cockpit block, no inline controls at this level.

### R3 · Manage → Pickup days — Mike hybrid A+C: multi-day list + form-first edit
`Pickup days` list (SCHEDULED section): rows = weekday tag (THU) + date·time + place,
`NEXT UP` live-ink tag on the soonest. Dashed `Add a pickup day`. Tap a day (or Add) →
form page: DATE / TIME / LOCATION hairline-underline fields + Save + "The Check In tab
appears for everyone that day" note + ON THE DAY rows (Share the check-in QR · Start a
fresh sheet) + red-text `Remove this pickup day`.
**Schema change accepted by Mike:** multiple scheduled pickup days (today `sessions`
is one hardcoded row id=1). New `pickup_days` rows (or multi-row sessions), each
opening its own day-of Check In; `sessionIsToday` gates against the set.

### R4 · Manage → Players — pick B: one A–Z directory
Header + `Select` (bulk mode: check-in/out, group moves). Search box (kiosk grammar,
"Search or add a player"). Meta line (233 players · 19 checked in · 1 group). One
alphabetical list: letter anchors, name, quiet `IN` live-ink tag on checked-in
players, skill right-aligned (Barlow, accent — ADMIN-ONLY data, never public). Tap a
row → the player edit sheet (name / skill / group / check-in / unlink account /
delete). No initials bubbles. Group manager reached from the meta line's group count.

### R5 · Manage → Teams (renamed from Courts) — pick A TRIMMED (Mike's cut)
Size chips (2s 3s 4s 6s) + `Generate balanced teams` + `TODAY'S TEAMS` list: TEAM n
label + **stacked names, one per line** (Mike delta). Tap a name to swap players.
**CUT by Mike: the live-courts board** ("show the teams not what court is playing, we
don't need that anymore") — casual net cards, report/clear result, court rotation all
DIE. **Accepted consequence:** casual results no longer nudge skills ±0.1 — skills
change only by admin edit. Team persistence (cross-device) stays; court state dies.

### R6 · Manage → Admins — pick C: seats only
Four seat rows: Mikey Olas (OWNER pill, filled) + Seat 2/3/4 ("Waiting — they create
an account, you flip it on", OFF pill outline). Tap a waiting seat → assign by email
(the person must have signed up; flips their membership to organizer via a new
owner-gated RPC). One `Activity log` row → full log (every admin action, who/when,
undo on recent) — **net-new read RPC + UI** (action_log is client-invisible today).

### R7 · Tournament → Registration — pick B + Mike delta: editable persisted announcement
`THE ANNOUNCEMENT` leads: an **editable** text box, **saves per tournament** (new
`tournaments.announcement` text column) + `Copy for GroupMe` CTA. Below, CONTROLS:
Registration open switch (live-ink when on; drives the public Home state) + row into
venmo link · buy-in · team size fields.

### R8 · Tournament → Teams & payment — pick A + Mike delta: full-edit popup
One list: team name + roster preview line + PAID (live-ink) / TAP WHEN PAID
(warn-ink) tag + chevron; dashed `Add a team yourself`. **Tap a team → a popup/sheet
with ALL details and ALL edit abilities** (Mike): full stacked roster (editable),
rename, paid toggle, move to pool (when pools exist), withdraw (mid-play — forfeits
remaining, say so honestly), remove team.

### R9 · Tournament → Pools & schedule — pick A: score on the schedule
The PUBLIC pools page grammar (pool tabs + Seeding tab, standings-lite, net-hairline
game rows) with admin verbs added inline: `SCORE` outline button on unscored rows,
live rows tap-to-update (green score + LIVE pill), finals get quiet `EDIT`. Pool
controls (move teams · edit nets · reset pools) one row deeper. Pre-draw state: the
draw setup (pools count, nets, format preset incl. the June 12-game preset) + `Draw
pools & build the schedule`. Draw/start-play become atomic RPCs (recon landmine).

### R10 · Tournament → Bracket & scores — pick C (re-round): by-round rows + tap editor
Live bracket = compact game rows grouped by ROUND (Winners R2 · Losers R1 · finals),
each row: matchup + net/meta sub-line + live score (green) / final score / UP NEXT
tag. Multiple simultaneous live games supported (Mike's correction). **Tap ANY game →
the editor sheet:** matchup title, meta line, two steppers, `Final — <team> wins`
primary + quiet `Just update the live score`. Pre-bracket state: seeding list with
reorder arrows + `Generate the bracket` (seed override PERSISTS with the bracket —
closes the transient-seedOverride debt). Reset bracket = type-name unlock row.
The public read-only tree stays reachable (players' view).

### R11 · Tournament → Event settings — pick B: all knobs flat
Every field visible and editable, hairline grammar, two-across where short: name /
team size / nets / pool to·cap / bracket to·cap / win-by-2 / grand-final reset /
buy-in. **No preset card, no locked-knob guard rails** (Mike declined) — mid-play
edits are allowed; destructive REDRAWS still carry their own type-name unlocks (R9).
Scoring presets remain DB rows but get no UI this phase.

### R11b · Rules sheet — derived, LOCKED
One editable sheet (the seeded July rules), `Save — players see it right away`
(writes `tournaments.rules` via tdbSetTournamentFields or a set_rules RPC), hint line
"## makes a heading · - makes a bullet" (rulesToHTML grammar). This is the missing
write path for 0045.

### R12 · Tournament → Close out — pick A: champion + end
`CHAMPION` section: matte-gold champion card (FROM THE BRACKET · team name · CHANGE
override — picker over the teams). `End the tournament` primary CTA + honest note
("Moves it to Past tournaments · registration and scoring close · you can reopen from
there"). **Net-new write path** (the June failure): store the champion
(`tournaments.champion_team_id`) + set status='completed' deliberately; reopen
available from the ended state. computeChampion stays as the auto-suggest source.

### R13 · Desktop — derived, LOCKED
The public desktop grammar extended: top tab strip gains `Manage` for admins; every
Manage page renders as a centered ~720px column (`#tab-manage` clamp). No rail/board
variant. Mobile stays the floating rounded bottom bar with the 4th item.

## 3. System & style (inherited, non-negotiable)

Stone bg · Barlow Semi Condensed display via `--font-display` (admin Sora dies with
the old shell) · THE muted blue `--accent` · flat on stone, hairline `pl-sect`-grammar
labels · rf-* hairline-underline fields · SVG only · plain English, no "night/tonight"
· §51 matte · skills admin-only · green=good/amber=caution/red=bad · labeled tags,
never bare dots · iOS 16px input guard everywhere.

## 4. Cuts & retirements (all Mike-locked this session)

1. **Old admin shell** — renderAdminShell + every admin tab/panel/handler + admin
   Sora styling: DELETED at phase end (grep-gated own commit).
2. **Casual live-courts board** — net cards, report/clear result, ±0.1 skill deltas,
   court rotation, live_state court sync: DELETED with R5. Team generation stays.
3. **Code logins** — full kill list in recon §3 (edge fn, adminLoginHTML/WithCode/
   onAdminLoginSubmit, auth-page Admin panel, `.local` branch + sessionStorage flags,
   dead CSS, synthetic users). LAST slice, paired with the RLS lock.
4. **group_admin / limitedGroup** — dies with the codes (no DB role exists).
5. **Old admin spec** (2026-07-09) — superseded by this document.

## 5. Net-new build surface (beyond restyles)

| Item | What | Notes |
|---|---|---|
| `pickup_days` multi-row schema | R3 | replaces single `sessions` row; day-of gates read the set |
| `tournaments.announcement` | R7 | editable, persisted, copy-to-GroupMe |
| Champion storage + deliberate close/reopen | R12 | `champion_team_id` + status writes; History reads it |
| Rules write path | R11b | first UI writer of `tournaments.rules` |
| Activity log read RPC + UI | R6 | action_log is append-only, client-invisible today |
| Seat-assign RPC (owner-gated promote/demote) | R6 | memberships has no client INSERT policy |
| Persisted seed override | R10 | closes the transient state.seedOverride debt |
| Atomic draw/start-play RPCs | R9 | closes the non-atomic 3-write landmine |
| Copilot gate re-home + audit-actor fix | §1 | same cut as code retirement |

## 6. RESOLVED at spec review (Mike, 2026-07-11)

1. **Co-pilot KEPT — Mike's own design (R14, ui38-exempt directive):** a small
   floating bubble ABOVE the bottom nav (admin-only, all Manage-reachable views),
   tap → the chat opens full-screen: just the stone background with the logo
   watermark and normal chat bubbles over it. No panel chrome, no card. Consequence:
   the copilot edge-fn gate re-home (app_metadata.admin → owner/organizer role
   check) is REQUIRED and must land before codes retire so real accounts can use it.
2. **Slice order beyond "codes last"** is the build plan's job
   (`2026-07-11-admin-manage-tab-build.md`).

## 7. Verification bar (P3, every slice)

vitest green + `node --check` + §27 at 390 AND ≥1024 on localhost/prod + anon
register re-smoke after any slice touching routing/auth surfaces + the launch-flow
untouched until its replacement is proven. Final phase gate: Mike signs in on his
phone, drives every Manage screen against the real July tournament, THEN codes die,
THEN the old shell dies, THEN the RLS lock lands (with its own adversarial verify).
