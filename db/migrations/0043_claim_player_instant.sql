-- 0043_claim_player_instant.sql — claims apply INSTANTLY (Slice 3b, corrected model).
-- Applied to prod 2026-07-09 via apply_migration, TDD-verified (red: pending model left claimed_by_profile
-- null → green: instant link + idempotent re-claim + audit row 'approved'; guards: rival claim → "already
-- claimed", anon → "must be signed in"; baseline 233/18/0/0 restored after the throwaway).
--
-- WHY: Mike killed the organizer-approval model mid-§38 round ("i dont want any of that, all i want is to
-- edit a player from the admin page, i dont want to have to approve every single player claim"). Claims are
-- self-serve and instant; the admin exception path is the Account row + Unlink in the admin player editor
-- (an authenticated direct update of players.claimed_by_profile through the existing c21 policy door).
-- approve_claim / reject_claim (0038) are now UNUSED — left in place, retired in the cutover (0041).
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
  select community_id, claimed_by_profile into v_comm, v_claimed
    from public.players where id = p_player for update;  -- row lock: two simultaneous claimers serialize
  if v_comm is null then raise exception 'player not found'; end if;
  if v_claimed is not null and v_claimed <> v_uid then raise exception 'this player is already claimed'; end if;

  update public.players set claimed_by_profile = v_uid where id = p_player;

  -- audit trail: my claim row for this player, marked approved (idempotent per (player, profile))
  select * into v_row from public.player_claims
    where player_id = p_player and profile_id = v_uid limit 1;
  if v_row.id is null then
    insert into public.player_claims (player_id, profile_id, community_id, status)
    values (p_player, v_uid, v_comm, 'approved')
    returning * into v_row;
  else
    update public.player_claims set status = 'approved' where id = v_row.id returning * into v_row;
  end if;
  -- tidy any stale rival pendings from the 0038 era
  update public.player_claims set status = 'rejected'
    where player_id = p_player and profile_id <> v_uid and status = 'pending';
  return v_row;
end $$;

revoke execute on function public.claim_player(uuid) from public, anon;
grant execute on function public.claim_player(uuid) to authenticated;
