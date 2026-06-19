-- 0015_c22_attendance_sessions_ROLLBACK.sql
-- Reverts 0015: restores check_in/check_out/register_player to their pre-0015 LIVE bodies
-- (the C21-hardened versions, with NO check_ins maintenance), drops the new functions, and drops
-- the two new tables. Safe only when no real attendance history needs keeping (check_ins is dropped).

-- restore check_in (pre-0015) ----------------------------------------------
create or replace function public.check_in(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  update public.players set checked_in=true where id=p_id;
  if not found then raise exception 'player not found'; end if;
  insert into public.action_log(actor, role, action, entity_type, entity_id)
    values ('anon','public','check_in','players', p_id::text);
end $$;

-- restore check_out (pre-0015) ---------------------------------------------
create or replace function public.check_out(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  update public.players set checked_in=false where id=p_id;
  if not found then raise exception 'player not found'; end if;
  insert into public.action_log(actor, role, action, entity_type, entity_id)
    values ('anon','public','check_out','players', p_id::text);
end $$;

-- restore register_player (pre-0015 hardened body) -------------------------
create or replace function public.register_player(p_name text, p_group text default ''::text, p_checked_in boolean default false)
returns table(id uuid, name text, checked_in boolean, "group" text)
language plpgsql security definer set search_path to 'public' as $$
declare
  v_name  text := btrim(coalesce(p_name, ''));
  v_group text := btrim(coalesce(p_group, ''));
  v_id    uuid;
begin
  if v_name = '' then raise exception 'name required'; end if;
  if length(v_name)  > 80 then raise exception 'name too long (max 80)';  end if;
  if length(v_group) > 80 then raise exception 'group too long (max 80)'; end if;
  select pl.id into v_id from public.players pl
    where lower(btrim(pl.name)) = lower(v_name)
      and coalesce(pl."group",'') = coalesce(v_group,'')
      and left(pl.name, 5) <> '__as_'
    limit 1;
  if v_id is null then
    begin
      insert into public.players(name, skill, checked_in, "group")
        values (v_name, 0, coalesce(p_checked_in, false), v_group)
        returning players.id into v_id;
      insert into public.action_log(actor, role, action, entity_type, entity_id, detail)
        values ('anon','public','register','players', v_id::text, v_name);
    exception when unique_violation then
      select pl.id into v_id from public.players pl
        where lower(btrim(pl.name)) = lower(v_name)
          and coalesce(pl."group",'') = coalesce(v_group,'')
          and left(pl.name, 5) <> '__as_'
        limit 1;
    end;
  end if;
  return query
    select pl.id, pl.name, pl.checked_in, pl."group"
    from public.players pl where pl.id = v_id;
end $$;

grant execute on function public.check_in(uuid)                     to anon, authenticated;
grant execute on function public.check_out(uuid)                    to anon, authenticated;
grant execute on function public.register_player(text,text,boolean) to anon, authenticated;

-- drop the new functions + tables ------------------------------------------
drop function if exists public.start_new_session(text);
drop function if exists public.current_session_id();
drop table    if exists public.check_ins;
drop table    if exists public.attendance_sessions;
