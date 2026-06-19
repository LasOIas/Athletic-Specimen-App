-- 0015_c22_attendance_sessions.sql
-- C22 item 4 — per-session attendance (manual "Start new session" model).
-- Additive: two new tables + a helper + extends check_in/check_out/register_player to record
-- per-session attendance + a new start_new_session RPC + an idempotent cutover seed.
-- players.checked_in stays the LIVE UI source of truth (read paths unchanged); check_ins is the
-- durable per-session history written alongside (the §49 "checked_in as a derived view" end-state
-- is deferred — dual-record now is far lower risk than rewriting every read path).
-- RLS matches the C21 lock (anon SELECT; authenticated ALL; all mutations via SECURITY DEFINER RPCs).
-- Design: docs/superpowers/specs/2026-06-19-c22-item4-per-session-attendance-design.md
-- Applied to mlzblkzflgylnjorgjcp 2026-06-18.

-- 1) Tables ------------------------------------------------------------------
create table if not exists public.attendance_sessions (
  id         uuid primary key default gen_random_uuid(),
  label      text,                                   -- human label, defaults to an MT date-stamp
  "group"    text,                                   -- nullable; which group's night (null = all)
  started_at timestamptz not null default now(),
  is_active  boolean     not null default true,      -- exactly one active at a time (index below)
  ended_at   timestamptz
);

create table if not exists public.check_ins (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.attendance_sessions(id) on delete cascade,
  player_id  uuid not null references public.players(id)             on delete cascade,
  at         timestamptz not null default now(),
  unique (session_id, player_id)                     -- one row = "this player attended this session"
);

create index if not exists check_ins_session_idx on public.check_ins(session_id);
create index if not exists check_ins_player_idx  on public.check_ins(player_id);

-- exactly one active session at a time: a partial unique index over the constant-true predicate
create unique index if not exists attendance_sessions_one_active
  on public.attendance_sessions ((is_active)) where is_active;

-- 2) RLS + grants (match the C21 lock) --------------------------------------
alter table public.attendance_sessions enable row level security;
alter table public.check_ins           enable row level security;

drop policy if exists "c22 anon read" on public.attendance_sessions;
drop policy if exists "c22 admin all" on public.attendance_sessions;
create policy "c22 anon read" on public.attendance_sessions for select to anon          using (true);
create policy "c22 admin all" on public.attendance_sessions for all    to authenticated using (true) with check (true);

drop policy if exists "c22 anon read" on public.check_ins;
drop policy if exists "c22 admin all" on public.check_ins;
create policy "c22 anon read" on public.check_ins for select to anon          using (true);
create policy "c22 admin all" on public.check_ins for all    to authenticated using (true) with check (true);

grant select                         on public.attendance_sessions to anon;
grant select, insert, update, delete on public.attendance_sessions to authenticated;
grant select                         on public.check_ins           to anon;
grant select, insert, update, delete on public.check_ins           to authenticated;

-- 3) Helper: resolve-or-create the single active session --------------------
-- Internal only (revoked from public). Called from the SECURITY DEFINER RPCs below, which run as
-- the function owner (postgres) and therefore retain EXECUTE on it.
create or replace function public.current_session_id()
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  select id into v_id from public.attendance_sessions where is_active limit 1;
  if v_id is null then
    insert into public.attendance_sessions(label)
      values (to_char(now() at time zone 'America/Denver','Dy Mon DD'))
      returning id into v_id;
  end if;
  return v_id;
end $$;
-- internal only: Supabase default-privileges grant EXECUTE to anon/authenticated directly, so
-- revoke from them explicitly (the SECURITY DEFINER RPCs call this as the owner, postgres).
revoke all on function public.current_session_id() from public, anon, authenticated;

-- 4) Extend check_in / check_out / register_player to maintain check_ins -----
create or replace function public.check_in(p_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.players set checked_in=true where id=p_id;
  if not found then raise exception 'player not found'; end if;
  insert into public.check_ins(session_id, player_id)
    values (public.current_session_id(), p_id)
    on conflict (session_id, player_id) do nothing;
  insert into public.action_log(actor, role, action, entity_type, entity_id)
    values ('anon','public','check_in','players', p_id::text);
end $$;

create or replace function public.check_out(p_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_sid uuid;
begin
  update public.players set checked_in=false where id=p_id;
  if not found then raise exception 'player not found'; end if;
  select id into v_sid from public.attendance_sessions where is_active limit 1;
  if v_sid is not null then
    delete from public.check_ins where session_id=v_sid and player_id=p_id;
  end if;
  insert into public.action_log(actor, role, action, entity_type, entity_id)
    values ('anon','public','check_out','players', p_id::text);
end $$;

-- register_player: faithful re-statement of the LIVE C21-hardened body (skill-free TABLE
-- projection + name/group caps + dedup-by-(name,group) with the literal '__as_' guard +
-- unique_violation catch), PLUS the C22 item-4 per-session capture.
create or replace function public.register_player(p_name text, p_group text default ''::text, p_checked_in boolean default false)
returns table(id uuid, name text, checked_in boolean, "group" text)
language plpgsql security definer set search_path to 'public' as $$
declare
  v_name  text := btrim(coalesce(p_name, ''));
  v_group text := btrim(coalesce(p_group, ''));
  v_id    uuid;
begin
  if v_name = '' then raise exception 'name required'; end if;
  if length(v_name)  > 80 then raise exception 'name too long (max 80)';  end if;
  if length(v_group) > 80 then raise exception 'group too long (max 80)'; end if;

  select pl.id into v_id from public.players pl
    where lower(btrim(pl.name)) = lower(v_name)
      and coalesce(pl."group",'') = coalesce(v_group,'')
      and left(pl.name, 5) <> '__as_'
    limit 1;

  if v_id is null then
    begin
      insert into public.players(name, skill, checked_in, "group")
        values (v_name, 0, coalesce(p_checked_in, false), v_group)
        returning players.id into v_id;
      insert into public.action_log(actor, role, action, entity_type, entity_id, detail)
        values ('anon','public','register','players', v_id::text, v_name);
    exception when unique_violation then
      select pl.id into v_id from public.players pl
        where lower(btrim(pl.name)) = lower(v_name)
          and coalesce(pl."group",'') = coalesce(v_group,'')
          and left(pl.name, 5) <> '__as_'
        limit 1;
    end;
  end if;

  -- C22 item 4: kiosk "Register & check in" (p_checked_in=true) records per-session attendance.
  -- For an existing player this also flips the live flag so "Register & check in" actually checks
  -- them in (previously a dedup hit returned the row without checking them in).
  if coalesce(p_checked_in, false) then
    update public.players set checked_in=true where players.id = v_id;
    insert into public.check_ins(session_id, player_id)
      values (public.current_session_id(), v_id)
      on conflict (session_id, player_id) do nothing;
  end if;

  return query
    select pl.id, pl.name, pl.checked_in, pl."group"
    from public.players pl where pl.id = v_id;
end $$;

-- preserve the existing self-serve EXECUTE grants (CREATE OR REPLACE keeps them; re-assert for clarity)
grant execute on function public.check_in(uuid)                         to anon, authenticated;
grant execute on function public.check_out(uuid)                        to anon, authenticated;
grant execute on function public.register_player(text,text,boolean)     to anon, authenticated;

-- 5) start_new_session — admin only (replaces the Reset button) -------------
-- Deactivate the current active session FIRST (so the one-active index is satisfied before the new
-- insert), create a new active session, check everyone out. The prior session's check_ins remain
-- as history.
create or replace function public.start_new_session(p_label text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  update public.attendance_sessions set is_active=false, ended_at=now() where is_active;
  insert into public.attendance_sessions(label)
    values (coalesce(nullif(btrim(coalesce(p_label,'')),''),
                     to_char(now() at time zone 'America/Denver','Dy Mon DD')))
    returning id into v_id;
  update public.players set checked_in=false where checked_in=true;
  insert into public.action_log(actor, role, action, entity_type, entity_id, detail)
    values ('admin','admin','start_new_session','attendance_sessions', v_id::text,
            'new session started; all players checked out');
  return v_id;
end $$;
revoke all     on function public.start_new_session(text) from public, anon;  -- admin only (anon default-grant removed)
grant  execute on function public.start_new_session(text) to authenticated;

-- 6) Idempotent cutover seed ------------------------------------------------
-- Create one active session if none exists, and seed its check_ins from whoever is currently
-- checked in, so the live night isn't lost. Idempotent: only runs when no active session exists.
do $$
declare v_id uuid;
begin
  if not exists (select 1 from public.attendance_sessions where is_active) then
    insert into public.attendance_sessions(label)
      values (to_char(now() at time zone 'America/Denver','Dy Mon DD'))
      returning id into v_id;
    insert into public.check_ins(session_id, player_id)
      select v_id, p.id from public.players p
      where p.checked_in=true and left(p.name,5) <> '__as_'
      on conflict (session_id, player_id) do nothing;
  end if;
end $$;
