-- 0026 NF-1 (Option C+): saveable scoring formats. Admin-managed presets that persist until
-- deleted; picked at tournament create to set the per-phase scoring model (cols from migration 0025).
-- RLS mirrors the locked pattern (c21 anon read / c21 admin all — admin writes via the authenticated
-- session, same path as creating a tournament). Seeds one "Standard" (pool 15/cap 20, bracket 25, win-by-2)
-- so the picker is never empty. Idempotent. Verified on prod 2026-06-26.

create table if not exists public.scoring_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pool_target int not null default 15,
  pool_cap int,
  bracket_target int not null,
  bracket_cap int,
  win_by_2 boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.scoring_presets enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='scoring_presets' and policyname='c21 anon read') then
    create policy "c21 anon read" on public.scoring_presets for select to anon using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='scoring_presets' and policyname='c21 admin all') then
    create policy "c21 admin all" on public.scoring_presets for all to authenticated using (true) with check (true);
  end if;
end $$;

grant select on public.scoring_presets to anon;
grant all on public.scoring_presets to authenticated;

insert into public.scoring_presets (name, pool_target, pool_cap, bracket_target, bracket_cap, win_by_2)
  select 'Standard', 15, 20, 25, null, true
  where not exists (select 1 from public.scoring_presets);
