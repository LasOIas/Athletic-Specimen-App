-- 0034_memberships — per-community roles (owner/organizer/player). Owner seed deferred to Mike's
-- first real magic-link sign-in (the 2 existing auth.users are synthetic .local code accounts).
do $$ begin
  create type public.community_role as enum ('owner','organizer','player');
exception when duplicate_object then null; end $$;

create table if not exists public.memberships (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  community_id uuid not null references public.communities(id) on delete cascade,
  role public.community_role not null default 'player',
  status text not null default 'active',   -- 'active' | 'pending'
  created_at timestamptz not null default now(),
  primary key (profile_id, community_id)
);
alter table public.memberships enable row level security;

create policy "memberships self read" on public.memberships for select to authenticated using (profile_id = auth.uid());
