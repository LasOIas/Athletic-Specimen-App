/*
 * Athletic Specimen web application
 *
 * This file implements a vanilla JavaScript single page application for
 * managing players, check‑ins and tournament brackets for recurring
 * volleyball nights. All state is persisted to localStorage and, when
 * configured, synced to a Supabase backend. The UI is built
 * dynamically by manipulating the DOM rather than relying on a
 * front‑end framework. This avoids the need for any runtime
 * compilation or external dependencies, allowing the app to be served
 * directly from a static `index.html` file.
 */

// -----------------------------------------------------------------------------
// Configuration
//
// To enable cloud sync via Supabase, supply your project URL and anon key
// below. If left blank the app will continue to function fully offline
// using browser storage. See https://supabase.io for more information.
const SUPABASE_URL = 'https://mlzblkzflgylnjorgjcp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1semJsa3pmbGd5bG5qb3JnamNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5MDY1NzEsImV4cCI6MjA2OTQ4MjU3MX0.tqK5lCOKWy1wEaDwNGF6fTo08QxRdhp50LREHMpIVXs';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const supabaseClient = supabase; // it's already created at the top
const LS_TAB_KEY = 'athletic_specimen_tab';
const LS_SUBTAB_KEY = 'athletic_specimen_skill_subtab';

// Create Supabase client if credentials are provided. The global `supabase`
// object is exported by vendor/supabase.js. When both values are falsy
// (empty strings), supabaseClient will be null and no network calls will be
// made. We wrap creation in a try/catch to avoid errors if supabase.js
// fails to load.

// Utility to normalise player names for case insensitive comparison
function normalize(str) {
  return String(str || '').trim().toLowerCase();
}
// Removed extra closing brace

// Balanced group generation algorithm. Given a list of all players, the set
// of names that are currently checked in and a desired number of groups,
// assign players to groups so that total skill in each group is as even as
// possible. The algorithm sorts players by skill descending then greedily
// assigns each player to the group with the lowest total skill so far.
function generateBalancedGroups(players, checkedInNames, groupCount) {
  const eligible = players.filter((p) => checkedInNames.some((n) => normalize(n) === normalize(p.name)));
  if (eligible.length === 0 || groupCount <= 1) return [];

  const attempts = 50; // number of random shuffles to try
  const groupings = [];

  for (let a = 0; a < attempts; a++) {
    const shuffled = eligible.slice().sort(() => Math.random() - 0.5);
    const teams = Array.from({ length: groupCount }, () => []);
    const teamSkills = new Array(groupCount).fill(0);

    for (const player of shuffled) {
      let target = 0;
      for (let i = 1; i < groupCount; i++) {
        if (teamSkills[i] < teamSkills[target]) target = i;
      }
      teams[target].push(player);
      teamSkills[target] += player.skill;
    }

    const avg = teamSkills.reduce((a, b) => a + b, 0) / groupCount;
    const variance = teamSkills.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / groupCount;
    const stddev = Math.sqrt(variance);

    groupings.push({ teams, stddev });
  }

  // Sort by standard deviation (lowest = most balanced)
  groupings.sort((a, b) => a.stddev - b.stddev);

  // Randomly pick from top 5 most balanced options
  const topOptions = groupings.slice(0, 5);
  const chosen = topOptions[Math.floor(Math.random() * topOptions.length)];

  return chosen.teams;
}

function renderFilteredPlayers() {
  let filtered = state.players;

  if (state.playerTab === 'in') {
    filtered = filtered.filter(p => state.checkedIn.includes(p.name));
  } else if (state.playerTab === 'out') {
    filtered = filtered.filter(p => !state.checkedIn.includes(p.name));
  } else if (state.playerTab === 'skill' && state.skillSubTab) {
    const min = parseFloat(state.skillSubTab);
    const max = min === 9.0 ? 10 : min + 0.9;
    filtered = filtered
      .filter(p => p.skill >= min && p.skill <= max)
      .sort((a, b) => b.skill - a.skill);
  } else if (state.playerTab === 'unrated') {
    filtered = filtered.filter(p => !p.skill || p.skill === 0);
  }
  
  filtered.sort((a, b) => b.skill - a.skill);
  
  if (filtered.length === 0) {
    return '<p>No players found.</p>';
  }

  return filtered.map((player) => {
    const idx = state.players.findIndex(p => normalize(p.name) === normalize(player.name));
    const checked = state.checkedIn.includes(player.name);
    return `
          <div class="player-card" data-index="${idx}">
        <div>
          <strong>${player.name}</strong>
          <span class="skill">Skill: ${player.skill}</span>
  Skill: ${player.skill === 0 ? 'Unset' : player.skill}
</span>
          <span class="status ${checked ? 'in' : 'out'}">${checked ? 'Checked In' : 'Not Checked In'}</span>
        </div>
        <div class="row">
          <button class="btn-checkin" data-name="${player.name}">Check In</button>
          <button class="btn-checkout" data-name="${player.name}">Check Out</button>
          ${state.isAdmin ? `
            <button class="btn-edit" data-index="${idx}">Edit</button>
            <button class="btn-delete danger" data-name="${player.name}">Delete</button>
          ` : ''}
        </div>
        ${state.isAdmin ? `
          <div class="edit-row" style="display:none" data-index="${idx}">
            <input type="text" class="edit-name" value="${player.name}" />
            <input type="number" class="edit-skill" value="${player.skill}" step="0.1" />
            <button class="btn-save-edit" data-index="${idx}">Save</button>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

// Bracket helper: create a default 8‑team single elimination bracket. Each
// match object tracks its two competitors and the winner. Rounds are
// arranged such that indices 0–3 represent round 1, 4–5 represent round 2
// (semi finals) and index 6 represents the final. When a winner is set in
// round n, the winner automatically populates the appropriate slot in the
// next round.
function createEmptyBracket() {
  return [
    { team1: '', team2: '', winner: null },
    { team1: '', team2: '', winner: null },
    { team1: '', team2: '', winner: null },
    { team1: '', team2: '', winner: null },
    { team1: '', team2: '', winner: null },
    { team1: '', team2: '', winner: null },
    { team1: '', team2: '', winner: null },
  ];
}

// Global state. We use a simple object to hold application state. When
// properties change the UI is rebuilt. Keeping all state in one place
// simplifies debugging and persistence.
const state = {
  players: [],        // list of players { name, skill, id? }
  checkedIn: [],      // list of player names currently checked in
  isAdmin: false,     // whether admin panel is unlocked
  bracket: createEmptyBracket(),
  generatedTeams: [], // result of the last team generation
  groupCount: 2,      // number of teams requested when generating groups
playerTab: 'all',       // current active tab: 'all', 'in', 'out', 'skill'
skillSubTab: null,       // current skill range selected, like '1.0', '2.0', etc.
loaded: false, // becomes true after Supabase loads
};

// Message state used for transient user feedback; messages auto clear
const messages = {
  registration: '',
  checkIn: '',
};

// -----------------------------------------------------------------------------
// Persistence helpers
//
// Local storage keys. We use separate keys to avoid collisions.
const LS_PLAYERS_KEY = 'athletic_specimen_players';
const LS_CHECKIN_KEY = 'athletic_specimen_checked_in';
const LS_ADMIN_KEY = 'athletic_specimen_is_admin';

// Load players and checked in names from localStorage into state. Called
// during initialization.
function loadLocal() {
  try {
    const storedPlayers = JSON.parse(localStorage.getItem(LS_PLAYERS_KEY) || '[]');
    if (Array.isArray(storedPlayers)) state.players = storedPlayers;
    const storedChecked = JSON.parse(localStorage.getItem(LS_CHECKIN_KEY) || '[]');
    if (Array.isArray(storedChecked)) state.checkedIn = storedChecked;
    const adminFlag = sessionStorage.getItem(LS_ADMIN_KEY);
    state.isAdmin = adminFlag === 'true';
  } catch (err) {
    console.error('Error loading from localStorage', err);
  }
  const storedTab = sessionStorage.getItem(LS_TAB_KEY);
if (storedTab) state.playerTab = storedTab;

const storedSubtab = sessionStorage.getItem(LS_SUBTAB_KEY);
if (storedSubtab) state.skillSubTab = storedSubtab;
}

// Save current state players and checked in names to localStorage. Called
// whenever state.players or state.checkedIn changes.
function saveLocal() {
  try {
    localStorage.setItem(LS_PLAYERS_KEY, JSON.stringify(state.players));
    localStorage.setItem(LS_CHECKIN_KEY, JSON.stringify(state.checkedIn));
  } catch (err) {
    console.error('Error saving to localStorage', err);
  }
}

// Sync local state with Supabase. Pulls players list and checked_in flags
// from the Supabase table `players`. If Supabase is not configured this
// function is a no‑op. When remote data is retrieved it merges into
// state.players and updates state.checkedIn with any players marked
// checked_in.
async function syncFromSupabase() {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient.from('players').select('*');
    if (error) {
      console.error('Supabase fetch error', error);
      return;
    }
    if (!Array.isArray(data)) return;

    // Replace state.players cleanly
    state.players = data.map((p) => ({
      name: p.name,
      skill: Number(p.skill) || 0,
      id: p.id,
      checked_in: !!p.checked_in
    }));

    // Only set checkedIn once — no need to merge or deduplicate
    state.checkedIn = data.filter((p) => p.checked_in).map((p) => p.name);
    state.loaded = true;

  } catch (err) {
    console.error('Error syncing from Supabase', err);
  }
}

// -----------------------------------------------------------------------------
// UI Helpers
//
// Render the entire application into the root element. Each call replaces
// existing content to reflect the current state. Event handlers are
// attached inline within this function. To minimize reflows, we build
// strings for larger sections and assign innerHTML.
function render() {
  const root = document.getElementById('root');
  if (!root) return;

  // Helper to escape text for safe insertion into HTML
  const escapeHTML = (str) => str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Build registration and check‑in messages
  const regMsg = messages.registration ? `<p class="msg">${escapeHTML(messages.registration)}</p>` : '';
  const checkMsg = messages.checkIn ? `<p class="msg">${escapeHTML(messages.checkIn)}</p>` : '';

  // Build player list HTML. Include delete buttons for admin users only.
  let playersHTML = '';
  if (state.players.length === 0) {
    playersHTML = '<p>No players yet.</p>';
  } else {
    playersHTML = state.players.map((player, idx) => {
      const checked = state.checkedIn.some((n) => normalize(n) === normalize(player.name));
      return `
        <div class="player-card" data-index="${idx}">
          <div>
            <strong>${escapeHTML(player.name)}</strong>
            <span class="skill">Skill: ${escapeHTML(String(player.skill))}</span>
            <span class="status ${checked ? 'in' : 'out'}">${checked ? 'Checked In' : 'Not Checked In'}</span>
          </div>
         <div class="row">
  <button class="btn-checkin" data-name="${escapeHTML(player.name)}">Check In</button>
  <button class="btn-checkout" data-name="${escapeHTML(player.name)}">Check Out</button>
  ${state.isAdmin ? `
    <button class="btn-edit" data-index="${idx}">Edit</button>
    <button class="btn-delete danger" data-name="${escapeHTML(player.name)}">Delete</button>
  ` : ''}
</div>
${state.isAdmin ? `
  <div class="edit-row" style="display:none" data-index="${idx}">
    <input type="text" class="edit-name" value="${escapeHTML(player.name)}" />
    <input type="number" class="edit-skill" value="${escapeHTML(String(player.skill))}" step="0.1" />
    <button class="btn-save-edit" data-index="${idx}">Save</button>
  </div>
` : ''}
        </div>
      `;
    }).join('');
  }

  // Build generated teams HTML
  let teamsHTML = '';
  if (state.generatedTeams.length > 0) {
    teamsHTML = '<div class="teams">' + state.generatedTeams.map((team, i) => {
      const members = team.map((p) => `<li>${escapeHTML(p.name)} (${escapeHTML(String(p.skill))})</li>`).join('');
      const totalSkill = team.reduce((sum, p) => sum + p.skill, 0).toFixed(1);
      return `
  <div class="team">
    <h4>Team ${i + 1} <span class="small" style="font-weight:normal;">(Total: ${totalSkill})</span></h4>
    <ul>${members}</ul>
  </div>
`;
    }).join('') + '</div>';
  }

  // Build bracket HTML. Input fields for round 1 and buttons for advancing winners.
  const bracketMatches = state.bracket;
  function matchHTML(match, idx) {
    const inputHTML = idx < 4 ? `
      <input type="text" data-match="${idx}" data-field="team1" placeholder="Team 1" value="${escapeHTML(match.team1)}" />
      <input type="text" data-match="${idx}" data-field="team2" placeholder="Team 2" value="${escapeHTML(match.team2)}" />
    ` : '';
    // Buttons to pick winners
    let buttonsHTML = '';
    const t1 = match.team1;
    const t2 = match.team2;
    if (t1) {
      buttonsHTML += `<button class="btn-advance" data-match="${idx}" data-team="${escapeHTML(t1)}" ${match.winner === t1 ? 'style="background-color:#16a34a;color:#ffffff"' : ''}>${escapeHTML(t1)}</button>`;
    }
    if (t2) {
      buttonsHTML += `<button class="btn-advance" data-match="${idx}" data-team="${escapeHTML(t2)}" ${match.winner === t2 ? 'style="background-color:#16a34a;color:#ffffff"' : ''}>${escapeHTML(t2)}</button>`;
    }
    // Always show current winner if no buttons (semi/final)
    let winnerDisplay = '';
    if (!t1 && !t2 && match.winner) {
      winnerDisplay = `<span class="winner-display">${escapeHTML(match.winner)}</span>`;
    }
    return `
      <div class="match" data-match="${idx}">
        ${inputHTML}
        <div class="row">${buttonsHTML}${winnerDisplay}</div>
      </div>
    `;
  }
  const round1 = bracketMatches.slice(0, 4).map((m, idx) => matchHTML(m, idx)).join('');
  const round2 = bracketMatches.slice(4, 6).map((m, idx) => matchHTML(m, 4 + idx)).join('');
  const finalMatch = matchHTML(bracketMatches[6], 6);
  const bracketHTML = `
    <div class="bracket">
      <div class="round round1">${round1}</div>
      <div class="round round2">${round2}</div>
      <div class="round final">${finalMatch}</div>
    </div>
  `;

  // Admin panel HTML, only visible when state.isAdmin is true.
  // Layout: logout at top, admin controls, then player list at the bottom.
  const adminHTML = state.isAdmin ? `
    <div>
      <div class="card admin-header">
        <h2>Admin Dashboard</h2>
        <button id="btn-logout">Logout</button>
      </div>
      <div class="card">
        <h3>Add/Update Player</h3>
        <div class="row">
          <input type="text" id="admin-player-name" placeholder="Name" />
          <input type="number" id="admin-player-skill" placeholder="Skill" step="0.1" />
          <button id="btn-save-player">Save</button>
        </div>
      </div>
      <div class="card">
        <h3>Generate Teams</h3>
        <div class="row">
          <label>
            Teams:
            <input type="number" id="group-count" min="2" value="${escapeHTML(String(state.groupCount))}" />
          </label>
          <button id="btn-generate-teams">Generate</button>
          <button id="btn-reset-checkins" class="danger">Reset Check‑ins</button>
        </div>
        ${teamsHTML}
      </div>
      <div class="card">
        <h3>Tournament Bracket</h3>
        <p class="small">Enter up to 8 teams below. Click team names to advance them.</p>
        ${bracketHTML}
      </div>
     <div class="card">
  <h3>Players</h3>

<div>
  <h4 style="margin-bottom: 0.5rem;">Filters</h4>

  <div class="row">
    <label for="player-tab-select">Filter:</label>
    <select id="player-tab-select">
      <option value="all" ${state.playerTab === 'all' ? 'selected' : ''}>All Players</option>
      <option value="in" ${state.playerTab === 'in' ? 'selected' : ''}>Checked In</option>
      <option value="out" ${state.playerTab === 'out' ? 'selected' : ''}>Checked Out</option>
      <option value="skill" ${state.playerTab === 'skill' ? 'selected' : ''}>Skill Number</option>
      <option value="unrated" ${state.playerTab === 'unrated' ? 'selected' : ''}>Unset Skill</option>
    </select>
  </div>
</div>

  <!-- Skill Sub-Dropdown -->
${state.playerTab === 'skill' ? `
  <div class="row">
    <label for="skill-subtab-select">Skill Range:</label>
    <select id="skill-subtab-select">
      <option value="">Select range</option>
      ${Array.from({ length: 9 }, (_, i) => {
        const base = `${i + 1}.0`;
        const selected = state.skillSubTab === base ? 'selected' : '';
        const label = base === '9.0' ? '9.0–10' : `${base}–${i + 1}.9`;
return `<option value="${base}" ${selected}>${label}</option>`;
      }).join('')}
    </select>
  </div>
` : ''}

  <!-- Filtered Player Cards -->
  <div class="players">
    ${renderFilteredPlayers()}
  </div>
</div>
    </div>
  ` : '';

  // Build the final page markup
  const adminLoginHTML = !state.isAdmin ? `
    <div class="card">
      <h2>Admin Login</h2>
      <div class="row">
        <input type="password" id="admin-code" placeholder="Enter admin code" />
        <button id="btn-admin-login">Login</button>
      </div>
    </div>
  ` : '';

  // Build final page markup. Hide full players list on public side. The list is only shown in admin panel.
  const html = `
    <div class="container">
      <h1 class="title">Athletic Specimen</h1>
<p class="small" style="text-align:center;">Checked In: <strong>${state.checkedIn.length}</strong></p>
      ${adminLoginHTML}
      <div class="grid-2">
        <div class="card">
          <h2>Check In</h2>
          <input type="text" id="check-name" placeholder="Enter your name" />
          <button id="btn-check-in">Check In</button>
          ${checkMsg}
        </div>
        <div class="card">
          <h2>Register Player</h2>
          <input type="text" id="register-name" placeholder="Name" />
          <button id="btn-register">Register</button>
          ${regMsg}
        </div>
      </div>
      ${adminHTML}
    </div>
  `;
  root.innerHTML = html;

  // After DOM has been updated, attach event listeners to interactive
  // elements. Because content is rebuilt on every render call, we must
  // reattach handlers each time. Listeners reference functions defined
  // below.
  attachHandlers();
}

// Attach event listeners to the current DOM. This function should be
// called after each call to render().
function attachHandlers() {
  // Admin login
  const loginBtn = document.getElementById('btn-admin-login');
  if (loginBtn) {
    loginBtn.addEventListener('click', () => {
      const codeInput = document.getElementById('admin-code');
      if (codeInput && codeInput.value.trim() === 'nlvb2025') {
        state.isAdmin = true;
        sessionStorage.setItem(LS_ADMIN_KEY, 'true');
        render();
      } else {
        alert('Incorrect admin code');
      }
    });
  }

  // Admin logout
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      state.isAdmin = false;
      sessionStorage.removeItem(LS_ADMIN_KEY);
      render();
    });
  }

  // Save player (admin add/update)
  const savePlayerBtn = document.getElementById('btn-save-player');
  if (savePlayerBtn) {
    savePlayerBtn.addEventListener('click', async () => {
      const nameInput = document.getElementById('admin-player-name');
      const skillInput = document.getElementById('admin-player-skill');
      const name = (nameInput && nameInput.value || '').trim();
      const skill = parseFloat(skillInput && skillInput.value || '');
      if (!name || isNaN(skill) || skill <= 0) return;
      const idx = state.players.findIndex((p) => normalize(p.name) === normalize(name));
      if (idx !== -1) {
        // update skill
        const updated = state.players.slice();
        updated[idx] = { ...updated[idx], name, skill };
        state.players = updated;
        // update remote
        if (supabaseClient && updated[idx].id) {
          try {
                await supabaseClient.from('players').update({ skill }).eq('id', updated[idx].id);
                await syncFromSupabase(); // <–– stays inside the try block
          } catch (err) {
                console.error('Supabase update error', err);
          }
        }            
      } else {
        // insert new
        const newPlayer = { name, skill };
        let inserted = { ...newPlayer };
        if (supabaseClient) {
          try {
            const { data, error } = await supabaseClient.from('players').insert([newPlayer]).select();
            await syncFromSupabase();
            if (!error && Array.isArray(data) && data.length > 0) inserted = { ...newPlayer, id: data[0].id };
          } catch (err) {
            console.error('Supabase insert error', err);
          }
        }
      }
      nameInput.value = '';
      skillInput.value = '';
      saveLocal();
      render();
    });
  }

  // Register player (user side, skill=0)
  const registerBtn = document.getElementById('btn-register');
  if (registerBtn) {
    registerBtn.addEventListener('click', async () => {
      const input = document.getElementById('register-name');
      const name = (input && input.value || '').trim();
      if (!name) return;
      const exists = state.players.some((p) => normalize(p.name) === normalize(name));
      if (exists) {
        messages.registration = 'Player already registered.';
      } else {
        const newPlayer = { name, skill: 0 };
        let inserted = { ...newPlayer };
        if (supabaseClient) {
          try {
            const { data, error } = await supabaseClient.from('players').insert([newPlayer]).select();
            await syncFromSupabase();
            if (!error && Array.isArray(data) && data.length > 0) inserted = { ...newPlayer, id: data[0].id };
          } catch (err) {
            console.error('Supabase insert error', err);
          }
        }
        messages.registration = 'Player registered. Waiting for admin to assign skill.';
      }
      // clear message after 3 seconds
      setTimeout(() => {
        messages.registration = '';
        render();
      }, 3000);
      input.value = '';
      saveLocal();
      render();
    });
  }

  // Check in button (big button on form)
  const checkInBtn = document.getElementById('btn-check-in');
  if (checkInBtn) {
    checkInBtn.addEventListener('click', async () => {
      const input = document.getElementById('check-name');
      const name = (input && input.value || '').trim();
      if (!name) return;
      // find matching player
      const player = state.players.find((p) => normalize(p.name) === normalize(name));
      if (player) {
        if (!state.checkedIn.some((n) => normalize(n) === normalize(player.name))) {
          state.checkedIn = [...state.checkedIn, player.name];
          if (supabaseClient && player.id) {
            try {
              await supabaseClient.from('players').update({ checked_in: true }).eq('id', player.id);
              await syncFromSupabase();
            } catch (err) {
              console.error('Supabase update error', err);
            }
          }
        }
        messages.checkIn = 'You are checked in';
      } else {
        messages.checkIn = 'Player not found in history';
      }
      setTimeout(() => {
        messages.checkIn = '';
        render();
      }, 3000);
      input.value = '';
      saveLocal();
      render();
    });
  }

  // Player card checkin/out buttons (delegated by class)
  document.querySelectorAll('.btn-checkin').forEach((btn) => {
    btn.addEventListener('click', async (ev) => {
      const name = ev.currentTarget.getAttribute('data-name');
      if (!name) return;
      // call check in logic
      if (!state.checkedIn.some((n) => normalize(n) === normalize(name))) {
        state.checkedIn = [...state.checkedIn, name];
        const player = state.players.find((p) => normalize(p.name) === normalize(name));
        if (player && supabaseClient && player.id) {
          try {
            await supabaseClient.from('players').update({ checked_in: true }).eq('id', player.id);
            await syncFromSupabase();
          } catch (err) {
            console.error('Supabase update error', err);
          }
        }
      }
      saveLocal();
      render();
    });
  });
  document.querySelectorAll('.btn-checkout').forEach((btn) => {
    btn.addEventListener('click', async (ev) => {
      const name = ev.currentTarget.getAttribute('data-name');
      if (!name) return;
      state.checkedIn = state.checkedIn.filter((n) => normalize(n) !== normalize(name));
      const player = state.players.find((p) => normalize(p.name) === normalize(name));
      if (player && supabaseClient && player.id) {
        try {
          await supabaseClient.from('players').update({ checked_in: false }).eq('id', player.id);
          await syncFromSupabase();
        } catch (err) {
          console.error('Supabase update error', err);
        }
      }
      saveLocal();
      render();
    });
  });

  // Delete player buttons (admin only)
  document.querySelectorAll('.btn-delete').forEach((btn) => {
    btn.addEventListener('click', async (ev) => {
      const name = ev.currentTarget.getAttribute('data-name');
      if (!name) return;
      // Remove player from state.players
      const idx = state.players.findIndex((p) => normalize(p.name) === normalize(name));
      if (idx !== -1) {
        const removed = state.players[idx];
        // Delete from Supabase if configured and id exists
        if (supabaseClient && removed.id) {
          try {
            await supabaseClient.from('players').delete().eq('id', removed.id);
            await syncFromSupabase();
          } catch (err) {
            console.error('Supabase delete error', err);          }
        }
        // Remove from players and checkedIn
        state.players = state.players.filter((p) => normalize(p.name) !== normalize(name));
        state.checkedIn = state.checkedIn.filter((n) => normalize(n) !== normalize(name));
        saveLocal();
        render();
      }
    });
  });

  // Reset all checkins
  const resetBtn = document.getElementById('btn-reset-checkins');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      state.checkedIn = [];
      if (supabaseClient) {
        try {
          await supabaseClient.from('players').update({ checked_in: false }).eq('checked_in', true);
          await syncFromSupabase();
        } catch (err) {
          console.error('Supabase reset error', err);
        }
      }
      saveLocal();
      render();
    });
  }

  // Group count input and generate teams
  const groupCountInput = document.getElementById('group-count');
  if (groupCountInput) {
    groupCountInput.addEventListener('change', () => {
      const val = parseInt(groupCountInput.value);
      state.groupCount = isNaN(val) ? 2 : Math.max(2, val);
    });
  }
  const generateBtn = document.getElementById('btn-generate-teams');
  if (generateBtn) {
    generateBtn.addEventListener('click', () => {
      state.generatedTeams = generateBalancedGroups(state.players, state.checkedIn, state.groupCount);
      render();
    });
  }

  // Bracket input changes (only for round 1)
  document.querySelectorAll('.match input').forEach((input) => {
    input.addEventListener('input', (ev) => {
      const matchIndex = parseInt(ev.target.getAttribute('data-match'));
      const field = ev.target.getAttribute('data-field');
      const value = ev.target.value;
      if (isNaN(matchIndex) || !field) return;
      const updated = state.bracket.slice();
      updated[matchIndex] = { ...updated[matchIndex], [field]: value, winner: updated[matchIndex].winner === value ? value : null };
      // if editing round 1, clear downstream matches
      if (matchIndex < 4) {
        const dest = 4 + Math.floor(matchIndex / 2);
        const destField = matchIndex % 2 === 0 ? 'team1' : 'team2';
        updated[dest] = { ...updated[dest], [destField]: '', winner: null };
        updated[6] = { ...updated[6], team1: '', team2: '', winner: null };
      }
      // Preserve scroll position during re‑render
      const scrollY = window.scrollY;
      state.bracket = updated;
      render();
      // Restore scroll position asynchronously to allow DOM to settle
      setTimeout(() => window.scrollTo(0, scrollY), 0);
    });
  });
  // Advance winner buttons
  document.querySelectorAll('.btn-advance').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      const matchIndex = parseInt(ev.currentTarget.getAttribute('data-match'));
      const team = ev.currentTarget.getAttribute('data-team');
      if (isNaN(matchIndex) || !team) return;
      const updated = state.bracket.slice();
      updated[matchIndex] = { ...updated[matchIndex], winner: team };
      // Propagate winner
      if (matchIndex < 4) {
        const dest = 4 + Math.floor(matchIndex / 2);
        const destField = matchIndex % 2 === 0 ? 'team1' : 'team2';
        updated[dest] = { ...updated[dest], [destField]: team, winner: updated[dest].winner === team ? team : null };
        updated[6] = { ...updated[6], team1: '', team2: '', winner: null };
      } else if (matchIndex < 6) {
        const destField = matchIndex === 4 ? 'team1' : 'team2';
        updated[6] = { ...updated[6], [destField]: team, winner: updated[6].winner === team ? team : null };
      }
      const scrollY = window.scrollY;
      state.bracket = updated;
      render();
      setTimeout(() => window.scrollTo(0, scrollY), 0);
    });
  });
  const tabSelect = document.getElementById('player-tab-select');
if (tabSelect) {
  tabSelect.addEventListener('change', (ev) => {
    state.playerTab = ev.target.value;
sessionStorage.setItem(LS_TAB_KEY, state.playerTab);
    state.skillSubTab = null;
    render();
  });
}
}
const subtabSelect = document.getElementById('skill-subtab-select');
if (subtabSelect) {
  subtabSelect.addEventListener('change', (ev) => {
    state.skillSubTab = ev.target.value;
sessionStorage.setItem(LS_SUBTAB_KEY, state.skillSubTab);
    render();
  });
}
// Toggle edit row (admin only)
document.querySelectorAll('.btn-edit').forEach((btn) => {
  btn.addEventListener('click', (ev) => {
    const idx = ev.currentTarget.getAttribute('data-index');
    const row = document.querySelector(`.edit-row[data-index="${idx}"]`);
    if (row) row.style.display = row.style.display === 'none' ? 'flex' : 'none';
  });
});

// Save edited player
document.querySelectorAll('.btn-save-edit').forEach((btn) => {
  btn.addEventListener('click', async (ev) => {
    const idx = parseInt(ev.currentTarget.getAttribute('data-index'));
    const nameInput = document.querySelector(`.edit-row[data-index="${idx}"] .edit-name`);
    const skillInput = document.querySelector(`.edit-row[data-index="${idx}"] .edit-skill`);
    const name = nameInput.value.trim();
    const skill = parseFloat(skillInput.value);

    if (!name || isNaN(skill) || skill <= 0) return;

    const updated = [...state.players];
    const player = updated[idx];
    updated[idx] = { ...player, name, skill };
    state.players = updated;

    if (supabaseClient && player.id) {
      try {
        await supabaseClient.from('players').update({ name, skill }).eq('id', player.id);
        await syncFromSupabase();
      } catch (err) {
        console.error('Supabase edit error', err);
      }
    }

    saveLocal();
    render();
  });
});


// Initialise the app. Called once on page load. It loads stored data,
// optionally syncs with Supabase, registers the service worker and
// renders the UI for the first time.
function init() {
  // Load from localStorage
  loadLocal();
  // Sync from supabase if available
  syncFromSupabase().then(() => {
    // Register service worker for PWA offline support
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch((err) => {
        console.warn('Service worker registration failed', err);
      });
    }
    // Render UI
    render();
  });
}

// Start the app once the DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}