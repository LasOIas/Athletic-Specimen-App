-- 0029 C68: players-per-team is part of the scoring FORMAT (preset). Teams self-register with EXACTLY
-- that many players. Mike: "every team must have the set number of players, no less no more… make it part
-- of the presets." Adds team_size to scoring_presets (default 4 = AS 4s) + tournaments (copied at create;
-- NULL = legacy tournament → falls back to the >=2 floor from migration 0028). register_team enforces the
-- exact count when team_size is set. Idempotent. Applied to prod 2026-06-26.

alter table public.scoring_presets add column if not exists team_size int not null default 4;
alter table public.tournaments     add column if not exists team_size int;

create or replace function public.register_team(
  p_tournament_id uuid, p_team_name text, p_roster jsonb default '[]'::jsonb,
  p_contact text default null::text, p_paid boolean default false
) returns teams
language plpgsql security definer set search_path to 'public'
as $function$
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
  -- C68: exact-count when the tournament's format set a team_size; otherwise the >=2 reliability floor (0028).
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
  insert into public.teams (tournament_id, name, roster, contact, paid)
    values (p_tournament_id, nm, coalesce(p_roster, '[]'::jsonb),
            nullif(btrim(coalesce(p_contact, '')), ''), coalesce(p_paid, false))
    returning * into new_team;
  return new_team;
end;
$function$;
