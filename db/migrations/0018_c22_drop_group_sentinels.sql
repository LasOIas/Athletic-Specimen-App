-- 0018_c22_drop_group_sentinels.sql
-- C22 item 8 — CONTRACT phase: delete the `__as_group__:<name>` group-catalog sentinel rows from
-- `players`, now that the catalog lives in the real `groups` table (0017) and the app (v2026.06.19.1)
-- reads/writes the table. Applied ONLY after the app build was deployed + verified on prod, so the
-- live app never lost a group mid-deploy. Idempotent. Does NOT touch real player rows.
-- Applied to mlzblkzflgylnjorgjcp 2026-06-19.
delete from public.players where name ilike '__as_group__:%';
