-- 0065_move_team_out_of_pool.sql: move_team_to_pool accepts a NULL destination, meaning "out of its pool".
--
-- WHY. The team sheet's "No pool" chip un-pools a team. The old direct write accepted a null pool_id;
-- 0064 looks the destination up and refused it ("That pool is not in this tournament."), so the chip
-- went dead the moment the RPC landed (found by the client wiring, 2026-08-26). The un-pool is the same
-- operation with one pool instead of two: refuse if the team's current pool has a final or live game,
-- delete that pool's scheduled games, apply the client's rebuilt plan for it, clear teams.pool_id.
--
-- Everything else in 0064 stands: the tournament row is locked, organizer or owner only, status must be
-- setup or pools, a live game is never deleted, matches_pool_pair_uq cannot fire because the final/live
-- refusal ran first. A team with no pool asked to leave no pool is a no-op that still returns 0.
--
-- APPLIED 2026-08-26 via the Supabase MCP (apply_migration), C101 inline round.

create or replace function public.move_team_to_pool(
  p_tournament_id uuid, p_team uuid, p_pool uuid, p_matches jsonb) returns int
 language plpgsql security definer set search_path to 'public' as $fn$
declare v_comm uuid; v_status text; v_from uuid; v_team text; v_label text; v_from_label text; n int;
        v_actor text; v_role text; v_grp text;
begin
  select community_id, status into v_comm, v_status
    from public.tournaments where id = p_tournament_id for update;
  if not found then raise exception 'That tournament is not here any more.'; end if;
  if not (public.is_organizer(v_comm) or public.is_owner(v_comm)) then
    raise exception 'Only an organizer can move a team' using errcode = '42501';
  end if;
  if v_status not in ('setup','pools') then
    raise exception 'This tournament is past pool play.';
  end if;
  select pool_id, name into v_from, v_team
    from public.teams where id = p_team and tournament_id = p_tournament_id;
  if not found then raise exception 'That team is not in this tournament.'; end if;
  if p_pool is not null then
    select label into v_label from public.pools where id = p_pool and tournament_id = p_tournament_id;
    if not found then raise exception 'That pool is not in this tournament.'; end if;
  end if;
  if v_from is not null then
    select label into v_from_label from public.pools where id = v_from;
  end if;

  if exists (select 1 from public.matches
              where tournament_id = p_tournament_id and phase = 'pool'
                and status in ('final','live')
                and ((p_pool is not null and pool_id = p_pool) or (v_from is not null and pool_id = v_from))) then
    raise exception 'Those pools have games already played or in progress.';
  end if;

  update public.teams set pool_id = p_pool where id = p_team;
  delete from public.matches
   where tournament_id = p_tournament_id and phase = 'pool' and status = 'scheduled'
     and ((p_pool is not null and pool_id = p_pool) or (v_from is not null and pool_id = v_from));
  insert into public.matches (tournament_id, phase, pool_id, team_a_id, team_b_id,
                              status, net, queue_order, version)
  select p_tournament_id, 'pool', (m->>'pool_id')::uuid,
         nullif(m->>'team_a_id','')::uuid, nullif(m->>'team_b_id','')::uuid,
         'scheduled', (m->>'net')::int, (m->>'queue_order')::int, 0
    from jsonb_array_elements(coalesce(p_matches, '[]'::jsonb)) m;
  get diagnostics n = row_count;

  select a.actor, a.role, a.grp into v_actor, v_role, v_grp from public._audit_actor() a;
  insert into public.action_log(actor, role, grp, action, entity_type, entity_id, detail, prose)
    values (v_actor, coalesce(v_role,'admin'), v_grp, 'move_team_to_pool', 'team', p_team::text,
            n::text || ' games rescheduled',
            case when p_pool is not null
                 then 'moved ' || coalesce(v_team, 'a team') || ' to pool ' || coalesce(v_label, '')
                 else 'moved ' || coalesce(v_team, 'a team') || ' out of pool ' || coalesce(v_from_label, '') end
            || ', ' || n::text || ' games rescheduled');
  return n;
end $fn$;
revoke all on function public.move_team_to_pool(uuid, uuid, uuid, jsonb) from public, anon;
grant execute on function public.move_team_to_pool(uuid, uuid, uuid, jsonb) to authenticated;
