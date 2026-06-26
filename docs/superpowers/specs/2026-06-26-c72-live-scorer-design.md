# C72 — Live point-by-point spectator scorer (design)

**Date:** 2026-06-26 · **Task:** C72 (Mike ask #5) · **Status:** approved (4 decisions + §38 Option A)

## What Mike asked for
*"I want to add somewhere maybe this goes with how we enter scores but for each game a live scorer that can be done by someone that is just sitting and watching."*

## Decisions (locked with Mike via AskUserQuestion)
1. **Shared live scoreboard** — one person taps the score live; EVERYONE watching sees it update (broadcast via the realtime the app already runs); the board shows the running score.
2. **Tap a game → choose "Score live" or "Enter final score"** — both first-class. "Enter final" = the existing C71 modal (`openBracketResultModal`).
3. **Auto-detect game-over → confirm** — when a team reaches the winning score (target / win-by-2 / cap, via `gameScoreStatus`), pop "Net Ninjas win 21-18 — confirm?" → confirm finalizes + advances.
4. **§38 Option A — "tap the team"** scorer: two big panels, tap a team's whole side for +1, small − to fix, the leader's side glows green.

## Data model (no table migration)
- A live game = `status='live'` with `score_a`/`score_b` as the running score. **`'live'` is already in the `matches.status` CHECK** (migration 0001: `check (status in ('scheduled','live','final'))`) — designed in, never used. No table change.
- **New anon RPC `set_live_score(p_match uuid, p_score_a int, p_score_b int)`** (SECURITY DEFINER, anon EXECUTE — mirrors `submit_match_score`'s grant + `_audit_actor` pattern): `update matches set score_a, score_b, status='live', version=version+1, updated_at=now() where id=p_match and status <> 'final'`. Last-write-wins (no version CAS — smooth rapid tapping; one scorer per game). Refuses to touch a final game.
- **Finalize reuses `submit_match_score`** — verified its update guards `status <> 'final'` (so it finalizes a `'live'` game) and advances the bracket. No change.

## Components
- `tdbSetLiveScore(match, a, b)` — client helper → `set_live_score` RPC.
- `openMatchActionChooser(matchId)` — the tap chooser. If the match is `final` → straight to `openBracketResultModal` (admin edit). Else a small modal: **[Score live]** → `openLiveScorer`; **[Enter final score]** → `openBracketResultModal`.
- `openLiveScorer(matchId)` — §38 Option A: full-screen overlay, two tap panels (whole panel = +1, small − = −1, clamp ≥0), big live score, leader glows. Each change writes via `tdbSetLiveScore` (optimistic local + persist) and re-checks `gameScoreStatus(a, b, scoringRulesFor(phase, t))`; when `valid` → confirm card "X win a-b" → `submit_match_score` (finalize) → close + `render()`. "Enter the final score instead" → close + `openBracketResultModal`. Back/close = leave (the live score persists; the game stays `'live'`).
- **Wire:** `tv2-bracket-open` handler → `openMatchActionChooser` (was `openBracketResultModal`). Covers the C70 pool board rows + bracket nodes.
- **Live score on the board:** for `status='live'` games show the running score + a LIVE pill instead of just "NOW" — in `buildPoolPlayHTML` (C70), `buildBracketNodeHTML`, and `buildPublicTournamentLiveHTML` (was "Playing").

## Concurrency / edge cases
- One scorer per game (Mike's model). Two scorers → last-write-wins on the live score; the final submit is version-CAS guarded.
- Leaving the scorer mid-game keeps the game `'live'` with its running score (resumable — reopen → continue).
- A `'live'` game is `status <> 'final'`, so it stays the "NOW"/current game on its net (C70) and is tappable; `played` counts only `'final'`.

## Testing
- Pure: `gameScoreStatus` (win-detection) already covered. Add a small helper only if needed.
- Live verify on the real app: scorer renders (Option A), +1/−1 update + persist (against a throwaway match), leader glow, win-confirm finalizes + advances, the board shows the running score, chooser routes correctly, "enter final" falls back to C71.

## Out of scope (YAGNI)
- Dedicated `live_score_a/b` columns (reuse `score_a/b` + `status='live'`).
- Multi-scorer conflict resolution beyond last-write-wins.
- A separate "big screen / TV" scoreboard URL (C56, later).
