// Slice 2 (2026-07-09, spec §13.3) — behavior tests for the public Bracket page pure helpers in
// public/pure.js: bracketOutcome (completed-state champion + runner-up + deciding game) and
// bracketStatusLine (live-state "current round" label). Loaded via Node CJS require, matching the suite.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pure = require('../public/pure.js');
const { bracketOutcome, bracketStatusLine } = pure;

const TEAMS = [
  { id: 't1', name: 'Dink Responsibly' },
  { id: 't2', name: 'Block Party' },
  { id: 't3', name: 'Served Cold' },
  { id: 't4', name: 'Sandbaggers' },
];

// A finished double-elim where the winners-bracket team took the grand final in one game (no reset).
const COMPLETED_NO_RESET = [
  { id: 'w1', side: 'winners', round: 1, slot: 0, status: 'final', team_a_id: 't1', team_b_id: 't4', winner_team_id: 't1', queue_order: 1 },
  { id: 'w2', side: 'winners', round: 1, slot: 1, status: 'final', team_a_id: 't2', team_b_id: 't3', winner_team_id: 't2', queue_order: 2 },
  { id: 'wf', side: 'winners', round: 2, slot: 0, status: 'final', team_a_id: 't1', team_b_id: 't2', winner_team_id: 't1', queue_order: 3 },
  { id: 'lf', side: 'losers', round: 2, slot: 0, status: 'final', team_a_id: 't2', team_b_id: 't3', winner_team_id: 't2', queue_order: 5 },
  { id: 'gf', side: 'grand_final', round: 1, slot: 0, status: 'final', team_a_id: 't1', team_b_id: 't2', winner_team_id: 't1', queue_order: 6 },
];

// A finished double-elim that required a bracket reset (grand final game 2 decided it).
const COMPLETED_RESET = [
  { id: 'wf', side: 'winners', round: 2, slot: 0, status: 'final', team_a_id: 't1', team_b_id: 't2', winner_team_id: 't1', queue_order: 3 },
  { id: 'gf', side: 'grand_final', round: 1, slot: 0, status: 'final', team_a_id: 't1', team_b_id: 't2', winner_team_id: 't2', queue_order: 6 },
  { id: 'gf2', side: 'grand_final', round: 2, slot: 0, status: 'final', team_a_id: 't1', team_b_id: 't2', winner_team_id: 't1', queue_order: 7 },
];

describe('bracketOutcome', () => {
  it('returns null while no champion is decided', () => {
    const live = [
      { id: 'w1', side: 'winners', round: 1, slot: 0, status: 'final', team_a_id: 't1', team_b_id: 't4', winner_team_id: 't1', queue_order: 1 },
      { id: 'gf', side: 'grand_final', round: 1, slot: 0, status: 'scheduled', team_a_id: null, team_b_id: null, queue_order: 6 },
    ];
    expect(bracketOutcome(live, TEAMS)).toBeNull();
    expect(bracketOutcome([], TEAMS)).toBeNull();
    expect(bracketOutcome(null, TEAMS)).toBeNull();
  });

  it('names the champion, runner-up, and the deciding game (no reset)', () => {
    const o = bracketOutcome(COMPLETED_NO_RESET, TEAMS);
    expect(o.championId).toBe('t1');
    expect(o.championName).toBe('Dink Responsibly');
    expect(o.runnerUpId).toBe('t2');
    expect(o.runnerUpName).toBe('Block Party');
    expect(o.decidingMatchId).toBe('gf');
  });

  it('uses the reset game (grand final 2) as the decider when one was played', () => {
    const o = bracketOutcome(COMPLETED_RESET, TEAMS);
    expect(o.championId).toBe('t1');
    expect(o.runnerUpId).toBe('t2');
    expect(o.decidingMatchId).toBe('gf2');
  });
});

describe('bracketStatusLine', () => {
  it('returns null when nothing is in play (empty / all final)', () => {
    expect(bracketStatusLine([])).toBeNull();
    expect(bracketStatusLine(null)).toBeNull();
    expect(bracketStatusLine(COMPLETED_NO_RESET)).toBeNull();
  });

  it('names the round of the live game when one is live', () => {
    const main = [
      { id: 'w1', side: 'winners', round: 1, slot: 0, status: 'final', team_a_id: 't1', team_b_id: 't4', winner_team_id: 't1', queue_order: 1 },
      { id: 'wf', side: 'winners', round: 2, slot: 0, status: 'live', team_a_id: 't1', team_b_id: 't2', queue_order: 3 },
      { id: 'lb', side: 'losers', round: 1, slot: 0, status: 'scheduled', team_a_id: 't3', team_b_id: 't4', queue_order: 4 },
    ];
    expect(bracketStatusLine(main)).toBe('Winners round 2');
  });

  it('falls back to the soonest unplayed game (lowest queue_order) when nothing is live', () => {
    const main = [
      { id: 'lb', side: 'losers', round: 1, slot: 0, status: 'scheduled', team_a_id: 't3', team_b_id: 't4', queue_order: 4 },
      { id: 'wf', side: 'winners', round: 2, slot: 0, status: 'scheduled', team_a_id: 't1', team_b_id: 't2', queue_order: 3 },
    ];
    expect(bracketStatusLine(main)).toBe('Winners round 2');
  });

  it('labels the losers bracket and the grand final (incl. reset)', () => {
    expect(bracketStatusLine([{ id: 'l', side: 'losers', round: 3, status: 'live', team_a_id: 't1', team_b_id: 't2', queue_order: 5 }])).toBe('Losers round 3');
    expect(bracketStatusLine([{ id: 'g', side: 'grand_final', round: 1, status: 'live', team_a_id: 't1', team_b_id: 't2', queue_order: 6 }])).toBe('Grand final');
    expect(bracketStatusLine([{ id: 'g2', side: 'grand_final', round: 2, status: 'live', team_a_id: 't1', team_b_id: 't2', queue_order: 7 }])).toBe('Grand final (reset)');
  });

  it('ignores games missing a team (not yet playable)', () => {
    const main = [
      { id: 'gf', side: 'grand_final', round: 1, slot: 0, status: 'scheduled', team_a_id: null, team_b_id: null, queue_order: 6 },
    ];
    expect(bracketStatusLine(main)).toBeNull();
  });
});
