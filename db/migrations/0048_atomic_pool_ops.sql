-- 0048_atomic_pool_ops.sql
-- Task 7 (Manage → Pools & schedule, pick R9). Closes the non-atomic "3-write landmine": today the client
-- draws pools with a delete-pools + insert-pools + bulk-update-team-pool_ids sequence (tdbDrawPools) and
-- starts play with a delete-matches + insert-schedule + status='pools' sequence (tdbStartPoolPlay). A failure
-- mid-sequence leaves the tournament half-built (pools with no teams, matches inserted while status stays
-- 'setup', etc.). These two SECURITY DEFINER RPCs wrap each sequence in ONE transaction (a plpgsql function
-- body is atomic — any raise rolls the whole thing back).
--
-- DESIGN CHOICE — PAYLOAD, not server-side regeneration:
--   The client passes the ALREADY-COMPUTED rows as jsonb; the RPCs only DELETE + INSERT + flip status.
--   Rationale: the draw uses a client-side random shuffle, and the schedule generation is nontrivial
--   (generateRoundRobin + splitNetsAcrossPools + distributeGamesOnNets — three tested pure.js helpers).
--   Porting that generation to PL/pgSQL would create a SECOND source of truth that could silently drift from
--   the client + its test suite. This mirrors generate_bracket_atomic (0021), which takes p_matches jsonb for
--   exactly the same reason. The atomicity that the recon flags as the landmine is the multi-write sequence —
--   the payload approach fixes precisely that.
--
-- GUARD: an in-body is_organizer / is_owner check on the tournament's community_id (the same idiom as the
--   0039 scoring guards). Because these run as the function owner (SECURITY DEFINER), the guard helpers stay
--   callable even though anon/public EXECUTE on them was revoked in 0039 — and auth.uid() still reads the
--   REAL caller's JWT, so the role check evaluates the actual caller.
--
-- GRANTS: EXECUTE to authenticated only; revoked from public + anon (pool setup is never an anon action).
-- APPLIED BY THE CONTROLLER via the authed Supabase MCP (a builder never applies migrations). Until then the
-- client degrades honestly — the RPC-not-found error surfaces a friendly "server is still updating" notice
-- and does NOT fall back to the non-atomic path.

-- ==========================================================================
-- draw_pools_atomic — delete existing pools (cascades matches, nulls team pool_id via FK) + insert the new
-- pools + assign each team to its pool, all in one transaction. p_pools = [{label, display_order}];
-- p_assignments = [{team_id, display_order}] (which pool's display_order each team joins).
-- ==========================================================================
create or replace function public.draw_pools_atomic(p_tournament_id uuid, p_pools jsonb, p_assignments jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_community uuid; v_status text;
begin
  select community_id, status into v_community, v_status from public.tournaments where id = p_tournament_id;
  if not found then raise exception 'tournament not found'; end if;
  -- ORGANIZER GUARD (mirrors 0039): pool setup is an admin action.
  if not (public.is_organizer(v_community) or public.is_owner(v_community)) then
    raise exception 'Only an organizer can draw pools' using errcode = '42501';
  end if;
  -- Match the client guard in tdbDrawPools: pools can only be (re)drawn while the tournament is in setup.
  if v_status is distinct from 'setup' then
    raise exception 'Pool play already started — reset pools first';
  end if;

  -- Clear existing pools of this tournament. FK pools<-teams is ON DELETE SET NULL (nulls teams.pool_id);
  -- FK matches<-pools cascades, so any old pool matches go too.
  delete from public.pools where tournament_id = p_tournament_id;

  -- Insert the new pools (RETURNING keeps them addressable by display_order for the assignment join below).
  insert into public.pools (tournament_id, label, display_order)
  select p_tournament_id, pl->>'label', (pl->>'display_order')::int
  from jsonb_array_elements(p_pools) pl;

  -- Assign each team to the pool whose display_order it was routed to (round-robin computed client-side).
  update public.teams t
    set pool_id = po.id
  from jsonb_array_elements(p_assignments) a
  join public.pools po on po.tournament_id = p_tournament_id and po.display_order = (a->>'display_order')::int
  where t.id = (a->>'team_id')::uuid and t.tournament_id = p_tournament_id;
end $function$;

revoke all on function public.draw_pools_atomic(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.draw_pools_atomic(uuid, jsonb, jsonb) to authenticated;

-- ==========================================================================
-- start_pool_play_atomic — delete this tournament's pool matches + insert the computed schedule + flip status
-- to 'pools', in one transaction. p_matches = [{pool_id, team_a_id, team_b_id, net, queue_order}].
-- ==========================================================================
create or replace function public.start_pool_play_atomic(p_tournament_id uuid, p_matches jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_community uuid; v_status text; v_count int;
begin
  select community_id, status into v_community, v_status from public.tournaments where id = p_tournament_id;
  if not found then raise exception 'tournament not found'; end if;
  if not (public.is_organizer(v_community) or public.is_owner(v_community)) then
    raise exception 'Only an organizer can start pool play' using errcode = '42501';
  end if;
  -- Same guard as tdbStartPoolPlay: only start from setup (prevents clobbering a live schedule).
  if v_status is distinct from 'setup' then
    raise exception 'Pool play already started — reset pools first';
  end if;

  select count(*) into v_count from jsonb_array_elements(p_matches);
  if v_count = 0 then raise exception 'No pool games to schedule — each pool needs at least 2 teams'; end if;

  delete from public.matches where tournament_id = p_tournament_id and phase = 'pool';

  insert into public.matches (tournament_id, phase, pool_id, team_a_id, team_b_id, status, net, queue_order, version)
  select p_tournament_id, 'pool',
    (m->>'pool_id')::uuid,
    nullif(m->>'team_a_id','')::uuid, nullif(m->>'team_b_id','')::uuid,
    'scheduled', (m->>'net')::int, (m->>'queue_order')::int, 0
  from jsonb_array_elements(p_matches) m;

  update public.tournaments set status = 'pools', updated_at = now() where id = p_tournament_id;
end $function$;

revoke all on function public.start_pool_play_atomic(uuid, jsonb) from public, anon;
grant execute on function public.start_pool_play_atomic(uuid, jsonb) to authenticated;
