# Identity & Accounts — Design Spec

**Date:** 2026-07-08
**Status:** design (awaiting Mike's review → then writing-plans)
**Program:** foundation track for the platform remake. Prerequisite for the personal features in `2026-07-08-public-dashboard-remake-design.md`. Pairs with the Multi-sport SportPack spec.

---

## 1. Goal

Introduce real user accounts (Supabase Auth), a first-class community/org model, and role-based access — **replacing the hardcoded admin code (`nlvb2025`) and the client-trusted `isAdmin` flag**, which is Athletic Specimen's #1 security hole (public repo + plaintext code + open RLS). This unblocks every personal feature (My-Night hero, My Team, claim-your-team, "your record") and the trusted scoring model.

## 2. Scope

**In:** Supabase Auth (magic-link + Google), `profiles`, first-class `communities` (multi-tenant-*ready*), `memberships`/roles, the claim-a-player flow, the RLS rewrite, the scoring-permission policy, and the migration of existing data.

**Out:** the public dashboard UI (separate spec — *consumes* this); the multi-sport SportPack; the admin dashboard; AI Co-pilot; multi-community onboarding/billing (future — the model is *ready* for it, we don't build it now).

## 3. Decisions locked (with Mike, 2026-07-08)

- **Tenancy = "single now, built to expand":** a community/org is a first-class entity from day one; all data scoped by `community_id`; **only Mike's community exists at first.** No platform-onboarding features yet.
- **Claim verification = self-claim + organizer approval:** a person signs in, taps their own name in the roster, and an organizer approves the link. On claim, their account **email attaches to their profile, private** (visible only to themselves + organizers/owner — like skill).
- **Scoring = claimed players + organizers:** in a tournament, a match score is writable by a claimed player on either team, or an organizer/owner. **Casual (non-tournament) walk-up court scoring stays open** (anon). This closes the anon-score-overwrite hole (W-F03) while keeping the one-tap feel.

## 4. Data model

- **`communities`** — `id, name, created_at, …`. First-class org. One seeded (Mike's). Everything scoped by `community_id`.
- **`profiles`** — `id (= auth.users.id), display_name, email (PRIVATE), created_at`. One per Supabase Auth user.
- **`players`** — the existing roster (**212 rows, otherwise unchanged**) + `claimed_by_profile uuid null → profiles.id` + `community_id`.
- **`memberships`** — `(profile_id, community_id, role)` where role ∈ **owner / organizer / player**, + `status`. Roles are **per-community**. Mike = owner; owner promotes organizers.
- **Scoped tables** (`tournaments`, `teams`, `team_members`, `sessions`, `matches`, `pools`, `attendance_sessions`, `check_ins`, `live_state`, …) gain `community_id`.

## 5. Auth

Supabase Auth — **email magic-link + Google OAuth**. Passwordless by default (no password support to maintain). `onAuthStateChange` drives sign-in/out; a signed-out user is a spectator.

## 6. Claim-a-player flow

1. Sign in (magic-link/Google) → `profiles` row created (email stored, private).
2. **Claim:** the user picks their own name from the community roster.
3. **Approve:** an organizer confirms the claim (pending → approved) → `players.claimed_by_profile = profile.id`.
4. Private fields (`profiles.email`, `players.skill`) remain organizer/owner-visible only (self can see own email).
- **Unclaimed players persist** (walk-up kiosk). A signed-in profile with no claim is spectator-only until it claims.

## 7. Roles & access (RLS rewrite)

Replaces client-side `isAdmin`/`MASTER_ADMIN_CODE` with server-enforced, role-based policies (RLS + `SECURITY DEFINER` RPCs that check the caller's membership role). No client trust.

| Actor | Can |
|---|---|
| **Anon** | SELECT public columns of public data (tournaments, matches, teams, standings, brackets, roster **names**) — **never `skill`/`email`**; kiosk check-in RPC; **casual** (non-tournament) open scoring RPC. |
| **Player** (auth, member) | Manage own profile; initiate a claim; register/claim a team; **score tournament games of a team they're claimed on**. |
| **Organizer** | Full manage of *their* community: tournaments, players, sessions, all scores, approve claims. |
| **Owner** (Mike) | Everything in the community **+ manage memberships** (promote organizers). |

- **Private fields:** `players.skill`, `profiles.email` — organizer + owner only (+ self for own email). Never anon/public.
- **Scoring policy:** tournament `submit_match_score` / `set_live_score` / `edit_match_score` require a claimed player on a participating team **or** organizer/owner (was fully anon → closes W-F03). Casual court scoring keeps an anon RPC for walk-up nights.

## 8. Migration / bootstrapping

- Seed one `communities` row (name TBD with Mike); backfill `community_id` on all existing players / tournaments / sessions / teams / matches.
- Mike creates his account → **owner** membership.
- Retire `MASTER_ADMIN_CODE` (`nlvb2025`) + tenant `limitedGroup` codes; document turning current admins into **organizer** memberships.
- Remove client-side `isAdmin` / master-code gating; admin UI gates on the server-returned role.
- **Tie-in with W-F01:** as part of this, rotate/remove the leaked code and consider making the repo private — **Mike's real-world call** (routed, not assumed).

## 9. Build sequencing (big track — slice it)

1. Supabase Auth + `profiles` + magic-link/Google sign-in (spectator ↔ signed-in).
2. `communities` + `memberships` + seed migration (single community).
3. Claim-a-player flow + organizer approval.
4. RLS rewrite + scoring policy + retire the codes/`isAdmin`.
5. Wire the public dashboard's personal features on top.

## 10. Success criteria

- No hardcoded admin code anywhere; `isAdmin` is not client-trusted.
- Anon **cannot** overwrite finalized/tournament scores; private fields (`skill`, `email`) never reach anon/public.
- Claim flow works end-to-end (sign in → claim → approve → personal data attaches).
- All existing data intact and readable under the new community scope.
- Verified against the DB (Supabase MCP) + the connected browser, desktop + mobile.

## 11. Open / deferred

- Community display name.
- Whether casual scoring later also tightens (start open).
- Multi-community onboarding, per-community branding, billing — future (model is ready).
- Notifications, follow — later tracks.
