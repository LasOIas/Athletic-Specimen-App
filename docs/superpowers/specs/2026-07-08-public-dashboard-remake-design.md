# Public Dashboard Remake — Design Spec

**Date:** 2026-07-08
**Status:** design (awaiting Mike's review → then writing-plans)
**Program:** first of a multi-part platform remake — Public dashboard (this) → Identity & Accounts → Multi-sport SportPack → Admin dashboard → AI Co-pilot.
**Grounding:** 2026-07-08 competitor audit — vault `13-upgrade-options/2026-07-08-competitor-audit-and-dashboard-remake.md`.

---

## 1. Goal

Remake the Athletic Specimen **public (player/spectator-facing) surface** into a complete, best-in-class dashboard where any player can find almost anything about a session/tournament, keeping the tiles + bottom-nav pattern.

**Strategic frame (audit):** A.S wins by owning the seam nobody touches — the effortless, ad-free, glanceable feel of a consumer live-score app applied to a live, self-run, multi-sport pickup night fused with a real bracket engine. The flagship differentiator is the **personal "you're up next on Net X" surface for a pickup queue** — lead with it. Skill ratings stay **private** (never public) and fairness is expressed qualitatively.

## 2. Scope

**In:** public **Home**, **My Team**, **Standings**, **History & records**; the **tournament entry gateway** (spectate vs account-to-play); signed-out spectator states; the header **sport-switcher**; the public bottom-nav.

**Out (separate specs / reuse):**
- The **accounts/identity system** itself (Supabase Auth, RLS rewrite, roles, claim-player) — this spec *consumes* it.
- The **multi-sport SportPack** data model — consumed here, specced separately.
- **Admin dashboard**, **AI Co-pilot** — separate tracks.
- **Live Bracket tree** — reuse the existing `buildBracketHTML` tree; a future **cast/TV big-screen mode** is noted (audit: beats Challonge) but not specced here.
- **Check-In kiosk** — reuse the existing kiosk; becomes account-aware later.

## 3. Dependencies (prerequisites)

- **Identity & Accounts (task #2):** the personal features — My-Night hero, My Team, claim-your-team, "your record" — require an authenticated + claimed player. **Build the spectator/live parts first (no auth); light up the personal parts when accounts land.**
- **Multi-sport SportPack (task #3):** the header sport-switcher + a `sportId` on every check-in/team/court/match/bracket node. Build sport-agnostic where cheap; the switcher is inert (single default sport) until SportPack exists.

## 4. Design system (non-negotiable)

- Direction-A tokens: warm-stone bg, muted-blue `--accent`, muted-green `--live`; Inter body / Sora headings; inline SVG icons.
- **§51 no neon; §11 no emoji; §27 plain English + true data.**
- **Vocabulary:** NEVER "night / tonight / your night" — name the tournament (by name), the session/date, "your team", "your games" (mike-preferences, 2026-07-08).
- **§41:** ship desktop + mobile in the same change. Phone-first; large thumb targets; zero horizontal scroll.
- **Architecture rule:** `partialRender()` for background syncs, `render()` only for user actions (mobile scroll-jump prevention).

## 5. Information architecture

- **Bottom nav (public): Home · Check In · Live** (3 items). Standings / Bracket / My Team / History are reached via Home tiles + the Live tab — keep the nav to three.
- **Header:** brand (left) + **sport-switcher pill** + account state (person icon when signed-in). In a tournament context the account entry is reframed as **"claim your team"** rather than a generic "Sign in".
- **Sport switcher:** persistent top-bar pill; sport is a *context* that re-skins stable tabs, never a separate nav destination; future "All sports tonight" aggregate for a night running two sports.

## 6. Screens (locked layouts)

### 6.1 Home — Option A hybrid, led by the personal hero
- **Signed-in player:** personal hero card (tournament NAME → your team → "Your team · Pool B" → **"You're up next — Net 2 · vs Ballin · ~10 min"** accent card; **no teammate bubbles**) → live **"On the courts"** board (other games, LIVE/FINAL tags) → **tile grid** (Standings [you're 2nd] · Bracket [Round of 8] · My Team [Roster · your games] · History [Past tournaments]).
- **Signed-out spectator:** the **same shell minus the personal hero**; in its place a claim/check-in prompt tied to the active tournament, then the live board + tiles.
- **Data:** active tournament; your claimed team + next match + record; live matches; standings summary.
- **Mock:** `mockups/home-final.html`.

### 6.2 My Team — Option B (stat hero + toggle)
- Stat hero (**Record / Pt-diff / Seed**) + "up next" strip + a **Games ↔ Roster** segmented toggle. Games = your games log (W/L + scores; may use the timeline treatment). Roster = named teammates (you tagged). Tournament-named header.
- **Data:** your team, record, point diff, seed, roster (names), match results + next match.
- **Mock:** `mockups/myteam.html` (Option B).

### 6.3 Standings — Option A (by pool + toggle)
- Per-pool ranked mini-tables (rank, team, W-L, diff; your team highlighted with a "You" tag) + a **Pools ↔ Overall-seeding** toggle. Overall = cross-pool seed list with "seeded by win% then diff; top 8 make bracket". **Fairness qualitative; no ratings.**
- **Data:** pools + standings from existing `computeStandings` / `computeSeeding`; your team id for the highlight.
- **Mock:** `mockups/standings.html` (Option A).

### 6.4 History & records — Option C + your-record card
- **Tabbed: Tournaments / Leaderboard / Champions.** Tournaments = your all-time record card (tournaments, titles, finals, win%) + chronological past tournaments (champion + your placement badge). Leaderboard = all-time records (most titles / wins / streak). Champions = champions wall (past event → champion team).
- **Data:** completed past tournaments + per-team/per-player aggregates + your history. **NOTE:** requires historical tournament data retained across events — a data-model item for the accounts/history track.
- **Mock:** `mockups/history.html` (Option C).

### 6.5 Tournament entry gateway — spectate-first + claim-in-card
- Opening a tournament shows the **live spectator board immediately (zero login wall)**. The account step is reframed "sign in" → **"claim your team"**, placed **inside the tournament header card** (treatment C) — no floating dock, no generic sign-in pill.
- Spectators watch **read-only, no account**. An account is required to register / claim / act. **Account unlocks *doing*, not *seeing*.** Auth = Supabase Auth magic-link / Google (Identity track).
- **Mocks:** `mockups/account-mockups.html` (Option 2), `mockups/signin-variations.html` (Option C).

## 7. States & edge cases

- **No active tournament:** Home shows casual live status + next session (named by date, never "night") + check-in CTA.
- **Signed-out:** no personal hero / My Team; claim prompt shown; History + Standings still viewable (public data).
- **Signed-in but unclaimed:** prompt to claim a team/player after sign-in.
- **Multi-sport:** switcher present but single-sport until SportPack; all queries scoped by `sportId`.
- **Cold-start / loading:** gate empty states on a `loaded` flag (don't flash a definitive empty state before first sync).

## 8. Success criteria / verification

- Renders on mobile 390 + desktop, **0 console errors**, matching the locked mockups.
- **No skill/ratings on any public surface; no "night" language; no emoji; no neon.**
- A signed-out spectator can watch live **read-only with no account**.
- Personal surfaces show accurate **claimed-player** data (once accounts land).
- Cross-check one rendered value against the DB (§27); verify through the connected browser (§40), desktop + mobile (§41).

## 9. Open questions (routed to the foundation specs — not blockers here)

- History **data-retention model** (aggregates across tournaments) — accounts/data track.
- Exact **roles/permissions** — identity track.
- **SportPack** shape (family + label-map + scoring/tiebreaker presets) — multi-sport track.

## 10. Build sequencing note

Because the personal features depend on accounts, the recommended build order is: **(a)** the sport-agnostic spectator/live shell of Home + Standings + History-scaffold (no auth) — shippable early for a real win; **(b)** Identity & Accounts; **(c)** wire the personal hero + My Team + claim-team on top. This spec defines the target; the implementation plan (writing-plans) will slice it.

---

**Mockup source:** the `mockups/` paths referenced above resolve to `./2026-07-08-public-dashboard-mockups/` (locked HTML mockups rendered with the real design tokens). Regenerate PNGs by opening them in a browser at ~1240px wide.

---

## Personal layer (Slice 3) — LOCKED layouts (2026-07-09, Mike's §38 picks)

Designed after Identity/Accounts landed (email+password sign-in live v2026.07.08.5). Three rendered §38 rounds; Mike's picks:

- **Home "you're up next" personal hero → Option C "Your run" (timeline).** A compact team header (name · Pool · record) then a vertical timeline: last result (done, muted-green) → **UP NEXT** node (accent, highlighted: "Net 2 · vs <opp> · ~8 min") → then (faint). Sits at the top of Home when signed-in + claimed; signed-out shows the shell minus the hero + a claim prompt.
- **My Team → Option B "big-record scoreboard".** Centered eyebrow (tournament · Pool · Seed) → team name (Sora) → dominant `W–L` record (Sora 44px) with W/L pips → up-next strip → **Games ↔ Roster** segmented toggle (Games = results log with W/L badges + scores; Roster = named teammates, "You" tag).
- **Claim-your-team → Option A "search your name".** Reuses the Check-In kiosk pattern: search field → tap your name (avatar + name + team) → confirm ("Claim my spot" / "Not me") → **"Claim sent — pending your organizer's OK."** Organizer approval gates it. Reached from the Home claim prompt / tournament card (signed-in) or after sign-in if unclaimed.

**Mockups (scratchpad, this session):** `home-hero-options.html`, `myteam-options.html` / `myteam-B-fonts.html`, `claim-options.html`.

**Build prerequisite (NOT yet built):** the claim data-link — `claim_player` / `approve_claim` RPCs + the team↔player link (`team_members` at registration + a one-time backfill of the existing 18 teams' jsonb rosters) = **Task 6 of `2026-07-08-identity-auth-app-integration.md`**. Until that lands, these screens have no "which player is you" source. Build order: (1) claim plumbing (auth Task 6) → (2) claim flow UI (A) → (3) Home hero (C) + My Team (B) wired to `claimed_by_profile`.

**Mockup fidelity rule:** every mockup MUST load the app's Google Fonts (Inter 400–800 + Sora 600–800) — a mockup that only names the families renders a system fallback and reads as off-brand.
