// Slice 1 (2026-07-08) — behavior tests for the public-dashboard pure helpers in public/pure.js.
// Loaded via Node CJS require (pure.js uses a module.exports guard), matching the other suites.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pure = require('../public/pure.js');
const { shapeStandingsByPool } = pure;

describe('shapeStandingsByPool', () => {
  it('ranks teams within their own pool and carries the pool label + derived nets', () => {
    const pools = [{ id: 'p1', label: 'A' }, { id: 'p2', label: 'B' }];
    const teams = [
      { id: 't1', name: 'Ballin', pool_id: 'p1' },
      { id: 't2', name: 'Dinks', pool_id: 'p1' },
      { id: 't3', name: 'Block Party', pool_id: 'p2' },
      { id: 't4', name: 'Net Gains', pool_id: 'p2' },
    ];
    const matches = [
      { pool_id: 'p1', phase: 'pool', status: 'final', team_a_id: 't1', team_b_id: 't2', winner_team_id: 't1', score_a: 21, score_b: 10, net: 1 },
      { pool_id: 'p2', phase: 'pool', status: 'final', team_a_id: 't3', team_b_id: 't4', winner_team_id: 't4', score_a: 15, score_b: 21, net: 4 },
    ];
    const out = shapeStandingsByPool(pools, teams, matches);
    expect(out).toHaveLength(2);
    expect(out[0].poolLabel).toBe('A');
    expect(out[0].nets).toEqual([1]);
    expect(out[0].rows.map((r) => r.name)).toEqual(['Ballin', 'Dinks']);
    expect(out[0].rows[0].rank).toBe(1);
    // pool B: Net Gains won its game -> ranked first within pool B
    expect(out[1].poolLabel).toBe('B');
    expect(out[1].rows.map((r) => r.name)).toEqual(['Net Gains', 'Block Party']);
  });

  it('does not count another pool\'s matches toward a pool\'s standings', () => {
    const pools = [{ id: 'p1', label: 'A' }];
    const teams = [{ id: 't1', name: 'Solo', pool_id: 'p1' }];
    // a match belonging to a different pool must be ignored
    const matches = [
      { pool_id: 'pX', phase: 'pool', status: 'final', team_a_id: 't1', team_b_id: 'tZ', winner_team_id: 't1', score_a: 21, score_b: 0, net: 9 },
    ];
    const out = shapeStandingsByPool(pools, teams, matches);
    expect(out[0].nets).toEqual([]);
    expect(out[0].rows[0].wins).toBe(0);
  });

  it('handles empty / null inputs without throwing', () => {
    expect(shapeStandingsByPool([], [], [])).toEqual([]);
    expect(shapeStandingsByPool(null, null, null)).toEqual([]);
  });
});
