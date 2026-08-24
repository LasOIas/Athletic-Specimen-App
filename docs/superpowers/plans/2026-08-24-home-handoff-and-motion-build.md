# Home Handoff + Motion System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **LasOlas §38 (2026-07-18) overrides the line above for THIS project: all UI edits are Fable 5 INLINE, never dispatched.** Research and adversarial review may fan out; every edit to `public/app.js`, `public/styles.css`, `public/index.html` is made inline by the controlling session.

**Goal:** Port Mike's 2026-08-24 Claude Design HOME handoff and the app-wide MOTION system into the shipped Athletic Specimen app, pixel-faithful to the round, with every entrance animation immune to the 15-second poll.

**Architecture:** The app is a vanilla-JS SPA (`public/app.js`, template-literal render; `public/pure.js` tested helpers; `public/styles.css`, one file, no build). Design CSS lands as an APPENDED section of `styles.css` (append order gives it the win, no `!important` escalation). New behaviour lands as small named functions in `app.js` wired through the existing `#app-content` click delegate; modals are body-appended (the `openJoinSheet` precedent) so the Home `partialRender` container swap cannot destroy them. Venue data arrives via migration `0058` and is column-gated exactly like 0057.

**Tech Stack:** Vanilla JS, Supabase (PostgREST `select('*')`), vitest (vm-sandbox string assertions, no jsdom), Vercel static deploy.

**Spec:** `docs/superpowers/specs/2026-08-24-home-handoff-and-motion-design.md` (Mike's four decisions + the binding findings). Design files: `docs/design-handoffs/2026-08-24/home/` and `.../motion/`.

## Global Constraints

- `APP_VERSION` at `public/app.js:28` → `'2026.08.24.N'`, N increments on every push (starts at `.1`).
- `node --check public/app.js` after every edit to app.js.
- Commit per task; push per task (project override of §4: push-per-fix).
- `partialRender()` for background syncs; never `render()` from a poll; `mEnter()` is never called from `partialRender` / `partialRenderTournament`.
- Player-facing copy: no em dashes (the `→` arrow and the empty-value `—` glyph are value glyphs and stay).
- No neon colours (§51). Player skill ratings never on a public surface.
- 390px is the primary viewport; desktop `@media (min-width: 1024px)` must not regress.
- Tests are string assertions on builders via the vm bridge + source-level assertions for wiring (there is no DOM in the suite).
- Baseline before Task 1: **32 files / 820 tests green** (`cd test && npx vitest run`).
- Every appended CSS block starts with a banner naming the round and carries `PORT NOTE:` comments where the handoff was NOT taken verbatim (the 2026-08-03 precedent at `styles.css:3072-3089`).

---

### Task 1: Migration 0058 + venue columns in Manage → Event settings

**Files:**
- Create: `db/migrations/0058_tournament_venue.sql`
- Modify: `public/app.js:2028-2033` (column helpers), `public/app.js:8398-8399` (`MGES_FIELD_IDS`), `public/app.js:8407-8421` (`mgFieldCurrentText`), `public/app.js:8437-8470` (`mgFieldWrite`), `public/app.js:8699-8727` (`buildMgSettingsHTML`)
- Test: `test/tournament-venue.test.js` (new)

**Interfaces:**
- Produces: `tournamentHasVenue()` → boolean (true only when BOTH `venue` and `venue_address` keys are present on the loaded tournament rows). Columns `tournaments.venue`, `tournaments.venue_address` (text, nullable). Field ids `mges-venue`, `mges-venueaddr`.

- [ ] **Step 1: Write the migration**

```sql
-- 0058_tournament_venue.sql — WHERE the tournament is played (design round 2026-08-24, "Home").
--
-- WHY. Home's Details card (Mike's Claude Design handoff, 2026-08-24) leads with the venue — the park's
-- name, the line under it, and a Copy address action that puts the postal address on the clipboard.
-- Today the row reads the literal string "posted in GroupMe" (app.js hmRegistrationHTML) because
-- `tournaments` has never carried a venue, location, or address column of any kind (verified 0001
-- through 0057; the only `location` in the schema belongs to pickup_days, a different thing).
--
-- TWO COLUMNS, not one: the row shows the name on its own line ("Woodmen Valley Park") and the address
-- under it, and Copy address needs the address as a string a maps app will resolve. One free-text blob
-- would force the render path to split a sentence it cannot understand.
--
-- BOTH NULLABLE WITH NO DEFAULT, deliberately (0057's reasoning applies verbatim): every existing
-- tournament predates this migration and there is no honest venue to backfill; NULL is the truthful
-- "not set", and the render path already treats it as "keep the fallback row, render no Copy button".
--
-- NOT APPLIED. Authored only — applying is Mike's call. The app runs correctly before AND after: reads
-- go through select('*') so a missing column is simply undefined, the Event settings fields are not even
-- rendered until the loaded rows carry the keys, and the Home row falls back until then.
alter table public.tournaments add column if not exists venue text;
alter table public.tournaments add column if not exists venue_address text;

comment on column public.tournaments.venue is
  'Where it is played, as a player would say it ("Woodmen Valley Park"). NULL = not set; Home keeps its "Posted in GroupMe" row.';
comment on column public.tournaments.venue_address is
  'The line under the venue and the tail of what Copy address puts on the clipboard ("1000 Woodmen Valley Rd, Colorado Springs, CO"). NULL = venue only.';
```

- [ ] **Step 2: Write the failing tests**

`test/tournament-venue.test.js` — copy the `loadApp()` harness from `test/manage-page.test.js:11-60` verbatim (the sandbox, stubs and `vm` context), then use THIS epilogue and these cases:

```js
// Venue columns (migration 0058, design round 2026-08-24 "Home"). Column-gated exactly like 0057: the
// Event settings fields render ONLY when the loaded rows carry the keys, and the field engine writes
// them as free text (blank clears). Same vm-sandbox harness as manage-page.test.js.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function loadApp() {
  /* ... the manage-page.test.js harness, unchanged, up to `sandbox.globalThis = sandbox; sandbox.self = sandbox;` ... */
  const epilogue = `
    ;globalThis.__bridge = {
      setTournaments: (list) => { state.tournaments = list; state.activeTournamentId = list[0] ? list[0].id : null; },
      hasVenue: () => tournamentHasVenue(),
      buildSettings: () => { manageView = 'tournament'; mgtView = 'settings'; return buildMgSettingsHTML(); },
      fieldText: (id, t) => mgFieldCurrentText(id, t),
      fieldWrite: (id, raw, t) => mgFieldWrite(id, raw, t),
      settingsIds: () => MGES_FIELD_IDS.slice(),
    };`;
  const context = vm.createContext(sandbox);
  vm.runInContext(pureSrc, context, { filename: 'pure.js' });
  vm.runInContext(appSrc + epilogue, context, { filename: 'app.js' });
  return sandbox.__bridge;
}

const bridge = loadApp();
const base = { id: 't1', name: 'August 2026 Tournament', status: 'setup', registration_open: true, team_size: 4, net_count: 3, buy_in: '$80 a team' };

describe('venue columns are gated on the loaded rows (0057 pattern)', () => {
  it('reports absent when the rows carry no venue keys, and renders no venue fields', () => {
    bridge.setTournaments([{ ...base }]);
    expect(bridge.hasVenue()).toBe(false);
    const html = bridge.buildSettings();
    expect(html).not.toContain('id="mges-venue"');
    expect(html).not.toContain('id="mges-venueaddr"');
  });
  it('reports present only when BOTH keys are on the row', () => {
    bridge.setTournaments([{ ...base, venue: null }]);
    expect(bridge.hasVenue()).toBe(false);
    bridge.setTournaments([{ ...base, venue: null, venue_address: null }]);
    expect(bridge.hasVenue()).toBe(true);
  });
  it('renders Venue + Address fields prefilled and escaped once the columns exist', () => {
    bridge.setTournaments([{ ...base, venue: 'Woodmen "Valley" Park', venue_address: '1000 Woodmen Valley Rd, Colorado Springs, CO' }]);
    const html = bridge.buildSettings();
    expect(html).toContain('id="mges-venue"');
    expect(html).toContain('value="Woodmen &quot;Valley&quot; Park"');
    expect(html).toContain('id="mges-venueaddr"');
    expect(html).toContain('value="1000 Woodmen Valley Rd, Colorado Springs, CO"');
    expect(bridge.settingsIds()).toEqual(expect.arrayContaining(['mges-venue', 'mges-venueaddr']));
  });
});

describe('the field engine writes venue columns as free text', () => {
  const t = { ...base, venue: 'Woodmen Valley Park', venue_address: null };
  it('reads the current text off the row', () => {
    expect(bridge.fieldText('mges-venue', t)).toBe('Woodmen Valley Park');
    expect(bridge.fieldText('mges-venueaddr', t)).toBe('');
  });
  it('an unchanged value is not a write', () => {
    expect(bridge.fieldWrite('mges-venue', ' Woodmen Valley Park ', t)).toBeNull();
  });
  it('a new value writes the column; a blank clears it to null', () => {
    expect(bridge.fieldWrite('mges-venue', 'Washington Park', t)).toEqual({ fields: { venue: 'Washington Park' } });
    expect(bridge.fieldWrite('mges-venueaddr', '701 S Franklin St, Denver, CO', t)).toEqual({ fields: { venue_address: '701 S Franklin St, Denver, CO' } });
    expect(bridge.fieldWrite('mges-venue', '', t)).toEqual({ fields: { venue: null } });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd test && npx vitest run tournament-venue`
Expected: FAIL — `tournamentHasVenue is not defined`.

- [ ] **Step 4: Implement**

`public/app.js:2032-2033` — add after `tournamentHasTeamCap`:

```js
// Migration 0058 (design round 2026-08-24, Home Details card): venue + venue_address. Both keys must be
// present — they arrive in one migration, and a row carrying only one would mean a schema this code has
// never seen. Same contract as 0057: not rendered, not sent, not shown until the loaded rows carry them.
function tournamentHasVenue() { return tournamentColumnLoaded('venue') && tournamentColumnLoaded('venue_address'); }
```

`public/app.js:8398-8399` — extend the list (the dirty/save engine skips ids with no element, so it is safe before the fields render):

```js
const MGES_FIELD_IDS = ['mges-name', 'mges-teamsize', 'mges-nets', 'mges-pooltarget', 'mges-poolcap',
  'mges-brackettarget', 'mges-bracketcap', 'mges-buyin', 'mges-venue', 'mges-venueaddr'];
```

`mgFieldCurrentText` — add two lines before `return '';`:

```js
  if (id === 'mges-venue') return s(t.venue);
  if (id === 'mges-venueaddr') return s(t.venue_address);
```

`mgFieldWrite` — add two lines before `return null;`:

```js
  if (id === 'mges-venue') return { fields: { venue: txt || null } };            // free text; blank clears (0058)
  if (id === 'mges-venueaddr') return { fields: { venue_address: txt || null } };
```

`buildMgSettingsHTML` — after the Buy-in field and before `mgSaveBtnHTML('settings')`:

```js
    // COLUMN-GUARDED (migration 0058). The venue fields render only once the loaded rows carry both keys —
    // an input that cannot save is worse than an absent one (the 0057 rule). Home's Details card reads the
    // same two columns; until they exist it keeps its "Posted in GroupMe" row.
    + (tournamentHasVenue()
      ? `<div class="pk-fld"><label class="pk-fl" for="mges-venue">Venue</label>`
        + `<input class="pk-fv" id="mges-venue" type="text" autocomplete="off" autocapitalize="words" placeholder="Woodmen Valley Park" value="${escapeHTMLText(t.venue == null ? '' : String(t.venue))}" /></div>`
        + `<div class="pk-fld"><label class="pk-fl" for="mges-venueaddr">Address</label>`
        + `<input class="pk-fv" id="mges-venueaddr" type="text" autocomplete="off" placeholder="1000 Woodmen Valley Rd, Colorado Springs, CO" value="${escapeHTMLText(t.venue_address == null ? '' : String(t.venue_address))}" /></div>`
      : '')
```

- [ ] **Step 5: Run the tests**

Run: `node --check public/app.js && cd test && npx vitest run`
Expected: all green; `tournament-venue` 6 passing; the edit-save suite unchanged (its `dirtyIds` arrays never include unrendered ids).

- [ ] **Step 6: Bump + commit + push**

`APP_VERSION = '2026.08.24.1'`.

```bash
git add db/migrations/0058_tournament_venue.sql public/app.js test/tournament-venue.test.js docs/superpowers/specs/2026-08-24-home-handoff-and-motion-design.md docs/superpowers/plans/2026-08-24-home-handoff-and-motion-build.md docs/design-handoffs/2026-08-24
git commit -m "feat(manage): venue + address columns for the tournament (migration 0058, column-gated) - v2026.08.24.1"
git push
```

---

### Task 2: Home Details card + status colouring (markup + CSS)

**Files:**
- Modify: `public/app.js:1670-1693` (icons + `hmDetailRowHTML`), `public/app.js:1797-1838` (`hmRegistrationHTML`), `public/app.js:1870-1875` (extract `publicHomeRegTournament`)
- Modify: `public/styles.css:3043` (`:last-of-type` → `:last-child`), append the Home round block
- Test: `test/home-details-card.test.js` (new)

**Interfaces:**
- Consumes: `tournamentHasVenue()` (Task 1), `rulesToHTML(text)` (pure.js), `registerEventModel(reg, teams)` (pure.js), `escapeHTML`, `escapeHTMLText`.
- Produces: `publicHomeRegTournament()` → the setup row Home renders (or null); `hmDetailRowHTML(icon, fact, sub, actionHTML)`; `hmCopyButtonHTML(payload)`; `hmRulesButtonHTML()`; `hmVenueRowHTML(reg)`. Markup hooks `[data-hm-copy]`, `[data-hm-rules]` (handlers in Task 3).

- [ ] **Step 1: Write the failing tests**

`test/home-details-card.test.js` — same harness as Task 2's test (copy `loadApp()` from `test/manage-page.test.js:11-60`), epilogue:

```js
  const epilogue = `
    ;globalThis.__bridge = {
      setTournaments: (list) => { state.tournaments = list; state.activeTournamentId = null; },
      home: () => publicHomeHTML(),
      regTournament: () => publicHomeRegTournament(),
      rulesModal: (t) => hmRulesModalHTML(t),
      register: () => buildRegisterPageHTML(),
    };`;
```

Cases:

```js
const bridge = loadApp();
const reg = { id: 't1', name: 'August 2026 Tournament', status: 'setup', registration_open: true, team_size: 4, net_count: 3, buy_in: '$80 a team', rules: '## The basics\n- 4s co-ed' };
const noRules = { ...reg, rules: '' };
const withVenue = { ...reg, venue: 'Woodmen Valley Park', venue_address: '1000 Woodmen Valley Rd, Colorado Springs, CO' };

describe('Home Details card (design round 2026-08-24)', () => {
  it('boxes the three rows in .hmv-dcard with one head and no bare DETAILS label', () => {
    bridge.setTournaments([reg]);
    const html = bridge.home();
    expect(html).toContain('<div class="hmv-dcard"><div class="hmv-dhead"><span>Details</span></div>');
    expect(html).not.toContain('<div class="hm-sect">Details</div>');
    expect(html.match(/class="hm-detail"/g)).toHaveLength(3);
    expect(html.match(/class="hmv-dico"/g)).toHaveLength(3);
    expect(html.match(/class="hmv-dtx"/g)).toHaveLength(3);
  });
  it('splits each row into an ink fact and a muted qualifier', () => {
    bridge.setTournaments([reg]);
    const html = bridge.home();
    expect(html).toContain('<b>4 per team, co-ed</b><span>at least 1 guy + 1 girl</span>');
    expect(html).toContain('<b>Pool play → double-elim bracket</b><span>win by 2</span>');
  });
  it('colours only the state word of the registration divider', () => {
    bridge.setTournaments([reg]);
    expect(bridge.home()).toContain('<div class="hm-status"><span>Registration <b>open</b></span></div>');
    bridge.setTournaments([{ ...reg, registration_open: false }]);
    const closed = bridge.home();
    expect(closed).toContain('<div class="hm-status is-closed"><span>Registration <b>closed</b></span></div>');
    expect(closed).not.toContain('hm-cta');
  });
});

describe('the venue row', () => {
  it('falls back honestly when the columns are not loaded, with no Copy action', () => {
    bridge.setTournaments([reg]);
    const html = bridge.home();
    expect(html).toContain('<b>Location</b><span>Posted in GroupMe</span>');
    expect(html).not.toContain('data-hm-copy');
  });
  it('falls back when the columns exist but the venue is blank', () => {
    bridge.setTournaments([{ ...reg, venue: null, venue_address: null }]);
    expect(bridge.home()).toContain('<b>Location</b><span>Posted in GroupMe</span>');
  });
  it('renders the venue, its address line and an escaped clipboard payload', () => {
    bridge.setTournaments([{ ...withVenue, venue: 'Woodmen "Valley" Park' }]);
    const html = bridge.home();
    expect(html).toContain('<b>Woodmen &quot;Valley&quot; Park</b><span>1000 Woodmen Valley Rd, Colorado Springs, CO</span>');
    expect(html).toContain('data-hm-copy="Woodmen &quot;Valley&quot; Park, 1000 Woodmen Valley Rd, Colorado Springs, CO"');
    expect(html).toContain('<span class="hmv-cidle">');
    expect(html).toContain('<span class="hmv-cdone">');
    expect(html).toContain('Copy address');
    expect(html).toContain('Address copied');
  });
  it('copies the venue alone when there is no address line', () => {
    bridge.setTournaments([{ ...withVenue, venue_address: '' }]);
    const html = bridge.home();
    expect(html).toContain('data-hm-copy="Woodmen Valley Park"');
    expect(html).toContain('<b>Woodmen Valley Park</b></span>'); // no empty qualifier span
  });
});

describe('the Rules action', () => {
  it('renders on the roster row only when the tournament has rules text', () => {
    bridge.setTournaments([reg]);
    expect(bridge.home()).toContain('class="hmv-copy hmv-rules" data-hm-rules');
    bridge.setTournaments([noRules]);
    expect(bridge.home()).not.toContain('data-hm-rules');
  });
  it('never emits the modal inside the Home container (it is body-appended, poll-immune)', () => {
    bridge.setTournaments([reg]);
    expect(bridge.home()).not.toContain('hm-rules-modal');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd test && npx vitest run home-details-card`
Expected: FAIL — `publicHomeRegTournament is not defined` / `hmRulesModalHTML is not defined` (the second is defined in Task 3; leave that describe in place — it fails until Task 3).

- [ ] **Step 3: Implement the markup**

`public/app.js` after `HM_IC_FORMAT` (line ~1673), add the action icons (verbatim from `screens/public-home-registration.html:45-46`):

```js
// Details-card actions (design round 2026-08-24): clipboard / tick / rules-sheet glyphs. `.hmv-copy svg` sizes them.
const HM_IC_COPY = '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M15 6.5V5.5a2 2 0 0 0-2-2H5.5a2 2 0 0 0-2 2V13a2 2 0 0 0 2 2h1"/></svg>';
const HM_IC_TICK = '<svg viewBox="0 0 24 24"><path d="M4.5 12.5l4.5 4.5L19.5 6.5"/></svg>';
const HM_IC_RULES = '<svg viewBox="0 0 24 24"><path d="M6 3.5h9l4 4V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z"/><path d="M14.5 3.7V8h4.2"/><path d="M8.5 13h7"/><path d="M8.5 16.5h4.5"/></svg>';
```

Replace `hmDetailRowHTML` (line 1691-1693):

```js
// A Details-card row (design round 2026-08-24, "keep the style but make it its own card / it's too bland"):
// accent icon tile + the FACT in ink over its QUALIFIER in muted, + an optional right-hand text action.
// The qualifier span is omitted when empty so a venue with no address line stays a single line.
function hmDetailRowHTML(icon, fact, sub, actionHTML) {
  const subHTML = sub ? `<span>${escapeHTML(sub)}</span>` : '';
  return `<div class="hm-detail"><span class="hmv-dico">${icon}</span><span class="hmv-dtx"><b>${escapeHTML(fact)}</b>${subHTML}</span>${actionHTML || ''}</div>`;
}
// "there needs to be a way to click something to quickly copy the address" — an accent text action at the
// row's right edge; .is-done (set by hmCopyAddress for ~2s) swaps it to the green "Address copied".
function hmCopyButtonHTML(payload) {
  return `<button type="button" class="hmv-copy" data-hm-copy="${escapeHTMLText(payload)}" aria-label="Copy the address"><span class="hmv-cidle">${HM_IC_COPY}Copy address</span><span class="hmv-cdone">${HM_IC_TICK}Address copied</span></button>`;
}
// "in this box have a button for rules, that when clicked opens a pop up of the rules" — opens the shipped
// rules text in a body-appended sheet (openHomeRules). Rendered ONLY when the tournament has rules text.
function hmRulesButtonHTML() {
  return `<button type="button" class="hmv-copy hmv-rules" data-hm-rules><span class="hmv-cidle">${HM_IC_RULES}Rules</span></button>`;
}
// The venue row reads migration 0058's two columns. Until they are applied (or while unset) it keeps
// today's honest copy in the card's two-line grammar and renders NO copy action — never a fabricated address.
function hmVenueRowHTML(reg) {
  const venue = (tournamentHasVenue() && reg) ? String(reg.venue || '').trim() : '';
  if (!venue) return hmDetailRowHTML(HM_IC_PIN, 'Location', 'Posted in GroupMe', '');
  const addr = String(reg.venue_address || '').trim();
  return hmDetailRowHTML(HM_IC_PIN, venue, addr, hmCopyButtonHTML(addr ? venue + ', ' + addr : venue));
}
```

In `hmRegistrationHTML` replace the `status` line and the `rows` / return:

```js
  // Round 2026-08-22: only the STATE WORD takes colour (green open / red closed); "Registration" stays grey.
  const status = `<div class="hm-status${rm.regOpen ? '' : ' is-closed'}"><span>Registration <b>${rm.regOpen ? 'open' : 'closed'}</b></span></div>`;
```

```js
  const rulesAction = rulesToHTML(typeof reg.rules === 'string' ? reg.rules : '') ? hmRulesButtonHTML() : '';
  const rows = hmVenueRowHTML(reg)
    + hmDetailRowHTML(HM_IC_USERS, rm.teamSize + ' per team, co-ed', 'at least 1 guy + 1 girl', rulesAction)
    + hmDetailRowHTML(HM_IC_FORMAT, 'Pool play → double-elim bracket', 'win by 2', '');
  const card = `<div class="hmv-dcard"><div class="hmv-dhead"><span>Details</span></div>${rows}</div>`;
```

and the return: `` return `<div class="hm">${cluster}${card}${a2hs}</div>`; ``

Extract the reg resolver so the rules sheet (Task 3) reads the SAME row the card was built from (`buildTournamentRulesHTML` resolves by `activeTournamentId`, which is client-side and can differ):

```js
// The setup row Home shows (an upcoming tournament shows even with registration CLOSED — Mike 2026-07-10;
// prefer a registration-open row when several exist). Shared by publicHomeHTML and the Home rules sheet so
// the sheet can never open a different tournament's rules than the card it was tapped on.
function publicHomeRegTournament() {
  const setups = (state.tournaments || []).filter((x) => x.status === 'setup');
  return setups.find((x) => x.registration_open) || setups[0] || null;
}
```

and in `publicHomeHTML`: `const reg = publicHomeRegTournament();` (delete the two lines it replaces).

- [ ] **Step 4: Append the Home CSS**

`public/styles.css:3043` — change `.hm-detail:last-of-type{ border-bottom: none; }` to `.hm-detail:last-child{ border-bottom: none; }` (live bug: `.hm-a2hs` is the last sibling so `:last-of-type` never matched and the third row drew a hairline).

Append to the END of `public/styles.css`:

```css
/* ============================================================
   HOME DESIGN ROUND - 2026-08-24 (Mike's Claude Design handoff, "Home")
   Ported from the handoff's _rounds.css (blocks dated 2026-08-22). Appended so
   order alone gives it the win - no !important escalation except the ONE
   documented iOS zoom-guard counter on .hmv-copy.
   PORT NOTES: (1) every `.hmv-copy:focus` rule was dropped - the handoff reused
   .hmv-copy for the Rules button without a .hmv-cdone child, so :focus hid its
   only label; the copy confirmation is driven by .is-done alone and focus gets a
   ring. (2) prod's global button{min-height:38px} and button:active{translateY}
   are reset here - the handoff never did, so its 30px actions rendered 38px.
   ============================================================ */

/* Round 2026-08-22 — "keep the style of this but separate it from the rest of the
   page, maybe have it be its own card" + "it's too bland" (public Home · Details). */
.hmv-dcard {
  margin: 18px 0 0;
  border: 1px solid var(--border);
  border-radius: 15px;
  background: #fff;
  overflow: hidden;
}
.hmv-dhead {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 13px;
  border-bottom: 1px solid var(--border);
  background: oklch(0.975 0.003 75);
  font: 700 11.5px var(--font-display);
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--muted);
}
.hmv-dhead::after { content: ''; flex: 1; height: 1px; background: var(--border); }
.hmv-dcard .hm-detail {
  gap: 11px;
  align-items: flex-start;
  padding: 11px 13px;
  border-bottom: 1px solid var(--border);
}
.hmv-dcard .hm-detail:last-child { border-bottom: none; }
.hmv-dico {
  flex: none;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--accent-bd);
  border-radius: 9px;
  background: var(--accent-soft);
}
.hmv-dcard .hmv-dico svg { width: 16px; height: 16px; stroke: var(--accent); }
.hmv-dtx { display: grid; gap: 2px; min-width: 0; padding-top: 1px; }
.hmv-dtx b { font-size: 14px; font-weight: 600; color: var(--ink); }
.hmv-dtx > span { font-size: 12.5px; line-height: 1.4; color: var(--muted); text-wrap: pretty; }
.hmv-dcard + .hm-a2hs { margin-top: 14px; }

/* Round 2026-08-22 — "there needs to be a way to click something to quickly copy
   the address", then "it needs to say copy address" / "still have it be on the right". */
.hmv-dcard .hm-detail:has(.hmv-copy) { align-items: center; }
.hmv-copy {
  flex: none;
  margin-left: auto;
  min-width: 118px;
  min-height: 0;            /* PORT NOTE: prod button { min-height: 38px } reset */
  padding: 6px 10px;
  border: 0;
  border-radius: 9px;
  background: none;
  font: 600 12.5px 'Inter', sans-serif;
  font-size: 12.5px !important; /* production's button{font-size:16px!important} iOS zoom guard */
  line-height: 1.25;
  color: var(--brand-dark);
  cursor: pointer;
  transition: color .15s ease, background-color .15s ease, box-shadow .15s ease, opacity .15s ease;
}
@media (hover: hover) and (pointer: fine) {
  .hmv-copy:hover { color: var(--accent); background: var(--accent-soft); box-shadow: inset 0 0 0 1px var(--accent-bd); }
}
.hmv-copy:active { transform: none; opacity: .7; } /* PORT NOTE: prod button:active { translateY(1px) } reset */
.hmv-copy:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--brand-ring); }
.hmv-copy.hmv-rules { min-width: 76px; }
.hmv-cidle, .hmv-cdone { display: inline-flex; align-items: center; justify-content: flex-end; gap: 6px; width: 100%; }
.hmv-cdone { display: none; }
.hmv-copy svg {
  width: 14px;
  height: 14px;
  flex: none;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.hmv-copy.is-done {
  color: var(--live-ink);
  background: var(--live-soft);
  box-shadow: inset 0 0 0 1px oklch(0.86 0.05 150);
}
.hmv-copy.is-done .hmv-cidle { display: none; }
.hmv-copy.is-done .hmv-cdone { display: inline-flex; }

/* Round 2026-08-22 — "when it's 'open' have open be green, when 'closed' have
   closed be red" (public Home · registration status divider). */
.hm-status span b { font-weight: inherit; color: var(--live-ink); }
.hm-status.is-closed span b { color: oklch(0.52 0.17 25); }
```

- [ ] **Step 5: Run the tests**

Run: `node --check public/app.js && cd test && npx vitest run`
Expected: everything green except the two `hmRulesModalHTML` cases (Task 3). If any OTHER file fails, the failure is real — read it.

- [ ] **Step 6: Commit (no push yet — Task 3 completes the Home slice)**

```bash
git add public/app.js public/styles.css test/home-details-card.test.js
git commit -m "feat(home): Details card with icon tiles, venue row + copy action markup, open/closed state colouring"
```

---

### Task 3: Copy address + the Home rules sheet (behaviour)

**Files:**
- Modify: `public/app.js` — new functions next to `openJoinSheet` (line ~3962); the `#app-content` click delegate at `public/app.js:11384` (before `const tnBtn`)
- Modify: `public/styles.css` — append the `#hm-rules-modal` block
- Test: `test/home-details-card.test.js` (the Rules describe + source assertions)

**Interfaces:**
- Consumes: `publicHomeRegTournament()`, `rulesToHTML`, `escapeHTML`.
- Produces: `hmRulesModalHTML(t)` → the `.popup-card` markup or `''` when there are no rules; `openHomeRules()`, `closeHomeRules()`, `hmCopyAddress(btn)`.

- [ ] **Step 1: Add the failing assertions** to `test/home-details-card.test.js`:

```js
describe('the Home rules sheet builder', () => {
  it('renders the whole rules document in the popup kit with both closers and a11y wiring', () => {
    const html = bridge.rulesModal(reg);
    expect(html).toContain('<div class="popup-card card" role="dialog" aria-modal="true" aria-labelledby="hm-rules-title">');
    expect(html).toContain('<span class="hmv-reyebrow">August 2026 Tournament</span>');
    expect(html).toContain('<h3 class="hmv-rtitle" id="hm-rules-title">Rules</h3>');
    expect(html).toContain('<div class="rl-body">');
    expect(html).toContain('The basics');
    expect(html.match(/data-hm-rules-close/g)).toHaveLength(2);
    expect(html).toContain('>Got it</button>');
  });
  it('returns nothing for a tournament without rules (the action is not rendered either)', () => {
    expect(bridge.rulesModal(noRules)).toBe('');
    expect(bridge.rulesModal({ ...reg, rules: null })).toBe('');
  });
});

describe('wiring (source-level — the suite has no DOM)', () => {
  const src = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  it('the sheet is body-appended on the popup overlay, with backdrop + Escape closers', () => {
    const fn = src.slice(src.indexOf('function openHomeRules('), src.indexOf('function hmCopyAddress('));
    expect(fn).toContain("scrim.id = 'hm-rules-modal'");
    expect(fn).toContain("scrim.className = 'popup-overlay'");
    expect(fn).toContain('document.body.appendChild(scrim)');
    expect(fn).toContain('publicHomeRegTournament()');
    expect(src).toContain("if (ev.key === 'Escape') closeHomeRules();");
  });
  it('the #app-content delegate routes both actions', () => {
    expect(src).toContain("e.target.closest('[data-hm-copy]')");
    expect(src).toContain("e.target.closest('[data-hm-rules]')");
  });
  it('copy writes the attribute to the clipboard and holds .is-done', () => {
    const fn = src.slice(src.indexOf('function hmCopyAddress('), src.indexOf('function hmCopyAddress(') + 900);
    expect(fn).toContain("navigator.clipboard.writeText(text)");
    expect(fn).toContain("btn.classList.add('is-done')");
  });
});
```

(Add `import { readFileSync } from 'node:fs';` at the top if the harness copy did not already.)

- [ ] **Step 2: Run to verify failure**

Run: `cd test && npx vitest run home-details-card`
Expected: FAIL on `hmRulesModalHTML is not defined` and the source assertions.

- [ ] **Step 3: Implement** — insert BEFORE `function closeJoinSheet()` (line ~3957):

```js
// ── Home Details card actions (design round 2026-08-24) ─────────────────────────────────────────────
// The rules SHEET: the shipped tournaments.rules text (the same escape-first rulesToHTML the Rules page
// uses — one column, one formatter, so the sheet shows the WHOLE document) in the production
// .popup-overlay/.popup-card kit. Body-appended like every other prod modal: partialRender rebuilds
// #tab-home .container wholesale on every background sync, so anything inside .hm dies mid-read.
// Mike's call (2026-08-24): the sheet is Home's surface; the Tournament hub row and the register form
// keep the full Rules PAGE and its rulesReturnView back-stack. No rules text → '' (and the row renders
// no Rules action) — never a stub on the front door.
function hmRulesModalHTML(t) {
  const body = rulesToHTML(t && typeof t.rules === 'string' ? t.rules : '');
  if (!body) return '';
  const name = escapeHTML((t && t.name) || 'Tournament');
  return `<div class="popup-card card" role="dialog" aria-modal="true" aria-labelledby="hm-rules-title">
  <div class="popup-header">
    <div class="hmv-rtitles"><span class="hmv-reyebrow">${name}</span><h3 class="hmv-rtitle" id="hm-rules-title">Rules</h3></div>
    <button type="button" class="hmv-rx" data-hm-rules-close aria-label="Close the rules"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
  </div>
  <div class="popup-body"><div class="rl-body">${body}</div></div>
  <div class="hmv-rfoot"><button type="button" class="hmv-rdone" data-hm-rules-close>Got it</button></div>
</div>`;
}
function hmRulesEscape(ev) { if (ev.key === 'Escape') closeHomeRules(); }
function closeHomeRules() {
  const el = document.getElementById('hm-rules-modal');
  if (el) el.remove();
  document.removeEventListener('keydown', hmRulesEscape);
}
function openHomeRules() {
  const html = hmRulesModalHTML(publicHomeRegTournament()); // the SAME row the card was built from
  if (!html) return;
  closeHomeRules();
  const scrim = document.createElement('div');
  scrim.id = 'hm-rules-modal';
  scrim.className = 'popup-overlay';
  scrim.style.display = 'flex';
  scrim.innerHTML = html;
  document.body.appendChild(scrim);
  // The sheet lives on document.body (outside #app-content's delegated listeners), so its closers bind here.
  scrim.addEventListener('click', (ev) => {
    if (ev.target === scrim || ev.target.closest('[data-hm-rules-close]')) closeHomeRules();
  });
  document.addEventListener('keydown', hmRulesEscape);
}
// Copy address: writes data-hm-copy (venue + address, built by hmVenueRowHTML from migration 0058's
// columns) to the clipboard and holds the green "Address copied" state ~2s. A background repaint during
// those 2s rebuilds the row without .is-done — acceptable, the copy already happened. No clipboard API
// (a very old in-app browser) → nothing happens and nothing claims it did.
function hmCopyAddress(btn) {
  const text = btn.getAttribute('data-hm-copy') || '';
  if (!text || !navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') return;
  navigator.clipboard.writeText(text).then(() => {
    btn.classList.add('is-done');
    clearTimeout(hmCopyAddress._t);
    hmCopyAddress._t = setTimeout(() => { btn.classList.remove('is-done'); }, 2000);
  }).catch(() => {});
}
```

In the delegate (`public/app.js:11384`, immediately before `const tnBtn = e.target.closest('[data-tn-view]');`):

```js
      // Home Details card (design round 2026-08-24): Copy address + the Rules sheet. Checked before the
      // Tournament view machinery — both live on Home and neither navigates.
      const hmCopyBtn = e.target.closest('[data-hm-copy]');
      if (hmCopyBtn) { hmCopyAddress(hmCopyBtn); return; }
      if (e.target.closest('[data-hm-rules]')) { openHomeRules(); return; }
```

- [ ] **Step 4: Append the sheet CSS** (end of `public/styles.css`, after Task 2's block):

```css
/* Round 2026-08-22 — "in this box have a button for rules, that when clicked opens
   a pop up of the rules" (public Home · Details, roster row). The shipped rules
   content in the production .popup-overlay / .popup-card system. PORT NOTE:
   .hmv-rx gets min-height:0 (prod button floor) so the 34px disc is a disc. */
#hm-rules-modal .popup-card {
  display: flex;
  flex-direction: column;
  width: min(520px, calc(100vw - 1.25rem));
  max-height: calc(100dvh - 3rem);
  padding: 0;
  overflow: hidden;
}
#hm-rules-modal .popup-header {
  flex: none;
  align-items: flex-start;
  margin: 0;
  padding: 12px 14px 11px 16px;
  background: oklch(0.975 0.003 75);
}
#hm-rules-modal .hmv-rtitles { display: grid; gap: 3px; min-width: 0; }
#hm-rules-modal .hmv-reyebrow {
  font: 700 10px var(--font-display);
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--muted);
}
#hm-rules-modal .hmv-rtitle {
  margin: 0;
  font: 700 20px var(--font-display);
  letter-spacing: .01em;
  color: var(--ink);
}
#hm-rules-modal .hmv-rx {
  flex: none;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  min-height: 0;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: #fff;
  color: var(--muted);
  cursor: pointer;
  transition: color .15s ease, background-color .15s ease, border-color .15s ease;
}
@media (hover: hover) and (pointer: fine) {
  #hm-rules-modal .hmv-rx:hover { color: var(--accent); border-color: var(--accent-bd); background: var(--accent-soft); }
}
#hm-rules-modal .hmv-rx svg { width: 15px; height: 15px; fill: none; stroke: currentColor; }
#hm-rules-modal .popup-body { flex: 1 1 auto; overflow: auto; padding: 16px; -webkit-overflow-scrolling: touch; }
#hm-rules-modal .rl-body { padding: 0; }
#hm-rules-modal .rl-h { font-size: 13px; }
#hm-rules-modal .rl-sect { margin-bottom: 22px; }
#hm-rules-modal .hmv-rfoot {
  flex: none;
  padding: 11px 16px 13px;
  border-top: 1px solid var(--border);
  background: oklch(0.985 0.003 75);
}
#hm-rules-modal .hmv-rdone {
  width: 100%;
  height: 46px;
  border: 0;
  border-radius: 12px;
  background: var(--accent);
  color: #fff;
  font: 600 15px 'Inter', sans-serif;
  cursor: pointer;
  transition: background-color .15s ease, transform .08s ease;
}
#hm-rules-modal .hmv-rdone:active { transform: scale(.99); }
```

- [ ] **Step 5: Run the tests**

Run: `node --check public/app.js && cd test && npx vitest run`
Expected: all green, `home-details-card` fully passing.

- [ ] **Step 6: Bump + commit + push**

`APP_VERSION = '2026.08.24.2'`.

```bash
git add public/app.js public/styles.css test/home-details-card.test.js
git commit -m "feat(home): Copy address and the rules sheet on the Details card - v2026.08.24.2"
git push
```

---

### Task 4: Register form payment divider

**Files:**
- Modify: `public/app.js:3796` (`.rf-divlab` → `.rf-divlab is-pay`)
- Modify: `public/styles.css` — append
- Test: `test/home-details-card.test.js`

- [ ] **Step 1: Failing test**

```js
describe('register form (design round 2026-08-24)', () => {
  it('marks the PAYMENT divider and keeps the Mike-verified held-spot line', () => {
    bridge.setTournaments([reg]);
    const html = bridge.register();
    expect(html.match(/class="rf-divlab is-pay"/g)).toHaveLength(1);
    expect(html).toContain("Teams pay to register. Your spot is held once it's sent.");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `cd test && npx vitest run home-details-card` → FAIL (no `is-pay`).

- [ ] **Step 3: Implement**

`public/app.js:3796`: `<div class="rf-divlab is-pay"><span>Payment</span></div>`

Append to `public/styles.css`:

```css
/* Round 2026-08-22 — "make this all the blue" (Register your team · PAYMENT divider),
   shipped through the handoff's app-wide "remove the line below payment": the
   hairlines are GONE (the round's _rounds.css recoloured them, but its later
   _shared.css set content:none, and the screenshot shows no rule), the label
   drops to a plain 11px heading, and the payment one goes accent. .rf-divlab has
   exactly one emitter (the register form). */
.rf-divlab { display: block; margin: 24px 2px 2px; }
.rf-divlab::before, .rf-divlab::after { content: none; display: none; }
.rf-divlab > span { font-size: 11px; letter-spacing: .12em; color: var(--muted); }
.rf-page .rf-divlab.is-pay span { color: var(--accent); }
```

- [ ] **Step 4: Run the tests** — all green.

- [ ] **Step 5: Bump + commit + push** — `APP_VERSION = '2026.08.24.3'`.

```bash
git add public/app.js public/styles.css test/home-details-card.test.js
git commit -m "feat(register): accent PAYMENT heading, hairlines dropped (2026-08-24 round) - v2026.08.24.3"
git push
```

---

### Task 5: App-wide shell layer (header grid, sticky page headers, watermark, scrollbars, section heads)

**Files:**
- Modify: `public/styles.css` — append; edit `public/styles.css:1752-1760` (reduce-motion block gains `animation-delay`)
- Test: `test/shell-layer.test.js` (new, source-level)

- [ ] **Step 1: Failing test**

```js
// The 2026-08-24 app-wide shell layer — source-level guards for the port decisions that a verbatim copy of
// the handoff's _shared.css would have got wrong in production (recon 2026-08-24).
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
  });
  it('the reduce-motion block zeroes animation delay (a staggered page must not stay blank)', () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*\*, \*::before, \*::after \{[^}]*animation-delay: 0ms !important/);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `cd test && npx vitest run shell-layer` → FAIL.

- [ ] **Step 3: Implement**

Edit `public/styles.css:1752-1760` in place:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .001ms !important;
    animation-delay: 0ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .001ms !important;
    scroll-behavior: auto !important;
  }
}
```

Append to `public/styles.css`:

```css
/* ============================================================
   APP-WIDE SHELL LAYER - 2026-08-24 (Mike's handoff _shared.css, "APP-WIDE
   CORRECTIONS"). Shared byte-for-byte by all five 2026-08-24 handoffs; the
   Tournament / Manage / Account ports build on this. Mike's call: app-wide now.
   NOT ported from that file (they belong to other screens or were wrong for prod):
   the score card, pools caption, event-settings cards, rules editor, pools
   controls, the bracket flow override (prod pans an absolute canvas from JS),
   live scoring; `#app-header sticky` (the app header never scrolls - #app-content
   is overflow:hidden); `.ph-pagehdr` (nothing emits it); the watermark
   `display:block !important` (would un-hide it behind Manage, Mike 2026-07-12);
   `html, body, #app-content` scroll rules (none of those scroll - .tab-panel does);
   `scroll-behavior: smooth` (the app restores scrollTop programmatically after
   every partial repaint - smooth would animate the restore); `body.pd-noscroll`
   (nothing sets it); `#inline-app` (canvas harness); `.pl-legend` (already shipped).
   ============================================================ */

/* "all headers everywhere need to be on the screen at all times even when
   scrolling". .tab-panel is the scroll container (position:absolute; overflow-y:
   scroll), so sticky needs no structural change. The gutter bleed matches
   .container's padding: 8px under 768px, 12px above. */
.pd-pagehdr {
  position: sticky;
  top: 0;
  z-index: 40;
  margin-inline: -8px;
  padding-inline: 8px;
  padding-top: 10px;
  padding-bottom: 8px;
  background: var(--bg);
  box-shadow: 0 8px 10px -12px rgba(20, 20, 22, .55);
}
@media (min-width: 769px) { .pd-pagehdr { margin-inline: -12px; padding-inline: 12px; } }

/* Section heads, everywhere. The Manage hub set the pattern — accent label,
   count if it has one, then a 2px rule running out to the right edge. */
.pl-sect {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 24px 0 5px;
  padding-top: 0;
  border-top: 0;
  font-size: 13.5px;
  letter-spacing: .12em;
  color: var(--accent);
}
.pl-sect::after {
  content: '';
  display: block;
  flex: 1;
  min-width: 24px;
  height: 2px;
  border-radius: 2px;
  background: var(--border);
}
.pl-sect:first-child { margin-top: 6px; }

/* The logo mark: a quiet ghost behind the page. Prod already shows it on every
   public tab (and hides it behind Manage); only the size and weight change. */
body.pd-public-active .pd-watermark { width: 300px; opacity: .075; }

/* APP HEADER — the title block owns the left, the account owns the right.
   "Updated 7:42 PM" belongs to the account corner: right-aligned, tucked under the
   bubble. Markup unchanged (renderPublicShell already emits this tree). */
#app-header.pd-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-rows: auto auto;
  align-items: center;
  column-gap: 14px;
  row-gap: 1px;
}
#app-header.pd-header > .app-header-mode { grid-area: 1 / 1; }
#app-header.pd-header > .pd-wordmark { grid-area: 1 / 1 / span 2 / span 1; align-self: center; }
#app-header.pd-header > #js-sync-notice {
  grid-area: 2 / 2;
  position: static;
  inset: auto;
  margin: 0;
  justify-self: end;
  text-align: right;
}
#app-header.pd-header > #js-sync-notice .shared-sync-notice {
  margin: 0;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--muted);
}
#app-header.pd-header > .pd-hgrp {
  grid-area: 1 / 2;
  position: static;
  justify-self: end;
  transform: none;
  margin: 0;
}

/* SCROLLING — one bar for the whole app: a pill in the app's own warm ink on a
   transparent track. The manners are retargeted to .tab-panel, the real scroller. */
* {
  scrollbar-width: thin;
  scrollbar-color: oklch(0.66 0.012 75 / .5) transparent;
}
::-webkit-scrollbar { width: 11px; height: 11px; background: transparent; }
::-webkit-scrollbar-track { background: transparent; border: 0; }
::-webkit-scrollbar-thumb {
  background: oklch(0.66 0.012 75 / .5);
  background-clip: padding-box;
  border: 3.5px solid transparent;
  border-radius: 999px;
  min-height: 44px;
}
::-webkit-scrollbar-thumb:hover { background: oklch(0.52 0.014 75 / .66); background-clip: padding-box; }
::-webkit-scrollbar-thumb:active { background: var(--accent); background-clip: padding-box; }
::-webkit-scrollbar-corner, ::-webkit-scrollbar-button { display: none; background: transparent; }
.tab-panel { scroll-padding-top: 56px; -webkit-overflow-scrolling: touch; }
.popup-body, .mgv-tbody, .mgv-scbody, .mgs-body {
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  -webkit-overflow-scrolling: touch;
}
.bt-pan, [data-hscroll] { scrollbar-width: none; overscroll-behavior-x: contain; }
.bt-pan::-webkit-scrollbar, [data-hscroll]::-webkit-scrollbar { height: 0; width: 0; }
```

- [ ] **Step 4: Run the tests** — `cd test && npx vitest run` → all green.

- [ ] **Step 5: Bump + commit + push** — `APP_VERSION = '2026.08.24.4'`.

```bash
git add public/app.js public/styles.css test/shell-layer.test.js
git commit -m "feat(shell): app-wide layer from the 2026-08-24 round - header grid, sticky page headers, scrollbars, section heads - v2026.08.24.4"
git push
```

---

### Task 6: Motion system — CSS

**Files:**
- Modify: `public/styles.css` — append the motion block; edit `public/styles.css:2593` (`.pd-bk-sl-dot`) and `:2651` (`.pd-reg-dot`) are NOT edited (the appended rule wins by order); edit `public/styles.css:2788` reduce-motion line stays.
- Test: `test/motion-port.test.js` (new)

- [ ] **Step 1: Failing test**

```js
// Motion system port (2026-08-24 handoff). The handoff was authored for a static prototype; production
// repaints whole containers on a 15s poll. These guards pin the port decisions that keep the entrances
// from replaying on every poll and the wildcards from catching the wrong elements.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

describe('motion CSS', () => {
  it('defines the five durations and four curves', () => {
    for (const t of ['--m-tap: 90ms', '--m-state: 140ms', '--m-elem: 200ms', '--m-surface: 300ms', '--m-cheer: 460ms',
      '--e-settle: cubic-bezier(.2, .7, .3, 1)', '--e-arrive: cubic-bezier(.16, 1, .3, 1)', '--e-leave: cubic-bezier(.4, 0, 1, 1)', '--e-press: cubic-bezier(.34, 1.4, .5, 1)']) {
      expect(css).toContain(t);
    }
  });
  it('every ENTRANCE animation is gated behind body.m-enter (poll-immune)', () => {
    const re = /([^{}]+)\{[^}]*animation:\s*(m-drop|m-screen|m-cheer|m-trophy)\b/g;
    let m; let n = 0;
    while ((m = re.exec(css))) { n++; expect(m[1].trim()).toContain('body.m-enter'); }
    expect(n).toBeGreaterThanOrEqual(4);
    const rise = /([^{}]+)\{[^}]*animation:\s*m-rise\b/g;
    while ((m = rise.exec(css))) {
      const sel = m[1].trim();
      const ok = sel.includes('body.m-enter') || sel.includes('.m-in') || sel.includes('.popup-card') || sel.includes('.pd-reg-sheet');
      expect(ok).toBe(true);
    }
  });
  it('ships no prototype wildcards that catch prod classes by accident', () => {
    for (const bad of ['[class*="-act"]', '[class*="-sheet"]', '[class*="-modal"]', '[class*="-pick"]', '[class$="-list"]', '[class*="-done"]', '[class*="-check"]', 'body.no-motion']) {
      expect(css).not.toContain(bad);
    }
  });
  it('the LIVE pulse is one tempo on the three real dots', () => {
    expect(css).toContain('.hm-eyebrow:not(.is-quiet) .hm-dot, .pd-bk-sl-dot, .pd-reg-dot {');
    expect(css).toContain('animation: m-pulse 1600ms ease-in-out infinite;');
  });
  it('the toasts keep their centring through the new entrance', () => {
    expect(css).toContain('@keyframes m-toast-c { from { opacity: 0; transform: translate(-50%, 14px) scale(.96); } }');
  });
});
```

- [ ] **Step 2: Run to verify failure** — `cd test && npx vitest run motion-port` → FAIL.

- [ ] **Step 3: Append the motion CSS** to `public/styles.css`:

```css
/* ============================================================
   MOTION SYSTEM - 2026-08-24 (Mike's motion handoff, _motion-app.css).
   Five durations, four curves; transform + opacity only; micro-moves under 10px;
   nothing over 200ms except the one celebration a tournament earns.
   PORT NOTES (the handoff was written for a static prototype; prod repaints
   containers on a 15s poll and on every keystroke):
   (1) every ENTRANCE (m-drop / m-screen / m-rise stagger / m-cheer) is gated on
       body.m-enter, which mEnter() sets for 700ms from activateMainTab and the
       Tournament sub-page push ONLY. partialRender never sets it, so no poll and
       no keystroke can replay an entrance.
   (2) the prototype's wildcard selectors ([class*="-sheet"], [class*="-act"],
       [class*="-modal"], ...) caught .pd-reg-sheet's own children, all seven
       qr-modal-* parts, "is-active" and even <body class="pd-public-active">;
       every one is narrowed to prod's explicit classes below.
   (3) m-flash animates FROM the green wash to the row's own background (the
       handoff's 100% stop was `transparent`, which washed filled rows to nothing).
   (4) the toasts are centred with translateX(-50%); m-toast-c keeps that in the
       from-frame so they do not jump.
   (5) body.no-motion and data-m-leave are not ported - nothing in the app sets
       or emits them; prefers-reduced-motion (the block at ~1752) governs.
   (6) .hm-rail / .hm-board are display:contents below 1024px, so the
       tournament-live stagger targets their children there.
   Fill mode is BACKWARDS, never BOTH: a finished animation leaves no transform.
   ============================================================ */
:root {
  --m-tap: 90ms;
  --m-state: 140ms;
  --m-elem: 200ms;
  --m-surface: 300ms;
  --m-cheer: 460ms;
  --e-settle: cubic-bezier(.2, .7, .3, 1);
  --e-arrive: cubic-bezier(.16, 1, .3, 1);
  --e-leave: cubic-bezier(.4, 0, 1, 1);
  --e-press: cubic-bezier(.34, 1.4, .5, 1);
  --m-scale: 1;
}
/* stagger index: every element carries its own position so any list can cascade
   without the markup knowing about motion. Capped at 9. */
:nth-child(1)  { --m-i: 0; }
:nth-child(2)  { --m-i: 1; }
:nth-child(3)  { --m-i: 2; }
:nth-child(4)  { --m-i: 3; }
:nth-child(5)  { --m-i: 4; }
:nth-child(6)  { --m-i: 5; }
:nth-child(7)  { --m-i: 6; }
:nth-child(8)  { --m-i: 7; }
:nth-child(n+9) { --m-i: 8; }

/* ---------- 1. the screen arrives (once per real navigation) ---------- */
body.m-enter #app-header {
  animation: m-drop calc(var(--m-surface) * var(--m-scale)) var(--e-arrive) backwards;
}
body.m-enter #app-content > .tab-panel.active {
  animation: m-screen calc(var(--m-surface) * var(--m-scale)) var(--e-arrive) backwards;
}
/* ---------- 2. lists and stacks land in sequence ---------- */
body.m-enter #app-content > .tab-panel.active > .container > *,
body.m-enter #app-content > .tab-panel.active > .container > .hm > * {
  animation: m-rise calc(var(--m-elem) * var(--m-scale)) var(--e-settle) backwards;
  animation-delay: calc(var(--m-i, 0) * 42ms * var(--m-scale));
}
@media (max-width: 1023px) {
  body.m-enter #app-content > .tab-panel.active > .container > .hm.is-live > :is(.hm-rail, .hm-board) > * {
    animation: m-rise calc(var(--m-elem) * var(--m-scale)) var(--e-settle) backwards;
    animation-delay: calc(var(--m-i, 0) * 42ms * var(--m-scale));
  }
}
/* sticky furniture fades in place - a rise on a sticky header reads as a layout bug */
body.m-enter #app-content > .tab-panel.active > .container > .pd-pagehdr {
  animation: m-fade calc(var(--m-elem) * var(--m-scale)) var(--e-settle) backwards;
}

/* ---------- 3. the surface answers your finger ---------- */
button, [role="button"], a[class], .nav-btn, .chip, .hm-link, .hm-mini, .pd-tile, .pd-back, .mg-row, .ckx-row, .bt-node, .pl-tab {
  transition:
    transform calc(var(--m-tap) * var(--m-scale)) var(--e-press),
    box-shadow calc(var(--m-state) * var(--m-scale)) var(--e-settle),
    background-color calc(var(--m-state) * var(--m-scale)) var(--e-settle),
    border-color calc(var(--m-state) * var(--m-scale)) var(--e-settle),
    color calc(var(--m-state) * var(--m-scale)) var(--e-settle),
    opacity calc(var(--m-state) * var(--m-scale)) var(--e-settle);
}
button:active, [role="button"]:active { transform: scale(.972); }
/* a row is a big target: it dips, it does not shrink (.ckx-row keeps its shipped 1px dip) */
:is(a, button)[class*="-row"]:not(.ckx-row):active, .bt-node:active { transform: scale(.994); }
input, select, textarea {
  transition:
    box-shadow calc(var(--m-state) * var(--m-scale)) var(--e-settle),
    border-color calc(var(--m-state) * var(--m-scale)) var(--e-settle),
    background-color calc(var(--m-state) * var(--m-scale)) var(--e-settle);
}
:focus-visible { transition: box-shadow calc(var(--m-state) * var(--m-scale)) var(--e-settle); }
/* the commit: a tick that replaces a face after one tap */
.pd-reg-check, .hmv-copy.is-done .hmv-cdone {
  animation: m-tick calc(var(--m-state) * 1.6 * var(--m-scale)) var(--e-press) backwards;
}

/* ---------- 4. surfaces: sheets, modals, menus ---------- */
.popup-overlay, .pd-reg-scrim, .qr-modal-backdrop {
  animation: m-fade calc(var(--m-surface) * var(--m-scale)) var(--e-settle) backwards;
}
.popup-card, .qr-modal-card {
  animation: m-surface-in calc(var(--m-surface) * var(--m-scale)) var(--e-arrive) backwards;
}
/* the join sheet keeps its full-height travel, on the system's duration and curve */
.pd-reg-sheet { animation: pd-reg-sheetup calc(var(--m-surface) * var(--m-scale)) var(--e-arrive); }
/* rows inside a just-opened surface arrive after it, not with it */
:is(.popup-card, .pd-reg-sheet) > * {
  animation: m-rise calc(var(--m-elem) * var(--m-scale)) var(--e-settle) backwards;
  animation-delay: calc(var(--m-surface) * .45 * var(--m-scale) + var(--m-i, 0) * 34ms * var(--m-scale));
}

/* ---------- 5. state: a value changed and you should see it ---------- */
.m-bump { animation: m-bump calc(var(--m-state) * 1.7 * var(--m-scale)) var(--e-press); }
.m-pop  { animation: m-pop calc(var(--m-state) * 1.7 * var(--m-scale)) var(--e-press); }
.m-in   { animation: m-rise calc(var(--m-elem) * var(--m-scale)) var(--e-settle) backwards; }
.m-flash { animation: m-flash calc(var(--m-elem) * 2.2 * var(--m-scale)) var(--e-settle); }
/* the live pulse — the only thing in the app allowed to loop */
.hm-eyebrow:not(.is-quiet) .hm-dot, .pd-bk-sl-dot, .pd-reg-dot {
  animation: m-pulse 1600ms ease-in-out infinite;
}

/* ---------- 6. attention ---------- */
.cik-toast, .save-toast {
  animation: m-toast-c calc(var(--m-surface) * var(--m-scale)) var(--e-arrive) backwards;
}
.save-toast { transition: opacity calc(var(--m-elem) * var(--m-scale)) var(--e-leave), transform calc(var(--m-elem) * var(--m-scale)) var(--e-leave); }
[aria-invalid="true"], .auth-err:not(:empty), .mgss-err:not([hidden]) {
  animation: m-shake calc(var(--m-elem) * 1.9 * var(--m-scale)) cubic-bezier(.36, .07, .19, .97);
}

/* ---------- 7. the one celebration a tournament earns ---------- */
body.m-enter .pd-bk-champbar {
  animation: m-cheer calc(var(--m-cheer) * var(--m-scale)) var(--e-press) backwards;
}
body.m-enter .pd-bk-champbar .pd-bk-cbic {
  animation: m-trophy calc(var(--m-cheer) * 1.3 * var(--m-scale)) var(--e-press) backwards;
  animation-delay: calc(var(--m-cheer) * .3 * var(--m-scale));
}
body.m-enter .pd-bk-champbar :is(.pd-bk-cbh, .pd-bk-cbs) {
  animation: m-rise calc(var(--m-elem) * var(--m-scale)) var(--e-settle) backwards;
  animation-delay: calc(var(--m-cheer) * .45 * var(--m-scale));
}

@keyframes m-screen { from { opacity: 0; transform: translateY(10px); } }
@keyframes m-drop   { from { opacity: 0; transform: translateY(-6px); } }
@keyframes m-rise   { from { opacity: 0; transform: translateY(9px); } }
@keyframes m-fade   { from { opacity: 0; } }
@keyframes m-surface-in { from { opacity: 0; transform: translateY(10px) scale(.985); } }
@keyframes m-tick   { from { opacity: 0; transform: scale(.72); } }
@keyframes m-bump   { 0% { transform: translateY(0); } 40% { transform: translateY(-5px); } 100% { transform: translateY(0); } }
@keyframes m-pop    { 0% { transform: scale(1); } 35% { transform: scale(1.28); } 100% { transform: scale(1); } }
@keyframes m-pulse  { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: .35; transform: scale(.82); } }
@keyframes m-flash  { from { background-color: oklch(0.96 0.04 150); } }
@keyframes m-toast-c { from { opacity: 0; transform: translate(-50%, 14px) scale(.96); } }
@keyframes m-shake  { 10%, 90% { transform: translateX(-2px); } 20%, 80% { transform: translateX(4px); } 30%, 50%, 70% { transform: translateX(-7px); } 40%, 60% { transform: translateX(7px); } }
@keyframes m-cheer  { from { opacity: 0; transform: translateY(12px) scale(.96); } }
@keyframes m-trophy { 0% { opacity: 0; transform: scale(.5) rotate(-14deg); } 60% { opacity: 1; transform: scale(1.16) rotate(4deg); } 100% { opacity: 1; transform: none; } }
```

Before finalising, grep prod for `.qr-modal-backdrop`, `.qr-modal-card`, `.auth-err`, `.mgss-err`, `.pl-tab`, `.bt-node`, `.mg-row` and drop any selector whose class does not exist (`grep -c "\.qr-modal-backdrop" public/styles.css` etc.).

- [ ] **Step 4: Run the tests** — green except `motion-port`'s JS cases (Task 7).

- [ ] **Step 5: Commit** (push with Task 7 — the CSS is inert without `mEnter`, harmless but incomplete):

```bash
git add public/styles.css test/motion-port.test.js
git commit -m "feat(motion): the 2026-08-24 motion system, entrances gated on body.m-enter, wildcards narrowed"
```

---

### Task 7: Motion system — JS (the guard + explicit plays)

**Files:**
- Modify: `public/app.js` — new helpers near `makeSaveToast` (line ~4776); `activateMainTab` (line 11219); the `data-tn-view` handler (line ~11400); the score sheet `sync()` (line ~9862-9872)
- Test: `test/motion-port.test.js`

- [ ] **Step 1: Failing test** — add to `test/motion-port.test.js`:

```js
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
```

- [ ] **Step 2: Run to verify failure** — `cd test && npx vitest run motion-port` → FAIL.

- [ ] **Step 3: Implement**

Insert BEFORE `function makeSaveToast(text)`:

```js
// ── Motion system (design round 2026-08-24) — the three things CSS cannot see ──────────────────────
// The handoff shipped a MutationObserver that watched #app-content; in a template-literal app every
// list, card and panel is rebuilt via innerHTML, so "a row was inserted" and "the poll repainted the
// screen" are indistinguishable to an observer and the whole app would play its entrance every 15s.
// So: (1) mEnter() opens a 700ms window (300ms surface + the longest stagger) during which the CSS
// entrance rules apply — set ONLY from activateMainTab and the Tournament sub-page push, never from
// partialRender; (2) mPlay() is called explicitly where a value or state changes in place.
function mReduced() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}
function mEnter() {
  try {
    document.body.classList.add('m-enter');
    clearTimeout(mEnter._t);
    mEnter._t = setTimeout(() => { document.body.classList.remove('m-enter'); }, 700);
  } catch {}
}
function mPlay(el, cls, ms) {
  if (!el || mReduced() || (el.dataset && el.dataset.mPlaying)) return;
  try {
    el.dataset.mPlaying = '1';
    el.classList.add(cls);
    setTimeout(() => { el.classList.remove(cls); delete el.dataset.mPlaying; }, ms);
  } catch {}
}
```

`activateMainTab(tab)` — after `sessionStorage.setItem(currentTabKey(), tab);` add:

```js
  mEnter(); // motion (2026-08-24): a tab change is a real navigation — the screen may arrive
```

The `data-tn-view` handler — after `if (c) c.innerHTML = buildPublicTournamentRootHTML();` inside the `if (tnBtn)` block add:

```js
        mEnter(); // motion (2026-08-24): a sub-page push is a real navigation
```

Score sheet `sync()` — replace the two `textContent` lines and the winner toggle:

```js
    const ea = document.getElementById('mgss-a'), eb = document.getElementById('mgss-b');
    if (ea && ea.textContent !== String(a)) { ea.textContent = String(a); mPlay(ea, 'm-bump', 240); }
    if (eb && eb.textContent !== String(b)) { eb.textContent = String(b); mPlay(eb, 'm-bump', 240); }
    scrim.querySelectorAll('[data-mgss-winner]').forEach((wb) => {
      const on = wb.getAttribute('data-mgss-winner') === pick;
      wb.setAttribute('aria-pressed', on ? 'true' : 'false');
      const row = wb.closest('.mgv-scrow');
      if (row) {
        const was = row.classList.contains('is-won');
        row.classList.toggle('is-won', on);
        if (on && !was) mPlay(row, 'm-flash', 440); // motion (2026-08-24): the score commits, the row washes green
      }
    });
```

- [ ] **Step 4: Run the tests** — `node --check public/app.js && cd test && npx vitest run` → all green.

- [ ] **Step 5: Bump + commit + push** — `APP_VERSION = '2026.08.24.5'`.

```bash
git add public/app.js test/motion-port.test.js
git commit -m "feat(motion): mEnter guard on real navigation, explicit bumps and flashes on the score sheet - v2026.08.24.5"
git push
```

---

### Task 8: Verification drive (§27 390 + §41 1280) + prod poll + vault

**Files:** none edited unless the drive finds a defect (then: fix, test, bump `.6`, push).

- [ ] **Step 1: Serve localhost and drive at 390 and 1280** with the write legs stubbed inside each frame BEFORE any interaction (the 2026-08-07 recipe: same-origin iframes at 390 and 1280; stub `queueLiveStateSave` and the Supabase `insert/update/upsert/delete/rpc` builders; pin `state.isAdmin` if Manage is needed; clear intervals for screenshots). Localhost boots against PROD Supabase.
- [ ] **Step 2: Home at 390** — registration state: the card renders (head, 3 tiles, 2-line rows), the venue row shows the fallback with no Copy button (0058 not yet applied), the Rules action shows only if the live August row has rules, tapping Rules opens the sheet on `document.body` (`#hm-rules-modal` exists outside `#app-content`), Escape / backdrop / Got it close it; OPEN is green. Screenshot.
- [ ] **Step 3: Poll immunity** — stay on Home for TWO full poll cycles (35s): `document.getAnimations()` on `.hm > *` returns none after the first 700ms; the sheet, if open, survives a poll.
- [ ] **Step 4: Entrance on navigation** — tap Tournament: `body.classList.contains('m-enter')` is true immediately after and false after 700ms; the header and container children have running animations only inside the window.
- [ ] **Step 5: Register form** — PAYMENT is a blue 11px heading with no hairlines; the sub-line still carries "Your spot is held once it's sent."; the page header is sticky when scrolled.
- [ ] **Step 6: 1280** — the header grid puts "Updated" under the avatar; the Details card sits in the 640px column; no horizontal overflow anywhere.
- [ ] **Step 7: Console** — zero `ReferenceError` / `TypeError`.
- [ ] **Step 8: Prod poll** after the last push: version pill matches; `curl https://athletic-specimen.com/styles.css | grep -c "hmv-dcard"` ≥ 1, `grep -c "body.m-enter"` ≥ 4; `curl .../app.js | grep -c "function mEnter"` = 1.
- [ ] **Step 9: Vault** — `log.md` entry (newest on top), `current.md` LATEST block, `decisions.md` (the motion guard, the venue mapping, the `:focus` drop, the rules-sheet coexistence), `debugging.md` (entrance replay on innerHTML swaps), `12-history/task-#1-home-handoff-motion-session18.md`, `NOW.md` rewrite (also fixes the stale "answer the drag question" next-action), `Tasks From Claude.md` rows C95-C99, and the AskUserQuestion hand-back: apply migration 0058 via the Supabase MCP now?

---

## Self-review

- **Spec coverage:** Details card (T2) · Copy address (T1 data + T2 markup + T3 handler) · Rules sheet (T3) · OPEN/CLOSED colouring (T2) · PAYMENT divider (T4) · shell layer app-wide, the six excluded blocks named (T5) · motion: guard (T6/T7), narrowed wildcards (T6), explicit plays (T7), existing motions moved onto the system (T6 §4/§6), reduce-motion delay fix (T5), `display:contents` phones (T6) · venue migration + Manage fields (T1) · `:last-of-type` bug (T2) · `:focus` defect (T2) · kept payment sentence (T4) · verification + vault (T8).
- **Placeholder scan:** the only "copy the harness from manage-page.test.js:11-60" instruction points at a concrete, unchanged block by line range; every other step carries its code.
- **Type consistency:** `tournamentHasVenue()` (T1) used in T2; `publicHomeRegTournament()` (T2) used in T3; `hmRulesModalHTML(t)` (T3) bridged in T2's test file; `mEnter` / `mPlay(el, cls, ms)` (T7) asserted in T6/T7 tests; `.hmv-cdone` (T2 markup) referenced by T6's tick rule; `data-hm-copy` / `data-hm-rules` (T2) consumed by T3.
