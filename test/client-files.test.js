// C102 (2026-08-26): the client is three classic scripts sharing one global record. These guards pin the
// three facts that keep that safe and that nothing else in the suite would notice breaking:
// 1. every script index.html loads is precached by the service worker (an unlisted file is served
//    cache-first by sw.js and never enters the cache, so the app half-boots offline and never self-heals);
// 2. manage.js is declarations-only (it loads before app.js, whose init() reaches into it synchronously);
// 3. no top-level name is declared in both files (a let/const twin is a load-time SyntaxError that kills the
//    whole second script while node --check passes; a function twin is legal and silently wins).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../public/' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const html = read('index.html');
const sw = read('sw.js');
const app = read('app.js');
const manage = read('manage.js');

describe('client files', () => {
  it('every local script index.html loads is in the service worker precache list', () => {
    const scripts = [...html.matchAll(/<script src="(\/[^"?]+)"/g)].map((m) => m[1]);
    expect(scripts).toContain('/manage.js');
    expect(scripts.indexOf('/manage.js')).toBeLessThan(scripts.indexOf('/app.js'));   // the load order
    expect(scripts.indexOf('/pure.js')).toBeLessThan(scripts.indexOf('/manage.js'));
    const assets = sw.slice(sw.indexOf('const ASSETS = ['), sw.indexOf('];', sw.indexOf('const ASSETS = [')));
    for (const s of scripts) expect(assets, s + ' is loaded by index.html but not precached').toContain("'" + s + "'");
  });

  it('manage.js is declarations only at depth 0', () => {
    const lines = manage.split('\n');
    let depth = 0; const bad = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const code = l.replace(/\/\/.*$/, '');
      if (depth === 0 && l.trim() && !l.startsWith(' ') && !l.startsWith('`')
        && !/^(\/\/|\/\*|\*|(async )?function |let |const |})/.test(l)) bad.push((i + 1) + ': ' + l.slice(0, 60));
      for (const ch of code) { if (ch === '{') depth++; else if (ch === '}') depth--; }
    }
    expect(bad, 'top-level statements in manage.js (it must stay declarations-only):\n' + bad.join('\n')).toEqual([]);
    // and no initializer reaches into app.js: the only non-literal shapes allowed are new Set() and undefined
    const inits = [...manage.matchAll(/^(?:let|const)\s+\w+\s*=\s*(.+?);\s*(?:\/\/.*)?$/gm)].map((m) => m[1].trim());
    // Two more literal shapes the census found in the cut, added as shapes and not as a wildcard. Both are
    // frozen data that reads nothing: an object whose every value is a string literal (manage.js:192
    // MGT_PHASE_WORD, :194 MGT_PHASE_SENTENCE, :578 MG_AREA_TITLES, :1526 MGT_SUB_TITLES) and an array of
    // string literals (manage.js:2091 MGR_FIELD_IDS). Anything with an identifier or a call on the right
    // stays banned, which is the fact this census exists to hold.
    const strObj = /^\{ *\w+: *'[^']*'(?:, *\w+: *'[^']*')* *\}$/;
    const strArr = /^\[ *'[^']*'(?:, *'[^']*')* *\]$/;
    const allowed = (v) => /^(['"`].*['"`]|-?\d+(\.\d+)?|true|false|null|undefined|\[\]|\{\}|new Set\(\)|new Map\(\))$/.test(v)
      || strObj.test(v) || strArr.test(v);
    expect(inits.filter((v) => !allowed(v))).toEqual([]);
  });

  it('no top-level name is declared in both app.js and manage.js', () => {
    const names = (src) => [...src.matchAll(/^(?:async )?(?:function|let|const)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
    const a = new Set(names(app));
    const dup = names(manage).filter((n) => a.has(n));
    expect(dup).toEqual([]);
    expect(names(manage).length).toBeGreaterThan(250);   // the block carried 271 declarations at the cut
  });
});
