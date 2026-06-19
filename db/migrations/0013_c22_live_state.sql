-- C22 item 1 — live_state table (applied to mlzblkzflgylnjorgjcp 2026-06-19)
-- Persist the night's Live Nets state to the DB so it survives a browser clear and a co-admin /
-- spectator sees the same night (today it lives only in one phone's localStorage). A single row
-- (id='current') holds the SHAREABLE state as JSON: generated team keys + live court order + the
-- "Won" tallies. SKILL data (skill snapshots, fairness summary) is intentionally NOT stored here —
-- it's admin-only and this row is anon-readable, so skill must never enter it. Win-recording (which
-- nudges skill) is an admin action, so the admin writes this row directly (authenticated); anon
-- (spectators) read only. Matches the C21 locked-RLS model: anon SELECT, authenticated ALL.
create table if not exists public.live_state (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
alter table public.live_state enable row level security;
drop policy if exists "live_state anon read" on public.live_state;
create policy "live_state anon read" on public.live_state for select to anon using (true);
drop policy if exists "live_state admin all" on public.live_state;
create policy "live_state admin all" on public.live_state for all to authenticated using (true) with check (true);
revoke all on public.live_state from anon, authenticated;
grant select on public.live_state to anon;
grant select, insert, update, delete on public.live_state to authenticated;
