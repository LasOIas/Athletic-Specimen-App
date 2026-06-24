-- Reliability check 2026-06-24 (finding F): generate_bracket_atomic was deployed to prod (and works —
-- task-#6 generated a full bracket through it) but its CREATE was never captured in a migration; only the
-- grant/revoke in 0008/0009 referenced it, so the DB couldn't be rebuilt from migrations. This captures the
-- exact deployed definition verbatim (idempotent CREATE OR REPLACE — re-applying is a no-op).
-- It translates the client's positional winner_next/loser_next {side,round,slot} into the *_match_id columns
-- the renderer reads, in one transaction with the seed assignment + match insert.
create or replace function public.generate_bracket_atomic(p_tournament_id uuid, p_matches jsonb, p_seeds jsonb default '[]'::jsonb)
 returns void
 language plpgsql
 set search_path to 'public'
as $function$
begin
  -- assign team seeds in the same transaction as the bracket build
  update public.teams t set seed = (s->>'seed')::int
  from jsonb_array_elements(p_seeds) s
  where t.id = (s->>'team_id')::uuid and t.tournament_id = p_tournament_id;

  delete from public.matches where tournament_id = p_tournament_id and phase = 'main';

  insert into public.matches
    (tournament_id, phase, side, round, slot, round_label, team_a_id, team_b_id, source_a, source_b, status, version)
  select p_tournament_id, 'main',
    m->>'side', (m->>'round')::int, (m->>'slot')::int, m->>'round_label',
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
