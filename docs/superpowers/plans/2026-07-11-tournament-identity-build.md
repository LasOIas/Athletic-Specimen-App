# Tournament Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accounts capture first+last at sign-up and one automatic name-match connects the person to a NEW persistent tournament-people list AND their pickup row — once, forever — while registration stops polluting the pickup roster.

**Architecture:** New `tournament_players` table (person-rows, no skill) + `team_members.tournament_player_id`; a SECURITY DEFINER match engine runs at sign-up/name-fill; `register_team` resolves typed names against person-rows (linked → unclaimed → create). Client: sign-up name fields, one-time name fill, claim page becomes the collision fallback, My-team resolver reads the new join.

**Tech Stack:** Supabase (Postgres RPCs, RLS per the 0052 posture), vanilla JS (`public/app.js`, `public/pure.js`), vitest.

**Spec:** `docs/superpowers/specs/2026-07-11-tournament-identity-design.md` (approved 2026-07-11).

## Global Constraints

- Bump `APP_VERSION` (`public/app.js` ~line 28, `YYYY.MM.DD.N`) in every commit that touches app code.
- `node --check public/app.js` + full `npx vitest run` (baseline **488 passed**) green before every commit.
- Builders commit; the CONTROLLER pushes (§21) and applies migrations via the Supabase MCP.
- Migrations live in `db/migrations/` (NOT supabase/migrations). Number 0053, 0054 in order.
- SECURITY DEFINER + `set search_path to 'public'` on every new function; revoke from anon/public unless the spec grants it; never expose `players.skill` or `profiles.email` to anon.
- Never edit app source via PowerShell round-trips (UTF-8 mangling) — Edit tool / Node `fs` only.
- No approval queues anywhere (standing rule). No emoji; SVG icons only. §51 palette law.
- ZZTEST-prefix every throwaway row; restore the exact baseline (233 players / 18 teams / 0 July teams / 0 team_members / reg open) before finishing a task.
- The July tournament has 0 teams but registration is LIVE — schema changes must be additive and each commit deployable.

---

### Task 1: Migration 0053 — schema, RLS, match engine

**Files:**
- Create: `db/migrations/0053_tournament_identity.sql`
- (Controller applies via MCP after review; the file records it.)

**Interfaces:**
- Produces: table `tournament_players(id, community_id, real_name, profile_id, created_at)`;
  `team_members.tournament_player_id uuid`; `profiles.first_name/last_name text`;
  `player_claims.tournament_player_id uuid`;
  fn `normalize_person_name(text) returns text` (IMMUTABLE);
  fn `connect_profile_by_name(p_first text, p_last text) returns jsonb` (auth'd, definer);
  fn `claim_tournament_player(p_tp uuid) returns player_claims` (auth'd, definer);
  extended `handle_new_user()` trigger fn.

- [ ] **Step 1: Write the migration file** — exact content:

```sql
-- 0053: tournament identity (spec 2026-07-11). The tournament-people list, separate from pickup.
begin;

create or replace function public.normalize_person_name(p text)
returns text language sql immutable as
$$ select lower(regexp_replace(btrim(coalesce(p,'')), '\s+', ' ', 'g')) $$;

create table if not exists public.tournament_players (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id),
  real_name    text not null check (btrim(real_name) <> ''),
  profile_id   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists tournament_players_name_idx
  on public.tournament_players (community_id, public.normalize_person_name(real_name));
create index if not exists tournament_players_profile_idx
  on public.tournament_players (profile_id) where profile_id is not null;

alter table public.team_members add column if not exists tournament_player_id uuid
  references public.tournament_players(id) on delete restrict;
create unique index if not exists team_members_team_tp_uidx
  on public.team_members (team_id, tournament_player_id) where tournament_player_id is not null;
-- player_id (pickup) is FROZEN legacy: June rows keep it; no new writes after 0054.
alter table public.team_members alter column player_id drop not null;

alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name  text;

alter table public.player_claims add column if not exists tournament_player_id uuid
  references public.tournament_players(id) on delete set null;
alter table public.player_claims alter column player_id drop not null;

-- RLS: 0052 posture. Public roster faces are readable; writes are organizer-gated;
-- the ONLY anon-reachable write path is the SECURITY DEFINER registration/claim fns.
alter table public.tournament_players enable row level security;
create policy tp_anon_read on public.tournament_players for select using (true);
create policy tp_org_write on public.tournament_players for all
  using (public.is_organizer() or public.is_owner())
  with check (public.is_organizer() or public.is_owner());
revoke insert, update, delete on public.tournament_players from anon;
grant select on public.tournament_players to anon, authenticated;
grant insert, update, delete on public.tournament_players to authenticated; -- policies gate

-- handle_new_user: carry first/last from sign-up metadata (spec §2/§6).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to 'public' as
$$
begin
  insert into public.profiles (id, display_name, email, first_name, last_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    new.email,
    nullif(btrim(coalesce(new.raw_user_meta_data->>'first_name','')), ''),
    nullif(btrim(coalesce(new.raw_user_meta_data->>'last_name','')), '')
  )
  on conflict (id) do update
    set first_name = coalesce(public.profiles.first_name, excluded.first_name),
        last_name  = coalesce(public.profiles.last_name,  excluded.last_name);
  return new;
end $$;

-- The match engine (spec §3): connect-once, never-steal, link ALL unclaimed exact matches.
create or replace function public.connect_profile_by_name(p_first text, p_last text)
returns jsonb language plpgsql security definer set search_path to 'public' as
$$
declare
  v_uid uuid := auth.uid();
  v_norm text;
  v_tp int := 0; v_pk int := 0; v_collision boolean := false;
begin
  if v_uid is null then raise exception 'must be signed in'; end if;
  if btrim(coalesce(p_first,'')) = '' or btrim(coalesce(p_last,'')) = '' then
    raise exception 'first and last name are required';
  end if;

  update public.profiles
     set first_name = btrim(p_first), last_name = btrim(p_last)
   where id = v_uid;

  v_norm := public.normalize_person_name(p_first || ' ' || p_last);

  -- (a) tournament people: link every unclaimed exact match (same person by rule).
  update public.tournament_players
     set profile_id = v_uid
   where profile_id is null
     and public.normalize_person_name(real_name) = v_norm;
  get diagnostics v_tp = row_count;

  -- (b) pickup roster: claim every unclaimed exact match (instant, audited).
  update public.players
     set claimed_by_profile = v_uid
   where claimed_by_profile is null
     and public.normalize_person_name(name) = v_norm;
  get diagnostics v_pk = row_count;
  insert into public.player_claims (player_id, profile_id, community_id, status)
  select p.id, v_uid, p.community_id, 'approved'
    from public.players p
   where p.claimed_by_profile = v_uid
     and not exists (select 1 from public.player_claims c
                      where c.player_id = p.id and c.profile_id = v_uid);

  -- collision flag: an exact-name row exists but belongs to someone else (claim page once).
  select exists (
    select 1 from public.tournament_players
     where profile_id is not null and profile_id <> v_uid
       and public.normalize_person_name(real_name) = v_norm
    union all
    select 1 from public.players
     where claimed_by_profile is not null and claimed_by_profile <> v_uid
       and public.normalize_person_name(name) = v_norm
  ) into v_collision;

  return jsonb_build_object('tournament_linked', v_tp, 'pickup_claimed', v_pk,
                            'collision', v_collision);
end $$;
revoke all on function public.connect_profile_by_name(text, text) from public, anon;
grant execute on function public.connect_profile_by_name(text, text) to authenticated;

-- Claim-page fallback for a tournament person (mirrors claim_player's guards).
create or replace function public.claim_tournament_player(p_tp uuid)
returns public.player_claims language plpgsql security definer set search_path to 'public' as
$$
declare
  v_uid uuid := auth.uid();
  v_comm uuid; v_owner uuid; v_row public.player_claims;
begin
  if v_uid is null then raise exception 'must be signed in'; end if;
  select community_id, profile_id into v_comm, v_owner
    from public.tournament_players where id = p_tp for update;
  if v_comm is null then raise exception 'not found'; end if;
  if v_owner is not null and v_owner <> v_uid then raise exception 'already claimed'; end if;
  update public.tournament_players set profile_id = v_uid where id = p_tp;
  insert into public.player_claims (tournament_player_id, profile_id, community_id, status)
  values (p_tp, v_uid, v_comm, 'approved') returning * into v_row;
  return v_row;
end $$;
revoke all on function public.claim_tournament_player(uuid) from public, anon;
grant execute on function public.claim_tournament_player(uuid) to authenticated;

commit;
```

- [ ] **Step 2: Controller applies via MCP** (`apply_migration`, name `0053_tournament_identity`).
- [ ] **Step 3: Verify** — MCP probes, expected results inline:

```sql
select count(*) from tournament_players;                          -- 0
select first_name from profiles where email='olasmikey@gmail.com'; -- null (fills in Task 3)
select public.normalize_person_name('  Mike   OLAS ');            -- 'mike olas'
-- anon probe (REST with anon key, run by controller): SELECT tournament_players -> 200 [];
-- anon INSERT tournament_players -> 401/42501.
```

- [ ] **Step 4: `get_advisors` (security)** — expect no NEW findings vs the 0052 baseline.
- [ ] **Step 5: Commit** `db/migrations/0053_tournament_identity.sql`
  (`db(identity): 0053 tournament_players + name match engine`).

---

### Task 2: Migration 0054 — register_team resolves person-rows; pickup writes retired

**Files:**
- Create: `db/migrations/0054_register_resolves_identity.sql`

**Interfaces:**
- Consumes: Task 1's table/columns/normalize fn.
- Produces: `link_roster_to_tournament(p_team_id, p_roster, p_community_id)`;
  `register_team` (same signature, now calling the new resolver);
  `sync_team_roster` (same signature, new body). `link_roster_to_team` DROPPED.

- [ ] **Step 1: Write the migration** — exact content:

```sql
-- 0054: registration writes tournament identity, never the pickup roster (spec §4).
begin;

create or replace function public.link_roster_to_tournament(
  p_team_id uuid, p_roster jsonb, p_community_id uuid)
returns void language plpgsql security definer set search_path to 'public' as
$$
declare
  v_comm uuid := coalesce(p_community_id,
                          (select id from public.communities order by created_at limit 1));
  nm text; v_norm text; v_tp uuid;
begin
  for nm in
    select distinct btrim(e)
      from jsonb_array_elements_text(coalesce(p_roster,'[]'::jsonb)) e
     where btrim(e) <> ''
  loop
    v_norm := public.normalize_person_name(nm);
    -- 1) a LINKED person with this name -> the app already knows them (spec §4.2)
    select id into v_tp from public.tournament_players
     where community_id = v_comm and profile_id is not null
       and public.normalize_person_name(real_name) = v_norm
     order by created_at limit 1;
    -- 2) else the earliest UNCLAIMED person-row with this name
    if v_tp is null then
      select id into v_tp from public.tournament_players
       where community_id = v_comm and profile_id is null
         and public.normalize_person_name(real_name) = v_norm
       order by created_at limit 1;
    end if;
    -- 3) else a new unclaimed person
    if v_tp is null then
      insert into public.tournament_players (community_id, real_name)
      values (v_comm, nm) returning id into v_tp;
    end if;
    insert into public.team_members (team_id, tournament_player_id, community_id)
    values (p_team_id, v_tp, v_comm)
    on conflict (team_id, tournament_player_id) where tournament_player_id is not null
    do nothing;
  end loop;
end $$;
revoke all on function public.link_roster_to_tournament(uuid, jsonb, uuid) from public, anon, authenticated;

-- register_team: body identical to the LIVE def except the final perform line
-- (guards: row-lock, reg_open, team_size, dup name — copied verbatim from production).
create or replace function public.register_team(
  p_tournament_id uuid, p_team_name text, p_roster jsonb default '[]'::jsonb,
  p_contact text default null, p_paid boolean default false)
returns public.teams language plpgsql security definer set search_path to 'public' as
$$
declare
  t public.tournaments; nm text; roster_count int; new_team public.teams;
begin
  select * into t from public.tournaments where id = p_tournament_id for update;
  if t.id is null then raise exception 'No such tournament.'; end if;
  if not coalesce(t.registration_open, false) then
    raise exception 'Registration is closed for this tournament.';
  end if;
  nm := btrim(coalesce(p_team_name, ''));
  if length(nm) < 1 then raise exception 'Team name is required.'; end if;
  select count(*) into roster_count
    from jsonb_array_elements_text(coalesce(p_roster, '[]'::jsonb)) e
   where btrim(e) <> '';
  if t.team_size is not null then
    if roster_count <> t.team_size then
      raise exception 'This tournament needs exactly % players per team.', t.team_size;
    end if;
  elsif roster_count < 2 then
    raise exception 'Add at least 2 players to register the team.';
  end if;
  if exists (select 1 from public.teams
              where tournament_id = p_tournament_id and lower(btrim(name)) = lower(nm)) then
    raise exception 'A team named "%" is already registered.', nm;
  end if;
  insert into public.teams (tournament_id, name, roster, contact, paid, community_id)
  values (p_tournament_id, nm, coalesce(p_roster,'[]'::jsonb),
          nullif(btrim(coalesce(p_contact,'')),''), coalesce(p_paid,false), t.community_id)
  returning * into new_team;
  perform public.link_roster_to_tournament(new_team.id, coalesce(p_roster,'[]'::jsonb), t.community_id);
  return new_team;
end $$;

-- Manage roster edits run the same resolver; replaces stale tournament_player links for the team.
create or replace function public.sync_team_roster(p_team_id uuid, p_roster jsonb)
returns void language plpgsql security definer set search_path to 'public' as
$$
declare v_comm uuid;
begin
  select community_id into v_comm from public.teams where id = p_team_id;
  if v_comm is null then raise exception 'team not found'; end if;
  delete from public.team_members
   where team_id = p_team_id and tournament_player_id is not null;
  perform public.link_roster_to_tournament(p_team_id, p_roster, v_comm);
end $$;

drop function if exists public.link_roster_to_team(uuid, jsonb, uuid);
commit;
```

- [ ] **Step 2: Controller applies via MCP.**
- [ ] **Step 3: Integration test on a throwaway (MCP, then FULL cleanup)** —

```sql
-- as service: register via the RPC exactly as anon does
select register_team((select id from tournaments where name='July 2026 tournament'),
  'ZZTEST Identity Team', '["Zztest Onea","Zztest Twob","Zztest Threec","Zztest Fourd"]'::jsonb,
  null, true);
select count(*) from tournament_players where real_name ilike 'Zztest%';      -- 4
select count(*) from team_members tm join teams t on tm.team_id=t.id
 where t.name='ZZTEST Identity Team' and tm.tournament_player_id is not null; -- 4
select count(*) from players where name ilike 'Zztest%';                      -- 0  (pickup untouched!)
-- re-register same names on a 2nd ZZTEST team (after deleting the first team only):
-- tournament_players count stays 4 (reuse, not duplicate).
-- cleanup: delete team_members -> teams -> tournament_players (ZZTEST%); baseline exact.
```

- [ ] **Step 4: Commit** the migration file
  (`db(identity): 0054 registration resolves tournament people; pickup writes retired`).

---

### Task 3: Sign-up name fields + one-time fill + match call (client)

**Files:**
- Modify: `public/app.js` — auth page form (~5942-5992), signUp call (~6219),
  `onAuthStateChange` SIGNED_IN handling (~10005 region), account menu display.
- Modify: `public/pure.js` — add `splitFullNameParts` helper (validation reuse).
- Test: `test/identity-name.test.js` (new).

**Interfaces:**
- Consumes: `connect_profile_by_name` (Task 1).
- Produces: `promptNameFillIfNeeded()` (idempotent, called post-SIGNED_IN);
  pure `splitFullNameParts(first, last) -> { ok, first, last, message }`.

- [ ] **Step 1: Failing test first** (`test/identity-name.test.js`):

```js
const { splitFullNameParts } = require('../public/pure.js');
test('accepts a normal first+last', () => {
  expect(splitFullNameParts(' Mike ', ' Olas ')).toEqual({ ok: true, first: 'Mike', last: 'Olas' });
});
test('rejects empty parts', () => {
  expect(splitFullNameParts('Mike', ' ').ok).toBe(false);
  expect(splitFullNameParts('', 'Olas').ok).toBe(false);
});
test('rejects single-character junk', () => {
  expect(splitFullNameParts('M', 'O').ok).toBe(false);
});
```

- [ ] **Step 2: Run** `npx vitest run test/identity-name.test.js` — FAIL (fn undefined).
- [ ] **Step 3: Implement in pure.js** (browser-global + module-export pattern used by every pure helper):

```js
function splitFullNameParts(first, last) {
  const f = String(first || '').trim().replace(/\s+/g, ' ');
  const l = String(last || '').trim().replace(/\s+/g, ' ');
  if (f.length < 2 || l.length < 2) {
    return { ok: false, message: 'Enter your real first and last name.' };
  }
  return { ok: true, first: f, last: l };
}
```

- [ ] **Step 4: Tests pass** (`489+` total; baseline count grows by exactly the new file).
- [ ] **Step 5: Auth form** — inside the create-account variant of the auth page (~5974),
  ABOVE the email field, same locked grammar:

```html
<label class="auth-label" for="auth-first">First name</label>
<input class="auth-input" id="auth-first" type="text" autocomplete="given-name" autocapitalize="words" spellcheck="false" placeholder="First" />
<label class="auth-label" for="auth-last">Last name</label>
<input class="auth-input" id="auth-last" type="text" autocomplete="family-name" autocapitalize="words" spellcheck="false" placeholder="Last" />
```

Sign-in variant unchanged. The create submit path validates via `splitFullNameParts`
(inline error in the existing auth error line) and passes metadata:

```js
await supabaseClient.auth.signUp({
  email, password,
  options: { data: { first_name: nm.first, last_name: nm.last,
                     full_name: nm.first + ' ' + nm.last } }
});
```

- [ ] **Step 6: One-time fill + match call** — new top-level `promptNameFillIfNeeded()`:
  after SIGNED_IN settles (the deferred, non-callback path — same discipline as the role
  fetch: NEVER a supabase call inside the auth callback), read own profile
  `first_name,last_name`; if either is null, open a minimal auth-grammar overlay
  (First/Last + Save, no dismiss-forever without saving — it reopens next session);
  on save call `connect_profile_by_name`; if names were ALREADY present at sign-in
  (fresh sign-up), call `connect_profile_by_name` once too (idempotent server-side).
  If the RPC returns `collision: true`, show the claim page once (Task 4's version).
- [ ] **Step 7: Account menu** shows `first_name last_name` when present (fallback display_name).
- [ ] **Step 8:** `node --check`, vitest, localhost §27 (sign-up form renders both variants,
  mobile+desktop per §41), bump APP_VERSION, commit
  (`feat(identity): sign-up captures first+last; one-time name fill + auto-connect`).

---

### Task 4: Claim page repurpose + My-team resolver switch (client)

**Files:**
- Modify: `public/app.js` — `openClaimPage` (~6021-6164), `tdbListTeamMembers` (~2928),
  `myTeamInfo` (~2944), the Manage roster editor call site (~2364, unchanged signature —
  verify only), account-menu/claim affordances.

**Interfaces:**
- Consumes: `claim_tournament_player`, `claim_player`, Task 2's team_members shape
  (`tournament_player_id` populated July+).
- Produces: `tdbListTeamMembers` returns rows
  `{ team_id, tournament_player_id, tournament_players: { real_name, profile_id } }`.

- [ ] **Step 1: Resolver switch** — `tdbListTeamMembers` query becomes:

```js
const { data, error } = await supabaseClient
  .from('team_members')
  .select('team_id, tournament_player_id, tournament_players ( real_name, profile_id )')
  .eq('community_id', COMMUNITY_ID)
  .not('tournament_player_id', 'is', null)
  .in('team_id', teamIds);
```

`myTeamInfo()` matches `row.tournament_players?.profile_id === state.authSession.user.id`
(replaces the players.claimed_by_profile path for tournaments). The check-in hero's
`loadMyClaimedPlayer` (pickup) is UNTOUCHED.
- [ ] **Step 2: Claim page** — the kiosk search lists UNCLAIMED rows from BOTH lists
  (two quiet sections, same row grammar): `tournament_players (profile_id is null)` and
  pickup `players (claimed_by_profile is null)`; tapping calls the matching RPC
  (`claim_tournament_player` / `claim_player`), then re-runs `connect_profile_by_name`
  (links any remaining same-name rows) and repaints. Claimed rows never listed.
- [ ] **Step 3:** vitest + `node --check` + localhost §27: fixture-inject a linked person →
  My team renders; claim page shows both sections against real data (read-only assertions,
  no prod writes). §41 both widths. Bump version, commit
  (`feat(identity): claim fallback over both lists; My team reads tournament identity`).

---

### Task 5: Reliability check AS MIKE (§27 canon rule) + ship

**Files:** none (verification + cleanup only; controller-driven).

- [ ] **Step 1: Throwaway account e2e on prod** (same auth.users insertion technique as the
  session-10 adversarial verify; ZZTEST names): create account WITH metadata names →
  confirm `profiles.first_name/last_name` landed → `connect_profile_by_name` ran (auto,
  via a driven sign-in in an isolated browser context).
- [ ] **Step 2: The story test** — seed `ZZTEST Pickup Person` in pickup `players` +
  register `ZZTEST Story Team` typing the SAME name (anon form, real submit):
  assert ONE tournament_players row, unclaimed; then sign up as that name →
  assert BOTH links landed (tournament_players.profile_id set AND players.claimed_by_profile
  set) with zero taps; then register a SECOND ZZTEST team typing the name again →
  assert it attached to the SAME person row ("the app already knows").
- [ ] **Step 3: Both roles + surfaces** — anon: register form, Home, Tournament gate;
  signed-in throwaway: My team renders the story team; Mike-role surfaces unaffected
  (frozen-flag render walk of Manage; his real phone = the human check).
  Console 0 on a clean anon 45s watch. Real submits only — rendered forms don't count.
- [ ] **Step 4: FULL cleanup in one FK-safe txn** — player_claims → team_members → teams →
  tournament_players → pickup ZZTEST row → auth throwaway (+profile via cascade);
  baseline EXACT (233 / 18 / 0 July teams / 0 team_members / reg open / 1 auth user).
- [ ] **Step 5: Push, prod pill, §27 prod smoke** (anon register re-smoke — the launch rule),
  vault writebacks + 12-history per task, `get_advisors` final pass.

---

## Self-review (done inline)

- Spec coverage: §1→T1, §2→T3, §3→T1+T3, §4→T2, §5→T4, §6→T1, §7 slices→T1-T5. No gaps.
- No placeholders; every SQL/JS block is complete.
- Type consistency: `connect_profile_by_name(p_first,p_last)` used identically in T1/T3/T4;
  `tournament_player_id` naming consistent across T1/T2/T4.
- Risk notes for builders: the auth-callback deadlock (defer supabase calls out of
  `onAuthStateChange`), the July-live constraint (additive-only per commit), and the
  `sync_team_roster` delete-then-relink (runs inside one definer txn — safe).
