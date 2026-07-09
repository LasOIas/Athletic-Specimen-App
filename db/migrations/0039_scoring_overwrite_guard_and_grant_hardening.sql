-- 0039_scoring_overwrite_guard_and_grant_hardening.sql
-- Arc 1 (security-critical subset). Closes W-F03 (anon rewrite of a FINALIZED score) and hardens
-- anon grants, WITHOUT the app-wide RLS rewrite (that is Arc 2 / migrations 0040-0041).
--
-- WHAT THIS DOES
--   1. Rewrites submit_match_score / set_live_score / edit_match_score OFF THEIR LIVE DEFINITIONS
--      (fetched via pg_get_functiondef 2026-07-09), inserting ONLY an overwrite guard:
--        - submit_match_score / set_live_score: overwriting an ALREADY-FINAL match requires
--          organizer/owner; FIRST submission of a not-yet-final match stays OPEN (anon self-report).
--        - edit_match_score: editing a finalized result requires organizer/owner UNCONDITIONALLY
--          (it only ever targets final matches; editing a final score is an admin action).
--      Everything else in each body (_audit_actor, version-CAS, forfeit/bracket-advance, validation)
--      is preserved verbatim. Signatures, SECURITY DEFINER, and `set search_path` are identical.
--   2. Revokes the wide-open anon grants on public.profiles (anon held SELECT/INSERT/UPDATE incl. email;
--      email was blocked only by the ABSENCE of an anon RLS policy — this is the defense-in-depth).
--      authenticated keeps self-read/self-update via the existing `profiles self read/update` policies.
--   3. Revokes anon EXECUTE on the policy/trigger-internal role helpers. LANDMINE: caller_role is called
--      client-side by the app AS authenticated to derive role — anon is revoked, authenticated is KEPT.
--
-- Guard semantics note: the guard call `public.is_organizer(...)` runs INSIDE these SECURITY DEFINER
-- functions (as the function owner), so revoking anon's direct EXECUTE on is_organizer/is_owner/
-- caller_role does NOT disable the internal guard check — those helpers stay callable by the owner.
--
-- =====================================================================================================
-- ROLLBACK BLOCK (verbatim prior definitions + re-grants — apply this whole block to undo 0039)
-- =====================================================================================================
/*
CREATE OR REPLACE FUNCTION public.submit_match_score(p_match uuid, p_version integer, p_score_a integer DEFAULT NULL::integer, p_score_b integer DEFAULT NULL::integer, p_winner_side text DEFAULT NULL::text)
 RETURNS matches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

CREATE OR REPLACE FUNCTION public.set_live_score(p_match uuid, p_score_a integer, p_score_b integer)
 RETURNS matches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

CREATE OR REPLACE FUNCTION public.edit_match_score(p_match uuid, p_version integer, p_score_a integer, p_score_b integer)
 RETURNS matches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

-- re-grants (only if rollback ever needed; recon shows anon-profiles was never legitimately used).
-- Restores the exact prior ACLs, incl. the PUBLIC grant that anon inherited from:
grant select, insert, update, references on public.profiles to anon;
grant execute on function public.is_organizer(uuid) to public, anon;
grant execute on function public.is_owner(uuid) to public, anon;
grant execute on function public.caller_claims_team(uuid) to public, anon;
grant execute on function public.handle_new_user() to public, anon, authenticated;
grant execute on function public.caller_role(uuid) to public, anon;
*/
-- =====================================================================================================
-- END ROLLBACK BLOCK
-- =====================================================================================================


-- ==========================================================================
-- 1. submit_match_score — + overwrite guard (final overwrite = organizer/owner only)
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.submit_match_score(p_match uuid, p_version integer, p_score_a integer DEFAULT NULL::integer, p_score_b integer DEFAULT NULL::integer, p_winner_side text DEFAULT NULL::text)
 RETURNS matches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare m public.matches; t public.tournaments; updated public.matches; side text; win uuid; lose uuid; col text;
        is_gf boolean; wb_won_gf boolean; decisive boolean;
        v_actor text; v_role text; v_grp text;
        v_target int; v_cap int; v_winby int; w int; l int;
begin
  select * into m from public.matches where id = p_match;
  if not found then raise exception 'match not found'; end if;
  -- OVERWRITE GUARD (0039): first submission of a not-yet-final match stays OPEN (anon self-report);
  -- overwriting an ALREADY-FINAL result requires organizer/owner. Closes W-F03.
  if m.status = 'final' and not (public.is_organizer(m.community_id) or public.is_owner(m.community_id)) then
    raise exception 'Only an organizer can change a finalized score' using errcode = '42501';
  end if;
  if m.team_a_id is null or m.team_b_id is null then raise exception 'both teams are not set yet'; end if;
  if m.status = 'final' then raise exception 'already final'; end if;
  select * into t from public.tournaments where id = m.tournament_id;

  if p_score_a is not null and p_score_b is not null then
    if p_score_a < 0 or p_score_b < 0 then raise exception 'scores must be >= 0'; end if;
    if p_score_a = p_score_b then raise exception 'ties are not allowed'; end if;
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


-- ==========================================================================
-- 2. set_live_score — + overwrite guard (live-scoring an already-final match = organizer/owner only)
--    NOTE: the live body did not load the match row; the guard requires status+community_id, so a
--    minimal `select status, community_id` load is added. Nothing else changes.
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.set_live_score(p_match uuid, p_score_a integer, p_score_b integer)
 RETURNS matches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare updated public.matches; v_status text; v_community uuid;
begin
  if p_score_a < 0 or p_score_b < 0 then raise exception 'scores must be >= 0'; end if;
  -- OVERWRITE GUARD (0039): live-scoring a not-yet-final match stays OPEN; overwriting an
  -- ALREADY-FINAL result requires organizer/owner. Closes W-F03.
  select status, community_id into v_status, v_community from public.matches where id = p_match;
  if v_status = 'final' and not (public.is_organizer(v_community) or public.is_owner(v_community)) then
    raise exception 'Only an organizer can change a finalized score' using errcode = '42501';
  end if;
  update public.matches set
    score_a = p_score_a, score_b = p_score_b, status = 'live',
    version = version + 1, updated_at = now()
  where id = p_match and status <> 'final'
  returning * into updated;
  if not found then raise exception 'game not found or already final'; end if;
  return updated;
end $function$;


-- ==========================================================================
-- 3. edit_match_score — + organizer/owner guard (unconditional; only ever targets final matches)
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.edit_match_score(p_match uuid, p_version integer, p_score_a integer, p_score_b integer)
 RETURNS matches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare m public.matches; t public.tournaments; updated public.matches; side text; new_win uuid;
        v_target int; v_cap int; v_winby int; w int; l int;
        v_actor text; v_role text; v_grp text;
begin
  select * into m from public.matches where id = p_match;
  if not found then raise exception 'match not found'; end if;
  -- ORGANIZER GUARD (0039): editing a finalized score is an admin action — organizer/owner only. Closes W-F03.
  if not (public.is_organizer(m.community_id) or public.is_owner(m.community_id)) then
    raise exception 'Only an organizer can edit a finalized score' using errcode = '42501';
  end if;
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


-- ==========================================================================
-- 4. Grant / helper hardening
-- ==========================================================================
-- profiles: revoke the wide-open anon grant (anon held SELECT/INSERT/UPDATE incl. email).
-- authenticated keeps self-read/self-update via the existing profiles self policies.
revoke all on public.profiles from anon;

-- helper hardening: policy/trigger-internal — anon never needs to call them directly.
-- IMPORTANT: each helper carries BOTH an explicit anon grant AND a PUBLIC grant (verified via
-- pg_proc.proacl 2026-07-09: {=X, anon=X, authenticated=X, service_role=X}). Revoking from anon
-- alone is a NO-OP because anon inherits EXECUTE from PUBLIC — so we revoke from `anon, public`.
-- The explicit `authenticated=X` grant is NOT touched, so authenticated RETAINS execute (this is the
-- landmine: caller_role is called client-side by the app as authenticated to derive role; and the
-- Arc-2 is_organizer RLS policies evaluate as authenticated). handle_new_user is a trigger fn that
-- no client role needs, so authenticated is revoked there too.
revoke execute on function public.is_organizer(uuid) from anon, public;
revoke execute on function public.is_owner(uuid) from anon, public;
revoke execute on function public.caller_claims_team(uuid) from anon, public;
revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.caller_role(uuid) from anon, public;  -- authenticated retains (explicit grant)
