# C28 Admin AI Co-pilot — Slice 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only admin AI co-pilot — a chat in the admin Co-pilot tab that answers "what's going on right now" from current state (who's up / on deck, headcount, tournament standings), via a thin key-holding Supabase edge function calling Claude Haiku.

**Architecture:** The admin browser already holds all the data in `state`. It builds a compact, skill-redacted JSON snapshot (`buildCopilotContext`, pure + TDD'd in `pure.js`) and POSTs it + the question to a new `copilot` edge function. That function holds `ANTHROPIC_API_KEY`, gates on the admin session JWT, makes ONE Haiku call, and returns the text answer. No DB round-trip, no writes, skill never leaves the browser.

**Tech Stack:** Vanilla JS SPA (`public/app.js`), `public/pure.js` + vitest (`test/pure.test.js`), Supabase edge function (Deno/TypeScript), Anthropic Messages API (`claude-haiku-4-5`).

## Global Constraints

- `APP_VERSION` in `public/app.js` (~line 22) bumped on every code change — format `'YYYY.MM.DD.N'` (N resets to 1 daily); `SW_VERSION` in `public/sw.js` kept in lockstep.
- Run `node --check public/app.js` and `node --check public/sw.js` after edits; vitest must stay green.
- `partialRender()` for background Supabase syncs, `render()` only for user-initiated actions.
- No emojis in UI (inline SVG icons only); no neon colors; direction-A oklch tokens.
- No `Co-Authored-By` / "Generated with Claude Code" trailers on commits; conventional-commit style (`feat(...)`, `fix(...)`), no emojis, batch commits.
- `ANTHROPIC_API_KEY` never in the client bundle — Supabase secret only.
- **Skill ratings never reach the model** — redaction by construction inside `buildCopilotContext`.
- Model: `claude-haiku-4-5`, `max_tokens: 1024`, non-streaming, `anthropic-version: 2023-06-01`.
- **§38:** the chat UI is a UI change — present **three distinct layouts** on localhost and get Mike's pick before implementing (hook-enforced on `public/{app.js,*.html,*.css}`).
- Supabase project ref `mlzblkzflgylnjorgjcp`; admin session JWT (from `admin_login`) carries `app_metadata.admin === true`.

---

### Task 1: `buildCopilotContext` pure function (TDD)

**Files:**
- Modify: `public/pure.js` (add `copilotRosterNames`, `copilotUpNextByNet`, `buildCopilotContext` before the `module.exports` block; add all three to the export object)
- Test: `test/pure.test.js` (add a `describe('buildCopilotContext …')` block)

**Interfaces:**
- Consumes: existing pure `computeStandings(teams, matches)` (already in `pure.js`, skill-free output `{rank,name,wins,pointDiff,…}`).
- Produces: `buildCopilotContext(input)` → `{ attendance, casualCourts, tournament }` where
  - `input = { players?, generatedTeams?, liveData?, tournament? }`
  - `players`: raw `state.players` array (objects may carry `.skill` — stripped here).
  - `generatedTeams`: raw `state.generatedTeams` — array of teams, each an array of player objects (may carry `.skill`). Team number N = index N-1.
  - `liveData`: `getPublicLiveData()` output `{ matchups:[{teamA,teamB}], waitingTeams:[n], results:{"a-b":winnerN}, liveCount }`.
  - `tournament`: `null`, or `{ name, status, teams, matches }`.
  - Output shape exactly as asserted in Step 1.

- [ ] **Step 1: Write the failing tests**

Append to `test/pure.test.js`:

```js
const { buildCopilotContext } = require('../public/pure.js');

describe('buildCopilotContext (C28 co-pilot read context)', () => {
  test('attendance: counts checked-in players, groups them, excludes not-checked-in', () => {
    const ctx = buildCopilotContext({
      players: [
        { name: 'Mikey Olas', group: 'KC Volleyball', checked_in: true, skill: 9 },
        { name: 'Allie Hotz', group: 'KC Volleyball', checked_in: true, skill: 7 },
        { name: 'Rich Wells', group: '', checked_in: true, skill: 5 },
        { name: 'Jaakan Mullet', group: 'KC Volleyball', checked_in: false, skill: 8 },
      ],
    });
    expect(ctx.attendance.total).toBe(3);
    expect(ctx.attendance.byGroup).toEqual({ 'KC Volleyball': 2, 'Ungrouped': 1 });
    expect(ctx.attendance.here).toEqual([
      { name: 'Mikey Olas', group: 'KC Volleyball' },
      { name: 'Allie Hotz', group: 'KC Volleyball' },
      { name: 'Rich Wells', group: '' },
    ]);
  });

  test('REDACTION: no skill key and no skill value leaks (players + generatedTeams)', () => {
    const SENTINEL = 8.6531; // distinctive skill value that cannot appear as a count
    const s = JSON.stringify(buildCopilotContext({
      players: [{ name: 'Mikey Olas', group: 'KC', checked_in: true, skill: SENTINEL }],
      generatedTeams: [
        [{ name: 'Mikey Olas', skill: SENTINEL }, { name: 'Allie Hotz', skill: SENTINEL }],
        [{ name: 'Rich Wells', skill: SENTINEL }, { name: 'Jaakan Mullet', skill: SENTINEL }],
      ],
      liveData: { matchups: [{ teamA: 1, teamB: 2 }], waitingTeams: [], results: {}, liveCount: 1 },
    }));
    expect(s).not.toContain('skill');
    expect(s).not.toContain(String(SENTINEL));
  });

  test('casualCourts: maps matchups to redacted rosters + waiting onDeck + winner', () => {
    const ctx = buildCopilotContext({
      generatedTeams: [
        [{ name: 'A1', skill: 1 }, { name: 'A2', skill: 1 }], // team 1
        [{ name: 'B1', skill: 1 }, { name: 'B2', skill: 1 }], // team 2
        [{ name: 'C1', skill: 1 }, { name: 'C2', skill: 1 }], // team 3 (waiting)
      ],
      liveData: { matchups: [{ teamA: 1, teamB: 2 }], waitingTeams: [3], results: { '1-2': 1 }, liveCount: 0 },
    });
    expect(ctx.casualCourts.playing).toEqual([
      { court: 1, teamA: { n: 1, players: ['A1', 'A2'] }, teamB: { n: 2, players: ['B1', 'B2'] }, winner: 'A' },
    ]);
    expect(ctx.casualCourts.onDeck).toEqual([{ team: 3, players: ['C1', 'C2'] }]);
    expect(ctx.casualCourts.inProgress).toBe(0);
  });

  test('tournament: standings + upNextByNet from teams + matches', () => {
    const teams = [{ id: 't1', name: 'Mikey Mouse Clubhouse' }, { id: 't2', name: 'Spikers' }];
    const matches = [
      { id: 'm1', phase: 'pool', status: 'final', team_a_id: 't1', team_b_id: 't2', score_a: 21, score_b: 15, winner_team_id: 't1', pool_id: 'p1' },
      { id: 'm2', phase: 'pool', status: 'scheduled', team_a_id: 't2', team_b_id: 't1', net: 1, queue_order: 0 },
    ];
    const ctx = buildCopilotContext({ tournament: { name: 'Summer Slam', status: 'pools', teams, matches } });
    expect(ctx.tournament.name).toBe('Summer Slam');
    expect(ctx.tournament.status).toBe('pools');
    expect(ctx.tournament.standings[0]).toEqual({ rank: 1, team: 'Mikey Mouse Clubhouse', wins: 1, pointDiff: 6 });
    expect(ctx.tournament.upNextByNet).toEqual([{ net: 1, match: 'Spikers vs Mikey Mouse Clubhouse', queued: 0 }]);
  });

  test('empty: nothing going on -> nulls + zero attendance', () => {
    expect(buildCopilotContext({})).toEqual({
      attendance: { total: 0, byGroup: {}, here: [] },
      casualCourts: null,
      tournament: null,
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/pure.test.js`
Expected: the 5 new tests FAIL with `buildCopilotContext is not a function` (the existing 39 still pass).

- [ ] **Step 3: Write the implementation**

In `public/pure.js`, immediately before the `if (typeof module !== "undefined" …)` export block, add:

```js
// C28 Slice 1 — the admin AI co-pilot's READ context. PURE shaping + REDACTION (no DOM / no state global):
// the caller assembles `input` from state + getPublicLiveData(); this returns the compact, skill-free
// snapshot the edge function passes to Claude. Skill is admin-only and must NEVER reach the model (§AS-1),
// so the two skill-bearing inputs (players, generatedTeams) are stripped to name+group / name here.
function copilotRosterNames(team) {
  return (Array.isArray(team) ? team : [])
    .map((p) => String((p && p.name) || '').trim())
    .filter(Boolean);
}

function copilotUpNextByNet(matches, teams) {
  const nameById = {};
  (teams || []).forEach((t) => { if (t && t.id != null) nameById[t.id] = t.name || ''; });
  const live = (matches || []).filter((m) => m && m.phase === 'pool' && m.status !== 'final' && m.net);
  const byNet = {};
  live.forEach((m) => { (byNet[m.net] = byNet[m.net] || []).push(m); });
  return Object.keys(byNet).map(Number).sort((a, b) => a - b).map((net) => {
    const q = byNet[net].slice().sort((a, b) => (a.queue_order || 0) - (b.queue_order || 0));
    const up = q[0];
    return {
      net,
      match: `${nameById[up.team_a_id] || '?'} vs ${nameById[up.team_b_id] || '?'}`,
      queued: q.length - 1,
    };
  });
}

function buildCopilotContext(input) {
  const inp = input || {};
  const players = Array.isArray(inp.players) ? inp.players : [];
  const teams = Array.isArray(inp.generatedTeams) ? inp.generatedTeams : [];
  const liveData = inp.liveData || {};
  const tour = inp.tournament || null;

  // attendance (redacted: name + group only)
  const here = [];
  const byGroup = {};
  players.forEach((p) => {
    if (!p || !p.checked_in) return;
    const name = String(p.name || '').trim();
    const group = String(p.group || '').trim();
    here.push({ name, group });
    const key = group || 'Ungrouped';
    byGroup[key] = (byGroup[key] || 0) + 1;
  });
  const attendance = { total: here.length, byGroup, here };

  // casual courts (redacted rosters; null when no teams)
  let casualCourts = null;
  if (teams.length) {
    const matchups = Array.isArray(liveData.matchups) ? liveData.matchups : [];
    const results = (liveData.results && typeof liveData.results === 'object') ? liveData.results : {};
    const rosterFor = (n) => copilotRosterNames(teams[n - 1]);
    const playing = matchups.map((m, idx) => {
      const w = Number(results[`${m.teamA}-${m.teamB}`]);
      const winner = w === m.teamA ? 'A' : (w === m.teamB ? 'B' : null);
      return {
        court: idx + 1,
        teamA: { n: m.teamA, players: rosterFor(m.teamA) },
        teamB: { n: m.teamB, players: rosterFor(m.teamB) },
        winner,
      };
    });
    const onDeck = (Array.isArray(liveData.waitingTeams) ? liveData.waitingTeams : [])
      .map((n) => ({ team: n, players: rosterFor(n) }));
    casualCourts = { playing, onDeck, inProgress: Number(liveData.liveCount) || 0 };
  }

  // tournament (computeStandings output is already skill-free; null when none)
  let tournament = null;
  if (tour) {
    const standings = computeStandings(tour.teams || [], tour.matches || [])
      .map((r) => ({ rank: r.rank, team: r.name, wins: r.wins, pointDiff: r.pointDiff }));
    tournament = {
      name: tour.name || '',
      status: tour.status || '',
      upNextByNet: copilotUpNextByNet(tour.matches || [], tour.teams || []),
      standings,
    };
  }

  return { attendance, casualCourts, tournament };
}
```

Then add the three names to `module.exports` (append to the existing object):

```js
    disambiguatePlayersByName, groupRosterPlayersBySection, isValidFullName,
    copilotRosterNames, copilotUpNextByNet, buildCopilotContext
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run`
Expected: ALL tests pass (39 existing + 5 new = 44). Then `node --check public/pure.js` — clean.

- [ ] **Step 5: Commit**

```bash
git add public/pure.js test/pure.test.js
git commit -m "feat(c28): buildCopilotContext — redacted read snapshot for the admin co-pilot (TDD)"
```

---

### Task 2: `copilot` Supabase edge function

**Files:**
- Create: `supabase/functions/copilot/index.ts`

**Interfaces:**
- Consumes: POST body `{ question: string, context: object }` (context = `buildCopilotContext` output) + `Authorization: Bearer <admin JWT>` (auto-attached by `supabaseClient.functions.invoke`).
- Produces: `{ answer: string }` on success; `{ error }` with 401 (not admin) / 400 (empty question) / 502 (Anthropic/network).
- Secrets: `ANTHROPIC_API_KEY` (set out-of-band: `supabase secrets set ANTHROPIC_API_KEY=…`), plus the auto-provided `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`.

- [ ] **Step 1: Write the function**

Create `supabase/functions/copilot/index.ts`:

```ts
// C28 — copilot Edge Function (read-only AI assistant for admins). Holds ANTHROPIC_API_KEY
// (Supabase secret); the client bundle never sees it. Admin-only: requires the admin session JWT
// minted by admin_login (app_metadata.admin === true) — players, who have no admin JWT, get 401.
// Read-only: this function only ANSWERS; it never writes. Mirrors admin_login's CORS + generic-error
// hardening.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.5";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const MODEL = "claude-haiku-4-5";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

const SYSTEM = [
  "You are the Athletic Specimen admin co-pilot, helping the organizer run a pickup volleyball/basketball night.",
  "Answer ONLY from the JSON context in the user message. If the answer isn't in the context, say you don't have that info — never invent players, scores, courts, or counts.",
  "Never discuss, rank by, or infer player skill ratings — they are private and are not in your context.",
  "Be concise and courtside-friendly: short, direct answers an organizer can read at a glance.",
].join(" ");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    const reqHeaders = req.headers.get("access-control-request-headers");
    return new Response("ok", { headers: reqHeaders ? { ...cors, "Access-Control-Allow-Headers": reqHeaders } : cors });
  }
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // admin gate: require a valid admin session JWT (app_metadata.admin === true)
  const authz = req.headers.get("Authorization") || "";
  const jwt = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  if (!jwt) return json({ error: "unauthorized" }, 401);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });
  let isAdmin = false;
  try {
    const { data, error } = await admin.auth.getUser(jwt);
    isAdmin = !error && !!data?.user && (data.user.app_metadata as Record<string, unknown>)?.admin === true;
  } catch (_e) { isAdmin = false; }
  if (!isAdmin) return json({ error: "unauthorized" }, 401);

  // parse
  let question = "";
  let context: unknown = {};
  try {
    const body = await req.json();
    question = String(body?.question ?? "").trim();
    context = body?.context ?? {};
  } catch { /* bad body -> empty question -> 400 below */ }
  if (!question) return json({ error: "empty question" }, 400);

  // one Haiku call
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM,
        messages: [{
          role: "user",
          content: `Here is the current state as JSON:\n${JSON.stringify(context)}\n\nQuestion: ${question}`,
        }],
      }),
    });
    if (!resp.ok) {
      console.error("anthropic error", resp.status, await resp.text());
      return json({ error: "co-pilot unavailable" }, 502);
    }
    const data = await resp.json();
    const answer = Array.isArray(data?.content)
      ? data.content.filter((b: { type?: string }) => b?.type === "text").map((b: { text?: string }) => b.text || "").join("").trim()
      : "";
    return json({ answer: answer || "I couldn't come up with an answer from the current state." });
  } catch (e) {
    console.error("copilot call failed", (e as Error)?.message);
    return json({ error: "co-pilot unavailable" }, 502);
  }
});
```

- [ ] **Step 2: Deploy the function + set the secret**

Deploy via the Supabase MCP (`deploy_edge_function`, project `mlzblkzflgylnjorgjcp`, function `copilot`). Set the API key as a secret out-of-band (Mike, or `supabase secrets set ANTHROPIC_API_KEY=…`) — it is NOT committed.

- [ ] **Step 3: Verify live — admin gate + a real answer**

From the admin browser console (logged in as `nlvb2025`):
```js
await supabaseClient.functions.invoke('copilot', { body: { question: 'How many players are here?', context: buildCopilotContext({ players: state.players, generatedTeams: state.generatedTeams, liveData: getPublicLiveData(), tournament: copilotTournamentInput() }) } })
```
Expected: `{ data: { answer: "…" }, error: null }` with an answer that matches the real checked-in count. Then **logged out** (or a fresh anon client), the same invoke returns a 401 `unauthorized`. Confirm `console.error` server logs carry no key.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/copilot/index.ts
git commit -m "feat(c28): copilot edge function — admin-gated Haiku proxy (read-only)"
```

---

### Task 3: Chat UI in the Co-pilot tab (§38)

**Files:**
- Modify: `public/app.js` — replace `adminCopilotHTML()` (~line 5647) with the chat; add `handleCopilotSend` + `copilotTournamentInput` + message-render helpers + the tab's event wiring; bump `APP_VERSION` (~line 22).
- Modify: `public/styles.css` — chat styles (reuse existing tokens; SVG icons only).
- Modify: `public/sw.js` — bump `SW_VERSION` in lockstep.

**Interfaces:**
- Consumes: `buildCopilotContext` (Task 1), the `copilot` edge function (Task 2), existing `getPublicLiveData()`, `supabaseClient`, `state`.
- Produces: a working chat (input + send + 3 suggestion chips: *Who's up next? · How many here? · Tournament standings?*), driven by `handleCopilotSend(question)`.

- [ ] **Step 1: §38 — present three distinct chat layouts on localhost**

Build three genuinely distinct layouts for the Co-pilot tab (e.g. (A) full-height chat thread with chips pinned above the input; (B) answer-card stack — each Q&A a card, chips as a top row; (C) compact "ask bar" on top with answers listed below). Render each on localhost (`http://localhost:<port>`), screenshot, and present to Mike via AskUserQuestion. **Do not implement the real tab until Mike picks one.** Mobile-first; desktop secondary.

- [ ] **Step 2: Implement the chosen layout in `adminCopilotHTML()`**

Replace the static placeholder with the chosen layout's markup: a scrollable message list container (id `copilot-thread`), the three suggestion chips (`data-copilot-chip="Who's up next?"` etc.), a text input (`id="copilot-input"`), and a send button (`data-role="copilot-send"`, inline SVG icon). Keep `state.copilotMessages = []` as the in-memory thread; render messages by appending to `#copilot-thread` directly (NOT a full `render()` — preserves input focus/scroll).

- [ ] **Step 3: Wire the send handler (layout-independent)**

Add to `public/app.js`:

```js
// C28 Slice 1 — assemble the active tournament input for the co-pilot snapshot (null when none live).
function copilotTournamentInput() {
  const id = state.activeTournamentId;
  if (!id) return null;
  const active = (state.tournaments || []).find((t) => t.id === id);
  if (!active || !['pools', 'bracket', 'completed'].includes(active.status)) return null;
  return { name: active.name, status: active.status, teams: state.tournamentTeams || [], matches: state.tournamentMatches || [] };
}

// C28 Slice 1 — send a question to the read-only co-pilot. User action (not a background sync),
// but renders by appending to #copilot-thread directly so the input keeps focus.
async function handleCopilotSend(question) {
  const q = String(question || '').trim();
  if (!q) return;
  appendCopilotMessage('user', q);
  const loadingId = appendCopilotMessage('copilot', '…', { loading: true });
  try {
    const context = buildCopilotContext({
      players: state.players,
      generatedTeams: state.generatedTeams,
      liveData: getPublicLiveData(),
      tournament: copilotTournamentInput(),
    });
    const { data, error } = await supabaseClient.functions.invoke('copilot', { body: { question: q, context } });
    if (error || !data || !data.answer) throw new Error('copilot failed');
    replaceCopilotMessage(loadingId, data.answer);
  } catch (_e) {
    replaceCopilotMessage(loadingId, "Couldn't reach the co-pilot — try again.", { isError: true });
  }
}
```

Implement `appendCopilotMessage(role, text, opts)` / `replaceCopilotMessage(id, text, opts)` against the chosen layout (push to `state.copilotMessages`, append/replace a bubble in `#copilot-thread`, scroll to bottom, escape text via the existing `escapeHTMLText`). Wire the tab: send button + Enter key → `handleCopilotSend(input.value)` then clear input; each chip → `handleCopilotSend(chip.dataset.copilotChip)`. Follow the existing admin delegated-handler pattern.

- [ ] **Step 4: Bump versions + syntax check**

Bump `APP_VERSION` (`public/app.js` ~line 22) to today's `'2026.06.24.N'` and `SW_VERSION` (`public/sw.js`) to match. Run `node --check public/app.js` and `node --check public/sw.js` — both clean. `npx vitest run` — still 44 green.

- [ ] **Step 5: Verify live (§27/§41 — Mike's eyes, desktop + mobile)**

On localhost as admin, ask each of the three starter chips and a free-typed question. **Cross-check every answer against the actual `state`/DB:** headcount vs the checked-in count; "who's up next" vs the live courts board / net board; standings vs the Bracket tab. Confirm on desktop AND a mobile viewport, loading + error states render, the input keeps focus, 0 console errors. Confirm a logged-out user can't reach the co-pilot (Task 2 Step 3).

- [ ] **Step 6: Commit**

```bash
git add public/app.js public/styles.css public/sw.js
git commit -m "feat(c28): admin co-pilot chat in the Co-pilot tab (read-only, Slice 1)"
```

---

### Task 4: Ship + write-back

**Files:**
- Vault: `01-state/{log.md,current.md,NOW.md,decisions.md,debugging.md}`, `01-state/Tasks From Claude.md`, `12-history/task-#8-c28-copilot-slice1.md`

- [ ] **Step 1: Push (batched)** — `git push origin main` (Vercel auto-deploys the three commits + the spec/plan commit). Confirm the deploy is green and the live app loads at the new `APP_VERSION`.
- [ ] **Step 2: Production smoke** — on the live URL as admin, ask all three starters, cross-check answers, confirm 0 console errors; leave prod clean.
- [ ] **Step 3: §30 history file** — write `<vault>/12-history/task-#8-c28-copilot-slice1.md` (what was built, the deferred-#2 finding, verification evidence) BEFORE marking the task complete.
- [ ] **Step 4: Vault write-back** — `log.md` (one line, newest on top), `current.md` ("Right now" + C28 status), `decisions.md` (browser-snapshot-proxy architecture + defer-#2 + Haiku), `debugging.md` (no games-played counter finding), `Tasks From Claude.md` (C28 Slice 1 shipped; deferred #2 / games-tracking as a new backlog item), `NOW.md`.
- [ ] **Step 5: Mark task #8 complete** (after the history file exists).

---

## Self-Review

- **Spec coverage:** §2 use-cases 1/2/3 → Task 1 datasets (attendance, casualCourts, tournament) + Task 3 chips; deferred #2 → noted in plan, not implemented (correct). §3a edge fn → Task 2. §3b pure fn → Task 1. §3c chat UI → Task 3. §5 redaction → Task 1 redaction test (the spine). §6 model → Global Constraints + Task 2. §7 error handling → Task 2 (502/400/401) + Task 3 (catch → friendly message). §8 testing → Task 1 (TDD) + Task 2 Step 3 / Task 3 Step 5 (live). §9 file touch list → Tasks 1–3 files. No spec requirement left without a task.
- **Placeholder scan:** code steps carry full code; the only deliberately-deferred content is the §38 chat layout markup (Task 3 Steps 1–2), which is an interactive design choice, not a placeholder — the data path (`handleCopilotSend`, `copilotTournamentInput`) is concrete.
- **Type consistency:** `buildCopilotContext(input)` signature + output shape identical across Task 1 (def), Task 2 Step 3 (call), Task 3 (call). `copilotTournamentInput()` defined once (Task 3 Step 3) and referenced in Task 2 Step 3 / Task 3 handler. `getPublicLiveData()` shape (`matchups`/`waitingTeams`/`results`/`liveCount`) consistent. Edge fn `{question, context}` ↔ handler body match.
