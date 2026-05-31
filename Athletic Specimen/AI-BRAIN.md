# AI-BRAIN.md — Vault Schema & Operating Instructions

> **SUPERSEDED (2026-05-31).** This in-repo wiki is now a *legacy / historical*
> brain. The active master vault lives at
> `C:\Ai Master\Projects\Athletic Specimen\` (12-region brain layout).
> Session-start and write-back now target the master vault — see the repo
> `CLAUDE.md`. Read this file for historical context only; write new knowledge
> into the master vault. The mapping of legacy pages → master regions is in
> `C:\Ai Master\Projects\Athletic Specimen\11-archive\INDEX.md`.

## What This Vault Is
This is the persistent second brain for the **Athletic Specimen App** project.
Every important decision, preference, session log, and project context lives here.
Claude reads this file first at the start of every session before doing anything else.

## What Athletic Specimen Is
A mobile-first web app for running athletic pick-up sessions (gym, courts, etc.).
Core loop: players check in → admin generates balanced teams → live court play → results recorded.
Stack: vanilla JavaScript SPA (~9,200 lines in public/app.js), Supabase backend, Vercel hosting.
Repo: https://github.com/LasOIas/Athletic-Specimen-App.git

## Memory Hierarchy
PRIMARY:   This Obsidian vault (Athletic Specimen App/Athletic Specimen/)
BACKUP 1:  Claude Code session memory (c:/Users/OlasM/.claude/projects/.../memory/)
BACKUP 2:  CLAUDE.md and project config files

If vault is unavailable fall back to backup sources.
Never start a session without reading context first.

## Folder Structure

raw-sources/
  Drop zone for conversations, notes, screenshots, decisions.
  Immutable — Claude reads but never modifies.
  When new files appear here, ingest them immediately.

wiki/
  Claude owns this entirely. Never edit by hand.
  All organized knowledge lives here.

wiki/index.md
  Catalog of every wiki page with one-line summary.
  Update on every change. Always read this first.

wiki/log.md
  Append-only record of every session and update.
  Most recent entry at the top. Never delete entries.
  Format: [DATE TIME MT] — [what happened]

wiki/Preferences/
  How Michael likes to work. Communication style.
  Things that frustrate him. Things he likes.
  Read before every session.

wiki/Projects/
  One page per active project/feature track.
  Current status, key decisions, what matters most, what is next.

wiki/Decisions/
  Important decisions made, why they were made,
  what was rejected and why.

wiki/Memory/
  Things every Claude session must always know.
  Permanent context that never expires.

## Conventions
- All timestamps in MT timezone (America/Denver)
- All pages use YAML frontmatter:
    ---
    date: YYYY-MM-DD
    tags: [relevant, tags]
    last-updated: YYYY-MM-DD HH:MM MT
    summary: one line description
    ---
- Cross-link related pages using [[wikilink]] format
- Every page has a one-line summary at the very top
- Keep pages focused — one topic per page
- Prefer updating existing pages over creating new ones

## Workflows

### INGEST (when new files appear in raw-sources/)
1. Read the new file completely
2. Extract key ideas, decisions, preferences
3. Write or update relevant wiki pages
4. Update wiki/index.md with any new pages
5. Append entry to wiki/log.md
6. Never modify the raw-sources/ file itself

### QUERY (when answering questions about the app or project)
1. Read wiki/index.md to find relevant pages
2. Read those specific pages
3. Answer with context from the vault
4. If the answer reveals new knowledge worth keeping,
   write it back to the relevant wiki page

### SESSION START (every single session)
1. Read this file (AI-BRAIN.md)
2. Read wiki/index.md
3. Read wiki/Preferences/owner-preferences.md
4. Read wiki/Projects/athletic-specimen-app.md
5. Read wiki/Memory/always-remember.md
6. Now you have full context — proceed with the task

### SESSION END (after every session)
1. Update wiki/Projects/athletic-specimen-app.md with what changed
2. Add any new decisions to wiki/Decisions/
3. Update wiki/Preferences/ if new preferences observed
4. Append session summary to wiki/log.md
5. Update wiki/index.md if new pages were created
This step is not optional. The vault only works if it is updated every session.

### UPDATE PREFERENCES
Any time Michael expresses a preference, frustration, working style note,
or strong opinion — update wiki/Preferences/owner-preferences.md immediately.
Do not wait until session end.

### HEALTH CHECK (periodically)
- Look for contradictions between pages
- Look for stale information older than 30 days
- Look for orphan pages not linked from index
- Look for feature descriptions that no longer match the code

## What Good Entries Look Like

### wiki/log.md entry:
[2026-04-24 19:30 MT] Session 1 — Fixed mobile scroll jump bug with partialRender().
Bumped to v2026.04.25.2. Pushed to main.

### wiki/Projects/athletic-specimen-app.md entry:
## Current State
[one paragraph of where the project is right now]

## Recent Sessions
| Date | What Changed |
|------|--------------|
| Apr 24 | Fixed scroll jump; partialRender architecture |

## What Is Next
[bullet list of next priorities]

## Key Decisions
[important decisions with brief reasoning]

## Known Issues
[anything currently broken or concerning]

### wiki/Decisions/ entry:
## Decision: [title]
Date: YYYY-MM-DD
Chosen: [what was decided]
Rejected: [what was not chosen]
Why: [reasoning in 2-3 sentences]
Result: [outcome if known]

## Starting Checklist
  [x] wiki/index.md
  [x] wiki/log.md
  [x] wiki/Preferences/owner-preferences.md
  [x] wiki/Projects/athletic-specimen-app.md
  [x] wiki/Memory/always-remember.md

## Important Rules
- Never delete anything from raw-sources/
- Never edit wiki/ by hand — Claude owns it
- Never skip the session end update
- Never start a session without reading context
- Timestamps always in MT — never UTC
- APP_VERSION must be bumped with every code change (format: YYYY.MM.DD.N)
- When in doubt write it down — knowledge compounds
