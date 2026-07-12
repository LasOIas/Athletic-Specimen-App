// Tournament identity (spec 2026-07-11, Task 3) — locks the sign-up / name-fill validation
// helper splitFullNameParts in public/pure.js. Loaded via Node CJS require, matching the
// other suites (pure.js exposes a module.exports guard).
import { test, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { splitFullNameParts } = require('../public/pure.js');

test('accepts a normal first+last', () => {
  expect(splitFullNameParts(' Mike ', ' Olas ')).toEqual({ ok: true, first: 'Mike', last: 'Olas' });
});
test('rejects empty parts', () => {
  expect(splitFullNameParts('Mike', ' ').ok).toBe(false);
  expect(splitFullNameParts('', 'Olas').ok).toBe(false);
});
test('rejects single-character junk', () => {
  expect(splitFullNameParts('M', 'O').ok).toBe(false);
});
