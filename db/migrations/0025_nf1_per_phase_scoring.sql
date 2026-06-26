-- 0025 NF-1: per-phase scoring (pool target + hard cap, bracket target + no cap, win-by-2),
-- enforced server-side in submit_match_score (the only anon write path).
--
-- Enforcement applies ONLY to tournaments created with the NEW model (the phase's target column
-- is set). Legacy rows (match_cap only, target columns NULL) skip enforcement = old behavior, so an
-- in-flight legacy tournament's scoring never changes underneath the migration. (All tournaments at
-- apply time have NULL target columns, so this is a no-op for existing data; the new rule activates
-- only once the create flow writes the columns.)
--
-- Rebased on the LIVE post-0019 definition (pg_get_functiondef) so the _audit_actor() audit trail
-- and JWT-derived actor are PRESERVED. Win-by-2 applies until the cap; AT the cap a 1-point win is
-- allowed (the cap overrides win-by-2). No cap => win-by-2 with no upper bound.
-- Verified on synthetic (new + legacy) tournaments 2026-06-26; test data cleaned.

alter table public.tournaments add column if not exists pool_target int;
alter table public.tournaments add column if not exists pool_cap int;
alter table public.tournaments add column if not exists bracket_target int;
alter table public.tournaments add column if not exists bracket_cap int;
alter table public.tournaments add column if not exists win_by_2 boolean not null default true;

create or replace function public.submit_match_score(p_match uuid, p_version integer, p_score_a integer default null::integer, p_score_b integer default null::integer, p_winner_side text default null::text)
 returns matches
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare m public.matches; t public.tournaments; updated public.matches; side text; win uuid; lose uuid; col text;
        is_gf boolean; wb_won_gf boolean; decisive boolean;
        v_actor text; v_role text; v_grp text;
        v_target int; v_cap int; v_winby int; w int; l int;
begin
  select * into m from public.matches where id = p_match;
  if not found then raise exception 'match not found'; end if;
  if m.team_a_id is null or m.team_b_id is null then raise exception 'both teams are not set yet'; end if;
  if m.status = 'final' then raise exception 'already final'; end if;
  select * into t from public.tournaments where id = m.tournament_id;

  if p_score_a is not null and p_score_b is not null then
    if p_score_a < 0 or p_score_b < 0 then raise exception 'scores must be >= 0'; end if;
    if p_score_a = p_score_b then raise exception 'ties are not allowed'; end if;
    -- NF-1: enforce per-phase target / cap / win-by-2 — ONLY when the new model is set for this phase
    -- (v_target not null). Legacy rows (match_cap only) skip it = old behavior.
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

  select a.actor, a.role, a.grp into v_actor, v_role, v_grp from public._audit_actor() a;
  insert into public.action_log(actor, role, grp, action, entity_type, entity_id, detail)
    values (v_actor, v_role, v_grp, 'submit_score', coalesce(m.phase,'pool')||'_match', p_match::text,
            coalesce(p_score_a::text,'-')||'-'||coalesce(p_score_b::text,'-')||' win:'||side);
  return updated;
end $function$;
