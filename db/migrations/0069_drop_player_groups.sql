-- 0069_drop_player_groups.sql: groups leave the product.
--
-- Mike (2026-08-29): "remove the groups from the app, we dont even use it." Groups were a second, unused
-- way to organize ONE roster. They cost every list a subline, the players list a "N groups" counter, the
-- edit card a hidden field it had to carry so a name fix would not wipe membership, and register_player a
-- parameter every caller had to pass. 0068 already emptied the column and made the function group-blind.
-- This file removes the structures once nothing depends on them, which is a PRECONDITION and not yet a
-- fact: see APPLY PRECONDITIONS below. Same expand then contract shape 0017 and 0018 used for the
-- catalog, whose own header records that 0018 waited for a deployed, verified app.
--
-- APPLY PRECONDITIONS. The round-1 review found BOTH of these FALSE at branch HEAD 12f48bb. They are
-- client work, routed to Task 10, not this file's. This file must not be applied until both are true AND
-- the fixed client is deployed and driven:
--   P1. NO caller sends p_group. `grep -rn "p_group" public/` must return ZERO lines. At 12f48bb the
--       register branch of flushOutbox (public/app.js:5175) still sends three keys. PostgREST resolves
--       an RPC by the body's key set, so once the three-argument function is dropped that call matches
--       nothing and returns PGRST202, the catch at public/app.js:5178 swallows it, and the op retries
--       forever with no console error and no UI signal. On a live roster that is a person who checked in
--       and does not exist. It is the retry path for the console's Add and check in, and for offline
--       kiosk registrations.
--   P2. Surface G, the client group layer, is DELETED. At 12f48bb it is still present (public/app.js:48,
--       :1044, :1069, :1084, :1098-1111, :1149, :5490, :5500, :5767-5788, :5806-5820, :6094). Once the
--       column is gone, detectPlayersSchema (public/app.js:5778) sets HAS_GROUP false, and
--       public/app.js:5815 then writes the group name into players.tag on every card save, with
--       public/app.js:6094 doing the same on the insert path. An un-swept client REPOPULATES the one
--       group store this file leaves standing. 0070_strip_group_tags.sql cleans tag, and it is equally
--       pointless while the client is still writing to it.
--   P3. EVERY DEVICE THAT REGISTERS IS ON .10. A version bump plus a network-first service
--       worker updates a page that RELOADS; it does nothing for one already open, and the
--       kiosk phone sits on a table with checkin.html open all day. The three-argument
--       function is what that page still calls, and this file drops it: the first person at
--       the door gets "Could not register you". Before applying, HARD-RELOAD and read the
--       version on each of: the kiosk phone (checkin.html), the in-app Check In tab, and the
--       admin console. All three must read 2026.08.29.10. A drive on one device is not this
--       check. Nothing in this file can verify it, which is why it is written down here.
--
-- WHAT GOES:
--   1. the `groups` catalog table (0017), with its unique index, its two RLS policies and its grants,
--      which DROP TABLE sweeps. No inbound FK exists; 0035 only added community_id to it (outbound).
--   2. players."group", and with it the anon COLUMN-level select grant that names it
--      (0010_c21_skill_anon_revoke.sql:9, `grant select (id, name, checked_in, tag, "group")`). Postgres
--      removes a column's ACL with the column, so this will not error, but it is a real object and the
--      rollback has to re-issue it.
--   3. the normalize trigger and its trigger function (0020).
--   4. the group term in the dedup unique index (0011/0012): it narrows to name only.
--   5. register_player's p_group parameter and the "group" column it returned. The three-argument overload
--      is DROPPED, not left standing beside the new one: PostgREST resolves an overload by the argument
--      names the caller sends, so two live signatures would let a stale cached client keep registering
--      into a column that no longer exists. The older two-argument (text,text) form was already dropped at
--      0007:19, for the same reason. The replacement does not only LOSE a parameter: it gains a return
--      column, is_new, which Task 8's review asked for. The comment on the create below says why.
--
-- THE FULL SWEEP. Every object in db/migrations that names players."group", public.groups or
-- register_player, and what this file does with each:
--   players_real_name_group_uidx        0011:13, superseded by 0012:11-14  DROPPED, rebuilt name-only.
--     Live definition confirmed 2026-08-29: UNIQUE (lower(btrim(name)), coalesce("group",''))
--     WHERE left(name,5) <> '__as_'. Postgres would drop this index along with the column on its own,
--     so the ordering below is NOT about a dependency: the name-only rebuild has to replace it. What
--     makes a duplicate name abort harmlessly is the TRANSACTION, not the statement order; see point 1
--     of WHY THE STATEMENTS SIT IN THIS ORDER.
--   the anon column-level select grant   0010:9                            goes with the column, silently
--   tg_players_normalize_group()         0020:9-15                         DROPPED
--   players_normalize_group (trigger)    0020:17-20                        DROPPED
--   register_player(text,text,boolean)   0007:20, 0009:17, 0011:17, 0012:16, 0015:105, 0019:86,
--                                        0020:27, 0068                     DROPPED, replaced two-argument
--   public.groups (table)                0017:10-14                        DROPPED
--   groups_name_ci_uidx                  0017:17                           swept by DROP TABLE
--   the RLS policies on groups           0017:20-23, renamed by 0052:41-68  swept by DROP TABLE
--     0052 rewrites them through format(), so no text grep of db/migrations can show their current
--     names. "c22 admin all" is gone; the live pair is "groups organizer write" (gated on is_organizer
--     or is_owner) plus "groups authenticated read". DROP TABLE sweeps whatever is actually there, so
--     this is a record-accuracy point rather than an apply risk. It matters for the ROLLBACK.
--   grants on groups, anon + auth        0017:25-26                        swept by DROP TABLE
--   groups.community_id and its FK       0035:11, outbound to communities  swept by DROP TABLE
--   0017:36-37, backfill reading "group" a one-time insert, no standing object, nothing to drop
--
-- SWEPT AND FOUND CLEAR, so this file drops nothing for them:
--   * No view or materialized view exists anywhere in db/migrations, so nothing selects the column or the
--     table through one. That is why both drops below are written WITHOUT cascade: an unforeseen dependent
--     must fail the apply loudly rather than quietly be taken along with it.
--   * No RLS policy predicate names "group". The two policies on players are the column-blind
--     `using (true)` pair at 0006:12 and 0008:24-25, and 0052 does not touch players.
--   * _audit_actor() (0019:32-34, REPLACED by 0052:79-107, whose version sets grp := null and derives
--     actor and role from profiles plus memberships) has nothing to do with players."group": the 0019
--     body read a `group` claim off the JWT, not the column. Untouched, still called by the new body.
--   * link_roster_to_tournament (0054) writes (community_id, real_name) on tournament_players and never
--     reads the dedup index, so narrowing that index changes nothing for it. 0024 and 0052 name
--     register_player in comments only.
--
-- WHAT STAYS: tournaments."group" (0003:4) and attendance_sessions."group" (0015:16), two different
-- columns on two different tables. players.tag is not touched here: it is the last group store, and
-- 0070_strip_group_tags.sql empties the `__as_groups__:` payload out of it once this file has committed
-- and APPLY PRECONDITION P2 is actually true. PRE-FLIGHT 2 below captures it for that file's rollback.
--
-- Dedup narrows from (name, group) to name. Mike, same day, on the kiosk's same-name rows: "thats almost
-- impossible to have the same full name, just leave it." 0068 STEP 1 already proved zero duplicate names.
--
-- **Before this file runs, `select id, name, "group" from public.players where "group" is not null;` has
-- already been captured verbatim into the round's history file at 0068 STEP 2. That capture is the ONLY
-- record of the group values that exists after this commit; the rollback below restores empty structures
-- and needs that file to put values back.**
--
-- WHY THE STATEMENTS SIT IN THIS ORDER, so one apply_migration transaction either wholly succeeds or
-- wholly aborts:
--   1. the name-only unique index is created before anything is dropped THAT IT COULD NOT REPLACE. It is
--      the only statement here that can fail on DATA: it needs zero duplicate real names. 0068 STEP 1
--      read zero and 0068 STEP 2b enforced zero inside its own transaction, but the admin console writes
--      players directly, so a duplicate created between the two applies is possible. Read the statements,
--      not the word FIRST: the (name, group) index is dropped one line ABOVE the create, so the create is
--      not first in any literal sense. The safety holds by TRANSACTIONALITY, not by the order. A duplicate
--      row aborts the single apply_migration batch, and that same rollback puts
--      players_real_name_group_uidx back along with every other statement here.
--   2. the trigger goes before the trigger function it depends on.
--   3. the three-argument register_player is DROPPED BEFORE the two-argument one is created, so no point
--      inside the transaction holds two overloads. A create-first order would briefly leave a database in
--      which `register_player(p_name => ..., p_checked_in => ...)` matches both, which is exactly the
--      ambiguity the pg_proc read-back at the bottom exists to rule out.
--   4. the column drop comes after the index, the trigger and the old function are gone. plpgsql bodies
--      are not dependency-tracked, so Postgres would have allowed the drop with the old function still
--      standing and left a function that errors on its first call. This order makes that impossible.
--   5. the table drop is last of the DDL, when nothing above still reads it.
--   6. `notify pgrst, 'reload schema';` is the final statement of all, so what PostgREST re-reads is the
--      finished shape rather than a half-applied one. NOTIFY is delivered on COMMIT, so an aborted apply
--      cannot fire it and a rolled-back cache reload is not a thing that can happen.
--
-- ROLLBACK. STRUCTURES ONLY, and not even all of them. Read this before treating the file as reversible.
--
--   THE DATA does not come back from any DDL here. The group values this file destroys (211 players
--   carried one at the 2026-08-29 read) come back from the 0068 STEP 2 capture, and the groups catalog
--   comes back from PRE-FLIGHT 1 below. Nothing in the database preserves either past this commit. If a
--   capture was not taken, that data is gone, and no step below changes that.
--
--   THE COLUMN, the safe half: `alter table public.players add column if not exists "group" text;`
--   NULLABLE, no default, no constraint, exactly the shape 0035 and 0052 left it in; re-issue
--   `grant select (id, name, checked_in, tag, "group") on public.players to anon;` (0010:9), without
--   which a rolled-back anon door 403s on any query naming the column; re-apply
--   0020_group_null_normalize.sql verbatim (the trigger function, the trigger and the three-argument
--   register_player), then `revoke all on function public.register_player(text, text, boolean) from
--   public, anon;` and `grant execute on function public.register_player(text, text, boolean) to anon,
--   authenticated;`, because that re-created function is a NEW function carrying the default public ACL
--   and no anon grant; `drop function if exists public.register_player(text, boolean);` so the restored
--   database does not stand up both overloads; `drop index if exists public.players_real_name_uidx;` and
--   recreate players_real_name_group_uidx from 0012:12-14; then restore the values row by row from the
--   0068 STEP 2 capture.
--
--   THE TABLE: DO NOT recreate public.groups by re-running 0017, and do not write the recreate DDL from
--   this folder at all. 0017 is two migrations out of date. Re-running it alone produces a table with no
--   community_id (0035:11 added it, not null, defaulted to a community id this header will not guess,
--   with an FK to communities) and with the blanket policy "c22 admin all" that 0052:41-68 deliberately
--   replaced, which would hand every signed-in account write access to groups again and reopen exactly
--   the boundary 0052 was written to close. Anyone rolling this back RE-READS 0035 and 0052 first, and
--   against the live database rather than the folder, because 0052 renames through format() and no grep
--   here can show the current policy names. Then restore the rows from the PRE-FLIGHT 1 capture: 0017's
--   own backfill cannot rebuild them, since it reads players."group", which 0068 emptied.
--
-- NOT YET APPLIED (the controller applies it after the last client push, on Mike's tap) via the Supabase
-- MCP (apply_migration), the check-in pop-ups round.

-- PRE-FLIGHT. Comments: apply_migration does NOT run these. The controller runs each one alone with
-- execute_sql BEFORE the batch and saves the output VERBATIM into the round's 12-history file. The first
-- two cannot be taken afterwards: 0068 STEP 2 captured players."group" and nothing else.
--
--   1. THE WHOLE GROUPS CATALOG. 0017's backfill deliberately preserved groups that have NO players (its
--      own header names "Dot House"), so nothing else in the database records them, and after the
--      DROP TABLE below they cannot be read at all:
--        select * from public.groups order by name;
--
--   2. EVERY NON-NULL players.tag. This file does not touch tag; 0070_strip_group_tags.sql does, and its
--      rollback has only a capture. Taking it here means one capture covers both files:
--        select id, name, tag from public.players where tag is not null order by name;
--
--   3. READ-BACK 6's BASELINE, which that read-back compares against and nothing else records:
--        select count(*) from public.players where left(name, 5) <> '__as_';
--
--   4. THE DEPENDENCY READ, and it is the important one. The sweep in this header is a sweep of
--      db/migrations ONLY. public.players was never created there (0002:4-5 and 0036:3 only ALTER it),
--      so its original DDL, and anything added through the Supabase dashboard in the two years since, is
--      invisible to a grep of this folder. ABORT on any row naming an object this header does not:
--
--        select pg_describe_object(classid, objid, objsubid) as dependent,
--               classid::regclass as catalog, deptype
--          from pg_depend
--         where refclassid = 'pg_class'::regclass
--           and refobjid = 'public.players'::regclass
--           and refobjsubid = (select attnum from pg_attribute
--                               where attrelid = 'public.players'::regclass
--                                 and attname = 'group' and not attisdropped);
--        -- expected: ONLY players_real_name_group_uidx, deptype 'a'. This file rebuilds it by hand.
--
--        select pg_describe_object(classid, objid, objsubid) as dependent,
--               classid::regclass as catalog, deptype
--          from pg_depend
--         where refclassid = 'pg_class'::regclass
--           and refobjid = 'public.groups'::regclass;
--        -- expected: ONLY the table's own columns, its pkey, groups_name_ci_uidx, its two RLS policies
--        -- and its community_id FK to communities. Anything else is an object this header does not name.
--
--        select conrelid::regclass as referencing_table, conname
--          from pg_constraint where confrelid = 'public.groups'::regclass;
--        -- expected: ZERO rows. Any row is an inbound FK and the plain DROP TABLE below WILL fail.
--
--      pg_depend sees views, rules, RLS policies, constraints, defaults, generated columns and indexes.
--      It does NOT see plpgsql bodies, which is why register_player is dropped by hand below and why
--      this fourth read closes that blind spot:
--        select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--         where n.nspname = 'public' and (p.prosrc like '%"group"%' or p.prosrc like '%public.groups%');
--        -- expected: only functions this header names. tournaments."group" (0003:4) and
--        -- attendance_sessions."group" (0015:16) are different columns, so a body reading one of THOSE
--        -- is a correct hit that stays.

-- the dedup index goes first, and the name-only rebuild with it
drop index if exists public.players_real_name_group_uidx;
create unique index if not exists players_real_name_uidx
  on public.players (lower(btrim(name)))
  where left(name, 5) <> '__as_';

-- 0020's group-normalizing trigger has nothing left to normalize
drop trigger if exists players_normalize_group on public.players;
drop function if exists public.tg_players_normalize_group();

-- the old signature goes before the new one arrives, so the two never stand together
drop function if exists public.register_player(text, text, boolean);

-- register_player without p_group. Body is 0068's minus the ignored parameter and the "group" return
-- column; the insert still writes skill 0, so a rated new player takes a second write from the client
-- (updatePlayerFieldsSupabase). A new signature is a NEW function with no inherited ACL and a default
-- execute grant to public, hence the revoke/grant pair below. The kiosk is anonymous, so anon must hold
-- execute or every check-in 403s.
--
-- THE FOURTH RETURN COLUMN, is_new, which no earlier signature had. This function dedups on name, so a
-- caller could never tell an INSERT from a hit on a row that already existed. Task 8's review found what
-- that costs: an Add from a stale roster resolves to the existing player and the card then writes its own
-- rating over the real one, silently. is_new is true ONLY on the insert path. It is false on the dedup
-- hit, and false in the unique_violation fallback, where a concurrent session won the race and the row is
-- therefore not ours either. The check-in console's add card READS it and refuses to push a rating onto a
-- player it did not create; both kiosk doors ignore the column, which costs them nothing, and PostgREST
-- hands an extra key to a client that never looks at it without complaint.
create or replace function public.register_player(p_name text, p_checked_in boolean default false)
returns table(id uuid, name text, checked_in boolean, is_new boolean)
language plpgsql security definer set search_path to 'public' as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_id   uuid;
  v_new  boolean := false;
  v_actor text; v_role text; v_grp text;
begin
  if v_name = '' then raise exception 'name required'; end if;
  if length(v_name) > 80 then raise exception 'name too long (max 80)'; end if;

  select pl.id into v_id from public.players pl
    where lower(btrim(pl.name)) = lower(v_name)
      and left(pl.name, 5) <> '__as_'
    limit 1;

  if v_id is null then
    begin
      insert into public.players(name, skill, checked_in)
        values (v_name, 0, coalesce(p_checked_in, false))
        returning players.id into v_id;
      v_new := true;
      select a.actor, a.role, a.grp into v_actor, v_role, v_grp from public._audit_actor() a;
      insert into public.action_log(actor, role, grp, action, entity_type, entity_id, detail)
        values (v_actor, v_role, v_grp, 'register', 'players', v_id::text, v_name);
    exception when unique_violation then
      -- a concurrent session created the row first, so it is not ours: is_new goes back to false
      v_new := false;
      select pl.id into v_id from public.players pl
        where lower(btrim(pl.name)) = lower(v_name)
          and left(pl.name, 5) <> '__as_'
        limit 1;
    end;
  end if;

  if coalesce(p_checked_in, false) then
    update public.players set checked_in = true where players.id = v_id;
    insert into public.check_ins(session_id, player_id)
      values (public.current_session_id(), v_id)
      on conflict (session_id, player_id) do nothing;
  end if;

  return query
    select pl.id, pl.name, pl.checked_in, v_new from public.players pl where pl.id = v_id;
end $$;
revoke all on function public.register_player(text, boolean) from public, anon;
grant execute on function public.register_player(text, boolean) to anon, authenticated;

-- no cascade: an unforeseen dependent must abort the apply, not be swept along with the column
alter table public.players drop column if exists "group";

-- no cascade here either, and for the same reason
drop table if exists public.groups;

-- PostgREST caches the function catalog. The drop-and-create above changes register_player's
-- signature, so a client's two-key call routes to nothing until the cache reloads. Supabase's
-- pgrst_ddl_watch event trigger normally does this on its own; this is the belt to its braces,
-- and it costs one statement. NOTIFY is delivered on commit, so it cannot fire on a rollback.
-- The kiosk is the anon door: a stale cache means "nobody can check in" while every read-back
-- in this file still passes, because every one of them is SQL and SQL never sees that cache.
-- SMOKE 3 below is the read that does.
notify pgrst, 'reload schema';

-- READ-BACKS. Comments: apply_migration does NOT run these. The controller runs them with execute_sql
-- AFTER this batch commits, and records every result in the round's history file.
--   select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'register_player';
--     -- exactly ONE row, register_player(text,boolean). A second row is a stranded overload, and it is
--     -- the whole point of this read: PostgREST would still route a stale client to it.
--   select count(*) from information_schema.columns
--    where table_schema = 'public' and table_name = 'players' and column_name = 'group';   -- 0
--   select to_regclass('public.groups');                                                   -- null
--   select indexdef from pg_indexes
--    where schemaname = 'public' and indexname = 'players_real_name_uidx';
--     -- exists, names lower(btrim(name)), keeps WHERE left(name,5) <> '__as_', has no group term.
--     -- READ IT, never skim it: the create above is `if not exists`, so an index of that name left by a
--     -- partly applied earlier attempt is SKIPPED silently and this is the only thing that would see it.
--   select count(*) from pg_indexes
--    where schemaname = 'public' and indexname = 'players_real_name_group_uidx';           -- 0
--   select count(*) from public.players where left(name, 5) <> '__as_';
--     -- identical to the count read immediately before the apply
--   select privilege_type, column_name from information_schema.column_privileges
--    where table_schema = 'public' and table_name = 'players' and grantee = 'anon';
--     -- exactly id, name, checked_in, tag. No group: the column drop removed that grant silently.
--
--   SMOKE 1, the dedup. On a throwaway name and never on a real one. Written by NAME because that is how
--   PostgREST sends it, and because a named call is what proves the overload resolves to one target:
--     select * from public.register_player(p_name => 'Zz Smoketest', p_checked_in => false);  -- inserts
--     select * from public.register_player(p_name => 'Zz Smoketest', p_checked_in => false);  -- SAME id
--     select count(*) from public.players where lower(btrim(name)) = lower('Zz Smoketest');   -- 1
--   Both calls must return FOUR columns: id, name, checked_in, is_new. Three means an older body is live.
--
--   SMOKE 2, is_new, on a second throwaway name so it is read on a clean row rather than on smoke 1's:
--     select is_new from public.register_player(p_name => 'Zz Smoketest Two', p_checked_in => false);
--       -- TRUE. The insert path ran and this row is the caller's.
--     select is_new from public.register_player(p_name => 'Zz Smoketest Two', p_checked_in => false);
--       -- FALSE. The dedup hit. This is what stops the console's add card writing a rating over a
--       -- player it did not create, so a false here is the whole guard working.
--
--   SMOKE 3, THROUGH POSTGREST, with the ANON key, and the two smokes above cannot stand in for it:
--   they are SQL, so they read the catalog and never the schema cache. This is the call the kiosk itself
--   makes, from outside the database, as the same anonymous role, with the parameters in the NAMED
--   notation PostgREST uses (the JSON keys ARE the argument names, which is how the overload resolves).
--   The controller runs it from the repo root and deletes the row it creates:
--     ANON=$(sed -n "s/^const SUPABASE_KEY = '\(.*\)';$/\1/p" public/supabase-config.js)
--     curl -s -o /dev/null -w '%{http_code}\n' \
--       -X POST 'https://mlzblkzflgylnjorgjcp.supabase.co/rest/v1/rpc/register_player' \
--       -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
--       -H 'Content-Type: application/json' \
--       -d '{"p_name":"Zz Smoketest Three","p_checked_in":false}'
--   Drop the -o /dev/null to read the body. EXPECT 200 and ONE row carrying four keys, is_new among
--   them and true on this first call. A 404 with code PGRST202 ("Could not find the function
--   public.register_player(p_checked_in, p_name) in the schema cache") does NOT mean the apply failed:
--   it means the cache is stale. Re-issue `notify pgrst, 'reload schema';`, wait, and re-read. The apply
--   is not done, and no client is pushed and no kiosk is handed back, until this returns 200.
--
--   THE CONTROLLER ROLLS ALL THREE SMOKES BACK, every row, or fake players are left on a live roster:
--     delete from public.players
--      where lower(btrim(name)) in (lower('Zz Smoketest'), lower('Zz Smoketest Two'),
--                                   lower('Zz Smoketest Three'));
--     delete from public.action_log
--      where action = 'register'
--        and detail in ('Zz Smoketest', 'Zz Smoketest Two', 'Zz Smoketest Three');
--
--   Then get_advisors for security and for performance: no class of finding that was not there before.
