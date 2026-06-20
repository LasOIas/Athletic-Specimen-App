# Full-App Screen Redesign — Design Spec

**Date:** 2026-06-20
**Status:** DESIGN — 3 priority screens locked via §38; Session + Tournament/Bracket §38'd at build. Awaiting Mike's spec review → `superpowers:writing-plans`.
**Supersedes/extends:** C26 (design system + two-surface shell — COMPLETE, live v2026.06.19.22). **Absorbs C27's UI** (the tap-your-name self-serve check-in). New build batch (proposed **C36**).

## Mike's ask (verbatim)
> "I'm liking what we are doing to the ui but I want to change every page not just the home page, but all of the app. I want it all to look the same and good, easy to read what is going on and especially easy to use, for one the scrolling, there is a lot of scrolling."
> (on scope) "I know there will be scrolling that's inevitable so I just want to make the app the best version with all its features."
> (on depth) chose **"Full rethink of every screen"** (redesign each screen's structure to the ideal, incl. pulling the tap-your-name check-in forward).
> (on process) "your supposed to show me 3 different versions per thing... You've been getting lazy with not following the skill fully" → **§38 three distinct layouts per screen, every screen** (rulebook §38 reinforced 2026-06-20).

## Goal
Bring **every** screen up to the direction-A look that's already live on Home / Live Scores / Dashboard / Co-pilot —
consistent, easy to read, especially easy to use — **keeping every existing feature**, and reducing scrolling where
it's a natural win (not by removing features). The "best version" of the app.

## Design system (already built — C26, reuse as-is)
direction-A "Clean Light": warm-stone oklch tokens, Inter (body) + Sora (brand/headings/numbers), one muted-blue
accent, `--live` green, `--warn` amber, `--live-soft` pill tint, 16/13/9px radii, one soft shadow, inline SVG icons,
no neon, no emoji. Component classes from C26: `.ph-* .court-row .ad-* .prow .chip .av` etc. The slim status-strip
header + per-surface 4-item nav are live. This spec REUSES that system; it does not change tokens.

## Scope — every screen

**Already done (C26 — no rework unless a gap surfaces):** public Home, Live Scores; admin Dashboard, Co-pilot
(placeholder). The slim header + bottom nav.

**This batch — redesigned (structure, not just skin):**
1. **Players roster (admin)** — design LOCKED (§38 → **A**).
2. **Check In (public)** — design LOCKED (§38 → **B**). Folds C27's UI.
3. **Courts / Teams (admin)** — design LOCKED (§38 → **A**).
4. **Session (admin)** — restyle the form to direction-A; **§38 at build**.
5. **Tournament / Bracket** — restyle pools standings / match list / bracket to direction-A; **§38 at build**.
6. **`checkin.html` (standalone kiosk)** — re-theme dark → light direction-A + the kiosk tap-your-name flow; **§38 at build** (pairs with screen 2).

## Locked per-screen designs (chosen by Mike via §38)

### 1. Players roster (admin) — "A: Dense flat list"
- Slim header → screen title **"Players · N"** + **add (+)** button.
- **Sticky search** + **filter chips** (All / Checked in / Out / Skill / Groups) — replaces the current
  Filter `<select>` + group `<select>` as tappable chips (the Skill chip reveals the skill-range sub-filter;
  the Groups chip opens the group filter/manager).
- **Dense one-line rows** (`.prow` style): avatar (initials) + name + **skill pill** (admin-only) + group +
  a **big In/Out toggle** (tap = check in/out) + **⋮ menu** (Edit / Delete). Selection checkbox appears in a
  select mode (or long-press) for bulk.
- **A–Z jump strip** kept (right edge).
- **Bulk bar floats** at the bottom only when players are selected (Check in / Check out / Add to group /
  Remove from group / Clear) — replaces the always-present inline bulk card.
- **All features kept:** search, all 5 filters, group filter + Manage Groups, per-row check-in/out, edit modal,
  delete (type-to-confirm), bulk ops, A–Z, recent-actions log, pending/optimistic states.

### 2. Check In (public) — "B: Kiosk big-button" (tap-your-name; folds C27)
- Big centered **"Check in"** + "Type your name, then tap it".
- **Large search** (type-ahead over the live roster).
- **Extra-large name buttons** (avatar + name + group) — tap a name = check in; tapping an already-checked-in
  name = check out (toggle); **group shown to disambiguate** same-names (never skill).
- **"I'm new — add me"** → register + check in.
- Confirmation toast. No skill anywhere (rulebook §AS-1).
- **Behavior:** routes through the C21 SECURITY DEFINER RPCs (`check_in`/`check_out`/`register_player`) that
  already back self-serve writes; the **dedup + group-disambiguation** is the substantive C27 logic to get right
  (two players same name → the group + (optionally) initials/photo distinguish; never skill).
- Replaces the current public `tab-players` (name-input + Check In/Out + Register cards). The admin-login entry
  moves to a small, unobtrusive affordance (not a big card on the player screen).

### 3. Courts / Teams (admin) — "A: Run the night (nets first)"
- Screen title **"Courts"**.
- **Team-size chips** (2s / 3s / 4s / 6s, each showing resulting team count) + **Generate teams** button (compact).
- **Live Nets board up top** (the live action): one `.net` card per active court — matchup (Team A vs Team B) +
  **big "Team X Won" buttons** + Clear when recorded; **waiting teams** shown; court order configurable.
- **Generated team cards below** (team #, total skill, player rows) — drag-drop rebalance kept.
- **All features kept:** size-based generate, as-equal generate, fairness summary, drag-drop rebalance (desktop +
  mobile long-press), Live Nets Won/Clear, court order, waiting teams, skill-delta snapshots.

## Per-screen designs to finalize at build (each gets its own §38 three-option round)
- **Session (admin):** the date/time/location form + "what players will see" preview → direction-A card + inputs.
- **Tournament / Bracket:** pools standings table, match list, bracket tree → direction-A tables/cards + the
  phone single-round-focus / wide-screen tree (existing behavior) reskinned. Largest remaining surface.
- **checkin.html:** light re-theme + kiosk tap-your-name (mirror screen 2).

## Constraints (every screen, every increment)
- **Keep every feature** — this is a restructure, not a reduction. If a feature's home moves, it still exists + works.
- **No skill on any public/player surface;** skill stays on the admin roster only.
- **No emoji, no neon;** direction-A tokens only; SVG icons.
- **`partialRender()` for background syncs**, full `render()` only for user actions (no scroll-jump).
- **§38 three distinct layouts** for each screen before it ships (the 3 priority screens are already done).
- **§41 desktop + mobile** in the same change; **iPhone confirm** for anything touching safe-area/gestures.
- **APP_VERSION + SW_VERSION lockstep**, `node --check`, vitest 19/19 (pure.js untouched), commit + push per screen.
- **§30 history file** per shipped screen; **PRODUCT-SURFACE.md** updated.
- The redesign is **shell/skin/structure + the C27 check-in behavior** — no new DB beyond what C27's check-in needs
  (which is already covered by the C21 RPCs); the tap-your-name dedup/disambiguation is the one real behavior addition.

## Architecture / units (where the work lands in `public/app.js`)
- **Roster:** rewrite `adminPlayersHTML()` to the dense-row structure + chip filters + floating bulk bar; reuse
  `renderFilteredPlayers()` (re-templated to `.prow`), the bulk handlers, the edit/delete modals, the A–Z strip.
- **Check In:** replace `publicCheckinHTML()` with the kiosk tap-your-name list + a new type-ahead over `state.players`
  + tap-to-check-in/out wired to the existing RPC paths; add the dedup/disambiguation helper.
- **Courts:** restructure `adminTeamsHTML()` to nets-first; reuse the Live-Nets derivation + team-card + drag handlers.
- **Session / Tournament / checkin.html:** reskin in place to direction-A (Session form, `buildTournamentTabHTML`
  output, the checkin.html markup/theme).
- Each screen is its own shippable increment (one builder + its CSS), like the C26 items.

## Build approach
Screen-by-screen, each a reviewed, shipped-to-`main` increment (the proven C26 cadence): §38 (done for the 3
priority screens; at-build for the rest) → subagent-driven build (opus implementer + reviewer for the complex
ones — roster, check-in, courts, tournament) → controller prod verify (§27 + §41, real admin login, iPhone for
safe-area) → §30 history + vault writeback. Suggested order: **Check In (2) → Players roster (1) → Courts (3) →
Session (4) → Tournament/Bracket (5) → checkin.html (6)** (most-used / highest-value first), or Mike's preference.

## Open questions for Mike (at spec review)
1. **Build order** — start with Check In (the player-facing tap-your-name, highest visibility), or the admin
   Players roster (the worst scroller)? Default proposed: Check In first.
2. **Admin login placement** on the new public Check In screen — a small "Admin" link in the corner / footer
   (vs the current full card)? Default: a small corner link.
3. **Same-name disambiguation** beyond group — add initials/last-name emphasis? (Never skill.) Default: group + full name.

## Self-review
- Placeholders: none — the 3 priority screens have locked, concrete designs; the other 3 have a clear direction +
  an explicit §38-at-build step (not a TBD, a defined process). ✓
- Consistency: all screens use the C26 direction-A system; no token changes; features explicitly preserved per screen. ✓
- Scope: large but decomposed into 6 independent screen-increments, each its own spec-faithful shippable unit. ✓
- Ambiguity: the 3 open questions are flagged for Mike, not silently resolved. ✓
