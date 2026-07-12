-- 0053: tournament identity (spec 2026-07-11). The tournament-people list, separate from pickup.
begin;

create or replace function public.normalize_person_name(p text)
returns text language sql immutable set search_path to '' as
$$ select lower(regexp_replace(btrim(coalesce(p,'')), '\s+', ' ', 'g')) $$;

create table if not exists public.tournament_players (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id),
  real_name    text not null check (btrim(real_name) <> ''),
  profile_id   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists tournament_players_name_idx
  on public.tournament_players (community_id, public.normalize_person_name(real_name));
create index if not exists tournament_players_profile_idx
  on public.tournament_players (profile_id) where profile_id is not null;

alter table public.team_members add column if not exists tournament_player_id uuid
  references public.tournament_players(id) on delete restrict;
create unique index if not exists team_members_team_tp_uidx
  on public.team_members (team_id, tournament_player_id) where tournament_player_id is not null;
-- player_id (pickup) was part of the composite PK — swap to a surrogate PK so identity rows can
-- carry a NULL player_id. The table is EMPTY today (rosters live in teams.roster jsonb; the
-- 0042-era rows were test-cleaned), so this restructure touches zero rows. A FULL unique on
-- (team_id, player_id) keeps the legacy ON CONFLICT target valid until 0054 replaces the fn
-- (NULLs are distinct in a unique btree, so identity-only rows never collide on it).
alter table public.team_members drop constraint team_members_pkey;
alter table public.team_members add column if not exists id uuid not null default gen_random_uuid();
alter table public.team_members add primary key (id);
alter table public.team_members add constraint team_members_team_player_key unique (team_id, player_id);
alter table public.team_members alter column player_id drop not null;

alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name  text;

alter table public.player_claims add column if not exists tournament_player_id uuid
  references public.tournament_players(id) on delete set null;
alter table public.player_claims alter column player_id drop not null;

-- RLS: 0052 posture. Public roster faces are readable; writes are organizer-gated;
-- the ONLY anon-reachable write path is the SECURITY DEFINER registration/claim fns.
alter table public.tournament_players enable row level security;
create policy tp_anon_read on public.tournament_players for select using (true);
create policy tp_org_write on public.tournament_players for all
  using (public.is_organizer(community_id) or public.is_owner(community_id))
  with check (public.is_organizer(community_id) or public.is_owner(community_id));
revoke insert, update, delete on public.tournament_players from anon;
grant select on public.tournament_players to anon, authenticated;
grant insert, update, delete on public.tournament_players to authenticated; -- policies gate

-- handle_new_user: carry first/last from sign-up metadata (spec §2/§6).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to 'public' as
$$
begin
  insert into public.profiles (id, display_name, email, first_name, last_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    new.email,
    nullif(btrim(coalesce(new.raw_user_meta_data->>'first_name','')), ''),
    nullif(btrim(coalesce(new.raw_user_meta_data->>'last_name','')), '')
  )
  on conflict (id) do update
    set first_name = coalesce(public.profiles.first_name, excluded.first_name),
        last_name  = coalesce(public.profiles.last_name,  excluded.last_name);
  return new;
end $$;

-- The match engine (spec §3): connect-once, never-steal, link ALL unclaimed exact matches.
create or replace function public.connect_profile_by_name(p_first text, p_last text)
returns jsonb language plpgsql security definer set search_path to 'public' as
$$
declare
  v_uid uuid := auth.uid();
  v_norm text;
  v_tp int := 0; v_pk int := 0; v_collision boolean := false;
begin
  if v_uid is null then raise exception 'must be signed in'; end if;
  if btrim(coalesce(p_first,'')) = '' or btrim(coalesce(p_last,'')) = '' then
    raise exception 'first and last name are required';
  end if;

  update public.profiles
     set first_name = btrim(p_first), last_name = btrim(p_last)
   where id = v_uid;

  v_norm := public.normalize_person_name(p_first || ' ' || p_last);

  -- (a) tournament people: link every unclaimed exact match (same person by rule).
  update public.tournament_players
     set profile_id = v_uid
   where profile_id is null
     and public.normalize_person_name(real_name) = v_norm;
  get diagnostics v_tp = row_count;

  -- (b) pickup roster: claim every unclaimed exact match (instant, audited).
  update public.players
     set claimed_by_profile = v_uid
   where claimed_by_profile is null
     and public.normalize_person_name(name) = v_norm;
  get diagnostics v_pk = row_count;
  insert into public.player_claims (player_id, profile_id, community_id, status)
  select p.id, v_uid, p.community_id, 'approved'
    from public.players p
   where p.claimed_by_profile = v_uid
     and not exists (select 1 from public.player_claims c
                      where c.player_id = p.id and c.profile_id = v_uid);

  -- collision flag: an exact-name row exists but belongs to someone else (claim page once).
  select exists (
    select 1 from public.tournament_players
     where profile_id is not null and profile_id <> v_uid
       and public.normalize_person_name(real_name) = v_norm
    union all
    select 1 from public.players
     where claimed_by_profile is not null and claimed_by_profile <> v_uid
       and public.normalize_person_name(name) = v_norm
  ) into v_collision;

  return jsonb_build_object('tournament_linked', v_tp, 'pickup_claimed', v_pk,
                            'collision', v_collision);
end $$;
revoke all on function public.connect_profile_by_name(text, text) from public, anon;
grant execute on function public.connect_profile_by_name(text, text) to authenticated;

-- Claim-page fallback for a tournament person (mirrors claim_player's guards).
create or replace function public.claim_tournament_player(p_tp uuid)
returns public.player_claims language plpgsql security definer set search_path to 'public' as
$$
declare
  v_uid uuid := auth.uid();
  v_comm uuid; v_owner uuid; v_row public.player_claims;
begin
  if v_uid is null then raise exception 'must be signed in'; end if;
  select community_id, profile_id into v_comm, v_owner
    from public.tournament_players where id = p_tp for update;
  if v_comm is null then raise exception 'not found'; end if;
  if v_owner is not null and v_owner <> v_uid then raise exception 'already claimed'; end if;
  update public.tournament_players set profile_id = v_uid where id = p_tp;
  insert into public.player_claims (tournament_player_id, profile_id, community_id, status)
  values (p_tp, v_uid, v_comm, 'approved') returning * into v_row;
  return v_row;
end $$;
revoke all on function public.claim_tournament_player(uuid) from public, anon;
grant execute on function public.claim_tournament_player(uuid) to authenticated;

commit;
