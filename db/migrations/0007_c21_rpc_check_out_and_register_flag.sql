-- C21 Phase 2 / Task 6 — complete the anon-write RPC surface (applied to mlzblkzflgylnjorgjcp 2026-06-18)
-- (1) check_out: the plan's 3 RPCs (register/check_in/submit_match_score) missed public
--     self-serve check-OUT — needed by the per-card check-out toggle and the by-name public
--     check-out. Mirror of check_in (sets checked_in=false, logs).
-- (2) register_player: add p_checked_in so both register surfaces keep their CURRENT behavior
--     exactly once routed through the RPC: the public app.js "Register" leaves the player checked
--     OUT (a separate Check In step follows), while the QR kiosk "Register & check in" checks them
--     IN. The old 2-arg signature is dropped first to avoid an ambiguous-overload call.

create or replace function public.check_out(p_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.players set checked_in=false where id=p_id;
  if not found then raise exception 'player not found'; end if;
  insert into public.action_log(actor, role, action, entity_type, entity_id)
    values ('anon','public','check_out','players', p_id::text);
end $$;

drop function if exists public.register_player(text, text);
create or replace function public.register_player(p_name text, p_group text default '', p_checked_in boolean default false)
returns public.players language plpgsql security definer set search_path=public as $$
declare r public.players;
begin
  if coalesce(btrim(p_name),'')='' then raise exception 'name required'; end if;
  select * into r from public.players where lower(btrim(name))=lower(btrim(p_name)) limit 1;
  if found then return r; end if;                      -- idempotent: already registered
  insert into public.players(name, skill, checked_in, "group")
    values (btrim(p_name), 0, coalesce(p_checked_in,false), coalesce(p_group,'')) returning * into r;
  insert into public.action_log(actor, role, action, entity_type, entity_id, detail)
    values ('anon','public','register','players', r.id::text, r.name);
  return r;
end $$;

revoke all on function public.check_out(uuid) from public;
revoke all on function public.register_player(text,text,boolean) from public;
grant execute on function public.check_out(uuid) to anon, authenticated;
grant execute on function public.register_player(text,text,boolean) to anon, authenticated;
