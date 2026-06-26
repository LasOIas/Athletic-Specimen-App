-- 0030 C72: live point-by-point scoring (Mike ask #5).
-- A spectator running the live scorer writes the RUNNING score to a match via this anon-allowed RPC:
-- status -> 'live', score_a/b = the live score. Last-write-wins (NO version CAS — smooth rapid +1 tapping;
-- one scorer per game); refuses to touch a final game. Finalizing the live game reuses submit_match_score
-- (its update guards status <> 'final', so it accepts a 'live' game and advances the bracket).
--
-- No schema change: 'live' was already in the matches.status CHECK from migration 0001
-- (check (status in ('scheduled','live','final'))) — designed in, never used until now.
-- No action_log row per point (a 21-point game would flood it); the FINAL result is audited by
-- submit_match_score. Consistent with the existing "anyone scores" model (admin Clear/edit is the backstop).

create or replace function public.set_live_score(p_match uuid, p_score_a integer, p_score_b integer)
 returns matches
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare updated public.matches;
begin
  if p_score_a < 0 or p_score_b < 0 then raise exception 'scores must be >= 0'; end if;
  update public.matches set
    score_a = p_score_a, score_b = p_score_b, status = 'live',
    version = version + 1, updated_at = now()
  where id = p_match and status <> 'final'
  returning * into updated;
  if not found then raise exception 'game not found or already final'; end if;
  return updated;
end $function$;

grant execute on function public.set_live_score(uuid,int,int) to anon, authenticated;
