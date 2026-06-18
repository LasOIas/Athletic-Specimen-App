# Tournament — Phase 2: Pools + Self-Serve Pool Play (Implementation Plan)

> **For agentic workers:** Execute inline (superpowers:executing-plans). Steps use `- [ ]`.

**Goal:** Make pool play real and self-serve. Admin draws pools (random + manual adjust) and starts pool play (round-robin matches assigned to nets). Any team, from any phone, picks itself and submits a game result (winner + scores). Standings (W-L → point differential) **auto-tally live** — eliminating the manual pen-and-paper add-up. Concurrency-safe so multiple phones scoring different nets don't collide.

**Architecture:** All in `public/app.js`. Pure, unit-testable logic functions (`generateRoundRobin`, `computeStandings`, `decideWinner`) + `tdb*` data-access (draw pools, generate schedule, submit result with optimistic-concurrency CAS) + UI in the existing `#tab-tournament` panel (admin pool-management view; public/self-serve "pick your team → your matches → submit" view). Realtime: the existing players-channel won't see `matches` changes, so Phase 2 adds a lightweight refresh of tournament data on the existing 15s poll + on tab focus (no new heavy machinery).

**Tech Stack:** Vanilla JS, `@supabase/supabase-js@2.39.5`, Supabase `mlzblkzflgylnjorgjcp`.

## Global Constraints
- Bump `APP_VERSION` (next: `'2026.06.17.2'` if same day, else `'2026.06.18.1'`).
- `node --check public/app.js` after every edit.
- Background syncs → `partialRender()` / surgical updates, never full `render()` unless user action.
- Optimistic concurrency on every `matches` write (CAS on `version`).
- No emojis; match existing style. Branch `feat/tournament-brackets`.

## File structure
- **Modify only:** `public/app.js` — add pure logic fns, `tdb*` schedule/result fns, pool-play UI builders, `tv2-*` handlers for pool actions.

---

## Task 1: Pure logic — round-robin, standings, winner (TDD via browser asserts)

**Produces:**
- `generateRoundRobin(ids: string[]) -> Array<[a,b]>` — every unordered pair exactly once (circle method; handles odd counts with a bye).
- `decideWinner(scoreA, scoreB) -> 'A'|'B'|null` — higher score wins; equal/invalid → null.
- `computeStandings(teams, matches) -> Array<{teamId,name,wins,losses,pointsFor,pointsAgainst,pointDiff,rank}>` — only `final` pool matches count; rank by wins desc then pointDiff desc then name.

- [ ] Write the three functions (pure; no DOM/DB).
- [ ] `node --check` → PASS.
- [ ] Browser-assert via `evaluate_script`: round-robin of 6 ids → 15 unique pairs, each id in 5 matches; of 5 ids → 10 pairs; `computeStandings` on a hand-made match set returns the expected ranking incl. a point-diff tiebreak; `decideWinner(25,21)='A'`, `(20,25)='B'`, `(25,25)=null`. Commit.

## Task 2: Draw pools + generate schedule (data layer)

**Produces:**
- `tdbDrawPools(tournament)` — deletes existing pools+pool-matches for the tournament; creates `pool_count` pools (labels A..); randomly distributes `teams` across pools (shuffle, round-robin assign); sets `teams.pool_id`; sets `tournament.status='setup'` (pools drawn, not yet started). Returns refreshed pools+teams.
- `tdbMoveTeamToPool(teamId, poolId)` — manual adjust (update `teams.pool_id`).
- `tdbStartPoolPlay(tournament)` — for each pool, `generateRoundRobin(teamIdsInPool)` → insert `matches` (phase='pool', pool_id, team_a_id, team_b_id, status='scheduled', version=0); assign `net` + `queue_order` by distributing all pool matches across `net_count` (match k → net `(k % net_count)+1`, queue_order incrementing per net); set `tournament.status='pools'`.
- `tdbListMatches(tournamentId, phase)` and add `tdbRefreshTournaments` to also load `state.tournamentMatches` for the active tournament.

- [ ] Add state: `tournamentPools[]`, `tournamentMatches[]`.
- [ ] Write the `tdb*` fns above. `node --check` → PASS.
- [ ] Browser+MCP verify: create a tournament with 11 teams, draw 3 pools → teams split ~4/4/3, each has a pool_id; start pool play → DB has the right per-pool round-robin match counts (4→6, 4→6, 3→3 = 15), nets assigned 1..3, status='pools'. Re-draw is idempotent (old matches gone). Commit.

## Task 3: Admin pool-play UI (manage + override)

- [ ] When `tournament.status==='setup'` and teams exist: show a **"Draw Pools"** button; after draw, show pools with their teams (each team has a pool dropdown for manual adjust) + a **"Start Pool Play"** button.
- [ ] When `status==='pools'`: show, per pool, a **standings table** (computeStandings) + the pool's matches grouped by net (status chip, score, "up next"); admin can **edit/clear** any result (override) and a **"Reset Pools"** button.
- [ ] Handlers: `tv2-draw-pools`, `tv2-move-team` (select change), `tv2-start-pools`, `tv2-reset-pools`, `tv2-admin-set-result`, `tv2-clear-result`.
- [ ] `node --check`; browser-verify the admin flow at 390px (draw → adjust → start → see standings + matches). Commit.

## Task 4: Self-serve result submission (the core value)

**Produces:** `tdbSubmitResult(match, scoreA, scoreB)` — reads `match.version`; computes winner via `decideWinner`; CAS update `matches set score_a,score_b,winner_team_id,loser_team_id,status='final',version=version+1,updated_at=now() where id=? and version=?`; if 0 rows updated → someone else changed it → reload + surface "another device updated this match, refreshing." Recompute standings from the reloaded matches.

- [ ] Public/self-serve view (non-admin, `status==='pools'`): a **"Pick your team"** selector → shows that team's pool, its matches (opponent, net, status), and for each unplayed match an inline **score entry** (two number inputs + Submit). On submit → `tdbSubmitResult` → standings update live.
- [ ] Admin can also submit the same way.
- [ ] Handler `tv2-submit-result` (reads the two score inputs for that match id).
- [ ] `node --check`; browser-verify at 390px: pick a team, submit a result with scores → match goes final, standings recompute, point-diff correct; submit a stale result (simulate version bump) → conflict handled gracefully; 0 console errors. Cross-check the row in Supabase (score + winner + version). Commit.

## Task 5: Net queue + freshness + verify end-to-end (P3)

- [ ] "Up next per net" view: group `status!=='final'` matches by net, ordered by `queue_order`; the first is "Up next", rest "In queue".
- [ ] Freshness: extend the 15s poll + focus hook to also `tdbRefreshTournaments()` + surgical re-render of the tournament panel when that tab is active (so a second phone's submission shows up). Use a targeted re-render, not full `render()`, to preserve scroll.
- [ ] Bump `APP_VERSION`. Full 9-question Mike-reading checklist at 390px; screenshots to `.playwright-mcp/`. Confirm no regression on other tabs. Commit, push.
- [ ] Write `12-history/task-#10`, update `Tasks From Claude.md` C4 → DONE, `log.md`, `current.md`. Mark task #10 complete.

## Self-review (done)
- **Spec coverage:** spec §5B (self-serve pool play), §6 (pools/teams/matches usage + concurrency), §7 (deterministic round-robin), §9 (row-level CAS). Seeding/bracket are Phase 3-4. ✓
- **Placeholder scan:** concrete fn signatures + handler names + verification per task. ✓
- **Type consistency:** `generateRoundRobin`/`computeStandings`/`decideWinner`/`tdbSubmitResult` used consistently; matches the Phase-0 columns. ✓
- **Scope:** one phase = pools + pool play + live standings; produces a working, testable, shippable slice. ✓
