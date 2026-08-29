# Check-in pop-ups: edit a player, add a player, and groups leave the product. Design.

Date: 2026-08-29. Baseline read at HEAD `a0c9f8f`, `APP_VERSION = '2026.08.26.4'` (`public/app.js:34`).
**The C102 split has landed in the working tree while this spec was written**: `public/manage.js` exists
(326,860 bytes, 5,139 lines), `public/index.html:125` loads it before `public/app.js:127`, and every `mgck*`
and `mgp*` builder now lives in `manage.js`. Three C102 tasks are still open at this HEAD and this spec
depends on all three: `public/sw.js:15` still lists only `/pure.js` (T6), no test harness reads
`public/manage.js` (T7, so 15 files / 543 tests are red by design right now), and the §38 gate's file
regex at `C:/Users/OlasM/.claude/hooks/_vault-map.mjs:13` still reads
`/(^|\/)public\/(app\.js|[^/]+\.(html|css))$/i`, with no `manage.js` term (T10).

Source: Mike's zip `Athletic Specimen check in pop ups.zip`, extracted at
`S/zip/design_handoff_checkin_player_popups/`. Recon digest: `S/DIGEST.md` (3 screens, 22 changes, six
rounds Mike named in the CSS comments). Mike's four calls are banked in the vault at
`C:/Ai Master/Projects/Athletic Specimen/01-state/decisions.md:16-19`.

Every line number below was read from the repo at `a0c9f8f`. **Every edit site is named by FUNCTION NAME
and file**, because C102 is still moving numbers and the build runs on a branch. `S` =
`C:/Users/OlasM/AppData/Local/Temp/claude/C--Users-OlasM-OneDrive-Athletic-Specimen-App/cc8a1cfd-5548-46de-a7f5-c253f6bf1735/scratchpad/checkin-popups/`.

## 1. Goal

Three things the organizer cannot do today at the door, plus one removal.

1. **Fix a roster record from inside the check-in console.** A pencil on every row opens the app's own
   player card over the list. Name, rating and check-in state are corrected in place: no navigation, no
   lost scroll, no trip to Manage to Players. Today `mgckListHTML` (`public/manage.js:1103`) prints a name
   and a rating and can change neither, and the only editor is `openPlayerEditPopup`
   (`public/app.js:135`) reached from the Players list.
2. **Put a walk-up on the roster from the console header.** The same element (`#player-edit-modal`) in a
   new-player state adds them OUT. Today the console's only add is the in-list search miss
   (`mgckAddAndCheckIn`, `public/manage.js:1212`), which registers AND checks in.
3. **Give that card a treatment worth the game day it runs on**, and pin the close button to the right in
   every pop-up in the kit. The card is one element serving two surfaces and gets the new look on both.
4. **Groups leave the product entirely**: the field, every subline, the counter, the manager panel, the
   helper layer, `register_player`'s `p_group`, `players."group"` and the `groups` table.

What "done" looks like, stated so nothing is graded on a promise: the console still writes attendance
through exactly one writer (`mgckToggleByKey`, `public/manage.js:1171`) and never double-writes; a card
that is cancelled writes nothing at all; UNDO still means the last row tap, never the last card save; no
emitted string anywhere in the client contains `.ckx-gp`, `.mgp-gp`, `.mgp-mg` or a `p_group` argument;
and the migration runs only after that client is deployed and driven.

## 2. Mike's calls (2026-08-29)

| Fork | Mike's call | Consequence for this spec |
|---|---|---|
| Groups | **Delete groups everywhere.** The `groups` table (`db/migrations/0017_c22_groups_table.sql`), `players."group"`, `register_player`'s `p_group` and every caller including `public/checkin.html:539`. Against the recon's recommendation to strip the UI and leave the column dormant | §4 surfaces D, E, F and §5. One migration, `0068`, applied LAST |
| The kiosk's same-name tiebreaker | **KIOSK TIEBREAKER: "thats almost impossible to have the same full name, just leave it"** (Mike, 2026-08-29). No replacement. Two players with the same full name render as identical rows on the public kiosk and that is accepted | `renderCheckinButton` (`public/app.js:6106`) loses `.ckx-gp` and gains nothing. Two shapes were offered and declined: (a) a last-check-in date or "new" on the row, and (b) no tiebreaker with the door-side picking by elimination from the checked-in state. **Nothing in this spec adds a column, a date line, a note field or any other per-row hint for this** |
| Unrated | **Unrated is skill 0, saved normally.** No nullable migration | The silent save-abort at `public/app.js:446` (`if (!name \|\| Number.isNaN(skill)) return;`) goes away. The card prefills blank when `skill` is not `> 0` and a blank save writes `0`, which `mgpSkillText` (`public/manage.js:956`) already renders as `–` |
| Add paths | **Keep both.** The header card adds OUT; the in-list "Add {name} to the roster" registers and checks IN | `mgckAddAndCheckIn` is untouched except for its group argument. The card gets its own path, `mgckAddFromCard` |
| Autofocus | **No autofocus on First name.** The June 2026 Bug A refusal stands over the handoff's instruction | `_shared.js:1010-1011` (`f.focus(); f.select()`) is NOT ported. Record: `12-history/task-#10-edit-autofocus-name.md`, Mike: *"when I edit players … it auto starts with me editing the name when most of the time it's not that"*, shipped v2026.06.21.1 |
| Where it builds | **"no build both!"** The round builds in parallel with the C102 split, on branch `checkin-popups` in a git worktree, merged after the split ships | §8. Worktree already chosen by the controller: `scratchpad/wt-checkin`, branch `checkin-popups` at `a0c9f8f` |

**Settled by the controller, no fork.** `#player-edit-modal` is ONE element serving Manage to Check-in and
Manage to Players, and it gets the new look on **both**. The README argues the same thing in its own words
(README:14-16: *"Both are the same DOM element (`#player-edit-modal`) in two states. That is deliberate:
one card, one set of styles, one save path"*). Practical effect: the handoff's `[data-mgck-modal]`
attribute scope is **dropped**, and every new rule is written against bare `#player-edit-modal`. That is
safe because `.pe-*` is emitted in exactly one place today (`openPlayerEditPopup`, `public/app.js:126` and
`:160-199`); the note at `public/styles.css:3330-3335` claiming the Create-tournament dialog shares the
namespace is **stale at this HEAD** (a grep of `app.js` and `manage.js` for `pe-head`, `pe-av`, `pe-who`,
`pe-card`, `pe-save`, `pe-actions`, `pe-body`, `pe-cell`, `pe-2col`, `pe-cancel`, `pe-skillrow` returns
only `openPlayerEditPopup`). The build re-runs that grep before touching bare `.pe-*` and stops if it
returns a second emitter.

**Two more calls this spec makes, with the reason on each** (both listed again in §10 so Mike can flip
them):

- **Focus on open goes to the card container, never to a field.** `.pe-card` gains `tabindex="-1"` and
  takes focus. The Bug A refusal is about a text field grabbing the caret and popping the phone keyboard;
  a dialog container taking focus does neither, and it is what makes Escape and a focus trap conventional.
  Escape does not depend on it either way: the handoff's own key handler is bound on `document`
  (`_shared.js:1209`), so it fires with focus anywhere.
- **The stepper's empty-field behaviour follows the handoff's CODE, not its prose.** README:404 says *"an
  empty field steps to `0` on `+`, `0.5` on `−`"*. Its own implementation at `_shared.js:1197-1199` does
  the opposite: `now = how.charAt(0) === '-' ? 0.5 : 0`, then `now + parseFloat(how)`, so plus gives
  **0.5** and minus gives **0.0**. The code is right and the prose is a transposition: the first tap up
  from unrated should be the smallest real rating, and the first tap down should be the explicit zero
  Mike's call 3 just made meaningful.

## 3. Non-goals

- **The toast, confirm and prompt kit.** `appNotice`, `appConfirm`, `appPrompt` are untouched. The card
  never opens one.
- **The team peek and the score sheet.** No file in the handoff mentions either.
- **`mgckAddAndCheckIn` behaviour.** Mike kept it. Its only change is dropping `CLUB_GROUP` from the two
  places it writes it (`public/manage.js:1220`, `:1231`, `:1240`).
- **The `.ckx-*` and `.mgck-*` CSS blocks as a whole.** The Manage CSS round (C102 scope call, `decisions.md`
  2026-08-26) still owns them. This round adds `.mgck-edit` and `.mgck-add`, deletes nothing from
  `.ckx-*`, and leaves the orphaned `.ckx-gp` / `.mgp-gp` / `.mgp-mg` rules (`public/styles.css:1489`,
  `:2233-2235`, `:2240`) in the file for that round to sweep. The handoff's own defensive
  `display:none !important` hide (`_shared.css` round iv) is **not** ported: the README itself says *"In a
  real implementation, delete the group field, its column, and its API surface, do not hide it with CSS"*
  (README:429-431).
- **`groupRosterPlayersBySection`** (`public/pure.js:652`) and its five cases in `test/pure.test.js:441-492`.
  It already has zero callers in the client at this HEAD; it is an orphan that predates this round and
  orphan removal belongs with the CSS round.
- **`players.tag`.** The client writes group JSON into it (`serializePlayerGroupsTag`, `public/app.js:1009`)
  and this round stops writing it, but the column is not dropped by migration `0068`. See §10.
- **`tournaments."group"`** (`db/migrations/0003_c21_tournaments_group.sql`). A different column on a
  different table. Untouched.
- **The row insert and remove motion helpers** (grow/shrink, `_motion-app.css`). Already ported
  2026-08-24. The row flash reuses `mPlay(el, 'm-flash', 440)` (`public/app.js:5151`,
  `public/styles.css:4521`) at the app's existing 440ms, not the handoff's 460.
- **No new abstraction.** No card component, no modal registry, no state container. The card stays a
  string built by `openPlayerEditPopup` and a document-delegated save.

## 4. The changes, by surface

Copy is quoted verbatim from the handoff. No em dash reaches any emitted string; the middot `·` and the
empty-value en dash `–` are both legal under the copy law (`AS-copy-no-em-dash`: the empty-value dash glyph
stays). Every colour below is an app token or the literal the token resolves to; §51 passes (accent
`oklch(0.55 0.07 240)` = `--accent`, the green family sits at chroma 0.04 to 0.11 on hue 150 against the
app's own `--live` / `--live-soft`; no glow, no electric).

### Surface A: the check-in console (`public/manage.js`)

**A1. The pencil on every roster row.** NEW.
Handoff: README:99, 117-132; `screens/mg-checkin.html:45`; `_shared.css` round (i).
Site: `mgckListHTML`'s inner `row` builder, `public/manage.js:1103-1117` (the emitted row today is
`.ckx-row > .ckx-nm > .mgck-sk > .ckx-go`). CSS home: the `.mgck-*` block, `public/styles.css:2276-2290`.

The row is a `<button>`, so the pencil is a `span` with `role="button"`, exactly as the handoff argues
(README:120-123: nested buttons are invalid HTML). It carries the identity key so the delegate and the
focus-return never have to walk the DOM:

```js
// mgckListHTML, inside row(r): between the name and the rating
const pencil = `<span class="mgck-edit" role="button" tabindex="0" data-mgck-edit="${escapeHTMLText(r.key)}"`
  + ` aria-label="Edit ${escapeHTMLText(r.name)}">`
  + `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">`
  + `<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></span>`;
```

```css
/* the pencil sits between the name and the skill, quiet until it is wanted */
.mgck-edit {
  flex: none; display: grid; place-items: center;
  width: 34px; height: 34px; margin-left: auto;
  border-radius: 10px; border: 1px solid transparent;
  color: oklch(0.62 0.01 75); cursor: pointer;
  transition: color 140ms cubic-bezier(.2,.7,.3,1), background 140ms cubic-bezier(.2,.7,.3,1), border-color 140ms cubic-bezier(.2,.7,.3,1);
}
.mgck-edit svg { width: 15px; height: 15px; }
.mgck-edit:hover, .mgck-edit:focus-visible {
  color: var(--accent); background: var(--accent-soft); border-color: var(--accent-bd); outline: none;
}
.mgck-edit + .mgck-sk { margin-left: 10px; }
/* .ckx-row.is-in sits at opacity .55 (styles.css:1491) and opacity on the parent caps every child,
   so the pencil cannot opt out of it. It gets a darker rest ink on a checked-in row instead. */
.ckx-row.is-in .mgck-edit { color: oklch(0.45 0.01 75); }
```

`.ckx-nm` is `flex: 1` already (`public/styles.css:1487`), so the handoff's `.ckx-row .ckx-nm
{ margin-right: 0 }` is a no-op here and is not ported.
Behaviour: none by itself. Data: none. The kiosk's own `.ckx-row` (`renderCheckinButton`) never emits
`.mgck-edit`, so the public surface is unchanged by A1.

**A2. The "Add player" pill in the page header.** NEW.
Handoff: README:103-115; `screens/mg-checkin.html:36`; `_shared.css` round (v).
Site: `buildManageCheckinHTML`, `public/manage.js:1136-1152`, the `.pd-pagehdr` block at `:1140-1143`.
The pin pattern to copy is `.mgp-selbtn` (`public/styles.css:2224`, emitted at `public/manage.js:1040`).

```js
// buildManageCheckinHTML, replacing the .pd-pagehdr block
return `<div class="pd-pagehdr">
      <button type="button" class="pd-back" data-mg-area="lead" aria-label="Back to Manage">${PK_BACK_SVG}</button>
      <div class="pd-htitle">Check-in</div>
      <button type="button" class="mgck-add" data-mgck-new aria-label="Add a player to the roster">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>Add player</span></button>
    </div>
    ...`;
```

```css
.mgck-add {
  flex: none; display: flex; align-items: center; gap: 6px;
  margin-left: auto; height: 32px; padding: 0 12px 0 10px;
  border: 1px solid var(--accent-bd); border-radius: 999px;
  background: var(--accent-soft); color: var(--accent);
  font-size: 12px; font-weight: 700; letter-spacing: .01em; cursor: pointer;
  transition: background-color .15s ease, border-color .15s ease, transform .09s ease;
}
.mgck-add svg { width: 14px; height: 14px; }
.mgck-add:hover { background: oklch(0.92 0.04 250); }
.mgck-add:active { transform: scale(.97); }
```

Copy verbatim: **"Add player"**. Behaviour: opens the card in add mode (surface B, C1). Data: none until Save.

**A3. The confirmation strip says what happened.** RESTYLE plus behaviour.
Handoff: README:331, 341-344; `_shared.js:1106-1115, 1134, 1164`; `screenshots/07-console-after-adding-a-player.png`
(which shows the new message with **no UNDO**).
Sites: `mgckStripHTML` (`public/manage.js:1096`), `buildManageCheckinHTML` (`:1150`), `mgckRepaint`
(`:1165-1166`), `mgckToggleByKey` (`:1201`).

Today the strip has exactly one source, `mgckLast`, and always carries UNDO. The card's messages are not
undoable (a save writes a name, a rating and possibly an attendance flip; one UNDO button cannot mean all
three), so they get their own binding and `mgckLast` stays honest:

```js
let mgckNotice = null;   // the card's own one-shot message ("{name} updated" / "{name} added"); no UNDO

function mgckStripHTML() {
  // The card's message wins while it is set and carries no UNDO: a card save is a multi-field write and
  // one button cannot undo it. A row tap clears it and the UNDO strip comes straight back.
  if (mgckNotice) return `<span class="mgck-st">${escapeHTML(mgckNotice)}</span>`;
  if (!mgckLast) return '';
  const verb = mgckLast.dir === 'in' ? 'checked in' : 'checked out';
  return `<span class="mgck-st">${escapeHTML(mgckLast.name)} ${verb}</span>`
    + `<button type="button" data-mgck-undo>UNDO</button>`;
}
```

`buildManageCheckinHTML`'s `${mgckLast ? '' : ' hidden'}` and `mgckRepaint`'s `stripEl.hidden = !mgckLast`
both become `(mgckLast || mgckNotice)`. `mgckToggleByKey` sets `mgckNotice = null` on its first line, so a
row tap always returns the UNDO strip. Copy verbatim: **"{Full name} updated"**, **"{Full name} added"**,
and **" · checked in"** appended when the new player was added checked in.

**A4. Recount and row flash after a save.** EXISTING, wire only.
Handoff: README:345-348, 511; `_shared.js:1053-1069, 1131-1132, 1159-1161`.
`mgckRepaint` (`public/manage.js:1156`) already recounts the section heads and the meta strip from
`checkinConsoleModel(mgckRows(), ...)` and already preserves `#tab-manage`'s scrollTop, so the handoff's
hand-rolled `recount()` is not ported at all. The flash reuses the app's helper and the app's duration:

```js
// manage.js, called by the card's save after the repaint has rebuilt the list
function mgckCardNotice(text, key) {
  mgckNotice = String(text || '');
  mgckLast = null;                       // the card's message is not undoable
  mgckRepaint();
  const row = key ? document.querySelector(`.ckx-row[data-mgck-id="${(window.CSS && CSS.escape) ? CSS.escape(key) : key}"]`) : null;
  if (row) mPlay(row, 'm-flash', 440);   // app.js:5151 / styles.css:4521, the app's own 440ms
}
```

The flash must run AFTER the repaint, because `mgckRepaint` replaces `#mgck-list`'s innerHTML and would
throw the class away. Motion is already suppressed under `body.no-motion` and
`prefers-reduced-motion: reduce` by the ported motion system.

**A5. The card's add path.** NEW. See surface B (B6) for the card side.
Handoff: README:271-289, 335-343; `_shared.js:982-1003`; `screens/mg-checkin-new.html:64`.
Site: a new function in `public/manage.js` beside `mgckAddAndCheckIn`.

```js
// The header card's add. Mike (2026-08-29) kept BOTH doors: mgckAddAndCheckIn is the in-list search miss
// and always checks in; this one honours the card's own status toggle and defaults OUT.
// register_player inserts with skill 0 (migration 0020's body), so a rated new player needs a second
// write once the insert returns an id.
async function mgckAddFromCard(name, skill, wantIn) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return;
  const exists = (state.players || []).find((p) => normalize(p.name) === normalize(trimmed));
  if (exists) { openPlayerEditPopup(playerIdentityKey(exists)); return; }
  const n = Number(skill);
  const sk = (Number.isFinite(n) && n > 0) ? Math.max(0, Math.min(10, Math.round(n * 10) / 10)) : 0;
  const inserted = { name: trimmed, skill: sk, pending: true };
  state.players = [...(state.players || []), inserted];
  if (wantIn) checkInPlayer(inserted);
  saveLocal();
  mgckCardNotice(trimmed + ' added' + (wantIn ? ' \u00b7 checked in' : ''), playerIdentityKey(inserted));
  if (!supabaseClient) { inserted.pending = false; return; }
  try {
    const { data, error } = await supabaseClient.rpc('register_player', { p_name: trimmed, p_checked_in: !!wantIn });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (row && row.id) inserted.id = row.id;
    if (inserted.id) {
      inserted.pending = false;
      if (sk > 0) await updatePlayerFieldsSupabase(inserted.id, { skill: sk });
    }
    queueSupabaseRefresh();
  } catch (err) {
    console.error('mgck card register error', err);
    inserted.pending = true;
    outboxEnqueue({ key: 'reg:' + normalize(trimmed), kind: 'register',
                    payload: { name: trimmed, checked_in: !!wantIn, skill: sk }, ts: Date.now() });
  }
  saveLocal();
  mgckRepaint();
}
```

Behaviour and data: one `register_player` call, plus one `updatePlayerFieldsSupabase` only when the card
carried a rating. The row lands under the section head it belongs to for free, because `mgckRepaint`
rebuilds the list from `checkinConsoleModel`, which sections by `checkedIn`
(`public/pure.js:1582-1589`); the handoff's hand-rolled `addRow` insert-under-the-head
(`_shared.js:1096-1102`) is not ported. `pending: true` keeps the in-flight row alive through a racing
sync (`mergePlayersAfterSync`), the same contract `mgckAddAndCheckIn` uses.

The outbox replay must match the new shape. Site: the `register` branch of `flushOutbox`,
`public/app.js:5115`:

```js
else if (op.kind === 'register') {
  res = await supabaseClient.rpc('register_player', { p_name: op.payload.name, p_checked_in: op.payload.checked_in === true });
  // a card-added player carries a rating; register_player only ever inserts skill 0
  const row = res && Array.isArray(res.data) ? res.data[0] : (res && res.data);
  if (!res.error && row && row.id && Number(op.payload.skill) > 0) {
    await updatePlayerFieldsSupabase(row.id, { skill: Number(op.payload.skill) });
  }
}
```

A queued row written by an older client still carries `group` in its payload; the new replay simply does
not read it.

**A6. Groups leave the console row.** Removal.
Sites: `mgckRows` (`public/manage.js:1079-1089`), whose row shape drops the `group` key and its
`getPlayerPrimaryGroup(p)` call and the comment that cites `buildMgpListHTML`; and `mgckListHTML`'s `row`
builder (`:1109, :1114`), which drops `const gp = ...` and the `${gp}` interpolation.
Safe by construction: `checkinConsoleModel` (`public/pure.js:1573-1591`) never reads `group`. It filters,
sorts and counts on `name` and `checkedIn` only, so the model, its 10 cases in
`test/checkin-console.test.js` and every count in the meta strip are untouched.

### Surface B: the shared player card (`public/app.js`)

One element, both surfaces. Every change below lands in `ensurePlayerEditModal` (`public/app.js:116`),
`openPlayerEditPopup` (`:135`), `closePlayerEditPopup` (`:102`) or the delegated save inside
`ensureSaveDelegationBound` (`:395-533`), and in the `.pe-*` CSS block (`public/styles.css:3336-3462`).

**B1. The close × is pinned right in every pop-up.** RESTYLE, and a real defect fix.
Handoff: README:367-374; `_shared.css` round (vi).
Today the × is pushed right only by `.pe-in { margin-left: auto }` (`public/styles.css:3367`), so on a
player who is still out it sits tucked against the name. The app already works around that with an empty
spacer at `public/app.js:161`. Both go:

```js
// openPlayerEditPopup: the pill is emitted only when it is true; no spacer, ever
const inHTML = isIn ? `<span class="mgp-in pe-in">IN</span>` : '';
```

```css
/* Round 2026-08-29: the TITLE takes the slack, so the close button is pinned to the right of every card
   header in the kit, pill or no pill. Two dialogs emit .popup-header: the player card (app.js
   openPlayerEditPopup) and the Home rules sheet (app.js hmRulesModalHTML). Both were read. */
.popup-header .pe-who,
.popup-header .hmv-rtitles { flex: 1 1 auto; min-width: 0; }
.popup-header .pe-in { margin-left: 0; }
.popup-header .pe-x,
.popup-header .hmv-rx { margin-left: auto; }
.popup-header .pe-in + .pe-x { margin-left: 10px; }
```

`.popup-header` is `justify-content: space-between` with `gap: 8px` (`public/styles.css:860-868`), and
`#hm-rules-modal .popup-header` adds `align-items: flex-start` (`:4207-4213`). Adding `flex: 1 1 auto` to
the title block is inert in both layouts and removes the pill's grip on the close button in the card.
The rules sheet's own `.hmv-rtitles` rule at `:4214` keeps its `display: grid; gap: 3px`. The prior lesson
this closes (`NOW.md`, 2026-08-24: *"a handoff can carry its own defect (`.hmv-copy:focus` blanked the
Rules button); read shared classes against every element that uses them"*) is the reason both emitters are
named in the comment and both are driven in §7.

**B2. The card header.** RESTYLE plus two new parts (`.pe-mark`, `.pe-eyebrow` do not exist today).
Handoff: README:160-196; `_shared.css` rounds (ii) and (iii); `screens/mg-checkin-edit.html`.
Site: `openPlayerEditPopup`, the `.popup-header pe-head` block at `public/app.js:164-169`.

```js
const eyebrow = peMode === 'new' ? 'Roster \u00b7 new player' : 'Roster \u00b7 check-in';
const title   = peMode === 'new' ? 'New player' : (whole || 'Edit player');
const avatar  = peMode === 'new' ? '+' : initial;
// ...
`<div class="popup-header pe-head">
  <span class="pe-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5 3.5 6v6.2c0 4.6 3.5 7.9 8.5 9.3 5-1.4 8.5-4.7 8.5-9.3V6Z"/><path d="M9 12.4l2.3 2.3L15.6 10"/></svg></span>
  <span class="pe-av${peMode === 'new' ? ' is-new' : ''}" aria-hidden="true">${escapeHTML(avatar)}</span>
  <span class="pe-who"><span class="pe-eyebrow">${eyebrow}</span><h3 id="player-edit-modal-title">${escapeHTML(title)}</h3></span>
  ${inHTML}
  <button type="button" class="pe-x secondary" data-role="close-popup" data-target="player-edit-modal" aria-label="Close">&times;</button>
</div>`
```

```css
.pe-head {
  position: relative; overflow: hidden;
  display: flex; align-items: center; gap: 12px; flex: none;
  padding: 16px 14px 15px 16px;
  background: var(--accent-soft);
  border-bottom: 1px solid var(--accent-bd);
}
/* nothing in this app is black: the strip is the accent tint the app already uses for emphasis,
   with the mark drawn in the accent itself at 9% */
.pe-mark {
  position: absolute; right: -34px; bottom: -46px; width: 128px; height: 128px;
  color: var(--accent); opacity: .09; pointer-events: none;
}
.pe-mark svg { width: 100%; height: 100%; }
.pe-av {
  position: relative; flex: none; width: 46px; height: 46px;
  display: grid; place-items: center;
  border-radius: 13px; background: #fff; border: 1px solid var(--accent-bd);
  color: var(--accent); font: 800 19px/1 var(--font-display); letter-spacing: .02em;
}
.pe-av.is-new { background: transparent; border-style: dashed; font-weight: 700; font-size: 22px; }
.pe-who { position: relative; display: grid; gap: 3px; min-width: 0; }
.pe-eyebrow {
  font: 700 10px var(--font-display); letter-spacing: .14em; text-transform: uppercase; color: var(--accent);
}
.pe-who h3 { margin: 0; font: 700 21px/1.15 var(--font-display); letter-spacing: .01em; color: var(--ink); }
.pe-in {
  position: relative; flex: none; padding: 4px 9px; border-radius: 999px;
  border: 1px solid oklch(0.86 0.06 150); background: oklch(0.95 0.04 150); color: oklch(0.44 0.11 150);
  font: 700 10px/1 var(--font-display); letter-spacing: .12em; text-transform: uppercase;
}
.pe-x { position: relative; }                       /* sits above the watermark */
.pe-x:hover { color: var(--accent); border-color: var(--accent); background: #fff; }
```

`.pe-av` moves from a 42px accent-tint disc (`public/styles.css:3351-3363`) to a 46px white tile with a
13px radius. `.pe-in` moves from a bare `flex: none; margin-left: auto` (`:3367`) onto the pill skin the
roster already uses. `.pe-x`'s 34px box, 999px radius and `min-width`/`min-height` guards
(`:3368-3385`) are already correct and stay; only its hover ink changes.
The README's *"There is no black or near-black surface anywhere in this app, do not introduce one"*
(README:166) is honoured: the strip is `--accent-soft`.
Copy verbatim: **"Roster · check-in"**, **"Roster · new player"**, **"New player"**, **"IN"**, aria
**"Close"**.

**B3. Section heads inside the card.** NEW.
Handoff: README:201-203, 217, 235; `_shared.css` round (iii); `screens/mg-checkin.html:64`.
Site: `openPlayerEditPopup`'s body block, `public/app.js:170-196`. The pattern is production's own
`.pl-sect` (`public/styles.css:2177-2178`: accent label plus a rule to the right edge), one weight down.

Two heads only, `Player` and `Status`, both rendered uppercase by `.pl-sect`'s
`text-transform: uppercase`. **Skill is a field label, not a section head** (README:217-218 says so
explicitly and `mg-checkin.html:64` emits `<label class="popup-edit-label" for="...">Skill</label>`
inside `.pe-f`); today's card already emits that label at `public/app.js:183`.

```css
.pe-sect { margin: 0 0 11px; font-size: 11px; }
.pe-sect:not(:first-child) { margin-top: 20px; }
```

Copy verbatim: **"Player"**, **"Status"**, **"First name"**, **"Last name"**, **"Skill"**, placeholders
**"First"** and **"Last"**.

**B4. The rating becomes a stepper, and unrated is 0.** RESTYLE plus new controls plus a behaviour fix.
Handoff: README:219-234, 306, 327, 404-405; `_shared.css` round (ii); `_shared.js:1190-1202`;
`screens/mg-checkin.html:64` (`data-mgck-skill="-0.5"` and `"0.5"`).
Sites: the `.pe-skillrow` block in `openPlayerEditPopup` (`public/app.js:182-187`), the save's parse and
abort (`:438, :446`), `public/styles.css:3426-3427`.

Prefill: blank when the player is unrated, so the `–` placeholder shows. This matches `mgpSkillText`'s
grammar exactly (`public/manage.js:956-959`: `n > 0` renders one decimal, everything else renders `–`):

```js
const skillValue = (Number.isFinite(Number(player.skill)) && Number(player.skill) > 0)
  ? Number(player.skill).toFixed(1) : '';
// ...
`<div class="pe-f">
  <label class="popup-edit-label" for="pe-skill">Skill</label>
  <div class="pe-skillrow"><div class="pe-stepper">
    <button type="button" class="pe-sb" data-pe-skill="-0.5" aria-label="Lower skill">&#8722;</button>
    <input id="pe-skill" type="number" class="edit-skill popup-edit-input pe-skillin" placeholder="&#8211;" step="0.5" min="0" max="10" value="${escapeHTMLText(skillValue)}" />
    <button type="button" class="pe-sb" data-pe-skill="0.5" aria-label="Raise skill">+</button>
  </div></div>
</div>`
```

```js
// The step maths. Clamp 0 to 10 in 0.5 steps, one decimal. An empty field is unrated: the first tap UP
// is the smallest real rating (0.5), the first tap DOWN is the explicit 0 (Mike, 2026-08-29:
// unrated IS skill 0). This follows _shared.js:1197-1199; README:404 states it transposed.
function peSkillStep(rawValue, delta) {
  let now = parseFloat(rawValue);
  if (Number.isNaN(now)) now = delta < 0 ? 0.5 : 0;
  return Math.min(10, Math.max(0, now + delta)).toFixed(1);
}
```

```css
.pe-skillrow { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.pe-stepper {
  display: flex; align-items: center; gap: 4px; padding: 4px;
  border: 1px solid var(--border); border-radius: 13px; background: oklch(0.985 0.003 75);
}
.pe-sb {
  flex: none; width: 38px; height: 38px; display: grid; place-items: center; padding: 0;
  border: 1px solid var(--border); border-radius: 10px; background: #fff; color: var(--ink);
  font-size: 17px; font-weight: 700; line-height: 1; cursor: pointer;
  transition: color .15s ease, background-color .15s ease, border-color .15s ease;
}
.pe-sb:hover { color: var(--accent); border-color: var(--accent-bd); background: var(--accent-soft); }
#player-edit-modal .pe-skillin {
  width: 74px; height: 38px; text-align: center;
  font: 700 17px var(--font-display); font-variant-numeric: tabular-nums;
  border-color: transparent; background: transparent; -moz-appearance: textfield;
}
#player-edit-modal .pe-skillin::-webkit-outer-spin-button,
#player-edit-modal .pe-skillin::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
#player-edit-modal .pe-skillin:focus { box-shadow: none; border-color: transparent; }
```

`.pe-skillrow`'s old `display: grid` and `.pe-skillin`'s old `width: 108px` (`public/styles.css:3426-3427`)
are replaced, not layered. `.pe-hint` (`:3428`) has no emitter today and is left for the CSS round.
The handoff's `.pe-clear` chip (`_shared.css` round ii) is **not** ported: with unrated equal to 0, minus
from 0.5 reaches it in one tap and a second control for the same value is noise.

The save, in `ensureSaveDelegationBound` (`public/app.js:435-448`):

```js
    let skill = parseFloat(skillInput?.value);
    // 2026-08-29 (Mike): unrated IS skill 0, saved normally. This used to be
    // `if (!name || Number.isNaN(skill)) return;`. A blank rating aborted the save in SILENCE, so an
    // organiser fixing a typo on an unrated player watched the card close and nothing change.
    if (!name) { if (nameInput) nameInput.focus(); return; }
    if (Number.isNaN(skill)) skill = 0;
    skill = Math.max(0, Math.min(10, Math.round(skill * 10) / 10));
```

Name empty is now the ONLY validation rule (README:326), and it focuses First name rather than aborting
in silence. Data: `players.skill` stays `not null` with a 0 default; no migration.

**B5. Check in / Check out inside the card, as a DRAFT.** NEW.
Handoff: README:236-253, 316-322, 394-406; `_shared.css` round (iii); `_shared.js:974-980, 1179-1189`.
Sites: `openPlayerEditPopup`'s body (a new `.pe-inbtn` under the Status head), a click branch in the
delegated handler, and the save.

```js
`<div class="pl-sect pe-sect">Status</div>
<button type="button" class="pe-inbtn${isIn ? ' is-in' : ''}" data-pe-in aria-pressed="${isIn ? 'true' : 'false'}">
  <svg class="pe-ico pe-ico-in" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 12.5l2.5 2.5L15.5 9"/><circle cx="12" cy="12" r="9"/></svg>
  <svg class="pe-ico pe-ico-out" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15.5 4.5H18a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-2.5"/><path d="M9.5 8.5 6 12l3.5 3.5"/><path d="M6 12h9"/></svg>
  <span data-pe-inlabel>${isIn ? 'Check out' : 'Check in'}</span>
</button>`
```

```css
.pe-inbtn {
  display: flex; align-items: center; justify-content: center; gap: 9px;
  width: 100%; height: 48px; padding: 0 16px; border-radius: 13px;
  border: 1px solid oklch(0.80 0.10 150); background: oklch(0.95 0.045 150); color: oklch(0.40 0.11 150);
  font-size: 14px; font-weight: 700; cursor: pointer;
  transition: background-color .15s ease, border-color .15s ease, color .15s ease, transform .09s ease;
}
.pe-inbtn:hover { background: oklch(0.92 0.06 150); }
.pe-inbtn:active { transform: scale(.99); }
.pe-inbtn .pe-ico { width: 17px; height: 17px; flex: none; }
.pe-inbtn .pe-ico-out, .pe-inbtn.is-in .pe-ico-in { display: none; }
.pe-inbtn.is-in .pe-ico-out { display: block; }
/* already in: the action left is undoing it, so it stops shouting */
.pe-inbtn.is-in { border-color: var(--border); background: #fff; color: var(--ink); }
.pe-inbtn.is-in:hover { background: oklch(0.97 0.003 75); border-color: oklch(0.82 0.008 75); }
```

The toggle is a draft. Nothing reaches the roster until Save (README:321). It flips `aria-pressed`, the
`is-in` class, the label, and the header pill in the same tick:

```js
// inside ensureSaveDelegationBound's click handler, ABOVE the .btn-save-edit branch
const inBtn = e.target.closest('[data-pe-in]');
if (inBtn) {
  e.preventDefault(); e.stopPropagation();
  const on = inBtn.getAttribute('aria-pressed') !== 'true';
  inBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
  inBtn.classList.toggle('is-in', on);
  const lbl = inBtn.querySelector('[data-pe-inlabel]');
  if (lbl) lbl.textContent = on ? 'Check out' : 'Check in';
  const head = document.querySelector('#player-edit-modal .pe-head');
  const pill = head ? head.querySelector('.pe-in') : null;
  if (on && !pill && head) head.insertBefore(peInPillNode(), head.querySelector('.pe-x'));
  else if (!on && pill) pill.remove();
  return;
}
```

Copy verbatim: **"Check in"**, **"Check out"**. Aria: `aria-pressed`. Data: nothing here.

**B6. Save.** RESTYLE of behaviour, and the one place data is written.
Handoff: README:323-344; changes 9, 13, 14, 15, 16, 20 in `S/DIGEST.md`.
Site: `ensureSaveDelegationBound`'s `.btn-save-edit` branch, `public/app.js:415-532`.

Three additions to a handler that otherwise keeps its whole optimistic-then-remote shape:

```js
    // 1) ADD MODE. The card in .is-new has no player row to update; it registers one.
    if (peMode === 'new') {
      const wantIn = !!(document.querySelector('#player-edit-modal [data-pe-in]')
        && document.querySelector('#player-edit-modal [data-pe-in]').getAttribute('aria-pressed') === 'true');
      closePlayerEditPopup();
      void mgckAddFromCard(name, skill, wantIn);   // manage.js; see A5
      return;
    }

    // 2) THE STATUS DRAFT, applied once and only on a real change. mgckToggleByKey is the ONLY maintained
    // attendance writer (check_in / check_out plus the outbox on failure). `silent` keeps mgckLast null so
    // UNDO never points at a card save; the card sets its own strip message below.
    const inBtnEl = document.querySelector('#player-edit-modal [data-pe-in]');
    if (inBtnEl) {
      const wantIn = inBtnEl.getAttribute('aria-pressed') === 'true';
      const isInNow = new Set(state.checkedIn || []).has(rowPlayerKey);
      if (wantIn !== isInNow) mgckToggleByKey(rowPlayerKey, wantIn ? 'in' : 'out', { silent: true });
    }

    // 3) REPAINT IN PLACE, never render(). A full render rebuilds the shell and throws the console's
    // scroll position away mid-check-in. peOrigin is set by openPlayerEditPopup.
    saveLocal();
    closePlayerEditPopup();
    closeInlineEditRow(row);
    if (peOrigin === 'checkin' && typeof mgckCardNotice === 'function') mgckCardNotice(name + ' updated', rowPlayerKey);
    else if (typeof repaintManage === 'function') repaintManage();
    else render();
```

`render()` at `public/app.js:475` is the line that goes. The fallback keeps a shape that cannot break if
`manage.js` ever fails to load: the delegate is document-level and the card only opens from Manage, so the
fallback is unreachable in practice and exists so the seam is never a throw. `mgckToggleByKey` calls
`mgckRepaint()` itself; `mgckCardNotice` repaints again and then flashes, so the flash always lands on a
live element.
Copy verbatim: **"Save changes"** (edit), **"Add player"** (add), **"Cancel"**.

**B7. Open, close, keyboard, focus.** Partly NEW.
Handoff: README:294-313, 357-365; `_shared.js:1005-1012, 1040-1050, 1204-1218`.

- **Open** (`openPlayerEditPopup`): sets `peMode` (`'edit'` or `'new'`), `peOrigin`
  (`manageView === 'checkin' ? 'checkin' : 'players'`) and `peReturnKey` (the identity key, so the pencil
  can be re-found after a repaint). `document.body.style.overflow = 'hidden'` already locks the background
  (`public/app.js:207`). **No field is focused.** Focus goes to `.pe-card`, which gains `tabindex="-1"` in
  `ensurePlayerEditModal` (`public/app.js:126`).
- **A new-mode opener**, `openPlayerAddPopup()`, is a thin sibling: it sets `peMode = 'new'`, skips the
  `state.players.find` lookup entirely (today `openPlayerEditPopup` returns early on a missing player,
  `public/app.js:140-141`), and renders the same card with empty fields, no pill, `aria-pressed="false"`
  and a `Add player` primary.
- **Close** (`closePlayerEditPopup`): already clears `display`, `aria-hidden` and the body scroll lock. It
  gains `peMode = null; peOrigin = null;` and the focus return, by re-query because the list may have been
  repainted under it:

```js
  const key = peReturnKey; peReturnKey = '';
  if (key) {
    const back = document.querySelector(`.mgck-edit[data-mgck-edit="${(window.CSS && CSS.escape) ? CSS.escape(key) : key}"]`);
    if (back) back.focus();
  }
```

- **Escape closes; Enter in a text field saves.** A once-bound `document` keydown beside
  `ensureSaveDelegationBound`, guarded on the modal actually being open so it costs nothing on every other
  screen:

```js
document.addEventListener('keydown', (e) => {
  const modal = document.getElementById('player-edit-modal');
  if (!modal || modal.style.display !== 'flex') return;
  if (e.key === 'Escape') { e.preventDefault(); closePlayerEditPopup(); }
  else if (e.key === 'Enter' && e.target && e.target.classList.contains('popup-edit-input')) {
    e.preventDefault();
    const save = modal.querySelector('.btn-save-edit');
    if (save) save.click();
  }
});
```

- **The scrim closes, the card does not.** Already true: `ensurePlayerEditModal` binds
  `if (e.target === el || ...) closePlayerEditPopup()` at `public/app.js:129-131`.
- **Nothing is written on close.** Already true. The draft lives only in the DOM.

**B8. Groups leave the card.** Removal.
Sites: `openPlayerEditPopup`'s two hidden inputs (`public/app.js:193-194`) and their guarding comment
(`:188-192`), the `playerGroup` / `playerGroups` / `groupsValue` derivation (`:143-145`), and the save's
group reads and writes (`:430-431, :439-444, :461, :489, :491-511, :515`).

The comment at `:188-192` is the whole reason the hidden inputs exist (*"dropping them would silently WIPE
a player's groups every time an organiser fixed a name"*). With `players."group"` gone there is nothing to
wipe, so the inputs and every group term in `next`, in `updatePlayerFieldsSupabase`'s payload and in the
three-way insert fallback go together. The insert fallback collapses to one shape:

```js
            const { data, error } = await supabaseClient.from('players').insert([{ name, skill }]).select();
```

`ensureGroupCatalogEntriesSupabase(groups)` at `:515` is deleted with the rest of the catalog layer (D3).

### Surface C: the delegates (`public/app.js`, `attachHandlers`)

**C1. The pencil and the Add player pill, checked BEFORE the row toggle.** NEW.
Handoff: README:296-299; `_shared.js:1168-1178, 1209-1215`.
Site: the `manageView === 'checkin'` branch of `attachHandlers`, `public/app.js:9217-9229`. The two new
checks go **above** the `[data-mgck-id]` row toggle at `:9227-9228`, which is what makes the pencil not
also check the player in:

```js
        const pen = e.target.closest('[data-mgck-edit]');
        if (pen) {
          // ABOVE the row toggle on purpose: the pencil sits inside the row <button>, so without this the
          // tap would ALSO fire the check-in at :9227.
          e.preventDefault(); e.stopPropagation();
          openPlayerEditPopup(pen.getAttribute('data-mgck-edit') || '');
          return;
        }
        if (e.target.closest('[data-mgck-new]')) { e.preventDefault(); openPlayerAddPopup(); return; }
```

Keyboard: the pencil is `role="button" tabindex="0"`, so Enter and Space must open it. `attachHandlers`
already owns a `keydown` delegate on the Manage panel; the check is the same shape:

```js
        const penKey = e.target.closest && e.target.closest('[data-mgck-edit]');
        if (penKey && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault(); e.stopPropagation();
          openPlayerEditPopup(penKey.getAttribute('data-mgck-edit') || '');
        }
```

**C2. The group delegates go.** Removal.
Sites, all in the `manageView === 'players'` branch of `attachHandlers`: `[data-mgp-groups]`
(`public/app.js:9190`), `[data-mgp-gadd]` (`:9191`), `[data-mgp-grename]` (`:9192`),
`[data-mgp-grename-save]` (`:9193`), `[data-mgp-grename-cancel]` (`:9194`), `[data-mgp-gdelete]` (`:9195`),
`[data-mgp-bulk="move"]` (`:9198`), `[data-mgp-movegrp]` (`:9200`), plus the `mgMoveOpen` and
`mgRenameGroup` resets at `:9189, :9199` and the Manage-view reset at `:9483`.

### Surface D: Manage to Players (`public/manage.js`)

**D1. The crew subline under each name.** Removal. `buildMgpListHTML`, `public/manage.js:994-995`
(`const grp = getPlayerPrimaryGroup(p)` and `gpHTML`) and `:1004` (the `${gpHTML}` interpolation).

**D2. The "N groups" counter and the manager panel.** Removal.
`buildManagePlayersHTML` (`public/manage.js:1032-1073`): `const groupCount` at `:1035`, the `.mgp-mg`
button at `:1050`, `const groupsSection = mgGroupsOpen ? buildMgpGroupsHTML() : ''` at `:1053` and its
mount at `:1072`, the `moveChips` block at `:1059-1063`, and the `data-mgp-bulk="move"` button at `:1067`.
`buildMgpGroupsHTML` (`:1011-1028`) is deleted whole. The bindings `mgGroupsOpen`, `mgMoveOpen` and
`mgRenameGroup` (`public/manage.js:26-28`) go with them.

**D3. The group write paths.** Removal. `mgpBulkGroup` (`public/manage.js:1286`), `mgpAddGroup` (`:1355`),
`mgpRenameGroupCommit` (`:1368`), `mgpDeleteGroup` (`:1397`) are deleted whole.
`mgpAddPlayer` (`:1323`) drops `group: ''` and `groups: []` from its optimistic row (`:1329`) and the
`HAS_TAG` ternary from its insert (`:1336`), which becomes `{ name, skill: 0 }`.
`mgckAddAndCheckIn` (`:1212`) drops `CLUB_GROUP` from its optimistic row (`:1220`), its RPC call (`:1231`)
and its outbox key and payload (`:1240`).

### Surface E: the public kiosk (`public/app.js`)

**E1. The row subline.** Removal, and the KIOSK TIEBREAKER call in code.
`renderCheckinButton` (`public/app.js:6106-6113`) drops `const group` at `:6109` and `${group}` at `:6111`,
and gains nothing in its place. The comment block above it (`:6102-6105`, *"Same-name rows keep the group
differentiator only (never skill)"*) is rewritten to record Mike's ruling verbatim. The comment at
`public/styles.css:1466-1469`, which names `.ckx-gp` as the only same-name disambiguator on a public
surface, is rewritten the same way (the rule it cites, §AS-1 admin-only skill ratings, is unchanged and
still forbids skill here).

**E2. The kiosk registration.** `public/app.js:9760-9765` (`activeGroupForRegister`, `group`, `groups`),
`:9786` (the RPC's `p_group`), `:9790` (`ensureGroupCatalogEntriesSupabase`), `:9798` (the outbox key and
payload). `state.activeGroup` and `LS_ACTIVE_GROUP_KEY` retire with the helper layer.

**E3. The kiosk row shape.** `disambiguatePlayersByName` (`public/pure.js:613-638`) drops `group` from the
row it returns (`:632`) and from its doc comment (`:607-608`). `buildKioskResultsHTML`
(`public/app.js:6132`) drops it from the row it forwards. `test/pure.test.js:426-430` asserts the exact
row shape and is edited with it (§7).

### Surface F: the standalone kiosk page (`public/checkin.html`)

`const GROUP_NAME = CLUB_GROUP;` at `public/checkin.html:300` is deleted, and the RPC call at `:539`
becomes:

```js
      const { error } = await sb.rpc('register_player', { p_name: fullName, p_checked_in: true });
```

The two comment blocks at `:429-432` that explain the NF-9 full-roster load keep their history and lose
their forward-looking clause about tagging new registrants into `CLUB_GROUP`.
`CLUB_GROUP` itself (`public/supabase-config.js:12`) is then unreferenced and is deleted in the same
commit.

### Surface G: the client group layer (`public/app.js`)

Deleted whole, in one commit, after every emitter above is gone: `LS_GROUPS_KEY` and
`LS_ACTIVE_GROUP_KEY` (`:38-39`), `UNGROUPED_FILTER_VALUE` / `UNGROUPED_FILTER_LABEL` (`:45-46`),
`GROUP_CATALOG_NAME_PREFIX` / `GROUPS_TAG_PREFIX` (`:47-48`), `computeCheckedInByGroup` (`:58`),
`normalizeActiveGroupSelection` (`:87`), `normalizeGroupName` (`:984`), `normalizeGroupKey` (`:988`),
`toGroupCatalogRowName` (`:992`), `parseGroupCatalogRowName` (`:998`), `serializePlayerGroupsTag` (`:1009`),
`parsePlayerGroupsTag` (`:1024`), `parseRemotePlayerGroupDetails` (`:1037`),
`mergeRemoteGroupCatalogIntoState` (`:1061`), `normalizeGroupList` (`:1073`), `getPlayerGroups` (`:1087`),
`getPlayerPrimaryGroup` (`:1097`), `playerBelongsToGroup` (`:1102`), `isPlayerUngrouped` (`:1108`),
`sanitizePlayersAgainstAllowedGroups` (`:1112`), `enforceCanonicalGroupState` (`:1134`),
`persistCanonicalGroupCache` (`:1171`), `normalizePlayerGroupShape` (`:1178`),
`normalizePlayerGroupsInState` (`:1198`), `parseEditGroupsValue` (`:1232`), `getEditGroupsFromRow` (`:1243`),
`renderEditGroupChipsMarkup` (`:1253`), `updateEditRowGroupUI` (`:1277`),
`computeGroupCatalogSyncSignature` (`:1544`), `queueGroupCatalogSync` (`:1552`),
`runQueuedGroupCatalogSync` (`:1561`), `getSharedGroupSyncModeLabel` (`:4693`), `getAvailableGroups`
(`:4784`), `listGroupCatalogRowsSupabase` (`:5773`), `ensureGroupCatalogEntrySupabase` (`:5783`),
`renameGroupCatalogEntrySupabase` (`:5833`), `ensureGroupCatalogEntriesSupabase` (`:5855`),
`deleteGroupCatalogEntrySupabase` (`:5872`), `backfillGroupCatalogToSupabase` (`:5906`), and
`state.groups` / `state.activeGroup` with their `loadLocal` and `saveLocal` terms (`:5233, :5250,
:5258-5266, :5287`, plus `:7469` and `:9618`).

**Two survive, changed rather than deleted**, because they carry non-group work:

- `detectPlayersSchema` (`public/app.js:5711`) keeps its `tag` probe and loses its `group` probe;
  `HAS_GROUP` goes and `HAS_TAG` stays until `players.tag` is decided (§10). The probe is what makes the
  ordering in §8 safe: once `players."group"` is dropped the select errors, `HAS_GROUP` reads false, and
  nothing is written to a column that is not there.
- `updatePlayerFieldsSupabase` (`:5738`) keeps its signature and loses the whole
  `group` / `groups` / `canonicalGroups` / `tag` block (`:5744-5761`); with the column gone the only fields
  any caller passes are `name`, `skill` and `claimed_by_profile`.

## 5. The data change: migration `0068`

Highest migration present is `0067_move_noop_and_clear_live_guard.sql`, so this is **`0068`**. House style
read from `0066` and `0067`: a header comment that says WHY in prose, a `ROLLBACK:` line, an `APPLIED`
marker left for the controller to stamp, then the DDL, then the `revoke` / `grant` pair on every function.

File: `db/migrations/0068_drop_player_groups.sql`.

```sql
-- 0068_drop_player_groups.sql: groups leave the product.
--
-- Mike (2026-08-29): "remove the groups from the app, we dont even use it." Groups were a second, unused
-- way to organize ONE roster. They cost every list a subline, the players list a "N groups" counter, the
-- edit card a hidden field it had to carry so a name fix would not wipe membership, and register_player a
-- parameter every caller had to pass. The client stopped emitting and stopped sending them one deploy
-- before this file runs (the 0017 -> 0018 expand/contract precedent: 0018's own header records that it
-- waited for a deployed, verified app so the live app never lost a group mid-deploy).
--
-- What goes: the `groups` catalog table (0017), players."group" with its normalize trigger and trigger
-- function (0020), the group term in the dedup unique index (0011/0012), and register_player's p_group
-- parameter plus the "group" column it returned (last defined in 0020).
-- The 3-arg overload is DROPPED, not left standing beside the new one: PostgREST resolves an overload by
-- the argument names the caller sends, so two live signatures would let a stale cached client keep
-- registering into a column that no longer exists.
-- What stays: tournaments."group" (0003) is a different column on a different table. players.tag is not
-- touched here (the client stops writing group JSON into it in the same release; the column's fate is an
-- open item on the round's spec).
--
-- Dedup narrows from (name, group) to name. Mike, same day, on the kiosk's same-name rows: "thats almost
-- impossible to have the same full name, just leave it." The PRE-FLIGHT read-back below must return zero
-- rows before this file is applied, or the unique index will not build.
--
-- ROLLBACK: re-run 0017's create table + index + policies + grants (skip its backfill, the source rows
--   are gone), then `alter table public.players add column "group" text;`, then re-apply 0020 verbatim
--   (the trigger function, the trigger, and the 3-arg register_player), then
--   `drop index if exists public.players_real_name_uidx;` and recreate players_real_name_group_uidx from
--   0012. Group VALUES are not recoverable after this runs.
--
-- APPLIED <yyyy-mm-dd> via the Supabase MCP (apply_migration), the check-in pop-ups round.

-- PRE-FLIGHT (run alone, read the result, and only then apply the rest). Must return zero rows:
--   select lower(btrim(name)) as nm, count(*) as c
--     from public.players
--    where left(name, 5) <> '__as_'
--    group by 1 having count(*) > 1;

begin;

-- the dedup index carries the column, so it goes first
drop index if exists public.players_real_name_group_uidx;
create unique index if not exists players_real_name_uidx
  on public.players (lower(btrim(name)))
  where left(name, 5) <> '__as_';

-- 0020's group-normalizing trigger has nothing left to normalize
drop trigger if exists players_normalize_group on public.players;
drop function if exists public.tg_players_normalize_group();

-- register_player without p_group. Body is 0020's minus every group term; the insert still writes skill 0,
-- so a rated new player takes a second write from the client (updatePlayerFieldsSupabase).
create or replace function public.register_player(p_name text, p_checked_in boolean default false)
returns table(id uuid, name text, checked_in boolean)
language plpgsql security definer set search_path to 'public' as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_id   uuid;
  v_actor text; v_role text; v_grp text;
begin
  if v_name = '' then raise exception 'name required'; end if;
  if length(v_name) > 80 then raise exception 'name too long (max 80)'; end if;

  select pl.id into v_id from public.players pl
    where lower(btrim(pl.name)) = lower(v_name)
      and left(pl.name, 5) <> '__as_'
    limit 1;

  if v_id is null then
    begin
      insert into public.players(name, skill, checked_in)
        values (v_name, 0, coalesce(p_checked_in, false))
        returning players.id into v_id;
      select a.actor, a.role, a.grp into v_actor, v_role, v_grp from public._audit_actor() a;
      insert into public.action_log(actor, role, grp, action, entity_type, entity_id, detail)
        values (v_actor, v_role, v_grp, 'register', 'players', v_id::text, v_name);
    exception when unique_violation then
      select pl.id into v_id from public.players pl
        where lower(btrim(pl.name)) = lower(v_name)
          and left(pl.name, 5) <> '__as_'
        limit 1;
    end;
  end if;

  if coalesce(p_checked_in, false) then
    update public.players set checked_in = true where players.id = v_id;
    insert into public.check_ins(session_id, player_id)
      values (public.current_session_id(), v_id)
      on conflict (session_id, player_id) do nothing;
  end if;

  return query
    select pl.id, pl.name, pl.checked_in from public.players pl where pl.id = v_id;
end $$;
revoke all on function public.register_player(text, boolean) from public;
grant execute on function public.register_player(text, boolean) to anon, authenticated;

-- the old signature, gone in the same transaction as the column it wrote
drop function if exists public.register_player(text, text, boolean);

alter table public.players drop column if exists "group";

drop table if exists public.groups;

commit;
```

**Why the client can ship first with zero downtime.** The live `register_player` is
`(p_name text, p_group text default ''::text, p_checked_in boolean default false)`
(`db/migrations/0020_group_null_normalize.sql`). `p_group` **has a default**, so the new client's two-key
call `rpc('register_player', { p_name, p_checked_in })` resolves against the OLD function and registers
into an empty group, which `0020`'s trigger already normalizes to NULL. The client can therefore ship,
be driven and be proven before any SQL runs, and the September 12th 2026 tournament with registration open
is never mid-state.

**Every caller, by function name and file** (all four move to the two-key call in the same client
release, task T9):

| Caller | File | Site |
|---|---|---|
| `mgckAddFromCard` (new, A5) | `public/manage.js` | its only RPC call |
| `mgckAddAndCheckIn` | `public/manage.js:1231` | `p_group: CLUB_GROUP` goes |
| the kiosk tap handler inside `attachHandlers` | `public/app.js:9786` | `p_group: group` goes |
| the `register` branch of `flushOutbox` | `public/app.js:5115` | `p_group: op.payload.group \|\| ''` goes |
| the standalone kiosk page | `public/checkin.html:539` | `p_group: GROUP_NAME` goes |

**Read-back checks, run after the transaction commits and recorded in the round's history file:**

1. `select count(*) from information_schema.columns where table_schema='public' and table_name='players' and column_name='group';` returns `0`.
2. `select to_regclass('public.groups');` returns NULL.
3. `select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='public' and p.proname='register_player';` returns exactly one row, `register_player(text,boolean)`.
4. `select indexdef from pg_indexes where schemaname='public' and indexname='players_real_name_uidx';` exists and names `lower(btrim(name))` with no `group` term; `players_real_name_group_uidx` is gone.
5. Player count identical before and after: `select count(*) from public.players where left(name,5) <> '__as_';` on both sides of the transaction.
6. A live smoke through the anon door: `select * from public.register_player('Zz Smoketest', false);` returns one row, then the row is deleted by id. Run it on the kiosk path, not on a real name.
7. `get_advisors` (security and performance) shows no class that was not there before.

## 6. What must not reopen

| Must not reopen | How it could | The guard |
|---|---|---|
| A row tap checking a player in when the organizer meant to edit | the pencil is inside the row `<button>`, so the row's own handler fires on the same tap | the `[data-mgck-edit]` branch sits ABOVE `[data-mgck-id]` in `attachHandlers` and calls `stopPropagation`. Test: a synthetic click on the pencil opens the card and leaves `state.checkedIn` unchanged |
| A double attendance write | the card's Save applying the status unconditionally, on top of a row that was already in that state | compare the draft flag against `new Set(state.checkedIn).has(key)` and call `mgckToggleByKey` only on a real difference. Test: Save with no status change fires zero `check_in` and zero `check_out` |
| A cancelled card writing anything | the status button writing straight through, the way a row tap does | the toggle only mutates DOM attributes and classes. Test: toggle, then Cancel, then assert `state.checkedIn` unchanged and the RPC spy empty |
| UNDO undoing the wrong thing | `mgckLast` left pointing at a stale toggle while the strip shows a card message | the card's toggle is `{ silent: true }` (so `mgckLast` is nulled) and `mgckCardNotice` sets `mgckNotice` and clears `mgckLast`; `mgckToggleByKey` clears `mgckNotice` on entry. Test: card save shows "{name} updated" with no UNDO button; a following row tap shows "{name} checked in" WITH one |
| The console losing its place mid-check-in | the save calling `render()` (`public/app.js:475`) | `mgckCardNotice` -> `mgckRepaint`, which saves and restores `#tab-manage`'s scrollTop (`public/manage.js:1159-1167`). Test: no `render` call from a check-in-origin save |
| The silent save | the `Number.isNaN(skill)` half of the abort at `public/app.js:446` coming back | one validation rule, name-empty, and it focuses First name. Test: save a blank rating, assert the player row now reads `skill === 0` and the card closed |
| The Bug A autofocus (2026-06-21, `12-history/task-#10-edit-autofocus-name.md`) | porting `_shared.js:1010-1011` verbatim | a source guard: `openPlayerEditPopup` and the add opener contain no `.select()` and no `focus()` on `#pe-first` / `#pe-last` / `#pe-skill` |
| The Rules sheet's close button | change B1 edits `.popup-header`, which two dialogs share (`public/app.js:164` the card, `:4248` the rules sheet) | the new rules name `.hmv-rtitles` and `.hmv-rx` explicitly; the drive opens the Home rules sheet as well as the card. Precedent: the `.hmv-copy:focus` defect a prior handoff carried (`NOW.md`, 2026-08-24) |
| The pencil invisible on a checked-in row | `.ckx-row.is-in { opacity: .55 }` (`public/styles.css:1491`) caps every child, and a child cannot raise it | `.ckx-row.is-in .mgck-edit` gets a darker rest ink. Verified by eye at 390 and 1280, both row states |
| A public surface showing skill (§AS-1) | the stepper is in a card that also opens from Manage; the kiosk row builder is a different function | the card is admin-only on both its surfaces; `renderCheckinButton` and `disambiguatePlayersByName` gain nothing in this round. A source guard asserts `renderCheckinButton`'s output contains no digit-bearing skill span |
| A duplicate top-level name across `app.js` and `manage.js` | a new helper declared in both files; a duplicate `function` is LEGAL and the second silently wins (C102 §5.3 / hazard 5) | the new names are disjoint by construction (`app.js`: `peMode`, `peOrigin`, `peReturnKey`, `peSkillStep`, `peInPillNode`, `openPlayerAddPopup`; `manage.js`: `mgckNotice`, `mgckCardNotice`, `mgckAddFromCard`) and C102's name-intersection guard test runs on the branch |
| The C102 equivalence proof | this round changes five Manage builders on purpose | the branch never merges before C102 Task 9's `diff before.json after.json` has run clean on main. §8 |
| A stale client calling a dropped RPC | the migration landing before the deploy, or before the service worker has refreshed | `p_group` has a default, so the two-key call works against BOTH signatures. The client ships and is driven first; `APP_VERSION` bumps, which mints a new SW cache and re-fetches network-first |
| Groups coming back through a hide | porting the handoff's `.ckx-gp, .mgp-gp, .mgp-mg { display: none !important }` | not ported. A whole-file guard asserts no emitted string in `app.js` or `manage.js` contains those class names |

## 7. Tests

**Facts about the harness as it stands at `a0c9f8f`, read rather than assumed:**

- **No test file references `mgck` at all.** `grep -rn mgck test/` returns zero matches. The digest's
  pointer to check-in tests in `manage-round.test.js` and `manage-page.test.js` does not hold: those files
  test `buildManagePageHTML`, `manageNeedsYouModel` and the CSS, not the console.
- **No harness loads `public/manage.js` yet** (C102 Task 7). Every vm harness reads `pure.js` then
  `app.js` (for example `test/manage-page.test.js:11-13`). Until T7 lands, 15 files / 543 tests are red by
  design and this round cannot be green.
- `test/manage-round.test.js:507` is the only existing assertion that names the card:
  `expect(count(css, '#player-edit-modal .pe-save')).toBeGreaterThanOrEqual(1);`
- All four client files are CRLF in the working tree (`core.autocrlf = true`, no `.gitattributes`) while
  git stores LF. Any new source-scan assertion must be newline-agnostic.

**New file: `test/checkin-popups.test.js`.** The vm harness is copied from `test/manage-page.test.js:11-60`
with `manage.js` loaded between `pure.js` and `app.js`, matching the C102 §5.6 shape. New cases go here,
never into the ten files C102 Task 8 edits.

| Change | File | The assertion |
|---|---|---|
| A1 pencil | `test/checkin-popups.test.js` | `mgckListHTML` output carries one `data-mgck-edit="{key}"` per row, `role="button"`, `tabindex="0"` and `aria-label="Edit {name}"`; the pencil sits between `.ckx-nm` and `.mgck-sk` in document order |
| A2 add pill | `test/checkin-popups.test.js` | `buildManageCheckinHTML` contains `class="mgck-add"`, `data-mgck-new` and the literal `Add player`, inside `.pd-pagehdr` |
| A3 strip | `test/checkin-popups.test.js` | with `mgckNotice` set, `mgckStripHTML()` contains the message and NOT `data-mgck-undo`; with only `mgckLast` set it contains both; `mgckToggleByKey` clears `mgckNotice` |
| A4 recount | `test/checkin-popups.test.js` | after `mgckCardNotice`, the meta strip counts and both section-head counts match `state.checkedIn` (the model already does the work; this pins the wiring) |
| A5 add path | `test/checkin-popups.test.js` | `mgckAddFromCard('Zoe Park', 6.5, false)` calls `register_player` exactly once with `{ p_name, p_checked_in: false }` and NO `p_group` key, then `updatePlayerFieldsSupabase` once with `{ skill: 6.5 }`; with skill 0 the second call never fires; a duplicate name opens the card instead of registering |
| A5 outbox | `test/checkin-popups.test.js` | with the RPC throwing, exactly one outbox row is enqueued with `kind: 'register'` and a payload carrying `checked_in` and `skill` and no `group` |
| A6 / D1 / D2 / E1 groups off every list | `test/checkin-popups.test.js` | a whole-file scan of `appSrc + '\n' + mgSrc` contains none of `ckx-gp`, `mgp-gp`, `mgp-mg`, `data-mgp-groups`, `data-mgp-movegrp`, `data-mgp-gadd`, `data-mgp-gdelete`, `edit-group`, `edit-groups`, `p_group`. This is a POSITIVE-shaped guard on a concatenation, so it cannot go vacuous when a symbol moves file |
| B1 pinned × | `test/manage-round.test.js` (beside `:507`) | the CSS contains `.popup-header .pe-x` with `margin-left: auto` and `.popup-header .pe-in` with `margin-left: 0`; the source no longer contains the `<span class="pe-in" aria-hidden="true"></span>` spacer literal |
| B2 header | `test/checkin-popups.test.js` | `openPlayerEditPopup` output carries `.pe-mark`, `.pe-eyebrow` reading `Roster · check-in`, a 46px `.pe-av` with the first initial, and the pill only when the player is in `state.checkedIn` |
| B3 heads | `test/checkin-popups.test.js` | the body contains `<div class="pl-sect pe-sect">Player</div>` and `...>Status</div>` in that order, and `Skill` remains a `.popup-edit-label` |
| B4 stepper maths | `test/checkin-popups.test.js` | `peSkillStep('', 0.5) === '0.5'`; `peSkillStep('', -0.5) === '0.0'`; `peSkillStep('10', 0.5) === '10.0'`; `peSkillStep('0', -0.5) === '0.0'`; `peSkillStep('6', 0.5) === '6.5'`; every return has exactly one decimal |
| B4 unrated | `test/checkin-popups.test.js` | a player at `skill: 0` opens with an empty `#pe-skill` value and the `–` placeholder; saving that card leaves `state.players[i].skill === 0` and the row still renders `–`; the card closed (the old silent abort would have left it open with nothing written) |
| B5 draft | `test/checkin-popups.test.js` | a click on `[data-pe-in]` flips `aria-pressed`, the `is-in` class and the label, adds or removes the header pill, and leaves `state.checkedIn` untouched |
| B6 save | `test/checkin-popups.test.js` | with the card opened from Check-in: exactly one `check_in` when the draft differs, zero when it does not, `renderCount` unchanged, `mgckRepaint` called, and the strip reads `{name} updated`. With it opened from Players: `repaintManage` called, not `render` |
| B7 keyboard | `test/checkin-popups.test.js` | Escape with the modal open closes it and writes nothing; Enter on `.popup-edit-input` saves; Enter and Space on the pencil open the card; after close, focus is on the pencil carrying that key |
| B7 no autofocus | `test/checkin-popups.test.js` | a source guard: the slice from `function openPlayerEditPopup` to `function closeInlineEditRow` contains no `.select()` and no `focus()` on a `#pe-` field. The mirror proof: adding the line makes it red |
| C1 delegate order | `test/checkin-popups.test.js` | the `manageView === 'checkin'` slice of `attachHandlers` has `data-mgck-edit` at a lower index than `data-mgck-id` |
| E1 kiosk | `test/checkin-page.test.js:118-121` | the case *"keeps the group differentiator for same-name disambiguation"* is **rewritten**, not deleted, to assert the opposite and to carry Mike's ruling in its title: two same-name rows render identically and neither contains `ckx-gp`. This is the one existing case this round inverts |
| E3 kiosk row shape | `test/pure.test.js:426-430` | `toEqual({ id, name, initials, checkedIn })`, with `group` gone from the expected object and from the fixtures at `:392-397` that feed it |
| F register callers | `test/supabase-writes.test.js` | `MUTATING_RPCS` at `:30` still lists `register_player` (unchanged); the file-scan `it`s gain a scan of `public/manage.js` and of `public/checkin.html` for a `p_group` literal, which must be zero |

**Mutation proof required on three guards** (each written, watched red, then restored): the groups
whole-file scan, the no-autofocus source guard, and the delegate-order guard. A negative assertion that
was never seen red is not a guard.

## 8. Build order

Branch `checkin-popups` in the worktree `scratchpad/wt-checkin`, based at `a0c9f8f` (the controller's
ruling, recorded in the C102 ledger). Every task: bump `APP_VERSION` (`public/app.js:34`), run
`node --check public/app.js` **and** `node --check public/manage.js`, run the suite, commit. The
controller pushes (§21). The branch merges onto main only after C102 Task 11 ships the split and Task 9's
equivalence diff has run clean, because this round changes five Manage builders on purpose.

**The migration is task T11, after the client is deployed and driven.** That order exists for one reason:
a live tournament on September 12th 2026 with registration open must never see a half-state. The client
stops sending `p_group` first; because `p_group` has a default, that client works against the old function
unchanged; only then does the column go.

| # | Task | Files | Verification gate |
|---|---|---|---|
| T0 | Worktree, branch, archive, §38 marker. Archive the handoff as text under `docs/design-handoffs/2026-08-29/` (the 2026-08-24 precedent: five zips archived as text plus a 12-history file each). Mint the marker from a cwd under the mapped project root: `node "C:/Users/OlasM/.claude/hooks/ui38-mark.mjs" --decision=3-options-shown --reason="Mike's own handoff" public/app.js public/manage.js public/styles.css public/checkin.html` | `docs/`, gate CLI | The worktree is at `a0c9f8f` on branch `checkin-popups`; `<root>/.claude/markers/ui-options.json` names all four files; the archive holds the README plus the six round comments from `_shared.css` |
| T1 | **B1, the pinned ×.** Title block takes the slack, `.pe-in` loses its auto margin, `.pe-x` and `.hmv-rx` gain it, the empty `.pe-in` spacer literal is deleted | `public/styles.css` (near `:860` and `:3367`), `public/app.js:161` | The card on a checked-in player and on an out player puts × in the same pixel column. The Home rules sheet still has × hard right with its eyebrow and title intact. Test: the spacer literal is gone |
| T2 | **B2 + B3, the card header and the section heads.** Accent strip, `.pe-mark`, 46px tile, `.pe-eyebrow`, PLAYER and STATUS. Re-run the `.pe-*` emitter grep first | `public/app.js` (`openPlayerEditPopup`, `ensurePlayerEditModal`), `public/styles.css` near `:3336-3462` | Screenshots 01 and 02 beside the app at 390 and 1280. Every value is an app token or resolves to one. No em dash in any emitted string. The grep still returns one emitter |
| T3 | **B4, the stepper and unrated is 0.** `.pe-stepper`, `.pe-sb`, `.pe-skillin`, `peSkillStep`, and the abort at `public/app.js:446` | `public/app.js`, `public/styles.css:3426-3427` | The five step cases green. Save an unrated player, reopen: the field is blank, the row reads `–`, `state.players[i].skill === 0`, the card closed |
| T4 | **B5, the draft toggle.** `.pe-inbtn`, `aria-pressed`, live pill, nothing written | `public/app.js` (`openPlayerEditPopup`, the click delegate), `public/styles.css` | Toggle then Cancel: `state.checkedIn` unchanged, RPC spy empty. Toggle then Save: exactly one `check_in` or `check_out`. Save with no change: zero attendance calls. Offline: one outbox row |
| T5 | **A1 + C1, the pencil and its delegate.** Pencil in the row, the branch above the row toggle, Enter and Space, and the `.is-in` legibility rule | `public/manage.js` (`mgckListHTML`), `public/app.js` (`attachHandlers`), `public/styles.css` `.mgck-*` block | Tap the pencil: the card opens and the player is NOT toggled. Tap the row: still toggles. Tab to the pencil, Enter opens, Escape closes, focus returns to that pencil. The pencil is legible on a checked-in row at 390 |
| T6 | **A3 + A4 + B6 + B7, save writes back in place.** `mgckNotice`, `mgckCardNotice`, the origin-aware repaint, the flash, Escape and Enter | `public/app.js` (the delegated save, `closePlayerEditPopup`, the keydown), `public/manage.js` (`mgckStripHTML`, `mgckRepaint`, `buildManageCheckinHTML`, `mgckToggleByKey`) | Scroll the list halfway, edit a row, save: the scroll holds, the row flashes once, the strip reads "{name} updated" with no UNDO, counts are right. A plain row tap still shows UNDO and it still works |
| T7 | **A2 + A5 + the add card, changes 3, 12, 13.** The header pill, `openPlayerAddPopup`, `.is-new`, `mgckAddFromCard`, the outbox replay | `public/manage.js`, `public/app.js`, `public/styles.css` | Add an unrated player out: one row under "Still out", counts up by one, strip "{name} added". Add a rated player checked in: strip "{name} added · checked in", row under "Checked in", the rating survives a `queueSupabaseRefresh`. Screenshots 04, 05, 06, 07 |
| T8 | **Groups removal, the UI layer** (A6, D1, D2, D3, C2, E1, E3, B8, F) | `public/manage.js`, `public/app.js`, `public/checkin.html`, `public/pure.js`, `public/supabase-config.js` | The whole-file guard is green and was watched red. Manage to Players saves a name without wiping anything. The kiosk shows two same-name rows as identical rows. `node --check` on both JS files |
| T9 | **Groups removal, the client data layer** (surface G) plus the two-key `register_player` at all five call sites | `public/app.js` | `p_group` appears nowhere in `public/`. `detectPlayersSchema` no longer probes `group`. Suite green, zero tests weakened. The app still boots with the OLD function live (the default-argument proof) |
| T10 | **Deploy and drive.** Bump, push (controller), then the facts-only drive in Mike's Chrome at 390 and 1280 | none | Zero console errors. Both card states, the add card, the rules sheet, the kiosk, `checkin.html`. One real registration through the kiosk against the OLD 3-arg function, confirming the default-argument path. A true 390 capture, which the handoff still owes (`screenshots/08` is a ~462px viewport at 2x) |
| T11 | **Migration `0068`.** Pre-flight duplicate-name read-back first; then the transaction; then the seven read-backs | `db/migrations/0068_drop_player_groups.sql` | Pre-flight returns zero rows. All seven read-backs pass and are pasted into the history file. A second short drive: kiosk register, Manage add, card save, all green, and the `APPLIED` line is stamped |
| T12 | **Write-back.** `12-history/task-#<id>-checkin-popups-handoff.md` BEFORE any completion mark (§30), with `S/DIGEST.md` and this spec archived under `12-history/assets/`; then `01-state/log.md`, `current.md`, `decisions.md` (the two-step deploy ordering, the stepper-prose correction, the focus call), `debugging.md` (anything that bit), `NOW.md` | vault | The history file exists and `require-task-history.mjs` lets the completion through |

Thirteen tasks. T1 to T7 are the card and console and could ship on their own if the groups half stalls;
T8 to T11 are the removal and are the only tasks that touch the database.

## 9. Hazards, ranked, with the guard that closes each

1. **The migration lands before the client is deployed.** Every kiosk tap and every Manage add would call
   a function that no longer exists, on a live tournament with registration open. Guard: T11 is last, the
   client-first order is proved safe by `p_group`'s default, and the whole ordering is the 0017 to 0018
   expand/contract precedent this repo already ran once.
2. **A stale cached client after the drop.** A phone at the door holding an old service worker would still
   send three arguments. Guard: `APP_VERSION` bumps, which mints a new SW cache and re-fetches
   network-first; T10's drive confirms the new version is being served BEFORE T11 runs. Residual risk: a
   device that never reloads. Accepted, and the failure is a visible error, not a silent wrong write.
3. **The pre-flight finds duplicate names.** The narrowed unique index would not build and the transaction
   would roll back mid-migration. Guard: the pre-flight query runs alone and is read before anything is
   applied. If it returns rows, the round stops and Mike decides which row survives; do not merge
   automatically.
4. **A double attendance write from the card.** Guard: the draft is compared against `state.checkedIn`
   and `mgckToggleByKey` is called only on a real difference, with the RPC-spy test in §7.
5. **UNDO stranded on a stale toggle.** `mgckLast` drives both the strip and the UNDO handler
   (`public/app.js:9220-9224`). Guard: `{ silent: true }` on the card's toggle, `mgckNotice` as a separate
   binding, and `mgckToggleByKey` clearing it on entry.
6. **A shared class carries a defect into a second dialog.** `.popup-header` serves the card and the Home
   rules sheet; `.pe-*` is claimed by a stale CSS comment to serve a third. Guard: the emitter grep before
   T2, both dialogs named in the CSS comment, and both driven at T10. This is the exact class of defect
   the 2026-08-24 handoff shipped.
7. **A duplicate top-level declaration across `app.js` and `manage.js`.** A duplicate `function` is legal,
   the second silently wins, and `node --check` passes on the concatenation (C102 §5.3). Guard: names
   chosen disjoint, plus C102's name-intersection guard test run on the branch.
8. **The §38 gate is blind to `public/manage.js` right now.** `_vault-map.mjs:13` has no `manage.js` term
   until C102 Task 10 re-arms it. Guard: the marker is minted anyway at T0 naming all four files, because
   the rule binds, not the hook. If T10 lands mid-round the gate simply starts enforcing what is already
   true.
9. **The branch merges before C102's equivalence proof.** Five Manage builders change here by design, so a
   merge before Task 9 would make the "pure move" diff dirty and unprovable. Guard: the merge waits for
   Task 11; stated in §8 and in the C102 ledger.
10. **The suite cannot be green until C102 Task 7 rewires the harnesses.** Nothing loads `manage.js` today.
    Guard: the new test file loads all three sources itself, so this round's own cases are provable from
    T1; the full-suite gate at each task means "green relative to the branch's own baseline", recorded at
    T0.
11. **`players.tag` still holds group JSON after the column goes.** Nothing reads it once surface G is
    deleted, but it is a second carrier left standing. Guard: §10 open item, with the count read at T11.
12. **`node --check` passes a half-deleted group layer.** Deleting 39 helpers by hand can leave a caller
    behind, and a `ReferenceError` inside a swallowing `try/catch` (the shape banked from C102's load-order
    ruling) would be silent. Guard: after T9, a scan for every deleted name across `public/` returning zero
    hits, plus the suite, plus the drive with the console open.

## 10. Open, and how each closes

- **`players.tag`.** The client writes group JSON into it (`serializePlayerGroupsTag`, `public/app.js:1009`)
  and reads it back (`parsePlayerGroupsTag`, `parseRemotePlayerGroupDetails`). After surface G nothing in
  the client touches it, but `detectPlayersSchema` still probes it and `HAS_TAG` still gates two insert
  shapes. `0068` does not drop it. Closes at T11 with one read
  (`select count(*) from public.players where tag is not null;`) and one question to Mike: drop it in a
  follow-up `0069`, or leave it as a dormant free-text column. Recommendation: drop it, since every value
  in it is a group artifact.
- **The watermark mark.** README:523-524 says to use the real brand mark if the codebase has one; the app
  ships `logo-mark.png`. This spec keeps the handoff's inline shield-and-check SVG, because it is Mike's
  own drawn artwork in this round and a raster at 9% is heavier than a 1.4px stroke. One look at T10
  settles it.
- **Focus on open.** §2 sets it to the card container. If Mike wants literally no focus move, delete the
  one `.pe-card.focus()` line; Escape still works (the key handler is bound on `document`) and the
  focus-return on close is unaffected.
- **A focus trap inside the dialog.** README:364-365 asks for one using "the codebase's dialog primitive".
  The app has no dialog primitive: `#player-edit-modal` is a hand-built overlay. Not built this round.
  Named here so nobody assumes it shipped.
- **The true 390 capture.** `screenshots/08-console-at-390px.png` is labelled 390 and rendered at about
  462 CSS px. Owed at T10, on Mike's phone width, on the console with the pencils and the pill visible.
- **Whether the Manage CSS round should sweep the three orphaned rules** (`public/styles.css:1489`,
  `:2233-2235`, `:2240`) plus `.pe-hint` (`:3428`) and `groupRosterPlayersBySection` (`public/pure.js:652`).
  Deliberately left out of scope here; recorded in the C102 CSS round's ledger at T12.
