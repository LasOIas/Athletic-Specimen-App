-- C21 Phase 1 / Task 3 (cont.) — submit_match_score RPC (applied to mlzblkzflgylnjorgjcp 2026-06-18)
-- The 3rd anon-write door. Faithful port of the client's tdbSubmitResult (pool) +
-- tdbSubmitBracketResult (bracket): pool = score + CAS only; bracket (phase='main') =
-- guarded winner/loser advancement (winner_next/loser_next, only into an empty 'scheduled'
-- slot) + grand-final special-case (WB finalist winning ends it, no reset) + completes the
-- tournament when decisive. SECURITY DEFINER so it stays the only anon write path under locked RLS.
-- Verified live 2026-06-18 against a synthetic bracket: pool winner/score, bracket advancement
-- into the correct slot, decisive completion → tournament 'completed'; test data cleaned.

create or replace function public.submit_match_score(
  p_match uuid, p_version int,
  p_score_a int default null, p_score_b int default null,
  p_winner_side text default null
) returns public.matches language plpgsql security definer set search_path=public as $$
declare m public.matches; updated public.matches; side text; win uuid; lose uuid; col text;
        is_gf boolean; wb_won_gf boolean; decisive boolean;
begin
  select * into m from public.matches where id = p_match;
  if not found then raise exception 'match not found'; end if;
  if m.team_a_id is null or m.team_b_id is null then raise exception 'both teams are not set yet'; end if;
  if m.status = 'final' then raise exception 'already final'; end if;

  if p_score_a is not null and p_score_b is not null then
    if p_score_a < 0 or p_score_b < 0 then raise exception 'scores must be >= 0'; end if;
    if p_score_a = p_score_b then raise exception 'ties are not allowed'; end if;
    side := case when p_score_a > p_score_b then 'a' else 'b' end;
    if p_winner_side is not null and lower(p_winner_side) <> side then
      raise exception 'the winner does not match the scores'; end if;
  elsif lower(coalesce(p_winner_side,'')) in ('a','b') then
    side := lower(p_winner_side);
  else
    raise exception 'enter both scores or pick a winner';
  end if;

  if coalesce(m.phase,'') <> 'main' and (p_score_a is null or p_score_b is null) then
    raise exception 'pool games need both scores';
  end if;

  win  := case when side='a' then m.team_a_id else m.team_b_id end;
  lose := case when side='a' then m.team_b_id else m.team_a_id end;

  update public.matches set
    score_a = p_score_a, score_b = p_score_b,
    winner_team_id = win, loser_team_id = lose, status = 'final',
    version = m.version + 1, updated_at = now()
  where id = p_match and version = p_version and status <> 'final'
  returning * into updated;
  if not found then raise exception 'another device just updated this match — refresh'; end if;

  if m.phase = 'main' then
    is_gf := (m.side = 'grand_final' and m.round = 1);
    wb_won_gf := (is_gf and side = 'a');
    if m.winner_next_match_id is not null and not wb_won_gf then
      col := case when m.winner_next_slot = 1 then 'team_b_id' else 'team_a_id' end;
      execute format('update public.matches set %I = $1 where id = $2 and %I is null and status = ''scheduled''', col, col)
        using win, m.winner_next_match_id;
    end if;
    if m.loser_next_match_id is not null and not wb_won_gf then
      col := case when m.loser_next_slot = 1 then 'team_b_id' else 'team_a_id' end;
      execute format('update public.matches set %I = $1 where id = $2 and %I is null and status = ''scheduled''', col, col)
        using lose, m.loser_next_match_id;
    end if;
    decisive := (m.winner_next_match_id is null) or wb_won_gf;
    if decisive then
      update public.tournaments set status = 'completed', updated_at = now() where id = m.tournament_id;
    end if;
  end if;

  insert into public.action_log(actor, role, action, entity_type, entity_id, detail)
    values ('anon','public','submit_score', coalesce(m.phase,'pool')||'_match', p_match::text,
            coalesce(p_score_a::text,'-')||'-'||coalesce(p_score_b::text,'-')||' win:'||side);
  return updated;
end $$;

revoke all on function public.submit_match_score(uuid,int,int,int,text) from public;
grant execute on function public.submit_match_score(uuid,int,int,int,text) to anon, authenticated;
