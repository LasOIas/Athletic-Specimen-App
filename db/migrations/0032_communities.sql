-- 0032_communities — Identity/Accounts foundation (applied to prod 2026-07-08 via Supabase MCP).
-- First-class community/org (single now, multi-tenant-ready). Anon+auth read (name is public).
create table if not exists public.communities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  created_at timestamptz not null default now()
);
alter table public.communities enable row level security;

insert into public.communities (name, slug)
  values ('Athletic Specimen', 'athletic-specimen')
  on conflict (slug) do nothing;

create policy "communities anon read" on public.communities for select to anon using (true);
create policy "communities auth read" on public.communities for select to authenticated using (true);
