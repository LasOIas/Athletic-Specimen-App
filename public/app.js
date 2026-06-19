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
// SUPABASE_URL + SUPABASE_KEY come from public/supabase-config.js (loaded before app.js) — C25 item 7.
// C21: persistSession=false — the admin JWT lives in memory only and dies with the tab, so a
// left-behind session can never grant the next visitor admin on a shared/kiosk device. The quick
// code re-login (server-verified) is the intended way back in. autoRefreshToken keeps a long
// active session alive in-tab.
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: true },
});
const APP_VERSION = '2026.06.19.13';
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
const SUPABASE_AUTHORITATIVE = true;
const SHARED_SYNC_PENDING = 'pending';
const SHARED_SYNC_LIVE = 'live';
const SHARED_SYNC_FALLBACK = 'fallback';
const SHARED_SYNC_LOCAL_ONLY = 'local-only';
const SHARED_SYNC_CONFLICT_RESOLVED = 'conflict-resolved';

const selectedSet = () => new Set(state.selectedIds || []);

// Master admin (full access across all groups)
// C21: admin codes are NO LONGER in the client bundle. They live ONLY in the admin_login
// Edge Function (server-side). The client sends a typed code and receives a real Supabase
// session whose JWT carries role/group; isAdmin/limitedGroup derive from that session.

// Session key for tenant scope (still used to keep the active-group filter coherent in-tab)
const LS_LIMITED_GROUP_KEY = 'athletic_specimen_limited_group';

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

// C21: loadAdminCodes() removed — there are no client-side admin codes anymore (server-only).


function closePlayerEditPopup() {
  const modal = document.getElementById('player-edit-modal');
  if (!modal) return;
  modal.style.display = 'none';
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
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
      <input type="text" class="edit-name popup-edit-input" placeholder="Name" value="${escapeHTMLText(player.name)}" autocapitalize="words" autocomplete="off" spellcheck="false" />
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
  document.body.style.overflow = 'hidden'; // lock background scroll on iOS so the page doesn't scroll under the modal

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
    // If this row was never saved (no id yet), mark it pending so a racing
    // authoritative sync doesn't drop it before the insert lands (mergePlayersAfterSync).
    if (!next.id) next.pending = true;

    // Optimistic local update
    const copy = state.players.slice();
    copy[idx] = next;
    state.players = copy;

    // Persist local and render immediately for responsive inline edits.
    saveLocal();
    closePlayerEditPopup();
    closeInlineEditRow(row);
    render();

    // Honest save status: neutral "Saving…" now, settled to Saved / failed after the
    // write resolves (offline = saved locally). See reliability check 2026-06-18.
    const editToast = makeSaveToast(supabaseClient ? 'Saving…' : 'Saved');
    if (!supabaseClient && editToast) setTimeout(() => { try { editToast.remove(); } catch {} }, 1100);

    // Remote sync runs in background to keep UI snappy on slower connections.
    if (supabaseClient) {
      (async () => {
        let ok = false;
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
              const { data, error } = await supabaseClient.from('players').insert([insertRow]).select();
              if (error) throw error;
              // Capture the inserted id so a later re-Save updates this row instead of
              // inserting a duplicate. See reliability check 2026-06-18.
              if (Array.isArray(data) && data.length > 0) next.id = data[0].id;
            } catch {
              try {
                const { data, error } = await supabaseClient.from('players').insert([{ name, skill, tag: group }]).select();
                if (error) throw error;
                if (Array.isArray(data) && data.length > 0) next.id = data[0].id;
              } catch {
                const { data, error } = await supabaseClient.from('players').insert([{ name, skill }]).select();
                if (error) throw error;
                if (Array.isArray(data) && data.length > 0) next.id = data[0].id;
              }
            }
            remoteOK = true;
          }

          await ensureGroupCatalogEntriesSupabase(groups);
          next.pending = false;
          if (remoteOK) { ok = true; queueSupabaseRefresh(); }
          else await reconcileToSupabaseAuthority('inline-edit-save');
        } catch (err) {
          console.error('Supabase save error', err);
          next.pending = false;
          await reconcileToSupabaseAuthority('inline-edit-save');
        }
        settleSaveToast(editToast, ok, 'Saved');
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

    // Edge autoscroll: if the finger nears the top/bottom of the scroll panel,
    // nudge it so off-screen teams become reachable mid-drag.
    const scrollPanel = document.querySelector('.tab-panel.active');
    if (scrollPanel) {
      const pr = scrollPanel.getBoundingClientRect();
      const EDGE = 64, STEP = 16;
      if (t.clientY < pr.top + EDGE) scrollPanel.scrollTop -= STEP;
      else if (t.clientY > pr.bottom - EDGE) scrollPanel.scrollTop += STEP;
    }

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
    // A check-in/out toggle only changes the player's status + the stats card —
    // exactly partialRender's scope. Full render() here rebuilt all ~213 cards on
    // every tap (janky + dropped in-progress taps/typing). See reliability check 2026-06-18.
    partialRender();

    if (supabaseClient && player.id) {
      (async () => {
        try {
          // C21: route through the SECURITY DEFINER RPCs (the only anon write door under locked
          // RLS); works for authenticated admins too. Same single-row effect as the prior update.
          const { error } = await supabaseClient
            .rpc(inBtn ? 'check_in' : 'check_out', { p_id: player.id });
          if (error) throw error;
          queueSupabaseRefresh();
        } catch (err) {
          console.error(inBtn ? 'Supabase update error' : 'Supabase check-out error', err);
          // C22 item 3: queue the write to retry on reconnect; keep the optimistic flip (the merge
          // overlay preserves it across syncs) instead of reverting to DB authority.
          outboxEnqueue({ key: 'att:' + player.id, kind: inBtn ? 'check_in' : 'check_out', payload: { p_id: player.id }, ts: Date.now() });
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

// -- Tap the "Athletic Specimen" title in the header → scroll active tab to top --
(function ensureHeaderTapToTop() {
  if (window.__headerTapBound) return;
  window.__headerTapBound = true;
  document.addEventListener('click', (e) => {
    const brand = e.target.closest && e.target.closest('.app-header-brand');
    if (!brand) return;
    const activePanel = document.querySelector('.tab-panel.active');
    if (activePanel) activePanel.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();

// -- iOS status-bar (clock) tap → scroll active tab to top --
// iOS scrolls the document body to 0 when the status bar is tapped. Our app
// keeps body overflow at 1px (see styles.css), pre-scrolls past 0, and watches
// for the scroll event so we can forward it to the actually-scrolling tab panel.
// C25 item 4: collapse a burst of resize events (iOS URL-bar show/hide fires them constantly) into a
// single trailing call, so resize-bound work (re-pin body, bracket breakpoint re-render) runs once after settle.
function debounce(fn, ms) {
  let t = null;
  return function () {
    const ctx = this, args = arguments;
    clearTimeout(t);
    t = setTimeout(function () { fn.apply(ctx, args); }, ms);
  };
}

(function ensureClockTapHandler() {
  if (window.__clockTapBound) return;
  window.__clockTapBound = true;

  function pinBody() {
    if (window.scrollY === 0) {
      window.scrollTo(0, 1);
    }
  }
  setTimeout(pinBody, 0);
  window.addEventListener('load', pinBody);
  window.addEventListener('resize', debounce(pinBody, 150));

  // C24 item 9: only forward scroll-to-top on a GENUINE status-bar tap (the user taps the iOS clock —
  // no finger on the page content), NOT on an ordinary rubber-band overscroll (finger dragging the
  // content briefly hits scrollY=0), which used to yank the active panel to top on every bounce.
  let pending = false;
  let touching = false;
  let lastTouchEnd = 0;
  // iOS fires touchcancel (NOT touchend) when the system takes over a touch (momentum/rubber-band/gesture
  // handoff) — clear the flag on BOTH so `touching` can't get stuck true and suppress a real status-bar tap.
  const clearTouch = () => { touching = false; lastTouchEnd = Date.now(); };
  window.addEventListener('touchstart', () => { touching = true; }, { passive: true });
  window.addEventListener('touchend', clearTouch, { passive: true });
  window.addEventListener('touchcancel', clearTouch, { passive: true });
  window.addEventListener('scroll', () => {
    if (pending) return;
    if (window.scrollY > 0) return;
    // a finger is on (or just left) the content -> this is a rubber-band, not a status-bar tap: re-pin only.
    if (touching || (Date.now() - lastTouchEnd) < 400) { window.scrollTo(0, 1); return; }
    pending = true;
    const activePanel = document.querySelector('.tab-panel.active');
    if (activePanel && activePanel.scrollTop > 0) {
      activePanel.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setTimeout(() => {
      window.scrollTo(0, 1);
      pending = false;
    }, 250);
  }, { passive: true });
})();

// -- A–Z jump strip: tap or drag a letter to scroll to that section --
function refreshAzStripAvailability() {
  const strip = document.querySelector('.players-az-strip');
  if (!strip) return;
  const letters = new Set();
  document.querySelectorAll('.players .player-card .player-name').forEach((el) => {
    const ch = (el.textContent || '').trim().charAt(0).toUpperCase();
    if (ch) letters.add(ch);
  });
  strip.querySelectorAll('.az-letter').forEach((btn) => {
    btn.classList.toggle('is-empty', !letters.has(btn.dataset.letter));
  });
}

(function ensureAzStripBound() {
  if (window.__azStripBound) return;
  window.__azStripBound = true;

  function jumpToLetter(letter, smooth) {
    if (!letter) return false;
    const target = String(letter).toUpperCase();
    const cards = document.querySelectorAll('.players .player-card');
    for (const card of cards) {
      const name = (card.querySelector('.player-name')?.textContent || '').trim();
      if (name && name.charAt(0).toUpperCase() === target) {
        card.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
        return true;
      }
    }
    return false;
  }

  function letterAtPoint(x, y) {
    // Direct hit — touch landed exactly on a letter button
    const el = document.elementFromPoint(x, y);
    if (el && el.closest) {
      const btn = el.closest('.az-letter');
      if (btn && !btn.classList.contains('is-empty')) return btn.dataset.letter || null;
    }
    // Fallback — touch is within the strip's vertical range but possibly between letters
    // (or in the small horizontal margin around it). Compute letter from Y position.
    const strip = document.querySelector('.players-az-strip');
    if (!strip) return null;
    const sRect = strip.getBoundingClientRect();
    if (!(sRect.height > 0)) return null; // strip not visible (another tab active) — avoids NaN idx
    if (x < sRect.left - 12 || x > sRect.right + 12) return null;
    if (y < sRect.top || y > sRect.bottom) return null;
    const letters = strip.querySelectorAll('.az-letter');
    if (!letters.length) return null;
    const ratio = (y - sRect.top) / sRect.height;
    let idx = Math.floor(ratio * letters.length);
    idx = Math.max(0, Math.min(letters.length - 1, idx));
    if (!letters[idx].classList.contains('is-empty')) return letters[idx].dataset.letter;
    // Snap to nearest non-empty letter
    for (let off = 1; off < letters.length; off++) {
      const above = letters[idx - off];
      const below = letters[idx + off];
      if (above && !above.classList.contains('is-empty')) return above.dataset.letter;
      if (below && !below.classList.contains('is-empty')) return below.dataset.letter;
    }
    return null;
  }

  function setActive(letter) {
    document.querySelectorAll('.az-letter.is-active').forEach((b) => b.classList.remove('is-active'));
    if (!letter) return;
    document.querySelectorAll(`.az-letter[data-letter="${letter}"]`).forEach((b) => b.classList.add('is-active'));
  }

  let scrubbing = false;
  let lastJumpedLetter = null;

  // Tap (no drag) → smooth scroll to first matching player
  document.addEventListener('click', (e) => {
    if (scrubbing) return; // a drag just ended; the touchend handler already settled position
    let letter = null;
    const btn = e.target.closest && e.target.closest('.az-letter');
    if (btn) {
      if (btn.classList.contains('is-empty')) return;
      letter = btn.dataset.letter;
    } else {
      // near-miss tap (between letters or just off the strip): snap to the nearest
      // non-empty letter by Y position — same forgiving logic as the scrub path
      letter = letterAtPoint(e.clientX, e.clientY);
      if (!letter) return;
    }
    e.preventDefault();
    e.stopPropagation();
    jumpToLetter(letter, true);
    setActive(letter);
    setTimeout(() => setActive(null), 600);
  }, true);

  // Touch start on the strip → start scrubbing (instant scroll while finger is down)
  document.addEventListener('touchstart', (e) => {
    if (!(e.target.closest && e.target.closest('.players-az-strip'))) return;
    scrubbing = true;
    lastJumpedLetter = null;
    const t = e.touches[0];
    if (!t) return;
    const letter = letterAtPoint(t.clientX, t.clientY);
    if (letter && letter !== lastJumpedLetter) {
      jumpToLetter(letter, false);
      setActive(letter);
      lastJumpedLetter = letter;
    }
  }, { passive: false });

  document.addEventListener('touchmove', (e) => {
    if (!scrubbing) return;
    e.preventDefault(); // stop the page from scrolling while finger is on the strip
    const t = e.touches[0];
    if (!t) return;
    const letter = letterAtPoint(t.clientX, t.clientY);
    if (letter && letter !== lastJumpedLetter) {
      jumpToLetter(letter, false);
      setActive(letter);
      lastJumpedLetter = letter;
    }
  }, { passive: false });

  document.addEventListener('touchend', () => {
    if (!scrubbing) return;
    setTimeout(() => {
      scrubbing = false;
      lastJumpedLetter = null;
      setActive(null);
    }, 200);
  });
  document.addEventListener('touchcancel', () => {
    scrubbing = false;
    lastJumpedLetter = null;
    setActive(null);
  });
})();

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
  refreshAzStripAvailability();
}

// ---------------------------------------------------------------------------
// C24 reliability core: error funnel, render coalescer, top-level error boundary.
// ---------------------------------------------------------------------------

// Item 2: single error funnel so failures stop vanishing into empty catch{}. Sentry-ready — once a DSN
// is wired (C23 item 2) it forwards automatically. NEVER let reporting itself throw.
function reportError(err, context) {
  try {
    console.error(`[reportError]${context ? ' [' + context + ']' : ''}`, err);
    if (window.Sentry && typeof window.Sentry.captureException === 'function') {
      window.Sentry.captureException(err instanceof Error ? err : new Error(String(err)), { extra: { context } });
    }
  } catch (_) { /* reporting must never throw */ }
}

// Item 14: top-level error boundary. One uncaught error must not freeze the SPA mid-session for a
// non-technical admin. "Reset view" re-pulls from the cloud WITHOUT discarding pending local writes.
let _errorBoundaryShown = false;
function showErrorBoundary(err, context) {
  reportError(err, context || 'uncaught');
  if (_errorBoundaryShown) return;
  _errorBoundaryShown = true;
  try {
    if (document.getElementById('app-error-boundary')) return;
    const el = document.createElement('div');
    el.id = 'app-error-boundary';
    el.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(241,245,249,0.97);display:flex;align-items:center;justify-content:center;padding:24px;';
    el.innerHTML =
      '<div style="max-width:340px;text-align:center;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">'
      + '<div style="font-size:18px;font-weight:700;margin-bottom:8px;">Hit a snag</div>'
      + '<div style="font-size:14px;color:#334155;margin-bottom:18px;line-height:1.4;">Tap below to reload. Your data is safe.</div>'
      + '<button id="app-error-reset" style="background:#2563eb;color:#fff;border:none;border-radius:8px;padding:12px 18px;font-size:15px;font-weight:700;">Reset view</button>'
      + '</div>';
    document.body.appendChild(el);
    const btn = el.querySelector('#app-error-reset');
    if (btn) btn.addEventListener('click', async () => {
      try {
        if (typeof syncFromSupabase === 'function') await syncFromSupabase(); // re-pull; keeps pending writes
        render();
      } catch (e) { reportError(e, 'error-boundary-reset'); }
      finally { el.remove(); _errorBoundaryShown = false; }
    });
  } catch (_) { /* the boundary must never throw */ }
}

function installErrorBoundary() {
  window.addEventListener('error', (event) => {
    // ignore resource-load errors (img/script 404s bubble here with an element target) — only real JS errors
    if (event && event.target && event.target !== window && event.target.tagName) return;
    showErrorBoundary(event && (event.error || event.message), 'window.onerror');
  });
  // unhandled promise rejections are usually recoverable (a failed fetch) — funnel them, but don't throw up
  // the full-screen overlay for every one.
  window.addEventListener('unhandledrejection', (event) => {
    reportError(event && event.reason, 'unhandledrejection');
  });
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

// C25 item 2: SyncManager — one home for all sync ENGINE state (refresh/poll/realtime
// flags, timers, channels, seq counters). Replaces ~18 scattered module globals. The
// sync functions stay top-level and read/write through this object. The outbox
// (flushOutbox) and live-state save (queueLiveStateSave) keep their own state — they
// are already cohesive units. State-only refactor: runtime behavior is identical.
const SyncManager = {
  players:      { refreshTimer: null, refreshQueued: false, refreshRunning: false,
                  requestSeq: 0, appliedSeq: 0, liveChannel: null, bootGraceArmed: false },
  groupCatalog: { timer: null, queued: false, running: false, lastSig: '' },
  tournament:   { refreshTimer: null, liveChannel: null, bootGraceArmed: false },
  poll:         { interval: null },
  rt:           { backoff: { live: 0, tournament: 0 },
                  resubTimer: { live: null, tournament: null } },
  forceSaveRunning: false,
  hooksBound: false,
  bootSyncAt: 0, // C25 item 8: timestamp of init's initial sync (anchors the post-boot grace window)
};
const BOOT_GRACE_MS = 1500; // C25 item 8: skip the one redundant background refresh fired within this window after boot
function queueSupabaseRefresh(delay = 160) {
  if (!supabaseClient) return;
  SyncManager.players.refreshQueued = true;
  clearTimeout(SyncManager.players.refreshTimer);
  SyncManager.players.refreshTimer = setTimeout(() => {
    void runQueuedSupabaseRefresh();
  }, Math.max(0, Number(delay) || 0));
}

// C24 item 1: realtime resubscribe with exponential backoff. The subscribe() status callbacks null the
// channel handle on error/close and reschedule (capped), so a slept/disconnected phone self-heals instead
// of silently dropping to the 15s poll forever. On (re)subscribe success, one refresh catches missed rows.
function _scheduleResubscribe(kind, resubscribeFn) {
  if (SyncManager.rt.resubTimer[kind]) return; // a resubscribe is already pending
  const attempt = (SyncManager.rt.backoff[kind] = Math.min(SyncManager.rt.backoff[kind] + 1, 6));
  const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000); // 1s,2s,4s,…,cap 30s
  SyncManager.rt.resubTimer[kind] = setTimeout(() => { SyncManager.rt.resubTimer[kind] = null; resubscribeFn(); }, delay);
}
function _handleRealtimeStatus(kind, status, onResubscribed) {
  if (status === 'SUBSCRIBED') {
    SyncManager.rt.backoff[kind] = 0;
    if (SyncManager.rt.resubTimer[kind]) { clearTimeout(SyncManager.rt.resubTimer[kind]); SyncManager.rt.resubTimer[kind] = null; }
    if (typeof onResubscribed === 'function') onResubscribed(); // catch rows missed while disconnected
    return;
  }
  if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
    // Null the handle BEFORE removeChannel: removeChannel synchronously re-fires CLOSED into this same
    // callback, so if the handle were still set it would removeChannel again -> infinite recursion.
    if (kind === 'live') {
      const ch = SyncManager.players.liveChannel;
      SyncManager.players.liveChannel = null;
      try { if (ch) supabaseClient.removeChannel(ch); } catch (_) {}
      _scheduleResubscribe('live', ensureSupabaseLiveSync);
    } else {
      const ch = SyncManager.tournament.liveChannel;
      SyncManager.tournament.liveChannel = null;
      try { if (ch) supabaseClient.removeChannel(ch); } catch (_) {}
      _scheduleResubscribe('tournament', ensureTournamentLiveSync);
    }
  }
}

function ensureSupabaseLiveSync() {
  if (!supabaseClient || SyncManager.players.liveChannel) return;
  try {
    SyncManager.players.liveChannel = supabaseClient
      .channel('athletic-specimen-live-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players' },
        () => {
          queueSupabaseRefresh(800);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'live_state' },
        () => {
          queueSupabaseRefresh(800); // C22 item 1: a co-admin/spectator follows the live night
        }
      )
      .subscribe((status) => _handleRealtimeStatus('live', status, () => queueSupabaseRefresh(800)));
  } catch (err) {
    reportError(err, 'live-sync-subscribe');
  }
}

function ensureAuthorityRefreshHooks() {
  if (SyncManager.hooksBound || !supabaseClient) return;
  SyncManager.hooksBound = true;

  const triggerRefresh = (_reason) => {
    if (!supabaseClient) return;
    if (
      SUPABASE_AUTHORITATIVE &&
      state.sharedSyncState !== SHARED_SYNC_LOCAL_ONLY &&
      state.sharedSyncState !== SHARED_SYNC_PENDING
    ) {
      setSharedSyncState(SHARED_SYNC_PENDING);
      const syncNoticeEl = document.getElementById('js-sync-notice');
      if (syncNoticeEl) syncNoticeEl.innerHTML = buildSharedSyncNoticeHTML();
      else partialRender(); // C24 item 3: background sync repaints stay partial (CLAUDE.md rule)
    }
    ensureSupabaseLiveSync();
    void flushOutbox(); // C22 item 3: retry any queued offline writes on reconnect/focus
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
    // Surgical update so a connectivity drop mid-scroll doesn't rebuild #root
    // and jump the roster on mobile (use partialRender, not full render()).
    const syncNoticeEl = document.getElementById('js-sync-notice');
    if (syncNoticeEl) { syncNoticeEl.innerHTML = buildSharedSyncNoticeHTML(); partialRender(); }
    else render();
  });

  window.addEventListener('pageshow', (event) => {
    if (event && event.persisted) {
      triggerRefresh('pageshow');
    }
  });
}

async function runQueuedSupabaseRefresh() {
  if (!supabaseClient || SyncManager.players.refreshRunning || !SyncManager.players.refreshQueued) return;
  if (SyncManager.players.bootGraceArmed && (Date.now() - SyncManager.bootSyncAt) < BOOT_GRACE_MS) {
    SyncManager.players.bootGraceArmed = false; // C25 item 8 one-shot: init already loaded fresh roster <1.5s ago
    SyncManager.players.refreshQueued = false;
    return;
  }
  SyncManager.players.refreshRunning = true;
  SyncManager.players.refreshQueued = false;
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
    await loadLiveStateFromSupabase(); // C22 item 1: refresh the night (spectators follow the DB)
    saveLocal();
    partialRender();
  } catch (err) {
    console.error('Background Supabase refresh error:', err);
  } finally {
    SyncManager.players.refreshRunning = false;
    if (SyncManager.players.refreshQueued) {
      SyncManager.players.refreshTimer = setTimeout(() => {
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
  SyncManager.groupCatalog.queued = true;
  clearTimeout(SyncManager.groupCatalog.timer);
  SyncManager.groupCatalog.timer = setTimeout(() => {
    void runQueuedGroupCatalogSync();
  }, Math.max(0, Number(delay) || 0));
}

async function runQueuedGroupCatalogSync() {
  if (!canRunAdminSharedBackfill() || SyncManager.groupCatalog.running || !SyncManager.groupCatalog.queued) return;
  SyncManager.groupCatalog.running = true;
  SyncManager.groupCatalog.queued = false;

  try {
    const signature = computeGroupCatalogSyncSignature();
    if (signature && signature === SyncManager.groupCatalog.lastSig) return;
    const wroteAny = await backfillGroupCatalogToSupabase();
    if (signature) SyncManager.groupCatalog.lastSig = signature;
    if (wroteAny) queueSupabaseRefresh();
  } catch (err) {
    console.error('Background group catalog sync error:', err);
  } finally {
    SyncManager.groupCatalog.running = false;
    if (SyncManager.groupCatalog.queued) {
      SyncManager.groupCatalog.timer = setTimeout(() => {
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

  // sort alphabetically by name (A–Z jump strip relies on this)
  filtered.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

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
        `<span class="badge player-group-badge ${groupIndex === 0 ? 'is-primary' : ''}">${escapeHTMLText(groupName)}</span>`
      ).join('')
      : '<span class="small player-group-none">Ungrouped</span>';

    return `
      <div class="player-card ${isSelected ? 'is-selected' : ''}" data-id="${player.id}" data-player-key="${playerKeyValue}">
        <span class="status-pill ${checked ? 'in' : 'out'} player-status-corner">${checked ? 'In' : 'Out'}</span>
        <div class="player-card-main">
          ${state.isAdmin ? `<input type="checkbox" class="player-select" data-id="${player.id}" ${isSelected ? 'checked' : ''} />` : ''}
          <div class="player-card-info">
            <span class="player-name">${player.name}</span>
            <div class="player-meta-row">
              <span class="skill-pill">Skill ${player.skill === 0 ? 'Unset' : player.skill}</span>
              ${groupsDisplayHTML}
            </div>
          </div>
          <div class="player-card-actions">
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
  masterAdminAuthenticated: false, // true only for an owner-role server session
  sharedSyncState: (SUPABASE_AUTHORITATIVE && supabaseClient)
    ? SHARED_SYNC_PENDING
    : SHARED_SYNC_LOCAL_ONLY,
  sharedSyncError: '',
  currentSession: null, // { date, time, location } or null
  lastSharedSyncAt: 0,
  operatorActions: [],
  // Tournament v2 (real Supabase tables — Phase 1+)
  tournaments: [],            // [{id,name,status,match_cap,pool_count,net_count,created_at}]
  activeTournamentId: null,   // selected tournament id (admin)
  tournamentTeams: [],        // teams for the active tournament
  tournamentPools: [],        // pools for the active tournament
  tournamentMatches: [],      // matches for the active tournament
  tournamentPickedTeamId: null, // self-serve: the team this phone picked
  bracketSide: null,          // bracket nav: 'winners' | 'losers' | 'grand_final'
  bracketRound: null,         // bracket nav: which round is shown
  tournamentTabLoading: false,
  tournamentTabError: ''
};

function setSharedSyncState(nextState, errorMessage = '') {
  state.sharedSyncState = nextState;
  state.sharedSyncError = errorMessage || '';
  if (nextState === SHARED_SYNC_LIVE || nextState === SHARED_SYNC_CONFLICT_RESOLVED) {
    state.lastSharedSyncAt = Date.now();
  }
}


// ---------------------------------------------------------------------------
// Tournament v2 data-access layer (real Supabase tables — Phase 1+).
// Additive; all guarded on supabaseClient. Reads return [] on error; writes
// throw so the calling handler can surface the message to the operator.
// ---------------------------------------------------------------------------
async function tdbListTournaments() {
  if (!supabaseClient) return [];
  const { data, error } = await supabaseClient
    .from('tournaments')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { console.error('tdbListTournaments', error); return []; }
  return data || [];
}

async function tdbCreateTournament({ name, match_cap, pool_count, net_count }) {
  if (!supabaseClient) throw new Error('No database connection.');
  const row = {
    name: String(name || '').trim() || 'Untitled Tournament',
    match_cap: Number(match_cap) || 25,
    pool_count: Number(pool_count) || 4,
    net_count: Number(net_count) || 10
  };
  const { data, error } = await supabaseClient
    .from('tournaments').insert([row]).select().single();
  if (error) { console.error('tdbCreateTournament', error); throw error; }
  return data;
}

async function tdbDeleteTournament(id) {
  if (!supabaseClient || !id) return;
  const { error } = await supabaseClient.from('tournaments').delete().eq('id', id);
  if (error) { console.error('tdbDeleteTournament', error); throw error; }
}

async function tdbListTeams(tournamentId) {
  if (!supabaseClient || !tournamentId) return [];
  const { data, error } = await supabaseClient
    .from('teams').select('*')
    .eq('tournament_id', tournamentId)
    .order('created_at', { ascending: true });
  if (error) { console.error('tdbListTeams', error); return []; }
  return data || [];
}

async function tdbAddTeam(tournamentId, name) {
  if (!supabaseClient) throw new Error('No database connection.');
  if (!tournamentId) throw new Error('No tournament selected.');
  const row = { tournament_id: tournamentId, name: String(name || '').trim() };
  if (!row.name) throw new Error('Team name required.');
  const { data, error } = await supabaseClient
    .from('teams').insert([row]).select().single();
  if (error) { console.error('tdbAddTeam', error); throw error; }
  return data;
}

async function tdbDeleteTeam(teamId) {
  if (!supabaseClient || !teamId) return;
  const { error } = await supabaseClient.from('teams').delete().eq('id', teamId);
  if (error) { console.error('tdbDeleteTeam', error); throw error; }
}

async function tdbListPools(tournamentId) {
  if (!supabaseClient || !tournamentId) return [];
  const { data, error } = await supabaseClient
    .from('pools').select('*').eq('tournament_id', tournamentId)
    .order('display_order', { ascending: true });
  if (error) { console.error('tdbListPools', error); return []; }
  return data || [];
}

async function tdbListMatches(tournamentId, phase) {
  if (!supabaseClient || !tournamentId) return [];
  let q = supabaseClient.from('matches').select('*').eq('tournament_id', tournamentId);
  if (phase) q = q.eq('phase', phase);
  const { data, error } = await q.order('queue_order', { ascending: true });
  if (error) { console.error('tdbListMatches', error); return []; }
  return data || [];
}

async function tdbMoveTeamToPool(teamId, poolId) {
  if (!supabaseClient || !teamId) return;
  const { error } = await supabaseClient.from('teams').update({ pool_id: poolId || null }).eq('id', teamId);
  if (error) { console.error('tdbMoveTeamToPool', error); throw error; }
}

// Randomly draw pools: clears existing pools (cascades matches; sets teams.pool_id null),
// creates pool_count pools (A,B,...), shuffles teams, round-robin-assigns them to pools.
async function tdbDrawPools(tournament) {
  if (!supabaseClient || !tournament) throw new Error('No tournament.');
  const cur = (await supabaseClient.from('tournaments').select('status').eq('id', tournament.id).single()).data;
  if (cur && cur.status !== 'setup') throw new Error('Pool play already started — Reset Pools first.');
  const teams = await tdbListTeams(tournament.id);
  if (teams.length < 2) throw new Error('Add at least 2 teams first.');
  for (const p of await tdbListPools(tournament.id)) {
    await supabaseClient.from('pools').delete().eq('id', p.id);
  }
  // Clamp pools so every pool gets at least 2 teams (no 1-team / 0-match pools).
  const poolCount = Math.max(1, Math.min(Number(tournament.pool_count) || 1, Math.floor(teams.length / 2)));
  const poolRows = [];
  for (let i = 0; i < poolCount; i++) {
    const { data, error } = await supabaseClient.from('pools')
      .insert([{ tournament_id: tournament.id, label: String.fromCharCode(65 + i), display_order: i }])
      .select().single();
    if (error) throw error;
    poolRows.push(data);
  }
  const shuffled = teams.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = tmp;
  }
  for (let i = 0; i < shuffled.length; i++) {
    const pool = poolRows[i % poolCount];
    const { error } = await supabaseClient.from('teams').update({ pool_id: pool.id }).eq('id', shuffled[i].id);
    if (error) throw error;
  }
}

// Generate round-robin pool matches, assign nets + per-net queue order, set status='pools'.
async function tdbStartPoolPlay(tournament) {
  if (!supabaseClient || !tournament) throw new Error('No tournament.');
  const cur = (await supabaseClient.from('tournaments').select('status').eq('id', tournament.id).single()).data;
  if (cur && cur.status !== 'setup') throw new Error('Pool play already started — Reset Pools first.');
  const pools = await tdbListPools(tournament.id);
  if (!pools.length) throw new Error('Draw pools first.');
  const teams = await tdbListTeams(tournament.id);
  await supabaseClient.from('matches').delete().eq('tournament_id', tournament.id).eq('phase', 'pool');
  const netCount = Math.max(1, Number(tournament.net_count) || 1);
  const rows = [];
  const queuePerNet = {};
  let k = 0;
  for (const pool of pools) {
    const ids = teams.filter((t) => t.pool_id === pool.id).map((t) => t.id);
    for (const pair of generateRoundRobin(ids)) {
      const net = (k % netCount) + 1;
      queuePerNet[net] = (queuePerNet[net] || 0) + 1;
      rows.push({
        tournament_id: tournament.id, phase: 'pool', pool_id: pool.id,
        team_a_id: pair[0], team_b_id: pair[1], status: 'scheduled',
        net, queue_order: queuePerNet[net], version: 0
      });
      k++;
    }
  }
  if (!rows.length) throw new Error('No pool games to schedule — each pool needs at least 2 teams.');
  const { error } = await supabaseClient.from('matches').insert(rows);
  if (error) throw error;
  await supabaseClient.from('tournaments')
    .update({ status: 'pools', updated_at: new Date().toISOString() }).eq('id', tournament.id);
}

// C25 item 3: before submitting, sanity-check a lopsided score that still passes validation
// (a fat-finger blowout). Empty scores (e.g. tap-to-win bracket) skip the check. Returns false on cancel.
var BIG_MARGIN = 20;
function confirmBigMargin(saStr, sbStr) {
  const aRaw = String(saStr == null ? '' : saStr).trim();
  const bRaw = String(sbStr == null ? '' : sbStr).trim();
  if (aRaw === '' || bRaw === '') return true;                    // no scores entered -> nothing to confirm
  const a = Number(aRaw), b = Number(bRaw);
  if (!Number.isInteger(a) || !Number.isInteger(b)) return true;  // let validateScores surface the error
  if (Math.abs(a - b) < BIG_MARGIN) return true;
  return confirm('That\'s a big margin — submit ' + a + '–' + b + '? Tap Cancel to fix it.');
}

// Submit a match result with optimistic concurrency (CAS on version). Returns the
// updated row, or throws a "another device updated this" message on a version conflict.
async function tdbSubmitResult(match, scoreA, scoreB) {
  if (!supabaseClient || !match) throw new Error('No match.');
  const { sa, sb } = validateScores(scoreA, scoreB);
  const winnerSide = decideWinner(sa, sb);
  if (!winnerSide) throw new Error('Enter both scores; ties are not allowed.');
  // C21: route the write through submit_match_score (the only anon write door under locked RLS).
  // The RPC does the same CAS-final and derives the winner from the scores.
  const { data, error } = await supabaseClient.rpc('submit_match_score', {
    p_match: match.id, p_version: match.version || 0, p_score_a: sa, p_score_b: sb
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

async function tdbClearResult(match) {
  if (!supabaseClient || !match) return;
  const { data, error } = await supabaseClient.from('matches')
    .update({
      score_a: null, score_b: null, winner_team_id: null, loser_team_id: null,
      status: 'scheduled', version: (match.version || 0) + 1, updated_at: new Date().toISOString()
    })
    .eq('id', match.id).eq('version', match.version || 0).select();
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('Another device just updated this match — refreshing.');
  return data[0];
}

// Seed from pool standings + generate + persist a double-elimination bracket.
async function tdbGenerateBracket(tournament) {
  if (!supabaseClient || !tournament) throw new Error('No tournament.');
  const teams = await tdbListTeams(tournament.id);
  const poolMatches = await tdbListMatches(tournament.id, 'pool');
  if (!poolMatches.length) throw new Error('No pool play to seed from.');
  if (!poolMatches.every((m) => m.status === 'final' || !m.team_a_id || !m.team_b_id)) throw new Error('Finish all pool games first.');

  const seeding = computeSeeding(teams, poolMatches); // ordered seed 1..N
  const N = seeding.length;
  if (N < 2) throw new Error('Need at least 2 teams.');
  const seedToTeam = {};
  seeding.forEach((r) => { seedToTeam[r.seed] = r.teamId; });
  const seeds = seeding.map((r) => ({ team_id: r.teamId, seed: r.seed }));

  const gen = generateDoubleElim(N, !!tournament.grand_final_reset);
  const real = gen.realMatches;
  const labelOf = (key) => {
    const m = real.find((x) => x.key === key);
    if (!m) return key;
    if (m.side === 'grand_final') return m.isReset ? 'Grand Final (reset)' : 'Grand Final';
    return `${m.side === 'winners' ? 'WB' : 'LB'} R${m.round} M${m.slot + 1}`;
  };
  const srcLabel = (s) => {
    if (!s || s.seed) return null;
    return (s.type === 'winner' ? 'Winner of ' : 'Loser of ') + labelOf(s.of);
  };

  // Build the full match graph + advancement pointers (referenced by side/round/slot), then
  // persist ATOMICALLY in one transactional RPC — no partially-wired bracket on a mid-failure.
  const keyToPos = {};
  real.forEach((m) => { keyToPos[m.key] = { side: m.side, round: m.round, slot: m.slot }; });
  const slotNum = (s) => (s === 'a' ? 0 : 1);
  const rows = real.map((m) => ({
    side: m.side, round: m.round, slot: m.slot, round_label: labelOf(m.key),
    team_a_id: (m.aSource && m.aSource.seed) ? seedToTeam[m.aSource.seed] : null,
    team_b_id: (m.bSource && m.bSource.seed) ? seedToTeam[m.bSource.seed] : null,
    source_a: srcLabel(m.aSource), source_b: srcLabel(m.bSource),
    winner_next: m.winnerNext ? keyToPos[m.winnerNext.key] : null,
    winner_next_slot: m.winnerNext ? slotNum(m.winnerNext.slot) : null,
    loser_next: m.loserNext ? keyToPos[m.loserNext.key] : null,
    loser_next_slot: m.loserNext ? slotNum(m.loserNext.slot) : null
  }));
  const { error: rpcErr } = await supabaseClient.rpc('generate_bracket_atomic', { p_tournament_id: tournament.id, p_matches: rows, p_seeds: seeds });
  if (rpcErr) throw rpcErr;
}

// Submit a bracket result (tap-to-win default; scores optional). CAS-finals the match,
// advances the winner into winner_next + drops the loser into loser_next, special-cases
// the grand final (reset only if the losers-bracket team wins), and completes the
// tournament when the result is decisive.
async function tdbSubmitBracketResult(match, winnerSide, scoreA, scoreB) {
  if (!supabaseClient || !match) throw new Error('No match.');
  if (!match.team_a_id || !match.team_b_id) throw new Error('Both teams are not set yet.');
  const hasScores = scoreA !== '' && scoreA != null && scoreB !== '' && scoreB != null;
  let sa = null, sb = null;
  if (hasScores) { const v = validateScores(scoreA, scoreB); sa = v.sa; sb = v.sb; }
  let side = (winnerSide === 'a' || winnerSide === 'b') ? winnerSide : null;
  if (!side && hasScores) { const w = decideWinner(sa, sb); side = w ? w.toLowerCase() : null; }
  if (!side) throw new Error('Pick a winner.');
  // The tapped winner and any entered scores must agree.
  if (hasScores) {
    const w = decideWinner(sa, sb);
    if (!w || w.toLowerCase() !== side) throw new Error('The winner you tapped does not match the scores you entered.');
  }
  // C21: route the entire write — CAS-final, guarded winner/loser advancement, grand-final
  // special-case, and tournament completion — through submit_match_score (a faithful server-side
  // port). The only anon write door under locked RLS. p_winner_side carries the tap; any entered
  // scores are passed too (the RPC re-checks they agree with the tap).
  const { data, error } = await supabaseClient.rpc('submit_match_score', {
    p_match: match.id, p_version: match.version || 0,
    p_score_a: hasScores ? sa : null, p_score_b: hasScores ? sb : null,
    p_winner_side: side
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

// Clear a finalized bracket result (admin), CASCADING: reset this match + every downstream
// match that depended on it (recursively), pull the advanced teams back out of the next
// slots, and re-open the tournament if it had completed. Handles deep mistakes, not just
// the most recent tap.
async function tdbClearBracketResult(match) {
  if (!supabaseClient || !match) return;
  // C22 item 7: atomic recursive clear — reset this match + its non-scheduled downstream chain,
  // null the team slots they fed, and re-open the tournament — in ONE SECURITY DEFINER call, so a
  // mid-sequence network blip can't strand the bracket half-cleared. (Faithful port of the prior
  // N-separate-writes cascade; verified on a synthetic bracket.)
  const { error } = await supabaseClient.rpc('clear_bracket_atomic', { p_match: match.id });
  if (error) throw error;
}

// Reload tournament list (+ active tournament's teams/pools/matches) into state. No render.
async function tdbRefreshTournaments() {
  state.tournaments = await tdbListTournaments();
  // Public viewers auto-follow the LIVE/finished tournament (never a fresh 'setup' draft),
  // and a stale follow (deleted tournament) is re-validated.
  if (!state.isAdmin) {
    if (state.activeTournamentId && !state.tournaments.some((t) => t.id === state.activeTournamentId)) {
      state.activeTournamentId = null;
      state.tournamentPickedTeamId = null;
    }
    if (!state.activeTournamentId && state.tournaments.length) {
      const live = state.tournaments.find((t) => t.status === 'pools')
        || state.tournaments.find((t) => t.status === 'bracket')
        || state.tournaments.find((t) => t.status === 'completed') || null;
      state.activeTournamentId = live ? live.id : null;
    }
  }
  if (state.activeTournamentId) {
    // Three independent reads — run concurrently (was 3 serial round-trips per refresh).
    const [tTeams, tPools, tMatches] = await Promise.all([
      tdbListTeams(state.activeTournamentId),
      tdbListPools(state.activeTournamentId),
      tdbListMatches(state.activeTournamentId),
    ]);
    state.tournamentTeams = tTeams;
    state.tournamentPools = tPools;
    state.tournamentMatches = tMatches;
  } else {
    state.tournamentTeams = [];
    state.tournamentPools = [];
    state.tournamentMatches = [];
  }
}

// Surgically re-render only the tournament tab body (preserves other tabs' state).
function partialRenderTournament() {
  const c = document.querySelector('#tab-tournament .container');
  if (c) c.innerHTML = buildTournamentTabHTML();
}

// Background freshness: reload tournament data + surgically re-render the tab so a
// second phone's submission shows up — but NEVER while the operator is mid-entry
// (a focused input/select in the tab would be clobbered).
function tournamentNavVisible() {
  return state.isAdmin || (state.tournaments || []).some((t) => ['pools', 'bracket', 'completed'].includes(t.status));
}

async function refreshTournamentLive() {
  if (SyncManager.tournament.bootGraceArmed && (Date.now() - SyncManager.bootSyncAt) < BOOT_GRACE_MS) {
    SyncManager.tournament.bootGraceArmed = false; // C25 item 8 one-shot: init's tdbRefreshTournaments already loaded
    return;
  }
  const prevNav = tournamentNavVisible();
  if (activeMainTab === 'tournament') {
    const ae = document.activeElement;
    if (ae && ae.closest && ae.closest('#tab-tournament') && /INPUT|SELECT|TEXTAREA/.test(ae.tagName)) return;
    // Don't clobber a half-typed score even after the field blurs.
    const dirty = Array.prototype.some.call(
      document.querySelectorAll('#tab-tournament input[type=number]'), (i) => i.value !== '');
    if (dirty) return;
    await tdbRefreshTournaments();
    if (activeMainTab === 'tournament') partialRenderTournament();
  } else {
    // Off the tab: keep the list fresh so the Tournament nav appears/disappears as events go live.
    state.tournaments = await tdbListTournaments();
    if (tournamentNavVisible() !== prevNav) render();
  }
}

// Coalesce bursts of tournament refreshes (realtime can fire many rows at once) into one.
function queueTournamentRefresh(delay = 800) {
  if (SyncManager.tournament.refreshTimer) clearTimeout(SyncManager.tournament.refreshTimer);
  SyncManager.tournament.refreshTimer = setTimeout(() => { SyncManager.tournament.refreshTimer = null; void refreshTournamentLive(); }, delay);
}

// Realtime: push instant updates when tournament data changes on any device (vs the 15s poll).
function ensureTournamentLiveSync() {
  if (!supabaseClient || SyncManager.tournament.liveChannel) return;
  const ping = () => queueTournamentRefresh(800);
  SyncManager.tournament.liveChannel = supabaseClient
    .channel('athletic-specimen-tournament-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, ping)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tournaments' }, ping)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, ping)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pools' }, ping)
    .subscribe((status) => _handleRealtimeStatus('tournament', status, () => queueTournamentRefresh(800)));
}

// Top-level builders can't see render()'s local escapeHTML; alias to the global escaper.
function escapeHTML(s) { return escapeHTMLText(s); }

function tournamentStatusLabel(status) {
  return ({ setup: 'Setup', pools: 'Pool play', bracket: 'Bracket', completed: 'Completed' })[status] || 'Setup';
}

// ---------------------------------------------------------------------------
// Tournament pure logic (deterministic, no DOM/DB) — Phase 2+.
// ---------------------------------------------------------------------------

// Round-robin via the circle method: every unordered pair exactly once.
// Odd team counts get a rotating bye (no match generated for it).

function buildTeamListHTML(teams, isAdmin) {
  if (!teams || !teams.length) {
    return '<p class="small" style="color:#64748b;margin:0;">No teams yet.</p>';
  }
  return teams.map((tm, i) => `
    <div class="row" style="justify-content:space-between;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">
      <span style="flex:1;">${escapeHTML(String(i + 1))}. ${escapeHTML(tm.name || '')}</span>
      ${isAdmin ? `<button type="button" class="danger" data-role="tv2-delete-team" data-id="${escapeHTML(tm.id)}">Remove</button>` : ''}
    </div>`).join('');
}

function teamNameById(teams, id) {
  const t = (teams || []).find((x) => x.id === id);
  return t ? (t.name || '') : '—';
}

function buildStandingsTableHTML(poolTeams, poolMatches) {
  const rows = computeStandings(poolTeams, poolMatches);
  if (!rows.length) return '';
  return `<table class="table" style="margin:6px 0;font-size:14px;">
    <thead><tr><th>#</th><th>Team</th><th>W-L</th><th>Diff</th></tr></thead>
    <tbody>${rows.map((r) => `<tr>
      <td>${r.rank}</td>
      <td>${escapeHTML(r.name)}</td>
      <td>${r.wins}-${r.losses}</td>
      <td style="color:${r.pointDiff > 0 ? 'var(--success)' : r.pointDiff < 0 ? 'var(--danger)' : 'inherit'};">${r.pointDiff > 0 ? '+' : ''}${r.pointDiff}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

function buildMatchRowHTML(m, teams, isAdmin, canSubmit) {
  const an = escapeHTML(teamNameById(teams, m.team_a_id));
  const bn = escapeHTML(teamNameById(teams, m.team_b_id));
  if (m.status === 'final') {
    const aWin = m.winner_team_id === m.team_a_id;
    return `<div style="padding:8px 0;border-bottom:1px solid var(--border);">
      <div class="small" style="color:#64748b;">Net ${escapeHTML(String(m.net || '-'))} · Final</div>
      <div class="row" style="justify-content:space-between;gap:8px;align-items:center;">
        <span style="flex:1;font-weight:${aWin ? '700' : '400'};color:${aWin ? 'var(--success)' : 'inherit'};">${an}</span>
        <span style="flex:0 0 auto;font-weight:700;">${escapeHTML(String(m.score_a))} - ${escapeHTML(String(m.score_b))}</span>
        <span style="flex:1;text-align:right;font-weight:${!aWin ? '700' : '400'};color:${!aWin ? 'var(--success)' : 'inherit'};">${bn}</span>
      </div>
      ${isAdmin ? `<button type="button" class="secondary" data-role="tv2-clear-result" data-id="${escapeHTML(m.id)}" style="margin-top:4px;font-size:12px;padding:4px 8px;">Clear</button>` : ''}
    </div>`;
  }
  if (!canSubmit) {
    return `<div style="padding:8px 0;border-bottom:1px solid var(--border);">
      <div class="small" style="color:#64748b;">Net ${escapeHTML(String(m.net || '-'))}</div>
      <div class="row" style="justify-content:space-between;gap:8px;">
        <span style="flex:1;min-width:0;">${an}</span>
        <span style="flex:0 0 auto;color:#94a3b8;">vs</span>
        <span style="flex:1;min-width:0;text-align:right;">${bn}</span>
      </div>
    </div>`;
  }
  return `<div style="padding:8px 0;border-bottom:1px solid var(--border);">
    <div class="small" style="color:#64748b;">Net ${escapeHTML(String(m.net || '-'))}</div>
    <div class="row" style="align-items:center;gap:6px;flex-wrap:nowrap;">
      <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${an}</span>
      <input type="number" inputmode="numeric" id="sc-a-${escapeHTML(m.id)}" style="flex:0 0 50px;width:50px;" placeholder="0" />
      <span style="flex:0 0 auto;">-</span>
      <input type="number" inputmode="numeric" id="sc-b-${escapeHTML(m.id)}" style="flex:0 0 50px;width:50px;" placeholder="0" />
      <span style="flex:1;min-width:0;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${bn}</span>
    </div>
    <button type="button" class="primary" data-role="tv2-submit-result" data-id="${escapeHTML(m.id)}" style="margin-top:6px;width:100%;">Submit Result</button>
  </div>`;
}

// "Up next by net" board — the next unplayed match on each net + queue depth.
function buildNetBoardHTML(matches, teams) {
  const live = (matches || []).filter((m) => m.phase === 'pool' && m.status !== 'final' && m.net);
  if (!live.length) return '';
  const byNet = {};
  live.forEach((m) => { (byNet[m.net] = byNet[m.net] || []).push(m); });
  const nets = Object.keys(byNet).map(Number).sort((a, b) => a - b);
  const rows = nets.map((net) => {
    const q = byNet[net].slice().sort((a, b) => (a.queue_order || 0) - (b.queue_order || 0));
    const up = q[0];
    const upTxt = `${escapeHTML(teamNameById(teams, up.team_a_id))} vs ${escapeHTML(teamNameById(teams, up.team_b_id))}`;
    return `<div class="row" style="justify-content:space-between;gap:8px;padding:4px 0;border-bottom:1px solid var(--border);">
      <span style="flex:0 0 auto;font-weight:600;">Net ${net}</span>
      <span style="flex:1;min-width:0;text-align:right;">${upTxt}${q.length > 1 ? ` <span class="small" style="color:#94a3b8;">+${q.length - 1} queued</span>` : ''}</span>
    </div>`;
  }).join('');
  return `<div class="card"><h3 style="margin:0 0 4px;">Up next by net</h3>${rows}</div>`;
}

function buildPoolPlayHTML(tournament, pools, teams, matches, isAdmin, pickedTeamId) {
  const picked = pickedTeamId ? teams.find((t) => t.id === pickedTeamId) : null;
  const visiblePools = (picked && picked.pool_id) ? pools.filter((p) => p.id === picked.pool_id) : pools;
  const picker = `<div class="card">
    <label class="small" style="color:#475569;display:block;margin-bottom:4px;">Your team (pick it to enter your scores)</label>
    <select data-role="tv2-pick-team" style="width:100%;">
      <option value="">All pools</option>
      ${teams.map((t) => `<option value="${escapeHTML(t.id)}" ${t.id === pickedTeamId ? 'selected' : ''}>${escapeHTML(t.name)}</option>`).join('')}
    </select>
    ${(!isAdmin && !pickedTeamId) ? '<p class="small" style="color:#94a3b8;margin:6px 0 0;">Pick your team above to enter your match scores.</p>' : ''}
  </div>`;
  const poolCards = visiblePools.map((pool) => {
    const poolTeams = teams.filter((t) => t.pool_id === pool.id);
    const poolMatches = matches.filter((m) => m.pool_id === pool.id);
    const played = poolMatches.filter((m) => m.status === 'final').length;
    return `<div class="card">
      <h3 style="margin:0 0 2px;">Pool ${escapeHTML(pool.label)}</h3>
      <div class="small" style="color:#64748b;margin:0 0 4px;">${played}/${poolMatches.length} games played</div>
      ${buildStandingsTableHTML(poolTeams, poolMatches)}
      <div style="margin-top:4px;">
        ${poolMatches.length ? poolMatches.map((m) => buildMatchRowHTML(m, teams, isAdmin, isAdmin || (!!pickedTeamId && (m.team_a_id === pickedTeamId || m.team_b_id === pickedTeamId)))).join('') : '<p class="small" style="color:#64748b;margin:0;">No matches.</p>'}
      </div>
    </div>`;
  }).join('');
  return picker + buildNetBoardHTML(matches, teams) + poolCards;
}

// ---- Bracket renderer: single-round-focus (the design Mike picked, mockup #1) ----
function bracketLabelById(matches, id) {
  const m = (matches || []).find((x) => x.id === id);
  return m ? (m.round_label || '') : '';
}

function buildBracketCardHTML(m, matches, teams, canSubmit) {
  const aKnown = !!m.team_a_id, bKnown = !!m.team_b_id;
  const aName = aKnown ? escapeHTML(teamNameById(teams, m.team_a_id)) : `<span style="color:#94a3b8;">${escapeHTML(m.source_a || 'TBD')}</span>`;
  const bName = bKnown ? escapeHTML(teamNameById(teams, m.team_b_id)) : `<span style="color:#94a3b8;">${escapeHTML(m.source_b || 'TBD')}</span>`;
  const winLbl = m.winner_next_match_id ? escapeHTML(bracketLabelById(matches, m.winner_next_match_id)) : 'Champion';
  const loseLbl = m.loser_next_match_id ? ` &nbsp;·&nbsp; Loser → ${escapeHTML(bracketLabelById(matches, m.loser_next_match_id))}` : '';
  const header = `<div class="small" style="color:#64748b;">${escapeHTML(m.round_label || '')}${m.net ? ' · Net ' + escapeHTML(String(m.net)) : ''}${m.status === 'final' ? ' · Final' : ''}</div>`;
  const progression = `<div class="small" style="color:#94a3b8;margin-top:6px;">Winner → ${winLbl}${loseLbl}</div>`;

  let body;
  if (m.status === 'final') {
    const aWin = m.winner_team_id === m.team_a_id;
    const scoreTxt = (m.score_a != null && m.score_b != null) ? `${escapeHTML(String(m.score_a))} - ${escapeHTML(String(m.score_b))}` : '';
    body = `
      <div class="row" style="justify-content:space-between;gap:8px;font-weight:${aWin ? '700' : '400'};color:${aWin ? 'var(--success)' : 'inherit'};">
        <span style="flex:1;min-width:0;">${aName}</span><span style="flex:0 0 auto;">${aWin ? 'Won' : ''}</span>
      </div>
      <div class="row" style="justify-content:space-between;gap:8px;font-weight:${!aWin ? '700' : '400'};color:${!aWin ? 'var(--success)' : 'inherit'};">
        <span style="flex:1;min-width:0;">${bName}</span><span style="flex:0 0 auto;">${!aWin ? 'Won' : ''}</span>
      </div>
      ${scoreTxt ? `<div class="small" style="color:#64748b;margin-top:2px;">${scoreTxt}</div>` : ''}
      ${state.isAdmin ? `<button type="button" class="secondary" data-role="tv2-bracket-clear" data-id="${escapeHTML(m.id)}" style="margin-top:4px;font-size:12px;padding:4px 8px;">Clear</button>` : ''}`;
  } else if (aKnown && bKnown && canSubmit) {
    body = `
      <div class="row" style="align-items:center;gap:6px;">
        <span style="flex:1;min-width:0;">${aName}</span>
        <input type="number" inputmode="numeric" min="0" id="bsc-a-${escapeHTML(m.id)}" style="flex:0 0 42px;width:42px;" placeholder="–" />
        <button type="button" class="primary" data-role="tv2-bracket-win" data-id="${escapeHTML(m.id)}" data-winner="a" style="flex:0 0 auto;padding:6px 12px;">Win</button>
      </div>
      <div class="row" style="align-items:center;gap:6px;margin-top:4px;">
        <span style="flex:1;min-width:0;">${bName}</span>
        <input type="number" inputmode="numeric" min="0" id="bsc-b-${escapeHTML(m.id)}" style="flex:0 0 42px;width:42px;" placeholder="–" />
        <button type="button" class="primary" data-role="tv2-bracket-win" data-id="${escapeHTML(m.id)}" data-winner="b" style="flex:0 0 auto;padding:6px 12px;">Win</button>
      </div>`;
  } else if (aKnown && bKnown) {
    body = `<div class="row" style="justify-content:space-between;gap:8px;"><span style="flex:1;min-width:0;">${aName}</span><span style="flex:0 0 auto;color:#94a3b8;">vs</span><span style="flex:1;min-width:0;text-align:right;">${bName}</span></div>`;
  } else {
    body = `<div style="color:#94a3b8;">${aName}</div><div style="color:#94a3b8;margin-top:2px;">${bName}</div>`;
  }
  return `<div class="card" style="margin-bottom:8px;">${header}${body}${progression}</div>`;
}

function buildBracketHTML(tournament, matches, teams) {
  const main = (matches || []).filter((m) => m.phase === 'main');
  if (!main.length) return '<div class="card"><p class="small" style="color:#64748b;margin:0;">No bracket yet.</p></div>';

  const champ = computeChampion(main, teams);
  const champBanner = champ ? `<div class="card" style="text-align:center;border:2px solid var(--success);background:#f0fdf4;">
    <div class="small" style="color:#16a34a;letter-spacing:.04em;">CHAMPION</div>
    <h2 style="margin:4px 0 0;color:#15803d;">${escapeHTML(champ.name)}</h2>
  </div>` : '';

  // Who can enter a bracket result: admin, or the picked team if it's IN this match.
  const pid = state.tournamentPickedTeamId;
  const canSubmit = (m) => state.isAdmin || (!!pid && (m.team_a_id === pid || m.team_b_id === pid));
  const picker = state.isAdmin ? '' : `<div class="card">
    <label class="small" style="color:#475569;display:block;margin-bottom:4px;">Your team (pick it to enter your scores)</label>
    <select data-role="tv2-pick-team" style="width:100%;">
      <option value="">View only</option>
      ${(teams || []).map((t) => `<option value="${escapeHTML(t.id)}" ${t.id === pid ? 'selected' : ''}>${escapeHTML(t.name)}</option>`).join('')}
    </select>
  </div>`;

  const sideDefs = [['winners', 'Winners'], ['losers', 'Losers'], ['grand_final', 'Final']].filter(([s]) => main.some((m) => m.side === s));
  let side = state.bracketSide;
  if (!sideDefs.some(([s]) => s === side)) side = sideDefs[0][0];
  const sideTabs = `<div class="row" style="gap:6px;margin-bottom:8px;">
    ${sideDefs.map(([s, lbl]) => `<button type="button" data-role="tv2-bracket-side" data-side="${s}" class="${s === side ? 'primary' : 'secondary'}" style="flex:1;">${lbl}</button>`).join('')}
  </div>`;

  // Wide screens (>=700px): the classic column-per-round tree (mockup #3). Phones keep the
  // single-round-focus view below. Switched by viewport width (re-renders on resize).
  if (typeof window !== 'undefined' && window.innerWidth >= 700) {
    const wMatches = main.filter((m) => m.side === side);
    const wRounds = Array.from(new Set(wMatches.map((m) => m.round))).sort((a, b) => a - b);
    const labelFor = (r) => { const s = wMatches.find((m) => m.round === r); return s ? (s.round_label || ('R' + r)).replace(/ M\d+$/, '') : ('R' + r); };
    const columns = wRounds.map((r) => {
      const rm = wMatches.filter((m) => m.round === r).sort((a, b) => a.slot - b.slot);
      return `<div style="flex:0 0 250px;display:flex;flex-direction:column;justify-content:space-around;gap:8px;">
        <div class="small" style="text-align:center;font-weight:600;color:#475569;">${escapeHTML(labelFor(r))}</div>
        ${rm.map((m) => buildBracketCardHTML(m, main, teams, canSubmit(m))).join('')}
      </div>`;
    }).join('');
    return `${champBanner}${sideTabs}${picker}<div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;-webkit-overflow-scrolling:touch;">${columns}</div>`;
  }

  const sideMatches = main.filter((m) => m.side === side);
  const rounds = Array.from(new Set(sideMatches.map((m) => m.round))).sort((a, b) => a - b);
  let round = state.bracketRound;
  if (!rounds.includes(round)) {
    round = rounds.find((r) => sideMatches.some((m) => m.round === r && m.status !== 'final')) || rounds[rounds.length - 1];
  }
  const roundLabelFor = (r) => {
    const sample = sideMatches.find((m) => m.round === r);
    return sample ? (sample.round_label || ('R' + r)).replace(/ M\d+$/, '') : ('R' + r);
  };
  const roundPills = rounds.length > 1 ? `<div style="display:flex;gap:6px;overflow-x:auto;margin-bottom:8px;-webkit-overflow-scrolling:touch;">
    ${rounds.map((r) => `<button type="button" data-role="tv2-bracket-round" data-round="${r}" class="${r === round ? 'primary' : 'secondary'}" style="flex:0 0 auto;white-space:nowrap;font-size:13px;padding:6px 10px;">${escapeHTML(roundLabelFor(r))}</button>`).join('')}
  </div>` : '';

  const roundMatches = sideMatches.filter((m) => m.round === round).sort((a, b) => a.slot - b.slot);
  const cards = roundMatches.map((m) => buildBracketCardHTML(m, main, teams, canSubmit(m))).join('');

  return `${champBanner}${sideTabs}${picker}${roundPills}${cards}`;
}

// Builds the Tournament tab body (admin create/manage, or public read-only).
function buildTournamentTabHTML() {
  const list = state.tournaments || [];
  const active = state.activeTournamentId
    ? list.find((x) => x.id === state.activeTournamentId)
    : null;

  // Public (non-admin) read-only view.
  if (!state.isAdmin) {
    const show = active || list[0];
    if (!show) {
      return `<div class="card" style="text-align:center;padding:2rem;">
        <p style="color:#64748b;margin:0;">No tournament yet. Check back soon.</p>
      </div>`;
    }
    const teams = (active ? state.tournamentTeams : []) || [];
    if (active && show.status === 'pools') {
      return `<div class="card">
        <h3 style="margin:0 0 4px;">${escapeHTML(show.name || '')}</h3>
        <p class="small" style="color:#64748b;margin:0;">Pool play — submit your game results below.</p>
      </div>` + buildPoolPlayHTML(active, state.tournamentPools || [], teams, state.tournamentMatches || [], false, state.tournamentPickedTeamId);
    }
    if (active && (show.status === 'bracket' || show.status === 'completed')) {
      return `<div class="card">
        <h3 style="margin:0 0 4px;">${escapeHTML(show.name || '')}</h3>
        <p class="small" style="color:#64748b;margin:0;">Bracket</p>
      </div>` + buildBracketHTML(active, state.tournamentMatches || [], teams);
    }
    return `<div class="card">
      <h3 style="margin:0 0 4px;">${escapeHTML(show.name || '')}</h3>
      <p class="small" style="color:#64748b;margin:0 0 12px;">${escapeHTML(tournamentStatusLabel(show.status))}</p>
      ${active ? buildTeamListHTML(teams, false) : '<p class="small" style="color:#64748b;margin:0;">Tap a tournament when the admin opens it.</p>'}
    </div>`;
  }

  const err = state.tournamentTabError
    ? `<div class="card" style="border-left:4px solid var(--danger);color:var(--danger);">${escapeHTML(state.tournamentTabError)}</div>`
    : '';

  // Admin, no active tournament → create form + tournament list.
  if (!active) {
    const listHTML = list.length
      ? list.map((x) => `
        <div class="row" style="justify-content:space-between;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">
          <button type="button" data-role="tv2-select-tournament" data-id="${escapeHTML(x.id)}" style="background:none;border:none;text-align:left;flex:1;font-size:16px;color:var(--brand);cursor:pointer;padding:4px 0;">
            ${escapeHTML(x.name || '')} <span class="small" style="color:#64748b;">· ${escapeHTML(tournamentStatusLabel(x.status))}</span>
          </button>
          <button type="button" class="danger" data-role="tv2-delete-tournament" data-id="${escapeHTML(x.id)}">Delete</button>
        </div>`).join('')
      : '<p class="small" style="color:#64748b;margin:0;">No tournaments yet — create your first one above.</p>';
    return `${err}
    <div class="card">
      <h3 style="margin:0 0 8px;">New Tournament</h3>
      <input type="text" id="tv2-name" placeholder="Tournament name (e.g. Summer Slam 6s)" />
      <div style="display:flex;gap:8px;margin-top:8px;">
        <label style="flex:1;display:flex;flex-direction:column;gap:2px;font-size:13px;color:#475569;">Game to
          <input type="number" id="tv2-cap" value="25" min="1" inputmode="numeric" style="width:100%;flex:0 0 auto;" />
        </label>
        <label style="flex:1;display:flex;flex-direction:column;gap:2px;font-size:13px;color:#475569;">Pools
          <input type="number" id="tv2-pools" value="4" min="1" inputmode="numeric" style="width:100%;flex:0 0 auto;" />
        </label>
        <label style="flex:1;display:flex;flex-direction:column;gap:2px;font-size:13px;color:#475569;">Nets
          <input type="number" id="tv2-nets" value="10" min="1" inputmode="numeric" style="width:100%;flex:0 0 auto;" />
        </label>
      </div>
      <button type="button" class="primary" data-role="tv2-create-tournament" style="margin-top:12px;width:100%;">Create Tournament</button>
    </div>
    <div class="card">
      <h3 style="margin:0 0 8px;">Tournaments</h3>
      ${listHTML}
    </div>`;
  }

  // Admin, active tournament.
  const teams = state.tournamentTeams || [];
  const pools = state.tournamentPools || [];
  const matches = state.tournamentMatches || [];
  const headerCard = `<div class="card">
    <div class="row" style="justify-content:space-between;align-items:center;gap:8px;">
      <div style="flex:1;min-width:0;">
        <h3 style="margin:0;">${escapeHTML(active.name || '')}</h3>
        <p class="small" style="color:#64748b;margin:2px 0 0;">${escapeHTML(tournamentStatusLabel(active.status))} · ${teams.length} ${teams.length === 1 ? 'team' : 'teams'} · to ${escapeHTML(String(active.match_cap))} · ${escapeHTML(String(active.pool_count))} pools · ${escapeHTML(String(active.net_count))} nets</p>
      </div>
      <button type="button" class="secondary" data-role="tv2-back">All</button>
    </div>
  </div>`;

  // Bracket stage: single-round-focus renderer (mockup #1).
  if (active.status === 'bracket' || active.status === 'completed') {
    return `${err}${headerCard}${buildBracketHTML(active, matches, teams)}`;
  }

  // Pool-play stage: standings + matches + override + generate bracket when done.
  if (active.status === 'pools') {
    const poolMatches = matches.filter((m) => m.phase === 'pool');
    const allDone = poolMatches.length > 0 && poolMatches.every((m) => m.status === 'final' || !m.team_a_id || !m.team_b_id);
    return `${err}${headerCard}
      ${buildPoolPlayHTML(active, pools, teams, matches, true, state.tournamentPickedTeamId)}
      <div class="card">
        ${allDone
          ? '<button type="button" class="primary" data-role="tv2-generate-bracket" style="width:100%;margin-bottom:8px;">Generate Bracket</button>'
          : '<p class="small" style="color:#64748b;margin:0 0 8px;">Finish all pool games to generate the bracket.</p>'}
        <button type="button" class="danger" data-role="tv2-reset-pools" style="width:100%;">Reset Pools (clear results)</button>
      </div>`;
  }

  // Setup stage: add teams + draw/start pools.
  let poolSetup = '';
  if (teams.length >= 2) {
    if (!pools.length) {
      poolSetup = `<div class="card">
        <h3 style="margin:0 0 8px;">Pools</h3>
        <p class="small" style="color:#64748b;margin:0 0 8px;">Randomly draw ${escapeHTML(String(active.pool_count))} pools from your ${teams.length} teams.</p>
        <button type="button" class="primary" data-role="tv2-draw-pools" style="width:100%;">Draw Pools</button>
      </div>`;
    } else {
      const poolBlocks = pools.map((p) => {
        const pt = teams.filter((t) => t.pool_id === p.id);
        const rows = pt.map((t) => `<div class="row" style="align-items:center;gap:8px;padding:4px 0;">
          <span style="flex:1;min-width:0;">${escapeHTML(t.name)}</span>
          <select data-role="tv2-move-team" data-id="${escapeHTML(t.id)}" style="width:auto;flex:0 0 auto;">
            ${pools.map((pp) => `<option value="${escapeHTML(pp.id)}" ${pp.id === t.pool_id ? 'selected' : ''}>Pool ${escapeHTML(pp.label)}</option>`).join('')}
          </select>
        </div>`).join('');
        return `<div style="margin-bottom:10px;"><strong>Pool ${escapeHTML(p.label)}</strong>${rows || '<p class="small" style="color:#64748b;margin:0;">empty</p>'}</div>`;
      }).join('');
      const unassigned = teams.filter((t) => !t.pool_id).length;
      poolSetup = `<div class="card">
        <h3 style="margin:0 0 8px;">Pools (drawn)</h3>
        ${poolBlocks}
        ${unassigned ? `<p class="small" style="color:var(--danger);margin:0 0 8px;">${unassigned} team(s) unassigned</p>` : ''}
        <button type="button" class="secondary" data-role="tv2-draw-pools" style="width:100%;margin-bottom:8px;">Re-draw randomly</button>
        <button type="button" class="primary" data-role="tv2-start-pools" style="width:100%;">Start Pool Play</button>
      </div>`;
    }
  }
  return `${err}${headerCard}
  <div class="card">
    <h3 style="margin:0 0 8px;">Add Team</h3>
    <div class="row" style="gap:8px;">
      <input type="text" id="tv2-team-name" placeholder="Team name" style="flex:1;" />
      <button type="button" class="primary" data-role="tv2-add-team">Add</button>
    </div>
  </div>
  <div class="card">
    <h3 style="margin:0 0 8px;">Teams (${teams.length})</h3>
    ${buildTeamListHTML(teams, true)}
  </div>
  ${poolSetup}`;
}

function formatLastSharedSyncLabel() {
  if (!state.lastSharedSyncAt) return '';
  try {
    return new Date(state.lastSharedSyncAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
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

  if (state.sharedSyncState === SHARED_SYNC_PENDING) {
    return `<p class="small shared-sync-notice is-pending">Syncing…</p>`;
  }
  if (state.sharedSyncState === SHARED_SYNC_FALLBACK) {
    return `<p class="small shared-sync-notice is-fallback">Local fallback</p>`;
  }
  if (state.sharedSyncState === SHARED_SYNC_LIVE) {
    const at = formatLastSharedSyncLabel();
    return `<p class="small shared-sync-notice is-live">${at ? `Updated ${escapeHTMLText(at)}` : 'Live'}</p>`;
  }
  if (state.sharedSyncState === SHARED_SYNC_CONFLICT_RESOLVED) {
    const at = formatLastSharedSyncLabel();
    return `<p class="small shared-sync-notice is-live">${at ? `Updated ${escapeHTMLText(at)}` : 'Live'}</p>`;
  }
  return '';
}

function canRunAdminSharedBackfill() {
  if (!supabaseClient || !state.isAdmin) return false;
  if (!SUPABASE_AUTHORITATIVE) return true;
  return state.sharedSyncState === SHARED_SYNC_LIVE || state.sharedSyncState === SHARED_SYNC_CONFLICT_RESOLVED;
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
    queueLiveStateSave(); // C22 item 1: mirror the clear to the DB (admin only)
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
  queueLiveStateSave(); // C22 item 1: write-through the shareable night to the DB (admin only)
}

// --- C22 item 1: Live Nets persistence (DB-authoritative, write-through) ----------------------
// The night's SHAREABLE state (generated team keys, court order, "Won" tallies) is persisted to a
// single `live_state` row so it survives a browser clear and a co-admin / spectator sees the same
// night. SKILL data (skill snapshots, fairness summary) is intentionally NOT persisted here — this
// row is anon-readable and skill is admin-only. The admin (a real authenticated session) is the
// SOLE writer; spectators read only. localStorage stays as the write-through cache.
let liveStateSaveTimer = null;
let liveStateHydratedOnce = false;

function queueLiveStateSave(delay = 400) {
  if (!supabaseClient || !state.isAdmin) return; // only a real admin session writes the night
  clearTimeout(liveStateSaveTimer);
  liveStateSaveTimer = setTimeout(() => { void saveLiveStateToSupabase(); }, Math.max(0, Number(delay) || 0));
}

async function saveLiveStateToSupabase() {
  if (!supabaseClient || !state.isAdmin) return;
  try {
    const hasTeams = Array.isArray(state.generatedTeams) && state.generatedTeams.length > 0;
    const teamKeys = serializeGeneratedTeamsForStorage(state.generatedTeams);
    if (hasTeams && !teamKeys) return; // transient invalid state (checked-in mismatch) — don't clobber the DB
    const payload = {
      teamKeys: teamKeys || [],
      courtOrder: Array.isArray(state.liveCourtOrder) ? state.liveCourtOrder : [],
      results: (state.liveMatchResults && typeof state.liveMatchResults === 'object') ? state.liveMatchResults : {}
    };
    const { error } = await supabaseClient
      .from('live_state')
      .upsert({ id: 'current', data: payload, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (error) throw error;
  } catch (err) {
    console.error('live_state save error', err);
  }
}

// Hydrate the night from the DB. The admin's local state is authoritative AFTER their first load
// (so routine re-syncs can't clobber in-progress edits); spectators always follow the DB so they
// see live updates. Returns true if local live state changed. Requires players + checkedIn loaded.
async function loadLiveStateFromSupabase() {
  if (!supabaseClient) return false;
  if (state.isAdmin && liveStateHydratedOnce) return false;
  try {
    const { data, error } = await supabaseClient.from('live_state').select('data').eq('id', 'current').maybeSingle();
    if (error) throw error;
    liveStateHydratedOnce = true;
    const d = (data && data.data) || null;
    if (!d || !Array.isArray(d.teamKeys) || d.teamKeys.length === 0) return false;
    const restored = hydrateGeneratedTeamsFromStoredKeys(d.teamKeys);
    if (!restored) return false; // the checked-in set doesn't match these teams — keep local
    state.generatedTeams = restored;
    state.liveCourtOrder = normalizeLiveCourtOrder(Array.isArray(d.courtOrder) ? d.courtOrder : [], restored.length);
    const matchups = deriveLiveTeamMatchupsFromOrder(state.liveCourtOrder);
    state.liveMatchResults = normalizeLiveMatchResults((d.results && typeof d.results === 'object') ? d.results : {}, matchups.matchups);
    return true;
  } catch (err) {
    console.error('live_state load error', err);
    return false;
  }
}

// --- C22 item 3: durable retry outbox --------------------------------------------------------
// A localStorage queue of check-in/out/register writes that failed (offline / network blip), each
// keyed by an idempotency key so re-enqueues collapse and the latest intent for a key wins. Replayed
// on reconnect (online/focus/visibility) + a timer + on load. The RPCs are idempotent (check_in/out
// set a fixed value; register_player dedups), so replay is safe. mergePlayersAfterSync overlays the
// queued attendance intents so a pending check-in/out survives a sync until it lands.
const LS_OUTBOX_KEY = 'athletic_specimen_outbox';
let outboxFlushing = false;

function outboxLoad() {
  try { const a = JSON.parse(localStorage.getItem(LS_OUTBOX_KEY) || '[]'); return Array.isArray(a) ? a : []; }
  catch { return []; }
}
function outboxSave(ops) {
  try { localStorage.setItem(LS_OUTBOX_KEY, JSON.stringify((ops || []).slice(0, 200))); } catch {}
}
function outboxEnqueue(op) {
  if (!op || !op.key) return;
  const ops = outboxLoad().filter((o) => o && o.key !== op.key); // collapse: latest intent for a key wins
  ops.push(op);
  outboxSave(ops);
}
function outboxRemove(key) {
  outboxSave(outboxLoad().filter((o) => o && o.key !== key));
}
// Queued attendance intents, as player-id sets, for the sync merge to overlay onto checkedIn.
function outboxAttendanceIntents() {
  const inSet = new Set(), outSet = new Set();
  for (const o of outboxLoad()) {
    const id = (o && o.payload && o.payload.p_id) ? String(o.payload.p_id) : '';
    if (!id) continue;
    if (o.kind === 'check_in') { inSet.add(id); outSet.delete(id); }
    else if (o.kind === 'check_out') { outSet.add(id); inSet.delete(id); }
  }
  return { inSet, outSet };
}

// Replay queued writes against the (idempotent) RPCs; drop each one that lands, keep the rest.
async function flushOutbox() {
  if (!supabaseClient || outboxFlushing) return;
  const ops = outboxLoad();
  if (!ops.length) return;
  outboxFlushing = true;
  const before = ops.length;
  try {
    for (const op of ops) {
      try {
        let res = null;
        if (op.kind === 'check_in') res = await supabaseClient.rpc('check_in', { p_id: op.payload.p_id });
        else if (op.kind === 'check_out') res = await supabaseClient.rpc('check_out', { p_id: op.payload.p_id });
        else if (op.kind === 'register') res = await supabaseClient.rpc('register_player', { p_name: op.payload.name, p_group: op.payload.group || '' });
        else { outboxRemove(op.key); continue; }
        if (res && res.error) throw res.error;
        outboxRemove(op.key); // landed
      } catch { /* still failing (offline?) — keep queued, retry next flush */ }
    }
  } finally {
    outboxFlushing = false;
    if (outboxLoad().length < before) queueSupabaseRefresh(300); // reflect the writes that landed
  }
}

// Lightweight floating toast whose text reflects the real async-save outcome
// (honest status) — created with a neutral "Saving…" then settled to a result.
function makeSaveToast(text) {
  try {
    const t = document.createElement('div');
    t.textContent = text;
    t.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:#111;color:#fff;padding:8px 12px;border-radius:8px;z-index:10000;font-size:14px;';
    document.body.appendChild(t);
    return t;
  } catch { return null; }
}
function settleSaveToast(t, ok, okText) {
  if (!t) return;
  try {
    t.textContent = ok ? (okText || 'Saved') : 'Could not save — check your connection';
    setTimeout(() => { try { t.remove(); } catch {} }, ok ? 1200 : 2600);
  } catch {}
}

// Load players and checked-in attendance keys from localStorage into state. Called
// during initialization.
function loadLocal() {
  let shouldPersistMigration = false;
  try {
    const storedPlayers = JSON.parse(localStorage.getItem(LS_PLAYERS_KEY) || '[]');
    // Strip stale `pending` flags: a row persisted in a prior session is no longer
    // an in-flight write. If it never saved, mergePlayersAfterSync's remote-name
    // filter drops it; if it did, sync returns it with an id. Prevents permanent
    // "Registering…" ghost cards. See reliability check 2026-06-18.
    if (Array.isArray(storedPlayers)) {
      state.players = storedPlayers.map((p) => {
        if (p && p.pending) { const { pending, ...rest } = p; return rest; }
        return p;
      });
    }
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

    // C21: admin state is NEVER restored from storage — it derives only from a live Supabase
    // session. With persistSession=false there is none on load, so always start logged-out.
    state.isAdmin = false;
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

  // C21: no code load + no admin-scope restore from storage. Admin state (isAdmin /
  // masterAdminAuthenticated / limitedGroup) comes only from a live server session, set on
  // login and cleared by logout / onAuthStateChange. Start logged-out (defaults already false/null).

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
    // Carry forward in-flight local rows (pending writes) so a background sync that
    // races an insert can't wipe a just-registered/added player before the server has
    // it yet. Each pending row is dropped automatically once its name appears remotely.
    const remoteNamesAuth = new Set(
      cleanedRemotePlayers.map((p) => normalize(p && p.name)).filter(Boolean)
    );
    const prevCheckedAuth = new Set(state.checkedIn || []);
    const pendingLocal = (Array.isArray(state.players) ? state.players : []).filter((p) =>
      p && !p.id && p.pending && normalize(p.name) && !remoteNamesAuth.has(normalize(p.name)) &&
      (!state.limitedGroup || getPlayerPrimaryGroup(p) === state.limitedGroup)
    );
    const pendingChecked = pendingLocal
      .map((p) => playerIdentityKey(p))
      .filter((k) => k && prevCheckedAuth.has(k));
    // C22 item 3: overlay queued (offline) attendance intents so a pending check-in/out survives a
    // sync until the outbox flushes it to the DB. Additive — a no-op when the outbox is empty.
    const mergedChecked = new Set([...remoteChecked, ...pendingChecked]);
    const intents = outboxAttendanceIntents();
    if (intents.inSet.size || intents.outSet.size) {
      const keyById = new Map();
      cleanedRemotePlayers.forEach((p) => { if (p && p.id) keyById.set(String(p.id), playerIdentityKey(p)); });
      intents.inSet.forEach((id) => { const k = keyById.get(id); if (k) mergedChecked.add(k); });
      intents.outSet.forEach((id) => { const k = keyById.get(id); if (k) mergedChecked.delete(k); });
    }
    return {
      players: [...cleanedRemotePlayers, ...pendingLocal],
      checkedIn: [...mergedChecked]
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
  const requestSeq = ++SyncManager.players.requestSeq;

  try {
    if (
      SUPABASE_AUTHORITATIVE &&
      state.sharedSyncState !== SHARED_SYNC_LIVE &&
      state.sharedSyncState !== SHARED_SYNC_CONFLICT_RESOLVED
    ) {
      setSharedSyncState(SHARED_SYNC_PENDING);
    }
    if (!HAS_GROUP && !HAS_TAG) {
      await detectPlayersSchema();
    }

    // when tenant-limited, only fetch that group to reduce data exposure and payload size
    // Explicit columns (not select('*')) to trim payload + avoid pulling unused/future cols.
    // Schema-aware: only request group/tag when the probe confirmed they exist.
    // C21: skill is ADMIN-ONLY. Only request it when a real admin session exists; anon must
    // never fetch it (the DB also REVOKEs SELECT(skill) from anon, so requesting it as anon errors).
    const playerCols = ['id', 'name', 'checked_in'];
    if (state.isAdmin) playerCols.push('skill');
    if (HAS_GROUP) playerCols.push('group');
    if (HAS_TAG) playerCols.push('tag');
    let query = supabaseClient.from('players').select(playerCols.join(','));

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
      if (requestSeq < SyncManager.players.requestSeq || requestSeq < SyncManager.players.appliedSeq) {
        return false;
      }
      if (SUPABASE_AUTHORITATIVE) {
        setSharedSyncState(SHARED_SYNC_FALLBACK, 'Supabase fetch failed. Showing local cache.');
      }
      return false;
    }
    if (!Array.isArray(fetchedData)) {
      if (requestSeq < SyncManager.players.requestSeq || requestSeq < SyncManager.players.appliedSeq) {
        return false;
      }
      if (SUPABASE_AUTHORITATIVE) {
        setSharedSyncState(SHARED_SYNC_FALLBACK, 'Unexpected Supabase response. Showing local cache.');
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
    }

    const remoteGroupCatalog = [];
    const remotePlayers = [];
    data.forEach((p) => {
      if (isTournamentStateRow(p)) {
        return; // skip the legacy tournament-state blob row (not a player)
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
    if (requestSeq < SyncManager.players.requestSeq || requestSeq < SyncManager.players.appliedSeq) {
      return true;
    }

    // C22 item 8: the group catalog now lives in the `groups` table (was `__as_group__:` player rows).
    // Source remoteGroupCatalog from it; the per-row parseGroupCatalogRowName skip in the loop above
    // stays as a defensive filter for any straggler sentinel row.
    try {
      const catalogTableRows = await listGroupCatalogRowsSupabase();
      catalogTableRows.forEach((row) => { if (row && row.name) remoteGroupCatalog.push(row.name); });
    } catch (groupsErr) {
      console.error('Supabase groups table read error', groupsErr);
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
    SyncManager.players.appliedSeq = Math.max(SyncManager.players.appliedSeq, requestSeq);
    if (SUPABASE_AUTHORITATIVE) {
      setSharedSyncState(SHARED_SYNC_LIVE);
    }
    return true;
  } catch (err) {
    console.error('Error syncing from Supabase', err);
    if (requestSeq < SyncManager.players.requestSeq || requestSeq < SyncManager.players.appliedSeq) {
      return false;
    }
    if (SUPABASE_AUTHORITATIVE) {
      const fallbackDetail = navigator.onLine
        ? 'Sync failed while online. Showing local cache.'
        : 'Offline. Showing local cache.';
      setSharedSyncState(SHARED_SYNC_FALLBACK, fallbackDetail);
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
  // C22 item 8: the group catalog lives in a real `groups` table (was `__as_group__:` player rows).
  const { data, error } = await supabaseClient
    .from('groups')
    .select('id,name');
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function ensureGroupCatalogEntrySupabase(groupName) {
  if (!supabaseClient) return false;
  const normalized = normalizeGroupName(groupName);
  if (!normalized) return false;
  const targetKey = normalizeGroupKey(normalized);

  try {
    // C22 item 8: catalog rows are now plain-name rows in the `groups` table.
    const catalogRows = await listGroupCatalogRowsSupabase();
    const matchingRows = catalogRows.filter((row) => row && normalizeGroupKey(row.name) === targetKey);

    if (matchingRows.length) {
      const existingRow = matchingRows[0];
      // keep the latest-entered casing as the display name (parity with the old behavior)
      if (existingRow.name !== normalized) {
        const { error: updateError } = await supabaseClient
          .from('groups')
          .update({ name: normalized })
          .eq('id', existingRow.id);
        if (updateError) throw updateError;
      }

      const duplicateIds = matchingRows
        .slice(1)
        .map((row) => row && row.id)
        .filter(Boolean);
      for (const duplicateId of duplicateIds) {
        const { error: deleteError } = await supabaseClient
          .from('groups')
          .delete()
          .eq('id', duplicateId);
        if (deleteError) {
          console.error('Supabase group catalog duplicate delete error', deleteError);
        }
      }
      return true;
    }

    const { error: insertError } = await supabaseClient.from('groups').insert([{ name: normalized }]);
    if (insertError) {
      if (insertError.code === '23505') return true; // ci-unique race: already exists
      throw insertError;
    }
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
    // C22 item 8: catalog rows are now plain-name rows in the `groups` table.
    const catalogRows = await listGroupCatalogRowsSupabase();
    const matchingIds = catalogRows
      .filter((row) => row && normalizeGroupKey(row.name) === targetKey)
      .map((row) => row && row.id)
      .filter(Boolean);

    if (!matchingIds.length) return true;

    let failed = false;
    for (const id of matchingIds) {
      const { error } = await supabaseClient
        .from('groups')
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
    membershipsBackfilled: false
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

  const synced = await syncFromSupabase();
  if (synced) saveLocal();
  return summary;
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
  const escapeHTML = (str) => String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
  <div class="team-size-label">Team size — tap to build teams of that size</div>
  <div class="team-size-chips">
    ${[2, 3, 4, 6].map((sz) => {
      const n = Math.floor(state.checkedIn.length / sz);
      const active = state.lastTeamSize === sz ? ' is-active' : '';
      return `<button type="button" class="team-size-chip${active}" data-team-size="${sz}">
        <strong>${sz}s</strong>
        <span>${n} ${n === 1 ? 'team' : 'teams'}</span>
      </button>`;
    }).join('')}
  </div>
  <div class="row generate-teams-controls">
    <label class="generate-teams-count">
      Teams:
      <input type="number" id="group-count" min="2" value="${escapeHTML(String(state.groupCount))}" />
    </label>
    <button id="btn-generate-teams">Generate</button>
  </div>
  ${teamsFairnessHTML}
  ${teamsHTML}
  ${liveMatchupsHTML ? `<div class="live-nets-collapsible">
    <button type="button" class="live-nets-toggle" data-role="toggle-live-nets" aria-expanded="${state.liveNetsCollapsed === false ? 'true' : 'false'}">
      <span>Live Nets</span>
      <span class="live-nets-caret">${state.liveNetsCollapsed === false ? '▾ Hide' : '▸ Show'}</span>
    </button>
    <div class="live-nets-body${state.liveNetsCollapsed === false ? '' : ' is-collapsed'}">
      ${liveMatchupsHTML}
    </div>
  </div>` : ''}
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
          <button id="btn-reset-checkins" class="danger">New session</button>
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

  <!-- A–Z jump strip (iOS Contacts style) — pinned to right edge of Players tab -->
  <div class="players-az-strip" role="navigation" aria-label="Jump to letter">
    ${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(L =>
      `<button type="button" class="az-letter" data-letter="${L}" aria-label="Jump to ${L}">${L}</button>`
    ).join('')}
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
      <input type="text" id="check-name" placeholder="First and Last Name" autocapitalize="words" autocomplete="off" spellcheck="false" />
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
        <input type="text" id="admin-player-name" placeholder="Name" autocapitalize="words" autocomplete="off" spellcheck="false" />
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
      <h2>Admin Login</h2>
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
    <input type="text" id="check-name" placeholder="First and Last Name" autocapitalize="words" autocomplete="off" spellcheck="false" />
    <div class="row checkin-actions">
      <button id="btn-check-in">Check In</button>
      <button id="btn-check-out">Check Out</button>
    </div>
    ${checkMsg}
  </div>

  <div class="card card-register">
    <h2>Register Player</h2>
    <input type="text" id="register-name" placeholder="First and Last Name" autocapitalize="words" autocomplete="off" spellcheck="false" />
    <button id="btn-register">Register</button>
    ${regMsg}
  </div>
  </div>
  ` : '';

  const html = `
<div id="app-shell">
  <header id="app-header">
    <div class="app-header-top-row">
      <div class="app-header-brand">${state.limitedGroup ? escapeHTML(state.limitedGroup) : 'Athletic Specimen'}</div>
      <div id="js-sync-notice">${sharedSyncNoticeHTML}</div>
    </div>
    <div class="app-header-version">v${APP_VERSION}</div>
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
    <div id="tab-tournament" class="tab-panel">
      <div class="container">
        ${buildTournamentTabHTML()}
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
    </button>` : ''}
    ${(state.isAdmin || (state.tournaments || []).some((t) => t.status === 'pools' || t.status === 'bracket' || t.status === 'completed')) ? `
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
  font-size: 18px;
  font-weight: 700;
  line-height: 1;
  color: #2563eb;
  background: #e0e7ff;
  border: none;
  border-radius: 8px;
  width: 40px;
  height: 40px;
  min-height: 40px;
  min-width: 40px;
  padding: 0;
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

/* Dropdown only jumps above the rest of the UI when it's actually open */
.menu-wrap.menu-open,
.menu-wrap.menu-open .card-menu,
.menu-wrap.menu-open .btn-actions {
  z-index: 10000;
}
.card-menu, .menu-item { pointer-events: auto; }
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
bindTournamentTabV2();
bindPlayerRowHandlers();
bindSelectionHandlers();
updateBulkBarVisibility();
if (!state.isAdmin && activeMainTab === 'teams') activeMainTab = 'players';
activateMainTab(activeMainTab);
restoreTransientInteractionState(interactionSnapshot);
refreshAzStripAvailability();
void root.offsetHeight;
const restoredPanel = document.getElementById('tab-' + activeMainTab);
if (savedScrollY > 0 && restoredPanel) restoredPanel.scrollTop = savedScrollY;
}

// Attach event listeners to the current DOM. This function should be
// called after each call to render().
// Tournament v2 tab — delegated, once-bound click handler for tv2-* actions.
let _tv2Bound = false;
function bindTournamentTabV2() {
  if (_tv2Bound) return;
  _tv2Bound = true;
  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-role^="tv2-"]');
    if (!el) return;
    const role = el.getAttribute('data-role');
    const id = el.getAttribute('data-id') || '';
    try {
      state.tournamentTabError = '';
      if (role === 'tv2-create-tournament') {
        const val = (sel) => (document.getElementById(sel) || {}).value || '';
        const created = await tdbCreateTournament({
          name: val('tv2-name'), match_cap: val('tv2-cap'),
          pool_count: val('tv2-pools'), net_count: val('tv2-nets')
        });
        state.activeTournamentId = created.id;
        await tdbRefreshTournaments();
        render();
      } else if (role === 'tv2-select-tournament') {
        state.activeTournamentId = id;
        await tdbRefreshTournaments();
        render();
      } else if (role === 'tv2-back') {
        state.activeTournamentId = null;
        state.tournamentTeams = [];
        render();
      } else if (role === 'tv2-delete-tournament') {
        if (!state.isAdmin) return; // defense-in-depth re-check (real server gate = C21)
        if (!window.confirm('Delete this tournament and everything in it?')) return;
        await tdbDeleteTournament(id);
        if (state.activeTournamentId === id) state.activeTournamentId = null;
        await tdbRefreshTournaments();
        render();
      } else if (role === 'tv2-add-team') {
        const nameEl = document.getElementById('tv2-team-name');
        await tdbAddTeam(state.activeTournamentId, (nameEl || {}).value || '');
        await tdbRefreshTournaments();
        render();
      } else if (role === 'tv2-delete-team') {
        const t = state.tournaments.find((x) => x.id === state.activeTournamentId);
        if (t && t.status !== 'setup') throw new Error('Teams are locked once pool play starts.');
        await tdbDeleteTeam(id);
        await tdbRefreshTournaments();
        render();
      } else if (role === 'tv2-draw-pools') {
        const t = state.tournaments.find((x) => x.id === state.activeTournamentId);
        await tdbDrawPools(t);
        await tdbRefreshTournaments();
        render();
      } else if (role === 'tv2-start-pools') {
        const t = state.tournaments.find((x) => x.id === state.activeTournamentId);
        await tdbStartPoolPlay(t);
        await tdbRefreshTournaments();
        render();
      } else if (role === 'tv2-reset-pools') {
        if (!state.isAdmin) return; // defense-in-depth re-check (real server gate = C21)
        if (!window.confirm('Reset pools and clear all pool results?')) return;
        const t = state.tournaments.find((x) => x.id === state.activeTournamentId);
        await tdbDrawPools(t);
        await supabaseClient.from('tournaments')
          .update({ status: 'setup', updated_at: new Date().toISOString() }).eq('id', t.id);
        await tdbRefreshTournaments();
        render();
      } else if (role === 'tv2-generate-bracket') {
        const t = state.tournaments.find((x) => x.id === state.activeTournamentId);
        await tdbGenerateBracket(t);
        state.tournamentPickedTeamId = null;
        state.bracketSide = null; state.bracketRound = null;
        await tdbRefreshTournaments();
        render();
      } else if (role === 'tv2-bracket-side') {
        state.bracketSide = el.getAttribute('data-side');
        state.bracketRound = null;
        partialRenderTournament();
      } else if (role === 'tv2-bracket-round') {
        state.bracketRound = Number(el.getAttribute('data-round'));
        partialRenderTournament();
      } else if (role === 'tv2-bracket-win') {
        const m = (state.tournamentMatches || []).find((x) => x.id === id);
        const pid = state.tournamentPickedTeamId;
        if (!(state.isAdmin || (m && pid && (m.team_a_id === pid || m.team_b_id === pid)))) {
          throw new Error('Pick your team to enter this result.');
        }
        const sa = (document.getElementById('bsc-a-' + id) || {}).value;
        const sb = (document.getElementById('bsc-b-' + id) || {}).value;
        if (!confirmBigMargin(sa, sb)) return;
        await tdbSubmitBracketResult(m, el.getAttribute('data-winner'), sa, sb);
        await tdbRefreshTournaments();
        render();
      } else if (role === 'tv2-bracket-clear') {
        const m = (state.tournamentMatches || []).find((x) => x.id === id);
        await tdbClearBracketResult(m);
        await tdbRefreshTournaments();
        render();
      } else if (role === 'tv2-submit-result') {
        const m = (state.tournamentMatches || []).find((x) => x.id === id);
        const sa = (document.getElementById('sc-a-' + id) || {}).value;
        const sb = (document.getElementById('sc-b-' + id) || {}).value;
        if (!confirmBigMargin(sa, sb)) return;
        await tdbSubmitResult(m, sa, sb);
        await tdbRefreshTournaments();
        render();
      } else if (role === 'tv2-clear-result') {
        const m = (state.tournamentMatches || []).find((x) => x.id === id);
        await tdbClearResult(m);
        await tdbRefreshTournaments();
        render();
      }
    } catch (err) {
      state.tournamentTabError = (err && err.message) ? err.message : 'Something went wrong.';
      render();
    }
  });

  // Selects fire 'change', not 'click' — handle team-move + team-pick here.
  document.addEventListener('change', async (e) => {
    const el = e.target.closest('[data-role="tv2-move-team"], [data-role="tv2-pick-team"]');
    if (!el) return;
    const role = el.getAttribute('data-role');
    try {
      state.tournamentTabError = '';
      if (role === 'tv2-move-team') {
        await tdbMoveTeamToPool(el.getAttribute('data-id'), el.value);
        await tdbRefreshTournaments();
        render();
      } else if (role === 'tv2-pick-team') {
        state.tournamentPickedTeamId = el.value || null;
        render();
      }
    } catch (err) {
      state.tournamentTabError = (err && err.message) ? err.message : 'Something went wrong.';
      render();
    }
  });

  // Re-render the bracket when crossing the wide/narrow (700px) breakpoint (tree <-> single-round).
  let lastWide = typeof window !== 'undefined' && window.innerWidth >= 700;
  window.addEventListener('resize', debounce(() => {
    const wide = window.innerWidth >= 700;
    if (wide !== lastWide) { lastWide = wide; if (activeMainTab === 'tournament') render(); }
  }, 150));
}

function activateMainTab(tab) {
  activeMainTab = tab;
  sessionStorage.setItem('as_main_tab', tab);
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + tab));
  document.querySelectorAll('#bottom-nav .nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.navTab === tab));
  window.dispatchEvent(new Event('as-tab-changed')); // C25 item 5: refresh back-to-top visibility for the new panel
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
  document.body.style.overflow = 'hidden'; // lock background scroll so the page doesn't scroll under the modal on iOS
};
const closePopup = (popupId) => {
  const popup = document.getElementById(popupId);
  if (!popup) return;
  popup.style.display = 'none';
  popup.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
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
  // Size the QR to fit the phone so it doesn't overflow the modal off-screen to the right
  const qrSize = Math.max(220, Math.min(340, window.innerWidth - 96));
  new QRCode(container, {
    text: 'https://athletic-specimen-app.vercel.app/checkin.html',
    width: qrSize,
    height: qrSize,
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
  const closeGroupManager = () => { gmRoot.style.display = 'none'; document.body.style.overflow = ''; };
  gmOpen.addEventListener('click', () => {
    gmPopulate();
    gmRoot.style.display = 'block';
    document.body.style.overflow = 'hidden'; // lock background scroll on iOS
  });
  const gmClose = gmRoot.querySelector('#btn-close-group-manager');
  if (gmClose) gmClose.addEventListener('click', closeGroupManager);
  // Tap the dark backdrop (the overlay itself) to close, matching the other modals
  gmRoot.addEventListener('click', (e) => { if (e.target === gmRoot) closeGroupManager(); });

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
const adminCodeInputForEnter = document.getElementById('admin-code');
if (adminCodeInputForEnter && loginBtn) {
  adminCodeInputForEnter.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); loginBtn.click(); }
  });
}

// C21 — server-verified admin login (the ONLY login path). POSTs only the code to the admin_login
// Edge Function, which checks it against a server-only map (NOT in this bundle) and returns a real
// Supabase session whose JWT carries role/group in app_metadata (for RLS). On success the session
// is set on supabaseClient (in-memory; persistSession=false) so every later admin request carries
// the JWT. Returns {role, group}, or null on a wrong code / unreachable function.
async function adminLoginWithCode(code) {
  if (!supabaseClient || !code) return null;
  try {
    const { data, error } = await supabaseClient.functions.invoke('admin_login', { body: { code } });
    if (error || !data || !data.access_token || !data.refresh_token) return null;
    const setRes = await supabaseClient.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    });
    if (setRes.error) return null;
    return { role: data.role, group: data.group || null };
  } catch {
    return null;
  }
}

if (loginBtn) {
  loginBtn.addEventListener('click', async () => {
    const codeInput = document.getElementById('admin-code');
    const code = codeInput ? codeInput.value.trim() : '';
    if (!code) return;

    // C21: the ONLY login path — server-verified. adminLoginWithCode returns {role, group} and
    // has set a real Supabase session, or null on a wrong code / unreachable function. There is
    // no client-side code compare and no fallback: the JWT is the source of truth for admin state.
    const session = await adminLoginWithCode(code);
    if (!session) { alert('Incorrect admin code'); return; }
    if (codeInput) codeInput.value = '';

    state.isAdmin = true;
    state.masterAdminAuthenticated = (session.role === 'owner');
    state.limitedGroup = (session.role === 'group_admin') ? session.group : null;
    state.activeGroup = state.limitedGroup || 'All';
    if (state.limitedGroup && !state.groups.includes(state.limitedGroup)) {
      state.groups = Array.from(new Set([...state.groups, state.limitedGroup]));
    }
    // sessionStorage flags are in-tab UI continuity only (NOT trusted on load — see loadFromLocal).
    sessionStorage.setItem(LS_ADMIN_KEY, 'true');
    if (state.masterAdminAuthenticated) sessionStorage.setItem(LS_MASTER_ADMIN_AUTH_KEY, 'true');
    else sessionStorage.removeItem(LS_MASTER_ADMIN_AUTH_KEY);
    if (state.limitedGroup) sessionStorage.setItem(LS_LIMITED_GROUP_KEY, state.limitedGroup);
    else sessionStorage.removeItem(LS_LIMITED_GROUP_KEY);
    try { localStorage.setItem(LS_ACTIVE_GROUP_KEY, state.activeGroup); } catch {}

    const synced = await syncFromSupabase();   // re-fetch as the authenticated admin (incl. skill)
    if (synced) saveLocal();
    // C22 item 1: re-hydrate the night now that players carry skill — an anon init hydrate built the
    // teams from skill-less player objects, so fairness totals would read 0 until this re-maps them.
    liveStateHydratedOnce = false;
    if (synced) { await loadLiveStateFromSupabase(); saveLocal(); }
    if (synced && canRunAdminSharedBackfill()) {
      (async () => {
        const catalogSynced = await backfillGroupCatalogToSupabase();
        const membershipsSynced = await backfillPlayerMembershipsToSupabase();
        if (catalogSynced || membershipsSynced) queueSupabaseRefresh();
      })();
    }
    render();
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
    // C21: drop the real Supabase session too (local scope), so the JWT does not linger anywhere.
    if (supabaseClient) { try { await supabaseClient.auth.signOut({ scope: 'local' }); } catch {} }
    const synced = await syncFromSupabase();     // load public view dataset
    if (synced) saveLocal();
    render();
  });
}

// C21: follow the real session. If it ever ends while the UI still thinks it's admin — an explicit
// signOut, or a failed token refresh — drop admin state so the UI can't show admin without a JWT.
if (supabaseClient && supabaseClient.auth && typeof supabaseClient.auth.onAuthStateChange === 'function') {
  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (!session && state.isAdmin) {
      state.isAdmin = false;
      state.masterAdminAuthenticated = false;
      state.limitedGroup = null;
      state.activeGroup = 'All';
      try { render(); } catch {}
    }
  });
}

const saveSupabaseBtn = document.getElementById('btn-save-supabase');
if (saveSupabaseBtn) {
  saveSupabaseBtn.addEventListener('click', async () => {
    if (SyncManager.forceSaveRunning) return;
    if (!supabaseClient) {
      alert('Supabase is not configured for this app.');
      return;
    }

    SyncManager.forceSaveRunning = true;
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
      alert(`Saved to Supabase. ${pieces.join(' | ')}`);
    } catch (err) {
      console.error('Manual save to Supabase error', err);
      alert('Save to Supabase failed. Check connection and try again.');
    } finally {
      SyncManager.forceSaveRunning = false;
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

      // Honest save status (created before the branch, settled when the write resolves).
      const addOkText = isNew ? 'Player added' : 'Player updated';
      const addToast = makeSaveToast(supabaseClient ? 'Saving…' : addOkText);
      if (!supabaseClient && addToast) setTimeout(() => { try { addToast.remove(); } catch {} }, 1200);

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
            let ok = false;
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
              if (remoteOK) { ok = true; queueSupabaseRefresh(); }
              else await reconcileToSupabaseAuthority('admin-save-player-update');
            } catch (err) {
              console.error('Supabase update error', err);
              await reconcileToSupabaseAuthority('admin-save-player-update');
            }
            settleSaveToast(addToast, ok, addOkText);
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
        // pending:true survives a racing sync until the insert lands (mergePlayersAfterSync).
        const inserted = { ...newPlayer, pending: true };
        state.players = [...state.players, inserted];

        if (supabaseClient) {
          (async () => {
            let ok = false;
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
              inserted.pending = false;
              if (remoteOK) { ok = true; queueSupabaseRefresh(); }
              else await reconcileToSupabaseAuthority('admin-save-player-insert');
            } catch (err) {
              console.error('Supabase insert error', err);
              inserted.pending = false;
              await reconcileToSupabaseAuthority('admin-save-player-insert');
            }
            settleSaveToast(addToast, ok, 'Player added');
          })();
        } else {
          // Offline: no client to clear pending in the async path — clear it here so the
          // row isn't a permanent "pending" ghost. See reliability check 2026-06-18.
          inserted.pending = false;
        }
      }

      if (nameInput) nameInput.value = '';
      if (skillInput) skillInput.value = '';
      if (groupsInput) groupsInput.value = '';
      saveLocal();
      // Save-status toast is created before the insert/update branch (addToast) and
      // settled honestly when the write resolves — no more premature "added/updated".
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
                const { error } = await supabaseClient.rpc('check_in', { p_id: player.id });
                if (error) throw error;
                queueSupabaseRefresh();
              } catch (err) {
                console.error('Supabase update error', err);
                outboxEnqueue({ key: 'att:' + player.id, kind: 'check_in', payload: { p_id: player.id }, ts: Date.now() });
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
                const { error } = await supabaseClient.rpc('check_out', { p_id: player.id });
                if (error) throw error;
                queueSupabaseRefresh();
              } catch (err) {
                console.error('Supabase check-out error', err);
                outboxEnqueue({ key: 'att:' + player.id, kind: 'check_out', payload: { p_id: player.id }, ts: Date.now() });
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
        // pending:true keeps this in-flight row alive through a racing sync until the
        // insert resolves (see mergePlayersAfterSync) — fixes "registered player vanishes".
        const inserted = { ...newPlayer, pending: true };
        state.players = [...state.players, inserted];

        if (input) input.value = '';
        messages.registration = supabaseClient ? 'Registering…' : 'Registered';
        saveLocal();
        render();

        if (supabaseClient) {
          (async () => {
            try {
              let remoteOK = false;
              // C21: register through the SECURITY DEFINER RPC (the only anon write door under
              // locked RLS). Idempotent server-side; returns the row so we adopt its id. No
              // p_checked_in -> false: public register leaves the player checked OUT (the separate
              // Check In step still applies), matching prior behavior.
              {
                const { data, error } = await supabaseClient.rpc('register_player', { p_name: name, p_group: group });
                if (error) throw error;
                remoteOK = true;
                const row = Array.isArray(data) ? data[0] : data;
                if (row && row.id) inserted.id = row.id;
              }
              await ensureGroupCatalogEntriesSupabase(group ? [group] : []);
              inserted.pending = false;
              if (remoteOK) {
                messages.registration = 'Registered';
                queueSupabaseRefresh();
              } else {
                messages.registration = 'Could not save — check your connection and try again.';
                await reconcileToSupabaseAuthority('public-register');
              }
            } catch (err) {
              console.error('Supabase insert error', err);
              // C22 item 3: keep the row pending (the sync merge carries it forward) + queue the
              // register to retry on reconnect, instead of dropping the write.
              inserted.pending = true;
              outboxEnqueue({ key: 'reg:' + normalize(name) + ':' + (group || ''), kind: 'register', payload: { name, group }, ts: Date.now() });
              messages.registration = 'Saved on this device — will sync when back online.';
            }
            render();
            setTimeout(() => { messages.registration = ''; render(); }, 2500);
          })();
        } else {
          setTimeout(() => { messages.registration = ''; render(); }, 2500);
        }
      });
    }

  // --- Player cards: inline actions ---
  function attachPlayerRowHandlers() {
    // Intentionally a no-op.
    // Player row actions are delegated globally for lower per-render overhead.
  }
  attachPlayerRowHandlers();

  // --- Start new session (was: reset all check-ins) ---
  // C22 item 4: rolls attendance to a fresh session — checks everyone out AND preserves tonight's
  // attendance as durable history (the prior session's check_ins rows are kept). Server-side via the
  // start_new_session RPC (authenticated/admin only); players.checked_in stays the live UI flag.
  const resetBtn = document.getElementById('btn-reset-checkins');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      if (!canAccessOperatorSafetyControls()) return; // master-admin only; server gate = authenticated RPC
      const previouslyCheckedIn = normalizeCheckedInEntries(state.checkedIn || []);
      const n = previouslyCheckedIn.length;
      const confirmed = window.confirm(
        `Start a new session?\n\n${n} player${n === 1 ? ' is' : 's are'} checked in — they'll be checked out and tonight's attendance is saved as history.`
      );
      if (!confirmed) return;

      state.checkedIn = [];
      recordOperatorAction({
        scope: 'players',
        action: 'start-new-session',
        entityType: 'checkins',
        entityId: '',
        title: 'Started a new session.',
        detail: `${n} player${n === 1 ? ' was' : 's were'} checked out; tonight's attendance was saved.`,
        tone: 'warning',
        undo: {
          kind: 'checkins',
          checkedIn: previouslyCheckedIn
        }
      });
      saveLocal();
      // Full render() AFTER recording so the "Started a new session." entry + Undo appear in the
      // operator-actions log. partialRender (background sync) and tab-switches don't regenerate that
      // card, so a render() before recordOperatorAction (the old Reset's order) showed nothing.
      render();

      if (supabaseClient) {
        try {
          const { error } = await supabaseClient.rpc('start_new_session', { p_label: null });
          if (error) throw error;
          queueSupabaseRefresh();
        } catch (err) {
          console.error('Supabase start-new-session error', err);
          await reconcileToSupabaseAuthority('start-new-session');
          recordOperatorAction({
            scope: 'players',
            action: 'start-new-session-failed',
            entityType: 'checkins',
            entityId: '',
            title: 'Start new session failed to sync.',
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
      state.lastTeamSize = null; // manual "Teams: N" = Auto / as-equal mode
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

  // Team-SIZE buttons (2s/3s/4s/6s): teams of the chosen size, count = floor(checkedIn/size).
  // Remainder players ride along (the balancer spreads them +1 per team) so everyone plays.
  document.querySelectorAll('[data-team-size]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const size = Number(btn.getAttribute('data-team-size'));
      if (!size) return;
      const numTeams = Math.max(2, Math.floor(state.checkedIn.length / size));
      state.groupCount = numTeams;
      state.lastTeamSize = size;
      const generated = generateBalancedGroups(state.players, state.checkedIn, numTeams);
      state.generatedTeams = generated.teams;
      state.generatedTeamsSummary = generated.summary;
      state.liveCourtOrder = defaultLiveCourtOrder(generated.teams.length);
      state.liveMatchResults = {};
      state.liveMatchSkillSnapshots = {};
      saveLocal();
      render();
    });
  });

  // Live Nets collapse/expand toggle (default collapsed so the team rosters stay prominent)
  const liveNetsToggle = document.querySelector('[data-role="toggle-live-nets"]');
  if (liveNetsToggle) {
    liveNetsToggle.addEventListener('click', () => {
      const body = liveNetsToggle.parentElement.querySelector('.live-nets-body');
      if (!body) return;
      const nowCollapsed = !body.classList.contains('is-collapsed');
      body.classList.toggle('is-collapsed', nowCollapsed);
      state.liveNetsCollapsed = nowCollapsed;
      const caret = liveNetsToggle.querySelector('.live-nets-caret');
      if (caret) caret.textContent = nowCollapsed ? '▸ Show' : '▾ Hide';
      liveNetsToggle.setAttribute('aria-expanded', nowCollapsed ? 'false' : 'true');
      saveLocal();
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
      refreshAzStripAvailability();
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
      refreshAzStripAvailability();
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

  // Check-OUT is destructive (this is the 44->0 footgun class): confirm with a count + snapshot
  // the prior checked-in set so it can be undone. Check-IN is non-destructive — no confirm.
  let priorCheckedIn = null;
  if (!shouldCheckIn) {
    if (!window.confirm(`Check out ${targets.length} selected player${targets.length === 1 ? '' : 's'}?`)) return;
    priorCheckedIn = normalizeCheckedInEntries(state.checkedIn || []);
  }

  const remoteIds = new Set();
  targets.forEach((player) => {
    if (shouldCheckIn) checkInPlayer(player);
    else checkOutPlayer(player);
    if (player.id) remoteIds.add(player.id);
  });

  saveLocal();
  if (!shouldCheckIn && priorCheckedIn) {
    // Record an undo (same kind:'checkins' payload reset-checkins uses) then full render() so the
    // Undo entry appears in the operator-actions log (partialRender doesn't re-render that log).
    recordOperatorAction({
      scope: 'players',
      action: 'bulk-check-out',
      entityType: 'checkins',
      entityId: '',
      title: `Checked out ${targets.length} player${targets.length === 1 ? '' : 's'}.`,
      detail: 'Bulk check-out. Undo restores the prior checked-in set.',
      tone: 'warning',
      undo: { kind: 'checkins', checkedIn: priorCheckedIn }
    });
    render();
  } else {
    // Check-IN: non-destructive, no undo needed -> partialRender (no full 213-card rebuild).
    partialRender();
  }

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
  installErrorBoundary(); // C24 item 14: catch uncaught errors before they freeze the SPA mid-session
  // Load from localStorage
  loadLocal();
  if (!supabaseClient) {
    setSharedSyncState(SHARED_SYNC_LOCAL_ONLY);
  } else if (SUPABASE_AUTHORITATIVE) {
    setSharedSyncState(SHARED_SYNC_PENDING);
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
      if (synced) {
        // C25 item 8: arm a one-shot post-boot grace window — init has just loaded fresh data, so skip the
        // single redundant background refresh that focus/visibilitychange/SUBSCRIBED fire ~800ms later.
        SyncManager.bootSyncAt = Date.now();
        SyncManager.players.bootGraceArmed = true;
        SyncManager.tournament.bootGraceArmed = true;
      }
      if (synced) await loadLiveStateFromSupabase(); // C22 item 1: recover the night on load
      if (synced) saveLocal();
      ensureSupabaseLiveSync();
      ensureTournamentLiveSync();
      void flushOutbox(); // C22 item 3: flush writes queued during a prior offline session
      if (synced && canRunAdminSharedBackfill()) {
        (async () => {
          const catalogSynced = await backfillGroupCatalogToSupabase();
          const membershipsSynced = await backfillPlayerMembershipsToSupabase();
          if (catalogSynced || membershipsSynced) queueSupabaseRefresh();
        })();
      }
      render();
      loadSession().then(() => { if (state.currentSession) render(); });
      tdbRefreshTournaments().then(() => render()).catch(() => {});

      if (!SyncManager.poll.interval) {
        // Keep multiple devices converged without requiring a full page refresh.
        SyncManager.poll.interval = setInterval(() => {
          if (document.hidden) return;
          void flushOutbox(); // C22 item 3: keep retrying queued offline writes
          queueSupabaseRefresh(800);
          queueTournamentRefresh(800);
        }, 15000);
      }
    })();
  }
}

function initBackToTop() {
  const btn = document.getElementById('back-to-top');
  if (!btn) return;
  const activePanel = () => document.querySelector('.tab-panel.active');
  const update = () => {
    const p = activePanel();
    btn.classList.toggle('visible', !!p && p.scrollTop > 200);
  };
  // C25 item 5: serve whichever tab-panel is active (Players, Teams, Tournament),
  // not just Players. Scroll events don't bubble, so capture on document — this
  // catches scroll from the active panel AND survives render() rebuilding the
  // panels (the old code bound the #tab-players element directly, so it broke
  // after the first full render() and never worked on Teams/Tournament).
  document.addEventListener('scroll', (e) => {
    const t = e.target;
    if (t && t.classList && t.classList.contains('tab-panel') && t.classList.contains('active')) update();
  }, true);
  btn.addEventListener('click', () => {
    const p = activePanel();
    if (p) p.scrollTo({ top: 0, behavior: 'smooth' });
  });
  // A freshly-activated tab may be at top or already scrolled — re-evaluate on switch.
  window.addEventListener('as-tab-changed', update);
  update();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    init();
    initBackToTop();
  });
} else {
  init();
  initBackToTop();
}


