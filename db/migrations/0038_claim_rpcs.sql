-- 0038_claim_rpcs.sql — Claim plumbing RPCs (additive; part of the Identity/Accounts track).
-- Applied to prod 2026-07-09 via execute_sql, then recorded here. Verified by integration test
-- (fake auth.uid() via request.jwt.claims): happy path claim->approve sets players.claimed_by_profile;
-- guards PASS — already-claimed, non-organizer approve, and anon claim are all rejected.
--
-- These are SECURITY DEFINER (they write player_claims / players.claimed_by_profile past RLS) so per the
-- Supabase security rule each one GUARDS THE CALLER in its own body (auth.uid() / is_organizer). EXECUTE
-- is revoked from anon/public and granted only to `authenticated` (defense in depth on top of the guards).
--
-- Renumbering note: the deferred cutover migrations from the auth plan shift by one — RLS rewrite = 0039,
-- scoring-RPC rewrite = 0040, retire-code = 0041 (this additive claim plumbing took 0038).

-- A signed-in profile requests to claim a player. Pending until an organizer approves.
create or replace function public.claim_player(p_player uuid)
returns public.player_claims
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_comm uuid;
  v_claimed uuid;
  v_row public.player_claims;
begin
  if v_uid is null then raise exception 'must be signed in to claim a player'; end if;
  select community_id, claimed_by_profile into v_comm, v_claimed from public.players where id = p_player;
  if v_comm is null then raise exception 'player not found'; end if;
  if v_claimed is not null and v_claimed <> v_uid then raise exception 'this player is already claimed'; end if;
  select * into v_row from public.player_claims where player_id = p_player and profile_id = v_uid limit 1;
  if v_row.id is null then
    insert into public.player_claims (player_id, profile_id, community_id, status)
    values (p_player, v_uid, v_comm, 'pending')
    returning * into v_row;
  end if;
  return v_row;
end $$;

-- Organizer/owner approves a pending claim -> sets players.claimed_by_profile + rejects rival pending claims.
create or replace function public.approve_claim(p_claim uuid)
returns public.player_claims
language plpgsql security definer set search_path = public
as $$
declare v_row public.player_claims;
begin
  select * into v_row from public.player_claims where id = p_claim;
  if v_row.id is null then raise exception 'claim not found'; end if;
  if not public.is_organizer(v_row.community_id) then raise exception 'only an organizer can approve a claim'; end if;
  update public.players set claimed_by_profile = v_row.profile_id where id = v_row.player_id;
  update public.player_claims set status = 'approved' where id = p_claim returning * into v_row;
  update public.player_claims set status = 'rejected'
    where player_id = v_row.player_id and id <> p_claim and status = 'pending';
  return v_row;
end $$;

-- Organizer/owner rejects a claim.
create or replace function public.reject_claim(p_claim uuid)
returns public.player_claims
language plpgsql security definer set search_path = public
as $$
declare v_row public.player_claims;
begin
  select * into v_row from public.player_claims where id = p_claim;
  if v_row.id is null then raise exception 'claim not found'; end if;
  if not public.is_organizer(v_row.community_id) then raise exception 'only an organizer can reject a claim'; end if;
  update public.player_claims set status = 'rejected' where id = p_claim returning * into v_row;
  return v_row;
end $$;

revoke execute on function public.claim_player(uuid), public.approve_claim(uuid), public.reject_claim(uuid) from public, anon;
grant execute on function public.claim_player(uuid), public.approve_claim(uuid), public.reject_claim(uuid) to authenticated;
