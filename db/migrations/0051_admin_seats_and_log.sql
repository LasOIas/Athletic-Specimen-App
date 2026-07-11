-- 0051_admin_seats_and_log.sql
-- Task 11 (Manage → Admins, session-10 pick R6) — the 4-admin SEATS page + the ACTIVITY LOG read.
-- Three SECURITY DEFINER RPCs, same idiom as 0039 / 0048 / 0050: an in-body role guard on the single
-- community, search_path pinned to public, EXECUTE revoked from public + anon and granted to authenticated
-- only. The guard helpers (is_owner / is_organizer, 0037) run as the function OWNER inside a DEFINER body,
-- so the anon/public revoke from 0039 does NOT disable them, while auth.uid() still reads the REAL caller.
--
--   1. set_member_role(p_email, p_role)  — OWNER-ONLY promote/demote. Resolves the email to a profile,
--      then upserts the membership. EMAIL RESOLUTION PATH: public.profiles carries a PRIVATE `email`
--      column (0033 — auto-populated by handle_new_user on signup), so the lookup is a plain
--      profiles.email match. No auth.users reach is needed (and none is taken).
--   2. list_admin_seats()  — is_organizer-guarded roster of owner + organizer memberships, returned as
--      (display_name, email, role) by joining profiles.
--   3. read_action_log(p_limit) — is_organizer-guarded, newest-first (at, actor, summary). See the
--      summary-shaping notes on that function for how the two source tables are folded.
--
-- COMMUNITY: the single Athletic Specimen community, hardcoded like every table default
-- (2c3bcfa9-305e-448b-924b-da90c029f575). memberships PK = (profile_id, community_id); role enum
-- community_role {owner, organizer, player} (0034). Today there is exactly ONE membership: Mike = owner
-- (recon §4) — these RPCs are how the other 3 seats get filled from the UI instead of a manual INSERT.
--
-- APPLIED BY THE CONTROLLER via the authed Supabase MCP — a BUILDER never applies migrations. Until it
-- lands the client degrades honestly: the RPC-not-found error surfaces a friendly "the server is still
-- updating" notice and NEVER falls back to a direct memberships/table write (memberships has no client
-- INSERT policy and the log tables are RLS-locked from client reads — a fallback would only fail less
-- honestly, and would bypass the owner guard these functions exist to enforce).

-- ==========================================================================
-- set_member_role — OWNER-ONLY. Promote a signed-up account to organizer (a co-admin), or demote to
-- player (remove admin). Errors clearly when no account exists yet for the email ("create an account
-- first"). Two safety rails beyond the owner guard:
--   * refuses to MINT an owner — seats only assign organizer/player; owner parity stays a deliberate
--     manual service_role INSERT (recon §4), never a one-tap escalation from the seats UI;
--   * refuses to TOUCH an existing owner row — prevents demoting/locking out the owner via the seats path.
-- ==========================================================================
create or replace function public.set_member_role(p_email text, p_role public.community_role)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_community uuid := '2c3bcfa9-305e-448b-924b-da90c029f575';
  v_profile uuid;
  v_current public.community_role;
begin
  -- OWNER GUARD (mirrors 0050): only the owner manages admin seats.
  if not public.is_owner(v_community) then
    raise exception 'Only the owner can change admin seats' using errcode = '42501';
  end if;
  -- Seats assign organizer or player only. Owner parity is a deliberate manual grant (recon §4), never a
  -- one-tap escalation from this UI.
  if p_role = 'owner' then
    raise exception 'The owner seat can''t be assigned here';
  end if;
  -- Resolve the email to a signed-up account. profiles carries the (private) email, auto-created on signup.
  select id into v_profile from public.profiles where lower(email) = lower(btrim(coalesce(p_email, ''))) limit 1;
  if v_profile is null then
    raise exception 'No account for that email yet — they need to create an account first';
  end if;
  -- Never demote/overwrite an existing OWNER through the seats path (self-lockout guard).
  select role into v_current from public.memberships
    where profile_id = v_profile and community_id = v_community;
  if v_current = 'owner' then
    raise exception 'The owner seat can''t be changed here';
  end if;
  -- Upsert the membership (PK = profile_id, community_id). Promote = organizer, remove admin = player.
  insert into public.memberships (profile_id, community_id, role, status)
  values (v_profile, v_community, p_role, 'active')
  on conflict (profile_id, community_id)
  do update set role = excluded.role, status = 'active';
end $function$;

revoke all on function public.set_member_role(text, public.community_role) from public, anon;
grant execute on function public.set_member_role(text, public.community_role) to authenticated;

-- ==========================================================================
-- list_admin_seats — the seats roster read (any organizer/owner may see it). Returns the owner + every
-- organizer as (display_name, email, role), owner first. Joins profiles for the human name + email (both
-- PRIVATE columns, only reachable here because the function runs as its DEFINER owner).
-- ==========================================================================
create or replace function public.list_admin_seats()
 returns table (display_name text, email text, role text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_community uuid := '2c3bcfa9-305e-448b-924b-da90c029f575';
begin
  if not public.is_organizer(v_community) then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  return query
    select p.display_name, p.email, m.role::text
      from public.memberships m
      join public.profiles p on p.id = m.profile_id
     where m.community_id = v_community
       and m.status = 'active'
       and m.role in ('owner', 'organizer')
     order by (m.role = 'owner') desc, lower(coalesce(p.display_name, p.email, ''));
end $function$;

revoke all on function public.list_admin_seats() from public, anon;
grant execute on function public.list_admin_seats() to authenticated;

-- ==========================================================================
-- read_action_log — newest-first admin activity feed (any organizer/owner may read it). UNIONs the two
-- append-only, client-invisible audit tables and returns (at, actor, summary):
--   * action_log (0002): columns (at, actor, action, entity_type, entity_id, detail, ...). The live
--     writers (0039 submit/edit-score, and future admin writes) store `action` as a machine slug
--     ('submit_score', 'edit_score') plus a human `detail` tail ('21-19 win:a'). SHAPED summary =
--     action + ' · ' + detail (detail omitted when null/blank). This is HONEST about what the log holds
--     today (mostly score events) rather than inventing prose the rows don't carry.
--   * copilot_actions (0020): columns (at, actor, request_text, tool, result, ...). SHAPED summary =
--     the natural-language request (else the result, else the tool) + a ' · co-pilot' SOURCE TAG so the
--     merged feed stays honest about which actions came through the AI co-pilot.
-- The return stays 3-column (at, actor, summary) per the plan/spec — the source tag is folded into the
-- copilot summary, not surfaced as a 4th column (the locked m-b mockup renders no source column, and the
-- UI groups purely by day + "<b>actor</b> summary"). The output columns are referenced only via the
-- `feed` subquery alias, so the OUT names never collide with the base tables' at/actor columns.
-- p_limit is clamped to [1, 200]; default 50.
-- ==========================================================================
create or replace function public.read_action_log(p_limit int default 50)
 returns table (at timestamptz, actor text, summary text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_community uuid := '2c3bcfa9-305e-448b-924b-da90c029f575';
begin
  if not public.is_organizer(v_community) then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  return query
    select feed.at, feed.actor, feed.summary
    from (
      select al.at as at,
             al.actor as actor,
             (al.action || case when nullif(btrim(coalesce(al.detail, '')), '') is not null
                                then ' · ' || al.detail else '' end)::text as summary
        from public.action_log al
      union all
      select ca.at as at,
             ca.actor as actor,
             (coalesce(nullif(btrim(coalesce(ca.request_text, '')), ''),
                       nullif(btrim(coalesce(ca.result, '')), ''),
                       ca.tool) || ' · co-pilot')::text as summary
        from public.copilot_actions ca
    ) feed
    order by feed.at desc nulls last
    limit greatest(1, least(coalesce(p_limit, 50), 200));
end $function$;

revoke all on function public.read_action_log(int) from public, anon;
grant execute on function public.read_action_log(int) to authenticated;
