-- 0057_tournament_date_and_cap.sql — the two facts the Manage tournament switcher wants to state and
-- cannot (design round 2026-08-04, "Tournament switcher on Manage").
--
-- WHY. The switcher card names the tournament Manage is pointed at and, under it, the one meta line an
-- organizer actually needs: "Sat Aug 22 · registration open · 6 of 12 teams". Two thirds of that line has
-- no column behind it today:
--   * WHEN IT IS. `tournaments` carries no date of ANY kind — only created_at / updated_at, which are row
--     bookkeeping, not the day the event is played. The whole app has been inferring "when" from the
--     pickup_days table, which is a different thing entirely (weekly pickup, not the tournament).
--   * HOW MANY TEAMS FIT. pool_cap / bracket_cap / match_cap all exist but every one of them is a SCORING
--     cap (the points a game stops at), not a roster size. "6 of 12 teams" and the registration cut-off it
--     implies had nothing to read.
-- Until this is applied the UI drops both clauses rather than inventing them (Mike's standing ruling from
-- the 2026-08-03 round: drop the clause, never fill it with a figure the data does not carry), and it
-- hides the two matching fields on the New tournament screen so nothing offers to save into a column that
-- is not there.
--
-- BOTH COLUMNS ARE NULLABLE WITH NO DEFAULT, deliberately. A default would be a lie: every tournament that
-- already exists predates this migration, so there is no honest date or cap to backfill them with, and a
-- default would hand every historic row a fabricated one that the card would then print as fact. NULL is
-- the truthful value for "not set", and it is exactly what the render path already treats as "drop the
-- clause".
--
-- event_date is `date`, not `timestamptz`: a tournament is a DAY ("Sat Aug 22"), and a timestamp would drag
-- a time-of-day and a zone into a value that has neither, which is how a Saturday event prints as Friday
-- for anyone west of the stored zone.
--
-- NOT APPLIED. Authored only — applying is Mike's call and needs his DB access. The app runs correctly
-- before AND after: reads go through select('*') so a missing column is simply undefined, and every write
-- checks the loaded rows for the key before it sends it.
alter table public.tournaments add column if not exists event_date date;
alter table public.tournaments add column if not exists team_cap int;

comment on column public.tournaments.event_date is
  'The day the tournament is played. NULL = not set yet; the UI drops the date clause rather than guessing.';
comment on column public.tournaments.team_cap is
  'How many TEAMS the event holds (a roster size, not a scoring cap — see pool_cap / bracket_cap for those). NULL = uncapped / not set.';
