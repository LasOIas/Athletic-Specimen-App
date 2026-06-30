# Seed override (manual seeding before Generate) — design

**Date:** 2026-06-30
**Origin:** Manage admin-coverage audit (#7, "manual seed/advance overrides"). Mike chose "both
equally"; the manual-advance half was **dropped** — the bracket score modal
(`openBracketResultModal`) already has a forfeit path ("No-show? Record a forfeit → who showed
up?") that resolves a game with a chosen winner and no score, advancing winner + loser. The audit's
"manual advance — nowhere" was stale (forfeit was added in the C71 redesign after the audit).

## Goal
Let an admin override the auto-computed bracket seeding before generating, so the bracket isn't
forced to follow win% → point-diff when the admin knows better (tie-break disputes, etc.).

## Decisions (from the brainstorm)
- **Transient** (Mike): the custom order lives in local state until Generate — no DB column, no
  migration, no cross-device sync. Use case = "reorder, then generate in the same sitting."
- **Interaction:** ▲/▼ arrows per team row (Mike) — reliable on iOS touch (drag was rejected; the
  bracket's drag/zoom already gave us iOS trouble). Plus a "Reset to computed" action.
- **Scope:** admin-only, on Manage > Bracket's PRE-generate view (status = pools, all pool games
  final — where the Generate button / banner lives). The read-only seeding table everywhere else
  (public, other admin views) is unchanged.

## Behavior
- The pre-generate seeding list (admin) renders editable: each row shows its current seed + the
  team, with ▲ (move up one seed) / ▼ (move down one seed) buttons. Top row's ▲ and bottom row's ▼
  are disabled.
- The order is held in `state.seedOverride` = an array of `teamId`s in seed order (seed 1 first).
  Initialized lazily from `computeSeeding(...)` the first time the admin nudges; a ▲/▼ swaps two
  adjacent entries and re-renders the list (no DB write).
- A "Reset to computed" link clears `state.seedOverride` → the list reverts to `computeSeeding`.
- **Generate uses the override:** the `tv2-generate-bracket` handler (and the genBanner / genCard
  buttons that share it) pass the override order into `tdbGenerateBracket` when
  `state.seedOverride` is set for this tournament; otherwise the existing `computeSeeding` order.
  `tdbGenerateBracket` maps seed `i+1` → `seedOverride[i]` (a permutation of all teams) instead of
  the computed ranking; all downstream generation is unchanged.
- The override is cleared after a successful generate (and on tournament switch) so it can't leak
  into a later regenerate with stale data.

## Validation / edges
- `state.seedOverride` is always a permutation of the current team set (it starts from the full
  computed order and only swaps adjacent entries). If the team set changes (a team added/removed)
  before generate, fall back to `computeSeeding` (override invalid) — guarded by a length/teamId
  check.
- Transient: a refresh or another device loses the override (accepted — Mike chose transient).
- A pool score edited after an override is set: the override (by teamId) stays as the admin set it
  (intentional — they're overriding); "Reset to computed" re-syncs to the new computed order.

## Build notes
- The editable seeding row is a UI change → a quick §38 (3 layout options for the editable row)
  before shipping; mobile + desktop.
- Verify on a throwaway tournament (Supabase MCP / real session): set a custom order, Generate,
  confirm seed 1 = the team the admin put first (not the computed top seed).
- Files: `buildSeedingTableHTML` (an editable admin variant) / `app.js` `tv2-generate-bracket` +
  new `tv2-seed-up`/`tv2-seed-down`/`tv2-seed-reset` handlers / `tdbGenerateBracket` (accept an
  optional seed order) / a little CSS for the row controls. No `pure.js` change (computeSeeding
  stays the default).

## Out of scope
- Manual advance without a score (already covered by forfeit).
- Persisted/cross-device seed override (transient only).
- Editing seeds after the bracket is generated (reset the bracket first, then re-seed + regenerate).
