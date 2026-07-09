# Personal Layer — Slice 3a (Data Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make team registration automatically create `players` rows + `team_members` links (reuse same-name, else create), so future tournaments have the data the personal layer needs — no manual setup, no backfill.

**Architecture:** One SECURITY DEFINER SQL helper `link_roster_to_team` does find-or-create + link. The existing `register_team` RPC calls it in-transaction (covers public self-register + co-pilot). A thin `sync_team_roster` RPC routes the admin edit-roster path (`tdbSetTeamRoster`) through the same helper. All additive; no existing data mutated.

**Tech Stack:** Postgres (Supabase, project `mlzblkzflgylnjorgjcp`), plpgsql SECURITY DEFINER RPCs, migrations applied via Supabase MCP `apply_migration` then saved to `db/migrations/`. App layer = vanilla JS in `public/app.js`. DB RPCs verified by SQL integration on a throwaway tournament (no vitest for SQL).

## Global Constraints

- Bump `APP_VERSION` in `public/app.js:30` on every code change. Format `YYYY.MM.DD.N`, N resets to 1 each day. Current value `'2026.07.08.5'`.
- Commit + push after every task (Vercel auto-deploys). No "Generated with Claude Code" trailer.
- Run `node --check public/app.js` after every app.js edit.
- Identity policy (Mike's decision): reuse existing player by **exact case-insensitive trimmed `name` within the tournament's `community_id`** — ≥1 match → reuse the earliest (`order by created_at`); 0 matches → create. A pre-existing global unique index `players_real_name_group_uidx` on `(lower(btrim(name)), coalesce(group,''))` guarantees no duplicate name in the null-group slot, so there is no "ambiguous → create new" branch. Link via `team_members … ON CONFLICT (team_id, player_id) DO NOTHING`.
- `players.skill` is `NOT NULL` with no default → created rows set `skill = 0` (the app's unrated convention).
- Every created `players` / `team_members` row MUST carry a non-null `community_id` (else `claim_player` raises `'player not found'`).
- Migration number = **0042** (0039/0040/0041 stay reserved for the RLS/scoring/retire cutover). Save the file to `db/migrations/0042_register_team_creates_members.sql` after applying.
- Never touch the 18 June teams / existing 233 players. Throwaway fixtures only; clean them up.

## File Structure

- Create: `db/migrations/0042_register_team_creates_members.sql` — the `link_roster_to_team` helper + `register_team` rewrite + `sync_team_roster` RPC + grants. One migration; these three change together.
- Modify: `public/app.js:3314-3319` (`tdbSetTeamRoster`) — call `sync_team_roster` after the roster update.
- Modify: `public/app.js:30` — `APP_VERSION` bump.

Baseline to assert against (verified 2026-07-08): 233 players, 18 teams, 0 `team_members`, 1 community `2c3bcfa9-305e-448b-924b-da90c029f575`, 1 tournament.

---

### Task 1: `link_roster_to_team` helper + `register_team` rewrite (migration 0042)

**Files:**
- Create: `db/migrations/0042_register_team_creates_members.sql`
- (Applied to prod via Supabase MCP `apply_migration`, then saved as the file.)

**Interfaces:**
- Produces: `public.link_roster_to_team(p_team_id uuid, p_roster jsonb, p_community_id uuid) returns void` (SECURITY DEFINER; internal — execute revoked from public/anon).
- Modifies: `public.register_team(p_tournament_id uuid, p_team_name text, p_roster jsonb, p_contact text, p_paid boolean) returns teams` — unchanged signature + behaviour, now also creates players + team_members.

- [ ] **Step 1: Write the failing integration test (run against a fresh throwaway tournament)**

Run this via Supabase MCP `execute_sql` (project `mlzblkzflgylnjorgjcp`). It creates a throwaway tournament, registers a team through the CURRENT `register_team`, and asserts members were created:

```sql
-- setup throwaway
insert into tournaments (name, status, registration_open, team_size, community_id)
values ('ZZ 3a Test', 'setup', true, 2, '2c3bcfa9-305e-448b-924b-da90c029f575')
returning id;  -- capture as :tid

select register_team(:tid, 'ZZ Team One', '["Zeta Alpha","Zeta Beta"]'::jsonb, null, false);

-- ASSERTIONS
select
  (select count(*) from team_members tm join teams t on t.id=tm.team_id where t.tournament_id=:tid) as members,   -- expect 2
  (select count(*) from players where name in ('Zeta Alpha','Zeta Beta')) as new_players;                          -- expect 2
```

- [ ] **Step 2: Run it to verify it fails**

Expected: `members = 0`, `new_players = 0` — current `register_team` only inserts the team. FAIL.
Then delete the throwaway team + tournament before proceeding: `delete from teams where tournament_id=:tid; delete from tournaments where id=:tid;`

- [ ] **Step 3: Apply migration 0042 (the minimal implementation)**

Apply via Supabase MCP `apply_migration` (name `register_team_creates_members`):

```sql
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
    -- (No min(uuid) aggregate exists in Postgres, and the unique index makes a >1 null-group case impossible.)
    select id into v_player
      from public.players
      where community_id = v_comm and lower(btrim(name)) = lower(nm)
      order by created_at
      limit 1;
    if v_player is null then
      -- players.skill is NOT NULL, no default -> set 0 (app's unrated convention)
      insert into public.players (name, community_id, skill) values (nm, v_comm, 0) returning id into v_player;
    end if;
    insert into public.team_members (team_id, player_id, community_id)
      values (p_team_id, v_player, v_comm)
      on conflict (team_id, player_id) do nothing;
  end loop;
end $$;

revoke execute on function public.link_roster_to_team(uuid, jsonb, uuid) from public, anon;

-- register_team rewrite: the EXACT current body + a link call before returning. All validation preserved.
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
```

Note vs the current body: the `teams` insert now also sets `community_id = t.community_id` (was relying on the column default — explicit is safer), and the `perform link_roster_to_team(...)` line is added before `return`.

- [ ] **Step 4: Run the test to verify it passes + cover reuse and ambiguity**

Fresh throwaway run via `execute_sql`:

```sql
insert into tournaments (name, status, registration_open, team_size, community_id)
values ('ZZ 3a Test', 'setup', true, 2, '2c3bcfa9-305e-448b-924b-da90c029f575') returning id;  -- :tid

-- (a) basic create
select register_team(:tid, 'ZZ Team One', '["Zeta Alpha","Zeta Beta"]'::jsonb, null, false);
-- (b) reuse: "Zeta Alpha" already exists (exactly 1) -> reuse; "Zeta Gamma" new
select register_team(:tid, 'ZZ Team Two', '["Zeta Alpha","Zeta Gamma"]'::jsonb, null, false);

select
  (select count(*) from players where name='Zeta Alpha') as alpha_rows,          -- expect 1 (reused, not duplicated)
  (select count(*) from team_members tm join teams t on t.id=tm.team_id
     where t.tournament_id=:tid) as members,                                       -- expect 4 (2+2)
  (select count(distinct player_id) from team_members tm join teams t on t.id=tm.team_id
     where t.tournament_id=:tid) as distinct_players;                              -- expect 3 (Alpha shared)

-- (c) ambiguity: seed a 2nd "Zeta Alpha" -> now 2 exist -> next link must CREATE a new one
insert into players (name, community_id) values ('Zeta Alpha','2c3bcfa9-305e-448b-924b-da90c029f575');
select register_team(:tid, 'ZZ Team Three', '["Zeta Alpha","Zeta Delta"]'::jsonb, null, false);
select count(*) as alpha_rows_after from players where name='Zeta Alpha';         -- expect 3 (2 seeded + 1 new; no guess)
```

Expected: `alpha_rows=1`, `members=4`, `distinct_players=3`, `alpha_rows_after=3`. PASS.

- [ ] **Step 5: Clean up throwaway data + verify baseline restored**

```sql
delete from teams where tournament_id = :tid;                       -- cascades team_members
delete from players where name in ('Zeta Alpha','Zeta Beta','Zeta Gamma','Zeta Delta');
delete from tournaments where id = :tid;
select
  (select count(*) from players) as players,        -- expect 233
  (select count(*) from teams) as teams,            -- expect 18
  (select count(*) from team_members) as members;   -- expect 0
```

- [ ] **Step 6: Save the migration file + commit**

Save the Step 3 SQL to `db/migrations/0042_register_team_creates_members.sql` (with a header comment mirroring `0038`'s style: what/why, applied-to-prod date, the reuse policy, verification summary).

```bash
git add "db/migrations/0042_register_team_creates_members.sql"
git commit -m "feat(db): register_team creates players + team_members (0042, reuse same-name)"
git push origin main
```

---

### Task 2: `sync_team_roster` RPC + wire admin edit-roster

**Files:**
- Modify: `db/migrations/0042_register_team_creates_members.sql` (append the `sync_team_roster` RPC + grants — same migration, applied together).
- Modify: `public/app.js:3314-3319` (`tdbSetTeamRoster`).
- Modify: `public/app.js:30` (`APP_VERSION`).

**Interfaces:**
- Consumes: `public.link_roster_to_team(uuid, jsonb, uuid)` from Task 1.
- Produces: `public.sync_team_roster(p_team_id uuid, p_roster jsonb) returns void` (SECURITY DEFINER; execute granted to `authenticated`, revoked from public/anon).

- [ ] **Step 1: Write the failing integration test**

Via `execute_sql` on a throwaway team (an admin edits a roster → members should appear):

```sql
insert into tournaments (name, status, registration_open, community_id)
values ('ZZ 3a Sync', 'setup', true, '2c3bcfa9-305e-448b-924b-da90c029f575') returning id;  -- :tid
insert into teams (tournament_id, name, roster, community_id)
values (:tid, 'ZZ Sync Team', '[]'::jsonb, '2c3bcfa9-305e-448b-924b-da90c029f575') returning id;  -- :teamid

select sync_team_roster(:teamid, '["Sync One","Sync Two"]'::jsonb);
select count(*) as members from team_members where team_id = :teamid;  -- expect 2
```

- [ ] **Step 2: Run it to verify it fails**

Expected: ERROR `function sync_team_roster(uuid, jsonb) does not exist`. FAIL. Clean up: `delete from teams where tournament_id=:tid; delete from tournaments where id=:tid;`

- [ ] **Step 3: Apply the `sync_team_roster` RPC (append to migration 0042)**

```sql
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
```

- [ ] **Step 4: Run the test to verify it passes**

Re-run the Step 1 setup + `sync_team_roster` call. Expected: `members = 2`. PASS. Then clean up (delete team → cascades members; delete the 2 created players `Sync One`/`Sync Two`; delete tournament) and re-verify baseline 233/18/0.

- [ ] **Step 5: Wire `tdbSetTeamRoster` to call it + bump version**

In `public/app.js`, replace `tdbSetTeamRoster` (lines 3314-3319):

```javascript
// Admin: replace a team's roster (edit its players post-registration). Mirrors tdbRenameTeam (direct authed
// update). Powers tournament-mode "Edit roster" (Mike, 2026-06-27). Slice 3a: also sync team_members so an
// edited roster keeps its player links (additive — sync adds missing links; it does not prune removed names).
async function tdbSetTeamRoster(teamId, roster) {
  if (!supabaseClient || !teamId) throw new Error('No team.');
  const clean = (roster || []).map((n) => String(n || '').trim()).filter(Boolean);
  const { error } = await supabaseClient.from('teams').update({ roster: clean }).eq('id', teamId);
  if (error) { console.error('tdbSetTeamRoster', error); throw error; }
  const { error: syncErr } = await supabaseClient.rpc('sync_team_roster', { p_team_id: teamId, p_roster: clean });
  if (syncErr) { console.error('tdbSetTeamRoster sync', syncErr); throw syncErr; }
}
```

Bump `public/app.js:30`: `const APP_VERSION = '2026.07.08.6';` (or `.N+1` for the current day).

- [ ] **Step 6: Verify syntax + commit + push**

```bash
node --check public/app.js
git add public/app.js "db/migrations/0042_register_team_creates_members.sql"
git commit -m "feat: sync team_members on admin roster edit (sync_team_roster RPC) + version bump"
git push origin main
```

---

## Slice-3a done-criteria (verify before calling 3a complete)

- Migration 0042 applied to prod + saved as a file; `get_advisors(security)` shows no new anon-executable endpoints (`link_roster_to_team`/`sync_team_roster` NOT anon-executable).
- Integration tests (Task 1 Step 4, Task 2 Step 4) all PASS; throwaway data cleaned; baseline 233 players / 18 teams / 0 team_members intact.
- `node --check public/app.js` clean; `APP_VERSION` bumped; deployed; app still loads with 0 console errors (register + admin edit-roster paths exercised on a throwaway).
- 12-history file written before marking the task complete (§30).

## Roadmap — follow-on plans (NOT execution tasks here)

These get their own plans (written after 3a ships), per the spec's slice split. Outlined so the arc is visible:

- **Slice 3b — Claim + approvals.** Claim UI = Option A (reuse the Check-In kiosk search; results show `name · team` to disambiguate; confirm → `claim_player`). Organizer approvals panel in the admin/Manage surface listing pending `player_claims` → `approve_claim` / `reject_claim`. Wires to the 0038 RPCs (already live). Files: `public/app.js` (claim view + approvals view), `public/styles.css`.
- **Slice 3c — Personal surfaces.** Tested pure helpers in `public/pure.js` (`resolveMyTeam`, `computeTeamRunTimeline`, `computeTeamRecord`), unit-tested in `test/` via the CommonJS-require pattern. Then wire Home hero C, My Team B, Standings "You" (visuals already locked in `2026-07-08-public-dashboard-remake-design.md` §Personal layer). Read `team_members` + claimed players alongside the existing tournament read; render via `partialRender()` on background syncs.

## Self-Review

- **Spec coverage:** Spec §4a (helper + register_team rewrite) → Task 1. §4b (admin path + additive-only) → Task 2. §4c/§4d/§4e (resolver, claim, surfaces) → Roadmap (follow-on plans, by design). §3 identity policy → encoded in Task 1 Step 3 + Global Constraints. §5 error handling → in-transaction rollback (Task 1) + guarded RPC error (Task 2). §6 testing → SQL integration in both tasks. Covered.
- **Placeholder scan:** No TBD/TODO; every SQL + JS step shows complete code.
- **Type consistency:** `link_roster_to_team(uuid, jsonb, uuid)` defined in Task 1, consumed by `sync_team_roster` in Task 2 with matching args. `register_team` signature unchanged from the live definition. `tdbSetTeamRoster(teamId, roster)` signature unchanged; adds an `.rpc('sync_team_roster', {p_team_id, p_roster})` call matching the RPC's params.
