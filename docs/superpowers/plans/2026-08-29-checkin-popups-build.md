# Check-in pop-ups Implementation Plan: the card, the console, and groups leaving the product

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the organizer a pencil on every check-in row that opens the app's own player card over the list (name, rating, and check-in state corrected in place, no navigation, no lost scroll), an Add player pill in the console header that puts a walk-up on the roster OUT, a treatment for that card worth the game day it runs on with the close button pinned right in every pop-up, and groups removed from the product entirely: field, sublines, counter, manager panel, helper layer, `register_player`'s `p_group`, `players."group"` and the `groups` table.

**Architecture:** One DOM element, `#player-edit-modal`, serves Manage to Check-in and Manage to Players in three states (edit, add, and by origin). The console (`mgck*`) lives in `public/manage.js` after the C102 split; the card (`openPlayerEditPopup`, `closePlayerEditPopup`, `ensurePlayerEditModal`, the delegated save inside `ensureSaveDelegationBound`) and every delegate (`attachHandlers`) stay in `public/app.js`. The two files share one global lexical record, so cross-file calls resolve at call time and no name may be declared in both. Attendance is written by exactly one function, `mgckToggleByKey` (`public/manage.js:1171`), and the card's Save routes through it only when the draft flag actually differs. The groups removal is two migrations that bracket the client work: `0068` empties `players."group"` and makes `register_player` group-blind at its existing signature BEFORE any client stops sending `p_group`; `0069` drops the column, the table and the parameter one deploy AFTER the last client push is out and driven.

**Tech Stack:** vanilla JS classic scripts (`public/app.js` and `public/manage.js`, both LF; `public/pure.js`), `public/styles.css` (CRLF), Supabase JS 2.39.5 with SECURITY DEFINER RPCs, a service worker (`public/sw.js`), vitest 2 in `test/` (Node `vm` sandboxes, no DOM), Vercel static hosting, Postgres migrations as plain `.sql` files under `db/migrations/`.

**Spec:** `docs/superpowers/specs/2026-08-29-checkin-popups-design.md` (commit `421d4f7`, Mike-approved). The spec is the authority; this plan is its argument. Every line number below was read at branch HEAD `8f64c1c`; every task re-reads its own lines before editing, because each task shifts the next one's numbers.

## Global Constraints

- **Where the work happens.** A git worktree at `C:/Users/OlasM/AppData/Local/Temp/claude/C--Users-OlasM-OneDrive-Athletic-Specimen-App/cc8a1cfd-5548-46de-a7f5-c253f6bf1735/scratchpad/wt-checkin` on branch `checkin-popups`, currently at `8f64c1c` (the C102 split plus the rewired harnesses; suite green at 40 files / 1252 tests). `$WT` below. Every `cd` in every step is to `$WT` or `$WT/test`. The branch merges onto `main` after C102 ships; nothing in this round is committed to `main`.
- **Test commands run from `$WT/test`.** `cd "$WT/test" && npx vitest run`. `node_modules` there is a junction, so no install is needed and none may be run.
- `APP_VERSION` at `public/app.js:34` bumps on EVERY client code change, format `'YYYY.MM.DD.N'`, N resets to 1 each new day. The branch inherits `'2026.08.26.6'`; the first bump in this round is `'2026.08.29.1'` and the sequence runs `.1` to `.9` across Tasks 2 to 10.
- **Migration-only tasks do not bump `APP_VERSION`,** and this is deliberate rather than an oversight: `APP_VERSION` is the service worker's cache key (`public/sw.js` derives its cache name from the `?v=` registration param), and a `.sql` file is not a cached asset. Tasks 1 and 12 commit a migration file and nothing else.
- **Migrations are written by the task and APPLIED by the controller** through the Supabase MCP (`apply_migration`), at the two fixed points the spec sets: `0068` before the first client push, `0069` after the last. An implementer never applies SQL, never runs `execute_sql` against prod, and never stamps the `APPLIED` line.
- `node --check public/app.js` AND `node --check public/manage.js` AND `node --check` on their concatenation after every edit of either:
  ```bash
  cd "$WT" && node --check public/app.js && node --check public/manage.js \
    && cat public/manage.js public/app.js > "$SCRATCH/concat.js" && node --check "$SCRATCH/concat.js"
  ```
- The suite: `cd "$WT/test" && npx vitest run` green with NO test deleted, skipped or weakened. Baseline 40 files / 1252 tests; Task 2 adds the 41st file. Each task names the cases it adds; the gate is green plus that delta, never a lowered floor.
- `partialRender()` for every background sync, never `render()`. The card's Save uses `mgckCardNotice()` (which calls `mgckRepaint()`) or `repaintManage()`, never `render()`.
- **Copy law:** no em dashes anywhere, including code comments, test names and commit messages. Never the copy law's banned word for the dark hours. The middot `·` (U+00B7) and the empty-value en dash `–` (U+2013) are both legal and are used deliberately. No `!important` outside the documented iOS counters.
- **§51 no neon.** Every colour is an app token, a token's resolved literal, or one of the handoff's own oklch values in the warm-stone, muted-blue and muted-green families. The only hex introduced is `#fff`. No glow, no electric, no `box-shadow` glow.
- **§AS-1 admin-only skill ratings.** The stepper lives in a card that only ever opens from Manage. Nothing in this round puts a rating, a skill class or a skill span on `renderCheckinButton`, `buildKioskResultsHTML`, `disambiguatePlayersByName` or `public/checkin.html`.
- **Line endings.** `public/app.js` and `public/manage.js` are LF. `public/styles.css`, `public/pure.js`, `public/checkin.html` and every `test/*.js` are CRLF in the working tree while git stores LF (`core.autocrlf` is true, there is no `.gitattributes`). Write each file with the endings it already has, and NEVER `git stash` a `public/` file.
- **Subagents commit; the controller pushes** (§21). Commit messages follow the repo style: `type(scope): plain sentence - vYYYY.MM.DD.N`, no em dashes, no Claude trailers or attribution (§12).
- **Every subagent dispatch's first line invokes `lasolas-skill`** (§29).
- **The §38 marker is minted by the CONTROLLER, never by an implementer.** Once, from the main repo root, before Task 2's dispatch:
  ```bash
  cd "C:/Users/OlasM/OneDrive/Athletic Specimen App"
  node "C:/Users/OlasM/.claude/hooks/ui38-mark.mjs" --decision=3-options-shown --reason="Mike's own handoff, check-in pop-ups" public/app.js public/manage.js public/styles.css public/checkin.html
  ```
  The marker is session-scoped and file-scoped, so it survives commits within the session and covers all four files. Both `uiTest` maps now carry a `manage\.js` term (`C:/Users/OlasM/.claude/hooks/_vault-map.mjs:13` and `C:/Ai Master/LasOlas/projects/athletic-specimen.md:7`), so an unmarked markup edit to `manage.js` is BLOCKED. `ui38-mark.mjs:32` resolves the project from `process.cwd()`, and `$WT` sits under the mapped base path, so a marker minted from either root lands where the gate reads it.
- **The scratchpad for this round:** `C:/Users/OlasM/AppData/Local/Temp/claude/C--Users-OlasM-OneDrive-Athletic-Specimen-App/cc8a1cfd-5548-46de-a7f5-c253f6bf1735/scratchpad/checkin-popups/` (`$SCRATCH` below). Instruments live there, never in the repo.
- **No name may be declared in both `public/app.js` and `public/manage.js`.** A duplicate `let`/`const` is a `SyntaxError` that kills the whole second script at load; a duplicate `function` is legal and the second silently wins. The names this round adds are disjoint by construction. In `app.js`: `peMode`, `peOrigin`, `peReturnKey`, `peSkillStep`, `peInPillNode`, `openPlayerAddPopup`. In `manage.js`: `mgckNotice`, `mgckCardNotice`, `mgckAddFromCard`. C102's disjoint-names guard in `test/client-files.test.js` runs on every task's suite pass.
- **There is no DOM in the suite.** No `jsdom`, no `happy-dom`, no `@vitest-environment` pragma, and `test/package.json` lists exactly one devDependency. `openPlayerEditPopup` cannot execute in the harness at all: it returns at `public/app.js:137-138` because `modal.querySelector('.pe-card')` is `null`. Every card-markup claim is a source-slice guard; every claim that needs a live element is a drive fact verified at Task 11, listed in the spec's §7.4. **A task that cannot assert something with a builder string, a delegate tap or a source guard must put it in the drive list, never write a test the harness cannot run.**

---

## File structure

| File | Responsibility, and what this round changes in it |
|---|---|
| `public/manage.js` | the Manage surfaces (loaded before `app.js`). Changes: `mgckRows`, `mgckListHTML`, `buildManageCheckinHTML`, `mgckStripHTML`, `mgckRepaint`, `mgckToggleByKey`, `mgckAddAndCheckIn`, `buildMgpListHTML`, `buildManagePlayersHTML`, `mgpAddPlayer`; new `mgckNotice`, `mgckCardNotice`, `mgckAddFromCard`; deleted `buildMgpGroupsHTML`, `mgpBulkGroup`, `mgpAddGroup`, `mgpRenameGroupCommit`, `mgpDeleteGroup`, `mgGroupsOpen`, `mgMoveOpen`, `mgRenameGroup` |
| `public/app.js` | state, data layer, public builders, the card, every delegate, boot. Changes: `ensurePlayerEditModal`, `openPlayerEditPopup`, `closePlayerEditPopup`, the delegated save in `ensureSaveDelegationBound`, `attachHandlers`, `renderCheckinButton`, `buildKioskResultsHTML`, `flushOutbox`, `detectPlayersSchema`, `updatePlayerFieldsSupabase`; new `openPlayerAddPopup`, `peSkillStep`, `peInPillNode`, `peMode`, `peOrigin`, `peReturnKey`; the whole group helper layer deleted |
| `public/styles.css` | `.mgck-edit`, `.mgck-add`, `.pe-msg` added; `.pe-head`, `.pe-av`, `.pe-who`, `.pe-in`, `.pe-x`, `.pe-skillrow`, `.pe-skillin` restyled; `.pe-mark`, `.pe-eyebrow`, `.pe-sect`, `.pe-stepper`, `.pe-sb`, `.pe-inbtn` added; `.popup-header` pin rules added. The 2026-08-23 button block at `:6043-6076` is NOT touched |
| `public/pure.js` | `disambiguatePlayersByName` drops `group` from its returned row |
| `public/checkin.html` | `GROUP_NAME` deleted; the `register_player` call moves to two keys |
| `public/supabase-config.js` | `CLUB_GROUP` deleted once it is unreferenced |
| `test/checkin-popups.test.js` (new, Task 2) | the round's own cases: builder strings, delegate taps, source guards |
| `test/checkin-page.test.js` | one existing case inverted (the kiosk group differentiator) |
| `test/pure.test.js` | the kiosk row shape loses `group` |
| `test/manage-round.test.js` | the existing CSS case at `:509-513` gains the pinned-× assertions |
| `db/migrations/0068_normalize_player_groups.sql` (new, Task 1) | empties the column, makes `register_player` group-blind at its existing signature |
| `db/migrations/0069_drop_player_groups.sql` (new, Task 12) | drops the column, the table, the parameter and the old overload |

---

## Task 0: Open the round (controller, inline)

**Model tier:** standard. Judgment about state, no code.

**Files:**
- Create: `$SCRATCH/baseline.md`
- Modify: nothing in the repo

**Interfaces:**
- Produces: the recorded baseline every later task's gate is measured against, and the §38 marker every UI task depends on.

- [ ] **Step 1: Confirm the worktree and the branch**

```bash
WT="C:/Users/OlasM/AppData/Local/Temp/claude/C--Users-OlasM-OneDrive-Athletic-Specimen-App/cc8a1cfd-5548-46de-a7f5-c253f6bf1735/scratchpad/wt-checkin"
cd "$WT"
git rev-parse --abbrev-ref HEAD          # expect checkin-popups
git rev-parse --short HEAD               # expect 8f64c1c
ls public/manage.js public/app.js        # both present
grep -c $'\r' public/app.js              # 0 (LF)
grep -c $'\r' public/manage.js           # 0 (LF)
grep -c $'\r' public/styles.css          # equals its line count (CRLF)
```

- [ ] **Step 2: Record the baseline**

```bash
cd "$WT/test" && npx vitest run 2>&1 | tail -4     # expect 40 files, 1252 tests, all green
cd "$WT" && grep -n "APP_VERSION" public/app.js | head -1   # const APP_VERSION = '2026.08.26.6';
ls db/migrations/ | tail -3                        # highest is 0067_move_noop_and_clear_live_guard.sql
```
Write the four facts into `$SCRATCH/baseline.md`: HEAD, file/test counts, `APP_VERSION`, highest migration.

- [ ] **Step 3: Mint the §38 marker (controller only)**

```bash
cd "C:/Users/OlasM/OneDrive/Athletic Specimen App"
node "C:/Users/OlasM/.claude/hooks/ui38-mark.mjs" --decision=3-options-shown --reason="Mike's own handoff, check-in pop-ups" public/app.js public/manage.js public/styles.css public/checkin.html
cat .claude/markers/ui-options.json
```
The marker must name all four files. §38's 2026-07-17 update is the authority for `3-options-shown` on a
handoff: when Mike supplies the design as reference files, the files ARE the pick and no three-option round
runs. This is the same call the five 2026-08-24 handoffs recorded.

- [ ] **Step 4: Archive the handoff as text**

```bash
cd "$WT"
mkdir -p docs/design-handoffs/2026-08-29
cp "$SCRATCH/zip/design_handoff_checkin_player_popups/README.md" docs/design-handoffs/2026-08-29/README.md
sed -n '874,1306p' "$SCRATCH/zip/design_handoff_checkin_player_popups/design-files/_shared.css" > docs/design-handoffs/2026-08-29/round-2026-08-29-shared.css.txt
sed -n '954,1220p' "$SCRATCH/zip/design_handoff_checkin_player_popups/design-files/_shared.js"  > docs/design-handoffs/2026-08-29/round-2026-08-29-shared.js.txt
git add docs/design-handoffs/2026-08-29
git commit -m "docs(checkin): archive the 2026-08-29 handoff as text (README plus the six round comments)"
```
This mirrors the 2026-08-24 precedent, where five zips were archived under `docs/design-handoffs/` and each
round got its own 12-history file.

---

## Task 1: Migration `0068`, the prep that makes every later client change safe

**Model tier:** most capable. This is the file that decides whether a live roster splits a person into two
rows, and its reasoning is load-bearing.

**Files:**
- Create: `db/migrations/0068_normalize_player_groups.sql`
- Modify: nothing else. No client file, no `APP_VERSION` bump.

**Interfaces:**
- Consumes: the live `register_player(p_name text, p_group text default ''::text, p_checked_in boolean default false)` from `db/migrations/0020_group_null_normalize.sql`.
- Produces: the same signature with a group-blind dedup, and an empty `players."group"`. Every client task from Task 8 on depends on this having been APPLIED.

- [ ] **Step 1: Read the live definition and the index it must not fight**

```bash
cd "$WT"
sed -n '1,20p'  db/migrations/0020_group_null_normalize.sql   # the header and the trigger
sed -n '30,80p' db/migrations/0020_group_null_normalize.sql   # the live register_player body
sed -n '10,16p' db/migrations/0012_c22_dedup_index_fix.sql    # players_real_name_group_uidx
sed -n '1,12p'  db/migrations/0066_move_prose_plural.sql      # the header house style
```
The two facts that matter: the dedup lookup is
`where lower(btrim(pl.name)) = lower(v_name) and coalesce(pl."group",'') = coalesce(v_group,'')`, and the
unique index keys on `(lower(btrim(name)), coalesce("group",''))` over rows where
`left(name, 5) <> '__as_'`.

- [ ] **Step 2: Write the migration**

Create `db/migrations/0068_normalize_player_groups.sql` with exactly this content:

```sql
-- 0068_normalize_player_groups.sql: empty the group column and make register_player group-blind, one
-- deploy BEFORE the client stops sending p_group.
--
-- Mike (2026-08-29): "remove the groups from the app, we dont even use it." The removal is two files and
-- this is the first. It drops NOTHING: no column, no table, no signature. It exists so the window between
-- the client change and the drop cannot create a duplicate person on a live roster.
--
-- WHY. The live register_player (0020_group_null_normalize.sql:39-44) dedups on
--   lower(btrim(pl.name)) = lower(v_name) and coalesce(pl."group",'') = coalesce(v_group,'')
-- Both anon doors send 'Athletic Specimen' today (public/checkin.html:539, public/app.js:9786, sharing
-- CLUB_GROUP at public/supabase-config.js:12, whose comment at :8-11 records the exact bug it prevents).
-- Change only one side of that comparison, in either direction, and the dedup misses: the insert is
-- permitted because players_real_name_group_uidx keys on (lower(btrim(name)), coalesce("group",'')) (0012),
-- and the same person becomes two rows with split attendance. Emptying the column AND making the function
-- ignore the parameter changes both sides at once, so old and new clients behave identically.
--
-- STEP 1 is a GATE ON THE ROUND OPENING, not a check at the end: if two real rows already share a name,
-- the round STOPS here and Mike decides which row survives, before the tournament rather than after.
-- STEP 2 is the ONLY record of the group values that will exist once 0069 commits. It is pasted verbatim
-- into the round's history file. Nothing else preserves them.
--
-- ROLLBACK: re-apply the register_player body in 0020_group_null_normalize.sql verbatim (same signature,
--   so a plain create or replace), then restore the values from the STEP 2 capture:
--   update public.players set "group" = <captured> where id = <captured id>;
--   Nothing is dropped by this file, so the rollback is a function body plus a data restore.
--
-- APPLIED <yyyy-mm-dd> via the Supabase MCP (apply_migration), the check-in pop-ups round.

-- STEP 1. Run alone. READ the result. Zero rows required, or the round stops.
--   select lower(btrim(name)) as nm, count(*) as c
--     from public.players
--    where left(name, 5) <> '__as_'
--    group by 1 having count(*) > 1;

-- STEP 2. Run alone. Save the output VERBATIM into 12-history before running STEP 3.
--   select id, name, "group" from public.players where "group" is not null order by name;

-- STEP 3. Every real row moves into the one slot a group-blind call will use. 0020's normalize trigger
-- already turns '' into NULL on write, so NULL is the canonical empty and coalesce("group",'') = '' holds
-- for every row afterwards.
update public.players set "group" = null where "group" is not null;

-- STEP 4. register_player, SAME three-argument signature, group-blind. p_group is still accepted so every
-- deployed client keeps working unchanged; it is ignored for the dedup and never written. The return
-- columns are unchanged too (the "group" column now always reads NULL), so no client's response parsing
-- moves. Body is 0020's with the group terms removed from the lookup and the insert.
create or replace function public.register_player(p_name text, p_group text default ''::text, p_checked_in boolean default false)
returns table(id uuid, name text, checked_in boolean, "group" text)
language plpgsql security definer set search_path to 'public' as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_id   uuid;
  v_actor text; v_role text; v_grp text;
begin
  if v_name = '' then raise exception 'name required'; end if;
  if length(v_name) > 80 then raise exception 'name too long (max 80)'; end if;

  select pl.id into v_id from public.players pl
    where lower(btrim(pl.name)) = lower(v_name)
      and left(pl.name, 5) <> '__as_'
    limit 1;

  if v_id is null then
    begin
      insert into public.players(name, skill, checked_in)
        values (v_name, 0, coalesce(p_checked_in, false))
        returning players.id into v_id;
      select a.actor, a.role, a.grp into v_actor, v_role, v_grp from public._audit_actor() a;
      insert into public.action_log(actor, role, grp, action, entity_type, entity_id, detail)
        values (v_actor, v_role, v_grp, 'register', 'players', v_id::text, v_name);
    exception when unique_violation then
      select pl.id into v_id from public.players pl
        where lower(btrim(pl.name)) = lower(v_name)
          and left(pl.name, 5) <> '__as_'
        limit 1;
    end;
  end if;

  if coalesce(p_checked_in, false) then
    update public.players set checked_in = true where players.id = v_id;
    insert into public.check_ins(session_id, player_id)
      values (public.current_session_id(), v_id)
      on conflict (session_id, player_id) do nothing;
  end if;

  return query
    select pl.id, pl.name, pl.checked_in, pl."group" from public.players pl where pl.id = v_id;
end $$;
revoke all on function public.register_player(text, text, boolean) from public;
grant execute on function public.register_player(text, text, boolean) to anon, authenticated;
```

There is no `begin;` / `commit;` wrapper, and that is deliberate: only 4 of the 68 files present use one
(`0053` to `0056`), and `apply_migration` already wraps the statement batch.

- [ ] **Step 3: Commit the file (do NOT apply it)**

```bash
cd "$WT"
git add db/migrations/0068_normalize_player_groups.sql
git commit -m "db(checkin): 0068 empties players.group and makes register_player group-blind before the client changes"
```
No `APP_VERSION` bump: nothing the service worker caches changed.

- [ ] **Step 4: The controller applies it and records the read-backs (controller only)**

Through the Supabase MCP, project `mlzblkzflgylnjorgjcp`, in this order:

1. `execute_sql` STEP 1 alone. If it returns any row, STOP the round and hand back to Mike with the rows.
2. `execute_sql` STEP 2 alone. Paste the full result into `$SCRATCH/0068-group-capture.md`. This is the only surviving record of the values.
3. `apply_migration` with the file's STEP 3 and STEP 4 statements.
4. Read-backs, all four recorded in `$SCRATCH/0068-readbacks.md`:
   ```sql
   select count(*) from public.players where "group" is not null;                     -- 0
   select count(*) from public.players where left(name,5) <> '__as_';                 -- unchanged
   select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public' and p.proname='register_player';                        -- exactly register_player(text,text,boolean)
   ```
5. The twice-called smoke, which is the whole point of the file:
   ```sql
   select * from public.register_player('Zz Smoketest', 'Athletic Specimen', false);  -- old 3-key shape
   select * from public.register_player('Zz Smoketest', false);                       -- new 2-key shape
   select count(*) from public.players where lower(btrim(name)) = lower('Zz Smoketest');  -- must be 1
   delete from public.players where lower(btrim(name)) = lower('Zz Smoketest');
   ```
   Both calls must return the SAME id. If they do not, the round stops here.
6. Stamp the `APPLIED` line in the file and commit that one-line change.

---

## Task 2: The close button is pinned right in every pop-up, and the round gets its test file

**Model tier:** standard. Two small edits plus building the harness every later task extends.

**Files:**
- Create: `test/checkin-popups.test.js`
- Modify: `public/styles.css` (`.pe-in` at `:3367`, and a new block after `.pe-cancel` ends at `:3461`), `public/app.js` (`openPlayerEditPopup`'s `inHTML` at `:156-161`, `APP_VERSION` at `:34`), `test/manage-round.test.js` (the case at `:509-513`)

**Interfaces:**
- Produces: `test/checkin-popups.test.js` with `stripComments(src)`, `slice(src, fromDecl, toDecl)`, `loadApp()` and a `bridge` object. Tasks 3 to 10 add cases and bridge lines to this file and never create another.
- Produces: `openPlayerEditPopup` emitting the IN pill ONLY when the player is checked in. Task 5's `peInPillNode()` rebuilds exactly this markup.

- [ ] **Step 1: Read the three sites**

```bash
cd "$WT"
sed -n '156,162p' public/app.js          # the inHTML ternary and its comment
sed -n '860,870p' public/styles.css      # .popup-header
sed -n '3364,3372p' public/styles.css    # .pe-who, .pe-in, .pe-x
sed -n '3452,3462p' public/styles.css    # .pe-cancel, the end of the .pe-* block
sed -n '4207,4216p' public/styles.css    # #hm-rules-modal .popup-header and .hmv-rtitles
sed -n '505,514p' test/manage-round.test.js
```
`.popup-header` is `justify-content: space-between` with `gap: 8px`, and exactly two dialogs emit it:
`openPlayerEditPopup` (`public/app.js:164`) and `hmRulesModalHTML` (`public/app.js:4248`). Both are read
here because a shared class is where a handoff's own defect lands.

- [ ] **Step 2: Create the round's test file with its harness**

Create `test/checkin-popups.test.js` (CRLF, like every other test file):

```js
// Check-in pop-ups round (2026-08-29): the pencil, the card, the add path, the groups removal.
// Same vm-sandbox harness as test/manage-page.test.js, loading pure.js, then manage.js, then app.js, the
// order public/index.html uses. There is NO DOM in this suite (no jsdom, no happy-dom, no
// @vitest-environment pragma anywhere), so every case here is one of three shapes: a builder string, a
// delegate tap through withDelegate, or a source guard. openPlayerEditPopup cannot execute here at all,
// because modal.querySelector('.pe-card') is null and it returns at app.js:137-138, so its markup is
// pinned by a slice of its source. Anything needing a live element is a drive fact in the spec's 7.4.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const appSrc = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const mgSrc = readFileSync(new URL('../public/manage.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
const cssLF = css.replace(/\r/g, '');

// Blank comments while preserving length and newlines, so a rewritten comment can neither trip nor fool a
// scan. Copied from test/supabase-writes.test.js:20-27.
function stripComments(src) {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  out = out.replace(/(?<!:)\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
  return out;
}

// The source between two top-level declarations. The shape test/register-auto-attach.test.js:140 uses.
function slice(src, fromDecl, toDecl) {
  const a = src.indexOf(fromDecl);
  const b = src.indexOf(toDecl, a + 1);
  if (a < 0 || b < 0) throw new Error('slice bounds not found: ' + fromDecl + ' .. ' + toDecl);
  return src.slice(a, b);
}

function loadApp() {
  const pureSrc = readFileSync(new URL('../public/pure.js', import.meta.url), 'utf8');
  const noop = () => {};
  const emptyList = { forEach: noop, length: 0, item: () => null };
  const makeEl = () => ({
    style: {}, dataset: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    setAttribute: noop, getAttribute: () => null, removeAttribute: noop,
    appendChild: noop, removeChild: noop, remove: noop,
    addEventListener: noop, removeEventListener: noop,
    querySelector: () => null, querySelectorAll: () => emptyList,
    closest: () => null, contains: () => false,
    textContent: '', innerHTML: '', scrollTop: 0, offsetHeight: 0,
  });
  const documentStub = {
    readyState: 'loading', // keeps the bottom bootstrap from calling init() at load
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => emptyList,
    createElement: () => makeEl(), createDocumentFragment: () => makeEl(),
    addEventListener: noop, removeEventListener: noop,
    head: makeEl(), body: makeEl(), documentElement: makeEl(),
  };
  const supaStub = {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: noop } } }),
      getSession: async () => ({ data: { session: null } }),
      getUser: async () => ({ data: { user: null } }),
    },
    from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }) }),
    channel: () => ({ on: () => ({ subscribe: noop }) }),
    removeChannel: noop, rpc: async () => ({ data: null, error: null }),
  };
  const windowStub = {
    supabase: { createClient: () => supaStub },
    addEventListener: noop, removeEventListener: noop,
    matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop, removeEventListener: noop }),
    location: { href: 'http://localhost/', search: '', hash: '', pathname: '/', reload: noop },
    navigator: { onLine: true, userAgent: 'node', serviceWorker: { register: async () => ({}) } },
    requestAnimationFrame: noop, cancelAnimationFrame: noop,
    setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop, scrollTo: noop,
  };
  windowStub.window = windowStub;
  const localStorageStub = { getItem: () => null, setItem: noop, removeItem: noop, clear: noop, key: () => null, length: 0 };
  const sandbox = {
    window: windowStub, document: documentStub, localStorage: localStorageStub,
    navigator: windowStub.navigator, location: windowStub.location,
    requestAnimationFrame: noop, cancelAnimationFrame: noop,
    setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop,
    console, SUPABASE_URL: 'http://localhost', SUPABASE_KEY: 'anon',
  };
  sandbox.globalThis = sandbox; sandbox.self = sandbox;
  const epilogue = `
    ;globalThis.__bridge = {
      getState: () => state,
      doc: document,
      // Task 2 seeds nothing yet; later tasks add their own hooks here.
    };`;
  const context = vm.createContext(sandbox);
  vm.runInContext(pureSrc, context, { filename: 'pure.js' });
  vm.runInContext(mgSrc, context, { filename: 'manage.js' });   // manage.js loads before app.js, as index.html does
  vm.runInContext(appSrc + epilogue, context, { filename: 'app.js' });
  return sandbox.__bridge;
}

const bridge = loadApp();

describe('Task 2: the close button is pinned right in every pop-up', () => {
  it('the title block takes the slack and the close button carries the auto margin', () => {
    expect(cssLF).toContain('.popup-header .pe-who,\n.popup-header .hmv-rtitles { flex: 1 1 auto; min-width: 0; }');
    expect(cssLF).toContain('.popup-header .pe-in { margin-left: 0; }');
    expect(cssLF).toContain('.popup-header .pe-x,\n.popup-header .hmv-rx { margin-left: auto; }');
    expect(cssLF).toContain('.popup-header .pe-in + .pe-x { margin-left: 10px; }');
  });

  it('the base .pe-in rule no longer carries the auto margin it used to push the close button with', () => {
    expect(cssLF).toContain('.pe-in { flex: none; }');
    expect(cssLF).not.toContain('.pe-in { flex: none; margin-left: auto; }');
  });

  it('the empty .pe-in spacer is gone from the card, so an out player has no phantom child', () => {
    expect(appSrc).not.toContain('<span class="pe-in" aria-hidden="true"></span>');
    expect(appSrc).toContain('const inHTML = isIn ? `<span class="mgp-in pe-in">IN</span>` : \'\';');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd "$WT/test" && npx vitest run checkin-popups.test.js
```
Expected: all three cases FAIL. The first two on the missing CSS, the third on the spacer literal still
being present at `public/app.js:161`.

- [ ] **Step 4: Implement the CSS**

In `public/styles.css`, change `:3367` from

```css
.pe-in { flex: none; margin-left: auto; }
```
to
```css
.pe-in { flex: none; }
```
and delete the two comment lines above it (`/* check-in state reuses the players-list IN pill, sat left of
the close button */`) in favour of the block below, so the reason lives in one place.

Then, immediately after `.pe-cancel`'s closing brace (the end of the `.pe-*` block at `:3461`), add:

```css
/* Round 2026-08-29 (vi) - "why does this move after checking in, have it always be on the far right for
   all pop ups". The close button used to be pushed right only by the IN pill's auto margin, so on a player
   who was still out it sat tucked against the name and jumped to the corner the moment they checked in.
   The TITLE takes the slack instead. Two dialogs emit .popup-header and BOTH were read against these
   rules: the player card (app.js openPlayerEditPopup) and the Home rules sheet (app.js hmRulesModalHTML).
   #hm-rules-modal .hmv-rtitles (styles.css:4214) sets only display, gap and min-width, so nothing here
   fights it, and with justify-content: space-between and two children the auto margin is inert there. */
.popup-header .pe-who,
.popup-header .hmv-rtitles { flex: 1 1 auto; min-width: 0; }
.popup-header .pe-in { margin-left: 0; }
.popup-header .pe-x,
.popup-header .hmv-rx { margin-left: auto; }
.popup-header .pe-in + .pe-x { margin-left: 10px; }
```

- [ ] **Step 5: Implement the card change**

In `public/app.js`, replace lines `156-161`:

```js
  // The players-list green IN pill for check-in state. When the player is NOT checked in the pill is replaced
  // by an empty .pe-in spacer - .pe-in carries the margin-left:auto that pushes the close button to the edge.
  const isIn = new Set(state.checkedIn || []).has(playerKey);
  const inHTML = isIn
    ? `<span class="mgp-in pe-in">IN</span>`
    : `<span class="pe-in" aria-hidden="true"></span>`;
```
with:
```js
  // The players-list green IN pill, emitted ONLY when it is true. The empty spacer that used to stand in
  // for it is gone: the title block now takes the slack and .pe-x carries the auto margin (styles.css,
  // round 2026-08-29 vi), so the close button is pinned right whether or not the pill is there.
  const isIn = new Set(state.checkedIn || []).has(playerKey);
  const inHTML = isIn ? `<span class="mgp-in pe-in">IN</span>` : '';
```

Bump `APP_VERSION` at `:34` to `'2026.08.29.1'`.

- [ ] **Step 6: Extend the existing CSS case in `test/manage-round.test.js`**

At `:509-513`, inside `it('the 08-05b field style and the 08-23 button restyle are in styles.css once', ...)`,
add two lines after the `.pe-save` assertion:

```js
    // Round 2026-08-29 (vi): the pin lives on the header, not on the pill, so the close button does not
    // move when a player checks in. The 08-23 button block above is untouched by that round.
    expect(css).toMatch(/\.popup-header \.pe-x,\s*\.popup-header \.hmv-rx \{ margin-left: auto; \}/);
    expect(count(css, '#player-edit-modal .pe-cancel')).toBeGreaterThanOrEqual(1);
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
cd "$WT" && node --check public/app.js && node --check public/manage.js \
  && cat public/manage.js public/app.js > "$SCRATCH/concat.js" && node --check "$SCRATCH/concat.js"
cd "$WT/test" && npx vitest run 2>&1 | tail -4
```
Expected: 41 files (the new one), 1255 tests (1252 + 3), all green.

- [ ] **Step 8: Commit**

```bash
cd "$WT"
git add public/app.js public/styles.css test/checkin-popups.test.js test/manage-round.test.js
git commit -m "fix(popups): the close button is pinned right in every card header, pill or no pill - v2026.08.29.1"
```

---

## Task 3: The card header and its section heads

**Model tier:** most capable. This edits the shared card that two surfaces open, and its eyebrow has to
know which surface it is on.

**Files:**
- Modify: `public/app.js` (`ensurePlayerEditModal` at `:116-133`, `openPlayerEditPopup` at `:135-250`, three new module bindings above `closePlayerEditPopup` at `:102`, `APP_VERSION`), `public/styles.css` (the `.pe-*` block near `:3344-3365`), `test/checkin-popups.test.js`

**Interfaces:**
- Produces: module bindings `peMode` (`'edit'` or `'new'`), `peOrigin` (`'checkin'` or `'players'`) and `peReturnKey` (the identity key of the row that opened the card). Task 5 reads `peMode`, Task 7 reads `peOrigin` and `peReturnKey`, Task 8 sets `peMode = 'new'`.
- Produces: `.pe-card` carrying `tabindex="-1"` so focus can land on the dialog and never on a field.

- [ ] **Step 1: Read the card and the section-head pattern**

```bash
cd "$WT"
sed -n '100,135p' public/app.js         # closePlayerEditPopup and ensurePlayerEditModal
sed -n '135,205p' public/app.js         # openPlayerEditPopup, the header and the body
sed -n '2177,2179p' public/styles.css   # .pl-sect: an ink label plus a hairline rule
sed -n '3344,3366p' public/styles.css   # .pe-head, .pe-av, .pe-who
```
`.pl-sect` is `color: var(--ink)` with a 1px rule, not accent; README:480 calls it accent and neither
production nor the handoff's `_shared.css:1205-1206` sets a colour, so the heads render ink on both
surfaces. Skill stays a `.popup-edit-label` inside `.pe-f`, which is what `mg-checkin.html:64` emits,
even though README:217 calls it a section head.

- [ ] **Step 2: Add the bridge lines this task needs**

In `test/checkin-popups.test.js`, inside the epilogue's `__bridge` object, replace the placeholder comment
line with:

```js
      setView: (v) => { manageView = v; },
      mode: () => ({ mode: peMode, origin: peOrigin, key: peReturnKey }),
```

- [ ] **Step 3: Write the failing tests**

Append to `test/checkin-popups.test.js`:

```js
describe('Task 3: the card header and its section heads', () => {
  // openPlayerEditPopup cannot run without a DOM (app.js:137-138), so its markup is pinned by its source.
  const card = () => slice(appSrc, 'function openPlayerEditPopup(', 'function closeInlineEditRow(');

  it('the header carries the watermark, the eyebrow and the tile, and the pill only when it is true', () => {
    const s = card();
    expect(s).toContain('class="pe-mark" aria-hidden="true"');
    expect(s).toContain('class="pe-eyebrow"');
    expect(s).toContain('const inHTML = isIn ? `<span class="mgp-in pe-in">IN</span>` : \'\';');
  });

  it('the eyebrow follows the surface, not only the mode', () => {
    const s = card();
    expect(s).toContain("'Roster · new player'");
    expect(s).toContain("'Roster · check-in'");
    expect(s).toContain("'Roster · players'");   // this spec's own string: the handoff only drew check-in
  });

  it('PLAYER comes before STATUS, and Skill stays a field label', () => {
    const s = card();
    const player = s.indexOf('<div class="pl-sect pe-sect">Player</div>');
    const status = s.indexOf('<div class="pl-sect pe-sect">Status</div>');
    expect(player).toBeGreaterThan(-1);
    expect(status).toBeGreaterThan(player);
    expect(s).toContain('<label class="popup-edit-label" for="pe-skill">Skill</label>');
  });

  it('the card takes focus on the dialog, never on a field (Bug A, 2026-06-21, stands)', () => {
    const s = card();
    expect(s).not.toContain('.select()');
    expect(s).not.toMatch(/getElementById\('pe-(first|last|skill)'\)\.focus\(\)/);
    expect(appSrc).toContain('class="popup-card card pe-card" role="dialog" aria-modal="true" tabindex="-1"');
  });

  it('the header treatment is in styles.css once, on tokens', () => {
    expect(cssLF).toContain('background: var(--accent-soft);');
    expect(cssLF).toContain('.pe-mark {');
    expect(cssLF).toContain('.pe-eyebrow {');
    expect(cssLF).toContain('.pe-sect:not(:first-child) { margin-top: 20px; }');
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

```bash
cd "$WT/test" && npx vitest run checkin-popups.test.js
```
Expected: all five FAIL.

- [ ] **Step 5: Implement the module bindings and the modal container**

In `public/app.js`, directly above `function closePlayerEditPopup()` (`:102`), add:

```js
// Round 2026-08-29: the card is ONE element serving Manage to Check-in and Manage to Players. Three
// bindings carry what the markup and the save need to know about the opening: which state the card is in,
// which surface opened it (the eyebrow and the repaint both follow it), and which row to hand focus back
// to on close. They are read across the file boundary by nothing in manage.js, so the names stay here.
let peMode = 'edit';       // 'edit' | 'new'
let peOrigin = 'checkin';  // 'checkin' | 'players'
let peReturnKey = '';      // identity key of the row whose pencil opened the card
```

In `ensurePlayerEditModal` (`:126`), the card element gains a focus target:

```js
  el.innerHTML = '<div class="popup-card card pe-card" role="dialog" aria-modal="true" tabindex="-1" aria-labelledby="player-edit-modal-title"></div>';
```

- [ ] **Step 6: Implement the header markup**

In `openPlayerEditPopup`, directly after the `inHTML` block from Task 2, add the three derived strings:

```js
  // The eyebrow follows BOTH the state and the surface. Without peOrigin the card would read "check-in"
  // while sitting over the Players directory, which is not where the organiser is.
  const eyebrow = peMode === 'new'
    ? 'Roster · new player'
    : (peOrigin === 'checkin' ? 'Roster · check-in' : 'Roster · players');
  const title  = peMode === 'new' ? 'New player' : (whole || 'Edit player');
  const avatar = peMode === 'new' ? '+' : initial;
```

Then replace the header block at `:164-169` with:

```js
    <div class="popup-header pe-head">
      <span class="pe-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5 3.5 6v6.2c0 4.6 3.5 7.9 8.5 9.3 5-1.4 8.5-4.7 8.5-9.3V6Z"/><path d="M9 12.4l2.3 2.3L15.6 10"/></svg></span>
      <span class="pe-av${peMode === 'new' ? ' is-new' : ''}" aria-hidden="true">${escapeHTML(avatar)}</span>
      <span class="pe-who"><span class="pe-eyebrow">${eyebrow}</span><h3 id="player-edit-modal-title">${escapeHTML(title)}</h3></span>
      ${inHTML}
      <button type="button" class="pe-x secondary" data-role="close-popup" data-target="player-edit-modal" aria-label="Close">&times;</button>
    </div>
```

Add the two section heads in the body. Replace the opening of the body block at `:170-172`:

```js
    <div class="popup-body pe-body" id="player-edit-modal-body">
    <div class="edit-row show popup-edit-row" data-player-key="${keyAttr}">
      <div class="pl-sect pe-sect">Player</div>
      <div class="pe-f pe-2col">
```

and, immediately after the Skill `.pe-f` block closes (currently `:187`, the `</div>` after `.pe-skillrow`),
insert:

```js
      <div class="pl-sect pe-sect">Status</div>
```

Set all three bindings at the top of `openPlayerEditPopup`, right after the `if (!modal || !card) return;`
guard at `:138`:

```js
  peMode = 'edit';   // Task 8 replaces this line with the mode parameter when the add card arrives
  peOrigin = (typeof manageView === 'string' && manageView === 'checkin') ? 'checkin' : 'players';
  peReturnKey = String(playerKey || '');
```
and, at the end of the function where the modal is revealed (`:205-207`), after
`document.body.style.overflow = 'hidden';`, add:

```js
  // Bug A fix (2026-06-21) STANDS: no field is focused and nothing is selected, so the phone keyboard
  // never pops onto the wrong box. Focus goes to the dialog itself, which is what makes Escape and a
  // focus trap conventional. Record: 12-history/task-#10-edit-autofocus-name.md.
  try { card.focus(); } catch (_) {}
```
Delete the three-line Bug A comment at `:209-211`, whose text now lives on the line above.

Bump `APP_VERSION` to `'2026.08.29.2'`.

- [ ] **Step 7: Implement the CSS**

In `public/styles.css`, replace `.pe-head` (`:3344-3350`) and `.pe-av` (`:3351-3363`) and `.pe-who`
(`:3364`) with:

```css
/* Round 2026-08-29 (ii, iii) - "it very bland, fix that" and "the pop up is still bland". A card that
   edits a PLAYER on game day reads as the app's own register, not a settings form: an accent-tint strip
   with the mark ghosted behind it at 9%, the initial set as a white tile, and a display-font eyebrow over
   the name. There is no black or near-black surface anywhere in this app and none is introduced. */
.pe-head {
  position: relative;
  overflow: hidden;
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 14px 15px 16px;
  background: var(--accent-soft);
  border-bottom: 1px solid var(--accent-bd);
}
.pe-mark {
  position: absolute;
  right: -34px;
  bottom: -46px;
  width: 128px;
  height: 128px;
  color: var(--accent);
  opacity: .09;
  pointer-events: none;
}
.pe-mark svg { width: 100%; height: 100%; }
/* the avatar radius is 13px from the handoff's round-iii code (_shared.css:1176). README:173 and 497 still
   say 14px, which was round ii (_shared.css:954); the later code wins, the same way it does on the stepper. */
.pe-av {
  position: relative;
  flex: none;
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  border-radius: 13px;
  background: #fff;
  border: 1px solid var(--accent-bd);
  color: var(--accent);
  font: 800 19px/1 var(--font-display);
  letter-spacing: .02em;
}
.pe-av.is-new { background: transparent; border-style: dashed; font-weight: 700; font-size: 22px; }
.pe-who { position: relative; display: grid; gap: 3px; min-width: 0; }
.pe-eyebrow {
  font: 700 10px var(--font-display);
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--accent);
}
/* section heads inside the card, one weight down from a page's (.pl-sect at :2177 is ink plus a rule) */
.pe-sect { margin: 0 0 11px; font-size: 11px; }
.pe-sect:not(:first-child) { margin-top: 20px; }
```

Replace `.pe-who h3` (`:3365`) with:

```css
.pe-who h3 { margin: 0; font: 700 21px/1.15 var(--font-display); letter-spacing: .01em; color: var(--ink); }
```

Replace `.pe-in { flex: none; }` (edited in Task 2) with the pill skin, keeping the Task 2 pin rules
untouched:

```css
.pe-in {
  position: relative;
  flex: none;
  padding: 4px 9px;
  border-radius: 999px;
  border: 1px solid oklch(0.86 0.06 150);
  background: oklch(0.95 0.04 150);
  color: oklch(0.44 0.11 150);
  font: 700 10px/1 var(--font-display);
  letter-spacing: .12em;
  text-transform: uppercase;
}
```

Add, after `.pe-x:hover` (`:3385`):

```css
.pe-x { position: relative; }   /* above the watermark */
.pe-x:hover { color: var(--accent); border-color: var(--accent); background: #fff; }
```
and delete the old `.pe-x:hover` line at `:3385` so the rule is stated once.

**Do not touch `public/styles.css:6043-6076`.** That is the 2026-08-23 button block
(`#player-edit-modal .pe-save`, `.pe-save:active`, `.pe-cancel`, `.pe-cancel:hover`), pinned by
`test/manage-round.test.js:509-513`, and nothing in this round changes it.

- [ ] **Step 8: Re-run the emitter grep, then the tests**

```bash
cd "$WT"
grep -n "pe-head\|pe-av\|pe-who\|pe-card\|pe-save\|pe-actions\|pe-body\|pe-cell\|pe-2col\|pe-cancel\|pe-skillrow\|pe-mark\|pe-eyebrow" public/app.js public/manage.js | grep -v "^public/app.js:1[0-9][0-9]:" | head
```
Expected: every hit is inside `openPlayerEditPopup` or `ensurePlayerEditModal`. If a second emitter
appears, STOP and report: the bare `.pe-*` rules would move a dialog this round never looked at.

```bash
node --check public/app.js && node --check public/manage.js \
  && cat public/manage.js public/app.js > "$SCRATCH/concat.js" && node --check "$SCRATCH/concat.js"
cd "$WT/test" && npx vitest run 2>&1 | tail -4
```
Expected: 41 files, 1260 tests (1255 + 5), all green.

- [ ] **Step 9: Commit**

```bash
cd "$WT"
git add public/app.js public/styles.css test/checkin-popups.test.js
git commit -m "feat(popups): the player card gets the accent header, the ghosted mark and its section heads - v2026.08.29.2"
```

---

## Task 4: The rating is a stepper, and unrated is skill 0

**Model tier:** standard. Bounded maths plus one abort that has to go.

**Files:**
- Modify: `public/app.js` (`openPlayerEditPopup`'s skill field, a new `peSkillStep` beside it, a `[data-pe-skill]` branch in `ensureSaveDelegationBound`, the save's parse and abort at `:435-448`, `APP_VERSION`), `public/styles.css` (`.pe-skillrow` and `.pe-skillin` at `:3426-3427`), `test/checkin-popups.test.js`

**Interfaces:**
- Consumes: `peMode` from Task 3 (the add card opens with an empty field).
- Produces: `peSkillStep(rawValue, delta)` returning a clamped one-decimal string. Nothing else calls it; the delegate and the tests do.
- Produces: a save that writes `skill = 0` for a blank rating instead of aborting in silence. Task 8's add path reads the same parsed value.

- [ ] **Step 1: Read the field, the save and the grammar it has to match**

```bash
cd "$WT"
sed -n '182,188p' public/app.js         # the bare number field
sed -n '427,450p' public/app.js         # the save's reads and the abort
sed -n '3426,3429p' public/styles.css   # .pe-skillrow, .pe-skillin, .pe-hint
sed -n '956,959p' public/manage.js      # mgpSkillText: n > 0 renders one decimal, else the en dash
```

- [ ] **Step 2: Add the bridge line this task needs**

In `test/checkin-popups.test.js`'s epilogue `__bridge`, add:

```js
      step: (v, d) => peSkillStep(v, d),
```

- [ ] **Step 3: Write the failing tests**

Append to `test/checkin-popups.test.js`:

```js
describe('Task 4: the stepper, and unrated is skill 0', () => {
  // README:404 states the empty-field behaviour transposed; the handoff's own code (_shared.js:1197-1199)
  // is authoritative: the first tap UP from unrated is the smallest real rating, the first tap DOWN is the
  // explicit zero Mike's 2026-08-29 call made meaningful.
  it('steps in halves, clamps 0 to 10, and always returns one decimal', () => {
    expect(bridge.step('', 0.5)).toBe('0.5');
    expect(bridge.step('', -0.5)).toBe('0.0');
    expect(bridge.step('10', 0.5)).toBe('10.0');
    expect(bridge.step('0', -0.5)).toBe('0.0');
    expect(bridge.step('6', 0.5)).toBe('6.5');
    for (const v of ['', '0', '3.5', '10']) {
      for (const d of [0.5, -0.5]) expect(bridge.step(v, d)).toMatch(/^\d+\.\d$/);
    }
  });

  it('the card prefills blank for an unrated player and shows the en dash placeholder', () => {
    const s = slice(appSrc, 'function openPlayerEditPopup(', 'function closeInlineEditRow(');
    expect(s).toContain("? Number(player.skill).toFixed(1) : ''");
    expect(s).toContain('placeholder="&#8211;"');
    expect(s).toContain('data-pe-skill="-0.5"');
    expect(s).toContain('data-pe-skill="0.5"');
    expect(s).toContain('aria-label="Lower skill"');
    expect(s).toContain('aria-label="Raise skill"');
  });

  it('a blank rating saves as 0 instead of aborting in silence', () => {
    const save = slice(appSrc, 'function ensureSaveDelegationBound()', 'function ensureHeaderTapToTop()');
    expect(save).not.toContain('if (!name || Number.isNaN(skill)) return;');
    expect(save).toContain('if (Number.isNaN(skill)) skill = 0;');
    expect(save).toContain('if (!name) { if (nameInput) nameInput.focus(); return; }');
  });

  it('the stepper frame and its buttons are in styles.css, with the native spinners suppressed', () => {
    expect(cssLF).toContain('.pe-stepper {');
    expect(cssLF).toContain('.pe-sb {');
    expect(cssLF).toContain('#player-edit-modal .pe-skillin::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }');
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

```bash
cd "$WT/test" && npx vitest run checkin-popups.test.js
```
Expected: all four FAIL, the first with `peSkillStep is not defined`.

- [ ] **Step 5: Implement the helper and the field**

In `public/app.js`, directly after `closePlayerEditPopup`'s closing brace (`:110`), add:

```js
// The rating stepper's maths. Clamp 0 to 10 in 0.5 steps, one decimal. An empty field is unrated: the
// first tap UP is the smallest real rating (0.5) and the first tap DOWN is the explicit 0, because Mike's
// 2026-08-29 call made unrated and 0 the same thing. This follows the handoff's code (_shared.js:1197-1199);
// its README:404 states the two directions transposed.
function peSkillStep(rawValue, delta) {
  let now = parseFloat(rawValue);
  if (Number.isNaN(now)) now = delta < 0 ? 0.5 : 0;
  return Math.min(10, Math.max(0, now + delta)).toFixed(1);
}
```

In `openPlayerEditPopup`, add the prefill beside the other derived strings from Task 3:

```js
  // Unrated opens BLANK so the en dash placeholder shows, matching mgpSkillText's grammar (manage.js:956):
  // a positive rating renders one decimal, everything else renders the dash.
  const skillValue = (Number.isFinite(Number(player.skill)) && Number(player.skill) > 0)
    ? Number(player.skill).toFixed(1) : '';
```

Replace the skill field block (`:182-187`) with:

```js
      <div class="pe-f">
        <label class="popup-edit-label" for="pe-skill">Skill</label>
        <div class="pe-skillrow">
          <div class="pe-stepper">
            <button type="button" class="pe-sb" data-pe-skill="-0.5" aria-label="Lower skill">&#8722;</button>
            <input id="pe-skill" type="number" class="edit-skill popup-edit-input pe-skillin" placeholder="&#8211;" step="0.5" min="0" max="10" value="${escapeHTMLText(skillValue)}" />
            <button type="button" class="pe-sb" data-pe-skill="0.5" aria-label="Raise skill">+</button>
          </div>
        </div>
      </div>
```

- [ ] **Step 6: Implement the stepper delegate and the save fix**

In `ensureSaveDelegationBound`'s click handler (`public/app.js:399`), directly above the
`const btn = e.target.closest('.btn-save-edit');` line at `:415`, add:

```js
    // The stepper. It edits one input's value and nothing else, so it never reaches state, an RPC or a
    // save. Delegated like the rest of the card, so it survives every rebuild of the modal body.
    const stepBtn = e.target.closest('[data-pe-skill]');
    if (stepBtn) {
      e.preventDefault();
      e.stopPropagation();
      const fld = document.getElementById('pe-skill');
      if (fld) fld.value = peSkillStep(fld.value, parseFloat(stepBtn.getAttribute('data-pe-skill')));
      return;
    }
```

Replace `:438` and `:446` (the parse and the abort). The block that currently reads

```js
    let   skill = parseFloat(skillInput?.value);
```
...
```js
    if (!name || Number.isNaN(skill)) return;
    // Clamp and keep one decimal place
    skill = Math.max(0, Math.min(10, Math.round(skill * 10) / 10));
```
becomes:
```js
    let   skill = parseFloat(skillInput?.value);
```
...
```js
    // 2026-08-29 (Mike): unrated IS skill 0, saved normally. This used to be
    // `if (!name || Number.isNaN(skill)) return;`. A blank rating aborted the save in SILENCE, so an
    // organiser fixing a typo on an unrated player watched the card close and nothing change. Name empty
    // is the only rule the card enforces, and it says so by focusing the field it wants.
    if (!name) { if (nameInput) nameInput.focus(); return; }
    if (Number.isNaN(skill)) skill = 0;
    // Clamp and keep one decimal place
    skill = Math.max(0, Math.min(10, Math.round(skill * 10) / 10));
```

Bump `APP_VERSION` to `'2026.08.29.3'`.

- [ ] **Step 7: Implement the CSS**

In `public/styles.css`, replace `.pe-skillrow` and `.pe-skillin` (`:3426-3427`) with:

```css
/* Round 2026-08-29 (ii): the rating is a stepper, like every other number the organizer sets. The value
   sits in the frame with no focus ring of its own, because the frame IS the visual container. */
.pe-skillrow { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.pe-stepper {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: 13px;
  background: oklch(0.985 0.003 75);
}
.pe-sb {
  flex: none;
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #fff;
  color: var(--ink);
  font-size: 17px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  transition: color .15s ease, background-color .15s ease, border-color .15s ease;
}
.pe-sb:hover { color: var(--accent); border-color: var(--accent-bd); background: var(--accent-soft); }
#player-edit-modal .pe-skillin {
  width: 74px;
  height: 38px;
  text-align: center;
  font: 700 17px var(--font-display);
  font-variant-numeric: tabular-nums;
  border-color: transparent;
  background: transparent;
  -moz-appearance: textfield;
}
#player-edit-modal .pe-skillin::-webkit-outer-spin-button,
#player-edit-modal .pe-skillin::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
#player-edit-modal .pe-skillin:focus { box-shadow: none; border-color: transparent; }
```
`.pe-hint` at `:3428` has no emitter and is left for the Manage CSS round. The handoff's `.pe-clear` chip
is deliberately not ported: with unrated equal to 0, one tap down from 0.5 reaches it, and a second control
for the same value is noise.

- [ ] **Step 8: Run the tests to verify they pass**

```bash
cd "$WT" && node --check public/app.js && node --check public/manage.js \
  && cat public/manage.js public/app.js > "$SCRATCH/concat.js" && node --check "$SCRATCH/concat.js"
cd "$WT/test" && npx vitest run 2>&1 | tail -4
```
Expected: 41 files, 1264 tests (1260 + 4), all green.

- [ ] **Step 9: Commit**

```bash
cd "$WT"
git add public/app.js public/styles.css test/checkin-popups.test.js
git commit -m "feat(popups): the rating is a stepper and a blank one saves as unrated instead of aborting - v2026.08.29.3"
```

---

## Task 5: Check in and Check out inside the card, as a draft

**Model tier:** most capable. The one control in this round that must be provably inert until Save.

**Files:**
- Modify: `public/app.js` (`openPlayerEditPopup`'s Status block, a new `peInPillNode` beside `peSkillStep`, a `[data-pe-in]` branch in `ensureSaveDelegationBound`, `APP_VERSION`), `public/styles.css` (a new `.pe-inbtn` block after the stepper rules), `test/checkin-popups.test.js`

**Interfaces:**
- Consumes: `peMode` (Task 3), the `Status` section head (Task 3).
- Produces: a `[data-pe-in]` button carrying `aria-pressed`, and `peInPillNode()` returning the exact node Task 2's `inHTML` emits. Task 7's save reads `aria-pressed`; Task 8's add path reads it too.

- [ ] **Step 1: Read the writer this button must NOT call, and the pill it rebuilds**

```bash
cd "$WT"
sed -n '1171,1205p' public/manage.js    # mgckToggleByKey: the only maintained attendance writer
sed -n '156,162p' public/app.js         # the inHTML Task 2 left
sed -n '399,420p' public/app.js         # the delegated click handler this branch joins
```
`mgckToggleByKey` writes optimistically, fires `check_in` or `check_out`, enqueues an outbox row on
failure, sets `mgckLast`, calls `saveLocal()` and repaints. None of that may happen from a toggle: the card
is a draft until Save (README:321).

- [ ] **Step 2: Write the failing tests**

Append to `test/checkin-popups.test.js`:

```js
describe('Task 5: the status button is a draft, not a write', () => {
  // There is no DOM here, so "nothing is written" is proved by READING the branch: a toggle that touches
  // no state, no RPC and no saveLocal cannot write. The live behaviour is a drive fact (spec 7.4).
  const branch = () => {
    const s = slice(appSrc, 'function ensureSaveDelegationBound()', 'function ensureHeaderTapToTop()');
    const a = s.indexOf("const inBtn = e.target.closest('[data-pe-in]');");
    const b = s.indexOf("const btn = e.target.closest('.btn-save-edit');", a + 1);
    if (a < 0 || b < 0) throw new Error('the [data-pe-in] branch is not above the save branch');
    return s.slice(a, b);
  };

  it('the toggle writes nothing: no state, no RPC, no saveLocal, no attendance writer', () => {
    const b = branch();
    expect(b).not.toContain('state.');
    expect(b).not.toContain('mgckToggleByKey');
    expect(b).not.toContain('supabaseClient');
    expect(b).not.toContain('saveLocal');
    expect(b).toContain("inBtn.setAttribute('aria-pressed'");
    expect(b).toContain('peInPillNode()');
  });

  it('the card emits the button with both icons, the label and the pressed state', () => {
    const s = slice(appSrc, 'function openPlayerEditPopup(', 'function closeInlineEditRow(');
    expect(s).toContain('class="pe-inbtn${isIn ? \' is-in\' : \'\'}" data-pe-in aria-pressed="${isIn ? \'true\' : \'false\'}"');
    expect(s).toContain('class="pe-ico pe-ico-in"');
    expect(s).toContain('class="pe-ico pe-ico-out"');
    expect(s).toContain('<span data-pe-inlabel>${isIn ? \'Check out\' : \'Check in\'}</span>');
  });

  it('peInPillNode rebuilds exactly the markup the opener emits, so the two cannot drift', () => {
    const fn = slice(appSrc, 'function peInPillNode()', 'function openPlayerEditPopup(');
    expect(fn).toContain("s.className = 'mgp-in pe-in';");
    expect(fn).toContain("s.textContent = 'IN';");
  });

  it('the button is green while the player is out and quiet once they are in', () => {
    expect(cssLF).toContain('.pe-inbtn {');
    expect(cssLF).toContain('.pe-inbtn.is-in { border-color: var(--border); background: #fff; color: var(--ink); }');
    expect(cssLF).toContain('.pe-inbtn .pe-ico-out,\n.pe-inbtn.is-in .pe-ico-in { display: none; }');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd "$WT/test" && npx vitest run checkin-popups.test.js
```
Expected: all four FAIL, the first on the missing branch bounds.

- [ ] **Step 4: Implement the pill builder**

In `public/app.js`, directly after `peSkillStep`'s closing brace, add:

```js
// The IN pill the opener emits only when the player is checked in, rebuilt for the live toggle. Same
// markup as openPlayerEditPopup's `inHTML`, stated beside the branch that uses it so the two cannot drift.
function peInPillNode() {
  const s = document.createElement('span');
  s.className = 'mgp-in pe-in';
  s.textContent = 'IN';
  return s;
}
```

- [ ] **Step 5: Implement the button**

In `openPlayerEditPopup`, replace the `Status` section head line Task 3 added with the head plus the
button:

```js
      <div class="pl-sect pe-sect">Status</div>
      <button type="button" class="pe-inbtn${isIn ? ' is-in' : ''}" data-pe-in aria-pressed="${isIn ? 'true' : 'false'}">
        <svg class="pe-ico pe-ico-in" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 12.5l2.5 2.5L15.5 9"/><circle cx="12" cy="12" r="9"/></svg>
        <svg class="pe-ico pe-ico-out" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15.5 4.5H18a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-2.5"/><path d="M9.5 8.5 6 12l3.5 3.5"/><path d="M6 12h9"/></svg>
        <span data-pe-inlabel>${isIn ? 'Check out' : 'Check in'}</span>
      </button>
```

- [ ] **Step 6: Implement the toggle branch**

In `ensureSaveDelegationBound`'s click handler, directly ABOVE the `[data-pe-skill]` branch Task 4 added
(and therefore above the `.btn-save-edit` branch), add:

```js
    // The check-in state inside the card is a DRAFT. This branch flips a pressed flag, a class, a label
    // and the header pill, and nothing else: no state, no RPC, no saveLocal. The roster is written by the
    // save, and only through mgckToggleByKey, and only when the flag actually differs (README:321).
    const inBtn = e.target.closest('[data-pe-in]');
    if (inBtn) {
      e.preventDefault();
      e.stopPropagation();
      const on = inBtn.getAttribute('aria-pressed') !== 'true';
      inBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      inBtn.classList.toggle('is-in', on);
      const lbl = inBtn.querySelector('[data-pe-inlabel]');
      if (lbl) lbl.textContent = on ? 'Check out' : 'Check in';
      const head = document.querySelector('#player-edit-modal .pe-head');
      const pill = head ? head.querySelector('.pe-in') : null;
      const x = head ? head.querySelector('.pe-x') : null;
      if (on && !pill && head && x) head.insertBefore(peInPillNode(), x);
      else if (!on && pill) pill.remove();
      return;
    }
```

Bump `APP_VERSION` to `'2026.08.29.4'`.

- [ ] **Step 7: Implement the CSS**

In `public/styles.css`, after the `#player-edit-modal .pe-skillin:focus` rule Task 4 added, insert:

```css
/* Round 2026-08-29 (iii): the check-in state is one button that does the thing it names. It says "Check
   in" while the player is out and "Check out" once they are in, and the header pill follows it in the same
   tick. Green is the app's live/positive family and is used here on purpose; the primary Save stays
   accent, because green is reserved for status, never for a primary. */
.pe-inbtn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  width: 100%;
  height: 48px;
  padding: 0 16px;
  border: 1px solid oklch(0.80 0.10 150);
  border-radius: 13px;
  background: oklch(0.95 0.045 150);
  color: oklch(0.40 0.11 150);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: background-color .15s ease, border-color .15s ease, color .15s ease, transform .09s ease;
}
.pe-inbtn:hover { background: oklch(0.92 0.06 150); }
.pe-inbtn:active { transform: scale(.99); }
.pe-inbtn .pe-ico { width: 17px; height: 17px; flex: none; }
.pe-inbtn .pe-ico-out,
.pe-inbtn.is-in .pe-ico-in { display: none; }
.pe-inbtn.is-in .pe-ico-out { display: block; }
/* already in: the action left is undoing it, so it stops shouting */
.pe-inbtn.is-in { border-color: var(--border); background: #fff; color: var(--ink); }
.pe-inbtn.is-in:hover { background: oklch(0.97 0.003 75); border-color: oklch(0.82 0.008 75); }
```

- [ ] **Step 8: Run the tests to verify they pass**

```bash
cd "$WT" && node --check public/app.js && node --check public/manage.js \
  && cat public/manage.js public/app.js > "$SCRATCH/concat.js" && node --check "$SCRATCH/concat.js"
cd "$WT/test" && npx vitest run 2>&1 | tail -4
```
Expected: 41 files, 1268 tests (1264 + 4), all green.

- [ ] **Step 9: Commit**

```bash
cd "$WT"
git add public/app.js public/styles.css test/checkin-popups.test.js
git commit -m "feat(popups): check in and check out from inside the card, as a draft until Save - v2026.08.29.4"
```

---

## Task 6: The pencil on every roster row, and the delegate that beats the row's own tap

**Model tier:** standard. One builder change and two delegate branches, with a real ordering trap.

**Files:**
- Modify: `public/manage.js` (`mgckListHTML`'s inner `row` builder at `:1103-1117`), `public/app.js` (the `manageView === 'checkin'` click branch at `:9217-9229`, a new keydown listener beside the one at `:9038`, `APP_VERSION`), `public/styles.css` (the `.mgck-*` block, after `.mgck-sk.n` at `:2290`), `test/checkin-popups.test.js`

**Interfaces:**
- Consumes: `openPlayerEditPopup(playerKey)` from `app.js`.
- Produces: `.mgck-edit` carrying `data-mgck-edit="{identity key}"`. Task 7's focus return re-queries by exactly that attribute and value; Task 7's `mgckCardNotice` re-queries the row by `data-mgck-id` with the same key.

- [ ] **Step 1: Read the row builder, the delegate order and the keyboard precedent**

```bash
cd "$WT"
sed -n '1103,1118p' public/manage.js    # the row builder: name, skill, go
sed -n '9214,9230p' public/app.js       # the checkin branch; the row toggle is the LAST check
sed -n '9036,9046p' public/app.js       # the bracket row's Enter/Space keydown, the shape to copy
sed -n '1486,1492p' public/styles.css   # .ckx-nm is flex:1; .ckx-row.is-in is opacity .55
```
The row is a `<button>`, so the pencil is a `span` with `role="button"`: nested buttons are invalid HTML and
the handoff says so itself (README:120-123). `.ckx-row.is-in { opacity: .55 }` caps every child and a child
cannot raise it, so the pencil gets a darker rest ink on a checked-in row rather than an opacity override.

- [ ] **Step 2: Add the delegate harness and the bridge lines**

In `test/checkin-popups.test.js`, directly after `const bridge = loadApp();` and above the first
`describe`, add the tap harness copied from `test/manage-round.test.js:1622-1653`:

```js
// One synthetic tap through the real #app-content click delegate. Copied from
// test/manage-round.test.js:1622-1653. `attrs` is every hook the tapped node sits under, so a control
// nested inside another hook's block can be reproduced exactly.
function withDelegate(fn) {
  const doc = bridge.doc;
  const realGet = doc.getElementById;
  const noop = () => {};
  let click = null;
  const keys = [];
  const appContent = {
    dataset: {}, style: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    addEventListener: (type, cb) => { if (type === 'click') click = cb; if (type === 'keydown') keys.push(cb); },
    removeEventListener: noop,
    querySelector: () => null, querySelectorAll: () => ({ forEach: noop, length: 0 }),
  };
  doc.getElementById = (id) => (id === 'app-content' ? appContent : null);
  // the later bindings in attachHandlers want DOM this harness does not have; the delegates are bound
  // first, so they are already captured by the time any of them complain
  try { bridge.attachHandlers(); } catch (_) { /* nothing after the delegates matters here */ }
  finally { doc.getElementById = realGet; }
  if (!click) throw new Error('the #app-content click delegate was never bound');
  const target = (list, value) => ({
    tagName: 'BUTTON', dataset: {},
    classList: { contains: () => false },
    closest: (sel) => (list.some((a) => sel === '[' + a + ']')
      ? { getAttribute: (name) => (list.includes(name) ? (value == null ? '' : value) : null), dataset: {} }
      : null),
  });
  const tap = (attrs, value) => click({
    target: target(Array.isArray(attrs) ? attrs : [attrs], value),
    preventDefault: noop, stopPropagation: noop,
  });
  const press = (key, attrs, value) => {
    const ev = { key, target: target(Array.isArray(attrs) ? attrs : [attrs], value), preventDefault: noop, stopPropagation: noop };
    for (const cb of keys) cb(ev);
  };
  return fn(tap, press);
}
```

And in the epilogue's `__bridge`, add:

```js
      attachHandlers: () => attachHandlers(),
      list: (opts) => { opts = opts || {}; manageView = 'checkin'; mgckFilter = opts.filter || 'all'; mgckQ = opts.q || ''; return mgckListHTML(checkinConsoleModel(mgckRows(), mgckFilter, mgckQ)); },
      seed: (players, checkedIn) => { state.players = players.slice(); state.checkedIn = (checkedIn || []).slice(); state.loaded = true; },
      swapOpeners: (openEdit, toggleRow) => {
        const a = openPlayerEditPopup, b = mgckToggleRow;
        openPlayerEditPopup = openEdit; mgckToggleRow = toggleRow;
        return () => { openPlayerEditPopup = a; mgckToggleRow = b; };
      },
```

- [ ] **Step 3: Write the failing tests**

```js
describe('Task 6: the pencil, and the tap that must not check anyone in', () => {
  const roster = [{ id: 'p1', name: 'Blake Harmon', skill: 6 }, { id: 'p2', name: 'Riley Chen', skill: 0 }];

  it('every row carries a pencil between the name and the rating', () => {
    bridge.seed(roster, []);
    const html = bridge.list();
    expect(html).toContain('class="mgck-edit" role="button" tabindex="0" data-mgck-edit=');
    expect(html).toContain('aria-label="Edit Blake Harmon"');
    const nm = html.indexOf('class="ckx-nm"');
    const pen = html.indexOf('class="mgck-edit"');
    const sk = html.indexOf('class="mgck-sk');
    expect(pen).toBeGreaterThan(nm);
    expect(sk).toBeGreaterThan(pen);
  });

  it('a tap on the pencil opens the card and never toggles the row', () => {
    bridge.seed(roster, []);
    const opened = []; const toggled = [];
    const undo = bridge.swapOpeners((k) => opened.push(k), (k) => toggled.push(k));
    try {
      withDelegate((tap) => { tap('data-mgck-edit', 'p1|blake harmon'); });
      expect(opened).toEqual(['p1|blake harmon']);
      expect(toggled).toEqual([]);
    } finally { undo(); }
  });

  it('a tap on the row itself still toggles, so the console did not lose its one-tap check-in', () => {
    bridge.seed(roster, []);
    const opened = []; const toggled = [];
    const undo = bridge.swapOpeners((k) => opened.push(k), (k) => toggled.push(k));
    try {
      withDelegate((tap) => { tap('data-mgck-id', 'p1|blake harmon'); });
      expect(toggled).toEqual(['p1|blake harmon']);
      expect(opened).toEqual([]);
    } finally { undo(); }
  });

  it('Enter and Space on the pencil open the same card the tap opens', () => {
    bridge.seed(roster, []);
    const opened = [];
    const undo = bridge.swapOpeners((k) => opened.push(k), () => {});
    try {
      withDelegate((tap, press) => { press('Enter', 'data-mgck-edit', 'p2|riley chen'); press(' ', 'data-mgck-edit', 'p2|riley chen'); });
      expect(opened).toEqual(['p2|riley chen', 'p2|riley chen']);
    } finally { undo(); }
  });

  it('the pencil is quiet at rest and legible on a checked-in row', () => {
    expect(cssLF).toContain('.mgck-edit {');
    expect(cssLF).toContain('.mgck-edit + .mgck-sk { margin-left: 10px; }');
    expect(cssLF).toContain('.ckx-row.is-in .mgck-edit { color: oklch(0.45 0.01 75); }');
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

```bash
cd "$WT/test" && npx vitest run checkin-popups.test.js
```
Expected: all five FAIL.

- [ ] **Step 5: Implement the row builder**

In `public/manage.js`, replace the `row` arrow inside `mgckListHTML` (`:1108-1117`) with:

```js
  const row = (r) => {
    const gp = r.group ? `<span class="ckx-gp">${escapeHTML(r.group)}</span>` : '';
    const tag = r.checkedIn ? 'IN' : 'CHECK IN';
    const n = Number(r && r.skill);
    const skPos = Number.isFinite(n) && n > 0;
    // Round 2026-08-29: the pencil sits between the name and the rating and opens the app's own player
    // card over the list. It is a span with role="button" because the row itself is a <button> and nested
    // buttons are invalid HTML (README:120-123). It carries the identity key so the delegate and the
    // focus-return never have to walk the DOM.
    const pencil = `<span class="mgck-edit" role="button" tabindex="0" data-mgck-edit="${escapeHTMLText(r.key)}"`
      + ` aria-label="Edit ${escapeHTMLText(r.name)}">`
      + `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">`
      + `<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></span>`;
    return `<button class="ckx-row${r.checkedIn ? ' is-in' : ''}" type="button" data-mgck-id="${escapeHTMLText(r.key)}">`
      + `<span class="ckx-nm">${highlightMatch(r.name, mgckQ)}${gp}</span>`
      + pencil
      + `<span class="mgck-sk${skPos ? '' : ' n'}">${mgpSkillText(r.skill)}</span>`
      + `<span class="ckx-go">${tag}</span></button>`;
  };
```
`gp` stays for now and is removed at Task 9 with the rest of the groups surface.

- [ ] **Step 6: Implement the two delegate branches**

In `public/app.js`, inside the `if (manageView === 'checkin') {` block (`:9217`), add the pencil check as
the FIRST check in the block, above `[data-mgck-filter]`:

```js
        // ABOVE the row toggle on purpose. The pencil sits inside the row <button>, so without this the
        // same tap would also fire the check-in at the [data-mgck-id] branch below.
        const pen = e.target.closest('[data-mgck-edit]');
        if (pen) {
          e.preventDefault();
          e.stopPropagation();
          openPlayerEditPopup(pen.getAttribute('data-mgck-edit') || '');
          return;
        }
```

Then, immediately after the bracket-row keydown listener that ends at `:9045`, add a third `keydown`
listener with the same shape:

```js
    // Check-in (round 2026-08-29): the row pencil ships role="button" tabindex="0", so Enter and Space
    // have to open the SAME card the tap opens. One opener, never a second path. Space is prevented so a
    // keyboard organiser does not scroll the roster out from under the card.
    appContent.addEventListener('keydown', (e) => {
      if (!e || (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar')) return;
      if (manageView !== 'checkin') return;
      const pen = (e.target && e.target.closest) ? e.target.closest('[data-mgck-edit]') : null;
      if (!pen) return;
      if (e.preventDefault) e.preventDefault();
      openPlayerEditPopup(pen.getAttribute('data-mgck-edit') || '');
    });
```

Bump `APP_VERSION` to `'2026.08.29.5'`.

- [ ] **Step 7: Implement the CSS**

In `public/styles.css`, after `.mgck-sk.n` (`:2290`), add:

```css
/* Round 2026-08-29 (i) - "on the check in page i need to be able to edit the players". The pencil sits
   between the name and the skill, quiet until it is wanted. .ckx-row.is-in runs at opacity .55 and opacity
   on the parent caps every child, so a checked-in row's pencil cannot opt out of it: it gets a darker rest
   ink instead of an override that would not work. */
.mgck-edit {
  flex: none;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  margin-left: auto;
  border-radius: 10px;
  border: 1px solid transparent;
  color: oklch(0.62 0.01 75);
  cursor: pointer;
  transition: color 140ms cubic-bezier(.2,.7,.3,1),
              background 140ms cubic-bezier(.2,.7,.3,1),
              border-color 140ms cubic-bezier(.2,.7,.3,1);
}
.mgck-edit svg { width: 15px; height: 15px; }
.mgck-edit:hover,
.mgck-edit:focus-visible {
  color: var(--accent);
  background: var(--accent-soft);
  border-color: var(--accent-bd);
  outline: none;
}
.mgck-edit + .mgck-sk { margin-left: 10px; }
.ckx-row.is-in .mgck-edit { color: oklch(0.45 0.01 75); }
```

- [ ] **Step 8: Run the tests to verify they pass**

```bash
cd "$WT" && node --check public/app.js && node --check public/manage.js \
  && cat public/manage.js public/app.js > "$SCRATCH/concat.js" && node --check "$SCRATCH/concat.js"
cd "$WT/test" && npx vitest run 2>&1 | tail -4
```
Expected: 41 files, 1273 tests (1268 + 5), all green.

- [ ] **Step 9: Commit**

```bash
cd "$WT"
git add public/app.js public/manage.js public/styles.css test/checkin-popups.test.js
git commit -m "feat(checkin): a pencil on every roster row opens the player card, and the row tap still checks in - v2026.08.29.5"
```

---

## Task 7: Save writes back in place, and the strip says what happened

**Model tier:** most capable. This is where the card touches the roster, and where UNDO can be stranded.

**Files:**
- Modify: `public/manage.js` (a new `mgckNotice` binding beside `mgckLast`, `mgckStripHTML` at `:1096`, `buildManageCheckinHTML`'s strip line at `:1150`, `mgckRepaint`'s strip lines at `:1165-1166`, `mgckToggleByKey` at `:1171`, a new `mgckCardNotice`), `public/app.js` (`closePlayerEditPopup` at `:102`, the save's tail at `:471-475`, a new document keydown beside `ensureSaveDelegationBound`, `APP_VERSION`), `test/checkin-popups.test.js`

**Interfaces:**
- Consumes: `peOrigin` and `peReturnKey` (Task 3), the `[data-pe-in]` button's `aria-pressed` (Task 5), `data-mgck-edit` (Task 6).
- Produces: `mgckNotice` (the card's one-shot message, no UNDO) and `mgckCardNotice(text, key)`. Task 8's add path calls `mgckCardNotice` for its own message.

- [ ] **Step 1: Read the strip, the repaint and the save tail**

```bash
cd "$WT"
grep -n "^let mgckLast" public/manage.js
sed -n '1096,1102p' public/manage.js     # mgckStripHTML: one source, always an UNDO button
sed -n '1148,1152p' public/manage.js     # buildManageCheckinHTML's strip line
sed -n '1156,1168p' public/manage.js     # mgckRepaint: scroll preserved, three targeted swaps
sed -n '1198,1204p' public/manage.js     # mgckToggleByKey's mgckLast write; opts.silent already honoured
sed -n '468,478p' public/app.js          # the save tail: saveLocal, close, closeInlineEditRow, render()
sed -n '9218,9226p' public/app.js        # the UNDO handler that reads mgckLast
```

- [ ] **Step 2: Add the bridge lines this task needs**

In `test/checkin-popups.test.js`'s epilogue `__bridge`, add:

```js
      strip: () => mgckStripHTML(),
      setStrip: (o) => { o = o || {}; mgckLast = (o.last === undefined ? null : o.last); mgckNotice = (o.notice === undefined ? null : o.notice); },
      readStrip: () => ({ last: mgckLast, notice: mgckNotice }),
      toggleByKey: (k, d, o) => mgckToggleByKey(k, d, o),
      swapRepaint: (fn) => { const a = mgckRepaint, b = repaintManage; mgckRepaint = fn; repaintManage = fn; return () => { mgckRepaint = a; repaintManage = b; }; },
```

- [ ] **Step 3: Write the failing tests**

```js
describe('Task 7: the save writes back in place and the strip stays honest', () => {
  it('the card message carries no UNDO, because one button cannot undo a multi-field write', () => {
    bridge.setStrip({ notice: 'Riley Chen updated' });
    const s = bridge.strip();
    expect(s).toContain('Riley Chen updated');
    expect(s).not.toContain('data-mgck-undo');
  });

  it('a plain row tap still gets its UNDO', () => {
    bridge.setStrip({ last: { key: 'p1|riley chen', name: 'Riley Chen', dir: 'in' } });
    const s = bridge.strip();
    expect(s).toContain('Riley Chen checked in');
    expect(s).toContain('data-mgck-undo');
  });

  it('the card message wins while it is set', () => {
    bridge.setStrip({ last: { key: 'p1|riley chen', name: 'Riley Chen', dir: 'in' }, notice: 'Riley Chen updated' });
    expect(bridge.strip()).not.toContain('data-mgck-undo');
  });

  it('a row toggle clears the card message, so UNDO comes straight back', () => {
    bridge.seed([{ id: 'p1', name: 'Riley Chen', skill: 6 }], []);
    bridge.setStrip({ notice: 'Riley Chen updated' });
    const undo = bridge.swapRepaint(() => {});
    try {
      bridge.toggleByKey('p1|riley chen', 'in');
      const after = bridge.readStrip();
      expect(after.notice).toBe(null);
      expect(after.last).toBeTruthy();
      expect(bridge.getState().checkedIn).toContain('p1|riley chen');
    } finally { undo(); }
  });

  it('a silent toggle writes the roster and leaves mgckLast alone, which is what the card needs', () => {
    bridge.seed([{ id: 'p2', name: 'Blake Harmon', skill: 6 }], []);
    bridge.setStrip({ last: null, notice: null });
    const undo = bridge.swapRepaint(() => {});
    try {
      bridge.toggleByKey('p2|blake harmon', 'in', { silent: true });
      expect(bridge.getState().checkedIn).toContain('p2|blake harmon');
      expect(bridge.readStrip().last).toBe(null);
    } finally { undo(); }
  });

  it('the save repaints in place, never with a full render, and only toggles on a real difference', () => {
    const save = slice(appSrc, 'function ensureSaveDelegationBound()', 'function ensureHeaderTapToTop()');
    const branch = save.slice(save.indexOf("const btn = e.target.closest('.btn-save-edit');"));
    expect(branch).not.toContain('render();');
    expect(branch).toContain('mgckCardNotice');
    expect(branch).toContain('repaintManage');
    const cmp = branch.indexOf('wantIn !== isInNow');
    const call = branch.indexOf('mgckToggleByKey(');
    expect(cmp).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(cmp);
  });

  it('close hands focus back to the pencil that opened the card, by key', () => {
    const s = slice(appSrc, 'function closePlayerEditPopup()', 'function peSkillStep(');
    expect(s).toContain('.mgck-edit[data-mgck-edit=');
    expect(s).toContain('peReturnKey');
  });

  it('Escape closes without saving and Enter in a field saves', () => {
    const s = slice(appSrc, 'function ensurePlayerEditKeysBound()', 'function ensureSaveDelegationBound()');
    expect(s).toContain("if (e.key === 'Escape')");
    expect(s).toContain('closePlayerEditPopup()');
    expect(s).toContain("e.key === 'Enter'");
    expect(s).toContain("classList.contains('popup-edit-input')");
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

```bash
cd "$WT/test" && npx vitest run checkin-popups.test.js
```
Expected: all eight FAIL.

- [ ] **Step 5: Implement the strip's second source**

In `public/manage.js`, directly under the `let mgckLast` declaration (find it with
`grep -n "^let mgckLast" public/manage.js`), add:

```js
// Round 2026-08-29: the card's own one-shot message ("{name} updated" / "{name} added"), which carries NO
// UNDO. A card save writes a name, a rating and possibly an attendance flip, and one button cannot undo
// three things. mgckLast stays exactly what it was: the last ROW TAP, which UNDO can and does reverse.
let mgckNotice = null;
```

Replace `mgckStripHTML` (`:1096-1101`) with:

```js
function mgckStripHTML() {
  // The card's message wins while it is set and carries no UNDO. A row tap clears it (mgckToggleByKey),
  // and the UNDO strip comes straight back.
  if (mgckNotice) return `<span class="mgck-st">${escapeHTML(mgckNotice)}</span>`;
  if (!mgckLast) return '';
  const verb = mgckLast.dir === 'in' ? 'checked in' : 'checked out';
  return `<span class="mgck-st">${escapeHTML(mgckLast.name)} ${verb}</span>`
    + `<button type="button" data-mgck-undo>UNDO</button>`;
}
```

In `buildManageCheckinHTML` (`:1150`), change the strip line's hidden test:

```js
    <div class="mgck-strip" id="mgck-strip"${(mgckLast || mgckNotice) ? '' : ' hidden'}>${mgckStripHTML()}</div>
```

In `mgckRepaint` (`:1165-1166`), change the same test:

```js
  const stripEl = document.getElementById('mgck-strip');
  if (stripEl) { stripEl.innerHTML = mgckStripHTML(); stripEl.hidden = !(mgckLast || mgckNotice); }
```

In `mgckToggleByKey`, make the first line of the function body:

```js
function mgckToggleByKey(key, dir, opts) {
  mgckNotice = null;   // a row tap is undoable, so the card's message steps aside and UNDO returns
  const player = (state.players || []).find((p) => playerIdentityKey(p) === key);
```

- [ ] **Step 6: Implement the card's notice**

In `public/manage.js`, directly after `mgckToggleRow`'s closing brace (`:1209`), add:

```js
// The card's write-back: set the message, drop the UNDO pointer, repaint the list in place, then flash the
// row. The flash runs AFTER the repaint because mgckRepaint replaces #mgck-list's innerHTML and would
// throw the class away. mPlay is the app's own helper at the app's own 440ms (app.js:5151,
// styles.css:4521), and it is already suppressed under body.no-motion and prefers-reduced-motion.
function mgckCardNotice(text, key) {
  mgckNotice = String(text || '');
  mgckLast = null;
  mgckRepaint();
  if (!key) return;
  const sel = (typeof CSS !== 'undefined' && CSS && CSS.escape) ? CSS.escape(key) : String(key).replace(/"/g, '\\"');
  const row = document.querySelector(`.ckx-row[data-mgck-id="${sel}"]`);
  if (row) mPlay(row, 'm-flash', 440);
}
```

- [ ] **Step 7: Implement the save tail, the close and the keys**

In `public/app.js`, inside the `.btn-save-edit` branch, replace the four lines at `:471-475`:

```js
    // Persist local and render immediately for responsive inline edits.
    saveLocal();
    closePlayerEditPopup();
    closeInlineEditRow(row);
    render();
```
with:
```js
    // The status draft, applied ONCE and only on a real difference. mgckToggleByKey (manage.js) is the only
    // maintained attendance writer: optimistic locally, then check_in / check_out, with the outbox on
    // failure. `silent` keeps mgckLast null so UNDO never points at a card save; the card sets its own
    // strip message below.
    const inBtnEl = document.querySelector('#player-edit-modal [data-pe-in]');
    if (inBtnEl) {
      const wantIn = inBtnEl.getAttribute('aria-pressed') === 'true';
      const isInNow = new Set(state.checkedIn || []).has(rowPlayerKey);
      if (wantIn !== isInNow) mgckToggleByKey(rowPlayerKey, wantIn ? 'in' : 'out', { silent: true });
    }

    // Persist locally, then repaint IN PLACE. render() rebuilt the whole shell and threw the console's
    // scroll position away mid-check-in. mgckCardNotice repaints the list, sets the strip and flashes the
    // row; on the Players surface repaintManage does the same job for that list. The render() fallback is
    // unreachable in practice (the card only opens from Manage) and exists so the file seam is never a throw.
    saveLocal();
    closePlayerEditPopup();
    closeInlineEditRow(row);
    if (peOrigin === 'checkin' && typeof mgckCardNotice === 'function') mgckCardNotice(name + ' updated', rowPlayerKey);
    else if (typeof repaintManage === 'function') repaintManage();
    else render();
```

Replace `closePlayerEditPopup` (`:102-110`) with:

```js
function closePlayerEditPopup() {
  const modal = document.getElementById('player-edit-modal');
  if (!modal) return;
  modal.style.display = 'none';
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  const body = document.getElementById('player-edit-modal-body');
  if (body) body.innerHTML = '';
  peMode = 'edit';
  // Focus returns to the pencil that opened the card. It is re-QUERIED rather than remembered, because a
  // save repaints #mgck-list and the original element is gone by the time we get here.
  const key = peReturnKey;
  peReturnKey = '';
  if (!key) return;
  const sel = (typeof CSS !== 'undefined' && CSS && CSS.escape) ? CSS.escape(key) : String(key).replace(/"/g, '\\"');
  const back = document.querySelector(`.mgck-edit[data-mgck-edit="${sel}"]`);
  if (back) { try { back.focus(); } catch (_) {} }
}
```

Add a once-bound keydown, directly ABOVE the `ensureSaveDelegationBound` IIFE (`:394`):

```js
// -- Escape closes the player card, Enter in one of its fields saves it --
// Bound once on the document, guarded on the modal actually being open, so it costs nothing on every other
// screen. The card has no dialog primitive to trap focus with (README:364-365 asks for one; the app has
// none), so Escape is the exit and it works with focus anywhere.
(function ensurePlayerEditKeysBound() {
  if (window.__peKeysBound) return;
  window.__peKeysBound = true;
  document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('player-edit-modal');
    if (!modal || modal.style.display !== 'flex') return;
    if (e.key === 'Escape') { e.preventDefault(); closePlayerEditPopup(); return; }
    if (e.key === 'Enter' && e.target && e.target.classList && e.target.classList.contains('popup-edit-input')) {
      e.preventDefault();
      const save = modal.querySelector('.btn-save-edit');
      if (save) save.click();
    }
  });
})();
```

Bump `APP_VERSION` to `'2026.08.29.6'`.

- [ ] **Step 8: Run the tests to verify they pass**

```bash
cd "$WT" && node --check public/app.js && node --check public/manage.js \
  && cat public/manage.js public/app.js > "$SCRATCH/concat.js" && node --check "$SCRATCH/concat.js"
cd "$WT/test" && npx vitest run 2>&1 | tail -4
```
Expected: 41 files, 1281 tests (1273 + 8), all green.

- [ ] **Step 9: Prove the no-render guard by mutation**

Put `render();` back at the end of the `.btn-save-edit` branch, run
`cd "$WT/test" && npx vitest run checkin-popups.test.js`, watch the "repaints in place" case go RED, then
remove it again and watch it go green. Record both results in the task report. A negative assertion that
was never seen red is not a guard.

- [ ] **Step 10: Commit**

```bash
cd "$WT"
git add public/app.js public/manage.js test/checkin-popups.test.js
git commit -m "feat(popups): saving the card writes the row back in place, flashes it and keeps UNDO honest - v2026.08.29.6"
```

---

## Task 8: Add player, from the console header

**Model tier:** most capable. A new write path against a live roster, with three refusals that have to
land on a card the organizer is still looking at.

**Files:**
- Modify: `public/manage.js` (`buildManageCheckinHTML`'s page header at `:1140-1143`, a new `mgckAddFromCard` beside `mgckAddAndCheckIn`), `public/app.js` (`openPlayerEditPopup`'s signature and its player lookup, a new `openPlayerAddPopup`, the `#pe-msg` line in the card body, the `[data-mgck-new]` delegate branch, the add branch in the save, `flushOutbox`'s register branch at `:5115`, `APP_VERSION`), `public/styles.css` (`.mgck-add` and `.pe-msg`), `test/checkin-popups.test.js`

**Interfaces:**
- Consumes: `peMode` (Task 3), the `[data-pe-in]` draft flag (Task 5), `mgckCardNotice` (Task 7).
- Produces: `openPlayerAddPopup()` and `mgckAddFromCard(name, skill, wantIn)`. Task 9 edits `mgckAddAndCheckIn` beside it and must not confuse the two: the in-list search miss always checks in, the card defaults OUT.

- [ ] **Step 1: Read the door that already exists and the one this one must not become**

```bash
cd "$WT"
sed -n '1212,1246p' public/manage.js    # mgckAddAndCheckIn: the in-list search miss, always checks in
sed -n '1136,1144p' public/manage.js    # buildManageCheckinHTML's page header
sed -n '1036,1042p' public/manage.js    # buildManagePlayersHTML's header: .mgp-selbtn is the pin pattern
sed -n '2222,2226p' public/styles.css   # .mgp-selbtn { margin-left: auto; ... }
sed -n '5110,5120p' public/app.js       # flushOutbox's register branch
sed -n '9730,9736p' public/app.js       # the kiosk's isValidFullName gate and its copy
sed -n '2286,2289p' public/styles.css   # .mgck-msg, the status-line pattern .pe-msg copies
```
Mike kept BOTH doors (2026-08-29). `mgckAddAndCheckIn` is untouched by this task.

- [ ] **Step 2: Add the bridge lines this task needs**

In `test/checkin-popups.test.js`'s epilogue `__bridge`, add:

```js
      checkinPage: () => { manageView = 'checkin'; return buildManageCheckinHTML(); },
      addFromCard: (n, s, i) => mgckAddFromCard(n, s, i),
      swapSupaRpc: (fn) => { const was = supabaseClient.rpc; supabaseClient.rpc = async (...a) => fn(...a); return () => { supabaseClient.rpc = was; }; },
      swapUpdateFields: (fn) => { const was = updatePlayerFieldsSupabase; updatePlayerFieldsSupabase = fn; return () => { updatePlayerFieldsSupabase = was; }; },
      swapOutbox: (fn) => { const was = outboxEnqueue; outboxEnqueue = fn; return () => { outboxEnqueue = was; }; },
      swapAddOpener: (fn) => { const was = openPlayerAddPopup; openPlayerAddPopup = fn; return () => { openPlayerAddPopup = was; }; },
```

- [ ] **Step 3: Write the failing tests**

```js
describe('Task 8: adding a player from the console header', () => {
  it('the page header carries the Add player pill', () => {
    bridge.seed([{ id: 'p1', name: 'Blake Harmon', skill: 6 }], []);
    const html = bridge.checkinPage();
    expect(html).toContain('class="mgck-add" data-mgck-new');
    expect(html).toContain('<span>Add player</span>');
    const hdr = html.indexOf('class="pd-pagehdr"');
    const pill = html.indexOf('class="mgck-add"');
    const hdrEnd = html.indexOf('class="mgck-meta"');
    expect(pill).toBeGreaterThan(hdr);
    expect(pill).toBeLessThan(hdrEnd);
  });

  it('a tap on the pill opens the card in its new-player state', () => {
    const opened = [];
    const undo = bridge.swapAddOpener(() => opened.push('new'));
    try {
      withDelegate((tap) => { tap('data-mgck-new'); });
      expect(opened).toEqual(['new']);
    } finally { undo(); }
  });

  it('a rated new player registers once with two keys and gets one follow-up write for the rating', async () => {
    bridge.seed([], []);
    const calls = []; const fields = [];
    const undoRepaint = bridge.swapRepaint(() => {});
    const undoRpc = bridge.swapSupaRpc((name, args) => { calls.push([name, args]); return { data: [{ id: 'p-new' }], error: null }; });
    const undoFields = bridge.swapUpdateFields(async (id, f) => { fields.push([id, f]); return true; });
    try {
      await bridge.addFromCard('Zoe Park', 6.5, false);
      expect(calls.length).toBe(1);
      expect(calls[0][0]).toBe('register_player');
      expect(calls[0][1]).toEqual({ p_name: 'Zoe Park', p_checked_in: false });
      expect('p_group' in calls[0][1]).toBe(false);
      expect(fields).toEqual([['p-new', { skill: 6.5 }]]);
    } finally { undoFields(); undoRpc(); undoRepaint(); }
  });

  it('an unrated new player takes no follow-up write at all', async () => {
    bridge.seed([], []);
    const fields = [];
    const undoRepaint = bridge.swapRepaint(() => {});
    const undoRpc = bridge.swapSupaRpc(() => ({ data: [{ id: 'p-new2' }], error: null }));
    const undoFields = bridge.swapUpdateFields(async (id, f) => { fields.push([id, f]); return true; });
    try {
      await bridge.addFromCard('Ari Vance', 0, true);
      expect(fields).toEqual([]);
      expect(bridge.getState().checkedIn.length).toBe(1);
    } finally { undoFields(); undoRpc(); undoRepaint(); }
  });

  it('a failed register enqueues exactly one outbox row, carrying the rating and no group', async () => {
    bridge.seed([], []);
    const rows = [];
    const undoRepaint = bridge.swapRepaint(() => {});
    const undoRpc = bridge.swapSupaRpc(() => { throw new Error('offline'); });
    const undoOut = bridge.swapOutbox((op) => rows.push(op));
    try {
      await bridge.addFromCard('Noa Whitfield', 4.5, true);
      expect(rows.length).toBe(1);
      expect(rows[0].kind).toBe('register');
      expect(rows[0].payload).toEqual({ name: 'Noa Whitfield', checked_in: true, skill: 4.5 });
      expect('group' in rows[0].payload).toBe(false);
    } finally { undoOut(); undoRpc(); undoRepaint(); }
  });

  it('the three refusals run while the card is still open, before it closes', () => {
    const save = slice(appSrc, 'function ensureSaveDelegationBound()', 'function ensureHeaderTapToTop()');
    const add = save.slice(save.indexOf("if (peMode === 'new') {"), save.indexOf("const inBtnEl ="));
    expect(add).toContain('state.loaded');
    expect(add).toContain('isValidFullName');
    expect(add).toContain('is already on the roster');
    expect(add.indexOf('is already on the roster')).toBeLessThan(add.indexOf('closePlayerEditPopup()'));
    expect(add).toContain("say('Enter a first and last name')");
    expect(add).toContain("say('Still loading. One second, then tap again.')");
  });

  it('the card carries a status line for those refusals', () => {
    const s = slice(appSrc, 'function openPlayerEditPopup(', 'function closeInlineEditRow(');
    expect(s).toContain('<p class="pe-msg" id="pe-msg" role="status" aria-live="polite"></p>');
    expect(cssLF).toContain('.pe-msg:empty { display: none; }');
    expect(cssLF).toContain('.mgck-add {');
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

```bash
cd "$WT/test" && npx vitest run checkin-popups.test.js
```
Expected: all seven FAIL.

- [ ] **Step 5: Implement the header pill and its CSS**

In `public/manage.js`, replace `buildManageCheckinHTML`'s `.pd-pagehdr` block (`:1140-1143`) with:

```js
  return `<div class="pd-pagehdr">
      <button type="button" class="pd-back" data-mg-area="lead" aria-label="Back to Manage">${PK_BACK_SVG}</button>
      <div class="pd-htitle">Check-in</div>
      <button type="button" class="mgck-add" data-mgck-new aria-label="Add a player to the roster">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>Add player</span></button>
    </div>
```
The label "Add player" is the handoff's, verbatim. The `aria-label` is this plan's own addition, not copy
from the handoff (`mg-checkin.html:36` carries none), and it is kept because the pill's text alone does not
say what roster it adds to.

In `public/styles.css`, after the `.mgck-edit` block Task 6 added, insert:

```css
/* Round 2026-08-29 (v) - "i need a way to add a new player with a similar pop up". The pill sits in the
   page header next to the title, pinned right the way .mgp-selbtn is on the Players page (styles.css:2224),
   and opens the SAME card the pencil opens, in its new-player state. */
.mgck-add {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  height: 32px;
  padding: 0 12px 0 10px;
  border: 1px solid var(--accent-bd);
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .01em;
  cursor: pointer;
  transition: background-color .15s ease, border-color .15s ease, transform .09s ease;
}
.mgck-add svg { width: 14px; height: 14px; }
.mgck-add:hover { background: oklch(0.92 0.04 250); }
.mgck-add:active { transform: scale(.97); }
```

And after the `.pe-inbtn` block Task 5 added:

```css
/* the card's own status line, for the three refusals the add path can hand back. Same shape as the
   console's #mgck-msg (manage.js:1131, styles.css:2287). */
.pe-msg { font-size: 12.5px; color: var(--danger); margin: 10px 0 0; }
.pe-msg:empty { display: none; }
```

- [ ] **Step 6: Implement the add opener and the card's new state**

In `public/app.js`, change `openPlayerEditPopup`'s signature and its player lookup. The head of the
function becomes:

```js
// `mode` is 'new' only from openPlayerAddPopup. Every other caller passes one argument and gets 'edit',
// which is what attachHandlers' players row (app.js) and mgpAddPlayer's duplicate branch (manage.js) do.
function openPlayerEditPopup(playerKey, mode) {
  const modal = ensurePlayerEditModal();
  const card  = modal ? modal.querySelector('.pe-card') : null;
  if (!modal || !card) return;

  peMode = (mode === 'new') ? 'new' : 'edit';
  peOrigin = (typeof manageView === 'string' && manageView === 'checkin') ? 'checkin' : 'players';
  peReturnKey = (peMode === 'new') ? '' : String(playerKey || '');

  // The add card is the same element with no roster row behind it: empty fields, no pill, status OUT.
  const player = (peMode === 'new')
    ? { id: '', name: '', skill: 0, groups: [] }
    : state.players.find(p => playerIdentityKey(p) === playerKey);
  if (!player) return;
```
(the two lines Task 3 added after the guard are replaced by the three lines above).

Directly after `openPlayerEditPopup`'s closing brace, add:

```js
// The header pill's opener. Same element, same styles, same save path (README:14-15): only the state
// differs. A new player starts OUT, because being added to the roster is not the same as standing at the
// table, and the row's own tap is how they check in.
function openPlayerAddPopup() {
  openPlayerEditPopup('', 'new');
}
```

Add the status line to the card body, directly after the Status button Task 5 added and before the
`</div>` that closes `.edit-row`:

```js
      <p class="pe-msg" id="pe-msg" role="status" aria-live="polite"></p>
```

In `attachHandlers`, inside the `manageView === 'checkin'` block, directly under the pencil branch Task 6
added:

```js
        if (e.target.closest('[data-mgck-new]')) { e.preventDefault(); openPlayerAddPopup(); return; }
```

- [ ] **Step 7: Implement the add branch in the save**

In `ensureSaveDelegationBound`'s `.btn-save-edit` branch, directly after the `skill` clamp Task 4 added and
before the `const inBtnEl =` block Task 7 added, insert:

```js
    // ADD MODE. The card in its new state has no player row to update; it registers one. All three
    // refusals run HERE, before the close, because a refusal has to land on a card the organiser is still
    // looking at. Two of the three sentences are the ones mgckAddAndCheckIn already says
    // (manage.js:1216-1217), so the two doors refuse in the same words.
    if (peMode === 'new') {
      const say = (t) => { const el = document.getElementById('pe-msg'); if (el) el.textContent = t; };
      if (!state.loaded) { say('Still loading. One second, then tap again.'); return; }
      if (!isValidFullName(name)) { say('Enter a first and last name'); return; }
      if ((state.players || []).some((p) => normalize(p.name) === normalize(name))) {
        // The card STAYS OPEN. Reopening an edit card for someone else would throw away the rating and the
        // status just set, with no message. mgpAddPlayer keeps that reopen shape because it is reached
        // from a list tap where nothing was typed.
        say(name + ' is already on the roster');
        return;
      }
      const inEl = document.querySelector('#player-edit-modal [data-pe-in]');
      const wantIn = !!(inEl && inEl.getAttribute('aria-pressed') === 'true');
      closePlayerEditPopup();
      void mgckAddFromCard(name, skill, wantIn);
      return;
    }
```

- [ ] **Step 8: Implement the write path**

In `public/manage.js`, directly after `mgckAddAndCheckIn`'s closing brace (`:1245`), add:

```js
// The header card's add. Mike (2026-08-29) kept BOTH doors: mgckAddAndCheckIn is the in-list search miss
// and always checks in; this one honours the card's own status toggle and defaults OUT. register_player
// inserts with skill 0 (0020's body), so a rated new player needs a second write once the insert returns
// an id. The row lands under the right section head for free, because mgckRepaint rebuilds the list from
// checkinConsoleModel, which sections by checkedIn (pure.js:1582-1589).
async function mgckAddFromCard(name, skill, wantIn) {
  const trimmed = String(name || '').trim();
  // The three gates below already ran in the save branch, WHILE THE CARD WAS STILL OPEN, because a refusal
  // has to land somewhere the organiser can read it. They are repeated here so the function is safe to
  // call from anywhere, and so a later caller cannot skip the app's standing rules.
  if (!trimmed || !state.loaded || !isValidFullName(trimmed)) return;
  if ((state.players || []).some((p) => normalize(p.name) === normalize(trimmed))) return;
  const n = Number(skill);
  const sk = (Number.isFinite(n) && n > 0) ? Math.max(0, Math.min(10, Math.round(n * 10) / 10)) : 0;
  const inserted = { name: trimmed, skill: sk, pending: true };
  state.players = [...(state.players || []), inserted];
  if (wantIn) checkInPlayer(inserted);
  saveLocal();
  mgckCardNotice(trimmed + ' added' + (wantIn ? ' · checked in' : ''), playerIdentityKey(inserted));
  if (!supabaseClient) { inserted.pending = false; return; }
  try {
    const { data, error } = await supabaseClient.rpc('register_player', { p_name: trimmed, p_checked_in: !!wantIn });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (row && row.id) inserted.id = row.id;
    if (inserted.id) {
      inserted.pending = false;
      if (sk > 0) await updatePlayerFieldsSupabase(inserted.id, { skill: sk });
    }
    queueSupabaseRefresh();
  } catch (err) {
    console.error('mgck card register error', err);
    inserted.pending = true;
    outboxEnqueue({ key: 'reg:' + normalize(trimmed), kind: 'register',
                    payload: { name: trimmed, checked_in: !!wantIn, skill: sk }, ts: Date.now() });
  }
  saveLocal();
  mgckRepaint();
}
```

In `public/app.js`, replace `flushOutbox`'s register branch (`:5115`) with:

```js
        else if (op.kind === 'register') {
          // Two keys, no group. A row queued by an older client still carries `group` in its payload and
          // this replay simply does not read it. A card-added player carries a rating, and register_player
          // only ever inserts skill 0, so the follow-up write rides here too.
          res = await supabaseClient.rpc('register_player', { p_name: op.payload.name, p_checked_in: op.payload.checked_in === true });
          const regRow = res && Array.isArray(res.data) ? res.data[0] : (res && res.data);
          if (!res.error && regRow && regRow.id && Number(op.payload.skill) > 0) {
            await updatePlayerFieldsSupabase(regRow.id, { skill: Number(op.payload.skill) });
          }
        }
```

Bump `APP_VERSION` to `'2026.08.29.7'`.

- [ ] **Step 9: Run the tests to verify they pass**

```bash
cd "$WT" && node --check public/app.js && node --check public/manage.js \
  && cat public/manage.js public/app.js > "$SCRATCH/concat.js" && node --check "$SCRATCH/concat.js"
cd "$WT/test" && npx vitest run 2>&1 | tail -4
```
Expected: 41 files, 1288 tests (1281 + 7), all green.

- [ ] **Step 10: Commit**

```bash
cd "$WT"
git add public/app.js public/manage.js public/styles.css test/checkin-popups.test.js
git commit -m "feat(checkin): Add player in the console header opens the same card in its new-player state - v2026.08.29.7"
```

---

## Task 9: Groups leave every surface, and the last three `p_group` callers go with them

**Model tier:** standard. Mechanical deletions across five files, with one ordering trap named in the steps.

**Files:**
- Modify: `public/manage.js` (`mgckRows` at `:1079-1089`, `mgckListHTML`'s row at `:1108-1117`, `buildMgpListHTML` at `:994-1004`, `buildManagePlayersHTML` at `:1032-1073`, `mgpAddPlayer` at `:1329, :1336`, `mgckAddAndCheckIn` at `:1220, :1231, :1240`, delete `buildMgpGroupsHTML` at `:1011-1028`, `mgpBulkGroup` at `:1286`, `mgpAddGroup` at `:1355`, `mgpRenameGroupCommit` at `:1368`, `mgpDeleteGroup` at `:1397`, and the three bindings at `:26-28`), `public/app.js` (`openPlayerEditPopup`'s group derivation and hidden inputs, the save's group terms, `attachHandlers`' group delegates at `:9189-9200` and the view reset at `:9483`, `renderCheckinButton` at `:6106-6113`, `buildKioskResultsHTML`'s doc comment at `:6128-6131`, the kiosk register path at `:9760-9798`, `APP_VERSION`), `public/pure.js` (`disambiguatePlayersByName` at `:607-608, :632`), `public/checkin.html` (`:300`, `:429-432`, `:539`), `public/supabase-config.js` (`:12`), `test/checkin-popups.test.js`, `test/checkin-page.test.js` (`:120-123`), `test/pure.test.js` (`:391-397`, `:426-430`)

**Interfaces:**
- Consumes: nothing new.
- Produces: a client that emits no group surface and sends no `p_group`. Task 10 deletes the helper layer those surfaces used, and would throw a `ReferenceError` on the kiosk if run before this task.

- [ ] **Step 1: Read every site once, in one pass**

```bash
cd "$WT"
sed -n '26,28p;994,1006p;1011,1028p;1032,1073p;1079,1090p;1220p;1231p;1240p;1329p;1336p' public/manage.js
sed -n '143,146p;188,195p;430,431p;439,444p;461p;489p;491,515p' public/app.js
sed -n '6106,6113p;6128,6132p;9189,9200p;9483p;9760,9768p;9786p;9790p;9798p' public/app.js
sed -n '605,613p;630,634p' public/pure.js
sed -n '298,302p;427,434p;536,541p' public/checkin.html
sed -n '8,13p' public/supabase-config.js
```

- [ ] **Step 2: Write the failing tests**

Append to `test/checkin-popups.test.js`:

```js
describe('Task 9: groups leave every surface', () => {
  // A whole-file scan reads comments, and this round rewrites two of them to record Mike's ruling, which
  // names the class it removed. stripComments blanks them first, the way test/supabase-writes.test.js does.
  const clientSrc = stripComments(appSrc) + '\n' + stripComments(mgSrc);

  it('nothing in app.js or manage.js emits a group surface or sends a group argument', () => {
    for (const needle of ['ckx-gp', 'mgp-gp', 'mgp-mg', 'data-mgp-groups', 'data-mgp-movegrp',
                          'data-mgp-gadd', 'data-mgp-gdelete', 'data-mgp-grename', 'edit-group',
                          'edit-groups', 'p_group']) {
      expect(clientSrc).not.toContain(needle);
    }
  });

  it('the standalone kiosk page sends two keys and knows nothing about a club group', () => {
    const kiosk = readFileSync(new URL('../public/checkin.html', import.meta.url), 'utf8');
    expect(kiosk).not.toContain('p_group');
    expect(kiosk).not.toContain('GROUP_NAME');
    expect(kiosk).toContain("rpc('register_player', { p_name: fullName, p_checked_in: true })");
  });

  it('the check-in roster row is a name, a pencil, a rating and a tag, and nothing else', () => {
    bridge.seed([{ id: 'p1', name: 'Blake Harmon', skill: 6 }], []);
    const html = bridge.list();
    expect(html).not.toContain('ckx-gp');
    expect(html).toContain('class="ckx-nm"');
    expect(html).toContain('class="mgck-edit"');
  });

  it('the Players list has no crew subline, no group counter and no move bar', () => {
    bridge.seed([{ id: 'p1', name: 'Blake Harmon', skill: 6, group: 'Sunday Ballers' }], []);
    const list = bridge.mgpList();
    expect(list).not.toContain('mgp-gp');
    const page = bridge.mgpPage();
    expect(page).not.toContain('mgp-mg');
    expect(page).not.toContain('data-mgp-bulk="move"');
  });

  it('two players with the same full name render as identical kiosk rows, which is Mike\'s call', () => {
    // Mike (2026-08-29): "thats almost impossible to have the same full name, just leave it." Skill can
    // never appear on a public surface (AS-1), and no replacement differentiator is added.
    const a = bridge.kioskRow({ id: 'p4', name: 'John Smith', checkedIn: false }, 'john');
    const b = bridge.kioskRow({ id: 'p9', name: 'John Smith', checkedIn: false }, 'john');
    expect(a.replace('p4', 'ID')).toBe(b.replace('p9', 'ID'));
    expect(a).not.toContain('ckx-gp');
    expect(a).not.toContain('mgck-sk');
  });
});
```

Add the two bridge lines these need:

```js
      mgpList: () => buildMgpListHTML(),
      mgpPage: () => { manageView = 'players'; mgPlayerQuery = ''; mgSelectMode = false; mgSelected = new Set(); return buildManagePlayersHTML(); },
      kioskRow: (row, q) => renderCheckinButton(row, q),
```

Rewrite the existing case at `test/checkin-page.test.js:120-123`, keeping the file's `it` count the same:

```js
  it('two players with the same full name render as identical rows (Mike 2026-08-29: no tiebreaker)', () => {
    // Mike: "thats almost impossible to have the same full name, just leave it." The crew subline that used
    // to differentiate them is gone with groups, and skill can never render on a public surface (AS-1).
    const a = bridge.row({ id: 'p4', name: 'John Smith', checkedIn: false }, 'john');
    const b = bridge.row({ id: 'p9', name: 'John Smith', checkedIn: false }, 'john');
    expect(a).not.toContain('ckx-gp');
    expect(a.replace('p4', 'ID')).toBe(b.replace('p9', 'ID'));
  });
```

Edit `test/pure.test.js`: at `:426-430` the expected row loses `group`, and the fixture array at `:391-397`
loses every `group:` key:

```js
    expect(row).toEqual({ id: '2', name: 'Adam Cole', initials: 'AC', checkedIn: true });
```
and the describe's title at `:426` becomes
`'returns the no-skill shape {id,name,initials,checkedIn} and never leaks skill'`.

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd "$WT/test" && npx vitest run checkin-popups.test.js checkin-page.test.js pure.test.js
```
Expected: the five new cases FAIL, the rewritten kiosk case FAILS, the two `pure.test.js` edits FAIL.

- [ ] **Step 4: Implement the console side**

In `public/manage.js`, `mgckRows` (`:1079-1089`) loses its group key:

```js
function mgckRows() {
  const inSet = new Set(state.checkedIn || []);
  return (state.players || []).map((p) => ({
    key: playerIdentityKey(p),
    id: p.id,
    name: p.name,
    skill: p.skill,
    checkedIn: inSet.has(playerIdentityKey(p)),
  }));
}
```
This is safe because `checkinConsoleModel` (`public/pure.js:1573-1591`) never reads `group`: it filters,
sorts and counts on `name` and `checkedIn` only, which its 12 cases in `test/checkin-console.test.js:17-68`
keep proving.

In `mgckListHTML`'s `row`, delete the `const gp = ...` line and the `${gp}` interpolation, so the name span
reads `<span class="ckx-nm">${highlightMatch(r.name, mgckQ)}</span>`.

`mgckAddAndCheckIn`: `:1220` becomes
`const inserted = { name: trimmed, skill: 0.0, pending: true };`; `:1231` becomes
`await supabaseClient.rpc('register_player', { p_name: trimmed, p_checked_in: true })`; `:1240` becomes
`outboxEnqueue({ key: 'reg:' + normalize(trimmed), kind: 'register', payload: { name: trimmed, checked_in: true }, ts: Date.now() });`.

- [ ] **Step 5: Implement the Players side**

In `public/manage.js`, `buildMgpListHTML`: delete `const grp = ...` and `const gpHTML = ...` (`:994-995`)
and the `${gpHTML}` in the name span (`:1004`).

`buildManagePlayersHTML`: delete `const groupCount = ...` (`:1035`), the `.mgp-mg` button (`:1050`), the
`groupsSection` const (`:1053`) and its use (`:1072`), the `moveChips` block (`:1059-1063`) and the
`data-mgp-bulk="move"` button (`:1067`). The select-mode bar becomes:

```js
    bar = `<div class="mgp-bar">`
      + `<button type="button" class="pri" data-mgp-bulk="in">Check in</button>`
      + `<button type="button" data-mgp-bulk="out">Check out</button>`
      + `<button type="button" class="mut" data-mgp-bulk="cancel">Cancel</button>`
      + `</div>`;
```

Delete whole: `buildMgpGroupsHTML` (`:1011-1028`), `mgpBulkGroup` (`:1286`), `mgpAddGroup` (`:1355`),
`mgpRenameGroupCommit` (`:1368`), `mgpDeleteGroup` (`:1397`), and the bindings `mgGroupsOpen`,
`mgMoveOpen`, `mgRenameGroup` (`:26-28`).

`mgpAddPlayer`: `:1329` becomes `const inserted = { name, skill: 0, pending: true };`, and `:1336` becomes
`const insertRow = { name, skill: 0 };`.

- [ ] **Step 6: Implement the card and the delegates**

In `public/app.js`, `openPlayerEditPopup`: delete `playerGroup`, `playerGroups` and `groupsValue`
(`:143-145`), and delete the two hidden inputs with their comment (`:188-194`). The comment explained that
dropping them would wipe a player's groups on a name fix; with the column going there is nothing to wipe,
and that sentence is what the deletion commit message says.

In the save, delete `groupInput` and `groupsInput` (`:430-431`), the `parsedGroups` / `fallbackGroup` /
`groups` / `group` derivation (`:439-444`), the two keys in `next` (`:461` becomes
`const next = { ...prev, name, skill };`), the two keys in the update call (`:489` becomes
`remoteOK = await updatePlayerFieldsSupabase(next.id, { name, skill });`), the whole three-way insert
fallback (`:491-511` collapses to the single shape below) and `ensureGroupCatalogEntriesSupabase(groups)`
(`:515`):

```js
          } else {
            const { data, error } = await supabaseClient.from('players').insert([{ name, skill }]).select();
            if (error) throw error;
            // Capture the inserted id so a later re-Save updates this row instead of inserting a duplicate.
            if (Array.isArray(data) && data.length > 0) next.id = data[0].id;
            remoteOK = true;
          }
```

In `attachHandlers`, delete the eight group branches (`:9190-9195`, `:9198`, `:9200`) and the
`mgMoveOpen` / `mgRenameGroup` resets on `:9189`, `:9199` and `:9483`.

- [ ] **Step 7: Implement the kiosk side, both doors**

`renderCheckinButton` (`:6106-6113`) loses `const group` and `${group}`, and its comment block
(`:6102-6105`) records the ruling instead of the removed line:

```js
// Mike (2026-08-29), on two players with the same full name: "thats almost impossible to have the same
// full name, just leave it." Identical rows are accepted; there is no replacement differentiator, and
// skill can NEVER render here (AS-1, admin-only ratings).
function renderCheckinButton(row, query) {
  const inClass = row.checkedIn ? ' is-in' : '';
  const tag = row.checkedIn ? 'ALREADY IN' : 'TAP TO CHECK IN';
  return `<button class="ckx-row${inClass}" type="button" data-checkin-id="${escapeHTML(String(row.id))}">`
    + `<span class="ckx-nm">${highlightMatch(row.name, query)}</span>`
    + `<span class="ckx-go">${tag}</span></button>`;
}
```
`buildKioskResultsHTML`'s doc comment (`:6131`) loses its now-false last clause: "NO skill (public
surface); rows are disambiguated by name alone (Mike, 2026-08-29)."

The in-app kiosk registration (surface E2): delete `activeGroupForRegister`, `group` and `groups`
(`:9760-9765`); `:9768` becomes `const inserted = { name, skill, pending: true };`; `:9786` becomes
`await supabaseClient.rpc('register_player', { p_name: name, p_checked_in: true })`; delete
`ensureGroupCatalogEntriesSupabase(...)` (`:9790`); `:9798` becomes
`outboxEnqueue({ key: 'reg:' + normalize(name), kind: 'register', payload: { name, checked_in: true }, ts: Date.now() });`.

**This is the ordering trap:** `:9760-9764` calls `normalizeActiveGroupSelection` and reads
`UNGROUPED_FILTER_VALUE`, both of which Task 10 deletes. Doing Task 10 first would throw a `ReferenceError`
on the first walk-up registration, inside a path with no error boundary.

`public/pure.js`: `disambiguatePlayersByName`'s returned row (`:632`) becomes
`row: { id: p.id, name, initials, checkedIn: !!p.checked_in }`, and its doc comment (`:607-608`) becomes
"Returns a NO-SKILL row shape {id,name,initials,checkedIn}; skill is admin-only and must never reach this
public surface (rulebook AS-1). Rows are disambiguated by full name alone (Mike, 2026-08-29)."

`public/checkin.html`: delete `const GROUP_NAME = CLUB_GROUP;` (`:300`); `:539` becomes
`const { error } = await sb.rpc('register_player', { p_name: fullName, p_checked_in: true });`; the
four-line NF-9 comment at `:429-432` keeps its history and loses its last clause about tagging new
registrants into `CLUB_GROUP`.

`public/supabase-config.js`: delete `CLUB_GROUP` (`:12`) and the comment block above it that explains the
two-door duplicate it prevented, replacing that comment with one line where the fact now lives:
`// The name+group dedup this constant existed for is gone: register_player dedups on name alone (0068).`

Bump `APP_VERSION` to `'2026.08.29.8'`.

- [ ] **Step 8: Run the tests, then prove the scan by mutation**

```bash
cd "$WT" && node --check public/app.js && node --check public/manage.js \
  && cat public/manage.js public/app.js > "$SCRATCH/concat.js" && node --check "$SCRATCH/concat.js"
grep -rn "p_group\|CLUB_GROUP\|ckx-gp\|mgp-gp\|mgp-mg" public/ || echo "clean"
cd "$WT/test" && npx vitest run 2>&1 | tail -4
```
Expected: `clean`, then 41 files, 1293 tests (1288 + 5), all green.

Mutation proof: add `const gp = '<span class="ckx-gp">x</span>';` back inside `mgckListHTML`'s row, run
`npx vitest run checkin-popups.test.js`, watch the scan case go RED, remove it, watch it go green. Record
both results.

- [ ] **Step 9: Commit**

```bash
cd "$WT"
git add public/app.js public/manage.js public/pure.js public/checkin.html public/supabase-config.js \
        test/checkin-popups.test.js test/checkin-page.test.js test/pure.test.js
git commit -m "feat(groups): every group surface leaves the client and both kiosk doors register with two keys - v2026.08.29.8"
```

---

## Task 10: The client group layer is deleted

**Model tier:** most capable. Thirty-nine helpers with real callers in the sync and persistence paths, and
a `ReferenceError` here is swallowed by a `try/catch` rather than shown.

**Files:**
- Modify: `public/app.js` only (plus `APP_VERSION`), and `test/checkin-popups.test.js`

**Interfaces:**
- Consumes: a client that emits no group surface and sends no `p_group` (Task 9). Running this before Task 9 throws on the first walk-up registration.
- Produces: `detectPlayersSchema` with no `group` probe and no `HAS_GROUP`, and `updatePlayerFieldsSupabase` with no group block. Migration `0069` (Task 12) can then drop the column with nothing writing it.

- [ ] **Step 1: Read the layer and its outside callers**

```bash
cd "$WT"
sed -n '38,48p;58,96p' public/app.js          # the constants, computeCheckedInByGroup, normalizeActiveGroupSelection
sed -n '984,1310p' public/app.js              # the helper block, top to bottom
sed -n '1544,1575p' public/app.js             # the catalog sync queue
sed -n '4693,4700p;4784,4790p' public/app.js  # the sync-mode label and getAvailableGroups
sed -n '5196,5205p;5255,5290p' public/app.js  # loadLocal and saveLocal's group work
sed -n '5300,5312p;5360,5370p' public/app.js  # mergePlayersAfterSync's group work
sed -n '5505,5530p' public/app.js             # syncFromSupabase's group work
sed -n '5705,5772p' public/app.js             # detectPlayersSchema and updatePlayerFieldsSupabase
sed -n '5773,5975p' public/app.js             # the six catalog RPC helpers and the two backfills
sed -n '6066,6076p;10018,10028p' public/app.js # the two backfill call sites
```

- [ ] **Step 2: Write the failing test**

Append to `test/checkin-popups.test.js`:

```js
describe('Task 10: the client group layer is gone', () => {
  const clientSrc = stripComments(appSrc) + '\n' + stripComments(mgSrc);
  const GONE = [
    'LS_GROUPS_KEY', 'LS_ACTIVE_GROUP_KEY', 'UNGROUPED_FILTER_VALUE', 'UNGROUPED_FILTER_LABEL',
    'GROUP_CATALOG_NAME_PREFIX', 'GROUPS_TAG_PREFIX', 'HAS_GROUP',
    'computeCheckedInByGroup', 'normalizeActiveGroupSelection', 'normalizeGroupName', 'normalizeGroupKey',
    'toGroupCatalogRowName', 'parseGroupCatalogRowName', 'serializePlayerGroupsTag', 'parsePlayerGroupsTag',
    'parseRemotePlayerGroupDetails', 'mergeRemoteGroupCatalogIntoState', 'normalizeGroupList',
    'getPlayerGroups', 'getPlayerPrimaryGroup', 'playerBelongsToGroup', 'isPlayerUngrouped',
    'sanitizePlayersAgainstAllowedGroups', 'enforceCanonicalGroupState', 'persistCanonicalGroupCache',
    'normalizePlayerGroupShape', 'normalizePlayerGroupsInState', 'parseEditGroupsValue',
    'getEditGroupsFromRow', 'renderEditGroupChipsMarkup', 'updateEditRowGroupUI',
    'computeGroupCatalogSyncSignature', 'queueGroupCatalogSync', 'runQueuedGroupCatalogSync',
    'getSharedGroupSyncModeLabel', 'getAvailableGroups', 'listGroupCatalogRowsSupabase',
    'ensureGroupCatalogEntrySupabase', 'renameGroupCatalogEntrySupabase', 'ensureGroupCatalogEntriesSupabase',
    'deleteGroupCatalogEntrySupabase', 'backfillGroupCatalogToSupabase', 'backfillPlayerMembershipsToSupabase',
  ];

  it('every group helper is gone from both client scripts, declaration and callers', () => {
    const left = GONE.filter((name) => clientSrc.includes(name));
    expect(left).toEqual([]);
  });

  it('state carries no group list and no active group', () => {
    expect(clientSrc).not.toContain('state.groups');
    expect(clientSrc).not.toContain('state.activeGroup');
  });

  it('the schema probe no longer asks for a column that is about to be dropped', () => {
    const s = slice(appSrc, 'function detectPlayersSchema()', 'async function updatePlayerFieldsSupabase(');
    expect(s).not.toContain("select('group')");
    expect(s).toContain("select('tag')");
  });

  it('updatePlayerFieldsSupabase writes only the fields a caller passes', () => {
    const s = slice(appSrc, 'async function updatePlayerFieldsSupabase(', 'async function listGroupCatalogRowsSupabase(');
    expect(s).not.toContain('canonicalGroups');
    expect(s).not.toContain('payload.group');
    expect(s).toContain('const payload = { ...(fields || {}) };');
  });
});
```
`listGroupCatalogRowsSupabase` is one of the deleted names, so the last slice's upper bound moves. Read
`grep -n "^async function" public/app.js | sed -n '/updatePlayerFieldsSupabase/,+1p'` after the deletion and
use whatever declaration now follows it as the bound.

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd "$WT/test" && npx vitest run checkin-popups.test.js
```
Expected: the first case FAILS listing all 43 names.

- [ ] **Step 4: Delete leaf-first, re-grepping after every removal**

The order matters: a helper whose only remaining caller is another helper in this list can be deleted the
moment that caller goes. Work the list from the surface inwards, and after each removal run:

```bash
cd "$WT" && grep -n "\b<name>\b" public/app.js public/manage.js public/pure.js public/checkin.html
```
Only `0` hits allows the next name. `node --check public/app.js` after every group of removals.

Order, with the outside callers each one has today:

1. `backfillPlayerMembershipsToSupabase` (`:5928`) and `backfillGroupCatalogToSupabase` (`:5906`). Two call sites: `forceSaveAllToSupabase`'s summary (`:6071-6072`, delete both lines, then `grep -n "catalogSynced\|membershipsBackfilled" public/app.js` and delete every remaining hit including the summary initializer), and the boot block at `:10021-10025`, whose whole `if (synced && canRunAdminSharedBackfill()) { ... }` becomes empty and is deleted with it. `canRunAdminSharedBackfill` STAYS: `saveLocal` still calls it (`:5270`).
2. The five catalog RPC helpers: `deleteGroupCatalogEntrySupabase`, `renameGroupCatalogEntrySupabase`, `ensureGroupCatalogEntriesSupabase`, `ensureGroupCatalogEntrySupabase`, `listGroupCatalogRowsSupabase` (`:5773-5904`). Their callers were deleted in Task 9.
3. `runQueuedGroupCatalogSync`, `queueGroupCatalogSync`, `computeGroupCatalogSyncSignature` (`:1544-1575`). `queueGroupCatalogSync`'s caller is `saveLocal` (`:5272`): delete that line, and check `saveLocal`'s surrounding `try` still has a body.
4. `getSharedGroupSyncModeLabel` (`:4693`): one caller, delete it and the sentence it appended.
5. `getAvailableGroups` (`:4784`): callers at `:93` (inside `normalizeActiveGroupSelection`, deleted below), `:1173` (`persistCanonicalGroupCache`, deleted below), `:1547` (`computeGroupCatalogSyncSignature`, already gone) and `:5911` (already gone).
6. `updateEditRowGroupUI`, `renderEditGroupChipsMarkup`, `getEditGroupsFromRow`, `parseEditGroupsValue` (`:1232-1300`): the card's group chips, whose only callers left with the hidden inputs in Task 9.
7. `normalizePlayerGroupsInState` (`:1198`) and `enforceSharedPlayerModelParity` (`:1206`): callers at `:1141`, `:1145`, `:5200`, `:5278-5280`, `:5511-5513`, `:5733`, `:5964`. Delete each call; `enforceSharedPlayerModelParity` guards `normalizeCheckedInEntries` at `:5734`, so that one line moves OUT of the guard and runs unconditionally (`state.checkedIn = normalizeCheckedInEntries(state.checkedIn);`).
8. `persistCanonicalGroupCache` (`:1171`), `enforceCanonicalGroupState` (`:1134`) with its callers at `:5261-5263` and `:5516-5523`, `sanitizePlayersAgainstAllowedGroups` (`:1112`), `normalizePlayerGroupShape` (`:1178`).
9. `isPlayerUngrouped` (`:1108`), `playerBelongsToGroup` (`:1102`), `getPlayerPrimaryGroup` (`:1097`), `getPlayerGroups` (`:1087`) with its remaining callers at `:5308`, `:5365-5366` and `:5937` (all inside code deleted above or in Task 9; re-grep before touching), `normalizeGroupList` (`:1073`).
10. `mergeRemoteGroupCatalogIntoState` (`:1061`), `parseRemotePlayerGroupDetails` (`:1037`), `parsePlayerGroupsTag` (`:1024`), `serializePlayerGroupsTag` (`:1009`), `parseGroupCatalogRowName` (`:998`), `toGroupCatalogRowName` (`:992`), `normalizeGroupKey` (`:988`), `normalizeGroupName` (`:984`).
11. `computeCheckedInByGroup` (`:58`), `normalizeActiveGroupSelection` (`:87`), and the six constants at `:38-39` and `:45-48`.
12. `state.groups` and `state.activeGroup`: their reads and writes at `:5233`, `:5250`, `:5258-5266`, `:5287`, `:7469` and `:9618`, plus their keys in the state initializer (`grep -n "groups:\s*\[" public/app.js` and `grep -n "activeGroup" public/app.js`).

- [ ] **Step 5: Change the two that survive**

`detectPlayersSchema` (`:5711`) loses its group probe and `HAS_GROUP`:

```js
// Detect whether the 'players' table still carries the legacy 'tag' column. The 'group' probe went with
// the groups removal (2026-08-29): migration 0069 drops that column, so asking for it would only ever log
// an error. HAS_TAG stays until players.tag is decided (spec section 10).
let HAS_TAG = false;
let PLAYERS_SCHEMA_DETECTED = false;

async function detectPlayersSchema() {
  if (!supabaseClient) return;
  HAS_TAG = false;
  try {
    const { error } = await supabaseClient.from('players').select('tag').limit(1);
    HAS_TAG = !error;
  } catch {}
  PLAYERS_SCHEMA_DETECTED = true;
  state.checkedIn = normalizeCheckedInEntries(state.checkedIn);
}
```
Then `grep -n "HAS_GROUP" public/app.js` and fix every remaining hit: `:1208`, `:1210`, `:4695-4696` (both
inside functions deleted above), `:5430-5431` (the `if (!HAS_GROUP && !HAS_TAG)` guard becomes
`if (!HAS_TAG)`), `:5440` (`if (HAS_GROUP) playerCols.push('group');` deleted), `:6034` (the
`insertPayload.tag = HAS_GROUP ? ...` ternary collapses to whatever the `HAS_TAG` branch produced).

`updatePlayerFieldsSupabase` (`:5738`) loses the whole group block (`:5744-5761`):

```js
async function updatePlayerFieldsSupabase(id, fields) {
  if (!supabaseClient || !id) return false;
  // Groups left the product (2026-08-29), so the only fields any caller passes are name, skill and
  // claimed_by_profile. No column is derived here any more.
  const payload = { ...(fields || {}) };
  try {
    const { error } = await supabaseClient.from('players').update(payload).eq('id', id);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase update error', e);
    return false;
  }
}
```

Bump `APP_VERSION` to `'2026.08.29.9'`.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cd "$WT" && node --check public/app.js && node --check public/manage.js \
  && cat public/manage.js public/app.js > "$SCRATCH/concat.js" && node --check "$SCRATCH/concat.js"
grep -rn "HAS_GROUP\|state.groups\|state.activeGroup\|GroupCatalog\|getPlayerGroups" public/ || echo "clean"
cd "$WT/test" && npx vitest run 2>&1 | tail -4
```
Expected: `clean`, then 41 files, 1297 tests (1293 + 4), all green, with `test/supabase-writes.test.js`
(whose NF-2 scan covers both client files since `61ef27e`) still green.

- [ ] **Step 7: Commit**

```bash
cd "$WT"
git add public/app.js test/checkin-popups.test.js
git commit -m "refactor(groups): the client group layer is deleted, and the schema probe stops asking for the column - v2026.08.29.9"
```

---

## Task 11: Ship the client and drive it (controller, inline)

**Model tier:** standard. No code; judgment about evidence.

**Files:**
- Modify: nothing. This task pushes and observes.

**Interfaces:**
- Consumes: Tasks 2 to 10 on `checkin-popups`, and migration `0068` already applied (Task 1).
- Produces: the served `APP_VERSION` and the drive record `$SCRATCH/drive-checkin.md`. Task 12 is not allowed to run until both exist.

- [ ] **Step 1: Final checks on the branch**

```bash
cd "$WT"
node --check public/app.js && node --check public/manage.js \
  && cat public/manage.js public/app.js > "$SCRATCH/concat.js" && node --check "$SCRATCH/concat.js"
(cd test && npx vitest run 2>&1 | tail -4)      # 41 files, 1297 tests, green
grep -rn "p_group\|CLUB_GROUP\|ckx-gp\|mgp-gp\|mgp-mg\|HAS_GROUP" public/ || echo "clean"
grep -n "APP_VERSION" public/app.js | head -1   # '2026.08.29.9'
git log --oneline main..checkin-popups
```

- [ ] **Step 2: Merge and push (only after C102 has shipped on main)**

```bash
cd "C:/Users/OlasM/OneDrive/Athletic Specimen App"
git log --oneline -1                       # C102's ship commit must be here first
git merge --no-ff checkin-popups -m "feat(checkin): the check-in pop-ups round (card, pencil, add player, groups removed from the client)"
node --check public/app.js && node --check public/manage.js
(cd test && npx vitest run 2>&1 | tail -4)
git push origin main
sleep 60
curl -s https://athletic-specimen.com/app.js | grep -o "APP_VERSION = '[^']*'"
```
The merge waits for C102 because this round changes five Manage builders on purpose, and C102's
equivalence diff has to have run clean on an unmodified `main` first.

- [ ] **Step 3: The facts-only drive at 390 and 1280, signed in as the owner**

Every row of the spec's §7.4 is walked and recorded in `$SCRATCH/drive-checkin.md`. The first fact is
`document.visibilityState`, per the banked lesson. Zero console errors throughout.

1. Tap the pencil on an out row: the card opens, the row is NOT toggled. Tap the row: it toggles.
2. The status button flips label, icon and header pill. Cancel: the roster is unchanged.
3. Save with a status change: the Network panel shows exactly one `check_in` or `check_out`. Save with no status change: none.
4. Scroll the list halfway, edit a row, save: the scroll holds, the row flashes once, the strip reads "{name} updated" with no UNDO. Tap a row: the strip reads "{name} checked in" WITH an UNDO, and it works.
5. Open an unrated player: the field is blank with the `–` placeholder. Save. The row still reads `–` and reopening shows blank.
6. Keyboard: Tab to a pencil, Enter opens, Escape closes, focus is back on that pencil. Enter in First name saves.
7. Add player: a one-word name is refused in the card; a duplicate name is refused WITHOUT closing and the typed rating survives; a good name adds a row under "Still out" with the counts up by one and the strip "{name} added". Add one checked in: strip "{name} added · checked in", row under "Checked in", and the rating survives a background sync.
8. The pencil is legible on a checked-in row at 390.
9. The close × sits in the same pixel column with and without the IN pill. Open the Home rules sheet: its × is still hard right with the eyebrow and title intact.
10. The public kiosk: two same-name players render as identical rows, no crew line, no rating.
11. `public/checkin.html` at the venue URL: a registration succeeds against the still-3-argument function.
12. A true 390 capture of the console with the pencils and the pill visible, which the handoff still owes (`screenshots/08` is a ~462px viewport at 2x).

- [ ] **Step 4: Confirm the served version before releasing Task 12**

```bash
curl -s https://athletic-specimen.com/app.js | grep -o "APP_VERSION = '[^']*'"   # 2026.08.29.9
```
In Mike's Chrome, Application tab: the cache name carries `2026.08.29.9` and lists `/manage.js`. Only then
is Task 12 released. A `0069` applied while an older client is being served would break every registration
door at once.

---

## Task 12: Migration `0069`, the drop

**Model tier:** most capable. Irreversible, on a live roster, with an anon grant that vanishes silently.

**Files:**
- Create: `db/migrations/0069_drop_player_groups.sql`
- Modify: nothing else. No `APP_VERSION` bump.

**Interfaces:**
- Consumes: `0068` applied (Task 1), and the client of Task 11 deployed and driven.
- Produces: `register_player(text, boolean)` as the only overload, and a `players` table with no `group` column.

- [ ] **Step 1: Read what `0069` has to sweep**

```bash
cd "$WT"
sed -n '1,12p' db/migrations/0010_c21_skill_anon_revoke.sql   # the anon COLUMN grant naming "group"
sed -n '10,16p' db/migrations/0012_c22_dedup_index_fix.sql    # players_real_name_group_uidx
sed -n '10,20p' db/migrations/0015_c22_attendance_sessions.sql # attendance_sessions has its own "group": leave it
sed -n '1,30p'  db/migrations/0017_c22_groups_table.sql       # the table, its index, its policies, its grants
sed -n '15,20p' db/migrations/0007_c21_rpc_check_out_and_register_flag.sql  # the (text,text) overload already dropped
```

- [ ] **Step 2: Write the migration**

Create `db/migrations/0069_drop_player_groups.sql` with exactly this content:

```sql
-- 0069_drop_player_groups.sql: groups leave the product.
--
-- Mike (2026-08-29): "remove the groups from the app, we dont even use it." Groups were a second, unused
-- way to organize ONE roster. They cost every list a subline, the players list a "N groups" counter, the
-- edit card a hidden field it had to carry so a name fix would not wipe membership, and register_player a
-- parameter every caller had to pass. 0068 already emptied the column and made the function group-blind,
-- and the client that emits and sends nothing group-shaped has been deployed and driven since. This file
-- removes the structures with nothing left depending on them. Same expand then contract shape 0017 and
-- 0018 used for the catalog, whose own header records that 0018 waited for a deployed, verified app.
--
-- WHAT GOES:
--   1. the `groups` catalog table (0017), with its unique index, its two RLS policies and its grants,
--      which DROP TABLE sweeps. No inbound FK exists; 0035 only added community_id to it (outbound).
--   2. players."group", and with it the anon COLUMN-level select grant that names it
--      (0010_c21_skill_anon_revoke.sql:9, `grant select (id, name, checked_in, tag, "group")`). Postgres
--      removes a column's ACL with the column, so this will not error, but it is a real object and the
--      rollback has to re-issue it.
--   3. the normalize trigger and its trigger function (0020).
--   4. the group term in the dedup unique index (0011/0012): it narrows to name only.
--   5. register_player's p_group parameter and the "group" column it returned. The three-argument overload
--      is DROPPED, not left standing beside the new one: PostgREST resolves an overload by the argument
--      names the caller sends, so two live signatures would let a stale cached client keep registering
--      into a column that no longer exists. The older two-argument (text,text) form was already dropped at
--      0007:19, for the same reason.
--
-- WHAT STAYS: tournaments."group" (0003) and attendance_sessions."group" (0015), two different columns on
-- two different tables. players.tag is not touched here; the client stops writing group JSON into it in the
-- same release, and the column's fate is an open item on this round's spec.
--
-- Dedup narrows from (name, group) to name. Mike, same day, on the kiosk's same-name rows: "thats almost
-- impossible to have the same full name, just leave it." 0068 STEP 1 already proved zero duplicate names.
--
-- **Before this file runs, `select id, name, "group" from public.players where "group" is not null;` has
-- already been captured verbatim into the round's history file at 0068 STEP 2. That capture is the ONLY
-- record of the group values that exists after this commit; the rollback below restores empty structures
-- and needs that file to put values back.**
--
-- ROLLBACK: re-run 0017's create table, unique index, policies and grants (skip its backfill, the source
--   rows are gone); `alter table public.players add column "group" text;`; re-issue
--   `grant select (id, name, checked_in, tag, "group") on public.players to anon;` (0010:9), without which
--   a rolled-back anon door 403s on any query naming the column; re-apply
--   0020_group_null_normalize.sql verbatim (the trigger function, the trigger and the three-argument
--   register_player); `drop index if exists public.players_real_name_uidx;` and recreate
--   players_real_name_group_uidx from 0012:12-14; then restore the VALUES from the 0068 STEP 2 capture.
--
-- APPLIED <yyyy-mm-dd> via the Supabase MCP (apply_migration), the check-in pop-ups round.

-- the dedup index carries the column, so it goes first
drop index if exists public.players_real_name_group_uidx;
create unique index if not exists players_real_name_uidx
  on public.players (lower(btrim(name)))
  where left(name, 5) <> '__as_';

-- 0020's group-normalizing trigger has nothing left to normalize
drop trigger if exists players_normalize_group on public.players;
drop function if exists public.tg_players_normalize_group();

-- register_player without p_group. Body is 0068's minus the ignored parameter and the "group" return
-- column; the insert still writes skill 0, so a rated new player takes a second write from the client
-- (updatePlayerFieldsSupabase). create or replace on a NEW signature creates a NEW function with no
-- inherited ACL, hence the revoke/grant pair below.
create or replace function public.register_player(p_name text, p_checked_in boolean default false)
returns table(id uuid, name text, checked_in boolean)
language plpgsql security definer set search_path to 'public' as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_id   uuid;
  v_actor text; v_role text; v_grp text;
begin
  if v_name = '' then raise exception 'name required'; end if;
  if length(v_name) > 80 then raise exception 'name too long (max 80)'; end if;

  select pl.id into v_id from public.players pl
    where lower(btrim(pl.name)) = lower(v_name)
      and left(pl.name, 5) <> '__as_'
    limit 1;

  if v_id is null then
    begin
      insert into public.players(name, skill, checked_in)
        values (v_name, 0, coalesce(p_checked_in, false))
        returning players.id into v_id;
      select a.actor, a.role, a.grp into v_actor, v_role, v_grp from public._audit_actor() a;
      insert into public.action_log(actor, role, grp, action, entity_type, entity_id, detail)
        values (v_actor, v_role, v_grp, 'register', 'players', v_id::text, v_name);
    exception when unique_violation then
      select pl.id into v_id from public.players pl
        where lower(btrim(pl.name)) = lower(v_name)
          and left(pl.name, 5) <> '__as_'
        limit 1;
    end;
  end if;

  if coalesce(p_checked_in, false) then
    update public.players set checked_in = true where players.id = v_id;
    insert into public.check_ins(session_id, player_id)
      values (public.current_session_id(), v_id)
      on conflict (session_id, player_id) do nothing;
  end if;

  return query
    select pl.id, pl.name, pl.checked_in from public.players pl where pl.id = v_id;
end $$;
revoke all on function public.register_player(text, boolean) from public;
grant execute on function public.register_player(text, boolean) to anon, authenticated;

-- the old signature, gone in the same batch as the column it wrote
drop function if exists public.register_player(text, text, boolean);

alter table public.players drop column if exists "group";

drop table if exists public.groups;
```

No `begin;` / `commit;` wrapper, for the same reason `0068` has none: only 4 of the 68 files present use
one, and `apply_migration` already wraps the statement batch.

- [ ] **Step 3: Commit the file (do NOT apply it)**

```bash
cd "C:/Users/OlasM/OneDrive/Athletic Specimen App"
git add db/migrations/0069_drop_player_groups.sql
git commit -m "db(checkin): 0069 drops players.group, the groups table and register_player's p_group"
```

- [ ] **Step 4: The controller applies it and records the read-backs (controller only)**

Through the Supabase MCP, project `mlzblkzflgylnjorgjcp`. `0068` STEP 1's duplicate gate already ran, so
there is no pre-flight here. `apply_migration` with the file's DDL, then the eight read-backs from the
spec's §5.5, every result pasted into `$SCRATCH/0069-readbacks.md`:

```sql
select count(*) from information_schema.columns
  where table_schema='public' and table_name='players' and column_name='group';        -- 0
select to_regclass('public.groups');                                                   -- null
select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='register_player';                            -- exactly register_player(text,boolean)
select indexdef from pg_indexes where schemaname='public' and indexname='players_real_name_uidx';
select count(*) from public.players where left(name,5) <> '__as_';                     -- unchanged
select * from public.register_player('Zz Smoketest', false);
select * from public.register_player('Zz Smoketest', false);                           -- same id
delete from public.players where lower(btrim(name)) = lower('Zz Smoketest');
select privilege_type, column_name from information_schema.column_privileges
  where table_name='players' and grantee='anon';                                       -- id, name, checked_in, tag; no group
```
plus `get_advisors` for security and performance, which must show no class that was not there before.

- [ ] **Step 5: The short second drive**

In Mike's Chrome: one kiosk registration through `public/checkin.html`, one Add player from the console
card, one card save with a status change, and one row tap with its UNDO. Zero console errors, zero 4xx in
the Network panel. Then stamp the `APPLIED` line in the file and commit that one-line change.

- [ ] **Step 6: Answer the two open reads while the connection is open**

```sql
select count(*) from public.players where tag is not null;   -- decides whether players.tag gets a 0070
select id, name from public.groups order by name;            -- run BEFORE the drop, saved beside the 0068 capture
```
The second must be run before step 4's `drop table`. Both answers go into the history file, and the
`players.tag` question goes to Mike with the count in hand.

---

## Task 13: Write-back (controller, inline)

**Model tier:** standard.

**Files:**
- Modify: the vault at `C:/Ai Master/Projects/Athletic Specimen/`

- [ ] **Step 1: The history file BEFORE any completion mark (§30)**

`12-history/task-#<id>-checkin-popups-handoff.md`, frontmatter matching
`task-#6-c102-manage-extraction-boot-session18.md`, sections: what shipped (versions `2026.08.29.1` to
`.9`, the commits, the two migration numbers), process (Mike's zip, the recon digest, the spec's 17-finding
edit pass, the two-migration split the Critical forced, subagent-driven build on a worktree branch),
verification (the suite counts per task, the two mutation proofs, the read-backs, the two drives), and
**the `0068` STEP 2 group capture pasted in full**, which is the only surviving record of the values.

- [ ] **Step 2: Archive the instruments**

Copy to `12-history/assets/`: `$SCRATCH/DIGEST.md` as `2026-08-29-checkin-popups-recon-digest.md`,
`$SCRATCH/spec-review.md` as `2026-08-29-checkin-popups-spec-review.md`, `$SCRATCH/0068-group-capture.md`,
`$SCRATCH/0068-readbacks.md`, `$SCRATCH/0069-readbacks.md`, `$SCRATCH/drive-checkin.md`, and the SDD ledger.

- [ ] **Step 3: The state files**

`01-state/log.md`: one entry at the top. `01-state/current.md`: the round marked done with its facts.
`01-state/NOW.md`: the latest paragraph and the next action. `01-state/decisions.md`: append to the
2026-08-29 entry the rulings made during the build, each in one sentence: the two-migration split and why
one file could not do it (the dedup key, not the signature); the stepper's empty-field direction taken from
the handoff's code over its prose; focus on open goes to the dialog and never to a field; a duplicate name
keeps the add card open rather than reopening an edit card. `01-state/debugging.md`: a new entry, "Symptom:
one person becomes two rows after a client stops sending an RPC argument", with the dedup-key facts and the
empty-the-column-first fix. `01-state/Tasks From Claude.md`: the row marked done, and a new row for the
`players.tag` decision.

- [ ] **Step 4: Hand back**

The end-flight message with an `AskUserQuestion`, exactly one option marked Recommended and listed first.

---

## Self-review

**Spec coverage, requirement by requirement.**
Surface A: A1 Task 6, A2 Task 8, A3 Task 7, A4 Task 7, A5 Task 8, A6 Task 9.
Surface B: B1 Task 2, B2 Task 3, B3 Task 3, B4 Task 4, B5 Task 5, B6 Tasks 7 and 8, B7 Tasks 3 and 7,
B8 Task 9.
Surface C: C1 Tasks 6 and 8 (the pencil branch in 6, the `[data-mgck-new]` branch with the pill and the
opener that make it reachable in 8), C2 Task 9.
Surface D: D1, D2, D3 all Task 9. Surface E: E1, E2, E3 all Task 9. Surface F: Task 9. Surface G: Task 10.
Spec §5: `0068` Task 1, `0069` Task 12, the caller table's five rows land at Tasks 8 (`mgckAddFromCard`,
`flushOutbox`) and 9 (`mgckAddAndCheckIn`, the in-app kiosk, `checkin.html`), matching §5.4 exactly.
Spec §6's "must not reopen" table: every row has a guard in the task that creates its risk, and the three
rows that can only be seen live (the pencil's legibility, the single RPC, the × column) are in Task 11's
drive. Spec §7.3's table maps one-to-one onto the tests in Tasks 2 to 10; §7.4's eleven drive facts are
Task 11 Step 3's twelve numbered checks (the eleventh row splits into the kiosk and the standalone page).
§7.5's mutation proofs are Task 7 Step 9 and Task 9 Step 8; the third, the no-autofocus guard, is Task 3's
fourth case, which is proven red by adding `.select()` back and is called out there. Spec §8's fourteen
tasks are these fourteen, unchanged in order, with T0's marker minting moved into the controller's own
steps because an implementer never mints a §38 marker. Spec §10's open items: `players.tag` and the
`groups` catalog rows are both read in Task 12 Step 6; the watermark, the focus call and the focus trap are
Task 11 drive observations.

**Placeholder scan.** Every code step carries the code it asks for, both migrations included: Task 1 and
Task 12 each hold their whole `.sql` file inline rather than pointing at the spec. Three places read a
value at execution time by design, and each says exactly what to read and what to do with it: Task 7 Step 5
greps for `let mgckLast` rather than citing a line Task 6 may have moved; Task 10 Step 2's last slice bound
is read after the deletion, because the function it names is one of the deleted ones; Task 10 Step 4 is an
ordered delete-and-grep loop with a hard zero-hit gate per name, which is a procedure and not a
placeholder. No step says "similar to", "TBD" or "add validation".

**Type and name consistency across tasks.** `peMode`, `peOrigin` and `peReturnKey` are declared in Task 3
and read by Tasks 5, 7 and 8; Task 8 is the only task that changes `openPlayerEditPopup`'s signature, and
it states the before and after. `peSkillStep` (Task 4), `peInPillNode` (Task 5) and `openPlayerAddPopup`
(Task 8) live in `app.js`; `mgckNotice`, `mgckCardNotice` and `mgckAddFromCard` (Tasks 7 and 8) live in
`manage.js`; the two sets are disjoint, which C102's own guard test re-proves on every task's suite run.
`data-mgck-edit` carries the identity key in Task 6 and is re-queried by exactly that attribute in Task 7's
`closePlayerEditPopup`; `data-mgck-id` carries the same key and is re-queried by `mgckCardNotice`. The
bridge grows in one file only, `test/checkin-popups.test.js`, and each task names the lines it adds. The
version sequence is `.1` Task 2, `.2` Task 3, `.3` Task 4, `.4` Task 5, `.5` Task 6, `.6` Task 7, `.7`
Task 8, `.8` Task 9, `.9` Task 10, with Tasks 1 and 12 committing SQL and no bump.

**Two things this plan deliberately does not do.** It adds no DOM environment, so six behaviours the spec
lists are drive facts rather than tests, named in Task 11 Step 3 rather than left implied. And it does not
touch `public/styles.css:6043-6076`, the 2026-08-23 button block, which `test/manage-round.test.js:509-513`
pins and which Tasks 3 and 4 are told to leave alone.
