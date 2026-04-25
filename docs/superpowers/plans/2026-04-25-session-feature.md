# Session Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admin create a session (date, time, location) that non-admins see on the check-in page and in the Session tab.

**Architecture:** A `sessions` table in Supabase holds one row (id=1, always upserted). `app.js` loads the session into `state.currentSession` at startup and renders different Session tab content for admin vs non-admin. `checkin.html` fetches the session independently and displays it above the check-in form.

**Tech Stack:** Vanilla JS, Supabase anon key (same pattern as `players`), existing `styles.css` design tokens.

---

## File Map

| File | What changes |
|---|---|
| `public/app.js` | Add `state.currentSession`, `loadSession()`, `saveSession()`, session tab HTML (admin form + non-admin view), handler wiring in `attachHandlers()` |
| `public/styles.css` | Session tab card, form, and info-card styles |
| `public/checkin.html` | Session card above the check-in form, fetched fresh on load |

---

### Task 1: Create the Supabase `sessions` table

**Files:**
- No local files — Supabase migration only

- [ ] **Step 1: Apply migration via Supabase MCP**

Run this SQL against the project (`mlzblkzflgylnjorgjcp`):

```sql
create table if not exists public.sessions (
  id integer primary key,
  date text,
  time text,
  location text,
  updated_at timestamptz default now()
);

alter table public.sessions enable row level security;

create policy "public read sessions"
  on public.sessions for select using (true);

create policy "anon write sessions"
  on public.sessions for all using (true) with check (true);
```

Note: `date` is stored as `text` (e.g. `"2026-05-03"`) to avoid timezone conversion surprises. `id` is always `1`.

- [ ] **Step 2: Verify table exists**

Use Supabase MCP `list_tables` and confirm `sessions` appears with the four columns.

---

### Task 2: Add `state.currentSession` and load/save functions to `app.js`

**Files:**
- Modify: `public/app.js` — state object (~line 2391), near the top-level async helpers

- [ ] **Step 1: Add `currentSession` to state**

In the `state` object (around line 2415, after `sharedSyncError`), add:

```js
  currentSession: null, // { date, time, location } or null
```

- [ ] **Step 2: Add `loadSession()` function**

Place this function near the other Supabase helpers (e.g. after `syncFromSupabase`):

```js
async function loadSession() {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient
      .from('sessions')
      .select('date, time, location')
      .eq('id', 1)
      .maybeSingle();
    if (error) throw error;
    state.currentSession = data || null;
  } catch (err) {
    console.warn('loadSession error', err);
  }
}
```

- [ ] **Step 3: Add `saveSession()` function**

Place immediately after `loadSession()`:

```js
async function saveSession(date, time, location) {
  if (!supabaseClient) return false;
  try {
    const { error } = await supabaseClient
      .from('sessions')
      .upsert({ id: 1, date, time, location, updated_at: new Date().toISOString() });
    if (error) throw error;
    state.currentSession = { date, time, location };
    return true;
  } catch (err) {
    console.warn('saveSession error', err);
    return false;
  }
}
```

- [ ] **Step 4: Call `loadSession()` inside `init()`**

Inside the `init()` function, in the Supabase async block after `render()` is called (around line 9347 where `render()` is called after `synced`), add a call so the session loads at startup:

```js
// after the existing render() call inside the supabase async block:
loadSession().then(() => { if (state.currentSession) render(); });
```

- [ ] **Step 5: Bump APP_VERSION**

Change line ~22:
```js
const APP_VERSION = '2026.04.25.18';
```

- [ ] **Step 6: Syntax check**
```bash
node --check public/app.js && echo "SYNTAX OK"
```

- [ ] **Step 7: Commit**
```bash
git add public/app.js
git commit -m "feat: add state.currentSession, loadSession(), saveSession()"
```

---

### Task 3: Build the Session tab HTML (admin form + non-admin view)

**Files:**
- Modify: `public/app.js` — `#tab-session` HTML block (~line 7779)

- [ ] **Step 1: Replace the placeholder Session tab HTML**

Find and replace the entire `<div id="tab-session" ...>` block (currently shows "Coming soon"):

```js
    <div id="tab-session" class="tab-panel">
      <div class="container">
        ${state.isAdmin ? `
          <div class="card session-admin-card">
            <h3 style="margin:0 0 12px;">Current Session</h3>
            <div class="session-form">
              <label class="session-label" for="session-date">Date</label>
              <input type="date" id="session-date" class="session-input"
                value="${state.currentSession?.date || ''}" />
              <label class="session-label" for="session-time">Time</label>
              <input type="text" id="session-time" class="session-input"
                placeholder="e.g. 10:00 AM"
                value="${escapeHTML(state.currentSession?.time || '')}" />
              <label class="session-label" for="session-location">Location</label>
              <input type="text" id="session-location" class="session-input"
                placeholder="e.g. Gym A, 123 Main St"
                value="${escapeHTML(state.currentSession?.location || '')}" />
              <div class="session-form-actions">
                <button id="btn-save-session" class="primary">Save Session</button>
                <button id="btn-share-session" class="secondary">Share QR / Link</button>
              </div>
              <div id="session-save-msg" style="display:none; margin-top:8px; font-size:13px; color:var(--success);"></div>
            </div>
          </div>
          ${state.currentSession ? `
          <div class="card session-info-card">
            <p class="session-info-label">What players will see</p>
            <div class="session-detail-row">
              <span class="session-detail-icon">📅</span>
              <span>${escapeHTML(formatSessionDate(state.currentSession.date))}</span>
            </div>
            <div class="session-detail-row">
              <span class="session-detail-icon">🕙</span>
              <span>${escapeHTML(state.currentSession.time || '')}</span>
            </div>
            <div class="session-detail-row">
              <span class="session-detail-icon">📍</span>
              <span>${escapeHTML(state.currentSession.location || '')}</span>
            </div>
          </div>` : ''}
        ` : state.currentSession ? `
          <div class="card session-info-card">
            <h3 style="margin:0 0 12px;">Next Session</h3>
            <div class="session-detail-row">
              <span class="session-detail-icon">📅</span>
              <span>${escapeHTML(formatSessionDate(state.currentSession.date))}</span>
            </div>
            <div class="session-detail-row">
              <span class="session-detail-icon">🕙</span>
              <span>${escapeHTML(state.currentSession.time || '')}</span>
            </div>
            <div class="session-detail-row">
              <span class="session-detail-icon">📍</span>
              <span>${escapeHTML(state.currentSession.location || '')}</span>
            </div>
          </div>
        ` : `
          <div class="session-empty-state">
            <div class="session-empty-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
                <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>
              </svg>
            </div>
            <h2 class="session-empty-title">No Session Scheduled</h2>
            <p class="session-empty-desc">Check back soon for the next session details.</p>
          </div>
        `}
      </div>
    </div>
```

- [ ] **Step 2: Add `formatSessionDate()` helper**

Add this function near the other formatting helpers in `app.js` (e.g. near `escapeHTML`):

```js
function formatSessionDate(dateStr) {
  if (!dateStr) return '';
  // dateStr is "YYYY-MM-DD"; parse as local date to avoid UTC shift
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}
```

- [ ] **Step 3: Syntax check**
```bash
node --check public/app.js && echo "SYNTAX OK"
```

- [ ] **Step 4: Bump and commit**
```js
const APP_VERSION = '2026.04.25.19';
```
```bash
git add public/app.js
git commit -m "feat: session tab HTML — admin form + non-admin read-only view"
```

---

### Task 4: Wire save and share handlers in `attachHandlers()`

**Files:**
- Modify: `public/app.js` — `attachHandlers()` function (~line 8087)

- [ ] **Step 1: Add session handler block inside `attachHandlers()`**

At the end of `attachHandlers()`, just before the closing `}`, add:

```js
  // --- Session tab handlers ---
  const btnSaveSession = document.getElementById('btn-save-session');
  if (btnSaveSession) {
    btnSaveSession.addEventListener('click', async () => {
      const date     = (document.getElementById('session-date')?.value     || '').trim();
      const time     = (document.getElementById('session-time')?.value     || '').trim();
      const location = (document.getElementById('session-location')?.value || '').trim();
      if (!date || !time || !location) {
        const msg = document.getElementById('session-save-msg');
        if (msg) { msg.style.color = 'var(--danger)'; msg.textContent = 'Please fill in all three fields.'; msg.style.display = 'block'; }
        return;
      }
      btnSaveSession.disabled = true;
      btnSaveSession.textContent = 'Saving…';
      const ok = await saveSession(date, time, location);
      btnSaveSession.disabled = false;
      btnSaveSession.textContent = 'Save Session';
      const msg = document.getElementById('session-save-msg');
      if (msg) {
        msg.style.color = ok ? 'var(--success)' : 'var(--danger)';
        msg.textContent  = ok ? '✓ Session saved' : '✗ Save failed — check connection';
        msg.style.display = 'block';
        if (ok) { setTimeout(() => { msg.style.display = 'none'; }, 2500); render(); }
      }
    });
  }

  const btnShareSession = document.getElementById('btn-share-session');
  if (btnShareSession) {
    btnShareSession.addEventListener('click', () => openQrModal());
  }
```

- [ ] **Step 2: Syntax check**
```bash
node --check public/app.js && echo "SYNTAX OK"
```

- [ ] **Step 3: Bump and commit**
```js
const APP_VERSION = '2026.04.25.20';
```
```bash
git add public/app.js
git commit -m "feat: wire save and share handlers for session tab"
```

---

### Task 5: Add session styles to `styles.css`

**Files:**
- Modify: `public/styles.css` — append to the session section

- [ ] **Step 1: Find the existing session empty-state styles and add the new rules after them**

Search for `.session-empty-state` in `styles.css`. After that block, add:

```css
/* ── Session tab ── */
.session-admin-card h3,
.session-info-card h3 { margin: 0 0 12px; }

.session-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.session-label {
  font-size: .8rem;
  font-weight: 600;
  color: var(--text-2);
  margin-top: 6px;
}
.session-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  background: var(--surface);
  color: var(--text);
  font-size: 16px;
  box-sizing: border-box;
}
.session-form-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  flex-wrap: wrap;
}
.session-form-actions button { flex: 1 1 140px; min-height: 42px; }

.session-info-label {
  font-size: .75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .05em;
  color: var(--text-3);
  margin: 0 0 10px;
}
.session-detail-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  font-size: 1rem;
}
.session-detail-row:last-child { border-bottom: none; }
.session-detail-icon { font-size: 1.1rem; flex-shrink: 0; width: 24px; }
```

- [ ] **Step 2: Bump version and commit**
```js
const APP_VERSION = '2026.04.25.21';
```
```bash
git add public/styles.css public/app.js
git commit -m "feat: session tab styles"
```

---

### Task 6: Add session card to `checkin.html`

**Files:**
- Modify: `public/checkin.html`

- [ ] **Step 1: Add the session card element and its styles to `checkin.html`**

Inside `<body>`, before `<div id="app">`, add:

```html
  <div id="session-banner" hidden style="
    background: #1c2129;
    border: 1px solid #262d38;
    border-radius: 14px;
    padding: 16px 20px;
    margin-bottom: 24px;
  ">
    <div style="font-size:11px; letter-spacing:2px; text-transform:uppercase; color:#8b95a3; margin-bottom:8px;">Next Session</div>
    <div id="session-date-el"  style="display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid #262d38; font-size:16px;"><span>📅</span><span></span></div>
    <div id="session-time-el"  style="display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid #262d38; font-size:16px;"><span>🕙</span><span></span></div>
    <div id="session-loc-el"   style="display:flex; align-items:center; gap:8px; padding:6px 0; font-size:16px;"><span>📍</span><span></span></div>
  </div>
```

- [ ] **Step 2: Add session fetch script to `checkin.html`**

Inside the `<script>` block at the bottom of `checkin.html`, add a `loadSession` function and call it immediately. Place this at the top of the script, before `loadRoster()`:

```js
    async function loadSessionBanner() {
      try {
        const { data, error } = await sb
          .from('sessions')
          .select('date, time, location')
          .eq('id', 1)
          .maybeSingle();
        if (error || !data) return;
        const banner = document.getElementById('session-banner');
        if (!banner) return;
        // Format date as "Monday, May 3, 2026"
        const [y, m, d] = data.date.split('-').map(Number);
        const dateStr = new Date(y, m - 1, d).toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
        });
        document.querySelector('#session-date-el span:last-child').textContent = dateStr;
        document.querySelector('#session-time-el span:last-child').textContent = data.time || '';
        document.querySelector('#session-loc-el  span:last-child').textContent = data.location || '';
        banner.hidden = false;
      } catch (err) {
        // Session banner is non-critical — fail silently
        console.warn('session banner error', err);
      }
    }
```

- [ ] **Step 3: Call `loadSessionBanner()` alongside `loadRoster()`**

Find the existing `loadRoster()` call at the bottom of the script and add `loadSessionBanner()` next to it:

```js
    loadRoster();
    loadSessionBanner();
```

- [ ] **Step 4: Bump version and commit**
```js
const APP_VERSION = '2026.04.25.22';
```
```bash
git add public/checkin.html public/app.js
git commit -m "feat: session banner on checkin.html"
```

---

### Task 7: Push and verify end-to-end

- [ ] **Step 1: Push to remote**
```bash
git push
```

- [ ] **Step 2: Verify admin flow**
  - Log in as admin → tap Session tab
  - Fill in date, time, location → tap Save Session
  - Confirm "✓ Session saved" toast appears
  - Confirm preview card below the form shows formatted date, time, location
  - Tap "Share QR / Link" → confirm QR modal opens

- [ ] **Step 3: Verify non-admin flow (Session tab)**
  - Log out (or open a private window)
  - Tap Session tab
  - Confirm the session card shows the date, time, and location just saved
  - If no session saved, confirm "No Session Scheduled" empty state shows

- [ ] **Step 4: Verify checkin.html**
  - Open `https://athletic-specimen-app.vercel.app/checkin.html`
  - Confirm the session banner appears at the top with the saved date, time, location
  - Confirm the check-in flow still works normally below it
