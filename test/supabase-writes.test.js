// NF-2 (2026-06-26) — regression guard: every Supabase WRITE in the client must capture its result
// so a failed write can't silently report success while the DB is wrong ("an unchecked error shows
// success while the DB is wrong — silent corruption"). This test SCANS the shipped client source and
// fails if any table write (.insert/.update/.delete/.upsert) or static-named mutating .rpc() is left as
// a BARE `await supabaseClient...` expression statement (result discarded). Guarded writes are written
// `const { error } = await supabaseClient...` (or `res = await ...`) — the assignment is the signal.
//
// HEURISTIC, not a parser (this codebase has no build step): it strips comments, then for each write
// call checks whether the statement that contains it assigns the awaited result (an `=` between the
// previous statement boundary and the call). Known, intentional gaps (documented so nothing is silently
// cut, per §28):
//   - `log_copilot_action` is EXCLUDED — it's a best-effort audit log, intentionally fire-and-forget
//     (app.js: `try { await supabaseClient.rpc('log_copilot_action', ...) } catch { /* best-effort */ }`).
//   - .rpc() called with a DYNAMIC name (e.g. `rpc(inBtn ? 'check_in' : 'check_out')`) is not matched by
//     the rpc branch (all such sites are guarded today); table writes — the higher corruption risk — are
//     fully covered regardless of name.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Blank out comments while preserving length + newlines so character offsets and line numbers stay exact.
function stripComments(src) {
  // Block comments first (covers any // inside them).
  let out = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  // Line comments — but NOT the // in a URL scheme like https:// (guard on a preceding ':').
  out = out.replace(/(?<!:)\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
  return out;
}

const MUTATING_RPCS = [
  'check_in', 'check_out', 'register_player', 'register_team', 'submit_match_score',
  'generate_bracket_atomic', 'clear_bracket_atomic', 'start_new_session',
  // log_copilot_action intentionally omitted — best-effort audit log.
];

// Matches a Supabase write at the START of the chain (the client identifier), across line breaks:
//   supabaseClient.from('x').insert/update/delete/upsert(   OR   sb.from(...)....
//   supabaseClient.rpc('<mutating rpc>'                      OR   sb.rpc('<mutating rpc>'
function writeCallRegex() {
  const rpcAlt = MUTATING_RPCS.join('|');
  return new RegExp(
    '(?:supabaseClient|sb)\\s*\\.\\s*(?:' +
      "from\\s*\\([^)]*\\)\\s*\\.\\s*(?:insert|update|delete|upsert)\\s*\\(" +
      '|' +
      "rpc\\s*\\(\\s*['\"](?:" + rpcAlt + ")['\"]" +
    ')',
    'g'
  );
}

// Guarded == the awaited result is assigned: between the previous statement boundary ( ; { } ) and the
// write call there is an `=` (covers `const { error } = await ...`, `res = await ...`, `x.id = await ...`).
function isGuarded(stripped, callIndex) {
  const prefix = stripped.slice(0, callIndex);
  const boundary = Math.max(
    prefix.lastIndexOf(';'),
    prefix.lastIndexOf('{'),
    prefix.lastIndexOf('}')
  );
  const tail = prefix.slice(boundary + 1);
  return tail.includes('=');
}

function lineOf(src, index) {
  return src.slice(0, index).split('\n').length;
}

function unguardedWrites(absPath, label) {
  const src = readFileSync(absPath, 'utf8');
  const stripped = stripComments(src);
  const re = writeCallRegex();
  const offenders = [];
  let m;
  while ((m = re.exec(stripped)) !== null) {
    if (!isGuarded(stripped, m.index)) {
      offenders.push(`${label}:${lineOf(src, m.index)}  ${src.slice(m.index, m.index + 60).split('\n')[0].trim()}`);
    }
  }
  return offenders;
}

describe('NF-2 — every Supabase write captures its { error } (no silent corruption)', () => {
  it('public/app.js has no bare/unguarded Supabase write', () => {
    const offenders = unguardedWrites(new URL('../public/app.js', import.meta.url), 'app.js');
    expect(offenders, `Unguarded Supabase write(s) — capture { error } (or route through a guarded tdb* helper):\n${offenders.join('\n')}`).toEqual([]);
  });

  it('public/checkin.html has no bare/unguarded Supabase write', () => {
    const offenders = unguardedWrites(new URL('../public/checkin.html', import.meta.url), 'checkin.html');
    expect(offenders, `Unguarded Supabase write(s):\n${offenders.join('\n')}`).toEqual([]);
  });

  it('detects a bare write (heuristic self-check — proves the guard can actually fail)', () => {
    const sample = "async function x(){ await supabaseClient.from('t').update({a:1}).eq('id', 9); }";
    const offenders = [];
    const re = writeCallRegex();
    let m;
    while ((m = re.exec(sample)) !== null) {
      if (!isGuarded(sample, m.index)) offenders.push(m.index);
    }
    expect(offenders.length).toBe(1);
    // And the guarded form is NOT flagged:
    const ok = "async function x(){ const { error } = await supabaseClient.from('t').update({a:1}).eq('id', 9); }";
    const re2 = writeCallRegex();
    const m2 = re2.exec(ok);
    expect(isGuarded(ok, m2.index)).toBe(true);
  });
});
