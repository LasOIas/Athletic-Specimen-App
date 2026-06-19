# C22 Item 4 — Per-Session Attendance (manual-start) — Design

**Status:** approved (Mike, 2026-06-19) — design only; build is a separate, fresh effort.
**Scope:** C22 item 4. Replaces the global `players.checked_in` singleton with per-session attendance
records so last night's check-ins don't bleed into tonight, and so each night's roster is preserved
as history. Manual session model (admin taps "Start new session"); full scheduling/RSVP stays C30;
the rich history *view* stays C33.

## Problem
Today `players.checked_in` is one global boolean per player. The admin taps **Reset**
(`btn-reset-checkins`) to clear everyone for a new night. Consequences: (a) no record of who attended
any past night; (b) attendance is one global state with no notion of "which session." (See the 44→0
incident — a global wipe is unrecoverable precisely because there's no per-session record.)

## Decision (locked)
**Manual "Start new session"** model. A "session" is a night the admin explicitly begins. Each gets
its own attendance record. Chosen over auto-by-date (one/day, midnight split) and full scheduled
sessions (= pulling C30 forward). Lightweight, admin-controlled, matches the casual pickup model.

## Architecture / data model (additive — no existing table changes shape)
Two new tables. The existing `sessions` row (id=1: date/time/location) is the check-in **banner** and
is left untouched (kept separate from attendance sessions; possible future unification noted, not now).

- **`attendance_sessions`**
  - `id uuid pk default gen_random_uuid()`
  - `label text` — human label, defaults to a date-stamp (e.g. "Wed Jun 18"), admin-editable later
  - `group text` — nullable; which group's night (or null = all). For now always null/'All' (single
    global session at a time, matching today's single-state model).
  - `started_at timestamptz default now()`
  - `is_active boolean default true` — **exactly one active** session at a time (enforced by the
    Start-new-session RPC deactivating the prior one; a partial unique index guards it).
  - `ended_at timestamptz` nullable.
- **`check_ins`**
  - `id uuid pk default gen_random_uuid()`
  - `session_id uuid` → `attendance_sessions(id)` on delete cascade
  - `player_id uuid` → `players(id)` on delete cascade
  - `at timestamptz default now()`
  - **unique (session_id, player_id)** — one row = "this player attended this session."

**RLS (matches the C21 lock):** both tables — anon `SELECT`; `authenticated` ALL. Grants: anon SELECT,
authenticated full. All mutations happen via SECURITY DEFINER RPCs (so they keep working under the
lock for anon self-serve check-in).

## Behavior

### `players.checked_in` stays the live UI source of truth (low-risk cutover)
The dozens of check-in **read** paths (the count, team generation's `checkedIn` set, the sync merge,
every render) keep reading `players.checked_in` unchanged. `check_ins` is added as the durable
**history** record written alongside. (The §49 "checked_in as a derived view of the active session"
end-state is explicitly deferred — dual-record now is far lower risk than rewriting every read path,
and delivers the value: history + clean session separation.)

### Check-in / check-out (extend the existing C21 RPCs — one place)
- `check_in(p_id)` → set `players.checked_in=true` (as today) **and** `insert into check_ins
  (active_session_id, p_id) on conflict (session_id,player_id) do nothing`.
- `check_out(p_id)` → set `checked_in=false` **and** `delete from check_ins where session_id=active
  and player_id=p_id`.
- A helper `current_session_id()` (or inline) resolves the single active `attendance_sessions` row;
  if none exists, it lazily creates one (so check-ins always have a home — see cutover).
- `register_player(..., p_checked_in=true)` (kiosk path) → also inserts the check_ins row.
- The client's per-card delegate, by-name, and kiosk paths already call these RPCs (C21/C22 item 3),
  so **no client check-in call sites change** — the per-session record is captured server-side.

### "Start new session" (replaces Reset)
- New RPC `start_new_session(p_label text default null)` (SECURITY DEFINER, authenticated only):
  deactivate the current active session (`is_active=false, ended_at=now()`), insert a new active
  session (label = given or a date-stamp), and set **all** `players.checked_in=false`. The prior
  session's `check_ins` rows remain as history.
- UI: the admin **Reset** button (`btn-reset-checkins`) is relabeled **"Start new session"** with a
  count-aware confirm ("Start a new session? This checks everyone out; tonight's attendance is saved.")
  and keeps the existing Undo affordance where present. (Visual change = §38 three options on
  localhost before shipping; §41 desktop+mobile.)

### Cutover (idempotent migration)
On first apply: create one active `attendance_sessions` row and seed `check_ins` from the players
currently `checked_in=true`, so the live night isn't lost. Idempotent (only if no active session
exists). The 212 real players + the dedup index + every other table are untouched.

## What this does NOT do (deferred)
- The rich "past sessions / who attended each night" **view + recap** → **C33**.
- Scheduling, RSVP, capacity, recurring, calendar, per-group simultaneous sessions → **C30**.
- Making `checked_in` a derived DB view → later, optional (only if the dual-record proves insufficient).

## Components / files (for the plan)
- Migration `0015_c22_attendance_sessions.sql` (next free number after 0014): the two tables + RLS + grants + partial unique index
  on `is_active` + `current_session_id()`/`start_new_session()` RPCs + extend `check_in`/`check_out`/
  `register_player` to write `check_ins` + the idempotent cutover seed.
- `public/app.js`: relabel the Reset button → "Start new session" + call `start_new_session`; confirm
  dialog copy; (no change to the check-in call sites — server-side capture).
- No change to `checkin.html` call sites (kiosk already uses the RPCs).

## Verification gate (for the build)
- `attendance_sessions` + `check_ins` exist (MCP `list_tables`); exactly one active session.
- A check-in writes a `check_ins` row for the active session; check-out removes it; `players.checked_in`
  still flips (live flag intact).
- "Start new session" → new active session, all `checked_in=false`, the **prior** session's `check_ins`
  rows preserved (history). Two session ids show distinct attendance.
- A second night shows zero checked-in without a manual per-player reset.
- 212 real players + dedup index untouched; anon can read but only the RPCs mutate; 0 console errors;
  desktop + mobile; §38 three options for the button relabel.

## Risk
Lower than item 8: additive tables + one-place RPC extension; the live UI read path (`checked_in`) is
unchanged. Main care points: the "exactly one active session" invariant (partial unique index +
RPC), and the cutover seed being idempotent. Build is sizable (new tables + 3 RPC edits + RPC for
start-new-session + the button UX), so it's a fresh focused effort, not a tail-of-session push.
