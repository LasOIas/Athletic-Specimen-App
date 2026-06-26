-- 0027 NF-4: edit a FINALIZED match score in place, no cascade.
-- submit_match_score refuses a final match ('already final') and advances the winner downstream, so the
-- only way to fix a recorded score was Clear — which nulls every downstream advanced team. edit_match_score
-- updates a final match's score WITHOUT touching advancement, but ONLY when the winner is unchanged
-- (a same-winner correction, e.g. 25-19 -> 25-21). A winner FLIP inherently requires re-cascading the
-- downstream bracket, so it is refused here (use Clear, which correctly re-opens the next round).
-- Anon-allowed (same locked-RLS door as submit_match_score); per-phase score validation mirrors it; audited.
-- Idempotent (create or replace). Applied to prod 2026-06-26, DORMANT until the client edit path ships.

create or replace function public.edit_match_score(
  p_match uuid, p_version integer, p_score_a integer, p_score_b integer
) returns matches
language plpgsql security definer set search_path to 'public'
as $function$
declare m public.matches; t public.tournaments; updated public.matches; side text; new_win uuid;
        v_target int; v_cap int; v_winby int; w int; l int;
        v_actor text; v_role text; v_grp text;
begin
  select * into m from public.matches where id = p_match;
  if not found then raise exception 'match not found'; end if;
  if m.status <> 'final' then raise exception 'this match is not final yet — use the normal score entry'; end if;
  if p_score_a is null or p_score_b is null then raise exception 'enter both scores'; end if;
  if p_score_a < 0 or p_score_b < 0 then raise exception 'scores must be >= 0'; end if;
  if p_score_a = p_score_b then raise exception 'ties are not allowed'; end if;

  select * into t from public.tournaments where id = m.tournament_id;
  if coalesce(m.phase,'') = 'main' then v_target := t.bracket_target; v_cap := t.bracket_cap;
  else v_target := t.pool_target; v_cap := t.pool_cap; end if;
  if v_target is not null then
    v_winby := case when coalesce(t.win_by_2, true) then 2 else 1 end;
    w := greatest(p_score_a, p_score_b); l := least(p_score_a, p_score_b);
    if v_cap is not null and w > v_cap then raise exception 'above the cap of %', v_cap; end if;
    if not (v_cap is not null and w = v_cap) then
      if w < v_target then raise exception 'the winner must reach %', v_target; end if;
      if (w - l) < v_winby then raise exception 'must win by %', v_winby; end if;
    end if;
  end if;

  side := case when p_score_a > p_score_b then 'a' else 'b' end;
  new_win := case when side = 'a' then m.team_a_id else m.team_b_id end;
  if new_win is distinct from m.winner_team_id then
    raise exception 'that score changes who won — clear the result first (it re-opens the next round)';
  end if;

  update public.matches set
    score_a = p_score_a, score_b = p_score_b,
    version = m.version + 1, updated_at = now()
  where id = p_match and version = p_version and status = 'final'
  returning * into updated;
  if not found then raise exception 'another device just updated this match — refresh'; end if;

  select a.actor, a.role, a.grp into v_actor, v_role, v_grp from public._audit_actor() a;
  insert into public.action_log(actor, role, grp, action, entity_type, entity_id, detail)
    values (v_actor, v_role, v_grp, 'edit_score', coalesce(m.phase,'pool')||'_match', p_match::text,
            'edited to '||p_score_a||'-'||p_score_b);

  return updated;
end $function$;

grant execute on function public.edit_match_score(uuid, integer, integer, integer) to anon, authenticated;
