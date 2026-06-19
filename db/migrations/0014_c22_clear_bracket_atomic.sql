-- C22 item 7 (clear half) — clear_bracket_atomic RPC (applied to mlzblkzflgylnjorgjcp 2026-06-19)
-- Faithful port of the client's tdbClearBracketResult cascade (was N separate awaited writes, not
-- transactional). Does it all in ONE call so a mid-sequence blip can't strand a half-cleared bracket:
--   1. collect the match + every downstream match (winner_next/loser_next) that is NOT 'scheduled'
--      (i.e., that has a result) — recursively;
--   2. null the downstream team slots FED BY each collected match (the advanced teams pulled back);
--   3. reset each collected match to 'scheduled' (clear score/winner/loser; team slots stay);
--   4. re-open the tournament if it had 'completed'.
-- Admin-only (clearing is an admin action): granted to authenticated, NOT anon. SECURITY DEFINER +
-- pinned search_path, mirroring generate_bracket_atomic / submit_match_score.
create or replace function public.clear_bracket_atomic(p_match uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  v_tournament uuid;
  to_reset uuid[];
  r record;
begin
  select tournament_id into v_tournament from public.matches where id = p_match;
  if not found then raise exception 'match not found'; end if;

  -- 1. collect the match + its non-scheduled downstream chain
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

  -- 2. null the downstream team slots fed by each collected match
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

  -- 3. reset the collected matches (team slots stay)
  update public.matches
     set score_a=null, score_b=null, winner_team_id=null, loser_team_id=null, status='scheduled', updated_at=now()
   where id = any(to_reset);

  -- 4. re-open the tournament if it had completed
  update public.tournaments set status='bracket', updated_at=now()
   where id = v_tournament and status = 'completed';

  insert into public.action_log(actor, role, action, entity_type, entity_id, detail)
    values ('admin','admin','clear_bracket','main_match', p_match::text,
            coalesce(array_length(to_reset,1),0)::text || ' matches reset');
end $$;
revoke all on function public.clear_bracket_atomic(uuid) from public, anon;
grant execute on function public.clear_bracket_atomic(uuid) to authenticated;
