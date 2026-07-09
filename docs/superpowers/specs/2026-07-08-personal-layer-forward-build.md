# Personal Layer — Forward Build (data foundation → claim → surfaces)

**Date:** 2026-07-08
**Status:** design approved (Mike), ready for writing-plans
**Depends on:** the locked visual design in `2026-07-08-public-dashboard-remake-design.md` §"Personal layer (Slice 3)" (Home hero C, My Team B, claim A) and the claim RPCs in `db/migrations/0038_claim_rpcs.sql`.
**Supersedes** that spec's "Build prerequisite" note (which assumed a one-time backfill of the 18 June rosters). Mike's decision 2026-07-08: **forward only — no bulk backfill.** The June 2026 tournament is finished; the personal layer targets the *next* tournament.

## 1. Goal & success criterion

At the next tournament, a spectator can sign in, claim their name, get organizer approval, and see their personal surfaces (Home "your run" hero, My Team scoreboard, "You" highlight in Standings) — all driven by real data created automatically when their team registered. **No manual data setup, no touching existing prod/June data.**

Verifiable success: on a throwaway test tournament, end-to-end register → claim → approve → the three personal surfaces render the correct team/record/next-match; delete the throwaway; prod baseline (233 players / 1 community / 18 June teams / `team_members` untouched for June) intact.

## 2. Ground truth (verified against prod `mlzblkzflgylnjorgjcp`, 2026-07-08)

- `players` (233 rows) = the check-in pool; columns incl. `name text`, `community_id uuid DEFAULT '2c3bcfa9…'`, `claimed_by_profile uuid`.
- `teams` (18) carry a free-text `roster jsonb` (array of names); **63 of 72** roster entries are full names, **9** are first-name-only; 19 already match a player by exact ci name.
- `team_members` (PK `(team_id, player_id)`, FKs cascade to players/teams, `community_id`, `is_captain`) is **empty**.
- `tournaments.community_id` DEFAULT = the single community; 0 nulls. `communities` count = 1.
- `register_team(p_tournament_id, p_team_name, p_roster jsonb, p_contact, p_paid)` is the single SECURITY DEFINER choke point for **all** registration (public self-register `app.js:8844`, co-pilot `register_team` tool `~8115`, co-pilot create-with-teams `~8089`). It inserts a `teams` row only — no players, no members.
- `claim_player` / `approve_claim` / `reject_claim` (0038) exist, authenticated-only, self-guarded. `claim_player` raises `'player not found'` when a player's `community_id` is null — so created players **must** carry a non-null `community_id` (the column default already guarantees this; we stamp it explicitly anyway).

## 3. Identity policy (Mike's choice: reuse same-name)

When linking a roster name to a player, **reuse an existing player rather than duplicate**:

- Match = exact, case-insensitive, trimmed `name` **within the tournament's `community_id`**.
- **≥1 match →** reuse the **earliest** (`order by created_at`) same-name player. This gives "claim once, auto-resolve in future tournaments" and links a tournament roster to an existing check-in-pool identity when the name matches.
- **0 matches →** create a new player row (`name`, `community_id` = tournament's, `skill = 0` = the app's unrated convention).
- Link via `team_members … ON CONFLICT (team_id, player_id) DO NOTHING`.

**Constraint that shapes this (found during build 2026-07-08):** a pre-existing global unique index `players_real_name_group_uidx` on `(lower(btrim(name)), coalesce(group,''))` means two same-name players cannot both occupy the null-group slot. So a created player never duplicates a name there, and the original ">1 ambiguous → create new" branch was dropped — it was unreachable for created rows and would have violated the index. `players.skill` is `NOT NULL` with no default, so created rows must set `skill = 0`.

**Accepted edge case (Mike acknowledged):** two *different* people with the same name collapse to one player row, and a same-name person listed on two teams in one tournament resolves to both. Mitigations: organizer approval is a human check at claim time; the claim UI shows each candidate **with its team** so the searcher picks the right one.

## 4. Architecture

### 4a. DB — `link_roster_to_team` helper + `register_team` rewrite (migration 0042, additive)

New SQL helper, called from inside the registration transaction:

```
link_roster_to_team(p_team_id uuid, p_roster jsonb, p_community_id uuid) returns void
  for each non-empty trimmed name in p_roster:
    resolve player id via the §3 reuse policy (find-or-create, community-scoped)
    insert into team_members (team_id, player_id, community_id) values (...) on conflict do nothing
```

`register_team` rewrite = the current body **plus** a call to `link_roster_to_team(new_team.id, p_roster, t.community_id)` before `return new_team`. All existing validation/behaviour preserved; still SECURITY DEFINER; still one transaction (the function already `select … for update`s the tournament).

**Migration numbering:** the reserved cutover numbers (RLS 0039 / scoring 0040 / retire-code 0041) stay reserved; this additive rewrite takes **0042**. File saved to `db/migrations/0042_register_team_creates_members.sql` after applying, per repo convention.

### 4b. Other team-creation / roster-edit call sites (audit + route through the helper)

- Public self-register, co-pilot register, co-pilot create-with-teams → already via `register_team` → covered for free.
- **Admin add-team** (`tdbAddTeam` / `tv2-quick-add-team`) and **admin edit-roster** (`tdbSetTeamRoster`): these write `teams` directly, bypassing `register_team`. Add a thin authenticated RPC `sync_team_roster(p_team_id, p_roster)` that resolves the team's community and calls `link_roster_to_team`, and invoke it after those admin writes so admin-created / edited rosters also get members. Name-only quick-add (no roster) correctly creates no members.
- **Roster edits are additive in v1:** `sync_team_roster` only *adds* missing member links; it does **not** prune links for names removed from a roster (pruning could silently drop a claimed link and needs its own care). If a removed member matters, the organizer removes the team member explicitly. Pruning is deferred out of this build.

### 4c. App — "my team" resolver (tested pure helper)

Pure function(s) in `public/pure.js`, unit-tested with vitest:

- Input: my `profile_id`, the active tournament's teams + `team_members` + claimed players + matches.
- `resolveMyTeam(...)` → the team whose `team_members` includes a player with `claimed_by_profile === myProfileId` in the active tournament (null if none / unclaimed).
- `computeTeamRunTimeline(team, matches)` → ordered [last result (done), UP NEXT (accent), upcoming (faint)] for the Home hero C.
- `computeTeamRecord(team, matches)` → W–L, point-diff, seed for My Team B and the Standings "You" row.
- The app fetches `team_members` + claimed players alongside the existing tournament read; resolver runs client-side; surfaces render off it via `partialRender()` on background syncs (never `render()` — scroll-jump rule).

### 4d. App — claim UI (Option A, INSTANT) + admin Account row — CORRECTED 2026-07-09 (Mike)

> **Mike killed the approvals model** (*"i dont want any of that, all i want is to edit a player from the admin page, i dont want to have to approve every single player claim"*). Claims apply instantly; there is NO organizer approval step and NO approvals panel anywhere. The admin's only surface is the existing player editor.

- **Claim** (reuse the Check-In kiosk pattern): search field → tap your name shown as **avatar · name · team** → confirm ("Claim my spot" / "Not me") → `claim_player(playerId)` → **instantly linked** ("You're linked — this is you now"). Reached from the Home claim prompt / tournament card (signed-in) or after sign-in if unclaimed. The search lists players in the active tournament's teams (team context disambiguates same-name rows). A player already claimed by someone else renders as claimed/untappable.
- **Admin exception path** (replaces approvals): the existing admin player editor gets one **Account** row — the linked account's email (or "—") + an **Unlink** button (clears `claimed_by_profile` via the existing guarded admin write path). One tap fixes a wrong claim.
- **DB (migration 0043):** `claim_player` rewritten to set `players.claimed_by_profile = auth.uid()` directly (row-locked; guards: signed in / player exists / not claimed by someone else; idempotent for re-claiming yourself) and log the `player_claims` audit row as `approved`. `approve_claim`/`reject_claim` (0038) become unused — left in place, retired in the later cutover (0041).

### 4e. App — surfaces (wire the locked layouts)

Home hero C, My Team B, Standings "You" highlight render off §4c resolver output. Signed-out → shell minus hero + claim prompt; signed-in-unclaimed → claim prompt. Exactly per the locked layouts in the design spec — this slice is wiring, not redesign.

## 5. Error handling

- Registration with a roster where a name resolves ambiguously (>1 existing) → create-new path, never fail the registration.
- `link_roster_to_team` runs inside the register transaction → any failure rolls back the whole registration (team not half-created). Admin `sync_team_roster` failures surface via the existing guarded-write toast.
- Claim on an already-claimed player → RPC raises; UI shows "already claimed."
- No claimed player / unclaimed profile → resolver returns null → surfaces fall back to signed-in-unclaimed state (no crash, no empty hero).

## 6. Testing

- **Pure helpers:** vitest for reuse-policy shaping, `resolveMyTeam`, `computeTeamRunTimeline`, `computeTeamRecord` (incl. the same-name-on-two-teams edge).
- **DB integration:** on a throwaway test tournament — register a team via `register_team`, assert players + `team_members` created with correct community; register a second team sharing a name, assert reuse (1 match) vs create (>1); delete throwaway.
- **End-to-end (throwaway tournament, real app):** register → sign in as a test profile → claim → approve as owner (Mike) → verify Home hero C + My Team B + Standings "You" render correct team/record/next-match, desktop + mobile → delete throwaway. Confirm prod baseline unchanged (233 players / 18 June teams / June `team_members` still empty).

## 7. Slice plan (each = version bump + commit + deploy + verify)

- **Slice 3a — Data foundation:** `link_roster_to_team` + `register_team` rewrite (0042) + `sync_team_roster` for admin paths + DB integration test. Invisible to users; mechanism only.
- **Slice 3b — Instant claim + admin Account row:** migration 0043 (`claim_player` auto-applies) + claim UI (A) + the Account row/Unlink in the admin player editor. No approvals surface.
- **Slice 3c — Personal surfaces:** resolver + Home hero C + My Team B + Standings "You".

## 8. Out of scope

- The June-roster backfill (Mike: forward only).
- The RLS 0039 / scoring 0040 / retire-`nlvb2025` 0041 cutover (separate, riskier track).
- Multi-tenant / multi-sport (single community, volleyball only for now).
- Skill ratings anywhere public (stay private — audit rule).
