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

  const ordered = eligiblePlayers.slice().sort((a, b) => {
    const diff = (Number(b.skill) || 0) - (Number(a.skill) || 0);
    if (Math.abs(diff) >= 0.6) return diff;
    return Math.random() - 0.5;
  });

  // Small near-skill shuffles increase variety without wrecking fairness.
  for (let i = 0; i < ordered.length - 1; i += 1) {
    const a = Number(ordered[i].skill) || 0;
    const b = Number(ordered[i + 1].skill) || 0;
    if (Math.abs(a - b) <= 0.6 && Math.random() < 0.35) {
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
      (idx) => teamSkills[idx] + (Number(player.skill) || 0) <= minProjected + 0.35
    );
    const pool = nearBest.length ? nearBest : candidates;
    const target = pool[Math.floor(Math.random() * pool.length)];

    teams[target].push(player);
    teamSkills[target] += Number(player.skill) || 0;
  }

  return teams;
}

function generateBalancedGroups(players, checkedInKeys, groupCount) {
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
  const nearBest = [];

  for (let i = 0; i < attempts; i += 1) {
    const teams = generateOneBalancedCandidate(eligible, safeGroupCount);
    const fairness = summarizeTeamFairness(teams);
    const candidate = { teams, fairness };

    if (!best || fairness.score < best.fairness.score - 1e-9) {
      best = candidate;
      nearBest.length = 0;
      nearBest.push(candidate);
      continue;
    }

    if (
      fairness.score <= best.fairness.score + 0.35 &&
      fairness.skillSpread <= best.fairness.skillSpread + 0.25
    ) {
      nearBest.push(candidate);
    }
  }

  const pool = nearBest.length ? nearBest : [best];
  const chosen = pool[Math.floor(Math.random() * pool.length)] || best;
  const chosenFairness = chosen ? chosen.fairness : { skillSpread: 0, countSpread: 0, score: 0 };

  return {
    teams: chosen ? chosen.teams : Array.from({ length: safeGroupCount }, () => []),
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

// CommonJS export for the test runner; skipped in the browser (module is undefined there).
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    createLocalPlayerKey, playerIdentityKey, summarizeTeamFairness,
    generateOneBalancedCandidate, generateBalancedGroups, validateScores,
    generateRoundRobin, decideWinner, computeStandings, applyHeadToHeadGroups,
    nextPow2, seedOrder, computeSeeding, computeChampion, generateDoubleElim,
    disambiguatePlayersByName
  };
}
