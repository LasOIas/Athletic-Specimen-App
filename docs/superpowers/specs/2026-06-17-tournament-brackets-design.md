# Athletic Specimen — Tournament & Brackets (v1 Design Spec)

**Date:** 2026-06-17
**Status:** Draft for Mike's review
**Author:** Claude (brainstorming session)
**Repo:** `C:\Users\OlasM\OneDrive\Athletic Specimen App\` · `public/app.js` (vanilla-JS SPA) · Supabase `mlzblkzflgylnjorgjcp` · Vercel

---

## 1. Problem & goal

Athletic Specimen is a mobile-first pick-up-sports app. Its tournament feature is the weakest part: it's a legacy full-screen overlay, the only working format is round-robin, the single-elimination engine that exists is **dead code the UI never calls**, and the "bracket" the user sees is a flat 6-column table with no mobile-scroll handling. The entire tournament — teams, seeds, matches, scores — is serialized to JSON and stuffed into the `tag` column of one hidden `players` row, with a single global revision counter for concurrency.

**Goal:** turn this into a real, reliable, mobile-first volleyball tournament app — "like Volleyball Life, but better" — whose centerpiece is **readable brackets on every phone**. The differentiator vs. Volleyball Life: **every team enters its own game results from its own phone, and the app auto-tallies standings and auto-seeds the bracket** — eliminating Mike's current pen-and-paper + manual admin tally.

This spec covers **v1**. AI features are explicitly deferred (see §11) but the data model is built clean enough to accept them with no rework.

---

## 2. Decisions locked (from Mike, this session)

| Topic | Decision |
|---|---|
| **Format** | Pool play → seed → **one double-elimination main bracket**. **No plate/consolation bracket** — the losers bracket IS the second-life path. |
| **Scale** | 17–24 teams, ~4 pools, ~10 nets (courts). |
| **Pool match** | One game to an **admin-set cap (21 / 15 / 25)**, configurable **per tournament**. Point-differential = the game's margin. |
| **Standings** | Rank by **W-L, then point differential**, then head-to-head. |
| **Seeding** | **Every team advances**; pool finish (record + point diff) decides the **seed** into the double-elim bracket. |
| **Who scores** | **Anyone, from their own phone** — open access (pick your team, no login). Either team submits a result; **admin can override/lock**. |
| **Bracket scoring** | **Tap the winner to advance** by default; **scores optional**. |
| **Scheduling** | **Net queue, no clock** — app assigns matches to nets with a play order; "play and go" as nets free up. |
| **Persistence** | **Real Supabase relational tables**, row-level concurrency (so many phones scoring different nets don't collide). |
| **Rendering** | **Single-round focus on phones** + **classic connector-line tree on wide screens (≥641px)**. Same data drives both. Vanilla JS/CSS, no library. |
| **Pool draw** | **Random draw + manual adjust** (admin can re-arrange any team). |
| **Grand Final** | Standard double-elim **bracket reset included**, but the admin can **skip** the reset game. |
| **Score trust** | **Open submission** (anyone picks their team, no login); **admin override/lock is the backstop**; implausible entries flag for the admin. |
| **Deploy** | Claude's call (Mike isn't using the live app currently) → **feature branch with Vercel preview, merge each solid phase to `main`**. |
| **AI** | **None in v1.** Roadmap only (see §11). |

---

## 3. Non-negotiable app rules this must honor

- **Bump `APP_VERSION`** (`public/app.js` ~line 22, `YYYY.MM.DD.N`) on every code change.
- **`partialRender()` / surgical DOM updates for all background syncs** — never full `render()` (causes the mobile scroll-jump). Any always-open tournament UI must be registered in the capture/restore transient-state functions, or it snaps shut every 15s sync.
- **`node --check public/app.js`** after every edit; commit + push (Vercel auto-deploys).
- **Mobile is the primary device.** The real iPhone is the test, not the emulator. Ship the smallest slice and confirm on-device before piling on.

---

## 4. How it fits the existing app

- **Re-home the tournament from the legacy overlay into a real tab-panel**, mirroring the **Teams tab** pattern: admin-gated `data-nav-tab="tournament"` nav button, a `<div id="tab-tournament" class="tab-panel">` sibling, content built as a string inside `render()`, live state on the global `state` object, persisted via `saveLocal()`, and **delegated `data-*` event handlers** (not rebound per render).
- **Reuse the sync engine** (realtime channel `athletic-specimen-live-sync` + 15s poll + authority hooks). The tournament*-prefixed sync state fields already exist on `state`. The new module updates its own DOM region surgically.
- **Reuse the "Live Nets" mental model** — pool/bracket matches run on the same net/court concept Mike already uses.
- The current `players` table keeps the real roster; tournament data moves to **new tables** (§6), not the `tag`-column blob.

---

## 5. User flows / screens

**A. Setup (admin)**
1. Create a tournament (name; match cap; pool count; net count).
2. Add teams (17–24), each with members (linked to real player rows where possible, else free names).
3. Assign teams to pools: **random draw + manual adjust** (admin can re-arrange any team).
4. Generate the pool schedule: round-robin within each pool, every match assigned to a **net + play order** (a per-net queue).

**B. Pool play (self-serve, any phone, no login)**
1. Open app → **pick your team** → see your pool, your matches, your net, and who's "up next."
2. After a game, **either team submits**: who won + the two scores. Live immediately. Admin can fix/lock.
3. App **auto-tallies standings**: wins, then point differential. (Kills the manual add-up.)
4. **Net queue advances**: a result submitted → that net's next queued match becomes "up."

**C. Seed (automatic)**
1. Pool play complete (or admin locks pools) → app ranks all teams (record → point diff) → assigns seeds 1..N.
2. Seeds populate the double-elim bracket. **Admin reviews + locks** before bracket play.

**D. Bracket (double elimination)**
1. All teams enter one double-elim bracket (Winners + Losers sides, Grand Final w/ optional bracket-reset — see Q2).
2. Matches run on the net queue.
3. **Tap the winner to advance** (scores optional). Winner moves up; first loss drops to the losers side; second loss eliminates. Champion at the end.

**E. Trust / access**
- Open submission (pick your team). Admin override + lock on any match. Conflicting/implausible entries flagged for the admin.

---

## 6. Data model (real Supabase tables — delta from today)

Replaces the single JSON blob in `players.tag`. Row-level optimistic concurrency per match.

| Table | Key columns | Purpose |
|---|---|---|
| `tournaments` | id, name, status (setup/pools/bracket/completed), match_cap, pool_count, net_count, session_id, created_at, updated_at | The event. (Today: only in the blob.) |
| `pools` | id, tournament_id FK, label (A/B/…), display_order | **Pool concept — absent today.** |
| `teams` | id, tournament_id FK, name, seed (overall), pool_id FK (nullable until drawn) | In-memory only today. |
| `team_members` | team_id FK, player_id FK→players.id, captain flag, PK(team_id, player_id) | **Biggest gap** — links teams to real players (today: free-text keys). |
| `matches` | id, tournament_id FK, phase (pool/main), side (winners/losers/grand_final), pool_id FK (nullable), round, slot, net, queue_order, team_a_id, team_b_id, source_a, source_b, status (scheduled/live/final), score_a, score_b, winner_team_id, loser_team_id, **winner_next_match_id + winner_next_slot, loser_next_match_id + loser_next_slot**, version (concurrency), updated_at | One row per match. The **loser_next_*** columns route losers down the bracket — they **don't exist today**. |

- **Standings** are computed from `matches` (pool phase) — a view or a client-side reducer, ranked W-L → point diff → head-to-head.
- **RLS:** result-submission fields (winner, scores, status) writable by anon (open access, acceptable for a pick-up event); structural changes (creating/seeding/locking, bracket generation, overrides) restricted to the admin role. (See Open Question Q3.)
- `match_scores` (set-by-set) is **out of scope for v1** — v1 is a single game per match; one score pair suffices.

**The render-critical fact:** every match slot is either a concrete team OR a **source reference** (`"Pool A #1"`, `"Winner of W-QF1"`, `"Loser of W-QF1"`). The renderer draws purely from the match array — never hardcodes positions — so it re-renders cheaply and respects `partialRender()`.

---

## 7. Bracket generation (deterministic — no AI, ever)

- **Pool draw:** distribute teams into pools by **random draw, with manual adjust**. Round-robin schedule per pool.
- **Seeding:** rank all teams by pool finish (record → point diff → head-to-head) → overall seeds 1..N.
- **Double-elim build:** generate the Winners bracket (with byes for the top seeds when N isn't a power of two), the Losers bracket, and the Grand Final, wiring every match's `winner_next_*` and `loser_next_*` pointers. This is pure, reproducible combinatorial code with unit tests — the exact class of logic that must NOT touch an LLM.

---

## 8. Rendering spec

**Phone (default, ≤640px) — single-round focus:**
- Top: `[ Pools | Bracket ]` toggle. Pools = standings tables (Rank, Team, W-L, Pt Diff with +/- color; qualified rows highlighted).
- Bracket: `[ Winners | Losers | Grand Final ]` tabs → sticky horizontally-scrollable **round pills** → **one round at a time**, swipe or tap to change. Each match is a **full-width card**: two team rows (seed badge + name + score), status chip (Final / Live / Up next / Scheduled), Net badge, and a muted **"Winner → … · Loser → …"** progression line. Winner row bold + success-tinted + check; loser muted. TBD slots show the source label.

**Wide (≥641px) — classic tree:**
- Same match array drawn as the descending tree: rounds as columns, fixed-width cards, connector lines, horizontal scroll acceptable.

**Both:** exact app design tokens, light theme only, ≥44px tap targets, ≥18px scores, high contrast (no light-gray hairlines), no emoji (except the winner check). Semantic markup so it degrades to a readable fixture list.

---

## 9. Reliability & concurrency

- **Row-level optimistic concurrency** per match (`version` column / CAS) so two phones scoring different nets never collide on the whole tournament (today's failure mode).
- Cloud-authoritative sync (existing pattern): localStorage is cache; Supabase is truth.
- Standings + seeding recompute deterministically from match rows.

---

## 10. Build phases (rock-solid base first, ship a slice early)

0. **Schema migration** — create the tables + RLS; apply & verify (idempotent).
1. **Tournament tab re-home + setup** — admin creates tournament, adds teams, configures pools + match cap + nets; reads/writes the real tables.
2. **Self-serve pool play** — pick team, submit result from any phone, **live standings auto-tally**, net queue.
3. **Auto-seed + double-elim generation** — deterministic, unit-tested.
4. **Bracket rendering + advancement** — single-round (phone) + tree (wide), tap-winner / optional scores, loser routing, champion.
5. **Polish + reliability check** (§35) on desktop + on a real iPhone.

Each phase: concrete verification gate, `APP_VERSION` bump, commit/push, vault writeback, and a `12-history` file before it's marked done.

---

## 11. Out of scope for v1 (roadmap — schema built to accept these)

- **AI roster-paste parser** (paste a messy text dump → clean teams/pools). Safe one-shot call, never in the bracket path.
- **Read-only "where/what" chat assistant** ("who plays next / what's on net 3 / where's my team") — Mike's "almost autonomous" goal. A small add-on on the clean relational schema.
- Timed scheduling; per-team auth/PIN; best-of-3 set scoring; a separate plate bracket.

---

## 12. Verification gates (overall "done")

- Brackets render **readably on a real iPhone** (the named deliverable) — single-round on phone, tree on wide.
- **Two phones scoring different nets don't collide** (concurrency test).
- Standings + seeding **auto-compute correctly** (deterministic unit tests + a worked example).
- Full **reliability check** (§35) passes on desktop **and** mobile before "done."

---

## 13. Resolved decisions (Mike, 2026-06-17)

- **Q1 — Pool assignment:** **Random draw + manual adjust.** App randomly distributes teams into pools; admin can re-arrange any team. (No skill-based snake in v1.)
- **Q2 — Grand Final:** **Bracket reset included, admin can skip.** Standard double-elim: if the losers-bracket finalist wins the final, a second deciding game is played (the winners-bracket finalist had no losses); admin may skip it.
- **Q3 — Open-submission security:** **Open is fine; admin override/lock is the backstop.** Anon can submit results (matches the "everyone on their phone" goal); structural changes (seeding, locking, bracket generation, overrides) stay admin-only. A light per-team code can be added post-v1 if abuse appears.
- **Q4 — Deploy flow:** **Feature branch + Vercel preview, merge each solid phase to `main`.** Mike isn't actively using the live app, so this is Claude's call; the branch keeps the live app from breaking mid-build and gives a preview URL for verification.

---

*Next step after approval: `superpowers:writing-plans` → a sequenced implementation plan with per-task verification gates.*
