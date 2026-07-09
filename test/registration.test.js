// Finish-line Slice 3 (2026-07-09, spec §13.5) — behavior tests for the registration event-card +
// join-sheet pure helpers in public/pure.js. Loaded via Node CJS require, matching the other suites.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { registerEventModel, joinSheetValidate } = require('../public/pure.js');

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
