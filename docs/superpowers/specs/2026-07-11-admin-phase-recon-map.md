# Athletic Specimen â€” Admin-Phase Ground-Truth Map (reconciled)
*Merged from 5 recon reports (surface Â· codes Â· specDelta Â· dbTruth Â· writes). Code anchors are TODAY's lines, public/app.js v2026.07.10.26 (~12,380 lines). Migrations on disk stop at 0045.*

---

## 1. Executive summary â€” the 6 facts that most shape the design

1. **RLS is not role-gated yet â€” the Arc-2 cutover (0040/0041) never shipped.** Every admin-write table carries only the blanket `c21/c22/live_state admin all` policy (`ALL / {authenticated} / USING true / WITH CHECK true`) + an anon-read, and `authenticated` holds full DML grants. Role helpers (`caller_role/is_organizer/is_owner`, migration 0037) exist but are wired into **zero** table policies. Consequence: ANY logged-in user can write tournaments/matches/players/attendance today; owner/organizer/player only matters in the app UI and in 5 scoring/claim RPCs.

2. **The email+password role-gated admin replacement is ALREADY BUILT and live** (v2026.07.09 Slice-0): `signInWithPassword` â†’ `onAuthStateChange` â†’ `deriveRole`/`caller_role` sets `state.isAdmin` for role âˆˆ {owner, organizer}. Retiring the code login is ~90% **deletion**, not new construction.

3. **Two full admin write surfaces already exist** and hit the same tables/RPCs: the `tv2-*`/`tdb*` tournament UI **and** the AI Co-pilot (natural language, same RPCs, confirm-gated). A "change-everything" Manage tab is a **third** surface unless it consolidates â€” and the Co-pilot's write tools must stay in sync with (or be retired by) whatever the tab does.

4. **The DB has one admin: Mike.** `memberships` has exactly ONE row (Mike = owner). Zero organizers. The two synthetic `.local` code-login accounts have profiles but NO membership â†’ `caller_role()` returns NULL for them. Seeding a co-admin = create `auth.users` (auto-profile via `handle_new_user`) **+ one manual `service_role` INSERT into `memberships`** (no INSERT policy exists for clients).

5. **The IA broke: only "Manage" survives.** The old admin spec's separate 3-tab admin app (Home Â· Manage Â· Tournament) is superseded by Mike's 2026-07-11 model â€” ONE public app (Home Â· Check In Â· Tournament, everyone-facing/read-only) **plus a single Manage tab** for signed-in admins. Almost all admin *content/flow* carries; it relocates under Manage and restyles from the dead frosted pd-* kit to the atom-up flat-on-stone / Barlow / hairline / muted-blue system.

6. **Two capabilities the UI cannot do at all today** â€” both must be net-new in Manage: (a) **deliberate tournament close-out / end / crown-champion** (status='completed' is only a server side-effect of scoring the grand final; this is the June-2026 22-unscored-games / no-champion failure), and (b) **a rules editor** (0045 added `tournaments.rules`; the app only renders it â€” July rules were injected via MCP). There is also **no admin-facing audit-log UI**.

---

## 2. Manage tab â€” full capability checklist (surface + writes, deduped)

Legend: **[RPC]** routes through a Postgres RPC Â· **[DIRECT]** direct table write Â· **works-today** = functions for a signed-in admin now.

### Pickup session & attendance
- **Save/clear next-session card** (date/time/location, single `sessions` id=1) â€” `saveSession` 7458 upsert / `clearSession` 7480 delete. **[DIRECT]** works-today: YES.
- **Start new attendance session** (roll the night; preserves history) â€” `start_new_session` RPC (call 11197). **[RPC, DEFINER, authenticated-only]** MASTER-ADMIN gated (`canAccessOperatorSafetyControls` 6521). works-today: YES.
- **Share QR / kiosk link** â€” `openQrModal` 10790 (no DB write).
- âš ï¸ Two "session" concepts must stay distinct: the `sessions` info-card row vs `attendance_sessions` rolled by `start_new_session`.

### Players roster
- **Add player** â€” inline row 711/718/722, add-form 11828-11891, backfill 7850. **[DIRECT insert players]** YES.
- **Edit player (name / SKILL admin-only / group)** â€” `updatePlayerFieldsSupabase` 7547; edit modal `openPlayerEditPopup` 113 (skill @132). **[DIRECT]** YES.
- **Delete player** â€” delegated handler 557, type-DELETE confirm + operator-undo. **[DIRECT]** YES.
- **Unlink claimed account** â€” `.btn-unlink-account` 178 â†’ `updatePlayerFieldsSupabase(claimed_by_profile:null)`. YES.
- **Per-row check in/out** â€” `check_in`/`check_out` RPC (1050, +kiosk paths). **[RPC, DEFINER, anon+auth]** YES.

### Players â€” bulk & groups
- **Select-all-shown / bulk check-in / bulk check-out** â€” 12030 / 12058 â†’ per-id `check_in`/`check_out` RPC 12111. YES.
- **Bulk assign / remove from group** â€” 12134 / 12198 â†’ `updatePlayerFieldsSupabase`. **[DIRECT]** YES.
- **Group Manager: add / rename / delete group** â€” `ensureGroupCatalogEntrySupabase` 7592/7609/7630, `renameGroupCatalogEntrySupabase` 7642, `deleteGroupCatalogEntrySupabase` 7700. **[DIRECT groups]** YES.

### Casual teams / courts / live nets (LOCAL + live_state â€” NOT tournament tables)
- **Team-size chips + Generate balanced teams** â€” 11260 / 11241 â†’ `generateBalancedGroups` (saveLocal). YES.
- **Report / clear live match result** (Â±0.1 skill deltas synced to players; advances courts) â€” 11296 / 11350. YES.
- **Drag-drop reassign players** â€” 769-840. YES.
- **Save live state** (cross-device recovery) â€” `saveLiveStateToSupabase` 6915 upsert `live_state`. **[DIRECT]** MASTER-ADMIN gated (6521). YES.

### Tournament â€” lifecycle & format
- **Create tournament** (sets `registration_open=true`) â€” `tdbCreateTournament` 3350. **[DIRECT]** YES.
- **Delete tournament** (destructive) â€” `tdbDeleteTournament` 3374. **[DIRECT]** YES.
- **Select / switch tournament** â€” `tv2-select-tournament` 10351.
- **Scoring-format presets create/delete** â€” `tdbCreateScoringPreset` 3389 / `tdbDeleteScoringPreset` 3410. **[DIRECT scoring_presets]** YES.

### Tournament â€” settings & registration/payment
- **Set tournament fields** (name, status, targets/caps, net_count, win_by_2, grand_final_reset) â€” `tdbSetTournamentFields` 3504. **[DIRECT tournaments]** YES. *(exists as BOTH `manageSettingsPageHTML` 6392 AND modal `openTournamentSettingsModal` 4587 â€” duplicate path.)*
- **Registration open/close + venmo_link + buy-in (TEXT) + rules-open** â€” same `tdbSetTournamentFields`; `tv2-toggle-registration` 10304, venmo save 10313. **[DIRECT]** YES. âš ï¸ `buy_in` is TEXT, not numeric â€” free-text input (e.g. "$80/team").
- **Apply net-count change mid-play** â€” `tdbApplyNetCountChange` 3817 â†’ `apply_net_count_change` RPC. **[RPC, SECURITY INVOKER â€” landmine, Â§6]** YES today.

### Tournament â€” teams
- **Add / quick-add team** â€” `tdbAddTeam` 3468. **[DIRECT]** YES.
- **Register team + roster/members** (shared with public self-reg) â€” `tdbRegisterTeam` 3490 â†’ `register_team` RPC. **[RPC, DEFINER, anon+auth]** YES.
- **Set paid / rename / delete / move-to-pool** â€” `tdbSetTeamPaid` 3511, `tdbRenameTeam` 3519, `tdbDeleteTeam` 3562, `tdbMoveTeamToPool` 3586. **[DIRECT]** YES.
- **Set roster** (MIXED: direct update + `sync_team_roster` RPC) â€” `tdbSetTeamRoster` 3530. YES.
- **Withdraw team mid-pool** (forfeits remaining games via submit_match_score) â€” `tdbWithdrawTeam` 3543. YES.

### Tournament â€” pools
- **Draw pools** (delete+insert+bulk-update, NON-atomic 3-write) â€” `tdbDrawPools` 3601. **[DIRECT]** YES.
- **Start pool play** (delete+insert matches + status='pools', NON-atomic) â€” `tdbStartPoolPlay` 3647. **[DIRECT]** YES.
- **Move team between pools / edit pool nets** â€” `tdbMoveTeamToPool` 3586 / `tdbSetPoolNets` 3766. **[DIRECT]** YES.
- **Reset pools** â€” `tv2-reset-pools` 10477 â†’ set status:setup + re-draw. YES.

### Tournament â€” bracket & scoring
- **Seeding override â†’ Generate bracket** â€” `tdbGenerateBracket` 3837 â†’ `generate_bracket_atomic` RPC. **[RPC, SECURITY INVOKER â€” landmine, Â§6]** YES today. âš ï¸ `state.seedOverride` is transient (spec debt: persist to DB).
- **Reset bracket** (only backward transition out of bracket/completed) â€” `tdbResetBracket` 3831. **[DIRECT delete main matches + statusâ†’pools]** YES.
- **Submit pool result** â€” `tdbSubmitResult` 3707 â†’ `submit_match_score` RPC. **[DEFINER, anon+auth]** YES.
- **Submit bracket result** â€” `tdbSubmitBracketResult` 3925 â†’ `submit_match_score`. YES.
- **Set live score** â€” `tdbSetLiveScore` 3725 â†’ `set_live_score` RPC. **[DEFINER, anon+PUBLIC EXECUTE]** YES.
- **Edit finalized score** â€” `tdbEditMatchScore` 3739 â†’ `edit_match_score` RPC. **[DEFINER; 0039 guard requires is_organizer/is_owner]** works-today: YES for owner/organizer, **NO for group_admin (Â§6)**.
- **Clear pool result** â€” `tdbClearResult` 3749. **[DIRECT]** YES.
- **Clear bracket result** (recursive downstream cascade, can re-open completed) â€” `tdbClearBracketResult` 3956 â†’ `clear_bracket_atomic` RPC. **[DEFINER, auth-only]** YES.

### NET-NEW (no write path exists â€” Manage must build)
- **Close-out / End tournament / Crown champion / manual status='completed' / reopen** â€” **DOES NOT EXIST** (see Â§6 GAP #1). champion is derived (`computeChampion`), never stored.
- **Rules editor** â€” **DOES NOT EXIST**; render-only (`buildTournamentRulesHTML` 5198). Write would go via `tdbSetTournamentFields` or a new `set_rules` RPC.
- **Admin-facing audit log** â€” **DOES NOT EXIST as UI**. `action_log` (0002) + `copilot_actions` (0020) are append-only, RLS-locked from client reads; the only human-visible log is the client-side, non-persisted "Recent actions" operator card (master-admin only). Needs a read RPC + new UI.

### Parallel surface to keep consistent
- **AI Co-pilot** (`adminCopilotHTML` 9251, `COPILOT_TOOLS` 9385) performs check_in/out, make_teams, submit_score, setup_tournament, generate_bracket, create_tournament, register_team via the same tdb*/RPC paths; logged via `log_copilot_action`. Its edge-fn gate is a code-login landmine (Â§3).

---

## 3. Code-login kill list + replacement plan

### KILL (delete outright)
| Item | Location |
|---|---|
| `admin_login` edge function (whole file â€” CODES map nlvb2025/kcvb2025/asvb2025, self-provisions `.local` users, deterministic pw `code__SALT`) | `supabase/functions/admin_login/index.ts` |
| `adminLoginHTML()` code form (`#admin-login-form`/`#admin-code`/`#btn-admin-login`) | app.js 8217-8229 |
| `adminLoginWithCode()` (POSTs code, setSession) | app.js 8765-8789 |
| `onAdminLoginSubmit()` (**only** setter of code-derived admin state + only non-null writer of `limitedGroup` @8806) | app.js 8791-8834 |
| Auth-page "Admin sign-in" quiet link + panel + toggle/bind | app.js 8496-8497, 8508-8520 |
| `.local` / `isLocalCode` ephemeral-session branch in `onAuthStateChange` | app.js 10881, 10886-10890 |
| 3 write-only sessionStorage flags (`LS_ADMIN_KEY`, `LS_MASTER_ADMIN_AUTH_KEY`, `LS_LIMITED_GROUP_KEY`) â€” never restored (7115-7117) | app.js 6694/36/57 setters 8812-8816 |
| Dead CSS `.auth-admin`, `.auth-adminpanel` | styles.css 3065-3067 |
| Synthetic `.local` auth.users rows (owner@, kc@ â€” guessable deterministic pw) | DB cleanup |

### REPLACEMENT (already built â€” no new UI login needed)
- `onAuthStateChange` â†’ `deriveRole` (retry x3) â†’ `caller_role` RPC â†’ sets `isAdmin=true` iff role âˆˆ {owner, organizer}, `masterAdminAuthenticated=(role==='owner')`. app.js 8438-8449, 10914-10928. After retirement this is the sole `isAdmin` source.

### MUST FIX IN THE SAME CUT (or things break silently)
1. **Copilot 401** â€” `supabase/functions/copilot/index.ts:48-60` gates on `app_metadata.admin===true`, minted ONLY by `admin_login`. Real email+password JWTs never carry it â†’ every admin's Co-pilot 401s. Re-home the gate to an owner/organizer role check.
2. **Group-admin functional gap** â€” `state.limitedGroup` (tenant-scoping across the Players surface) is set non-null ONLY at 8806. Server-role path never sets it. Retiring codes DROPS KC/AS group-admin access unless organizer+group scoping is seeded/built. **Mike decision required.**
3. **Audit-actor mislabel** â€” migration 0019 derives actor from `app_metadata.admin`/`role` claims real accounts lack â†’ their writes log as anon. Derive from `caller_role` in the same cut.
4. **checkin.html â€” NOTHING to kill** (task premise stale): kiosk is anon-only (line 302); the admin link was relocated into the app sign-in page 2026-07-10.

### SEQUENCING
Retirement = Arc-2 Slice-4 / **Migration 0041 â€” the LAST step, gated**: keep nlvb2025 valid until it's the final thing removed (never lock the owner out); STOP unless owner membership confirmed + role-gated admin proven on prod + scoring works for a claimed player. Then drop blanket "admin all" RLS + revoke `authenticated` table grants (forces writes through RPCs) + rotate the leaked code + repo-private. **Opening email+password sign-in must land together with the RLS lock, not before** â€” else every spectator becomes `authenticated` and the blanket policy is a live write hole.

---

## 4. Current auth/DB state + co-admin seeding path

**Project** `mlzblkzflgylnjorgjcp`. **Community** (single): "Athletic Specimen", id `2c3bcfa9-305e-448b-924b-da90c029f575` (also the hardcoded default `community_id` on nearly every table).

**auth.users (3 total, all provider='email', has_password):**
- `olasmikey@gmail.com` â€” `80b53f8a-c3ea-473b-97c4-5ff0f23510ac` â€” the only real account.
- `owner@â€¦local` â€” `faac6533-â€¦-a56a` â€” synthetic code-login (display 'owner').
- `kc@â€¦local` â€” `cc6ba499-â€¦-7367â€¦` â€” synthetic code-login (display 'kc').

**profiles:** 3 (one per user, auto-created by `handle_new_user`). **memberships:** exactly **1** â€” Mike, role='owner', status='active'. â†’ Zero organizers; `caller_role()` returns NULL for both `.local` accounts.

**Role helpers** (all SECURITY DEFINER, STABLE, EXECUTE to authenticated+service_role, NOT anon): `caller_role(community)`, `is_organizer` (ownerâˆ¨organizer), `is_owner`. Correctly read `memberships` â€” seeding a membership immediately flips them true. **But zero table policies use them.**

**`tournaments` admin columns confirmed present:** name, status (CHECK setup/pools/bracket/completed), registration_open (bool), venmo_link (text), buy_in (**TEXT**), rules (text), team_size (int), pool_target/pool_cap/bracket_target/bracket_cap, match_cap, pool_count, net_count, win_by_2, grand_final_reset, group. (2 tournament rows exist; `scoring_presets` holds a parallel default set, 1 row.)

**Co-admin seeding â€” exact minimal path (per person):**
1. Create the `auth.users` row (service_role `auth.admin.createUser`, `email_confirm=true`, OR real email/Google signup).
2. **Nothing** for the profile â€” trigger `on_auth_user_created`â†’`handle_new_user` auto-inserts it (ON CONFLICT DO NOTHING).
3. **One `service_role` INSERT** (client cannot self-insert â€” `memberships` has no INSERT policy):
```sql
INSERT INTO public.memberships (profile_id, community_id, role, status)
VALUES ('<auth-user-uuid>','2c3bcfa9-305e-448b-924b-da90c029f575','organizer','active');
```
PK = (profile_id, community_id). `role` enum `community_role` âˆˆ {owner, organizer, player} (default player) â€” use `organizer` for co-admins, `owner` for full parity.

---

## 5. Old-spec decisions â€” CARRIES / SUPERSEDED / OPEN

| Old-spec item | Verdict | Note |
|---|---|---|
| Â§1 Admin bottom nav HomeÂ·ManageÂ·Tournament | **SUPERSEDED (spine)** | Nav is now the public HomeÂ·Check InÂ·Tournament; admin sees that + **Manage**. Only "Manage" survives; it absorbs all three old admin tabs. |
| Â§1 Admin "Home" overview + status cards | **SUPERSEDED** | No admin Home (Home is the everyone-surface, personal/admin content banned there). Status content relocates to Manage top; card visual dead (flat-on-stone). |
| Â§1 Two admin hub tabs (Manage-hub + Tournament-hub tiles) | **SUPERSEDED as IA / CARRIES as content** | "Tournament" collides head-on with the public Tournament tab. All six tournament-mgmt functions collapse into Manage. Tiles-vs-hairline-rows = OPEN. |
| Â§1 "Needs-you" card + live tile sub-labels | **CARRIES (relocate+restyle)** | Good content; move to top of Manage, flat-on-stone. Exact placement minor-OPEN. |
| Â§2 Close-out (paper-run-first, champion picker, honest ledger, GroupMe recap) | **CARRIES fully** | Shell-independent; fixes the June failure. Matte-gold champion card survives. Reached via Manage. |
| Â§3 Bracket scoring as net cards | **CARRIES concept / SUPERSEDED styling** | Reuse the new pl-* net-hairline row grammar + steppers, not the old frosted net cards (public page was rebuilt in session 9). |
| Â§4 Schedule builder + lock (auto-lock, type-name unlock) | **CARRIES fully** | Core anti-P0 safety; restyle flat. |
| Â§5 Players page (today-first, skill chip, group dots) | **CARRIES** | Skill/group dots valid (admin-only data). TASTE CAVEAT: no avatar/initials bubbles ("furniture"). |
| Â§6 Event settings (preset-first, grouped knobs, locked-knob reasons) | **CARRIES fully** | Gives scoring rules a UI. Restyle flat. |
| Â§7 Registration admin + GroupMe composer | **CARRIES + new dependency** | `registration_open` now DRIVES the public Home reg state. Venmo link still pending. |
| Â§8 Roles/co-admins (organizers = full power, owner-only Members page) | **CARRIES policy / OPEN auth mechanism** | See Â§7 contradictions â€” mechanism is actually built; what's OPEN is code-panel coexistence + Members/promote UI. |
| Â§9 Desktop treatment | **SUPERSEDED as written / CARRIES in spirit** | Wrong tab set; specifics fold into the Manage design round. Public desktop already redefined (rail+board 1140px). |
| Â§10 Build-notes debt (dirty-guard, partialRender-only, persist seedOverride, relax roster validator, replace window.prompt, atomic RPCs, etc.) | **CARRIES mostly** | Re-recon the "classic Tournament-tab branch ~5605-5748" + "duplicate registration renderers" â€” session-9 dead-code sweep may have partly closed them. |
| Â§11 Sequencing: Arc 2 RLS before the admin build | **CARRIES (reinforced)** | New model leans harder on Supabase-auth roles gating Manage + writes. |
| Design system: frosted pd-* + Inter/Sora | **SUPERSEDED** | Atom-up: Barlow Semi Condensed, flat-on-stone, hairline labels, muted-blue, tamed watermark. Â§51 matte + no-emoji + skill-admin-only CARRY. |
| **The 3 gating questions** | **OPEN â€” need fresh Mike round** | (1) How Manage attaches to the public shell (4th nav item / signed-in-only tab / profile bubble); (2) all mgmt inside Manage vs inline admin affordances on public Tournament pages; (3) Members/owner-promotion UI against Supabase auth. Plus minor: internal Manage cut (session vs tournament sections) + tiles-vs-rows. |

---

## 6. Risks & landmines (incl. writes a role-admin cannot perform today)

- **THE role-blocked write:** a **group_admin cannot edit/overwrite a FINALIZED score.** `edit_match_score` (and `submit_match_score` on an already-final match) require `is_organizer âˆ¨ is_owner`, and `is_organizer` = owner/organizer only â€” `group_admin` is unrecognized (0037:11, 0039 guard). The UI shows them as admin, but the RPC rejects them. *(This is the ONLY capability role gates today.)*
- **SECURITY-INVOKER time-bombs:** `apply_net_count_change` and `generate_bracket_atomic` are live-verified `prosecdef=false`. Their internal table writes run **as the caller**, passing only via the blanket policy â€” they **break the moment 0041 revokes `authenticated` grants.** Convert to SECURITY DEFINER in the cutover.
- **Blanket-RLS write hole under email+password:** opening email+password sign-in *before* the 0041 RLS lock turns every spectator into an `authenticated` user who can write every table (USING true). Must land together.
- **Copilot dies for real accounts** the moment codes retire (gate on `app_metadata.admin`) â€” see Â§3.
- **No deliberate close-out (GAP #1):** status='completed' is only a server side-effect of scoring the grand final. A pool-only/abandoned event can never be marked done; a mis-scored auto-completed final is undoable ONLY via the destructive reset-bracket (delete matches + revert to 'pools'); no clean reopen, no manual champion override. This is exactly the June failure.
- **No rules editor (GAP #2):** rules were injected via MCP; Manage must create the write path.
- **Non-atomic multi-writes:** `tdbDrawPools` (delete+insert+bulk-update) and `tdbStartPoolPlay` (delete+insert+status) are 3 un-transactioned calls each â€” a mid-sequence failure leaves pools/matches half-built. Atomic RPCs fix a real integrity risk.
- **First score submit is ungated:** `submit_match_score` only enforces role when OVERWRITING a final match â€” the initial submit is open to any authenticated (and via anon EXECUTE, anon) caller.
- **PUBLIC EXECUTE grants:** `set_live_score` and `edit_match_score` carry a real PUBLIC grant (`=X/postgres`) â€” only the 0039 overwrite guard protects finalized scores, not the grant.
- **Stray anon DML grants** on `groups`, `scoring_presets`, `attendance_sessions`, `check_ins` (DELETE/INSERT/UPDATE etc.) â€” blocked today only by absence of an anon write *policy* (RLS default-deny), not by the grant. Revoke when Manage/RLS lands.
- **Non-obvious destructive side effects:** `withdraw-team` FORFEITS remaining games (hard scores, not a soft flag); `clear-bracket` does a recursive downstream cascade and can re-open a completed tournament; `delete-tournament` is a hard delete distinct from close-out.
- **Single global session:** `sessions` is one hardcoded row (id=1) app-wide â€” not per-community/per-group.
- **Master-admin gating must be preserved:** `canAccessOperatorSafetyControls` (owner âˆ§ !limitedGroup) hides Start-new-session, Recent-actions/Undo, and live_state save. A naÃ¯ve Manage rewrite could over-expose these to group/organizer admins.

---

## 7. Contradictions between reports (flagged, NOT resolved)

1. **How many code accounts actually exist.** `codes` report: the CODES map has **THREE** entries (nlvb2025â†’owner, kcvb2025â†’kc, asvb2025â†’as) and explicitly self-flags "task said 2 â€” verify actual provisioned count." `dbTruth` (live query): only **TWO** synthetic `.local` accounts exist (owner@, kc@) â€” no `as@`. Reconciliation implied but unconfirmed: `asvb2025` was defined in code but its account was never provisioned (never logged in). **Flag: 3 codes defined vs 2 accounts provisioned.**

2. **Is the email+password admin mechanism OPEN or already shipped?** `specDelta` treats Â§8's auth mechanism as **OPEN** ("does an email+password account's server ROLE now confer admin, replacing the code panel?"). `codes` + `writes` report it as **already built and live** (v2026.07.09 Slice-0, `deriveRole`â†’isAdmin for owner/organizer). Resolution note (not silent): the *mechanism* exists; what is genuinely OPEN is (a) coexistence with the still-live code panel, (b) the Members/owner-promotion UI, (c) whether group_admins get an email path â€” not whether role confers admin.

3. **Does "group_admin" exist as a role at all?** `surface` + `codes` + `writes` treat `group_admin` as a first-class admin role (state.limitedGroup, tenant lock). `dbTruth`: the DB enum `community_role` is only {owner, organizer, player} â€” **there is no `group_admin` membership role.** It exists ONLY in the synthetic code-login `app_metadata` world. Any "seed group-admins" plan must map it onto organizer + explicit group scoping, which does not exist in the schema today.

4. **"works-for-role-admin-today" â€” uniform YES vs role-matters.** `writes` concludes a uniform **YES** for all ~30 capabilities (RLS not role-differentiated). `surface`/`codes`/`specDelta` speak of meaningful owner vs group_admin vs organizer gating. Both are true at different layers (DB blanket-allow vs UI-flag + 5 RPCs) â€” the single real DB-layer exception is the finalized-score edit (Â§6). Flag so the reconciler doesn't read "role is irrelevant" as absolute.

5. **Minor line-number drift** (post-restyle shift, not conflicts): `adminLoginWithCode` cited as 8765-8789 (`codes`) vs 8775 (`surface`); isAdmin gate 10925 vs 10925-10928. Trust `writes`/`codes` current-line numbers (v2026.07.10.26) over `surface`'s where they diverge.