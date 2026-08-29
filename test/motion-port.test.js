// Motion system port (2026-08-24 handoff). The handoff was authored for a static prototype; production
// repaints whole containers on a 15s poll. These guards pin the port decisions that keep the entrances
// from replaying on every poll and the wildcards from catching the wrong elements. No DOM in the suite,
// so: text assertions on styles.css + app.js.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
// CRLF-normalised and with /* comments */ stripped: the PORT NOTES deliberately name the wildcards and
// classes these guards ban, and a note is not a rule.
const stripCss = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
const css = stripCss(readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8'));
const mgGuardSrc = readFileSync(new URL('../public/manage.js', import.meta.url), 'utf8');
const js = (readFileSync(new URL('../public/app.js', import.meta.url), 'utf8')
  + '\n' + mgGuardSrc).replace(/\r\n/g, '\n');   // C102: the client is two files; a guard over one would pass vacuously

describe('motion CSS', () => {
  it('defines the five durations and four curves', () => {
    for (const t of ['--m-tap: 90ms', '--m-state: 140ms', '--m-elem: 200ms', '--m-surface: 300ms', '--m-cheer: 460ms',
      '--e-settle: cubic-bezier(.2, .7, .3, 1)', '--e-arrive: cubic-bezier(.16, 1, .3, 1)', '--e-leave: cubic-bezier(.4, 0, 1, 1)', '--e-press: cubic-bezier(.34, 1.4, .5, 1)']) {
      expect(css).toContain(t);
    }
  });
  it('every ENTRANCE animation is gated behind body.m-enter (poll-immune)', () => {
    // [^{}]* inside the block: a declaration block never contains a brace, and stopping at either brace
    // keeps an @media wrapper from being read as the selector of the rule inside it.
    const re = /([^{}]+)\{[^{}]*animation:\s*(m-drop|m-screen|m-cheer|m-trophy)\b/g;
    let m; let n = 0;
    while ((m = re.exec(css))) { n++; expect(m[1].trim()).toContain('body.m-enter'); }
    expect(n).toBeGreaterThanOrEqual(4);
    const rise = /([^{}]+)\{[^{}]*animation:\s*m-rise\b/g;
    while ((m = rise.exec(css))) {
      const sel = m[1].trim();
      // .mgh-pick: the Manage hub's inline tournament picker (2026-08-25 round) is a menu, not a page
      // entrance - it opens on a tap, so its rise is not gated on the navigation window.
      const ok = sel.includes('body.m-enter') || sel.includes('.m-in') || sel.includes('.popup-card') || sel.includes('.pd-reg-sheet') || sel.includes('.mgh-pick');
      expect(ok).toBe(true);
    }
  });
  it('ships no prototype wildcards that catch prod classes by accident', () => {
    for (const bad of ['[class*="-act"]', '[class*="-sheet"]', '[class*="-modal"]', '[class*="-pick"]', '[class$="-list"]', '[class*="-done"]', '[class*="-check"]']) {
      expect(css).not.toContain(bad);
    }
    expect(css).not.toMatch(/body\.no-motion[^{]*\{/);
  });
  it('the LIVE pulse is one tempo on the three real dots', () => {
    expect(css).toContain('.hm-eyebrow:not(.is-quiet) .hm-dot, .pd-bk-sl-dot, .pd-reg-dot {');
    expect(css).toContain('animation: m-pulse 1600ms ease-in-out infinite;');
  });
  it('the toasts keep their centring through the new entrance', () => {
    expect(css).toContain('@keyframes m-toast-c { from { opacity: 0; transform: translate(-50%, 14px) scale(.96); } }');
  });
});

describe('motion JS', () => {
  it('defines the guard and the explicit player, and never observes mutations', () => {
    expect(js).toContain('function mEnter()');
    expect(js).toContain('function mPlay(el, cls, ms)');
    const block = js.slice(js.indexOf('function mReduced()'), js.indexOf('function mPlay(el, cls, ms)') + 600);
    expect(block).not.toContain('MutationObserver');
  });
  it('real navigation sets the entrance window; background repaints never do', () => {
    const activate = js.slice(js.indexOf('function activateMainTab(tab)'), js.indexOf('function activateMainTab(tab)') + 1400);
    expect(activate).toContain('mEnter();');
    const partial = js.slice(js.indexOf('function partialRender()'), js.indexOf('function partialRender()') + 12000);
    expect(partial).not.toContain('mEnter(');
    const partialT = js.slice(js.indexOf('function partialRenderTournament('), js.indexOf('function partialRenderTournament(') + 3000);
    expect(partialT).not.toContain('mEnter(');
  });
  it('the Tournament sub-page push is an entrance', () => {
    const i = js.indexOf("const tnBtn = e.target.closest('[data-tn-view]');");
    expect(js.slice(i, i + 2200)).toContain('mEnter();');
  });
  it('score values bump and the winner row flashes on commit', () => {
    const i = js.indexOf("const ea = document.getElementById('mgss-a'), eb = document.getElementById('mgss-b');");
    const sync = js.slice(i, i + 1200);
    expect(sync).toContain("mPlay(ea, 'm-bump', 240)");
    expect(sync).toContain("mPlay(row, 'm-flash', 440)");
  });
});
