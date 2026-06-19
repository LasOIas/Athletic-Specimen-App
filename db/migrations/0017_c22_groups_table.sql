-- 0017_c22_groups_table.sql
-- C22 item 8 — move the group CATALOG out of the players junk-drawer (`__as_group__:<name>` pseudo-rows)
-- into a real `groups` table. Catalog-only: per-player membership (players.group + players.tag
-- `__as_groups__:` JSON) is UNTOUCHED.
-- EXPAND phase: create + backfill, and KEEP the `__as_group__:` sentinel rows in place (they are deleted
-- in 0018 only AFTER the app is deployed + verified, so the live app never loses groups mid-deploy).
-- RLS matches the C21 lock (anon SELECT; authenticated ALL; admin Group Manager writes direct).
-- Applied to mlzblkzflgylnjorgjcp 2026-06-19.

create table if not exists public.groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

-- case-insensitive identity (matches the app's normalizeGroupKey): "KC Volleyball" == "kc volleyball"
create unique index if not exists groups_name_ci_uidx on public.groups (lower(btrim(name)));

alter table public.groups enable row level security;
drop policy if exists "c22 anon read" on public.groups;
drop policy if exists "c22 admin all" on public.groups;
create policy "c22 anon read" on public.groups for select to anon          using (true);
create policy "c22 admin all" on public.groups for all    to authenticated using (true) with check (true);

grant select                         on public.groups to anon;
grant select, insert, update, delete on public.groups to authenticated;

-- Backfill: catalog rows UNION distinct non-empty player groups (real rows), excluding All/Ungrouped,
-- so a group that exists ONLY in the catalog (e.g. "Dot House", no players) is preserved.
insert into public.groups (name)
select g from (
  select btrim(replace(name, '__as_group__:', '')) as g
    from public.players where name ilike '__as_group__:%'
  union
  select btrim("group") as g
    from public.players
    where coalesce("group", '') <> '' and left(name, 5) <> '__as_'
) s
where btrim(g) <> ''
  and lower(btrim(g)) not in ('all', 'ungrouped')
on conflict do nothing;
