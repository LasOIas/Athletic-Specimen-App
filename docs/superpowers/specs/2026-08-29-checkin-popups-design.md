# Check-in pop-ups: edit a player, add a player, and groups leave the product. Design.

Date: 2026-08-29. **Edit pass applied 2026-08-29** against the review at
`scratchpad/checkin-popups/spec-review.md` (17 findings, all applied; the Critical split the migration in
two). Baseline re-measured at HEAD `cef4989`, `APP_VERSION = '2026.08.26.6'` (`public/app.js:34`).

**The C102 split has landed and its harness work with it.** `public/manage.js` exists (5,139 lines),
`public/index.html:125` loads it before `public/app.js:127`, and every `mgck*` and `mgp*` builder now
lives in `manage.js`. Three C102 tasks that an earlier draft called open have all shipped: `public/sw.js:15`
is `'/manage.js',` (T6, `c02cd7b`), every vm harness reads all three sources and runs them `pure.js`,
`manage.js`, `app.js` (T7, `6330a1c`; for example `test/manage-page.test.js:12-14` and `:126-128`), and the
whole-client source guards scan both files together (T8, `61ef27e`). The section 38 gate's file regex has
been re-armed in both maps (T10): `C:/Users/OlasM/.claude/hooks/_vault-map.mjs:13` and the addendum
frontmatter at `C:/Ai Master/LasOlas/projects/athletic-specimen.md:7` both carry a `manage\.js` term.
**The suite was run at this HEAD: 40 files, 1252 tests, all green.** That is this round's baseline, and
every task gate below means the full suite green, not green against a degraded floor.

Source: Mike's zip `Athletic Specimen check in pop ups.zip`, extracted at
`S/zip/design_handoff_checkin_player_popups/`. Recon digest: `S/DIGEST.md` (four screens, 22 changes, six
rounds Mike named in the CSS comments at `_shared.css:875, 921, 1145, 1244, 1255, 1294`). Mike's calls are
banked in the vault at `C:/Ai Master/Projects/Athletic Specimen/01-state/decisions.md:16-19`.

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
and the group column is emptied one deploy BEFORE the client stops sending it, then dropped one deploy
after that client is out and driven.

## 2. Mike's calls (2026-08-29)

| Fork | Mike's call | Consequence for this spec |
|---|---|---|
| Groups | **Delete groups everywhere.** The `groups` table (`db/migrations/0017_c22_groups_table.sql`), `players."group"`, `register_player`'s `p_group` and every caller including `public/checkin.html:539`. Against the recon's recommendation to strip the UI and leave the column dormant | §4 surfaces D, E, F and §5. TWO migrations: `0068` empties the column and makes `register_player` group-blind BEFORE the client changes, `0069` drops the column, the table and the parameter one deploy after the client is out (§5.1 is why one file could not do it) |
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
  and this round stops writing it, but neither `0068` nor `0069` drops it. See §10.
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
stays). Every colour below is an app token, a token's resolved literal, or one of the handoff's own oklch
values in the same warm-stone, muted-blue and muted-green families. Accent `oklch(0.55 0.07 240)` is
`--accent` exactly (`public/styles.css:8-26` matches the README token table at README:444-451). Eight
introduced literals match no token and are the handoff's own: `oklch(0.62 0.01 75)` and
`oklch(0.45 0.01 75)` for the pencil ink (`--faint` is `0.62 0.005 75`, `public/styles.css:13`),
`oklch(0.92 0.04 250)`, and the greens `0.86 0.06 150`, `0.95 0.04 150`, `0.44 0.11 150`, `0.80 0.10 150`,
`0.95 0.045 150`, `0.40 0.11 150`, `0.92 0.06 150` (`--live` is `0.55 0.09 150`, `--live-soft`
`0.96 0.03 150`, `--live-ink` `0.40 0.09 150`, `public/styles.css:16-21`). They sit one step warmer than
the live tokens, at chroma 0.04 to 0.11 on hue 150; nothing glows and nothing is electric, so §51 passes.
The only hex introduced is `#fff`.

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
  // The three gates below already ran in the save branch, WHILE THE CARD WAS STILL OPEN (B6), because a
  // refusal has to land somewhere the organiser can read it. They are repeated here so the function is
  // safe to call from anywhere, and so a later caller cannot skip the app's standing rules.
  if (!trimmed || !state.loaded || !isValidFullName(trimmed)) return;
  if ((state.players || []).some((p) => normalize(p.name) === normalize(trimmed))) return;
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

**The three gates, and why they are the app's rules and not the handoff's.** README:326 makes name-empty
the card's only client-side rule, and that is true of the CARD. It is not the app's registration rule.
Every existing add door refuses a one-word name: the in-app kiosk (`public/app.js:9732`, "Enter your full
first and last name"), `mgckAddAndCheckIn` (`public/manage.js:1217`, "Enter a first and last name") and
`mgpAddPlayer` (`public/manage.js:1326`, "Enter a first and last name."), with a whole prior round behind
it (`docs/superpowers/specs/2026-06-24-checkin-confirm-name-enforcement-design.md`). Mike's call was keep
both doors, not let the new one create half-named players. `mgckAddAndCheckIn` also refuses before the
roster has loaded (`public/manage.js:1216`), because a local dedup against an empty `state.players` is
meaningless and makes the duplicate it was meant to prevent. The card gets both, plus the duplicate check,
and all three run in the save branch BEFORE `closePlayerEditPopup()`.

**The duplicate ruling, chosen so no reading is left open.** A name already on the roster does NOT close
the add card and reopen an edit card for someone else. That sequence would discard the rating and the
status the organizer just set, with no message. The add card stays open and says so instead.
`mgpAddPlayer` keeps the reopen shape (`public/manage.js:1328`) because it is reached from a list tap
where nothing was typed.

The card needs somewhere to put those three sentences, so the body gains one status line, mirroring the
console's own `#mgck-msg` (`public/manage.js:1131`, styled at `public/styles.css:2287-2288`):

```html
<p class="pe-msg" id="pe-msg" role="status" aria-live="polite"></p>
```

```css
.pe-msg { font-size: 12.5px; color: var(--danger); margin: 10px 0 0; }
.pe-msg:empty { display: none; }
```

Copy verbatim, reused from the door that already says it: **"Enter a first and last name"**
(`public/manage.js:1217`) and **"Still loading. One second, then tap again."** (`public/manage.js:1216`).
One sentence is new and this spec's own: **"{Full name} is already on the roster"**.

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
`ensureSaveDelegationBound` (`:395-533`), and in the `.pe-*` CSS block (`public/styles.css:3336-3461`),
plus the 2026-08-23 button block at `public/styles.css:6043-6076` (`#player-edit-modal .pe-save`,
`.pe-save:active`, `.pe-cancel`, `.pe-cancel:hover`). Nothing in this round changes that second block and
`test/manage-round.test.js:509-513` pins it, but T3 and T4 must not treat `:3336-3461` as the whole
surface.

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
// The eyebrow follows BOTH the mode and the surface. peOrigin is set by the opener; without it the card
// would read "check-in" while sitting over the Players directory.
const eyebrow = peMode === 'new'
  ? 'Roster \u00b7 new player'
  : (peOrigin === 'checkin' ? 'Roster \u00b7 check-in' : 'Roster \u00b7 players');
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
13px radius. The radius is 13px from the handoff's round-iii code (`_shared.css:1176`); README:173 and
README:497 still say 14px, which was round ii (`_shared.css:954`). The later code wins, the same way it
does at B4. `.pe-in` moves from a bare `flex: none; margin-left: auto` (`:3367`) onto the pill skin the
roster already uses. `.pe-x`'s 34px box, 999px radius and `min-width`/`min-height` guards
(`:3368-3385`) are already correct and stay; only its hover ink changes.
The README's *"There is no black or near-black surface anywhere in this app, do not introduce one"*
(README:166) is honoured: the strip is `--accent-soft`.
Copy verbatim: **"Roster · check-in"**, **"Roster · new player"**, **"New player"**, **"IN"**, aria
**"Close"**. One string here is this spec's own and not the handoff's, because the handoff only ever drew
the check-in surface: **"Roster · players"**, the eyebrow on the Manage to Players origin.

**B3. Section heads inside the card.** NEW.
Handoff: README:201-203, 217, 235; `_shared.css` round (iii); `screens/mg-checkin.html:64`.
Site: `openPlayerEditPopup`'s body block, `public/app.js:170-196`. The pattern is production's own
`.pl-sect` (`public/styles.css:2177-2178`: an ink label in the display face plus a hairline rule to the
right edge; README:480 calls it accent, and neither production nor the handoff's own
`_shared.css:1205-1206` sets a colour, so it stays ink on both surfaces), one weight down.

Two heads only, `Player` and `Status`, both rendered uppercase by `.pl-sect`'s
`text-transform: uppercase`. **Skill is a field label, not a section head.** README:217 calls it a section
head, but its own CSS makes it a `.popup-edit-label` inside `.pe-f` and `mg-checkin.html:64` emits it that
way; the code wins, as with the stepper prose. Today's card already emits that label at
`public/app.js:183`.

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

Name empty is the only rule the CARD enforces (README:326), and it focuses First name rather than
aborting in silence. The add path additionally applies the app's standing full-name and roster-loaded
rules, the same ones `mgckAddAndCheckIn` and `mgpAddPlayer` apply; see A5. Data: `players.skill` stays
`not null` with a 0 default; no migration.

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

B1 stopped emitting the pill for a player who is out, so the toggle has to build a node the opener no
longer wrote. Its markup is stated once, beside the branch that uses it, so the two shapes cannot drift:

```js
// the pill B1 stopped emitting for an out player, rebuilt for the live toggle. Same markup as
// openPlayerEditPopup's `inHTML`, so the two cannot drift.
function peInPillNode() {
  const s = document.createElement('span');
  s.className = 'mgp-in pe-in';
  s.textContent = 'IN';
  return s;
}
```

Copy verbatim: **"Check in"**, **"Check out"**, **"IN"**. Aria: `aria-pressed`. Data: nothing here. The
branch touches no `state.`, calls no RPC and calls no `saveLocal`, which is what makes "nothing is written
until Save" provable by reading it (see §7).

**B6. Save.** RESTYLE of behaviour, and the one place data is written.
Handoff: README:323-344; changes 9, 13, 14, 15, 16, 20 in `S/DIGEST.md`.
Site: `ensureSaveDelegationBound`'s `.btn-save-edit` branch, `public/app.js:415-532`.

Three additions to a handler that otherwise keeps its whole optimistic-then-remote shape:

```js
    // 1) ADD MODE. The card in .is-new has no player row to update; it registers one. All three refusals
    //    run HERE, before the close, because a refusal has to land on a card the organiser is still
    //    looking at. Two of the three sentences are the ones mgckAddAndCheckIn already says.
    if (peMode === 'new') {
      const say = (t) => { const el = document.getElementById('pe-msg'); if (el) el.textContent = t; };
      if (!state.loaded) { say('Still loading. One second, then tap again.'); return; }
      if (!isValidFullName(name)) { say('Enter a first and last name'); return; }
      if ((state.players || []).some((p) => normalize(p.name) === normalize(name))) {
        say(name + ' is already on the roster');   // the card STAYS OPEN; the typed rating is not thrown away
        return;
      }
      const inEl = document.querySelector('#player-edit-modal [data-pe-in]');
      const wantIn = !!(inEl && inEl.getAttribute('aria-pressed') === 'true');
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
  can be re-found after a repaint). `#pe-msg` is rebuilt empty with the rest of the card on every open, so
  a refusal from one add can never be read as a refusal of the next. `document.body.style.overflow = 'hidden'` already locks the background
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
**`:9768`** (the optimistic row `{ name, skill, group, groups, pending: true }`, whose two group keys go
with the rest), `:9786` (the RPC's `p_group`), `:9790` (`ensureGroupCatalogEntriesSupabase`), `:9798` (the
outbox key `'reg:' + normalize(name) + ':' + (group || '')` and its payload). `state.activeGroup` and
`LS_ACTIVE_GROUP_KEY` retire with the helper layer.
E2 is scheduled at **T9** with the rest of the UI layer, NOT left to the data layer: `:9760-9764` calls
`normalizeActiveGroupSelection` and reads `UNGROUPED_FILTER_VALUE`, both of which surface G (T10) deletes,
so deleting the helpers first would throw a `ReferenceError` on the first walk-up registration. T9 is also
the last client push before `0069`, so E2's RPC line moves to the two-key call there.

**E3. The kiosk row shape.** `disambiguatePlayersByName` (`public/pure.js:613-638`) drops `group` from the
row it returns (`:632`) and from its doc comment (`:607-608`). `buildKioskResultsHTML`
(`public/app.js:6132`) drops it from the row it forwards, and its own doc comment (`public/app.js:6128-6131`,
whose last line reads "disambiguation is name + group only") is rewritten in the same edit rather than
left stating something false. `test/pure.test.js:426-430` asserts the exact row shape and is edited with
it (§7).

### Surface F: the standalone kiosk page (`public/checkin.html`)

`const GROUP_NAME = CLUB_GROUP;` at `public/checkin.html:300` is deleted, and the RPC call at `:539`
becomes:

```js
      const { error } = await sb.rpc('register_player', { p_name: fullName, p_checked_in: true });
```

The one four-line comment block at `:429-432` that explains the NF-9 full-roster load keeps its history
and loses its forward-looking clause about tagging new registrants into `CLUB_GROUP`.
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

## 5. The data change: two migrations, `0068` then `0069`

Highest migration present is `0067_move_noop_and_clear_live_guard.sql`, so this round takes **`0068` and
`0069`**. House style read from `0066` and `0067`: a header comment that says WHY in prose, a `ROLLBACK:`
line, an `APPLIED` marker left for the controller to stamp, then the DDL, then the `revoke` / `grant` pair
on every function. Neither file carries an explicit `begin;` / `commit;`: only 4 of the 68 files present
use one (`0053` to `0056`), and the Supabase MCP's `apply_migration` already wraps the statement batch, so
an explicit `begin` only logs a nested-transaction notice while adding nothing.

Numbering note for anyone reading the folder: `0008`, `0015` and `0020` are each used twice
(`0020_copilot_actions.sql` and `0020_group_null_normalize.sql`), so "the group work in 0020" below always
means `0020_group_null_normalize.sql`.

### 5.1 Why this is two files and not one

An earlier draft of this spec said the client could simply stop sending `p_group` because the parameter has
a default, and that this made the deploy window safe. **Signature resolution is fine. The dedup key is
not.** The live function (`db/migrations/0020_group_null_normalize.sql:39-44`) finds an existing player
with:

```sql
where lower(btrim(pl.name)) = lower(v_name)
  and coalesce(pl."group",'') = coalesce(v_group,'')
```

Both anon doors send a group today: `public/checkin.html:539` and `public/app.js:9786`, sharing
`const CLUB_GROUP = 'Athletic Specimen'` (`public/supabase-config.js:12`), whose own comment at `:8-11`
records exactly the failure that constant exists to prevent, that the same person checking in at the two
doors becomes two rows because the dedup keys on name plus group, invisible in the other door's roster,
splitting attendance and inflating headcount.

A client that stops sending `p_group` sends `''`. For a returning player whose row carries
`group = 'Athletic Specimen'`, `coalesce('Athletic Specimen','') = coalesce('','')` is FALSE, the dedup
misses, and the insert is permitted, because `players_real_name_group_uidx` keys on
`(lower(btrim(name)), coalesce("group",''))` (`db/migrations/0012_c22_dedup_index_fix.sql:12-14`) and the
groups differ. Result: a second row for the same person, split attendance, on a live tournament with
registration open, and then those very rows are what the name-only unique index in `0069` would refuse to
build over.

The mirror hazard is just as real and closes the same way: if the column were emptied while the OLD client
still sent `'Athletic Specimen'`, the comparison would fail in the other direction and make the same
duplicate. So `0068` does two things, and neither of them drops anything:

1. it empties `players."group"`, and
2. it replaces `register_player`'s body **at its existing three-argument signature**, so the function still
   accepts `p_group` from any client, ignores it for both the dedup and the insert, and matches on name
   alone.

After `0068` the old client and the new client behave identically, no ordering between them matters, and no
window exists in either direction. `0069` then drops the column, the table and the parameter with nothing
depending on them.

### 5.2 `0068_normalize_player_groups.sql`, the prep, ships FIRST

File: `db/migrations/0068_normalize_player_groups.sql`. Applied at task T1, before any client change is
deployed.

```sql
-- 0068_normalize_player_groups.sql: empty the group column and make register_player group-blind, one
-- deploy BEFORE the client stops sending p_group.
--
-- Mike (2026-08-29): "remove the groups from the app, we dont even use it." The removal is two files and
-- this is the first. It drops NOTHING: no column, no table, no signature. It exists so the window between
-- the client change and the drop cannot create a duplicate person on a live roster.
--
-- WHY. The live register_player (0020_group_null_normalize.sql:39-44) dedups on
--   lower(btrim(pl.name)) = lower(v_name) and coalesce(pl."group",'') = coalesce(v_group,'')
-- Both anon doors send 'Athletic Specimen' today (public/checkin.html:539, public/app.js:9786, sharing
-- CLUB_GROUP at public/supabase-config.js:12, whose comment at :8-11 records the exact bug it prevents).
-- Change only one side of that comparison, in either direction, and the dedup misses: the insert is
-- permitted because players_real_name_group_uidx keys on (lower(btrim(name)), coalesce("group",'')) (0012),
-- and the same person becomes two rows with split attendance. Emptying the column AND making the function
-- ignore the parameter changes both sides at once, so old and new clients behave identically.
--
-- STEP 1 is a GATE ON THE ROUND OPENING, not a formality at the end: if two real rows already share a name,
-- the round STOPS here and Mike decides which row survives, before the tournament rather than after.
-- STEP 2 is the ONLY record of the group values that will exist once 0069 commits. It is pasted verbatim
-- into the round's history file. Nothing else preserves them.
--
-- ROLLBACK: re-apply the register_player body in 0020_group_null_normalize.sql verbatim (same signature,
--   so a plain create or replace), then restore the values from the STEP 2 capture:
--   update public.players set "group" = <captured> where id = <captured id>;
--   Nothing is dropped by this file, so the rollback is a function body plus a data restore.
--
-- APPLIED <yyyy-mm-dd> via the Supabase MCP (apply_migration), the check-in pop-ups round.

-- STEP 1. Run alone. READ the result. Zero rows required, or the round stops.
--   select lower(btrim(name)) as nm, count(*) as c
--     from public.players
--    where left(name, 5) <> '__as_'
--    group by 1 having count(*) > 1;

-- STEP 2. Run alone. Save the output VERBATIM into 12-history before running STEP 3.
--   select id, name, "group" from public.players where "group" is not null order by name;

-- STEP 3. Every real row moves into the one slot a group-blind call will use. 0020's normalize trigger
-- already turns '' into NULL on write, so NULL is the canonical empty and coalesce("group",'') = '' holds
-- for every row afterwards.
update public.players set "group" = null where "group" is not null;

-- STEP 4. register_player, SAME three-argument signature, group-blind. p_group is still accepted so every
-- deployed client keeps working unchanged; it is ignored for the dedup and never written. The return
-- columns are unchanged too (the "group" column now always reads NULL), so no client's response parsing
-- moves. Body is 0020's with the group terms removed from the lookup and the insert.
create or replace function public.register_player(p_name text, p_group text default ''::text, p_checked_in boolean default false)
returns table(id uuid, name text, checked_in boolean, "group" text)
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
    select pl.id, pl.name, pl.checked_in, pl."group" from public.players pl where pl.id = v_id;
end $$;
revoke all on function public.register_player(text, text, boolean) from public;
grant execute on function public.register_player(text, text, boolean) to anon, authenticated;
```

**Read-backs for `0068`**, all recorded in the round's history file:

1. `select count(*) from public.players where "group" is not null;` returns `0`.
2. `select count(*) from public.players where left(name,5) <> '__as_';` is unchanged from before STEP 3.
3. `select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='public' and p.proname='register_player';` still returns exactly one row, still `register_player(text,text,boolean)`.
4. A live smoke on a throwaway name through the anon door, run TWICE with the old three-key argument list
   and once with the new two-key list: all three calls return the SAME id, and
   `select count(*) from public.players where lower(btrim(name)) = lower('Zz Smoketest');` is 1. Then the
   row is deleted by id. This is the whole point of the file, so it is proved rather than assumed.

### 5.3 `0069_drop_player_groups.sql`, the drop

File: `db/migrations/0069_drop_player_groups.sql`. Applied at task T12, after the whole client is deployed
and driven. Its pre-flight already ran at `0068` STEP 1 and is not repeated.

```sql
-- 0069_drop_player_groups.sql: groups leave the product.
--
-- Mike (2026-08-29): "remove the groups from the app, we dont even use it." Groups were a second, unused
-- way to organize ONE roster. They cost every list a subline, the players list a "N groups" counter, the
-- edit card a hidden field it had to carry so a name fix would not wipe membership, and register_player a
-- parameter every caller had to pass. 0068 already emptied the column and made the function group-blind,
-- and the client that emits and sends nothing group-shaped has been deployed and driven since. This file
-- removes the structures with nothing left depending on them. Same expand then contract shape 0017 and
-- 0018 used for the catalog, whose own header records that 0018 waited for a deployed, verified app.
--
-- WHAT GOES:
--   1. the `groups` catalog table (0017), with its unique index, its two RLS policies and its grants,
--      which DROP TABLE sweeps. No inbound FK exists; 0035 only added community_id to it (outbound).
--   2. players."group", and with it the anon COLUMN-level select grant that names it
--      (0010_c21_skill_anon_revoke.sql:9, `grant select (id, name, checked_in, tag, "group")`). Postgres
--      removes a column's ACL with the column, so this will not error, but it is a real object and the
--      rollback has to re-issue it.
--   3. the normalize trigger and its trigger function (0020).
--   4. the group term in the dedup unique index (0011/0012): it narrows to name only.
--   5. register_player's p_group parameter and the "group" column it returned. The three-argument overload
--      is DROPPED, not left standing beside the new one: PostgREST resolves an overload by the argument
--      names the caller sends, so two live signatures would let a stale cached client keep registering
--      into a column that no longer exists. The older two-argument (text,text) form was already dropped at
--      0007:19, for the same reason.
--
-- WHAT STAYS: tournaments."group" (0003) and attendance_sessions."group" (0015), two different columns on
-- two different tables. players.tag is not touched here; the client stops writing group JSON into it in the
-- same release, and the column's fate is an open item on this round's spec.
--
-- Dedup narrows from (name, group) to name. Mike, same day, on the kiosk's same-name rows: "thats almost
-- impossible to have the same full name, just leave it." 0068 STEP 1 already proved zero duplicate names.
--
-- **Before this file runs, `select id, name, "group" from public.players where "group" is not null;` has
-- already been captured verbatim into the round's history file at 0068 STEP 2. That capture is the ONLY
-- record of the group values that exists after this commit; the rollback below restores empty structures
-- and needs that file to put values back.**
--
-- ROLLBACK: re-run 0017's create table, unique index, policies and grants (skip its backfill, the source
--   rows are gone); `alter table public.players add column "group" text;`; re-issue
--   `grant select (id, name, checked_in, tag, "group") on public.players to anon;` (0010:9), without which
--   a rolled-back anon door 403s on any query naming the column; re-apply
--   0020_group_null_normalize.sql verbatim (the trigger function, the trigger and the three-argument
--   register_player); `drop index if exists public.players_real_name_uidx;` and recreate
--   players_real_name_group_uidx from 0012:12-14; then restore the VALUES from the 0068 STEP 2 capture.
--
-- APPLIED <yyyy-mm-dd> via the Supabase MCP (apply_migration), the check-in pop-ups round.

-- the dedup index carries the column, so it goes first
drop index if exists public.players_real_name_group_uidx;
create unique index if not exists players_real_name_uidx
  on public.players (lower(btrim(name)))
  where left(name, 5) <> '__as_';

-- 0020's group-normalizing trigger has nothing left to normalize
drop trigger if exists players_normalize_group on public.players;
drop function if exists public.tg_players_normalize_group();

-- register_player without p_group. Body is 0068's minus the ignored parameter and the "group" return
-- column; the insert still writes skill 0, so a rated new player takes a second write from the client
-- (updatePlayerFieldsSupabase). create or replace on a NEW signature creates a NEW function with no
-- inherited ACL, hence the revoke/grant pair below.
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

-- the old signature, gone in the same batch as the column it wrote
drop function if exists public.register_player(text, text, boolean);

alter table public.players drop column if exists "group";

drop table if exists public.groups;
```

No RLS policy on `public.players` names `"group"` (the read policy at
`db/migrations/0006_c21_authenticated_players_parity.sql:12` is `using (true)`), and no function body
outside `register_player` reads it, so `drop column` has nothing to fight. `link_roster_to_tournament`
(`db/migrations/0054_register_resolves_identity.sql`) inserts `(community_id, real_name)` on a different
table and never touches the dedup index, so narrowing it changes nothing there.

### 5.4 Every `register_player` caller, by function name, file and task

Five callers, not four. Two of them are edited in the card work and the console work rather than in the
data task, so each row names the task that owns it. All five carry the two-key call by the end of T9, one
deploy before `0069`.

| Caller | File | Site | Task |
|---|---|---|---|
| `mgckAddFromCard` (new, A5) | `public/manage.js` | its only RPC call, written two-key from the start | T8 |
| the `register` branch of `flushOutbox` | `public/app.js:5115` | `p_group: op.payload.group \|\| ''` goes; the skill follow-up is added in the same edit (A5) | T8 |
| `mgckAddAndCheckIn` | `public/manage.js:1231` | `p_group: CLUB_GROUP` goes | T9 |
| the kiosk tap handler inside `attachHandlers` (surface E2) | `public/app.js:9786` | `p_group: group` goes, with the rest of E2 | T9 |
| the standalone kiosk page (surface F) | `public/checkin.html:539` | `p_group: GROUP_NAME` goes | T9 |

### 5.5 Read-backs for `0069`

Run after the batch commits, and recorded in the round's history file:

1. `select count(*) from information_schema.columns where table_schema='public' and table_name='players' and column_name='group';` returns `0`.
2. `select to_regclass('public.groups');` returns NULL.
3. `select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='public' and p.proname='register_player';` returns exactly one row, `register_player(text,boolean)`. This is the guard that catches a stranded overload.
4. `select indexdef from pg_indexes where schemaname='public' and indexname='players_real_name_uidx';` exists and names `lower(btrim(name))` with no `group` term; `players_real_name_group_uidx` is gone.
5. Player count identical before and after: `select count(*) from public.players where left(name,5) <> '__as_';`.
6. A live smoke through the anon door: `select * from public.register_player('Zz Smoketest', false);` returns one row, a second identical call returns the SAME id, then the row is deleted by id. Run on a throwaway name, never on a real one.
7. `get_advisors` (security and performance) shows no class that was not there before.
8. `select privilege_type, column_name from information_schema.column_privileges where table_name='players' and grantee='anon';` returns exactly `id`, `name`, `checked_in`, `tag`, and no `group`. This is the `0010:9` grant, which the column drop removed silently.

## 6. What must not reopen

| Must not reopen | How it could | The guard |
|---|---|---|
| **One person becoming two rows on a live roster** | the client stops sending `p_group` while the column still holds `'Athletic Specimen'`, so `register_player`'s dedup (`0020_group_null_normalize.sql:39-44`) misses and inserts a second row. This is the bug `public/supabase-config.js:8-11` was written to prevent | `0068` empties the column AND makes the function group-blind at its existing signature, so both sides of the comparison change in one statement batch and old and new clients behave identically. Proved by the twice-called smoke in §5.2 read-back 4 |
| A row tap checking a player in when the organizer meant to edit | the pencil is inside the row `<button>`, so the row's own handler fires on the same tap | the `[data-mgck-edit]` branch sits ABOVE `[data-mgck-id]` in `attachHandlers` and calls `stopPropagation`. Test: a `withDelegate` tap on `data-mgck-edit` calls the swapped `openPlayerEditPopup` with that key and never calls the swapped `mgckToggleRow` |
| A double attendance write | the card's Save applying the status unconditionally, on top of a row that was already in that state | compare the draft flag against `new Set(state.checkedIn).has(key)` and call `mgckToggleByKey` only on a real difference. Source guard on the branch, plus a drive fact for the single RPC |
| A cancelled card writing anything | the status button writing straight through, the way a row tap does | the toggle branch mutates DOM attributes and classes only. Source guard: its slice contains no `state.`, no `mgckToggleByKey`, no `supabaseClient` and no `saveLocal` |
| UNDO undoing the wrong thing | `mgckLast` left pointing at a stale toggle while the strip shows a card message | the card's toggle is `{ silent: true }` (`public/manage.js:1201` already honours it) and `mgckCardNotice` sets `mgckNotice` and clears `mgckLast`; `mgckToggleByKey` clears `mgckNotice` on entry. Test: with `mgckNotice` set, `mgckStripHTML()` carries the message and no `data-mgck-undo`; with only `mgckLast` set it carries both |
| The console losing its place mid-check-in | the save calling `render()` (`public/app.js:475`) | `mgckCardNotice` calls `mgckRepaint`, which saves and restores `#tab-manage`'s scrollTop (`public/manage.js:1159-1167`). Source guard: no `render();` in the `.btn-save-edit` branch |
| The silent save | the `Number.isNaN(skill)` half of the abort at `public/app.js:446` coming back | one validation rule on the card, name-empty, and it focuses First name. Source guard on the two new lines, plus a drive fact for the round trip |
| **A half-named player from the new door** | the card enforcing only README:326's name-empty rule while every other add door enforces `isValidFullName` (`public/app.js:9732`, `public/manage.js:1217`, `public/manage.js:1326`) | the three gates in B6, run before the close. Source guard: the add branch contains `isValidFullName` and `state.loaded` |
| **The add card throwing away what was typed** | a duplicate name closing the add card and reopening an edit card for someone else, losing the rating and the status with no message | the duplicate check runs in the save branch before `closePlayerEditPopup()`; the card stays open and says "{Full name} is already on the roster". Source guard: the add branch's duplicate check appears before the `closePlayerEditPopup()` call |
| The Bug A autofocus (2026-06-21, `12-history/task-#10-edit-autofocus-name.md`) | porting `_shared.js:1010-1011` verbatim | a source guard: the `openPlayerEditPopup` slice contains no `.select()` and no `focus()` on `#pe-first` / `#pe-last` / `#pe-skill`. Proven by mutation |
| **The card reading "check-in" on the Players directory** | deriving the eyebrow from `peMode` alone | the eyebrow reads `peOrigin` too (B2). Source guard: the slice contains `Roster \u00b7 players` |
| The Rules sheet's close button | B1 edits `.popup-header`, which two dialogs share (`public/app.js:164` the card, `:4248` the rules sheet) | the new rules name `.hmv-rtitles` and `.hmv-rx` explicitly, and `#hm-rules-modal .hmv-rtitles` (`public/styles.css:4214`, specificity 1,1,0) sets only `display`, `gap` and `min-width`, so there is no conflict. The drive opens the rules sheet as well as the card. Precedent: the `.hmv-copy:focus` defect a prior handoff shipped (`NOW.md`, 2026-08-24) |
| The pencil invisible on a checked-in row | `.ckx-row.is-in { opacity: .55 }` (`public/styles.css:1491`) caps every child, and a child cannot raise it | `.ckx-row.is-in .mgck-edit` gets a darker rest ink. Drive fact at 390 and 1280, both row states |
| A public surface showing skill (§AS-1) | the stepper is in a card that also opens from Manage; the kiosk row builder is a different function | the card is admin-only on both surfaces; `renderCheckinButton` and `disambiguatePlayersByName` gain nothing. Test: `renderCheckinButton`'s output carries no `mgck-sk` and no `mgck-edit` |
| A duplicate top-level name across `app.js` and `manage.js` | a new helper declared in both files; a duplicate `function` is LEGAL and the second silently wins (C102 §5.3) | the new names are disjoint by construction (`app.js`: `peMode`, `peOrigin`, `peReturnKey`, `peSkillStep`, `peInPillNode`, `openPlayerAddPopup`; `manage.js`: `mgckNotice`, `mgckCardNotice`, `mgckAddFromCard`), and C102's disjoint-names guard test (shipped at `c02cd7b`) runs on the branch |
| The C102 equivalence proof | this round changes five Manage builders on purpose | the branch never merges before C102's `diff before.json after.json` has run clean on main. §8 |
| **The anon kiosk losing its read** | the column drop silently removes the `0010:9` column-level grant, and a rollback that forgets to re-issue it leaves anon 403ing on any query naming the column | read-back 8 in §5.5 asserts anon holds exactly `id`, `name`, `checked_in`, `tag`; the `0069` ROLLBACK line re-issues the grant explicitly |
| A stale client calling a dropped RPC | `0069` landing before the last client push is deployed, or before the service worker has refreshed | every caller is two-key by T10 and works against `0068`'s three-argument function unchanged; `APP_VERSION` bumps, which mints a new SW cache and re-fetches network-first; T11's drive confirms the served version before T12 runs |
| Groups coming back through a hide | porting the handoff's `.ckx-gp, .mgp-gp, .mgp-mg { display: none !important }` | not ported. The source scan in §7 covers the class names, over `stripComments`-blanked sources so a rewritten comment cannot trip it |

## 7. Tests

### 7.1 What the harness is, measured

- **The suite is green at this HEAD: 40 files, 1252 tests** (`cd test && npx vitest run`).
- **Every vm harness already loads `public/manage.js`** between `pure.js` and `app.js`
  (`test/manage-page.test.js:12-14` reads all three, `:126-128` runs them in that order with the comment
  "C102: the Manage block loads before app.js, as in index.html"). C102 T7 shipped at `6330a1c`.
- **There is no DOM anywhere in the suite.** No `jsdom`, no `happy-dom`, no `@vitest-environment` pragma in
  any of the 40 files, and `test/package.json` lists exactly one devDependency, `vitest`.
  `documentStub.getElementById` and `documentStub.querySelector` return `null` unconditionally
  (`test/manage-page.test.js:28-29`); `makeEl()` returns an object whose `classList` methods are no-ops and
  whose `getAttribute` always returns `null` (`:16-25`); `supaStub.rpc` resolves `{ data: null, error: null }`
  (`:41`).
- **Consequence, stated so nobody writes a test that cannot run:** `openPlayerEditPopup` cannot execute at
  all in this harness. It returns at `public/app.js:137-138`, because `modal.querySelector('.pe-card')` is
  `null`. Nothing in this round adds a DOM environment. Every card-markup claim is pinned by a source-slice
  scan of the template literal that builds it, and every claim that genuinely needs a live element is a
  drive fact in §7.3.
- **No test file references `mgck`** (`grep -rn mgck test/` returns zero matches), so the console has no
  existing coverage to extend. `test/manage-round.test.js:509-513` is the only existing case that names the
  card, asserting `count(css, '#player-edit-modal .pe-save') >= 1` at `:511`.
- All four client files are CRLF in the working tree (`core.autocrlf = true`, no `.gitattributes`) while git
  stores LF, so every source scan must be newline-agnostic.

### 7.2 The three shapes this round is allowed to use

1. **Builder string.** A pure string builder called through the new file's bridge, asserted with
   `toContain` / `not.toContain` / document order.
2. **Delegate tap.** `withDelegate`, copied from `test/manage-round.test.js:1622-1653`: it captures the
   `#app-content` click handler that `attachHandlers` binds and fires a synthetic tap whose target's
   `closest()` matches named attribute hooks. Collaborators are swapped by bare assignment, the way the
   C102 contract allows (`repaintManage = ...`), and `supabaseClient.rpc` is swapped with `swapSupaRpc`,
   copied from `test/manage-round.test.js:289`.
3. **Source guard.** A positive `toContain` over a named function's source slice (the shape
   `test/register-auto-attach.test.js:140` already uses), or a negative scan over
   `stripComments(appSrc) + '\n' + stripComments(mgSrc)`, reusing the helper at
   `test/supabase-writes.test.js:20-27` that blanks block and line comments while preserving length and
   newlines.

Anything none of the three can reach is a drive fact in §7.3. No assertion in this spec requires a DOM.

### 7.3 New file: `test/checkin-popups.test.js`

Harness copied from `test/manage-page.test.js:11-60`, which already loads the three sources in the right
order. New cases go here, never into the ten files C102 T8 touched. Its epilogue exposes: the builders
(`mgckListHTML`, `mgckMetaHTML`, `mgckStripHTML`, `buildManageCheckinHTML`, `mgckRows`, `buildMgpListHTML`,
`buildManagePlayersHTML`, `renderCheckinButton`), the module bindings a tap would set (`mgckNotice`,
`mgckLast`, `mgckFilter`, `mgckQ`, `manageView`), the pure helper `peSkillStep`, the callers
`mgckAddFromCard` and `mgckToggleByKey`, `attachHandlers` for `withDelegate`, `swapSupaRpc`, bare-assignment
swaps for `mgckRepaint`, `repaintManage`, `openPlayerEditPopup`, `openPlayerAddPopup`, `mgckToggleRow`,
`updatePlayerFieldsSupabase` and `outboxEnqueue`, and the raw `appSrc`, `mgSrc` and `css` strings.

| Change | Shape | The assertion |
|---|---|---|
| A1 pencil | builder string | `mgckListHTML` output carries one `data-mgck-edit="{key}"` per row with `role="button"`, `tabindex="0"` and `aria-label="Edit {name}"`, and the pencil's index sits between `.ckx-nm` and `.mgck-sk` |
| A2 add pill | builder string | `buildManageCheckinHTML` contains `class="mgck-add"`, `data-mgck-new` and the literal `Add player`, at an index inside the `.pd-pagehdr` block |
| A3 strip | builder string | with `mgckNotice` set, `mgckStripHTML()` contains the message and NOT `data-mgck-undo`; with only `mgckLast` set it contains both; both set means the notice wins |
| A3 strip is cleared by a row tap | delegate tap | with `mgckRepaint` swapped to a recorder, `mgckToggleByKey(key, 'in')` leaves `mgckNotice` null and `mgckLast` set |
| A4 recount | builder string | after a check-in, `mgckMetaHTML(checkinConsoleModel(mgckRows(), 'all', ''))` and the two `.mgck-sect` counts in `mgckListHTML` match `state.checkedIn`. The model is unchanged by this round, which its 12 cases in `test/checkin-console.test.js:17-68` keep proving |
| A5 the RPC shape | builder-free call plus swaps | `swapSupaRpc` returns `{ data: [{ id: 'p-new' }], error: null }` and `mgckRepaint` is a recorder. `mgckAddFromCard('Zoe Park', 6.5, false)` calls the RPC exactly once with `['register_player', { p_name: 'Zoe Park', p_checked_in: false }]`, with no `p_group` key in the object, and the swapped `updatePlayerFieldsSupabase` is called once with `{ skill: 6.5 }`. With skill `0` the second call never fires. The stub MUST return an id, or the follow-up is unreachable rather than merely unwritten |
| A5 the three gates | source guard | the `peMode === 'new'` branch of the save contains `state.loaded`, `isValidFullName` and the duplicate check, all at a lower index than its `closePlayerEditPopup()` |
| A5 outbox | call plus swaps | with `swapSupaRpc` throwing and `outboxEnqueue` swapped to a recorder, exactly one row is enqueued, `kind` is `register`, and its payload has `name`, `checked_in` and `skill` and no `group` |
| A6, D1, D2, E1, E2, F: groups off every surface | source guard | a negative scan over `stripComments(appSrc) + '\n' + stripComments(mgSrc)` finds none of `ckx-gp`, `mgp-gp`, `mgp-mg`, `data-mgp-groups`, `data-mgp-movegrp`, `data-mgp-gadd`, `data-mgp-gdelete`, `edit-group`, `edit-groups`, `p_group`. The concatenation is what stops it going vacuous when a symbol moves file; it is still a negative assertion, so it needs the mutation proof below. A second scan covers `public/checkin.html` for `p_group` and `GROUP_NAME` |
| B1 pinned × | CSS plus source guard | the CSS contains `.popup-header .pe-x` with `margin-left: auto` and `.popup-header .pe-in` with `margin-left: 0`; `appSrc` no longer contains the `<span class="pe-in" aria-hidden="true"></span>` spacer literal. Extend the existing case at `test/manage-round.test.js:509-513` rather than writing a second CSS reader |
| B2 header markup | source guard | the `openPlayerEditPopup` slice contains `class="pe-mark"`, `class="pe-eyebrow"`, `Roster \u00b7 check-in`, `Roster \u00b7 new player`, `Roster \u00b7 players`, and the `isIn ?` ternary that emits the pill only when true |
| B3 heads | source guard | the same slice contains `<div class="pl-sect pe-sect">Player</div>` at a lower index than `>Status</div>`, and `Skill` still appears inside a `popup-edit-label` |
| B4 stepper maths | builder-free call | `peSkillStep('', 0.5) === '0.5'`; `peSkillStep('', -0.5) === '0.0'`; `peSkillStep('10', 0.5) === '10.0'`; `peSkillStep('0', -0.5) === '0.0'`; `peSkillStep('6', 0.5) === '6.5'`; every return matches `/^\d+\.\d$/` |
| B4 unrated prefill and the abort | source guard | the `openPlayerEditPopup` slice contains the `> 0 ? Number(player.skill).toFixed(1) : ''` prefill and `placeholder="&#8211;"`; the save branch no longer contains `if (!name || Number.isNaN(skill)) return;` and does contain `if (Number.isNaN(skill)) skill = 0;` |
| B5 the toggle writes nothing | source guard | the `[data-pe-in]` branch's slice contains no `state.`, no `mgckToggleByKey`, no `supabaseClient` and no `saveLocal`, and does contain `aria-pressed` and `peInPillNode` |
| B6 the save routes in place | source guard | the `.btn-save-edit` branch contains no `render();`, contains `mgckCardNotice` and `repaintManage`, and contains the `wantIn !== isInNow` comparison at a lower index than its `mgckToggleByKey` call |
| B6 the silent toggle contract | delegate-free call | with `mgckRepaint` swapped, `mgckToggleByKey(key, 'in', { silent: true })` leaves `mgckLast` null and puts the key into `state.checkedIn`; without `silent` it sets `mgckLast`. This pins the contract the save depends on (`public/manage.js:1201`) |
| B7 keyboard and focus | source guard | the once-bound keydown contains `Escape`, `closePlayerEditPopup`, `Enter` and `popup-edit-input`; `closePlayerEditPopup` contains the `peReturnKey` re-query on `.mgck-edit[data-mgck-edit=` |
| C1 the pencil does not check anyone in | delegate tap | with `openPlayerEditPopup` and `mgckToggleRow` swapped to recorders and `manageView = 'checkin'`, `tap('data-mgck-edit', 'k1')` calls the opener once with `'k1'` and the toggle zero times; `tap('data-mgck-id', 'k1')` still calls the toggle |
| C1 the add pill | delegate tap | `tap('data-mgck-new')` calls the swapped `openPlayerAddPopup` once |
| D1, D2 the Players list | builder string | `buildMgpListHTML` output has no `mgp-gp`; `buildManagePlayersHTML` output has no `mgp-mg`, no `data-mgp-groups` and no `data-mgp-bulk="move"` |
| E1 the kiosk row | builder string | `renderCheckinButton({ id, name: 'John Smith', checkedIn: false }, 'john')` twice with the same name produces two identical strings, neither containing `ckx-gp`. The case at `test/checkin-page.test.js:120-123`, "keeps the group differentiator for same-name disambiguation", is **rewritten** to assert exactly this and to carry Mike's ruling in its title. It is the one existing case this round inverts |
| E3 the kiosk row shape | existing file | `test/pure.test.js:426-430` becomes `toEqual({ id, name, initials, checkedIn })`, with `group` gone from the expected object and from the fixture array at `:391-397` |
| F the RPC name is still guarded | existing file | `MUTATING_RPCS` at `test/supabase-writes.test.js:29` still lists `register_player` at `:30`; the file's per-file scans, which C102 T8 widened to `manage.js` at `61ef27e`, need no change |

### 7.4 Drive facts, verified in Mike's Chrome at T11, not in the suite

Each of these needs a live element, a real event or a real network call, and none of the three shapes can
reach it. They are named here so nobody writes a test that cannot run and nobody assumes they were covered.

| Fact | Where |
|---|---|
| Tapping the pencil opens the card and does not toggle the row; tapping the row still toggles | console, 390 and 1280 |
| The status button flips label, icon and header pill, and Cancel leaves the roster untouched | card, both states |
| Save with a status change fires exactly one `check_in` or `check_out`; save with no status change fires none | Network panel |
| Save holds the list's scroll position and flashes the saved row once | console, list scrolled halfway |
| An unrated player opens with a blank field and the `–` placeholder, saves, and the row still reads `–` | card plus row |
| Escape closes without saving; Enter in a field saves; Tab, Enter and Space work the pencil; focus returns to the pencil after close | keyboard |
| The add card refuses a one-word name, refuses a duplicate without closing, and keeps the typed rating | card |
| The pencil is legible on a checked-in row (`.ckx-row.is-in` sits at `opacity: .55`) | console at 390 |
| The close × sits in the same pixel column with and without the IN pill, and the Home rules sheet's × is still hard right with its eyebrow and title intact | card, rules sheet |
| Two same-name players render as identical rows on the public kiosk | kiosk |
| A true 390 capture, which the handoff still owes (`screenshots/08` is a ~462px viewport at 2x) | console |

### 7.5 Mutation proof

Three guards are written, watched red, then restored, because a negative assertion that was never seen red
is not a guard: the groups source scan, the no-autofocus guard, and the no-`render();` guard in the save
branch.

## 8. Build order

Branch `checkin-popups` in the worktree `scratchpad/wt-checkin`, based at the C102 split (the controller's
ruling in the C102 ledger). Every task: bump `APP_VERSION` (`public/app.js:34`), run `node --check
public/app.js` **and** `node --check public/manage.js`, run the suite, commit. The controller pushes (§21).
The gate at each task is **the full suite green**, 40 files and rising, never green against a degraded
floor. The branch merges onto main only after C102's equivalence diff has run clean, because this round
changes five Manage builders on purpose.

**The two migrations bracket the client work.** `0068` ships FIRST, before any client that stops sending
`p_group`, because it is what makes that client safe (§5.1). `0069` ships LAST, one deploy after the whole
client is out and driven, so the live tournament on September 12th 2026 with registration open never sees a
half-state.

| # | Task | Files | Verification gate |
|---|---|---|---|
| T0 | Worktree, branch, archive, §38 marker, baseline. Archive the handoff as text under `docs/design-handoffs/2026-08-29/` (the 2026-08-24 precedent: five zips archived as text plus a 12-history file each). Mint the marker from a cwd under the mapped project root: `node "C:/Users/OlasM/.claude/hooks/ui38-mark.mjs" --decision=3-options-shown --reason="Mike's own handoff" public/app.js public/manage.js public/styles.css public/checkin.html` | `docs/`, gate CLI | The worktree is on branch `checkin-popups`; `<root>/.claude/markers/ui-options.json` names all four files; the archive holds the README plus the six round comments from `_shared.css`; the suite baseline is recorded at 40 files / 1252 tests |
| T1 | **Migration `0068`, the prep.** STEP 1 run alone with its result read before anything else executes; STEP 2 captured into `12-history`; STEP 3 the update; STEP 4 the group-blind `register_player` at its existing signature | `db/migrations/0068_normalize_player_groups.sql` | STEP 1 returns zero rows or the round STOPS here. All four `0068` read-backs pass, including the twice-called smoke that proves an old three-key call and a new two-key call return the same id |
| T2 | **B1, the pinned ×.** Title block takes the slack, `.pe-in` loses its auto margin, `.pe-x` and `.hmv-rx` gain it, the empty `.pe-in` spacer literal is deleted | `public/styles.css` (near `:860` and `:3367`), `public/app.js:161` | The spacer literal is gone (test). The × in both card states and the rules sheet are drive facts at T11 |
| T3 | **B2 and B3, the card header and the section heads.** Accent strip, `.pe-mark`, 46px tile at a 13px radius, `.pe-eyebrow` reading its origin, PLAYER and STATUS. Re-run the `.pe-*` emitter grep first | `public/app.js` (`openPlayerEditPopup`, `ensurePlayerEditModal`), `public/styles.css` near `:3336-3461` and `:6043-6076` | The emitter grep still returns one emitter. The source guards for B2 and B3 are green. Every value is an app token, a token's literal, or one of the handoff's own. No em dash in any emitted string |
| T4 | **B4, the stepper and unrated is 0.** `.pe-stepper`, `.pe-sb`, `.pe-skillin`, `peSkillStep`, and the abort at `public/app.js:446` | `public/app.js`, `public/styles.css:3426-3427` and `:6043-6076` untouched | The five step cases green; the prefill and abort source guards green |
| T5 | **B5, the draft toggle.** `.pe-inbtn`, `peInPillNode`, `aria-pressed`, live pill, nothing written | `public/app.js` (`openPlayerEditPopup`, the click delegate), `public/styles.css` | The "writes nothing" source guard green (no `state.`, no `mgckToggleByKey`, no `supabaseClient`, no `saveLocal` in the branch) |
| T6 | **A1 and C1, the pencil and its delegate.** Pencil in the row, the branch above the row toggle, Enter and Space, and the `.is-in` legibility rule | `public/manage.js` (`mgckListHTML`), `public/app.js` (`attachHandlers`), `public/styles.css` `.mgck-*` block | The two `withDelegate` cases green: the pencil tap opens and never toggles, the row tap still toggles |
| T7 | **A3, A4, B6 and B7, save writes back in place.** `mgckNotice`, `mgckCardNotice`, the origin-aware repaint, the flash, Escape and Enter, the focus return | `public/app.js` (the delegated save, `closePlayerEditPopup`, the keydown), `public/manage.js` (`mgckStripHTML`, `mgckRepaint`, `buildManageCheckinHTML`, `mgckToggleByKey`) | The strip cases, the silent-toggle contract case and the no-`render();` guard green, the last one proven by mutation |
| T8 | **A2, A5 and the add card.** The header pill, `openPlayerAddPopup`, `.is-new`, the three gates in the save branch, `#pe-msg`, `mgckAddFromCard`, and the `flushOutbox` register branch moving to the two-key call with its skill follow-up | `public/manage.js`, `public/app.js`, `public/styles.css` | The A5 RPC case green with the id-returning stub; the outbox case green with the throwing stub; the three-gates source guard green |
| T9 | **Groups removal, the UI layer** (A6, D1, D2, D3, C2, E1, **E2**, E3, B8, F). This is the LAST client push before `0069`, so it carries the remaining three `p_group` call sites: `mgckAddAndCheckIn`, the in-app kiosk, and `public/checkin.html:539` | `public/manage.js`, `public/app.js`, `public/checkin.html`, `public/pure.js`, `public/supabase-config.js` | The groups source scan green and proven by mutation. `p_group` appears nowhere in `public/`. E2's own gate: the in-app kiosk registers a walk-up with the console open and no `ReferenceError` (drive at T11) |
| T10 | **Groups removal, the client data layer** (surface G). The 39 helpers, `state.groups`, `state.activeGroup`, `HAS_GROUP`, and `updatePlayerFieldsSupabase`'s group block | `public/app.js` | A scan for every deleted symbol across `public/` returns zero hits. `detectPlayersSchema` no longer probes `group`. Suite green, zero tests weakened |
| T11 | **Deploy and drive.** Bump, push (controller), then the facts-only drive in Mike's Chrome at 390 and 1280 | none | Every row of §7.4 walked and recorded. Zero console errors. The served `APP_VERSION` is the new one, confirmed before T12 is allowed to run |
| T12 | **Migration `0069`, the drop.** The batch, then the eight read-backs, then a short second drive | `db/migrations/0069_drop_player_groups.sql` | All eight read-backs pass and are pasted into the history file, including read-back 8 on anon's column grant. The second drive: kiosk register, Manage add, card save, all green. The `APPLIED` line is stamped |
| T13 | **Write-back.** `12-history/task-#<id>-checkin-popups-handoff.md` BEFORE any completion mark (§30), carrying the `0068` STEP 2 group capture, with `S/DIGEST.md`, `S/spec-review.md` and this spec archived under `12-history/assets/`; then `01-state/log.md`, `current.md`, `decisions.md` (the two-migration ordering and why one file was not enough, the stepper-prose correction, the focus call, the duplicate ruling), `debugging.md` (anything that bit), `NOW.md` | vault | The history file exists and holds the group capture; `require-task-history.mjs` lets the completion through |

Fourteen tasks. T2 to T8 are the card and the console and could ship on their own if the groups half stalls.
T1, T9, T10 and T12 are the removal, and T1 and T12 are the only tasks that touch the database.

## 9. Hazards, ranked, with the guard that closes each

1. **One person becomes two rows during the deploy window.** The single worst outcome in this round, on a
   live roster with registration open, and it is caused by ordering rather than by code. Guard: `0068`
   changes both sides of the dedup comparison at once (empties the column, makes the function group-blind at
   its existing signature), so no client version can miss a returning player. Proved by §5.2 read-back 4,
   which calls the function three times, twice the old way and once the new, and asserts one id.
2. **The pre-flight finds duplicate names.** The name-only unique index in `0069` would refuse to build.
   Guard: STEP 1 is a **gate on the round opening**, at T1, not a check at the end. It runs alone, its
   result is read before anything else executes, and if it returns rows the round stops and Mike decides
   which row survives, before the tournament rather than after.
3. **The rollback restores empty structures.** `alter table drop column` and `drop table` destroy every
   group value and every catalog row irrecoverably. Guard: `0068` STEP 2 captures
   `select id, name, "group" from public.players where "group" is not null` verbatim into the round's
   history file, both migration headers say it is the only surviving copy, and the `0069` ROLLBACK line
   points at it. Residual: the `groups` table's own catalog-only rows (groups with no players) are not
   captured. Accepted, and named here rather than discovered later.
4. **`0069` lands before the last client push is out.** Every client still sending three keys would break
   the instant the overload is dropped. Guard: T12 runs after T11's drive, and T11's gate includes
   confirming the served `APP_VERSION`. A device that never reloads still fails visibly, not silently.
5. **The anon column grant vanishes with the column.** Postgres removes it silently, so nothing errors and
   a rollback that forgets it leaves the kiosk 403ing. Guard: read-back 8 and the explicit re-grant in the
   `0069` ROLLBACK line.
6. **A double attendance write from the card.** Guard: the draft is compared against `state.checkedIn` and
   `mgckToggleByKey` runs only on a real difference; source guard plus a drive fact.
7. **UNDO stranded on a stale toggle.** `mgckLast` drives both the strip and the UNDO handler
   (`public/app.js:9220-9224`). Guard: `{ silent: true }` on the card's toggle, `mgckNotice` as a separate
   binding, `mgckToggleByKey` clearing it on entry, and the strip cases in §7.3.
8. **A shared class carries a defect into a second dialog.** `.popup-header` serves the card and the Home
   rules sheet. Guard: the emitter grep before T3, both dialogs named in the CSS comment, both driven at
   T11. This is the exact class of defect the 2026-08-24 handoff shipped.
9. **A duplicate top-level declaration across `app.js` and `manage.js`.** A duplicate `function` is legal,
   the second silently wins, and `node --check` passes on the concatenation (C102 §5.3). Guard: names chosen
   disjoint, plus C102's disjoint-names guard test (`c02cd7b`) run on the branch.
10. **A half-deleted group layer passes `node --check`.** Deleting 39 helpers by hand can leave a caller
    behind, and a `ReferenceError` inside a swallowing `try/catch` is silent. This is exactly the shape E2
    would take if T10 ran before T9. Guard: E2 is scheduled at T9, T10's gate is a zero-hit scan for every
    deleted symbol, and the drive runs with the console open.
11. **The §38 gate now covers `manage.js`, in both maps.** `_vault-map.mjs:13` and the addendum frontmatter
    at `C:/Ai Master/LasOlas/projects/athletic-specimen.md:7` both carry a `manage\.js` term, so a large
    markup edit to `manage.js` without a fresh marker is BLOCKED mid-round. Guard: the marker is minted at
    T0 naming all four files, and it is session-scoped rather than HEAD-scoped, so a mid-task commit does
    not void it.
12. **The worktree falls outside the mapped project root.** `ui38-mark.mjs:32` resolves the project from
    `process.cwd()` through `projectFor`, and `_vault-map.mjs:13` matches on the base path
    `c:/users/olasm/onedrive/athletic specimen app`. A worktree outside that prefix cannot mint a marker at
    all. Guard: `scratchpad/wt-checkin` sits under the mapped root, so `proj.root` resolves to the main repo
    and the marker lands where the gate reads it.
13. **A test the harness cannot run.** There is no DOM in this suite and this round does not add one.
    Guard: §7.2's three shapes, and §7.4's explicit drive-fact list for everything they cannot reach.
14. **The branch merges before C102's equivalence proof.** Five Manage builders change here by design.
    Guard: the merge waits for the diff to run clean on main; stated in §8 and in the C102 ledger.

## 10. Open, and how each closes

- **`players.tag`.** The client writes group JSON into it (`serializePlayerGroupsTag`, `public/app.js:1009`)
  and reads it back (`parsePlayerGroupsTag`, `parseRemotePlayerGroupDetails`). After surface G nothing in
  the client touches it, but `detectPlayersSchema` still probes it and `HAS_TAG` still gates two insert
  shapes. Neither `0068` nor `0069` drops it, and it stays in anon's column grant (read-back 8). Closes at
  T12 with one read (`select count(*) from public.players where tag is not null;`) and one question to Mike:
  drop it in a follow-up `0070`, or leave it as a dormant free-text column. Recommendation: drop it, because
  every value in it is a group artifact.
- **The `groups` table's catalog-only rows.** `0068` STEP 2 captures per-player values from
  `players."group"`, not the catalog. A group that exists only in `public.groups` with no players (`0017`'s
  backfill deliberately preserved that case) is not captured anywhere. Closes at T12 with
  `select id, name from public.groups order by name;` saved beside the STEP 2 capture, which costs one query
  and makes hazard 3's residual zero.
- **The watermark mark.** README:523-524 says to use the real brand mark if the codebase has one; the app
  ships `logo-mark.png`. This spec keeps the handoff's inline shield-and-check SVG, because it is the drawn
  artwork of this round and a raster at 9% is heavier than a 1.4px stroke. One look at T11 settles it.
- **Focus on open.** §2 sets it to the card container, never a field. If Mike wants literally no focus move,
  delete the one `.pe-card.focus()` line; Escape still works, because the key handler is bound on the
  document, and the focus return on close is unaffected.
- **A focus trap inside the dialog.** README:364-365 asks for one using "the codebase's dialog primitive".
  The app has no dialog primitive: `#player-edit-modal` is a hand-built overlay. Not built this round.
  Named here so nobody assumes it shipped.
- **Whether the Manage CSS round should sweep the three orphaned rules** (`public/styles.css:1489`,
  `:2233-2235`, `:2240`) plus `.pe-hint` (`:3428`) and `groupRosterPlayersBySection` (`public/pure.js:652`,
  already caller-free at this HEAD, with five cases at `test/pure.test.js:441-492`). Deliberately out of
  scope here; recorded in the C102 CSS round's ledger at T13.
