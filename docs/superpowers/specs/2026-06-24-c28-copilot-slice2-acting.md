# C28 — Admin AI Co-pilot · Slice 2 (acting)

- **Date:** 2026-06-24
- **Status:** design approved (actions + safety + architecture); spec under review
- **Task:** #13 · C-ID **C28** (Slice 2, building on Slice 1)
- **Builds on:** `docs/superpowers/specs/2026-06-24-c28-admin-ai-copilot.md` (Slice 1, read-only — SHIPPED v2026.06.24.5). Related: C21 (locked RLS + SECURITY DEFINER RPCs), rulebook §AS-1 (skill redaction).

## 1. Why

Slice 1 made the co-pilot *answer*. Slice 2 makes it *act* — the admin can say "make 4 teams from who's checked in," "check in Jet," "Team 2 beat Team 4," or "set up a tournament with these teams," and the co-pilot does it. This is the marquee C28 feature (the original placeholder said "make 4 teams of 4… or start a 6-team tournament and it'll do it").

## 2. Scope

**Four actions (Mike picked all four):**
1. **Check players in / out** — by name.
2. **Make teams** — "make N teams from who's checked in" (runs the existing balancer, sets the courts).
3. **Submit a score** — a tournament match score, or a casual-game win.
4. **Tournament setup** — create a tournament, add teams, draw pools, generate the bracket (coarse-grained — see §6).

**Out of scope (later):** clean multi-step undo for scores/tournament (we confirm those instead); voice; proactive/unprompted suggestions; deleting players/tournaments via the co-pilot.

## 3. Architecture — browser-driven tool loop (Approach A)

Most of these actions are **browser-orchestrated** (the balancer + tournament `tdb*` functions + live court state live in the browser); only check-in/out and tournament scores are direct server RPCs. So the **browser drives the tool loop** and the `copilot` edge function stays the thin, key-holding Claude relay (as in Slice 1).

- **`copilot` edge fn (extended):** now also passes Claude a set of **write-tool definitions** (alongside the Slice-1 read context). It remains a per-call relay: the browser POSTs the running Claude `messages` + the tool list; the edge fn makes **one** Claude call and returns either a final `text` answer or a `tool_use` block. Admin-JWT gate + `ANTHROPIC_API_KEY` secret unchanged. (Model: stays Haiku for now; revisit if tool-use accuracy needs Opus.)
- **Browser loop + tool executors:** the browser holds the `messages` array and runs the standard manual tool loop — POST → if `tool_use`, run the matching local executor, append the `tool_result`, POST again → until Claude returns `end_turn`. A **tool registry** maps each tool name to a local executor, each wrapped in its safety policy:
  - `check_in(name)` / `check_out(name)` → resolve the player by name (existing disambiguator) → C21 `check_in`/`check_out` RPC.
  - `make_teams(count)` → existing balancer on the checked-in set → set `generatedTeams` + live court order.
  - `submit_score(...)` → tournament `submit_match_score` RPC, or the casual-win path.
  - `setup_tournament(...)` / `generate_bracket(...)` → the existing `tdb*` orchestration.
- **Security property:** the co-pilot acts with the **admin's existing privileges** (the same RPCs/functions the admin's own taps use). It gains **no new powers**, can't bypass RLS, and the confirm/undo gates are enforced **in the browser executor — not by trusting the model**.

## 4. Data flow (the loop)

```
"make 4 teams and check in Jet"
  → browser: messages=[…, user] + read-context + write-tools  → POST copilot
  → Claude: tool_use make_teams(4)                            → browser runs it (instant + undo), append tool_result → POST
  → Claude: tool_use check_in("Jet")                          → browser runs it (instant + undo), append tool_result → POST
  → Claude: text "Made 4 teams and checked in Jet."           → render, loop ends
```
Confirm-required tools pause the loop for the user's tap before executing (see §5).

## 5. Safety — hybrid, browser-enforced (Mike's pick)

Per-tool policy, enforced in the browser executor:

| Tool | Policy |
|---|---|
| `check_in` / `check_out` | **Instant + Undo** (cleanly reversible) |
| `make_teams` | **Instant + Undo** (restore the prior teams; clean if no game played yet) |
| `submit_score` | **Confirm first** (a tournament score advances the bracket; a casual win nudges skill ratings — messy to undo) |
| `setup_tournament` / `generate_bracket` | **Confirm first** (multi-step) |

- **Confirm UX:** when Claude returns a confirm-required `tool_use`, the browser renders a `[Confirm]/[Cancel]` card in the chat thread showing exactly what it'll do, and **pauses the loop**. On Confirm → execute + report the result to Claude. On Cancel → report "user cancelled" so Claude responds appropriately.
- **Undo UX:** instant tools render the result + a short-lived `[Undo]` chip; Undo reverses the action (check-out↔check-in; restore the prior `generatedTeams`/court order).
- **The gate is the executor, not the prompt:** the policy map is code; even if the model omitted a confirm, the executor still confirms. The system prompt also describes the tools + that confirm-tools require approval (belt-and-suspenders).

## 6. Tournament setup = coarse-grained

Rather than fragile per-step tools, expose **one** `setup_tournament(name, teams[], format)` that runs create → add-teams → draw-pools in a single **confirmed** step (preview = the tournament name + team list + format), and a separate confirmed `generate_bracket()`. Keeps the loop short and the confirm meaningful. (Fine-grained tournament editing stays in the existing UI.)

## 7. Audit

A new small **`copilot_actions`** table (one migration) logging each executed action for transparency: `{ at, actor, request_text, tool, args (redacted — no skill), result, undone }`. Written server-side (via a tiny audit RPC, since RLS is locked). The C21 RPCs (`check_in`/`submit_match_score`/…) continue to log to `action_log` via `_audit_actor` independently. The admin can see "what the co-pilot did" from `copilot_actions`.

## 8. Error handling

- A tool execution failure (unresolvable name, no one checked in, RPC error, CAS conflict) is reported back to Claude as the `tool_result` (with `is_error`), so the model tells the user plainly ("I couldn't find a player named X — did you mean…?").
- Network / edge-function errors → the Slice-1 friendly chat message.
- A confirm-required tool whose preview can't be built (e.g. malformed args) → ask the user to rephrase rather than guessing.

## 9. Testing

- **TDD the pure parts (`pure.js` + vitest):** tool-argument validation, player-name resolution to a single match (reuse/extend `disambiguatePlayersByName`), and the **safety-policy map** (assert each tool's policy). Redaction: `copilot_actions` args carry no skill.
- **Executors verified live:** drive each of the 4 actions in the connected browser (or Mike's phone), cross-check the DB after each (§27/§41) — a check-in writes the row, make-teams sets the courts, a score updates standings, a tournament is created; confirm + undo behave.
- **Edge-fn relay verified via curl** (tool_use round-trip).
- `node --check` + vitest green; `APP_VERSION`/`SW_VERSION` lockstep. §38 for the new chat UI (confirm card + undo chip).

## 10. Open items to confirm at build (not blockers)

- Exact local function names for the executors (balancer handler, casual-win recorder, `tdb*` create/add/draw/bracket) — pin during the plan/TDD against `app.js`.
- The casual-win path mutates skill ratings — confirm whether `submit_score` for casual wins should be confirm-required *and* whether the skill nudge is in scope (it's an existing behavior of recording a win; the co-pilot just triggers the same path).
- Whether `make_teams` undo should be blocked once a result has been recorded on the new teams (likely: Undo disappears after the first game).

## 11. Foreshadow (later slices)

More actions (start a new session, delete/rename, rebalance a single team), proactive suggestions ("3 people have sat out two rounds — want me to sub them in?" — needs the deferred games-tracking feature), and a possible model bump to Opus if Haiku's tool-selection accuracy isn't enough.
