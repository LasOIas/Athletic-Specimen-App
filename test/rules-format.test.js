// Rules slice (launch spec 2026-07-10): rulesToHTML renders tournaments.rules (markdown-lite text
// Mike types into admin) into the public Rules page. ESCAPE-FIRST is the contract — every line runs
// through the escapeHTMLText entity set (& < > " ') BEFORE any transform, so the column can never
// inject markup. These tests lock the exact output shape the .rl-* CSS styles against.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { rulesToHTML } = require('../public/pure.js');

describe('rulesToHTML — escape-first markdown-lite formatter (rules page)', () => {
  it('renders a "## " line as a section heading', () => {
    expect(rulesToHTML('## Scoring')).toBe(
      '<div class="rl-sect"><div class="rl-h">Scoring</div></div>'
    );
  });

  it('renders a "- " line as a dot row', () => {
    expect(rulesToHTML('- Rally scoring to 21, win by 2')).toBe(
      '<div class="rl-sect"><div class="rl-li"><span class="rl-dot"></span><span>Rally scoring to 21, win by 2</span></div></div>'
    );
  });

  it('renders a numbered "1. " line as a number row (number replaces the dot)', () => {
    expect(rulesToHTML('12. Respect the net call')).toBe(
      '<div class="rl-sect"><div class="rl-li"><span class="rl-num">12</span><span>Respect the net call</span></div></div>'
    );
  });

  it('renders any other non-empty line as a paragraph', () => {
    expect(rulesToHTML('Have fun out there.')).toBe(
      '<div class="rl-sect"><p class="rl-p">Have fun out there.</p></div>'
    );
  });

  it('escapes <script> to literal text — raw HTML NEVER passes through', () => {
    const out = rulesToHTML('- <script>alert(1)</script>');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes & and quotes in headings and rows', () => {
    const out = rulesToHTML('## Serve & "rotate"\n- It\'s 4 <on> 4');
    expect(out).toContain('<div class="rl-h">Serve &amp; &quot;rotate&quot;</div>');
    expect(out).toContain('It&#39;s 4 &lt;on&gt; 4');
  });

  it('groups blank-line separated blocks into .rl-sect sections', () => {
    const out = rulesToHTML('## Teams\n- 4 players\n\n## Scoring\n- To 21');
    expect(out.match(/<div class="rl-sect">/g)).toHaveLength(2);
    expect(out).toBe(
      '<div class="rl-sect"><div class="rl-h">Teams</div><div class="rl-li"><span class="rl-dot"></span><span>4 players</span></div></div>'
      + '<div class="rl-sect"><div class="rl-h">Scoring</div><div class="rl-li"><span class="rl-dot"></span><span>To 21</span></div></div>'
    );
  });

  it('collapses runs of blank lines and CRLF newlines without emitting empty sections', () => {
    const out = rulesToHTML('## A\r\n- one\r\n\r\n\r\n- loose');
    expect(out.match(/<div class="rl-sect">/g)).toHaveLength(2);
    expect(out).not.toContain('<div class="rl-sect"></div>');
  });

  it('returns "" for null / undefined / empty / whitespace-only input', () => {
    expect(rulesToHTML(null)).toBe('');
    expect(rulesToHTML(undefined)).toBe('');
    expect(rulesToHTML('')).toBe('');
    expect(rulesToHTML('   \n \n  ')).toBe('');
  });
});
