// Slice 1 (2026-07-09, spec §13.2) — behavior tests for the tap-a-team peek pure model in public/pure.js.
// Loaded via Node CJS require (pure.js uses a module.exports guard), matching the other suites.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pure = require('../public/pure.js');
const { teamPeekModel } = pure;

// A small pool A: t1 wins twice, has a live game + upcoming games; t3 loses twice.
const POOLS = [{ id: 'pA', label: 'A' }, { id: 'pB', label: 'B' }];
const TEAMS = [
  { id: 't1', name: 'Dink Responsibly', pool_id: 'pA' },
  { id: 't2', name: 'Ballin', pool_id: 'pA' },
  { id: 't3', name: 'Net Gains', pool_id: 'pA' },
  { id: 't4', name: 'Block Party', pool_id: 'pB' },
];
const MATCHES = [
  // finals
  { id: 'm1', pool_id: 'pA', phase: 'pool', status: 'final', team_a_id: 't1', team_b_id: 't3', winner_team_id: 't1', score_a: 15, score_b: 10, net: 1, queue_order: 1 },
  { id: 'm2', pool_id: 'pA', phase: 'pool', status: 'final', team_a_id: 't1', team_b_id: 't2', winner_team_id: 't1', score_a: 15, score_b: 6, net: 1, queue_order: 2 },
  { id: 'm3', pool_id: 'pA', phase: 'pool', status: 'final', team_a_id: 't2', team_b_id: 't3', winner_team_id: 't2', score_a: 15, score_b: 8, net: 2, queue_order: 1 },
  // t1 live game (running score) on net 1
  { id: 'm4', pool_id: 'pA', phase: 'pool', status: 'live', team_a_id: 't1', team_b_id: 't3', score_a: 11, score_b: 8, net: 1, queue_order: 3 },
  // t1 two upcoming pool games — next must be the lower queue_order
  { id: 'm6', pool_id: 'pA', phase: 'pool', status: 'scheduled', team_a_id: 't2', team_b_id: 't1', net: 1, queue_order: 5 },
  { id: 'm5', pool_id: 'pA', phase: 'pool', status: 'scheduled', team_a_id: 't1', team_b_id: 't2', net: 1, queue_order: 4 },
];

describe('teamPeekModel', () => {
  it('returns null for an unknown team id', () => {
    expect(teamPeekModel('nope', { teams: TEAMS, matches: MATCHES, pools: POOLS })).toBeNull();
    expect(teamPeekModel('t1', {})).toBeNull();
  });

  it('shapes name, initials, pool label + rank, and record from FINAL games only', () => {
    const m = teamPeekModel('t1', { teams: TEAMS, matches: MATCHES, pools: POOLS });
    expect(m.teamName).toBe('Dink Responsibly');
    expect(m.initials).toBe('DR');
    expect(m.poolLabel).toBe('A');
    expect(m.poolRank).toBe(1);
    // 2 finals won; the live game (status 'live') is NOT counted
    expect(m.wins).toBe(2);
    expect(m.losses).toBe(0);
    expect(m.gamesPlayed).toBe(2);
    expect(m.pointDiff).toBe((15 - 10) + (15 - 6)); // +14
  });

  it('surfaces a genuinely live game with its running score, and next excludes it', () => {
    const m = teamPeekModel('t1', { teams: TEAMS, matches: MATCHES, pools: POOLS });
    expect(m.live).toEqual({ net: 1, oppName: 'Net Gains', myScore: 11, oppScore: 8 });
    // next is the soonest upcoming (queue_order 4), NOT the live game or the q5 one
    expect(m.next).toMatchObject({ net: 1, oppName: 'Ballin', phase: 'pool', isNow: false });
  });

  it('ranks a losing team last in its pool with no live/next when idle', () => {
    const m = teamPeekModel('t3', { teams: TEAMS, matches: MATCHES, pools: POOLS });
    expect(m.poolRank).toBe(3);
    expect(m.wins).toBe(0);
    expect(m.losses).toBe(2);
    // t3's only non-final game is the live one (as t1's opponent) → it IS live for t3
    expect(m.live).toMatchObject({ net: 1, oppName: 'Dink Responsibly', myScore: 8, oppScore: 11 });
  });

  it('computes an overall seed once pool games are final; null before any final', () => {
    const withFinals = teamPeekModel('t1', { teams: TEAMS, matches: MATCHES, pools: POOLS });
    expect(withFinals.seed).toBe(1); // t1 is the top team overall
    const noFinals = teamPeekModel('t1', {
      teams: TEAMS,
      matches: [{ id: 'x', pool_id: 'pA', phase: 'pool', status: 'scheduled', team_a_id: 't1', team_b_id: 't2', net: 1, queue_order: 1 }],
      pools: POOLS,
    });
    expect(noFinals.seed).toBeNull();
    expect(noFinals.wins).toBe(0);
  });

  it('handles a team whose pool is unknown (no pool row) without throwing', () => {
    const teams = [{ id: 'solo', name: 'Free Agents', pool_id: 'ghost' }];
    const m = teamPeekModel('solo', { teams, matches: [], pools: POOLS });
    expect(m.poolLabel).toBe('');
    expect(m.poolRank).toBeNull();
    expect(m.live).toBeNull();
    expect(m.next).toBeNull();
  });
});
