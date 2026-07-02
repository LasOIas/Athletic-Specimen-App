# Athletic Specimen App — Claude Instructions

## MANDATORY — FIRST ACTION OF EVERY SESSION

**Invoke `lasolas-skill` via the Skill tool before reading anything else.** It loads
the cross-project rulebook at `C:\Ai Master\LasOlas\` (start at `rulebook.md`, the
index) and activates the pre-flight checklist that runs at the top of every turn.
The `LasOlas\projects\athletic-specimen.md` addendum carries this project's rules
(admin-only skill ratings, deploy hygiene, tournament spec, §51 no-neon, §52
numbered order).

If lasolas-skill isn't available, read `C:\Ai Master\LasOlas\rulebook.md` directly.

## Session Start (required, every session)
Primary brain is the master vault at `C:\Ai Master\Projects\Athletic Specimen\`
(12-region layout). Read these in order before doing anything else:
1. `C:\Ai Master\Projects\Athletic Specimen\01-state\NOW.md` (revive surface — FIRST)
2. `C:\Ai Master\Projects\Athletic Specimen\README.md`
3. `C:\Ai Master\Projects\Athletic Specimen\02-identity\overview.md`
4. `C:\Ai Master\Projects\Athletic Specimen\01-state\current.md`
4. `C:\Ai Master\Projects\Athletic Specimen\01-state\log.md` (newest entries at top)
5. `C:\Ai Master\Projects\Athletic Specimen\02-identity\mike-preferences.md`

The legacy in-repo wiki (`Athletic Specimen/AI-BRAIN.md` + `Athletic Specimen/wiki/`)
predates the master vault and is historical reference only — read it for
context, write new content into the master vault.

## Session End (required, every session)
Write back to the master vault (routing rules:
`C:\Ai Master\Projects\Athletic Specimen\00-brain-map\vault-update-protocol.md`):
1. Append a one-line entry (newest at top) to `01-state\log.md`
2. Update `01-state\current.md` with what changed
3. Add a `01-state\decisions.md` entry for any non-obvious architectural choice
4. Add a `01-state\debugging.md` entry for any new failure pattern
5. Write a `12-history\task-#<id>-<slug>.md` file BEFORE marking any task complete (Rule §30)

## Non-Negotiable Rules
- Bump `APP_VERSION` in `public/app.js` (line ~22) with every code change
  Format: `'YYYY.MM.DD.N'` — N resets to 1 each new day
- Commit and push after every fix — do not wait to be asked
- Use `partialRender()` for all background Supabase syncs, never `render()`
- Run `node --check public/app.js` after every edit to verify syntax
