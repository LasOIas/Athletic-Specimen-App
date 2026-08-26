-- 0061_action_log_prose.sql: the activity feed reads as sentences with names (C101 item 6, half A).
--
-- WHY. buildMgLogHTML renders "<b>actor</b> summary"; read_action_log builds summary as
-- action + " · " + detail, so the feed reads "set_team_paid · marked X paid". The Manage handoff drew
-- sentences. Prose is written AT WRITE TIME by the RPC that made the change (it already holds the names),
-- into a new action_log.prose column; read_action_log coalesces to the old action + detail for every
-- pre-C101 row, so the backlog stays readable and the client changes nothing.
--
-- PROSE IS A PREDICATE, not a sentence with a subject: lowercase verb, no actor, no markup, no trailing
-- period, because the client prints it after a bolded actor and escapes it ("marked Sand Sharks paid").
--
-- FIVE create or replace, each keeping its signature, DEFINER, search_path, guard, body and grants:
-- draw_pools_atomic, start_pool_play_atomic, register_team and set_member_role gain a whole action_log
-- insert (none of them wrote a row before; register_team never did in any generation); set_team_paid (0060)
-- gains the prose column. Every one supplies detail explicitly so a row stays readable if prose is blanked.
-- clear_bracket_atomic gets its prose in 0062, where it is recreated anyway.
--
-- register_team is granted to anon (0024) and that grant is re-issued verbatim: a player registering their
-- own team writes a row with actor 'anon' and role 'public' (_audit_actor has no auth.uid() to resolve),
-- about a registration it actually performed, and nothing else. The prose uses the team name the function
-- already validated, never raw input echoed back.
--
-- PRIVACY: set_member_role's prose stores an email address in action_log, a table with RLS on and no policy,
-- readable only through the organizer-gated read_action_log (the same audience list_admin_seats shows
-- emails to). Do not widen the log's read door without noticing this.
--
-- FREE RIDERS: the shipped raises with an em dash in these functions are rewritten as plain sentences.
--
-- APPLIED 2026-08-25 via the Supabase MCP (apply_migration), C101 inline round.

alter table public.action_log add column if not exists prose text;
comment on column public.action_log.prose is
  'A finished plain-text predicate written by the RPC that made the change ("marked Sand Sharks paid"). The client renders it after a bolded actor, so it carries no actor, no markup, no trailing period. NULL on pre-C101 rows, which fall back to action + detail.';

create or replace function public.read_action_log(p_limit integer default 50)
 returns table(at timestamp with time zone, actor text, summary text)
 language plpgsql security definer set search_path to 'public' as $fn$
declare v_community uuid := '2c3bcfa9-305e-448b-924b-da90c029f575';
begin
  if not public.is_organizer(v_community) then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  return query
    select feed.at, feed.actor, feed.summary
    from (
      select al.at as at,
             al.actor as actor,
             coalesce(nullif(btrim(al.prose), ''),
                      al.action || case when nullif(btrim(coalesce(al.detail, '')), '') is not null
                                        then ' · ' || al.detail else '' end)::text as summary
        from public.action_log al
      union all
      select ca.at as at,
             ca.actor as actor,
             (coalesce(nullif(btrim(coalesce(ca.request_text, '')), ''),
                       nullif(btrim(coalesce(ca.result, '')), ''),
                       ca.tool) || ' · co-pilot')::text as summary
        from public.copilot_actions ca
    ) feed
    order by feed.at desc nulls last
    limit greatest(1, least(coalesce(p_limit, 50), 200));
end $fn$;
revoke all on function public.read_action_log(integer) from public, anon;
grant execute on function public.read_action_log(integer) to authenticated;

create or replace function public.draw_pools_atomic(p_tournament_id uuid, p_pools jsonb, p_assignments jsonb) returns void
 language plpgsql security definer set search_path to 'public' as $fn$
declare v_community uuid; v_status text; v_tname text;
        v_pools int := coalesce(jsonb_array_length(p_pools), 0);
        v_actor text; v_role text; v_grp text;
begin
  select community_id, status, name into v_community, v_status, v_tname
    from public.tournaments where id = p_tournament_id;
  if not found then raise exception 'tournament not found'; end if;
  if not (public.is_organizer(v_community) or public.is_owner(v_community)) then
    raise exception 'Only an organizer can draw pools' using errcode = '42501';
  end if;
  if v_status is distinct from 'setup' then
    raise exception 'Pool play has already started. Reset pools first.';
  end if;

  delete from public.pools where tournament_id = p_tournament_id;

  insert into public.pools (tournament_id, label, display_order)
  select p_tournament_id, pl->>'label', (pl->>'display_order')::int
  from jsonb_array_elements(p_pools) pl;

  update public.teams t
    set pool_id = po.id
  from jsonb_array_elements(p_assignments) a
  join public.pools po on po.tournament_id = p_tournament_id and po.display_order = (a->>'display_order')::int
  where t.id = (a->>'team_id')::uuid and t.tournament_id = p_tournament_id;

  select a.actor, a.role, a.grp into v_actor, v_role, v_grp from public._audit_actor() a;
  insert into public.action_log(actor, role, grp, action, entity_type, entity_id, detail, prose)
    values (v_actor, coalesce(v_role,'admin'), v_grp, 'draw_pools', 'tournament', p_tournament_id::text,
            v_pools::text || ' pools',
            'drew ' || v_pools::text || ' pools for ' || coalesce(v_tname, 'the tournament'));
end $fn$;
revoke all on function public.draw_pools_atomic(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.draw_pools_atomic(uuid, jsonb, jsonb) to authenticated;

create or replace function public.start_pool_play_atomic(p_tournament_id uuid, p_matches jsonb) returns void
 language plpgsql security definer set search_path to 'public' as $fn$
declare v_community uuid; v_status text; v_count int; v_actor text; v_role text; v_grp text;
begin
  select community_id, status into v_community, v_status from public.tournaments where id = p_tournament_id;
  if not found then raise exception 'tournament not found'; end if;
  if not (public.is_organizer(v_community) or public.is_owner(v_community)) then
    raise exception 'Only an organizer can start pool play' using errcode = '42501';
  end if;
  if v_status is distinct from 'setup' then
    raise exception 'Pool play has already started. Reset pools first.';
  end if;

  select count(*) into v_count from jsonb_array_elements(p_matches);
  if v_count = 0 then raise exception 'No pool games to schedule. Each pool needs at least 2 teams.'; end if;

  delete from public.matches where tournament_id = p_tournament_id and phase = 'pool';

  insert into public.matches (tournament_id, phase, pool_id, team_a_id, team_b_id, status, net, queue_order, version)
  select p_tournament_id, 'pool',
    (m->>'pool_id')::uuid,
    nullif(m->>'team_a_id','')::uuid, nullif(m->>'team_b_id','')::uuid,
    'scheduled', (m->>'net')::int, (m->>'queue_order')::int, 0
  from jsonb_array_elements(p_matches) m;

  update public.tournaments set status = 'pools', updated_at = now() where id = p_tournament_id;

  select a.actor, a.role, a.grp into v_actor, v_role, v_grp from public._audit_actor() a;
  insert into public.action_log(actor, role, grp, action, entity_type, entity_id, detail, prose)
    values (v_actor, coalesce(v_role,'admin'), v_grp, 'start_pool_play', 'tournament', p_tournament_id::text,
            v_count::text || ' games',
            'started pool play, ' || v_count::text || ' games scheduled');
end $fn$;
revoke all on function public.start_pool_play_atomic(uuid, jsonb) from public, anon;
grant execute on function public.start_pool_play_atomic(uuid, jsonb) to authenticated;

create or replace function public.register_team(p_tournament_id uuid, p_team_name text, p_roster jsonb default '[]'::jsonb, p_contact text default null::text, p_paid boolean default false)
 returns public.teams
 language plpgsql security definer set search_path to 'public' as $fn$
declare
  t public.tournaments; nm text; roster_count int; new_team public.teams;
  v_actor text; v_role text; v_grp text;
begin
  select * into t from public.tournaments where id = p_tournament_id for update;
  if t.id is null then raise exception 'No such tournament.'; end if;
  if not coalesce(t.registration_open, false) then
    raise exception 'Registration is closed for this tournament.';
  end if;
  nm := btrim(coalesce(p_team_name, ''));
  if length(nm) < 1 then raise exception 'Team name is required.'; end if;
  select count(*) into roster_count
    from jsonb_array_elements_text(coalesce(p_roster, '[]'::jsonb)) e
   where btrim(e) <> '';
  if t.team_size is not null then
    if roster_count <> t.team_size then
      raise exception 'This tournament needs exactly % players per team.', t.team_size;
    end if;
  elsif roster_count < 2 then
    raise exception 'Add at least 2 players to register the team.';
  end if;
  if exists (select 1 from public.teams
              where tournament_id = p_tournament_id and lower(btrim(name)) = lower(nm)) then
    raise exception 'A team named "%" is already registered.', nm;
  end if;
  insert into public.teams (tournament_id, name, roster, contact, paid, community_id)
  values (p_tournament_id, nm, coalesce(p_roster,'[]'::jsonb),
          nullif(btrim(coalesce(p_contact,'')),''), coalesce(p_paid,false), t.community_id)
  returning * into new_team;
  perform public.link_roster_to_tournament(new_team.id, coalesce(p_roster,'[]'::jsonb), t.community_id);

  select a.actor, a.role, a.grp into v_actor, v_role, v_grp from public._audit_actor() a;
  insert into public.action_log(actor, role, grp, action, entity_type, entity_id, detail, prose)
    values (v_actor, coalesce(v_role,'public'), v_grp, 'register_team', 'team', new_team.id::text,
            nm, 'added ' || nm || ' to ' || coalesce(t.name, 'the tournament'));
  return new_team;
end $fn$;
revoke all on function public.register_team(uuid, text, jsonb, text, boolean) from public;
grant execute on function public.register_team(uuid, text, jsonb, text, boolean) to anon, authenticated;

create or replace function public.set_member_role(p_email text, p_role community_role) returns void
 language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_community uuid := '2c3bcfa9-305e-448b-924b-da90c029f575';
  v_profile uuid;
  v_current public.community_role;
  v_email text := btrim(coalesce(p_email, ''));
  v_actor text; v_role text; v_grp text;
begin
  if not public.is_owner(v_community) then
    raise exception 'Only the owner can change admin seats' using errcode = '42501';
  end if;
  if p_role = 'owner' then
    raise exception 'The owner seat can''t be assigned here';
  end if;
  select id into v_profile from public.profiles where lower(email) = lower(v_email) limit 1;
  if v_profile is null then
    raise exception 'No account for that email yet. Ask them to create one first.';
  end if;
  select role into v_current from public.memberships
    where profile_id = v_profile and community_id = v_community;
  if v_current = 'owner' then
    raise exception 'The owner seat can''t be changed here';
  end if;
  insert into public.memberships (profile_id, community_id, role, status)
  values (v_profile, v_community, p_role, 'active')
  on conflict (profile_id, community_id)
  do update set role = excluded.role, status = 'active';

  select a.actor, a.role, a.grp into v_actor, v_role, v_grp from public._audit_actor() a;
  insert into public.action_log(actor, role, grp, action, entity_type, entity_id, detail, prose)
    values (v_actor, coalesce(v_role,'admin'), v_grp, 'set_member_role', 'membership', v_profile::text,
            p_role::text,
            case when p_role = 'organizer' then 'made ' || v_email || ' an organizer'
                 else 'removed admin access for ' || v_email end);
end $fn$;
revoke all on function public.set_member_role(text, community_role) from public, anon;
grant execute on function public.set_member_role(text, community_role) to authenticated;

create or replace function public.set_team_paid(p_team uuid, p_paid boolean) returns public.teams
 language plpgsql security definer set search_path to 'public' as $fn$
declare v_comm uuid; v_name text; updated public.teams; v_actor text; v_role text; v_grp text; v_sentence text;
begin
  select t.community_id, t.name into v_comm, v_name from public.teams t where t.id = p_team;
  if v_comm is null then raise exception 'That team is not here any more.'; end if;
  if not (public.is_organizer(v_comm) or public.is_owner(v_comm)) then
    raise exception 'Only an organizer can change a payment' using errcode = '42501';
  end if;
  update public.teams set paid = coalesce(p_paid, false) where id = p_team returning * into updated;
  v_sentence := case when coalesce(p_paid,false) then 'marked ' || v_name || ' paid'
                     else 'marked ' || v_name || ' unpaid' end;
  select a.actor, a.role, a.grp into v_actor, v_role, v_grp from public._audit_actor() a;
  insert into public.action_log(actor, role, grp, action, entity_type, entity_id, detail, prose)
    values (v_actor, coalesce(v_role,'admin'), v_grp, 'set_team_paid', 'team', p_team::text,
            v_sentence, v_sentence);
  return updated;
end $fn$;
revoke all on function public.set_team_paid(uuid, boolean) from public, anon;
grant execute on function public.set_team_paid(uuid, boolean) to authenticated;
