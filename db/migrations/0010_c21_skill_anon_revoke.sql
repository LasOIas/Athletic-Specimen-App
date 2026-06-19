-- C21 audit #2 (DB half) — close the player-SKILL anon read leak (applied to mlzblkzflgylnjorgjcp 2026-06-18)
-- Skill is ADMIN-ONLY by hard product rule. anon held a table-wide SELECT grant on players (every
-- column, incl. skill), and the RLS read policy is column-blind, so any anon could read skills via a
-- raw REST call. Replace anon's table-wide SELECT with a COLUMN-scoped SELECT on only the
-- public-safe columns. authenticated (admin) keeps its full SELECT (untouched), so the admin console
-- still reads skill. Applied AFTER the client (v2026.06.18.8) stopped requesting skill on the anon
-- path, so the public players fetch keeps working.
revoke select on public.players from anon;
grant select (id, name, checked_in, tag, "group") on public.players to anon;
-- ROLLBACK (re-expose, only if needed): grant select on public.players to anon;
