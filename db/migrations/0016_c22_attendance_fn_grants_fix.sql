-- 0016_c22_attendance_fn_grants_fix.sql
-- Close the Supabase default-privilege gap on 0015's new functions.
-- Supabase's ALTER DEFAULT PRIVILEGES grants EXECUTE to anon/authenticated DIRECTLY on every new
-- public function, so 0015's `revoke all ... from public` did NOT remove anon's access (verified via
-- has_function_privilege: anon could call start_new_session). Revoke explicitly.
--   current_session_id() -> internal only (the SECURITY DEFINER RPCs call it as the owner, postgres).
--   start_new_session(text) -> admin only (authenticated keeps EXECUTE; anon must not — it checks
--     every player out + rolls the session).
-- Applied to mlzblkzflgylnjorgjcp 2026-06-18.
revoke execute on function public.current_session_id()    from anon, authenticated;
revoke execute on function public.start_new_session(text) from anon;
grant  execute on function public.start_new_session(text) to   authenticated;
