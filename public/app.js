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
const APP_VERSION = '2026.04.25.21';
const LS_TAB_KEY = 'athletic_specimen_tab';
let activeMainTab = sessionStorage.getItem('as_main_tab') || 'players';
const LS_SUBTAB_KEY = 'athletic_specimen_skill_subtab';
const LS_GROUPS_KEY = 'athletic_specimen_groups';
const LS_ACTIVE_GROUP_KEY = 'athletic_specimen_active_group';
const LS_MASTER_ADMIN_AUTH_KEY = 'athletic_specimen_master_admin_auth';
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


function closePlayerEditPopup() {
  const modal = document.getElementById('player-edit-modal');
  if (!modal) return;
  modal.style.display = 'none';
  modal.setAttribute('aria-hidden', 'true');
  const body = document.getElementById('player-edit-modal-body');
  if (body) body.innerHTML = '';
}

function openPlayerEditPopup(playerKey) {
  const modal = document.getElementById('player-edit-modal');
  const body  = document.getElementById('player-edit-modal-body');
  if (!modal || !body) return;

  const player = state.players.find(p => playerIdentityKey(p) === playerKey);
  if (!player) return;

  const playerGroup  = (player.groups && player.groups[0]) || player.group || '';
  const playerGroups = Array.isArray(player.groups) ? player.groups : (playerGroup ? [playerGroup] : []);
  const groupsValue  = escapeHTMLText(JSON.stringify(playerGroups));
  const playerId     = escapeHTMLText(String(player.id || ''));
  const keyAttr      = escapeHTMLText(playerKey);

  body.innerHTML = `
    <div class="edit-row show popup-edit-row" data-player-key="${keyAttr}">
      <label class="popup-edit-label">Name</label>
      <input type="text" class="edit-name popup-edit-input" placeholder="Name" value="${escapeHTMLText(player.name)}" />
      <label class="popup-edit-label">Skill (0–10)</label>
      <input type="number" class="edit-skill popup-edit-input" placeholder="Skill" step="0.1" min="0" max="10" value="${player.skill}" />
      <label class="popup-edit-label">Group</label>
      <div class="group-select" data-player-key="${keyAttr}">
        <input type="hidden" class="edit-group"  value="${escapeHTMLText(playerGroup)}" />
        <input type="hidden" class="edit-groups" value="${groupsValue}" />
        <button type="button" class="group-btn">${escapeHTMLText(playerGroup || 'Choose group…')}</button>
        <div class="group-list" role="menu" aria-hidden="true">
          ${getAvailableGroups().map((g) => {
            const gn = normalizeGroupName(g);
            const mi = playerGroups.indexOf(gn);
            const isMember  = mi !== -1;
            const isPrimary = mi === 0;
            const lbl = `${gn}${isPrimary ? ' (Primary)' : isMember ? ' (Member)' : ''}`;
            return `<button type="button" class="group-item ${isMember ? 'is-member' : ''} ${isPrimary ? 'is-primary' : ''}" data-value="${escapeHTMLText(gn)}">${escapeHTMLText(lbl)}</button>`;
          }).join('')}
        </div>
        <div class="group-chips">${renderEditGroupChipsMarkup(playerGroups)}</div>
      </div>
      <div class="edit-actions" style="margin-top:12px;">
        <button type="button" class="btn-save-edit success" data-player-key="${keyAttr}" data-id="${playerId}">Save</button>
        <button type="button" class="btn-cancel-edit secondary" data-player-key="${keyAttr}">Cancel</button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');

  const nameInput = body.querySelector('.edit-name');
  if (nameInput) { nameInput.focus(); if (typeof nameInput.select === 'function') nameInput.select(); }
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
    nameInput.focus({ preventScroll: true });
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
      searchInput.focus({ preventScroll: true });
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
      } catch {}

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
      // close menu first
      const wrap = editBtn.closest('.menu-wrap');
      if (wrap) {
        wrap.classList.remove('menu-open');
        const button = wrap.querySelector('.btn-actions');
        if (button) button.setAttribute('aria-expanded', 'false');
      }
      openPlayerEditPopup(playerKey);
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
      const buttonPlayerKey = String(cancelBtn.getAttribute('data-player-key') || '').trim();
      const row = cancelBtn.closest('.edit-row') || findInlineEditRowByPlayerKey(buttonPlayerKey);
      closePlayerEditPopup();
      if (row) {
        closeInlineEditRow(row);
        row.querySelectorAll('.group-select.open').forEach((select) => select.classList.remove('open'));
      }
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
    closePlayerEditPopup();
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

// Touch drag-and-drop for generated teams (mobile support)
(function ensureGeneratedTeamTouchDnDBound() {
  if (window.__generatedTeamTouchDnDBound) return;
  window.__generatedTeamTouchDnDBound = true;

  const DRAG_THRESHOLD = 8;
  let touchDrag = null;
  let touchGhost = null;

  function elAt(cx, cy) {
    if (touchGhost) touchGhost.style.display = 'none';
    const el = document.elementFromPoint(cx, cy);
    if (touchGhost) touchGhost.style.display = '';
    return el;
  }

  function createGhost(card) {
    const rect = card.getBoundingClientRect();
    const g = card.cloneNode(true);
    Object.assign(g.style, {
      position: 'fixed',
      left: rect.left + 'px',
      top: rect.top + 'px',
      width: rect.width + 'px',
      margin: '0',
      zIndex: '99999',
      opacity: '0.88',
      pointerEvents: 'none',
      boxShadow: '0 10px 32px rgba(0,0,0,0.35)',
      transform: 'scale(1.06) rotate(2deg)',
      transition: 'none',
      borderRadius: '8px',
      background: '#e0e7ff',
    });
    document.body.appendChild(g);
    return g;
  }

  function moveGhost(cx, cy) {
    if (!touchGhost) return;
    const w = touchGhost.offsetWidth;
    const h = touchGhost.offsetHeight;
    touchGhost.style.left = (cx - w / 2) + 'px';
    touchGhost.style.top = (cy - h / 2) + 'px';
  }

  function cleanup() {
    if (touchGhost) { touchGhost.remove(); touchGhost = null; }
    touchDrag = null;
    clearGeneratedTeamDragVisuals();
  }

  document.addEventListener('touchstart', (e) => {
    const card = e.target.closest('.team-player-card');
    if (!card) return;
    const fromTeamIndex = Number(card.getAttribute('data-team-index'));
    const playerKey = String(card.getAttribute('data-player-key') || '');
    if (!playerKey || isNaN(fromTeamIndex)) return;
    const t = e.touches[0];
    touchDrag = { fromTeamIndex, playerKey, card, startX: t.clientX, startY: t.clientY, started: false, targetTeamEl: null, targetCardEl: null };
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!touchDrag) return;
    const t = e.touches[0];

    if (!touchDrag.started) {
      if (Math.hypot(t.clientX - touchDrag.startX, t.clientY - touchDrag.startY) < DRAG_THRESHOLD) return;
      touchDrag.started = true;
      touchGhost = createGhost(touchDrag.card);
      touchDrag.card.classList.add('is-dragging');
      document.body.classList.add('generated-team-dragging');
      document.querySelectorAll('.generated-team[data-team-index]').forEach((el) => {
        if (Number(el.getAttribute('data-team-index')) !== touchDrag.fromTeamIndex) el.classList.add('is-drop-enabled');
      });
    }

    e.preventDefault();
    moveGhost(t.clientX, t.clientY);

    const below = elAt(t.clientX, t.clientY);
    const teamEl = below ? below.closest('.generated-team[data-team-index]') : null;
    const cardEl = below ? below.closest('.team-player-card') : null;

    document.querySelectorAll('.generated-team.is-drop-target').forEach((el) => el.classList.remove('is-drop-target'));
    document.querySelectorAll('.team-player-card.is-swap-target').forEach((el) => el.classList.remove('is-swap-target'));

    touchDrag.targetTeamEl = null;
    touchDrag.targetCardEl = null;

    if (teamEl && Number(teamEl.getAttribute('data-team-index')) !== touchDrag.fromTeamIndex) {
      teamEl.classList.add('is-drop-target');
      touchDrag.targetTeamEl = teamEl;
      if (cardEl && cardEl !== touchDrag.card) {
        const tk = String(cardEl.getAttribute('data-player-key') || '');
        if (tk && tk !== touchDrag.playerKey) {
          cardEl.classList.add('is-swap-target');
          touchDrag.targetCardEl = cardEl;
        }
      }
    }
  }, { passive: false });

  document.addEventListener('touchend', () => {
    if (!touchDrag || !touchDrag.started) { cleanup(); return; }

    const teamEl = touchDrag.targetTeamEl;
    const cardEl = touchDrag.targetCardEl;
    const { fromTeamIndex, playerKey } = touchDrag;

    cleanup();

    if (!teamEl) return;
    const toTeamIndex = Number(teamEl.getAttribute('data-team-index'));
    if (isNaN(toTeamIndex) || toTeamIndex === fromTeamIndex) return;

    const swapWithKey = cardEl ? String(cardEl.getAttribute('data-player-key') || '') : '';
    const result = moveGeneratedPlayerBetweenTeams(fromTeamIndex, toTeamIndex, playerKey, swapWithKey);
    if (!result.changed) return;

    saveLocal();
    render();
  });

  document.addEventListener('touchcancel', cleanup);
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

function formatSessionDate(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
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

function buildCheckinStatsHTML() {
  const normalizedActiveGroup = normalizeActiveGroupSelection(state.activeGroup || 'All');
  const activeGroupLabel = normalizedActiveGroup === UNGROUPED_FILTER_VALUE
    ? UNGROUPED_FILTER_LABEL
    : (normalizedActiveGroup || 'All');
  const groups = state.isAdmin && !state.limitedGroup ? computeCheckedInByGroup() : [];
  return `
<div class="checkin-stats-card">
  <div class="checkin-stat-hero">
    <span class="checkin-stat-num">${state.checkedIn.length}</span>
    <span class="checkin-stat-label">Checked In</span>
  </div>
  ${groups.length ? `
  <div class="checkin-group-breakdown">
    ${groups.map((row) => `
    <div class="checkin-group-row">
      <span class="checkin-group-name">${escapeHTMLText(row.groupLabel)}</span>
      <span class="checkin-group-fraction">${row.in}<span class="checkin-group-sep">/</span>${row.total}</span>
    </div>`).join('')}
  </div>` : state.isAdmin && state.limitedGroup ? `<p class="checkin-stats-group-label">${escapeHTMLText(activeGroupLabel)}</p>` : ''}
</div>`;
}

function partialRender() {
  const root = document.getElementById('root');
  if (!root || !root.hasChildNodes()) { render(); return; }

  const syncNoticeEl = document.getElementById('js-sync-notice');
  const statsEl = document.getElementById('js-checkin-stats');
  const playersEl = document.querySelector('.players');

  if (!syncNoticeEl || !statsEl || !playersEl) { render(); return; }

  syncNoticeEl.innerHTML = buildSharedSyncNoticeHTML();
  statsEl.innerHTML = buildCheckinStatsHTML();

  const snapshot = captureTransientInteractionState();
  playersEl.innerHTML = renderFilteredPlayers();
  bindPlayerRowHandlers();
  bindSelectionHandlers();
  updateBulkBarVisibility();
  restoreTransientInteractionState(snapshot);
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

function normalizeTournamentRevision(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function serializeTournamentStoreTag(storeSnapshot, revision = 0) {
  const snapshot = storeSnapshot && typeof storeSnapshot === 'object'
    ? storeSnapshot
    : { activeTournamentId: '', tournaments: [] };
  try {
    const envelope = {
      revision: normalizeTournamentRevision(revision),
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
        revision: normalizeTournamentRevision(parsed.revision),
        updatedAt: Number(parsed.updatedAt) || 0,
        store: parsed.store
      };
    }
    if (parsed && typeof parsed === 'object') {
      return {
        revision: 0,
        updatedAt: Number(parsed.updatedAt) || 0,
        store: parsed
      };
    }
    return null;
  } catch {
    return null;
  }
}

function parseTournamentStateRow(row) {
  const envelope = parseTournamentStoreTagEnvelope(row && row.tag);
  if (!envelope || !envelope.store || typeof envelope.store !== 'object') return null;
  const rowUpdatedAt = Number(new Date(row && row.updated_at).getTime()) || 0;
  return {
    rowId: String(row && row.id || '').trim(),
    rawTag: String(row && row.tag || ''),
    revision: normalizeTournamentRevision(envelope.revision),
    updatedAt: Math.max(Number(envelope.updatedAt) || 0, rowUpdatedAt),
    store: envelope.store
  };
}

function sortTournamentStateRows(rows) {
  return (Array.isArray(rows) ? rows.slice() : []).sort((a, b) => {
    const revDiff = normalizeTournamentRevision(b && b.revision) - normalizeTournamentRevision(a && a.revision);
    if (revDiff !== 0) return revDiff;
    const atDiff = (Number(b && b.updatedAt) || 0) - (Number(a && a.updatedAt) || 0);
    if (atDiff !== 0) return atDiff;
    return String(b && b.rowId || '').localeCompare(String(a && a.rowId || ''));
  });
}

function setTournamentAuthorityCursor({ revision = 0, rowId = '', rawTag = '', updatedAt = 0, known = true } = {}) {
  state.tournamentAuthorityRevision = known ? normalizeTournamentRevision(revision) : 0;
  state.tournamentAuthorityRowId = known ? String(rowId || '').trim() : '';
  state.tournamentAuthorityTag = known ? String(rawTag || '') : '';
  state.tournamentAuthorityUpdatedAt = known ? (Number(updatedAt) || 0) : 0;
  state.tournamentAuthorityKnown = !!known;
}

async function fetchTournamentStateRowsFromSupabase() {
  if (!supabaseClient) return [];
  const { data, error } = await supabaseClient
    .from('players')
    .select('id,tag,updated_at')
    .eq('name', TOURNAMENT_STATE_ROW_NAME)
    .limit(8);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
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
          queueSupabaseRefresh(800);
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

  const triggerRefresh = (_reason) => {
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
      const syncNoticeEl = document.getElementById('js-sync-notice');
      if (syncNoticeEl) syncNoticeEl.innerHTML = buildSharedSyncNoticeHTML();
      else render();
    }
    ensureSupabaseLiveSync();
    queueSupabaseRefresh(800);
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
        partialRender();
      }
      return;
    }
    saveLocal();
    partialRender();
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

  // Simple move when fromTeam is larger — won't worsen balance.
  if (fromTeam.length > toTeam.length) {
    const [dragged] = fromTeam.splice(fromIdx, 1);
    toTeam.push(dragged);
    state.generatedTeams = teams;
    updateGeneratedTeamsSummaryFromCurrent(teams);
    return { changed: true, mode: 'move' };
  }

  // Equal sizes: auto-swap with the closest-skill player in the target team.
  const draggedSkill = Number(fromTeam[fromIdx].skill) || 0;
  let bestIdx = 0;
  let bestDiff = Infinity;
  toTeam.forEach((p, idx) => {
    const diff = Math.abs((Number(p.skill) || 0) - draggedSkill);
    if (diff < bestDiff) { bestDiff = diff; bestIdx = idx; }
  });
  const dragged = fromTeam[fromIdx];
  fromTeam[fromIdx] = toTeam[bestIdx];
  toTeam[bestIdx] = dragged;
  state.generatedTeams = teams;
  updateGeneratedTeamsSummaryFromCurrent(teams);
  return { changed: true, mode: 'auto-swap' };
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
        <div class="player-card-main">
          ${state.isAdmin ? `<input type="checkbox" class="player-select" data-id="${player.id}" ${isSelected ? 'checked' : ''} />` : ''}
          <div class="player-card-info">
            <span class="player-name">${player.name}</span>
            <div class="player-meta">
              <span class="skill-pill">Skill ${player.skill === 0 ? 'Unset' : player.skill}</span>
              <span class="status-pill ${checked ? 'in' : 'out'}">${checked ? 'In' : 'Out'}</span>
              ${groupsDisplayHTML}
            </div>
          </div>
          <div class="player-card-side">
            ${checked
              ? `<button class="btn-checkout" data-id="${player.id}">Check Out</button>`
              : `<button class="btn-checkin" data-id="${player.id}">Check In</button>`
            }
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
          </div>
        </div>

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
  masterAdminAuthenticated: false, // true only for MASTER_ADMIN_CODE session
  adminCodeMap: {},   // live copy used by the UI
  sharedSyncState: (SUPABASE_AUTHORITATIVE && supabaseClient)
    ? SHARED_SYNC_PENDING
    : SHARED_SYNC_LOCAL_ONLY,
  sharedSyncError: '',
  currentSession: null, // { date, time, location } or null
  lastSharedSyncAt: 0,
  tournamentSyncState: (SUPABASE_AUTHORITATIVE && supabaseClient)
    ? SHARED_SYNC_PENDING
    : SHARED_SYNC_LOCAL_ONLY,
  tournamentSyncError: '',
  lastTournamentSyncAt: 0,
  tournamentAuthorityRevision: 0,
  tournamentAuthorityRowId: '',
  tournamentAuthorityTag: '',
  tournamentAuthorityUpdatedAt: 0,
  tournamentAuthorityKnown: false,
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
  if (state.tournamentAuthorityKnown) {
    return `Tournament cloud sync is canonical (rev r${normalizeTournamentRevision(state.tournamentAuthorityRevision)}).`;
  }
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

function canAccessOperatorSafetyControls() {
  return !!(state.isAdmin && state.masterAdminAuthenticated && !state.limitedGroup);
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
  if (!canAccessOperatorSafetyControls()) return '';
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
  if (!canAccessOperatorSafetyControls()) return;
  const target = String(actionId || '').trim();
  if (!target) return;
  const entry = (state.operatorActions || []).find((item) => item && item.id === target);
  if (!entry || !entry.undo || entry.undo.used) return;

  const undoType = String(entry.undo.kind || '').trim();
  if (undoType === 'tournament-store') {
    TournamentManager.replaceStore(entry.undo.storeSnapshot || { activeTournamentId: '', tournaments: [] });
    if (SUPABASE_AUTHORITATIVE && supabaseClient) {
      const syncResult = await syncTournamentStoreToSupabase({ contextLabel: 'operator-undo-tournament' });
      if (!syncResult.ok) {
        await reconcileTournamentToSupabaseAuthority('operator-undo-tournament');
        setTournamentNotice(
          syncResult.conflict
            ? 'Undo blocked by a newer tournament update on another device. Latest shared state was restored.'
            : 'Undo failed to sync. Restored latest shared tournament state.',
          TOURNAMENT_NOTICE_ERROR
        );
        recordOperatorAction({
          scope: 'tournament',
          action: syncResult.conflict ? 'undo-conflict' : 'undo-failed',
          entityType: entry.entityType || 'tournament',
          entityId: entry.entityId || '',
          title: syncResult.conflict
            ? 'Undo blocked by newer shared tournament revision.'
            : 'Undo failed: restored shared tournament state instead.',
          detail: syncResult.message || entry.title,
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

async function syncTournamentStoreToSupabase(options = {}) {
  const contextLabel = String(options && options.contextLabel || 'tournament-write').trim() || 'tournament-write';
  const buildConflictResult = (message, remoteRevision = null) => ({
    ok: false,
    conflict: true,
    contextLabel,
    expectedRevision: normalizeTournamentRevision(state.tournamentAuthorityRevision),
    remoteRevision: Number.isFinite(Number(remoteRevision)) ? normalizeTournamentRevision(remoteRevision) : null,
    message: String(message || '').trim() || 'Concurrent tournament update detected.'
  });
  const buildFailureResult = (message) => ({
    ok: false,
    conflict: false,
    contextLabel,
    message: String(message || '').trim() || 'Tournament write failed.'
  });

  if (!supabaseClient || !SUPABASE_AUTHORITATIVE) {
    setTournamentSyncState(SHARED_SYNC_LOCAL_ONLY, 'Supabase unavailable for tournament sync.');
    return buildFailureResult('Supabase unavailable for tournament sync.');
  }
  if (!PLAYERS_SCHEMA_DETECTED) {
    await detectPlayersSchema();
  }
  if (!HAS_TAG) {
    setTournamentSyncState(SHARED_SYNC_FALLBACK, 'Tournament sync requires players.tag support.');
    return buildFailureResult('Tournament sync requires players.tag support.');
  }
  if (!state.tournamentAuthorityKnown) {
    const msg = 'Tournament authority baseline is not established yet. Refresh shared state first.';
    setTournamentSyncState(SHARED_SYNC_FALLBACK, msg);
    return buildConflictResult(msg, null);
  }

  const snapshot = TournamentManager.getStoreSnapshot();
  const expectedRevision = normalizeTournamentRevision(state.tournamentAuthorityRevision);
  const expectedRowId = String(state.tournamentAuthorityRowId || '').trim();
  const expectedTag = String(state.tournamentAuthorityTag || '');
  const nextRevision = expectedRevision + 1;
  const encodedTag = serializeTournamentStoreTag(snapshot, nextRevision);
  if (!encodedTag) {
    setTournamentSyncState(SHARED_SYNC_FALLBACK, 'Tournament sync payload encoding failed.');
    return buildFailureResult('Tournament sync payload encoding failed.');
  }

  setTournamentSyncState(SHARED_SYNC_PENDING);
  try {
    const rows = await fetchTournamentStateRowsFromSupabase();
    const parsedRows = [];
    let invalidPayloadFound = false;
    for (const row of rows) {
      const parsed = parseTournamentStateRow(row);
      if (parsed) parsedRows.push(parsed);
      else invalidPayloadFound = true;
    }
    const sortedRows = sortTournamentStateRows(parsedRows);
    const remoteLatest = sortedRows.length ? sortedRows[0] : null;
    const remoteRevision = remoteLatest ? normalizeTournamentRevision(remoteLatest.revision) : 0;

    if (!remoteLatest && invalidPayloadFound) {
      const msg = 'Tournament cloud payload is invalid. Write blocked until shared state is repaired.';
      setTournamentSyncState(SHARED_SYNC_FALLBACK, msg);
      return buildFailureResult(msg);
    }

    if (remoteLatest) {
      if (remoteRevision !== expectedRevision) {
        const msg = `Write blocked by newer shared tournament revision (expected r${expectedRevision}, found r${remoteRevision}).`;
        setTournamentSyncState(SHARED_SYNC_FALLBACK, msg);
        return buildConflictResult(msg, remoteRevision);
      }
      if (expectedRowId && remoteLatest.rowId && expectedRowId !== remoteLatest.rowId) {
        const msg = 'Write blocked because the shared tournament state row changed.';
        setTournamentSyncState(SHARED_SYNC_FALLBACK, msg);
        return buildConflictResult(msg, remoteRevision);
      }
      if (expectedTag && remoteLatest.rawTag && expectedTag !== remoteLatest.rawTag) {
        const msg = `Write blocked by concurrent tournament update (shared revision r${remoteRevision}).`;
        setTournamentSyncState(SHARED_SYNC_FALLBACK, msg);
        return buildConflictResult(msg, remoteRevision);
      }
    } else if (expectedRevision !== 0 || expectedRowId || expectedTag) {
      const msg = 'Write blocked because shared tournament baseline changed (state row missing).';
      setTournamentSyncState(SHARED_SYNC_FALLBACK, msg);
      return buildConflictResult(msg, 0);
    }

    const payload = {
      name: TOURNAMENT_STATE_ROW_NAME,
      skill: 0,
      checked_in: false,
      tag: encodedTag
    };
    if (HAS_GROUP) payload.group = '';

    let committedRow = null;
    if (remoteLatest) {
      const { data: updatedRows, error: updateError } = await supabaseClient
        .from('players')
        .update(payload)
        .eq('id', remoteLatest.rowId)
        .eq('tag', remoteLatest.rawTag)
        .select('id,tag,updated_at')
        .limit(1);
      if (updateError) throw updateError;
      if (!Array.isArray(updatedRows) || !updatedRows.length) {
        const latestAfterRows = await fetchTournamentStateRowsFromSupabase().catch(() => []);
        const parsedAfter = sortTournamentStateRows(
          latestAfterRows
            .map((row) => parseTournamentStateRow(row))
            .filter(Boolean)
        );
        const latestAfter = parsedAfter.length ? parsedAfter[0] : null;
        const latestAfterRevision = latestAfter ? latestAfter.revision : remoteRevision;
        const msg = `Write blocked by concurrent tournament update during commit (expected r${expectedRevision}, found r${normalizeTournamentRevision(latestAfterRevision)}).`;
        setTournamentSyncState(SHARED_SYNC_FALLBACK, msg);
        return buildConflictResult(msg, latestAfterRevision);
      }
      committedRow = updatedRows[0];

      for (const duplicate of rows) {
        const duplicateId = String(duplicate && duplicate.id || '').trim();
        if (!duplicateId || duplicateId === String(committedRow && committedRow.id || '')) continue;
        const { error: deleteError } = await supabaseClient
          .from('players')
          .delete()
          .eq('id', duplicateId);
        if (deleteError) {
          console.error('Supabase tournament duplicate delete error', deleteError);
        }
      }
    } else {
      const { data: insertedRows, error: insertError } = await supabaseClient
        .from('players')
        .insert([payload])
        .select('id,tag,updated_at')
        .limit(1);
      if (insertError) throw insertError;
      committedRow = Array.isArray(insertedRows) && insertedRows.length ? insertedRows[0] : null;
      if (!committedRow) {
        throw new Error('Tournament state insert returned no row.');
      }
    }

    const parsedCommitted = parseTournamentStateRow(committedRow);
    if (parsedCommitted) {
      setTournamentAuthorityCursor({
        revision: parsedCommitted.revision,
        rowId: parsedCommitted.rowId,
        rawTag: parsedCommitted.rawTag,
        updatedAt: parsedCommitted.updatedAt,
        known: true
      });
    } else {
      setTournamentAuthorityCursor({
        revision: nextRevision,
        rowId: String(committedRow && committedRow.id || ''),
        rawTag: encodedTag,
        updatedAt: Date.now(),
        known: true
      });
    }

    setTournamentSyncState(SHARED_SYNC_LIVE);
    queueSupabaseRefresh(0);
    return {
      ok: true,
      conflict: false,
      contextLabel,
      revision: normalizeTournamentRevision(state.tournamentAuthorityRevision)
    };
  } catch (err) {
    console.error('Supabase tournament sync error', err);
    setTournamentSyncState(SHARED_SYNC_FALLBACK, 'Tournament write failed. Showing local fallback.');
    return buildFailureResult('Tournament write failed. Showing local fallback.');
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
  if (show) ensureTournamentOverlayBindings();
  const v = document.getElementById('view-tournament');
  if (!v) return;
  v.style.display = show ? 'block' : 'none';
  v.setAttribute('aria-hidden', show ? 'false' : 'true');
  if (show) {
    pushTournamentRuntimeTrace('view opened.');
  }
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
  } catch {
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
  const masterAdminFlag = sessionStorage.getItem(LS_MASTER_ADMIN_AUTH_KEY);
  state.masterAdminAuthenticated = state.isAdmin && masterAdminFlag === 'true' && !state.limitedGroup;

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
        const parsedRow = parseTournamentStateRow(p);
        if (parsedRow) {
          remoteTournamentEnvelopes.push(parsedRow);
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
        setTournamentAuthorityCursor({ known: false });
      } else {
        const sortedTournamentEnvelopes = sortTournamentStateRows(remoteTournamentEnvelopes);
        const hasValidTournamentStore = remoteTournamentEnvelopes.length > 0;
        if (!hasValidTournamentStore && invalidTournamentPayloadFound) {
          setTournamentSyncState(
            SHARED_SYNC_FALLBACK,
            'Tournament cloud payload is invalid. Using local fallback.'
          );
          setTournamentAuthorityCursor({ known: false });
        } else {
          const latestEnvelope = hasValidTournamentStore ? sortedTournamentEnvelopes[0] : null;
          const latestStore = latestEnvelope
            ? latestEnvelope.store
            : { activeTournamentId: '', tournaments: [] };
          applyTournamentStoreFromAuthority(latestStore);
          setTournamentAuthorityCursor(
            latestEnvelope
              ? {
                revision: latestEnvelope.revision,
                rowId: latestEnvelope.rowId,
                rawTag: latestEnvelope.rawTag,
                updatedAt: latestEnvelope.updatedAt,
                known: true
              }
              : { revision: 0, rowId: '', rawTag: '', updatedAt: Date.now(), known: true }
          );
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
    tournamentSynced: false,
    tournamentSyncConflict: false
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
  const tournamentSyncResult = await syncTournamentStoreToSupabase({ contextLabel: 'force-save-all' });
  summary.tournamentSynced = !!tournamentSyncResult.ok;
  summary.tournamentSyncConflict = !!tournamentSyncResult.conflict;

  const synced = await syncFromSupabase();
  if (synced) saveLocal();
  return summary;
}

const TOURNAMENT_NOTICE_INFO = 'info';
const TOURNAMENT_NOTICE_ERROR = 'error';
const TOURNAMENT_NOTICE_SUCCESS = 'success';
const TOURNAMENT_UNSET_VALUE = '';
const TOURNAMENT_RUNTIME_DEBUG_STORAGE_KEY = 'athletic_specimen_tournament_debug';
const TOURNAMENT_RUNTIME_TRACE_LIMIT = 8;
const TOURNAMENT_RUNTIME_DEBUG_ENABLED = (() => {
  try {
    const params = new URLSearchParams(window.location.search || '');
    if (params.get('trDebug') === '1' || params.get('tournamentDebug') === '1') return true;
    return localStorage.getItem(TOURNAMENT_RUNTIME_DEBUG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
})();
const tournamentViewState = {
  noticeText: '',
  noticeTone: TOURNAMENT_NOTICE_INFO,
  section: 'overview',
  playerSearch: '',
  runtimeTrace: [],
  teamExpandedById: {}
};

function setTournamentNotice(text, tone = TOURNAMENT_NOTICE_INFO) {
  tournamentViewState.noticeText = String(text || '').trim();
  tournamentViewState.noticeTone = tone || TOURNAMENT_NOTICE_INFO;
}

function clearTournamentNotice() {
  setTournamentNotice('', TOURNAMENT_NOTICE_INFO);
}

function getTournamentExpandedTeamMap() {
  const raw = tournamentViewState.teamExpandedById;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw;
}

function pruneTournamentTeamExpansionState(teamIds = []) {
  const existing = getTournamentExpandedTeamMap();
  const keep = new Set((Array.isArray(teamIds) ? teamIds : []).map((id) => String(id || '').trim()).filter(Boolean));
  const next = {};
  Object.keys(existing).forEach((id) => {
    if (keep.has(id) && existing[id]) next[id] = true;
  });
  tournamentViewState.teamExpandedById = next;
}

function isTournamentTeamExpanded(teamId) {
  const id = String(teamId || '').trim();
  if (!id) return false;
  return !!getTournamentExpandedTeamMap()[id];
}

function setTournamentTeamExpanded(teamId, expanded) {
  const id = String(teamId || '').trim();
  if (!id) return;
  const next = { ...getTournamentExpandedTeamMap() };
  if (expanded) next[id] = true;
  else delete next[id];
  tournamentViewState.teamExpandedById = next;
}

function formatTournamentRuntimeTraceTime(timestamp) {
  if (!Number.isFinite(timestamp)) return '';
  try {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch {
    return '';
  }
}

function pushTournamentRuntimeTrace(message, tone = TOURNAMENT_NOTICE_INFO) {
  if (!TOURNAMENT_RUNTIME_DEBUG_ENABLED) return;
  const text = String(message || '').trim();
  if (!text) return;
  const safeTone = tone === TOURNAMENT_NOTICE_ERROR || tone === TOURNAMENT_NOTICE_SUCCESS
    ? tone
    : TOURNAMENT_NOTICE_INFO;
  const next = [{
    id: `trdbg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    text,
    tone: safeTone,
    at: Date.now()
  }];
  if (Array.isArray(tournamentViewState.runtimeTrace)) {
    next.push(...tournamentViewState.runtimeTrace);
  }
  tournamentViewState.runtimeTrace = next.slice(0, TOURNAMENT_RUNTIME_TRACE_LIMIT);
}

function renderTournamentRuntimeTraceHTML() {
  if (!TOURNAMENT_RUNTIME_DEBUG_ENABLED) return '';
  const rows = Array.isArray(tournamentViewState.runtimeTrace)
    ? tournamentViewState.runtimeTrace.filter((entry) => entry && entry.text)
    : [];
  if (!rows.length) return '';
  const itemsHTML = rows.map((entry) => {
    const timeLabel = formatTournamentRuntimeTraceTime(Number(entry.at));
    const tone = entry.tone === TOURNAMENT_NOTICE_ERROR || entry.tone === TOURNAMENT_NOTICE_SUCCESS
      ? entry.tone
      : TOURNAMENT_NOTICE_INFO;
    const prefix = timeLabel ? `[${timeLabel}] ` : '';
    return `<li class="tournament-runtime-trace-item is-${tone}">${escapeHTMLText(`${prefix}${entry.text}`)}</li>`;
  }).join('');
  return `
    <div class="tournament-runtime-trace">
      <p class="tournament-runtime-trace-title">Tournament Runtime Debug (v${escapeHTMLText(APP_VERSION)})</p>
      <ul class="tournament-runtime-trace-list">${itemsHTML}</ul>
    </div>
  `;
}

function showTournamentActionBlocked(reason) {
  const message = String(reason || '').trim() || 'Tournament action blocked.';
  setTournamentNotice(message, TOURNAMENT_NOTICE_ERROR);
  pushTournamentRuntimeTrace(`action blocked: ${message}`, TOURNAMENT_NOTICE_ERROR);
  initTournamentView();
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
    const sourceMembers = Array.isArray(rawTeam?.memberKeys)
      ? rawTeam.memberKeys
      : (Array.isArray(rawTeam?.memberIds) ? rawTeam.memberIds : []);
    const memberKeys = Array.from(new Set(sourceMembers.map((key) => String(key || '').trim()).filter(Boolean)));
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
    const players = Array.isArray(rawTournament?.players)
      ? rawTournament.players
        .map((player, index) => {
          const name = String(player?.name || '').trim();
          if (!name) return null;
          return {
            id: String(player?.id || uid()),
            name,
            skill: Number.isFinite(Number(player?.skill)) ? Number(player.skill) : 0,
            seed: Number.isFinite(Number(player?.seed)) ? Number(player.seed) : index + 1,
            notes: String(player?.notes || '').trim(),
            active: player?.active !== false,
            availability: String(player?.availability || 'available').trim() || 'available',
            teamId: player?.teamId ? String(player.teamId) : ''
          };
        })
        .filter(Boolean)
      : [];
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
      players,
      phase: String(rawTournament?.phase || '').trim(),
      sourceSummary: String(rawTournament?.sourceSummary || '').trim(),
      settings: rawTournament?.settings && typeof rawTournament.settings === 'object'
        ? {
          tieBreak: String(rawTournament.settings.tieBreak || 'pd').trim() || 'pd'
        }
        : { tieBreak: 'pd' },
      history: Array.isArray(rawTournament?.history)
        ? rawTournament.history
          .map((entry) => {
            const message = String(entry?.message || '').trim();
            if (!message) return null;
            return {
              id: String(entry?.id || uid()),
              at: Number(entry?.at) || Date.now(),
              action: String(entry?.action || 'update').trim() || 'update',
              message
            };
          })
          .filter(Boolean)
        : [],
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

function ensureTournamentTabClickable() {
  const btn = document.querySelector('#bottom-nav [data-nav-tab="tournament"]');
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

  const recordFailure = (title, detailOverride = '', actionSuffix = 'failed') => {
    if (!meta) return;
    const suffix = String(actionSuffix || 'failed').trim() || 'failed';
    const actionName = suffix === 'failed' ? `${baseAction}-failed` : `${baseAction}-${suffix}`;
    recordOperatorAction({
      scope: baseScope,
      action: actionName,
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
    const syncResult = await syncTournamentStoreToSupabase({ contextLabel });
    if (!syncResult.ok) {
      await reconcileTournamentToSupabaseAuthority(contextLabel || 'tournament-write');
      if (syncResult.conflict) {
        setTournamentNotice(
          'Tournament change blocked by a newer shared update. Latest shared state was loaded. Review and retry if needed.',
          TOURNAMENT_NOTICE_ERROR
        );
        recordFailure(
          'Tournament change blocked by newer shared revision.',
          syncResult.message || `Conflict detected during ${contextLabel || 'tournament-write'}.`,
          'conflict'
        );
      } else {
        setTournamentNotice(
          'Tournament change was not saved to Supabase. Restored latest shared state.',
          TOURNAMENT_NOTICE_ERROR
        );
        recordFailure(
          'Tournament write failed. Restored latest shared state.',
          `Change was reverted during reconcile (${contextLabel || 'tournament-write'}).`
        );
      }
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

const TournamentSubApp = (() => {
  const PHASE_SETUP = 'setup';
  const PHASE_READY = 'ready';
  const PHASE_RUNNING = 'running';
  const PHASE_PAUSED = 'paused';
  const PHASE_COMPLETED = 'completed';
  const SECTION_OVERVIEW = 'overview';
  const SECTION_PLAYERS = 'players';
  const SECTION_TEAMS = 'teams';
  const SECTION_MATCHES = 'matches';
  const SECTION_COURTS = 'courts';
  const SECTION_STANDINGS = 'standings';
  const SECTION_SETTINGS = 'settings';
  const SECTION_HISTORY = 'history';
  const SECTIONS = [
    SECTION_OVERVIEW,
    SECTION_PLAYERS,
    SECTION_TEAMS,
    SECTION_MATCHES,
    SECTION_COURTS,
    SECTION_STANDINGS,
    SECTION_SETTINGS,
    SECTION_HISTORY
  ];

  const uid = (prefix = 'trn') => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

  const clampCourtCount = (value) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return 2;
    return Math.max(1, Math.min(8, parsed));
  };
  const clampSkill = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.min(10, Math.round(parsed * 10) / 10));
  };
  const asArray = (value) => Array.isArray(value) ? value : [];
  const sortMatches = (matches) => asArray(matches).slice().sort((a, b) => {
    if (a.round !== b.round) return a.round - b.round;
    if (a.slot !== b.slot) return a.slot - b.slot;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
  const baseStatusFromPhase = (phase) => (
    phase === PHASE_COMPLETED
      ? TournamentManager.STATUS_COMPLETED
      : (phase === PHASE_SETUP ? TournamentManager.STATUS_SETUP : TournamentManager.STATUS_ACTIVE)
  );
  const normalizePhase = (value) => {
    const raw = String(value || '').trim();
    if ([PHASE_SETUP, PHASE_READY, PHASE_RUNNING, PHASE_PAUSED, PHASE_COMPLETED].includes(raw)) return raw;
    return PHASE_SETUP;
  };

  function derivePhase(record) {
    if (record.phase === PHASE_PAUSED) return PHASE_PAUSED;
    const matches = asArray(record.matches);
    const hasLive = matches.some((match) => match.status === TournamentManager.MATCH_LIVE);
    const hasScheduled = matches.some((match) => match.status === TournamentManager.MATCH_SCHEDULED);
    const hasFinal = matches.some((match) => match.status === TournamentManager.MATCH_FINAL);
    const allFinal = matches.length > 0 && matches.every((match) => match.status === TournamentManager.MATCH_FINAL);
    const playableTeams = asArray(record.teams).filter((team) => asArray(team.memberKeys).length > 0).length;
    if (allFinal) return PHASE_COMPLETED;
    if (hasLive) return PHASE_RUNNING;
    if (hasScheduled || hasFinal) return PHASE_READY;
    if (playableTeams >= 2) return PHASE_READY;
    return PHASE_SETUP;
  }

  function canonicalizeTournament(rawTournament = {}) {
    const teams = asArray(rawTournament.teams).map((team, index) => {
      const memberKeys = Array.from(new Set(
        asArray(team?.memberKeys || team?.memberIds)
          .map((memberId) => String(memberId || '').trim())
          .filter(Boolean)
      ));
      return {
        id: String(team?.id || uid('tt')),
        name: String(team?.name || `Team ${index + 1}`).trim() || `Team ${index + 1}`,
        seed: Number.isFinite(Number(team?.seed)) ? Number(team.seed) : index + 1,
        notes: String(team?.notes || '').trim(),
        memberKeys
      };
    }).sort((a, b) => a.seed - b.seed).map((team, index) => ({ ...team, seed: index + 1 }));

    const membershipByPlayer = new Map();
    teams.forEach((team) => {
      (team.memberKeys || []).forEach((memberId) => {
        const safeId = String(memberId || '').trim();
        if (!safeId || membershipByPlayer.has(safeId)) return;
        membershipByPlayer.set(safeId, team.id);
      });
    });

    let players = asArray(rawTournament.players).map((player, index) => {
      const playerId = String(player?.id || uid('tp'));
      const fallbackTeamId = membershipByPlayer.get(playerId) || '';
      const name = String(player?.name || '').trim() || `Player ${index + 1}`;
      return {
        id: playerId,
        name,
        skill: clampSkill(player?.skill),
        seed: Number.isFinite(Number(player?.seed)) ? Number(player.seed) : index + 1,
        notes: String(player?.notes || '').trim(),
        active: player?.active !== false,
        availability: String(player?.availability || 'available').trim() || 'available',
        teamId: player?.teamId ? String(player.teamId) : fallbackTeamId
      };
    });

    // Migration safety: older tournament records could carry only team.memberKeys
    // from main-app identity keys without tournament-owned player entities.
    if (!players.length && teams.length) {
      ensurePlayerIdentityKeys();
      const mainByIdentity = new Map();
      (state.players || []).forEach((player) => {
        const identity = playerIdentityKey(player);
        if (!identity || mainByIdentity.has(identity)) return;
        mainByIdentity.set(identity, player);
      });
      membershipByPlayer.forEach((teamId, legacyId) => {
        const sourcePlayer = mainByIdentity.get(legacyId) || null;
        const displayName = sourcePlayer && sourcePlayer.name
          ? String(sourcePlayer.name).trim()
          : '';
        players.push({
          id: legacyId,
          name: displayName || `Imported Player ${players.length + 1}`,
          skill: clampSkill(sourcePlayer ? sourcePlayer.skill : 0),
          seed: players.length + 1,
          notes: 'Migrated from legacy tournament team membership.',
          active: true,
          availability: 'available',
          teamId
        });
      });
    }

    const teamById = new Map(teams.map((team) => [team.id, team]));
    teams.forEach((team) => { team.memberKeys = []; });
    players.forEach((player) => {
      const team = player.teamId ? teamById.get(player.teamId) : null;
      if (!team || !player.active) {
        player.teamId = '';
        return;
      }
      if (!team.memberKeys.includes(player.id)) team.memberKeys.push(player.id);
    });

    const matches = sortMatches(asArray(rawTournament.matches).map((match) => {
      const statusRaw = String(match?.status || '').trim();
      const status = statusRaw === TournamentManager.MATCH_LIVE || statusRaw === TournamentManager.MATCH_FINAL
        ? statusRaw
        : TournamentManager.MATCH_SCHEDULED;
      const teamAId = match?.teamAId ? String(match.teamAId) : null;
      const teamBId = match?.teamBId ? String(match.teamBId) : null;
      return {
        id: String(match?.id || uid('tm')),
        round: Math.max(1, Number.parseInt(match?.round, 10) || 1),
        slot: Math.max(1, Number.parseInt(match?.slot, 10) || 1),
        bracket: TournamentManager.FORMAT_RR,
        court: Math.max(1, Number.parseInt(match?.court, 10) || 1),
        status,
        teamAId: teamById.has(teamAId) ? teamAId : null,
        teamBId: teamById.has(teamBId) ? teamBId : null,
        scoreA: Number.isFinite(Number(match?.scoreA)) ? Number(match.scoreA) : null,
        scoreB: Number.isFinite(Number(match?.scoreB)) ? Number(match.scoreB) : null,
        winnerTeamId: match?.winnerTeamId ? String(match.winnerTeamId) : null,
        loserTeamId: match?.loserTeamId ? String(match.loserTeamId) : null
      };
    }));

    const history = asArray(rawTournament.history).map((entry) => ({
      id: String(entry?.id || uid('th')),
      at: Number(entry?.at) || Date.now(),
      action: String(entry?.action || 'update').trim() || 'update',
      message: String(entry?.message || '').trim()
    })).filter((entry) => entry.message);

    const phase = derivePhase({
      ...rawTournament,
      players,
      teams,
      matches,
      phase: normalizePhase(rawTournament.phase)
    });

    return {
      id: String(rawTournament.id || uid('trn')),
      name: String(rawTournament.name || 'Tournament Event').trim() || 'Tournament Event',
      format: TournamentManager.FORMAT_RR,
      sourceMode: 'independent',
      sourceGroup: 'All',
      sourceSummary: String(rawTournament.sourceSummary || '').trim() || 'manual',
      courtCount: clampCourtCount(rawTournament.courtCount),
      teamCount: teams.length,
      teams,
      matches,
      players,
      history,
      settings: rawTournament.settings && typeof rawTournament.settings === 'object'
        ? { tieBreak: String(rawTournament.settings.tieBreak || 'pd').trim() || 'pd' }
        : { tieBreak: 'pd' },
      teamBuildSummary: rawTournament.teamBuildSummary && typeof rawTournament.teamBuildSummary === 'object'
        ? rawTournament.teamBuildSummary
        : null,
      phase,
      status: baseStatusFromPhase(phase),
      createdAt: Number(rawTournament.createdAt) || Date.now(),
      updatedAt: Number(rawTournament.updatedAt) || Date.now()
    };
  }

  function withStoreMutated(mutator) {
    const store = TournamentManager.getStoreSnapshot();
    const result = mutator(store);
    if (result && result.ok === false) return result;
    TournamentManager.replaceStore(store);
    return result;
  }

  function mutateTournament(id, mutator) {
    const safeId = String(id || '').trim();
    if (!safeId) return { ok: false, error: 'Tournament not found.' };
    return withStoreMutated((store) => {
      const index = asArray(store.tournaments).findIndex((tournament) => String(tournament?.id || '') === safeId);
      if (index === -1) return { ok: false, error: 'Tournament not found.' };
      const draft = canonicalizeTournament(store.tournaments[index]);
      const result = mutator(draft);
      if (result && result.ok === false) return result;
      draft.updatedAt = Date.now();
      const canonical = canonicalizeTournament(draft);
      store.tournaments[index] = canonical;
      if (!store.activeTournamentId) store.activeTournamentId = canonical.id;
      return { ok: true, tournament: canonical, ...(result && typeof result === 'object' ? result : {}) };
    });
  }

  function addHistory(draft, action, message) {
    draft.history = [...asArray(draft.history), {
      id: uid('th'),
      at: Date.now(),
      action: String(action || 'update').trim() || 'update',
      message: String(message || '').trim() || 'Tournament updated.'
    }].slice(-120);
  }

  function list() {
    return asArray(TournamentManager.getAll()).map((tournament) => canonicalizeTournament(tournament));
  }

  function byId(id) {
    const found = TournamentManager.getById(id);
    return found ? canonicalizeTournament(found) : null;
  }

  return {
    PHASE_SETUP,
    PHASE_READY,
    PHASE_RUNNING,
    PHASE_PAUSED,
    PHASE_COMPLETED,
    SECTION_OVERVIEW,
    SECTION_PLAYERS,
    SECTION_TEAMS,
    SECTION_MATCHES,
    SECTION_COURTS,
    SECTION_STANDINGS,
    SECTION_SETTINGS,
    SECTION_HISTORY,
    SECTIONS,
    uid,
    clampCourtCount,
    clampSkill,
    sortMatches,
    canonicalizeTournament,
    withStoreMutated,
    mutateTournament,
    addHistory,
    list,
    byId
  };
})();

function formatTournamentFormatLabel() {
  return 'Round Robin';
}

function formatTournamentSourceLabel(tournament) {
  const summary = String(tournament?.sourceSummary || 'manual').trim();
  if (summary === 'manual') return 'Manual';
  if (summary === 'imported-main-checked') return 'Imported: Checked-In Players';
  if (summary === 'imported-main-all') return 'Imported: Main Roster';
  if (summary === 'imported-generated-teams') return 'Imported: Generated Teams';
  if (summary === 'auto-built-teams') return 'Auto Built Teams';
  return summary;
}

function formatTournamentStatusLabel(status) {
  const raw = String(status || '').trim();
  if (raw === TournamentSubApp.PHASE_COMPLETED) return 'Completed';
  if (raw === TournamentSubApp.PHASE_PAUSED) return 'Paused';
  if (raw === TournamentSubApp.PHASE_RUNNING) return 'Live';
  if (raw === TournamentSubApp.PHASE_READY) return 'Ready';
  return 'Setup';
}

function getTournamentPlayerLookup(tournament) {
  return new Map((Array.isArray(tournament?.players) ? tournament.players : []).map((player) => [player.id, player]));
}

function getTournamentTeamLookup(tournament) {
  return new Map((Array.isArray(tournament?.teams) ? tournament.teams : []).map((team) => [team.id, team]));
}

function getTournamentTeamName(tournament, teamId) {
  if (!teamId) return 'TBD';
  const team = getTournamentTeamLookup(tournament).get(String(teamId));
  return team ? team.name : 'TBD';
}

function buildTournamentStatusBadge(status) {
  const normalized = status === TournamentManager.MATCH_FINAL
    ? 'final'
    : (status === TournamentManager.MATCH_LIVE ? 'live' : 'scheduled');
  const label = normalized === 'final' ? 'Final' : (normalized === 'live' ? 'Live' : 'Scheduled');
  return `<span class="tournament-status-badge is-${normalized}">${label}</span>`;
}

function parseBulkTournamentPlayers(rawText) {
  return String(rawText || '')
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [namePart, skillPart = ''] = line.split(',').map((part) => String(part || '').trim());
      return {
        name: namePart,
        skill: skillPart === '' ? 0 : TournamentSubApp.clampSkill(skillPart)
      };
    })
    .filter((entry) => entry.name);
}

function deriveTournamentNextStep(tournament) {
  if (!tournament) return 'Create an event to begin tournament operations.';
  const activePlayers = (tournament.players || []).filter((player) => player.active).length;
  const playableTeams = (tournament.teams || []).filter((team) => (team.memberKeys || []).length > 0).length;
  const matches = tournament.matches || [];
  const live = matches.filter((match) => match.status === TournamentManager.MATCH_LIVE).length;
  const scheduled = matches.filter((match) => match.status === TournamentManager.MATCH_SCHEDULED).length;
  const finals = matches.filter((match) => match.status === TournamentManager.MATCH_FINAL).length;
  if (activePlayers < 2) return 'Add at least two active tournament players.';
  if (playableTeams < 2) return 'Create teams and assign players.';
  if (!matches.length) return 'Generate matches from current teams.';
  if (live > 0) return 'Finalize the current live matches.';
  if (scheduled > 0) return 'Start the next scheduled match.';
  if (matches.length > 0 && finals === matches.length) return 'Review standings and complete the event.';
  return 'Review event state.';
}

function deriveTournamentCourtsView(tournament) {
  const matches = TournamentSubApp.sortMatches(tournament?.matches || []);
  const maxCourt = TournamentSubApp.clampCourtCount(tournament?.courtCount || 2);
  const courts = [];
  for (let courtNo = 1; courtNo <= maxCourt; courtNo += 1) {
    const live = matches.find((match) => Number(match.court) === courtNo && match.status === TournamentManager.MATCH_LIVE) || null;
    const next = matches.find((match) => Number(match.court) === courtNo && match.status === TournamentManager.MATCH_SCHEDULED) || null;
    courts.push({ courtNo, live, next });
  }
  const queue = matches.filter((match) => match.status === TournamentManager.MATCH_SCHEDULED);
  return { courts, queue };
}

function getRoundRobinStandingsForView(tournament) {
  const teams = (tournament?.teams || []).slice().sort((a, b) => a.seed - b.seed);
  const rows = teams.map((team) => ({
    teamId: team.id,
    teamName: team.name,
    seed: team.seed,
    wins: 0,
    losses: 0,
    pf: 0,
    pa: 0,
    pd: 0
  }));
  const rowById = new Map(rows.map((row) => [row.teamId, row]));
  (tournament?.matches || []).forEach((match) => {
    if (match.status !== TournamentManager.MATCH_FINAL) return;
    const rowA = rowById.get(match.teamAId);
    const rowB = rowById.get(match.teamBId);
    const scoreA = Number(match.scoreA);
    const scoreB = Number(match.scoreB);
    if (!rowA || !rowB || !Number.isFinite(scoreA) || !Number.isFinite(scoreB)) return;
    rowA.pf += scoreA;
    rowA.pa += scoreB;
    rowB.pf += scoreB;
    rowB.pa += scoreA;
    if (scoreA > scoreB) {
      rowA.wins += 1;
      rowB.losses += 1;
    } else {
      rowB.wins += 1;
      rowA.losses += 1;
    }
  });
  rows.forEach((row) => { row.pd = row.pf - row.pa; });
  rows.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.pd !== a.pd) return b.pd - a.pd;
    if (b.pf !== a.pf) return b.pf - a.pf;
    if (a.seed !== b.seed) return a.seed - b.seed;
    return a.teamName.localeCompare(b.teamName, undefined, { sensitivity: 'base' });
  });
  return rows;
}

function renderTournamentNoticeHTML() {
  const chunks = [];
  if (tournamentViewState.noticeText) {
    const tone = tournamentViewState.noticeTone || TOURNAMENT_NOTICE_INFO;
    const safeTone = tone === TOURNAMENT_NOTICE_ERROR || tone === TOURNAMENT_NOTICE_SUCCESS
      ? tone
      : TOURNAMENT_NOTICE_INFO;
    chunks.push(`<p class="tournament-notice is-${safeTone}">${escapeHTMLText(tournamentViewState.noticeText)}</p>`);
  }
  const runtimeTraceHTML = renderTournamentRuntimeTraceHTML();
  if (runtimeTraceHTML) chunks.push(runtimeTraceHTML);
  return chunks.join('');
}

function renderTournamentHeaderCardHTML(tournament) {
  const format = TournamentManager.FORMAT_RR;
  const nameValue = tournament ? tournament.name : '';
  const courtCount = tournament ? Number(tournament.courtCount || 2) : 2;
  const playerCount = tournament ? (tournament.players || []).length : 0;
  const activePlayerCount = tournament ? (tournament.players || []).filter((player) => player.active).length : 0;
  const teamCount = tournament ? (tournament.teams || []).length : 0;
  const matchCount = tournament ? (tournament.matches || []).length : 0;
  const finalCount = tournament ? (tournament.matches || []).filter((match) => match.status === TournamentManager.MATCH_FINAL).length : 0;
  const nextStepText = deriveTournamentNextStep(tournament);
  const section = TournamentSubApp.SECTIONS.includes(tournamentViewState.section)
    ? tournamentViewState.section
    : TournamentSubApp.SECTION_OVERVIEW;
  const tournamentSyncNoticeHTML = buildTournamentSyncNoticeHTML();

  const sectionButtonsHTML = TournamentSubApp.SECTIONS.map((sectionId) => {
    const label = sectionId.charAt(0).toUpperCase() + sectionId.slice(1);
    const selected = sectionId === section ? 'primary' : 'secondary';
    return `<button type="button" class="${selected}" data-tr-action="set-section" data-section="${escapeHTMLText(sectionId)}">${escapeHTMLText(label)}</button>`;
  }).join('');

  const summaryHTML = tournament ? `
    <div class="tournament-meta-grid">
      <div><strong>Event:</strong> ${escapeHTMLText(tournament.name)}</div>
      <div><strong>Format:</strong> ${escapeHTMLText(formatTournamentFormatLabel(tournament.format))}</div>
      <div><strong>Phase:</strong> ${escapeHTMLText(formatTournamentStatusLabel(tournament.phase || tournament.status))}</div>
      <div><strong>Courts:</strong> ${Number(tournament.courtCount) || 1}</div>
      <div><strong>Players:</strong> ${activePlayerCount} active / ${playerCount} total</div>
      <div><strong>Teams:</strong> ${teamCount}</div>
      <div><strong>Matches:</strong> ${finalCount} final / ${matchCount} total</div>
      <div><strong>Source:</strong> ${escapeHTMLText(formatTournamentSourceLabel(tournament))}</div>
    </div>
    <p class="small" style="margin-top:0.55rem;"><strong>Next Step:</strong> ${escapeHTMLText(nextStepText)}</p>
  ` : '<p class="small">Create a tournament event to begin setup.</p>';

  const adminControlsHTML = state.isAdmin ? `
    <div class="tournament-section">
      <h4>Tournament App Controls</h4>
      <div class="tournament-input-grid">
        <input type="text" id="trn-name" placeholder="Event name" value="${escapeHTMLText(nameValue)}" />
        <select id="trn-format">
          <option value="${TournamentManager.FORMAT_RR}" ${format === TournamentManager.FORMAT_RR ? 'selected' : ''}>Round Robin</option>
        </select>
        <input type="number" id="trn-court-count" min="1" max="8" value="${courtCount}" />
        <input type="number" id="trn-auto-team-count" min="2" max="24" value="${Math.max(2, teamCount || 2)}" />
      </div>
      <div class="row">
        <button type="button" data-tr-action="${tournament ? 'save-tournament-settings' : 'create-tournament'}">${tournament ? 'Save Event Settings' : 'Create Tournament Event'}</button>
        ${tournament ? '<button type="button" class="danger" data-tr-action="delete-tournament">Delete Event</button>' : ''}
      </div>
      <div class="row">${sectionButtonsHTML}</div>
    </div>
  ` : '';

  return `
    ${tournamentSyncNoticeHTML}
    ${summaryHTML}
    ${adminControlsHTML}
  `;
}

function getTournamentPlayableTeams(tournament) {
  return (Array.isArray(tournament?.teams) ? tournament.teams : [])
    .filter((team) => Array.isArray(team.memberKeys) && team.memberKeys.length > 0)
    .slice()
    .sort((a, b) => {
      const seedDiff = (Number(a.seed) || 0) - (Number(b.seed) || 0);
      if (seedDiff !== 0) return seedDiff;
      return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
    });
}

function buildTournamentRoundRobinMatches(teams, courtCount) {
  const teamIds = (Array.isArray(teams) ? teams : []).map((team) => String(team.id || '').trim()).filter(Boolean);
  if (teamIds.length < 2) return [];

  const ids = teamIds.slice();
  if (ids.length % 2 === 1) ids.push(null);
  const total = ids.length;
  const rounds = [];

  for (let roundIndex = 0; roundIndex < total - 1; roundIndex += 1) {
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

  const safeCourts = TournamentSubApp.clampCourtCount(courtCount);
  const matches = [];
  rounds.forEach((pairs, roundIndex) => {
    pairs.forEach((pair, slotIndex) => {
      matches.push({
        id: TournamentSubApp.uid('tm'),
        round: roundIndex + 1,
        slot: slotIndex + 1,
        bracket: TournamentManager.FORMAT_RR,
        court: (slotIndex % safeCourts) + 1,
        status: TournamentManager.MATCH_SCHEDULED,
        teamAId: pair[0],
        teamBId: pair[1],
        scoreA: null,
        scoreB: null,
        winnerTeamId: null,
        loserTeamId: null
      });
    });
  });
  return TournamentSubApp.sortMatches(matches);
}

function clearTournamentMatchesForRosterMutation(draft) {
  const existingCount = Array.isArray(draft?.matches) ? draft.matches.length : 0;
  if (existingCount > 0) draft.matches = [];
  return existingCount;
}

function findTournamentElementByDataAttr(attrName, targetValue) {
  const safeAttr = String(attrName || '').trim();
  const safeTarget = String(targetValue || '').trim();
  if (!safeAttr || !safeTarget) return null;
  return Array.from(document.querySelectorAll(`[${safeAttr}]`))
    .find((el) => String(el.getAttribute(safeAttr) || '').trim() === safeTarget) || null;
}

function buildTournamentPlayerCopiesFromMain(sourcePlayers) {
  return (Array.isArray(sourcePlayers) ? sourcePlayers : [])
    .map((player, index) => {
      const name = String(player?.name || '').trim();
      if (!name) return null;
      return {
        id: TournamentSubApp.uid('tp'),
        name,
        skill: TournamentSubApp.clampSkill(player?.skill),
        seed: index + 1,
        notes: '',
        active: true,
        availability: 'available',
        teamId: ''
      };
    })
    .filter(Boolean);
}

function buildTournamentImportFromGeneratedTeams() {
  const sourceTeams = Array.isArray(state.generatedTeams) ? state.generatedTeams : [];
  if (!sourceTeams.length) {
    return { ok: false, error: 'No generated teams found. Generate teams first in the Teams area.' };
  }

  const sourceToTournamentPlayerId = new Map();
  const players = [];
  const teams = [];

  sourceTeams.forEach((members, teamIndex) => {
    const memberKeys = [];
    (Array.isArray(members) ? members : []).forEach((member) => {
      const sourceKey = playerIdentityKey(member);
      if (!sourceKey) return;
      let tournamentPlayerId = sourceToTournamentPlayerId.get(sourceKey);
      if (!tournamentPlayerId) {
        tournamentPlayerId = TournamentSubApp.uid('tp');
        sourceToTournamentPlayerId.set(sourceKey, tournamentPlayerId);
        players.push({
          id: tournamentPlayerId,
          name: String(member?.name || '').trim() || `Player ${players.length + 1}`,
          skill: TournamentSubApp.clampSkill(member?.skill),
          seed: players.length + 1,
          notes: '',
          active: true,
          availability: 'available',
          teamId: ''
        });
      }
      memberKeys.push(tournamentPlayerId);
    });
    const uniqueMembers = Array.from(new Set(memberKeys));
    if (!uniqueMembers.length) return;
    teams.push({
      id: TournamentSubApp.uid('tt'),
      name: `Team ${teamIndex + 1}`,
      seed: teams.length + 1,
      notes: '',
      memberKeys: uniqueMembers
    });
  });

  if (teams.length < 2) {
    return { ok: false, error: 'Generated teams import needs at least two non-empty teams.' };
  }

  const teamByMemberId = new Map();
  teams.forEach((team) => {
    (team.memberKeys || []).forEach((memberId) => {
      if (!teamByMemberId.has(memberId)) teamByMemberId.set(memberId, team.id);
    });
  });
  players.forEach((player) => {
    player.teamId = teamByMemberId.get(player.id) || '';
  });

  return { ok: true, players, teams };
}

function renderTournamentAdminCardHTML(tournament) {
  if (!state.isAdmin) return '';
  if (!tournament) {
    return '<p class="small">No event selected. Create a tournament event to begin.</p>';
  }

  const section = TournamentSubApp.SECTIONS.includes(tournamentViewState.section)
    ? tournamentViewState.section
    : TournamentSubApp.SECTION_OVERVIEW;
  const players = Array.isArray(tournament.players) ? tournament.players.slice() : [];
  const teams = Array.isArray(tournament.teams)
    ? tournament.teams.slice().sort((a, b) => (Number(a.seed) || 0) - (Number(b.seed) || 0))
    : [];
  pruneTournamentTeamExpansionState(teams.map((team) => String(team?.id || '').trim()));
  const matches = TournamentSubApp.sortMatches(tournament.matches || []);
  const playerLookup = getTournamentPlayerLookup(tournament);
  const teamLookup = getTournamentTeamLookup(tournament);
  const searchRaw = String(tournamentViewState.playerSearch || '').trim();
  const search = searchRaw.toLowerCase();

  const filteredPlayers = !search
    ? players
    : players.filter((player) => {
      const haystack = `${player.name || ''} ${player.notes || ''}`.toLowerCase();
      return haystack.includes(search);
    });

  const activePlayers = players.filter((player) => player.active);
  const unassignedActivePlayers = activePlayers.filter((player) => !player.teamId);
  const assignPlayerOptions = activePlayers
    .map((player) => `<option value="${escapeHTMLText(player.id)}">${escapeHTMLText(player.name)} (${Number(player.skill) || 0})</option>`)
    .join('');
  const assignTeamOptions = teams
    .map((team) => `<option value="${escapeHTMLText(team.id)}">${escapeHTMLText(team.name)}</option>`)
    .join('');

  const liveMatches = matches.filter((match) => match.status === TournamentManager.MATCH_LIVE);
  const scheduledMatches = matches.filter((match) => match.status === TournamentManager.MATCH_SCHEDULED);
  const finalMatches = matches.filter((match) => match.status === TournamentManager.MATCH_FINAL);
  const nextScheduledMatch = scheduledMatches[0] || null;

  if (section === TournamentSubApp.SECTION_OVERVIEW) {
    return `
      <div class="tournament-section">
        <h4>Overview</h4>
        <p class="small">Use Tournament Players and Teams below to run an event without relying on checked-in state.</p>
        <div class="tournament-meta-grid">
          <div><strong>Players:</strong> ${players.length}</div>
          <div><strong>Active Players:</strong> ${activePlayers.length}</div>
          <div><strong>Teams:</strong> ${teams.length}</div>
          <div><strong>Matches:</strong> ${matches.length}</div>
          <div><strong>Live:</strong> ${liveMatches.length}</div>
          <div><strong>Scheduled:</strong> ${scheduledMatches.length}</div>
          <div><strong>Final:</strong> ${finalMatches.length}</div>
          <div><strong>Next:</strong> ${escapeHTMLText(deriveTournamentNextStep(tournament))}</div>
        </div>
        <div class="row" style="margin-top:0.65rem;">
          <button type="button" data-tr-action="import-main-checked">Import Checked-In Players</button>
          <button type="button" class="secondary" data-tr-action="import-main-all">Import Main Roster</button>
          <button type="button" class="secondary" data-tr-action="import-generated-teams">Import Generated Teams</button>
        </div>
        <div class="row" style="margin-top:0.65rem;">
          <button type="button" class="secondary" data-tr-action="auto-build-teams">Auto Build Teams</button>
          <button type="button" class="secondary" data-tr-action="generate-matches">Generate Matches</button>
          <button type="button" class="secondary" data-tr-action="start-next-match" ${nextScheduledMatch ? '' : 'disabled'}>Start Next Match</button>
          <button type="button" class="secondary" data-tr-action="reset-matches" ${matches.length ? '' : 'disabled'}>Reset Match Results</button>
        </div>
      </div>
    `;
  }

  if (section === TournamentSubApp.SECTION_PLAYERS) {
    const playerRows = filteredPlayers.length
      ? filteredPlayers.map((player) => {
          const teamName = player.teamId ? (teamLookup.get(player.teamId)?.name || 'Unknown Team') : 'Unassigned';
          return `
            <tr>
              <td><input type="text" data-tr-player-name-id="${escapeHTMLText(player.id)}" value="${escapeHTMLText(player.name)}" /></td>
              <td><input type="number" min="0" max="10" step="0.1" data-tr-player-skill-id="${escapeHTMLText(player.id)}" value="${Number(player.skill) || 0}" /></td>
              <td><input type="checkbox" data-tr-player-active-id="${escapeHTMLText(player.id)}" ${player.active ? 'checked' : ''} /></td>
              <td>${escapeHTMLText(teamName)}</td>
              <td><input type="text" data-tr-player-notes-id="${escapeHTMLText(player.id)}" value="${escapeHTMLText(player.notes || '')}" /></td>
              <td class="tournament-match-actions">
                <button type="button" class="secondary" data-tr-action="save-player" data-player-id="${escapeHTMLText(player.id)}">Save</button>
                <button type="button" class="danger" data-tr-action="remove-player" data-player-id="${escapeHTMLText(player.id)}">Delete</button>
              </td>
            </tr>
          `;
        }).join('')
      : '<tr><td colspan="6" class="small">No players match the current search.</td></tr>';

    return `
      <div class="tournament-section">
        <h4>Players</h4>
        <div class="row">
          <input type="text" id="trn-player-name" placeholder="Player name" />
          <input type="number" id="trn-player-skill" min="0" max="10" step="0.1" value="0" />
          <input type="text" id="trn-player-notes" placeholder="Optional notes" />
          <button type="button" data-tr-action="add-player">Add Player</button>
        </div>
        <div class="row">
          <textarea id="trn-player-bulk" rows="4" placeholder="Bulk add (one per line): Name, Skill"></textarea>
        </div>
        <div class="row" style="margin-top:0.4rem;">
          <button type="button" class="secondary" data-tr-action="bulk-add-players">Bulk Add Players</button>
        </div>
        <div class="row" style="margin-top:0.65rem;">
          <input type="text" id="trn-player-search" placeholder="Search players" value="${escapeHTMLText(searchRaw)}" />
          <button type="button" class="secondary" data-tr-action="apply-player-search">Search</button>
          <button type="button" class="secondary" data-tr-action="clear-player-search">Clear</button>
        </div>
        <table class="table tournament-match-table" style="margin-top:0.65rem;">
          <thead>
            <tr><th>Name</th><th>Skill</th><th>Active</th><th>Team</th><th>Notes</th><th>Actions</th></tr>
          </thead>
          <tbody>${playerRows}</tbody>
        </table>
      </div>
    `;
  }

  if (section === TournamentSubApp.SECTION_TEAMS) {
    const unassignedHTML = unassignedActivePlayers.length
      ? `<p class="small">Unassigned active players: ${escapeHTMLText(unassignedActivePlayers.map((player) => player.name).join(', '))}</p>`
      : '<p class="small">All active players are assigned.</p>';

    const teamCards = teams.length
      ? teams.map((team) => {
          const teamId = String(team.id || '').trim();
          const members = (team.memberKeys || []).map((memberId) => playerLookup.get(memberId)).filter(Boolean);
          const memberCount = members.length;
          const memberCountLabel = `${memberCount} player${memberCount === 1 ? '' : 's'}`;
          const expanded = isTournamentTeamExpanded(teamId);
          const toggleLabel = expanded ? 'Hide Players' : 'Show Players';
          const membersHTML = members.length
            ? members.map((member) => `
                <li>
                  ${escapeHTMLText(member.name)} <span class="small">(Skill ${Number(member.skill) || 0})</span>
                  <button type="button" class="secondary" data-tr-action="unassign-player" data-player-id="${escapeHTMLText(member.id)}" data-team-id="${escapeHTMLText(team.id)}">Remove</button>
                </li>
              `).join('')
            : '<li class="small">No members yet.</li>';
          return `
            <article class="tournament-team-card">
              <div class="row tournament-team-row">
                <input type="text" data-tr-team-name-id="${escapeHTMLText(team.id)}" value="${escapeHTMLText(team.name)}" />
                <input type="number" min="1" step="1" data-tr-team-seed-id="${escapeHTMLText(team.id)}" value="${Number(team.seed) || 1}" />
                <button type="button" class="secondary" data-tr-action="toggle-team-members" data-team-id="${escapeHTMLText(team.id)}">${escapeHTMLText(toggleLabel)}</button>
                <button type="button" class="secondary" data-tr-action="save-team" data-team-id="${escapeHTMLText(team.id)}">Save</button>
                <button type="button" class="danger" data-tr-action="delete-team" data-team-id="${escapeHTMLText(team.id)}">Delete</button>
              </div>
              <p class="small" style="margin:0.35rem 0 0.2rem;"><strong>Roster:</strong> ${escapeHTMLText(memberCountLabel)}</p>
              ${expanded ? `<ul class="tournament-team-members">${membersHTML}</ul>` : ''}
            </article>
          `;
        }).join('')
      : '<p class="small">No teams yet. Create teams manually or use Auto Build Teams.</p>';

    return `
      <div class="tournament-section">
        <h4>Teams</h4>
        <div class="row">
          <input type="text" id="trn-team-name" placeholder="New team name" />
          <button type="button" data-tr-action="add-team">Add Team</button>
          <input type="number" id="trn-auto-team-count" min="2" max="24" value="${Math.max(2, teams.length || 2)}" />
          <button type="button" class="secondary" data-tr-action="auto-build-teams">Auto Build Teams</button>
        </div>
        <div class="row" style="margin-top:0.6rem;">
          <select id="trn-assign-player">${assignPlayerOptions || '<option value="">No active players</option>'}</select>
          <select id="trn-assign-team">${assignTeamOptions || '<option value="">No teams</option>'}</select>
          <button type="button" class="secondary" data-tr-action="assign-player-to-team">Assign / Move</button>
        </div>
        ${unassignedHTML}
        <div class="tournament-team-grid">${teamCards}</div>
      </div>
    `;
  }

  if (section === TournamentSubApp.SECTION_MATCHES) {
    const rows = matches.length
      ? matches.map((match) => {
          const teamAName = getTournamentTeamName(tournament, match.teamAId);
          const teamBName = getTournamentTeamName(tournament, match.teamBId);
          const winnerName = match.winnerTeamId ? getTournamentTeamName(tournament, match.winnerTeamId) : '-';
          const scoreAValue = Number.isFinite(Number(match.scoreA)) ? Number(match.scoreA) : '';
          const scoreBValue = Number.isFinite(Number(match.scoreB)) ? Number(match.scoreB) : '';
          const canStart = match.status === TournamentManager.MATCH_SCHEDULED && !!match.teamAId && !!match.teamBId;
          const canFinalize = match.status !== TournamentManager.MATCH_FINAL && !!match.teamAId && !!match.teamBId;
          return `
            <tr>
              <td>R${Number(match.round) || 1} M${Number(match.slot) || 1}</td>
              <td>Net ${Number(match.court) || 1}</td>
              <td>${escapeHTMLText(teamAName)} vs ${escapeHTMLText(teamBName)}</td>
              <td>${buildTournamentStatusBadge(match.status)}</td>
              <td>${escapeHTMLText(winnerName)}</td>
              <td>
                <div class="tournament-match-actions">
                  <input type="number" min="0" step="1" class="tournament-score-input" data-tr-score-a-for="${escapeHTMLText(match.id)}" value="${scoreAValue}" />
                  <input type="number" min="0" step="1" class="tournament-score-input" data-tr-score-b-for="${escapeHTMLText(match.id)}" value="${scoreBValue}" />
                  <button type="button" class="secondary" data-tr-action="start-match" data-match-id="${escapeHTMLText(match.id)}" ${canStart ? '' : 'disabled'}>Start</button>
                  <button type="button" data-tr-action="finalize-match" data-match-id="${escapeHTMLText(match.id)}" ${canFinalize ? '' : 'disabled'}>Finalize</button>
                  <button type="button" class="secondary" data-tr-action="clear-match-result" data-match-id="${escapeHTMLText(match.id)}" ${match.status === TournamentManager.MATCH_FINAL ? '' : 'disabled'}>Clear</button>
                </div>
              </td>
            </tr>
          `;
        }).join('')
      : '<tr><td colspan="6" class="small">No matches generated yet.</td></tr>';

    return `
      <div class="tournament-section">
        <h4>Matches</h4>
        <div class="row">
          <button type="button" data-tr-action="generate-matches">Generate Matches</button>
          <button type="button" class="secondary" data-tr-action="start-next-match" ${nextScheduledMatch ? '' : 'disabled'}>Start Next Match</button>
          <button type="button" class="secondary" data-tr-action="reset-matches" ${matches.length ? '' : 'disabled'}>Reset Results</button>
        </div>
        <table class="table tournament-match-table" style="margin-top:0.65rem;">
          <thead>
            <tr><th>Match</th><th>Court</th><th>Teams</th><th>Status</th><th>Winner</th><th>Actions</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  if (section === TournamentSubApp.SECTION_COURTS) {
    const courtsView = deriveTournamentCourtsView(tournament);
    const courtsHTML = courtsView.courts.map((courtEntry) => {
      const live = courtEntry.live;
      const next = courtEntry.next;
      const liveText = live
        ? `${getTournamentTeamName(tournament, live.teamAId)} vs ${getTournamentTeamName(tournament, live.teamBId)}`
        : 'No live match';
      const nextText = next
        ? `${getTournamentTeamName(tournament, next.teamAId)} vs ${getTournamentTeamName(tournament, next.teamBId)}`
        : 'No queued match';
      return `
        <article class="tournament-team-card">
          <h5>Net ${courtEntry.courtNo}</h5>
          <p class="small"><strong>Live:</strong> ${escapeHTMLText(liveText)}</p>
          <p class="small"><strong>Next:</strong> ${escapeHTMLText(nextText)}</p>
          ${next ? `<button type="button" class="secondary" data-tr-action="start-match" data-match-id="${escapeHTMLText(next.id)}">Start Next on Net ${courtEntry.courtNo}</button>` : ''}
        </article>
      `;
    }).join('');

    const queueHTML = courtsView.queue.length
      ? `<ul class="tournament-public-match-list">${courtsView.queue.map((match) => `
          <li>
            R${Number(match.round) || 1} M${Number(match.slot) || 1} - Net ${Number(match.court) || 1}:
            ${escapeHTMLText(getTournamentTeamName(tournament, match.teamAId))} vs ${escapeHTMLText(getTournamentTeamName(tournament, match.teamBId))}
          </li>
        `).join('')}</ul>`
      : '<p class="small">Queue is empty.</p>';

    return `
      <div class="tournament-section">
        <h4>Courts / Queue</h4>
        <div class="tournament-team-grid">${courtsHTML || '<p class="small">No courts configured.</p>'}</div>
        <h5 style="margin-top:0.7rem;">Queue</h5>
        ${queueHTML}
      </div>
    `;
  }

  if (section === TournamentSubApp.SECTION_STANDINGS) {
    const rows = getRoundRobinStandingsForView(tournament);
    const standingsHTML = rows.length
      ? `
        <table class="table">
          <thead><tr><th>#</th><th>Team</th><th>W</th><th>L</th><th>PF</th><th>PA</th><th>PD</th></tr></thead>
          <tbody>
            ${rows.map((row, idx) => `
              <tr>
                <td>${idx + 1}</td>
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
      `
      : '<p class="small">Standings appear once matches are finalized.</p>';
    return `
      <div class="tournament-section">
        <h4>Standings</h4>
        ${standingsHTML}
      </div>
    `;
  }

  if (section === TournamentSubApp.SECTION_SETTINGS) {
    return `
      <div class="tournament-section">
        <h4>Settings</h4>
        <p class="small">Event settings are managed in the header card. Use this section for high-impact controls.</p>
        <div class="row">
          <button type="button" class="secondary" data-tr-action="generate-matches">Generate Matches</button>
          <button type="button" class="secondary" data-tr-action="reset-matches" ${matches.length ? '' : 'disabled'}>Reset Match Results</button>
          <button type="button" class="danger" data-tr-action="delete-tournament">Delete Event</button>
        </div>
      </div>
    `;
  }

  const entries = (Array.isArray(tournament.history) ? tournament.history : [])
    .slice()
    .sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0))
    .slice(0, 60);
  const historyHTML = entries.length
    ? `<ul class="tournament-public-match-list">${entries.map((entry) => {
        const when = new Date(Number(entry.at) || Date.now()).toLocaleString();
        return `<li><strong>${escapeHTMLText(when)}:</strong> ${escapeHTMLText(entry.message || '')}</li>`;
      }).join('')}</ul>`
    : '<p class="small">No history yet.</p>';
  return `
    <div class="tournament-section">
      <h4>History</h4>
      ${historyHTML}
    </div>
  `;
}

function renderTournamentPublicCardHTML(tournament) {
  if (!tournament) {
    return '<p class="small">No tournament selected yet.</p>';
  }

  const matches = TournamentSubApp.sortMatches(tournament.matches || []);
  const liveMatches = matches.filter((match) => match.status === TournamentManager.MATCH_LIVE);
  const scheduledMatches = matches.filter((match) => match.status === TournamentManager.MATCH_SCHEDULED);
  const finalMatches = matches.filter((match) => match.status === TournamentManager.MATCH_FINAL);
  const standings = getRoundRobinStandingsForView(tournament);

  const renderMatchList = (rows, emptyText) => {
    if (!rows.length) return `<p class="small">${escapeHTMLText(emptyText)}</p>`;
    return `
      <ul class="tournament-public-match-list">
        ${rows.map((match) => {
          const scoreSuffix = Number.isFinite(Number(match.scoreA)) && Number.isFinite(Number(match.scoreB))
            ? ` (${Number(match.scoreA)}-${Number(match.scoreB)})`
            : '';
          const winnerSuffix = match.winnerTeamId
            ? ` <span class="small">(Winner: ${escapeHTMLText(getTournamentTeamName(tournament, match.winnerTeamId))})</span>`
            : '';
          return `
            <li>
              <strong>Net ${Number(match.court) || 1}</strong> -
              ${escapeHTMLText(getTournamentTeamName(tournament, match.teamAId))} vs
              ${escapeHTMLText(getTournamentTeamName(tournament, match.teamBId))}
              ${escapeHTMLText(scoreSuffix)}${winnerSuffix}
            </li>
          `;
        }).join('')}
      </ul>
    `;
  };

  const standingsHTML = standings.length
    ? `
      <table class="table">
        <thead><tr><th>#</th><th>Team</th><th>W</th><th>L</th><th>PD</th></tr></thead>
        <tbody>
          ${standings.map((row, idx) => `
            <tr>
              <td>${idx + 1}</td>
              <td>${escapeHTMLText(row.teamName)}</td>
              <td>${row.wins}</td>
              <td>${row.losses}</td>
              <td>${row.pd}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
    : '<p class="small">Standings will appear as results are finalized.</p>';

  return `
    <div class="tournament-section">
      <h4>Public Tournament View</h4>
      <p class="small">
        ${escapeHTMLText(tournament.name)} -
        ${escapeHTMLText(formatTournamentFormatLabel(tournament.format))} -
        ${escapeHTMLText(formatTournamentStatusLabel(tournament.phase || tournament.status))}
      </p>
      <div class="tournament-public-grid">
        <div>
          <h5>Live Matches</h5>
          ${renderMatchList(liveMatches, 'No matches live right now.')}
        </div>
        <div>
          <h5>Upcoming</h5>
          ${renderMatchList(scheduledMatches, 'No upcoming matches.')}
        </div>
        <div>
          <h5>Final Results</h5>
          ${renderMatchList(finalMatches, 'No final results yet.')}
        </div>
      </div>
    </div>

    <div class="tournament-section">
      <h4>Standings</h4>
      ${standingsHTML}
    </div>
  `;
}

function getActiveTournamentFromSelect() {
  const select = document.getElementById('tournamentSelect');
  const selectedId = String(select?.value || '').trim();
  const activeId = selectedId || String(TournamentManager.getActiveId() || '').trim();
  return activeId ? TournamentSubApp.byId(activeId) : null;
}

function refreshTournamentSelectUI() {
  const select = document.getElementById('tournamentSelect');
  if (!select) return '';
  const all = TournamentSubApp.list();
  const currentActiveId = String(TournamentManager.getActiveId() || '').trim();
  const resolvedActiveId = all.some((tournament) => tournament.id === currentActiveId)
    ? currentActiveId
    : (all[0]?.id || '');

  if (resolvedActiveId !== currentActiveId) {
    TournamentManager.setActive(resolvedActiveId);
  }

  select.innerHTML = all.length
    ? all.map((tournament) => `
        <option value="${escapeHTMLText(tournament.id)}" ${tournament.id === resolvedActiveId ? 'selected' : ''}>
          ${escapeHTMLText(tournament.name)}
        </option>
      `).join('')
    : '<option value="">No tournaments</option>';

  if (!all.length) {
    select.value = TOURNAMENT_UNSET_VALUE;
    return '';
  }
  select.value = resolvedActiveId;
  return resolvedActiveId;
}

function initTournamentView() {
  ensureTournamentOverlayBindings();
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
  adminCard.innerHTML = state.isAdmin ? renderTournamentAdminCardHTML(tournament) : '';
  publicCard.innerHTML = renderTournamentPublicCardHTML(tournament);
}

async function handleTournamentAction(action, trigger) {
  const actionName = String(action || '').trim();
  if (!actionName) {
    showTournamentActionBlocked('Tournament control is missing action wiring.');
    return;
  }
  action = actionName;
  pushTournamentRuntimeTrace(`action received: ${action}`);

  if (action === 'set-section') {
    const section = String(trigger?.getAttribute('data-section') || '').trim();
    if (TournamentSubApp.SECTIONS.includes(section)) tournamentViewState.section = section;
    initTournamentView();
    return;
  }

  if (action === 'apply-player-search') {
    tournamentViewState.playerSearch = String(document.getElementById('trn-player-search')?.value || '').trim();
    initTournamentView();
    return;
  }

  if (action === 'clear-player-search') {
    tournamentViewState.playerSearch = '';
    initTournamentView();
    return;
  }

  if (action === 'create-tournament') {
    if (!state.isAdmin) {
      showTournamentActionBlocked('Admin access is required to create a tournament event.');
      return;
    }
    const name = String(document.getElementById('trn-name')?.value || '').trim();
    if (!name) {
      setTournamentNotice('Event name is required.', TOURNAMENT_NOTICE_ERROR);
      initTournamentView();
      return;
    }
    const courtCount = TournamentSubApp.clampCourtCount(document.getElementById('trn-court-count')?.value || 2);
    const beforeStoreSnapshot = TournamentManager.getStoreSnapshot();
    const created = TournamentSubApp.withStoreMutated((store) => {
      const now = Date.now();
      const draft = TournamentSubApp.canonicalizeTournament({
        id: TournamentSubApp.uid('trn'),
        name,
        format: TournamentManager.FORMAT_RR,
        sourceMode: 'independent',
        sourceGroup: 'All',
        sourceSummary: 'manual',
        courtCount,
        teamCount: 0,
        teams: [],
        players: [],
        matches: [],
        history: [],
        phase: TournamentSubApp.PHASE_SETUP,
        createdAt: now,
        updatedAt: now
      });
      TournamentSubApp.addHistory(draft, 'create', `Created tournament event "${draft.name}".`);
      const canonical = TournamentSubApp.canonicalizeTournament(draft);
      if (!Array.isArray(store.tournaments)) store.tournaments = [];
      store.tournaments.push(canonical);
      store.activeTournamentId = canonical.id;
      return { ok: true, tournament: canonical };
    });
    await commitTournamentMutation(created, {
      successMessage: 'Tournament event created.',
      fallbackErrorMessage: 'Unable to create tournament event.',
      contextLabel: 'tournament-create',
      actionMeta: {
        scope: 'tournament',
        action: 'create-tournament',
        entityType: 'tournament',
        entityId: (result) => result?.tournament?.id || '',
        title: `Created tournament "${name}".`,
        detail: 'Tournament is now independent and ready for player/team setup.',
        tone: 'success',
        undoSnapshot: beforeStoreSnapshot
      }
    });
    return;
  }

  if (!state.isAdmin) {
    showTournamentActionBlocked('Admin access is required for tournament edits.');
    return;
  }
  const activeTournament = getActiveTournamentFromSelect();
  if (!activeTournament || !activeTournament.id) {
    showTournamentActionBlocked('Select a tournament first.');
    return;
  }

  await handleTournamentAdminAction(action, trigger, activeTournament);
}

async function handleTournamentAdminAction(action, trigger, activeTournament) {
  const activeId = activeTournament.id;
  if (!activeId) return;

  if (action === 'save-tournament-settings') {
    const name = String(document.getElementById('trn-name')?.value || '').trim();
    if (!name) {
      setTournamentNotice('Event name is required.', TOURNAMENT_NOTICE_ERROR);
      initTournamentView();
      return;
    }
    const courtCount = TournamentSubApp.clampCourtCount(document.getElementById('trn-court-count')?.value || activeTournament.courtCount || 2);
    const beforeStoreSnapshot = TournamentManager.getStoreSnapshot();
    const updated = TournamentSubApp.mutateTournament(activeId, (draft) => {
      draft.name = name;
      draft.format = TournamentManager.FORMAT_RR;
      draft.courtCount = courtCount;
      if (!draft.settings || typeof draft.settings !== 'object') draft.settings = { tieBreak: 'pd' };
      TournamentSubApp.addHistory(draft, 'settings', `Updated event settings (courts: ${courtCount}).`);
      return { ok: true };
    });
    await commitTournamentMutation(updated, {
      successMessage: 'Tournament settings saved.',
      fallbackErrorMessage: 'Unable to save tournament settings.',
      contextLabel: 'tournament-save-settings',
      actionMeta: {
        scope: 'tournament',
        action: 'save-settings',
        entityType: 'tournament',
        entityId: activeId,
        title: `Saved settings for "${name}".`,
        detail: `Courts: ${courtCount}.`,
        tone: 'info',
        undoSnapshot: beforeStoreSnapshot
      }
    });
    return;
  }

  if (action === 'delete-tournament') {
    const safeName = String(activeTournament.name || 'this tournament').trim() || 'this tournament';
    const confirmed = confirmDangerousActionOrAbort({
      title: `Delete tournament "${safeName}"?`,
      detail: 'This removes tournament players, teams, matches, standings, and history from shared state.',
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
        title: `Deleted tournament "${safeName}".`,
        detail: 'Tournament and related records were removed.',
        tone: 'warning',
        undoSnapshot: beforeStoreSnapshot
      }
    });
    return;
  }

  if (action === 'add-player') {
    const name = String(document.getElementById('trn-player-name')?.value || '').trim();
    if (!name) {
      setTournamentNotice('Player name is required.', TOURNAMENT_NOTICE_ERROR);
      initTournamentView();
      return;
    }
    const skill = TournamentSubApp.clampSkill(document.getElementById('trn-player-skill')?.value || 0);
    const notes = String(document.getElementById('trn-player-notes')?.value || '').trim();
    const beforeStoreSnapshot = TournamentManager.getStoreSnapshot();
    const added = TournamentSubApp.mutateTournament(activeId, (draft) => {
      const nextSeed = (draft.players || []).reduce((maxSeed, player) => Math.max(maxSeed, Number(player.seed) || 0), 0) + 1;
      draft.players = [...(draft.players || []), {
        id: TournamentSubApp.uid('tp'),
        name,
        skill,
        seed: nextSeed,
        notes,
        active: true,
        availability: 'available',
        teamId: ''
      }];
      TournamentSubApp.addHistory(draft, 'add-player', `Added tournament player "${name}".`);
      return { ok: true };
    });
    await commitTournamentMutation(added, {
      successMessage: 'Tournament player added.',
      fallbackErrorMessage: 'Unable to add tournament player.',
      contextLabel: 'tournament-add-player',
      actionMeta: {
        scope: 'tournament',
        action: 'add-player',
        entityType: 'player',
        entityId: '',
        title: `Added player "${name}".`,
        detail: `Skill ${skill}.`,
        tone: 'success',
        undoSnapshot: beforeStoreSnapshot
      }
    });
    return;
  }

  if (action === 'bulk-add-players') {
    const parsed = parseBulkTournamentPlayers(document.getElementById('trn-player-bulk')?.value || '');
    if (!parsed.length) {
      setTournamentNotice('Add at least one valid line (Name, Skill).', TOURNAMENT_NOTICE_ERROR);
      initTournamentView();
      return;
    }
    const beforeStoreSnapshot = TournamentManager.getStoreSnapshot();
    const bulkAdded = TournamentSubApp.mutateTournament(activeId, (draft) => {
      let nextSeed = (draft.players || []).reduce((maxSeed, player) => Math.max(maxSeed, Number(player.seed) || 0), 0) + 1;
      const nextPlayers = parsed.map((entry) => ({
        id: TournamentSubApp.uid('tp'),
        name: entry.name,
        skill: TournamentSubApp.clampSkill(entry.skill),
        seed: nextSeed++,
        notes: '',
        active: true,
        availability: 'available',
        teamId: ''
      }));
      draft.players = [...(draft.players || []), ...nextPlayers];
      TournamentSubApp.addHistory(draft, 'bulk-add-players', `Bulk added ${nextPlayers.length} tournament players.`);
      return { ok: true };
    });
    await commitTournamentMutation(bulkAdded, {
      successMessage: `Added ${parsed.length} tournament players.`,
      fallbackErrorMessage: 'Bulk add failed.',
      contextLabel: 'tournament-bulk-add-players',
      actionMeta: {
        scope: 'tournament',
        action: 'bulk-add-players',
        entityType: 'player',
        entityId: '',
        title: `Bulk added ${parsed.length} players.`,
        detail: 'Tournament roster updated.',
        tone: 'success',
        undoSnapshot: beforeStoreSnapshot
      }
    });
    return;
  }

  if (action === 'save-player') {
    const playerId = String(trigger?.getAttribute('data-player-id') || '').trim();
    if (!playerId) return;
    const name = String(findTournamentElementByDataAttr('data-tr-player-name-id', playerId)?.value || '').trim();
    const skill = TournamentSubApp.clampSkill(findTournamentElementByDataAttr('data-tr-player-skill-id', playerId)?.value || 0);
    const notes = String(findTournamentElementByDataAttr('data-tr-player-notes-id', playerId)?.value || '').trim();
    const active = !!findTournamentElementByDataAttr('data-tr-player-active-id', playerId)?.checked;
    if (!name) {
      setTournamentNotice('Player name cannot be empty.', TOURNAMENT_NOTICE_ERROR);
      initTournamentView();
      return;
    }
    const beforeStoreSnapshot = TournamentManager.getStoreSnapshot();
    const saved = TournamentSubApp.mutateTournament(activeId, (draft) => {
      const player = (draft.players || []).find((item) => String(item.id) === playerId);
      if (!player) return { ok: false, error: 'Player not found.' };
      const previousTeamId = String(player.teamId || '');
      player.name = name;
      player.skill = skill;
      player.notes = notes;
      player.active = active;
      if (!active && previousTeamId) {
        (draft.teams || []).forEach((team) => {
          team.memberKeys = (team.memberKeys || []).filter((memberId) => memberId !== playerId);
        });
        player.teamId = '';
        clearTournamentMatchesForRosterMutation(draft);
      }
      TournamentSubApp.addHistory(draft, 'save-player', `Updated player "${name}".`);
      return { ok: true };
    });
    await commitTournamentMutation(saved, {
      successMessage: 'Player saved.',
      fallbackErrorMessage: 'Unable to save player.',
      contextLabel: 'tournament-save-player',
      actionMeta: {
        scope: 'tournament',
        action: 'save-player',
        entityType: 'player',
        entityId: playerId,
        title: `Saved player "${name}".`,
        detail: `Skill ${skill}${active ? '' : ' (inactive)'}.`,
        tone: 'info',
        undoSnapshot: beforeStoreSnapshot
      }
    });
    return;
  }

  if (action === 'remove-player') {
    const playerId = String(trigger?.getAttribute('data-player-id') || '').trim();
    if (!playerId) return;
    const player = (activeTournament.players || []).find((item) => String(item.id) === playerId);
    const playerName = player ? String(player.name || '').trim() : 'this player';
    const confirmed = confirmDangerousActionOrAbort({
      title: `Delete player "${playerName}"?`,
      detail: 'This removes the player from tournament teams and may clear generated matches.',
      confirmText: 'DELETE'
    });
    if (!confirmed) return;

    const beforeStoreSnapshot = TournamentManager.getStoreSnapshot();
    const removed = TournamentSubApp.mutateTournament(activeId, (draft) => {
      const existing = (draft.players || []).find((item) => String(item.id) === playerId);
      if (!existing) return { ok: false, error: 'Player not found.' };
      draft.players = (draft.players || []).filter((item) => String(item.id) !== playerId);
      let membershipChanged = false;
      (draft.teams || []).forEach((team) => {
        const next = (team.memberKeys || []).filter((memberId) => memberId !== playerId);
        if (next.length !== (team.memberKeys || []).length) membershipChanged = true;
        team.memberKeys = next;
      });
      if (membershipChanged) clearTournamentMatchesForRosterMutation(draft);
      TournamentSubApp.addHistory(draft, 'remove-player', `Removed player "${existing.name}".`);
      return { ok: true };
    });
    await commitTournamentMutation(removed, {
      successMessage: 'Player removed.',
      fallbackErrorMessage: 'Unable to remove player.',
      contextLabel: 'tournament-remove-player',
      actionMeta: {
        scope: 'tournament',
        action: 'remove-player',
        entityType: 'player',
        entityId: playerId,
        title: `Removed player "${playerName}".`,
        detail: 'Tournament roster updated.',
        tone: 'warning',
        undoSnapshot: beforeStoreSnapshot
      }
    });
    return;
  }

  if (action === 'import-main-checked' || action === 'import-main-all' || action === 'import-generated-teams') {
    let importResult = null;
    if (action === 'import-generated-teams') {
      importResult = buildTournamentImportFromGeneratedTeams();
    } else {
      ensurePlayerIdentityKeys();
      const sourcePlayers = action === 'import-main-checked'
        ? (() => {
            const checkedSet = new Set(normalizeCheckedInEntries(state.checkedIn || []));
            return (state.players || []).filter((player) => checkedSet.has(playerIdentityKey(player)));
          })()
        : (state.players || []).slice();
      const copiedPlayers = buildTournamentPlayerCopiesFromMain(sourcePlayers);
      if (!copiedPlayers.length) {
        importResult = {
          ok: false,
          error: action === 'import-main-checked'
            ? 'No checked-in players available to import.'
            : 'No players available in the main roster to import.'
        };
      } else {
        importResult = {
          ok: true,
          players: copiedPlayers,
          teams: []
        };
      }
    }

    if (!importResult || importResult.ok === false) {
      setTournamentNotice(importResult?.error || 'Import failed.', TOURNAMENT_NOTICE_ERROR);
      initTournamentView();
      return;
    }

    const existingCount = (activeTournament.players || []).length + (activeTournament.teams || []).length + (activeTournament.matches || []).length;
    if (existingCount > 0) {
      const confirmed = confirmDangerousActionOrAbort({
        title: `Replace current tournament setup for "${activeTournament.name}"?`,
        detail: 'Import replaces tournament players/teams and clears current matches.',
        confirmText: 'IMPORT'
      });
      if (!confirmed) return;
    }

    const beforeStoreSnapshot = TournamentManager.getStoreSnapshot();
    const imported = TournamentSubApp.mutateTournament(activeId, (draft) => {
      draft.players = importResult.players;
      draft.teams = importResult.teams;
      draft.teamCount = (importResult.teams || []).length;
      draft.matches = [];
      draft.teamBuildSummary = action === 'import-generated-teams'
        ? sanitizeGeneratedTeamsSummary(state.generatedTeamsSummary) || null
        : null;
      draft.sourceSummary = action === 'import-main-checked'
        ? 'imported-main-checked'
        : (action === 'import-main-all' ? 'imported-main-all' : 'imported-generated-teams');
      TournamentSubApp.addHistory(
        draft,
        'import',
        `Imported ${draft.players.length} players${draft.teams.length ? ` and ${draft.teams.length} teams` : ''} (${formatTournamentSourceLabel(draft)}).`
      );
      return { ok: true };
    });
    await commitTournamentMutation(imported, {
      successMessage: 'Import complete.',
      fallbackErrorMessage: 'Import failed.',
      contextLabel: 'tournament-import',
      actionMeta: {
        scope: 'tournament',
        action: 'import',
        entityType: 'tournament',
        entityId: activeId,
        title: 'Imported tournament setup.',
        detail: `Players: ${importResult.players.length} | Teams: ${importResult.teams.length}`,
        tone: 'warning',
        undoSnapshot: beforeStoreSnapshot
      }
    });
    return;
  }

  if (action === 'add-team') {
    const desiredName = String(document.getElementById('trn-team-name')?.value || '').trim();
    const beforeStoreSnapshot = TournamentManager.getStoreSnapshot();
    const added = TournamentSubApp.mutateTournament(activeId, (draft) => {
      const nextName = desiredName || `Team ${(draft.teams || []).length + 1}`;
      const nextSeed = (draft.teams || []).reduce((maxSeed, team) => Math.max(maxSeed, Number(team.seed) || 0), 0) + 1;
      draft.teams = [...(draft.teams || []), {
        id: TournamentSubApp.uid('tt'),
        name: nextName,
        seed: nextSeed,
        notes: '',
        memberKeys: []
      }];
      draft.teamCount = draft.teams.length;
      clearTournamentMatchesForRosterMutation(draft);
      TournamentSubApp.addHistory(draft, 'add-team', `Added ${nextName}.`);
      return { ok: true };
    });
    await commitTournamentMutation(added, {
      successMessage: 'Team added.',
      fallbackErrorMessage: 'Unable to add team.',
      contextLabel: 'tournament-add-team',
      actionMeta: {
        scope: 'tournament',
        action: 'add-team',
        entityType: 'team',
        entityId: '',
        title: 'Added tournament team.',
        detail: desiredName || 'Auto-named team added.',
        tone: 'success',
        undoSnapshot: beforeStoreSnapshot
      }
    });
    return;
  }

  if (action === 'toggle-team-members') {
    const teamId = String(trigger?.getAttribute('data-team-id') || '').trim();
    if (!teamId) return;
    const exists = (activeTournament.teams || []).some((team) => String(team.id || '').trim() === teamId);
    if (!exists) {
      setTournamentNotice('Team not found for roster toggle.', TOURNAMENT_NOTICE_ERROR);
      initTournamentView();
      return;
    }
    setTournamentTeamExpanded(teamId, !isTournamentTeamExpanded(teamId));
    initTournamentView();
    return;
  }

  if (action === 'save-team') {
    const teamId = String(trigger?.getAttribute('data-team-id') || '').trim();
    if (!teamId) return;
    const name = String(findTournamentElementByDataAttr('data-tr-team-name-id', teamId)?.value || '').trim();
    const seed = Math.max(1, Number.parseInt(findTournamentElementByDataAttr('data-tr-team-seed-id', teamId)?.value || '1', 10) || 1);
    if (!name) {
      setTournamentNotice('Team name cannot be empty.', TOURNAMENT_NOTICE_ERROR);
      initTournamentView();
      return;
    }
    const beforeStoreSnapshot = TournamentManager.getStoreSnapshot();
    const saved = TournamentSubApp.mutateTournament(activeId, (draft) => {
      const team = (draft.teams || []).find((item) => String(item.id) === teamId);
      if (!team) return { ok: false, error: 'Team not found.' };
      team.name = name;
      team.seed = seed;
      TournamentSubApp.addHistory(draft, 'save-team', `Updated ${name}.`);
      return { ok: true };
    });
    await commitTournamentMutation(saved, {
      successMessage: 'Team saved.',
      fallbackErrorMessage: 'Unable to save team.',
      contextLabel: 'tournament-save-team',
      actionMeta: {
        scope: 'tournament',
        action: 'save-team',
        entityType: 'team',
        entityId: teamId,
        title: `Saved ${name}.`,
        detail: `Seed ${seed}.`,
        tone: 'info',
        undoSnapshot: beforeStoreSnapshot
      }
    });
    return;
  }

  if (action === 'delete-team') {
    const teamId = String(trigger?.getAttribute('data-team-id') || '').trim();
    if (!teamId) return;
    const teamName = getTournamentTeamName(activeTournament, teamId);
    const confirmed = confirmDangerousActionOrAbort({
      title: `Delete ${teamName}?`,
      detail: 'This unassigns members and clears generated matches.',
      confirmText: 'DELETE'
    });
    if (!confirmed) return;
    const beforeStoreSnapshot = TournamentManager.getStoreSnapshot();
    const deleted = TournamentSubApp.mutateTournament(activeId, (draft) => {
      const exists = (draft.teams || []).some((team) => String(team.id) === teamId);
      if (!exists) return { ok: false, error: 'Team not found.' };
      draft.teams = (draft.teams || []).filter((team) => String(team.id) !== teamId);
      (draft.players || []).forEach((player) => {
        if (String(player.teamId || '') === teamId) player.teamId = '';
      });
      draft.teamCount = draft.teams.length;
      clearTournamentMatchesForRosterMutation(draft);
      TournamentSubApp.addHistory(draft, 'delete-team', `Deleted ${teamName}.`);
      return { ok: true };
    });
    await commitTournamentMutation(deleted, {
      successMessage: 'Team deleted.',
      fallbackErrorMessage: 'Unable to delete team.',
      contextLabel: 'tournament-delete-team',
      actionMeta: {
        scope: 'tournament',
        action: 'delete-team',
        entityType: 'team',
        entityId: teamId,
        title: `Deleted ${teamName}.`,
        detail: 'Team members were unassigned and matches were cleared.',
        tone: 'warning',
        undoSnapshot: beforeStoreSnapshot
      }
    });
    return;
  }

  if (action === 'assign-player-to-team') {
    const playerId = String(document.getElementById('trn-assign-player')?.value || '').trim();
    const teamId = String(document.getElementById('trn-assign-team')?.value || '').trim();
    if (!playerId || !teamId) {
      setTournamentNotice('Select both a player and a team.', TOURNAMENT_NOTICE_ERROR);
      initTournamentView();
      return;
    }
    const beforeStoreSnapshot = TournamentManager.getStoreSnapshot();
    const assigned = TournamentSubApp.mutateTournament(activeId, (draft) => {
      const player = (draft.players || []).find((item) => String(item.id) === playerId);
      const targetTeam = (draft.teams || []).find((item) => String(item.id) === teamId);
      if (!player) return { ok: false, error: 'Player not found.' };
      if (!targetTeam) return { ok: false, error: 'Team not found.' };
      (draft.teams || []).forEach((team) => {
        team.memberKeys = (team.memberKeys || []).filter((memberId) => memberId !== playerId);
      });
      targetTeam.memberKeys = Array.from(new Set([...(targetTeam.memberKeys || []), playerId]));
      player.teamId = targetTeam.id;
      clearTournamentMatchesForRosterMutation(draft);
      TournamentSubApp.addHistory(draft, 'assign-player', `Assigned ${player.name} to ${targetTeam.name}.`);
      return { ok: true };
    });
    await commitTournamentMutation(assigned, {
      successMessage: 'Player assigned.',
      fallbackErrorMessage: 'Unable to assign player.',
      contextLabel: 'tournament-assign-player',
      actionMeta: {
        scope: 'tournament',
        action: 'assign-player',
        entityType: 'player',
        entityId: playerId,
        title: 'Player assignment updated.',
        detail: `Assigned to ${getTournamentTeamName(activeTournament, teamId)}.`,
        tone: 'info',
        undoSnapshot: beforeStoreSnapshot
      }
    });
    return;
  }

  if (action === 'unassign-player') {
    const playerId = String(trigger?.getAttribute('data-player-id') || '').trim();
    if (!playerId) return;
    const beforeStoreSnapshot = TournamentManager.getStoreSnapshot();
    const unassigned = TournamentSubApp.mutateTournament(activeId, (draft) => {
      const player = (draft.players || []).find((item) => String(item.id) === playerId);
      if (!player) return { ok: false, error: 'Player not found.' };
      (draft.teams || []).forEach((team) => {
        team.memberKeys = (team.memberKeys || []).filter((memberId) => memberId !== playerId);
      });
      player.teamId = '';
      clearTournamentMatchesForRosterMutation(draft);
      TournamentSubApp.addHistory(draft, 'unassign-player', `Unassigned ${player.name} from teams.`);
      return { ok: true };
    });
    await commitTournamentMutation(unassigned, {
      successMessage: 'Player unassigned.',
      fallbackErrorMessage: 'Unable to unassign player.',
      contextLabel: 'tournament-unassign-player',
      actionMeta: {
        scope: 'tournament',
        action: 'unassign-player',
        entityType: 'player',
        entityId: playerId,
        title: 'Player unassigned from team.',
        detail: 'Team composition changed.',
        tone: 'warning',
        undoSnapshot: beforeStoreSnapshot
      }
    });
    return;
  }

  if (action === 'auto-build-teams') {
    const requestedTeamCount = Math.max(2, Number.parseInt(document.getElementById('trn-auto-team-count')?.value || '2', 10) || 2);
    const beforeStoreSnapshot = TournamentManager.getStoreSnapshot();
    const built = TournamentSubApp.mutateTournament(activeId, (draft) => {
      const activePlayers = (draft.players || []).filter((player) => player.active);
      if (activePlayers.length < 2) {
        return { ok: false, error: 'Need at least two active tournament players.' };
      }
      const checkedKeys = activePlayers.map((player) => playerIdentityKey(player));
      const generated = generateBalancedGroups(activePlayers, checkedKeys, requestedTeamCount);
      const teams = (generated.teams || []).map((members, index) => ({
        id: TournamentSubApp.uid('tt'),
        name: `Team ${index + 1}`,
        seed: index + 1,
        notes: '',
        memberKeys: Array.from(new Set((members || []).map((member) => String(member.id || '').trim()).filter(Boolean)))
      })).filter((team) => team.memberKeys.length > 0);

      if (teams.length < 2) {
        return { ok: false, error: 'Balanced team build requires at least two non-empty teams.' };
      }

      const teamByMember = new Map();
      teams.forEach((team) => {
        (team.memberKeys || []).forEach((memberId) => {
          if (!teamByMember.has(memberId)) teamByMember.set(memberId, team.id);
        });
      });
      (draft.players || []).forEach((player) => {
        player.teamId = teamByMember.get(player.id) || '';
      });
      draft.teams = teams;
      draft.teamCount = teams.length;
      clearTournamentMatchesForRosterMutation(draft);
      draft.sourceSummary = 'auto-built-teams';
      draft.teamBuildSummary = generated.summary || null;
      TournamentSubApp.addHistory(
        draft,
        'auto-build-teams',
        `Auto built ${teams.length} teams from ${activePlayers.length} active players (fairness ${Number(generated.summary?.fairnessScore || 0).toFixed(2)}).`
      );
      return { ok: true };
    });
    await commitTournamentMutation(built, {
      successMessage: 'Teams auto-built from tournament players.',
      fallbackErrorMessage: 'Auto build failed.',
      contextLabel: 'tournament-auto-build-teams',
      actionMeta: {
        scope: 'tournament',
        action: 'auto-build-teams',
        entityType: 'tournament',
        entityId: activeId,
        title: 'Auto built tournament teams.',
        detail: `Target teams: ${requestedTeamCount}.`,
        tone: 'warning',
        undoSnapshot: beforeStoreSnapshot
      }
    });
    return;
  }

  if (action === 'generate-matches') {
    const existingCount = Array.isArray(activeTournament.matches) ? activeTournament.matches.length : 0;
    if (existingCount > 0) {
      const confirmed = confirmDangerousActionOrAbort({
        title: `Regenerate matches for "${activeTournament.name}"?`,
        detail: `This replaces ${existingCount} existing matches with a new schedule.`,
        confirmText: 'REGENERATE'
      });
      if (!confirmed) return;
    }
    const beforeStoreSnapshot = TournamentManager.getStoreSnapshot();
    const generated = TournamentSubApp.mutateTournament(activeId, (draft) => {
      const playableTeams = getTournamentPlayableTeams(draft);
      if (playableTeams.length < 2) {
        return { ok: false, error: 'Need at least two teams with players before generating matches.' };
      }
      draft.matches = buildTournamentRoundRobinMatches(playableTeams, draft.courtCount || 2);
      TournamentSubApp.addHistory(draft, 'generate-matches', `Generated ${draft.matches.length} round-robin matches.`);
      return { ok: true };
    });
    await commitTournamentMutation(generated, {
      successMessage: 'Matches generated.',
      fallbackErrorMessage: 'Unable to generate matches.',
      contextLabel: 'tournament-generate-matches',
      actionMeta: {
        scope: 'tournament',
        action: 'generate-matches',
        entityType: 'tournament',
        entityId: activeId,
        title: 'Generated tournament matches.',
        detail: (result) => {
          const count = Array.isArray(result?.tournament?.matches) ? result.tournament.matches.length : 0;
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
    if (!matchCount) {
      setTournamentNotice('No matches to reset.', TOURNAMENT_NOTICE_ERROR);
      initTournamentView();
      return;
    }
    const confirmed = confirmDangerousActionOrAbort({
      title: `Reset recorded results for "${activeTournament.name}"?`,
      detail: `This clears scores and winners for ${matchCount} matches and marks them scheduled.`,
      confirmText: 'RESET'
    });
    if (!confirmed) return;
    const beforeStoreSnapshot = TournamentManager.getStoreSnapshot();
    const reset = TournamentSubApp.mutateTournament(activeId, (draft) => {
      draft.matches = TournamentSubApp.sortMatches(draft.matches || []).map((match) => ({
        ...match,
        status: TournamentManager.MATCH_SCHEDULED,
        scoreA: null,
        scoreB: null,
        winnerTeamId: null,
        loserTeamId: null
      }));
      TournamentSubApp.addHistory(draft, 'reset-matches', `Reset results for ${draft.matches.length} matches.`);
      return { ok: true };
    });
    await commitTournamentMutation(reset, {
      successMessage: 'Match results reset.',
      fallbackErrorMessage: 'Unable to reset match results.',
      contextLabel: 'tournament-reset-matches',
      actionMeta: {
        scope: 'tournament',
        action: 'reset-matches',
        entityType: 'tournament',
        entityId: activeId,
        title: 'Reset tournament match results.',
        detail: `${matchCount} matches reset.`,
        tone: 'warning',
        undoSnapshot: beforeStoreSnapshot
      }
    });
    return;
  }

  if (action === 'start-next-match') {
    const next = TournamentSubApp.sortMatches(activeTournament.matches || [])
      .find((match) => match.status === TournamentManager.MATCH_SCHEDULED && !!match.teamAId && !!match.teamBId);
    if (!next) {
      setTournamentNotice('No scheduled match available to start.', TOURNAMENT_NOTICE_ERROR);
      initTournamentView();
      return;
    }
    action = 'start-match';
    trigger = {
      getAttribute: (name) => (name === 'data-match-id' ? next.id : '')
    };
  }

  if (action === 'start-match') {
    const matchId = String(trigger?.getAttribute('data-match-id') || '').trim();
    if (!matchId) return;
    const beforeStoreSnapshot = TournamentManager.getStoreSnapshot();
    const started = TournamentSubApp.mutateTournament(activeId, (draft) => {
      const match = (draft.matches || []).find((item) => String(item.id) === matchId);
      if (!match) return { ok: false, error: 'Match not found.' };
      if (match.status === TournamentManager.MATCH_FINAL) return { ok: false, error: 'Match is already final.' };
      if (!match.teamAId || !match.teamBId) return { ok: false, error: 'Match is waiting for teams.' };
      (draft.matches || []).forEach((other) => {
        if (String(other.id) === matchId) return;
        if (Number(other.court) === Number(match.court) && other.status === TournamentManager.MATCH_LIVE) {
          other.status = TournamentManager.MATCH_SCHEDULED;
        }
      });
      match.status = TournamentManager.MATCH_LIVE;
      TournamentSubApp.addHistory(
        draft,
        'start-match',
        `Started ${getTournamentTeamName(draft, match.teamAId)} vs ${getTournamentTeamName(draft, match.teamBId)} on Net ${Number(match.court) || 1}.`
      );
      return { ok: true };
    });
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
    if (!matchId) return;
    const scoreAInput = findTournamentElementByDataAttr('data-tr-score-a-for', matchId);
    const scoreBInput = findTournamentElementByDataAttr('data-tr-score-b-for', matchId);
    const scoreA = Number(scoreAInput?.value);
    const scoreB = Number(scoreBInput?.value);
    if (!Number.isFinite(scoreA) || !Number.isFinite(scoreB) || scoreA < 0 || scoreB < 0) {
      setTournamentNotice('Scores must be zero or higher numbers.', TOURNAMENT_NOTICE_ERROR);
      initTournamentView();
      return;
    }
    if (scoreA === scoreB) {
      setTournamentNotice('Tie scores are not supported in this first tournament format.', TOURNAMENT_NOTICE_ERROR);
      initTournamentView();
      return;
    }
    const beforeStoreSnapshot = TournamentManager.getStoreSnapshot();
    const finalized = TournamentSubApp.mutateTournament(activeId, (draft) => {
      const match = (draft.matches || []).find((item) => String(item.id) === matchId);
      if (!match) return { ok: false, error: 'Match not found.' };
      if (!match.teamAId || !match.teamBId) return { ok: false, error: 'Match is waiting for teams.' };
      const winnerTeamId = scoreA > scoreB ? match.teamAId : match.teamBId;
      const loserTeamId = winnerTeamId === match.teamAId ? match.teamBId : match.teamAId;
      match.status = TournamentManager.MATCH_FINAL;
      match.scoreA = scoreA;
      match.scoreB = scoreB;
      match.winnerTeamId = winnerTeamId;
      match.loserTeamId = loserTeamId;
      TournamentSubApp.addHistory(
        draft,
        'finalize-match',
        `Finalized ${getTournamentTeamName(draft, match.teamAId)} ${scoreA}-${scoreB} ${getTournamentTeamName(draft, match.teamBId)}.`
      );
      return { ok: true };
    });
    await commitTournamentMutation(finalized, {
      successMessage: 'Match finalized.',
      fallbackErrorMessage: 'Result save failed.',
      contextLabel: 'tournament-finalize-match',
      actionMeta: {
        scope: 'tournament',
        action: 'finalize-match',
        entityType: 'match',
        entityId: matchId,
        title: `Finalized ${getTournamentMatchLabel(activeTournament, matchId)} (${scoreA}-${scoreB}).`,
        detail: `Tournament: ${activeTournament.name}`,
        tone: 'success',
        undoSnapshot: beforeStoreSnapshot
      }
    });
    return;
  }

  if (action === 'clear-match-result') {
    const matchId = String(trigger?.getAttribute('data-match-id') || '').trim();
    if (!matchId) return;
    const beforeStoreSnapshot = TournamentManager.getStoreSnapshot();
    const cleared = TournamentSubApp.mutateTournament(activeId, (draft) => {
      const match = (draft.matches || []).find((item) => String(item.id) === matchId);
      if (!match) return { ok: false, error: 'Match not found.' };
      if (match.status !== TournamentManager.MATCH_FINAL && match.status !== TournamentManager.MATCH_LIVE) {
        return { ok: false, error: 'Match is not finalized or live.' };
      }
      match.status = TournamentManager.MATCH_SCHEDULED;
      match.scoreA = null;
      match.scoreB = null;
      match.winnerTeamId = null;
      match.loserTeamId = null;
      TournamentSubApp.addHistory(draft, 'clear-match-result', `Cleared result for ${getTournamentMatchLabel(draft, matchId)}.`);
      return { ok: true };
    });
    await commitTournamentMutation(cleared, {
      successMessage: 'Match result cleared.',
      fallbackErrorMessage: 'Unable to clear match result.',
      contextLabel: 'tournament-clear-match-result',
      actionMeta: {
        scope: 'tournament',
        action: 'clear-match-result',
        entityType: 'match',
        entityId: matchId,
        title: `Cleared result for ${getTournamentMatchLabel(activeTournament, matchId)}.`,
        detail: `Tournament: ${activeTournament.name}`,
        tone: 'warning',
        undoSnapshot: beforeStoreSnapshot
      }
    });
    return;
  }

  showTournamentActionBlocked('Action unavailable in this section.');
}

function ensureTournamentOverlayBindings() {
  if (ensureTournamentOverlayBindings._bound) return;
  const tournamentRoot = document.getElementById('view-tournament');
  if (!tournamentRoot) {
    pushTournamentRuntimeTrace('binding delayed: #view-tournament not found.', TOURNAMENT_NOTICE_ERROR);
    return;
  }
  const toEventElement = (rawTarget) => {
    if (rawTarget instanceof Element) return rawTarget;
    if (rawTarget && rawTarget.parentElement instanceof Element) return rawTarget.parentElement;
    return null;
  };
  const reportInteractionFailure = (contextLabel, err) => {
    const message = `Tournament interaction failed (${contextLabel}).`;
    console.error(message, err);
    setTournamentNotice(message, TOURNAMENT_NOTICE_ERROR);
    pushTournamentRuntimeTrace(`${contextLabel} failed: ${err?.message || 'runtime error'}`, TOURNAMENT_NOTICE_ERROR);
    initTournamentView();
  };

  // Canonical delegated change routing for tournament controls.
  document.addEventListener('change', (event) => {
    try {
      const target = toEventElement(event.target);
      if (!target) return;

      const select = target.closest('#view-tournament #tournamentSelect');
      if (!select) return;

      const selected = String(select.value || '').trim();
      pushTournamentRuntimeTrace(`select changed: ${selected || '(none)'}`);
      TournamentManager.setActive(selected);
      clearTournamentNotice();
      initTournamentView();
    } catch (err) {
      reportInteractionFailure('change', err);
    }
  });

  // Canonical delegated click routing for tournament controls.
  document.addEventListener('click', async (event) => {
    try {
      const target = toEventElement(event.target);
      if (!target) return;

      const closeBtn = target.closest('#view-tournament #closeTournamentBtn');
      if (closeBtn) {
        event.preventDefault();
        pushTournamentRuntimeTrace('close requested.');
        showTournamentView(false);
        return;
      }

      const trigger = target.closest('#view-tournament [data-tr-action]');
      if (!trigger) return;

      event.preventDefault();
      const action = String(trigger.getAttribute('data-tr-action') || '').trim();
      if (!action) {
        showTournamentActionBlocked('Tournament action wiring is missing.');
        return;
      }
      pushTournamentRuntimeTrace(`click received: ${action}`);
      await handleTournamentAction(action, trigger);
    } catch (err) {
      reportInteractionFailure('click', err);
    }
  }, true);

  // Tournament forms (if present) route through the same canonical handler.
  document.addEventListener('submit', async (event) => {
    try {
      const target = toEventElement(event.target);
      const form = target && target.matches('form') ? target : target?.closest('form');
      if (!form || !form.closest('#view-tournament')) return;
      event.preventDefault();

      const submitter = event.submitter instanceof Element
        ? event.submitter
        : form.querySelector('[data-tr-action]');
      if (!submitter) {
        showTournamentActionBlocked('Tournament form submitter is missing action wiring.');
        return;
      }

      const action = String(submitter.getAttribute('data-tr-action') || '').trim();
      if (!action) {
        showTournamentActionBlocked('Tournament form action wiring is missing.');
        return;
      }

      pushTournamentRuntimeTrace(`submit received: ${action}`);
      await handleTournamentAction(action, submitter);
    } catch (err) {
      reportInteractionFailure('submit', err);
    }
  }, true);

  ensureTournamentOverlayBindings._bound = true;
  pushTournamentRuntimeTrace(`binding initialized (click/change/submit delegated, v${APP_VERSION}).`, TOURNAMENT_NOTICE_SUCCESS);
}

function bindTournamentTab() {
  ensureTournamentTabClickable();
  ensureTournamentOverlayBindings();

  if (!bindTournamentTab._delegated) {
    document.addEventListener('click', (event) => {
      const rawTarget = event.target;
      const target = rawTarget instanceof Element
        ? rawTarget
        : (rawTarget && rawTarget.parentElement ? rawTarget.parentElement : null);
      if (!target) return;
      const opener = target.closest('[data-tab="tournament"], a[href="#tournament"]');
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

})();
// Render the entire application into the root element. Each call replaces
// existing content to reflect the current state. Event handlers are
// attached inline within this function. To minimize reflows, we build
// strings for larger sections and assign innerHTML.
function render() {
  const root = document.getElementById('root');
  if (!root) return;
  const existingPanel = document.getElementById('tab-' + activeMainTab);
  const savedScrollY = existingPanel ? existingPanel.scrollTop : 0;
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
  // Teams card is separated into adminTeamsHTML so it lives in its own tab.
  const adminTeamsHTML = state.isAdmin ? `<div class="card card-generate-teams">
  <div class="card-collapsible-head">
    <h3>Generate Teams</h3>
  </div>
  <div id="card-body-admin-generate-teams">
  <div class="team-size-chips">
    <div class="team-size-chip">
      <strong>${Math.floor(state.checkedIn.length / 6)}</strong>
      <span>teams of 6</span>
    </div>
    <div class="team-size-chip">
      <strong>${Math.floor(state.checkedIn.length / 4)}</strong>
      <span>teams of 4</span>
    </div>
    <div class="team-size-chip">
      <strong>${Math.floor(state.checkedIn.length / 2)}</strong>
      <span>teams of 2</span>
    </div>
  </div>
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
</div>` : '';

  const adminPlayersHTML = state.isAdmin ? `
    <div id="admin-players-shell">
      <div class="admin-toolbar">
        <select id="admin-quick-open" aria-label="Menu">
          <option value="">Menu</option>
          <option value="checkin">Check In</option>
          <option value="add-player">Add/Update Player</option>
          <option value="show-qr">Show QR Code</option>
        </select>
        <div class="admin-toolbar-actions">
          <button id="btn-save-supabase" class="secondary">Save</button>
          <button id="btn-reset-checkins" class="danger">Reset</button>
          <button id="btn-logout" class="secondary">Logout</button>
        </div>
      </div>
      ${canAccessOperatorSafetyControls() ? `
      <div class="card" style="margin-top:0.75rem;">
        <h3 style="margin:0 0 0.5rem;">Recent Actions</h3>
        ${renderOperatorActionsLogHTML()}
      </div>
      ` : ''}
<div class="card card-players">
  <div class="card-collapsible-head">
    <h3>Players${normalizedActiveGroup !== 'All' ? ` <span class="small" style="font-weight:500;">(${escapeHTML(activeGroupLabel)} Roster)</span>` : ''}</h3>
    <div class="card-collapsible-head-actions">
      <button id="btn-select-all-visible" class="secondary">Select All Shown</button>
    </div>
  </div>
  <div id="card-body-admin-players">
  <div id="filtersBody">

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

  </div> <!-- /#filtersBody -->

  <!-- Sticky search bar -->
  <div class="sticky-search-bar">
    <div id="player-search-container">
      <input
        type="text"
        id="player-search"
        placeholder="Search players…"
        value="${escapeHTML(state.searchTerm || '')}"
      />
      <span
        id="player-search-clear"
        style="${state.searchTerm ? '' : 'display:none;'}"
        aria-label="Clear search"
      >✕</span>
    </div>
  </div>

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

<div id="player-edit-modal" class="popup-overlay" style="display:none;" aria-hidden="true">
  <div class="popup-card card" role="dialog" aria-modal="true" aria-labelledby="player-edit-modal-title">
    <div class="popup-header">
      <h3 id="player-edit-modal-title">Edit Player</h3>
      <button type="button" class="secondary" data-role="close-popup" data-target="player-edit-modal">Cancel</button>
    </div>
    <div class="popup-body" id="player-edit-modal-body"></div>
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

  const adminLoginHTML = !state.isAdmin ? `
    <div class="card">
      <h2>Admin Login <span class="app-version-pill">v${APP_VERSION}</span></h2>
      <div class="row">
        <input type="password" id="admin-code" placeholder="Enter admin code" />
        <button id="btn-admin-login">Login</button>
      </div>
    </div>
  ` : '';

  const publicCheckinHTML = !state.isAdmin ? `
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
  ` : '';

  const html = `
<div id="app-shell">
  <header id="app-header">
    <div class="app-header-brand">
      ${state.limitedGroup ? escapeHTML(state.limitedGroup) : 'Athletic Specimen'}
      <span class="app-version-inline">v${APP_VERSION}</span>
    </div>
    <div id="js-sync-notice">${sharedSyncNoticeHTML}</div>
  </header>
  <div id="app-content">
    <div id="tab-session" class="tab-panel">
      <div class="container">
        ${state.isAdmin ? `
          <div class="card session-admin-card">
            <h3 style="margin:0 0 12px;">Current Session</h3>
            <div class="session-form">
              <label class="session-label" for="session-date">Date</label>
              <input type="date" id="session-date" class="session-input"
                value="${escapeHTML(state.currentSession?.date || '')}" />
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
    <div id="tab-players" class="tab-panel">
      <div class="container">
        <div id="js-checkin-stats">${buildCheckinStatsHTML()}</div>
        ${adminLoginHTML}
        ${state.isAdmin ? adminPlayersHTML : publicCheckinHTML}
      </div>
    </div>
    <div id="tab-teams" class="tab-panel">
      <div class="container">
        ${state.isAdmin ? adminTeamsHTML : '<div class="card" style="text-align:center;padding:2rem;"><p style="color:#64748b;margin:0;">Log in as admin to use team generation.</p></div>'}
      </div>
    </div>
  </div>
  <nav id="bottom-nav">
    <button class="nav-btn" data-nav-tab="session">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      <span>Session</span>
    </button>
    <button class="nav-btn" data-nav-tab="players">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      <span>${state.isAdmin ? 'Players' : 'Check-in'}</span>
    </button>
    ${state.isAdmin ? `
    <button class="nav-btn" data-nav-tab="teams">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
      <span>Teams</span>
    </button>
    <button class="nav-btn" data-nav-tab="tournament">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
      <span>Tournament</span>
    </button>` : ''}
  </nav>
</div>
  `;

  const sanitized = html.replace(/\n?\]\s*$/, '');
  root.innerHTML = sanitized;

// ---- dropdown menu CSS (keep ONLY this block) ----
let menuStyle = document.getElementById('menu-css');
const cssText = `
/* ---------------- Player card menu styling ---------------- */

.player-card .menu-wrap {
  position: relative;
  flex-shrink: 0;
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
  top: calc(100% + 4px);
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
if (!state.isAdmin && (activeMainTab === 'teams' || activeMainTab === 'tournament')) activeMainTab = 'players';
activateMainTab(activeMainTab);
restoreTransientInteractionState(interactionSnapshot);
void root.offsetHeight;
const restoredPanel = document.getElementById('tab-' + activeMainTab);
if (savedScrollY > 0 && restoredPanel) restoredPanel.scrollTop = savedScrollY;
}

// Attach event listeners to the current DOM. This function should be
// called after each call to render().
function activateMainTab(tab) {
  if (tab === 'tournament') {
    showTournamentView(true);
    initTournamentView();
    return;
  }
  activeMainTab = tab;
  sessionStorage.setItem('as_main_tab', tab);
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + tab));
  document.querySelectorAll('#bottom-nav .nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.navTab === tab));
}

function attachHandlers() {
  // --- Bottom nav ---
  const bottomNav = document.getElementById('bottom-nav');
  if (bottomNav) {
    bottomNav.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-nav-tab]');
      if (btn) activateMainTab(btn.dataset.navTab);
    });
  }
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
    if (value === 'show-qr') openQrModal();
    adminQuickOpen.value = '';
  });
}

function openQrModal() {
  const modal = document.getElementById('qrModal');
  const container = document.getElementById('qrCodeContainer');
  if (!modal || !container) return;
  container.innerHTML = '';
  new QRCode(container, {
    text: 'https://athletic-specimen-app.vercel.app/checkin.html',
    width: 340,
    height: 340,
    colorDark: '#000000',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.H
  });
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeQrModal() {
  const modal = document.getElementById('qrModal');
  if (!modal) return;
  modal.hidden = true;
  document.body.style.overflow = '';
}

(function wireQrModal() {
  const closeBtn = document.getElementById('qrModalClose');
  const closeBottomBtn = document.getElementById('qrCloseBottomBtn');
  const backdrop = document.querySelector('.qr-modal-backdrop');
  const copyBtn = document.getElementById('qrCopyBtn');

  if (closeBtn) closeBtn.addEventListener('click', closeQrModal);
  if (closeBottomBtn) closeBottomBtn.addEventListener('click', closeQrModal);
  if (backdrop) backdrop.addEventListener('click', closeQrModal);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeQrModal();
  });

  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const url = 'https://athletic-specimen-app.vercel.app/checkin.html';
      try {
        await navigator.clipboard.writeText(url);
        const orig = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = orig; }, 1500);
      } catch {
        alert('Could not copy. URL: ' + url);
      }
    });
  }
}());

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
      state.masterAdminAuthenticated = true;
      state.limitedGroup = null;                 // clear tenant lock
      state.activeGroup = 'All';                 // show everyone
      sessionStorage.setItem(LS_ADMIN_KEY, 'true');
      sessionStorage.setItem(LS_MASTER_ADMIN_AUTH_KEY, 'true');
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
      state.masterAdminAuthenticated = false;
      state.limitedGroup = group;
      if (!state.groups.includes(group)) {
        state.groups = Array.from(new Set([...state.groups, group]));
      }
      state.activeGroup = group;                 // force filter to tenant group
      sessionStorage.setItem(LS_ADMIN_KEY, 'true');
      sessionStorage.removeItem(LS_MASTER_ADMIN_AUTH_KEY);
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
    state.masterAdminAuthenticated = false;
    state.limitedGroup = null;                   // clear tenant lock
    state.activeGroup = 'All';                   // reset view
    sessionStorage.removeItem(LS_ADMIN_KEY);
    sessionStorage.removeItem(LS_MASTER_ADMIN_AUTH_KEY);
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
      if (summary.tournamentSyncConflict) pieces.push('Tournament conflict detected (reloaded shared state)');
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
      const confirmed = window.confirm(
        `Reset all check-ins (${previouslyCheckedIn.length} currently checked in)?\n\nThis will check everyone out and sync that state to Supabase.`
      );
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

  if (canAccessOperatorSafetyControls()) {
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
      loadSession().then(() => { if (state.currentSession) render(); });

      if (!crossDeviceRefreshInterval) {
        // Keep multiple devices converged without requiring a full page refresh.
        crossDeviceRefreshInterval = setInterval(() => {
          if (document.hidden) return;
          queueSupabaseRefresh(800);
        }, 15000);
      }
    })();
  }
}

function initBackToTop() {
  const btn = document.getElementById('back-to-top');
  if (!btn) return;
  const tabPlayers = document.getElementById('tab-players');
  if (!tabPlayers) return;
  tabPlayers.addEventListener('scroll', () => {
    btn.classList.toggle('visible', tabPlayers.scrollTop > 200);
  }, { passive: true });
  btn.addEventListener('click', () => {
    tabPlayers.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    init();
    initTournamentView();
    bindTournamentTab();
    initBackToTop();
  });
} else {
  init();
  initTournamentView();
  bindTournamentTab();
  initBackToTop();
}


