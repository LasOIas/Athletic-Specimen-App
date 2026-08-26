-- 0060_set_team_paid.sql: mark a team paid or unpaid through one DEFINER RPC that also logs it (C87, C101).
--
-- WHY. The Manage handoff said "Logged in the activity log with your name". The paid flag was a direct
-- teams UPDATE under the organizer policy, and action_log has RLS on with NO policy, so only a SECURITY
-- DEFINER function can ever leave a row there. This RPC writes teams.paid and the log row in one call and
-- RETURNS the team row, so the client verifies from the returned row instead of re-reading the tournament.
--
-- GUARDS: the team exists, then organizer or owner of the team's community (teams.community_id is NOT NULL
-- with a default since 0035, so the guard cannot be skipped by a null). Nothing else, deliberately: a
-- completed tournament does NOT refuse a payment change, because paid is a money fact and not a result.
-- Do not "fix" that later.
--
-- LOG ROW: action 'set_team_paid', entity 'team', detail 'marked <team> paid' or '... unpaid'. The prose
-- column arrives in 0061, which rewrites this function to carry the same sentence there too.
--
-- ROLLBACK: drop function if exists public.set_team_paid(uuid, boolean); and return the three client call sites to the direct teams update (v2026.08.25.37 app.js).
--
-- APPLIED 2026-08-25 via the Supabase MCP (apply_migration), C101 inline round.

create or replace function public.set_team_paid(p_team uuid, p_paid boolean) returns public.teams
 language plpgsql security definer set search_path to 'public' as $fn$
declare v_comm uuid; v_name text; updated public.teams; v_actor text; v_role text; v_grp text;
begin
  select t.community_id, t.name into v_comm, v_name from public.teams t where t.id = p_team;
  if v_comm is null then raise exception 'That team is not here any more.'; end if;
  if not (public.is_organizer(v_comm) or public.is_owner(v_comm)) then
    raise exception 'Only an organizer can change a payment' using errcode = '42501';
  end if;
  update public.teams set paid = coalesce(p_paid, false) where id = p_team returning * into updated;
  select a.actor, a.role, a.grp into v_actor, v_role, v_grp from public._audit_actor() a;
  insert into public.action_log(actor, role, grp, action, entity_type, entity_id, detail)
    values (v_actor, coalesce(v_role,'admin'), v_grp, 'set_team_paid', 'team', p_team::text,
            case when coalesce(p_paid,false) then 'marked ' || v_name || ' paid'
                 else 'marked ' || v_name || ' unpaid' end);
  return updated;
end $fn$;
revoke all on function public.set_team_paid(uuid, boolean) from public, anon;
grant execute on function public.set_team_paid(uuid, boolean) to authenticated;
