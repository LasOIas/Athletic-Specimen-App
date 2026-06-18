-- C21 Phase 1 / Task 2 — tournaments.group for group-scoped admin (applied 2026-06-18)
-- Additive + idempotent. Backfill not needed (0 tournament rows at apply time).

alter table public.tournaments add column if not exists "group" text;
