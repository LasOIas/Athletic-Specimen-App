# Full-App Screen Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. **First line of every subagent dispatch:** "Invoke lasolas-skill before doing anything else. Follow its pre-flight + 3-phase workflow + UI verification + vault writeback for this task." (rulebook §29)

**Goal:** Bring every remaining screen up to the live direction-A design system — consistent, readable, easy to use, all features intact — restructuring each screen (not just reskinning), and reducing scrolling where it's a natural win.

**Architecture:** Vanilla-JS SPA, single `public/app.js`, two surfaces (`renderPublicShell`/`renderAdminShell` from C26). Each screen is one builder function (+ its CSS in `public/styles.css`) rewritten to the locked direction-A layout; handlers/data paths are re-wired, not re-invented. Ships screen-by-screen to `main` (Vercel), each its own version + §38 + verification, on the proven C26 cadence.

**Tech Stack:** Vanilla JS (ES2015, no build), template-literal HTML, CSS custom properties (direction-A tokens, already live), Google Fonts (Inter/Sora), inline SVG. Supabase/Vercel unchanged. Verification: `node --check`, vitest (`/test`, pure.js + any new pure helper), Chrome DevTools MCP at 1920 + 390, real admin login, iPhone for safe-area.

## Global Constraints

Copied from the spec (`docs/superpowers/specs/2026-06-20-full-app-redesign-design.md`). Every task implicitly includes these.

- **Design system = direction-A, already live (C26). REUSE the existing tokens/components — do NOT change tokens.** Warm-stone oklch, Inter+Sora, muted-blue accent, `--live`/`--warn`/`--live-soft`, 16/13/9px radii, soft shadow, SVG icons.
- **Keep every existing feature** — this is a restructure, not a reduction. A feature whose home moves still exists + works.
- **No skill on any public/player surface** (rulebook §AS-1) — admin roster only.
- **No emoji, no neon** — SVG icons, direction-A tokens only.
- **`partialRender()` for background syncs**, full `render()` only for explicit user actions (no scroll-jump).
- **§38 — three distinct layouts before a screen ships.** The 3 priority screens are already locked (Check In = B kiosk, Players = A dense-flat, Courts = A nets-first); Session, Tournament/Bracket, checkin.html each get their §38 three-option round at their task.
- **§41 desktop + mobile in the same change; iPhone confirm** for anything touching safe-area/gestures.
- **`APP_VERSION` (app.js:27) + `SW_VERSION` (sw.js:3) bump in LOCKSTEP** per screen, `YYYY.MM.DD.N`. Current live: `2026.06.19.22` → next `2026.06.20.1`.
- **`node --check public/app.js`** after every edit; **vitest 19/19** must stay green (pure.js untouched unless a task adds a tested pure helper).
- **§30 history file** before completing each screen; **`03-anatomy/PRODUCT-SURFACE.md`** updated per screen.
- Build order (Mike: "you decide"): **Task 1 Check In → Task 2 Players roster → Task 3 Courts → Task 4 Session → Task 5 Tournament/Bracket → Task 6 checkin.html.**

## File structure

- `public/app.js` — the six builders, rewritten in place: `publicCheckinHTML()` (T1), `adminPlayersHTML()` + `renderFilteredPlayers()` (T2), `adminTeamsHTML()` (T3), the admin `tab-session` form block in `renderAdminShell()` (T4), `buildTournamentTabHTML()` + helpers (T5). New pure helper for T1 dedup → `public/pure.js` (tested). New event handlers in `attachHandlers()` per screen.
- `public/styles.css` — new component CSS per screen (namespaced: T1 reuses/extends `.k-*`/`.person`; T2 `.prow`/`.chip`; T3 `.net`/`.tcard`/`.szc`; T4 session-card; T5 tournament tables/bracket).
- `public/checkin.html` — T6 (light re-theme + kiosk tap-your-name).
- `public/pure.js` + `test/pure.test.js` — T1 adds `disambiguatePlayersByName()` (pure, tested).
- `03-anatomy/PRODUCT-SURFACE.md` — updated each task.

---

## Task 1 — Check In (public): kiosk tap-your-name (design LOCKED = §38 B)

**Files:** Modify `public/app.js` `publicCheckinHTML()` (~5031–5054) + `attachHandlers()` (type-ahead + tap handlers) + the public `tab-players` panel label/admin-login placement; Create pure helper in `public/pure.js` + test in `test/pure.test.js`; Modify `public/styles.css` (kiosk classes), `public/app.js:27`, `public/sw.js:3`.

**Interfaces:**
- Produces: `publicCheckinHTML() -> string` (kiosk layout), `disambiguatePlayersByName(players, query) -> [{id,name,group,initials,checkedIn}]` (pure, in pure.js), tap handlers wired to existing `check_in`/`check_out`/`register_player` RPC paths.
- Consumes: `state.players`, the existing self-serve check-in/out/register functions (the C21 RPC wrappers), `escapeHTML`.

- [ ] **Step 1 (TDD pure helper): write the failing test** in `test/pure.test.js`:
```js
import { disambiguatePlayersByName } from '../public/pure.js';
test('filters by name prefix, returns group for disambiguation, no skill', () => {
  const players = [
    { id:1, name:'Mike Salas', group:'Athletic Specimen', skill:7, checked_in:true },
    { id:2, name:'Mike Turner', group:'KC Volleyball', skill:3, checked_in:false },
    { id:3, name:'Dana Klein', group:'', skill:5, checked_in:false },
  ];
  const r = disambiguatePlayersByName(players, 'mi');
  expect(r.map(p=>p.name)).toEqual(['Mike Salas','Mike Turner']);
  expect(r[0]).toEqual({ id:1, name:'Mike Salas', group:'Athletic Specimen', initials:'MS', checkedIn:true });
  expect(JSON.stringify(r)).not.toMatch(/skill/i); // never leaks skill
});
test('empty query returns []', () => { expect(disambiguatePlayersByName([{id:1,name:'A B'}], '')).toEqual([]); });
```
- [ ] **Step 2: run it red** — `cd test && npx vitest run` → FAIL (`disambiguatePlayersByName` not defined).
- [ ] **Step 3: implement the pure helper** in `public/pure.js` (add to the exported set, classic-script-safe):
```js
function disambiguatePlayersByName(players, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  return (players || [])
    .filter(p => p && p.name && !/^__as_/.test(p.name) && p.name.toLowerCase().includes(q))
    .map(p => {
      const parts = String(p.name).trim().split(/\s+/);
      const initials = ((parts[0]||'')[0] || '') + ((parts[1]||'')[0] || '');
      return { id: p.id, name: p.name, group: p.group || '', initials: initials.toUpperCase(), checkedIn: !!p.checked_in };
    })
    .sort((a,b)=> a.name.toLowerCase().startsWith(q) === b.name.toLowerCase().startsWith(q) ? a.name.localeCompare(b.name) : (a.name.toLowerCase().startsWith(q) ? -1 : 1))
    .slice(0, 12);
}
```
(Keep the CJS export guard pattern pure.js already uses so the test imports it.)
- [ ] **Step 4: run it green** — `npx vitest run` → 21 passing (19 + 2 new).
- [ ] **Step 5: §38 N/A here** — Check In design already locked (B kiosk) at brainstorm. State that. (If a layout sub-fork arises during build, present 3 then.)
- [ ] **Step 6: rewrite `publicCheckinHTML()`** to the kiosk layout: big centered "Check in" + "Type your name, then tap it" + a large search input (`id="checkin-search"`) + a results container (`id="checkin-results"`) rendering large name buttons (`.k-btn` avatar+name+group, `data-checkin-id`) + an "I'm new — add me" button + a toast region. NO skill. Port the `.k-*` CSS from the locked mockup. Admin-login becomes a small corner "Admin" link (`data-role="open-admin-login"` → a compact modal or the existing login), NOT a full card (resolves the spec's open Q2 default).
- [ ] **Step 7: wire handlers** in `attachHandlers()`: input on `#checkin-search` → `disambiguatePlayersByName(state.players, value)` → render `.k-btn`s into `#checkin-results`; click a `.k-btn[data-checkin-id]` → if not checkedIn call the existing check-in path, if checkedIn call check-out (toggle) → toast + re-render the row; "I'm new" → the register path. All through the existing RPC wrappers (no new DB).
- [ ] **Step 8: `node --check`** clean; **vitest** 21 green.
- [ ] **Step 9: bump versions** (`2026.06.20.1`), **commit** (`feat(redesign): full-app T1 — Check In kiosk tap-your-name (no skill, all features)`). Controller pushes.
- [ ] **Step 10: verify prod** — public Check In: type a name → matching big buttons (group shown, NO skill); tap → checks in (DB-confirmed) + toast; tap again → checks out; "I'm new" registers; admin corner link logs in; §27 + §41 (1920+390); 0 console errors; 212 players. Update PRODUCT-SURFACE + §30 history.

**Verification gate (T1):** tap-your-name works end-to-end through the RPCs (in/out/register), group disambiguates same-names, NO skill anywhere, toast confirms, admin login still reachable, vitest 21 green, §27+§41, prod re-verified.

---

## Task 2 — Players roster (admin): dense flat list (design LOCKED = §38 A)

**Files:** Modify `public/app.js` `adminPlayersHTML()` (~4785–5050) + `renderFilteredPlayers()` (~2389) re-templated to `.prow` + bulk/filter handlers in `attachHandlers()`; Modify `public/styles.css` (`.prow`/`.chip`/floating bulk bar), versions.

**Interfaces:**
- Produces: `adminPlayersHTML() -> string` (title+add, sticky search, filter chips, dense rows container), `renderFilteredPlayers() -> string` (now `.prow` rows: avatar + name + skill pill + group + In/Out toggle + ⋮).
- Consumes: `state.players`/`checkedIn`/`playerTab`/`activeGroup`/`searchTerm`, `getAvailableGroups()`, `computeCheckedInByGroup()`, the existing bulk handlers, edit/delete modals, A–Z strip.

- [ ] **Step 1: §38 N/A** — roster design locked (A dense-flat). State it.
- [ ] **Step 2: re-template `renderFilteredPlayers()`** to emit `.prow` dense rows (avatar initials + name + `.skill` pill [admin-only] + group + a big `.tg` In/Out toggle [`data-role` existing check-in/out] + `.kebab` ⋮ [existing edit/delete menu]). Keep the per-row `data-*` the existing handlers expect (don't rename the hooks).
- [ ] **Step 3: rewrite `adminPlayersHTML()`** shell: title "Players · N" + add(+), **sticky search**, **filter chips** (All/Checked in/Out/Skill/Groups → set `state.playerTab`/open group filter; Skill chip reveals the skill-range sub-select; Groups chip → Manage Groups), the `.players` container (renderFilteredPlayers), the A–Z strip, and the **floating bulk bar** (shown only when selections exist — reuse `updateBulkBarVisibility()`).
- [ ] **Step 4: wire chip handlers** in `attachHandlers()` (chips set the same `state.playerTab`/group state the old `<select>`s did → `render()`/`partialRender`). Keep search, bulk, edit, delete, A–Z handlers intact (re-point selectors if class names changed).
- [ ] **Step 5: CSS** — `.prow`/`.chip(.on)`/`.skill`/`.tg(.in)`/`.kebab` + the floating `.bulkbar`; tokens only.
- [ ] **Step 6: `node --check` + vitest 19** green.
- [ ] **Step 7: bump versions + commit** (`feat(redesign): full-app T2 — Players roster dense flat list (all features)`). Push.
- [ ] **Step 8: verify prod (admin login):** dense rows render (skill admin-only), each filter chip filters correctly, search works, In/Out toggles + DB-confirms, ⋮ edit + delete (type-to-confirm) work, bulk bar floats on select + all bulk ops work, A–Z jumps, partialRender (no scroll-jump) on background sync, 212 players, §27+§41, 0 errors. PRODUCT-SURFACE + §30.

**Verification gate (T2):** every roster feature works in the new dense layout (5 filters, search, per-row in/out, edit, delete, bulk ×5, A–Z, group manager), skill admin-only, partialRender preserved, §27+§41, prod re-verified.

---

## Task 3 — Courts/Teams (admin): run-the-night nets-first (design LOCKED = §38 A)

**Files:** Modify `public/app.js` `adminTeamsHTML()` (~4743) to nets-first order; Modify `public/styles.css` (`.szc`/`.net`/`.wbtn`/`.tcard`), versions.

**Interfaces:**
- Produces: `adminTeamsHTML(teamsHTML, teamsFairnessHTML, liveMatchupsHTML) -> string` reordered: size chips + Generate → Live Nets board (top) → team cards → waiting teams.
- Consumes: the generated-teams block outputs (passed from `render()`), the Live-Nets derivation, drag handlers, Won/Clear handlers, court order.

- [ ] **Step 1: §38 N/A** — Courts locked (A nets-first). State it.
- [ ] **Step 2: restructure `adminTeamsHTML()`**: `.szc` size chips (2/3/4/6 with counts) + Generate; then the **Live Nets board** (`.net` cards: matchup + big `.wbtn` Won buttons + Clear when recorded + waiting teams) ABOVE the team cards; then the team cards (`.tcard`: team # + total + player rows, drag-drop kept). Reuse `liveMatchupsHTML`/`teamsHTML` content, just re-skin + reorder.
- [ ] **Step 3: CSS** — `.szc(.on)`/`.net`/`.wbtn(.win)`/`.tcard` + waiting-teams row; tokens only.
- [ ] **Step 4: `node --check` + vitest 19** green.
- [ ] **Step 5: bump versions + commit** (`feat(redesign): full-app T3 — Courts run-the-night nets-first (all features)`). Push.
- [ ] **Step 6: verify prod (admin):** size chips generate correct team counts, Generate (as-equal) works, Live Nets shows matchups + Won records a win (DB skill-delta intact) + Clear, waiting teams shown, drag-drop rebalance works (desktop + mobile long-press), §27+§41, 0 errors. PRODUCT-SURFACE + §30.

**Verification gate (T3):** size-generate + as-equal generate, Live Nets Won/Clear, court order, waiting teams, drag rebalance (both inputs), fairness summary — all work nets-first; §27+§41; prod re-verified.

---

## Task 4 — Session (admin): direction-A form (design §38 AT BUILD)

**Files:** Modify the `tab-session` admin block in `renderAdminShell()` (~5210–5249), `public/styles.css`, versions.

- [ ] **Step 1: §38 — three layouts** for the Session screen (e.g. A single card form / B form + live "what players see" preview side-by-side on wide / C stepper). Build localhost, screenshot 1920+390, Mike picks.
- [ ] **Step 2: rewrite the `tab-session` admin block** to the picked layout: direction-A card + labelled inputs (date/time/location), Save + Share QR buttons, the "what players will see" preview (already SVG icons from C26 4a). Keep Save (`btn-save-session`) + Share (`btn-share-session`) handlers.
- [ ] **Step 3: CSS** + `node --check` + vitest 19 green.
- [ ] **Step 4: bump versions + commit** (`feat(redesign): full-app T4 — Session form direction-A`). Push.
- [ ] **Step 5: verify prod (admin):** save a session (DB-confirmed, idempotent), Share QR opens, preview matches, §27+§41, 0 errors. PRODUCT-SURFACE + §30.

**Verification gate (T4):** Save + Share QR work, preview accurate, §38 picked layout shipped, §27+§41, prod re-verified.

---

## Task 5 — Tournament / Bracket: direction-A (design §38 AT BUILD) — largest remaining

**Files:** Modify `public/app.js` `buildTournamentTabHTML()` (~3161) + its sub-builders (pool standings, match list, bracket), the dark inline `.table`/`.badge` style in `index.html` (already reconciled in C26 4a — confirm), `public/styles.css`, versions.

- [ ] **Step 1: §38 — three layouts** for the tournament views (standings table density, match-row vs match-card, the phone single-round-focus vs wide tree). Build localhost, screenshot 1920+390, Mike picks.
- [ ] **Step 2: reskin `buildTournamentTabHTML()` + sub-builders** to direction-A (tokenized tables/cards, `.court-row`/`.tcard`-style rows, the existing phone single-round + wide-tree behavior preserved). **Do NOT touch the tournament ENGINE** (pools/seeding/bracket logic, `bindTournamentTabV2`, the RPCs) — skin only.
- [ ] **Step 3: CSS** + `node --check` + vitest 19 green (pure tournament logic untouched).
- [ ] **Step 4: bump versions + commit** (`feat(redesign): full-app T5 — Tournament/Bracket direction-A skin`). Push.
- [ ] **Step 5: verify prod** (synthetic tournament, admin): create → teams → pools → draw → start → submit/standings → generate bracket → win/advance → clear → delete, all confirm-guarded, in the new skin; §27+§41; 0 errors; clean up synthetic data. PRODUCT-SURFACE + §30.

**Verification gate (T5):** the full tournament lifecycle works unchanged in the new skin (engine untouched), phone + wide layouts both correct, §38 picked, §27+§41, prod re-verified.

---

## Task 6 — checkin.html (standalone kiosk): light direction-A + tap-your-name (design §38 AT BUILD)

**Files:** Modify `public/checkin.html` (`:root` dark → direction-A light, the banner + the tap-your-name flow to mirror T1), `public/sw.js` (precached → version bump), versions.

- [ ] **Step 1: §38 — three layouts** for the standalone kiosk (it shares the T1 kiosk pattern but is its own page; show 3 treatments). Mike picks.
- [ ] **Step 2: re-theme `checkin.html`** `:root` to the direction-A light tokens (mirror styles.css), reskin the banner (SVG icons already from C26 4a) + the existing typeahead/tap flow to the kiosk look; keep its Supabase config + check-in logic.
- [ ] **Step 3: `node --check` n/a (html); grep emoji = 0; bump SW + APP version** (checkin.html is SW-precached).
- [ ] **Step 4: commit** (`feat(redesign): full-app T6 — checkin.html light direction-A kiosk`). Push.
- [ ] **Step 5: verify prod** `/checkin.html`: light theme, banner + typeahead + tap-to-check-in work (DB-confirmed), no skill, no emoji, §41 (390 primary — it's a phone kiosk), 0 errors (favicon 404 pre-existing). PRODUCT-SURFACE + §30.

**Verification gate (T6):** kiosk light-themed + tap-your-name works end-to-end, no skill/emoji, §38 picked, prod re-verified on a phone width.

---

## Self-review (against the spec)

**1. Spec coverage:** Players roster → T2 ✓; Check In → T1 ✓; Courts → T3 ✓; Session → T4 ✓; Tournament/Bracket → T5 ✓; checkin.html → T6 ✓; already-done Home/Scores/Dashboard/Co-pilot → no task (correct, C26 done) ✓; C27 tap-your-name folded → T1 + T6 ✓; "keep every feature" → each task's verification gate enumerates the features ✓; §38 → locked screens state "N/A locked", others have a §38 step ✓; no-skill/no-emoji/no-neon/partialRender/version-lockstep/§30/PRODUCT-SURFACE → Global Constraints + per-task gates ✓.

**2. Placeholder scan:** T1's pure helper has full code + tests; the reskin tasks reference exact builders by name/line + the locked §38 designs; the §38-at-build tasks have a concrete §38 step (a defined process, not a TBD). No "add error handling"/"similar to Task N".

**3. Type/name consistency:** `publicCheckinHTML`/`adminPlayersHTML`/`renderFilteredPlayers`/`adminTeamsHTML`/`buildTournamentTabHTML`/`disambiguatePlayersByName` used consistently; existing handler `data-*` hooks preserved (not renamed); versions monotonic `2026.06.20.N`.

## Open questions (carried from spec, resolve at the relevant task)
- Build order = Check In → Roster → Courts → Session → Bracket → checkin.html (Mike: "you decide"). ✓ locked.
- Admin-login placement on public Check In = small corner "Admin" link (T1 Step 6 default).
- Same-name disambiguation = group + full name (T1; never skill).

## Notes
- Multi-session: 6 screen-increments, each a task boundary (End-flight + notify). Spec: `docs/superpowers/specs/2026-06-20-full-app-redesign-design.md`. Tracked as C36.
- Complex builders (T1 check-in behavior, T2 roster, T3 courts, T5 tournament) → subagent-driven with the full opus implementer+reviewer loop; T4/T6 are lighter reskins.
