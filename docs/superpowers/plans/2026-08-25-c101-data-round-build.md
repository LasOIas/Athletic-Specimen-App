# C101 Data Round Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. (This project's §38 rule: UI edits are executed INLINE by Fable unless Mike picks subagent-driven at the hand-back. **Every migration MCP call in this plan is the CONTROLLER's, never a builder's.**)

**Goal:** Turn four Manage promises into server truth. A team moves between pools before the schedule is drawn and, at the end of the round, after it too; an organizer can clear one bracket result and every bracket result without deleting the tree; marking a team paid leaves an audit row carrying the team's name; the activity log reads as sentences instead of `action · detail`; and a confirmed email change updates `profiles.email`, so the admin-seat lookup stops matching the old address.

**Architecture:** A vanilla-JS SPA client over Postgres. Every write this round adds is a `SECURITY DEFINER` function with `set search_path to 'public'`, an organizer guard IN ITS BODY (RLS is a row FILTER on these tables, and a DEFINER function granted to `authenticated` bypasses it entirely, so the body IS the boundary: 0055 and 0056 are the banked incidents), a `revoke all ... from public, anon` followed by `grant execute ... to authenticated`, an `action_log` insert written by the same call that made the change, and a return value the client reads back. The one exception is Task 2, which is a TRIGGER on `auth.users` because it must fire inside GoTrue's transaction, and it is revoked from every client role. Activity-log prose is written at WRITE time into `action_log.prose`; `read_action_log` coalesces to today's `action || ' · ' || detail` for the backlog. Every migration is proved in a `begin; ... rollback;` harness with faked JWT claims BEFORE it is applied, and the harness copy never commits, so a half-applied file cannot come from it. The round is additive at apply time; the destruction happens on the first CALL, never on the apply.

**Tech Stack:** Postgres / plpgsql applied through the Supabase MCP (`apply_migration` for DDL, `execute_sql` for fixtures, probes and read-only baselines, never for DDL), supabase-js 2.39.5 (`rpc`), vitest.

**Spec:** `docs/superpowers/specs/2026-08-25-c101-data-round-design.md` (72ce17b). It is the authority for every contract, guard, copy string, grant, test flip and gate step below.

## Global Constraints

- **Copy law.** No em dashes anywhere, in code, copy, comments, commit messages or SQL. Where a SHIPPED literal contains one, this plan writes it `[EMDASH]` and the task replaces it with a full stop (the three named free riders in Task 4). Never "night". No emojis in shell commands. No trailers on commits.
- **Line endings.** `db/migrations/*.sql` follow the repo's existing ending, which is **LF**: verified by byte count on 2026-08-25 (`0056_definer_rpc_organizer_guards.sql` = 110 `\n`, 0 `\r\n`; `0058_tournament_venue.sql` = 28 `\n`, 0 `\r\n`). Re-check before writing each file with `python -c "d=open(r'<file>','rb').read(); print(d.count(b'\r\n'), d.count(b'\n'))"`. `public/app.js` is **LF**; `public/pure.js` and `public/styles.css` are **CRLF** (count `\r\n` vs `\n` before AND after every edit). Never `git stash` a `public/` file.
- **`APP_VERSION`** lives near the top of `public/app.js` (grep `APP_VERSION`, the line drifts). Task 1 ships **`'2026.08.25.38'`** (`.36` shipped the even-team-total draw, `.37` was consumed by the team-generator fix `e2410f5`). Every later task states "the next unused number when dispatched" and grep-confirms it before writing. A new local day restarts the counter at `.1`.
- **No new `!important`** anywhere in this round. No wildcard motion selectors. Every appended CSS block carries a PORT NOTE naming its task.
- **Every migration file header follows the repo convention** (below) and carries `NOT APPLIED` until the controller applies it. The `APPLIED <date> via the Supabase MCP on Mike's word` line is appended by the CONTROLLER in a follow-up commit, matching 0058's convention. A DB-only commit has no `APP_VERSION` to bump, which is why 0058 shipped as two commits.
- **Migration file convention** (from `0058_tournament_venue.sql` for the header, `0039_scoring_overwrite_guard_and_grant_hardening.sql` for the rollback block). Path `db/migrations/NNNN_slug.sql`, never `supabase/migrations/`. Header = comment lines only, in this order: the file name and a one-line what; WHY, the behaviour that forced it, with the app.js or migration citation; the decisions taken inside the file and the ones deliberately not taken; what stays true before AND after the apply; then the `NOT APPLIED` / `APPLIED` line. Idempotency: `add column if not exists`, `create or replace function`, `drop trigger if exists` before `create trigger`. Multi-statement DDL is wrapped in `begin; ... commit;` the way 0056 does. Grants sit immediately under their function, revoke first, grant second, one line each. Every function-replacing file carries a commented `ROLLBACK BLOCK (verbatim prior definitions + re-grants, apply this whole block to undo NNNN)` closed with `END ROLLBACK BLOCK`.
- **Subagents commit, never push, and never call Supabase.** Every `apply_migration`, `execute_sql`, `get_advisors` and REST call in this plan is the controller's. The controller batches the pushes (§21).
- **No secrets printed.** The anon key is a public client key already shipped in `public/supabase-config.js`, and it still does not go into chat, a commit, or the vault (§54): the one anon REST probe per destructive function reads it out of that file at call time and never echoes it.
- **Every chain gates on the test RUNNER's exit code**, never on a grep of its output (the v.4 lesson). `node --check public/app.js && node --check public/pure.js` after every JS edit.
- **This round grants nothing NEW to anon and narrows nothing anon already holds.** `register_team` is `grant execute ... to anon, authenticated` (0024:58) and Task 4 re-issues that exact line verbatim.
- **42501 collides.** The organizer guard raises it and a nested permission denial raises it too, so every guard assertion compares the MESSAGE, not just the SQLSTATE.
- **A role-scoped revoke is a NO-OP while a PUBLIC grant exists.** Read `proacl` for a leading PUBLIC entry after every apply.

## Round preconditions (the CONTROLLER runs these once, before Task 2)

- [ ] **P1. Mint the Supabase MCP token.** The plugin's OAuth token is per project folder and expires. Expect the `authenticate` link and open it IN Mike's Chrome through the extension: a 600-character URL pasted into the terminal is unusable to him. One mint at the top of the round covers it.
- [ ] **P2. The count baseline.** `execute_sql`:
```sql
select (select count(*) from public.players)      as players,
       (select count(*) from public.teams)        as teams,
       (select count(*) from public.matches)      as matches,
       (select count(*) from public.tournaments)  as tournaments,
       (select count(*) from public.pools)        as pools,
       (select count(*) from public.action_log)   as action_log,
       (select count(*) from public.profiles)     as profiles;
```
The spec's 2026-08-25 reading was 233 players / 18 teams / 71 matches / 1 tournament plus an `action_log` count; THIS reading is the baseline every post-apply step compares against, not the spec's numbers.
- [ ] **P3. The advisors baseline.** `get_advisors(security)`, saved verbatim. Every post-apply check is "zero NEW findings against this list", never "zero findings".
- [ ] **P4. The live definitions and grants of every function this round replaces.** `execute_sql`:
```sql
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       p.proacl::text                            as acl,
       pg_get_functiondef(p.oid)                 as def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('clear_bracket_atomic','read_action_log','draw_pools_atomic',
                     'start_pool_play_atomic','register_team','set_member_role','_audit_actor',
                     'is_organizer','is_owner','handle_new_user')
 order by p.proname;
```
Diff each `def` against the repo file named in its task. **Spec Open 3 is answered here.** If a body differs from the file, the migration is written off the LIVE definition and the difference is reported to Mike before anything is applied (0021 and 0022 were live-only before capture, and C89-DONE proved the files are not a faithful record of live RLS). Confirm `register_team`'s `proacl` still carries its anon entry and that no function shows a leading `=X/` PUBLIC entry.
- [ ] **P5. What `action_log.actor` holds.** One organizer call to `read_action_log(50)` through `execute_sql` after impersonating the owner. **Spec Open 4 is answered here.**
- [ ] **P6. June has no bracket.** `select status, count(*) filter (where m.phase = 'main') as main_rows from public.tournaments t left join public.matches m on m.tournament_id = t.id group by t.id, t.name, t.status;` The claim that `clear_whole_bracket` cannot touch June rests on June returning zero `phase='main'` rows. **Spec Open 5 is answered here.** A non-zero answer STOPS the round and goes to Mike.
- [ ] **P7. Is `profiles.email` already stale, and does any account have no profile row?**
```sql
select count(*) filter (where p.id is null)                     as accounts_with_no_profile,
       count(*) filter (where p.id is not null
                          and p.email is distinct from u.email) as stale_emails
  from auth.users u left join public.profiles p on p.id = u.id;
```
**Spec Open 6 is answered here.** A non-zero `accounts_with_no_profile` is what makes 0059's upsert load-bearing rather than defensive; record the number either way.
- [ ] **P8. The fixture shape.** Read the NOT NULL columns with no default on the four tables the harnesses seed, so a fixture insert cannot fail on a column this plan did not anticipate:
```sql
select table_name, column_name, data_type, column_default
  from information_schema.columns
 where table_schema = 'public'
   and table_name in ('tournaments','pools','teams','matches')
   and is_nullable = 'NO' and column_default is null
 order by table_name, ordinal_position;
```
Extend every harness fixture below with any column this returns that it does not already supply. This is a read, not a change.
- [ ] **P9. Can `execute_sql` update `auth.users` inside a rolled-back block?** **Spec Open 7.** One probe, run and rolled back:
```sql
begin;
  create temp table t_out(name text, ok boolean, got text);
  do $h$
  begin
    begin
      update auth.users set updated_at = updated_at where false;
      insert into t_out values ('auth.users is writable from execute_sql', true, 'no exception');
    exception when others then
      insert into t_out values ('auth.users is writable from execute_sql', false, sqlstate || ' ' || sqlerrm);
    end;
  end $h$;
select * from t_out;
rollback;
```
A `true` means Task 2's trigger firing can be proved BEFORE the apply and Task 2 step 4 gains its optional case; a `false` means it is proved only after, exactly as Task 2 already plans. Either answer is fine; the answer is recorded, not assumed.

**The failure branch, for every task.** Any step failing STOPS the round: do not apply, do not move to the next migration, report to Mike with the exact error text and the step number. If `apply_migration` itself fails mid-file, the FIRST action before anything else is to read `pg_get_functiondef` and `proacl` for EVERY function in that file and state plainly which are the old definitions and which are the new, plus whether 0061's column exists; only then decide between re-applying and applying the file's own ROLLBACK BLOCK.

---

### Task 1: Move in the Pools drawn block (UI only, no migration)

**Files:**
- Modify: `public/app.js` (`mgPoolsSetupHTML` 11651, its `mgPoolTeamsBlockHTML(p, teams, null)` call at 11680; `mgPoolTeamsBlockHTML` 11750; `APP_VERSION` 34)
- Modify: `public/styles.css` (two rules beside `.pc-team[data-pc-open="1"]` at 5803-5804 and `.pc-team .pc-move` at 5830)
- Modify: `test/manage-round.test.js` (the UNDRAWN branch of `a pool that has played carries the locked line`, the `until C101 item 7` comment at :1739, plus a new describe)

**Interfaces:**
- Changes: `mgPoolTeamsBlockHTML(pool, teams, matches, pools)` gains a FOURTH argument `pools`, defaulting to `null`, so the block renders exactly as today when it is not passed. Its one caller is app.js:11680.
- Produces: no new function, no new module state, **no server guard**. `mgpMoveTeamId`, `mgPoolsMoveTeam`, `tdbMoveTeamToPool`, `manageNetsDirty` and the whole `mgtView === 'pools'` delegate branch (app.js:14124-14139) are UNCHANGED.

**Why it is safe by construction, not by a flag.** `buildMgPoolsHTML` (app.js:11634-11647) calls `mgPoolsSetupHTML` only when `poolMatches.length === 0`, so the Pools drawn block is reachable ONLY where the tournament has pools and zero `phase='pool'` matches. A move there is a bare `teams.pool_id` write with nothing to rebuild. The gate is the router. The server-side refusal arrives with Task 7 and not before, and that is a deliberate acceptance: a drawn-not-started tournament has no fixtures to corrupt.

- [ ] **Step 1: Write the failing tests** in `test/manage-round.test.js`. Append a new describe after `describe('Task 8 pool controls', ...)`. It uses the file's existing helpers verbatim: `seedPools`, `UNDRAWN`, `UNPLAYED`, `count`, `withDelegate` (:1548) and its `tap(attrs, value)`, and `bridge.buildMgPools({ ... })` / `bridge.mockPoolWrites` / `bridge.netsDirty` / `bridge.moveTeamId`.

```js
// C101 Task 1 (2026-08-25): Move gets a home in the PRE-START block. Reachable only from
// buildMgPoolsHTML's zero-pool-matches branch, so a move there is a bare teams.pool_id write with no
// fixtures to rebuild and no server guard yet - that arrives with 0064 in Task 7. Every case drives the
// real builder or the real click delegate (the 2026-08-03 inert-Undo lesson: a grep proves nothing about
// what a tap does).
describe('C101 Task 1 Move in the Pools drawn block', () => {
  it('renders one Move per team, inside a pc-card wrapper, with no lock line', () => {
    seedPools(bridge, { matches: UNDRAWN });
    const html = bridge.buildMgPools();
    expect(html).toContain('Pools drawn');
    expect(html).toContain('Start pool play');
    expect(count(html, 'data-pc-move=')).toBe(4);          // four teams across two pools
    expect(html).toContain('data-pc-move="t1"');
    expect(html).toContain('class="mgps-pteam"');           // the pre-start row class is unchanged
    expect(html).toContain('data-pc-card="p1"');            // the flash target mgPoolsMoveTeam looks for
    expect(html).toContain('data-pc-card="p2"');
    expect(html).not.toContain('pc-lock');                  // nothing is locked yet
    expect(html).not.toContain('pc-card"');                 // the controls-panel card is NOT drawn here
    expect(html).toContain('Move a team to another pool now. Once the schedule is drawn, teams stay put.');
    expect(html).not.toContain('—');
  });

  it('a one-pool draw renders no Move at all, because there is nowhere to move to', () => {
    seedPools(bridge, {
      pools: [{ id: 'p1', label: 'A' }],
      teams: [{ id: 't1', name: 'Dink Responsibly', pool_id: 'p1' }, { id: 't2', name: 'Sets and Reps', pool_id: 'p1' }],
      matches: UNDRAWN,
    });
    const html = bridge.buildMgPools();
    expect(html).toContain('data-mgps-team="t1"');          // the rows are all still there
    expect(html).not.toContain('data-pc-move=');
    expect(html).not.toContain('class="pc-pick"');
    const forced = bridge.buildMgPools({ moveTeam: 't1' }); // even with the module var naming a team
    expect(forced).not.toContain('data-pc-pick=');
  });

  it('a tap opens the picker: the other pools, a Cancel, and the team named', () => {
    seedPools(bridge, { matches: UNDRAWN });
    const open = bridge.buildMgPools({ moveTeam: 't1' });
    expect(open).toContain('data-pc-open="1"');
    expect(open).toContain('class="pc-pick"');
    expect(open).toContain('Move <b>Dink Responsibly</b> to &rarr;');
    expect(count(open, 'data-pc-pick=')).toBe(1);           // one other pool, so one button
    expect(open).toContain('data-pc-pick="t1:p2"');
    expect(open).not.toContain('data-pc-pick="t1:p1"');     // never its own pool
    expect(open).toContain('data-pc-cancel');
  });

  it('a real tap on Move opens it and a real tap on a pool calls moveTeamToPool with the pair', async () => {
    seedPools(bridge, { matches: UNDRAWN });
    bridge.buildMgPools();
    const m = bridge.mockPoolWrites({});
    try {
      const calls = await withDelegate(async (tap) => {
        tap(['data-pc-move', 'data-mgps-team'], 't1');       // the Move span sits INSIDE the team row
        expect(bridge.moveTeamId()).toBe('t1');
        expect(m.calls.some((c) => c[0] === 'sheet')).toBe(false); // never falls through to the team sheet
        tap('data-pc-pick', 't1:p2');
        await Promise.resolve();
        return m.calls.slice();
      });
      expect(calls).toContainEqual(['move', 't1', 'p2']);
    } finally { m.restore(); }
  });

  it('the poll guard treats the pre-start picker as unsaved work', () => {
    seedPools(bridge, { matches: UNDRAWN });
    bridge.buildMgPools();
    expect(bridge.netsDirty()).toBe(false);
    bridge.buildMgPools({ moveTeam: 't1' });
    expect(bridge.netsDirty()).toBe(true);
    bridge.buildMgPools();
    expect(bridge.netsDirty()).toBe(false);
  });

  it('the DRAWN block still renders no Move: this task moved nothing post-draw', () => {
    seedPools(bridge, { matches: UNPLAYED });
    const drawn = bridge.buildMgPools({ controls: true });
    expect(drawn).not.toContain('data-pc-move=');
    expect(drawn).toContain('The schedule is drawn, teams stay put.');
  });

  it('the two pre-start CSS rules ship once and add no !important', () => {
    expect(count(css, '.mgps-pteam .pc-move {')).toBe(1);
    expect(count(css, '.mgps-pteam[data-pc-open="1"] {')).toBe(1);
    const block = css.slice(css.indexOf('.mgps-pteam .pc-move {'), css.indexOf('.mgps-pteam .pc-move {') + 400);
    expect(block).not.toContain('!important');
  });
});
```

  Also EDIT the existing assertion and its comment together, at `test/manage-round.test.js:1738-1744` (the UNDRAWN branch of `a pool that has played carries the locked line`):

```js
    // undrawn: the page is the pre-start setup block (Pools drawn + Start pool play), which carries no
    // controls panel and no lock line. C101 Task 1 gave Move its safe home HERE: nothing is drawn, so a
    // pool_id write has no fixtures to rebuild.
    seedPools(bridge, { matches: UNDRAWN });
    const open = bridge.buildMgPools({ controls: true });
    expect(open).toContain('Start pool play');
    expect(open).not.toContain('pc-lock');
    expect(count(open, 'data-pc-move=')).toBe(4);
```

- [ ] **Step 2: Run to verify it fails.** `cd test && npx vitest run manage-round`.

- [ ] **Step 3: Implement `mgPoolTeamsBlockHTML`** (`public/app.js:11750`). The row markup and the picker are COPIED from `mgPoolCardHTML` (app.js:11866-11876), not reinvented.

```js
// One pool's teams (each tappable → the T6 openMgTeamSheet for move/edit). Serves the drawn-not-started
// step. (Round 2026-08-24: the expanded Pool controls used to share this too, with a `showEditNets` flag.
// They now render mgPoolCardHTML instead, so the flag and its Edit-nets button are gone.)
// C101 Task 1 (2026-08-25): the fourth argument. `pools` defaults to null, so every caller that does not
// pass it renders byte-identically to what this emitted before. When it IS passed, each row gains the
// SAME Move span and the SAME .pc-pick block the controls card draws, and the rows are wrapped in one
// [data-pc-card] so mgPoolsMoveTeam's destination flash has something to find (app.js:12365 queries it;
// without the wrapper mPlay(null, ...) returns and the move lands silently). This block is reachable ONLY
// from buildMgPoolsHTML's zero-pool-matches branch, so a move here has no fixtures to rebuild. The
// server-side refusal is 0064, Task 7, and not before.
function mgPoolTeamsBlockHTML(pool, teams, matches, pools) {
  const pid = String(pool.id);
  const label = pool.label || '';
  const mine = teams.filter((tm) => String(tm.pool_id || '') === pid);
  let sub = `Pool ${escapeHTML(label)}`;
  if (matches) {
    const nets = [...new Set(matches.filter((m) => m.pool_id === pool.id && m.net != null).map((m) => m.net))].sort((a, b) => a - b);
    if (nets.length) sub += ` · Net${nets.length > 1 ? 's' : ''} ${escapeHTML(formatNetList(nets))}`;
  }
  // A one-pool draw has nowhere to move a team TO, so Move is not offered at all (the fix-round-1 lesson
  // from mgPoolCardHTML: offering it there set mgpMoveTeamId, drew an empty picker with no Cancel, and
  // manageNetsDirty() then bailed every background sync until the panel was closed).
  const others = (pools || []).filter((p) => String(p.id) !== pid);
  const movable = others.length > 0;
  const rows = mine.length
    ? mine.map((tm) => {
      const tid = String(tm.id);
      const open = movable && mgpMoveTeamId === tm.id;
      const row = `<button type="button" class="mgps-pteam" data-mgps-team="${escapeHTMLText(tid)}"${open ? ' data-pc-open="1"' : ''}>`
        + `<span class="mgps-ptn">${escapeHTML(tm.name || 'Team')}</span>`
        + (movable ? `<span class="pc-move" data-pc-move="${escapeHTMLText(tid)}">Move</span>` : '')
        + MG_CHEV + `</button>`;
      if (!open) return row;
      return row + `<div class="pc-pick">`
        + `<span class="pc-pl">Move <b>${escapeHTML(tm.name || 'Team')}</b> to &rarr;</span>`
        + others.map((p) => `<button type="button" class="pc-pbtn" data-pc-pick="${escapeHTMLText(tid + ':' + String(p.id))}">Pool ${escapeHTML(p.label || '')}</button>`).join('')
        + `<button type="button" class="pc-pcancel" data-pc-cancel>Cancel</button>`
        + `</div>`;
    }).join('')
    : `<div class="mgps-note">No teams in this pool.</div>`;
  if (!pools) return `<div class="pl-sect">${sub}</div>${rows}`;
  return `<div class="pl-sect">${sub}</div><div data-pc-card="${escapeHTMLText(pid)}">${rows}</div>`;
}
```

- [ ] **Step 4: Implement the caller and the note** (`public/app.js:11678-11682`, the tail of `mgPoolsSetupHTML`). Pass `pools` and add the one `.mgps-note`:

```js
  return `<div class="pl-sect">Pools drawn</div>`
    + pools.map((p) => mgPoolTeamsBlockHTML(p, teams, null, pools)).join('')
    // C101 Task 1: no .pc-lock line here, because nothing is locked yet. This block only ever renders
    // where the tournament has zero pool matches (buildMgPoolsHTML:11646), so the sentence is true.
    + `<div class="mgps-note">Move a team to another pool now. Once the schedule is drawn, teams stay put.</div>`
    + `<button type="button" class="mgt-cta" data-mgps-start>Start pool play</button>`
    + `<button type="button" class="mgps-quiet" data-mgps-redraw>Draw again</button>`;
```

- [ ] **Step 5: CSS** (`public/styles.css`, CRLF). Insert immediately after `.pc-team .pc-move { ... }` at line 5830, so the pre-start rules sit beside the card rules they mirror:

```css
/* PORT NOTE, C101 Task 1 (2026-08-25): the PRE-START rows are .mgps-pteam (styles.css:2451), not
   .pc-team, so the two highlight rules above are scoped to the wrong class for the Pools drawn block.
   The .pc-move base rule (styles.css:5730) already applies anywhere; these two are the readability
   pair it needs. No new !important, no wildcard selectors. */
.mgps-pteam .pc-move { color: var(--accent); font-size: 12px; }
.mgps-pteam[data-pc-open="1"] { background: var(--accent-soft); }
```

- [ ] **Step 6: Version, checks, suite, commit.** Set `APP_VERSION = '2026.08.25.38'`; `node --check public/app.js`; `cd test && npx vitest run` gating on the RUNNER's exit code; confirm the CRLF count on `styles.css` is unchanged apart from the two added lines. Commit (do not push):

`feat(pools): Move gets a home in the Pools drawn block - the picker before the draw, where a pool_id write has nothing to rebuild - v2026.08.25.38`

---

### Task 2: `0059_profiles_email_sync.sql`

**Files:**
- Create: `db/migrations/0059_profiles_email_sync.sql`
- Modify: `test/account-round.test.js` (two source guards; the whole Task 5 describe at :1400-1749 stays green with ZERO edits, which is the tell that this shape is right)
- Modify: nothing in `public/app.js`. **There is no UI call site, and that is the whole value.**

**Interfaces:**
- Produces: `public.handle_user_email_change() returns trigger`, and the trigger `on_auth_user_email_changed` on `auth.users`.
- Writes: `profiles.id` and `profiles.email`, and nothing else. Returns `new`.
- Grants: EXECUTE revoked from `public, anon, authenticated`. A trigger function needs no grant.

- [ ] **Step 1: Write the file.** `db/migrations/0059_profiles_email_sync.sql`, LF:

```sql
-- 0059_profiles_email_sync.sql. A confirmed email change in auth.users lands in public.profiles.email.
--
-- WHY. profiles.email is written ONCE, by handle_new_user at signup (0033:11-23), and nothing has updated
-- it since. The account screen's Change email flow (Account round Task 5, app.js onAcctEmailSave) calls
-- auth.updateUser({ email }) and GoTrue writes the new address into auth.users when the link is tapped, so
-- from that moment profiles.email is the OLD address. Two live consequences: set_member_role (0051) resolves
-- an admin seat by `lower(profiles.email)`, so the seat lookup keeps matching an address the account no
-- longer has; and _audit_actor (0052) names the actor from profiles.email when there is no display_name, so
-- the activity log signs rows with a dead address.
--
-- A TRIGGER, NOT AN RPC. The RPC alternative would fire from onAuthEvent (app.js:7275), which returns early
-- when the event is not a new sign-in and a confirmed email change is the SAME user id, and it would need a
-- setTimeout(0) around the supabase-js auth lock. Two traps, zero benefit.
--
-- SECURITY DEFINER IS REQUIRED, NOT STYLISTIC. The trigger fires inside GoTrue's own transaction under a
-- role with no rights on public.profiles. handle_new_user (0033:11-23) is the shipped proof of the shape.
-- EXECUTE is revoked from every client role; a trigger function needs no grant.
--
-- AN UPSERT, NOT AN UPDATE. A bare `update ... where id = new.id` is a SILENT NO-OP for a user with no
-- profiles row, and such users exist: handle_new_user inserts `on conflict (id) do nothing`, so a signup
-- whose insert lost a race, or an account created before 0033's backfill and missed by it, has no row at
-- all. Their email change would appear to work and change nothing, which is exactly the failure this
-- migration ends. The upsert creates the row instead, carrying only id and email; display_name, first_name
-- and last_name stay null and the name-fill overlay asks for them the next time that person signs in.
--
-- GUARDS. `when (new.email is distinct from old.email)` is the storm guard, so every other auth.users update
-- is a no-op. `values (new.id, ...)` plus the primary-key conflict target is the containment: a cross-row
-- write is impossible even though DEFINER bypasses RLS (profiles carries only `profiles self read` and
-- `profiles self update`, 0033:25-26, and no INSERT policy). NO EXCEPTION, EVER: a raise here would fail the
-- user's own email change.
--
-- NO action_log ROW. This round's log rows are organizer actions in Manage, and inside a GoTrue transaction
-- the actor _audit_actor() would resolve is not established.
--
-- NOT TAKEN, deliberately: letting the client write its own profiles.email beside the name save
-- (app.js:7640). `profiles self update` has no `with check` and no column list, so it CAN, and that would
-- write the address BEFORE confirmation and contradict the account screen's promise "Until you tap it, sign
-- in with your old address."
--
-- STRUCTURALLY it touches public.profiles alone, so neither the June nor the August tournament is reachable.
-- BEFORE AND AFTER: the app is correct either way. Before, an email change simply leaves profiles.email
-- stale exactly as it does today; after, it is corrected on confirmation. No client code reads or writes
-- this path, so there is no half-deployed state to design for. The backfill at the end of this file is a
-- one-time correction of rows that are already wrong; it is NOT reversible and the rollback block says so.
--
-- =====================================================================================================
-- ROLLBACK BLOCK (verbatim prior definitions + re-grants, apply this whole block to undo 0059)
-- =====================================================================================================
/*
drop trigger if exists on_auth_user_email_changed on auth.users;
drop function if exists public.handle_user_email_change();
-- NOTE: the backfill below is NOT undone by this block. It set profiles.email to the address the account
-- actually has; there is no prior value worth restoring and no record of one.
*/
-- =====================================================================================================
-- END ROLLBACK BLOCK
-- =====================================================================================================
--
-- NOT APPLIED
begin;

create or replace function public.handle_user_email_change()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $fn$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
    on conflict (id) do update set email = excluded.email;
  return new;
end $fn$;

revoke all on function public.handle_user_email_change() from public, anon, authenticated;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (new.email is distinct from old.email)
  execute function public.handle_user_email_change();

-- One-time correction of the rows this migration exists to stop producing.
update public.profiles p set email = u.email
  from auth.users u where u.id = p.id and p.email is distinct from u.email;

commit;
```

- [ ] **Step 2 (CONTROLLER): the rolled-back harness.** ONE `execute_sql` batch. The file's own `begin;`/`commit;` are STRIPPED (gate step 2: Postgres does not nest transactions, so an inner `commit` inside `begin ... rollback` COMMITS the DDL and the rollback then has nothing to undo. This is the single step that decides whether the round is reversible).

```sql
begin;
  create temp table t_out(name text, ok boolean, got text);
  -- the real owner's uuid, so is_organizer / is_owner resolve without touching auth.users
  create temp table t_who as
    select profile_id as uid from public.memberships
     where community_id = '2c3bcfa9-305e-448b-924b-da90c029f575' and role = 'owner' limit 1;

  -- ---- the migration's DDL, begin;/commit; stripped ----
  create or replace function public.handle_user_email_change()
   returns trigger language plpgsql security definer set search_path to 'public'
  as $fn$
  begin
    insert into public.profiles (id, email) values (new.id, new.email)
      on conflict (id) do update set email = excluded.email;
    return new;
  end $fn$;
  revoke all on function public.handle_user_email_change() from public, anon, authenticated;
  -- ---- end DDL (the TRIGGER and the backfill are deliberately NOT run here: the trigger's create is
  -- ---- proved post-apply per gate step 6, and the backfill would touch real rows) ----

  -- The function body is provable directly, because a trigger function is callable with a synthetic NEW
  -- only from a trigger. So the body's STATEMENT is proved instead, verbatim, against two fixtures.
  do $h$
  declare v_uid uuid := (select uid from t_who); v_before text; v_after text;
  begin
    -- case 1: the profile row EXISTS -> the address is updated in place, nothing else moves
    select email into v_before from public.profiles where id = v_uid;
    insert into public.profiles (id, email) values (v_uid, 'c101-harness@example.test')
      on conflict (id) do update set email = excluded.email;
    select email into v_after from public.profiles where id = v_uid;
    insert into t_out values ('existing profile: email replaced',
      v_after = 'c101-harness@example.test' and v_before is distinct from v_after, coalesce(v_after,'<null>'));
    insert into t_out
      select 'existing profile: display_name untouched', display_name is not distinct from
             (select display_name from public.profiles where id = v_uid), coalesce(display_name,'<null>')
        from public.profiles where id = v_uid;
    insert into t_out
      select 'existing profile: exactly one row for that id', count(*) = 1, count(*)::text
        from public.profiles where id = v_uid;
  exception when others then
    insert into t_out values ('existing profile: email replaced', false, sqlstate || ' ' || sqlerrm);
  end $h$;

  do $h$
  declare v_new uuid := '0159c101-0000-4000-8000-000000000001';
  begin
    -- case 2: NO profile row -> the upsert CREATES it (the whole reason this is not a bare update).
    -- profiles.id references auth.users(id), so this insert is expected to be REFUSED here; the
    -- assertion is that the refusal is the FK and not a logic error, and the create path is proved
    -- post-apply on a real confirmed change.
    insert into public.profiles (id, email) values (v_new, 'c101-new@example.test')
      on conflict (id) do update set email = excluded.email;
    insert into t_out values ('absent profile: upsert inserted', true,
      (select count(*)::text from public.profiles where id = v_new));
  exception when others then
    insert into t_out values ('absent profile: upsert reached the FK, not a logic error',
      sqlstate = '23503', sqlstate || ' ' || sqlerrm);
  end $h$;

  do $h$
  begin
    -- the storm guard is a WHEN clause on the trigger, so it is asserted as SQL truth, not as behaviour
    insert into t_out values ('storm guard: identical addresses are distinct-from false',
      not ('a@b.c'::text is distinct from 'a@b.c'::text), 'is distinct from');
    insert into t_out values ('storm guard: null to an address IS distinct',
      (null::text is distinct from 'a@b.c'::text), 'is distinct from');
  end $h$;

  do $h$
  declare v_acl text;
  begin
    select coalesce(p.proacl::text, '<null>') into v_acl from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'handle_user_email_change';
    insert into t_out values ('no client role holds EXECUTE',
      v_acl = '<null>' or (v_acl not like '%anon=%' and v_acl not like '%authenticated=%' and v_acl not like '%=X/%'), v_acl);
  end $h$;

select * from t_out;
rollback;
```

  **Expected:** every `ok` true. `absent profile: upsert reached the FK, not a logic error` returning `23503` is a PASS and is the recorded answer to "the upsert path cannot be fully proved before the apply". If P9 came back true, add one more `do` block that updates a real `auth.users` row's email and asserts `profiles.email` followed, then let the rollback undo it.

- [ ] **Step 3 (CONTROLLER): the residue probes.** SEPARATE calls, after the rollback:
```sql
select to_regprocedure('public.handle_user_email_change()') as fn;                 -- expect null
select count(*) as trg from pg_trigger where tgname = 'on_auth_user_email_changed'; -- expect 0
```

- [ ] **Step 4 (CONTROLLER): apply.** `apply_migration` with name `0059_profiles_email_sync` and the file's full body. Then the post-apply checks, each its own `execute_sql`:
```sql
select pg_get_functiondef(p.oid) as def, coalesce(p.proacl::text,'<null>') as acl
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'handle_user_email_change';
```
Diff `def` against the file verbatim; `acl` must show no `anon=`, no `authenticated=` and no leading PUBLIC `=X/` entry.
```sql
select t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) as def
  from pg_trigger t where t.tgname = 'on_auth_user_email_changed';
```
`def` must carry `AFTER UPDATE OF email ON auth.users` and the `WHEN ((new.email IS DISTINCT FROM old.email))` clause.
```sql
select count(*) filter (where p.id is null) as accounts_with_no_profile,
       count(*) filter (where p.id is not null and p.email is distinct from u.email) as stale_emails
  from auth.users u left join public.profiles p on p.id = u.id;
```
`stale_emails` must be 0 (the backfill ran). Then `get_advisors(security)` (zero NEW findings against P3) and the P2 count query (every number unmoved except `profiles`, which may rise only if P7 reported accounts with no profile row and only by that number). **No anon REST probe here:** this function is not an RPC and is reachable from no REST path, which is the point of revoking EXECUTE from every client role.

- [ ] **Step 5: the two source guards** in `test/account-round.test.js`, in the genre of `test/tournament-round.test.js:273-279` (slice the function out of the source, assert on the slice, never on the whole file). Append to the file's existing `describe('Account round Task 5 - Change email and the pending screen', ...)` block:

```js
  // C101 Task 2 / migration 0059: the sync is a TRIGGER on auth.users, so the client writes nothing. The
  // tell that this shape is right is ZERO churn in this suite: every case above stays green untouched.
  // These two pin the absence, because an absence is exactly what a later edit deletes by accident.
  it('onAuthEvent writes no profiles row of its own', () => {
    const start = appSrc.indexOf('async function onAuthEvent(');
    expect(start).toBeGreaterThan(-1);
    const fn = appSrc.slice(start, appSrc.indexOf('\nasync function ', start + 10));
    expect(fn).not.toContain("from('profiles')");
    expect(fn).not.toContain('profiles');
  });

  it('a TOKEN_REFRESHED event produces zero supabase calls', async () => {
    bridge.reset();
    bridge.setSession({ user: { id: 'u1', email: 'm@work.com', email_confirmed_at: '2026-01-01T00:00:00Z' } });
    await bridge.authEvent('TOKEN_REFRESHED', bridge.sessionNow());
    expect(bridge.supaCalls().length).toBe(0);
  });
```
  If `bridge.authEvent` / `bridge.setSession` / `bridge.sessionNow` are not already on that file's bridge, add them beside the existing keys as one-liners (`authEvent: (e, s) => onAuthEvent(e, s)`, `setSession: (s) => { state.authSession = s; }`, `sessionNow: () => state.authSession`) without renaming any existing key.

- [ ] **Step 6: Suite and commit.** `cd test && npx vitest run` on the runner's exit code. No `APP_VERSION` bump: this task ships no `public/` change. Commit (do not push):

`feat(db): 0059 profiles email sync - a DEFINER trigger on auth.users upserts profiles.email on a confirmed change, plus the two source guards that keep the client out of it`

- [ ] **Step 7 (CONTROLLER): mark it applied.** Replace `-- NOT APPLIED` with `-- APPLIED <date> via the Supabase MCP on Mike's word (C101 Task 2): trigger def and WHEN clause read back, EXECUTE held by no client role, stale_emails 0.` Commit that line alone:

`chore(db): 0059 applied`

- [ ] **Step 8: the end-to-end read-back, on Mike's word.** He changes one address end to end in the app, then the controller runs `select p.email as profile_email, u.email as auth_email from public.profiles p join auth.users u on u.id = p.id where p.id = '<uid>';` and the two match.

---

### Task 3: `0060_set_team_paid.sql`

**Files:**
- Create: `db/migrations/0060_set_team_paid.sql`
- Modify: `public/app.js` (`tdbSetTeamPaid` 2177-2181; `mgTeamTogglePaid` 11185-11209; `mgTeamAddSubmit`'s paid branch 11426-11433; the team sheet's `paid` role 11528-11534 through `mgtsWrite`; the popup note and its comment block 11592-11599; `APP_VERSION`)
- Modify: `test/team-payment-popup.test.js` (the fake DB's `rpc`; :154-165; :290-296), `test/supabase-writes.test.js` (`MUTATING_RPCS` :29-33), `test/manage-round.test.js` (the comment above :1035)

**Interfaces:**
- Produces: `public.set_team_paid(p_team uuid, p_paid boolean) returns public.teams`.
- Changes: `tdbSetTeamPaid(teamId, paid)` now RETURNS the updated team row. Three call sites move with it.
- Grants: `revoke all ... from public, anon;` then `grant execute ... to authenticated;`.

- [ ] **Step 1: Write the file.** `db/migrations/0060_set_team_paid.sql`, LF:

```sql
-- 0060_set_team_paid.sql. Marking a team paid becomes one DEFINER call that also writes the audit row.
--
-- WHY. The team payment popup (app.js buildMgTeamPayModalHTML) had to ship the sentence "Every admin sees
-- this straight away." instead of the handoff's "Logged in the activity log with your name.", because paid
-- rides tdbSetTeamPaid, a bare `from('teams').update({ paid })`, and action_log has RLS enabled with ZERO
-- policies (0002:15-22, 0008): no client role can insert it. The only write door is a SECURITY DEFINER
-- function. This is that function, and it makes the handoff's sentence true.
--
-- DEFINER IS NOT OPTIONAL, for exactly that reason. teams.community_id is NOT NULL with a default (0035),
-- so the guard cannot be skipped by a null community.
--
-- GUARDS, in body order: the team exists, then organizer or owner (the 0056:33-35 idiom verbatim, raising
-- 42501). NOTHING ELSE, DELIBERATELY: a completed tournament does NOT refuse a payment change, because paid
-- is a money fact and not a result. Mike reconciles $80 a team after the event. Do not "fix" this later.
--
-- RETURNS public.teams, so mgTeamTogglePaid verifies from the RETURNED row instead of proving the write by
-- re-reading the whole tournament. The refresh stays, for the rest of the page; it stops being the proof.
--
-- THE action_log ROW: action='set_team_paid', entity_type='team', entity_id = the team id, detail =
-- 'marked Sand Sharks paid' or 'marked Sand Sharks unpaid'. The `prose` column does not exist yet at this
-- migration; 0061 rewrites this function to write the same sentence into prose as well. Between the two the
-- log reads `set_team_paid · marked Sand Sharks paid`, which is honest.
--
-- NOT TAKEN: routing public self-registration's p_paid (register_team, 0054:75-77) through here. That path
-- is anon-granted by design and its logging belongs to 0061.
--
-- STRUCTURALLY it reaches teams and action_log only. No match row, no pool row, no tournament row: neither
-- the June schedule nor the August bracket is reachable from this function at all.
--
-- BEFORE AND AFTER. Before the apply the client's rpc call fails with an RPC-not-found error, which
-- mgTeamTogglePaid surfaces through appNotice and which NEVER falls back to the direct teams update (the
-- fallback would only fail less honestly and would leave no log row). After the apply both doors work; the
-- direct update is removed from app.js in the same task, so there is exactly one door.
--
-- =====================================================================================================
-- ROLLBACK BLOCK (verbatim prior definitions + re-grants, apply this whole block to undo 0060)
-- =====================================================================================================
/*
drop function if exists public.set_team_paid(uuid, boolean);
-- There is no prior definition: this function is new in 0060. The client's pre-0060 write door was
-- `supabaseClient.from('teams').update({ paid }).eq('id', teamId)`, which needs no migration to restore.
*/
-- =====================================================================================================
-- END ROLLBACK BLOCK
-- =====================================================================================================
--
-- NOT APPLIED
begin;

create or replace function public.set_team_paid(p_team uuid, p_paid boolean)
 returns public.teams
 language plpgsql
 security definer
 set search_path to 'public'
as $fn$
declare v_comm uuid; v_name text; updated public.teams; v_actor text; v_role text; v_grp text;
begin
  select t.community_id, t.name into v_comm, v_name from public.teams t where t.id = p_team;
  if v_comm is null then raise exception 'That team is not here any more.'; end if;
  if not (public.is_organizer(v_comm) or public.is_owner(v_comm)) then
    raise exception 'Only an organizer can change a payment' using errcode = '42501';
  end if;
  update public.teams set paid = coalesce(p_paid, false) where id = p_team returning * into updated;
  select a.actor, a.role, a.grp into v_actor, v_role, v_grp from public._audit_actor() a;
  insert into public.action_log(actor, role, grp, action, entity_type, entity_id, detail)
    values (v_actor, coalesce(v_role,'admin'), v_grp, 'set_team_paid', 'team', p_team::text,
            case when coalesce(p_paid,false) then 'marked ' || v_name || ' paid'
                 else 'marked ' || v_name || ' unpaid' end);
  return updated;
end $fn$;

revoke all on function public.set_team_paid(uuid, boolean) from public, anon;
grant execute on function public.set_team_paid(uuid, boolean) to authenticated;

commit;
```

- [ ] **Step 2 (CONTROLLER): the rolled-back harness.** ONE `execute_sql` batch, the file's `begin;`/`commit;` stripped:

```sql
begin;
  create temp table t_out(name text, ok boolean, got text);
  create temp table t_who as
    select profile_id as uid from public.memberships
     where community_id = '2c3bcfa9-305e-448b-924b-da90c029f575' and role = 'owner' limit 1;

  -- throwaway fixture, never June's ids and never August's
  insert into public.tournaments (id, name, community_id, status)
    values ('c1010000-0000-4000-8000-000000000001', 'C101 harness',
            '2c3bcfa9-305e-448b-924b-da90c029f575', 'setup');
  insert into public.teams (id, tournament_id, name, community_id, paid)
    values ('c1010000-0000-4000-8000-000000000011', 'c1010000-0000-4000-8000-000000000001',
            'Sand Sharks', '2c3bcfa9-305e-448b-924b-da90c029f575', false);

  -- ---- the migration's DDL, begin;/commit; stripped ----
  create or replace function public.set_team_paid(p_team uuid, p_paid boolean)
   returns public.teams language plpgsql security definer set search_path to 'public'
  as $fn$
  declare v_comm uuid; v_name text; updated public.teams; v_actor text; v_role text; v_grp text;
  begin
    select t.community_id, t.name into v_comm, v_name from public.teams t where t.id = p_team;
    if v_comm is null then raise exception 'That team is not here any more.'; end if;
    if not (public.is_organizer(v_comm) or public.is_owner(v_comm)) then
      raise exception 'Only an organizer can change a payment' using errcode = '42501';
    end if;
    update public.teams set paid = coalesce(p_paid, false) where id = p_team returning * into updated;
    select a.actor, a.role, a.grp into v_actor, v_role, v_grp from public._audit_actor() a;
    insert into public.action_log(actor, role, grp, action, entity_type, entity_id, detail)
      values (v_actor, coalesce(v_role,'admin'), v_grp, 'set_team_paid', 'team', p_team::text,
              case when coalesce(p_paid,false) then 'marked ' || v_name || ' paid'
                   else 'marked ' || v_name || ' unpaid' end);
    return updated;
  end $fn$;
  revoke all on function public.set_team_paid(uuid, boolean) from public, anon;
  grant execute on function public.set_team_paid(uuid, boolean) to authenticated;
  -- ---- end DDL ----

  -- 1. a NO-MEMBERSHIP caller: 42501 AND the exact message, and nothing written
  do $h$
  declare r public.teams; v_before int;
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', '00000000-0000-4000-8000-0000000000ff')::text, true);
    select count(*) into v_before from public.action_log;
    begin
      select * into r from public.set_team_paid('c1010000-0000-4000-8000-000000000011', true);
      insert into t_out values ('no-membership caller is refused', false, 'it returned a row');
    exception when others then
      insert into t_out values ('no-membership caller is refused',
        sqlstate = '42501' and sqlerrm = 'Only an organizer can change a payment', sqlstate || ' ' || sqlerrm);
    end;
    insert into t_out
      select 'refused call wrote no team change', paid = false, paid::text
        from public.teams where id = 'c1010000-0000-4000-8000-000000000011';
    insert into t_out select 'refused call wrote no log row', count(*) = v_before, count(*)::text
      from public.action_log;
  end $h$;

  -- 2. an ORGANIZER: the returned row carries the new flag, and exactly one log row appears with the
  --    team NAME in it and the organizer's own name as actor
  do $h$
  declare r public.teams; v_actor text; v_detail text; v_n int;
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', (select uid from t_who))::text, true);
    select * into r from public.set_team_paid('c1010000-0000-4000-8000-000000000011', true);
    insert into t_out values ('organizer: returned row carries the new flag', r.paid = true, r.paid::text);
    insert into t_out values ('organizer: the stored row moved too',
      (select paid from public.teams where id = 'c1010000-0000-4000-8000-000000000011'), 'teams.paid');
    select count(*), max(actor), max(detail) into v_n, v_actor, v_detail from public.action_log
     where entity_id = 'c1010000-0000-4000-8000-000000000011' and action = 'set_team_paid';
    insert into t_out values ('exactly one log row', v_n = 1, v_n::text);
    insert into t_out values ('the log row carries the team NAME', v_detail = 'marked Sand Sharks paid', coalesce(v_detail,'<null>'));
    insert into t_out values ('the log row is signed by the organizer, not anon', v_actor is distinct from 'anon', coalesce(v_actor,'<null>'));
  exception when others then
    insert into t_out values ('organizer: returned row carries the new flag', false, sqlstate || ' ' || sqlerrm);
  end $h$;

  -- 3. UNPAID writes the other sentence
  do $h$
  declare r public.teams; v_detail text;
  begin
    select * into r from public.set_team_paid('c1010000-0000-4000-8000-000000000011', false);
    select detail into v_detail from public.action_log
     where entity_id = 'c1010000-0000-4000-8000-000000000011' order by at desc limit 1;
    insert into t_out values ('unpaid: the row and the sentence both flip',
      r.paid = false and v_detail = 'marked Sand Sharks unpaid', coalesce(v_detail,'<null>'));
  exception when others then
    insert into t_out values ('unpaid: the row and the sentence both flip', false, sqlstate || ' ' || sqlerrm);
  end $h$;

  -- 4. an UNKNOWN id raises the missing-team sentence, not a null-guard crash
  do $h$
  declare r public.teams;
  begin
    select * into r from public.set_team_paid('c1010000-0000-4000-8000-0000000000ee', true);
    insert into t_out values ('unknown id is refused', false, 'it returned a row');
  exception when others then
    insert into t_out values ('unknown id is refused',
      sqlerrm = 'That team is not here any more.', sqlstate || ' ' || sqlerrm);
  end $h$;

  -- 5. a completed tournament is NOT refused: paid is a money fact, not a result
  do $h$
  declare r public.teams;
  begin
    update public.tournaments set status = 'completed' where id = 'c1010000-0000-4000-8000-000000000001';
    select * into r from public.set_team_paid('c1010000-0000-4000-8000-000000000011', true);
    insert into t_out values ('a completed tournament still accepts a payment change', r.paid = true, r.paid::text);
  exception when others then
    insert into t_out values ('a completed tournament still accepts a payment change', false, sqlstate || ' ' || sqlerrm);
  end $h$;

select * from t_out;
rollback;
```

  **Expected messages, verbatim:** `Only an organizer can change a payment` (SQLSTATE 42501) and `That team is not here any more.`

- [ ] **Step 3 (CONTROLLER): the residue probes.** SEPARATE calls, after the rollback:
```sql
select to_regprocedure('public.set_team_paid(uuid, boolean)') as fn;   -- expect null
select count(*) as rows_left from public.tournaments where id = 'c1010000-0000-4000-8000-000000000001'; -- expect 0
```

- [ ] **Step 4 (CONTROLLER): apply.** `apply_migration` named `0060_set_team_paid`. Post-apply, each its own call:
```sql
select pg_get_functiondef(p.oid) as def, coalesce(p.proacl::text,'<null>') as acl
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'set_team_paid';
```
`def` diffed against the file verbatim; `acl` must contain `authenticated=X/` and MUST NOT contain `anon=` or a leading `=X/` PUBLIC entry. Then `get_advisors(security)` (zero NEW against P3) and the P2 count query (every number unmoved). Then ONE real anon REST call, expecting a permission error and never a success, with the key read from the file and never echoed:
```bash
KEY=$(node -e "const s=require('fs').readFileSync('public/supabase-config.js','utf8');console.log(/const SUPABASE_KEY = '([^']+)'/.exec(s)[1])")
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  'https://mlzblkzflgylnjorgjcp.supabase.co/rest/v1/rpc/set_team_paid' \
  -H "apikey: $KEY" -H "Content-Type: application/json" \
  -d '{"p_team":"00000000-0000-4000-8000-000000000000","p_paid":true}'
```
Expect `404` or `403`. A `200` STOPS the round: the revoke did not take, and the first thing to read is `proacl` for a surviving PUBLIC entry.

- [ ] **Step 5: `tdbSetTeamPaid`** (`public/app.js:2177-2181`). Replace the whole function:

```js
// Admin: mark a registered team paid / unpaid. C101 Task 3 / migration 0060: this was a bare
// `from('teams').update({ paid })`, which could never leave an audit row (action_log has RLS on and zero
// policies, 0002/0008) and could never prove itself (RLS on teams is a row FILTER, so a session that has
// drifted off organizer membership gets error:null over zero rows). The DEFINER RPC does both: it writes
// the flag and the action_log row in ONE call and RETURNS the team row, so the caller repaints off server
// truth instead of re-reading the whole tournament to find out what happened.
async function tdbSetTeamPaid(teamId, paid) {
  if (!supabaseClient || !teamId) throw new Error('No team.');
  const { data, error } = await supabaseClient.rpc('set_team_paid', { p_team: teamId, p_paid: !!paid });
  if (error) { console.error('tdbSetTeamPaid', error); throw error; }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !row.id) throw new Error('That did not save. Check you are signed in as an admin, then try again.');
  return row;
}
```

- [ ] **Step 6: the three call sites.**

  (a) `mgTeamTogglePaid` (`public/app.js:11185-11209`) verifies from the RETURNED row; the refresh stays, for the rest of the page, and stops being the proof:

```js
async function mgTeamTogglePaid(teamId, btnEl) {
  if (!state.isAdmin || !teamId) return;
  const team = mgFindTeam(teamId);
  if (!team) return;
  const next = !team.paid;
  const label = () => (mgFindTeam(teamId) || team).paid ? 'Mark as unpaid' : 'Mark as paid';
  if (btnEl) { btnEl.disabled = true; btnEl.textContent = next ? 'Marking as paid…' : 'Marking as unpaid…'; }
  // C101 Task 3: the RPC RETURNS the row it wrote, so `row` is the proof. The refresh that follows is for
  // the rest of the page (the list row's .mgv-pmeta, the "2 in · 1 paid" line), not for this decision.
  let row;
  try {
    row = await tdbSetTeamPaid(teamId, next);
  } catch (err) {
    if (btnEl) { btnEl.disabled = false; btnEl.textContent = label(); }
    appNotice({ title: 'Could not save that', message: (err && err.message) || 'Try again.' });
    return;
  }
  if (!!row.paid !== next) {
    if (btnEl) { btnEl.disabled = false; btnEl.textContent = label(); }
    appNotice({ title: 'That did not save', message: 'The change did not go through. Check you are signed in as an admin, then try again.' });
    return;
  }
  try { await tdbRefreshTournaments(); } catch (_) { /* the returned row already proved the write */ }
  const fresh = mgFindTeam(teamId) || row;
  const modal = document.getElementById('team-pay-modal');
  if (modal) modal.innerHTML = buildMgTeamPayModalHTML(fresh);
  repaintManage();
}
```

  (b) admin Add-a-team (`public/app.js:11426-11433`, inside `mgTeamAddSubmit`). The copy in front of the RPC's message stays and the RPC's message is swallowed there, deliberately, because the team DID register and the notice must not read as a failed registration. No code change beyond the comment, since `tdbSetTeamPaid` still throws on failure:

```js
    if (paid) {
      try {
        // C101 Task 3: this now goes through set_team_paid (0060), so ticking paid on Add-a-team DOES
        // leave an activity-log row. The RPC's own message is swallowed here on purpose: the team
        // registered, and this notice must not read as a failed registration.
        await tdbSetTeamPaid(team.id, true);
      } catch (err) {
        note('The team is in, but it could not be marked paid. Open it under Teams & payment.', true);
        await tdbRefreshTournaments();
        return;
      }
    }
```

  (c) the body-level team sheet switch (`public/app.js:11528-11534`), through `mgtsWrite`. No change to the call, one comment so the next reader knows which door it is:

```js
    if (role === 'paid') {
      const on = !r.classList.contains('on');
      r.classList.toggle('on', on);
      r.setAttribute('aria-checked', on ? 'true' : 'false');
      void mgtsWrite(() => tdbSetTeamPaid(teamId, on));   // C101 Task 3: the 0060 RPC, log row included
      return;
    }
```

  **A fourth paid path does NOT change:** public self-registration through `tdbRegisterTeam` and `register_team`'s `p_paid` (0054:75-77). Its logging belongs to Task 4.

- [ ] **Step 7: the popup copy** (`public/app.js:11592-11599`). Replace the whole comment block AND the note in one edit:

```js
      // C101 Task 3 / migration 0060: paid now rides set_team_paid, a SECURITY DEFINER RPC that writes
      // teams and action_log in one call, so the handoff's sentence is true and comes back.
      + `<div class="mgv-tnote">Logged in the activity log with your name.</div>`
```

- [ ] **Step 8: the tests.**

  (a) `test/team-payment-popup.test.js`: the fake DB's `rpc` is a stub that returns `{ data: null, error: null }` and mutates nothing, so it cannot serve a read-back. Upgrade it in `makeDb` (the `rpc:` line at :48), keeping the `rpcs` recorder every existing case reads:

```js
    rpc: async (name, args) => {
      rpcs.push({ name, args });
      // C101 Task 3: set_team_paid is a real write door now, so the fake DB has to BE one - the read-back
      // only means something if the read sees what the write did. denyWrites keeps its meaning: the
      // statement matches zero rows and still comes back error:null.
      if (name === 'set_team_paid') {
        const row = (tables.teams || []).find((t) => t.id === args.p_team);
        if (!row) return { data: null, error: { message: 'That team is not here any more.' } };
        writes.push({ table: 'teams', op: 'rpc:set_team_paid', payload: { paid: !!args.p_paid }, filters: [['id', args.p_team]] });
        if (!denyWrites) row.paid = !!args.p_paid;
        return { data: denyWrites ? null : { ...row }, error: null };
      }
      return { data: null, error: null };
    },
```

  Rewrite `:154-165` (`writes paid on that team only, through the shipped teams update`) as:

```js
  // C101 Task 3 / migration 0060 FLIPS this: paid was a bare `from('teams').update({ paid })`, which
  // could never leave an audit row (action_log has RLS on and zero policies). It is now one DEFINER RPC
  // that writes the flag AND the log row and hands the row back.
  it('writes paid on that team only, through the set_team_paid RPC', async () => {
    const { bridge, tables, writes, rpcs } = loadApp();
    await bridge.boot('setup');
    await bridge.pay('team-sharks');
    expect(writes.filter((x) => x.op === 'update' && x.table === 'teams').length).toBe(0); // the old door is gone
    expect(rpcs.filter((r) => r.name === 'set_team_paid').length).toBe(1);
    expect(rpcs.find((r) => r.name === 'set_team_paid').args).toEqual({ p_team: 'team-sharks', p_paid: true });
    expect(tables.teams.find((t) => t.id === 'team-sharks').paid).toBe(true);
    expect(tables.teams.find((t) => t.id === 'team-gains').paid).toBe(true); // untouched
  });

  it('repaints the popup and the list row off the RETURNED row, not off a re-read', async () => {
    const { bridge } = loadApp();
    await bridge.boot('setup');
    await bridge.pay('team-sharks');
    const after = bridge.popup('team-sharks');
    expect(after).toContain('mgv-pmeta is-paid');
    expect(after).toContain('>Mark as unpaid<');
  });

  it('a silently refused RPC restores the button and says so, and never reports Paid', async () => {
    const { bridge, tables } = loadApp({ denyWrites: true });
    await bridge.boot('setup');
    await bridge.pay('team-sharks');
    expect(tables.teams.find((t) => t.id === 'team-sharks').paid).toBe(false);
    expect(bridge.said().join(' ')).toMatch(/did not save|Could not save/i);
    expect(bridge.popup('team-sharks')).toContain('mgv-pmeta is-unpaid');
  });

  it('the direct paid door is gone from the source entirely', () => {
    const src = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
    expect(src).not.toContain("from('teams').update({ paid");
    expect(src).not.toContain('from(\'teams\').update({ paid:');
    expect(src).toContain("rpc('set_team_paid'");
  });
```

  Rewrite `:290-296` (`does not claim an activity-log entry it does not write`):

```js
  // C101 Task 3 / migration 0060 FLIPS this: set_team_paid writes teams AND action_log in one DEFINER
  // call, so the popup may claim the entry now, and the handoff's own sentence comes back.
  it('claims the activity-log entry it now really writes', async () => {
    const { bridge } = loadApp();
    await bridge.boot('setup');
    const popup = bridge.popup('team-sharks');
    expect(popup).toContain('Logged in the activity log with your name.');
    expect(popup).not.toContain('Every admin sees this straight away.');
    expect(popup).not.toContain('—');
  });
```

  (b) `test/supabase-writes.test.js:29-33`: add the name to `MUTATING_RPCS`:

```js
const MUTATING_RPCS = [
  'check_in', 'check_out', 'register_player', 'register_team', 'submit_match_score',
  'generate_bracket_atomic', 'clear_bracket_atomic', 'start_new_session',
  'set_team_paid',            // C101 Task 3, migration 0060
  // log_copilot_action intentionally omitted: best-effort audit log. (Its em dash is fixed here as a
  // free rider, since this array is the line being edited and the round's copy law bans the character.)
];
```

  (c) `test/manage-round.test.js`, the comment above the `expect(html).not.toMatch(/activity log/i);` at :1035. The literal stays green because the FORM's copy is not edited; the CLAIM behind it changed:

```js
    // C101 Task 3 / migration 0060: the FORM still says nothing about the activity log, and that is what
    // this line pins. What changed is the claim behind it: ticking paid on Add-a-team now DOES write a log
    // row, through tdbSetTeamPaid at the paid branch of mgTeamAddSubmit. If Mike ever wants the screen to
    // say so, the honest sentence is that the PAYMENT is logged and the registration is not, because
    // tdbAddTeam's insert is still a direct write (spec: "the four direct-write doors").
    expect(html).not.toMatch(/activity log/i);
```

- [ ] **Step 9: Version, checks, suite, commit.** `APP_VERSION` = the next unused `'2026.08.25.N'` when dispatched (grep the current value first). `node --check public/app.js`; `cd test && npx vitest run` on the runner's exit code. Commit (do not push):

`feat(payments): 0060 set_team_paid - one DEFINER call writes the flag and the audit row, three call sites move to it, and the popup can tell the truth again - v2026.08.25.N`

- [ ] **Step 10 (CONTROLLER): mark it applied.** Replace `-- NOT APPLIED` with the `APPLIED <date> via the Supabase MCP on Mike's word (C101 Task 3)` line plus the one-line read-back, and commit it alone: `chore(db): 0060 applied`.

---

### Task 4: `0061_action_log_prose.sql`

**Files:**
- Create: `db/migrations/0061_action_log_prose.sql`
- Modify: `test/manage-page.test.js` (the `buildMgLogHTML` describe at :1828-1874, reshaped rather than deleted)
- Modify: nothing in `public/app.js`. `buildMgLogHTML` (app.js:8882-8908) already prints `summary` verbatim and escaped, which is the point of writing prose at write time.

**Interfaces:**
- Produces: `action_log.prose text`, and six `create or replace`s that keep every signature, DEFINER, `search_path`, guard, body and grant: `read_action_log(int)` (the summary expression only), plus the five writers `draw_pools_atomic(uuid, jsonb, jsonb)`, `start_pool_play_atomic(uuid, jsonb)`, `register_team(uuid, text, jsonb, text, boolean)`, `set_member_role(text, public.community_role)` and `set_team_paid(uuid, boolean)`.
- **Only `set_team_paid` writes an `action_log` row today.** `register_team` writes none in any of its five generations (0024, 0028, 0029, 0042, 0054:46-81), and neither does `draw_pools_atomic`, `start_pool_play_atomic` or `set_member_role` (0051:36-72). So four of the five gain a WHOLE insert, not a column.
- **Prose is a PREDICATE, not a sentence with a subject.** `buildMgLogHTML` renders `<b>{actor}</b> {summary}` with both escaped and the actor falling back to "Someone" (app.js:8894, 8903-8904). Prose that repeats the actor renders "Mikey Mikey moved Net Gains"; prose carrying `<b>` renders literal angle brackets. Lowercase verb, no actor, no markup, no final period. The shipped fixture `{ actor: 'Mikey', summary: 'closed registration' }` is the shape, and this migration makes it real.

| Function (signature unchanged) | `action` / `entity_type` | `detail` | `prose` |
|---|---|---|---|
| `draw_pools_atomic` (0048:33) | `draw_pools` / `tournament` | `v_pools::text \|\| ' pools'` | `'drew ' \|\| v_pools \|\| ' pools for ' \|\| v_tname` |
| `start_pool_play_atomic` (0048:76) | `start_pool_play` / `tournament` | `v_count::text \|\| ' games'` | `'started pool play, ' \|\| v_count \|\| ' games scheduled'` |
| `register_team` (0054:46) | `register_team` / `team` | `nm` | `'added ' \|\| nm \|\| ' to ' \|\| t.name` |
| `set_member_role` (0051:36) | `set_member_role` / `membership` | `p_role::text` | `'made ' \|\| p_email \|\| ' an organizer'` or `'removed admin access for ' \|\| p_email` |
| `set_team_paid` (0060) | `set_team_paid` / `team` | the sentence, as shipped in 0060 | the same sentence |

- [ ] **Step 1: Write the file.** `db/migrations/0061_action_log_prose.sql`, LF. Every body below is the LATEST LIVE definition (0048 / 0051 / 0054 / 0060), re-verified at precondition P4, edited ONLY where this task says.

```sql
-- 0061_action_log_prose.sql. The activity log reads as sentences, written at WRITE time.
--
-- WHY. read_action_log (0051:123-155) shapes every action_log row as `action || ' · ' || detail`, so the
-- Activity log screen reads "set_team_paid · marked Sand Sharks paid" where the design (and the shipped
-- test fixture, test/manage-page.test.js:1836) says "Mikey marked Sand Sharks paid". Shaping the sentence
-- at READ time would mean a growing CASE over slugs in a function nobody edits; writing it at WRITE time
-- means the function that made the change is the one that says what it did.
--
-- PROSE IS A PREDICATE, NOT A SENTENCE. buildMgLogHTML renders `<b>{actor}</b> {summary}`, both escaped,
-- with the actor falling back to "Someone" (app.js:8894). Prose that repeats the actor renders "Mikey Mikey
-- moved Net Gains"; prose carrying markup renders literal angle brackets. Lowercase verb, no actor, no
-- markup, no trailing period. Every writer also supplies `detail` explicitly, so a row is still readable if
-- prose is ever blanked, and read_action_log COALESCES to the old shape for every pre-C101 row.
--
-- SCOPE is the six actions already behind DEFINER RPCs. The four direct-write doors (tdbSetTournamentFields,
-- the pickup_days writes, team removal, tdbDeleteTournament, and tdbAddTeam's direct insert) still leave no
-- row at all, and closing that gap means routing them through DEFINER RPCs too: a later round.
--
-- THE SIXTH DEFINER WRITER, clear_bracket_atomic, gets its prose inside 0062 where it is recreated anyway.
-- Rewriting it here and again one migration later would be two diffs for one change.
--
-- THE TWO NEW VARIABLES IN draw_pools_atomic, derived explicitly. 0048:39 declares only v_community and
-- v_status, so the function has neither a pool count nor a tournament name in hand. v_pools comes off the
-- ARGUMENT (jsonb_array_length(p_pools)), and v_tname comes from extending the lookup at 0048:41 to select
-- `name` as well. start_pool_play_atomic already declares v_count and fills it from the supplied plan, so
-- only its name equivalent would be new and its prose does not need one.
--
-- register_team IS ANON-GRANTED, AND ITS LOG ROW IS WRITTEN UNDER AN ANON ACTOR. `grant execute ... to anon,
-- authenticated` (0024:58) is how public self-registration works, and this file re-issues that line VERBATIM
-- rather than narrowing it. The consequence, stated rather than discovered later: a player registering their
-- own team writes an action_log row whose actor is the literal 'anon' and whose role is 'public', because
-- _audit_actor() has no auth.uid() to resolve (0052:106). That is correct and wanted, and it is why the
-- row's entity_type is `team` and not an admin entity. The in-body guard stays exactly as 0054 wrote it:
-- this file adds no guard and removes none, so an anon caller can write a log row about a registration it
-- actually performed, and nothing else. The prose is built from the team name the function already
-- validated, never from unsanitised input echoed back.
--
-- ONE PRIVACY NOTE. set_member_role's prose stores an EMAIL ADDRESS in action_log, a table with RLS on and
-- no policy, readable only through the organizer-gated read_action_log. That is the same exposure
-- list_admin_seats already has and it is deliberate; it is written here so nobody widens the log's read
-- door without noticing. NO action_log POLICY IS ADDED BY THIS FILE, and none should be: a policy would
-- open the audit log to every authenticated account.
--
-- THREE SHIPPED EM-DASH RAISES ARE FIXED AS FREE RIDERS, since this file rewrites all three functions and
-- every one of these messages reaches a screen (written [EMDASH] here because this file carries no em dash):
--   draw_pools_atomic (0048:49) and start_pool_play_atomic (0048:91): 'Pool play already started [EMDASH]
--     reset pools first'          -> 'Pool play has already started. Reset pools first.'
--   set_member_role (0051:59): 'No account for that email yet [EMDASH] they need to create an account
--     first'                      -> 'No account for that email yet. Ask them to create one first.'
-- A FOURTH, in the same rewritten function, is fixed for the same reason and named so it is not a surprise:
--   start_pool_play_atomic (0048:97): 'No pool games to schedule [EMDASH] each pool needs at least 2 teams'
--                                 -> 'No pool games to schedule. Each pool needs at least 2 teams.'
-- No test asserts any of the four (grepped 2026-08-25 across test/*.js).
--
-- GRANTS UNCHANGED ON ALL SIX, and `create or replace` preserves ACLs, so the proacl read after the apply is
-- the assertion that it did, register_team's anon entry included.
--
-- NO UI CALL SITE AND NO CLIENT CHANGE. buildMgLogHTML already prints `summary` verbatim and escaped.
--
-- BEFORE AND AFTER. `add column if not exists` is additive and every writer keeps its signature, so a client
-- built before this file works unchanged after it. Rows written before the apply have a null prose and keep
-- reading as `action · detail` forever, which is the coalesce's whole job. Between 0060 and this file the
-- paid row reads `set_team_paid · marked Sand Sharks paid`, which is honest.
--
-- =====================================================================================================
-- ROLLBACK BLOCK (verbatim prior definitions + re-grants, apply this whole block to undo 0061)
-- =====================================================================================================
/*
alter table public.action_log drop column if exists prose;
-- Then re-apply, verbatim, the prior definitions of the six functions:
--   read_action_log(int)                         -> 0051_admin_seats_and_log.sql
--   draw_pools_atomic(uuid, jsonb, jsonb)        -> 0048_atomic_pool_ops.sql
--   start_pool_play_atomic(uuid, jsonb)          -> 0048_atomic_pool_ops.sql
--   register_team(uuid, text, jsonb, text, bool) -> 0054_register_resolves_identity.sql
--   set_member_role(text, public.community_role) -> 0051_admin_seats_and_log.sql
--   set_team_paid(uuid, boolean)                 -> 0060_set_team_paid.sql
-- plus their grant pairs, which for register_team is:
--   revoke all on function public.register_team(uuid, text, jsonb, text, boolean) from public;
--   grant execute on function public.register_team(uuid, text, jsonb, text, boolean) to anon, authenticated;
-- and for the other five: revoke all ... from public, anon; grant execute ... to authenticated;
-- CAPTURE THE LIVE BODIES AT PRECONDITION P4 AND PASTE THEM HERE BEFORE APPLYING, per gate step 1.
*/
-- =====================================================================================================
-- END ROLLBACK BLOCK
-- =====================================================================================================
--
-- NOT APPLIED
begin;

alter table public.action_log add column if not exists prose text;
comment on column public.action_log.prose is
  'A finished plain-text predicate written by the RPC that made the change ("marked Sand Sharks paid").
   The client renders it after a bolded actor, so it carries no actor, no markup, no trailing period.
   NULL on pre-C101 rows, which fall back to action + detail.';

-- ==========================================================================
-- read_action_log: 0051's body, unchanged except the action_log leg's summary expression.
-- ==========================================================================
create or replace function public.read_action_log(p_limit int default 50)
 returns table (at timestamptz, actor text, summary text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_community uuid := '2c3bcfa9-305e-448b-924b-da90c029f575';
begin
  if not public.is_organizer(v_community) then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  return query
    select feed.at, feed.actor, feed.summary
    from (
      select al.at as at,
             al.actor as actor,
             coalesce(nullif(btrim(al.prose), ''),
                      al.action || case when nullif(btrim(coalesce(al.detail, '')), '') is not null
                                        then ' · ' || al.detail else '' end)::text as summary
        from public.action_log al
      union all
      select ca.at as at,
             ca.actor as actor,
             (coalesce(nullif(btrim(coalesce(ca.request_text, '')), ''),
                       nullif(btrim(coalesce(ca.result, '')), ''),
                       ca.tool) || ' · co-pilot')::text as summary
        from public.copilot_actions ca
    ) feed
    order by feed.at desc nulls last
    limit greatest(1, least(coalesce(p_limit, 50), 200));
end $function$;

revoke all on function public.read_action_log(int) from public, anon;
grant execute on function public.read_action_log(int) to authenticated;

-- ==========================================================================
-- draw_pools_atomic: 0048's body + v_pools / v_tname + the log row + the raise sentence.
-- ==========================================================================
create or replace function public.draw_pools_atomic(p_tournament_id uuid, p_pools jsonb, p_assignments jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_community uuid; v_status text; v_tname text;
        v_pools int := coalesce(jsonb_array_length(p_pools), 0);
        v_actor text; v_role text; v_grp text;
begin
  select community_id, status, name into v_community, v_status, v_tname
    from public.tournaments where id = p_tournament_id;
  if not found then raise exception 'tournament not found'; end if;
  -- ORGANIZER GUARD (mirrors 0039): pool setup is an admin action.
  if not (public.is_organizer(v_community) or public.is_owner(v_community)) then
    raise exception 'Only an organizer can draw pools' using errcode = '42501';
  end if;
  -- Match the client guard in tdbDrawPools: pools can only be (re)drawn while the tournament is in setup.
  if v_status is distinct from 'setup' then
    raise exception 'Pool play has already started. Reset pools first.';
  end if;

  -- Clear existing pools of this tournament. FK pools<-teams is ON DELETE SET NULL (nulls teams.pool_id);
  -- FK matches<-pools cascades, so any old pool matches go too.
  delete from public.pools where tournament_id = p_tournament_id;

  -- Insert the new pools (display_order keeps them addressable for the assignment join below).
  insert into public.pools (tournament_id, label, display_order)
  select p_tournament_id, pl->>'label', (pl->>'display_order')::int
  from jsonb_array_elements(p_pools) pl;

  -- Assign each team to the pool whose display_order it was routed to (round-robin computed client-side).
  update public.teams t
    set pool_id = po.id
  from jsonb_array_elements(p_assignments) a
  join public.pools po on po.tournament_id = p_tournament_id and po.display_order = (a->>'display_order')::int
  where t.id = (a->>'team_id')::uuid and t.tournament_id = p_tournament_id;

  select a.actor, a.role, a.grp into v_actor, v_role, v_grp from public._audit_actor() a;
  insert into public.action_log(actor, role, grp, action, entity_type, entity_id, detail, prose)
    values (v_actor, coalesce(v_role,'admin'), v_grp, 'draw_pools', 'tournament', p_tournament_id::text,
            v_pools::text || ' pools',
            'drew ' || v_pools::text || ' pools for ' || coalesce(v_tname, ''));
end $function$;

revoke all on function public.draw_pools_atomic(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.draw_pools_atomic(uuid, jsonb, jsonb) to authenticated;

-- ==========================================================================
-- start_pool_play_atomic: 0048's body + the log row + the two raise sentences.
-- ==========================================================================
create or replace function public.start_pool_play_atomic(p_tournament_id uuid, p_matches jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_community uuid; v_status text; v_count int; v_actor text; v_role text; v_grp text;
begin
  select community_id, status into v_community, v_status from public.tournaments where id = p_tournament_id;
  if not found then raise exception 'tournament not found'; end if;
  if not (public.is_organizer(v_community) or public.is_owner(v_community)) then
    raise exception 'Only an organizer can start pool play' using errcode = '42501';
  end if;
  -- Same guard as tdbStartPoolPlay: only start from setup (prevents clobbering a live schedule).
  if v_status is distinct from 'setup' then
    raise exception 'Pool play has already started. Reset pools first.';
  end if;

  select count(*) into v_count from jsonb_array_elements(p_matches);
  if v_count = 0 then raise exception 'No pool games to schedule. Each pool needs at least 2 teams.'; end if;

  delete from public.matches where tournament_id = p_tournament_id and phase = 'pool';

  insert into public.matches (tournament_id, phase, pool_id, team_a_id, team_b_id, status, net, queue_order, version)
  select p_tournament_id, 'pool',
    (m->>'pool_id')::uuid,
    nullif(m->>'team_a_id','')::uuid, nullif(m->>'team_b_id','')::uuid,
    'scheduled', (m->>'net')::int, (m->>'queue_order')::int, 0
  from jsonb_array_elements(p_matches) m;

  update public.tournaments set status = 'pools', updated_at = now() where id = p_tournament_id;

  select a.actor, a.role, a.grp into v_actor, v_role, v_grp from public._audit_actor() a;
  insert into public.action_log(actor, role, grp, action, entity_type, entity_id, detail, prose)
    values (v_actor, coalesce(v_role,'admin'), v_grp, 'start_pool_play', 'tournament', p_tournament_id::text,
            v_count::text || ' games',
            'started pool play, ' || v_count::text || ' games scheduled');
end $function$;

revoke all on function public.start_pool_play_atomic(uuid, jsonb) from public, anon;
grant execute on function public.start_pool_play_atomic(uuid, jsonb) to authenticated;

-- ==========================================================================
-- register_team: 0054's body + the log row. NO guard added, NO guard removed. The grant line below is
-- 0024:58 re-issued verbatim: anon self-registration is the whole point of this function.
-- ==========================================================================
create or replace function public.register_team(
  p_tournament_id uuid, p_team_name text, p_roster jsonb default '[]'::jsonb,
  p_contact text default null, p_paid boolean default false)
returns public.teams language plpgsql security definer set search_path to 'public' as
$$
declare
  t public.tournaments; nm text; roster_count int; new_team public.teams;
  v_actor text; v_role text; v_grp text;
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
  select a.actor, a.role, a.grp into v_actor, v_role, v_grp from public._audit_actor() a;
  insert into public.action_log(actor, role, grp, action, entity_type, entity_id, detail, prose)
    values (v_actor, coalesce(v_role,'public'), v_grp, 'register_team', 'team', new_team.id::text,
            nm, 'added ' || nm || ' to ' || coalesce(t.name, ''));
  return new_team;
end $$;

revoke all on function public.register_team(uuid, text, jsonb, text, boolean) from public;
grant execute on function public.register_team(uuid, text, jsonb, text, boolean) to anon, authenticated;

-- ==========================================================================
-- set_member_role: 0051's body + the log row + the raise sentence. OWNER-ONLY, unchanged.
-- ==========================================================================
create or replace function public.set_member_role(p_email text, p_role public.community_role)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_community uuid := '2c3bcfa9-305e-448b-924b-da90c029f575';
  v_profile uuid;
  v_current public.community_role;
  v_email text := btrim(coalesce(p_email, ''));
  v_actor text; v_role text; v_grp text;
begin
  -- OWNER GUARD (mirrors 0050): only the owner manages admin seats.
  if not public.is_owner(v_community) then
    raise exception 'Only the owner can change admin seats' using errcode = '42501';
  end if;
  -- Seats assign organizer or player only. Owner parity is a deliberate manual grant (recon §4), never a
  -- one-tap escalation from this UI.
  if p_role = 'owner' then
    raise exception 'The owner seat can''t be assigned here';
  end if;
  -- Resolve the email to a signed-up account. profiles carries the (private) email, kept current by 0059.
  select id into v_profile from public.profiles where lower(email) = lower(v_email) limit 1;
  if v_profile is null then
    raise exception 'No account for that email yet. Ask them to create one first.';
  end if;
  -- Never demote/overwrite an existing OWNER through the seats path (self-lockout guard).
  select role into v_current from public.memberships
    where profile_id = v_profile and community_id = v_community;
  if v_current = 'owner' then
    raise exception 'The owner seat can''t be changed here';
  end if;
  -- Upsert the membership (PK = profile_id, community_id). Promote = organizer, remove admin = player.
  insert into public.memberships (profile_id, community_id, role, status)
  values (v_profile, v_community, p_role, 'active')
  on conflict (profile_id, community_id)
  do update set role = excluded.role, status = 'active';

  select a.actor, a.role, a.grp into v_actor, v_role, v_grp from public._audit_actor() a;
  insert into public.action_log(actor, role, grp, action, entity_type, entity_id, detail, prose)
    values (v_actor, coalesce(v_role,'admin'), v_grp, 'set_member_role', 'membership', v_profile::text,
            p_role::text,
            case when p_role = 'organizer' then 'made ' || v_email || ' an organizer'
                 else 'removed admin access for ' || v_email end);
end $function$;

revoke all on function public.set_member_role(text, public.community_role) from public, anon;
grant execute on function public.set_member_role(text, public.community_role) to authenticated;

-- ==========================================================================
-- set_team_paid: 0060's body, with the same sentence written into prose as well.
-- ==========================================================================
create or replace function public.set_team_paid(p_team uuid, p_paid boolean)
 returns public.teams
 language plpgsql
 security definer
 set search_path to 'public'
as $fn$
declare v_comm uuid; v_name text; updated public.teams; v_actor text; v_role text; v_grp text;
        v_line text;
begin
  select t.community_id, t.name into v_comm, v_name from public.teams t where t.id = p_team;
  if v_comm is null then raise exception 'That team is not here any more.'; end if;
  if not (public.is_organizer(v_comm) or public.is_owner(v_comm)) then
    raise exception 'Only an organizer can change a payment' using errcode = '42501';
  end if;
  update public.teams set paid = coalesce(p_paid, false) where id = p_team returning * into updated;
  v_line := case when coalesce(p_paid,false) then 'marked ' || v_name || ' paid'
                 else 'marked ' || v_name || ' unpaid' end;
  select a.actor, a.role, a.grp into v_actor, v_role, v_grp from public._audit_actor() a;
  insert into public.action_log(actor, role, grp, action, entity_type, entity_id, detail, prose)
    values (v_actor, coalesce(v_role,'admin'), v_grp, 'set_team_paid', 'team', p_team::text,
            v_line, v_line);
  return updated;
end $fn$;

revoke all on function public.set_team_paid(uuid, boolean) from public, anon;
grant execute on function public.set_team_paid(uuid, boolean) to authenticated;

commit;
```

- [ ] **Step 2 (CONTROLLER): the rolled-back harness.** ONE `execute_sql` batch, the file's `begin;`/`commit;` stripped. Paste the file's `alter table`, its `comment on column` and its SIX function definitions with their revoke/grant pairs verbatim where the marker says, then the fixtures and assertions below.

```sql
begin;
  create temp table t_out(name text, ok boolean, got text);
  create temp table t_who as
    select profile_id as uid from public.memberships
     where community_id = '2c3bcfa9-305e-448b-924b-da90c029f575' and role = 'owner' limit 1;

  insert into public.tournaments (id, name, community_id, status, registration_open, team_size)
    values ('c1010000-0000-4000-8000-000000000001', 'C101 harness',
            '2c3bcfa9-305e-448b-924b-da90c029f575', 'setup', true, 2);
  insert into public.teams (id, tournament_id, name, community_id, paid)
    values ('c1010000-0000-4000-8000-000000000011', 'c1010000-0000-4000-8000-000000000001',
            'Sand Sharks', '2c3bcfa9-305e-448b-924b-da90c029f575', false);
  -- one PRE-C101 row, to prove the coalesce keeps the backlog readable
  insert into public.action_log(actor, role, action, entity_type, entity_id, detail)
    values ('Mikey', 'owner', 'submit_score', 'match', 'c101-legacy', '21-19 win:a');

  -- ---- the migration's DDL, begin;/commit; stripped: the alter table, the comment, and all SIX
  -- ---- create-or-replace blocks with their revoke/grant pairs, pasted verbatim from the file ----

  -- 1. draw_pools_atomic: one row, the pool count and the tournament name in the prose
  do $h$
  declare v_prose text; v_detail text;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', (select uid from t_who))::text, true);
    perform public.draw_pools_atomic('c1010000-0000-4000-8000-000000000001',
      '[{"label":"A","display_order":0},{"label":"B","display_order":1}]'::jsonb, '[]'::jsonb);
    select prose, detail into v_prose, v_detail from public.action_log
     where action = 'draw_pools' order by at desc limit 1;
    insert into t_out values ('draw_pools prose is a lowercase predicate with the count and the name',
      v_prose = 'drew 2 pools for C101 harness' and v_detail = '2 pools', coalesce(v_prose,'<null>'));
  exception when others then
    insert into t_out values ('draw_pools prose is a lowercase predicate with the count and the name',
      false, sqlstate || ' ' || sqlerrm);
  end $h$;

  -- 2. start_pool_play_atomic: the game count from the supplied plan
  do $h$
  declare v_prose text; v_pa uuid;
  begin
    select id into v_pa from public.pools where tournament_id = 'c1010000-0000-4000-8000-000000000001'
     order by display_order limit 1;
    insert into public.teams (id, tournament_id, name, community_id, pool_id)
      values ('c1010000-0000-4000-8000-000000000012', 'c1010000-0000-4000-8000-000000000001',
              'Net Gains', '2c3bcfa9-305e-448b-924b-da90c029f575', v_pa);
    update public.teams set pool_id = v_pa where id = 'c1010000-0000-4000-8000-000000000011';
    perform public.start_pool_play_atomic('c1010000-0000-4000-8000-000000000001',
      json_build_array(json_build_object('pool_id', v_pa,
        'team_a_id', 'c1010000-0000-4000-8000-000000000011',
        'team_b_id', 'c1010000-0000-4000-8000-000000000012', 'net', 1, 'queue_order', 1))::jsonb);
    select prose into v_prose from public.action_log where action = 'start_pool_play' order by at desc limit 1;
    insert into t_out values ('start_pool_play prose carries the scheduled count',
      v_prose = 'started pool play, 1 games scheduled', coalesce(v_prose,'<null>'));
  exception when others then
    insert into t_out values ('start_pool_play prose carries the scheduled count', false, sqlstate || ' ' || sqlerrm);
  end $h$;

  -- 3. an ANON register_team lands a row signed 'anon' with role 'public'
  do $h$
  declare tm public.teams; v_actor text; v_role text; v_prose text;
  begin
    perform set_config('request.jwt.claims', '', true);
    update public.tournaments set status = 'setup', registration_open = true
     where id = 'c1010000-0000-4000-8000-000000000001';
    select * into tm from public.register_team('c1010000-0000-4000-8000-000000000001', 'Block Party',
      '["Elliot Vance","Harper Vale"]'::jsonb, null, false);
    select actor, role, prose into v_actor, v_role, v_prose from public.action_log
     where action = 'register_team' order by at desc limit 1;
    insert into t_out values ('anon register_team writes an anon-signed row',
      v_actor = 'anon' and v_role = 'public' and v_prose = 'added Block Party to C101 harness',
      coalesce(v_actor,'<null>') || ' / ' || coalesce(v_role,'<null>') || ' / ' || coalesce(v_prose,'<null>'));
  exception when others then
    insert into t_out values ('anon register_team writes an anon-signed row', false, sqlstate || ' ' || sqlerrm);
  end $h$;

  -- 4. set_team_paid writes the SAME sentence into detail and prose
  do $h$
  declare r public.teams; v_prose text; v_detail text;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', (select uid from t_who))::text, true);
    select * into r from public.set_team_paid('c1010000-0000-4000-8000-000000000011', true);
    select prose, detail into v_prose, v_detail from public.action_log
     where action = 'set_team_paid' order by at desc limit 1;
    insert into t_out values ('set_team_paid writes the same sentence twice',
      v_prose = 'marked Sand Sharks paid' and v_detail = v_prose, coalesce(v_prose,'<null>'));
  exception when others then
    insert into t_out values ('set_team_paid writes the same sentence twice', false, sqlstate || ' ' || sqlerrm);
  end $h$;

  -- 5. set_member_role: the new refusal sentence, then both prose branches
  do $h$
  begin
    perform public.set_member_role('nobody-c101@example.test', 'organizer');
    insert into t_out values ('set_member_role refuses an unknown email with the new sentence', false, 'it returned');
  exception when others then
    insert into t_out values ('set_member_role refuses an unknown email with the new sentence',
      sqlerrm = 'No account for that email yet. Ask them to create one first.', sqlstate || ' ' || sqlerrm);
  end $h$;
  do $h$
  declare v_prose text; v_mail text;
  begin
    -- the owner's own row is refused by the self-lockout guard, so this needs a SECOND account. With one
    -- account only, the case records SKIPPED rather than pretending to have run.
    if (select count(*) from public.profiles) < 2 then
      insert into t_out values ('set_member_role prose (organizer / removed)', true, 'SKIPPED: one account only');
    else
      select email into v_mail from public.profiles where id <> (select uid from t_who) limit 1;
      perform public.set_member_role(v_mail, 'organizer');
      select prose into v_prose from public.action_log where action = 'set_member_role' order by at desc limit 1;
      insert into t_out values ('set_member_role prose (organizer)',
        v_prose = 'made ' || v_mail || ' an organizer', coalesce(v_prose,'<null>'));
      perform public.set_member_role(v_mail, 'player');
      select prose into v_prose from public.action_log where action = 'set_member_role' order by at desc limit 1;
      insert into t_out values ('set_member_role prose (removed)',
        v_prose = 'removed admin access for ' || v_mail, coalesce(v_prose,'<null>'));
    end if;
  exception when others then
    insert into t_out values ('set_member_role prose (organizer / removed)', false, sqlstate || ' ' || sqlerrm);
  end $h$;

  -- 6. read_action_log: prose for a new row, action + detail for the pre-C101 row, 42501 for a non-organizer
  do $h$
  declare v_new text; v_old text;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', (select uid from t_who))::text, true);
    select summary into v_new from public.read_action_log(200) where summary like 'marked Sand Sharks%' limit 1;
    select summary into v_old from public.read_action_log(200) where summary like 'submit_score%' limit 1;
    insert into t_out values ('read_action_log returns prose for a new row', v_new = 'marked Sand Sharks paid', coalesce(v_new,'<null>'));
    insert into t_out values ('read_action_log falls back for a pre-C101 row', v_old = 'submit_score · 21-19 win:a', coalesce(v_old,'<null>'));
  exception when others then
    insert into t_out values ('read_action_log returns prose for a new row', false, sqlstate || ' ' || sqlerrm);
  end $h$;
  do $h$
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', '00000000-0000-4000-8000-0000000000ff')::text, true);
    perform public.read_action_log(50);
    insert into t_out values ('a non-organizer still gets Admins only', false, 'it returned rows');
  exception when others then
    insert into t_out values ('a non-organizer still gets Admins only',
      sqlstate = '42501' and sqlerrm = 'Admins only', sqlstate || ' ' || sqlerrm);
  end $h$;

  -- 7. no prose anywhere carries an actor, markup, or a trailing period
  do $h$
  declare v_bad int;
  begin
    select count(*) into v_bad from public.action_log
     where prose is not null
       and (prose like '%<%' or prose like '%>%' or prose like '%.' or prose ~ '^[A-Z]');
    insert into t_out values ('every prose is a lowercase, markup-free, period-free predicate', v_bad = 0, v_bad::text);
  end $h$;

  -- 8. the grants survived create or replace, register_team's anon entry included
  do $h$
  declare v_acl text;
  begin
    select coalesce(proacl::text,'<null>') into v_acl from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'register_team';
    insert into t_out values ('register_team still carries its anon EXECUTE', v_acl like '%anon=X%', v_acl);
  end $h$;

select * from t_out;
rollback;
```

  **Expected messages, verbatim:** `Pool play has already started. Reset pools first.`, `No pool games to schedule. Each pool needs at least 2 teams.`, `No account for that email yet. Ask them to create one first.`, `Admins only` (42501). Any `false` STOPS the round.

- [ ] **Step 3 (CONTROLLER): the residue probes.** SEPARATE calls, after the rollback:
```sql
select count(*) as prose_col from information_schema.columns
 where table_schema = 'public' and table_name = 'action_log' and column_name = 'prose';   -- expect 0
select pg_get_functiondef('public.read_action_log(int)'::regprocedure) as def;             -- expect the 0051 body
select pg_get_functiondef('public.set_team_paid(uuid, boolean)'::regprocedure) as def;     -- expect the 0060 body, no prose
```

- [ ] **Step 4 (CONTROLLER): apply.** `apply_migration` named `0061_action_log_prose`. Post-apply, each its own call:
```sql
select p.proname, pg_get_functiondef(p.oid) as def, coalesce(p.proacl::text,'<null>') as acl
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('read_action_log','draw_pools_atomic','start_pool_play_atomic',
                     'register_team','set_member_role','set_team_paid')
 order by p.proname;
```
Each `def` diffed against the file verbatim. Each `acl` must carry `authenticated=X/` with NO leading `=X/` PUBLIC entry, and `register_team` must ALSO carry `anon=X/`.
```sql
select column_name, data_type, is_nullable,
       col_description('public.action_log'::regclass, ordinal_position) as comment
  from information_schema.columns
 where table_schema='public' and table_name='action_log' and column_name='prose';
```
Then `get_advisors(security)` (zero NEW against P3) and the P2 count query (every number unmoved, `action_log` included: this file writes no rows).

- [ ] **Step 5: the client tests.** `test/manage-page.test.js`, the `buildMgLogHTML` describe at :1828-1874. RESHAPE, do not delete: add a prose row and a legacy `action · detail` row in ONE list, and keep the escaping case. The day grouping, loading line, empty state and missing-actor cases in that describe stay exactly as written.

```js
  // C101 Task 4 / migration 0061: read_action_log now returns action_log.prose when the writer left one and
  // falls back to `action · detail` for every pre-C101 row, so ONE list carries both shapes. buildMgLogHTML
  // is unchanged and stays unchanged: it prints `summary` verbatim and escaped, which is the whole reason
  // the prose is written at WRITE time rather than shaped here.
  it('renders a prose row and a legacy action · detail row in the same list', () => {
    setAdminsState();
    const log = [
      { at: iso(0, 21, 12), actor: 'Mikey', summary: 'marked Sand Sharks paid' },       // prose (post-0061)
      { at: iso(0, 20, 44), actor: 'Mikey', summary: 'drew 2 pools for August 2026' },  // prose (post-0061)
      { at: iso(1, 19, 2), actor: 'anon', summary: 'submit_score · 21-19 win:a' },      // legacy (pre-C101)
    ];
    const html = bridge.buildAdmins({ view: 'log', log });
    expect(html).toContain('<b>Mikey</b> marked Sand Sharks paid');
    expect(html).toContain('<b>Mikey</b> drew 2 pools for August 2026');
    expect(html).toContain('<b>anon</b> submit_score · 21-19 win:a');
    expect(html.indexOf('marked Sand Sharks paid')).toBeLessThan(html.indexOf('submit_score'));
    expect(html).not.toContain('—');
  });

  it('a summary carrying markup is escaped, prose or not', () => {
    setAdminsState();
    const html = bridge.buildAdmins({ view: 'log', log: [
      { at: iso(0, 12, 0), actor: 'Mikey', summary: 'made <b>x@y.z</b> an organizer' },
    ] });
    expect(html).not.toContain('<b>x@y.z</b>');
    expect(html).toContain('&lt;b&gt;');
    expect(html).toContain('<b>Mikey</b> made');   // the ACTOR bold is the renderer's, not the summary's
  });
```

- [ ] **Step 6: Suite and commit.** `cd test && npx vitest run` on the runner's exit code. No `APP_VERSION` bump: this task ships no `public/` change. Commit (do not push):

`feat(db): 0061 activity-log prose - the writer says what it did, read_action_log coalesces the backlog, and the shipped em-dash raises become sentences`

- [ ] **Step 7 (CONTROLLER): mark it applied.** Replace `-- NOT APPLIED` with the `APPLIED <date> via the Supabase MCP on Mike's word (C101 Task 4)` line naming the six definitions read back and register_team's surviving anon grant. Commit it alone: `chore(db): 0061 applied`.

---

### Task 5: `0062_clear_bracket_result.sql`

**Files:**
- Create: `db/migrations/0062_clear_bracket_result.sql`
- Modify: `public/pure.js` (add `bracketClearPlan`, add it to the export list at 2049-2078)
- Modify: `public/app.js` (`tdbClearBracketResult` new, beside `tdbResetBracket` at 2606; `buildMgScoreSheetHTML` 12041-12127; `openMgScoreSheet`'s `sync()` at 12179 and its click delegate at 12245-12250; `APP_VERSION`)
- Modify: `test/manage-round.test.js`, `test/pure.test.js`, `test/supabase-writes.test.js`

**Interfaces:**
- Produces: `public.clear_bracket_atomic(p_match uuid) returns int` (the count of matches reset), replacing the shipped `returns void`.
- Produces: `tdbClearBracketResult(match)` returning the count; the pure `bracketClearPlan(matchId, matches) -> { reset, blank }`.
- Grants: `revoke all ... from public, anon;` then `grant execute ... to authenticated;`, re-issued after the recreate.

**Why a DROP is acceptable here and only here.** Postgres will not `create or replace` across a return-type change. The blast radius is zero because nothing calls the function today: `grep -c clear_bracket_atomic public/app.js` returns 0, and 0056:5-7 records that the CLEAR UI was deleted in v.22. That window closes the moment the UI is wired, so this is the last moment it is free. Re-issue both grant lines after the recreate and confirm with `proacl` that no PUBLIC entry survives.

- [ ] **Step 1: Write the file.** `db/migrations/0062_clear_bracket_result.sql`, LF. The recursive chain and the slot-nulling loop are copied VERBATIM from the live 0056 body (re-verified at P4).

```sql
-- 0062_clear_bracket_result.sql. Clear ONE bracket result and everything it sent through, and say how many.
--
-- WHY. C79 asked for an undo on the bracket. A true undo is impossible from the data that exists
-- (action_log.detail stores only the NEW value and action_log.undo is written by nothing), so this ships as
-- "Clear this result": the shipped clear_bracket_atomic (0014, guarded in 0056) already unwinds the chain
-- correctly and has had NO client caller since the CLEAR UI was deleted in v.22. Wiring it needs three
-- things it does not have: a return value the client can check (returns void gives the client nothing
-- against the read-back law), a phase guard, and a status guard.
--
-- WHY A DROP, HERE AND ONLY HERE. Postgres will not `create or replace` across a return-type change
-- (void -> int). The blast radius is zero because nothing calls it: `grep -c clear_bracket_atomic
-- public/app.js` returned 0 on 2026-08-25. That window closes the moment the UI is wired in this same task,
-- so this is the last moment the drop is free. Both grant lines are re-issued below, because a drop takes
-- the ACL with it.
--
-- GUARDS, IN BODY ORDER.
--   (a) the match exists, else 'That game is not here any more.'
--   (b) organizer or owner, 42501, 'Only an organizer can clear a bracket' (0056's idiom, unchanged)
--   (c) NEW: phase = 'main', else 'That is not a bracket game.' This closes a real hole: the shipped
--       function has NO phase check anywhere, so a POOL match id resets that pool row and logs it as
--       'main_match'. June's hand-authored 12-game schedule is phase='pool', so this is also the second
--       lock on the irreplaceable data.
--   (d) NEW: status = 'final', else 'That game has no result to clear.' A UI that only renders Clear on a
--       finished game is a fact about one screen, not a boundary, and this RPC is reachable by REST.
--   (e) NEW: no collected downstream game may be 'live'. The chain recurses on `status <> 'scheduled'`, so
--       it collects a game IN PROGRESS and the shipped function would wipe a live score with no warning.
--       Refuse rather than warn: the organizer can finish that game, or clear from further down.
--   (f) a COMPLETED tournament is deliberately NOT refused. It is REOPENED to 'bracket', which is the
--       existing and correct behaviour (0056:64-65). Do not "tighten" this later.
--
-- THE CHAMPION NULL IS ITS OWN UNCONDITIONAL STATEMENT. Folding it into the reopen UPDATE, which carries
-- `and status = 'completed'`, leaves a stored champion behind on the sequence close, reopen, clear: the
-- reopen already moved the row off 'completed', so the guarded UPDATE matches nothing and the champion
-- survives a bracket that no longer has one. resolveHistoryChampion prefers the STORED champion over the
-- computed one (pure.js:443-455), so that is the quiet wrongness that shows up on History months later.
-- close_tournament (0050:34-70) writes the champion again on the next close.
--
-- version BUMPS ON EVERY TOUCHED MATCH. The shipped function does not (0056:59-61) and clear_whole_bracket
-- (0063) does; one of the two has to give, and the answer is bump. submit_match_score and edit_match_score
-- take p_version and CAS on `where id = ... and version = p_version` (0039:249-253). A client holding a
-- pre-clear match, which after a clear is exactly the score card someone left open, would otherwise pass
-- its stale version against an unchanged number and be ACCEPTED into a row that was reset underneath it.
-- Bumping makes that call fail with "another device just updated this match", which is the truth.
--
-- RETURNS int, the rows reset. The client asserts n >= 1, then refreshes and repaints from server truth.
--
-- NOT TAKEN: a scoreless pool result (C86 stays REFUSED, Mike's call 4); a restore-prior-value undo (the
-- data to do it does not exist); and any widening of the log's read door.
--
-- BEFORE AND AFTER. Before the apply the new UI's rpc call fails with an RPC-not-found error, which the
-- score card surfaces in its own #mgss-err line and which NEVER falls back to a direct matches write (a
-- fallback would be non-atomic and would leave no log row). After the apply the function's SIGNATURE has
-- changed, so any caller passing the old shape would fail loudly rather than silently: there are none.
--
-- =====================================================================================================
-- ROLLBACK BLOCK (verbatim prior definitions + re-grants, apply this whole block to undo 0062)
-- =====================================================================================================
/*
drop function if exists public.clear_bracket_atomic(uuid);
-- the LIVE 0056 definition, captured at precondition P4 and pasted here before this file is applied:
create or replace function public.clear_bracket_atomic(p_match uuid)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_tournament uuid; v_comm uuid;
  to_reset uuid[]; r record; v_actor text; v_role text; v_grp text;
begin
  select m.tournament_id, t.community_id into v_tournament, v_comm
    from public.matches m join public.tournaments t on t.id = m.tournament_id
   where m.id = p_match;
  if v_tournament is null then raise exception 'match not found'; end if;
  if not (public.is_organizer(v_comm) or public.is_owner(v_comm)) then
    raise exception 'Only an organizer can clear a bracket' using errcode = '42501';
  end if;
  with recursive chain as (
    select id, winner_next_match_id, loser_next_match_id
      from public.matches where id = p_match
    union
    select n.id, n.winner_next_match_id, n.loser_next_match_id
      from chain c
      join public.matches n on n.id in (c.winner_next_match_id, c.loser_next_match_id)
     where n.status <> 'scheduled'
  )
  select array_agg(id) into to_reset from chain;
  for r in select * from public.matches where id = any(to_reset) loop
    if r.winner_next_match_id is not null then
      if r.winner_next_slot = 1 then update public.matches set team_b_id = null where id = r.winner_next_match_id;
      else update public.matches set team_a_id = null where id = r.winner_next_match_id; end if;
    end if;
    if r.loser_next_match_id is not null then
      if r.loser_next_slot = 1 then update public.matches set team_b_id = null where id = r.loser_next_match_id;
      else update public.matches set team_a_id = null where id = r.loser_next_match_id; end if;
    end if;
  end loop;
  update public.matches
     set score_a=null, score_b=null, winner_team_id=null, loser_team_id=null, status='scheduled', updated_at=now()
   where id = any(to_reset);
  update public.tournaments set status='bracket', updated_at=now()
   where id = v_tournament and status = 'completed';
  select a.actor, a.role, a.grp into v_actor, v_role, v_grp from public._audit_actor() a;
  insert into public.action_log(actor, role, grp, action, entity_type, entity_id, detail)
    values (v_actor, coalesce(v_role,'admin'), v_grp, 'clear_bracket','main_match', p_match::text,
            coalesce(array_length(to_reset,1),0)::text || ' matches reset');
end $fn$;
revoke all on function public.clear_bracket_atomic(uuid) from public, anon;
grant execute on function public.clear_bracket_atomic(uuid) to authenticated;
*/
-- =====================================================================================================
-- END ROLLBACK BLOCK
-- =====================================================================================================
--
-- NOT APPLIED
begin;

drop function if exists public.clear_bracket_atomic(uuid);

create function public.clear_bracket_atomic(p_match uuid)
 returns int
 language plpgsql
 security definer
 set search_path to 'public'
as $fn$
declare v_tournament uuid; v_comm uuid; v_phase text; v_status text; v_name text;
        to_reset uuid[]; r record; n int; v_actor text; v_role text; v_grp text;
begin
  -- The live select (0056:30-32) carries `m` as a table alias INSIDE it only, so `m.phase` is out of
  -- scope everywhere after it. Phase and status must come out of THIS SAME select or no guard can see them.
  select m.tournament_id, m.phase, m.status, t.community_id, t.name
    into v_tournament, v_phase, v_status, v_comm, v_name
    from public.matches m join public.tournaments t on t.id = m.tournament_id
   where m.id = p_match;
  if v_tournament is null then raise exception 'That game is not here any more.'; end if;
  if not (public.is_organizer(v_comm) or public.is_owner(v_comm)) then
    raise exception 'Only an organizer can clear a bracket' using errcode = '42501';
  end if;
  if coalesce(v_phase,'') <> 'main' then raise exception 'That is not a bracket game.'; end if;
  if v_status <> 'final' then raise exception 'That game has no result to clear.'; end if;

  -- the recursive chain, verbatim from 0056:38-46 (recurses while status <> 'scheduled')
  with recursive chain as (
    select id, winner_next_match_id, loser_next_match_id
      from public.matches where id = p_match
    union
    select n.id, n.winner_next_match_id, n.loser_next_match_id
      from chain c
      join public.matches n on n.id in (c.winner_next_match_id, c.loser_next_match_id)
     where n.status <> 'scheduled'
  )
  select array_agg(id) into to_reset from chain;

  if exists (select 1 from public.matches where id = any(to_reset) and status = 'live') then
    raise exception 'A game further along is being scored right now. Finish that one first.';
  end if;

  -- the slot-nulling loop over each collected match's children, verbatim from 0056:48-58
  for r in select * from public.matches where id = any(to_reset) loop
    if r.winner_next_match_id is not null then
      if r.winner_next_slot = 1 then update public.matches set team_b_id = null where id = r.winner_next_match_id;
      else update public.matches set team_a_id = null where id = r.winner_next_match_id; end if;
    end if;
    if r.loser_next_match_id is not null then
      if r.loser_next_slot = 1 then update public.matches set team_b_id = null where id = r.loser_next_match_id;
      else update public.matches set team_a_id = null where id = r.loser_next_match_id; end if;
    end if;
  end loop;

  update public.matches
     set score_a = null, score_b = null, winner_team_id = null, loser_team_id = null,
         status = 'scheduled', version = version + 1, updated_at = now()
   where id = any(to_reset);
  n := coalesce(array_length(to_reset, 1), 0);

  update public.tournaments set status = 'bracket', updated_at = now()
   where id = v_tournament and status = 'completed';
  update public.tournaments set champion_team_id = null where id = v_tournament;   -- UNCONDITIONAL

  select a.actor, a.role, a.grp into v_actor, v_role, v_grp from public._audit_actor() a;
  insert into public.action_log(actor, role, grp, action, entity_type, entity_id, detail, prose)
    values (v_actor, coalesce(v_role,'admin'), v_grp, 'clear_bracket', 'main_match', p_match::text,
            n::text || ' matches reset',
            'cleared ' || n::text || ' bracket result' || case when n = 1 then '' else 's' end
              || ' in ' || coalesce(v_name, ''));
  return n;
end $fn$;

revoke all on function public.clear_bracket_atomic(uuid) from public, anon;
grant execute on function public.clear_bracket_atomic(uuid) to authenticated;

commit;
```

- [ ] **Step 2 (CONTROLLER): the rolled-back harness.** ONE `execute_sql` batch, the file's `begin;`/`commit;` stripped. The fixture is a four-game winners chain plus a losers game, so the unwind has something to unwind.

```sql
begin;
  create temp table t_out(name text, ok boolean, got text);
  create temp table t_who as
    select profile_id as uid from public.memberships
     where community_id = '2c3bcfa9-305e-448b-924b-da90c029f575' and role = 'owner' limit 1;

  insert into public.tournaments (id, name, community_id, status, champion_team_id)
    values ('c1010000-0000-4000-8000-000000000001', 'C101 harness',
            '2c3bcfa9-305e-448b-924b-da90c029f575', 'completed', null);
  insert into public.teams (id, tournament_id, name, community_id) values
    ('c1010000-0000-4000-8000-000000000011','c1010000-0000-4000-8000-000000000001','Sand Sharks','2c3bcfa9-305e-448b-924b-da90c029f575'),
    ('c1010000-0000-4000-8000-000000000012','c1010000-0000-4000-8000-000000000001','Net Gains','2c3bcfa9-305e-448b-924b-da90c029f575'),
    ('c1010000-0000-4000-8000-000000000013','c1010000-0000-4000-8000-000000000001','Block Party','2c3bcfa9-305e-448b-924b-da90c029f575'),
    ('c1010000-0000-4000-8000-000000000014','c1010000-0000-4000-8000-000000000001','Dig It','2c3bcfa9-305e-448b-924b-da90c029f575');
  update public.tournaments set champion_team_id = 'c1010000-0000-4000-8000-000000000011'
   where id = 'c1010000-0000-4000-8000-000000000001';
  -- W1 and W2 feed GF (slot 1 and slot 2); W1's loser feeds L1; L1's winner feeds GF is not modelled,
  -- because one feeder pair is enough to prove both slot branches.
  insert into public.matches (id, tournament_id, phase, side, round, status, team_a_id, team_b_id,
                              score_a, score_b, winner_team_id, loser_team_id, version,
                              winner_next_match_id, winner_next_slot, loser_next_match_id, loser_next_slot) values
    ('c1010000-0000-4000-8000-000000000021','c1010000-0000-4000-8000-000000000001','main','winners',1,'final',
     'c1010000-0000-4000-8000-000000000011','c1010000-0000-4000-8000-000000000012',21,15,
     'c1010000-0000-4000-8000-000000000011','c1010000-0000-4000-8000-000000000012',3,
     'c1010000-0000-4000-8000-000000000023',0,'c1010000-0000-4000-8000-000000000024',1),
    ('c1010000-0000-4000-8000-000000000022','c1010000-0000-4000-8000-000000000001','main','winners',1,'final',
     'c1010000-0000-4000-8000-000000000013','c1010000-0000-4000-8000-000000000014',21,10,
     'c1010000-0000-4000-8000-000000000013','c1010000-0000-4000-8000-000000000014',2,
     'c1010000-0000-4000-8000-000000000023',1,null,null),
    ('c1010000-0000-4000-8000-000000000023','c1010000-0000-4000-8000-000000000001','main','grand_final',1,'final',
     'c1010000-0000-4000-8000-000000000011','c1010000-0000-4000-8000-000000000013',21,18,
     'c1010000-0000-4000-8000-000000000011','c1010000-0000-4000-8000-000000000013',1,null,null,null,null),
    ('c1010000-0000-4000-8000-000000000024','c1010000-0000-4000-8000-000000000001','main','losers',1,'scheduled',
     null,'c1010000-0000-4000-8000-000000000012',null,null,null,null,0,null,null,null,null);
  -- a POOL row, for guard (c)
  insert into public.pools (id, tournament_id, label, display_order)
    values ('c1010000-0000-4000-8000-00000000000a','c1010000-0000-4000-8000-000000000001','A',0);
  insert into public.matches (id, tournament_id, phase, pool_id, status, team_a_id, team_b_id,
                              score_a, score_b, winner_team_id, net, queue_order, version)
    values ('c1010000-0000-4000-8000-000000000031','c1010000-0000-4000-8000-000000000001','pool',
            'c1010000-0000-4000-8000-00000000000a','final',
            'c1010000-0000-4000-8000-000000000011','c1010000-0000-4000-8000-000000000012',21,9,
            'c1010000-0000-4000-8000-000000000011',1,1,1);

  -- ---- the migration's DDL, begin;/commit; stripped: the drop, the create, both grant lines ----

  -- 1. a NO-MEMBERSHIP caller: 42501 AND the exact message, and nothing written
  do $h$
  declare v_n int; v_ver int;
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', '00000000-0000-4000-8000-0000000000ff')::text, true);
    begin
      select public.clear_bracket_atomic('c1010000-0000-4000-8000-000000000023') into v_n;
      insert into t_out values ('no-membership caller is refused', false, 'it returned ' || v_n::text);
    exception when others then
      insert into t_out values ('no-membership caller is refused',
        sqlstate = '42501' and sqlerrm = 'Only an organizer can clear a bracket', sqlstate || ' ' || sqlerrm);
    end;
    select version into v_ver from public.matches where id = 'c1010000-0000-4000-8000-000000000023';
    insert into t_out values ('the refused call bumped nothing', v_ver = 1, v_ver::text);
  end $h$;

  -- 2. a POOL match id is refused (the hole the shipped function has)
  do $h$
  declare v_n int;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', (select uid from t_who))::text, true);
    select public.clear_bracket_atomic('c1010000-0000-4000-8000-000000000031') into v_n;
    insert into t_out values ('a pool match id is refused', false, 'it returned ' || v_n::text);
  exception when others then
    insert into t_out values ('a pool match id is refused',
      sqlerrm = 'That is not a bracket game.', sqlstate || ' ' || sqlerrm);
  end $h$;

  -- 3. a SCHEDULED target is refused
  do $h$
  declare v_n int;
  begin
    select public.clear_bracket_atomic('c1010000-0000-4000-8000-000000000024') into v_n;
    insert into t_out values ('a scheduled target is refused', false, 'it returned ' || v_n::text);
  exception when others then
    insert into t_out values ('a scheduled target is refused',
      sqlerrm = 'That game has no result to clear.', sqlstate || ' ' || sqlerrm);
  end $h$;

  -- 4. an unknown id is refused
  do $h$
  declare v_n int;
  begin
    select public.clear_bracket_atomic('c1010000-0000-4000-8000-0000000000ee') into v_n;
    insert into t_out values ('an unknown id is refused', false, 'it returned ' || v_n::text);
  exception when others then
    insert into t_out values ('an unknown id is refused',
      sqlerrm = 'That game is not here any more.', sqlstate || ' ' || sqlerrm);
  end $h$;

  -- 5. a LIVE downstream game refuses with the exact message and NOTHING is written
  do $h$
  declare v_n int; v_ver int; v_score int;
  begin
    update public.matches set status = 'live', score_a = 7, score_b = 5
     where id = 'c1010000-0000-4000-8000-000000000023';
    select public.clear_bracket_atomic('c1010000-0000-4000-8000-000000000021') into v_n;
    insert into t_out values ('a live downstream game refuses the clear', false, 'it returned ' || v_n::text);
  exception when others then
    insert into t_out values ('a live downstream game refuses the clear',
      sqlerrm = 'A game further along is being scored right now. Finish that one first.',
      sqlstate || ' ' || sqlerrm);
  end $h$;
  do $h$
  declare v_score int; v_ver int;
  begin
    select score_a, version into v_score, v_ver from public.matches
     where id = 'c1010000-0000-4000-8000-000000000023';
    insert into t_out values ('the live score survived the refusal', v_score = 7 and v_ver = 1,
      coalesce(v_score::text,'<null>') || ' / v' || v_ver::text);
    update public.matches set status = 'final', score_a = 21, score_b = 18
     where id = 'c1010000-0000-4000-8000-000000000023';
  end $h$;

  -- 6. a LEAF clear resets 1 and blanks 1 downstream slot; the champion is nulled; a completed
  --    tournament reopens; the version bumps
  do $h$
  declare v_n int; v_a uuid; v_st text; v_champ uuid; v_ver int; v_prose text;
  begin
    select public.clear_bracket_atomic('c1010000-0000-4000-8000-000000000023') into v_n;
    insert into t_out values ('a leaf clear resets exactly one', v_n = 1, v_n::text);
    select status, version into v_st, v_ver from public.matches where id = 'c1010000-0000-4000-8000-000000000023';
    insert into t_out values ('the cleared row is scheduled and bumped', v_st = 'scheduled' and v_ver = 2,
      v_st || ' v' || v_ver::text);
    select status, champion_team_id into v_st, v_champ from public.tournaments
     where id = 'c1010000-0000-4000-8000-000000000001';
    insert into t_out values ('a completed tournament reopens to bracket', v_st = 'bracket', v_st);
    insert into t_out values ('the champion is nulled', v_champ is null, coalesce(v_champ::text,'<null>'));
    select prose into v_prose from public.action_log where action = 'clear_bracket' order by at desc limit 1;
    insert into t_out values ('the prose is singular at n = 1',
      v_prose = 'cleared 1 bracket result in C101 harness', coalesce(v_prose,'<null>'));
  exception when others then
    insert into t_out values ('a leaf clear resets exactly one', false, sqlstate || ' ' || sqlerrm);
  end $h$;

  -- 7. close, reopen, clear ALSO leaves a null champion (the unconditional statement's whole point)
  do $h$
  declare v_champ uuid; v_n int;
  begin
    update public.matches set status='final', score_a=21, score_b=18,
           winner_team_id='c1010000-0000-4000-8000-000000000011'
     where id = 'c1010000-0000-4000-8000-000000000023';
    update public.tournaments set status='bracket',          -- already REOPENED, champion still stored
           champion_team_id='c1010000-0000-4000-8000-000000000011'
     where id = 'c1010000-0000-4000-8000-000000000001';
    select public.clear_bracket_atomic('c1010000-0000-4000-8000-000000000023') into v_n;
    select champion_team_id into v_champ from public.tournaments where id = 'c1010000-0000-4000-8000-000000000001';
    insert into t_out values ('close, reopen, clear also leaves a null champion', v_champ is null,
      coalesce(v_champ::text,'<null>'));
  exception when others then
    insert into t_out values ('close, reopen, clear also leaves a null champion', false, sqlstate || ' ' || sqlerrm);
  end $h$;

  -- 8. an EARLY winners game unwinds the whole played chain, leaves the untouched sibling alone, and
  --    BLANKS but does not reset a scheduled downstream match
  do $h$
  declare v_n int; v_sib text; v_l_b uuid; v_l_st text; v_gf_a uuid;
  begin
    update public.matches set status='final', score_a=21, score_b=18,
           winner_team_id='c1010000-0000-4000-8000-000000000011',
           loser_team_id='c1010000-0000-4000-8000-000000000013'
     where id = 'c1010000-0000-4000-8000-000000000023';
    select public.clear_bracket_atomic('c1010000-0000-4000-8000-000000000021') into v_n;
    insert into t_out values ('an early winners game unwinds its whole played chain', v_n = 2, v_n::text);
    select status into v_sib from public.matches where id = 'c1010000-0000-4000-8000-000000000022';
    insert into t_out values ('the untouched sibling is left alone', v_sib = 'final', v_sib);
    select team_b_id, status into v_l_b, v_l_st from public.matches where id = 'c1010000-0000-4000-8000-000000000024';
    insert into t_out values ('a scheduled downstream match is blanked but not reset',
      v_l_b is null and v_l_st = 'scheduled', coalesce(v_l_b::text,'<null>') || ' / ' || v_l_st);
    select team_a_id into v_gf_a from public.matches where id = 'c1010000-0000-4000-8000-000000000023';
    insert into t_out values ('the fed slot on the grand final is nulled', v_gf_a is null,
      coalesce(v_gf_a::text,'<null>'));
  exception when others then
    insert into t_out values ('an early winners game unwinds its whole played chain', false, sqlstate || ' ' || sqlerrm);
  end $h$;

  -- 9. re-scoring after a clear ADVANCES into an empty slot rather than being dropped by
  --    submit_match_score's silent `and %I is null and status = 'scheduled'` write
  do $h$
  declare m public.matches; v_gf_a uuid;
  begin
    select * into m from public.submit_match_score('c1010000-0000-4000-8000-000000000021',
      (select version from public.matches where id = 'c1010000-0000-4000-8000-000000000021'), 21, 12, null);
    select team_a_id into v_gf_a from public.matches where id = 'c1010000-0000-4000-8000-000000000023';
    insert into t_out values ('re-scoring after a clear advances into the empty slot',
      v_gf_a = 'c1010000-0000-4000-8000-000000000011', coalesce(v_gf_a::text,'<null>'));
  exception when others then
    insert into t_out values ('re-scoring after a clear advances into the empty slot', false, sqlstate || ' ' || sqlerrm);
  end $h$;

  -- 10. the grants are the intended pair after the recreate
  do $h$
  declare v_acl text;
  begin
    select coalesce(proacl::text,'<null>') into v_acl from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'clear_bracket_atomic';
    insert into t_out values ('authenticated only, no anon, no PUBLIC',
      v_acl like '%authenticated=X%' and v_acl not like '%anon=X%' and v_acl not like '%=X/%', v_acl);
  end $h$;

select * from t_out;
rollback;
```

  **Expected messages, verbatim:** `That game is not here any more.`, `Only an organizer can clear a bracket` (42501), `That is not a bracket game.`, `That game has no result to clear.`, `A game further along is being scored right now. Finish that one first.`

- [ ] **Step 3 (CONTROLLER): the residue probes.** SEPARATE calls, after the rollback. `to_regclass` answers for tables and would PASS while a function stayed deployed, so the instrument here is `to_regprocedure` and `pg_get_functiondef`:
```sql
select to_regprocedure('public.clear_bracket_atomic(uuid)') as fn;                       -- expect the OLD one
select pg_get_functiondef('public.clear_bracket_atomic(uuid)'::regprocedure) as def;     -- must read RETURNS void
select count(*) as left_over from public.tournaments where id = 'c1010000-0000-4000-8000-000000000001'; -- expect 0
```
`def` NOT containing `RETURNS void` after the rollback STOPS the round: the harness committed.

- [ ] **Step 4 (CONTROLLER): apply.** `apply_migration` named `0062_clear_bracket_result`. Post-apply:
```sql
select pg_get_functiondef(p.oid) as def, coalesce(p.proacl::text,'<null>') as acl,
       pg_get_function_result(p.oid) as returns
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'clear_bracket_atomic';
```
`returns` must be `integer`; `def` diffed against the file verbatim; `acl` must carry `authenticated=X/` with no `anon=` and no leading `=X/`. Then `get_advisors(security)` (zero NEW against P3) and the P2 count query (every number unmoved). Then ONE real anon REST call expecting a permission error:
```bash
KEY=$(node -e "const s=require('fs').readFileSync('public/supabase-config.js','utf8');console.log(/const SUPABASE_KEY = '([^']+)'/.exec(s)[1])")
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  'https://mlzblkzflgylnjorgjcp.supabase.co/rest/v1/rpc/clear_bracket_atomic' \
  -H "apikey: $KEY" -H "Content-Type: application/json" \
  -d '{"p_match":"00000000-0000-4000-8000-000000000000"}'
```
Expect `404` or `403`. A `200` STOPS the round.

- [ ] **Step 5: the pure helper.** `public/pure.js` (CRLF), added beside `bracketGameNumbers` and exported in the list at 2049-2078.

```js
// C101 Task 5: the client's mirror of clear_bracket_atomic's COLLECTION step, so the sweep is testable
// without a database and the card can say how many results a clear will take. `reset` is the target plus
// every downstream match reachable through winner_next_match_id / loser_next_match_id that is NOT
// 'scheduled' (the RPC's `with recursive chain`); `blank` is one {match, slot} per fed slot those matches
// point at, using the 0039:259 mapping where slot 1 means team_b_id and anything else means team_a_id.
// Breadth-first from the target, so the order is stable and readable.
function bracketClearPlan(matchId, matches) {
  const byId = new Map();
  (matches || []).forEach((m) => { if (m && m.id != null) byId.set(String(m.id), m); });
  if (!byId.has(String(matchId))) return { reset: [], blank: [] };
  const reset = [];
  const seen = new Set();
  const queue = [String(matchId)];
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    reset.push(id);
    const m = byId.get(id);
    if (!m) continue;
    [m.winner_next_match_id, m.loser_next_match_id].forEach((nx) => {
      if (nx == null) return;
      const n = byId.get(String(nx));
      if (n && n.status !== 'scheduled' && !seen.has(String(nx))) queue.push(String(nx));
    });
  }
  const blank = [];
  reset.forEach((id) => {
    const m = byId.get(id);
    if (!m) return;
    if (m.winner_next_match_id != null) blank.push({ match: String(m.winner_next_match_id), slot: Number(m.winner_next_slot) === 1 ? 'b' : 'a' });
    if (m.loser_next_match_id != null) blank.push({ match: String(m.loser_next_match_id), slot: Number(m.loser_next_slot) === 1 ? 'b' : 'a' });
  });
  return { reset, blank };
}
```
  Export line: add `bracketClearPlan,` immediately after `bracketGameNumbers, bracketSourceLabel,` in the `module.exports` block.

- [ ] **Step 6: the writer.** `public/app.js`, immediately above `tdbResetBracket` (2606):

```js
// C101 Task 5 / migration 0062: clear ONE bracket result and everything it sent through. The RPC RETURNS
// the number of matches it reset, which is what turns `returns void` (which gave the client nothing against
// the read-back law) into a verifiable call. It NEVER falls back to a direct matches write: that would be
// non-atomic and would leave no action_log row, so a failure here has to be reported as a failure.
async function tdbClearBracketResult(match) {
  if (!supabaseClient || !match || !match.id) throw new Error('No game.');
  const { data, error } = await supabaseClient.rpc('clear_bracket_atomic', { p_match: match.id });
  if (error) { console.error('tdbClearBracketResult', error); throw error; }
  const n = Number(Array.isArray(data) ? data[0] : data);
  if (!Number.isFinite(n) || n < 1) throw new Error('Nothing was cleared. Refresh and try again.');
  return n;
}
```

- [ ] **Step 7: the control.** `public/app.js`, `buildMgScoreSheetHTML` (12041-12127). Two edits.

  (a) the `.mgv-scfoot` gains the clear beside the `edit` primary, rendered only on a finished game and only for an admin:

```js
  const primary = `<button type="button" class="mgv-scfinal" data-mgss="${isFinal ? 'edit' : 'final'}"${canFinal ? '' : ' disabled'}>`
    + `${escapeHTML(mgScoreFinalLabel(aName, bName, a, b, isFinal, pick))}</button>`;
  // "add to the score card a way for live scoring that can be saved" (2026-08-24): the secondary saves the
  // running score and keeps the game in progress.
  const quiet = isFinal ? '' : `<button type="button" class="mgv-sclive" data-mgss="live">${match.status === 'live' ? 'Update live score' : 'Save live score'}</button>`;
  // C101 Task 5 / migration 0062: "Clear this result", never "Undo". Mike removed the Undo strip, the
  // bracket page bans the literal (test/manage-round.test.js:2268), the clear lives in the score CARD and
  // not on the page, and the edit hint above already says "clear the result first", which this makes true.
  // Admin only: a signed-in player may SCORE a not-yet-final game (canScoreMatch) and must never clear one.
  const clear = (isFinal && state.isAdmin)
    ? `<button type="button" class="mgv-scclear" data-mgss="clear">Clear this result</button>` : '';
  return head + body + `<div class="mgv-scfoot">${primary}${quiet}${clear}</div>`;
```

  (b) the drift fix, in the SAME card. `sync()`'s recomputed `canFinal` (app.js:12179) is missing the clause the build-time version at app.js:12118 carries. Benign today, wrong tomorrow:

```js
      // C101 Task 5: brought into line with the build-time expression at buildMgScoreSheetHTML. A FINISHED
      // bracket game with no score on it cannot be re-submitted (edit_match_score derives the winner from
      // the scores and refuses 0-0), so the primary must stay dead until a point goes in.
      const canFinal = match.phase === 'main'
        ? (!!pick && !(a === b && a > 0) && !(isFinal && a === 0 && b === 0))
        : a !== b;
```

  (c) the CSS for the new control, appended under the MANAGE DESIGN ROUND banner (`public/styles.css`, CRLF):

```css
/* PORT NOTE, C101 Task 5 (2026-08-25): "Clear this result" is the quiet destructive action inside the
   score card. It sits under the primary, not beside it, so a thumb going for Save cannot find it, and it
   borrows .mgv-sclive's geometry so the foot keeps one rhythm. No new !important. */
.mgv-scclear {
  width: 100%; margin-top: 10px; padding: 11px 14px;
  border: 1px solid oklch(0.55 0.16 25 / .24); border-radius: 11px;
  background: transparent; color: var(--danger);
  font: 600 13.5px 'Inter', sans-serif; cursor: pointer;
}
```

- [ ] **Step 8: the handler.** `public/app.js`, inside `openMgScoreSheet`, beside `doLive` and wired in the click delegate.

```js
  const doClear = async () => {
    if (submitting) return;
    // The confirm's second sentence is true ONLY because guard (e) in 0062 refuses a live downstream game.
    // If that guard is ever loosened, this copy has to warn that a game in progress is wiped.
    const ok = await appConfirm({
      title: 'Clear this result',
      message: 'The score goes and the teams it sent through come back. This cannot be undone.',
      confirmText: 'Clear it',
      danger: true,
    });
    if (!ok) return;
    submitting = true;
    try {
      await tdbClearBracketResult(match);
      await tdbRefreshTournaments();
      closeMgScoreSheet();
      afterSave();
    } catch (e) { fail((e && e.message) || 'Could not clear the result.'); submitting = false; }
  };
```
  and in the delegate, immediately after the `live` branch:
```js
    if (role === 'live') { void doLive(); return; }
    if (role === 'clear') { void doClear(); return; }   // C101 Task 5
```

- [ ] **Step 9: the tests.**

  (a) `test/manage-round.test.js`, a new describe. `bridge.buildScoreSheet(m, w)` already forwards the winner; add `bridge.clearResult: (m) => tdbClearBracketResult(m)` and `bridge.setAdmin: (v) => { state.isAdmin = !!v; }` to the bridge if they are not already there, without renaming any existing key.

```js
// C101 Task 5 / migration 0062: "Clear this result" in the score CARD. The RPC returns a count, so the
// client never guesses; there is no direct-matches fallback, because a fallback would be non-atomic and
// would leave no audit row.
describe('C101 Task 5 Clear this result', () => {
  const FINAL_GF = { id: 'gf', tournament_id: 'T', phase: 'main', side: 'grand_final', round: 1,
    round_label: 'Grand Final', net: 1, status: 'final', team_a_id: 't1', team_b_id: 't2',
    score_a: 21, score_b: 18, winner_team_id: 't1', version: 3 };

  it('an admin sees Clear on a finished bracket game, under the primary', () => {
    setMainBracketFixture(); bridge.setAdmin(true);
    const html = bridge.buildScoreSheet(FINAL_GF, 'a');
    expect(html).toContain('data-mgss="clear"');
    expect(html).toContain('>Clear this result<');
    expect(html).not.toContain('Undo');
    expect(html.indexOf('data-mgss="edit"')).toBeLessThan(html.indexOf('data-mgss="clear"'));
  });

  it('an unfinished game and a signed-in player never see it', () => {
    setMainBracketFixture(); bridge.setAdmin(true);
    expect(bridge.buildScoreSheet({ ...FINAL_GF, status: 'scheduled', score_a: null, score_b: null }, null))
      .not.toContain('data-mgss="clear"');
    bridge.setAdmin(false);
    expect(bridge.buildScoreSheet(FINAL_GF, 'a')).not.toContain('data-mgss="clear"');
    bridge.setAdmin(true);
  });

  it('the edit hint promises what the card can now do', () => {
    setMainBracketFixture(); bridge.setAdmin(true);
    const html = bridge.buildScoreSheet(FINAL_GF, 'a');
    expect(html).toContain('To change who won, clear the result first.');
    expect(html).toContain('data-mgss="clear"');
  });

  it('the writer sends one argument and reads the count back, and never writes matches directly', async () => {
    const seen = [];
    const undo = bridge.swapSupaRpc((name, args) => { seen.push([name, args]); return { data: 2, error: null }; });
    try {
      await expect(bridge.clearResult(FINAL_GF)).resolves.toBe(2);
      expect(seen).toEqual([['clear_bracket_atomic', { p_match: 'gf' }]]);
    } finally { undo(); }
    const src = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
    const fn = src.slice(src.indexOf('async function tdbClearBracketResult('), src.indexOf('async function tdbResetBracket('));
    expect(fn).not.toContain("from('matches')");
  });

  it('a zero count is a failure, not a success', async () => {
    const undo = bridge.swapSupaRpc(() => ({ data: 0, error: null }));
    try { await expect(bridge.clearResult(FINAL_GF)).rejects.toThrow('Nothing was cleared. Refresh and try again.'); }
    finally { undo(); }
  });

  it('the RPC message is what the card shows, and an RPC-not-ready error degrades honestly', async () => {
    const undo = bridge.swapSupaRpc(() => ({ data: null, error: { message: 'A game further along is being scored right now. Finish that one first.' } }));
    try { await expect(bridge.clearResult(FINAL_GF)).rejects.toThrow('A game further along is being scored right now. Finish that one first.'); }
    finally { undo(); }
    const undo2 = bridge.swapSupaRpc(() => ({ data: null, error: { message: 'Could not find the function public.clear_bracket_atomic' } }));
    try { await expect(bridge.clearResult(FINAL_GF)).rejects.toThrow(/clear_bracket_atomic/); }
    finally { undo2(); }
  });

  it('the confirm gates the call and the delegate reaches the control from a real tap', async () => {
    setMainBracketFixture(); bridge.setAdmin(true);
    const c = bridge.mockScoreCard({ confirm: false });     // a cancelled confirm
    try { await bridge.tapScoreSheet(FINAL_GF, 'clear'); expect(c.calls.filter((x) => x[0] === 'clear').length).toBe(0); }
    finally { c.restore(); }
    const y = bridge.mockScoreCard({ confirm: true, clear: () => 2 });
    try {
      await bridge.tapScoreSheet(FINAL_GF, 'clear');
      expect(y.calls.map((x) => x[0])).toEqual(['confirm', 'clear', 'refresh', 'close', 'after']);
    } finally { y.restore(); }
  });

  it('every RPC the app needs appears as a literal in app.js', () => {
    // This would have caught clear_bracket_atomic sitting dead in the database since 2026-06-19.
    const src = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
    for (const name of ['clear_bracket_atomic', 'set_team_paid', 'read_action_log', 'register_team']) {
      expect(src).toContain("rpc('" + name + "'");
    }
  });
});
```
  `bridge.swapSupaRpc(fn)` mirrors the shipped `swapSupaFrom` (:1548 region) exactly: `swapSupaRpc: (fn) => { const was = supabaseClient.rpc; supabaseClient.rpc = async (...a) => fn(...a); return () => { supabaseClient.rpc = was; }; }`. `bridge.mockScoreCard(o)` swaps `appConfirm`, `tdbClearBracketResult`, `tdbRefreshTournaments`, `closeMgScoreSheet` and `repaintManage` for recorders and returns `{ calls, restore }`, the shape `mockPoolWrites` already uses; `bridge.tapScoreSheet(m, role)` opens the real card and fires its bound click handler with a synthetic `[data-mgss="<role>"]` target, the same technique `withDelegate`'s `tap` uses.

  (b) `test/pure.test.js`, the end-state property. Add `bracketClearPlan` to the destructured require list at the top:

```js
describe('bracketClearPlan (C101 Task 5 - the client mirror of clear_bracket_atomic)', () => {
  // Build a fully PLAYED double-elimination bracket for N teams as match ROWS, seed 1 winning every game.
  function playedBracket(N) {
    const { realMatches } = generateDoubleElim(N, false);
    const idOf = (k) => 'm-' + k;
    const rows = realMatches.map((m) => ({
      id: idOf(m.key), phase: 'main', side: m.side, round: m.round, status: 'final',
      winner_next_match_id: m.winnerNext ? idOf(m.winnerNext.key) : null,
      winner_next_slot: m.winnerNext ? (m.winnerNext.slot === 'b' ? 1 : 2) : null,
      loser_next_match_id: m.loserNext ? idOf(m.loserNext.key) : null,
      loser_next_slot: m.loserNext ? (m.loserNext.slot === 'b' ? 1 : 2) : null,
    }));
    return rows;
  }

  // THE PROPERTY, stated honestly: this is an END-STATE invariant of the FULL sweep. Clearing every game
  // in reverse play order leaves the bracket identical to its generated state. It says NOTHING about any
  // single intermediate clear, and no intermediate assertion should be read into it.
  for (let N = 2; N <= 24; N++) {
    it('N=' + N + ': clearing every game in reverse play order returns the bracket to its generated state', () => {
      const rows = playedBracket(N);
      if (!rows.length) return;
      const byId = new Map(rows.map((r) => [r.id, { ...r }]));
      for (let i = rows.length - 1; i >= 0; i--) {
        const target = byId.get(rows[i].id);
        if (target.status !== 'final') continue;
        const plan = bracketClearPlan(target.id, [...byId.values()]);
        expect(plan.reset[0]).toBe(target.id);
        plan.reset.forEach((id) => { byId.get(id).status = 'scheduled'; });
      }
      // end state: every row scheduled, and the feeder graph untouched by the sweep
      [...byId.values()].forEach((r) => expect(r.status).toBe('scheduled'));
      rows.forEach((r) => {
        const after = byId.get(r.id);
        expect(after.winner_next_match_id).toBe(r.winner_next_match_id);
        expect(after.loser_next_match_id).toBe(r.loser_next_match_id);
      });
    });
  }

  it('a scheduled downstream match is BLANKED but never collected for reset', () => {
    const rows = [
      { id: 'a', status: 'final', winner_next_match_id: 'c', winner_next_slot: 2, loser_next_match_id: 'b', loser_next_slot: 1 },
      { id: 'b', status: 'scheduled', winner_next_match_id: null, loser_next_match_id: null },
      { id: 'c', status: 'scheduled', winner_next_match_id: null, loser_next_match_id: null },
    ];
    const plan = bracketClearPlan('a', rows);
    expect(plan.reset).toEqual(['a']);
    expect(plan.blank).toEqual([{ match: 'c', slot: 'a' }, { match: 'b', slot: 'b' }]);
  });

  it('an unknown id plans nothing', () => {
    expect(bracketClearPlan('nope', [{ id: 'a', status: 'final' }])).toEqual({ reset: [], blank: [] });
  });
});
```

  (c) `test/supabase-writes.test.js`: `clear_bracket_atomic` is already in `MUTATING_RPCS` (:31), so nothing is added there for this task.

- [ ] **Step 10 (CONTROLLER): the FIRST REAL CALL, on Mike's word.** On a THROWAWAY tournament created and removed in ONE FK-safe transaction, never on the June or August rows. One `execute_sql`:
```sql
begin;
  insert into public.tournaments (id, name, community_id, status)
    values ('c1010000-0000-4000-8000-0000000000c5', 'C101 first-call probe',
            '2c3bcfa9-305e-448b-924b-da90c029f575', 'bracket');
  insert into public.teams (id, tournament_id, name, community_id) values
    ('c1010000-0000-4000-8000-0000000000d1','c1010000-0000-4000-8000-0000000000c5','Probe A','2c3bcfa9-305e-448b-924b-da90c029f575'),
    ('c1010000-0000-4000-8000-0000000000d2','c1010000-0000-4000-8000-0000000000c5','Probe B','2c3bcfa9-305e-448b-924b-da90c029f575');
  insert into public.matches (id, tournament_id, phase, side, round, status, team_a_id, team_b_id,
                              score_a, score_b, winner_team_id, loser_team_id, version)
    values ('c1010000-0000-4000-8000-0000000000e1','c1010000-0000-4000-8000-0000000000c5','main','grand_final',1,
            'final','c1010000-0000-4000-8000-0000000000d1','c1010000-0000-4000-8000-0000000000d2',21,15,
            'c1010000-0000-4000-8000-0000000000d1','c1010000-0000-4000-8000-0000000000d2',1);
  select set_config('request.jwt.claims',
    json_build_object('sub', (select profile_id from public.memberships
      where community_id = '2c3bcfa9-305e-448b-924b-da90c029f575' and role = 'owner' limit 1))::text, true) as claims;
  select public.clear_bracket_atomic('c1010000-0000-4000-8000-0000000000e1') as cleared;   -- expect 1
  select status, version from public.matches where id = 'c1010000-0000-4000-8000-0000000000e1';
  select action, detail, prose from public.action_log where entity_id = 'c1010000-0000-4000-8000-0000000000e1';
  -- FK-safe removal, children before parents
  delete from public.matches where tournament_id = 'c1010000-0000-4000-8000-0000000000c5';
  delete from public.action_log where entity_id = 'c1010000-0000-4000-8000-0000000000e1';
  delete from public.teams   where tournament_id = 'c1010000-0000-4000-8000-0000000000c5';
  delete from public.pools   where tournament_id = 'c1010000-0000-4000-8000-0000000000c5';
  delete from public.tournaments where id = 'c1010000-0000-4000-8000-0000000000c5';
commit;
```
Then re-run the P2 count query and confirm every number is back at the baseline. If it is not, the deletes above name exactly which table to look at.

- [ ] **Step 11: Version, checks, suite, commit.** `APP_VERSION` = the next unused `'2026.08.25.N'` when dispatched. `node --check public/app.js && node --check public/pure.js`; confirm the `pure.js` and `styles.css` CRLF counts moved only by the lines added; `cd test && npx vitest run` on the runner's exit code. Commit (do not push):

`feat(bracket): 0062 Clear this result - the shipped clear returns a count, refuses a pool row, a scheduled game and a live downstream one, and the score card finally wires it - v2026.08.25.N`

- [ ] **Step 12 (CONTROLLER): mark it applied.** Replace `-- NOT APPLIED` with the `APPLIED <date> via the Supabase MCP on Mike's word (C101 Task 5)` line naming the integer return, the grants and the first-call probe. Commit it alone: `chore(db): 0062 applied`.

---

### Task 6: `0063_clear_whole_bracket.sql`

**Files:**
- Create: `db/migrations/0063_clear_whole_bracket.sql`
- Modify: `public/app.js` (`tdbClearWholeBracket` new, beside `tdbClearBracketResult`; `mgBracketResetHTML` 12743-12747; `mgBracketClearAll` new, beside `mgBracketReset` 12794; the delegate at 14173; `APP_VERSION`)
- Modify: `public/styles.css` (one variant rule under the MANAGE DESIGN ROUND banner)
- Modify: `test/manage-round.test.js` (a new describe; `:2261-2270` STRENGTHENED, not flipped), `test/supabase-writes.test.js`

**Interfaces:**
- Produces: `public.clear_whole_bracket(p_tournament_id uuid) returns int` (the number of games that were `final` BEFORE the call).
- Produces: `tdbClearWholeBracket(tournamentId)` returning the count; `mgBracketClearAll()` behind the type-the-name unlock.
- Grants: `revoke all ... from public, anon;` then `grant execute ... to authenticated;`.

**§38, DECIDED (Mike, 2026-08-25).** On the bracket strip, "Clear every result" is an OUTLINED danger control: the danger colour as a border and as text, a transparent fill, the same size and radius as the button under it. The existing delete/reset stays the one filled red button. Both keep their confirms. Markup order: **Clear every result ABOVE the delete.** This is a decided fact, not a gate; nothing in this task waits on it.

- [ ] **Step 1: Write the file.** `db/migrations/0063_clear_whole_bracket.sql`, LF:

```sql
-- 0063_clear_whole_bracket.sql. Blank every bracket score without deleting the tree.
--
-- WHY. The bracket page's one destructive control is tdbResetBracket, which DELETES every phase='main' row
-- and drops the tournament to 'pools' (app.js:2606-2612). There is no way to say "the scores are wrong,
-- keep the bracket" without regenerating and re-seeding. This is that way, and it is deliberately NOT the
-- delete: the two controls sit side by side and must be impossible to confuse.
--
-- THE SLOT RULE IS THE WHOLE DESIGN AND IT IS EXACT. generate_bracket_atomic fills team_a_id / team_b_id at
-- generation ONLY when the source carries a seed, and writes the feeder pointers for everything else
-- (app.js:2790-2801). So "was this slot seeded or advanced" is answerable FROM THE GRAPH with no source_a /
-- source_b string parsing: a slot is FED exactly when some match points at it. The two UPDATEs below null
-- exactly the fed slots and leave every seeded one alone. This is also why the copy must NOT say every team
-- goes back to a first-round game: a bye is a seeded slot in a LATER round and its team never moves.
--
-- COUNT RESULTS, NOT ROWS TOUCHED. The blanking UPDATE hits every main row including ones that were never
-- played, so row_count would report "12 results cleared" on a bracket with 3 games in. The count is taken
-- BEFORE the update, from the rows that were 'final'.
--
-- GUARDS: the tournament exists; organizer or owner, 42501; status in ('bracket','completed'). A COMPLETED
-- tournament is deliberately NOT refused: clearing right after a tournament ends is the main reason the
-- control exists, and clear_bracket_atomic already reopens one. Do not "tighten" this later.
--
-- version BUMPS ON EVERY TOUCHED ROW, for the reason written into 0062: submit_match_score and
-- edit_match_score CAS on `version = p_version` (0039:249-253), so a client holding a pre-clear match would
-- otherwise be accepted into a row that was reset underneath it.
--
-- STRUCTURAL PROTECTION, stated so nobody has to remember it. This function touches ONLY phase = 'main'
-- rows. The June 2026 tournament's hand-authored 12-game schedule exists ONLY in the database, no file can
-- regenerate it, and it is phase = 'pool' - so this function cannot reach it whatever June's status is.
-- That claim is verified read-only before the first real call (precondition P6: June must return zero
-- phase='main' matches).
--
-- TWO PRE-EXISTING HAZARDS THIS FILE DOES NOT CLOSE, named so nobody assumes it did:
--   * start_pool_play_atomic deletes ALL of a tournament's pool matches, finals included, with only its
--     status='setup' guard between June and a wipe (0048:90-99);
--   * no constraint, trigger or RLS predicate anywhere references tournaments.status, so anon can still
--     score a scheduled match in a completed tournament through submit_match_score.
--
-- NOT TAKEN: deleting anything. This is not the reset, and the test suite asserts that no matches:delete
-- statement appears anywhere in its flow.
--
-- BEFORE AND AFTER. Before the apply the new control's rpc call fails with an RPC-not-found error, which
-- the bracket page surfaces through appNotice and which NEVER falls back to a direct matches write. After
-- the apply both bracket controls work and read differently on the page.
--
-- =====================================================================================================
-- ROLLBACK BLOCK (verbatim prior definitions + re-grants, apply this whole block to undo 0063)
-- =====================================================================================================
/*
drop function if exists public.clear_whole_bracket(uuid);
-- There is no prior definition: this function is new in 0063.
*/
-- =====================================================================================================
-- END ROLLBACK BLOCK
-- =====================================================================================================
--
-- NOT APPLIED
begin;

create or replace function public.clear_whole_bracket(p_tournament_id uuid)
 returns int
 language plpgsql
 security definer
 set search_path to 'public'
as $fn$
declare v_comm uuid; v_status text; v_name text; n int; v_actor text; v_role text; v_grp text;
begin
  select community_id, status, name into v_comm, v_status, v_name
    from public.tournaments where id = p_tournament_id;
  if not found then raise exception 'That tournament is not here any more.'; end if;
  if not (public.is_organizer(v_comm) or public.is_owner(v_comm)) then
    raise exception 'Only an organizer can clear a bracket' using errcode = '42501';
  end if;
  if v_status not in ('bracket','completed') then
    raise exception 'There is no bracket to clear yet.'; end if;

  -- COUNT RESULTS, not rows touched: the blanking UPDATE hits every main row including ones that were
  -- never played, so row_count would report "12 results cleared" on a bracket with 3 games in.
  select count(*) into n from public.matches
   where tournament_id = p_tournament_id and phase = 'main' and status = 'final';

  update public.matches
     set score_a = null, score_b = null, winner_team_id = null, loser_team_id = null,
         status = 'scheduled', version = version + 1, updated_at = now()
   where tournament_id = p_tournament_id and phase = 'main';
  update public.matches m set team_a_id = null
   where m.tournament_id = p_tournament_id and m.phase = 'main'
     and exists (select 1 from public.matches f where f.tournament_id = m.tournament_id
                  and ((f.winner_next_match_id = m.id and coalesce(f.winner_next_slot,0) <> 1)
                    or (f.loser_next_match_id  = m.id and coalesce(f.loser_next_slot,0)  <> 1)));
  update public.matches m set team_b_id = null
   where m.tournament_id = p_tournament_id and m.phase = 'main'
     and exists (select 1 from public.matches f where f.tournament_id = m.tournament_id
                  and ((f.winner_next_match_id = m.id and f.winner_next_slot = 1)
                    or (f.loser_next_match_id  = m.id and f.loser_next_slot  = 1)));
  update public.tournaments set status = 'bracket', champion_team_id = null, updated_at = now()
   where id = p_tournament_id;

  select a.actor, a.role, a.grp into v_actor, v_role, v_grp from public._audit_actor() a;
  insert into public.action_log(actor, role, grp, action, entity_type, entity_id, detail, prose)
    values (v_actor, coalesce(v_role,'admin'), v_grp, 'clear_whole_bracket', 'tournament',
            p_tournament_id::text, n::text || ' results cleared',
            'cleared every bracket result in ' || coalesce(v_name, '') || ', ' || n::text || ' game'
              || case when n = 1 then '' else 's' end);
  return n;
end $fn$;

revoke all on function public.clear_whole_bracket(uuid) from public, anon;
grant execute on function public.clear_whole_bracket(uuid) to authenticated;

commit;
```

- [ ] **Step 2 (CONTROLLER): the rolled-back harness.** ONE `execute_sql` batch, the file's `begin;`/`commit;` stripped. The fixture is a HALF-played bracket with a seeded first round, a bye seeded into round 2, and a pool game that must survive.

```sql
begin;
  create temp table t_out(name text, ok boolean, got text);
  create temp table t_who as
    select profile_id as uid from public.memberships
     where community_id = '2c3bcfa9-305e-448b-924b-da90c029f575' and role = 'owner' limit 1;

  insert into public.tournaments (id, name, community_id, status, champion_team_id)
    values ('c1010000-0000-4000-8000-000000000001', 'C101 harness',
            '2c3bcfa9-305e-448b-924b-da90c029f575', 'completed', null);
  insert into public.teams (id, tournament_id, name, community_id) values
    ('c1010000-0000-4000-8000-000000000011','c1010000-0000-4000-8000-000000000001','Sand Sharks','2c3bcfa9-305e-448b-924b-da90c029f575'),
    ('c1010000-0000-4000-8000-000000000012','c1010000-0000-4000-8000-000000000001','Net Gains','2c3bcfa9-305e-448b-924b-da90c029f575'),
    ('c1010000-0000-4000-8000-000000000013','c1010000-0000-4000-8000-000000000001','Block Party','2c3bcfa9-305e-448b-924b-da90c029f575'),
    ('c1010000-0000-4000-8000-000000000014','c1010000-0000-4000-8000-000000000001','Dig It','2c3bcfa9-305e-448b-924b-da90c029f575');
  update public.tournaments set champion_team_id = 'c1010000-0000-4000-8000-000000000011'
   where id = 'c1010000-0000-4000-8000-000000000001';
  -- W1: SEEDED both slots, played. W2: its team_a is SEEDED (a bye into round 2), its team_b is FED by W1.
  insert into public.matches (id, tournament_id, phase, side, round, status, team_a_id, team_b_id,
                              score_a, score_b, winner_team_id, loser_team_id, version,
                              winner_next_match_id, winner_next_slot, loser_next_match_id, loser_next_slot) values
    ('c1010000-0000-4000-8000-000000000021','c1010000-0000-4000-8000-000000000001','main','winners',1,'final',
     'c1010000-0000-4000-8000-000000000011','c1010000-0000-4000-8000-000000000012',21,15,
     'c1010000-0000-4000-8000-000000000011','c1010000-0000-4000-8000-000000000012',4,
     'c1010000-0000-4000-8000-000000000022',1,null,null),
    ('c1010000-0000-4000-8000-000000000022','c1010000-0000-4000-8000-000000000001','main','winners',2,'scheduled',
     'c1010000-0000-4000-8000-000000000013','c1010000-0000-4000-8000-000000000011',null,null,null,null,1,
     null,null,null,null);
  insert into public.pools (id, tournament_id, label, display_order)
    values ('c1010000-0000-4000-8000-00000000000a','c1010000-0000-4000-8000-000000000001','A',0);
  insert into public.matches (id, tournament_id, phase, pool_id, status, team_a_id, team_b_id,
                              score_a, score_b, winner_team_id, net, queue_order, version)
    values ('c1010000-0000-4000-8000-000000000031','c1010000-0000-4000-8000-000000000001','pool',
            'c1010000-0000-4000-8000-00000000000a','final',
            'c1010000-0000-4000-8000-000000000011','c1010000-0000-4000-8000-000000000012',21,9,
            'c1010000-0000-4000-8000-000000000011',1,1,7);

  -- ---- the migration's DDL, begin;/commit; stripped: the create, both grant lines ----

  -- 1. a NO-MEMBERSHIP caller: 42501 AND the exact message, and nothing written
  do $h$
  declare v_n int; v_st text;
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', '00000000-0000-4000-8000-0000000000ff')::text, true);
    begin
      select public.clear_whole_bracket('c1010000-0000-4000-8000-000000000001') into v_n;
      insert into t_out values ('no-membership caller is refused', false, 'it returned ' || v_n::text);
    exception when others then
      insert into t_out values ('no-membership caller is refused',
        sqlstate = '42501' and sqlerrm = 'Only an organizer can clear a bracket', sqlstate || ' ' || sqlerrm);
    end;
    select status into v_st from public.matches where id = 'c1010000-0000-4000-8000-000000000021';
    insert into t_out values ('the refused call wrote nothing', v_st = 'final', v_st);
  end $h$;

  -- 2. a setup / pools tournament raises the exact message
  do $h$
  declare v_n int;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', (select uid from t_who))::text, true);
    update public.tournaments set status = 'pools' where id = 'c1010000-0000-4000-8000-000000000001';
    select public.clear_whole_bracket('c1010000-0000-4000-8000-000000000001') into v_n;
    insert into t_out values ('a pools tournament is refused', false, 'it returned ' || v_n::text);
  exception when others then
    insert into t_out values ('a pools tournament is refused',
      sqlerrm = 'There is no bracket to clear yet.', sqlstate || ' ' || sqlerrm);
  end $h$;

  -- 3. an unknown id is refused
  do $h$
  declare v_n int;
  begin
    select public.clear_whole_bracket('c1010000-0000-4000-8000-0000000000ee') into v_n;
    insert into t_out values ('an unknown id is refused', false, 'it returned ' || v_n::text);
  exception when others then
    insert into t_out values ('an unknown id is refused',
      sqlerrm = 'That tournament is not here any more.', sqlstate || ' ' || sqlerrm);
  end $h$;

  -- 4. the real clear: the count is the RESULTS, the seeded pairings stay, the fed slots go, the pool
  --    game survives untouched, a completed tournament comes back as bracket with a null champion,
  --    and every touched row's version is one higher
  do $h$
  declare v_n int; v_st text; v_champ uuid; v_a uuid; v_b uuid; v_v1 int; v_v2 int; v_pv int; v_pst text;
          v_prose text; v_detail text;
  begin
    update public.tournaments set status = 'completed' where id = 'c1010000-0000-4000-8000-000000000001';
    select public.clear_whole_bracket('c1010000-0000-4000-8000-000000000001') into v_n;
    insert into t_out values ('the count is the RESULTS, not the row count', v_n = 1, v_n::text);
    select status, version into v_st, v_v1 from public.matches where id = 'c1010000-0000-4000-8000-000000000021';
    insert into t_out values ('every main row is scheduled and bumped', v_st = 'scheduled' and v_v1 = 5,
      v_st || ' v' || v_v1::text);
    select team_a_id, team_b_id, version into v_a, v_b, v_v2 from public.matches
     where id = 'c1010000-0000-4000-8000-000000000022';
    insert into t_out values ('a SEEDED slot survives (the bye into round 2)',
      v_a = 'c1010000-0000-4000-8000-000000000013', coalesce(v_a::text,'<null>'));
    insert into t_out values ('a FED slot is nulled', v_b is null, coalesce(v_b::text,'<null>'));
    insert into t_out values ('the never-played row bumped too', v_v2 = 2, v_v2::text);
    select status, version into v_pst, v_pv from public.matches where id = 'c1010000-0000-4000-8000-000000000031';
    insert into t_out values ('the POOL game is untouched, score and version', v_pst = 'final' and v_pv = 7,
      v_pst || ' v' || v_pv::text);
    select status, champion_team_id into v_st, v_champ from public.tournaments
     where id = 'c1010000-0000-4000-8000-000000000001';
    insert into t_out values ('a completed tournament comes back as bracket with a null champion',
      v_st = 'bracket' and v_champ is null, v_st || ' / ' || coalesce(v_champ::text,'<null>'));
    select prose, detail into v_prose, v_detail from public.action_log
     where action = 'clear_whole_bracket' order by at desc limit 1;
    insert into t_out values ('the prose and the detail both carry the RESULT count',
      v_prose = 'cleared every bracket result in C101 harness, 1 game' and v_detail = '1 results cleared',
      coalesce(v_prose,'<null>'));
  exception when others then
    insert into t_out values ('the count is the RESULTS, not the row count', false, sqlstate || ' ' || sqlerrm);
  end $h$;

  -- 5. re-scoring after the clear advances into an EMPTY slot
  do $h$
  declare m public.matches; v_b uuid;
  begin
    select * into m from public.submit_match_score('c1010000-0000-4000-8000-000000000021',
      (select version from public.matches where id = 'c1010000-0000-4000-8000-000000000021'), 21, 12, null);
    select team_b_id into v_b from public.matches where id = 'c1010000-0000-4000-8000-000000000022';
    insert into t_out values ('re-scoring after the clear advances into the empty slot',
      v_b = 'c1010000-0000-4000-8000-000000000011', coalesce(v_b::text,'<null>'));
  exception when others then
    insert into t_out values ('re-scoring after the clear advances into the empty slot', false, sqlstate || ' ' || sqlerrm);
  end $h$;

  -- 6. a HALF-played bracket returns the played number, not the total
  do $h$
  declare v_n int;
  begin
    update public.matches set status = 'scheduled', winner_team_id = null, score_a = null, score_b = null
     where tournament_id = 'c1010000-0000-4000-8000-000000000001' and phase = 'main';
    update public.matches set status = 'final', score_a = 21, score_b = 9,
           winner_team_id = 'c1010000-0000-4000-8000-000000000011'
     where id = 'c1010000-0000-4000-8000-000000000021';
    update public.tournaments set status = 'bracket' where id = 'c1010000-0000-4000-8000-000000000001';
    select public.clear_whole_bracket('c1010000-0000-4000-8000-000000000001') into v_n;
    insert into t_out values ('a half-played bracket returns the played number', v_n = 1, v_n::text);
  exception when others then
    insert into t_out values ('a half-played bracket returns the played number', false, sqlstate || ' ' || sqlerrm);
  end $h$;

  -- 7. the grants
  do $h$
  declare v_acl text;
  begin
    select coalesce(proacl::text,'<null>') into v_acl from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'clear_whole_bracket';
    insert into t_out values ('authenticated only, no anon, no PUBLIC',
      v_acl like '%authenticated=X%' and v_acl not like '%anon=X%' and v_acl not like '%=X/%', v_acl);
  end $h$;

select * from t_out;
rollback;
```

  **Expected messages, verbatim:** `That tournament is not here any more.`, `Only an organizer can clear a bracket` (42501), `There is no bracket to clear yet.`

- [ ] **Step 3 (CONTROLLER): the residue probes.** SEPARATE calls, after the rollback:
```sql
select to_regprocedure('public.clear_whole_bracket(uuid)') as fn;    -- expect null
select count(*) as left_over from public.tournaments where id = 'c1010000-0000-4000-8000-000000000001'; -- expect 0
```

- [ ] **Step 4 (CONTROLLER): apply.** `apply_migration` named `0063_clear_whole_bracket`. Post-apply: `pg_get_functiondef` diffed against the file verbatim; `pg_get_function_result` = `integer`; `proacl` carries `authenticated=X/` and no `anon=` and no leading `=X/`; `get_advisors(security)` zero NEW against P3; the P2 count query unmoved; and ONE anon REST call:
```bash
KEY=$(node -e "const s=require('fs').readFileSync('public/supabase-config.js','utf8');console.log(/const SUPABASE_KEY = '([^']+)'/.exec(s)[1])")
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  'https://mlzblkzflgylnjorgjcp.supabase.co/rest/v1/rpc/clear_whole_bracket' \
  -H "apikey: $KEY" -H "Content-Type: application/json" \
  -d '{"p_tournament_id":"00000000-0000-4000-8000-000000000000"}'
```
Expect `404` or `403`. A `200` STOPS the round.

- [ ] **Step 5: the writer.** `public/app.js`, immediately after `tdbClearBracketResult`:

```js
// C101 Task 6 / migration 0063: blank every bracket score WITHOUT deleting the tree. This is NOT
// tdbResetBracket, which deletes every phase='main' row and drops to 'pools'; the two live side by side on
// the bracket page and must be impossible to confuse. The RPC returns the number of games that were FINAL
// before the call, which is the number the copy and the log row both carry.
async function tdbClearWholeBracket(tournamentId) {
  if (!supabaseClient || !tournamentId) throw new Error('No tournament.');
  const { data, error } = await supabaseClient.rpc('clear_whole_bracket', { p_tournament_id: tournamentId });
  if (error) { console.error('tdbClearWholeBracket', error); throw error; }
  const n = Number(Array.isArray(data) ? data[0] : data);
  if (!Number.isFinite(n)) throw new Error('That did not go through. Refresh and try again.');
  return n;
}
```

- [ ] **Step 6: the two controls.** `public/app.js`, `mgBracketResetHTML` (12743-12747). The new control goes ABOVE the delete, per Mike's §38 answer; the existing `data-mgbk-reset` button, its class and its note are untouched:

```js
// C101 Task 6 (Mike's §38 answer, 2026-08-25): TWO danger controls on this strip, and they must not read
// alike. "Clear every result" is the OUTLINED one and sits ABOVE the delete; "Reset the bracket" keeps the
// class and the copy it ships with. Both stay behind the type-the-name unlock.
function mgBracketResetHTML() {
  return `<div class="pl-sect mgv-dsect" aria-hidden="true"></div>`
    + `<button type="button" class="mgts-danger mgts-danger-outline" data-mgbk-clear>Clear every result</button>`
    + `<div class="mgbk-note">Blanks every bracket score. The bracket keeps its shape and every seeded pairing stays. Type the tournament name to confirm.</div>`
    + `<button type="button" class="mgts-danger" data-mgbk-reset>Reset the bracket</button>`
    + `<div class="mgbk-note">Clears the bracket and returns to pools. Pool games and scores are kept. Type the tournament name to confirm.</div>`;
}
```

- [ ] **Step 7: the handler and the delegate.** `public/app.js`, immediately above `mgBracketReset` (12794), and the delegate line beside app.js:14173:

```js
// C101 Task 6: the NON-destructive clear. Same type-the-name unlock as the reset beside it (appPrompt), a
// different verb, and a read-back: the RPC returns the results it cleared, so the notice can say what
// happened instead of assuming it.
async function mgBracketClearAll() {
  if (!state.isAdmin) return;
  const t = mgBracketTournament();
  if (!t) return;
  const nm = (t.name || '').trim() || 'this tournament';
  const typed = await appPrompt({ title: 'Clear every result', message: 'This blanks every bracket score. The bracket keeps its shape and every seeded pairing stays. Type the tournament name to confirm.', placeholder: nm, confirmText: 'Clear every result' });
  if (String(typed || '').trim() !== nm) return;
  try {
    const n = await tdbClearWholeBracket(t.id);
    state.tournamentPickedTeamId = null; state.bracketSide = null; state.bracketRound = null;
    await tdbRefreshTournaments();
    repaintManage();
    appNotice({ title: 'Bracket cleared', message: n === 1 ? '1 result cleared. The bracket kept its shape.' : n + ' results cleared. The bracket kept its shape.' });
  } catch (err) { appNotice({ title: 'Could not clear the results', message: (err && err.message) || 'Try again.' }); }
}
```
```js
          if (e.target.closest('[data-mgbk-clear]')) { void mgBracketClearAll(); return; }   // C101 Task 6
          if (e.target.closest('[data-mgbk-reset]')) { void mgBracketReset(); return; }
```

- [ ] **Step 8: the CSS variant.** `public/styles.css` (CRLF), appended under the `MANAGE DESIGN ROUND - 2026-08-25` banner:

```css
/* PORT NOTE, C101 Task 6 (Mike's §38 answer, 2026-08-25): the bracket strip carries two danger controls
   and they must not read alike. "Clear every result" is the OUTLINED one: the danger colour as a border
   and as text, a transparent fill, the same 12px radius and the same size as the button under it.
   "Reset the bracket" is left exactly as it ships. GROUND TRUTH, so nobody is surprised: styles.css:2442
   already draws .mgts-danger with a transparent background, so this variant states the outline
   explicitly rather than inheriting it, and today the pair is told apart by border weight, text weight
   and copy rather than by fill. Whether the RESET should become a filled red button so the contrast is a
   fill is carried to Mike at the hand-back (Task 8) and is a one-line change if he says yes.
   No new !important. */
.mgts-danger-outline {
  border: 1px solid oklch(0.55 0.16 25 / .22);
  background: transparent;
  color: var(--danger);
  font-weight: 500;
}
.mgts-danger-outline + .mgbk-note { margin-bottom: 16px; }
```

- [ ] **Step 9: the tests.**

  (a) `test/manage-round.test.js:2261-2270`, STRENGTHENED rather than flipped. The control shipping here is "Clear every result", so the banned literal `Clear every score` stays green as written; assert the two NAMED controls instead of relying on that accident:

```js
  // C101 Task 6 / migration 0063: the data round DID land here, and this guard is strengthened rather
  // than flipped. The strip now carries exactly two controls, "Clear every result" (the outlined,
  // NON-destructive clear, Mike's §38 answer 2026-08-25) above "Reset the bracket" (the delete, which
  // keeps its class and its copy). The three banned literals stay banned: no bkr-undo, no
  // "Clear every score", no "Undo" anywhere.
  it('rides between the controls and the board, and carries exactly the two named danger controls', () => {
    setMainBracketFixture();
    const html = bridge.buildBracket();
    expect(html.indexOf('data-mgbk-players')).toBeLessThan(html.indexOf('class="bkr-strip"'));
    expect(html.indexOf('class="bkr-strip"')).toBeLessThan(html.indexOf('class="mgv-bkr"'));
    expect(html).not.toContain('bkr-undo');
    expect(html).not.toContain('Clear every score');
    expect(html).not.toContain('Undo');
    expect(count(html, 'data-mgbk-clear')).toBe(1);
    expect(count(html, 'data-mgbk-reset')).toBe(1);
    expect(html.indexOf('data-mgbk-clear')).toBeLessThan(html.indexOf('data-mgbk-reset'));
    // the filled one and the outlined one, told apart by class and by copy
    expect(html).toContain('class="mgts-danger mgts-danger-outline" data-mgbk-clear>Clear every result<');
    expect(html).toContain('class="mgts-danger" data-mgbk-reset>Reset the bracket<');
    expect(count(html, 'mgts-danger-outline')).toBe(1);
    expect(html).toContain('The bracket keeps its shape and every seeded pairing stays.');
    expect(html).toContain('Clears the bracket and returns to pools. Pool games and scores are kept.');
    expect(count(html, 'Type the tournament name to confirm.')).toBe(2);   // both stay behind the unlock
  });
```

  (b) a new describe in the same file:

```js
describe('C101 Task 6 Clear every result', () => {
  it('the writer sends one argument, reads the count back, and never deletes', async () => {
    const seen = [];
    const undo = bridge.swapSupaRpc((name, args) => { seen.push([name, args]); return { data: 7, error: null }; });
    try {
      await expect(bridge.clearWhole('T')).resolves.toBe(7);
      expect(seen).toEqual([['clear_whole_bracket', { p_tournament_id: 'T' }]]);
    } finally { undo(); }
    const src = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
    const fn = src.slice(src.indexOf('async function tdbClearWholeBracket('), src.indexOf('async function tdbResetBracket('));
    expect(fn).not.toContain('.delete(');
    expect(fn).not.toContain("from('matches')");
    const handler = src.slice(src.indexOf('async function mgBracketClearAll('), src.indexOf('async function mgBracketReset('));
    expect(handler).not.toContain('.delete(');
    expect(handler).toContain('appPrompt');       // it is NOT the delete, and it still asks for the name
  });

  it('a wrong typed name makes no call at all, and the right one calls once', async () => {
    setMainBracketFixture();
    const m = bridge.mockBracketDanger({ typed: 'not the name' });
    try { await bridge.clearAll(); expect(m.calls.filter((c) => c[0] === 'clearWhole').length).toBe(0); }
    finally { m.restore(); }
    const y = bridge.mockBracketDanger({ typed: bridge.leadTournament().name, clearWhole: () => 3 });
    try {
      await bridge.clearAll();
      expect(y.calls.map((c) => c[0])).toEqual(['prompt', 'clearWhole', 'refresh', 'repaint', 'notice']);
      expect(y.calls.find((c) => c[0] === 'notice')[1]).toBe('Bracket cleared');
    } finally { y.restore(); }
  });

  it('a refused call surfaces the RPC message and clears nothing', async () => {
    setMainBracketFixture();
    const m = bridge.mockBracketDanger({
      typed: bridge.leadTournament().name,
      clearWhole: () => { throw new Error('There is no bracket to clear yet.'); },
    });
    try {
      await bridge.clearAll();
      expect(m.calls.find((c) => c[0] === 'notice')[1]).toBe('Could not clear the results');
      expect(m.calls.some((c) => c[0] === 'repaint')).toBe(false);
    } finally { m.restore(); }
  });

  it('the delegate reaches BOTH controls from a real tap, and they go to different handlers', async () => {
    setMainBracketFixture(); bridge.setMgtView('bracket');
    const m = bridge.mockBracketDanger({ typed: '' });
    try {
      await withDelegate(async (tap) => { tap('data-mgbk-clear'); await Promise.resolve(); });
      await withDelegate(async (tap) => { tap('data-mgbk-reset'); await Promise.resolve(); });
      expect(m.calls.filter((c) => c[0] === 'prompt').map((c) => c[1]))
        .toEqual(['Clear every result', 'Reset the bracket']);
    } finally { m.restore(); }
  });
});
```
  `bridge.clearWhole: (id) => tdbClearWholeBracket(id)`, `bridge.clearAll: () => mgBracketClearAll()` and `bridge.mockBracketDanger(o)` (swapping `appPrompt`, `tdbClearWholeBracket`, `tdbResetBracket`, `tdbRefreshTournaments`, `repaintManage`, `appNotice` for recorders and returning `{ calls, restore }`, the `mockPoolWrites` shape) are added beside the existing bridge keys without renaming any of them. `:2500` (no `.bkr-undo` in the CSS) stays green untouched.

  (c) `test/supabase-writes.test.js`: add `'clear_whole_bracket',` to `MUTATING_RPCS`.

- [ ] **Step 10 (CONTROLLER): the FIRST REAL CALL, on Mike's word.** On a THROWAWAY tournament created and removed in ONE FK-safe transaction, never on the June or August rows:
```sql
begin;
  insert into public.tournaments (id, name, community_id, status)
    values ('c1010000-0000-4000-8000-0000000000c6', 'C101 first-call probe',
            '2c3bcfa9-305e-448b-924b-da90c029f575', 'bracket');
  insert into public.teams (id, tournament_id, name, community_id) values
    ('c1010000-0000-4000-8000-0000000000d3','c1010000-0000-4000-8000-0000000000c6','Probe A','2c3bcfa9-305e-448b-924b-da90c029f575'),
    ('c1010000-0000-4000-8000-0000000000d4','c1010000-0000-4000-8000-0000000000c6','Probe B','2c3bcfa9-305e-448b-924b-da90c029f575');
  insert into public.matches (id, tournament_id, phase, side, round, status, team_a_id, team_b_id,
                              score_a, score_b, winner_team_id, version)
    values ('c1010000-0000-4000-8000-0000000000e2','c1010000-0000-4000-8000-0000000000c6','main','winners',1,
            'final','c1010000-0000-4000-8000-0000000000d3','c1010000-0000-4000-8000-0000000000d4',21,15,
            'c1010000-0000-4000-8000-0000000000d3',1);
  select set_config('request.jwt.claims',
    json_build_object('sub', (select profile_id from public.memberships
      where community_id = '2c3bcfa9-305e-448b-924b-da90c029f575' and role = 'owner' limit 1))::text, true) as claims;
  select public.clear_whole_bracket('c1010000-0000-4000-8000-0000000000c6') as cleared;   -- expect 1
  select status, team_a_id, team_b_id, version from public.matches where id = 'c1010000-0000-4000-8000-0000000000e2';
  select action, detail, prose from public.action_log where entity_id = 'c1010000-0000-4000-8000-0000000000c6';
  delete from public.matches where tournament_id = 'c1010000-0000-4000-8000-0000000000c6';
  delete from public.action_log where entity_id = 'c1010000-0000-4000-8000-0000000000c6';
  delete from public.teams   where tournament_id = 'c1010000-0000-4000-8000-0000000000c6';
  delete from public.pools   where tournament_id = 'c1010000-0000-4000-8000-0000000000c6';
  delete from public.tournaments where id = 'c1010000-0000-4000-8000-0000000000c6';
commit;
```
Both team ids must still be present after the clear (they were SEEDED, nothing pointed at that row), and the P2 counts must be back at the baseline.

- [ ] **Step 11: Version, checks, suite, commit.** `APP_VERSION` = the next unused `'2026.08.25.N'` when dispatched. `node --check public/app.js`; the `styles.css` CRLF count moved only by the lines added; `cd test && npx vitest run` on the runner's exit code. Commit (do not push):

`feat(bracket): 0063 Clear every result - blank every bracket score without deleting the tree, seeded pairings kept, and an outlined control above the delete - v2026.08.25.N`

- [ ] **Step 12 (CONTROLLER): mark it applied.** Replace `-- NOT APPLIED` with the `APPLIED <date> via the Supabase MCP on Mike's word (C101 Task 6)` line naming the integer return, the grants and the first-call probe. Commit it alone: `chore(db): 0063 applied`.

---

### Task 7: `0064_move_team_to_pool.sql`

**Files:**
- Create: `db/migrations/0064_move_team_to_pool.sql`
- Modify: `public/pure.js` (add `poolMovePlan`, add it to the export list)
- Modify: `public/app.js` (`tdbMoveTeamToPool` 2256-2261; `mgPoolCardHTML`'s `movable` 11856-11860, its lock line 11884-11885, and the panel note 11904; the team sheet's `pool` role 11536-11542; `APP_VERSION`)
- Modify: `test/manage-round.test.js` (`:1691-1746` FLIPS, `:1959-1978` FLIPS, `:1981-1992` stays green), `test/pure.test.js`, `test/supabase-writes.test.js`

**Interfaces:**
- Produces: `public.move_team_to_pool(p_tournament_id uuid, p_team uuid, p_pool uuid, p_matches jsonb) returns int` (the matches written).
- Produces: pure `poolMovePlan(teamId, fromPoolId, toPoolId, pools, teams, matches) -> { plan }`.
- Changes: `tdbMoveTeamToPool(teamId, poolId)` gains the plan and returns the count. `mgPoolsMoveTeam` (app.js:12349) keeps its write-try / refresh-try split UNCHANGED.
- Grants: `revoke all ... from public, anon;` then `grant execute ... to authenticated;`.

- [ ] **Step 1: Write the file.** `db/migrations/0064_move_team_to_pool.sql`, LF:

```sql
-- 0064_move_team_to_pool.sql. Moving a team between pools rebuilds both pools' unplayed schedules, or refuses.
--
-- WHY. tdbMoveTeamToPool is a bare `teams.pool_id` update (app.js:2256-2261). The team's unplayed fixtures
-- are against the OLD pool's opponents, so after a move it is scheduled against teams it is no longer with
-- and missing from every game in its new pool. C101 Task 0 closed the live corruption path in the UI by
-- withholding Move once the schedule is drawn; this is the server finally enforcing it, and it is what lets
-- Move come back post-draw.
--
-- A PLAN, NOT SERVER ARITHMETIC. "Re-pointing unplayed matches" understates it: a faithful move is a
-- two-pool schedule REGENERATION. The round-aware net layout that makes such a schedule correct lives in
-- pure.js (layoutRoundsOnNets, assignPoolGameSlots, relayoutPoolGamesOnNets) and is proven across 1,984
-- configs by C76; reimplementing it in plpgsql would reintroduce the double-booking bug and create a second
-- source of truth. draw_pools_atomic and start_pool_play_atomic (0048) already establish the
-- compute-in-the-client, apply-atomically-on-the-server shape, and start_pool_play_atomic is the exact
-- precedent: it takes p_matches jsonb, deletes, inserts and flips in one DEFINER call.
--
-- A LIVE GAME IS NEVER DELETED, AND THAT IS A CORRECTED CONTRACT. Refusing only on status = 'final' and
-- deleting everything <> 'final' would destroy a game in progress: set_live_score writes status = 'live'
-- (0030:22), it is granted to anon (0030:30), and it is reachable on any pool game that is not already
-- final. So the refusal covers status in ('final','live') AND the delete is scoped POSITIVELY to
-- status = 'scheduled'. Two independent statements, either of which alone would be enough, because the
-- cost of being wrong here is a live scoreboard vanishing under a scorer's hands.
--
-- GUARDS. A COMPLETED tournament is REFUSED (status must be 'setup' or 'pools'), which is the predicate
-- that keeps the June and August rows out by rule rather than by convention. Either pool holding a 'final'
-- or 'live' pool game is REFUSED. An UNPOOLED team (v_from is null) is ALLOWED: it has no fixtures to move,
-- so only the destination pool is rebuilt, and every predicate is written as
-- `pool_id = p_pool or (v_from is not null and pool_id = v_from)` rather than `pool_id in (v_from, p_pool)`,
-- because the `in` form's null comparison is a silent unknown that happens to work and would not survive an
-- edit. The `for update` on the tournament row serialises two organizers moving at once.
--
-- matches_pool_pair_uq, the partial unique on (tournament_id, pool_id, team_a_id, team_b_id) where
-- phase = 'pool' (0023:19-21), cannot fire here, and it is worth naming WHY: not because delete-then-insert
-- runs in one transaction, but because the final and live refusal already guarantees that no surviving row
-- is left in either rebuilt pool for a regenerated pairing to collide with. Loosen that refusal and the
-- index becomes live again. The supplied plan must also not contain a reversed duplicate pairing of its
-- own, since the index is order-sensitive; poolMovePlan builds from generateRoundRobin, which cannot.
--
-- RETURNS int, the matches written, replacing the zero-row read-back at app.js:2260 (which today throws
-- when the update matched no rows, not when a string failed to match).
--
-- STRUCTURAL PROTECTION. The delete is scoped positively to status = 'scheduled', so even inside an allowed
-- tournament a played or in-progress game survives. Combined with the completed refusal, June's
-- irreplaceable hand-authored schedule is out of reach twice over.
--
-- BEFORE AND AFTER. Before the apply the client's rpc call fails with an RPC-not-found error, which
-- mgPoolsMoveTeam reports through its "Could not move the team" notice and which NEVER falls back to the
-- direct teams update (the fallback is exactly the corruption this file exists to end). After the apply the
-- pre-draw Move (Task 1) and the post-draw Move both go through this one door.
--
-- =====================================================================================================
-- ROLLBACK BLOCK (verbatim prior definitions + re-grants, apply this whole block to undo 0064)
-- =====================================================================================================
/*
drop function if exists public.move_team_to_pool(uuid, uuid, uuid, jsonb);
-- There is no prior definition: this function is new in 0064. The client's pre-0064 write door was
-- `supabaseClient.from('teams').update({ pool_id }).eq('id', teamId).select('id')`, which needs no
-- migration to restore, and which this file exists to replace.
*/
-- =====================================================================================================
-- END ROLLBACK BLOCK
-- =====================================================================================================
--
-- NOT APPLIED
begin;

create or replace function public.move_team_to_pool(
  p_tournament_id uuid, p_team uuid, p_pool uuid, p_matches jsonb)
 returns int
 language plpgsql
 security definer
 set search_path to 'public'
as $fn$
declare v_comm uuid; v_status text; v_from uuid; v_team text; v_label text; n int;
        v_actor text; v_role text; v_grp text;
begin
  select community_id, status into v_comm, v_status
    from public.tournaments where id = p_tournament_id for update;
  if not found then raise exception 'That tournament is not here any more.'; end if;
  if not (public.is_organizer(v_comm) or public.is_owner(v_comm)) then
    raise exception 'Only an organizer can move a team' using errcode = '42501';
  end if;
  if v_status not in ('setup','pools') then
    raise exception 'This tournament is past pool play.'; end if;
  select pool_id, name into v_from, v_team
    from public.teams where id = p_team and tournament_id = p_tournament_id;
  if not found then raise exception 'That team is not in this tournament.'; end if;
  select label into v_label from public.pools where id = p_pool and tournament_id = p_tournament_id;
  if not found then raise exception 'That pool is not in this tournament.'; end if;

  -- v_from IS NULL is legal: an unpooled team has no fixtures to move, so only the destination pool is
  -- rebuilt. Every predicate below is written so a null v_from narrows the scope instead of widening it.
  if exists (select 1 from public.matches
              where tournament_id = p_tournament_id and phase = 'pool'
                and status in ('final','live')
                and (pool_id = p_pool or (v_from is not null and pool_id = v_from))) then
    raise exception 'Those pools have games already played or in progress.'; end if;

  update public.teams set pool_id = p_pool where id = p_team;
  delete from public.matches
   where tournament_id = p_tournament_id and phase = 'pool' and status = 'scheduled'
     and (pool_id = p_pool or (v_from is not null and pool_id = v_from));
  insert into public.matches (tournament_id, phase, pool_id, team_a_id, team_b_id,
                              status, net, queue_order, version)
  select p_tournament_id, 'pool', (m->>'pool_id')::uuid,
         nullif(m->>'team_a_id','')::uuid, nullif(m->>'team_b_id','')::uuid,
         'scheduled', (m->>'net')::int, (m->>'queue_order')::int, 0
    from jsonb_array_elements(p_matches) m;
  get diagnostics n = row_count;

  select a.actor, a.role, a.grp into v_actor, v_role, v_grp from public._audit_actor() a;
  insert into public.action_log(actor, role, grp, action, entity_type, entity_id, detail, prose)
    values (v_actor, coalesce(v_role,'admin'), v_grp, 'move_team_to_pool', 'team', p_team::text,
            n::text || ' games rescheduled',
            'moved ' || v_team || ' to pool ' || coalesce(v_label,'') ||
            ', ' || n::text || ' games rescheduled');
  return n;
end $fn$;

revoke all on function public.move_team_to_pool(uuid, uuid, uuid, jsonb) from public, anon;
grant execute on function public.move_team_to_pool(uuid, uuid, uuid, jsonb) to authenticated;

commit;
```

- [ ] **Step 2 (CONTROLLER): the rolled-back harness.** ONE `execute_sql` batch, the file's `begin;`/`commit;` stripped. Six teams, two pools of three, a drawn but unplayed schedule.

```sql
begin;
  create temp table t_out(name text, ok boolean, got text);
  create temp table t_who as
    select profile_id as uid from public.memberships
     where community_id = '2c3bcfa9-305e-448b-924b-da90c029f575' and role = 'owner' limit 1;

  insert into public.tournaments (id, name, community_id, status, net_count)
    values ('c1010000-0000-4000-8000-000000000001', 'C101 harness',
            '2c3bcfa9-305e-448b-924b-da90c029f575', 'pools', 2);
  insert into public.pools (id, tournament_id, label, display_order) values
    ('c1010000-0000-4000-8000-00000000000a','c1010000-0000-4000-8000-000000000001','A',0),
    ('c1010000-0000-4000-8000-00000000000b','c1010000-0000-4000-8000-000000000001','B',1);
  insert into public.teams (id, tournament_id, name, community_id, pool_id) values
    ('c1010000-0000-4000-8000-000000000011','c1010000-0000-4000-8000-000000000001','Sand Sharks','2c3bcfa9-305e-448b-924b-da90c029f575','c1010000-0000-4000-8000-00000000000a'),
    ('c1010000-0000-4000-8000-000000000012','c1010000-0000-4000-8000-000000000001','Net Gains','2c3bcfa9-305e-448b-924b-da90c029f575','c1010000-0000-4000-8000-00000000000a'),
    ('c1010000-0000-4000-8000-000000000013','c1010000-0000-4000-8000-000000000001','Block Party','2c3bcfa9-305e-448b-924b-da90c029f575','c1010000-0000-4000-8000-00000000000a'),
    ('c1010000-0000-4000-8000-000000000014','c1010000-0000-4000-8000-000000000001','Dig It','2c3bcfa9-305e-448b-924b-da90c029f575','c1010000-0000-4000-8000-00000000000b'),
    ('c1010000-0000-4000-8000-000000000015','c1010000-0000-4000-8000-000000000001','Set Pieces','2c3bcfa9-305e-448b-924b-da90c029f575','c1010000-0000-4000-8000-00000000000b'),
    ('c1010000-0000-4000-8000-000000000016','c1010000-0000-4000-8000-000000000001','Spike Life','2c3bcfa9-305e-448b-924b-da90c029f575',null);
  insert into public.matches (id, tournament_id, phase, pool_id, team_a_id, team_b_id, status, net, queue_order, version) values
    ('c1010000-0000-4000-8000-000000000041','c1010000-0000-4000-8000-000000000001','pool','c1010000-0000-4000-8000-00000000000a','c1010000-0000-4000-8000-000000000011','c1010000-0000-4000-8000-000000000012','scheduled',1,1,0),
    ('c1010000-0000-4000-8000-000000000042','c1010000-0000-4000-8000-000000000001','pool','c1010000-0000-4000-8000-00000000000a','c1010000-0000-4000-8000-000000000011','c1010000-0000-4000-8000-000000000013','scheduled',1,2,0),
    ('c1010000-0000-4000-8000-000000000043','c1010000-0000-4000-8000-000000000001','pool','c1010000-0000-4000-8000-00000000000a','c1010000-0000-4000-8000-000000000012','c1010000-0000-4000-8000-000000000013','scheduled',1,3,0),
    ('c1010000-0000-4000-8000-000000000044','c1010000-0000-4000-8000-000000000001','pool','c1010000-0000-4000-8000-00000000000b','c1010000-0000-4000-8000-000000000014','c1010000-0000-4000-8000-000000000015','scheduled',2,1,0);

  -- ---- the migration's DDL, begin;/commit; stripped: the create, both grant lines ----

  -- 1. a NO-MEMBERSHIP caller: 42501 AND the exact message, and nothing written
  do $h$
  declare v_n int; v_pool uuid;
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', '00000000-0000-4000-8000-0000000000ff')::text, true);
    begin
      select public.move_team_to_pool('c1010000-0000-4000-8000-000000000001',
        'c1010000-0000-4000-8000-000000000013', 'c1010000-0000-4000-8000-00000000000b', '[]'::jsonb) into v_n;
      insert into t_out values ('no-membership caller is refused', false, 'it returned ' || v_n::text);
    exception when others then
      insert into t_out values ('no-membership caller is refused',
        sqlstate = '42501' and sqlerrm = 'Only an organizer can move a team', sqlstate || ' ' || sqlerrm);
    end;
    select pool_id into v_pool from public.teams where id = 'c1010000-0000-4000-8000-000000000013';
    insert into t_out values ('the refused call moved nothing',
      v_pool = 'c1010000-0000-4000-8000-00000000000a', coalesce(v_pool::text,'<null>'));
  end $h$;

  -- 2. an ORGANIZER moves: both pools come back with a complete unplayed schedule, ZERO net
  --    double-bookings (the C76 assertion), and the untouched rows of no other pool are lost
  do $h$
  declare v_n int; v_dup int; v_a int; v_b int;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', (select uid from t_who))::text, true);
    select public.move_team_to_pool('c1010000-0000-4000-8000-000000000001',
      'c1010000-0000-4000-8000-000000000013', 'c1010000-0000-4000-8000-00000000000b',
      json_build_array(
        json_build_object('pool_id','c1010000-0000-4000-8000-00000000000a','team_a_id','c1010000-0000-4000-8000-000000000011','team_b_id','c1010000-0000-4000-8000-000000000012','net',1,'queue_order',1),
        json_build_object('pool_id','c1010000-0000-4000-8000-00000000000b','team_a_id','c1010000-0000-4000-8000-000000000014','team_b_id','c1010000-0000-4000-8000-000000000015','net',2,'queue_order',1),
        json_build_object('pool_id','c1010000-0000-4000-8000-00000000000b','team_a_id','c1010000-0000-4000-8000-000000000014','team_b_id','c1010000-0000-4000-8000-000000000013','net',2,'queue_order',2),
        json_build_object('pool_id','c1010000-0000-4000-8000-00000000000b','team_a_id','c1010000-0000-4000-8000-000000000015','team_b_id','c1010000-0000-4000-8000-000000000013','net',2,'queue_order',3)
      )::jsonb) into v_n;
    insert into t_out values ('the organizer move writes the whole plan', v_n = 4, v_n::text);
    insert into t_out
      select 'the team is in its new pool', pool_id = 'c1010000-0000-4000-8000-00000000000b', coalesce(pool_id::text,'<null>')
        from public.teams where id = 'c1010000-0000-4000-8000-000000000013';
    select count(*) into v_a from public.matches where pool_id = 'c1010000-0000-4000-8000-00000000000a';
    select count(*) into v_b from public.matches where pool_id = 'c1010000-0000-4000-8000-00000000000b';
    insert into t_out values ('both pools were rebuilt, none doubled', v_a = 1 and v_b = 3,
      v_a::text || ' / ' || v_b::text);
    -- the C76 assertion: no two games share a (net, queue_order) inside one tournament
    select count(*) into v_dup from (
      select net, queue_order, count(*) c from public.matches
       where tournament_id = 'c1010000-0000-4000-8000-000000000001' and phase = 'pool'
       group by net, queue_order having count(*) > 1) d;
    insert into t_out values ('zero net double-bookings', v_dup = 0, v_dup::text);
  exception when others then
    insert into t_out values ('the organizer move writes the whole plan', false, sqlstate || ' ' || sqlerrm);
  end $h$;

  -- 3. matches_pool_pair_uq did not fire, and the log row carries the pool label and the count
  do $h$
  declare v_prose text;
  begin
    select prose into v_prose from public.action_log where action = 'move_team_to_pool' order by at desc limit 1;
    insert into t_out values ('the log row names the team, the pool and the count',
      v_prose = 'moved Block Party to pool B, 4 games rescheduled', coalesce(v_prose,'<null>'));
  end $h$;

  -- 4. a pool with a FINAL game refuses with the exact message
  do $h$
  declare v_n int;
  begin
    update public.matches set status = 'final', score_a = 21, score_b = 9,
           winner_team_id = 'c1010000-0000-4000-8000-000000000011'
     where pool_id = 'c1010000-0000-4000-8000-00000000000a';
    select public.move_team_to_pool('c1010000-0000-4000-8000-000000000001',
      'c1010000-0000-4000-8000-000000000011', 'c1010000-0000-4000-8000-00000000000b', '[]'::jsonb) into v_n;
    insert into t_out values ('a pool with a final game refuses', false, 'it returned ' || v_n::text);
  exception when others then
    insert into t_out values ('a pool with a final game refuses',
      sqlerrm = 'Those pools have games already played or in progress.', sqlstate || ' ' || sqlerrm);
  end $h$;

  -- 5. a pool with a LIVE game refuses, and the live row still exists afterwards
  do $h$
  declare v_n int; v_st text; v_score int;
  begin
    update public.matches set status = 'scheduled', score_a = null, score_b = null, winner_team_id = null
     where pool_id = 'c1010000-0000-4000-8000-00000000000a';
    update public.matches set status = 'live', score_a = 7, score_b = 5
     where pool_id = 'c1010000-0000-4000-8000-00000000000b' and queue_order = 1;
    begin
      select public.move_team_to_pool('c1010000-0000-4000-8000-000000000001',
        'c1010000-0000-4000-8000-000000000011', 'c1010000-0000-4000-8000-00000000000b', '[]'::jsonb) into v_n;
      insert into t_out values ('a pool with a LIVE game refuses', false, 'it returned ' || v_n::text);
    exception when others then
      insert into t_out values ('a pool with a LIVE game refuses',
        sqlerrm = 'Those pools have games already played or in progress.', sqlstate || ' ' || sqlerrm);
    end;
    select status, score_a into v_st, v_score from public.matches
     where pool_id = 'c1010000-0000-4000-8000-00000000000b' and queue_order = 1;
    insert into t_out values ('the live row survived the refusal', v_st = 'live' and v_score = 7,
      v_st || ' ' || coalesce(v_score::text,'<null>'));
    update public.matches set status = 'scheduled', score_a = null, score_b = null
     where pool_id = 'c1010000-0000-4000-8000-00000000000b';
  end $h$;

  -- 6. an UNPOOLED team moves, and ONLY the destination pool is rebuilt
  do $h$
  declare v_n int; v_a int;
  begin
    select count(*) into v_a from public.matches where pool_id = 'c1010000-0000-4000-8000-00000000000a';
    select public.move_team_to_pool('c1010000-0000-4000-8000-000000000001',
      'c1010000-0000-4000-8000-000000000016', 'c1010000-0000-4000-8000-00000000000b',
      json_build_array(
        json_build_object('pool_id','c1010000-0000-4000-8000-00000000000b','team_a_id','c1010000-0000-4000-8000-000000000014','team_b_id','c1010000-0000-4000-8000-000000000016','net',2,'queue_order',1)
      )::jsonb) into v_n;
    insert into t_out values ('an unpooled team moves', v_n = 1, v_n::text);
    insert into t_out
      select 'pool A was NOT rebuilt', count(*) = v_a, count(*)::text
        from public.matches where pool_id = 'c1010000-0000-4000-8000-00000000000a';
  exception when others then
    insert into t_out values ('an unpooled team moves', false, sqlstate || ' ' || sqlerrm);
  end $h$;

  -- 7. a COMPLETED tournament refuses. This is the predicate that keeps June and August out.
  do $h$
  declare v_n int;
  begin
    update public.tournaments set status = 'completed' where id = 'c1010000-0000-4000-8000-000000000001';
    select public.move_team_to_pool('c1010000-0000-4000-8000-000000000001',
      'c1010000-0000-4000-8000-000000000011', 'c1010000-0000-4000-8000-00000000000b', '[]'::jsonb) into v_n;
    insert into t_out values ('a completed tournament refuses', false, 'it returned ' || v_n::text);
  exception when others then
    insert into t_out values ('a completed tournament refuses',
      sqlerrm = 'This tournament is past pool play.', sqlstate || ' ' || sqlerrm);
  end $h$;

  -- 8. an unknown team and an unknown pool each raise their own sentence
  do $h$
  declare v_n int;
  begin
    update public.tournaments set status = 'pools' where id = 'c1010000-0000-4000-8000-000000000001';
    select public.move_team_to_pool('c1010000-0000-4000-8000-000000000001',
      'c1010000-0000-4000-8000-0000000000ee', 'c1010000-0000-4000-8000-00000000000b', '[]'::jsonb) into v_n;
    insert into t_out values ('an unknown team is refused', false, 'it returned');
  exception when others then
    insert into t_out values ('an unknown team is refused',
      sqlerrm = 'That team is not in this tournament.', sqlstate || ' ' || sqlerrm);
  end $h$;
  do $h$
  declare v_n int;
  begin
    select public.move_team_to_pool('c1010000-0000-4000-8000-000000000001',
      'c1010000-0000-4000-8000-000000000011', 'c1010000-0000-4000-8000-0000000000ef', '[]'::jsonb) into v_n;
    insert into t_out values ('an unknown pool is refused', false, 'it returned');
  exception when others then
    insert into t_out values ('an unknown pool is refused',
      sqlerrm = 'That pool is not in this tournament.', sqlstate || ' ' || sqlerrm);
  end $h$;

  -- 9. the grants
  do $h$
  declare v_acl text;
  begin
    select coalesce(proacl::text,'<null>') into v_acl from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'move_team_to_pool';
    insert into t_out values ('authenticated only, no anon, no PUBLIC',
      v_acl like '%authenticated=X%' and v_acl not like '%anon=X%' and v_acl not like '%=X/%', v_acl);
  end $h$;

select * from t_out;
rollback;
```

  **Expected messages, verbatim:** `That tournament is not here any more.`, `Only an organizer can move a team` (42501), `This tournament is past pool play.`, `That team is not in this tournament.`, `That pool is not in this tournament.`, `Those pools have games already played or in progress.`

- [ ] **Step 3 (CONTROLLER): the residue probes.** SEPARATE calls, after the rollback:
```sql
select to_regprocedure('public.move_team_to_pool(uuid, uuid, uuid, jsonb)') as fn;   -- expect null
select count(*) as left_over from public.tournaments where id = 'c1010000-0000-4000-8000-000000000001'; -- expect 0
```

- [ ] **Step 4 (CONTROLLER): apply.** `apply_migration` named `0064_move_team_to_pool`. Post-apply: `pg_get_functiondef` diffed against the file verbatim; `pg_get_function_result` = `integer`; `proacl` carries `authenticated=X/` and no `anon=` and no leading `=X/`; `get_advisors(security)` zero NEW against P3; the P2 count query unmoved; and ONE anon REST call:
```bash
KEY=$(node -e "const s=require('fs').readFileSync('public/supabase-config.js','utf8');console.log(/const SUPABASE_KEY = '([^']+)'/.exec(s)[1])")
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  'https://mlzblkzflgylnjorgjcp.supabase.co/rest/v1/rpc/move_team_to_pool' \
  -H "apikey: $KEY" -H "Content-Type: application/json" \
  -d '{"p_tournament_id":"00000000-0000-4000-8000-000000000000","p_team":"00000000-0000-4000-8000-000000000000","p_pool":"00000000-0000-4000-8000-000000000000","p_matches":[]}'
```
Expect `404` or `403`. A `200` STOPS the round.

- [ ] **Step 5: the pure helper.** `public/pure.js` (CRLF), added beside `relayoutPoolGamesOnNets` and exported.

```js
// C101 Task 7: the plan move_team_to_pool applies. Returns { plan } only: the digest's `keep` half is dead
// weight, because the server keeps rows by NOT DELETING them rather than by being told which to keep. It
// takes the full pools list and the tournament's whole match set because both of its properties need them.
//
// (a) NETS. The plan may use only the nets the two rebuilt pools ALREADY OWN, computed as the distinct
//     `net` values on those pools' existing phase='pool' rows. Handing the layout the tournament's whole
//     net set would move an untouched pool's games onto a net another pool is mid-round on. A pool with no
//     rows yet has no nets of its own, so it takes the share splitNetsAcrossPools would have given it out
//     of the widest net number this tournament's pool games actually use.
// (b) QUEUE_ORDER. The pools board reads queue_order as the round number (mgPoolsScheduleHTML derives
//     maxRound and curRound from it), so the plan's values must be DISJOINT from the surviving rows of
//     every untouched pool. Compute the offset from those rows; do not restart at 1.
function poolMovePlan(teamId, fromPoolId, toPoolId, pools, teams, matches) {
  const to = String(toPoolId == null ? '' : toPoolId);
  const from = (fromPoolId == null || String(fromPoolId) === '') ? null : String(fromPoolId);
  if (!to) return { plan: [] };
  const poolList = (pools || []).filter((p) => p && p.id != null)
    .slice().sort((a, b) => (Number(a.display_order) || 0) - (Number(b.display_order) || 0));
  const poolMatches = (matches || []).filter((m) => m && (m.phase ? m.phase === 'pool' : !!m.pool_id));
  const rebuilt = (from && from !== to) ? [from, to] : [to];
  const isRebuilt = (pid) => rebuilt.indexOf(String(pid == null ? '' : pid)) >= 0;

  const seenNets = [...new Set(poolMatches.filter((m) => m.net != null).map((m) => Number(m.net)))];
  const totalNets = seenNets.length ? Math.max.apply(null, seenNets) : 1;
  const share = splitNetsAcrossPools(totalNets, poolList.length || 1);
  const netsOf = (pid) => {
    const own = [...new Set(poolMatches
      .filter((m) => String(m.pool_id) === String(pid) && m.net != null)
      .map((m) => Number(m.net)))].sort((a, b) => a - b);
    if (own.length) return own;
    const i = poolList.findIndex((p) => String(p.id) === String(pid));
    return (i >= 0 && share[i] && share[i].length) ? share[i].slice() : [1];
  };

  const offset = poolMatches.filter((m) => !isRebuilt(m.pool_id))
    .reduce((mx, m) => Math.max(mx, Number(m.queue_order) || 0), 0);

  const plan = [];
  rebuilt.forEach((pid) => {
    const ids = (teams || [])
      .filter((tm) => tm && tm.id != null)
      .filter((tm) => (String(tm.id) === String(teamId)
        ? String(pid) === to
        : String(tm.pool_id || '') === String(pid)))
      .map((tm) => String(tm.id));
    assignPoolGameSlots(ids, netsOf(pid)).forEach((g) => plan.push({
      pool_id: String(pid),
      team_a_id: g.team_a_id, team_b_id: g.team_b_id,
      net: g.net, queue_order: offset + g.queue_order,
    }));
  });
  return { plan };
}
```
  Export line: add `poolMovePlan,` immediately after `layoutRoundsOnNets, assignPoolGameSlots, relayoutPoolGamesOnNets, poolNetRange, teamNetRange,` in the `module.exports` block.

- [ ] **Step 6: the writer.** `public/app.js:2256-2261`. Replace the whole function:

```js
// C101 Task 7 / migration 0064: a move is a two-pool schedule REGENERATION, not a pool_id write. The plan
// is built by the pure helper (the round-aware net layout proven across 1,984 configs by C76) and applied
// atomically by the DEFINER RPC, which refuses once either pool has a final or live game and once the
// tournament is past pool play. The zero-row read-back this replaced could only tell us that SOME row was
// touched; the count tells us how many fixtures were rewritten.
async function tdbMoveTeamToPool(teamId, poolId) {
  if (!supabaseClient || !teamId) return;
  const t = mgActiveTournament();
  if (!t) throw new Error('No tournament selected.');
  const team = (state.tournamentTeams || []).find((x) => String(x.id) === String(teamId));
  const { plan } = poolMovePlan(
    teamId, team ? (team.pool_id || null) : null, poolId,
    state.tournamentPools || [], state.tournamentTeams || [], state.tournamentMatches || []);
  const { data, error } = await supabaseClient.rpc('move_team_to_pool', {
    p_tournament_id: t.id, p_team: teamId, p_pool: poolId, p_matches: plan,
  });
  if (error) { console.error('tdbMoveTeamToPool', error); throw error; }
  const n = Number(Array.isArray(data) ? data[0] : data);
  if (!Number.isFinite(n)) throw new Error('The move did not save. Check you are signed in as an admin.');
  return n;
}
```

- [ ] **Step 7: Move comes back post-draw.** `public/app.js`, `mgPoolCardHTML`. Three edits in one pass:

```js
  // C101 Task 7 / migration 0064: Task 0's `!drawn` gate retires with the RPC that replaced it. A pool that
  // has PLAYED or is PLAYING still withholds Move, because 0064 refuses it: the UI now draws exactly what
  // the server will accept, instead of drawing more than it will.
  const others = pools.filter((p) => String(p.id) !== pid);
  const played = matches.some((m) => String(m.pool_id) === pid && (m.status === 'final' || m.status === 'live'));
  const movable = others.length > 0 && !played;
```
```js
  // Gated on `played`, NOT on `!movable` - a one-pool event also has no Move, and telling that organizer
  // "play has started" when nothing has been scored would be copy the app cannot honour. The
  // schedule-is-drawn line retires with the gate that drew it (C101 Task 7).
  const lock = played ? `<span class="pc-lock">Play has started, teams stay put.</span>` : '';
```
  and the picker gains one line under it, inside the `.pc-pick` block, after the `.pc-pcancel` Cancel:
```js
        + `<button type="button" class="pc-pcancel" data-pc-cancel>Cancel</button>`
        + `<span class="pc-pnote">Finished games stay where they were played. The rest are rescheduled.</span>`
        + `</div>`;
```
  and the panel note in `mgPoolsControlsHTML` (app.js:11904):
```js
      + `<p class="pc-note">Move a team to another pool, change the nets a pool plays on, or start the draw over.</p>`
```
  The `.pc-pnote` rule goes beside `.pc-nhint` in `public/styles.css` (CRLF), which already owns the full-width second-line pattern:
```css
/* PORT NOTE, C101 Task 7 (2026-08-25): the picker says what a move will do to the schedule, on its own
   line under the pool buttons. Same shape as .pc-nhint above it. No new !important. */
.pc-pnote { flex: 1 0 100%; order: 11; font-size: 11.5px; color: var(--muted); }
```

- [ ] **Step 8: the second entry point.** `public/app.js:11536-11542`, the team sheet's `pool` role. No call change (it already goes through `tdbMoveTeamToPool`), one comment so the door is named:
```js
    if (role === 'pool') {
      const pid = r.getAttribute('data-mgts-pool') || '';
      scrim.querySelectorAll('[data-mgts="pool"]').forEach((b) => b.classList.remove('on'));
      r.classList.add('on');
      void mgtsWrite(() => tdbMoveTeamToPool(teamId, pid || null));   // C101 Task 7: the 0064 RPC
      return;
    }
```
  `mgPoolsMoveTeam` (app.js:12349) is UNCHANGED: its write-try / refresh-try split is exactly right for an RPC that can succeed while the refresh fails.

- [ ] **Step 9: the tests.**

  (a) `test/manage-round.test.js:1691-1746` FLIPS. In `a card per pool, Edit nets in the header, Move only before play, reset in the danger block`, replace the three C101-Task-0 assertions and their comments:

```js
    // C101 Task 7 / migration 0064: Move is BACK post-draw, behind the RPC that refuses once a pool has a
    // final or live game. Pool A here has a final, so it is locked; pool B is drawn but unplayed, so its
    // teams move. Task 0's "the schedule is drawn" gate retired with the server guard that replaced it.
    const cardA = html.slice(html.indexOf('data-pc-card="p1"'), html.indexOf('data-pc-card="p2"'));
    const cardB = html.slice(html.indexOf('data-pc-card="p2"'));
    expect(cardA).toContain('data-mgps-team="t1"');   // the row is still there, and still opens the sheet
    expect(cardA).not.toContain('data-pc-move=');     // it has PLAYED, so it cannot be moved
    expect(cardA).toContain('Play has started, teams stay put.');
    expect(count(cardB, 'data-pc-move=')).toBe(2);    // drawn but unplayed: both its teams move
    expect(cardB).not.toContain('pc-lock');
    expect(html).not.toContain('The schedule is drawn, teams stay put.');
```
  and in `a pool that has played carries the locked line; a movable one does not`:
```js
    // C101 Task 7: only a PLAYED or PLAYING pool locks. A drawn-but-unplayed pool moves again.
    expect(cardA).toContain('<span class="pc-lock">Play has started, teams stay put.</span>');
    expect(cardB).not.toContain('pc-lock');
    expect(count(html, 'class="pc-lock"')).toBe(1);
    seedPools(bridge, { matches: UNPLAYED });
    const drawn = bridge.buildMgPools({ controls: true });
    expect(drawn).not.toContain('The schedule is drawn, teams stay put.');
    expect(drawn).toContain('data-pc-move=');
    // UNPLAYED carries a LIVE game on pool A, so pool A locks and pool B does not
    expect(drawn).toContain('Play has started, teams stay put.');
```

  (b) `test/manage-round.test.js:1959-1978` FLIPS from the PostgREST chain to the `rpc` shape:

```js
  // C101 Task 7 / migration 0064 FLIPS this. The old guard proved the zero-row read-back on a bare
  // teams.pool_id update; that write door is gone. What has to be proven now is that the plan is built by
  // the PURE helper and handed to the RPC, and that a non-numeric answer is a failure.
  it('tdbMoveTeamToPool builds the plan in pure.js and applies it through the RPC', async () => {
    seedPools(bridge, { matches: UNDRAWN });
    const seen = [];
    let answer = { data: 6, error: null };
    const undo = bridge.swapSupaRpc((name, args) => { seen.push([name, args]); return answer; });
    try {
      await expect(bridge.moveTeamToPool('t1', 'p2')).resolves.toBe(6);
      expect(seen.length).toBe(1);
      expect(seen[0][0]).toBe('move_team_to_pool');
      const args = seen[0][1];
      expect(Object.keys(args).sort()).toEqual(['p_matches', 'p_pool', 'p_team', 'p_tournament_id']);
      expect(args.p_team).toBe('t1');
      expect(args.p_pool).toBe('p2');
      expect(Array.isArray(args.p_matches)).toBe(true);
      // the plan is EXACTLY what the pure helper returns for the same inputs
      const st = bridge.getState();
      expect(args.p_matches).toEqual(
        bridge.movePlan('t1', 't1-pool', 'p2', st.tournamentPools, st.tournamentTeams, st.tournamentMatches).plan
      );
      answer = { data: null, error: null };
      await expect(bridge.moveTeamToPool('t1', 'p2')).rejects.toThrow('The move did not save. Check you are signed in as an admin.');
    } finally { undo(); }
    const src = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
    const fn = src.slice(src.indexOf('async function tdbMoveTeamToPool('), src.indexOf('let _poolSetupInFlight'));
    expect(fn).not.toContain("from('teams')");    // the direct door is gone
    expect(fn).toContain('poolMovePlan(');        // and the plan is never built in the writer
  });

  it('a refused move surfaces the RPC message and leaves the picker open', async () => {
    seedPools(bridge, { matches: UNPLAYED });
    const m = bridge.mockPoolWrites({ move: () => { throw new Error('Those pools have games already played or in progress.'); } });
    try {
      bridge.buildMgPools({ controls: true, moveTeam: 't3' });
      await bridge.movePool('t3', 'p1');
      expect(m.calls.find((c) => c[0] === 'notice')[1]).toBe('Could not move the team');
      expect(bridge.moveTeamId()).toBe('t3');     // the picker is still open, so the tap can be retried
    } finally { m.restore(); }
  });

  it('the write / refresh split still reports "The team moved" when only the refresh failed', async () => {
    seedPools(bridge, { matches: UNDRAWN });
    const m = bridge.mockPoolWrites({ refresh: () => { throw new Error('offline'); } });
    try {
      await bridge.movePool('t1', 'p2');
      expect(m.calls.find((c) => c[0] === 'notice')[1]).toBe('The team moved');
    } finally { m.restore(); }
  });

  it('the delegate reaches Move from a real tap in BOTH homes', async () => {
    // pre-start (Task 1's home)
    seedPools(bridge, { matches: UNDRAWN });
    bridge.buildMgPools();
    let m = bridge.mockPoolWrites({});
    try {
      await withDelegate(async (tap) => { tap(['data-pc-move','data-mgps-team'],'t1'); tap('data-pc-pick','t1:p2'); await Promise.resolve(); });
      expect(m.calls).toContainEqual(['move', 't1', 'p2']);
    } finally { m.restore(); }
    // post-draw (Task 7's home): pool B is drawn but unplayed
    seedPools(bridge, { matches: UNPLAYED });
    bridge.buildMgPools({ controls: true });
    m = bridge.mockPoolWrites({});
    try {
      await withDelegate(async (tap) => { tap(['data-pc-move','data-mgps-team'],'t3'); tap('data-pc-pick','t3:p1'); await Promise.resolve(); });
      expect(m.calls).toContainEqual(['move', 't3', 'p1']);
    } finally { m.restore(); }
  });
```
  `bridge.movePool: (a, b) => mgPoolsMoveTeam(a, b)` and `bridge.movePlan: (...a) => poolMovePlan(...a)` are added beside the existing keys. **`:1981-1992`, the poll guard, must stay GREEN untouched.**

  (c) `test/pure.test.js`, the two properties. Add `poolMovePlan, layoutRoundsOnNets, assignPoolGameSlots` to the destructured require list if they are not already there:

```js
describe('poolMovePlan (C101 Task 7 - the plan move_team_to_pool applies)', () => {
  const POOLS = [{ id: 'pA', label: 'A', display_order: 0 }, { id: 'pB', label: 'B', display_order: 1 },
                 { id: 'pC', label: 'C', display_order: 2 }];
  const TEAMS = [
    { id: 'a1', pool_id: 'pA' }, { id: 'a2', pool_id: 'pA' }, { id: 'a3', pool_id: 'pA' },
    { id: 'b1', pool_id: 'pB' }, { id: 'b2', pool_id: 'pB' },
    { id: 'c1', pool_id: 'pC' }, { id: 'c2', pool_id: 'pC' }, { id: 'c3', pool_id: 'pC' },
  ];
  const MATCHES = [
    { id: 'm1', phase: 'pool', pool_id: 'pA', net: 1, queue_order: 1, status: 'scheduled' },
    { id: 'm2', phase: 'pool', pool_id: 'pA', net: 1, queue_order: 2, status: 'scheduled' },
    { id: 'm3', phase: 'pool', pool_id: 'pB', net: 2, queue_order: 1, status: 'scheduled' },
    { id: 'm4', phase: 'pool', pool_id: 'pC', net: 3, queue_order: 1, status: 'scheduled' },
    { id: 'm5', phase: 'pool', pool_id: 'pC', net: 3, queue_order: 4, status: 'final' },
  ];

  it('uses ONLY the nets the two rebuilt pools already own', () => {
    const { plan } = poolMovePlan('a3', 'pA', 'pB', POOLS, TEAMS, MATCHES);
    const nets = [...new Set(plan.map((g) => g.net))].sort();
    expect(nets).toEqual([1, 2]);              // never 3: pool C is mid-round on it
    expect(plan.every((g) => g.pool_id === 'pA' || g.pool_id === 'pB')).toBe(true);
  });

  it('offsets queue_order past every untouched pool, so the board never reads two pools into one round', () => {
    const { plan } = poolMovePlan('a3', 'pA', 'pB', POOLS, TEAMS, MATCHES);
    const untouched = MATCHES.filter((m) => m.pool_id === 'pC').map((m) => m.queue_order);
    expect(Math.min(...plan.map((g) => g.queue_order))).toBeGreaterThan(Math.max(...untouched));
  });

  it('rebuilds both pools with a complete round robin and no net double-booking', () => {
    const { plan } = poolMovePlan('a3', 'pA', 'pB', POOLS, TEAMS, MATCHES);
    const inA = plan.filter((g) => g.pool_id === 'pA');
    const inB = plan.filter((g) => g.pool_id === 'pB');
    expect(inA.length).toBe(1);                // pA drops to 2 teams: one game
    expect(inB.length).toBe(3);                // pB rises to 3 teams: three games
    const slots = plan.map((g) => g.net + '@' + g.queue_order);
    expect(new Set(slots).size).toBe(slots.length);
    expect(plan.every((g) => g.team_a_id !== g.team_b_id)).toBe(true);
  });

  it('an UNPOOLED team rebuilds only the destination', () => {
    const teams = TEAMS.concat([{ id: 'x1', pool_id: null }]);
    const { plan } = poolMovePlan('x1', null, 'pB', POOLS, teams, MATCHES);
    expect([...new Set(plan.map((g) => g.pool_id))]).toEqual(['pB']);
    expect(plan.length).toBe(3);               // pB rises to 3 teams
  });

  it('a pool with no rows yet takes its splitNetsAcrossPools share, not the whole net set', () => {
    const bare = MATCHES.filter((m) => m.pool_id !== 'pB');
    const { plan } = poolMovePlan('a3', 'pA', 'pB', POOLS, TEAMS, bare);
    const bNets = [...new Set(plan.filter((g) => g.pool_id === 'pB').map((g) => g.net))];
    expect(bNets.length).toBeGreaterThan(0);
    expect(bNets).not.toContain(3);            // never pool C's net
  });

  it('a missing destination plans nothing', () => {
    expect(poolMovePlan('a3', 'pA', null, POOLS, TEAMS, MATCHES)).toEqual({ plan: [] });
  });
});
```

  (d) `test/supabase-writes.test.js`: add `'move_team_to_pool',` to `MUTATING_RPCS`.

- [ ] **Step 10 (CONTROLLER): the FIRST REAL CALL, on Mike's word.** On a THROWAWAY tournament created and removed in ONE FK-safe transaction, never on the June or August rows:
```sql
begin;
  insert into public.tournaments (id, name, community_id, status, net_count)
    values ('c1010000-0000-4000-8000-0000000000c7', 'C101 first-call probe',
            '2c3bcfa9-305e-448b-924b-da90c029f575', 'pools', 2);
  insert into public.pools (id, tournament_id, label, display_order) values
    ('c1010000-0000-4000-8000-0000000000a1','c1010000-0000-4000-8000-0000000000c7','A',0),
    ('c1010000-0000-4000-8000-0000000000a2','c1010000-0000-4000-8000-0000000000c7','B',1);
  insert into public.teams (id, tournament_id, name, community_id, pool_id) values
    ('c1010000-0000-4000-8000-0000000000d5','c1010000-0000-4000-8000-0000000000c7','Probe A','2c3bcfa9-305e-448b-924b-da90c029f575','c1010000-0000-4000-8000-0000000000a1'),
    ('c1010000-0000-4000-8000-0000000000d6','c1010000-0000-4000-8000-0000000000c7','Probe B','2c3bcfa9-305e-448b-924b-da90c029f575','c1010000-0000-4000-8000-0000000000a1'),
    ('c1010000-0000-4000-8000-0000000000d7','c1010000-0000-4000-8000-0000000000c7','Probe C','2c3bcfa9-305e-448b-924b-da90c029f575','c1010000-0000-4000-8000-0000000000a2');
  insert into public.matches (id, tournament_id, phase, pool_id, team_a_id, team_b_id, status, net, queue_order, version)
    values ('c1010000-0000-4000-8000-0000000000e3','c1010000-0000-4000-8000-0000000000c7','pool',
            'c1010000-0000-4000-8000-0000000000a1','c1010000-0000-4000-8000-0000000000d5',
            'c1010000-0000-4000-8000-0000000000d6','scheduled',1,1,0);
  select set_config('request.jwt.claims',
    json_build_object('sub', (select profile_id from public.memberships
      where community_id = '2c3bcfa9-305e-448b-924b-da90c029f575' and role = 'owner' limit 1))::text, true) as claims;
  select public.move_team_to_pool('c1010000-0000-4000-8000-0000000000c7',
    'c1010000-0000-4000-8000-0000000000d6', 'c1010000-0000-4000-8000-0000000000a2',
    json_build_array(json_build_object('pool_id','c1010000-0000-4000-8000-0000000000a2',
      'team_a_id','c1010000-0000-4000-8000-0000000000d7','team_b_id','c1010000-0000-4000-8000-0000000000d6',
      'net',2,'queue_order',1))::jsonb) as written;   -- expect 1
  select pool_id from public.teams where id = 'c1010000-0000-4000-8000-0000000000d6';
  select id, pool_id, net, queue_order, status from public.matches
   where tournament_id = 'c1010000-0000-4000-8000-0000000000c7' order by queue_order;
  select action, detail, prose from public.action_log where entity_id = 'c1010000-0000-4000-8000-0000000000d6';
  delete from public.matches where tournament_id = 'c1010000-0000-4000-8000-0000000000c7';
  delete from public.action_log where entity_id = 'c1010000-0000-4000-8000-0000000000d6';
  delete from public.teams   where tournament_id = 'c1010000-0000-4000-8000-0000000000c7';
  delete from public.pools   where tournament_id = 'c1010000-0000-4000-8000-0000000000c7';
  delete from public.tournaments where id = 'c1010000-0000-4000-8000-0000000000c7';
commit;
```
Then re-run the P2 count query and confirm every number is back at the baseline.

- [ ] **Step 11: Version, checks, suite, commit.** `APP_VERSION` = the next unused `'2026.08.25.N'` when dispatched. `node --check public/app.js && node --check public/pure.js`; the `pure.js` and `styles.css` CRLF counts moved only by the lines added; `cd test && npx vitest run` on the runner's exit code. Commit (do not push):

`feat(pools): 0064 move_team_to_pool - the move regenerates both pools unplayed schedules on the server, refuses a played or live pool, and Move returns after the draw - v2026.08.25.N`

- [ ] **Step 12 (CONTROLLER): mark it applied.** Replace `-- NOT APPLIED` with the `APPLIED <date> via the Supabase MCP on Mike's word (C101 Task 7)` line naming the integer return, the grants and the first-call probe. Commit it alone: `chore(db): 0064 applied`.

---

### Task 8: The close-out

- [ ] **Step 1: Bytes on prod.** `APP_VERSION` on the served file matches the last task's number, and `grep -c` on the served `app.js` / `pure.js` for each literal this round added: `set_team_paid`, `clear_bracket_atomic`, `clear_whole_bracket`, `move_team_to_pool`, `tdbClearBracketResult`, `tdbClearWholeBracket`, `poolMovePlan`, `bracketClearPlan`, `data-mgbk-clear`, `data-mgss="clear"`, `mgts-danger-outline`. Every one must be non-zero; `from('teams').update({ paid` must be zero.

- [ ] **Step 2: The drive (READ-ONLY, in Mike's Chrome, §63).** No Supabase write happens in a drive, so every destructive control is opened and CANCELLED. In a 390 frame:
  - **Pools, pre-draw (Task 1):** the Pools drawn block shows one Move per team, the note "Move a team to another pool now. Once the schedule is drawn, teams stay put.", no lock line. Tap Move: the picker opens with a button per other pool and a Cancel. Tap Cancel.
  - **Pools, post-draw (Task 7):** open Pool controls. A pool with a final or live game shows "Play has started, teams stay put." and no Move; an unplayed drawn pool shows Move. Open one picker, read the line "Finished games stay where they were played. The rest are rescheduled.", tap Cancel. The panel note reads "Move a team to another pool, change the nets a pool plays on, or start the draw over." and the string "The schedule is drawn" appears nowhere.
  - **Teams and payment (Task 3):** open a team's popup and read the note "Logged in the activity log with your name." Do NOT tap the toggle.
  - **Activity log (Task 4):** Manage, Admins, Activity log. Read the newest rows: the ones written since 0061 read as sentences after a bolded name; older rows still read `action · detail`. No em dash anywhere on the screen.
  - **Score card (Task 5):** open a FINISHED bracket game. "Clear this result" is present under the primary; the hint says "To change who won, clear the result first." Tap Clear, read the confirm's exact copy, tap Cancel. Open an UNFINISHED game: no Clear.
  - **Bracket strip (Task 6):** the two controls, "Clear every result" ABOVE "Reset the bracket", each with its own note and each behind the typed name. Tap Clear every result, read the prompt, dismiss. **Look at the pair and answer the one question in Step 5.**
  - Console clean throughout. Screenshots if capture works; facts either way.

- [ ] **Step 3: Restore the tab.** Leave Mike's browser on the tab it started on, with no stray automation window open.

- [ ] **Step 4: The vault write-backs** (`C:\Ai Master\Projects\Athletic Specimen\`, routing per `00-brain-map\vault-update-protocol.md`).
  - `12-history/task-#5-c101-data-round-session18.md`, written **BEFORE anything is marked complete** (Rule §30). It carries: the seven tasks and their versions and SHAs; the six migrations with their apply timestamps; every harness result table; the P1 to P9 precondition answers, especially P6 (June's `phase='main'` count), P7 (stale emails and profile-less accounts) and P9 (whether `execute_sql` may write `auth.users` in a rolled-back block); the three first-real-call probes and the count baseline before and after each.
  - `01-state/log.md`: one line, newest at top.
  - `01-state/current.md`: what changed, and what C101 leaves open.
  - `01-state/NOW.md`: the goal line and the next concrete action, pruned to the file's ~40-line cap.
  - `01-state/decisions.md`, one entry each for the non-obvious calls this round made: the champion null as its own UNCONDITIONAL statement (folding it into the guarded reopen leaves a stored champion on close-reopen-clear, and `resolveHistoryChampion` prefers the stored one); `version` bumping in BOTH clear functions (the CAS in `submit_match_score` would otherwise accept a stale client into a reset row); prose written at WRITE time rather than shaped at read time; the compute-in-the-client, apply-atomically-on-the-server shape for the move (reimplementing the C76 net layout in plpgsql would be a second source of truth); the drop-and-recreate of `clear_bracket_atomic` being free ONLY while it had no caller; and Mike's §38 answer for the two bracket danger controls.
  - `01-state/debugging.md`, one entry per failure pattern this round can produce: an inner `commit` inside a `begin ... rollback` harness COMMITS the DDL, so the file's own transaction wrapper is stripped; `to_regclass` answers for tables and silently passes for a still-deployed FUNCTION, so the probe is `to_regprocedure` plus `pg_get_functiondef`; 42501 collides between the guard's raise and a nested permission denial, so every guard assertion compares the MESSAGE; and a role-scoped revoke is a no-op while a PUBLIC grant exists.
  - `01-state/Tasks From Claude.md`: the C101 row moves to DONE with the seven task numbers and their SHAs, and the leftovers this round names are added as their own rows (the four direct-write doors with no log entry; `tournaments.updated_at` maintained by nothing; `start_pool_play_atomic` deleting finals under a `status='setup'` guard; anon scoring a scheduled match in a completed tournament).

- [ ] **Step 5: Hand back** with `AskUserQuestion`, exactly one option marked "(Recommended)", listed first, with a one-line why. The items that are Mike's and only Mike's:
  1. **The bracket strip's contrast.** His §38 answer is shipped as written: "Clear every result" is outlined, "Reset the bracket" is untouched. GROUND TRUTH he should see for himself: `styles.css:2442` already draws `.mgts-danger` with a transparent background, so today the pair is told apart by border weight, text weight and copy rather than by fill. Making the reset an actually FILLED red button is one rule (`background: var(--danger); color: #fff; border-color: transparent;`, the shape `button.danger` already uses at `styles.css:253`) and it is his word, not the builder's.
  2. **The end-to-end email change** (Task 2 step 8): one real address change, then the `profiles` and `auth.users` read-back side by side.
  3. **C102**, extracting Manage out of `app.js`, and **Task 10 of the Manage plan** (the C93 canvas retirement, which needs his Claude Design consent).
  4. The standing taps that outlive this round: C75 paid flags, the Venmo iPhone tap, the "Mikey Olas" name overlay, the Manage Check-in tap feel, and the venue fields in Event settings.

---

## Not in this round

- **C86, the scoreless pool result.** Mike's call 4. No RPC change, no `canFinal` change, no hint change; the pool card keeps "Tap a team to mark them the winner, then enter the score." and `test/manage-page.test.js:1212-1215` stays green, which is the tell that it did not sneak back in.
- **A true undo, and a match history table.** Mike's call 3. `action_log.detail` stores only the NEW value and `action_log.undo jsonb` is written by nothing, so a restore-prior-value undo is impossible from the data that exists. The history table is a round of its own.
- **A generic `log_admin_action(...)` the client calls after a successful direct write.** Refused: it is not atomic, the write can land and the log call fail, and an organizer could log a line about a write that never happened. Mixed with real per-write RPCs it produces a log nobody can trust.
- **The four direct-write doors that still leave no log row,** named so the later round has its list: `tdbSetTournamentFields` (app.js:2170, carrying close registration, the venmo link, the rules sheet, the announcement, the venue, the date and the caps); the `pickup_days` writes (app.js:8982-8983 insert and update, app.js:9008 delete); team removal (`tdbWithdrawTeam` app.js:2209 and the delete at app.js:2230); and `tdbDeleteTournament` (app.js:2669). `tdbAddTeam`'s direct insert (app.js:2134-2151) joins them: after Task 3 the admin Add-a-team flow logs its PAYMENT but not the registration itself. The cheapest collapse for the first is a single `set_tournament_fields(p_tournament uuid, p_patch jsonb) returns public.tournaments` with a hardcoded column allow-list, which would also fix `tournaments.updated_at` (no trigger maintains it); its blast radius is wide, so it is its own task.
- **Two pre-existing hazards this round does NOT close,** written into the 0063 and 0064 headers so nobody assumes it did: `start_pool_play_atomic` deletes ALL of a tournament's pool matches, finals included, with only its `status='setup'` guard between June and a wipe (0048:90-99); and no constraint, trigger or RLS predicate anywhere references `tournaments.status`, so anon can still score a scheduled match in a completed tournament through `submit_match_score`.

## Open, and only Mike or the live database can answer

1. **The word before each apply,** and before each first real call of the three destructive RPCs (0062, 0063, 0064), each on a throwaway tournament created and removed in one FK-safe transaction with an exact baseline read-back afterwards. The SQL for all three is written into Tasks 5, 6 and 7.
2. **Does the deployed `clear_bracket_atomic` match 0056 verbatim,** and do the deployed grants on it, `read_action_log`, `draw_pools_atomic`, `start_pool_play_atomic`, `register_team` and `set_member_role` match the files, with no leading PUBLIC entry in `proacl` and `register_team`'s anon entry intact? That diff is the first read of the round: precondition **P4**.
3. **What does `action_log.actor` hold on recent rows?** One organizer call to `read_action_log(50)`: precondition **P5**.
4. **Does the June row have any `phase='main'` matches?** The claim that `clear_whole_bracket` cannot touch it rests on the answer being zero: precondition **P6**. A non-zero answer STOPS the round.
5. **Is `profiles.email` already stale for any account, and does any signed-up account have no `profiles` row at all?** The second question is what makes 0059's upsert load-bearing rather than defensive: precondition **P7**.
6. **May `execute_sql` update `auth.users` inside a rolled-back block?** That decides how much of 0059 can be proved before the apply rather than after: precondition **P9**.

**The §38 question the spec left open is ANSWERED and is no longer open** (Mike, 2026-08-25): on the bracket strip, "Clear every result" is an outlined danger control, the existing delete/reset stays the one filled red button, both keep their confirms, and the clear sits above the delete. It is built as a decided fact in Task 6, and the one ground-truth caveat about `.mgts-danger` already being transparent is carried to him at the hand-back rather than blocking the build.
