// C25 item 1 — behavior-locking tests for the pure logic in public/pure.js.
// These assert CURRENT behavior (the extraction must not change it). Loaded via Node's CJS
// require (pure.js uses a module.exports guard) to avoid any ESM/CJS interop ambiguity.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pure = require('../public/pure.js');
const {
  validateScores, decideWinner, generateRoundRobin, generateDoubleElim,
  computeStandings, computeSeeding, computeChampion, summarizeTeamFairness,
  generateBalancedGroups, playerIdentityKey, disambiguatePlayersByName,
} = pure;

// Build a FINAL pool match the way computeStandings/computeSeeding read it.
const poolGame = (aId, bId, sa, sb) => ({
  phase: 'pool', status: 'final',
  team_a_id: aId, team_b_id: bId,
  score_a: sa, score_b: sb,
  winner_team_id: sa > sb ? aId : bId,
});

describe('validateScores (current behavior — no upper cap yet; item 3 will add one)', () => {
  it('accepts valid non-negative integers', () => {
    expect(validateScores(21, 19)).toEqual({ sa: 21, sb: 19 });
  });
  it('coerces numeric strings', () => {
    expect(validateScores('25', '23')).toEqual({ sa: 25, sb: 23 });
  });
  it('rejects negatives and non-integers', () => {
    expect(() => validateScores(-1, 5)).toThrow();
    expect(() => validateScores(1.5, 3)).toThrow();
  });
  it('rejects scores above the cap (item 3) and accepts the boundary', () => {
    expect(validateScores(99, 0)).toEqual({ sa: 99, sb: 0 }); // boundary OK
    expect(() => validateScores(100, 0)).toThrow();
    expect(() => validateScores(99999, 0)).toThrow();
  });
});

describe('decideWinner', () => {
  it('higher score wins', () => {
    expect(decideWinner(25, 20)).toBe('A');
    expect(decideWinner(20, 25)).toBe('B');
  });
  it('ties and blanks have no winner', () => {
    expect(decideWinner(25, 25)).toBeNull();
    expect(decideWinner('', '5')).toBeNull(); // blank must be rejected before Number() coercion
  });
});

describe('computeStandings — head-to-head breaks a wins+pointDiff tie, overriding id order', () => {
  // Top pair (2 wins, +15 each): Zeta beat Alpha. Bottom pair (1 win, -15 each): Mid beat Low.
  // Default tiebreak after (wins, pointDiff) is teamId asc, so without H2H it would be
  // Alpha-before-Zeta and Low-before-Mid. H2H must flip both pairs.
  const teams = [
    { id: 'a', name: 'Alpha' }, { id: 'z', name: 'Zeta' },
    { id: 'm', name: 'Mid' }, { id: 'l', name: 'Low' },
  ];
  const matches = [
    poolGame('z', 'a', 25, 15), // Zeta beats Alpha (+10 / -10)
    poolGame('a', 'm', 25, 15), // Alpha beats Mid  (+10)
    poolGame('a', 'l', 25, 10), // Alpha beats Low  (+15)  -> Alpha 2-1, diff +15
    poolGame('z', 'm', 25, 15), // Zeta beats Mid   (+10)
    poolGame('z', 'l', 20, 25), // Zeta loses to Low(-5)  -> Zeta 2-1, diff +15
    poolGame('m', 'l', 25, 20), // Mid beats Low    (+5)  -> Mid 1-2 diff -15, Low 1-2 diff -15
  ];
  it('ranks Zeta over Alpha and Mid over Low via head-to-head', () => {
    const standings = computeStandings(teams, matches);
    expect(standings.map((r) => r.teamId)).toEqual(['z', 'a', 'm', 'l']);
    expect(standings[0].rank).toBe(1);
    expect(standings[1].wins).toBe(2);
    expect(standings[2].wins).toBe(1);
  });
});

describe('computeSeeding — ranks by win% (not raw wins), then point diff', () => {
  // X is 1-0 (winPct 1.0); Y is 2-1 (winPct .667) with MORE raw wins. X must still seed above Y.
  const teams = [
    { id: 'x', name: 'X' }, { id: 'y', name: 'Y' },
    { id: 'q', name: 'Q' }, { id: 'r', name: 'R' },
  ];
  const matches = [
    poolGame('x', 'y', 25, 20), // X beats Y    -> X 1-0 (winPct 1.0)
    poolGame('y', 'q', 25, 20), // Y win
    poolGame('y', 'r', 25, 20), // Y win        -> Y 2-1 (winPct .667), more raw wins than X
  ];
  it('seeds the undefeated team first despite fewer total wins', () => {
    const seeded = computeSeeding(teams, matches);
    const x = seeded.find((r) => r.teamId === 'x');
    const y = seeded.find((r) => r.teamId === 'y');
    expect(y.wins).toBeGreaterThan(x.wins); // Y has MORE raw wins...
    expect(x.seed).toBeLessThan(y.seed);    // ...but X seeds higher on win%
    expect(seeded[0].teamId).toBe('x');
  });
});

describe('generateDoubleElim — bracket wiring and advancement pointers', () => {
  const assertNoDanglingPointers = (result) => {
    const keys = new Set(result.realMatches.map((m) => m.key));
    for (const m of result.realMatches) {
      if (m.winnerNext) expect(keys.has(m.winnerNext.key)).toBe(true);
      if (m.loserNext) expect(keys.has(m.loserNext.key)).toBe(true);
      for (const src of [m.aSource, m.bSource]) {
        if (src && src.of) expect(keys.has(src.of)).toBe(true);
      }
    }
  };

  it('N=4 with reset: sizes, seed placement, grand final + reset, no dangling pointers', () => {
    const r = generateDoubleElim(4, true);
    expect(r.seedCount).toBe(4);
    expect(r.B).toBe(4);
    expect(r.K).toBe(2);
    const gf1 = r.realMatches.filter((m) => m.side === 'grand_final' && m.round === 1);
    const gf2 = r.realMatches.filter((m) => m.side === 'grand_final' && m.round === 2);
    expect(gf1.length).toBe(1);
    expect(gf2.length).toBe(1); // reset match present because resetEnabled
    // seed 1 is placed somewhere as a source
    const hasSeed1 = r.realMatches.some((m) => (m.aSource && m.aSource.seed === 1) || (m.bSource && m.bSource.seed === 1));
    expect(hasSeed1).toBe(true);
    assertNoDanglingPointers(r);
  });

  it('N=3: a bye is resolved away (no real match references seed 4) and pointers stay valid', () => {
    const r = generateDoubleElim(3, false);
    expect(r.seedCount).toBe(3);
    expect(r.B).toBe(4);
    const refsBye = r.realMatches.some((m) => (m.aSource && m.aSource.seed === 4) || (m.bSource && m.bSource.seed === 4));
    expect(refsBye).toBe(false);
    assertNoDanglingPointers(r);
  });

  it('N<2 yields an empty bracket', () => {
    expect(generateDoubleElim(1, false).realMatches).toEqual([]);
  });
});

describe('computeChampion', () => {
  const teams = [{ id: 'w', name: 'Winners' }, { id: 'l', name: 'Losers' }];
  it('returns the GF winner when the winners-bracket team takes it without a reset', () => {
    const main = [{ side: 'grand_final', round: 1, status: 'final', winner_team_id: 'w', team_a_id: 'w', team_b_id: 'l' }];
    expect(computeChampion(main, teams)).toEqual({ teamId: 'w', name: 'Winners' });
  });
  it('returns null while the grand final is unfinished', () => {
    const main = [{ side: 'grand_final', round: 1, status: 'scheduled', team_a_id: 'w', team_b_id: 'l' }];
    expect(computeChampion(main, teams)).toBeNull();
  });
});

describe('generateRoundRobin', () => {
  it('every pair plays exactly once', () => {
    const pairs = generateRoundRobin(['a', 'b', 'c', 'd']);
    expect(pairs.length).toBe(6); // C(4,2)
    const seen = new Set(pairs.map(([x, y]) => [x, y].sort().join('-')));
    expect(seen.size).toBe(6);
  });
  it('odd counts drop the bye (no null opponents)', () => {
    const pairs = generateRoundRobin(['a', 'b', 'c']);
    expect(pairs.length).toBe(3);
    expect(pairs.every(([x, y]) => x !== null && y !== null)).toBe(true);
  });
});

describe('summarizeTeamFairness', () => {
  it('balanced totals score 0', () => {
    const s = summarizeTeamFairness([[{ skill: 10 }, { skill: 5 }], [{ skill: 8 }, { skill: 7 }]]);
    expect(s.skillSpread).toBe(0);
    expect(s.countSpread).toBe(0);
    expect(s.score).toBe(0);
  });
  it('computes spread + stdev-weighted score', () => {
    // totals [10,4]: spread 6, counts equal, stdev 3 -> score = 6 + 0 + 3*0.25 = 6.75
    const s = summarizeTeamFairness([[{ skill: 10 }], [{ skill: 4 }]]);
    expect(s.skillSpread).toBe(6);
    expect(s.skillStdev).toBeCloseTo(3, 6);
    expect(s.score).toBeCloseTo(6.75, 6);
  });
});

describe('generateBalancedGroups (stochastic — invariants only)', () => {
  it('places every checked-in player exactly once across the requested group count', () => {
    const players = [
      { id: '1', skill: 10 }, { id: '2', skill: 8 },
      { id: '3', skill: 6 }, { id: '4', skill: 4 }, { id: '5', skill: 2 },
    ];
    const checkedInKeys = players.map(playerIdentityKey); // 'id:1'...'id:5'
    const out = generateBalancedGroups(players, checkedInKeys, 2);
    expect(out.teams.length).toBe(2);
    const flat = out.teams.flat();
    expect(flat.length).toBe(5);
    expect(new Set(flat.map(playerIdentityKey)).size).toBe(5);
    expect(out.summary.attempts).toBeGreaterThan(0);
  });
  it('returns empty teams when nobody is checked in', () => {
    const out = generateBalancedGroups([{ id: '1', skill: 5 }], [], 3);
    expect(out.teams.length).toBe(3);
    expect(out.teams.flat().length).toBe(0);
  });
});

// C36 T1 — kiosk "tap your name" search. Pure: name-substring filter (case-insensitive),
// drops __as_* sentinels, prefix-matches sort first, max 12, NO skill in the result shape.
describe('disambiguatePlayersByName (C36 T1 kiosk search)', () => {
  const players = [
    { id: '1', name: 'Anna Reed', group: 'Mon', skill: 9, checked_in: false },
    { id: '2', name: 'Adam Cole', group: 'Wed', skill: 3, checked_in: true },
    { id: '3', name: 'Brian Lee', group: 'Mon', skill: 7, checked_in: false },
    { id: '4', name: 'Mariana', group: '', skill: 5, checked_in: false }, // substring 'ana' (not prefix)
    { id: '__as_sentinel', name: 'All Players', group: 'All', skill: 0, checked_in: false },
  ];

  it('returns [] for an empty / whitespace query', () => {
    expect(disambiguatePlayersByName(players, '')).toEqual([]);
    expect(disambiguatePlayersByName(players, '   ')).toEqual([]);
  });

  it('filters by case-insensitive name substring and excludes __as_* sentinels', () => {
    const out = disambiguatePlayersByName(players, 'an');
    const ids = out.map((p) => p.id);
    // 'an' matches "Anna" (An…) and "Mariana" (…an…); "Adam Cole" has no 'an' substring
    expect(ids).toContain('1'); // Anna Reed
    expect(ids).toContain('4'); // Mariana
    expect(ids).not.toContain('2'); // Adam Cole — no 'an' substring
    expect(ids).not.toContain('__as_sentinel'); // sentinel always excluded
  });

  it('prefix matches sort before mid-string matches', () => {
    const out = disambiguatePlayersByName(players, 'an');
    // "Anna Reed" (prefix) must come before "Mariana" (mid-string)
    expect(out[0].id).toBe('1');
  });

  it('returns the no-skill shape {id,name,group,initials,checkedIn} and never leaks skill', () => {
    const out = disambiguatePlayersByName(players, 'adam');
    expect(out.length).toBe(1);
    const row = out[0];
    expect(row).toEqual({ id: '2', name: 'Adam Cole', group: 'Wed', initials: 'AC', checkedIn: true });
    expect('skill' in row).toBe(false);
  });

  it('caps results at 12', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: String(i), name: `Sam ${i}`, group: 'G', skill: i, checked_in: false }));
    expect(disambiguatePlayersByName(many, 'sam').length).toBe(12);
  });
});
