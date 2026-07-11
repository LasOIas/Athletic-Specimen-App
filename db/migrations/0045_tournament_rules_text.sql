-- 0045_tournament_rules_text.sql — admin-editable tournament rules (Mike: rules must be visible
-- from the Tournament page AND the registration form). One text column on public.tournaments;
-- content is markdown-lite ("## " section headings, "- " bullets, "1. " numbered rows, blank-line
-- separated sections). Rendering is ESCAPE-FIRST client-side (rulesToHTML in public/pure.js) — the
-- column is never trusted as HTML, so a rules text containing <script> renders as literal text.
-- Anon-readable via the existing tournaments select grant/policy (verified post-apply).
-- Applied to prod 2026-07-10 via MCP apply_migration; seeded for the July tournament (~4.3k chars).
alter table public.tournaments add column if not exists rules text;
