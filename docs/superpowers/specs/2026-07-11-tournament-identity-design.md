# Tournament Identity — accounts that know you, forever (design)

**Date:** 2026-07-11 (session 11, approved by Mike in-chat)
**Status:** APPROVED design — next: writing-plans → build slices
**Baseline:** prod v2026.07.11.23 (`f9391c4`), migrations through 0052, vitest 488

## Mike's asks (verbatim anchors)

- "when a person creates an account it needs to ask for their first and last name"
- "then they can claim themselves, they should only need to do this once … signed in forever"
- "when other tournaments go on the app already knows that person even though their team changes"
- "the players that are already in the app are only for pick up days they have nothing to do with
  the tournament, so we need a new player list for tournaments"
- Fork picks (in-chat): roster entry = **typed names + auto-match** (claim page = ambiguity
  fallback, ONCE) · pickup link = **"after a person signs up and their first and last name match
  with another, connect them"** (one match pass connects BOTH worlds) · cutover = **July onward,
  June stays history**.

## 1 · Data model

**NEW `tournament_players`** — the persistent tournament-people list. One row per PERSON
(not per tournament; team membership varies per tournament, the person row does not):

```sql
create table tournament_players (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id),
  real_name    text not null,            -- "First Last", the public roster face
  profile_id   uuid references profiles(id) on delete set null,  -- null = unclaimed
  created_at   timestamptz not null default now()
);
-- lookup index on (community_id, lower(btrim(real_name))); profile_id partial index
```

**`team_members` gains `tournament_player_id uuid references tournament_players(id)`.**
The existing `player_id` (→ pickup `players`) is FROZEN as June legacy: no new writes, History
keeps reading it. July+ rows populate `tournament_player_id` only.

**`profiles` gains `first_name text, last_name text`.** `display_name` stays (informal).
Emails remain private (anon has no SELECT on profiles — unchanged).

**Pickup `players`:** untouched schema-wise. **`register_team` STOPS creating pickup rows**
(the 0042 `link_roster_to_team` behavior is retired) — the pickup roster returns to being
pickup-only. `players.claimed_by_profile` keeps powering the one-tap check-in.

**`player_claims`** keeps auditing claim events; gains a nullable `tournament_player_id`
column so both claim kinds audit into one place.

**No skill anywhere near tournaments:** `tournament_players` carries NO rating column.

## 2 · Sign-up captures the person

- Create-account form gains **First name + Last name** (required, `isValidFullName`-grade
  validation per part; trimmed; stored as separate columns; matched as "First Last").
- UI: extends the LOCKED auth-page grammar (rf-hairline fields, brand block) — the two fields
  stack above email. §38 note: this is an extension of an already-picked layout; build ships ONE
  composed variant and flags it in §27 screenshots (a full options round only if Mike asks).
- **Existing accounts** (Mike's is the only one): `first_name is null` → on next signed-in open,
  a one-time "What's your name?" fill (same field grammar, saves once, never asks again).
  Sign-ups via email confirm keep working — the name fields ride the same signUp call
  (user metadata) and land in `profiles` via the `handle_new_user` trigger extension.

## 3 · The match engine (connect-once, know-forever)

One SECURITY DEFINER RPC `connect_profile_by_name(p_first, p_last)` — runs at: (a) sign-up
completion, (b) the one-time name fill, (c) after a claim-page pick (for the other list).

Normalization: `lower(btrim(first)) || ' ' || lower(btrim(last))`; internal whitespace collapsed.

Rules, per list:
- **tournament_players:** exact-match UNCLAIMED rows (`profile_id is null`) → link ALL of them
  to this profile (a person may exist once; duplicates from typos collapse later via admin edit —
  matching multiple unclaimed exact-name rows links them all: same person by Mike's rule).
- **pickup players:** exact-match UNCLAIMED rows (`claimed_by_profile is null`) → claim them
  (same instant-apply model as today, audited in player_claims).
- **Never steal:** rows already linked to another profile are invisible to matching.
- **Zero matches:** nothing to connect — a fresh person; their tournament_players row is created
  the first time a roster includes them (or never, if they only spectate). No claim needed.
- **Ambiguity is impossible under exact-match linking-all-unclaimed** EXCEPT the claimed-collision
  case (someone else already owns "Mike Olas"): then the sign-up gets NO auto-link and the claim
  page is the fallback — search, tap yourself, done ONCE (writes profile_id / claimed_by_profile
  directly, instant, no approvals — Mike's standing rule).
- **Bidirectional forever:** `register_team`'s resolver (§4) matches typed names against LINKED
  person-rows first — so after you're connected once, every future roster typed with your name
  attaches to YOU automatically ("the app already knows that person").

## 4 · Registration (captains: unchanged; server: rewritten)

The anon typed-names form stays byte-identical. Server-side `register_team` (new migration,
same signature — all callers covered) per typed name, in-transaction:

1. normalize the typed name;
2. exact-match a **linked** tournament_player in this community → use that row;
3. else exact-match an **unclaimed** tournament_player → reuse it (earliest);
4. else INSERT a new unclaimed `tournament_players` row;
5. insert `team_members (team_id, tournament_player_id, is_captain, community_id)`.

Same-name-different-person edge: a second real "Mike Olas" whose namesake is claimed → step 3/4
creates/reuses an UNCLAIMED row — the two people stay distinct rows; the newcomer's claim-page
pick disambiguates once. `teams.roster` jsonb stays as the typed-text snapshot (display + audit).

Manage roster edits (`sync_team_roster` successor) run the same resolver. Withdraw/rename/paid
untouched.

## 5 · What reads the identity

- **My team / Tournament personalization (July+):** `profile → tournament_players(profile_id)
  → team_members(tournament_player_id) → team`. June's resolver path over legacy player_id rows
  is retired with the June season (History renders from teams.roster text — already true).
- **Claim page:** repurposed as the ambiguity fallback — kiosk-style search over BOTH lists'
  unclaimed rows (tournament people + pickup roster), tap yourself once. Reached from the
  Tournament tab's claim affordance; surfaced as a prompt ONLY in the claimed-collision case
  (§3) — a zero-match sign-up has nothing to claim and sees no prompt.
- **Check-in one-tap hero:** unchanged — it reads `players.claimed_by_profile`, which the match
  engine now populates automatically at sign-up.
- **Admin (Manage):** the Players directory stays the PICKUP list (per Mike: pickup-only).
  Tournament people appear where they already do — team rosters in Teams & payment. An admin
  unlink/edit for tournament identity mirrors the existing pickup Account row (edit sheet).

## 6 · Security / RLS

- `tournament_players`: anon SELECT (public roster faces — names only); INSERT only via the
  SECURITY DEFINER registration path; UPDATE/DELETE organizer-gated (0052 pattern).
- `connect_profile_by_name` + claim RPCs: authenticated-only, definer, guarded (own-profile only,
  never-steal enforced in SQL).
- `profiles` stays anon-invisible; first/last names surface publicly ONLY via tournament_players
  rows they chose to be on (typed rosters were already public).
- `handle_new_user` trigger extension carries first/last from auth metadata.

## 7 · Cutover + sequencing

- Forward from NOW: the migration lands while July has 0 teams (clean). June untouched.
- Slices (writing-plans will detail): **S1** migration 0053 (table + columns + indexes + RLS)
  · **S2** register_team rewrite + Manage roster resolver · **S3** sign-up form + name fill +
  handle_new_user + match engine RPC · **S4** claim-page repurpose + resolver switch for My team
  · **S5** §27 reliability check per Mike's new canon rule (drive it AS HIM: real sign-up with a
  throwaway, real registration, both roles, real submits; cleanup to exact baseline).

## Out of scope (explicit)

June backfill · invite links · approval queues (never — standing rule) · pickup behavior changes
· skill/ratings anywhere in tournament data · multi-community.
