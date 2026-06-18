# C21 — P0 Security Spine — Design Spec

**Date:** 2026-06-18
**Status:** Design approved by Mike (4-piece design). Next: writing-plans → phased build.
**Batch:** C21 (the foundation of the redesign). Prompt: `01-state/task-prompts/C21-p0-security-spine.md`. Builds on C20 (client guards shipped v2026.06.18.5).

## Problem
Today the app has **no server-side security**: every RLS policy is `USING(true)`, so the shipped anon key can read/edit/**DELETE** every row from a browser console (this is how prod `checked_in` went 44→0 with no trace). "Admin" is `MASTER_ADMIN_CODE='nlvb2025'` hardcoded in `public/app.js` + a flippable `state.isAdmin` browser flag. Goal: make admin a real server-verified identity and lock the database so the **server** decides who can do what — while players stay anonymous and the admin login stays as quick as it is today.

## Hard constraints (from Mike)
- **Admin login must stay quick** — type a code, instant, no emails, no passwords, no reset flows. (Mike: "No that's too complicated, it needs to be quick.")
- **Players stay anonymous** (no accounts) — check-in / register / submit-score stay frictionless.
- **No downtime** — the live app must keep working at every migration step.
- Players never see skill; no neon; no emojis; mobile-first; bump APP_VERSION; clean commits.

## Design (4 pieces, approved)

### 1. Auth — "quick code, but server-verified"
- **UX unchanged:** admin types a code on the same login screen → in. No email/password.
- **Mechanism:** a Supabase **Edge Function `admin_login(code)`**. The client sends ONLY the typed code. The function verifies it server-side against a hashed code→identity map, and on match returns a real Supabase **session** (JWT) for a pre-provisioned admin user. The code never lives in the client bundle anymore.
- **Identities (pre-provisioned Supabase Auth users, one per role/group):** `owner` (master = all groups) + one per group (`KC Volleyball`, `Athletic Specimen`, future `Kansas`). Each carries `app_metadata` = `{ role: 'owner' | 'group_admin', group: '<name>' }`.
- **RLS reads identity from the JWT:** `auth.jwt() -> 'app_metadata' ->> 'role'` and `->> 'group'`. `state.isAdmin` is derived from the verified session, never stored as a flag.
- **Rotating a code** = update the server-side hashed map (no client change). Codes are per-group → a leaked/abused code is scoped + rotatable.

### 2. Database lockdown (RLS)
- `ALTER TABLE … ENABLE ROW LEVEL SECURITY; … FORCE ROW LEVEL SECURITY;` on all 7 tables; drop every `USING(true)`/`WITH CHECK(true)` write policy.
- **Anon (the public app) = SELECT-only** on what the public view needs (players read for check-in/disambiguation, sessions, tournaments/pools/teams/matches for live scores + bracket). The only anon **writes** are the 3 RPCs below.
- **Authenticated admin writes** gated by JWT: owner → all rows; group_admin → only rows in their `group` (players/sessions/tournaments scoped by group; tournament tables scoped via their tournament's owning group — note: tournaments currently have no group column, so add one).
- Keep the existing tournament logic; review `generate_bracket_atomic` (confirmed NOT currently `SECURITY DEFINER`) — under locked RLS, admin-authored bracket generation runs as the admin (fine); the anon self-serve path is `submit_match_score` only.

### 3. The 3 narrow anon write doors (RPCs, `SECURITY DEFINER`, validate + minimal)
- **`register_player(name, group)`** — insert a player; dedup-aware (pairs with C22's case-insensitive unique index); returns the row. Replaces direct anon INSERT (incl. `checkin.html`).
- **`check_in(player_id)`** (and/or by normalized name) — set `checked_in=true` for one player; validated. Replaces direct anon UPDATE of `checked_in`.
- **`submit_match_score(match_id, score_a, score_b, version)`** — the self-serve scoring path: validates scores (whole, ≥0, the existing `validateScores`/`decideWinner` rules) + CAS on `version` + sets result; SECURITY DEFINER so it can write under locked RLS. Replaces direct anon match UPDATE.
- Each RPC does the minimum + validates; nothing else is anon-writable.

### 4. Audit trail (the "black box")
- Add `created_at` + `updated_at` (timestamptz, default now()) to `players` (currently has neither) — via trigger for `updated_at`.
- Add an **`action_log`** table: `id, at, actor (jwt sub or 'anon'), role, group, action, entity_type, entity_id, detail, undo jsonb`. The RPCs + admin write paths log to it. Powers forensics ("who wiped check-ins?") + server-side undo. Anon can INSERT to it only via the RPCs (not directly).

## Safe migration — expand → contract (no downtime)
1. **Expand (additive, nothing breaks):** create the auth users + `app_metadata`; the `admin_login` Edge Function + hashed code map; the 3 RPCs; `tournaments.group` column; `action_log` + timestamps/trigger. RLS stays open. Deploy. The live app is unaffected.
2. **Switch the client (RLS still open = safety net):** update `app.js` + `checkin.html` to (a) admin-login via `admin_login` (keep the old client code-compare as a TEMPORARY fallback), (b) route the 3 anon writes through the RPCs, (c) derive `isAdmin` from the session. Reads unchanged. Deploy + **verify on prod** that the new login + RPC writes work — while open RLS still backstops anything missed.
3. **Contract (the lock):** drop the open write policies → anon SELECT-only + RPC/admin writes + FORCE RLS. **Do this at a quiet time (not during a Sunday session).** Verify the live app still fully works (reads + the 3 RPC writes + admin actions) and that a direct anon console write now FAILS.
4. **Rotate + clean:** rotate the admin code (now a real credential, server-side), remove the hardcoded `MASTER_ADMIN_CODE` + tenant map + the temporary fallback from the JS.

**Rollback:** each phase is reversible; the only risky step is (3) — rollback = re-open the write policies (instant) if the updated client breaks. That's why (2) is verified on prod under open RLS before (3) flips.

## Components / boundaries
- `admin_login` Edge Function (Deno) — code→session, isolated + testable.
- 3 RPC functions (SQL/plpgsql, SECURITY DEFINER) — each one job, validated.
- RLS policies per table — declarative, per-role.
- Client auth module — wraps Supabase Auth session (login, restore, derive isAdmin, group claim).
- Migration as ordered, **idempotent** SQL migrations applied + verified via Supabase MCP before the dependent client ships.

## Testing / verification (per phase)
- Phase 1: RPCs callable as anon (succeed) while RLS open; auth users exist; `admin_login(code)` returns a session.
- Phase 2 (prod, RLS open): admin logs in via code→session; check-in/register/score-submit go through RPCs + succeed; reads unchanged; 0 console errors; desktop + mobile.
- Phase 3 (prod, locked): the 3 RPC writes still succeed as anon; admin writes succeed; a raw anon `update players set checked_in=false` from the console now **fails**; the app is fully functional; the 44→0 hole is closed.
- Phase 4: old code rejected, new code works; no `nlvb2025` (or any code) left in the bundle.

## Out of scope
- Player accounts (none — players stay anonymous).
- Multi-org / white-label (C34); full per-session attendance (C22); the dedup unique index itself (C22, but `register_player` is written to cooperate with it).
- A full git-history purge of the old leaked code (rotation neutralizes it).

## Open question for the build plan
- The final lockdown flip (Phase 3) timing — pick a low/no-traffic window with Mike. Everything else proceeds without a window.
