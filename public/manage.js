// public/manage.js: the Manage surfaces (the admin tab), extracted from app.js in C102 (2026-08-26).
// A classic script sharing the global lexical record with app.js. DECLARATIONS ONLY: function declarations
// and let/const whose initializer depends on nothing in app.js. It loads BEFORE app.js (index.html), because
// app.js runs init() synchronously and saveLocal reaches mgSaveTournamentPin during that call. A duplicate
// top-level name across the two files is a load-time SyntaxError (let/const) or a silent override (function);
// test/client-files.test.js guards both. Nothing here is imported or exported.

// ── Manage tab (session-10 pick R1) — admin-only, lives on the PUBLIC shell as a 4th nav item. ──
// The lead: title flush top -> NEEDS YOU (omitted when nothing is pending) -> EVERYTHING rows
// (Tournament · Pickup days · Players · Teams · Admins), each a flat tappable row with a one-line status
// sub + chevron. Flat on stone (NO pd-card), pl-sect section labels, mg-* kit, SVG chevrons, plain English.
// `manageView` ('lead' | area) is a MODULE var (the legacy tournament-mode state.manageView is deleted);
// it survives partialRender so a background sync repaints the current Manage surface, never a full render().
let manageView = 'lead';  // 'lead' = the needs-you lead; 'pickup'/'pickup-form' (Task 2); 'players' (Task 3); else an area id (placeholder)
// Manage -> Check-in (2026-07-19 spec): chip filter, live search text, last toggle for UNDO.
// mgckLast survives background container repaints (module scope); all three reset on page entry.
let mgckFilter = 'all';
let mgckQ = '';
let mgckLast = null; // { key, name, dir: 'in'|'out' }
let pickupEditId = null;  // Task 2: the pickup_days row id being edited in 'pickup-form' (null = adding a new day)
// Task 3 (Players directory, pick R4): the live-search value + Select(bulk) state. All survive the container-
// swap repaint AND guard the poll-clobber (a background sync must never wipe a half-typed query or a selection).
let mgPlayerQuery = '';         // the current #mg-player-search value
let mgSelectMode = false;       // bulk Select mode on/off
let mgSelected = new Set();     // selected player identity keys (playerIdentityKey) while in Select mode
// Task 4 (Teams page, pick R5 trimmed): the selected team-SIZE chip (4s default). Survives the
// container-swap repaint (a background sync must not reset a chosen size).
let mgtSize = 4;                // the active size chip (2/3/4/6); 4s default per the mockup
// 2026-08-07 (Mike): GENERATED TEAMS ARE READ-ONLY. First "remove the drag and drop player feature from the
// teams that are generated" took out the 2026-08-03 grip gesture (with its Undo strip and skill-drift
// warning, which only that gesture could ever populate); then "remove all ways to switch players" took out
// the tap-to-swap sheet as well, and with it mgtSwapKey/mgtSwapFrom, buildMgtSwapSheetHTML, mgtApplySwap and
// the moveGeneratedPlayerBetweenTeams mutation. A team row now carries no hooks at all. The ONLY way to
// change the board is Generate, which rebuilds every team.
// Task 5 (Tournament sub-hub, pick R2 + Registration, pick R7): the open tournament sub-view under
// manageView==='tournament'. null = the sub-hub (the 7 rows); 'registration' = the Registration view (built
// now); 'teams'|'pools'|'bracket'|'settings'|'rules'|'closeout' render honest placeholders until Tasks 6-10
// fill them. Survives the container-swap repaint (a background sync never resets which sub-view is open).
let mgtView = null;
// Round 2026-08-04, design round "Tournament switcher on Manage" (Mike: "on the manage page i need to be
// able to choose between all the tournaments, one to choose which one is active … then the active
// tournament is whats edited from the manage page"). Manage -> Tournament used to jump straight into ONE
// tournament — the one at state.activeTournamentId — with no list and no way to reach a different one,
// which is why he ended up RENAMING an old tournament instead of managing two.
//
// This SUPERSEDES the interim picker that shipped earlier the same day at Manage -> Tournament. The choice
// does not belong INSIDE the tournament area at all: the Manage HUB now opens with a card naming the
// tournament every row below it edits, and the list is its own screen behind that card
// (manageView === 'tournaments'), with New tournament at the top of it. Deleted with the interim version:
// mgtPickerOpen / mgtFromPicker, buildMgTournamentPickerHTML, mgtPickRowHTML, mgOpenTournamentPicker,
// mgtHubBackToList and the data-mgt-pick / data-mgt-tolist hooks. The sub-hub's back button goes back to
// the Manage hub again, unconditionally, because the hub is now where the switch lives.
//
// mgTournamentPinned is why the switch STICKS. mgSyncActiveTournament() exists to glue the loaded
// collections to manageLeadTournament() on every area entry, which is correct while "which tournament"
// is inferred — and is exactly wrong once it is CHOSEN: without this flag, picking a tournament and then
// tapping any Manage row would silently repoint him back at the resolver's pick, and the switcher would
// look broken in the one way that is hardest to see. Module var for the same reason as mgtView: it
// survives the container-swap repaint, so the 15s background poll can never unpin him.
let mgTournamentPinned = false; // true = the organizer picked this tournament explicitly; the resolver stops overriding it
// Round 2026-08-25 (the Manage handoff): the hub's two pieces of view state. Module vars for the same
// reason as mgtView and mgTournamentPinned — repaintManage() swaps the whole container, so a flag stored in
// the DOM would be wiped by the very next 15s poll (and by the repaint the toggle itself triggers).
//   mgHubPickerOpen — the inline tournament picker's open/closed state.
//   mgHubDoneText   — the confirmation strip under the quick actions ("Registration is open"). Set only by a
//                     write that PROVED it landed, and cleared by any navigation away from the hub. There is
//                     no Undo link: neither of the two writes that set it has a reversing RPC, and the
//                     registration switch is its own undo.
let mgHubPickerOpen = false;
let mgHubDoneText = '';
// Fix round 1 (2026-08-25): attachHandlers' Manage block is guarded by appContent.dataset.navTabBound, but
// renderPublicShell() REBUILDS #app-content on every full render() (42 call sites) — the dataset guard dies
// with the old node, so the block's body runs again, and anything it binds on DOCUMENT stacks up one copy
// per render. This module flag outlives the node, so it is what guards the document-level key listeners.
let mgDocKeysBound = false;
// Task 7 (Pools & schedule admin, pick R9): the active pool tab in the post-draw schedule
// ('A'|'B'|…|'seeding'; null → the first pool) + whether the Pool-controls section is expanded. Both
// survive the container-swap repaint (a background score sync must not reset the tab or collapse the panel).
let mgpPoolFilter = null;
let mgpControlsOpen = false;
// Round 2026-08-24 (Task 8 of the Manage handoff): which team's move picker is open, and which pool's nets
// are being edited inline. Both are half-finished actions with NO write behind them yet, so they also drive
// manageNetsDirty() — the 15s poll must not rebuild the panel out from under a typed net list or a picker
// waiting on a destination. Cleared wherever mgpControlsOpen is (adopt / reset / delete / create).
let mgpMoveTeamId = null;
let mgpNetsEditPoolId = null;
// Task 8 / round 2026-08-03 (README §10 "State: showFinished, default false"): the Bracket board hides
// games that are already final so it shows only what is live, next, or coming. The closing "already done ·
// Show" row flips this. Survives the container-swap repaint like every other manage toggle, so a background
// score sync can never re-hide a board the admin just opened to fix a wrong score.
let mgBracketShowDone = false;
// Task 10 (Close out, pick R12): the champion the admin will record on close. undefined = follow the computed
// bracket suggestion (computeChampion); a team-id string = a manual CHANGE-picker override; '' = an explicit
// "no champion recorded". Survives the container-swap repaint (a background sync must not reset the pick); the
// picker sheet is body-level (poll-clobber-immune). Reset to undefined after a successful close.
let mgCloseoutChampId = undefined;
// Task 11 (Admins, pick R6): the seats + activity-log surface under manageView==='admins'. Seat/log data
// load LAZILY on open via the 0051 read RPCs (list_admin_seats / read_action_log) — NOT part of the boot
// sync — into these module vars, then repaintManage(). All survive the container swap (a background poll
// must never wipe a half-typed email or a loaded list). mgAdminsView: 'seats' | 'log'. mgSeats/mgLog:
// null = not loaded yet (→ loading line), [] = loaded-empty (→ honest empty state), else the rows.
let mgAdminsView = 'seats';
let mgSeats = null;
let mgSeatsLoading = false;
let mgSeatsError = '';
let mgAssignOpen = false;   // the inline assign-by-email field (owner taps a waiting seat)
let mgLog = null;
let mgLogLoading = false;
let mgLogError = '';

const MG_CHEV ='<svg class="mg-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>';


// The tournament the Manage lead reports on: a live event (pools/bracket), else the most-recent SETUP
// tournament — REGARDLESS of registration_open. The old filter (`registration_open && status==='setup'`)
// stranded the whole Manage → Tournament workflow in the gap between "close registration" and "draw pools":
// the moment an admin closed registration on a still-setup tournament it resolved to null, so the sub-hub,
// the Teams/Registration views, and the needs-you lead all went blank mid-setup. state.tournaments loads
// created_at DESC (tdbListTournaments), so the first `setup` match IS the most-recent one. 'completed' stays
// excluded (a finished event isn't the thing you're managing next).
function manageLeadTournament() {
  return publicLiveTournament()
    || (state.tournaments || []).find((x) => x && x.status === 'setup')
    // Task 10 (pick R12): a just-CLOSED tournament stays manageable so the admin can reopen it and so the
    // Close out sub-view can show the recorded champion. Last resort only (setup/live win): the most-recent
    // completed tournament. This is what makes "you can reopen from there" actually reachable after close.
    || (state.tournaments || []).filter((x) => x && x.status === 'completed')
         .sort((a, b) => String((b && (b.updated_at || b.created_at)) || '')
           .localeCompare(String((a && (a.updated_at || a.created_at)) || '')))[0]
    || null;
}

// The UPCOMING pickup days (>= today), pre-filtered for the pure needs-you model (its `noday` item just
// checks length). Empty → `noday` fires honestly.
function manageUpcomingPickupDays() {
  return pickupDaySet().filter((d) => d && sessionIsUpcoming(d.day));
}

// Thin caller over the pure attention model (pure.js). Round 2026-08-04: reads mgActiveTournament(), not
// manageLeadTournament(). The hub's switcher card names the tournament Manage is pointed at and its caption
// states the rule out loud — "Every row below edits this one" — and Needs you is one of those rows. It also
// closes a real mismatch: state.tournamentTeams belongs to state.activeTournamentId, so pairing it with the
// LEAD tournament reported one tournament's unpaid teams under another tournament's name, which is the
// failure the 2026-07-11 resolver note describes. With nothing explicitly picked mgActiveTournament()
// returns the lead, so this is identical to the shipped behaviour until the organizer switches.
// The collections (teams/pools/matches) are loaded for state.activeTournamentId and for NOTHING else, so
// they are handed over only when they belong to the tournament being reported on. Pairing one tournament's
// teams with another tournament's name is the exact failure the 2026-07-11 resolver note describes, and an
// empty list is honest where a borrowed one is not.
function manageNeedsYouCtx(scope) {
  const t = mgActiveTournament();
  const loaded = !!(t && state.activeTournamentId === t.id);
  const matches = loaded && Array.isArray(state.tournamentMatches) ? state.tournamentMatches : [];
  const main = matches.filter((m) => m && m.phase === 'main');
  return {
    t,
    teams: loaded && Array.isArray(state.tournamentTeams) ? state.tournamentTeams : [],
    pickupDays: manageUpcomingPickupDays(),
    pools: loaded && Array.isArray(state.tournamentPools) ? state.tournamentPools : [],
    matches,
    tournaments: state.tournaments || [],
    scope,
    venueLoaded: tournamentHasVenue(),
    // Fix wave (2026-08-25 final review): the "silent game" item named a bracket game by queue_order, which
    // is its execution order and not the number on the board. The EXISTING numbering (pure.js) — never a
    // second scheme — so the item sends the organizer to the game every other bracket surface calls by
    // that name.
    gameNumbers: main.length ? bracketGameNumbers(main).byId : null,
  };
}
function manageNeedsYou() { return manageNeedsYouModel(manageNeedsYouCtx('hub')); }

// ── Round 2026-08-04 switcher: the phase vocabulary, derived only from columns that EXIST ──────────────
// The design's state model names six phases (draft | scheduled | registration | pools | bracket |
// finished). `tournaments` carries `status` ('setup'|'pools'|'bracket'|'completed') plus the
// `registration_open` boolean and nothing that separates a draft from a scheduled event. So a setup
// tournament reads Registration when registration is open and Setup when it is closed — the two words the
// data can actually back. Draft and Scheduled are NOT printed: they would be a guess wearing the clothes of
// a state. An unrecognised status returns '' so the row prints no state word at all.
function mgTournamentPhase(t) {
  if (!t) return '';
  if (t.status === 'completed') return 'finished';
  if (t.status === 'bracket') return 'bracket';
  if (t.status === 'pools') return 'pools';
  if (t.status === 'setup') return t.registration_open ? 'registration' : 'setup';
  return '';
}
// The right-hand state word on a chooser row (caps via .mgv-rmeta) …
const MGT_PHASE_WORD = { registration: 'Registration', setup: 'Setup', pools: 'Pool play', bracket: 'Bracket', finished: 'Finished' };
// … and the same fact as a lower-case clause inside the card's meta sentence.
const MGT_PHASE_SENTENCE = { registration: 'registration open', setup: 'registration closed', pools: 'pool play', bracket: 'bracket', finished: 'finished' };

// "Sat Aug 22" from an `event_date` date column ('2026-08-22'). Split and rebuilt as LOCAL midnight the way
// formatSessionDate does, because new Date('2026-08-22') is UTC midnight and prints as Aug 21 anywhere west
// of Greenwich — a Saturday event reading Friday is the exact off-by-one this project already fixed once.
// '' on anything missing or unparseable, so the caller drops the clause instead of printing "Invalid Date".
function mgEventDateLabel(value) {
  if (!value) return '';
  const s = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (isNaN(dt.getTime())) return '';
  // Round-trip guard: new Date(2026, 12, 45) does not throw, it ROLLS OVER to Feb 2027. A real `date`
  // column can never hand us that, but a junk value passed through the shape check would then print a
  // confident wrong day, which is worse than printing nothing.
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return '';
  try {
    return dt.toLocaleDateString('en-US', { weekday: 'short' }) + ' '
      + dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch (_) { return ''; }
}

// How many teams are in a tournament, or null when this app cannot honestly say. state.tournamentTeams is
// loaded for state.activeTournamentId and for nothing else, so every other tournament returns null and its
// clause is dropped rather than borrowing the selected one's number.
function mgManagedTeamCount(t) {
  return (t && state.activeTournamentId === t.id && Array.isArray(state.tournamentTeams))
    ? state.tournamentTeams.length : null;
}
// "6 of 12 teams" once 0057 lands and a cap is set; "6 teams" when the column or the value is absent; ''
// when the count itself is not loaded. The cap half is column-guarded because a pre-0057 row reads
// undefined for team_cap and "6 of undefined teams" is worse than no cap at all.
function mgTeamsClause(t) {
  const n = mgManagedTeamCount(t);
  if (n === null) return '';
  const cap = (tournamentHasTeamCap() && Number(t.team_cap) > 0) ? Number(t.team_cap) : null;
  return cap ? `${n} of ${cap} teams` : `${n} team${n === 1 ? '' : 's'}`;
}

// RETIRED (fix wave, 2026-08-25 final review): mgSwitcherMetaText wrote the meta sentence for the switcher
// CARD, which this round replaced with the hub title's own line (mgHubMetaHTML). No builder called it, and
// it had drifted from the shipped copy — a closed setup event read "registration closed" where the hub says
// "not open yet". Its three clause helpers (mgEventDateLabel / mgTournamentPhase / mgTeamsClause) are still
// live and still tested; only the second, staler sentence over the same facts is gone.

const MGV_CHEVDOWN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const MGV_PLUS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>';

// The Tournament row's trailing status clause. Round 2026-08-04 took the tournament NAME out of this
// subtitle — the card above states it once — so what is left is what the row leads into plus where that
// work stands. The setup branch drops its clause entirely when the pools collection does not belong to this
// tournament, rather than reporting another tournament's draw.
function mgTournamentRowStage(t) {
  if (t.status === 'completed') return 'finished';
  if (t.status === 'bracket') return 'bracket running';
  if (t.status === 'pools') return 'pool play running';
  const poolsLoaded = state.activeTournamentId === t.id && Array.isArray(state.tournamentPools);
  if (!poolsLoaded) return '';
  return state.tournamentPools.length ? 'pools drawn' : 'pools not drawn';
}

// Manage data-sync (e2e catch, 2026-07-11): the Manage surface renders manageLeadTournament(), but the
// tournament data collections (teams/pools/matches) load for state.activeTournamentId — which only the old
// shell's tv2-select-tournament ever set. If they diverge (e.g. a newer setup tournament exists), Manage
// shows one tournament's NAME over another tournament's DATA. Follow the resolver: when they differ, adopt
// the resolved id + refresh the collections, then repaint. Re-entrancy-guarded so poll/tap storms can't
// stack refreshes.
// The tournament AREA's resolver (e2e catch #2, 2026-07-11): every sub-view under Manage → Tournament
// keys on the ACTIVE tournament first so the area stays on ONE tournament mid-flow — closing a tournament
// must not silently swap the close-out page to the next setup tournament (which made Reopen unreachable).
// Fresh entries re-glue active to the lead resolver via mgSyncActiveTournament, so the two agree except
// during an in-flow transition, which is exactly when active must win. The LEAD page + needs-you keep
// manageLeadTournament() (the front page follows the resolver, deliberately).
function mgActiveTournament() {
  const byActive = state.activeTournamentId ? (state.tournaments || []).find((x) => x.id === state.activeTournamentId) : null;
  return byActive || manageLeadTournament();
}

let mgSyncingTournament = false;
function mgSyncActiveTournament() {
  // Round 2026-08-04: an EXPLICIT pick outranks the resolver. Re-gluing active to manageLeadTournament()
  // is right while "which tournament" is inferred; once the organizer chose one from the switcher, doing
  // it again on the next row tap would quietly undo the switch.
  if (mgTournamentPinned) return;
  const t = manageLeadTournament();
  if (!t || state.activeTournamentId === t.id || mgSyncingTournament) return;
  mgSyncingTournament = true;
  state.activeTournamentId = t.id;
  Promise.resolve(tdbRefreshTournaments())
    .then(() => { mgSyncingTournament = false; repaintManage(); })
    .catch(() => { mgSyncingTournament = false; });
}

// ── Round 2026-08-25 (Mike's Manage handoff): the hub is a CONTROL ROOM, not a directory ──────────────
// "i really like the manage page but i think we can do so much more with it". Before: six rows of equal
// weight that read the same three weeks out and mid-tournament, under a boxed card that spent four lines
// naming the tournament and a footnote apologising for the ambiguity. Now the tournament IS the page title,
// "Manage" drops to an eyebrow, and the facts that were inside the card sit under it as one meta line.
// Tapping the title drops an inline picker over the rows — pick and you are switched, no screen change and
// no back button, so the chooser screen (manageView === 'tournaments') retires with it.

// Today in the ORGANIZER's zone, as 'YYYY-MM-DD'. new Date().toISOString() is UTC and would read tomorrow
// after 6pm Mountain, which is exactly when he is standing at the nets — the phase track would say Check-in
// a day early. The pure phase model takes this as a parameter so it stays testable.
function mgLocalTodayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// "Sat Aug 22" without the weekday → "Aug 22". formatSessionDate spells the whole thing out ("Friday, July
// 16, 2027"), which is right in a full-width subtitle and far too long for a right-hand chip, so the chip
// reuses mgEventDateLabel's LOCAL-midnight parse and drops the weekday word.
function mgHubShortDate(value) {
  const label = mgEventDateLabel(value);
  return label ? label.split(' ').slice(1).join(' ') : '';
}

// The title's meta sentence: date · phase · teams, same clauses as the retired card's mgSwitcherMetaText and
// dropped the same way when the value behind one is not there. The difference is live ink: the phase clause
// is a <b> so "registration open" reads as a state, muted (.is-off) when the tournament is closed or done.
function mgHubMetaHTML(t) {
  if (!t) return '';
  const phase = mgTournamentPhase(t);
  const off = phase === 'setup' || phase === 'finished';
  return [
    tournamentHasEventDate() ? escapeHTML(mgEventDateLabel(t.event_date)) : '',
    phase ? `<b${off ? ' class="is-off"' : ''}>${escapeHTML(phase === 'setup' ? 'not open yet' : MGT_PHASE_SENTENCE[phase])}</b>` : '',
    escapeHTML(mgTeamsClause(t)),
  ].filter(Boolean).join(' · ');
}

// The inline picker. Always BUILT (hidden or not) so opening it is a class swap rather than a second render
// path, and so the poll's container swap can never paint a half-open panel. Groups and subs are the chooser's
// — mgTournamentPickerList / mgTournamentPhase / mgtlSeasonSub / mgtlFinishedSub all survive it.
function mgHubPickerHTML(t) {
  const list = mgTournamentPickerList();
  const activeId = t ? String(t.id) : '';
  const row = (x) => {
    const phase = mgTournamentPhase(x);
    const sub = phase === 'finished' ? mgtlFinishedSub(x) : mgtlSeasonSub(x);
    return `<button type="button" class="mgh-prow${String(x.id) === activeId ? ' is-on' : ''}" data-mgp-pick="${escapeHTMLText(String(x.id))}">`
      + `<span class="mgh-pb"><span class="mgh-pn">${escapeHTML(x.name || 'Tournament')}</span>`
      + (sub ? `<span class="mgh-ps">${escapeHTML(sub)}</span>` : '') + `</span>`
      + (phase ? `<span class="mgh-pstate">${escapeHTML(MGT_PHASE_WORD[phase])}</span>` : '')
      + `</button>`;
  };
  const grp = (label, rows) => rows.length ? `<div class="mgh-pgrp">${label}</div>` + rows.map(row).join('') : '';
  return `<div class="mgh-pick" data-mgp-panel${mgHubPickerOpen ? '' : ' hidden'}>`
    + grp('This season', list.filter((x) => mgTournamentPhase(x) !== 'finished'))
    + grp('Finished', list.filter((x) => mgTournamentPhase(x) === 'finished'))
    + `<button type="button" class="mgh-pnew" data-mgtl-new><span class="mgh-pnewic">${MGV_PLUS_SVG}</span><span>New tournament</span></button>`
    + `<p class="mgh-pnote">Everything in Manage edits the one you pick. Finished tournaments stay open so you can fix a score after the fact.</p>`
    + `</div>`;
}

// The title block: eyebrow, the mark in the corner, the tournament name as the h1 with a caret, the meta
// line, and the picker that drops out of it.
function mgHubScopeHTML(t) {
  const name = t ? (t.name || 'Tournament') : 'No tournament yet';
  return `<div class="mgh-scope"><div class="mgh-eyebrow">Manage</div>`
    + `<img class="mgh-mark" src="/logo-mark.png" alt="" aria-hidden="true" />`
    + `<button type="button" class="mgh-title" data-mgp-toggle aria-expanded="${mgHubPickerOpen ? 'true' : 'false'}">`
    + `<span class="mgh-tname">${escapeHTML(name)}</span>${MGV_CHEVDOWN_SVG.replace('<svg ', '<svg class="mgh-car" ')}</button>`
    + (t ? `<div class="mgh-meta">${mgHubMetaHTML(t)}</div>` : '')
    + mgHubPickerHTML(t)
    + `</div>`;
}

// The six-step track. No clock — these tournaments do not run to one — so it marks SEQUENCE: what is behind
// you, what you are in, what is left. Shared with the tournament page.
function mgHubTrackHTML(t) {
  const now = manageHubPhaseIndex(t, mgLocalTodayStr());
  return `<div class="mgh-track" aria-label="Where this tournament is">`
    + MANAGE_HUB_STEPS.map((s, i) => `<span class="mgh-step${i < now ? ' is-done' : (i === now ? ' is-now' : '')}">${s}</span>`).join('')
    + `</div>`;
}

const MGH_TICK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

// Two quick actions, never a tray: the phase-defining one in the accent and the one an organizer reaches
// for at any hour. Labels ride on a <span> because production forces 16px on <button>. The registration flip
// writes and READS BACK (mgHubFlipRegistration) with #mgh-status underneath, so a refused write is never
// silent, and its confirmation strip carries no Undo — the switch is its own undo.
function mgHubActsHTML(t) {
  if (!t) return '';
  let primary = '';
  if (t.status === 'setup') {
    primary = t.registration_open
      ? `<button type="button" class="mgh-act is-primary" data-mgh-reg="close"><span>Close registration</span></button>`
      : `<button type="button" class="mgh-act is-primary" data-mgh-reg="open"><span>Open registration</span></button>`;
  } else if (t.status === 'pools' || t.status === 'bracket') {
    primary = `<button type="button" class="mgh-act is-primary" data-mgt-view="pools"><span>Open score sheet</span></button>`;
  }
  return `<div class="mgh-acts"><div class="mgh-face">${primary}`
    + `<button type="button" class="mgh-act" data-mgt-view="teamadd"><span>Add a team</span></button></div>`
    + mgHubStatusHTML() + `</div>`;
}

// The confirmation strip + the status target the hub's two WRITES report on, in ONE place because BOTH
// pages need them (fix wave 2026-08-25). The tournament page renders the same scoped Needs-you list, and
// its 'signups' → regopen and 'rules' → reuserules rows call the same mgHubFlipRegistration /
// mgHubReuseRules — but #mgh-status was emitted only by mgHubActsHTML, which that page does not render, so
// a refused write there wrote into nothing at all and a write that landed showed no confirmation.
// Emitted exactly ONCE per page: the hub gets it inside the quick actions, the tournament page under its
// Needs-you rows. It is deliberately NOT inside mgNeedsRowsHTML — that returns '' on an empty list, and the
// item that triggers a write is the first thing to disappear once the write lands, which is precisely when
// the confirmation has to still be on screen. The strip only ever means the write landed: both writers
// clear mgHubDoneText before reporting a refusal.
function mgHubStatusHTML() {
  const done = mgHubDoneText
    ? `<div class="mgh-done is-under">${MGH_TICK_SVG}<span class="mgh-donetxt">${escapeHTML(mgHubDoneText)}</span></div>`
    : '';
  return done + `<p class="mgr-status" id="mgh-status" role="status" aria-live="polite"></p>`;
}

// Task 3 (2026-08-25 hub round): the game-day "On the nets" strip — the honest subset of the design's live
// strip (mg-hub-live). Prints only what the DB can back: which net, the matchup, its context (pool letter or
// bracket side + game number), and "no score yet" when a live game is genuinely scoreless. NO minutes column
// and NO "checked in" wording ship — there is no start-time column and no arrival fact behind either, so the
// design's duration/checked-in reads were dropped rather than faked. An idle net's "could start now" game
// comes from pickPoolCurrentGames (pure.js) — its first caller (vault C77) — fed one games list per net
// (index 0 = net 1), each sorted by queue_order and holding only two-team games, so a team already placed on
// an earlier net is never offered a second game at once. Renders only on game day (pools/bracket) with nets
// configured, and only from collections that belong to state.activeTournamentId: those collections are
// loaded for the active tournament and NOTHING else (mgActiveTournament can fall back to
// manageLeadTournament when the pick is stale), so showing another tournament's nets under this one's name
// would be the exact borrowed-data failure the 2026-07-11 resolver note already guards against elsewhere.
function mgHubLiveStripHTML(t) {
  if (!t || (t.status !== 'pools' && t.status !== 'bracket')) return '';
  const nets = Number(t.net_count) > 0 ? Number(t.net_count) : 0;
  if (!nets) return '';
  if (state.activeTournamentId !== t.id) return '';
  const teams = state.tournamentTeams || [];
  const pools = state.tournamentPools || [];
  const matches = (state.tournamentMatches || []).filter((m) => m && m.team_a_id && m.team_b_id);
  const main = matches.filter((m) => m.phase === 'main');
  const gn = main.length ? bracketGameNumbers(main).byId : {};
  const gameLabel = (m) => 'G' + (m.phase === 'main' ? (gn[m.id] || '') : (m.queue_order || ''));
  const ctx = (m) => {
    const where = m.phase === 'main'
      ? (m.side === 'grand_final' ? 'Championship' : (m.side === 'losers' ? 'Losers' : 'Winners'))
      : ('Pool ' + ((pools.find((p) => p.id === m.pool_id) || {}).label || ''));
    return where + ' · ' + gameLabel(m);
  };
  const live = matches.filter((m) => m.status === 'live' && m.net != null);
  // Clamped to 1..nets: a stray net value outside the configured count (or 0/null) must never
  // throw the header out of step with the rows, which only ever render 1..nets.
  const playing = new Set(live.filter((m) => Number(m.net) >= 1 && Number(m.net) <= nets).map((m) => Number(m.net))).size;
  // A live game stays IN this list (only 'final' drops out). It is never READ for its own net —
  // the live.find branch above wins there — but pickPoolCurrentGames still needs to see it so its
  // teams land in the picker's `used` set; otherwise a team playing live on net 1 is invisible to
  // the picker and its NEXT queued game on net 2 gets offered as startable while the team is still
  // mid-match (fix round 1, 2026-08-25: reviewer-caught cross-net double-booking).
  const notFinal = matches.filter((m) => m.status !== 'final');
  const byId = {};
  notFinal.forEach((m) => { byId[m.id] = m; });
  const netGames = [];
  for (let n = 1; n <= nets; n++) {
    netGames.push(notFinal.filter((m) => Number(m.net) === n).sort((a, b) => (a.queue_order || 0) - (b.queue_order || 0)));
  }
  const currentByNet = pickPoolCurrentGames(netGames);
  const rows = [];
  for (let n = 1; n <= nets; n++) {
    const m = live.find((x) => Number(x.net) === n);
    if (m) {
      const silent = !(Number(m.score_a) > 0 || Number(m.score_b) > 0);
      rows.push(`<div class="mgh-lnet${silent ? ' is-late' : ''}"><span class="mgh-lnn">${n}</span><span class="mgh-lnb"><span class="mgh-lnt">${escapeHTML(teamNameById(teams, m.team_a_id))} vs ${escapeHTML(teamNameById(teams, m.team_b_id))}</span><span class="mgh-lns">${escapeHTML(ctx(m))}${silent ? ' · no score yet' : ''}</span></span></div>`);
    } else {
      const next = currentByNet[n - 1] ? byId[currentByNet[n - 1]] : null;
      rows.push(`<div class="mgh-lnet is-idle"><span class="mgh-lnn">${n}</span><span class="mgh-lnb"><span class="mgh-lnt">Idle</span><span class="mgh-lns">${next ? escapeHTML(gameLabel(next) + ' can start') : 'Nothing queued'}</span></span></div>`);
    }
  }
  return `<div class="mgh-live"><div class="mgh-livehd"><span>On the nets</span><span class="mgh-liveq">${playing} playing · ${nets - playing} idle</span></div>${rows.join('')}</div>`;
}

// Needs you, with the fix in the row. Shared with the tournament page (headLabel differs). Titles emit RAW:
// they are fixed copy plus counts, and the one value interpolated from a DB row is `matches.net`, a numeric
// column ("Net 3 has no score"). Subs may embed team or tournament NAMES and are escaped. `.is-go` = a jump
// (neutral ring); the accent ring is reserved for the two items that write.
function mgNeedsRowsHTML(items, headLabel) {
  if (!items.length) return '';
  const hook = (it) => it.target.view ? ` data-mgt-view="${it.target.view}"`
    : it.target.area ? ` data-mg-area="${it.target.area}"`
      : it.target.matchId ? ` data-mgh-score="${escapeHTMLText(String(it.target.matchId))}"`
        : ` data-mgh-fix="${it.target.action}"${it.target.from ? ` data-mgh-from="${escapeHTMLText(String(it.target.from))}"` : ''}`;
  return `<div class="pl-sect mgh-sect is-attn">${headLabel}<span class="mgh-sectn">${items.length}</span></div>`
    + items.map((it) => `<div class="mg-row mgh-nrow"><div class="mgh-face">`
      + `<button type="button" class="mgh-nbody"${hook(it)}><span class="mgh-nn">${it.title}</span>`
      + `<span class="mgh-ns">${escapeHTML(it.sub)}</span></button>`
      + `<button type="button" class="mgh-nact${it.kind === 'jump' ? ' is-go' : ''}"${hook(it)}>`
      + `<span>${it.verb}</span></button></div></div>`).join('');
}

// The one right-hand chip class, prod's. The design's `.mgh-state` is the same affordance under a second
// name and is deliberately not emitted anywhere. Empty text → no element at all, which is how "we do not
// know that yet" is drawn (never a dash, never a zero).
function mgHubStateChip(text, warn) {
  return text ? `<span class="mgv-rmeta${warn ? ' is-warn' : ''}">${escapeHTML(text)}</span>` : '';
}

// "6 of 12" / "12 teams" / "None yet" — mgTeamsClause's sentence trimmed for a chip. Explicit rather than a
// regex over the whole clause: the capped form drops the trailing word (a chip reading "6 of 12 teams" is
// wider than the row it sits in), the uncapped form keeps it, a loaded ZERO says "None yet", and an UNLOADED
// count prints nothing at all rather than claiming the tournament has no teams.
function mgHubTeamsChip(t) {
  const n = t ? mgManagedTeamCount(t) : null;
  if (n === null) return '';
  if (n === 0) return 'None yet';
  const clause = mgTeamsClause(t);
  return clause.indexOf(' of ') === -1 ? clause : clause.replace(/ teams?$/, '');
}

// The Tournament row's chip, in the design's words. mgTournamentRowStage returns '' when the pools
// collection belongs to another tournament, and that silence is kept: only a genuinely blocking state
// ("Pools not drawn", "Not open yet") takes the warning ink.
const MGH_STAGE_CHIP = {
  'pools not drawn': ['Pools not drawn', true],
  'pools drawn': ['Pools drawn', false],
  'pool play running': ['Pools live', false],
  'bracket running': ['Bracket live', false],
  finished: ['Finished', false],
};

// One flat Manage row. name + subHTML are emitted RAW — callers pre-escape any user-derived content
// (apostrophes in the fixed/model copy are valid in text content and must survive verbatim for §27).
// chipHTML is the right-hand state chip (mgHubStateChip), '' when there is nothing honest to say.
function mgRowHTML(area, name, subHTML, chipHTML) {
  return `<a class="mg-row${area === 'tournament' ? ' mgh-trow' : ''}" data-mg-area="${area}">
      <div class="mg-rb"><div class="mg-rn">${name}</div><div class="mg-rs">${subHTML}</div></div>
      ${chipHTML || ''}${MG_CHEV}
    </a>`;
}

function buildManagePageHTML() {
  // The hub reports on the tournament Manage is POINTED at, not on the one the resolver would infer. With
  // nothing explicitly picked the two are the same tournament (mgActiveTournament falls back to
  // manageLeadTournament), so this only diverges once the organizer has used the picker.
  const t = mgActiveTournament();
  const needs = manageNeedsYou();
  const setupHead = !!(t && t.status === 'setup' && !t.registration_open);

  const stage = t ? mgTournamentRowStage(t) : '';
  const stageChip = MGH_STAGE_CHIP[stage]
    || (t && t.status === 'setup' && !t.registration_open ? ['Not open yet', true] : null);
  const days = manageUpcomingPickupDays();
  const pickupChip = days.length
    ? (days.length === 1 ? 'Next up ' + mgHubShortDate(days[0].day || days[0].date) : days.length + ' scheduled')
    : 'None yet';
  // Check-in is the day itself: today says Today, a future date names the DAY, and a past or absent date
  // says nothing. The weekday alone ("Opens Sat") reads identically for this Saturday and for one five
  // weeks out, so the chip carries the same short date the Pickup chip does. There is no check-in OPEN
  // time column, so no hour is ever printed.
  const today = mgLocalTodayStr();
  const ed = (t && tournamentHasEventDate() && t.event_date) ? String(t.event_date).slice(0, 10) : '';
  const checkinChip = ed
    ? (ed === today ? 'Today' : (ed > today ? 'Opens ' + mgHubShortDate(ed) : ''))
    : '';
  // The CLUB roster, honestly — Players is not a per-tournament screen.
  const roster = (state.players || []).length;
  // Seats load lazily on opening Admins (the 0051 RPC). null = never loaded → no chip; a waiting seat is a
  // row with no email, so it is not counted as filled.
  const seatsChip = Array.isArray(mgSeats) ? mgSeats.filter((s) => s && s.email).length + ' seats' : '';

  const rows = `<div class="pl-sect mgh-sect">This tournament</div>`
    + mgRowHTML('tournament', 'Tournament', t ? 'Registration, teams, pools, bracket' : 'No tournament yet',
      stageChip ? mgHubStateChip(stageChip[0], stageChip[1]) : '')
    + `<div class="pl-sect mgh-sect">Everything</div>`
    + mgRowHTML('pickup', 'Pickup days', 'Casual games between tournaments', mgHubStateChip(pickupChip))
    + mgRowHTML('checkin', 'Check-in', 'Tap names as people arrive', mgHubStateChip(checkinChip))
    + mgRowHTML('players', 'Players', 'The roster everyone is picked from', mgHubStateChip(roster + ' on file'))
    + mgRowHTML('teams', 'Teams', 'Who is playing with who', mgHubStateChip(mgHubTeamsChip(t)))
    + mgRowHTML('admins', 'Admins', 'Seats &amp; activity log', mgHubStateChip(seatsChip));

  return mgHubScopeHTML(t)
    + (t ? mgHubTrackHTML(t) : '')
    + mgHubActsHTML(t)
    + mgHubLiveStripHTML(t)
    + mgNeedsRowsHTML(needs, setupHead ? 'Before you open' : 'Needs you')
    + rows;
}

// Area placeholders (Task 1): the real Pickup/Players/Teams/Tournament/Admins screens land in Tasks 2-11.
// Each carries a back-to-Manage header (data-mg-area="lead") so a row tap is never a dead end.
const MG_AREA_TITLES = { tournament: 'Tournament', pickup: 'Pickup days', players: 'Players', teams: 'Teams', admins: 'Admins' };
function manageAreaPlaceholderHTML(area) {
  const title = MG_AREA_TITLES[area] || 'Manage';
  return `<div class="pd-pagehdr">
      <button type="button" class="pd-back" data-mg-area="lead" aria-label="Back to Manage"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg></button>
      <div class="pd-htitle">${escapeHTML(title)}</div>
    </div>
    <div class="pd-empty">Coming in the next slices.</div>`;
}

// ── Task 2: Pickup days (session-10 pick R3 hybrid) — multi-day list + form-first edit ──────────────
// Mockups r10-manage/p-h1 (list) + p-h2 (form). Reuses the manage-area chrome (pd-pagehdr/pd-back/
// pd-htitle) + the pl-sect section label + MG_CHEV; the pk-* kit carries the rows/fields/CTAs.
const PK_BACK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg>';
const PK_PLUS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>';

// 'YYYY-MM-DD' → a LOCAL Date (avoids the UTC-parse off-by-one that new Date('YYYY-MM-DD') causes).
function pkLocalDate(dayStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dayStr == null ? '' : dayStr));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
function pkWeekdayTag(dayStr) { // "THU"
  const dt = pkLocalDate(dayStr);
  return dt ? dt.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase() : '';
}
function pkDateLabel(dayStr) { // "July 16"
  const dt = pkLocalDate(dayStr);
  return dt ? dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : '';
}
function pkFormTitle(dayStr) { // "Thursday, July 16"
  const dt = pkLocalDate(dayStr);
  return dt ? dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : 'Pickup day';
}

// The Pickup days LIST (mockup p-h1). Renders the loaded pickup_days rows (NOT the legacy fallback —
// that only drives gating; pre-0046 this list is honestly empty). Upcoming (>= today) only, soonest-first,
// NEXT UP live-ink tag on the soonest, dashed Add. Each row deep-links into its form via data-pk-day.
function buildPickupDaysHTML() {
  const rows = (Array.isArray(state.pickupDays) ? state.pickupDays.slice() : [])
    .filter((d) => d && sessionIsUpcoming(d.day))
    .sort((a, b) => String(a.day).localeCompare(String(b.day)));
  const header = `<div class="pd-pagehdr">
      <button type="button" class="pd-back" data-mg-area="lead" aria-label="Back to Manage">${PK_BACK_SVG}</button>
      <div class="pd-htitle">Pickup days</div>
    </div>`;
  const body = rows.length
    ? `<div class="pl-sect">Scheduled</div>`
      + rows.map((d, i) => {
        const timeTail = d.time_label ? ' · ' + escapeHTML(String(d.time_label)) : '';
        const loc = d.location ? escapeHTML(String(d.location)) : 'Location TBD';
        const nextUp = i === 0 ? `<span class="pk-next">NEXT UP</span>` : '';
        return `<a class="pk-row" data-pk-day="${escapeHTML(String(d.id || ''))}">
          <span class="pk-wk">${pkWeekdayTag(d.day)}</span>
          <div class="pk-dn"><div class="pk-dt">${escapeHTML(pkDateLabel(d.day))}${timeTail}</div><div class="pk-ds">${loc}</div></div>
          ${nextUp}
        </a>`;
      }).join('')
    : `<div class="pd-empty">No pickup days scheduled. Add one to open Check In.</div>`;
  const add = `<button type="button" class="pk-add" data-pk-add>${PK_PLUS_SVG}Add a pickup day</button>
    <div class="pk-note">Each day opens its own Check In when it arrives</div>`;
  return header + body + add;
}

// The Pickup day FORM (mockup p-h2). DATE/TIME/LOCATION hairline-underline fields + Save + the note.
// For an EXISTING day it also shows the ON THE DAY rows (Share the check-in QR · Start a fresh sheet)
// and the red Remove; a NEW (unsaved) day shows just the fields (those day-of actions are meaningless yet).
function buildPickupDayFormHTML() {
  const editing = pickupEditId
    ? (state.pickupDays || []).find((d) => d && String(d.id) === String(pickupEditId))
    : null;
  const day = editing || {};
  const titleText = editing && editing.day ? pkFormTitle(editing.day) : 'New pickup day';
  const header = `<div class="pd-pagehdr">
      <button type="button" class="pd-back" data-mg-area="pickup" aria-label="Back to pickup days">${PK_BACK_SVG}</button>
      <div class="pd-htitle">${escapeHTML(titleText)}</div>
    </div>`;
  const fields = `
    <div class="pk-fld"><label class="pk-fl" for="pk-date">Date</label>
      <input class="pk-fv" id="pk-date" type="date" value="${escapeHTML(String(day.day || ''))}" /></div>
    <div class="pk-fld"><label class="pk-fl" for="pk-time">Time</label>
      <input class="pk-fv" id="pk-time" type="text" placeholder="7:00 PM" autocomplete="off" value="${escapeHTML(String(day.time_label || ''))}" /></div>
    <div class="pk-fld"><label class="pk-fl" for="pk-location">Location</label>
      <input class="pk-fv" id="pk-location" type="text" placeholder="Cherry Creek courts" autocomplete="off" value="${escapeHTML(String(day.location || ''))}" /></div>
    <button type="button" class="pk-cta" data-pk-save>Save</button>
    <div class="pk-savenote">The Check In tab appears for everyone that day</div>
    <p class="pk-msg" id="pk-msg" role="status" aria-live="polite"></p>`;
  const onDay = editing ? `<div class="pl-sect">On the day</div>
    <a class="pk-orow" data-pk-qr><div class="pk-ob"><div class="pk-on">Share the check-in QR</div><div class="pk-os">For the door. Players scan and tap their name</div></div>${MG_CHEV}</a>
    <a class="pk-orow" data-pk-fresh><div class="pk-ob"><div class="pk-on">Start a fresh sheet</div><div class="pk-os">Rolls check-ins into history and starts clean</div></div>${MG_CHEV}</a>` : '';
  const remove = editing
    ? `<button type="button" class="pk-danger" data-pk-remove="${escapeHTML(String(editing.id))}">Remove this pickup day</button>`
    : '';
  return header + fields + onDay + remove;
}

// The Manage panel content dispatches on manageView (lead / pickup list / pickup form / an area page).
// Used by renderPublicShell, the partialRender 'manage' branch, and the data-mg-area container-swap —
// one source, no full render().
function manageContainerHTML() {
  if (manageView === 'lead') return buildManagePageHTML();
  if (manageView === 'pickup') return buildPickupDaysHTML();
  if (manageView === 'pickup-form') return buildPickupDayFormHTML();
  if (manageView === 'checkin') return buildManageCheckinHTML();
  if (manageView === 'players') return buildManagePlayersHTML();
  if (manageView === 'teams') return buildManageTeamsHTML();
  if (manageView === 'tournament') return buildManageTournamentContainerHTML();
  // (Round 2026-08-25: the plural 'tournaments' chooser screen retired with the switcher card — the choice
  // is the hub title's inline picker now, so there is no screen to route to.)
  if (manageView === 'tournament-new') return buildMgTournamentNewHTML();
  if (manageView === 'admins') return buildMgAdminsHTML();
  return manageAreaPlaceholderHTML(manageView);
}

// Swap just the Manage container (partial repaint; module vars survive — NO full render()).
function repaintManage() {
  const c = document.querySelector('#tab-manage .container');
  if (c) c.innerHTML = manageContainerHTML();
}

// Task 11 (pick R6): lazily load the admin SEATS when the Admins area opens (mockup m-c). Not part of the
// boot sync — seats change rarely, so loading them on open keeps boot lean. Honest states: loading line →
// list → friendly error (isFnMissingError → "still updating"). Only repaints while the Admins area is open.
async function loadAdminSeats() {
  mgSeatsLoading = true; mgSeatsError = '';
  if (manageView === 'admins') repaintManage();
  try {
    mgSeats = await tdbListAdminSeats();
  } catch (err) {
    mgSeatsError = (err && err.message) ? err.message : 'Could not load the admin seats.';
  } finally {
    mgSeatsLoading = false;
    if (manageView === 'admins') repaintManage();
  }
}
// Lazily load the ACTIVITY LOG when the log sub-view opens (mockup m-b, day-grouped rows).
async function loadActionLog() {
  mgLogLoading = true; mgLogError = '';
  if (manageView === 'admins') repaintManage();
  try {
    mgLog = await tdbReadActionLog(50);
  } catch (err) {
    mgLogError = (err && err.message) ? err.message : 'Could not load the activity log.';
  } finally {
    mgLogLoading = false;
    if (manageView === 'admins') repaintManage();
  }
}

// ── Task 11 (session-10 pick R6): Manage → Admins — 4-seat roster + activity log ──────────────────────
// Mockups r10-manage/m-c (seats) + m-b (log). Top-level Manage area (manageView==='admins', NOT a
// tournament sub-view). buildMgAdminsHTML dispatches on mgAdminsView: 'seats' | 'log'. Owner-gating keys on
// state.masterAdminAuthenticated (the owner-role server session): only the owner can assign a waiting seat
// or remove a filled non-owner seat. Flat on stone, no pd-card, labeled pills never dots, plain English.
function buildMgAdminsHTML() {
  return mgAdminsView === 'log' ? buildMgLogHTML() : buildMgSeatsHTML();
}

// Role pill (mockup m-c): OWNER filled accent · ADMIN outline · OFF faint outline. A labeled tag, never a dot.
function mgSeatPill(kind) {
  if (kind === 'owner') return '<span class="mgad-pill ow">OWNER</span>';
  if (kind === 'admin') return '<span class="mgad-pill ad">ADMIN</span>';
  return '<span class="mgad-pill off">OFF</span>';
}

const MGAD_TOTAL_SEATS = 4; // the 4-admin model (spec §1): 1 owner + up to 3 organizers.

function buildMgSeatsHTML() {
  const isOwner = !!state.masterAdminAuthenticated;
  const header = `<div class="pd-pagehdr">
      <button type="button" class="pd-back" data-mg-area="lead" aria-label="Back to Manage">${PK_BACK_SVG}</button>
      <div class="pd-htitle">Admins</div>
    </div>`;
  // Not loaded yet — honest loading line, no fake seats (mgSeats===null only before the first RPC returns).
  if (mgSeats === null) {
    const line = mgSeatsError ? escapeHTML(mgSeatsError) : 'Loading the admin seats…';
    return header + `<div class="pd-empty">${line}</div>`;
  }
  // Owner first, then organizers (the RPC already orders this way; re-assert defensively for a clean UI).
  const seats = (Array.isArray(mgSeats) ? mgSeats.slice() : [])
    .sort((a, b) => (b && b.role === 'owner' ? 1 : 0) - (a && a.role === 'owner' ? 1 : 0));
  let firstEmptyDone = false;
  const rows = [];
  for (let i = 0; i < MGAD_TOTAL_SEATS; i++) {
    const s = seats[i];
    if (s) {
      const owner = s.role === 'owner';
      const name = escapeHTML(s.display_name || s.email || 'Admin');
      const email = escapeHTML(s.email || '');
      // The owner row is NEVER editable. A filled non-owner seat is a remove target — for the owner only.
      const rm = (!owner && isOwner) ? ` data-mgad-remove="${escapeHTMLText(String(s.email || ''))}"` : '';
      rows.push(`<a class="mgad-row"${rm}><div class="mgad-rb"><div class="mgad-rn">${name}</div>`
        + `<div class="mgad-rs">${email}</div></div>${mgSeatPill(owner ? 'owner' : 'admin')}</a>`);
    } else {
      // A WAITING (empty) seat. The FIRST empty seat carries the explainer; the rest just say "Waiting".
      // Owner taps it → the inline assign-by-email field.
      const seatTap = isOwner ? ' data-mgad-seat' : '';
      const sub = firstEmptyDone ? 'Waiting' : 'Waiting. They create an account, you flip it on';
      firstEmptyDone = true;
      rows.push(`<a class="mgad-row"${seatTap}><div class="mgad-rb"><div class="mgad-rn">Seat ${i + 1}</div>`
        + `<div class="mgad-rs">${sub}</div></div>${mgSeatPill('off')}</a>`);
    }
  }
  // The inline assign-by-email form (owner only), toggled by tapping a waiting seat. rf-* field grammar.
  const assign = (isOwner && mgAssignOpen)
    ? `<div class="mgad-assign">`
      + `<label class="pk-fl" for="mgad-email">Their account email</label>`
      + `<input class="pk-fv" id="mgad-email" type="email" inputmode="email" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="name@email.com" />`
      + `<button type="button" class="mgr-cta" data-mgad-make>Make them an admin</button>`
      + `<p class="mgad-msg" id="mgad-msg" role="status" aria-live="polite"></p>`
      + `<div class="mgr-fnote">They must have created an account first. This flips their access on.</div>`
      + `</div>`
    : '';
  // The Activity log row → the log sub-view (NO undo this slice).
  const logRow = `<a class="mgad-row mgad-logrow" data-mgad-log><div class="mgad-rb">`
    + `<div class="mgad-rn">Activity log</div><div class="mgad-rs">Every admin action · who and when</div></div>${MG_CHEV}</a>`;
  // Organizers see the roster read-only.
  const note = isOwner ? '' : `<div class="mgr-fnote">Only the owner can add or remove admins.</div>`;
  return header + rows.join('') + assign + logRow + note;
}

// Day label for the log group headers (mockup m-b): Today / Yesterday / weekday / "Month D". Groups by the
// LOCAL calendar day of the row's timestamp.
function mgLogDayLabel(d) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((today.getTime() - that.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff > 1 && diff < 7) return that.toLocaleDateString('en-US', { weekday: 'long' });
  return that.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}
function mgLogTime(d) { return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }

function buildMgLogHTML() {
  const header = `<div class="pd-pagehdr">
      <button type="button" class="pd-back" data-mgad-seats aria-label="Back to Admins">${PK_BACK_SVG}</button>
      <div class="pd-htitle">Activity log</div>
    </div>`;
  if (mgLog === null) {
    const line = mgLogError ? escapeHTML(mgLogError) : 'Loading the activity log…';
    return header + `<div class="pd-empty">${line}</div>`;
  }
  const rows = Array.isArray(mgLog) ? mgLog : [];
  if (!rows.length) return header + `<div class="pd-empty">Nothing logged yet.</div>`;
  let out = ''; let lastDay = null;
  rows.forEach((r) => {
    const actor = escapeHTML((r && r.actor) || 'Someone');
    const summary = escapeHTML((r && r.summary) || '');
    const dt = r && r.at ? new Date(r.at) : null;
    const valid = dt && !isNaN(dt.getTime());
    if (valid) {
      const day = mgLogDayLabel(dt);
      if (day !== lastDay) { out += `<div class="mgad-day">${escapeHTML(day)}</div>`; lastDay = day; }
    }
    const time = valid ? escapeHTML(mgLogTime(dt)) : '';
    out += `<div class="mgad-lg"><span class="mgad-lt">${time}</span>`
      + `<span class="mgad-lx"><b>${actor}</b> ${summary}</span></div>`;
  });
  return header + out;
}

// Make-them-an-admin (owner only): set_member_role(email,'organizer'), then refresh the seats.
async function mgAdminMakeOrganizer() {
  if (!state.masterAdminAuthenticated) return; // owner-only
  const el = document.getElementById('mgad-email');
  const msg = document.getElementById('mgad-msg');
  const email = el ? String(el.value || '').trim() : '';
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    if (msg) msg.textContent = 'Enter their account email first.'; return;
  }
  if (msg) msg.textContent = 'Adding…';
  try {
    await tdbSetMemberRole(email, 'organizer');
    mgAssignOpen = false;
    await loadAdminSeats(); // repaints the seats with the new admin
  } catch (err) {
    if (msg) msg.textContent = (err && err.message) ? err.message : 'Could not add them. Check the email and try again.';
  }
}

// The quiet body-level Remove-admin sheet (owner only). Body-level = outside #tab-manage → poll-clobber-immune.
function closeMgAdminSheet() { const el = document.getElementById('mgad-sheet'); if (el) el.remove(); }
function openMgRemoveAdminSheet(email) {
  if (!state.masterAdminAuthenticated || !email) return;
  closeMgAdminSheet();
  const seat = (Array.isArray(mgSeats) ? mgSeats : []).find((s) => s && String(s.email) === String(email));
  const name = seat ? (seat.display_name || seat.email || 'this admin') : 'this admin';
  const scrim = document.createElement('div');
  scrim.id = 'mgad-sheet';
  scrim.className = 'pd-reg-scrim';
  scrim.setAttribute('role', 'dialog');
  scrim.setAttribute('aria-modal', 'true');
  scrim.setAttribute('aria-label', 'Remove admin');
  scrim.innerHTML = `<div class="pd-reg-sheet">`
    + `<div class="mgts-head"><div class="mgts-eyebrow">Admin</div>`
    + `<button type="button" class="mgts-done" data-mgad="close">Done</button></div>`
    + `<div class="mgad-shn">${escapeHTML(name)}</div>`
    + `<div class="mgad-she">${escapeHTML(seat ? (seat.email || '') : '')}</div>`
    + `<button type="button" class="pk-danger" data-mgad="remove">Remove admin</button>`
    + `<div class="mgr-fnote">They keep their account. This just turns off their admin access.</div>`
    + `</div>`;
  document.body.appendChild(scrim);
  scrim.addEventListener('click', (ev) => {
    if (ev.target === scrim) { closeMgAdminSheet(); return; } // backdrop tap dismisses
    const r = ev.target.closest('[data-mgad]');
    if (!r) return;
    const role = r.getAttribute('data-mgad');
    if (role === 'close') { closeMgAdminSheet(); return; }
    if (role === 'remove') { void mgAdminRemove(email); return; }
  });
}
async function mgAdminRemove(email) {
  if (!state.masterAdminAuthenticated || !email) return;
  try { await tdbSetMemberRole(email, 'player'); }
  catch (err) { console.warn('mgAdminRemove', err); }
  closeMgAdminSheet();
  await loadAdminSeats();
}

// Persist the pickup-day form (insert a new row or update the edited one), then return to the list.
async function savePickupDay() {
  const dateEl = document.getElementById('pk-date');
  const timeEl = document.getElementById('pk-time');
  const locEl = document.getElementById('pk-location');
  const msgEl = document.getElementById('pk-msg');
  const day = dateEl ? String(dateEl.value || '').trim() : '';
  const time_label = timeEl ? String(timeEl.value || '').trim() : '';
  const location = locEl ? String(locEl.value || '').trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) { if (msgEl) msgEl.textContent = 'Pick a date first.'; return; }
  if (!supabaseClient) { if (msgEl) msgEl.textContent = 'No connection. Try again in a moment.'; return; }
  const payload = { day, time_label: time_label || null, location: location || null };
  try {
    const q = pickupEditId
      ? supabaseClient.from('pickup_days').update(payload).eq('id', pickupEditId)
      : supabaseClient.from('pickup_days').insert(payload);
    const { error } = await q;
    if (error) throw error;
    await loadPickupDays();
    pickupEditId = null;
    manageView = 'pickup';
    repaintManage();
  } catch (err) {
    console.warn('savePickupDay error', err);
    if (msgEl) msgEl.textContent = 'Could not save. Check the connection and try again.';
  }
}

// Remove a pickup day (its date stops opening Check In). Confirm first (destructive).
async function removePickupDay(id) {
  if (!id) return;
  const ok = await appConfirm({
    title: 'Remove this pickup day?',
    message: 'Its date will no longer open the Check In tab.',
    confirmText: 'Remove',
    danger: true
  });
  if (!ok) return;
  if (supabaseClient) {
    try {
      const { error } = await supabaseClient.from('pickup_days').delete().eq('id', id);
      if (error) throw error;
    } catch (err) { console.warn('removePickupDay error', err); }
  }
  await loadPickupDays();
  pickupEditId = null;
  manageView = 'pickup';
  repaintManage();
}

// ── Task 3: Players directory (session-10 pick R4-B) — one A–Z directory ─────────────────────────────
// Mockup r10-manage/l-b. Reuses the manage-area chrome (pd-pagehdr/pd-back/pd-htitle) + MG_CHEV; the mgp-*
// kit carries the search box, meta line, A–Z rows, IN tag, admin-only skill and the Select(bulk) bar. The
// inline group manager that used to hang off the meta left on 2026-08-29 with groups themselves (Mike:
// DELETE GROUPS EVERYWHERE). Tap a row → the EXISTING openPlayerEditPopup (body-level modal,
// poll-clobber-immune). Skill is
// ADMIN-ONLY data (never on a public surface). NO initials bubbles anywhere.
const MGP_SEARCH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>';
const MGP_CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

// Admin skill glyph: a positive rating renders one-decimal; unrated (0/blank) is a faint en-dash, never "0.0".
function mgpSkillText(skill) {
  const n = Number(skill);
  return (Number.isFinite(n) && n > 0) ? n.toFixed(1) : '–';
}

// The players currently selected in Select mode, resolved from mgSelected (identity keys) to live rows.
function mgSelectedPlayers() {
  return (state.players || []).filter((p) => mgSelected.has(playerIdentityKey(p)));
}

// The A–Z list body (id="mgp-list"): filtered by the live query, sorted, letter-anchored. A search MISS
// (query set, zero rows) shows the dashed "Add <typed> as a new player" row. Re-rendered on its own on every
// keystroke (the search input above it is never touched — no focus/caret loss). The IN tag is a LABEL, never
// a dot; skill is right-aligned accent; no initials bubbles.
function buildMgpListHTML() {
  const q = String(mgPlayerQuery || '').trim();
  const qLower = q.toLowerCase();
  const inSet = new Set(state.checkedIn || []);
  let list = (state.players || []).filter((p) => p && p.name);
  if (qLower) list = list.filter((p) => String(p.name).toLowerCase().includes(qLower));
  list = list.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' }));

  if (!list.length) {
    if (q) {
      return `<button type="button" class="mgp-add" data-mgp-add="${escapeHTMLText(q)}">`
        + `${PK_PLUS_SVG}Add &ldquo;${escapeHTML(q)}&rdquo; as a new player</button>`;
    }
    return `<div class="mgp-empty">No players on the roster yet.</div>`;
  }

  let lastLetter = '';
  return list.map((p) => {
    const key = playerIdentityKey(p);
    const nm = String(p.name);
    const first = (nm.trim()[0] || '').toUpperCase();
    const letter = /[A-Z]/.test(first) ? first : '#';
    const anchor = letter !== lastLetter ? letter : '';
    lastLetter = letter;
    const inHTML = inSet.has(key) ? `<span class="mgp-in">IN</span>` : '';
    const skPos = Number(p.skill) > 0;
    const skHTML = `<span class="mgp-sk${skPos ? '' : ' n'}">${mgpSkillText(p.skill)}</span>`;
    const cb = mgSelectMode ? `<span class="mgp-cb">${MGP_CHECK_SVG}</span>` : '';
    const on = (mgSelectMode && mgSelected.has(key)) ? ' on' : '';
    const nameHTML = qLower ? highlightMatch(nm, q) : escapeHTML(nm);
    return `<a class="mgp-row${on}" data-mgp-id="${escapeHTMLText(key)}">`
      + `${cb}<span class="mgp-al">${anchor}</span>`
      + `<span class="mgp-pn">${nameHTML}</span>`
      + `${inHTML}${skHTML}</a>`;
  }).join('');
}

// The Players directory view (mockup l-b): header + Select toggle, search box, a two-count meta line, the
// A–Z list, and (in Select mode) the bottom action bar.
function buildManagePlayersHTML() {
  const roster = (state.players || []).length;
  const inNow = (state.checkedIn || []).length;

  const header = `<div class="pd-pagehdr">`
    + `<button type="button" class="pd-back" data-mg-area="lead" aria-label="Back to Manage">${PK_BACK_SVG}</button>`
    + `<div class="pd-htitle">Players</div>`
    + `<button type="button" class="mgp-selbtn" data-mgp-select>${mgSelectMode ? 'Cancel' : 'Select'}</button>`
    + `</div>`;

  const search = `<div class="mgp-srch">${MGP_SEARCH_SVG}`
    + `<input id="mg-player-search" type="text" placeholder="Search or add a player" value="${escapeHTMLText(mgPlayerQuery)}" `
    + `autocomplete="off" autocapitalize="words" spellcheck="false" aria-label="Search players" /></div>`;

  const meta = `<div class="mgp-meta">`
    + `<span class="mgp-m"><b>${roster}</b> ${roster === 1 ? 'player' : 'players'}</span>`
    + `<span class="mgp-m"><b>${inNow}</b> checked in</span>`
    + `</div>`;

  const listSection = `<div id="mgp-list">${buildMgpListHTML()}</div>`;

  // Select-mode bottom bar (fixed above the nav). Three actions since the 2026-08-29 groups round: the
  // fourth was "Move to group", which left with the chip row it opened.
  let bar = '';
  if (mgSelectMode) {
    bar = `<div class="mgp-bar">`
      + `<button type="button" class="pri" data-mgp-bulk="in">Check in</button>`
      + `<button type="button" data-mgp-bulk="out">Check out</button>`
      + `<button type="button" class="mut" data-mgp-bulk="cancel">Cancel</button>`
      + `</div>`;
  }

  return header + search + meta + listSection + bar;
}

// Manage -> Check-in (2026-07-19 spec, Mike-approved d73f26e): tap a name to toggle attendance,
// All/In/Out chips, UNDO strip, search + add-and-check-in. NO day gate — works whether or not a
// pickup day exists. Rows reuse the ckx kiosk kit; writes reuse the kiosk RPC+outbox path (C21).
// Skill renders here for admins (Mike, 2026-07-19); public surfaces stay skill-free (§AS-1).
function mgckRows() {
  const inSet = new Set(state.checkedIn || []);
  return (state.players || []).map((p) => ({
    key: playerIdentityKey(p),
    id: p.id,
    name: p.name,
    skill: p.skill,
    checkedIn: inSet.has(playerIdentityKey(p)),
  }));
}

function mgckMetaHTML(model) {
  return `<span class="mgck-m"><b>${model.counts.in}</b> checked in</span>`
    + `<span class="mgck-m"><b>${model.counts.total}</b> ${model.counts.total === 1 ? 'player' : 'players'}</span>`;
}

function mgckStripHTML() {
  if (!mgckLast) return '';
  const verb = mgckLast.dir === 'in' ? 'checked in' : 'checked out';
  return `<span class="mgck-st">${escapeHTML(mgckLast.name)} ${verb}</span>`
    + `<button type="button" data-mgck-undo>UNDO</button>`;
}

function mgckListHTML(model) {
  if (!state.loaded) return '<div class="mgck-empty">Loading roster&hellip;</div>';
  if (!model.counts.total && !(mgckQ || '').trim()) {
    return '<div class="mgck-empty">No players on the roster yet.</div>';
  }
  const row = (r) => {
    const tag = r.checkedIn ? 'IN' : 'CHECK IN';
    const n = Number(r && r.skill);
    const skPos = Number.isFinite(n) && n > 0;
    // Round 2026-08-29: the pencil sits between the name and the rating and opens the app's own player
    // card over the list. It carries the identity key so the delegate and the focus-return never have to
    // walk the DOM.
    //
    // KNOWN LIMITATION, ledgered rather than solved (review round 1). A span is used because the row is a
    // <button> and a nested button is invalid HTML (README:120-123), but the span does NOT settle the
    // question, it only avoids the parse error:
    //   - button's content model forbids a descendant with tabindex just as it forbids a nested button,
    //     so tabindex="0" in here is non-conforming too. Nothing breaks in the parser.
    //   - role="button" is "children presentational", so a screen reader flattens everything inside
    //     .ckx-row: the pencil is not reachable as its own control and its aria-label folds into the ROW
    //     button's accessible name ("Blake Harmon Edit Blake Harmon 6.0 CHECK IN").
    // Sighted keyboard reach is unaffected: tabindex is honoured inside a button, Tab lands on the pencil,
    // and a span has no activation behaviour so Enter/Space fire only the delegate in app.js, once.
    // The real fix is the handoff's own (README:120-122): make the row a container with two SIBLING
    // buttons, the row body and the edit, keeping the 34x34 hit box. That is a row-shape change across
    // every .ckx-row surface, so it belongs to the Manage CSS/row round, not to this string builder.
    const pencil = `<span class="mgck-edit" role="button" tabindex="0" data-mgck-edit="${escapeHTMLText(r.key)}"`
      + ` aria-label="Edit ${escapeHTMLText(r.name)}">`
      + `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">`
      + `<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></span>`;
    return `<button class="ckx-row${r.checkedIn ? ' is-in' : ''}" type="button" data-mgck-id="${escapeHTMLText(r.key)}">`
      + `<span class="ckx-nm">${highlightMatch(r.name, mgckQ)}</span>`
      + pencil
      + `<span class="mgck-sk${skPos ? '' : ' n'}">${mgpSkillText(r.skill)}</span>`
      + `<span class="ckx-go">${tag}</span></button>`;
  };
  const emptyLine = (id) => id === 'in'
    ? '<div class="mgck-empty">Nobody is checked in yet.</div>'
    : '<div class="mgck-empty">Everyone is in.</div>';
  const sect = (s) => {
    const head = s.label ? `<div class="mgck-sect">${s.label} &middot; ${s.id === 'in' ? model.counts.in : model.counts.out}</div>` : '';
    const body = s.rows.length ? s.rows.map(row).join('')
      : ((mgckQ || '').trim() ? '' : emptyLine(s.id));
    return head + body;
  };
  const add = (model.showAdd && state.loaded)
    ? `<button type="button" class="mgp-add" data-mgck-add="${escapeHTMLText((mgckQ || '').trim())}">`
      + `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`
      + `Add &ldquo;${escapeHTML((mgckQ || '').trim())}&rdquo; to the roster</button>`
      + `<p class="mgck-msg" id="mgck-msg" role="status" aria-live="polite"></p>`
    : '';
  return model.sections.map(sect).join('') + add;
}

function buildManageCheckinHTML() {
  const model = checkinConsoleModel(mgckRows(), mgckFilter, mgckQ);
  const chip = (val, label) =>
    `<button type="button" class="pl-tab${mgckFilter === val ? ' pl-on' : ''}" data-mgck-filter="${val}"${mgckFilter === val ? ' aria-current="true"' : ''}>${label}</button>`;
  return `<div class="pd-pagehdr">
      <button type="button" class="pd-back" data-mg-area="lead" aria-label="Back to Manage">${PK_BACK_SVG}</button>
      <div class="pd-htitle">Check-in</div>
    </div>
    <div class="mgck-meta" id="mgck-meta">${mgckMetaHTML(model)}</div>
    <div class="pl-tabs">${chip('all', 'All')}${chip('in', 'In')}${chip('out', 'Out')}</div>
    <div class="cik-search mgck-srch">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
      <input id="mgck-search" type="text" placeholder="Search the roster" autocapitalize="words" autocomplete="off" spellcheck="false" aria-label="Search the roster" value="${escapeHTMLText(mgckQ)}" />
    </div>
    <div class="mgck-strip" id="mgck-strip"${mgckLast ? '' : ' hidden'}>${mgckStripHTML()}</div>
    <div id="mgck-list">${mgckListHTML(model)}</div>`;
}

// Targeted swaps only (list/meta/strip) with scroll preservation — a toggle mid-scroll must not
// jump the list (F6 pattern). Falls back to a full Manage container swap if the page is not mounted.
function mgckRepaint() {
  const listEl = document.getElementById('mgck-list');
  if (!listEl || manageView !== 'checkin') { repaintManage(); return; }
  const panel = document.getElementById('tab-manage');
  const saved = panel ? panel.scrollTop : 0;
  const model = checkinConsoleModel(mgckRows(), mgckFilter, mgckQ);
  listEl.innerHTML = mgckListHTML(model);
  const metaEl = document.getElementById('mgck-meta');
  if (metaEl) metaEl.innerHTML = mgckMetaHTML(model);
  const stripEl = document.getElementById('mgck-strip');
  if (stripEl) { stripEl.innerHTML = mgckStripHTML(); stripEl.hidden = !mgckLast; }
  if (panel) panel.scrollTop = saved;
}

// The kiosk's optimistic + RPC + outbox contract, addressed by identity key (C21 single-source).
function mgckToggleByKey(key, dir, opts) {
  const player = (state.players || []).find((p) => playerIdentityKey(p) === key);
  if (!player) return;
  if (dir === 'in') {
    if (checkInPlayer(player) && supabaseClient && player.id) {
      (async () => {
        try {
          const { error } = await supabaseClient.rpc('check_in', { p_id: player.id });
          if (error) throw error;
          queueSupabaseRefresh();
        } catch (err) {
          console.error('mgck check_in error', err);
          outboxEnqueue({ key: 'att:' + player.id, kind: 'check_in', payload: { p_id: player.id }, ts: Date.now() });
        }
      })();
    }
  } else {
    if (checkOutPlayer(player) && supabaseClient && player.id) {
      (async () => {
        try {
          const { error } = await supabaseClient.rpc('check_out', { p_id: player.id });
          if (error) throw error;
          queueSupabaseRefresh();
        } catch (err) {
          console.error('mgck check_out error', err);
          outboxEnqueue({ key: 'att:' + player.id, kind: 'check_out', payload: { p_id: player.id }, ts: Date.now() });
        }
      })();
    }
  }
  mgckLast = (opts && opts.silent) ? null : { key, name: player.name, dir };
  saveLocal();
  mgckRepaint();
}

function mgckToggleRow(key) {
  const inSet = new Set(state.checkedIn || []);
  mgckToggleByKey(key, inSet.has(key) ? 'out' : 'in');
}

// Add-and-check-in: the kiosk Wave-1d atomic register path, admin voice. Mirrors app.js:10424-10503.
async function mgckAddAndCheckIn(name) {
  const msg = (t) => { const el = document.getElementById('mgck-msg'); if (el) el.textContent = t; };
  const trimmed = String(name || '').trim();
  if (!trimmed) return;
  if (!state.loaded) { msg('Still loading. One second, then tap again.'); return; }
  if (!isValidFullName(trimmed)) { msg('Enter a first and last name'); return; }
  const exists = state.players.find((p) => normalize(p.name) === normalize(trimmed));
  if (exists) { mgckToggleByKey(playerIdentityKey(exists), 'in'); return; }
  const inserted = { name: trimmed, skill: 0.0, pending: true };
  state.players = [...state.players, inserted];
  checkInPlayer(inserted);
  mgckLast = { key: playerIdentityKey(inserted), name: trimmed, dir: 'in' };
  mgckQ = '';
  const searchEl = document.getElementById('mgck-search');
  if (searchEl) searchEl.value = '';
  saveLocal();
  mgckRepaint();
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient.rpc('register_player', { p_name: trimmed, p_checked_in: true });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (row && row.id) inserted.id = row.id;
      if (inserted.id) inserted.pending = false;
      queueSupabaseRefresh();
    } catch (err) {
      console.error('mgck register error', err);
      inserted.pending = true;
      outboxEnqueue({ key: 'reg:' + normalize(trimmed), kind: 'register', payload: { name: trimmed, checked_in: true }, ts: Date.now() });
    }
    saveLocal();
    mgckRepaint();
  }
}

// Bulk check-in / check-out over the Select-mode selection. Optimistic locally, then the per-id
// check_in/check_out SECURITY DEFINER RPC loop (the ONLY writer that maintains the check_ins history table —
// same contract as the kiosk + the old bulk bar). Check-OUT confirms first (the 44→0 footgun class).
async function mgpBulkAttendance(shouldCheckIn) {
  const targets = mgSelectedPlayers();
  if (!targets.length) return;
  if (!shouldCheckIn) {
    const ok = await appConfirm({
      title: `Check out ${targets.length} player${targets.length === 1 ? '' : 's'}?`,
      message: 'They drop off the checked-in list.',
      confirmText: 'Check out',
      danger: true
    });
    if (!ok) return;
  }
  const remoteIds = [];
  targets.forEach((p) => {
    if (shouldCheckIn) checkInPlayer(p); else checkOutPlayer(p);
    if (p.id) remoteIds.push(p.id);
  });
  saveLocal();
  mgSelectMode = false; mgSelected = new Set();
  repaintManage();
  if (supabaseClient && remoteIds.length) {
    try {
      for (const id of remoteIds) {
        const { error } = await supabaseClient.rpc(shouldCheckIn ? 'check_in' : 'check_out', { p_id: id });
        if (error) throw error;
      }
      queueSupabaseRefresh();
    } catch (err) {
      console.error(shouldCheckIn ? 'mgp bulk check-in error' : 'mgp bulk check-out error', err);
      await reconcileToSupabaseAuthority(shouldCheckIn ? 'mgp-bulk-check-in' : 'mgp-bulk-check-out');
    }
  }
}

// Add a brand-new player from the search-miss dashed row: a first+last name is required (mix-up prevention),
// duplicates are ignored, then the row is inserted (optimistic + Supabase) and the edit sheet opens to set
// skill. Mirrors the admin add insert (name + skill 0).
async function mgpAddPlayer(rawName) {
  const name = String(rawName || '').trim();
  if (!name) return;
  if (!isValidFullName(name)) { appNotice({ title: 'Add a player', message: 'Enter a first and last name.' }); return; }
  const existing = (state.players || []).find((p) => normalize(p.name) === normalize(name));
  if (existing) { mgPlayerQuery = ''; repaintManage(); openPlayerEditPopup(playerIdentityKey(existing)); return; }
  const inserted = { name, skill: 0, pending: true };
  state.players = [...(state.players || []), inserted];
  saveLocal();
  mgPlayerQuery = '';
  repaintManage();
  if (supabaseClient) {
    try {
      const insertRow = { name, skill: 0 };
      const { data, error } = await supabaseClient.from('players').insert([insertRow]).select();
      if (error) throw error;
      if (Array.isArray(data) && data[0]) { inserted.id = data[0].id; inserted.pending = false; }
      queueSupabaseRefresh();
      repaintManage();
    } catch (err) {
      console.error('mgp add player error', err);
      await reconcileToSupabaseAuthority('mgp-add-player');
    }
  } else {
    inserted.pending = false;
  }
  const live = (state.players || []).find((p) => normalize(p.name) === normalize(name));
  if (live) openPlayerEditPopup(playerIdentityKey(live));
}

// ── Task 4: Teams page (session-10 pick R5 TRIMMED) — chips + generate + stacked teams ───────────────
// Mockup r10-manage/k-h1. Reuses the manage-area chrome (pd-pagehdr/pd-back/pd-htitle) + pl-sect labels +
// the pl-tab chip grammar; the mgt-* kit carries the CTA / stacked team rows. MAKE TEAMS ·
// N CHECKED IN (size chips 2/3/4/6, 4s default) → Generate balanced teams (reuses generateBalancedGroups) →
// TODAY'S TEAMS (TEAM n label + names STACKED one per line, faint hairlines) — READ-ONLY as of 2026-08-07
// (Mike: "remove all ways to switch players"): no drag, no tap-to-swap sheet, no hooks on a name. Generate
// is the only control that changes the board. The casual live-courts board is CUT (Mike): no net cards, no
// report/clear result, skills change by admin edit only. Persistence rides saveLocal → queueLiveStateSave.
function buildManageTeamsHTML() {
  const inNow = (state.checkedIn || []).length;
  const teams = Array.isArray(state.generatedTeams) ? state.generatedTeams : [];

  const header = `<div class="pd-pagehdr">`
    + `<button type="button" class="pd-back" data-mg-area="lead" aria-label="Back to Manage">${PK_BACK_SVG}</button>`
    + `<div class="pd-htitle">Teams</div></div>`;

  // MAKE TEAMS — size chips (pl-tab grammar; 4s default) + the Generate CTA. Chip just SELECTS the size;
  // the CTA generates from the checked-in players.
  const chips = `<div class="pl-tabs mgt-chips">`
    + [2, 3, 4, 6].map((s) => `<button type="button" class="pl-tab${s === mgtSize ? ' pl-on' : ''}" data-mgt-size="${s}">${s}s</button>`).join('')
    + `</div>`;
  const makeSect = `<div class="pl-sect">Make teams · ${inNow} checked in</div>`
    + chips
    + `<button type="button" class="mgt-cta" data-mgt-generate>Generate balanced teams</button>`;

  // TODAY'S TEAMS — omitted entirely until teams exist. Names STACKED one per line. READ-ONLY as of
  // 2026-08-07 (Mike: "remove all ways to switch players"): a name carries no hooks and nothing is tappable,
  // so the board can only change by regenerating it. Never "tonight" (§ style rule).
  let teamsSect;
  if (teams.length) {
    const rows = teams.map((team, idx) => {
      const names = (Array.isArray(team) ? team : []).map((p) => {
        const n = Number(p && p.skill);
        const skPos = Number.isFinite(n) && n > 0;
        return `<div class="mgt-nm">`
          + `<span class="mgt-nmn">${escapeHTML(String((p && p.name) || 'Player'))}</span>`
          + `<span class="mgt-nsk${skPos ? '' : ' n'}">${mgpSkillText(p && p.skill)}</span></div>`;
      }).join('');
      return `<div class="mgt-trow"><span class="mgt-tt">TEAM ${idx + 1}<b class="mgt-tsk">${teamSkillTotal(team)}</b></span><div class="mgt-names">${names}</div></div>`;
    }).join('');
    teamsSect = `<div class="pl-sect">Today's teams</div>`
      + rows
      + `<div class="mgt-note">Regenerate any time to rebuild the teams</div>`;
  } else {
    teamsSect = `<div class="mgt-empty">No teams yet. Pick a size and generate.</div>`;
  }

  return header + makeSect + teamsSect;
}

// Generate balanced teams from the checked-in players at the selected size (reuses generateBalancedGroups +
// the groupCount/lastTeamSize chip state). Team count = the smallest EVEN count that keeps every team at or under the size (Mike 2026-08-25), stepped DOWN in twos while that would strand a player on their own, because one over the size beats a team of one (Mike 2026-08-26); the balancer spreads the players as evenly as it can, so remainders ride
// along per the balancer. Persists via saveLocal (→ queueLiveStateSave, teams only) + a partial repaint.
function mgtGenerateTeams() {
  const size = Number(mgtSize) || 4;
  const inNow = (state.checkedIn || []).length;
  const numTeams = evenTeamCount(inNow, size); // Mike: an even number of teams, at least two, and never a team of one
  const gen = generateBalancedGroups(state.players, state.checkedIn, numTeams, state.generatedTeams);
  state.generatedTeams = gen.teams;
  state.generatedTeamsSummary = gen.summary;
  state.groupCount = numTeams;
  state.lastTeamSize = size;
  state.liveCourtOrder = defaultLiveCourtOrder(gen.teams.length); // kept coherent for the dormant old shell
  state.liveMatchResults = {};
  state.liveMatchSkillSnapshots = {};
  saveLocal();
  repaintManage();
}

// ── Task 5: Tournament sub-hub (session-10 pick R2) + Registration (pick R7) ─────────────────────────
// Mockups r10-manage/t-b (sub-hub) + r-b (registration). The sub-hub reuses the mg-row grammar (extend,
// don't duplicate) with a data-mgt-view delegate; the header is the mgt-* addition. The
// Registration view leads with an EDITABLE announcement textarea, a Copy-for-GroupMe CTA, the Registration-
// open switch (mg-sw pill → the tdbSetTournamentFields write path), and venmo/buy-in/team-size
// fields (pk-fld underline grammar, save-on-blur via tdbSetTournamentFields). The lead tournament is the T1
// resolver (manageLeadTournament); the announcement TOLERATES tournaments.announcement not existing yet.

// The default GroupMe announcement composed from the tournament's real fields (buy_in optional). Used when
// tournaments.announcement is null/undefined — INCLUDING before migration 0047 lands (the column simply
// reads as undefined), so the Registration view always renders a sensible editable draft.
function mgDefaultAnnouncement(t) {
  const name = (t && t.name && String(t.name).trim()) ? String(t.name).trim() : 'The tournament';
  const size = Number(t && t.team_size) || 4;
  const buyIn = (t && t.buy_in != null && String(t.buy_in).trim()) ? String(t.buy_in).trim() : '';
  const mid = buyIn ? `${buyIn}, ${size}s co-ed` : `${size}s co-ed`;
  return `${name}. Registration is open! ${mid}. Register at athletic-specimen.com`;
}
// The announcement to prefill: the persisted value when set (post-0047), else the composed default. Tolerant
// of the column not existing yet (t.announcement === undefined → default; never renders the string "undefined").
function mgAnnouncementValue(t) {
  const a = t && t.announcement;
  return (typeof a === 'string' && a.trim()) ? a : mgDefaultAnnouncement(t);
}

// The sub-view titles. (The muted MGT_STAGE_SUBLINE line that used to sit under the page title retired
// with the 2026-08-25 round: the six-step track states where the tournament is in the hub's own
// vocabulary, and a second word for the same fact could only ever be a place for the two to disagree.)
// `teamadd` has no builder until the Add-a-team screen lands, so it is here to TITLE the honest
// placeholder rather than let it fall through to the generic "Tournament".
const MGT_SUB_TITLES = { registration: 'Registration & public page', teams: 'Teams & payment', teamadd: 'Add a team', pools: 'Pools & schedule', bracket: 'Bracket & scores', settings: 'Event settings', rules: 'Rules sheet', closeout: 'Close out' };

// One sub-hub row. Mirrors mgRowHTML but carries data-mgt-view (opens a tournament sub-view) instead of
// data-mg-area. subHTML is emitted RAW — callers pre-escape any user-derived content. metaHTML is the
// right-hand state word (.mgv-rmeta, round 2026-08-03) and is optional: .mg-row is space-between with two
// children, so styles.css repacks the row left (.mg-row:has(.mgv-rmeta)) and pushes the word to the edge.
function mgtRowHTML(view, name, subHTML, metaHTML) {
  const meta = metaHTML ? `<span class="mgv-rmeta">${metaHTML}</span>` : '';
  return `<a class="mg-row" data-mgt-view="${view}">
      <div class="mg-rb"><div class="mg-rn">${name}</div><div class="mg-rs">${subHTML}</div></div>
      ${meta}${MG_CHEV}
    </a>`;
}

// "First to 21, win by 2 (cap 25)" from a scoringRulesFor() row. Shared by the sub-hub Event-settings
// subtitle, the pools setup preset and the score popup's context line.
function mgRuleLine(r) {
  return 'First to ' + r.target + (r.winBy2 ? ', win by 2' : '') + (r.cap != null ? ' (cap ' + r.cap + ')' : '');
}
// "Jul 22" for a stored timestamp. Returns '' on a missing/unparseable value so the caller drops the clause
// rather than printing "Invalid Date".
function mgShortDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  try { return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch (_) { return ''; }
}

// ── The tournament SET, read by the hub title's inline picker (round 2026-08-25) ──────────────────────
// Round 2026-08-04 put the choice on its own screen (manageView === 'tournaments'); the 08-23 handoff moved
// it into the title itself, so the screen, its rows (mgtlRowHTML), its create row (MGTL_NEW_ROW_HTML) and
// its builder (buildMgTournamentListHTML) are retired. These three helpers survive because the PICKER
// renders exactly the same list, groups and subtitles — one source, so the two could never disagree.

// Every loaded tournament, newest first. tdbListTournaments already reads created_at DESC, so this re-sort
// is belt-and-braces against a caller that seeded state.tournaments another way (mgTournamentCreate
// unshifts the row the insert returned, for one). Array.sort is stable, so rows carrying no created_at keep
// their load order at the END rather than jumping the queue.
function mgTournamentPickerList() {
  return (state.tournaments || [])
    .filter((t) => t && t.id)
    .slice()
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
}

// A This-season row's subtitle, as PLAIN TEXT (the row builder escapes once). Both clauses are dropped when
// the value behind them is not there: the date needs migration 0057's event_date column, and the team count
// exists only for the tournament whose collections are loaded. The design's third clause — "$480 collected"
// — is not built at all: buy_in is free display TEXT in this app ("$80 a team"), never a number, so there
// is nothing to multiply and a total would be invented.
function mgtlSeasonSub(t) {
  return [
    tournamentHasEventDate() ? mgEventDateLabel(t.event_date) : '',
    mgTeamsClause(t),
  ].filter(Boolean).join(' · ');
}

// A Finished row's subtitle, from the SAME source the public Past-tournaments screen reads
// (loadTournamentHistory → state.tournamentHistory, shaped as { teamCount, champion }). Deriving it here a
// second way is how the two lists start disagreeing about who won. Returns '' until history has loaded, so
// the row shows its name and its state word and claims nothing else.
function mgtlFinishedSub(t) {
  const hist = Array.isArray(state.tournamentHistory)
    ? state.tournamentHistory.find((h) => h && String(h.id) === String(t.id))
    : null;
  if (!hist) return '';
  const n = hist.teamCount;
  return [
    typeof n === 'number' ? `${n} team${n === 1 ? '' : 's'}` : '',
    (hist.champion && hist.champion.name) ? `${hist.champion.name} won` : '',
  ].filter(Boolean).join(' · ');
}

// ── Round 2026-08-04: NEW TOURNAMENT (manageView === 'tournament-new') ─────────────────────────────────
// The full screen that replaces the create POPUP that shipped 2026-08-03. Same one write path underneath
// (tdbCreateTournament + tdbSetTournamentFields); what changed is that it is a screen with the fields the
// design asks for, on the existing .pk-fld / .pk-fl / .pk-fv kit and the .mges-half two-up grid. No new CSS.
//
// "Manage it right away" is local form state, so it lives in a module var rather than in the DOM: it has to
// survive the builder running again, and it is read once when Create is tapped. Default ON, per the design.
let mgntMakeActive = true;

// Which scoring rules the new tournament inherits, copied off the tournament Manage is currently pointed at.
// This is what makes the design's save-note ("Copies the scoring rules from …") a statement of fact rather
// than decoration — every value here is a real column on the row being copied, and an absent one simply
// falls through to tdbCreateTournament's own default rather than being invented.
function mgntPresetFrom(t) {
  const p = {};
  if (!t) return p;
  if (t.pool_target != null) p.pool_target = Number(t.pool_target);
  if (t.pool_cap !== undefined) p.pool_cap = t.pool_cap;
  if (t.bracket_target != null) p.bracket_target = Number(t.bracket_target);
  else if (t.match_cap != null) p.bracket_target = Number(t.match_cap);
  if (t.bracket_cap !== undefined) p.bracket_cap = t.bracket_cap;
  if (t.win_by_2 != null) p.win_by_2 = !!t.win_by_2;
  return p;
}

function buildMgTournamentNewHTML() {
  const src = mgActiveTournament();
  const header = `<div class="pd-pagehdr">`
    + `<button type="button" class="pd-back" data-mg-area="lead" aria-label="Back to Manage">${PK_BACK_SVG}</button>`
    + `<div class="pd-htitle">New tournament</div></div>`;
  const txtFld = (id, label, placeholder, extra) =>
    `<div class="pk-fld"><label class="pk-fl" for="${id}">${label}</label>`
    + `<input class="pk-fv" id="${id}" type="text" autocomplete="off"${extra || ''} placeholder="${escapeHTMLText(placeholder)}" /></div>`;
  const numFld = (id, label, min, value) =>
    `<div class="pk-fld"><label class="pk-fl" for="${id}">${label}</label>`
    + `<input class="pk-fv" id="${id}" type="number" min="${min}" inputmode="numeric" value="${escapeHTMLText(value == null ? '' : String(value))}" /></div>`;

  // Team size and Nets are prefilled off the tournament being copied, so the common case (next month, same
  // format) is one field of typing. Falling back to tdbCreateTournament's own defaults keeps the two places
  // agreeing about what a blank means.
  const teamSize = (src && Number(src.team_size) > 0) ? Number(src.team_size) : 4;
  const nets = (src && Number(src.net_count) > 0) ? Number(src.net_count) : 10;

  // COLUMN-GUARDED FIELDS. event_date and team_cap arrive with migration 0057. Until it is applied these two
  // fields are not rendered at all — an input that cannot save is worse than an absent one, because it looks
  // like it worked. The create path is guarded the same way, so nothing can be sent for a column that is not
  // there (a PostgREST 42703 would fail the WHOLE update, taking buy_in down with it).
  const dateFld = tournamentHasEventDate()
    ? `<div class="pk-fld"><label class="pk-fl" for="mgnt-date">Date</label>`
      + `<input class="pk-fv" id="mgnt-date" type="date" /></div>`
    : '';
  const capFld = tournamentHasTeamCap() ? numFld('mgnt-cap', 'Team cap', 2, '') : '';
  const buyinFld = txtFld('mgnt-buyin', 'Buy-in', '$80 a team');
  const capRow = capFld ? `<div class="mges-half">${capFld}${buyinFld}</div>` : buyinFld;

  const sw = `<div class="pk-fld mges-swfield"><span class="pk-fl">Manage it right away</span>`
    + `<button type="button" class="mg-sw${mgntMakeActive ? ' on' : ''}" data-mgnt-active role="switch"`
    + ` aria-checked="${mgntMakeActive ? 'true' : 'false'}" aria-label="Manage it right away"></button></div>`;

  // The save-note states only what is true. The copy half is dropped when there is no tournament to copy
  // from; the registration half is always true because this screen writes registration_open:false (see
  // mgTournamentCreate) so the copy and the database agree.
  const note = [
    src ? `Copies the scoring rules from ${src.name || 'the current tournament'}.` : '',
    'Registration stays closed until you open it.',
  ].filter(Boolean).join(' ');

  return header
    + txtFld('mgnt-name', 'Name', 'September 2026 Tournament', ' autocapitalize="words"')
    + dateFld
    + `<div class="mges-half">${numFld('mgnt-teamsize', 'Team size', 1, teamSize)}${numFld('mgnt-nets', 'Nets', 1, nets)}</div>`
    + capRow
    + sw
    + `<button type="button" class="pk-cta" data-mgtl-create>Create tournament</button>`
    + `<div class="pk-savenote">${escapeHTML(note)}</div>`
    + `<p class="pk-msg" id="mgnt-msg" role="alert"></p>`;
}

// ── The tournament's control page (design round 2026-08-24, screen mgts-hub; built 2026-08-25) ────────
// Mike: "i want to redo this whole page, make it better, look cleaner and cover everything imaginable
// related to the tournament". It was seven undifferentiated rows under a stage word: no sense of where the
// tournament was, no numbers, no priority.
//
// It is one page for ONE tournament, in the Manage hub's own vocabulary: the when-line (which event this
// is), the SAME six-step track the hub draws (mgHubTrackHTML — one source, so the two surfaces can never
// disagree about where the event stands), four numbers, what wants him now (the hub's attention engine at
// tournament scope), then every surface grouped by the question it answers — sign-ups, play, the event,
// after it ends — the create control, the scope sentence, and the two irreversible things last inside
// their own rule.
//
// The design's "people" group is NOT built here: check-in, the roster and the admins are Manage-level
// areas that belong to the club rather than to one event, and the QR sign still carries C81's dead URL.
function buildManageTournamentHTML() {
  const t = mgActiveTournament();
  // Round 2026-08-04: back is the Manage hub again, unconditionally. The interim picker sat INSIDE this
  // area, so the sub-hub's back button had to branch between the list and the hub; the switcher moved the
  // choice up onto the hub itself, which means there is exactly one place back can mean.
  const back = `<button type="button" class="pd-back" data-mg-area="lead" aria-label="Back to Manage">${PK_BACK_SVG}</button>`;
  const header = `<div class="pd-pagehdr">` + back
    + `<div class="pd-htitle">${escapeHTML(t ? (t.name || 'Tournament') : 'Tournament')}</div></div>`;
  if (!t) {
    // 2026-08-03: this used to read "Create one from Open the old admin on the Manage screen. A create-
    // tournament screen lands in a later slice." Both halves were dead: the old admin shell was removed in
    // session 10/14, so the instruction could not be followed at all, and the later slice is THIS one. The
    // empty state now carries the create control itself, because this is the exact screen an admin lands on
    // after deleting their last tournament and it was the only thing standing between them and a new event.
    return header
      + `<div class="pd-empty">No tournament yet. The one you create becomes the one Manage edits.</div>`
      + `<button type="button" class="pk-add" data-mgtl-new>${PK_PLUS_SVG}Create a tournament</button>`;
  }
  const teams = state.tournamentTeams || [];
  const nTeams = teams.length;
  const unpaid = teams.filter((x) => !x.paid).length;
  // Round 2026-08-03: every subtitle carries REAL status and every row a right-hand state word. Mike's
  // ruling on the prototype's "6 of 12 teams · closes Fri 6 PM" and "$480 of $640 collected": there is no
  // team-cap column, no registration-close-time column, and buy_in is free display TEXT ("$80 per team"),
  // not a number — so those clauses are DROPPED rather than filled with an invented figure. Every clause
  // below reads a value that is actually loaded in state.
  const pools = Array.isArray(state.tournamentPools) ? state.tournamentPools : [];
  const matches = Array.isArray(state.tournamentMatches) ? state.tournamentMatches : [];
  const poolMatches = matches.filter((m) => (m.phase ? m.phase === 'pool' : !!m.pool_id));
  const mainMatches = matches.filter((m) => m.phase === 'main');
  const finalCt = (list) => list.filter((m) => m.status === 'final').length;
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const nets = Number(t.net_count) > 0 ? Number(t.net_count) : 0;

  // ── The when-line (round 2026-08-25): the facts that answer "which event am I looking at" ───────────
  // DROPPED from the design's line, each for the same reason — no column behind it: the time of day
  // (there is no start_time) and "closes Fri Aug 21" (there is no registration_close_at). The date and
  // the venue are gated on their migrations having landed (0057 / 0058), so a row loaded without them
  // prints neither rather than an empty slot or an invented one.
  const size = Number(t.team_size) || 4;
  const buyIn = (t.buy_in != null && String(t.buy_in).trim()) ? String(t.buy_in).trim() : '';
  const when = [
    (tournamentHasEventDate() && mgEventDateLabel(t.event_date)) ? `<b>${escapeHTML(mgEventDateLabel(t.event_date))}</b>` : '',
    (tournamentHasVenue() && t.venue && String(t.venue).trim()) ? escapeHTML(String(t.venue).trim()) : '',
    `${size}s co-ed`,
    buyIn ? escapeHTML(buyIn) : '',
  ].filter(Boolean).join(' · ');

  // ── The four numbers ───────────────────────────────────────────────────────────────────────────────
  // Teams in carries its cap ONLY behind the 0057 column holding a real value — "2/undefined" is worse
  // than "2". Games carries a denominator only once matches EXIST: before the draw the schedule has no
  // length, and the design's "0/18" was arithmetic over a pool count nobody had entered yet. Paid turns
  // accent while anyone still owes; Games turns live-green only while the event is actually being played.
  const paid = nTeams - unpaid;
  const cap = (tournamentHasTeamCap() && Number(t.team_cap) > 0) ? Number(t.team_cap) : 0;
  const gamesDone = finalCt(matches);
  // Final-review wave v.15: the denominator uses the strip's rule (mgBracketCountable) so an unplayed reset game is
  // not promised on the tile either. gamesDone is unchanged: the excluded row is never final.
  const gamesTotal = poolMatches.length + mgBracketCountable(mainMatches).length;
  const tile = (n, label, cls) => `<div class="tv-stat${cls || ''}"><span class="tv-sn">${n}</span><span class="tv-sl">${label}</span></div>`;
  const stats = `<div class="tv-stats">`
    + tile(`${nTeams}${cap ? `<small>/${cap}</small>` : ''}`, 'Teams in')
    + tile(`${paid}<small>/${nTeams}</small>`, 'Paid', unpaid ? ' is-attn' : '')
    + tile(String(nets), 'Nets')
    + tile(gamesTotal ? `${gamesDone}<small>/${gamesTotal}</small>` : '0', 'Games', (t.status === 'pools' || t.status === 'bracket') ? ' is-live' : '')
    + `</div>`;

  // Needs you, TOURNAMENT scope: the same engine the hub runs, minus the club-level items (the Venmo
  // link, "no pickup day set"). This page edits one event, and a club chore listed here would be a
  // to-do none of the rows below can action.
  const needs = mgNeedsRowsHTML(manageNeedsYouModel(manageNeedsYouCtx('tournament')), 'Needs you');

  const regSub = (t.registration_open ? `<span class="mgt-on">Open</span>` : 'Closed') + ' · what players see';
  const teamsSub = nTeams
    ? `${nTeams} registered · ${unpaid ? unpaid + ' unpaid' : 'all paid'} · rosters and buy-in`
    : 'No teams yet · rosters and buy-in';
  let poolsSub, poolsMeta;
  if (!pools.length) {
    // Pre-draw, the row states what the draw WILL do — mgPoolsSplitClause runs tdbDrawPools' own clamp —
    // rather than echoing a pool count nobody has set yet. '' (fewer than two teams) drops the clause.
    const split = mgPoolsSplitClause(nTeams, Number(t.pool_count) > 0 ? Number(t.pool_count) : Math.max(1, Math.round(nTeams / 6)), nets || 1);
    poolsSub = split ? `Not drawn · ${escapeHTML(split)}` : 'Not drawn';
    poolsMeta = 'To do';
  }
  else if (!poolMatches.length) { poolsSub = `Drawn, not started · ${plural(pools.length, 'pool')}`; poolsMeta = 'Ready'; }
  else {
    // "done", not "final": the word this app uses for a played game everywhere else (the pools meta, the
    // bracket board). "final" is the retired bracket vocabulary. Fix wave, 2026-08-25 drive.
    const done = finalCt(poolMatches);
    poolsSub = `${done} of ${plural(poolMatches.length, 'game')} done`;
    poolsMeta = done === poolMatches.length ? 'Done' : 'Live';
  }
  let bracketSub, bracketMeta;
  if (!mainMatches.length) { bracketSub = 'Double elimination · opens when pool play finishes'; bracketMeta = 'Locked'; }
  else {
    // The SAME countable list the bracket's own progress strip counts (mgBracketCountable), so the row and
    // the strip can never disagree — the drive caught this row reading "26 of 31" under a strip reading
    // "26 of 30", because the row was counting an unplayed reset championship the strip leaves out.
    const countable = mgBracketCountable(mainMatches);
    const done = finalCt(countable);
    bracketSub = `${done} of ${plural(countable.length, 'game')} done`;
    bracketMeta = (t.status === 'completed' || done === countable.length) ? 'Done' : 'Live';
  }
  // Event settings states the shape of the event. The cap clause is column-gated the same way the tile is,
  // and the nets clause drops when net_count is unset rather than printing "0 nets".
  const settingsSub = [`${size}s co-ed`, buyIn ? escapeHTML(buyIn) : '', cap ? `${cap}-team cap` : '', nets ? plural(nets, 'net') : ''].filter(Boolean).join(' · ');
  // "N sections" is real: rulesToHTML treats a "## " line as a section heading, so the count is the sheet's
  // own structure. The prototype's "updated Jul 28" is NOT rendered — tournaments.updated_at moves on any
  // field write, so dating the rules from it would be a lie. Both scoring lines are stated because pool
  // play and the bracket are played to different numbers and the sheet is where that is settled.
  const rulesText = typeof t.rules === 'string' ? t.rules : '';
  const rulesSections = rulesText ? rulesText.split(/\r?\n/).filter((l) => l.trim().startsWith('## ')).length : 0;
  const rulesSub = `${escapeHTML(mgRuleLine(scoringRulesFor('pool', t)))} · ${escapeHTML(mgRuleLine(scoringRulesFor('main', t)))}`
    + (rulesText ? ` · ${rulesSections ? plural(rulesSections, 'section') + ' live' : 'live'}` : ' · not written yet');
  // The players'-eye view is offered only when THIS tournament is the one the public page resolves to
  // (publicLiveTournament). Anything else and the row would open a different event under this one's name.
  const showPlayerView = (publicLiveTournament() || {}).id === t.id;
  // Every surface grouped by the question it answers, in the order the day runs. The Score sheet row is
  // the SAME destination as Pools & schedule and earns its own row only once there are pool games to
  // enter — before the draw it would open an empty board. Announcement and Player view are not sub-views
  // at all (one opens the full-screen editor, one leaves Manage), so they are written out by hand.
  const rows = `<div class="pl-sect">Sign-ups</div>`
    + mgtRowHTML('registration', escapeHTML(MGT_SUB_TITLES.registration), regSub, t.registration_open ? 'Open' : 'Closed')
    + mgtRowHTML('teams', 'Teams &amp; payment', teamsSub, unpaid ? `${unpaid} unpaid` : (nTeams ? 'All paid' : ''))
    + mgtRowHTML('teamadd', escapeHTML(MGT_SUB_TITLES.teamadd), 'For the pair who paid you at the net')
    + `<div class="pl-sect">Play</div>`
    + mgtRowHTML('pools', 'Pools &amp; schedule', poolsSub, poolsMeta)
    + (poolMatches.length ? mgtRowHTML('pools', 'Score sheet', 'Enter pool results as each game finishes') : '')
    + mgtRowHTML('bracket', 'Bracket &amp; scores', bracketSub, bracketMeta)
    + mgtRowHTML('rules', 'Rules sheet', rulesSub)
    + `<div class="pl-sect">The event</div>`
    + mgtRowHTML('settings', 'Event settings', settingsSub)
    + `<a class="mg-row" data-mgt-announce><div class="mg-rb"><div class="mg-rn">Announcement</div><div class="mg-rs">The note at the top of the public page</div></div>${MG_CHEV}</a>`
    + (showPlayerView ? `<a class="mg-row" data-nav-tab="tournament"><div class="mg-rb"><div class="mg-rn">Player view</div><div class="mg-rs">Open this tournament the way players see it</div></div>${MG_CHEV}</a>` : '')
    + `<div class="pl-sect">After it ends</div>`
    + mgtRowHTML('closeout', 'Close out', 'Crowns the champion and archives the event', t.status === 'completed' ? 'Done' : 'Not yet');
  // The scope sentence. The hub's title picker is where a tournament is switched, and this page carries no
  // switcher of its own, so it says out loud both what these rows edit and where the other one lives.
  const note = `<p class="tv-note">Everything on this page edits ${escapeHTML(t.name || 'this tournament')} only. Switch tournaments from the title on Manage.</p>`;
  // Start the NEXT event (2026-08-03). Deliberately NOT in the Danger zone below: that red box is for Reset
  // and Delete, and putting a constructive action in it would teach the wrong thing about the box. This is
  // the quiet dashed affordance the Teams screen already uses for "Add a team yourself" (.pk-add), sat under
  // the rows and above the separator, so it reads as the last ordinary thing you can do here. Mike runs
  // monthly events, so setting next month up while this one is still live is a normal act, not an escape.
  // (2026-08-04) It now carries data-mgtl-new and opens the same full New tournament SCREEN the chooser's
  // top row does — one create path, reachable from both, rather than a popup here and a screen there.
  const create = `<button type="button" class="pk-add" data-mgtl-new>${PK_PLUS_SVG}Create another tournament</button>`;
  // Danger zone (round 2026-08-03) — replaces the loose reset button. Full reset lives HERE, on the sub-hub,
  // rather than inside Pools or Bracket, because the whole point is escaping a bad state: it has to be
  // reachable at every status, including 'completed'. Delete sits beside it with what each one takes with
  // it spelled out; both keep the locked type-the-name grammar. data-mgt-delete → mgTournamentDelete
  // (tdbDeleteTournament + its mandatory read-back guard); data-mgt-fullreset → mgTournamentFullReset.
  const danger = `<div class="pl-sect mgv-dsect" aria-hidden="true"></div>`
    + `<div class="mgv-danger">`
      + `<div class="mgv-drow"><span class="mgv-dtxt">`
        + `<span class="mgv-dt">Reset the whole tournament</span>`
        + `<span class="mgv-dd">Clears the pools, the schedule, every score and the bracket, and puts this back to setup. Registered teams and their payments are kept.</span>`
      + `</span><button type="button" class="mgts-danger mgv-dbtn" data-mgt-fullreset>Reset</button></div>`
      + `<div class="mgv-drow"><span class="mgv-dtxt">`
        + `<span class="mgv-dt">Delete this tournament</span>`
        + `<span class="mgv-dd">Removes the event, its teams, their payments and every result. Players lose it too, and it cannot be undone.</span>`
      + `</span><button type="button" class="mgts-danger mgv-dbtn mgv-del" data-mgt-delete>Delete</button></div>`
      + `<div class="mgv-dnote">Both ask you to type the tournament name before anything happens.</div>`
    + `</div>`;
  // mgHubStatusHTML rides under the Needs-you rows: the two items on this list that WRITE (Open
  // registration, Reuse rules) report on #mgh-status, and without it their refusals were silent here.
  return header + `<div class="tv-when">${when}</div>` + mgHubTrackHTML(t) + stats + needs + mgHubStatusHTML() + rows + create + note + danger;
}

// The Registration view (mockup r-b): THE ANNOUNCEMENT (editable textarea prefilled from the persisted value
// or the composed default) + Copy for GroupMe + CONTROLS (the Registration-open switch + venmo/buy-in/team-
// size fields). The switch/copy act via the click delegate; the fields save on blur (focusout delegate).
function buildMgRegistrationHTML() {
  const t = mgActiveTournament();
  const header = `<div class="pd-pagehdr">`
    + `<button type="button" class="pd-back" data-mgt-back aria-label="Back to Tournament">${PK_BACK_SVG}</button>`
    + `<div class="pd-htitle">${escapeHTML(MGT_SUB_TITLES.registration)}</div></div>`;
  if (!t) {
    return header + `<div class="pd-empty">No tournament to manage registration for yet.</div>`;
  }
  const teams = state.tournamentTeams || [];
  const nTeams = teams.length;
  const paid = teams.filter((x) => x.paid).length;
  const ann = mgAnnouncementValue(t);
  const open = !!t.registration_open;
  const venmo = t.venmo_link == null ? '' : String(t.venmo_link);
  const buyin = t.buy_in == null ? '' : String(t.buy_in);
  const size = Number(t.team_size) || 4;
  const venmoNote = /^https?:\/\//i.test(venmo)
    ? 'Players pay on Venmo when they register'
    : 'Venmo missing. The pay button says "coming soon"';
  return header
    + `<div class="pl-sect">The announcement</div>`
    // §38 pick C (2026-07-12): a clean read block (tap anywhere to open the full-screen editor) + an explicit
    // Edit affordance, replacing the inline textarea. Plain text — escape-first, line breaks preserved via CSS.
    + `<div class="mgr-annview" data-mgr-edit>${escapeHTML(ann)}</div>`
    + `<button type="button" class="mgr-annedit" data-mgr-edit>Edit</button>`
    + `<button type="button" class="mgr-cta" data-mgr-copy>Copy for GroupMe</button>`
    + `<div class="pl-sect">Controls</div>`
    + `<div class="mgr-tog"><div class="mg-rb"><div class="mg-rn">Registration open</div>`
      + `<div class="mg-rs">${nTeams} team${nTeams === 1 ? '' : 's'} in · ${paid} paid</div></div>`
      + `<button type="button" class="mg-sw${open ? ' on' : ''}" data-mgr-regtoggle role="switch" aria-checked="${open ? 'true' : 'false'}" aria-label="Registration open"></button></div>`
    + `<div class="pk-fld"><label class="pk-fl" for="mgr-venmo">Venmo link</label>`
      + `<input class="pk-fv" id="mgr-venmo" type="text" inputmode="url" autocomplete="off" placeholder="https://venmo.com/u/yourname" value="${escapeHTMLText(venmo)}" /></div>`
    + `<div class="mgr-fnote" id="mgr-fnote">${escapeHTML(venmoNote)}</div>`
    + `<div class="pk-fld"><label class="pk-fl" for="mgr-buyin">Buy-in</label>`
      + `<input class="pk-fv" id="mgr-buyin" type="text" autocomplete="off" placeholder="$80 per team" value="${escapeHTMLText(buyin)}" /></div>`
    + `<div class="pk-fld"><label class="pk-fl" for="mgr-teamsize">Team size</label>`
      + `<input class="pk-fv" id="mgr-teamsize" type="number" min="1" inputmode="numeric" value="${escapeHTMLText(String(size))}" /></div>`
    // 2026-08-04: the explicit Save these three fields never had. Blur still saves (the phone safety net), so
    // this is the affordance that says the edit IS applied, plus the status line that proves it landed.
    + mgSaveBtnHTML('registration')
    // 2026-08-25: the line is SEEDED "Saved" rather than blank. A fresh build reads its inputs straight off
    // the tournament, so "Saved" is the true resting state, and it gives mgSyncSaveButton a line to flip to
    // "Unsaved changes" the moment a value differs — the question the disabled/enabled button alone
    // answers only if you already know what a greyed-out Save means.
    + `<p class="mgr-status" id="mgr-status" role="status" aria-live="polite">Saved</p>`;
}

// A tournament sub-view placeholder (Tasks 6-10 fill these). Its back button returns to the SUB-HUB
// (data-mgt-back), never straight to the Manage lead.
function mgtSubPlaceholderHTML(view) {
  const title = MGT_SUB_TITLES[view] || 'Tournament';
  return `<div class="pd-pagehdr">`
    + `<button type="button" class="pd-back" data-mgt-back aria-label="Back to Tournament">${PK_BACK_SVG}</button>`
    + `<div class="pd-htitle">${escapeHTML(title)}</div></div>`
    + `<div class="pd-empty">Coming in the next slices.</div>`;
}

// manageView==='tournament' dispatch: null mgtView → the sub-hub; 'registration' → the built view; any
// other sub-view id → an honest placeholder. (The 2026-08-04 switcher moved the tournament LIST out of this
// area entirely — it is manageView==='tournaments' now — so there is no picker branch here any more.)
function buildManageTournamentContainerHTML() {
  if (mgtView === 'registration') return buildMgRegistrationHTML();
  if (mgtView === 'teams') return buildMgTeamsHTML();
  if (mgtView === 'teamadd') return buildMgTeamAddHTML();
  if (mgtView === 'pools') return buildMgPoolsHTML();
  if (mgtView === 'bracket') return buildMgBracketHTML();
  if (mgtView === 'settings') return buildMgSettingsHTML();
  if (mgtView === 'rules') return buildMgRulesHTML();
  if (mgtView === 'closeout') return buildMgCloseoutHTML();
  if (mgtView) return mgtSubPlaceholderHTML(mgtView);
  return buildManageTournamentHTML();
}

// Point the whole Manage tab at ONE tournament. Shared by the title picker's rows and by a create that carries
// "Manage it right away", so there is a single place that decides what switching means.
// state.activeTournamentId is the organizer's selection, and repointing it is already how this app swaps
// which tournament the Manage screens operate on (mgSyncActiveTournament / mgTournamentCreate both do it).
// The loaded collections belong to the PREVIOUS tournament, so they are cleared first: rendering one
// tournament's teams under another tournament's name is the exact failure the 2026-07-11 resolver note
// describes, and an empty count is honest where a stale one is not. The refresh then loads the real ones.
// Every per-tournament view flag is reset with them — a pool tab or a champion override carried across a
// switch would be pointing at a tournament that is no longer on screen.
function mgAdoptTournament(id) {
  if (state.activeTournamentId === id) return false;
  state.activeTournamentId = id;
  state.tournamentTeams = []; state.tournamentPools = []; state.tournamentMatches = []; state.teamMembers = null;
  state.tournamentPickedTeamId = null; state.bracketSide = null; state.bracketRound = null; state.seedOverride = null;
  mgpControlsOpen = false; mgpMoveTeamId = null; mgpNetsEditPoolId = null;
  mgpPoolFilter = null; mgCloseoutChampId = undefined; mgBracketShowDone = false;
  return true;
}

// Tap a picker row (data-mgp-pick): that tournament becomes the one Manage edits, and the title above the
// panel changes to its name — which is the whole confirmation, so there is no screen change to make.
// (Round 2026-08-25 dropped the `manageView = 'lead'` line the chooser needed: the picker drops out of the
// hub itself, so he is already there, and forcing the view would newly kick him off a sub-page.)
//
// STILL OPEN, deliberately NOT built (README "Not yet designed", questions 1 and 2): there is no confirm
// step when switching away from a tournament that is mid-scoring, and finished tournaments ARE selectable
// (the design allows it, so a score can be fixed after the fact). Both need Mike's call, not a guess here.
function mgPickTournament(id) {
  const t = (state.tournaments || []).find((x) => x && String(x.id) === String(id));
  // The row went away under him (a background sync saw it deleted). Repaint rather than point the whole
  // Manage tab at a tournament that is not there.
  if (!t) { repaintManage(); return; }
  const changed = mgAdoptTournament(t.id);
  // An explicit pick outranks the lead resolver from here on — without this, the very next row tap would
  // run mgSyncActiveTournament() and quietly switch him back.
  mgTournamentPinned = true;
  mgtView = null;
  mgHubDoneText = '';
  mgSaveTournamentPin();   // and it survives a reload
  repaintManage();
  if (changed) {
    Promise.resolve(tdbRefreshTournaments())
      .then(() => { if (activeMainTab === 'manage') repaintManage(); })
      .catch(() => {});
  }
  const p = document.getElementById('tab-manage');
  if (p) p.scrollTop = 0;
}

// ── The hub's pick, remembered across reloads (round 2026-08-25) ──────────────────────────────────────
// Written only for an EXPLICIT pick. An inferred selection belongs to manageLeadTournament(), and freezing
// one into localStorage would outlive the reason it was inferred (a live event ends; the resolver moves on;
// the stored id would not).
function mgSaveTournamentPin() {
  try {
    if (mgTournamentPinned && state.activeTournamentId) {
      localStorage.setItem(LS_MG_TOURNAMENT_KEY, JSON.stringify({ id: state.activeTournamentId }));
    }
  } catch (_) { /* private mode or quota: the pick just does not survive the reload */ }
}

// Read it back ONCE, after the first tdbListTournaments() result lands (both call sites go through here).
// A stored id that is no longer in the list is DROPPED, not adopted: a deleted tournament must never blank
// the Manage tab, and falling through to the resolver is exactly the behaviour that shipped before.
let mgStoredPinChecked = false;
function mgAdoptStoredTournament() {
  if (mgStoredPinChecked) return;
  mgStoredPinChecked = true;
  let id = '';
  try {
    const raw = localStorage.getItem(LS_MG_TOURNAMENT_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    id = (parsed && parsed.id) ? String(parsed.id) : '';
  } catch (_) { return; }
  if (!id) return;
  const row = (state.tournaments || []).find((x) => x && String(x.id) === id);
  if (!row) {
    try { localStorage.removeItem(LS_MG_TOURNAMENT_KEY); } catch (_) {}
    return;
  }
  state.activeTournamentId = row.id;
  mgTournamentPinned = true;
}

// The picker's Finished rows read state.tournamentHistory — the SAME cache the public Past-tournaments
// screen fills, so the two lists can never disagree about who won. It is loaded lazily and only once
// (undefined = never loaded, [] = loaded and genuinely empty), and only when there is a finished tournament
// to describe. Until it arrives a Finished row shows its name and its state word and claims nothing else.
function mgHubEnsureHistory() {
  if (Array.isArray(state.tournamentHistory) || state.tournamentHistoryLoading) return;
  if (!mgTournamentPickerList().some((t) => mgTournamentPhase(t) === 'finished')) return;
  Promise.resolve(loadTournamentHistory())
    .then(() => { if (activeMainTab === 'manage' && manageView === 'lead') repaintManage(); })
    .catch(() => {});
}

// ── The hub's two WRITES (round 2026-08-25) ───────────────────────────────────────────────────────────
// Both follow the shipped engine exactly: tdbSetTournamentFields, then mgVerifyTournamentFields re-reads the
// row and compares what we sent, because "no error" is not "saved" (the 2026-08-04 lesson). A refused write
// says so on #mgh-status and leaves the confirmation strip EMPTY, so the strip can only ever mean the write
// landed. No Undo link: neither write has a reversing RPC, and the registration switch is its own undo.
async function mgHubFlipRegistration(open) {
  const t = mgActiveTournament();
  if (!t || !state.isAdmin) return;
  try {
    await tdbSetTournamentFields(t.id, { registration_open: open });
    const unsaved = await mgVerifyTournamentFields(t.id, { registration_open: open });
    mgHubDoneText = unsaved.length ? '' : (open ? 'Registration is open' : 'Registration closed');
    repaintManage();
    if (unsaved.length) mgNoteStatus('mgh-status', MG_SAVE_FAILED, true);
  } catch (err) {
    console.warn('mgHubFlipRegistration', err);
    mgHubDoneText = '';
    repaintManage();
    mgNoteStatus('mgh-status', MG_SAVE_OFFLINE, true);
  }
}

// "Reuse" on the no-rules item: copy the most recent prior tournament's rules onto this one, verbatim. The
// model picked the source row and handed its id over, so nothing is re-derived here.
async function mgHubReuseRules(fromId) {
  const t = mgActiveTournament();
  const from = (state.tournaments || []).find((x) => x && String(x.id) === String(fromId));
  if (!t || !from || !state.isAdmin) return;
  const rules = from.rules;
  if (!rules || !String(rules).trim()) return;
  try {
    await tdbSetTournamentFields(t.id, { rules });
    const unsaved = await mgVerifyTournamentFields(t.id, { rules });
    mgHubDoneText = unsaved.length ? '' : 'Rules reused from ' + (from.name || 'the last tournament');
    repaintManage();
    if (unsaved.length) mgNoteStatus('mgh-status', MG_SAVE_FAILED, true);
  } catch (err) {
    console.warn('mgHubReuseRules', err);
    mgHubDoneText = '';
    repaintManage();
    mgNoteStatus('mgh-status', MG_SAVE_OFFLINE, true);
  }
}

// The tournament the Registration view reads/writes (same resolver as the sub-hub header).
function mgRegTournament() { return mgActiveTournament(); }

// ── Explicit Save on the tournament-edit screens (2026-08-04) ─────────────────────────────────────────
// Mike: "with everything that edits the tournament there needs to be a save button that instantly applies
// the changes." Registration and Event settings had NO Save at all — every field wrote on FOCUSOUT, and
// mgrSaveField swallowed its error entirely (`catch { console.warn }`), so a refused Venmo write looked
// exactly like a successful one. Both screens now carry one Save that writes every dirty field in ONE
// tdbSetTournamentFields call and PROVES the write landed; focusout stays as the safety net (a phone user
// navigates away without tapping Save, and removing it would newly lose edits) but runs the same honest
// engine, so a blur-save can no longer report differently from a button-save.
//
// One table per screen is the single source for (a) which fields are dirty, (b) what one Save call sends,
// (c) what the background poll must not clobber — so the three can never drift apart.
const MGR_FIELD_IDS = ['mgr-venmo', 'mgr-buyin', 'mgr-teamsize'];
const MGES_FIELD_IDS = ['mges-name', 'mges-teamsize', 'mges-nets', 'mges-pooltarget', 'mges-poolcap',
  'mges-brackettarget', 'mges-bracketcap', 'mges-buyin', 'mges-venue', 'mges-venueaddr'];
const MG_SAVE_FAILED = 'That did not save. Check you are signed in as an admin, then try again.';
const MG_SAVE_OFFLINE = 'Could not save. Check the connection and try again.';
const MG_SAVE_NEEDS_NUMBER = 'That needs to be a number. Left it unchanged.';

// The string a field RENDERS with, straight off the loaded tournament. Dirtiness is measured against this —
// the tournament itself, never a snapshot taken on first keystroke, which would call a field clean again the
// moment a background refresh landed under it.
function mgFieldCurrentText(id, t) {
  if (!t) return '';
  const s = (v) => (v == null ? '' : String(v)).trim();
  if (id === 'mgr-venmo') return s(t.venmo_link);
  if (id === 'mgr-buyin') return s(t.buy_in);
  if (id === 'mgr-teamsize') return String(Number(t.team_size) || 4); // the Registration field defaults to 4
  if (id === 'mges-name') return s(t.name);
  if (id === 'mges-buyin') return s(t.buy_in);
  if (id === 'mges-teamsize') return s(t.team_size);
  if (id === 'mges-nets') return s(t.net_count);
  if (id === 'mges-pooltarget') return s(t.pool_target);
  if (id === 'mges-poolcap') return s(t.pool_cap);
  if (id === 'mges-brackettarget') return s(t.bracket_target != null ? t.bracket_target : t.match_cap);
  if (id === 'mges-bracketcap') return s(t.bracket_cap);
  if (id === 'mges-venue') return s(t.venue);            // migration 0058
  if (id === 'mges-venueaddr') return s(t.venue_address);
  return '';
}

// Which of a screen's fields differ from the loaded tournament RIGHT NOW (read straight off the DOM).
function mgDirtyFieldIds(ids, t) {
  if (!t) return [];
  return (ids || []).filter((id) => {
    const el = document.getElementById(id);
    if (!el) return false;
    return String(el.value == null ? '' : el.value).trim() !== mgFieldCurrentText(id, t);
  });
}

// One field's intent. null = nothing to write; { invalid, revert, msg } = a bad entry (the caller reverts
// that input and says why); { fields } = the column(s) to write; atomicNets flags the ONE field that cannot
// ride a plain batch mid-play (see mgSaveScreenFields).
function mgFieldWrite(id, raw, t) {
  const txt = String(raw == null ? '' : raw).trim();
  const cur = mgFieldCurrentText(id, t);
  if (txt === cur) return null;
  // A positive-integer column. `nullable` lets a blank clear it; otherwise a blank/NaN is a bad entry.
  const intWrite = (col, nullable, msg) => {
    if (txt === '') return nullable ? { fields: { [col]: null } } : { invalid: true, revert: cur, msg: msg || MG_SAVE_NEEDS_NUMBER };
    const n = parseInt(txt, 10);
    if (!Number.isFinite(n) || n < 1) return { invalid: true, revert: cur, msg: msg || MG_SAVE_NEEDS_NUMBER };
    if (String(n) === cur) return null; // "4.0" over a stored 4 is not a change
    return { fields: { [col]: n } };
  };
  if (id === 'mgr-venmo') return { fields: { venmo_link: txt || null } };   // stored as typed; the public pay button guards to http(s) at render
  if (id === 'mgr-buyin' || id === 'mges-buyin') return { fields: { buy_in: txt || null } }; // free text
  if (id === 'mgr-teamsize') return intWrite('team_size', false);
  if (id === 'mges-name') {
    if (!txt) return { invalid: true, revert: cur, msg: 'Name is required. Left it unchanged.' };
    return { fields: { name: txt } };
  }
  if (id === 'mges-teamsize') return intWrite('team_size', false);
  if (id === 'mges-nets') {
    const w = intWrite('net_count', false, 'Nets needs to be a number. Left it unchanged.');
    if (w && w.fields) w.atomicNets = w.fields.net_count;
    return w;
  }
  if (id === 'mges-pooltarget') return intWrite('pool_target', false);
  if (id === 'mges-poolcap') return intWrite('pool_cap', true);
  if (id === 'mges-brackettarget') {
    const w = intWrite('bracket_target', false);
    if (w && w.fields) w.fields.match_cap = w.fields.bracket_target; // NF-1 back-compat: legacy readers use match_cap
    return w;
  }
  if (id === 'mges-bracketcap') return intWrite('bracket_cap', true);
  if (id === 'mges-venue') return { fields: { venue: txt || null } };            // free text; blank clears (0058)
  if (id === 'mges-venueaddr') return { fields: { venue_address: txt || null } };
  return null;
}

// Type-tolerant equality for a READ-BACK. The column comes back through PostgREST as JSON, so a number can
// arrive as a number or a numeric string, and null/undefined both mean "empty".
function mgSameSavedValue(sent, got) {
  if (sent == null) return got == null;
  if (got == null) return false;
  if (typeof sent === 'boolean') return !!got === sent;
  if (typeof sent === 'number') return Number(got) === sent;
  return String(got) === String(sent);
}

// PROVE the write. The RLS policies on `tournaments` are USING row FILTERS, not RAISE guards: a session that
// has drifted to anon or off its organizer membership gets an UPDATE matching ZERO rows and `error: null`.
// "No error" is therefore NOT "saved" — the exact failure Mike rates worst ("being told it's fixed when it
// isn't"), and here the cost is a dead Venmo link discovered at a live event. tdbRefreshTournaments() already
// re-reads the row from the server, so the proof is free: compare every column we just sent against the
// refreshed row. Returns the columns that did NOT take (empty = proven saved). Same guard as
// tdbResetTournamentFull / tdbDeleteTournament / tdbEndTournamentUnplayed.
async function mgVerifyTournamentFields(tournamentId, fields) {
  await tdbRefreshTournaments();
  const cols = Object.keys(fields || {});
  const row = (state.tournaments || []).find((x) => x && String(x.id) === String(tournamentId));
  if (!row) return cols; // the row is gone from the refreshed list — nothing we sent is proven
  return cols.filter((col) => !mgSameSavedValue(fields[col], row[col]));
}

// Write a status line on one of the edit screens. `bad` colors it danger; success keeps the muted green
// (--live-ink), which the design round reserves for live/positive.
function mgNoteStatus(id, msg, bad) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  if (el.classList) { if (bad) el.classList.add('is-bad'); else el.classList.remove('is-bad'); }
}

// The Save control, in the screens' existing grammar (.pk-cta — accent, the same button the pickup-day form
// and Create tournament use). It renders DISABLED because a fresh build reads its inputs straight off the
// tournament, so nothing is dirty yet; the first keystroke that differs wakes it (mgSyncSaveButton, off the
// input delegate, which touches ONLY the button so no caret is ever disturbed).
function mgSaveBtnHTML(screen) {
  return `<button type="button" class="pk-cta" data-mg-save="${escapeHTML(screen)}" disabled>Save</button>`;
}

// True from the moment a save's first await is issued until its read-back lands. mgSyncSaveButton reads it
// so a keystroke during the write cannot overwrite "Saving…" with "Unsaved changes" — the field IS dirty
// at that instant, and saying so would contradict the write that is already carrying it.
let mgSaveInFlight = false;

// 2026-08-25: this also writes the status line beside the button. The disabled/enabled Save answers "is
// there anything to save" only to someone who already reads a greyed-out button that way; the line says it
// in words. Two things it must never talk over: a write in flight (its own "Saving…"), and an error line —
// mgNoteStatus marks those .is-bad, and replacing "Could not save" with "Unsaved changes" would downgrade a
// refused write into a routine one.
function mgSyncSaveButton() {
  const btn = document.querySelector('[data-mg-save]');
  if (!btn) return;
  const screen = btn.getAttribute('data-mg-save');
  const ids = screen === 'settings' ? MGES_FIELD_IDS : MGR_FIELD_IDS;
  const dirty = mgDirtyFieldIds(ids, mgActiveTournament()).length > 0;
  // A write in flight OWNS the button. mgSaveScreenFields disabled it so a second tap cannot start a
  // concurrent save, and the field stays dirty until that write lands — so re-arming here on a keystroke
  // would undo exactly the guard it set, and two saves racing would leave whichever finished first
  // clearing the shared flag while the other one's remaining awaits ran unguarded. Hold it down, leave
  // the "Saving…" line alone, and let the save's own exit re-sync both.
  if (mgSaveInFlight) { btn.disabled = true; return; }
  btn.disabled = !dirty;
  const el = document.getElementById(screen === 'settings' ? 'mges-status' : 'mgr-status');
  if (!el) return;
  if (el.classList && el.classList.contains('is-bad')) return;
  el.textContent = dirty ? 'Unsaved changes' : 'Saved';
}

// A tap on Save blurs the focused field FIRST (focusout fires before click), which would fire the per-field
// safety net and split one batch into two writes. Arming on pointerdown (which lands before the blur) lets
// the focusout delegate stand down. If the tap is abandoned the flag times out and the field is still dirty
// with Save lit, so the edit is never lost either way.
let mgSaveTapArmed = false;
function mgArmSaveTap() {
  mgSaveTapArmed = true;
  clearTimeout(mgArmSaveTap._t);
  mgArmSaveTap._t = setTimeout(() => { mgSaveTapArmed = false; mgSyncSaveButton(); }, 900);
}

// THE ENGINE. screen: 'registration' | 'settings'. onlyId restricts it to a single input (the focusout
// safety net); without it every dirty field on the screen goes in ONE tdbSetTournamentFields call.
// Never repaints: a repaint would rebuild the inputs the organizer is working in, and on a FAILURE the typed
// value must stay on screen so nothing is silently lost.
async function mgSaveScreenFields(screen, onlyId) {
  const t = mgActiveTournament();
  if (!t) return false;
  const all = screen === 'settings' ? MGES_FIELD_IDS : MGR_FIELD_IDS;
  const ids = onlyId ? all.filter((x) => x === onlyId) : all;
  const statusId = screen === 'settings' ? 'mges-status' : 'mgr-status';
  const dirty = mgDirtyFieldIds(ids, t);
  if (!state.isAdmin) {
    // NOT a silent no-op. The USING-filter RLS would refuse this write anyway, and being told nothing is
    // precisely the failure this path exists to kill.
    if (dirty.length) mgNoteStatus(statusId, MG_SAVE_FAILED, true);
    return false;
  }
  // Parse every dirty field BEFORE writing. A bad entry reverts its own input and stops the whole save, so a
  // batch never half-writes on the strength of a value the organizer has to retype anyway.
  let fields = null;
  let atomicNets = null;
  for (let i = 0; i < dirty.length; i++) {
    const id = dirty[i];
    const el = document.getElementById(id);
    const w = mgFieldWrite(id, el ? el.value : '', t);
    if (!w) continue;
    if (w.invalid) {
      if (el) el.value = w.revert;
      mgNoteStatus(statusId, w.msg, true);
      mgSyncSaveButton();
      return false;
    }
    if (w.atomicNets != null) atomicNets = w.atomicNets;
    fields = Object.assign(fields || {}, w.fields);
  }
  if (!fields) { mgSyncSaveButton(); return false; } // nothing changed — the button stays quiet
  const btn = document.querySelector('[data-mg-save="' + screen + '"]');
  if (btn) btn.disabled = true;                      // no double-tap while the write is in flight
  mgSaveInFlight = true;                             // …and typing during it never overwrites "Saving…"
  mgNoteStatus(statusId, 'Saving…');
  const sent = Object.assign({}, fields);            // everything we will PROVE, atomic net_count included
  try {
    // net_count is the ONE column that cannot ride the batch mid-play: a plain write would drift matches.net
    // from net_count (the closed F7/F8 bug class), so it goes through the ATOMIC re-net (migration 0031 /
    // apply_net_count_change) and drops out of the UPDATE. Everything else is a single statement.
    if (atomicNets != null && (t.status === 'pools' || t.status === 'bracket')) {
      const freshM = await tdbListMatches(t.id);
      await tdbApplyNetCountChange(t.id, atomicNets, computeNetAssignments(t.status, state.tournamentPools, freshM, atomicNets));
      delete fields.net_count;
    }
    if (Object.keys(fields).length) await tdbSetTournamentFields(t.id, fields);
    const unsaved = await mgVerifyTournamentFields(t.id, sent);
    mgSaveInFlight = false;                          // every await on this path is behind us
    if (unsaved.length) {
      mgNoteStatus(statusId, MG_SAVE_FAILED, true);
      mgSyncSaveButton();                            // still dirty → Save stays lit, the typed text stays put
      return false;
    }
    mgNoteStatus(statusId, 'Saved');
    if (screen === 'registration') mgrSyncVenmoNote(); // the note under the field derives from the value just saved
    mgSyncSaveButton();
    return true;
  } catch (err) {
    mgSaveInFlight = false;
    console.warn('mgSaveScreenFields', screen, err);
    mgNoteStatus(statusId, MG_SAVE_OFFLINE, true);
    mgSyncSaveButton();
    return false;
  }
}

// The line under the Venmo field states whether the public pay button works. It is derived from the value we
// just saved, so it must be re-stated in place after a proven save — leaving "Venmo missing" over a link that
// just saved would be a lie on screen. Text only; the input is never touched.
function mgrSyncVenmoNote() {
  const el = document.getElementById('mgr-fnote');
  if (!el) return;
  const t = mgActiveTournament();
  const venmo = (t && t.venmo_link != null) ? String(t.venmo_link) : '';
  el.textContent = /^https?:\/\//i.test(venmo)
    ? 'Players pay on Venmo when they register'
    : 'Venmo missing. The pay button says "coming soon"';
}

// True when the Registration view has an in-progress edit the background poll must not clobber: a focused
// input/textarea inside #tab-manage, or an announcement textarea whose value differs from what was last
// rendered/saved (its data-mgr-initial). Extends the Task 2/3 dirty-guard pattern for manageView==='tournament'
// + mgtView==='registration'.
function manageRegDirty() {
  // The announcement now edits in a body-appended overlay (§38 pick C) — immune to partialRender — so this
  // only guards the still-inline venmo/buy-in/team-size fields against a background repaint while focused.
  const panel = document.getElementById('tab-manage');
  if (!panel) return false;
  const ae = document.activeElement;
  if (ae && panel.contains(ae) && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT')) return true;
  // 2026-08-04: FOCUS is no longer the whole story. With an explicit Save, a typed-but-unsaved value can sit
  // in an UNFOCUSED field (tapping Save blurs it first, and an abandoned tap leaves it that way), and a
  // background repaint there would throw the edit away seconds before it is written. Unsaved work blocks the
  // poll whether or not the caret is still in it.
  return mgDirtyFieldIds(MGR_FIELD_IDS, mgActiveTournament()).length > 0;
}

// Copy the CURRENT announcement textarea value to the clipboard (mutating the CTA label as the confirm
// affordance — the house copy pattern, cf. tv2-share-registration + showCheckinToast's timed restore).
async function mgrCopyAnnouncement(btn) {
  // The announcement is no longer an inline textarea (§38 pick C) — read the live value from the tournament.
  const t = mgRegTournament();
  const text = t ? mgAnnouncementValue(t) : '';
  try {
    await navigator.clipboard.writeText(text);
    if (btn) btn.textContent = 'Copied for GroupMe!';
  } catch (_) {
    if (btn) btn.textContent = 'Long-press the text to copy';
  }
  clearTimeout(mgrCopyAnnouncement._t);
  mgrCopyAnnouncement._t = setTimeout(() => {
    const b = document.querySelector('[data-mgr-copy]');
    if (b) b.textContent = 'Copy for GroupMe';
  }, 2200);
}

// Toggle registration open/closed — the tdbSetTournamentFields write (+
// tdbRefreshTournaments), then a container-swap repaint (the switch is a button; no text input is focused).
// The switch IS the instruction, so it stays instant-apply (it is not behind the Save button) — but it is
// PROVEN like every other write on these screens. It used to swallow its error whole: a refused flip left the
// switch springing back with no explanation, which reads as a broken app rather than a denied write. The
// repaint runs on every path so the switch always shows the SERVER's state, then the status says why.
async function mgrToggleRegistration() {
  const t = mgRegTournament();
  if (!t || !state.isAdmin) return;
  const want = !t.registration_open;
  try {
    await tdbSetTournamentFields(t.id, { registration_open: want });
    const unsaved = await mgVerifyTournamentFields(t.id, { registration_open: want });
    repaintManage();
    if (unsaved.length) mgNoteStatus('mgr-status', MG_SAVE_FAILED, true);
  } catch (err) {
    console.warn('mgrToggleRegistration', err);
    repaintManage();
    mgNoteStatus('mgr-status', MG_SAVE_OFFLINE, true);
  }
}

// (The announcement is saved from the full-screen editor's Save button now — mgEditorSave — not on blur;
// its old blur-save helper was retired with the inline textarea in §38 pick C, 2026-07-12.)

// Save a venmo/buy-in/team-size field on blur — the SAFETY NET behind the explicit Save (a phone user
// navigates away mid-edit and expects the value to stick). It used to swallow its error entirely
// (`catch { console.warn }`) with no success feedback and NO failure feedback, so a refused Venmo write was
// indistinguishable from a saved one; it now runs the same proven engine as the button, restricted to the one
// blurred field, so a blur-save and a button-save can never report differently. Venmo keeps the existing
// behavior (stored as typed or null; the public pay button already guards to http(s)-only at render).
async function mgrSaveField(id) { return mgSaveScreenFields('registration', id); }

// ── Task 9: Event settings (session-10 pick R11) + Rules sheet (pick R11b) ───────────────────────────
// Mockups r10-manage/es-b (all-knobs-flat, two-across pairs) + ru-d (one-sheet rules editor). EVERY knob is
// flat and editable with NO locking (Mike declined guard rails — R11); the destructive redraw/reset live in
// the Pools/Bracket views, not here. Text/number fields save on BLUR through tdbSetTournamentFields (the
// focusout delegate → mgSaveSettingsField); the two booleans (win_by_2 / grand_final_reset) render as mg-sw
// switches and save on TOGGLE (mgToggleSettingsField). Numeric parses are defensive: a blank/NaN entry
// reverts the field + a quiet note, and leaves the column unchanged (no crash). Column names are the REAL
// tournaments.* columns (recon map §4): name, team_size, net_count, pool_target, pool_cap, bracket_target
// (+ match_cap kept in lockstep for NF-1 back-compat), bracket_cap, win_by_2, grand_final_reset, buy_in
// (TEXT). net_count is the ONE field that still routes through the ATOMIC re-net (migration 0031 /
// apply_net_count_change) when a tournament is mid pools/bracket — a plain write there would drift
// matches.net from net_count (the closed F7/F8 bug class); this keeps that invariant with no added lock.
function mgSettingsTournament() { return mgActiveTournament(); }

function buildMgSettingsHTML() {
  const t = mgSettingsTournament();
  const header = `<div class="pd-pagehdr">`
    + `<button type="button" class="pd-back" data-mgt-back aria-label="Back to Tournament">${PK_BACK_SVG}</button>`
    + `<div class="pd-htitle">Event settings</div></div>`;
  if (!t) return header + `<div class="pd-empty">No tournament to edit settings for yet.</div>`;
  // 2026-08-25 (Manage handoff, screen 39). Mike on the shipped version: "this entire page looks awful, fix
  // it." It was eleven bare underlined inputs in one wall — shouting caps labels, "POOL TO" and "POOL CAP"
  // with no hint of what either means, two switches wedged into a field row, and nothing anywhere saying
  // what a setting DOES. Now: four named groups on cards, ONE row per setting, every row a plain label with
  // a sentence under it, and the scoring knobs restated as the one line players read on a score card.
  // Every input id, the two data-mges-toggle switches and the data-mg-save hook are byte-identical to what
  // shipped — mgSaveScreenFields, the mges- input delegate, the focusout safety net, the toggle handler and
  // mgFieldWrite all key on them, so this is a re-layout and nothing else.
  //
  // A row's label is a <label for> wherever the row owns exactly one input. The two-input scoring rows and
  // the switch rows take a <span> instead: "for" can only point at one control, and a button is not one
  // (their inner .set-mini labels carry the association for the pair).
  const lb = (id, label, hint) =>
    `<label class="set-l" for="${id}">${escapeHTML(label)}<span class="set-h">${escapeHTML(hint)}</span></label>`;
  const sp = (label, hint) =>
    `<span class="set-l">${escapeHTML(label)}<span class="set-h">${escapeHTML(hint)}</span></span>`;
  const val = (v) => escapeHTMLText(v == null ? '' : String(v));
  // `aria` is set ONLY on the paired scoring fields: their visible label is the two-letter .set-mini chip,
  // so without it a screen reader announces "to", "cap", "to", "cap" and never says which game. The rows
  // that own a single input already get their name from the <label for>, and a second one would fight it.
  const num = (id, v, aria) =>
    `<input class="set-in set-num" id="${id}" type="number" min="1" inputmode="numeric"${aria ? ` aria-label="${escapeHTML(aria)}"` : ''} value="${val(v)}" />`;
  const txt = (id, v, extra) =>
    `<input class="set-in set-wide" id="${id}" type="text" autocomplete="off" ${extra}value="${val(v)}" />`;
  const pair = (id, mini, v, aria) => `<span class="set-pair"><label class="set-mini" for="${id}">${mini}</label>${num(id, v, aria)}</span>`;
  // a free-text value gets the label above it and the full width below — an address has nowhere to go on one line
  const stack = (id, label, hint, input) => `<div class="set-row is-stack">${lb(id, label, hint)}${input}</div>`;
  const unit = (id, label, hint, v, u) =>
    `<div class="set-row">${lb(id, label, hint)}<span class="set-ctl">${num(id, v)}<span class="set-u">${u}</span></span></div>`;
  const twin = (label, hint, aria, aId, aV, bId, bV) =>
    `<div class="set-row">${sp(label, hint)}<span class="set-ctl">${pair(aId, 'to', aV, aria + ' to')}${pair(bId, 'cap', bV, aria + ' cap')}</span></div>`;
  // The switch markup itself is UNCHANGED (2026-08-04: a switch is tap-to-apply, never behind Save — flipping
  // one is already the instruction). Only the row around it moved.
  const sw = (field, label, hint, on) =>
    `<div class="set-row">${sp(label, hint)}`
    + `<button type="button" class="mg-sw${on ? ' on' : ''}" data-mges-toggle="${field}" role="switch" aria-checked="${on ? 'true' : 'false'}" aria-label="${escapeHTML(label)}"></button></div>`;
  const bracketTo = (t.bracket_target != null ? t.bracket_target : t.match_cap);
  const winBy2 = (t.win_by_2 == null || !!t.win_by_2); // default on (matches the create/modal contract)
  const ruleSum = settingsRuleSummary(t);
  return header
    + `<p class="set-intro">These decide how the day runs. Scoring here sets the rule line on every score card.</p>`
    + `<div class="pl-sect">The basics</div><div class="set-card">`
      + stack('mges-name', 'Tournament name', 'What players see on the front page',
        txt('mges-name', t.name, 'autocapitalize="words" '))
      + unit('mges-teamsize', 'Team size', 'Players per side on the court', t.team_size, 'a side')
      + unit('mges-nets', 'Nets', 'Courts you have for the day', t.net_count, 'courts')
    + `</div>`
    + `<div class="pl-sect">Scoring</div><div class="set-card">`
      + twin('Pool play', 'First to the target, capped so a close game ends', 'Pool',
        'mges-pooltarget', t.pool_target, 'mges-poolcap', t.pool_cap)
      + twin('Bracket', 'Longer, because they decide the day', 'Bracket',
        'mges-brackettarget', bracketTo, 'mges-bracketcap', t.bracket_cap)
      + sw('win_by_2', 'Win by 2', 'A game ends on a two-point lead', winBy2)
      + sw('grand_final_reset', 'Grand final reset', 'The losers-bracket team gets a second championship game', !!t.grand_final_reset)
    + `</div>`
    // The four knobs above, restated in the grammar the score card prints. Derived (settingsRuleSummary, in
    // pure.js) rather than typed, so it cannot drift from the switch sitting directly above it. It drops a
    // clause whose target is unset, so on a row carrying none of them it comes back empty — and an empty
    // <p> would leave a 8px gap under the card advertising a sentence that is not there.
    + (ruleSum ? `<p class="set-sum">${escapeHTML(ruleSum)}</p>` : '')
    // COLUMN-GUARDED (migration 0058). The venue fields render only once the loaded rows carry both keys —
    // an input that cannot save is worse than an absent one (the 0057 rule). Home's Details card reads the
    // same two columns; until they exist it keeps its "Posted in GroupMe" row. The GROUP is inside the
    // guard with them: a named card with nothing in it would advertise a setting that is not there.
    + (tournamentHasVenue()
      ? `<div class="pl-sect">Where</div><div class="set-card">`
        + stack('mges-venue', 'Venue', 'The park players see on the front page',
          txt('mges-venue', t.venue, 'autocapitalize="words" placeholder="Woodmen Valley Park" '))
        + stack('mges-venueaddr', 'Address', 'What Copy address puts on their clipboard',
          txt('mges-venueaddr', t.venue_address, 'placeholder="1000 Woodmen Valley Rd, Colorado Springs, CO" '))
        + `</div>`
      : '')
    + `<div class="pl-sect">Money</div><div class="set-card">`
      + `<div class="set-row">${lb('mges-buyin', 'Buy-in', 'Per team, as free text')}`
      + `<input class="set-in set-money" id="mges-buyin" type="text" autocomplete="off" placeholder="$80 a team" value="${val(t.buy_in)}" /></div>`
    + `</div>`
    // 2026-08-04: one Save for the whole sheet — every dirty knob in ONE write. Task 4 (2026-08-25) gave the
    // line beside it words: "Unsaved changes" the moment a field differs, "Saved" at rest.
    + `<div class="set-foot">${mgSaveBtnHTML('settings')}`
    + `<p class="mgr-status" id="mges-status" role="status" aria-live="polite">Saved</p></div>`;
}

// The pencil the round draws on every "this is yours to change" pill (design screens/mgts-rules-view.html:34).
// One const, so the rules header pill, the per-section pills and the empty state's Write pill can never drift.
const MG_PENCIL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

// The Rules sheet. §38 pick C (2026-07-12) made the VIEW the public render with ONE full-screen editor
// behind it; the Manage handoff (2026-08-25, Task 7) gave that view the card look Mike asked for — his
// banner on the screen was "this page needs help, make it look like its editable, right now its really
// bland". A flat bulleted document with one 13px "Edit" link in the header said nothing about who owned
// the words. Now every section is a card with its own Edit pill.
//
// The pill does NOT open an inline field. Spec decision 2: the card LOOK, the SAME one editor. Tapping a
// section's Edit opens the existing full-screen editor with the caret already on that section (the offset
// comes from rulesToSections, counted in the stored text). "Edit all" passes no options, so it opens the
// whole document with the caret at the END, exactly as the header Edit has since 2026-07-12;
// "+ Add a section" opens it with a "## New section" scaffold appended. The design's inline editing is
// deliberately NOT ported: it never saved anything, and its own serializer rewrote numbered lists as
// bullets — one editor and one serializer is the whole point.
//
// Empty rules → the honest admin prompt (never the public "coming soon" stub), now inside a single card so
// the page still reads as the same object it will become.
function buildMgRulesHTML() {
  const t = mgSettingsTournament();
  const backBtn = `<button type="button" class="pd-back" data-mgt-back aria-label="Back to Tournament">${PK_BACK_SVG}</button>`;
  if (!t) {
    return `<div class="pd-pagehdr">${backBtn}<div class="pd-htitle">Rules sheet</div></div>`
      + `<div class="pd-empty">No tournament to edit rules for yet.</div>`;
  }
  const header = `<div class="pd-pagehdr">${backBtn}`
    + `<div class="pd-htitle">Rules sheet</div>`
    + `<button type="button" class="pd-hdr-edit rlv-hedit" data-mgru-edit>${MG_PENCIL_SVG}Edit all</button></div>`;
  const foot = `<p class="rlv-foot">Saved changes show up on the players' Rules page straight away.</p>`;
  const sections = rulesToSections(typeof t.rules === 'string' ? t.rules : '');
  if (!sections.length) {
    // The prompt keeps its own tap-anywhere hook (a blank editor) and gains the pill that seeds the first
    // section, so the empty page offers the same two doors the written one does.
    return header + `<div class="rl-body mgru-view"><div class="rlv-card">`
      + `<div class="mgru-empty" data-mgru-edit><div class="mgru-empty-h">No rules yet</div>`
      + `<div class="mgru-empty-s">Tap Write to start the house rules. Players read them on the Rules page the moment you save.</div>`
      + `<button type="button" class="rlv-edit" data-rlv-add>${MG_PENCIL_SVG}Write</button></div>`
      + `</div>${foot}</div>`;
  }
  const cards = sections.map((s) => `<div class="rlv-card${s.head ? '' : ' is-note'}">`
    + `<div class="rlv-hd">${s.head ? `<div class="rl-h">${escapeHTML(s.head)}</div>` : ''}`
    + `<button type="button" class="rlv-edit" data-rlv-edit="${s.startOffset}">${MG_PENCIL_SVG}Edit</button></div>`
    + `<div class="rlv-lines rl-body">${s.bodyHTML}</div></div>`).join('');
  return header
    + `<p class="rlv-intro">This is the page players read. Every section here is yours to edit. Tap one to change its wording or bullets.</p>`
    + `<div class="rl-body mgru-view">${cards}`
    + `<button type="button" class="rlv-add" data-rlv-add><span class="rlv-plus">+</span> Add a section</button>`
    + `${foot}</div>`;
}

// True when the Event settings view has an in-progress edit (a focused input in #tab-manage) the background
// poll must not clobber. Extends the Task 5 registration dirty-guard.
function manageSettingsDirty() {
  const panel = document.getElementById('tab-manage');
  if (!panel) return false;
  const ae = document.activeElement;
  if (ae && panel.contains(ae) && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return true;
  // 2026-08-04: same widening as manageRegDirty — a typed-but-unsaved settings field is protected whether or
  // not it still holds focus, because tapping Save blurs it a beat before the write goes out.
  return mgDirtyFieldIds(MGES_FIELD_IDS, mgActiveTournament()).length > 0;
}
// Task 8 of the 2026-08-25 round: the OPEN Pool controls. An inline nets field and a move picker are both
// unsaved work the 15s poll would throw away — the picker holds a decision with no text in it at all, so a
// focus test alone would miss it. Same shape as manageSettingsDirty / manageTeamAddDirty, minus the DOM:
// these two live in module state, so they are true whether or not anything on the panel holds the caret.
function manageNetsDirty() {
  return !!(mgpNetsEditPoolId || mgpMoveTeamId);
}
// The Rules view (§38 pick C) is now rendered content with no inline input — editing happens in the
// body-appended overlay (poll-clobber-immune). Nothing on the panel needs protecting from a background
// repaint, so this is always false (kept so the partialRender Task-9 guard call site stays intact).
function manageRulesDirty() {
  return false;
}

// Save one Event-settings field on blur — the SAFETY NET behind this screen's explicit Save, running the same
// proven engine restricted to the one blurred field. It already noted 'Saved' on success and a friendly line
// on a thrown error, but it never READ THE ROW BACK, so a silently-refused UPDATE (error:null over zero rows)
// still printed "Saved". The per-field parse rules are unchanged and now live in mgFieldWrite: numeric fields
// revert the input + say why on a blank/NaN, name must be non-empty, pool_cap/bracket_cap accept blank → null,
// buy_in is free text, bracket_target keeps match_cap in lockstep, and net_count still routes through the
// atomic re-net during pools/bracket. Never repaints (blur already left the field).
async function mgSaveSettingsField(id) { return mgSaveScreenFields('settings', id); }

// Toggle a boolean setting (win_by_2 / grand_final_reset). The switch is a button (no text field focused) so
// a repaint is safe and reflects the new state. Flipping one IS the instruction, so it keeps applying on tap
// rather than waiting behind Save — but like mgrToggleRegistration it no longer swallows the failure: the
// write is read back, the repaint shows the server's state, and the status line says why it sprang back.
async function mgToggleSettingsField(field) {
  const t = mgSettingsTournament();
  if (!t || !state.isAdmin || (field !== 'win_by_2' && field !== 'grand_final_reset')) return;
  const cur = (field === 'win_by_2') ? (t.win_by_2 == null || !!t.win_by_2) : !!t.grand_final_reset;
  try {
    await tdbSetTournamentFields(t.id, { [field]: !cur });
    const unsaved = await mgVerifyTournamentFields(t.id, { [field]: !cur });
    repaintManage();
    if (unsaved.length) mgNoteStatus('mges-status', MG_SAVE_FAILED, true);
  } catch (err) {
    console.warn('mgToggleSettingsField', err);
    repaintManage();
    mgNoteStatus('mges-status', MG_SAVE_OFFLINE, true);
  }
}

// Save the Rules sheet on the explicit CTA — writes tournaments.rules so the public Rules page updates
// immediately, resets the dirty-guard baseline, and shows the quiet Saved status. No repaint (the textarea
// keeps focus/scroll; a repaint would rebuild it).
// ── Manage full-screen editor (§38 pick C, 2026-07-12) ─────────────────────────────────────────────────
// Mike: the Rules sheet + Registration announcement should "look like the public page, click anywhere to
// edit, hit Save." Locked model = rendered VIEW → tap → a distraction-free FULL-SCREEN writing surface (nav
// hidden) → Save → back to the view. Body-appended like .auth-page so a background sync (partialRender) can
// never wipe an open editor, and its opaque stone bg covers the fixed watermark + nav. kind: 'rules' | 'ann'.
let mgEditorKind = null;

function closeManageEditor() {
  mgEditorKind = null;
  const el = document.getElementById('mged-page');
  if (el) el.remove();
}

// opts (2026-08-25, Task 7) — both optional, and every existing one-argument caller behaves exactly as before:
//   caret   a character offset in the stored text; the editor opens with the caret there, scrolled into view.
//           That is how a rules card's Edit pill opens THIS editor "at" its section.
//   append  text pushed onto the end of the document, caret left after it — how "+ Add a section" seeds a
//           new "## " block. The document's trailing whitespace is trimmed first so the scaffold's own blank
//           line is the only gap, and an EMPTY document drops that leading gap entirely rather than opening
//           with two blank lines above the first word.
function openManageEditor(kind, opts) {
  const t = mgActiveTournament();
  if (!t || !state.isAdmin) return;
  const o = opts || {};
  const isRules = kind === 'rules';
  const initial = isRules ? ((typeof t.rules === 'string') ? t.rules : '') : mgAnnouncementValue(t);
  closeManageEditor();               // clears any prior editor + resets mgEditorKind
  mgEditorKind = isRules ? 'rules' : 'ann';
  const el = document.createElement('div');
  el.id = 'mged-page';
  el.className = 'mged-page';
  const placeholder = isRules
    ? '## Format&#10;- 4s co-ed · 1 guy + 1 girl on the court&#10;- Pool play to 15, cap 20'
    : 'July 2026 tournament is here! Registration is open. Register at athletic-specimen.com';
  const hint = isRules
    ? '## makes a heading · - makes a bullet · players see it the moment you Save'
    : 'This is the text you Copy for GroupMe.';
  el.innerHTML = `
    <div class="mged-bar">
      <button type="button" class="mged-cancel" id="mged-cancel">Cancel</button>
      <div class="mged-title">${isRules ? 'Rules' : 'Announcement'}</div>
      <button type="button" class="mged-save" id="mged-save">Save</button>
    </div>
    <div class="mged-body">
      <textarea class="mged-ta" id="mged-ta" spellcheck="true" autocapitalize="sentences" aria-label="${isRules ? 'Rules sheet' : 'Registration announcement'}" placeholder="${placeholder}">${escapeHTML(initial)}</textarea>
      <p class="mged-hint">${hint}</p>
      <p class="mged-status" id="mged-status" role="status" aria-live="polite"></p>
    </div>`;
  document.body.appendChild(el);
  el.querySelector('#mged-cancel').addEventListener('click', closeManageEditor);
  el.querySelector('#mged-save').addEventListener('click', () => { void mgEditorSave(); });
  const ta = el.querySelector('#mged-ta');
  // The append happens NOW, not in the focus timeout: mgEditorSave reads the textarea, so the document has
  // to be complete the moment the overlay is on screen.
  const append = (typeof o.append === 'string' && o.append) ? o.append : '';
  if (ta && append) {
    const kept = String(ta.value == null ? '' : ta.value).replace(/\s+$/, '');
    ta.value = kept ? kept + append : append.replace(/^\n+/, '');
  }
  // Where the caret lands: after an appended scaffold, at the requested offset, else the END (ready to type,
  // never select-all — the behaviour every existing caller has had since 2026-07-12).
  const want = append ? null : (Number.isFinite(Number(o.caret)) && o.caret != null ? Number(o.caret) : null);
  setTimeout(() => {
    if (!ta) return;
    const n = ta.value.length;
    const at = want == null ? n : Math.max(0, Math.min(want, n));
    // The range is set BEFORE focus on purpose: focusing a textarea scrolls its caret into view, so this
    // ordering is what makes a deep section actually visible rather than merely selected.
    try { ta.setSelectionRange(at, at); } catch (_) {}
    ta.focus();
    // …and lift that line toward the top of the box, so the section opens with its own lines under it
    // instead of pinned to the bottom edge. Skipped whenever the line height is not a resolvable number.
    try {
      const cs = (typeof window !== 'undefined' && window.getComputedStyle) ? window.getComputedStyle(ta) : null;
      const lh = cs ? parseFloat(cs.lineHeight) : NaN;
      if (at < n && Number.isFinite(lh) && lh > 0) {
        const line = ta.value.slice(0, at).split('\n').length - 1;
        ta.scrollTop = Math.max(0, (line * lh) - (ta.clientHeight / 3));
      }
    } catch (_) {}
  }, 60);
}

// Persist the open editor → refresh → close → repaint the underlying Manage view (now showing the update).
// On failure keep the overlay open with the typed text intact + a friendly inline status.
async function mgEditorSave() {
  const t = mgActiveTournament();
  const ta = document.getElementById('mged-ta');
  if (!t || !ta || !state.isAdmin) return;
  const val = String(ta.value == null ? '' : ta.value);
  const field = mgEditorKind === 'rules' ? { rules: val } : { announcement: val };
  const status = document.getElementById('mged-status');
  const saveBtn = document.getElementById('mged-save');
  if (saveBtn) { saveBtn.textContent = 'Saving…'; saveBtn.disabled = true; }
  if (status) status.textContent = '';
  try {
    await tdbSetTournamentFields(t.id, field);
    await tdbRefreshTournaments();
    closeManageEditor();
    repaintManage();
  } catch (err) {
    console.warn('mgEditorSave', err);
    if (saveBtn) { saveBtn.textContent = 'Save'; saveBtn.disabled = false; }
    if (status) status.textContent = 'Could not save. Check the connection and try again.';
  }
}

// ── Task 10: Close out — champion + end/reopen (session-10 pick R12, THE June fix, mockup co-a) ─────────
// Closing a tournament used to be an accident of drift; here it's DELIBERATE. Active (pools/bracket): a matte-
// gold champion card seeded by computeChampion (or "PICK THE CHAMPION" when the bracket hasn't decided) with a
// CHANGE picker, then one primary "End the tournament" CTA + an honest note. Completed: the recorded champion
// (from the STORED champion_team_id) + a quiet "Reopen the tournament" row. Setup: honest empty. The writes go
// through the 0050 SECURITY DEFINER RPCs (tdbCloseTournament / tdbReopenTournament) — guarded for the pre-apply
// window (friendly notice, never a fallback status write). Gold values reuse the champions-strip tokens
// (--gold*, §51 matte). The picker is body-level (poll-clobber-immune). mgCloseoutChampId survives the swap.
const MGCO_TROPHY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M6 4h12v5a6 6 0 0 1-12 0z"/></svg>';

// The tournament's bracket (main-phase) matches — the input computeChampion needs for its suggestion.
function mgCloseoutMainMatches() {
  return (state.tournamentMatches || []).filter((m) => m && m.phase === 'main');
}

// The champion the admin will RECORD on close, plus how to label it. undefined mgCloseoutChampId follows the
// computed bracket suggestion; a team-id string is a manual CHANGE override; '' is an explicit "no champion".
// { teamId, name, eyebrow, explicit } — teamId null = none. Consumed by the card, the End confirm, and the
// picker's initial highlight.
function mgCloseoutChampionChoice(teams, mainMatches) {
  if (mgCloseoutChampId === '') return { teamId: null, name: '', eyebrow: 'NO CHAMPION', explicit: true };
  if (typeof mgCloseoutChampId === 'string' && mgCloseoutChampId) {
    const tm = (teams || []).find((x) => x && String(x.id) === String(mgCloseoutChampId));
    if (tm) return { teamId: tm.id, name: tm.name || '', eyebrow: 'YOUR PICK', explicit: true };
  }
  const c = computeChampion(mainMatches || [], teams || []);
  if (c && c.teamId) return { teamId: c.teamId, name: c.name || '', eyebrow: 'FROM THE BRACKET', explicit: false };
  return { teamId: null, name: '', eyebrow: 'PICK THE CHAMPION', explicit: false };
}

function buildMgCloseoutHTML() {
  const t = mgActiveTournament();
  const header = `<div class="pd-pagehdr">`
    + `<button type="button" class="pd-back" data-mgt-back aria-label="Back to Tournament">${PK_BACK_SVG}</button>`
    + `<div class="pd-htitle">Close out</div></div>`;
  if (!t) return header + `<div class="pd-empty">No tournament to close yet.</div>`;
  const status = t.status;
  // Setup — no games, so there is no champion to crown, but there IS something to do (2026-08-04). This used
  // to be a dead end that offered nothing: an event created and never played could only be Reset (which leaves
  // it in setup) or Deleted (which destroys its teams and their paid flags), so organizers had no way to
  // simply retire one — and a stale setup row keeps advertising itself on the public registration surface.
  // The action is CONSTRUCTIVE and reversible (tdbEndTournamentUnplayed → reopen), so it is deliberately NOT
  // Danger-zone grammar: the ordinary primary CTA the active branch below uses, one tap, no typed name. The
  // note says what survives, the way the Reset control does.
  if (status === 'setup') {
    const nSetupTeams = (state.tournamentTeams || []).length;
    const kept = nSetupTeams
      ? `Your ${nSetupTeams} registered team${nSetupTeams === 1 ? '' : 's'}, their payments, the rosters and the rules sheet are kept.`
      : 'Nothing is deleted.';
    return header
      + `<div class="pd-empty">No games were played, so there is no champion to crown.</div>`
      + `<div class="pl-sect">End without playing</div>`
      + `<button type="button" class="mgt-cta" data-mgco-endunplayed>End this tournament without playing it</button>`
      + `<div class="mgt-note">Moves it to Past tournaments and closes registration. ${kept} You can reopen it from there if you need it back.</div>`;
  }
  const teams = state.tournamentTeams || [];
  // Completed — show the recorded champion (stored champion_team_id) and offer a reopen.
  if (status === 'completed') {
    const stored = t.champion_team_id
      ? teams.find((x) => x && String(x.id) === String(t.champion_team_id))
      : null;
    const champName = stored ? (stored.name || '') : '';
    // 2026-07-26: scoring the grand final auto-completes the tournament server-side
    // (0005_c21_rpc_submit_match_score.sql:65) WITHOUT recording a champion, and close_tournament then
    // refuses to run because the status is no longer pools/bracket (0050_closeout.sql:53). That left the
    // organizer staring at "No champion recorded" with only a Reopen button, unable to crown the team the
    // bracket already knew had won. When nothing is stored, offer the derived champion (or the picker) and
    // a one-tap record that reopens and re-closes properly.
    const choice = stored ? null : mgCloseoutChampionChoice(teams, mgCloseoutMainMatches());
    const eyebrow = stored ? 'Champion' : (choice.teamId ? 'WON THE BRACKET, NOT RECORDED' : 'NO CHAMPION RECORDED');
    const value = stored
      ? escapeHTML(champName)
      : (choice.teamId ? escapeHTML(choice.name) : 'Pick the winning team');
    const card = `<div class="pl-sect">Champion</div>`
      + `<div class="mgco-card">`
        + `<span class="mgco-ic">${MGCO_TROPHY}</span>`
        + `<div class="mgco-cn"><div class="mgco-eyebrow">${eyebrow}</div>`
          + `<div class="mgco-name">${value}</div></div>`
        + (stored ? '' : `<button type="button" class="mgco-change" data-mgco-change>CHANGE</button>`)
      + `</div>`;
    // 2026-08-04 WORDING FIX (not a restructure). This note used to open "The tournament finished without a
    // champion being written down." That sentence became FALSE the moment a tournament could be ended without
    // playing it (the setup branch above): such an event lands here with no champion and no games, and the
    // note would claim it finished. It is stated as the plain fact now, which is true for BOTH the C80 case
    // (a bracket that finished and forgot its winner) and an event that never played.
    // Deliberately NOT branched on "has no matches": an event whose matches have not LOADED yet looks
    // identical to one that never played, so a branch there would put a confident false claim on the screen
    // during the load window. One sentence that is true either way beats a guess about which case this is.
    const record = stored ? '' : (`<button type="button" class="mgt-cta" data-mgco-record>`
        + `${choice.teamId ? 'Record ' + escapeHTML(choice.name) + ' as champion' : 'Record the champion'}</button>`
      + `<div class="mgt-note">No champion is written down for this tournament. This records one and closes it back up.</div>`);
    const reopen = `<div class="pl-sect">Reopen</div>`
      + `<button type="button" class="mgco-reopen" data-mgco-reopen>Reopen the tournament</button>`
      + `<div class="mgt-note">It's in Past tournaments now. Reopen to fix a score or re-crown. The recorded champion stays until you close again.</div>`;
    return header + card + record + reopen;
  }
  // Active (pools / bracket) — the champion card (bracket suggestion, your pick, or "pick one") + End CTA.
  const choice = mgCloseoutChampionChoice(teams, mgCloseoutMainMatches());
  const value = choice.teamId
    ? escapeHTML(choice.name)
    : (choice.explicit ? 'No champion recorded' : 'Choose the winning team');
  const card = `<div class="pl-sect">Champion</div>`
    + `<div class="mgco-card">`
      + `<span class="mgco-ic">${MGCO_TROPHY}</span>`
      + `<div class="mgco-cn"><div class="mgco-eyebrow">${choice.eyebrow}</div><div class="mgco-name">${value}</div></div>`
      + `<button type="button" class="mgco-change" data-mgco-change>CHANGE</button>`
    + `</div>`;
  const cta = `<button type="button" class="mgt-cta" data-mgco-end>End the tournament</button>`
    + `<div class="mgt-note">Moves it to Past tournaments · registration and scoring close · you can reopen from there</div>`;
  return header + card + cta;
}

// The CHANGE picker sheet CONTENT (pure string; openMgChampionPicker wraps it in the body-level scrim). Lists
// every team as a pickable row + a "No champion" option; the current pick carries mgco-pick-on.
function buildMgChampionPickerHTML(teams, selectedId) {
  const CHECK = '<svg class="mgco-pickck" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-9"/></svg>';
  const rows = (teams || []).map((tm) => {
    const on = String(selectedId) === String(tm.id);
    return `<button type="button" class="mgco-pickrow${on ? ' mgco-pick-on' : ''}" data-mgco-pick="${escapeHTMLText(String(tm.id))}">`
      + `<span class="mgco-pickname">${escapeHTML(tm.name || 'Team')}</span>${on ? CHECK : ''}</button>`;
  }).join('');
  const noneOn = selectedId === '' || selectedId == null;
  const noneRow = `<button type="button" class="mgco-pickrow mgco-pickrow-none${noneOn ? ' mgco-pick-on' : ''}" data-mgco-pick="">`
    + `<span class="mgco-pickname">No champion</span>${noneOn ? CHECK : ''}</button>`;
  return `<div class="pd-reg-grip"></div>`
    + `<div class="mgts-head"><div class="mgts-eyebrow">Pick the champion</div>`
    + `<button type="button" class="pd-reg-sheetx" data-mgco-pickclose aria-label="Close">`
    + `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>`
    + `<div class="mgco-picklist">${rows}${noneRow}</div>`;
}

function closeMgChampionPicker() { const el = document.getElementById('mgco-picker'); if (el) el.remove(); }

// Open the body-level champion picker. Initial highlight = the current effective choice (the computed
// suggestion when nothing has been overridden). Tapping a row sets mgCloseoutChampId and repaints the card.
function openMgChampionPicker() {
  if (!state.isAdmin) return;
  const teams = state.tournamentTeams || [];
  const choice = mgCloseoutChampionChoice(teams, mgCloseoutMainMatches());
  const sel = (mgCloseoutChampId === undefined) ? (choice.teamId || '') : mgCloseoutChampId;
  closeMgChampionPicker();
  const scrim = document.createElement('div');
  scrim.id = 'mgco-picker';
  scrim.className = 'pd-reg-scrim';
  scrim.setAttribute('role', 'dialog');
  scrim.setAttribute('aria-modal', 'true');
  scrim.setAttribute('aria-label', 'Pick the champion');
  scrim.innerHTML = `<div class="pd-reg-sheet">${buildMgChampionPickerHTML(teams, sel)}</div>`;
  document.body.appendChild(scrim);
  scrim.addEventListener('click', (ev) => {
    if (ev.target === scrim) { closeMgChampionPicker(); return; }           // backdrop dismiss (keeps current pick)
    if (ev.target.closest('[data-mgco-pickclose]')) { closeMgChampionPicker(); return; }
    const row = ev.target.closest('[data-mgco-pick]');
    if (!row) return;
    mgCloseoutChampId = row.getAttribute('data-mgco-pick'); // '' = explicit none; a team-id = a pick
    closeMgChampionPicker();
    repaintManage();
  });
}

// End the tournament: confirm (naming the champion when there is one) → close_tournament RPC → refresh + repaint
// (the sub-hub, the Manage lead, and the public pages all pick up 'completed' via the 15s poll). Resets the
// override so a future tournament starts from its own computed suggestion.
async function mgCloseoutEnd() {
  if (!state.isAdmin) return;
  const t = mgActiveTournament();
  if (!t) return;
  const teams = state.tournamentTeams || [];
  const choice = mgCloseoutChampionChoice(teams, mgCloseoutMainMatches());
  const champName = choice.teamId ? choice.name : null;
  const msg = champName
    ? `Crown ${champName} and end the tournament? It moves to Past tournaments. Registration and scoring close. You can reopen it.`
    : 'End the tournament with no champion recorded? It moves to Past tournaments. Registration and scoring close. You can reopen it.';
  const ok = await appConfirm({ title: 'End the tournament', message: msg, confirmText: 'End the tournament' });
  if (!ok) return;
  try {
    await tdbCloseTournament(t.id, choice.teamId || null);
    mgCloseoutChampId = undefined;
    await tdbRefreshTournaments();
  } catch (err) {
    appNotice({ title: 'Could not end the tournament', message: (err && err.message) || 'Try again.' });
  }
  repaintManage();
}

// End a tournament that never played (2026-08-04) — the setup branch's action. ONE plain confirm naming the
// event and the team count, then tdbEndTournamentUnplayed and its read-back. Deliberately NOT the type-the-
// name grammar the Danger zone uses: nothing is destroyed here and it reopens, so demanding typing would
// teach that this is as serious as Delete. It is still worth a confirm — ending an event with paid teams in
// it is not a tap to make by accident — so the dialog is danger-styled and the sentence says what is kept.
// On a failed write NOTHING changes client-side: the notice carries the read-back's own plain-language error
// and the screen stays exactly as it was, still offering the action.
async function mgCloseoutEndUnplayed() {
  if (!state.isAdmin) return;
  const t = mgActiveTournament();
  if (!t) return;
  const nm = (t.name || '').trim() || 'this tournament';
  // Only count teams that actually belong to THIS tournament — state.tournamentTeams is the active
  // tournament's list, so a mismatched id means the count is not ours to quote (same guard as mgTournamentDelete).
  const nTeams = (state.activeTournamentId === t.id && Array.isArray(state.tournamentTeams))
    ? state.tournamentTeams.length : 0;
  const kept = nTeams
    ? ` Its ${nTeams} registered team${nTeams === 1 ? '' : 's'} and their payments are kept.`
    : ' Nothing is deleted.';
  const ok = await appConfirm({
    title: 'End without playing',
    message: `This ends ${nm} without any games being played.${kept} It moves to Past tournaments and registration closes. You can reopen it.`,
    confirmText: 'End the tournament',
    danger: true,
  });
  if (!ok) return;
  try {
    await tdbEndTournamentUnplayed(t);
  } catch (err) {
    appNotice({ title: 'Could not end the tournament', message: (err && err.message) || 'Try again.' });
    return;
  }
  mgCloseoutChampId = undefined;
  await tdbRefreshTournaments();
  repaintManage();
  appNotice({ title: 'Tournament ended', message: `${nm} is in Past tournaments. Its teams and their payments are still there.` });
}

// Reopen a completed tournament: confirm → reopen_tournament RPC (restores bracket/pools, KEEPS the champion)
// → refresh + repaint.
// 2026-07-26 (C80): record a champion on a tournament that auto-completed without one. close_tournament
// only accepts a tournament in pools/bracket (0050_closeout.sql:53), so this reopens first, then closes with
// the champion. If the close leg fails the tournament is left REOPENED, which is visible and recoverable
// (the normal End CTA comes back) rather than silently wrong — and the error says so.
async function mgCloseoutRecordChampion() {
  if (!state.isAdmin) return;
  const t = mgActiveTournament();
  if (!t) return;
  const teams = state.tournamentTeams || [];
  const choice = mgCloseoutChampionChoice(teams, mgCloseoutMainMatches());
  if (!choice.teamId) {
    appNotice({ title: 'Pick a champion first', message: 'Tap CHANGE and choose the winning team, then record it.' });
    return;
  }
  const ok = await appConfirm({
    title: 'Record the champion',
    message: `Record ${choice.name} as the champion of ${t.name || 'this tournament'}? It stays in Past tournaments.`,
    confirmText: 'Record champion',
  });
  if (!ok) return;
  let reopened = false;
  try {
    await tdbReopenTournament(t.id);
    reopened = true;
    await tdbCloseTournament(t.id, choice.teamId);
    mgCloseoutChampId = undefined;
    await tdbRefreshTournaments();
    repaintManage();
    appNotice({ title: 'Champion recorded', message: `${choice.name} is on the books.` });
  } catch (err) {
    await tdbRefreshTournaments();
    repaintManage();
    appNotice({
      title: 'Could not record the champion',
      message: ((err && err.message) || 'Try again.') + (reopened ? ' The tournament is open again, so you can end it with the champion from here.' : ''),
    });
  }
}

async function mgCloseoutReopen() {
  if (!state.isAdmin) return;
  const t = mgActiveTournament();
  if (!t) return;
  const ok = await appConfirm({
    title: 'Reopen the tournament',
    message: 'Reopen it to fix a score or re-crown? It leaves Past tournaments and scoring opens back up. The recorded champion stays unless you close again with a different one.',
    confirmText: 'Reopen',
  });
  if (!ok) return;
  try {
    await tdbReopenTournament(t.id);
    await tdbRefreshTournaments();
  } catch (err) {
    appNotice({ title: 'Could not reopen', message: (err && err.message) || 'Try again.' });
  }
  repaintManage();
}

// ── Task 6: Teams & payment (session-10 pick R8) — the list + the body-level full-edit team sheet ─────
// Mockup r10-manage/tp-a. The list (mgtView==='teams') is one flat row per registered team: name + a
// first-names roster preview + a PAID / TAP-WHEN-PAID tag that IS the paid toggle (tap the tag, don't open
// the sheet) + a chevron; the ROW opens the sheet; a dashed "Add a team yourself" prompts for a name. The
// sheet (openMgTeamSheet) lives on document.body — OUTSIDE #tab-manage — so the 15s poll / partialRender can
// never wipe a half-typed roster (same discipline as openJoinSheet). It edits name (tdbRenameTeam), the full
// stacked roster (tdbSetTeamRoster), paid (tdbSetTeamPaid), pool when pools exist (tdbMoveTeamToPool),
// withdraw when mid-play (tdbWithdrawTeam), and a type-DELETE remove (tdbDeleteTeam).

// The team row from live state (string-id match — team ids are uuids, data attrs are strings).
function mgFindTeam(teamId) {
  return (state.tournamentTeams || []).find((t) => t && String(t.id) === String(teamId)) || null;
}
// A team's roster names for display. Prefer team_members (loaded for ANY signed-in account — admins too —
// carrying every team's members, so an edited-but-freshly-synced roster shows real linked players); fall
// back to the teams.roster jsonb when members aren't loaded or this team has none.
function mgTeamRosterNames(team) {
  if (!team) return [];
  const members = Array.isArray(state.teamMembers)
    ? state.teamMembers.filter((c) => c && String(c.teamId) === String(team.id)).map((c) => c.name)
    : [];
  const src = members.length ? members : (Array.isArray(team.roster) ? team.roster : []);
  return src.map((n) => String(n || '').trim()).filter(Boolean);
}
// First names only, for the compact list preview ("Riley · Sam · Jo · Casey").
function mgTeamFirstNames(team) {
  return mgTeamRosterNames(team).map((n) => n.split(/\s+/)[0]).filter(Boolean);
}

// The Teams & payment LIST (mockup tp-a). Header (back to the sub-hub) + "N in · N paid" + a row per team.
function buildMgTeamsHTML() {
  const teams = Array.isArray(state.tournamentTeams) ? state.tournamentTeams : [];
  const paidCt = teams.filter((x) => x && x.paid).length;
  const header = `<div class="pd-pagehdr">`
    + `<button type="button" class="pd-back" data-mgt-back aria-label="Back to Tournament">${PK_BACK_SVG}</button>`
    + `<div class="pd-htitle">${escapeHTML(MGT_SUB_TITLES.teams)}</div></div>`;
  const add = `<button type="button" class="pk-add" data-mgt-view="teamadd">${PK_PLUS_SVG}Add a team yourself</button>`;
  if (!teams.length) {
    return header + `<div class="pd-empty">No teams yet. Teams land here as they register.</div>` + add;
  }
  const label = `<div class="pl-sect">${teams.length} in · ${paidCt} paid</div>`;
  const rows = teams.map((tm) => {
    const first = mgTeamFirstNames(tm);
    const preview = first.length ? escapeHTML(first.join(' · ')) : 'No players yet';
    const paid = !!tm.paid;
    const idAttr = escapeHTMLText(String(tm.id));
    // Round 2026-08-03: the row no longer carries the PAID / TAP WHEN PAID toggle (a hit-sized button sat
    // right next to the chevron that opens the team). It only REPORTS state now — the toggle moved into the
    // team popup, next to the fee it settles.
    return `<div class="mgtp-row" data-mgtp-team="${idAttr}">
        <div class="mgtp-tn"><div class="mgtp-nm">${escapeHTML(tm.name || 'Team')}</div><div class="mgtp-rs">${preview}</div></div>
        <span class="mgv-pmeta ${paid ? 'is-paid' : 'is-unpaid'}">${paid ? 'Paid' : 'Unpaid'}</span>
        ${MG_CHEV}
      </div>`;
  }).join('');
  return header + label + rows + add;
}

// The full-edit team sheet CONTENT (pure string; openMgTeamSheet wraps it in the body-level scrim). Reads
// the lead tournament's status + pools from state so move-to-pool / withdraw only appear when they apply.
function buildMgTeamSheetHTML(team) {
  if (!team) return '';
  const t = mgActiveTournament();
  const status = t ? t.status : 'setup';
  const midPlay = status === 'pools' || status === 'bracket';
  const pools = Array.isArray(state.tournamentPools) ? state.tournamentPools : [];
  const paid = !!team.paid;
  const names = mgTeamRosterNames(team);
  const rosterInit = names.join('\n'); // change-detection snapshot (newline sep — never appears in a name)
  const rlines = names.concat(['']).map((n, i) =>
    `<input class="mgts-rline" type="text" autocomplete="off" autocapitalize="words" spellcheck="false"`
    + ` placeholder="${i >= names.length ? 'Add a player' : ''}" value="${escapeHTMLText(n)}" aria-label="Player ${i + 1}" />`).join('');
  const head = `<div class="pd-reg-grip"></div>`
    + `<div class="mgts-head"><div class="mgts-eyebrow">Edit team</div>`
    + `<button type="button" class="pd-reg-sheetx" data-mgts="close" aria-label="Close">`
    + `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>`;
  const nameFld = `<label class="pk-fl" for="mgts-name">Team name</label>`
    + `<input class="pk-fv mgts-name" id="mgts-name" type="text" autocomplete="off" autocapitalize="words" spellcheck="false"`
    + ` value="${escapeHTMLText(team.name || '')}" data-init="${escapeHTMLText(team.name || '')}" />`;
  const rosterBlock = `<div class="pl-sect">Roster</div>`
    + `<div class="mgts-roster" data-roster-init="${escapeHTMLText(rosterInit)}">${rlines}</div>`;
  const paidRow = `<div class="mgts-row"><div class="mg-rb"><div class="mg-rn">Paid</div>`
    + `<div class="mg-rs">Tap to mark the buy-in received</div></div>`
    + `<button type="button" class="mg-sw${paid ? ' on' : ''}" data-mgts="paid" role="switch" aria-checked="${paid ? 'true' : 'false'}" aria-label="Paid"></button></div>`;
  // C101 review wave (2026-08-26): the chips draw exactly what move_team_to_pool will accept, and nothing
  // more. Past pool play nothing moves; a move is refused when EITHER side holds a final or a live game,
  // so a playing pool is not offered and a team whose OWN pool is playing is offered no destination at
  // all; and the team's CURRENT chip is always drawn, on and INERT, because it says where the team is and
  // a tap on it is a no-op the server answers 0 to. When nothing can move, the card says why in the
  // sentence the pool card already ships.
  const allMatches = Array.isArray(state.tournamentMatches) ? state.tournamentMatches : [];
  const here = String(team.pool_id || '');
  const canMovePool = (status === 'setup' || status === 'pools') && !mgPoolIsPlaying(here, allMatches);
  const chip = (id, label) => {
    const mine = here === id;
    if (!mine && !(canMovePool && !mgPoolIsPlaying(id, allMatches))) return '';
    return `<button type="button" class="mgts-pchip${mine ? ' on' : ''}"${mine ? ' disabled' : ''}`
      + ` data-mgts="pool" data-mgts-pool="${escapeHTMLText(id)}">${escapeHTML(label)}</button>`;
  };
  const chips = pools.slice().sort((a, b) => (Number(a.display_order) || 0) - (Number(b.display_order) || 0))
    .map((p) => chip(String(p.id), 'Pool ' + String(p.label || ''))).join('')
    + chip('', 'No pool');
  const poolRow = pools.length
    ? `<div class="pl-sect">Pool</div><div class="mgts-pools">${chips}`
      + (canMovePool ? '' : `<span class="pc-lock">Play has started, teams stay put.</span>`)
      + `</div>`
    : '';
  const withdrawRow = midPlay
    ? `<button type="button" class="mgts-warn" data-mgts="withdraw">Withdraw from the tournament<span class="mgts-sub">Forfeits their remaining games</span></button>`
    : '';
  const removeRow = `<button type="button" class="mgts-danger" data-mgts="remove">Remove this team</button>`;
  const done = `<button type="button" class="mgts-done" data-mgts="close">Done</button>`;
  return head + nameFld + rosterBlock + paidRow + poolRow + withdrawRow + removeRow + done;
}

// ── Teams-list actions (delegated via #app-content when manageView==='tournament' && mgtView==='teams') ──
// THE paid write path. It was the Teams-list row toggle until the 2026-08-03 round (README §8) moved the
// control into #team-pay-modal — "move the paid function inside the team you click open" — so the row now
// only REPORTS state and this is called from the popup's Mark as paid. Same tdbSetTeamPaid write the
// body-level team sheet's switch uses: ONE write path, so the two surfaces can never disagree.
// C101 Task 3 / migration 0060: the READ-BACK moved off the refresh and onto the RPC's returned row. The
// refresh that follows is for the rest of the page (the list row's .mgv-pmeta, the "2 in · 1 paid" line),
// not for this decision, so a refresh that fails no longer casts doubt on a write the server confirmed.
async function mgTeamTogglePaid(teamId, btnEl) {
  if (!state.isAdmin || !teamId) return;
  const team = mgFindTeam(teamId);
  if (!team) return;
  const next = !team.paid;
  const label = () => (mgFindTeam(teamId) || team).paid ? 'Mark as unpaid' : 'Mark as paid';
  if (btnEl) { btnEl.disabled = true; btnEl.textContent = next ? 'Marking as paid…' : 'Marking as unpaid…'; }
  let row;
  try {
    row = await tdbSetTeamPaid(teamId, next);
  } catch (err) {
    if (btnEl) { btnEl.disabled = false; btnEl.textContent = label(); }
    appNotice({ title: 'Could not save that', message: (err && err.message) || 'Try again.' });
    return;
  }
  if (!!row.paid !== next) {
    if (btnEl) { btnEl.disabled = false; btnEl.textContent = label(); }
    appNotice({ title: 'That did not save', message: 'The change did not go through. Check you are signed in as an admin, then try again.' });
    return;
  }
  try { await tdbRefreshTournaments(); } catch (_) { /* the returned row already proved the write */ }
  const fresh = mgFindTeam(teamId) || row;
  // Repaint the popup in place (body-level, so repaintManage never reaches it) and the list under it, so the
  // state word, the button label and the row's .mgv-pmeta all move together off the SAME server truth.
  const modal = document.getElementById('team-pay-modal');
  if (modal) modal.innerHTML = buildMgTeamPayModalHTML(fresh);
  repaintManage();
}

// Withdraw a registered team, from INSIDE the popup only (README §8 — the quiet red footer action; the list
// row deliberately has no destructive control). No new primitive: the two shipped team-removal paths already
// cover the two real cases, and this picks between them by the tournament's stage exactly the way the
// body-level team sheet does.
//   mid-play (status pools|bracket) → tdbWithdrawTeam, which FORFEITS their remaining pool games so nobody
//     else's record is distorted. Deleting the row here would null team_a_id/team_b_id on games they already
//     played (the FK is ON DELETE SET NULL) and silently corrupt the standings.
//   before the draw → tdbDeleteTeam: there are no games yet, so on the registration list "withdraw" honestly
//     means the registration goes.
// Type-to-confirm is NOT specified for this one (README §8), so it uses the house appConfirm danger dialog.
async function mgtpWithdraw(teamId) {
  if (!state.isAdmin || !teamId) return;
  const t = mgActiveTournament();
  const team = mgFindTeam(teamId);
  if (!team) return;
  const nm = (team.name || '').trim() || 'This team';
  const midPlay = !!t && (t.status === 'pools' || t.status === 'bracket');
  const ok = await appConfirm({
    title: 'Withdraw team',
    message: midPlay
      ? `${nm} forfeits their remaining games (opponents win by the pool target) and drops out of the tournament. This can't be undone.`
      : `${nm} comes off the tournament. Their registration and payment record go with them. This can't be undone.`,
    confirmText: 'Withdraw',
    danger: true,
  });
  if (!ok) return;
  try {
    if (midPlay) await tdbWithdrawTeam(teamId, t); else await tdbDeleteTeam(teamId);
    await tdbRefreshTournaments();
  } catch (err) {
    appNotice({ title: 'Could not withdraw the team', message: (err && err.message) || 'Try again.' });
    return;
  }
  closeMgTeamPayModal();
  repaintManage();
}
// ── Manage › Tournament › Add a team (round 2026-08-25, screen 31 mgts-team-add) ─────────────────────
// The organizer's own roster form, replacing the name-only appPrompt this dashed row used to open. It is
// the PUBLIC registration kit (.rf-*) re-used on the manage side so the two screens read as the same
// form; only three things differ: a typeahead under each player slot (the organizer types against players
// already on file), a "Marked paid" switch where the public form carries the Venmo CTA, and a submit that
// runs three writes. NOTHING here claims an activity-log entry: teams.paid is a direct UPDATE and
// action_log only takes writes from DEFINER RPCs (the 2026-08-03 finding), so the design's log line would
// have been a promise the database does not keep.
function buildMgTeamAddHTML() {
  const t = mgActiveTournament();
  const header = `<div class="pd-pagehdr">`
    + `<button type="button" class="pd-back" data-mgt-back aria-label="Back to Tournament">${PK_BACK_SVG}</button>`
    + `<div class="pd-htitle">${escapeHTML(MGT_SUB_TITLES.teamadd)}</div></div>`;
  if (!t) return header + `<div class="pd-empty">No tournament to add a team to yet.</div>`;
  const size = Math.max(1, Number(t.team_size) || 4);
  // The fee sentence is the tournament's own buy-in when it has one, the league default when it does not —
  // an empty buy_in would otherwise print a sentence that starts with nothing.
  const buyIn = (t.buy_in == null ? '' : String(t.buy_in).trim()) || '$80 a team';
  const rows = Array.from({ length: size }, (_, i) => `<div class="rf-prow mgv-tarow">`
    + `<span class="rf-pnum">${i + 1}</span>`
    + `<input class="rf-pinput" id="mgta-p${i + 1}" type="text" placeholder="First and Last Name"`
    + ` autocomplete="off" autocapitalize="words" spellcheck="false" aria-label="Player ${i + 1}" /></div>`).join('');
  return header + `<section class="rf-page mgv-taform">`
    + `<div class="rf-sect">Team name</div>`
    + `<div class="rf-fld"><input class="rf-tinput" id="mgta-name" type="text" placeholder="Pick a team name"`
      + ` autocomplete="off" autocapitalize="words" spellcheck="false" /></div>`
    + `<div class="rf-plhead"><span class="rf-sect">Players</span>`
      + `<span class="rf-plhint">${size} per team · at least 1 guy + 1 girl</span></div>`
    + `<div class="rf-pllist">${rows}</div>`
    + `<div class="rf-divlab"><span>Payment</span></div>`
    + `<div class="mgr-tog mgv-tapay"><div class="mg-rb"><div class="mg-rn">Marked paid</div>`
      + `<div class="mg-rs">${escapeHTML(buyIn)} · no Venmo record for teams you add</div></div>`
      + `<button type="button" class="mg-sw" data-mgta-paid role="switch" aria-checked="false" aria-label="Marked paid"></button></div>`
    + `<button type="button" class="rf-cta" data-mgta-save>Add team</button>`
    + `<p class="mgr-status" id="mgta-status" role="status" aria-live="polite"></p>`
    + `</section>`;
}

// The typeahead's matcher. Club players only (state.players), on a case-insensitive NAME prefix, capped at
// six so the menu never buries the rows below it. Duplicated names collapse to one row. The menu prints a
// name and its initials and NOTHING else — skill ratings are admin-only data with no business on a roster
// form, and the design's own note says so.
function mgTeamAddMatches(q) {
  const s = String(q == null ? '' : q).trim().toLowerCase();
  if (!s) return [];
  const seen = Object.create(null);
  const out = [];
  const list = Array.isArray(state.players) ? state.players : [];
  for (let i = 0; i < list.length && out.length < 6; i++) {
    const nm = String((list[i] && list[i].name) || '').trim();
    if (!nm) continue;
    const key = nm.toLowerCase();
    if (key.indexOf(s) !== 0 || seen[key]) continue;
    seen[key] = 1;
    out.push(nm);
  }
  return out;
}
function mgTeamAddInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0].charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : '')).toUpperCase();
}
function mgTeamAddMenuHTML(names) {
  return (names || []).map((n) => `<button type="button" class="mgv-taitem" data-mgta-pick="${escapeHTMLText(n)}">`
    + `<span class="mgv-tainit">${escapeHTML(mgTeamAddInitials(n))}</span>`
    + `<span class="mgv-tab"><span class="mgv-tan">${escapeHTML(n)}</span></span></button>`).join('');
}
// Only one menu is ever open: typing rebuilds it, a pick / a blur / Escape drops it.
function mgTeamAddCloseMenus() {
  const menus = document.querySelectorAll('#tab-manage .mgv-tamenu');
  if (menus && menus.forEach) menus.forEach((m) => { if (m && m.remove) m.remove(); });
}
// Typing in a player slot re-renders the menu UNDER that row only. The input itself is never rebuilt, so
// the caret is never disturbed (the same rule the Players search and the check-in search follow).
function mgTeamAddType(input) {
  mgTeamAddCloseMenus();
  const row = input && input.closest ? input.closest('.mgv-tarow') : null;
  if (!row) return;
  if (row.classList) row.classList.remove('is-picked');
  const names = mgTeamAddMatches(input.value);
  if (!names.length) return;
  const menu = document.createElement('div');
  menu.className = 'mgv-tamenu';
  menu.innerHTML = mgTeamAddMenuHTML(names);
  row.appendChild(menu);
}
function mgTeamAddPick(btn) {
  const row = btn && btn.closest ? btn.closest('.mgv-tarow') : null;
  const input = row && row.querySelector ? row.querySelector('.rf-pinput') : null;
  if (input) input.value = btn.getAttribute('data-mgta-pick') || '';
  if (row && row.classList) row.classList.add('is-picked');
  mgTeamAddCloseMenus();
  if (input && input.focus) { try { input.focus(); } catch (_) {} }
}
// The paid switch is LOCAL until submit: no team exists yet, so there is nothing to write to. It records
// the organizer's intent and mgTeamAddSubmit reads it back off aria-checked.
function mgTeamAddTogglePaid(btn) {
  if (!btn) return;
  const on = btn.getAttribute('aria-checked') === 'true';
  btn.setAttribute('aria-checked', on ? 'false' : 'true');
  if (btn.classList) { if (on) btn.classList.remove('on'); else btn.classList.add('on'); }
}

// True when the Add a team form holds work the background poll must not throw away: a focused field in
// #tab-manage, any team-name / player value typed but not yet submitted, or the Marked-paid switch left
// ON. Same shape as manageRegDirty / manageSettingsDirty, minus their saved-value comparison — nothing
// here has been written yet, so ANY typed character is unsaved work. Fix round 1: the SWITCH counts too.
// It is the one control on this screen that holds a decision without holding text, and a repaint rebuilds
// it at aria-checked="false", so flipping it on and then pausing for the 15s poll silently un-marked the
// team as paid with nothing on screen to say so.
function manageTeamAddDirty() {
  if (mgtView !== 'teamadd') return false;
  const panel = document.getElementById('tab-manage');
  if (!panel) return false;
  const ae = document.activeElement;
  if (ae && panel.contains && panel.contains(ae) && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return true;
  if (panel.querySelector && panel.querySelector('[data-mgta-paid][aria-checked="true"]')) return true;
  const fields = panel.querySelectorAll ? panel.querySelectorAll('.rf-tinput, .rf-pinput') : null;
  let dirty = false;
  if (fields && fields.forEach) fields.forEach((el) => { if (String((el && el.value) || '').trim() !== '') dirty = true; });
  return dirty;
}

// Fix round 1: the double-tap guard this screen shipped without. tdbAddTeam's duplicate-name check is a
// SELECT and then an INSERT, not one atomic statement, so two overlapping submits both read "no team by
// that name" and both insert — a double-tap on a slow connection creates the team twice. Same shape as
// mgSaveScreenFields: a module flag turns the re-entry into a no-op, the CTA greys for the duration, and
// the finally restores both however the path ends (success, a thrown write, or an early return).
let mgTeamAddInFlight = false;

// Add the team. THREE writes, in the order a failure can be reported honestly: the insert first (nothing
// exists until it lands), then the roster, then the paid flag. Once the insert has succeeded the team IS
// in, so a later failure never says "could not add" — it says what did not follow and where to finish it,
// leaves the form filled, and refreshes the collections so the new team is already visible under Teams &
// payment. tdbAddTeam throws its own player-readable line on a duplicate name (its data-layer guard), and
// that line is surfaced verbatim; only a message-less throw falls back to the house copy. Every early
// return writes a status line — a button that does nothing and says nothing reads as broken.
async function mgTeamAddSubmit() {
  if (mgTeamAddInFlight) return;
  const note = (msg, bad) => mgNoteStatus('mgta-status', msg, bad);
  if (!state.isAdmin) { note('Sign in as an admin to add a team.', true); return; }
  const t = mgActiveTournament();
  if (!t) { note('No tournament is selected.', true); return; }
  const nameEl = document.getElementById('mgta-name');
  const name = String((nameEl && nameEl.value) || '').trim();
  if (!name) { note('Give the team a name first.', true); return; }
  const roster = [...document.querySelectorAll('#tab-manage .rf-pinput')]
    .map((i) => String((i && i.value) || '').trim()).filter(Boolean);
  const paidBtn = document.querySelector('[data-mgta-paid]');
  const paid = !!(paidBtn && paidBtn.getAttribute && paidBtn.getAttribute('aria-checked') === 'true');
  // Held by reference, not re-queried in the finally: a successful submit repaints the container onto the
  // Teams list, so a second lookup would find nothing (or, worse, another screen's control).
  const btn = document.querySelector('[data-mgta-save]');
  mgTeamAddInFlight = true;
  if (btn) btn.disabled = true;
  note('Adding…');
  try {
    let team;
    try {
      team = await tdbAddTeam(t.id, name);
    } catch (err) {
      note((err && err.message) ? String(err.message) : ('Could not add the team. ' + MG_SAVE_FAILED), true);
      return;
    }
    // A write that comes back with no row is the silent-refusal shape this project has been burned by
    // (RLS filters rather than raises), so it is never reported as a success.
    if (!team || !team.id) { note(MG_SAVE_FAILED, true); return; }
    if (roster.length) {
      try {
        await tdbSetTeamRoster(team.id, roster);
      } catch (err) {
        note('The team is in, but its roster did not save. Open it under Teams & payment to add the names.', true);
        await tdbRefreshTournaments();
        return;
      }
    }
    if (paid) {
      try {
        // C101 Task 3: this now goes through set_team_paid (0060), so ticking paid on Add-a-team DOES
        // leave an activity-log row. The RPC's own message is swallowed here on purpose: the team
        // registered, and this notice must not read as a failed registration.
        await tdbSetTeamPaid(team.id, true);
      } catch (err) {
        note('The team is in, but it could not be marked paid. Open it under Teams & payment.', true);
        await tdbRefreshTournaments();
        return;
      }
    }
    await tdbRefreshTournaments();
    mgtView = 'teams';
    repaintManage();
  } finally {
    mgTeamAddInFlight = false;
    if (btn) btn.disabled = false;
  }
}

// ── The body-level team sheet ────────────────────────────────────────────────────────────────────────
function closeMgTeamSheet() { const el = document.getElementById('mgts-sheet'); if (el) el.remove(); }

// Run a sheet write, refresh state, repaint the list UNDER the sheet (the sheet is body-level → untouched).
// Fix wave (2026-08-25 final review): the catch was a bare console.warn, so a refused write died there.
// The pool selector is the one that hurt — the tapped pill had already been given the `on` class by the
// caller, so a move the DB rejected left the sheet SHOWING the new pool with nothing said. Every path
// still repaints, which is what puts the pill back on the pool the team is actually in.
// C101 review wave (2026-08-26): `teamId` is optional and, when given, the SHEET is repainted from server
// truth ON A REFUSAL ONLY. The delegate paints the chip and the switch optimistically so the tap feels
// immediate; a refused write left that optimistic paint on screen next to a notice saying it did not save,
// so the sheet showed a pool the team is not in, and repaintManage() could never fix it because it only
// reaches #app-content while this sheet lives on document.body. The SUCCESS path is deliberately left
// alone: the refresh already made the state true, and replacing the body there would throw away whatever
// the organizer had typed into the name or roster fields mid-save. The repaint is inside its own try, so a
// failure to redraw can never turn into an unhandled rejection on top of the failure being reported.
async function mgtsWrite(fn, teamId) {
  if (!state.isAdmin) return;
  try {
    await fn();
    await tdbRefreshTournaments();
  } catch (err) {
    console.warn('mgts write', err);
    appNotice({ title: 'That did not save', message: (err && err.message) || MG_SAVE_FAILED });
    try { mgtsRepaintSheet(teamId); } catch (e2) { console.warn('mgts repaint', e2); }
  }
  repaintManage();
}

// Re-render the OPEN sheet's body off the refreshed team row. The scrim and its listeners are untouched,
// so nothing is rebound and the sheet cannot be reopened under the organizer. A closed sheet, a missing
// team or no id at all is a no-op.
function mgtsRepaintSheet(teamId) {
  if (!teamId) return;
  const team = mgFindTeam(teamId);
  if (!team) return;
  const scrim = document.getElementById('mgts-sheet');
  const body = scrim && scrim.querySelector('.pd-reg-sheet');
  if (body) body.innerHTML = buildMgTeamSheetHTML(team);
}
async function mgtsSaveName(teamId, el) {
  const val = String((el && el.value) || '').trim();
  if (!val || val === ((el && el.getAttribute('data-init')) || '')) return; // unchanged / empty → no write
  try {
    await tdbRenameTeam(teamId, val);
    if (el) el.setAttribute('data-init', val);
    await tdbRefreshTournaments();
    repaintManage();
  } catch (err) { console.warn('mgtsSaveName', err); }
}
async function mgtsSaveRoster(teamId, scrim) {
  const box = scrim && scrim.querySelector('.mgts-roster');
  const lines = Array.from((scrim || document).querySelectorAll('.mgts-rline'))
    .map((i) => String(i.value || '').trim()).filter(Boolean);
  const init = box ? (box.getAttribute('data-roster-init') || '') : '';
  if (lines.join('\n') === init) return; // unchanged → no write
  try {
    await tdbSetTeamRoster(teamId, lines);
    if (box) box.setAttribute('data-roster-init', lines.join('\n'));
    await tdbRefreshTournaments();
    repaintManage();
  } catch (err) { console.warn('mgtsSaveRoster', err); }
}
async function mgtsWithdraw(teamId) {
  if (!state.isAdmin) return;
  const t = mgActiveTournament();
  const team = mgFindTeam(teamId);
  const nm = team ? (team.name || 'This team') : 'This team';
  const ok = await appConfirm({ title: 'Withdraw team', message: `${nm} forfeits their remaining games (opponents win by the pool target). This can't be undone.`, confirmText: 'Withdraw', danger: true });
  if (!ok) return;
  try { await tdbWithdrawTeam(teamId, t); await tdbRefreshTournaments(); } catch (err) { console.warn('mgtsWithdraw', err); }
  closeMgTeamSheet();
  repaintManage();
}
// Type-DELETE remove — reuses the player-delete "type the word to confirm" pattern, but via the house
// appPrompt modal (the old confirmDangerousActionOrAbort uses window.prompt, which the shell has retired).
async function mgtsRemove(teamId) {
  if (!state.isAdmin) return;
  const team = mgFindTeam(teamId);
  const nm = team ? (team.name || 'this team') : 'this team';
  const typed = await appPrompt({ title: `Remove ${nm}?`, message: 'This permanently removes the team. Type DELETE to confirm.', confirmText: 'Remove team', placeholder: 'DELETE' });
  if (String(typed || '').trim().toUpperCase() !== 'DELETE') return;
  try { await tdbDeleteTeam(teamId); await tdbRefreshTournaments(); } catch (err) { console.warn('mgtsRemove', err); }
  closeMgTeamSheet();
  repaintManage();
}

function openMgTeamSheet(teamId) {
  const team = mgFindTeam(teamId);
  if (!team || !state.isAdmin) return;
  closeMgTeamSheet();
  const scrim = document.createElement('div');
  scrim.id = 'mgts-sheet';
  scrim.className = 'pd-reg-scrim';
  scrim.setAttribute('role', 'dialog');
  scrim.setAttribute('aria-modal', 'true');
  scrim.setAttribute('aria-label', 'Edit team');
  scrim.innerHTML = `<div class="pd-reg-sheet">${buildMgTeamSheetHTML(team)}</div>`;
  document.body.appendChild(scrim);
  // The sheet lives on document.body (outside #app-content's delegated listeners) → bind its own handlers.
  scrim.addEventListener('click', (ev) => {
    if (ev.target === scrim) { closeMgTeamSheet(); return; } // backdrop tap dismisses
    const r = ev.target.closest('[data-mgts]');
    if (!r) return;
    const role = r.getAttribute('data-mgts');
    if (role === 'close') { closeMgTeamSheet(); return; }
    if (role === 'paid') {
      const on = !r.classList.contains('on');
      r.classList.toggle('on', on);
      r.setAttribute('aria-checked', on ? 'true' : 'false');
      void mgtsWrite(() => tdbSetTeamPaid(teamId, on), teamId);   // C101 Task 3: the 0060 RPC + log row
      return;
    }
    if (role === 'pool') {
      if (r.disabled) return;                                  // the current pool's chip is inert
      const pid = r.getAttribute('data-mgts-pool') || '';
      // C101 review wave: tapping the pool the team is ALREADY in does nothing. 0067 answers 0 to it, so
      // a call would be a wasted round trip that also deleted and recreated that pool's whole scheduled
      // set on the way through 0066. Read the team back rather than trusting the closure, which is stale
      // the moment any refresh lands.
      const cur = mgFindTeam(teamId);
      if (String((cur && cur.pool_id) || '') === pid) return;
      scrim.querySelectorAll('[data-mgts="pool"]').forEach((b) => b.classList.remove('on'));
      r.classList.add('on');
      void mgtsWrite(() => tdbMoveTeamToPool(teamId, pid || null), teamId);   // C101 Task 7: the RPC
      return;
    }
    if (role === 'withdraw') { void mgtsWithdraw(teamId); return; }
    if (role === 'remove') { void mgtsRemove(teamId); return; }
  });
  // Save name / roster on blur (the poll can't wipe them — the sheet is body-level).
  scrim.addEventListener('focusout', (ev) => {
    const el = ev.target;
    if (!el) return;
    if (el.id === 'mgts-name') { void mgtsSaveName(teamId, el); return; }
    if (el.classList && el.classList.contains('mgts-rline')) { void mgtsSaveRoster(teamId, scrim); return; }
  });
  setTimeout(() => { const n = document.getElementById('mgts-name'); if (n) { try { n.focus({ preventScroll: true }); } catch (_) { try { n.focus(); } catch (_e) {} } } }, 60);
}

// ── The team payment popup (#team-pay-modal, round 2026-08-03) ───────────────────────────────────────
// Tapping a team on Teams & payment now opens a CENTRED popup on the shared dialog kit (same card geometry
// as #player-edit-modal): identity in the header with the payment state beside the close, roster chips, the
// fee, the paid action sat under the fee it settles, and a quiet Withdraw + Done footer. Body-level like the
// other sheets, so the 15s poll / partialRender can never wipe it.
// data-mgtp-paid → mgTeamTogglePaid (the shipped tdbSetTeamPaid write, moved here from the row toggle);
// data-mgtp-withdraw → mgtpWithdraw (forfeit mid-play, else remove the registration). Both wired below.
function buildMgTeamPayModalHTML(team) {
  if (!team) return '';
  const t = mgActiveTournament();
  const paid = !!team.paid;
  const idAttr = escapeHTMLText(String(team.id));
  const names = mgTeamRosterNames(team);
  // "Registered Jul 22" from teams.created_at. The prototype's "· captain Harper Vale" is DROPPED: the
  // loaded team_members shape (tdbListTeamMembers) carries no is_captain, so there is no captain to name.
  const reg = mgShortDate(team.created_at);
  const sub = reg ? `<span class="mgv-tsub">Registered ${escapeHTML(reg)}</span>` : '';
  const roster = names.length
    ? `<div class="mgv-troster">${names.map((n) => `<span class="mgv-tr">${escapeHTML(n)}</span>`).join('')}</div>`
    : `<div class="mgv-tfn">No players on this roster yet.</div>`;
  // buy_in is free display TEXT ("$80 per team"), so it prints as written — never parsed into a number.
  // No buy-in set = no fee block at all rather than a made-up amount.
  const buyIn = (t && t.buy_in != null && String(t.buy_in).trim()) ? String(t.buy_in).trim() : '';
  const venmo = !!(t && /^https?:\/\//i.test(String(t.venmo_link || '')));
  const fee = buyIn
    ? `<div class="mgv-tf"><span class="mgv-tlabel">Team fee</span><div class="mgv-tfee">`
      + `<span class="mgv-tfv">${escapeHTML(buyIn)}</span>`
      + `<span class="mgv-tfn">${venmo ? 'Cash or Venmo at the courts' : 'Cash at the courts'}</span>`
      + `</div></div>`
    : '';
  return `<div class="popup-card card mgv-tcard" role="dialog" aria-modal="true" aria-labelledby="team-pay-title">`
    + `<div class="mgv-thead"><span class="mgv-twho"><h3 id="team-pay-title">${escapeHTML(team.name || 'Team')}</h3>${sub}</span>`
      + `<span class="mgv-pmeta ${paid ? 'is-paid' : 'is-unpaid'}">${paid ? 'Paid' : 'Unpaid'}</span>`
      + `<button type="button" class="mgv-tx" data-mgtp-close aria-label="Close">&times;</button></div>`
    + `<div class="mgv-tbody">`
      + `<div class="mgv-tf"><span class="mgv-tlabel">Roster</span>${roster}</div>`
      + fee
      + `<button type="button" class="mgv-tpay" data-mgtp-paid="${idAttr}">${paid ? 'Mark as unpaid' : 'Mark as paid'}</button>`
      // C101 Task 3 / migration 0060: paid now rides set_team_paid, a SECURITY DEFINER RPC that writes
      // teams and action_log in one call, so the handoff's sentence is true and comes back.
      + `<div class="mgv-tnote">Logged in the activity log with your name.</div>`
    + `</div>`
    + `<div class="mgv-tfoot">`
      + `<button type="button" class="mgv-twd" data-mgtp-withdraw="${idAttr}">Withdraw team</button>`
      + `<button type="button" class="mgv-tdone" data-mgtp-close>Done</button>`
    + `</div></div>`;
}

function closeMgTeamPayModal() { const el = document.getElementById('team-pay-modal'); if (el) el.remove(); }

function openMgTeamPayModal(teamId) {
  const team = mgFindTeam(teamId);
  if (!team || !state.isAdmin) return;
  closeMgTeamPayModal();
  const el = document.createElement('div');
  el.id = 'team-pay-modal';
  el.className = 'popup-overlay';
  el.style.display = 'flex';
  el.innerHTML = buildMgTeamPayModalHTML(team);
  document.body.appendChild(el);
  // Body-level → outside #app-content's delegated listeners, so it binds its own.
  el.addEventListener('click', (ev) => {
    if (ev.target === el || ev.target.closest('[data-mgtp-close]')) { closeMgTeamPayModal(); return; }
    const payBtn = ev.target.closest('[data-mgtp-paid]');
    if (payBtn) { void mgTeamTogglePaid(payBtn.getAttribute('data-mgtp-paid'), payBtn); return; }
    const wdBtn = ev.target.closest('[data-mgtp-withdraw]');
    if (wdBtn) { void mgtpWithdraw(wdBtn.getAttribute('data-mgtp-withdraw')); return; }
  });
}

// ── Task 7 (pick R9): Pools & schedule admin — score on the schedule ──────────────────────────────────
// The public Pools page grammar (pl-* tabs + Seeding, standings-lite, net-hairline games) reused inside
// #tab-manage with admin verbs: SCORE on unscored rows, tap-to-update on live, quiet EDIT on finals — all
// open the shared body-level openMgScoreSheet(matchId). Pre-draw = the two-step draw setup (Draw pools →
// Start pool play) through the atomic RPCs. Post-draw also carries a Pool controls panel (move teams via the
// T6 team sheet / edit nets / reset pools). §51 matte, Barlow display, single --accent, flat on stone.
function buildMgPoolsHTML() {
  const t = mgActiveTournament();
  const header = `<div class="pd-pagehdr">`
    + `<button type="button" class="pd-back" data-mgt-back aria-label="Back to Tournament">${PK_BACK_SVG}</button>`
    + `<div class="pd-htitle">Pools &amp; schedule</div></div>`;
  if (!t) return header + `<div class="pd-empty">No tournament to set up pools for yet.</div>`;
  const teams = Array.isArray(state.tournamentTeams) ? state.tournamentTeams : [];
  const pools = (Array.isArray(state.tournamentPools) ? state.tournamentPools : [])
    .slice().sort((a, b) => (Number(a.display_order) || 0) - (Number(b.display_order) || 0));
  const matches = Array.isArray(state.tournamentMatches) ? state.tournamentMatches : [];
  const poolMatches = matches.filter((m) => (m.phase ? m.phase === 'pool' : !!m.pool_id));
  if (!poolMatches.length) return header + mgPoolsSetupHTML(t, teams, pools);
  return header + mgPoolsScheduleHTML(t, teams, pools, matches) + mgPoolsControlsHTML(t, teams, pools, matches);
}

// Pre-draw setup (status setup, no pools) OR drawn-not-started (pools exist, no matches) — two steps like
// today's tv2 flow: Draw pools first (shows the drawn pools), then Start pool play once you're happy.
function mgPoolsSetupHTML(t, teams, pools) {
  if (!pools.length) {
    const teamCt = teams.length;
    const defPools = Number(t.pool_count) > 0 ? Number(t.pool_count) : Math.max(1, Math.round(teamCt / 6) || 1);
    const defNets = Number(t.net_count) > 0 ? Number(t.net_count) : 1;
    const size = Number(t.team_size) || 4;
    const pr = scoringRulesFor('pool', t);
    const br = scoringRulesFor('main', t);
    const preset = [`${size}s co-ed`, `Pool: ${mgRuleLine(pr)}`, `Bracket: ${mgRuleLine(br)}`];
    // Mike (2026-08-25): pool play needs an EVEN number of teams; the draw refuses an odd total. Registration
    // itself cannot refuse the odd team (the 3rd cannot wait for a 4th), so the draw is where the rule lives.
    const even = teamCt % 2 === 0;
    const enough = teamCt >= 2 && even;
    // Round 2026-08-03: the two full-width 40px grey text boxes for a single digit become ONE framed box
    // with a row per count — label left, pill stepper right, native spinners removed by the CSS. The input
    // ids are untouched (mgPoolsDraw still reads #mgps-poolcount / #mgps-nets), so the draw path is unchanged.
    return `<div class="pl-sect">Draw setup</div>`
      + `<div class="mgv-nbox">`
        + mgpStepperFieldHTML('mgps-poolcount', 'Pools', defPools, 'pools')
        + mgpStepperFieldHTML('mgps-nets', 'Nets', defNets, 'nets')
      + `</div>`
      + `<div class="mgps-note mgv-nhint" id="mgps-hint">${escapeHTML(mgPoolsDrawHint(teamCt, defPools, defNets))}</div>`
      + `<div class="pl-sect">Format</div>`
      + preset.map((p) => `<div class="mgps-sub">${escapeHTML(p)}</div>`).join('')
      + `<div class="mgps-note">Edit these in Event settings.</div>`
      + `<button type="button" class="mgt-cta" data-mgps-draw${enough ? '' : ' disabled'}>Draw pools</button>`
      + (enough ? '' : `<div class="mgps-note">${teamCt < 2 ? 'Add at least 2 teams first.' : 'Pool play needs an even number of teams. Add or remove one.'}</div>`);
  }
  return `<div class="pl-sect">Pools drawn</div>`
    + pools.map((p) => mgPoolTeamsBlockHTML(p, teams, null, pools)).join('')
    // C101 Task 1: no .pc-lock line here, because nothing is locked yet. This block only ever renders
    // where the tournament has zero pool matches (buildMgPoolsHTML), so the sentence is true.
    + `<div class="mgps-note">Move a team to another pool now. After the draw you can still move one until either pool has played.</div>`
    + `<button type="button" class="mgt-cta" data-mgps-start>Start pool play</button>`
    + `<button type="button" class="mgps-quiet" data-mgps-redraw>Draw again</button>`;
}

// One count row inside the framed draw-setup box: label left, pill stepper right. The INPUT keeps its
// production id (#mgps-poolcount / #mgps-nets) and min="1" so mgPoolsDraw reads it exactly as before —
// the ± buttons only write into it. Native spinners are killed in CSS (.mgv-sv appearance:textfield).
function mgpStepperFieldHTML(id, label, value, noun) {
  const v = Math.max(1, Math.floor(Number(value) || 1));
  return `<div class="pk-fld mgv-nfld"><label class="pk-fl" for="${id}">${escapeHTML(label)}</label>`
    + `<span class="mgv-step">`
      + `<button type="button" class="mgv-sb" data-mgps-dec="${id}" aria-label="Fewer ${escapeHTMLText(noun)}">&minus;</button>`
      + `<input class="pk-fv mgv-sv" id="${id}" type="number" min="1" inputmode="numeric" value="${escapeHTMLText(String(v))}" />`
      + `<button type="button" class="mgv-sb" data-mgps-inc="${id}" aria-label="More ${escapeHTMLText(noun)}">+</button>`
    + `</span></div>`;
}

// The line under the draw-setup box, stated as the RESULT of the two counts: "6 teams split into 2 pools of
// 3, playing across 3 nets." Mirrors tdbDrawPools' own clamp (every pool gets at least 2 teams), so it
// promises what the draw will actually do rather than echoing the field. Uneven splits read "3 or 4".
function mgPoolsDrawHint(teamCt, pools, nets) {
  const n = Math.max(0, Math.floor(Number(teamCt) || 0));
  const p = Math.max(1, Math.floor(Number(pools) || 1));
  const k = Math.max(1, Math.floor(Number(nets) || 1));
  const netPart = k === 1 ? 'playing on 1 net' : `playing across ${k} nets`;
  if (n < 2) return `${n} team${n === 1 ? '' : 's'} so far, ${netPart}.`;
  const real = Math.max(1, Math.min(p, Math.floor(n / 2)));
  const base = Math.floor(n / real);
  const rem = n % real;
  return `${n} teams split into ${real} pool${real === 1 ? '' : 's'} of ${rem ? base + ' or ' + (base + 1) : base}, ${netPart}.`;
}

// The same fact as a ROW CLAUSE rather than a sentence: "2 pools of 3 across 3 nets". Sits under the
// tournament page's Pools & schedule row before the draw, where mgPoolsDrawHint's full sentence (with its
// leading team count and its full stop) would repeat the Teams-in tile and read as prose in a subtitle.
// Same clamp as mgPoolsDrawHint and tdbDrawPools, so the three can never promise different splits.
// '' when there are fewer than two teams — there is nothing to split yet and the caller drops the clause.
function mgPoolsSplitClause(teamCt, pools, nets) {
  const n = Math.max(0, Math.floor(Number(teamCt) || 0));
  if (n < 2) return '';
  const p = Math.max(1, Math.floor(Number(pools) || 1));
  const k = Math.max(1, Math.floor(Number(nets) || 1));
  const real = Math.max(1, Math.min(p, Math.floor(n / 2)));
  const base = Math.floor(n / real);
  const rem = n % real;
  return `${real} pool${real === 1 ? '' : 's'} of ${rem ? base + ' or ' + (base + 1) : base} ${k === 1 ? 'on 1 net' : `across ${k} nets`}`;
}

// A ± tap: clamp at min 1, write straight into the input and re-state the hint IN PLACE. No repaint — a
// container swap would re-read the tournament defaults and throw away what the admin just dialled in.
function mgpStepCount(inputId, d) {
  const el = document.getElementById(inputId);
  if (!el) return;
  el.value = String(Math.max(1, Math.floor(Number(el.value) || 1) + d));
  mgpSyncDrawHint();
}
function mgpSyncDrawHint() {
  const hint = document.getElementById('mgps-hint');
  if (!hint) return;
  const pc = document.getElementById('mgps-poolcount');
  const nc = document.getElementById('mgps-nets');
  const teamCt = (Array.isArray(state.tournamentTeams) ? state.tournamentTeams : []).length;
  hint.textContent = mgPoolsDrawHint(teamCt, pc ? pc.value : 1, nc ? nc.value : 1);
}

// One pool's teams (each tappable → the T6 openMgTeamSheet for move/edit). Serves the drawn-not-started
// step. (Round 2026-08-24: the expanded Pool controls used to share this too, with a `showEditNets` flag.
// They now render mgPoolCardHTML instead, so the flag and its Edit-nets button are gone.)
// C101 Task 1 (2026-08-25): the fourth argument. `pools` defaults to null, so every caller that does not
// pass it renders byte-identically to what this emitted before. When it IS passed, each row gains the
// SAME Move span and the SAME .pc-pick block the controls card draws, and the rows are wrapped in one
// [data-pc-card] so mgPoolsMoveTeam's destination flash has something to find (without the wrapper
// mPlay(null, ...) returns and the move lands silently). This block is reachable ONLY from
// buildMgPoolsHTML's zero-pool-matches branch, so a move here has no fixtures to rebuild. The
// server-side refusal is 0064, Task 7, and not before.
function mgPoolTeamsBlockHTML(pool, teams, matches, pools) {
  const pid = String(pool.id);
  const label = pool.label || '';
  const mine = teams.filter((tm) => String(tm.pool_id || '') === pid);
  let sub = `Pool ${escapeHTML(label)}`;
  if (matches) {
    const nets = [...new Set(matches.filter((m) => m.pool_id === pool.id && m.net != null).map((m) => m.net))].sort((a, b) => a - b);
    if (nets.length) sub += ` · Net${nets.length > 1 ? 's' : ''} ${escapeHTML(formatNetList(nets))}`;
  }
  // A one-pool draw has nowhere to move a team TO, so Move is not offered at all (the fix-round-1 lesson
  // from mgPoolCardHTML: offering it there set mgpMoveTeamId, drew an empty picker with no Cancel, and
  // manageNetsDirty() then bailed every background sync until the panel was closed).
  const others = (pools || []).filter((p) => String(p.id) !== pid);
  const movable = others.length > 0;
  const rows = mine.length
    ? mine.map((tm) => {
      const tid = String(tm.id);
      const open = movable && mgpMoveTeamId === tm.id;
      const row = `<button type="button" class="mgps-pteam" data-mgps-team="${escapeHTMLText(tid)}"${open ? ' data-pc-open="1"' : ''}>`
        + `<span class="mgps-ptn">${escapeHTML(tm.name || 'Team')}</span>`
        + (movable ? `<span class="pc-move" data-pc-move="${escapeHTMLText(tid)}">Move</span>` : '')
        + MG_CHEV + `</button>`;
      if (!open) return row;
      return row + `<div class="pc-pick">`
        + `<span class="pc-pl">Move <b>${escapeHTML(tm.name || 'Team')}</b> to &rarr;</span>`
        + others.map((p) => `<button type="button" class="pc-pbtn" data-pc-pick="${escapeHTMLText(tid + ':' + String(p.id))}">Pool ${escapeHTML(p.label || '')}</button>`).join('')
        + `<button type="button" class="pc-pcancel" data-pc-cancel>Cancel</button>`
        + `</div>`;
    }).join('')
    : `<div class="mgps-note">No teams in this pool.</div>`;
  if (!pools) return `<div class="pl-sect">${sub}</div>${rows}`;
  return `<div class="pl-sect">${sub}</div><div data-pc-card="${escapeHTMLText(pid)}">${rows}</div>`;
}

// The post-draw schedule — reuses the public buildPoolsSchedulePageHTML shape (pool + Seeding tabs,
// standings-lite via the shared poolStandRowHTML, per-net hairline games) with admin game rows.
function mgPoolsScheduleHTML(t, teams, pools, matches) {
  const EN = '–';
  const activePools = pools.filter((p) => matches.some((m) => m.pool_id === p.id));
  if (!activePools.length) return `<div class="pl-empty">No scheduled games yet.</div>`;
  const poolLabels = activePools.map((p) => p.label || '');
  const selected = mgpPoolFilter === 'seeding'
    ? 'seeding'
    : (poolLabels.includes(mgpPoolFilter) ? mgpPoolFilter : poolLabels[0]);
  const tab = (label, val) => `<button type="button" class="pl-tab${selected === val ? ' pl-on' : ''}" data-mgps-tab="${escapeHTMLText(val)}"${selected === val ? ' aria-current="true"' : ''}>${escapeHTML(label)}</button>`;
  const tabs = `<div class="pl-tabs" role="group" aria-label="Pools and seeding">${activePools.map((p) => tab('Pool ' + (p.label || ''), p.label || '')).join('')}${tab('Seeding', 'seeding')}</div>`;

  const poolGames = matches.filter((m) => m.pool_id && m.team_a_id && m.team_b_id && (m.phase ? m.phase === 'pool' : true));
  const total = poolGames.length;
  const done = poolGames.filter((m) => m.status === 'final').length;
  const maxRound = Math.max(1, ...poolGames.map((m) => m.queue_order || 0));
  const finalOrders = poolGames.filter((m) => m.status === 'final').map((m) => m.queue_order || 0);
  const curRound = Math.min(maxRound, (finalOrders.length ? Math.max(...finalOrders) : 0) + 1);
  const meta = `<p class="pl-meta">Round ${curRound} of ${maxRound} · ${done} of ${total} game${total === 1 ? '' : 's'} done</p>`;
  const colh = `<div class="pl-colh"><span class="c1">#</span><span class="c2">Team</span><span class="c3">W${EN}L</span><span class="c4">Diff</span></div>`;

  let body;
  if (selected === 'seeding') {
    const poolByTeam = {};
    teams.forEach((tm) => { const p = pools.find((pp) => pp.id === tm.pool_id); if (p) poolByTeam[tm.id] = p.label || ''; });
    const rows = computeSeeding(teams, matches).map((r) => {
      const badge = poolByTeam[r.teamId] ? `<span class="pl-pl">${escapeHTML(poolByTeam[r.teamId])}</span> ` : '';
      return poolStandRowHTML(r.seed, r.teamId, r.name, r.wins, r.losses, r.pointDiff, badge, null);
    }).join('');
    body = `<div class="pl-sect">Overall seeding</div>${colh}${rows}<p class="pl-foot">Seeded by win %, then point diff. This sets the bracket order.</p>`;
  } else {
    const pool = activePools.find((p) => (p.label || '') === selected) || activePools[0];
    const shaped = shapeStandingsByPool(pools, teams, matches).find((s) => s.poolLabel === (pool.label || ''));
    const standRows = (shaped ? shaped.rows : []).map((r) => poolStandRowHTML(r.rank, r.teamId, r.name, r.wins, r.losses, r.pointDiff, '', null)).join('');
    const poolMs = matches.filter((m) => m.pool_id === pool.id);
    const nets = [...new Set(poolMs.map((m) => m.net).filter((n) => n != null))].sort((a, b) => a - b);
    const netsLabel = nets.length ? ('Net' + (nets.length > 1 ? 's' : '') + ' ' + formatNetList(nets)) : '';
    const gsections = nets.map((net) => {
      const games = poolMs.filter((m) => m.net === net).sort((a, b) => (a.queue_order || 0) - (b.queue_order || 0));
      const rows = games.map((g, i) => mgPoolGameRowHTML(g, g.queue_order || (i + 1), teams)).join('');
      return `<div class="pl-net">NET ${escapeHTML(String(net))}</div>${rows}`;
    }).join('');
    body = `<div class="pl-sect">Pool ${escapeHTML(pool.label || '')} standings</div>${colh}${standRows}<div class="pl-sect">Games${netsLabel ? ' · ' + escapeHTML(netsLabel) : ''}</div>${gsections}`;
  }
  return `${meta}${tabs}${body}`;
}

// One admin game row: the whole row is tappable (data-mgps-score) → the score sheet. Unscored rows show a
// SCORE outline button, live rows a green score + LIVE pill, finals the winner-first line + a quiet EDIT tag.
// NO data-team-peek (that read-only public affordance is replaced by the admin score action).
function mgPoolGameRowHTML(g, order, teams) {
  const EN = '–';
  const idAttr = escapeHTMLText(String(g.id));
  const aN = escapeHTML(teamNameById(teams, g.team_a_id));
  const bN = escapeHTML(teamNameById(teams, g.team_b_id));
  // Design round copy sweep: the row tag reads G# ("your second game"), matching the public pools board.
  const rd = `<span class="rd">G${escapeHTML(String(order))}</span>`;
  if (g.status === 'final') {
    const aWin = g.winner_team_id === g.team_a_id;
    const w = aWin ? aN : bN, l = aWin ? bN : aN;
    const ws = aWin ? g.score_a : g.score_b, ls = aWin ? g.score_b : g.score_a;
    return `<div class="pl-g" data-mgps-score="${idAttr}">${rd}<span class="gt"><span class="win">${w}</span> <span class="vs">vs</span> <span class="lose">${l}</span></span><span class="sc">${escapeHTML(String(ws))}${EN}${escapeHTML(String(ls))}</span><span class="ftag">EDIT</span></div>`;
  }
  if (g.status === 'live') {
    const sa = Number(g.score_a) || 0, sb = Number(g.score_b) || 0;
    return `<div class="pl-g live" data-mgps-score="${idAttr}">${rd}<span class="gt">${aN} <span class="vs">vs</span> ${bN}</span><span class="sc">${sa}${EN}${sb}</span><span class="pill">LIVE</span></div>`;
  }
  return `<div class="pl-g" data-mgps-score="${idAttr}">${rd}<span class="gt">${aN} <span class="vs">vs</span> ${bN}</span><button type="button" class="mgps-score" data-mgps-score="${idAttr}">SCORE</button></div>`;
}

// One pool as a card inside the OPEN Pool controls (round 2026-08-24, Mike: "i dont like the pools controls
// how they are, fix them"). The head states the pool's nets and carries its own Edit-nets control; tapping
// it swaps the label for a field prefilled with the PARSED net list ("1, 2, 3") — never the rendered
// "Nets 1-3" label, because parseInt('1-3') is 1 and the pool would silently collapse to a single net.
// MOVE, spec decision 3 (Mike, 2026-08-25): a pool moves ONLY BEFORE THE SCHEDULE EXISTS. tdbMoveTeamToPool
// writes teams.pool_id and nothing else, so once Start pool play has drawn the fixtures a moved team would
// keep its games against the old pool and have none in the new one (C101 Task 0, 2026-08-25: the gate used
// to wait for a FINAL game, which left that corruption path open between the draw and the first score).
// The moment any game exists for the pool the Move label goes; the card's lock line says why.
// C101 review wave (2026-08-26): the ONE place that answers "can 0067 still move a team in or out of
// this pool". The RPC refuses a move when EITHER side holds a final or a live pool game, so the UI has to
// stop offering such a pool as a source AND as a destination. Three callers: the pool card's Move gate,
// that card's destination picker, and the team sheet's chips.
function mgPoolIsPlaying(poolId, matches) {
  const pid = String(poolId == null ? '' : poolId);
  if (!pid) return false;
  return (Array.isArray(matches) ? matches : []).some((m) => m
    && (m.phase ? m.phase === 'pool' : !!m.pool_id)
    && String(m.pool_id) === pid && (m.status === 'final' || m.status === 'live'));
}

function mgPoolCardHTML(pool, teams, pools, matches) {
  const pid = String(pool.id);
  const label = pool.label || '';
  const mine = teams.filter((tm) => String(tm.pool_id || '') === pid);
  const nets = [...new Set(matches.filter((m) => String(m.pool_id) === pid && m.net != null).map((m) => m.net))].sort((a, b) => a - b);
  const head = mgpNetsEditPoolId === pool.id
    ? `<input class="pc-nin" id="pc-nin-${escapeHTMLText(pid)}" type="text" inputmode="numeric" value="${escapeHTMLText(nets.join(', '))}" aria-label="Nets for pool ${escapeHTMLText(label)}" />`
      + `<span class="pc-nhint">Re-assigns its unplayed games.</span>`
      + `<button type="button" class="pc-nbtn" data-pc-savenets="${escapeHTMLText(pid)}">Save nets</button>`
    : `<span class="pc-nets">${nets.length ? 'Nets ' + escapeHTML(formatNetList(nets)) : 'No nets yet'}</span>`
      + `<button type="button" class="pc-nbtn" data-pc-editnets="${escapeHTMLText(pid)}">Edit nets</button>`;
  // Fix round 1: `others` is computed FIRST, because a one-pool event (tdbDrawPoolsAtomic clamps to at
  // least one pool, so 2-3 teams is a single pool) has nowhere to move a team TO. Offering Move there set
  // mgpMoveTeamId, drew an empty picker with no Cancel in it, and then manageNetsDirty() bailed every
  // background sync on a live-scoring page until the panel was closed.
  // C101 Task 7 / migration 0064: Task 0's `!drawn` gate retires with the RPC that replaced it. A pool that
  // has PLAYED or is PLAYING still withholds Move, because the RPC refuses it: the UI now draws exactly
  // what the server will accept, instead of drawing more than it will.
  // Review wave: the refusal covers BOTH sides of a move, so a playing pool is dropped from the
  // DESTINATION list too. Offering it drew a button whose only outcome was an error message.
  const played = mgPoolIsPlaying(pid, matches);
  const others = pools.filter((p) => String(p.id) !== pid && !mgPoolIsPlaying(p.id, matches));
  const movable = others.length > 0 && !played;
  // Mike (2026-08-26): a pool that has NOT played but has nowhere legal to send anyone says so, rather
  // than going quiet. Counted, not just detected: the sentence names how many pools it is talking about,
  // and a count of zero is what keeps a ONE-pool event silent, because telling that organizer another pool
  // has played would be a sentence the app cannot honour (the same fix-round-1 trap the lock line below is
  // gated against). With every other pool playing, this count IS the number of other pools, which is why
  // it can carry the plural on its own.
  const othersPlayed = pools.filter((p) => String(p.id) !== pid && mgPoolIsPlaying(p.id, matches)).length;
  const stranded = !played && !movable && othersPlayed > 0;
  const rows = mine.length
    ? mine.map((tm) => {
      const tid = String(tm.id);
      const open = movable && others.length > 0 && mgpMoveTeamId === tm.id;
      // The row BODY keeps data-mgps-team, so tapping the name still opens the T6 team sheet; the Move
      // label carries its own hook and is checked first in the delegate.
      const row = `<button type="button" class="pc-team" data-mgps-team="${escapeHTMLText(tid)}"${open ? ' data-pc-open="1"' : ''}>`
        + `<span class="pc-tn">${escapeHTML(tm.name || 'Team')}</span>`
        + (movable ? `<span class="pc-move" data-pc-move="${escapeHTMLText(tid)}">Move</span>` : '')
        + MG_CHEV + `</button>`;
      if (!open) return row;
      return row + `<div class="pc-pick">`
        + `<span class="pc-pl">Move <b>${escapeHTML(tm.name || 'Team')}</b> to &rarr;</span>`
        + others.map((p) => `<button type="button" class="pc-pbtn" data-pc-pick="${escapeHTMLText(tid + ':' + String(p.id))}">Pool ${escapeHTML(p.label || '')}</button>`).join('')
        + `<button type="button" class="pc-pcancel" data-pc-cancel>Cancel</button>`
        // C101 Task 7: the picker says what the move will do to the schedule, because after the draw a move
        // is a two-pool regeneration and not a pool_id write. Review wave: it used to say finished games
        // stay where they were played, which can never happen here - a pool holding a finished game is
        // refused by the RPC and is not offered on either side of the move.
        + `<span class="pc-pnote">Both pools get a fresh schedule.</span>`
        + `</div>`;
    }).join('')
    : `<div class="mgps-note">No teams in this pool.</div>`;
  // Fix round 1 (the controller's ruling): a card that has withheld Move says so on the card, rather than
  // leaving the panel note above two cards as the only explanation. Gated on `played`, NOT on `!movable` —
  // a one-pool event also has no Move, and telling that organizer "play has started" when nothing has been
  // scored would be copy the app cannot honour.
  // The schedule-is-drawn line retires with the gate that drew it (C101 Task 7).
  const lock = played ? `<span class="pc-lock">Play has started, teams stay put.</span>`
    : (stranded
      ? `<span class="pc-lock">The other pool${othersPlayed === 1 ? ' has' : 's have'} played, teams stay put.</span>`
      : '');
  return `<div class="pc-card" data-pc-card="${escapeHTMLText(pid)}">`
    + `<div class="pc-hd"><span class="pc-name">Pool ${escapeHTML(label)}</span>${head}${lock}</div>`
    + rows + `</div>`;
}

// The Pool controls section — collapsed to one "careful stuff" row (mockup ps-a), expanded to a card per
// pool plus the shared danger block. What it replaced (round 2026-08-24): a stray "Close controls" button,
// two undifferentiated lists of team names with chevrons that never said what tapping one would do, an
// "Edit nets" button floating under each, and a red Reset flush against the last list.
// The design's .pc-toggle on the section head is DROPPED — Done and the collapsed row are the two ways in
// and out, and a third control that does the same thing is one more way to be surprised.
function mgPoolsControlsHTML(t, teams, pools, matches) {
  if (!mgpControlsOpen) {
    return `<div class="pl-sect">Pool controls</div>`
      + `<button type="button" class="mgps-ctrlrow" data-mgps-controls>`
        + `<div class="mg-rb"><div class="mg-rn">Move teams · edit nets · reset pools</div>`
        + `<div class="mg-rs">The careful stuff, one tap deeper</div></div>${MG_CHEV}</button>`;
  }
  return `<div class="pl-sect">Pool controls</div>`
    + `<div class="pc-top">`
      + `<p class="pc-note">Move a team to another pool, change the nets a pool plays on, or start the draw over.</p>`
      + `<button type="button" class="pc-done" data-mgps-controls>Done</button></div>`
    + pools.map((p) => mgPoolCardHTML(p, teams, pools, matches)).join('')
    + `<div class="pl-sect mgv-dsect" aria-hidden="true"></div>`
    + `<div class="mgv-danger">`
      + `<div class="mgv-drow"><span class="mgv-dtxt">`
        + `<span class="mgv-dt">Reset pools</span>`
        + `<span class="mgv-dd">Clears every pool result and draws new pools from the registered teams at random. Pool play starts over.</span>`
      + `</span><button type="button" class="mgts-danger mgv-dbtn" data-mgps-reset>Reset</button></div>`
      + `<div class="mgv-dnote">Asks you to type the tournament name before anything happens.</div>`
    + `</div>`;
}

// ── The shared body-level score sheet (Task 7 defines it; Task 8's bracket reuses openMgScoreSheet) ──────
// "Winners bracket · G7" — a bracket match's place in the round 2026-08-03 vocabulary, for the score
// popup's context line. Falls back to the bare game number when the match carries no side (older rows).
function mgBracketMatchLabel(m) {
  const part = bracketLabelPart(m); // "G7" from the EXISTING bracketGameNumbers, else the stored round label
  if (!m || (m.side !== 'winners' && m.side !== 'losers' && m.side !== 'grand_final')) return part;
  const main = (Array.isArray(state.tournamentMatches) ? state.tournamentMatches : []).filter((x) => x.phase === 'main');
  const maxRounds = { winners: 0, losers: 0 };
  main.forEach((x) => {
    if (x.side === 'winners' || x.side === 'losers') maxRounds[x.side] = Math.max(maxRounds[x.side], x.round || 0);
  });
  const side = mgBracketSideName({ side: m.side, round: m.round || 0 }, maxRounds);
  return part ? side + ' · ' + part : side;
}

// "Winner → winners bracket · G10 / Loser → losers bracket · G9" — the STAKES of the tap, derived from the
// match's REAL wiring (winner_next_match_id / loser_next_match_id). Round 2026-08-25 (screen 37): a bare
// game number said where, never what, so each side now names the round it lands in — and where the wiring
// ENDS, the terminal outcome is named instead of nothing: champion / runner-up for the deciding
// championship game, third place for the loser of the last losers round, eliminated everywhere else.
// A clause is still omitted when there is genuinely no destination to name.
function mgScoreNextHTML(match) {
  if (!match || match.phase !== 'main') return '';
  const main = (Array.isArray(state.tournamentMatches) ? state.tournamentMatches : []).filter((x) => x.phase === 'main');
  const byId = {};
  main.forEach((x) => { byId[x.id] = x; });
  const gn = bracketGameNumbers(main).byId;
  const maxRounds = { winners: 0, losers: 0 };
  main.forEach((x) => { if (x.side === 'winners' || x.side === 'losers') maxRounds[x.side] = Math.max(maxRounds[x.side], x.round || 0); });
  const dest = (id) => {
    const d = byId[id];
    if (!d) return '';
    const side = d.side === 'grand_final' ? 'Championship' : (d.side === 'losers' ? 'losers bracket' : 'winners bracket');
    return `${side} · G${gn[d.id]}`;
  };
  const isChamp = match.side === 'grand_final';
  // The championship of a RESET-ENABLED bracket wires BOTH of its ends into the reset game (pure.js ~522,
  // and grand_final_reset defaults to true), so the Winner/Loser form would read "Championship · G15"
  // twice — where, twice; what, never. The reset is only played when the LOSERS-side team wins
  // (0039: wb_won_gf ends the tournament on the spot), so the honest line names the two TEAMS instead of
  // the two ends: slot a is the winners-side team, slot b the one that came up through the losers bracket.
  // A no-reset championship, and the reset game itself, keep the Winner/Loser form below.
  const reset = (isChamp && Number(match.round) === 1)
    ? main.find((x) => x.side === 'grand_final' && Number(x.round) === 2) : null;
  if (reset) {
    const teams = Array.isArray(state.tournamentTeams) ? state.tournamentTeams : [];
    const nameOf = (id) => { const tm = teams.find((x) => x && x.id === id); return (tm && tm.name) ? tm.name : ''; };
    const aName = nameOf(match.team_a_id);
    const bName = nameOf(match.team_b_id);
    // Both slots have to be filled for the team form to say anything; an unresolved championship falls
    // through to the generic form rather than naming a team that is not there yet.
    if (aName && bName) {
      return `<div class="mgv-scstake">`
        + `<span class="mgv-scstk"><b>${escapeHTML(aName)}</b> wins → champion</span>`
        + `<span class="mgv-scstk"><b>${escapeHTML(bName)}</b> wins → Championship · G${gn[reset.id]}</span>`
        + `</div>`;
    }
  }
  const win = (match.winner_next_match_id && byId[match.winner_next_match_id]) ? dest(match.winner_next_match_id) : (isChamp ? 'champion' : '');
  const lose = (match.loser_next_match_id && byId[match.loser_next_match_id]) ? dest(match.loser_next_match_id)
    : (isChamp ? 'runner-up' : (match.side === 'losers' && (match.round || 0) >= maxRounds.losers ? 'third place' : 'eliminated'));
  const parts = [];
  if (win) parts.push(`<span class="mgv-scstk"><b>Winner</b> → ${escapeHTML(win)}</span>`);
  if (lose) parts.push(`<span class="mgv-scstk"><b>Loser</b> → ${escapeHTML(lose)}</span>`);
  if (!parts.length) return '';
  return `<div class="mgv-scstake">${parts.join('')}</div>`;
}

// "Seed 2 · 2–0 in pools" — who this team is and how they got here, under their name on a BRACKET card
// (round 2026-08-25, screen 37: "its too bland"). The seed is the one generate_bracket_atomic wrote onto
// the team row; the record is counted off the POOL games by computeSeeding. A clause whose fact is missing
// is dropped, and a pool card gets no sub-line at all — in pools the seed does not exist yet.
function mgScoreSubLine(match, side) {
  if (!match || match.phase !== 'main') return '';
  const teams = Array.isArray(state.tournamentTeams) ? state.tournamentTeams : [];
  const id = side === 'a' ? match.team_a_id : match.team_b_id;
  const team = teams.find((x) => x && x.id === id);
  const seed = team ? team.seed : null;
  if (seed == null || !Number.isFinite(Number(seed))) return '';
  const bits = ['Seed ' + Number(seed)];
  const poolMatches = (Array.isArray(state.tournamentMatches) ? state.tournamentMatches : []).filter((m) => m.phase === 'pool');
  const row = computeSeeding(teams, poolMatches).find((r) => r.teamId === id);
  if (row && (row.wins || row.losses)) bits.push(row.wins + '–' + row.losses + ' in pools');
  return `<span class="mgv-scsub">${escapeHTML(bits.join(' · '))}</span>`;
}

// The primary action's label. The LEADER is what it names, so the button can never claim a winner the score
// contradicts (tapping a team swaps the numbers to match — see openMgScoreSheet).
function mgScoreFinalLabel(aName, bName, a, b, isFinal, pick) {
  const leader = a > b ? aName : (b > a ? bName : null);
  // A bracket winner with no score kept (2026-08-24 round): the tap alone is the result.
  if (!leader && pick && a === 0 && b === 0 && !isFinal) return 'Save winner · ' + (pick === 'a' ? aName : bName);
  if (!leader) return isFinal ? 'Enter a winning score' : 'Final · set the score to pick a winner';
  return (isFinal ? 'Save · ' : 'Final · ') + leader + ' wins ' + Math.max(a, b) + '–' + Math.min(a, b);
}

// The rule line in plain words from the TOURNAMENT'S OWN settings (Mike 2026-08-25: "always just say what the
// tournament settings have") — never a literal. scoringRulesFor drops the cap on the championship.
function mgScoreHint(match, rules) {
  const who = match.phase === 'main'
    ? ((match.side === 'grand_final' && Number(match.round) === 1) ? 'The championship goes' : 'Bracket games go')
    : 'Pool games go';
  return who + ' to ' + rules.target + (rules.winBy2 ? ', win by 2' : '') + (rules.cap != null ? ', cap ' + rules.cap + '.' : ', no cap.');
}

// Match-generic: handles phase 'pool' | 'main'. Content builder is pure (like buildMgTeamSheetHTML); the
// interactive steppers, the winner radio + the writes live in openMgScoreSheet. Writes: pool final →
// tdbSubmitResult, bracket final → tdbSubmitBracketResult, edit-final → tdbEditMatchScore, live →
// tdbSetLiveScore. Round 2026-08-03: a CENTRED popup on the shared dialog kit, one framed box, a row per
// team doing both jobs (winner radio + pill stepper), the consequence line, then one primary action.
function buildMgScoreSheetHTML(match, winner) {
  if (!match) return '';
  const teams = Array.isArray(state.tournamentTeams) ? state.tournamentTeams : [];
  const aName = teamNameById(teams, match.team_a_id) || 'Team A';
  const bName = teamNameById(teams, match.team_b_id) || 'Team B';
  const a = Math.max(0, Number(match.score_a) || 0);
  const b = Math.max(0, Number(match.score_b) || 0);
  const isFinal = match.status === 'final';
  const t = (Array.isArray(state.tournaments) ? state.tournaments : []).find((x) => x.id === match.tournament_id) || mgActiveTournament() || {};
  // Pass the match so the championship (grand final set 1) gets its published no-cap rule.
  const rules = scoringRulesFor(match.phase, t, match);
  const bits = [];
  if (match.phase === 'main') {
    bits.push(mgBracketMatchLabel(match));
  } else {
    const pool = (Array.isArray(state.tournamentPools) ? state.tournamentPools : []).find((p) => p.id === match.pool_id);
    if (pool) bits.push('Pool ' + (pool.label || ''));
    if (match.queue_order) bits.push('Game ' + match.queue_order); // Rn → Gn (round 2026-08-03)
  }
  if (match.net) bits.push('Net ' + match.net);
  const meta = bits.filter(Boolean).join(' · '); // the rule moved off the eyebrow into the hint (2026-08-25)
  // Which side is marked the winner. Explicit pick when the caller has one, else the score leader.
  const pick = winner || (a > b ? 'a' : (b > a ? 'b' : null));

  const head = `<div class="mgv-schead">`
    + `<span class="mgv-scwho">`
      + `<h3 id="mgv-sctitle">${escapeHTML(aName)} <span class="mgss-vs">vs</span> ${escapeHTML(bName)}</h3>`
      + `<span class="mgv-scmeta">${escapeHTML(meta)}</span>`
    + `</span>`
    + `<button type="button" class="mgv-scx pd-reg-sheetx" data-mgss="close" aria-label="Close">&times;</button></div>`;
  // One row per team doing BOTH jobs: tap the team to mark it the winner, use the stepper only if a score
  // was kept. A finished game is a same-winner correction (the RPC refuses a flip), so its radio is inert.
  // Round 2026-08-25 (screen 37): the name gained a seed/record sub-line and the pick gained a WINNER pill.
  // Both are ADDITIVE — every hook the sync loop and the click delegate read (data-mgss-winner, .mgv-scrow,
  // .mgv-scdot, .mgv-scname, .mgv-scstep, data-mgss-step, #mgss-a/#mgss-b) is untouched. The name and its
  // sub-line share one .mgv-scnb block so the 44px tap target still covers both lines. The pill rides
  // INSIDE the winner button at its right edge (the mockup's own place for it) rather than at the row's,
  // because production keeps the stepper on this row and the row's right edge is already spoken for; it is
  // absolutely positioned, so revealing it on .is-won never reflows the row.
  const row = (side, name, val) => {
    const won = pick === side;
    const sub = mgScoreSubLine(match, side);
    const pill = match.phase === 'main' ? `<span class="mgv-scwpill" aria-hidden="true">Winner</span>` : '';
    return `<div class="mgv-scrow${won ? ' is-won' : ''}">`
      + `<button type="button" class="mgv-scwin" data-mgss-winner="${side}" aria-pressed="${won ? 'true' : 'false'}"`
        + ` aria-label="${escapeHTMLText(name)} won this game"${isFinal ? ' disabled' : ''}>`
        + `<span class="mgv-scdot" aria-hidden="true"></span>`
        + `<span class="mgv-scnb"><span class="mgv-scname">${escapeHTML(name)}</span>${sub}</span>${pill}</button>`
      + `<span class="mgv-scstep">`
        + `<button type="button" class="mgss-sbtn mgv-scb" data-mgss-step="${side}" data-mgss-d="-1" aria-label="${escapeHTMLText(name)} minus one">&minus;</button>`
        + `<span class="mgss-sval mgv-scval" id="mgss-${side}">${val}</span>`
        + `<button type="button" class="mgss-sbtn mgv-scb" data-mgss-step="${side}" data-mgss-d="1" aria-label="${escapeHTMLText(name)} plus one">+</button>`
      + `</span></div>`;
  };
  // The design's hint read "The score is optional." It is NOT, and shipping that would be a
  // promise the app breaks: submit_match_score / edit_match_score derive the winner FROM the
  // scores and reject a tie, so a winner tap on 0-0 cannot be finalised. Inventing a nominal
  // 1-0 was refused deliberately - pool seeding is decided on point differential, so a made-up
  // score would corrupt the standings. The copy tells the truth instead. Making the original
  // sentence true needs a scoreless-final path in the DB (an RPC that accepts a winner with no
  // score); until then the tap still does real work - it picks the winner, and swaps the
  // numbers when a score is already in so the pick and the scoreboard can never disagree.
  // Design round 2026-08-24: the rule sentence leads (derived, per tournament), then the instruction. A
  // bracket winner can be saved WITHOUT a score (the RPC allows it for phase 'main'); a pool game cannot.
  const hint = mgScoreHint(match, rules) + ' ' + (isFinal
    ? 'Fixing the score. Same winner only. To change who won, clear the result first.'
    : (match.phase === 'main' ? 'Tap the team that won. Add the score if you kept one.' : 'Tap a team to mark them the winner, then enter the score.'));
  // The primary is live when the save would be accepted: a bracket game needs a pick (score optional, a tied
  // non-zero score is still a tie); a pool game needs a decided score. Round 2026-08-25: a FINISHED bracket
  // game with no score on it is the one case the pick alone cannot save. edit_match_score derives the winner
  // from the scores, so re-submitting 0-0 is refused; the primary stays dead until a point goes in.
  const canFinal = match.phase === 'main' ? (!!pick && !(a === b && a > 0) && !(isFinal && a === 0 && b === 0)) : a !== b;
  const body = `<div class="mgv-scbody">`
    + `<div class="mgv-scbox">${row('a', aName, a)}${row('b', bName, b)}</div>`
    + `<div class="mgv-schint">${escapeHTML(hint)}</div>`
    + `<div class="mgss-err" id="mgss-err" hidden></div>`
    + mgScoreNextHTML(match)
    + `</div>`;
  const primary = `<button type="button" class="mgv-scfinal" data-mgss="${isFinal ? 'edit' : 'final'}"${canFinal ? '' : ' disabled'}>`
    + `${escapeHTML(mgScoreFinalLabel(aName, bName, a, b, isFinal, pick))}</button>`;
  // "add to the score card a way for live scoring that can be saved" (2026-08-24): the secondary saves the
  // running score and keeps the game in progress.
  const quiet = isFinal ? '' : `<button type="button" class="mgv-sclive" data-mgss="live">${match.status === 'live' ? 'Update live score' : 'Save live score'}</button>`;
  // C101 Task 5 / migration 0062: "Clear this result", never "Undo". Mike removed the Undo strip, the
  // bracket page bans the literal, the clear lives in the score CARD and not on the page, and the edit
  // hint above already says "clear the result first", which this makes true.
  // Admin only: a signed-in player may SCORE a not-yet-final game (canScoreMatch) and must never clear one.
  // It carries .mgv-sclive too, deliberately: the two never render together (one is the not-final
  // secondary, the other the final-only one), and borrowing that class's geometry keeps the foot on one
  // rhythm AND inherits the font-size that already counters prod's button { font-size: 16px !important }
  // iOS guard, so this round adds no !important of its own. .mgv-scclear only repaints it.
  const clear = (isFinal && state.isAdmin)
    ? `<button type="button" class="mgv-sclive mgv-scclear" data-mgss="clear">Clear this result</button>` : '';
  return head + body + `<div class="mgv-scfoot">${primary}${quiet}${clear}</div>`;
}

function closeMgScoreSheet() { const el = document.getElementById('mgss-sheet'); if (el) el.remove(); }

function openMgScoreSheet(matchId) {
  const match = (Array.isArray(state.tournamentMatches) ? state.tournamentMatches : []).find((m) => m.id === matchId);
  if (!canScoreMatch(match)) return; // admins, or a signed-in player on a not-yet-final game (2026-08-25)
  closeMgScoreSheet();
  const aName = teamNameById(state.tournamentTeams, match.team_a_id) || 'Team A';
  const bName = teamNameById(state.tournamentTeams, match.team_b_id) || 'Team B';
  const isFinal = match.status === 'final';
  let a = Math.max(0, Number(match.score_a) || 0);
  let b = Math.max(0, Number(match.score_b) || 0);
  // Which team is marked the winner (round 2026-08-03). Seeded from the recorded winner on a finished game,
  // else from whoever leads the score.
  let pick = isFinal && match.winner_team_id
    ? (match.winner_team_id === match.team_a_id ? 'a' : 'b')
    : (a > b ? 'a' : (b > a ? 'b' : null));
  let submitting = false;
  // A centred popup on the shared dialog kit (was the pools slide-up). Both phases use this one sheet, so the
  // pools board gets the same popup — the round's CSS is scoped to #mgss-sheet, not to a bracket-only class.
  const scrim = document.createElement('div');
  scrim.id = 'mgss-sheet';
  scrim.className = 'popup-overlay';
  scrim.style.display = 'flex';
  scrim.innerHTML = `<div class="popup-card card mgv-sccard" role="dialog" aria-modal="true" aria-labelledby="mgv-sctitle"`
    + ` aria-label="${escapeHTMLText(isFinal ? 'Edit result' : 'Enter score')}">${buildMgScoreSheetHTML(match, pick)}</div>`;
  document.body.appendChild(scrim);
  // Fix round 1 (2026-08-25): opened from the keyboard, the bracket row that fired this still holds focus
  // BEHIND a role="dialog" aria-modal card — a second Enter/Space would tear the card down and rebuild it,
  // losing the pick. Move focus into the card, onto the close button: the one control every card has, in
  // every state (a pool card's primary starts disabled). Deferred a tick, like the team sheet's field
  // focus, so the node is mounted before it is asked to take focus.
  setTimeout(() => {
    const x = scrim.querySelector('[data-mgss="close"]');
    if (x && x.focus) { try { x.focus({ preventScroll: true }); } catch (_) { try { x.focus(); } catch (_e) {} } }
  }, 0);
  const errEl = () => document.getElementById('mgss-err');
  const fail = (msg) => { const e = errEl(); if (e) { e.textContent = msg; e.hidden = false; } };
  const sync = () => {
    const ea = document.getElementById('mgss-a'), eb = document.getElementById('mgss-b');
    if (ea && ea.textContent !== String(a)) { ea.textContent = String(a); mPlay(ea, 'm-bump', 240); }
    if (eb && eb.textContent !== String(b)) { eb.textContent = String(b); mPlay(eb, 'm-bump', 240); }
    scrim.querySelectorAll('[data-mgss-winner]').forEach((wb) => {
      const on = wb.getAttribute('data-mgss-winner') === pick;
      wb.setAttribute('aria-pressed', on ? 'true' : 'false');
      const row = wb.closest('.mgv-scrow');
      if (row) {
        const was = row.classList.contains('is-won');
        row.classList.toggle('is-won', on);
        if (on && !was) mPlay(row, 'm-flash', 440); // motion (2026-08-24): the score commits, the row washes green
      }
    });
    const btn = scrim.querySelector('.mgv-scfinal');
    if (btn) {
      // C101 Task 5: brought into line with the build-time expression at buildMgScoreSheetHTML. A FINISHED
      // bracket game with no score on it cannot be re-submitted (edit_match_score derives the winner from
      // the scores and refuses 0-0), so the primary must stay dead until a point goes in.
      const canFinal = match.phase === 'main'
        ? (!!pick && !(a === b && a > 0) && !(isFinal && a === 0 && b === 0))
        : a !== b;
      if (canFinal) btn.removeAttribute('disabled'); else btn.setAttribute('disabled', 'true');
      btn.textContent = mgScoreFinalLabel(aName, bName, a, b, isFinal, pick);
    }
  };
  // After a write: Manage repaints its own board; the public Tournament tab rebuilds its container (standings
  // are derived from matches, so a public save re-sorts and renumbers with no client arithmetic).
  const afterSave = () => { if (activeMainTab === 'manage') repaintManage(); else partialRenderTournament(); };
  const doFinal = async () => {
    if (submitting) return;
    const scoreless = match.phase === 'main' && !isFinal && a === 0 && b === 0 && !!pick;
    if (!scoreless && a === b) { fail('A game can\'t end in a tie.'); return; }
    submitting = true;
    try {
      if (scoreless) {
        await tdbSubmitBracketResult(match, pick, '', ''); // the tap alone is the result (submit_match_score p_winner_side)
      } else {
        if (!(await confirmBigMargin(String(a), String(b)))) { submitting = false; return; }
        if (isFinal) await tdbEditMatchScore(match, String(a), String(b));
        else if (match.phase === 'main') await tdbSubmitBracketResult(match, a > b ? 'a' : 'b', String(a), String(b));
        else await tdbSubmitResult(match, String(a), String(b));
      }
      await tdbRefreshTournaments();
      closeMgScoreSheet();
      afterSave();
    } catch (e) { fail((e && e.message) || 'Could not save the result.'); submitting = false; }
  };
  const doLive = async () => {
    if (submitting) return;
    if (a === 0 && b === 0) { fail('Add a point to at least one team first.'); return; } // never flip a scheduled game live at 0-0
    submitting = true;
    try {
      await tdbSetLiveScore(match, a, b);
      await tdbRefreshTournaments();
      closeMgScoreSheet();
      afterSave();
    } catch (e) { fail((e && e.message) || 'Could not update the live score.'); submitting = false; }
  };
  const doClear = async () => {
    if (submitting) return;
    // The confirm's second sentence is true ONLY because guard (e) in 0062 refuses a live downstream game.
    // If that guard is ever loosened, this copy has to warn that a game in progress is wiped.
    const ok = await appConfirm({
      title: 'Clear this result',
      message: 'The score goes and the teams it sent through come back. This cannot be undone.',
      confirmText: 'Clear it',
      danger: true,
    });
    if (!ok) return;
    submitting = true;
    try {
      await tdbClearBracketResult(match);
      await tdbRefreshTournaments();
      closeMgScoreSheet();
      afterSave();
    } catch (e) { fail((e && e.message) || 'Could not clear the result.'); submitting = false; }
  };
  scrim.addEventListener('click', (ev) => {
    if (ev.target === scrim) { closeMgScoreSheet(); return; }
    // Tap a team to mark them the winner. If a score is already on the board and it contradicts the pick, the
    // two numbers swap so the button can never read "X wins 7–9" — the DB derives the winner from the score.
    const win = ev.target.closest('[data-mgss-winner]');
    if (win) {
      if (isFinal) return; // edit mode is a same-winner correction; the RPC refuses a flip
      const side = win.getAttribute('data-mgss-winner');
      pick = side;
      if (a !== b && ((side === 'a' && b > a) || (side === 'b' && a > b))) { const s = a; a = b; b = s; }
      const e = errEl(); if (e) e.hidden = true;
      sync();
      return;
    }
    const step = ev.target.closest('[data-mgss-step]');
    if (step) {
      const side = step.getAttribute('data-mgss-step');
      const d = Number(step.getAttribute('data-mgss-d')) || 0;
      if (side === 'a') a = Math.max(0, a + d); else b = Math.max(0, b + d);
      if (a !== b) pick = a > b ? 'a' : 'b'; // the score is the stronger signal while it is being edited
      const e = errEl(); if (e) e.hidden = true;
      sync();
      return;
    }
    const act = ev.target.closest('[data-mgss]');
    if (!act) return;
    const role = act.getAttribute('data-mgss');
    if (role === 'close') { closeMgScoreSheet(); return; }
    if (role === 'final' || role === 'edit') { void doFinal(); return; }
    if (role === 'live') { void doLive(); return; }
    if (role === 'clear') { void doClear(); return; }   // C101 Task 5
  });
}

// ── Task 7 pool-setup handlers (wired from the manage click delegate under mgtView==='pools') ────────────
async function mgPoolsDraw() {
  if (!state.isAdmin) return;
  const t = mgActiveTournament();
  if (!t) return;
  const teams = state.tournamentTeams || [];
  if (teams.length < 2) { appNotice({ title: 'Add teams first', message: 'You need at least 2 teams to draw pools.' }); return; }
  const pcEl = document.getElementById('mgps-poolcount');
  const ncEl = document.getElementById('mgps-nets');
  const pc = Math.max(1, Math.floor(Number(pcEl && pcEl.value) || Number(t.pool_count) || 1));
  const nc = Math.max(1, Math.floor(Number(ncEl && ncEl.value) || Number(t.net_count) || 1));
  try {
    await tdbSetTournamentFields(t.id, { pool_count: pc, net_count: nc });
    await tdbDrawPoolsAtomic({ ...t, pool_count: pc, net_count: nc });
    await tdbRefreshTournaments();
    repaintManage();
  } catch (err) { appNotice({ title: 'Could not draw pools', message: (err && err.message) || 'Try again.' }); }
}

async function mgPoolsStart() {
  if (!state.isAdmin) return;
  const t = mgActiveTournament();
  if (!t) return;
  const unpaid = (state.tournamentTeams || []).filter((tm) => !tm.paid).length;
  if (unpaid > 0 && !(await appConfirm({ title: 'Unpaid teams', message: `${unpaid} team${unpaid === 1 ? '' : 's'} not marked paid. Start pool play anyway?`, confirmText: 'Start anyway' }))) return;
  try {
    await tdbStartPoolPlayAtomic(t);
    await tdbRefreshTournaments();
    repaintManage();
  } catch (err) { appNotice({ title: 'Could not start pool play', message: (err && err.message) || 'Try again.' }); }
}

async function mgPoolsRedraw() {
  if (!state.isAdmin) return;
  const t = mgActiveTournament();
  if (!t) return;
  if (!(await appConfirm({ title: 'Draw again', message: 'Shuffle the teams into new pools?', confirmText: 'Draw again' }))) return;
  try {
    await tdbDrawPoolsAtomic(t);
    await tdbRefreshTournaments();
    repaintManage();
  } catch (err) { appNotice({ title: 'Could not draw pools', message: (err && err.message) || 'Try again.' }); }
}

// The nets a typed field means. "1, 2" / "1 2" / "1,2," all parse the same, and anything that is not a
// number is dropped rather than becoming NaN. Split out of the old prompt flow (round 2026-08-24) so the
// inline Save nets button and any future caller share ONE parser.
function mgPoolsParseNets(input) {
  return String(input == null ? '' : input).split(/[,\s]+/).map((s) => parseInt(s, 10)).filter((n) => !isNaN(n));
}

// The write half. tdbSetPoolNets dedupes, refuses an empty list, and re-lays the pool's UNPLAYED games
// round-aware behind a per-row version CAS — played games are never touched. It throws on a refused write,
// so every caller wraps it and surfaces the reason through appNotice.
async function mgPoolsApplyNets(pool, nets) {
  await tdbSetPoolNets(pool, nets, state.tournamentMatches || []);
  await tdbRefreshTournaments();
  repaintManage();
}

// Fix wave (2026-08-25 final review): the double-tap guard this write shipped without. tdbSetPoolNets
// re-nets the pool's unplayed games one row at a time, each under its own version CAS, and the versions it
// compares against come from the collections loaded BEFORE the first tap. A second tap while the first
// write is still open therefore sends the stale version, the CAS rejects it, and the organizer is told
// "Another device just updated a game" about a save that had in fact landed — with the field reopened on a
// pool whose nets were already correct. Same shape as mgTeamAddInFlight: a module flag turns the re-entry
// into a no-op, the button greys for the duration, and the finally restores both however the path ends.
let mgPoolsNetsInFlight = false;

// Save nets from the card's inline field. The field closes with the save that succeeded and comes BACK if
// the write was refused, so a rejected list (empty, say) can be fixed where it was typed.
async function mgPoolsSaveNets(poolId) {
  if (!state.isAdmin || mgPoolsNetsInFlight) return;
  const pool = (state.tournamentPools || []).find((p) => String(p.id) === String(poolId));
  if (!pool) return;
  const field = document.getElementById('pc-nin-' + poolId);
  const nets = mgPoolsParseNets(field ? field.value : '');
  // Held by reference, not re-queried in the finally: a save that succeeds repaints the panel, so a second
  // lookup would find a different element (or none at all).
  const btn = document.querySelector('[data-pc-savenets]');
  mgPoolsNetsInFlight = true;
  if (btn) btn.disabled = true;
  try {
    mgpNetsEditPoolId = null;
    await mgPoolsApplyNets(pool, nets);
  } catch (err) {
    mgpNetsEditPoolId = pool.id;
    repaintManage();
    appNotice({ title: 'Could not update nets', message: (err && err.message) || 'Try again.' });
  } finally {
    mgPoolsNetsInFlight = false;
    if (btn) btn.disabled = false;
  }
}

// Move a team into another pool. Offered only where move_team_to_pool would ACCEPT it: neither the pool it
// leaves nor the pool it joins may hold a final or a live game, and the tournament must still be in setup or
// pools (mgPoolCardHTML and the team sheet both draw off that same rule, mgPoolIsPlaying). The writer is the
// RPC, not a teams.pool_id update: the client builds the two pools' new unplayed schedules with poolMovePlan
// and the server deletes, inserts and flips them in one transaction, returning the games it wrote. A move
// made BEFORE the draw sends an EMPTY plan, because there is no schedule to rebuild yet. On success the
// destination card flashes, so the answer to "where did it go" is on screen rather than a scroll away.
async function mgPoolsMoveTeam(teamId, poolId) {
  if (!state.isAdmin || !teamId || !poolId) return;
  // TWO tries on purpose (fix round 1). The write and the redraw fail for different reasons and mean
  // different things: a refresh that fails AFTER the move landed must never be reported as "could not move
  // the team", because the team DID move and that notice invites a second tap on a write that succeeded.
  // C101 review wave: the write is now ONE call to move_team_to_pool, which rewrites both pools' unplayed
  // schedules atomically and hands back the number of games it wrote. It refuses when either pool holds a
  // final or a live game, when the tournament is past pool play, and it answers 0 to a same-pool tap. So
  // the first try is a real transaction and not a pool_id update, and its message is the server's.
  try {
    await tdbMoveTeamToPool(teamId, poolId);
  } catch (err) {
    appNotice({ title: 'Could not move the team', message: (err && err.message) || 'Try again.' });
    return;
  }
  mgpMoveTeamId = null;
  try {
    await tdbRefreshTournaments();
    repaintManage();
    let card = null;
    try { card = document.querySelector('[data-pc-card="' + String(poolId).replace(/["\\]/g, '\\$&') + '"]'); } catch { card = null; }
    mPlay(card, 'm-flash', 600);
  } catch (err) {
    appNotice({ title: 'The team moved', message: 'The page could not refresh just now. The next sync will show it in its new pool.' });
  }
}

// The inline nets field the repaint just drew is a NEW element, so focusing it has to wait one tick past
// repaintManage's innerHTML swap. Null-guarded at every step: a repaint the poll guard bailed, or a panel
// that closed under the tap, simply leaves nothing to focus.
function mgpFocusNetsField(poolId) {
  setTimeout(() => {
    try {
      const el = document.getElementById('pc-nin-' + poolId);
      if (el && typeof el.focus === 'function') el.focus();
    } catch {}
  }, 0);
}

async function mgPoolsResetPools() {
  if (!state.isAdmin) return;
  const t = mgActiveTournament();
  if (!t) return;
  const nm = (t.name || '').trim() || 'this tournament';
  const typed = await appPrompt({ title: 'Reset pools', message: `This clears every pool result and re-draws. Type the tournament name to confirm.`, placeholder: nm, confirmText: 'Reset pools' });
  if (String(typed || '').trim() !== nm) return;
  try {
    await tdbSetTournamentFields(t.id, { status: 'setup' });
    if (typeof _autoGenPrompted !== 'undefined' && _autoGenPrompted) delete _autoGenPrompted[t.id];
    await tdbDrawPoolsAtomic({ ...t, status: 'setup' });
    await tdbRefreshTournaments();
    mgpControlsOpen = false; mgpMoveTeamId = null; mgpNetsEditPoolId = null;
    repaintManage();
  } catch (err) { appNotice({ title: 'Could not reset pools', message: (err && err.message) || 'Try again.' }); }
}

// ── Task 8 (pick R10-C): Bracket admin — by-round tap-to-score rows + editor sheet + persisted seed ─────
// mgtView==='bracket'. Three states off tournament.status:
//   pre-bracket (setup / pools) → the seeding list (rank + team name + ▲/▼ reorder) + Generate the bracket
//     (mockup bk-c). Generate persists the FINAL order into tournaments.seed_override (0049) then runs the
//     existing tdbGenerateBracket → generate_bracket_atomic. Pre-0049 tolerant (see mgBracketGenerate).
//   live (bracket) → compact rows grouped BY ROUND (Winners / Losers / Grand Final, mockup bk2-c). Every
//     resolved row (live, up-next, final) opens the SHARED body-level openMgScoreSheet(matchId) from T7 —
//     match-generic on phase 'main', so there is NO second editor. Unresolved (TBD) rows render muted +
//     non-tappable. Rows repaint live via the poll (the manage container swap; the score sheet is body-level
//     → immune), so no partialRender exception is needed here.
//   completed → the final rows + a quiet "close-out lives in its own page" line.
// §51 matte, Barlow display, single --accent, flat on stone (mgbk-* kit per bk2-c/bk-c values).
const MGBK_UP_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>';
const MGBK_DN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
// The check that rides beside a winning team's name on a two-line scoreboard (round 2026-08-03).
const MGBK_WIN_SVG = '<svg class="mgv-bkw" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 13 4 4L19 7"/></svg>';

// The tournament the Bracket view manages. Unlike the other sub-views, this one has a COMPLETED state
// (bk2-c) — and manageLeadTournament() deliberately excludes 'completed'. Resolve the ACTIVE tournament
// first (the one being managed, whose teams/matches are already loaded into state for activeTournamentId),
// falling back to the lead resolver when there is no active id.
function mgBracketTournament() {
  const byActive = state.activeTournamentId ? (state.tournaments || []).find((x) => x.id === state.activeTournamentId) : null;
  return byActive || manageLeadTournament();
}

// The bracket games that COUNT toward a total, in one place. A double-elimination bracket always carries a
// reset championship (grand_final round 2), but it is only ever played when the losers side wins the first
// one — so a bracket that never needs it would read "13 of 14" forever. It is excluded while it is still
// empty and unplayed, and counted the moment it has teams or a result.
// Fix wave (2026-08-25 final review, from the drive on the live August bracket): this rule used to live
// inline in mgBracketStripHTML only, so the tournament page's Bracket row counted every main row and read
// "26 of 31" under a strip reading "26 of 30". One helper, both callers, no way to disagree again.
function mgBracketCountable(main) {
  const list = Array.isArray(main) ? main : [];
  return list.filter((m) => !(m && m.side === 'grand_final' && Number(m.round) === 2
    && !m.team_a_id && !m.team_b_id && m.status !== 'final'));
}

// The running bracket's state in one strip (round 2026-08-25, mockup mgbk-run): what kind of event this is,
// how many games are in, and — the line that actually runs the day — what is on a net right now. Every
// number is derived, nothing is stored. `champName` is passed in rather than recomputed so the block above
// and the line here can never disagree about who won.
function mgBracketStripHTML(t, main, teams, champName) {
  const gn = bracketGameNumbers(main).byId;
  const total = mgBracketCountable(main).length;
  const done = main.filter((m) => m.status === 'final').length;
  const nets = Number(t && t.net_count) || 0;
  const live = main.filter((m) => m.status === 'live' && m.net != null).sort((a, b) => a.net - b.net);
  const playable = main.filter((m) => m.status !== 'final' && m.team_a_id && m.team_b_id);
  let now;
  // The champion line only speaks when the board actually backs it up: a close-out can STORE a champion on
  // a tournament that still has an unplayed game, and "Every game is in" would be a lie on that page.
  if (champName && total && done === total) now = `Every game is in. <b>${escapeHTML(champName)}</b> takes it.`;
  else if (live.length) now = 'On the nets now: ' + live.map((m) => `<b>G${gn[m.id]} on Net ${escapeHTML(String(m.net))}</b>`).join(', ') + '. Tap a game to pick its winner.';
  else if (playable.length) now = 'Up next: ' + playable.slice(0, 3).map((m) => `<b>G${gn[m.id]}</b>`).join(', ') + '. Tap a game to pick its winner.';
  else if (total && done === total) now = 'Every game is in.';
  else now = 'No game is playable, the next round needs results first.';
  return `<div class="bkr-strip">`
    + `<div class="bkr-eye">DOUBLE ELIMINATION · ${teams.length} TEAMS · ${nets} NETS</div>`
    + `<div class="bkr-count">${done} of ${total} games in</div>`
    + `<div class="bkr-bar"><span style="width:${total ? Math.round(done / total * 100) : 0}%"></span></div>`
    + `<p class="bkr-now">${now}</p></div>`;
}

// The champion block (mockup mgbk-run), rendered only once the bracket has actually decided. The champion
// is the STORED one when a close-out recorded it, else the computed grand-final winner — resolveHistoryChampion
// already owns that precedence, so this never re-derives it. The sub-line drops any clause whose fact is
// missing (a pre-0049 team row carries no seed; a bracket-only event has no pool record).
function mgBracketChampHTML(t, main, teams) {
  const champ = resolveHistoryChampion(t || {}, teams, main);
  if (!champ || !champ.teamId) return '';
  const gn = bracketGameNumbers(main).byId;
  const isGF = (r) => (m) => m.side === 'grand_final' && Number(m.round) === r && m.status === 'final';
  const decider = main.find(isGF(2)) || main.find(isGF(1)); // the reset game decides when it was played
  const team = teams.find((x) => x && x.id === champ.teamId);
  const bits = [];
  const seed = team ? team.seed : null;
  if (seed != null && Number.isFinite(Number(seed))) bits.push('Seed ' + Number(seed));
  const poolMatches = (Array.isArray(state.tournamentMatches) ? state.tournamentMatches : []).filter((m) => m.phase === 'pool');
  const row = computeSeeding(teams, poolMatches).find((r) => r.teamId === champ.teamId);
  if (row && (row.wins || row.losses)) bits.push(row.wins + '–' + row.losses + ' in pools');
  const g = decider ? gn[decider.id] : null;
  bits.push(g ? ('won the championship, G' + g) : 'won the championship');
  return `<div class="bkr-champ">`
    + `<div class="bkr-champe">Champion</div>`
    + `<div class="bkr-champn">${escapeHTML(champ.name)}</div>`
    + `<div class="bkr-champs">${escapeHTML(bits.join(' · '))}</div></div>`;
}

function buildMgBracketHTML() {
  const t = mgBracketTournament();
  const header = `<div class="pd-pagehdr">`
    + `<button type="button" class="pd-back" data-mgt-back aria-label="Back to Tournament">${PK_BACK_SVG}</button>`
    + `<div class="pd-htitle">Bracket &amp; scores</div></div>`;
  if (!t) return header + `<div class="pd-empty">No tournament to build a bracket for yet.</div>`;
  const status = t.status || 'setup';
  if (status === 'bracket' || status === 'completed') {
    // Round 2026-08-03 (README §10): controls ride at the TOP (the public-bracket link only) and the
    // destructive Reset closes the page under a plain hairline, so the board itself is what you land on.
    // Round 2026-08-25: the champion block, then the progress strip, sit between the controls and the board
    // — the answer to "where are we" before the list of games that answers "what next".
    const teams = Array.isArray(state.tournamentTeams) ? state.tournamentTeams : [];
    const main = (Array.isArray(state.tournamentMatches) ? state.tournamentMatches : []).filter((m) => m.phase === 'main');
    const champ = main.length ? resolveHistoryChampion(t, teams, main) : null;
    const strip = main.length ? mgBracketChampHTML(t, main, teams) + mgBracketStripHTML(t, main, teams, champ && champ.name) : '';
    return header + mgBracketControlsHTML(t, status === 'completed') + strip + mgBracketLiveHTML(t) + mgBracketResetHTML();
  }
  return header + mgBracketSeedingHTML(t);
}

// Pre-bracket seeding (mockup bk-c): the cross-pool seed order (computeSeeding — win% then point diff) with
// the admin's transient ▲/▼ override applied. REUSES the old shell's seed-override MUTATION (state.seedOverride
// shape + currentSeedOrder), rendered as the flat bk-c list. Generate is locked until every pool game is final
// (tdbGenerateBracket enforces it server-checked too).
function mgBracketSeedingHTML(t) {
  const teams = Array.isArray(state.tournamentTeams) ? state.tournamentTeams : [];
  const poolMatches = (Array.isArray(state.tournamentMatches) ? state.tournamentMatches : []).filter((m) => m.phase === 'pool');
  if (!poolMatches.length) {
    return `<div class="pl-sect">Seeding</div>`
      + `<div class="pd-empty">Draw pools and play them out first. The bracket seeds from the pool results. Set that up in Pools &amp; schedule.</div>`;
  }
  let rows = computeSeeding(teams, poolMatches);
  if (!rows.length) {
    return `<div class="pl-sect">Seeding</div>`
      + `<div class="pd-empty">Score a pool game to start the seeding. Teams rank by win %, then point differential.</div>`;
  }
  let custom = false;
  if (state.seedOverride && state.seedOverride.id === state.activeTournamentId) {
    const ov = state.seedOverride.order || [];
    const byId = {}; rows.forEach((r) => { byId[r.teamId] = r; });
    if (ov.length === rows.length && ov.every((id) => byId[id])) { rows = ov.map((id, i) => ({ ...byId[id], seed: i + 1 })); custom = true; }
  }
  const allFinal = poolMatches.every((m) => m.status === 'final' || !m.team_a_id || !m.team_b_id);
  const last = rows.length - 1;
  const seedRows = rows.map((r, i) => `<div class="mgbk-seed">`
    + `<span class="mgbk-sd">${i + 1}</span>`
    + `<span class="mgbk-snm">${escapeHTML(r.name)}</span>`
    + `<span class="mgbk-arr">`
      + `<button type="button" class="mgbk-ab" data-mgbk-seedup="${escapeHTMLText(String(r.teamId))}"${i === 0 ? ' disabled' : ''} aria-label="Move ${escapeHTMLText(r.name)} up">${MGBK_UP_SVG}</button>`
      + `<button type="button" class="mgbk-ab" data-mgbk-seeddown="${escapeHTMLText(String(r.teamId))}"${i === last ? ' disabled' : ''} aria-label="Move ${escapeHTMLText(r.name)} down">${MGBK_DN_SVG}</button>`
    + `</span></div>`).join('');
  const resetLink = custom ? `<button type="button" class="mgbk-seedreset" data-mgbk-seedreset>Reset to the computed seeding</button>` : '';
  const cta = `<button type="button" class="mgt-cta" data-mgbk-generate${allFinal ? '' : ' disabled'}>Generate the bracket</button>`;
  const note = allFinal
    ? `<div class="mgbk-note">Double elimination · seeding saves with the bracket · after this, score on the tree.</div>`
    : `<div class="mgbk-note">Finish every pool game first. The seeding is provisional until then.</div>`;
  return `<div class="pl-sect">Seeding · from pool results</div>${seedRows}${resetLink}${cta}${note}`;
}

// Group the bracket's main matches by round (side + round) and order the groups ACTIVE-FIRST (mockup bk2-c
// leads with the live round, then up-next, then finished, then still-TBD) — not raw play order. Within a
// group, rows keep queue/net play order.
function mgBracketGroups(main) {
  const byKey = {};
  main.forEach((m) => {
    const key = m.side + ':' + m.round;
    (byKey[key] = byKey[key] || { side: m.side, round: m.round, matches: [] }).matches.push(m);
  });
  const groups = Object.keys(byKey).map((k) => {
    const g = byKey[k];
    g.matches.sort((a, b) => (a.queue_order || 0) - (b.queue_order || 0));
    g.minQ = Math.min(...g.matches.map((m) => m.queue_order || 0));
    const resolved = g.matches.filter((m) => m.team_a_id && m.team_b_id);
    const hasLive = g.matches.some((m) => m.status === 'live');
    const hasReady = resolved.some((m) => m.status !== 'final' && m.status !== 'live');
    const allFinal = resolved.length > 0 && resolved.every((m) => m.status === 'final');
    g.prio = hasLive ? 0 : (hasReady ? 1 : (allFinal ? 2 : 3));
    g.allFinal = allFinal;
    return g;
  });
  groups.sort((a, b) => a.prio - b.prio || a.minQ - b.minQ);
  return groups;
}

// "G1–G4 and G8" from [8,1,2,3,4]. Contiguous runs collapse to a range; the last part joins with "and".
// Used by the closing "already done" row and by each group header's game-number range.
function mgBracketGameList(nums) {
  const list = [...new Set((nums || []).filter((n) => Number.isFinite(n)))].sort((a, b) => a - b);
  if (!list.length) return '';
  const parts = [];
  let start = list[0], prev = list[0];
  for (let i = 1; i < list.length; i++) {
    if (list[i] === prev + 1) { prev = list[i]; continue; }
    parts.push(start === prev ? 'G' + start : 'G' + start + '–G' + prev);
    start = prev = list[i];
  }
  parts.push(start === prev ? 'G' + start : 'G' + start + '–G' + prev);
  if (parts.length === 1) return parts[0];
  return parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
}

// The group's name in the round 2026-08-25 vocabulary ("Championship, never Final" reaches Manage): the
// grand final is the "Championship", the LAST round on each side is that side's "semifinal", and every
// earlier round is plain "Winners bracket" / "Losers bracket". maxRounds carries the last round number on
// each side, computed over EVERY main match (never the visible subset) so hiding the finished games can't
// rename a round. The stored matches.round_label is untouched: mgBracketGroupProgress parses it.
function mgBracketSideName(g, maxRounds) {
  if (g.side === 'grand_final') return 'Championship';
  const base = g.side === 'winners' ? 'Winners' : 'Losers';
  return (g.round >= ((maxRounds || {})[g.side] || 0)) ? base + ' semifinal' : base + ' bracket';
}

// The right-hand progress word in a group header: "live now" / "up next" / "done", or — when nothing in the
// group is playable yet — the feeder games it is waiting on ("needs G5, G6, G7"). A feeder is only NAMED when
// it is itself playable now (both teams known); otherwise the group is just "waiting", because pointing at a
// game that can't be played either tells the organiser nothing.
function mgBracketGroupProgress(g, all, gn) {
  if (g.matches.some((m) => m.status === 'live')) return 'live now';
  const resolved = g.matches.filter((m) => m.team_a_id && m.team_b_id);
  if (resolved.some((m) => m.status !== 'final')) return 'up next';
  // Task 1 left the bare word 'final' here when it renamed the round headers; round 2026-08-25 finishes the
  // job — on this page "final" is the NOUN (the championship), so a finished round says "done".
  if (resolved.length && resolved.every((m) => m.status === 'final')) return 'done';
  const byLabel = {};
  (all || []).forEach((m) => { if (m && m.round_label) byLabel[m.round_label] = m; });
  const need = [];
  g.matches.forEach((m) => {
    [[m.team_a_id, m.source_a], [m.team_b_id, m.source_b]].forEach(([id, src]) => {
      if (id || !src) return;
      const ref = String(src).replace(/^(?:Winner of|Loser of)\s+/, '');
      const feeder = byLabel[ref];
      if (!feeder || !feeder.team_a_id || !feeder.team_b_id) return;
      const num = (gn && gn.byId) ? gn.byId[feeder.id] : null;
      if (num && need.indexOf(num) === -1) need.push(num);
    });
  });
  if (!need.length) return 'waiting';
  return 'needs ' + need.sort((a, b) => a - b).map((n) => 'G' + n).join(', ');
}

// The live board (round 2026-08-03, README §10): every round is a boxed group with a tinted header carrying
// its name, its game-number range and its progress; every match is a two-line scoreboard. Games that are
// already FINAL are held back behind the closing "already done · Show" row (mgBracketShowDone) so the board
// shows what is live or next — unless hiding them would leave nothing at all (a completed tournament), in
// which case they stay on screen rather than emptying the page.
function mgBracketLiveHTML(t) {
  const teams = Array.isArray(state.tournamentTeams) ? state.tournamentTeams : [];
  const main = (Array.isArray(state.tournamentMatches) ? state.tournamentMatches : []).filter((m) => m.phase === 'main');
  if (!main.length) return `<div class="pd-empty">The bracket has no games yet.</div>`;
  const gn = bracketGameNumbers(main); // the EXISTING interleaved numbering (pure.js) — never a second scheme
  const isDone = (m) => m.status === 'final' && !!m.team_a_id && !!m.team_b_id;
  const done = main.filter(isDone);
  const rest = main.filter((m) => !isDone(m));
  const canHide = done.length > 0 && rest.length > 0;
  const hiding = canHide && !mgBracketShowDone;
  const shown = hiding ? rest : main;
  const maxRounds = { winners: 0, losers: 0 };
  main.forEach((m) => {
    if (m.side === 'winners' || m.side === 'losers') maxRounds[m.side] = Math.max(maxRounds[m.side], m.round || 0);
  });
  const groups = mgBracketGroups(shown).map((g) => {
    const range = mgBracketGameList(g.matches.map((m) => gn.byId[m.id]));
    const name = mgBracketSideName(g, maxRounds) + (range ? ' · ' + range : '');
    const rows = g.matches.map((m) => mgBracketRowHTML(m, teams, gn)).join('');
    return `<div class="mgv-bkr"><div class="mgv-bkrh">`
      + `<span>${escapeHTML(name)}</span>`
      + `<span class="mgv-bkrs">${escapeHTML(mgBracketGroupProgress(g, main, gn))}</span>`
      + `</div>${rows}</div>`;
  }).join('');
  const toggle = canHide
    ? `<button type="button" class="mgv-bkdone" data-mgbk-showdone>`
      + `<span>${escapeHTML(mgBracketGameList(done.map((m) => gn.byId[m.id])))} already done</span>`
      + `<span class="mgv-bkdonel">${hiding ? 'Show' : 'Hide'}</span></button>`
    : '';
  return groups + toggle;
}

// One bracket game as a two-line scoreboard. Left rail = the game number over its net chip (the net is what
// an organiser walks to, so it is not buried in the meta sentence). Body = team over team, the winner green
// + 700 with a check, scores in a right-aligned tabular column, then a meta line. The Live / Up next pill is
// ABSOLUTELY positioned (the row reserves padding-right:66px) — as a flex sibling it shrank the body and
// broke the score column. Resolved rows keep data-mgbk-score → the shared openMgScoreSheet. A placeholder
// (a slot still fed by an unfinished game) is score-less, muted, tinted and NOT tappable; it names its feeder.
function mgBracketRowHTML(m, teams, gn) {
  const num = (gn && gn.byId) ? gn.byId[m.id] : null;
  const gid = num ? ('G' + num) : (m.round_label || '').replace(/ M\d+$/, '');
  const net = m.net != null ? ('Net ' + m.net) : '';
  const hasBoth = !!(m.team_a_id && m.team_b_id);
  const srcA = bracketSourceLabel(m.source_a, gn && gn.byRoundLabel);
  const srcB = bracketSourceLabel(m.source_b, gn && gn.byRoundLabel);
  if (!hasBoth) {
    const aLbl = m.team_a_id ? teamNameById(teams, m.team_a_id) : (srcA || 'TBD');
    const bLbl = m.team_b_id ? teamNameById(teams, m.team_b_id) : (srcB || 'TBD');
    return `<div class="mgv-bkm is-tbd"><span class="mgv-bkid">${escapeHTML(gid)}</span><div class="mgv-bkb">`
      + `<div class="mgv-bkl"><span class="mgv-bkn">${escapeHTML(aLbl)}</span></div>`
      + `<div class="mgv-bkl"><span class="mgv-bkn">${escapeHTML(bLbl)}</span></div>`
      + `</div></div>`;
  }
  const rail = net
    ? `<span class="mgv-bkidw"><span class="mgv-bkid">${escapeHTML(gid)}</span><span class="mgv-bknet">${escapeHTML(net)}</span></span>`
    : `<span class="mgv-bkid">${escapeHTML(gid)}</span>`;
  const aN = escapeHTML(teamNameById(teams, m.team_a_id));
  const bN = escapeHTML(teamNameById(teams, m.team_b_id));
  const line = (name, score, win) => `<div class="mgv-bkl${win ? ' is-win' : ''}">`
    + `<span class="mgv-bkn">${name}${win ? MGBK_WIN_SVG : ''}</span>`
    + (score == null ? '' : `<span class="mgv-bks">${escapeHTML(String(score))}</span>`)
    + `</div>`;
  const idAttr = escapeHTMLText(String(m.id));
  let body = '';
  let pill = '';
  let cls = '';
  if (m.status === 'final') {
    const aWin = m.winner_team_id === m.team_a_id;
    const have = m.score_a != null && m.score_b != null;
    body = line(aN, have ? m.score_a : null, aWin) + line(bN, have ? m.score_b : null, !aWin)
      + `<div class="mgv-bkmeta">Tap to edit</div>`;
    // Round 2026-08-25 (mockup mgbk-run): a revealed finished game says so in the same slot Live / Up next
    // use, so every row on the board answers "where is this game" the same way.
    pill = `<span class="mgv-bkpill is-done">Done</span>`;
  } else if (m.status === 'live') {
    cls = ' is-live';
    body = line(aN, Number(m.score_a) || 0, false) + line(bN, Number(m.score_b) || 0, false)
      + `<div class="mgv-bkmeta">Tap to score</div>`;
    pill = `<span class="mgv-bkpill is-live">Live</span>`;
  } else {
    // scheduled / ready (both teams set) — up next, still tappable to score ahead
    const lower = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
    const feeders = (srcA && srcB) ? `${srcA} vs ${lower(srcB)}` : '';
    const meta = [feeders, net ? `starts when ${net} opens` : ''].filter(Boolean).join(' · ') || 'Up next';
    body = line(aN, null, false) + line(bN, null, false)
      + `<div class="mgv-bkmeta">${escapeHTML(meta)}</div>`;
    pill = `<span class="mgv-bkpill is-next">Up next</span>`;
  }
  // Round 2026-08-25: a resolved row IS a button, so it says so and takes focus. Only resolved rows get it —
  // a placeholder is not tappable, and a tab stop that does nothing is worse than no tab stop.
  return `<div class="mgv-bkm${cls}" role="button" tabindex="0" data-mgbk-score="${idAttr}">${rail}<div class="mgv-bkb">${body}</div>${pill}</div>`;
}

// The TOP of the bracket page: the completed note, then the one non-destructive control (the players' view).
// The destructive Reset lives in mgBracketResetHTML at the BOTTOM (round 2026-08-03).
function mgBracketControlsHTML(t, completed) {
  const doneNote = completed ? `<div class="mgbk-done">Tournament completed. Close-out lives in its own page.</div>` : '';
  return doneNote
    + `<div class="pl-sect">Bracket controls</div>`
    + `<button type="button" class="mgbk-players" data-mgbk-players>`
      + `<div class="mg-rb"><div class="mg-rn">Full bracket tree · the players' view</div>`
      + `<div class="mg-rs">Open the public bracket page</div></div>${MG_CHEV}</button>`;
}

// The BOTTOM of the bracket page: Reset closes the page under a plain hairline (.mgv-dsect is a label-less
// .pl-sect — just the rule), the same grammar the sub-hub's danger zone uses.
// C101 Task 6 (Mike's §38 answer, 2026-08-25, settled the same day): TWO danger controls on this strip,
// and they must not read alike. "Clear every result" is the OUTLINED one and sits ABOVE the delete;
// "Reset the bracket" is the ONE FILLED red button, and keeps its copy, its size and its position. Both
// stay behind the type-the-name unlock.
function mgBracketResetHTML() {
  return `<div class="pl-sect mgv-dsect" aria-hidden="true"></div>`
    + `<button type="button" class="mgts-danger mgts-danger-outline" data-mgbk-clear>Clear every result</button>`
    + `<div class="mgbk-note">Blanks every bracket score. The bracket keeps its shape and every seeded pairing stays. Type the tournament name to confirm.</div>`
    + `<button type="button" class="mgts-danger mgts-danger-filled" data-mgbk-reset>Reset the bracket</button>`
    + `<div class="mgbk-note">Clears the bracket and returns to pools. Pool games and scores are kept. Type the tournament name to confirm.</div>`;
}

// Nudge a team up (dir -1) / down (dir +1) one seed. Reuses the old shell's mutation exactly (currentSeedOrder
// + state.seedOverride keyed on the active tournament), then a container-swap repaint (no in-panel input to
// clobber → no full render()).
function mgBracketReseed(id, dir) {
  if (!state.isAdmin) return;
  const order = currentSeedOrder();
  const i = order.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return;
  const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
  state.seedOverride = { id: state.activeTournamentId, order };
  repaintManage();
}

// Generate the bracket: persist the FINAL seed order into tournaments.seed_override (0049), THEN run the
// existing tdbGenerateBracket → generate_bracket_atomic. PRE-0049 TOLERANCE: if the column does not exist yet
// the persist write throws (undefined column) — we swallow it and generate anyway (the override still applies
// in-session via the seedOrder argument), telling the admin it will be saved permanently after the update.
async function mgBracketGenerate() {
  if (!state.isAdmin) return;
  const t = mgBracketTournament();
  if (!t) return;
  const seedOrder = currentSeedOrder(); // the final order (the admin's override, or the computed seeding)
  let persisted = true;
  try {
    await tdbSetTournamentFields(t.id, { seed_override: seedOrder });
  } catch (err) {
    persisted = false; // 0049 not applied yet — proceed; the override still applies this run
    console.warn('seed_override persist (pre-0049?)', err);
  }
  try {
    await tdbGenerateBracket(t, seedOrder);
    state.seedOverride = null;
    state.tournamentPickedTeamId = null; state.bracketSide = null; state.bracketRound = null;
    if (typeof _autoGenPrompted !== 'undefined' && _autoGenPrompted) delete _autoGenPrompted[t.id];
    await tdbRefreshTournaments();
    repaintManage();
    if (!persisted) appNotice({ title: 'Bracket is live', message: 'Your seed order applied for this run. It will be saved permanently after the next app update.' });
  } catch (err) {
    appNotice({ title: 'Could not generate the bracket', message: (err && err.message) || 'Try again.' });
  }
}

// C101 Task 6: the NON-destructive clear. Same type-the-name unlock as the reset beside it (appPrompt), a
// different verb, and a read-back: the RPC returns the results it cleared, so the notice can say what
// happened instead of assuming it.
async function mgBracketClearAll() {
  if (!state.isAdmin) return;
  const t = mgBracketTournament();
  if (!t) return;
  const nm = (t.name || '').trim() || 'this tournament';
  const typed = await appPrompt({ title: 'Clear every result', message: 'This blanks every bracket score. The bracket keeps its shape and every seeded pairing stays. Type the tournament name to confirm.', placeholder: nm, confirmText: 'Clear every result' });
  if (String(typed || '').trim() !== nm) return;
  try {
    const n = await tdbClearWholeBracket(t.id);
    state.tournamentPickedTeamId = null; state.bracketSide = null; state.bracketRound = null;
    await tdbRefreshTournaments();
    repaintManage();
    appNotice({ title: 'Bracket cleared', message: n === 1 ? '1 result cleared. The bracket kept its shape.' : n + ' results cleared. The bracket kept its shape.' });
  } catch (err) { appNotice({ title: 'Could not clear the results', message: (err && err.message) || 'Try again.' }); }
}

// Reset the bracket (type-name unlock, like T6/T7): the existing tdbResetBracket deletes the phase='main'
// matches and drops status back to 'pools' — pool games and scores are kept. Re-arms the auto-generate prompt.
async function mgBracketReset() {
  if (!state.isAdmin) return;
  const t = mgBracketTournament();
  if (!t) return;
  const nm = (t.name || '').trim() || 'this tournament';
  const typed = await appPrompt({ title: 'Reset the bracket', message: 'This clears the bracket and returns to pools. Pool games and scores are kept. You can re-generate. Type the tournament name to confirm.', placeholder: nm, confirmText: 'Reset the bracket' });
  if (String(typed || '').trim() !== nm) return;
  try {
    await tdbResetBracket(t);
    if (typeof _autoGenPrompted !== 'undefined' && _autoGenPrompted) delete _autoGenPrompted[t.id];
    state.tournamentPickedTeamId = null; state.bracketSide = null; state.bracketRound = null;
    await tdbRefreshTournaments();
    repaintManage();
  } catch (err) { appNotice({ title: 'Could not reset the bracket', message: (err && err.message) || 'Try again.' }); }
}

// Full reset (2026-07-26) — the sub-hub danger control. Type-name unlock, same as the other two resets.
// Resolves via mgActiveTournament (not manageLeadTournament, which excludes 'completed') so a finished
// tournament can be reset too. Clears the client-side progress caches that survive a container repaint,
// then refreshes from the server so the sub-hub cannot lie about the new stage.
async function mgTournamentFullReset() {
  if (!state.isAdmin) return;
  const t = mgActiveTournament();
  if (!t) return;
  const nm = (t.name || '').trim() || 'this tournament';
  const typed = await appPrompt({ title: 'Reset the whole tournament', message: 'This clears the pools, the schedule, every score and the bracket, and puts the tournament back to setup. Your registered teams and their payments are kept. Type the tournament name to confirm.', placeholder: nm, confirmText: 'Reset everything' });
  if (String(typed || '').trim() !== nm) return;
  try {
    await tdbResetTournamentFull(t);
    if (typeof _autoGenPrompted !== 'undefined' && _autoGenPrompted) delete _autoGenPrompted[t.id];
    state.tournamentPickedTeamId = null; state.bracketSide = null; state.bracketRound = null; state.seedOverride = null;
    mgpControlsOpen = false; mgpMoveTeamId = null; mgpNetsEditPoolId = null;
    mgpPoolFilter = null;
    await tdbRefreshTournaments();
    repaintManage();
    appNotice({ title: 'Tournament reset', message: 'Back to setup. No pools, no schedule, no scores. Your registered teams are still here.' });
  } catch (err) { appNotice({ title: 'Could not reset the tournament', message: (err && err.message) || 'Try again.' }); }
}

// Delete the whole tournament (round 2026-08-03, README §7) — the Danger zone's irreversible row. Same shape
// as mgTournamentFullReset above: mgActiveTournament (so a COMPLETED event can be deleted too), the
// type-the-tournament-name unlock, then the write. The handoff's copy carried an em dash; it is two plain
// sentences here (§ copy law).
// AFTER a proven delete the app must not keep pointing at a dead tournament: activeTournamentId and every
// per-tournament cache are cleared BEFORE the refresh, so nothing renders against an id that no longer
// exists even for the length of one round trip. tdbRefreshTournaments then re-resolves from the server.
async function mgTournamentDelete() {
  if (!state.isAdmin) return;
  const t = mgActiveTournament();
  if (!t) return;
  const nm = (t.name || '').trim() || 'this tournament';
  const nTeams = (state.activeTournamentId === t.id && Array.isArray(state.tournamentTeams))
    ? state.tournamentTeams.length : 0;
  // `plural` is a LOCAL helper inside buildManageTournamentHTML, not a global — spelled out here instead.
  const what = nTeams
    ? `the event, its ${nTeams} team${nTeams === 1 ? '' : 's'}, their payments and every result`
    : 'the event and every result';
  const typed = await appPrompt({
    title: 'Delete this tournament',
    message: `This removes ${what}, for players too. It cannot be undone. Type the tournament name to confirm.`,
    placeholder: nm,
    confirmText: 'Delete tournament',
    danger: true,
  });
  if (String(typed || '').trim() !== nm) return;
  try {
    await tdbDeleteTournament(t);
  } catch (err) {
    appNotice({ title: 'Could not delete the tournament', message: (err && err.message) || 'Try again.' });
    return;
  }
  if (typeof _autoGenPrompted !== 'undefined' && _autoGenPrompted) delete _autoGenPrompted[t.id];
  if (state.activeTournamentId === t.id) state.activeTournamentId = null;
  state.tournaments = (state.tournaments || []).filter((x) => x && x.id !== t.id);
  state.tournamentTeams = []; state.tournamentPools = []; state.tournamentMatches = []; state.teamMembers = null;
  state.tournamentPickedTeamId = null; state.bracketSide = null; state.bracketRound = null; state.seedOverride = null;
  mgtView = null; mgpControlsOpen = false; mgpMoveTeamId = null; mgpNetsEditPoolId = null;
  mgpPoolFilter = null; mgCloseoutChampId = undefined;
  await tdbRefreshTournaments();
  repaintManage();
  appNotice({ title: 'Tournament deleted', message: `${nm} is gone, along with its teams, payments and results.` });
}

// ── Create a tournament — the full SCREEN (round 2026-08-04) ──────────────────────────────────────────
// Delete shipped in the 2026-08-03 round with NO create path anywhere in Manage. The sub-hub's empty state
// pointed at "Open the old admin", a shell that was removed back in session 10/14, so the one instruction
// the app gave a stranded admin was impossible to follow. Mike hit exactly that: he deleted his July event,
// found no way to make a new one, and renamed the old JUNE row to "August 2026 tournament" as a workaround.
// A create POPUP (name / buy-in / Venmo) closed that hole the same day.
//
// This round replaces that popup with a SCREEN carrying the fields the design asks for. ONE create path,
// not two: the popup and everything that served it (mgCreateTournamentDialogHTML, openMgCreateTournamentPopup,
// closeMgCreateTournamentPopup, mgcSubmitCreate) are deleted, and both entry points — the chooser's top row
// and the sub-hub's dashed control — carry data-mgtl-new and open buildMgTournamentNewHTML.
//
// Deleted with it: mgCreateLiveWarning. It told the admin "players will see this new one instead as soon as
// you create it", which was true of a popup that left registration OPEN. This screen writes
// registration_open:false, so that sentence would now warn about something that does not happen, and a
// false warning is worse than none.
//
// NOTHING HERE IS A NEW WRITE. tdbCreateTournament inserts the row and is shared with two co-pilot actions
// (setup_tournament / create_tournament), so its signature is left alone: every extra field goes through
// the EXISTING tdbSetTournamentFields right after the insert — the same door Registration and Event
// settings already save them through.

// The screen's Create button. Reads the fields, locks the button for the round trip (two taps must never
// insert two tournaments), and hands off to mgTournamentCreate. THE SCREEN IS THE FAILURE SURFACE: on a
// refusal it stays put with the typing intact and states why inline, rather than navigating away from a
// form the admin would then have to retype.
async function mgntSubmitCreate(btn) {
  const readVal = (id) => { const n = document.getElementById(id); return n ? String(n.value || '') : ''; };
  const say = (text) => { const m = document.getElementById('mgnt-msg'); if (m) m.textContent = text; };
  say('');
  if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }
  const res = await mgTournamentCreate({
    name: readVal('mgnt-name'),
    // Date and Team cap read '' when their field was not rendered, which is exactly what a missing column
    // has to produce: mgTournamentCreate then sends no key for it at all.
    eventDate: readVal('mgnt-date'),
    teamCap: readVal('mgnt-cap'),
    teamSize: readVal('mgnt-teamsize'),
    nets: readVal('mgnt-nets'),
    buyIn: readVal('mgnt-buyin'),
    makeActive: mgntMakeActive,
  });
  if (res && res.ok) return;   // mgTournamentCreate already navigated and repainted
  if (btn) { btn.disabled = false; btn.textContent = 'Create tournament'; }
  say((res && res.error) || 'Could not create the tournament. Try again.');
}

// The flow. Returns { ok, id } / { ok:false, error } so the dialog can report inline and any other caller
// still gets the outcome. On ANY failure of the insert, no state moves at all — the app keeps managing
// whatever it was managing before, because a half-applied create is how you end up pointing at a ghost.
async function mgTournamentCreate({ name, eventDate, teamCap, teamSize, nets, buyIn, venmoLink, makeActive } = {}) {
  if (!state.isAdmin) return { ok: false, error: 'Only an admin can create a tournament.' };
  const nm = String(name == null ? '' : name).trim();
  if (!nm) return { ok: false, error: 'Give the tournament a name.' };
  const buy = String(buyIn == null ? '' : buyIn).trim();
  const venmo = String(venmoLink == null ? '' : venmoLink).trim();
  // A positive integer or nothing. A blank / NaN / zero entry falls through to tdbCreateTournament's own
  // default rather than writing a count that would break the pools draw — the same defensive parse the
  // Event settings fields use.
  const posInt = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? n : null; };
  const size = posInt(teamSize);
  const netCount = posInt(nets);
  const cap = posInt(teamCap);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(eventDate || '')) ? String(eventDate) : null;
  // The scoring rules the save-note promises to copy, read off the tournament Manage is pointed at.
  const preset = mgntPresetFrom(mgActiveTournament());
  if (size) preset.team_size = size;

  let created;
  try {
    // Counts ride the EXISTING signature (net_count + the preset); pool_count and everything the form does
    // not ask for keep tdbCreateTournament's own defaults, editable afterwards in Event settings.
    created = await tdbCreateTournament({ name: nm, net_count: netCount || undefined, preset });
  } catch (err) {
    const why = (err && err.message) ? String(err.message) : 'Try again.';
    return { ok: false, error: why + ' Nothing here changed.' };
  }
  if (!created || !created.id) {
    // The insert returned no row. Treat it exactly like a throw: claiming success off a missing id is the
    // silent-write failure mode the delete read-back exists to prevent.
    return { ok: false, error: 'The tournament did not come back from the database. Nothing here changed.' };
  }

  // buy_in is FREE DISPLAY TEXT in this app ("$80 a team") and is never parsed into a number — it prints as
  // written on the sub-hub, the announcement and the registration page. Only write the fields actually given;
  // an empty box must not overwrite anything with ''.
  const fields = {};
  if (buy) fields.buy_in = buy;
  if (venmo) fields.venmo_link = venmo;
  // registration_open:false is the ONE value this screen overrides on the shared insert. tdbCreateTournament
  // opens registration on every new row (its co-pilot callers depend on that), but this screen's own copy
  // promises the opposite twice — "nothing public until you open registration" on the create row and
  // "Registration stays closed until you open it." under the button. Flipping it here keeps the screen and
  // the database saying the same thing, without changing a helper two other callers share.
  fields.registration_open = false;
  // COLUMN-GUARDED. event_date and team_cap only exist after migration 0057. Sending a key for a column that
  // is not there is a PostgREST 42703 that fails the WHOLE update, so buy_in and registration_open would go
  // down with it. The guard is the loaded rows themselves, and the fields were not even rendered when it is
  // false, so there is nothing to lose by omitting them.
  if (day && tournamentHasEventDate()) fields.event_date = day;
  if (cap && tournamentHasTeamCap()) fields.team_cap = cap;
  let fieldsErr = '';
  let regStillOpen = false;
  try {
    await tdbSetTournamentFields(created.id, fields);
  } catch (err) {
    // The tournament EXISTS at this point, so this is not a failed create and must not be reported as one.
    // Say which part did not land and where to fix it, then carry on selecting the new row. registration
    // is called out separately because its failure has a consequence the others do not: the row keeps
    // tdbCreateTournament's registration_open:true, so it IS public, and the screen just promised it was not.
    fieldsErr = [buy ? 'buy-in' : '', venmo ? 'Venmo link' : '',
      fields.event_date ? 'date' : '', fields.team_cap ? 'team cap' : ''].filter(Boolean).join(' and ');
    regStillOpen = true;
  }

  // ORDER MATTERS HERE, and not for an obvious reason. tdbRefreshTournaments re-reads the list and then
  // NULLS state.activeTournamentId if that id is not in what came back — the stale-tournament guard added
  // 2026-06-27. Pointing at the new row BEFORE the refresh therefore hands the whole outcome to one SELECT:
  // if that read cannot see the row yet, the guard quietly wipes the selection and the admin lands back on
  // the empty state having just been told the tournament was created. So the refresh runs with the id
  // cleared (which also stops it reloading the OLD tournament's teams/pools/matches over the caches cleared
  // just below), and the selection is made after it, off the row the insert actually returned.
  const prevActiveId = state.activeTournamentId;
  state.activeTournamentId = null;
  state.tournamentTeams = []; state.tournamentPools = []; state.tournamentMatches = []; state.teamMembers = null;
  state.tournamentPickedTeamId = null; state.bracketSide = null; state.bracketRound = null; state.seedOverride = null;
  // Round 2026-08-04: land on the Manage HUB, per the design's interaction table, because the hub's card is
  // what reports which tournament Manage is now pointed at. mgtView is cleared regardless so a later trip
  // into the Tournament area never opens a sub-view belonging to the tournament that was open before.
  manageView = 'lead';
  mgtView = null;
  mgpControlsOpen = false; mgpMoveTeamId = null; mgpNetsEditPoolId = null;
  mgpPoolFilter = null; mgCloseoutChampId = undefined; mgBracketShowDone = false;
  await tdbRefreshTournaments();
  // "Manage it right away" (default ON) is what decides whether the new row becomes the managed one. With it
  // OFF the created tournament is a draft on the chooser list and Manage keeps editing whatever it was
  // editing — so the previous selection is restored rather than left null, which would hand the pointer back
  // to the lead resolver and silently switch him anyway.
  const adopt = (makeActive === undefined) ? true : !!makeActive;
  state.activeTournamentId = adopt ? created.id : prevActiveId;
  if (adopt) mgTournamentPinned = true;
  // The insert returned this row, so it exists whether or not the list read has caught up with it. A brand
  // new tournament has no teams, pools or matches, so the caches cleared above are already correct for it.
  if (!(state.tournaments || []).some((x) => x && x.id === created.id)) {
    state.tournaments = [created, ...(state.tournaments || [])];
  }
  mgntMakeActive = true;   // the form's switch goes back to its default for the next create
  repaintManage();
  // A create with the switch OFF leaves Manage pointed at the tournament it was already editing, whose
  // teams/pools/matches were cleared above so the refresh could not reload the wrong ones. Load them back,
  // or the hub would report zero teams for a tournament that has them.
  if (!adopt && prevActiveId) {
    Promise.resolve(tdbRefreshTournaments())
      .then(() => { if (activeMainTab === 'manage') repaintManage(); })
      .catch(() => {});
  }
  // The notice states what is actually true of the row that now exists. fieldsErr is only ever set from the
  // one follow-up update's catch, so it always arrives together with regStillOpen: either that write landed
  // whole or none of it did.
  const where = adopt ? `${nm} is the tournament Manage edits now.` : `${nm} is saved as a draft.`;
  const after = regStillOpen
    ? (fieldsErr
      ? `Nothing after the insert saved: registration is still OPEN and the ${fieldsErr} is not set. Fix both in Registration.`
      : 'Registration is still OPEN on it, because that setting did not save. Close it in Registration.')
    : 'Registration stays closed until you open it.';
  appNotice({ title: 'Tournament created', message: `${where} ${after}` });
  return { ok: true, id: created.id };
}
