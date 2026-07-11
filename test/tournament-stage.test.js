// Tournament page atom-up redesign (spec 2026-07-10) — the pure stage model that drives the hub's
// stage progress bar + which hub row carries the active-stage emphasis. TDD: these assertions were
// written before tournamentStageModel existed. Fixtures use the REAL tournament match-row field names
// verified against pure.js (computeStandings / homeNetBlocksModel / bracketStatusLine): phase
// ('pool'|'main'), status ('scheduled'|'live'|'final'), team_a_id/team_b_id, side
// ('winners'|'losers'|'grand_final'), round, queue_order.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { tournamentStageModel } = require('../public/pure.js');

// Build N pool games (both teams set), the first `done` of them final, the next `live` of them live.
function poolGames(total, done, live = 0) {
  const out = [];
  for (let i = 0; i < total; i++) {
    const status = i < done ? 'final' : (i < done + live ? 'live' : 'scheduled');
    out.push({ id: 'p' + i, phase: 'pool', status, team_a_id: 'a' + i, team_b_id: 'b' + i, net: (i % 3) + 1 });
  }
  return out;
}

// A small double-elim: winners R1 (x2), winners R2 (x1), losers R1 (x1), losers R2 (x1), grand final (x1).
// playRound (mirrors bracketGameNumbers): non-GF -> round; GF -> maxRound + round. maxRound = 2 here, so the
// distinct play-round levels are {1 (W-R1 + L-R1), 2 (W-R2 + L-R2), 3 (grand final)} -> total 3 rounds.
function bracketMatches(overrides = {}) {
  const mk = (id, side, round, status = 'scheduled', extra = {}) =>
    ({ id, phase: 'main', side, round, status, team_a_id: 't' + id + 'a', team_b_id: 't' + id + 'b', queue_order: extra.q || 0, ...extra });
  return [
    mk('w1', 'winners', 1, overrides.w1 || 'final', { q: 1 }),
    mk('w2', 'winners', 1, overrides.w2 || 'final', { q: 2 }),
    mk('w3', 'winners', 2, overrides.w3 || 'scheduled', { q: 5 }),
    mk('l1', 'losers', 1, overrides.l1 || 'final', { q: 3 }),
    mk('l2', 'losers', 2, overrides.l2 || 'scheduled', { q: 4 }),
    mk('gf', 'grand_final', 1, overrides.gf || 'scheduled', { q: 9 }),
  ];
}

describe('tournamentStageModel — setup / no tournament (spec §3: no live stage bar)', () => {
  it('a null tournament yields the empty setup shape', () => {
    expect(tournamentStageModel(null, [])).toEqual(
      { phase: 'setup', stageLabel: null, count: 0, total: 0, pct: 0, activeView: null });
  });
  it('a setup-status tournament (registration) has no live stage', () => {
    const m = tournamentStageModel({ status: 'setup' }, poolGames(0, 0));
    expect(m).toEqual({ phase: 'setup', stageLabel: null, count: 0, total: 0, pct: 0, activeView: null });
  });
});

describe('tournamentStageModel — pool play (count = pool games final / total)', () => {
  it('24 of 36 pool games final -> POOL PLAY, count 24, total 36, pct 67, active pools', () => {
    const m = tournamentStageModel({ status: 'pools' }, poolGames(36, 24));
    expect(m.phase).toBe('pools');
    expect(m.stageLabel).toBe('Pool play');
    expect(m.count).toBe(24);
    expect(m.total).toBe(36);
    expect(m.pct).toBe(67); // 24/36 = 66.67 -> rounds to 67 (mockup width:67%)
    expect(m.activeView).toBe('pools');
  });
  it('zero played -> count 0, pct 0', () => {
    const m = tournamentStageModel({ status: 'pools' }, poolGames(12, 0));
    expect(m.count).toBe(0);
    expect(m.total).toBe(12);
    expect(m.pct).toBe(0);
  });
  it('excludes bye games (a missing team) and any main-phase matches from the pool total', () => {
    const games = poolGames(4, 2).concat([
      { id: 'bye', phase: 'pool', status: 'scheduled', team_a_id: 'x', team_b_id: null },   // bye — no opponent
      { id: 'mainx', phase: 'main', status: 'final', team_a_id: 'a', team_b_id: 'b', side: 'winners', round: 1 },
    ]);
    const m = tournamentStageModel({ status: 'pools' }, games);
    expect(m.total).toBe(4); // bye + main excluded
    expect(m.count).toBe(2);
  });
});

describe('tournamentStageModel — bracket (count = current round ordinal / total rounds)', () => {
  it('BRACKET label, active bracket, total = distinct play-round levels (3)', () => {
    const m = tournamentStageModel({ status: 'bracket' }, bracketMatches());
    expect(m.phase).toBe('bracket');
    expect(m.stageLabel).toBe('Bracket');
    expect(m.activeView).toBe('bracket');
    expect(m.total).toBe(3);
  });
  it('a live winners-round-2 game puts the current round at 2 of 3 (pct 67)', () => {
    // W-R1 + L-R1 done; W-R2 (round 2 -> play-level 2) is live -> current round ordinal 2 of [1,2,3].
    const m = tournamentStageModel({ status: 'bracket' }, bracketMatches({ w3: 'live' }));
    expect(m.count).toBe(2);
    expect(m.total).toBe(3);
    expect(m.pct).toBe(67);
  });
  it('with nothing live, the current round is the soonest still-to-play game (by queue_order)', () => {
    // No live game; earliest non-final by queue_order is l2 (q:4, round 2 -> level 2) -> ordinal 2 of 3.
    const m = tournamentStageModel({ status: 'bracket' }, bracketMatches());
    expect(m.count).toBe(2);
  });
});

describe('tournamentStageModel — completed (stage bar reads Final)', () => {
  it('completed -> Final label, pct 100, no active row', () => {
    const allFinal = bracketMatches({ w3: 'final', l2: 'final', gf: 'final' });
    const m = tournamentStageModel({ status: 'completed' }, allFinal);
    expect(m.phase).toBe('completed');
    expect(m.stageLabel).toBe('Final');
    expect(m.pct).toBe(100);
    expect(m.activeView).toBe(null);
    expect(m.total).toBe(3);
  });
});
