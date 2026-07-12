-- 0056: organizer guards on the remaining ungated admin DEFINER RPCs (security fix, sibling of 0055).
--
-- Sweep after 0055 (sync_team_roster): three more SECURITY DEFINER functions granted to `authenticated`
-- carried no membership check, so any signed-in user (not just the 4 admins) could call them directly:
--   * clear_bracket_atomic(p_match)  — DESTRUCTIVE: wipes bracket scores/winners, reverts a completed
--     tournament to 'bracket'. No client caller today (the CLEAR UI was deleted in v.22) but still
--     grantable to authenticated → reachable via a direct REST call.
--   * start_new_session(p_label)     — DESTRUCTIVE: ends the active attendance session and checks the
--     ENTIRE roster out. The app treats this as the most destructive admin action; the RPC was ungated.
--   * log_copilot_action(...)        — integrity: any authenticated user could forge audit-log rows.
-- Latent P0: exposure is ~nil today (only the owner has an account) but goes live the moment players
-- sign up to claim themselves (the identity arc's whole purpose).
--
-- Fix: the same organizer guard used by 0050/0055 — `is_organizer(comm) OR is_owner(comm)`, resolved
-- from the row the RPC touches (clear: match→tournament.community_id) or the sole community (the two
-- global single-tenant ops). Bodies otherwise byte-identical to their live definitions. The app's admin
-- callers always hold an owner/organizer session, so nothing legitimate breaks.
--
-- Verified in a rolled-back transaction (jwt-claims impersonation): no-membership caller -> 42501 on all
-- three (roster NOT checked out); owner -> passes the guard on all three.
begin;

-- clear_bracket_atomic: guard from the match's tournament community; body unchanged (0014).
create or replace function public.clear_bracket_atomic(p_match uuid)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_tournament uuid; v_comm uuid;
  to_reset uuid[]; r record; v_actor text; v_role text; v_grp text;
begin
  select m.tournament_id, t.community_id into v_tournament, v_comm
    from public.matches m join public.tournaments t on t.id = m.tournament_id
   where m.id = p_match;
  if v_tournament is null then raise exception 'match not found'; end if;
  if not (public.is_organizer(v_comm) or public.is_owner(v_comm)) then
    raise exception 'Only an organizer can clear a bracket' using errcode = '42501';
  end if;

  with recursive chain as (
    select id, winner_next_match_id, loser_next_match_id
      from public.matches where id = p_match
    union
    select n.id, n.winner_next_match_id, n.loser_next_match_id
      from chain c
      join public.matches n on n.id in (c.winner_next_match_id, c.loser_next_match_id)
     where n.status <> 'scheduled'
  )
  select array_agg(id) into to_reset from chain;

  for r in select * from public.matches where id = any(to_reset) loop
    if r.winner_next_match_id is not null then
      if r.winner_next_slot = 1 then update public.matches set team_b_id = null where id = r.winner_next_match_id;
      else update public.matches set team_a_id = null where id = r.winner_next_match_id; end if;
    end if;
    if r.loser_next_match_id is not null then
      if r.loser_next_slot = 1 then update public.matches set team_b_id = null where id = r.loser_next_match_id;
      else update public.matches set team_a_id = null where id = r.loser_next_match_id; end if;
    end if;
  end loop;

  update public.matches
     set score_a=null, score_b=null, winner_team_id=null, loser_team_id=null, status='scheduled', updated_at=now()
   where id = any(to_reset);

  update public.tournaments set status='bracket', updated_at=now()
   where id = v_tournament and status = 'completed';

  select a.actor, a.role, a.grp into v_actor, v_role, v_grp from public._audit_actor() a;
  insert into public.action_log(actor, role, grp, action, entity_type, entity_id, detail)
    values (v_actor, coalesce(v_role,'admin'), v_grp, 'clear_bracket','main_match', p_match::text,
            coalesce(array_length(to_reset,1),0)::text || ' matches reset');
end $fn$;

-- start_new_session: guard on the sole community; body unchanged (0015).
create or replace function public.start_new_session(p_label text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $fn$
declare v_id uuid; v_comm uuid; v_actor text; v_role text; v_grp text;
begin
  v_comm := (select id from public.communities order by created_at limit 1);
  if not (public.is_organizer(v_comm) or public.is_owner(v_comm)) then
    raise exception 'Only an organizer can start a new session' using errcode = '42501';
  end if;
  update public.attendance_sessions set is_active=false, ended_at=now() where is_active;
  insert into public.attendance_sessions(label)
    values (coalesce(nullif(btrim(coalesce(p_label,'')),''),
                     to_char(now() at time zone 'America/Denver','Dy Mon DD')))
    returning id into v_id;
  update public.players set checked_in=false where checked_in=true;
  select a.actor, a.role, a.grp into v_actor, v_role, v_grp from public._audit_actor() a;
  insert into public.action_log(actor, role, grp, action, entity_type, entity_id, detail)
    values (v_actor, coalesce(v_role,'admin'), v_grp, 'start_new_session','attendance_sessions', v_id::text,
            'new session started; all players checked out');
  return v_id;
end $fn$;

-- log_copilot_action: guard on the sole community; body unchanged (0020). The copilot is already
-- admin-role-gated to reach, so the guard only closes the direct-REST door.
create or replace function public.log_copilot_action(p_request text, p_tool text, p_args jsonb, p_result text, p_undone boolean)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare a record; v_comm uuid;
begin
  v_comm := (select id from public.communities order by created_at limit 1);
  if not (public.is_organizer(v_comm) or public.is_owner(v_comm)) then
    raise exception 'Only an organizer can log a copilot action' using errcode = '42501';
  end if;
  select * into a from public._audit_actor();
  insert into public.copilot_actions(actor, role, request_text, tool, args, result, undone)
  values (a.actor, a.role, p_request, p_tool, coalesce(p_args, '{}'::jsonb), p_result, coalesce(p_undone, false));
end $fn$;

commit;
