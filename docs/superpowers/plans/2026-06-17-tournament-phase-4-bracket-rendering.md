# Tournament — Phase 4: Bracket Rendering + Advancement (Implementation Plan)

> **For agentic workers:** Execute inline. Steps use `- [ ]`.

**Goal:** Make the double-elimination bracket playable and readable. Tap the winner of a bracket match → the winner advances into the next match and the loser drops to the losers bracket (with the conditional grand-final reset); a champion is crowned. Render it the way Mike picked from the mockups: **single-round-focus on phones** (Winners / Losers / Final tabs → round pills → full-width match cards with "winner → / loser →" links), replacing the Phase-3 interim list.

**Architecture:** All in `public/app.js`. Advancement: `tdbSubmitBracketResult(match, winnerSide, scoreA?, scoreB?)` — CAS-final the match, push winner→`winner_next` slot + loser→`loser_next` slot, special-case the GF (reset only if the losers-bracket team wins), set `status='completed'` + champion when decisive. Renderer: `buildBracketHTML` (replaces `buildBracketListHTML`) with bracket-nav state (`state.bracketSide`, `state.bracketRound`) + handlers `tv2-bracket-side`, `tv2-bracket-round`, `tv2-bracket-win`.

**Tech Stack:** Vanilla JS, Supabase. The bracket visual direction was already chosen via the 3 mockups (§38) — this implements #1 (single-round-focus); the wide-screen tree (#3) is a Phase-5 polish add (the single-round view is responsive and works at all widths meanwhile — flagged, not silently cut).

## Global Constraints
- Bump `APP_VERSION` (`'2026.06.17.4'`).
- `node --check` after every edit. Branch `feat/tournament-brackets`.
- Bracket results are final once entered in v1 (advancement makes un-doing complex) — admin-edit-bracket-result is a tracked follow-up. Pool results stay clearable.
- Optimistic concurrency (CAS) on the match write; tap-to-win is the default, scores optional.

## Tasks
- [ ] **Task 1 — Advancement:** `tdbSubmitBracketResult` (CAS-final + propagate winner/loser to next slots; GF special-case: WB-side win → champion, LB-side win → reset GF2; set `status='completed'` when decisive). `computeChampion(main, teams)`. Browser-simulate a full generated bracket to a champion (incl. a forced reset) against real Supabase; assert advancement + champion are correct.
- [ ] **Task 2 — Renderer:** `buildBracketHTML(tournament, matches, teams, isAdmin)` + `buildBracketCardHTML` + `bracketLabelById`. Single-round-focus: side tabs (only sides present), round pills, the active round's cards. Card: round_label + net, two teams (or source labels if TBD), final → bold-green winner + score; playable (both teams known) → tap-to-win buttons + optional score inputs; "Winner → <label> · Loser → <label>". Champion banner when completed. Nav state defaults to the earliest round with an unplayed match.
- [ ] **Task 3 — Wire + handlers:** replace `buildBracketListHTML` usage (admin + public bracket-stage) with `buildBracketHTML`; remove the now-dead list builders; add `tv2-bracket-side`/`tv2-bracket-round` (click) + `tv2-bracket-win` (click, reads optional `bsc-a/bsc-b-<id>` scores). Reset bracket-nav state on entering the bracket.
- [ ] **Task 4 — Verify (P3):** bump version; play a full bracket in the browser at 390px (tap winners through Winners + Losers + GF, force a reset, reach a champion); cross-check advancement against Supabase; 9-question Mike-reading checklist; screenshots; confirm no regression on pools/players/etc.; 0 console errors. Commit, push, history `task-#12`, vault, mark task done.

## Self-review (done)
- Spec coverage: spec §5D (bracket: tap winner, scores optional, advancement, champion, reset), §8 (single-round-focus phone rendering). Wide tree deferred to polish (flagged). ✓
- Placeholder scan: concrete function names + handler names + the GF reset rule. ✓
- Scope: rendering + advancement to a champion; wide tree is Phase-5 polish. ✓
