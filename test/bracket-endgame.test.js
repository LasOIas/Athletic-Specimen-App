// The bracket endgame — the two confirmed audit findings about how a tournament actually FINISHES.
// (Mike, 2026-07-26 tournament morning: "fix it now the right way".)
//
// C78 — THE CHAMPIONSHIP CANNOT BE RECORDED PAST THE CAP.
//   The rules sheet Mike publishes says the championship is "One match to 21 pts. Win by 2, no cap", and the
//   reset match (set 2) is "to 21 pts. Win by 2, cap at 25". But scoringRulesFor returned the single
//   tournaments.bracket_cap (25) for EVERY main-phase match, so a legitimate 26-24 championship was refused
//   with "Above the cap of 25". Note the SERVER does not enforce a cap at all
//   (0005_c21_rpc_submit_match_score.sql validates only: scores >= 0, no ties, winner matches the scores) —
//   this was purely a client-side refusal, so it is fixable without a migration.
//
// C80 — FINISHING THE TOURNAMENT LOCKS YOU OUT OF CROWNING THE CHAMPION.
//   Scoring the grand final calls submit_match_score, which sets `status = 'completed'`
//   (0005_c21_rpc_submit_match_score.sql:65) but NEVER sets champion_team_id. close_tournament then refuses
//   to run (0050_closeout.sql:53 — "not in ('pools','bracket')"), and the close-out page's completed branch
//   printed "No champion recorded" with nothing but a Reopen button. The champion the bracket already knows
//   about could not be recorded. The fix keeps it client-side: surface the derived champion on the completed
//   screen and offer a one-tap record that reopens and re-closes with the champion.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const pure = require('../public/pure.js');
const { scoringRulesFor, gameScoreStatus, computeChampion } = pure;

// Mike's live July 26 row.
const JULY = {
  pool_target: 15, pool_cap: 20,
  bracket_target: 21, bracket_cap: 25,
  win_by_2: true, match_cap: 25,
};

describe('C78 — the championship game honors the published no-cap rule', () => {
  it('leaves ordinary bracket games capped, exactly as before', () => {
    expect(scoringRulesFor('main', JULY)).toEqual({ target: 21, cap: 25, winBy2: true });
    expect(scoringRulesFor('main', JULY, { side: 'winners', round: 3 }))
      .toEqual({ target: 21, cap: 25, winBy2: true });
    expect(scoringRulesFor('main', JULY, { side: 'losers', round: 4 }))
      .toEqual({ target: 21, cap: 25, winBy2: true });
  });

  it('drops the cap for the championship game (grand final, set 1)', () => {
    expect(scoringRulesFor('main', JULY, { side: 'grand_final', round: 1 }))
      .toEqual({ target: 21, cap: null, winBy2: true });
  });

  it('keeps the cap on the reset match (grand final, set 2) per the rules sheet', () => {
    expect(scoringRulesFor('main', JULY, { side: 'grand_final', round: 2 }))
      .toEqual({ target: 21, cap: 25, winBy2: true });
  });

  it('leaves pool games completely untouched', () => {
    expect(scoringRulesFor('pool', JULY)).toEqual({ target: 15, cap: 20, winBy2: true });
    expect(scoringRulesFor('pool', JULY, { side: 'grand_final', round: 1 }))
      .toEqual({ target: 15, cap: 20, winBy2: true });
  });

  it('accepts a real 26-24 championship that the old rules refused', () => {
    const champRules = scoringRulesFor('main', JULY, { side: 'grand_final', round: 1 });
    const ok = gameScoreStatus(26, 24, champRules);
    expect(ok.valid).toBe(true);
    expect(ok.decided).toBe(true);
    expect(ok.winner).toBe('A');

    // and the same score is still correctly refused in an ordinary bracket game
    const normal = gameScoreStatus(26, 24, scoringRulesFor('main', JULY, { side: 'winners', round: 2 }));
    expect(normal.valid).toBe(false);
    expect(normal.reason).toContain('cap');
  });

  it('still enforces win by 2 and the target in the uncapped championship', () => {
    const r = scoringRulesFor('main', JULY, { side: 'grand_final', round: 1 });
    expect(gameScoreStatus(30, 29, r).valid).toBe(false);   // margin 1
    expect(gameScoreStatus(20, 5, r).valid).toBe(false);    // under target
    expect(gameScoreStatus(40, 38, r).valid).toBe(true);    // long but legitimate
    expect(gameScoreStatus(21, 19, r).valid).toBe(true);
  });

  it('tolerates a tournament with no bracket_cap set at all', () => {
    const noCap = { bracket_target: 21, bracket_cap: null, win_by_2: true };
    expect(scoringRulesFor('main', noCap, { side: 'grand_final', round: 1 }).cap).toBeNull();
    expect(scoringRulesFor('main', noCap, { side: 'winners', round: 1 }).cap).toBeNull();
  });
});

describe('C80 — the champion the bracket already knows is recoverable after auto-completion', () => {
  const teams = [{ id: 'A', name: 'Champs' }, { id: 'B', name: 'The Dawg House' }];

  it('computeChampion derives the winner from a finished grand final', () => {
    const matches = [
      { side: 'grand_final', round: 1, status: 'final', team_a_id: 'A', team_b_id: 'B', winner_team_id: 'A' },
      { side: 'grand_final', round: 2, status: 'scheduled', team_a_id: null, team_b_id: null },
    ];
    expect(computeChampion(matches, teams)).toEqual({ teamId: 'A', name: 'Champs' });
  });

  it('withholds a champion while the reset match is still owed', () => {
    // the losers-bracket team (team_b) won set 1, so set 2 must be played before anyone is champion
    const matches = [
      { side: 'grand_final', round: 1, status: 'final', team_a_id: 'A', team_b_id: 'B', winner_team_id: 'B' },
      { side: 'grand_final', round: 2, status: 'scheduled', team_a_id: 'A', team_b_id: 'B' },
    ];
    expect(computeChampion(matches, teams)).toBeNull();
  });

  it('crowns the reset-match winner once it is played', () => {
    const matches = [
      { side: 'grand_final', round: 1, status: 'final', team_a_id: 'A', team_b_id: 'B', winner_team_id: 'B' },
      { side: 'grand_final', round: 2, status: 'final', team_a_id: 'A', team_b_id: 'B', winner_team_id: 'B' },
    ];
    expect(computeChampion(matches, teams)).toEqual({ teamId: 'B', name: 'The Dawg House' });
  });
});

// The shipped close-out screen must actually offer the crown. Source-level guards: the completed branch is
// only reachable through the vm harness in manage-page.test.js, so these assert the wiring is present rather
// than re-standing up a second sandbox.
describe('C80 — the close-out screen offers to record the champion', () => {
  const mgGuardSrc = readFileSync(new URL('../public/manage.js', import.meta.url), 'utf8');
  const src = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8')
    + '\n' + mgGuardSrc;   // C102: the client is two files; a guard over one would pass vacuously

  it('has a record-champion control and its handler', () => {
    expect(src).toContain('data-mgco-record');
    expect(src).toContain('async function mgCloseoutRecordChampion()');
  });

  it('routes the tap to the handler', () => {
    expect(src).toContain("[data-mgco-record]')) { void mgCloseoutRecordChampion();");
  });

  it('reopens before closing, because close_tournament refuses a completed tournament', () => {
    const fn = src.slice(src.indexOf('async function mgCloseoutRecordChampion()'));
    const body = fn.slice(0, fn.indexOf('\nasync function mgCloseoutReopen'));
    expect(body.indexOf('tdbReopenTournament')).toBeGreaterThan(-1);
    expect(body.indexOf('tdbCloseTournament')).toBeGreaterThan(body.indexOf('tdbReopenTournament'));
  });

  it('refuses to record nothing, and tells the organizer if it left the tournament reopened', () => {
    const fn = src.slice(src.indexOf('async function mgCloseoutRecordChampion()'));
    const body = fn.slice(0, fn.indexOf('\nasync function mgCloseoutReopen'));
    expect(body).toContain('Pick a champion first');
    expect(body).toContain('reopened');
  });

  it('still shows a stored champion plainly, with no record CTA', () => {
    // the completed branch builds `record` as '' whenever a champion is already stored
    expect(src).toContain("const record = stored ? '' :");
  });
});
