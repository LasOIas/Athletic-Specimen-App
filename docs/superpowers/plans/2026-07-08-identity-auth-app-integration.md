# Identity & Accounts — Auth + App Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

> **AUTH METHOD DECISION (2026-07-08, Mike):** **email + password**, NOT magic-link. Mike: *"i dont want a magic link, that takes too long."* Google OAuth also deferred (needs his creds). Tasks 1–2 below are rewritten for email+password; Task 2 (the sign-in UI) is **BUILT + verified** on branch `feat/identity-auth` (v2026.07.08.5) — full-screen sign-in **page** (Mike picked Option B "clean centered" from 3 rendered §38 layouts).

**Goal:** Wire real user accounts into the app on top of the already-applied DB foundation — Supabase Auth **email+password** sign-in, membership-**role**-gated admin (retiring `nlvb2025` + client `isAdmin`), the claim-a-player flow, and the RLS + scoring-RPC cutover — tested against real sign-ins, without breaking the live spectator app or locking the owner out.

**Architecture:** The auth plumbing already exists — `adminLoginWithCode()` exchanges the code for a Supabase session via `supabaseClient.auth.setSession()` (app.js:9196-9201), and `onAuthStateChange` (9280) already derives admin state from the session. This track *replaces* the code path with passwordless sign-in and derives the admin role from `memberships` (via the `caller_role` RPC built in the DB foundation) instead of a JWT group claim. The risky RLS/RPC cutover (DB-foundation Tasks 8-10, deferred to here) lands alongside the sign-in wiring so each role path is tested with a real authenticated user. Old `c21` RLS policies stay until the very end, so the app keeps working throughout.

**Tech Stack:** Supabase Auth (email + password), `supabase-js` (already loaded), vanilla-JS app. Postgres RLS/RPC (helpers already built: `caller_role`/`is_organizer`/`is_owner`/`caller_claims_team`, and `player_claims`).

## Scope

**In:** enable Auth providers; sign-in/out UI (the account icon → magic-link + Google); `onAuthStateChange` → server role; owner bootstrap; role-gated admin; the RLS rewrite (`0038`), scoring-RPC rewrite (`0039`), retire-code (`0040`); claim-a-player UI + organizer approvals; helper-function hardening.

**Out (follow-on — Slice 3 personal features):** the public dashboard's My-Night hero, My Team screen, and "You" highlights (already specced in `2026-07-08-public-dashboard-remake-design.md`) — they consume this track's `claimed_by_profile` but are their own UI slice.

**Prerequisite (DONE):** the additive DB foundation — migrations `0032`-`0037` applied to prod 2026-07-08 (communities, profiles+trigger, memberships+role enum, `community_id` scoping+backfill, `claimed_by_profile`+`player_claims`, role helpers). See `2026-07-08-identity-accounts-supabase-foundation.md`.

## Global Constraints

- **Never break anon-read / the spectator app** (v2026.07.08.1). Verify anon reads after every RLS change.
- **Never lock the owner out.** Seed Mike's owner membership + confirm role-gated admin works BEFORE dropping the old code path (`0040`). Keep `nlvb2025` valid until the new path is proven on prod.
- **`render()` vs `partialRender()`** discipline; **§51 no neon; §11 no emoji; §27 plain English + true data; §41 desktop + mobile same change.** No "night" copy.
- **Private fields** (`players.skill`, `profiles.email`) never reach anon/public.
- **Bump `APP_VERSION`** on every app change; `node --check`; commit + push.
- **Every RLS/RPC migration** applied additively (new alongside old), verified against a real signed-in user, before the old is dropped.

---

## Task 1: Enable Supabase email+password auth (Mike's dashboard action)

**Interfaces:** Produces working email+password sign-in/sign-up at the project level. Consumed by Task 2/3.

- [ ] **Step 1: Email provider is on** (default). Confirm password sign-ins/sign-ups are enabled.
- [ ] **Step 2 (Mike, REQUIRED before owner sign-up): turn OFF "Confirm email"** — Supabase Dashboard → **Authentication → Sign In / Providers → Email → "Confirm email" = OFF**. Without this, sign-up sends a confirmation link (the exact round-trip Mike rejected); with it off, `signUp` returns a session immediately → instant. (Could not be flipped via MCP — no auth-config tool; it is a 2-tap dashboard step.)
- [ ] **Step 3: Enable leaked-password protection + note MFA** (advisors flagged these) — low-effort while in Auth settings.
- [ ] **Step 4: Verify** an email+password sign-up on prod returns a session immediately (no confirmation email) and the `profiles` row auto-creates via the `handle_new_user` trigger.

> **OPEN (route to Mike):** flip "Confirm email" OFF (above). Google one-tap remains a later add (needs his OAuth creds).

---

## Task 2: Sign-in / sign-out UI + `onAuthStateChange` → role — ✅ BUILT + VERIFIED (v2026.07.08.5)

**Files:** `public/app.js` (config, header `#pd-account`, new auth-page/account-menu/role helpers, `onAuthStateChange`), `public/styles.css` (`.auth-page` + `.am-*` + signed-in chip).

**Interfaces:** A full-screen email+password sign-in **page** opened from the account icon, and `state.account` / `state.role` derived from the session via `caller_role`. Consumed by Tasks 4/7.

**What shipped:**
- [x] **Config:** `persistSession: true` (real sign-ins survive reload — Mike: "save them logged in"). The legacy `nlvb2025` code-login stays **ephemeral** — a restored `*.local` code session is signed out on load in `onAuthStateChange` (`INITIAL_SESSION`), preserving the old C21 "no left-behind admin on a shared device" property. `detectSessionInUrl:true` is a harmless no-op for password auth (kept for a future Google option). *(This resolves the earlier ⚠ finding: rather than accept the transition-window tradeoff, the code path stays ephemeral and only real accounts persist.)*
- [x] **Sign-in page (Option B, clean-centered)** — full-screen `.auth-page` appended to `<body>` (survives partialRender): logo + wordmark + "Welcome" + email + password + Sign in + a Sign in/Create-account toggle. `signInWithPassword` / `signUp`, plain-English error mapping. `#pd-account`: signed-out → sign-in page; signed-in → account menu (email + role + **instant/optimistic** Sign out).
- [x] **Role on auth change:** `onAuthStateChange` → `caller_role(community_id)` → `state.role` (`owner|organizer|player|null`), deferred out of the callback via `setTimeout(0)` (supabase-js holds an auth lock during the callback — an inline rpc raced to null) with a bounded retry for JWT propagation. Role assigned once at the end (no "Spectator" blip on re-derive). No admin-gating change this slice.
- [x] **Verified** (localhost, v2026.07.08.5, desktop 1920 + mobile 390, 0 console errors): page renders both sizes; toggle; sign-up error path; **sign-in success → session + role=`player` derived + page closes + header shows the account initial**; **persists across reload**; account menu shows email+role; **optimistic sign-out is instant** + reverts to spectator; DB cross-checked (throwaway account created+verified+deleted, baseline 233 players / 1 community / 2 `.local` accounts intact). *(Env note: browser→Supabase in the sandbox was intermittently slow — a `signOut` once took ~78s to resolve behind the auth lock; the optimistic UI clear makes sign-out feel instant regardless. Mike's real device on prod is the final confirm.)*
- [ ] **Owner sign-up = Task 3** (needs Task 1 Step 2 done first).

---

## Task 3: Owner bootstrap (Mike's first real sign-in)

**Interfaces:** Seeds Mike's `owner` membership from his real (not `.local`) account, once.

- [ ] **Step 1: Mike creates his account** in the app (email+password, `olasmikey@gmail.com`, via the new sign-in page → "Create an account") → `profiles` row auto-created by the trigger. Capture his real `auth.uid()`. (Requires Task 1 Step 2 = "Confirm email" OFF, so it's instant.)
- [ ] **Step 2: Seed owner** (one-time, via Supabase MCP):
```sql
insert into public.memberships (profile_id, community_id, role, status)
select '<MIKE_REAL_UID>', c.id, 'owner', 'active' from public.communities c where c.slug='athletic-specimen'
on conflict (profile_id, community_id) do update set role='owner', status='active';
```
- [ ] **Step 3: Verify** `caller_role` returns `owner` for Mike's session (sign in → the app reads role owner). No app commit (data step).

---

## Task 4: Role-gated admin (replace `nlvb2025`/`isAdmin`)

**Files:** Modify `public/app.js` — the admin-state derivation (`state.isAdmin`/`masterAdminAuthenticated`/`limitedGroup`, ~6026) and gates.

**Interfaces:** Admin UI is shown iff `state.role in (owner, organizer)` (server-derived), not the code. The code path stays as a fallback until Task 8.

- [ ] **Step 1: Gate on role.** `state.isAdmin = state.role === 'owner' || state.role === 'organizer'`. Keep the code-login path working in parallel (don't delete `adminLoginWithCode` yet) so nothing breaks mid-migration.
- [ ] **Step 2: Map the old `limitedGroup`/`masterAdminAuthenticated`** to roles (owner = full; organizer = full-manage; the tenant-group lock becomes an organizer scoped to a community — single community now, so effectively full).
- [ ] **Step 3: Browser verify** — a signed-in owner sees the admin surface; a signed-out/spectator does not; the code-login still works as fallback. Desktop + mobile, 0 errors.
- [ ] **Step 4: Bump `APP_VERSION`, commit + push.**

---

## Task 5: RLS rewrite (migration `0038`) — role-based, harden helpers

**Files:** Create `db/migrations/0038_rls_rewrite.sql`. Apply additively (new policies ALONGSIDE the old `c21`/`c22` ones).

- [ ] **Step 1: Write the migration** — per scoped table, add an organizer/owner write policy via `is_organizer(community_id)`; keep anon SELECT on public columns; lock private fields:
```sql
create policy "matches organizer write" on public.matches for all to authenticated
  using (public.is_organizer(community_id)) with check (public.is_organizer(community_id));
-- players skill privacy: restrict anon to non-skill columns
revoke select on public.players from anon;
grant select (id, name, checked_in, tag, "group", community_id, claimed_by_profile, created_at, updated_at) on public.players to anon;
-- harden helper RPCs (advisors 0028/0029): keep usable in policies, not as public endpoints
revoke execute on function public.caller_role(uuid), public.is_organizer(uuid), public.is_owner(uuid), public.caller_claims_team(uuid), public.handle_new_user() from anon, authenticated, public;
```
- [ ] **Step 2: Apply to prod.** **Verify anon still reads** (drive the Slice-1 app) — tournaments/teams/matches/standings/roster-names all render; **anon CANNOT read `players.skill`** (query as anon → skill absent/denied). Verify a signed-in owner/organizer can write; a plain player cannot (except scoring, Task 6).
- [ ] **Step 3: Re-run `get_advisors` (security)** — the 5 helper warnings clear; no new errors.
- [ ] **Step 4: Save + commit** `db/migrations/0038_rls_rewrite.sql`.

> Revoking helper EXECUTE does NOT break policies: RLS policy evaluation calls the function in the table-owner context, independent of the caller's EXECUTE grant. Verify in Step 2 regardless.

---

## Task 6: Scoring-RPC rewrite (migration `0039`) + claim RPCs

**Files:** Create `db/migrations/0039_rpc_scoring_policy.sql`.

- [ ] **Step 1: Rebuild each scoring RPC OFF ITS LIVE DEFINITION** (preserve `_audit_actor`, version-CAS, forfeit, etc.), adding the auth guard:
```sql
-- in submit_match_score / set_live_score / edit_match_score, after loading the match's teams+community:
if not (public.is_organizer(v_community) or public.caller_claims_team(v_team_a) or public.caller_claims_team(v_team_b)) then
  raise exception 'not authorized to score this match';
end if;
```
Casual (non-tournament) court scoring keeps its separate anon path.
- [ ] **Step 2: Add `claim_player(p_player)` + `approve_claim(p_claim)`** (per the DB-foundation plan Task 9 SQL: pending claim → organizer approval sets `players.claimed_by_profile`). Also `register_team` rewrite: on registration, match/create a player row per roster name + insert `team_members(team_id, player_id, community_id)` — the FK link scoring depends on; one-time backfill `team_members` for the existing 18 teams from their jsonb rosters.
- [ ] **Step 3: Apply to prod + verify the full flow** against real sign-ins: claim → approve → the claimed player scores their team's match; a stranger is rejected; anon casual scoring still works; existing admin scoring (owner/organizer) unaffected.
- [ ] **Step 4: Save + commit** `db/migrations/0039_rpc_scoring_policy.sql`.

---

## Task 7: Claim-a-player UI + organizer approvals

**Files:** Modify `public/app.js` — the Home gateway claim button (`#pd-claim`, currently inert) + a roster-pick claim sheet + an organizer approvals panel.

- [ ] **Step 1: Claim sheet.** `#pd-claim` (signed-in) → pick your name from the community roster → `claim_player(player_id)` → "pending organizer approval". Signed-out → open the auth sheet first (Task 2).
- [ ] **Step 2: Approvals panel** (organizer/owner) — list pending `player_claims` → Approve (`approve_claim`) / Reject. Surfaced in the admin/Manage area.
- [ ] **Step 3: Browser verify** end-to-end (sign in → claim → approve as owner → `claimed_by_profile` set → personal data unlocks). Desktop + mobile, 0 errors.
- [ ] **Step 4: Bump `APP_VERSION`, commit + push.**

---

## Task 8: Retire the code (migration `0040`) — gated, LAST

**Files:** Create `db/migrations/0040_retire_legacy.sql` + remove the code-login from `app.js`.

- [ ] **Step 1: Pre-flight guard (prod):** owner membership confirmed, role-gated admin proven, scoring works for claimed players. If not, STOP.
- [ ] **Step 2: Drop the old blanket policies** — `drop policy "c21 admin all"/"c22 admin all"/"live_state admin all" on <each table>;` (role-based policies from Task 5 remain; anon-read remains).
- [ ] **Step 3: Remove the code path** — delete `adminLoginWithCode`/the `nlvb2025` UI; admin gates only on server role. `node --check`.
- [ ] **Step 4: Rotate/disable `nlvb2025`** + the 2 `.local` accounts + decide repo-private (**W-F01; Mike's real-world call — route**).
- [ ] **Step 5: Full verification** (anon spectator + owner + organizer + claimed player + rejected stranger), `get_advisors` clean, existing data intact. Bump `APP_VERSION`, commit + push. Vault write-back.

---

## Self-Review

**Spec coverage** (`identity-accounts-design.md`): Auth magic-link/Google (T1-2); profiles via trigger (done, DB foundation); onAuthStateChange→role (T2); owner bootstrap (T3); role-gated admin retiring isAdmin (T4); RLS rewrite + private fields (T5); scoring policy closing W-F03 + claim/approve + team link (T6); claim UI + approvals (T7); retire code + W-F01 (T8). Personal features = out (Slice 3, noted).

**Safety invariants:** anon-read verified after every RLS step (T5/T8); owner never locked out (seeded T3, gated-admin proven T4 before drop T8, pre-flight guard T8); old code path kept until T8; each role path tested with a real sign-in; helper hardening verified not to break policies (T5).

**Open decisions (routed to Mike):** Google OAuth creds vs email-only v1 (T1); `nlvb2025` rotation + repo-private (T8).

---

## Execution Handoff

**This touches auth config, the live prod DB (RLS/RPC), and the admin login path.** Needs Mike's approval + the T1/T8 decisions. Nothing destructive (drop old policies / remove code) until Task 8's pre-flight guard passes on prod.

Two options: **(1) Subagent-Driven (recommended)** — per-task, verify between; **(2) Inline** with checkpoints. (This track pairs naturally with a checkpoint before Task 5 (RLS) and Task 8 (retire code) — the two risky steps.)
