-- 0047_tournament_announcement.sql — persisted, editable GroupMe announcement per tournament
-- (session-10 pick R7, Mike 2026-07-11). The Manage → Tournament → Registration view leads with an
-- editable text box that saves here (tdbSetTournamentFields) and a "Copy for GroupMe" CTA. When this
-- column is null/absent the client COMPOSES a default from the tournament's real fields (name, buy_in,
-- team_size), so the Registration view renders a sensible draft even before this migration lands.
-- One nullable text column on public.tournaments; anon-readable via the existing tournaments select
-- grant/policy (no new policy needed — reads only, writes go through the authenticated update path).
-- Applied to prod by the CONTROLLER via Supabase MCP (builders never apply). Baseline verified after.
alter table public.tournaments add column if not exists announcement text;
