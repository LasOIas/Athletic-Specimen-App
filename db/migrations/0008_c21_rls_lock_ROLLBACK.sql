-- C21 Phase 3 ROLLBACK — re-open RLS to the pre-lock state ({public} ALL on every table).
-- Apply ONLY if the lock (0008) breaks a live path that can't be hotfixed immediately. This
-- restores anon direct read/write so the app keeps working while the policy issue is diagnosed.
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
    execute format('create policy "v1 open re-opened" on public.%I for all to public using (true) with check (true)', t);
  end loop;
end $$;
