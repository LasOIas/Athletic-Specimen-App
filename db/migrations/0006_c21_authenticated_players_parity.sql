-- C21 Phase 2 — authenticated-admin parity on players (applied to mlzblkzflgylnjorgjcp 2026-06-18)
-- Why: every public table uses {public} RLS policies (which cover BOTH anon and authenticated)
-- EXCEPT public.players, whose policies are all scoped to {anon} only (legacy, accreted during
-- the disappearing-player fixes). Phase 2 switches admin login to a real Supabase session
-- (admin_login Edge Function), which makes the admin a JWT 'authenticated' user. Without an
-- authenticated policy on players, an admin would get 0 rows on read and 403 on every write to
-- players (catalog upsert, add/edit/check-in) — caught during Phase 2 local verification.
-- This adds full authenticated access to players (parity with the open anon access), so the app
-- stays fully functional through the expand phase. Anon access is unchanged. Phase 3 (contract)
-- will REPLACE all players policies with the real locked rules (anon -> RPCs only;
-- admin authenticated -> full, group-scoped for group_admins).
create policy "c21 expand authenticated players" on public.players
  for all to authenticated using (true) with check (true);
