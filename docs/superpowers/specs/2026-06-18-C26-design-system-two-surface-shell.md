# C26 — Design system + two-surface redesign shell

**Date:** 2026-06-19. **Status:** **DESIGN COMPLETE — ready for `superpowers:writing-plans`.** (Brainstorm
approved: surface-routing architecture + per-surface IA/nav + exact direction-A tokens + per-screen layout.)
**Type:** Design-class, multi-session build. Under the umbrella vision
`2026-06-18-app-redesign-vision-design.md` (decomposition item 2). **HARD-GATE: no code until the plan is written.**

## Locked (umbrella vision + C26 brief — not re-litigated)
Direction **A "Clean Light"**; two clean surfaces; `state.isAdmin` = surface switch (real auth is a later
batch); vanilla-JS, **no router**, one `render()` + `partialRender()`; **no new features / no DB / no Auth**
this batch (shell + skin only); players never see `players.skill`; no neon, no emoji (SVG icons only);
mobile-first. Visual target = the approved mockups `.superpowers/brainstorm/direction-A-screens.html`
(public) + `direction-A-admin.html` (admin).

## Direction-A design tokens (lifted verbatim from the approved mockups)
Replace `styles.css` `:root` (lines 6–38) with:
```css
:root{
  --bg:oklch(0.985 0.003 75);    /* warm-stone app background */
  --card:oklch(0.97 0.003 75);   /* card / surface */
  --border:oklch(0.90 0.005 75);
  --ink:oklch(0.18 0.005 75);    /* primary text */
  --muted:oklch(0.50 0.005 75);  /* secondary text / labels */
  --faint:oklch(0.62 0.005 75);  /* tertiary text / icon stroke */
  --accent:oklch(0.55 0.07 240);       /* muted blue — single accent */
  --accent-soft:oklch(0.96 0.015 240); /* accent tint (avatar bg, pills, icon tiles) */
  --live:oklch(0.55 0.09 150);   /* muted green — live/positive/checked-in */
  --warn:oklch(0.58 0.10 70);    /* amber — admin cautions only */
}
```
- **Fonts (Google Fonts):** Inter (400/500/600/700/800) body+UI; Sora (600/700/800) brand, headings, scores,
  big numbers, avatar initials. Add the `<link rel=preconnect>` + the css2 link to `index.html` head; add the
  font files/URLs to the SW precache only if self-hosting (default: Google CDN — note it's a network dep).
- **Radii:** cards/stat 16px; buttons/courts/search/quick-action 13–14px; chips & status pills 20px (full);
  skill pill 6px; icon tiles / send 9–10px.
- **Shadow:** one soft token (e.g. `--shadow: 0 1px 2px oklch(0.18 0.005 75 / .06), 0 4px 14px oklch(0.18 0.005 75 / .05)`).
  **No glow.** Migrate hardcoded hex on touched components to tokens. Darken legacy `--text-4` usages to `--muted`/`--faint`
  (≥4.5:1). Reconcile the dark inline `<style>` in `index.html` (15–21) to the light system.

## Surface-routing architecture (APPROVED — Approach A)
```js
function render(){
  root.innerHTML = state.isAdmin ? renderAdminShell() : renderPublicShell();
  attachHandlers();
}
```
Each `*Shell()` builds its own `#app-header` + its own `.tab-panel`s + its own `#bottom-nav` (own nav set).
Reuse `activateMainTab(tab)` + `data-nav-tab` per surface; tab persistence becomes per-surface
(`as_main_tab_public` / `as_main_tab_admin`). **No `state.isAdmin ?` ternaries interleaved inside a shared
panel.** Low-level fragment builders (`adminPlayersHTML`, `publicCheckinHTML`, `buildTournamentTabHTML`,
`buildCheckinStatsHTML`, `adminTeamsHTML`, `adminLoginHTML`) are re-homed (re-wired, not rewritten — don't
touch tournament/balancing/sync internals).

## IA + nav (per surface)
- **Public (default, anonymous; bottom-nav 4):** **Home** · **Check In** · **Scores** · **Bracket**. No skill anywhere.
- **Admin console (bottom-nav 4 — APPROVED 2026-06-19, matches the mockup):** **Home (Dashboard)** · **Players** ·
  **Courts** · **Co-pilot**. **Tournament**, **Session**, **Check-in mode**, **Generate teams** are Dashboard
  **quick-action tiles** that open their full screens (Tournament is NOT its own nav tab).

## Per-screen layout (mockup classes → existing content)
**Public**
- **Home:** `.brand` (+ `.live` "Live now" dot) → "Next session" `.card` (`.lab` + 3 `.srow` with calendar/clock/pin
  **SVG** — replaces the emoji at `app.js:5451/5455/5459`) → `.cta` "Check In" → `.sec` "Live now · N courts" → `.court`
  rows (read-only scores). Read-only Next-Session card (today's `#tab-session` non-admin branch).
- **Check In:** `.ci-h`/`.ci-sub` → `.search` → `.person` rows (`.av` initials + name + `.grp`; `.in`+`.inpill` when
  checked in; **never skill**) → `.newbtn` "I'm new" → `.toast`. Maps from `publicCheckinHTML` + `buildCheckinStatsHTML`.
- **Scores:** `.brand` "Live scores" + `.live` "N playing" → `.court` rows (live) → `.sec` "Up next" → `.court` rows
  (queued). Read-only view of Live-Nets state.
- **Bracket:** reskinned read-only `buildTournamentTabHTML` standings/bracket (no submit controls).

**Admin**
- **Dashboard (Home):** `.top` (`.brand` + `.abadge` ADMIN + `.gear`) → `.statcard` (`.statbig` big Sora count +
  `.grpline` per-group) → `.sec` "Quick actions" → `.qgrid` of `.qa` tiles (Check-in mode, Generate teams,
  **Tournament**, Session) → `.copilot` teaser card. Session form lives behind the Session quick-action.
- **Players:** `.top` (Players · count + add `+`) → `.rsearch` → `.chips` (All/Checked in/Out/Groups) → `.prow`
  rows (`.av` + name + `.skill` pill **[admin-only]** + `.grp` + `.tg`/`.tg.in` In/Out). Maps from `adminPlayersHTML`.
- **Courts:** reskinned `adminTeamsHTML` (generate/drag/Live-Nets/courts).
- **Co-pilot:** **non-functional placeholder** this batch — the `.chat`/`.bub`/`.acts`/`.inbar` shell rendered
  static (no AI logic; that's a later batch). Shows the layout so later batches drop in.
- **Login:** `adminLoginHTML` (the C25-item-10 `<form>`) reskinned to tokens; entry from the public surface.

## Component inventory (build once, reuse): `.card .lab .sec .srow .cta .court .nav(.on) .brand .live`
(public) · `.search .person(.av,.in,.inpill) .newbtn .toast` (check-in) · `.top .abadge .gear .statcard .statbig
.grpline .qgrid .qa(.ic) .copilot` (dashboard) · `.rsearch .chips .chip(.on) .prow(.av,.skill,.grp,.tg,.tg.in)`
(roster) · `.chat .bub(.u,.a) .acts .inbar` (co-pilot). Inline **SVG icon set:** home, check, bars(scores),
bracket, players, courts, sparkle(co-pilot), calendar, clock, pin, search, plus, gear, send.

## Build sequence (4 member items — each: §38 three localhost options before shipping, §41 desktop+mobile, APP_VERSION+SW bump, node --check, commit)
1. **Direction-A token system** — `:root` tokens + Inter/Sora + radii/shadow; reconcile `index.html` inline style; darken secondary text.
2. **Two-surface split** — `renderPublicShell()` / `renderAdminShell()`; re-home fragments; per-surface tab persistence.
3. **Per-surface nav + IA** — each `#bottom-nav` (4 items) + `data-nav-tab` → its panels; Dashboard quick-actions wired.
4. **Mobile-first restyle + emoji→SVG** — every screen to tokens on 390px; replace emoji (`app.js:5435/5439/5443/5451/5455/5459` + `checkin.html` banner) with the SVG set; add `viewport-fit=cover` to `index.html`; bottom-nav clears the notch.

## Verification gate (at build time, per item)
direction-A tokens computed-live + Inter/Sora loaded (Network 200) + secondary text ≥4.5:1, zero neon; signed-out
shows ONLY public (no admin form/skill/Players-nav), sign-in swaps to admin; grep = no interleaved `isAdmin ?`
ternaries inside shared panels (before/after counts); every nav item on both surfaces clicks to the right panel
fast; `grep "📅\|🕙\|📍"` over `public/` = 0; desktop ≥1920 + mobile 390 screenshots + §27 9-question check on every
touched screen/modal; prod re-verified; 212 players still load (cross-check checked-in count vs Supabase).

## Next
`superpowers:writing-plans` → `docs/superpowers/plans/2026-06-18-C26-design-system-two-surface-shell.md` (sequenced
tasks + per-task gates) → build surgically per the plan. §30 history `12-history/task-#<id>-...` before complete.
