// The 2026-08-24 app-wide shell layer — source-level guards for the port decisions that a verbatim copy of
// the handoff's _shared.css would have got wrong in production (recon 2026-08-24): the app header never
// scrolls, nothing emits .ph-pagehdr, the watermark is already shown (and hidden behind Manage by Mike's
// 2026-07-12 call), html/body/#app-content never scroll (.tab-panel does), and smooth scroll would animate
// every programmatic scrollTop restore. The suite has no DOM, so these are text assertions on styles.css.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');

describe('shell layer port guards', () => {
  it('ships the header grid with the sync line under the avatar', () => {
    expect(css).toContain('#app-header.pd-header > #js-sync-notice {');
    expect(css).toContain('grid-area: 2 / 2;');
  });
  it('sticky page headers target only the class prod emits', () => {
    expect(css).toContain('.pd-pagehdr {\n  position: sticky;');
    expect(css).not.toContain('.ph-pagehdr');
  });
  it('never re-shows the watermark behind Manage and never uses !important for it', () => {
    expect(css).toContain('body.pd-public-active:has(#tab-manage.active) .pd-watermark{ display: none; }');
    expect(css).not.toMatch(/\.pd-watermark[^}]*display:\s*block\s*!important/);
  });
  it('scroll manners target the real scroller and never smooth-scroll it', () => {
    expect(css).not.toMatch(/html,\s*body,\s*#app-content\s*\{/);
    expect(css).not.toContain('pd-noscroll');
    expect(css).not.toMatch(/\.tab-panel[^}]*scroll-behavior:\s*smooth/);
    expect(css).toContain('.tab-panel { scroll-padding-top: 56px; -webkit-overflow-scrolling: touch; }');
  });
  it('the reduce-motion block zeroes animation delay (a staggered page must not stay blank)', () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*\*, \*::before, \*::after \{[^}]*animation-delay: 0ms !important/);
  });
});
