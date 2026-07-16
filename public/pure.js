// public/pure.js - C25 item 1 (tests & tech debt).
// PURE logic (no DOM / no Supabase / no app state) extracted VERBATIM from app.js so it can be
//   (a) loaded as a classic <script> before app.js (these stay global; app.js calls them), AND
//   (b) require()-d by the vitest suite in /test via the CommonJS guard at the bottom.
// Behavior must stay identical to the originals - the test suite locks it. Edit with care.

function createLocalPlayerKey() {
  return `lp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function playerIdentityKey(player) {
  if (!player || typeof player !== 'object') return '';
  if (player.id) return `id:${String(player.id)}`;
  const current = String(player.localKey || '').trim();
  if (current) return `local:${current}`;
  player.localKey = createLocalPlayerKey();
  return `local:${player.localKey}`;
}

function summarizeTeamFairness(teams) {
  const totals = teams.map((team) =>
    team.reduce((sum, p) => sum + (Number(p.skill) || 0), 0)
  );
  const counts = teams.map((team) => team.length);
  const maxSkill = totals.length ? Math.max(...totals) : 0;
  const minSkill = totals.length ? Math.min(...totals) : 0;
  const meanSkill = totals.length
    ? totals.reduce((sum, v) => sum + v, 0) / totals.length
    : 0;
  const variance = totals.length
    ? totals.reduce((sum, v) => sum + Math.pow(v - meanSkill, 2), 0) / totals.length
    : 0;

  const skillSpread = maxSkill - minSkill;
  const countSpread = (counts.length ? Math.max(...counts) : 0) - (counts.length ? Math.min(...counts) : 0);
  const skillStdev = Math.sqrt(variance);
  const score = skillSpread + countSpread * 0.75 + skillStdev * 0.25;

  return { skillSpread, countSpread, skillStdev, score };
}

function generateOneBalancedCandidate(eligiblePlayers, groupCount) {
  const teams = Array.from({ length: groupCount }, () => []);
  const teamSkills = new Array(groupCount).fill(0);

  // C31 #1: order by skill but randomize freely WITHIN a ~1.0 skill window so whole compositions vary
  // tap-to-tap (not just the bench). The greedy lowest-total assignment below still keeps teams fair,
  // and generateBalancedGroups filters every candidate to the fair band — so a looser order is safe.
  const ordered = eligiblePlayers.slice().sort((a, b) => {
    const diff = (Number(b.skill) || 0) - (Number(a.skill) || 0);
    if (Math.abs(diff) >= 1.0) return diff;
    return Math.random() - 0.5;
  });

  // Near-skill shuffles add further variety without meaningfully shifting balance.
  for (let i = 0; i < ordered.length - 1; i += 1) {
    const a = Number(ordered[i].skill) || 0;
    const b = Number(ordered[i + 1].skill) || 0;
    if (Math.abs(a - b) <= 1.0 && Math.random() < 0.5) {
      const temp = ordered[i];
      ordered[i] = ordered[i + 1];
      ordered[i + 1] = temp;
    }
  }

  const baseSize = Math.floor(ordered.length / groupCount);
  const extras = ordered.length % groupCount;
  const shuffledTeamIndexes = Array.from({ length: groupCount }, (_, idx) => idx).sort(
    () => Math.random() - 0.5
  );
  const sizeCaps = new Array(groupCount).fill(baseSize);
  for (let i = 0; i < extras; i += 1) {
    sizeCaps[shuffledTeamIndexes[i]] += 1;
  }

  for (const player of ordered) {
    let candidates = [];
    for (let i = 0; i < groupCount; i += 1) {
      if (teams[i].length < sizeCaps[i]) candidates.push(i);
    }
    if (!candidates.length) {
      candidates = Array.from({ length: groupCount }, (_, idx) => idx);
    }

    let minProjected = Infinity;
    for (const idx of candidates) {
      const projected = teamSkills[idx] + (Number(player.skill) || 0);
      if (projected < minProjected) minProjected = projected;
    }

    const nearBest = candidates.filter(
      (idx) => teamSkills[idx] + (Number(player.skill) || 0) <= minProjected + 0.75
    );
    const pool = nearBest.length ? nearBest : candidates;
    const target = pool[Math.floor(Math.random() * pool.length)];

    teams[target].push(player);
    teamSkills[target] += Number(player.skill) || 0;
  }

  return teams;
}

// C31 #1: count unordered same-team player-key pairs two team-splits have in common — the metric for
// "how much did the teams actually change" between two Generate taps (lower = more reshuffled).
function countSharedTeammatePairs(teamsA, teamsB) {
  const pairKey = (x, y) => (x < y ? x + '|' + y : y + '|' + x);
  const pairsOf = (teams) => {
    const set = new Set();
    for (const team of teams || []) {
      const keys = (team || []).map((p) => playerIdentityKey(p)).filter(Boolean);
      for (let i = 0; i < keys.length; i += 1) {
        for (let j = i + 1; j < keys.length; j += 1) set.add(pairKey(keys[i], keys[j]));
      }
    }
    return set;
  };
  const a = pairsOf(teamsA);
  if (!a.size) return 0;
  let shared = 0;
  for (const pair of pairsOf(teamsB)) if (a.has(pair)) shared += 1;
  return shared;
}

// C31 #1: from a pool of equally-fair candidate splits, return one from the "most reshuffled" tier vs
// the previous split — i.e. among the candidates sharing the FEWEST teammate pairs (plus a small band),
// pick at random. Picking the single absolute-min would flip-flop A-B-A-B between two splits on repeated
// taps; the band + random pick makes repeated re-rolls cycle through many different fair splits. Returns
// null when there is no previous split to differ from.
function pickMostDifferentTeams(candidates, previousTeams) {
  if (!Array.isArray(candidates) || !candidates.length) return null;
  if (!Array.isArray(previousTeams) || !previousTeams.length) return null;
  const scored = candidates.map((cand) => ({ cand, shared: countSharedTeammatePairs(cand, previousTeams) }));
  const minShared = Math.min(...scored.map((s) => s.shared));
  const maxShared = Math.max(...scored.map((s) => s.shared));
  const band = Math.max(1, Math.round((maxShared - minShared) * 0.34));
  const tier = scored.filter((s) => s.shared <= minShared + band).map((s) => s.cand);
  return tier[Math.floor(Math.random() * tier.length)];
}

function generateBalancedGroups(players, checkedInKeys, groupCount, previousTeams) {
  const inSet = new Set(checkedInKeys || []);
  const eligible = players.filter((p) => inSet.has(playerIdentityKey(p)));
  const safeGroupCount = Math.max(2, Number(groupCount) || 2);

  if (!eligible.length) {
    return {
      teams: Array.from({ length: safeGroupCount }, () => []),
      summary: { skillSpread: 0, countSpread: 0, attempts: 0, fairnessScore: 0 }
    };
  }

  const attempts = Math.max(24, Math.min(120, eligible.length * 6));
  let best = null;
  const candidates = [];

  for (let i = 0; i < attempts; i += 1) {
    const teams = generateOneBalancedCandidate(eligible, safeGroupCount);
    const fairness = summarizeTeamFairness(teams);
    candidates.push({ teams, fairness });
    if (!best || fairness.score < best.fairness.score - 1e-9) best = { teams, fairness };
  }

  // C31 #1: keep EVERY candidate that's genuinely fair — within the "fairly balanced" band (team skill
  // totals within ~1.5) or, when the roster can't do that well, anything close to the fairest — and
  // never worse on team sizes. A wide fair pool is what lets the re-roll change a lot without going
  // lopsided (the old code kept only a razor-thin near-best pool, so taps looked the same).
  const FAIRLY_BALANCED_MAX = 1.5;
  const fairThreshold = Math.max(best.fairness.skillSpread + 1e-9, FAIRLY_BALANCED_MAX);
  let pool = candidates.filter((c) =>
    c.fairness.skillSpread <= fairThreshold && c.fairness.countSpread <= best.fairness.countSpread
  );
  if (!pool.length) pool = [best];

  // C31 #1: among the fair pool, pick the split that moves the most players to new teammates vs the
  // previous teams (so repeated taps "completely change" them); random when there's no previous split.
  const poolTeams = pool.map((c) => c.teams);
  const chosenTeams = pickMostDifferentTeams(poolTeams, previousTeams)
    || poolTeams[Math.floor(Math.random() * poolTeams.length)];
  const chosenFairness = summarizeTeamFairness(chosenTeams);

  return {
    teams: chosenTeams,
    summary: {
      skillSpread: Number(chosenFairness.skillSpread.toFixed(2)),
      countSpread: chosenFairness.countSpread,
      attempts,
      fairnessScore: Number(chosenFairness.score.toFixed(2))
    }
  };
}

// C25 item 3: a per-game score above MAX_SCORE is a fat-finger typo for pickup volleyball/basketball
// (no real game reaches 100), so reject it before a value like 99999 can poison standings/seeding.
var MAX_SCORE = 99;
function validateScores(scoreA, scoreB) {
  const sa = Number(scoreA), sb = Number(scoreB);
  if (!Number.isInteger(sa) || !Number.isInteger(sb) || sa < 0 || sb < 0) {
    throw new Error('Scores must be whole numbers (0 or more).');
  }
  if (sa > MAX_SCORE || sb > MAX_SCORE) {
    throw new Error('Scores can\'t be above ' + MAX_SCORE + '. Double-check the score.');
  }
  return { sa, sb };
}

// NF-1: per-phase scoring rule (pool target + hard cap, bracket target + no cap, win-by-2).
// Win-by-2 applies UNTIL the cap; AT the cap a 1-point win is allowed (the cap overrides win-by-2).
// Legacy rows (only match_cap) fall back to it as the target with no cap.
function scoringRulesFor(phase, tournament) {
  const t = tournament || {};
  const legacy = Number(t.match_cap) || 25;
  const winBy2 = t.win_by_2 == null ? true : !!t.win_by_2;
  if (phase === 'main') {
    return { target: Number(t.bracket_target) || legacy, cap: (t.bracket_cap == null ? null : Number(t.bracket_cap)), winBy2 };
  }
  return { target: Number(t.pool_target) || legacy, cap: (t.pool_cap == null ? null : Number(t.pool_cap)), winBy2 };
}

// Given a final score and the phase's rules, report whether the game is a legitimately-completed
// result. valid=false means the entered score can't end the game (must reach target / win by N / under cap).
function gameScoreStatus(scoreA, scoreB, rules) {
  const r = rules || {};
  const target = Number(r.target) || 0;
  const cap = (r.cap == null ? null : Number(r.cap));
  const winBy2 = r.winBy2 == null ? true : !!r.winBy2;
  const a = Number(scoreA), b = Number(scoreB);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) {
    return { decided: false, valid: false, winner: null, reason: 'Scores must be whole numbers (0 or more).' };
  }
  if (a === b) return { decided: false, valid: false, winner: null, reason: 'A game can\'t end in a tie.' };
  const winner = a > b ? 'A' : 'B';
  const w = Math.max(a, b), l = Math.min(a, b);
  const margin = w - l;
  const needed = winBy2 ? 2 : 1;
  if (cap != null && w === cap && margin >= 1) return { decided: true, valid: true, winner, reason: '' };
  if (cap != null && w > cap) return { decided: false, valid: false, winner, reason: 'Above the cap of ' + cap + '. Recheck the score.' };
  if (w < target) return { decided: false, valid: false, winner, reason: 'The winner must reach ' + target + '.' };
  if (margin < needed) return { decided: false, valid: false, winner, reason: 'Must win by ' + needed + '.' };
  return { decided: true, valid: true, winner, reason: '' };
}

function generateRoundRobin(ids) {
  const list = (ids || []).slice();
  if (list.length < 2) return [];
  if (list.length % 2 === 1) list.push(null); // bye slot
  const n = list.length;
  const half = n / 2;
  const pairs = [];
  let arr = list.slice();
  for (let r = 0; r < n - 1; r++) {
    for (let i = 0; i < half; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a !== null && b !== null) pairs.push([a, b]);
    }
    // rotate all but the first element
    arr = [arr[0], arr[n - 1]].concat(arr.slice(1, n - 1));
  }
  return pairs;
}

// Higher score wins; blank/equal/non-numeric -> null (no winner yet).
// Note: Number('') === 0, so blank fields must be rejected BEFORE coercion.
function decideWinner(scoreA, scoreB) {
  const norm = (s) => {
    if (s === null || s === undefined) return NaN;
    if (typeof s === 'string' && s.trim() === '') return NaN;
    return Number(s);
  };
  const a = norm(scoreA);
  const b = norm(scoreB);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (a > b) return 'A';
  if (b > a) return 'B';
  return null;
}

// Standings from FINAL pool matches: wins, point differential, ranked.
function computeStandings(teams, matches) {
  const stats = {};
  (teams || []).forEach((t) => {
    stats[t.id] = { teamId: t.id, name: t.name || '', wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, pointDiff: 0 };
  });
  (matches || []).forEach((m) => {
    if (m.phase !== 'pool' || m.status !== 'final') return;
    const a = stats[m.team_a_id];
    const b = stats[m.team_b_id];
    if (!a || !b) return;
    const sa = Number(m.score_a) || 0;
    const sb = Number(m.score_b) || 0;
    a.pointsFor += sa; a.pointsAgainst += sb;
    b.pointsFor += sb; b.pointsAgainst += sa;
    if (m.winner_team_id === a.teamId) { a.wins++; b.losses++; }
    else if (m.winner_team_id === b.teamId) { b.wins++; a.losses++; }
  });
  const rows = Object.keys(stats).map((k) => stats[k]);
  rows.forEach((r) => { r.pointDiff = r.pointsFor - r.pointsAgainst; });
  rows.sort((x, y) => (y.wins - x.wins) || (y.pointDiff - x.pointDiff) || String(x.teamId).localeCompare(String(y.teamId)));
  const ranked = applyHeadToHeadGroups(rows, matches, (r) => r.wins);
  ranked.forEach((r, i) => { r.rank = i + 1; });
  return ranked;
}

// Slice 1 (2026-07-08): per-pool standings for the public Standings page. Each pool ranks its OWN teams
// (computeStandings on the pool's subset -> rank 1..n within that pool) and carries the pool label + the
// nets that pool plays on (derived from its matches). Pure; consumed by buildStandingsPageHTML.
function shapeStandingsByPool(pools, teams, matches) {
  return (pools || []).map((pool) => {
    const poolTeams = (teams || []).filter((t) => t.pool_id === pool.id);
    const poolMatches = (matches || []).filter((m) => m.pool_id === pool.id);
    const nets = [...new Set(poolMatches.map((m) => m.net).filter((n) => n != null))].sort((a, b) => a - b);
    const rows = computeStandings(poolTeams, poolMatches);
    return { poolLabel: pool.label || '', nets, rows };
  });
}

// Slice 1 (2026-07-08): all-time leaderboard for the public History page. Titles ARE fully derivable from
// the per-tournament champions; wins/streak need per-match history that isn't loaded this slice, so they are
// returned null (the UI shows an honest "needs full match history" placeholder). Consumed by buildHistoryPageHTML.
// history: [{ champion: {teamId,name}|null, ... }]
function computeAllTimeLeaderboard(history) {
  const titles = {};
  (history || []).forEach((h) => {
    if (!h || !h.champion) return;
    const c = h.champion;
    titles[c.teamId] = titles[c.teamId] || { name: c.name || '', count: 0 };
    titles[c.teamId].count += 1;
  });
  const ranked = Object.keys(titles).map((k) => titles[k])
    .sort((x, y) => (y.count - x.count) || String(x.name).localeCompare(String(y.name)));
  return { mostTitles: ranked[0] || null, mostWins: null, longestStreak: null };
}

// Re-rank tied groups (same primary key AND same point-diff) by head-to-head record
// WITHIN the tied set, then point-diff, then deterministic team id. Group resolution
// (vs a pairwise comparator) stays consistent even in a 3-cycle (A>B>C>A).
function applyHeadToHeadGroups(rows, matches, keyFn) {
  const out = [];
  let i = 0;
  while (i < rows.length) {
    let j = i + 1;
    while (j < rows.length && keyFn(rows[j]) === keyFn(rows[i]) && rows[j].pointDiff === rows[i].pointDiff) j++;
    const group = rows.slice(i, j);
    if (group.length > 1) {
      const ids = new Set(group.map((r) => r.teamId));
      const h2hWins = {};
      group.forEach((r) => { h2hWins[r.teamId] = 0; });
      (matches || []).forEach((m) => {
        if (m.phase !== 'pool' || m.status !== 'final' || !m.winner_team_id) return;
        if (ids.has(m.team_a_id) && ids.has(m.team_b_id) && h2hWins[m.winner_team_id] != null) {
          h2hWins[m.winner_team_id]++;
        }
      });
      group.sort((x, y) => (h2hWins[y.teamId] - h2hWins[x.teamId]) || (y.pointDiff - x.pointDiff) || String(x.teamId).localeCompare(String(y.teamId)));
    }
    out.push(...group);
    i = j;
  }
  return out;
}

function nextPow2(n) {
  let p = 1;
  while (p < n) p *= 2;
  return Math.max(1, p);
}

// Standard single-elim seed slot order for a bracket of size B (power of 2).
// seedOrder(8) -> [1,8,4,5,2,7,3,6]; seeds 1 and 2 can only meet in the final.
function seedOrder(B) {
  let order = [1];
  while (order.length < B) {
    const n = order.length * 2;
    const next = [];
    for (const e of order) { next.push(e); next.push(n + 1 - e); }
    order = next;
  }
  return order;
}

// Global seeding across all pools: rank every team by win% then point-diff then name.
// win% (not raw wins) so unequal pool sizes compare fairly.
function computeSeeding(teams, matches) {
  const stats = {};
  (teams || []).forEach((t) => { stats[t.id] = { teamId: t.id, name: t.name || '', wins: 0, losses: 0, pf: 0, pa: 0 }; });
  (matches || []).forEach((m) => {
    if (m.phase !== 'pool' || m.status !== 'final') return;
    const a = stats[m.team_a_id]; const b = stats[m.team_b_id];
    if (!a || !b) return;
    const sa = Number(m.score_a) || 0; const sb = Number(m.score_b) || 0;
    a.pf += sa; a.pa += sb; b.pf += sb; b.pa += sa;
    if (m.winner_team_id === a.teamId) { a.wins++; b.losses++; }
    else if (m.winner_team_id === b.teamId) { b.wins++; a.losses++; }
  });
  const rows = Object.keys(stats).map((k) => stats[k]);
  rows.forEach((r) => { r.games = r.wins + r.losses; r.winPct = r.games ? r.wins / r.games : 0; r.pointDiff = r.pf - r.pa; });
  rows.sort((x, y) => (y.winPct - x.winPct) || (y.pointDiff - x.pointDiff) || String(x.teamId).localeCompare(String(y.teamId)));
  const ranked = applyHeadToHeadGroups(rows, matches, (r) => r.winPct);
  ranked.forEach((r, i) => { r.seed = i + 1; });
  return ranked;
}

// The bracket champion, or null. GF2 (reset) decides if it was played; otherwise the
// GF winner — but only when no reset was needed (the winners-bracket team, slot a, won).
function computeChampion(mainMatches, teams) {
  const gf2 = (mainMatches || []).find((m) => m.side === 'grand_final' && m.round === 2);
  const gf = (mainMatches || []).find((m) => m.side === 'grand_final' && m.round === 1);
  let champId = null;
  if (gf2 && gf2.status === 'final') champId = gf2.winner_team_id;
  else if (gf && gf.status === 'final' && (!gf2 || gf.winner_team_id === gf.team_a_id)) champId = gf.winner_team_id;
  if (!champId) return null;
  const t = (teams || []).find((x) => x.id === champId);
  return { teamId: champId, name: t ? (t.name || '') : '' };
}

// Task 10 (pick R12): the champion shown on History. Prefers the STORED champion (tournaments.champion_team_id,
// recorded by a deliberate close-out — migration 0050), resolving its name from the tournament's already-loaded
// teams; falls back to the COMPUTED bracket champion (computeChampion) when nothing is stored or the stored id
// no longer matches a team; else null → the caller renders "No champion recorded". This is the June fix: a
// closed tournament's champion is a stored FACT, not a re-derivation that silently reads empty.
function resolveHistoryChampion(t, teams, mainMatches) {
  const storedId = t && t.champion_team_id;
  if (storedId) {
    const tm = (teams || []).find((x) => x && x.id === storedId);
    if (tm) return { teamId: tm.id, name: tm.name || '' };
  }
  return computeChampion(mainMatches || [], teams || []);
}

// Generate a complete double-elimination bracket for N seeded teams.
// Returns { realMatches } where byes (seeds > N) are pre-resolved away, each match
// has aSource/bSource ({seed:n} | {type:'winner'|'loser', of:key}) and winnerNext/
// loserNext ({key,slot} into another real match, or null = champion/eliminated).
function generateDoubleElim(N, resetEnabled) {
  if (N < 2) return { realMatches: [] };
  const B = nextPow2(N);
  const K = Math.round(Math.log2(B));
  const byKey = {};
  const all = [];
  const add = (m) => { m.winnerTo = m.winnerTo || null; m.loserTo = m.loserTo || null; byKey[m.key] = m; all.push(m); return m; };

  // ---- Winners bracket ----
  const order = seedOrder(B);
  const wb = [];
  wb[1] = [];
  for (let i = 0; i < B / 2; i++) {
    add({ key: `W1-${i}`, side: 'winners', round: 1, slot: i, a: `seed:${order[2 * i]}`, b: `seed:${order[2 * i + 1]}` });
    wb[1].push(`W1-${i}`);
  }
  for (let w = 2; w <= K; w++) {
    wb[w] = [];
    for (let i = 0; i < B / Math.pow(2, w); i++) {
      const key = `W${w}-${i}`;
      add({ key, side: 'winners', round: w, slot: i, a: `W:${wb[w - 1][2 * i]}`, b: `W:${wb[w - 1][2 * i + 1]}` });
      byKey[wb[w - 1][2 * i]].winnerTo = { key, slot: 'a' };
      byKey[wb[w - 1][2 * i + 1]].winnerTo = { key, slot: 'b' };
      wb[w].push(key);
    }
  }
  const wbFinal = wb[K][0];

  // ---- Losers bracket (only when B >= 4) ----
  let lbFinal = null;
  if (K >= 2) {
    let lbRound = 0;
    let prev = [];
    for (let w = 1; w <= K; w++) {
      if (w === 1) {
        lbRound++;
        const cur = [];
        for (let i = 0; i < wb[1].length / 2; i++) {
          const key = `L${lbRound}-${i}`;
          add({ key, side: 'losers', round: lbRound, slot: i, a: `L:${wb[1][2 * i]}`, b: `L:${wb[1][2 * i + 1]}` });
          byKey[wb[1][2 * i]].loserTo = { key, slot: 'a' };
          byKey[wb[1][2 * i + 1]].loserTo = { key, slot: 'b' };
          cur.push(key);
        }
        prev = cur;
      } else {
        lbRound++;
        const cur = [];
        for (let i = 0; i < wb[w].length; i++) {
          const key = `L${lbRound}-${i}`;
          const wbLoser = wb[w][wb[w].length - 1 - i]; // reverse crossing delays rematches
          add({ key, side: 'losers', round: lbRound, slot: i, a: `W:${prev[i]}`, b: `L:${wbLoser}` });
          byKey[prev[i]].winnerTo = { key, slot: 'a' };
          byKey[wbLoser].loserTo = { key, slot: 'b' };
          cur.push(key);
        }
        prev = cur;
        if (w < K) {
          lbRound++;
          const minor = [];
          for (let i = 0; i < cur.length / 2; i++) {
            const key = `L${lbRound}-${i}`;
            add({ key, side: 'losers', round: lbRound, slot: i, a: `W:${cur[2 * i]}`, b: `W:${cur[2 * i + 1]}` });
            byKey[cur[2 * i]].winnerTo = { key, slot: 'a' };
            byKey[cur[2 * i + 1]].winnerTo = { key, slot: 'b' };
            minor.push(key);
          }
          prev = minor;
        }
      }
    }
    lbFinal = prev[0];
  }

  // ---- Grand final (+ optional reset) ----
  add({ key: 'GF', side: 'grand_final', round: 1, slot: 0, a: `W:${wbFinal}`, b: lbFinal ? `W:${lbFinal}` : `L:${wbFinal}` });
  byKey[wbFinal].winnerTo = { key: 'GF', slot: 'a' };
  if (lbFinal) byKey[lbFinal].winnerTo = { key: 'GF', slot: 'b' };
  else byKey[wbFinal].loserTo = { key: 'GF', slot: 'b' };
  if (resetEnabled) {
    add({ key: 'GF2', side: 'grand_final', round: 2, slot: 0, a: `W:GF`, b: `L:GF`, isReset: true });
    byKey['GF'].winnerTo = { key: 'GF2', slot: 'a' };
    byKey['GF'].loserTo = { key: 'GF2', slot: 'b' };
  }

  // ---- Bye resolution (processed in add order; sources reference earlier matches) ----
  const isByeSrc = (src) => {
    if (src.startsWith('seed:')) return Number(src.slice(5)) > N;
    if (src.startsWith('W:')) return byKey[src.slice(2)].winnerIsBye;
    if (src.startsWith('L:')) return byKey[src.slice(2)].loserIsBye;
    return false;
  };
  for (const m of all) {
    const ba = isByeSrc(m.a);
    const bb = isByeSrc(m.b);
    m.type = (ba && bb) ? 'dead' : (ba || bb) ? 'bye' : 'real';
    m.winnerIsBye = (m.type === 'dead');
    m.loserIsBye = (m.type !== 'real');
    m.autoWinnerSide = ba ? 'b' : (bb ? 'a' : null);
  }

  // ---- Resolve sources + next-pointers through byes, keep only REAL matches ----
  const resolveSrc = (src) => {
    if (src.startsWith('seed:')) {
      const s = Number(src.slice(5));
      return s <= N ? { seed: s } : null;
    }
    const k = src.slice(2);
    const m = byKey[k];
    if (src.startsWith('W:')) {
      if (m.type === 'real') return { type: 'winner', of: k };
      if (m.type === 'bye') return resolveSrc(m[m.autoWinnerSide]);
      return null;
    }
    if (m.type === 'real') return { type: 'loser', of: k };
    return null;
  };
  const followToReal = (target) => {
    if (!target) return null;
    const m = byKey[target.key];
    if (!m) return null;
    if (m.type === 'real') return { key: target.key, slot: target.slot };
    return followToReal(m.winnerTo);
  };

  const realMatches = all.filter((m) => m.type === 'real').map((m) => ({
    key: m.key, side: m.side, round: m.round, slot: m.slot, isReset: !!m.isReset,
    aSource: resolveSrc(m.a), bSource: resolveSrc(m.b),
    winnerNext: followToReal(m.winnerTo), loserNext: followToReal(m.loserTo)
  }));

  return { realMatches, B, K, seedCount: N };
}

// C36 T1: kiosk "tap your name" search. PURE (no DOM / no app state) so the kiosk handler can
// feed it state.players + the live search text and render the result buttons. Returns a NO-SKILL
// row shape {id,name,group,initials,checkedIn} — skill is admin-only and must never reach this
// public surface (rulebook §AS-1). Disambiguation is by group + full name, never skill.
//   - case-insensitive name SUBSTRING match
//   - drops __as_* sentinel rows (the "All Players" pseudo-row etc.)
//   - prefix matches sort before mid-string matches (typing your first name surfaces you first)
//   - capped at 12 so the kiosk list stays tappable; [] for an empty/whitespace query
function disambiguatePlayersByName(players, query) {
  const q = String(query == null ? '' : query).trim().toLowerCase();
  if (!q) return [];
  const scored = [];
  for (const p of (players || [])) {
    if (!p || typeof p !== 'object') continue;
    const name = String(p.name || '');
    // sentinel rows are keyed by id OR by name (__as_group__:, __as_tournament_state__) — exclude both
    if ((typeof p.id === 'string' && p.id.indexOf('__as_') === 0) || name.indexOf('__as_') === 0) continue;
    const lower = name.toLowerCase();
    const pos = lower.indexOf(q);
    if (pos < 0) continue;
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const initials = (parts.length
      ? (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : ''))
      : '').toUpperCase();
    scored.push({
      _prefix: pos === 0 ? 0 : 1,
      _name: lower,
      row: { id: p.id, name, group: p.group || '', initials, checkedIn: !!p.checked_in }
    });
  }
  // prefix matches first, then alphabetical by name for a stable, predictable order
  scored.sort((a, b) => (a._prefix - b._prefix) || a._name.localeCompare(b._name));
  return scored.slice(0, 12).map((s) => s.row);
}

// C48.5: group an already-filtered + already-sorted roster into collapsible group sections
// (admin Players "Option C"). PURE (no DOM / no app state): the caller passes the players in the
// exact display order it wants AND a resolver that returns each player's group names (primary first).
// Returns ordered sections [{ key, name, isUngrouped, players }]:
//   - a player appears in EVERY group they belong to (multi-group players show in each section)
//   - a player with no groups goes into a single "Ungrouped" section
//   - group sections are sorted case-insensitively by name; "Ungrouped" is ALWAYS last
//   - players inside each section keep the incoming order (the caller pre-sorts alphabetically),
//     so the A-Z jump strip (document order across sections) stays correct
//   - empty sections are never produced (a section exists only if it has >=1 player)
// `key` is a stable, lowercased identity for the section (group name folded; '__ungrouped__' for the
// no-group bucket) — used as the sessionStorage collapse key so it survives renames-by-case.
function groupRosterPlayersBySection(players, getGroupsFn) {
  const resolve = typeof getGroupsFn === 'function' ? getGroupsFn : () => [];
  const sections = new Map(); // key -> { key, name, isUngrouped, players, order }
  const UNGROUPED_KEY = '__ungrouped__';
  let groupOrder = 0;
  for (const player of (players || [])) {
    if (!player || typeof player !== 'object') continue;
    const groups = (resolve(player) || []).filter((g) => String(g || '').trim());
    if (!groups.length) {
      let sec = sections.get(UNGROUPED_KEY);
      if (!sec) {
        // sort-order Infinity pins Ungrouped last regardless of insertion order
        sec = { key: UNGROUPED_KEY, name: 'Ungrouped', isUngrouped: true, players: [], order: Infinity };
        sections.set(UNGROUPED_KEY, sec);
      }
      sec.players.push(player);
      continue;
    }
    for (const groupName of groups) {
      const name = String(groupName).trim();
      const key = name.toLowerCase();
      let sec = sections.get(key);
      if (!sec) {
        sec = { key, name, isUngrouped: false, players: [], order: groupOrder++ };
        sections.set(key, sec);
      }
      sec.players.push(player);
    }
  }
  return Array.from(sections.values())
    .sort((a, b) => {
      if (a.isUngrouped !== b.isUngrouped) return a.isUngrouped ? 1 : -1; // Ungrouped last
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    })
    .map(({ key, name, isUngrouped, players: secPlayers }) => ({ key, name, isUngrouped, players: secPlayers }));
}

// CommonJS export for the test runner; skipped in the browser (module is undefined there).
// C47 - first+last name enforcement at every add/register door. A new player's name must be
// at least two words, with the first AND last word each >= 2 characters (Mike 2026-06-24:
// a single-letter last name is a "who is who" mix-up risk). Length counts characters so
// "O'Brien"/"Oz" pass. Used by the in-app kiosk register, the admin Add-Player save, and /checkin.html.
function isValidFullName(name) {
  if (typeof name !== "string") return false;
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  return words[0].length >= 2 && words[words.length - 1].length >= 2;
}

// Tournament identity (spec 2026-07-11 §2) — sign-up / one-time name-fill validation. Trims each
// part and collapses inner whitespace; both first AND last must be >= 2 chars (isValidFullName-grade,
// per-part). Returns the cleaned parts on success so the caller can store + match "First Last".
function splitFullNameParts(first, last) {
  const f = String(first || '').trim().replace(/\s+/g, ' ');
  const l = String(last || '').trim().replace(/\s+/g, ' ');
  if (f.length < 2 || l.length < 2) {
    return { ok: false, message: 'Enter your real first and last name.' };
  }
  return { ok: true, first: f, last: l };
}

// C28 Slice 1 — the admin AI co-pilot's READ context. PURE shaping + REDACTION (no DOM / no state global):
// the caller assembles `input` from state + getPublicLiveData(); this returns the compact, skill-free
// snapshot the edge function passes to Claude. Skill is admin-only and must NEVER reach the model (§AS-1),
// so the two skill-bearing inputs (players, generatedTeams) are stripped to name+group / name here.
function copilotRosterNames(team) {
  return (Array.isArray(team) ? team : [])
    .map((p) => String((p && p.name) || '').trim())
    .filter(Boolean);
}

function copilotUpNextByNet(matches, teams) {
  const nameById = {};
  (teams || []).forEach((t) => { if (t && t.id != null) nameById[t.id] = t.name || ''; });
  const live = (matches || []).filter((m) => m && m.phase === 'pool' && m.status !== 'final' && m.net);
  const byNet = {};
  live.forEach((m) => { (byNet[m.net] = byNet[m.net] || []).push(m); });
  return Object.keys(byNet).map(Number).sort((a, b) => a - b).map((net) => {
    const q = byNet[net].slice().sort((a, b) => (a.queue_order || 0) - (b.queue_order || 0));
    const up = q[0];
    return {
      net,
      match: `${nameById[up.team_a_id] || '?'} vs ${nameById[up.team_b_id] || '?'}`,
      queued: q.length - 1,
    };
  });
}

function buildCopilotContext(input) {
  const inp = input || {};
  const players = Array.isArray(inp.players) ? inp.players : [];
  const teams = Array.isArray(inp.generatedTeams) ? inp.generatedTeams : [];
  const liveData = inp.liveData || {};
  const tour = inp.tournament || null;

  // attendance (redacted: name + group only)
  const here = [];
  const byGroup = {};
  players.forEach((p) => {
    if (!p || !p.checked_in) return;
    const name = String(p.name || '').trim();
    const group = String(p.group || '').trim();
    here.push({ name, group });
    const key = group || 'Ungrouped';
    byGroup[key] = (byGroup[key] || 0) + 1;
  });
  const attendance = { total: here.length, byGroup, here };

  // casual courts (redacted rosters; null when no teams)
  let casualCourts = null;
  if (teams.length) {
    const matchups = Array.isArray(liveData.matchups) ? liveData.matchups : [];
    const results = (liveData.results && typeof liveData.results === 'object') ? liveData.results : {};
    const rosterFor = (n) => copilotRosterNames(teams[n - 1]);
    const playing = matchups.map((m, idx) => {
      const w = Number(results[`${m.teamA}-${m.teamB}`]);
      const winner = w === m.teamA ? 'A' : (w === m.teamB ? 'B' : null);
      return {
        court: idx + 1,
        teamA: { n: m.teamA, players: rosterFor(m.teamA) },
        teamB: { n: m.teamB, players: rosterFor(m.teamB) },
        winner,
      };
    });
    const onDeck = (Array.isArray(liveData.waitingTeams) ? liveData.waitingTeams : [])
      .map((n) => ({ team: n, players: rosterFor(n) }));
    casualCourts = { playing, onDeck, inProgress: Number(liveData.liveCount) || 0 };
  }

  // tournament (computeStandings output is already skill-free; null when none)
  let tournament = null;
  if (tour) {
    const standings = computeStandings(tour.teams || [], tour.matches || [])
      .map((r) => ({ rank: r.rank, team: r.name, wins: r.wins, pointDiff: r.pointDiff }));
    tournament = {
      name: tour.name || '',
      status: tour.status || '',
      upNextByNet: copilotUpNextByNet(tour.matches || [], tour.teams || []),
      standings,
    };
  }

  return { attendance, casualCourts, tournament };
}

// C28 Slice 2 — co-pilot acting helpers (pure; no DOM/state/skill).
// resolvePlayerByName: name -> a single player {id,name,group} (no skill), or a typed failure the
// co-pilot can act on (ask which one / not found). Reuses the skill-free disambiguator.
function resolvePlayerByName(players, name) {
  const q = String(name == null ? '' : name).trim().toLowerCase();
  if (!q) return { ok: false, reason: 'none', matches: [] };
  const rows = disambiguatePlayersByName(players, q); // [{id,name,group,...}] — already skill-free
  const exact = rows.filter((r) => String(r.name || '').trim().toLowerCase() === q);
  const pick = exact.length === 1 ? exact[0] : (rows.length === 1 ? rows[0] : null);
  if (pick) return { ok: true, player: { id: pick.id, name: pick.name, group: pick.group || '' } };
  if (rows.length === 0) return { ok: false, reason: 'none', matches: [] };
  return { ok: false, reason: 'ambiguous', matches: rows.map((r) => ({ name: r.name, group: r.group || '' })) };
}

// Per-tool safety policy (Mike's hybrid): instant+undo for the cleanly-reversible, confirm-first for
// the messy-to-undo. Enforced in the browser executor, NOT by trusting the model.
var COPILOT_TOOL_POLICY = {
  check_in: 'instant', check_out: 'instant', make_teams: 'instant',
  submit_score: 'confirm', setup_tournament: 'confirm', generate_bracket: 'confirm',
  create_tournament: 'confirm', register_team: 'confirm',
};

function validateCopilotToolArgs(tool, args) {
  const a = args || {};
  if (tool === 'make_teams') {
    const n = Number(a.count);
    return Number.isInteger(n) && n >= 2 ? { ok: true } : { ok: false, error: 'count must be a whole number >= 2' };
  }
  if (tool === 'check_in' || tool === 'check_out') {
    return String(a.name || '').trim() ? { ok: true } : { ok: false, error: 'a player name is required' };
  }
  if (tool === 'setup_tournament') {
    return String(a.name || '').trim() && Array.isArray(a.teams) && a.teams.length >= 2
      ? { ok: true } : { ok: false, error: 'a tournament name and at least 2 team names are required' };
  }
  if (tool === 'create_tournament') {
    return String(a.name || '').trim() ? { ok: true } : { ok: false, error: 'a tournament name is required' };
  }
  if (tool === 'register_team') {
    if (!String(a.team_name || '').trim()) return { ok: false, error: 'a team name is required' };
    if (!Array.isArray(a.players) || !a.players.length) return { ok: false, error: 'the team needs at least one player' };
    return { ok: true };
  }
  return { ok: true }; // submit_score / generate_bracket validated at execution against live state
}

// Resolve a tournament match between two named teams and tell the caller how to orient the scores.
// Returns { ok:true, match, orient, teamA, teamB } where orient is 'ab' (nameA is the match's slot a,
// pass scores as-is) or 'ba' (nameA is slot b, the caller must swap the scores). On failure returns
// { ok:false, reason:'team'|'same'|'nomatch', ... }. Only matches a game that is NOT yet final.
function resolveTournamentMatch(teams, matches, nameA, nameB) {
  const norm = (s) => String(s == null ? '' : s).trim().toLowerCase();
  const find = (n) => (teams || []).find((t) => norm(t.name) === norm(n));
  const ta = find(nameA), tb = find(nameB);
  if (!ta || !tb) return { ok: false, reason: 'team', teams: (teams || []).map((t) => t.name) };
  if (ta.id === tb.id) return { ok: false, reason: 'same' };
  const m = (matches || []).find((x) => x && x.status !== 'final'
    && ((x.team_a_id === ta.id && x.team_b_id === tb.id) || (x.team_a_id === tb.id && x.team_b_id === ta.id)));
  if (!m) return { ok: false, reason: 'nomatch', teamA: ta.name, teamB: tb.name };
  return { ok: true, match: m, orient: m.team_a_id === ta.id ? 'ab' : 'ba', teamA: ta.name, teamB: tb.name };
}

// C32: single source of truth for the public hub's stat tiles. liveTile prioritises casual courts, then
// a live tournament, else nothing — so the render stays a thin formatter.
function publicHubStatus(input) {
  const i = input || {};
  const here = Math.max(0, Number(i.checkedInCount) || 0);
  const liveCourtCount = Math.max(0, Number(i.liveCourtCount) || 0);
  const tournamentLive = i.tournamentStatus === 'pools' || i.tournamentStatus === 'bracket';
  let liveTile = 'none';
  if (liveCourtCount > 0) liveTile = 'courts';
  else if (tournamentLive) liveTile = 'tournament';
  return { here, liveTile, liveCount: liveCourtCount, tournamentLive };
}

// ── Pool-play net assignment (C70, Mike, 2026-06-26) ─────────────────────────
// Each pool OWNS a contiguous block of nets so the board can show "Pool A on Nets 1-2" instead of
// nets shared globally across all pools. splitNetsAcrossPools divides 1..netCount into one contiguous
// block per pool, as even as possible; every pool gets >=1 net (when nets < pools, pools round-robin a
// single shared net so none gets zero).
function splitNetsAcrossPools(netCount, poolCount) {
  const N = Math.max(1, Math.floor(Number(netCount) || 1));
  const P = Math.max(0, Math.floor(Number(poolCount) || 0));
  if (P === 0) return [];
  if (N < P) return Array.from({ length: P }, (_, i) => [(i % N) + 1]);
  const base = Math.floor(N / P), extra = N % P; // first `extra` pools get one more net
  const out = [];
  let next = 1;
  for (let i = 0; i < P; i++) {
    const size = base + (i < extra ? 1 : 0);
    const nets = [];
    for (let j = 0; j < size; j++) nets.push(next++);
    out.push(nets);
  }
  return out;
}

// Spread `gameCount` games across a pool's nets round-robin, with a per-net queue (1,2,3...). Returns
// [{net, queue_order}] aligned to the pool's game order — game i goes to nets[i % len]. "Current on a net"
// is then the lowest-queue_order unplayed game on it; as games finish the next one surfaces automatically
// (the auto-advance — it's just render-time derivation, no extra writes).
function distributeGamesOnNets(gameCount, nets) {
  const list = (nets && nets.length) ? nets.slice() : [1];
  const perNet = {};
  const out = [];
  const n = Math.max(0, Math.floor(Number(gameCount) || 0));
  for (let i = 0; i < n; i++) {
    const net = list[i % list.length];
    perNet[net] = (perNet[net] || 0) + 1;
    out.push({ net, queue_order: perNet[net] });
  }
  return out;
}

// C70 fix (2026-06-27): pick the games that are actually playable RIGHT NOW for one pool — a DISJOINT set
// across the pool's nets, so a team is never shown "Now" on two nets at once (the net-split puts a team's
// games on one net, and independent per-net advance could otherwise surface the same team as current on two
// nets). Greedy in net order: each net takes its lowest-queue unplayed game whose BOTH teams are still free;
// if that game's teams are busy on another net, it skips to the net's next unplayed game that IS free, so
// both nets stay busy. Render-only — the schedule / queue_order / DB are unchanged; this only decides the
// "Now" tag + which game auto-advances. Input: one entry per net (in net order) = that net's unplayed games
// {id, team_a_id, team_b_id} in queue order. Output: the current game id per net (or null), aligned to input.
function pickPoolCurrentGames(netGames) {
  const used = new Set();
  const currentByNet = [];
  (netGames || []).forEach((games) => {
    let pick = null;
    for (let i = 0; i < (games || []).length; i++) {
      const g = games[i];
      if (!g || !g.team_a_id || !g.team_b_id) continue;
      if (used.has(g.team_a_id) || used.has(g.team_b_id)) continue;
      pick = g; break;
    }
    if (pick) { used.add(pick.team_a_id); used.add(pick.team_b_id); }
    currentByNet.push(pick ? pick.id : null);
  });
  return currentByNet;
}

// Bracket game numbering (Mike, 2026-06-27): ONE continuous "G" number per bracket match across the whole
// double-elim — winners bracket first (by round, then slot), then the losers bracket, then the grand final —
// so games read G1, G2, … GN start to finish. Render-only (no DB): derived from the match list each render.
// Returns { byId:{matchId:g}, byRoundLabel:{round_label:g} }. byRoundLabel keys keep the FULL stored label
// (incl. " M#") so the stored source refs ("Winner of WB R1 M1") can be rewritten to "Winner of G{n}".
function bracketGameNumbers(mainMatches) {
  // Number games in the actual PLAY ORDER, not all-winners-then-all-losers. The winners + losers brackets run
  // CONCURRENTLY (interleaved by round in time), so a player's game number should tell them WHEN they play —
  // losers Game 1 plays near the start (alongside an early winners round), and the grand final (championship)
  // is genuinely the LAST/highest number. This mirrors the queue_order/net assignment the app already uses
  // (sort by play-round, winners-before-losers within a round, then slot), so G# tracks the net-call order.
  const list = (mainMatches || []).slice();
  const sidePri = (s) => (s === 'winners' ? 0 : s === 'losers' ? 1 : 2);
  const maxRound = list.reduce((mx, m) => Math.max(mx, (m && m.side !== 'grand_final') ? (m.round || 0) : 0), 0);
  const playRound = (m) => (m.side === 'grand_final' ? maxRound + (m.round || 0) : (m.round || 0)); // GF (+ reset) sort last
  const order = list.sort((a, b) =>
    playRound(a) - playRound(b) || sidePri(a.side) - sidePri(b.side) || (a.slot || 0) - (b.slot || 0));
  const byId = {}, byRoundLabel = {};
  order.forEach((m, i) => {
    const g = i + 1;
    if (m && m.id != null) byId[m.id] = g;
    if (m && m.round_label) byRoundLabel[m.round_label] = g;
  });
  return { byId, byRoundLabel };
}

// Rewrite a stored source label ("Winner of WB R1 M1" / "Loser of LB R2 M1") to the continuous game number
// ("Winner of G3" / "Loser of G7") so a TBD slot reads "extremely clear where you are" (Mike). Returns the
// original text unchanged if it doesn't match the pattern or the referenced match isn't in the map.
function bracketSourceLabel(src, byRoundLabel) {
  if (!src) return src;
  const m = String(src).match(/^(Winner of|Loser of)\s+(.+)$/);
  if (!m) return src;
  const g = (byRoundLabel || {})[m[2]];
  return g ? (m[1] + ' G' + g) : src;
}

// C54 fix (2026-06-30): decide whether the admin device should auto-prompt to generate the bracket the
// moment the last pool game is decided. The OLD inline guard in maybeAutoGenerateBracket required
// activeMainTab === 'tournament' — but that's the PUBLIC Bracket tab. In the admin tournament-mode
// dashboard activeMainTab is 'manage'/'live', and a public viewer on 'tournament' fails the isAdmin gate,
// so the prompt was DEAD for everyone (Mike, mid-event: "pool play is done but there's no way to generate
// the bracket"). Fire when an ADMIN is viewing the live tournament (tournament mode OR the legacy
// 'tournament' tab), the active tournament is in pools, every pool game is decided (a bye = missing team
// counts as done), and we haven't already prompted for this tournament this session.
function shouldAutoPromptBracket(o) {
  o = o || {};
  if (!o.isAdmin) return false;
  if (!o.tournamentMode && o.activeMainTab !== 'tournament') return false;
  if (o.status !== 'pools') return false;
  if (o.alreadyPrompted) return false;
  const pm = o.poolMatches || [];
  if (!pm.length) return false;
  return pm.every((m) => m.status === 'final' || !m.team_a_id || !m.team_b_id);
}

// Re-net a bracket when net_count changes (2026-06-30, F8). Returns { matchId: net } for every bracket match.
// MIRRORS the net scheme baked at generation in tdbGenerateBracket (app.js): order by play-round (winners
// then losers within a round, grand final last), then within a side:round spread across nets by position
// (pos % netCount + 1); the grand final shares the winners-final court. queue_order is NOT changed by a
// net-count change (it's the play order, independent of court count), so this returns net only. Keep this in
// sync with tdbGenerateBracket's net logic if that scheme ever changes.
function assignBracketNets(matches, netCount) {
  const nc = Math.max(1, Math.floor(Number(netCount) || 1));
  const list = (matches || []).filter((m) => m && (m.side === 'winners' || m.side === 'losers' || m.side === 'grand_final'));
  const sidePri = (s) => (s === 'winners' ? 0 : s === 'losers' ? 1 : 2);
  const maxRound = list.reduce((mx, m) => Math.max(mx, m.side !== 'grand_final' ? (m.round || 0) : 0), 0);
  const playRound = (m) => (m.side === 'grand_final' ? maxRound + (m.round || 0) : (m.round || 0));
  const order = list.slice().sort((a, b) =>
    playRound(a) - playRound(b) || sidePri(a.side) - sidePri(b.side) || (a.slot || 0) - (b.slot || 0));
  const byId = {}; const perRound = {};
  order.forEach((m) => {
    if (m.side === 'grand_final') { byId[m.id] = null; return; } // carried to the WB-final court below
    const rk = m.side + ':' + m.round;
    perRound[rk] = perRound[rk] || 0;
    byId[m.id] = (perRound[rk] % nc) + 1;
    perRound[rk]++;
  });
  const wbFinal = list.filter((m) => m.side === 'winners')
    .sort((a, b) => (b.round || 0) - (a.round || 0) || (b.slot || 0) - (a.slot || 0))[0];
  const gfNet = (wbFinal && byId[wbFinal.id]) || 1;
  list.filter((m) => m.side === 'grand_final').forEach((m) => { byId[m.id] = gfNet; });
  return byId;
}

// Slice 3b (claim page): flatten the one-shot team_members read (players+teams embedded rows) into
// claim-search candidates — {id, name, teamId, teamName, claimedBy, initials}, name-sorted (then team).
// Skips rows missing an embedded player/team or with a blank name (defensive vs partial joins). A player
// on two teams keeps BOTH rows — the team context is what disambiguates same-name people (§AS: no skill).
function shapeClaimCandidates(memberRows) {
  const out = [];
  (Array.isArray(memberRows) ? memberRows : []).forEach((r) => {
    const p = r && r.players;
    const t = r && r.teams;
    if (!p || !p.id || !t || !t.name) return;
    const name = String(p.name || '').trim();
    if (!name) return;
    const initials = name.split(/\s+/).map((w) => (w[0] || '').toUpperCase()).slice(0, 2).join('');
    out.push({
      id: String(p.id),
      name,
      teamId: t.id ? String(t.id) : '',
      teamName: String(t.name),
      claimedBy: p.claimed_by_profile || null,
      initials,
    });
  });
  out.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    || a.teamName.localeCompare(b.teamName, undefined, { sensitivity: 'base' }));
  return out;
}

// Slice 3b: name search over claim candidates. Same semantics as disambiguatePlayersByName
// (ci substring, prefix-first then name asc, cap 12, [] for empty query) but returns the ORIGINAL
// candidate objects — disambiguatePlayersByName rebuilds rows into the check-in shape and would
// strip teamName/claimedBy (found live: claimed rows lost their flag, teams rendered blank).
function filterClaimCandidates(candidates, query) {
  const q = String(query == null ? '' : query).trim().toLowerCase();
  if (!q) return [];
  const scored = [];
  for (const c of (Array.isArray(candidates) ? candidates : [])) {
    if (!c || typeof c !== 'object') continue;
    const lower = String(c.name || '').toLowerCase();
    const pos = lower.indexOf(q);
    if (pos < 0) continue;
    scored.push({ _prefix: pos === 0 ? 0 : 1, _name: lower, row: c });
  }
  scored.sort((a, b) => (a._prefix - b._prefix) || a._name.localeCompare(b._name));
  return scored.slice(0, 12).map((s) => s.row);
}

// ── Slice 3c: personal-layer helpers (Home "your run" hero, My Team page, Standings You). PURE. ──

// Which team is "mine"? candidates = shapeClaimCandidates rows; the first one claimed by this profile wins.
function resolveMyTeam(profileId, candidates) {
  if (!profileId || !Array.isArray(candidates)) return null;
  const mine = candidates.find((c) => c && c.claimedBy === profileId);
  if (!mine) return null;
  return { playerId: mine.id, teamId: mine.teamId, teamName: mine.teamName, playerName: mine.name };
}

function _teamName3c(teams, id) {
  const t = (teams || []).find((x) => x && x.id === id);
  return (t && t.name) || '';
}
function _involves3c(m, teamId) { return m && (m.team_a_id === teamId || m.team_b_id === teamId); }
function _orient3c(m, teamId, teams) {
  const iAmA = m.team_a_id === teamId;
  const oppId = iAmA ? m.team_b_id : m.team_a_id;
  return {
    oppId,
    oppName: _teamName3c(teams, oppId),
    myScore: Number(iAmA ? m.score_a : m.score_b) || 0,
    oppScore: Number(iAmA ? m.score_b : m.score_a) || 0,
    won: m.winner_team_id === teamId,
  };
}

// W-L / point diff / ordered results over MY final games (any phase).
function computeTeamRecord(teamId, matches, teams) {
  const finals = (Array.isArray(matches) ? matches : [])
    .filter((m) => _involves3c(m, teamId) && m.status === 'final')
    .sort((a, b) => String(a.updated_at || '').localeCompare(String(b.updated_at || '')));
  let wins = 0, losses = 0, pointDiff = 0;
  const results = finals.map((m) => {
    const o = _orient3c(m, teamId, teams);
    if (o.won) wins++; else losses++;
    pointDiff += o.myScore - o.oppScore;
    return { oppId: o.oppId, oppName: o.oppName, won: o.won, myScore: o.myScore, oppScore: o.oppScore, phase: m.phase };
  });
  return { wins, losses, pointDiff, results };
}

// The hero timeline: {last, next, then}. Honest ETA (§27 TRUE): only FINAL rows' updated_at are
// trusted as finish times (net re-assignment bumps unplayed rows), and "~N min" renders only when
// >=2 same-net gap samples exist; otherwise callers show "N games ahead" / nothing. Bracket
// (phase 'main') has no per-net queue -> next carries etaMin:null + gamesAhead:null.
function computeTeamRunTimeline(teamId, matches, teams) {
  const list = Array.isArray(matches) ? matches : [];
  const myFinals = list
    .filter((m) => _involves3c(m, teamId) && m.status === 'final')
    .sort((a, b) => String(a.updated_at || '').localeCompare(String(b.updated_at || '')));
  const lastM = myFinals.length ? myFinals[myFinals.length - 1] : null;
  const last = lastM
    ? (() => { const o = _orient3c(lastM, teamId, teams); return { won: o.won, myScore: o.myScore, oppScore: o.oppScore, net: lastM.net || null, oppName: o.oppName }; })()
    : null;

  // My upcoming games: both teams set, not final. Prefer the pool queue while any exists (queue_order
  // numbering restarts for the bracket, so the two sets must not be interleaved).
  const upcomingAll = list.filter((m) =>
    _involves3c(m, teamId) && m.status !== 'final' && m.team_a_id && m.team_b_id);
  const poolUp = upcomingAll.filter((m) => m.phase === 'pool');
  const upcoming = (poolUp.length ? poolUp : upcomingAll)
    .sort((a, b) => (Number(a.queue_order) || 0) - (Number(b.queue_order) || 0));

  let next = null;
  if (upcoming.length) {
    const n = upcoming[0];
    const o = _orient3c(n, teamId, teams);
    if (n.phase === 'pool') {
      const aheadCount = list.filter((m) =>
        m.phase === 'pool' && m.status !== 'final' && m.net === n.net &&
        (Number(m.queue_order) || 0) < (Number(n.queue_order) || 0)).length;
      // gap samples: minutes between consecutive finals on MY net
      const netFinals = list
        .filter((m) => m.phase === 'pool' && m.status === 'final' && m.net === n.net && m.updated_at)
        .sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)));
      const gaps = [];
      for (let i = 1; i < netFinals.length; i++) {
        const mins = (new Date(netFinals[i].updated_at) - new Date(netFinals[i - 1].updated_at)) / 60000;
        if (mins > 0) gaps.push(mins);
      }
      gaps.sort((a, b) => a - b);
      const median = gaps.length ? gaps[Math.floor(gaps.length / 2) - (gaps.length % 2 === 0 ? 1 : 0)] : null;
      const etaMin = (gaps.length >= 2 && aheadCount >= 1 && median != null) ? Math.round(median * aheadCount) : null;
      const isNow = aheadCount === 0 || n.status === 'live';
      next = { net: n.net || null, oppName: o.oppName, gamesAhead: aheadCount, etaMin, isNow, label: isNow ? 'Playing now' : 'Up next' };
    } else {
      next = { net: n.net || null, oppName: o.oppName, gamesAhead: null, etaMin: null, isNow: n.status === 'live', label: n.status === 'live' ? 'Playing now' : 'Up next' };
    }
  }

  const thenM = upcoming.length > 1 ? upcoming[1] : null;
  const then = thenM ? { oppName: _orient3c(thenM, teamId, teams).oppName } : null;
  return { last, next, then };
}

// Slice 2 (spec §13.3): the public Bracket page — completed-state summary. PURE (no DOM / no state).
// Given the main-phase (bracket) matches + teams, returns the champion, the runner-up (the champion's
// opponent in the deciding grand-final game), and that deciding game's id — or null while no champion is
// decided yet. Reuses computeChampion (grand-final logic, incl. reset). Drives the matte-gold champions
// strip + the gold championship-game node; the page renders NOTHING gold until this is non-null.
function bracketOutcome(main, teams) {
  const list = Array.isArray(main) ? main : [];
  const champ = computeChampion(list, teams);
  if (!champ) return null;
  const gf2 = list.find((m) => m && m.side === 'grand_final' && m.round === 2);
  const gf1 = list.find((m) => m && m.side === 'grand_final' && m.round === 1);
  const deciding = (gf2 && gf2.status === 'final') ? gf2 : ((gf1 && gf1.status === 'final') ? gf1 : null);
  let runnerUpId = null;
  if (deciding) runnerUpId = (deciding.team_a_id === champ.teamId) ? deciding.team_b_id : deciding.team_a_id;
  const ru = (teams || []).find((t) => t && t.id === runnerUpId);
  return {
    championId: champ.teamId,
    championName: champ.name,
    runnerUpId: runnerUpId || null,
    runnerUpName: (ru && ru.name) || '',
    decidingMatchId: deciding ? deciding.id : null,
  };
}

// The friendly side+round label for one bracket match ("Winners round 2" / "Losers round 1" /
// "Grand final" / "Grand final (reset)"). Used by the live status line.
function bracketRoundLabel(m) {
  if (!m) return null;
  if (m.side === 'grand_final') return (Number(m.round) === 2) ? 'Grand final (reset)' : 'Grand final';
  const r = Number(m.round) || 1;
  return (m.side === 'losers' ? 'Losers round ' : 'Winners round ') + r;
}

// Slice 2 (spec §13.3): the live bracket status line — the round currently in play, as
// "Double elimination · <this>". PURE. Prefers a genuinely live game's round; else the soonest
// still-to-play game (lowest queue_order among playable, both-teams-set, non-final games). Returns
// null when nothing is in play (no bracket, or every game final) so the caller can omit the line.
function bracketStatusLine(main) {
  const list = (Array.isArray(main) ? main : [])
    .filter((m) => m && m.team_a_id && m.team_b_id && m.status !== 'final');
  if (!list.length) return null;
  const live = list.find((m) => m.status === 'live');
  const focus = live || list.slice().sort((a, b) => (Number(a.queue_order) || 0) - (Number(b.queue_order) || 0))[0];
  return bracketRoundLabel(focus);
}

// Slice 1 (spec §13.2): the tap-a-team peek — a read-only spectator model for ONE team, shared by the
// Pools & schedule page and the Home live board. PURE (no DOM / no state global): the caller passes
// { teams, matches, pools }. Returns null for an unknown team. "Seeing is free" — no account, no skill.
// Fields: teamName, initials, poolLabel, poolRank (rank within its OWN pool, or null), seed (overall,
// or null until a pool game is final), wins/losses/pointDiff/gamesPlayed (FINAL games only),
// live: { net, oppName, myScore, oppScore } | null   (a genuinely live-scored game — status 'live'),
// next: { net, oppName, phase, roundLabel, isNow } | null (soonest upcoming game; pool queue preferred).
// Reuses computeStandings (pool rank), computeSeeding (overall seed), computeTeamRecord (W-L / diff).
function teamPeekModel(teamId, data) {
  const d = data || {};
  const teams = Array.isArray(d.teams) ? d.teams : [];
  const matches = Array.isArray(d.matches) ? d.matches : [];
  const pools = Array.isArray(d.pools) ? d.pools : [];
  const team = teams.find((t) => t && t.id === teamId);
  if (!team) return null;
  const teamName = String(team.name || '');
  const initials = teamName.trim().split(/\s+/).filter(Boolean)
    .map((w) => (w[0] || '').toUpperCase()).slice(0, 2).join('') || '?';

  // pool label + rank within its OWN pool (each pool ranks its own teams — spec §13.1/§6.3)
  const pool = pools.find((p) => p && p.id === team.pool_id) || null;
  const poolLabel = pool ? String(pool.label || '') : '';
  let poolRank = null;
  if (pool) {
    const poolTeams = teams.filter((t) => t && t.pool_id === pool.id);
    const poolMatches = matches.filter((m) => m && m.pool_id === pool.id);
    const row = computeStandings(poolTeams, poolMatches).find((r) => r.teamId === teamId);
    poolRank = row ? row.rank : null;
  }

  // overall seed is only honest (§27 TRUE) once at least one pool game is final — else null.
  const anyFinal = matches.some((m) => m && m.phase === 'pool' && m.status === 'final');
  let seed = null;
  if (anyFinal) {
    const s = computeSeeding(teams, matches).find((r) => r.teamId === teamId);
    seed = s ? s.seed : null;
  }

  const rec = computeTeamRecord(teamId, matches, teams);

  const involves = (m) => m && (m.team_a_id === teamId || m.team_b_id === teamId);
  const orient = (m) => {
    const iAmA = m.team_a_id === teamId;
    const oppId = iAmA ? m.team_b_id : m.team_a_id;
    const opp = teams.find((t) => t && t.id === oppId);
    return {
      oppName: (opp && opp.name) || '',
      myScore: Number(iAmA ? m.score_a : m.score_b) || 0,
      oppScore: Number(iAmA ? m.score_b : m.score_a) || 0,
    };
  };

  // live = a genuinely live-scored game for this team (status 'live' — a running score exists).
  const liveM = matches.find((m) => involves(m) && m.status === 'live' && m.team_a_id && m.team_b_id);
  let live = null;
  if (liveM) {
    const o = orient(liveM);
    live = { net: liveM.net || null, oppName: o.oppName, myScore: o.myScore, oppScore: o.oppScore };
  }

  // next = soonest upcoming game (not final, both teams set), excluding the live game; pool queue preferred
  // (queue_order restarts for the bracket, so pool + bracket sets must not interleave — mirrors the timeline).
  const upcomingAll = matches.filter((m) => involves(m) && m.status !== 'final'
    && m.team_a_id && m.team_b_id && !(liveM && m.id === liveM.id));
  const poolUp = upcomingAll.filter((m) => m.phase === 'pool');
  const upcoming = (poolUp.length ? poolUp : upcomingAll)
    .slice().sort((a, b) => (Number(a.queue_order) || 0) - (Number(b.queue_order) || 0));
  let next = null;
  if (upcoming.length) {
    const n = upcoming[0];
    const o = orient(n);
    next = { net: n.net || null, oppName: o.oppName, phase: n.phase || 'pool', roundLabel: String(n.round_label || ''), isNow: n.status === 'live' };
  }

  return {
    teamId, teamName, initials,
    poolLabel, poolRank, seed,
    wins: rec.wins, losses: rec.losses, pointDiff: rec.pointDiff, gamesPlayed: rec.results.length,
    live, next,
  };
}

// Round 2 (spec §12.3): the check-in one-tap hero shows ONLY for an unambiguous claimed player.
// 0 rows (unclaimed) or 2+ rows (ambiguous claim data) -> null -> the kiosk stays search-first.
function checkinHeroModel(rows) {
  if (!Array.isArray(rows) || rows.length !== 1) return null;
  const p = rows[0] || {};
  if (!p.id || !p.name) return null;
  return { id: p.id, name: String(p.name) };
}

// Finish-line Slice 3 (spec §13.5): the registration EVENT view-model. Pure shape for the event card —
// the REGISTRATION OPEN / closed pill, the chips row, and the honest live-spots line. HARD RULE (spec +
// §27): a date chip renders ONLY when the tournament actually carries a date (there is no date column
// today, so `dateChip` is null and the chip is omitted — never invent one). Cost shows the tournament's
// own `buy_in` when set, else the league's spec-locked "$80 a team" (the sheet's "$20 each" caption is the
// same fixed price). `spotsLead` reads "Be the first team in" at zero teams, else "N teams in".
function registerEventModel(show, teams) {
  const t = show || {};
  const list = Array.isArray(teams) ? teams : [];
  const teamSize = Number(t.team_size) || 4;
  const regOpen = !!(t.registration_open && t.status === 'setup');
  const buyIn = t.buy_in != null ? String(t.buy_in).trim() : '';
  const count = list.length;
  const rawName = (t.name != null && String(t.name).trim()) ? String(t.name).trim() : 'Tournament';
  const rawDate = t.event_date || t.start_date || t.starts_at || null; // no such column today → null → chip omitted
  return {
    regOpen,
    name: rawName,
    teamSize,
    dateChip: rawDate ? String(rawDate) : null,
    costChip: buyIn || '$80 a team',
    playersChip: teamSize + ' players',
    count,
    isEmpty: count === 0,
    spotsLead: count === 0 ? 'Be the first team in' : (count + ' team' + (count === 1 ? '' : 's') + ' in'),
    spotsTail: count === 0 ? '' : 'room for more',
  };
}

// Finish-line Slice 3 (spec §13.5): the join-sheet submit validation — the SAME rules the proven public
// register write path enforced (team name required; the roster must carry EXACTLY the tournament's team
// size), returning the identical inline error copy. Extracted pure so the sheet can validate before the
// register_team RPC call without duplicating the messages. `roster` is trimmed + empties dropped first.
function joinSheetValidate(teamName, roster, teamSize) {
  const name = String(teamName || '').trim();
  const size = Number(teamSize) || 4;
  const clean = (Array.isArray(roster) ? roster : []).map((n) => String(n || '').trim()).filter(Boolean);
  if (!name) return { ok: false, message: 'Enter a team name.' };
  if (clean.length !== size) return { ok: false, message: 'Enter all ' + size + ' players.' };
  return { ok: true, teamName: name, roster: clean };
}

// Launch spec (2026-07-10): the NEW registration PAGE validator. Same team-name + exact-size gates as
// joinSheetValidate, PLUS a per-row FULL-NAME gate — every player must carry a first AND a last name
// (Mike: "there are no captains; every player must have a first and last name"). The full-name rule is
// deliberately looser than isValidFullName (which requires each part >= 2 chars): a name passes when, after
// trimming, it splits on whitespace into >= 2 tokens each with >= 1 non-space char ("Sam" fails, "Sam Lee"
// and "Sam  Lee" pass). Friendly inline copy names the offending value. Trims the team name + every roster
// name before returning so the stored roster jsonb is clean (fixes the raw-REST untrimmed-roster note). PURE.
function registerFormValidate(teamName, roster, teamSize) {
  const name = String(teamName == null ? '' : teamName).trim();
  const size = Number(teamSize) || 4;
  const clean = (Array.isArray(roster) ? roster : [])
    .map((n) => String(n == null ? '' : n).trim())
    .filter(Boolean);
  if (!name) return { ok: false, message: 'Enter a team name.' };
  if (clean.length !== size) return { ok: false, message: 'Enter all ' + size + ' players.' };
  for (const nm of clean) {
    const tokens = nm.split(/\s+/).filter(Boolean); // whitespace-split; each token already has a non-space char
    if (tokens.length < 2) return { ok: false, message: 'Give ' + nm + ' a last name too.' };
  }
  return { ok: true, teamName: name, roster: clean };
}

// Addendum (2026-07-10, Mike): proactive duplicate-team-name check for the registration page's inline warning.
// The server (register_team) remains the AUTHORITY on rejecting duplicates under concurrency; this only drives
// the "already taken" hint as the captain types. Case-insensitive + trimmed on both sides, matching the
// server's comparison. An empty/whitespace name or an empty/nullish team list is never "taken". PURE.
function teamNameTaken(name, teams) {
  const q = String(name == null ? '' : name).trim().toLowerCase();
  if (!q) return false;
  return (Array.isArray(teams) ? teams : []).some(
    (t) => String((t && t.name) || '').trim().toLowerCase() === q
  );
}

// 2026-07-16 (Mike, AskUserQuestion pick): prefilled Venmo pay link. extractVenmoUsername pulls the bare
// @handle from a stored profile URL — host venmo.com / account.venmo.com (www. tolerated), path /u/<name>
// OR the bare /<name>; query + trailing slash ignored; a stored leading @ stripped. Returns the bare
// username (no @, no slash) or null when the link isn't a Venmo profile URL. PURE (no DOM / no state).
function extractVenmoUsername(storedLink) {
  const raw = String(storedLink == null ? '' : storedLink).trim();
  if (!raw) return null;
  let url;
  try { url = new URL(raw); } catch (_) { return null; }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (host !== 'venmo.com' && host !== 'account.venmo.com') return null;
  const parts = url.pathname.split('/').filter(Boolean); // drops empties -> trailing slash tolerated
  let name = null;
  if (parts.length === 1) name = parts[0];                                  // /<name>
  else if (parts.length === 2 && parts[0].toLowerCase() === 'u') name = parts[1]; // /u/<name>
  else return null;                                                         // '' or a deeper path
  try { name = decodeURIComponent(name); } catch (_) { /* keep raw */ }
  name = String(name || '').replace(/^@/, '').trim();
  return name || null;
}

// Compose a PREFILLED Venmo pay deep link from the stored profile URL + the SAME money text the button
// shows + the team name. Venmo's server 302->307-redirects the BARE-path form
// (venmo.com/<name>?txn=pay&amount=<bareNumber>&note=<urlencoded>) into the app carrying every param — the
// /u/<name> form IGNORES them (verified live 2026-07-16), so this ALWAYS emits the bare path. amount is a
// bare decimal, no $ (an unparseable money text omits amount but still returns a txn=pay link). A blank
// team name omits the note. Returns null when storedLink isn't a Venmo profile URL, so the caller falls
// back to the raw stored link byte-for-byte. PURE (no DOM / no state).
function composeVenmoPayURL(storedLink, moneyText, teamName) {
  const username = extractVenmoUsername(storedLink);
  if (!username) return null;
  const params = ['txn=pay'];
  const amtMatch = String(moneyText == null ? '' : moneyText).match(/\d[\d,]*(?:\.\d+)?/);
  if (amtMatch) {
    const amount = amtMatch[0].replace(/,/g, '');
    if (amount) params.push('amount=' + amount);
  }
  const note = String(teamName == null ? '' : teamName).trim();
  if (note) params.push('note=' + encodeURIComponent(note));
  return 'https://venmo.com/' + username + '?' + params.join('&');
}

// Finish-line Slice 4 (spec §13.4): the ELIMINATED terminal timeline node. Has this team's double-elim
// bracket run ENDED (been eliminated), and — only when the bracket structure makes it CERTAIN — what single
// finishing place is derivable? A team is eliminated when it LOST a losers-bracket game or the grand final
// (its 2nd loss / no next game). Winners-bracket losses do NOT eliminate (the team drops to losers), so they
// are ignored. A defensive guard also requires the team to have NO upcoming bracket game (a team still in a
// reset grand final isn't out yet). PURE (no DOM / no state).
//   place: the grand-final loser is 2nd; a losers-bracket elimination resolves to a single Nth ONLY when its
//   LB round eliminates exactly one team (e.g. the LB-final loser is always 3rd). When the LB round ties two
//   or more teams (e.g. 5th-6th), place is null — "Run ended" shows with no place (NEVER invent a placing, §27).
//   The count of games per losers round is read from the full generated bracket, so the place is structural
//   (correct even mid-tournament, before later rounds are played).
function computeTeamRunEnded(teamId, matches, teams) {
  const main = (Array.isArray(matches) ? matches : []).filter((m) => m && m.phase === 'main');
  if (!teamId || !main.length) return { ended: false, place: null };
  const involves = (m) => m && (m.team_a_id === teamId || m.team_b_id === teamId);
  // the team's eliminating loss: a FINAL losers/grand_final game it did not win
  const lostElim = main.filter((m) => involves(m) && m.status === 'final'
    && (m.side === 'losers' || m.side === 'grand_final')
    && m.winner_team_id && m.winner_team_id !== teamId);
  if (!lostElim.length) return { ended: false, place: null };
  // defensive: a truly-out team has no upcoming (non-final, both-teams-set) bracket game.
  const hasUpcoming = main.some((m) => involves(m) && m.status !== 'final' && m.team_a_id && m.team_b_id);
  if (hasUpcoming) return { ended: false, place: null };
  // grand-final loss → runner-up (2nd), a certain single place.
  if (lostElim.some((m) => m.side === 'grand_final')) return { ended: true, place: 2 };
  // losers-bracket elimination: the latest losers game the team lost sets its round.
  const lbLoss = lostElim.filter((m) => m.side === 'losers')
    .sort((a, b) => (Number(b.round) || 0) - (Number(a.round) || 0))[0];
  if (!lbLoss) return { ended: true, place: null };
  const r = Number(lbLoss.round) || 0;
  const losersGames = main.filter((m) => m.side === 'losers');
  const laterCount = losersGames.filter((m) => (Number(m.round) || 0) > r).length; // teams eliminated after this one
  const sameCount = losersGames.filter((m) => (Number(m.round) || 0) === r).length; // teams tied at this round
  const placeTop = 3 + laterCount;                       // 1 champ + 1 runner-up + everyone eliminated later
  const placeBottom = placeTop + Math.max(0, sameCount - 1);
  const place = (placeTop === placeBottom) ? placeTop : null; // a tie range → no single Nth (never invent)
  return { ended: true, place };
}

// Finish-line Slice 4 (spec §13.6): the past-dated "next session" guard, shared by the casual Home card and
// checkin.html. Returns true when the session date is TODAY or later (render the card), false when it is in the
// past (→ the designed "No session scheduled" state) or the date is missing/unparseable. Dates are 'YYYY-MM-DD'
// (a leading ISO date part is accepted); compared as calendar days in LOCAL time (a session is "today" all day).
// todayStr defaults to the local today. PURE.
function sessionIsUpcoming(dateStr, todayStr) {
  const isoDate = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s == null ? '' : s).trim());
    return m ? (m[1] + '-' + m[2] + '-' + m[3]) : null;
  };
  const d = isoDate(dateStr);
  if (!d) return false;
  let today = isoDate(todayStr);
  if (!today) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    today = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
  }
  return d >= today; // zero-padded ISO date parts compare correctly as strings
}

// Check In rework (Mike 2026-07-10) + multi-day pickup schedule (Task 2, Mike 2026-07-11): true when
// ANY pickup day in the set IS today — the day-of gate for the public Check In nav tab and the Home
// session_live state ("it should not show unless an admin creates a pickup day"; a FUTURE pickup day
// stays quiet until its day). `days` is a SET of pickup-day rows ([{ day }] — the new pickup_days
// shape; a legacy sessions row's `date` is read too). A compatibility branch keeps a SINGLE legacy row
// (an object) or a bare date string working, so pre-migration callers + the shipped tests still hold.
// Same date parsing as sessionIsUpcoming: 'YYYY-MM-DD' (leading ISO date part accepted), compared as
// calendar days in LOCAL time; missing/unparseable → skipped. todayStr defaults to the local today. PURE.
function sessionIsToday(days, todayStr) {
  const isoDate = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s == null ? '' : s).trim());
    return m ? (m[1] + '-' + m[2] + '-' + m[3]) : null;
  };
  let today = isoDate(todayStr);
  if (!today) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    today = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
  }
  // Accept: an array of pickup-day rows | a single legacy row object | a bare date string.
  const rows = Array.isArray(days) ? days
    : (days && typeof days === 'object') ? [days]
      : [days];
  return rows.some((r) => {
    const raw = (r && typeof r === 'object') ? (r.day != null ? r.day : r.date) : r;
    return isoDate(raw) === today;
  });
}

// Manage lead — the "needs you" attention model (session-10 pick R1, admin Manage tab). PURE: no state,
// no DOM, no Date. Returns the ordered action items that need the admin's attention, each with a deep-link
// `area` into the Manage screen that fixes it. Order is fixed (venmo -> unpaid -> noday) so the lead reads
// the same every render.
//   t          — the live/registering tournament row (or null) — { registration_open, venmo_link, ... }
//   teams      — that tournament's team rows — [{ name, paid }]
//   pickupDays — the ALREADY-UPCOMING pickup days (caller pre-filters via sessionIsUpcoming); empty = none
// Rules: reg open + no venmo_link -> venmo; any team with paid falsey -> unpaid ("N teams haven't paid");
// no upcoming pickup day -> noday; nothing pending -> [].
function manageNeedsYouModel(t, teams, pickupDays) {
  const items = [];
  const tRow = t || {};
  const teamRows = Array.isArray(teams) ? teams : [];
  const days = Array.isArray(pickupDays) ? pickupDays : [];

  const venmo = tRow.venmo_link == null ? '' : String(tRow.venmo_link).trim();
  if (tRow.registration_open && !venmo) {
    items.push({
      id: 'venmo', area: 'tournament',
      title: 'Add the Venmo link',
      sub: 'The register page\'s pay button says "coming soon"',
    });
  }

  const unpaid = teamRows.filter((tm) => tm && !tm.paid);
  if (unpaid.length) {
    const names = unpaid.map((tm) => (tm && tm.name) ? String(tm.name) : 'Team').join(' · ');
    items.push({
      id: 'unpaid', area: 'tournament',
      title: unpaid.length + ' team' + (unpaid.length === 1 ? ' hasn\'t' : 's haven\'t') + ' paid',
      sub: names + ', registered without the checkbox',
    });
  }

  if (!days.length) {
    items.push({
      id: 'noday', area: 'pickup',
      title: 'No pickup day set',
      sub: 'The Check In tab stays hidden until one exists',
    });
  }

  return items;
}

// ── Public Home state machine + view-models (atom-up spec 2026-07-10 §2) ──
// PURE: no state access, no DOM, no Date.now(); todayStr comes in as a parameter.
// Consume the TOURNAMENT match-row shape (verified vs buildPublicTournamentLiveHTML /
// computeStandings): team_a_id/team_b_id, score_a/score_b, net, status
// ('scheduled'|'live'|'final'), queue_order. Casual courts (getPublicLiveData) carry a
// different shape (team NUMBERS, no scores, win/loss only) and are rendered from their
// own builder in the caller — these score-carrying models do not apply to them.

// Exclusive with precedence: tournament_live > session_live > registration > quiet.
// hasLiveCourts is accepted for symmetry with the render caller but deliberately does
// NOT make a stale session live — the date gate (sessionIsToday) is the truth source,
// so live-court data left over from a past session is ignored (the June-28 prod bug).
// Check In rework (Mike 2026-07-10): the gate is DAY-OF only (was sessionIsUpcoming) so
// a future pickup day renders the quiet state until its day — Home and the Check In nav
// tab (checkinNavVisible in app.js) agree on the same helper.
function publicHomeState(o) {
  o = o || {};
  if (o.liveTournament) return 'tournament_live';
  // Day-of gate against the SET of pickup days (Task 2). Back-compat: a single legacy `session` row is
  // accepted and shaped as a one-element set, so the pre-migration caller + the shipped tests still hold.
  var days = Array.isArray(o.pickupDays) ? o.pickupDays : (o.session ? [o.session] : []);
  if (sessionIsToday(days, o.todayStr)) return 'session_live';
  if (o.regTournament) return 'registration';
  return 'quiet';
}

// Live tournament games shaped one-block-per-net for the Home "LIVE NOW" board.
// Only genuinely live-scored games (status 'live') carry a running score, so those are
// the ones shown. First live game wins per net; blocks sorted by net ascending.
function homeNetBlocksModel(matches, teams, labelPrefix) {
  var nameOf = function (id) {
    var t = (teams || []).find(function (x) { return x && x.id === id; });
    return (t && t.name) || '';
  };
  var seen = {};
  var live = (matches || []).filter(function (m) {
    if (!m || m.status !== 'live' || m.net == null) return false;
    if (seen[m.net]) return false;
    seen[m.net] = true;
    return true;
  });
  live.sort(function (a, b) { return a.net - b.net; });
  return live.map(function (m) {
    return {
      label: labelPrefix + ' ' + m.net,
      a: { name: nameOf(m.team_a_id), score: Number(m.score_a) || 0 },
      b: { name: nameOf(m.team_b_id), score: Number(m.score_b) || 0 },
      status: 'playing',
    };
  });
}

// The next queued game per net for the Home "COMING UP" list: scheduled (neither live
// nor final) with both teams known, earliest by queue_order. Only nets that actually
// have a queued game appear; rows sorted by net ascending.
function homeComingUpModel(matches, teams, labelPrefix) {
  var nameOf = function (id) {
    var t = (teams || []).find(function (x) { return x && x.id === id; });
    return (t && t.name) || '';
  };
  var byNet = {};
  (matches || []).forEach(function (m) {
    if (!m || m.net == null || m.status === 'live' || m.status === 'final') return;
    if (!m.team_a_id || !m.team_b_id) return;
    var cur = byNet[m.net];
    if (!cur || (Number(m.queue_order) || 0) < (Number(cur.queue_order) || 0)) byNet[m.net] = m;
  });
  return Object.keys(byNet)
    .map(function (k) { return byNet[k]; })
    .sort(function (a, b) { return a.net - b.net; })
    .map(function (m) {
      return { label: labelPrefix + ' ' + m.net, text: nameOf(m.team_a_id) + ' vs ' + nameOf(m.team_b_id) };
    });
}

// Top-n standings rows shaped for the Home "STANDINGS · TOP 3" list. Consumes
// computeStandings() output (name/wins/losses, already rank-sorted); rank is the list
// position so the model stays faithful whether or not a rank field is present.
function homeTopStandingsModel(standings, n) {
  return (standings || []).slice(0, n).map(function (r, i) {
    return { rank: i + 1, name: (r && r.name) || '', record: ((r && r.wins) || 0) + '-' + ((r && r.losses) || 0) };
  });
}

// Tournament page atom-up redesign (spec 2026-07-10 §2/§3): the CURRENT stage that drives the hub's stage
// progress bar (one stage at a time — POOL PLAY, then BRACKET, then Final) AND which hub row carries the
// active-stage emphasis (activeView -> the Pools or Bracket row lights "Happening now"; the not-yet stage's
// row fades/locks). PURE — keyed on the tournament's own `status`, the phase authority used everywhere else
// (buildTournamentHubHTML / bracket page). Returns { phase, stageLabel, count, total, pct, activeView }:
//   setup / no tournament -> no live stage bar (stageLabel null, activeView null).
//   pools    -> count = pool games final, total = pool games with BOTH teams set (byes/main excluded), like
//               the bracket page's pre-progress line; pct = round(count/total*100); activeView 'pools'.
//   bracket  -> total = distinct play-round levels among main matches (winners+losers of the same round run
//               concurrently, so they share a level; grand final sorts last — mirrors bracketGameNumbers);
//               count = the ordinal of the CURRENT round (the live game's level, else the soonest still-to-play
//               game by queue_order); activeView 'bracket'.
//   completed-> stageLabel 'Final', full bar, activeView null (nothing "happening now"; all rows navigable).
function tournamentStageModel(tournament, matches) {
  const t = tournament || {};
  const list = Array.isArray(matches) ? matches : [];
  const status = t.status || 'setup';

  if (status === 'pools') {
    const games = list.filter((m) => m && m.phase === 'pool' && m.team_a_id && m.team_b_id);
    const total = games.length;
    const count = games.filter((m) => m.status === 'final').length;
    const pct = total ? Math.round((count / total) * 100) : 0;
    return { phase: 'pools', stageLabel: 'Pool play', count, total, pct, activeView: 'pools' };
  }

  if (status === 'bracket' || status === 'completed') {
    const main = list.filter((m) => m && m.phase === 'main');
    const maxRound = main.reduce((mx, m) => Math.max(mx, m.side !== 'grand_final' ? (Number(m.round) || 0) : 0), 0);
    const playRound = (m) => (m.side === 'grand_final' ? maxRound + (Number(m.round) || 0) : (Number(m.round) || 0));
    const levels = [...new Set(main.map(playRound))].sort((a, b) => a - b);
    const total = levels.length;
    if (status === 'completed') {
      return { phase: 'completed', stageLabel: 'Final', count: total, total, pct: 100, activeView: null };
    }
    // live bracket — current round = the ordinal of the focus game's play-round level.
    const playable = main.filter((m) => m.team_a_id && m.team_b_id && m.status !== 'final');
    const live = playable.find((m) => m.status === 'live');
    const focus = live
      || playable.slice().sort((a, b) => (Number(a.queue_order) || 0) - (Number(b.queue_order) || 0))[0]
      || null;
    const idx = focus ? levels.indexOf(playRound(focus)) : (total - 1);
    const count = total ? Math.max(1, idx + 1) : 0;
    const pct = total ? Math.round((count / total) * 100) : 0;
    return { phase: 'bracket', stageLabel: 'Bracket', count, total, pct, activeView: 'bracket' };
  }

  // setup / registration / unknown -> no live stage bar (spec §3).
  return { phase: 'setup', stageLabel: null, count: 0, total: 0, pct: 0, activeView: null };
}

// Rules formatter (launch spec 2026-07-10): tournaments.rules is markdown-lite text Mike types —
// "## " section headings, "- " bullets, "1. " numbered rows, blank lines between sections. The
// contract is ESCAPE-FIRST: every line runs through the same entity set as app.js escapeHTMLText
// (& < > " ') BEFORE any transform, so the column can NEVER inject markup — a rules text containing
// <script> renders as literal text. Blank-line separated blocks group into .rl-sect wrappers; any
// other non-empty line becomes a paragraph. Pure — no DOM / no DB / no app state.
function rulesToHTML(text) {
  if (text == null) return '';
  const escapeLine = (value) => String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
  const sections = [];
  let current = [];
  const flush = () => {
    if (current.length) sections.push(`<div class="rl-sect">${current.join('')}</div>`);
    current = [];
  };
  for (const raw of String(text).split(/\r?\n/)) {
    const line = escapeLine(raw.trim());
    if (!line) { flush(); continue; }
    const numbered = line.match(/^(\d+)\.\s+(.*)$/);
    if (line.startsWith('## ')) {
      current.push(`<div class="rl-h">${line.slice(3).trim()}</div>`);
    } else if (line.startsWith('- ')) {
      current.push(`<div class="rl-li"><span class="rl-dot"></span><span>${line.slice(2).trim()}</span></div>`);
    } else if (numbered) {
      current.push(`<div class="rl-li"><span class="rl-num">${numbered[1]}</span><span>${numbered[2].trim()}</span></div>`);
    } else {
      current.push(`<p class="rl-p">${line}</p>`);
    }
  }
  flush();
  return sections.join('');
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    createLocalPlayerKey, playerIdentityKey, summarizeTeamFairness,
    generateOneBalancedCandidate, generateBalancedGroups, validateScores,
    countSharedTeammatePairs, pickMostDifferentTeams,
    generateRoundRobin, decideWinner, computeStandings, applyHeadToHeadGroups,
    nextPow2, seedOrder, computeSeeding, computeChampion, resolveHistoryChampion, generateDoubleElim,
    disambiguatePlayersByName, groupRosterPlayersBySection, isValidFullName, splitFullNameParts,
    copilotRosterNames, copilotUpNextByNet, buildCopilotContext,
    resolvePlayerByName, COPILOT_TOOL_POLICY, validateCopilotToolArgs,
    resolveTournamentMatch, publicHubStatus,
    scoringRulesFor, gameScoreStatus,
    splitNetsAcrossPools, distributeGamesOnNets, pickPoolCurrentGames,
    bracketGameNumbers, bracketSourceLabel,
    shouldAutoPromptBracket, assignBracketNets,
    shapeStandingsByPool, computeAllTimeLeaderboard,
    shapeClaimCandidates, filterClaimCandidates,
    resolveMyTeam, computeTeamRecord, computeTeamRunTimeline,
    teamPeekModel, checkinHeroModel,
    bracketOutcome, bracketRoundLabel, bracketStatusLine,
    registerEventModel, joinSheetValidate, registerFormValidate, teamNameTaken,
    extractVenmoUsername, composeVenmoPayURL,
    computeTeamRunEnded, sessionIsUpcoming, sessionIsToday, manageNeedsYouModel,
    publicHomeState, homeNetBlocksModel, homeComingUpModel, homeTopStandingsModel,
    tournamentStageModel, rulesToHTML
  };
}
