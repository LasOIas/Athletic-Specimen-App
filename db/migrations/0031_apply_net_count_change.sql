-- 0031 (2026-06-30): apply a net_count change ATOMICALLY. Changing the number of nets/courts during pool play
-- OR the bracket must keep matches.net consistent with tournaments.net_count — otherwise games reference a net
-- that no longer exists (the "games on nets 1-10 but net_count=9" drift surfaced in the pre-event check).
-- The client computes the new net (and, for pools, queue_order) for each UNPLAYED match using the SAME pure
-- helpers the draw/generate use (splitNetsAcrossPools / distributeGamesOnNets / assignBracketNets), then this
-- RPC applies net_count + every match update in ONE transaction with a per-row version-CAS. If any match was
-- changed concurrently (version mismatch) the WHOLE change rolls back, so net_count and the nets never drift.
create or replace function public.apply_net_count_change(p_tournament_id uuid, p_net_count int, p_assignments jsonb default '[]'::jsonb)
 returns int
 language plpgsql
 set search_path to 'public'
as $function$
declare
  a jsonb;
  v_rows int;
  v_count int := 0;
begin
  if p_net_count is null or p_net_count < 1 then
    raise exception 'net_count must be >= 1';
  end if;

  update public.tournaments set net_count = p_net_count, updated_at = now() where id = p_tournament_id;

  for a in select value from jsonb_array_elements(coalesce(p_assignments, '[]'::jsonb)) loop
    update public.matches
      set net = (a->>'net')::int,
          queue_order = coalesce((a->>'queue_order')::int, queue_order),
          version = version + 1,
          updated_at = now()
      where id = (a->>'match_id')::uuid
        and tournament_id = p_tournament_id
        and version = (a->>'version')::int;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      raise exception 'Match % was changed concurrently (version mismatch) - refresh and retry', (a->>'match_id');
    end if;
    v_count := v_count + 1;
  end loop;

  return v_count;
end $function$;

-- Admin-only (matches the C21 gating on the other write RPCs): anon cannot change net counts.
revoke all on function public.apply_net_count_change(uuid, int, jsonb) from public, anon;
grant execute on function public.apply_net_count_change(uuid, int, jsonb) to authenticated;
