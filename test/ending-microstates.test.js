// Finish-line Slice 4 (spec §13.4 / §13.6) — behavior tests for the two new pure helpers in public/pure.js:
//   computeTeamRunEnded — the ELIMINATED terminal timeline node (has this bracket run ended + a derivable place)
//   sessionIsUpcoming    — the past-dated "next session" guard (casual Home + checkin.html)
// Loaded via Node CJS require (pure.js uses a module.exports guard), matching the other suites.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pure = require('../public/pure.js');
const { computeTeamRunEnded, sessionIsUpcoming, sessionIsToday } = pure;

// A B=4 double-elim losers structure: L1 (round 1, one game) + L2/LB-final (round 2, one game).
// Every LB round has exactly one game, so both LB rounds resolve to a single certain place (4th, 3rd).
function b4LosersRows(overrides) {
  const rows = [
    { phase: 'main', side: 'losers', round: 1, team_a_id: 't4', team_b_id: 't3', status: 'final', winner_team_id: 't3' },
    { phase: 'main', side: 'losers', round: 2, team_a_id: 't3', team_b_id: 't2', status: 'scheduled', winner_team_id: null },
  ];
  return overrides ? overrides(rows) : rows;
}

describe('computeTeamRunEnded', () => {
  it('reports not-ended for a team with no bracket games', () => {
    const out = computeTeamRunEnded('t1', [
      { phase: 'pool', status: 'final', team_a_id: 't1', team_b_id: 't2', winner_team_id: 't2' },
    ], []);
    expect(out.ended).toBe(false);
    expect(out.place).toBe(null);
  });

  it('reports not-ended for a team that only lost a WINNERS game (dropped to losers, still alive)', () => {
    const matches = [
      { phase: 'main', side: 'winners', round: 1, team_a_id: 't1', team_b_id: 't4', status: 'final', winner_team_id: 't1' },
      // t4 dropped to losers and has an upcoming losers game
      { phase: 'main', side: 'losers', round: 1, team_a_id: 't4', team_b_id: 't3', status: 'scheduled', winner_team_id: null },
    ];
    const out = computeTeamRunEnded('t4', matches, []);
    expect(out.ended).toBe(false);
  });

  it('reports not-ended when the team still has an upcoming bracket game (defensive guard)', () => {
    const matches = [
      { phase: 'main', side: 'losers', round: 1, team_a_id: 't4', team_b_id: 't3', status: 'final', winner_team_id: 't3' },
      { phase: 'main', side: 'losers', round: 2, team_a_id: 't4', team_b_id: 't2', status: 'scheduled', winner_team_id: null },
    ];
    const out = computeTeamRunEnded('t4', matches, []);
    expect(out.ended).toBe(false);
  });

  it('B=4: a team eliminated in LB round 1 finishes 4th (single certain place)', () => {
    const out = computeTeamRunEnded('t4', b4LosersRows(), []);
    expect(out.ended).toBe(true);
    expect(out.place).toBe(4);
  });

  it('B=4: a team eliminated in the LB final (round 2) finishes 3rd', () => {
    const matches = b4LosersRows((rows) => {
      rows[1] = { phase: 'main', side: 'losers', round: 2, team_a_id: 't3', team_b_id: 't2', status: 'final', winner_team_id: 't2' };
      return rows;
    });
    const out = computeTeamRunEnded('t3', matches, []);
    expect(out.ended).toBe(true);
    expect(out.place).toBe(3);
  });

  it('B=8: elimination in an LB round that ties two teams yields no place (never invent one)', () => {
    // B=8 losers rounds: L1(round1, 2 games), L2(round2, 2 games), L3(round3, 1), L4(round4, 1).
    const matches = [
      { phase: 'main', side: 'losers', round: 1, team_a_id: 'a', team_b_id: 'b', status: 'final', winner_team_id: 'a' },
      { phase: 'main', side: 'losers', round: 1, team_a_id: 'c', team_b_id: 'd', status: 'final', winner_team_id: 'c' },
      // the two round-2 games: t7 loses one of them here
      { phase: 'main', side: 'losers', round: 2, team_a_id: 't7', team_b_id: 'a', status: 'final', winner_team_id: 'a' },
      { phase: 'main', side: 'losers', round: 2, team_a_id: 'x', team_b_id: 'c', status: 'scheduled', winner_team_id: null },
      { phase: 'main', side: 'losers', round: 3, team_a_id: 'a', team_b_id: 'c', status: 'scheduled', winner_team_id: null },
      { phase: 'main', side: 'losers', round: 4, team_a_id: 'a', team_b_id: 'z', status: 'scheduled', winner_team_id: null },
    ];
    const out = computeTeamRunEnded('t7', matches, []);
    expect(out.ended).toBe(true);
    expect(out.place).toBe(null); // ties for 5th-6th → not a single Nth
  });

  it('B=8: the LB-final loser (a single-game round) finishes 3rd', () => {
    const matches = [
      { phase: 'main', side: 'losers', round: 1, team_a_id: 'a', team_b_id: 'b', status: 'final', winner_team_id: 'a' },
      { phase: 'main', side: 'losers', round: 1, team_a_id: 'c', team_b_id: 'd', status: 'final', winner_team_id: 'c' },
      { phase: 'main', side: 'losers', round: 2, team_a_id: 'a', team_b_id: 'e', status: 'final', winner_team_id: 'a' },
      { phase: 'main', side: 'losers', round: 2, team_a_id: 'c', team_b_id: 'f', status: 'final', winner_team_id: 'c' },
      { phase: 'main', side: 'losers', round: 3, team_a_id: 'a', team_b_id: 'c', status: 'final', winner_team_id: 'a' },
      // LB final: t3 loses here → 3rd
      { phase: 'main', side: 'losers', round: 4, team_a_id: 'a', team_b_id: 't3', status: 'final', winner_team_id: 'a' },
    ];
    const out = computeTeamRunEnded('t3', matches, []);
    expect(out.ended).toBe(true);
    expect(out.place).toBe(3);
  });

  it('the grand-final loser is 2nd (runner-up)', () => {
    const matches = [
      { phase: 'main', side: 'grand_final', round: 1, team_a_id: 't1', team_b_id: 't2', status: 'final', winner_team_id: 't1' },
    ];
    const out = computeTeamRunEnded('t2', matches, []);
    expect(out.ended).toBe(true);
    expect(out.place).toBe(2);
  });

  it('handles null / empty inputs without throwing', () => {
    expect(computeTeamRunEnded('t1', null, null)).toEqual({ ended: false, place: null });
    expect(computeTeamRunEnded(null, [], [])).toEqual({ ended: false, place: null });
  });
});

describe('sessionIsUpcoming', () => {
  it('is true for a future date', () => {
    expect(sessionIsUpcoming('2026-07-20', '2026-07-09')).toBe(true);
  });

  it('is true for today (a session is "today" all day)', () => {
    expect(sessionIsUpcoming('2026-07-09', '2026-07-09')).toBe(true);
  });

  it('is false for a past date (no stale date shown)', () => {
    expect(sessionIsUpcoming('2026-07-08', '2026-07-09')).toBe(false);
    expect(sessionIsUpcoming('2025-12-31', '2026-07-09')).toBe(false);
  });

  it('is false for a missing / empty / unparseable date', () => {
    expect(sessionIsUpcoming('', '2026-07-09')).toBe(false);
    expect(sessionIsUpcoming(null, '2026-07-09')).toBe(false);
    expect(sessionIsUpcoming('not-a-date', '2026-07-09')).toBe(false);
  });

  it('accepts a full ISO timestamp as the session date (date part only)', () => {
    expect(sessionIsUpcoming('2026-07-09T18:30:00Z', '2026-07-09')).toBe(true);
    expect(sessionIsUpcoming('2026-07-08T23:59:00Z', '2026-07-09')).toBe(false);
  });

  it('defaults todayStr to the local today when omitted (a clearly-future date passes)', () => {
    expect(sessionIsUpcoming('2999-01-01')).toBe(true);
    expect(sessionIsUpcoming('2000-01-01')).toBe(false);
  });
});

// Check In rework (Mike 2026-07-10): the tab exists ONLY on the day of the pickup session,
// not for future days — sessionIsToday is the day-of gate (nav tab + Home session_live state).
describe('sessionIsToday', () => {
  it('is true only for today', () => {
    expect(sessionIsToday('2026-07-10', '2026-07-10')).toBe(true);
  });

  it('is false for yesterday', () => {
    expect(sessionIsToday('2026-07-09', '2026-07-10')).toBe(false);
  });

  it('is false for tomorrow / any future day (unlike sessionIsUpcoming)', () => {
    expect(sessionIsToday('2026-07-11', '2026-07-10')).toBe(false);
    expect(sessionIsToday('2026-07-20', '2026-07-10')).toBe(false);
  });

  it('is false for a missing / empty / unparseable date', () => {
    expect(sessionIsToday('', '2026-07-10')).toBe(false);
    expect(sessionIsToday(null, '2026-07-10')).toBe(false);
    expect(sessionIsToday(undefined, '2026-07-10')).toBe(false);
    expect(sessionIsToday('not-a-date', '2026-07-10')).toBe(false);
  });

  it('accepts a full ISO timestamp as the session date (date part only)', () => {
    expect(sessionIsToday('2026-07-10T18:30:00Z', '2026-07-10')).toBe(true);
    expect(sessionIsToday('2026-07-11T00:01:00Z', '2026-07-10')).toBe(false);
  });

  it('defaults todayStr to the local today when omitted (clearly-future/past dates fail)', () => {
    expect(sessionIsToday('2999-01-01')).toBe(false);
    expect(sessionIsToday('2000-01-01')).toBe(false);
  });
});
