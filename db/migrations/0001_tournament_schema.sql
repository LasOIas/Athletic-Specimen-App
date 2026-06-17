-- Tournament system v1 — additive schema. Does NOT touch players/sessions.
-- Applied to Supabase project mlzblkzflgylnjorgjcp via apply_migration (name: tournament_schema).

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'setup'
    check (status in ('setup','pools','bracket','completed')),
  match_cap int not null default 25,
  pool_count int not null default 4,
  net_count int not null default 10,
  grand_final_reset boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pools (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  label text not null,
  display_order int not null default 0
);
create index if not exists pools_tournament_idx on public.pools(tournament_id);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name text not null,
  seed int,
  pool_id uuid references public.pools(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists teams_tournament_idx on public.teams(tournament_id);
create index if not exists teams_pool_idx on public.teams(pool_id);

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  is_captain boolean not null default false,
  primary key (team_id, player_id)
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  phase text not null check (phase in ('pool','main')),
  side text check (side in ('winners','losers','grand_final')),
  pool_id uuid references public.pools(id) on delete cascade,
  round int not null default 0,
  slot int not null default 0,
  round_label text,
  net int,
  queue_order int,
  team_a_id uuid references public.teams(id) on delete set null,
  team_b_id uuid references public.teams(id) on delete set null,
  source_a text,
  source_b text,
  status text not null default 'scheduled'
    check (status in ('scheduled','live','final')),
  score_a int,
  score_b int,
  winner_team_id uuid references public.teams(id) on delete set null,
  loser_team_id uuid references public.teams(id) on delete set null,
  winner_next_match_id uuid references public.matches(id) on delete set null,
  winner_next_slot int,
  loser_next_match_id uuid references public.matches(id) on delete set null,
  loser_next_slot int,
  version int not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists matches_tournament_idx on public.matches(tournament_id);
create index if not exists matches_pool_idx on public.matches(pool_id);
create index if not exists matches_phase_idx on public.matches(tournament_id, phase);

-- RLS: open to role `public` for v1 (mirrors existing players/sessions anon model;
-- admin gating is client-side). Tighten post-v1 if abuse appears.
alter table public.tournaments  enable row level security;
alter table public.pools        enable row level security;
alter table public.teams        enable row level security;
alter table public.team_members enable row level security;
alter table public.matches      enable row level security;

create policy "v1 open tournaments"  on public.tournaments  for all to public using (true) with check (true);
create policy "v1 open pools"        on public.pools        for all to public using (true) with check (true);
create policy "v1 open teams"        on public.teams        for all to public using (true) with check (true);
create policy "v1 open team_members" on public.team_members for all to public using (true) with check (true);
create policy "v1 open matches"      on public.matches      for all to public using (true) with check (true);
