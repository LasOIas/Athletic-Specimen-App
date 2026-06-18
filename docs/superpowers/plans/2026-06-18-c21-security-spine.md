# C21 — P0 Security Spine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task. Steps use `- [ ]` checkboxes. This touches the LIVE app + database — follow the phase order exactly; the lock (Phase 3) only flips AFTER the client switch (Phase 2) is verified on prod.

**Goal:** Make admin a real server-verified identity and lock the database (RLS) so the server enforces who can do what, while keeping admin login a quick code and players anonymous — with zero downtime.

**Architecture:** Expand→contract migration. Add server pieces additively (auth users, `admin_login` Edge Function, 3 SECURITY DEFINER RPCs, audit log) while RLS stays open; switch the client to use them (old open access still backstops); then flip RLS to anon-SELECT-only + FORCE RLS; then rotate the code + remove it from the bundle.

**Tech Stack:** Supabase (Postgres + RLS + Auth + Edge Functions/Deno), vanilla-JS client (`public/app.js`, `public/checkin.html`), `@supabase/supabase-js` (already loaded via CDN). Supabase project `mlzblkzflgylnjorgjcp`.

## Global Constraints
- Admin login stays quick: type a code, instant, no email/password/reset. (Mike: "it needs to be quick.")
- Players stay anonymous (no accounts). Check-in / register / submit-score stay frictionless.
- **No downtime** — the live app works at every step; the lock flips only after the client switch is verified on prod, at a low-traffic window (Mike picks it).
- Players never see skill; no neon; no emojis (SVG icons); mobile-first.
- Bump `APP_VERSION` (`public/app.js:22`) on every client change; `node --check public/app.js` after each edit; clean conventional commits (no trailers/emojis); commit+push per logical step (Vercel = verify path).
- Migrations are **idempotent** (`if not exists` / `create or replace` / `drop policy if exists`) and applied + verified via Supabase MCP before the dependent client ships.
- §30 history file before completion; update `03-anatomy/PRODUCT-SURFACE.md`.

## File / object structure
- **DB migrations** (apply via Supabase MCP `apply_migration`, one logical migration per task):
  - `0002_c21_audit.sql` — `players.created_at/updated_at` + trigger; `action_log` table.
  - `0003_c21_tournaments_group.sql` — `tournaments.group` column (for group-scoped admin).
  - `0004_c21_rpcs.sql` — `register_player`, `check_in`, `submit_match_score` (SECURITY DEFINER).
  - `0005_c21_rls_lock.sql` — drop open policies, add anon-SELECT + admin-write policies, FORCE RLS. **(Phase 3 only.)**
- **Edge Function:** `supabase/functions/admin_login/index.ts` (code→session).
- **Auth users:** created via Supabase admin API (one-off script or MCP) — `owner` + per-group, with `app_metadata {role, group}`.
- **Client:** `public/app.js` — new auth module (login via `admin_login`, session restore, derive `isAdmin`/group from JWT), route the 3 anon writes through RPCs; `public/checkin.html` — register/check-in via RPCs.
- **Server code store:** the hashed code→identity map lives in Edge Function env/secret (not in any client file).

---

## PHASE 1 — EXPAND (additive; RLS stays open; nothing breaks)

### Task 1: Audit columns + action_log
**Files:** Create migration `0002_c21_audit.sql` (apply via MCP).
**Interfaces:** Produces `players.created_at`, `players.updated_at`, table `action_log(id,at,actor,role,grp,action,entity_type,entity_id,detail,undo)`.

- [ ] **Step 1: Apply migration (idempotent)**
```sql
alter table public.players add column if not exists created_at timestamptz not null default now();
alter table public.players add column if not exists updated_at timestamptz not null default now();
create or replace function public.tg_set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists set_players_updated_at on public.players;
create trigger set_players_updated_at before update on public.players
  for each row execute function public.tg_set_updated_at();
create table if not exists public.action_log (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor text, role text, grp text,
  action text not null, entity_type text, entity_id text,
  detail text, undo jsonb
);
alter table public.action_log enable row level security;
```
- [ ] **Step 2: Verify (Supabase MCP)**
Run: `select column_name from information_schema.columns where table_name='players' and column_name in ('created_at','updated_at');` Expected: 2 rows. `select to_regclass('public.action_log');` Expected: non-null.
- [ ] **Step 3: Commit** the migration file.

### Task 2: tournaments.group column (for group-scoped admin)
**Files:** Create migration `0003_c21_tournaments_group.sql`.
**Interfaces:** Produces `tournaments.group text`.
- [ ] **Step 1: Apply** `alter table public.tournaments add column if not exists "group" text;` (backfill existing 0 rows — none today).
- [ ] **Step 2: Verify** column exists via MCP. **Step 3: Commit.**

### Task 3: The 3 anon-write RPCs (SECURITY DEFINER, validated)
**Files:** Create migration `0004_c21_rpcs.sql`.
**Interfaces:** Produces `register_player(p_name text, p_group text) returns players`, `check_in(p_id uuid) returns void`, `submit_match_score(p_match uuid, p_a int, p_b int, p_version int) returns matches`. All `SECURITY DEFINER`, `revoke all` then `grant execute to anon, authenticated`.
- [ ] **Step 1: Write the RPCs** (validate + minimal; mirror existing client validation):
```sql
-- register_player: dedup-aware insert (pairs with C22 unique index; handle 23505)
create or replace function public.register_player(p_name text, p_group text default '')
returns public.players language plpgsql security definer set search_path=public as $$
declare r public.players;
begin
  if coalesce(btrim(p_name),'')='' then raise exception 'name required'; end if;
  select * into r from public.players where lower(btrim(name))=lower(btrim(p_name)) limit 1;
  if found then return r; end if;  -- idempotent: already exists
  insert into public.players(name, skill, checked_in, "group")
    values (btrim(p_name), 0, true, coalesce(p_group,'')) returning * into r;
  insert into public.action_log(actor,role,action,entity_type,entity_id,detail)
    values ('anon','public','register','players',r.id::text, r.name);
  return r;
end $$;

-- check_in: set checked_in true for one player
create or replace function public.check_in(p_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.players set checked_in=true where id=p_id;
  if not found then raise exception 'player not found'; end if;
  insert into public.action_log(actor,role,action,entity_type,entity_id) values ('anon','public','check_in','players',p_id::text);
end $$;

-- submit_match_score: validate + CAS on version
create or replace function public.submit_match_score(p_match uuid, p_a int, p_b int, p_version int)
returns public.matches language plpgsql security definer set search_path=public as $$
declare m public.matches;
begin
  if p_a is null or p_b is null or p_a<0 or p_b<0 then raise exception 'invalid score'; end if;
  if p_a=p_b then raise exception 'no ties'; end if;
  update public.matches
     set score_a=p_a, score_b=p_b,
         winner_team_id = case when p_a>p_b then team_a else team_b end,
         loser_team_id  = case when p_a>p_b then team_b else team_a end,
         status='final', version=version+1
   where id=p_match and version=p_version and status<>'final'
   returning * into m;
  if not found then raise exception 'conflict or already final'; end if;
  insert into public.action_log(actor,role,action,entity_type,entity_id,detail)
    values ('anon','public','submit_score','matches',p_match::text, p_a||'-'||p_b);
  return m;
end $$;

revoke all on function public.register_player(text,text), public.check_in(uuid), public.submit_match_score(uuid,int,int,int) from public;
grant execute on function public.register_player(text,text), public.check_in(uuid), public.submit_match_score(uuid,int,int,int) to anon, authenticated;
```
- [ ] **Step 2: Verify each RPC works as anon (RLS still open)** via Supabase MCP / `curl` the REST `/rpc/check_in` with the anon key on a test player; confirm it sets checked_in + writes action_log; clean up. Confirm `register_player` is idempotent (2nd call same name → same row, no dup). Confirm `submit_match_score` rejects ties/negatives + honors version.
- [ ] **Step 3: Commit.**

### Task 4: Pre-provision admin auth users + the admin_login Edge Function
**Files:** Create `supabase/functions/admin_login/index.ts`; provision users via admin API.
**Interfaces:** Produces an HTTP endpoint `POST /functions/v1/admin_login {code}` → `{access_token, refresh_token, role, group}` on success, 401 otherwise.
- [ ] **Step 1: Provision auth users** (one-off, service role): create `owner@as.local` (app_metadata `{role:'owner', group:'*'}`) + one per group (`kc@as.local` `{role:'group_admin', group:'KC Volleyball'}`, `as@as.local` `{role:'group_admin', group:'Athletic Specimen'}`; add Kansas when Mike names it). Store each user's email/id.
- [ ] **Step 2: Write the Edge Function** — reads a secret `ADMIN_CODES` (JSON map of `{ "<bcrypt-or-sha256 hash>": {email, role, group} }` OR plaintext-in-secret for v1 since it's server-only), verifies the posted `code`, and on match uses the service-role client to mint a session for that user (`auth.admin.generateLink` / `signInWithPassword` against a code-derived password, or `auth.admin.createSession` equivalent) and returns the tokens. On no match → 401. Rate-limit basic.
- [ ] **Step 3: Deploy the function** (`supabase functions deploy admin_login`) + set the `ADMIN_CODES` secret.
- [ ] **Step 4: Verify** `curl -X POST .../admin_login -d '{"code":"<owner code>"}'` → 200 + tokens; wrong code → 401. Decode the JWT → app_metadata has role/group.
- [ ] **Step 5: Commit** the function.

**PHASE 1 GATE:** all server pieces exist; RLS still open; live app untouched + fully working. Verify the prod app still behaves normally (smoke).

---

## PHASE 2 — SWITCH THE CLIENT (RLS still open = safety net)

### Task 5: Client auth module (login via admin_login, derive isAdmin/group from session)
**Files:** Modify `public/app.js` — the login handler (~`6333` master compare / `6356` tenant map) + `state.isAdmin`/`state.masterAdminAuthenticated`/`state.limitedGroup` derivation (~`2514`/`2530`, restore ~`4178`).
**Interfaces:** Produces `adminLoginWithCode(code)` (calls `admin_login`, stores the Supabase session, sets `supabaseClient` auth, derives `state.isAdmin`=true, `state.masterAdminAuthenticated`=(role==='owner'), `state.limitedGroup`=(role==='group_admin'?group:null)); session restore on load from the stored session.
- [ ] **Step 1:** Add `adminLoginWithCode` — `POST` to `admin_login`, on success `supabaseClient.auth.setSession({access_token,refresh_token})`, read `app_metadata`, set the state flags, render. On 401 → "Incorrect admin code" (same UX as today).
- [ ] **Step 2:** Wire the login button to `adminLoginWithCode` FIRST; **keep the old `MASTER_ADMIN_CODE`/map compare as a temporary fallback** if the function call fails (network) — so login never regresses during transition.
- [ ] **Step 3:** Derive `isAdmin`/group from the restored session on load (in addition to the existing sessionStorage path, which stays as the fallback until Phase 4).
- [ ] **Step 4: Verify on prod (RLS still open):** logging in with the owner code via the function unlocks full admin; a group code unlocks only that group (limitedGroup set); session persists across reload; `node --check`; desktop + mobile. Bump APP_VERSION; commit + push.

### Task 6: Route the 3 anon writes through the RPCs
**Files:** Modify `public/app.js` (check-in/out ~`6608`/`6645`/`948`, register ~`6613`, public score submit path) + `public/checkin.html` (register ~`349`, check-in ~`309`).
**Interfaces:** Consumes the 3 RPCs from Task 3. Produces client calls `supabaseClient.rpc('check_in',{p_id})`, `rpc('register_player',{p_name,p_group})`, `rpc('submit_match_score',{...})` replacing the direct table writes on the anon/self-serve paths. (Admin-authenticated writes can stay direct — they'll be allowed by Phase 3 admin policies.)
- [ ] **Step 1:** Replace public/self-serve check-in + register (app.js + checkin.html) with the RPC calls; keep the optimistic-UI + pending pattern (from the disappearing-player fix).
- [ ] **Step 2:** Replace the self-serve match-score submit with `submit_match_score` (keep the existing optimistic + CAS handling around it).
- [ ] **Step 3: Verify on prod (RLS still open):** register a test player (RPC) → appears + dedup works; check-in/out via RPC → DB reflects; self-serve score submit via RPC → match final + standings update; checkin.html register/check-in work; clean up test data; 0 console errors; desktop + mobile. Bump APP_VERSION; commit + push.

**PHASE 2 GATE:** the live app now uses auth + RPCs for everything, verified on prod, WHILE open RLS still backstops. Do not proceed to Phase 3 until this is rock-solid for a full session cycle.

---

## PHASE 3 — CONTRACT (flip the lock — at a low-traffic window Mike picks)

### Task 7: Lock RLS
**Files:** Create migration `0005_c21_rls_lock.sql`.
**Interfaces:** Consumes everything above. Produces locked policies on all 7 tables.
- [ ] **Step 1: Confirm the window with Mike** (not during a session). 
- [ ] **Step 2: Apply the lock (idempotent)** — for each table: `drop policy if exists` every existing open policy; add `for select to anon, authenticated using (true)` (reads stay open — adjust players SELECT later if hiding cross-group is wanted, but v1 keeps reads open since the public view needs them); add admin-write policies keyed on JWT (`(auth.jwt()->'app_metadata'->>'role')='owner'` OR group match `=...->>'group'`); `alter table … force row level security`. The 3 RPCs already bypass RLS (SECURITY DEFINER) for anon writes. Example for players:
```sql
alter table public.players enable row level security;
drop policy if exists "Allow read access for anon" on public.players; -- (drop each existing open policy by name)
-- ... drop the rest (anon insert/update/delete policies) ...
create policy players_read on public.players for select to anon, authenticated using (true);
create policy players_admin_write on public.players for all to authenticated
  using ((auth.jwt()->'app_metadata'->>'role')='owner'
      or (auth.jwt()->'app_metadata'->>'group') = "group")
  with check ((auth.jwt()->'app_metadata'->>'role')='owner'
      or (auth.jwt()->'app_metadata'->>'group') = "group");
alter table public.players force row level security;
```
(Repeat the pattern for sessions, tournaments, pools, teams, team_members, matches — reads open, writes owner-or-group, FORCE.)
- [ ] **Step 3: Verify the lock (prod):** as anon from the console, `update players set checked_in=false` → **FAILS** (RLS); the 3 RPC writes still **succeed**; admin (logged in) writes succeed + are group-scoped; the live app fully works (reads + check-in + register + score submit + admin actions). Cross-check via Supabase MCP. **Rollback ready:** if the client breaks, re-apply the prior open policies immediately.
- [ ] **Step 4: Commit** the migration.

**PHASE 3 GATE:** the database is locked; the 44→0 console-wipe hole is closed; app fully functional.

---

## PHASE 4 — ROTATE + CLEAN

### Task 8: Rotate the code + remove it from the bundle
**Files:** Modify `public/app.js` (remove `MASTER_ADMIN_CODE` ~`44`, `DEFAULT_ADMIN_CODE_MAP` ~`47-50`, the temporary fallback from Task 5).
- [ ] **Step 1:** Set new codes in the Edge Function's `ADMIN_CODES` secret (rotate). 
- [ ] **Step 2:** Remove the hardcoded code + tenant map + the temporary client fallback; login is now ONLY via `admin_login`.
- [ ] **Step 3: Verify:** old code rejected; new code works (owner + each group); `grep -i nlvb2025 public/` and the deployed bundle → nothing; `node --check`; desktop + mobile. Bump APP_VERSION; commit + push.

### Task 9: Writeback + close
- [ ] Update `03-anatomy/PRODUCT-SURFACE.md` (auth/RLS/RPCs/audit) + `verified_against`; `log.md` + `current.md` + `decisions.md` (the auth model + expand→contract); `Tasks From Claude.md` C21 → DONE; `12-history/task-#<id>-C21-*.md`.

## Runtime inputs needed (flag at execution)
- The actual admin codes (owner + per group; Mike provides) — set in the Edge Function secret, never in client.
- The Phase-3 low-traffic window (Mike picks).
- The Kansas group's exact name/code if it's separate from "KC Volleyball".

## Self-review
- **Spec coverage:** auth (Tasks 4-5), lockdown (Task 7), 3 RPCs (Task 3), audit (Task 1), expand→contract (Phases 1→4), group-scoping (Task 2 + Task 7 policies), rotate+clean (Task 8) — all covered.
- **Placeholders:** the SQL/RPC bodies are concrete; the Edge Function session-minting mechanism has two viable implementations noted (pick at build per Supabase version) — that's a real impl choice, not a placeholder; admin codes are a runtime secret by design (must not be in the plan/repo).
- **Consistency:** RPC names/signatures match between Task 3 (definition) and Task 6 (client calls); JWT claim path `app_metadata->>'role'/'group'` consistent across Tasks 4/5/7.
