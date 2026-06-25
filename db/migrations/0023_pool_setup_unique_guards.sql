-- 0023_pool_setup_unique_guards.sql
-- Wave 1c (2026-06-25) — close the pool draw/start race (C20-C64 audit, HIGH finding).
--
-- tdbDrawPools / tdbStartPoolPlay (public/app.js) guarded only with a client-side TOCTOU status
-- read across separate auto-committed requests, and the matches/pools tables had no unique
-- constraint. A double-tap or two admin devices could both read status='setup' and both INSERT,
-- silently doubling the pool schedule with no error surfaced. Same class of race already fixed for
-- the bracket in 0022 (generate_bracket_atomic row-lock).
--
-- Fix = defense in depth: (1) an in-flight guard in app.js (no-op re-entry) kills the common
-- double-tap; (2) these partial unique indexes are the DB-level guarantee — any concurrent
-- duplicate INSERT fails cleanly instead of corrupting the schedule.
--
-- Pre-apply verification (prod, 2026-06-25): 0 duplicate pool matches, 0 duplicate pool labels,
-- so the indexes build without a dedupe step. Idempotent (IF NOT EXISTS). Additive — no data
-- touched, no behavior change to the normal delete-then-insert pool flow.

-- one row per (team_a, team_b) pairing per pool within a tournament's pool phase
create unique index if not exists matches_pool_pair_uq
  on matches (tournament_id, pool_id, team_a_id, team_b_id)
  where phase = 'pool';

-- one pool per label (A/B/C...) per tournament
create unique index if not exists pools_tournament_label_uq
  on pools (tournament_id, label);
