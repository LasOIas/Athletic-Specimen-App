# Athletic Specimen — Whole-App Redesign + AI Assistant — Vision Spec

**Date:** 2026-06-18
**Status:** Vision approved (direction + decisions locked in brainstorm). Multi-subsystem — this is the umbrella vision; each sub-project gets its own spec → plan → build (via §50 Opus prompts off the §49 upgrade-options list).
**Origin (Mike):** *"we need to brainstorm the whole app, i want an ai assistant to be part of A.S that has access to the whole app just like relays is. i dont like the look of the app its very cluttered and not easy to use on mobile i want to redo all of it. we need to think about the app from start to finish as in what admins see and what normal players see, i think we can expand the app a whole lot more for both those. this is a massive task dont be lazy, use upgrade options and taskify also."*

---

## 1. Locked decisions (from the brainstorm)

| # | Decision | Mike's steer |
|---|---|---|
| Identity | **No player accounts (for now).** Players stay anonymous. | "i dont think we need accounts yet" |
| Saved data | **Tournament results + a per-session "what happened" recap.** No per-player profiles/stats/leaderboards yet. | "the only saved data i want right now is from tournies and maybe an overall what happened each time" |
| Check-in | **Must be fixed.** Today it's slow (manual admin tapping) + the QR is unreliable (people omit last names → can't tell who checked in). | "we need to fix this too somehow" |
| AI assistant | **Admin co-pilot that ACTS (command-and-do across the whole app) + a read-only public bot for players.** Build the admin co-pilot first. | chose "Admin co-pilot + public bot" |
| App structure | **Two clean surfaces:** a simple public/player view (default) + a separate admin console. Declutters by not mixing audiences. | chose "Two clean surfaces" |
| Design direction | **"A — Clean Light"**, built on Relay's design system: warm-stone backgrounds, Inter + Sora, one muted-blue accent, ~10–16px radius, restrained. | "a is the best", "i dont mind having blue" |

**Hard constraints (saved as standing rules):**
- **Players never see skill ratings** — admin-only; disambiguate player-facing screens by group/last-name/photo, never skill. (Rule saved 2026-06-18.)
- **No neon / glowing colors** unless explicitly asked. (Rule saved 2026-06-18.)
- **No emojis in the UI** — real SVG icons only. (Rule saved 2026-06-18.)
- Mobile-first everywhere (Mike runs sessions on his phone). Bump APP_VERSION every change.

---

## 2. Design system (direction A — inherited from Relay)

- **Palette (light):** bg `oklch(0.985 0.003 75)`, card `oklch(0.97 0.003 75)`, border `oklch(0.90 0.005 75)`, text `oklch(0.18 0.005 75)`, muted `oklch(0.50 0.005 75)`, **accent (blue)** `oklch(0.55 0.07 240)`, soft-accent `oklch(0.96 0.015 240)`, live/positive (muted green, NOT neon) `oklch(0.55 0.09 150)`, danger `oklch(0.55 0.20 25)`.
- **Type:** Inter (400–800, body + UI) + Sora (600–800, brand/headings/scores). Loaded via Google Fonts (or next/font if we move to a framework).
- **Components:** radius 10–16px, 1px borders, soft shadows (no glow), SVG icons throughout, generous spacing, big tap targets.
- A dark variant is available later (Relay's dark tokens) — not required for v1.
- Mockups (approved): `.superpowers/brainstorm/direction-A-screens.png` (player) + `direction-A-admin.png` (admin).

---

## 3. The two surfaces

### 3a. Public / Player view (default, anonymous, no skill)
- **Home:** Next Session card, big **Check In** CTA, Live-now courts.
- **Check-In (the fix):** self-serve **tap-your-name** (no typing) — works as a door kiosk AND via the QR link, same screen. Same-name people disambiguated by **group / last name / photo-initials** (never skill) + an "Is this you?" confirm + honest "you're checked in" state. **"I'm new — add me"** with dup-prevention.
- **Live Scores:** per-net live scores + "up next per net".
- **Bracket:** mobile-readable bracket for spectators.
- **Public AI bot (read-only):** "when/where is the next session?", "who's up on court 3?", "show the bracket". Must refuse to reveal any player's skill.

### 3b. Admin Console (separate, mobile-first)
- **Dashboard:** checked-in count + per-group, quick actions (Check-in mode, Generate Teams, Tournament, Session), co-pilot entry.
- **Players:** roster with **skill visible (admin-only)**, fast check-in, add/edit, groups, bulk.
- **Courts / Live Nets** + **Tournament** (existing, restyled).
- **AI Co-pilot (acts):** natural-language command-and-do across the whole app, with confirm for destructive actions ("make 4 teams of 4 from who's in" → does it → "Apply?"; "start a 6-team tournament"; "who hasn't played on Net 2?").

---

## 4. Decomposition (sub-projects, dependency order)

1. **Identity & access model + security (P0 foundation)** — real admin auth (Supabase Auth), rewritten RLS (anon SELECT-only + narrow validated RPCs for check-in/register/submit-score), no player accounts. Unblocks the AI's safe action scope + protects data (the open-RLS check-in wipe on 2026-06-18 is the cautionary tale).
2. **Design system + IA shell** — direction A tokens + components; the two-surface split (public view vs admin console); navigation; mobile-first.
3. **Check-in fix** — self-serve tap kiosk/QR + admin fast check-in, shared disambiguation + dup-prevention.
4. **AI co-pilot (admin, acts)** — the Relay-style assistant with whole-app read + scoped action tools + confirm gates. Then the read-only public bot.
5. **History** — tournament results archive + per-session "what happened" recap.
6. **Player-view + admin expansion** — the rest of the ranked upgrade-options.

Each becomes ranked items in the §49 upgrade-options list, then §50 Opus build prompts. Security (1) is brainstorm-gated and goes first.

---

## 5. Out of scope (v1)
- Player accounts / per-player profiles / leaderboards (revisit later).
- Multi-sport generalization beyond what naturally falls out of the redesign (P4 vision — separate track).
- A dark theme (available later from Relay tokens; not required for v1).

---

## 6. Next steps
1. **§49 Upgrade options** — exhaustive, ranked, versioned list (NEEDS FIXED · UPGRADES for admins + players · OUTSIDE THE APP), grounded in the real code/DB, saved to `<vault>/13-upgrade-options/`.
2. **Mike decides** which items to do.
3. **§50 Taskify** — each decision → a `Tasks From Claude` entry + a self-contained Opus build prompt.
4. Build security first, then the redesign shell, then the rest — each as its own spec → plan → build.
