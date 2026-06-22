-- 0020_group_null_normalize
-- Applied to prod (Supabase mlzblkzflgylnjorgjcp) 2026-06-21 via apply_migration.
-- Normalize players.group: empty-string/whitespace -> NULL (one canonical "ungrouped").
-- A BEFORE INSERT/UPDATE trigger catches ALL write paths (RPC, admin-direct, outbox)
-- so '' cannot return. Safe vs players_real_name_group_uidx: that index uses
-- COALESCE("group",''), so NULL == '' for dedup (no collision created or removed).
-- App is NULL-safe for reads: normalizeGroupName(null) -> '', renders "Ungrouped".

create or replace function public.tg_players_normalize_group()
returns trigger language plpgsql as $$
begin
  new."group" := nullif(btrim(new."group"), '');
  return new;
end;
$$;

drop trigger if exists players_normalize_group on public.players;
create trigger players_normalize_group
  before insert or update on public.players
  for each row execute function public.tg_players_normalize_group();

-- one-time backfill of existing rows (25 rows at apply time)
update public.players set "group" = null
  where "group" is not null and btrim("group") = '';

-- register_player: write NULL (not '') for an empty group; otherwise byte-identical to 0007/prior def
create or replace function public.register_player(p_name text, p_group text default ''::text, p_checked_in boolean default false)
returns table(id uuid, name text, checked_in boolean, "group" text)
language plpgsql security definer set search_path to 'public' as $$
declare
  v_name  text := btrim(coalesce(p_name, ''));
  v_group text := btrim(coalesce(p_group, ''));
  v_id    uuid;
  v_actor text; v_role text; v_grp text;
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
        values (v_name, 0, coalesce(p_checked_in, false), nullif(v_group, ''))
        returning players.id into v_id;
      select a.actor, a.role, a.grp into v_actor, v_role, v_grp from public._audit_actor() a;
      insert into public.action_log(actor, role, grp, action, entity_type, entity_id, detail)
        values (v_actor, v_role, v_grp, 'register','players', v_id::text, v_name);
    exception when unique_violation then
      select pl.id into v_id from public.players pl
        where lower(btrim(pl.name)) = lower(v_name)
          and coalesce(pl."group",'') = coalesce(v_group,'')
          and left(pl.name, 5) <> '__as_'
        limit 1;
    end;
  end if;

  if coalesce(p_checked_in, false) then
    update public.players set checked_in=true where players.id = v_id;
    insert into public.check_ins(session_id, player_id)
      values (public.current_session_id(), v_id)
      on conflict (session_id, player_id) do nothing;
  end if;

  return query
    select pl.id, pl.name, pl.checked_in, pl."group"
    from public.players pl where pl.id = v_id;
end;
$$;
