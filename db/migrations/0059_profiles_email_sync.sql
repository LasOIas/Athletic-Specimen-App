-- 0059_profiles_email_sync.sql: profiles.email follows a confirmed auth email change (C101 item 1).
--
-- WHY. profiles.email is written once, by the signup trigger (0033 handle_new_user), and read by the two
-- admin-seat RPCs (set_member_role, list_admin_seats). The Account round (C100, v2026.08.25.25) lets a
-- person change their address through auth.updateUser; once GoTrue confirms it, auth.users.email moves and
-- profiles.email stays stale, so the owner cannot seat that person by their new address.
--
-- A TRIGGER, NOT AN RPC. The client's onAuthEvent returns early for the same user id, and a client write
-- would land BEFORE confirmation. The trigger fires inside GoTrue's own transaction the moment the address
-- is confirmed. SECURITY DEFINER is required, not stylistic: GoTrue's role has no rights on public.profiles
-- (0033 handle_new_user is the shipped proof). EXECUTE is revoked from every client role; a trigger
-- function needs no grant.
--
-- AN UPSERT, NOT AN UPDATE. handle_new_user inserts ON CONFLICT DO NOTHING, so a user whose signup insert
-- lost a race, or who predates 0033's backfill, has no profiles row; a bare update would be a silent
-- no-op, the exact failure this file ends. The upsert creates the row with id and email only; the
-- name-fill overlay asks for the rest at the next sign-in.
--
-- GUARDS. WHEN (new.email IS DISTINCT FROM old.email) is the storm guard (every other auth.users update is
-- a no-op); VALUES (new.id, ...) plus the primary-key conflict target makes a cross-row write impossible
-- even though DEFINER bypasses RLS. Writes profiles.id and profiles.email and nothing else. No action_log
-- row (no organizer actor exists inside GoTrue's transaction). Never raises: a raise here would fail the
-- person's own email change. Touches public.profiles alone, so no tournament row is reachable.
--
-- APPLIED 2026-08-25 via the Supabase MCP (apply_migration), C101 inline round.

create or replace function public.handle_user_email_change() returns trigger
 language plpgsql security definer set search_path to 'public' as $fn$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
    on conflict (id) do update set email = excluded.email;
  return new;
end $fn$;
revoke all on function public.handle_user_email_change() from public, anon, authenticated;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (new.email is distinct from old.email)
  execute function public.handle_user_email_change();

-- One-time backfill for any address that drifted before this trigger existed (0 rows on 2026-08-25).
update public.profiles p set email = u.email
  from auth.users u where u.id = p.id and p.email is distinct from u.email;
