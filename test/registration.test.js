// Finish-line Slice 3 (2026-07-09, spec §13.5) — behavior tests for the registration event-card +
// join-sheet pure helpers in public/pure.js. Loaded via Node CJS require, matching the other suites.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { registerEventModel, joinSheetValidate, registerFormValidate, teamNameTaken } = require('../public/pure.js');

describe('registerEventModel', () => {
  it('marks registration OPEN only for a setup tournament with registration_open', () => {
    const open = registerEventModel({ name: 'July 2026 tournament', status: 'setup', registration_open: true, team_size: 4 }, []);
    expect(open.regOpen).toBe(true);
    const closed = registerEventModel({ name: 'July', status: 'setup', registration_open: false, team_size: 4 }, []);
    expect(closed.regOpen).toBe(false);
    // registration_open is honored ONLY in setup — a live/completed event is never "open" here
    const live = registerEventModel({ name: 'July', status: 'pools', registration_open: true, team_size: 4 }, []);
    expect(live.regOpen).toBe(false);
  });

  it('reads "Be the first team in" at zero teams, "N teams in" otherwise', () => {
    expect(registerEventModel({ status: 'setup', registration_open: true, team_size: 4 }, []).spotsLead).toBe('Be the first team in');
    expect(registerEventModel({ status: 'setup', registration_open: true, team_size: 4 }, []).isEmpty).toBe(true);
    expect(registerEventModel({ status: 'setup', registration_open: true, team_size: 4 }, [{ id: 'a' }]).spotsLead).toBe('1 team in');
    expect(registerEventModel({ status: 'setup', registration_open: true, team_size: 4 }, [{ id: 'a' }, { id: 'b' }]).spotsLead).toBe('2 teams in');
  });

  it('never invents a date — dateChip is null unless the tournament carries one', () => {
    // the live tournaments table has no date column → always null → the chip is omitted
    expect(registerEventModel({ status: 'setup', registration_open: true, team_size: 4 }, []).dateChip).toBeNull();
    // future-proof: honor a real date field if one is ever added
    expect(registerEventModel({ status: 'setup', event_date: 'Saturday, Aug 8' }, []).dateChip).toBe('Saturday, Aug 8');
  });

  it('shows the buy_in when set, else the spec-locked league price; players chip from team_size', () => {
    expect(registerEventModel({ status: 'setup', team_size: 4 }, []).costChip).toBe('$80 a team');
    expect(registerEventModel({ status: 'setup', team_size: 4, buy_in: '$100 per team' }, []).costChip).toBe('$100 per team');
    expect(registerEventModel({ status: 'setup', team_size: 6 }, []).playersChip).toBe('6 players');
    expect(registerEventModel({ status: 'setup' }, []).playersChip).toBe('4 players'); // team_size defaults to 4
  });

  it('falls back to a safe name and tolerates null/empty inputs without throwing', () => {
    expect(registerEventModel(null, null).name).toBe('Tournament');
    expect(registerEventModel({}, undefined).count).toBe(0);
    expect(registerEventModel({ name: '   ' }, []).name).toBe('Tournament');
  });
});

describe('joinSheetValidate', () => {
  it('requires a team name with the exact inline copy', () => {
    expect(joinSheetValidate('', ['a', 'b', 'c', 'd'], 4)).toEqual({ ok: false, message: 'Enter a team name.' });
    expect(joinSheetValidate('   ', ['a', 'b', 'c', 'd'], 4)).toEqual({ ok: false, message: 'Enter a team name.' });
  });

  it('requires exactly the tournament team size (empties dropped), with the exact inline copy', () => {
    expect(joinSheetValidate('Sand Sharks', ['a', 'b', 'c', ''], 4)).toEqual({ ok: false, message: 'Enter all 4 players.' });
    expect(joinSheetValidate('Sand Sharks', ['a', 'b', 'c', 'd', 'e'], 4)).toEqual({ ok: false, message: 'Enter all 4 players.' });
    expect(joinSheetValidate('Sand Sharks', ['a', 'b'], 6).message).toBe('Enter all 6 players.');
  });

  it('passes a complete team and returns the trimmed name + roster', () => {
    const out = joinSheetValidate('  Sand Sharks ', ['  Mike ', 'Jess', 'Ann', 'Bo'], 4);
    expect(out.ok).toBe(true);
    expect(out.teamName).toBe('Sand Sharks');
    expect(out.roster).toEqual(['Mike', 'Jess', 'Ann', 'Bo']);
  });

  it('defaults team size to 4 and tolerates a null roster', () => {
    expect(joinSheetValidate('X', null).message).toBe('Enter all 4 players.');
  });
});

// Launch spec (2026-07-10) — the NEW registration PAGE validator. Every player must carry a first AND a
// last name (Mike: "there are no captains; every player must have a first and last name"). Same team-name +
// exact-size gates as joinSheetValidate, plus a per-row full-name gate that names the offending value, and
// it trims every name before returning so the stored roster jsonb is clean (fixes the raw-REST untrimmed note).
describe('registerFormValidate', () => {
  it('requires a non-empty team name with the exact inline copy', () => {
    expect(registerFormValidate('', ['Sam Lee', 'Jess Ray', 'Ann Fox', 'Bo Diaz'], 4))
      .toEqual({ ok: false, message: 'Enter a team name.' });
    expect(registerFormValidate('   ', ['Sam Lee', 'Jess Ray', 'Ann Fox', 'Bo Diaz'], 4))
      .toEqual({ ok: false, message: 'Enter a team name.' });
  });

  it('requires exactly the tournament team size (empties dropped), with the exact inline copy', () => {
    expect(registerFormValidate('Sand Sharks', ['Sam Lee', 'Jess Ray', 'Ann Fox'], 4))
      .toEqual({ ok: false, message: 'Enter all 4 players.' });
    expect(registerFormValidate('Sand Sharks', ['Sam Lee', 'Jess Ray', 'Ann Fox', 'Bo Diaz', 'Ty Vo'], 4).message)
      .toBe('Enter all 4 players.');
    expect(registerFormValidate('Sand Sharks', ['Sam Lee', 'Jess Ray'], 6).message)
      .toBe('Enter all 6 players.');
  });

  it('treats a whitespace-only name as empty → not enough players', () => {
    expect(registerFormValidate('Sand Sharks', ['Sam Lee', 'Jess Ray', 'Ann Fox', '   '], 4))
      .toEqual({ ok: false, message: 'Enter all 4 players.' });
  });

  it('requires a first AND last name on every player, naming the single-word offender', () => {
    // "Sam" fails
    expect(registerFormValidate('Sand Sharks', ['Sam', 'Jess Ray', 'Ann Fox', 'Bo Diaz'], 4))
      .toEqual({ ok: false, message: 'Give Sam a last name too.' });
    // the offender is named even when it is not the first row
    expect(registerFormValidate('Sand Sharks', ['Sam Lee', 'Jess Ray', 'Fox', 'Bo Diaz'], 4).message)
      .toBe('Give Fox a last name too.');
  });

  it('passes "Sam Lee" and "Sam  Lee" (>=2 whitespace-split tokens, each with a non-space char)', () => {
    expect(registerFormValidate('Sand Sharks', ['Sam Lee', 'Jess Ray', 'Ann Fox', 'Bo Diaz'], 4).ok).toBe(true);
    expect(registerFormValidate('Sand Sharks', ['Sam  Lee', 'Jess Ray', 'Ann Fox', 'Bo Diaz'], 4).ok).toBe(true);
  });

  it('trims leading/trailing spaces on the team name and every roster name before returning', () => {
    const out = registerFormValidate('  Sand Sharks ', [' Sam Lee ', 'Jess Ray  ', '  Ann Fox', 'Bo Diaz'], 4);
    expect(out.ok).toBe(true);
    expect(out.teamName).toBe('Sand Sharks');
    expect(out.roster).toEqual(['Sam Lee', 'Jess Ray', 'Ann Fox', 'Bo Diaz']);
  });

  it('defaults team size to 4 and tolerates a null roster without throwing', () => {
    expect(registerFormValidate('X', null).message).toBe('Enter all 4 players.');
  });
});

// Addendum (2026-07-10, Mike): proactive duplicate-team-name feedback. The server (register_team) stays the
// authority on rejecting duplicates under concurrency; this pure helper drives the inline "already taken"
// warning as the captain types. Case-insensitive + trimmed, matching the server's own comparison.
describe('teamNameTaken', () => {
  const teams = [{ name: 'Sand Sharks' }, { name: 'Bumpin Uglies' }];
  it('matches case-insensitively', () => {
    expect(teamNameTaken('sand sharks', teams)).toBe(true);
    expect(teamNameTaken('SAND SHARKS', teams)).toBe(true);
  });
  it('matches after trimming whitespace on both sides', () => {
    expect(teamNameTaken('  Bumpin Uglies  ', teams)).toBe(true);
    expect(teamNameTaken('Sand Sharks', [{ name: '  Sand Sharks ' }])).toBe(true);
  });
  it('returns false for a fresh name, an empty name, or an empty/nullish list', () => {
    expect(teamNameTaken('Net Ninjas', teams)).toBe(false);
    expect(teamNameTaken('', teams)).toBe(false);
    expect(teamNameTaken('   ', teams)).toBe(false);
    expect(teamNameTaken('Sand Sharks', null)).toBe(false);
  });
});
