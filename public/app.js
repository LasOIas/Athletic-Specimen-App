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
const APP_VERSION = '2026.03.27.19';
const LS_TAB_KEY = 'athletic_specimen_tab';
const LS_SUBTAB_KEY = 'athletic_specimen_skill_subtab';
const LS_GROUPS_KEY = 'athletic_specimen_groups';
const LS_ACTIVE_GROUP_KEY = 'athletic_specimen_active_group';
const UNGROUPED_FILTER_VALUE = '__ungrouped__';
const UNGROUPED_FILTER_LABEL = 'Ungrouped (No Groups)';
const GROUP_CATALOG_NAME_PREFIX = '__as_group__:';
const GROUPS_TAG_PREFIX = '__as_groups__:';
const TOURNAMENT_STATE_ROW_NAME = '__as_tournament_state__';
const TOURNAMENT_STATE_TAG_PREFIX = '__as_tournament_store__:';
const SUPABASE_AUTHORITATIVE = true;
const SHARED_SYNC_PENDING = 'pending';
const SHARED_SYNC_LIVE = 'live';
const SHARED_SYNC_FALLBACK = 'fallback';
const SHARED_SYNC_LOCAL_ONLY = 'local-only';
const SHARED_SYNC_CONFLICT_RESOLVED = 'conflict-resolved';

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

function findInlineEditRowByPlayerKey(playerKey) {
  const key = String(playerKey || '').trim();
  if (!key) return null;
  const rows = document.querySelectorAll('.edit-row[data-player-key]');
  for (const row of rows) {
    if (String(row.getAttribute('data-player-key') || '') === key) {
      return row;
    }
  }
  return null;
}

function captureTransientInteractionState() {
  const snapshot = {
    searchFocused: false,
    searchSelectionStart: null,
    searchSelectionEnd: null,
    openMenuPlayerKey: '',
    openMenuPlayerId: '',
    openEditRowPlayerKey: '',
    openGroupSelectPlayerKey: '',
    openPopupId: ''
  };

  const searchInput = document.getElementById('player-search');
  if (searchInput && document.activeElement === searchInput) {
    snapshot.searchFocused = true;
    snapshot.searchSelectionStart = typeof searchInput.selectionStart === 'number'
      ? searchInput.selectionStart
      : null;
    snapshot.searchSelectionEnd = typeof searchInput.selectionEnd === 'number'
      ? searchInput.selectionEnd
      : null;
  }

  const openMenuButton = document.querySelector('.menu-wrap.menu-open .btn-actions');
  if (openMenuButton) {
    snapshot.openMenuPlayerKey = String(openMenuButton.getAttribute('data-player-key') || '');
    snapshot.openMenuPlayerId = String(openMenuButton.getAttribute('data-id') || '');
  }

  const openEditRow = document.querySelector('.edit-row.show[data-player-key]');
  if (openEditRow) {
    snapshot.openEditRowPlayerKey = String(openEditRow.getAttribute('data-player-key') || '');
  }

  const openGroupSelect = document.querySelector('.group-select.open[data-player-key]');
  if (openGroupSelect) {
    snapshot.openGroupSelectPlayerKey = String(openGroupSelect.getAttribute('data-player-key') || '');
  }

  const openPopup = document.querySelector('.popup-overlay[aria-hidden="false"]');
  if (openPopup && openPopup.id) {
    snapshot.openPopupId = String(openPopup.id);
  }

  return snapshot;
}

function restoreTransientInteractionState(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return;

  if (snapshot.openPopupId) {
    const popup = document.getElementById(snapshot.openPopupId);
    if (popup) {
      popup.style.display = 'flex';
      popup.setAttribute('aria-hidden', 'false');
    }
  }

  if (snapshot.openEditRowPlayerKey) {
    const row = findInlineEditRowByPlayerKey(snapshot.openEditRowPlayerKey);
    if (row) openInlineEditRow(row);
  }

  if (snapshot.openGroupSelectPlayerKey) {
    const select = Array.from(document.querySelectorAll('.group-select[data-player-key]'))
      .find((el) => String(el.getAttribute('data-player-key') || '') === snapshot.openGroupSelectPlayerKey);
    if (select) select.classList.add('open');
  }

  if (snapshot.openMenuPlayerKey || snapshot.openMenuPlayerId) {
    const menuButton = Array.from(document.querySelectorAll('.menu-wrap .btn-actions'))
      .find((button) => {
        const buttonKey = String(button.getAttribute('data-player-key') || '');
        const buttonId = String(button.getAttribute('data-id') || '');
        if (snapshot.openMenuPlayerKey && buttonKey === snapshot.openMenuPlayerKey) return true;
        return !snapshot.openMenuPlayerKey && snapshot.openMenuPlayerId && buttonId === snapshot.openMenuPlayerId;
      });
    if (menuButton) {
      const wrap = menuButton.closest('.menu-wrap');
      if (wrap) wrap.classList.add('menu-open');
      menuButton.setAttribute('aria-expanded', 'true');
    }
  }

  if (snapshot.searchFocused) {
    const searchInput = document.getElementById('player-search');
    if (searchInput) {
      searchInput.focus();
      if (
        typeof snapshot.searchSelectionStart === 'number' &&
        typeof snapshot.searchSelectionEnd === 'number' &&
        typeof searchInput.setSelectionRange === 'function'
      ) {
        const max = searchInput.value.length;
        const start = Math.max(0, Math.min(max, snapshot.searchSelectionStart));
        const end = Math.max(start, Math.min(max, snapshot.searchSelectionEnd));
        searchInput.setSelectionRange(start, end);
      }
    }
  }
}

// -- Robust global click handler for player card menus (capture phase) --
(function ensureMenuActionsBound() {
  if (window.__menusBound) return;
  window.__menusBound = true;

  document.addEventListener('click', async function onGlobalClick(e) {
    const target = e.target;
    if (!(target instanceof Element)) return;

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
      document.querySelectorAll('.menu-wrap.menu-open').forEach((w) => {
        w.classList.remove('menu-open');
        const button = w.querySelector('.btn-actions');
        if (button) button.setAttribute('aria-expanded', 'false');
      });
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
    if (
      e.target.closest('.card-menu') &&
      !e.target.closest('[data-role="menu-edit"]') &&
      !e.target.closest('[data-role="menu-delete"]')
    ) {
      e.stopPropagation();
      return;
    }
    if (e.target.closest('.group-select')) {
      e.stopPropagation();
      return;
    }

    // 3) Edit action
    const editBtn = e.target.closest('[data-role="menu-edit"]');
    if (editBtn) {
      e.stopPropagation();
      e.preventDefault();
      const playerKey = String(editBtn.getAttribute('data-player-key') || '').trim();
      const row = findInlineEditRowByPlayerKey(playerKey)
        || editBtn.closest('.player-card')?.querySelector('.edit-row');
      if (row) {
        const wasOpen = row.classList.contains('show');
        closeAllInlineEditRows();
        if (!wasOpen) openInlineEditRow(row);
      }
      // close menu
      const wrap = editBtn.closest('.menu-wrap');
      if (wrap) {
        wrap.classList.remove('menu-open');
        const button = wrap.querySelector('.btn-actions');
        if (button) button.setAttribute('aria-expanded', 'false');
      }
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
      const removedName = String(removed && removed.name || '').trim() || `Player ${id}`;
      const confirmed = confirmDangerousActionOrAbort({
        title: `Delete player "${removedName}"?`,
        detail: 'This permanently removes the player from roster and check-in data.',
        confirmText: 'DELETE'
      });
      if (!confirmed) return;

      let remoteDeleteFailed = false;
      if (supabaseClient && removed.id) {
        try {
          const { error } = await supabaseClient.from('players').delete().eq('id', removed.id);
          if (error) throw error;
        } catch (err) {
          remoteDeleteFailed = true;
          console.error('Supabase delete error', err);
          await reconcileToSupabaseAuthority('player-delete');
          recordOperatorAction({
            scope: 'players',
            action: 'delete-player-failed',
            entityType: 'player',
            entityId: String(removed.id || playerIdentityKey(removed) || ''),
            title: `Delete failed for "${removedName}".`,
            detail: 'Supabase write failed. Latest shared state was restored.',
            tone: 'error'
          });
        }
      }
      if (remoteDeleteFailed) return;

      state.players = state.players.filter(p => String(p.id) !== id);
      checkOutPlayer(removed);
      saveLocal();

      // close any open menu and re-render
      document.querySelectorAll('.menu-wrap.menu-open').forEach((w) => {
        w.classList.remove('menu-open');
        const button = w.querySelector('.btn-actions');
        if (button) button.setAttribute('aria-expanded', 'false');
      });
      if (supabaseClient && removed.id) queueSupabaseRefresh();
      recordOperatorAction({
        scope: 'players',
        action: 'delete-player',
        entityType: 'player',
        entityId: String(removed.id || playerIdentityKey(removed) || ''),
        title: `Deleted player "${removedName}".`,
        detail: 'Player removal was applied.',
        tone: 'warning'
      });
      render();
      return;
    }

    // 4) Clicked outside controls: close only when truly outside.
    if (!e.target.closest('.menu-wrap')) {
      document.querySelectorAll('.menu-wrap.menu-open').forEach((w) => {
        w.classList.remove('menu-open');
        const button = w.querySelector('.btn-actions');
        if (button) button.setAttribute('aria-expanded', 'false');
      });
    }
    if (!e.target.closest('.group-select')) {
      document.querySelectorAll('.group-select.open').forEach((el) => el.classList.remove('open'));
    }
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

    const idAttr = String(btn.getAttribute('data-id') || '').trim();
    const buttonPlayerKey = String(btn.getAttribute('data-player-key') || '').trim();
    const row = btn.closest('.edit-row') || findInlineEditRowByPlayerKey(buttonPlayerKey);
    if (!row) return;
    const rowPlayerKey = String(row.getAttribute('data-player-key') || buttonPlayerKey).trim();

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

    // Prefer stable identity key targeting, then persistent id targeting.
    let idx = -1;
    if (rowPlayerKey) {
      idx = state.players.findIndex((p) => playerIdentityKey(p) === rowPlayerKey);
    }
    if (idx === -1 && idAttr && idAttr !== 'undefined' && idAttr !== 'null') {
      idx = state.players.findIndex((p) => String(p.id) === idAttr);
    }
    if (idx < 0 || !state.players[idx]) return;

    const prev = state.players[idx];
    const next = { ...prev, name, skill, group, groups };

    // Optimistic local update
    const copy = state.players.slice();
    copy[idx] = next;
    state.players = copy;

    // Persist local and render immediately for responsive inline edits.
    saveLocal();
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

          await ensureGroupCatalogEntriesSupabase(groups);
          if (remoteOK) queueSupabaseRefresh();
          else await reconcileToSupabaseAuthority('inline-edit-save');
        } catch (err) {
          console.error('Supabase save error', err);
          await reconcileToSupabaseAuthority('inline-edit-save');
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
    render();

    if (supabaseClient && player.id) {
      (async () => {
        try {
          const { error } = await supabaseClient
            .from('players')
            .update({ checked_in: !!inBtn })
            .eq('id', player.id);
          if (error) throw error;
          queueSupabaseRefresh();
        } catch (err) {
          console.error(inBtn ? 'Supabase update error' : 'Supabase check-out error', err);
          await reconcileToSupabaseAuthority(inBtn ? 'delegated-check-in' : 'delegated-check-out');
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

function isTournamentStateRow(row) {
  return String(row && row.name || '').trim() === TOURNAMENT_STATE_ROW_NAME;
}

function serializeTournamentStoreTag(storeSnapshot) {
  const snapshot = storeSnapshot && typeof storeSnapshot === 'object'
    ? storeSnapshot
    : { activeTournamentId: '', tournaments: [] };
  try {
    const envelope = {
      updatedAt: Date.now(),
      store: snapshot
    };
    return `${TOURNAMENT_STATE_TAG_PREFIX}${encodeURIComponent(JSON.stringify(envelope))}`;
  } catch {
    return '';
  }
}

function parseTournamentStoreTagEnvelope(rawTagValue) {
  const raw = String(rawTagValue || '').trim();
  if (!raw.startsWith(TOURNAMENT_STATE_TAG_PREFIX)) return null;
  const encoded = raw.slice(TOURNAMENT_STATE_TAG_PREFIX.length);
  if (!encoded) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(encoded));
    // Backward compatibility: allow direct store payload without envelope.
    if (parsed && typeof parsed === 'object' && parsed.store && typeof parsed.store === 'object') {
      return {
        updatedAt: Number(parsed.updatedAt) || 0,
        store: parsed.store
      };
    }
    if (parsed && typeof parsed === 'object') {
      return {
        updatedAt: Number(parsed.updatedAt) || 0,
        store: parsed
      };
    }
    return null;
  } catch {
    return null;
  }
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

function parseRemotePlayerGroupDetails(row) {
  const primaryGroup = normalizeGroupName(row && row.group);
  const encodedGroups = parsePlayerGroupsTag(row && row.tag);

  if (Array.isArray(encodedGroups) && encodedGroups.length) {
    return {
      groups: normalizeGroupList([
        ...(primaryGroup ? [primaryGroup] : []),
        ...encodedGroups
      ]),
      hasEncodedGroups: true
    };
  }

  const fallbackTag = normalizeGroupName(row && row.tag);
  return {
    groups: normalizeGroupList([
      ...(primaryGroup ? [primaryGroup] : []),
      ...(fallbackTag ? [fallbackTag] : [])
    ]),
    hasEncodedGroups: false
  };
}

function parseRemotePlayerGroups(row) {
  return parseRemotePlayerGroupDetails(row).groups;
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

function sanitizePlayersAgainstAllowedGroups(allowedGroups) {
  const allowed = normalizeGroupList(allowedGroups);
  if (!allowed.length) return false;
  const allowedKeys = new Set(allowed.map((groupName) => normalizeGroupKey(groupName)));

  let changed = false;
  state.players = (state.players || []).map((player) => {
    if (!player || typeof player !== 'object') return player;
    const currentGroups = getPlayerGroups(player);
    const nextGroups = currentGroups.filter((groupName) => allowedKeys.has(normalizeGroupKey(groupName)));
    const nextPrimary = nextGroups[0] || '';
    const currentPrimary = normalizeGroupName(player.group || '');
    const groupsUnchanged = currentGroups.length === nextGroups.length &&
      currentGroups.every((groupName, index) => groupName === nextGroups[index]);
    if (groupsUnchanged && currentPrimary === nextPrimary) return player;
    changed = true;
    return { ...player, group: nextPrimary, groups: nextGroups };
  });

  return changed;
}

function enforceCanonicalGroupState(options = {}) {
  const catalogGroups = Array.isArray(options.catalogGroups)
    ? normalizeGroupList(options.catalogGroups)
    : null;
  const includeExistingGroupsWhenNoCatalog = options.includeExistingGroupsWhenNoCatalog !== false;
  const hasCatalog = Array.isArray(catalogGroups) && catalogGroups.length > 0;

  normalizePlayerGroupsInState();
  if (hasCatalog) {
    sanitizePlayersAgainstAllowedGroups(catalogGroups);
  }
  normalizePlayerGroupsInState();

  const groupsFromPlayers = normalizeGroupList(
    (state.players || []).flatMap((player) => getPlayerGroups(player))
  );
  const existingGroups = includeExistingGroupsWhenNoCatalog
    ? normalizeGroupList((state.groups || []).filter((groupName) => groupName && groupName !== 'All'))
    : [];
  const canonicalGroups = hasCatalog
    ? catalogGroups
    : normalizeGroupList([
        ...existingGroups,
        ...groupsFromPlayers
      ]);
  const withLimited = state.limitedGroup
    ? normalizeGroupList([state.limitedGroup, ...canonicalGroups])
    : canonicalGroups;
  state.groups = ['All', ...withLimited];

  const currentActive = normalizeActiveGroupSelection(state.activeGroup || 'All');
  if (state.limitedGroup) {
    state.activeGroup = normalizeGroupName(state.limitedGroup);
  } else if (currentActive === 'All' || currentActive === UNGROUPED_FILTER_VALUE) {
    state.activeGroup = currentActive;
  } else {
    const activeKey = normalizeGroupKey(currentActive);
    const match = withLimited.find((groupName) => normalizeGroupKey(groupName) === activeKey);
    state.activeGroup = match || 'All';
  }
}

function persistCanonicalGroupCache() {
  try {
    localStorage.setItem(LS_GROUPS_KEY, JSON.stringify(getAvailableGroups()));
    localStorage.setItem(LS_ACTIVE_GROUP_KEY, normalizeActiveGroupSelection(state.activeGroup || 'All'));
  } catch {}
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

function enforceSharedPlayerModelParity() {
  if (!supabaseClient || !SUPABASE_AUTHORITATIVE || !PLAYERS_SCHEMA_DETECTED) return false;
  if (HAS_GROUP && HAS_TAG) return false;

  const supportsPrimaryOnly = HAS_GROUP || HAS_TAG;
  let changed = false;

  state.players = (state.players || []).map((player) => {
    if (!player || typeof player !== 'object') return player;
    const currentGroups = getPlayerGroups(player);
    const primary = supportsPrimaryOnly ? normalizeGroupName(currentGroups[0] || player.group || '') : '';
    const nextGroups = primary ? [primary] : [];
    const currentPrimary = normalizeGroupName(player.group || '');
    const sameShape =
      currentPrimary === primary &&
      currentGroups.length === nextGroups.length &&
      currentGroups.every((groupName, idx) => groupName === nextGroups[idx]);
    if (sameShape) return player;
    changed = true;
    return { ...player, group: primary, groups: nextGroups };
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
let forceSaveRunning = false;
function queueSaveToSupabase() {
  if (!supabaseClient) return;
  if (SUPABASE_AUTHORITATIVE) return;
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
let crossDeviceRefreshInterval = null;
let supabaseLiveSyncChannel = null;
let supabaseSyncRequestSeq = 0;
let supabaseSyncAppliedSeq = 0;
function queueSupabaseRefresh(delay = 160) {
  if (!supabaseClient) return;
  refreshQueued = true;
  clearTimeout(refreshTimeout);
  refreshTimeout = setTimeout(() => {
    void runQueuedSupabaseRefresh();
  }, Math.max(0, Number(delay) || 0));
}

function ensureSupabaseLiveSync() {
  if (!supabaseClient || supabaseLiveSyncChannel) return;
  try {
    supabaseLiveSyncChannel = supabaseClient
      .channel('athletic-specimen-live-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players' },
        () => {
          queueSupabaseRefresh(0);
        }
      )
      .subscribe();
  } catch (err) {
    console.error('Supabase live sync subscribe error', err);
  }
}

let authorityRefreshHooksBound = false;
function ensureAuthorityRefreshHooks() {
  if (authorityRefreshHooksBound || !supabaseClient) return;
  authorityRefreshHooksBound = true;

  const triggerRefresh = (reason) => {
    if (!supabaseClient) return;
    if (
      SUPABASE_AUTHORITATIVE &&
      state.sharedSyncState !== SHARED_SYNC_LOCAL_ONLY &&
      state.sharedSyncState !== SHARED_SYNC_PENDING
    ) {
      setSharedSyncState(SHARED_SYNC_PENDING);
      if (state.tournamentSyncState !== SHARED_SYNC_LOCAL_ONLY) {
        setTournamentSyncState(SHARED_SYNC_PENDING);
      }
      render();
    }
    ensureSupabaseLiveSync();
    queueSupabaseRefresh(0);
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    triggerRefresh('visibility');
  });

  window.addEventListener('focus', () => {
    triggerRefresh('focus');
  });

  window.addEventListener('online', () => {
    triggerRefresh('online');
  });

  window.addEventListener('offline', () => {
    if (!SUPABASE_AUTHORITATIVE) return;
    setSharedSyncState(SHARED_SYNC_FALLBACK, 'Offline. Showing local cache.');
    setTournamentSyncState(SHARED_SYNC_FALLBACK, 'Offline. Showing local cache.');
    render();
  });

  window.addEventListener('pageshow', (event) => {
    if (event && event.persisted) {
      triggerRefresh('pageshow');
    }
  });
}

async function runQueuedSupabaseRefresh() {
  if (!supabaseClient || refreshRunning || !refreshQueued) return;
  refreshRunning = true;
  refreshQueued = false;
  try {
    const prevSyncState = state.sharedSyncState;
    const prevSyncError = state.sharedSyncError;
    const synced = await syncFromSupabase();
    if (!synced) {
      if (prevSyncState !== state.sharedSyncState || prevSyncError !== state.sharedSyncError) {
        render();
      }
      return;
    }
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
  if (!canRunAdminSharedBackfill()) return;
  groupCatalogSyncQueued = true;
  clearTimeout(groupCatalogSyncTimeout);
  groupCatalogSyncTimeout = setTimeout(() => {
    void runQueuedGroupCatalogSync();
  }, Math.max(0, Number(delay) || 0));
}

async function runQueuedGroupCatalogSync() {
  if (!canRunAdminSharedBackfill() || groupCatalogSyncRunning || !groupCatalogSyncQueued) return;
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

async function syncLiveMatchSkillsToSupabase(teamNumbers) {
  if (!supabaseClient) return true;

  const normalizedTeams = Array.from(new Set(
    (Array.isArray(teamNumbers) ? teamNumbers : [])
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0)
  ));
  if (!normalizedTeams.length) return true;

  const keySet = new Set();
  normalizedTeams.forEach((teamNumber) => {
    const teamIndex = teamNumber - 1;
    const team = Array.isArray(state.generatedTeams) ? state.generatedTeams[teamIndex] : null;
    if (!Array.isArray(team)) return;
    team.forEach((member) => {
      const key = playerIdentityKey(member);
      if (key) keySet.add(key);
    });
  });
  if (!keySet.size) return true;

  const targets = (state.players || []).filter((player) => {
    if (!player || !player.id) return false;
    const key = playerIdentityKey(player);
    return keySet.has(key);
  });
  if (!targets.length) return true;

  let allOK = true;
  for (const player of targets) {
    const ok = await updatePlayerFieldsSupabase(player.id, {
      skill: clampSkillOneDecimal(Number(player.skill) || 0)
    });
    if (!ok) allOK = false;
  }
  return allOK;
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
    const checked = checkedSet.has(playerIdentityKey(player));
    const isSelected = selectedIds.has(String(player.id));
    const playerKey = playerIdentityKey(player);
    const playerKeyValue = escapeHTMLText(playerKey);
    const playerGroup = getPlayerPrimaryGroup(player);
    const playerGroups = getPlayerGroups(player);
    const playerGroupsValue = escapeHTMLText(JSON.stringify(playerGroups));
    const groupsDisplayHTML = playerGroups.length
      ? playerGroups.map((groupName, groupIndex) =>
        `<span class="badge player-group-badge ${groupIndex === 0 ? 'is-primary' : ''}">${escapeHTMLText(groupName)}${groupIndex === 0 ? ' (Primary)' : ''}</span>`
      ).join('')
      : '<span class="small player-group-none">Ungrouped</span>';

    return `
      <div class="player-card ${isSelected ? 'is-selected' : ''}" data-id="${player.id}" data-player-key="${playerKeyValue}">
        ${state.isAdmin ? `
  <div class="menu-wrap">
    <button type="button" class="btn-actions" aria-haspopup="true" aria-expanded="false"
            data-id="${player.id}" data-player-key="${playerKeyValue}" title="More actions">⋮</button>
    <div class="card-menu" role="menu">
      <button type="button" class="menu-item" data-role="menu-edit" data-player-key="${playerKeyValue}">Edit</button>
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
          <div class="edit-row" data-player-key="${playerKeyValue}">
        <input type="text" class="edit-name" placeholder="Name" value="${player.name}" />
        <input type="number" class="edit-skill" placeholder="Skill" step="0.1" value="${player.skill}" />
        <div class="group-select" data-player-key="${playerKeyValue}">
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
          <button type="button" class="btn-save-edit success" data-player-key="${playerKeyValue}" data-id="${player.id}">Save</button>
          <button type="button" class="btn-cancel-edit secondary" data-player-key="${playerKeyValue}">Cancel</button>
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
  adminCodeMap: {},   // live copy used by the UI
  sharedSyncState: (SUPABASE_AUTHORITATIVE && supabaseClient)
    ? SHARED_SYNC_PENDING
    : SHARED_SYNC_LOCAL_ONLY,
  sharedSyncError: '',
  lastSharedSyncAt: 0,
  tournamentSyncState: (SUPABASE_AUTHORITATIVE && supabaseClient)
    ? SHARED_SYNC_PENDING
    : SHARED_SYNC_LOCAL_ONLY,
  tournamentSyncError: '',
  lastTournamentSyncAt: 0,
  operatorActions: []
};

function setSharedSyncState(nextState, errorMessage = '') {
  state.sharedSyncState = nextState;
  state.sharedSyncError = errorMessage || '';
  if (nextState === SHARED_SYNC_LIVE || nextState === SHARED_SYNC_CONFLICT_RESOLVED) {
    state.lastSharedSyncAt = Date.now();
  }
}

function setTournamentSyncState(nextState, errorMessage = '') {
  state.tournamentSyncState = nextState;
  state.tournamentSyncError = errorMessage || '';
  if (nextState === SHARED_SYNC_LIVE || nextState === SHARED_SYNC_CONFLICT_RESOLVED) {
    state.lastTournamentSyncAt = Date.now();
  }
}

function formatLastSharedSyncLabel() {
  if (!state.lastSharedSyncAt) return '';
  try {
    return new Date(state.lastSharedSyncAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatLastTournamentSyncLabel() {
  if (!state.lastTournamentSyncAt) return '';
  try {
    return new Date(state.lastTournamentSyncAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

function getSharedGroupSyncModeLabel() {
  if (!SUPABASE_AUTHORITATIVE || !supabaseClient || !PLAYERS_SCHEMA_DETECTED) return '';
  if (HAS_GROUP && HAS_TAG) return ' Group sync mode: multi-group cloud canonical.';
  if (HAS_GROUP || HAS_TAG) return ' Group sync mode: primary-only cloud canonical.';
  return ' Group sync mode: none (local-only groups).';
}

function buildSharedSyncNoticeHTML() {
  if (!SUPABASE_AUTHORITATIVE || !supabaseClient) return '';
  const modeLabel = getSharedGroupSyncModeLabel();

  if (state.sharedSyncState === SHARED_SYNC_PENDING) {
    return `<p class="small shared-sync-notice is-pending">Syncing shared data from Supabase...${escapeHTMLText(modeLabel)}</p>`;
  }
  if (state.sharedSyncState === SHARED_SYNC_FALLBACK) {
    const detail = state.sharedSyncError ? ` ${escapeHTMLText(state.sharedSyncError)}` : '';
    return `<p class="small shared-sync-notice is-fallback">Using local fallback cache.${detail}${escapeHTMLText(modeLabel)}</p>`;
  }
  if (state.sharedSyncState === SHARED_SYNC_LIVE) {
    const at = formatLastSharedSyncLabel();
    return `<p class="small shared-sync-notice is-live">Supabase authoritative sync${at ? ` | Updated ${escapeHTMLText(at)}` : ''}.${escapeHTMLText(modeLabel)}</p>`;
  }
  if (state.sharedSyncState === SHARED_SYNC_CONFLICT_RESOLVED) {
    const detail = state.sharedSyncError ? ` ${escapeHTMLText(state.sharedSyncError)}` : '';
    const at = formatLastSharedSyncLabel();
    return `<p class="small shared-sync-notice is-live">Supabase conflict resolved.${detail}${at ? ` | Updated ${escapeHTMLText(at)}` : ''}.${escapeHTMLText(modeLabel)}</p>`;
  }
  return '';
}

function canRunAdminSharedBackfill() {
  if (!supabaseClient || !state.isAdmin) return false;
  if (!SUPABASE_AUTHORITATIVE) return true;
  return state.sharedSyncState === SHARED_SYNC_LIVE || state.sharedSyncState === SHARED_SYNC_CONFLICT_RESOLVED;
}

function getTournamentSharedModeLabel() {
  if (!supabaseClient || !SUPABASE_AUTHORITATIVE) return 'Local-only tournament mode.';
  if (!PLAYERS_SCHEMA_DETECTED) return 'Detecting tournament sync schema...';
  if (!HAS_TAG) return 'Tournament cloud sync unavailable (players.tag required).';
  return 'Tournament cloud sync is canonical.';
}

function buildTournamentSyncNoticeHTML() {
  const modeLabel = getTournamentSharedModeLabel();
  const detail = state.tournamentSyncError ? ` ${escapeHTMLText(state.tournamentSyncError)}` : '';
  const at = formatLastTournamentSyncLabel();

  if (!supabaseClient || !SUPABASE_AUTHORITATIVE) {
    return `<p class="small shared-sync-notice is-fallback">${escapeHTMLText(modeLabel)}</p>`;
  }
  if (!PLAYERS_SCHEMA_DETECTED) {
    return `<p class="small shared-sync-notice is-pending">${escapeHTMLText(modeLabel)}</p>`;
  }
  if (!HAS_TAG) {
    return `<p class="small shared-sync-notice is-fallback">${escapeHTMLText(modeLabel)}${detail}</p>`;
  }
  if (state.tournamentSyncState === SHARED_SYNC_PENDING) {
    return `<p class="small shared-sync-notice is-pending">Syncing tournament state from Supabase...${detail}</p>`;
  }
  if (state.tournamentSyncState === SHARED_SYNC_FALLBACK) {
    return `<p class="small shared-sync-notice is-fallback">Tournament sync fallback (local cache active).${detail}</p>`;
  }
  if (state.tournamentSyncState === SHARED_SYNC_CONFLICT_RESOLVED) {
    return `<p class="small shared-sync-notice is-live">Tournament conflict resolved.${detail}${at ? ` | Updated ${escapeHTMLText(at)}` : ''}</p>`;
  }
  if (state.tournamentSyncState === SHARED_SYNC_LIVE) {
    return `<p class="small shared-sync-notice is-live">Tournament authoritative sync${at ? ` | Updated ${escapeHTMLText(at)}` : ''}</p>`;
  }
  return `<p class="small shared-sync-notice is-pending">${escapeHTMLText(modeLabel)}</p>`;
}

const MAX_OPERATOR_ACTIONS = 18;

function createOperatorActionId() {
  return `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatOperatorActionTimeLabel(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

function recordOperatorAction({
  scope = 'general',
  action = '',
  entityType = '',
  entityId = '',
  title = '',
  detail = '',
  tone = 'info',
  undo = null
} = {}) {
  const safeTitle = String(title || '').trim();
  if (!safeTitle) return null;
  const safeTone = tone === 'error' || tone === 'success' || tone === 'warning' ? tone : 'info';
  const entry = {
    id: createOperatorActionId(),
    at: Date.now(),
    scope: String(scope || 'general'),
    action: String(action || ''),
    entityType: String(entityType || ''),
    entityId: String(entityId || ''),
    title: safeTitle,
    detail: String(detail || '').trim(),
    tone: safeTone,
    undo: undo && typeof undo === 'object'
      ? { ...undo, used: false }
      : null
  };
  state.operatorActions = [entry, ...(state.operatorActions || [])].slice(0, MAX_OPERATOR_ACTIONS);
  return entry.id;
}

function markOperatorActionUndoUsed(actionId) {
  const target = String(actionId || '').trim();
  if (!target) return;
  state.operatorActions = (state.operatorActions || []).map((entry) => {
    if (!entry || entry.id !== target || !entry.undo) return entry;
    return { ...entry, undo: { ...entry.undo, used: true } };
  });
}

function renderOperatorActionsLogHTML() {
  const items = Array.isArray(state.operatorActions) ? state.operatorActions.slice(0, 10) : [];
  if (!items.length) return '<p class="small">No recent admin actions.</p>';
  return `
    <ul class="operator-actions-log" style="list-style:none; margin:0; padding:0;">
      ${items.map((entry) => {
        const ts = formatOperatorActionTimeLabel(entry.at);
        const metaParts = [entry.scope, entry.action].filter(Boolean).join(' / ');
        const canUndo = !!(entry.undo && !entry.undo.used);
        return `
          <li class="small" style="padding:0.45rem 0; border-top:1px solid #e2e8f0;">
            <div>
              <strong>${escapeHTMLText(entry.title)}</strong>
              ${ts ? `<span style="opacity:0.75;"> | ${escapeHTMLText(ts)}</span>` : ''}
            </div>
            ${entry.detail ? `<div style="opacity:0.9;">${escapeHTMLText(entry.detail)}</div>` : ''}
            ${metaParts ? `<div style="opacity:0.7;">${escapeHTMLText(metaParts)}</div>` : ''}
            ${canUndo
              ? `<div style="margin-top:0.25rem;"><button type="button" class="secondary" data-role="undo-operator-action" data-action-id="${escapeHTMLText(entry.id)}">Undo</button></div>`
              : ''}
          </li>
        `;
      }).join('')}
    </ul>
  `;
}

function confirmDangerousActionOrAbort({ title, detail, confirmText }) {
  const expected = String(confirmText || '').trim();
  if (!expected) return false;
  const promptText = `${String(title || '').trim()}\n\n${String(detail || '').trim()}\n\nType "${expected}" to confirm.`;
  const response = window.prompt(promptText, '');
  return String(response || '').trim() === expected;
}

async function syncCheckedInStateToSupabase() {
  if (!supabaseClient) return true;
  ensurePlayerIdentityKeys();
  const checkedSet = new Set(normalizeCheckedInEntries(state.checkedIn || []));
  let failed = false;
  for (const player of (state.players || [])) {
    if (!player || !player.id) continue;
    const shouldBeCheckedIn = checkedSet.has(playerIdentityKey(player));
    const ok = await updatePlayerFieldsSupabase(player.id, { checked_in: shouldBeCheckedIn });
    if (!ok) failed = true;
  }
  if (failed) return false;
  queueSupabaseRefresh();
  return true;
}

async function runOperatorActionUndo(actionId) {
  const target = String(actionId || '').trim();
  if (!target) return;
  const entry = (state.operatorActions || []).find((item) => item && item.id === target);
  if (!entry || !entry.undo || entry.undo.used) return;

  const undoType = String(entry.undo.kind || '').trim();
  if (undoType === 'tournament-store') {
    TournamentManager.replaceStore(entry.undo.storeSnapshot || { activeTournamentId: '', tournaments: [] });
    if (SUPABASE_AUTHORITATIVE && supabaseClient) {
      const synced = await syncTournamentStoreToSupabase();
      if (!synced) {
        await reconcileTournamentToSupabaseAuthority('operator-undo-tournament');
        setTournamentNotice(
          'Undo failed to sync. Restored latest shared tournament state.',
          TOURNAMENT_NOTICE_ERROR
        );
        recordOperatorAction({
          scope: 'tournament',
          action: 'undo-failed',
          entityType: entry.entityType || 'tournament',
          entityId: entry.entityId || '',
          title: 'Undo failed: restored shared tournament state instead.',
          detail: entry.title,
          tone: 'error'
        });
        render();
        initTournamentView();
        return;
      }
    }
    markOperatorActionUndoUsed(target);
    setTournamentNotice('Undo applied for tournament action.', TOURNAMENT_NOTICE_SUCCESS);
    recordOperatorAction({
      scope: 'tournament',
      action: 'undo',
      entityType: entry.entityType || 'tournament',
      entityId: entry.entityId || '',
      title: 'Undo applied for tournament action.',
      detail: entry.title,
      tone: 'success'
    });
    render();
    initTournamentView();
    return;
  }

  if (undoType === 'checkins') {
    state.checkedIn = normalizeCheckedInEntries(entry.undo.checkedIn || []);
    saveLocal();
    render();
    if (supabaseClient) {
      const synced = await syncCheckedInStateToSupabase();
      if (!synced) {
        await reconcileToSupabaseAuthority('operator-undo-reset-checkins');
        recordOperatorAction({
          scope: 'players',
          action: 'undo-failed',
          entityType: 'checkins',
          entityId: '',
          title: 'Undo failed: restored latest shared check-in state.',
          detail: entry.title,
          tone: 'error'
        });
        return;
      }
    }
    markOperatorActionUndoUsed(target);
    recordOperatorAction({
      scope: 'players',
      action: 'undo',
      entityType: 'checkins',
      entityId: '',
      title: 'Undo applied for check-in reset.',
      detail: entry.title,
      tone: 'success'
    });
    render();
  }
}

function applyTournamentStoreFromAuthority(storeSnapshot) {
  if (typeof TournamentManager === 'undefined' || !TournamentManager || typeof TournamentManager.replaceStore !== 'function') {
    return false;
  }
  const before = JSON.stringify(TournamentManager.getStoreSnapshot());
  const nextSnapshot = storeSnapshot && typeof storeSnapshot === 'object'
    ? storeSnapshot
    : { activeTournamentId: '', tournaments: [] };
  TournamentManager.replaceStore(nextSnapshot);
  const after = JSON.stringify(TournamentManager.getStoreSnapshot());
  return before !== after;
}

async function syncTournamentStoreToSupabase() {
  if (!supabaseClient || !SUPABASE_AUTHORITATIVE) {
    setTournamentSyncState(SHARED_SYNC_LOCAL_ONLY, 'Supabase unavailable for tournament sync.');
    return false;
  }
  if (!PLAYERS_SCHEMA_DETECTED) {
    await detectPlayersSchema();
  }
  if (!HAS_TAG) {
    setTournamentSyncState(SHARED_SYNC_FALLBACK, 'Tournament sync requires players.tag support.');
    return false;
  }

  const snapshot = TournamentManager.getStoreSnapshot();
  const encodedTag = serializeTournamentStoreTag(snapshot);
  if (!encodedTag) {
    setTournamentSyncState(SHARED_SYNC_FALLBACK, 'Tournament sync payload encoding failed.');
    return false;
  }

  setTournamentSyncState(SHARED_SYNC_PENDING);
  try {
    const { data: rows, error: listError } = await supabaseClient
      .from('players')
      .select('id')
      .eq('name', TOURNAMENT_STATE_ROW_NAME);
    if (listError) throw listError;

    const payload = {
      name: TOURNAMENT_STATE_ROW_NAME,
      skill: 0,
      checked_in: false,
      tag: encodedTag
    };
    if (HAS_GROUP) payload.group = '';

    const existingRows = Array.isArray(rows) ? rows : [];
    if (existingRows.length) {
      const primary = existingRows[0];
      const { error: updateError } = await supabaseClient
        .from('players')
        .update(payload)
        .eq('id', primary.id);
      if (updateError) throw updateError;

      for (const duplicate of existingRows.slice(1)) {
        const duplicateId = String(duplicate && duplicate.id || '').trim();
        if (!duplicateId) continue;
        const { error: deleteError } = await supabaseClient
          .from('players')
          .delete()
          .eq('id', duplicateId);
        if (deleteError) {
          console.error('Supabase tournament duplicate delete error', deleteError);
        }
      }
    } else {
      const { error: insertError } = await supabaseClient
        .from('players')
        .insert([payload]);
      if (insertError) throw insertError;
    }

    setTournamentSyncState(SHARED_SYNC_LIVE);
    queueSupabaseRefresh(0);
    return true;
  } catch (err) {
    console.error('Supabase tournament sync error', err);
    setTournamentSyncState(SHARED_SYNC_FALLBACK, 'Tournament write failed. Showing local fallback.');
    return false;
  }
}

async function reconcileTournamentToSupabaseAuthority(contextLabel = '') {
  if (!supabaseClient || !SUPABASE_AUTHORITATIVE) return false;
  const synced = await syncFromSupabase();
  if (!synced) return false;
  if (contextLabel) {
    setTournamentSyncState(
      SHARED_SYNC_CONFLICT_RESOLVED,
      `Recovered via Supabase authority (${contextLabel}).`
    );
  }
  initTournamentView();
  return true;
}

function normalizeCollapsedCardsState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  Object.keys(value).forEach((key) => {
    if (value[key]) out[String(key)] = true;
  });
  return out;
}

function getAvailableGroups() {
  // Canonical group list for UI selection comes from state.groups.
  return normalizeGroupList((state.groups || []).filter((groupName) => groupName && groupName !== 'All'));
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

  const authoritativeSharedData = SUPABASE_AUTHORITATIVE && !!supabaseClient;
  if (!authoritativeSharedData) {
    try {
      const groups = JSON.parse(localStorage.getItem(LS_GROUPS_KEY) || '[]');
      if (Array.isArray(groups) && groups.length) state.groups = Array.from(new Set(['All', ...groups.filter(Boolean)]));
    } catch {}
  }
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

  const beforeCanonicalGroups = JSON.stringify(state.groups || []);
  const beforeCanonicalActive = normalizeActiveGroupSelection(state.activeGroup || 'All');
  if (authoritativeSharedData) {
    enforceCanonicalGroupState({ includeExistingGroupsWhenNoCatalog: false });
  } else {
    enforceCanonicalGroupState();
  }
  const afterCanonicalGroups = JSON.stringify(state.groups || []);
  const afterCanonicalActive = normalizeActiveGroupSelection(state.activeGroup || 'All');
  if (beforeCanonicalGroups !== afterCanonicalGroups || beforeCanonicalActive !== afterCanonicalActive) {
    shouldPersistMigration = true;
  }

  if (shouldPersistMigration) saveLocal();
}

// Save current state players and checked-in attendance keys to localStorage. Called
// whenever state.players or state.checkedIn changes.
function saveLocal() {
  try {
    normalizePlayerGroupsInState();
    enforceSharedPlayerModelParity();
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
    if (canRunAdminSharedBackfill()) {
      queueGroupCatalogSync();
    }
  } catch (err) {
    console.error('Error saving to localStorage', err);
  }
}

function mergePlayersAfterSync(remotePlayers) {
  const remoteList = Array.isArray(remotePlayers) ? remotePlayers : [];
  const cleanedRemotePlayers = remoteList.map((remotePlayer) => {
    if (!remotePlayer || typeof remotePlayer !== 'object') return remotePlayer;
    const { hasEncodedGroups: _ignoredFlag, ...remoteWithoutFlag } = remotePlayer;
    const groups = getPlayerGroups(remoteWithoutFlag);
    return { ...remoteWithoutFlag, group: groups[0] || '', groups };
  });

  const remoteChecked = new Set(
    cleanedRemotePlayers
      .filter((p) => p && p.checked_in)
      .map((p) => playerIdentityKey(p))
      .filter(Boolean)
  );

  if (SUPABASE_AUTHORITATIVE) {
    return {
      players: cleanedRemotePlayers,
      checkedIn: [...remoteChecked]
    };
  }

  const prevPlayers = Array.isArray(state.players) ? state.players : [];
  const prevChecked = new Set(state.checkedIn || []);
  ensurePlayerIdentityKeys();

  const prevById = new Map();
  prevPlayers.forEach((player) => {
    if (!player || typeof player !== 'object' || !player.id) return;
    prevById.set(String(player.id), player);
  });

  const mergedRemotePlayers = cleanedRemotePlayers.map((remotePlayer) => {
    if (!remotePlayer || typeof remotePlayer !== 'object' || !remotePlayer.id) return remotePlayer;
    const prev = prevById.get(String(remotePlayer.id));
    if (!prev) return remotePlayer;

    const hasEncodedGroups = !!remotePlayer.hasEncodedGroups;
    const remoteGroups = getPlayerGroups(remotePlayer);
    const prevGroups = getPlayerGroups(prev);
    const groups = hasEncodedGroups
      ? remoteGroups
      : normalizeGroupList([
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
  if (!supabaseClient) return false;
  const requestSeq = ++supabaseSyncRequestSeq;

  try {
    if (
      SUPABASE_AUTHORITATIVE &&
      state.sharedSyncState !== SHARED_SYNC_LIVE &&
      state.sharedSyncState !== SHARED_SYNC_CONFLICT_RESOLVED
    ) {
      setSharedSyncState(SHARED_SYNC_PENDING);
    }
    if (
      SUPABASE_AUTHORITATIVE &&
      state.tournamentSyncState !== SHARED_SYNC_LOCAL_ONLY &&
      state.tournamentSyncState !== SHARED_SYNC_PENDING
    ) {
      setTournamentSyncState(SHARED_SYNC_PENDING);
    }
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
      if (requestSeq < supabaseSyncRequestSeq || requestSeq < supabaseSyncAppliedSeq) {
        return false;
      }
      if (SUPABASE_AUTHORITATIVE) {
        setSharedSyncState(SHARED_SYNC_FALLBACK, 'Supabase fetch failed. Showing local cache.');
        setTournamentSyncState(SHARED_SYNC_FALLBACK, 'Supabase fetch failed. Showing local cache.');
      }
      return false;
    }
    if (!Array.isArray(fetchedData)) {
      if (requestSeq < supabaseSyncRequestSeq || requestSeq < supabaseSyncAppliedSeq) {
        return false;
      }
      if (SUPABASE_AUTHORITATIVE) {
        setSharedSyncState(SHARED_SYNC_FALLBACK, 'Unexpected Supabase response. Showing local cache.');
        setTournamentSyncState(SHARED_SYNC_FALLBACK, 'Unexpected Supabase response. Showing local cache.');
      }
      return false;
    }

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

      const { data: tournamentRows, error: tournamentError } = await supabaseClient
        .from('players')
        .select('*')
        .eq('name', TOURNAMENT_STATE_ROW_NAME)
        .limit(5);
      if (tournamentError) {
        console.error('Supabase limited tournament state fetch error', tournamentError);
      } else if (Array.isArray(tournamentRows) && tournamentRows.length) {
        const byIdentity = new Set(
          data.map((row) => String((row && row.id) || (row && row.name) || '')).filter(Boolean)
        );
        tournamentRows.forEach((row) => {
          const key = String((row && row.id) || (row && row.name) || '');
          if (!key || byIdentity.has(key)) return;
          byIdentity.add(key);
          data.push(row);
        });
      }
    }

    const remoteGroupCatalog = [];
    const remotePlayers = [];
    const remoteTournamentEnvelopes = [];
    let invalidTournamentPayloadFound = false;
    data.forEach((p) => {
      if (isTournamentStateRow(p)) {
        const envelope = parseTournamentStoreTagEnvelope(p && p.tag);
        if (envelope && envelope.store && typeof envelope.store === 'object') {
          const rowUpdatedAt = Number(new Date(p && p.updated_at).getTime()) || 0;
          remoteTournamentEnvelopes.push({
            updatedAt: Math.max(Number(envelope.updatedAt) || 0, rowUpdatedAt),
            store: envelope.store
          });
        } else {
          invalidTournamentPayloadFound = true;
        }
        return;
      }

      const catalogGroup = parseGroupCatalogRowName(p && p.name);
      if (catalogGroup) {
        remoteGroupCatalog.push(catalogGroup);
        return;
      }

      const membershipDetails = parseRemotePlayerGroupDetails(p);
      const memberships = membershipDetails.groups;
      const group = memberships[0] || '';
      remotePlayers.push({
        name: p.name,
        skill: Number(p.skill) || 0,
        id: p.id,
        checked_in: !!p.checked_in,
        group,
        groups: memberships,
        hasEncodedGroups: membershipDetails.hasEncodedGroups
      });
    });

    // Ignore stale responses so older reads can't overwrite newer authoritative syncs.
    if (requestSeq < supabaseSyncRequestSeq || requestSeq < supabaseSyncAppliedSeq) {
      return true;
    }

    if (SUPABASE_AUTHORITATIVE) {
      if (!PLAYERS_SCHEMA_DETECTED) {
        setTournamentSyncState(SHARED_SYNC_PENDING);
      } else if (!HAS_TAG) {
        setTournamentSyncState(
          SHARED_SYNC_FALLBACK,
          'Tournament sync unavailable in this schema (players.tag required).'
        );
      } else {
        remoteTournamentEnvelopes.sort((a, b) => b.updatedAt - a.updatedAt);
        const hasValidTournamentStore = remoteTournamentEnvelopes.length > 0;
        if (!hasValidTournamentStore && invalidTournamentPayloadFound) {
          setTournamentSyncState(
            SHARED_SYNC_FALLBACK,
            'Tournament cloud payload is invalid. Using local fallback.'
          );
        } else {
          const latestStore = hasValidTournamentStore
            ? remoteTournamentEnvelopes[0].store
            : { activeTournamentId: '', tournaments: [] };
          applyTournamentStoreFromAuthority(latestStore);
          setTournamentSyncState(SHARED_SYNC_LIVE);
        }
      }
    }

    const merged = mergePlayersAfterSync(remotePlayers);
    state.players = merged.players;
    normalizePlayerGroupsInState();
    enforceSharedPlayerModelParity();
    normalizePlayerGroupsInState();
    state.checkedIn = normalizeCheckedInEntries(merged.checkedIn);
    if (SUPABASE_AUTHORITATIVE) {
      enforceCanonicalGroupState({
        catalogGroups: remoteGroupCatalog,
        includeExistingGroupsWhenNoCatalog: false
      });
      persistCanonicalGroupCache();
    } else {
      mergeRemoteGroupCatalogIntoState(remoteGroupCatalog);
      enforceCanonicalGroupState();
    }
    state.loaded = true;
    supabaseSyncAppliedSeq = Math.max(supabaseSyncAppliedSeq, requestSeq);
    if (SUPABASE_AUTHORITATIVE) {
      setSharedSyncState(SHARED_SYNC_LIVE);
    }
    return true;
  } catch (err) {
    console.error('Error syncing from Supabase', err);
    if (requestSeq < supabaseSyncRequestSeq || requestSeq < supabaseSyncAppliedSeq) {
      return false;
    }
    if (SUPABASE_AUTHORITATIVE) {
      const fallbackDetail = navigator.onLine
        ? 'Sync failed while online. Showing local cache.'
        : 'Offline. Showing local cache.';
      setSharedSyncState(SHARED_SYNC_FALLBACK, fallbackDetail);
      setTournamentSyncState(SHARED_SYNC_FALLBACK, fallbackDetail);
    }
    return false;
  }
}

async function reconcileToSupabaseAuthority(contextLabel = '') {
  if (!supabaseClient || !SUPABASE_AUTHORITATIVE) return false;
  const synced = await syncFromSupabase();
  if (!synced) {
    if (contextLabel) {
      console.warn(`Supabase authority reconcile skipped (${contextLabel}) because sync failed.`);
    }
    return false;
  }
  if (contextLabel) {
    setSharedSyncState(
      SHARED_SYNC_CONFLICT_RESOLVED,
      `Recovered via Supabase authority (${contextLabel}).`
    );
  }
  saveLocal();
  render();
  return true;
}

// Detect whether the 'players' table uses 'group' or 'tag'

let HAS_GROUP = false;
let HAS_TAG = false;
let PREFER_TAG_COLUMN = false;
let PLAYERS_SCHEMA_DETECTED = false;

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
  PLAYERS_SCHEMA_DETECTED = true;

  if (!HAS_GROUP && !HAS_TAG) {
    console.warn('[players] No group-like column found (neither "group" nor "tag"). Group changes will be local-only.');
  }

  if (enforceSharedPlayerModelParity()) {
    normalizePlayerGroupsInState();
    state.checkedIn = normalizeCheckedInEntries(state.checkedIn);
  }

  if (SUPABASE_AUTHORITATIVE && supabaseClient) {
    if (HAS_TAG) {
      if (state.tournamentSyncState !== SHARED_SYNC_LIVE && state.tournamentSyncState !== SHARED_SYNC_CONFLICT_RESOLVED) {
        setTournamentSyncState(SHARED_SYNC_PENDING);
      }
    } else {
      setTournamentSyncState(SHARED_SYNC_FALLBACK, 'Tournament sync unavailable in this schema (players.tag required).');
    }
  }
}

async function updatePlayerFieldsSupabase(id, fields) {
  if (!supabaseClient || !id) return false;
  if (!HAS_GROUP && !HAS_TAG) {
    await detectPlayersSchema();
  }

  const { group, groups, ...rest } = fields || {};
  const payload = { ...rest };
  const normalizedGroup = normalizeGroupName(typeof group === 'undefined' ? '' : group);
  const normalizedGroups = normalizeGroupList(Array.isArray(groups) ? groups : []);
  const canonicalGroups = (HAS_GROUP && HAS_TAG)
    ? normalizeGroupList([...(normalizedGroup ? [normalizedGroup] : []), ...normalizedGroups])
    : (normalizedGroup ? [normalizedGroup] : (normalizedGroups[0] ? [normalizedGroups[0]] : []));
  const canonicalPrimary = canonicalGroups[0] || '';

  if (typeof group !== 'undefined' || typeof groups !== 'undefined') {
    if (HAS_GROUP) payload.group = canonicalPrimary;
    else if (HAS_TAG) payload.tag = canonicalPrimary;
    // else: table has neither group-like column
  }

  if (HAS_GROUP && HAS_TAG && (typeof group !== 'undefined' || typeof groups !== 'undefined')) {
    payload.tag = serializePlayerGroupsTag(canonicalGroups, canonicalPrimary);
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

async function listGroupCatalogRowsSupabase() {
  if (!supabaseClient) return [];
  const { data, error } = await supabaseClient
    .from('players')
    .select('id,name,group,tag')
    .ilike('name', `${GROUP_CATALOG_NAME_PREFIX}%`);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function ensureGroupCatalogEntrySupabase(groupName) {
  if (!supabaseClient) return false;
  if (!HAS_GROUP && !HAS_TAG) {
    await detectPlayersSchema();
  }
  const normalized = normalizeGroupName(groupName);
  if (!normalized) return false;
  const rowName = toGroupCatalogRowName(normalized);
  const targetKey = normalizeGroupKey(normalized);

  try {
    const catalogRows = await listGroupCatalogRowsSupabase();
    const matchingRows = catalogRows.filter((row) => {
      const parsed = parseGroupCatalogRowName(row && row.name);
      return parsed && normalizeGroupKey(parsed) === targetKey;
    });

    if (matchingRows.length) {
      const existingRow = matchingRows[0];
      const payload = {};
      if (existingRow.name !== rowName) payload.name = rowName;
      if (HAS_GROUP && normalizeGroupName(existingRow.group || '') !== normalized) {
        payload.group = normalized;
      }
      if (HAS_TAG && normalizeGroupName(existingRow.tag || '') !== normalized) {
        payload.tag = normalized;
      }

      if (Object.keys(payload).length) {
        const { error: updateError } = await supabaseClient
          .from('players')
          .update(payload)
          .eq('id', existingRow.id);
        if (updateError) throw updateError;
      }

      const duplicateIds = matchingRows
        .slice(1)
        .map((row) => row && row.id)
        .filter(Boolean);
      for (const duplicateId of duplicateIds) {
        const { error: deleteError } = await supabaseClient
          .from('players')
          .delete()
          .eq('id', duplicateId);
        if (deleteError) {
          console.error('Supabase group catalog duplicate delete error', deleteError);
        }
      }
      return true;
    }

    const payload = { name: rowName, skill: 0 };
    if (HAS_GROUP) payload.group = normalized;
    if (HAS_TAG) payload.tag = normalized;

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
  const oldNormalized = normalizeGroupName(oldGroupName);
  const newNormalized = normalizeGroupName(newGroupName);
  if (!oldNormalized || !newNormalized) return false;
  const oldKey = normalizeGroupKey(oldNormalized);
  const newKey = normalizeGroupKey(newNormalized);

  try {
    if (oldKey !== newKey) {
      await deleteGroupCatalogEntrySupabase(oldNormalized);
    }
    return await ensureGroupCatalogEntrySupabase(newNormalized);
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
  const targetKey = normalizeGroupKey(groupName);
  if (!targetKey) return false;

  try {
    const catalogRows = await listGroupCatalogRowsSupabase();
    const matchingIds = catalogRows
      .filter((row) => {
        const parsed = parseGroupCatalogRowName(row && row.name);
        return parsed && normalizeGroupKey(parsed) === targetKey;
      })
      .map((row) => row && row.id)
      .filter(Boolean);

    if (!matchingIds.length) return true;

    let failed = false;
    for (const id of matchingIds) {
      const { error } = await supabaseClient
        .from('players')
        .delete()
        .eq('id', id);
      if (error) {
        failed = true;
        console.error('Supabase group catalog delete error', error);
      }
    }
    if (failed) return false;
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

async function forceSaveAllToSupabase() {
  if (!supabaseClient) {
    throw new Error('Supabase is not configured.');
  }

  if (!HAS_GROUP && !HAS_TAG) {
    await detectPlayersSchema();
  }

  // Cancel any pending delayed save; this path is an explicit immediate sync.
  clearTimeout(saveTimeout);

  normalizePlayerGroupsInState();
  ensurePlayerIdentityKeys();
  state.checkedIn = normalizeCheckedInEntries(state.checkedIn);
  const checkedSet = new Set(state.checkedIn || []);

  const summary = {
    updated: 0,
    inserted: 0,
    matchedByName: 0,
    failed: 0,
    catalogSynced: false,
    membershipsBackfilled: false,
    tournamentSynced: false
  };

  const { data: existingRows, error: existingError } = await supabaseClient
    .from('players')
    .select('id,name');
  if (existingError) throw existingError;

  const existingByName = new Map();
  (existingRows || []).forEach((row) => {
    const isCatalogRow = !!parseGroupCatalogRowName(row && row.name);
    if (isCatalogRow || isTournamentStateRow(row)) return;
    const key = normalize(row && row.name);
    if (!key || existingByName.has(key)) return;
    existingByName.set(key, row);
  });

  for (const player of (state.players || [])) {
    if (!player || typeof player !== 'object') continue;
    const playerName = String(player.name || '').trim();
    if (!playerName) continue;

    const primaryGroup = getPlayerPrimaryGroup(player);
    const groups = getPlayerGroups(player);
    const checkedIn = !!checkedSet.has(playerIdentityKey(player));
    const skill = Number(player.skill) || 0;

    let remoteId = player.id ? String(player.id) : '';
    if (!remoteId) {
      const matched = existingByName.get(normalize(playerName));
      if (matched && matched.id) {
        remoteId = String(matched.id);
        player.id = remoteId;
        summary.matchedByName += 1;
      }
    }

    if (remoteId) {
      const ok = await updatePlayerFieldsSupabase(remoteId, {
        name: playerName,
        skill,
        checked_in: checkedIn,
        group: primaryGroup,
        groups
      });
      if (ok) summary.updated += 1;
      else summary.failed += 1;
      continue;
    }

    const insertPayload = { name: playerName, skill, checked_in: checkedIn };
    if (HAS_GROUP) insertPayload.group = primaryGroup;
    if (HAS_TAG) {
      insertPayload.tag = HAS_GROUP
        ? serializePlayerGroupsTag(groups, primaryGroup)
        : (primaryGroup || '');
    }

    const { data: insertedRows, error: insertError } = await supabaseClient
      .from('players')
      .insert([insertPayload])
      .select('id,name');

    if (insertError) {
      console.error('Supabase force insert error', insertError);
      summary.failed += 1;
      continue;
    }

    const insertedId = Array.isArray(insertedRows) && insertedRows.length
      ? insertedRows[0].id
      : null;
    if (insertedId) {
      player.id = insertedId;
      existingByName.set(normalize(playerName), { id: insertedId, name: playerName });
    }
    summary.inserted += 1;
  }

  summary.catalogSynced = await backfillGroupCatalogToSupabase();
  summary.membershipsBackfilled = await backfillPlayerMembershipsToSupabase();
  summary.tournamentSynced = await syncTournamentStoreToSupabase();

  const synced = await syncFromSupabase();
  if (synced) saveLocal();
  return summary;
}

const TOURNAMENT_NOTICE_INFO = 'info';
const TOURNAMENT_NOTICE_ERROR = 'error';
const TOURNAMENT_NOTICE_SUCCESS = 'success';
const TOURNAMENT_UNSET_VALUE = '';
const tournamentViewState = {
  noticeText: '',
  noticeTone: TOURNAMENT_NOTICE_INFO
};

function setTournamentNotice(text, tone = TOURNAMENT_NOTICE_INFO) {
  tournamentViewState.noticeText = String(text || '').trim();
  tournamentViewState.noticeTone = tone || TOURNAMENT_NOTICE_INFO;
}

function clearTournamentNotice() {
  setTournamentNotice('', TOURNAMENT_NOTICE_INFO);
}

const TournamentManager = (() => {
  const LS_KEY = 'athletic_specimen_tournaments_v2';
  const FORMAT_RR = 'round_robin';
  const FORMAT_SE = 'single_elimination';
  const SOURCE_CHECKED_IN = 'checked_in';
  const SOURCE_GENERATED_TEAMS = 'generated_teams';
  const STATUS_SETUP = 'setup';
  const STATUS_ACTIVE = 'active';
  const STATUS_COMPLETED = 'completed';
  const MATCH_SCHEDULED = 'scheduled';
  const MATCH_LIVE = 'live';
  const MATCH_FINAL = 'final';

  const uid = () => `trn_${Math.random().toString(36).slice(2, 10)}`;

  function clampCourtCount(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return 2;
    return Math.max(1, Math.min(8, parsed));
  }

  function clampTeamCount(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return 2;
    return Math.max(2, Math.min(24, parsed));
  }

  function normalizeFormat(value) {
    const raw = String(value || '').trim();
    return raw === FORMAT_SE ? FORMAT_SE : FORMAT_RR;
  }

  function normalizeSourceMode(value) {
    const raw = String(value || '').trim();
    return raw === SOURCE_GENERATED_TEAMS ? SOURCE_GENERATED_TEAMS : SOURCE_CHECKED_IN;
  }

  function cloneDeep(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function blankStore() {
    return { activeTournamentId: '', tournaments: [] };
  }

  function normalizeTeamRecord(rawTeam, index = 0) {
    const memberKeys = Array.isArray(rawTeam?.memberKeys)
      ? Array.from(new Set(rawTeam.memberKeys.map((key) => String(key || '').trim()).filter(Boolean)))
      : [];
    return {
      id: String(rawTeam?.id || uid()),
      name: String(rawTeam?.name || `Team ${index + 1}`).trim() || `Team ${index + 1}`,
      seed: Number.isFinite(Number(rawTeam?.seed)) ? Number(rawTeam.seed) : index + 1,
      memberKeys
    };
  }

  function normalizeMatchRecord(rawMatch) {
    const scoreA = Number(rawMatch?.scoreA);
    const scoreB = Number(rawMatch?.scoreB);
    const statusRaw = String(rawMatch?.status || '').trim();
    const status = statusRaw === MATCH_LIVE || statusRaw === MATCH_FINAL
      ? statusRaw
      : MATCH_SCHEDULED;
    return {
      id: String(rawMatch?.id || uid()),
      round: Math.max(1, Number.parseInt(rawMatch?.round, 10) || 1),
      slot: Math.max(1, Number.parseInt(rawMatch?.slot, 10) || 1),
      bracket: String(rawMatch?.bracket || FORMAT_RR),
      court: Math.max(1, Number.parseInt(rawMatch?.court, 10) || 1),
      teamAId: rawMatch?.teamAId ? String(rawMatch.teamAId) : null,
      teamBId: rawMatch?.teamBId ? String(rawMatch.teamBId) : null,
      teamAResolved: rawMatch?.teamAResolved === false ? false : true,
      teamBResolved: rawMatch?.teamBResolved === false ? false : true,
      sourceAId: rawMatch?.sourceAId ? String(rawMatch.sourceAId) : null,
      sourceBId: rawMatch?.sourceBId ? String(rawMatch.sourceBId) : null,
      nextMatchId: rawMatch?.nextMatchId ? String(rawMatch.nextMatchId) : null,
      nextSlot: rawMatch?.nextSlot === 'B' ? 'B' : (rawMatch?.nextSlot === 'A' ? 'A' : null),
      status,
      scoreA: Number.isFinite(scoreA) ? scoreA : null,
      scoreB: Number.isFinite(scoreB) ? scoreB : null,
      winnerTeamId: rawMatch?.winnerTeamId ? String(rawMatch.winnerTeamId) : null,
      loserTeamId: rawMatch?.loserTeamId ? String(rawMatch.loserTeamId) : null
    };
  }

  function normalizeTournamentRecord(rawTournament) {
    const teams = Array.isArray(rawTournament?.teams)
      ? rawTournament.teams.map((team, index) => normalizeTeamRecord(team, index))
      : [];
    const matches = Array.isArray(rawTournament?.matches)
      ? rawTournament.matches.map((match) => normalizeMatchRecord(match))
      : [];
    const format = normalizeFormat(rawTournament?.format);
    const sourceMode = normalizeSourceMode(rawTournament?.sourceMode);
    const courtCount = clampCourtCount(rawTournament?.courtCount);
    const teamCount = clampTeamCount(rawTournament?.teamCount || teams.length || 2);
    const sourceGroup = normalizeActiveGroupSelection(rawTournament?.sourceGroup || 'All');
    const statusRaw = String(rawTournament?.status || '').trim();
    const status = statusRaw === STATUS_ACTIVE || statusRaw === STATUS_COMPLETED
      ? statusRaw
      : STATUS_SETUP;

    return {
      id: String(rawTournament?.id || uid()),
      name: String(rawTournament?.name || 'Tournament').trim() || 'Tournament',
      format,
      sourceMode,
      status,
      courtCount,
      sourceGroup,
      teamCount,
      teams,
      matches,
      teamBuildSummary: rawTournament?.teamBuildSummary && typeof rawTournament.teamBuildSummary === 'object'
        ? rawTournament.teamBuildSummary
        : null,
      createdAt: Number(rawTournament?.createdAt) || Date.now(),
      updatedAt: Number(rawTournament?.updatedAt) || Date.now()
    };
  }

  function normalizeStorePayload(rawStore) {
    if (!rawStore || typeof rawStore !== 'object') return blankStore();
    const tournaments = Array.isArray(rawStore.tournaments)
      ? rawStore.tournaments.map((t) => normalizeTournamentRecord(t))
      : [];
    const validIds = new Set(tournaments.map((t) => t.id));
    const activeTournamentId = validIds.has(String(rawStore.activeTournamentId || ''))
      ? String(rawStore.activeTournamentId)
      : (tournaments[0]?.id || '');
    return { activeTournamentId, tournaments };
  }

  function loadStore() {
    try {
      const raw = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      return normalizeStorePayload(raw);
    } catch {
      return blankStore();
    }
  }

  function saveStore(store) {
    localStorage.setItem(LS_KEY, JSON.stringify(store));
  }

  function getStoreSnapshot() {
    return cloneDeep(loadStore());
  }

  function replaceStore(rawStore) {
    const normalized = normalizeStorePayload(rawStore);
    saveStore(normalized);
    return cloneDeep(normalized);
  }

  function getAll() {
    return loadStore().tournaments;
  }

  function getById(id) {
    const target = String(id || '').trim();
    if (!target) return null;
    return getAll().find((tournament) => tournament.id === target) || null;
  }

  function getActiveId() {
    return String(loadStore().activeTournamentId || '');
  }

  function setActive(id) {
    const store = loadStore();
    const target = String(id || '').trim();
    const exists = store.tournaments.some((tournament) => tournament.id === target);
    store.activeTournamentId = exists ? target : (store.tournaments[0]?.id || '');
    saveStore(store);
    return store.activeTournamentId;
  }

  function mutateTournament(id, mutator) {
    const store = loadStore();
    const target = String(id || '').trim();
    const idx = store.tournaments.findIndex((tournament) => tournament.id === target);
    if (idx === -1) return { ok: false, error: 'Tournament not found.' };

    const draft = cloneDeep(store.tournaments[idx]);
    const result = mutator(draft);
    if (result && result.ok === false) return result;

    draft.updatedAt = Date.now();
    store.tournaments[idx] = draft;
    if (!store.activeTournamentId) store.activeTournamentId = draft.id;
    saveStore(store);
    return { ok: true, tournament: draft };
  }

  function playerMatchesGroupFilter(player, groupFilter) {
    const normalized = normalizeActiveGroupSelection(groupFilter || 'All');
    if (normalized === 'All') return true;
    if (normalized === UNGROUPED_FILTER_VALUE) return isPlayerUngrouped(player);
    return playerBelongsToGroup(player, normalized);
  }

  function collectCheckedInPlayers(groupFilter) {
    ensurePlayerIdentityKeys();
    const checkedSet = new Set(normalizeCheckedInEntries(state.checkedIn || []));
    return (state.players || [])
      .filter((player) => checkedSet.has(playerIdentityKey(player)))
      .filter((player) => playerMatchesGroupFilter(player, groupFilter));
  }

  function buildTeamsFromCheckedIn(groupFilter, requestedTeamCount) {
    const sourcePlayers = collectCheckedInPlayers(groupFilter);
    if (sourcePlayers.length < 2) {
      return {
        ok: false,
        error: 'Need at least two checked-in players in the selected source.'
      };
    }

    const teamCount = Math.max(2, Math.min(clampTeamCount(requestedTeamCount), sourcePlayers.length));
    const sourceKeys = sourcePlayers.map((player) => playerIdentityKey(player));
    const generated = generateBalancedGroups(sourcePlayers, sourceKeys, teamCount);

    const teams = (generated.teams || [])
      .map((members, teamIndex) => {
        const memberKeys = Array.from(
          new Set((members || []).map((member) => playerIdentityKey(member)).filter(Boolean))
        );
        return {
          id: uid(),
          name: `Team ${teamIndex + 1}`,
          seed: teamIndex + 1,
          memberKeys
        };
      })
      .filter((team) => team.memberKeys.length > 0);

    if (teams.length < 2) {
      return { ok: false, error: 'Need at least two non-empty teams for tournament matches.' };
    }

    return {
      ok: true,
      teams,
      teamCount: teams.length,
      summary: generated.summary || null,
      sourceCount: sourcePlayers.length
    };
  }

  function buildTeamsFromGeneratedTeams() {
    ensurePlayerIdentityKeys();
    const sourceTeams = Array.isArray(state.generatedTeams) ? state.generatedTeams : [];
    if (sourceTeams.length < 2) {
      return {
        ok: false,
        error: 'Need at least two generated teams. Generate teams first in the Teams section.'
      };
    }

    const seen = new Set();
    const teams = sourceTeams.map((members, index) => {
      const memberKeys = Array.from(
        new Set(
          (Array.isArray(members) ? members : [])
            .map((member) => playerIdentityKey(member))
            .filter((key) => key && !seen.has(key))
        )
      );
      memberKeys.forEach((key) => seen.add(key));
      return {
        id: uid(),
        name: `Team ${index + 1}`,
        seed: index + 1,
        memberKeys
      };
    }).filter((team) => team.memberKeys.length > 0);

    if (teams.length < 2) {
      return { ok: false, error: 'Need at least two non-empty generated teams for tournament matches.' };
    }

    return {
      ok: true,
      teams,
      teamCount: teams.length,
      summary: sanitizeGeneratedTeamsSummary(state.generatedTeamsSummary) || null,
      sourceCount: seen.size
    };
  }

  function buildTeamsFromSource(sourceMode, groupFilter, requestedTeamCount) {
    const mode = normalizeSourceMode(sourceMode);
    if (mode === SOURCE_GENERATED_TEAMS) {
      return buildTeamsFromGeneratedTeams();
    }
    return buildTeamsFromCheckedIn(groupFilter, requestedTeamCount);
  }

  function getTeamMap(tournament) {
    return new Map((tournament.teams || []).map((team) => [team.id, team]));
  }

  function sortMatches(matches) {
    return (matches || []).slice().sort((a, b) => {
      if (a.round !== b.round) return a.round - b.round;
      if (a.slot !== b.slot) return a.slot - b.slot;
      return String(a.id).localeCompare(String(b.id));
    });
  }

  function roundRobinPairings(teamIds) {
    const ids = teamIds.slice();
    if (ids.length % 2 === 1) ids.push(null);
    const rounds = [];
    const total = ids.length;

    for (let round = 0; round < total - 1; round += 1) {
      const pairs = [];
      for (let i = 0; i < total / 2; i += 1) {
        const teamAId = ids[i];
        const teamBId = ids[total - 1 - i];
        if (teamAId && teamBId) pairs.push([teamAId, teamBId]);
      }
      rounds.push(pairs);
      const fixed = ids[0];
      const rotating = ids.slice(1);
      rotating.unshift(rotating.pop());
      ids.splice(0, ids.length, fixed, ...rotating);
    }

    return rounds;
  }

  function buildRoundRobinMatches(teams, courtCount) {
    const pairsByRound = roundRobinPairings(teams.map((team) => team.id));
    const matches = [];
    pairsByRound.forEach((pairs, roundIndex) => {
      pairs.forEach((pair, pairIndex) => {
        matches.push({
          id: uid(),
          round: roundIndex + 1,
          slot: pairIndex + 1,
          bracket: FORMAT_RR,
          court: (pairIndex % courtCount) + 1,
          teamAId: pair[0],
          teamBId: pair[1],
          teamAResolved: true,
          teamBResolved: true,
          sourceAId: null,
          sourceBId: null,
          nextMatchId: null,
          nextSlot: null,
          status: MATCH_SCHEDULED,
          scoreA: null,
          scoreB: null,
          winnerTeamId: null,
          loserTeamId: null
        });
      });
    });
    return matches;
  }

  function makeSingleEliminationTemplate(teamCount, courtCount) {
    const bracketSize = 2 ** Math.ceil(Math.log2(Math.max(2, teamCount)));
    const totalRounds = Math.log2(bracketSize);
    const rounds = [];
    const matches = [];

    for (let round = 1; round <= totalRounds; round += 1) {
      const matchesInRound = bracketSize / (2 ** round);
      const roundMatches = [];
      for (let slot = 1; slot <= matchesInRound; slot += 1) {
        const match = {
          id: uid(),
          round,
          slot,
          bracket: FORMAT_SE,
          court: ((slot - 1) % courtCount) + 1,
          teamAId: null,
          teamBId: null,
          teamAResolved: round === 1,
          teamBResolved: round === 1,
          sourceAId: null,
          sourceBId: null,
          nextMatchId: null,
          nextSlot: null,
          status: MATCH_SCHEDULED,
          scoreA: null,
          scoreB: null,
          winnerTeamId: null,
          loserTeamId: null
        };
        roundMatches.push(match);
        matches.push(match);
      }
      rounds.push(roundMatches);
    }

    for (let round = 1; round < totalRounds; round += 1) {
      const currentRound = rounds[round - 1];
      const nextRound = rounds[round];
      currentRound.forEach((match) => {
        const nextSlot = Math.ceil(match.slot / 2);
        const nextMatch = nextRound[nextSlot - 1];
        if (!nextMatch) return;
        match.nextMatchId = nextMatch.id;
        match.nextSlot = match.slot % 2 === 1 ? 'A' : 'B';
        if (match.nextSlot === 'A') nextMatch.sourceAId = match.id;
        if (match.nextSlot === 'B') nextMatch.sourceBId = match.id;
      });
    }

    return { matches, rounds };
  }

  function setFinalOutcome(match, winnerTeamId, loserTeamId, scoreA, scoreB) {
    match.status = MATCH_FINAL;
    match.winnerTeamId = winnerTeamId || null;
    match.loserTeamId = loserTeamId || null;
    match.scoreA = Number.isFinite(scoreA) ? scoreA : null;
    match.scoreB = Number.isFinite(scoreB) ? scoreB : null;
    match.teamAResolved = true;
    match.teamBResolved = true;
  }

  function resolveSingleEliminationAuto(matchMap, match) {
    if (!match || match.status === MATCH_FINAL) return;
    if (!match.teamAResolved || !match.teamBResolved) return;

    const teamAId = match.teamAId || null;
    const teamBId = match.teamBId || null;

    if (teamAId && teamBId) {
      if (match.status !== MATCH_LIVE) match.status = MATCH_SCHEDULED;
      return;
    }

    if (!teamAId && !teamBId) {
      setFinalOutcome(match, null, null, null, null);
      if (match.nextMatchId) {
        const next = matchMap.get(match.nextMatchId);
        if (next) {
          if (match.nextSlot === 'A') {
            next.teamAId = null;
            next.teamAResolved = true;
          } else if (match.nextSlot === 'B') {
            next.teamBId = null;
            next.teamBResolved = true;
          }
          resolveSingleEliminationAuto(matchMap, next);
        }
      }
      return;
    }

    const winnerTeamId = teamAId || teamBId;
    const loserTeamId = null;
    const scoreA = winnerTeamId === teamAId ? 1 : 0;
    const scoreB = winnerTeamId === teamBId ? 1 : 0;
    setFinalOutcome(match, winnerTeamId, loserTeamId, scoreA, scoreB);

    if (match.nextMatchId) {
      const next = matchMap.get(match.nextMatchId);
      if (next) {
        if (match.nextSlot === 'A') {
          next.teamAId = winnerTeamId;
          next.teamAResolved = true;
        } else if (match.nextSlot === 'B') {
          next.teamBId = winnerTeamId;
          next.teamBResolved = true;
        }
        resolveSingleEliminationAuto(matchMap, next);
      }
    }
  }

  function buildSingleEliminationMatches(teams, courtCount) {
    const seededTeamIds = teams.map((team) => team.id);
    const template = makeSingleEliminationTemplate(seededTeamIds.length, courtCount);
    const firstRound = template.rounds[0] || [];
    const bracketSize = firstRound.length * 2;
    const seeds = seededTeamIds.slice();
    while (seeds.length < bracketSize) seeds.push(null);

    firstRound.forEach((match, index) => {
      match.teamAId = seeds[index * 2] || null;
      match.teamBId = seeds[index * 2 + 1] || null;
      match.teamAResolved = true;
      match.teamBResolved = true;
      match.status = MATCH_SCHEDULED;
    });

    const matchMap = new Map(template.matches.map((match) => [match.id, match]));
    firstRound.forEach((match) => resolveSingleEliminationAuto(matchMap, match));

    return sortMatches(template.matches);
  }

  function recalcTournamentStatus(tournament) {
    const matches = tournament.matches || [];
    if (!matches.length) {
      tournament.status = STATUS_SETUP;
      return;
    }
    const allFinal = matches.every((match) => match.status === MATCH_FINAL);
    tournament.status = allFinal ? STATUS_COMPLETED : STATUS_ACTIVE;
  }

  function rebuildTournamentMatches(tournament) {
    if (!Array.isArray(tournament.teams) || tournament.teams.length < 2) {
      return { ok: false, error: 'Need at least two teams before generating matches.' };
    }
    const courtCount = clampCourtCount(tournament.courtCount);
    const format = normalizeFormat(tournament.format);
    const matches = format === FORMAT_SE
      ? buildSingleEliminationMatches(tournament.teams, courtCount)
      : buildRoundRobinMatches(tournament.teams, courtCount);

    tournament.matches = matches;
    recalcTournamentStatus(tournament);
    return { ok: true, tournament };
  }

  function createTournament({ name, format, sourceMode, courtCount, groupFilter, teamCount }) {
    const safeName = String(name || '').trim();
    if (!safeName) return { ok: false, error: 'Tournament name is required.' };

    const normalizedSourceMode = normalizeSourceMode(sourceMode);
    const group = normalizeActiveGroupSelection(groupFilter || 'All');
    const built = buildTeamsFromSource(normalizedSourceMode, group, teamCount);
    if (!built.ok) return built;

    const now = Date.now();
    const tournament = {
      id: uid(),
      name: safeName,
      format: normalizeFormat(format),
      sourceMode: normalizedSourceMode,
      status: STATUS_SETUP,
      courtCount: clampCourtCount(courtCount),
      sourceGroup: group,
      teamCount: built.teamCount,
      teams: built.teams,
      matches: [],
      teamBuildSummary: built.summary,
      createdAt: now,
      updatedAt: now
    };

    const store = loadStore();
    store.tournaments.push(tournament);
    store.activeTournamentId = tournament.id;
    saveStore(store);
    return { ok: true, tournament };
  }

  function deleteTournament(id) {
    const target = String(id || '').trim();
    if (!target) return { ok: false, error: 'Tournament not found.' };
    const store = loadStore();
    const next = store.tournaments.filter((tournament) => tournament.id !== target);
    if (next.length === store.tournaments.length) {
      return { ok: false, error: 'Tournament not found.' };
    }
    store.tournaments = next;
    if (store.activeTournamentId === target) {
      store.activeTournamentId = next[0]?.id || '';
    }
    saveStore(store);
    return { ok: true };
  }

  function rebuildTeams(id, { sourceMode, groupFilter, teamCount }) {
    return mutateTournament(id, (tournament) => {
      const mode = normalizeSourceMode(sourceMode || tournament.sourceMode || SOURCE_CHECKED_IN);
      const group = normalizeActiveGroupSelection(
        groupFilter || tournament.sourceGroup || 'All'
      );
      const built = buildTeamsFromSource(mode, group, teamCount || tournament.teamCount);
      if (!built.ok) return built;
      tournament.sourceMode = mode;
      tournament.sourceGroup = group;
      tournament.teamCount = built.teamCount;
      tournament.teams = built.teams;
      tournament.teamBuildSummary = built.summary;
      tournament.matches = [];
      tournament.status = STATUS_SETUP;
      return { ok: true };
    });
  }

  function renameTeam(id, teamId, nextName) {
    const safeTeamId = String(teamId || '').trim();
    const safeName = String(nextName || '').trim();
    if (!safeTeamId || !safeName) return { ok: false, error: 'Team name cannot be empty.' };
    return mutateTournament(id, (tournament) => {
      const team = (tournament.teams || []).find((item) => item.id === safeTeamId);
      if (!team) return { ok: false, error: 'Team not found.' };
      team.name = safeName;
      return { ok: true };
    });
  }

  function moveMember(id, memberKey, toTeamId) {
    const safeMemberKey = String(memberKey || '').trim();
    const safeTargetTeamId = String(toTeamId || '').trim();
    if (!safeMemberKey || !safeTargetTeamId) {
      return { ok: false, error: 'Choose a player and destination team.' };
    }

    return mutateTournament(id, (tournament) => {
      const teams = tournament.teams || [];
      const fromTeam = teams.find((team) => (team.memberKeys || []).includes(safeMemberKey));
      const toTeam = teams.find((team) => team.id === safeTargetTeamId);
      if (!fromTeam || !toTeam) return { ok: false, error: 'Team move target not found.' };
      if (fromTeam.id === toTeam.id) return { ok: false, error: 'Player is already on that team.' };

      fromTeam.memberKeys = (fromTeam.memberKeys || []).filter((key) => key !== safeMemberKey);
      toTeam.memberKeys = Array.from(new Set([...(toTeam.memberKeys || []), safeMemberKey]));
      return { ok: true };
    });
  }

  function resetMatches(id) {
    return mutateTournament(id, (tournament) => {
      const built = rebuildTournamentMatches(tournament);
      if (!built.ok) return built;
      return { ok: true };
    });
  }

  function generateMatches(id) {
    return resetMatches(id);
  }

  function startMatch(id, matchId) {
    const safeMatchId = String(matchId || '').trim();
    if (!safeMatchId) return { ok: false, error: 'Match not found.' };
    return mutateTournament(id, (tournament) => {
      const match = (tournament.matches || []).find((item) => item.id === safeMatchId);
      if (!match) return { ok: false, error: 'Match not found.' };
      if (match.status === MATCH_FINAL) return { ok: false, error: 'Match is already final.' };
      if (!match.teamAId || !match.teamBId) return { ok: false, error: 'Match is waiting for teams.' };
      match.status = MATCH_LIVE;
      recalcTournamentStatus(tournament);
      return { ok: true };
    });
  }

  function advanceSingleEliminationResult(tournament, match) {
    if (!match.nextMatchId) return;
    const matchMap = new Map((tournament.matches || []).map((item) => [item.id, item]));
    const nextMatch = matchMap.get(match.nextMatchId);
    if (!nextMatch) return;

    if (match.nextSlot === 'A') {
      nextMatch.teamAId = match.winnerTeamId || null;
      nextMatch.teamAResolved = true;
    } else if (match.nextSlot === 'B') {
      nextMatch.teamBId = match.winnerTeamId || null;
      nextMatch.teamBResolved = true;
    }
    resolveSingleEliminationAuto(matchMap, nextMatch);
  }

  function finalizeMatch(id, matchId, scoreA, scoreB) {
    const safeMatchId = String(matchId || '').trim();
    if (!safeMatchId) return { ok: false, error: 'Match not found.' };

    const a = Number(scoreA);
    const b = Number(scoreB);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) {
      return { ok: false, error: 'Scores must be zero or higher numbers.' };
    }
    if (a === b) return { ok: false, error: 'Tie scores are not supported.' };

    return mutateTournament(id, (tournament) => {
      const match = (tournament.matches || []).find((item) => item.id === safeMatchId);
      if (!match) return { ok: false, error: 'Match not found.' };
      if (match.status === MATCH_FINAL) return { ok: false, error: 'Match is already final.' };
      if (!match.teamAId || !match.teamBId) return { ok: false, error: 'Match is waiting for teams.' };

      const winnerTeamId = a > b ? match.teamAId : match.teamBId;
      const loserTeamId = winnerTeamId === match.teamAId ? match.teamBId : match.teamAId;
      setFinalOutcome(match, winnerTeamId, loserTeamId, a, b);

      if (normalizeFormat(tournament.format) === FORMAT_SE) {
        advanceSingleEliminationResult(tournament, match);
      }

      recalcTournamentStatus(tournament);
      return { ok: true };
    });
  }

  function getRoundRobinStandings(tournament) {
    if (!tournament || normalizeFormat(tournament.format) !== FORMAT_RR) return [];
    const teamMap = getTeamMap(tournament);
    const rows = (tournament.teams || []).map((team) => ({
      teamId: team.id,
      teamName: team.name,
      wins: 0,
      losses: 0,
      pf: 0,
      pa: 0,
      pd: 0
    }));
    const rowById = new Map(rows.map((row) => [row.teamId, row]));

    (tournament.matches || []).forEach((match) => {
      if (match.status !== MATCH_FINAL) return;
      if (!match.teamAId || !match.teamBId) return;
      if (!teamMap.has(match.teamAId) || !teamMap.has(match.teamBId)) return;
      const scoreA = Number(match.scoreA);
      const scoreB = Number(match.scoreB);
      if (!Number.isFinite(scoreA) || !Number.isFinite(scoreB)) return;

      const rowA = rowById.get(match.teamAId);
      const rowB = rowById.get(match.teamBId);
      if (!rowA || !rowB) return;

      rowA.pf += scoreA;
      rowA.pa += scoreB;
      rowB.pf += scoreB;
      rowB.pa += scoreA;

      if (scoreA > scoreB) {
        rowA.wins += 1;
        rowB.losses += 1;
      } else if (scoreB > scoreA) {
        rowB.wins += 1;
        rowA.losses += 1;
      }
    });

    rows.forEach((row) => {
      row.pd = row.pf - row.pa;
    });

    rows.sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.pd !== a.pd) return b.pd - a.pd;
      if (b.pf !== a.pf) return b.pf - a.pf;
      return a.teamName.localeCompare(b.teamName, undefined, { sensitivity: 'base' });
    });

    return rows;
  }

  function getSingleEliminationRounds(tournament) {
    if (!tournament || normalizeFormat(tournament.format) !== FORMAT_SE) return [];
    const grouped = new Map();
    (tournament.matches || []).forEach((match) => {
      const key = Number(match.round) || 1;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(match);
    });
    return Array.from(grouped.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([round, matches]) => ({
        round,
        matches: sortMatches(matches)
      }));
  }

  function getChampionTeamId(tournament) {
    if (!tournament || normalizeFormat(tournament.format) !== FORMAT_SE) return null;
    const rounds = getSingleEliminationRounds(tournament);
    if (!rounds.length) return null;
    const finalRound = rounds[rounds.length - 1];
    const championship = finalRound.matches[0];
    return championship?.winnerTeamId || null;
  }

  return {
    FORMAT_RR,
    FORMAT_SE,
    SOURCE_CHECKED_IN,
    SOURCE_GENERATED_TEAMS,
    STATUS_SETUP,
    STATUS_ACTIVE,
    STATUS_COMPLETED,
    MATCH_SCHEDULED,
    MATCH_LIVE,
    MATCH_FINAL,
    getStoreSnapshot,
    replaceStore,
    getAll,
    getById,
    getActiveId,
    setActive,
    createTournament,
    deleteTournament,
    rebuildTeams,
    renameTeam,
    moveMember,
    resetMatches,
    generateMatches,
    startMatch,
    finalizeMatch,
    getRoundRobinStandings,
    getSingleEliminationRounds,
    getChampionTeamId
  };
})();

function formatTournamentFormatLabel(format) {
  return format === TournamentManager.FORMAT_SE ? 'Single Elimination' : 'Round Robin';
}

function formatTournamentSourceLabel(tournament) {
  const mode = String(tournament?.sourceMode || TournamentManager.SOURCE_CHECKED_IN);
  const groupLabel = formatTournamentGroupLabel(tournament?.sourceGroup || 'All');
  if (mode === TournamentManager.SOURCE_GENERATED_TEAMS) return 'Generated Teams';
  return `Checked-In (${groupLabel})`;
}

function formatTournamentStatusLabel(status) {
  if (status === TournamentManager.STATUS_COMPLETED) return 'Completed';
  if (status === TournamentManager.STATUS_ACTIVE) return 'Active';
  return 'Setup';
}

function formatTournamentGroupLabel(groupValue) {
  const normalized = normalizeActiveGroupSelection(groupValue || 'All');
  if (normalized === UNGROUPED_FILTER_VALUE) return UNGROUPED_FILTER_LABEL;
  return normalized || 'All';
}

function getTournamentGroupOptions(selectedValue) {
  const selected = normalizeActiveGroupSelection(selectedValue || 'All');
  const groups = state.limitedGroup
    ? [normalizeGroupName(state.limitedGroup)]
    : getAvailableGroups();
  const options = ['All', ...groups.filter((groupName) => groupName && groupName !== 'All')];
  const normalizedOptions = Array.from(new Set(options.map((option) => normalizeActiveGroupSelection(option))));
  if (!normalizedOptions.includes(UNGROUPED_FILTER_VALUE)) {
    normalizedOptions.push(UNGROUPED_FILTER_VALUE);
  }
  return normalizedOptions.map((value) => {
    const label = value === UNGROUPED_FILTER_VALUE ? UNGROUPED_FILTER_LABEL : value;
    const isSelected = normalizeActiveGroupSelection(value) === selected;
    return `<option value="${escapeHTMLText(value)}" ${isSelected ? 'selected' : ''}>${escapeHTMLText(label)}</option>`;
  }).join('');
}

function getTournamentPlayerLookup() {
  ensurePlayerIdentityKeys();
  const map = new Map();
  (state.players || []).forEach((player) => {
    const key = playerIdentityKey(player);
    if (!key) return;
    map.set(key, player);
  });
  return map;
}

function getTournamentTeamName(tournament, teamId) {
  if (!teamId) return 'TBD';
  const team = (tournament?.teams || []).find((item) => item.id === teamId);
  return team ? team.name : 'TBD';
}

function buildTournamentStatusBadge(status) {
  const normalized = status === TournamentManager.MATCH_FINAL
    ? 'final'
    : (status === TournamentManager.MATCH_LIVE ? 'live' : 'scheduled');
  const label = normalized === 'final' ? 'Final' : (normalized === 'live' ? 'Live' : 'Scheduled');
  return `<span class="tournament-status-badge is-${normalized}">${label}</span>`;
}

function renderTournamentNoticeHTML() {
  if (!tournamentViewState.noticeText) return '';
  const tone = tournamentViewState.noticeTone || TOURNAMENT_NOTICE_INFO;
  const safeTone = tone === TOURNAMENT_NOTICE_ERROR || tone === TOURNAMENT_NOTICE_SUCCESS
    ? tone
    : TOURNAMENT_NOTICE_INFO;
  return `<p class="tournament-notice is-${safeTone}">${escapeHTMLText(tournamentViewState.noticeText)}</p>`;
}

function renderTournamentHeaderCardHTML(tournament) {
  const defaultGroup = state.limitedGroup
    ? normalizeGroupName(state.limitedGroup)
    : normalizeActiveGroupSelection(state.activeGroup || 'All');
  const selectedGroup = tournament
    ? normalizeActiveGroupSelection(tournament.sourceGroup || defaultGroup || 'All')
    : normalizeActiveGroupSelection(defaultGroup || 'All');
  const isLockedToGroup = !!state.limitedGroup;
  const teamCount = tournament
    ? Math.max(2, Number.parseInt(tournament.teamCount, 10) || 2)
    : Math.max(2, Math.floor((state.checkedIn || []).length / 6) || 2);
  const courtCount = tournament
    ? Math.max(1, Number.parseInt(tournament.courtCount, 10) || 2)
    : 2;
  const format = tournament ? tournament.format : TournamentManager.FORMAT_RR;
  const sourceMode = tournament
    ? String(tournament.sourceMode || TournamentManager.SOURCE_CHECKED_IN)
    : TournamentManager.SOURCE_CHECKED_IN;
  const sourceModeIsGenerated = sourceMode === TournamentManager.SOURCE_GENERATED_TEAMS;
  const nameValue = tournament ? tournament.name : '';
  const matchCount = Array.isArray(tournament?.matches) ? tournament.matches.length : 0;
  const finalCount = Array.isArray(tournament?.matches)
    ? tournament.matches.filter((match) => match.status === TournamentManager.MATCH_FINAL).length
    : 0;
  const nextStepText = tournament
    ? (
      matchCount === 0
        ? 'Generate matches to begin the tournament.'
        : (tournament.status === TournamentManager.STATUS_COMPLETED
          ? 'Tournament is complete. Review standings or reset matches.'
          : `${matchCount - finalCount} matches remain. Start or finalize the next match.`)
    )
    : 'Create a tournament to begin.';
  const tournamentSyncNoticeHTML = buildTournamentSyncNoticeHTML();

  const summaryHTML = tournament ? `
    <div class="tournament-meta-grid">
      <div><strong>Name:</strong> ${escapeHTMLText(tournament.name)}</div>
      <div><strong>Format:</strong> ${escapeHTMLText(formatTournamentFormatLabel(tournament.format))}</div>
      <div><strong>Status:</strong> ${escapeHTMLText(formatTournamentStatusLabel(tournament.status))}</div>
      <div><strong>Courts:</strong> ${Number(tournament.courtCount) || 1}</div>
      <div><strong>Source:</strong> ${escapeHTMLText(formatTournamentSourceLabel(tournament))}</div>
      <div><strong>Teams:</strong> ${(tournament.teams || []).length}</div>
    </div>
    <p class="small" style="margin-top:0.55rem;"><strong>Next Step:</strong> ${escapeHTMLText(nextStepText)}</p>
  ` : '<p class="small">Create a tournament to start event flow.</p>';

  const adminControlsHTML = state.isAdmin ? `
    <div class="tournament-section">
      <h4>Create / Update Tournament</h4>
      <div class="tournament-input-grid">
        <input type="text" id="trn-name" placeholder="Tournament name" value="${escapeHTMLText(nameValue)}" />
        <select id="trn-format">
          <option value="${TournamentManager.FORMAT_RR}" ${format === TournamentManager.FORMAT_RR ? 'selected' : ''}>Round Robin</option>
          <option value="${TournamentManager.FORMAT_SE}" ${format === TournamentManager.FORMAT_SE ? 'selected' : ''}>Single Elimination</option>
        </select>
        <select id="trn-source-mode">
          <option value="${TournamentManager.SOURCE_CHECKED_IN}" ${!sourceModeIsGenerated ? 'selected' : ''}>Source: Checked-In</option>
          <option value="${TournamentManager.SOURCE_GENERATED_TEAMS}" ${sourceModeIsGenerated ? 'selected' : ''}>Source: Generated Teams</option>
        </select>
        <input type="number" id="trn-court-count" min="1" max="8" value="${courtCount}" />
        <select id="trn-source-group" ${(isLockedToGroup || sourceModeIsGenerated) ? 'disabled' : ''}>
          ${getTournamentGroupOptions(selectedGroup)}
        </select>
        <input type="number" id="trn-team-count" min="2" max="24" value="${teamCount}" />
      </div>
      ${sourceModeIsGenerated ? '<p class="small" style="margin-top:-0.2rem;">Generated Teams source uses current Teams tab assignments.</p>' : ''}
      <div class="row">
        <button type="button" data-tr-action="create-tournament">Create Tournament</button>
        ${tournament ? `
          <button type="button" class="secondary" data-tr-action="rebuild-teams">Auto Build Teams</button>
          <button type="button" class="secondary" data-tr-action="generate-matches">Generate Matches</button>
          <button type="button" class="secondary" data-tr-action="reset-matches">Reset Matches</button>
          <button type="button" class="danger" data-tr-action="delete-tournament">Delete Tournament</button>
        ` : ''}
      </div>
    </div>
  ` : '';

  return `
    ${tournamentSyncNoticeHTML}
    ${summaryHTML}
    ${adminControlsHTML}
  `;
}

function renderTournamentAdminCardHTML(tournament) {
  if (!state.isAdmin) return '';
  if (!tournament) {
    return '<p class="small">No tournament selected. Create one to access admin controls.</p>';
  }

  const playerLookup = getTournamentPlayerLookup();
  const teams = tournament.teams || [];
  const matches = (tournament.matches || []).slice().sort((a, b) => {
    if (a.round !== b.round) return a.round - b.round;
    if (a.slot !== b.slot) return a.slot - b.slot;
    return String(a.id).localeCompare(String(b.id));
  });

  const teamCardsHTML = teams.length ? `
    <div class="tournament-team-grid">
      ${teams.map((team) => {
        const members = (team.memberKeys || []).map((key) => {
          const player = playerLookup.get(key);
          if (!player) return `<li class="small">${escapeHTMLText(key)}</li>`;
          return `<li>${escapeHTMLText(player.name)} <span class="small">(Skill ${Number(player.skill) || 0})</span></li>`;
        }).join('');
        return `
          <article class="tournament-team-card">
            <div class="row tournament-team-row">
              <input
                type="text"
                data-tr-role="team-name-input"
                data-team-id="${escapeHTMLText(team.id)}"
                value="${escapeHTMLText(team.name)}"
              />
              <button type="button" class="secondary" data-tr-action="rename-team" data-team-id="${escapeHTMLText(team.id)}">Save Name</button>
            </div>
            <p class="small">Members: ${(team.memberKeys || []).length}</p>
            <ul class="tournament-team-members">${members || '<li class="small">No players</li>'}</ul>
          </article>
        `;
      }).join('')}
    </div>
  ` : '<p class="small">No teams yet. Use Auto Build Teams.</p>';

  const memberOptions = teams.flatMap((team) => {
    return (team.memberKeys || []).map((memberKey) => {
      const player = playerLookup.get(memberKey);
      const playerName = player ? player.name : memberKey;
      return `<option value="${escapeHTMLText(memberKey)}">${escapeHTMLText(playerName)} (${escapeHTMLText(team.name)})</option>`;
    });
  }).join('');

  const targetTeamOptions = teams.map((team) =>
    `<option value="${escapeHTMLText(team.id)}">${escapeHTMLText(team.name)}</option>`
  ).join('');

  const matchRowsHTML = matches.length
    ? matches.map((match) => {
        const teamA = getTournamentTeamName(tournament, match.teamAId);
        const teamB = getTournamentTeamName(tournament, match.teamBId);
        const winnerLabel = match.winnerTeamId
          ? getTournamentTeamName(tournament, match.winnerTeamId)
          : '-';
        const scoreAValue = Number.isFinite(Number(match.scoreA)) ? Number(match.scoreA) : '';
        const scoreBValue = Number.isFinite(Number(match.scoreB)) ? Number(match.scoreB) : '';
        const showControls = match.status !== TournamentManager.MATCH_FINAL && !!match.teamAId && !!match.teamBId;

        return `
          <tr>
            <td>R${match.round} M${match.slot}</td>
            <td>Net ${match.court || '-'}</td>
            <td>${escapeHTMLText(teamA)} vs ${escapeHTMLText(teamB)}</td>
            <td>${buildTournamentStatusBadge(match.status)}</td>
            <td>${escapeHTMLText(winnerLabel)}</td>
            <td>
              ${showControls ? `
                <div class="tournament-match-actions">
                  ${match.status === TournamentManager.MATCH_SCHEDULED
                    ? `<button type="button" class="secondary" data-tr-action="start-match" data-match-id="${escapeHTMLText(match.id)}">Start</button>`
                    : ''}
                  <input type="number" min="0" step="1" class="tournament-score-input" data-tr-score-a-for="${escapeHTMLText(match.id)}" value="${scoreAValue}" />
                  <input type="number" min="0" step="1" class="tournament-score-input" data-tr-score-b-for="${escapeHTMLText(match.id)}" value="${scoreBValue}" />
                  <button type="button" data-tr-action="finalize-match" data-match-id="${escapeHTMLText(match.id)}">Finalize</button>
                </div>
              ` : '<span class="small">No action</span>'}
            </td>
          </tr>
        `;
      }).join('')
    : '<tr><td colspan="6" class="small">No matches generated yet.</td></tr>';

  const standingsHTML = tournament.format === TournamentManager.FORMAT_RR
    ? (() => {
        const rows = TournamentManager.getRoundRobinStandings(tournament);
        if (!rows.length) return '<p class="small">Standings will update as results are finalized.</p>';
        return `
          <table class="table">
            <thead><tr><th>#</th><th>Team</th><th>W</th><th>L</th><th>PF</th><th>PA</th><th>PD</th></tr></thead>
            <tbody>
              ${rows.map((row, index) => `
                <tr>
                  <td>${index + 1}</td>
                  <td>${escapeHTMLText(row.teamName)}</td>
                  <td>${row.wins}</td>
                  <td>${row.losses}</td>
                  <td>${row.pf}</td>
                  <td>${row.pa}</td>
                  <td>${row.pd}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      })()
    : (() => {
        const championId = TournamentManager.getChampionTeamId(tournament);
        const championName = championId ? getTournamentTeamName(tournament, championId) : '';
        return championName
          ? `<p class="small"><strong>Champion:</strong> ${escapeHTMLText(championName)}</p>`
          : '<p class="small">Bracket winner will appear after final match.</p>';
      })();

  return `
    <div class="tournament-section">
      <h4>Teams</h4>
      ${teamCardsHTML}
      <div class="tournament-manual-move">
        <h5>Manual Team Move</h5>
        <div class="row">
          <select id="trn-move-member">${memberOptions || '<option value="">No players assigned</option>'}</select>
          <select id="trn-move-target-team">${targetTeamOptions || '<option value="">No teams</option>'}</select>
          <button type="button" data-tr-action="move-member">Move Player</button>
        </div>
      </div>
    </div>

    <div class="tournament-section">
      <h4>Matches</h4>
      <table class="table tournament-match-table">
        <thead>
          <tr><th>Match</th><th>Court</th><th>Teams</th><th>Status</th><th>Winner</th><th>Actions</th></tr>
        </thead>
        <tbody>${matchRowsHTML}</tbody>
      </table>
    </div>

    <div class="tournament-section">
      <h4>${tournament.format === TournamentManager.FORMAT_RR ? 'Standings' : 'Bracket Summary'}</h4>
      ${standingsHTML}
    </div>
  `;
}

function renderTournamentBracketHTML(tournament) {
  const rounds = TournamentManager.getSingleEliminationRounds(tournament);
  if (!rounds.length) return '<p class="small">No bracket generated yet.</p>';
  return `
    <div class="tournament-bracket-grid">
      ${rounds.map((roundInfo) => `
        <section class="tournament-bracket-round">
          <h5>Round ${roundInfo.round}</h5>
          ${roundInfo.matches.map((match) => `
            <article class="tournament-bracket-match">
              <div class="small">Net ${match.court || '-'}</div>
              <div><strong>${escapeHTMLText(getTournamentTeamName(tournament, match.teamAId))}</strong></div>
              <div><strong>${escapeHTMLText(getTournamentTeamName(tournament, match.teamBId))}</strong></div>
              <div class="small">${buildTournamentStatusBadge(match.status)}</div>
              ${match.winnerTeamId
                ? `<div class="small">Winner: ${escapeHTMLText(getTournamentTeamName(tournament, match.winnerTeamId))}</div>`
                : ''}
            </article>
          `).join('')}
        </section>
      `).join('')}
    </div>
  `;
}

function renderTournamentPublicCardHTML(tournament) {
  if (!tournament) {
    return '<p class="small">No tournament selected yet.</p>';
  }

  const matches = (tournament.matches || []).slice().sort((a, b) => {
    if (a.round !== b.round) return a.round - b.round;
    if (a.slot !== b.slot) return a.slot - b.slot;
    return String(a.id).localeCompare(String(b.id));
  });
  const liveMatches = matches.filter((match) => match.status === TournamentManager.MATCH_LIVE);
  const scheduledMatches = matches.filter((match) => match.status === TournamentManager.MATCH_SCHEDULED);
  const finalMatches = matches.filter((match) => match.status === TournamentManager.MATCH_FINAL);

  const renderMatchList = (rows, emptyText) => {
    if (!rows.length) return `<p class="small">${escapeHTMLText(emptyText)}</p>`;
    return `
      <ul class="tournament-public-match-list">
        ${rows.map((match) => `
          <li>
            <strong>Net ${match.court || '-'}</strong> -
            ${escapeHTMLText(getTournamentTeamName(tournament, match.teamAId))} vs
            ${escapeHTMLText(getTournamentTeamName(tournament, match.teamBId))}
            ${match.status === TournamentManager.MATCH_FINAL && match.winnerTeamId
              ? ` <span class="small">(Winner: ${escapeHTMLText(getTournamentTeamName(tournament, match.winnerTeamId))})</span>`
              : ''}
          </li>
        `).join('')}
      </ul>
    `;
  };

  const formatSpecificHTML = tournament.format === TournamentManager.FORMAT_RR
    ? (() => {
        const rows = TournamentManager.getRoundRobinStandings(tournament);
        if (!rows.length) return '<p class="small">Standings will appear once results are finalized.</p>';
        return `
          <table class="table">
            <thead><tr><th>#</th><th>Team</th><th>W</th><th>L</th><th>PD</th></tr></thead>
            <tbody>
              ${rows.map((row, index) => `
                <tr>
                  <td>${index + 1}</td>
                  <td>${escapeHTMLText(row.teamName)}</td>
                  <td>${row.wins}</td>
                  <td>${row.losses}</td>
                  <td>${row.pd}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      })()
    : renderTournamentBracketHTML(tournament);

  return `
    <div class="tournament-section">
      <h4>Public Tournament View</h4>
      <p class="small">
        ${escapeHTMLText(tournament.name)} -
        ${escapeHTMLText(formatTournamentFormatLabel(tournament.format))} -
        ${escapeHTMLText(formatTournamentStatusLabel(tournament.status))}
      </p>
      <div class="tournament-public-grid">
        <div>
          <h5>Live Matches</h5>
          ${renderMatchList(liveMatches, 'No matches live right now.')}
        </div>
        <div>
          <h5>Upcoming Matches</h5>
          ${renderMatchList(scheduledMatches, 'No upcoming matches.')}
        </div>
        <div>
          <h5>Final Results</h5>
          ${renderMatchList(finalMatches, 'No final results yet.')}
        </div>
      </div>
    </div>

    <div class="tournament-section">
      <h4>${tournament.format === TournamentManager.FORMAT_RR ? 'Standings' : 'Bracket'}</h4>
      ${formatSpecificHTML}
    </div>
  `;
}

function getActiveTournamentFromSelect() {
  const select = document.getElementById('tournamentSelect');
  const selectedId = select ? String(select.value || '').trim() : '';
  return selectedId ? TournamentManager.getById(selectedId) : null;
}

function refreshTournamentSelectUI() {
  const select = document.getElementById('tournamentSelect');
  if (!select) return '';
  const all = TournamentManager.getAll();
  const activeId = TournamentManager.getActiveId();
  select.innerHTML = all.length
    ? all.map((tournament) => `
        <option value="${escapeHTMLText(tournament.id)}" ${tournament.id === activeId ? 'selected' : ''}>
          ${escapeHTMLText(tournament.name)}
        </option>
      `).join('')
    : '<option value="">No tournaments</option>';
  if (!all.length) {
    select.value = TOURNAMENT_UNSET_VALUE;
    TournamentManager.setActive('');
    return '';
  }
  if (activeId) {
    select.value = activeId;
    return activeId;
  }
  const fallbackId = String(select.value || all[0].id || '');
  TournamentManager.setActive(fallbackId);
  select.value = fallbackId;
  return fallbackId;
}

function initTournamentView() {
  const globalNotice = document.getElementById('tournamentGlobalNotice');
  const headerCard = document.getElementById('tournamentHeaderCard');
  const adminCard = document.getElementById('adminTournament');
  const publicCard = document.getElementById('publicTournamentView');
  const select = document.getElementById('tournamentSelect');
  if (!globalNotice || !headerCard || !adminCard || !publicCard) return;

  const awaitingAuthorityHydration = (
    !!supabaseClient &&
    SUPABASE_AUTHORITATIVE &&
    !state.loaded &&
    state.tournamentSyncState === SHARED_SYNC_PENDING
  );
  if (awaitingAuthorityHydration) {
    if (select) {
      select.innerHTML = '<option value="">Syncing tournaments...</option>';
      select.value = TOURNAMENT_UNSET_VALUE;
    }
    globalNotice.innerHTML = renderTournamentNoticeHTML();
    headerCard.innerHTML = renderTournamentHeaderCardHTML(null);
    adminCard.style.display = state.isAdmin ? 'block' : 'none';
    adminCard.innerHTML = state.isAdmin
      ? '<p class="small">Tournament state is syncing from Supabase.</p>'
      : '';
    publicCard.innerHTML = '<p class="small">Tournament state is syncing from Supabase.</p>';
    return;
  }

  refreshTournamentSelectUI();
  const tournament = getActiveTournamentFromSelect();

  globalNotice.innerHTML = renderTournamentNoticeHTML();
  headerCard.innerHTML = renderTournamentHeaderCardHTML(tournament);
  adminCard.style.display = state.isAdmin ? 'block' : 'none';
  adminCard.innerHTML = state.isAdmin
    ? renderTournamentAdminCardHTML(tournament)
    : '';
  publicCard.innerHTML = renderTournamentPublicCardHTML(tournament);
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
}

function getTournamentMatchLabel(tournament, matchId) {
  const target = String(matchId || '').trim();
  if (!target) return 'match';
  const match = (tournament?.matches || []).find((item) => String(item?.id || '') === target);
  if (!match) return 'match';
  return `R${Number(match.round) || 1} M${Number(match.slot) || 1}`;
}

async function commitTournamentMutation(result, {
  successMessage = 'Tournament updated.',
  fallbackErrorMessage = 'Tournament action failed.',
  contextLabel = 'tournament-write',
  actionMeta = null
} = {}) {
  const meta = actionMeta && typeof actionMeta === 'object' ? actionMeta : null;
  const resolveMetaValue = (value, fallback = '') => {
    try {
      return typeof value === 'function' ? value(result) : value;
    } catch {
      return fallback;
    }
  };
  const baseScope = String(resolveMetaValue(meta?.scope, 'tournament') || 'tournament');
  const baseAction = String(resolveMetaValue(meta?.action, '') || '').trim() || contextLabel || 'mutation';
  const baseEntityType = String(resolveMetaValue(meta?.entityType, 'tournament') || 'tournament');
  const baseEntityId = String(resolveMetaValue(meta?.entityId, '') || '').trim();
  const baseDetail = String(resolveMetaValue(meta?.detail, '') || '').trim();

  const recordFailure = (title, detailOverride = '') => {
    if (!meta) return;
    recordOperatorAction({
      scope: baseScope,
      action: `${baseAction}-failed`,
      entityType: baseEntityType,
      entityId: baseEntityId,
      title: String(title || '').trim() || 'Tournament action failed.',
      detail: String(detailOverride || baseDetail || '').trim(),
      tone: 'error'
    });
  };

  if (!result || result.ok === false) {
    const msg = result && result.error ? result.error : fallbackErrorMessage;
    setTournamentNotice(msg, TOURNAMENT_NOTICE_ERROR);
    recordFailure('Tournament action failed.', msg);
    initTournamentView();
    return false;
  }

  if (SUPABASE_AUTHORITATIVE && supabaseClient) {
    const synced = await syncTournamentStoreToSupabase();
    if (!synced) {
      await reconcileTournamentToSupabaseAuthority(contextLabel || 'tournament-write');
      setTournamentNotice(
        'Tournament change was not saved to Supabase. Restored latest shared state.',
        TOURNAMENT_NOTICE_ERROR
      );
      recordFailure(
        'Tournament write failed. Restored latest shared state.',
        `Change was reverted during reconcile (${contextLabel || 'tournament-write'}).`
      );
      initTournamentView();
      return false;
    }
  }

  if (meta) {
    const toneRaw = String(resolveMetaValue(meta.tone, 'info') || 'info').trim();
    const tone = toneRaw === 'success' || toneRaw === 'warning' || toneRaw === 'error' ? toneRaw : 'info';
    const undoSnapshot = resolveMetaValue(meta.undoSnapshot, null);
    const undoPayload = undoSnapshot && typeof undoSnapshot === 'object'
      ? { kind: 'tournament-store', storeSnapshot: undoSnapshot }
      : null;

    recordOperatorAction({
      scope: baseScope,
      action: baseAction,
      entityType: baseEntityType,
      entityId: baseEntityId,
      title: String(resolveMetaValue(meta.title, successMessage) || successMessage || 'Tournament updated.').trim(),
      detail: baseDetail,
      tone,
      undo: undoPayload
    });
  }

  setTournamentNotice(successMessage, TOURNAMENT_NOTICE_SUCCESS);
  initTournamentView();
  return true;
}

async function handleTournamentAction(action, trigger) {
  const activeTournament = getActiveTournamentFromSelect();
  const activeId = activeTournament?.id || '';

  if (action === 'create-tournament') {
    if (!state.isAdmin) return;
    const name = String(document.getElementById('trn-name')?.value || '').trim();
    const format = String(document.getElementById('trn-format')?.value || TournamentManager.FORMAT_RR);
    const sourceMode = String(document.getElementById('trn-source-mode')?.value || TournamentManager.SOURCE_CHECKED_IN);
    const courtCount = Number.parseInt(document.getElementById('trn-court-count')?.value || '2', 10);
    const groupFilter = String(document.getElementById('trn-source-group')?.value || 'All');
    const teamCount = Number.parseInt(document.getElementById('trn-team-count')?.value || '2', 10);
    const beforeStoreSnapshot = TournamentManager.getStoreSnapshot();

    const created = TournamentManager.createTournament({
      name,
      format,
      sourceMode,
      courtCount,
      groupFilter,
      teamCount
    });
    await commitTournamentMutation(created, {
      successMessage: 'Tournament created. Build matches when teams look right.',
      fallbackErrorMessage: 'Unable to create tournament.',
      contextLabel: 'tournament-create',
      actionMeta: {
        scope: 'tournament',
        action: 'create-tournament',
        entityType: 'tournament',
        entityId: (mutationResult) => mutationResult?.tournament?.id || '',
        title: (mutationResult) => {
          const createdName = String(mutationResult?.tournament?.name || name || 'Tournament').trim();
          return `Created tournament "${createdName}".`;
        },
        detail: `Format: ${formatTournamentFormatLabel(format)} | Source: ${sourceMode === TournamentManager.SOURCE_GENERATED_TEAMS ? 'Generated Teams' : `Checked-In (${formatTournamentGroupLabel(groupFilter)})`}.`,
        tone: 'success',
        undoSnapshot: beforeStoreSnapshot
      }
    });
    return;
  }

  if (!state.isAdmin) return;
  if (!activeId) {
    setTournamentNotice('Select a tournament first.', TOURNAMENT_NOTICE_ERROR);
    initTournamentView();
    return;
  }

  if (action === 'delete-tournament') {
    const safeTournamentName = String(activeTournament?.name || 'this tournament').trim() || 'this tournament';
    const confirmed = confirmDangerousActionOrAbort({
      title: `Delete tournament "${safeTournamentName}"?`,
      detail: 'This removes all teams, matches, and recorded tournament results from shared state.',
      confirmText: 'DELETE'
    });
    if (!confirmed) return;
    const beforeStoreSnapshot = TournamentManager.getStoreSnapshot();
    const deleted = TournamentManager.deleteTournament(activeId);
    await commitTournamentMutation(deleted, {
      successMessage: 'Tournament deleted.',
      fallbackErrorMessage: 'Delete failed.',
      contextLabel: 'tournament-delete',
      actionMeta: {
        scope: 'tournament',
        action: 'delete-tournament',
        entityType: 'tournament',
        entityId: activeId,
        title: `Deleted tournament "${safeTournamentName}".`,
        detail: 'Tournament record and match history were removed.',
        tone: 'warning',
        undoSnapshot: beforeStoreSnapshot
      }
    });
    return;
  }

  if (action === 'rebuild-teams') {
    const sourceMode = String(
      document.getElementById('trn-source-mode')?.value
      || activeTournament.sourceMode
      || TournamentManager.SOURCE_CHECKED_IN
    );
    const groupFilter = String(document.getElementById('trn-source-group')?.value || activeTournament.sourceGroup || 'All');
    const teamCount = Number.parseInt(document.getElementById('trn-team-count')?.value || String(activeTournament.teamCount || 2), 10);
    const existingMatchCount = Array.isArray(activeTournament.matches) ? activeTournament.matches.length : 0;
    if (existingMatchCount > 0) {
      const confirmed = confirmDangerousActionOrAbort({
        title: `Rebuild teams for "${activeTournament.name}"?`,
        detail: `This clears ${existingMatchCount} existing matches and resets progression from the selected source.`,
        confirmText: 'REBUILD'
      });
      if (!confirmed) return;
    }
    const beforeStoreSnapshot = TournamentManager.getStoreSnapshot();
    const rebuilt = TournamentManager.rebuildTeams(activeId, { sourceMode, groupFilter, teamCount });
    await commitTournamentMutation(rebuilt, {
      successMessage: 'Teams rebuilt from selected source.',
      fallbackErrorMessage: 'Team build failed.',
      contextLabel: 'tournament-rebuild-teams',
      actionMeta: {
        scope: 'tournament',
        action: 'rebuild-teams',
        entityType: 'tournament',
        entityId: activeId,
        title: `Rebuilt teams for "${activeTournament.name}".`,
        detail: `Source: ${sourceMode === TournamentManager.SOURCE_GENERATED_TEAMS ? 'Generated Teams' : `Checked-In (${formatTournamentGroupLabel(groupFilter)})`}.`,
        tone: 'warning',
        undoSnapshot: beforeStoreSnapshot
      }
    });
    return;
  }

  if (action === 'generate-matches') {
    const existingMatchCount = Array.isArray(activeTournament.matches) ? activeTournament.matches.length : 0;
    if (existingMatchCount > 0) {
      const confirmed = confirmDangerousActionOrAbort({
        title: `Regenerate matches for "${activeTournament.name}"?`,
        detail: `This replaces ${existingMatchCount} existing matches using current teams.`,
        confirmText: 'REGENERATE'
      });
      if (!confirmed) return;
    }
    const beforeStoreSnapshot = TournamentManager.getStoreSnapshot();
    const generated = TournamentManager.generateMatches(activeId);
    await commitTournamentMutation(generated, {
      successMessage: 'Matches generated.',
      fallbackErrorMessage: 'Match generation failed.',
      contextLabel: 'tournament-generate-matches',
      actionMeta: {
        scope: 'tournament',
        action: 'generate-matches',
        entityType: 'tournament',
        entityId: activeId,
        title: `Generated matches for "${activeTournament.name}".`,
        detail: (mutationResult) => {
          const count = Array.isArray(mutationResult?.tournament?.matches)
            ? mutationResult.tournament.matches.length
            : 0;
          return `${count} matches scheduled.`;
        },
        tone: 'warning',
        undoSnapshot: beforeStoreSnapshot
      }
    });
    return;
  }

  if (action === 'reset-matches') {
    const matchCount = Array.isArray(activeTournament.matches) ? activeTournament.matches.length : 0;
    const confirmed = confirmDangerousActionOrAbort({
      title: `Reset matches for "${activeTournament.name}"?`,
      detail: matchCount > 0
        ? `This resets ${matchCount} matches from current teams and clears recorded outcomes.`
        : 'This rebuilds matches from current teams.',
      confirmText: 'RESET'
    });
    if (!confirmed) return;
    const beforeStoreSnapshot = TournamentManager.getStoreSnapshot();
    const reset = TournamentManager.resetMatches(activeId);
    await commitTournamentMutation(reset, {
      successMessage: 'Matches reset from current teams.',
      fallbackErrorMessage: 'Reset failed.',
      contextLabel: 'tournament-reset-matches',
      actionMeta: {
        scope: 'tournament',
        action: 'reset-matches',
        entityType: 'tournament',
        entityId: activeId,
        title: `Reset matches for "${activeTournament.name}".`,
        detail: 'Match outcomes were cleared and rebuilt from current teams.',
        tone: 'warning',
        undoSnapshot: beforeStoreSnapshot
      }
    });
    return;
  }

  if (action === 'rename-team') {
    const teamId = String(trigger?.getAttribute('data-team-id') || '').trim();
    if (!teamId) return;
    const input = Array.from(document.querySelectorAll('[data-tr-role="team-name-input"]'))
      .find((el) => String(el.getAttribute('data-team-id') || '') === teamId);
    const name = String(input?.value || '').trim();
    const beforeStoreSnapshot = TournamentManager.getStoreSnapshot();
    const renamed = TournamentManager.renameTeam(activeId, teamId, name);
    await commitTournamentMutation(renamed, {
      successMessage: 'Team name updated.',
      fallbackErrorMessage: 'Rename failed.',
      contextLabel: 'tournament-rename-team',
      actionMeta: {
        scope: 'tournament',
        action: 'rename-team',
        entityType: 'team',
        entityId: teamId,
        title: `Renamed team to "${name || 'Untitled Team'}".`,
        detail: `Tournament: ${activeTournament.name}`,
        tone: 'info',
        undoSnapshot: beforeStoreSnapshot
      }
    });
    return;
  }

  if (action === 'move-member') {
    const memberKey = String(document.getElementById('trn-move-member')?.value || '').trim();
    const toTeamId = String(document.getElementById('trn-move-target-team')?.value || '').trim();
    const targetTeamName = getTournamentTeamName(activeTournament, toTeamId);
    const beforeStoreSnapshot = TournamentManager.getStoreSnapshot();
    const moved = TournamentManager.moveMember(activeId, memberKey, toTeamId);
    await commitTournamentMutation(moved, {
      successMessage: 'Player moved.',
      fallbackErrorMessage: 'Move failed.',
      contextLabel: 'tournament-move-member',
      actionMeta: {
        scope: 'tournament',
        action: 'move-member',
        entityType: 'team',
        entityId: toTeamId,
        title: `Moved player to ${targetTeamName}.`,
        detail: `Tournament: ${activeTournament.name}`,
        tone: 'info',
        undoSnapshot: beforeStoreSnapshot
      }
    });
    return;
  }

  if (action === 'start-match') {
    const matchId = String(trigger?.getAttribute('data-match-id') || '').trim();
    const beforeStoreSnapshot = TournamentManager.getStoreSnapshot();
    const started = TournamentManager.startMatch(activeId, matchId);
    await commitTournamentMutation(started, {
      successMessage: 'Match started.',
      fallbackErrorMessage: 'Unable to start match.',
      contextLabel: 'tournament-start-match',
      actionMeta: {
        scope: 'tournament',
        action: 'start-match',
        entityType: 'match',
        entityId: matchId,
        title: `Started ${getTournamentMatchLabel(activeTournament, matchId)}.`,
        detail: `Tournament: ${activeTournament.name}`,
        tone: 'info',
        undoSnapshot: beforeStoreSnapshot
      }
    });
    return;
  }

  if (action === 'finalize-match') {
    const matchId = String(trigger?.getAttribute('data-match-id') || '').trim();
    const scoreAInput = Array.from(document.querySelectorAll('[data-tr-score-a-for]'))
      .find((el) => String(el.getAttribute('data-tr-score-a-for') || '') === matchId);
    const scoreBInput = Array.from(document.querySelectorAll('[data-tr-score-b-for]'))
      .find((el) => String(el.getAttribute('data-tr-score-b-for') || '') === matchId);
    const scoreA = Number(scoreAInput?.value);
    const scoreB = Number(scoreBInput?.value);
    const beforeStoreSnapshot = TournamentManager.getStoreSnapshot();
    const finalized = TournamentManager.finalizeMatch(activeId, matchId, scoreA, scoreB);
    await commitTournamentMutation(finalized, {
      successMessage: 'Match finalized.',
      fallbackErrorMessage: 'Result save failed.',
      contextLabel: 'tournament-finalize-match',
      actionMeta: {
        scope: 'tournament',
        action: 'finalize-match',
        entityType: 'match',
        entityId: matchId,
        title: `Finalized ${getTournamentMatchLabel(activeTournament, matchId)} (${Number.isFinite(scoreA) ? scoreA : 0}-${Number.isFinite(scoreB) ? scoreB : 0}).`,
        detail: `Tournament: ${activeTournament.name}`,
        tone: 'success',
        undoSnapshot: beforeStoreSnapshot
      }
    });
  }
}

function ensureTournamentOverlayBindings() {
  if (ensureTournamentOverlayBindings._bound) return;
  ensureTournamentOverlayBindings._bound = true;

  const root = document.getElementById('view-tournament');
  const select = document.getElementById('tournamentSelect');
  const closeBtn = document.getElementById('closeTournamentBtn');

  if (select) {
    select.addEventListener('change', () => {
      const selected = String(select.value || '').trim();
      TournamentManager.setActive(selected);
      clearTournamentNotice();
      initTournamentView();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      showTournamentView(false);
    });
  }

  if (root) {
    root.addEventListener('click', async (event) => {
      const trigger = event.target.closest('[data-tr-action]');
      if (!trigger) return;
      event.preventDefault();
      const action = String(trigger.getAttribute('data-tr-action') || '').trim();
      if (!action) return;
      await handleTournamentAction(action, trigger);
    });
  }
}

function bindTournamentTab() {
  ensureTournamentTabClickable();
  ensureTournamentOverlayBindings();

  const byId = document.getElementById('tab-tournament');
  if (byId) {
    byId.onclick = (event) => {
      if (event) event.preventDefault();
      showTournamentView(true);
      initTournamentView();
    };
  }

  if (!bindTournamentTab._delegated) {
    document.addEventListener('click', (event) => {
      const opener = event.target.closest('[data-tab="tournament"], a[href="#tournament"]');
      if (!opener) return;
      event.preventDefault();
      showTournamentView(true);
      initTournamentView();
    });
    bindTournamentTab._delegated = true;
  }
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
  const interactionSnapshot = captureTransientInteractionState();

  // Helper to escape text for safe insertion into HTML
  const escapeHTML = (str) => str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const normalizedActiveGroup = normalizeActiveGroupSelection(state.activeGroup || 'All');
  const activeGroupLabel = normalizedActiveGroup === UNGROUPED_FILTER_VALUE ? UNGROUPED_FILTER_LABEL : (normalizedActiveGroup || 'All');
  const isActiveGroupValue = (value) => normalizeActiveGroupSelection(value || 'All') === normalizedActiveGroup;
  const sharedSyncNoticeHTML = buildSharedSyncNoticeHTML();
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
          <select id="admin-quick-open" aria-label="Menu">
            <option value="">Menu</option>
            <option value="checkin">Check In</option>
            <option value="add-player">Add/Update Player</option>
          </select>
          <button id="btn-save-supabase" class="primary">Save to Supabase</button>
          <button id="btn-reset-checkins" class="danger">Reset Check‑ins</button>
          <button id="btn-logout">Logout</button>
        </div>
      </div>
      <div class="card">
        <h3>Recent Actions</h3>
        ${renderOperatorActionsLogHTML()}
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

<div id="admin-checkin-modal" class="popup-overlay" style="display:none;" aria-hidden="true">
  <div class="popup-card card" role="dialog" aria-modal="true" aria-labelledby="admin-checkin-modal-title">
    <div class="popup-header">
      <h3 id="admin-checkin-modal-title">Check In</h3>
      <button type="button" class="secondary" data-role="close-popup" data-target="admin-checkin-modal">Close</button>
    </div>
    <div class="popup-body">
      <input type="text" id="check-name" placeholder="First and Last Name" />
      <div class="row checkin-actions">
        <button id="btn-check-in">Check In</button>
        <button id="btn-check-out">Check Out</button>
      </div>
      ${checkMsg}
    </div>
  </div>
</div>

<div id="admin-add-player-modal" class="popup-overlay" style="display:none;" aria-hidden="true">
  <div class="popup-card card" role="dialog" aria-modal="true" aria-labelledby="admin-add-player-modal-title">
    <div class="popup-header">
      <h3 id="admin-add-player-modal-title">Add/Update Player</h3>
      <button type="button" class="secondary" data-role="close-popup" data-target="admin-add-player-modal">Close</button>
    </div>
    <div class="popup-body">
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
</div>

<div id="groupManager" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,.35); z-index:12500; padding:12px; overflow:auto;">
  <div style="max-width:720px; max-height:calc(100vh - 24px); margin:0 auto; background:#fff; border-radius:12px; box-shadow:0 12px 32px rgba(0,0,0,.18); overflow:hidden; display:flex; flex-direction:column;">
    <div style="display:flex; align-items:center; padding:12px 16px; background:#f8fafc;">
      <h3 style="margin:0; font-size:18px;">Manage Groups</h3>
      <span style="flex:1"></span>
      <button id="btn-close-group-manager" class="secondary">Close</button>
    </div>

    <div style="padding:16px; overflow:auto; -webkit-overflow-scrolling:touch;">
      <!-- add -->
      <div class="card" style="padding:12px; margin-bottom:12px;">
        <div class="row">
          <input type="text" id="gm-new-name" placeholder="New group name" />
          <button id="gm-add" class="primary">Add Group</button>
        </div>
      </div>
      <!-- list -->
      <div class="card gm-table-wrap" style="padding:12px;">
        <table class="table gm-table" style="width:100%;">
          <thead>
            <tr><th style="text-align:left;">Group</th><th>Checked In</th><th>Total</th><th style="text-align:left;">Actions</th></tr>
          </thead>
          <tbody id="gm-rows"></tbody>
        </table>
      </div>
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
${sharedSyncNoticeHTML}

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
      ${state.isAdmin ? adminHTML : ''}
  ${!state.isAdmin ? `
  <div class="grid-2">
  <div class="card card-checkin">
    <h2>Check In</h2>
    <input type="text" id="check-name" placeholder="First and Last Name" />
    <div class="row checkin-actions">
      <button id="btn-check-in">Check In</button>
      <button id="btn-check-out">Check Out</button>
    </div>
    ${checkMsg}
  </div>

  <div class="card card-register">
    <h2>Register Player</h2>
    <input type="text" id="register-name" placeholder="First and Last Name" />
    <button id="btn-register">Register</button>
    ${regMsg}
  </div>
  </div>
  ` : ``}
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
restoreTransientInteractionState(interactionSnapshot);
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

const openPopup = (popupId) => {
  const popup = document.getElementById(popupId);
  if (!popup) return;
  popup.style.display = 'flex';
  popup.setAttribute('aria-hidden', 'false');
};
const closePopup = (popupId) => {
  const popup = document.getElementById(popupId);
  if (!popup) return;
  popup.style.display = 'none';
  popup.setAttribute('aria-hidden', 'true');
};

const adminQuickOpen = document.getElementById('admin-quick-open');
if (adminQuickOpen) {
  adminQuickOpen.addEventListener('change', () => {
    const value = String(adminQuickOpen.value || '').trim();
    if (value === 'checkin') openPopup('admin-checkin-modal');
    if (value === 'add-player') openPopup('admin-add-player-modal');
    adminQuickOpen.value = '';
  });
}

document.querySelectorAll('[data-role="close-popup"]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const popupId = String(btn.getAttribute('data-target') || '').trim();
    if (!popupId) return;
    closePopup(popupId);
  });
});

document.querySelectorAll('.popup-overlay').forEach((popup) => {
  popup.addEventListener('click', (e) => {
    if (e.target !== popup) return;
    closePopup(popup.id);
  });
});

// ----- Group Manager (master admin) -----
const gmOpen  = document.getElementById('btn-open-group-manager');
const gmRoot  = document.getElementById('groupManager');

function gmPopulate() {
  if (!gmRoot) return;

  // Build a canonical group list (exclude "All")
  const known = [
    ...(state.groups || []).filter((groupName) => groupName && groupName !== 'All')
  ];
  // Include any groups that might exist on players but not in state.groups
  state.players.forEach(p => {
    known.push(...getPlayerGroups(p));
  });
  const list = normalizeGroupList(known).sort((a,b)=>a.localeCompare(b));

  // Fill rows with counts + actions
  const byGroup = computeCheckedInByGroup();
  const totals = Object.fromEntries(byGroup.map(r => [r.groupKey, r.total]));
  const ins    = Object.fromEntries(byGroup.map(r => [r.groupKey, r.in]));

  const rowsEl = gmRoot.querySelector('#gm-rows');
  if (rowsEl) {
    rowsEl.innerHTML = list.map(g => `
      <tr data-group="${g}">
        <td style="overflow-wrap:anywhere;"><strong>${g}</strong></td>
        <td style="text-align:center; white-space:nowrap;">${ins[g] || 0}</td>
        <td style="text-align:center; white-space:nowrap;">${totals[g] || 0}</td>
        <td>
          <div class="row gm-actions-row" style="gap:6px; justify-content:flex-start; flex-wrap:wrap;">
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
    const name  = normalizeGroupName(input && input.value || '');
    if (!name) return;
    state.groups = ['All', ...normalizeGroupList([...(state.groups || []).filter((groupName) => groupName && groupName !== 'All'), name])];
    state.activeGroup = name;
    saveLocal();
    render();
    gmPopulate();
    if (supabaseClient) {
      (async () => {
        try {
          const synced = await ensureGroupCatalogEntrySupabase(name);
          if (synced) queueSupabaseRefresh();
          else await reconcileToSupabaseAuthority('group-add');
        } catch (err) {
          console.error('Supabase group add error', err);
          await reconcileToSupabaseAuthority('group-add');
        }
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
      const oldName = normalizeGroupName(renameBtn.getAttribute('data-group'));
      if (!oldName) return;
      const requestedName = prompt(`Rename "${oldName}" to:`, oldName);
      const newName = normalizeGroupName(requestedName);
      if (!newName) return;
      const oldKey = normalizeGroupKey(oldName);
      if (normalizeGroupKey(newName) === oldKey && newName === oldName) return;

      state.groups = ['All', ...normalizeGroupList(
        (state.groups || [])
          .filter((groupName) => groupName && groupName !== 'All')
          .map((groupName) => (normalizeGroupKey(groupName) === oldKey ? newName : groupName))
      )];
      state.players = state.players.map((player) => {
        const memberships = getPlayerGroups(player);
        if (!memberships.some((group) => normalizeGroupKey(group) === oldKey)) return player;
        const nextGroups = normalizeGroupList(memberships.map((group) => (normalizeGroupKey(group) === oldKey ? newName : group)));
        return { ...player, group: nextGroups[0] || '', groups: nextGroups };
      });
      if (normalizeGroupKey(state.activeGroup || '') === oldKey) state.activeGroup = newName;

      let renameRemoteFailed = false;
      try {
        await renameGroupCatalogEntrySupabase(oldName, newName);
        const updates = state.players
          .filter((player) => player.id && playerBelongsToGroup(player, newName))
          .map((player) => ({
            id: player.id,
            group: getPlayerPrimaryGroup(player),
            groups: getPlayerGroups(player)
          }));
        for (const update of updates) {
          const ok = await updatePlayerFieldsSupabase(update.id, { group: update.group, groups: update.groups });
          if (!ok) renameRemoteFailed = true;
        }
        const synced = await syncFromSupabase();
        if (!synced) renameRemoteFailed = true;
      } catch (e) {
        renameRemoteFailed = true;
        console.error('Supabase rename error', e);
      }
      if (renameRemoteFailed) {
        await reconcileToSupabaseAuthority('group-rename');
        gmPopulate();
        return;
      }

      saveLocal();
      render();
      gmPopulate();
      return;
    }

    // Delete
    if (deleteBtn) {
      const name = normalizeGroupName(deleteBtn.getAttribute('data-group'));
      if (!name) return;
      const confirmed = confirmDangerousActionOrAbort({
        title: `Delete group "${name}"?`,
        detail: 'This removes the group from all players and cannot be auto-undone.',
        confirmText: name
      });
      if (!confirmed) return;
      const targetKey = normalizeGroupKey(name);

      state.groups = ['All', ...normalizeGroupList(
        (state.groups || []).filter((groupName) => groupName && groupName !== 'All' && normalizeGroupKey(groupName) !== targetKey)
      )];
      state.players = state.players.map((player) => {
        const memberships = getPlayerGroups(player);
        if (!memberships.some((group) => normalizeGroupKey(group) === targetKey)) return player;
        const nextGroups = memberships.filter((group) => normalizeGroupKey(group) !== targetKey);
        return { ...player, group: nextGroups[0] || '', groups: nextGroups };
      });
      if (normalizeGroupKey(state.activeGroup || '') === targetKey) state.activeGroup = 'All';
      enforceCanonicalGroupState({
        catalogGroups: (state.groups || []).filter((groupName) => groupName && groupName !== 'All'),
        includeExistingGroupsWhenNoCatalog: false
      });
      persistCanonicalGroupCache();

      let deleteRemoteFailed = false;
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
          const ok = await updatePlayerFieldsSupabase(update.id, { group: update.group, groups: update.groups });
          if (!ok) deleteRemoteFailed = true;
        }
        const synced = await syncFromSupabase();
        if (!synced) deleteRemoteFailed = true;
      } catch (e) {
        deleteRemoteFailed = true;
        console.error('Supabase delete group error', e);
      }
      if (deleteRemoteFailed) {
        await reconcileToSupabaseAuthority('group-delete');
        recordOperatorAction({
          scope: 'players',
          action: 'delete-group-failed',
          entityType: 'group',
          entityId: targetKey,
          title: `Delete failed for group "${name}".`,
          detail: 'Supabase write failed. Latest shared state was restored.',
          tone: 'error'
        });
        gmPopulate();
        return;
      }

      saveLocal();
      render();
      gmPopulate();
      recordOperatorAction({
        scope: 'players',
        action: 'delete-group',
        entityType: 'group',
        entityId: targetKey,
        title: `Deleted group "${name}".`,
        detail: 'Group membership was removed from affected players.',
        tone: 'warning'
      });
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
      const synced = await syncFromSupabase();   // re-fetch full dataset
      if (synced) saveLocal();
      if (synced && canRunAdminSharedBackfill()) {
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
      const synced = await syncFromSupabase();   // re-fetch only that group
      if (synced) saveLocal();
      if (synced && canRunAdminSharedBackfill()) {
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
    const synced = await syncFromSupabase();     // load public view dataset
    if (synced) saveLocal();
    render();
  });
}

const saveSupabaseBtn = document.getElementById('btn-save-supabase');
if (saveSupabaseBtn) {
  saveSupabaseBtn.addEventListener('click', async () => {
    if (forceSaveRunning) return;
    if (!supabaseClient) {
      alert('Supabase is not configured for this app.');
      return;
    }

    forceSaveRunning = true;
    saveSupabaseBtn.disabled = true;
    saveSupabaseBtn.textContent = 'Saving...';

    try {
      const summary = await forceSaveAllToSupabase();
      const pieces = [
        `Updated ${summary.updated}`,
        `Inserted ${summary.inserted}`
      ];
      if (summary.matchedByName) pieces.push(`Matched ${summary.matchedByName} by name`);
      if (summary.failed) pieces.push(`Failed ${summary.failed}`);
      if (summary.tournamentSynced) pieces.push('Tournament synced');
      alert(`Saved to Supabase. ${pieces.join(' | ')}`);
    } catch (err) {
      console.error('Manual save to Supabase error', err);
      alert('Save to Supabase failed. Check connection and try again.');
    } finally {
      forceSaveRunning = false;
      render();
    }
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
              } else {
                const encodedGroupsTag = serializePlayerGroupsTag(nextGroups, nextPrimary);
                try {
                  const insertRow = HAS_TAG
                    ? { name, skill, group: nextPrimary, tag: encodedGroupsTag }
                    : { name, skill, group: nextPrimary };
                  const { data, error } = await supabaseClient.from('players').insert([insertRow]).select();
                  if (error) throw error;
                  if (Array.isArray(data) && data.length > 0) updated[idx].id = data[0].id;
                  remoteOK = true;
                } catch {
                  try {
                    const { data, error } = await supabaseClient.from('players').insert([{ name, skill, tag: nextPrimary }]).select();
                    if (error) throw error;
                    if (Array.isArray(data) && data.length > 0) updated[idx].id = data[0].id;
                    remoteOK = true;
                  } catch {
                    const { data, error } = await supabaseClient.from('players').insert([{ name, skill }]).select();
                    if (error) throw error;
                    if (Array.isArray(data) && data.length > 0) updated[idx].id = data[0].id;
                    remoteOK = true;
                  }
                }
              }
              await ensureGroupCatalogEntriesSupabase(nextGroups);
              if (remoteOK) queueSupabaseRefresh();
              else await reconcileToSupabaseAuthority('admin-save-player-update');
            } catch (err) {
              console.error('Supabase update error', err);
              await reconcileToSupabaseAuthority('admin-save-player-update');
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
                const { data, error } = await supabaseClient.from('players').insert([insertRow]).select();
                if (error) throw error;
                remoteOK = true;
                if (Array.isArray(data) && data.length > 0) inserted.id = data[0].id;
              } catch {
                try {
                  const { data, error } = await supabaseClient.from('players').insert([{ name, skill, tag: group }]).select();
                  if (error) throw error;
                  remoteOK = true;
                  if (Array.isArray(data) && data.length > 0) inserted.id = data[0].id;
                } catch {
                  // 3rd fallback: table has neither 'group' nor 'tag'
                  const { data, error } = await supabaseClient.from('players').insert([{ name, skill }]).select();
                  if (error) throw error;
                  remoteOK = true;
                  if (Array.isArray(data) && data.length > 0) inserted.id = data[0].id;
                }
              }
              await ensureGroupCatalogEntriesSupabase(groups);
              if (remoteOK) queueSupabaseRefresh();
              else await reconcileToSupabaseAuthority('admin-save-player-insert');
            } catch (err) {
              console.error('Supabase insert error', err);
              await reconcileToSupabaseAuthority('admin-save-player-insert');
            }
          })();
        }
      }

      if (nameInput) nameInput.value = '';
      if (skillInput) skillInput.value = '';
      if (groupsInput) groupsInput.value = '';
      saveLocal();
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
                const { error } = await supabaseClient.from('players').update({ checked_in: true }).eq('id', player.id);
                if (error) throw error;
                queueSupabaseRefresh();
              } catch (err) {
                console.error('Supabase update error', err);
                await reconcileToSupabaseAuthority('public-check-in');
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
                const { error } = await supabaseClient.from('players').update({ checked_in: false }).eq('id', player.id);
                if (error) throw error;
                queueSupabaseRefresh();
              } catch (err) {
                console.error('Supabase check-out error', err);
                await reconcileToSupabaseAuthority('public-check-out');
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
                const { data, error } = await supabaseClient.from('players').insert([insertRow]).select();
                if (error) throw error;
                remoteOK = true;
                if (Array.isArray(data) && data.length > 0) inserted.id = data[0].id;
              } catch {
                try {
                  const { data, error } = await supabaseClient.from('players').insert([{ name, skill, tag: group }]).select();
                  if (error) throw error;
                  remoteOK = true;
                  if (Array.isArray(data) && data.length > 0) inserted.id = data[0].id;
                } catch {
                  const { data, error } = await supabaseClient.from('players').insert([{ name, skill }]).select();
                  if (error) throw error;
                  remoteOK = true;
                  if (Array.isArray(data) && data.length > 0) inserted.id = data[0].id;
                }
              }
              await ensureGroupCatalogEntriesSupabase(group ? [group] : []);
              if (remoteOK) queueSupabaseRefresh();
              else await reconcileToSupabaseAuthority('public-register');
            } catch (err) {
              console.error('Supabase insert error', err);
              await reconcileToSupabaseAuthority('public-register');
            }
          })();
        }

        messages.registration = 'Registered';
        setTimeout(() => { messages.registration = ''; render(); }, 2500);
        if (input) input.value = '';
        saveLocal();
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
    resetBtn.addEventListener('click', async () => {
      const previouslyCheckedIn = normalizeCheckedInEntries(state.checkedIn || []);
      const confirmed = confirmDangerousActionOrAbort({
        title: `Reset all check-ins (${previouslyCheckedIn.length} currently checked in)?`,
        detail: 'This will check everyone out and sync that state to Supabase.',
        confirmText: 'RESET'
      });
      if (!confirmed) return;

      state.checkedIn = [];
      saveLocal();
      render();
      recordOperatorAction({
        scope: 'players',
        action: 'reset-checkins',
        entityType: 'checkins',
        entityId: '',
        title: 'Reset all check-ins.',
        detail: `${previouslyCheckedIn.length} players were checked out.`,
        tone: 'warning',
        undo: {
          kind: 'checkins',
          checkedIn: previouslyCheckedIn
        }
      });

      if (supabaseClient) {
        try {
          const { error } = await supabaseClient.from('players').update({ checked_in: false }).eq('checked_in', true);
          if (error) throw error;
          queueSupabaseRefresh();
        } catch (err) {
          console.error('Supabase reset error', err);
          await reconcileToSupabaseAuthority('reset-check-ins');
          recordOperatorAction({
            scope: 'players',
            action: 'reset-checkins-failed',
            entityType: 'checkins',
            entityId: '',
            title: 'Reset check-ins failed to sync.',
            detail: 'Supabase write failed. Latest shared state was restored.',
            tone: 'error'
          });
        }
      }
    });
  }

  document.querySelectorAll('[data-role="undo-operator-action"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const actionId = String(btn.getAttribute('data-action-id') || '').trim();
      if (!actionId) return;
      btn.disabled = true;
      try {
        await runOperatorActionUndo(actionId);
      } finally {
        btn.disabled = false;
      }
    });
  });

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
      render();
      if (courtsAdvanced) {
        showTeamMoveToast('Courts advanced. Winners moved left.');
      }
      if (supabaseClient) {
        (async () => {
          const synced = await syncLiveMatchSkillsToSupabase([teamA, teamB]);
          if (synced) queueSupabaseRefresh();
          else await reconcileToSupabaseAuthority('live-match-result-skill-sync');
        })();
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
      render();
      if (supabaseClient) {
        (async () => {
          const synced = await syncLiveMatchSkillsToSupabase([teamA, teamB]);
          if (synced) queueSupabaseRefresh();
          else await reconcileToSupabaseAuthority('live-match-clear-skill-sync');
        })();
      }
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
    const rerenderPlayersListPreservingTransientState = () => {
      const snapshot = captureTransientInteractionState();
      const container = document.querySelector('.players');
      if (container) {
        container.innerHTML = renderFilteredPlayers();
        bindPlayerRowHandlers();
        bindSelectionHandlers();
      }
      updateBulkBarVisibility();
      restoreTransientInteractionState(snapshot);
    };

    const toggleClear = () => {
      if (clearBtn) clearBtn.style.display = searchInput.value.trim() ? 'inline' : 'none';
    };
    searchInput.addEventListener('input', () => {
      state.searchTerm = searchInput.value;
      rerenderPlayersListPreservingTransientState();
      toggleClear();
    });
    toggleClear();
  }
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      state.searchTerm = '';
      const si = document.getElementById('player-search');
      if (si) { si.value = ''; si.focus(); }
      const snapshot = captureTransientInteractionState();
      const container = document.querySelector('.players');
      if (container) {
        container.innerHTML = renderFilteredPlayers();
        bindPlayerRowHandlers();
        bindSelectionHandlers();
      }
      updateBulkBarVisibility();
      restoreTransientInteractionState(snapshot);
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
  render();

  if (supabaseClient && remoteIds.size) {
    (async () => {
      try {
        for (const id of remoteIds) {
          const { error } = await supabaseClient.from('players').update({ checked_in: shouldCheckIn }).eq('id', id);
          if (error) throw error;
        }
        queueSupabaseRefresh();
      } catch (err) {
        console.error(shouldCheckIn ? 'Supabase bulk check-in error' : 'Supabase bulk check-out error', err);
        await reconcileToSupabaseAuthority(shouldCheckIn ? 'bulk-check-in' : 'bulk-check-out');
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
    let remoteAssignFailed = false;
    try {
      const catalogTouched = await ensureGroupCatalogEntriesSupabase([dest]);
      for (const update of remoteUpdates) {
        const ok = await updatePlayerFieldsSupabase(update.id, { group: update.group, groups: update.groups });
        if (!ok) remoteAssignFailed = true;
      }
      if (remoteUpdates.length || catalogTouched) {
        const synced = await syncFromSupabase();
        if (!synced) remoteAssignFailed = true;
      }
    } catch (e) {
      remoteAssignFailed = true;
      console.error('Supabase bulk assign error', e);
    }
    if (remoteAssignFailed) {
      await reconcileToSupabaseAuthority('bulk-assign-group');
      return;
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
    let remoteRemoveFailed = false;
    try {
      for (const update of remoteUpdates) {
        const ok = await updatePlayerFieldsSupabase(update.id, { group: update.group, groups: update.groups });
        if (!ok) remoteRemoveFailed = true;
      }
      if (remoteUpdates.length) {
        const synced = await syncFromSupabase();
        if (!synced) remoteRemoveFailed = true;
      }
    } catch (e) {
      remoteRemoveFailed = true;
      console.error('Supabase bulk remove group error', e);
    }
    if (remoteRemoveFailed) {
      await reconcileToSupabaseAuthority('bulk-remove-group');
      return;
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
  if (!supabaseClient) {
    setSharedSyncState(SHARED_SYNC_LOCAL_ONLY);
    setTournamentSyncState(SHARED_SYNC_LOCAL_ONLY);
  } else if (SUPABASE_AUTHORITATIVE) {
    setSharedSyncState(SHARED_SYNC_PENDING);
    setTournamentSyncState(SHARED_SYNC_PENDING);
  }
  // If Supabase is unavailable, local data is the runtime source.
  // When Supabase is available, sync first and render from cloud-backed state.
  if (!supabaseClient) {
    render();
  }

  // Register service worker for PWA offline support
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(APP_VERSION)}`, { updateViaCache: 'none' })
      .then((registration) => {
        if (registration && typeof registration.update === 'function') {
          registration.update().catch(() => {});
        }
      })
      .catch((err) => {
        console.warn('Service worker registration failed', err);
      });
  }

  // Sync from supabase if available
  if (supabaseClient) {
    ensureAuthorityRefreshHooks();
    (async () => {
      await detectPlayersSchema();
      const synced = await syncFromSupabase();
      if (synced) saveLocal();
      ensureSupabaseLiveSync();
      if (synced && canRunAdminSharedBackfill()) {
        (async () => {
          const catalogSynced = await backfillGroupCatalogToSupabase();
          const membershipsSynced = await backfillPlayerMembershipsToSupabase();
          if (catalogSynced || membershipsSynced) queueSupabaseRefresh();
        })();
      }
      render();

      if (!crossDeviceRefreshInterval) {
        // Keep multiple devices converged without requiring a full page refresh.
        crossDeviceRefreshInterval = setInterval(() => {
          if (document.hidden) return;
          queueSupabaseRefresh(0);
        }, 15000);
      }
    })();
  }
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


