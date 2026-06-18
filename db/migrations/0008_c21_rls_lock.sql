-- C21 Phase 3 — RLS lock-flip (applied to mlzblkzflgylnjorgjcp 2026-06-18, at a low-traffic window)
-- Removes the open-RLS backstop. The contract:
--   anon (public, no login): SELECT only. Every anon WRITE now goes through the SECURITY DEFINER
--     RPCs (register_player / check_in / check_out / submit_match_score), which are owned by
--     postgres (BYPASSRLS) so they write regardless of these policies. Direct anon writes -> denied.
--   authenticated (admin): full access (SELECT/INSERT/UPDATE/DELETE). generate_bracket_atomic
--     (admin-only, NOT security definer) runs as the authenticated caller and is covered here.
-- Verified prerequisites first: RLS enabled on every table; all 4 write RPCs are SECURITY DEFINER
-- + owner postgres has BYPASSRLS. Pre-req for this flip: Phase 2 (v2026.06.18.7) routed ALL public
-- self-serve writes through the RPCs, so the lock is transparent to the running app.
-- action_log is intentionally left untouched (RLS on, no client policy; only the RPCs write it).
-- Rollback: db/migrations/0008_c21_rls_lock_ROLLBACK.sql (re-opens to {public} ALL).
do $$
declare
  t text;
  pol record;
  tables text[] := array['players','matches','pools','teams','team_members','tournaments','sessions'];
begin
  foreach t in array tables loop
    for pol in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "c21 anon read" on public.%I for select to anon using (true)', t);
    execute format('create policy "c21 admin all" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
