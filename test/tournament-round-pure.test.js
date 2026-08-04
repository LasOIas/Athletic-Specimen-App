// Tournament design round (2026-08-03) — the three new PURE helpers the round needs.
// poolNetRange  → README open question 1 (pool tabs must name their OWN nets, not a hardcoded "NETS 1-3")
// teamSkillDrift → README §6 + "State" (the amber drift warning after a player move; threshold is the CALLER's)
// swapPlayersBetweenTeams → README §6 (drag: land on a team, trade with their closest player)
// Loaded via Node CJS require (pure.js uses a module.exports guard), matching the other pure suites.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pure = require('../public/pure.js');
const { poolNetRange, teamSkillDrift, swapPlayersBetweenTeams } = pure;

describe('poolNetRange (design round — each pool tab names its own nets)', () => {
  it('a contiguous block reads as a range', () => {
    expect(poolNetRange([{ net: 1 }, { net: 2 }, { net: 3 }])).toBe('Nets 1-3');
  });
  it('pool B gets ITS block, not pool A\'s (the bug the prototype had)', () => {
    expect(poolNetRange([{ net: 4 }, { net: 5 }, { net: 6 }])).toBe('Nets 4-6');
  });
  it('a single net is singular', () => {
    expect(poolNetRange([{ net: 4 }])).toBe('Net 4');
  });
  it('many games on one net still read as one net', () => {
    expect(poolNetRange([{ net: 2 }, { net: 2 }, { net: 2 }])).toBe('Net 2');
  });
  it('a non-contiguous block lists its nets', () => {
    expect(poolNetRange([{ net: 1 }, { net: 3 }, { net: 5 }])).toBe('Nets 1, 3, 5');
  });
  it('mixes runs and singles', () => {
    expect(poolNetRange([{ net: 1 }, { net: 2 }, { net: 3 }, { net: 5 }])).toBe('Nets 1-3, 5');
    expect(poolNetRange([{ net: 1 }, { net: 3 }, { net: 4 }])).toBe('Nets 1, 3-4');
  });
  it('dedupes and sorts real schedule order (games arrive in queue order, several per net)', () => {
    const games = [{ net: 3 }, { net: 1 }, { net: 2 }, { net: 1 }, { net: 3 }, { net: 2 }];
    expect(poolNetRange(games)).toBe('Nets 1-3');
  });
  it('sorts numerically, not lexically (10 comes after 9)', () => {
    expect(poolNetRange([{ net: 9 }, { net: 10 }, { net: 11 }])).toBe('Nets 9-11');
  });
  it('coerces numeric strings so a string net cannot break the sort', () => {
    expect(poolNetRange([{ net: '2' }, { net: '3' }])).toBe('Nets 2-3');
  });
  it('drops games with no usable net', () => {
    expect(poolNetRange([{ net: 1 }, { net: null }, { net: undefined }, {}, { net: 'x' }, { net: 2 }])).toBe('Nets 1-2');
  });
  it('returns empty string when there is nothing to name (caller omits the line)', () => {
    expect(poolNetRange([])).toBe('');
    expect(poolNetRange([{ net: null }, { net: 'x' }])).toBe('');
    expect(poolNetRange(null)).toBe('');
    expect(poolNetRange(undefined)).toBe('');
    expect(poolNetRange('nope')).toBe('');
    expect(poolNetRange([null, undefined])).toBe('');
  });
});

describe('teamSkillDrift (design round §6 — how far apart the teams ended up)', () => {
  it('returns the spread and the two teams furthest apart, 0-based', () => {
    const teams = [
      [{ skill: 5 }, { skill: 5 }],              // 10.0
      [{ skill: 7 }, { skill: 7 }, { skill: 7 }], // 21.0  ← high
      [{ skill: 10 }],                            // 10.0  ← low
    ];
    expect(teamSkillDrift(teams)).toEqual({ spread: 11, highIndex: 1, lowIndex: 2 });
  });
  it('null when there are fewer than two teams to compare', () => {
    expect(teamSkillDrift([])).toBe(null);
    expect(teamSkillDrift([[{ skill: 5 }]])).toBe(null);
    expect(teamSkillDrift(null)).toBe(null);
    expect(teamSkillDrift(undefined)).toBe(null);
    expect(teamSkillDrift('nope')).toBe(null);
  });
  it('level teams are spread 0 with two DISTINCT indexes (never "Team 1 and Team 1")', () => {
    const drift = teamSkillDrift([[{ skill: 6 }], [{ skill: 6 }], [{ skill: 6 }]]);
    expect(drift.spread).toBe(0);
    expect(drift.highIndex).not.toBe(drift.lowIndex);
  });
  it('rounds to one decimal like the app prints skill (no binary float noise)', () => {
    expect(teamSkillDrift([[{ skill: 3.3 }], [{ skill: 1.1 }]])).toEqual({ spread: 2.2, highIndex: 0, lowIndex: 1 });
  });
  it('inherits teamSkillTotal\'s rules — unrated / negative / junk count as 0', () => {
    const teams = [
      [{ skill: 4 }, { skill: null }, { skill: 'x' }], // 4.0
      [{ skill: -9 }, { skill: 0 }],                    // 0.0
    ];
    expect(teamSkillDrift(teams)).toEqual({ spread: 4, highIndex: 0, lowIndex: 1 });
  });
  it('survives malformed teams', () => {
    expect(teamSkillDrift([null, [{ skill: 5 }]])).toEqual({ spread: 5, highIndex: 1, lowIndex: 0 });
  });
  it('reports the FIRST highest and the LAST lowest when totals tie', () => {
    const teams = [[{ skill: 9 }], [{ skill: 9 }], [{ skill: 1 }], [{ skill: 1 }]];
    expect(teamSkillDrift(teams)).toEqual({ spread: 8, highIndex: 0, lowIndex: 3 });
  });
});

describe('swapPlayersBetweenTeams (design round §6 — drag onto a team, trade with the closest)', () => {
  const ann = { name: 'Ann', skill: 8 };
  const bo = { name: 'Bo', skill: 2 };
  const cy = { name: 'Cy', skill: 7 };
  const di = { name: 'Di', skill: 1 };

  it('even teams trade the dragged player with the CLOSEST skill on the target', () => {
    const teams = [[ann, bo], [cy, di]];
    const out = swapPlayersBetweenTeams(teams, { teamIndex: 0, playerIndex: 0 }, 1);
    expect(out[0].map((p) => p.name)).toEqual(['Cy', 'Bo']);
    expect(out[1].map((p) => p.name)).toEqual(['Ann', 'Di']);
  });
  it('does not mutate the input teams', () => {
    const teams = [[ann, bo], [cy, di]];
    const out = swapPlayersBetweenTeams(teams, { teamIndex: 0, playerIndex: 0 }, 1);
    expect(teams[0].map((p) => p.name)).toEqual(['Ann', 'Bo']);
    expect(teams[1].map((p) => p.name)).toEqual(['Cy', 'Di']);
    expect(out).not.toBe(teams);
    expect(out[0]).not.toBe(teams[0]);
    expect(out[1]).not.toBe(teams[1]);
  });
  it('carries the SAME player objects across (no deep clone — identity survives the move)', () => {
    const teams = [[ann, bo], [cy, di]];
    const out = swapPlayersBetweenTeams(teams, { teamIndex: 0, playerIndex: 0 }, 1);
    expect(out[1][0]).toBe(ann);
    expect(out[0][0]).toBe(cy);
  });
  it('the closest player is by skill distance, not by position', () => {
    const teams = [[bo, ann], [cy, di]]; // drag Bo (2); Di (1) is closer than Cy (7)
    const out = swapPlayersBetweenTeams(teams, { teamIndex: 0, playerIndex: 0 }, 1);
    expect(out[0].map((p) => p.name)).toEqual(['Di', 'Ann']);
    expect(out[1].map((p) => p.name)).toEqual(['Cy', 'Bo']);
  });
  it('an equal distance goes to the first candidate', () => {
    const x = { name: 'X', skill: 5 }, y = { name: 'Y', skill: 0 };
    const p = { name: 'P', skill: 4 }, q = { name: 'Q', skill: 6 };
    const out = swapPlayersBetweenTeams([[x, y], [p, q]], { teamIndex: 0, playerIndex: 0 }, 1);
    expect(out[0].map((n) => n.name)).toEqual(['P', 'Y']);
    expect(out[1].map((n) => n.name)).toEqual(['X', 'Q']);
  });
  it('a short target team takes a MOVE, not a swap (it needs the body)', () => {
    const teams = [[ann, bo, cy], [di]];
    const out = swapPlayersBetweenTeams(teams, { teamIndex: 0, playerIndex: 0 }, 1);
    expect(out[0].map((p) => p.name)).toEqual(['Bo', 'Cy']);
    expect(out[1].map((p) => p.name)).toEqual(['Di', 'Ann']);
  });
  it('an EMPTY target team takes a move', () => {
    const teams = [[ann, bo], []];
    const out = swapPlayersBetweenTeams(teams, { teamIndex: 0, playerIndex: 0 }, 1);
    expect(out[0].map((p) => p.name)).toEqual(['Bo']);
    expect(out[1].map((p) => p.name)).toEqual(['Ann']);
  });
  it('never MOVES into a bigger team — that would only worsen the imbalance', () => {
    const teams = [[ann], [cy, di]]; // dragging into the larger team swaps instead
    const out = swapPlayersBetweenTeams(teams, { teamIndex: 0, playerIndex: 0 }, 1);
    expect(out[0].map((p) => p.name)).toEqual(['Cy']);
    expect(out[1].map((p) => p.name)).toEqual(['Ann', 'Di']);
  });
  it('single-player teams swap outright', () => {
    const out = swapPlayersBetweenTeams([[ann], [di]], { teamIndex: 0, playerIndex: 0 }, 1);
    expect(out[0].map((p) => p.name)).toEqual(['Di']);
    expect(out[1].map((p) => p.name)).toEqual(['Ann']);
  });
  it('dropping on the SAME team is a no-op that returns the input untouched', () => {
    const teams = [[ann, bo], [cy, di]];
    expect(swapPlayersBetweenTeams(teams, { teamIndex: 0, playerIndex: 1 }, 0)).toBe(teams);
  });
  it('out-of-range indexes return the input unchanged rather than throwing', () => {
    const teams = [[ann, bo], [cy, di]];
    expect(swapPlayersBetweenTeams(teams, { teamIndex: 0, playerIndex: 9 }, 1)).toBe(teams);
    expect(swapPlayersBetweenTeams(teams, { teamIndex: 0, playerIndex: -1 }, 1)).toBe(teams);
    expect(swapPlayersBetweenTeams(teams, { teamIndex: 9, playerIndex: 0 }, 1)).toBe(teams);
    expect(swapPlayersBetweenTeams(teams, { teamIndex: -1, playerIndex: 0 }, 1)).toBe(teams);
    expect(swapPlayersBetweenTeams(teams, { teamIndex: 0, playerIndex: 0 }, 9)).toBe(teams);
    expect(swapPlayersBetweenTeams(teams, { teamIndex: 0, playerIndex: 0 }, -1)).toBe(teams);
  });
  it('non-integer indexes return the input unchanged', () => {
    const teams = [[ann, bo], [cy, di]];
    expect(swapPlayersBetweenTeams(teams, { teamIndex: 0, playerIndex: 0.5 }, 1)).toBe(teams);
    expect(swapPlayersBetweenTeams(teams, { teamIndex: '0', playerIndex: 0 }, 1)).toBe(teams);
    expect(swapPlayersBetweenTeams(teams, { teamIndex: 0, playerIndex: 0 }, '1')).toBe(teams);
    expect(swapPlayersBetweenTeams(teams, { teamIndex: 0, playerIndex: 0 }, null)).toBe(teams);
  });
  it('garbage input returns the input unchanged rather than throwing', () => {
    const teams = [[ann, bo], [cy, di]];
    expect(swapPlayersBetweenTeams(teams, null, 1)).toBe(teams);
    expect(swapPlayersBetweenTeams(teams, undefined, 1)).toBe(teams);
    expect(swapPlayersBetweenTeams(teams, 'nope', 1)).toBe(teams);
    expect(swapPlayersBetweenTeams(null, { teamIndex: 0, playerIndex: 0 }, 1)).toBe(null);
    expect(swapPlayersBetweenTeams('nope', { teamIndex: 0, playerIndex: 0 }, 1)).toBe('nope');
    expect(swapPlayersBetweenTeams([[ann]], { teamIndex: 0, playerIndex: 0 }, 1)).toEqual([[ann]]);
  });
  it('a malformed target team is left alone', () => {
    const teams = [[ann, bo], null];
    expect(swapPlayersBetweenTeams(teams, { teamIndex: 0, playerIndex: 0 }, 1)).toBe(teams);
  });
});
