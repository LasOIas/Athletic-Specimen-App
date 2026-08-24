-- 0058_tournament_venue.sql — WHERE the tournament is played (design round 2026-08-24, "Home").
--
-- WHY. Home's Details card (Mike's Claude Design handoff, 2026-08-24) leads with the venue — the park's
-- name, the line under it, and a Copy address action that puts the postal address on the clipboard.
-- Today the row reads the literal string "posted in GroupMe" (app.js hmRegistrationHTML) because
-- `tournaments` has never carried a venue, location, or address column of any kind (verified 0001
-- through 0057; the only `location` in the schema belongs to pickup_days, a different thing).
--
-- TWO COLUMNS, not one: the row shows the name on its own line ("Woodmen Valley Park") and the address
-- under it, and Copy address needs the address as a string a maps app will resolve. One free-text blob
-- would force the render path to split a sentence it cannot understand.
--
-- BOTH NULLABLE WITH NO DEFAULT, deliberately (0057's reasoning applies verbatim): every existing
-- tournament predates this migration and there is no honest venue to backfill; NULL is the truthful
-- "not set", and the render path already treats it as "keep the fallback row, render no Copy button".
--
-- NOT APPLIED. Authored only — applying is Mike's call. The app runs correctly before AND after: reads
-- go through select('*') so a missing column is simply undefined, the Event settings fields are not even
-- rendered until the loaded rows carry the keys, and the Home row falls back until then.
alter table public.tournaments add column if not exists venue text;
alter table public.tournaments add column if not exists venue_address text;

comment on column public.tournaments.venue is
  'Where it is played, as a player would say it ("Woodmen Valley Park"). NULL = not set; Home keeps its "Posted in GroupMe" row.';
comment on column public.tournaments.venue_address is
  'The line under the venue and the tail of what Copy address puts on the clipboard ("1000 Woodmen Valley Rd, Colorado Springs, CO"). NULL = venue only.';
