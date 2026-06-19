-- C22 item 2 FIX — correct the sentinel filter from a LIKE-wildcard to a literal prefix
-- (applied to mlzblkzflgylnjorgjcp 2026-06-19). Supersedes the filter in 0011.
-- BUG: 0011 used `name NOT LIKE '__as_%'` to mean "real players, not the __as_ sentinel rows", but in
-- SQL LIKE the underscore is a WILDCARD, so the pattern matched real names like "Chase Travers"
-- (positions 3-4 = 'a','s'). Effect: such players were WRONGLY excluded from the dedup unique index
-- (no duplicate protection) and from register_player's dedup (a 2nd "Chase Travers" could be created).
-- FIX: use the literal first-5-chars test `left(name,5) <> '__as_'` (all sentinel prefixes —
-- __as_group__:, __as_groups__:, __as_tournament_state__ — share the literal 5-char prefix '__as_').
-- Verified: true real-player count is 212 (not 211); 0 duplicates over the corrected real set.

drop index if exists public.players_real_name_group_uidx;
create unique index if not exists players_real_name_group_uidx
  on public.players (lower(btrim(name)), coalesce("group", ''))
  where left(name, 5) <> '__as_';

create or replace function public.register_player(p_name text, p_group text default '', p_checked_in boolean default false)
returns table(id uuid, name text, checked_in boolean, "group" text)
language plpgsql security definer set search_path=public as $$
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
revoke all on function public.register_player(text,text,boolean) from public;
grant execute on function public.register_player(text,text,boolean) to anon, authenticated;
