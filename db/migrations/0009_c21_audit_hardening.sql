-- C21 Phase 4 / security-audit hardening (applied to mlzblkzflgylnjorgjcp 2026-06-18)
-- Closes audit findings #5/#6/#8/#9 (the DB-layer ones that need no client coordination):
--   #5 register_player returned the FULL players row (incl. skill) to anon -> narrow to a
--      skill-free projection (id, name, checked_in, group). Client only reads .id, so no app change.
--   #6 register_player had no input bounds -> cap name/group length (mass-insert rate-limiting is
--      infra, tracked separately; this bounds payload size).
--   #8 generate_bracket_atomic was EXECUTE-grantable to anon/PUBLIC (a destructive admin-only fn)
--      and had an unpinned search_path -> revoke from anon+PUBLIC (keep authenticated), pin search_path.
--   #9 anon held full INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER grants on every locked table
--      (the lock rested entirely on RLS) -> revoke all but SELECT. The 4 anon-write RPCs are SECURITY
--      DEFINER owned by postgres (BYPASSRLS) so they still write; anon SELECT (public reads) preserved.
-- NOTE: the player-SKILL anon READ leak (#2) is fixed in 0010 AFTER the client stops requesting skill,
-- to avoid breaking the public players fetch. Idempotent. Rollback notes at the bottom.

-- ---- #5 + #6: register_player skill-free return + input caps -------------------------------------
drop function if exists public.register_player(text, text, boolean);
create function public.register_player(p_name text, p_group text default '', p_checked_in boolean default false)
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

  -- idempotent: reuse the existing player if the name already exists
  select pl.id into v_id from public.players pl
    where lower(btrim(pl.name)) = lower(v_name) limit 1;

  if v_id is null then
    insert into public.players(name, skill, checked_in, "group")
      values (v_name, 0, coalesce(p_checked_in, false), v_group)
      returning players.id into v_id;
    insert into public.action_log(actor, role, action, entity_type, entity_id, detail)
      values ('anon','public','register','players', v_id::text, v_name);
  end if;

  return query
    select pl.id, pl.name, pl.checked_in, pl."group"
    from public.players pl where pl.id = v_id;
end $$;
revoke all on function public.register_player(text,text,boolean) from public;
grant execute on function public.register_player(text,text,boolean) to anon, authenticated;

-- ---- #8: generate_bracket_atomic is admin-only -> not anon-executable, pin search_path -----------
revoke execute on function public.generate_bracket_atomic(uuid, jsonb, jsonb) from public, anon;
grant  execute on function public.generate_bracket_atomic(uuid, jsonb, jsonb) to authenticated;
alter function public.generate_bracket_atomic(uuid, jsonb, jsonb) set search_path = public;

-- ---- #9: strip anon's latent table DML grants (defense-in-depth; RLS + SECURITY DEFINER RPCs stay) -
do $$
declare t text; tables text[] := array['players','matches','pools','teams','team_members','tournaments','sessions'];
begin
  foreach t in array tables loop
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from anon', t);
  end loop;
end $$;

-- ROLLBACK (only if needed):
--   #9: grant insert,update,delete,truncate,references,trigger on public.<each table> to anon;
--   #8: grant execute on function public.generate_bracket_atomic(uuid,jsonb,jsonb) to anon;
--   #5/#6: restore the prior register_player from 0007 (returns public.players).
