-- 0036_players_claim — claim-a-player: players.claimed_by_profile + a pending-claim table
-- (self creates a claim; organizer approves in 0039). All 233 players start unclaimed.
alter table public.players add column if not exists claimed_by_profile uuid references public.profiles(id);

create table if not exists public.player_claims (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  community_id uuid not null references public.communities(id) on delete cascade,
  status text not null default 'pending',  -- 'pending' | 'approved' | 'rejected'
  created_at timestamptz not null default now(),
  unique (player_id, profile_id)
);
alter table public.player_claims enable row level security;

create policy "player_claims self read" on public.player_claims for select to authenticated using (profile_id = auth.uid());
create policy "player_claims self insert" on public.player_claims for insert to authenticated with check (profile_id = auth.uid());
