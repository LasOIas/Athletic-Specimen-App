# C25 item 2 — SyncManager (consolidate scattered sync state)

**Date:** 2026-06-19
**Status:** Approved (Approach A) — ready to build
**Type:** Behavior-preserving refactor. NOT design-class (C25 prompt waives the brainstorm gate); shape approved by Mike via the brainstorming preview.
**Scope rule:** §38 N/A — non-visual (no UI/interaction change), so no 3-options step.

## Goal
Replace the ~20 ad-hoc module-level sync globals scattered through `public/app.js`
with **one `SyncManager` namespace object** that owns the refresh / poll / realtime
**engine state**. Behavior must be byte-for-byte identical at runtime — this is a
rename-through-a-namespace, not a logic change. Payoff: one clear home for sync
state so the later redesign (C26) + AI batches don't have to reason about 20 loose
globals on Mike's most-sensitive subsystem (sync ↔ the mobile scroll-jump).

## Approach A (approved) — core engine, state-only
- `SyncManager` holds the **state** (flags + timers + channels + seq counters).
- The existing functions stay **top-level** and read/write through `SyncManager`.
  No function bodies move; no call sites change. (Rejected B = also swallow the
  outbox + live-state flags — reduces cohesion of two already-clean mini-modules;
  rejected C = move functions onto the object — rewrites ~15+ call sites on the
  load-bearing path, highest regression risk.)
- The **outbox** (`flushOutbox`, `LS_OUTBOX_KEY`, `outboxFlushing`, @3788) and the
  **live-state save** (`queueLiveStateSave`, `liveStateSaveTimer`,
  `liveStateHydratedOnce`, @3728) are already cohesive units → **UNTOUCHED**.
- The dead **`saveTimeout`** (declared 1798, cleared once @4571, never assigned a
  timer anywhere — there is no `scheduleSave`) is **dropped** (Mike approved). The
  lone `clearTimeout(saveTimeout)` at 4571 clears an always-`undefined` value → a
  no-op; removing it is behavior-identical.

## The object (final shape — matches the approved preview)
```js
const SyncManager = {
  players:      { refreshTimer: null, refreshQueued: false, refreshRunning: false,
                  requestSeq: 0, appliedSeq: 0, liveChannel: null },
  groupCatalog: { timer: null, queued: false, running: false, lastSig: '' },
  tournament:   { refreshTimer: null, liveChannel: null },
  poll:         { interval: null },
  rt:           { backoff: { live: 0, tournament: 0 },
                  resubTimer: { live: null, tournament: null } },
  forceSaveRunning: false,
  hooksBound: false,
};
```
(`null` for timers vs the old `undefined` is safe — every read of a timer global is a
`clearTimeout()` or a falsy guard, both no-op/falsy for null and undefined alike.)

## Old global → new path (the complete mapping)
| Old global | Decl line | New path |
|---|---|---|
| `saveTimeout` | 1798 | **DROP** (dead) |
| `forceSaveRunning` | 1799 | `SyncManager.forceSaveRunning` |
| `refreshTimeout` | 1801 | `SyncManager.players.refreshTimer` |
| `refreshQueued` | 1802 | `SyncManager.players.refreshQueued` |
| `refreshRunning` | 1803 | `SyncManager.players.refreshRunning` |
| `groupCatalogSyncTimeout` | 1804 | `SyncManager.groupCatalog.timer` |
| `groupCatalogSyncQueued` | 1805 | `SyncManager.groupCatalog.queued` |
| `groupCatalogSyncRunning` | 1806 | `SyncManager.groupCatalog.running` |
| `lastGroupCatalogSyncSignature` | 1807 | `SyncManager.groupCatalog.lastSig` |
| `crossDeviceRefreshInterval` | 1808 | `SyncManager.poll.interval` |
| `supabaseLiveSyncChannel` | 1809 | `SyncManager.players.liveChannel` |
| `supabaseSyncRequestSeq` | 1810 | `SyncManager.players.requestSeq` |
| `supabaseSyncAppliedSeq` | 1811 | `SyncManager.players.appliedSeq` |
| `_rtBackoffAttempt` | 1824 | `SyncManager.rt.backoff` |
| `_rtResubTimer` | 1825 | `SyncManager.rt.resubTimer` |
| `authorityRefreshHooksBound` | 1881 | `SyncManager.hooksBound` |
| `_tournamentRefreshTimer` | 2882 | `SyncManager.tournament.refreshTimer` |
| `tournamentLiveSyncChannel` | 2889 | `SyncManager.tournament.liveChannel` |

Usage sites (all behavior-identical): players refresh @1814-1816/1934-1936/1953-1955;
backoff @1827-1835; live channel @1843-1844/1857-1859; hooks @1883-1884; group catalog
@1972-1995; tournament @2884-2885/2891-2893; seq counters @4102/4138/4147/4210/4241/4248;
forceSave @6197-6220; poll @7144-7146.

## Build plan (ordered)
1. Replace the `let saveTimeout; … let supabaseSyncAppliedSeq = 0;` block (1798-1811)
   with the `const SyncManager = {…}` object above.
2. Remove the now-folded decls: `_rtBackoffAttempt`/`_rtResubTimer` (1824-25, keep the
   comment), `authorityRefreshHooksBound` (1881), `_tournamentRefreshTimer` (2882),
   `tournamentLiveSyncChannel` (2889).
3. Rewrite each usage site to the new path (per the table). Identifiers are unique →
   safe `replace_all` per name, then verify.
4. Remove the dead `clearTimeout(saveTimeout)` + its stale comment in `forceSaveAllToSupabase`.
5. Bump `APP_VERSION` (app.js) + `SW_VERSION` (sw.js) in lockstep.

## Verification gate (concrete — sync is NOT pure, so unit tests don't apply)
- `node --check public/app.js` passes.
- Grep proof: **zero** occurrences of any old identifier remain; SyncManager is the
  only home (decl count = 1).
- Existing `cd test && npx vitest run` still green (proves the pure.js extraction
  wasn't disturbed) — 19 tests.
- Localhost SPA boot: 0 console errors; check a player in → **exactly one** refresh
  fires (no loop / no double-fetch) via console/network; realtime resubscribe path
  intact; tournament refresh intact.
- Prod smoke after push: load `/` + `/checkin.html`, new APP_VERSION live, 0 console errors.

## Risks & mitigations
- **Load-bearing subsystem (sync ↔ scroll-jump, Mike's #1 frustration).** Mitigation:
  state-only (no logic touched), `node --check` + grep-zero-old-identifiers + live
  check-in refresh-once verification before claiming done.
- **TDZ:** `const SyncManager` at ~1798 is initialized before any sync function is
  *called* (all run post-init), and before `queueSupabaseRefresh` @1812 is even
  defined — no temporal-dead-zone hazard.
- **`null` vs `undefined` timers:** verified safe (see note above).

## Write-backs (per §30 / CLAUDE.md)
`01-state/log.md` + `current.md` (+ version), `decisions.md` (SyncManager shape +
why outbox/live-state stay separate), `12-history/task-#<id>-c25-item2-syncmanager.md`,
`03-anatomy/PRODUCT-SURFACE.md` (note SyncManager + bump `verified_against`),
`Tasks From Claude.md` (C25 item 2 status), update `task-prompts/C25-tests-tech-debt.md`.
