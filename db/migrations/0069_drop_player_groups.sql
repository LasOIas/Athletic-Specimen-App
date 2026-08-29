-- 0069_drop_player_groups.sql: groups leave the product.
--
-- Mike (2026-08-29): "remove the groups from the app, we dont even use it." Groups were a second, unused
-- way to organize ONE roster. They cost every list a subline, the players list a "N groups" counter, the
-- edit card a hidden field it had to carry so a name fix would not wipe membership, and register_player a
-- parameter every caller had to pass. 0068 already emptied the column and made the function group-blind,
-- and the client that emits and sends nothing group-shaped has been deployed and driven since. This file
-- removes the structures with nothing left depending on them. Same expand then contract shape 0017 and
-- 0018 used for the catalog, whose own header records that 0018 waited for a deployed, verified app.
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
--      0007:19, for the same reason.
--
-- THE FULL SWEEP. Every object in db/migrations that names players."group", public.groups or
-- register_player, and what this file does with each:
--   players_real_name_group_uidx        0011:13, superseded by 0012:11-14  DROPPED, rebuilt name-only.
--     Live definition confirmed 2026-08-29: UNIQUE (lower(btrim(name)), coalesce("group",''))
--     WHERE left(name,5) <> '__as_'. Its expression names the column, so it MUST go before the column.
--   the anon column-level select grant   0010:9                            goes with the column, silently
--   tg_players_normalize_group()         0020:9-15                         DROPPED
--   players_normalize_group (trigger)    0020:17-20                        DROPPED
--   register_player(text,text,boolean)   0007:20, 0009:17, 0011:17, 0012:16, 0015:105, 0019:86,
--                                        0020:27, 0068                     DROPPED, replaced two-argument
--   public.groups (table)                0017:10-14                        DROPPED
--   groups_name_ci_uidx                  0017:17                           swept by DROP TABLE
--   "c22 anon read" / "c22 admin all"    0017:20-23                        swept by DROP TABLE
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
--   * _audit_actor() (0019:32-34) reads a `group` claim off the JWT and action_log.grp stores it. A
--     different thing on a different table, untouched here and still called by the new function.
--   * link_roster_to_tournament (0054) writes (community_id, real_name) on tournament_players and never
--     reads the dedup index, so narrowing that index changes nothing for it. 0024 and 0052 name
--     register_player in comments only.
--
-- WHAT STAYS: tournaments."group" (0003:4) and attendance_sessions."group" (0015:16), two different
-- columns on two different tables. players.tag is not touched here; the client stops writing group JSON
-- into it in the same release, and the column's fate is an open item on this round's spec.
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
--   1. the name-only unique index is BUILT FIRST, before anything is dropped. It is the only statement
--      here that can fail on DATA: it needs zero duplicate real names. 0068 STEP 1 read zero and 0068
--      STEP 2b enforced zero inside its own transaction, but the admin console writes players directly,
--      so a duplicate created between the two applies is possible. Building first means such a row aborts
--      this transaction with NOTHING yet dropped, and the rollback of that same transaction puts
--      players_real_name_group_uidx back.
--   2. the trigger goes before the trigger function it depends on.
--   3. the three-argument register_player is DROPPED BEFORE the two-argument one is created, so no point
--      inside the transaction holds two overloads. A create-first order would briefly leave a database in
--      which `register_player(p_name => ..., p_checked_in => ...)` matches both, which is exactly the
--      ambiguity the pg_proc read-back at the bottom exists to rule out.
--   4. the column drop comes after the index, the trigger and the old function are gone. plpgsql bodies
--      are not dependency-tracked, so Postgres would have allowed the drop with the old function still
--      standing and left a function that errors on its first call. This order makes that impossible.
--   5. the table drop is last, when nothing above still reads it.
--
-- ROLLBACK, STRUCTURES ONLY, AND HONESTLY: the group values this file destroys (211 rows carried one at
--   the 2026-08-29 read) come back from ONE place only, the verbatim capture the controller took at 0068
--   STEP 2 into the round's 12-history file. Nothing in the database preserves them past this commit, and
--   if that capture was not taken they are gone for good. The structures come back like this: re-run
--   0017's create table, unique index, policies and grants (skip its backfill, the source rows are gone);
--   `alter table public.players add column "group" text;`; re-issue
--   `grant select (id, name, checked_in, tag, "group") on public.players to anon;` (0010:9), without which
--   a rolled-back anon door 403s on any query naming the column; re-apply
--   0020_group_null_normalize.sql verbatim (the trigger function, the trigger and the three-argument
--   register_player), then `revoke all on function public.register_player(text, text, boolean) from
--   public, anon;` and `grant execute on function public.register_player(text, text, boolean) to anon,
--   authenticated;`, because that re-created function is a NEW function carrying the default public ACL
--   and no anon grant; `drop function if exists public.register_player(text, boolean);` so the restored
--   database does not stand up both overloads; `drop index if exists public.players_real_name_uidx;` and
--   recreate players_real_name_group_uidx from 0012:12-14; then restore the VALUES row by row from the
--   0068 STEP 2 capture.
--
-- NOT YET APPLIED (the controller applies it after the last client push, on Mike's tap) via the Supabase
-- MCP (apply_migration), the check-in pop-ups round.

-- the dedup index carries the column, so it goes first
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
create or replace function public.register_player(p_name text, p_checked_in boolean default false)
returns table(id uuid, name text, checked_in boolean)
language plpgsql security definer set search_path to 'public' as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_id   uuid;
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
      select a.actor, a.role, a.grp into v_actor, v_role, v_grp from public._audit_actor() a;
      insert into public.action_log(actor, role, grp, action, entity_type, entity_id, detail)
        values (v_actor, v_role, v_grp, 'register', 'players', v_id::text, v_name);
    exception when unique_violation then
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
    select pl.id, pl.name, pl.checked_in from public.players pl where pl.id = v_id;
end $$;
revoke all on function public.register_player(text, boolean) from public, anon;
grant execute on function public.register_player(text, boolean) to anon, authenticated;

-- no cascade: an unforeseen dependent must abort the apply, not be swept along with the column
alter table public.players drop column if exists "group";

-- no cascade here either, and for the same reason
drop table if exists public.groups;

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
--     -- exists, names lower(btrim(name)), keeps WHERE left(name,5) <> '__as_', has no group term
--   select count(*) from pg_indexes
--    where schemaname = 'public' and indexname = 'players_real_name_group_uidx';           -- 0
--   select count(*) from public.players where left(name, 5) <> '__as_';
--     -- identical to the count read immediately before the apply
--   select privilege_type, column_name from information_schema.column_privileges
--    where table_name = 'players' and grantee = 'anon';
--     -- exactly id, name, checked_in, tag. No group: the column drop removed that grant silently.
--
--   Then the live smoke, on a throwaway name and never on a real one. Written by NAME because that is
--   how PostgREST sends it, and because a named call is what proves the overload resolves to one target:
--     select * from public.register_player(p_name => 'Zz Smoketest', p_checked_in => false);  -- inserts
--     select * from public.register_player(p_name => 'Zz Smoketest', p_checked_in => false);  -- SAME id
--     select count(*) from public.players where lower(btrim(name)) = lower('Zz Smoketest');   -- 1
--   THE CONTROLLER ROLLS THE SMOKE BACK, both rows, or a fake player is left on a live roster:
--     delete from public.players where lower(btrim(name)) = lower('Zz Smoketest');
--     delete from public.action_log where action = 'register' and detail = 'Zz Smoketest';
--
--   Then get_advisors for security and for performance: no class of finding that was not there before.
