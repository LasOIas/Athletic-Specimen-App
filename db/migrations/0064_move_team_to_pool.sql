-- 0064_move_team_to_pool.sql: move a team to another pool after the draw, server-side (C101 item 7).
--
-- WHY. A client-side move wrote teams.pool_id alone, so once the schedule existed a moved team kept its
-- games against the old pool and had none in the new one (closed on the client at v2026.08.25.35 by
-- withholding Move after the draw). A faithful move is a two-pool schedule regeneration: the client
-- computes the plan with the proven pure layout helpers (the round-aware net layout is verified across
-- 1,984 configs), and this DEFINER RPC applies it atomically, the exact shape of start_pool_play_atomic.
--
-- A LIVE GAME IS NEVER DELETED. set_live_score writes status 'live' and is reachable by anon on any pool
-- game not already final. So the refusal covers status in ('final','live') and the delete is scoped
-- POSITIVELY to status = 'scheduled'. Two independent statements, either of which alone is enough.
--
-- GUARDS: the tournament exists (row locked FOR UPDATE, so two organizers moving at once serialise);
-- organizer or owner (42501); status in ('setup','pools'), which is what keeps the completed June and
-- August tournaments out; the team and the pool belong to this tournament; neither affected pool has a
-- final or live game. An unpooled team (v_from IS NULL) is allowed: it has no fixtures to move, only the
-- destination pool is rebuilt, and every predicate is written so a null v_from NARROWS the scope.
--
-- matches_pool_pair_uq (0023) cannot fire here BECAUSE the final/live refusal ran first, so no surviving
-- row in either rebuilt pool can collide with a regenerated pairing. Loosen the refusal and it is live.
--
-- RETURNS the matches written. Writes a log row with prose.
--
-- APPLIED 2026-08-25 via the Supabase MCP (apply_migration), C101 inline round.

create or replace function public.move_team_to_pool(
  p_tournament_id uuid, p_team uuid, p_pool uuid, p_matches jsonb) returns int
 language plpgsql security definer set search_path to 'public' as $fn$
declare v_comm uuid; v_status text; v_from uuid; v_team text; v_label text; n int;
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
  select label into v_label from public.pools where id = p_pool and tournament_id = p_tournament_id;
  if not found then raise exception 'That pool is not in this tournament.'; end if;

  if exists (select 1 from public.matches
              where tournament_id = p_tournament_id and phase = 'pool'
                and status in ('final','live')
                and (pool_id = p_pool or (v_from is not null and pool_id = v_from))) then
    raise exception 'Those pools have games already played or in progress.';
  end if;

  update public.teams set pool_id = p_pool where id = p_team;
  delete from public.matches
   where tournament_id = p_tournament_id and phase = 'pool' and status = 'scheduled'
     and (pool_id = p_pool or (v_from is not null and pool_id = v_from));
  insert into public.matches (tournament_id, phase, pool_id, team_a_id, team_b_id,
                              status, net, queue_order, version)
  select p_tournament_id, 'pool', (m->>'pool_id')::uuid,
         nullif(m->>'team_a_id','')::uuid, nullif(m->>'team_b_id','')::uuid,
         'scheduled', (m->>'net')::int, (m->>'queue_order')::int, 0
    from jsonb_array_elements(p_matches) m;
  get diagnostics n = row_count;

  select a.actor, a.role, a.grp into v_actor, v_role, v_grp from public._audit_actor() a;
  insert into public.action_log(actor, role, grp, action, entity_type, entity_id, detail, prose)
    values (v_actor, coalesce(v_role,'admin'), v_grp, 'move_team_to_pool', 'team', p_team::text,
            n::text || ' games rescheduled',
            'moved ' || coalesce(v_team, 'a team') || ' to pool ' || coalesce(v_label, '') ||
            ', ' || n::text || ' games rescheduled');
  return n;
end $fn$;
revoke all on function public.move_team_to_pool(uuid, uuid, uuid, jsonb) from public, anon;
grant execute on function public.move_team_to_pool(uuid, uuid, uuid, jsonb) to authenticated;
