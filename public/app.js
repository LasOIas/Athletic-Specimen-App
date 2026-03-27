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
// To enable cloud sync via Supabase, supply your project URL and anon key
// below. If left blank the app will continue to function fully offline
// using browser storage. See https://supabase.io for more information.
const SUPABASE_URL = 'https://mlzblkzflgylnjorgjcp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1semJsa3pmbGd5bG5qb3JnamNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5MDY1NzEsImV4cCI6MjA2OTQ4MjU3MX0.tqK5lCOKWy1wEaDwNGF6fTo08QxRdhp50LREHMpIVXs';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const APP_VERSION = '2026.03.27.4';
const LS_TAB_KEY = 'athletic_specimen_tab';
const LS_SUBTAB_KEY = 'athletic_specimen_skill_subtab';
const LS_GROUPS_KEY = 'athletic_specimen_groups';
const LS_ACTIVE_GROUP_KEY = 'athletic_specimen_active_group';
const UNGROUPED_FILTER_VALUE = '__ungrouped__';
const UNGROUPED_FILTER_LABEL = 'Ungrouped (No Groups)';
const GROUP_CATALOG_NAME_PREFIX = '__as_group__:';
const GROUPS_TAG_PREFIX = '__as_groups__:';

const selectedSet = () => new Set(state.selectedIds || []);

// Master admin (full access across all groups)
const MASTER_ADMIN_CODE = 'nlvb2025';

// Default tenant admin codes (locked to single groups)
const DEFAULT_ADMIN_CODE_MAP = {
  'kcvb2025': 'KC Volleyball',
  'asvb2025': 'Athletic Specimen' // optional mirror, so CO still maps if used as tenant
};

// Session key for tenant scope
const LS_LIMITED_GROUP_KEY = 'athletic_specimen_limited_group';

// --- Admin code storage (TENANT CODES) ---
const LS_CODEMAP_KEY = 'athletic_specimen_admin_codes';
let ADMIN_CODE_MAP = {}; // populated by loadAdminCodes()

function computeCheckedInByGroup() {
  const byGroup = new Map();
  const isIn = new Set(state.checkedIn || []);

  for (const p of state.players || []) {
    const primary = getPlayerPrimaryGroup(p);
    const groupKey = primary || UNGROUPED_FILTER_VALUE;
    const groupLabel = primary || UNGROUPED_FILTER_LABEL;

    if (!byGroup.has(groupKey)) {
      byGroup.set(groupKey, {
        groupKey,
        groupLabel,
        isUngrouped: !primary,
        total: 0,
        in: 0
      });
    }

    const row = byGroup.get(groupKey);
    row.total += 1;
    if (isIn.has(playerIdentityKey(p))) row.in += 1;
  }

  // return sorted entries by name
  return Array.from(byGroup.values())
    .sort((a, b) => a.groupLabel.localeCompare(b.groupLabel));
}

function normalizeActiveGroupSelection(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'All';
  if (raw === 'All' || raw === UNGROUPED_FILTER_VALUE) return raw;
  if (raw === UNGROUPED_FILTER_LABEL) return UNGROUPED_FILTER_VALUE;
  if (raw === 'Ungrouped') {
    const hasNamedUngroupedGroup = getAvailableGroups().includes('Ungrouped');
    if (!hasNamedUngroupedGroup) return UNGROUPED_FILTER_VALUE;
  }
  return raw;
}

function loadAdminCodes() {
  try {
    const raw = localStorage.getItem(LS_CODEMAP_KEY);
    if (raw) {
      ADMIN_CODE_MAP = JSON.parse(raw) || {};
    } else {
      // first run seed
      ADMIN_CODE_MAP = { ...DEFAULT_ADMIN_CODE_MAP };
      localStorage.setItem(LS_CODEMAP_KEY, JSON.stringify(ADMIN_CODE_MAP));
    }
  } catch {
    ADMIN_CODE_MAP = { ...DEFAULT_ADMIN_CODE_MAP };
  }
  state.adminCodeMap = { ...ADMIN_CODE_MAP };
}

function saveAdminCodes() {
  try {
    localStorage.setItem(LS_CODEMAP_KEY, JSON.stringify(ADMIN_CODE_MAP));
  } catch {}
  state.adminCodeMap = { ...ADMIN_CODE_MAP };
}

function closeInlineEditRow(row) {
  if (!row) return;
  row.classList.remove('show');
  const card = row.closest('.player-card');
  if (card) card.classList.remove('is-editing');
  row.querySelectorAll('.group-select.open').forEach((el) => el.classList.remove('open'));
}

function closeAllInlineEditRows(exceptRow = null) {
  document.querySelectorAll('.edit-row.show').forEach((row) => {
    if (exceptRow && row === exceptRow) return;
    closeInlineEditRow(row);
  });
}

function openInlineEditRow(row) {
  if (!row) return;
  closeAllInlineEditRows(row);
  row.classList.add('show');
  const card = row.closest('.player-card');
  if (card) card.classList.add('is-editing');
  const nameInput = row.querySelector('.edit-name');
  if (nameInput) {
    nameInput.focus();
    if (typeof nameInput.select === 'function') nameInput.select();
  }
}

// -- Robust global click handler for player card menus (capture phase) --
(function ensureMenuActionsBound() {
  if (window.__menusBound) return;
  window.__menusBound = true;

  document.addEventListener('click', async function onGlobalClick(e) {
    const collapseToggle = e.target.closest('[data-role="toggle-card-collapse"]');
    if (collapseToggle) {
      e.stopPropagation();
      e.preventDefault();
      const cardId = String(collapseToggle.getAttribute('data-card-id') || '').trim();
      if (!cardId) return;
      const nextCollapsed = { ...(state.collapsedCards || {}) };
      if (nextCollapsed[cardId]) delete nextCollapsed[cardId];
      else nextCollapsed[cardId] = true;
      state.collapsedCards = nextCollapsed;
      saveLocal();
      render();
      return;
    }
    // 1) Toggle the dropdown when ⋮ is clicked
    const dots = e.target.closest('.btn-actions');
    if (dots) {
      e.stopPropagation();
      e.preventDefault();
      const wrap = dots.closest('.menu-wrap');
      const isOpen = wrap && wrap.classList.contains('menu-open');
      // close all others
      document.querySelectorAll('.menu-wrap.menu-open').forEach(w => w.classList.remove('menu-open'));
      if (wrap) {
        wrap.classList.toggle('menu-open', !isOpen);
        dots.setAttribute('aria-expanded', String(!isOpen));
      }
      return;
    }

    // Group select toggle / selection (inside edit-row)
    const groupBtn = e.target.closest('.group-btn');
    if (groupBtn) {
      e.stopPropagation();
      e.preventDefault();
      // close other open group-selects
      document.querySelectorAll('.group-select.open').forEach(el => {
        if (el !== groupBtn.closest('.group-select')) el.classList.remove('open');
      });
      const wrap = groupBtn.closest('.group-select');
      if (wrap) wrap.classList.toggle('open');
      return;
    }

    const setPrimaryBtn = e.target.closest('[data-role="set-primary-group"]');
    if (setPrimaryBtn) {
      e.stopPropagation();
      e.preventDefault();
      const row = setPrimaryBtn.closest('.edit-row');
      if (!row) return;
      const groups = getEditGroupsFromRow(row);
      const index = parseInt(setPrimaryBtn.getAttribute('data-group-index'), 10);
      if (!Number.isInteger(index) || index < 0 || index >= groups.length) return;
      const selected = groups[index];
      const next = [selected, ...groups.filter((_, idx) => idx !== index)];
      updateEditRowGroupUI(row, next);
      return;
    }

    const removeGroupBtn = e.target.closest('[data-role="remove-group"]');
    if (removeGroupBtn) {
      e.stopPropagation();
      e.preventDefault();
      const row = removeGroupBtn.closest('.edit-row');
      if (!row) return;
      const groups = getEditGroupsFromRow(row);
      const index = parseInt(removeGroupBtn.getAttribute('data-group-index'), 10);
      if (!Number.isInteger(index) || index < 0 || index >= groups.length) return;
      const next = groups.filter((_, idx) => idx !== index);
      updateEditRowGroupUI(row, next);
      return;
    }

    const groupItem = e.target.closest('.group-item');
    if (groupItem) {
      e.stopPropagation();
      e.preventDefault();
      const val = normalizeGroupName(groupItem.getAttribute('data-value') || '');
      const select = groupItem.closest('.group-select');
      const row = select ? select.closest('.edit-row') : null;
      if (!select || !row || !val) return;

      const groups = getEditGroupsFromRow(row);
      const next = [val, ...groups.filter((group) => group !== val)];
      updateEditRowGroupUI(row, next);

      // add chosen group to state.groups if it's new
      try {
        if (!(state.groups || []).includes(val)) {
          state.groups = [...(state.groups || []), val];
          saveLocal();
        }
      } catch (err) {}

      select.classList.remove('open');
      return;
    }

    // 2) Keep clicks inside an open dropdown from closing it via bubbling
    if (e.target.closest('.card-menu')) {
      e.stopPropagation();
    }

    // 3) Edit action
    const editBtn = e.target.closest('[data-role="menu-edit"]');
    if (editBtn) {
      e.stopPropagation();
      e.preventDefault();
      const idx = parseInt(editBtn.getAttribute('data-index'), 10);
      const row = document.querySelector(`.edit-row[data-index="${idx}"]`);
      if (row) {
        const wasOpen = row.classList.contains('show');
        closeAllInlineEditRows();
        if (!wasOpen) openInlineEditRow(row);
      }
      // close menu
      const wrap = editBtn.closest('.menu-wrap');
      if (wrap) wrap.classList.remove('menu-open');
      return;
    }

    // 4) Delete action
    const delBtn = e.target.closest('[data-role="menu-delete"]');
    if (delBtn) {
      e.stopPropagation();
      e.preventDefault();
      const id = String(delBtn.getAttribute('data-id') || '');
      if (!id) return;

      const idx = state.players.findIndex(p => String(p.id) === id);
      if (idx === -1) return;

      const removed = state.players[idx];

      try {
        if (supabaseClient && removed.id) {
          await supabaseClient.from('players').delete().eq('id', removed.id);
          await syncFromSupabase();
        }
      } catch (err) {
        console.error('Supabase delete error', err);
      }

      state.players = state.players.filter(p => String(p.id) !== id);
      checkOutPlayer(removed);
      saveLocal();

      // close any open menu and re-render
      document.querySelectorAll('.menu-wrap.menu-open').forEach(w => w.classList.remove('menu-open'));
      queueSaveToSupabase();
      render();
      return;
    }

    // 4) Clicked anywhere else: close any open menus
    document.querySelectorAll('.menu-wrap.menu-open').forEach(w => w.classList.remove('menu-open'));
    document.querySelectorAll('.group-select.open').forEach(el => el.classList.remove('open'));
  }, true); // capture phase so we always see the click
})();

// -- One delegated Save handler for inline edit rows (capture phase) --
(function ensureSaveDelegationBound() {
  if (window.__saveDelegated) return;
  window.__saveDelegated = true;

  document.addEventListener('click', function onSaveDelegated(e) {
    const cancelBtn = e.target.closest('.btn-cancel-edit');
    if (cancelBtn) {
      e.preventDefault();
      e.stopPropagation();
      render();
      return;
    }

    const btn = e.target.closest('.btn-save-edit');
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();

    const idxAttr = parseInt(btn.getAttribute('data-index'), 10);
    const idAttr  = btn.getAttribute('data-id');
    const hasStableId = !!idAttr && idAttr !== 'undefined' && idAttr !== 'null';
    const idxFromData = Number.isNaN(idxAttr) ? -1 : idxAttr;

    // Locate the edit row using the index we render onto it
    const row = document.querySelector(`.edit-row[data-index="${idxFromData}"]`) || btn.closest('.edit-row');
    if (!row) return;

    const nameInput  = row.querySelector('.edit-name');
    const skillInput = row.querySelector('.edit-skill');
    const groupInput = row.querySelector('.edit-group');
    const groupsInput = row.querySelector('.edit-groups');

    const name  = (nameInput?.value || '').trim();
    let   skill = parseFloat(skillInput?.value);
    const parsedGroups = parseEditGroupsValue(groupsInput?.value || '');
    const fallbackGroup = normalizeGroupName(groupInput?.value || '');
    const groups = parsedGroups.length
      ? parsedGroups
      : (fallbackGroup ? [fallbackGroup] : []);
    const group = groups[0] || '';

    if (!name || Number.isNaN(skill)) return;
    // Clamp and keep one decimal place
    skill = Math.max(0, Math.min(10, Math.round(skill * 10) / 10));

    // Prefer updating by id; fall back to idx
    let idx = -1;
    if (hasStableId) idx = state.players.findIndex(p => String(p.id) === String(idAttr));
    if (idx === -1) idx = idxFromData;
    if (idx < 0 || !state.players[idx]) return;

    const prev = state.players[idx];
    const next = { ...prev, name, skill, group, groups };

    // Optimistic local update
    const copy = state.players.slice();
    copy[idx] = next;
    state.players = copy;

    // Persist local and render immediately for responsive inline edits.
    saveLocal();
    try { queueSaveToSupabase(); } catch {}
    closeInlineEditRow(row);
    render();

    try {
      const toast = document.createElement('div');
      toast.textContent = 'Saved';
      toast.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:#111;color:#fff;padding:8px 12px;border-radius:8px;z-index:10000;font-size:14px;';
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 1100);
    } catch {}

    // Remote sync runs in background to keep UI snappy on slower connections.
    if (supabaseClient) {
      (async () => {
        try {
          let remoteOK = false;
          if (next.id) {
            remoteOK = await updatePlayerFieldsSupabase(next.id, { name, skill, group, groups });
          } else {
            const encodedGroupsTag = serializePlayerGroupsTag(groups, group);
            try {
              const insertRow = HAS_TAG
                ? { name, skill, group, tag: encodedGroupsTag }
                : { name, skill, group };
              const { error } = await supabaseClient.from('players').insert([insertRow]).select();
              if (error) throw error;
            } catch {
              try {
                const { error } = await supabaseClient.from('players').insert([{ name, skill, tag: group }]).select();
                if (error) throw error;
              } catch {
                const { error } = await supabaseClient.from('players').insert([{ name, skill }]).select();
                if (error) throw error;
              }
            }
            remoteOK = true;
          }

          const catalogOK = await ensureGroupCatalogEntriesSupabase(groups);
          if (remoteOK || catalogOK) queueSupabaseRefresh();
        } catch (err) {
          console.error('Supabase save error', err);
        }
      })();
    }
  }, true);
})();

let generatedTeamDragState = null;

function clearGeneratedTeamDragVisuals() {
  document.querySelectorAll('.generated-team.is-drop-enabled').forEach((el) => el.classList.remove('is-drop-enabled'));
  document.querySelectorAll('.generated-team.is-drop-target').forEach((el) => el.classList.remove('is-drop-target'));
  document.querySelectorAll('.team-player-card.is-swap-target').forEach((el) => el.classList.remove('is-swap-target'));
  document.querySelectorAll('.team-player-card.is-dragging').forEach((el) => el.classList.remove('is-dragging'));
  document.body.classList.remove('generated-team-dragging');
}

function resetGeneratedTeamDragState() {
  clearGeneratedTeamDragVisuals();
  generatedTeamDragState = null;
}

(function ensureGeneratedTeamDnDBound() {
  if (window.__generatedTeamDnDBound) return;
  window.__generatedTeamDnDBound = true;

  document.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.team-player-card');
    if (!card) return;

    const fromTeamIndex = Number(card.getAttribute('data-team-index'));
    const playerKey = String(card.getAttribute('data-player-key') || '');
    if (!Number.isInteger(fromTeamIndex) || !playerKey) return;

    generatedTeamDragState = { fromTeamIndex, playerKey };
    card.classList.add('is-dragging');
    document.body.classList.add('generated-team-dragging');
    document.querySelectorAll('.generated-team[data-team-index]').forEach((teamEl) => {
      const idx = Number(teamEl.getAttribute('data-team-index'));
      if (Number.isInteger(idx) && idx !== fromTeamIndex) {
        teamEl.classList.add('is-drop-enabled');
      }
    });

    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', playerKey); } catch {}
    }
  });

  document.addEventListener('dragover', (e) => {
    if (!generatedTeamDragState) return;
    const teamEl = e.target.closest('.generated-team[data-team-index]');
    if (!teamEl) return;

    const toTeamIndex = Number(teamEl.getAttribute('data-team-index'));
    if (!Number.isInteger(toTeamIndex) || toTeamIndex === generatedTeamDragState.fromTeamIndex) return;

    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

    document.querySelectorAll('.generated-team.is-drop-target').forEach((el) => {
      if (el !== teamEl) el.classList.remove('is-drop-target');
    });
    document.querySelectorAll('.team-player-card.is-swap-target').forEach((el) => el.classList.remove('is-swap-target'));
    teamEl.classList.add('is-drop-target');

    const targetCard = e.target.closest('.team-player-card');
    if (targetCard && Number(targetCard.getAttribute('data-team-index')) === toTeamIndex) {
      const targetKey = String(targetCard.getAttribute('data-player-key') || '');
      if (targetKey && targetKey !== generatedTeamDragState.playerKey) {
        targetCard.classList.add('is-swap-target');
      }
    }
  });

  document.addEventListener('drop', (e) => {
    if (!generatedTeamDragState) return;
    const teamEl = e.target.closest('.generated-team[data-team-index]');
    if (!teamEl) {
      resetGeneratedTeamDragState();
      return;
    }

    const toTeamIndex = Number(teamEl.getAttribute('data-team-index'));
    if (!Number.isInteger(toTeamIndex)) {
      resetGeneratedTeamDragState();
      return;
    }

    e.preventDefault();

    const fromTeamIndex = generatedTeamDragState.fromTeamIndex;
    const draggedKey = generatedTeamDragState.playerKey;
    let swapWithKey = '';

    const targetCard = e.target.closest('.team-player-card');
    if (targetCard && Number(targetCard.getAttribute('data-team-index')) === toTeamIndex) {
      const candidate = String(targetCard.getAttribute('data-player-key') || '');
      if (candidate && candidate !== draggedKey) swapWithKey = candidate;
    }

    const result = moveGeneratedPlayerBetweenTeams(fromTeamIndex, toTeamIndex, draggedKey, swapWithKey);
    resetGeneratedTeamDragState();

    if (!result.changed) {
      if (result.reason === 'swap-required') {
        showTeamMoveToast('Drop on a player to swap when team sizes are even.');
      }
      return;
    }

    saveLocal();
    render();
  });

  document.addEventListener('dragend', (e) => {
    if (e.target.closest('.team-player-card')) {
      resetGeneratedTeamDragState();
    }
  });
})();

// -- One delegated handler for Check In and Check Out buttons (capture phase) --
(function ensureCheckDelegationBound() {
  if (window.__checkDelegated) return;
  window.__checkDelegated = true;

  document.addEventListener('click', function onCheckDelegated(e) {
    const inBtn = e.target.closest('.btn-checkin');
    const outBtn = e.target.closest('.btn-checkout');
    if (!inBtn && !outBtn) return;

    e.preventDefault();
    e.stopPropagation();

    const btn = inBtn || outBtn;
    const id = btn.getAttribute('data-id');
    if (!id) return;

    const player = state.players.find(p => String(p.id) === String(id));
    if (!player) return;

    let changed = false;
    if (inBtn) {
      changed = checkInPlayer(player);
    } else if (outBtn) {
      changed = checkOutPlayer(player);
    }

    if (!changed) return;

    saveLocal();
    queueSaveToSupabase();
    render();

    if (supabaseClient && player.id) {
      (async () => {
        try {
          await supabaseClient
            .from('players')
            .update({ checked_in: !!inBtn })
            .eq('id', player.id);
          queueSupabaseRefresh();
        } catch (err) {
          console.error(inBtn ? 'Supabase update error' : 'Supabase check-out error', err);
        }
      })();
    }
  }, true);
})();

function updateBulkBarVisibility() {
  const bar = document.getElementById('bulkBar');
  const countEl = document.getElementById('bulkCount');
  const n = (state.selectedIds || []).length;
  if (!bar || !countEl) return;
  if (n > 0) {
    bar.style.display = 'block';
    countEl.textContent = `${n} selected`;
  } else {
    bar.style.display = 'none';
  }
}

// Create Supabase client if credentials are provided. The global `supabase`
// object is exported by vendor/supabase.js. When both values are falsy
// (empty strings), supabaseClient will be null and no network calls will be
// made. We wrap creation in a try/catch to avoid errors if supabase.js
// fails to load.

// Utility to normalise player names for case insensitive comparison
function normalize(str) {
  return String(str || '').trim().toLowerCase();
}

function escapeHTMLText(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function normalizeGroupName(value) {
  return String(value || '').trim();
}

function normalizeGroupKey(value) {
  return normalizeGroupName(value).toLowerCase();
}

function toGroupCatalogRowName(groupName) {
  const normalized = normalizeGroupName(groupName);
  if (!normalized) return '';
  return `${GROUP_CATALOG_NAME_PREFIX}${normalized}`;
}

function parseGroupCatalogRowName(rowName) {
  const name = String(rowName || '');
  if (!name.startsWith(GROUP_CATALOG_NAME_PREFIX)) return '';
  return normalizeGroupName(name.slice(GROUP_CATALOG_NAME_PREFIX.length));
}

function serializePlayerGroupsTag(groups, primaryGroup = '') {
  const primary = normalizeGroupName(primaryGroup);
  const normalized = normalizeGroupList(groups);
  const ordered = normalizeGroupList([
    ...(primary ? [primary] : []),
    ...normalized
  ]);
  if (!ordered.length) return '';
  try {
    return `${GROUPS_TAG_PREFIX}${encodeURIComponent(JSON.stringify(ordered))}`;
  } catch {
    return '';
  }
}

function parsePlayerGroupsTag(rawTagValue) {
  const raw = String(rawTagValue || '').trim();
  if (!raw.startsWith(GROUPS_TAG_PREFIX)) return null;
  const encoded = raw.slice(GROUPS_TAG_PREFIX.length);
  if (!encoded) return [];
  try {
    const parsed = JSON.parse(decodeURIComponent(encoded));
    return normalizeGroupList(parsed);
  } catch {
    return [];
  }
}

function parseRemotePlayerGroups(row) {
  const primaryGroup = normalizeGroupName(row && row.group);
  const encodedGroups = parsePlayerGroupsTag(row && row.tag);

  if (Array.isArray(encodedGroups) && encodedGroups.length) {
    return normalizeGroupList([
      ...(primaryGroup ? [primaryGroup] : []),
      ...encodedGroups
    ]);
  }

  const fallbackPrimary = normalizeGroupName((row && (row.group || row.tag)) || '');
  return fallbackPrimary ? [fallbackPrimary] : [];
}

function mergeRemoteGroupCatalogIntoState(groupNames) {
  const normalized = normalizeGroupList(groupNames);
  if (!normalized.length) return;

  const localGroups = Array.isArray(state.groups) ? state.groups : [];
  const merged = normalizeGroupList([
    ...localGroups.filter((groupName) => groupName && groupName !== 'All'),
    ...normalized
  ]);
  state.groups = ['All', ...merged];
}

function normalizeGroupList(values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const out = [];
  values.forEach((value) => {
    const group = normalizeGroupName(value);
    const key = normalizeGroupKey(group);
    if (!group || !key || seen.has(key)) return;
    seen.add(key);
    out.push(group);
  });
  return out;
}

function getPlayerGroups(player) {
  if (!player || typeof player !== 'object') return [];
  const primary = normalizeGroupName(player.group || player.tag || '');
  const fromArray = normalizeGroupList(player.groups);
  if (!primary) return fromArray;
  if (!fromArray.length) return [primary];
  if (fromArray[0] === primary) return fromArray;
  return [primary, ...fromArray.filter((g) => g !== primary)];
}

function getPlayerPrimaryGroup(player) {
  const groups = getPlayerGroups(player);
  return groups.length ? groups[0] : '';
}

function playerBelongsToGroup(player, groupName) {
  const targetKey = normalizeGroupKey(groupName);
  if (!targetKey) return false;
  return getPlayerGroups(player).some((group) => normalizeGroupKey(group) === targetKey);
}

function isPlayerUngrouped(player) {
  return getPlayerGroups(player).length === 0;
}

function normalizePlayerGroupShape(player) {
  if (!player || typeof player !== 'object') return false;
  const normalizedGroups = getPlayerGroups(player);
  const normalizedPrimary = normalizedGroups[0] || '';

  let changed = false;
  if (player.group !== normalizedPrimary) {
    player.group = normalizedPrimary;
    changed = true;
  }

  if (!Array.isArray(player.groups) || player.groups.length !== normalizedGroups.length ||
      player.groups.some((group, idx) => group !== normalizedGroups[idx])) {
    player.groups = normalizedGroups;
    changed = true;
  }

  return changed;
}

function normalizePlayerGroupsInState() {
  let changed = false;
  (state.players || []).forEach((player) => {
    if (normalizePlayerGroupShape(player)) changed = true;
  });
  return changed;
}

function parseAdminGroupsInput(rawValue) {
  if (!rawValue) return [];
  return normalizeGroupList(String(rawValue).split(/[,;\n]/g));
}

function getTopFormContextGroup() {
  if (state.limitedGroup) return normalizeGroupName(state.limitedGroup);
  const active = normalizeActiveGroupSelection(state.activeGroup || 'All');
  if (!active || active === 'All' || active === UNGROUPED_FILTER_VALUE) return '';
  return normalizeGroupName(active);
}

function getTopFormGroupsHelpText() {
  if (state.limitedGroup) {
    return `Group lock active: ${state.limitedGroup} is always primary.`;
  }
  const contextGroup = getTopFormContextGroup();
  if (contextGroup) {
    return `Roster context: ${contextGroup}. Leave Groups blank to use it for new players.`;
  }
  const active = normalizeActiveGroupSelection(state.activeGroup || 'All');
  if (active === UNGROUPED_FILTER_VALUE) {
    return 'Roster context: Ungrouped. Leave Groups blank to keep new players ungrouped.';
  }
  return 'Use commas to add groups. First group is primary.';
}

function renderAdminGroupsPreviewMarkup(rawValue, options = {}) {
  const groups = Array.isArray(rawValue)
    ? normalizeGroupList(rawValue)
    : parseAdminGroupsInput(rawValue);
  const contextGroup = normalizeGroupName(options.contextGroup || '');
  const isContextDefault = !groups.length && !!contextGroup;
  const groupsToShow = groups.length ? groups : (isContextDefault ? [contextGroup] : []);
  const contextSuffix = options.contextSuffix || ' (Default Primary)';

  if (!groupsToShow.length) {
    return '<span class="admin-groups-empty small">No groups set</span>';
  }
  const chips = groupsToShow.map((group, idx) =>
    `<span class="admin-groups-chip ${idx === 0 ? 'is-primary' : ''} ${isContextDefault ? 'is-context-default' : ''}">${escapeHTMLText(group)}${idx === 0 ? (isContextDefault ? contextSuffix : ' (Primary)') : ''}</span>`
  ).join('');
  if (!isContextDefault) return chips;
  return `${chips}<span class="small admin-groups-context-note">Applied only when adding a new player with blank Groups.</span>`;
}

function getTopFormGroupDatalistOptions() {
  const available = getAvailableGroups();
  const contextGroup = getTopFormContextGroup();
  if (!contextGroup) return available;
  return [contextGroup, ...available.filter((groupName) => groupName !== contextGroup)];
}

function getTopFormContextPreviewOptions() {
  const contextGroup = getTopFormContextGroup();
  if (contextGroup) return { contextGroup, contextSuffix: ' (Context Primary)' };
  return {};
}

function findPlayerIndexByTopFormName(nameValue) {
  const needle = normalize(nameValue);
  if (!needle) return -1;
  return state.players.findIndex((p) => normalize(p.name) === needle);
}

function getTopFormGroupsPreviewMarkup(nameValue, groupsRawValue) {
  const groups = parseAdminGroupsInput(groupsRawValue);
  if (groups.length) return renderAdminGroupsPreviewMarkup(groups);
  const idx = findPlayerIndexByTopFormName(nameValue);
  if (idx !== -1) {
    return renderAdminGroupsPreviewMarkup(getPlayerGroups(state.players[idx]));
  }
  return renderAdminGroupsPreviewMarkup('', getTopFormContextPreviewOptions());
}

function getTopFormModeHint(nameValue) {
  const idx = findPlayerIndexByTopFormName(nameValue);
  if (idx !== -1) {
    return 'Updating existing player. Leave Groups blank to keep current memberships.';
  }
  return getTopFormGroupsHelpText();
}

function renderTopFormGroupsHelpAndPreview(nameValue, groupsRawValue) {
  return {
    helpText: getTopFormModeHint(nameValue),
    previewHTML: getTopFormGroupsPreviewMarkup(nameValue, groupsRawValue)
  };
}

function parseEditGroupsValue(rawValue) {
  if (!rawValue) return [];
  try {
    const parsed = JSON.parse(rawValue);
    return normalizeGroupList(parsed);
  } catch {
    const fallback = normalizeGroupName(rawValue);
    return fallback ? [fallback] : [];
  }
}

function getEditGroupsFromRow(row) {
  if (!row) return [];
  const groupsInput = row.querySelector('.edit-groups');
  const primaryInput = row.querySelector('.edit-group');
  const fromGroupsInput = parseEditGroupsValue(groupsInput?.value || '');
  if (fromGroupsInput.length) return fromGroupsInput;
  const primary = normalizeGroupName(primaryInput?.value || '');
  return primary ? [primary] : [];
}

function renderEditGroupChipsMarkup(groups) {
  const normalized = normalizeGroupList(groups);
  if (!normalized.length) {
    return '<span class="group-chip-empty small">No groups</span>';
  }
  return normalized.map((group, idx) => `
    <span class="group-chip ${idx === 0 ? 'is-primary' : ''}">
      <button
        type="button"
        class="group-chip-label"
        data-role="set-primary-group"
        data-group-index="${idx}"
      >${escapeHTMLText(group)}${idx === 0 ? ' (Primary)' : ''}</button>
      <button
        type="button"
        class="group-chip-remove"
        data-role="remove-group"
        data-group-index="${idx}"
        aria-label="Remove ${escapeHTMLText(group)}"
      >&times;</button>
    </span>
  `).join('');
}

function updateEditRowGroupUI(row, nextGroups) {
  if (!row) return;
  const normalized = normalizeGroupList(nextGroups);
  const primary = normalized[0] || '';

  const groupsInput = row.querySelector('.edit-groups');
  if (groupsInput) groupsInput.value = JSON.stringify(normalized);

  const primaryInput = row.querySelector('.edit-group');
  if (primaryInput) primaryInput.value = primary;

  const button = row.querySelector('.group-btn');
  if (button) button.textContent = primary || 'Group';

  const chips = row.querySelector('.group-chips');
  if (chips) chips.innerHTML = renderEditGroupChipsMarkup(normalized);

  const select = row.querySelector('.group-select');
  if (select) {
    select.querySelectorAll('.group-item').forEach((item) => {
      const val = normalizeGroupName(item.getAttribute('data-value') || '');
      const idx = normalized.indexOf(val);
      const isMember = idx !== -1;
      const isPrimary = idx === 0;
      item.classList.toggle('is-member', isMember);
      item.classList.toggle('is-primary', isPrimary);
      item.textContent = `${val}${isPrimary ? ' (Primary)' : (isMember ? ' (Member)' : '')}`;
    });
  }
}

function createLocalPlayerKey() {
  return `lp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function ensurePlayerIdentityKeys() {
  let changed = false;
  (state.players || []).forEach((player) => {
    if (!player || typeof player !== 'object') return;
    if (player.id) return;
    const current = String(player.localKey || '').trim();
    if (current) return;
    player.localKey = createLocalPlayerKey();
    changed = true;
  });
  return changed;
}

function playerIdentityKey(player) {
  if (!player || typeof player !== 'object') return '';
  if (player.id) return `id:${String(player.id)}`;
  const current = String(player.localKey || '').trim();
  if (current) return `local:${current}`;
  player.localKey = createLocalPlayerKey();
  return `local:${player.localKey}`;
}

function normalizeCheckedInEntries(entries) {
  ensurePlayerIdentityKeys();
  const list = Array.isArray(entries) ? entries : [];
  const byName = new Map();
  (state.players || []).forEach((p) => {
    const nm = normalize(p.name);
    if (nm && !byName.has(nm)) byName.set(nm, p);
  });

  const knownKeys = new Set((state.players || []).map((p) => playerIdentityKey(p)).filter(Boolean));
  const seen = new Set();
  const out = [];

  list.forEach((entry) => {
    if (typeof entry !== 'string') return;
    const raw = entry.trim();
    if (!raw) return;

    let key = '';
    if (raw.startsWith('id:') || raw.startsWith('local:')) {
      key = raw;
    } else {
      const player = byName.get(normalize(raw));
      if (player) key = playerIdentityKey(player);
    }

    if (!key || !knownKeys.has(key) || seen.has(key)) return;
    seen.add(key);
    out.push(key);
  });

  return out;
}

function isPlayerCheckedIn(player) {
  const key = playerIdentityKey(player);
  return !!key && (state.checkedIn || []).includes(key);
}

function checkInPlayer(player) {
  const key = playerIdentityKey(player);
  if (!key) return false;
  if ((state.checkedIn || []).includes(key)) return false;
  state.checkedIn = [...(state.checkedIn || []), key];
  return true;
}

function checkOutPlayer(player) {
  const key = playerIdentityKey(player);
  if (!key) return false;
  const next = (state.checkedIn || []).filter((k) => k !== key);
  const changed = next.length !== (state.checkedIn || []).length;
  state.checkedIn = next;
  return changed;
}

let saveTimeout;
function queueSaveToSupabase() {
  if (!supabaseClient) return;
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    try {
      if (!HAS_GROUP && !HAS_TAG) {
        await detectPlayersSchema();
      }

      const rows = state.players.map(p => {
        const base = { id: p.id || undefined, name: p.name, skill: p.skill };
        const grp = getPlayerPrimaryGroup(p);
        if (HAS_GROUP) {
          const row = { ...base, group: grp };
          if (HAS_TAG) row.tag = serializePlayerGroupsTag(getPlayerGroups(p), grp);
          return row;
        }
        if (HAS_TAG)        return { ...base, tag: grp };
        return base; // no group-like column in table
      });

      await supabaseClient.from('players').upsert(rows, { onConflict: 'id' });
    } catch (err) {
      console.error('Auto-save error:', err);
    }
  }, 800);
}

let refreshTimeout;
let refreshQueued = false;
let refreshRunning = false;
let groupCatalogSyncTimeout;
let groupCatalogSyncQueued = false;
let groupCatalogSyncRunning = false;
let lastGroupCatalogSyncSignature = '';
function queueSupabaseRefresh(delay = 160) {
  if (!supabaseClient) return;
  refreshQueued = true;
  clearTimeout(refreshTimeout);
  refreshTimeout = setTimeout(() => {
    void runQueuedSupabaseRefresh();
  }, Math.max(0, Number(delay) || 0));
}

async function runQueuedSupabaseRefresh() {
  if (!supabaseClient || refreshRunning || !refreshQueued) return;
  refreshRunning = true;
  refreshQueued = false;
  try {
    await syncFromSupabase();
    saveLocal();
    render();
  } catch (err) {
    console.error('Background Supabase refresh error:', err);
  } finally {
    refreshRunning = false;
    if (refreshQueued) {
      refreshTimeout = setTimeout(() => {
        void runQueuedSupabaseRefresh();
      }, 0);
    }
  }
}

function computeGroupCatalogSyncSignature() {
  const candidates = normalizeGroupList([
    ...(state.groups || []).filter((groupName) => groupName && groupName !== 'All'),
    ...getAvailableGroups()
  ]);
  return candidates.join('|');
}

function queueGroupCatalogSync(delay = 280) {
  if (!supabaseClient || !state.isAdmin) return;
  groupCatalogSyncQueued = true;
  clearTimeout(groupCatalogSyncTimeout);
  groupCatalogSyncTimeout = setTimeout(() => {
    void runQueuedGroupCatalogSync();
  }, Math.max(0, Number(delay) || 0));
}

async function runQueuedGroupCatalogSync() {
  if (!supabaseClient || !state.isAdmin || groupCatalogSyncRunning || !groupCatalogSyncQueued) return;
  groupCatalogSyncRunning = true;
  groupCatalogSyncQueued = false;

  try {
    const signature = computeGroupCatalogSyncSignature();
    if (signature && signature === lastGroupCatalogSyncSignature) return;
    const wroteAny = await backfillGroupCatalogToSupabase();
    if (signature) lastGroupCatalogSyncSignature = signature;
    if (wroteAny) queueSupabaseRefresh();
  } catch (err) {
    console.error('Background group catalog sync error:', err);
  } finally {
    groupCatalogSyncRunning = false;
    if (groupCatalogSyncQueued) {
      groupCatalogSyncTimeout = setTimeout(() => {
        void runQueuedGroupCatalogSync();
      }, 0);
    }
  }
}

// Balanced group generation algorithm. Given a list of all players, the set
// of identity keys that are currently checked in and a desired number of groups,
// assign players to groups so that total skill in each group is as even as
// possible. It builds multiple randomized balanced candidates, scores them for
// fairness, then chooses one from the near-best results to improve variation
// between runs while keeping totals tight.
function summarizeTeamFairness(teams) {
  const totals = teams.map((team) =>
    team.reduce((sum, p) => sum + (Number(p.skill) || 0), 0)
  );
  const counts = teams.map((team) => team.length);
  const maxSkill = totals.length ? Math.max(...totals) : 0;
  const minSkill = totals.length ? Math.min(...totals) : 0;
  const meanSkill = totals.length
    ? totals.reduce((sum, v) => sum + v, 0) / totals.length
    : 0;
  const variance = totals.length
    ? totals.reduce((sum, v) => sum + Math.pow(v - meanSkill, 2), 0) / totals.length
    : 0;

  const skillSpread = maxSkill - minSkill;
  const countSpread = (counts.length ? Math.max(...counts) : 0) - (counts.length ? Math.min(...counts) : 0);
  const skillStdev = Math.sqrt(variance);
  const score = skillSpread + countSpread * 0.75 + skillStdev * 0.25;

  return { skillSpread, countSpread, skillStdev, score };
}

function deriveLiveTeamMatchups(teams) {
  const safeTeams = Array.isArray(teams) ? teams : [];
  const matchups = [];
  const waitingTeams = [];

  for (let i = 0; i < safeTeams.length; i += 2) {
    const teamA = i + 1;
    const teamB = i + 2;
    if (teamB <= safeTeams.length) {
      matchups.push({ teamA, teamB });
    } else {
      waitingTeams.push(teamA);
    }
  }

  return { matchups, waitingTeams };
}

function defaultLiveCourtOrder(teamCount) {
  const count = Math.max(0, Number(teamCount) || 0);
  return Array.from({ length: count }, (_, idx) => idx + 1);
}

function normalizeLiveCourtOrder(courtOrder, teamCount) {
  const count = Math.max(0, Number(teamCount) || 0);
  if (!count) return [];
  const list = Array.isArray(courtOrder) ? courtOrder : [];
  const cleaned = list
    .map((value) => Number(value))
    .filter((teamNo) => Number.isInteger(teamNo) && teamNo > 0 && teamNo <= count);

  if (cleaned.length !== count) return defaultLiveCourtOrder(count);
  if (new Set(cleaned).size !== count) return defaultLiveCourtOrder(count);
  return cleaned;
}

function deriveLiveTeamMatchupsFromOrder(courtOrder) {
  const order = Array.isArray(courtOrder) ? courtOrder : [];
  const matchups = [];
  const waitingTeams = [];

  for (let i = 0; i < order.length; i += 2) {
    const teamA = Number(order[i]);
    const teamB = Number(order[i + 1]);
    if (!Number.isInteger(teamA)) continue;
    if (Number.isInteger(teamB)) {
      matchups.push({ teamA, teamB });
    } else {
      waitingTeams.push(teamA);
    }
  }

  return { matchups, waitingTeams };
}

function liveMatchupKey(teamA, teamB) {
  return `${teamA}-${teamB}`;
}

function normalizeLiveMatchResults(resultsByMatch, matchups) {
  const source = resultsByMatch && typeof resultsByMatch === 'object' ? resultsByMatch : {};
  const allowed = new Map(
    (Array.isArray(matchups) ? matchups : []).map((match) => [liveMatchupKey(match.teamA, match.teamB), match])
  );
  const normalized = {};

  Object.entries(source).forEach(([matchKey, winnerRaw]) => {
    const match = allowed.get(matchKey);
    if (!match) return;
    const winner = Number(winnerRaw);
    if (winner !== match.teamA && winner !== match.teamB) return;
    normalized[matchKey] = winner;
  });

  return normalized;
}

function areAllLiveMatchResultsRecorded(matchups, resultsByMatch) {
  const pairs = Array.isArray(matchups) ? matchups : [];
  if (!pairs.length) return false;
  return pairs.every((match) => {
    const matchKey = liveMatchupKey(match.teamA, match.teamB);
    const winner = Number((resultsByMatch || {})[matchKey]);
    return winner === match.teamA || winner === match.teamB;
  });
}

function deriveNextLiveCourtOrder(courtOrder, liveMatchups, resultsByMatch) {
  const currentOrder = Array.isArray(courtOrder) ? courtOrder : [];
  const pairs = Array.isArray(liveMatchups && liveMatchups.matchups) ? liveMatchups.matchups : [];
  if (!currentOrder.length || !pairs.length) return null;

  const winners = [];
  const losers = [];

  pairs.forEach((match) => {
    const matchKey = liveMatchupKey(match.teamA, match.teamB);
    const winner = Number((resultsByMatch || {})[matchKey]);
    if (winner !== match.teamA && winner !== match.teamB) return;
    winners.push(winner);
    losers.push(winner === match.teamA ? match.teamB : match.teamA);
  });

  if (winners.length !== pairs.length || losers.length !== pairs.length) return null;

  const waiting = (Array.isArray(liveMatchups && liveMatchups.waitingTeams) ? liveMatchups.waitingTeams : [])
    .filter((teamNo) => Number.isInteger(teamNo) && currentOrder.includes(teamNo));

  // First version rule: winners stay/shift left, waiting teams slot between winners and losers,
  // losers shift away from the left winners court.
  const orderedTeamNumbers = [...winners, ...waiting, ...losers];
  if (orderedTeamNumbers.length !== currentOrder.length) return null;
  if (new Set(orderedTeamNumbers).size !== currentOrder.length) return null;
  return orderedTeamNumbers;
}

function maybeAdvanceLiveCourtsFromResults() {
  const teamCount = Array.isArray(state.generatedTeams) ? state.generatedTeams.length : 0;
  const currentOrder = normalizeLiveCourtOrder(state.liveCourtOrder, teamCount);
  state.liveCourtOrder = currentOrder;
  const liveMatchups = deriveLiveTeamMatchupsFromOrder(currentOrder);
  if (!liveMatchups.matchups.length) return false;

  const normalizedResults = normalizeLiveMatchResults(state.liveMatchResults, liveMatchups.matchups);
  state.liveMatchResults = normalizedResults;
  state.liveMatchSkillSnapshots = normalizeLiveMatchSkillSnapshots(
    state.liveMatchSkillSnapshots,
    normalizedResults
  );

  if (!areAllLiveMatchResultsRecorded(liveMatchups.matchups, normalizedResults)) return false;
  // Single-court rounds have no meaningful court movement; keep the
  // recorded result visible so it can be reviewed/cleared.
  if (liveMatchups.matchups.length < 2) return false;

  const nextOrder = deriveNextLiveCourtOrder(currentOrder, liveMatchups, normalizedResults);
  if (!nextOrder) return false;
  const orderChanged = nextOrder.some((teamNo, idx) => teamNo !== currentOrder[idx]);
  if (!orderChanged) return false;

  state.liveCourtOrder = nextOrder;
  state.liveMatchResults = {};
  state.liveMatchSkillSnapshots = {};
  return true;
}

function normalizeLiveMatchSkillSnapshots(snapshotsByMatch, resultsByMatch) {
  const source = snapshotsByMatch && typeof snapshotsByMatch === 'object' ? snapshotsByMatch : {};
  const resultKeys = Object.keys(resultsByMatch && typeof resultsByMatch === 'object' ? resultsByMatch : {});
  const knownPlayerKeys = new Set(
    (state.players || []).map((player) => playerIdentityKey(player)).filter(Boolean)
  );
  const normalized = {};

  resultKeys.forEach((matchKey) => {
    const rawSnapshot = source[matchKey];
    if (!rawSnapshot || typeof rawSnapshot !== 'object') return;

    const cleaned = {};
    Object.entries(rawSnapshot).forEach(([playerKeyRaw, skillRaw]) => {
      const playerKey = String(playerKeyRaw || '').trim();
      if (!playerKey || !knownPlayerKeys.has(playerKey)) return;
      const skill = Number(skillRaw);
      if (!Number.isFinite(skill)) return;
      cleaned[playerKey] = clampSkillOneDecimal(skill);
    });

    if (Object.keys(cleaned).length) {
      normalized[matchKey] = cleaned;
    }
  });

  return normalized;
}

function clampSkillOneDecimal(value) {
  const numeric = Number(value) || 0;
  const rounded = Math.round(numeric * 10) / 10;
  return Math.max(0, Math.min(10, rounded));
}

function parseLiveMatchKey(matchKey) {
  const raw = String(matchKey || '').trim();
  const match = /^(\d+)-(\d+)$/.exec(raw);
  if (!match) return null;
  return {
    teamA: Number(match[1]),
    teamB: Number(match[2])
  };
}

function captureLiveMatchSkillSnapshot(teamA, teamB) {
  ensurePlayerIdentityKeys();
  const teamNumbers = [teamA, teamB].filter((value) => Number.isInteger(value) && value > 0);
  if (!teamNumbers.length) return {};

  const playerByKey = new Map();
  (state.players || []).forEach((player) => {
    const key = playerIdentityKey(player);
    if (key) playerByKey.set(key, player);
  });

  const snapshot = {};
  teamNumbers.forEach((teamNumber) => {
    const teamIndex = teamNumber - 1;
    const team = Array.isArray(state.generatedTeams) ? state.generatedTeams[teamIndex] : null;
    if (!Array.isArray(team)) return;

    team.forEach((member) => {
      const key = playerIdentityKey(member);
      if (!key || Object.prototype.hasOwnProperty.call(snapshot, key)) return;
      const source = playerByKey.get(key) || member;
      snapshot[key] = clampSkillOneDecimal(Number(source.skill) || 0);
    });
  });

  return snapshot;
}

function restoreLiveMatchSkillSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return false;

  const normalized = {};
  Object.entries(snapshot).forEach(([playerKeyRaw, skillRaw]) => {
    const playerKey = String(playerKeyRaw || '').trim();
    if (!playerKey) return;
    const skill = Number(skillRaw);
    if (!Number.isFinite(skill)) return;
    normalized[playerKey] = clampSkillOneDecimal(skill);
  });

  const keys = Object.keys(normalized);
  if (!keys.length) return false;
  const keySet = new Set(keys);

  state.players = (state.players || []).map((player) => {
    const key = playerIdentityKey(player);
    if (!keySet.has(key)) return player;
    return { ...player, skill: normalized[key] };
  });

  state.generatedTeams = (state.generatedTeams || []).map((team) => (
    (Array.isArray(team) ? team : []).map((member) => {
      const key = playerIdentityKey(member);
      if (!keySet.has(key)) return member;
      return { ...member, skill: normalized[key] };
    })
  ));

  return true;
}

function applySkillDeltaToGeneratedTeam(teamNumber, delta) {
  const teamIndex = Number(teamNumber) - 1;
  if (!Number.isInteger(teamIndex) || teamIndex < 0) return;
  const team = Array.isArray(state.generatedTeams) ? state.generatedTeams[teamIndex] : null;
  if (!Array.isArray(team) || !team.length) return;

  const keySet = new Set(team.map((player) => playerIdentityKey(player)).filter(Boolean));
  if (!keySet.size) return;

  state.players = (state.players || []).map((player) => {
    const key = playerIdentityKey(player);
    if (!keySet.has(key)) return player;
    return { ...player, skill: clampSkillOneDecimal((Number(player.skill) || 0) + delta) };
  });

  state.generatedTeams = (state.generatedTeams || []).map((members) => (
    (Array.isArray(members) ? members : []).map((member) => {
      const key = playerIdentityKey(member);
      if (!keySet.has(key)) return member;
      return { ...member, skill: clampSkillOneDecimal((Number(member.skill) || 0) + delta) };
    })
  ));
}

function generateOneBalancedCandidate(eligiblePlayers, groupCount) {
  const teams = Array.from({ length: groupCount }, () => []);
  const teamSkills = new Array(groupCount).fill(0);

  const ordered = eligiblePlayers.slice().sort((a, b) => {
    const diff = (Number(b.skill) || 0) - (Number(a.skill) || 0);
    if (Math.abs(diff) >= 0.6) return diff;
    return Math.random() - 0.5;
  });

  // Small near-skill shuffles increase variety without wrecking fairness.
  for (let i = 0; i < ordered.length - 1; i += 1) {
    const a = Number(ordered[i].skill) || 0;
    const b = Number(ordered[i + 1].skill) || 0;
    if (Math.abs(a - b) <= 0.6 && Math.random() < 0.35) {
      const temp = ordered[i];
      ordered[i] = ordered[i + 1];
      ordered[i + 1] = temp;
    }
  }

  const baseSize = Math.floor(ordered.length / groupCount);
  const extras = ordered.length % groupCount;
  const shuffledTeamIndexes = Array.from({ length: groupCount }, (_, idx) => idx).sort(
    () => Math.random() - 0.5
  );
  const sizeCaps = new Array(groupCount).fill(baseSize);
  for (let i = 0; i < extras; i += 1) {
    sizeCaps[shuffledTeamIndexes[i]] += 1;
  }

  for (const player of ordered) {
    let candidates = [];
    for (let i = 0; i < groupCount; i += 1) {
      if (teams[i].length < sizeCaps[i]) candidates.push(i);
    }
    if (!candidates.length) {
      candidates = Array.from({ length: groupCount }, (_, idx) => idx);
    }

    let minProjected = Infinity;
    for (const idx of candidates) {
      const projected = teamSkills[idx] + (Number(player.skill) || 0);
      if (projected < minProjected) minProjected = projected;
    }

    const nearBest = candidates.filter(
      (idx) => teamSkills[idx] + (Number(player.skill) || 0) <= minProjected + 0.35
    );
    const pool = nearBest.length ? nearBest : candidates;
    const target = pool[Math.floor(Math.random() * pool.length)];

    teams[target].push(player);
    teamSkills[target] += Number(player.skill) || 0;
  }

  return teams;
}

function generateBalancedGroups(players, checkedInKeys, groupCount) {
  const inSet = new Set(checkedInKeys || []);
  const eligible = players.filter((p) => inSet.has(playerIdentityKey(p)));
  const safeGroupCount = Math.max(2, Number(groupCount) || 2);

  if (!eligible.length) {
    return {
      teams: Array.from({ length: safeGroupCount }, () => []),
      summary: { skillSpread: 0, countSpread: 0, attempts: 0, fairnessScore: 0 }
    };
  }

  const attempts = Math.max(24, Math.min(120, eligible.length * 6));
  let best = null;
  const nearBest = [];

  for (let i = 0; i < attempts; i += 1) {
    const teams = generateOneBalancedCandidate(eligible, safeGroupCount);
    const fairness = summarizeTeamFairness(teams);
    const candidate = { teams, fairness };

    if (!best || fairness.score < best.fairness.score - 1e-9) {
      best = candidate;
      nearBest.length = 0;
      nearBest.push(candidate);
      continue;
    }

    if (
      fairness.score <= best.fairness.score + 0.35 &&
      fairness.skillSpread <= best.fairness.skillSpread + 0.25
    ) {
      nearBest.push(candidate);
    }
  }

  const pool = nearBest.length ? nearBest : [best];
  const chosen = pool[Math.floor(Math.random() * pool.length)] || best;
  const chosenFairness = chosen ? chosen.fairness : { skillSpread: 0, countSpread: 0, score: 0 };

  return {
    teams: chosen ? chosen.teams : Array.from({ length: safeGroupCount }, () => []),
    summary: {
      skillSpread: Number(chosenFairness.skillSpread.toFixed(2)),
      countSpread: chosenFairness.countSpread,
      attempts,
      fairnessScore: Number(chosenFairness.score.toFixed(2))
    }
  };
}

function updateGeneratedTeamsSummaryFromCurrent(teams) {
  const fairness = summarizeTeamFairness(teams);
  const prevAttempts = Number(state.generatedTeamsSummary && state.generatedTeamsSummary.attempts);
  state.generatedTeamsSummary = {
    skillSpread: Number(fairness.skillSpread.toFixed(2)),
    countSpread: fairness.countSpread,
    attempts: Number.isFinite(prevAttempts) ? prevAttempts : 0,
    fairnessScore: Number(fairness.score.toFixed(2))
  };
}

function moveGeneratedPlayerBetweenTeams(fromTeamIndex, toTeamIndex, playerKey, swapWithKey) {
  const teamCount = Array.isArray(state.generatedTeams) ? state.generatedTeams.length : 0;
  if (!teamCount) return { changed: false, reason: 'no-teams' };
  if (!Number.isInteger(fromTeamIndex) || !Number.isInteger(toTeamIndex)) {
    return { changed: false, reason: 'invalid-target' };
  }
  if (fromTeamIndex < 0 || toTeamIndex < 0 || fromTeamIndex >= teamCount || toTeamIndex >= teamCount) {
    return { changed: false, reason: 'invalid-target' };
  }
  if (fromTeamIndex === toTeamIndex) return { changed: false, reason: 'same-team' };
  if (!playerKey) return { changed: false, reason: 'missing-player' };

  const teams = state.generatedTeams.map((team) => team.slice());
  const fromTeam = teams[fromTeamIndex];
  const toTeam = teams[toTeamIndex];
  const fromIdx = fromTeam.findIndex((p) => playerIdentityKey(p) === playerKey);
  if (fromIdx < 0) return { changed: false, reason: 'missing-player' };

  if (swapWithKey) {
    const toIdx = toTeam.findIndex((p) => playerIdentityKey(p) === swapWithKey);
    if (toIdx >= 0) {
      const dragged = fromTeam[fromIdx];
      fromTeam[fromIdx] = toTeam[toIdx];
      toTeam[toIdx] = dragged;
      state.generatedTeams = teams;
      updateGeneratedTeamsSummaryFromCurrent(teams);
      return { changed: true, mode: 'swap' };
    }
  }

  // Simple move is allowed only when it won't make size imbalance worse.
  if (fromTeam.length > toTeam.length) {
    const [dragged] = fromTeam.splice(fromIdx, 1);
    toTeam.push(dragged);
    state.generatedTeams = teams;
    updateGeneratedTeamsSummaryFromCurrent(teams);
    return { changed: true, mode: 'move' };
  }

  return { changed: false, reason: 'swap-required' };
}

function showTeamMoveToast(message) {
  try {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:#111;color:#fff;padding:8px 12px;border-radius:8px;z-index:10000;font-size:14px;';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 1300);
  } catch {}
}

function renderFilteredPlayers() {
  // start from all players
  let filtered = state.players.slice();
  const activeGroup = normalizeActiveGroupSelection(state.activeGroup || 'All');
  const checkedSet = new Set(state.checkedIn || []);
  const selectedIds = new Set((state.selectedIds || []).map((id) => String(id)));
  const playerIndexByRef = new Map(state.players.map((player, idx) => [player, idx]));

  // group filter
  if (activeGroup && activeGroup !== 'All') {
    if (activeGroup === UNGROUPED_FILTER_VALUE) {
      filtered = filtered.filter((p) => isPlayerUngrouped(p));
    } else {
      filtered = filtered.filter((p) => playerBelongsToGroup(p, activeGroup));
    }
  }

  // tab filters
  if (state.playerTab === 'in') {
    filtered = filtered.filter((p) => checkedSet.has(playerIdentityKey(p)));
  } else if (state.playerTab === 'out') {
    filtered = filtered.filter((p) => !checkedSet.has(playerIdentityKey(p)));
  } else if (state.playerTab === 'skill' && state.skillSubTab) {
    const min = parseFloat(state.skillSubTab);
    const max = min === 9.0 ? 10 : min + 0.9;
    filtered = filtered
  .filter(p => p.skill >= min && p.skill <= max)
  .sort((a, b) => (b.skill - a.skill) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  } else if (state.playerTab === 'unrated') {
    filtered = filtered.filter(p => !p.skill || p.skill === 0);
  }

  // search
  const q = (state.searchTerm || '').toLowerCase().trim();
  if (q) {
    filtered = filtered.filter(p => {
      const nm = (p.name || '').toLowerCase();
      const tg = (p.tag  || '').toLowerCase();
      const gp = getPlayerGroups(p).join(' ').toLowerCase();
      return nm.includes(q) || tg.includes(q) || gp.includes(q);
    });
  }

  // sort by skill desc
  filtered.sort((a, b) => (b.skill - a.skill) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  if (!filtered.length) return '<p>No players found.</p>';

  return filtered.map((player) => {
    const idx = playerIndexByRef.has(player) ? playerIndexByRef.get(player) : -1;
    const checked = checkedSet.has(playerIdentityKey(player));
    const isSelected = selectedIds.has(String(player.id));
    const playerGroup = getPlayerPrimaryGroup(player);
    const playerGroups = getPlayerGroups(player);
    const playerGroupsValue = escapeHTMLText(JSON.stringify(playerGroups));
    const groupsDisplayHTML = playerGroups.length
      ? playerGroups.map((groupName, groupIndex) =>
        `<span class="badge player-group-badge ${groupIndex === 0 ? 'is-primary' : ''}">${escapeHTMLText(groupName)}${groupIndex === 0 ? ' (Primary)' : ''}</span>`
      ).join('')
      : '<span class="small player-group-none">Ungrouped</span>';

    return `
      <div class="player-card ${isSelected ? 'is-selected' : ''}" data-id="${player.id}" data-index="${idx}">
        ${state.isAdmin ? `
  <div class="menu-wrap">
    <button type="button" class="btn-actions" aria-haspopup="true" aria-expanded="false"
            data-id="${player.id}" title="More actions">⋮</button>
    <div class="card-menu" role="menu">
      <button type="button" class="menu-item" data-role="menu-edit" data-index="${idx}">Edit</button>
      <button type="button" class="menu-item danger" data-role="menu-delete" data-id="${player.id}">Delete</button>
    </div>
  </div>
` : ''}

        <div class="row" style="align-items:center; gap:8px;">
          <input type="checkbox" class="player-select" data-id="${player.id}" ${isSelected ? 'checked' : ''} />
          <div>
            <strong>${player.name}</strong>
            <div class="meta">
              Skill: ${player.skill === 0 ? 'Unset' : player.skill}
              • <span class="status ${checked ? 'in' : 'out'}">${checked ? 'Checked In' : 'Not Checked In'}</span>
            </div>
            <div class="player-groups-inline">${groupsDisplayHTML}</div>
          </div>
        </div>

        <div class="card-actions">
          ${checked
            ? `<button class="btn-checkout primary" data-id="${player.id}">Check Out</button>`
            : `<button class="btn-checkin primary" data-id="${player.id}">Check In</button>`
          }
          <span class="spacer"></span>
        </div>

        ${state.isAdmin ? `
          <div class="edit-row" data-index="${idx}">
        <input type="text" class="edit-name" placeholder="Name" value="${player.name}" />
        <input type="number" class="edit-skill" placeholder="Skill" step="0.1" value="${player.skill}" />
        <div class="group-select" data-index="${idx}">
          <input type="hidden" class="edit-group" value="${playerGroup || ''}" />
          <input type="hidden" class="edit-groups" value="${playerGroupsValue}" />
          <button type="button" class="group-btn">${playerGroup || 'Group'}</button>
          <div class="group-list" role="menu" aria-hidden="true">
            ${getAvailableGroups().map((g) => {
              const groupName = normalizeGroupName(g);
              const memberIndex = playerGroups.indexOf(groupName);
              const isMember = memberIndex !== -1;
              const isPrimary = memberIndex === 0;
              const label = `${groupName}${isPrimary ? ' (Primary)' : (isMember ? ' (Member)' : '')}`;
              return `<button type="button" class="group-item ${isMember ? 'is-member' : ''} ${isPrimary ? 'is-primary' : ''}" data-value="${escapeHTMLText(groupName)}">${escapeHTMLText(label)}</button>`;
            }).join('')}
          </div>
          <div class="group-chips">${renderEditGroupChipsMarkup(playerGroups)}</div>
        </div>
        <div class="edit-actions">
          <button type="button" class="btn-save-edit success" data-index="${idx}" data-id="${player.id}">Save</button>
          <button type="button" class="btn-cancel-edit secondary" data-index="${idx}">Cancel</button>
        </div>
      </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

// Global state. We use a simple object to hold application state. When
// properties change the UI is rebuilt. Keeping all state in one place
// simplifies debugging and persistence.
const state = {
  players: [],        // list of players { name, skill, id? }
  checkedIn: [],      // list of attendance keys currently checked in
  isAdmin: false,     // whether admin panel is unlocked
  generatedTeams: [], // result of the last team generation
  generatedTeamsSummary: null, // fairness details from the latest generation
  liveCourtOrder: [], // current live court order as stable team numbers (left -> right)
  liveMatchResults: {}, // map of matchup key ("1-2") -> winner team number
  liveMatchSkillSnapshots: {}, // map of matchup key -> playerKey skill snapshot before result apply
  groupCount: 2,      // number of teams requested when generating groups
  playerTab: 'all',   // current active tab: 'all', 'in', 'out', 'skill'
  skillSubTab: null,  // current skill range selected, like '1.0', '2.0', etc.
  loaded: false,      // becomes true after Supabase loads
  searchTerm: '',
  collapsedCards: {}, // map of card id -> true when collapsed
  groups: ['All', 'Athletic Specimen'],
  activeGroup: 'All',
  selectedIds: [], // player.id[] currently selected (admin bulk)
  limitedGroup: null, // when set, admin is locked to this group
  adminCodeMap: {}   // live copy used by the UI
};

function normalizeCollapsedCardsState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  Object.keys(value).forEach((key) => {
    if (value[key]) out[String(key)] = true;
  });
  return out;
}

function getAvailableGroups() {
  const fromPlayersSet = new Set();
  (state.players || []).forEach((player) => {
    getPlayerGroups(player).forEach((group) => fromPlayersSet.add(group));
  });
  const fromPlayers = Array.from(fromPlayersSet);
  const fromConfig = Array.from(new Set(Object.values(state.adminCodeMap || ADMIN_CODE_MAP || {}).map(v => String(v || '').trim()).filter(Boolean)));
  const merged = Array.from(new Set([...(state.groups || []).filter(g => g && g !== 'All'), ...fromPlayers, ...fromConfig]));
  // Return available groups for selection (exclude the 'All' sentinel)
  return merged.filter(Boolean);
}

function showTournamentView(show) {
  const v = document.getElementById('view-tournament');
  if (!v) return;
  v.style.display = show ? 'block' : 'none';
  v.setAttribute('aria-hidden', show ? 'false' : 'true');
}

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
const LS_GENERATED_TEAMS_KEY = 'athletic_specimen_generated_team_keys';
const LS_GENERATED_SUMMARY_KEY = 'athletic_specimen_generated_teams_summary';
const LS_LIVE_COURT_ORDER_KEY = 'athletic_specimen_live_court_order';
const LS_LIVE_MATCH_RESULTS_KEY = 'athletic_specimen_live_match_results';
const LS_LIVE_MATCH_SKILL_SNAPSHOTS_KEY = 'athletic_specimen_live_match_skill_snapshots';
const LS_COLLAPSED_CARDS_KEY = 'athletic_specimen_collapsed_cards';

function clearStoredGeneratedTeams() {
  localStorage.removeItem(LS_GENERATED_TEAMS_KEY);
  localStorage.removeItem(LS_GENERATED_SUMMARY_KEY);
  localStorage.removeItem(LS_LIVE_COURT_ORDER_KEY);
  localStorage.removeItem(LS_LIVE_MATCH_RESULTS_KEY);
  localStorage.removeItem(LS_LIVE_MATCH_SKILL_SNAPSHOTS_KEY);
}

function sanitizeGeneratedTeamsSummary(summary) {
  if (!summary || typeof summary !== 'object') return null;
  const skillSpread = Number(summary.skillSpread);
  const countSpread = Number(summary.countSpread);
  if (!Number.isFinite(skillSpread) || !Number.isFinite(countSpread)) return null;

  const attempts = Number(summary.attempts);
  const fairnessScore = Number(summary.fairnessScore);
  return {
    skillSpread: Number(skillSpread.toFixed(2)),
    countSpread: Math.max(0, Math.round(countSpread)),
    attempts: Number.isFinite(attempts) ? Math.max(0, Math.round(attempts)) : 0,
    fairnessScore: Number.isFinite(fairnessScore)
      ? Number(fairnessScore.toFixed(2))
      : Number((skillSpread + countSpread).toFixed(2))
  };
}

function serializeGeneratedTeamsForStorage(teams) {
  if (!Array.isArray(teams) || teams.length === 0) return null;
  ensurePlayerIdentityKeys();

  const knownPlayerKeys = new Set(
    (state.players || []).map((player) => playerIdentityKey(player)).filter(Boolean)
  );
  const checkedSet = new Set(normalizeCheckedInEntries(state.checkedIn || []));
  const seen = new Set();
  const out = [];

  for (const team of teams) {
    if (!Array.isArray(team)) return null;
    const teamKeys = [];
    for (const member of team) {
      if (!member || typeof member !== 'object') return null;
      const key = playerIdentityKey(member);
      if (!key || !knownPlayerKeys.has(key) || seen.has(key)) return null;
      seen.add(key);
      teamKeys.push(key);
    }
    out.push(teamKeys);
  }

  if (seen.size !== checkedSet.size) return null;
  for (const key of seen) if (!checkedSet.has(key)) return null;
  for (const key of checkedSet) if (!seen.has(key)) return null;

  return out;
}

function hydrateGeneratedTeamsFromStoredKeys(storedTeamKeys) {
  if (!Array.isArray(storedTeamKeys) || storedTeamKeys.length === 0) return null;
  ensurePlayerIdentityKeys();

  const playerByKey = new Map();
  (state.players || []).forEach((player) => {
    const key = playerIdentityKey(player);
    if (key) playerByKey.set(key, player);
  });

  const checkedSet = new Set(normalizeCheckedInEntries(state.checkedIn || []));
  const seen = new Set();
  const restored = [];

  for (const rawTeam of storedTeamKeys) {
    if (!Array.isArray(rawTeam)) return null;
    const team = [];
    for (const keyRaw of rawTeam) {
      const key = String(keyRaw || '').trim();
      if (!key || seen.has(key) || !playerByKey.has(key)) return null;
      seen.add(key);
      team.push(playerByKey.get(key));
    }
    restored.push(team);
  }

  if (seen.size !== checkedSet.size) return null;
  for (const key of seen) if (!checkedSet.has(key)) return null;
  for (const key of checkedSet) if (!seen.has(key)) return null;

  return restored;
}

function loadGeneratedTeamsFromLocal() {
  let shouldPersistMigration = false;
  try {
    const storedTeamKeys = JSON.parse(localStorage.getItem(LS_GENERATED_TEAMS_KEY) || 'null');
    const restoredTeams = hydrateGeneratedTeamsFromStoredKeys(storedTeamKeys);
    if (!restoredTeams) {
      state.generatedTeams = [];
      state.generatedTeamsSummary = null;
      state.liveCourtOrder = [];
      state.liveMatchResults = {};
      state.liveMatchSkillSnapshots = {};
      if (
        localStorage.getItem(LS_GENERATED_TEAMS_KEY) ||
        localStorage.getItem(LS_GENERATED_SUMMARY_KEY) ||
        localStorage.getItem(LS_LIVE_COURT_ORDER_KEY) ||
        localStorage.getItem(LS_LIVE_MATCH_RESULTS_KEY) ||
        localStorage.getItem(LS_LIVE_MATCH_SKILL_SNAPSHOTS_KEY)
      ) {
        shouldPersistMigration = true;
      }
      return shouldPersistMigration;
    }

    state.generatedTeams = restoredTeams;
    const storedCourtOrder = JSON.parse(localStorage.getItem(LS_LIVE_COURT_ORDER_KEY) || 'null');
    const normalizedCourtOrder = normalizeLiveCourtOrder(storedCourtOrder, restoredTeams.length);
    state.liveCourtOrder = normalizedCourtOrder;
    if (JSON.stringify(normalizedCourtOrder) !== JSON.stringify(Array.isArray(storedCourtOrder) ? storedCourtOrder : [])) {
      shouldPersistMigration = true;
    }

    const storedSummary = JSON.parse(localStorage.getItem(LS_GENERATED_SUMMARY_KEY) || 'null');
    const normalizedSummary = sanitizeGeneratedTeamsSummary(storedSummary);
    state.generatedTeamsSummary = normalizedSummary;
    if (storedSummary && !normalizedSummary) shouldPersistMigration = true;
    if (normalizedSummary && JSON.stringify(normalizedSummary) !== JSON.stringify(storedSummary)) {
      shouldPersistMigration = true;
    }

    const storedResults = JSON.parse(localStorage.getItem(LS_LIVE_MATCH_RESULTS_KEY) || '{}');
    const matchups = deriveLiveTeamMatchupsFromOrder(normalizedCourtOrder);
    const normalizedResults = normalizeLiveMatchResults(storedResults, matchups.matchups);
    state.liveMatchResults = normalizedResults;
    if (JSON.stringify(normalizedResults) !== JSON.stringify(storedResults || {})) {
      shouldPersistMigration = true;
    }

    const storedSnapshots = JSON.parse(localStorage.getItem(LS_LIVE_MATCH_SKILL_SNAPSHOTS_KEY) || '{}');
    const normalizedSnapshots = normalizeLiveMatchSkillSnapshots(storedSnapshots, normalizedResults);
    state.liveMatchSkillSnapshots = normalizedSnapshots;
    if (JSON.stringify(normalizedSnapshots) !== JSON.stringify(storedSnapshots || {})) {
      shouldPersistMigration = true;
    }
  } catch (err) {
    state.generatedTeams = [];
    state.generatedTeamsSummary = null;
    state.liveCourtOrder = [];
    state.liveMatchResults = {};
    state.liveMatchSkillSnapshots = {};
    shouldPersistMigration = true;
  }

  return shouldPersistMigration;
}

function saveGeneratedTeamsToLocal() {
  const teamKeys = serializeGeneratedTeamsForStorage(state.generatedTeams);
  if (!teamKeys) {
    if (!Array.isArray(state.generatedTeams) || state.generatedTeams.length === 0) {
      state.liveCourtOrder = [];
    }
    clearStoredGeneratedTeams();
    return;
  }

  localStorage.setItem(LS_GENERATED_TEAMS_KEY, JSON.stringify(teamKeys));

  const normalizedSummary = sanitizeGeneratedTeamsSummary(state.generatedTeamsSummary);
  if (normalizedSummary) {
    localStorage.setItem(LS_GENERATED_SUMMARY_KEY, JSON.stringify(normalizedSummary));
  } else {
    localStorage.removeItem(LS_GENERATED_SUMMARY_KEY);
  }

  const normalizedCourtOrder = normalizeLiveCourtOrder(state.liveCourtOrder, teamKeys.length);
  state.liveCourtOrder = normalizedCourtOrder;
  localStorage.setItem(LS_LIVE_COURT_ORDER_KEY, JSON.stringify(normalizedCourtOrder));

  const matchups = deriveLiveTeamMatchupsFromOrder(normalizedCourtOrder);
  const normalizedResults = normalizeLiveMatchResults(state.liveMatchResults, matchups.matchups);
  state.liveMatchResults = normalizedResults;
  if (Object.keys(normalizedResults).length) {
    localStorage.setItem(LS_LIVE_MATCH_RESULTS_KEY, JSON.stringify(normalizedResults));
  } else {
    localStorage.removeItem(LS_LIVE_MATCH_RESULTS_KEY);
  }

  const normalizedSnapshots = normalizeLiveMatchSkillSnapshots(state.liveMatchSkillSnapshots, normalizedResults);
  state.liveMatchSkillSnapshots = normalizedSnapshots;
  if (Object.keys(normalizedSnapshots).length) {
    localStorage.setItem(LS_LIVE_MATCH_SKILL_SNAPSHOTS_KEY, JSON.stringify(normalizedSnapshots));
  } else {
    localStorage.removeItem(LS_LIVE_MATCH_SKILL_SNAPSHOTS_KEY);
  }
}

// Load players and checked-in attendance keys from localStorage into state. Called
// during initialization.
function loadLocal() {
  let shouldPersistMigration = false;
  try {
    const storedPlayers = JSON.parse(localStorage.getItem(LS_PLAYERS_KEY) || '[]');
    if (Array.isArray(storedPlayers)) state.players = storedPlayers;
    if (normalizePlayerGroupsInState()) shouldPersistMigration = true;
    if (ensurePlayerIdentityKeys()) shouldPersistMigration = true;

    const storedChecked = JSON.parse(localStorage.getItem(LS_CHECKIN_KEY) || '[]');
    if (Array.isArray(storedChecked)) {
      const normalizedChecked = normalizeCheckedInEntries(storedChecked);
      state.checkedIn = normalizedChecked;
      if (JSON.stringify(normalizedChecked) !== JSON.stringify(storedChecked)) {
        shouldPersistMigration = true;
      }
    }

    if (loadGeneratedTeamsFromLocal()) {
      shouldPersistMigration = true;
    }

    const adminFlag = sessionStorage.getItem(LS_ADMIN_KEY);
    state.isAdmin = adminFlag === 'true';
  } catch (err) {
    console.error('Error loading from localStorage', err);
  }

  const storedTab = sessionStorage.getItem(LS_TAB_KEY);
  if (storedTab) state.playerTab = storedTab;

  const storedSubtab = sessionStorage.getItem(LS_SUBTAB_KEY);
  if (storedSubtab) state.skillSubTab = storedSubtab;

  try {
    const groups = JSON.parse(localStorage.getItem(LS_GROUPS_KEY) || '[]');
    if (Array.isArray(groups) && groups.length) state.groups = Array.from(new Set(['All', ...groups.filter(Boolean)]));
  } catch {}
  try {
    const storedCollapsedCards = JSON.parse(localStorage.getItem(LS_COLLAPSED_CARDS_KEY) || '{}');
    const normalizedCollapsedCards = normalizeCollapsedCardsState(storedCollapsedCards);
    state.collapsedCards = normalizedCollapsedCards;
    if (JSON.stringify(normalizedCollapsedCards) !== JSON.stringify(storedCollapsedCards || {})) {
      shouldPersistMigration = true;
    }
  } catch {
    state.collapsedCards = {};
    if (localStorage.getItem(LS_COLLAPSED_CARDS_KEY)) shouldPersistMigration = true;
  }
  const ag = localStorage.getItem(LS_ACTIVE_GROUP_KEY);
  if (ag) {
    const normalizedActiveGroup = normalizeActiveGroupSelection(ag);
    state.activeGroup = normalizedActiveGroup;
    if (normalizedActiveGroup !== ag) shouldPersistMigration = true;
  }

  // load codes and tenant scope
  loadAdminCodes(); // << add this
  const lim = sessionStorage.getItem(LS_LIMITED_GROUP_KEY); // << add this
  if (lim) {
    state.limitedGroup = lim;
    state.activeGroup = lim;
  }

  if (shouldPersistMigration) saveLocal();
}

// Save current state players and checked-in attendance keys to localStorage. Called
// whenever state.players or state.checkedIn changes.
function saveLocal() {
  try {
    normalizePlayerGroupsInState();
    ensurePlayerIdentityKeys();
    state.checkedIn = normalizeCheckedInEntries(state.checkedIn);
    state.collapsedCards = normalizeCollapsedCardsState(state.collapsedCards);
    localStorage.setItem(LS_PLAYERS_KEY, JSON.stringify(state.players));
    localStorage.setItem(LS_CHECKIN_KEY, JSON.stringify(state.checkedIn));
    localStorage.setItem(LS_GROUPS_KEY, JSON.stringify(state.groups.filter(g => g && g !== 'All')));
    localStorage.setItem(LS_ACTIVE_GROUP_KEY, state.activeGroup || 'All');
    if (Object.keys(state.collapsedCards).length) {
      localStorage.setItem(LS_COLLAPSED_CARDS_KEY, JSON.stringify(state.collapsedCards));
    } else {
      localStorage.removeItem(LS_COLLAPSED_CARDS_KEY);
    }
    saveGeneratedTeamsToLocal();
    if (state.isAdmin && supabaseClient) {
      queueGroupCatalogSync();
    }
  } catch (err) {
    console.error('Error saving to localStorage', err);
  }
}

function mergePlayersAfterSync(remotePlayers) {
  const prevPlayers = Array.isArray(state.players) ? state.players : [];
  const prevChecked = new Set(state.checkedIn || []);
  ensurePlayerIdentityKeys();

  const prevById = new Map();
  prevPlayers.forEach((player) => {
    if (!player || typeof player !== 'object' || !player.id) return;
    prevById.set(String(player.id), player);
  });

  const mergedRemotePlayers = (Array.isArray(remotePlayers) ? remotePlayers : []).map((remotePlayer) => {
    if (!remotePlayer || typeof remotePlayer !== 'object' || !remotePlayer.id) return remotePlayer;
    const prev = prevById.get(String(remotePlayer.id));
    if (!prev) return remotePlayer;

    const remoteGroups = getPlayerGroups(remotePlayer);
    const prevGroups = getPlayerGroups(prev);
    const groups = normalizeGroupList([
      ...remoteGroups,
      ...prevGroups
    ]);

    return { ...remotePlayer, group: groups[0] || '', groups };
  });

  const remoteByName = new Map();
  mergedRemotePlayers.forEach((p) => {
    const key = normalize(p.name);
    if (key && !remoteByName.has(key)) remoteByName.set(key, p);
  });

  const preservedLocalOnly = [];
  const carriedChecked = new Set();

  prevPlayers.forEach((p) => {
    if (!p || typeof p !== 'object') return;
    if (p.id) return; // remote rows with ids are authoritative

    // Keep tenant scoping behavior when a limited group is active.
    if (state.limitedGroup && getPlayerPrimaryGroup(p) !== state.limitedGroup) return;

    const localKey = playerIdentityKey(p);
    const localWasChecked = !!localKey && prevChecked.has(localKey);
    const matchedRemote = remoteByName.get(normalize(p.name));

    if (matchedRemote) {
      // If a local-only player now exists remotely, carry check-in state forward.
      if (localWasChecked) {
        const remoteKey = playerIdentityKey(matchedRemote);
        if (remoteKey) carriedChecked.add(remoteKey);
      }
      return;
    }

    preservedLocalOnly.push(p);
    if (localWasChecked) carriedChecked.add(localKey);
  });

  const remoteChecked = new Set(
    mergedRemotePlayers
      .filter((p) => p.checked_in)
      .map((p) => playerIdentityKey(p))
      .filter(Boolean)
  );

  return {
    players: [...mergedRemotePlayers, ...preservedLocalOnly],
    checkedIn: [...remoteChecked, ...carriedChecked]
  };
}

// Sync local state with Supabase. Pulls players list and checked_in flags
// from the Supabase table `players`. If Supabase is not configured this
// function is a no‑op. When remote data is retrieved it merges into
// state.players and updates state.checkedIn with identity keys for players
// marked checked_in.
async function syncFromSupabase() {
  if (!supabaseClient) return;

  try {
    if (!HAS_GROUP && !HAS_TAG) {
      await detectPlayersSchema();
    }

    // when tenant-limited, only fetch that group to reduce data exposure and payload size
    let query = supabaseClient.from('players').select('*');

    if (state.limitedGroup) {
      if (HAS_GROUP) {
        query = query.eq('group', state.limitedGroup);
      } else if (HAS_TAG) {
        query = query.eq('tag', state.limitedGroup);
      }
    }

    const { data: fetchedData, error } = await query;
    if (error) {
      console.error('Supabase fetch error', error);
      return;
    }
    if (!Array.isArray(fetchedData)) return;

    let data = fetchedData;
    if (state.limitedGroup) {
      const limitedCatalogRowName = toGroupCatalogRowName(state.limitedGroup);
      if (limitedCatalogRowName) {
        const { data: catalogRows, error: catalogError } = await supabaseClient
          .from('players')
          .select('*')
          .eq('name', limitedCatalogRowName)
          .limit(1);

        if (catalogError) {
          console.error('Supabase limited catalog fetch error', catalogError);
        } else if (Array.isArray(catalogRows) && catalogRows.length) {
          const byIdentity = new Set(
            data.map((row) => String((row && row.id) || (row && row.name) || '')).filter(Boolean)
          );
          catalogRows.forEach((row) => {
            const key = String((row && row.id) || (row && row.name) || '');
            if (!key || byIdentity.has(key)) return;
            byIdentity.add(key);
            data.push(row);
          });
        }
      }
    }

    const remoteGroupCatalog = [];
    const remotePlayers = [];
    data.forEach((p) => {
      const catalogGroup = parseGroupCatalogRowName(p && p.name);
      if (catalogGroup) {
        remoteGroupCatalog.push(catalogGroup);
        return;
      }

      const memberships = parseRemotePlayerGroups(p);
      const group = memberships[0] || '';
      remotePlayers.push({
        name: p.name,
        skill: Number(p.skill) || 0,
        id: p.id,
        checked_in: !!p.checked_in,
        group,
        groups: memberships
      });
    });
    mergeRemoteGroupCatalogIntoState(remoteGroupCatalog);

    const merged = mergePlayersAfterSync(remotePlayers);
    state.players = merged.players;
    normalizePlayerGroupsInState();
    state.checkedIn = normalizeCheckedInEntries(merged.checkedIn);
    state.loaded = true;
  } catch (err) {
    console.error('Error syncing from Supabase', err);
  }
}

// Detect whether the 'players' table uses 'group' or 'tag'

let HAS_GROUP = false;
let HAS_TAG = false;
let PREFER_TAG_COLUMN = false;

async function detectPlayersSchema() {
  if (!supabaseClient) return;
  HAS_GROUP = false;
  HAS_TAG = false;

  try {
    const { error } = await supabaseClient.from('players').select('group').limit(1);
    HAS_GROUP = !error; // if no error, column exists
  } catch {}

  try {
    const { error } = await supabaseClient.from('players').select('tag').limit(1);
    HAS_TAG = !error;
  } catch {}

  // prefer tag only if tag exists and group does not
  PREFER_TAG_COLUMN = HAS_TAG && !HAS_GROUP;

  if (!HAS_GROUP && !HAS_TAG) {
    console.warn('[players] No group-like column found (neither "group" nor "tag"). Group changes will be local-only.');
  }
}

async function updatePlayerFieldsSupabase(id, fields) {
  if (!supabaseClient || !id) return false;
  if (!HAS_GROUP && !HAS_TAG) {
    await detectPlayersSchema();
  }

  const { group, groups, ...rest } = fields || {};
  const payload = { ...rest };
  const normalizedGroup = typeof group === 'undefined' ? undefined : normalizeGroupName(group);

  if (typeof group !== 'undefined') {
    if (HAS_GROUP) payload.group = normalizedGroup || '';
    else if (HAS_TAG) payload.tag = normalizedGroup || '';
    // else: table has neither group-like column
  }

  if (HAS_GROUP && HAS_TAG && typeof groups !== 'undefined') {
    payload.tag = serializePlayerGroupsTag(groups, normalizedGroup || '');
  }

  try {
    const { error } = await supabaseClient.from('players').update(payload).eq('id', id);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Supabase update error', e);
    return false;
  }
}

async function ensureGroupCatalogEntrySupabase(groupName) {
  if (!supabaseClient) return false;
  if (!HAS_GROUP && !HAS_TAG) {
    await detectPlayersSchema();
  }
  const normalized = normalizeGroupName(groupName);
  if (!normalized) return false;
  const rowName = toGroupCatalogRowName(normalized);

  try {
    const { data: existing, error: selectError } = await supabaseClient
      .from('players')
      .select('id,group,tag')
      .eq('name', rowName)
      .limit(1);
    if (selectError) throw selectError;
    if (Array.isArray(existing) && existing.length) {
      const existingRow = existing[0];
      const payload = {};
      if (HAS_GROUP && normalizeGroupName(existingRow.group || '') !== normalized) {
        payload.group = normalized;
      } else if (HAS_TAG && normalizeGroupName(existingRow.tag || '') !== normalized) {
        payload.tag = normalized;
      }

      if (Object.keys(payload).length) {
        const { error: updateError } = await supabaseClient
          .from('players')
          .update(payload)
          .eq('id', existingRow.id);
        if (updateError) throw updateError;
      }
      return true;
    }

    const payload = { name: rowName, skill: 0 };
    if (HAS_GROUP) payload.group = normalized;
    else if (HAS_TAG) payload.tag = normalized;

    const { error: insertError } = await supabaseClient.from('players').insert([payload]);
    if (insertError) throw insertError;
    return true;
  } catch (err) {
    console.error('Supabase group catalog upsert error', err);
    return false;
  }
}

async function renameGroupCatalogEntrySupabase(oldGroupName, newGroupName) {
  if (!supabaseClient) return false;
  if (!HAS_GROUP && !HAS_TAG) {
    await detectPlayersSchema();
  }
  const oldRowName = toGroupCatalogRowName(oldGroupName);
  const newRowName = toGroupCatalogRowName(newGroupName);
  const normalizedNew = normalizeGroupName(newGroupName);
  if (!oldRowName || !newRowName) return false;
  if (oldRowName === newRowName) return true;

  try {
    const { data: existing, error: selectError } = await supabaseClient
      .from('players')
      .select('id')
      .eq('name', oldRowName)
      .limit(1);
    if (selectError) throw selectError;

    if (Array.isArray(existing) && existing.length) {
      const id = existing[0].id;
      const payload = { name: newRowName };
      if (HAS_GROUP) payload.group = normalizedNew;
      else if (HAS_TAG) payload.tag = normalizedNew;
      const { error: updateError } = await supabaseClient
        .from('players')
        .update(payload)
        .eq('id', id);
      if (updateError) throw updateError;
      return true;
    }

    return await ensureGroupCatalogEntrySupabase(newGroupName);
  } catch (err) {
    console.error('Supabase group catalog rename error', err);
    return false;
  }
}

async function ensureGroupCatalogEntriesSupabase(groupNames) {
  if (!supabaseClient) return false;
  const normalized = normalizeGroupList(groupNames);
  if (!normalized.length) return false;

  let wroteAny = false;
  for (const groupName of normalized) {
    try {
      const ok = await ensureGroupCatalogEntrySupabase(groupName);
      if (ok) wroteAny = true;
    } catch (err) {
      console.error('Supabase group catalog ensure error', err);
    }
  }
  return wroteAny;
}

async function deleteGroupCatalogEntrySupabase(groupName) {
  if (!supabaseClient) return false;
  const rowName = toGroupCatalogRowName(groupName);
  if (!rowName) return false;

  try {
    const { error } = await supabaseClient
      .from('players')
      .delete()
      .eq('name', rowName);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Supabase group catalog delete error', err);
    return false;
  }
}

async function backfillGroupCatalogToSupabase() {
  if (!supabaseClient || !state.isAdmin) return false;

  const candidates = normalizeGroupList([
    ...(state.groups || []).filter((groupName) => groupName && groupName !== 'All'),
    ...getAvailableGroups()
  ]);

  if (!candidates.length) return false;
  let wroteAny = false;

  for (const groupName of candidates) {
    try {
      const ok = await ensureGroupCatalogEntrySupabase(groupName);
      if (ok) wroteAny = true;
    } catch (err) {
      console.error('Supabase group catalog backfill error', err);
    }
  }
  return wroteAny;
}

async function backfillPlayerMembershipsToSupabase() {
  if (!supabaseClient || !state.isAdmin || !HAS_GROUP || !HAS_TAG) return false;

  let wroteAny = false;
  const updates = (state.players || [])
    .filter((player) => player && player.id)
    .map((player) => ({
      id: player.id,
      group: getPlayerPrimaryGroup(player),
      groups: getPlayerGroups(player)
    }));

  for (const update of updates) {
    try {
      const ok = await updatePlayerFieldsSupabase(update.id, {
        group: update.group,
        groups: update.groups
      });
      if (ok) wroteAny = true;
    } catch (err) {
      console.error('Supabase player membership backfill error', err);
    }
  }

  return wroteAny;
}

// map teamId -> { poolId, number } after pools are saved
function computePoolNumbers(t) {
  const map = {};
  (t.pools || []).forEach(pool => {
    pool.teamIds.forEach((tid, i) => {
      map[tid] = { poolId: pool.id, number: i + 1 };
    });
  });
  return map;
}

function poolNameById(t, poolId) {
  return (t.pools || []).find(p => p.id === poolId)?.name || '';
}

function teamNumberLabel(t, teamId) {
  if (!t.poolNumbers) return '';
  const rec = t.poolNumbers[teamId];
  if (!rec) return '';
  const pName = poolNameById(t, rec.poolId);
  // Example label: "A-3" (Pool A, team #3)
  const poolLetter = (pName.match(/Pool\s+([A-Z])/i)?.[1] || pName.replace(/[^A-Za-z]/g,'').slice(-1) || '?').toUpperCase();
  return `${poolLetter}-${rec.number}`;
}

// ------- TournamentManager (clean IIFE) --------------------------------------
const TournamentManager = (() => {
  const LS_KEY = 'nvlb_tournaments_v1';

  // --------- storage helpers ----------
  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : { tournaments: [], scoreSubmissions: {} };
    } catch {
      return { tournaments: [], scoreSubmissions: {} };
    }
  }
  function save(state) { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
  function upsertTournament(t) {
    const s = load();
    const i = s.tournaments.findIndex(x => x.id === t.id);
    if (i >= 0) s.tournaments[i] = t; else s.tournaments.push(t);
    save(s);
  }

  // ---------- tiny utils ----------
  const uid = () => Math.random().toString(36).slice(2, 10);

  // Compute pool “numbers” for quick team number labels like A-3, B-1, etc.
  function computePoolNumbers(t) {
    const map = {};
    (t.pools || []).forEach(pool => {
      pool.teamIds.forEach((tid, i) => { map[tid] = { poolId: pool.id, number: i + 1 }; });
    });
    return map;
  }

  // Round-robin generator for a list of team IDs (adds a bye if odd)
  function roundRobinPairs(teamIds) {
    const ids = [...teamIds];
    if (ids.length % 2 === 1) ids.push(null);
    const n = ids.length;
    const rounds = [];
    for (let r = 0; r < n - 1; r++) {
      const pairs = [];
      for (let i = 0; i < n / 2; i++) {
        const a = ids[i], b = ids[n - 1 - i];
        if (a && b) pairs.push([a, b]);
      }
      rounds.push(pairs);
      const fixed = ids[0];
      const rest = ids.slice(1);
      rest.unshift(rest.pop());
      ids.splice(0, ids.length, fixed, ...rest);
    }
    return rounds;
  }

  // ---------- public-ish helpers used by UI ----------
  function getAll() { return load().tournaments; }
  function getById(id) { return getAll().find(t => t.id === id) || null; }

  function createTournament(name, netsCount) {
    const t = {
      id: uid(),
      name,
      nets: Array.from({ length: Number(netsCount || 1) }, (_, i) => i + 1),
      teams: [],          // [{id, name}]
      pools: [],          // [{id, name, teamIds: []}]
      poolNumbers: {},    // { teamId: { poolId, number } }
      poolMatches: [],    // [{ id, label, poolId, round, net, teamAId, teamBId, status, scoreA, scoreB }]
      createdAt: Date.now()
    };
    upsertTournament(t);
    return t;
  }

  function addTeams(tournamentId, teamNames) {
    const t = getById(tournamentId);
    if (!t) return;
    const existing = new Set(t.teams.map(x => x.name.toLowerCase()));
    teamNames.forEach(n => {
      const name = String(n || '').trim();
      if (!name || existing.has(name.toLowerCase())) return;
      t.teams.push({ id: uid(), name });
    });
    upsertTournament(t);
  }

  // poolsSpec = [{ name: "Pool A", teams: ["Team 1","Team 2",...] }, ...]
  function setPools(tournamentId, poolsSpec) {
    const t = getById(tournamentId);
    if (!t) return;
    const nameToId = Object.fromEntries(t.teams.map(tm => [tm.name, tm.id]));
    t.pools = (poolsSpec || []).map(p => ({
      id: uid(),
      name: p.name,
      teamIds: (p.teams || []).map(n => nameToId[n]).filter(Boolean)
    }));
    // cache lookup table for team numbers (A-1, B-3, etc.)
    t.poolNumbers = computePoolNumbers(t);
    upsertTournament(t);
  }

  function generatePoolSchedule(tournamentId) {
    const t = getById(tournamentId);
    if (!t) return;
    const nets = t.nets.length ? t.nets : [1];
    const matches = [];
    let seq = 1;

    (t.pools || []).forEach(pool => {
      const rr = roundRobinPairs(pool.teamIds);
      rr.forEach((pairs, roundIndex) => {
        pairs.forEach((pair, pairIndex) => {
          matches.push({
            id: uid(),
            label: `M${seq++}`,
            poolId: pool.id,
            round: roundIndex + 1,
            net: nets[pairIndex % nets.length], // rotate across available nets
            teamAId: pair[0],
            teamBId: pair[1],
            status: 'scheduled',
            scoreA: null,
            scoreB: null
          });
        });
      });
    });

    t.poolMatches = matches;
    upsertTournament(t);
  }

  // ------------- standings / rankings -------------
  function teamRecord(tournamentId, teamId) {
    const t = getById(tournamentId);
    if (!t) return { wins: 0, losses: 0, pf: 0, pa: 0, pd: 0 };
    let wins = 0, losses = 0, pf = 0, pa = 0;
    (t.poolMatches || []).forEach(m => {
      if (m.status !== 'final') return;
      if (m.teamAId === teamId) {
        pf += m.scoreA; pa += m.scoreB;
        if (m.scoreA > m.scoreB) wins++; else if (m.scoreA < m.scoreB) losses++;
      } else if (m.teamBId === teamId) {
        pf += m.scoreB; pa += m.scoreA;
        if (m.scoreB > m.scoreA) wins++; else if (m.scoreB < m.scoreA) losses++;
      }
    });
    return { wins, losses, pf, pa, pd: pf - pa };
  }

  function poolStandings(tournamentId) {
    const t = getById(tournamentId);
    if (!t) return [];
    return (t.pools || []).map(pool => {
      const rows = pool.teamIds.map(teamId => {
        const rec = teamRecord(t.id, teamId);
        const name = t.teams.find(x => x.id === teamId)?.name || 'Unknown';
        return { teamId, teamName: name, ...rec };
      }).sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (b.pd !== a.pd) return b.pd - a.pd;
        if (b.pf !== a.pf) return b.pf - a.pf;
        return a.teamName.localeCompare(b.teamName);
      });
      return { poolId: pool.id, poolName: pool.name, rows };
    });
  }

  function allTeamsRanked(tournamentId) {
    const t = getById(tournamentId);
    if (!t) return [];
    return t.teams.map(tm => ({ teamId: tm.id, teamName: tm.name, ...teamRecord(t.id, tm.id) }))
      .sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (b.pd !== a.pd) return b.pd - a.pd;
        if (b.pf !== a.pf) return b.pf - a.pf;
        return a.teamName.localeCompare(b.teamName);
      });
  }

  // ------------- lookups used by UI -------------
  function nextMatchForTeam(tournamentId, teamId) {
    const t = getById(tournamentId);
    if (!t) return null;
    const upcoming = (t.poolMatches || [])
      .filter(m => m.status === 'scheduled' && (m.teamAId === teamId || m.teamBId === teamId))
      .sort((a, b) => (a.round - b.round) || String(a.label).localeCompare(String(b.label)));
    return upcoming[0] || null;
  }

  // Find the next scheduled match on a specific net (for “Report Score by Net” UI)
  function findNextScheduledMatchByNet(tournamentId, netNumber) {
    const t = getById(tournamentId);
    if (!t) return null;
    const upcoming = (t.poolMatches || [])
      .filter(m => m.status === 'scheduled' && Number(m.net) === Number(netNumber))
      .sort((a, b) => (a.round - b.round) || String(a.label).localeCompare(String(b.label)));
    return upcoming[0] || null;
  }

  // ------------- dual-entry score reporting -------------
  function submitScoreDualEntry(tournamentId, matchId, reporterTeamName, scoreA, scoreB) {
    const state = load();
    const key = `${tournamentId}:${matchId}`;
    if (!state.scoreSubmissions[key]) state.scoreSubmissions[key] = [];
    state.scoreSubmissions[key].push({
      by: String(reporterTeamName || '').trim(),
      scoreA: Number(scoreA),
      scoreB: Number(scoreB),
      ts: Date.now()
    });
    save(state);

    const subs = state.scoreSubmissions[key];
    if (subs.length >= 2) {
      for (let i = 0; i < subs.length; i++) {
        for (let j = i + 1; j < subs.length; j++) {
          if (subs[i].scoreA === subs[j].scoreA && subs[i].scoreB === subs[j].scoreB) {
            finalizeMatchScore(tournamentId, matchId, subs[i].scoreA, subs[i].scoreB);
            state.scoreSubmissions[key] = [{
              finalized: true, scoreA: subs[i].scoreA, scoreB: subs[i].scoreB, ts: Date.now()
            }];
            save(state);
            return { status: 'finalized', message: 'Scores matched from two teams and have been recorded.' };
          }
        }
      }
      return { status: 'pending', message: 'Second submission received but does not match another. Admin review required.' };
    }
    return { status: 'pending', message: 'First submission recorded. Waiting for the second team to submit the same score.' };
  }

  function finalizeMatchScore(tournamentId, matchId, scoreA, scoreB) {
    const t = getById(tournamentId);
    if (!t) return;
    const m = (t.poolMatches || []).find(x => x.id === matchId);
    if (!m) return;
    m.status = 'final';
    m.scoreA = Number(scoreA);
    m.scoreB = Number(scoreB);
    upsertTournament(t);
  }

  // Expose only what the app needs
  return {
    // lists / lookup
    getAll,
    getById,
    // setup
    createTournament,
    addTeams,
    setPools,
    generatePoolSchedule,
    // standings / rankings
    poolStandings,
    allTeamsRanked,
    // queries for UI
    nextMatchForTeam,
    findNextScheduledMatchByNet,
    // scoring
    submitScoreDualEntry
  };
})();

// Ensure tournament modal cards aren't faded (used later)
// Ensure tournament modal content is not dimmed or disabled anywhere
// Ensure tournament modal content is never dimmed
function fixTournamentFading() {
  const root = document.getElementById('view-tournament');
  if (!root) return;

  // Remove disabled flags/classes
  root.querySelectorAll('[aria-disabled],[data-disabled]').forEach(el => {
    el.removeAttribute('aria-disabled');
    el.removeAttribute('data-disabled');
  });
  root.querySelectorAll('.muted,.is-disabled,.disabled').forEach(el => {
    el.classList.remove('muted','is-disabled','disabled');
  });

  // Re-enable controls
  root.querySelectorAll('fieldset, input, select, textarea, button').forEach(el => {
    if (el.disabled) el.disabled = false;
    el.style.pointerEvents = 'auto';
    el.style.opacity = '1';
    el.style.filter = 'none';
  });

  // Let CSS control colors (do NOT force white again)
  root.querySelectorAll('h2, h3, h4, label, .field-label, .section-title').forEach(el => {
    el.style.opacity = '1';
    el.style.filter = 'none';
    el.style.color = ''; // reset any inline color that was set before
  });
}

// Make sure section titles and inline labels exist and are visible
function ensureTournamentUI() {
  const root = document.getElementById('view-tournament');
  if (!root) return;

  const styleLabel = (lbl) => {
    lbl.style.opacity = '1';
    lbl.style.filter = 'none';
    lbl.style.color = '#111';
    lbl.style.fontWeight = '600';
    lbl.style.display = 'inline-block';
    lbl.style.minWidth = '72px';
    lbl.style.marginRight = '8px';
  };

  const specs = [
    { id: 'reportMatchSelect', text: 'Match' },
    { id: 'teamA_score',       text: 'Team A',  ph: 'Team A' },
    { id: 'teamB_score',       text: 'Team B',  ph: 'Team B' },
    { id: 'reporterTeam',      text: 'Your team name', ph: 'Type your team name' },
  ];

  specs.forEach(({ id, text, ph }) => {
    const input = document.getElementById(id);
    if (!input) return;

    if (ph && 'placeholder' in input) input.placeholder = ph;

    let lbl = root.querySelector(`label[for="${id}"]`);
    if (!lbl && input.previousElementSibling && input.previousElementSibling.tagName.toLowerCase() === 'label') {
      lbl = input.previousElementSibling;
    }
    if (!lbl) {
      lbl = document.createElement('label');
      lbl.setAttribute('for', id);
      input.insertAdjacentElement('beforebegin', lbl);
    }
    lbl.textContent = text;
    styleLabel(lbl);
  });
}

function ensureTournamentTabClickable() {
  const btn = document.getElementById('tab-tournament');
  if (!btn) return;
  btn.style.pointerEvents = 'auto';
  btn.style.opacity = '';
  btn.style.filter = 'none';
  btn.classList.remove('disabled', 'is-disabled', 'muted');
  btn.setAttribute('aria-disabled', 'false');
  btn.setAttribute('tabindex', '0');
  btn.setAttribute('role', 'button');
  // help if something is overlaying it
  btn.style.position = btn.style.position || 'relative';
  btn.style.zIndex = '10';
}

function openTournamentView() {
  showTournamentView(true);
  try { fixTournamentFading(); } catch {}
  try { ensureTournamentUI(); } catch {}
}

function bindTournamentTab() {
  const byId = document.getElementById('tab-tournament');
  if (byId) {
    byId.style.pointerEvents = 'auto';
    byId.onclick = (e) => {
      if (e) e.preventDefault();
      showTournamentView(true);
      initTournamentView();
    };
  }

  if (!bindTournamentTab._delegated) {
    document.addEventListener('click', (e) => {
      const el = e.target.closest('#tab-tournament, [data-tab="tournament"], a[href="#tournament"]');
      if (!el) return;
      e.preventDefault();
      showTournamentView(true);
      initTournamentView();
    });
    bindTournamentTab._delegated = true;
  }
}

function initTournamentView() {
  const adminBox = document.getElementById('adminTournament');
  if (adminBox) adminBox.style.display = state.isAdmin ? 'block' : 'none';

  const tSelect = document.getElementById('tournamentSelect');
  const publicNext = document.getElementById('publicNextMatches');
  const poolStand = document.getElementById('poolStandings');
  const reportStatus = document.getElementById('reportStatus');
  const reportMatchSelect = document.getElementById('reportMatchSelect');
  const reporterTeamInput = document.getElementById('reporterTeam');
  const teamAInput = document.getElementById('teamA_score');
  const teamBInput = document.getElementById('teamB_score');
  const closeBtn = document.getElementById('closeTournamentBtn');

  function matchLabel(t, m) {
    const a = teamNumberLabel(t, m.teamAId) || 'TBD';
    const b = teamNumberLabel(t, m.teamBId) || 'TBD';
    return `${m.label} • ${a} vs ${b} • Net ${m.net} • R${m.round}`;
  }

  function refreshTournamentSelect() {
    if (!tSelect) return;
    const all = TournamentManager.getAll();
    const prev = tSelect.value;
    tSelect.innerHTML = all.length
      ? all.map(t => `<option value="${t.id}">${t.name}</option>`).join('')
      : `<option value="">No tournaments</option>`;
    if (prev && Array.from(tSelect.options).some(o => o.value === prev)) {
      tSelect.value = prev;
    }
  }

  function renderAdminRankings() {
    const box = document.getElementById('adminRankings');
    if (!box) return;
    const id = tSelect ? tSelect.value : '';
    const rows = id ? TournamentManager.allTeamsRanked(id) : [];
    box.innerHTML = rows.length ? `
      <table class="table">
        <thead><tr><th>#</th><th>Team</th><th>Record</th><th>PF</th><th>PA</th><th>PD</th></tr></thead>
        <tbody>
          ${rows.map((r,i)=>`<tr><td>${i+1}</td><td>${r.teamName}</td><td>${r.wins}-${r.losses}</td><td>${r.pf}</td><td>${r.pa}</td><td>${r.pd}</td></tr>`).join('')}
        </tbody>
      </table>` : '';
  }

  function renderPublicNextAndStandings() {
    const id = tSelect ? tSelect.value : '';
    const t = TournamentManager.getById(id);

    if (publicNext) {
      if (!t) {
        publicNext.innerHTML = '<ul class="list"><li>No tournament selected</li></ul>';
      } else {
        const nets = t.nets && t.nets.length ? t.nets : [1];
        const rows = nets.map(n => {
          const m = TournamentManager.findNextScheduledMatchByNet(t.id, n);
          if (!m) return `<li>Net ${n}: no scheduled match</li>`;
          return `<li><span class="badge">Net ${n}</span> ${matchLabel(t, m)}</li>`;
        }).join('');
        publicNext.innerHTML = `<ul class="list">${rows}</ul>`;
      }
    }

    if (poolStand) {
      if (!t) {
        poolStand.innerHTML = '';
      } else {
        const standings = TournamentManager.poolStandings(t.id);
        poolStand.innerHTML = standings.length
          ? standings.map(s => `
              <div class="card">
                <h4 style="margin:6px 0;">${s.poolName}</h4>
                <table class="table">
                  <thead><tr><th>#</th><th>Team</th><th>W</th><th>L</th><th>PF</th><th>PA</th><th>PD</th></tr></thead>
                  <tbody>
                    ${s.rows.map((r,i)=>`
                      <tr>
                        <td>${i+1}</td>
                        <td>${r.teamName}</td>
                        <td>${r.wins}</td>
                        <td>${r.losses}</td>
                        <td>${r.pf}</td>
                        <td>${r.pa}</td>
                        <td>${r.pd}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            `).join('')
          : `<p class="small" style="margin:0;">No pools yet.</p>`;
      }
    }
  }

  function populateReportMatchSelect() {
    const el = reportMatchSelect;
    if (!el) return;
    const id = tSelect ? tSelect.value : '';
    el.innerHTML = '';
    if (!id) {
      el.innerHTML = `<option value="">Select a tournament first</option>`;
      return;
    }
    const t = TournamentManager.getById(id);
    if (!t || !Array.isArray(t.poolMatches) || t.poolMatches.length === 0) {
      el.innerHTML = `<option value="">No matches scheduled</option>`;
      return;
    }
    const scheduled = t.poolMatches.filter(m => m.status === 'scheduled');
    if (scheduled.length === 0) {
      el.innerHTML = `<option value="">No upcoming matches</option>`;
      return;
    }
    el.innerHTML = scheduled
      .sort((a,b) => (a.round - b.round) || String(a.label).localeCompare(String(b.label)))
      .map(m => `<option value="${m.id}">${matchLabel(t, m)}</option>`)
      .join('');
  }

  const createBtn = document.getElementById('createTournamentBtn');
  if (createBtn) createBtn.onclick = () => {
    const name = (document.getElementById('newTournamentName').value || '').trim();
    const nets = document.getElementById('newTournamentNets').value;
    if (!name) return;
    TournamentManager.createTournament(name, nets || 1);
    refreshTournamentSelect();
    renderAdminRankings();
    renderPublicNextAndStandings();
    populateReportMatchSelect();
  };

  const addTeamsBtn = document.getElementById('addTeamsBtn');
  if (addTeamsBtn) addTeamsBtn.onclick = () => {
    const id = tSelect ? tSelect.value : '';
    if (!id) return;
    const text = document.getElementById('bulkTeams').value || '';
    const names = text.split('\n').map(s => s.trim()).filter(Boolean);
    if (!names.length) return;
    TournamentManager.addTeams(id, names);
    renderAdminRankings();
    renderPublicNextAndStandings();
    populateReportMatchSelect();
  };

  const savePoolsBtn = document.getElementById('savePoolsBtn');
  if (savePoolsBtn) savePoolsBtn.onclick = () => {
    const id = tSelect ? tSelect.value : '';
    if (!id) return;
    try {
      const spec = JSON.parse(document.getElementById('poolsJson').value || '[]');
      TournamentManager.setPools(id, spec);
      renderAdminRankings();
      renderPublicNextAndStandings();
      populateReportMatchSelect();
    } catch {
      alert('Pools JSON invalid');
    }
  };

  const genBtn = document.getElementById('generatePoolScheduleBtn');
  if (genBtn) genBtn.onclick = () => {
    const id = tSelect ? tSelect.value : '';
    if (!id) return;
    TournamentManager.generatePoolSchedule(id);
    renderAdminRankings();
    renderPublicNextAndStandings();
    populateReportMatchSelect();
  };

  const submitScoreBtn = document.getElementById('submitScoreBtn');
  if (submitScoreBtn) submitScoreBtn.onclick = () => {
    const id = tSelect ? tSelect.value : '';
    const matchId = reportMatchSelect ? reportMatchSelect.value : '';
    const a = Number(teamAInput && teamAInput.value ? teamAInput.value : '');
    const b = Number(teamBInput && teamBInput.value ? teamBInput.value : '');
    const who = reporterTeamInput && reporterTeamInput.value ? reporterTeamInput.value.trim() : '';

    if (!id || !matchId || Number.isNaN(a) || Number.isNaN(b) || a < 0 || b < 0) {
      if (reportStatus) reportStatus.textContent = 'Complete all fields to submit a score.';
      return;
    }

    const res = TournamentManager.submitScoreDualEntry(id, matchId, who, a, b);
    if (reportStatus) reportStatus.textContent = res.message;

    renderAdminRankings();
    renderPublicNextAndStandings();
    populateReportMatchSelect();

    if (teamAInput) teamAInput.value = '';
    if (teamBInput) teamBInput.value = '';
    if (reporterTeamInput) reporterTeamInput.value = '';
  };

  if (tSelect) tSelect.onchange = () => {
    renderAdminRankings();
    renderPublicNextAndStandings();
    populateReportMatchSelect();
  };

  if (closeBtn) closeBtn.onclick = () => {
    showTournamentView(false);
  };

  refreshTournamentSelect();
  renderAdminRankings();
  renderPublicNextAndStandings();
  populateReportMatchSelect();
}


// -----------------------------------------------------------------------------
// UI Helpers
// Keep exactly ONE copy of this
function closeAllMenus() {
  document.querySelectorAll('.menu-wrap').forEach(w => w.classList.remove('menu-open'));
  document.querySelectorAll('.btn-actions').forEach(b => b.setAttribute('aria-expanded', 'false'));
}

function bindPlayerRowHandlers() {
  // Intentionally a no-op.
  // Menu interactions are delegated globally and do not require per-render rebinding.
}

function bindSelectionHandlers() {
  // Intentionally a no-op.
  // Selection interactions are delegated globally and do not require per-render rebinding.
}

(function ensureSelectionDelegationBound() {
  if (window.__selectionDelegated) return;
  window.__selectionDelegated = true;

  const nonToggleSelector = [
    'button',
    'a',
    'input',
    'select',
    'textarea',
    'label',
    '.menu-wrap',
    '.card-menu',
    '.edit-row',
    '.group-select',
    '.group-list',
    '.group-item'
  ].join(',');

  document.addEventListener('change', (e) => {
    const checkbox = e.target.closest('.player-select');
    if (!checkbox) return;

    const id = String(checkbox.getAttribute('data-id') || '');
    if (!id) return;

    const set = selectedSet();
    if (checkbox.checked) set.add(id); else set.delete(id);
    state.selectedIds = Array.from(set);
    const card = checkbox.closest('.player-card');
    if (card) card.classList.toggle('is-selected', checkbox.checked);
    updateBulkBarVisibility();
  });

  document.addEventListener('click', (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;

    const card = target.closest('.players .player-card');
    if (!card) return;
    if (card.classList.contains('is-editing')) return;
    if (target.closest(nonToggleSelector)) return;

    const selectedText = typeof window.getSelection === 'function'
      ? String(window.getSelection() || '').trim()
      : '';
    if (selectedText) return;

    const checkbox = card.querySelector('.player-select');
    if (!checkbox) return;
    checkbox.checked = !checkbox.checked;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
  });
})();
// Render the entire application into the root element. Each call replaces
// existing content to reflect the current state. Event handlers are
// attached inline within this function. To minimize reflows, we build
// strings for larger sections and assign innerHTML.
function render() {
  const root = document.getElementById('root');
  if (!root) return;

  // Helper to escape text for safe insertion into HTML
  const escapeHTML = (str) => str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const normalizedActiveGroup = normalizeActiveGroupSelection(state.activeGroup || 'All');
  const activeGroupLabel = normalizedActiveGroup === UNGROUPED_FILTER_VALUE ? UNGROUPED_FILTER_LABEL : (normalizedActiveGroup || 'All');
  const isActiveGroupValue = (value) => normalizeActiveGroupSelection(value || 'All') === normalizedActiveGroup;
  const topFormGroupOptions = getTopFormGroupDatalistOptions();
  const topFormContext = renderTopFormGroupsHelpAndPreview('', '');
  const isCardCollapsed = (cardId) => !!(state.collapsedCards && state.collapsedCards[cardId]);
  const renderCardCollapseToggle = (cardId, bodyId) => {
    const collapsed = isCardCollapsed(cardId);
    return `
      <button
        type="button"
        class="secondary card-collapse-toggle"
        data-role="toggle-card-collapse"
        data-card-id="${escapeHTML(cardId)}"
        aria-controls="${escapeHTML(bodyId)}"
        aria-expanded="${collapsed ? 'false' : 'true'}"
      >${collapsed ? 'Expand' : 'Collapse'}</button>
    `;
  };

  // Build registration and check‑in messages
  const regMsg = messages.registration ? `<p class="msg">${escapeHTML(messages.registration)}</p>` : '';
  const checkMsg = messages.checkIn ? `<p class="msg">${escapeHTML(messages.checkIn)}</p>` : '';

  // Build player list HTML. Include delete buttons for admin users only.
  let playersHTML = '';
  if (state.players.length === 0) {
    playersHTML = '<p>No players yet.</p>';
  } else {
  }

  // Build generated teams HTML
  let teamsHTML = '';
  let teamsFairnessHTML = '';
  let liveMatchupsHTML = '';
  if (state.generatedTeams.length > 0) {
    if (state.generatedTeamsSummary) {
      teamsFairnessHTML = `
        <p class="small" style="margin:0.25rem 0 0.5rem;">
          Fairness spread: <strong>${state.generatedTeamsSummary.skillSpread.toFixed(1)}</strong>
          | Team size spread: <strong>${state.generatedTeamsSummary.countSpread}</strong>
          | Candidate runs: <strong>${state.generatedTeamsSummary.attempts}</strong>
        </p>
      `;
    }

    const normalizedCourtOrder = normalizeLiveCourtOrder(state.liveCourtOrder, state.generatedTeams.length);
    state.liveCourtOrder = normalizedCourtOrder;
    const liveMatchups = deriveLiveTeamMatchupsFromOrder(normalizedCourtOrder);
    const resultsByMatch = normalizeLiveMatchResults(state.liveMatchResults, liveMatchups.matchups);
    state.liveMatchResults = resultsByMatch;
    const snapshotsByMatch = normalizeLiveMatchSkillSnapshots(state.liveMatchSkillSnapshots, resultsByMatch);
    state.liveMatchSkillSnapshots = snapshotsByMatch;
    const matchupRows = liveMatchups.matchups.map((match, idx) => {
      const matchKey = liveMatchupKey(match.teamA, match.teamB);
      const winner = Number(resultsByMatch[matchKey]) || 0;
      const loser = winner === match.teamA ? match.teamB : (winner === match.teamB ? match.teamA : 0);
      const teamASize = Array.isArray(state.generatedTeams[match.teamA - 1]) ? state.generatedTeams[match.teamA - 1].length : 0;
      const teamBSize = Array.isArray(state.generatedTeams[match.teamB - 1]) ? state.generatedTeams[match.teamB - 1].length : 0;
      return `
      <article class="live-net-card">
        <div class="live-net-header">
          <span class="live-net-label">Net ${idx + 1}</span>
          <span class="small live-net-match-label">Team ${match.teamA} vs Team ${match.teamB}</span>
        </div>
        <div class="live-net-court" role="group" aria-label="Net ${idx + 1} teams">
          <div class="live-net-team">
            <strong>Team ${match.teamA}</strong>
            <span class="small live-net-team-size">Team of ${teamASize}</span>
          </div>
          <div class="live-net-divider" aria-hidden="true">NET</div>
          <div class="live-net-team">
            <strong>Team ${match.teamB}</strong>
            <span class="small live-net-team-size">Team of ${teamBSize}</span>
          </div>
        </div>
        <div class="live-matchup-actions">
          <button
            type="button"
            class="live-matchup-result-btn ${winner === match.teamA ? 'is-selected' : ''}"
            data-role="report-live-match-result"
            data-match-key="${matchKey}"
            data-winner-team="${match.teamA}"
          >Team ${match.teamA} Won</button>
          <button
            type="button"
            class="live-matchup-result-btn ${winner === match.teamB ? 'is-selected' : ''}"
            data-role="report-live-match-result"
            data-match-key="${matchKey}"
            data-winner-team="${match.teamB}"
          >Team ${match.teamB} Won</button>
          ${winner ? `
          <button
            type="button"
            class="live-matchup-clear-btn"
            data-role="clear-live-match-result"
            data-match-key="${matchKey}"
          >Clear Result</button>` : ''}
        </div>
        ${winner ? `<div class="small live-matchup-result">Recorded: Team ${winner} defeated Team ${loser}</div>` : ''}
      </article>
    `;
    }).join('');
    const waitingLabel = liveMatchups.waitingTeams.map((teamNo) => `Team ${teamNo}`).join(', ');
    liveMatchupsHTML = `
      <div class="live-matchups-board">
        <h4>Live Nets</h4>
        <div class="live-nets-grid">
          ${matchupRows || '<p class="small live-matchups-empty">No pairings available.</p>'}
        </div>
        ${waitingLabel ? `<p class="small live-matchups-waiting"><strong>Waiting Off Court:</strong> ${waitingLabel}</p>` : ''}
      </div>
    `;

    teamsHTML = '<div class="teams">' + state.generatedTeams.map((team, i) => {
      const members = team.map((p, memberIndex) => {
        const playerKey = playerIdentityKey(p) || `temp:${i}:${memberIndex}`;
        return `
          <li
            class="team-player-card"
            draggable="true"
            data-team-index="${i}"
            data-player-key="${escapeHTML(playerKey)}"
            title="Drag to move to another team"
          >
            <span class="name">${escapeHTML(p.name)}</span>
            <span class="small">${escapeHTML(String(Number(p.skill) || 0))}</span>
          </li>
        `;
      }).join('');
      const totalSkill = team.reduce((sum, p) => sum + (Number(p.skill) || 0), 0).toFixed(1);
      return `
  <div class="team generated-team" data-team-index="${i}">
    <h4>Team ${i + 1} <span class="small" style="font-weight:normal;">(Total: ${totalSkill})</span></h4>
    <ul class="team-player-list">${members || '<li class="team-drop-empty small">Drop here</li>'}</ul>
  </div>
`;
    }).join('') + '</div>';
  }

  // Admin panel HTML, only visible when state.isAdmin is true.
  // Layout: logout at top, admin controls, then player list at the bottom.
  const adminHTML = state.isAdmin ? `
    <div>
      <div class="card admin-header">
        <h2>Admin Dashboard</h2>
        <div class="admin-header-actions">
          <button id="btn-reset-checkins" class="danger">Reset Check‑ins</button>
          <button id="btn-logout">Logout</button>
        </div>
      </div>
     <div class="card card-generate-teams">
  <div class="card-collapsible-head">
    <h3>Generate Teams</h3>
    <div class="card-collapsible-head-actions">
      ${renderCardCollapseToggle('admin-generate-teams', 'card-body-admin-generate-teams')}
    </div>
  </div>
  <div id="card-body-admin-generate-teams" class="card-collapse-body ${isCardCollapsed('admin-generate-teams') ? 'is-collapsed' : ''}">
  <p class="small generate-teams-summary">
    Teams of 6: <strong>${Math.floor(state.checkedIn.length / 6)}</strong> |
    Teams of 4: <strong>${Math.floor(state.checkedIn.length / 4)}</strong> |
    Teams of 2: <strong>${Math.floor(state.checkedIn.length / 2)}</strong>
  </p>
  <div class="row generate-teams-controls">
    <label class="generate-teams-count">
      Teams:
      <input type="number" id="group-count" min="2" value="${escapeHTML(String(state.groupCount))}" />
    </label>
    <button id="btn-generate-teams">Generate</button>
  </div>
  ${teamsFairnessHTML}
  ${liveMatchupsHTML}
  ${teamsHTML}
  </div>
</div>
<div class="card card-players">
  <div class="card-collapsible-head">
    <h3>Players${normalizedActiveGroup !== 'All' ? ` <span class="small" style="font-weight:500;">(${escapeHTML(activeGroupLabel)} Roster)</span>` : ''}</h3>
    <div class="card-collapsible-head-actions">
      <button id="btn-select-all-visible" class="secondary">Select All Shown</button>
      ${renderCardCollapseToggle('admin-players', 'card-body-admin-players')}
    </div>
  </div>
  <div id="card-body-admin-players" class="card-collapse-body ${isCardCollapsed('admin-players') ? 'is-collapsed' : ''}">
  <div class="card-add-player">
    <div class="card-collapsible-head">
      <h3>Add/Update Player</h3>
      <div class="card-collapsible-head-actions">
        ${renderCardCollapseToggle('admin-add-player', 'card-body-admin-add-player')}
      </div>
    </div>
    <div id="card-body-admin-add-player" class="card-collapse-body ${isCardCollapsed('admin-add-player') ? 'is-collapsed' : ''}">
    <div class="row admin-player-form-row">
      <input type="text" id="admin-player-name" placeholder="Name" />
      <input type="number" id="admin-player-skill" placeholder="Skill" step="0.1" />
      <div class="admin-player-groups-field">
        <input
          type="text"
          id="admin-player-groups"
          list="admin-player-groups-options"
          placeholder="Groups (comma separated)"
          autocomplete="off"
          spellcheck="false"
          aria-describedby="admin-player-groups-help"
        />
        <datalist id="admin-player-groups-options">
          ${topFormGroupOptions.map((groupName) => `<option value="${escapeHTML(groupName)}"></option>`).join('')}
        </datalist>
        <div id="admin-player-groups-help" class="small admin-player-groups-help">
          ${escapeHTML(topFormContext.helpText)}
        </div>
        <div id="admin-player-groups-preview" class="admin-player-groups-preview">${topFormContext.previewHTML}</div>
      </div>
      <button id="btn-save-player" class="admin-player-save-btn">Save</button>
    </div>
    </div>
  </div>
  <!-- Collapsible body: put ALL your filter controls INSIDE this div -->
  <div id="filtersBody">
    <h4 style="margin-bottom: 0.5rem;">Filters</h4>

    <!-- Filter select (All / In / Out / Skill / Unset) -->
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

    <!-- Group filter + group management -->
   ${state.limitedGroup
  ? `
    <div class="row" style="margin-top: 0.5rem;">
      <label>Group:</label>
      <span class="badge" id="tenant-group-pill" style="font-weight:600;">${state.limitedGroup}</span>
    </div>
  `
  : `
  <div class="row" style="margin-top: 0.5rem; align-items:center;">
    <label for="group-filter-select">Group:</label>
    <select id="group-filter-select">
      <option value="All" ${isActiveGroupValue('All') ? 'selected' : ''}>All</option>
      ${getAvailableGroups().map((groupName) => `<option value="${escapeHTML(groupName)}" ${isActiveGroupValue(groupName) ? 'selected' : ''}>${escapeHTML(groupName)}</option>`).join('')}
      <option value="${UNGROUPED_FILTER_VALUE}" ${isActiveGroupValue(UNGROUPED_FILTER_VALUE) ? 'selected' : ''}>${UNGROUPED_FILTER_LABEL}</option>
    </select>

    <button id="btn-open-group-manager" class="secondary">Manage Groups</button>
  </div>

  <!-- lightweight modal -->
  <div id="groupManager" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,.35); z-index:10000;">
    <div style="max-width:720px; margin:6vh auto; background:#fff; border-radius:12px; box-shadow:0 12px 32px rgba(0,0,0,.18); overflow:hidden;">
      <div style="display:flex; align-items:center; padding:12px 16px; background:#f8fafc;">
        <h3 style="margin:0; font-size:18px;">Manage Groups</h3>
        <span style="flex:1"></span>
        <button id="btn-close-group-manager" class="secondary">Close</button>
      </div>

      <div style="padding:16px;">
        <!-- add -->
        <div class="card" style="padding:12px; margin-bottom:12px;">
          <div class="row">
            <input type="text" id="gm-new-name" placeholder="New group name" />
            <button id="gm-add" class="primary">Add Group</button>
          </div>
        </div>
        <!-- list -->
        <div class="card" style="padding:12px;">
          <table class="table" style="width:100%;">
            <thead>
              <tr><th style="text-align:left;">Group</th><th>Checked In</th><th>Total</th><th style="width:160px;">Actions</th></tr>
            </thead>
            <tbody id="gm-rows"></tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
`
}
    <!-- Skill range sub-filter (only when Filter = Skill) -->
    ${state.playerTab === 'skill' ? `
      <div class="row" style="margin-top: 0.5rem;">
        <label for="skill-subtab-select">Skill Range:</label>
        <select id="skill-subtab-select">
          ${Array.from({ length: 9 }, (_, i) => {
            const base = `${i + 1}.0`;
            const selected = state.skillSubTab === base ? 'selected' : '';
            const label = base === '9.0' ? '9.0–10' : `${base}–${i + 1}.9`;
            return `<option value="${base}" ${selected}>${label}</option>`;
          }).join('')}
        </select>
      </div>
    ` : ''}

    <!-- Search -->
    <div id="player-search-container" style="position:relative; display:inline-block; width:100%; max-width:400px; margin:0.5rem 0;">
      <input
        type="text"
        id="player-search"
        placeholder="Search name or tag"
        value="${escapeHTML(state.searchTerm || '')}"
        style="padding: 0.5rem 2rem 0.5rem 0.5rem; width: 100%;"
      />
      <span
        id="player-search-clear"
        style="position:absolute; right:8px; top:50%; transform:translateY(-50%); cursor:pointer; user-select:none; ${state.searchTerm ? '' : 'display:none;'}"
      >✕</span>
    </div>
  </div> <!-- /#filtersBody -->

  <!-- Sticky Bulk Bar (shows only when you select players) -->
  <div id="bulkBar" class="card" style="display:none; position:sticky; bottom:0; z-index:5;">
    <div class="row">
      <strong id="bulkCount">0 selected</strong>
      <span style="flex:1"></span>

      <button id="btn-bulk-checkin" class="secondary">Check In</button>
      <button id="btn-bulk-checkout" class="secondary">Check Out</button>

      <label for="bulk-dest-group">Group:</label>
      <select id="bulk-dest-group" ${state.limitedGroup ? 'disabled' : ''}>
  <option value="">— choose —</option>
  ${getAvailableGroups().map(g => `<option value="${g}">${g}</option>`).join('')}
</select>
      <button id="btn-assign-to-group" class="primary">Add</button>
      <button id="btn-remove-from-group" class="danger">Remove</button>
      <button id="btn-clear-selection" class="secondary">Clear</button>
    </div>
  </div>

  <!-- Filtered Player Cards -->
  <div class="players">
    ${renderFilteredPlayers()}
  </div>
  </div>
</div>
</div>
  ` : '';

  // Build the final page markup
  const adminLoginHTML = !state.isAdmin ? `
    <div class="card">
      <h2>Admin Login <span class="app-version-pill">v${APP_VERSION}</span></h2>
      <div class="row">
        <input type="password" id="admin-code" placeholder="Enter admin code" />
        <button id="btn-admin-login">Login</button>
      </div>
    </div>
  ` : '';

  // Build final page markup. Hide full players list on public side. The list is only shown in admin panel.
  const html = `
    <div class="container">
<h1 class="title">${state.limitedGroup ? state.limitedGroup : 'Athletic Specimen'} <span class="app-version-inline">v${APP_VERSION}</span></h1>

<p class="small" style="text-align:center; margin-bottom:0.25rem;">
  Checked In: <strong>${state.checkedIn.length}</strong>
  ${state.isAdmin && !state.limitedGroup ? ` • Group: <strong>${activeGroupLabel}</strong>` : ''}
</p>

${state.isAdmin && !state.limitedGroup ? `
  <div style="text-align:center; font-size:0.9rem; margin-top:0.25rem;">
    <table style="margin:0 auto; border-collapse:collapse; font-size:inherit;">
      <thead>
        <tr>
          <th style="padding:2px 8px; border-bottom:1px solid #ccc;">Group</th>
          <th style="padding:2px 8px; border-bottom:1px solid #ccc;">Checked In</th>
          <th style="padding:2px 8px; border-bottom:1px solid #ccc;">Total Players</th>
        </tr>
      </thead>
      <tbody>
        ${computeCheckedInByGroup().map((row) => {
          return `
          <tr>
            <td style="padding:2px 8px;">${escapeHTML(row.groupLabel)}</td>
            <td style="padding:2px 8px;">${row.in}</td>
            <td style="padding:2px 8px;">${row.total}</td>
          </tr>
        `;
        }).join('')}
      </tbody>
    </table>
  </div>
` : ''}
      ${adminLoginHTML}
  <div class="grid-2">
  <div class="card card-checkin">
    <div class="card-collapsible-head">
      <h2>Check In</h2>
      <div class="card-collapsible-head-actions">
        ${renderCardCollapseToggle('public-checkin', 'card-body-public-checkin')}
      </div>
    </div>
    <div id="card-body-public-checkin" class="card-collapse-body ${isCardCollapsed('public-checkin') ? 'is-collapsed' : ''}">
    <input type="text" id="check-name" placeholder="First and Last Name" />
    <div class="row checkin-actions">
      <button id="btn-check-in">Check In</button>
      <button id="btn-check-out">Check Out</button>
    </div>
    ${checkMsg}
    </div>
  </div>

  ${!state.isAdmin ? `
  <div class="card card-register">
    <div class="card-collapsible-head">
      <h2>Register Player</h2>
      <div class="card-collapsible-head-actions">
        ${renderCardCollapseToggle('public-register', 'card-body-public-register')}
      </div>
    </div>
    <div id="card-body-public-register" class="card-collapse-body ${isCardCollapsed('public-register') ? 'is-collapsed' : ''}">
    <input type="text" id="register-name" placeholder="First and Last Name" />
    <button id="btn-register">Register</button>
    ${regMsg}
    </div>
  </div>
  ` : ``}
</div>
      ${adminHTML}
    </div>
  `;

  // Strip any trailing stray ']' that might have slipped into the template
const sanitized = html.replace(/\n?\]\s*$/, '');
root.innerHTML = sanitized;

// ---- dropdown menu CSS (keep ONLY this block) ----
let menuStyle = document.getElementById('menu-css');
const cssText = `
/* ---------------- Player card menu styling ---------------- */

.player-card {
  position: relative;
  overflow: visible;
  padding-top: 36px; /* space for the menu */
  border-radius: 8px;
  background: #f9fafb;
}

.player-card .menu-wrap {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 50;
}

.btn-actions {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 700;
  line-height: 1;
  color: #2563eb;
  background: #e0e7ff;
  border: none;
  border-radius: 8px;
  width: 32px;
  height: 32px;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0,0,0,0.08);
  transition: background 0.2s ease, transform 0.1s ease;
}
.btn-actions:hover {
  background: #c7d2fe;
  transform: translateY(-1px);
}

/* Dropdown box */
.card-menu {
  display: none;
  position: absolute;
  right: 0;
  top: 38px;
  min-width: 150px;
  background: #ffffff;
  border: 1px solid rgba(0,0,0,0.12);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  padding: 4px 0;
  z-index: 1000;
}

/* Open state */
.menu-wrap.menu-open .card-menu {
  display: block;
}

/* Menu item buttons */
.menu-item {
  display: block;
  width: 100%;
  padding: 10px 14px;
  background: transparent;
  border: none;
  text-align: left;
  font-size: 15px;
  color: #111827;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.menu-item:hover {
  background: #eff6ff;
  color: #2563eb;
}

.menu-item.danger {
  color: #dc2626;
  font-weight: 600;
}
.menu-item.danger:hover {
  background: #fee2e2;
  color: #b91c1c;
}

/* Make sure dropdown appears above everything */
.menu-wrap, .card-menu, .btn-actions {
  z-index: 10000;
}
  /* ensure clicks land on the menu */
.card-menu, .menu-item, .btn-actions { pointer-events: auto; z-index: 10000; }
/* prevent any ancestor overlay from eating clicks */
.player-card .menu-wrap { pointer-events: auto; }

/* --- Dropdown 'Delete' should NOT look like a big red button --- */
.card-menu .menu-item.danger {
  background: transparent !important;
  color: #dc2626 !important;
  font-weight: 600;
  border-radius: 8px;
}
.card-menu .menu-item.danger:hover {
  background: #fee2e2 !important;
  color: #b91c1c !important;
}
`;

if (!menuStyle) {
  menuStyle = document.createElement('style');
  menuStyle.id = 'menu-css';
  menuStyle.type = 'text/css';
  document.head.appendChild(menuStyle);
}
if (menuStyle.textContent !== cssText) {
  menuStyle.textContent = cssText;
}

let editStyle = document.getElementById('edit-css');
const editCss = `
/* --- Keep player cards compact, ignore any global min-height --- */
.players .player-card { min-height: auto !important; }
.players .player-card .row { min-height: 0 !important; }
.player-card.is-editing{
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.22);
  background: #f8fffc;
}
.player-card.is-editing .card-actions{
  display:none;
}

/* ----- Compact inline edit row (grid) ----- */
.player-card .edit-row{
  display:none !important;
  grid-template-columns: minmax(220px, 1fr) 90px minmax(220px, 1fr) auto; /* name | skill | groups | actions */
  align-items:start;
  gap:8px;
  margin-top:8px;
  padding:8px;
  border-radius:8px;
  background:#f8fafc;            /* subtle background so it reads as an editor */
  box-shadow: inset 0 0 0 1px rgba(0,0,0,0.04);
}
.player-card .edit-row.show{
  display:grid !important;
}

/* Inputs: kill any giant/global styles */
.player-card .edit-row input{
  box-sizing:border-box;
  height:36px !important;
  line-height:1.2;
  padding:6px 10px;
  border-radius:6px;
  border:1px solid #d1d5db;
  background:#fff;
  max-width:unset;
  width:100%;
  appearance:textfield;
}

/* Per-field sizing still feels right */
.player-card .edit-row .edit-name{ min-width:220px; }
.player-card .edit-row .edit-skill{ width:90px; text-align:right; }
.player-card .edit-row .group-select{ width:100%; }
.player-card .edit-row .group-btn{
  width:100%;
  height:36px !important;
  border:1px solid #d1d5db;
  border-radius:6px;
  background:#fff;
  text-align:left;
  padding:0 10px;
  color:#111827;
}
.player-card .edit-row .group-list{
  max-height:220px;
  overflow:auto;
}
.player-card .edit-row .group-list .group-item.is-member{
  font-weight:600;
}
.player-card .edit-row .group-list .group-item.is-primary{
  color:#065f46;
}
.player-card .edit-row .group-chips{
  display:flex;
  flex-wrap:wrap;
  gap:6px;
  margin-top:6px;
}
.player-card .edit-row .group-chip{
  display:inline-flex;
  align-items:center;
  gap:4px;
  border:1px solid #d1d5db;
  background:#fff;
  border-radius:999px;
  padding:2px 6px;
}
.player-card .edit-row .group-chip.is-primary{
  border-color:#86efac;
  background:#f0fdf4;
}
.player-card .edit-row .group-chip-label{
  border:none;
  background:transparent;
  color:#111827;
  cursor:pointer;
  font-size:12px;
  line-height:1.2;
  padding:0;
}
.player-card .edit-row .group-chip-remove{
  border:none;
  background:transparent;
  color:#b91c1c;
  cursor:pointer;
  font-size:14px;
  line-height:1;
  padding:0 2px;
}
.player-card .edit-row .group-chip-empty{
  color:#64748b;
}

.player-card .edit-row .edit-actions{
  display:flex;
  align-items:center;
  gap:8px;
  justify-self:end;
}

/* Action buttons align with inputs and stay compact */
.player-card .edit-row .btn-save-edit,
.player-card .edit-row .btn-cancel-edit{
  height:36px !important;
  padding:0 12px;
  border-radius:6px;
}
.player-card .edit-row .btn-cancel-edit{
  border:1px solid #d1d5db;
  background:#fff;
  color:#111827;
}

/* Don't let any nested .row inside the edit area expand vertically */
.player-card .edit-row .row{ min-height:0 !important; }
@media (max-width:640px){
  .player-card .edit-row.show{
    grid-template-columns:1fr;
  }
  .player-card .edit-row .edit-actions{
    justify-self:stretch;
    width:100%;
  }
  .player-card .edit-row .btn-save-edit,
  .player-card .edit-row .btn-cancel-edit{
    width:100%;
  }
}
`;
if (!editStyle) {
  editStyle = document.createElement('style');
  editStyle.id = 'edit-css';
  editStyle.type = 'text/css';
  document.head.appendChild(editStyle);
}
if (editStyle.textContent !== editCss) {
  editStyle.textContent = editCss;
}

// at the end of render()
attachHandlers();
bindTournamentTab();
bindPlayerRowHandlers();
bindSelectionHandlers();
updateBulkBarVisibility();
}

// Attach event listeners to the current DOM. This function should be
// called after each call to render().
function attachHandlers() {
  // --- Group controls (Admin Players) ---
const groupSelect = document.getElementById('group-filter-select');
if (groupSelect) {
  groupSelect.addEventListener('change', () => {
    if (state.limitedGroup) {
      // enforce lock
      state.activeGroup = state.limitedGroup;
      groupSelect.value = state.limitedGroup;
      return;
    }
    state.activeGroup = normalizeActiveGroupSelection(groupSelect.value || 'All');
    saveLocal();
    render();
  });
}

const adminNameInput = document.getElementById('admin-player-name');
const adminGroupsInput = document.getElementById('admin-player-groups');
const adminGroupsHelp = document.getElementById('admin-player-groups-help');
const adminGroupsPreview = document.getElementById('admin-player-groups-preview');
if (adminGroupsInput && adminGroupsPreview) {
  const syncTopFormGroupContext = () => {
    const mode = renderTopFormGroupsHelpAndPreview(adminNameInput?.value || '', adminGroupsInput.value || '');
    adminGroupsPreview.innerHTML = mode.previewHTML;
    if (adminGroupsHelp) adminGroupsHelp.textContent = mode.helpText;
  };
  adminGroupsInput.addEventListener('input', syncTopFormGroupContext);
  if (adminNameInput) adminNameInput.addEventListener('input', syncTopFormGroupContext);
  adminGroupsInput.addEventListener('blur', () => {
    const normalized = parseAdminGroupsInput(adminGroupsInput.value || '');
    adminGroupsInput.value = normalized.join(', ');
    syncTopFormGroupContext();
  });
  syncTopFormGroupContext();
}

// ----- Group Manager (master admin) -----
const gmOpen  = document.getElementById('btn-open-group-manager');
const gmRoot  = document.getElementById('groupManager');

function gmPopulate() {
  if (!gmRoot) return;

  // Build a canonical group list (exclude "All")
  const known = new Set(state.groups.filter(g => g && g !== 'All'));
  // Include any groups that might exist on players but not in state.groups
  state.players.forEach(p => {
    getPlayerGroups(p).forEach((g) => known.add(g));
  });
  const list = Array.from(known).sort((a,b)=>a.localeCompare(b));

  // Fill rows with counts + actions
  const byGroup = computeCheckedInByGroup();
  const totals = Object.fromEntries(byGroup.map(r => [r.groupKey, r.total]));
  const ins    = Object.fromEntries(byGroup.map(r => [r.groupKey, r.in]));

  const rowsEl = gmRoot.querySelector('#gm-rows');
  if (rowsEl) {
    rowsEl.innerHTML = list.map(g => `
      <tr data-group="${g}">
        <td><strong>${g}</strong></td>
        <td style="text-align:center;">${ins[g] || 0}</td>
        <td style="text-align:center;">${totals[g] || 0}</td>
        <td>
          <div class="row" style="gap:6px; justify-content:flex-end;">
            <button class="gm-rename secondary" data-group="${g}">Rename</button>
            <button class="gm-delete danger" data-group="${g}">Delete</button>
          </div>
        </td>
      </tr>
    `).join('');
  }
}

if (gmOpen && gmRoot) {
  gmOpen.addEventListener('click', () => {
    gmPopulate();
    gmRoot.style.display = 'block';
  });
  const gmClose = gmRoot.querySelector('#btn-close-group-manager');
  if (gmClose) gmClose.addEventListener('click', () => gmRoot.style.display = 'none');

  // Add
  const gmAdd = gmRoot.querySelector('#gm-add');
  if (gmAdd) gmAdd.addEventListener('click', () => {
    const input = gmRoot.querySelector('#gm-new-name');
    const name  = (input && input.value || '').trim();
    if (!name) return;
    if (!state.groups.includes(name)) {
      state.groups = Array.from(new Set([...state.groups, name]));
    }
    state.activeGroup = name;
    saveLocal();
    render();
    gmPopulate();
    if (supabaseClient) {
      (async () => {
        const synced = await ensureGroupCatalogEntrySupabase(name);
        if (synced) queueSupabaseRefresh();
      })();
    }
    if (input) input.value = '';
  });

  // Row actions (rename/delete)
  gmRoot.addEventListener('click', async (e) => {
    const renameBtn = e.target.closest('.gm-rename');
    const deleteBtn = e.target.closest('.gm-delete');

    // Rename
    if (renameBtn) {
      const oldName = renameBtn.getAttribute('data-group');
      if (!oldName) return;
      const newName = prompt(`Rename "${oldName}" to:`, oldName);
      if (!newName || newName === oldName) return;

      state.groups  = state.groups.map(g => g === oldName ? newName : g);
      state.players = state.players.map((player) => {
        const memberships = getPlayerGroups(player);
        if (!memberships.includes(oldName)) return player;
        const nextGroups = normalizeGroupList(memberships.map((group) => (group === oldName ? newName : group)));
        return { ...player, group: nextGroups[0] || '', groups: nextGroups };
      });
      if (state.activeGroup === oldName) state.activeGroup = newName;

      try {
        await renameGroupCatalogEntrySupabase(oldName, newName);
        const updates = state.players
          .filter((player) => player.id && getPlayerGroups(player).includes(newName))
          .map((player) => ({
            id: player.id,
            group: getPlayerPrimaryGroup(player),
            groups: getPlayerGroups(player)
          }));
        for (const update of updates) {
          await updatePlayerFieldsSupabase(update.id, { group: update.group, groups: update.groups });
        }
        await syncFromSupabase();
      } catch (e) { console.error('Supabase rename error', e); }

      saveLocal();
      render();
      gmPopulate();
      return;
    }

    // Delete
    if (deleteBtn) {
      const name = deleteBtn.getAttribute('data-group');
      if (!name) return;
      if (!confirm(`Delete "${name}" and remove the group from all players?`)) return;

      state.groups  = state.groups.filter(g => g !== name);
      state.players = state.players.map((player) => {
        const memberships = getPlayerGroups(player);
        if (!memberships.includes(name)) return player;
        const nextGroups = memberships.filter((group) => group !== name);
        return { ...player, group: nextGroups[0] || '', groups: nextGroups };
      });
      if (state.activeGroup === name) state.activeGroup = 'All';

      try {
        await deleteGroupCatalogEntrySupabase(name);
        const updates = state.players
          .filter((player) => player.id)
          .map((player) => ({
            id: player.id,
            group: getPlayerPrimaryGroup(player),
            groups: getPlayerGroups(player)
          }));
        for (const update of updates) {
          await updatePlayerFieldsSupabase(update.id, { group: update.group, groups: update.groups });
        }
        await syncFromSupabase();
      } catch (e) { console.error('Supabase delete group error', e); }

      saveLocal();
      render();
      gmPopulate();
    }
  });
}

  // --- Admin login/logout ---
// Admin login
const loginBtn = document.getElementById('btn-admin-login');
if (loginBtn) {
  loginBtn.addEventListener('click', async () => {
    const codeInput = document.getElementById('admin-code');
    const code = codeInput ? codeInput.value.trim() : '';
    if (!code) return;

    // Master admin: full access
    if (code === MASTER_ADMIN_CODE) {
      state.isAdmin = true;
      state.limitedGroup = null;                 // clear tenant lock
      state.activeGroup = 'All';                 // show everyone
      sessionStorage.setItem(LS_ADMIN_KEY, 'true');
      sessionStorage.removeItem(LS_LIMITED_GROUP_KEY);
      try { localStorage.setItem(LS_ACTIVE_GROUP_KEY, 'All'); } catch {}
      await syncFromSupabase();                  // re-fetch full dataset
      if (state.isAdmin) {
        (async () => {
          const catalogSynced = await backfillGroupCatalogToSupabase();
          const membershipsSynced = await backfillPlayerMembershipsToSupabase();
          if (catalogSynced || membershipsSynced) queueSupabaseRefresh();
        })();
      }
      render();
      return;
    }

    // Tenant admin: lock to one group
    const group = ADMIN_CODE_MAP[code];
    if (group) {
      state.isAdmin = true;
      state.limitedGroup = group;
      if (!state.groups.includes(group)) {
        state.groups = Array.from(new Set([...state.groups, group]));
      }
      state.activeGroup = group;                 // force filter to tenant group
      sessionStorage.setItem(LS_ADMIN_KEY, 'true');
      sessionStorage.setItem(LS_LIMITED_GROUP_KEY, group);
      try { localStorage.setItem(LS_ACTIVE_GROUP_KEY, group); } catch {}
      await syncFromSupabase();                  // re-fetch only that group
      if (state.isAdmin) {
        (async () => {
          const catalogSynced = await backfillGroupCatalogToSupabase();
          const membershipsSynced = await backfillPlayerMembershipsToSupabase();
          if (catalogSynced || membershipsSynced) queueSupabaseRefresh();
        })();
      }
      render();
      return;
    }

    alert('Incorrect admin code');
  });
}

// Admin logout
const logoutBtn = document.getElementById('btn-logout');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    state.isAdmin = false;
    state.limitedGroup = null;                   // clear tenant lock
    state.activeGroup = 'All';                   // reset view
    sessionStorage.removeItem(LS_ADMIN_KEY);
    sessionStorage.removeItem(LS_LIMITED_GROUP_KEY);
    try { localStorage.setItem(LS_ACTIVE_GROUP_KEY, 'All'); } catch {}
    await syncFromSupabase();                    // load public view dataset
    render();
  });
}

  // --- Admin: Save player (add/update) ---
  const savePlayerBtn = document.getElementById('btn-save-player');
  if (savePlayerBtn) {
    savePlayerBtn.addEventListener('click', async () => {
      const nameInput = document.getElementById('admin-player-name');
      const skillInput = document.getElementById('admin-player-skill');
      const groupsInput = document.getElementById('admin-player-groups');
      const name = (nameInput && nameInput.value || '').trim();
      let skill = parseFloat(skillInput && skillInput.value || '');
      const requestedGroups = parseAdminGroupsInput(groupsInput && groupsInput.value || '');
      const applyTopFormGroupRules = (groups, fallbackPrimary = '') => {
        const fallback = normalizeGroupName(fallbackPrimary);
        let next = normalizeGroupList(groups);
        if (!next.length && fallback) next = [fallback];
        if (state.limitedGroup) {
          const locked = normalizeGroupName(state.limitedGroup);
          if (locked) next = normalizeGroupList([locked, ...next.filter((groupName) => groupName !== locked)]);
        }
        return next;
      };
      if (Number.isNaN(skill)) skill = 0; // treat empty input as 0
      if (!name || skill < 0) return;

      const idx = state.players.findIndex((p) => normalize(p.name) === normalize(name));
      const isNew = idx === -1;

      if (idx !== -1) {
        // update existing
        const updated = state.players.slice();
        const previous = updated[idx];
        const nextGroups = applyTopFormGroupRules(
          requestedGroups.length ? requestedGroups : getPlayerGroups(previous)
        );
        const nextPrimary = nextGroups[0] || '';
        updated[idx] = { ...previous, name, skill, group: nextPrimary, groups: nextGroups };
        state.players = updated;

        if (supabaseClient) {
          (async () => {
            try {
              let remoteOK = false;
              if (updated[idx].id) {
                remoteOK = await updatePlayerFieldsSupabase(updated[idx].id, {
                  name,
                  skill,
                  group: nextPrimary,
                  groups: nextGroups
                });
              }
              const catalogOK = await ensureGroupCatalogEntriesSupabase(nextGroups);
              if (remoteOK || catalogOK) queueSupabaseRefresh();
            } catch (err) {
              console.error('Supabase update error', err);
            }
          })();
        }
      } else {
        // insert new
        const activeGroupForInsert = normalizeActiveGroupSelection(state.activeGroup || 'All');
        const defaultPrimary = state.limitedGroup
          ? state.limitedGroup
          : (activeGroupForInsert && activeGroupForInsert !== 'All' && activeGroupForInsert !== UNGROUPED_FILTER_VALUE ? activeGroupForInsert : '');
        const groups = applyTopFormGroupRules(requestedGroups, defaultPrimary);
        const group = groups[0] || '';
        const newPlayer = { name, skill, group, groups };
        const inserted = { ...newPlayer };
        state.players = [...state.players, inserted];

        if (supabaseClient) {
          (async () => {
            try {
              let remoteOK = false;
              const encodedGroupsTag = serializePlayerGroupsTag(groups, group);
              try {
                const insertRow = HAS_TAG
                  ? { name, skill, group, tag: encodedGroupsTag }
                  : { name, skill, group };
                const { data } = await supabaseClient.from('players').insert([insertRow]).select();
                remoteOK = true;
                if (Array.isArray(data) && data.length > 0) inserted.id = data[0].id;
              } catch {
                try {
                  const { data } = await supabaseClient.from('players').insert([{ name, skill, tag: group }]).select();
                  remoteOK = true;
                  if (Array.isArray(data) && data.length > 0) inserted.id = data[0].id;
                } catch {
                  // 3rd fallback: table has neither 'group' nor 'tag'
                  const { data } = await supabaseClient.from('players').insert([{ name, skill }]).select();
                  remoteOK = true;
                  if (Array.isArray(data) && data.length > 0) inserted.id = data[0].id;
                }
              }
              const catalogOK = await ensureGroupCatalogEntriesSupabase(groups);
              if (remoteOK || catalogOK) queueSupabaseRefresh();
            } catch (err) {
              console.error('Supabase insert error', err);
            }
          })();
        }
      }

      if (nameInput) nameInput.value = '';
      if (skillInput) skillInput.value = '';
      if (groupsInput) groupsInput.value = '';
      saveLocal();
      queueSaveToSupabase();
      // Small floating toast like public registration
      try {
        const toast = document.createElement('div');
        toast.textContent = isNew ? 'Player added' : 'Player updated';
        toast.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:#111;color:#fff;padding:8px 12px;border-radius:8px;z-index:10000;font-size:14px;';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 1200);
      } catch {}

      render();
    });
  }

  // --- Public: Check in/out ---
  const checkInBtn = document.getElementById('btn-check-in');
  if (checkInBtn) {
    checkInBtn.addEventListener('click', () => {
      const input = document.getElementById('check-name');
      const name = (input && input.value || '').trim();
      if (!name) return;

      const player = state.players.find((p) => normalize(p.name) === normalize(name));
      if (player) {
        const changed = checkInPlayer(player);
        if (changed) {
          if (supabaseClient && player.id) {
            (async () => {
              try {
                await supabaseClient.from('players').update({ checked_in: true }).eq('id', player.id);
                queueSupabaseRefresh();
              } catch (err) {
                console.error('Supabase update error', err);
              }
            })();
          }
          messages.checkIn = 'You are checked in';
        } else {
          messages.checkIn = 'You are already checked in.';
        }
      } else {
        messages.checkIn = 'Player not found in history';
      }

      setTimeout(() => { messages.checkIn = ''; render(); }, 3000);
      if (input) input.value = '';
      saveLocal();
      queueSaveToSupabase();
      render();
    });
  }

  const checkOutBtn = document.getElementById('btn-check-out');
  if (checkOutBtn) {
    checkOutBtn.addEventListener('click', () => {
      const input = document.getElementById('check-name');
      const name = (input && input.value || '').trim();
      if (!name) return;

      const player = state.players.find((p) => normalize(p.name) === normalize(name));
      if (player) {
        if (checkOutPlayer(player)) {
          if (supabaseClient && player.id) {
            (async () => {
              try {
                await supabaseClient.from('players').update({ checked_in: false }).eq('id', player.id);
                queueSupabaseRefresh();
              } catch (err) {
                console.error('Supabase check-out error', err);
              }
            })();
          }
          messages.checkIn = 'You are now checked out.';
        } else {
          messages.checkIn = 'You were not checked in.';
        }
      } else {
        messages.checkIn = 'Player not found.';
      }

      setTimeout(() => { messages.checkIn = ''; render(); }, 3000);
      if (input) input.value = '';
      saveLocal();
      queueSaveToSupabase();
      render();
    });
  }

    // --- Public: Register new player (simple, default skill) ---
    const registerBtn = document.getElementById('btn-register');
    if (registerBtn) {
      registerBtn.addEventListener('click', async () => {
        const input = document.getElementById('register-name');
        const name = (input && input.value || '').trim();
        if (!name) {
          messages.registration = 'Please enter a name';
          setTimeout(() => { messages.registration = ''; render(); }, 2500);
          return render();
        }

        // prevent duplicates by normalized name
        const exists = state.players.find((p) => normalize(p.name) === normalize(name));
        if (exists) {
          messages.registration = 'Player already registered';
          setTimeout(() => { messages.registration = ''; render(); }, 2500);
          if (input) input.value = '';
          return render();
        }

        const activeGroupForRegister = normalizeActiveGroupSelection(state.activeGroup || 'All');
        const group = state.limitedGroup
          ? state.limitedGroup
          : (activeGroupForRegister && activeGroupForRegister !== 'All' && activeGroupForRegister !== UNGROUPED_FILTER_VALUE ? activeGroupForRegister : '');
        const groups = group ? [group] : [];
        const skill = 0.0;
        const newPlayer = { name, skill, group, groups };
        const inserted = { ...newPlayer };
        state.players = [...state.players, inserted];

        if (supabaseClient) {
          (async () => {
            try {
              let remoteOK = false;
              const encodedGroupsTag = serializePlayerGroupsTag(groups, group);
              try {
                const insertRow = HAS_TAG
                  ? { name, skill, group, tag: encodedGroupsTag }
                  : { name, skill, group };
                const { data } = await supabaseClient.from('players').insert([insertRow]).select();
                remoteOK = true;
                if (Array.isArray(data) && data.length > 0) inserted.id = data[0].id;
              } catch {
                try {
                  const { data } = await supabaseClient.from('players').insert([{ name, skill, tag: group }]).select();
                  remoteOK = true;
                  if (Array.isArray(data) && data.length > 0) inserted.id = data[0].id;
                } catch {
                  const { data } = await supabaseClient.from('players').insert([{ name, skill }]).select();
                  remoteOK = true;
                  if (Array.isArray(data) && data.length > 0) inserted.id = data[0].id;
                }
              }
              const catalogOK = await ensureGroupCatalogEntriesSupabase(group ? [group] : []);
              if (remoteOK || catalogOK) queueSupabaseRefresh();
            } catch (err) {
              console.error('Supabase insert error', err);
            }
          })();
        }

        messages.registration = 'Registered';
        setTimeout(() => { messages.registration = ''; render(); }, 2500);
        if (input) input.value = '';
        saveLocal();
        queueSaveToSupabase();
        render();
      });
    }

  // --- Player cards: inline actions ---
  function attachPlayerRowHandlers() {
    // Intentionally a no-op.
    // Player row actions are delegated globally for lower per-render overhead.
  }
  attachPlayerRowHandlers();

  // --- Reset all checkins ---
  const resetBtn = document.getElementById('btn-reset-checkins');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      state.checkedIn = [];
      saveLocal();
      queueSaveToSupabase();
      render();

      if (supabaseClient) {
        (async () => {
          try {
            await supabaseClient.from('players').update({ checked_in: false }).eq('checked_in', true);
            queueSupabaseRefresh();
          } catch (err) {
            console.error('Supabase reset error', err);
          }
        })();
      }
    });
  }

  // --- Team generator controls ---
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
      const generated = generateBalancedGroups(state.players, state.checkedIn, state.groupCount);
      state.generatedTeams = generated.teams;
      state.generatedTeamsSummary = generated.summary;
      state.liveCourtOrder = defaultLiveCourtOrder(generated.teams.length);
      state.liveMatchResults = {};
      state.liveMatchSkillSnapshots = {};
      saveLocal();
      render();
    });
  }

  document.querySelectorAll('[data-role="report-live-match-result"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const matchKey = String(btn.getAttribute('data-match-key') || '').trim();
      const winnerTeam = Number(btn.getAttribute('data-winner-team'));
      if (!matchKey || !Number.isInteger(winnerTeam)) return;

      const parsed = parseLiveMatchKey(matchKey);
      if (!parsed) return;
      const { teamA, teamB } = parsed;
      if (winnerTeam !== teamA && winnerTeam !== teamB) return;

      const existingResults = state.liveMatchResults || {};
      const existingSnapshots = state.liveMatchSkillSnapshots || {};
      const loserTeam = winnerTeam === teamA ? teamB : teamA;
      const previousWinner = Number(existingResults[matchKey]) || 0;
      if (previousWinner === winnerTeam) return; // prevent duplicate stacking on same result click

      if (previousWinner === teamA || previousWinner === teamB) {
        const restored = restoreLiveMatchSkillSnapshot(existingSnapshots[matchKey]);
        if (!restored) {
          const previousLoser = previousWinner === teamA ? teamB : teamA;
          applySkillDeltaToGeneratedTeam(previousWinner, -0.1);
          applySkillDeltaToGeneratedTeam(previousLoser, +0.1);
        }
      }

      const baselineSnapshot = captureLiveMatchSkillSnapshot(teamA, teamB);
      applySkillDeltaToGeneratedTeam(winnerTeam, +0.1);
      applySkillDeltaToGeneratedTeam(loserTeam, -0.1);

      state.liveMatchResults = {
        ...existingResults,
        [matchKey]: winnerTeam
      };
      state.liveMatchSkillSnapshots = {
        ...existingSnapshots,
        [matchKey]: baselineSnapshot
      };
      const courtsAdvanced = maybeAdvanceLiveCourtsFromResults();
      saveLocal();
      queueSaveToSupabase();
      render();
      if (courtsAdvanced) {
        showTeamMoveToast('Courts advanced. Winners moved left.');
      }
    });
  });

  document.querySelectorAll('[data-role="clear-live-match-result"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const matchKey = String(btn.getAttribute('data-match-key') || '').trim();
      if (!matchKey) return;

      const existingResults = state.liveMatchResults || {};
      if (!Object.prototype.hasOwnProperty.call(existingResults, matchKey)) return;

      const parsed = parseLiveMatchKey(matchKey);
      if (!parsed) return;
      const { teamA, teamB } = parsed;

      const existingSnapshots = state.liveMatchSkillSnapshots || {};
      const previousWinner = Number(existingResults[matchKey]) || 0;
      const restored = restoreLiveMatchSkillSnapshot(existingSnapshots[matchKey]);
      if (previousWinner === teamA || previousWinner === teamB) {
        if (!restored) {
          const previousLoser = previousWinner === teamA ? teamB : teamA;
          applySkillDeltaToGeneratedTeam(previousWinner, -0.1);
          applySkillDeltaToGeneratedTeam(previousLoser, +0.1);
        }
      }

      const nextResults = { ...existingResults };
      delete nextResults[matchKey];
      const nextSnapshots = { ...existingSnapshots };
      delete nextSnapshots[matchKey];
      state.liveMatchResults = nextResults;
      state.liveMatchSkillSnapshots = nextSnapshots;

      saveLocal();
      queueSaveToSupabase();
      render();
    });
  });

  // --- Filters & search ---
  const tabSelect = document.getElementById('player-tab-select');
  if (tabSelect) {
    tabSelect.addEventListener('change', (ev) => {
      state.playerTab = ev.target.value;
      sessionStorage.setItem(LS_TAB_KEY, state.playerTab);
      state.skillSubTab = null;
      render();
    });
  }

  const searchInput = document.getElementById('player-search');
  const clearBtn = document.getElementById('player-search-clear');
  if (searchInput) {
    const toggleClear = () => {
      if (clearBtn) clearBtn.style.display = searchInput.value.trim() ? 'inline' : 'none';
    };
    searchInput.addEventListener('input', () => {
      state.searchTerm = searchInput.value;
      const container = document.querySelector('.players');
      if (container) {
        container.innerHTML = renderFilteredPlayers();
        bindPlayerRowHandlers();
        bindSelectionHandlers();
      }
      toggleClear();
    });
    toggleClear();
  }
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      state.searchTerm = '';
      const si = document.getElementById('player-search');
      if (si) { si.value = ''; si.focus(); }
      const container = document.querySelector('.players');
      if (container) {
        container.innerHTML = renderFilteredPlayers();
        bindPlayerRowHandlers();
        bindSelectionHandlers();
      }
      clearBtn.style.display = 'none';
    });
  }

  const subtabSelect = document.getElementById('skill-subtab-select');
  if (subtabSelect) {
    subtabSelect.addEventListener('change', (ev) => {
      state.skillSubTab = ev.target.value;
      sessionStorage.setItem(LS_SUBTAB_KEY, state.skillSubTab);
      render();
    });
  }

// --- Select all visible ---
// --- Select all visible ---
const selectAllBtn = document.getElementById('btn-select-all-visible');
if (selectAllBtn) {
  selectAllBtn.addEventListener('click', () => {
    const visibleCards = document.querySelectorAll('.players .player-card');
    const ids = Array.from(visibleCards).map(el => String(el.getAttribute('data-id')));

    state.selectedIds = ids;

    visibleCards.forEach(el => el.classList.add('is-selected'));
    document.querySelectorAll('.player-select').forEach(cb => { cb.checked = true; });

    updateBulkBarVisibility(); // ✅ show bulk bar with actions
    document.getElementById('bulkBar')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); // ✅ bring it into view
  });
}

// --- Clear selection ---
const clearSelBtn = document.getElementById('btn-clear-selection');
if (clearSelBtn) {
  clearSelBtn.addEventListener('click', () => {
    state.selectedIds = [];
    document.querySelectorAll('.player-select').forEach(cb => cb.checked = false);
    document.querySelectorAll('.player-card').forEach(el => el.classList.remove('is-selected'));
    updateBulkBarVisibility(); // ✅ hide bar when nothing is selected
  });
}

// --- Bulk check in/out ---
const bulkCheckInBtn = document.getElementById('btn-bulk-checkin');
const bulkCheckOutBtn = document.getElementById('btn-bulk-checkout');
const runBulkAttendanceAction = (shouldCheckIn) => {
  const sel = selectedSet();
  if (!sel.size) return;

  const idSet = new Set(Array.from(sel).map((id) => String(id)));
  const targets = state.players.filter((player) => idSet.has(String(player.id)));
  if (!targets.length) return;

  const remoteIds = new Set();
  targets.forEach((player) => {
    if (shouldCheckIn) checkInPlayer(player);
    else checkOutPlayer(player);
    if (player.id) remoteIds.add(player.id);
  });

  saveLocal();
  queueSaveToSupabase();
  render();

  if (supabaseClient && remoteIds.size) {
    (async () => {
      try {
        for (const id of remoteIds) {
          await supabaseClient.from('players').update({ checked_in: shouldCheckIn }).eq('id', id);
        }
        queueSupabaseRefresh();
      } catch (err) {
        console.error(shouldCheckIn ? 'Supabase bulk check-in error' : 'Supabase bulk check-out error', err);
      }
    })();
  }
};
if (bulkCheckInBtn) {
  bulkCheckInBtn.addEventListener('click', () => {
    runBulkAttendanceAction(true);
  });
}
if (bulkCheckOutBtn) {
  bulkCheckOutBtn.addEventListener('click', () => {
    runBulkAttendanceAction(false);
  });
}

// --- Assign/move to group ---
const assignBtn = document.getElementById('btn-assign-to-group');
if (assignBtn) {
  assignBtn.addEventListener('click', async () => {
    const sel = selectedSet();
    if (!sel.size) return;

    const selEl = document.getElementById('bulk-dest-group');
    const chosen = normalizeGroupName(selEl ? selEl.value : '');
    let dest = chosen;
    if (state.limitedGroup) dest = state.limitedGroup;

    if (!dest || dest === 'All') return;

    // Ensure group exists in dropdown
    if (!state.groups.includes(dest)) {
      state.groups = Array.from(new Set([...state.groups, dest]));
    }

    // Local update (multi-group aware): add membership and promote to primary.
    const ids = Array.from(sel);
    const idSet = new Set(ids.map((id) => String(id)));
    const remoteUpdates = [];

    state.players = state.players.map((player) => {
      if (!idSet.has(String(player.id))) return player;
      const currentGroups = getPlayerGroups(player);
      const nextGroups = normalizeGroupList([dest, ...currentGroups.filter((group) => group !== dest)]);
      const nextPrimary = nextGroups[0] || '';
      const hasSameGroups = currentGroups.length === nextGroups.length &&
        currentGroups.every((group, index) => group === nextGroups[index]);
      if (hasSameGroups && getPlayerPrimaryGroup(player) === nextPrimary) return player;

      const nextPlayer = { ...player, group: nextPrimary, groups: nextGroups };
      if (nextPlayer.id) remoteUpdates.push({ id: nextPlayer.id, group: nextPrimary, groups: nextGroups });
      return nextPlayer;
    });

    // Supabase updates (primary group only)
    try {
      const catalogTouched = await ensureGroupCatalogEntriesSupabase([dest]);
      for (const update of remoteUpdates) {
        await updatePlayerFieldsSupabase(update.id, { group: update.group, groups: update.groups });
      }
      if (remoteUpdates.length || catalogTouched) await syncFromSupabase();
    } catch (e) {
      console.error('Supabase bulk assign error', e);
    }

    saveLocal();
    render();
  });
}

// --- Remove from group ---
const removeBtn = document.getElementById('btn-remove-from-group');
if (removeBtn) {
  removeBtn.addEventListener('click', async () => {
    const sel = selectedSet();
    if (!sel.size) return;

    const selEl = document.getElementById('bulk-dest-group');
    const chosen = normalizeGroupName(selEl ? selEl.value : '');
    let targetGroup = chosen;
    if (state.limitedGroup) targetGroup = state.limitedGroup;
    if (!targetGroup || targetGroup === 'All' || targetGroup === UNGROUPED_FILTER_VALUE) return;

    const ids = Array.from(sel);
    const idSet = new Set(ids.map((id) => String(id)));
    const remoteUpdates = [];

    // Local update (multi-group aware): remove only the targeted membership.
    state.players = state.players.map((player) => {
      if (!idSet.has(String(player.id))) return player;
      const currentGroups = getPlayerGroups(player);
      if (!currentGroups.includes(targetGroup)) return player;

      const nextGroups = currentGroups.filter((group) => group !== targetGroup);
      const nextPrimary = nextGroups[0] || '';
      const nextPlayer = { ...player, group: nextPrimary, groups: nextGroups };
      if (nextPlayer.id) remoteUpdates.push({ id: nextPlayer.id, group: nextPrimary, groups: nextGroups });
      return nextPlayer;
    });

    // Supabase updates (primary group only)
    try {
      for (const update of remoteUpdates) {
        await updatePlayerFieldsSupabase(update.id, { group: update.group, groups: update.groups });
      }
      if (remoteUpdates.length) await syncFromSupabase();
    } catch (e) {
      console.error('Supabase bulk remove group error', e);
    }

    saveLocal();
    render();
  });
}
}

// Initialise the app. Called once on page load. It loads stored data,
// optionally syncs with Supabase, registers the service worker and
// renders the UI for the first time.
function init() {
  // Load from localStorage
  loadLocal();
  // Render immediately from local state; remote schema detect/sync runs in background.
  render();

  // Register service worker for PWA offline support
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch((err) => {
      console.warn('Service worker registration failed', err);
    });
  }

  // Sync from supabase if available
  (async () => {
    await detectPlayersSchema();
    await syncFromSupabase();
    if (state.isAdmin) {
      (async () => {
        const catalogSynced = await backfillGroupCatalogToSupabase();
        const membershipsSynced = await backfillPlayerMembershipsToSupabase();
        if (catalogSynced || membershipsSynced) queueSupabaseRefresh();
      })();
    }
    render();
  })();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    init();
    initTournamentView();
    bindTournamentTab();
  });
} else {
  init();
  initTournamentView();
  bindTournamentTab();
}

