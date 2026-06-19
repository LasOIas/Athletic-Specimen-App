# C22 Item 8 — Groups table (catalog-only) — Design

**Status:** approved (Mike, 2026-06-19) — design only; build is a separate effort (writing-plans → build).
**Scope:** C22 item 8 ("clean the players junk-drawer"). Move the group **catalog** out of the `players`
table (today: `__as_group__:<name>` pseudo-rows) into a real `groups` table. **Catalog-only** —
per-player membership is NOT touched.

## Decision (locked)
**Catalog-only** (chosen over full-normalize and drop-multi-group). A real `groups` table replaces ONLY
the `__as_group__:` catalog pseudo-rows. Per-player membership stays exactly as today: `players.group`
(primary) + `players.tag` = `__as_groups__:<uri-encoded-json>` (full multi-group list). Multi-group keeps
working unchanged. Lowest-risk, on-mission, YAGNI.

## Problem
The group catalog (so a group exists before anyone is assigned to it) is stored as sentinel rows
`__as_group__:<name>` inside the `players` table, filtered out everywhere via `isGroupCatalogRow`. This
is the "junk-drawer" — catalog data masquerading as player rows. (The other sentinels — the
`__as_tournament_state__` blob — were already purged; `__as_groups__:` is a `tag`-column value on real
rows, i.e. real membership data, NOT a junk row, so it stays.)

## Architecture / data model (additive)
- **`groups`** (pure catalog of names):
  - `id uuid pk default gen_random_uuid()`
  - `name text not null` — the display name (case preserved)
  - `created_at timestamptz not null default now()`
  - **case-insensitive unique index** on `lower(btrim(name))` — matches today's `normalizeGroupKey`
    identity (`KC Volleyball` == `kc volleyball`; you cannot create two groups differing only by case).
- Reserved values **`All`** (global filter) and **`Ungrouped`** (no-group pseudo) are NEVER stored.
- Membership unchanged: `players.group` + `players.tag`. No FK from players → groups (membership is
  name-keyed, as today; catalog-only scope means no relational re-link).

**RLS (matches the C21 lock):** anon `SELECT`; `authenticated` ALL. Grants: anon SELECT, authenticated
full. The Group Manager is admin-only, so catalog add/rename/delete are **direct authenticated admin
writes** (no new RPC — consistent with the other admin-only direct writes like bulk/reset/save/clear).
Anon never creates catalog entries; any stray anon write attempt fails under the lock and is caught
(returns false), exactly as today.

## Behavior / app changes (surgical — keep names + signatures)
The six catalog functions (app.js:4671–4841) are rewritten to read/write the `groups` table instead of
`__as_group__:` rows. **Names and signatures are unchanged, so the ~12 call sites do not change:**
- `listGroupCatalogRowsSupabase()` → `select id, name from groups` (returns `{id,name}`; no more
  `ilike '__as_group__:%'` on players).
- `ensureGroupCatalogEntrySupabase(name)` → upsert into `groups` (find ci-match → no-op/normalize;
  else insert; `on conflict` on the ci-unique index → no-op).
- `renameGroupCatalogEntrySupabase(old,new)` → update the matching `groups` row's name (or delete-old +
  ensure-new when the ci-key changes), preserving the existing rename semantics.
- `deleteGroupCatalogEntrySupabase(name)` → delete the ci-matching `groups` row(s).
- `ensureGroupCatalogEntriesSupabase(names)` / `backfillGroupCatalogToSupabase()` → unchanged bodies
  that loop over `ensureGroupCatalogEntrySupabase` (admin-gated as today).

The **read-into-dropdown path** also repoints: `syncFromSupabase` currently derives `remoteGroupCatalog`
by parsing `__as_group__:` rows out of the players fetch (then `enforceCanonicalGroupState({catalogGroups})`
/ `mergeRemoteGroupCatalogIntoState`). After cleanup the sentinels are gone, so the sync must build
`remoteGroupCatalog` from the `groups` table (a small dedicated SELECT via `listGroupCatalogRowsSupabase`)
instead of from the players rows. `enforceCanonicalGroupState` / `mergeRemoteGroupCatalogIntoState` /
`state.groups` consumers are unchanged.

Keep `isGroupCatalogRow` + the `__as_group__:`/`toGroupCatalogRowName`/`parseGroupCatalogRowName` helpers
as defensive sentinel filters (per the C22 prompt: don't remove until reads are repointed + verified);
they become no-ops once the rows are deleted but guard against any straggler. No UI/visual change — the
Group Manager and dropdowns look identical, so **no §38** (data-layer only).

## Migration (expand → contract, idempotent)
- **`0017_c22_groups_table.sql` (expand):** `create table if not exists groups` + the ci-unique index +
  RLS (anon SELECT, authenticated ALL) + grants. **Backfill** from `union` of:
  (a) existing `__as_group__:` rows (strip the prefix), and
  (b) distinct non-empty `players.group` values over REAL rows (`left(name,5) <> '__as_'`),
  excluding `All`/`Ungrouped` (case-insensitively), `on conflict do nothing`. **Sentinel rows are LEFT
  in place** in this migration (additive; old + new coexist so the live app keeps working during the
  ~2-min Vercel deploy window).
- **Deploy the app** (reads/writes `groups`) → verify the dropdown lists every group + add/rename/delete
  hit the table.
- **`0018_c22_drop_group_sentinels.sql` (contract):** `delete from players where name ilike
  '__as_group__:%'` — only AFTER the app is verified, so groups are never lost mid-deploy. Idempotent.

## Verification gate (for the build)
- `groups` exists with every existing group name (catalog ∪ player-group values), 0 dupes, `All`/
  `Ungrouped` absent.
- Group dropdown + Group Manager list every group; add → new `groups` row (Network shows `groups`, not a
  `players` insert); rename → row renamed; delete → row gone; counts/badges unchanged.
- After 0018: `select count(*) from players where name ilike '__as_group__:%'` = 0.
- 215 real players untouched (`select count(*) from players where left(name,5) <> '__as_'` unchanged);
  the item-2 dedup index intact (it already excludes `__as_` rows).
- `node --check public/app.js` clean; 0 console errors; desktop + mobile.

## What this does NOT do (out of scope)
- No `player_groups` junction / membership normalization (full-normalize was rejected).
- No change to `players.group` / `players.tag` multi-group encoding.
- No drop of multi-group support.
- No new RPC (admin direct writes under the C21 lock).
- No Group Manager UI change.

## Risk
Low. Additive name-keyed table (no FK churn); membership untouched; sentinel deletion gated behind app
verification (expand→contract); real player rows never touched; the dedup index already excludes the
sentinel rows. Main care point: the backfill must capture groups that exist ONLY on players (not in the
catalog) so none are lost — hence the `union` with distinct `players.group`.
