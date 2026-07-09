-- 0042_register_team_creates_members.sql — Slice 3a (personal-layer forward build).
-- Additive: team registration now creates players + team_members so future tournaments have the data the
-- personal layer needs (claim -> "my team"). No backfill of the finished June tournament (Mike: forward only).
-- Applied to prod 2026-07-08 via apply_migration/execute_sql, verified by SQL integration on a throwaway
-- tournament, then recorded here. Spec: docs/superpowers/specs/2026-07-08-personal-layer-forward-build.md;
-- plan: docs/superpowers/plans/2026-07-08-personal-layer-slice-3a-data-foundation.md.
--
-- Identity policy (Mike): REUSE same-name, else create. A PRE-EXISTING global unique index
-- players_real_name_group_uidx on (lower(btrim(name)), coalesce(group,'')) guarantees name+group is unique,
-- so we can never create a duplicate name in the null-group slot -> the helper reuses the earliest same-name
-- player in the community and creates a fresh unrated (skill 0) row only when none exists. (This is why the
-- original spec's ">1 ambiguous -> create new" branch was dropped during the build: it was unreachable for
-- created players and would have violated the index.)
--
-- Migration numbering: the deferred cutover stays reserved (RLS 0039 / scoring 0040 / retire-code 0041);
-- this additive foundation took 0042.

-- Internal helper: find-or-create players per the reuse policy + link team_members. SECURITY DEFINER so it
-- writes past RLS; internal only (execute revoked from public/anon; reached via register_team/sync_team_roster).
create or replace function public.link_roster_to_team(p_team_id uuid, p_roster jsonb, p_community_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_comm uuid := coalesce(p_community_id, (select id from public.communities order by created_at limit 1));
  nm text;
  v_player uuid;
begin
  for nm in
    select distinct btrim(e)
    from jsonb_array_elements_text(coalesce(p_roster,'[]'::jsonb)) e
    where btrim(e) <> ''
  loop
    -- reuse the earliest existing player with this name in the community; create only if none exists.
    select id into v_player
      from public.players
      where community_id = v_comm and lower(btrim(name)) = lower(nm)
      order by created_at
      limit 1;
    if v_player is null then
      insert into public.players (name, community_id, skill) values (nm, v_comm, 0) returning id into v_player;
    end if;
    insert into public.team_members (team_id, player_id, community_id)
      values (p_team_id, v_player, v_comm)
      on conflict (team_id, player_id) do nothing;
  end loop;
end $$;

-- internal helper: reachable ONLY via the SECURITY DEFINER register_team / sync_team_roster (which run as
-- owner), never callable directly by a client role (else a signed-in non-admin could stuff arbitrary rosters).
revoke execute on function public.link_roster_to_team(uuid, jsonb, uuid) from public, anon, authenticated;

-- register_team rewrite: the EXACT prior body (validation preserved) + stamp community_id on the team +
-- link the roster before returning. Signature + return type unchanged (callers untouched).
create or replace function public.register_team(p_tournament_id uuid, p_team_name text, p_roster jsonb DEFAULT '[]'::jsonb, p_contact text DEFAULT NULL::text, p_paid boolean DEFAULT false)
returns teams language plpgsql security definer set search_path = public as $$
declare
  t public.tournaments;
  nm text;
  roster_count int;
  new_team public.teams;
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

  if exists (
    select 1 from public.teams
    where tournament_id = p_tournament_id and lower(btrim(name)) = lower(nm)
  ) then
    raise exception 'A team named "%" is already registered.', nm;
  end if;
  insert into public.teams (tournament_id, name, roster, contact, paid, community_id)
    values (p_tournament_id, nm, coalesce(p_roster, '[]'::jsonb),
            nullif(btrim(coalesce(p_contact, '')), ''), coalesce(p_paid, false), t.community_id)
    returning * into new_team;

  perform public.link_roster_to_team(new_team.id, coalesce(p_roster, '[]'::jsonb), t.community_id);
  return new_team;
end;
$$;

-- sync_team_roster (Slice 3a Task 2): routes admin edit-roster (tdbSetTeamRoster) through the same helper,
-- so an admin-edited roster keeps its player links. Additive — adds missing links; does NOT prune names
-- removed from the roster (pruning could drop a claimed link; deferred). authenticated-only.
create or replace function public.sync_team_roster(p_team_id uuid, p_roster jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_comm uuid;
begin
  select community_id into v_comm from public.teams where id = p_team_id;
  if v_comm is null then raise exception 'team not found'; end if;
  perform public.link_roster_to_team(p_team_id, p_roster, v_comm);
end $$;

revoke execute on function public.sync_team_roster(uuid, jsonb) from public, anon;
grant execute on function public.sync_team_roster(uuid, jsonb) to authenticated;
