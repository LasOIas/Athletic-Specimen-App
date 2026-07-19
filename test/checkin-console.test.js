// Manage -> Check-in view model (2026-07-19 spec) — behavior tests for checkinConsoleModel in public/pure.js.
// Loaded via Node CJS require (pure.js uses a module.exports guard), matching the other pure suites.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pure = require('../public/pure.js');
const { checkinConsoleModel } = pure;

const R = (name, checkedIn, group) => ({ key: 'id:' + name, id: name, name, group: group || '', checkedIn: !!checkedIn });
const roster = [
  R('Drew Lane', false), R('Aaron Bell', true), R('amara diaz', true),
  R('Ben Fisher', false), R('Cam Holt', false, 'Guests'),
];

describe('checkinConsoleModel', () => {
  it('counts in/out/total over the full roster', () => {
    const m = checkinConsoleModel(roster, 'all', '');
    expect(m.counts).toEqual({ in: 2, out: 3, total: 5 });
  });
  it('all filter: out section first, then in, labels set', () => {
    const m = checkinConsoleModel(roster, 'all', '');
    expect(m.sections.map((s) => s.id)).toEqual(['out', 'in']);
    expect(m.sections[0].label).toBe('Still out');
    expect(m.sections[1].label).toBe('Checked in');
  });
  it('sections sort A-Z case-insensitively', () => {
    const m = checkinConsoleModel(roster, 'all', '');
    expect(m.sections[0].rows.map((r) => r.name)).toEqual(['Ben Fisher', 'Cam Holt', 'Drew Lane']);
    expect(m.sections[1].rows.map((r) => r.name)).toEqual(['Aaron Bell', 'amara diaz']);
  });
  it('in filter: one unlabeled section of checked-in rows only', () => {
    const m = checkinConsoleModel(roster, 'in', '');
    expect(m.sections.length).toBe(1);
    expect(m.sections[0].label).toBeNull();
    expect(m.sections[0].rows.every((r) => r.checkedIn)).toBe(true);
  });
  it('out filter: one unlabeled section of out rows only', () => {
    const m = checkinConsoleModel(roster, 'out', '');
    expect(m.sections.length).toBe(1);
    expect(m.sections[0].rows.every((r) => !r.checkedIn)).toBe(true);
  });
  it('query narrows rows case-insensitively but counts stay global', () => {
    const m = checkinConsoleModel(roster, 'all', 'aM');
    expect(m.sections[0].rows.map((r) => r.name)).toEqual(['Cam Holt']);
    expect(m.sections[1].rows.map((r) => r.name)).toEqual(['amara diaz']);
    expect(m.counts.total).toBe(5);
  });
  it('query composes with the in filter', () => {
    const m = checkinConsoleModel(roster, 'in', 'bell');
    expect(m.sections[0].rows.map((r) => r.name)).toEqual(['Aaron Bell']);
  });
  it('showAdd is false with an empty query', () => {
    expect(checkinConsoleModel(roster, 'all', '  ').showAdd).toBe(false);
  });
  it('showAdd is true for a miss', () => {
    expect(checkinConsoleModel(roster, 'all', 'Zoe Park').showAdd).toBe(true);
  });
  it('showAdd is false on an exact case-insensitive match even under a filter that hides the row', () => {
    expect(checkinConsoleModel(roster, 'in', 'ben fisher').showAdd).toBe(false);
  });
  it('empty roster: zero counts, empty sections, no add without a query', () => {
    const m = checkinConsoleModel([], 'all', '');
    expect(m.counts).toEqual({ in: 0, out: 0, total: 0 });
    expect(m.sections[0].rows).toEqual([]);
    expect(m.showAdd).toBe(false);
  });
  it('ignores malformed rows', () => {
    const m = checkinConsoleModel([null, {}, R('Aaron Bell', true)], 'all', '');
    expect(m.counts.total).toBe(1);
  });
});
