# NF-1 Per-Phase Scoring (pool 15/cap20, bracket host-picks/no-cap, win-by-2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (inline, with checkpoints — this ships to a LIVE app). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the single cosmetic `tournaments.match_cap` with a real per-phase scoring model — pool plays to a target with a hard cap, bracket plays to a host-chosen target with no cap, win-by-2 everywhere — enforced in the pure layer, the create flow, AND the `submit_match_score` RPC (the source of truth).

**Architecture:** A new pure helper `gameScoreStatus(scoreA, scoreB, rules)` in `pure.js` (vitest-tested) is the single rule. The DB gets per-phase columns on `tournaments` + the same rule ported into the `submit_match_score` SECURITY-DEFINER RPC. The create-tournament form lets the host pick the bracket target (no default — they must choose) with pool defaults pre-filled. The result modal reads the phase's rule to auto-fill + validate. `match_cap` is kept for backward-compat (old tournaments) and as the auto-fill fallback.

**Tech Stack:** Vanilla JS (`public/pure.js` classic script + vitest in `/test`), `public/app.js`, Postgres SECURITY-DEFINER RPC (`db/migrations/`), Supabase.

## Global Constraints (copied from the spec/decisions — every task inherits these)
- **Scoring model (Mike, 2026-06-26):** pool to **15**, hard cap **20**; bracket = host **FORCED to pick** the target at create (NO default — 21/25/custom); bracket **no cap**; **win-by-2** everywhere; fully host-customizable (the full per-event console is UP-10, later — NF-1 ships the model + enforcement + the minimal "host picks bracket target" create change).
- **win-by-2 + hard cap interaction:** must win by ≥2 UNTIL the cap; at the cap a 1-point win is allowed (cap overrides win-by-2). No cap → win-by-2 with no upper bound. `MAX_SCORE=99` still rejects fat-fingers.
- **Deploy ritual (every shipping step):** bump `APP_VERSION` (`app.js` ~27) + `SW_VERSION` (`sw.js` ~3) lockstep · `node --check public/app.js` · `cd test && npx vitest run` · live-verify · `git push` (Vercel auto-deploys). `partialRender()` for background syncs, `render()` only for user actions.
- **§38 gate:** any edit to `public/{app.js,*.html,*.css}` is hard-blocked until cleared. The create-form UI change (Task 4) needs **3 distinct localhost layouts** shown OR an exempt mark; `pure.js` + `sw.js` + migrations are NOT §38-blocked.
- **No emoji; direction-A tokens; mobile-first.** Auth deferred — the RPC stays the only anon write path (SECURITY DEFINER under locked RLS).
- **RPC has NO automated test harness (OUT-10):** verify the migration on a SYNTHETIC tournament against the prod DB, then clean it up. Never run against real tournament data.
- **LEGACY GATING (safety — added during build):** enforcement (target/cap/win-by-2) applies ONLY to tournaments created with the NEW model (the relevant `pool_target`/`bracket_target` column is set). Legacy tournaments (only `match_cap`) keep the OLD behavior — NO retroactive win-by-2 — so an in-flight legacy event's scoring never changes underneath it. Applies in BOTH the RPC (Task 2) and the client pre-check (Task 3).

## File Structure
- `public/pure.js` — add `gameScoreStatus()` + `scoringRulesFor(phase, tournament)` (pure, vitest-tested). The one rule both the client and (mirrored) the RPC enforce.
- `test/pure.test.js` — new tests for the rule (red→green).
- `db/migrations/0025_nf1_per_phase_scoring.sql` — add columns to `tournaments` + update `submit_match_score` to enforce the rule.
- `public/app.js` — create form (host picks bracket target), `tdbCreateTournament`, the result modal auto-fill/validate, the active-tournament header label.
- `public/sw.js` — `SW_VERSION` bump (lockstep).

---

### Task 1: Pure scoring rule — `gameScoreStatus` + `scoringRulesFor`

**Files:**
- Modify: `public/pure.js` (after `validateScores`, ~line 205)
- Test: `test/pure.test.js`

**Interfaces:**
- Produces: `scoringRulesFor(phase, tournament) -> { target:int, cap:int|null, winBy2:bool }` (phase `'pool'|'main'`; reads `pool_target/pool_cap/bracket_target/bracket_cap/win_by_2`, falling back to `match_cap` for legacy rows).
- Produces: `gameScoreStatus(scoreA, scoreB, rules) -> { decided:bool, valid:bool, winner:'A'|'B'|null, reason:string }`. `valid` = the entered final score is a legitimately-completed game per the rules; `reason` is the user-facing message when not.

- [ ] **Step 1: Write the failing tests**

```js
// in test/pure.test.js (add a new describe block; pure.js fns are global via the CommonJS guard)
describe('gameScoreStatus (NF-1 per-phase scoring)', () => {
  const pool = { target: 15, cap: 20, winBy2: true };
  const bracket = { target: 21, cap: null, winBy2: true };

  test('pool: reach target by 2 is valid', () => {
    expect(gameScoreStatus(15, 13, pool)).toMatchObject({ valid: true, decided: true, winner: 'A' });
  });
  test('pool: target reached but only by 1 is NOT valid (must win by 2)', () => {
    expect(gameScoreStatus(15, 14, pool)).toMatchObject({ valid: false, decided: false });
  });
  test('pool: extend past target until win-by-2 within cap is valid', () => {
    expect(gameScoreStatus(17, 15, pool)).toMatchObject({ valid: true, winner: 'A' });
  });
  test('pool: at the hard cap a 1-point win is valid (cap overrides win-by-2)', () => {
    expect(gameScoreStatus(20, 19, pool)).toMatchObject({ valid: true, winner: 'A' });
  });
  test('pool: above the hard cap is NOT valid', () => {
    expect(gameScoreStatus(21, 19, pool)).toMatchObject({ valid: false });
  });
  test('pool: below target is NOT valid', () => {
    expect(gameScoreStatus(14, 5, pool)).toMatchObject({ valid: false });
  });
  test('bracket: to 21, 21-19 valid, 21-20 invalid, 25-23 valid (no cap)', () => {
    expect(gameScoreStatus(21, 19, bracket)).toMatchObject({ valid: true, winner: 'A' });
    expect(gameScoreStatus(21, 20, bracket)).toMatchObject({ valid: false });
    expect(gameScoreStatus(25, 23, bracket)).toMatchObject({ valid: true, winner: 'A' });
  });
  test('tie is never decided', () => {
    expect(gameScoreStatus(15, 15, pool)).toMatchObject({ decided: false, winner: null });
  });
  test('scoringRulesFor reads new columns, falls back to match_cap for legacy', () => {
    expect(scoringRulesFor('pool', { pool_target: 15, pool_cap: 20, win_by_2: true })).toEqual({ target: 15, cap: 20, winBy2: true });
    expect(scoringRulesFor('main', { bracket_target: 25, bracket_cap: null, win_by_2: true })).toEqual({ target: 25, cap: null, winBy2: true });
    expect(scoringRulesFor('main', { match_cap: 21 })).toMatchObject({ target: 21, cap: null }); // legacy fallback
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd test && npx vitest run`
Expected: FAIL — `gameScoreStatus is not defined` / `scoringRulesFor is not defined`.

- [ ] **Step 3: Implement the minimal rule in `public/pure.js`**

```js
// NF-1: per-phase scoring rule (pool target+hard-cap, bracket target+no-cap, win-by-2).
// Win-by-2 applies until the cap; AT the cap a 1-point win is allowed (cap overrides win-by-2).
function scoringRulesFor(phase, tournament) {
  const t = tournament || {};
  const legacy = Number(t.match_cap) || 25;
  const winBy2 = t.win_by_2 == null ? true : !!t.win_by_2;
  if (phase === 'main') {
    return { target: Number(t.bracket_target) || legacy, cap: (t.bracket_cap == null ? null : Number(t.bracket_cap)), winBy2 };
  }
  return { target: Number(t.pool_target) || legacy, cap: (t.pool_cap == null ? null : Number(t.pool_cap)), winBy2 };
}

function gameScoreStatus(scoreA, scoreB, rules) {
  const r = rules || {};
  const target = Number(r.target) || 0;
  const cap = (r.cap == null ? null : Number(r.cap));
  const winBy2 = r.winBy2 == null ? true : !!r.winBy2;
  const a = Number(scoreA), b = Number(scoreB);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) {
    return { decided: false, valid: false, winner: null, reason: 'Scores must be whole numbers (0 or more).' };
  }
  if (a === b) return { decided: false, valid: false, winner: null, reason: 'A game can\'t end in a tie.' };
  const winner = a > b ? 'A' : 'B';
  const w = Math.max(a, b), l = Math.min(a, b);
  const margin = w - l;
  const needed = winBy2 ? 2 : 1;
  // At the cap, a 1-point win is allowed; otherwise must reach target AND win by `needed`, not exceeding the cap.
  if (cap != null && w === cap && margin >= 1) return { decided: true, valid: true, winner, reason: '' };
  if (cap != null && w > cap) return { decided: false, valid: false, winner, reason: 'Above the cap of ' + cap + '. Recheck the score.' };
  if (w < target) return { decided: false, valid: false, winner, reason: 'The winner must reach ' + target + '.' };
  if (margin < needed) return { decided: false, valid: false, winner, reason: 'Must win by ' + needed + '.' };
  return { decided: true, valid: true, winner, reason: '' };
}
```

Add to the CommonJS export guard at the bottom of `pure.js` (alongside the existing exports): `scoringRulesFor, gameScoreStatus`.

- [ ] **Step 4: Run to verify pass**

Run: `cd test && npx vitest run`
Expected: PASS (all NF-1 cases + the existing 68 still green).

- [ ] **Step 5: Commit**

```bash
git add public/pure.js test/pure.test.js
git commit -m "feat(scoring): NF-1 pure per-phase scoring rule (target/cap/win-by-2)"
```

---

### Task 2: Migration 0025 — per-phase columns + enforce the rule in the RPC

**Files:**
- Create: `db/migrations/0025_nf1_per_phase_scoring.sql`
- Apply via the Supabase MCP `apply_migration` to project `mlzblkzflgylnjorgjcp`.

**Interfaces:**
- Consumes: the rule semantics from Task 1 (mirrored in PL/pgSQL).
- Produces: `tournaments.pool_target/pool_cap/bracket_target/bracket_cap/win_by_2`; an updated `submit_match_score` that rejects an out-of-rule final score.

- [ ] **Step 1: Write the migration**

```sql
-- 0025 NF-1: per-phase scoring (pool target+hard cap, bracket target+no cap, win-by-2),
-- enforced server-side in submit_match_score (the only anon write path). Back-compat: legacy
-- rows fall back to match_cap. Verified on a synthetic tournament 2026-06-26; test data cleaned.
alter table public.tournaments add column if not exists pool_target int;
alter table public.tournaments add column if not exists pool_cap int;
alter table public.tournaments add column if not exists bracket_target int;
alter table public.tournaments add column if not exists bracket_cap int;
alter table public.tournaments add column if not exists win_by_2 boolean not null default true;

create or replace function public.submit_match_score(
  p_match uuid, p_version int,
  p_score_a int default null, p_score_b int default null,
  p_winner_side text default null
) returns public.matches language plpgsql security definer set search_path=public as $$
declare m public.matches; t public.tournaments; updated public.matches; side text; win uuid; lose uuid; col text;
        is_gf boolean; wb_won_gf boolean; decisive boolean;
        v_target int; v_cap int; v_winby int; w int; l int;
begin
  select * into m from public.matches where id = p_match;
  if not found then raise exception 'match not found'; end if;
  if m.team_a_id is null or m.team_b_id is null then raise exception 'both teams are not set yet'; end if;
  if m.status = 'final' then raise exception 'already final'; end if;
  select * into t from public.tournaments where id = m.tournament_id;

  if p_score_a is not null and p_score_b is not null then
    if p_score_a < 0 or p_score_b < 0 then raise exception 'scores must be >= 0'; end if;
    if p_score_a = p_score_b then raise exception 'ties are not allowed'; end if;
    -- NF-1: enforce per-phase target / cap / win-by-2 — ONLY when the new model is set for this phase
    -- (v_target not null). Legacy rows (match_cap only) skip enforcement = old behavior, so an
    -- in-flight legacy tournament's scoring never changes under the migration.
    if coalesce(m.phase,'') = 'main' then v_target := t.bracket_target; v_cap := t.bracket_cap;
    else v_target := t.pool_target; v_cap := t.pool_cap; end if;
    if v_target is not null then
      v_winby := case when coalesce(t.win_by_2, true) then 2 else 1 end;
      w := greatest(p_score_a, p_score_b); l := least(p_score_a, p_score_b);
      if v_cap is not null and w > v_cap then raise exception 'above the cap of %', v_cap; end if;
      if not (v_cap is not null and w = v_cap) then
        if w < v_target then raise exception 'the winner must reach %', v_target; end if;
        if (w - l) < v_winby then raise exception 'must win by %', v_winby; end if;
      end if;
    end if;
    side := case when p_score_a > p_score_b then 'a' else 'b' end;
    if p_winner_side is not null and lower(p_winner_side) <> side then
      raise exception 'the winner does not match the scores'; end if;
  elsif lower(coalesce(p_winner_side,'')) in ('a','b') then
    side := lower(p_winner_side);
  else
    raise exception 'enter both scores or pick a winner';
  end if;

  if coalesce(m.phase,'') <> 'main' and (p_score_a is null or p_score_b is null) then
    raise exception 'pool games need both scores';
  end if;

  win  := case when side='a' then m.team_a_id else m.team_b_id end;
  lose := case when side='a' then m.team_b_id else m.team_a_id end;

  update public.matches set
    score_a = p_score_a, score_b = p_score_b,
    winner_team_id = win, loser_team_id = lose, status = 'final',
    version = m.version + 1, updated_at = now()
  where id = p_match and version = p_version and status <> 'final'
  returning * into updated;
  if not found then raise exception 'another device just updated this match — refresh'; end if;

  if m.phase = 'main' then
    is_gf := (m.side = 'grand_final' and m.round = 1);
    wb_won_gf := (is_gf and side = 'a');
    if m.winner_next_match_id is not null and not wb_won_gf then
      col := case when m.winner_next_slot = 1 then 'team_b_id' else 'team_a_id' end;
      execute format('update public.matches set %I = $1 where id = $2 and %I is null and status = ''scheduled''', col, col)
        using win, m.winner_next_match_id;
    end if;
    if m.loser_next_match_id is not null and not wb_won_gf then
      col := case when m.loser_next_slot = 1 then 'team_b_id' else 'team_a_id' end;
      execute format('update public.matches set %I = $1 where id = $2 and %I is null and status = ''scheduled''', col, col)
        using lose, m.loser_next_match_id;
    end if;
    decisive := (m.winner_next_match_id is null) or wb_won_gf;
    if decisive then
      update public.tournaments set status = 'completed', updated_at = now() where id = m.tournament_id;
    end if;
  end if;

  insert into public.action_log(actor, role, action, entity_type, entity_id, detail)
    values ('anon','public','submit_score', coalesce(m.phase,'pool')||'_match', p_match::text,
            coalesce(p_score_a::text,'-')||'-'||coalesce(p_score_b::text,'-')||' win:'||side);
  return updated;
end $$;

revoke all on function public.submit_match_score(uuid,int,int,int,text) from public;
grant execute on function public.submit_match_score(uuid,int,int,int,text) to anon, authenticated;
```

- [ ] **Step 2: Apply + verify on a synthetic tournament**

Apply via Supabase MCP `apply_migration` (name `0025_nf1_per_phase_scoring`). Then on a SYNTHETIC tournament with the NEW columns set (create one, do NOT touch `Friday Night 6s (TEST)` or real data): assert `submit_match_score` rejects 15-14 pool (must win by 2), accepts 15-13, rejects 21-19 pool (above cap 20), accepts 20-19 pool (at cap); for a bracket-to-21 match rejects 21-20, accepts 21-19 and 25-23. Confirm advancement still works on a valid score. **LEGACY CHECK (critical):** also assert a LEGACY-shaped synthetic tournament (only `match_cap`, target columns NULL) still scores the OLD way — e.g. a 15-14 pool game is ACCEPTED — proving enforcement does NOT apply retroactively. Clean up all synthetic tournaments.

- [ ] **Step 3: Commit**

```bash
git add db/migrations/0025_nf1_per_phase_scoring.sql
git commit -m "feat(scoring): NF-1 migration 0025 — per-phase columns + RPC enforcement"
```

---

### Task 3: Wire the result modal + tdbCreateTournament to the new rule (app.js — behavior, §38-EXEMPT)

**Files:**
- Modify: `public/app.js` — `capOf` + auto-fill in `openBracketResultModal` (~3694-3744), the client-side validation before submit (~3717-3725), `tdbCreateTournament` (~2990).

**Interfaces:**
- Consumes: `scoringRulesFor`, `gameScoreStatus` (Task 1), the new columns (Task 2).

- [ ] **Step 1:** In `openBracketResultModal`, replace `capOf` and the auto-fill so the winner's box pre-fills to the phase target (not the old single cap), and add a client-side `gameScoreStatus` check before submit that calls `fail(status.reason)` when `!status.valid` (so the user sees "Must win by 2" before the RPC round-trip). Keep the existing tap-agrees-with-scores check. **Gating (mirror the RPC):** apply the `gameScoreStatus` enforcement ONLY when the phase's target column is set on the tournament (`bracket_target`/`pool_target` not null); for legacy tournaments keep the existing validation (no win-by-2). The winner-box auto-fill uses `scoringRulesFor(phase, t).target` (which falls back to `match_cap` for legacy).

- [ ] **Step 2:** `tdbCreateTournament` — accept + persist `pool_target, pool_cap, bracket_target, bracket_cap, win_by_2` (passed from Task 4's form); keep writing `match_cap` (= `bracket_target`) for back-compat with anything still reading it.

- [ ] **Step 3:** Mark §38-exempt (behavior, not a new layout): `node "C:/Users/OlasM/.claude/hooks/ui38-mark.mjs" --decision=exempt --reason="NF-1 result-modal + tdbCreate wiring: behavior only, no new layout" public/app.js` — then `node --check public/app.js`, bump versions, `vitest run`, live-verify on a synthetic tournament, push.

---

### Task 4: Create-form — host picks the bracket target (app.js — UI, §38 REQUIRED)

**Files:**
- Modify: `public/app.js` — the create-tournament form (~4061-4070) + the create handler (~7095-7098) + the active-tournament header label (~4089).

- [ ] **Step 1:** §38 — build 3 distinct localhost layouts for the create-tournament scoring section (e.g. A: a "Bracket plays to" required picker [21 / 25 / custom] + a collapsed "pool defaults 15/cap20" line; B: a two-row pool/bracket settings grid; C: a segmented "quick presets" + advanced toggle). Capture each at 1920×1080, Read each to confirm legibility, present one image per option via AskUserQuestion. NO default on the bracket target — submission blocked until the host picks.
- [ ] **Step 2:** Build Mike's pick. Replace the single `tv2-cap value="25"` "Game to" input with the bracket-target picker (required) + pool target/cap (pre-filled 15/20) + a win-by-2 indicator. The create handler passes the new fields to `tdbCreateTournament`; block submit with a clear message if the bracket target is empty. Update the active-tournament header label (~4089) from `to ${match_cap}` to e.g. `pool to 15 · bracket to ${bracket_target}`.
- [ ] **Step 3:** §38 mark (`--decision=3-options-shown`), `node --check`, bump versions lockstep, `vitest run`, live-verify (create a synthetic tournament, confirm the host must pick + the value persists + a pool/bracket game enforces the rule end-to-end signed-out), clean up, push.

---

### Task 5: Final live verification + vault writeback

- [ ] **Step 1:** On a synthetic tournament on prod (Playwright, signed-out): create → host forced to pick bracket target → play a pool game (15-14 rejected, 15-13 accepted, 20-19 accepted) → generate bracket → play a bracket game (21-20 rejected, 21-19 accepted) → 0 console errors. Clean up the synthetic tournament; confirm prod clean.
- [ ] **Step 2:** vitest 68→N green; `node --check` clean; versions lockstep; prod shows the new version pill.
- [ ] **Step 3:** Vault: `12-history/task-#<id>-nf1-scoring.md` (BEFORE marking the task complete), update `current.md`/`log.md`/NOW, mark NF-1 done in the §49 doc + Tasks From Claude. Update `03-anatomy/PRODUCT-SURFACE.md` (scoring model + `verified_against`).

---

## Self-Review
- **Spec coverage:** pool 15/cap20 ✓ (Task 1/2 rules + Task 4 defaults), bracket host-picks/no-cap ✓ (Task 4 required picker, `bracket_cap` null), win-by-2 ✓ (all 3 layers), no-default-host-picks ✓ (Task 4 Step 2 blocks empty), enforced in pure + RPC + UI ✓. Full host-customization console = UP-10 (out of NF-1 scope, noted).
- **Placeholder scan:** none — real test code, real impl, real SQL, exact files/lines.
- **Type consistency:** `gameScoreStatus`/`scoringRulesFor` signatures match between Task 1 (def), Task 3 (client use), Task 2 (PL/pgSQL mirror). `{target, cap, winBy2}` consistent.
- **Risk:** the RPC change is the delicate part (no test harness, OUT-10) → verified on a synthetic tournament before any real use; back-compat via `match_cap` fallback so existing tournaments still score.

---

## Option C+ extension — saveable scoring FORMATS (Mike, 2026-06-26)
Mike chose §38 Option C (format presets) and asked to "create custom presets that save forever until deleted." This replaces the bare bracket-target picker with a **saved-formats** picker in the create form.

**DB — DONE + verified (migration `0026_nf1_scoring_presets`, commit pending push):** `scoring_presets` (id, name, pool_target default 15, pool_cap, bracket_target NOT NULL, bracket_cap, win_by_2 default true, created_at). RLS = `c21 anon read` (SELECT/anon) + `c21 admin all` (ALL/authenticated) — admin writes via the authenticated session (same path as creating a tournament; no new anon RPC). Seeded one **"Standard"** (pool 15/cap 20, bracket 25, win-by-2). Verified on prod.

**Remaining app.js build (the careful part — surgical updates, no full render() in the picker):**
1. **tdb layer** (after `tdbDeleteTournament` ~3008): `tdbListScoringPresets()` (select * order by created_at asc), `tdbCreateScoringPreset(p)` (validate name + bracket_target required; null-safe caps), `tdbDeleteScoringPreset(id)`.
2. **Load:** in `tdbRefreshTournaments` (after `state.tournaments=...` line 3365) add `state.scoringPresets = await tdbListScoringPresets();`. State: `state.selectedFormatId` (default first preset), `state.newFormatOpen`.
3. **`tdbCreateTournament`** (line 2990): change signature to `({name, pool_count, net_count, preset})`; persist `pool_target/pool_cap/bracket_target/bracket_cap/win_by_2` from `preset` + `match_cap = preset.bracket_target` (back-compat).
4. **Create-form UI** (lines 4058-4078): replace the "Game to" label with `<div id="tv2-format-picker">${buildFormatPickerHTML()}</div>` (keep Pools/Nets + the name input OUTSIDE the picker). `buildFormatPickerHTML()` = the preset rows (selected highlight + `tv2-delete-format` ×) + a `tv2-newformat-toggle` → an inline new-format form (name, pool to/cap, bracket to, a `tv2-winby` toggle, `tv2-save-format`).
5. **Handlers** (extend the delegated `tv2-*` listener ~7087): `tv2-pick-format` (set selectedFormatId; **surgically** toggle row highlight — NO render); `tv2-delete-format` (appConfirm; delete; re-render the picker container only); `tv2-newformat-toggle` (toggle state.newFormatOpen; re-render picker container only — safe, nothing typed yet); `tv2-winby` (**surgical** data-attr toggle, read at save — NO render so the typed fields survive); `tv2-save-format` (read fields + win-by from DOM; validate; create; select new; close form; re-render picker container only). **CRITICAL:** only ever set `#tv2-format-picker`.innerHTML (never full render) so the typed tournament name + open new-format fields are never wiped.
6. **Create handler** (`tv2-create-tournament` ~7094): pass `preset` = the selected `state.scoringPresets.find(p=>p.id===state.selectedFormatId)`; block if none selected.
7. **Result-modal wiring (Task 3):** `openBracketResultModal` auto-fill → `scoringRulesFor(m.phase, t).target`; pre-submit `gameScoreStatus` check **gated** on the new model present (`t.pool_target`/`t.bracket_target` not null).
8. Ship: §38 marked (3-options-shown, done) · bump `APP_VERSION` 2026.06.25.26 → **2026.06.26.1** (app.js:27) + `SW_VERSION` lockstep (sw.js:3) · `node --check` · `vitest run` · **live-verify on localhost** (create form shows formats, pick → create → scoring cols set + enforcement fires, save a new format → persists + appears, delete → gone; tournament name survives a format pick) · push.

**Verify before push (the gate):** localhost end-to-end on the real connected browser — never push the create-flow change unverified.
