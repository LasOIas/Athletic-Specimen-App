-- 0024_tournament_team_self_registration.sql
-- Tournament team self-registration — replaces the Google Form (AS-custom tournament wave, build 1).
-- Applied to prod mlzblkzflgylnjorgjcp via apply_migration (name: tournament_team_self_registration).
--
-- AS runs tournaments as self-organized 4s teams that pre-register (team name + 4 player NAMES + a
-- "did you pay?" flag, payment via a host Venmo link). Co-ed rule (>=1 guy + >=1 girl) is a sign-up
-- REMINDER only, not tracked. Roster players are names (not app players), so they live as a jsonb
-- array on the team; linking to app players (profiles/find-my-team) is a later item. Additive + idempotent.
-- Spec: 03-anatomy/how-we-run-tournaments.md. Ranked plan: 13-upgrade-options/2026-06-25-tournament-legit.md.

alter table public.tournaments
  add column if not exists registration_open boolean not null default false,
  add column if not exists venmo_link text,
  add column if not exists buy_in text;  -- display text shown to teams, e.g. "$80 per team"

alter table public.teams
  add column if not exists roster jsonb not null default '[]'::jsonb,  -- array of player name strings
  add column if not exists paid boolean not null default false,
  add column if not exists contact text;                              -- optional captain contact

-- Anon write door (RLS is locked since C21/0008: anon SELECT only; writes go through SECURITY DEFINER RPCs).
-- Mirrors register_player. Row-locks the tournament, refuses unless registration_open, case-insensitive
-- dup-name guard per tournament.
create or replace function public.register_team(
  p_tournament_id uuid,
  p_team_name text,
  p_roster jsonb default '[]'::jsonb,
  p_contact text default null,
  p_paid boolean default false
) returns public.teams as $$
declare
  t public.tournaments;
  nm text;
  new_team public.teams;
begin
  select * into t from public.tournaments where id = p_tournament_id for update;
  if t.id is null then raise exception 'No such tournament.'; end if;
  if not coalesce(t.registration_open, false) then
    raise exception 'Registration is closed for this tournament.';
  end if;
  nm := btrim(coalesce(p_team_name, ''));
  if length(nm) < 1 then raise exception 'Team name is required.'; end if;
  if exists (
    select 1 from public.teams
    where tournament_id = p_tournament_id and lower(btrim(name)) = lower(nm)
  ) then
    raise exception 'A team named "%" is already registered.', nm;
  end if;
  insert into public.teams (tournament_id, name, roster, contact, paid)
    values (p_tournament_id, nm, coalesce(p_roster, '[]'::jsonb),
            nullif(btrim(coalesce(p_contact, '')), ''), coalesce(p_paid, false))
    returning * into new_team;
  return new_team;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function public.register_team(uuid, text, jsonb, text, boolean) from public;
grant execute on function public.register_team(uuid, text, jsonb, text, boolean) to anon, authenticated;
