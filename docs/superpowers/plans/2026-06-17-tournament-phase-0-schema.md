# Tournament — Phase 0: Database Schema (Implementation Plan)

> **For agentic workers:** Use superpowers:executing-plans (inline) to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the real Supabase relational schema for the tournament system (tables + RLS + indexes), replacing the JSON-blob-in-`players.tag` hack — applied and verified, touching nothing in the existing `players`/`sessions` tables.

**Architecture:** Additive migration on Supabase project `mlzblkzflgylnjorgjcp`. Six new tables (`tournaments`, `pools`, `teams`, `team_members`, `matches`) with foreign keys, indexes, a per-row `version` column for optimistic concurrency, and winner/loser advancement pointers on `matches`. RLS enabled with open (`public`) policies that mirror the existing app's anon-access model; admin gating stays client-side (the app has no DB-level auth roles — `state.isAdmin` is a client code), which is acceptable per the spec's open-submission decision.

**Tech Stack:** Supabase Postgres, applied via the Supabase MCP (`apply_migration`), verified via `list_tables` + `execute_sql` + `get_advisors`. No app code changes in Phase 0.

## Global Constraints

- Supabase project id: `mlzblkzflgylnjorgjcp` (Athletic Specimen). Verify before applying.
- **Additive only** — do NOT alter or drop `public.players` (217 live rows) or `public.sessions`.
- `team_members.player_id` references `public.players(id)` which is **`uuid`**.
- New PKs are `uuid default gen_random_uuid()`.
- RLS enabled on every new table; v1 policies are open to role `public` (matches existing tables); admin gating is enforced client-side.
- No `APP_VERSION` bump in Phase 0 (no `public/app.js` change). The bump happens in Phase 1 when code first reads these tables.

---

## Phase roadmap (context — each later phase gets its own plan doc)

- **Phase 0 (this plan):** DB schema — tables + RLS + indexes, applied & verified.
- **Phase 1:** Tournament data-access layer (JS store: CRUD + optimistic concurrency) + re-home the Tournament tab from the legacy overlay into a Teams-style `tab-panel`; admin can create a tournament + add teams; public read-only. Working slice on the live preview.
- **Phase 2:** Pools + self-serve pool play — random pool draw + manual adjust, round-robin generation, net queue, pick-your-team result submission, live standings auto-tally (W-L → point diff), admin override/lock.
- **Phase 3:** Seeding + double-elim generation — deterministic seeding from standings; double-elim bracket build (winners/losers/grand-final w/ skippable reset); pure functions with real unit tests.
- **Phase 4:** Bracket rendering — single-round-focus (phone) + classic tree (wide); tap-winner advance + optional scores; loser routing; champion.
- **Phase 5:** Polish + reliability check (§35) on desktop + real iPhone; merge to `main`.

---

## File structure (Phase 0)

- **Create:** `db/migrations/0001_tournament_schema.sql` — canonical copy of the migration committed to the repo (source of truth; the same SQL is applied via the Supabase MCP).
- No `public/app.js` / `public/styles.css` changes in this phase.

---

## Task 1: Apply the additive tournament schema

**Files:**
- Create: `db/migrations/0001_tournament_schema.sql`
- Apply: via Supabase MCP `apply_migration` (name `tournament_schema`) to project `mlzblkzflgylnjorgjcp`

**Interfaces:**
- Produces (consumed by Phase 1+): tables `tournaments`, `pools`, `teams`, `team_members`, `matches` with the columns below. Phase 1's data-access layer relies on these exact names/types.

- [ ] **Step 1: Confirm current schema (pre-check)**

Run (Supabase MCP `list_tables`, verbose, project `mlzblkzflgylnjorgjcp`).
Expected: only `public.players` and `public.sessions` exist; no tournament tables. (If any tournament table already exists, STOP and reconcile.)

- [ ] **Step 2: Write the migration file**

Create `db/migrations/0001_tournament_schema.sql` with exactly:

```sql
-- Tournament system v1 — additive schema. Does NOT touch players/sessions.

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'setup'
    check (status in ('setup','pools','bracket','completed')),
  match_cap int not null default 25,
  pool_count int not null default 4,
  net_count int not null default 10,
  grand_final_reset boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pools (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  label text not null,
  display_order int not null default 0
);
create index if not exists pools_tournament_idx on public.pools(tournament_id);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name text not null,
  seed int,
  pool_id uuid references public.pools(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists teams_tournament_idx on public.teams(tournament_id);
create index if not exists teams_pool_idx on public.teams(pool_id);

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  is_captain boolean not null default false,
  primary key (team_id, player_id)
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  phase text not null check (phase in ('pool','main')),
  side text check (side in ('winners','losers','grand_final')),
  pool_id uuid references public.pools(id) on delete cascade,
  round int not null default 0,
  slot int not null default 0,
  round_label text,
  net int,
  queue_order int,
  team_a_id uuid references public.teams(id) on delete set null,
  team_b_id uuid references public.teams(id) on delete set null,
  source_a text,
  source_b text,
  status text not null default 'scheduled'
    check (status in ('scheduled','live','final')),
  score_a int,
  score_b int,
  winner_team_id uuid references public.teams(id) on delete set null,
  loser_team_id uuid references public.teams(id) on delete set null,
  winner_next_match_id uuid references public.matches(id) on delete set null,
  winner_next_slot int,
  loser_next_match_id uuid references public.matches(id) on delete set null,
  loser_next_slot int,
  version int not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists matches_tournament_idx on public.matches(tournament_id);
create index if not exists matches_pool_idx on public.matches(pool_id);
create index if not exists matches_phase_idx on public.matches(tournament_id, phase);

-- RLS: open to role `public` for v1 (mirrors existing players/sessions anon model;
-- admin gating is client-side). Tighten post-v1 if abuse appears.
alter table public.tournaments  enable row level security;
alter table public.pools        enable row level security;
alter table public.teams        enable row level security;
alter table public.team_members enable row level security;
alter table public.matches      enable row level security;

create policy "v1 open tournaments"  on public.tournaments  for all to public using (true) with check (true);
create policy "v1 open pools"        on public.pools        for all to public using (true) with check (true);
create policy "v1 open teams"        on public.teams        for all to public using (true) with check (true);
create policy "v1 open team_members" on public.team_members for all to public using (true) with check (true);
create policy "v1 open matches"      on public.matches      for all to public using (true) with check (true);
```

- [ ] **Step 3: Apply the migration**

Run (Supabase MCP `apply_migration`, name `tournament_schema`, project `mlzblkzflgylnjorgjcp`, query = the SQL above).
Expected: success, no error.

- [ ] **Step 4: Verify the tables exist with the right shape**

Run (Supabase MCP `list_tables`, verbose).
Expected: `tournaments`, `pools`, `teams`, `team_members`, `matches` all present, `rls_enabled: true`, columns + FKs as written. `players`/`sessions` unchanged (still 217 / 1 rows).

- [ ] **Step 5: Commit the migration file**

```bash
git add db/migrations/0001_tournament_schema.sql
git commit -m "feat(tournament): phase 0 — additive Supabase schema (tournaments/pools/teams/team_members/matches)"
```

---

## Task 2: Verify round-trip + advisors

**Files:** none (verification only).

- [ ] **Step 1: Insert a throwaway tournament graph and read it back**

Run (Supabase MCP `execute_sql`, project `mlzblkzflgylnjorgjcp`):

```sql
with t as (
  insert into public.tournaments (name) values ('__verify__') returning id
), p as (
  insert into public.pools (tournament_id, label, display_order)
  select id, 'A', 0 from t returning id, tournament_id
), tm as (
  insert into public.teams (tournament_id, name, pool_id)
  select p.tournament_id, 'Verify Team', p.id from p returning id, tournament_id, pool_id
)
insert into public.matches (tournament_id, phase, pool_id, team_a_id, status, score_a, score_b, version)
select tm.tournament_id, 'pool', tm.pool_id, tm.id, 'final', 25, 21, 0 from tm
returning id, tournament_id, phase, status, score_a, score_b;
```

Expected: one match row returned with `phase=pool`, `status=final`, `score_a=25`, `score_b=21`. (Confirms FKs + defaults + the pool/match wiring work end-to-end.)

- [ ] **Step 2: Clean up the throwaway data**

Run (Supabase MCP `execute_sql`):

```sql
delete from public.tournaments where name = '__verify__';
```

Expected: success. `on delete cascade` removes the pool/team/match rows too. Confirm with:

```sql
select count(*) as leftover from public.matches m
join public.tournaments t on t.id = m.tournament_id where t.name = '__verify__';
```
Expected: `leftover = 0`.

- [ ] **Step 3: Check security advisors**

Run (Supabase MCP `get_advisors`, type `security`).
Expected: no NEW critical issues from these tables beyond the intentional open-RLS posture (which mirrors the existing tables). Note any advisor output in the Phase 0 `12-history` file. If an advisor flags something unexpected (e.g., RLS not actually enabled), STOP and fix before Phase 1.

---

## Self-review (done)

- **Spec coverage:** Implements spec §6 (data model) tables verbatim, incl. the `loser_next_match_id`/`loser_next_slot` plate-routing columns and the `version` concurrency column (spec §9). RLS posture matches spec §6 + the Q3 decision. ✓
- **Placeholder scan:** No TBD/TODO; full DDL + full verification SQL present. ✓
- **Type consistency:** `team_members.player_id uuid` matches the verified `players.id uuid`; all FKs reference real columns; `matches` self-references for advancement pointers. ✓
- **Scope:** Phase 0 = schema only; produces verifiable software (queryable tables with enforced constraints). Later phases scoped in the roadmap. ✓
