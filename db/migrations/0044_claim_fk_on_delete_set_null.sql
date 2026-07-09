-- 0044_claim_fk_on_delete_set_null.sql — account deletion must not be blocked by a claimed player.
-- Found by the Slice-3b adversarial review (wf_01014eca-d99): players.claimed_by_profile referenced
-- profiles(id) with NO on-delete action, while profiles cascade from auth.users and player_claims
-- cascade from profiles — so deleting an auth user who had claimed a player would fail with an FK
-- violation. ON DELETE SET NULL = the player becomes unclaimed (re-claimable), the right semantic.
-- Applied to prod 2026-07-09 via apply_migration; constraint def verified post-apply.
alter table public.players drop constraint players_claimed_by_profile_fkey;
alter table public.players add constraint players_claimed_by_profile_fkey
  foreign key (claimed_by_profile) references public.profiles(id) on delete set null;
