# Tournament — Phase 1: Data Layer + Tab Re-home (Implementation Plan)

> **For agentic workers:** Execute inline (superpowers:executing-plans). Steps use `- [ ]`.

**Goal:** Give the tournament feature a real home: a JS data-access layer over the Phase-0 Supabase tables, and the tournament UI moved from the legacy fullscreen overlay into a proper `#tab-tournament` tab-panel. Admin can create a tournament + add/remove teams; the public sees a read-only view. Everything persists to real tables.

**Architecture:** All in `public/app.js` (single-file SPA pattern — match it). Add tournament state fields to the global `state`; add additive `tdb*()` data-access functions using the existing `supabaseClient`; build `buildTournamentTabHTML()` as a string inside `render()` (mirrors `adminTeamsHTML`); add a `#tab-tournament` panel to the shell; repoint `activateMainTab` so `'tournament'` toggles the tab-panel instead of opening the overlay; register a once-bound delegated click listener `bindTournamentTabV2()` for the `data-role="tv2-*"` actions. Legacy overlay code (`#view-tournament`, `initTournamentView`, `handleTournamentAction`) is left dormant (not deleted this phase — removal is a later cleanup, avoids the §29 sweep-up risk).

**Tech Stack:** Vanilla JS, `@supabase/supabase-js@2.39.5` (already loaded), Supabase project `mlzblkzflgylnjorgjcp`.

## Global Constraints

- Bump `APP_VERSION` (`public/app.js:22`) to `'2026.06.17.1'` (new day, N=1).
- `node --check public/app.js` must pass after every edit.
- Background syncs use `partialRender()` only; never full `render()`.
- No emojis; match existing code style.
- Branch `feat/tournament-brackets`. Commit per logical step.
- RLS is open (Phase 0) — admin gating is client-side via `state.isAdmin`.

## File structure (Phase 1)

- **Modify only:** `public/app.js`
  - `state` object (~2594) — add tournament fields.
  - New `tdb*()` functions (data-access) — placed near other Supabase helpers.
  - New `buildTournamentTabHTML()` — placed near `adminTeamsHTML` construction in `render()`.
  - Shell template (~8102) — add `#tab-tournament` panel after `#tab-teams`.
  - `activateMainTab` (~8419) — remove the overlay special-case.
  - New `bindTournamentTabV2()` + call in `render()` tail (~8404).
  - App init/bootstrap — load tournaments after players load.

---

## Task 1: Tournament state + data-access layer

**Interfaces produced (used by Tasks 2-3):**
- `state.tournaments: Array<{id,name,status,match_cap,pool_count,net_count,created_at}>`
- `state.activeTournamentId: string|null`
- `state.tournamentTeams: Array<{id,name,seed,pool_id,tournament_id}>`
- `async tdbListTournaments(): Promise<row[]>`
- `async tdbCreateTournament({name,match_cap,pool_count,net_count}): Promise<row>`
- `async tdbDeleteTournament(id): Promise<void>`
- `async tdbListTeams(tournamentId): Promise<row[]>`
- `async tdbAddTeam(tournamentId,name): Promise<row>`
- `async tdbDeleteTeam(teamId): Promise<void>`

- [ ] **Step 1:** Add state fields (`tournaments:[]`, `activeTournamentId:null`, `tournamentTeams:[]`, `tournamentTabLoading:false`, `tournamentTabError:''`) to the `state` object.
- [ ] **Step 2:** Add the `tdb*()` functions (additive; guard on `supabaseClient`; `console.error` + re-throw on write errors so handlers can surface them).
- [ ] **Step 3:** `node --check public/app.js` → PASS.
- [ ] **Step 4:** Browser-verify the data layer directly (Chrome DevTools `evaluate_script`): call `tdbCreateTournament` → `tdbAddTeam` → `tdbListTeams` → `tdbDeleteTournament`; confirm via Supabase MCP that rows appear then cascade-delete. Commit.

## Task 2: Tournament tab UI (admin + public) + shell panel

- [ ] **Step 1:** Add `buildTournamentTabHTML()` returning: if `!isAdmin` → read-only active-tournament view (name, status, team list) or an empty state; if `isAdmin` and no `activeTournamentId` → a Create-Tournament form (`tv2-name`, `tv2-cap`, `tv2-pools`, `tv2-nets`) + list of existing tournaments (select/delete); if `isAdmin` and active → tournament header + Add-Team form (`tv2-team-name`) + team list with delete + a "back to tournaments" button. Use existing card/markup classes + `escapeHTML`.
- [ ] **Step 2:** Insert `<div id="tab-tournament" class="tab-panel"><div class="container">${buildTournamentTabHTML()}</div></div>` into the shell after `#tab-teams`.
- [ ] **Step 3:** `node --check` → PASS. Commit.

## Task 3: Repoint nav + wire handlers + load on init

- [ ] **Step 1:** In `activateMainTab`, delete the `if (tab === 'tournament') { showTournamentView(true); initTournamentView(); return; }` block so `'tournament'` toggles the `#tab-tournament` panel like the others.
- [ ] **Step 2:** Add `bindTournamentTabV2()` — a once-bound (`_tv2Bound` guard) delegated `document` click listener handling: `tv2-create-tournament`, `tv2-select-tournament` (data-id), `tv2-delete-tournament` (data-id), `tv2-back`, `tv2-add-team`, `tv2-delete-team` (data-id). Each reads inputs by id, calls the matching `tdb*()`, reloads `state.tournaments`/`state.tournamentTeams`, then `render()`. Call `bindTournamentTabV2()` in the render tail.
- [ ] **Step 3:** On app bootstrap (after players load), call `tdbListTournaments()` → `state.tournaments`, then `partialRender()` (or `render()` if first paint).
- [ ] **Step 4:** Bump `APP_VERSION` to `'2026.06.17.1'`. `node --check` → PASS. Commit.

## Task 4: Verify end-to-end (P3) + push

- [ ] **Step 1:** Serve `public/` locally; open in Chrome DevTools at 390×844; set `state.isAdmin=true` via `evaluate_script` + `render()` (local test bypass — no prod security touched).
- [ ] **Step 2:** Click the Tournament nav → the new tab-panel renders (NOT the overlay). Create a tournament; add 2 teams; delete a team; switch tournaments; delete the tournament. Screenshot each key state. Confirm rows in Supabase via MCP after create/add.
- [ ] **Step 3:** Run the 9-question Mike-reading checklist on the tab (readable, mobile, plain English, empty states sensible). Save screenshots to `.playwright-mcp/`.
- [ ] **Step 4:** Confirm the existing Players/Teams/Session tabs still render (no regression from the shell/activateMainTab change).
- [ ] **Step 5:** Commit, push the branch, write the `12-history/task-#9` file, update `Tasks From Claude.md` C3 → DONE, `log.md` + `current.md`. Mark task #9 complete.

## Self-review (done)

- **Spec coverage:** Implements spec §4 (re-home to tab) + §5A start (create tournament, add teams) + §6 tables via the data layer. Pool/match UI is Phase 2+. ✓
- **Placeholder scan:** Concrete function signatures + data-role names + verification steps; full code written at execution. ✓
- **Type consistency:** `tdb*` names + state field names used consistently across tasks. ✓
- **Scope:** Phase 1 = data layer + tab shell + tournament/team CRUD; produces a working, testable slice. ✓
