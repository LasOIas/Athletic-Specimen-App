# C26 — Design system + two-surface redesign shell

**Date:** design kicked off 2026-06-19 (umbrella vision dated 2026-06-18).
**Status:** **Design in progress.** Structural architecture + IA + build-sequence + screen mapping
APPROVED (this doc). Remaining before build: exact direction-A token values lifted from the approved
mockups + per-screen layout detail → then `superpowers:writing-plans` → build. **HARD-GATE: no code yet.**
**Type:** Design-class, multi-session. Sits under the umbrella vision
`2026-06-18-app-redesign-vision-design.md` (decomposition item 2) — locked decisions there are NOT re-litigated.

## Locked (from the umbrella vision + the C26 brief — do not re-litigate)
- Direction **A "Clean Light"** (warm-stone + muted-blue accent + muted-green positive, Inter + Sora,
  soft shadows, 10–16px radius, **no neon, no emoji** — SVG icons only). Mockups approved:
  `.superpowers/brainstorm/direction-A-screens.{png,html}` (public) + `direction-A-admin.{png,html}` (admin).
- **Two clean surfaces.** `state.isAdmin` stays the surface discriminator (real auth is a separate batch).
- Vanilla-JS SPA — **no router/framework**; keep one `render()` + `partialRender()` + `activateMainTab` + `#bottom-nav`.
- **No new features / no DB / no Supabase Auth** this batch — shell + skin only. Players never see `players.skill`.

## DECIDED — surface-routing architecture (Approach A, approved 2026-06-19)
`render()` branches at the SHELL level on `state.isAdmin`:
```js
function render(){
  root.innerHTML = state.isAdmin ? renderAdminShell() : renderPublicShell();
  attachHandlers();
}
```
- Each `*Shell()` builds its **own** `#app-header` + its **own** set of `.tab-panel`s + its **own**
  `#bottom-nav` (its own nav set). **No `state.isAdmin ?` ternaries interleaved inside a shared panel** —
  that interleaving is the "cluttered" problem being removed.
- Reuse the existing `activateMainTab(tab)` + `data-nav-tab` mechanism **per surface**. `activeMainTab`
  persistence becomes **per-surface** sessionStorage keys (`as_main_tab_public` / `as_main_tab_admin`) so
  switching surfaces (login/logout) restores each surface's own last tab.
- Shared low-level fragment builders (`adminPlayersHTML`, `publicCheckinHTML`, `buildTournamentTabHTML`,
  `buildCheckinStatsHTML`, `adminTeamsHTML`, `adminLoginHTML`) are **re-homed** into the right shell —
  re-wired, not rewritten (Karpathy surgical; don't touch tournament/balancing/sync internals).

Rejected: **B** one-shell-swap-panel-sets (keeps conditional logic in one tree — closer to today's clutter);
**C** a `currentSurface` dispatcher/router (more new machinery, edges toward the forbidden router).

## Per-surface IA (locked by the brief)
- **Public (default, anonymous):** Home/Session · Check-In · Live Scores · Bracket. No skill, ever.
- **Admin console:** Dashboard · Players (skill visible) · Teams/Courts · Tournament · Co-pilot (placeholder shell only).

## Screen → surface mapping (from today's panels)
| Today (one shell, 4 shared tabs) | → Public surface | → Admin surface |
|---|---|---|
| `#tab-session` (admin session form vs player "Next Session") | **Home/Session** (player Next-Session card, read-only) | **Dashboard** (session form + at-a-glance) |
| `#tab-players` (`adminPlayersHTML` vs `publicCheckinHTML`) | **Check-In** (`publicCheckinHTML` + `buildCheckinStatsHTML`, no skill) | **Players** (`adminPlayersHTML`, skill visible) |
| `#tab-teams` (admin teams vs "log in as admin") | **Live Scores** (read-only Live Nets / scores) | **Teams/Courts** (`adminTeamsHTML`, generate/drag/Live-Nets) |
| `#tab-tournament` (`buildTournamentTabHTML`) | **Bracket** (read-only standings/bracket) | **Tournament** (full admin tournament mgmt) |
| (login) `adminLoginHTML` | entry to admin (login) | — |
| (new) | — | **Co-pilot** (non-functional placeholder panel) |

## Build sequence (the 4 member items — each its own §38 3-options + §41 desktop+mobile)
1. **Direction-A token system** — replace `styles.css` `:root` (6–38) with the direction-A palette/radii/shadows,
   load Inter+Sora, darken `--text-4` to ≥4.5:1, reconcile the dark inline `<style>` in `index.html` (15–21).
2. **Two-surface split** — `renderPublicShell()` / `renderAdminShell()` per the architecture above; re-home fragments.
3. **Per-surface nav + IA** — each surface's `#bottom-nav` + `data-nav-tab` → its panels; per-surface tab persistence.
4. **Mobile-first restyle + emoji→SVG** — every screen to direction A on 390px; replace emoji
   (`app.js:5435/5439/5443/5451/5455/5459` + `checkin.html` banner) with inline SVG; add `viewport-fit=cover`.

## Remaining design work BEFORE writing-plans/build (next design session)
- Lift exact direction-A token values (oklch palette, shadow/radius scale, font weights) from the approved
  mockup `.html` files (open them in the browser; the brief points to them as the visual target).
- Per-screen layout detail for each restyled screen (Dashboard composition, Home card, Live Scores read-only view).
- Then: `superpowers:writing-plans` → sequenced plan with per-task verification gates → build (surgical, per the brief's verification gate).

## Verification gate (per the brief — applied at build time)
direction-A tokens computed-live + Inter/Sora loaded + `--text-4` ≥4.5:1; signed-out shows ONLY public
(no admin form/skill/Teams nav), sign-in swaps to admin; grep shows no interleaved `isAdmin ?` ternaries
inside shared panels (before/after counts); every nav item on both surfaces clicks to the right panel
fast; `grep "📅\|🕙\|📍"` over `public/` = 0; desktop ≥1920 + mobile 390 screenshots + §27 9-question check;
prod re-verified; 212 players still load.
