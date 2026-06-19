-- !! The `name NOT LIKE '__as_%'` filter below is BUGGED — `_` is a SQL LIKE wildcard, so it also
-- !! matched real names like "Chase Travers". SUPERSEDED by 0012 (literal `left(name,5) <> '__as_'`).
-- !! Kept for history; the live DB reflects 0012. Read 0012 for the correct version.
-- C22 item 2 — check-in/registration dedup hardening (applied to mlzblkzflgylnjorgjcp 2026-06-19)
-- register_player already dedups (case-insensitive) and anon writes are RLS-locked to the RPC, but
-- the dedup was a select-then-insert (race-prone) with no DB backstop. This adds:
--   (a) a CASE-INSENSITIVE PARTIAL UNIQUE INDEX on (lower(btrim(name)), coalesce(group,'')) over REAL
--       player rows only (excludes the __as_* sentinel rows) — a hard backstop against duplicate
--       people. Verified 0 existing dups (by name and by name+group) over the 215 real rows, so it
--       creates cleanly. Dedup is by (name, group): same name in different groups = different people.
--   (b) register_player now dedups by (name, group) and catches unique_violation (23505) -> returns
--       the existing row instead of erroring, so a concurrent double-register is race-safe.
create unique index if not exists players_real_name_group_uidx
  on public.players (lower(btrim(name)), coalesce("group", ''))
  where name not like '__as_%';

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

  -- dedup by (name, group) over real rows
  select pl.id into v_id from public.players pl
    where lower(btrim(pl.name)) = lower(v_name)
      and coalesce(pl."group",'') = coalesce(v_group,'')
      and pl.name not like '__as_%'
    limit 1;

  if v_id is null then
    begin
      insert into public.players(name, skill, checked_in, "group")
        values (v_name, 0, coalesce(p_checked_in, false), v_group)
        returning players.id into v_id;
      insert into public.action_log(actor, role, action, entity_type, entity_id, detail)
        values ('anon','public','register','players', v_id::text, v_name);
    exception when unique_violation then
      -- a concurrent register won the race; return the row it created
      select pl.id into v_id from public.players pl
        where lower(btrim(pl.name)) = lower(v_name)
          and coalesce(pl."group",'') = coalesce(v_group,'')
          and pl.name not like '__as_%'
        limit 1;
    end;
  end if;

  return query
    select pl.id, pl.name, pl.checked_in, pl."group"
    from public.players pl where pl.id = v_id;
end $$;
revoke all on function public.register_player(text,text,boolean) from public;
grant execute on function public.register_player(text,text,boolean) to anon, authenticated;
