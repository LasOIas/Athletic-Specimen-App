// teamSkillTotal (2026-07-19): a generated team's skill total for the ADMIN Manage → Teams surface.
// Loaded via Node CJS require (pure.js uses a module.exports guard), matching the other pure suites.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pure = require('../public/pure.js');
const { teamSkillTotal } = pure;

describe('teamSkillTotal', () => {
  it('sums positive skills to a one-decimal string', () => {
    expect(teamSkillTotal([{ skill: 4.5 }, { skill: 3 }, { skill: 2.2 }])).toBe('9.7');
  });
  it('unrated / zero / negative / non-numeric skills contribute 0', () => {
    expect(teamSkillTotal([{ skill: 0 }, { skill: '' }, { skill: null }, { skill: -2 }, { skill: 'x' }, { skill: 3.5 }])).toBe('3.5');
  });
  it('an empty team and a non-array are both 0.0', () => {
    expect(teamSkillTotal([])).toBe('0.0');
    expect(teamSkillTotal(null)).toBe('0.0');
    expect(teamSkillTotal(undefined)).toBe('0.0');
    expect(teamSkillTotal('nope')).toBe('0.0');
    expect(teamSkillTotal({})).toBe('0.0');
  });
  it('ignores malformed members', () => {
    expect(teamSkillTotal([null, {}, { skill: 2 }])).toBe('2.0');
  });
  it('does not leak binary float noise', () => {
    expect(teamSkillTotal([{ skill: 0.1 }, { skill: 0.2 }])).toBe('0.3');
  });
});
