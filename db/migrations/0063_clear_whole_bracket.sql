-- 0063_clear_whole_bracket.sql: "Clear every result" on the organizer's bracket (C101 item 5).
--
-- WHY. The bracket strip's only reset DELETES the tree and returns to pools. Organizers also need the
-- softer thing: blank every score and keep the bracket's shape and its seeded pairings. This RPC does
-- that in one call and returns the number of RESULTS it cleared.
--
-- THE SLOT RULE. generate_bracket_atomic fills team_a_id / team_b_id at generation ONLY when the source
-- carries a seed, and writes feeder pointers for everything else. So a slot was ADVANCED exactly when some
-- match points at it (winner_next_match_id / loser_next_match_id with the slot), and those slots are
-- nulled; a slot nothing points at was seeded and stays. Slot 1 means team_b_id, else team_a_id, the
-- mapping submit_match_score and clear_bracket_atomic already use. A bye is a seeded slot in a later
-- round and its team never moves, which is why the copy says "every seeded pairing stays" and not
-- "back to their first-round games".
--
-- COUNT RESULTS, not rows touched: the blanking UPDATE hits every main row including ones never played.
--
-- GUARDS: the tournament exists; organizer or owner (42501); status in ('bracket','completed'). A completed
-- tournament is deliberately NOT refused: clearing right after a tournament ends is the main reason this
-- control exists, and clear_bracket_atomic already reopens one. Do not tighten that. The June and August
-- 2026 tournaments are both completed with real bracket rows: they are protected by the organizer guard
-- and by the Manage screen acting on the SELECTED tournament only; this call has no client path that
-- names another tournament's id.
--
-- version bumps on every touched row (see 0062). RETURNS int. Writes a log row with prose.
--
-- ROLLBACK: drop function if exists public.clear_whole_bracket(uuid); (the client control is removed with it).
--
-- APPLIED 2026-08-25 via the Supabase MCP (apply_migration), C101 inline round.

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
