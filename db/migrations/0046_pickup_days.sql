-- 0046_pickup_days.sql — multi-day pickup schedule (session-10 pick R3 hybrid, Mike 2026-07-11).
-- Replaces the single hardcoded `sessions` row (id=1) with a table of scheduled pickup days, each
-- opening its OWN day-of Check In (client gate: sessionIsToday evaluates against the whole SET).
-- Read model matches the C21/C22 locked-RLS grammar: anon SELECT (the public day-of gate + the kiosk
-- read it), authenticated ALL for writes via the blanket policy UNTIL Task 13 locks writes behind the
-- role-gated RPCs. `sessions` STAYS until Task 14's sweep — this migration only flips the read/write
-- path for the app; the kiosk (checkin.html) keeps reading `sessions` until its own later slice.
-- Applied to prod by the CONTROLLER via Supabase MCP (builders never apply). Backfill copies the current
-- sessions id=1 row (if present) so the July pickup day survives the cutover.
create table if not exists public.pickup_days (
  id           uuid primary key default gen_random_uuid(),
  day          date not null,
  time_label   text,
  location     text,
  community_id uuid default '2c3bcfa9-305e-448b-924b-da90c029f575',
  created_at   timestamptz not null default now()
);
alter table public.pickup_days enable row level security;

drop policy if exists "pickup_days anon read" on public.pickup_days;
create policy "pickup_days anon read" on public.pickup_days for select to anon using (true);
drop policy if exists "pickup_days admin all" on public.pickup_days;
create policy "pickup_days admin all" on public.pickup_days for all to authenticated using (true) with check (true);

revoke all on public.pickup_days from anon, authenticated;
grant select on public.pickup_days to anon;
grant select, insert, update, delete on public.pickup_days to authenticated;

-- Backfill: carry the current single `sessions` row (id=1) into the new table so the day-of gate keeps
-- pointing at the same date after the read-path flip. Guarded so re-running is a no-op and so a fixture
-- without a `sessions` table (throwaway integration checks) doesn't error. Only a well-formed date is
-- copied; the cast + regex tolerate `sessions.date` being either a `date` or `text` column.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'sessions'
  ) then
    insert into public.pickup_days (day, time_label, location)
    select s.date::date, s.time, s.location
    from public.sessions s
    where s.id = 1
      and s.date is not null
      and s.date::text ~ '^\d{4}-\d{2}-\d{2}'
      and not exists (select 1 from public.pickup_days);
  end if;
end $$;
