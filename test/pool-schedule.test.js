// Pool schedule slotting — the net double-booking fix (Mike, 2026-07-26, tournament morning).
//
// THE BUG: app.js composed `generateRoundRobin(ids)` (which emits games ROUND BY ROUND, byes dropped, so
// exactly floor(P/2) real games per round) with `distributeGamesOnNets(pairs.length, nets)` (which lays
// games onto nets by RAW INDEX, nets[i % nets.length], with a per-net counter). That alignment only holds
// when a pool's net count equals its games-per-round. At the live config (pool_count 3, net_count 9) each
// pool got 3 nets, which is only correct for pools of 6. At 8 teams, pool A's three round-1 games all
// landed at queue_order 1 on nets 1, 2 and 3 — every team in the pool told to play on two nets at once.
// Reproduced across team counts: broken at 3, 5, and every count from 7 to 17.
//
// THE FIX: `assignPoolGameSlots(teamIds, nets)` owns the whole per-pool computation and never hands a pool
// more nets than it can honestly fill at once (floor(P/2)). That restores the index alignment by
// construction, so every game in a round lands on a distinct net at the same queue_order.
//
// The property test below is the real guard: no team may ever appear twice at the same queue_order within
// its pool, for every team count and every net count. The old code fails it; the new code must not.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const pure = require('../public/pure.js');
const { assignPoolGameSlots, splitNetsAcrossPools, generateRoundRobin } = pure;

// Every team that plays at queue slot q must be unique within the pool — two games at the same q are
// simultaneous, so a repeated team means "be on two nets at once".
function collisionsIn(slots) {
  const seen = new Set();
  const bad = [];
  slots.forEach((g) => {
    [g.team_a_id, g.team_b_id].forEach((t) => {
      if (t == null) return;
      const k = g.queue_order + '|' + t;
      if (seen.has(k)) bad.push({ team: t, queue_order: g.queue_order });
      else seen.add(k);
    });
  });
  return bad;
}

const idsFor = (n) => Array.from({ length: n }, (_, i) => 'T' + (i + 1));

describe('assignPoolGameSlots — a team is never on two nets at the same time', () => {
  it('exists and returns one row per round-robin game', () => {
    expect(typeof assignPoolGameSlots).toBe('function');
    const slots = assignPoolGameSlots(idsFor(4), [1, 2, 3]);
    expect(slots.length).toBe(6); // 4 teams -> 4*3/2
    slots.forEach((g) => {
      expect(g).toHaveProperty('team_a_id');
      expect(g).toHaveProperty('team_b_id');
      expect(typeof g.net).toBe('number');
      expect(g.queue_order).toBeGreaterThan(0);
    });
  });

  // THE PROPERTY. This is the test that fails on the old composition.
  it('never double-books a team, for every team count 2..24 against every net count 1..12', () => {
    const failures = [];
    for (let teams = 2; teams <= 24; teams++) {
      for (let nets = 1; nets <= 12; nets++) {
        const block = Array.from({ length: nets }, (_, i) => i + 1);
        const bad = collisionsIn(assignPoolGameSlots(idsFor(teams), block));
        if (bad.length) failures.push(`${teams} teams / ${nets} nets -> ${bad.length} collision(s)`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('holds through the real multi-pool split at Mike\'s live config (3 pools, 9 nets)', () => {
    const failures = [];
    for (let total = 2; total <= 24; total++) {
      const poolCount = Math.max(1, Math.min(3, Math.floor(total / 2)));
      const byPool = Array.from({ length: poolCount }, () => []);
      for (let i = 0; i < total; i++) byPool[i % poolCount].push('T' + (i + 1));
      const blocks = splitNetsAcrossPools(9, poolCount);
      byPool.forEach((ids, pi) => {
        const bad = collisionsIn(assignPoolGameSlots(ids, blocks[pi] || [pi + 1]));
        if (bad.length) failures.push(`${total} teams, pool ${pi} -> ${bad.length} collision(s)`);
      });
    }
    expect(failures).toEqual([]);
  });

  it('never uses more nets than the pool can fill at once', () => {
    for (let teams = 2; teams <= 16; teams++) {
      const slots = assignPoolGameSlots(idsFor(teams), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
      const used = new Set(slots.map((g) => g.net));
      expect(used.size).toBeLessThanOrEqual(Math.max(1, Math.floor(teams / 2)));
    }
  });

  it('serializes a 3-team pool onto ONE net even when handed three', () => {
    const slots = assignPoolGameSlots(idsFor(3), [1, 2, 3]);
    expect(slots.length).toBe(3);
    expect(new Set(slots.map((g) => g.net)).size).toBe(1);
    expect(slots.map((g) => g.queue_order)).toEqual([1, 2, 3]);
  });

  it('runs a 6-team pool three-wide, all of round one at the same queue slot on distinct nets', () => {
    const slots = assignPoolGameSlots(idsFor(6), [1, 2, 3]);
    expect(slots.length).toBe(15); // 6*5/2
    const round1 = slots.filter((g) => g.queue_order === 1);
    expect(round1.length).toBe(3);
    expect(new Set(round1.map((g) => g.net)).size).toBe(3);
    expect(collisionsIn(slots)).toEqual([]);
  });

  it('keeps the same games the round robin produced, in the same order', () => {
    const ids = idsFor(5);
    const pairs = generateRoundRobin(ids);
    const slots = assignPoolGameSlots(ids, [1, 2, 3, 4]);
    expect(slots.map((g) => [g.team_a_id, g.team_b_id])).toEqual(pairs);
  });

  it('queue_order is non-decreasing across a net, so the net board reads in order', () => {
    const slots = assignPoolGameSlots(idsFor(8), [1, 2, 3, 4]);
    const byNet = {};
    slots.forEach((g) => { (byNet[g.net] = byNet[g.net] || []).push(g.queue_order); });
    Object.values(byNet).forEach((qs) => {
      expect(qs).toEqual(qs.slice().sort((a, b) => a - b));
      expect(new Set(qs).size).toBe(qs.length); // no two games at the same slot on one net
    });
  });

  it('handles the degenerate inputs a live draw can produce', () => {
    expect(assignPoolGameSlots([], [1, 2])).toEqual([]);
    expect(assignPoolGameSlots(['solo'], [1, 2])).toEqual([]);
    expect(assignPoolGameSlots(idsFor(2), [])).toHaveLength(1);   // no nets given -> still schedulable
    expect(assignPoolGameSlots(idsFor(2), [7])[0].net).toBe(7);   // honors the pool's net block
  });
});

// Re-netting mid-event ("Edit nets") re-lays the UNPLAYED games. If it used the old raw-index layout it
// would re-introduce exactly the double-booking the initial draw now avoids — the repair path breaking the
// thing it was used to repair.
describe('relayoutPoolGamesOnNets — repairing nets mid-event stays collision-free', () => {
  const { relayoutPoolGamesOnNets, assignPoolGameSlots } = pure;

  it('keeps a schedule collision-free when re-netted to ANY net count', () => {
    const failures = [];
    for (let teams = 2; teams <= 20; teams++) {
      const original = assignPoolGameSlots(idsFor(teams), [1, 2, 3]);
      for (let nets = 1; nets <= 12; nets++) {
        const block = Array.from({ length: nets }, (_, i) => i + 1);
        const bad = collisionsIn(relayoutPoolGamesOnNets(original, block));
        if (bad.length) failures.push(`${teams} teams re-netted to ${nets} -> ${bad.length}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('survives repeated re-netting without drifting into a collision', () => {
    let games = assignPoolGameSlots(idsFor(9), [1, 2, 3]);
    [1, 5, 2, 9, 3, 12, 4].forEach((n) => {
      games = relayoutPoolGamesOnNets(games, Array.from({ length: n }, (_, i) => i + 1));
      expect(collisionsIn(games)).toEqual([]);
    });
  });

  it('preserves the games and their order, changing only net and queue_order', () => {
    const original = assignPoolGameSlots(idsFor(6), [1, 2, 3]);
    const moved = relayoutPoolGamesOnNets(original, [4, 5]);
    expect(moved.length).toBe(original.length);
    expect(moved.map((g) => [g.team_a_id, g.team_b_id]))
      .toEqual(original.map((g) => [g.team_a_id, g.team_b_id]));
    expect(new Set(moved.map((g) => g.net))).toEqual(new Set([4, 5]));
  });

  it('carries other row fields through untouched, so the version CAS still works', () => {
    const rows = [
      { id: 'm1', version: 3, team_a_id: 'A', team_b_id: 'B', queue_order: 1 },
      { id: 'm2', version: 7, team_a_id: 'C', team_b_id: 'D', queue_order: 1 },
    ];
    const moved = relayoutPoolGamesOnNets(rows, [1, 2]);
    expect(moved.map((g) => g.id)).toEqual(['m1', 'm2']);
    expect(moved.map((g) => g.version)).toEqual([3, 7]);
  });

  it('handles an empty unplayed list', () => {
    expect(relayoutPoolGamesOnNets([], [1, 2])).toEqual([]);
  });
});

// The pure function is only worth anything if the shipped schedule path actually calls it.
describe('app.js wires the fixed slotting into the real schedule path', () => {
  const mgGuardSrc = readFileSync(new URL('../public/manage.js', import.meta.url), 'utf8');
  const src = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8')
    + '\n' + mgGuardSrc;   // C102: the client is two files; a guard over one would pass vacuously

  it('tdbStartPoolPlayAtomic uses assignPoolGameSlots', () => {
    expect(src).toContain('assignPoolGameSlots');
  });

  it('no longer composes generateRoundRobin with distributeGamesOnNets by raw index', () => {
    // The old two-call composition is what double-booked teams. Neither call should remain in app.js.
    expect(src).not.toContain('distributeGamesOnNets(');
  });
});
