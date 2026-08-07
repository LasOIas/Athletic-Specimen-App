// Tournament design round (2026-08-03) — the PURE helper the round needs.
// (teamSkillDrift + swapPlayersBetweenTeams removed 2026-08-07 with the drag gesture they served.)
// poolNetRange  → README open question 1 (pool tabs must name their OWN nets, not a hardcoded "NETS 1-3")
// Loaded via Node CJS require (pure.js uses a module.exports guard), matching the other pure suites.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pure = require('../public/pure.js');
const { poolNetRange } = pure;

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
