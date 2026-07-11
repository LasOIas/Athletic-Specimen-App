// Atom-up public Home (spec 2026-07-10 §2) — the pure state machine + Home view-models.
// Loaded via Node CJS require (pure.js uses a module.exports guard), matching pure.test.js.
// Fixtures use the REAL tournament match-row field names verified against app.js
// (buildPublicTournamentLiveHTML / computeStandings): net, team_a_id/team_b_id,
// score_a/score_b, status ('scheduled'|'live'|'final'), queue_order.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  publicHomeState, homeNetBlocksModel, homeComingUpModel, homeTopStandingsModel,
} = require('../public/pure.js');

describe('publicHomeState — exclusive with precedence (spec §2)', () => {
  const base = { liveTournament: null, regTournament: null, session: null, todayStr: '2026-07-10', hasLiveCourts: false };
  it('live tournament wins over everything', () => {
    expect(publicHomeState({ ...base, liveTournament: { id: 1, status: 'pools' },
      regTournament: { id: 2 }, session: { date: '2026-07-10' }, hasLiveCourts: true })).toBe('tournament_live');
  });
  it('live session beats registration', () => {
    expect(publicHomeState({ ...base, regTournament: { id: 2 },
      session: { date: '2026-07-10' }, hasLiveCourts: true })).toBe('session_live');
  });
  it('a STALE session never renders live (the June-28 bug)', () => {
    expect(publicHomeState({ ...base, session: { date: '2026-06-28' }, hasLiveCourts: true })).toBe('quiet');
  });
  it('todays session without live courts is still session_live (check-in phase)', () => {
    expect(publicHomeState({ ...base, session: { date: '2026-07-10' } })).toBe('session_live');
  });
  it('a FUTURE-dated session stays quiet — session_live is day-of only (Mike 2026-07-10 Check In rework)', () => {
    expect(publicHomeState({ ...base, session: { date: '2026-07-20' } })).toBe('quiet');
    expect(publicHomeState({ ...base, session: { date: '2026-07-11' } })).toBe('quiet');
  });
  it('registration when nothing is live', () => {
    expect(publicHomeState({ ...base, regTournament: { id: 2 } })).toBe('registration');
  });
  it('an upcoming setup tournament shows on Home even when registration is CLOSED (Mike 2026-07-10)', () => {
    // Home widened its reg lookup to any status:'setup' row; publicHomeState only checks regTournament
    // truthiness, so a closed-registration upcoming tournament still resolves to 'registration' (visible on
    // Home). The lead's open/closed eyebrow copy ("Registration open" vs "Registration closed") + the CTA
    // gating live in the DOM builder hmRegistrationHTML, driven by registerEventModel.regOpen — that pure
    // open/closed/live contract is locked in registration.test.js.
    expect(publicHomeState({ ...base, regTournament: { id: 2, status: 'setup', registration_open: false } })).toBe('registration');
    expect(publicHomeState({ ...base, regTournament: { id: 2, status: 'setup', registration_open: true } })).toBe('registration');
  });
  it('quiet when nothing at all', () => { expect(publicHomeState(base)).toBe('quiet'); });
  it('a session with no/blank date does not force session_live', () => {
    expect(publicHomeState({ ...base, session: { date: '' } })).toBe('quiet');
    expect(publicHomeState({ ...base, session: {} })).toBe('quiet');
  });

  // Task 2 (Mike 2026-07-11): the day-of gate reads the SET of pickup days. A day IN the set today →
  // session_live; only future/empty → quiet. The legacy single `session` input still works (above).
  it('gates on the pickup-day SET — session_live only when a day in the set is today', () => {
    expect(publicHomeState({ ...base, pickupDays: [{ day: '2026-07-10' }] })).toBe('session_live');
    expect(publicHomeState({ ...base, pickupDays: [{ day: '2026-07-05' }, { day: '2026-07-10' }] })).toBe('session_live');
    expect(publicHomeState({ ...base, pickupDays: [{ day: '2026-07-20' }] })).toBe('quiet');
    expect(publicHomeState({ ...base, pickupDays: [] })).toBe('quiet');
  });
});

describe('homeNetBlocksModel', () => {
  const teams = [{ id: 1, name: 'Dink Responsibly' }, { id: 2, name: 'Lawn and Order' }, { id: 3, name: 'Ballin' }, { id: 4, name: 'That One Team' }];
  it('shapes live games per net, sorted', () => {
    const m = [
      { net: 2, team_a_id: 3, team_b_id: 4, score_a: 8, score_b: 7, status: 'live' },
      { net: 1, team_a_id: 1, team_b_id: 2, score_a: 15, score_b: 12, status: 'live' },
      { net: 1, team_a_id: 3, team_b_id: 4, status: 'scheduled' },
    ];
    const out = homeNetBlocksModel(m, teams, 'NET');
    expect(out.map((b) => b.label)).toEqual(['NET 1', 'NET 2']);
    expect(out[0].a).toEqual({ name: 'Dink Responsibly', score: 15 });
    expect(out[0].b).toEqual({ name: 'Lawn and Order', score: 12 });
    expect(out[0].status).toBe('playing');
    expect(out[1].a).toEqual({ name: 'Ballin', score: 8 });
  });
  it('empty when nothing live', () => {
    expect(homeNetBlocksModel([{ net: 1, status: 'scheduled' }], teams, 'NET')).toEqual([]);
  });
  it('one block per net (first live game wins if a net has two live rows)', () => {
    const m = [
      { net: 1, team_a_id: 1, team_b_id: 2, score_a: 11, score_b: 9, status: 'live' },
      { net: 1, team_a_id: 3, team_b_id: 4, score_a: 5, score_b: 2, status: 'live' },
    ];
    const out = homeNetBlocksModel(m, teams, 'NET');
    expect(out).toHaveLength(1);
    expect(out[0].a).toEqual({ name: 'Dink Responsibly', score: 11 });
  });
  it('defaults a missing score to 0', () => {
    const m = [{ net: 1, team_a_id: 1, team_b_id: 2, status: 'live' }];
    const out = homeNetBlocksModel(m, teams, 'NET');
    expect(out[0].a).toEqual({ name: 'Dink Responsibly', score: 0 });
    expect(out[0].b).toEqual({ name: 'Lawn and Order', score: 0 });
  });
});

describe('homeComingUpModel', () => {
  const teams = [{ id: 5, name: 'Block Party' }, { id: 6, name: 'Net Ninjas' }];
  it('earliest scheduled game per net', () => {
    const m = [
      { net: 1, team_a_id: 5, team_b_id: 6, status: 'scheduled', queue_order: 9 },
      { net: 1, team_a_id: 6, team_b_id: 5, status: 'scheduled', queue_order: 4 },
      { net: 2, team_a_id: 5, team_b_id: 6, status: 'live' },
    ];
    const out = homeComingUpModel(m, teams, 'Net');
    expect(out).toEqual([{ label: 'Net 1', text: 'Net Ninjas vs Block Party' }]);
  });
  it('empty when nothing is queued', () => {
    expect(homeComingUpModel([{ net: 1, team_a_id: 5, team_b_id: 6, status: 'live' }], teams, 'Net')).toEqual([]);
  });
});

describe('homeTopStandingsModel', () => {
  it('takes n with rank + W-L record', () => {
    const standings = [
      { name: 'Dink Responsibly', wins: 3, losses: 0 },
      { name: 'Sets on the Beach', wins: 2, losses: 1 },
      { name: 'Lawn and Order', wins: 2, losses: 1 },
      { name: 'Net Gains', wins: 0, losses: 3 },
    ];
    const out = homeTopStandingsModel(standings, 3);
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ rank: 1, name: 'Dink Responsibly', record: '3-0' });
    expect(out[2]).toEqual({ rank: 3, name: 'Lawn and Order', record: '2-1' });
  });
  it('returns fewer than n when standings are short', () => {
    expect(homeTopStandingsModel([{ name: 'Solo', wins: 1, losses: 0 }], 3)).toEqual([{ rank: 1, name: 'Solo', record: '1-0' }]);
  });
});
