-- 0028 NF-3a: roster validation at self-registration. register_team validated the team NAME (required +
-- dedup) but NOT the roster (p_roster default '[]'), so a 0-player / garbage team could register and seed
-- the whole bracket — raw-DB-only to fix. Add a minimum-roster guard: at least 2 non-empty player names.
-- (Reliability floor against empty/garbage teams without event-day friction; the form still collects 4 +
-- the co-ed reminder, and admins can complete rosters via the admin team tools.) Anon door under locked
-- RLS, unchanged otherwise. Idempotent (create or replace). Applied to prod 2026-06-26.

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

  -- NF-3a: require a real roster (>= 2 non-empty player names) so an empty/garbage team can't seed the bracket.
  select count(*) into roster_count
    from jsonb_array_elements_text(coalesce(p_roster, '[]'::jsonb)) e
    where btrim(e) <> '';
  if roster_count < 2 then raise exception 'Add at least 2 players to register the team.'; end if;

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
