-- 0067_move_noop_and_clear_live_guard.sql: two guards the whole-round review of C101 asked for.
--
-- 1. move_team_to_pool: a call whose destination is the team's CURRENT pool is a no-op returning 0.
--    The team-sheet chip fired the move on any tap, including the pool the team already sat in, and 0066
--    would then delete and recreate that pool's whole scheduled set (new match ids, a false log row).
--    The client is gated too; this is the server saying the same thing to any REST caller.
-- 2. clear_whole_bracket refuses while any bracket game is LIVE, the way clear_bracket_atomic already
--    does, so a running score is never blanked uncounted. Raise: 'A game is being scored right now. Finish
--    that one first.'
--
-- ROLLBACK: re-apply the bodies in 0066 (move_team_to_pool) and 0063 (clear_whole_bracket).
--
-- APPLIED 2026-08-26 via the Supabase MCP (apply_migration), C101 fix wave.

create or replace function public.move_team_to_pool(
  p_tournament_id uuid, p_team uuid, p_pool uuid, p_matches jsonb) returns int
 language plpgsql security definer set search_path to 'public' as $fn$
declare v_comm uuid; v_status text; v_from uuid; v_team text; v_label text; v_from_label text; n int;
        v_actor text; v_role text; v_grp text; v_games text;
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
  if v_from is not distinct from p_pool then return 0; end if;
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
  v_games := n::text || case when n = 1 then ' game rescheduled' else ' games rescheduled' end;

  select a.actor, a.role, a.grp into v_actor, v_role, v_grp from public._audit_actor() a;
  insert into public.action_log(actor, role, grp, action, entity_type, entity_id, detail, prose)
    values (v_actor, coalesce(v_role,'admin'), v_grp, 'move_team_to_pool', 'team', p_team::text,
            v_games,
            case when p_pool is not null
                 then 'moved ' || coalesce(v_team, 'a team') || ' to pool ' || coalesce(v_label, '')
                 else 'moved ' || coalesce(v_team, 'a team') || ' out of pool ' || coalesce(v_from_label, '') end
            || ', ' || v_games);
  return n;
end $fn$;
revoke all on function public.move_team_to_pool(uuid, uuid, uuid, jsonb) from public, anon;
grant execute on function public.move_team_to_pool(uuid, uuid, uuid, jsonb) to authenticated;

create or replace function public.clear_whole_bracket(p_tournament_id uuid) returns int
 language plpgsql security definer set search_path to 'public' as $fn$
declare v_comm uuid; v_status text; v_name text; n int; v_actor text; v_role text; v_grp text;
begin
  select community_id, status, name into v_comm, v_status, v_name
    from public.tournaments where id = p_tournament_id;
  if not found then raise exception 'That tournament is not here any more.'; end if;
  if not (public.is_organizer(v_comm) or public.is_owner(v_comm)) then
    raise exception 'Only an organizer can clear a bracket' using errcode = '42501';
  end if;
  if v_status not in ('bracket','completed') then
    raise exception 'There is no bracket to clear yet.';
  end if;
  if exists (select 1 from public.matches
              where tournament_id = p_tournament_id and phase = 'main' and status = 'live') then
    raise exception 'A game is being scored right now. Finish that one first.';
  end if;

  select count(*) into n from public.matches
   where tournament_id = p_tournament_id and phase = 'main' and status = 'final';

  update public.matches
     set score_a = null, score_b = null, winner_team_id = null, loser_team_id = null,
         status = 'scheduled', version = version + 1, updated_at = now()
   where tournament_id = p_tournament_id and phase = 'main';
  update public.matches m set team_a_id = null
   where m.tournament_id = p_tournament_id and m.phase = 'main'
     and exists (select 1 from public.matches f where f.tournament_id = m.tournament_id
                  and ((f.winner_next_match_id = m.id and coalesce(f.winner_next_slot, 0) <> 1)
                    or (f.loser_next_match_id = m.id and coalesce(f.loser_next_slot, 0) <> 1)));
  update public.matches m set team_b_id = null
   where m.tournament_id = p_tournament_id and m.phase = 'main'
     and exists (select 1 from public.matches f where f.tournament_id = m.tournament_id
                  and ((f.winner_next_match_id = m.id and f.winner_next_slot = 1)
                    or (f.loser_next_match_id = m.id and f.loser_next_slot = 1)));
  update public.tournaments set status = 'bracket', champion_team_id = null, updated_at = now()
   where id = p_tournament_id;

  select a.actor, a.role, a.grp into v_actor, v_role, v_grp from public._audit_actor() a;
  insert into public.action_log(actor, role, grp, action, entity_type, entity_id, detail, prose)
    values (v_actor, coalesce(v_role,'admin'), v_grp, 'clear_whole_bracket', 'tournament',
            p_tournament_id::text, n::text || ' results cleared',
            'cleared every bracket result in ' || coalesce(v_name, 'the tournament') || ', ' || n::text
              || ' game' || case when n = 1 then '' else 's' end);
  return n;
end $fn$;
revoke all on function public.clear_whole_bracket(uuid) from public, anon;
grant execute on function public.clear_whole_bracket(uuid) to authenticated;
