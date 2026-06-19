-- 0019_c21_audit_actor.sql — C21 Phase 4: tighten the audit actor.
--
-- The four self-serve SECURITY DEFINER RPCs (check_in / check_out / register_player /
-- submit_match_score) hardcoded actor='anon' in action_log. Since C21 Phase 2 routed every
-- self-serve write (including admin per-card check-in/out) through these RPCs, an ADMIN action
-- was being logged as anonymous — the audit trail could not tell who did what.
--
-- Fix: a _audit_actor() helper resolves (actor, role, grp) from the caller's request JWT
-- (the app_metadata claims minted by the admin_login Edge Function). Genuine anonymous callers
-- (the anon key, no admin session) still log 'anon'/'public'/null. The two admin-only RPCs
-- (start_new_session, clear_bracket_atomic) are upgraded from a generic 'admin' to the specific
-- admin identity for a consistent trail.
--
-- request.jwt.claims is the per-request GUC set by PostgREST; it is readable inside a
-- SECURITY DEFINER function (the GUC is request-scoped, independent of the definer role switch).
-- Idempotent: CREATE OR REPLACE throughout. No client/app.js change; no APP_VERSION bump.
-- Admin codes intentionally NOT rotated (owner decision 2026-06-19: nothing sensitive behind
-- the admin gate; the Phase 3 RLS lock remains the data-integrity boundary for anon writes).

create or replace function public._audit_actor(out actor text, out role text, out grp text)
language plpgsql
stable
as $$
declare claims jsonb; app jsonb;
begin
  begin
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    claims := null;
  end;
  app := claims -> 'app_metadata';
  if app is not null and (coalesce(app->>'admin','') = 'true' or coalesce(app->>'role','') in ('owner','group_admin')) then
    role  := coalesce(nullif(app->>'role',''), 'admin');
    grp   := app->>'group';
    actor := coalesce(nullif(claims->>'email',''), role, 'admin');
  else
    actor := 'anon';
    role  := 'public';
    grp   := null;
  end if;
end $$;

-- Internal helper: callable only by the function owner (postgres) and service_role; the six
-- SECURITY DEFINER RPCs run as postgres so they can call it. Not an API surface.
revoke execute on function public._audit_actor() from public;
revoke execute on function public._audit_actor() from anon;
revoke execute on function public._audit_actor() from authenticated;

create or replace function public.check_in(p_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare v_actor text; v_role text; v_grp text;
begin
  update public.players set checked_in=true where id=p_id;
  if not found then raise exception 'player not found'; end if;
  insert into public.check_ins(session_id, player_id)
    values (public.current_session_id(), p_id)
    on conflict (session_id, player_id) do nothing;
  select a.actor, a.role, a.grp into v_actor, v_role, v_grp from public._audit_actor() a;
  insert into public.action_log(actor, role, grp, action, entity_type, entity_id)
    values (v_actor, v_role, v_grp, 'check_in','players', p_id::text);
end $$;

create or replace function public.check_out(p_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare v_sid uuid; v_actor text; v_role text; v_grp text;
begin
  update public.players set checked_in=false where id=p_id;
  if not found then raise exception 'player not found'; end if;
  select id into v_sid from public.attendance_sessions where is_active limit 1;
  if v_sid is not null then
    delete from public.check_ins where session_id=v_sid and player_id=p_id;
  end if;
  select a.actor, a.role, a.grp into v_actor, v_role, v_grp from public._audit_actor() a;
  insert into public.action_log(actor, role, grp, action, entity_type, entity_id)
    values (v_actor, v_role, v_grp, 'check_out','players', p_id::text);
end $$;

create or replace function public.register_player(p_name text, p_group text default ''::text, p_checked_in boolean default false)
 returns table(id uuid, name text, checked_in boolean, "group" text)
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_name  text := btrim(coalesce(p_name, ''));
  v_group text := btrim(coalesce(p_group, ''));
  v_id    uuid;
  v_actor text; v_role text; v_grp text;
begin
  if v_name = '' then raise exception 'name required'; end if;
  if length(v_name)  > 80 then raise exception 'name too long (max 80)';  end if;
  if length(v_group) > 80 then raise exception 'group too long (max 80)'; end if;

  select pl.id into v_id from public.players pl
    where lower(btrim(pl.name)) = lower(v_name)
      and coalesce(pl."group",'') = coalesce(v_group,'')
      and left(pl.name, 5) <> '__as_'
    limit 1;

  if v_id is null then
    begin
      insert into public.players(name, skill, checked_in, "group")
        values (v_name, 0, coalesce(p_checked_in, false), v_group)
        returning players.id into v_id;
      select a.actor, a.role, a.grp into v_actor, v_role, v_grp from public._audit_actor() a;
      insert into public.action_log(actor, role, grp, action, entity_type, entity_id, detail)
        values (v_actor, v_role, v_grp, 'register','players', v_id::text, v_name);
    exception when unique_violation then
      select pl.id into v_id from public.players pl
        where lower(btrim(pl.name)) = lower(v_name)
          and coalesce(pl."group",'') = coalesce(v_group,'')
          and left(pl.name, 5) <> '__as_'
        limit 1;
    end;
  end if;

  if coalesce(p_checked_in, false) then
    update public.players set checked_in=true where players.id = v_id;
    insert into public.check_ins(session_id, player_id)
      values (public.current_session_id(), v_id)
      on conflict (session_id, player_id) do nothing;
  end if;

  return query
    select pl.id, pl.name, pl.checked_in, pl."group"
    from public.players pl where pl.id = v_id;
end $$;

create or replace function public.submit_match_score(p_match uuid, p_version integer, p_score_a integer default null::integer, p_score_b integer default null::integer, p_winner_side text default null::text)
 returns matches
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare m public.matches; updated public.matches; side text; win uuid; lose uuid; col text;
        is_gf boolean; wb_won_gf boolean; decisive boolean;
        v_actor text; v_role text; v_grp text;
begin
  select * into m from public.matches where id = p_match;
  if not found then raise exception 'match not found'; end if;
  if m.team_a_id is null or m.team_b_id is null then raise exception 'both teams are not set yet'; end if;
  if m.status = 'final' then raise exception 'already final'; end if;

  if p_score_a is not null and p_score_b is not null then
    if p_score_a < 0 or p_score_b < 0 then raise exception 'scores must be >= 0'; end if;
    if p_score_a = p_score_b then raise exception 'ties are not allowed'; end if;
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
end $$;

create or replace function public.start_new_session(p_label text default null::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare v_id uuid; v_actor text; v_role text; v_grp text;
begin
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
end $$;

create or replace function public.clear_bracket_atomic(p_match uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_tournament uuid;
  to_reset uuid[];
  r record;
  v_actor text; v_role text; v_grp text;
begin
  select tournament_id into v_tournament from public.matches where id = p_match;
  if not found then raise exception 'match not found'; end if;

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
end $$;
