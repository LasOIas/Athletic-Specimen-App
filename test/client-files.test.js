// C102 (2026-08-26): the client is three classic scripts sharing one global record. These guards pin the
// three facts that keep that safe and that nothing else in the suite would notice breaking:
// 1. every script a precached HTML entry point loads is itself precached by the service worker (an unlisted file is served
//    cache-first by sw.js and never enters the cache, so the app half-boots offline and never self-heals);
// 2. manage.js is declarations-only (it loads before app.js, whose init() reaches into it synchronously);
// 3. no top-level name is declared in both files (a let/const twin is a load-time SyntaxError that kills the
//    whole second script while node --check passes; a function twin is legal and silently wins).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../public/' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const html = read('index.html');
const checkin = read('checkin.html');   // the OTHER precached entry point (final review M6-1)
const sw = read('sw.js');
const app = read('app.js');
const manage = read('manage.js');

// --- the initializer census (guard 2, second half) -------------------------------------------------------
// Read one top-level initializer, from the character after its `=` to the `;` that ENDS it at bracket depth
// 0, spanning as many lines as it takes. Strings, templates and comments are skipped so a `;` inside one
// cannot end the read early. The single-line `m`-flagged regex this replaces could not cross a newline, so
// it silently skipped every multi-line initializer, and manage.js has two: :510 MGH_STAGE_CHIP (an object of
// [label, isWarning] pairs) and :2092 MGES_FIELD_IDS (an id array). Both are reached now, and both are
// frozen data. If an initializer is ever unterminated this runs to end of file and the value is rejected,
// which is a false RED, never a false green.
const readInit = (src, from) => {
  let i = from, depth = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; }
    if (c === "'" || c === '"' || c === '`') { const q = c; i++; while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; } i++; continue; }
    if (c === '(' || c === '[' || c === '{') { depth++; i++; continue; }
    if (c === ')' || c === ']' || c === '}') { depth--; i++; continue; }
    if (c === ';' && depth === 0) return src.slice(from, i);
    i++;
  }
  return src.slice(from);
};
// Split a list body on the commas at depth 0, keeping quoted text whole. A trailing comma leaves an empty
// tail, which is dropped.
const splitTop = (s) => {
  const parts = []; let buf = '', d = 0, i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "'" || c === '"' || c === '`') { const q = c; let j = i + 1; while (j < s.length && s[j] !== q) { if (s[j] === '\\') j++; j++; } buf += s.slice(i, j + 1); i = j + 1; continue; }
    if (c === '(' || c === '[' || c === '{') d++; else if (c === ')' || c === ']' || c === '}') d--;
    if (c === ',' && d === 0) { parts.push(buf); buf = ''; i++; continue; }
    buf += c; i++;
  }
  parts.push(buf);
  return parts.map((p) => p.trim()).filter((p) => p !== '');
};
// Split one object entry at its `key:` colon. Returns null for a shorthand or a spread, both of which read a
// binding and so must be rejected.
const entryParts = (e) => {
  let i = 0;
  while (i < e.length) {
    const c = e[i];
    if (c === "'" || c === '"') { const q = c; i++; while (i < e.length && e[i] !== q) { if (e[i] === '\\') i++; i++; } i++; continue; }
    if (c === ':') return [e.slice(0, i).trim(), e.slice(i + 1).trim()];
    i++;
  }
  return null;
};
// One whole literal and nothing else: a quoted string (a backtick one may carry no `$` at all, so no
// interpolation), a number, a boolean, null or undefined. Anchored, so `'a' + appVar` and `'a'.trim()` fail.
const SCALAR = /^(?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`[^`$\\]*`|-?\d+(?:\.\d+)?|true|false|null|undefined)$/;
const KEY = /^(?:[A-Za-z_$][\w$]*|'[^'\\]*'|"[^"\\]*"|\d+)$/;   // a computed [k] key reads a binding: rejected
// The only initializers manage.js may carry: frozen data that reads NOTHING. A bare identifier other than
// undefined, a call, an arrow, a `${...}`, or a `+` outside a quoted string all fail at every nesting level,
// because a composite is literal only when each of its parts is.
const isLiteral = (v) => {
  const t = v.trim();
  if (t.includes('${')) return false;
  if (SCALAR.test(t)) return true;
  if (t === 'new Set()' || t === 'new Map()') return true;
  if (t.startsWith('[') && t.endsWith(']')) return splitTop(t.slice(1, -1)).every(isLiteral);
  if (t.startsWith('{') && t.endsWith('}')) return splitTop(t.slice(1, -1)).every((e) => {
    const kv = entryParts(e);
    return kv !== null && KEY.test(kv[0]) && isLiteral(kv[1]);
  });
  return false;
};

describe('client files', () => {
  it('every local script the precached HTML entry points load is in the service worker precache list', () => {
    // src may sit anywhere in the tag and use either quote; the captured path stops at any `?`, so a
    // versioned src is still checked against ASSETS by its plain path. A protocol-relative `//host/x.js` is
    // NOT ours and is excluded, alongside the absolute CDN tags.
    const localScripts = (src) => [...src.matchAll(/<script\b[^>]*\bsrc=["'](\/(?!\/)[^"'>?]*)[^"'>]*["']/g)].map((m) => m[1]);
    const scripts = localScripts(html);
    expect(scripts).toContain('/manage.js');
    expect(scripts.indexOf('/manage.js')).toBeLessThan(scripts.indexOf('/app.js'));   // the load order
    expect(scripts.indexOf('/pure.js')).toBeLessThan(scripts.indexOf('/manage.js'));
    // ASSETS is read as TEXT, from `const ASSETS = [` to the next `];`. A second array introduced before
    // that closer would widen the slice; acceptable for a 24-line file, noted so an editor of sw.js knows.
    const assets = sw.slice(sw.indexOf('const ASSETS = ['), sw.indexOf('];', sw.indexOf('const ASSETS = [')));
    // Final review M6-1: checkin.html is a precached entry point of its own, so it gets the same check.
    // No live gap today (it loads only /supabase-config.js and /pure.js, both already in ASSETS, and it
    // loads neither manage.js nor app.js) - but a script added to it later reproduces exactly the bug
    // this guard was written to prevent. The three ordering assertions above stay index.html's alone.
    for (const [name, src] of [['index.html', html], ['checkin.html', checkin]]) {
      for (const s of localScripts(src)) {
        expect(assets, s + ' is loaded by ' + name + ' but not precached').toContain("'" + s + "'");
      }
    }
  });

  it('manage.js is declarations only at depth 0', () => {
    const lines = manage.split('\n');
    let depth = 0; const bad = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      // The comment strip is string-blind (a `//` inside a string literal would truncate the line) and the
      // leading-backtick exemption is defensive: manage.js has zero lines starting with a backtick today.
      // Neither costs anything here, and the census below is what actually holds the rule.
      const code = l.replace(/\/\/.*$/, '');
      if (depth === 0 && l.trim() && !l.startsWith(' ') && !l.startsWith('`')
        && !/^(\/\/|\/\*|\*|(async )?function |let |const |})/.test(l)) bad.push((i + 1) + ': ' + l.slice(0, 60));
      for (const ch of code) { if (ch === '{') depth++; else if (ch === '}') depth--; }
    }
    expect(bad, 'top-level statements in manage.js (it must stay declarations-only):\n' + bad.join('\n')).toEqual([]);
    // and no initializer reaches into app.js: every top-level let/const initializer, multi-line ones
    // included, has to be frozen literal data. 63 of them today, none rejected.
    const inits = [...manage.matchAll(/^(?:let|const)\s+[A-Za-z_$][\w$]*\s*=/gm)]
      .map((m) => readInit(manage, m.index + m[0].length).trim());
    expect(inits.length).toBeGreaterThan(60);   // the census must not go quiet: 63 at the cut
    const reaching = inits.filter((v) => !isLiteral(v)).map((v) => v.replace(/\s+/g, ' ').slice(0, 80));
    expect(reaching, 'initializers in manage.js that are not frozen literals (manage.js loads FIRST, so\n'
      + 'reading an app.js binding here is a load-time crash):\n' + reaching.join('\n')).toEqual([]);
  });

  it('no top-level name is declared in both app.js and manage.js', () => {
    // `var` is included: app.js:2513 has `var BIG_MARGIN = 20;`, and a manage.js let/const twin of it is a
    // load-time SyntaxError. KNOWN GAP, recorded not fixed: only the FIRST name on a declaration line is
    // collected, so the second name of app.js:3472 `let btX = 0, btY = 0;` is invisible here. manage.js has
    // zero multi-declarator, var, class, function* and destructuring lines at depth 0, and from Task 7 every
    // vm harness runs both files in ONE context, where a real twin throws loudly.
    const names = (src) => [...src.matchAll(/^(?:async )?(?:function|let|const|var)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
    const a = new Set(names(app));
    const dup = names(manage).filter((n) => a.has(n));
    expect(dup).toEqual([]);
    expect(names(manage).length).toBeGreaterThan(250);   // the block carried 271 declarations at the cut
  });
});
