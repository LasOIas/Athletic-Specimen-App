-- 0033_profiles — one profile per Supabase Auth user; email PRIVATE (never anon/public).
-- handle_new_user auto-creates a profile on signup; existing auth.users backfilled.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,               -- PRIVATE: self + organizer/owner only
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)), new.email)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create policy "profiles self read" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles self update" on public.profiles for update to authenticated using (id = auth.uid());

-- backfill existing auth.users (trigger only fires on new inserts)
insert into public.profiles (id, display_name, email)
select id, coalesce(raw_user_meta_data->>'full_name', split_part(email,'@',1)), email
from auth.users on conflict (id) do nothing;
