-- 0055: authorization guard on sync_team_roster (security fix).
--
-- Found 2026-07-12 (session 12) while smoking the identity roster-edit path: sync_team_roster is
-- SECURITY DEFINER with `grant execute ... to authenticated` and had NO membership check in its body.
-- The 0052 RLS lockdown guards DIRECT table writes, but a DEFINER RPC bypasses RLS by design, so the
-- boundary must live inside the function. Without it ANY signed-in user (a plain 'player'/spectator who
-- created an account — not just the 4 admins) could POST /rest/v1/rpc/sync_team_roster with any team_id
-- and rewrite that team's tournament roster. Same class as the W-F03 anon-score-overwrite P0, scoped to
-- authenticated-but-not-organizer.
--
-- Fix: add the exact organizer guard used by close_tournament/reopen_tournament (0050) after the
-- community is resolved. The app's admin path always holds a real owner/organizer session, so nothing
-- legitimate breaks; public self-registration is unaffected (it uses register_team, which creates its
-- OWN team and is intentionally anon). Body otherwise byte-identical to 0054.
--
-- Verified in a rolled-back transaction before apply (jwt-claims impersonation):
--   * no-membership authenticated caller -> 42501, target roster unchanged;
--   * owner (Mike) -> allowed, resolver still correct (add/remove), pickup players untouched.
begin;

create or replace function public.sync_team_roster(p_team_id uuid, p_roster jsonb)
returns void language plpgsql security definer set search_path to 'public' as
$$
declare v_comm uuid;
begin
  select community_id into v_comm from public.teams where id = p_team_id;
  if v_comm is null then raise exception 'team not found'; end if;
  -- ORGANIZER GUARD (mirrors 0050 close_tournament): editing a team roster is an admin action.
  if not (public.is_organizer(v_comm) or public.is_owner(v_comm)) then
    raise exception 'Only an organizer can edit a team roster' using errcode = '42501';
  end if;
  delete from public.team_members
   where team_id = p_team_id and tournament_player_id is not null;
  perform public.link_roster_to_tournament(p_team_id, p_roster, v_comm);
end $$;

commit;
