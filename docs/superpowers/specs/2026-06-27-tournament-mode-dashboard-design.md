# Tournament-mode admin dashboard — design (2026-06-27)

## Problem (Mike)
"Admins need a full view of the entire tournament during the entire timeline — see every team at all
times and edit everything at any time… update the tournament dashboard to make it easier to use."
"When admins add teams they need the ability to add the players too." And his structure: "from the
admin home page when you click the tournament card the bottom nav changes for the tournament. The Home
and Co-pilot nav stay but the others adjust. For easier editing and seeing what is going on."

Today the admin tournament view (`buildTournamentTabHTML`) is one long screen whose teams are only
listed/editable in `setup`; once pools/bracket run, you can't see/edit the team list, and "Add Team"
is name-only.

## Approved design
A **tournament mode** for admins with its own bottom nav and two tabs.

### Nav + mode
- `state.tournamentMode` (admin-only flag). Entering: admin Home → tap the **Tournament** card →
  `tournamentMode = true`, focus the active/in-progress tournament, land on **Manage**.
- While on: bottom nav = **Home · Manage · Live · Co-pilot** (Home + Co-pilot shared with the normal
  admin nav; Players/Courts are swapped out for Manage/Live).
- Exiting: tap **Home** → `tournamentMode = false` → normal admin Home (nav reverts to
  Home · Players · Courts · Co-pilot). Co-pilot keeps tournament mode (shared).
- Public + non-tournament admin surfaces unchanged.

### Manage tab (everything editable, at EVERY phase: setup / pools / bracket / completed)
- No active tournament → the create form + tournament list (as today).
- Active tournament:
  - Header + **Edit settings** (the fixed modal — name, nets, pool/bracket targets, cap, win-by-2).
  - **Teams — ALWAYS shown** (the "see every team at all times"): every team with its seed (once pools
    have results), each row editable at any phase — rename, edit roster/players, paid toggle,
    remove/withdraw.
  - **Add team WITH players**: team name + `team_size` player inputs (mirrors the public register form
    + co-pilot register_team), via `tdbRegisterTeam` (enforces team_size, roster, dup-guard).
  - Run controls in-context: Draw pools / Start pools (setup), Generate bracket (pools done), Reset
    pools; registration open/close + Venmo/buy-in.
- Reuses existing helpers (`buildSeedingTableHTML`, `tdbRegisterTeam`, `openTournamentSettingsModal`,
  `tdbDrawPools`/`tdbStartPoolPlay`/`tdbGenerateBracket`, team rename/paid/withdraw handlers).

### Live tab (read-first — "what's going on")
- Pools phase → the player-first pool board (`buildPoolPlayHTML`, current games + scores) + seeding.
- Bracket phase → the bracket (`buildBracketHTML`) + seeding.
- Scoring still works (tap a game → chooser/score), same as today.

## Constraints
- Mobile-first (Mike runs it on his phone). Keep the direction-A design system + tokens.
- Render-only where possible; reuse existing `tdb*` write paths + RPCs (no new DB).
- §38: 3 Manage-tab layout options on localhost before building. partialRender for background syncs.

## Out of scope (for now)
- Public-side changes. Real auth. A 5-button nav (kept to 4 per Mike's "swap the middle two").

## Build order
1. `tournamentMode` state + the mode nav swap + entry (Tournament card) / exit (Home).
2. Manage tab (teams-always + add-with-players + edit-anytime + settings + run controls + seeding).
3. Live tab (board/bracket + seeding).
4. §38 layout pick applied; verify desktop + mobile on a real tournament; ship.
