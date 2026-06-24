-- C28 Slice 2 — co-pilot action audit trail (transparency: NL request -> tool -> result).
-- Admin-only audit table: anon has no access (RLS on, no anon policy); authenticated admins read;
-- writes go ONLY through the log_copilot_action SECURITY DEFINER RPC. args NEVER contains skill.
create table if not exists public.copilot_actions (
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),
  actor        text,
  role         text,
  request_text text,
  tool         text not null,
  args         jsonb not null default '{}'::jsonb,
  result       text,
  undone       boolean not null default false
);
alter table public.copilot_actions enable row level security;

drop policy if exists "c21 admin read copilot_actions" on public.copilot_actions;
create policy "c21 admin read copilot_actions" on public.copilot_actions
  for select to authenticated using (true);

-- log RPC: actor/role derived from the caller's JWT via the C21 _audit_actor() helper (OUT actor,role,grp).
create or replace function public.log_copilot_action(
  p_request text, p_tool text, p_args jsonb, p_result text, p_undone boolean
) returns void
language plpgsql security definer set search_path = public as $$
declare a record;
begin
  select * into a from public._audit_actor();
  insert into public.copilot_actions(actor, role, request_text, tool, args, result, undone)
  values (a.actor, a.role, p_request, p_tool, coalesce(p_args, '{}'::jsonb), p_result, coalesce(p_undone, false));
end; $$;

revoke all on function public.log_copilot_action(text, text, jsonb, text, boolean) from public, anon;
grant execute on function public.log_copilot_action(text, text, jsonb, text, boolean) to authenticated;
