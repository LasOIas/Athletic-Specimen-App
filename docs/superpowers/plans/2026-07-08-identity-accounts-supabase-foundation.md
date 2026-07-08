# Identity & Accounts — Supabase Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Set up Supabase correctly for the new Athletic Specimen model — first-class `communities`, `profiles` (Supabase Auth), `memberships`/roles, `community_id` scoping on all data, a claim-a-player link, and a role-based RLS + RPC rewrite that retires the hardcoded `nlvb2025` admin code and the client-trusted `isAdmin` — **without breaking the live app or locking the owner out**.

**Architecture:** Additive, reversible migrations applied FIRST on a **Supabase development branch** (`create_branch`), verified there, then merged/replayed to prod. Every step is backward-compatible so the live app (including the just-shipped anon spectator dashboard, which depends on anon-read) keeps working throughout; the RLS cutover is the last, most careful step and is proven on the branch before prod. Migration files live in `db/migrations/` (repo convention) and are applied via the Supabase MCP `apply_migration`.

**Tech Stack:** Supabase Postgres (RLS + SECURITY DEFINER RPCs), Supabase Auth (magic-link + Google OAuth), Supabase branching for staging. No app framework change.

## Scope

**In (this plan — the DB/auth foundation):** the `communities`/`profiles`/`memberships` schema, `community_id` backfill across existing data, `players.claimed_by_profile`, the claim/approve RPCs, the RLS rewrite, the scoring-permission RPC rewrite, retiring the code/`isAdmin` at the DB layer, and the branch→prod rollout.

**Out (a separate follow-on plan — the app integration):** the sign-in UI, the claim-a-team UI, gating the admin UI on the server-returned role, and wiring the public dashboard's personal features. This plan makes the DB *correct and ready*; the app wiring consumes it. (It also unblocks the W-F01→F07 security backlog, which folds into the RLS rewrite.)

**Grounding:** `docs/superpowers/specs/2026-07-08-identity-accounts-design.md` + the 2026-07-08 live-schema gap analysis (below).

## Current state (ground truth, 2026-07-08)

- **Tables (14, all RLS-on):** players (233), tournaments (1, live/bracket), pools (3), teams (18), team_members (0 — rosters live in `teams.roster` jsonb), matches (71), sessions, check_ins (78), attendance_sessions (3), live_state, groups (3), scoring_presets, action_log, copilot_actions.
- **RLS today (the `c21` model):** on every table, `anon` = SELECT, `authenticated` = ALL. So "logged-in session = full admin"; there is no role granularity and no community scoping.
- **Admin session:** derives from the code-login; `auth.users` has **2** accounts. `state.isAdmin`/`masterAdminAuthenticated`/`limitedGroup` derive from that session's JWT (app.js:53, 6025).
- **SECURITY DEFINER RPCs (write path, bypass RLS):** `check_in`, `check_out`, `register_player`, `register_team`, `submit_match_score`, `set_live_score`, `edit_match_score`, `clear_bracket_atomic`, `start_new_session`, `log_copilot_action`, `current_session_id`.
- **Missing entirely:** `communities`, `profiles`, `memberships`; `community_id` on any table; `players.claimed_by_profile`; role-based policies; auth wired into the app.

## Global Constraints

- **Never break anon-read.** The live spectator app (v2026.07.08.1) reads public data as `anon`. Every RLS change must keep anon SELECT on public columns of public data (`tournaments`, `teams`, `pools`, `matches`, `sessions`, `check_ins`, `attendance_sessions`, `live_state`, `groups`, `scoring_presets`, and roster **names**) and must NEVER expose `players.skill` or `profiles.email` to anon.
- **Never lock the owner out.** The cutover retiring `nlvb2025` must first create Mike's owner membership and prove the new role path works on the branch; the old auth path stays valid until the new one is confirmed on prod.
- **Test on a branch first (§20 migration hygiene).** No DDL/RLS change touches prod until it's applied + verified on the Supabase dev branch. Long/complex migrations use `apply_migration` (not chained), read logs after one failure, stop after two.
- **Additive + reversible.** New columns are nullable with a backfill; no destructive drop until the new model is proven on prod. Keep old policies alongside new ones until the app cuts over, then drop old.
- **Tenancy = single now, built to expand:** exactly one `communities` row (Mike's) seeded; all data scoped to it. No onboarding/billing.
- **Private fields:** `players.skill`, `profiles.email` — organizer/owner only (+ self for own email). Never anon/public.
- **Verify each step against the DB (Supabase MCP) on the branch before prod.**

---

## File Structure

| File | Responsibility |
|---|---|
| `db/migrations/0032_communities.sql` | `communities` table + seed row |
| `db/migrations/0033_profiles.sql` | `profiles` table + `handle_new_user` trigger on `auth.users` |
| `db/migrations/0034_memberships.sql` | `memberships` table + role enum + seed owner |
| `db/migrations/0035_community_id_scoping.sql` | add nullable `community_id` FK to all scoped tables + backfill + set NOT NULL |
| `db/migrations/0036_players_claim.sql` | `players.claimed_by_profile` + claim state |
| `db/migrations/0037_role_helpers.sql` | `SECURITY DEFINER` helpers: `caller_role(community)`, `is_organizer(community)`, `is_owner(community)`, `caller_claims_team(team)` |
| `db/migrations/0038_rls_rewrite.sql` | new role-based policies alongside old; private-field column grants |
| `db/migrations/0039_rpc_scoring_policy.sql` | rewrite scoring RPCs to enforce claimed-player/organizer; claim/approve RPCs |
| `db/migrations/0040_retire_legacy_rls.sql` | drop the old `c21` blanket-authenticated policies (LAST, after app cutover) |

Each migration is applied on the branch, verified, then replayed to prod. `0040` runs only after the app integration (separate plan) gates on server role.

---

## Task 1: Provision the Supabase dev branch (test bed)

**Interfaces:** Produces a branch project id used by every later task's branch-verify step.

- [ ] **Step 1: Confirm cost + create the branch.** Use `mcp__plugin_supabase__get_cost` (type `branch`) → `confirm_cost` → `create_branch` (name `identity-foundation`). Record the returned branch project id.
- [ ] **Step 2: Verify the branch mirrors prod.** `list_tables` + `list_migrations` on the branch == prod's 14 tables / latest migration `apply_net_count_change`. Expected: identical baseline.
- [ ] **Step 3: Note the branch id** at the top of this plan for later steps. No commit (infra step).

> If Supabase branching is unavailable/undesired for cost, the fallback is a throwaway schema clone; but the branch is the intended, lowest-risk path. Surface the cost to Mike before creating (AskUserQuestion) — branches bill.

---

## Task 2: `communities` + seed

**Files:** Create `db/migrations/0032_communities.sql`.
**Interfaces:** Produces `communities(id uuid pk, name text, slug text, created_at)` + one seeded row; its id is consumed by every scoping/backfill step.

- [ ] **Step 1: Write the migration.**
```sql
create table if not exists public.communities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  created_at timestamptz not null default now()
);
alter table public.communities enable row level security;
-- one community for now (name confirmed with Mike; slug derived)
insert into public.communities (name, slug)
  values ('Athletic Specimen', 'athletic-specimen')
  on conflict (slug) do nothing;
-- anon may read the community (name is public); writes are owner-only (added in the RLS task)
create policy "communities anon read" on public.communities for select to anon using (true);
create policy "communities auth read" on public.communities for select to authenticated using (true);
```
- [ ] **Step 2: Apply on the branch** via `apply_migration`. Verify `select id, name from communities;` returns exactly one row.
- [ ] **Step 3: Commit** `db/migrations/0032_communities.sql`.

> **OPEN (route to Mike):** the community display name. Plan assumes `'Athletic Specimen'`; confirm before prod apply.

---

## Task 3: `profiles` + new-user trigger

**Files:** Create `db/migrations/0033_profiles.sql`.
**Interfaces:** Produces `profiles(id uuid pk = auth.users.id, display_name text, email text, created_at)`; a trigger auto-creates a profile on signup. `email` is PRIVATE (never anon/public).

- [ ] **Step 1: Write the migration.**
```sql
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,               -- PRIVATE: self + organizer/owner only
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)), new.email)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- self can read/update own profile; anon gets NOTHING on profiles (email is private)
create policy "profiles self read" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles self update" on public.profiles for update to authenticated using (id = auth.uid());
```
- [ ] **Step 2: Apply on the branch.** Verify: insert a test user via the branch Auth admin (or `select` on existing `auth.users`) → a `profiles` row appears. Confirm anon cannot select `profiles` (policy denies).
- [ ] **Step 3: Backfill the 2 existing `auth.users`** into `profiles` (the trigger only fires on NEW inserts):
```sql
insert into public.profiles (id, display_name, email)
select id, coalesce(raw_user_meta_data->>'full_name', split_part(email,'@',1)), email
from auth.users on conflict (id) do nothing;
```
- [ ] **Step 4: Commit.**

---

## Task 4: `memberships` + role enum + seed owner

**Files:** Create `db/migrations/0034_memberships.sql`.
**Interfaces:** Produces `memberships(profile_id, community_id, role, status)` unique on `(profile_id, community_id)`; role ∈ `owner|organizer|player`. Consumed by every role helper + policy.

- [ ] **Step 1: Write the migration.**
```sql
do $$ begin
  create type public.community_role as enum ('owner','organizer','player');
exception when duplicate_object then null; end $$;

create table if not exists public.memberships (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  community_id uuid not null references public.communities(id) on delete cascade,
  role public.community_role not null default 'player',
  status text not null default 'active',   -- 'active' | 'pending'
  created_at timestamptz not null default now(),
  primary key (profile_id, community_id)
);
alter table public.memberships enable row level security;
-- a member can read their own membership rows; organizer/owner read is added with the helpers
create policy "memberships self read" on public.memberships for select to authenticated using (profile_id = auth.uid());
```
- [ ] **Step 2: Apply on the branch.**
- [ ] **Step 3: Seed Mike as owner.** Identify Mike's `auth.users` id (confirm which of the 2 is his — route to Mike), then:
```sql
insert into public.memberships (profile_id, community_id, role, status)
select '<MIKE_AUTH_UID>', c.id, 'owner', 'active' from public.communities c where c.slug='athletic-specimen'
on conflict (profile_id, community_id) do update set role='owner', status='active';
```
- [ ] **Step 4: Verify** `select role from memberships where profile_id='<MIKE_AUTH_UID>'` = `owner`. Commit.

> **RESOLVED (2026-07-08):** the 2 existing `auth.users` are synthetic code-login accounts (`owner@athleticspecimen.local`, `kc@athleticspecimen.local`) — NOT real. The real owner = Mike's account created at his FIRST magic-link sign-in (`olasmikey@gmail.com`). So the owner seed (Step 3) runs AFTER auth is wired + Mike signs in once; the 2 `.local` accounts are retired with the code (Task 10). Seed uses Mike's real auth uid.

---

## Task 5: `community_id` scoping + backfill

**Files:** Create `db/migrations/0035_community_id_scoping.sql`.
**Interfaces:** Adds nullable `community_id uuid references communities(id)` to every data table, backfills all existing rows to Mike's community, then sets NOT NULL. Consumed by all scoped policies.

- [ ] **Step 1: Write the migration** (add nullable → backfill → NOT NULL, per table). Scoped tables: `players, tournaments, teams, team_members, sessions, matches, pools, attendance_sessions, check_ins, groups, scoring_presets, live_state`.
```sql
-- pattern, repeated per table:
alter table public.players add column if not exists community_id uuid references public.communities(id);
update public.players set community_id = (select id from public.communities where slug='athletic-specimen') where community_id is null;
alter table public.players alter column community_id set not null;
-- ...repeat for tournaments, teams, team_members, sessions, matches, pools,
--    attendance_sessions, check_ins, groups, scoring_presets, live_state
-- default new rows to the single community until multi-community exists:
alter table public.players alter column community_id set default (select id from public.communities where slug='athletic-specimen');
```
- [ ] **Step 2: Apply on the branch.** Verify per table: `count(*) where community_id is null` = 0, and `count(distinct community_id)` = 1.
- [ ] **Step 3: Cross-check row counts unchanged** (players 233, matches 71, teams 18, …) — backfill must not drop/dup rows.
- [ ] **Step 4: Commit.**

> Column-default via subquery is fine for a single community; when multi-community lands, the app will set `community_id` explicitly and this default is removed.

---

## Task 6: `players.claimed_by_profile`

**Files:** Create `db/migrations/0036_players_claim.sql`.
**Interfaces:** Adds `players.claimed_by_profile uuid null references profiles(id)` + a pending-claim table (or column) for the approve step.

- [ ] **Step 1: Write the migration.**
```sql
alter table public.players add column if not exists claimed_by_profile uuid references public.profiles(id);
-- pending claims awaiting organizer approval
create table if not exists public.player_claims (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  community_id uuid not null references public.communities(id) on delete cascade,
  status text not null default 'pending',  -- 'pending' | 'approved' | 'rejected'
  created_at timestamptz not null default now(),
  unique (player_id, profile_id)
);
alter table public.player_claims enable row level security;
```
- [ ] **Step 2: Apply on the branch.** Verify the column + table exist; `claimed_by_profile` is null for all 233 players (unclaimed until the flow runs). Commit.

---

## Task 7: Role helper functions

**Files:** Create `db/migrations/0037_role_helpers.sql`.
**Interfaces:** Produces `SECURITY DEFINER` helpers used by every new policy + RPC: `caller_role(p_community uuid) returns community_role`, `is_owner(uuid) returns bool`, `is_organizer(uuid) returns bool` (owner counts as organizer), `caller_claims_team(p_team uuid) returns bool`.

- [ ] **Step 1: Write the migration.**
```sql
create or replace function public.caller_role(p_community uuid)
returns public.community_role language sql stable security definer set search_path=public as $$
  select role from public.memberships
   where profile_id = auth.uid() and community_id = p_community and status='active' limit 1;
$$;

create or replace function public.is_organizer(p_community uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.caller_role(p_community) in ('owner','organizer');
$$;

create or replace function public.is_owner(p_community uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.caller_role(p_community) = 'owner';
$$;

-- true if the caller is a claimed player on either side of a match's teams (for scoring)
create or replace function public.caller_claims_team(p_team uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.players pl
     where pl.claimed_by_profile = auth.uid()
       and pl.id in (select id from public.players where community_id =
                      (select community_id from public.teams where id = p_team))
  );  -- refined against the real team↔player link in Step 2
$$;
```
- [ ] **Step 2: Implement `caller_claims_team` via `team_members` (DECIDED 2026-07-08 w/ Mike).** The link is FK-based: `team_members(team_id, player_id, community_id)` rows tie a team to its player records, created at team registration (Task 9's `register_team` rewrite matches/creates a player row per roster name and inserts `team_members`). The helper checks whether the caller's claimed player has a `team_members` row on `p_team`:
```sql
create or replace function public.caller_claims_team(p_team uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.team_members tmb
      join public.players pl on pl.id = tmb.player_id
     where tmb.team_id = p_team and pl.claimed_by_profile = auth.uid()
  );
$$;
```
- [ ] **Step 3: Apply on branch + unit-verify** each helper with a seeded owner/organizer/player + a claimed player. Commit.

> **DESIGN NOTE (RESOLVED 2026-07-08 w/ Mike):** the team↔claimed-player link is FK-based via `team_members` rows created at registration (not the jsonb roster names). Task 9's `register_team` rewrite populates `team_members` (match/create a player row per roster name, insert `team_members(team_id, player_id, community_id)`). A one-time backfill in Task 9 also creates `team_members` for the existing 18 teams from their current jsonb rosters. `teams.roster` stays as the display cache; `team_members` becomes the source of truth for the link.

---

## Task 8: RLS rewrite (role-based, alongside old)

**Files:** Create `db/migrations/0038_rls_rewrite.sql`.
**Interfaces:** Adds new role-based policies; keeps anon-read; locks private fields. Old `c21` policies stay until Task 10 (post app-cutover) so nothing breaks mid-rollout.

- [ ] **Step 1: Write the migration** — for each scoped table, add: keep `anon SELECT` (public columns), add `organizer/owner` write via `is_organizer(community_id)`. Example (matches):
```sql
create policy "matches organizer write" on public.matches for all to authenticated
  using (public.is_organizer(community_id)) with check (public.is_organizer(community_id));
-- players: private skill column — revoke anon column access, keep name readable
revoke select on public.players from anon;
grant select (id, name, checked_in, tag, "group", community_id, claimed_by_profile, created_at, updated_at) on public.players to anon;
-- skill stays organizer/owner-only (via a policy or column grant to authenticated + is_organizer check)
```
- [ ] **Step 2: Apply on the branch.** **Verify anon still reads** tournaments/teams/matches/standings/roster-names (drive the Slice-1 app against the branch URL). **Verify anon CANNOT read `players.skill` or `profiles.email`.**
- [ ] **Step 3: Verify role writes** — an organizer session can write matches; a plain player session cannot (except scoring, Task 9); anon cannot write.
- [ ] **Step 4: Commit.** Do NOT drop old policies yet.

---

## Task 9: RPC scoring policy + claim/approve RPCs

**Files:** Create `db/migrations/0039_rpc_scoring_policy.sql`.
**Interfaces:** Rewrites `submit_match_score` / `set_live_score` / `edit_match_score` to require a claimed player on a participating team OR organizer/owner (closes W-F03). Adds `claim_player(p_player uuid)` + `approve_claim(p_claim uuid)` RPCs. Keeps an anon RPC for **casual** (non-tournament) court scoring.

- [ ] **Step 1: Write the migration** — wrap each scoring RPC's body with a guard:
```sql
-- inside submit_match_score / set_live_score / edit_match_score, after loading the match:
if not (public.is_organizer(v_community) or public.caller_claims_team(v_team_a) or public.caller_claims_team(v_team_b)) then
  raise exception 'not authorized to score this match';
end if;
-- casual (non-tournament) scoring keeps a separate anon RPC (unchanged).
```
```sql
create or replace function public.claim_player(p_player uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_community uuid; v_claim uuid;
begin
  select community_id into v_community from public.players where id = p_player;
  insert into public.player_claims (player_id, profile_id, community_id)
    values (p_player, auth.uid(), v_community)
    on conflict (player_id, profile_id) do update set status='pending' returning id into v_claim;
  return v_claim;
end $$;

create or replace function public.approve_claim(p_claim uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_community uuid; v_player uuid; v_profile uuid;
begin
  select community_id, player_id, profile_id into v_community, v_player, v_profile
    from public.player_claims where id = p_claim;
  if not public.is_organizer(v_community) then raise exception 'organizer only'; end if;
  update public.player_claims set status='approved' where id = p_claim;
  update public.players set claimed_by_profile = v_profile where id = v_player;
end $$;
```
- [ ] **Step 2: Apply on the branch + verify** the full claim flow: sign in (branch) → `claim_player` (pending) → `approve_claim` as organizer → `players.claimed_by_profile` set → that claimed player can `submit_match_score` on their team's match; a stranger cannot; anon casual scoring still works.
- [ ] **Step 3: Rebuild each RPC off its LIVE definition** (preserve `_audit_actor`, version-CAS, etc. — do not regress existing behavior; the RPCs already exist, only the auth guard is added). Commit.

---

## Task 10: Retire the legacy code/`isAdmin` at the DB layer (LAST, gated)

**Files:** Create `db/migrations/0040_retire_legacy_rls.sql`.
**Interfaces:** Drops the old `c21` blanket `authenticated = ALL` policies so role-based is the only path. **Runs only AFTER the app integration plan gates the admin UI on the server role AND the owner/organizer memberships are confirmed on PROD.**

- [ ] **Step 1: Pre-flight guard** — assert on prod: Mike's owner membership exists, at least the new organizer path is proven, the app reads role from the server. If not, STOP.
- [ ] **Step 2: Write the migration** — `drop policy "c21 admin all" on public.<table>;` for every table (replaced by the role-based policies from Task 8). Keep anon-read.
- [ ] **Step 3: Apply on the branch first**, re-run the full anon + role + scoring verification. Then, only on Mike's go, apply to prod.
- [ ] **Step 4: Rotate/remove the leaked `nlvb2025`** (W-F01) + decide repo-private — **Mike's real-world call** (route, don't assume). Commit.

---

## Task 11: Branch → prod rollout + verification

- [ ] **Step 1: Full branch verification** — the whole app (anon spectator + a signed-in owner/organizer/player) works against the branch; run the reliability checks (§47/§48 shape); 0 regressions.
- [ ] **Step 2: Replay migrations 0032→0039 to prod in order** via `apply_migration` (0040 held for the app-cutover). Read logs after each; stop after any failure (§20).
- [ ] **Step 3: Prod verification** — anon spectator app still works (Slice 1), owner membership works, private fields hidden from anon, existing data intact (233 players, live June 2026 tournament untouched). DB cross-check each.
- [ ] **Step 4: Vault write-back** — 12-history file, `01-state/current.md` + `log.md` + `decisions.md` (the branch-first cutover, the community model, the team↔player link decision), migration ledger through 0039/0040.

---

## Self-Review

**Spec coverage** (`2026-07-08-identity-accounts-design.md`): communities (T2), profiles+auth trigger (T3), memberships/roles (T4), community_id scoping (T5), claim column (T6) + flow (T9), RLS rewrite (T8) with private fields, scoring policy closing W-F03 (T9), retire code/isAdmin (T10), migration/backfill (T5/T11), owner seed (T4). Auth provider config (magic-link/Google) is a Supabase dashboard setting invoked in the app-integration plan; noted, not a DDL task here.

**Known open decisions (surfaced, not guessed):** community display name (T2); which `auth.users` is Mike's owner + what happens to the 2nd (T4); the team↔claimed-player link since `team_members` is empty and rosters are jsonb names (T7 Step 2) — this gates the scoring policy and MUST be settled with Mike before T7/T9 prod apply.

**Safety invariants checked:** anon-read preserved at every step (explicit verify in T8); owner never locked out (old policies kept until T10, owner seeded in T4, T10 pre-flight guard); additive/reversible; branch-first; row counts cross-checked after backfill (T5).

**Out of scope (separate plan):** all app.js/UI wiring — sign-in screen, claim UI, role-gated admin, personal features. This plan leaves the DB correct and ready.

---

## Execution Handoff

**This plan changes the live production database.** Before executing:
1. It needs Mike's approval of the plan + the 3 open decisions (community name; owner identity; team↔player link).
2. Task 1 creates a **billed** Supabase branch — confirm cost with Mike first.
3. Nothing touches prod until Tasks 2–9 are green on the branch (Task 11 Step 2).

Two execution options:
1. **Subagent-Driven (recommended)** — fresh subagent per migration task, verify on the branch between each. (REQUIRED SUB-SKILL: superpowers:subagent-driven-development.)
2. **Inline** — execute here with a branch-verify checkpoint per task. (REQUIRED SUB-SKILL: superpowers:executing-plans.)
