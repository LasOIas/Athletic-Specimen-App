# C101 data round, design spec (2026-08-25)

**Goal.** C101 is the DATA round the C99 Manage handoff deferred: six migrations plus one UI-only task that turn four Manage promises into server truth. A team moves between pools before the schedule is drawn and, at the end of the round, after it too; an organizer can clear one bracket result and every bracket result without deleting the tree; marking a team paid leaves an audit row carrying the team's name; the activity log reads as sentences instead of `action · detail`; and a confirmed email change updates `profiles.email`, so the admin-seat lookup stops matching the old address. Every function is SECURITY DEFINER with an in-body organizer guard, returns a row or a count so the client can read the write back, and is proved in a rolled-back transaction before it is applied. The round is additive at apply time. The destruction happens on the first CALL, never on the apply.

**Ground truth.** The 2026-08-25 recon digest (four lenses plus the synthesis), re-verified against HEAD `e9bc37e`, `APP_VERSION = '2026.08.25.35'`, vitest 1144 across 39 files. Every line number below was read at that commit and will drift.

## Mike's calls (binding, 2026-08-25)

1. **Task 0 is SHIPPED, not a task.** `e9bc37e`, v2026.08.25.35: a team moves between pools only before the schedule is drawn. `mgPoolCardHTML` (app.js:11841) gates Move on `drawn = matches.some(m => m.pool_id === pid)` instead of on a final game; the lock line reads "The schedule is drawn, teams stay put."; the panel note reads "Move a team to another pool before Start pool play, change the nets a pool plays on, or start the draw over." That closed the live schedule-corruption path with one line and no migration.
2. **Straight to prod, no Supabase branch.** Additive DDL only; every function proved first in a `begin ... rollback` harness with faked JWTs; the first real call of each destructive RPC on a throwaway tournament, on Mike's word. Both tournaments read `completed` by anon REST on 2026-08-25, so there is no live scoring window to schedule around.
3. **C79 ships as "Clear this result".** Wire the existing `clear_bracket_atomic`, extended to return the count and to null `tournaments.champion_team_id`; `close_tournament` writes the champion again on the next close. A true undo is not built.
4. **C86 stays REFUSED.** No scoreless pool result. The pool card keeps "Tap a team to mark them the winner, then enter the score." Digest item 3 is out of this round.
5. **Move's home before the draw.** Add Move to the pre-start "Pools drawn" block (`mgPoolsSetupHTML` / `mgPoolTeamsBlockHTML`), where a move is a plain `pool_id` write with no fixtures to rebuild. UI only, ships FIRST, on the existing `tdbMoveTeamToPool` and picker. After the draw, Move stays withheld until item 7.
6. **`move_team_to_pool` ships LAST.** It rebuilds both pools' unplayed schedules on the server, refuses once either pool has a final game or the tournament is `completed`, and only then does the post-draw Move return to the controls panel, behind that RPC.
7. **Activity-log prose is written at WRITE time** into a new `action_log.prose` column, `read_action_log` coalescing to today's `action || ' · ' || detail` for the backlog. Scope is the six actions already behind DEFINER RPCs: draw pools, start pool play, add team, admin seat, clear bracket, mark paid. The four direct-write doors wait for a later round.
8. **Build order is ascending risk:** (1) Move in the Pools drawn block, UI only; (2) `0059_profiles_email_sync`; (3) `0060_set_team_paid`; (4) `0061_action_log_prose`; (5) `0062_clear_bracket_result`; (6) `0063_clear_whole_bracket`; (7) `0064_move_team_to_pool`; then the drive and the vault write-backs.

## The security model this round lives inside

**RLS on the five tournament tables is a row FILTER, not a RAISE.** `<table> organizer write` = ALL / `{authenticated}` / `is_organizer(community_id) or is_owner(community_id)`, plus anon and authenticated read (read live from `pg_policies`, C89-DONE 2026-08-04). A session that has drifted off organizer membership gets `error: null` and zero rows touched. That is why every direct client writer does a read-back, and why every RPC here returns a row or a count.

**`action_log` has RLS enabled and zero policies** (0002:15-22, 0008). No client role can select or insert it. The only write door is a SECURITY DEFINER function; the only read door is `read_action_log`. Keep it that way: a policy would open the audit log to every authenticated account.

**The organizer guards.** `caller_role(p_community)` reads `memberships` for `auth.uid()`; `is_organizer` is `caller_role in ('owner','organizer')`; `is_owner` is `caller_role = 'owner'` (0037:5-19). `is_organizer` already covers an owner, so the shipped `is_organizer(x) or is_owner(x)` idiom is redundant but harmless. Match it.

**The 0052 lesson: a DEFINER RPC granted to `authenticated` bypasses table RLS, so the guard must live in the body.** 0055 (any signed-in user could rewrite any roster) and 0056 (any signed-in user could wipe a bracket, check the whole roster out, or forge audit rows) are the banked incidents. The guard IS the boundary. The idiom, verbatim from 0056:33-35: `if not (public.is_organizer(v_comm) or public.is_owner(v_comm)) then raise exception '...' using errcode = '42501'; end if;`. It works despite anon and PUBLIC EXECUTE being revoked on the helpers, because a helper runs as its owner while `auth.uid()` still reads the caller's JWT.

**`_audit_actor()`** (0052:79-107) resolves the role from `memberships`, then `coalesce(nullif(display_name,''), nullif(email,''), role)` from `profiles`, falling back to `('anon','public',null)` only when `auth.uid()` is null. The actor NAME is already solved for rows written since 0052 by a signed-in caller. No `display_name` join is needed at read time, and none is possible: `action_log.actor` is a TEXT snapshot with no FK.

**Grant shape, every function here** (0051:74-75, 0048:109-110): `revoke all on function public.<f>(<args>) from public, anon;` then `grant execute on function public.<f>(<args>) to authenticated;`. Revoke from PUBLIC first. Nothing in this round is granted to anon. Two traps the 0039 gate caught and that re-apply to every apply: a role-scoped revoke is a NO-OP while a PUBLIC grant exists, so read `proacl` for a leading PUBLIC entry after every apply; and 42501 COLLIDES, because the guard raises it and a nested permission denial raises it too, so every guard fixture asserts on the MESSAGE.

## 1. Move in the Pools drawn block (UI only, no migration)

**Safe by construction, not by a flag.** `buildMgPoolsHTML` (app.js:11634-11647) calls `mgPoolsSetupHTML` only when `poolMatches.length === 0`, so the "Pools drawn" block is reachable only where the tournament has pools and zero `phase='pool'` matches. A move there is a `pool_id` write with nothing to rebuild. The gate is the router.

**Change.** `mgPoolTeamsBlockHTML(pool, teams, matches)` (app.js:11747) gains a fourth argument `pools`, defaulting to null so the block renders exactly as today when it is not passed; its one caller is app.js:11677. Each `.mgps-pteam` row gains `<span class="pc-move" data-pc-move="<team id>">Move</span>` before `MG_CHEV`, rendered only when `others = pools.filter(p => p.id !== pool.id)` is non-empty (a one-pool draw has nowhere to move a team to). When `mgpMoveTeamId === tm.id` the row is followed by the same `.pc-pick` block `mgPoolCardHTML` draws at app.js:11871-11875: the `Move <b>Name</b> to &rarr;` label, one `.pc-pbtn` per other pool carrying `data-pc-pick="<team id>:<pool id>"`, and a `.pc-pcancel` Cancel. Markup copied, not reinvented. The rows are wrapped in one `<div data-pc-card="<pool id>">` so `mgPoolsMoveTeam`'s existing destination flash (app.js:12362) lands; without it `mPlay(null, ...)` returns at app.js:5062 and the move is silent.

**Delegate: ZERO change.** `data-pc-move`, `data-pc-pick` and `data-pc-cancel` are handled in the `mgtView === 'pools'` branch at app.js:14124-14139, which serves the setup block and the controls cards alike. The order is already right: Move is checked at :14124 before `data-mgps-team` at :14150, because the Move span sits inside the row that carries the team hook. `mgPoolsMoveTeam` (app.js:12346) keeps its write-try / refresh-try split and `tdbMoveTeamToPool` (app.js:2256) keeps its zero-row read-back with "The move did not save. Check you are signed in as an admin." `manageNetsDirty()` (app.js:10648) already returns true while `mgpMoveTeamId` is set, so the pre-start picker inherits the poll guard.

**Copy.** One `.mgps-note` between the last pool block and the Start pool play button: "Move a team to another pool now. Once the schedule is drawn, teams stay put." No `.pc-lock` line here, because nothing is locked yet.

**Tests.** `test/manage-round.test.js:1739-1745` is the guard that flips: its UNDRAWN branch asserts `expect(open).not.toContain('data-pc-move=')` with the comment "until C101 item 7 gives Move a safe home there". Edit assertion and comment together. New cases, all driven through the real builder and the real delegate (`withDelegate` plus `tap()`, the 2026-08-03 inert-Undo lesson): the pre-start block renders one Move per team and no lock line; a one-pool draw renders none; a tap opens the picker with a Cancel and a button per other pool; a pick calls `moveTeamToPool` with the right pair; the poll guard is dirty while it is open; the drawn block still renders no Move (`:1691-1717` stays green). Ship: `APP_VERSION` to `'2026.08.25.36'`, `node --check public/app.js`, `npm test` from inside `test/` gating on the runner's exit code, commit, push.

## 2. `0059_profiles_email_sync.sql`

```sql
create or replace function public.handle_user_email_change() returns trigger
 language plpgsql security definer set search_path to 'public' as $fn$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end $fn$;
revoke all on function public.handle_user_email_change() from public, anon, authenticated;
drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (new.email is distinct from old.email)
  execute function public.handle_user_email_change();
update public.profiles p set email = u.email
  from auth.users u where u.id = p.id and p.email is distinct from u.email;
```

**A trigger, not an RPC.** The RPC alternative would fire from `onAuthEvent`, which returns early when `!isNewSignIn` (app.js:7276-7278) and a confirmed email change is the SAME user id, and would need `setTimeout(0)` around the supabase-js auth lock. Two traps, zero benefit. **DEFINER is required**, not stylistic: the trigger fires inside GoTrue's transaction under a role with no rights on `public.profiles`; `handle_new_user` (0033:11-23) is the shipped proof. EXECUTE revoked from every client role; a trigger function needs no grant.

**Guards.** `when (new.email is distinct from old.email)` is the storm guard, so every other `auth.users` update is a no-op; `where id = new.id` is the containment, making a cross-row write impossible even though DEFINER bypasses RLS (`profiles` carries only `profiles self read` and `profiles self update`, 0033:25-26, and no INSERT policy). **Writes** `profiles.email` and nothing else. **Returns** `new`; there is no UI read-back and no UI call site, which is the whole value. **No `action_log` row:** this round's log rows are organizer actions in Manage, and inside a GoTrue transaction the actor `_audit_actor()` would resolve is not established. **No exception, ever:** a raise here would fail the user's own email change. **Structurally** it touches `public.profiles` alone, so neither tournament is reachable.

**The trap to refuse.** `profiles self update` has no `with check` and no column list, so the client CAN write its own `profiles.email` beside the name save at app.js:7640. That would write the address BEFORE confirmation and contradict the account screen's promise "Until you tap it, sign in with your old address."

**Tests.** SQL half: the body is provable in the harness through a direct `update public.profiles` fixture; whether `execute_sql` may update `auth.users` inside a rolled-back block is unknown, so the trigger firing is proved post-apply. Client half: the tell that this shape is right is ZERO churn, so the whole existing Task 5 describe (`test/account-round.test.js:1400-1749`) stays green with no edits, plus two source guards in the genre of `test/tournament-round.test.js:273-279`: `onAuthEvent`'s body contains no `profiles` write, and a `TOKEN_REFRESHED` event produces zero supabase calls. Post-apply, on Mike's word: change one address end to end, then compare `from('profiles').select('id,email').eq('id', uid)` against `auth.getUser().email`.

## 3. `0060_set_team_paid.sql`

```sql
create or replace function public.set_team_paid(p_team uuid, p_paid boolean) returns public.teams
 language plpgsql security definer set search_path to 'public' as $fn$
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
```

**DEFINER is not optional:** `action_log` has RLS on and no policy, so a direct table write can never leave a row. `teams.community_id` is NOT NULL with a default (0035), so the guard cannot be skipped by a null. **Guards:** team exists, then organizer or owner. Nothing else, deliberately: a completed tournament does NOT refuse a payment change, because paid is a money fact and not a result. Say so in the header so nobody "fixes" it later. **Returns** `public.teams`, so `mgTeamTogglePaid` (app.js:11185-11208) verifies from the returned row instead of proving the write by re-reading the whole tournament; keep the refresh for the rest of the page, stop treating it as the proof.

**`action_log` row:** `action='set_team_paid'`, `entity_type='team'`, `entity_id = p_team`, `detail = 'marked Sand Sharks paid'` or `'marked Sand Sharks unpaid'`. The `prose` column does not exist yet at this migration; task 4 rewrites this function to write the same sentence into `prose`. Between the two the log reads `set_team_paid · marked Sand Sharks paid`, which is honest.

**UI.** `tdbSetTeamPaid` (app.js:2177-2181) swaps `from('teams').update({paid})` for `rpc('set_team_paid', { p_team: teamId, p_paid: !!paid })` and returns the row. Two entry points share it: the team sheet switch (app.js:11531) and the popup action `data-mgtp-paid` (app.js:11591, delegate app.js:11619-11626). A THIRD paid site does NOT change: Add-a-team writes `paid` through `register_team`'s `p_paid` (0054:75-77). **Copy:** the popup note at app.js:11599 goes from "Every admin sees this straight away." back to the handoff sentence "Logged in the activity log with your name.", and the comment block above it (app.js:11592-11598) is replaced by a one-line note naming this migration, not deleted silently. **Errors, printed raw through `appNotice`:** "That team is not here any more." and "Only an organizer can change a payment".

**Tests.** SQL half: an organizer passes and exactly one `action_log` row appears carrying the team NAME and the organizer's display name; a no-membership caller gets 42501 AND the exact message; an unknown id raises "That team is not here any more."; the returned row carries the new flag. Client half: `test/team-payment-popup.test.js:154-165` is rewritten to assert the `rpc` call shape and payload; `:290-296` flips, its comment rewritten to name 0060; the popup and the list row repaint off the RETURNED row; a failed RPC restores the button label and notices; `from('teams').update({paid` appears nowhere in `app.js`; `test/manage-round.test.js:1032` stays green because Add-a-team is unchanged. Add `'set_team_paid'` to `MUTATING_RPCS` (`test/supabase-writes.test.js:29-33`).

## 4. `0061_action_log_prose.sql`

```sql
alter table public.action_log add column if not exists prose text;
comment on column public.action_log.prose is
  'A finished plain-text predicate written by the RPC that made the change ("marked Sand Sharks paid").
   The client renders it after a bolded actor, so it carries no actor, no markup, no trailing period.
   NULL on pre-C101 rows, which fall back to action + detail.';
-- read_action_log(int): body unchanged except the action_log leg's summary expression, which becomes
--   coalesce(nullif(btrim(al.prose), ''),
--            al.action || case when nullif(btrim(coalesce(al.detail, '')), '') is not null
--                              then ' · ' || al.detail else '' end)::text as summary
```

**`read_action_log(p_limit int default 50)` keeps everything else** (0051:123-155): DEFINER, `set search_path to 'public'`, the `is_organizer('2c3bcfa9-305e-448b-924b-da90c029f575')` guard raising `'Admins only'` with 42501, the `copilot_actions` union, `order by feed.at desc nulls last`, the `greatest(1, least(coalesce(p_limit,50),200))` clamp, and `revoke all ... from public, anon; grant execute ... to authenticated;`.

**Prose is a PREDICATE, not a sentence with a subject.** `buildMgLogHTML` renders `<b>{actor}</b> {summary}` with both escaped and the actor falling back to "Someone" (app.js:8894, 8905-8906). Prose that repeats the actor renders "Mikey Mikey moved Net Gains"; prose carrying `<b>` renders literal angle brackets. Lowercase verb, no actor, no markup, no final period. The shipped test fixture `{ actor: 'Mikey', summary: 'closed registration' }` (`test/manage-page.test.js:1828-1874`) is the shape, and this migration makes it real. This CORRECTS the digest's item 6 and item 7 sample prose, which both began with the actor.

**Five `create or replace`s in this file**, each keeping its signature, DEFINER, `search_path`, guard, body and grants, and each gaining `prose` on its existing or new insert. Only `register_team` and `set_team_paid` write a row today; the other three get the standard `select a.actor, a.role, a.grp into ... from public._audit_actor() a;` plus one insert.

| Function (signature unchanged) | `action` | prose |
|---|---|---|
| `draw_pools_atomic(uuid, jsonb, jsonb) returns void` (0048:33) | `draw_pools` | `'drew ' \|\| v_pools \|\| ' pools for ' \|\| v_tname` |
| `start_pool_play_atomic(uuid, jsonb) returns void` (0048:76) | `start_pool_play` | `'started pool play, ' \|\| v_count \|\| ' games scheduled'` |
| `register_team(uuid, text, jsonb, text, boolean) returns public.teams` (0054:46) | `register_team` | `'added ' \|\| nm \|\| ' to ' \|\| t.name` |
| `set_member_role(text, public.community_role) returns void` (0051:36) | `set_member_role` | `'made ' \|\| p_email \|\| ' an organizer'` or `'removed admin access for ' \|\| p_email` |
| `set_team_paid(uuid, boolean) returns public.teams` (task 3) | `set_team_paid` | `'marked ' \|\| v_name \|\| ' paid'` or `' unpaid'` |

The sixth DEFINER writer from Mike's call 7, `clear_bracket_atomic`, gets its prose inside task 5 where it is recreated anyway; rewriting it here and again one migration later would be two diffs for one change. **Grants are unchanged on all five**, and `create or replace` preserves ACLs, so the `proacl` read after the apply is the assertion that it did. **No UI call site and no client change:** `buildMgLogHTML` already prints `summary` verbatim and escaped, which is the point of writing prose at write time. **No `action_log` policy is added.**

**Tests.** SQL half: one fixture per writer asserting exactly one row with the right actor and a lowercase-predicate `prose`; `read_action_log(50)` as an organizer returns prose for a new row and `action · detail` for a pre-C101 row; a non-organizer still gets 42501 with "Admins only". Client half: `test/manage-page.test.js:1828-1874` (day grouping, loading line, escaping) reshaped rather than deleted, with a prose row and a legacy `action · detail` row in one list; a summary containing `<b>` renders escaped; no emitted string carries an em dash.

## 5. `0062_clear_bracket_result.sql`

```sql
drop function if exists public.clear_bracket_atomic(uuid);
create function public.clear_bracket_atomic(p_match uuid) returns int
 language plpgsql security definer set search_path to 'public' as $fn$
-- body byte-identical to the LIVE definition (start from pg_get_functiondef, never the repo copy) except:
--  (1) after the organizer guard:
--        if coalesce(m.phase,'') <> 'main' then raise exception 'That is not a bracket game.'; end if;
--  (2) the reopen UPDATE also sets champion_team_id = null
--  (3) the action_log insert also writes prose
--  (4) returns coalesce(array_length(to_reset,1),0);
$fn$;
revoke all on function public.clear_bracket_atomic(uuid) from public, anon;
grant execute on function public.clear_bracket_atomic(uuid) to authenticated;
```

**Why a DROP is acceptable here and only here.** Postgres will not `create or replace` across a return-type change. The blast radius is zero because nothing calls the function today: `grep -c clear_bracket_atomic public/app.js` returns 0, and 0056:5-7 says the CLEAR UI was deleted in v.22. That window closes the moment the UI is wired, so this is the last moment it is free. Re-issue both grant lines after the recreate and confirm with `proacl` that no PUBLIC entry survives.

**Guards, in body order.** (a) match exists, else "That game is not here any more."; (b) organizer or owner, 42501, "Only an organizer can clear a bracket"; (c) NEW, `phase = 'main'`, else "That is not a bracket game." That third guard closes a real hole: the shipped function has no phase check, so a POOL match id resets that pool row and logs it as `action='clear_bracket', entity_type='main_match'`. (d) A completed tournament is NOT refused, it is REOPENED to `'bracket'`, the existing and correct behaviour (0056:64-65). (e) A game already played is exactly the input.

**Writes** the recursive chain over `winner_next_match_id` / `loser_next_match_id` collecting every downstream match that is not `scheduled`; the fed slot nulled on each collected match's children (slot 1 means `team_b_id`, else `team_a_id`, the mapping already at 0039:259 and 0056:51-56); the collected rows reset to `scheduled` with null score, winner and loser plus `updated_at = now()`; and `update public.tournaments set status='bracket', champion_team_id = null, updated_at = now() where id = v_tournament and status = 'completed'`. The champion null is Mike's call 3: today `clear_bracket_atomic` and `reopen_tournament` both leave it while `resolveHistoryChampion` prefers the STORED champion over the computed one (`pure.js:431`), so a cleared bracket can keep printing a champion it no longer has. `close_tournament` (0050:34-70) writes it again.

**Returns `int`,** the rows reset. The client asserts `n >= 1`, then `tdbRefreshTournaments()` and repaints from server truth. That is what turns `returns void`, which gives the client nothing against the read-back law, into a verifiable call. **`action_log` row:** `action='clear_bracket'`, `entity_type='main_match'`, `entity_id = p_match`, `detail = n || ' matches reset'` unchanged, `prose = 'cleared ' || n || ' bracket result' || case when n = 1 then '' else 's' end`.

**UI and copy.** A new `tdbClearBracketResult(match)` in the tdb band near app.js:2605; a new `data-mgss="clear"` control in `buildMgScoreSheetHTML` (app.js:12038-12124), rendered only when `isFinal && state.isAdmin`, beside the `data-mgss="edit"` primary in `.mgv-scfoot`; the branch in `openMgScoreSheet`'s delegate (app.js:12240-12245). Label **"Clear this result"**, never "Undo": Mike removed the Undo strip, `test/manage-round.test.js:2268` bans the literal on the bracket page, the clear lives in the score CARD and not on the page, and the edit hint at app.js:12120 already says "clear the result first", which this task finally makes true. A confirm, because it is destructive: `appConfirm({ title: 'Clear this result', message: 'The score goes and the teams it sent through come back. This cannot be undone.', confirmText: 'Clear it' })`. **Errors, printed raw at app.js:12202:** "That game is not here any more.", "Only an organizer can clear a bracket", "That is not a bracket game."

**One drift to fix while in the card.** `sync()`'s recomputed `canFinal` at app.js:12177 is missing the `&& !(isFinal && a === 0 && b === 0)` clause the build-time version at app.js:12117 carries. Benign today, wrong tomorrow; bring the two into line in the task that edits the card.

**Tests.** SQL half: a no-membership caller gets 42501 AND the exact message; an organizer gets a count; a leaf clear resets 1 and blanks 1 downstream slot; an early winners game unwinds the whole played chain and leaves untouched siblings alone; a scheduled downstream match is blanked but not reset; clearing the grand final reopens a completed tournament and nulls the champion; a POOL match id now raises; and, for the double-advancement hazard, re-scoring after a clear advances into an EMPTY slot rather than being dropped by `submit_match_score`'s silent `and %I is null and status = 'scheduled'` write. Client half: the call shape and its one argument; the read-back asserted, never optimistic; the error copy is the RPC's message; an RPC-not-ready error degrades honestly and never falls back to a direct `matches` write; the confirm gates the call; the edit hint's promise is now reachable; the delegate reaches the control from a real tap; a signed-in player never sees Clear. Plus a pure `bracketClearPlan(matchId, matches)` added to the `pure.js` export list (pure.js:2036-2066) with an N=2..24 property test: clearing every game in reverse play order returns the bracket to its generated state. That property is what makes C79 safe. `clear_bracket_atomic` is already in `MUTATING_RPCS` (`test/supabase-writes.test.js:31`); add the wiring guard that every RPC the app needs appears as a literal in `app.js`, which would have caught this dead function since 2026-06-19.

## 6. `0063_clear_whole_bracket.sql`

```sql
create or replace function public.clear_whole_bracket(p_tournament_id uuid) returns int
 language plpgsql security definer set search_path to 'public' as $fn$
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
  update public.matches
     set score_a = null, score_b = null, winner_team_id = null, loser_team_id = null,
         status = 'scheduled', version = version + 1, updated_at = now()
   where tournament_id = p_tournament_id and phase = 'main';
  get diagnostics n = row_count;
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
            p_tournament_id::text, n::text || ' bracket results cleared',
            'cleared every bracket result for ' || v_name || ', ' || n::text || ' games');
  return n;
end $fn$;
revoke all on function public.clear_whole_bracket(uuid) from public, anon;
grant execute on function public.clear_whole_bracket(uuid) to authenticated;
```

**The slot rule is the whole design and it is exact.** `generate_bracket_atomic` fills `team_a_id` / `team_b_id` at generation ONLY when the source carries a seed, and writes the feeder pointers for everything else (app.js:2790-2801). So "was this slot seeded or advanced" is answerable from the graph with no `source_a` / `source_b` string parsing: a slot is FED exactly when some match points at it.

**Guards:** tournament exists; organizer or owner, 42501; status in `('bracket','completed')`. A `completed` tournament is deliberately NOT refused: clearing right after a tournament ends is the main reason the control exists, and `clear_bracket_atomic` already reopens one. State that in the header so the next reader does not "tighten" it. **Returns `int`,** the `phase='main'` rows blanked; the client asserts it against the bracket size it already holds in `state.tournamentMatches`, then refreshes.

**UI and copy.** A new `tdbClearWholeBracket(tournamentId)`; a SECOND control in `mgBracketResetHTML` (app.js:12740-12745), leaving the destructive `data-mgbk-reset` and `tdbResetBracket` (app.js:2606-2612) untouched. The two must be impossible to confuse. New: `data-mgbk-clear`, label "Clear every result", note "Blanks every bracket score and sends the teams back to their first-round games. The bracket itself stays. Type the tournament name to confirm." Existing, unchanged: `data-mgbk-reset`, label "Reset the bracket", note "Clears the bracket and returns to pools. Pool games and scores are kept. Type the tournament name to confirm." Both stay behind the type-the-name unlock (`appPrompt`, the shape at app.js:12796). §38 applies to this UI half, never to the SQL. **Errors:** "That tournament is not here any more.", "Only an organizer can clear a bracket", "There is no bracket to clear yet."

**Tests.** SQL half: a full played bracket blanks to `scheduled` with every seeded round-1 pairing intact and every advanced slot null; the count equals the `phase='main'` row count; a completed tournament comes back as `bracket` with a null champion; a `setup` or `pools` tournament raises the exact message; a no-membership caller gets 42501 with the exact message; re-scoring after the clear advances into an empty slot. Client half: the two controls read differently and both require the typed name; it is NOT the delete, so no `matches:delete` statement appears anywhere in the flow; the count read-back is asserted; a refused call surfaces the RPC's message; the delegate reaches both controls from a real tap. **The guard that flips:** `test/manage-round.test.js:2261-2270`, "rides between the controls and the board, and brings nothing from the data round with it". Its `not.toContain('Clear every score')` becomes an assertion that the page carries exactly two controls, `data-mgbk-clear` and `data-mgbk-reset`, with a comment naming 0063. The two that stay are `not.toContain('bkr-undo')` and `not.toContain('Undo')`: no Undo strip ships, in this round or any other, and `:2500` (no `.bkr-undo` in the CSS) stays green. Add `'clear_whole_bracket'` to `MUTATING_RPCS`.

## 7. `0064_move_team_to_pool.sql`

```sql
create or replace function public.move_team_to_pool(
  p_tournament_id uuid, p_team uuid, p_pool uuid, p_matches jsonb) returns int
 language plpgsql security definer set search_path to 'public' as $fn$
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
  if exists (select 1 from public.matches
              where tournament_id = p_tournament_id and phase = 'pool' and status = 'final'
                and pool_id in (v_from, p_pool)) then
    raise exception 'Those pools have already played.'; end if;
  update public.teams set pool_id = p_pool where id = p_team;
  delete from public.matches
   where tournament_id = p_tournament_id and phase = 'pool'
     and status <> 'final' and pool_id in (v_from, p_pool);
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
```

**A plan, not server arithmetic.** "Re-pointing unplayed matches" understates it: the team's unplayed fixtures are against the OLD pool's opponents, so a faithful move is a two-pool schedule regeneration. The round-aware net layout that makes such a schedule correct lives in `pure.js` (`layoutRoundsOnNets`, `assignPoolGameSlots`, `relayoutPoolGamesOnNets`) and is proven across 1,984 configs by C76; reimplementing it in plpgsql reintroduces the double-booking bug. `draw_pools_atomic` and `start_pool_play_atomic` (0048) already establish the compute-in-the-client, apply-atomically-on-the-server shape, and `start_pool_play_atomic` is the exact precedent: it takes `p_matches jsonb`, deletes, inserts and flips in one DEFINER call.

**Guards, all three the round cares about.** A completed tournament is REFUSED (`status` must be `setup` or `pools`); either pool holding a `final` pool game is REFUSED, which is the server finally enforcing what the UI has only drawn; and the delete is additionally scoped to `status <> 'final'`, so a played row cannot be destroyed even if a guard is later loosened. The `for update` on the tournament row serialises two organizers moving at once. **Watch `matches_pool_pair_uq`,** the partial unique on `(tournament_id, pool_id, team_a_id, team_b_id) where phase = 'pool'` (0023:18-21): delete-then-insert in one transaction avoids the collision, but the supplied plan must not itself contain a reversed duplicate pairing, because the index is order-sensitive. **Returns `int`,** the matches written, replacing the string-matching read-back at app.js:2260.

**UI and copy.** `tdbMoveTeamToPool` (app.js:2256-2261) builds the plan from the pure helpers and calls the RPC; a new pure `poolMovePlan(teamId, fromPool, toPool, teams, matches)` returning `{ plan, keep }` joins the `pure.js` export list; `mgPoolsMoveTeam` (app.js:12346) keeps its write-try / refresh-try split unchanged; `mgPoolCardHTML`'s `movable` (app.js:11859-11861) relaxes from task 0's `!drawn` back to `!played`; the lock line (app.js:11884) and the panel note (app.js:11905) change in the same edit; the second entry point is the team sheet at app.js:11538. After this task the panel note reads "Move a team to another pool, change the nets a pool plays on, or start the draw over.", a pool that has played still reads "Play has started, teams stay put.", the schedule-is-drawn lock line retires with the gate that drew it, and the picker gains one line under it: "Finished games stay where they were played. The rest are rescheduled." **Errors:** "That tournament is not here any more.", "Only an organizer can move a team", "This tournament is past pool play.", "That team is not in this tournament.", "That pool is not in this tournament.", "Those pools have already played."

**Tests.** SQL half: an organizer moves and both pools come back with a complete unplayed schedule and zero net double-bookings (reuse the C76 assertion); a pool with a final game refuses with the exact message; a `completed` tournament refuses; a no-membership caller gets 42501 with the exact message; final rows survive the delete; `matches_pool_pair_uq` does not fire. Client half: the RPC call shape and its four arguments; the plan is built by the pure helper and never in the writer; the count read-back is asserted; a refused move surfaces the RPC's message and the picker stays open; the write / refresh split still reports "The team moved" when only the refresh failed; the delegate reaches Move from a real tap in BOTH homes. **Assertions this invalidates, named:** `test/manage-round.test.js:1691-1717` (no `data-pc-move` on a drawn pool, and the drawn lock line), `:1722-1746` (the lock lines and the UNDRAWN branch task 1 already edited), `:1959-1978` (`tdbMoveTeamToPool refuses to report a move that RLS silently dropped`, whose `expect(seen).toEqual([['from','teams'],['update',{pool_id:'p2'}],['eq','id','t1'],['select','id']])` at `:1974` becomes an `rpc` assertion). All are correct today and become wrong the moment the RPC lands; `:1981-1992` (the poll guard) must stay green. Add `'move_team_to_pool'` to `MUTATING_RPCS`.

## Structural protections, written into the SQL

The June 2026 tournament's hand-authored 12-game schedule exists ONLY in the database and no file can regenerate it; the August 2026 tournament is `completed`. Neither is protected by a sticky note here. **`clear_whole_bracket` touches only `phase = 'main'` rows,** and June's irreplaceable schedule is `phase = 'pool'`, so the function cannot reach it whatever its status; that sentence goes in the 0063 header and the claim is verified read-only before the first real call (June must return zero `phase='main'` matches). **`move_team_to_pool` refuses unless `status in ('setup','pools')`,** and both tournaments are `completed`, so it refuses them by predicate rather than convention; its delete is scoped to `status <> 'final'`, so even inside an allowed tournament a played game survives. **`clear_bracket_atomic` refuses any match whose `phase` is not `'main'`,** which is the new guard that keeps a mistyped pool match id off June's schedule. **`set_team_paid` and 0059's trigger reach no match row at all.** Two pre-existing hazards this round does NOT close, named in the 0063 and 0064 headers so nobody assumes it did: `start_pool_play_atomic` deletes ALL of a tournament's pool matches, finals included, with only its `status='setup'` guard between June and a wipe (0048:90-99); and no constraint, trigger or RLS predicate anywhere references `tournaments.status`, so anon can still score a scheduled match in a completed tournament through `submit_match_score`.

## The verification gate, run for every migration

1. Write the migration off the LIVE `pg_get_functiondef`, never the repo copy. Two functions here were once live-only before being captured (0021, 0022), and C89-DONE proved the files are not a faithful record of live RLS.
2. Prove it in `begin; <DDL + fixtures + assertions into a temp table>; select temp; rollback;` through `execute_sql`, with faked JWT claims across anon / authenticated / player / organizer / owner, then a `to_regclass` probe proving the rollback took and left no residue.
3. Assert on the MESSAGE, not just the SQLSTATE. 42501 collides.
4. Apply with `apply_migration`, named after the file slug, never `execute_sql`.
5. Diff the deployed `pg_get_functiondef` against the file, verbatim.
6. Read `proacl` and confirm exactly the intended grants, remembering that a role-scoped revoke is a no-op while a PUBLIC grant exists.
7. Re-run `get_advisors(security)` and confirm zero NEW findings against the baseline taken at the top of the round.
8. Re-read the count baseline (233 players, 18 teams, 71 matches, 1 tournament, plus an `action_log` count) and confirm nothing moved. A pure DDL round moves none of them.
9. Wire the UI, bump `APP_VERSION`, `node --check public/app.js`, `npm test` from inside `test/` gating on the RUNNER's exit code and never on a grep of its output, commit.
10. Append `APPLIED <date> via the Supabase MCP on Mike's word` to the migration header, matching 0058's convention, and commit that line. A DB-only commit has no `APP_VERSION` to bump, which is why 0058 shipped as two commits.

**Preconditions, once at the top of the round.** Take the count baseline and the `get_advisors(security)` baseline. Read the LIVE `pg_get_functiondef` and `proacl` of every function the round replaces: `clear_bracket_atomic`, `read_action_log`, `draw_pools_atomic`, `start_pool_play_atomic`, `register_team`, `set_member_role`. Confirm what `action_log.actor` holds on recent rows with one organizer call to `read_action_log(50)`.

## Migration file conventions

Copied from `0058_tournament_venue.sql` (header) and `0039_scoring_overwrite_guard_and_grant_hardening.sql` (rollback block), the two files this repo's convention actually lives in. **Path:** `db/migrations/NNNN_slug.sql`, never `supabase/migrations/`. There is no runner, no `scripts/`, no `supabase/config.toml`; the files are a record of what was applied, not a mechanism. **Header, comment lines only, in this order:** the file name and a one-line what; WHY, the behaviour that forced it, with the app.js or migration citation; the decisions taken inside the file and the ones deliberately not taken; what stays true before AND after the apply, so a half-deployed state is understood; then the `APPLIED <date>` line added at step 10. **Idempotency:** `add column if not exists`, `create or replace function`, `drop trigger if exists` before `create trigger`. The one exception is `drop function if exists public.clear_bracket_atomic(uuid);` in 0062, required by the return-type change and safe only because nothing calls it yet. **Transactions:** wrap multi-statement DDL in `begin; ... commit;` the way 0056 does; a lone `alter table ... add column` does not need it (0058). **Rollback section:** 0039's style, a commented block at the top headed `ROLLBACK BLOCK (verbatim prior definitions + re-grants, apply this whole block to undo NNNN)` and closed with `END ROLLBACK BLOCK`, holding the LIVE prior definition captured at step 1 plus its grant lines (0039:25, 0039:188; the shipped header punctuates that line with an em dash, which this round's files do not). Every function-replacing file here carries one; 0061 carries `ROLLBACK: alter table public.action_log drop column if exists prose;` plus the prior `read_action_log` definition. **Grants sit immediately under their function,** revoke first, grant second, one line each.

## The Supabase MCP process

The plugin's OAuth token is per project folder and expires, so before any migration expect the `authenticate` link and open it IN Mike's Chrome through the extension; a 600-character URL pasted into the terminal is unusable to him. One mint at the top of the round covers it. `apply_migration` for every DDL statement, named after the file slug; `execute_sql` only for fixtures and probes inside `begin ... rollback` and for read-only baselines, never for DDL. No secrets printed: the anon key needed for a REST read-back is public and already shipped in `public/supabase-config.js`, and it still does not go into chat, a commit, or the vault (§54). No branch: branching has never been used here and was rejected on the record, a branch carries schema but no production rows, this repo has no `supabase/config.toml` and no `supabase/migrations/` layout, and a from-scratch replay of `db/migrations` fails at 0001:38 because `public.players` and `public.sessions` have no CREATE in any migration. The controller applies migrations; a builder never does. Subagents commit and do not push; the controller batches the pushes (§21).

## Not in this round

**C86, the scoreless pool result.** Mike's call 4. No RPC change, no `canFinal` change, no hint change; the pool card keeps "Tap a team to mark them the winner, then enter the score." and `test/manage-page.test.js:1212-1215` stays green, which is the tell that it did not sneak back in.

**The four direct-write doors that still leave no log row,** named so the later round has its list: (1) `tdbSetTournamentFields` (app.js:2170), carrying close registration, the venmo link, the rules sheet, the announcement, the venue, the date and the caps; (2) the `pickup_days` writes (app.js:8982-8983 insert and update, app.js:9008 delete); (3) team removal, `tdbWithdrawTeam` (app.js:2209) and the delete at app.js:2230; (4) `tdbDeleteTournament` (app.js:2669). The cheapest collapse for door 1 is a single `set_tournament_fields(p_tournament uuid, p_patch jsonb) returns public.tournaments` with a hardcoded column allow-list, which would also fix `tournaments.updated_at` (no trigger maintains it); its blast radius is wide, so it is its own task.

**A generic `log_admin_action(...)` the client calls after a successful direct write.** Refused: it is not atomic, the write can land and the log call fail, and an organizer could log a line about a write that never happened. Mixed with real per-write RPCs it produces a log nobody can trust.

**A true undo, and a match history table.** Mike's call 3. `action_log.detail` stores only the NEW value and `action_log.undo jsonb` is written by nothing, so a restore-prior-value undo is impossible from the data that exists. The history table is a round of its own.

## Tests

**Per task, vitest.** Task 1: six cases in `test/manage-round.test.js` driving the pre-start block and the real delegate. Task 2: two source guards in `test/account-round.test.js`, and the existing Task 5 describe green with zero edits. Task 3: the `rpc('set_team_paid')` call shape and payload, the read-back off the returned row, the failure path, and the source assertion that `from('teams').update({paid` is gone. Task 4: the log renderer against a prose row and a legacy row in one list, plus escaping. Task 5: the nine client cases plus the `bracketClearPlan` N=2..24 property test. Task 6: the two bracket controls, the typed name, the count read-back, and no `matches:delete` in the flow. Task 7: the RPC shape, the pure plan, the write / refresh split, and Move in both homes.

**Existing guards that flip deliberately, each edited with a comment naming its migration, never deleted:**

| File and lines | What it asserts today | What lands |
|---|---|---|
| `test/manage-round.test.js:1739-1745` | the UNDRAWN block has no `data-pc-move=` | task 1: one per team |
| `test/team-payment-popup.test.js:154-165` | paid writes through `from('teams').update` | task 3: through `rpc('set_team_paid')` |
| `test/team-payment-popup.test.js:290-296` | the popup claims no activity-log entry | task 3: it may claim one |
| `test/manage-round.test.js:2261-2270` | the bracket page carries no data-round control | task 6: two controls, still no Undo |
| `test/manage-round.test.js:1691-1746` | no `data-pc-move` on a drawn pool, and its lock line | task 7: Move returns post-draw behind the RPC |
| `test/manage-round.test.js:1959-1978` | `tdbMoveTeamToPool`'s direct PostgREST chain shape | task 7: the `rpc` shape |
| `test/supabase-writes.test.js:29-33` | `MUTATING_RPCS`, eight names | plus `set_team_paid`, `clear_whole_bracket`, `move_team_to_pool` |

**Guards that must stay green, and are the tell if they do not:** `test/manage-page.test.js:1212-1215` (the pool hint, C86 refused); `test/manage-round.test.js:1032` (Add-a-team still claims no log row); `:1981-1992` (the poll guard treats an open picker as unsaved work); `:2500` (no `.bkr-undo` in the CSS); `:426-435` (the already-final edit case).

**The SQL harness shape, identical for every migration:**

```sql
begin;
  create temp table t_out(name text, ok boolean, got text);
  -- fixture: a throwaway community, tournament, pools, teams, matches
  -- impersonate: set_config('request.jwt.claims', json_build_object('sub', <uuid>)::text, true)
  <the migration's DDL>
  -- one insert into t_out per assertion, capturing SQLSTATE *and* SQLERRM inside an exception block
select * from t_out;
rollback;
-- then, in a separate call: select to_regclass('public.<anything the block created>');  -- expect null
```

Every guard assertion captures `SQLERRM` and compares the MESSAGE. Every fixture runs against a throwaway tournament id, never June's and never August's.

## Open, and only Mike or the live database can answer

1. The word before each apply, and before each first real call of the three destructive RPCs (0062, 0063, 0064), each on a throwaway tournament created and removed in one FK-safe transaction with an exact baseline read-back afterwards.
2. Does the deployed `clear_bracket_atomic` match 0056 verbatim, and do the deployed grants on it, `read_action_log`, `draw_pools_atomic`, `start_pool_play_atomic`, `register_team` and `set_member_role` match the files, with no leading PUBLIC entry in `proacl`? That diff is the first read of the round.
3. What does `action_log.actor` hold on recent rows? One organizer call to `read_action_log(50)`.
4. Does the June row have any `phase='main'` matches? The claim that `clear_whole_bracket` cannot touch it rests on the answer being zero.
5. Is `profiles.email` already stale for any account? A self-read of `profiles` compared to `auth.getUser().email` proves 0059 is live rather than theoretical.
6. May `execute_sql` update `auth.users` inside a rolled-back block? That decides how much of 0059 can be proved before the apply rather than after.
