---
date: 2026-04-24
tags: [project, athletic-specimen, active]
last-updated: 2026-04-24 20:00 MT
summary: Main Athletic Specimen App — status, roadmap, known issues
---

# Athletic Specimen App

## What It Is
Mobile-first web app for running pick-up athletic sessions.
Core loop: players check in → balanced teams generated → live court play → results recorded.

## Tech Stack
- **Frontend**: Vanilla JavaScript SPA, single file (`public/app.js` ~9,200 lines)
- **Backend**: Supabase (Postgres + real-time subscriptions)
- **Hosting**: Vercel
- **Repo**: https://github.com/LasOIas/Athletic-Specimen-App.git
- **Current version**: 2026.04.25.22

## Key Files
- `public/app.js` — entire application logic
- `public/index.html` — main app shell
- `public/checkin.html` — standalone mobile check-in page (separate from main app)
- `public/styles.css` — global styles

## Feature Map
- **Check-in**: name search autocomplete → tap to check in; new player registration
- **Player management**: skill ratings (1.0–10.0), group assignment, bulk operations, search/filter
- **Team generation**: skill-balanced, configurable team count, drag-and-drop rebalancing
- **Live play**: court assignments, match results, skill delta tracking
- **Tournament**: bracket management, real-time sync, authority/revision control
- **Admin**: master + tenant admin codes, multi-level access, QR code check-in URL
- **Sync**: Supabase real-time + local storage fallback, cross-device 15s interval refresh

## Current State
Stable and deployed. Session feature complete (2026-04-25): admin creates sessions from the Session tab, non-admins see the session on the Session tab, and checkin.html shows a "Next Session" banner above the check-in form. Sessions stored in Supabase `sessions` table (single-row upsert, id=1).

## Recent Sessions
| Date | What Changed |
|------|--------------|
| 2026-04-25 | Session feature complete: Supabase `sessions` table, admin form, non-admin view, checkin.html banner; v2026.04.25.22 |
| 2026-04-25 | UI overhaul: sticky search bar, back-to-top button, player name fix, group badge abbreviation, edit popup modal; v2026.04.25.17 |
| 2026-04-24 | Fixed mobile scroll jump (partialRender), code audit (-81 lines dead code), v2026.04.25.2 |

## What Is Next
Ideas discussed but not yet designed or built:
- **RSVP / pre-check-in** — players tap a link before arriving to pre-register; admin sees headcount ahead of time
- **Session history** — track which sessions each player attended, named by date
- **Game timer per court** — visible countdown per court so teams know when to rotate
- **Personal QR codes** — unique QR per player for instant check-in, no typing
- **Score tracking** — actual scores instead of just win/loss
- **Player status tags** — "injured", "sub only", "first time" visible on player card
- **Attendance history** — track which sessions each player attended
- **Export to CSV** — one-tap roster export with check-in status and skill
- **Shareable team card** — link/image of team assignments players can open on own phones
- **Skill auto-adjust after play** — nudge ratings based on match results

## Key Decisions
See [[Decisions/partialRender-scroll-fix]] for the architectural scroll fix.

## Architecture Notes
- `render()` = full root.innerHTML replacement (expensive, causes scroll jump) — use only for explicit user actions
- `partialRender()` = targeted updates to .players, #js-sync-notice, #js-checkin-stats — use for all background syncs
- `queueSupabaseRefresh(ms)` — debounced Supabase fetch; real-time channel and 15s interval both use 800ms delay
- Real-time channel: `postgres_changes` on `players` table
- `captureTransientInteractionState()` / `restoreTransientInteractionState()` — save/restore search input, selections, inline edits across renders

## Known Issues
None currently. Monitor for:
- Any remaining scroll issues on specific mobile browsers
- Real-time sync conflicts if multiple admins edit simultaneously
