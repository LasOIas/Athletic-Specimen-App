-- 0054: registration writes tournament identity, never the pickup roster (spec §4).
begin;

create or replace function public.link_roster_to_tournament(
  p_team_id uuid, p_roster jsonb, p_community_id uuid)
returns void language plpgsql security definer set search_path to 'public' as
$$
declare
  v_comm uuid := coalesce(p_community_id,
                          (select id from public.communities order by created_at limit 1));
  nm text; v_norm text; v_tp uuid;
begin
  for nm in
    select distinct btrim(e)
      from jsonb_array_elements_text(coalesce(p_roster,'[]'::jsonb)) e
     where btrim(e) <> ''
  loop
    v_norm := public.normalize_person_name(nm);
    -- 1) a LINKED person with this name -> the app already knows them (spec §4.2)
    select id into v_tp from public.tournament_players
     where community_id = v_comm and profile_id is not null
       and public.normalize_person_name(real_name) = v_norm
     order by created_at limit 1;
    -- 2) else the earliest UNCLAIMED person-row with this name
    if v_tp is null then
      select id into v_tp from public.tournament_players
       where community_id = v_comm and profile_id is null
         and public.normalize_person_name(real_name) = v_norm
       order by created_at limit 1;
    end if;
    -- 3) else a new unclaimed person
    if v_tp is null then
      insert into public.tournament_players (community_id, real_name)
      values (v_comm, nm) returning id into v_tp;
    end if;
    insert into public.team_members (team_id, tournament_player_id, community_id)
    values (p_team_id, v_tp, v_comm)
    on conflict (team_id, tournament_player_id) where tournament_player_id is not null
    do nothing;
  end loop;
end $$;
revoke all on function public.link_roster_to_tournament(uuid, jsonb, uuid) from public, anon, authenticated;

-- register_team: body identical to the LIVE def except the final perform line
-- (guards: row-lock, reg_open, team_size, dup name — copied verbatim from production).
create or replace function public.register_team(
  p_tournament_id uuid, p_team_name text, p_roster jsonb default '[]'::jsonb,
  p_contact text default null, p_paid boolean default false)
returns public.teams language plpgsql security definer set search_path to 'public' as
$$
declare
  t public.tournaments; nm text; roster_count int; new_team public.teams;
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
  return new_team;
end $$;

-- Manage roster edits run the same resolver; replaces stale tournament_player links for the team.
create or replace function public.sync_team_roster(p_team_id uuid, p_roster jsonb)
returns void language plpgsql security definer set search_path to 'public' as
$$
declare v_comm uuid;
begin
  select community_id into v_comm from public.teams where id = p_team_id;
  if v_comm is null then raise exception 'team not found'; end if;
  delete from public.team_members
   where team_id = p_team_id and tournament_player_id is not null;
  perform public.link_roster_to_tournament(p_team_id, p_roster, v_comm);
end $$;

drop function if exists public.link_roster_to_team(uuid, jsonb, uuid);
commit;
