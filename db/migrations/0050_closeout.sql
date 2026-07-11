-- 0050_closeout.sql
-- Task 10 (Manage → Close out, session-10 pick R12) — THE JUNE-FAILURE FIX. In June the tournament never got
-- a deliberate close: status drifted, no champion was recorded, and History showed "No champion recorded" for
-- an event that plainly had a winner. This migration makes closing DELIBERATE and REVERSIBLE:
--   1. a stored champion (`tournaments.champion_team_id`) so History reads a FACT, not a re-derivation, and
--   2. two SECURITY DEFINER RPCs that flip status as one guarded, atomic action (close / reopen).
--
-- GUARD idiom (identical to the 0039 scoring guards + the 0048 atomic pool ops): an in-body
--   is_organizer / is_owner check on the tournament's community_id. Because the RPC runs as its owner
--   (SECURITY DEFINER), the guard helpers stay callable even though anon/public EXECUTE was revoked in 0038 —
--   and auth.uid() still reads the REAL caller's JWT, so the role check evaluates the actual caller.
-- GRANTS: EXECUTE to authenticated only; revoked from public + anon (closing is never an anon action).
--
-- REOPEN PRESERVES THE RECORDED CHAMPION (deliberate design choice):
--   reopen_tournament does NOT clear champion_team_id. The common reason to reopen is a quick score fix or a
--   re-crown after a mistake — wiping the champion on the way in would lose a correct fact for the far more
--   likely "reopen, tweak one score, close again" path. The recorded champion is only ever overwritten by the
--   NEXT close_tournament call (which sets champion_team_id to whatever the admin picks — possibly null).
--
-- APPLIED BY THE CONTROLLER via the authed Supabase MCP (a builder never applies migrations). Until it lands
-- the client degrades honestly — the RPC-not-found error surfaces a friendly "server is still updating" notice
-- and does NOT fall back to a direct status write.

-- The stored champion. ON DELETE SET NULL: if the champion team is later deleted, the column self-heals to
-- null (History falls back to the computed champion, then to "No champion recorded") rather than dangling.
alter table public.tournaments
  add column if not exists champion_team_id uuid references public.teams(id) on delete set null;

-- ==========================================================================
-- close_tournament — the deliberate end. Records the champion (null = no champion recorded, allowed) + sets
-- status='completed' + closes registration, in one guarded transaction. Only from an ACTIVE tournament
-- (pools/bracket) — closing from 'setup' is the June mistake (nothing has happened yet), so it errors.
-- ==========================================================================
create or replace function public.close_tournament(p_tournament_id uuid, p_champion_team_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_community uuid; v_status text;
begin
  select community_id, status into v_community, v_status from public.tournaments where id = p_tournament_id;
  if not found then raise exception 'tournament not found'; end if;
  -- ORGANIZER GUARD (mirrors 0039/0048): closing a tournament is an admin action.
  if not (public.is_organizer(v_community) or public.is_owner(v_community)) then
    raise exception 'Only an organizer can close a tournament' using errcode = '42501';
  end if;
  -- Only close an ACTIVE tournament. Closing from 'setup' is exactly the June failure (nothing played yet);
  -- 'completed' is already closed (use reopen first). Guard both.
  if v_status = 'setup' then
    raise exception 'Nothing to close yet — the tournament has not started';
  end if;
  if v_status not in ('pools', 'bracket') then
    raise exception 'This tournament is not in progress';
  end if;
  -- A recorded champion must be one of THIS tournament's teams. null is allowed (no champion recorded).
  if p_champion_team_id is not null and not exists (
    select 1 from public.teams where id = p_champion_team_id and tournament_id = p_tournament_id
  ) then
    raise exception 'That team is not in this tournament' using errcode = '23503';
  end if;

  update public.tournaments
     set status = 'completed',
         champion_team_id = p_champion_team_id,
         registration_open = false,
         updated_at = now()
   where id = p_tournament_id;
end $function$;

revoke all on function public.close_tournament(uuid, uuid) from public, anon;
grant execute on function public.close_tournament(uuid, uuid) to authenticated;

-- ==========================================================================
-- reopen_tournament — the undo. Only from 'completed'. Restores the phase the tournament was in: if any main
-- (bracket) matches exist it goes back to 'bracket', otherwise to 'pools'. KEEPS the recorded champion (see the
-- header note) and leaves registration closed — reopening is for fixing play, not re-opening sign-ups.
-- ==========================================================================
create or replace function public.reopen_tournament(p_tournament_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_community uuid; v_status text; v_has_main boolean;
begin
  select community_id, status into v_community, v_status from public.tournaments where id = p_tournament_id;
  if not found then raise exception 'tournament not found'; end if;
  if not (public.is_organizer(v_community) or public.is_owner(v_community)) then
    raise exception 'Only an organizer can reopen a tournament' using errcode = '42501';
  end if;
  if v_status is distinct from 'completed' then
    raise exception 'Only a completed tournament can be reopened';
  end if;

  select exists (
    select 1 from public.matches where tournament_id = p_tournament_id and phase = 'main'
  ) into v_has_main;

  -- Restore the phase; champion_team_id is intentionally untouched (see the header note).
  update public.tournaments
     set status = case when v_has_main then 'bracket' else 'pools' end,
         updated_at = now()
   where id = p_tournament_id;
end $function$;

revoke all on function public.reopen_tournament(uuid) from public, anon;
grant execute on function public.reopen_tournament(uuid) to authenticated;
