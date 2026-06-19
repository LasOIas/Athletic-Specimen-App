# C22 Item 8 — Groups Table (catalog-only) Implementation Plan

> Executed inline this session (sequential: migration → app → deploy/verify → cleanup migration → verify). Spec: `docs/superpowers/specs/2026-06-19-c22-item8-groups-table-design.md` (approved Mike 2026-06-19).

**Goal:** Move the group catalog out of the `players` junk-drawer (`__as_group__:` pseudo-rows) into a real `groups` table, with no change to per-player membership.

**Architecture:** Additive `groups(id,name,created_at)` catalog table, ci-unique on `lower(btrim(name))`, RLS = C21 lock. Rewrite the 6 catalog functions' bodies (app.js:4671–4841) to use the table — names/signatures unchanged so the ~12 callers don't change; repoint the sync read-path (`remoteGroupCatalog`, app.js:4484). Expand→contract migration (0017 backfill keeping sentinels → deploy+verify → 0018 delete sentinels).

## Global Constraints
- Catalog-only: `players.group` + `players.tag` (`__as_groups__:` JSON) membership UNTOUCHED.
- Backfill = `__as_group__:` names ∪ distinct non-empty `players.group` (real rows), excluding `All`/`Ungrouped`. (Current: Athletic Specimen, Dot House [catalog-only, no players], KC Volleyball.)
- RLS anon SELECT, authenticated ALL; admin Group Manager CRUD = direct authenticated writes (no RPC).
- Migrations idempotent; never touch the 215 real player rows or the item-2 dedup index.
- APP_VERSION → `2026.06.19.1` (new MT day). `node --check` after every edit. Commit+push per phase. No trailers/emojis. No UI/visual change → no §38.
- §41 desktop+mobile verify; §30 history file before complete; update PRODUCT-SURFACE.

---

### Task 1: Migration 0017 — `groups` table + backfill (sentinels kept)
**Files:** Create `db/migrations/0017_c22_groups_table.sql`; apply via MCP.
- [ ] Write 0017: `create table if not exists groups`; ci-unique index `groups_name_ci_uidx on (lower(btrim(name)))`; `alter … enable rls`; policies `c22 anon read` (anon SELECT) + `c22 admin all` (authenticated ALL); grants (anon SELECT, authenticated all). Backfill `insert into groups(name) select … union … on conflict do nothing` excluding All/Ungrouped. Explicit `revoke`-not-needed (no functions added).
- [ ] Apply; `get_advisors(security)`; verify `select name from groups order by name` = {Athletic Specimen, Dot House, KC Volleyball}; sentinels still present (count=3).

### Task 2: app.js — repoint the 6 catalog functions + the sync read-path
**Files:** Modify `public/app.js` (4671–4841 catalog fns; 4484 sync; APP_VERSION line 28).
- [ ] `listGroupCatalogRowsSupabase()` → `from('groups').select('id,name')` (drop the `ilike '__as_group__:%'` on players).
- [ ] `ensureGroupCatalogEntrySupabase(name)` → find ci-match in `groups` → if none, `insert into groups(name)`; catch 23505 (ci-unique) → treat as exists. Drop the HAS_GROUP/HAS_TAG/skill payload (not applicable to `groups`).
- [ ] `renameGroupCatalogEntrySupabase(old,new)` → update the matching `groups` row's `name` (delete-old + ensure-new when ci-key changes), preserving semantics.
- [ ] `deleteGroupCatalogEntrySupabase(name)` → delete ci-matching `groups` row(s).
- [ ] `ensureGroupCatalogEntriesSupabase`/`backfillGroupCatalogToSupabase` bodies unchanged (loop over ensure; admin-gated).
- [ ] `syncFromSupabase` (4484): after the players loop, source `remoteGroupCatalog` from `listGroupCatalogRowsSupabase()` (the `groups` table); keep the per-row `parseGroupCatalogRowName` skip as a defensive filter.
- [ ] Keep `isGroupCatalogRow`/sentinel helpers (defensive). APP_VERSION → `2026.06.19.1`. `node --check` (clean).
- [ ] Commit + push (migration 0017 + app.js). Poll prod for `2026.06.19.1`.
- [ ] Verify on prod (desktop+mobile, admin): Group Manager lists all 3; add a group → new `groups` row (Network shows `groups`); rename → row renamed; delete → row gone; dropdown reflects each; 0 console errors. Clean up any test group.

### Task 3: Migration 0018 — delete sentinels + final verify + vault
**Files:** Create `db/migrations/0018_c22_drop_group_sentinels.sql`; apply via MCP.
- [ ] Apply `delete from players where name ilike '__as_group__:%'` (idempotent).
- [ ] Verify: `select count(*) from players where name ilike '__as_group__:%'` = 0; `select count(*) from players where left(name,5)<>'__as_'` = 212; dedup index intact; reload prod → dropdown still lists all 3 groups (now sourced from the table); 0 console errors.
- [ ] Vault: `log.md`, `current.md` (v2026.06.19.1; C22 fully DONE), `decisions.md`, `debugging.md` (if any), `Tasks From Claude` (item 8 + C22 → DONE), `PRODUCT-SURFACE` (groups table, verified_against), `12-history/task-#27-c22-item8-groups-table.md`.

## Verification gate
`groups` has all 3 names; Group Manager + dropdown list them; add/rename/delete hit `groups` (not players); after 0018 zero `__as_group__:` rows; 215 total / 212 real players untouched; dedup index intact; node --check clean; 0 console errors desktop+mobile.
