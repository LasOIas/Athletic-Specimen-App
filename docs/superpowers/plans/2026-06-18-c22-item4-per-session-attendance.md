# C22 Item 4 — Per-Session Attendance Implementation Plan

> **For agentic workers:** executed inline this session (sequential DB→UI; not fan-out-able). Steps use checkbox syntax for tracking.

**Goal:** Replace the global `players.checked_in` singleton-plus-Reset with per-session attendance records, so last night's check-ins don't bleed into tonight and each night's roster is preserved as durable history.

**Architecture:** Additive only. Two new tables (`attendance_sessions`, `check_ins`); the three existing C21 SECURITY DEFINER RPCs (`check_in`/`check_out`/`register_player`) extended to write a per-session `check_ins` row alongside the unchanged `players.checked_in` flip; a new `start_new_session(p_label)` RPC replaces the admin Reset; an idempotent cutover seed. `players.checked_in` stays the live UI source of truth — no read path changes.

**Tech Stack:** Postgres (Supabase `mlzblkzflgylnjorgjcp`), vanilla-JS SPA (`public/app.js`).

## Global Constraints (verbatim from spec + house rules)
- `players.checked_in` stays the live UI source of truth; `check_ins` is durable history written alongside (no read-path rewrite — §49 "derived view" end-state deferred).
- RLS matches the C21 lock: both new tables anon `SELECT`, `authenticated` ALL; all mutations via SECURITY DEFINER RPCs.
- Exactly one active `attendance_sessions` row at a time (partial unique index + the start-new-session RPC).
- Cutover seed is idempotent (only when no active session exists). 212 real players + dedup index + every other table untouched.
- Bump `APP_VERSION` in `public/app.js` (~line 22) for the app.js change; format `YYYY.MM.DD.N`.
- `node --check public/app.js` after every edit. Commit + push after the fix.
- Button relabel is a UI change → §38 three options on localhost + screenshot + Mike's pick before shipping; §41 desktop + mobile verify.
- Migration head is `0014`; next file is `0015`. `players.id` is `uuid`. The **live** `register_player` is the C21-hardened skill-free TABLE-projection version (NOT the older on-disk `0007` body) — extend the live body.

---

### Task 1: Migration 0015 — tables, RLS, helper, RPC extensions, start_new_session, cutover seed

**Files:**
- Create: `db/migrations/0015_c22_attendance_sessions.sql`
- Create: `db/migrations/0015_c22_attendance_sessions_ROLLBACK.sql`
- Apply: Supabase MCP `apply_migration` to `mlzblkzflgylnjorgjcp`

**Produces (for the app layer):** `start_new_session(p_label text) returns uuid` (authenticated-only); `check_in(uuid)` / `check_out(uuid)` / `register_player(text,text,boolean)` now also maintain `check_ins`.

- [ ] **Step 1:** Write `0015_…sql` (two tables + indexes + partial-unique-one-active + RLS/grants + `current_session_id()` helper [revoked from public] + extended `check_in`/`check_out`/`register_player` + `start_new_session(text)` [authenticated-only] + idempotent cutover seed).
- [ ] **Step 2:** Write the ROLLBACK (drop the two RPCs' new behavior back to live bodies, drop `start_new_session`/`current_session_id`, drop `check_ins` then `attendance_sessions`).
- [ ] **Step 3:** `apply_migration`. Then `get_advisors(security)` + `get_advisors(performance)` — fix anything new.
- [ ] **Step 4 (verify, synthetic — real `checked_in=0` so non-destructive):**
  - Create 2 synthetic players (`__as_t1`, `__as_t2`); `check_in` each → assert a `check_ins` row exists for the active session + `players.checked_in=true`.
  - `check_out` one → assert its `check_ins` row gone, `checked_in=false`.
  - `register_player('__as_t3','',true)` → assert player checked_in + a `check_ins` row in the active session.
  - `start_new_session(null)` → assert: exactly one active session (the new one), the prior session is `is_active=false`+`ended_at` set, **prior session's `check_ins` rows preserved** (history), all `players.checked_in=false`.
  - Confirm exactly one active session via the partial unique index (a second active insert must fail).
- [ ] **Step 5 (cleanup to a clean prod state):** delete synthetic players (cascade drops their `check_ins`), then reset attendance to exactly one fresh active empty session (lossless — no real attendance exists). Verify 212 real + 3 sentinels intact, dedup index intact.

### Task 2: app.js — relabel Reset → "Start new session", call the RPC

**Files:**
- Modify: `public/app.js:5225` (button label/markup), `public/app.js:6853-6900` (handler), `public/app.js` APP_VERSION (~line 22).

- [ ] **Step 1:** Relabel `#btn-reset-checkins` text "Reset" → "Start new session" (final label/class/copy decided by the §38 pick).
- [ ] **Step 2:** Handler: keep the master-admin gate + capture `previouslyCheckedIn`; reword the confirm to "Start a new session? …everyone checked out; tonight's attendance is saved."; replace the direct `players.update({checked_in:false})` with `supabaseClient.rpc('start_new_session', { p_label: null })`; on success `state.checkedIn=[]; saveLocal(); queueSupabaseRefresh()`; keep the `undo:{kind:'checkins', checkedIn: previouslyCheckedIn}` affordance (spec: keep existing undo); update the operator-action title/detail/action copy to "Started a new session."
- [ ] **Step 3:** Bump `APP_VERSION` → next `YYYY.MM.DD.N`. `node --check public/app.js` (expect clean).
- [ ] **Step 4 (§38):** localhost @1920 + @390, admin-logged-in: render 3 button variants (label/colour/confirm-copy), screenshot each, `AskUserQuestion` for Mike's pick. Apply the pick.
- [ ] **Step 5:** Final `node --check`; commit (migration files + app.js); push → Vercel.

### Task 3: P3 verify on prod + vault writeback

- [ ] Prod desktop + mobile (§41): admin login → button shows "Start new session" → click → confirm → DB cross-check (new active session, `checked_in=false`, prior `check_ins` preserved); a self-serve check-in writes a `check_ins` row; 0 console errors; screenshots to `.playwright-mcp/`.
- [ ] Writeback: `01-state/log.md` (top), `01-state/current.md` (bump), `01-state/decisions.md` (dual-record model + manual-start), `12-history/task-#26-c22-item4-per-session-attendance.md`, `Tasks From Claude.md` C22 item 4 → DONE, `03-anatomy/PRODUCT-SURFACE.md` (new tables/RPCs + verified_against).

## Verification gate (from spec)
`attendance_sessions` + `check_ins` exist; exactly one active session; a check-in writes a `check_ins` row + still flips `checked_in`; check-out removes it; "Start new session" → new active session, all `checked_in=false`, prior session's `check_ins` preserved; a second night shows zero checked-in with no per-player reset; 212 real players + dedup index untouched; anon read-only, RPC-only mutations; 0 console errors; desktop + mobile; §38 three options for the relabel.
