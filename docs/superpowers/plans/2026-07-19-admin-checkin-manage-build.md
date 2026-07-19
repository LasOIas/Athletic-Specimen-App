# Admin Manage Check-in Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Manage → Check-in page where an admin taps a name to check a player in or out instantly (with UNDO), filtered by All / In / Out, with roster search and add-and-check-in — available every day, no pickup-day gate.

**Architecture:** One new `manageView === 'checkin'` page on the existing Manage container-swap machinery (`manageContainerHTML`/`repaintManage`), a pure TDD view model in `public/pure.js`, and delegated handlers that reuse the kiosk's exact optimistic `check_in`/`check_out` RPC + outbox write path (C21 single-source). No schema change, no new RPCs.

**Tech Stack:** Vanilla JS SPA (`public/app.js` ~11.5k lines), `public/pure.js` (pure helpers, vitest-covered), `public/styles.css`, Supabase RPCs, vitest.

**Spec:** `docs/superpowers/specs/2026-07-19-admin-checkin-manage-design.md` (Mike-approved). Read it first.

## Global Constraints

- Copy: NO em dashes in player-facing strings (canon AS-copy-no-em-dash); label·value pairs use the middot; NO emojis anywhere; plain English; never "tonight/night".
- NO neon/glow (§51): only existing tokens from `public/styles.css:6-53`.
- Skill ratings NEVER render on this page (admin doesn't need them to check people in).
- Attendance writes ONLY via `rpc('check_in')`/`rpc('check_out')`/`rpc('register_player', {p_checked_in:true})` + `outboxEnqueue` — NEVER a direct `checked_in` column write (C21, app.js:7406 comment).
- `partialRender()` for background syncs; the new page adds its own no-clobber exception (Task 2).
- `node --check public/app.js` after every app.js edit; full `npx vitest run` green before each commit.
- APP_VERSION (`public/app.js` ~line 22): Task 2 sets `'2026.07.19.1'`, Task 3 sets `'2026.07.19.2'`. Format `YYYY.MM.DD.N`.
- §38 gate: before each commit cycle that edits `public/app.js` / `public/styles.css`, run (from the repo root):
  `node "C:/Users/OlasM/.claude/hooks/ui38-mark.mjs" --decision=3-options-shown --reason="Admin check-in round: Mike picked C-into-Manage + All/In/Out filters (approved design d73f26e)" public/app.js public/styles.css`
- Builder COMMITS but never pushes (§21 — the controller reviews and pushes).
- Commit messages: plain, no emoji, no AI trailers of any kind.

---

### Task 1: Pure view model `checkinConsoleModel` (TDD)

**Files:**
- Modify: `public/pure.js` (add the function alongside the existing pure helpers; FIRST grep `checkinHeroModel` in `public/pure.js` and in `test/` to copy the exact export + import pattern this project uses, and match it)
- Create: `test/checkin-console.test.js`

**Interfaces:**
- Consumes: nothing (pure).
- Produces: `checkinConsoleModel(rows, filter, query)` → `{ counts: {in, out, total}, sections: [{ id: 'in'|'out', label: string|null, rows: row[] }], showAdd: boolean }` where `rows` items are `{ key, id, name, group, checkedIn }`. Task 2 calls it with exactly this shape.

- [ ] **Step 1: Write the failing tests**

```js
// test/checkin-console.test.js
// Mirror the import style of the existing pure.js test files (grep test/ for how they require/import pure.js).
import { describe, it, expect } from 'vitest';
// import { checkinConsoleModel } from '../public/pure.js';  // <-- match the real pattern

const R = (name, checkedIn, group) => ({ key: 'id:' + name, id: name, name, group: group || '', checkedIn: !!checkedIn });
const roster = [
  R('Drew Lane', false), R('Aaron Bell', true), R('amara diaz', true),
  R('Ben Fisher', false), R('Cam Holt', false, 'Guests'),
];

describe('checkinConsoleModel', () => {
  it('counts in/out/total over the full roster', () => {
    const m = checkinConsoleModel(roster, 'all', '');
    expect(m.counts).toEqual({ in: 2, out: 3, total: 5 });
  });
  it('all filter: out section first, then in, labels set', () => {
    const m = checkinConsoleModel(roster, 'all', '');
    expect(m.sections.map((s) => s.id)).toEqual(['out', 'in']);
    expect(m.sections[0].label).toBe('Still out');
    expect(m.sections[1].label).toBe('Checked in');
  });
  it('sections sort A-Z case-insensitively', () => {
    const m = checkinConsoleModel(roster, 'all', '');
    expect(m.sections[0].rows.map((r) => r.name)).toEqual(['Ben Fisher', 'Cam Holt', 'Drew Lane']);
    expect(m.sections[1].rows.map((r) => r.name)).toEqual(['Aaron Bell', 'amara diaz']);
  });
  it('in filter: one unlabeled section of checked-in rows only', () => {
    const m = checkinConsoleModel(roster, 'in', '');
    expect(m.sections.length).toBe(1);
    expect(m.sections[0].label).toBeNull();
    expect(m.sections[0].rows.every((r) => r.checkedIn)).toBe(true);
  });
  it('out filter: one unlabeled section of out rows only', () => {
    const m = checkinConsoleModel(roster, 'out', '');
    expect(m.sections.length).toBe(1);
    expect(m.sections[0].rows.every((r) => !r.checkedIn)).toBe(true);
  });
  it('query narrows rows case-insensitively but counts stay global', () => {
    const m = checkinConsoleModel(roster, 'all', 'aM');
    expect(m.sections[0].rows.map((r) => r.name)).toEqual(['Cam Holt']);
    expect(m.sections[1].rows.map((r) => r.name)).toEqual(['amara diaz']);
    expect(m.counts.total).toBe(5);
  });
  it('query composes with the in filter', () => {
    const m = checkinConsoleModel(roster, 'in', 'bell');
    expect(m.sections[0].rows.map((r) => r.name)).toEqual(['Aaron Bell']);
  });
  it('showAdd is false with an empty query', () => {
    expect(checkinConsoleModel(roster, 'all', '  ').showAdd).toBe(false);
  });
  it('showAdd is true for a miss', () => {
    expect(checkinConsoleModel(roster, 'all', 'Zoe Park').showAdd).toBe(true);
  });
  it('showAdd is false on an exact case-insensitive match even under a filter that hides the row', () => {
    expect(checkinConsoleModel(roster, 'in', 'ben fisher').showAdd).toBe(false);
  });
  it('empty roster: zero counts, empty sections, no add without a query', () => {
    const m = checkinConsoleModel([], 'all', '');
    expect(m.counts).toEqual({ in: 0, out: 0, total: 0 });
    expect(m.sections[0].rows).toEqual([]);
    expect(m.showAdd).toBe(false);
  });
  it('ignores malformed rows', () => {
    const m = checkinConsoleModel([null, {}, R('Aaron Bell', true)], 'all', '');
    expect(m.counts.total).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/checkin-console.test.js`
Expected: FAIL — `checkinConsoleModel is not defined` (or import error). If it fails for a DIFFERENT reason (bad import pattern), fix the import to match the project pattern first.

- [ ] **Step 3: Implement in `public/pure.js`**

```js
// Manage -> Check-in view model (2026-07-19 spec). rows: [{key,id,name,group,checkedIn}].
// filter: 'all'|'in'|'out'. Sorting + substring narrowing live HERE; counts are always
// global (the UI labels read "Still out · counts.out" even mid-search). showAdd checks the
// FULL roster (not the filtered slice) so an exact name never re-registers.
function checkinConsoleModel(rows, filter, query) {
  const list = Array.isArray(rows) ? rows.filter((r) => r && typeof r.name === 'string') : [];
  const norm = (s) => String(s || '').trim().toLowerCase();
  const q = norm(query);
  const inRows = list.filter((r) => r.checkedIn);
  const outRows = list.filter((r) => !r.checkedIn);
  const counts = { in: inRows.length, out: outRows.length, total: list.length };
  const byName = (a, b) => norm(a.name).localeCompare(norm(b.name));
  const narrowed = (rs) => rs.filter((r) => !q || norm(r.name).includes(q)).sort(byName);
  const sections = filter === 'in'
    ? [{ id: 'in', label: null, rows: narrowed(inRows) }]
    : filter === 'out'
      ? [{ id: 'out', label: null, rows: narrowed(outRows) }]
      : [
        { id: 'out', label: 'Still out', rows: narrowed(outRows) },
        { id: 'in', label: 'Checked in', rows: narrowed(inRows) },
      ];
  const showAdd = !!q && !list.some((r) => norm(r.name) === q);
  return { counts, sections, showAdd };
}
```
Export it exactly the way `checkinHeroModel` is exported.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run` (the FULL suite)
Expected: baseline 504 + 12 new = 516 passing, 0 failing.

- [ ] **Step 5: Commit**

```bash
git add public/pure.js test/checkin-console.test.js
git commit -m "feat(manage): checkinConsoleModel pure view model (TDD) for the Check-in page"
```

---

### Task 2: The Check-in page (builder, handlers, repaint guard, hub row, CSS)

**Files:**
- Modify: `public/app.js` — module vars near :6745, dispatcher :7010-7019, hub `buildManagePageHTML` (~:6850-6900), delegation block before the generic `data-mg-area` handler (pattern :9965, generic at :10126), `partialRender` Manage ladder after :1009-1016, new functions near `buildManagePlayersHTML` (:7362)
- Modify: `public/styles.css` — new `.mgck-*` block after the `.mgp-*` block (~:2266)

**Interfaces:**
- Consumes: `checkinConsoleModel` (Task 1 shape), `playerIdentityKey`, `checkInPlayer` (:1537), `checkOutPlayer` (:1545), `highlightMatch` (:5801), `escapeHTML`/`escapeHTMLText`, `normalize`, `isValidFullName`, `outboxEnqueue`, `queueSupabaseRefresh`, `saveLocal`, `repaintManage` (:7022), `PK_BACK_SVG`, `CLUB_GROUP`, `MG_CHEV`.
- Produces: `buildManageCheckinHTML()` (dispatcher), `mgckToggleByKey(key, dir, opts)` (used by UNDO), module vars `mgckFilter/mgckQ/mgckLast`.

- [ ] **Step 1: Re-arm the §38 marker** (HEAD moved since the last mark)

Run from repo root: the ui38-mark command in Global Constraints. Expected: `[ui38-mark] §38 marker written…`.

- [ ] **Step 2: Module state + dispatcher + entry reset**

Near `let manageView = 'lead';` (:6745) add:

```js
// Manage -> Check-in (2026-07-19 spec): chip filter, live search text, last toggle for UNDO.
// mgckLast survives background container repaints (module scope); all three reset on page entry.
let mgckFilter = 'all';
let mgckQ = '';
let mgckLast = null; // { key, name, dir: 'in'|'out' }
```

In `manageContainerHTML()` (:7010) add ABOVE the `'players'` line:

```js
  if (manageView === 'checkin') return buildManageCheckinHTML();
```

In the generic `data-mg-area` handler (:10126-10128), after `nextArea` is read, add:

```js
        if (nextArea === 'checkin') { mgckFilter = 'all'; mgckQ = ''; mgckLast = null; }
```

- [ ] **Step 3: Page builders (app.js, place next to `buildManagePlayersHTML`)**

```js
// Manage -> Check-in (2026-07-19 spec, Mike-approved d73f26e): tap a name to toggle attendance,
// All/In/Out chips, UNDO strip, search + add-and-check-in. NO day gate — works whether or not a
// pickup day exists. Rows reuse the ckx kiosk kit; writes reuse the kiosk RPC+outbox path (C21).
// Skill NEVER renders here.
function mgckRows() {
  const inSet = new Set(state.checkedIn || []);
  return (state.players || []).map((p) => ({
    key: playerIdentityKey(p),
    id: p.id,
    name: p.name,
    group: MGCK_GROUP_OF(p), // Step 3a: mirror buildMgpListHTML's grp derivation EXACTLY
    checkedIn: inSet.has(playerIdentityKey(p)),
  }));
}

function mgckMetaHTML(model) {
  return `<span class="mgck-m"><b>${model.counts.in}</b> checked in</span>`
    + `<span class="mgck-m"><b>${model.counts.total}</b> ${model.counts.total === 1 ? 'player' : 'players'}</span>`;
}

function mgckStripHTML() {
  if (!mgckLast) return '';
  const verb = mgckLast.dir === 'in' ? 'checked in' : 'checked out';
  return `<span class="mgck-st">${escapeHTML(mgckLast.name)} ${verb}</span>`
    + `<button type="button" data-mgck-undo>UNDO</button>`;
}

function mgckListHTML(model) {
  if (!state.loaded) return '<div class="mgck-empty">Loading roster&hellip;</div>';
  if (!model.counts.total && !(mgckQ || '').trim()) {
    return '<div class="mgck-empty">No players on the roster yet.</div>';
  }
  const row = (r) => {
    const gp = r.group ? `<span class="ckx-gp">${escapeHTML(r.group)}</span>` : '';
    const tag = r.checkedIn ? 'IN' : 'CHECK IN';
    return `<button class="ckx-row${r.checkedIn ? ' is-in' : ''}" type="button" data-mgck-id="${escapeHTMLText(r.key)}">`
      + `<span class="ckx-nm">${highlightMatch(r.name, mgckQ)}${gp}</span>`
      + `<span class="ckx-go">${tag}</span></button>`;
  };
  const emptyLine = (id) => id === 'in'
    ? '<div class="mgck-empty">Nobody is checked in yet.</div>'
    : '<div class="mgck-empty">Everyone is in.</div>';
  const sect = (s) => {
    const head = s.label ? `<div class="mgck-sect">${s.label} &middot; ${s.id === 'in' ? model.counts.in : model.counts.out}</div>` : '';
    const body = s.rows.length ? s.rows.map(row).join('')
      : ((mgckQ || '').trim() ? '' : emptyLine(s.id));
    return head + body;
  };
  const add = (model.showAdd && state.loaded)
    ? `<button type="button" class="mgp-add" data-mgck-add="${escapeHTMLText((mgckQ || '').trim())}">`
      + `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`
      + `Add &ldquo;${escapeHTML((mgckQ || '').trim())}&rdquo; to the roster</button>`
      + `<p class="mgck-msg" id="mgck-msg" role="status" aria-live="polite"></p>`
    : '';
  return model.sections.map(sect).join('') + add;
}

function buildManageCheckinHTML() {
  const model = checkinConsoleModel(mgckRows(), mgckFilter, mgckQ);
  const chip = (val, label) =>
    `<button type="button" class="pl-tab${mgckFilter === val ? ' pl-on' : ''}" data-mgck-filter="${val}"${mgckFilter === val ? ' aria-current="true"' : ''}>${label}</button>`;
  return `<div class="pd-pagehdr">
      <button type="button" class="pd-back" data-mg-area="lead" aria-label="Back to Manage">${PK_BACK_SVG}</button>
      <div class="pd-htitle">Check-in</div>
    </div>
    <div class="mgck-meta" id="mgck-meta">${mgckMetaHTML(model)}</div>
    <div class="pl-tabs">${chip('all', 'All')}${chip('in', 'In')}${chip('out', 'Out')}</div>
    <div class="cik-search mgck-srch">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
      <input id="mgck-search" type="text" placeholder="Search the roster" autocapitalize="words" autocomplete="off" spellcheck="false" aria-label="Search the roster" value="${escapeHTMLText(mgckQ)}" />
    </div>
    <div class="mgck-strip" id="mgck-strip"${mgckLast ? '' : ' hidden'}>${mgckStripHTML()}</div>
    <div id="mgck-list">${mgckListHTML(model)}</div>`;
}
```

**Step 3a:** open `buildMgpListHTML` (~app.js:7315-7335), find how it derives the row's group text (`grp`), and replace `MGCK_GROUP_OF(p)` with that SAME expression (or extract the existing logic into a tiny shared helper and use it in BOTH places — do not fork the logic).

- [ ] **Step 4: Targeted repaint + toggle + add handlers (app.js, same region)**

```js
// Targeted swaps only (list/meta/strip) with scroll preservation — a toggle mid-scroll must not
// jump the list (F6 pattern). Falls back to a full Manage container swap if the page is not mounted.
function mgckRepaint() {
  const listEl = document.getElementById('mgck-list');
  if (!listEl || manageView !== 'checkin') { repaintManage(); return; }
  const panel = document.getElementById('tab-manage');
  const saved = panel ? panel.scrollTop : 0;
  const model = checkinConsoleModel(mgckRows(), mgckFilter, mgckQ);
  listEl.innerHTML = mgckListHTML(model);
  const metaEl = document.getElementById('mgck-meta');
  if (metaEl) metaEl.innerHTML = mgckMetaHTML(model);
  const stripEl = document.getElementById('mgck-strip');
  if (stripEl) { stripEl.innerHTML = mgckStripHTML(); stripEl.hidden = !mgckLast; }
  if (panel) panel.scrollTop = saved;
}

// The kiosk's optimistic + RPC + outbox contract, addressed by identity key (C21 single-source).
function mgckToggleByKey(key, dir, opts) {
  const player = (state.players || []).find((p) => playerIdentityKey(p) === key);
  if (!player) return;
  if (dir === 'in') {
    if (checkInPlayer(player) && supabaseClient && player.id) {
      (async () => {
        try {
          const { error } = await supabaseClient.rpc('check_in', { p_id: player.id });
          if (error) throw error;
          queueSupabaseRefresh();
        } catch (err) {
          console.error('mgck check_in error', err);
          outboxEnqueue({ key: 'att:' + player.id, kind: 'check_in', payload: { p_id: player.id }, ts: Date.now() });
        }
      })();
    }
  } else {
    if (checkOutPlayer(player) && supabaseClient && player.id) {
      (async () => {
        try {
          const { error } = await supabaseClient.rpc('check_out', { p_id: player.id });
          if (error) throw error;
          queueSupabaseRefresh();
        } catch (err) {
          console.error('mgck check_out error', err);
          outboxEnqueue({ key: 'att:' + player.id, kind: 'check_out', payload: { p_id: player.id }, ts: Date.now() });
        }
      })();
    }
  }
  mgckLast = (opts && opts.silent) ? null : { key, name: player.name, dir };
  saveLocal();
  mgckRepaint();
}

function mgckToggleRow(key) {
  const inSet = new Set(state.checkedIn || []);
  mgckToggleByKey(key, inSet.has(key) ? 'out' : 'in');
}

// Add-and-check-in: the kiosk Wave-1d atomic register path, admin voice. Mirrors app.js:10424-10503.
async function mgckAddAndCheckIn(name) {
  const msg = (t) => { const el = document.getElementById('mgck-msg'); if (el) el.textContent = t; };
  const trimmed = String(name || '').trim();
  if (!trimmed) return;
  if (!state.loaded) { msg('Still loading. One second, then tap again.'); return; }
  if (!isValidFullName(trimmed)) { msg('Enter a first and last name'); return; }
  const exists = state.players.find((p) => normalize(p.name) === normalize(trimmed));
  if (exists) { mgckToggleByKey(playerIdentityKey(exists), 'in'); return; }
  const inserted = { name: trimmed, skill: 0.0, group: CLUB_GROUP, groups: [CLUB_GROUP], pending: true };
  state.players = [...state.players, inserted];
  checkInPlayer(inserted);
  mgckLast = { key: playerIdentityKey(inserted), name: trimmed, dir: 'in' };
  mgckQ = '';
  const searchEl = document.getElementById('mgck-search');
  if (searchEl) searchEl.value = '';
  saveLocal();
  mgckRepaint();
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient.rpc('register_player', { p_name: trimmed, p_group: CLUB_GROUP, p_checked_in: true });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (row && row.id) inserted.id = row.id;
      if (inserted.id) inserted.pending = false;
      queueSupabaseRefresh();
    } catch (err) {
      console.error('mgck register error', err);
      inserted.pending = true;
      outboxEnqueue({ key: 'reg:' + normalize(trimmed) + ':' + CLUB_GROUP, kind: 'register', payload: { name: trimmed, group: CLUB_GROUP, checked_in: true }, ts: Date.now() });
    }
    saveLocal();
    mgckRepaint();
  }
}
```

In the Manage click delegate, add BEFORE the `if (manageView === 'teams')` block (i.e., right after the `'players'` block ending at :9990), following the same shape:

```js
      // Check-in page (2026-07-19 spec): chip switch is a full container repaint (focus moves with the
      // tap anyway); row toggles / UNDO / add are targeted mgckRepaint swaps. Checked BEFORE the generic
      // data-mg-area so a row tap never falls through; the page's back button carries data-mg-area="lead".
      if (manageView === 'checkin') {
        const chip = e.target.closest('[data-mgck-filter]');
        if (chip) { mgckFilter = chip.getAttribute('data-mgck-filter') || 'all'; repaintManage(); return; }
        if (e.target.closest('[data-mgck-undo]')) {
          const last = mgckLast;
          if (last) mgckToggleByKey(last.key, last.dir === 'in' ? 'out' : 'in', { silent: true });
          return;
        }
        const addBtn = e.target.closest('[data-mgck-add]');
        if (addBtn) { void mgckAddAndCheckIn(addBtn.getAttribute('data-mgck-add')); return; }
        const ckRow = e.target.closest('[data-mgck-id]');
        if (ckRow) { mgckToggleRow(ckRow.getAttribute('data-mgck-id') || ''); return; }
      }
```

Bind the search input where the other Manage inputs bind (the delegate file region uses direct listeners after repaint — the Manage container swaps innerHTML, so use DELEGATED `input` handling: find where `#mg-player-search` gets its input listener re-bound (grep `mg-player-search` around :9882) and mirror that mechanism for `#mgck-search`):

```js
      // inside the same delegated 'input' pathway used by #mg-player-search:
      if (e.target && e.target.id === 'mgck-search') {
        mgckQ = e.target.value || '';
        const listEl = document.getElementById('mgck-list');
        if (listEl) listEl.innerHTML = mgckListHTML(checkinConsoleModel(mgckRows(), mgckFilter, mgckQ));
        const metaEl = document.getElementById('mgck-meta'); // counts are global; meta does not change on query — skip
        return;
      }
```
(If the project binds `#mg-player-search` with a direct listener re-attached per repaint instead of delegation, mirror THAT exactly for `#mgck-search` — the rule is: same mechanism as the Players search, keystroke swaps ONLY `#mgck-list`, the input element itself is never replaced.) Remove the unused `metaEl` line if the linter/`node --check` flags nothing but it reads dead — counts do not change while typing.

- [ ] **Step 5: partialRender exception (app.js, after the `'players'` exception :1009-1016)**

```js
    // Check-in page EXCEPTION (2026-07-19): live search input. Never clobber a half-typed query or
    // the caret on a background sync — bail (sync notice only) while the box is focused or non-empty.
    // Idle: the plain container repaint below is safe and keeps tags/counts live (the UNDO strip
    // survives via the mgckLast module var).
    if (manageView === 'checkin') {
      const ckSearch = document.getElementById('mgck-search');
      if (ckSearch && (document.activeElement === ckSearch || (String(ckSearch.value || '').trim() !== ''))) {
        if (syncNoticeEl) syncNoticeEl.innerHTML = buildSharedSyncNoticeHTML();
        return;
      }
    }
```

- [ ] **Step 6: Hub row (app.js `buildManagePageHTML` ~:6850-6900)**

Find the Players row emitted via the `mg-row` helper (:6865) and insert a Check-in row IMMEDIATELY ABOVE it, using the exact same helper/markup shape the hub uses (icon + label + sub + `MG_CHEV`). Icon: the nav person-check SVG (paths `M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2` + `circle cx=9.5 cy=8 r=4` + `m16.5 11 2 2 4-4`). Label: `Check-in`. Sub: `Tap names as people arrive`. Area id: `checkin`.

- [ ] **Step 7: CSS (`public/styles.css`, new block right after the `.mgp-*` block ~:2266)**

```css
/* -- Manage -> Check-in (2026-07-19 spec): chips reuse .pl-tab, search reuses .cik-search,
   rows reuse .ckx-* (the kiosk kit). Only the page-specific bits live here. -- */
.mgck-meta { display: flex; gap: 16px; align-items: center; margin: 0 0 10px; }
.mgck-m { font-size: 12px; color: var(--muted); }
.mgck-m b { color: var(--ink); font-weight: 700; }
.mgck-srch { margin-bottom: 10px; }
.mgck-strip { display: flex; align-items: center; gap: 8px; padding: 9px 12px; border: 1px solid var(--border); border-left: 3px solid var(--live); border-radius: 10px; background: var(--live-soft); font: 500 13px 'Inter', sans-serif; color: var(--live-ink); margin-bottom: 12px; }
.mgck-strip[hidden] { display: none; }
.mgck-st { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.mgck-strip button { margin-left: auto; font: 700 12px var(--font-display); letter-spacing: .05em; color: var(--accent); border: 1.5px solid var(--accent-bd); border-radius: 8px; padding: 4px 10px; background: transparent; cursor: pointer; flex: none; min-height: 0; }
.mgck-sect { display: flex; align-items: center; gap: 10px; font: 700 12.5px var(--font-display); letter-spacing: .10em; color: var(--muted); text-transform: uppercase; margin: 12px 2px 8px; }
.mgck-sect::after { content: ""; flex: 1; height: 1px; background: var(--border); }
.mgck-empty { padding: 14px 2px 6px; color: var(--muted); font-size: 13px; }
.mgck-msg { font-size: 12.5px; color: var(--danger); margin: 6px 2px 0; }
.mgck-msg:empty { display: none; }
```
Note the `min-height: 0` on the strip button — the global `button { min-height: 38px }` otherwise fattens the UNDO chip (the session-12 `.mg-sw` lesson).

- [ ] **Step 8: Bump APP_VERSION to `'2026.07.19.1'`** (app.js ~:22).

- [ ] **Step 9: Verify**

Run: `node --check public/app.js` → clean. `npx vitest run` → 516 passing.
Manual localhost smoke (dev server or file open, admin-injected the way prior sessions do it): Manage hub shows Check-in above Players → page opens → tap toggles both directions instantly, counts/meta/strip update, UNDO reverses and clears, chips filter, typing narrows + accent-bold highlight, add row appears for a miss, console 0.

- [ ] **Step 10: Commit**

```bash
git add public/app.js public/styles.css
git commit -m "feat(manage): Check-in page - tap a name to toggle, All/In/Out filters, undo strip, add-and-check-in - v2026.07.19.1"
```

---

### Task 3: Kiosk em-dash entity fixes + copy assertions + final gates

**Files:**
- Modify: `public/app.js:6509` and `public/app.js:5823`, APP_VERSION ~:22
- Modify: any test asserting those strings (grep first)

- [ ] **Step 1: Re-arm the §38 marker** (HEAD moved in Task 2 — same command as Global Constraints; the copy fix rides the same approved round).

- [ ] **Step 2: Fix the two rendered em dashes** (HTML entities the 2026-07-16 sweep's literal-glyph grep missed):

app.js:6509: `I'm new &mdash; add me` → `I'm new &middot; add me`
app.js:5823: `'<p class="cik-none">No match &mdash; tap &ldquo;I&rsquo;m new&rdquo; to add yourself.</p>'` → `'<p class="cik-none">No match. Tap &ldquo;I&rsquo;m new&rdquo; to add yourself.</p>'`

- [ ] **Step 3: Sweep for other `&mdash;`/`&ndash;` entities in player-facing strings**

Run: `grep -n "&mdash;\|&ndash;" public/app.js public/checkin.html public/pure.js`
Fix any OTHER hit that renders in player-facing prose the same way (middot for label pairs, plain sentences otherwise). Leave code comments and non-rendered strings alone. Report every hit + disposition in your final summary.

- [ ] **Step 4: Update any copy assertions**

Run: `grep -rn "I'm new" test/` and `grep -rn "No match" test/`
Update matched assertions to the new copy. Then `npx vitest run` → 516 passing (or explain any count change).

- [ ] **Step 5: Bump APP_VERSION to `'2026.07.19.2'`**, `node --check public/app.js` → clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix(copy): kiosk em-dash entities missed by the sweep (&mdash; renders too) - v2026.07.19.2"
```

---

## Controller gates after the builder returns (NOT the builder's job)

Diff review · `node --check` + full vitest re-run · §27 browser pass at 390 AND 1280 (admin-injected drive of every interaction, storm watch while typing, anon re-smoke) · push · prod pill poll · prod anon smoke · vault writebacks.
