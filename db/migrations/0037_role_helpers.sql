-- 0037_role_helpers — SECURITY DEFINER helpers used by the (later) role-based RLS policies + RPCs.
-- NOTE (0038 hardening): revoke EXECUTE on these from anon/authenticated so they aren't public RPC
-- endpoints (they stay usable inside policies). They are auth.uid()-scoped (return the CALLER's own
-- role), so the interim exposure is low-risk. team↔player link is team_members-based (Mike's decision).
create or replace function public.caller_role(p_community uuid)
returns public.community_role language sql stable security definer set search_path=public as $$
  select role from public.memberships
   where profile_id = auth.uid() and community_id = p_community and status='active' limit 1;
$$;

create or replace function public.is_organizer(p_community uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce(public.caller_role(p_community) in ('owner','organizer'), false);
$$;

create or replace function public.is_owner(p_community uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce(public.caller_role(p_community) = 'owner', false);
$$;

create or replace function public.caller_claims_team(p_team uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.team_members tmb
      join public.players pl on pl.id = tmb.player_id
     where tmb.team_id = p_team and pl.claimed_by_profile = auth.uid()
  );
$$;
