# Tournament — Phase 3: Seeding + Double-Elim Generation (Implementation Plan)

> **For agentic workers:** Execute inline. Steps use `- [ ]`. This phase is PURE LOGIC — the gate is exhaustive invariant tests, not UI.

**Goal:** From pool standings, deterministically seed all teams (rank by win% → point-diff) and generate a complete double-elimination bracket (winners + losers + grand final, with a skippable reset and byes for non-power-of-2 fields), wiring every match's winner/loser advancement pointers. Then persist the generated bracket to `matches` (phase='main'). No bracket rendering yet (that's Phase 4).

**Architecture:** Pure functions in `public/app.js`: `computeSeeding(teams, matches)` and `generateDoubleElim(seedCount)` (returns abstract match descriptors keyed by seed numbers + advancement pointers; byes for seeds beyond N are pre-resolved). A thin `tdbGenerateBracket(tournament)` maps seeds→team ids and inserts the `matches` rows; an admin "Generate Bracket" button when pool play is complete.

**Tech Stack:** Vanilla JS, Supabase. Tested via browser-asserted invariants (no node test runner in this app).

## Global Constraints
- Bump `APP_VERSION` (`'2026.06.18.1'`).
- `node --check` after every edit. Branch `feat/tournament-brackets`.
- Bracket math is DETERMINISTIC — never an LLM. Pure, reproducible, tested.

## The double-elim construction (reference)
- `B = nextPow2(N)`; `K = log2(B)`. Pad seeds N+1..B as BYE.
- **WB:** round 1 = `seedOrder(B)` pairings (B/2 matches); rounds 2..K consolidate winners. WB final winner → Grand Final slot A.
- **LB:** alternating minor/major rounds. LB R1 = WB R1 losers paired (B/4 matches). Major round w pairs prior LB winners with WB round-w losers (reversed, to delay rematches); a minor round halves LB survivors between majors. LB final winner → Grand Final slot B.
- **GF:** WB finalist vs LB finalist; if reset enabled and the LB-side team wins, a reset match (`GF2`) decides it.
- **Byes:** a WB R1 slot with seed>N auto-advances the real team; cascades through the LB (bye sources auto-advance the other side). Pre-resolved at generation; bye matches flagged so the renderer skips them.

## Invariants the tests MUST assert (the gate)
For N in {2,4,8,16, 3,5,11,24}:
1. Every real seed (1..N) appears as a WB entrant exactly once.
2. No match has the same team/seed on both sides.
3. Real-match count is sane: a no-reset double-elim has 2N-2 *decisive* games (byes don't count); assert total real matches == 2N-2 (or the bye-adjusted equivalent), GF present, +1 if reset.
4. Every non-terminal match's `winner_next` resolves to a real match + slot.
5. Every WB match that isn't the WB final has a `loser_next` into the LB (or its loser is a bye).
6. Two-lives property: tracing every seed, it is only eliminated after losing twice (one WB loss routes it into the LB; a second loss ends it). No seed is unreachable.
7. Exactly one GF (two grand_final matches if reset); WB finalist + LB finalist feed it.

## Tasks
- [ ] **Task 1:** `nextPow2`, `seedOrder(B)` (recursive), `computeSeeding`. Browser-assert: seedOrder(8)=[1,8,4,5,2,7,3,6]; seeding ranks by win% then point-diff (unequal-pool case).
- [ ] **Task 2:** `generateDoubleElim(seedCount)` with bye pre-resolution. Browser-assert ALL invariants above for every N in the set. Iterate until green.
- [ ] **Task 3:** Adversarial verification — independent check (subagent) that the N=24 output is a valid double-elimination (2 lives, no self-match, consistent pointers). Fix anything it flags.
- [ ] **Task 4:** `tdbGenerateBracket(tournament)` — compute seeding from the active tournament's pool matches, assign `teams.seed`, generate the bracket, insert `matches` (phase='main', side, round, slot, source_a/source_b, team_a/b where known, winner_next/loser_next, version 0), set `tournament.status='bracket'`. Admin "Generate Bracket" button (shown when all pool matches are final). DB-verify the inserted graph. Bump version, commit, push, history, vault, mark task done.

## Self-review (done)
- Spec coverage: spec §7 (deterministic seeding + double-elim generation incl. reset + byes), §6 (matches columns: side/round/source/next pointers). Rendering is Phase 4. ✓
- Placeholder scan: construction + invariants concrete; code written at execution. ✓
- Scope: pure generation + persist; rendering deferred to Phase 4. ✓
