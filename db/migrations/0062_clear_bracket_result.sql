-- 0062_clear_bracket_result.sql: "Clear this result" on a bracket game (C79 as Clear, C101 item 2).
--
-- WHY. A mis-tapped bracket winner could not be undone: the only reversal wiped the whole bracket, and
-- the app's own error text pointed at a control that did not exist. A TRUE undo is impossible from the
-- data that exists (no history table; action_log.detail stores only the new value), so this ships as
-- CLEAR: the game and everything it sent through go back to scheduled. clear_bracket_atomic already did
-- that with an organizer guard and had ZERO client callers, so this file recreates it (a DROP is needed
-- because the return type changes from void to int, and it is free only while nothing calls it).
--
-- NEW GUARDS, in body order: the match exists; organizer or owner (42501); the match is a BRACKET game
-- (the shipped function had no phase check, so a pool id reset a pool row and logged it as main_match);
-- the match is FINAL (a reachable REST function must not rely on the UI only offering Clear on a played
-- game); no collected downstream game is LIVE (the chain recurses on status <> 'scheduled', which would
-- wipe a game in progress; refuse instead). A completed tournament is NOT refused: it is reopened to
-- 'bracket', the existing and correct behaviour.
--
-- THE CHAMPION NULL IS UNCONDITIONAL and its own statement: folded into the reopen UPDATE (which carries
-- status = 'completed') it would miss the sequence close, reopen, clear, and resolveHistoryChampion
-- prefers the stored champion, so History would print a champion the bracket no longer has.
-- close_tournament writes it again on the next close.
--
-- version bumps on every touched match so a score card left open on a pre-clear match fails its CAS
-- ("another device just updated this match") instead of writing into a row reset underneath it.
--
-- RETURNS the number of matches reset (>= 1), the client's read-back. Writes a log row with prose.
--
-- APPLIED 2026-08-25 via the Supabase MCP (apply_migration), C101 inline round.

drop function if exists public.clear_bracket_atomic(uuid);
create function public.clear_bracket_atomic(p_match uuid) returns int
 language plpgsql security definer set search_path to 'public' as $fn$
declare v_tournament uuid; v_comm uuid; v_phase text; v_status text; v_name text;
        to_reset uuid[]; r record; n int; v_actor text; v_role text; v_grp text;
begin
  -- The live select carries m only as an alias inside it, so phase and status must come out of this select.
  select m.tournament_id, m.phase, m.status, t.community_id, t.name
    into v_tournament, v_phase, v_status, v_comm, v_name
    from public.matches m join public.tournaments t on t.id = m.tournament_id
   where m.id = p_match;
  if v_tournament is null then raise exception 'That game is not here any more.'; end if;
  if not (public.is_organizer(v_comm) or public.is_owner(v_comm)) then
    raise exception 'Only an organizer can clear a bracket' using errcode = '42501';
  end if;
  if coalesce(v_phase, '') <> 'main' then raise exception 'That is not a bracket game.'; end if;
  if v_status <> 'final' then raise exception 'That game has no result to clear.'; end if;

  with recursive chain as (
    select id, winner_next_match_id, loser_next_match_id
      from public.matches where id = p_match
    union
    select n.id, n.winner_next_match_id, n.loser_next_match_id
      from chain c
      join public.matches n on n.id in (c.winner_next_match_id, c.loser_next_match_id)
     where n.status <> 'scheduled'
  )
  select array_agg(id) into to_reset from chain;

  if exists (select 1 from public.matches where id = any(to_reset) and status = 'live') then
    raise exception 'A game further along is being scored right now. Finish that one first.';
  end if;

  for r in select * from public.matches where id = any(to_reset) loop
    if r.winner_next_match_id is not null then
      if r.winner_next_slot = 1 then update public.matches set team_b_id = null where id = r.winner_next_match_id;
      else update public.matches set team_a_id = null where id = r.winner_next_match_id; end if;
    end if;
    if r.loser_next_match_id is not null then
      if r.loser_next_slot = 1 then update public.matches set team_b_id = null where id = r.loser_next_match_id;
      else update public.matches set team_a_id = null where id = r.loser_next_match_id; end if;
    end if;
  end loop;

  update public.matches
     set score_a = null, score_b = null, winner_team_id = null, loser_team_id = null,
         status = 'scheduled', version = version + 1, updated_at = now()
   where id = any(to_reset);
  n := coalesce(array_length(to_reset, 1), 0);

  update public.tournaments set status = 'bracket', updated_at = now()
   where id = v_tournament and status = 'completed';
  update public.tournaments set champion_team_id = null where id = v_tournament;

  select a.actor, a.role, a.grp into v_actor, v_role, v_grp from public._audit_actor() a;
  insert into public.action_log(actor, role, grp, action, entity_type, entity_id, detail, prose)
    values (v_actor, coalesce(v_role,'admin'), v_grp, 'clear_bracket', 'main_match', p_match::text,
            n::text || ' matches reset',
            'cleared ' || n::text || ' bracket result' || case when n = 1 then '' else 's' end
              || ' in ' || coalesce(v_name, 'the tournament'));
  return n;
end $fn$;
revoke all on function public.clear_bracket_atomic(uuid) from public, anon;
grant execute on function public.clear_bracket_atomic(uuid) to authenticated;
