# Personal Layer — Slice 3c (Personal Surfaces) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in claimed player sees their personal layer — Home "your run" hero (LOCKED Option C timeline), a My Team page (LOCKED Option B big-record scoreboard), and the Standings "You" highlight — all derived from `players.claimed_by_profile` + `team_members`.

**Architecture:** One signed-in piggyback read (`team_members` embedded, same as the 3b claim page) lands shaped candidates in `state.teamMembers`; three tested pure helpers (`resolveMyTeam`, `computeTeamRecord`, `computeTeamRunTimeline`) derive everything; the three surfaces render from those helpers inside the existing builders (never DOM-patching after render — three render paths would desync). Also fixes the latent Home-tab staleness (the refresh gate skips teams/matches on Home).

**Tech Stack:** vanilla JS `public/app.js` + `public/pure.js` (CommonJS-guard exports) + `public/styles.css` (Direction-A tokens only); vitest in `test/`; no DB changes (0042/0043/0044 already live).

## Global Constraints

- Bump `APP_VERSION` (`public/app.js:30`) — currently `'2026.07.08.8'` → next `'2026.07.09.N'`.
- `node --check public/app.js` after every edit; commit+push per slice-completion; §41 desktop AND mobile; §51 no neon; §11 SVG only; never "night/tonight"; tournament by NAME.
- LOCKED visuals (do NOT redesign — §38 satisfied by Mike's task-#9 picks): hero C timeline (`.tl done/now/faint` nodes, green done-dot, accent now-dot w/ soft ring), My Team B (centered eyebrow `tournament · Pool X · Seed N`, Sora 20px team, 44px Sora `W–L`, W/L pips, accent-soft next-strip, Games↔Roster segmented toggle), Standings `.pd-you` (CSS exists, dormant).
- §27 TRUE: the "~N min" ETA renders ONLY when derivable from ≥2 same-net final-gap samples (median × games-ahead); otherwise "N games ahead" / nothing. Only FINAL matches' `updated_at` are trusted as finish times.
- The personal read requires a signed-in session (anon lacks SELECT on `claimed_by_profile`) — guard every fetch with `state.authSession`.
- All state facts from recon `wf_83f94dac-c33` (exact lines cited per task; re-grep before editing — the file shifts).

## File Structure

- Modify `public/pure.js` — add `resolveMyTeam`, `computeTeamRecord`, `computeTeamRunTimeline` + exports.
- Modify `test/pure.test.js` — TDD suites for the three helpers.
- Modify `public/app.js` — piggyback read + `state.teamMembers` (~3820-3834), Home refresh gate (~3947-3961), hero C in `publicHomeHTML` (~2534-2565) + My Team tile, `#tab-myteam` panel (renderPublicShell ~7918-7950) + `buildMyTeamPageHTML` + NAV_ANCHOR + partialRender branch (~1401-1411), Standings You inside `buildStandingsPageHTML` (~7797-7835, fix the stale 7796 comment), claim-success → state handoff (`submitClaim`/`renderClaimSuccess` region), `APP_VERSION`.
- Modify `public/styles.css` — append timeline kit (`.pd-tl*`), My Team kit (`.mt-*`), tail after the 3b block.

---

### Task 1: Pure helpers (TDD)

**Files:** Modify `public/pure.js`, `test/pure.test.js`.
**Interfaces produced:**
- `resolveMyTeam(profileId, candidates)` → `{playerId, teamId, teamName, playerName} | null` (candidates = `shapeClaimCandidates` rows; first `claimedBy === profileId` wins).
- `computeTeamRecord(teamId, matches, teams)` → `{wins, losses, pointDiff, results:[{oppId, oppName, won, myScore, oppScore, phase}]}` over FINAL matches involving teamId, ordered by `updated_at` asc.
- `computeTeamRunTimeline(teamId, matches, teams)` → `{last: {won, myScore, oppScore, net, oppName} | null, next: {net, oppName, gamesAhead, etaMin, isNow, label} | null, then: {oppName} | null}`:
  - `next` = my lowest-`queue_order` non-final match with both teams set; pool: `gamesAhead` = count of non-final matches on the SAME net with lower `queue_order`; `isNow` = gamesAhead === 0 (or my match `status === 'live'`); `etaMin` = `gamesAhead × median(gaps between consecutive same-net final updated_at)` rounded, `null` unless ≥2 gap samples; bracket (`phase === 'main'`): same selection, `etaMin` always null, `gamesAhead` null.
  - `then` = my following non-final match with both teams set (else null).

- [ ] **Step 1: failing tests** — append to `test/pure.test.js` (destructure the three names). Cases: resolveMyTeam hit/miss/null-profile; record W-L/diff/order/ignores non-final; timeline last-null-when-no-finals, next with gamesAhead counted on same net only, isNow when first in queue, etaMin from median gaps (fabricate finals with updated_at 10 min apart → 2 ahead = ~20), etaMin null with <2 samples, bracket next without eta, then-node presence/absence.
- [ ] **Step 2: run → RED** (`npx vitest run -t "resolveMyTeam|computeTeamRecord|computeTeamRunTimeline"`).
- [ ] **Step 3: implement** in `pure.js` (before the exports guard; add to `module.exports`). Sort finals by `updated_at`; guard malformed rows; never throw on empty inputs.
- [ ] **Step 4: run → GREEN**, full suite still green.
- [ ] **Step 5: commit** `feat(pure): my-team resolver + record + run-timeline helpers (TDD)`.

### Task 2: Data plumbing (piggyback read + Home refresh gate + claim handoff)

**Files:** Modify `public/app.js`.
**Interfaces produced:** `state.teamMembers` (`shapeClaimCandidates` rows for the active tournament, `null` when signed out/none), refreshed with the tournament read set; `myTeamInfo()` → cached-per-render `resolveMyTeam(state.account?.id, state.teamMembers)`.

- [ ] **Step 1:** In `tdbRefreshTournaments`' Promise.all (~3820-3834) add a 4th read guarded by `state.authSession && state.activeTournamentId`: the same embedded select as `fetchClaimCandidates` → `state.teamMembers = shapeClaimCandidates(rows)`; signed-out → `state.teamMembers = null`. Wrap in try/catch (a failure leaves the previous value; console.error).
- [ ] **Step 2:** Widen the background gate (~3947-3961): `onTournamentSurface() || (activeMainTab === 'home' && publicLiveTournament())` → Home now refreshes teams/pools/matches too (fixes the latent stale live board; keep `tournamentTabIsDirty` guards intact).
- [ ] **Step 3:** Claim handoff: in `submitClaim` success (after `c.claimedBy = state.account.id`), patch `state.teamMembers` if loaded (find same id+teamName → set claimedBy); in the success view's Done handler, `closeClaimPage(); try { render(); } catch {}` so the hero lights immediately.
- [ ] **Step 4:** Sign-out branch (~9752-9754): `state.teamMembers = null;`.
- [ ] **Step 5:** `node --check`; commit `feat: signed-in team_members read + Home refresh gate + claim handoff`.

### Task 3: Home hero C (locked timeline) + My Team tile

**Files:** Modify `public/app.js` (`publicHomeHTML` tournament branch ~2534-2565), `public/styles.css` (append `.pd-tl*` kit per the locked mockup: line, dots — done=`--live`, now=`--accent`+`0 0 0 4px var(--accent-soft)` ring, faint; `tlk` uppercase micro-label, `tlv` value line).
**Behavior:** when `myTeamInfo()` resolves AND the live tournament matches: the pd-thero card keeps eyebrow `Tournament · Live` + tournament name, then renders team line (`teamName · Pool X · W–L`, pool via `state.tournamentPools`/team.pool_id, record via `computeTeamRecord`) + the 3-node timeline from `computeTeamRunTimeline` (done node omitted if no finals; now-node label: `Playing now` when isNow/live, else `Up next` + `· ~N min` when etaMin, else `· N games ahead` when gamesAhead≥1; then-node omitted if null) — and the `#pd-claim` button is NOT rendered (you're claimed). Unclaimed/signed-out: exactly today's card. Tile grid gains a 4th tile `tile('myteam', 'team', 'My Team', 'W–L · your games')` ONLY when claimed (2×2); else today's 3.
- [ ] Steps: build → `node --check` → localhost stub-verify (claimed + unclaimed at 390) → commit `feat: Home personal hero (locked Option C timeline) + My Team tile`.

### Task 4: My Team page (locked Option B)

**Files:** Modify `public/app.js` — `#tab-myteam` panel in renderPublicShell (~7918-7950); NAV_ANCHOR `myteam: 'home'` (~9414-9416); `buildMyTeamPageHTML()`; a partialRender in-place branch mirroring standings (~1401-1411); a `pdMyTeamTab` module var (`'games' | 'roster'`) + delegated seg-toggle click in the once-bound #app-content handler. `public/styles.css` — `.mt-*` kit per the locked mockup (44px Sora `.mt-rn`, pips green W / muted-red L via `--danger` / gray open, accent-soft next-strip, seg toggle, game rows W/L chip + right Sora score).
**Behavior:** claimed → centered eyebrow `TOURNAMENT NAME · Pool X[ · Seed N]` (seed via `computeSeeding` only when ≥1 pool final) + team name + big `W–L` + pips (one per my match: green W, red L, gray unplayed) + next-strip (from `computeTeamRunTimeline.next`; hidden when null) + Games↔Roster toggle (Games = `computeTeamRecord.results` rows `W/L chip · vs Opp · score`; Roster = `state.teamMembers` rows of my team — name + "You" tag on my player). Unclaimed/signed-out → `pd-empty` card: "Claim your name to see your team here" + the claim prompt routing. Empty-tournament → pd-empty explains.
- [ ] Steps: build → `node --check` → stub-verify both toggle views + empty states at 390 → commit `feat: My Team page (locked Option B scoreboard)`.

### Task 5: Standings "You" + comment fix

**Files:** Modify `public/app.js` — inside `buildStandingsPageHTML`'s shared `rowHTML` (~7811-7815): when `r.teamId === myTeamInfo()?.teamId` add class `pd-you` + a small `You` chip after the team name (`.pd-youtag` if present in CSS, else a minimal chip using accent tokens); update the stale comment at ~7796 ("You highlight = accounts slice" → done, Slice 3c). Applies in BOTH by-pool and Overall views (same template).
- [ ] Steps: build → stub-verify (my row highlighted in both views; `.pd-you` negative-margin alignment vs `.pd-card` padding checked visually) → commit `feat: Standings You highlight (claimed team)`.

### Task 6: Verify + ship

- [ ] vitest full suite green; `node --check`.
- [ ] **Throwaway e2e (real data, stubbed session):** SQL — create throwaway tournament + `register_team` two teams (creates real players+members) + SQL-claim one player for the `kc@….local` profile. Browser (localhost) — stub `state.authSession/account` as that profile, force the piggyback read shape by loading real rows via SQL results into `state.teamMembers` (or point `state.activeTournamentId` at the throwaway and let the STUB session's fetch fail-safe → stub `state.teamMembers` from the SQL rows), then §27-verify: hero timeline true values (opponent names/net/queue from the REAL rows), My Team record/pips/roster true, Standings You on the right row, all at 390 + 1920. Delete throwaway; baseline 233/18/0/0.
- [ ] Adversarial review workflow on the diff (same 4-lens find→refute-verify shape as 3b); fix confirmed findings.
- [ ] Bump version, commit, push → Vercel; curl version; prod console-clean; browser restore (§45).
- [ ] Vault: 12-history + log/current/NOW; task list closed.

## Self-Review
- **Spec coverage:** §4c resolver → Task 1; data fetch → Task 2; §4e hero/My Team/You → Tasks 3-5; states → Tasks 3-5; testing → Tasks 1+6. Covered.
- **Placeholders:** none — behaviors + shapes fully specified; exact code written at build time against re-grepped lines (file drifts).
- **Type consistency:** `resolveMyTeam` consumes `shapeClaimCandidates` rows (3b, tested); `computeTeamRecord.results` feed Task 4's Games rows; `computeTeamRunTimeline.next` feeds Tasks 3+4; You-match keys on `teamId` only (row shapes differ between computeStandings/computeSeeding).
