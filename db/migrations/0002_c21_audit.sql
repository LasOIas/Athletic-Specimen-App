-- C21 Phase 1 / Task 1 — audit trail (applied to mlzblkzflgylnjorgjcp 2026-06-18)
-- Additive + idempotent. RLS stays open at this phase; nothing in the live app uses these yet.

alter table public.players add column if not exists created_at timestamptz not null default now();
alter table public.players add column if not exists updated_at timestamptz not null default now();

create or replace function public.tg_set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists set_players_updated_at on public.players;
create trigger set_players_updated_at before update on public.players
  for each row execute function public.tg_set_updated_at();

-- who-did-what log (forensics + server-side undo). RLS enabled; written only via SECURITY DEFINER RPCs.
create table if not exists public.action_log (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor text, role text, grp text,
  action text not null, entity_type text, entity_id text,
  detail text, undo jsonb
);
alter table public.action_log enable row level security;
