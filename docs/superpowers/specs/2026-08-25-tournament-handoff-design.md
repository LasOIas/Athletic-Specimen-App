# Tournament handoff — design spec (2026-08-25)

**Source of truth:** Mike's Claude Design Tournament handoff (25 screens), archived at
`docs/design-handoffs/2026-08-24/tournament/` (text) with the PNGs in
`C:\Users\OlasM\Downloads\Athletic Specimen tournament page.zip`. Builds on the Home + shell + motion
port shipped as v2026.08.24.5 (spec `2026-08-24-home-handoff-and-motion-design.md`). The recon
(7 Opus agents + critic, 462 file reads) is the ground truth for every delta below.

## Scope: what actually changes

**19 of 25 screens are prod byte-for-byte** and ship nothing: tn-gate, tn-register-closed, both
register-success branches, tn-rules, pl-seeding (one word: "games done"), pl-empty, pd-team-peek,
mt-empty, ht-history, claim-search/confirm/success, namefill, account-menu. **auth-signin / auth-signup
belong to the Account port (C100)** — byte-identical there, they use its `.au-*` kit and `_account.js`.
**tn-register-form**'s only delta is the shortened payment sentence, which was already decided against
in the Home spec (the verified line stays).

The round's real work, in build order:

1. **Copy + the small hub/pools deltas** (no capability change).
2. **Bracket geometry + opening view** (midpoint-centred nodes, real connectors, 1:1 open, labels).
3. **Public scoring** (the capability the round was designed around) + the My Team next-game card.
4. **The sample bracket** before seeding (the largest single build).

## Mike's decisions (AskUserQuestion 2026-08-25, all the recommended option)

1. **Public scoring returns for signed-in players.** Reverses 2026-07-11. Pool rows and bracket nodes
   open the score card; My Team gets "Report score". The three RPCs are already granted; the only block
   was `if (!state.isAdmin) return;`. What the DB refuses stays refused: a **pool** winner without both
   scores (C86 — the pool card is steppers-only, as the screen draws it), and **changing a finished
   result** (organizer-only since 0039 — a finished game does not open from the public pages, and the
   caption says "enter", never "fix").
2. **The bracket opens 1:1, anchored to the first column**, drag to pan, pinch to zoom; switching
   Winners / Losers / Championship never re-fits or moves a card. Supersedes the June fit-to-box pick.
3. **The sample bracket ships, with the seeding chip kept underneath** (registration AND pools; the copy
   is honest to each state; the reset game reads "if necessary").
4. **The hub's Seeding row keeps the leader's name** in the stat slot; the sub line takes the design's
   "Where teams stand".
5. (Earlier, same session) **The score card's rule hint always states the tournament's own targets** —
   derived from `pool_target/pool_cap` or `bracket_target/bracket_cap` via `scoringRulesFor`, no cap on the
   championship, plain sentence, no dash: "Pool games go to 15, win by 2, cap 20."

## Decisions I made (stated once, Mike's to overrule)

- **"Championship, never Final" sweeps every player-facing string**: the bracket tab, the column label
  (with the `.bk-gid` game-number second line; "Semifinals" on the last winners round and the last losers
  round), the node meta "· Done", the status line ("Championship" / "Championship (if necessary)"), the
  champions strip ("beat X in the championship"), "games done" counters, the completed stage label
  ("Complete"), the completed hub Bracket row ("Bracket complete"). **Manage and the stored `round_label`
  are untouched** until the Manage port. The live status line keeps prod's "Winners round 2" form.
- **One score card, prod's.** The `.mgv-sc*` markup and every hook stay (tests, motion wiring); the CSS is
  restyled to the round's geometry (380px, 40px stepper pills, 26px numerals, stacked footer with a
  white "Save live score" secondary). Prod's three truth features stay: the primary names the leader and
  the score, tapping a team swaps contradicting numbers, ties disable. **Bracket cards accept a winner
  with no score** (the RPC allows it; the client no longer disables the primary on 0–0 when a side is
  picked and the game is a bracket game). The live secondary refuses 0–0 ("Add a point to at least one
  team first."). The 08-24 round's live button supersedes the 08-22 note that dropped it.
- **Who may tap:** signed-in (`state.account`) — the tab is already sign-in gated; admins get the same
  page. Final games carry no hook. Feeder-pending nodes carry no hook. After a public save:
  `tdbRefreshTournaments()` then `partialRenderTournament()` — standings are derived, never patched
  (the design's `applyDelta` is not ported).
- **Pools rows:** "A vs B" with the winner in green (`.win`), never reordered (the pairing reads the same
  before and after); FINAL → DONE; your team is a blue chip (CSS), the You row sits square with its
  hairline; the caption becomes "Tap any game to enter its score." (the your-team legend goes; the chip
  and the You tag carry it); the You row's second line "You play at nets 1-2" reuses `poolNetRange`'s
  grammar through a new pure `teamNetRange`.
- **Hub:** record on the sub line (`.tn-rec`), stat "Next on **net 2**" / "Playing now" / chevron; "games
  done" under the fraction; "14 of 36 games"; Bracket row un-faded with "Double elimination · all N
  games" (N from `generateDoubleElim(teams, reset).realMatches` less the reset game) — only once the
  sample bracket exists to land on; meta keeps "8 teams · 3 nets".
- **Bracket geometry:** adopt the design's midpoint-centring and stub + shared-riser + horizontal
  connectors, computed from layout (offset chain), **but keep prod's feeder pairing** (`data-mid` →
  `data-next` from `winner_next_match_id`; the design's column-index pairing is wrong for the losers
  bracket) and keep per-feeder classed stubs so Manage's champion-path tint survives; the riser is its own
  unclassed path. `.bt-rlabel` lifts out of the column flow so it cannot skew the spacing. The bracket
  shim in `_shared.css:822-828` is NOT ported. Scores in the node: 12.5px tabular Inter, winner in ink,
  live in live-ink. Side tabs: nowrap + the ≤430px step-down. Bracket columns join the `m-enter` stagger.
- **My Team next-game card:** NET tile (hidden when the next game has no net), "vs Opponent" 16px, queue
  line "after G4" derived from the real queue position on my net (a fact, not an ETA; omitted on bracket
  day), stage footer "Pool play" / "Bracket · Winners" / "Bracket · Losers" / "Bracket · Championship",
  `.is-elim` on the losers side only, "Report score" opening the same card for `next.id` (label "Finish
  game" when the game is already live); the net is named once (the tile). At ≥1024 the footer rides the
  main row. `computeTeamRunTimeline` gains `id`, `phase`, `side`, `afterGame`.
- **Sample bracket:** one pane at a time, selected by the existing `tv2-bracket-side` handler and
  `state.bracketSide`, rendered through the real `.bt-*` furniture with `data-mid`/`data-next` so
  `layoutBracketTree` draws it (dashed nodes on the page tint, `.bk-pv-pan`). Round-1 slots read "Seed 1 …
  Seed 8"; later slots "Winner of G3" / "Loser of G7"; every sample node keeps a "vs". Copy: registration
  → "Built from the N teams registered so far."; pools → "Built from the N teams in the tournament."; then
  "Seeds fill in when the last pool game is played. The shape stays the same." (no dash). The `.pd-bk-prog`
  bar stays during pools; the seeding chip stays.
- **Free rides:** the dangling-comma bug in the desktop block (`styles.css:2900-2904`) gets its one-line
  fix; the `.def` rule and its comment go with the grammar; the bracket page's prose gets a 640px clamp
  at ≥1024 while the tree keeps the full width.
- **Not ported, on purpose:** `applyDelta`; `data-mgss-live` as a DOM carrier (prod persists live scores
  via `set_live_score`); the `aria-label`-keyed card CSS (class modifiers instead); "Update winner" on a
  decided game (C79); the `.mgs-stake` / `.mgs-rsub` lines no screen emits (prod's `mgScoreNextHTML`
  already states the stakes from real feeder pointers).

## Global constraints (every task)

- `APP_VERSION` → `'2026.08.25.N'`; `node --check public/app.js` after every edit; commit + push per task;
  every commit chain gates on vitest's exit code (the .4 lesson).
- No em dashes in player-facing copy; no neon; skill never on a public surface; 390 primary / 1024 desktop.
- `partialRender`/`partialRenderTournament` for background syncs; `mEnter()` only on real navigation.
- Tests are string assertions via the vm bridge + source guards; the suite has no DOM.
- Appended CSS with `PORT NOTE`s; the only new `!important`s are the documented iOS font-size counters.
