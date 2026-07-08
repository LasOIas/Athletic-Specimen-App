-- 0035_community_id_scoping — add community_id to every data table.
-- NOT NULL DEFAULT <community>: existing rows backfill to the default (constant default = metadata-only
-- in PG11+), and existing RPC inserts that omit it auto-get it, so nothing breaks. Verified: 233 players,
-- 0 nulls, row counts unchanged. Injects the looked-up id dynamically (not hardcoded).
do $$
declare
  cid uuid;
  t text;
  scoped text[] := array[
    'players','tournaments','teams','team_members','sessions','matches',
    'pools','attendance_sessions','check_ins','groups','scoring_presets','live_state'
  ];
begin
  select id into cid from public.communities where slug = 'athletic-specimen';
  if cid is null then raise exception 'community not seeded'; end if;
  foreach t in array scoped loop
    execute format(
      'alter table public.%I add column if not exists community_id uuid not null default %L references public.communities(id)',
      t, cid
    );
  end loop;
end $$;
