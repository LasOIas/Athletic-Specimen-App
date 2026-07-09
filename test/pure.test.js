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
  countSharedTeammatePairs, pickMostDifferentTeams,
  groupRosterPlayersBySection, isValidFullName, buildCopilotContext,
  resolvePlayerByName, COPILOT_TOOL_POLICY, validateCopilotToolArgs,
  resolveTournamentMatch, publicHubStatus,
  scoringRulesFor, gameScoreStatus,
  splitNetsAcrossPools, distributeGamesOnNets, pickPoolCurrentGames,
  bracketGameNumbers, bracketSourceLabel,
  shouldAutoPromptBracket, assignBracketNets,
  shapeClaimCandidates, filterClaimCandidates,
  resolveMyTeam, computeTeamRecord, computeTeamRunTimeline,
  checkinHeroModel,
} = pure;

describe('isValidFullName (C47 — first+last name enforcement)', () => {
  it('accepts a normal first and last name', () => {
    expect(isValidFullName('Mike Olas')).toBe(true);
  });
  it('accepts two-letter first and last names', () => {
    expect(isValidFullName('Jo Oz')).toBe(true);
  });
  it('accepts names with apostrophes/hyphens (length counts characters)', () => {
    expect(isValidFullName("Mike O'Brien")).toBe(true);
    expect(isValidFullName('Mary-Jane Watson')).toBe(true);
  });
  it('accepts three-or-more words when first and last are each >= 2 chars', () => {
    expect(isValidFullName('Mike Van Olas')).toBe(true);
  });
  it('collapses surrounding and internal whitespace', () => {
    expect(isValidFullName('   Mike    Olas   ')).toBe(true);
  });
  it('rejects a single word (no last name)', () => {
    expect(isValidFullName('Mike')).toBe(false);
  });
  it('rejects a single-letter last name', () => {
    expect(isValidFullName('Mike O')).toBe(false);
  });
  it('rejects a single-letter first name', () => {
    expect(isValidFullName('M Olas')).toBe(false);
  });
  it('rejects empty / whitespace / non-string input', () => {
    expect(isValidFullName('')).toBe(false);
    expect(isValidFullName('   ')).toBe(false);
    expect(isValidFullName(null)).toBe(false);
    expect(isValidFullName(undefined)).toBe(false);
    expect(isValidFullName(42)).toBe(false);
  });
});

// Build a FINAL pool match the way computeStandings/computeSeeding read it.
const poolGame = (aId, bId, sa, sb) => ({
  phase: 'pool', status: 'final',
  team_a_id: aId, team_b_id: bId,
  score_a: sa, score_b: sb,
  winner_team_id: sa > sb ? aId : bId,
});

describe('gameScoreStatus + scoringRulesFor (NF-1 per-phase scoring)', () => {
  const pool = { target: 15, cap: 20, winBy2: true };
  const bracket = { target: 21, cap: null, winBy2: true };

  it('pool: reach target by 2 is valid', () => {
    expect(gameScoreStatus(15, 13, pool)).toMatchObject({ valid: true, decided: true, winner: 'A' });
  });
  it('pool: target reached but only by 1 is NOT valid (must win by 2)', () => {
    expect(gameScoreStatus(15, 14, pool)).toMatchObject({ valid: false, decided: false });
  });
  it('pool: extend past target until win-by-2 within cap is valid', () => {
    expect(gameScoreStatus(17, 15, pool)).toMatchObject({ valid: true, winner: 'A' });
  });
  it('pool: at the hard cap a 1-point win is valid (cap overrides win-by-2)', () => {
    expect(gameScoreStatus(20, 19, pool)).toMatchObject({ valid: true, winner: 'A' });
  });
  it('pool: above the hard cap is NOT valid', () => {
    expect(gameScoreStatus(21, 19, pool)).toMatchObject({ valid: false });
  });
  it('pool: below target is NOT valid', () => {
    expect(gameScoreStatus(14, 5, pool)).toMatchObject({ valid: false });
  });
  it('bracket: 21-19 valid, 21-20 invalid, 25-23 valid (no cap)', () => {
    expect(gameScoreStatus(21, 19, bracket)).toMatchObject({ valid: true, winner: 'A' });
    expect(gameScoreStatus(21, 20, bracket)).toMatchObject({ valid: false });
    expect(gameScoreStatus(25, 23, bracket)).toMatchObject({ valid: true, winner: 'A' });
  });
  it('tie is never decided', () => {
    expect(gameScoreStatus(15, 15, pool)).toMatchObject({ decided: false, winner: null });
  });
  it('scoringRulesFor reads new columns + legacy fallback', () => {
    expect(scoringRulesFor('pool', { pool_target: 15, pool_cap: 20, win_by_2: true })).toEqual({ target: 15, cap: 20, winBy2: true });
    expect(scoringRulesFor('main', { bracket_target: 25, bracket_cap: null, win_by_2: true })).toEqual({ target: 25, cap: null, winBy2: true });
    expect(scoringRulesFor('main', { match_cap: 21 })).toMatchObject({ target: 21, cap: null });
  });
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

describe('generateDoubleElim — EVERY tournament size is fully playable (Mike, 2026-06-27)', () => {
  // The bracket must be set up correctly for ANY number of teams (the current tournament's actual count —
  // not just powers of two). Simulate a full run for each N: seat seeds, play every game (lower seed wins),
  // advance via winnerNext/loserNext, and assert one champion, every team plays, every match resolves.
  const simulate = (N, reset) => {
    const { realMatches } = generateDoubleElim(N, reset);
    const byKey = {}; realMatches.forEach((m) => { byKey[m.key] = m; });
    const slots = {};
    realMatches.forEach((m) => {
      slots[m.key] = {
        a: m.aSource && m.aSource.seed ? m.aSource.seed : null,
        b: m.bSource && m.bSource.seed ? m.bSource.seed : null,
      };
    });
    const winnerOf = {}; const played = new Set(); const teamsPlayed = new Set();
    let progressed = true; let guard = 0;
    while (progressed && guard++ < 100000) {
      progressed = false;
      for (const m of realMatches) {
        if (played.has(m.key)) continue;
        const s = slots[m.key];
        if (s.a == null || s.b == null) continue;
        teamsPlayed.add(s.a); teamsPlayed.add(s.b);
        const w = Math.min(s.a, s.b); const l = Math.max(s.a, s.b);
        winnerOf[m.key] = w; played.add(m.key); progressed = true;
        if (m.winnerNext) slots[m.winnerNext.key][m.winnerNext.slot] = w;
        if (m.loserNext) slots[m.loserNext.key][m.loserNext.slot] = l;
      }
    }
    const gf = realMatches.filter((m) => m.side === 'grand_final').sort((a, b) => b.round - a.round)[0];
    return { realMatches, played, teamsPlayed, champ: gf ? winnerOf[gf.key] : null };
  };

  for (const reset of [false, true]) {
    for (let N = 2; N <= 24; N++) {
      it(`N=${N} (reset ${reset ? 'on' : 'off'}): single champion, every team plays, every match resolves`, () => {
        const r = simulate(N, reset);
        // every real match resolved (none stuck waiting on an unfilled slot)
        expect(r.played.size).toBe(r.realMatches.length);
        // every team 1..N actually plays at least one game
        for (let t = 1; t <= N; t++) expect(r.teamsPlayed.has(t)).toBe(true);
        // the top seed can win out (bracket is correctly wired end-to-end)
        expect(r.champ).toBe(1);
        // textbook double-elim game count: 2N-2 (or 2N-1 with a bracket reset)
        expect(r.realMatches.length).toBe(reset ? 2 * N - 1 : 2 * N - 2);
      });
    }
  }
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

describe('countSharedTeammatePairs (C31 #1 — re-roll variety metric)', () => {
  const tA = [[{ id: '1' }, { id: '2' }, { id: '3' }], [{ id: '4' }, { id: '5' }, { id: '6' }]];
  it('identical splits share every teammate pair', () => {
    expect(countSharedTeammatePairs(tA, tA)).toBe(6); // two teams of 3 -> 3+3 pairs
  });
  it('a fully reshuffled split shares zero pairs', () => {
    const tB = [[{ id: '1' }, { id: '4' }], [{ id: '2' }, { id: '5' }], [{ id: '3' }, { id: '6' }]];
    expect(countSharedTeammatePairs(tA, tB)).toBe(0);
  });
  it('counts only the pairs that stayed together', () => {
    // keeps 1&2 together and 5&6 together; everything else moves
    const tC = [[{ id: '1' }, { id: '2' }, { id: '4' }], [{ id: '3' }, { id: '5' }, { id: '6' }]];
    expect(countSharedTeammatePairs(tA, tC)).toBe(2);
  });
});

describe('pickMostDifferentTeams (C31 #1 — choose the biggest reshuffle)', () => {
  const prev = [[{ id: '1' }, { id: '2' }], [{ id: '3' }, { id: '4' }]];
  const candSame = [[{ id: '1' }, { id: '2' }], [{ id: '3' }, { id: '4' }]]; // shares 2
  const candDiff = [[{ id: '1' }, { id: '3' }], [{ id: '2' }, { id: '4' }]]; // shares 0
  it('picks the candidate that shares the fewest teammate pairs with the previous split', () => {
    expect(pickMostDifferentTeams([candSame, candDiff], prev)).toBe(candDiff);
  });
  it('returns null when there is no previous split to differ from', () => {
    expect(pickMostDifferentTeams([candSame, candDiff], null)).toBe(null);
    expect(pickMostDifferentTeams([candSame, candDiff], [])).toBe(null);
  });
});

describe('generateBalancedGroups re-roll (C31 #1 — varied but fair)', () => {
  it('re-rolls to mostly-new teammates while staying within the fair band', () => {
    const skills = [3, 4, 5, 3, 4, 5, 3, 4];
    const players = skills.map((s, i) => ({ id: String(i + 1), skill: s }));
    const keys = players.map(playerIdentityKey);
    let prev = generateBalancedGroups(players, keys, 2).teams;
    const selfPairs = countSharedTeammatePairs(prev, prev); // 2 teams of 4 -> 12
    let changedRuns = 0;
    for (let r = 0; r < 6; r += 1) {
      const next = generateBalancedGroups(players, keys, 2, prev).teams;
      expect(summarizeTeamFairness(next).skillSpread).toBeLessThanOrEqual(1.5);
      if (countSharedTeammatePairs(next, prev) < selfPairs) changedRuns += 1;
      prev = next;
    }
    expect(changedRuns).toBeGreaterThanOrEqual(5); // nearly every re-roll moves teammates
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
    { id: 'g9', name: '__as_group__:Hidden', group: '', skill: 0, checked_in: false }, // name-keyed sentinel
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

  it('excludes name-keyed sentinels (__as_group__:, __as_tournament_state__) too', () => {
    const out = disambiguatePlayersByName(players, 'hidden'); // matches the __as_group__:Hidden name
    expect(out).toEqual([]); // the name-keyed sentinel must never surface as a checkin-able person
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

// C48.5 — grouped collapsible roster sections (admin Players "Option C").
describe('groupRosterPlayersBySection', () => {
  // resolver mirrors app.js getPlayerGroups: primary first, then extra memberships
  const groupsOf = (p) => {
    const primary = String(p.group || '').trim();
    const extra = (p.groups || []).map((g) => String(g || '').trim()).filter(Boolean);
    if (!primary) return extra;
    return [primary, ...extra.filter((g) => g !== primary)];
  };

  it('groups players under their group and pins "Ungrouped" last', () => {
    const players = [
      { id: '1', name: 'Ana', group: 'Wed' },
      { id: '2', name: 'Bo', group: 'Mon' },
      { id: '3', name: 'Cy', group: '' },        // ungrouped
      { id: '4', name: 'Di', group: 'Wed' },
    ];
    const out = groupRosterPlayersBySection(players, groupsOf);
    expect(out.map((s) => s.name)).toEqual(['Mon', 'Wed', 'Ungrouped']); // alpha, Ungrouped last
    expect(out[out.length - 1].isUngrouped).toBe(true);
    expect(out.find((s) => s.name === 'Wed').players.map((p) => p.id)).toEqual(['1', '4']);
  });

  it('uses a lowercased key for the section and __ungrouped__ for the no-group bucket', () => {
    const out = groupRosterPlayersBySection(
      [{ id: '1', name: 'Ana', group: 'Wed Night' }, { id: '2', name: 'Bo', group: '' }],
      groupsOf
    );
    expect(out.find((s) => s.name === 'Wed Night').key).toBe('wed night');
    expect(out.find((s) => s.isUngrouped).key).toBe('__ungrouped__');
  });

  it('places a multi-group player in EVERY group they belong to', () => {
    const players = [{ id: '1', name: 'Ana', group: 'Wed', groups: ['Wed', 'Mon'] }];
    const out = groupRosterPlayersBySection(players, groupsOf);
    expect(out.map((s) => s.name).sort()).toEqual(['Mon', 'Wed']);
    expect(out.every((s) => s.players.length === 1)).toBe(true);
  });

  it('never emits an empty section and tolerates empty input', () => {
    expect(groupRosterPlayersBySection([], groupsOf)).toEqual([]);
    const out = groupRosterPlayersBySection([{ id: '1', name: 'Ana', group: 'Wed' }], groupsOf);
    expect(out.every((s) => s.players.length > 0)).toBe(true);
  });

  it('preserves the incoming player order within a section (A-Z strip relies on it)', () => {
    const players = [
      { id: '1', name: 'Aaron', group: 'Wed' },
      { id: '2', name: 'Bella', group: 'Wed' },
      { id: '3', name: 'Cara', group: 'Wed' },
    ];
    const out = groupRosterPlayersBySection(players, groupsOf);
    expect(out[0].players.map((p) => p.name)).toEqual(['Aaron', 'Bella', 'Cara']);
  });
});

describe('buildCopilotContext (C28 — co-pilot read context)', () => {
  it('attendance: counts checked-in players, groups them, excludes not-checked-in', () => {
    const ctx = buildCopilotContext({
      players: [
        { name: 'Mikey Olas', group: 'KC Volleyball', checked_in: true, skill: 9 },
        { name: 'Allie Hotz', group: 'KC Volleyball', checked_in: true, skill: 7 },
        { name: 'Rich Wells', group: '', checked_in: true, skill: 5 },
        { name: 'Jaakan Mullet', group: 'KC Volleyball', checked_in: false, skill: 8 },
      ],
    });
    expect(ctx.attendance.total).toBe(3);
    expect(ctx.attendance.byGroup).toEqual({ 'KC Volleyball': 2, 'Ungrouped': 1 });
    expect(ctx.attendance.here).toEqual([
      { name: 'Mikey Olas', group: 'KC Volleyball' },
      { name: 'Allie Hotz', group: 'KC Volleyball' },
      { name: 'Rich Wells', group: '' },
    ]);
  });

  it('REDACTION: no skill key and no skill value leaks (players + generatedTeams)', () => {
    const SENTINEL = 8.6531; // distinctive skill value that cannot appear as a count
    const s = JSON.stringify(buildCopilotContext({
      players: [{ name: 'Mikey Olas', group: 'KC', checked_in: true, skill: SENTINEL }],
      generatedTeams: [
        [{ name: 'Mikey Olas', skill: SENTINEL }, { name: 'Allie Hotz', skill: SENTINEL }],
        [{ name: 'Rich Wells', skill: SENTINEL }, { name: 'Jaakan Mullet', skill: SENTINEL }],
      ],
      liveData: { matchups: [{ teamA: 1, teamB: 2 }], waitingTeams: [], results: {}, liveCount: 1 },
    }));
    expect(s).not.toContain('skill');
    expect(s).not.toContain(String(SENTINEL));
  });

  it('casualCourts: maps matchups to redacted rosters + waiting onDeck + winner', () => {
    const ctx = buildCopilotContext({
      generatedTeams: [
        [{ name: 'A1', skill: 1 }, { name: 'A2', skill: 1 }], // team 1
        [{ name: 'B1', skill: 1 }, { name: 'B2', skill: 1 }], // team 2
        [{ name: 'C1', skill: 1 }, { name: 'C2', skill: 1 }], // team 3 (waiting)
      ],
      liveData: { matchups: [{ teamA: 1, teamB: 2 }], waitingTeams: [3], results: { '1-2': 1 }, liveCount: 0 },
    });
    expect(ctx.casualCourts.playing).toEqual([
      { court: 1, teamA: { n: 1, players: ['A1', 'A2'] }, teamB: { n: 2, players: ['B1', 'B2'] }, winner: 'A' },
    ]);
    expect(ctx.casualCourts.onDeck).toEqual([{ team: 3, players: ['C1', 'C2'] }]);
    expect(ctx.casualCourts.inProgress).toBe(0);
  });

  it('tournament: standings + upNextByNet from teams + matches', () => {
    const teams = [{ id: 't1', name: 'Mikey Mouse Clubhouse' }, { id: 't2', name: 'Spikers' }];
    const matches = [
      { id: 'm1', phase: 'pool', status: 'final', team_a_id: 't1', team_b_id: 't2', score_a: 21, score_b: 15, winner_team_id: 't1', pool_id: 'p1' },
      { id: 'm2', phase: 'pool', status: 'scheduled', team_a_id: 't2', team_b_id: 't1', net: 1, queue_order: 0 },
    ];
    const ctx = buildCopilotContext({ tournament: { name: 'Summer Slam', status: 'pools', teams, matches } });
    expect(ctx.tournament.name).toBe('Summer Slam');
    expect(ctx.tournament.status).toBe('pools');
    expect(ctx.tournament.standings[0]).toEqual({ rank: 1, team: 'Mikey Mouse Clubhouse', wins: 1, pointDiff: 6 });
    expect(ctx.tournament.upNextByNet).toEqual([{ net: 1, match: 'Spikers vs Mikey Mouse Clubhouse', queued: 0 }]);
  });

  it('empty: nothing going on -> nulls + zero attendance', () => {
    expect(buildCopilotContext({})).toEqual({
      attendance: { total: 0, byGroup: {}, here: [] },
      casualCourts: null,
      tournament: null,
    });
  });
});

describe('C28 Slice 2 — co-pilot acting pure helpers', () => {
  const players = [
    { id: 'p1', name: 'Mikey Olas', group: 'KC', checked_in: true, skill: 9 },
    { id: 'p2', name: 'Mike Stevens', group: 'KC', checked_in: false, skill: 4 },
    { id: 'p3', name: 'Jet', group: 'AS', checked_in: true, skill: 5 },
  ];

  it('resolvePlayerByName: exact full-name match wins, no skill leaks', () => {
    const r = resolvePlayerByName(players, 'mikey olas');
    expect(r).toEqual({ ok: true, player: { id: 'p1', name: 'Mikey Olas', group: 'KC' } });
    expect(JSON.stringify(r)).not.toContain('9');
    expect(JSON.stringify(r)).not.toContain('skill');
  });
  it('resolvePlayerByName: single substring match resolves', () => {
    expect(resolvePlayerByName(players, 'jet')).toEqual({ ok: true, player: { id: 'p3', name: 'Jet', group: 'AS' } });
  });
  it('resolvePlayerByName: ambiguous -> reason + match names', () => {
    const r = resolvePlayerByName(players, 'mike');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('ambiguous');
    expect(r.matches).toHaveLength(2);
    expect(r.matches.map((m) => m.name).sort()).toEqual(['Mike Stevens', 'Mikey Olas']);
    expect(r.matches.every((m) => m.group === 'KC')).toBe(true);
  });
  it('resolvePlayerByName: no match -> none', () => {
    expect(resolvePlayerByName(players, 'zzz')).toEqual({ ok: false, reason: 'none', matches: [] });
  });
  it('COPILOT_TOOL_POLICY: instant vs confirm per tool', () => {
    expect(COPILOT_TOOL_POLICY.check_in).toBe('instant');
    expect(COPILOT_TOOL_POLICY.make_teams).toBe('instant');
    expect(COPILOT_TOOL_POLICY.submit_score).toBe('confirm');
    expect(COPILOT_TOOL_POLICY.setup_tournament).toBe('confirm');
    expect(COPILOT_TOOL_POLICY.generate_bracket).toBe('confirm');
  });
  it('validateCopilotToolArgs: make_teams needs an integer count >= 2', () => {
    expect(validateCopilotToolArgs('make_teams', { count: 4 }).ok).toBe(true);
    expect(validateCopilotToolArgs('make_teams', { count: 1 }).ok).toBe(false);
    expect(validateCopilotToolArgs('make_teams', { count: 'x' }).ok).toBe(false);
  });
  it('validateCopilotToolArgs: check_in needs a non-empty name', () => {
    expect(validateCopilotToolArgs('check_in', { name: 'Jet' }).ok).toBe(true);
    expect(validateCopilotToolArgs('check_in', { name: '  ' }).ok).toBe(false);
  });
  it('validateCopilotToolArgs: setup_tournament needs a name + >=2 teams', () => {
    expect(validateCopilotToolArgs('setup_tournament', { name: 'Cup', teams: ['A', 'B'] }).ok).toBe(true);
    expect(validateCopilotToolArgs('setup_tournament', { name: 'Cup', teams: ['A'] }).ok).toBe(false);
    expect(validateCopilotToolArgs('setup_tournament', { name: '', teams: ['A', 'B'] }).ok).toBe(false);
  });
  it('COPILOT_TOOL_POLICY: create_tournament + register_team confirm (2026-06-27)', () => {
    expect(COPILOT_TOOL_POLICY.create_tournament).toBe('confirm');
    expect(COPILOT_TOOL_POLICY.register_team).toBe('confirm');
  });
  it('validateCopilotToolArgs: create_tournament needs a name', () => {
    expect(validateCopilotToolArgs('create_tournament', { name: 'Sunday Slam' }).ok).toBe(true);
    expect(validateCopilotToolArgs('create_tournament', { name: '  ' }).ok).toBe(false);
  });
  it('validateCopilotToolArgs: register_team needs a team name + >=1 player', () => {
    expect(validateCopilotToolArgs('register_team', { team_name: 'Spikers', players: ['A', 'B'] }).ok).toBe(true);
    expect(validateCopilotToolArgs('register_team', { team_name: 'Spikers', players: [] }).ok).toBe(false);
    expect(validateCopilotToolArgs('register_team', { team_name: '', players: ['A'] }).ok).toBe(false);
  });
});

describe('publicHubStatus (C32 — public hub tile logic)', () => {
  it('courts live → courts tile with the count', () => {
    expect(publicHubStatus({ checkedInCount: 12, liveCourtCount: 3, tournamentStatus: 'pools' }))
      .toEqual({ here: 12, liveTile: 'courts', liveCount: 3, tournamentLive: true });
  });
  it('no casual courts but a live tournament → tournament tile', () => {
    expect(publicHubStatus({ checkedInCount: 8, liveCourtCount: 0, tournamentStatus: 'bracket' }))
      .toEqual({ here: 8, liveTile: 'tournament', liveCount: 0, tournamentLive: true });
  });
  it('nothing live → none', () => {
    expect(publicHubStatus({ checkedInCount: 5, liveCourtCount: 0, tournamentStatus: 'setup' }))
      .toEqual({ here: 5, liveTile: 'none', liveCount: 0, tournamentLive: false });
  });
  it('coerces/guards missing inputs', () => {
    expect(publicHubStatus({})).toEqual({ here: 0, liveTile: 'none', liveCount: 0, tournamentLive: false });
  });
});

describe('resolveTournamentMatch (C28 Slice 2 — submit_score match resolution + score orientation)', () => {
  const teams = [
    { id: 't1', name: 'Red' },
    { id: 't2', name: 'Blue' },
    { id: 't3', name: 'Green' },
  ];
  const matches = [
    { id: 'm1', team_a_id: 't1', team_b_id: 't2', status: 'scheduled', version: 0 },
    { id: 'm2', team_a_id: 't1', team_b_id: 't3', status: 'final', version: 3 },
    { id: 'm3', team_a_id: 't2', team_b_id: 't3', status: 'scheduled', version: 1 },
  ];

  it('matches a scheduled game in the given orientation (orient "ab")', () => {
    const r = resolveTournamentMatch(teams, matches, 'Red', 'Blue');
    expect(r.ok).toBe(true);
    expect(r.match.id).toBe('m1');
    expect(r.orient).toBe('ab');
    expect(r.teamA).toBe('Red');
    expect(r.teamB).toBe('Blue');
  });
  it('matches when the names are reversed vs the match slots (orient "ba")', () => {
    const r = resolveTournamentMatch(teams, matches, 'Blue', 'Red');
    expect(r.ok).toBe(true);
    expect(r.match.id).toBe('m1');
    expect(r.orient).toBe('ba'); // team_a (Blue) is slot b of m1 -> caller must swap the scores
  });
  it('is case- and whitespace-insensitive on team names', () => {
    const r = resolveTournamentMatch(teams, matches, '  green ', 'BLUE');
    expect(r.ok).toBe(true);
    expect(r.match.id).toBe('m3');
  });
  it('skips a match that is already final', () => {
    const r = resolveTournamentMatch(teams, matches, 'Red', 'Green');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('nomatch');
  });
  it('reports an unknown team name', () => {
    const r = resolveTournamentMatch(teams, matches, 'Red', 'Purple');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('team');
    expect(r.teams).toEqual(['Red', 'Blue', 'Green']);
  });
  it('rejects the same team twice', () => {
    const r = resolveTournamentMatch(teams, matches, 'Red', 'red');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('same');
  });
});

describe('splitNetsAcrossPools (C70 — each pool owns a contiguous net block)', () => {
  it('splits evenly with the remainder going to the first pools', () => {
    expect(splitNetsAcrossPools(10, 4)).toEqual([[1, 2, 3], [4, 5, 6], [7, 8], [9, 10]]);
  });
  it('splits cleanly when divisible', () => {
    expect(splitNetsAcrossPools(8, 4)).toEqual([[1, 2], [3, 4], [5, 6], [7, 8]]);
  });
  it('gives every pool at least one net when nets < pools (shared, round-robin)', () => {
    expect(splitNetsAcrossPools(2, 4)).toEqual([[1], [2], [1], [2]]);
  });
  it('one pool gets all the nets', () => {
    expect(splitNetsAcrossPools(3, 1)).toEqual([[1, 2, 3]]);
  });
  it('no pools -> empty', () => {
    expect(splitNetsAcrossPools(10, 0)).toEqual([]);
  });
  it('covers every net exactly once, contiguously, when nets >= pools', () => {
    const flat = splitNetsAcrossPools(10, 3).flat();
    expect(flat).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]); // contiguous + complete
  });
  it('guards bad input (>=1 net, >=0 pools)', () => {
    expect(splitNetsAcrossPools(0, 2)).toEqual([[1], [1]]); // 0 nets -> treated as 1, shared
  });
});

describe('distributeGamesOnNets (C70 — pool games round-robin onto its nets, auto-advance queue)', () => {
  it('round-robins games across the pool nets with a per-net queue', () => {
    expect(distributeGamesOnNets(6, [1, 2])).toEqual([
      { net: 1, queue_order: 1 }, { net: 2, queue_order: 1 },
      { net: 1, queue_order: 2 }, { net: 2, queue_order: 2 },
      { net: 1, queue_order: 3 }, { net: 2, queue_order: 3 },
    ]);
  });
  it('single net -> a sequential queue', () => {
    expect(distributeGamesOnNets(3, [5])).toEqual([
      { net: 5, queue_order: 1 }, { net: 5, queue_order: 2 }, { net: 5, queue_order: 3 },
    ]);
  });
  it('falls back to net 1 when no nets are given', () => {
    expect(distributeGamesOnNets(2, [])).toEqual([{ net: 1, queue_order: 1 }, { net: 1, queue_order: 2 }]);
  });
  it('zero games -> empty', () => {
    expect(distributeGamesOnNets(0, [1, 2])).toEqual([]);
  });
});

describe('pickPoolCurrentGames (C70 fix — no team is "Now" on two nets at once)', () => {
  it('the conflict case: a team current on two nets gets de-conflicted to a disjoint set', () => {
    // The real bug (Pool A): Block Stars finished net1 q1, so net1 current = (BlockStars,NetGains);
    // net2 current (lowest unplayed) = (Diggers,NetGains) -> NetGains on BOTH nets. The fix skips net2 to
    // its next free game (PancakeHouse,Diggers) so both nets stay busy with disjoint teams.
    const net1 = [{ id: 'g2', team_a_id: 'BlockStars', team_b_id: 'NetGains' }, { id: 'g3', team_a_id: 'BlockStars', team_b_id: 'Diggers' }];
    const net2 = [{ id: 'g4', team_a_id: 'Diggers', team_b_id: 'NetGains' }, { id: 'g5', team_a_id: 'PancakeHouse', team_b_id: 'Diggers' }, { id: 'g6', team_a_id: 'NetGains', team_b_id: 'PancakeHouse' }];
    const cur = pickPoolCurrentGames([net1, net2]);
    expect(cur).toEqual(['g2', 'g5']); // net1 keeps g2; net2 skips g4 (NetGains busy) -> g5 (both free)
    // never the same team on both current games
    const teams = ['BlockStars', 'NetGains', 'PancakeHouse', 'Diggers'];
    expect(new Set(['g2', 'g5']).size).toBe(2);
  });
  it('no conflict -> each net keeps its lowest-queue game', () => {
    const net1 = [{ id: 'a', team_a_id: 'A', team_b_id: 'B' }];
    const net2 = [{ id: 'b', team_a_id: 'C', team_b_id: 'D' }];
    expect(pickPoolCurrentGames([net1, net2])).toEqual(['a', 'b']);
  });
  it('a net with only conflicting games waits (null)', () => {
    const net1 = [{ id: 'a', team_a_id: 'A', team_b_id: 'B' }];
    const net2 = [{ id: 'b', team_a_id: 'A', team_b_id: 'C' }]; // A busy -> no free game
    expect(pickPoolCurrentGames([net1, net2])).toEqual(['a', null]);
  });
  it('single net -> its first unplayed game', () => {
    expect(pickPoolCurrentGames([[{ id: 'x', team_a_id: 'A', team_b_id: 'B' }, { id: 'y', team_a_id: 'A', team_b_id: 'C' }]])).toEqual(['x']);
  });
  it('empty / all-played nets -> nulls', () => {
    expect(pickPoolCurrentGames([[], []])).toEqual([null, null]);
    expect(pickPoolCurrentGames([])).toEqual([]);
  });
  it('skips games missing a team (TBD)', () => {
    const net1 = [{ id: 'a', team_a_id: 'A', team_b_id: null }, { id: 'b', team_a_id: 'A', team_b_id: 'B' }];
    expect(pickPoolCurrentGames([net1])).toEqual(['b']);
  });
});

describe('bracketGameNumbers (continuous G1..GN in PLAY ORDER: winners+losers interleaved by round, grand final last)', () => {
  // intentionally shuffled input to prove the sort
  const main = [
    { id: 'gf', side: 'grand_final', round: 1, slot: 0, round_label: 'Grand Final' },
    { id: 'l2', side: 'losers', round: 2, slot: 0, round_label: 'LB R2 M1' },
    { id: 'w2', side: 'winners', round: 1, slot: 1, round_label: 'WB R1 M2' },
    { id: 'w3', side: 'winners', round: 2, slot: 0, round_label: 'WB R2 M1' },
    { id: 'l1', side: 'losers', round: 1, slot: 0, round_label: 'LB R1 M1' },
    { id: 'w1', side: 'winners', round: 1, slot: 0, round_label: 'WB R1 M1' },
  ];
  it('numbers in play order: round 1 (WB then LB), round 2 (WB then LB), grand final last', () => {
    const { byId } = bracketGameNumbers(main);
    // round 1: w1,w2 (winners) then l1 (losers) -> 1,2,3 ; round 2: w3 then l2 -> 4,5 ; GF last -> 6
    expect(byId).toEqual({ w1: 1, w2: 2, l1: 3, w3: 4, l2: 5, gf: 6 });
  });
  it('the grand final (championship) is the LAST / highest game number', () => {
    const { byId } = bracketGameNumbers(main);
    expect(byId.gf).toBe(Math.max(...Object.values(byId)));
  });
  it('maps the FULL stored round_label (incl. M#) so source refs can be rewritten', () => {
    const { byRoundLabel } = bracketGameNumbers(main);
    expect(byRoundLabel['WB R1 M1']).toBe(1);
    expect(byRoundLabel['LB R1 M1']).toBe(3);
    expect(byRoundLabel['Grand Final']).toBe(6);
  });
  it('empty / nullish -> empty maps', () => {
    expect(bracketGameNumbers([])).toEqual({ byId: {}, byRoundLabel: {} });
    expect(bracketGameNumbers(null)).toEqual({ byId: {}, byRoundLabel: {} });
  });
});

describe('bracketSourceLabel (Winner/Loser of G#)', () => {
  const byRoundLabel = { 'WB R1 M1': 1, 'WB R1 M2': 2, 'LB R2 M1': 7 };
  it('rewrites a winner source to its game number', () => {
    expect(bracketSourceLabel('Winner of WB R1 M1', byRoundLabel)).toBe('Winner of G1');
  });
  it('rewrites a loser source to its game number', () => {
    expect(bracketSourceLabel('Loser of LB R2 M1', byRoundLabel)).toBe('Loser of G7');
  });
  it('leaves an unknown reference untouched', () => {
    expect(bracketSourceLabel('Winner of WB R9 M9', byRoundLabel)).toBe('Winner of WB R9 M9');
  });
  it('passes through non-source / empty text', () => {
    expect(bracketSourceLabel('TBD', byRoundLabel)).toBe('TBD');
    expect(bracketSourceLabel(null, byRoundLabel)).toBe(null);
    expect(bracketSourceLabel('', byRoundLabel)).toBe('');
  });
});

describe('shouldAutoPromptBracket (C54 — revive the dead auto-generate prompt, 2026-06-30)', () => {
  // The bug: the old inline guard required activeMainTab === 'tournament', which is the PUBLIC Bracket
  // tab. In the admin tournament-mode dashboard activeMainTab is 'manage'/'live', so the prompt was DEAD
  // for every admin (Mike, mid-event: "pool play is done but there's no way to generate the bracket").
  const donePool = [
    { phase: 'pool', status: 'final', team_a_id: 'a', team_b_id: 'b' },
    { phase: 'pool', status: 'final', team_a_id: 'c', team_b_id: 'd' },
  ];
  const base = {
    isAdmin: true, tournamentMode: true, activeMainTab: 'manage',
    status: 'pools', poolMatches: donePool, alreadyPrompted: false,
  };

  it('THE BUG: fires for an admin in tournament mode (manage tab) with all pool games final', () => {
    expect(shouldAutoPromptBracket(base)).toBe(true);
  });
  it('fires on the Live tab too (tournament mode)', () => {
    expect(shouldAutoPromptBracket({ ...base, activeMainTab: 'live' })).toBe(true);
  });
  it('fires on the legacy public Bracket tab path (admin, not in tournament mode)', () => {
    expect(shouldAutoPromptBracket({ ...base, tournamentMode: false, activeMainTab: 'tournament' })).toBe(true);
  });
  it('treats a bye (missing team) as a completed pool game', () => {
    const withBye = [...donePool, { phase: 'pool', status: 'scheduled', team_a_id: 'e', team_b_id: null }];
    expect(shouldAutoPromptBracket({ ...base, poolMatches: withBye })).toBe(true);
  });

  it('does NOT fire for a non-admin (public viewer)', () => {
    expect(shouldAutoPromptBracket({ ...base, isAdmin: false })).toBe(false);
  });
  it('does NOT fire when an admin is in normal mode on another tab (no spurious prompt)', () => {
    expect(shouldAutoPromptBracket({ ...base, tournamentMode: false, activeMainTab: 'dashboard' })).toBe(false);
  });
  it('does NOT fire when the tournament is not in pools', () => {
    expect(shouldAutoPromptBracket({ ...base, status: 'bracket' })).toBe(false);
    expect(shouldAutoPromptBracket({ ...base, status: 'setup' })).toBe(false);
  });
  it('does NOT fire when already prompted this session (one-shot)', () => {
    expect(shouldAutoPromptBracket({ ...base, alreadyPrompted: true })).toBe(false);
  });
  it('does NOT fire when a pool game is still unplayed', () => {
    const unfinished = [...donePool, { phase: 'pool', status: 'scheduled', team_a_id: 'e', team_b_id: 'f' }];
    expect(shouldAutoPromptBracket({ ...base, poolMatches: unfinished })).toBe(false);
  });
  it('does NOT fire when there are no pool games at all', () => {
    expect(shouldAutoPromptBracket({ ...base, poolMatches: [] })).toBe(false);
    expect(shouldAutoPromptBracket({ ...base, poolMatches: null })).toBe(false);
  });
});

describe('assignBracketNets (re-net a bracket when net_count changes — mirrors tdbGenerateBracket, 2026-06-30)', () => {
  // Small double-elim: winners R1 (2 games), winners R2 = WB final (1), losers R1 (1), grand final (1).
  const bracket = [
    { id: 'w1a', side: 'winners', round: 1, slot: 0, phase: 'main' },
    { id: 'w1b', side: 'winners', round: 1, slot: 1, phase: 'main' },
    { id: 'w2',  side: 'winners', round: 2, slot: 0, phase: 'main' }, // WB final
    { id: 'l1',  side: 'losers',  round: 1, slot: 0, phase: 'main' },
    { id: 'gf',  side: 'grand_final', round: 1, slot: 0, phase: 'main' },
  ];

  it('spreads each round across nets (net_count 2): position-in-round % nc + 1', () => {
    // winners:1 has 2 games -> nets 1,2; losers:1 single -> 1; WB final single -> 1; GF carries WB-final net -> 1
    expect(assignBracketNets(bracket, 2)).toEqual({ w1a: 1, w1b: 2, w2: 1, l1: 1, gf: 1 });
  });
  it('collapses everything to net 1 when net_count is 1', () => {
    expect(assignBracketNets(bracket, 1)).toEqual({ w1a: 1, w1b: 1, w2: 1, l1: 1, gf: 1 });
  });
  it('with more nets than a round needs, the round still only uses as many as it has games', () => {
    expect(assignBracketNets(bracket, 5)).toEqual({ w1a: 1, w1b: 2, w2: 1, l1: 1, gf: 1 });
  });
  it('the grand final always shares the WB-final court', () => {
    const nets = assignBracketNets(bracket, 2);
    expect(nets.gf).toBe(nets.w2);
  });
  it('ignores non-bracket (pool) matches passed in', () => {
    const mixed = [...bracket, { id: 'p1', side: null, phase: 'pool', round: 0, slot: 0 }];
    const r = assignBracketNets(mixed, 2);
    expect(r.p1).toBeUndefined();
    expect(Object.keys(r).sort()).toEqual(['gf', 'l1', 'w1a', 'w1b', 'w2']);
  });
  it('empty / nullish -> empty map', () => {
    expect(assignBracketNets([], 3)).toEqual({});
    expect(assignBracketNets(null, 3)).toEqual({});
  });
  it('clamps a bad net_count to >= 1', () => {
    expect(assignBracketNets(bracket, 0)).toEqual({ w1a: 1, w1b: 1, w2: 1, l1: 1, gf: 1 });
  });
});

describe('shapeClaimCandidates (Slice 3b — claim-search rows from the team_members read)', () => {
  const row = (pid, pname, claimed, tid, tname) => ({
    player_id: pid,
    players: { id: pid, name: pname, claimed_by_profile: claimed },
    teams: { id: tid, name: tname, tournament_id: 'T1' },
  });
  it('flattens embedded rows to {id,name,teamId,teamName,claimedBy,initials} sorted by name', () => {
    const out = shapeClaimCandidates([
      row('p2', 'Zoe Aarons', null, 't1', 'Spikers'),
      row('p1', 'Amy Beck', 'prof-1', 't2', 'Setters'),
    ]);
    expect(out.map((c) => c.name)).toEqual(['Amy Beck', 'Zoe Aarons']);
    expect(out[0]).toEqual({ id: 'p1', name: 'Amy Beck', teamId: 't2', teamName: 'Setters', claimedBy: 'prof-1', initials: 'AB' });
    expect(out[1].claimedBy).toBe(null);
    expect(out[1].initials).toBe('ZA');
  });
  it('keeps one row per (player, team) — a player on two teams appears twice', () => {
    const out = shapeClaimCandidates([
      row('p1', 'Amy Beck', null, 't1', 'Spikers'),
      row('p1', 'Amy Beck', null, 't2', 'Setters'),
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((c) => c.teamName).sort()).toEqual(['Setters', 'Spikers']);
  });
  it('skips malformed rows (missing embedded player/team) and blank names', () => {
    const out = shapeClaimCandidates([
      row('p1', 'Amy Beck', null, 't1', 'Spikers'),
      { player_id: 'px', players: null, teams: { id: 't', name: 'T', tournament_id: 'T1' } },
      { player_id: 'py', players: { id: 'py', name: '   ', claimed_by_profile: null }, teams: { id: 't', name: 'T' } },
      null,
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Amy Beck');
  });
  it('single-word names get a single initial; non-array input returns []', () => {
    const out = shapeClaimCandidates([row('p1', 'Cory', null, 't1', 'Dinkers')]);
    expect(out[0].initials).toBe('C');
    expect(shapeClaimCandidates(undefined)).toEqual([]);
  });
});

describe('filterClaimCandidates (Slice 3b — claim search keeps team/claim fields)', () => {
  const cands = [
    { id: 'p1', name: 'Cade Wilson', teamId: 't1', teamName: 'Chewblockas', claimedBy: null, initials: 'CW' },
    { id: 'p2', name: 'Caleb Standifer', teamId: 't1', teamName: 'Chewblockas', claimedBy: 'other', initials: 'CS' },
    { id: 'p3', name: 'Mica Deleon', teamId: 't2', teamName: 'Setting Ducks', claimedBy: null, initials: 'MD' },
  ];
  it('matches case-insensitive substrings and RETURNS THE ORIGINAL OBJECTS (teamName/claimedBy intact)', () => {
    // 'ca' hits Cade + Caleb at position 0 AND 'Mica' mid-string — substring semantics, prefix-first order
    const out = filterClaimCandidates(cands, 'ca');
    expect(out.map((c) => c.name)).toEqual(['Cade Wilson', 'Caleb Standifer', 'Mica Deleon']);
    expect(out[0].teamName).toBe('Chewblockas');
    expect(out.find((c) => c.id === 'p2').claimedBy).toBe('other');
  });
  it('prefix matches sort before mid-string matches', () => {
    // 'de' hits 'Dean Ford' at position 0 and Cade/Deleon mid-string — Dean must lead
    const out2 = filterClaimCandidates([...cands, { id: 'p4', name: 'Dean Ford', teamId: 't3', teamName: 'X', claimedBy: null, initials: 'DF' }], 'de');
    expect(out2[0].name).toBe('Dean Ford');
    expect(out2.map((c) => c.name)).toContain('Cade Wilson');
  });
  it('empty/whitespace query returns []; caps at 12', () => {
    expect(filterClaimCandidates(cands, '  ')).toEqual([]);
    const many = Array.from({ length: 20 }, (_, i) => ({ id: 'x' + i, name: 'Sam ' + i, teamId: 't', teamName: 'T', claimedBy: null, initials: 'S' }));
    expect(filterClaimCandidates(many, 'sam')).toHaveLength(12);
  });
});

describe('Slice 3c personal-layer helpers (resolveMyTeam / computeTeamRecord / computeTeamRunTimeline)', () => {
  const TEAMS = [
    { id: 'tA', name: 'Dink Responsibly', pool_id: 'p1' },
    { id: 'tB', name: 'Ballin' },
    { id: 'tC', name: 'Block Party' },
    { id: 'tD', name: 'Your Sets Suck' },
  ];
  const cand = (id, claimedBy, teamId, teamName) => ({ id, name: 'X Y', teamId, teamName, claimedBy, initials: 'XY' });
  const fin = (id, net, q, a, b, sa, sb, at) => ({
    id, phase: 'pool', status: 'final', net, queue_order: q,
    team_a_id: a, team_b_id: b, score_a: sa, score_b: sb,
    winner_team_id: sa > sb ? a : b, updated_at: at,
  });
  const sched = (id, net, q, a, b, extra) => ({
    id, phase: 'pool', status: 'scheduled', net, queue_order: q,
    team_a_id: a, team_b_id: b, score_a: null, score_b: null, ...extra,
  });

  describe('resolveMyTeam', () => {
    it('finds the candidate claimed by the profile', () => {
      const out = resolveMyTeam('prof-1', [cand('pl1', null, 'tB', 'Ballin'), cand('pl2', 'prof-1', 'tA', 'Dink Responsibly')]);
      expect(out).toMatchObject({ playerId: 'pl2', teamId: 'tA', teamName: 'Dink Responsibly' });
    });
    it('returns null when unclaimed / no profile / empty', () => {
      expect(resolveMyTeam('prof-9', [cand('pl1', 'prof-1', 'tA', 'D')])).toBeNull();
      expect(resolveMyTeam(null, [cand('pl1', 'prof-1', 'tA', 'D')])).toBeNull();
      expect(resolveMyTeam('prof-1', null)).toBeNull();
    });
  });

  describe('computeTeamRecord', () => {
    const matches = [
      fin('m1', 1, 1, 'tA', 'tB', 21, 18, '2026-07-09T18:00:00Z'),
      fin('m2', 2, 2, 'tD', 'tA', 21, 15, '2026-07-09T18:30:00Z'),
      fin('m3', 1, 3, 'tC', 'tD', 21, 10, '2026-07-09T18:40:00Z'), // not mine
      sched('m4', 1, 5, 'tA', 'tC'),                                // unplayed: ignored
    ];
    it('counts wins/losses/pointDiff over MY finals only, results ordered by time', () => {
      const r = computeTeamRecord('tA', matches, TEAMS);
      expect(r.wins).toBe(1);
      expect(r.losses).toBe(1);
      expect(r.pointDiff).toBe(3 - 6);
      expect(r.results.map((g) => g.oppName)).toEqual(['Ballin', 'Your Sets Suck']);
      expect(r.results[0]).toMatchObject({ won: true, myScore: 21, oppScore: 18 });
      expect(r.results[1]).toMatchObject({ won: false, myScore: 15, oppScore: 21 });
    });
    it('empty inputs -> zero record', () => {
      expect(computeTeamRecord('tA', [], TEAMS)).toMatchObject({ wins: 0, losses: 0, pointDiff: 0, results: [] });
    });
  });

  describe('computeTeamRunTimeline', () => {
    // net 1 finals at 18:00, 18:10, 18:20 -> two 10-min gaps, median 10
    const finals = [
      fin('f1', 1, 1, 'tA', 'tB', 21, 18, '2026-07-09T18:00:00Z'),
      fin('f2', 1, 2, 'tC', 'tD', 21, 12, '2026-07-09T18:10:00Z'),
      fin('f3', 1, 3, 'tB', 'tC', 21, 19, '2026-07-09T18:20:00Z'),
    ];
    it('last = my most recent final, oriented to me', () => {
      const tl = computeTeamRunTimeline('tA', finals.concat([sched('u1', 1, 4, 'tA', 'tC')]), TEAMS);
      expect(tl.last).toMatchObject({ won: true, myScore: 21, oppScore: 18, oppName: 'Ballin' });
    });
    it('next: gamesAhead counts unplayed on the SAME net before mine; eta = median gap x gamesAhead', () => {
      const matches = finals.concat([
        sched('u0', 1, 4, 'tB', 'tD'),      // ahead of mine on net 1
        sched('u1', 1, 5, 'tA', 'tC'),      // mine
        sched('u2', 2, 6, 'tD', 'tA'),      // my later game, net 2
      ]);
      const tl = computeTeamRunTimeline('tA', matches, TEAMS);
      expect(tl.next).toMatchObject({ net: 1, oppName: 'Block Party', gamesAhead: 1, etaMin: 10, isNow: false });
      expect(tl.then).toMatchObject({ oppName: 'Your Sets Suck' });
    });
    it('isNow when nothing ahead on my net (or my game is live); eta null with <2 gap samples', () => {
      const matches = [
        fin('f1', 1, 1, 'tA', 'tB', 21, 18, '2026-07-09T18:00:00Z'), // only ONE final -> no gap samples
        sched('u1', 1, 2, 'tA', 'tC'),
      ];
      const tl = computeTeamRunTimeline('tA', matches, TEAMS);
      expect(tl.next).toMatchObject({ gamesAhead: 0, isNow: true, etaMin: null });
      expect(tl.then).toBeNull();
    });
    it('bracket next: my playable main-phase matchup, no eta/gamesAhead', () => {
      const matches = [
        { id: 'b1', phase: 'main', status: 'scheduled', net: 2, queue_order: 1, team_a_id: 'tA', team_b_id: 'tD' },
        { id: 'b2', phase: 'main', status: 'scheduled', net: 1, queue_order: 2, team_a_id: null, team_b_id: 'tB' }, // teamless: not "playable" and not mine
      ];
      const tl = computeTeamRunTimeline('tA', matches, TEAMS);
      expect(tl.next).toMatchObject({ net: 2, oppName: 'Your Sets Suck', etaMin: null, gamesAhead: null });
      expect(tl.last).toBeNull();
    });
    it('no matches -> all null', () => {
      expect(computeTeamRunTimeline('tA', [], TEAMS)).toEqual({ last: null, next: null, then: null });
    });
  });
});

describe('checkinHeroModel', () => {
  it('returns the single claimed player', () => {
    expect(checkinHeroModel([{ id: 'a1', name: 'Michael Olas' }])).toEqual({ id: 'a1', name: 'Michael Olas' });
  });
  it('is null when nothing is claimed', () => {
    expect(checkinHeroModel([])).toBeNull();
    expect(checkinHeroModel(null)).toBeNull();
  });
  it('is null when ambiguous (2+ claimed rows)', () => {
    expect(checkinHeroModel([{ id: 'a', name: 'x' }, { id: 'b', name: 'y' }])).toBeNull();
  });
  it('is null on malformed rows', () => {
    expect(checkinHeroModel([{ id: null, name: '' }])).toBeNull();
  });
});
