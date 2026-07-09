## Pre-flight
- **Goal:** Reconcile the five inventories into one cutover map for migrations 0039/0040/0041 + the app role-gate, grounded against live DB `mlzblkzflgylnjorgjcp`.
- **Am I guessing?:** No — verified anon/auth column grants, RPC EXECUTE roles, match phases, and all live policies this turn.
- **Straight take:** The inventories are ~95% consistent, but there is one systematic contradiction (APP WRITES labels every SECURITY DEFINER RPC "Survives — Unchanged," while RPCS correctly flags several as NEEDS-REWRITE-0040) and one grant-scope discrepancy on `profiles`. Also, the real ordering is subtler than "0039→0040→0041": the app must be re-routed to new admin RPCs *before* the blanket policies drop, or admin writes break.
- **Phase:** P3 recon, read-only. No writes performed.

---

# ATHLETIC SPECIMEN RLS CUTOVER — RECONCILED MAP

## 0. Ground truth verified this turn (live DB)

| Check | Result | Confirms |
|---|---|---|
| `players` anon columns | SELECT on `id, name, tag, group, checked_in` only — **no `skill`** | POLICIES inventory ✓ |
| `profiles` anon columns | anon holds SELECT/INSERT/UPDATE/REFERENCES on `id, display_name, email, created_at` | **Discrepancy — see C2** |
| `submit_match_score`, `set_live_score`, `edit_match_score` EXECUTE | `anon, authenticated, postgres, service_role` — **anon can score, zero guard** | The W-F03 hole ✓ |
| `caller_role/is_organizer/is_owner/caller_claims_team` EXECUTE | all include `anon` + `authenticated` | Helper-hardening scope ✓ |
| `apply_net_count_change`, `generate_bracket_atomic` | `prosecdef=false` (SECURITY INVOKER) | These break at lock ✓ |
| `approve_claim`, `reject_claim` | live, SECURITY DEFINER, EXECUTE=authenticated | 0041 retire targets ✓ |
| `matches.phase` | `pool=36, main=35`, **0 null-phase (71 total)** | No casual path — all matches are tournament ✓ |
| Live policies | Every c21/c22 table carries `admin all` (ALL/authenticated/`true`/`true`) + `anon read` (SELECT/`true`); `live_state admin all` present; `action_log` RLS-on/zero-policy | POLICIES inventory ✓ |

---

## 1. Anon column grants — the required end state

**`players` — names YES, skill NO:**
- KEEP anon SELECT on `id, name, tag, group, checked_in` (already the live state — this is the regression guard, do not widen).
- Do **NOT** add `skill` (double precision, ordinal 3). The `c21 anon read` policy is `USING true` and column-agnostic; RLS cannot restrict columns, so the **column grant is the only mechanism hiding skill**. Any widening of the anon grant re-exposes skill.
- **Decision needed (minor):** the plan proposed adding `claimed_by_profile, community_id, created_at, updated_at` to anon. Recommend **NO** — keep `claimed_by_profile` authenticated-only (the "You" highlight only needs an authenticated read; exposing it tells anon which players are claimed). Names-only stays the anon contract.

**`profiles` — NOTHING anon:**
- **REVOKE ALL anon grants** on `profiles` (currently anon has SELECT + INSERT + UPDATE + REFERENCES on `id, display_name, email, created_at`). Today email is blocked **only** by the absence of an anon RLS policy — the grant itself is wide open. Revoking the grants is the defense-in-depth so email can never leak even if a policy is later mis-added. `authenticated` keeps self-read/self-update via existing `profiles self read/update` (both `id = auth.uid()`).

---

## 2. Policy map for 0039 (every permissive policy → explicit drop/replace)

0039 is **additive**: `is_organizer(community_id)` write policies land **alongside** the blanket policies; the blanket policies are dropped only in **0041**. Because RLS permissive policies are OR'd, the `is_organizer` policies enforce **nothing** while `admin all` (`USING true`) is still present — real enforcement begins at 0041 drop + grant revoke.

| Table | Permissive policy to drop (in 0041) | 0039 replacement (write) | anon read |
|---|---|---|---|
| `matches` | `c21 admin all` | `is_organizer(community_id)` ALL | keep `c21 anon read` |
| `tournaments` | `c21 admin all` | `is_organizer` ALL | keep |
| `teams` | `c21 admin all` | `is_organizer` ALL | keep |
| `team_members` | `c21 admin all` | `is_organizer` ALL | keep |
| `pools` | `c21 admin all` | `is_organizer` ALL | keep |
| `players` | `c21 admin all` | `is_organizer` ALL | keep `c21 anon read` (**do not widen column grant**) |
| `scoring_presets` | `c21 admin all` | `is_organizer` ALL | keep |
| `sessions` | `c21 admin all` | `is_organizer` ALL | keep |
| `groups` | `c22 admin all` | `is_organizer` ALL | keep |
| `attendance_sessions` | `c22 admin all` | `is_organizer` ALL | keep |
| `check_ins` | `c22 admin all` | `is_organizer` ALL | keep |
| `live_state` | `live_state admin all` | `is_organizer` ALL | keep `live_state anon read` |
| `communities` | (read-only both roles) | none needed | keep |
| `copilot_actions` | `c21 admin read` (SELECT only) | none needed | none |
| `memberships`, `player_claims`, `profiles` | already self-scoped | keep as-is | none |
| `action_log` | RLS-on, zero policy (default-deny) | leave locked | none |

**Helper hardening in 0039:** REVOKE EXECUTE from **anon** on `is_organizer`, `is_owner`, `caller_claims_team`, `handle_new_user` (policy/trigger-internal — run in owner context, unaffected). **CAVEAT / landmine:** `caller_role` — the app calls it **client-side as authenticated** (app.js:7480). Revoke anon **only**; **keep authenticated** or role derivation dies and admin never gates. This resolves the DOCS open-question and corrects the plan's Task-5 revoke list.

---

## 3. RPC verdicts reconciled against app call sites

**Rewrite in 0040 — add guard `if not (is_organizer(v_community) or caller_claims_team(v_team_a) or caller_claims_team(v_team_b)) then raise`, off the live definitions (preserve `_audit_actor`, version-CAS, forfeit/completion):**
- `submit_match_score` (called app.js:3507 pool, :3736 bracket) — anon-executable, zero guard. **REVOKE anon EXECUTE** (and PUBLIC, belt-and-suspenders).
- `set_live_score` (:3522) — same.
- `edit_match_score` (:3535) — same; gate to organizer/owner only (editing a final result is an admin action, not a player action).

**Rewrite in 0040 — organizer/owner guard (no player carve-out):**
- `clear_bracket_atomic` (:3755) — add `is_organizer`/`is_owner`.
- `start_new_session` (:10251) — global-impact; add organizer/owner guard.
- `sync_team_roster` (:3328) — add `is_organizer OR caller_claims_team`; **also extend it to write `teams.roster`** so the paired direct `teams` UPDATE at app.js:3326 can be deleted (it currently only links `team_members`).
- `apply_net_count_change` (:3612) and `generate_bracket_atomic` (:3710) — **verified SECURITY INVOKER** → convert to SECURITY DEFINER + `is_organizer` guard (as INVOKER their internal table writes run as the caller and die when authenticated table-write grants are revoked at 0041).

**Retire in 0041:** `approve_claim`, `reject_claim` (verified live, DEFINER, authenticated) — dead code, superseded by instant `claim_player`; 0 pending claims.

**Safe / unchanged (intended anon doors, DEFINER bypass):** `check_in`, `check_out`, `register_player`, `register_team` (registration_open gate), `claim_player` (auth.uid guard), `caller_role`/`is_organizer`/`is_owner`/`caller_claims_team` (read helpers), `current_session_id`, `link_roster_to_team`, `_audit_actor`, `log_copilot_action` (REVIEW — accept as authenticated telemetry).

---

## 4. App write-path coverage — every path maps to a policy/RPC post-cutover, or the fix

**A. Survive untouched** (SECURITY DEFINER anon/auth doors): all `check_in/check_out/register_player/register_team/claim_player/caller_role` sites (app.js:1032, 3286, 5667, 6061-6063, 6922, 7480, 7692, 8420, 10042-10163, 11165; checkin.html:491, 520). No action.

**B. Direct authenticated table writes that BREAK when the blanket policy drops + auth table-write grants are revoked (0041) — each needs a new organizer-guarded SECURITY DEFINER RPC created in 0039:**

| Target | App line(s) | New RPC (organizer-guarded) |
|---|---|---|
| `players` DELETE / INSERT / UPDATE | 539 / 693,700,704,6903,10882-10945 / 6626 | `delete_player`, `add_player`, `update_player` |
| `tournaments` INSERT / DELETE / UPDATE | 3162 / 3169 / 3300,3479 | `create_tournament`, `delete_tournament`, `set_tournament_fields` |
| `scoring_presets` INSERT / DELETE | 3198 / 3205 | `create_scoring_preset`, `delete_scoring_preset` |
| `teams` INSERT/UPDATE/DELETE/move | 3276,3306,3316,3357,3381 | `add_team`, `set_team_paid`, `rename_team`, `delete_team`, `move_team` |
| `teams.roster` + `sync_team_roster` | 3326 (+3328) | fold into extended `sync_team_roster` (see §3) |
| `pools` DELETE/INSERT + bulk `teams.pool_id` | 3406,3417,3433 | one atomic `draw_pools` RPC |
| `matches`+`tournaments` pool start | 3452,3474,3479 | one atomic `start_pool_play` RPC |
| `matches` clear/nets/reset | 3545 / 3570 / 3626 | `clear_result`, `set_pool_nets`, `reset_bracket` |
| `groups` UPDATE/DELETE/INSERT | 6662,6674,6683,6753 | `group_catalog` RPC **AND** fold catalog upkeep into `register_player` (see below) |
| `live_state` upsert | 5981 | `save_live_state` |
| `sessions` upsert/delete | 6521 / 6538 | `save_session`, `clear_session` |

**C. Anon-path snag:** the anon kiosk register (app.js:10163 `register_player`) optimistically calls `ensureGroupCatalogEntriesSupabase` (:10167) → `groups` direct writes (6662/6683/6674). These are **already best-effort/caught** today (anon has no `groups` write policy), so no *new* anon break — but to make the catalog actually update, **fold group-catalog upkeep into `register_player`** server-side.

---

## 5. Contradictions between inventories (explicit)

- **C1 — "Survives/Unchanged" vs "NEEDS-REWRITE" (systematic).** APP WRITES labels `submit_match_score`/`set_live_score`/`edit_match_score` (3507/3522/3535), `clear_bracket_atomic` (3755), `start_new_session` (10251), `sync_team_roster` (3328) as *"Survives — Unchanged — already-guarded RPC."* RPCS correctly marks them **NEEDS-REWRITE-0040**. **Reconciled:** they survive the *RLS lock* (DEFINER bypasses table grants) but are **NOT unchanged** — they have **no authorization guard** (ground-truth: all three scoring fns are anon-executable) and MUST be rewritten in 0040. "Already-guarded" is a mislabel. Trust RPCS.
- **C2 — `profiles` anon grant scope.** POLICIES says anon holds a *"wide-open table-level SELECT grant on email (no column restriction)."* Ground truth: grants are **column-level** (`id, display_name, email, created_at`), and anon also has **INSERT/UPDATE/REFERENCES**, not just SELECT — wider verbs, narrower column set than stated. Net risk identical (email is granted to anon, blocked only by missing RLS policy). Fix unchanged: **revoke all anon grants on profiles.**
- **C3 — PUBLIC grant on `set_live_score`/`edit_match_score` (unverifiable, not a true contradiction).** RPCS lists grantee `PUBLIC`; my ACL query joins `pg_roles` and cannot see a `PUBLIC` (grantee OID 0) grant, so I can neither confirm nor refute it. I **did** confirm `anon`. Treat "revoke anon AND PUBLIC" as belt-and-suspenders in 0040.
- **C4 — Migration numbering.** Plan body Task headings (Task5=0038, Task6=0039, Task8=0040) are STALE; DOCS supersession locks **RLS=0039, scoring=0040, retire=0041** (0038 was taken by claim_rpcs; 0042-0044 are later claim plumbing). Consistent once superseded — use the locked numbers.
- **C5 — `caller_role` revoke landmine.** Plan Task-5 revoke list includes `caller_role`; the app depends on it client-side as authenticated. Not a cross-inventory contradiction but a **plan defect** — resolve by revoking anon only.

---

## 6. Ordered slices — risk + rollback

**Slice 0 (prereq, app deploy — Task 4 role-gate, ships in parallel with nlvb2025):** set `state.isAdmin = (state.role==='owner'||'organizer')` server-derived via `caller_role`; map `masterAdminAuthenticated=(role==='owner')`, `limitedGroup=null`; **keep nlvb2025 path live**. Mike's real account already resolves to `owner` (verified membership), so admin shell renders on email+password sign-in and survives reload. *Risk:* LOW — additive, blanket policies still present so nothing enforced yet. *Rollback:* revert app deploy.

**Slice 1 — Migration 0039 (RLS additive + grants + helpers) + create all new admin RPCs from §4B.** Add `is_organizer` write policies alongside blanket; revoke anon EXECUTE on helpers (keep `caller_role` for authenticated); revoke all anon grants on `profiles`; confirm `players` anon grant unchanged; create the ~18 organizer-guarded DEFINER RPCs. *Risk:* LOW — `is_organizer` policies are no-ops while blanket present (permissive OR); RPC creation is inert until called. *Rollback:* drop the new policies + RPCs (keep DDL saved).

**Slice 2 — Migration 0040 (scoring + privileged RPC rewrite).** Rewrite the 3 scoring fns off live defs + participant/organizer guard; revoke anon(+PUBLIC) EXECUTE; convert the 2 INVOKER fns to DEFINER+guard; add guards to `clear_bracket_atomic`/`start_new_session`/`sync_team_roster` (+extend roster write). *Risk:* **MEDIUM — with 0 current claims and no casual-scoring code path, at the next tournament ONLY organizer/owner (Mike) can score until players claim their teams. Needs Mike's explicit OK.** *Rollback:* restore prior function bodies (save them first).

**Slice 3 — App re-route deploy.** Switch every §4B direct table write to the new RPCs; fold group-catalog into `register_player`. **Must land before Slice 4.** *Risk:* MEDIUM — verify every admin action routes through an RPC (desktop+mobile, §41). *Rollback:* revert app deploy (blanket policies still present → old direct writes still work).

**Slice 4 — Migration 0041 (retire, LAST, gated pre-flight).** STOP unless: owner membership confirmed + role-gated admin proven on prod + scoring works for a claimed player. Then: drop `c21/c22 admin all` + `live_state admin all`; **revoke authenticated INSERT/UPDATE/DELETE table grants** (this is what finally forces all writes through RPCs); remove `adminLoginWithCode`/nlvb2025 UI; drop `approve_claim`/`reject_claim`; retire the `admin_login` edge fn. **Keep nlvb2025 valid until the new path is proven — never lock the owner out.** *Rollback:* recreate blanket policies + re-grant (keep DDL saved); nlvb2025 still works as the fallback until it's the last thing removed.

---

## 7. Coupling flag + decisions that gate execution (Mike's calls)

- **admin_login ↔ copilot coupling:** copilot's edge gate requires `app_metadata.admin===true`, minted only by `admin_login`. When nlvb2025 retires (0041), **re-home copilot's gate to the owner/organizer role in the same cut**, and note copilot's tool-loop drives `submit_match_score` etc. via the public RPCs — so its effective write power is bounded by the 0040 scoring guards, not the edge fn.
- **Decisions required before executing:** (1) confirm "only organizer/owner scores until players claim" is acceptable, or scope a casual-scoring path now; (2) does KC need a real email+password account + organizer membership seeded before nlvb2025 retires, or is KC's access dropped at cutover; (3) rotate leaked nlvb2025 + make repo private (real-world call); (4) confirm `claimed_by_profile` stays authenticated-only on anon (recommended). Plus the fresh-session/auth-escalation gate before touching live auth config.

**Files referenced (absolute):** `C:\Users\OlasM\OneDrive\Athletic Specimen App\public\app.js`, `...\public\checkin.html`, `...\supabase\functions\admin_login\index.ts`, `...\db\migrations\` (0039/0040/0041 free; 0042-0044 are claim plumbing).
