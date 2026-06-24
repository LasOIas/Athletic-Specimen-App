# C28 Co-pilot — Slice 2 (acting) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the admin co-pilot *act* — check players in/out, make teams, submit a score, and set up a tournament — by running a Claude tool-use loop in the browser, executing each action with the admin's existing functions behind a hybrid confirm/undo safety policy.

**Architecture:** The browser drives a manual tool loop. The `copilot` edge function (still the thin, key-holding Claude relay from Slice 1) is extended to pass Claude a set of **write-tool** definitions and return `tool_use` blocks. The browser holds the `messages` array, runs the matching local executor (the same functions the admin's taps call), applies a per-tool confirm/undo policy enforced **in the browser**, logs to a `copilot_actions` audit table, and feeds the result back to Claude until it returns a final answer.

**Tech Stack:** Vanilla JS SPA (`public/app.js`), `public/pure.js` + vitest, Supabase edge function (Deno) + Postgres (migration + RPC), Anthropic Messages API tool use (`claude-haiku-4-5`).

## Global Constraints

- `APP_VERSION` (`public/app.js` ~line 27) bumped every code change — `'YYYY.MM.DD.N'`; `SW_VERSION` (`public/sw.js`) in lockstep.
- `node --check public/app.js` + `public/sw.js` + `public/pure.js` after edits; vitest green.
- `partialRender()` for background syncs, `render()` for user actions.
- No emojis (SVG only); no neon; no `Co-Authored-By` / "Generated with Claude Code" commit trailers; conventional-commit style; batch commits.
- `ANTHROPIC_API_KEY` stays a Supabase secret; **skill ratings never reach the model or the audit log** (the Slice-1 `buildCopilotContext` redaction is reused; tool args carry no skill).
- The co-pilot acts only with the **admin's existing privileges** (the C21 RPCs / client functions); confirm/undo gates are **browser-enforced**, not model-trusted.
- **§38:** the new confirm card + undo chip are a UI change — 3 distinct layouts on localhost, Mike picks, before shipping (hook-enforced).
- Supabase project ref `mlzblkzflgylnjorgjcp`; RLS is locked (writes go through SECURITY DEFINER RPCs).
- Model `claude-haiku-4-5` (revisit → Opus only if tool-selection accuracy is insufficient — a one-line change).

## File Structure

- **new** `db/migrations/0020_copilot_actions.sql` — audit table + `log_copilot_action` RPC.
- `public/pure.js` — `resolvePlayerByName`, `COPILOT_TOOL_POLICY`, `validateCopilotToolArgs` (pure, TDD).
- `test/pure.test.js` — tests for the above.
- `supabase/functions/copilot/index.ts` — accept `messages` + `tools`; return `tool_use`; write-tool schemas; keep the Slice-1 single-question path.
- `public/app.js` — browser tool loop, executor registry, confirm/undo UI wiring, audit logging.
- `public/styles.css` — confirm card + undo chip styles.
- `public/sw.js` — `SW_VERSION`.

---

### Task 1: `copilot_actions` audit table + log RPC

**Files:**
- Create: `db/migrations/0020_copilot_actions.sql`

**Interfaces:**
- Produces: a `copilot_actions` table and `log_copilot_action(p_request text, p_tool text, p_args jsonb, p_result text, p_undone boolean)` SECURITY DEFINER RPC (actor derived from JWT via the existing `_audit_actor()` helper). The browser calls `supabaseClient.rpc('log_copilot_action', {...})` after each executed action.

- [ ] **Step 1: Write the migration**

Create `db/migrations/0020_copilot_actions.sql`:

```sql
-- C28 Slice 2 — co-pilot action audit trail (transparency: NL request -> tool -> result).
create table if not exists public.copilot_actions (
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),
  actor        text,
  role         text,
  request_text text,
  tool         text not null,
  args         jsonb not null default '{}'::jsonb,   -- NEVER contains skill
  result       text,
  undone       boolean not null default false
);
alter table public.copilot_actions enable row level security;
-- C21 lock pattern: anon no access; authenticated admin reads; writes via the SECURITY DEFINER RPC only.
create policy "c21 admin read copilot_actions" on public.copilot_actions
  for select to authenticated using (true);

-- log RPC: actor/role from the caller's JWT (reuse the C21 _audit_actor helper).
create or replace function public.log_copilot_action(
  p_request text, p_tool text, p_args jsonb, p_result text, p_undone boolean
) returns void
language plpgsql security definer set search_path = public as $$
declare a record;
begin
  select * into a from public._audit_actor();
  insert into public.copilot_actions(actor, role, request_text, tool, args, result, undone)
  values (a.actor, a.role, p_request, p_tool, coalesce(p_args, '{}'::jsonb), p_result, coalesce(p_undone, false));
end; $$;
revoke all on function public.log_copilot_action(text, text, jsonb, text, boolean) from public, anon;
grant execute on function public.log_copilot_action(text, text, jsonb, text, boolean) to authenticated;
```

- [ ] **Step 2: Apply via Supabase MCP**

Apply with `apply_migration` (project `mlzblkzflgylnjorgjcp`, name `copilot_actions`). **Confirm `_audit_actor()` exists** first (`list` functions / `select` from it); if its return columns differ from `(actor, role)`, adjust the `select … into a` accordingly (it was added in C21 Phase 4 / migration 0019).

- [ ] **Step 3: Verify**

`execute_sql`: `insert` is rejected for anon; `select` works for an admin session; a manual `select log_copilot_action('test','noop','{}'::jsonb,'ok',false)` as an admin writes one row; then delete the test row. Confirm `args` has no skill.

- [ ] **Step 4: Commit**

```bash
git add db/migrations/0020_copilot_actions.sql
git commit -m "feat(c28): copilot_actions audit table + log RPC (Slice 2)"
```

---

### Task 2: Pure parts — name resolution, tool policy, arg validation (TDD)

**Files:**
- Modify: `public/pure.js` (add before the export block; add to `module.exports`)
- Test: `test/pure.test.js`

**Interfaces:**
- Consumes: existing `disambiguatePlayersByName(players, query)` (returns `[{id,name,group,initials,checkedIn}]`).
- Produces:
  - `resolvePlayerByName(players, name)` → `{ ok:true, player:{id,name,group} } | { ok:false, reason:'none'|'ambiguous', matches:[{name,group}] }` (uses the disambiguator; exact case-insensitive full-name match wins; else single substring match; else ambiguous/none). **No skill in the output.**
  - `COPILOT_TOOL_POLICY` → `{ check_in:'instant', check_out:'instant', make_teams:'instant', submit_score:'confirm', setup_tournament:'confirm', generate_bracket:'confirm' }`.
  - `validateCopilotToolArgs(tool, args)` → `{ ok:true } | { ok:false, error:string }` (e.g. `make_teams` needs integer count ≥2; `check_in` needs a non-empty name).

- [ ] **Step 1: Write the failing tests**

Append to `test/pure.test.js` (add `resolvePlayerByName, COPILOT_TOOL_POLICY, validateCopilotToolArgs` to the top destructure):

```js
describe('C28 Slice 2 — co-pilot acting pure helpers', () => {
  const players = [
    { id: 'p1', name: 'Mikey Olas', group: 'KC', checked_in: true, skill: 9 },
    { id: 'p2', name: 'Mike Stevens', group: 'KC', checked_in: false, skill: 4 },
    { id: 'p3', name: 'Jet', group: 'AS', checked_in: true, skill: 5 },
  ];

  it('resolvePlayerByName: exact full-name match wins, no skill leaks', () => {
    const r = resolvePlayerByName(players, 'mikey olas');
    expect(r).toEqual({ ok: true, player: { id: 'p1', name: 'Mikey Olas', group: 'KC' } });
    expect(JSON.stringify(r)).not.toContain('9');
    expect(JSON.stringify(r)).not.toContain('skill');
  });
  it('resolvePlayerByName: single substring match resolves', () => {
    expect(resolvePlayerByName(players, 'jet')).toEqual({ ok: true, player: { id: 'p3', name: 'Jet', group: 'AS' } });
  });
  it('resolvePlayerByName: ambiguous -> reason + match names', () => {
    const r = resolvePlayerByName(players, 'mike');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('ambiguous');
    expect(r.matches).toEqual([{ name: 'Mikey Olas', group: 'KC' }, { name: 'Mike Stevens', group: 'KC' }]);
  });
  it('resolvePlayerByName: no match -> none', () => {
    expect(resolvePlayerByName(players, 'zzz')).toEqual({ ok: false, reason: 'none', matches: [] });
  });
  it('COPILOT_TOOL_POLICY: instant vs confirm per tool', () => {
    expect(COPILOT_TOOL_POLICY.check_in).toBe('instant');
    expect(COPILOT_TOOL_POLICY.make_teams).toBe('instant');
    expect(COPILOT_TOOL_POLICY.submit_score).toBe('confirm');
    expect(COPILOT_TOOL_POLICY.setup_tournament).toBe('confirm');
    expect(COPILOT_TOOL_POLICY.generate_bracket).toBe('confirm');
  });
  it('validateCopilotToolArgs: make_teams needs an integer count >= 2', () => {
    expect(validateCopilotToolArgs('make_teams', { count: 4 }).ok).toBe(true);
    expect(validateCopilotToolArgs('make_teams', { count: 1 }).ok).toBe(false);
    expect(validateCopilotToolArgs('make_teams', { count: 'x' }).ok).toBe(false);
  });
  it('validateCopilotToolArgs: check_in needs a non-empty name', () => {
    expect(validateCopilotToolArgs('check_in', { name: 'Jet' }).ok).toBe(true);
    expect(validateCopilotToolArgs('check_in', { name: '  ' }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/pure.test.js` → the new tests FAIL (`resolvePlayerByName is not a function`).

- [ ] **Step 3: Implement in `public/pure.js`** (before the export guard)

```js
// C28 Slice 2 — co-pilot acting helpers (pure; no DOM/state/skill).
function resolvePlayerByName(players, name) {
  const q = String(name == null ? '' : name).trim().toLowerCase();
  if (!q) return { ok: false, reason: 'none', matches: [] };
  const rows = disambiguatePlayersByName(players, q); // [{id,name,group,...}] — already skill-free
  const exact = rows.filter((r) => String(r.name || '').trim().toLowerCase() === q);
  const pick = exact.length === 1 ? exact[0] : (rows.length === 1 ? rows[0] : null);
  if (pick) return { ok: true, player: { id: pick.id, name: pick.name, group: pick.group || '' } };
  if (rows.length === 0) return { ok: false, reason: 'none', matches: [] };
  return { ok: false, reason: 'ambiguous', matches: rows.map((r) => ({ name: r.name, group: r.group || '' })) };
}

var COPILOT_TOOL_POLICY = {
  check_in: 'instant', check_out: 'instant', make_teams: 'instant',
  submit_score: 'confirm', setup_tournament: 'confirm', generate_bracket: 'confirm',
};

function validateCopilotToolArgs(tool, args) {
  const a = args || {};
  if (tool === 'make_teams') {
    const n = Number(a.count);
    return Number.isInteger(n) && n >= 2 ? { ok: true } : { ok: false, error: 'count must be a whole number >= 2' };
  }
  if (tool === 'check_in' || tool === 'check_out') {
    return String(a.name || '').trim() ? { ok: true } : { ok: false, error: 'a player name is required' };
  }
  if (tool === 'setup_tournament') {
    return String(a.name || '').trim() && Array.isArray(a.teams) && a.teams.length >= 2
      ? { ok: true } : { ok: false, error: 'a tournament name and at least 2 team names are required' };
  }
  return { ok: true }; // submit_score / generate_bracket validated at execution against live state
}
```
Add `resolvePlayerByName, COPILOT_TOOL_POLICY, validateCopilotToolArgs` to `module.exports`.

- [ ] **Step 4: Run to verify pass** — `npx vitest run` (all green) + `node --check public/pure.js`.

- [ ] **Step 5: Commit**

```bash
git add public/pure.js test/pure.test.js
git commit -m "feat(c28): co-pilot acting pure helpers — name resolution, tool policy, arg validation (TDD)"
```

---

### Task 3: Edge function → tool-loop relay

**Files:**
- Modify: `supabase/functions/copilot/index.ts`

**Interfaces:**
- Consumes: POST body — **either** Slice-1 shape `{ question, context }` (kept working) **or** Slice-2 shape `{ messages, tools, system_context }` where `messages` is the Anthropic messages array the browser maintains and `tools` is the write-tool list.
- Produces: returns the raw Claude response shape the browser needs — `{ stop_reason, content }` (so the browser can read `tool_use` blocks) for the loop path; the Slice-1 path still returns `{ answer }`.

- [ ] **Step 1: Extend the function** (admin gate, CORS, key handling unchanged from Slice 1)

Add a branch: if the body has `messages`, run the relay; else keep the Slice-1 `{question, context}` → `{answer}` path. Relay branch:

```ts
// Slice 2 relay: one Claude call with the browser-supplied messages + write-tools. Return the raw
// stop_reason + content so the browser can execute any tool_use and continue the loop itself.
if (Array.isArray(body?.messages)) {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_ACTING,            // describes the tools + that confirm-tools need approval
      tools: Array.isArray(body.tools) ? body.tools : [],
      messages: body.messages,
    }),
  });
  if (!resp.ok) { console.error("anthropic error", resp.status, await resp.text()); return json({ error: "co-pilot unavailable" }, 502); }
  const data = await resp.json();
  return json({ stop_reason: data?.stop_reason ?? null, content: Array.isArray(data?.content) ? data.content : [] });
}
```

Add `SYSTEM_ACTING` (extends the Slice-1 SYSTEM): "You can act using the provided tools. Use them when the admin asks you to do something; otherwise just answer. Some tools require the admin to confirm before they run — call them normally and the app handles the confirmation. Never use skill ratings. Resolve players by name; if a name is ambiguous, ask which one rather than guessing."

- [ ] **Step 2: Deploy** via Supabase MCP (`deploy_edge_function`, name `copilot`, `verify_jwt: true`).

- [ ] **Step 3: Verify** — curl a `messages` request with one write-tool (e.g. `make_teams`) and a user msg "make 4 teams"; assert the response has `stop_reason: "tool_use"` and a `tool_use` block naming `make_teams` with `{count:4}`. The Slice-1 `{question,context}` curl still returns `{answer}`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/copilot/index.ts
git commit -m "feat(c28): copilot edge fn — tool-loop relay (Slice 2)"
```

---

### Task 4: Browser tool loop + executor registry

**Files:**
- Modify: `public/app.js` (new section after the Slice-1 co-pilot block; bump `APP_VERSION`)

**Interfaces:**
- Consumes: `resolvePlayerByName`, `COPILOT_TOOL_POLICY`, `validateCopilotToolArgs` (Task 2); the edge relay (Task 3); `log_copilot_action` RPC (Task 1); existing `checkInPlayer`/`checkOutPlayer`/`generateBalancedGroups`/`saveLiveStateToSupabase`/`tdbCreateTournament`/`tdbAddTeam`/`tdbDrawPools`/`tdbGenerateBracket`/`tdbSubmitResult`; `state`, `supabaseClient`, `buildCopilotContext`, `getPublicLiveData`.
- Produces: `runCopilotTurn(userText)` — replaces the Slice-1 single-shot `handleCopilotSend` body with the tool loop; `COPILOT_TOOLS` (Anthropic tool schemas); `copilotExecutors` (name → async executor returning `{ result:string, undo?:fn, args:obj }`).

- [ ] **Step 1: Define the tool schemas** (`COPILOT_TOOLS`) — `check_in`/`check_out` (`{name}`), `make_teams` (`{count}`), `submit_score` (`{team_a, team_b, score_a, score_b}` for a tournament match, or `{winner}` for casual — keep minimal, validated at execute), `setup_tournament` (`{name, teams:[string], pool_count?, net_count?}`), `generate_bracket` (`{}`). Each with `input_schema`. (Full JSON in the implementer's file; mirror the `pure.js` validation.)

- [ ] **Step 2: Implement the executor registry**

```js
// C28 Slice 2 — each executor runs an EXISTING admin function and returns { result, args, undo? }.
const copilotExecutors = {
  async check_in(args) {
    const r = resolvePlayerByName(state.players, args.name);
    if (!r.ok) return { result: r.reason === 'ambiguous'
        ? `Ambiguous: ${r.matches.map((m) => m.name + (m.group ? ' (' + m.group + ')' : '')).join(', ')}` : `No player named "${args.name}".`, args };
    await checkInPlayer(r.player);                       // routes through the check_in RPC + outbox
    return { result: `Checked in ${r.player.name}.`, args: { name: r.player.name },
             undo: async () => { await checkOutPlayer(r.player); } };
  },
  async check_out(args) {
    const r = resolvePlayerByName(state.players, args.name);
    if (!r.ok) return { result: r.reason === 'ambiguous'
        ? `Ambiguous: ${r.matches.map((m) => m.name).join(', ')}` : `No player named "${args.name}".`, args };
    await checkOutPlayer(r.player);
    return { result: `Checked out ${r.player.name}.`, args: { name: r.player.name },
             undo: async () => { await checkInPlayer(r.player); } };
  },
  async make_teams(args) {
    const prev = state.generatedTeams;                  // for undo
    const gen = generateBalancedGroups(state.players, state.checkedIn, Number(args.count));
    if (!gen.teams.length) return { result: 'No one is checked in to make teams from.', args };
    state.generatedTeams = gen.teams; state.groupCount = Number(args.count);
    saveLiveStateToSupabase(); render();
    return { result: `Made ${gen.teams.length} teams from ${state.checkedIn.length} checked-in players.`, args: { count: Number(args.count) },
             undo: async () => { state.generatedTeams = prev; saveLiveStateToSupabase(); render(); } };
  },
  // submit_score / setup_tournament / generate_bracket: implemented against tdb* + the active tournament.
  // submit_score(args) -> resolve the match in state.tournamentMatches by team names, tdbSubmitResult(match, score_a, score_b).
  // setup_tournament(args) -> tdbCreateTournament({name, pool_count, net_count}) -> tdbAddTeam(id, t) for each -> tdbDrawPools(t).
  // generate_bracket() -> tdbGenerateBracket(active). (Full bodies in the implementer's file; each returns { result, args }.)
};
```

- [ ] **Step 3: Implement the loop** (`runCopilotTurn`)

```js
async function runCopilotTurn(userText) {
  const ctx = buildCopilotContext({ players: state.players, generatedTeams: state.generatedTeams,
    liveData: getPublicLiveData(), tournament: copilotTournamentInput() });
  const messages = [{ role: 'user', content: `Current state:\n${JSON.stringify(ctx)}\n\n${userText}` }];
  for (let i = 0; i < 8; i++) {                          // hard cap on loop iterations
    const { data, error } = await supabaseClient.functions.invoke('copilot', { body: { messages, tools: COPILOT_TOOLS } });
    if (error || !data) throw new Error('copilot failed');
    messages.push({ role: 'assistant', content: data.content });
    const toolUses = (data.content || []).filter((b) => b.type === 'tool_use');
    if (data.stop_reason !== 'tool_use' || !toolUses.length) {
      const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
      return text || 'Done.';
    }
    const results = [];
    for (const tu of toolUses) {
      const out = await executeCopilotTool(tu.name, tu.input, userText);   // applies policy (confirm/undo) + audit
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: out.result, is_error: !!out.is_error });
    }
    messages.push({ role: 'user', content: results });
  }
  return 'Stopped after too many steps.';
}
```

- [ ] **Step 4: Implement `executeCopilotTool`** (the policy + audit wrapper)

```js
async function executeCopilotTool(name, input, requestText) {
  const v = validateCopilotToolArgs(name, input);
  if (!v.ok) return { result: `Can't do that: ${v.error}`, is_error: true };
  const policy = COPILOT_TOOL_POLICY[name] || 'confirm';
  if (policy === 'confirm') {
    const ok = await copilotConfirmCard(name, input);   // renders a [Confirm]/[Cancel] card, returns bool (Task 5)
    if (!ok) return { result: 'The admin cancelled this action.' };
  }
  const exec = copilotExecutors[name];
  if (!exec) return { result: `Unknown action "${name}".`, is_error: true };
  let out;
  try { out = await exec(input); } catch (e) { return { result: `That action failed: ${(e && e.message) || 'error'}`, is_error: true }; }
  try { await supabaseClient.rpc('log_copilot_action', { p_request: requestText, p_tool: name, p_args: out.args || {}, p_result: out.result, p_undone: false }); } catch (_e) { /* audit best-effort */ }
  if (policy === 'instant' && out.undo) copilotShowUndo(name, out.result, out.undo);  // undo chip (Task 5)
  return { result: out.result };
}
```

- [ ] **Step 5: Wire `handleCopilotSend`** to call `runCopilotTurn` (replace the Slice-1 single `invoke`): append the user bubble, a loading bubble, `const answer = await runCopilotTurn(q)`, `replaceCopilotMessage(loadingId, answer)`. Bump `APP_VERSION` + `SW_VERSION`. `node --check`.

- [ ] **Step 6: Commit** (after Task 5's UI exists — confirm/undo are referenced here). Held until Task 5; or stub `copilotConfirmCard`→`Promise.resolve(true)` / `copilotShowUndo`→no-op to commit Task 4 standalone, then implement the real UI in Task 5.

---

### Task 5: Confirm card + undo chip UI (§38)

**Files:**
- Modify: `public/app.js` (`copilotConfirmCard`, `copilotShowUndo`), `public/styles.css`, `public/sw.js`

**Interfaces:**
- Produces: `copilotConfirmCard(tool, input)` → `Promise<boolean>` (renders a confirm card in the chat thread previewing the action; resolves on Confirm/Cancel tap); `copilotShowUndo(tool, resultText, undoFn)` (renders the result with a short-lived `[Undo]` that calls `undoFn` + logs `undone:true`).

- [ ] **Step 1: §38** — 3 distinct confirm-card / undo-chip layouts on localhost → Mike picks. (Record via `ui38-mark.mjs`.)
- [ ] **Step 2:** Implement the chosen layout: a `.cop-confirm` card (preview text built per tool: "Make 4 teams from 8 checked-in?", "Submit Team A 21–15 Team B?", "Set up tournament 'X' with 6 teams?") + Confirm/Cancel buttons resolving the promise; an undo chip appended to the result bubble (8-second window) calling `undoFn` then `log_copilot_action(..., p_undone:true)`. Reuse `appConfirm`/`.kc-*` where it fits.
- [ ] **Step 3:** Build the preview strings as a pure `copilotActionPreview(tool, input, state-derived counts)` helper (TDD in pure.js if non-trivial). `node --check` + vitest green; version bump.
- [ ] **Step 4: Live-verify (§27/§41, desktop + Mike's phone):** run each of the 4 actions end-to-end — check-in writes the row + Undo reverses it; make-teams sets the courts + Undo restores; submit-score shows a confirm then updates standings; setup-tournament shows a confirm then creates it; `copilot_actions` logs each; 0 console errors.
- [ ] **Step 5: Commit** (Tasks 4 + 5 together): `git commit -m "feat(c28): co-pilot acting — tool loop, executors, confirm/undo UI (Slice 2)"`.

---

### Task 6: Ship + write-back

- [ ] **Step 1:** Push (Vercel deploy); prod smoke test (run one of each action on the live app, cross-check the DB, leave prod clean).
- [ ] **Step 2:** §30 history `<vault>/12-history/task-#13-c28-copilot-slice2.md` before completing.
- [ ] **Step 3:** Vault write-back (log / current / decisions [browser-driven loop + hybrid safety] / NOW / Tasks From Claude [C28 Slice 2 done]).
- [ ] **Step 4:** Mark task #13 complete.

---

## Self-Review

- **Spec coverage:** §2 four actions → Task 4 executors + Task 1 schemas; §3 browser-driven loop → Tasks 3+4; §5 hybrid safety → `COPILOT_TOOL_POLICY` (Task 2) + `executeCopilotTool` (Task 4) + confirm/undo UI (Task 5); §6 coarse tournament setup → `setup_tournament` executor (Task 4); §7 audit → Task 1 + `log_copilot_action` calls (Task 4); §8 errors → `executeCopilotTool` try/catch + `is_error` tool_results; §9 testing → Task 2 (TDD) + Task 5 Step 4 (live). No spec section without a task.
- **Placeholder scan:** the executor bodies for `submit_score`/`setup_tournament`/`generate_bracket` are described as "full body in the implementer's file" (Task 4 Step 2) — these wrap the already-named `tdb*` functions; pin the exact match-resolution + arg shape at implementation against `app.js`. This is the one area to flesh out at build (the function targets are named; the glue is mechanical). §38 confirm-card markup is a deliberate interactive step (Task 5 Step 1), not a placeholder.
- **Type consistency:** `runCopilotTurn` ↔ `executeCopilotTool` ↔ `copilotExecutors[name]({result,args,undo})` shapes match; `COPILOT_TOOL_POLICY` keys match the `COPILOT_TOOLS` names and the executor keys; `resolvePlayerByName` return shape consumed correctly in the check-in/out executors.
