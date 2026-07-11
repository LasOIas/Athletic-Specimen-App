# Tournament page — atom-up redesign (LOCKED)

**Date:** 2026-07-10 (session 7) · **Status:** design locked by Mike (assembled mockup approved).
**Scope:** the Tournament TAB shell — the sign-in gate + the hub. Subpage restyles
(pools / standings / bracket / my-team) are a FOLLOW-UP slice on the same system.
**System:** the locked public system (Barlow display via `--font-display`, no cards,
hairline rows, tamed watermark, floating rounded nav, matte/no-gold).

## 1. Sign-in gate (Mike's rule: the Tournament page is personalized → signed-in only)
When NOT signed in, the Tournament tab renders ONLY the gate (no hub, no data):
- centered logo mark (~110px) · h1 "This page is yours" (Barlow) · muted line "The
  tournament page is personal — your team, your games, your bracket run. Sign in to
  see it." · full-width blue "Sign in" CTA → `openAuthPage()` · muted "New here?
  Create an account" link (same auth page, its create toggle).
- After sign-in the tab renders the hub (below). The gate replaces the current
  public hub for signed-out users — reuse the existing auth entry points.

## 2. Hub (signed-in) — assembled from the locked picks
Top-to-bottom:
1. **Title** `<tournament name>` (Barlow, flush).
2. **Stage progress bar** (pick T3 + T2 fused): a `.tn-prog` block — label = the
   CURRENT stage in Barlow caps (`POOL PLAY`, then `BRACKET` when the bracket
   starts), a right-aligned count (`24 of 36` pool games; `Round 2 of 4` or similar
   in bracket), and a thin monochrome bar (`--accent` fill) showing progress through
   that stage. One stage at a time — it swaps label+count+fill when the tournament
   advances. No gold.
3. **Meta line** `<N> teams · <N> nets`.
4. **Hub rows** (pick A4+A2 — icon rows with live data values), each a hairline row
   (`.tn-row`), blue SVG icon left, title + sub, right-side value/chevron:
   - **My team** — icon users; sub `<team> · Pool <X>`; value `2-1 · Net 2 next`
     (their record + next game). Only when the signed-in user has a claimed team;
     otherwise this row becomes "Claim your team" → the claim flow.
   - **Pools & schedule** — icon calendar; value = games-done `24/36`. This row
     carries the **T2 active-stage emphasis** while pools run: a left `--accent`
     edge + green sub "Happening now · N games playing".
   - **Standings** — icon chart; value = current leader name.
   - **Bracket** — icon trophy; while pools run it is **locked/faded** (`opacity
     .45`), sub "Unlocks when pools finish", value "N left". When the bracket
     starts, Bracket takes the active-emphasis and Pools de-emphasizes.
   - **Rules** — icon book; sub "How we play"; chevron. (Static rules page; copy
     pending from Mike — until then the row may be hidden or link to a "coming soon"
     stub — Mike's call at build.)
   - **Past tournaments** — icon clock; sub "Champions & records"; chevron.
5. Each row taps into its existing subpage (`pdTournamentView`), back → hub.

## 3. States by phase
- **setup / registration:** no live stage bar; hub shows My-team/claim + a "Registration
  open" affordance is NOT here (that's Home) — the hub shows the rows that have
  meaning (Standings/Bracket read "starts when play begins"); the register action
  stays on Home. (Keep it simple: pre-play, rows show honest "not started" subs.)
- **pools:** as the mockup — POOL PLAY bar, Pools row active, Bracket locked.
- **bracket:** BRACKET bar, Bracket row active, Pools row → "final" summary.
- **completed:** stage bar reads "Final", My-team shows final placement, Standings/
  Bracket/Past-tournaments all navigable.

## 4. Build notes
- Reshape `buildPublicTournamentRootHTML` / `buildTournamentHubHTML` (the hub) + add
  the signed-out gate branch; keep the `pdTournamentView` subpage routing.
- New pure helpers (TDD): `tournamentStageModel(tournament, matches)` →
  `{stageLabel, count, total, pct, activeView}`; reuse `computeStandings` for the
  leader. Hub row data assembled pure where practical.
- The claim entry (currently a hub tile from the Home rebuild) folds into the
  My-team row's unclaimed state.
- §41 desktop: the rail+board treatment already exists for the tournament-live Home;
  the hub on desktop = comfortable centered column (rows don't need 2-across).
- APP_VERSION bump, node --check, vitest green, §27 browser pass both sizes + both
  auth states, per-slice commit/push.
