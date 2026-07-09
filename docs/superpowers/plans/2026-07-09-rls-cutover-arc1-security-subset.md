# RLS Cutover — Arc 1 (Security-Critical Subset) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use `- [ ]`.

**Goal:** Close the two real security holes without the app-wide rewrite — (1) lock overwriting a *finalized* score to organizer/owner (the anon-rewrite hole, W-F03), keeping first-submit open; (2) additive server-role-gated admin so Mike's real account grants admin. Plus two free hardening wins (revoke anon grants on `profiles`; lock the role-helper functions from anon). **nlvb2025 stays fully working** (Mike: keep the code for others). No blanket-policy drop, no new admin RPCs, no auth-grant revoke — that is **Arc 2**.

**Architecture:** Two slices. **Slice 0** (app, additive): after `deriveRole()`, if role ∈ {owner, organizer} set `state.isAdmin`/`masterAdminAuthenticated` — purely additive to the untouched `adminLoginWithCode` path. **Slice 1** (migration `0039`): rewrite the 3 scoring RPCs off their LIVE definitions adding an overwrite-of-final guard; revoke anon grants on `profiles`; revoke anon EXECUTE on `is_organizer`/`is_owner`/`caller_claims_team`/`handle_new_user` (KEEP `caller_role` for authenticated — the landmine).

**Grounding:** `docs/superpowers/specs/2026-07-09-rls-cutover-recon-map.md` (the reconciled ground-truth map). Read it first. Mike's 4 gating decisions (2026-07-09): scoring = open-submit/organizer-overwrite; scope = subset first; co-admins = just Mike but nlvb2025 still works for others; repo-private + rotate = Arc 2 (with retire).

**Tech Stack:** Supabase Postgres (RLS/RPC via Supabase MCP — `apply_migration`, `execute_sql` for tests), vanilla-JS app, vitest, Vercel.

## Global Constraints

- **Never break anon-read** (the spectator app). After the migration, verify anon still reads tournaments/matches/teams/standings/roster-names.
- **Never lock the owner out.** nlvb2025 code path stays fully working this entire arc.
- **Every function rewrite is OFF THE LIVE DEFINITION** (`select pg_get_functiondef('public.<fn>'::regprocedure)`) — preserve `_audit_actor`, version-CAS, forfeit/completion logic; add ONLY the guard. Never hand-write a function body from memory.
- **Migration applied to prod only after** its guard is proven on throwaway fixtures via faked JWTs (`set local request.jwt.claims`), AND the prior definitions are saved for rollback in the migration file's header comment.
- APP_VERSION bump on the app slice (`public/app.js` ~line 27); `node --check public/app.js`; `npx vitest run` green (199 baseline); commit + push per slice. No emoji/neon (no UI change here anyway). Migration files live in `db/migrations/`.
- Line anchors verified 2026-07-09 at HEAD (post-`289ebf9`); re-grep before editing.

---

### Task 1: Additive server-role-gated admin (Slice 0)

**Files:**
- Modify: `public/app.js` — the `deriveRole()` completion inside the `isNewSignIn` gate (~9955, right after `await deriveRole();` / the retry loop).

**Interfaces:**
- Consumes: `state.role` (set by `deriveRole()` ~7483, values `owner|organizer|player|null`), `state.isAdmin`, `state.masterAdminAuthenticated`.
- Produces: admin surface shown when signed in as owner/organizer, additively (code path untouched).

- [ ] **Step 1: Read the gate.** Confirm the block: `onAuthStateChange` → `setTimeout(0)` heavy block → `isNewSignIn` gate → retry loop calling `await deriveRole()` (~9950-9958). The role is assigned once at the end of the loop.

- [ ] **Step 2: Add the additive gate** immediately AFTER the retry loop resolves `state.role` (after line ~9958, before/around `tdbRefreshTournaments`):

```js
// Auth Task 4 (2026-07-09): a signed-in owner/organizer gets the admin surface from their SERVER role
// (caller_role), additively — the nlvb2025 code-login path (adminLoginWithCode ~9856) is untouched and
// still works for others. A plain 'player' or null role never sets isAdmin here. Cleared on sign-out
// (the SIGNED_OUT branch already resets isAdmin/masterAdminAuthenticated).
if (state.role === 'owner' || state.role === 'organizer') {
  state.isAdmin = true;
  state.masterAdminAuthenticated = (state.role === 'owner');
}
```

- [ ] **Step 3: `node --check public/app.js`** → clean. **`npx vitest run`** → 199 passed (no test touches this path; baseline holds).

- [ ] **Step 4: Browser verify (localhost + prod after deploy), desktop 390 + ≥1280:**
  - Signed OUT → spectator (no admin surface). 
  - Sign in as Mike's owner account → admin surface renders (bottom nav / dashboard show admin), `state.role==='owner'`, `state.isAdmin===true`; persists across reload.
  - The nlvb2025 code login STILL works (enter the code → admin) — unchanged.
  - A plain player account (throwaway) → NOT admin.
  - 0 console errors.

- [ ] **Step 5: Bump APP_VERSION → `'2026.07.09.7'`, commit + push.**

```bash
git add public/app.js
git commit -m "feat: server-role-gated admin (owner/organizer) additive to the code login (auth Task 4) - v2026.07.09.7"
```

---

### Task 2: Migration 0039 — scoring overwrite guard + grant/helper hardening (Slice 1)

**Files:**
- Create: `db/migrations/0039_scoring_overwrite_guard_and_grant_hardening.sql`
- Apply via Supabase MCP `apply_migration` (project `mlzblkzflgylnjorgjcp`).

**Interfaces:**
- Rewrites `submit_match_score`, `set_live_score`, `edit_match_score` (SECURITY DEFINER) preserving all existing behavior + adding the overwrite guard.
- Revokes anon grants on `profiles`; revokes anon EXECUTE on 4 helpers (keeps `caller_role` for authenticated).

- [ ] **Step 1: Fetch the LIVE definitions** (do NOT guess bodies):
```sql
select pg_get_functiondef('public.submit_match_score'::regprocedure);
select pg_get_functiondef('public.set_live_score'::regprocedure);
select pg_get_functiondef('public.edit_match_score'::regprocedure);
```
Also capture each function's exact signature (arg names/types) and the current `matches` status vocabulary (`select distinct status from matches;` → expect `scheduled|live|final`) and confirm `matches.community_id` is present + populated (`select count(*) from matches where community_id is null;` → expect 0).

- [ ] **Step 2: Confirm the helper signature** used in the guard:
```sql
select proname, pg_get_function_identity_arguments(oid) from pg_proc
 where proname in ('is_organizer','is_owner') and pronamespace='public'::regnamespace;
```
Expect `is_organizer(uuid)` / `is_owner(uuid)` taking `community_id`. The guard uses the match's `community_id`.

- [ ] **Step 3: Write the migration.** For EACH scoring fn, paste its live body and insert the guard right after the match row (with its `status` + `community_id`) is loaded. The guard pattern (adapt variable names to each live body):

```sql
-- OVERWRITE GUARD: first submission of a not-yet-final match stays OPEN (anon self-report);
-- overwriting/editing an ALREADY-FINAL result requires organizer/owner. Closes W-F03.
if v_match.status = 'final' and not (public.is_organizer(v_match.community_id) or public.is_owner(v_match.community_id)) then
  raise exception 'Only an organizer can change a finalized score' using errcode = '42501';
end if;
```

- `submit_match_score`: insert the guard after loading the match, BEFORE it writes the final result. (First finalization: `status` is `scheduled|live` → guard passes → open. Re-finalizing a `final`: guard requires organizer.)
- `set_live_score`: same guard — setting a live score on an already-`final` match is an overwrite → organizer only; live-scoring a non-final match stays open.
- `edit_match_score`: this only ever targets finalized matches → require organizer/owner unconditionally:
```sql
if not (public.is_organizer(v_match.community_id) or public.is_owner(v_match.community_id)) then
  raise exception 'Only an organizer can edit a finalized score' using errcode = '42501';
end if;
```
Keep each `create or replace function` with the IDENTICAL signature, `security definer`, `set search_path` clause (copy from the live def), and the full original body otherwise. Then the grant/helper hardening:

```sql
-- profiles: revoke the wide-open anon grant (anon currently holds SELECT/INSERT/UPDATE incl. email).
-- authenticated keeps self-read/self-update via the existing profiles policies.
revoke all on public.profiles from anon;

-- helper hardening: these are policy/trigger-internal; anon never needs to call them directly.
-- KEEP caller_role executable by authenticated (the app calls it client-side to derive role — do NOT revoke that).
revoke execute on function public.is_organizer(uuid) from anon;
revoke execute on function public.is_owner(uuid) from anon;
revoke execute on function public.caller_claims_team(uuid) from anon;
revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.caller_role(uuid) from anon;  -- anon only; authenticated retains it
```

Put a **ROLLBACK block** in a header comment: the verbatim prior `create or replace` bodies (from Step 1) + the re-grant statements (`grant execute on function … to anon;`, `grant select, insert, update on public.profiles to anon;` — but only if a rollback is ever needed; the recon shows anon-profiles was never legitimately used).

- [ ] **Step 4: Prove the guard on THROWAWAY fixtures BEFORE prod apply** (run in a transaction that rolls back, via `execute_sql`): create a throwaway community + tournament + 2 teams + a match, and a throwaway organizer membership. Then, faking JWTs with `set local request.jwt.claims`:
  1. anon (no claims) submits a score to a `scheduled` fixture match → **succeeds** (open first-submit).
  2. anon attempts to overwrite that now-`final` fixture match via submit_match_score/set_live_score → **raises 42501**.
  3. anon calls edit_match_score on the final fixture → **raises 42501**.
  4. the organizer JWT overwrites/edits the final fixture → **succeeds**.
  Roll the whole fixture transaction back (leave prod data untouched). Record each PASS/FAIL.

- [ ] **Step 5: Apply to prod** via `apply_migration`. Then verify on prod (read-only, no data mutation):
  - `get_advisors(type=security)` — the 4-5 helper `Function Search Path`/exposure warnings for the revoked helpers clear or reduce; **no new errors**.
  - anon column check: `revoke all on profiles from anon` confirmed (`select has_table_privilege('anon','public.profiles','SELECT')` → false).
  - `has_function_privilege('anon','public.caller_role(uuid)','EXECUTE')` → false; `has_function_privilege('authenticated','public.caller_role(uuid)','EXECUTE')` → **true** (the landmine check).
  - Admin scoring still works: Mike (owner) can still edit a score (verified in Task 3's browser pass).

- [ ] **Step 6: Anon-read regression check on prod** (the spectator app must be intact): drive the live public app signed-out — Home board, Tournament hub, Standings, roster names all render; `players.skill` still absent for anon. 0 console errors.

- [ ] **Step 7: Save + commit** the migration file (the applied SQL, verbatim).

```bash
git add db/migrations/0039_scoring_overwrite_guard_and_grant_hardening.sql
git commit -m "feat(db): 0039 - lock overwrite of finalized scores to organizer/owner (W-F03) + revoke anon profiles grant + harden role helpers"
```

---

### Task 3: Adversarial break-in verify + prod browser + vault (controller)

- [ ] **Independent break-in fleet** (fresh-context agents, faked JWTs on prod-safe read + throwaway fixtures): attempt every unauthorized write path — anon overwrite of a finalized score (all 3 fns), anon read of `profiles.email`, anon EXECUTE of the hardened helpers — each MUST be denied. Confirm every LEGIT path still works: anon first-submit, anon spectator reads, kiosk check-in/register, team registration, Mike's admin scoring/edit, the nlvb2025 code login.
- [ ] **Prod browser §27/§41:** signed-out spectator + Mike's owner sign-in (admin surface) + code login, 390 + desktop, 0 console errors, ≥60s watch.
- [ ] **Vault:** log.md / current.md / NOW.md; 12-history task-#14/#15/#16; Me/log + decision-log; update the recon map's "Arc 2 remaining" note (blanket-policy retire + 18 RPCs + nlvb2025 retire + rotate + repo-private).

## Deviation rule

Any failing guard test, a helper-revoke that breaks role derivation, or an anon-read regression → STOP, roll back the migration (the header rollback block), report. Do not improvise around a failed verify on live prod.

## ⚠ Arc-2 residual confirmed live (independent adversarial verify, 2026-07-09)

An independent break-in agent (fresh context, faked-JWT throwaway fixtures, rolled back) returned **CONFIRMED-CLOSED** on W-F03/anon: anon cannot overwrite a finalized score via any of the 3 RPCs (all raise 42501), no other anon write-door to matches/live_state exists, profiles email + the 5 helpers are anon-blocked, `caller_role` stays authenticated, spectator reads intact. It surfaced ONE honest caveat, already the documented Arc-2 work, NOT a 0039 failure: **a signed-in `authenticated` user can still direct-`UPDATE matches`/`live_state` via PostgREST** because the blanket `c21/c22/live_state admin all` policies grant `authenticated` ALL with `USING true` and the table write-grants are still present. This needs a real account (outside the anon W-F03 scope) — closed by Arc-2's drop-blanket-policies + revoke-authenticated-grants (0041). Full verdict in 12-history task-#16.

## Arc 2 (documented, NOT this arc)

Full role-based RLS: create the ~18 organizer-guarded SECURITY DEFINER RPCs (§4B of the recon map), re-route every app admin write through them, convert the 2 INVOKER fns to DEFINER+guard, drop the `c21/c22/live_state admin all` blanket policies, revoke authenticated table-write grants, retire `adminLoginWithCode`/nlvb2025 + `approve_claim`/`reject_claim` + the `admin_login` edge fn, rotate nlvb2025, make the repo private, re-home the co-pilot admin gate. Gated on: co-admin accounts seeded first (Mike keeps nlvb2025 for others until then). Migrations 0040 (RLS+RPCs) / 0041 (retire).
