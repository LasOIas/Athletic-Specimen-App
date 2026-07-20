# Admin Check-in page (Manage) — design spec

Date: 2026-07-19 · Session 14 · Status: Mike-approved ("Approved, build it")
Round: §38 A/B/C shown as one combined image; Mike's pick (verbatim): *"i like c, but this is for the manage page not a pick up day, the admins dont need to set up a day to be able to use this feature, also there needs to be filters to shows all, checked in, out"*

## 1. Problem

Mike (verbatim): *"we need to fix the pickup day check in for admins, its not practical how it is setup right now. i need to be able to click a name and check them in"*

Today an admin has two paths, both ceremony:
- The public Check In tab is the player kiosk: type a search (idle = no list), tap the row, then a C47 confirm popup per person (`publicCheckinHTML` app.js:6500, handler :10341-10417).
- Manage → Players: a row tap opens the edit sheet; check-in needs Select mode → tap rows → bulk "Check in" (:9961-9989, `mgpBulkAttendance` :7431).

## 2. The approved design (one page)

A new **Check-in** page inside Manage. C's rapid tap-and-undo feel, B's home and filters. No pickup-day gate anywhere on it: it renders and works whether or not any pickup day exists. The public Check In tab (players' kiosk) is untouched except the two copy fixes in §8.

Layout top to bottom (per the approved `d-merged` render):
1. `pd-pagehdr`: back (`data-mg-area="lead"`) + title **Check-in**.
2. Meta line (mgp-meta grammar): `<b>N</b> checked in · <b>M</b> players`.
3. Filter chips (`pl-tab` kit, full-width row): **All / In / Out**. All is default on every page open (module state does not persist a chip across visits).
4. Roster search (`cik-search` kit): placeholder "Search the roster". Filters within the active chip view; matched substring renders accent-bold via the existing escape-first `highlightMatch` (:5801).
5. Last-action strip (new `mgck-strip`): `"<Name> checked in"` / `"<Name> checked out"` + **UNDO** chip. Hidden until the first toggle of the visit; replaced on each action; UNDO reverses the action and clears the strip. Survives background repaints (module var), resets when leaving the page.
6. The list (new `#mgck-list`), rows in the **ckx row kit** (`.ckx-row/.ckx-nm/.ckx-gp/.ckx-go` reused verbatim):
   - **All**: section header "Still out · N" (hm-nethead grammar) then out rows, then "Checked in · N" then in rows.
   - **In** / **Out**: single list, no section headers.
   - Rows sorted A-Z by `normalize(name)` inside each section. Group chip under the name follows the same derivation the Players directory uses (`buildMgpListHTML` grp logic, :7325) so the two Manage lists read identically. Skill NEVER renders here (not needed; keeps rows clean).
   - Out row tag: `CHECK IN` (accent). In row tag: `IN` (live-ink), row dimmed (`.is-in`).
7. Search miss → dashed add row (mgp-add kit): `Add "<typed name>" to the roster` → registers AND checks in atomically.

Explicitly OUT (Mike-ratified): no bulk check-everyone-out (Start fresh in Pickup days owns that; avoids an accidental gym-wide checkout), no door-mode switch (an admin page is always armed), no per-tap confirm popup, no approval queue of any kind.

## 3. Interaction contract

- Tap an OUT row → checked in instantly (optimistic). Tap an IN row → checked out instantly. No popup, no mode.
- Every toggle updates: the tapped row's section/tag, both section counts, the meta line, the strip. Targeted DOM swaps only (see §5) — never a full render.
- UNDO = the reverse toggle through the exact same path, then the strip clears.
- Search never blocks tapping; clearing the search restores the full chip view.
- Add row: requires a full first + last name (same standard as the kiosk, C47). Invalid → inline message "Enter a first and last name" (mgck-msg line under the add row; no browser alert). Valid → optimistic insert + register (§4) + strip shows `"<Name> checked in"`.

## 4. Data + writes (C21 single-source — unchanged)

- State truth: `state.checkedIn` (identity keys) overlaid on `state.players` — same overlay approach as `buildKioskResultsHTML` (:5814).
- Toggle writes: `checkInPlayer/checkOutPlayer` (:1537/:1545) then `rpc('check_in'|'check_out', { p_id })`, on failure `outboxEnqueue({ key: 'att:'+id, kind: 'check_in'|'check_out', … })`, then `queueSupabaseRefresh()` — byte-for-byte the `performKioskToggle` pattern (:10372-10407). NEVER a direct `checked_in` column write (C21, :7406 comment).
- Add-and-check-in: the Wave-1d atomic path — `rpc('register_player', { p_name, p_group, p_checked_in: true })` with pending-row optimistic insert + outbox retry, exactly as the kiosk "I'm new" handler (:10458-10503). Group defaults to `CLUB_GROUP`.
- No schema change, no new RPCs, no grant changes (the RPCs already serve anon kiosk + authenticated).

## 5. Wiring (anchors)

- `manageView` gains `'checkin'` (module var :6745). Dispatcher `manageContainerHTML()` (:7010) gets `if (manageView === 'checkin') return buildManageCheckinHTML();`.
- Manage hub (`buildManagePageHTML`, mg-row emitter :6865): add the **Check-in** area row immediately ABOVE the Players row (the most-used floor action leads the people group). Row tap = existing generic `data-mg-area` container-swap (:10126).
- Delegation: new `if (manageView === 'checkin') { … }` block in the Manage click delegate BEFORE the generic `data-mg-area` fallthrough (pattern :9965): chip taps (`data-mgck-filter`), row taps (`data-mgck-id` → toggle), UNDO (`data-mgck-undo`), add (`data-mgck-add`). The page's back button carries `data-mg-area="lead"`.
- Search input (`#mgck-search`): `input` listener does a targeted `#mgck-list` innerHTML swap (the :9882-9886 mgp pattern) — the input element itself is never replaced. Toggles/undo swap `#mgck-list` + `#mgck-meta` + `#mgck-strip` and save/restore `#tab-manage.scrollTop` (F6 scroll-jump pattern).
- `partialRender` Manage exception ladder (:1000-1056): add the `manageView === 'checkin'` case mirroring 'players' (:1009-1016) — bail (sync-notice only) while `#mgck-search` is focused or non-empty; otherwise the plain container repaint is safe and keeps tags/counts live (the strip survives via its module var).
- Pure model (TDD, pure.js): `checkinConsoleModel(rows, filter, query)` where rows = `[{ key, id, name, group, checkedIn }]` (mapped from state in app.js): returns `{ counts: { in, out, total }, sections: [...], showAdd }`. Sections: All → `[{ id:'out', label:'Still out', rows }, { id:'in', label:'Checked in', rows }]`; In/Out → one section, no label. `showAdd` = trimmed query non-empty AND no exact `normalize(name)` match in the full roster (not the filtered slice). Sorting + substring filtering live here. Full-name validity stays in the handler (kiosk parity).

## 6. States

- Roster empty: "No players on the roster yet." (mgp-empty styling; chips + search still render).
- All view with 0 checked in: the "Checked in · 0" section shows "Nobody is checked in yet."; In view empty: same line. Out view empty: "Everyone is in."
- Roster not yet synced (`!state.loaded`): "Loading roster…" line in the list area (kiosk C1 parity); add row suppressed pre-sync (NF-8: a pre-sync add could duplicate an existing person).
- Offline: optimistic flips + outbox retries — identical behavior to the kiosk; the shared sync notice already communicates pending writes.

## 7. Desktop (§41)

Same page in the standard `#tab-manage .container` treatment at ≥1024 (top tab strip; container-centered like the Players directory — no special casing). Verified at 1280 in the same change.

## 8. Copy (no em dashes; plain sentences; middot for label·value)

New-page strings, exact: "Check-in" · "N checked in · M players" (bold numerals) · "All / In / Out" · "Search the roster" · "Still out · N" · "Checked in · N" · "<Name> checked in" · "<Name> checked out" · "UNDO" · `Add "<name>" to the roster` · "Enter a first and last name" · "No players on the roster yet." · "Nobody is checked in yet." · "Everyone is in." · "Loading roster…"
Kiosk fixes riding this slice (rendered em dashes that survived the 2026-07-16 sweep as HTML entities): app.js:6509 `I'm new &mdash; add me` → `I'm new · add me`; :5823 `No match &mdash; tap "I'm new" to add yourself.` → `No match. Tap "I'm new" to add yourself.` (Test copy assertions follow.)

## 9. Out of scope

The public Check In tab's admin stats card restyle (old kit, separate surface) · any change to checkin.html · bulk actions · seeding co-admins. The pickup-day gating of the public tab is untouched.

## 10. Verification gates (§27 / P3)

1. `node --check public/app.js` + full vitest green (new checkinConsoleModel cases: filter×3, section split + counts, A-Z normalize sort, query compose, showAdd exact-match suppression incl. case-insensitive, empty roster; updated kiosk copy assertions).
2. Localhost, admin-injected, 390 AND 1280: hub row opens the page · tap-toggle both directions with section/count/meta/strip updates · UNDO reverses + clears · chips filter · search narrows + highlight renders + add row appears on miss and registers-and-checks-in · type mid-poll: background sync never eats the query, caret, or scroll (storm watch ≥60s) · console 0.
3. Anon prod re-smoke after push: no Manage/Check-in leak, kiosk unchanged except the two copy fixes, register flow intact, console 0.
4. Prod version pill matches the pushed head; §27 cross-check one rendered value against DB ground truth (checked-in count vs `players.checked_in`).
5. Mike's phone = the feel check (his rule 6: the emulator can't prove iOS).

## 11. Version + deploy hygiene

APP_VERSION bump (`YYYY.MM.DD.N`, app.js ~:22) in the build commit; commit AND push per fix (declared §4 override); builder commits, controller reviews + pushes (§21/§29).

## Addendum (2026-07-19, Mike): skill renders on this page

Mike: "Admins should still be able to see the skill for players…" — supersedes §2.6's "Skill NEVER renders here" and §8's row spec. Each row shows the player's skill (mgpSkillText grammar, right-aligned before the state tag). Public surfaces remain skill-free (§AS-1).
