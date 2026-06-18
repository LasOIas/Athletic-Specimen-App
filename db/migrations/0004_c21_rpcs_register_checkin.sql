-- C21 Phase 1 / Task 3 — anon-write RPCs (applied to mlzblkzflgylnjorgjcp 2026-06-18)
-- SECURITY DEFINER so they remain the only anon write path once RLS is locked (Phase 3).
-- NOTE: submit_match_score is intentionally NOT here yet — it must also replicate bracket
-- winner/loser advancement (winner_next/loser_next + grand-final reset) before it's safe under
-- locked RLS; that gets its own focused migration. register_player + check_in are complete.

create or replace function public.register_player(p_name text, p_group text default '')
returns public.players language plpgsql security definer set search_path=public as $$
declare r public.players;
begin
  if coalesce(btrim(p_name),'')='' then raise exception 'name required'; end if;
  select * into r from public.players where lower(btrim(name))=lower(btrim(p_name)) limit 1;
  if found then return r; end if;                      -- idempotent: already registered
  insert into public.players(name, skill, checked_in, "group")
    values (btrim(p_name), 0, true, coalesce(p_group,'')) returning * into r;
  insert into public.action_log(actor, role, action, entity_type, entity_id, detail)
    values ('anon','public','register','players', r.id::text, r.name);
  return r;
end $$;

create or replace function public.check_in(p_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.players set checked_in=true where id=p_id;
  if not found then raise exception 'player not found'; end if;
  insert into public.action_log(actor, role, action, entity_type, entity_id)
    values ('anon','public','check_in','players', p_id::text);
end $$;

revoke all on function public.register_player(text,text) from public;
revoke all on function public.check_in(uuid) from public;
grant execute on function public.register_player(text,text) to anon, authenticated;
grant execute on function public.check_in(uuid) to anon, authenticated;
