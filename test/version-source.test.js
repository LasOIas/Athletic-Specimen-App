// NF-18 (2026-06-26) — lock the single-source version wiring so it can't silently regress to two
// hand-edited consts (the drift that ships a stale precache). app.js owns APP_VERSION; sw.js derives its
// cache version from the `?v=` registration param. This test fails if anyone reintroduces a hardcoded
// SW version or breaks the param derivation.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const appJs = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const swJs = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

describe('NF-18 — single source of truth for the version', () => {
  it('app.js declares APP_VERSION as a YYYY.MM.DD.N literal', () => {
    expect(appJs).toMatch(/const APP_VERSION = '20\d\d\.\d\d\.\d\d\.\d+'/);
  });

  it('app.js registers the SW with the version as a ?v= param', () => {
    expect(appJs).toMatch(/serviceWorker\.register\(`\/sw\.js\?v=\$\{encodeURIComponent\(APP_VERSION\)\}`/);
  });

  it('sw.js derives its cache version from the ?v= param, not a hardcoded literal', () => {
    expect(swJs).toMatch(/searchParams\.get\('v'\)/);
    // No second hand-edited dated version const (the drift source NF-18 removed).
    expect(swJs).not.toMatch(/SW_VERSION\s*=\s*'20\d\d\.\d\d\.\d\d/);
  });
});
