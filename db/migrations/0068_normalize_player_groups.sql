-- 0068_normalize_player_groups.sql: empty the group column and make register_player group-blind, one
-- deploy BEFORE the client stops sending p_group.
--
-- Mike (2026-08-29): "remove the groups from the app, we dont even use it." The removal is two files and
-- this is the first. It drops NOTHING: no column, no table, no signature. It exists so the window between
-- the client change and the drop cannot create a duplicate person on a live roster.
--
-- WHY. The live register_player (0020_group_null_normalize.sql:39-44) dedups on
--   lower(btrim(pl.name)) = lower(v_name) and coalesce(pl."group",'') = coalesce(v_group,'')
-- Both anon doors send 'Athletic Specimen' today (public/checkin.html:539, public/app.js:9786, sharing
-- CLUB_GROUP at public/supabase-config.js:12, whose comment at :8-11 records the exact bug it prevents).
-- Change only one side of that comparison, in either direction, and the dedup misses: the insert is
-- permitted because players_real_name_group_uidx keys on (lower(btrim(name)), coalesce("group",'')) (0012),
-- and the same person becomes two rows with split attendance. Emptying the column AND making the function
-- ignore the parameter changes both sides at once, so old and new clients behave identically.
--
-- STEP 1 is a GATE ON THE ROUND OPENING, not a formality at the end: if two real rows already share a name,
-- the round STOPS here and Mike decides which row survives, before the tournament rather than after.
-- STEP 2 is the ONLY record of the group values that will exist once 0069 commits. It is pasted verbatim
-- into the round's history file. Nothing else preserves them.
--
-- ROLLBACK: re-apply the register_player body in 0020_group_null_normalize.sql verbatim (same signature,
--   so a plain create or replace), then restore the values from the STEP 2 capture:
--   update public.players set "group" = <captured> where id = <captured id>;
--   Nothing is dropped by this file, so the rollback is a function body plus a data restore.
--
-- NOT YET APPLIED (the controller applies it before the first client push) via the Supabase MCP
-- (apply_migration), the check-in pop-ups round.

-- STEP 1. Run alone. READ the result. Zero rows required, or the round stops.
--   select lower(btrim(name)) as nm, count(*) as c
--     from public.players
--    where left(name, 5) <> '__as_'
--    group by 1 having count(*) > 1;

-- STEP 2. Run alone. Save the output VERBATIM into 12-history before running STEP 3.
--   select id, name, "group" from public.players where "group" is not null order by name;

-- READ-BACKS. Run after STEP 3 and STEP 4 are applied. Record every result in the round's history file.
--   select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'register_player';
--     -- exactly one row, still register_player(text,text,boolean): no overload, no signature change
--   select count(*) from public.players where "group" is not null;      -- 0
--   select count(*) from public.players where left(name,5) <> '__as_';  -- unchanged from before STEP 3
--
--   Then the live smoke on a throwaway name, which is the whole point of this file. The old three-key
--   call and the new two-key call must return the SAME id. Both are written the way PostgREST sends
--   them, by NAME, because a positional two-argument call would try to read the boolean as p_group:
--     select * from public.register_player(p_name => 'Zz Smoketest', p_group => 'Athletic Specimen',
--                                          p_checked_in => false);
--     select * from public.register_player(p_name => 'Zz Smoketest', p_checked_in => false);
--     select count(*) from public.players where lower(btrim(name)) = lower('Zz Smoketest');  -- 1
--     delete from public.players where lower(btrim(name)) = lower('Zz Smoketest');

-- STEP 3. Every real row moves into the one slot a group-blind call will use. 0020's normalize trigger
-- already turns '' into NULL on write, so NULL is the canonical empty and coalesce("group",'') = '' holds
-- for every row afterwards.
update public.players set "group" = null where "group" is not null;

-- STEP 4. register_player, SAME three-argument signature, group-blind. p_group is still accepted so every
-- deployed client keeps working unchanged; it is ignored for the dedup and never written. The return
-- columns are unchanged too (the "group" column now always reads NULL), so no client's response parsing
-- moves. Body is 0020's with the group terms removed from the lookup and the insert.
create or replace function public.register_player(p_name text, p_group text default ''::text, p_checked_in boolean default false)
returns table(id uuid, name text, checked_in boolean, "group" text)
language plpgsql security definer set search_path to 'public' as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_id   uuid;
  v_actor text; v_role text; v_grp text;
begin
  if v_name = '' then raise exception 'name required'; end if;
  if length(v_name) > 80 then raise exception 'name too long (max 80)'; end if;

  select pl.id into v_id from public.players pl
    where lower(btrim(pl.name)) = lower(v_name)
      and left(pl.name, 5) <> '__as_'
    limit 1;

  if v_id is null then
    begin
      insert into public.players(name, skill, checked_in)
        values (v_name, 0, coalesce(p_checked_in, false))
        returning players.id into v_id;
      select a.actor, a.role, a.grp into v_actor, v_role, v_grp from public._audit_actor() a;
      insert into public.action_log(actor, role, grp, action, entity_type, entity_id, detail)
        values (v_actor, v_role, v_grp, 'register', 'players', v_id::text, v_name);
    exception when unique_violation then
      select pl.id into v_id from public.players pl
        where lower(btrim(pl.name)) = lower(v_name)
          and left(pl.name, 5) <> '__as_'
        limit 1;
    end;
  end if;

  if coalesce(p_checked_in, false) then
    update public.players set checked_in = true where players.id = v_id;
    insert into public.check_ins(session_id, player_id)
      values (public.current_session_id(), v_id)
      on conflict (session_id, player_id) do nothing;
  end if;

  return query
    select pl.id, pl.name, pl.checked_in, pl."group" from public.players pl where pl.id = v_id;
end $$;
revoke all on function public.register_player(text, text, boolean) from public;
grant execute on function public.register_player(text, text, boolean) to anon, authenticated;
