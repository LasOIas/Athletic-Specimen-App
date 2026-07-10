# Admin Dashboard Remake — Design of Record

**Status:** design LOCKED (all §38 rounds run 2026-07-09/10, session 6; every pick Mike's).
**Origin:** Mike 2026-07-08 *"a clean admin dashboard with access to everything… I'm a fan
of tiles and navs"* → 2026-07-09 *"Time to design the admin page."*
**Ground truth:** the 2026-07-10 admin recon (wf_90c8635b-1de; 12-history task-#20) —
code-verified. Headline finding: **the app could not deliberately END a tournament**
(completion was a silent side effect of scoring the grand final) — the direct cause of
June 2026 finishing with 22 unscored bracket games and no recorded champion.
**Design system:** the admin harmonizes with the public pd-* kit (warm-stone tokens,
Inter/Sora, frosted cards over the logo watermark, inline SVG, §51 matte, no emojis).
Skill ratings are ADMIN-ONLY data and appear on these surfaces.

## 1. The frame (LOCKED — Mike, verbatim: "I want a bottom nav and tiles" / "I want a home, manage, tournament")

- Bottom nav: **Home · Manage · Tournament** (icon + label, same grammar as the public
  nav). No mode switch, no launcher concept, no silent Home-exit (the reflex-exit at
  app.js:10187 dies).
- **Home (admin):** compact overview — one status card per context (session · tournament)
  with live sub-lines; operator log / settings / sign-out via the header account menu.
- **Manage hub:** tile hub — Check-in · Players · Teams · Courts · Results · Session
  settings.
- **Tournament hub:** tile hub — Registration · Pools & schedule · Scoring · Bracket ·
  Close-out · Event settings.
- **ONE "needs you" card above the tiles** (locked density, option 3 of 3): exactly one
  card for the single most urgent action ("2 pool games waiting for scores → Score";
  "8 checked in — build teams → Build"); "All caught up" when idle. Never a feed.
- Tiles carry live sub-labels ("Scoring · 3 live", "Registration · Open · 18 teams").

## 2. Close-out page (LOCKED: paper-run first — kills the June failure)

Tournament hub tile. Top: **"How did it end?"** — a champion PICKER (search/select the
winning team; runner-up + final score optional). Picking crowns immediately (matte-gold
champion card — gold ONLY on a decided champion, §13.3 discipline) and offers optional
bracket backfill. Below: the honest **bracket ledger** ("22 games have no recorded score —
they stay blank in history") + **Complete tournament** (specific confirm naming what
completes) + **post/copy recap for GroupMe**. If the final WAS scored in-app, the picker
pre-fills. Completing sets status='completed' → the public bracket page's gold ending +
History. The needs-you card surfaces close-out when the bracket winds down.

## 3. Bracket scoring (LOCKED: net cards — the public pools-page grammar)

Scoring tile, bracket phase: per-net cards exactly like the public Pools & schedule page —
each net lists its bracket games in order (round eyebrows: WB R2 · LB R1), finals muted
with scores, the live game highlighted with inline score steppers + "End game"/match-point
hint, on-deck row with **Start**. One grammar across phases and across public/admin; zero
tree-panning to score. The full tree remains one "Bracket view →" chip away.

## 4. Schedule builder + lock (LOCKED: format builder)

Inside Pools & schedule (admin): **"Build the schedule"** — format cards (**June pattern:
12 games / 4 rounds / 3 nets per pool — a first-class SAVED PRESET**, never SQL again ·
Full round-robin · Custom paste) → an honest preview grid (games/pool/rounds/nets) →
**Apply** (auto-LOCKS the schedule). While locked, Draw/Reset are disabled with sub-labels
naming exactly what they would destroy; unlocking requires typing the tournament name.
Kills the standing P0 (one Reset+Draw mistap wiping a hand-built schedule).

## 5. Players page (LOCKED: today first)

Manage hub tile. Section 1: **HERE TODAY (N)** — checked-in players as compact rows with
one-tap check-out. Section 2: **EVERYONE** — search (16px input) + the full roster with
one-tap check-in, skill chip + group dots per row (admin-only data). Bulk ops behind a
simple Select mode (max 2-3 actions). Replaces the floating bulk bar + raw-table Group
Manager (the app's oldest surface).

## 6. Event settings (LOCKED: preset first)

Tournament hub tile. Top card: the last event's rule set as ONE unit ("June rules — pools
to 15 cap 18 win-by-2 · bracket to 25 (host picks 21/25 per event), no cap, win-by-2 ·
**double elimination** · 4s · 3 pools · 9 nets") with **Use these rules / Edit**. Edit
expands inline to grouped knobs (SCORING per phase / FORMAT / REGISTRATION incl. buy-in +
Venmo link). Locked knobs say why (team size locked once teams exist). Grand-final
bracket-reset toggle lives here. Finally gives the scoring rules a UI (the pool 20→18
change had to be made in the DB).

## 7. Registration admin + announce (LOCKED: announce first)

Tournament hub tile, ONE canonical surface (retires the two drifting renderers). Hero: the
**GroupMe composer** — a rendered paste-ready message (name, date/time/location edit-in-
place, $80 + Venmo, register deep-link) with variant chips (**Registration open · Day-of
info · Bracket live**) and one **Copy for GroupMe** button (GroupMe stays external).
Below: registration OPEN/CLOSE toggle + the team list (paid toggles, roster peek, remove).

## 8. Roles / co-admins (Mike's call: full power)

Organizers = FULL admin including destructive actions (Mike explicitly accepted the risk;
no permission-tier UI). A simple owner-only **Members** page (in the header account menu):
list members, promote/demote organizer. Safety comes from the confirm discipline instead:
every destructive action names exactly what dies; delete-tournament keeps type-to-confirm
(the styled appPrompt, not window.prompt); the server-side action log records who did what.

## 9. Desktop (extends the LOCKED public §13.8 treatment — no separate round)

Same chrome as public at >=1024: top tab strip (Home · Manage · Tournament), full-width
(~1140) content. Hub tiles 4-across; Players = list + detail two-pane; settings groups
two-column; net-card scoring 2-3 cards across; composer + team list side by side.

## 10. Build notes (no-design debts from the recon — fold into the build plan)

Dirty-guard every admin inline board/form against background syncs (the #21/#22 clobber
class) · partialRender() only · remove the unreachable classic Tournament-tab admin branch
(~5605-5748) · collapse duplicate settings/create/registration renderers · persist
state.seedOverride to the DB · relax the edit-roster exact-count validator · deep-link the
registration share · replace window.prompt in operator-safety confirm · "why Generate
isn't showing" hint (one unfinal pool game withholds it silently) · specific confirm copy
on Draw/Reset/Generate · view-as-spectator toggle · tap-a-team roster card on Manage>Teams
· captain-contact field surfacing (plumbed server-side, dead in UI) · per-match net
override · one-shot create+draw+start · paste-a-list batch team add.

## 11. Sequencing (Mike's call)

**Arc 2 (RLS lockdown: retire nlvb2025, role-gated writes via RPCs, repo private + rotate)
runs BEFORE the admin build** — the remake gates on server roles (owner/organizer) as the
only admin source of truth. Co-admin accounts seeded first. The admin build then ships as
reviewed Opus slices against this spec.

## Mockup artifacts (session 6)

scratchpad/admin-r1: r1-{a,b,c} (rejected cockpit concepts) · r1b-{1,2,3} + picks ·
r2close-{a,b,c} · r2bk-{a,b,c} · r2sc-{a,b,c} · r5pl-{a,b,c} · r5st-{a,b,c} ·
r5rg-{a,b,c}; one-page reviews mega-*.html + *-combined.png. §38 markers at heads
8da0e0e/c3450c3; rejections + picks in 12-history task-#20…#22.
