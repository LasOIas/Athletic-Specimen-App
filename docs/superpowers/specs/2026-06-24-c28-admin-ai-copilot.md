# C28 — Admin AI Co-pilot · Slice 1 (read-only answers)

- **Date:** 2026-06-24
- **Status:** design approved (architecture + model), spec under review
- **Task:** #8 · C-ID **C28** (the marquee admin AI assistant)
- **Related:** C21 (locked RLS + `admin_login` edge fn) · C47 / rulebook **§AS-1** (skill is admin-only, hard redaction) · C26 (the static Co-pilot placeholder this replaces)

## 1. Why

The admin runs the night from a phone, courtside. The co-pilot is a chat in the admin **Co-pilot** tab that answers "what's going on right now" questions instantly, instead of the admin scanning four different screens. Slice 1 is **read-only** — it answers, it never acts. (Acting is Slice 2, deliberately separate so the read surface is safe by construction: there are no write tools to misuse.)

## 2. Scope

**In Slice 1** — the co-pilot answers the four read use-cases Mike picked:

1. **Who's up / on deck** — the court queue / rotation order.
2. **Who hasn't played / sat out** — fairness (games-played counts).
3. **Headcount / who's here** — attendance, total + by group.
4. **Standings / tournament status** — the active tournament's state.

**Out of Slice 1 (YAGNI — lands in Slice 2 or later):**
- Any write/action path, server-side tool-loop, or RPC invocation.
- An `admin_actions` audit table (nothing to audit until the co-pilot can act).
- Streaming responses; prompt-caching (Haiku + short prompts = pennies — add only if cost shows up).

## 3. Architecture — browser snapshot → thin proxy

The admin browser **already holds all four datasets** in `state` (`state.players`, `state.courts`, `state.tournaments`). So Slice 1 needs no database work in the edge function — the browser builds a compact, redacted snapshot and the edge function is a thin, key-holding proxy that makes one Claude call.

Three components:

### 3a. `copilot` edge function (new — `supabase/functions/copilot/index.ts`)
- Sibling of `admin_login`. Holds `ANTHROPIC_API_KEY` as a Supabase secret (`supabase secrets set ANTHROPIC_API_KEY=…`). The key never enters the client bundle.
- **Admin-only gate:** the browser calls it via `supabaseClient.functions.invoke('copilot', { body })`, which auto-attaches the admin's session JWT (minted by `admin_login`, carrying `app_metadata.admin: true`). Unlike `admin_login` (`verify_jwt=false`, self-auth), `copilot` **verifies the JWT and requires `app_metadata.admin === true`** — players have no admin JWT, so they get a 401. (Confirm the exact verify path against the deployed `admin_login` flow at build: either `verify_jwt=true` + a claim check, or manual `auth.getUser(jwt)` + claim check.)
- Receives `{ question, context }`. Builds the Anthropic request: a stable **system prompt** (role + the 4 capabilities + the redaction rule + "answer only from the provided context; if it's not there, say you don't have it — never invent data") and one **user message** = the context snapshot (JSON) + the question.
- One non-streaming Claude call. Returns `{ answer: string }`, or a generic error.

### 3b. `buildCopilotContext(state)` (new pure fn — `public/pure.js`)
- Returns a compact JSON object with exactly the four datasets, **excluding `skill` by construction** (it never reads `player.skill`). Mirrors the existing `disambiguatePlayersByName` precedent in `pure.js` (a deliberate "NO-SKILL row shape … §AS-1").
- Lives in `pure.js` so vitest covers it (CommonJS export + classic-script global, same as every other pure fn).
- **Snapshot shape** (compact — names + counts, not full records; exact source fields mapped against `state` during implementation):
  - `attendance`: `{ total, byGroup: {group: count}, here: [{ name, group }] }`
  - `courts`: `[{ court, playing: [name…], onDeck: [name…] }]` — who's on each court + the queue order.
  - `rotation`: `[{ name, gamesPlayed, satOut }]` — fairness counts per checked-in player.
  - `tournament`: `{ active: bool, name, status, standings: [{ rank, team, wins, pointDiff }] }` (from the existing `computeStandings` shape) or `{ active: false }`.
- Empty states are first-class: nobody checked in → `attendance.total: 0, here: []`; no tournament → `{ active: false }`.

### 3c. Chat UI in the Co-pilot tab (`public/app.js` + `public/styles.css`)
- Replaces the static `adminCopilotHTML()` placeholder (app.js ~5645, rendered into `#tab-copilot`).
- A message list (admin questions + co-pilot answers), a text input + send button, and **four suggestion chips** matching the use-cases: *Who's up next? · Who hasn't played? · How many here? · Tournament standings?*
- Mobile-first (courtside phone). Loading state while the call is in flight; error state on failure.
- On send/tap: `buildCopilotContext(state)` → `supabaseClient.functions.invoke('copilot', { body: { question, context } })` → render `answer`.
- **§38:** this is a UI change, so the build presents **three distinct layouts** on localhost before shipping (hook-enforced). That happens in the build phase, not in this spec.

## 4. Data flow

```
admin taps chip / types question
  → buildCopilotContext(state)            // browser, redacted (no skill)
  → functions.invoke('copilot', {question, context})   // admin JWT auto-attached
  → edge fn: verify admin JWT → system + context + question → ONE Haiku call
  → { answer }
  → chat renders the answer
```

No DB round-trip. No writes. Skill never leaves the browser.

## 5. Skill redaction (the security spine)

Three layers, the first load-bearing:
1. **By construction** — `buildCopilotContext` never includes `skill`. The model cannot reveal a rating it never received. One function, one test (assert the stringified snapshot contains no skill value).
2. **System prompt** — explicit "never discuss, rank by, or infer player skill ratings."
3. **Admin-only** — the function rejects non-admin callers, so the co-pilot surface is never exposed to players regardless.

## 6. Model & cost

- **`claude-haiku-4-5`**, `max_tokens: 1024`, non-streaming, no `thinking` config (simple structured-data Q&A — Haiku handles it directly). $1 / $5 per million tokens, 200K context (far more than a snapshot needs).
- One call per question. A busy session night of dozens of questions costs cents.
- Raw `fetch` to `https://api.anthropic.com/v1/messages` from the Deno edge runtime (no npm SDK in the edge function), `anthropic-version: 2023-06-01`. Always check `stop_reason` and read the first `text` block defensively.

## 7. Error handling

- Edge fn unreachable / Anthropic error / 429 → chat shows a friendly "Couldn't reach the co-pilot — try again," never a stack trace.
- Missing API key / provisioning error → 500 with a generic client body; detail to server logs only (mirrors `admin_login`'s hardening).
- Empty/whitespace question → client-side guard, no call.
- Read-only: worst case is a wrong or declined answer — zero data risk.

## 8. Testing

- **TDD `buildCopilotContext` (vitest, `test/pure.test.js`):** correct shape for each of the four datasets; **redaction test** (no skill in output); empty-state handling (nobody here / no tournament); multi-group attendance counts.
- **Edge function:** verified live — deploy, then in the connected browser ask all four starter chips and **cross-check each answer against the actual `state`/DB** (§27/§41), desktop **and** mobile. Confirm a non-admin (logged-out) call is rejected.
- `node --check public/app.js` + `node --check public/sw.js` clean; vitest green; `APP_VERSION` + `SW_VERSION` bumped in lockstep.

## 9. File touch list (anticipated)

- **new** `supabase/functions/copilot/index.ts`
- `public/pure.js` (+ export) — `buildCopilotContext`
- `test/pure.test.js` — context-builder + redaction tests
- `public/app.js` — chat UI in `adminCopilotHTML()` + send handler + `APP_VERSION`
- `public/styles.css` — chat styles
- `public/sw.js` — `SW_VERSION` lockstep
- secret: `ANTHROPIC_API_KEY` (Supabase secret, set out-of-band)

## 10. Open items to confirm at build (not blockers)

- Exact `copilot` JWT-verification path (claim check vs `verify_jwt` + check) — confirm against the deployed `admin_login` session flow.
- Exact `state` source fields for rotation/games-played and the courts queue — map during the pure-fn TDD.
- Whether to log questions (anonymous, for tuning) — default **no** for Slice 1.

## 11. Slice 2 foreshadow (not built now)

Acting (check a player in, submit a score, rebalance teams) becomes a server-side **tool-use loop**: the `copilot` function gains write-tools that call the existing C21 SECURITY DEFINER RPCs, with dry-run/confirm gates and an `admin_actions` audit table. The Slice-1 system prompt, chat UI, and redaction tests carry over; the proxy becomes a loop. Building it now would be premature — Slice 1 ships first and teaches us what the co-pilot is actually asked.
