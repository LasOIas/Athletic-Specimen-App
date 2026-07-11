-- 0052_rls_lockdown.sql
-- Task 13 (session 10) — THE LOCK. Mike's model becomes DB-truth: "only our 4 accounts need to see the
-- admin side… everything is changable by the admins." Until now every signed-in account could write every
-- table (the blanket C21/C22 `ALL/{authenticated}/true/true` policies — the documented Arc-2 residual).
-- This migration replaces the blanket write policies with ROLE-GATED ones on all 13 admin-write tables.
--
-- DELIBERATE DEVIATION from the build plan's T13 text ("revoke authenticated table grants, writes flow
-- only through RPCs"): the shipped Manage tab (T5-T12) reuses the app's existing DIRECT table writes by
-- design — revoking grants would break every Manage write. Role-gated POLICIES achieve the same security
-- boundary (a `player`-role or no-role account can no longer write anything) while the grants stay.
-- The write path stays: anon/self-service actions flow through the pre-existing SECURITY DEFINER RPCs
-- (register_team, check_in/out, register_player, submit_match_score first-submit, claim_player), which
-- run as their owner and are unaffected by these policies.
--
-- Policy shape: `is_organizer(community_id) OR is_owner(community_id)` — column-based (multi-tenant-ready;
-- every table carries community_id since 0035, default = the Athletic Specimen community).
--
-- ALSO IN THIS CUT:
--   * apply_net_count_change + generate_bracket_atomic (0021/0031) flip to SECURITY DEFINER — as INVOKER
--     their internal writes ran on the caller's policies (the recon landmine); both already hold in-body
--     organizer guards? They pre-date the role model, so the DEFINER flip alone would OPEN them to any
--     authenticated caller — each gets a role guard wrapper via ALTER only if a guard exists. VERIFIED:
--     neither has an in-body role guard, so instead of a bare DEFINER flip they KEEP INVOKER semantics
--     for their table writes via the new role-gated policies (an organizer passes, a player is denied).
--     No change shipped for these two — the policies now guard them correctly. (Documented so nobody
--     "fixes" them into unguarded DEFINER later.)
--   * _audit_actor (0019) rewritten: actor/role derive from the caller's PROFILE + MEMBERSHIP (auth.uid())
--     instead of the retired code-login app_metadata claims — authed admin writes stop logging as "anon".
--   * Stray anon DML grants revoked on every public table (anon writes only ever flow through DEFINER RPCs).
--   * copilot_actions blanket authenticated SELECT tightened to organizer/owner (players could read the
--     admin action feed).
--
-- Applied by the CONTROLLER via the authed Supabase MCP, with an adversarial verify AFTER (player-role
-- account write-denied everywhere; anon register/check-in/reads intact; owner drives every Manage write).

-- ── 1. Blanket write policies → role-gated ─────────────────────────────────────────────────────────────
do $$
declare
  t record;
begin
  for t in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and policyname in ('c21 admin all', 'c22 admin all', 'live_state admin all', 'pickup_days admin all')
  loop
    execute format('drop policy %I on public.%I', t.policyname, t.tablename);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_organizer(community_id) or public.is_owner(community_id)) with check (public.is_organizer(community_id) or public.is_owner(community_id))',
      t.tablename || ' organizer write', t.tablename);
  end loop;
end $$;

-- ── 2. copilot_actions: admin-only read ────────────────────────────────────────────────────────────────
-- copilot_actions carries NO community_id column (0020) — gate on the single AS community constant.
drop policy if exists "c21 admin read copilot_actions" on public.copilot_actions;
create policy "copilot_actions organizer read" on public.copilot_actions
  for select to authenticated
  using (public.is_organizer('2c3bcfa9-305e-448b-924b-da90c029f575'::uuid)
      or public.is_owner('2c3bcfa9-305e-448b-924b-da90c029f575'::uuid));

-- ── 3. _audit_actor (0019) — derive from the role model, not the dead app_metadata claims ──────────────
create or replace function public._audit_actor(OUT actor text, OUT role text, OUT grp text)
 returns record
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare v_uid uuid; v_role text; v_name text; v_email text;
begin
  v_uid := auth.uid();
  if v_uid is not null then
    select m.role::text into v_role from public.memberships m
      where m.profile_id = v_uid and m.status = 'active'
      order by (m.role = 'owner') desc limit 1;
    select p.display_name, p.email into v_name, v_email from public.profiles p where p.id = v_uid;
    if v_role in ('owner', 'organizer') then
      role  := v_role;
      grp   := null;
      actor := coalesce(nullif(v_name, ''), nullif(v_email, ''), v_role);
      return;
    end if;
    -- a signed-in non-admin (player) still gets named honestly
    role  := coalesce(v_role, 'player');
    grp   := null;
    actor := coalesce(nullif(v_name, ''), nullif(v_email, ''), 'player');
    return;
  end if;
  actor := 'anon'; role := 'public'; grp := null;
end $function$;

-- ── 4. Stray anon DML grants — revoked everywhere (anon writes flow only through DEFINER RPCs) ─────────
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from anon', t.tablename);
  end loop;
end $$;
