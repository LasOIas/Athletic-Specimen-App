-- 2026-06-25 — two fixes in one CREATE OR REPLACE (captured from the live prod definition + a new guard):
--
-- (1) BRACKET-WIPE RACE (critical, bug-hunt wf_cb420bf8): generate_bracket_atomic had NO idempotency guard —
--     every call unconditionally `delete from public.matches ... phase='main'` then re-inserts a blank bracket
--     (status 'scheduled', version 0). A second call (two admin phones both popping the C54 auto-generate
--     confirm, a lingering body-level modal, or a stale/double tap on "Generate Bracket") therefore DESTROYS a
--     freshly-scored bracket with no undo. Client guards can't be trusted across devices, so the fix lives at
--     the source of truth: row-LOCK the tournament (`for update`) and refuse unless status='pools'. The
--     function itself sets status='bracket' at the end, so the first call wins and any concurrent/second call
--     blocks on the lock, then reads 'bracket' and aborts. To rebuild a bracket, Reset Pools (-> 'setup' ->
--     re-draw -> 'pools') and generate again.
--
-- (2) MIGRATION DRIFT (bug-hunt): the C51 net/queue_order columns were added to the PROD function but never
--     captured in a migration (repo 0021 omits them), so a rebuild-from-migrations would silently regenerate
--     brackets with all nets NULL. This file captures the live definition verbatim (INSERT includes
--     net, queue_order via nullif), making the repo the source of truth again. Back-compatible: nullif -> NULL
--     when a caller omits net/queue_order.
create or replace function public.generate_bracket_atomic(p_tournament_id uuid, p_matches jsonb, p_seeds jsonb default '[]'::jsonb)
 returns void
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_status text;
begin
  -- Serialize concurrent generate calls + make this idempotent: lock the tournament row, then only proceed
  -- from 'pools'. The second of two racing calls blocks here, then sees 'bracket' and aborts (no wipe).
  select status into v_status from public.tournaments where id = p_tournament_id for update;
  if v_status is null then
    raise exception 'Tournament not found.';
  end if;
  if v_status <> 'pools' then
    raise exception 'Bracket already generated (status %). Reset pools to rebuild it.', v_status;
  end if;

  -- assign team seeds in the same transaction as the bracket build
  update public.teams t set seed = (s->>'seed')::int
  from jsonb_array_elements(p_seeds) s
  where t.id = (s->>'team_id')::uuid and t.tournament_id = p_tournament_id;

  delete from public.matches where tournament_id = p_tournament_id and phase = 'main';

  insert into public.matches
    (tournament_id, phase, side, round, slot, round_label, net, queue_order, team_a_id, team_b_id, source_a, source_b, status, version)
  select p_tournament_id, 'main',
    m->>'side', (m->>'round')::int, (m->>'slot')::int, m->>'round_label',
    nullif(m->>'net','')::int, nullif(m->>'queue_order','')::int,
    nullif(m->>'team_a_id','')::uuid, nullif(m->>'team_b_id','')::uuid,
    m->>'source_a', m->>'source_b', 'scheduled', 0
  from jsonb_array_elements(p_matches) m;

  update public.matches dst
    set winner_next_match_id = nxt.id, winner_next_slot = (m->>'winner_next_slot')::int
  from jsonb_array_elements(p_matches) m
  join public.matches nxt on nxt.tournament_id = p_tournament_id and nxt.phase = 'main'
    and nxt.side = m->'winner_next'->>'side'
    and nxt.round = (m->'winner_next'->>'round')::int
    and nxt.slot = (m->'winner_next'->>'slot')::int
  where dst.tournament_id = p_tournament_id and dst.phase = 'main'
    and dst.side = m->>'side' and dst.round = (m->>'round')::int and dst.slot = (m->>'slot')::int
    and jsonb_typeof(m->'winner_next') = 'object';

  update public.matches dst
    set loser_next_match_id = nxt.id, loser_next_slot = (m->>'loser_next_slot')::int
  from jsonb_array_elements(p_matches) m
  join public.matches nxt on nxt.tournament_id = p_tournament_id and nxt.phase = 'main'
    and nxt.side = m->'loser_next'->>'side'
    and nxt.round = (m->'loser_next'->>'round')::int
    and nxt.slot = (m->'loser_next'->>'slot')::int
  where dst.tournament_id = p_tournament_id and dst.phase = 'main'
    and dst.side = m->>'side' and dst.round = (m->>'round')::int and dst.slot = (m->>'slot')::int
    and jsonb_typeof(m->'loser_next') = 'object';

  update public.tournaments set status = 'bracket', updated_at = now() where id = p_tournament_id;
end $function$;

-- Admin-only (matches the C21 gating already on prod): anon cannot generate brackets.
revoke all on function public.generate_bracket_atomic(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.generate_bracket_atomic(uuid, jsonb, jsonb) to authenticated;
