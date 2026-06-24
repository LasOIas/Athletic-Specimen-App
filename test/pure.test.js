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
  groupRosterPlayersBySection, isValidFullName, buildCopilotContext,
  resolvePlayerByName, COPILOT_TOOL_POLICY, validateCopilotToolArgs,
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
});
