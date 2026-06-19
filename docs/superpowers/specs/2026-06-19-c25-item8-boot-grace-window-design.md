# C25 item 8 — post-boot grace window (collapse the redundant cold-boot fetch)

**Date:** 2026-06-19
**Status:** Approved (Approach A) — ready to build
**Type:** Design-class (changes refresh-throttling semantics on the load-bearing sync path), brainstormed + Mike-approved. Non-visual → §38 N/A.

## Problem (confirmed by prior investigation, debugging.md)
At cold boot, `init()` loads data once (`syncFromSupabase` + `loadLiveStateFromSupabase` +
`tdbRefreshTournaments`). Then a **second** full background refresh fires ~800ms later, triggered by
the realtime `SUBSCRIBED` catch-up **or** the `focus`/`visibilitychange` events that fire right after
page load. `queueSupabaseRefresh`'s 800ms debounce coalesces them into one redundant fetch — so roster
+ tournaments each hit the network ~2× at boot. Gating only the SUBSCRIBED path (tried + reverted)
didn't help because `focus` still triggers the same coalesced refresh.

## Approach A (approved) — one-shot, per-domain, boot-scoped grace window
After `init()`'s initial sync succeeds, record `SyncManager.bootSyncAt = Date.now()` and arm a one-shot
flag per domain (`SyncManager.players.bootGraceArmed`, `SyncManager.tournament.bootGraceArmed`). The
first background refresh in each domain that fires within `BOOT_GRACE_MS` (1500ms) of `bootSyncAt`
**disarms its flag and returns without fetching** — init already loaded fresh data. After that one skip
(or once the window passes), all refreshes run normally.

Rejected: **B** (suppress the focus/visibility/SUBSCRIBED triggers during boot — more invasive, touches
the hook-binding path that also drives self-heal); **C** (won't-fix — defensible, but Mike chose to fix).

### Why this is safe (preserves self-heal + convergence)
- The skipped refresh is redundant *by construction*: init just loaded fresh data <1.5s ago.
- Self-heal (realtime resubscribe catch-up after a mid-session disconnect) happens well after boot —
  `bootGraceArmed` is already consumed / the window long passed — so it is **not** suppressed.
- One-shot per domain: only the single post-boot redundant refresh is skipped; the next refresh runs.
- Boot-scoped by timestamp: a genuine `focus`/`visibilitychange` refresh after the 1.5s window runs
  normally. If the page loads backgrounded and no refresh fires in the window, the flag simply goes
  unused (harmless — no stuck state).
- `bootSyncAt` starts at 0 and `bootGraceArmed` at false → before init arms it, no skip can occur
  (double-guarded).

## Changes (4 edits + version)
1. **SyncManager object** (`app.js:1803`): add `bootSyncAt: 0` (top-level) + `bootGraceArmed: false` to
   `players` and `tournament`. Add `const BOOT_GRACE_MS = 1500;`.
2. **`runQueuedSupabaseRefresh`** (after the `refreshRunning || !refreshQueued` guard, ~1933):
   ```js
   if (SyncManager.players.bootGraceArmed && (Date.now() - SyncManager.bootSyncAt) < BOOT_GRACE_MS) {
     SyncManager.players.bootGraceArmed = false; // one-shot: init already loaded fresh roster
     SyncManager.players.refreshQueued = false;
     return;
   }
   ```
3. **`refreshTournamentLive`** (top, ~2862):
   ```js
   if (SyncManager.tournament.bootGraceArmed && (Date.now() - SyncManager.bootSyncAt) < BOOT_GRACE_MS) {
     SyncManager.tournament.bootGraceArmed = false; // one-shot: init's tdbRefreshTournaments already loaded
     return;
   }
   ```
4. **`init()`** (right after `const synced = await syncFromSupabase();`, only when `synced`):
   ```js
   SyncManager.bootSyncAt = Date.now();
   SyncManager.players.bootGraceArmed = true;
   SyncManager.tournament.bootGraceArmed = true;
   ```
   (Only arm on a successful initial sync — if it failed, no fresh data, so the retry must NOT be skipped.)
5. APP_VERSION + SW_VERSION → `.13` (lockstep).

Init's initial loads are the DIRECT calls (`syncFromSupabase`, `tdbRefreshTournaments`); the gates live
in the QUEUED executors (`runQueuedSupabaseRefresh`, `refreshTournamentLive`), so the initial load is
never skipped — only the redundant second one is.

## Verification gate
- `node --check`.
- **Localhost cold boot, count REST requests:** roster (`/players?select=id,name…`) and tournaments
  (`/tournaments?select=*`) each fire **once** at boot (was ~2×). (Schema-probe `select=group/tag` and
  the groups/live_state reads are separate and unaffected.)
- **Grace state:** after boot, `SyncManager.players.bootGraceArmed`/`tournament.bootGraceArmed` are
  `false` (consumed) and data loaded (212 players, state `live`).
- **A genuine later refresh still works:** after >1.5s, dispatch `focus` → a refresh fires (requestSeq
  increments) — proves the window is boot-scoped, not a permanent suppressor.
- **Prod smoke:** v.13 live, boot fetches reduced, 0 console errors.

## Write-backs
`12-history/task-#41`, `log.md`, `current.md`, `decisions.md` (the grace-window design + why one-shot/
boot-scoped), `debugging.md` (mark the item-8 symptom FIXED), `Tasks From Claude.md`, `PRODUCT-SURFACE.md`,
the C25 prompt.
