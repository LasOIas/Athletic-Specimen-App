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
// Identity (2026-07-08, Mike's call): persistSession=true so REAL email+password sign-ins survive a
// reload (Mike: "save them logged in"). Task 13 (2026-07-11): the legacy code login is RETIRED —
// email+password (deriveRole -> caller_role) is the only sign-in and the only admin source.
// detectSessionInUrl is a harmless no-op for password auth (kept for a future Google redirect option).
// autoRefreshToken keeps a real session alive.
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
const APP_VERSION = '2026.07.11.16'; // NF-18: the SINGLE version source — sw.js derives its cache name from the ?v= registration param
const LS_TAB_KEY = 'athletic_specimen_tab';
let activeMainTab = 'players';
const LS_SUBTAB_KEY = 'athletic_specimen_skill_subtab';
const LS_GROUPS_KEY = 'athletic_specimen_groups';
const LS_ACTIVE_GROUP_KEY = 'athletic_specimen_active_group';
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

// Task 3: the player edit sheet's DOM lives in the OLD admin players panel (adminPlayersHTML). The Manage
// Players directory runs on the PUBLIC shell, which has no such panel — so ensure the modal container exists
// (create + append to <body> once, mirroring ensureKioskConfirmModal) before openPlayerEditPopup populates
// it. The Save/Cancel buttons inside the body are document-delegated (ensureSaveDelegationBound), so the
// EXISTING popup works unchanged from either shell — nothing about the popup itself is rebuilt.
function ensurePlayerEditModal() {
  let el = document.getElementById('player-edit-modal');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'player-edit-modal';
  el.className = 'popup-overlay';
  el.style.display = 'none';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<div class="popup-card card" role="dialog" aria-modal="true" aria-labelledby="player-edit-modal-title">'
    + '<div class="popup-header"><h3 id="player-edit-modal-title">Edit Player</h3>'
    + '<button type="button" class="secondary" data-role="close-popup" data-target="player-edit-modal">Cancel</button></div>'
    + '<div class="popup-body" id="player-edit-modal-body"></div></div>';
  document.body.appendChild(el);
  // Close on an overlay-backdrop tap or the header Cancel (the body's own Cancel/Save are delegated).
  el.addEventListener('click', (e) => {
    if (e.target === el || (e.target.closest && e.target.closest('[data-role="close-popup"]'))) closePlayerEditPopup();
  });
  return el;
}

function openPlayerEditPopup(playerKey) {
  const modal = ensurePlayerEditModal();
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
      ${player.id ? `
      <label class="popup-edit-label">Account</label>
      <div class="edit-account">
        <span class="edit-account-status small">Checking&hellip;</span>
        <button type="button" class="btn-unlink-account secondary" style="display:none;">Unlink</button>
      </div>` : ''}
      <div class="edit-actions" style="margin-top:12px;">
        <button type="button" class="btn-save-edit success" data-player-key="${keyAttr}" data-id="${playerId}">Save</button>
        <button type="button" class="btn-cancel-edit secondary" data-player-key="${keyAttr}">Cancel</button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden'; // lock background scroll on iOS so the page doesn't scroll under the modal

  // Bug A fix (2026-06-21): do NOT auto-focus/select the Name field on open. Editing the name is
  // usually NOT what the admin wants (skill/group is), and auto-focus pops the keyboard onto the
  // wrong field. Leave focus to the admin — they tap the field they want to edit.

  // Slice 3b: Account row — this player's claim status via a one-shot read (the players sync doesn't
  // carry claimed_by_profile). Unlink = the admin exception path for a wrong claim (Mike: "all i want
  // is to edit a player from the admin page") — one tap, no approval queues. Requires the admin's
  // authenticated session (anon lacks SELECT/UPDATE on claimed_by_profile → fails safe to "Not linked").
  const acct = body.querySelector('.edit-account');
  if (acct && supabaseClient && player.id) {
    const statusEl = acct.querySelector('.edit-account-status');
    const unlinkBtn = acct.querySelector('.btn-unlink-account');
    (async () => {
      try {
        const { data, error } = await supabaseClient
          .from('players').select('claimed_by_profile').eq('id', player.id).maybeSingle();
        if (error) throw error;
        const linked = !!(data && data.claimed_by_profile);
        statusEl.textContent = linked ? 'Linked to an account' : 'Not linked';
        unlinkBtn.style.display = linked ? '' : 'none';
      } catch (err) {
        // Review fix: a failed read must not read as an affirmative "Not linked".
        console.error('claim status read', err);
        statusEl.textContent = "Couldn't check — reopen to retry";
      }
    })();
    unlinkBtn.addEventListener('click', async () => {
      unlinkBtn.disabled = true;
      statusEl.textContent = 'Unlinking…';
      try {
        const ok = await updatePlayerFieldsSupabase(player.id, { claimed_by_profile: null });
        if (!ok) throw new Error('update failed');
        statusEl.textContent = 'Not linked';
        unlinkBtn.style.display = 'none';
      } catch (err) {
        console.error('unlink account', err);
        statusEl.textContent = "Couldn't unlink — try again";
        unlinkBtn.disabled = false;
      }
    });
  }
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

  // Bug B fix (2026-06-21): exclude the player-edit MODAL (.popup-edit-row) from transient
  // capture/restore. The modal lives OUTSIDE `.players`, so partialRender never rebuilds it —
  // capturing it only made restore -> openInlineEditRow re-focus+select Name on every background
  // sync (15s poll / realtime), stealing the keyboard + selecting text mid-typing.
  const openEditRow = document.querySelector('.edit-row.show[data-player-key]:not(.popup-edit-row)');
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
    // C48.5 — admin Players grouped-section collapse toggle. Surgical (toggle the class only, no
    // re-render) so it can't disturb scroll/search/selection; persisted to sessionStorage.
    const groupToggle = e.target.closest('[data-role="toggle-group"]');
    if (groupToggle) {
      e.stopPropagation();
      e.preventDefault();
      const groupKey = String(groupToggle.getAttribute('data-group-key') || '').trim();
      const section = groupToggle.closest('.roster-group');
      if (!section) return;
      const nowCollapsed = !section.classList.contains('is-collapsed');
      section.classList.toggle('is-collapsed', nowCollapsed);
      groupToggle.setAttribute('aria-expanded', String(!nowCollapsed));
      setGroupCollapsed(groupKey, nowCollapsed);
      refreshAzStripAvailability();
      return;
    }
    // Finish-line Slice 3 (spec §13.5): the event card's "Register your team" CTA opens the join sheet — a
    // body-level overlay (openJoinSheet) so a background sync can never wipe a typed roster. Early-return
    // like the toggles above; the sheet's own buttons (submit / close / claim / back) bind in openJoinSheet.
    const regOpenSheet = e.target.closest('[data-role="reg-open-sheet"]');
    if (regOpenSheet) { e.preventDefault(); openJoinSheet(); return; }

    // Launch spec (2026-07-10): the registration PAGE lives inside #app-content, so its Register button and
    // post-success "Claim your spot" bind on this delegated document handler (the page's Back links use
    // data-tn-view="hub", handled with the hub tiles). The Register button is disabled until payment is
    // checked; the disabled guard is belt-and-suspenders (a disabled <button> emits no click).
    const regPageSubmit = e.target.closest('[data-role="reg-page-submit"]');
    if (regPageSubmit) { e.preventDefault(); if (!regPageSubmit.hasAttribute('disabled')) submitRegisterForm(regPageSubmit); return; }
    const regPageClaim = e.target.closest('[data-role="reg-page-claim"]');
    if (regPageClaim) {
      e.preventDefault();
      if (state.authSession) { openClaimPage(); }
      else { claimIntent = true; openAuthPage(); }
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
          // Reliability (2026-06-24): only clear `pending` once an id is assigned. If the insert "succeeded"
          // but returned no row (no id), keeping pending=true lets the post-sync merge preserve this player
          // instead of dropping it (the merge keeps a local row only while !id && pending).
          if (next.id) next.pending = false;
          if (remoteOK) { ok = true; queueSupabaseRefresh(); }
          else await reconcileToSupabaseAuthority('inline-edit-save');
        } catch (err) {
          console.error('Supabase save error', err);
          // Reliability (2026-06-24): the insert failed, so there's no id — keep pending=true so the merge
          // preserves this player (clearing it would silently drop the row the admin just edited).
          if (next.id) next.pending = false;
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
      borderRadius: 'var(--r-sm)',
      background: 'var(--accent-soft)',
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
    // C48.3 (perf): a check-in/out toggle changes exactly ONE player's state. The old path called
    // partialRender(), which rebuilt ALL ~215 roster rows (playersEl.innerHTML = renderFilteredPlayers()).
    // Update only the tapped row instead: toggle the card's `is-in` class + swap the toggle button to
    // reflect STATE (checked-in => green "In" via `btn-checkout tg in`; out => grey "Out" via `btn-checkin
    // tg` — label+color both = STATE, the 2026-06-20 truthfulness fix, preserved exactly), refresh the
    // checked-in stat cards, and if the active filter (Checked in / Out) now excludes the row, drop it.
    // Byte-identical to a full re-filter: only this player's filter-membership changed, the list is
    // alphabetical, so no other row moves. Falls back to partialRender() if the row isn't on screen (the
    // public kiosk path, or an off-screen toggle) so behavior is never lost.
    surgicalToggleRowUpdate(player);

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
    const brand = e.target.closest && e.target.closest('.ph-brand, .ad-brand');
    if (!brand) return;
    const activePanel = document.querySelector('.tab-panel.active');
    if (activePanel) activePanel.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();

// -- Registration PAGE pay-to-register gate: the "We sent it on Venmo" checkbox unlocks the Register button --
// Document-delegated + once-bound so it survives every partialRender/render rebuild of the page. Pure DOM
// toggle (no state), so a background sync that leaves the checkbox checked keeps the button unlocked.
(function ensureRegPaidGateBound() {
  if (window.__regPaidGateBound) return;
  window.__regPaidGateBound = true;
  document.addEventListener('change', (e) => {
    const cb = e.target;
    if (!cb || cb.id !== 'reg-paid') return;
    const btn = document.querySelector('[data-role="reg-page-submit"]');
    if (!btn) return;
    if (cb.checked) { btn.removeAttribute('disabled'); btn.removeAttribute('aria-disabled'); }
    else { btn.setAttribute('disabled', 'true'); btn.setAttribute('aria-disabled', 'true'); }
  });
})();

// -- Registration PAGE proactive duplicate-team-name warning (addendum 2026-07-10, Mike) --
// As the captain types the team name (debounced ~300ms) and on blur, warn inline if it collides with an
// already-registered team. The SERVER (register_team) stays the authority under concurrency; this is only a
// heads-up so they fix it before submitting. textContent (never innerHTML) keeps the echoed name XSS-safe;
// the .rf-warn:empty CSS hides the line when there's nothing to say. Document-delegated + once-bound so it
// survives every render/partialRender rebuild of the page.
(function ensureRegNameDupBound() {
  if (window.__regNameDupBound) return;
  window.__regNameDupBound = true;
  let timer = null;
  const runCheck = () => {
    const input = document.getElementById('reg-team');
    const warn = document.getElementById('reg-name-warn');
    if (!input || !warn) return;
    const name = String(input.value || '').trim();
    warn.textContent = (name && teamNameTaken(name, registerTargetTeams()))
      ? 'A team named "' + name + '" is already taken — pick another name.'
      : '';
  };
  document.addEventListener('input', (e) => {
    if (!e.target || e.target.id !== 'reg-team') return;
    clearTimeout(timer);
    timer = setTimeout(runCheck, 300);
  });
  document.addEventListener('focusout', (e) => {
    if (!e.target || e.target.id !== 'reg-team') return;
    clearTimeout(timer);
    runCheck();
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
  // C48.5: only count cards in a non-collapsed group section — a letter that lands solely in a
  // collapsed section can't be scrolled to, so dim it like any other empty letter.
  document.querySelectorAll('.players .player-card .player-name').forEach((el) => {
    const card = el.closest('.player-card');
    if (card && card.closest('.roster-group.is-collapsed')) return;
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
      // C48.5: skip cards inside a collapsed group section (they're hidden → scrollIntoView is a no-op).
      if (card.closest('.roster-group.is-collapsed')) continue;
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
  // Round 2 §12.3: the PUBLIC check-in surface shows only a quiet "N checked in" line (the admin
  // dashboard keeps the full stat hero + per-group breakdown below).
  if (!state.isAdmin) return `<div class="cik-count">${state.checkedIn.length} checked in</div>`;
  const groups = state.isAdmin ? computeCheckedInByGroup() : [];
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
  </div>` : ''}
</div>`;
}

function partialRender() {
  dismissTeamPeek(); // §13.2: a background rebuild replaces the tapped anchor — never strand a floating peek
  const root = document.getElementById('root');
  if (!root || !root.hasChildNodes()) { render(); return; }

  const syncNoticeEl = document.getElementById('js-sync-notice');
  const statsEl = document.getElementById('js-checkin-stats');
  const playersEl = document.querySelector('.players');

  // Reliability fix (2026-06-20): the public Check In kiosk has no `.players` element, so partialRender
  // would otherwise fall through to a full render() that rebuilds the shell and WIPES the half-typed
  // name out of #checkin-search on every background sync (15s poll, cross-device realtime push,
  // focus/visibility). When the kiosk search is in active use, update it surgically and leave the input
  // untouched. (Empty + unfocused → fall through to full render so Home/Scores/Bracket still refresh.)
  // MUST be gated on activeMainTab==='players' (the Check In tab): the public shell keeps all tab-panels
  // mounted, so stale non-empty text left in the hidden kiosk box while the user views Scores/Home would
  // otherwise short-circuit every sync and freeze those panels' live data. Only short-circuit when the
  // user is actually ON the Check In tab.
  if (!playersEl) {
    const checkinResultsEl = document.getElementById('checkin-results');
    const checkinSearchEl = document.getElementById('checkin-search');
    const kioskActive = activeMainTab === 'players'
      && checkinSearchEl
      && (document.activeElement === checkinSearchEl || ((checkinSearchEl.value || '').trim() !== ''));
    if (checkinResultsEl && kioskActive) {
      // Scroll-jump fix (2026-06-30, F6): #tab-players is the overflow container; iOS resets its scrollTop when
      // #checkin-results innerHTML is replaced, snapping a kiosk user scrolling a long name list to the top.
      const kPanel = document.getElementById('tab-players');
      const kSaved = kPanel ? kPanel.scrollTop : 0;
      if (syncNoticeEl) syncNoticeEl.innerHTML = buildSharedSyncNoticeHTML();
      if (statsEl) statsEl.innerHTML = buildCheckinStatsHTML();
      const kioskHTML = buildKioskResultsHTML(checkinSearchEl.value);
      checkinResultsEl.innerHTML = kioskHTML;
      syncKioskIdleState(kioskHTML); // C48.6: keep the centered/top-aligned state in lockstep on background syncs
      if (kPanel && kSaved > 0 && kPanel.scrollTop !== kSaved) kPanel.scrollTop = kSaved;
      return;
    }
  }

  // Public Home updates IN PLACE (no full render -> no scroll jump) when the viewer is on the Home tab.
  // The public shell has no `.players`, so without this a background sync would fall through to a full
  // render() and yank a spectator to the top. Slice 1: full #tab-home .container rebuild + scrollTop
  // preservation (Home has no text inputs; popups live on document.body) — mirrors the Scores short-circuit.
  if (!playersEl && activeMainTab === 'home') {
    const panel = document.getElementById('tab-home');
    const c = panel ? panel.querySelector('.container') : null;
    if (c) {
      const saved = panel.scrollTop;
      if (syncNoticeEl) syncNoticeEl.innerHTML = buildSharedSyncNoticeHTML();
      c.innerHTML = publicHomeHTML();
      if (saved > 0 && panel.scrollTop !== saved) panel.scrollTop = saved;
      return;
    }
  }

  // Session-10 R1: the admin Manage tab repaints IN PLACE on a background sync — the needs-you rows +
  // status subs recompute from live state via a single container swap that preserves manageView + scrollTop.
  // The lead + area placeholders + the pickup LIST are static/derived, so rebuilding them is safe. Task 2
  // EXCEPTION: the pickup FORM ('pickup-form') has live text inputs — never clobber a half-typed day; just
  // refresh the sync notice and bail (still return so we don't fall through to a full render() that would
  // ALSO wipe the form).
  if (!playersEl && activeMainTab === 'manage') {
    if (manageView === 'pickup-form') {
      if (syncNoticeEl) syncNoticeEl.innerHTML = buildSharedSyncNoticeHTML();
      return;
    }
    // Task 3 EXCEPTION: the Players directory has a live search input + an in-progress bulk selection.
    // Never clobber a half-typed query or the Select state on a background sync — bail (refresh the sync
    // notice only) when Select mode is on, or the search box holds a value / is focused. When the directory
    // is idle (no query, not selecting) a plain container repaint is safe and keeps the IN tags/counts live.
    if (manageView === 'players') {
      const searchEl = document.getElementById('mg-player-search');
      const searching = searchEl && (document.activeElement === searchEl || ((searchEl.value || '').trim() !== ''));
      if (mgSelectMode || searching) {
        if (syncNoticeEl) syncNoticeEl.innerHTML = buildSharedSyncNoticeHTML();
        return;
      }
    }
    // Task 5 EXCEPTION: the Tournament → Registration view has a live announcement textarea + venmo/buy-in/
    // team-size fields. Never clobber a half-typed announcement or field on a background sync — bail (refresh
    // the sync notice only) when an input/textarea in #tab-manage is focused, or the announcement is dirty.
    if (manageView === 'tournament' && mgtView === 'registration' && manageRegDirty()) {
      if (syncNoticeEl) syncNoticeEl.innerHTML = buildSharedSyncNoticeHTML();
      return;
    }
    // Task 9 EXCEPTION: the Event settings view carries live text/number fields; the Rules editor carries a
    // live textarea. Bail the background repaint (refresh the sync notice only) while a field is focused / the
    // rules text is dirty so a half-typed edit survives.
    if (manageView === 'tournament' && mgtView === 'settings' && manageSettingsDirty()) {
      if (syncNoticeEl) syncNoticeEl.innerHTML = buildSharedSyncNoticeHTML();
      return;
    }
    if (manageView === 'tournament' && mgtView === 'rules' && manageRulesDirty()) {
      if (syncNoticeEl) syncNoticeEl.innerHTML = buildSharedSyncNoticeHTML();
      return;
    }
    // Task 7 EXCEPTION: the Tournament → Pools pre-draw setup carries live pool-count / nets inputs. Bail the
    // background repaint (refresh the sync notice only) while one is focused so a half-typed value survives.
    // (The score sheet is body-level → already immune to the container swap.)
    if (manageView === 'tournament' && mgtView === 'pools') {
      const mp = document.getElementById('tab-manage');
      const active = mp ? document.activeElement : null;
      if (active && mp.contains(active) && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
        if (syncNoticeEl) syncNoticeEl.innerHTML = buildSharedSyncNoticeHTML();
        return;
      }
    }
    // Task 11 EXCEPTION: the Admins seats view carries a live assign-by-email input (owner only). Never
    // clobber a half-typed email on a background sync — bail (refresh the sync notice only) when it is
    // focused / holds a value. The remove-admin sheet is body-level → already immune to the container swap.
    if (manageView === 'admins') {
      const emailEl = document.getElementById('mgad-email');
      if (emailEl && (document.activeElement === emailEl || (String(emailEl.value || '').trim() !== ''))) {
        if (syncNoticeEl) syncNoticeEl.innerHTML = buildSharedSyncNoticeHTML();
        return;
      }
    }
    const panel = document.getElementById('tab-manage');
    const c = panel ? panel.querySelector('.container') : null;
    if (c) {
      const saved = panel.scrollTop;
      if (syncNoticeEl) syncNoticeEl.innerHTML = buildSharedSyncNoticeHTML();
      c.innerHTML = manageContainerHTML();
      if (saved > 0 && panel.scrollTop !== saved) panel.scrollTop = saved;
      return;
    }
  }

  // Slice 1 (2026-07-08): public History + My Team sub-pages update IN PLACE on a background sync,
  // mirroring the Scores short-circuit — rebuild only the panel container (recomputes live records /
  // history; the module-var toggle state survives) and preserve the spectator's scrollTop (iOS resets
  // it on innerHTML replace). (Standings folded into the Pools Seeding tab — Mike K, 2026-07-10 — so the
  // pools sub-page repaints via partialRenderTournament below, not here.)
  if (!playersEl && (activeMainTab === 'history' || activeMainTab === 'myteam')) {
    const panel = document.getElementById('tab-' + activeMainTab);
    const c = panel ? panel.querySelector('.container') : null;
    if (c) {
      const saved = panel.scrollTop;
      if (syncNoticeEl) syncNoticeEl.innerHTML = buildSharedSyncNoticeHTML();
      c.innerHTML = activeMainTab === 'myteam' ? buildMyTeamPageHTML() : buildHistoryPageHTML();
      if (saved > 0 && panel.scrollTop !== saved) panel.scrollTop = saved;
      return;
    }
  }

  // Wave 1b (2026-06-25): public Bracket/Tournament tab updates via partialRenderTournament (rebuilds
  // only #tab-tournament .container + redraws/fits the tree) instead of a full render() that resets the
  // spectator's scroll AND the bracket pan/zoom. maybeAutoGenerateBracket inside it is admin+tournament
  // gated, so it's a no-op for a public viewer.
  if (!playersEl && activeMainTab === 'tournament') {
    // Wave 1e consistency (review-gate LOW-1): if the tournament was deleted while a fan sits on the
    // Bracket tab, fall through to full render() so the orphaned-tab guard resets to Home (the Bracket
    // nav button is gone) instead of leaving an empty bracket panel with a stale nav button.
    if (!tournamentNavVisible()) { render(); return; }
    if (syncNoticeEl) syncNoticeEl.innerHTML = buildSharedSyncNoticeHTML();
    partialRenderTournament();
    return;
  }

  if (!syncNoticeEl || !playersEl) { render(); return; }

  syncNoticeEl.innerHTML = buildSharedSyncNoticeHTML();
  // C40 (2026-06-20): the checked-in stat card was removed from the admin Players page (it duplicated
  // the Dashboard stat), so #js-checkin-stats may be absent on the admin surface — guard it.
  if (statsEl) statsEl.innerHTML = buildCheckinStatsHTML();
  // Reliability fix (2026-06-20): keep the admin Dashboard checked-in stat live (it lives in the
  // hidden dashboard panel; activateMainTab doesn't re-render, so without this it shows the stale
  // login-time count after a check-in).
  const dashStatEl = document.getElementById('js-dashboard-stat');
  if (dashStatEl) dashStatEl.innerHTML = buildDashboardStatHTML();

  // Scroll-jump fix (2026-06-30, F5): #tab-players is the overflow scroll container; iOS resets its scrollTop
  // when .players innerHTML is replaced, yanking the admin to the top of the ~215-row roster on every 15s poll
  // + every cross-device check-in. render() saves+restores this; this background path must too. Most-polled
  // admin surface (mid-check-in). captureTransientInteractionState preserves focus/selection only, not scroll.
  const playersPanel = document.getElementById('tab-players');
  const playersSaved = playersPanel ? playersPanel.scrollTop : 0;
  const snapshot = captureTransientInteractionState();
  playersEl.innerHTML = renderFilteredPlayers();
  bindPlayerRowHandlers();
  bindSelectionHandlers();
  updateBulkBarVisibility();
  restoreTransientInteractionState(snapshot);
  if (playersPanel && playersSaved > 0 && playersPanel.scrollTop !== playersSaved) playersPanel.scrollTop = playersSaved;
  refreshAzStripAvailability();
}

// C48.3 (perf): scoped re-render of ONLY the admin Players panel (#tab-players). The high-frequency
// admin filter actions (filter chips, the #player-tab-select source-of-truth select, the group-filter
// select) only change which roster rows show + which chip/sub-control is active — none of them touch
// the header, the bottom nav, or any other panel. The old path called full render(), which rebuilt the
// ENTIRE #root (every panel) + forced a reflow (`void root.offsetHeight`) + re-ran activateMainTab — a
// measured ~383ms block on a single chip tap at 4x CPU throttle, almost all of it the teardown +
// 215-row rebuild of the whole shell. This rebuilds just the Players panel via adminPlayersHTML() (the
// SAME builder render() uses, in the SAME `.container` wrapper) so the chips' .on highlight, the Skill
// sub-tab, and the Groups sub-control all stay byte-identical to a full render() — then re-binds only
// the players-panel handlers (NOT attachHandlers() wholesale, which would double-bind the non-idempotent
// nav/login/kiosk/team/session handlers). Row-level handlers (in/out toggle, select checkbox, kebab
// edit/delete, A-Z strip) are document-delegated and bound once, so the innerHTML swap leaves them intact.
// Transient interaction state (search text/focus/selection, open kebab, open edit row, open group-select,
// open modal) is preserved exactly the way partialRender does. Falls back to full render() if the panel
// is absent or we're not on the admin surface — so it can never silently no-op on the public shell.
function renderPlayersPanel() {
  const panel = document.getElementById('tab-players');
  if (!state.isAdmin || !panel) { render(); return; }

  const snapshot = captureTransientInteractionState();
  // Reproduce adminPlayersHTML()'s EXACT #tab-players innerHTML (incl. the template-literal whitespace
  // around the .container wrapper) so a scoped re-render is byte-identical to a full render(), not just
  // pixel-identical.
  panel.innerHTML = `
      <div class="container">
        ${adminPlayersHTML()}
      </div>
    `;
  bindPlayersPanelHandlers();
  // Row + selection handlers are document-delegated no-ops (kept for call-site parity with render/partialRender).
  bindPlayerRowHandlers();
  bindSelectionHandlers();
  updateBulkBarVisibility();
  restoreTransientInteractionState(snapshot);
  refreshAzStripAvailability();
}

// C48.3 (perf): surgical single-row update for the admin Players in/out toggle (the highest-frequency
// admin gesture). Replaces partialRender()'s full 215-row rebuild with a one-element DOM edit. The
// toggle button markup MUST stay byte-identical to renderFilteredPlayers() (app.js ~2588-2591):
//   checked-in => <button class="btn-checkout tg in" data-id aria-label="…is checked in — tap to check out"><span class="tg-dot"></span>In</button>
//   out         => <button class="btn-checkin tg"     data-id aria-label="…is checked out — tap to check in"><span class="tg-dot"></span>Out</button>
// (label + color both = STATE — green "In" / grey "Out" — the 2026-06-20 truthfulness fix.) If the row
// isn't currently rendered (e.g. the public kiosk has no .prow, or the toggled player is filtered out of
// view), fall back to partialRender() so nothing is lost.
function buildRowToggleButtonHTML(player, isCheckedIn) {
  const safeName = escapeHTMLText(player.name || '');
  return isCheckedIn
    ? `<button class="btn-checkout tg in" data-id="${player.id}" aria-label="${safeName} is checked in — tap to check out"><span class="tg-dot"></span>In</button>`
    : `<button class="btn-checkin tg" data-id="${player.id}" aria-label="${safeName} is checked out — tap to check in"><span class="tg-dot"></span>Out</button>`;
}

function surgicalToggleRowUpdate(player) {
  const playersEl = document.querySelector('.players');
  const row = playersEl ? playersEl.querySelector(`.prow[data-id="${CSS.escape(String(player.id))}"]`) : null;
  // No on-screen row to surgically edit (kiosk has none; off-screen/filtered row) → keep the prior
  // safe behavior so the UI never goes stale.
  if (!playersEl || !row) { partialRender(); return; }

  // C48.5 — CORRECTNESS over micro-optimization for the grouped view (Option C). The grouped sections
  // carry a per-section COUNT = matching players in that group; under the membership-sensitive filters
  // (Checked in / Out / Unset) a single in/out toggle changes which players match → every relevant
  // header count moves and rows leave/enter sections. Rebuilding the whole #tab-players panel
  // (~78ms) is the simple, always-correct option — a stale group count is a visible bug. The pure
  // single-row fast path below stays for the flat list (search/skill) AND for the grouped "All"
  // filter (where a section's "everyone in this group" count never changes on a check-in toggle).
  const isGroupedView = !!playersEl.querySelector('.roster-group');
  const membershipSensitiveFilter =
    state.playerTab === 'in' || state.playerTab === 'out' || state.playerTab === 'unrated';
  if (isGroupedView && membershipSensitiveFilter) { renderPlayersPanel(); return; }

  const nowCheckedIn = (state.checkedIn || []).includes(playerIdentityKey(player));

  // 1) Card class — set the WHOLE className to the exact string renderFilteredPlayers() builds
  //    (`player-card prow ${isSelected?'is-selected':''} ${checked?'is-in':''}`, double/trailing spaces
  //    and all) so the row is byte-identical to a full render, not just classList-equivalent.
  const isSelected = new Set((state.selectedIds || []).map((x) => String(x))).has(String(player.id));
  row.className = 'player-card prow ' + (isSelected ? 'is-selected' : '') + ' ' + (nowCheckedIn ? 'is-in' : '');

  // 2) Swap the toggle button (the ONLY part of .prow-actions that differs by state; the kebab is identical).
  const toggleBtn = row.querySelector('.btn-checkin, .btn-checkout');
  if (toggleBtn) {
    const tmp = document.createElement('div');
    tmp.innerHTML = buildRowToggleButtonHTML(player, nowCheckedIn);
    const fresh = tmp.firstElementChild;
    if (fresh) toggleBtn.replaceWith(fresh);
  }

  // 3) Stat cards — same surgical updates partialRender does (each guarded; may be absent per surface).
  const statsEl = document.getElementById('js-checkin-stats');
  if (statsEl) statsEl.innerHTML = buildCheckinStatsHTML();
  const dashStatEl = document.getElementById('js-dashboard-stat');
  if (dashStatEl) dashStatEl.innerHTML = buildDashboardStatHTML();

  // 4) If the active filter now excludes this row, drop it (the list is alphabetical and only THIS
  // player's membership changed, so removing the one row yields the same DOM as a full re-filter).
  const filterExcludes =
    (state.playerTab === 'in' && !nowCheckedIn) ||
    (state.playerTab === 'out' && nowCheckedIn);
  if (filterExcludes) {
    row.remove();
    // If that emptied the list, render the exact empty-state message renderFilteredPlayers() would show,
    // wrapped in the SAME whitespace adminPlayersHTML() uses for `<div class="players">…</div>` so the
    // `.players` innerHTML is byte-identical to a full render's empty state.
    if (!playersEl.querySelector('.prow')) {
      playersEl.innerHTML = `\n    ${renderFilteredPlayers()}\n  `;
    }
    refreshAzStripAvailability();
  }
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
    el.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:var(--bg);display:flex;align-items:center;justify-content:center;padding:24px;';
    el.innerHTML =
      '<div style="max-width:340px;text-align:center;font-family:Arial,Helvetica,sans-serif;color:var(--ink);">'
      + '<div style="font-size:18px;font-weight:700;margin-bottom:8px;">Hit a snag</div>'
      + '<div style="font-size:14px;color:var(--text-2);margin-bottom:18px;line-height:1.4;">Tap below to reload. Your data is safe.</div>'
      + '<button id="app-error-reset" style="background:var(--accent);color:#fff;border:none;border-radius:var(--r-sm);padding:12px 18px;font-size:15px;font-weight:700;">Reset view</button>'
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
  state.groups = ['All', ...canonicalGroups];

  const currentActive = normalizeActiveGroupSelection(state.activeGroup || 'All');
  if (currentActive === 'All' || currentActive === UNGROUPED_FILTER_VALUE) {
    state.activeGroup = currentActive;
  } else {
    const activeKey = normalizeGroupKey(currentActive);
    const match = canonicalGroups.find((groupName) => normalizeGroupKey(groupName) === activeKey);
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
  const active = normalizeActiveGroupSelection(state.activeGroup || 'All');
  if (!active || active === 'All' || active === UNGROUPED_FILTER_VALUE) return '';
  return normalizeGroupName(active);
}

function getTopFormGroupsHelpText() {
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

// [Task 4 — R5 cut] areAllLiveMatchResultsRecorded + deriveNextLiveCourtOrder deleted with the casual
// courts board (court rotation/advancement). Team generation stays; skills are admin-edit only now.

// C26 item 3a: read-only public live-courts data, derived from the synced live_state.
// Truthful only — Live Nets records WIN/LOSS (no running score); rows show team NUMBERS +
// a status pill (Playing / "Team N won"). No skill, no player names, no fabricated score.
function getPublicLiveData() {
  if (!Array.isArray(state.generatedTeams) || state.generatedTeams.length === 0) {
    return { matchups: [], results: {}, waitingTeams: [], liveCount: 0 };
  }
  const order = normalizeLiveCourtOrder(state.liveCourtOrder, state.generatedTeams.length);
  const live = deriveLiveTeamMatchupsFromOrder(order);
  const results = normalizeLiveMatchResults(state.liveMatchResults, live.matchups);
  const liveCount = live.matchups.reduce((n, m) => (Number(results[liveMatchupKey(m.teamA, m.teamB)]) ? n : n + 1), 0);
  return { matchups: live.matchups, results, waitingTeams: live.waitingTeams, liveCount };
}


// C32: the public-facing "live" tournament (the one the public Bracket tab follows), or null.
function publicLiveTournament() {
  const list = state.tournaments || [];
  const byId = state.activeTournamentId ? list.find((t) => t.id === state.activeTournamentId) : null;
  return (byId && (byId.status === 'pools' || byId.status === 'bracket')) ? byId
    : list.find((t) => t.status === 'pools' || t.status === 'bracket') || null;
}

// PUBLIC Home (dashboard remake, Slice 1): tournament-live -> spectator dashboard (gateway claim-in-hero +
// live board + Standings/Bracket/History tiles); no tournament -> casual state (headcount + courts + next
// session + Check In). Read-only except the Check In CTA. Count-only headcount (NEVER names), no skill, no
// fabricated scores. Updated IN PLACE via a full #tab-home .container rebuild in partialRender (no scroll jump).
// Live-nets collapse caret — an SVG chevron that rotates (CT2: replaces the old up/down triangle text-glyph carets).
function liveNetsCaretHTML(collapsed) {
  return `<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false" style="vertical-align:-1px;transform:rotate(${collapsed ? 0 : 90}deg);transition:transform .12s ease;"><path d="M5 3l6 5-6 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> ${collapsed ? 'Show' : 'Hide'}`;
}

// ── atom-up public Home (spec 2026-07-10 §1-§2): ONE state at a time, card-free, NO personalization. ──
// The pure state machine (publicHomeState) picks exactly one of tournament_live / session_live /
// registration / quiet. Home is the everyone surface — identical signed-in or out; the personal layer
// (my-team, claim) lives on the Tournament tab, never here. All dynamic text through escapeHTML; no
// "night/tonight" copy; singular/plural correct.
const HM_CHEV = '<svg class="hm-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="m9 6 6 6-6 6"/></svg>';
const HM_LOGO = '<img class="hm-logo" src="/logo-mark.png" alt="" aria-hidden="true">';
// Detail-row icons — bare paths; `.hm-detail svg` supplies stroke/fill/width (matte, §51). pin / users / format.
const HM_IC_PIN = '<svg viewBox="0 0 24 24"><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/></svg>';
const HM_IC_USERS = '<svg viewBox="0 0 24 24"><circle cx="9" cy="7" r="3.5"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 4a3.6 3.6 0 0 1 0 6.8"/><path d="M20.5 20a5.5 5.5 0 0 0-4-5.3"/></svg>';
const HM_IC_FORMAT = '<svg viewBox="0 0 24 24"><circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="12" r="2"/><path d="M8 6h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8"/><path d="M13 12h3"/></svg>';

// Shared lead block (no card): eyebrow (status dot + small-caps) → Barlow title → muted meta → optional
// CTA, with the logo mark filling the open space to the right (Mike's directive). The CTA spans full width.
// Used by tournament_live / session_live / quiet. Registration owns its own lead (hmRegistrationHTML).
function hmLeadHTML(o) {
  const eyebrow = `<div class="hm-eyebrow${o.quiet ? ' is-quiet' : ''}"><span class="hm-dot"></span>${escapeHTML(o.eyebrow)}</div>`;
  const title = `<h1>${escapeHTML(o.title)}</h1>`;
  const meta = o.meta ? `<div class="hm-meta">${escapeHTML(o.meta)}</div>` : '';
  return `<div class="hm-lead">
      <div class="hm-leadtext">
        ${eyebrow}${title}${meta}
      </div>
      ${HM_LOGO}
      ${o.ctaHTML || ''}
    </div>`;
}

function hmDetailRowHTML(icon, text) {
  return `<div class="hm-detail">${icon}<span>${escapeHTML(text)}</span></div>`;
}

// A tournament LIVE-NOW net block: net-header line + the game (two team rows + running score) + Playing pill.
function hmNetBlockHTML(b) {
  return `<div class="hm-netblock">
      <div class="hm-nethead">${escapeHTML(b.label)}</div>
      <div class="hm-game">
        <div class="hm-teams">
          <div class="hm-row"><span class="hm-nm">${escapeHTML(b.a.name)}</span><span class="hm-sc">${escapeHTML(String(b.a.score))}</span></div>
          <div class="hm-row"><span class="hm-nm">${escapeHTML(b.b.name)}</span><span class="hm-sc">${escapeHTML(String(b.b.score))}</span></div>
        </div>
        <span class="hm-pill">Playing</span>
      </div>
    </div>`;
}

// [Task 4 — R5 cut] hmCasualCourtsHTML deleted with the casual courts board. The public Home casual state
// (hmSessionLiveHTML) no longer shows "ON THE COURTS" net cards — it leads with the headcount + Check In CTA.
// The public Home TOURNAMENT live board (hmTournamentLiveHTML) is a separate function and is untouched.

// Local weekday for a 'YYYY-MM-DD' session date → the "<Weekday> Pick-up" title (spec §2c example format).
function hmSessionWeekday(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}/.test(String(dateStr))) return '';
  const p = String(dateStr).slice(0, 10).split('-').map(Number);
  const dt = new Date(p[0], p[1] - 1, p[2]);
  return isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('en-US', { weekday: 'long' });
}

// A left-name / right-muted mini row (past tournaments).
function hmPastRowHTML(name, teamCount) {
  const meta = (teamCount ? (teamCount + (teamCount === 1 ? ' team' : ' teams') + ' · ') : '') + 'completed';
  return `<div class="hm-mini"><span>${escapeHTML(name || 'Tournament')}</span><span class="hm-meta">${escapeHTML(meta)}</span></div>`;
}

// ── State 2a: tournament day (live). Rail (lead + COMING UP + STANDINGS + link) + board (LIVE NOW nets).
// The rail/board wrappers exist for the Task-4 desktop grid; on mobile they dissolve (display:contents) and
// `order` sequences the flattened children: lead → LIVE NOW → COMING UP → STANDINGS → link. ──
function hmTournamentLiveHTML(t) {
  const teams = state.tournamentTeams || [];
  const matches = state.tournamentMatches || [];
  const isBracket = t.status === 'bracket';
  const phaseMatches = matches.filter((m) => m.phase === (isBracket ? 'main' : 'pool'));
  const done = phaseMatches.filter((m) => m.status === 'final').length;
  const total = phaseMatches.length;
  const teamCount = teams.length;
  const netCount = new Set(matches.filter((m) => m.net != null).map((m) => m.net)).size;
  const meta = [
    total ? (done + ' of ' + total + ' games done') : '',
    teamCount ? (teamCount + (teamCount === 1 ? ' team' : ' teams')) : '',
    netCount ? (netCount + (netCount === 1 ? ' net' : ' nets')) : '',
  ].filter(Boolean).join(' · ');
  const lead = hmLeadHTML({ eyebrow: (isBracket ? 'Bracket' : 'Pool play') + ' · Live', title: t.name || 'Tournament', meta });

  const blocks = homeNetBlocksModel(matches, teams, 'NET');
  const netgrid = blocks.length ? blocks.map(hmNetBlockHTML).join('') : '<div class="hm-empty">No games in progress right now.</div>';

  const coming = homeComingUpModel(matches, teams, 'Net');
  const comingHTML = coming.length ? `<div class="hm-comingup">
        <div class="hm-sect">Coming up</div>
        ${coming.map((c) => `<div class="hm-mini"><span><span class="hm-rk">${escapeHTML(c.label)}</span>${escapeHTML(c.text)}</span><span class="hm-meta">next</span></div>`).join('')}
      </div>` : '';

  const standings = homeTopStandingsModel(computeStandings(teams, matches), 3);
  const standingsHTML = standings.length ? `<div class="hm-standings">
        <div class="hm-sect">Standings · Top 3</div>
        ${standings.map((s) => `<div class="hm-mini"><span><span class="hm-rk">${s.rank}</span>${escapeHTML(s.name)}</span><span class="hm-rec">${escapeHTML(s.record)}</span></div>`).join('')}
      </div>` : '';

  const link = `<button type="button" class="hm-link" data-nav-tab="tournament"><span>Full standings &amp; schedule</span>${HM_CHEV}</button>`;

  return `<div class="hm is-live">
      <div class="hm-rail">${lead}${comingHTML}${standingsHTML}${link}</div>
      <div class="hm-board"><div class="hm-sect">Live now</div><div class="hm-netgrid">${netgrid}</div></div>
    </div>`;
}

// ── State 2c: casual session day. Lead + Check in CTA (→ activateMainTab('players')) + ON THE COURTS.
// Cross-state rule: when a reg-open tournament ALSO exists, ONE registration link row sits under the board
// (the only cross-state element allowed by spec §2). ──
function hmSessionLiveHTML(reg) {
  const sess = state.currentSession || {};
  const weekday = hmSessionWeekday(sess.date);
  const checkedIn = (state.checkedIn || []).length;
  const teamCount = (state.generatedTeams || []).length;
  // [Task 4 — R5 cut] the casual courts board is gone: the public session-day Home leads with the headcount
  // (+ team count) and the Check In CTA — no "ON THE COURTS" net cards, no court count.
  const meta = [
    checkedIn ? (checkedIn + ' checked in') : '',
    teamCount ? (teamCount + (teamCount === 1 ? ' team' : ' teams')) : '',
  ].filter(Boolean).join(' · ');
  const cta = '<button type="button" class="hm-cta" data-nav-tab="players">Check in</button>';
  const lead = hmLeadHTML({ eyebrow: 'Session live', title: weekday ? (weekday + ' Pick-up') : 'Pick-up session', meta, ctaHTML: cta });

  // Cross-state link only when registration is ACTUALLY open — reg can now be a CLOSED upcoming tournament.
  const regLink = (reg && reg.registration_open)
    ? `<button type="button" class="hm-link" data-tn-view="register"><span>Registration open — ${escapeHTML(reg.name || 'Tournament')}</span>${HM_CHEV}</button>`
    : '';

  return `<div class="hm">${lead}${regLink}</div>`;
}

// ── State 2b: registration open. Lead + Register CTA (routes into the SHIPPED register event card/join
// sheet via data-tn-view="register") + DETAILS rows. No date row (tournaments carry no date column); the
// location row reads "posted in GroupMe"; team-size binds to the tournament row. ──
function hmRegistrationHTML(reg) {
  const list = state.tournaments || [];
  const active = state.activeTournamentId ? list.find((x) => x.id === state.activeTournamentId) : null;
  const regTeams = (active && active.id === reg.id) ? (state.tournamentTeams || []) : [];
  const rm = registerEventModel(reg, regTeams);
  // Home meta is ONLY "4s co-ed · $80 a team" (Mike v11 tightening: "remove 'be the first team in' that
  // should never show") — no spots segment here in either the zero-team or N-teams case. The register
  // event card page (buildRegisterPageHTML) keeps its spots line; registerEventModel.spotsLead is unchanged.
  const meta = [rm.teamSize + 's co-ed', rm.costChip].filter(Boolean).join(' · ');
  // Registration cluster (Mike rung-12 pick D + v10 iteration, 2026-07-10): TITLE flush at the top; the
  // Register CTA lives INSIDE the cluster and its width ends at the same right boundary as the status
  // divider's hairline (the shared 118px logo reserve, Mike: "the register buttons length is the same as
  // the registration opn hairline end"); the logo mark is absolutely sized to the FULL cluster height —
  // title + meta + status divider + CTA — so it runs from the title's top down to the BOTTOM of the
  // Register button (.hm-regwrap is the relative wrapper; every text element reserves the logo's width).
  // The admin-driven reg status renders as a divider LABEL — no eyebrow, no dot. Status tracks the
  // tournament row's registration_open flag (via registerEventModel.regOpen): OPEN → "Registration open" +
  // Register CTA; CLOSED/absent → muted "Registration closed" divider + NO CTA (the wrapper then ends at
  // the divider and the logo auto-shrinks with it). The upcoming tournament stays visible on Home either
  // way; the DETAILS rows render in both variants.
  const metaHTML = meta ? `<div class="hm-meta">${escapeHTML(meta)}</div>` : '';
  const status = `<div class="hm-status${rm.regOpen ? '' : ' is-closed'}"><span>${rm.regOpen ? 'Registration open' : 'Registration closed'}</span></div>`;
  const cta = rm.regOpen ? '<button type="button" class="hm-cta" data-tn-view="register">Register your team</button>' : '';
  const cluster = `<div class="hm-regwrap">
      <div class="hm-reginfo"><h1>${escapeHTML(rm.name)}</h1>${metaHTML}</div>
      ${status}
      ${cta}
      <img class="hm-reglogo" src="/logo-mark.png" alt="" aria-hidden="true">
    </div>`;

  const rows = hmDetailRowHTML(HM_IC_PIN, 'posted in GroupMe')
    + hmDetailRowHTML(HM_IC_USERS, rm.teamSize + ' per team, co-ed — at least 1 guy + 1 girl')
    + hmDetailRowHTML(HM_IC_FORMAT, 'Pool play → double-elim bracket — win by 2');

  return `<div class="hm">${cluster}<div class="hm-sect">Details</div>${rows}</div>`;
}

// ── State 2d: quiet (nothing on). Muted lead + past tournaments + champions link. History is loaded lazily
// (only when the History tab opens), so Home first renders past rows from state.tournaments completed rows
// and upgrades to the richer team-count rows once loadTournamentHistory() fills state.tournamentHistory. ──
function hmQuietHTML() {
  const lead = hmLeadHTML({ quiet: true, eyebrow: 'Nothing on right now', title: 'Next tournament soon', meta: 'Announced here and in GroupMe' });

  const hist = state.tournamentHistory;
  let pastRows = '';
  if (Array.isArray(hist) && hist.length) {
    pastRows = hist.slice(0, 5).map((h) => hmPastRowHTML(h.name, h.teamCount)).join('');
  } else {
    const completed = (state.tournaments || []).filter((t) => t.status === 'completed');
    if (typeof hist === 'undefined' && !state.tournamentHistoryLoading && completed.length) {
      // fire-and-forget: refresh Home in place once the counts land (mirrors activateMainTab's lazy load)
      loadTournamentHistory().then(() => {
        if (activeMainTab === 'home') {
          const c = document.querySelector('#tab-home .container');
          if (c) c.innerHTML = publicHomeHTML();
        }
      });
    }
    pastRows = completed.slice(0, 5).map((t) => hmPastRowHTML(t.name || 'Tournament', 0)).join('');
  }
  const pastSection = pastRows ? `<div class="hm-sect">Past tournaments</div>${pastRows}` : '';
  const champLink = '<button type="button" class="hm-link" data-nav-tab="history"><span>Champions, records &amp; results</span>' + HM_CHEV + '</button>';

  return `<div class="hm">${lead}${pastSection}${champLink}</div>`;
}

function publicHomeHTML() {
  const t = publicLiveTournament();
  // An upcoming (setup) tournament shows on Home even when registration is CLOSED (Mike 2026-07-10) — widened
  // from `registration_open && setup`. Prefer a registration-open setup row when several exist.
  const setups = (state.tournaments || []).filter((x) => x.status === 'setup');
  const reg = setups.find((x) => x.registration_open) || setups[0] || null;
  const st = publicHomeState({
    liveTournament: t,
    regTournament: reg,
    pickupDays: pickupDaySet(), // Task 2: the day-of gate reads the SET (folds in the pre-0046 legacy-session fallback)
    todayStr: null, // sessionIsToday (day-of gate) defaults to local today when todayStr is null
    hasLiveCourts: getPublicLiveData().liveCount > 0,
  });
  if (st === 'tournament_live') return hmTournamentLiveHTML(t);
  if (st === 'session_live') return hmSessionLiveHTML(reg);
  if (st === 'registration') return hmRegistrationHTML(reg);
  return hmQuietHTML();
}

// [Task 4 — R5 cut] maybeAdvanceLiveCourtsFromResults deleted with the casual courts board (winners-move-left
// court rotation was driven by the now-deleted report-result handler).

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

// [Task 4 — R5 cut] parseLiveMatchKey + captureLiveMatchSkillSnapshot + restoreLiveMatchSkillSnapshot +
// applySkillDeltaToGeneratedTeam + syncLiveMatchSkillsToSupabase deleted with the casual courts board. These
// were the ±0.1-per-casual-result skill machinery (Mike: skills now change by admin edit only). clampSkill-
// OneDecimal stays (shared skill helper); normalizeLiveMatchSkillSnapshots stays (localStorage plumbing).


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
    toast.className = 'save-toast';
    toast.textContent = message;
    toast.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:var(--ink);color:var(--bg);padding:8px 12px;border-radius:var(--r-sm);box-shadow:var(--shadow-md);z-index:10000;font-size:14px;';
    document.body.appendChild(toast);
    setTimeout(() => { try { toast.classList.add('is-leaving'); } catch {} }, 1300);
    setTimeout(() => toast.remove(), 1500);
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

  if (!filtered.length) {
    // C44: distinguish loading vs empty-roster vs no-match (was a bare "No players found.")
    if (!state.loaded) return '<p class="roster-empty">Loading players…</p>';
    if (!(state.players || []).length) return '<p class="roster-empty">No players yet — tap <strong>+</strong> to add the first one.</p>';
    return '<p class="roster-empty">No players match — try clearing the search or filters.</p>';
  }

  // C48.5 — single dense one-line row builder (extracted so both the flat list and the grouped
  // sections render byte-identical .prow markup). The row class string + toggle button markup MUST
  // stay byte-identical to surgicalToggleRowUpdate()/buildRowToggleButtonHTML() so the delegated
  // handlers + surgical fast path keep working.
  const renderRow = (player) => {
    const checked = checkedSet.has(playerIdentityKey(player));
    const isSelected = selectedIds.has(String(player.id));
    const playerKey = playerIdentityKey(player);
    const playerKeyValue = escapeHTMLText(playerKey);
    const playerGroups = getPlayerGroups(player);
    const playerGroupsValue = escapeHTMLText(JSON.stringify(playerGroups));
    void playerGroupsValue; // retained for parity with edit-row group machinery
    const initials = String(player.name || '')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || '?';
    // Option C: the group section header carries the group → NO per-row group badge. Skill stays
    // inline + admin-only (the .skill-pill / state.isAdmin gating is preserved — players never see skill).
    return `
      <div class="player-card prow ${isSelected ? 'is-selected' : ''} ${checked ? 'is-in' : ''}" data-id="${player.id}" data-player-key="${playerKeyValue}">
        ${state.isAdmin ? `<input type="checkbox" class="player-select" data-id="${player.id}" aria-label="Select ${escapeHTMLText(player.name || '')}" ${isSelected ? 'checked' : ''} />` : ''}
        <span class="prow-av" aria-hidden="true">${escapeHTMLText(initials)}</span>
        <div class="prow-id">
          <span class="player-name">${escapeHTMLText(player.name || '')}</span>
          ${state.isAdmin ? `<div class="player-meta-row"><span class="skill-pill">Skill ${player.skill === 0 ? 'Unset' : player.skill}</span></div>` : ''}
        </div>
        <div class="prow-actions">
          ${checked
            ? `<button class="btn-checkout tg in" data-id="${player.id}" aria-label="${escapeHTMLText(player.name || '')} is checked in — tap to check out"><span class="tg-dot"></span>In</button>`
            : `<button class="btn-checkin tg" data-id="${player.id}" aria-label="${escapeHTMLText(player.name || '')} is checked out — tap to check in"><span class="tg-dot"></span>Out</button>`
          }
          ${state.isAdmin ? `
            <div class="menu-wrap">
              <button type="button" class="btn-actions" aria-haspopup="true" aria-expanded="false"
                      data-id="${player.id}" data-player-key="${playerKeyValue}" title="More actions" aria-label="More actions">
                <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><circle cx="10" cy="4" r="1.6"/><circle cx="10" cy="10" r="1.6"/><circle cx="10" cy="16" r="1.6"/></svg>
              </button>
              <div class="card-menu" role="menu">
                <button type="button" class="menu-item" data-role="menu-edit" data-player-key="${playerKeyValue}">Edit</button>
                <button type="button" class="menu-item danger" data-role="menu-delete" data-id="${player.id}">Delete</button>
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  };

  // C48.5 — Option C grouped collapsible sections, with the documented reconciliations:
  //   • Search active (query non-empty)  → FLAT alphabetical (search is a global lookup; grouping it
  //     is confusing). Returns to grouped when the query clears.
  //   • Skill filter (skill-sorted)       → FLAT (grouping conflicts with a skill sort).
  //   • Public surface (kiosk has no .prow here, but guard anyway) → FLAT.
  //   • All / Checked in / Out / Unset    → GROUPED; per-section count = matching players in that
  //     group; empty sections are never emitted (the grouping helper only makes a section with rows).
  //   • Groups filter (single group active) → only that one group's section shows (grouping over a
  //     1-group set yields exactly one section), forced EXPANDED so the operator sees the result.
  const q2 = (state.searchTerm || '').toLowerCase().trim();
  const useFlat = !state.isAdmin || !!q2 || state.playerTab === 'skill';
  if (useFlat) {
    return filtered.map(renderRow).join('');
  }

  const activeGroupSel = normalizeActiveGroupSelection(state.activeGroup || 'All');
  const singleGroupActive = activeGroupSel && activeGroupSel !== 'All' && activeGroupSel !== UNGROUPED_FILTER_VALUE;
  const collapsed = getCollapsedGroupState();
  const sections = groupRosterPlayersBySection(filtered, getPlayerGroups);
  return sections.map((section) => {
    // A single active group is always shown expanded (the operator just asked to see it).
    const isCollapsed = singleGroupActive ? false : !!collapsed[section.key];
    const labelId = `roster-group-label-${section.key.replace(/[^a-z0-9_-]/gi, '-')}`;
    const caretSVG = '<svg class="roster-group-caret" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path d="M5 3l6 5-6 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    return `
      <section class="roster-group ${isCollapsed ? 'is-collapsed' : ''}" data-group-key="${escapeHTMLText(section.key)}">
        <button type="button" class="roster-group-head" data-role="toggle-group" data-group-key="${escapeHTMLText(section.key)}" aria-expanded="${isCollapsed ? 'false' : 'true'}" aria-controls="${labelId}-body">
          <span class="roster-group-title" id="${labelId}">${escapeHTMLText(section.name)}</span>
          <span class="roster-group-count">${section.players.length}</span>
          ${caretSVG}
        </button>
        <div class="roster-group-body" id="${labelId}-body">
          ${section.players.map(renderRow).join('')}
        </div>
      </section>
    `;
  }).join('');
}

// C48.5 — per-group collapse state for the admin Players grouped sections. Persisted in
// sessionStorage (survives background syncs/partialRender within the session; default EXPANDED).
// Keyed by the section key the grouping helper produces (lowercased group name / '__ungrouped__').
const GROUP_COLLAPSE_KEY = 'as_group_collapsed';
function getCollapsedGroupState() {
  try {
    const raw = sessionStorage.getItem(GROUP_COLLAPSE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch (_) { return {}; }
}
function setGroupCollapsed(groupKey, collapsed) {
  const key = String(groupKey || '').trim();
  if (!key) return;
  const map = getCollapsedGroupState();
  if (collapsed) map[key] = true; else delete map[key];
  try { sessionStorage.setItem(GROUP_COLLAPSE_KEY, JSON.stringify(map)); } catch (_) { /* storage may be full/blocked */ }
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
  masterAdminAuthenticated: false, // true only for an owner-role server session
  // Identity/Accounts (2026-07-08) — real email+password sign-in on top of the additive DB foundation.
  // authSession = live Supabase session (null when signed out); account = { id, email };
  // role = community role from caller_role (owner|organizer|player|null); owner/organizer sets isAdmin
  // in onAuthStateChange — the ONLY admin source since Task 13 retired the code login (2026-07-11).
  authSession: null,
  account: null,
  role: null,
  sharedSyncState: (SUPABASE_AUTHORITATIVE && supabaseClient)
    ? SHARED_SYNC_PENDING
    : SHARED_SYNC_LOCAL_ONLY,
  sharedSyncError: '',
  currentSession: null, // { date, time, location } or null — legacy single sessions row (day-of fallback pre-0046)
  pickupDays: [],       // Task 2: the pickup_days rows [{ id, day, time_label, location }] — the day-of gate reads the SET
  pickupDaysLoaded: false, // true once loadPickupDays succeeds (table exists); false → pickupDaySet falls back to currentSession
  lastSharedSyncAt: 0,
  operatorActions: [],
  copilotMessages: [], // C28 Slice 1 — admin co-pilot chat thread (persists across render() rebuilds)
  // Tournament v2 (real Supabase tables — Phase 1+)
  tournaments: [],            // [{id,name,status,match_cap,pool_count,net_count,created_at}]
  activeTournamentId: null,   // selected tournament id (admin)
  tournamentTeams: [],        // teams for the active tournament
  tournamentPools: [],        // pools for the active tournament
  tournamentMatches: [],      // matches for the active tournament
  teamMembers: null,          // Slice 3c: shaped claim candidates for the active tournament (signed-in only; null when signed out)
  myClaimedPlayer: null,      // Round 2 §12.3: {id,name} of MY claimed player for the check-in hero (signed-in only; null when signed out / unclaimed / ambiguous)
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

async function tdbCreateTournament({ name, pool_count, net_count, preset }) {
  if (!supabaseClient) throw new Error('No database connection.');
  const p = preset || {};
  const bracketTarget = Number(p.bracket_target) || 25;
  const row = {
    name: String(name || '').trim() || 'Untitled Tournament',
    match_cap: bracketTarget,            // back-compat: legacy readers + the result-modal auto-fill use the bracket target
    pool_count: Number(pool_count) || 4,
    net_count: Number(net_count) || 10,
    pool_target: Number(p.pool_target) || 15,
    pool_cap: (p.pool_cap == null || p.pool_cap === '') ? 20 : Number(p.pool_cap),
    bracket_target: bracketTarget,
    bracket_cap: (p.bracket_cap == null || p.bracket_cap === '') ? null : Number(p.bracket_cap),
    win_by_2: p.win_by_2 == null ? true : !!p.win_by_2,
    team_size: Number(p.team_size) || 4, // C68: copy the format's players-per-team onto the tournament
    registration_open: true // you create a tournament so teams can register — open it immediately (admin
    // can Close it anytime). Without this it defaulted CLOSED, so the public had no Register tab/screen.
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

// NF-1 (Option C+): saveable scoring formats (admin-managed, persist until deleted; migration 0026).
async function tdbListScoringPresets() {
  if (!supabaseClient) return [];
  const { data, error } = await supabaseClient
    .from('scoring_presets').select('*').order('created_at', { ascending: true });
  if (error) { console.error('tdbListScoringPresets', error); return []; }
  return data || [];
}

async function tdbCreateScoringPreset(p) {
  if (!supabaseClient) throw new Error('No database connection.');
  const name = String((p && p.name) || '').trim();
  const bt = Number(p && p.bracket_target);
  if (!name) throw new Error('Name the format.');
  if (!bt) throw new Error('Set the bracket target.');
  const row = {
    name,
    pool_target: Number(p.pool_target) || 15,
    pool_cap: (p.pool_cap == null || p.pool_cap === '') ? null : Number(p.pool_cap),
    bracket_target: bt,
    bracket_cap: (p.bracket_cap == null || p.bracket_cap === '') ? null : Number(p.bracket_cap),
    win_by_2: p.win_by_2 == null ? true : !!p.win_by_2,
    team_size: Number(p.team_size) || 4 // C68: players per team (registration enforces exactly this)
  };
  const { data, error } = await supabaseClient
    .from('scoring_presets').insert([row]).select().single();
  if (error) { console.error('tdbCreateScoringPreset', error); throw error; }
  return data;
}

async function tdbDeleteScoringPreset(id) {
  if (!supabaseClient || !id) return;
  const { error } = await supabaseClient.from('scoring_presets').delete().eq('id', id);
  if (error) { console.error('tdbDeleteScoringPreset', error); throw error; }
}

// The create-form "Game format" picker: saved formats (pick / delete) + an inline "new format" form.
// Rendered into #tv2-format-picker; handlers update that container surgically (never a full render())
// so the typed tournament name + any open new-format fields are never wiped.
function buildFormatPickerHTML() {
  const presets = state.scoringPresets || [];
  const selId = state.selectedFormatId;
  const desc = (p) => `Pool to ${p.pool_target}${p.pool_cap != null ? ' (cap ' + p.pool_cap + ')' : ''} · Bracket to ${p.bracket_target}${p.win_by_2 ? ' · win by 2' : ''}${p.team_size ? ' · ' + p.team_size + '/team' : ''}`;
  const rows = presets.length
    ? presets.map((p) => {
        const sel = p.id === selId;
        return `<div data-role="tv2-pick-format" data-id="${escapeHTML(p.id)}" style="display:flex;align-items:center;gap:8px;padding:12px 14px;border:${sel ? '2px solid var(--accent)' : '1px solid var(--border)'};border-radius:12px;background:${sel ? 'var(--accent-soft)' : 'var(--surface)'};cursor:pointer;">
          <div style="flex:1;min-width:0;">
            <div data-fmt-name style="font-weight:700;font-size:15px;color:${sel ? 'var(--accent)' : 'var(--text)'};">${escapeHTML(p.name || '')}</div>
            <div style="font-size:12.5px;color:var(--muted);margin-top:2px;">${escapeHTML(desc(p))}</div>
          </div>
          <button type="button" data-role="tv2-delete-format" data-id="${escapeHTML(p.id)}" title="Delete format" aria-label="Delete format" style="border:none;background:transparent;color:var(--muted);font-size:20px;line-height:1;cursor:pointer;padding:0 4px;">×</button>
        </div>`;
      }).join('')
    : '<p class="small" style="color:var(--muted);margin:0;">No saved formats yet — add one below.</p>';
  const form = state.newFormatOpen
    ? `<div style="border:1px dashed var(--accent);border-radius:12px;padding:14px;background:var(--surface);">
        <div style="font-weight:700;font-size:14px;color:var(--accent);margin-bottom:10px;">+ New saved format</div>
        <input type="text" id="nf-name" placeholder="Format name (e.g. Summer Slam)" style="width:100%;margin-bottom:10px;" />
        <div style="display:flex;gap:8px;margin-bottom:10px;">
          <label style="flex:1;display:flex;flex-direction:column;gap:2px;font-size:12px;color:var(--muted);">Pool to<input type="number" id="nf-ptarget" value="15" min="1" inputmode="numeric" style="width:100%;" /></label>
          <label style="flex:1;display:flex;flex-direction:column;gap:2px;font-size:12px;color:var(--muted);">Pool cap<input type="number" id="nf-pcap" value="20" min="1" inputmode="numeric" style="width:100%;" /></label>
          <label style="flex:1;display:flex;flex-direction:column;gap:2px;font-size:12px;color:var(--muted);">Bracket to<input type="number" id="nf-btarget" placeholder="25" min="1" inputmode="numeric" style="width:100%;" /></label>
          <label style="flex:1;display:flex;flex-direction:column;gap:2px;font-size:12px;color:var(--muted);">Per team<input type="number" id="nf-teamsize" value="4" min="1" inputmode="numeric" style="width:100%;" /></label>
        </div>
        <div id="nf-winby" data-role="tv2-winby" data-on="1" role="switch" aria-checked="true" tabindex="0" style="display:inline-flex;align-items:center;gap:8px;font-size:13px;color:var(--text-2);cursor:pointer;margin-bottom:12px;user-select:none;">
          <span style="width:38px;height:22px;border-radius:999px;background:var(--accent);position:relative;display:inline-block;flex:0 0 auto;"><span style="position:absolute;top:2px;left:18px;width:18px;height:18px;border-radius:50%;background:#fff;transition:left .12s;"></span></span>
          Win by 2
        </div>
        <div id="nf-msg" class="small" style="color:var(--danger);margin-bottom:8px;display:none;"></div>
        <button type="button" class="primary" data-role="tv2-save-format" style="width:100%;">Save format</button>
        <div class="small" style="color:var(--muted);margin-top:6px;text-align:center;">Saved formats stay until you delete them</div>
      </div>`
    : `<button type="button" data-role="tv2-newformat-toggle" style="width:100%;padding:11px;border:1px dashed var(--accent);border-radius:12px;background:transparent;color:var(--accent);font-weight:600;font-size:14px;cursor:pointer;">+ New saved format</button>`;
  return `<div style="font-size:13px;color:var(--muted);margin-bottom:8px;">Game format <span style="color:var(--danger);font-weight:600;">— pick a saved format</span></div>
    <div style="display:flex;flex-direction:column;gap:8px;">${rows}${form}</div>`;
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
  // Wave 1e (C49a): case-insensitive duplicate-name guard at the DATA layer, so EVERY add door is
  // covered — the interactive handler had its own guard but the co-pilot setup loop and any batch/PDF
  // import call tdbAddTeam directly and bypassed it (duplicate teams = the same "who is who" risk C47
  // fixed for players).
  const { data: existingTeams } = await supabaseClient
    .from('teams').select('name').eq('tournament_id', tournamentId);
  if ((existingTeams || []).some((t) => String(t.name || '').trim().toLowerCase() === row.name.toLowerCase())) {
    throw new Error('A team named "' + row.name + '" is already in this tournament.');
  }
  const { data, error } = await supabaseClient
    .from('teams').insert([row]).select().single();
  if (error) { console.error('tdbAddTeam', error); throw error; }
  return data;
}

// Tournament team self-registration (replaces the Google Form). Anon writes through the locked RLS via
// the register_team SECURITY DEFINER RPC (migration 0024); admin reads/edits teams directly.
async function tdbRegisterTeam(tournamentId, teamName, roster, contact, paid) {
  if (!supabaseClient) throw new Error('No database connection.');
  const cleanRoster = (roster || []).map((n) => String(n || '').trim()).filter(Boolean);
  const { data, error } = await supabaseClient.rpc('register_team', {
    p_tournament_id: tournamentId,
    p_team_name: String(teamName || '').trim(),
    p_roster: cleanRoster,
    p_contact: contact ? String(contact).trim() : null,
    p_paid: !!paid
  });
  if (error) { console.error('tdbRegisterTeam', error); throw error; }
  return Array.isArray(data) ? data[0] : data;
}
// Admin: flip registration open/closed + save the Venmo link + buy-in text (direct authed update).
async function tdbSetTournamentFields(tournamentId, fields) {
  if (!supabaseClient || !tournamentId) throw new Error('No tournament.');
  const { error } = await supabaseClient.from('tournaments')
    .update({ ...fields, updated_at: new Date().toISOString() }).eq('id', tournamentId);
  if (error) { console.error('tdbSetTournamentFields', error); throw error; }
}
// Admin: mark a registered team paid / unpaid.
async function tdbSetTeamPaid(teamId, paid) {
  if (!supabaseClient || !teamId) throw new Error('No team.');
  const { error } = await supabaseClient.from('teams').update({ paid: !!paid }).eq('id', teamId);
  if (error) { console.error('tdbSetTeamPaid', error); throw error; }
}

// NF-3b: admin rename a team (fix a typo'd self-registered name without raw DB). Admin authenticated
// write (same door as tdbSetTeamPaid); the caller guards against a duplicate name.
async function tdbRenameTeam(teamId, newName) {
  if (!supabaseClient || !teamId) throw new Error('No team.');
  const nm = String(newName || '').trim();
  if (!nm) throw new Error('Team name is required.');
  const { error } = await supabaseClient.from('teams').update({ name: nm }).eq('id', teamId);
  if (error) { console.error('tdbRenameTeam', error); throw error; }
}

// Admin: replace a team's roster (edit its players post-registration). Mirrors tdbRenameTeam (direct authed
// update). Powers tournament-mode "Edit roster" (Mike, 2026-06-27). Slice 3a: also sync team_members so an
// edited roster keeps its player links (additive — sync adds missing links; it does not prune removed names).
async function tdbSetTeamRoster(teamId, roster) {
  if (!supabaseClient || !teamId) throw new Error('No team.');
  const clean = (roster || []).map((n) => String(n || '').trim()).filter(Boolean);
  const { error } = await supabaseClient.from('teams').update({ roster: clean }).eq('id', teamId);
  if (error) { console.error('tdbSetTeamRoster', error); throw error; }
  const { error: syncErr } = await supabaseClient.rpc('sync_team_roster', { p_team_id: teamId, p_roster: clean });
  if (syncErr) { console.error('tdbSetTeamRoster sync', syncErr); throw syncErr; }
}

// SC-7: withdraw a team mid-pool by FORFEITING its remaining unplayed pool games (the opponent wins by
// the pool target). This keeps computeStandings/seeding fair — a withdrawn team's unplayed games no longer
// stay 'scheduled' and silently distort everyone else's records. Reuses the scored-result path (C50 forfeit
// shape); the team ranks last (it lost its remaining games). No schema change.
async function tdbWithdrawTeam(teamId, tournament) {
  if (!supabaseClient || !teamId) throw new Error('No team.');
  const unplayed = (state.tournamentMatches || []).filter((m) =>
    m.phase === 'pool' && m.status !== 'final' && m.team_a_id && m.team_b_id &&
    (m.team_a_id === teamId || m.team_b_id === teamId));
  const r = scoringRulesFor('pool', tournament || {});
  const winS = r.target || Number((tournament || {}).pool_target) || Number((tournament || {}).match_cap) || 15;
  const loseS = Math.max(0, winS - 2);
  let n = 0;
  for (const m of unplayed) {
    const withdrawnIsA = m.team_a_id === teamId;
    const sa = withdrawnIsA ? loseS : winS; // the OTHER team wins by forfeit
    const sb = withdrawnIsA ? winS : loseS;
    await tdbSubmitResult(m, String(sa), String(sb));
    n++;
  }
  return n;
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

// Wave 1c (2026-06-25): in-flight guard for the pool-setup writers. tdbDrawPools/tdbStartPoolPlay
// each delete-then-insert; a double-tap on Draw/Start (the common case) would otherwise fire the
// whole sequence twice and silently double the schedule. This module flag makes a re-entrant call a
// no-op (the first call is handling it). The DB-level guarantee against the rarer two-device race is
// the partial unique indexes in migration 0023 (a concurrent duplicate INSERT fails cleanly).
let _poolSetupInFlight = false;

// Randomly draw pools: clears existing pools (cascades matches; sets teams.pool_id null),
// creates pool_count pools (A,B,...), shuffles teams, round-robin-assigns them to pools.
async function tdbDrawPools(tournament) {
  if (!supabaseClient || !tournament) throw new Error('No tournament.');
  if (_poolSetupInFlight) return; // double-tap guard — the first call is handling it
  _poolSetupInFlight = true;
  try {
  const cur = (await supabaseClient.from('tournaments').select('status').eq('id', tournament.id).single()).data;
  if (cur && cur.status !== 'setup') throw new Error('Pool play already started — Reset Pools first.');
  const teams = await tdbListTeams(tournament.id);
  if (teams.length < 2) throw new Error('Add at least 2 teams first.');
  // C25 item 9: one delete for ALL existing pools of this tournament (was a per-pool delete loop).
  // FK pools<-teams is ON DELETE SET NULL, so this also nulls teams.pool_id; cascades pool matches.
  {
    const { error } = await supabaseClient.from('pools').delete().eq('tournament_id', tournament.id);
    if (error) throw error;
  }
  // Clamp pools so every pool gets at least 2 teams (no 1-team / 0-match pools).
  const poolCount = Math.max(1, Math.min(Number(tournament.pool_count) || 1, Math.floor(teams.length / 2)));
  // C25 item 9: one batched insert for all pools (was N single inserts). RETURNING preserves VALUES order;
  // sort by display_order anyway so poolRows[i] aligns with the round-robin index below.
  const poolPayload = [];
  for (let i = 0; i < poolCount; i++) {
    poolPayload.push({ tournament_id: tournament.id, label: String.fromCharCode(65 + i), display_order: i });
  }
  const { data: insertedPools, error: poolErr } = await supabaseClient.from('pools').insert(poolPayload).select();
  if (poolErr) throw poolErr;
  if (!insertedPools || insertedPools.length !== poolCount) throw new Error('Pool creation failed.');
  const poolRows = insertedPools.slice().sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
  const shuffled = teams.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = tmp;
  }
  // C25 item 9: round-robin-assign teams to pools, then ONE grouped update per pool (was one update
  // per team). Grouped .in('id', ids) updates only pool_id — safe (a partial-row upsert would fail the
  // teams NOT-NULL columns before ON CONFLICT). poolCount updates instead of teams.length.
  const idsByPool = poolRows.map(() => []);
  for (let i = 0; i < shuffled.length; i++) idsByPool[i % poolCount].push(shuffled[i].id);
  for (let p = 0; p < poolRows.length; p++) {
    if (!idsByPool[p].length) continue;
    const { error } = await supabaseClient.from('teams').update({ pool_id: poolRows[p].id }).in('id', idsByPool[p]);
    if (error) throw error;
  }
  } finally { _poolSetupInFlight = false; }
}

// Generate round-robin pool matches, assign nets + per-net queue order, set status='pools'.
async function tdbStartPoolPlay(tournament) {
  if (!supabaseClient || !tournament) throw new Error('No tournament.');
  if (_poolSetupInFlight) return; // double-tap guard — the first call is handling it
  _poolSetupInFlight = true;
  try {
  const cur = (await supabaseClient.from('tournaments').select('status').eq('id', tournament.id).single()).data;
  if (cur && cur.status !== 'setup') throw new Error('Pool play already started — Reset Pools first.');
  const pools = await tdbListPools(tournament.id);
  if (!pools.length) throw new Error('Draw pools first.');
  const teams = await tdbListTeams(tournament.id);
  // Reliability (2026-06-24): check the delete — a silent failure here would leave old pool matches
  // and then insert new ones on top (duplicate/conflicting matches), with no error surfaced.
  const { error: delErr } = await supabaseClient.from('matches').delete().eq('tournament_id', tournament.id).eq('phase', 'pool');
  if (delErr) throw delErr;
  const netCount = Math.max(1, Number(tournament.net_count) || 1);
  // C70 (Mike, 2026-06-26): each pool OWNS a contiguous block of nets (split as evenly as possible across
  // pools) instead of nets shared globally — so a player opens their phone and sees their pool on its own
  // courts. Each pool's games round-robin across ITS nets with a per-net queue; "current on a net" = the
  // lowest-queue unplayed game on it, so scoring auto-advances to the next matchup (render-time derivation).
  const netBlocks = splitNetsAcrossPools(netCount, pools.length);
  const rows = [];
  pools.forEach((pool, pi) => {
    const ids = teams.filter((t) => t.pool_id === pool.id).map((t) => t.id);
    const pairs = generateRoundRobin(ids);
    const slots = distributeGamesOnNets(pairs.length, netBlocks[pi] || [pi + 1]);
    pairs.forEach((pair, gi) => {
      rows.push({
        tournament_id: tournament.id, phase: 'pool', pool_id: pool.id,
        team_a_id: pair[0], team_b_id: pair[1], status: 'scheduled',
        net: slots[gi].net, queue_order: slots[gi].queue_order, version: 0
      });
    });
  });
  if (!rows.length) throw new Error('No pool games to schedule — each pool needs at least 2 teams.');
  const { error } = await supabaseClient.from('matches').insert(rows);
  if (error) throw error;
  // Reliability (2026-06-24): check the status update — if it failed silently, 200+ matches would be
  // inserted while status stays 'setup', leaving the tournament stuck (UI never transitions to pools).
  const { error: upErr } = await supabaseClient.from('tournaments')
    .update({ status: 'pools', updated_at: new Date().toISOString() }).eq('id', tournament.id);
  if (upErr) throw upErr;
  } finally { _poolSetupInFlight = false; }
}

// Task 7 (pick R9) — atomic pool setup. draw_pools_atomic / start_pool_play_atomic (migration 0048) wrap
// today's non-atomic client sequences in ONE transaction each, closing the "3-write landmine" (a failure
// mid-sequence used to leave pools/matches half-built). DESIGN CHOICE: the RPCs take the CLIENT-COMPUTED
// rows as a jsonb payload rather than regenerating server-side — the draw uses Math.random and the schedule
// is nontrivial (generateRoundRobin + splitNetsAcrossPools + distributeGamesOnNets, all tested pure helpers),
// so porting the generation to PL/pgSQL would create a second source of truth that could drift. This mirrors
// generate_bracket_atomic (0021), which takes p_matches jsonb for the same reason. The RPCs do only the
// atomic DELETE + INSERT + status flip.
function isFnMissingError(err) {
  if (!err) return false;
  const code = String(err.code || '');
  const msg = String((err.message || '') + ' ' + (err.details || '') + ' ' + (err.hint || ''));
  return code === 'PGRST202' || code === '42883' || /could not find the function|function .* does not exist|schema cache/i.test(msg);
}
const RPC_NOT_READY_MSG = 'Pool setup isn\'t available yet — the server is still updating. Try again in a minute.';

async function tdbDrawPoolsAtomic(tournament) {
  if (!supabaseClient || !tournament) throw new Error('No tournament.');
  const teams = await tdbListTeams(tournament.id);
  if (teams.length < 2) throw new Error('Add at least 2 teams first.');
  // Same clamp as the classic tdbDrawPools: every pool gets ≥2 teams (no 1-team / 0-match pools).
  const poolCount = Math.max(1, Math.min(Number(tournament.pool_count) || 1, Math.floor(teams.length / 2)));
  const pools = [];
  for (let i = 0; i < poolCount; i++) pools.push({ label: String.fromCharCode(65 + i), display_order: i });
  const shuffled = teams.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = tmp;
  }
  // Round-robin-assign shuffled teams to pools by display_order; the RPC resolves display_order → new pool id.
  const assignments = shuffled.map((tm, i) => ({ team_id: tm.id, display_order: i % poolCount }));
  const { error } = await supabaseClient.rpc('draw_pools_atomic', {
    p_tournament_id: tournament.id, p_pools: pools, p_assignments: assignments,
  });
  if (error) { if (isFnMissingError(error)) throw new Error(RPC_NOT_READY_MSG); throw error; }
}

async function tdbStartPoolPlayAtomic(tournament) {
  if (!supabaseClient || !tournament) throw new Error('No tournament.');
  const pools = await tdbListPools(tournament.id);
  if (!pools.length) throw new Error('Draw pools first.');
  const teams = await tdbListTeams(tournament.id);
  const netCount = Math.max(1, Number(tournament.net_count) || 1);
  const netBlocks = splitNetsAcrossPools(netCount, pools.length);
  const rows = [];
  pools.forEach((pool, pi) => {
    const ids = teams.filter((tm) => tm.pool_id === pool.id).map((tm) => tm.id);
    const pairs = generateRoundRobin(ids);
    const slots = distributeGamesOnNets(pairs.length, netBlocks[pi] || [pi + 1]);
    pairs.forEach((pair, gi) => rows.push({
      pool_id: pool.id, team_a_id: pair[0], team_b_id: pair[1],
      net: slots[gi].net, queue_order: slots[gi].queue_order,
    }));
  });
  if (!rows.length) throw new Error('No pool games to schedule — each pool needs at least 2 teams.');
  const { error } = await supabaseClient.rpc('start_pool_play_atomic', {
    p_tournament_id: tournament.id, p_matches: rows,
  });
  if (error) { if (isFnMissingError(error)) throw new Error(RPC_NOT_READY_MSG); throw error; }
}

// Task 10 (pick R12) — deliberate close-out RPCs (migration 0050). Both are SECURITY DEFINER + is_organizer-
// guarded server-side; the client just calls them. GUARD FOR THE PRE-APPLY WINDOW: until the controller applies
// 0050 the functions don't exist — surface a friendly "still updating" notice (isFnMissingError) and NEVER fall
// back to a direct status write (a raw client update would bypass the guard/validation the RPC exists to
// enforce, and re-introduce exactly the June drift this task fixes).
const CLOSEOUT_RPC_NOT_READY = 'Close-out isn\'t available yet — the server is still updating. Try again in a minute.';
// close: p_champion_team_id null = "no champion recorded" (allowed). The RPC validates the team belongs to the
// tournament, refuses to close from 'setup', sets status='completed' + champion + registration_open=false.
async function tdbCloseTournament(tournamentId, championTeamId) {
  if (!supabaseClient || !tournamentId) throw new Error('No tournament.');
  const { error } = await supabaseClient.rpc('close_tournament', {
    p_tournament_id: tournamentId, p_champion_team_id: championTeamId || null,
  });
  if (error) { if (isFnMissingError(error)) throw new Error(CLOSEOUT_RPC_NOT_READY); throw error; }
}
// reopen: only from 'completed'; restores status (bracket if main matches exist, else pools). KEEPS the
// recorded champion (0050 header note) — a quick score fix must not lose a correct champion.
async function tdbReopenTournament(tournamentId) {
  if (!supabaseClient || !tournamentId) throw new Error('No tournament.');
  const { error } = await supabaseClient.rpc('reopen_tournament', { p_tournament_id: tournamentId });
  if (error) { if (isFnMissingError(error)) throw new Error(CLOSEOUT_RPC_NOT_READY); throw error; }
}

// Task 11 (pick R6) — admin seats + activity-log RPCs (migration 0051). All three are SECURITY DEFINER +
// role-guarded server-side (OWNER for set_member_role, organizer for the two reads); the client just calls
// them. PRE-APPLY GUARD: until the controller applies 0051 the functions don't exist — surface the friendly
// "still updating" notice (isFnMissingError) and NEVER fall back to a direct memberships/table write
// (memberships has no client INSERT policy; the log tables are RLS-locked — a fallback would only fail less
// honestly and would bypass the owner guard these functions enforce).
const ADMIN_RPC_NOT_READY = 'Admins tools aren\'t available yet — the server is still updating. Try again in a minute.';
// OWNER-ONLY. role = 'organizer' (promote to co-admin) | 'player' (remove admin). The server enforces the
// owner guard, the "account must exist" check, and the no-mint-owner / no-touch-owner rails.
async function tdbSetMemberRole(email, role) {
  if (!supabaseClient) throw new Error('No connection.');
  const { error } = await supabaseClient.rpc('set_member_role', { p_email: email, p_role: role });
  if (error) { if (isFnMissingError(error)) throw new Error(ADMIN_RPC_NOT_READY); throw error; }
}
async function tdbListAdminSeats() {
  if (!supabaseClient) throw new Error('No connection.');
  const { data, error } = await supabaseClient.rpc('list_admin_seats');
  if (error) { if (isFnMissingError(error)) throw new Error(ADMIN_RPC_NOT_READY); throw error; }
  return Array.isArray(data) ? data : [];
}
async function tdbReadActionLog(limit) {
  if (!supabaseClient) throw new Error('No connection.');
  const { data, error } = await supabaseClient.rpc('read_action_log', { p_limit: limit || 50 });
  if (error) { if (isFnMissingError(error)) throw new Error(ADMIN_RPC_NOT_READY); throw error; }
  return Array.isArray(data) ? data : [];
}

// C25 item 3: before submitting, sanity-check a lopsided score that still passes validation
// (a fat-finger blowout). Empty scores (e.g. tap-to-win bracket) skip the check. Returns false on cancel.
var BIG_MARGIN = 20;
async function confirmBigMargin(saStr, sbStr) {
  const aRaw = String(saStr == null ? '' : saStr).trim();
  const bRaw = String(sbStr == null ? '' : sbStr).trim();
  if (aRaw === '' || bRaw === '') return true;                    // no scores entered -> nothing to confirm
  const a = Number(aRaw), b = Number(bRaw);
  if (!Number.isInteger(a) || !Number.isInteger(b)) return true;  // let validateScores surface the error
  if (Math.abs(a - b) < BIG_MARGIN) return true;
  // C49b: styled confirm instead of native confirm().
  return await appConfirm({ title: 'Big margin', message: 'Submit ' + a + '–' + b + '? Tap Cancel to fix it.', confirmText: 'Submit' });
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

// C72: write the RUNNING live score (a spectator tapping +1/-1) via the anon set_live_score RPC
// (migration 0030) — sets status='live' + the running score, last-write-wins. Finalizing the game is the
// existing submit_match_score path (fired from the live scorer's game-over confirm). Optimistic: the UI
// updates instantly; this persists in the background + broadcasts to everyone via realtime.
async function tdbSetLiveScore(match, a, b) {
  if (!supabaseClient || !match) throw new Error('No match.');
  const sa = Math.max(0, Math.floor(Number(a) || 0));
  const sb = Math.max(0, Math.floor(Number(b) || 0));
  const { data, error } = await supabaseClient.rpc('set_live_score', {
    p_match: match.id, p_score_a: sa, p_score_b: sb
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

// NF-4: edit a FINALIZED match's score in place (no cascade) via the edit_match_score RPC (migration
// 0027). Same-winner corrections only — the RPC refuses a winner flip (that needs Clear, which re-opens
// the next round). Used by the result modal's edit mode for a final match.
async function tdbEditMatchScore(match, scoreA, scoreB) {
  if (!supabaseClient || !match) throw new Error('No match.');
  const { sa, sb } = validateScores(scoreA, scoreB);
  const { data, error } = await supabaseClient.rpc('edit_match_score', {
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

// C70 (Mike, "auto-split, then editable"): re-assign which nets a pool plays on. The pool's UNPLAYED games
// are re-distributed across the new nets (round-robin, fresh per-net queue); finished games keep their net
// (history). Net assignment is DERIVED from the matches, so this update is the source of truth — no schema
// change. Each row uses the same version-CAS as tdbClearResult so a concurrent edit fails cleanly.
async function tdbSetPoolNets(pool, newNets, matches) {
  if (!supabaseClient || !pool) throw new Error('No pool.');
  const nets = [...new Set((newNets || []).map(Number).filter((n) => Number.isInteger(n) && n >= 1))].sort((a, b) => a - b);
  if (!nets.length) throw new Error('Enter at least one net (e.g. 1, 2).');
  const unplayed = (matches || [])
    .filter((m) => m.pool_id === pool.id && m.phase === 'pool' && m.status !== 'final')
    .sort((a, b) => (a.queue_order || 0) - (b.queue_order || 0));
  const slots = distributeGamesOnNets(unplayed.length, nets);
  for (let i = 0; i < unplayed.length; i++) {
    const m = unplayed[i];
    const { data, error } = await supabaseClient.from('matches')
      .update({ net: slots[i].net, queue_order: slots[i].queue_order, version: (m.version || 0) + 1, updated_at: new Date().toISOString() })
      .eq('id', m.id).eq('version', m.version || 0).select();
    if (error) throw error;
    if (!data || data.length === 0) throw new Error('Another device just updated a game — refreshing.');
  }
  return nets;
}

// Data-integrity (2026-06-30): when an admin changes the net count DURING pool play OR the bracket, the matches
// table must be re-netted to match — otherwise net_count and matches.net drift ("games on nets 1-10 but
// net_count=9"). computeNetAssignments derives the new net (and, for pools, queue_order) of every UNPLAYED
// match using the SAME pure helpers the draw/generate use; tdbApplyNetCountChange then writes net_count + every
// match in ONE transaction (migration 0031) with a per-row version-CAS, so a concurrent score either succeeds
// cleanly or rolls the WHOLE change back (true atomicity — no half-applied drift). Used by BOTH settings save
// paths: the Manage Settings PAGE (tv2-save-settings-page) and the classic Tournament-tab Edit MODAL.
function computeNetAssignments(status, pools, matches, newNets) {
  const ms = matches || [];
  const out = [];
  if (status === 'pools') {
    // Each pool's UNPLAYED games spread across its new contiguous net block (net + queue_order both change).
    const ordered = [...(pools || [])].sort((a, b) => String(a.label || '').localeCompare(String(b.label || '')));
    const blocks = splitNetsAcrossPools(newNets, ordered.length);
    ordered.forEach((pool, pi) => {
      const unplayed = ms.filter((m) => m.pool_id === pool.id && m.phase === 'pool' && m.status !== 'final')
        .sort((a, b) => (a.queue_order || 0) - (b.queue_order || 0));
      const slots = distributeGamesOnNets(unplayed.length, blocks[pi] || [pi + 1]);
      unplayed.forEach((m, i) => out.push({ match_id: m.id, version: m.version || 0, net: slots[i].net, queue_order: slots[i].queue_order }));
    });
  } else if (status === 'bracket') {
    // Bracket: assignBracketNets recomputes the positional net for the new count; queue_order (play order) is
    // unchanged. Only emit games whose net actually changes + that aren't final (a final game keeps its court).
    const bracket = ms.filter((m) => m.phase === 'main');
    const netById = assignBracketNets(bracket, newNets);
    bracket.filter((m) => m.status !== 'final').forEach((m) => {
      if (netById[m.id] != null && netById[m.id] !== m.net) out.push({ match_id: m.id, version: m.version || 0, net: netById[m.id] });
    });
  }
  return out;
}

async function tdbApplyNetCountChange(tournamentId, newNetCount, assignments) {
  if (!supabaseClient || !tournamentId) throw new Error('No tournament.');
  const { data, error } = await supabaseClient.rpc('apply_net_count_change', {
    p_tournament_id: tournamentId, p_net_count: newNetCount, p_assignments: assignments || [],
  });
  if (error) throw error;
  return data;
}

// Seed from pool standings + generate + persist a double-elimination bracket.
// #6 (Mike 2026-06-30): undo the bracket WITHOUT touching pool results — delete only the bracket
// (phase 'main') matches and drop status back to 'pools', so the admin can re-generate. Mirrors the
// authenticated direct-write pattern of tdbDrawPools (RLS allows admin match writes); pool matches +
// their scores are untouched. Delete first (recoverable on a mid-failure), then flip the status.
async function tdbResetBracket(tournament) {
  if (!supabaseClient || !tournament) throw new Error('No tournament.');
  const { error: delErr } = await supabaseClient.from('matches').delete().eq('tournament_id', tournament.id).eq('phase', 'main');
  if (delErr) { console.error('tdbResetBracket delete', delErr); throw delErr; }
  await tdbSetTournamentFields(tournament.id, { status: 'pools' });
}
async function tdbGenerateBracket(tournament, seedOrder) {
  if (!supabaseClient || !tournament) throw new Error('No tournament.');
  // Bracket-wipe race guard (defense-in-depth; the real guard is server-side in generate_bracket_atomic):
  // re-fetch the LIVE status — a second device may have already generated (status -> 'bracket'). Regenerating
  // would DELETE the scored bracket. The captured `tournament` can be stale 'pools' across devices/modals.
  const { data: freshT, error: ftErr } = await supabaseClient.from('tournaments').select('status').eq('id', tournament.id).single();
  if (ftErr) throw ftErr;
  if (!freshT || freshT.status !== 'pools') throw new Error('The bracket was already generated. Reset pools first if you want to rebuild it.');
  const teams = await tdbListTeams(tournament.id);
  const poolMatches = await tdbListMatches(tournament.id, 'pool');
  if (!poolMatches.length) throw new Error('No pool play to seed from.');
  if (!poolMatches.every((m) => m.status === 'final' || !m.team_a_id || !m.team_b_id)) throw new Error('Finish all pool games first.');

  let seeding = computeSeeding(teams, poolMatches); // ordered seed 1..N (by win% then point diff)
  // Seed override (transient, from the admin's manual ▲/▼ reorder): if a valid permutation of the
  // teams is passed, seed in THAT order instead of the computed ranking. computeSeeding stays the default.
  if (Array.isArray(seedOrder) && seedOrder.length === seeding.length) {
    const byId = {}; seeding.forEach((r) => { byId[r.teamId] = r; });
    if (seedOrder.every((id) => byId[id])) seeding = seedOrder.map((id, i) => ({ ...byId[id], seed: i + 1 }));
  }
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

  // C51: auto-assign each bracket match a net (matches in the same round spread across the
  // available nets 1..net_count) + a round-major queue_order, so the "Net N" chip + a bracket net
  // board can show what plays where — instead of the admin calling out "WB R2 M1, go to net 3".
  const netCount = Math.max(1, Number(tournament.net_count) || 1);
  const sidePri = (s) => (s === 'winners' ? 0 : s === 'losers' ? 1 : 2);
  // The grand final has round=1 (reset round=2) but is PLAYED last — its raw round must not sort it among the
  // earliest matches (which gave it queue_order ~4 and "Net 1"). Order it after every winners/losers round.
  const maxRound = real.reduce((mx, m) => Math.max(mx, m.round || 0), 0);
  const playRound = (m) => (m.side === 'grand_final' ? maxRound + m.round : m.round);
  const netInfo = {}; const perRound = {}; let q = 0;
  real.slice().sort((a, b) => playRound(a) - playRound(b) || sidePri(a.side) - sidePri(b.side) || a.slot - b.slot)
    .forEach((m) => {
      if (m.side === 'grand_final') { netInfo[m.key] = { net: null, queue_order: q++ }; return; } // net carried below
      const rk = m.side + ':' + m.round;
      perRound[rk] = perRound[rk] || 0;
      netInfo[m.key] = { net: (perRound[rk] % netCount) + 1, queue_order: q++ };
      perRound[rk]++;
    });
  // Carry the grand final + reset onto the winners-final court (the WB champ is already there) rather than
  // resetting to a misleading "Net 1" that collides with the early rounds.
  const wbFinal = real.filter((m) => m.side === 'winners').sort((a, b) => b.round - a.round || b.slot - a.slot)[0];
  const gfNet = (wbFinal && netInfo[wbFinal.key] && netInfo[wbFinal.key].net) || 1;
  real.filter((m) => m.side === 'grand_final').forEach((m) => { netInfo[m.key].net = gfNet; });

  const rows = real.map((m) => ({
    side: m.side, round: m.round, slot: m.slot, round_label: labelOf(m.key),
    net: netInfo[m.key].net, queue_order: netInfo[m.key].queue_order,
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
  state.scoringPresets = await tdbListScoringPresets();
  if (!(state.scoringPresets || []).some((p) => p.id === state.selectedFormatId)) {
    state.selectedFormatId = state.scoringPresets[0] ? state.scoringPresets[0].id : null;
  }
  // Clear a STALE active tournament (deleted / no longer in the list) for EVERYONE, not just public
  // (2026-06-27): an admin whose active tournament was deleted kept a dead activeTournamentId, so the
  // tournament view rendered controls (Edit settings, etc.) pointing at a gone tournament and they
  // silently no-op'd — "editing settings did nothing". Clearing it falls the view back to the list.
  if (state.activeTournamentId && !state.tournaments.some((t) => t.id === state.activeTournamentId)) {
    state.activeTournamentId = null;
    state.tournamentPickedTeamId = null;
  }
  // Public viewers also auto-follow the LIVE/finished tournament (never a fresh 'setup' draft).
  if (!state.isAdmin) {
    if (!state.activeTournamentId && state.tournaments.length) {
      const live = state.tournaments.find((t) => t.status === 'pools')
        || state.tournaments.find((t) => t.status === 'bracket')
        || state.tournaments.find((t) => t.registration_open && t.status === 'setup') // self-registration is open → surface it publicly
        || state.tournaments.find((t) => t.status === 'completed') || null;
      state.activeTournamentId = live ? live.id : null;
    }
  }
  if (state.activeTournamentId) {
    // Independent reads — run concurrently (was serial round-trips per refresh). The 4th (team_members)
    // is Slice 3c's personal-layer source and runs ONLY signed-in: anon lacks SELECT on
    // players.claimed_by_profile, so an anon request would ERROR, not just return nulls.
    const wantMembers = !!state.authSession;
    const [tTeams, tPools, tMatches, tMembers] = await Promise.all([
      tdbListTeams(state.activeTournamentId),
      tdbListPools(state.activeTournamentId),
      tdbListMatches(state.activeTournamentId),
      wantMembers ? tdbListTeamMembers(state.activeTournamentId) : Promise.resolve(null),
    ]);
    state.tournamentTeams = tTeams;
    state.tournamentPools = tPools;
    state.tournamentMatches = tMatches;
    if (wantMembers && tMembers !== null) state.teamMembers = tMembers;
    if (!wantMembers) state.teamMembers = null;
  } else {
    state.tournamentTeams = [];
    state.tournamentPools = [];
    state.tournamentMatches = [];
    state.teamMembers = null;
  }
}

// Slice 3c: the team_members read for the personal layer (same embedded select as the claim page).
// Returns shaped candidates, or null on failure (callers keep the previous value — a transient error
// must not blank a working hero).
async function tdbListTeamMembers(tournamentId) {
  if (!supabaseClient || !tournamentId) return null;
  try {
    const { data, error } = await supabaseClient
      .from('team_members')
      .select('player_id, teams!inner(id,name,tournament_id), players!inner(id,name,claimed_by_profile)')
      .eq('teams.tournament_id', tournamentId);
    if (error) throw error;
    return shapeClaimCandidates(data || []);
  } catch (err) {
    console.error('tdbListTeamMembers', err);
    return null;
  }
}

// Slice 3c: which team is "mine" (signed-in + claimed), from live state. Cheap — call per render.
function myTeamInfo() {
  if (!state.account || !Array.isArray(state.teamMembers)) return null;
  return resolveMyTeam(state.account.id, state.teamMembers);
}

// Round 2 (spec §12.3): resolve MY claimed player (for the check-in one-tap hero). Authed-only —
// anon SELECT on claimed_by_profile errors by design. Called from the GENUINE sign-in transition
// only (v2026.07.09.2 storm rule: never per auth event) + initial restore; cleared on sign-out.
async function loadMyClaimedPlayer() {
  if (!supabaseClient || !state.account) { state.myClaimedPlayer = null; return; }
  try {
    const { data, error } = await supabaseClient
      .from('players').select('id,name').eq('claimed_by_profile', state.account.id).limit(2);
    if (error) throw error;
    state.myClaimedPlayer = checkinHeroModel(data || []);
  } catch (err) {
    console.error('loadMyClaimedPlayer', err);
    state.myClaimedPlayer = null; // fail safe -> search-first kiosk
  }
  if (!state.isAdmin && activeMainTab === 'players') partialRender();
}

// Surgically re-render only the tournament tab body (preserves other tabs' state).
// True when the user is mid-edit in a form on the tournament tab — the public team-registration form
// (#reg-team / #reg-p1.. / the "We paid" checkbox) or a half-typed score. A BACKGROUND sync (15s poll or
// realtime) must NOT rebuild #tab-tournament while this is true, or it blanks their in-progress input (the
// "nothing saved" clobber class — confirmed by audit wf_a020d635-d72). Covers focus + any dirty field:
// non-empty text/number OR a checked checkbox/radio (the old refreshTournamentLive check missed checkboxes,
// so a ticked "We paid" was silently reset to unpaid on the next sync).
function tournamentTabIsDirty() {
  const scope = document.getElementById('tab-tournament');
  if (!scope) return false;
  const ae = document.activeElement;
  if (ae && scope.contains(ae) && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName)) return true;
  return Array.prototype.some.call(scope.querySelectorAll('input, textarea'),
    (i) => (i.type === 'checkbox' || i.type === 'radio') ? i.checked : String(i.value || '') !== '');
}

function partialRenderTournament() {
  dismissTeamPeek(); // §13.2: the pools-page rebuild replaces the tapped anchor — never strand a floating peek
  // Preserve the active panel's scroll across the rebuild: iOS Safari RESETS an overflow container's
  // scrollTop when its innerHTML is replaced, yanking the operator to the top mid-scroll on every 15s
  // sync / realtime score (Mike's #1 frustration; reintroduced on the Manage board in v2026.06.28.1).
  // render() already saves+restores this; mirror it for all board panels (manage / live / public tournament).
  const _scrollPanel = document.getElementById('tab-' + activeMainTab);
  const _savedScroll = _scrollPanel ? _scrollPanel.scrollTop : 0;
  const c = document.querySelector('#tab-tournament .container');
  // Skip the rewrite when a form on this tab is being filled, so a background sync never wipes a public
  // team's in-progress registration (or a half-typed score). User actions that need a refresh call render().
  if (c && !tournamentTabIsDirty()) c.innerHTML = buildPublicTournamentRootHTML();
  // tournament-mode dashboard surfaces the same data on the Manage + Live panels.
  if (state.tournamentMode) {
    // The Manage panel is an admin EDITING surface (Settings / Teams / Registration forms). A BACKGROUND
    // realtime sync must NOT rebuild it from stored values mid-edit — that wipes the admin's in-progress
    // typing, so a Save then persists the OLD values ("I edit a setting but nothing saves", Mike 2026-06-27).
    // Only refresh it on a sync when it's the input-free BRACKET PREVIEW (which the tv2-bracket-side switch
    // also routes through here); every manage action that changes data calls render() directly afterward.
    // Refresh #tab-manage on a background sync ONLY when it shows a tap/read BOARD with no in-progress form
    // input to clobber: the bracket tree/preview (any status), or the RUNNING pool board. NEVER a form page
    // (pools-draw selects, Settings/Teams/Reg) — a sync would wipe mid-edit (#21/#22). Scoring is a
    // body-level modal (not in-panel), so a board rebuild can't clobber it.
    const mActive = state.activeTournamentId ? (state.tournaments || []).find((x) => x.id === state.activeTournamentId) : null;
    const manageShowsBoard = state.manageView === 'bracket' || (state.manageView === 'pools' && mActive && mActive.status !== 'setup');
    if (manageShowsBoard) {
      const mc = document.querySelector('#tab-manage .container');
      if (mc) mc.innerHTML = buildManageTabHTML();
    }
    const lc = document.querySelector('#tab-live .container'); // Live = read-only board/bracket, safe to refresh
    if (lc) lc.innerHTML = buildLiveTabHTML();
  }
  layoutBracketTree(); // draw connectors + fit/zoom the bracket tree (no-op if no tree present)
  // Restore scroll if the rebuild reset it (iOS overflow-container behavior) so a background sync never
  // yanks the operator off the spot they're scrolled to mid-event.
  if (_scrollPanel && _savedScroll > 0 && _scrollPanel.scrollTop !== _savedScroll) _scrollPanel.scrollTop = _savedScroll;
  maybeAutoGenerateBracket(); // C54: prompt to generate the bracket the moment pools finish
}

// C54: when the last pool game goes final, the ADMIN device auto-prompts to generate the bracket
// (no watching + hunting for the button). Admin-only (the generate RPC needs auth) + once per
// tournament per session (the flag is set before the await so re-renders can't double-prompt).
const _autoGenPrompted = {};
async function maybeAutoGenerateBracket() {
  const t = (state.tournaments || []).find((x) => x.id === state.activeTournamentId);
  if (!t) return;
  const pm = (state.tournamentMatches || []).filter((m) => m.phase === 'pool');
  // C54 fix (2026-06-30): the old guard checked activeMainTab === 'tournament' (the PUBLIC Bracket tab),
  // so in the admin tournament-mode dashboard (activeMainTab 'manage'/'live') the prompt was DEAD — Mike
  // hit "pool play is done but there's no way to generate the bracket" mid-event. The pure predicate fires
  // for an admin in tournament mode (or on the legacy 'tournament' tab) when every pool game is decided.
  if (!shouldAutoPromptBracket({
    isAdmin: state.isAdmin, tournamentMode: state.tournamentMode, activeMainTab,
    status: t.status, poolMatches: pm, alreadyPrompted: _autoGenPrompted[t.id],
  })) return;
  _autoGenPrompted[t.id] = true; // claim the one-shot up front so re-renders during the await can't double-prompt
  try {
    if (await appConfirm({ title: 'All pool games are in', message: 'Generate the playoff bracket now? (the "Generate Bracket" button still works if you want to wait.)', confirmText: 'Generate bracket' })) {
      // Re-read status AFTER the await: another device may have generated while this confirm sat open
      // (the confirm lives on document.body and survives background re-renders). Bail if so — never
      // regenerate a bracket that's no longer 'pools' (it would wipe the scored bracket).
      const fresh = (state.tournaments || []).find((x) => x.id === t.id);
      if (!fresh || fresh.status !== 'pools') return;
      await tdbGenerateBracket(fresh);
      state.bracketSide = null;
      await tdbRefreshTournaments();
      render();
    }
  } catch (e) {
    // Wave 1e: do NOT clear the one-shot flag synchronously here — render() below re-invokes
    // maybeAutoGenerateBracket, which would immediately re-pop the appConfirm on top of the error
    // (a re-prompt loop on a flaky network). Leave it claimed; the manual "Generate Bracket" button is
    // the retry path, and Reset Pools re-arms the auto-prompt (delete _autoGenPrompted[t.id]).
    state.tournamentTabError = (e && e.message) || 'Could not generate the bracket — use the Generate Bracket button to retry.';
    render();
  }
}

// Background freshness: reload tournament data + surgically re-render the tab so a
// second phone's submission shows up — but NEVER while the operator is mid-entry
// (a focused input/select in the tab would be clobbered).
function tournamentNavVisible() {
  return state.isAdmin || (state.tournaments || []).some((t) => t.registration_open || ['pools', 'bracket', 'completed'].includes(t.status));
}

// Check In rework (Mike 2026-07-10): the PUBLIC Check In nav tab exists ONLY on the day of the
// scheduled pickup session ("it should not show unless an admin creates a pickup day" — and only
// day-of, not for future days). Same day-of gate (sessionIsToday, pure.js) as Home's session_live
// state, so the nav tab and the Home Check-in CTA always agree. Admin surface is unaffected
// (its nav is built separately).
function checkinNavVisible() {
  // Task 2: gate against the SET of pickup days (pickupDaySet folds in the pre-0046 legacy-session fallback).
  return sessionIsToday(pickupDaySet());
}

async function refreshTournamentLive() {
  if (SyncManager.tournament.bootGraceArmed && (Date.now() - SyncManager.bootSyncAt) < BOOT_GRACE_MS) {
    SyncManager.tournament.bootGraceArmed = false; // C25 item 8 one-shot: init's tdbRefreshTournaments already loaded
    return;
  }
  const prevNav = tournamentNavVisible();
  // F3 (2026-06-30): the admin tournament-mode board lives on the manage/live tabs, NOT activeMainTab==='tournament'
  // (that's the PUBLIC Bracket tab). Without including tournament mode here, a background sync took the else-branch
  // and the inline Manage/Live board never auto-updated from another device's scoring (stale all event). Treat
  // tournament mode (manage/live) as a live tournament surface too.
  const onTournamentSurface = () => activeMainTab === 'tournament'
    || (state.tournamentMode && (activeMainTab === 'manage' || activeMainTab === 'live'));
  if (onTournamentSurface()) {
    // Don't clobber a half-typed score OR a half-filled team registration (incl. the "We paid" checkbox) even
    // after the field blurs — a background sync (esp. a `teams` realtime ping when ANOTHER team registers) must
    // not rebuild the form and wipe what's typed. Shared guard with partialRenderTournament (covers checkboxes).
    // The manage FORM pages are additionally protected by partialRenderTournament's manageShowsBoard guard
    // (it only rebuilds #tab-manage when it shows a board, never a Settings/Teams/Reg form). This path also
    // re-arms the C54 auto-generate prompt cross-device (partialRenderTournament -> maybeAutoGenerateBracket).
    if (tournamentTabIsDirty()) return;
    await tdbRefreshTournaments();
    if (onTournamentSurface()) partialRenderTournament();
  } else if ((activeMainTab === 'home' || activeMainTab === 'myteam') && publicLiveTournament()) {
    // Slice 3c: Home / My Team both render from tournament state, which previously went
    // STALE here — this else-branch only refreshed the tournaments list, so those panels repainted
    // every 15s from frozen data (review wf_4480d8a3-9be: a claimed player's record/up-next froze
    // while they sat on My Team). Refresh the data + repaint via partialRender() (its in-place
    // branches rebuild these panels; no form lives on them). History stays out: its data is the
    // separate lazy loadTournamentHistory, not live tournament state.
    const tabAtStart = activeMainTab;
    await tdbRefreshTournaments();
    if (activeMainTab === tabAtStart) partialRender();
  } else {
    // Off the tab: keep the list fresh so the Tournament nav appears/disappears as events go live.
    state.tournaments = await tdbListTournaments();
    if (tournamentNavVisible() !== prevNav) {
      // Wave 1b (2026-06-25): the Bracket nav button shows/hides when a tournament goes live or ends on
      // another device. Rebuild ONLY #bottom-nav (the click handler is delegated on the nav element, so
      // an innerHTML swap keeps it working) instead of a full render() that resets a spectator's scroll —
      // exactly at the peak-attention moment a tournament starts. Every session is on the public shell (Task 14).
      const nav = document.getElementById('bottom-nav');
      if (nav) { nav.innerHTML = buildPublicNavInnerHTML(); activateMainTab(activeMainTab); }
      else render();
    }
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

// SC-2: buy-in reconciliation summary for the admin — "N of M paid · $X collected · K unpaid".
// buy_in is free text (e.g. "$80 per team"); parse the first number for the $ total, omit it if none.
function buildPaymentSummaryHTML(teams, tournament) {
  const list = teams || [];
  if (!list.length) return '';
  const paid = list.filter((t) => t.paid).length;
  const unpaid = list.length - paid;
  const amt = parseFloat(String((tournament && tournament.buy_in) || '').replace(/[^0-9.]/g, ''));
  const money = amt > 0 ? ` · $${(paid * amt).toLocaleString()} collected` : '';
  return `<div class="small" style="margin:2px 0 6px;font-weight:600;color:${unpaid ? 'var(--danger)' : 'var(--live, #16a34a)'};">${paid} of ${list.length} paid${money}${unpaid ? ` · ${unpaid} unpaid` : ''}</div>`;
}

function buildTeamListHTML(teams, isAdmin) {
  if (!teams || !teams.length) {
    return '<p class="small" style="color:var(--muted);margin:0;">No teams yet.</p>';
  }
  // C69 (Mike): tap a team to see its players in a popup card.
  return teams.map((tm, i) => `
    <div class="row" style="justify-content:space-between;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">
      <span class="tlist-name" data-role="tv2-team-card" data-id="${escapeHTML(tm.id)}" role="button" tabindex="0" style="flex:1;cursor:pointer;color:var(--accent);font-weight:600;">${escapeHTML(String(i + 1))}. ${escapeHTML(tm.name || '')}</span>
      ${isAdmin ? `<button type="button" class="danger" data-role="tv2-delete-team" data-id="${escapeHTML(tm.id)}">Remove</button>` : ''}
    </div>`).join('');
}

// C69 (Mike, 2026-06-26): initials for a roster avatar — first letters of the first two words.
function nameInitials(name) {
  return String(name || '').trim().split(/\s+/).slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join('') || '?';
}

// C69 (§38 Option A — avatar list): public "tap a registered team -> see its players" popup card. Roster
// names are already public on the register list; this just surfaces them in a clean card. Reuses the shared
// .popup-overlay/.popup-card. Read-only, no writes.
function openTeamRosterCard(teamId) {
  const team = (state.tournamentTeams || []).find((t) => t.id === teamId);
  if (!team) return;
  const roster = (Array.isArray(team.roster) ? team.roster : []).filter((n) => String(n || '').trim());
  const overlay = document.createElement('div');
  overlay.className = 'popup-overlay';
  overlay.style.display = 'flex';
  const rows = roster.length
    ? roster.map((n) => `<div class="pl-row"><span class="pl-av">${escapeHTML(nameInitials(n))}</span><span class="pl-name">${escapeHTML(String(n))}</span></div>`).join('')
    : '<p class="small" style="color:var(--muted);margin:8px 0 0;">No players listed.</p>';
  overlay.innerHTML = `<div class="popup-card card tc-card" role="dialog" aria-modal="true" aria-label="Team roster">
    <div class="tc-h"><span class="tc-name">${escapeHTML(team.name || 'Team')}</span>${team.paid ? '<span class="tc-paid">paid</span>' : ''}</div>
    <div class="tc-sub">${roster.length} ${roster.length === 1 ? 'player' : 'players'}</div>
    <div class="tc-roster">${rows}</div>
    <button type="button" class="tc-close" data-role="tc-close">Close</button>
  </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('[data-role="tc-close"]').onclick = close;
}

function teamNameById(teams, id) {
  const t = (teams || []).find((x) => x.id === id);
  return t ? (t.name || '') : '—';
}

// SC-7: admin-only per-pool withdraw controls — offered only for teams that still have unplayed games
// (a fully-played team has nothing to forfeit, so no flag/column is needed).
function buildWithdrawControlsHTML(poolTeams, poolMatches) {
  const withdrawable = (poolTeams || []).filter((tm) =>
    (poolMatches || []).some((m) => m.status !== 'final' && m.team_a_id && m.team_b_id &&
      (m.team_a_id === tm.id || m.team_b_id === tm.id)));
  if (!withdrawable.length) return '';
  return `<div class="small" style="margin:4px 0;color:var(--muted);">Withdraw (forfeits remaining games): ${
    withdrawable.map((tm) => `<button type="button" class="secondary" data-role="tv2-withdraw-team" data-id="${escapeHTMLText(tm.id)}" data-name="${escapeHTMLText(tm.name || '')}" style="font-size:11px;padding:2px 6px;margin:2px;">${escapeHTMLText(tm.name || '')}</button>`).join('')
  }</div>`;
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
      <td style="color:${r.pointDiff > 0 ? 'var(--live)' : r.pointDiff < 0 ? 'var(--danger)' : 'inherit'};">${r.pointDiff > 0 ? '+' : ''}${r.pointDiff}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

// Seeding list (Mike, 2026-06-27, §38 option B): the cross-pool seed order (computeSeeding — seed 1..N by
// win% then point differential, the SAME ranking that sets the bracket). Shown on the public Bracket tab +
// the admin tournament view once any pool game is final (provisional during pools, final once pools end).
// Read-only; no skill shown. Returns '' when there are no finished pool games yet.
// `editable` (admin, pre-generate only): render an editable variant with ▲/▼ to reorder the seeds
// before Generate (a transient manual override held in state.seedOverride; computeSeeding is the
// default). The public + post-generate views pass editable=false → the read-only table is unchanged.
function buildSeedingTableHTML(teams, matches, editable) {
  const poolMatches = (matches || []).filter((m) => m.phase === 'pool');
  if (!poolMatches.some((m) => m.status === 'final')) return '';
  let rows = computeSeeding(teams || [], poolMatches);
  if (!rows.length) return '';
  // apply the admin's transient reorder if it's a valid permutation of the current teams
  let custom = false;
  if (editable && state.seedOverride && state.seedOverride.id === state.activeTournamentId) {
    const ov = state.seedOverride.order || [];
    const byId = {}; rows.forEach((r) => { byId[r.teamId] = r; });
    if (ov.length === rows.length && ov.every((id) => byId[id])) {
      rows = ov.map((id, i) => ({ ...byId[id], seed: i + 1 })); custom = true;
    }
  }
  const last = rows.length - 1;
  const upSvg = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M4 10l4-4 4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const dnSvg = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const mvCell = (r, i) => editable ? `<td class="sd-mv">
      <button type="button" class="sd-mvbtn" data-role="tv2-seed-up" data-id="${escapeHTML(r.teamId)}" ${i === 0 ? 'disabled' : ''} aria-label="Move ${escapeHTMLText(r.name)} up">${upSvg}</button>
      <button type="button" class="sd-mvbtn" data-role="tv2-seed-down" data-id="${escapeHTML(r.teamId)}" ${i === last ? 'disabled' : ''} aria-label="Move ${escapeHTMLText(r.name)} down">${dnSvg}</button>
    </td>` : '';
  const sub = editable
    ? `Reorder for your bracket seeds &middot; ${custom ? 'custom order' : 'by win% then point diff'}${custom ? ' &middot; <button type="button" class="sd-reset" data-role="tv2-seed-reset">reset</button>' : ''}`
    : `${rows.length} teams &middot; by win% then point differential`;
  return `<div class="card sd-card">
    <div class="sd-h">Seeding</div>
    <div class="sd-sub">${sub}</div>
    <table class="sd-tbl">
      <thead><tr><th>Seed</th><th>Team</th><th class="r">W-L</th><th class="r">Diff</th>${editable ? '<th class="r">Move</th>' : ''}</tr></thead>
      <tbody>${rows.map((r, i) => `<tr${r.seed === 1 ? ' class="top"' : ''}>
        <td class="sd-seed">${r.seed}</td>
        <td class="sd-nm">${escapeHTML(r.name)}</td>
        <td class="r">${r.wins}-${r.losses}</td>
        <td class="r ${r.pointDiff > 0 ? 'sd-pos' : r.pointDiff < 0 ? 'sd-neg' : ''}">${r.pointDiff > 0 ? '+' : ''}${r.pointDiff}</td>
        ${mvCell(r, i)}
      </tr>`).join('')}</tbody>
    </table>
  </div>`;
}

// C70 (Mike, 2026-06-26): collapse a pool's nets into a readable label — "1-2" for a contiguous block,
// "1, 3, 5" otherwise. Drives the "Pool A · Nets 1-2" line on the player board.
function formatNetList(nets) {
  if (!nets || !nets.length) return '';
  const parts = [];
  let s = nets[0], p = nets[0];
  for (let i = 1; i < nets.length; i++) {
    if (nets[i] === p + 1) { p = nets[i]; continue; }
    parts.push(s === p ? String(s) : (s + '-' + p));
    s = p = nets[i];
  }
  parts.push(s === p ? String(s) : (s + '-' + p));
  return parts.join(', ');
}

// C70 (Mike's spec, §38 Option A + "show every game with a play-order number"): the player-first pool board.
// Every pool game is auto-generated, so the board shows the WHOLE schedule — per pool → per net → the full
// NUMBERED list of that net's games in play order (1 plays first), the CURRENT game tagged "Now", finished
// games showing their score. A player opens their phone, finds their pool + net, and sees every game they'll
// play and the order. Tap any unplayed game to score it (anyone scores) — finishing one moves "Now" to the
// next. Standings + admin withdraw sit behind a collapsed toggle. Shared by public AND admin (isAdmin adds
// Edit/Clear on finished games).
function buildPoolPlayHTML(tournament, pools, teams, matches, isAdmin, pickedTeamId) {
  const poolCards = pools.map((pool) => {
    const poolTeams = teams.filter((t) => t.pool_id === pool.id);
    const poolMatches = matches.filter((m) => m.pool_id === pool.id);
    const nets = [...new Set(poolMatches.map((m) => m.net).filter((n) => n != null))].sort((a, b) => a - b);
    const played = poolMatches.filter((m) => m.status === 'final').length;
    const total = poolMatches.length;
    // C70 fix (2026-06-27): the pool's "Now" games are a DISJOINT set across its nets (pickPoolCurrentGames),
    // so a team is never tagged current on two nets at once; if a net's lowest-queue game conflicts it skips
    // to its next free game so both nets stay busy. Render-only — schedule / queue_order / DB are unchanged.
    const netUnplayed = nets.map((net) => poolMatches
      .filter((m) => m.net === net && m.status !== 'final' && m.team_a_id && m.team_b_id)
      .sort((a, b) => (a.queue_order || 0) - (b.queue_order || 0)));
    const currentIds = new Set(pickPoolCurrentGames(netUnplayed).filter(Boolean));
    const netGroups = nets.map((net) => {
      const games = poolMatches.filter((m) => m.net === net).sort((a, b) => (a.queue_order || 0) - (b.queue_order || 0));
      const rows = games.map((g, i) => {
        const order = g.queue_order || (i + 1); // play-order, rendered as a "game N" eyebrow label (Mike, 2026-06-27)
        const aN = escapeHTML(teamNameById(teams, g.team_a_id));
        const bN = escapeHTML(teamNameById(teams, g.team_b_id));
        if (g.status === 'final') {
          const aWin = g.winner_team_id === g.team_a_id;
          return `<div class="ppg is-final">
            <span class="ppg-m"><span class="ppg-kick">game ${order}</span><span class="ppg-mr"><span class="${aWin ? 'ppg-w' : ''}">${aN}</span> <span class="ppg-vs">vs</span> <span class="${!aWin ? 'ppg-w' : ''}">${bN}</span></span></span>
            <span class="ppg-r"><span class="ppg-score">${escapeHTML(String(g.score_a))}-${escapeHTML(String(g.score_b))}</span>${isAdmin ? `<button type="button" class="ppg-btn" data-role="tv2-bracket-open" data-id="${escapeHTML(g.id)}">Edit</button><button type="button" class="ppg-btn" data-role="tv2-clear-result" data-id="${escapeHTML(g.id)}">Clear</button>` : ''}</span>
          </div>`;
        }
        const isCur = currentIds.has(g.id);
        const isLive = g.status === 'live'; // C72: a game being live-scored shows its running score + a LIVE pill
        const rightSide = isLive
          ? `<span class="ppg-livescore">${escapeHTML(String(g.score_a != null ? g.score_a : 0))}–${escapeHTML(String(g.score_b != null ? g.score_b : 0))}</span><span class="ppg-livetag">LIVE</span>`
          : (isCur ? '<span class="ppg-now">Now</span>' : '<span class="ppg-cta" aria-hidden="true">Score &rsaquo;</span>');
        return `<div class="ppg${isCur ? ' is-now' : ''}${isLive ? ' is-live' : ''}" data-role="tv2-bracket-open" data-id="${escapeHTML(g.id)}" role="button" tabindex="0">
          <span class="ppg-m"><span class="ppg-kick">game ${order}</span><span class="ppg-mr">${aN} <span class="ppg-vs">vs</span> ${bN}</span></span>
          <span class="ppg-r">${rightSide}</span>
        </div>`;
      }).join('');
      return `<div class="ppl-ng"><div class="ppl-nglabel">Net ${net}</div>${rows}</div>`;
    }).join('');
    const teamsLine = poolTeams.map((t) => escapeHTML(t.name || '')).filter(Boolean).join(', ');
    const netsLabel = nets.length ? ('Net' + (nets.length > 1 ? 's' : '') + ' ' + formatNetList(nets)) : '';
    // Admin can re-assign a pool's nets (Mike's "auto-split, then editable") — tap to edit; it re-nets the
    // pool's UNPLAYED games onto the chosen nets. The public sees a plain label.
    const netsEl = isAdmin
      ? `<button type="button" class="ppl-nets ppl-nets-edit" data-role="tv2-edit-pool-nets" data-id="${escapeHTML(pool.id)}">${escapeHTML(netsLabel || 'Set nets')} <span aria-hidden="true">&#9998;</span></button>`
      : (netsLabel ? `<span class="ppl-nets">${escapeHTML(netsLabel)}</span>` : '');
    const standings = `<details class="ppl-more">
      <summary>Standings</summary>
      <div class="ppl-more-body">
        ${buildStandingsTableHTML(poolTeams, poolMatches)}
        ${isAdmin ? buildWithdrawControlsHTML(poolTeams, poolMatches) : ''}
      </div>
    </details>`;
    return `<div class="ppl-pool">
      <div class="ppl-h"><span class="ppl-name">Pool ${escapeHTML(pool.label)}</span>${netsEl}</div>
      ${teamsLine ? `<div class="ppl-teams">${teamsLine}</div>` : ''}
      ${netGroups || '<p class="small" style="color:var(--muted);margin:0;">No games scheduled.</p>'}
      <div class="ppl-foot"><span class="ppl-prog">${played} of ${total} games done</span></div>
      ${standings}
    </div>`;
  }).join('');
  return poolCards;
}

// ---- Bracket renderer: connected "March Madness" tree (C32 #9, Mike's §38 pick) ----
// One pannable/zoomable tree for phone + desktop. The textual "Winner → next round" line the
// old card carried is now drawn as an SVG elbow connector by layoutBracketTree() — the bracket
// shows progression visually, the way a real bracket does. NEVER renders skill (public-safe).

// The champion's route to the title = every match the champion won. Used to highlight the path.
function championPathIds(main, champ) {
  if (!champ) return new Set();
  return new Set((main || [])
    .filter((m) => m.status === 'final' && m.winner_team_id === champ.teamId)
    .map((m) => m.id));
}

// One bracket match = a node in the tree. A match you can score (admin, or your picked team) is a
// TAP TARGET (tv2-bracket-open) that opens the result pop-up — no cramped inputs inside the box.
function buildBracketNodeHTML(m, matches, teams, canSubmit, pathIds, seedByTeam, gn, opts = {}) {
  const seeds = seedByTeam || {};
  const ro = !!opts.readOnly; // Slice 2 (§13.3): public read-only bracket — no scoring; team names are peek targets.
  // C75: a small seed number before a known team's name (no seed for TBD / source placeholders).
  const seedTag = (id) => (id && seeds[id]) ? `<span class="bt-seed">${seeds[id]}</span>` : ''; // D3: styles moved to CSS
  const aKnown = !!m.team_a_id, bKnown = !!m.team_b_id;
  const srcA = bracketSourceLabel(m.source_a, gn && gn.byRoundLabel); // "Winner of WB R1 M1" -> "Winner of G3"
  const srcB = bracketSourceLabel(m.source_b, gn && gn.byRoundLabel);
  // In read-only mode a KNOWN team's name (seed + name) is wrapped as a tap-a-team peek target (Slice 1 pd-peek).
  const peek = (id, inner) => (ro && id) ? `<span class="tapname" data-team-peek="${escapeHTML(id)}">${inner}</span>` : inner;
  const aName = aKnown ? peek(m.team_a_id, seedTag(m.team_a_id) + escapeHTML(teamNameById(teams, m.team_a_id))) : escapeHTML(srcA || 'TBD');
  const bName = bKnown ? peek(m.team_b_id, seedTag(m.team_b_id) + escapeHTML(teamNameById(teams, m.team_b_id))) : escapeHTML(srcB || 'TBD');
  const gNum = (gn && gn.byId) ? gn.byId[m.id] : null; // continuous bracket game number (Mike, 2026-06-27)
  const gLbl = gNum ? ('G' + gNum) : (m.round_label || '').replace(/ M\d+$/, '');
  // Gold ONLY on the decided championship game (§13.3); matte-green highlight on a genuinely live public node.
  const isChamp = ro && opts.champMatchId && m.id === opts.champMatchId;
  const isLiveNode = ro && m.status === 'live' && aKnown && bKnown;
  const trophy = isChamp ? '<svg class="pd-bk-trophy" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v4a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4a3 3 0 0 0 3 3"/><path d="M17 6h3a3 3 0 0 1-3 3"/></svg>' : '';
  const meta = `<div class="bt-meta">${trophy}${escapeHTML(gLbl)}${m.net ? ' · Net ' + escapeHTML(String(m.net)) : ''}${m.status === 'final' ? ' · Final' : ''}</div>`;
  // Any unplayed matchup is tappable for EVERYONE — the pop-up either lets you score it (admin /
  // your picked team) or tells you how to (log in / pick your team). A silent dead tap was the bug.
  // Read-only spectator nodes are NEVER openable (no scoring copy, no "Tap to enter score") — §13.3/§6.
  const openable = !ro && aKnown && bKnown && m.status !== 'final';

  let body;
  if (m.status === 'final') {
    const aWin = m.winner_team_id === m.team_a_id;
    const haveScores = m.score_a != null && m.score_b != null;
    const row = (name, id, win) => `<div class="bt-row${win ? ' win' : ''}">
        <span class="bt-name">${name}</span>
        <span class="bt-sc">${haveScores ? escapeHTML(String(id === m.team_a_id ? m.score_a : m.score_b)) : (win ? 'W' : '')}</span>
      </div>`;
    body = row(aName, m.team_a_id, aWin) + row(bName, m.team_b_id, !aWin)
      + ((!ro && state.isAdmin) ? `<div class="bt-act"><button type="button" class="secondary" data-role="tv2-bracket-open" data-id="${escapeHTML(m.id)}">Edit score</button><button type="button" class="secondary" data-role="tv2-bracket-clear" data-id="${escapeHTML(m.id)}">Clear</button></div>` : '');
  } else if (aKnown && bKnown && m.status === 'live') {
    // C72: a live-scored bracket match shows its running score + a LIVE pill — mirrors the pool board so the
    // live scorer reads the same on every surface (was rendered identically to an unplayed match).
    const sa = m.score_a != null ? m.score_a : 0;
    const sb = m.score_b != null ? m.score_b : 0;
    const lrow = (name, sc) => `<div class="bt-row"><span class="bt-name">${name}</span><span class="bt-sc bt-livesc">${escapeHTML(String(sc))}</span></div>`;
    body = lrow(aName, sa)
      + `<div class="bt-vs"><span class="bt-livetag">LIVE</span></div>`
      + lrow(bName, sb)
      + (openable ? '<div class="bt-enter">Tap to update score &rsaquo;</div>' : '');
  } else if (aKnown && bKnown) {
    // Both teams set: a matchup. If you can score it, the whole card opens the result pop-up.
    body = `<div class="bt-row"><span class="bt-name">${aName}</span></div>
      <div class="bt-vs">vs</div>
      <div class="bt-row"><span class="bt-name">${bName}</span></div>`
      + (openable ? '<div class="bt-enter">Tap to enter score &rsaquo;</div>' : '');
  } else {
    body = `<div class="bt-row"><span class="bt-name bt-tbd">${aName}</span></div>
      <div class="bt-row"><span class="bt-name bt-tbd">${bName}</span></div>`;
  }
  const openAttrs = openable ? ` data-role="tv2-bracket-open" data-id="${escapeHTML(m.id)}" role="button" tabindex="0"` : '';
  // data-next = the match this winner advances to — layoutBracketTree reads it off the DOM to draw the
  // connector line, so it works for BOTH the live bracket and the teamless format preview.
  const nextAttr = m.winner_next_match_id ? ` data-next="${escapeHTML(String(m.winner_next_match_id))}"` : '';
  const roCls = (isChamp ? ' pd-bk-champ' : '') + (isLiveNode ? ' pd-bk-live' : '');
  return `<div class="bt-node${pathIds.has(m.id) ? ' path' : ''}${openable ? ' tappable' : ''}${roCls}" data-mid="${escapeHTML(m.id)}"${nextAttr}${openAttrs}>${meta}${body}</div>`;
}

// The result pop-up: tap a match -> big teams + a score box each + Submit. Winner = higher score.
// NF-10: edit a tournament's settings after create (name, nets, pool/bracket targets + cap, win-by-2) so
// "created to 25, played to 21" no longer means delete+rebuild. Saves via the guarded tdbSetTournamentFields;
// match_cap is kept = bracket_target (NF-1 back-compat). Shown in setup/pools (moot once the bracket runs).
// Edit a team's roster in a proper modal — per-player inputs (pre-filled), upgrading the comma-prompt
// (Mike, 2026-06-27). Saves via tdbSetTeamRoster (enforces exactly team_size). Reuses .popup-card + .card.
function openEditRosterModal(teamId) {
  const tm = (state.tournamentTeams || []).find((x) => x.id === teamId);
  if (!tm) return;
  const active = (state.tournaments || []).find((x) => x.id === state.activeTournamentId) || {};
  const teamSize = Number(active.team_size) || 4;
  const roster = Array.isArray(tm.roster) ? tm.roster : [];
  const overlay = document.createElement('div');
  overlay.className = 'popup-overlay';
  overlay.style.display = 'flex';
  overlay.innerHTML = `<div class="popup-card card er-card" role="dialog" aria-modal="true" aria-label="Edit roster">
    <div class="brm-title">Edit roster — ${escapeHTML(tm.name || 'team')}</div>
    <p class="small" style="color:var(--muted);margin:0 0 10px;">${teamSize} players</p>
    <div class="tm-pgrid">${Array.from({ length: teamSize }, (_, i) => `<input type="text" class="reg-input er-p" placeholder="Player ${i + 1}" autocomplete="off" autocapitalize="words" value="${escapeHTMLText(roster[i] || '')}" />`).join('')}</div>
    <div id="er-err" hidden style="color:var(--danger);margin-top:8px;font-size:13px;"></div>
    <div style="display:flex;gap:8px;margin-top:12px;">
      <button type="button" class="secondary" id="er-cancel" style="flex:1;">Cancel</button>
      <button type="button" class="primary" id="er-save" style="flex:1;">Save roster</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('#er-cancel').onclick = close;
  let saving = false;
  overlay.querySelector('#er-save').onclick = async () => {
    if (saving) return;
    const vals = [...overlay.querySelectorAll('.er-p')].map((i) => i.value.trim()).filter(Boolean);
    const err = overlay.querySelector('#er-err');
    if (vals.length !== teamSize) { err.textContent = 'Enter exactly ' + teamSize + ' players.'; err.hidden = false; return; }
    saving = true;
    try {
      await tdbSetTeamRoster(teamId, vals);
      await tdbRefreshTournaments();
      close();
      render();
    } catch (e) { saving = false; err.textContent = (e && e.message) || 'Could not save the roster.'; err.hidden = false; }
  };
}

function openTournamentSettingsModal(tournamentId) {
  const t = (state.tournaments || []).find((x) => x.id === tournamentId);
  if (!t) return;
  const num = (v, d) => (v == null || v === '' ? d : v);
  const overlay = document.createElement('div');
  overlay.className = 'popup-overlay brm-overlay';
  overlay.innerHTML = `<div class="popup-card brm-card" role="dialog" aria-modal="true" aria-label="Edit tournament settings">
    <div class="brm-title">Edit settings</div>
    <label class="reg-label" for="ts-name">Name</label>
    <input type="text" id="ts-name" class="reg-input" value="${escapeHTML(t.name || '')}" autocapitalize="words" />
    <label class="reg-label" for="ts-nets">Nets / courts</label>
    <input type="number" inputmode="numeric" min="1" id="ts-nets" class="reg-input" value="${escapeHTML(String(num(t.net_count, 10)))}" />
    <label class="reg-label" for="ts-pt">Pool game to</label>
    <input type="number" inputmode="numeric" min="1" id="ts-pt" class="reg-input" value="${escapeHTML(String(num(t.pool_target, 15)))}" />
    <label class="reg-label" for="ts-pc">Pool cap (blank = none)</label>
    <input type="number" inputmode="numeric" min="1" id="ts-pc" class="reg-input" value="${t.pool_cap != null ? escapeHTML(String(t.pool_cap)) : ''}" />
    <label class="reg-label" for="ts-bt">Bracket game to</label>
    <input type="number" inputmode="numeric" min="1" id="ts-bt" class="reg-input" value="${escapeHTML(String(num(t.bracket_target, num(t.match_cap, 25))))}" />
    <label class="reg-check" style="margin-top:8px;"><input type="checkbox" id="ts-wb2" ${(t.win_by_2 == null || t.win_by_2) ? 'checked' : ''} /> Win by 2</label>
    <div class="brm-err" id="ts-err" hidden></div>
    <div class="brm-actions">
      <button type="button" class="secondary" id="ts-cancel">Cancel</button>
      <button type="button" class="primary" id="ts-save">Save settings</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('#ts-cancel').onclick = close;
  const err = overlay.querySelector('#ts-err');
  const fail = (msg) => { err.textContent = msg; err.hidden = false; };
  let saving = false;
  overlay.querySelector('#ts-save').onclick = async () => {
    if (saving) return;
    const name = (overlay.querySelector('#ts-name').value || '').trim();
    const nets = parseInt(overlay.querySelector('#ts-nets').value, 10);
    const pt = parseInt(overlay.querySelector('#ts-pt').value, 10);
    const pcRaw = (overlay.querySelector('#ts-pc').value || '').trim();
    const pc = pcRaw === '' ? null : parseInt(pcRaw, 10);
    const bt = parseInt(overlay.querySelector('#ts-bt').value, 10);
    const wb2 = overlay.querySelector('#ts-wb2').checked;
    if (!name) return fail('Name is required.');
    if (!(nets >= 1) || !(pt >= 1) || !(bt >= 1)) return fail('Nets, pool target, and bracket target must each be at least 1.');
    if (pc != null && pc < pt) return fail('Pool cap cannot be less than the pool target.');
    saving = true;
    try {
      // Data-integrity (2026-06-30): this MODAL is the second net_count save path. Same ATOMIC re-net as the
      // page handler (migration 0031) — a net-count change during pools OR bracket re-nets every match in one
      // transaction so matches.net never drifts from net_count (F7/F8).
      const tBeforeM = (state.tournaments || []).find((x) => x.id === tournamentId);
      const oldNetsM = tBeforeM ? Number(tBeforeM.net_count) : null;
      if (tBeforeM && nets !== oldNetsM && (tBeforeM.status === 'pools' || tBeforeM.status === 'bracket')) {
        const freshM = await tdbListMatches(tournamentId);
        await tdbApplyNetCountChange(tournamentId, nets, computeNetAssignments(tBeforeM.status, state.tournamentPools, freshM, nets));
        await tdbSetTournamentFields(tournamentId, { name, pool_target: pt, pool_cap: pc, bracket_target: bt, match_cap: bt, win_by_2: wb2 });
      } else {
        await tdbSetTournamentFields(tournamentId, { name, net_count: nets, pool_target: pt, pool_cap: pc, bracket_target: bt, match_cap: bt, win_by_2: wb2 });
      }
      await tdbRefreshTournaments();
      close();
      render();
    } catch (e) { saving = false; fail((e && e.message) || 'Could not save settings.'); }
  };
}

// C72 (Mike): tap a game -> choose how to score it. A final game goes straight to the edit modal; otherwise
// a small chooser: "Score live" (the point-by-point live scorer) or "Enter final score" (the C71 modal).
// Shared modal-title label for a match: bracket -> "G{n}" (continuous game number, Mike 2026-06-27),
// pool -> the old round_label / "Match". Used by the chooser, live scorer, and result modal.
function bracketLabelPart(m) {
  if (m && m.phase === 'main') {
    const byId = bracketGameNumbers((state.tournamentMatches || []).filter((x) => x.phase === 'main')).byId;
    if (byId[m.id]) return 'G' + byId[m.id];
  }
  return ((m && m.round_label) || 'Match').replace(/ M\d+$/, '');
}

function openMatchActionChooser(matchId) {
  const m = (state.tournamentMatches || []).find((x) => x.id === matchId);
  if (!m || !m.team_a_id || !m.team_b_id) return;
  if (m.status === 'final') return openBracketResultModal(matchId); // editing a final result -> straight in
  const aName = teamNameById(state.tournamentTeams, m.team_a_id);
  const bName = teamNameById(state.tournamentTeams, m.team_b_id);
  const title = bracketLabelPart(m) + (m.net ? ' · Net ' + m.net : '');
  const live = m.status === 'live';
  const overlay = document.createElement('div');
  overlay.className = 'popup-overlay';
  overlay.style.display = 'flex';
  overlay.innerHTML = `<div class="popup-card card mac-card" role="dialog" aria-modal="true" aria-label="Score this game">
    <div class="mac-title">${escapeHTML(title)}</div>
    <div class="mac-teams">${escapeHTML(aName)} <span class="mac-vs">vs</span> ${escapeHTML(bName)}</div>
    <button type="button" class="mac-opt mac-live" data-role="mac-live">
      <span class="mac-opt-t">${live ? 'Resume live score' : 'Score live'}</span>
      <span class="mac-opt-s">Tap the score point-by-point as the game plays — everyone watching sees it</span>
    </button>
    <button type="button" class="mac-opt" data-role="mac-final">
      <span class="mac-opt-t">Enter final score</span>
      <span class="mac-opt-s">Already have the final? Enter it directly</span>
    </button>
    <button type="button" class="mac-cancel" data-role="mac-cancel">Cancel</button>
  </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('[data-role="mac-cancel"]')) return close();
    if (e.target.closest('[data-role="mac-live"]')) { close(); return openLiveScorer(matchId); }
    if (e.target.closest('[data-role="mac-final"]')) { close(); return openBracketResultModal(matchId); }
  });
}

// C72 (§38 Option A — "tap the team"): the live point-by-point scorer. A spectator taps a team's whole
// panel for +1 (small −1 to fix); the running score writes via tdbSetLiveScore (optimistic + persisted,
// broadcast to everyone) and the leader's panel glows. When gameScoreStatus says the game is won, a
// confirm card appears ("X win a-b — finish?"); finishing finalizes through the existing submit path
// (tdbSubmitResult for pool / tdbSubmitBracketResult for bracket) and advances. Leaving keeps it 'live'.
function openLiveScorer(matchId) {
  const m = (state.tournamentMatches || []).find((x) => x.id === matchId);
  if (!m || !m.team_a_id || !m.team_b_id) return;
  const aName = teamNameById(state.tournamentTeams, m.team_a_id);
  const bName = teamNameById(state.tournamentTeams, m.team_b_id);
  const tournOf = () => (state.tournaments || []).find((x) => x.id === m.tournament_id) || {};
  const rules = scoringRulesFor(m.phase, tournOf());
  const ruleText = 'First to ' + rules.target + (rules.winBy2 ? ', win by 2' : '') + (rules.cap != null ? ' (cap ' + rules.cap + ')' : '');
  const title = bracketLabelPart(m) + (m.net ? ' · Net ' + m.net : '');
  let a = Math.max(0, Number(m.score_a) || 0);
  let b = Math.max(0, Number(m.score_b) || 0);
  let submitting = false, finished = false, confirmEl = null;
  const overlay = document.createElement('div');
  overlay.className = 'live-overlay';
  overlay.innerHTML = `<div class="lsc">
    <div class="lsc-h">
      <button type="button" class="lsc-back" data-role="ls-back" aria-label="Back">&lsaquo;</button>
      <div class="lsc-htext"><div class="lsc-title">${escapeHTML(title)}</div><div class="lsc-rule">${escapeHTML(ruleText)}</div></div>
      <span class="lsc-livetag"><span class="lsc-dot" aria-hidden="true"></span>LIVE</span>
    </div>
    <div class="lsc-panels">
      <button type="button" class="lsc-panel" data-role="ls-plus" data-team="a">
        <span class="lsc-name">${escapeHTML(aName)}</span><span class="lsc-score" id="ls-a">${a}</span><span class="lsc-tap">TAP TO +1</span>
      </button>
      <button type="button" class="lsc-panel" data-role="ls-plus" data-team="b">
        <span class="lsc-name">${escapeHTML(bName)}</span><span class="lsc-score" id="ls-b">${b}</span><span class="lsc-tap">TAP TO +1</span>
      </button>
    </div>
    <div class="lsc-minus">
      <button type="button" class="lsc-minusbtn" data-role="ls-minus" data-team="a">&minus;1 ${escapeHTML(aName)}</button>
      <button type="button" class="lsc-minusbtn" data-role="ls-minus" data-team="b">&minus;1 ${escapeHTML(bName)}</button>
    </div>
    <div class="lsc-err" id="lsc-err" hidden></div>
    <div class="lsc-f"><button type="button" class="lsc-final" data-role="ls-final">Enter the final score instead</button></div>
  </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  const elA = overlay.querySelector('#ls-a'), elB = overlay.querySelector('#ls-b');
  const panA = overlay.querySelector('.lsc-panel[data-team="a"]'), panB = overlay.querySelector('.lsc-panel[data-team="b"]');
  const err = overlay.querySelector('#lsc-err');
  const syncUI = () => { elA.textContent = a; elB.textContent = b; panA.classList.toggle('lead', a > b); panB.classList.toggle('lead', b > a); };
  const persist = () => { tdbSetLiveScore(m, a, b).catch((e) => { err.textContent = (e && e.message) || 'Could not save the live score.'; err.hidden = false; }); };
  const maybeGameOver = () => {
    if (confirmEl) { confirmEl.remove(); confirmEl = null; }
    const st = gameScoreStatus(a, b, rules);
    if (!st.valid) return;
    const winName = a > b ? aName : bName;
    confirmEl = document.createElement('div');
    confirmEl.className = 'lsc-confirm';
    confirmEl.innerHTML = `<div class="lsc-confirm-card">
      <div class="lsc-confirm-t">${escapeHTML(winName)} win ${a}–${b}</div>
      <div class="lsc-confirm-s">Finish the game?</div>
      <div class="lsc-confirm-btns">
        <button type="button" class="secondary" data-role="lsc-keep">Keep scoring</button>
        <button type="button" class="primary" data-role="lsc-finish">Finish game</button>
      </div>
    </div>`;
    overlay.appendChild(confirmEl);
    confirmEl.querySelector('[data-role="lsc-keep"]').onclick = () => { if (confirmEl) { confirmEl.remove(); confirmEl = null; } };
    confirmEl.querySelector('[data-role="lsc-finish"]').onclick = async () => {
      if (submitting) return;
      submitting = true;
      try {
        if (!(await confirmBigMargin(String(a), String(b)))) { submitting = false; return; }
        if (m.phase === 'pool') await tdbSubmitResult(m, String(a), String(b));
        else await tdbSubmitBracketResult(m, a > b ? 'a' : 'b', String(a), String(b));
        await tdbRefreshTournaments();
        finished = true; close(); render();
      } catch (e) { err.textContent = (e && e.message) || 'Could not finish the game.'; err.hidden = false; submitting = false; }
    };
  };
  const bump = (team, d) => {
    if (finished) return;
    if (team === 'a') a = Math.max(0, a + d); else b = Math.max(0, b + d);
    err.hidden = true; syncUI(); persist(); maybeGameOver();
  };
  overlay.addEventListener('click', (e) => {
    if (e.target.closest('[data-role="ls-back"]')) return close();
    if (e.target.closest('[data-role="ls-final"]')) { close(); return openBracketResultModal(matchId); }
    const plus = e.target.closest('[data-role="ls-plus"]'); if (plus) return bump(plus.getAttribute('data-team'), 1);
    const minus = e.target.closest('[data-role="ls-minus"]'); if (minus) return bump(minus.getAttribute('data-team'), -1);
  });
  syncUI();
  maybeGameOver(); // re-opened at a game-over score -> show the confirm right away
}

function openBracketResultModal(matchId) {
  const m = (state.tournamentMatches || []).find((x) => x.id === matchId);
  if (!m || !m.team_a_id || !m.team_b_id) return;
  const aName = teamNameById(state.tournamentTeams, m.team_a_id);
  const bName = teamNameById(state.tournamentTeams, m.team_b_id);
  const isFinal = m.status === 'final'; // NF-4: a final match opens in EDIT mode (fix the score, same winner only)
  const title = (isFinal ? 'Edit · ' : '') + bracketLabelPart(m) + (m.net ? ' · Net ' + m.net : '');
  const tournOf = () => (state.tournaments || []).find((x) => x.id === m.tournament_id) || {};
  // C71 (Mike, 2026-06-26 — §38 Option C): the score-entry modal is two big number tiles, each a real
  // input you can TAP TO TYPE (so a full game is one keystroke set, not 25 stepper taps) with +/- steppers
  // for nudging. The WINNER is whichever score is strictly higher — no separate "tap the winner" step.
  // A rule-hint pill shows the target. Everything below the surface (RPCs, NF-1 validation, NF-4 edit,
  // C50 forfeit, the in-flight guard, C73 no-auto-fill) is preserved exactly.
  const t0 = tournOf();
  const newModel = (m.phase === 'main' ? t0.bracket_target : t0.pool_target) != null;
  const r0 = scoringRulesFor(m.phase, t0);
  const hintText = newModel ? ('First to ' + r0.target + (r0.winBy2 ? ', win by 2' : '') + (r0.cap != null ? ' (cap ' + r0.cap + ')' : '')) : '';
  const valA = isFinal && m.score_a != null ? String(m.score_a) : '';
  const valB = isFinal && m.score_b != null ? String(m.score_b) : '';
  const overlay = document.createElement('div');
  overlay.className = 'popup-overlay brm-overlay';
  // Anyone can enter a result (Mike's "everyone scores on their own phone" model; the admin's Clear
  // is the backstop). The write goes through the anon-allowed submit_match_score RPC.
  const tile = (team, name, val) => `<div class="brm-tile" data-team="${team}">
      <span class="brm-wpill" aria-hidden="true">WINNER</span>
      <span class="brm-tname">${escapeHTML(name)}</span>
      <input class="brm-num" id="brm-${team}" type="number" inputmode="numeric" min="0" value="${escapeHTML(val)}" placeholder="0" aria-label="${escapeHTML(name)} score" />
      <div class="brm-steps">
        <button type="button" class="brm-step" data-team="${team}" data-d="-1" aria-label="${escapeHTML(name)} minus one">&minus;</button>
        <button type="button" class="brm-step" data-team="${team}" data-d="1" aria-label="${escapeHTML(name)} plus one">+</button>
      </div>
    </div>`;
  overlay.innerHTML = `<div class="popup-card card brm-card" role="dialog" aria-modal="true" aria-label="Enter match result">
    <div class="brm-title">${escapeHTML(title)}</div>
    ${hintText ? `<div class="brm-hint"><span class="brm-hdot" aria-hidden="true"></span>${escapeHTML(hintText)}</div>` : ''}
    ${isFinal ? '<p class="brm-sub">Fix the score (same winner). To change who won, use Clear instead.</p>' : ''}
    <div class="brm-tiles">${tile('a', aName, valA)}${tile('b', bName, valB)}</div>
    <p class="brm-typehint">Tap a number to type it</p>
    <div class="brm-err" id="brm-err" hidden></div>
    ${isFinal ? '' : `<button type="button" class="brm-forfeit" id="brm-forfeit">No-show? Record a forfeit</button>
    <div class="brm-fchoice" id="brm-fchoice" hidden>
      <span class="brm-fq">Who showed up? They win the forfeit.</span>
      <div class="brm-frow">
        <button type="button" class="brm-fbtn" data-team="a">${escapeHTML(aName)}</button>
        <button type="button" class="brm-fbtn" data-team="b">${escapeHTML(bName)}</button>
      </div>
    </div>`}
    <div class="brm-actions">
      <button type="button" class="secondary" id="brm-cancel">Cancel</button>
      <button type="button" class="primary" id="brm-save">Save result</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('#brm-cancel').onclick = close;
  const err = overlay.querySelector('#brm-err');
  const fail = (msg) => { err.textContent = msg; err.hidden = false; };
  const inA = overlay.querySelector('#brm-a'), inB = overlay.querySelector('#brm-b');
  const tiles = { a: overlay.querySelector('.brm-tile[data-team="a"]'), b: overlay.querySelector('.brm-tile[data-team="b"]') };
  // Live winner highlight = whichever score is strictly higher. No separate tap; ties/blanks => no winner.
  // NF-4 edit mode just pre-fills the existing scores, so the current winner lights up automatically.
  const syncWinner = () => {
    const a = inA.value === '' ? null : Number(inA.value);
    const b = inB.value === '' ? null : Number(inB.value);
    const w = (a != null && b != null && a !== b) ? (a > b ? 'a' : 'b') : null;
    tiles.a.classList.toggle('win', w === 'a');
    tiles.b.classList.toggle('win', w === 'b');
  };
  [inA, inB].forEach((el) => el.addEventListener('input', () => { err.hidden = true; syncWinner(); }));
  // Steppers nudge by 1 (clamp >= 0). The big number itself stays a normal input you can tap and type.
  overlay.querySelectorAll('.brm-step').forEach((btn) => {
    btn.onclick = () => {
      const el = btn.getAttribute('data-team') === 'a' ? inA : inB;
      el.value = String(Math.max(0, (el.value === '' ? 0 : Number(el.value)) + Number(btn.getAttribute('data-d'))));
      err.hidden = true; syncWinner();
    };
  });
  syncWinner();
  // Wave 1e: in-flight guard — a double-tap on Save/Forfeit fired two submit_match_score calls (the 2nd
  // failed cleanly via the server CAS but surfaced a spurious "another device updated" error). The flag
  // blocks the 2nd tap; the finally re-arms it on every non-success exit so a real retry still works.
  let submitting = false;
  overlay.querySelector('#brm-save').onclick = async () => {
    if (submitting) return;
    const sa = inA.value, sb = inB.value;
    if (sa === '' || sb === '') return fail('Enter both scores.'); // scores required (Mike); no auto-fill (C73)
    if (Number(sa) === Number(sb)) return fail('A game can\'t end in a tie.');
    const winner = Number(sa) > Number(sb) ? 'a' : 'b'; // winner = the higher score
    // NF-1: client-side per-phase rule pre-check (gated to the new model; the RPC enforces server-side regardless).
    const tRules = tournOf();
    if ((m.phase === 'main' ? tRules.bracket_target : tRules.pool_target) != null) {
      const st = gameScoreStatus(Number(sa), Number(sb), scoringRulesFor(m.phase, tRules));
      if (!st.valid) return fail(st.reason);
    }
    submitting = true;
    try {
      if (!(await confirmBigMargin(sa, sb))) return; // restored: catch a fat-finger blowout before it saves
      if (isFinal) {
        await tdbEditMatchScore(m, sa, sb); // NF-4: edit in place; the RPC refuses a winner flip
      } else if (m.phase === 'pool') {
        await tdbSubmitResult(m, sa, sb); // C53: pools derive the winner from the scores server-side
      } else await tdbSubmitBracketResult(m, winner, sa, sb);
      await tdbRefreshTournaments();
      close();
      render();
    } catch (e) { fail((e && e.message) || 'Could not save the result.'); }
    finally { submitting = false; }
  };
  // C50 forfeit/no-show: pick the team that showed → a small valid win (phase target by 2) auto-filled +
  // submitted, so a no-show doesn't stall the net queue or the bracket. (No winner tap in C71, so we ask
  // who showed via a two-button mini choice instead of reading a prior tap.)
  const forfeitBtn = overlay.querySelector('#brm-forfeit');
  if (forfeitBtn) {
    const fchoice = overlay.querySelector('#brm-fchoice');
    forfeitBtn.onclick = () => { fchoice.hidden = !fchoice.hidden; err.hidden = true; };
    overlay.querySelectorAll('.brm-fbtn').forEach((btn) => {
      btn.onclick = async () => {
        if (submitting) return;
        const winner = btn.getAttribute('data-team');
        const t = tournOf();
        // NF-1: forfeit auto-score must stay VALID under the new enforcement → win at the phase target by 2.
        const winS = scoringRulesFor(m.phase, t).target || (Number(t.match_cap) || 25);
        const loseS = Math.max(0, winS - 2);
        const sa = winner === 'a' ? winS : loseS, sb = winner === 'a' ? loseS : winS;
        inA.value = String(sa); inB.value = String(sb); syncWinner();
        submitting = true;
        try {
          if (m.phase === 'pool') await tdbSubmitResult(m, String(sa), String(sb)); // C53 pool forfeit
          else await tdbSubmitBracketResult(m, winner, String(sa), String(sb));
          await tdbRefreshTournaments();
          close();
          render();
        } catch (e) { fail((e && e.message) || 'Could not save the forfeit.'); }
        finally { submitting = false; }
      };
    });
  }
}

function buildBracketHTML(tournament, matches, teams, opts = {}) {
  const main = (matches || []).filter((m) => m.phase === 'main');
  if (!main.length) return '<div class="card"><p class="small" style="color:var(--muted);margin:0;">No bracket yet.</p></div>';

  // C75 (Mike, 2026-06-26): show each team's pool seed (1..N) on its bracket node so it's readable at a glance.
  const seedByTeam = {};
  computeSeeding(teams, (matches || []).filter((m) => m.phase === 'pool')).forEach((r) => { seedByTeam[r.teamId] = r.seed; });

  const ro = !!opts.readOnly; // Slice 2 (§13.3): public read-only bracket — no scoring, no path tint, gold only on the decided champ game.

  const gn = bracketGameNumbers(main); // continuous "G" game numbers across the whole bracket (Mike, 2026-06-27)
  const champ = computeChampion(main, teams);
  // §13.3: no gold/accent "champion path" tint through the public tree — the champions strip carries the gold.
  const pathIds = ro ? new Set() : championPathIds(main, champ);
  // The public Bracket page renders its OWN matte-gold champions strip above the tree, so suppress the
  // built-in green banner in read-only mode (would double up).
  const champBanner = (!ro && champ) ? `<div class="bt-champ">
    <span class="bt-cup" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M12 2.3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.7l1.1-6.5L2.6 9.1l6.5-.9z"/></svg></span>
    <span><span class="bt-champ-lbl">CHAMPION</span><span class="bt-champ-nm">${escapeHTML(champ.name)}</span></span>
  </div>` : '';

  // Anyone can enter a result (Mike's "everyone scores on their own phone" model) — no team picker.

  // Double-elim has Winners / Losers / Final brackets — one connected tree per side.
  const sideDefs = [['winners', 'Winners'], ['losers', 'Losers'], ['grand_final', 'Final']].filter(([s]) => main.some((m) => m.side === s));
  // opts.side is a caller-supplied INITIAL side (public completed bracket opens on the Final so the gold game
  // shows) — used only until the viewer taps a side tab (which sets state.bracketSide). Admin passes none.
  let side = state.bracketSide || opts.side || null;
  if (!sideDefs.some(([s]) => s === side)) side = sideDefs[0][0];
  const sideTabs = sideDefs.length > 1 ? `<div class="bt-sides">
    ${sideDefs.map(([s, lbl]) => `<button type="button" data-role="tv2-bracket-side" data-side="${s}" class="${s === side ? 'on' : ''}">${lbl}</button>`).join('')}
  </div>` : '';

  // C57: map-style bracket — pinch to zoom, drag any direction to pan (gestures handle it, no zoom buttons).
  // Mike removed the [- Fit +] control; keep a one-line hint so scoring stays discoverable.
  const zoomToggle = `<div class="bt-bar"><span class="bt-hint">${ro ? 'Tap a team for its record · pinch or drag to zoom' : (opts.preview ? 'Bracket format — teams seed in once pools finish' : 'tap a match to enter its score')}</span></div>`;

  // Columns left-to-right = rounds; connector lines between them are drawn post-render.
  const sideMatches = main.filter((m) => m.side === side);
  const rounds = Array.from(new Set(sideMatches.map((m) => m.round))).sort((a, b) => a - b);
  // Column header = the continuous game-number RANGE for that round (e.g. "G1–G8"), reading with the per-node
  // "G7" labels — replaces the old "WB R1"/"LB R1" (Mike, 2026-06-27). Within a round the G numbers are contiguous.
  const roundLabelFor = (r) => {
    const gs = sideMatches.filter((m) => m.round === r).map((m) => gn.byId[m.id]).filter((x) => x != null).sort((a, b) => a - b);
    if (!gs.length) return 'G?';
    return gs.length === 1 ? ('G' + gs[0]) : ('G' + gs[0] + '–G' + gs[gs.length - 1]);
  };
  const cols = rounds.map((r) => {
    const rm = sideMatches.filter((m) => m.round === r).sort((a, b) => a.slot - b.slot);
    return `<div class="bt-col">
      <div class="bt-rlabel">${escapeHTML(roundLabelFor(r))}</div>
      ${rm.map((m) => buildBracketNodeHTML(m, main, teams, !ro, pathIds, seedByTeam, gn, { readOnly: ro, champMatchId: opts.champMatchId })).join('')}
    </div>`;
  }).join('');

  return `${champBanner}${sideTabs}${zoomToggle}
    <div class="bt-pan${ro ? ' pd-bk-ro' : ''}" data-role="bt-pan">
      <div class="bt-canvas" data-role="bt-canvas">
        <svg class="bt-links" data-role="bt-links" xmlns="http://www.w3.org/2000/svg"></svg>
        <div class="bt-cols" data-role="bt-cols">${cols}</div>
      </div>
    </div>`;
}

// Post-render pass for the connected bracket: draws the SVG elbow connectors from each match to
// the match its winner advances to, then lays out the C57 map-style view — a fixed-height viewport
// showing the whole tree fit-to-width by default, which the user can pinch/scroll-zoom + drag any
// direction to pan. Called after every render of the tournament tab + on resize + on tab-in. No-op
// when no bracket tree is present or the tab is hidden (offsetParent null), so background syncs don't misfire.
function layoutBracketTree() {
  // pick the VISIBLE bracket pan — there can be more than one in the DOM (e.g. the tournament-mode Manage
  // preview vs the Live bracket); the hidden ones have offsetParent null.
  const pan = [...document.querySelectorAll('[data-role="bt-pan"]')].find((p) => p.offsetParent) || document.querySelector('[data-role="bt-pan"]');
  if (!pan || !pan.offsetParent) return;
  const canvas = pan.querySelector('[data-role="bt-canvas"]');
  const svg = pan.querySelector('[data-role="bt-links"]');
  if (!canvas || !svg) return;

  // Reset any prior fit-scale so we measure the tree's natural geometry.
  canvas.style.transform = 'none';
  const W = canvas.offsetWidth, H = canvas.offsetHeight;
  svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  const pos = {};
  canvas.querySelectorAll('.bt-node').forEach((n) => {
    pos[n.getAttribute('data-mid')] = { x: n.offsetLeft, y: n.offsetTop, w: n.offsetWidth, h: n.offsetHeight, path: n.classList.contains('path') };
  });
  // Draw connectors from the RENDERED nodes (data-mid -> data-next) rather than state.tournamentMatches —
  // this works for the live bracket AND the teamless format preview (whose rows aren't in state).
  let paths = '';
  canvas.querySelectorAll('.bt-node').forEach((n) => {
    const fromId = n.getAttribute('data-mid');
    const nextId = n.getAttribute('data-next');
    if (!nextId) return;
    const from = pos[fromId];
    const to = pos[nextId];
    if (!from || !to) return; // winner advances to another side (not in this view) -> no line here
    const x1 = from.x + from.w, y1 = from.y + from.h / 2, x2 = to.x, y2 = to.y + to.h / 2;
    const mx = x1 + Math.max(12, (x2 - x1) / 2);
    const onPath = from.path && to.path;
    // Styled via CSS (.bt-link/.bt-link.on) — var() is unreliable inside an SVG stroke attribute.
    paths += `<path class="bt-link${onPath ? ' on' : ''}" d="M${x1} ${y1} H${mx} V${y2} H${x2}" />`;
  });
  svg.innerHTML = paths;

  // C57: map-style view — fixed on-screen viewport; default = the WHOLE bracket fit to width AND height
  // (no scroll), centered; pinch / wheel zoom in, drag pans any direction.
  const avail = pan.clientWidth;
  const vh = Math.max(320, Math.round((window.innerHeight || 800) * 0.64));
  const fit = (avail > 0 && W > 0 && H > 0) ? Math.min(1, avail / W, vh / H) : 1;
  pan.style.height = vh + 'px';
  // Max zoom: enough to read/reach ANY single game card. The old `fit*4` PENALISED big brackets (small fit →
  // low ceiling, exactly when you need to zoom IN more), so a 18-team bracket capped at 1.8×. Raise the floor
  // to 2.8× (a 176px card → ~490px, fills a phone) and the multiplier so small brackets can still zoom far.
  btView = { W, H, vw: avail, vh, fit, max: Math.max(fit * 6, 2.8) };
  if (btScale == null) { btScale = fit; btX = (avail - W * fit) / 2; btY = (vh - H * fit) / 2; }
  btClampApply(canvas);
  wireBracketGestures(pan, canvas);
}

// C57: map-style bracket pan/zoom — scale + 2D translate on .bt-canvas (replaces the fit/zoom toggle).
let btView = null;          // {W,H,vw,vh,fit,max} from the last layout
let btScale = null;         // null => (re)fit to the whole bracket on the next layout
let btX = 0, btY = 0;       // canvas translate (px)
function btResetView() { btScale = null; } // force fit next layout (Fit button / side switch)
function btClampApply(canvas) {
  if (!btView || !canvas) return;
  const { W, H, vw, vh, fit, max } = btView;
  btScale = Math.min(max, Math.max(fit, btScale));
  const cw = W * btScale, ch = H * btScale;
  // Allow half-a-viewport of overscroll past each edge so ANY card — including the corner ones — can be
  // dragged to the CENTRE of the screen and zoomed on (the old clamp pinned edge cards to the screen edge,
  // so you could never centre them). When the content is smaller than the viewport, keep it centred.
  const ox = vw * 0.5, oy = vh * 0.5;
  btX = cw <= vw ? (vw - cw) / 2 : Math.min(ox, Math.max(vw - cw - ox, btX));
  btY = ch <= vh ? (vh - ch) / 2 : Math.min(oy, Math.max(vh - ch - oy, btY));
  canvas.style.transform = `translate(${btX}px, ${btY}px) scale(${btScale})`;
}
function btZoomAround(canvas, nextScale, px, py) {
  if (!btView) return;
  const s2 = Math.min(btView.max, Math.max(btView.fit, nextScale));
  const cx = (px - btX) / btScale, cy = (py - btY) / btScale; // content point under the focus
  btScale = s2; btX = px - cx * s2; btY = py - cy * s2;
  btClampApply(canvas);
}
// C57 redo (2026-06-25): map-style gesture controller. Touch uses native TOUCH EVENTS (not Pointer
// Events) because iOS Safari handles two simultaneous touch-pointers + setPointerCapture unreliably —
// the 2nd finger was getting dropped (pinch dead) and capture made one-finger panning janky. `e.touches`
// always reports every active finger, no capture needed → rock-solid on iOS. Exactly Mike's ask: TWO
// fingers = pinch zoom, ONE finger = free pan in ANY direction (diagonal included). Mouse keeps Pointer
// Events (gated to pointerType==='mouse') so a desktop drag still captures out-of-element. Wheel = zoom.
// Tap-to-score preserved: a clean tap never preventDefaults, so its synthesized click reaches the node.
let _btWired = null;
function wireBracketGestures(pan, canvas) {
  if (_btWired === pan) return; // pan is a fresh element each render; bind once per element (old listeners GC with the old node)
  _btWired = pan;
  const xy = (clientX, clientY) => { const r = pan.getBoundingClientRect(); return { x: clientX - r.left, y: clientY - r.top }; };
  let moved = false;

  // ---- TOUCH: 1 finger = free 2D pan · 2 fingers = pinch-zoom around the live midpoint ----
  let panStart = null;   // {x,y,bx,by}
  let pinchLast = null;  // last 2-finger distance in px (incremental zoom → no drift)
  pan.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      const p = xy(e.touches[0].clientX, e.touches[0].clientY);
      panStart = { x: p.x, y: p.y, bx: btX, by: btY }; pinchLast = null; moved = false;
    } else if (e.touches.length >= 2) {
      e.preventDefault(); // stop iOS from STARTING a whole-page pinch-zoom (touch-action:none is ignored for pinch on iOS)
      const a = xy(e.touches[0].clientX, e.touches[0].clientY), b = xy(e.touches[1].clientX, e.touches[1].clientY);
      pinchLast = Math.hypot(a.x - b.x, a.y - b.y) || 1; panStart = null; moved = true; pan.classList.add('drag');
    }
  }, { passive: false }); // non-passive so the 2-finger preventDefault above can block the iOS page-pinch
  pan.addEventListener('touchmove', (e) => {
    if (e.touches.length >= 2 && pinchLast != null) {
      e.preventDefault(); // claim the pinch (touch-action:none already set; this stops any iOS rubber-band)
      const a = xy(e.touches[0].clientX, e.touches[0].clientY), b = xy(e.touches[1].clientX, e.touches[1].clientY);
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      btZoomAround(canvas, btScale * (d / pinchLast), (a.x + b.x) / 2, (a.y + b.y) / 2);
      pinchLast = d;
    } else if (e.touches.length === 1 && panStart) {
      const p = xy(e.touches[0].clientX, e.touches[0].clientY);
      if (!moved && Math.abs(p.x - panStart.x) + Math.abs(p.y - panStart.y) > 6) { moved = true; pan.classList.add('drag'); }
      if (moved) { e.preventDefault(); btX = panStart.bx + (p.x - panStart.x); btY = panStart.by + (p.y - panStart.y); btClampApply(canvas); }
    }
  }, { passive: false });
  const endTouch = (e) => {
    if (e.touches.length === 0) { panStart = null; pinchLast = null; pan.classList.remove('drag'); }
    else if (e.touches.length === 1) { // lifted from pinch to one finger → resume panning smoothly
      const p = xy(e.touches[0].clientX, e.touches[0].clientY);
      panStart = { x: p.x, y: p.y, bx: btX, by: btY }; pinchLast = null;
    } else if (e.touches.length >= 2) { // 3→2 fingers: re-seed the pair distance so the scale doesn't jump a frame
      const a = xy(e.touches[0].clientX, e.touches[0].clientY), b = xy(e.touches[1].clientX, e.touches[1].clientY);
      pinchLast = Math.hypot(a.x - b.x, a.y - b.y) || 1; panStart = null;
    }
  };
  pan.addEventListener('touchend', endTouch);
  pan.addEventListener('touchcancel', endTouch);

  // ---- MOUSE (desktop): drag = pan. Pointer Events, mouse-only, with capture for out-of-element drag ----
  let mStart = null;
  pan.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return; // touch handled above via TouchEvents
    const p = xy(e.clientX, e.clientY); mStart = { x: p.x, y: p.y, bx: btX, by: btY }; moved = false;
  });
  pan.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || !mStart) return;
    const p = xy(e.clientX, e.clientY);
    if (!moved && Math.abs(p.x - mStart.x) + Math.abs(p.y - mStart.y) > 5) { moved = true; pan.classList.add('drag'); try { pan.setPointerCapture(e.pointerId); } catch (_) {} }
    if (moved) { btX = mStart.bx + (p.x - mStart.x); btY = mStart.by + (p.y - mStart.y); btClampApply(canvas); }
  });
  const endMouse = (e) => { if (e.pointerType && e.pointerType !== 'mouse') return; mStart = null; pan.classList.remove('drag'); };
  pan.addEventListener('pointerup', endMouse);
  pan.addEventListener('pointercancel', endMouse);

  // ---- WHEEL / trackpad: zoom around the cursor ----
  pan.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = xy(e.clientX, e.clientY);
    btZoomAround(canvas, btScale * (e.deltaY < 0 ? 1.12 : 1 / 1.12), p.x, p.y);
  }, { passive: false });

  // ---- iOS native pinch block (THE fix for "2 fingers zoomed the whole page, not the bracket") ----
  // iOS Safari fires its OWN pinch as proprietary gesture* events and ignores touch-action:none +
  // user-scalable=no for page zoom. Without blocking these, two fingers on the bracket zoom the entire
  // page. preventDefault here kills the native page-pinch; the bracket's real zoom is driven by the
  // 2-finger touchmove handler above. Harmless no-op on non-WebKit browsers (these events never fire).
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((t) =>
    pan.addEventListener(t, (e) => { e.preventDefault(); moved = true; }, { passive: false }));

  // A drag/pinch must not also fire a click that opens a match pop-up; a clean tap (moved=false) still scores.
  pan.addEventListener('click', (e) => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
}

// (Legacy public team self-registration screen `buildPublicRegisterHTML` deleted 2026-07-10, v.26 —
// it was only reached from the dead `!state.isAdmin` branch in buildTournamentTabHTML. The LIVE anon
// register flow is buildRegisterPageHTML (rf-* grammar), reached via pdTournamentView === 'register'.)

// Round 2 (2026-07-09, spec §12.4 — Mike's locked §38 pick A "tile hub"): the public Tournament tab
// is a hub (header card + tiles). The pre-existing public register/pool/bracket surface becomes the
// 'board' sub-view behind the Pools & schedule / Bracket tiles. Admin branch untouched.
let pdTournamentView = 'hub'; // 'hub' | 'pools' | 'bracket' | 'register' — module var survives partialRender (the shared 'board' view is retired from the public path — spec §13.3/§13.6)
// Rules back-stack (rules slice 2026-07-10): the Rules page is reachable from TWO places — the hub row
// and the registration form's "Read the rules" link. Its back button returns to wherever the user came
// from. Set on every data-tn-view="rules" nav (data-rules-from="register" marks the form's link).
let rulesReturnView = 'hub'; // 'hub' | 'register'
// Launch spec (2026-07-10): the just-registered team name, or null. State-driven so the "You're in!" payoff
// SURVIVES a background partialRenderTournament — the success page has no inputs, so tournamentTabIsDirty()
// is false and a 15s sync would otherwise rebuild an empty form over it. Reset to null on any hub/sub-page nav.
let regSubmittedTeam = null;
let pdPoolFilter = 'all'; // Pools & schedule tab: 'seeding' | a pool label | 'all'/stale -> resolves to first pool — survives partialRender

// Atom-up redesign (spec 2026-07-10 §1): the signed-out gate. The Tournament page is PERSONAL, so a
// signed-out user gets ONLY this — a centered logo, "This page is yours", the personal-page line, a
// full-width Sign in CTA, and a "Create an account" link. Both auth affordances carry data-role="tn-signin"
// → the #app-content handler opens the existing openAuthPage() (its create toggle covers the new account).
// FLAT on the stone (no card — the tamed watermark shows through, spec §1). Transcribed from tn5-gate.html.
function buildTournamentGateHTML() {
  return `<div class="tn-gate">
      <img class="tn-glogo" src="/logo-mark.png" alt="" aria-hidden="true" />
      <h1 class="tn-gate-h">This page is yours</h1>
      <p class="tn-gate-p">The tournament page is personal — your team, your games, your bracket run. Sign in to see it.</p>
      <button type="button" class="tn-gate-cta" data-role="tn-signin">Sign in</button>
      <div class="tn-gate-alt" data-role="tn-signin">New here? Create an account</div>
    </div>`;
}

// Rules slice (2026-07-10): the Rules page renders tournaments.rules (markdown-lite text Mike edits in
// admin) through the ESCAPE-FIRST rulesToHTML formatter (pure.js) — never raw HTML. Same tournament the
// hub targets. Empty/unset rules keep the honest "coming soon" stub (never invent rules content). The
// back button routes through rulesReturnView so the form's "Read the rules" link returns to the form.
function buildTournamentRulesHTML() {
  const list = state.tournaments || [];
  const active = state.activeTournamentId ? list.find((x) => x.id === state.activeTournamentId) : null;
  const show = active || list[0] || null;
  const backSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg>';
  const back = rulesReturnView === 'register' ? 'register' : 'hub';
  const header = `<div class="pd-pagehdr">
      <button type="button" class="pd-back" data-tn-view="${back}" aria-label="${back === 'register' ? 'Back to registration' : 'Back to Tournament'}">${backSvg}</button>
      <div class="ph-titles"><span class="pd-eyebrow">${escapeHTML(show ? (show.name || 'Tournament') : 'Tournament')}</span><div class="pd-htitle">Rules</div></div>
    </div>`;
  const body = rulesToHTML(show && show.rules);
  if (!body) {
    return `${header}
    <div class="tn-rules-stub">
      <div class="tn-rules-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg></div>
      <div class="tn-rules-h">Rules are on the way</div>
      <div class="tn-rules-s">The house rules for how we play will live here. Check back soon.</div>
    </div>`;
  }
  return `${header}<div class="rl-body">${body}</div>`;
}

// Atom-up redesign (spec 2026-07-10 §2): the signed-in hub, transcribed from tn5-assembled.html. FLAT on the
// stone (no card): title → stage progress bar (one stage at a time, tournamentStageModel) → meta line →
// hairline icon/data rows. The ACTIVE stage's row lights green "Happening now" (is-now); the not-yet stage
// fades (is-locked). Rows route to the EXISTING subpages/tabs; the claim entry folds into the My-team row.
function buildTournamentHubHTML() {
  const list = state.tournaments || [];
  const active = state.activeTournamentId ? list.find((x) => x.id === state.activeTournamentId) : null;
  const show = active || list[0] || null;
  const teams = (active ? state.tournamentTeams : []) || [];
  const matches = (active ? state.tournamentMatches : []) || [];
  const pools = (active ? state.tournamentPools : []) || [];

  if (!show) {
    return `<div class="tn-hub">
        <h1 class="tn-title">No tournament scheduled</h1>
        <div class="tn-meta">${state.loaded ? 'Check back soon.' : 'Loading…'}</div>
      </div>`;
  }

  const stage = tournamentStageModel(show, matches);
  const netCount = Number(show.net_count) || 0;
  const metaBits = [
    teams.length ? teams.length + (teams.length === 1 ? ' team' : ' teams') : '',
    netCount ? netCount + (netCount === 1 ? ' net' : ' nets') : '',
  ].filter(Boolean).join(' · ');

  // Stage progress bar — one stage at a time (spec §2/§3). Omitted entirely pre-play (setup) — the rows carry
  // their own honest "not started" subs. countLabel: "24 of 36" (pools) / "Round 2 of 4" (bracket) / "Complete".
  const countLabel = stage.phase === 'pools' ? (stage.count + ' of ' + stage.total)
    : stage.phase === 'bracket' ? ('Round ' + stage.count + ' of ' + stage.total)
    : stage.phase === 'completed' ? 'Complete' : '';
  const progHTML = stage.stageLabel ? `<div class="tn-prog">
        <div class="tn-prog-head"><span>${escapeHTML(stage.stageLabel)}</span><span class="tn-prog-n">${escapeHTML(countLabel)}</span></div>
        <div class="tn-prog-bar"><i style="width:${stage.pct}%"></i></div>
      </div>` : '';

  // Row icons (transcribed literally from the mockup — SVG only, no emoji, §51). A right chevron marks a row
  // with no honest numeric value yet.
  const ICON = {
    team: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    chart: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
    trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  };
  const CHEV = '›';
  // sub + stat are pre-escaped HTML by the callers (every dynamic piece runs through escapeHTML); title is
  // escaped here. Rows are clickable DIVs (the codebase norm for flat rows, cf. .pd-game) — the delegated
  // #app-content handler routes on the data-* attribute; a <button> would inherit the global blue chrome.
  const row = (attrs, cls, icon, title, sub, stat) => `<div class="tn-row${cls ? ' ' + cls : ''}" ${attrs}>
      <span class="tn-lft"><svg viewBox="0 0 24 24">${icon}</svg><span class="tn-tl">${escapeHTML(title)}<span class="tn-sub">${sub}</span></span></span>
      <span class="tn-stat">${stat}</span></div>`;

  const rows = [];

  // My team — claimed shows team + record + next; unclaimed folds in the claim entry (spec §3, item 3).
  const mine = myTeamInfo();
  if (mine) {
    const peek = teamPeekModel(mine.teamId, { teams, matches, pools });
    const nm = (peek && peek.teamName) || mine.teamName || 'Your team';
    const poolPart = (peek && peek.poolLabel) ? ' · Pool ' + escapeHTML(peek.poolLabel) : '';
    let stat = CHEV;
    if (peek) {
      const rec = peek.wins + '-' + peek.losses;
      const nextNet = peek.next && peek.next.net;
      stat = peek.live ? (rec + ' · Playing now') : (nextNet ? (rec + ' · Net ' + nextNet + ' next') : rec);
    }
    rows.push(row('data-nav-tab="myteam"', '', ICON.team, 'My team', escapeHTML(nm) + poolPart, escapeHTML(stat)));
  } else if (publicLiveTournament()) {
    // Unclaimed + a live tournament to claim into: the claim entry (relocated from the old Home hero) lives
    // here in the My-team slot. Same #pd-claim id → the existing delegated handler opens the claim flow.
    rows.push(row('id="pd-claim"', '', ICON.team, 'Claim your team', 'Playing? Find your name', CHEV));
  } else {
    rows.push(row('data-nav-tab="myteam"', '', ICON.team, 'My team', 'Claim your team once play begins', CHEV));
  }

  // Pools & schedule — the ACTIVE stage during pools (green "Happening now"); a final summary afterward.
  const poolGames = matches.filter((m) => m.phase === 'pool' && m.team_a_id && m.team_b_id);
  const poolDone = poolGames.filter((m) => m.status === 'final').length;
  const poolTotal = poolGames.length;
  const livePool = matches.filter((m) => m.phase === 'pool' && m.status === 'live').length;
  if (stage.activeView === 'pools') {
    const sub = livePool ? ('Happening now · ' + livePool + (livePool === 1 ? ' game playing' : ' games playing')) : 'Pool play underway';
    rows.push(row('data-tn-view="pools"', 'is-now', ICON.cal, 'Pools & schedule', sub, escapeHTML(poolDone + '/' + poolTotal)));
  } else if (show.status === 'setup') {
    rows.push(row('data-tn-view="pools"', '', ICON.cal, 'Pools & schedule', 'Starts when play begins', CHEV));
  } else {
    rows.push(row('data-tn-view="pools"', '', ICON.cal, 'Pools & schedule', 'Pool play complete', poolTotal ? escapeHTML(poolTotal + '/' + poolTotal) : CHEV));
  }

  // Seeding — leader once any pool game is final (§27 TRUE: no leader before a result exists). Folds into
  // the Pools & schedule Seeding tab (Mike K, 2026-07-10): data-pools-tab tells the delegate to open there.
  const anyFinal = matches.some((m) => m.phase === 'pool' && m.status === 'final');
  const standings = computeStandings(teams, matches);
  const leader = (anyFinal && standings[0]) ? (standings[0].name || '') : '';
  rows.push(row('data-tn-view="pools" data-pools-tab="seeding"', '', ICON.chart, 'Seeding',
    leader ? 'Leader' : 'Starts when games do', leader ? escapeHTML(leader) : CHEV));

  // Bracket — locked/faded during pools (spec §2); the active stage during bracket; the champion after.
  const mainMatches = matches.filter((m) => m.phase === 'main');
  if (stage.activeView === 'bracket') {
    const bl = mainMatches.filter((m) => m.status !== 'final').length;
    const line = bracketStatusLine(mainMatches);
    rows.push(row('data-tn-view="bracket"', 'is-now', ICON.trophy, 'Bracket',
      'Happening now' + (line ? ' · ' + escapeHTML(line) : ''), bl ? escapeHTML(bl + ' left') : CHEV));
  } else if (show.status === 'completed') {
    const oc = bracketOutcome(mainMatches, teams);
    rows.push(row('data-tn-view="bracket"', '', ICON.trophy, 'Bracket',
      oc ? 'Champion crowned' : 'Final', oc ? escapeHTML(oc.championName || '') : CHEV));
  } else {
    const sub = show.status === 'pools' ? 'Unlocks when pools finish' : 'After pool play';
    rows.push(row('data-tn-view="bracket"', 'is-locked', ICON.trophy, 'Bracket', sub, CHEV));
  }

  // Rules — tournaments.rules rendered on the Rules page (stub when unset); Past tournaments → History.
  rows.push(row('data-tn-view="rules"', '', ICON.book, 'Rules', 'How we play', CHEV));
  rows.push(row('data-nav-tab="history"', '', ICON.clock, 'Past tournaments', 'Champions &amp; records', CHEV));

  return `<div class="tn-hub">
      <h1 class="tn-title">${escapeHTML(show.name || 'Tournament')}</h1>
      ${progHTML}
      <div class="tn-meta">${escapeHTML(metaBits)}</div>
      <div class="tn-rows">${rows.join('')}</div>
    </div>`;
}

// The public Tournament tab root: the hub, or one of its dedicated sub-pages (each its own destination).
// Slice 2 (§13.3/§13.6): the legacy shared 'board' view is RETIRED from the public path — Pools & schedule,
// Bracket, and Register are their own pages in pd chrome; the no-tournament / registration-closed fallbacks
// live in the hub itself. Admin keeps buildTournamentTabHTML() directly (its own branch inside that function).
function buildPublicTournamentRootHTML() {
  if (state.isAdmin) return buildTournamentTabHTML();
  // Rules slice (2026-07-10): rules are HOUSE rules, not personal data — the one tournament view that
  // renders for EVERYONE, so the registration form's "Read the rules" link works signed-out (reg is
  // anon). Checked BEFORE the sign-in gate on purpose; every other view stays behind it.
  if (pdTournamentView === 'rules') return buildTournamentRulesHTML();
  // Registration is ANONYMOUS by design (the launch flow): the register view must never sit behind the
  // sign-in gate — signed-out captains land here straight from the Home CTA. (Launch-night fix: v.15's
  // gate accidentally blocked it.)
  if (pdTournamentView === 'register') return buildRegisterPageHTML();
  // Atom-up redesign (spec 2026-07-10 §1): the Tournament page is PERSONAL — signed-out users get ONLY the
  // gate (no hub, no data). Branch on the real signed-in flag (state.authSession) before any view/data.
  if (!state.authSession) return buildTournamentGateHTML();
  if (pdTournamentView === 'pools') return buildPoolsSchedulePageHTML();
  if (pdTournamentView === 'bracket') return buildBracketPageHTML();
  return buildTournamentHubHTML();
}

// ── Slice 2 (spec §13.3): the public Bracket page — a dedicated destination behind the hub's Bracket tile
// (fixes both tiles routing to one board). pd chrome (page header + one quiet status line, Mike pick M). THREE states driven by
// tournament status + bracket data:
//   pre-bracket (no main-phase matches / pools running) — a FLAT block (no card) "The bracket generates when pool
//     play finishes" + a live "N of M pool games final" progress line + a quiet seeding → Standings chip.
//   live — the FULL real bt-* tree (buildBracketHTML in read-only mode: winners + losers via side tabs,
//     live game lit matte green) under one quiet status line "● Live · Double elimination · <current round>".
//   completed — a matte-gold champions strip above the tree + the decided championship game lit gold; this
//     is the tournament's ending surface and stays until the next event is scheduled.
// HARD RULES (Mike): bracket match-node cards stay SOLID var(--card) (never frosted — the page keeps the
// watermark); gold appears ONLY on the decided championship game + the champions strip
// (nothing gold before a winner exists, no gold path tint). Read-only spectator copy — never "submit results".
function buildBracketPageHTML() {
  const list = state.tournaments || [];
  const active = state.activeTournamentId ? list.find((x) => x.id === state.activeTournamentId) : null;
  const show = active || list[0] || null;
  const teams = (active ? state.tournamentTeams : []) || [];
  const matches = (active ? state.tournamentMatches : []) || [];
  const main = matches.filter((m) => m.phase === 'main');
  const outcome = bracketOutcome(main, teams); // non-null ONLY once a champion is decided → the completed state
  const stateKind = outcome ? 'completed' : (main.length ? 'live' : 'pre');

  // §13.6: a SETUP-status tournament is in registration, NOT pool play — key the pre-bracket copy + pill on
  // status so "Pools in progress / still battling through pools" never shows before pools start.
  const isReg = !!(show && show.status === 'setup');
  const regOpen = !!(show && show.registration_open && show.status === 'setup');
  const backSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg>';
  // Mike pick M (2026-07-10): the status pill is OUT of the header. Status lives in ONE quiet line under the
  // title (LIVE only); the pre + completed states carry their own honest signal (the heading copy / the gold
  // champions strip). The header is just back + eyebrow + Barlow title in every state.
  const header = `<div class="pd-pagehdr">
      <button type="button" class="pd-back" data-tn-view="hub" aria-label="Back to Tournament">${backSvg}</button>
      <div class="ph-titles"><span class="pd-eyebrow">${escapeHTML(show ? (show.name || 'Tournament') : 'Tournament')}</span><div class="pd-htitle">Bracket</div></div>
    </div>`;

  if (stateKind === 'pre') {
    const poolGames = matches.filter((m) => m.phase === 'pool' && m.team_a_id && m.team_b_id);
    const total = poolGames.length;
    const done = poolGames.filter((m) => m.status === 'final').length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const progress = total ? `<div class="pd-bk-prog">
        <div class="pd-bk-prog-top"><span class="pd-bk-prog-l">Pool play</span><span class="pd-bk-prog-n">${done} of ${total} games final</span></div>
        <div class="pd-bk-bar"><div class="pd-bk-bar-fill" style="width:${pct}%;"></div></div>
      </div>` : '';
    // §13.6: key the heading + body on status. Registration (setup) → honest "comes after pool play" copy
    // (never "battling through pools"); pools → the existing in-play copy + the seeding chip (deep-links to
    // the Pools Seeding tab — Mike K; seeding only exists once pool games are played, so it's omitted during
    // registration).
    const preH = isReg ? 'The bracket comes after pool play' : 'The bracket generates when pool play finishes';
    const preS = isReg
      ? (regOpen
        ? 'Registration is open — the bracket comes after pool play. Once teams are in and pools wrap, it appears right here.'
        : 'The bracket comes after pool play. Once pools wrap, it appears right here.')
      : 'Teams are still battling through pools. The moment the last pool game goes final, seeds lock in and the bracket appears right here.';
    const seedChip = isReg ? '' : `<button type="button" class="pd-bk-chip" data-tn-view="pools" data-pools-tab="seeding">Current seeding
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>
          <span class="pd-bk-chip-2">Seeding</span></button>`;
    return `${header}<div class="pd-bk-pre">
        <div class="pd-bk-preic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3v4a2 2 0 0 0 2 2h4"/><path d="M6 21v-4a2 2 0 0 1 2-2h4"/><path d="M12 12h6"/><path d="M18 8v8"/></svg></div>
        <div class="pd-bk-preh">${escapeHTML(preH)}</div>
        <div class="pd-bk-pres">${escapeHTML(preS)}</div>
        ${progress}
        ${seedChip}
      </div>`;
  }

  if (stateKind === 'completed') {
    const rec = computeTeamRecord(outcome.championId, matches, teams);
    const recLine = rec.wins + '–' + rec.losses
      + (outcome.runnerUpName ? ' · def. ' + escapeHTML(outcome.runnerUpName) + ' in the final' : '');
    const strip = `<div class="pd-bk-champbar">
        <span class="pd-bk-cbic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v4a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4a3 3 0 0 0 3 3"/><path d="M17 6h3a3 3 0 0 1-3 3"/></svg></span>
        <div><div class="pd-bk-cbh">Champions — ${escapeHTML(outcome.championName)}</div><div class="pd-bk-cbs">${recLine}</div></div>
      </div>`;
    const tree = buildBracketHTML(active, matches, teams, { readOnly: true, champMatchId: outcome.decidingMatchId, side: 'grand_final' });
    const persist = '<p class="pd-bk-persist">These results stay on this page until the next event is scheduled.</p>';
    return `${header}${strip}${tree}${persist}`;
  }

  // live
  const line = bracketStatusLine(main);
  const statusline = `<div class="pd-bk-statusline"><span class="pd-bk-sl-dot"></span><b>Live</b> · Double elimination${line ? ' · ' + escapeHTML(line) : ''}</div>`;
  const tree = buildBracketHTML(active, matches, teams, { readOnly: true });
  return `${header}${statusline}${tree}`;
}

// Finish-line Slice 3 (spec §13.5, Mike's locked round-2 pick A): Register is the tournament as an EVENT.
// The event card SELLS before it asks — logo mark + REGISTRATION OPEN pill + the name in Sora display + the
// co-ed line in plain English + chips (date ONLY when real · cost · players) + an honest live-spots line +
// one big "Register your team" CTA. The CTA opens a body-level join sheet (openJoinSheet) so a background
// sync can never wipe a typed roster (the same overlay discipline as openClaimPage/openTeamPeek). Closed
// variant: the same hero with a "Registration closed" pill and NO CTA (honest state, no dead button).
const REG_CAL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9h18M8 2.5v4M16 2.5v4"/></svg>';
const REG_COST_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 6.5C17 4.6 14.8 3.5 12 3.5S7 4.6 7 6.5 9.2 9.5 12 9.5s5 1.4 5 3.5-2.2 3.5-5 3.5-5-1.1-5-3"/></svg>';
const REG_PLAYERS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><circle cx="17" cy="9.5" r="2.6"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M15 15.5a4.5 4.5 0 0 1 5.5 3.5"/></svg>';
// Launch spec (2026-07-10, Mike): the registration PAGE. Home "Register" (data-tn-view="register") routes
// STRAIGHT here — no event-card middle step, no join sheet. "there are no captains; every player must have a
// first and last name … enter the team name and the 4 players names … a spot for the venmo link … teams have
// to pay to register." Team name + exactly team_size player rows (first AND last name, NO captain) + a Venmo
// pay-to-register gate; the Register button stays LOCKED until the "we sent it" box is checked, and submit
// writes paid=TRUE. Renders inside #tab-tournament .container: tournamentTabIsDirty() already shields a typed
// roster from the 15s background sync, and success swaps the page content IN PLACE (no body-level sheet).
// SINGLE source of truth for which tournament this page shows AND submits against — the page builder and the
// submit handler both call resolveRegisterTournament(), so the displayed event and the written event can
// never diverge (spec item 7).
function resolveRegisterTournament() {
  const list = state.tournaments || [];
  // Resolve EXACTLY as the Home "Register" CTA does (publicHomeHTML): the open setup tournament — never a
  // live/completed one — so display and submit target the same event the CTA advertised (spec item 7). This
  // matters when a live tournament runs alongside an open setup one: state.activeTournamentId then points at
  // the LIVE row (public auto-follow), which must NOT become the thing we register into.
  const setups = list.filter((x) => x.status === 'setup');
  const reg = setups.find((x) => x.registration_open) || setups[0] || null;
  if (reg) return reg;
  // Fallback only when the route is reached with no setup tournament at all (stale link): the active row.
  const active = state.activeTournamentId ? list.find((x) => x.id === state.activeTournamentId) : null;
  return active || list[0] || null;
}

// The registered teams for the register target, for the proactive duplicate-name hint. state.tournamentTeams
// is loaded for state.activeTournamentId; on launch the target IS the active (auto-followed) tournament, so
// this is the same list the event card counted. When the target isn't the active row (rare: a live event runs
// alongside the open setup one), we return [] and lean on the SERVER duplicate check — the true authority.
function registerTargetTeams() {
  const show = resolveRegisterTournament();
  if (show && state.activeTournamentId === show.id) return state.tournamentTeams || [];
  return [];
}

const RF_VENMO_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="5.5" width="19" height="13" rx="2.5"/><path d="M2.5 10h19"/></svg>';

function buildRegisterPageHTML() {
  // State-driven success: once a team is in, this route renders the payoff (survives partialRender rebuilds).
  if (regSubmittedTeam) return buildRegisterSuccessHTML(regSubmittedTeam);
  const show = resolveRegisterTournament();
  const backSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg>';
  const header = `<div class="pd-pagehdr pd-reg-pagehdr">
      <button type="button" class="pd-back" data-tn-view="hub" aria-label="Back to Tournament">${backSvg}</button>
    </div>`;
  if (!show) return `${header}<div class="pd-empty">No tournament scheduled.</div>`;

  const regOpen = !!(show.registration_open && show.status === 'setup');
  const name = (show.name && String(show.name).trim()) || 'Tournament';
  const teamSize = Number(show.team_size) || 4;

  // A closed/stale route shows an honest closed state, never a dead form (the Home CTA only appears when open).
  if (!regOpen) {
    return `${header}<section class="rf-page">
        <div class="rf-eyebrow">${escapeHTML(name)}</div>
        <h1 class="rf-h1">Registration closed</h1>
        <p class="rf-sub">Registration isn't open for this tournament right now.</p>
      </section>`;
  }

  // Payment: bind the amount to buy_in when set, else the league default. ONE money token drives both the
  // Venmo button and the checkbox so the displayed price and the "we paid" line can never disagree (§27).
  const buyIn = show.buy_in != null ? String(show.buy_in).trim() : '';
  const payDisplay = buyIn || '$80 a team';
  const moneyMatch = buyIn.match(/\$\s?\d[\d,]*/);
  const money = moneyMatch ? moneyMatch[0].replace(/\s+/g, '') : '$80';
  // Mockup payline: the dollar figure BIG in Barlow, the unit ("a team") small + muted inside the same span.
  // When buy_in is free text that doesn't lead with the $ figure, show it whole in the big span (never invent).
  const payTail = payDisplay.indexOf(money) === 0 ? payDisplay.slice(money.length).trim() : '';
  const amtHTML = payTail
    ? `<span class="rf-amt">${escapeHTML(money)} <span class="rf-amt-unit">${escapeHTML(payTail)}</span></span>`
    : `<span class="rf-amt">${escapeHTML(payDisplay)}</span>`;

  // Only render a real, tappable link for an http(s) Venmo URL (same guard the legacy register screen used) — an
  // empty/unset link renders a DISABLED button + "coming soon" so Mike pastes it into admin settings and it
  // lights up (no dead javascript: link ever reaches the DOM).
  const venmoRaw = show.venmo_link ? String(show.venmo_link).trim() : '';
  const venmo = /^https?:\/\//i.test(venmoRaw) ? venmoRaw : '';
  const venmoBlock = venmo
    ? `<a class="rf-venmo" href="${escapeHTML(venmo)}" target="_blank" rel="noopener noreferrer">${RF_VENMO_SVG}Pay ${escapeHTML(money)} on Venmo</a>`
    : `<button type="button" class="rf-venmo is-disabled" disabled aria-disabled="true">${RF_VENMO_SVG}Pay ${escapeHTML(money)} on Venmo</button>
       <div class="rf-venmo-soon">Venmo link coming soon</div>`;

  const rows = Array.from({ length: teamSize }, (_, i) => `<div class="rf-prow">
      <span class="rf-pnum">${i + 1}</span>
      <input class="rf-pinput" id="reg-p${i + 1}" type="text" placeholder="First and last name" autocomplete="off" autocapitalize="words" spellcheck="false" />
    </div>`).join('');

  // FLAT page (mockup: no card — content sits on the stone background, watermark showing through). Header
  // composition mirrors the Home registration lead (.hm-regwrap): title cluster left, the cross logo absolute
  // at the TOP RIGHT with height matched to the h1+sub cluster — it reads like Home's lead, not a tiny mark.
  return `${header}<section class="rf-page">
      <div class="rf-hero">
        <div class="rf-heroinfo">
          <h1 class="rf-h1">Register your team</h1>
          <p class="rf-sub">${escapeHTML(name)} · ${teamSize}s co-ed</p>
        </div>
        <img class="rf-herologo" src="/logo-mark.png" alt="" aria-hidden="true" />
      </div>

      <div class="rf-sect">Team name</div>
      <div class="rf-fld"><input class="rf-tinput" id="reg-team" type="text" placeholder="Pick a team name" autocomplete="off" autocapitalize="words" spellcheck="false" /></div>
      <p class="rf-warn" id="reg-name-warn" role="status" aria-live="polite"></p>

      <div class="rf-plhead"><span class="rf-sect">Players</span><span class="rf-plhint">first + last name · at least 1 guy + 1 girl</span></div>
      <div class="rf-pllist">${rows}</div>

      <div class="rf-divlab"><span>Payment</span></div>
      <div class="rf-payline">${amtHTML}<span class="rf-payd">Teams pay to register — your spot is held once it's sent.</span></div>
      ${venmoBlock}
      <label class="rf-paid"><input type="checkbox" id="reg-paid" class="rf-paidbox" /><span class="rf-paidt">We sent the <b>${escapeHTML(money)}</b> on Venmo</span></label>

      <p class="rf-msg" id="reg-msg" role="status" aria-live="polite"></p>
      <button type="button" class="rf-cta" data-role="reg-page-submit" disabled aria-disabled="true">Register team</button>
      <div class="rf-ctanote">The button unlocks once payment is checked off.</div>
      <div class="rf-ruleslink" data-tn-view="rules" data-rules-from="register">Read the rules ›</div>
    </section>`;
}

// The registration PAGE submit — mirrors the PROVEN safety of submitJoinSheet, adapted for an in-page (not
// body-level) surface. Double-tap guard (disable before the RPC, re-enable ONLY on a caught failure); after a
// REAL insert, show success UNCONDITIONALLY even if the post-refresh throws; paid=TRUE (pay-to-register); a
// network-type error maps to friendly copy; no outbox/queue on failure. The tournament id + team_size come
// from resolveRegisterTournament() — the same resolution the page rendered from.
async function submitRegisterForm(btn) {
  const show = resolveRegisterTournament();
  if (!show) return;
  const teamSize = Number(show.team_size) || 4;
  const fv = (fid) => ((document.getElementById(fid) || {}).value || '').trim();
  const teamName = fv('reg-team');
  const roster = Array.from({ length: teamSize }, (_, i) => fv('reg-p' + (i + 1)));
  const setMsg = (txt, ok) => { const el = document.getElementById('reg-msg'); if (el) { el.textContent = txt; el.style.color = ok ? 'var(--live)' : 'var(--danger)'; } };
  // Pay-to-register gate: the button is disabled until the box is checked, but guard here too (belt + braces).
  const paid = !!((document.getElementById('reg-paid') || {}).checked);
  if (!paid) { setMsg('Check the box once you\'ve sent payment on Venmo.', false); return; }
  const v = registerFormValidate(teamName, roster, teamSize); // team name + exactly N + first-and-last, trimmed
  if (!v.ok) { setMsg(v.message, false); return; }
  if (btn) btn.setAttribute('disabled', 'true'); // in-flight guard (double-tap) — re-enabled ONLY on a real failure
  try {
    // paid = TRUE now (pay-to-register). Roster is already trimmed by registerFormValidate → clean jsonb.
    await tdbRegisterTeam(show.id, v.teamName, v.roster, null, true);
  } catch (err) {
    if (btn) btn.removeAttribute('disabled');
    const raw = (err && err.message) || '';
    const netlike = /fetch|network|failed to fetch/i.test(raw); // a connectivity blip, not a real reject
    setMsg(netlike ? 'Could not register — check your connection and try again.' : (raw || 'Could not register — try again.'), false);
    return; // the INSERT failed → real error, stay on the form (no outbox/queue)
  }
  // Registered for real — a refresh/render hiccup must NOT claim it failed (mirrors the proven path). Flip the
  // state flag FIRST so the render() below already paints the payoff (not a flash of empty form), then the
  // explicit swap guarantees success even if that render() threw.
  regSubmittedTeam = v.teamName;
  try { await tdbRefreshTournaments(); render(); } catch (_) {}
  renderRegisterFormSuccess(v.teamName);
}

// Post-submit "You're in" payoff. Reuses the recorded join-sheet success design (pd-reg-won/check/wonh/
// paychip/cta/backlink), the payment chip now reading "sent on Venmo", and the same claim hand-off
// (openClaimPage when signed in, else claimIntent → openAuthPage). Pure builder so both the immediate
// in-place swap AND a later partialRender rebuild (via buildRegisterPageHTML) produce the identical page.
function buildRegisterSuccessHTML(teamName) {
  const nm = escapeHTML(teamName);
  const backSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg>';
  return `<div class="pd-pagehdr pd-reg-pagehdr">
      <button type="button" class="pd-back" data-tn-view="hub" aria-label="Back to Tournament">${backSvg}</button>
    </div>
    <section class="pd-card pd-reg-card is-success">
      <div class="pd-reg-won">
        <div class="pd-reg-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></div>
        <div class="pd-reg-wonh">You're in, ${nm}!</div>
        <div class="pd-reg-wonsub">Your team is registered — see you at the tournament.</div>
        <span class="pd-reg-paychip">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5.5" width="19" height="13" rx="2.5"/><path d="M2.5 10h19"/></svg>
          Payment: sent on Venmo
        </span>
        <button type="button" class="pd-reg-cta" data-role="reg-page-claim">Claim your spot on ${nm}</button>
        <button type="button" class="pd-reg-backlink" data-tn-view="hub">Back to tournament</button>
      </div>
    </section>`;
}

// Flip to the payoff: set the state flag (so it survives background rebuilds) AND swap the container now
// (so it shows even if the post-refresh render() threw before this ran — spec: success UNCONDITIONALLY).
function renderRegisterFormSuccess(teamName) {
  regSubmittedTeam = teamName;
  const c = document.querySelector('#tab-tournament .container');
  if (c) c.innerHTML = buildRegisterSuccessHTML(teamName);
  const panel = document.getElementById('tab-tournament');
  if (panel) panel.scrollTop = 0;
}

// ── Finish-line Slice 3 (spec §13.5): the JOIN SHEET. A body-level bottom sheet (dimmed backdrop, grab
// handle, slide-up) that opens off the event card's CTA. It lives on document.body — OUTSIDE #tab-tournament
// and #app-content — so neither partialRenderTournament nor a full render() can ever wipe a typed roster
// (the same overlay discipline as openClaimPage / openTeamPeek; the app has a recorded history of background
// syncs eating typed forms). It wires to the PROVEN public write path VERBATIM: joinSheetValidate (same rules
// + inline copy) → tdbRegisterTeam (the register_team RPC). Payment moved to check-in (§13.5), so paid=false.
function buildJoinSheetFormHTML(show) {
  const teamSize = Number(show.team_size) || 4;
  const name = escapeHTML((show.name && String(show.name).trim()) || 'Tournament');
  const rows = Array.from({ length: teamSize }, (_, i) => `<div class="pd-reg-plrow">
      <span class="pd-reg-plnum">${i + 1}</span>
      <input class="pd-reg-plinput" id="reg-p${i + 1}" type="text" placeholder="Add a player" autocomplete="off" autocapitalize="words" spellcheck="false" />
      ${i === 0 ? '<span class="pd-reg-plcap">Captain</span>' : ''}
    </div>`).join('');
  return `<div class="pd-reg-grip"></div>
    <div class="pd-reg-sheethd">
      <div>
        <div class="pd-reg-sheeteyebrow">Register · ${name}</div>
        <div class="pd-reg-sheetteam">Your team</div>
      </div>
      <button type="button" class="pd-reg-sheetx" data-role="reg-sheet-close" aria-label="Close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
      </button>
    </div>
    <label class="pd-reg-flbl" for="reg-team">Team name</label>
    <input class="pd-reg-finput" id="reg-team" type="text" placeholder="Pick a team name" autocomplete="off" autocapitalize="words" spellcheck="false" />
    <div class="pd-reg-plhead">
      <span class="pd-reg-flbl">Players</span>
      <span class="pd-reg-plhint">Co-ed 4s · 1 guy + 1 girl min</span>
    </div>
    <div class="pd-reg-pllist">${rows}</div>
    <p class="pd-reg-msg" id="reg-msg" role="status" aria-live="polite"></p>
    <button type="button" class="pd-reg-cta pd-reg-sheetcta" data-role="reg-sheet-submit">Register team</button>
    <div class="pd-reg-pay">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5.5" width="19" height="13" rx="2.5"/><path d="M2.5 10h19"/></svg>
      <span>Pay <b>$20 each</b> at check-in — cash or Venmo</span>
    </div>`;
}

function closeJoinSheet() {
  const el = document.getElementById('pd-reg-sheet');
  if (el) el.remove();
}

function openJoinSheet() {
  const list = state.tournaments || [];
  const active = state.activeTournamentId ? list.find((x) => x.id === state.activeTournamentId) : null;
  const show = active || list[0] || null;
  // Never open a sheet for a closed / missing event (the CTA only renders when open, but guard anyway).
  if (!show || !(show.registration_open && show.status === 'setup')) return;
  closeJoinSheet();
  const scrim = document.createElement('div');
  scrim.id = 'pd-reg-sheet';
  scrim.className = 'pd-reg-scrim';
  scrim.setAttribute('role', 'dialog');
  scrim.setAttribute('aria-modal', 'true');
  scrim.setAttribute('aria-label', 'Register your team');
  scrim.innerHTML = `<div class="pd-reg-sheet">${buildJoinSheetFormHTML(show)}</div>`;
  document.body.appendChild(scrim);
  // The sheet lives on document.body (outside #app-content's delegated listeners), so its buttons bind here.
  scrim.addEventListener('click', (ev) => {
    if (ev.target === scrim) { closeJoinSheet(); return; } // backdrop tap dismisses
    const r = ev.target.closest('[data-role]');
    if (!r) return;
    const role = r.getAttribute('data-role');
    if (role === 'reg-sheet-close') { closeJoinSheet(); return; }
    if (role === 'reg-sheet-submit') { submitJoinSheet(r); return; }
    if (role === 'reg-claim') {
      // Instant claim hand-off (§13.5): signed-in → the claim page; signed-out → sign in first
      // (claimIntent re-opens the claim page automatically once SIGNED_IN lands) — mirrors #pd-claim.
      closeJoinSheet();
      if (state.authSession) { openClaimPage(); }
      else { claimIntent = true; openAuthPage(); }
      return;
    }
    if (role === 'reg-back-hub') {
      // Close to the hub, which now shows the incremented team count (render() ran on submit).
      pdTournamentView = 'hub';
      const c = document.querySelector('#tab-tournament .container');
      if (c) c.innerHTML = buildPublicTournamentRootHTML();
      closeJoinSheet();
      return;
    }
  });
  setTimeout(() => { const n = document.getElementById('reg-team'); if (n) { try { n.focus({ preventScroll: true }); } catch (_) { try { n.focus(); } catch (_e) {} } } }, 60);
}

async function submitJoinSheet(btn) {
  const fv = (fid) => ((document.getElementById(fid) || {}).value || '').trim();
  const teamName = fv('reg-team');
  const t = (state.tournaments || []).find((x) => x.id === state.activeTournamentId) || {};
  const teamSize = Number(t.team_size) || 4;
  const roster = Array.from({ length: teamSize }, (_, i) => fv('reg-p' + (i + 1))).filter(Boolean);
  const setMsg = (txt, ok) => { const el = document.getElementById('reg-msg'); if (el) { el.textContent = txt; el.style.color = ok ? 'var(--live)' : 'var(--danger)'; } };
  const v = joinSheetValidate(teamName, roster, teamSize); // same rules + inline copy as the proven path
  if (!v.ok) { setMsg(v.message, false); return; }
  if (btn) btn.setAttribute('disabled', 'true'); // in-flight guard (double-tap)
  try {
    // The PROVEN write path, verbatim (tv2-register-team). paid=false: payment moves to check-in (§13.5).
    await tdbRegisterTeam(state.activeTournamentId, v.teamName, v.roster, null, false);
  } catch (err) {
    if (btn) btn.removeAttribute('disabled');
    setMsg((err && err.message) || 'Could not register — try again.', false);
    return; // the INSERT failed → real error, stay on the form
  }
  // Registered for real — a refresh/render hiccup must NOT claim it failed (mirrors the proven path). The
  // sheet is body-level, so render() (which rebuilds the hub underneath with the new count) never wipes it.
  try { await tdbRefreshTournaments(); render(); } catch (_) {}
  renderJoinSheetSuccess(v.teamName);
}

// Post-submit "You're in" payoff (§13.5): the sheet swaps to the success state — a check, the team name,
// the payment-at-check-in chip, the instant claim hand-off, and a quiet back-to-tournament link.
function renderJoinSheetSuccess(teamName) {
  const scrim = document.getElementById('pd-reg-sheet');
  if (!scrim) return;
  const sheet = scrim.querySelector('.pd-reg-sheet');
  if (!sheet) return;
  const nm = escapeHTML(teamName);
  sheet.classList.add('is-success');
  sheet.innerHTML = `<div class="pd-reg-grip"></div>
    <div class="pd-reg-won">
      <div class="pd-reg-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></div>
      <div class="pd-reg-wonh">You're in, ${nm}!</div>
      <div class="pd-reg-wonsub">Your team is registered — see you at the tournament.</div>
      <span class="pd-reg-paychip">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5.5" width="19" height="13" rx="2.5"/><path d="M2.5 10h19"/></svg>
        Payment: at check-in
      </span>
      <button type="button" class="pd-reg-cta" data-role="reg-claim">Claim your spot on ${nm}</button>
      <button type="button" class="pd-reg-backlink" data-role="reg-back-hub">Back to tournament</button>
    </div>`;
}

// ── Slice 1 (spec §13.1): the Pools & schedule page — a dedicated public destination behind the hub's
// Pools & schedule tile (kills the status-driven shared board for the public). Locked hybrid "C structure
// with B net cards": pd page header (back → hub, eyebrow = tournament name) · pool filter chips · a "Now
// playing" cluster (one live-score card per net, hidden when nothing is live) · per-net cards grouped
// under slim pool section labels, each listing that net's games in play order. Read-only spectator copy
// (NEVER "submit your results"). Renders entirely from tournament state (partialRender-safe rebuild).
function pdOrdinal(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 1) return String(n);
  const s = ['th', 'st', 'nd', 'rd'], m = v % 100;
  return v + (s[(m - 20) % 10] || s[m] || s[0]);
}

// One standings-lite row (# / Team / W–L / Diff) — the shared grammar for BOTH the public Pools page and the
// admin Manage → Pools view (Task 7). `badge` prefixes the team cell (the pool chip on the Seeding tab);
// `myTeamId` lights the spectator's own row ("You") — admin passes null (an operator has no "You").
function poolStandRowHTML(rank, teamId, name, wins, losses, diff, badge, myTeamId) {
  const EN = '–';
  const mine = myTeamId && teamId === myTeamId;
  const diffCls = diff > 0 ? 'c4' : 'c4 n';
  const diffTxt = (diff > 0 ? '+' : '') + diff;
  const youTag = mine ? '<span class="pl-youtag">You</span>' : '';
  return `<div class="pl-srow${mine ? ' pl-you' : ''}"><span class="c1">${escapeHTML(String(rank))}</span><span class="c2">${badge || ''}${escapeHTML(name)}${youTag}</span><span class="c3">${escapeHTML(String(wins))}${EN}${escapeHTML(String(losses))}</span><span class="${diffCls}">${escapeHTML(diffTxt)}</span></div>`;
}

function buildPoolsSchedulePageHTML() {
  // Rebuilt to Mike's session-9 "H" pick (atom-up 2026-07-10): POOL + SEEDING tabs -> standings-lite
  // (# / Team / W-L / Diff) -> per-net hairline games. §51 matte, Barlow display, single --accent, flat on
  // stone (NO frosted pd-card). pdPoolFilter is 'A'|'B'|...|'seeding' (a stale/'all' value -> first pool).
  const EN = '–'; // en dash — record / score / net-range separator
  const list = state.tournaments || [];
  const active = state.activeTournamentId ? list.find((x) => x.id === state.activeTournamentId) : null;
  const show = active || list[0] || null;
  const teams = (active ? state.tournamentTeams : []) || [];
  const matches = (active ? state.tournamentMatches : []) || [];
  const pools = (active ? state.tournamentPools : []) || [];
  const header = `<div class="pd-pagehdr">
      <button type="button" class="pd-back" data-tn-view="hub" aria-label="Back to Tournament"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg></button>
      <div class="ph-titles"><span class="pd-eyebrow">${escapeHTML(show ? (show.name || 'Tournament') : 'Tournament')}</span><div class="pd-htitle">Pools &amp; schedule</div></div>
    </div>`;

  // Only pools that actually have scheduled games become a tab (a drawn-but-unscheduled pool is skipped).
  const activePools = pools.filter((p) => matches.some((m) => m.pool_id === p.id));
  if (!show || !activePools.length || !matches.length) {
    return `${header}<div class="pl-empty">The schedule appears here once pool play is drawn.</div>`;
  }

  // Tab selection: 'seeding', else a real pool label, else the first pool (default). Survives partialRender.
  const poolLabels = activePools.map((p) => p.label || '');
  const selected = pdPoolFilter === 'seeding'
    ? 'seeding'
    : (poolLabels.includes(pdPoolFilter) ? pdPoolFilter : poolLabels[0]);

  const tab = (label, val) => `<button type="button" class="pl-tab${selected === val ? ' pl-on' : ''}" data-pl-tab="${escapeHTML(val)}"${selected === val ? ' aria-current="true"' : ''}>${escapeHTML(label)}</button>`;
  const tabs = `<div class="pl-tabs" role="group" aria-label="Pools and seeding">${activePools.map((p) => tab('Pool ' + (p.label || ''), p.label || '')).join('')}${tab('Seeding', 'seeding')}</div>`;

  // Round meta: total rounds = max queue_order across pool games; current round = highest round with any
  // final + 1 (capped at total). "done of total" counts pool-phase games that have both teams (byes excluded).
  const poolGames = matches.filter((m) => m.pool_id && m.team_a_id && m.team_b_id && (m.phase ? m.phase === 'pool' : true));
  const total = poolGames.length;
  const done = poolGames.filter((m) => m.status === 'final').length;
  const maxRound = Math.max(1, ...poolGames.map((m) => m.queue_order || 0));
  const finalOrders = poolGames.filter((m) => m.status === 'final').map((m) => m.queue_order || 0);
  const curRound = Math.min(maxRound, (finalOrders.length ? Math.max(...finalOrders) : 0) + 1);
  const meta = `<p class="pl-meta">Round ${curRound} of ${maxRound} · ${done} of ${total} game${total === 1 ? '' : 's'} final</p>`;

  const myTeam = myTeamInfo();
  const myTeamId = myTeam ? myTeam.teamId : null;
  const colh = `<div class="pl-colh"><span class="c1">#</span><span class="c2">Team</span><span class="c3">W${EN}L</span><span class="c4">Diff</span></div>`;
  // One standings-lite row (# / Team / W-L / Diff). `badge` prefixes the team cell (pool chip on Seeding).
  // Task 7: the row markup is now the shared poolStandRowHTML() so the admin Manage → Pools view reuses the
  // EXACT standings-lite grammar (the "You" highlight is public-only — admin passes myTeamId null).
  const srow = (rank, teamId, name, wins, losses, diff, badge) =>
    poolStandRowHTML(rank, teamId, name, wins, losses, diff, badge, myTeamId);

  let body;
  if (selected === 'seeding') {
    const poolByTeam = {};
    teams.forEach((t) => { const p = pools.find((pp) => pp.id === t.pool_id); if (p) poolByTeam[t.id] = p.label || ''; });
    const seeds = computeSeeding(teams, matches);
    const rows = seeds.map((r) => {
      const badge = poolByTeam[r.teamId] ? `<span class="pl-pl">${escapeHTML(poolByTeam[r.teamId])}</span> ` : '';
      return srow(r.seed, r.teamId, r.name, r.wins, r.losses, r.pointDiff, badge);
    }).join('');
    body = `<div class="pl-sect">Overall seeding</div>${colh}${rows}<p class="pl-foot">Seeded by win %, then point diff — this sets the bracket order.</p>`;
  } else {
    const pool = activePools.find((p) => (p.label || '') === selected) || activePools[0];
    const shaped = shapeStandingsByPool(pools, teams, matches).find((s) => s.poolLabel === (pool.label || ''));
    const standRows = (shaped ? shaped.rows : []).map((r) => srow(r.rank, r.teamId, r.name, r.wins, r.losses, r.pointDiff, '')).join('');
    const poolMatches = matches.filter((m) => m.pool_id === pool.id);
    const nets = [...new Set(poolMatches.map((m) => m.net).filter((n) => n != null))].sort((a, b) => a - b);
    const netsLabel = nets.length ? ('Net' + (nets.length > 1 ? 's' : '') + ' ' + formatNetList(nets)) : '';
    const gsections = nets.map((net) => {
      const games = poolMatches.filter((m) => m.net === net).sort((a, b) => (a.queue_order || 0) - (b.queue_order || 0));
      const rows = games.map((g, i) => {
        const order = g.queue_order || (i + 1);
        const aId = g.team_a_id, bId = g.team_b_id;
        const aN = escapeHTML(teamNameById(teams, aId));
        const bN = escapeHTML(teamNameById(teams, bId));
        const aTap = aId ? `<span class="tapname" data-team-peek="${escapeHTML(aId)}">${aN}</span>` : aN;
        const bTap = bId ? `<span class="tapname" data-team-peek="${escapeHTML(bId)}">${bN}</span>` : bN;
        if (g.status === 'final') {
          const aWin = g.winner_team_id === aId;
          const w = aWin ? aTap : bTap, l = aWin ? bTap : aTap;
          // Score pair follows the displayed winner-first name order (§27 TRUE), not the stored a-b order.
          const ws = aWin ? g.score_a : g.score_b, ls = aWin ? g.score_b : g.score_a;
          return `<div class="pl-g"><span class="rd">R${escapeHTML(String(order))}</span><span class="gt"><b>${w}</b> <span class="def">def.</span> <span class="lose">${l}</span></span><span class="sc">${escapeHTML(String(ws))}${EN}${escapeHTML(String(ls))}</span><span class="ftag">FINAL</span></div>`;
        }
        if (g.status === 'live') {
          const sa = Number(g.score_a) || 0, sb = Number(g.score_b) || 0;
          return `<div class="pl-g live"><span class="rd">R${escapeHTML(String(order))}</span><span class="gt">${aTap} <span class="vs">vs</span> ${bTap}</span><span class="sc">${sa}${EN}${sb}</span><span class="pill">LIVE</span></div>`;
        }
        return `<div class="pl-g"><span class="rd">R${escapeHTML(String(order))}</span><span class="gt up">${aTap} <span class="vs">vs</span> ${bTap}</span><span class="ftag">UP NEXT</span></div>`;
      }).join('');
      return `<div class="pl-net">NET ${escapeHTML(String(net))}</div>${rows}`;
    }).join('');
    body = `<div class="pl-sect">Pool ${escapeHTML(pool.label || '')} standings</div>${colh}${standRows}<div class="pl-sect">Games${netsLabel ? ' · ' + escapeHTML(netsLabel) : ''}</div>${gsections}`;
  }

  return `${header}${meta}${tabs}${body}`;
}

// Slice 1 (spec §13.2): the tap-a-team peek — a read-only, account-free popover anchored below the tapped
// team name (shared by the Pools page + the Home live board). Body-level + fixed-position so a background
// partialRender rebuild of the panel can't strand it (dismissTeamPeek() runs on every render). No admin
// actions, ever — "seeing is free".
let _teamPeekOutside = null;
function dismissTeamPeek() {
  const el = document.getElementById('pd-team-peek');
  if (el) el.remove();
  if (_teamPeekOutside) {
    document.removeEventListener('pointerdown', _teamPeekOutside, true);
    const content = document.getElementById('app-content');
    if (content) content.removeEventListener('scroll', _teamPeekOutside, true);
    window.removeEventListener('resize', _teamPeekOutside, true);
    _teamPeekOutside = null;
  }
  const prev = document.querySelector('.tapname.pd-peeked');
  if (prev) prev.classList.remove('pd-peeked');
}

function buildTeamPeekInnerHTML(m) {
  const poolPos = m.poolRank ? (pdOrdinal(m.poolRank) + ' in the pool') : (m.seed ? ('Seed #' + m.seed) : 'Not ranked yet');
  const poolChip = m.poolLabel ? `<span class="pd-peek-pool">Pool ${escapeHTML(m.poolLabel)}</span>` : '';
  const recLine = m.gamesPlayed
    ? ((m.pointDiff > 0 ? '+' : '') + m.pointDiff + ' points · ' + m.gamesPlayed + (m.gamesPlayed === 1 ? ' game' : ' games') + ' played')
    : 'No games scored yet';
  let rows = '';
  if (m.live) {
    rows += `<div class="pd-peek-row">
      <div class="pd-peek-ic pd-peek-live"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 2"/></svg></div>
      <div class="pd-peek-rl"><div class="k">Playing now${m.live.net ? ' · Net ' + escapeHTML(String(m.live.net)) : ''}</div><div class="v">vs <span class="op">${escapeHTML(m.live.oppName || '—')}</span></div></div>
      <div class="pd-peek-rr"><span class="sc">${m.live.myScore}&ndash;${m.live.oppScore}</span><span class="lt">LIVE</span></div>
    </div>`;
  }
  if (m.next) {
    const kick = m.next.phase === 'main'
      ? ('Next game · Bracket' + (m.next.roundLabel ? ' · ' + escapeHTML(m.next.roundLabel.replace(/ M\d+$/, '')) : ''))
      : ('Next game' + (m.next.net ? ' · Net ' + escapeHTML(String(m.next.net)) : ''));
    rows += `<div class="pd-peek-row">
      <div class="pd-peek-ic pd-peek-nx"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg></div>
      <div class="pd-peek-rl"><div class="k">${kick}</div><div class="v">vs <span class="op">${escapeHTML(m.next.oppName || '—')}</span></div></div>
      <div class="pd-peek-rr"><span class="nx">Up next</span></div>
    </div>`;
  }
  if (!rows) {
    rows = `<div class="pd-peek-row"><div class="pd-peek-ic pd-peek-nx"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg></div><div class="pd-peek-rl"><div class="k">Schedule</div><div class="v">No upcoming game right now</div></div></div>`;
  }
  return `<span class="pd-peek-arrow" aria-hidden="true"></span>
    <button type="button" class="pd-peek-x" data-role="peek-close" aria-label="Close">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
    </button>
    <div class="pd-peek-top">
      <div class="pd-peek-mark"><span>${escapeHTML(m.initials)}</span></div>
      <div class="pd-peek-id"><div class="pd-peek-name">${escapeHTML(m.teamName)}</div><div class="pd-peek-sub">${poolChip}${escapeHTML(poolPos)}</div></div>
      <span class="pd-peek-lock"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg> View only</span>
    </div>
    <div class="pd-peek-rec"><div class="pd-peek-recbig">${m.wins}&ndash;${m.losses}</div><div class="pd-peek-recl">${escapeHTML(recLine)}</div></div>
    <div class="pd-peek-rows">${rows}</div>
    <div class="pd-peek-foot">Scores update on their own. Full standings live on the Standings tab.</div>`;
}

function openTeamPeek(teamId, anchorEl) {
  dismissTeamPeek();
  const model = teamPeekModel(teamId, {
    teams: state.tournamentTeams || [],
    matches: state.tournamentMatches || [],
    pools: state.tournamentPools || [],
  });
  if (!model) return;
  const peek = document.createElement('div');
  peek.id = 'pd-team-peek';
  peek.className = 'pd-peek';
  peek.setAttribute('role', 'dialog');
  peek.setAttribute('aria-label', 'Team peek: ' + model.teamName);
  peek.innerHTML = buildTeamPeekInnerHTML(model);
  document.body.appendChild(peek);
  // The peek lives on document.body (outside #app-content's delegated listener), so its X binds here.
  peek.addEventListener('click', (ev) => { if (ev.target.closest('[data-role="peek-close"]')) dismissTeamPeek(); });
  if (anchorEl && anchorEl.classList) anchorEl.classList.add('pd-peeked');

  // Position: below the tapped name, kept inside the app column (works on desktop where the shell is a
  // centered 390 column). Flip above when it would run off the bottom; clamp the arrow under the name.
  const content = document.getElementById('app-content') || document.body;
  const cr = content.getBoundingClientRect();
  const ar = anchorEl ? anchorEl.getBoundingClientRect() : cr;
  const margin = 8;
  const left = Math.round(cr.left + margin);
  const width = Math.round(cr.width - margin * 2);
  peek.style.left = left + 'px';
  peek.style.width = width + 'px';
  const ph = peek.offsetHeight;
  const below = ar.bottom + 10;
  let top;
  if (below + ph <= window.innerHeight - margin) {
    top = below;
  } else if (ar.top - ph - 10 >= margin) {
    top = ar.top - ph - 10;
    peek.classList.add('pd-peek-flip');
  } else {
    top = Math.max(margin, window.innerHeight - ph - margin);
  }
  peek.style.top = Math.round(top) + 'px';
  const arrow = peek.querySelector('.pd-peek-arrow');
  if (arrow) arrow.style.left = Math.round(Math.min(Math.max(ar.left + ar.width / 2 - left, 18), width - 30)) + 'px';

  // Dismiss on tap-outside / scroll / resize (the X is handled by the content click delegate).
  _teamPeekOutside = (ev) => {
    if (ev && ev.type === 'pointerdown' && (peek.contains(ev.target) || (anchorEl && anchorEl.contains(ev.target)))) return;
    dismissTeamPeek();
  };
  setTimeout(() => {
    document.addEventListener('pointerdown', _teamPeekOutside, true);
    content.addEventListener('scroll', _teamPeekOutside, true);
    window.addEventListener('resize', _teamPeekOutside, true);
  }, 0);
}

function buildTournamentTabHTML() {
  const list = state.tournaments || [];
  const active = state.activeTournamentId
    ? list.find((x) => x.id === state.activeTournamentId)
    : null;

  // Admin-only: buildPublicTournamentRootHTML() (the sole caller) only invokes this under `if (state.isAdmin)`.
  // The legacy public (!state.isAdmin) read-only branch here was dead code — removed 2026-07-10 (v.26).

  const err = state.tournamentTabError
    ? `<div class="card" style="border-left:4px solid var(--danger);color:var(--danger);">${escapeHTML(state.tournamentTabError)}</div>`
    : '';

  // Admin, no active tournament → create form + tournament list.
  if (!active) {
    const listHTML = list.length
      ? list.map((x) => `
        <div class="row" style="justify-content:space-between;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">
          <button type="button" data-role="tv2-select-tournament" data-id="${escapeHTML(x.id)}" style="background:none;border:none;text-align:left;flex:1;font-size:16px;color:var(--brand);cursor:pointer;padding:4px 0;">
            ${escapeHTML(x.name || '')} <span class="small" style="color:var(--muted);">· ${escapeHTML(tournamentStatusLabel(x.status))}</span>
          </button>
          <button type="button" class="danger" data-role="tv2-delete-tournament" data-id="${escapeHTML(x.id)}">Delete</button>
        </div>`).join('')
      : '<p class="small" style="color:var(--muted);margin:0;">No tournaments yet — create your first one above.</p>';
    return `${err}
    <div class="card">
      <h3 style="margin:0 0 8px;">New Tournament</h3>
      <input type="text" id="tv2-name" placeholder="Tournament name (e.g. Summer Slam 6s)" />
      <div id="tv2-format-picker" style="margin-top:12px;">${buildFormatPickerHTML()}</div>
      <div style="display:flex;gap:8px;margin-top:12px;">
        <label style="flex:1;display:flex;flex-direction:column;gap:2px;font-size:13px;color:var(--muted);">Pools
          <input type="number" id="tv2-pools" value="4" min="1" inputmode="numeric" style="width:100%;flex:0 0 auto;" />
        </label>
        <label style="flex:1;display:flex;flex-direction:column;gap:2px;font-size:13px;color:var(--muted);">Nets
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
  // Phase-aware target: pool play shows the POOL target (e.g. "to 15 (cap 20)"), bracket shows the bracket
  // target ("to 25"). Was always match_cap (the bracket target), which misread "to 25" during pool play.
  const targetLabel = (active.status === 'bracket' || active.status === 'completed')
    ? 'to ' + escapeHTML(String(active.bracket_target != null ? active.bracket_target : active.match_cap))
    : 'to ' + escapeHTML(String(active.pool_target != null ? active.pool_target : active.match_cap)) + (active.pool_cap != null ? ' (cap ' + escapeHTML(String(active.pool_cap)) + ')' : '');
  const headerCard = `<div class="card">
    <div class="row" style="justify-content:space-between;align-items:center;gap:8px;">
      <div style="flex:1;min-width:0;">
        <h3 style="margin:0;">${escapeHTML(active.name || '')}</h3>
        <p class="small" style="color:var(--muted);margin:2px 0 0;">${escapeHTML(tournamentStatusLabel(active.status))} · ${teams.length} ${teams.length === 1 ? 'team' : 'teams'} · ${targetLabel} · ${escapeHTML(String(active.pool_count))} pools · ${escapeHTML(String(active.net_count))} nets</p>
      </div>
      ${(active.status === 'setup' || active.status === 'pools') ? `<button type="button" class="secondary" data-role="tv2-edit-settings" data-id="${escapeHTML(active.id)}">Edit</button>` : ''}
      <button type="button" class="secondary" data-role="tv2-back">All</button>
    </div>
  </div>`;

  // Bracket stage: single-round-focus renderer (mockup #1).
  if (active.status === 'bracket' || active.status === 'completed') {
    return `${err}${headerCard}${buildBracketHTML(active, matches, teams)}${buildSeedingTableHTML(teams, matches)}`;
  }

  // Pool-play stage: standings + matches + override + generate bracket when done.
  if (active.status === 'pools') {
    const poolMatches = matches.filter((m) => m.phase === 'pool');
    const allDone = poolMatches.length > 0 && poolMatches.every((m) => m.status === 'final' || !m.team_a_id || !m.team_b_id);
    return `${err}${headerCard}
      ${buildPoolPlayHTML(active, pools, teams, matches, true, state.tournamentPickedTeamId)}
      ${buildSeedingTableHTML(teams, matches)}
      <div class="card">
        ${allDone
          ? '<button type="button" class="primary" data-role="tv2-generate-bracket" style="width:100%;margin-bottom:8px;">Generate Bracket</button>'
          : '<p class="small" style="color:var(--muted);margin:0 0 8px;">Finish all pool games to generate the bracket.</p>'}
        <button type="button" class="danger" data-role="tv2-reset-pools" style="width:100%;">Reset Pools (clear results)</button>
      </div>`;
  }

  // Setup stage: add teams + draw/start pools.
  let poolSetup = '';
  if (teams.length >= 2) {
    if (!pools.length) {
      poolSetup = `<div class="card">
        <h3 style="margin:0 0 8px;">Pools</h3>
        <p class="small" style="color:var(--muted);margin:0 0 8px;">Randomly draw ${escapeHTML(String(active.pool_count))} pools from your ${teams.length} teams.</p>
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
        return `<div style="margin-bottom:10px;"><strong>Pool ${escapeHTML(p.label)}</strong>${rows || '<p class="small" style="color:var(--muted);margin:0;">empty</p>'}</div>`;
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
    <div class="row" style="justify-content:space-between;align-items:center;gap:8px;">
      <h3 style="margin:0;">Registration</h3>
      <button type="button" class="${active.registration_open ? 'danger' : 'primary'}" data-role="tv2-toggle-registration">${active.registration_open ? 'Close' : 'Open'}</button>
    </div>
    <p class="small" style="color:var(--muted);margin:6px 0 10px;">${active.registration_open ? 'Teams can register now — share the link in GroupMe.' : 'Open registration so teams sign themselves up (replaces the Google Form).'}</p>
    <label class="reg-label" for="tv2-venmo">Venmo payment link</label>
    <input type="text" id="tv2-venmo" class="reg-input" placeholder="https://venmo.com/u/yourname" value="${escapeHTMLText(active.venmo_link || '')}" />
    <label class="reg-label" for="tv2-buyin">Buy-in (shown to teams)</label>
    <input type="text" id="tv2-buyin" class="reg-input" placeholder="$80 per team" value="${escapeHTMLText(active.buy_in || '')}" />
    <button type="button" class="secondary" data-role="tv2-save-registration" style="width:100%;">Save</button>
    ${active.registration_open ? '<button type="button" class="secondary" data-role="tv2-share-registration" style="width:100%;margin-top:8px;">Copy registration link</button>' : ''}
    ${teams.length ? `<div style="margin-top:12px;"><div class="reg-label">Registered (${teams.length})</div>${buildPaymentSummaryHTML(teams, active)}${teams.map((tm) => {
      const rost = Array.isArray(tm.roster) ? tm.roster : [];
      return `<div style="padding:6px 0;border-bottom:1px solid var(--border);">
        <div class="row" style="justify-content:space-between;align-items:center;gap:8px;">
          <span style="flex:1;min-width:0;">${escapeHTMLText(tm.name || '')} ${tm.paid ? '<span class="reg-paidtag">paid</span>' : '<span class="reg-unpaidtag">unpaid</span>'}</span>
          <button type="button" class="secondary" data-role="tv2-rename-team" data-id="${escapeHTMLText(tm.id)}" data-name="${escapeHTMLText(tm.name || '')}">Rename</button>
          <button type="button" class="secondary" data-role="tv2-toggle-paid" data-id="${escapeHTMLText(tm.id)}">${tm.paid ? 'Unpaid' : 'Paid'}</button>
        </div>
        ${rost.length ? `<div class="small" style="color:var(--muted);">${rost.map((n) => escapeHTMLText(String(n))).join(', ')}</div>` : ''}
      </div>`;
    }).join('')}</div>` : ''}
  </div>
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

// ── Tournament MODE (Mike, 2026-06-27): tap the admin Tournament card → a focused mode with its own bottom
// nav (Home · Manage · Live · Co-pilot) + a clear way back to normal AS. MANAGE = everything editable at
// EVERY phase (§38 layout C: teams-first + toolbar). LIVE = the read-first board/bracket + seeding. Additive
// + gated behind state.tournamentMode; reuses the existing tv2-* roles + helpers (only new write = roster edit).
function tournamentTargetLabel(t) {
  if (!t) return '';
  return (t.status === 'bracket' || t.status === 'completed')
    ? 'to ' + escapeHTML(String(t.bracket_target != null ? t.bracket_target : t.match_cap))
    : 'to ' + escapeHTML(String(t.pool_target != null ? t.pool_target : t.match_cap)) + (t.pool_cap != null ? ' (cap ' + escapeHTML(String(t.pool_cap)) + ')' : '');
}
function buildTournamentModeBarHTML(active) {
  const sub = active ? `${escapeHTML(tournamentStatusLabel(active.status))} · ${escapeHTML(String((active.team_size) || 4))}/team · ${tournamentTargetLabel(active)}` : '';
  return `<div class="tm-bar">
    <div class="tm-bar-id"><div class="tm-bar-nm">${active ? escapeHTML(active.name || 'Tournament') : 'Tournament'}</div>${sub ? `<div class="tm-bar-sub">${sub}</div>` : ''}</div>
    <button type="button" class="tm-exit" data-role="tv2-exit-mode">&lsaquo; Exit tournament view</button>
  </div>`;
}
// Manage = a HUB of tiles; each tile opens its OWN page (Mike, 2026-06-27, §38 layout B — tile grid). One
// purpose per screen for clarity. Pages: Teams (incl. add) · Pools · Bracket · Settings · Registration &
// payment · Tournament. Each page reuses the existing tv2-* roles + helpers; "‹ Manage" returns to the hub.
const MANAGE_TILES = [
  ['teams', 'Teams', '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/>'],
  ['pools', 'Pools', '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'],
  ['bracket', 'Bracket', '<path d="M6 4v16M6 8h6v4H6M18 12v8M18 12h-6"/>'],
  ['settings', 'Settings', '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>'],
  ['reg', 'Registration & payment', '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13l2 2 4-4"/>'],
  ['tournament', 'Tournament', '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M6 4h12v4a6 6 0 0 1-12 0Z"/><path d="M9 18h6M10 21h4M12 14v4"/>'],
];
function manageTileStatus(view, active, teams, pools, matches) {
  if (view === 'teams') return teams.length + (teams.length === 1 ? ' team' : ' teams');
  if (view === 'pools') return active.status !== 'setup' ? 'running' : (pools.length ? 'drawn' : 'not drawn');
  if (view === 'bracket') return (active.status === 'bracket' || active.status === 'completed') ? 'live' : 'not generated';
  if (view === 'settings') return tournamentTargetLabel(active);
  if (view === 'reg') return (active.registration_open ? 'open' : 'closed') + ' · ' + teams.filter((t) => t.paid).length + '/' + teams.length + ' paid';
  if (view === 'tournament') return tournamentStatusLabel(active.status);
  return '';
}
function manageHubHTML(active, teams, pools, matches) {
  const tiles = MANAGE_TILES.map(([view, label, svg]) => `<button type="button" class="tm-tile" data-role="tv2-manage-nav" data-view="${view}">
    <svg class="tm-tile-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svg}</svg>
    <span class="tm-tile-lb">${label}</span><span class="tm-tile-st">${escapeHTML(String(manageTileStatus(view, active, teams, pools, matches) || ''))}</span>
  </button>`).join('');
  return `<div class="tm-grid">${tiles}</div>`;
}
function buildManageTabHTML() {
  const list = state.tournaments || [];
  const active = state.activeTournamentId ? list.find((x) => x.id === state.activeTournamentId) : null;
  if (!active) {
    // No active tournament → the Tournament page (switch/create) is the only thing to do.
    return `${buildTournamentModeBarHTML(null)}${manageTournamentPageHTML(null, list)}`;
  }
  const teams = state.tournamentTeams || [];
  const pools = state.tournamentPools || [];
  const matches = state.tournamentMatches || [];
  const view = state.manageView || 'hub';
  if (view === 'hub') return `${buildTournamentModeBarHTML(active)}${manageHubHTML(active, teams, pools, matches)}`;
  const titles = { teams: 'Teams', pools: 'Pools', bracket: 'Bracket', settings: 'Settings', reg: 'Registration & payment', tournament: 'Tournament' };
  const backBar = `<div class="tm-bar"><button type="button" class="tm-exit" data-role="tv2-manage-back">&lsaquo; Manage</button><div class="tm-pagetitle">${escapeHTML(titles[view] || 'Manage')}</div></div>`;
  let body = '';
  if (view === 'teams') body = manageTeamsPageHTML(active, teams, matches);
  else if (view === 'pools') body = managePoolsPageHTML(active, teams, pools, matches);
  else if (view === 'bracket') body = manageBracketPageHTML(active, teams, matches);
  else if (view === 'settings') body = manageSettingsPageHTML(active);
  else if (view === 'reg') body = manageRegPageHTML(active, teams);
  else if (view === 'tournament') body = manageTournamentPageHTML(active, list);
  return `${backBar}${body}`;
}
function manageTeamsPageHTML(active, teams, matches) {
  const status = active.status;
  const teamSize = Number(active.team_size) || 4;
  const seedByTeam = {};
  computeSeeding(teams, matches.filter((m) => m.phase === 'pool')).forEach((r) => { seedByTeam[r.teamId] = r.seed; });
  // Manage>Teams add card (§38 Option A, Mike 2026-06-30): a Quick (name only) / Full-roster mode toggle.
  // Quick = name-only via tv2-quick-add-team (closes the audit's #3 "forces a full 4-player roster" friction);
  // Full = the existing roster path via tv2-register-team. Default = quick (the fast day-of path).
  const addForm = `<div class="card tm-addcard is-quick" id="tm-addcard">
    <div class="sd-h" style="font-size:14px;margin:0 0 8px;">Add a team</div>
    <div class="qa-seg">
      <button type="button" class="qa-seg-btn is-on" data-role="tv2-add-mode" data-mode="quick">Quick &middot; name only</button>
      <button type="button" class="qa-seg-btn" data-role="tv2-add-mode" data-mode="full">Full roster (${teamSize})</button>
    </div>
    <input type="text" id="reg-team" class="reg-input" placeholder="Team name" autocomplete="off" autocapitalize="words" style="margin-top:8px;" />
    <div class="tm-pgrid tm-add-roster">${Array.from({ length: teamSize }, (_, i) => `<input type="text" id="reg-p${i + 1}" class="reg-input" placeholder="Player ${i + 1}" autocomplete="off" autocapitalize="words" />`).join('')}</div>
    <label class="reg-check" style="margin:6px 0;"><input type="checkbox" id="reg-paid" /> Paid</label>
    <button type="button" class="primary tm-add-submit" data-role="tv2-quick-add-team" style="width:100%;">Add team</button>
    <p class="reg-teamspill" id="reg-msg"></p>
  </div>`;
  const removeBtn = (tm) => status === 'setup'
    ? `<button type="button" class="tm-mini tm-mini-dang" data-role="tv2-delete-team" data-id="${escapeHTML(tm.id)}">Remove</button>`
    : `<button type="button" class="tm-mini tm-mini-dang" data-role="tv2-withdraw-team" data-id="${escapeHTML(tm.id)}" data-name="${escapeHTMLText(tm.name || '')}">Withdraw</button>`;
  const teamCards = teams.length ? teams.map((tm) => {
    const seed = seedByTeam[tm.id];
    const rost = Array.isArray(tm.roster) ? tm.roster : [];
    return `<div class="card tm-team">
      <div class="tm-team-top">
        <div class="tm-team-id"><div class="tm-team-nm">${seed ? `<span class="tm-seed">${seed}</span>` : ''}${escapeHTML(tm.name || '')}</div>
          <div class="tm-team-pl">${rost.length ? rost.map((n) => escapeHTML(String(n))).join(', ') : '<span style="color:var(--faint);">no players</span>'}</div></div>
        <span class="${tm.paid ? 'reg-paidtag' : 'reg-unpaidtag'}">${tm.paid ? 'paid' : 'unpaid'}</span>
      </div>
      <div class="tm-team-acts">
        <button type="button" class="tm-mini" data-role="tv2-rename-team" data-id="${escapeHTML(tm.id)}" data-name="${escapeHTMLText(tm.name || '')}">Rename</button>
        <button type="button" class="tm-mini" data-role="tv2-edit-roster" data-id="${escapeHTML(tm.id)}" data-name="${escapeHTMLText(tm.name || '')}">Edit roster</button>
        <button type="button" class="tm-mini" data-role="tv2-toggle-paid" data-id="${escapeHTML(tm.id)}">${tm.paid ? 'Mark unpaid' : 'Mark paid'}</button>
        ${removeBtn(tm)}
      </div>
    </div>`;
  }).join('') : `<div class="card"><p class="small" style="color:var(--muted);margin:0;">No teams yet — add one above.</p></div>`;
  return `${addForm}<div class="tm-sec">Teams (${teams.length})</div>${teamCards}`;
}
function managePoolsPageHTML(active, teams, pools, matches) {
  if (active.status === 'setup') {
    if (teams.length < 2) return `<div class="card"><p class="small" style="color:var(--muted);margin:0;">Add at least 2 teams first (Teams page).</p></div>`;
    if (!pools.length) return `<div class="card"><h3 style="margin:0 0 8px;">Pools</h3>
      <p class="small" style="color:var(--muted);margin:0 0 8px;">Randomly draw ${escapeHTML(String(active.pool_count))} pools from your ${teams.length} teams.</p>
      <button type="button" class="primary" data-role="tv2-draw-pools" style="width:100%;">Draw pools</button></div>`;
    const poolBlocks = pools.map((p) => {
      const pt = teams.filter((t) => t.pool_id === p.id);
      const rows = pt.map((t) => `<div class="row" style="align-items:center;gap:8px;padding:4px 0;">
        <span style="flex:1;min-width:0;">${escapeHTML(t.name)}</span>
        <select data-role="tv2-move-team" data-id="${escapeHTML(t.id)}" style="width:auto;flex:0 0 auto;">
          ${pools.map((pp) => `<option value="${escapeHTML(pp.id)}" ${pp.id === t.pool_id ? 'selected' : ''}>Pool ${escapeHTML(pp.label)}</option>`).join('')}
        </select></div>`).join('');
      return `<div style="margin-bottom:10px;"><strong>Pool ${escapeHTML(p.label)}</strong>${rows || '<p class="small" style="color:var(--muted);margin:0;">empty</p>'}</div>`;
    }).join('');
    return `<div class="card"><h3 style="margin:0 0 8px;">Pools (drawn)</h3>${poolBlocks}
      <button type="button" class="secondary" data-role="tv2-draw-pools" style="width:100%;margin-bottom:8px;">Re-draw randomly</button>
      <button type="button" class="primary" data-role="tv2-start-pools" style="width:100%;">Start pool play</button></div>`;
  }
  // Running: the live admin pool board INLINE (Mike 2026-06-28, §38 layout B). Admins score + manage from
  // Manage itself — no jump to Live. A command bar (live status + Reset) sits above the reused Live board
  // (buildPoolPlayHTML admin=true, same call as buildLiveTabHTML). The board's only controls are taps that
  // open a BODY-LEVEL modal (no in-panel inputs), so the background-sync rebuild in partialRenderTournament
  // is safe here (its guard allows pools-running; per-pool net editing is already a chip on the board).
  const pm = (matches || []).filter((m) => m.phase === 'pool' && m.team_a_id && m.team_b_id);
  const poolDone = pm.filter((m) => m.status === 'final').length;
  // #5 (Mike 2026-06-30, §38 Option B): when every real pool game is final, a prominent green CTA banner
  // above the board so the admin can't miss "generate the bracket" (the mid-event discoverability gap —
  // the only Generate button used to be buried on Manage>Bracket). Reuses the existing tv2-generate-bracket.
  const allFinal = pm.length > 0 && poolDone === pm.length;
  const genBanner = allFinal
    ? `<div class="card gen-banner"><span class="gen-banner-t">All pool games are final</span><button type="button" class="primary" data-role="tv2-generate-bracket">Generate bracket &rarr;</button></div>`
    : '';
  return `${genBanner}<div class="card" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
      <span class="badge">${pools.length} pool${pools.length === 1 ? '' : 's'} · ${poolDone}/${pm.length} games done</span>
      <button type="button" class="danger" data-role="tv2-reset-pools" style="margin-left:auto;">Reset pools</button>
    </div>${buildPoolPlayHTML(active, pools, teams, matches, true, state.tournamentPickedTeamId)}`;
}
// Bracket FORMAT preview (Mike, 2026-06-27): show what the bracket games will look like BEFORE pools end —
// the structure only, no teams (slots read "Seed N" in round 1, then "Winner of G#"/"Loser of G#"). Teams
// drop in when pools finish + the real bracket is generated. Teamless rows from generateDoubleElim, reusing
// the same labels/nets/queue logic as tdbGenerateBracket so the G-numbers match the eventual real bracket.
function buildBracketPreviewRows(n, netCount, reset) {
  if (!n || n < 2) return [];
  const gen = generateDoubleElim(n, !!reset);
  const real = gen.realMatches;
  const labelOf = (key) => {
    const m = real.find((x) => x.key === key);
    if (!m) return key;
    if (m.side === 'grand_final') return m.isReset ? 'Grand Final (reset)' : 'Grand Final';
    return `${m.side === 'winners' ? 'WB' : 'LB'} R${m.round} M${m.slot + 1}`;
  };
  const srcLabel = (s) => {
    if (!s) return null;
    if (s.seed) return 'Seed ' + s.seed;
    return (s.type === 'winner' ? 'Winner of ' : 'Loser of ') + labelOf(s.of);
  };
  const nc = Math.max(1, Number(netCount) || 1);
  const sidePri = (s) => (s === 'winners' ? 0 : s === 'losers' ? 1 : 2);
  const maxRound = real.reduce((mx, m) => Math.max(mx, m.round || 0), 0);
  const playRound = (m) => (m.side === 'grand_final' ? maxRound + m.round : m.round);
  const netInfo = {}; const perRound = {}; let q = 0;
  real.slice().sort((a, b) => playRound(a) - playRound(b) || sidePri(a.side) - sidePri(b.side) || a.slot - b.slot)
    .forEach((m) => {
      if (m.side === 'grand_final') { netInfo[m.key] = { net: null, queue_order: q++ }; return; }
      const rk = m.side + ':' + m.round; perRound[rk] = perRound[rk] || 0;
      netInfo[m.key] = { net: (perRound[rk] % nc) + 1, queue_order: q++ }; perRound[rk]++;
    });
  return real.map((m) => ({
    id: 'preview-' + m.key, phase: 'main', side: m.side, round: m.round, slot: m.slot,
    round_label: labelOf(m.key), net: netInfo[m.key].net, queue_order: netInfo[m.key].queue_order,
    team_a_id: null, team_b_id: null, source_a: srcLabel(m.aSource), source_b: srcLabel(m.bSource),
    // carry the winner-advances-to pointer (mapped to preview ids) so layoutBracketTree draws the
    // connector lines between games for the preview too — same field name as the real bracket row.
    winner_next_match_id: m.winnerNext ? ('preview-' + m.winnerNext.key) : null,
    status: 'scheduled',
  }));
}
// The current pre-generate seed order (array of teamIds): the admin's transient ▲/▼ override if set
// for the active tournament, else the computed (computeSeeding) order. Drives the reorder handlers.
function currentSeedOrder() {
  if (state.seedOverride && state.seedOverride.id === state.activeTournamentId) return (state.seedOverride.order || []).slice();
  const teams = state.tournamentTeams || [];
  const poolMatches = (state.tournamentMatches || []).filter((m) => m.phase === 'pool');
  return computeSeeding(teams, poolMatches).map((r) => r.teamId);
}
function manageBracketPageHTML(active, teams, matches) {
  if (active.status === 'setup' || active.status === 'pools') {
    const poolMatches = matches.filter((m) => m.phase === 'pool');
    const done = poolMatches.length > 0 && poolMatches.every((m) => m.status === 'final' || !m.team_a_id || !m.team_b_id);
    const genCard = `<div class="card">${done
      ? '<p class="small" style="color:var(--muted);margin:0 0 8px;">All pool games are final — reorder the seeding above if you want, then generate the bracket.</p><button type="button" class="primary" data-role="tv2-generate-bracket" style="width:100%;">Generate bracket</button>'
      : '<p class="small" style="color:var(--muted);margin:0;">Pools aren’t finished yet. Below is the bracket FORMAT — the exact games + structure; teams drop into their seeds once pool play ends.</p>'}</div>`;
    if (teams.length < 2) return genCard;
    const seedingEditor = done ? buildSeedingTableHTML(teams, matches, true) : ''; // #7: editable seeds above Generate
    // Render the REAL bracket tree (same component as Live) with teamless rows so admins see the actual
    // shape — cols, connectors, side tabs, "Seed N" / "Winner of G#" / "Loser of G#" — not a flat list.
    const previewRows = buildBracketPreviewRows(teams.length, active.net_count, active.grand_final_reset);
    return `${seedingEditor}${genCard}<div class="tm-sec" style="margin-top:12px;">Bracket format — ${teams.length} teams</div>${buildBracketHTML(active, previewRows, [], { preview: true })}`;
  }
  // Generated: the live bracket tree INLINE (Mike 2026-06-28, §38 layout B) — score/clear on the nodes here,
  // no jump to Live. Same component + call as buildLiveTabHTML; layoutBracketTree fires via activateMainTab
  // (manage+bracket) and partialRenderTournament. Command bar shows live progress; the tree carries the
  // champion banner + the admin score/clear rows itself.
  const bm = (matches || []).filter((m) => m.phase !== 'pool');
  const bracketDone = bm.filter((m) => m.status === 'final').length;
  return `<div class="card" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
      <span class="badge">Bracket · ${bracketDone}/${bm.length} games</span>
      <button type="button" class="danger" data-role="tv2-reset-bracket" style="margin-left:auto;">Reset bracket</button>
    </div>${buildBracketHTML(active, matches, teams)}${buildSeedingTableHTML(teams, matches)}`;
}
function manageSettingsPageHTML(t) {
  const num = (v, d) => (v == null || v === '' ? d : v);
  return `<div class="card">
    <label class="reg-label" for="ts-name">Name</label>
    <input type="text" id="ts-name" class="reg-input" value="${escapeHTMLText(t.name || '')}" autocapitalize="words" />
    <label class="reg-label" for="ts-nets">Nets / courts</label>
    <input type="number" inputmode="numeric" min="1" id="ts-nets" class="reg-input" value="${escapeHTML(String(num(t.net_count, 10)))}" />
    <label class="reg-label" for="ts-pt">Pool game to</label>
    <input type="number" inputmode="numeric" min="1" id="ts-pt" class="reg-input" value="${escapeHTML(String(num(t.pool_target, 15)))}" />
    <label class="reg-label" for="ts-pc">Pool cap (blank = none)</label>
    <input type="number" inputmode="numeric" min="1" id="ts-pc" class="reg-input" value="${t.pool_cap != null ? escapeHTML(String(t.pool_cap)) : ''}" />
    <label class="reg-label" for="ts-bt">Bracket game to</label>
    <input type="number" inputmode="numeric" min="1" id="ts-bt" class="reg-input" value="${escapeHTML(String(num(t.bracket_target, num(t.match_cap, 25))))}" />
    <label class="reg-check" style="margin-top:8px;"><input type="checkbox" id="ts-wb2" ${(t.win_by_2 == null || t.win_by_2) ? 'checked' : ''} /> Win by 2</label>
    <div id="ts-err" hidden style="color:var(--danger);margin-top:8px;font-size:13px;"></div>
    <button type="button" class="primary" data-role="tv2-save-settings-page" data-id="${escapeHTML(t.id)}" style="width:100%;margin-top:12px;">Save settings</button>
  </div>`;
}
function manageRegPageHTML(active, teams) {
  const registered = teams.length ? `<div class="card"><div class="reg-label">Registered (${teams.length})</div>${buildPaymentSummaryHTML(teams, active)}${teams.map((tm) => `<div class="row" style="justify-content:space-between;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);">
      <span style="flex:1;min-width:0;">${escapeHTMLText(tm.name || '')} ${tm.paid ? '<span class="reg-paidtag">paid</span>' : '<span class="reg-unpaidtag">unpaid</span>'}</span>
      <button type="button" class="tm-mini" data-role="tv2-toggle-paid" data-id="${escapeHTML(tm.id)}">${tm.paid ? 'Unpaid' : 'Paid'}</button>
    </div>`).join('')}</div>` : '';
  return `<div class="card">
    <div class="row" style="justify-content:space-between;align-items:center;gap:8px;">
      <strong>Registration</strong>
      <button type="button" class="${active.registration_open ? 'danger' : 'primary'}" data-role="tv2-toggle-registration">${active.registration_open ? 'Close' : 'Open'}</button>
    </div>
    <p class="small" style="color:var(--muted);margin:6px 0 10px;">${active.registration_open ? 'Teams can self-register — share the link in GroupMe.' : 'Open registration so teams sign themselves up.'}</p>
    <label class="reg-label" for="tv2-venmo">Venmo payment link</label>
    <input type="text" id="tv2-venmo" class="reg-input" placeholder="https://venmo.com/u/yourname" value="${escapeHTMLText(active.venmo_link || '')}" />
    <label class="reg-label" for="tv2-buyin">Buy-in (shown to teams)</label>
    <input type="text" id="tv2-buyin" class="reg-input" placeholder="$80 per team" value="${escapeHTMLText(active.buy_in || '')}" />
    <button type="button" class="secondary" data-role="tv2-save-registration" style="width:100%;">Save</button>
    ${active.registration_open ? '<button type="button" class="secondary" data-role="tv2-share-registration" style="width:100%;margin-top:8px;">Copy registration link</button>' : ''}
  </div>${registered}`;
}
function manageTournamentPageHTML(active, list) {
  const others = (list || []).filter((t) => !active || t.id !== active.id);
  const switchList = others.length ? `<div class="card"><div class="reg-label">${active ? 'Switch to' : 'Pick a tournament'}</div>${others.map((t) => `<div class="row" style="justify-content:space-between;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">
      <button type="button" data-role="tv2-select-tournament" data-id="${escapeHTML(t.id)}" style="background:none;border:none;text-align:left;flex:1;font-size:15px;color:var(--brand);cursor:pointer;padding:4px 0;">${escapeHTML(t.name || '')} <span class="small" style="color:var(--muted);">· ${escapeHTML(tournamentStatusLabel(t.status))}</span></button>
      <button type="button" class="tm-mini tm-mini-dang" data-role="tv2-delete-tournament" data-id="${escapeHTML(t.id)}">Delete</button>
    </div>`).join('')}</div>` : '';
  return `${switchList}
    <div class="card"><div class="reg-label">Create a new tournament</div>
      <input type="text" id="tv2-name" placeholder="Tournament name" />
      <div id="tv2-format-picker" style="margin-top:12px;">${buildFormatPickerHTML()}</div>
      <div style="display:flex;gap:8px;margin-top:12px;">
        <label style="flex:1;display:flex;flex-direction:column;gap:2px;font-size:13px;color:var(--muted);">Pools<input type="number" id="tv2-pools" value="4" min="1" inputmode="numeric" /></label>
        <label style="flex:1;display:flex;flex-direction:column;gap:2px;font-size:13px;color:var(--muted);">Nets<input type="number" id="tv2-nets" value="10" min="1" inputmode="numeric" /></label>
      </div>
      <button type="button" class="primary" data-role="tv2-create-tournament" style="margin-top:12px;width:100%;">Create tournament</button>
    </div>
    ${active ? `<div class="card"><div class="reg-label" style="color:var(--danger);">Danger</div>
      <button type="button" class="danger" data-role="tv2-delete-tournament" data-id="${escapeHTML(active.id)}" style="width:100%;">Delete this tournament</button>
    </div>` : ''}`;
}
function buildLiveTabHTML() {
  const active = state.activeTournamentId ? (state.tournaments || []).find((x) => x.id === state.activeTournamentId) : null;
  if (!active) return `${buildTournamentModeBarHTML(null)}<div class="card"><p class="small" style="color:var(--muted);margin:0;">No tournament selected.</p></div>`;
  const teams = state.tournamentTeams || [];
  const pools = state.tournamentPools || [];
  const matches = state.tournamentMatches || [];
  let body;
  if (active.status === 'bracket' || active.status === 'completed') body = buildBracketHTML(active, matches, teams);
  else if (active.status === 'pools') body = buildPoolPlayHTML(active, pools, teams, matches, true, state.tournamentPickedTeamId);
  else body = `<div class="card"><p class="small" style="color:var(--muted);margin:0;">Pool play hasn’t started yet. Add teams + draw pools on the Manage tab.</p></div>`;
  return `${buildTournamentModeBarHTML(active)}${body}${buildSeedingTableHTML(teams, matches)}`;
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


function confirmDangerousActionOrAbort({ title, detail, confirmText }) {
  const expected = String(confirmText || '').trim();
  if (!expected) return false;
  const promptText = `${String(title || '').trim()}\n\n${String(detail || '').trim()}\n\nType "${expected}" to confirm.`;
  const response = window.prompt(promptText, '');
  return String(response || '').trim() === expected;
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
// The SHAREABLE team state (generated team keys) is persisted to a single `live_state` row so it
// survives a browser clear and a co-admin / spectator sees the same teams. [Task 4 — R5 cut] the casual
// COURT payload (court order + "Won" tallies) is no longer written with the courts board; the load path
// still tolerates old rows that carry those fields. SKILL data (snapshots, fairness) is intentionally NOT
// persisted here — this row is anon-readable and skill is admin-only. The admin (a real authenticated
// session) is the SOLE writer; spectators read only. localStorage stays as the write-through cache.
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
    // [Task 4 — R5 cut] TEAM persistence stays (cross-device); the casual COURT payload (courtOrder/results)
    // is dropped with the courts board. The load path still tolerates old rows that carry those fields.
    const payload = { teamKeys: teamKeys || [] };
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
        else if (op.kind === 'register') res = await supabaseClient.rpc('register_player', { p_name: op.payload.name, p_group: op.payload.group || '', p_checked_in: op.payload.checked_in === true }); // Wave 1d: kiosk registrations retry atomically checked-in; admin Add-Player (no flag) stays checked-out
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
    t.className = 'save-toast';
    t.textContent = text;
    t.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:var(--ink);color:var(--bg);padding:8px 12px;border-radius:var(--r-sm);box-shadow:var(--shadow-md);z-index:10000;font-size:14px;';
    document.body.appendChild(t);
    return t;
  } catch { return null; }
}
function settleSaveToast(t, ok, okText) {
  if (!t) return;
  try {
    t.textContent = ok ? (okText || 'Saved') : 'Could not save — check your connection';
    const hold = ok ? 1200 : 2600;
    // Fade out (mirrors .cik-toast motion; neutralized for reduce-motion users) before removing.
    setTimeout(() => { try { t.classList.add('is-leaving'); } catch {} }, hold);
    setTimeout(() => { try { t.remove(); } catch {} }, hold + 200);
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

  // C21: no admin-scope restore from storage. Admin state (isAdmin / masterAdminAuthenticated)
  // comes only from a live server session (deriveRole in onAuthStateChange), cleared on sign-out.
  // Start logged-out (defaults already false).

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
      p && !p.id && p.pending && normalize(p.name) && !remoteNamesAuth.has(normalize(p.name))
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

    // Explicit columns (not select('*')) to trim payload + avoid pulling unused/future cols.
    // Schema-aware: only request group/tag when the probe confirmed they exist.
    // C21: skill is ADMIN-ONLY. Only request it when a real admin session exists; anon must
    // never fetch it (the DB also REVOKEs SELECT(skill) from anon, so requesting it as anon errors).
    const playerCols = ['id', 'name', 'checked_in'];
    if (state.isAdmin) playerCols.push('skill');
    if (HAS_GROUP) playerCols.push('group');
    if (HAS_TAG) playerCols.push('tag');
    const query = supabaseClient.from('players').select(playerCols.join(','));

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

    const data = fetchedData;

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
  // C46 (rank 2): ALWAYS persist locally first so a typed session is never silently discarded —
  // previously `if (!supabaseClient) return false` lost the data + showed a false "Save failed" toast
  // in local-only / offline mode.
  state.currentSession = { date, time, location };
  saveLocal();
  if (!supabaseClient) return true; // local-only mode: saved locally — this is success, not failure
  try {
    const { error } = await supabaseClient
      .from('sessions')
      .upsert({ id: 1, date, time, location, updated_at: new Date().toISOString() });
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('saveSession error', err);
    return false; // the local copy is saved; surface only the cloud failure
  }
}

// NF-12: clear/unschedule the session so the public "Next session" card stops advertising a stale
// date forever. Deletes the single sessions row (id=1) -> loadSession reads null -> currentSession=null
// -> the public card + the admin preview hide until a new session is saved.
async function clearSession() {
  state.currentSession = null;
  saveLocal();
  if (!supabaseClient) return true; // local-only mode
  try {
    const { error } = await supabaseClient.from('sessions').delete().eq('id', 1);
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('clearSession error', err);
    return false;
  }
}

// Task 2 (pickup days): a stable signature of the loaded set, used to skip needless repaints on the poll.
function pickupDaysSignature() {
  return (Array.isArray(state.pickupDays) ? state.pickupDays : [])
    .map((d) => [d && d.id, d && d.day, d && d.time_label, d && d.location].join('|')).join(';');
}

// Load the pickup_days SET (multi-day schedule, replaces the single sessions row for the app's read
// path). Runs alongside loadSession at boot AND on the 15s poll. GRACEFUL: if the table doesn't exist
// yet (0046 not applied), leave pickupDaysLoaded=false so pickupDaySet falls back to the legacy session
// row for day-of gating, and keep the managed list quietly empty. A transient error AFTER a good load
// keeps the last-good set (never blanks the gate on a blip). Returns true when the set changed.
async function loadPickupDays() {
  if (!supabaseClient) return false;
  const prevSig = pickupDaysSignature();
  try {
    const { data, error } = await supabaseClient
      .from('pickup_days')
      .select('id, day, time_label, location')
      .order('day', { ascending: true });
    if (error) throw error;
    state.pickupDays = Array.isArray(data) ? data : [];
    state.pickupDaysLoaded = true;
  } catch (err) {
    // Pre-migration (0046 not applied) the table is absent → fall back to the legacy session for gating.
    if (!state.pickupDaysLoaded) state.pickupDays = [];
    console.warn('loadPickupDays skipped (pickup_days table missing?):', err && err.message ? err.message : err);
  }
  return pickupDaysSignature() !== prevSig;
}

// Roll check-ins into history + start a clean sheet. Extracted from the old-shell "Start new session"
// button so the NEW pickup-day form's "Start a fresh sheet" row can reuse the exact flow WITHOUT the
// master-admin gate (spec §1: all 4 admins are full-power). The old-shell caller keeps its own gate; this
// function is gate-free by design. Server truth = the authenticated-only start_new_session RPC.
async function startNewSessionFlow() {
  const previouslyCheckedIn = normalizeCheckedInEntries(state.checkedIn || []);
  const n = previouslyCheckedIn.length;
  // Wave 1e: the most destructive admin action (checks everyone out) used native window.confirm,
  // unreliable in standalone-PWA/iOS where the rest of the app already moved to appConfirm.
  const confirmed = await appConfirm({
    title: 'Start a new session?',
    message: `${n} player${n === 1 ? ' is' : 's are'} checked in — they'll be checked out and tonight's attendance is saved as history.`,
    confirmText: 'Start new session',
    danger: true
  });
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
      // C21 single-source contract (reliability fix 2026-06-20): do NOT write checked_in here.
      // Attendance is maintained EXCLUSIVELY through the check_in/check_out RPCs (kiosk, per-row, bulk,
      // reconcile, outbox) — they alone keep the check_ins history table. A direct checked_in UPDATE in
      // this force-save desynced that history; the RPC paths already keep an existing player's remote
      // attendance current, so the force-save only pushes the editable record fields.
      const ok = await updatePlayerFieldsSupabase(remoteId, {
        name: playerName,
        skill,
        group: primaryGroup,
        groups
      });
      if (ok) summary.updated += 1;
      else summary.failed += 1;
      continue;
    }

    // checked_in intentionally omitted — a new player's attendance is set via the check_in RPC below
    // (which maintains the check_ins history), never a direct column write.
    const insertPayload = { name: playerName, skill };
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
      // C21 single-source: a just-inserted player who is checked in locally needs a check_ins row —
      // route through the check_in RPC, never a direct checked_in write.
      if (checkedIn) {
        try {
          const { error: ciErr } = await supabaseClient.rpc('check_in', { p_id: insertedId });
          if (ciErr) throw ciErr;
        } catch (ciErr) {
          console.error('forceSave new-player check_in error', ciErr);
          outboxEnqueue({ key: 'att:' + insertedId, kind: 'check_in', payload: { p_id: insertedId }, ts: Date.now() });
        }
      }
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
// C26 item 2: per-surface tab persistence — admin and public keep independent active-tab memory.
function currentTabKey() { return state.isAdmin ? 'as_main_tab_admin' : 'as_main_tab_public'; }


// C26 item 2: Admin Players panel. Markup moved verbatim from render(); locals recomputed at the top
// (byte-identical to render()'s former locals), the old `state.isAdmin ? … : ''` wrapper removed.
function adminPlayersHTML() {
  const normalizedActiveGroup = normalizeActiveGroupSelection(state.activeGroup || 'All');
  const activeGroupLabel = normalizedActiveGroup === UNGROUPED_FILTER_VALUE ? UNGROUPED_FILTER_LABEL : (normalizedActiveGroup || 'All');
  const isActiveGroupValue = (value) => normalizeActiveGroupSelection(value || 'All') === normalizedActiveGroup;
  const topFormGroupOptions = getTopFormGroupDatalistOptions();
  const topFormContext = renderTopFormGroupsHelpAndPreview('', '');
  const rosterCount = (state.players || []).length;
  const chip = (value, label) => `<button type="button" class="chip ${state.playerTab === value ? 'on' : ''}" data-chip-tab="${value}" aria-pressed="${state.playerTab === value ? 'true' : 'false'}">${label}</button>`;
  const groupsChipOn = normalizedActiveGroup !== 'All';
  return `
    <div id="admin-players-shell">
      <!-- Compact header: title + add + overflow toolbar -->
      <div class="roster-head">
        <h3 class="roster-title">Players <span class="roster-count">· ${rosterCount}</span>${normalizedActiveGroup !== 'All' ? ` <span class="small roster-scope">(${escapeHTML(activeGroupLabel)})</span>` : ''}</h3>
        <div class="roster-head-actions">
          <button type="button" id="roster-add-player" class="roster-add" aria-label="Add or update player" title="Add / update player">
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>
          </button>
        </div>
      </div>

<div class="card card-players">
  <div id="card-body-admin-players">

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

  <div id="filtersBody">
    <!-- Filter chips (drive state.playerTab + group/skill sub-controls) -->
    <div class="chip-row" role="group" aria-label="Filter players">
      ${chip('all', 'All')}
      ${chip('in', 'Checked in')}
      ${chip('out', 'Out')}
      ${chip('skill', 'Skill')}
      ${chip('unrated', 'Unset')}
      <button type="button" class="chip ${groupsChipOn ? 'on' : ''}" data-chip-groups aria-pressed="${groupsChipOn ? 'true' : 'false'}">Groups</button>
    </div>
    <!-- C45 (rank 17): "Select all shown" is a SELECTION action, not a filter — moved out of the chip row. -->
    <div class="select-all-row"><button type="button" id="btn-select-all-visible" class="select-all-btn">Select all shown</button></div>

    <!-- Source-of-truth filter select (visually hidden; chips set the same state) -->
    <select id="player-tab-select" class="sr-only-control" aria-hidden="true" tabindex="-1">
      <option value="all" ${state.playerTab === 'all' ? 'selected' : ''}>All Players</option>
      <option value="in" ${state.playerTab === 'in' ? 'selected' : ''}>Checked In</option>
      <option value="out" ${state.playerTab === 'out' ? 'selected' : ''}>Checked Out</option>
      <option value="skill" ${state.playerTab === 'skill' ? 'selected' : ''}>Skill Number</option>
      <option value="unrated" ${state.playerTab === 'unrated' ? 'selected' : ''}>Unset Skill</option>
    </select>

    <!-- Group filter + group management (revealed by the Groups chip, or when a group is active) -->
  <div class="filter-sub ${groupsChipOn ? 'is-open' : ''}" id="group-filter-sub" style="margin-top: 0.5rem; align-items:center;">
    <label for="group-filter-select">Group:</label>
    <select id="group-filter-select">
      <option value="All" ${isActiveGroupValue('All') ? 'selected' : ''}>All</option>
      ${getAvailableGroups().map((groupName) => `<option value="${escapeHTML(groupName)}" ${isActiveGroupValue(groupName) ? 'selected' : ''}>${escapeHTML(groupName)}</option>`).join('')}
      <option value="${UNGROUPED_FILTER_VALUE}" ${isActiveGroupValue(UNGROUPED_FILTER_VALUE) ? 'selected' : ''}>${UNGROUPED_FILTER_LABEL}</option>
    </select>

    <button id="btn-open-group-manager" class="secondary">Manage Groups</button>
  </div>
    <!-- Skill range sub-filter (only when Filter = Skill) -->
    ${state.playerTab === 'skill' ? `
      <div class="filter-sub is-open" style="margin-top: 0.5rem;">
        <label for="skill-subtab-select">Skill range:</label>
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

  <!-- Filtered Player rows -->
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

  <!-- Floating Bulk Bar (shows only when you select players) -->
  <div id="bulkBar" class="bulkbar" style="display:none;">
    <div class="bulkbar-inner">
      <strong id="bulkCount">0 selected</strong>
      <span class="bulkbar-spacer"></span>

      <button id="btn-bulk-checkin" class="secondary">Check In</button>
      <button id="btn-bulk-checkout" class="secondary">Check Out</button>

      <label for="bulk-dest-group" class="bulkbar-grouplabel">Group:</label>
      <select id="bulk-dest-group">
        <option value="">— choose —</option>
        ${getAvailableGroups().map(g => `<option value="${g}">${g}</option>`).join('')}
      </select>
      <button id="btn-assign-to-group" class="primary">Add</button>
      <button id="btn-remove-from-group" class="danger">Remove</button>
      <button id="btn-clear-selection" class="secondary">Clear</button>
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

<div id="admin-add-player-modal" class="popup-overlay" style="display:none;" aria-hidden="true">
  <div class="popup-card card" role="dialog" aria-modal="true" aria-labelledby="admin-add-player-modal-title">
    <div class="popup-header">
      <h3 id="admin-add-player-modal-title">Add/Update Player</h3>
      <button type="button" class="secondary" data-role="close-popup" data-target="admin-add-player-modal">Close</button>
    </div>
    <div class="popup-body">
      <div class="row admin-player-form-row">
        <input type="text" id="admin-player-name" placeholder="First and last name" autocapitalize="words" autocomplete="off" spellcheck="false" />
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
  <div style="max-width:720px; max-height:calc(100dvh - 24px); margin:0 auto; background:var(--card); border:1px solid var(--border); border-radius:14px; box-shadow:var(--shadow-md); overflow:hidden; display:flex; flex-direction:column;">
    <div style="display:flex; align-items:center; padding:12px 16px; background:var(--bg); border-bottom:1px solid var(--border);">
      <h3 style="margin:0; font-size:18px; font-family:'Sora','Inter',sans-serif;">Manage Groups</h3>
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
  `;
}

// C36 T1: PUBLIC Check In → kiosk "type your name → tap it → checked in" (design LOCKED §38 B).
// NO skill anywhere (rulebook §AS-1 — public surface): same-name players are disambiguated by
// GROUP + full name, never skill. NO emoji / NO neon — direction-A tokens + SVG icons only.
// All behavior (check in / check out toggle / register) routes through the SAME existing paths/RPCs
// wired in attachHandlers (check_in / check_out / register_player) — no new DB. The big name buttons
// render into #checkin-results via a targeted DOM update (renderCheckinResults), never full-render
// on keystroke. Check In rework (Mike 2026-07-10): the "Admin" corner link moved off this page.
// Task 13 (2026-07-11): the code login is retired — email+password IS the admin sign-in.
// Mike pick X (task-#10, 2026-07-10): big bordered tap ROW — matched prefix accent-bold, right-side
// tag (TAP TO CHECK IN / grayed ALREADY IN). NO initials/avatar bubble (Mike's explicit delta — they
// read as furniture). Same-name rows keep the group differentiator only (never skill). The tap attr
// (data-checkin-id) is unchanged so the existing #checkin-results click handler keeps working.
function renderCheckinButton(row, query) {
  const inClass = row.checkedIn ? ' is-in' : '';
  const tag = row.checkedIn ? 'ALREADY IN' : 'TAP TO CHECK IN';
  const group = row.group ? `<span class="ckx-gp">${escapeHTML(row.group)}</span>` : '';
  return `<button class="ckx-row${inClass}" type="button" data-checkin-id="${escapeHTML(String(row.id))}">`
    + `<span class="ckx-nm">${highlightMatch(row.name, query)}${group}</span>`
    + `<span class="ckx-go">${tag}</span></button>`;
}

// Bold the matched search substring inside a name (Mike pick X — the typed part reads accent-bold).
// Escape FIRST, then wrap: slice the RAW name at the match and escape each segment independently, so a
// <b> boundary can never fall inside an HTML entity (e.g. "&amp;"). Case-insensitive; falls back to the
// plain escaped name when the query is empty or matches nowhere.
function highlightMatch(name, query) {
  const raw = String(name == null ? '' : name);
  const q = String(query == null ? '' : query).trim();
  if (!q) return escapeHTML(raw);
  const pos = raw.toLowerCase().indexOf(q.toLowerCase());
  if (pos < 0) return escapeHTML(raw);
  return escapeHTML(raw.slice(0, pos)) + '<b>' + escapeHTML(raw.slice(pos, pos + q.length)) + '</b>' + escapeHTML(raw.slice(pos + q.length));
}

// Reliability fix (2026-06-20): module-level so BOTH the kiosk closure (renderCheckinResultsForQuery)
// and partialRender's public-kiosk branch derive the big name buttons identically. Overlays the LIVE
// state.checkedIn truth onto the synced player.checked_in so a just-tapped / cross-device check-in
// reflects at once. NO skill (public surface) — disambiguation is name + group only.
function buildKioskResultsHTML(query) {
  const inSet = new Set(state.checkedIn || []);
  const list = disambiguatePlayersByName(state.players, query).map((row) => {
    const p = state.players.find((pl) => String(pl.id) === String(row.id));
    return p ? { ...row, checkedIn: inSet.has(playerIdentityKey(p)) } : row;
  });
  if (!state.loaded && (query || '').trim()) return '<p class="cik-none">Loading roster&hellip;</p>'; // C1: don't flash "No match" pre-sync
  return list.length
    ? list.map((r) => renderCheckinButton(r, query)).join('')
    : ((query || '').trim() ? '<p class="cik-none">No match &mdash; tap &ldquo;I&rsquo;m new&rdquo; to add yourself.</p>' : '');
}

// C48.6 (Option A): the kiosk defaults to a vertically-centered idle layout (.is-idle). The moment
// results (matches OR the "no match" hint) appear, drop .is-idle so the layout reverts to top-aligned
// and the big name buttons get full scroll room. Called from BOTH render sites (the kiosk input closure
// and partialRender's public-kiosk branch) so the two stay in lockstep. Pass the just-rendered results
// markup so the decision matches exactly what's on screen.
function syncKioskIdleState(resultsHTML) {
  const kiosk = document.querySelector('.ci-kiosk');
  if (!kiosk) return;
  const hasResults = !!(resultsHTML && String(resultsHTML).trim());
  kiosk.classList.toggle('is-idle', !hasResults);
}

// C47: kiosk "tap a name -> confirm" popup (Option A center modal). Created once and appended to
// <body> (outside .players, so partialRender never captures/wipes it); reuses .popup-overlay/.popup-card.
// The confirm button reads the module-level callback set by openKioskConfirm, so its listener binds once.
let kioskConfirmCb = null;
function kioskNameInitials(name) {
  const w = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (w.length === 1) return ((w[0] || '')[0] || '').toUpperCase(); // C2: single-word name → one initial (matches the button glyph)
  return (((w[0] || '')[0] || '') + ((w[w.length - 1] || '')[0] || '')).toUpperCase();
}
function ensureKioskConfirmModal() {
  let el = document.getElementById('kiosk-confirm-modal');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'kiosk-confirm-modal';
  el.className = 'popup-overlay';
  el.style.display = 'none';
  el.innerHTML =
    '<div class="popup-card card kc-card" role="dialog" aria-modal="true" aria-labelledby="kc-name">'
    + '<div class="kc-avatar" id="kc-avatar"></div>'
    + '<div class="kc-name" id="kc-name"></div>'
    + '<div class="kc-q" id="kc-q"></div>'
    + '<button type="button" class="kc-confirm" id="kc-confirm"></button>'
    + '<button type="button" class="kc-cancel" id="kc-cancel">Cancel</button>'
    + '</div>';
  document.body.appendChild(el);
  el.addEventListener('click', (e) => { if (e.target === el) closeKioskConfirm(); });
  el.querySelector('#kc-cancel').addEventListener('click', closeKioskConfirm);
  el.querySelector('#kc-confirm').addEventListener('click', () => {
    const fn = kioskConfirmCb;
    closeKioskConfirm();
    if (fn) fn();
  });
  return el;
}
function openKioskConfirm(player, isIn, onConfirm) {
  const el = ensureKioskConfirmModal();
  el.querySelector('#kc-avatar').textContent = kioskNameInitials(player.name);
  el.querySelector('#kc-name').textContent = player.name;
  el.querySelector('#kc-q').textContent = isIn ? 'Check this person out?' : 'Check this person in?';
  el.querySelector('#kc-confirm').textContent = isIn ? 'Check out' : 'Check in';
  kioskConfirmCb = onConfirm;
  el.style.display = 'flex';
}
function closeKioskConfirm() {
  const el = document.getElementById('kiosk-confirm-modal');
  if (el) el.style.display = 'none';
  kioskConfirmCb = null;
}

// C49b: generic styled confirm (reuses the C47 Option-A center modal: .popup-overlay/.popup-card/.kc-*)
// so destructive actions stop using the browser's native confirm(). Returns Promise<boolean>.
function appConfirm({ title, message, confirmText, cancelText, danger } = {}) {
  return new Promise((resolve) => {
    const prev = document.getElementById('app-confirm-modal');
    if (prev) prev.remove();
    const el = document.createElement('div');
    el.id = 'app-confirm-modal';
    el.className = 'popup-overlay';
    el.style.display = 'flex';
    el.innerHTML =
      '<div class="popup-card card kc-card" role="dialog" aria-modal="true">'
      + (title ? '<div class="kc-name">' + escapeHTML(title) + '</div>' : '')
      + '<div class="kc-q">' + escapeHTML(message || 'Are you sure?') + '</div>'
      + '<button type="button" class="kc-confirm' + (danger ? ' kc-confirm-danger' : '') + '" id="app-confirm-yes">' + escapeHTML(confirmText || 'Confirm') + '</button>'
      + '<button type="button" class="kc-cancel" id="app-confirm-no">' + escapeHTML(cancelText || 'Cancel') + '</button>';
    document.body.appendChild(el);
    const done = (val) => { el.remove(); resolve(val); };
    el.querySelector('#app-confirm-yes').addEventListener('click', () => done(true));
    el.querySelector('#app-confirm-no').addEventListener('click', () => done(false));
    el.addEventListener('click', (ev) => { if (ev.target === el) done(false); });
  });
}

// A one-button informational notice (reuses the appConfirm modal chrome). For inert "coming soon"
// placeholders + FYIs where there is nothing to cancel — a plain "Cancel" would read as a bug (§27).
function appNotice({ title, message, okText } = {}) {
  return new Promise((resolve) => {
    const prev = document.getElementById('app-notice-modal');
    if (prev) prev.remove();
    const el = document.createElement('div');
    el.id = 'app-notice-modal';
    el.className = 'popup-overlay';
    el.style.display = 'flex';
    el.innerHTML =
      '<div class="popup-card card kc-card" role="dialog" aria-modal="true">'
      + (title ? '<div class="kc-name">' + escapeHTML(title) + '</div>' : '')
      + '<div class="kc-q">' + escapeHTML(message || '') + '</div>'
      + '<button type="button" class="kc-confirm" id="app-notice-ok">' + escapeHTML(okText || 'Got it') + '</button>';
    document.body.appendChild(el);
    const done = () => { el.remove(); resolve(true); };
    el.querySelector('#app-notice-ok').addEventListener('click', done);
    el.addEventListener('click', (ev) => { if (ev.target === el) done(); });
  });
}

// A styled text-input dialog (mirrors appConfirm; reuses the .kc-card modal) — resolves to the entered
// string, or null on cancel. Used for the NF-3 team rename (no native prompt()).
function appPrompt({ title, message, value, confirmText, placeholder } = {}) {
  return new Promise((resolve) => {
    const prev = document.getElementById('app-prompt-modal');
    if (prev) prev.remove();
    const el = document.createElement('div');
    el.id = 'app-prompt-modal';
    el.className = 'popup-overlay';
    el.style.display = 'flex';
    el.innerHTML =
      '<div class="popup-card card kc-card" role="dialog" aria-modal="true">'
      + (title ? '<div class="kc-name">' + escapeHTML(title) + '</div>' : '')
      + (message ? '<div class="kc-q">' + escapeHTML(message) + '</div>' : '')
      + '<input type="text" id="app-prompt-input" class="reg-input" style="width:100%;margin:8px 0;" value="' + escapeHTML(value || '') + '" placeholder="' + escapeHTML(placeholder || '') + '" autocapitalize="words" autocomplete="off" />'
      + '<button type="button" class="kc-confirm" id="app-prompt-ok">' + escapeHTML(confirmText || 'Save') + '</button>'
      + '<button type="button" class="kc-cancel" id="app-prompt-cancel">Cancel</button>';
    document.body.appendChild(el);
    const input = el.querySelector('#app-prompt-input');
    try { input.focus(); input.select(); } catch (_) {}
    const done = (val) => { el.remove(); resolve(val); };
    el.querySelector('#app-prompt-ok').addEventListener('click', () => done(input.value));
    el.querySelector('#app-prompt-cancel').addEventListener('click', () => done(null));
    el.addEventListener('click', (ev) => { if (ev.target === el) done(null); });
    input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); done(input.value); } });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Identity/Accounts (2026-07-08) — real email+password sign-in. Reached from the
// header account icon (#pd-account). Full-screen "page" (Mike's pick: Option B,
// clean-centered), implemented as a .auth-page overlay appended to <body> so
// partialRender never wipes it. On success onAuthStateChange sets state + re-renders.
// ─────────────────────────────────────────────────────────────────────────────
let authMode = 'signin';                 // 'signin' | 'signup'
let asCommunityId = null;                 // cached community uuid (read live, never hardcoded)

async function fetchCommunityId() {
  if (asCommunityId || !supabaseClient) return asCommunityId;
  try {
    const { data } = await supabaseClient
      .from('communities').select('id').eq('slug', 'athletic-specimen').maybeSingle();
    if (data && data.id) asCommunityId = data.id;
  } catch (_) { /* best-effort — role stays null on failure */ }
  return asCommunityId;
}

// Best-effort community role for the signed-in account (owner|organizer|player|null).
// NOT an admin gate this slice — stored for the next slice. Never blocks sign-in.
async function deriveRole() {
  // Resolve into a local first, then assign ONCE — never null-out state.role mid-flight (a re-derive
  // on TOKEN_REFRESHED/INITIAL_SESSION would otherwise blip the account menu to "Spectator").
  const cid = await fetchCommunityId();
  if (!cid || !supabaseClient) { state.role = null; return; }
  let role = null;
  try {
    const { data, error } = await supabaseClient.rpc('caller_role', { p_community: cid });
    if (!error) role = data || null;
  } catch (_) { /* leave null */ }
  state.role = role;
}

function closeAuthPage() {
  const el = document.getElementById('auth-page');
  if (el) el.remove();
}

function openAuthPage() {
  closeAuthPage();
  authMode = 'signin';
  const el = document.createElement('div');
  el.id = 'auth-page';
  el.className = 'auth-page';
  document.body.appendChild(el);
  renderAuthPageInner();
}

function renderAuthPageInner() {
  const el = document.getElementById('auth-page');
  if (!el) return;
  const signup = authMode === 'signup';
  // Task 13 (2026-07-11): the quiet "Admin sign-in" link + code panel are GONE — email+password IS
  // the admin sign-in (owner/organizer role sets isAdmin in onAuthStateChange). .auth-inner stays a
  // wrapper DIV so the brand block can sit outside the form.
  // Mike AD+AC hybrid (task-#11, 2026-07-10): the brand block (big logo + Barlow wordmark) moves OUT
  // of the form to the TOP; the form (hairline-underline fields + full-width blue CTA) sits below.
  // Every element id is unchanged — handlers bind by id, so the mechanics are untouched.
  el.innerHTML = `
    <button type="button" class="auth-back" id="auth-back" aria-label="Close sign in">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg>
    </button>
    <div class="auth-inner">
      <div class="auth-brand">
        <img class="auth-logo" src="logo-mark.png" alt="Athletic Specimen" />
        <div class="auth-wm"><div class="auth-wm-1">ATHLETIC SPECIMEN</div><div class="auth-wm-2">COLORADO</div></div>
      </div>
      <form id="auth-form" novalidate autocomplete="on">
        <h2 class="auth-title">${signup ? 'Create account' : 'Welcome'}</h2>
        <p class="auth-sub">Sign in to claim your team and follow your games.</p>
        <label class="auth-label" for="auth-email">Email</label>
        <input class="auth-input" id="auth-email" type="email" autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" placeholder="you@email.com" />
        <label class="auth-label" for="auth-pass">Password</label>
        <input class="auth-input" id="auth-pass" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" placeholder="${signup ? 'At least 6 characters' : 'Your password'}" />
        <div class="auth-err" id="auth-err" role="alert" hidden></div>
        <button type="submit" class="auth-submit" id="auth-submit">${signup ? 'Create account' : 'Sign in'}</button>
        <button type="button" class="auth-alt" id="auth-alt">${signup ? 'Already have an account? Sign in' : 'New here? Create an account'}</button>
      </form>
    </div>`;
  el.querySelector('#auth-back').addEventListener('click', () => {
    claimIntent = false; // dismissing sign-in abandons a pending claim intent (review: it leaked into a later sign-in)
    closeAuthPage();
  });
  el.querySelector('#auth-alt').addEventListener('click', () => {
    authMode = signup ? 'signin' : 'signup';
    renderAuthPageInner();
  });
  el.querySelector('#auth-form').addEventListener('submit', onAuthSubmit);
  setTimeout(() => { const f = document.getElementById('auth-email'); if (f) f.focus(); }, 50);
}

// ─────────────────────────────────────────────────────────────────────────────
// Slice 3b (2026-07-09) — claim-your-team page. Mike's LOCKED §38 pick: Option A
// "search your name" (kiosk-style). Claims are INSTANT (Mike killed approvals —
// the admin exception path is the Account row in the player edit modal). Same
// body-appended overlay pattern as .auth-page so partialRender never wipes it.
// Data = a one-shot read of team_members for the claimable tournament; the page
// only opens signed-in (anon lacks SELECT on players.claimed_by_profile).
// ─────────────────────────────────────────────────────────────────────────────
let claimIntent = false;      // a signed-out "claim" tap — auto-open the page after sign-in
let claimCandidates = null;   // null = loading; [] = loaded-empty; [rows] = loaded
let claimFetchFailed = false; // a failed read must not masquerade as the "no players yet" empty state

function claimableTournament() {
  // The live tournament first (the Home hero's context), else a registration-open setup one
  // (people claim right after registering), else nothing.
  return publicLiveTournament()
    || (state.tournaments || []).find((t) => t.registration_open && t.status === 'setup')
    || null;
}

function closeClaimPage() {
  const el = document.getElementById('claim-page');
  if (el) el.remove();
  claimCandidates = null;
}

function openClaimPage() {
  closeClaimPage();
  const el = document.createElement('div');
  el.id = 'claim-page';
  el.className = 'auth-page claim-page';
  document.body.appendChild(el);
  renderClaimSearch();
  fetchClaimCandidates();
}

async function fetchClaimCandidates() {
  const t = claimableTournament();
  claimFetchFailed = false;
  if (!t || !supabaseClient) { claimCandidates = []; renderClaimSearch(); return; }
  try {
    const { data, error } = await supabaseClient
      .from('team_members')
      .select('player_id, teams!inner(id,name,tournament_id), players!inner(id,name,claimed_by_profile)')
      .eq('teams.tournament_id', t.id);
    if (error) throw error;
    claimCandidates = shapeClaimCandidates(data || []);
  } catch (err) {
    console.error('fetchClaimCandidates', err);
    claimCandidates = [];
    claimFetchFailed = true;
  }
  renderClaimSearch();
}

function claimHeaderHTML(title) {
  const t = claimableTournament();
  return `
    <button type="button" class="auth-back" id="claim-back" aria-label="Close claim">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg>
    </button>
    <div class="auth-inner claim-inner">
      <h2 class="auth-title">${escapeHTML(title || 'Find your name')}</h2>
      <p class="auth-sub">${escapeHTML(t ? (t.name || 'Tournament') : 'Tournament')}</p>`;
}

function renderClaimSearch() {
  const el = document.getElementById('claim-page');
  if (!el) return;
  const mine = (claimCandidates || []).find((c) => state.account && c.claimedBy === state.account.id);
  if (mine) {
    // Already linked — nothing to search for.
    el.innerHTML = claimHeaderHTML("You're linked") + `
      <div class="claim-linked">
        <span class="av claim-bigav">${escapeHTML(mine.initials)}</span>
        <div class="claim-nm">${escapeHTML(mine.name)}</div>
        <div class="claim-team">${escapeHTML(mine.teamName)}</div>
        <p class="auth-sub">This is you.</p>
        <button type="button" class="auth-submit" id="claim-done">Done</button>
      </div>
    </div>`;
    el.querySelector('#claim-back').addEventListener('click', closeClaimPage);
    el.querySelector('#claim-done').addEventListener('click', closeClaimPage);
    setTimeout(() => { const b = document.getElementById('claim-done'); if (b) b.focus(); }, 50);
    return;
  }
  // The fetch-completion re-render must never wipe a half-typed name (Mike's input-wipe bug class):
  // carry the existing query across the rebuild and repaint with it.
  const prevQuery = (document.getElementById('claim-search') || {}).value || '';
  el.innerHTML = claimHeaderHTML() + `
      <div class="cik-search claim-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input id="claim-search" type="text" placeholder="Start typing your name&hellip;" autocapitalize="words" autocomplete="off" spellcheck="false" aria-label="Type your name" />
      </div>
      <div id="claim-results" class="claim-results"></div>
    </div>`;
  el.querySelector('#claim-back').addEventListener('click', closeClaimPage);
  const input = el.querySelector('#claim-search');
  const results = el.querySelector('#claim-results');
  const paint = () => { results.innerHTML = buildClaimResultsHTML(input.value); };
  input.addEventListener('input', paint);
  if (prevQuery) input.value = prevQuery;
  results.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-claim-id]');
    if (!btn) return;
    const c = (claimCandidates || []).find((x) => x.id === btn.dataset.claimId && x.teamName === btn.dataset.claimTeam);
    if (c && !c.claimedBy) renderClaimConfirm(c);
  });
  paint();
  setTimeout(() => { try { input.focus(); } catch (_) {} }, 50);
}

function buildClaimResultsHTML(query) {
  if (claimCandidates === null) return '<div class="small claim-note">Loading players&hellip;</div>';
  if (claimFetchFailed) {
    return '<div class="small claim-note">Couldn&rsquo;t load the players &mdash; check your connection, then close this and try again.</div>';
  }
  if (!claimCandidates.length) {
    return '<div class="small claim-note">No players to claim yet &mdash; names show up here once teams register for a tournament.</div>';
  }
  const q = String(query || '').trim();
  if (!q) return '<div class="small claim-note">Type your name to find yourself.</div>';
  const list = filterClaimCandidates(claimCandidates, q);
  if (!list.length) return '<div class="small claim-note">No match &mdash; check the spelling, or ask your organizer.</div>';
  return list.map((c) => {
    const taken = !!c.claimedBy;
    return `<button class="cik-btn claim-row${taken ? ' is-claimed' : ''}" type="button" ${taken ? 'disabled' : ''} data-claim-id="${escapeHTML(c.id)}" data-claim-team="${escapeHTML(c.teamName)}">`
      + `<span class="av">${escapeHTML(c.initials)}</span>`
      + `<span class="cik-info"><span class="cik-nm">${escapeHTML(c.name)}</span><span class="cik-gp">${escapeHTML(c.teamName)}</span></span>`
      + (taken ? '<span class="cik-state">Claimed</span>' : '')
      + '</button>';
  }).join('');
}

function renderClaimConfirm(c) {
  const el = document.getElementById('claim-page');
  if (!el) return;
  el.innerHTML = claimHeaderHTML() + `
      <div class="claim-linked">
        <span class="av claim-bigav">${escapeHTML(c.initials)}</span>
        <div class="claim-nm">${escapeHTML(c.name)}</div>
        <div class="claim-team">${escapeHTML(c.teamName)}</div>
        <div class="auth-err" id="claim-err" role="alert" hidden></div>
        <button type="button" class="auth-submit" id="claim-confirm">Claim my spot</button>
        <button type="button" class="auth-alt" id="claim-notme">Not me &mdash; back to search</button>
      </div>
    </div>`;
  el.querySelector('#claim-back').addEventListener('click', closeClaimPage);
  el.querySelector('#claim-notme').addEventListener('click', renderClaimSearch);
  el.querySelector('#claim-confirm').addEventListener('click', () => submitClaim(c));
  setTimeout(() => { const b = document.getElementById('claim-confirm'); if (b) b.focus(); }, 50);
}

async function submitClaim(c) {
  const btn = document.getElementById('claim-confirm');
  const err = document.getElementById('claim-err');
  if (btn) { btn.disabled = true; btn.textContent = 'Claiming…'; }
  try {
    const { error } = await supabaseClient.rpc('claim_player', { p_player: c.id });
    if (error) throw error;
    if (state.account) {
      c.claimedBy = state.account.id; // reflect locally without a refetch
      // Slice 3c: also patch the shared personal-layer slot so the Home hero / My Team light up
      // the moment the page closes (the 15s sync would catch up anyway; this removes the lag).
      const shared = (state.teamMembers || []).find((x) => x.id === c.id && x.teamName === c.teamName);
      if (shared) shared.claimedBy = state.account.id;
    }
    renderClaimSuccess(c);
  } catch (e2) {
    console.error('claim_player', e2);
    const msg = /already claimed/i.test((e2 && e2.message) || '')
      ? 'Someone already claimed this player — ask your organizer to fix it.'
      : "Couldn't claim right now — try again.";
    if (err) { err.textContent = msg; err.hidden = false; }
    if (btn) { btn.disabled = false; btn.textContent = 'Claim my spot'; }
  }
}

function renderClaimSuccess(c) {
  const el = document.getElementById('claim-page');
  if (!el) return;
  el.innerHTML = claimHeaderHTML("You're linked") + `
      <div class="claim-linked">
        <span class="av claim-bigav">${escapeHTML(c.initials)}</span>
        <div class="claim-nm">${escapeHTML(c.name)}</div>
        <div class="claim-team">${escapeHTML(c.teamName)}</div>
        <p class="auth-sub">Done &mdash; this is you now. Your games and your record are on the way.</p>
        <button type="button" class="auth-submit" id="claim-done">Done</button>
      </div>
    </div>`;
  // Closing the success view re-renders so the personal hero/tile appear immediately (user action -> render()).
  const doneAndRender = () => { closeClaimPage(); try { render(); } catch (_) {} };
  el.querySelector('#claim-back').addEventListener('click', doneAndRender);
  el.querySelector('#claim-done').addEventListener('click', doneAndRender);
  setTimeout(() => { const b = document.getElementById('claim-done'); if (b) b.focus(); }, 50);
}

function friendlyAuthError(error, signup) {
  const m = (error && error.message) || '';
  if (/invalid login credentials/i.test(m)) return "That email or password isn't right.";
  if (/already registered|user already/i.test(m)) return 'That email already has an account — sign in instead.';
  if (/password/i.test(m) && /(6|characters|short)/i.test(m)) return 'Password must be at least 6 characters.';
  if (/email/i.test(m) && /valid/i.test(m)) return 'Enter a valid email address.';
  return m || (signup ? 'Could not create your account.' : 'Could not sign you in.');
}

async function onAuthSubmit(e) {
  e.preventDefault();
  const emailEl = document.getElementById('auth-email');
  const passEl = document.getElementById('auth-pass');
  const errEl = document.getElementById('auth-err');
  const btn = document.getElementById('auth-submit');
  const email = (emailEl && emailEl.value || '').trim();
  const password = (passEl && passEl.value) || '';
  const showErr = (msg) => { if (errEl) { errEl.textContent = msg; errEl.hidden = false; } };
  if (errEl) errEl.hidden = true;
  if (!email || !password) { showErr('Enter your email and password.'); return; }
  const signup = authMode === 'signup';
  if (signup && password.length < 6) { showErr('Password must be at least 6 characters.'); return; }
  if (!supabaseClient) { showErr('Sign-in is unavailable right now.'); return; }
  const orig = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = signup ? 'Creating…' : 'Signing in…'; }
  try {
    const res = signup
      ? await supabaseClient.auth.signUp({ email, password })
      : await supabaseClient.auth.signInWithPassword({ email, password });
    if (res.error) { showErr(friendlyAuthError(res.error, signup)); if (btn) { btn.disabled = false; btn.textContent = orig; } return; }
    if (signup && !(res.data && res.data.session)) {
      // Email confirmation is ON at the project level -> no instant session. (We aim to disable it.)
      showErr('Account created. Check your email to confirm, then sign in.');
      authMode = 'signin';
      if (btn) { btn.disabled = false; btn.textContent = 'Sign in'; }
      return;
    }
    closeAuthPage(); // success -> onAuthStateChange sets state + re-renders the header
  } catch (_) {
    showErr('Something went wrong. Try again.');
    if (btn) { btn.disabled = false; btn.textContent = orig; }
  }
}

// Task 13 (2026-07-11): the legacy admin code login is DELETED.
// Email+password is the only sign-in; owner/organizer role sets isAdmin in onAuthStateChange.

// Signed-in: a small centered card with the account email + role + Sign out.
function openAccountMenu() {
  const prev = document.getElementById('account-menu'); if (prev) prev.remove();
  const el = document.createElement('div');
  el.id = 'account-menu';
  el.className = 'popup-overlay';
  el.style.display = 'flex';
  const email = (state.account && state.account.email) || '';
  // §13.6: owner/organizer keep their capitalized server role. Otherwise a CLAIMED player reads
  // "Player · <team name>" (team via myTeamInfo()/claimed_by_profile); an unclaimed signed-in account
  // stays "Spectator". myClaimedPlayer is the fallback when the team roster isn't loaded this session.
  let roleLabel;
  if (state.role) {
    roleLabel = state.role[0].toUpperCase() + state.role.slice(1);
  } else {
    const mine = myTeamInfo();
    roleLabel = mine ? ('Player · ' + mine.teamName) : (state.myClaimedPlayer ? 'Player' : 'Spectator');
  }
  el.innerHTML =
    '<div class="popup-card card kc-card am-card" role="dialog" aria-modal="true">'
    + '<div class="am-avatar">' + escapeHTML(authInitial()) + '</div>'
    + '<div class="kc-name">' + escapeHTML(email) + '</div>'
    + '<div class="am-role">' + escapeHTML(roleLabel) + '</div>'
    + '<button type="button" class="kc-confirm" id="am-signout">Sign out</button>'
    + '<button type="button" class="kc-cancel" id="am-close">Close</button>'
    + '</div>';
  document.body.appendChild(el);
  el.querySelector('#am-close').addEventListener('click', () => el.remove());
  el.addEventListener('click', (ev) => { if (ev.target === el) el.remove(); });
  el.querySelector('#am-signout').addEventListener('click', () => {
    el.remove();
    // Optimistic: clear local auth state + re-render NOW so sign-out feels instant. A local-scope
    // signOut normally resolves immediately, but under a slow/flaky network the supabase-js auth lock
    // (waiting on an in-flight token refresh) can delay it — we don't make the user wait on that.
    state.authSession = null; state.account = null; state.role = null;
    state.myClaimedPlayer = null; // Round 2 §12.3: the hero signs out with the account
    try { render(); } catch (_) {}
    // Fire the real signOut in the background to clear the persisted token. The SIGNED_OUT event
    // re-runs the same cleanup (a no-op by then).
    try { supabaseClient.auth.signOut({ scope: 'local' }); } catch (_) {}
  });
}

// Mike pick X (task-#10, 2026-07-10): the in-app Check In tab is ANON-ONLY kiosk content — NO
// signed-in hero here (most pickup players aren't signed in). This SUPERSEDES the session-5 one-tap
// hero ON THIS TAB ONLY; state.myClaimedPlayer + loadMyClaimedPlayer still feed the account menu +
// My team, and the standalone checkin.html kiosk keeps its own hero. Content = centered mark →
// "Check in" title → search box → big tap rows (renderCheckinButton) → dashed "I'm new — add me".
function publicCheckinHTML() {
  const searchBlock = `
    <div class="cik-search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
      <input id="checkin-search" type="text" placeholder="Start typing your name&hellip;" autocapitalize="words" autocomplete="off" spellcheck="false" aria-label="Type your name" />
    </div>
    <div id="checkin-results"></div>
    <button class="cik-new" id="btn-checkin-new" type="button">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
      I'm new &mdash; add me
    </button>`;
  return `
  <div class="ci-kiosk is-idle">
    <div class="cik-mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 12.5l2.5 2.5L15.5 9"/><circle cx="12" cy="12" r="9"/></svg></div>
    <h2 class="cik-h">Check in</h2>
    <p class="cik-sub">Type your name, then tap it</p>
    ${searchBlock}
    <div id="checkin-toast" class="cik-toast" role="status" aria-live="polite" hidden></div>
  </div>
  `;
}

// C26 item 2: Public surface shell — hardcodes the non-admin branch of every former interleaved
// `state.isAdmin ?` ternary. Returns the full #app-shell string.
// Wave 1b (2026-06-25): the public bottom-nav buttons, extracted so refreshTournamentLive can rebuild
// ONLY the nav (show/hide the Bracket button as a tournament goes live/ends on another device) instead
// of a full render() that resets a spectator's scroll. The click handler is delegated on #bottom-nav
// (attachHandlers), so swapping innerHTML keeps navigation working.
function buildPublicNavInnerHTML() {
  // Check In rework (Mike 2026-07-10): the Check In button renders ONLY on the pickup-session day
  // (checkinNavVisible → sessionIsToday). Home and Tournament always render. Every nav rebuild goes
  // through this builder (full render() shell + refreshTournamentLive's surgical swap), so the tab
  // re-derives consistently; the #tab-players panel itself stays in the DOM (routing-only change).
  const checkinBtn = checkinNavVisible() ? `
    <button class="nav-btn" data-nav-tab="players">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="8" r="4"/><path d="m16.5 11 2 2 4-4"/></svg>
      <span>Check In</span>
    </button>` : '';
  // Manage (session-10 R1): the 4th nav item, ONLY for admins — the whole admin surface now lives on the
  // public shell. Sliders SVG. Every nav rebuild path (shell render, refreshTournamentLive swap, day-of
  // check-in gate rebuild) goes through this builder, so the item appears/vanishes consistently.
  const manageBtn = state.isAdmin ? `
    <button class="nav-btn" data-nav-tab="manage">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21v-7"/><path d="M4 10V3"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M20 21v-5"/><path d="M20 12V3"/><path d="M1 14h6"/><path d="M9 8h6"/><path d="M17 16h6"/></svg>
      <span>Manage</span>
    </button>` : '';
  return `
    <button class="nav-btn" data-nav-tab="home">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>
      <span>Home</span>
    </button>${checkinBtn}
    <button class="nav-btn" data-nav-tab="tournament">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v4a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4a3 3 0 0 0 3 3"/><path d="M17 6h3a3 3 0 0 1-3 3"/></svg>
      <span>Tournament</span>
    </button>${manageBtn}`;
}

// Public header (atom-up 2026-07-10, spec §1): wordmark + spectator account icon only. Sport-pill removed.
// The account action is a placeholder — Supabase Auth is a later track.
// The sync notice stays in the shell (partialRender depends on #js-sync-notice).
function buildPublicHeaderHTML() {
  return `
    <div class="pd-wordmark">
      <div class="pd-wm-1">ATHLETIC SPECIMEN</div>
      <div class="pd-wm-2">COLORADO</div>
    </div>
    <div class="pd-hgrp">
      ${state.authSession
        ? `<button type="button" class="pd-avic is-signedin" id="pd-account" aria-label="Account: signed in">${escapeHTML(authInitial())}</button>`
        : `<button type="button" class="pd-avic" id="pd-account" aria-label="Sign in">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/></svg>
      </button>`}
    </div>`;
}

// The single glyph shown in the signed-in account chip: first letter of the account email, uppercased.
function authInitial() {
  const e = (state.account && state.account.email) || '';
  return (e.trim()[0] || '?').toUpperCase();
}

// Slice 1 sub-pages reached from Home tiles (no bottom-nav button; nav highlight anchors to Home).
// Shared page header: a back-to-Home chevron + the page title (mirrors the mockup's per-page header).
function pdPageHeaderHTML(title) {
  return `<div class="pd-pagehdr">
    <button type="button" class="pd-back" data-nav-tab="tournament" aria-label="Back to Tournament"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg></button>
    <div class="pd-htitle">${escapeHTML(title)}</div>
  </div>`;
}

// The My Team page (Mike's LOCKED pick Q, session 9 — single-scroll) — flat scoreboard hero
// (eyebrow tournament · Pool · Seed → team name → Barlow W–L + per-game pips) → up-next strip →
// stacked GAMES then ROSTER sections, no toggle. Renders entirely from state (partialRender-safe rebuild).
function buildMyTeamPageHTML() {
  const header = pdPageHeaderHTML('My Team');
  const t = publicLiveTournament()
    || (state.tournaments || []).find((x) => x.registration_open && x.status === 'setup') || null;
  if (!t) return `${header}<div class="pd-empty">No tournament right now — your team shows up here when one is on.</div>`;
  if (!state.account) return `${header}<div class="pd-empty">Sign in and claim your name on Home to see your team here.</div>`;
  const mine = myTeamInfo();
  if (!mine) return `${header}<div class="pd-empty">Claim your name to see your team here — tap &ldquo;Playing? Claim your team&rdquo; on Home.</div>`;

  const teams = state.tournamentTeams || [];
  const matches = state.tournamentMatches || [];
  const rec = computeTeamRecord(mine.teamId, matches, teams);
  const tl = computeTeamRunTimeline(mine.teamId, matches, teams);
  const team = teams.find((x) => x.id === mine.teamId) || {};
  const pool = (state.tournamentPools || []).find((p) => p.id === team.pool_id);
  const anyFinal = matches.some((m) => m.phase === 'pool' && m.status === 'final');
  const seedRow = anyFinal ? (computeSeeding(teams, matches).find((s) => s.teamId === mine.teamId) || null) : null;
  const eyebrow = [t.name || 'Tournament', pool && pool.label ? ('Pool ' + pool.label) : '', seedRow && seedRow.seed ? ('Seed ' + seedRow.seed) : '']
    .filter(Boolean).join(' · ');

  // Pips: one per game of mine with both teams known — green W, muted-red L, gray unplayed (§27 semantics).
  const myAll = matches.filter((m) => (m.team_a_id === mine.teamId || m.team_b_id === mine.teamId) && m.team_a_id && m.team_b_id);
  const pips = rec.results.map((g) => `<span class="mt-pip ${g.won ? 'w' : 'l'}"></span>`).join('')
    + Array.from({ length: Math.max(0, myAll.length - rec.results.length) }, () => '<span class="mt-pip"></span>').join('');

  const EN = '–'; // en dash — record + score separator (matches the pl-* pools kit)
  const nextStrip = tl.next ? `<div class="mt-next">
      <div class="mt-nettile"><span class="n1">NET</span><span class="n2">${tl.next.net ? escapeHTML(String(tl.next.net)) : '—'}</span></div>
      <div><div class="mt-nl">${tl.next.isNow ? 'UP NEXT — HAPPENING NOW' : 'UP NEXT'}</div>
        <div class="mt-nv">vs ${escapeHTML(tl.next.oppName || '—')}${tl.next.isNow ? '' : (tl.next.etaMin != null ? ' · ~' + tl.next.etaMin + ' min' : (tl.next.gamesAhead ? ' · ' + tl.next.gamesAhead + (tl.next.gamesAhead === 1 ? ' game ahead' : ' games ahead') : ''))}</div>
      </div>
    </div>` : '';

  // GAMES rows (stacked, no toggle): zip rec.results with the same finals list to recover each game's net
  // + round for the right-side meta. computeTeamRecord stays untouched — this filter/sort mirrors it
  // exactly (involves-me + final, oldest-first) so the indices line up.
  const myFinals = matches
    .filter((m) => (m.team_a_id === mine.teamId || m.team_b_id === mine.teamId) && m.status === 'final')
    .sort((a, b) => String(a.updated_at || '').localeCompare(String(b.updated_at || '')));
  const gamesRows = rec.results.length
    ? rec.results.map((g, i) => {
        const m = myFinals[i] || {};
        const meta = [m.net != null ? ('Net ' + m.net) : '', (m.queue_order || m.round) ? ('R' + (m.queue_order || m.round)) : ''].filter(Boolean).join(' · ');
        return `<div class="mt-game${g.won ? '' : ' l'}"><span class="mt-wl ${g.won ? 'w' : 'l'}">${g.won ? 'W' : 'L'}</span><span class="mt-sc">${g.myScore}${EN}${g.oppScore}</span><span class="mt-vs">vs ${escapeHTML(g.oppName || '—')}</span>${meta ? `<span class="mt-meta">${escapeHTML(meta)}</span>` : ''}</div>`;
      }).join('')
    : '<div class="mt-note">No games scored yet — results land here as they finish.</div>';

  const roster = (state.teamMembers || []).filter((c) => c.teamId === mine.teamId);
  const rosterRows = roster.length
    ? roster.map((c) => `<div class="mt-pl"><span class="av">${escapeHTML(c.initials)}</span><span class="mt-nm">${escapeHTML(c.name)}</span>${c.id === mine.playerId ? '<span class="mt-you">You</span>' : ''}</div>`).join('')
    : '<div class="mt-note">No roster on file for this team.</div>';

  // Single scroll (Mike pick Q): flat scoreboard hero -> up-next strip -> stacked GAMES then ROSTER.
  return `${header}
    <div class="mt-hero"><span class="pd-eyebrow">${escapeHTML(eyebrow)}</span><div class="mt-team">${escapeHTML(mine.teamName)}</div><div class="mt-rn">${rec.wins}${EN}${rec.losses}</div><div class="mt-pips">${pips}</div></div>
    ${nextStrip}
    <div class="pl-sect">Games</div>
    ${gamesRows}
    <div class="pl-sect">Roster</div>
    ${rosterRows}`;
}

// Public History (Mike's LOCKED pick Z, session 9 — "Past tournaments" ONE year-grouped list; the tabbed
// Tournaments/Leaderboard/Champions layout is retired). Each row = accent-soft trophy tile + tournament
// name + "N teams · <champion|No champion recorded>" + chevron, grouped under a hairline year label
// (descending), rows newest-first within a year. Champion facts enrich the row inline — no separate view.
// Data = loadTournamentHistory() (lazy, read-only anon, cached on state.tournamentHistory; rows already
// sorted newest-first by date). computeAllTimeLeaderboard stays exported+tested for a later "records" view.
function pdFormatMonthYear(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// Lazy, read-only: for each COMPLETED tournament, load its teams + main matches once and derive the champion.
// Cached on state.tournamentHistory (undefined = not loaded, [] = loaded-empty). Never blocks boot; on any
// error it degrades to [] so History just shows its empty state.
async function loadTournamentHistory() {
  if (state.tournamentHistoryLoading) return;
  state.tournamentHistoryLoading = true;
  try {
    const completed = (state.tournaments || []).filter((t) => t.status === 'completed');
    const rows = await Promise.all(completed.map(async (t) => {
      const [teams, main] = await Promise.all([tdbListTeams(t.id), tdbListMatches(t.id, 'main')]);
      return {
        id: t.id,
        name: t.name || 'Tournament',
        date: t.created_at || t.updated_at || null,
        teamCount: (teams || []).length,
        // Task 10 (pick R12): prefer the STORED champion (deliberate close-out) over re-deriving it, falling
        // back to the computed bracket champion, then null. tournaments are loaded with select('*'), so
        // champion_team_id rides in for free once 0050 lands (undefined pre-apply → the computed fallback).
        champion: resolveHistoryChampion(t, teams || [], main || []),
      };
    }));
    rows.sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))); // newest first
    state.tournamentHistory = rows;
  } catch (e) {
    state.tournamentHistory = [];
  } finally {
    state.tournamentHistoryLoading = false;
  }
}

function buildHistoryPageHTML() {
  const header = pdPageHeaderHTML('Past tournaments');
  const hist = state.tournamentHistory;
  if (typeof hist === 'undefined') return `${header}<div class="pd-empty">Loading&hellip;</div>`;
  if (!hist.length) return `${header}<div class="pd-empty">No tournaments finished yet — the first one lands here.</div>`;

  const TROPHY = '<path d="M8 21h8"/><path d="M12 17v4"/><path d="M6 4h12v5a6 6 0 0 1-12 0z"/>';
  const CHEV = '<svg class="ht-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>';

  // Group by the calendar year of each tournament's date (created_at||updated_at, shaped by the loader).
  // hist is already sorted newest-first, so rows stay newest-first within a year; the group KEYS are
  // sorted descending explicitly (unknown-date rows sink to the bottom under a "—" heading).
  const byYear = new Map();
  hist.forEach((h) => {
    const d = h.date ? new Date(h.date) : null;
    const key = d && !isNaN(d.getTime()) ? String(d.getFullYear()) : '—';
    if (!byYear.has(key)) byYear.set(key, []);
    byYear.get(key).push(h);
  });
  const years = [...byYear.keys()].sort((a, b) => {
    if (a === b) return 0;
    if (a === '—') return 1;
    if (b === '—') return -1;
    return Number(b) - Number(a);
  });

  const body = years.map((yr) => {
    const rows = byYear.get(yr).map((h) => {
      const teams = h.teamCount || 0;
      const champ = h.champion && h.champion.name
        ? 'Champions — ' + escapeHTML(h.champion.name)
        : 'No champion recorded';
      const sub = `${teams} team${teams === 1 ? '' : 's'} · ${champ}`;
      return `<div class="ht-row"><span class="ht-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${TROPHY}</svg></span><div class="ht-body"><div class="ht-nm">${escapeHTML(h.name)}</div><div class="ht-sub">${sub}</div></div>${CHEV}</div>`;
    }).join('');
    return `<div class="ht-year">${escapeHTML(yr)}</div>${rows}`;
  }).join('');

  return `${header}${body}`;
}

// ── Manage tab (session-10 pick R1) — admin-only, lives on the PUBLIC shell as a 4th nav item. ──
// The lead: title flush top -> NEEDS YOU (omitted when nothing is pending) -> EVERYTHING rows
// (Tournament · Pickup days · Players · Teams · Admins), each a flat tappable row with a one-line status
// sub + chevron. Flat on stone (NO pd-card), pl-sect section labels, mg-* kit, SVG chevrons, plain English.
// `manageView` ('lead' | area) is a MODULE var (distinct from state.manageView — the legacy tournament-mode
// sub-view); it survives partialRender so a background sync repaints the current Manage surface, never a full render().
let manageView = 'lead';  // 'lead' = the needs-you lead; 'pickup'/'pickup-form' (Task 2); 'players' (Task 3); else an area id (placeholder)
let pickupEditId = null;  // Task 2: the pickup_days row id being edited in 'pickup-form' (null = adding a new day)
// Task 3 (Players directory, pick R4): the live-search value + Select(bulk) state. All survive the container-
// swap repaint AND guard the poll-clobber (a background sync must never wipe a half-typed query or a selection).
let mgPlayerQuery = '';         // the current #mg-player-search value
let mgSelectMode = false;       // bulk Select mode on/off
let mgSelected = new Set();     // selected player identity keys (playerIdentityKey) while in Select mode
let mgGroupsOpen = false;       // the inline group manager (toggled from the meta group count)
let mgMoveOpen = false;         // the Move-to-group chip row (toggled from the bar's "Move to group")
let mgRenameGroup = null;       // the group name being inline-renamed in the group manager (null = none)
// Task 4 (Teams page, pick R5 trimmed): the selected team-SIZE chip (4s default) + the open swap sheet.
// All survive the container-swap repaint (a background sync must not reset a chosen size or a half-open swap).
let mgtSize = 4;                // the active size chip (2/3/4/6); 4s default per the mockup
let mgtSwapKey = null;          // the playerIdentityKey being swapped (null = swap sheet closed)
let mgtSwapFrom = null;         // the team index the swapped player currently sits on
// Task 5 (Tournament sub-hub, pick R2 + Registration, pick R7): the open tournament sub-view under
// manageView==='tournament'. null = the sub-hub (the 7 rows); 'registration' = the Registration view (built
// now); 'teams'|'pools'|'bracket'|'settings'|'rules'|'closeout' render honest placeholders until Tasks 6-10
// fill them. Survives the container-swap repaint (a background sync never resets which sub-view is open).
let mgtView = null;
// Task 7 (Pools & schedule admin, pick R9): the active pool tab in the post-draw schedule
// ('A'|'B'|…|'seeding'; null → the first pool) + whether the Pool-controls section is expanded. Both
// survive the container-swap repaint (a background score sync must not reset the tab or collapse the panel).
let mgpPoolFilter = null;
let mgpControlsOpen = false;
// Task 10 (Close out, pick R12): the champion the admin will record on close. undefined = follow the computed
// bracket suggestion (computeChampion); a team-id string = a manual CHANGE-picker override; '' = an explicit
// "no champion recorded". Survives the container-swap repaint (a background sync must not reset the pick); the
// picker sheet is body-level (poll-clobber-immune). Reset to undefined after a successful close.
let mgCloseoutChampId = undefined;
// Task 11 (Admins, pick R6): the seats + activity-log surface under manageView==='admins'. Seat/log data
// load LAZILY on open via the 0051 read RPCs (list_admin_seats / read_action_log) — NOT part of the boot
// sync — into these module vars, then repaintManage(). All survive the container swap (a background poll
// must never wipe a half-typed email or a loaded list). mgAdminsView: 'seats' | 'log'. mgSeats/mgLog:
// null = not loaded yet (→ loading line), [] = loaded-empty (→ honest empty state), else the rows.
let mgAdminsView = 'seats';
let mgSeats = null;
let mgSeatsLoading = false;
let mgSeatsError = '';
let mgAssignOpen = false;   // the inline assign-by-email field (owner taps a waiting seat)
let mgLog = null;
let mgLogLoading = false;
let mgLogError = '';

const MG_CHEV ='<svg class="mg-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>';

// The tournament the Manage lead reports on: a live event (pools/bracket), else the most-recent SETUP
// tournament — REGARDLESS of registration_open. The old filter (`registration_open && status==='setup'`)
// stranded the whole Manage → Tournament workflow in the gap between "close registration" and "draw pools":
// the moment an admin closed registration on a still-setup tournament it resolved to null, so the sub-hub,
// the Teams/Registration views, and the needs-you lead all went blank mid-setup. state.tournaments loads
// created_at DESC (tdbListTournaments), so the first `setup` match IS the most-recent one. 'completed' stays
// excluded (a finished event isn't the thing you're managing next).
function manageLeadTournament() {
  return publicLiveTournament()
    || (state.tournaments || []).find((x) => x && x.status === 'setup')
    // Task 10 (pick R12): a just-CLOSED tournament stays manageable so the admin can reopen it and so the
    // Close out sub-view can show the recorded champion. Last resort only (setup/live win): the most-recent
    // completed tournament. This is what makes "you can reopen from there" actually reachable after close.
    || (state.tournaments || []).filter((x) => x && x.status === 'completed')
         .sort((a, b) => String((b && (b.updated_at || b.created_at)) || '')
           .localeCompare(String((a && (a.updated_at || a.created_at)) || '')))[0]
    || null;
}

// The effective pickup-day SET, read by every day-of gate (checkinNavVisible, publicHomeState) and the
// Manage lead. Post-0046 the loaded pickup_days rows are authoritative (even when empty = genuinely no
// days). PRE-0046 (table absent → pickupDaysLoaded stays false) it falls back to the single legacy
// sessions row shaped as a one-element array, so day-of gating keeps working until the migration + its
// backfill land. Rows carry `.day` (pickup_days) — the legacy fallback maps `.date` onto `.day`.
function pickupDaySet() {
  if (state.pickupDaysLoaded) return Array.isArray(state.pickupDays) ? state.pickupDays : [];
  if (state.currentSession && state.currentSession.date) {
    return [{ day: state.currentSession.date, time_label: state.currentSession.time || null, location: state.currentSession.location || null }];
  }
  return [];
}

// The UPCOMING pickup days (>= today), pre-filtered for the pure needs-you model (its `noday` item just
// checks length). Empty → `noday` fires honestly.
function manageUpcomingPickupDays() {
  return pickupDaySet().filter((d) => d && sessionIsUpcoming(d.day));
}

// Thin caller over the pure attention model (pure.js).
function manageNeedsYou() {
  return manageNeedsYouModel(manageLeadTournament(), state.tournamentTeams || [], manageUpcomingPickupDays());
}

// Manage data-sync (e2e catch, 2026-07-11): the Manage surface renders manageLeadTournament(), but the
// tournament data collections (teams/pools/matches) load for state.activeTournamentId — which only the old
// shell's tv2-select-tournament ever set. If they diverge (e.g. a newer setup tournament exists), Manage
// shows one tournament's NAME over another tournament's DATA. Follow the resolver: when they differ, adopt
// the resolved id + refresh the collections, then repaint. Re-entrancy-guarded so poll/tap storms can't
// stack refreshes.
// The tournament AREA's resolver (e2e catch #2, 2026-07-11): every sub-view under Manage → Tournament
// keys on the ACTIVE tournament first so the area stays on ONE tournament mid-flow — closing a tournament
// must not silently swap the close-out page to the next setup tournament (which made Reopen unreachable).
// Fresh entries re-glue active to the lead resolver via mgSyncActiveTournament, so the two agree except
// during an in-flow transition, which is exactly when active must win. The LEAD page + needs-you keep
// manageLeadTournament() (the front page follows the resolver, deliberately).
function mgActiveTournament() {
  const byActive = state.activeTournamentId ? (state.tournaments || []).find((x) => x.id === state.activeTournamentId) : null;
  return byActive || manageLeadTournament();
}

let mgSyncingTournament = false;
function mgSyncActiveTournament() {
  const t = manageLeadTournament();
  if (!t || state.activeTournamentId === t.id || mgSyncingTournament) return;
  mgSyncingTournament = true;
  state.activeTournamentId = t.id;
  Promise.resolve(tdbRefreshTournaments())
    .then(() => { mgSyncingTournament = false; repaintManage(); })
    .catch(() => { mgSyncingTournament = false; });
}

// One flat Manage row. name + subHTML are emitted RAW — callers pre-escape any user-derived content
// (apostrophes in the fixed/model copy are valid in text content and must survive verbatim for §27).
function mgRowHTML(area, name, subHTML) {
  return `<a class="mg-row" data-mg-area="${area}">
      <div class="mg-rb"><div class="mg-rn">${name}</div><div class="mg-rs">${subHTML}</div></div>
      ${MG_CHEV}
    </a>`;
}

function buildManagePageHTML() {
  const t = manageLeadTournament();
  const teams = state.tournamentTeams || [];
  const needs = manageNeedsYou();

  // NEEDS YOU — omitted entirely when empty (R1). Titles are model-controlled (no user input) so they emit
  // raw; subs may embed team/tournament names so they are escaped.
  const needsHTML = needs.length
    ? `<div class="pl-sect">Needs you</div>`
      + needs.map((it) => mgRowHTML(it.area, it.title, escapeHTML(it.sub))).join('')
    : '';

  // EVERYTHING — five flat rows with honest one-line status subs derived from state.
  const stageWord = ({ setup: 'Setup', pools: 'Pools & schedule', bracket: 'Bracket', completed: 'Completed' });
  const tourSub = t
    ? [t.name || 'Tournament', t.registration_open ? 'Registration open' : (stageWord[t.status] || 'Setup'),
       teams.length + ' team' + (teams.length === 1 ? '' : 's') + ' in'].filter(Boolean).join(' · ')
    : 'No tournament yet';
  const days = manageUpcomingPickupDays();
  const pickupSub = days.length
    ? (days.length === 1 ? 'Next up ' + formatSessionDate(days[0].day || days[0].date) : days.length + ' scheduled')
    : 'None scheduled';
  const roster = (state.players || []).length;
  const inNow = (state.checkedIn || []).length;
  const playersSub = roster + ' on the roster · ' + inNow + ' checked in';
  const teamsSub = inNow ? inNow + ' checked in — ready to make teams' : 'Quiet — no live session';

  const everythingHTML = `<div class="pl-sect">Everything</div>`
    + mgRowHTML('tournament', 'Tournament', escapeHTML(tourSub))
    + mgRowHTML('pickup', 'Pickup days', escapeHTML(pickupSub))
    + mgRowHTML('players', 'Players', escapeHTML(playersSub))
    + mgRowHTML('teams', 'Teams', escapeHTML(teamsSub))
    + mgRowHTML('admins', 'Admins', 'Seats &amp; activity log');

  return `<div class="mg-h1">Manage</div>
    ${needsHTML}
    ${everythingHTML}`;
}

// Area placeholders (Task 1): the real Pickup/Players/Teams/Tournament/Admins screens land in Tasks 2-11.
// Each carries a back-to-Manage header (data-mg-area="lead") so a row tap is never a dead end.
const MG_AREA_TITLES = { tournament: 'Tournament', pickup: 'Pickup days', players: 'Players', teams: 'Teams', admins: 'Admins' };
function manageAreaPlaceholderHTML(area) {
  const title = MG_AREA_TITLES[area] || 'Manage';
  return `<div class="pd-pagehdr">
      <button type="button" class="pd-back" data-mg-area="lead" aria-label="Back to Manage"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg></button>
      <div class="pd-htitle">${escapeHTML(title)}</div>
    </div>
    <div class="pd-empty">Coming in the next slices.</div>`;
}

// ── Task 2: Pickup days (session-10 pick R3 hybrid) — multi-day list + form-first edit ──────────────
// Mockups r10-manage/p-h1 (list) + p-h2 (form). Reuses the manage-area chrome (pd-pagehdr/pd-back/
// pd-htitle) + the pl-sect section label + MG_CHEV; the pk-* kit carries the rows/fields/CTAs.
const PK_BACK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg>';
const PK_PLUS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>';

// 'YYYY-MM-DD' → a LOCAL Date (avoids the UTC-parse off-by-one that new Date('YYYY-MM-DD') causes).
function pkLocalDate(dayStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dayStr == null ? '' : dayStr));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
function pkWeekdayTag(dayStr) { // "THU"
  const dt = pkLocalDate(dayStr);
  return dt ? dt.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase() : '';
}
function pkDateLabel(dayStr) { // "July 16"
  const dt = pkLocalDate(dayStr);
  return dt ? dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : '';
}
function pkFormTitle(dayStr) { // "Thursday, July 16"
  const dt = pkLocalDate(dayStr);
  return dt ? dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : 'Pickup day';
}

// The Pickup days LIST (mockup p-h1). Renders the loaded pickup_days rows (NOT the legacy fallback —
// that only drives gating; pre-0046 this list is honestly empty). Upcoming (>= today) only, soonest-first,
// NEXT UP live-ink tag on the soonest, dashed Add. Each row deep-links into its form via data-pk-day.
function buildPickupDaysHTML() {
  const rows = (Array.isArray(state.pickupDays) ? state.pickupDays.slice() : [])
    .filter((d) => d && sessionIsUpcoming(d.day))
    .sort((a, b) => String(a.day).localeCompare(String(b.day)));
  const header = `<div class="pd-pagehdr">
      <button type="button" class="pd-back" data-mg-area="lead" aria-label="Back to Manage">${PK_BACK_SVG}</button>
      <div class="pd-htitle">Pickup days</div>
    </div>`;
  const body = rows.length
    ? `<div class="pl-sect">Scheduled</div>`
      + rows.map((d, i) => {
        const timeTail = d.time_label ? ' · ' + escapeHTML(String(d.time_label)) : '';
        const loc = d.location ? escapeHTML(String(d.location)) : 'Location TBD';
        const nextUp = i === 0 ? `<span class="pk-next">NEXT UP</span>` : '';
        return `<a class="pk-row" data-pk-day="${escapeHTML(String(d.id || ''))}">
          <span class="pk-wk">${pkWeekdayTag(d.day)}</span>
          <div class="pk-dn"><div class="pk-dt">${escapeHTML(pkDateLabel(d.day))}${timeTail}</div><div class="pk-ds">${loc}</div></div>
          ${nextUp}
        </a>`;
      }).join('')
    : `<div class="pd-empty">No pickup days scheduled — add one to open Check In.</div>`;
  const add = `<button type="button" class="pk-add" data-pk-add>${PK_PLUS_SVG}Add a pickup day</button>
    <div class="pk-note">Each day opens its own Check In when it arrives</div>`;
  return header + body + add;
}

// The Pickup day FORM (mockup p-h2). DATE/TIME/LOCATION hairline-underline fields + Save + the note.
// For an EXISTING day it also shows the ON THE DAY rows (Share the check-in QR · Start a fresh sheet)
// and the red Remove; a NEW (unsaved) day shows just the fields (those day-of actions are meaningless yet).
function buildPickupDayFormHTML() {
  const editing = pickupEditId
    ? (state.pickupDays || []).find((d) => d && String(d.id) === String(pickupEditId))
    : null;
  const day = editing || {};
  const titleText = editing && editing.day ? pkFormTitle(editing.day) : 'New pickup day';
  const header = `<div class="pd-pagehdr">
      <button type="button" class="pd-back" data-mg-area="pickup" aria-label="Back to pickup days">${PK_BACK_SVG}</button>
      <div class="pd-htitle">${escapeHTML(titleText)}</div>
    </div>`;
  const fields = `
    <div class="pk-fld"><label class="pk-fl" for="pk-date">Date</label>
      <input class="pk-fv" id="pk-date" type="date" value="${escapeHTML(String(day.day || ''))}" /></div>
    <div class="pk-fld"><label class="pk-fl" for="pk-time">Time</label>
      <input class="pk-fv" id="pk-time" type="text" placeholder="7:00 PM" autocomplete="off" value="${escapeHTML(String(day.time_label || ''))}" /></div>
    <div class="pk-fld"><label class="pk-fl" for="pk-location">Location</label>
      <input class="pk-fv" id="pk-location" type="text" placeholder="Cherry Creek courts" autocomplete="off" value="${escapeHTML(String(day.location || ''))}" /></div>
    <button type="button" class="pk-cta" data-pk-save>Save</button>
    <div class="pk-savenote">The Check In tab appears for everyone that day</div>
    <p class="pk-msg" id="pk-msg" role="status" aria-live="polite"></p>`;
  const onDay = editing ? `<div class="pl-sect">On the day</div>
    <a class="pk-orow" data-pk-qr><div class="pk-ob"><div class="pk-on">Share the check-in QR</div><div class="pk-os">For the door — players scan and tap their name</div></div>${MG_CHEV}</a>
    <a class="pk-orow" data-pk-fresh><div class="pk-ob"><div class="pk-on">Start a fresh sheet</div><div class="pk-os">Rolls check-ins into history and starts clean</div></div>${MG_CHEV}</a>` : '';
  const remove = editing
    ? `<button type="button" class="pk-danger" data-pk-remove="${escapeHTML(String(editing.id))}">Remove this pickup day</button>`
    : '';
  return header + fields + onDay + remove;
}

// The Manage panel content dispatches on manageView (lead / pickup list / pickup form / an area page).
// Used by renderPublicShell, the partialRender 'manage' branch, and the data-mg-area container-swap —
// one source, no full render().
function manageContainerHTML() {
  if (manageView === 'lead') return buildManagePageHTML();
  if (manageView === 'pickup') return buildPickupDaysHTML();
  if (manageView === 'pickup-form') return buildPickupDayFormHTML();
  if (manageView === 'players') return buildManagePlayersHTML();
  if (manageView === 'teams') return buildManageTeamsHTML();
  if (manageView === 'tournament') return buildManageTournamentContainerHTML();
  if (manageView === 'admins') return buildMgAdminsHTML();
  return manageAreaPlaceholderHTML(manageView);
}

// Swap just the Manage container (partial repaint; module vars survive — NO full render()).
function repaintManage() {
  const c = document.querySelector('#tab-manage .container');
  if (c) c.innerHTML = manageContainerHTML();
}

// Task 11 (pick R6): lazily load the admin SEATS when the Admins area opens (mockup m-c). Not part of the
// boot sync — seats change rarely, so loading them on open keeps boot lean. Honest states: loading line →
// list → friendly error (isFnMissingError → "still updating"). Only repaints while the Admins area is open.
async function loadAdminSeats() {
  mgSeatsLoading = true; mgSeatsError = '';
  if (manageView === 'admins') repaintManage();
  try {
    mgSeats = await tdbListAdminSeats();
  } catch (err) {
    mgSeatsError = (err && err.message) ? err.message : 'Could not load the admin seats.';
  } finally {
    mgSeatsLoading = false;
    if (manageView === 'admins') repaintManage();
  }
}
// Lazily load the ACTIVITY LOG when the log sub-view opens (mockup m-b, day-grouped rows).
async function loadActionLog() {
  mgLogLoading = true; mgLogError = '';
  if (manageView === 'admins') repaintManage();
  try {
    mgLog = await tdbReadActionLog(50);
  } catch (err) {
    mgLogError = (err && err.message) ? err.message : 'Could not load the activity log.';
  } finally {
    mgLogLoading = false;
    if (manageView === 'admins') repaintManage();
  }
}

// ── Task 11 (session-10 pick R6): Manage → Admins — 4-seat roster + activity log ──────────────────────
// Mockups r10-manage/m-c (seats) + m-b (log). Top-level Manage area (manageView==='admins', NOT a
// tournament sub-view). buildMgAdminsHTML dispatches on mgAdminsView: 'seats' | 'log'. Owner-gating keys on
// state.masterAdminAuthenticated (the owner-role server session): only the owner can assign a waiting seat
// or remove a filled non-owner seat. Flat on stone, no pd-card, labeled pills never dots, plain English.
function buildMgAdminsHTML() {
  return mgAdminsView === 'log' ? buildMgLogHTML() : buildMgSeatsHTML();
}

// Role pill (mockup m-c): OWNER filled accent · ADMIN outline · OFF faint outline. A labeled tag, never a dot.
function mgSeatPill(kind) {
  if (kind === 'owner') return '<span class="mgad-pill ow">OWNER</span>';
  if (kind === 'admin') return '<span class="mgad-pill ad">ADMIN</span>';
  return '<span class="mgad-pill off">OFF</span>';
}

const MGAD_TOTAL_SEATS = 4; // the 4-admin model (spec §1): 1 owner + up to 3 organizers.

function buildMgSeatsHTML() {
  const isOwner = !!state.masterAdminAuthenticated;
  const header = `<div class="pd-pagehdr">
      <button type="button" class="pd-back" data-mg-area="lead" aria-label="Back to Manage">${PK_BACK_SVG}</button>
      <div class="pd-htitle">Admins</div>
    </div>`;
  // Not loaded yet — honest loading line, no fake seats (mgSeats===null only before the first RPC returns).
  if (mgSeats === null) {
    const line = mgSeatsError ? escapeHTML(mgSeatsError) : 'Loading the admin seats…';
    return header + `<div class="pd-empty">${line}</div>`;
  }
  // Owner first, then organizers (the RPC already orders this way; re-assert defensively for a clean UI).
  const seats = (Array.isArray(mgSeats) ? mgSeats.slice() : [])
    .sort((a, b) => (b && b.role === 'owner' ? 1 : 0) - (a && a.role === 'owner' ? 1 : 0));
  let firstEmptyDone = false;
  const rows = [];
  for (let i = 0; i < MGAD_TOTAL_SEATS; i++) {
    const s = seats[i];
    if (s) {
      const owner = s.role === 'owner';
      const name = escapeHTML(s.display_name || s.email || 'Admin');
      const email = escapeHTML(s.email || '');
      // The owner row is NEVER editable. A filled non-owner seat is a remove target — for the owner only.
      const rm = (!owner && isOwner) ? ` data-mgad-remove="${escapeHTMLText(String(s.email || ''))}"` : '';
      rows.push(`<a class="mgad-row"${rm}><div class="mgad-rb"><div class="mgad-rn">${name}</div>`
        + `<div class="mgad-rs">${email}</div></div>${mgSeatPill(owner ? 'owner' : 'admin')}</a>`);
    } else {
      // A WAITING (empty) seat. The FIRST empty seat carries the explainer; the rest just say "Waiting".
      // Owner taps it → the inline assign-by-email field.
      const seatTap = isOwner ? ' data-mgad-seat' : '';
      const sub = firstEmptyDone ? 'Waiting' : 'Waiting — they create an account, you flip it on';
      firstEmptyDone = true;
      rows.push(`<a class="mgad-row"${seatTap}><div class="mgad-rb"><div class="mgad-rn">Seat ${i + 1}</div>`
        + `<div class="mgad-rs">${sub}</div></div>${mgSeatPill('off')}</a>`);
    }
  }
  // The inline assign-by-email form (owner only), toggled by tapping a waiting seat. rf-* field grammar.
  const assign = (isOwner && mgAssignOpen)
    ? `<div class="mgad-assign">`
      + `<label class="pk-fl" for="mgad-email">Their account email</label>`
      + `<input class="pk-fv" id="mgad-email" type="email" inputmode="email" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="name@email.com" />`
      + `<button type="button" class="mgr-cta" data-mgad-make>Make them an admin</button>`
      + `<p class="mgad-msg" id="mgad-msg" role="status" aria-live="polite"></p>`
      + `<div class="mgr-fnote">They must have created an account first — this flips their access on.</div>`
      + `</div>`
    : '';
  // The Activity log row → the log sub-view (NO undo this slice).
  const logRow = `<a class="mgad-row mgad-logrow" data-mgad-log><div class="mgad-rb">`
    + `<div class="mgad-rn">Activity log</div><div class="mgad-rs">Every admin action · who and when</div></div>${MG_CHEV}</a>`;
  // Organizers see the roster read-only.
  const note = isOwner ? '' : `<div class="mgr-fnote">Only the owner can add or remove admins.</div>`;
  return header + rows.join('') + assign + logRow + note;
}

// Day label for the log group headers (mockup m-b): Today / Yesterday / weekday / "Month D". Groups by the
// LOCAL calendar day of the row's timestamp.
function mgLogDayLabel(d) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((today.getTime() - that.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff > 1 && diff < 7) return that.toLocaleDateString('en-US', { weekday: 'long' });
  return that.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}
function mgLogTime(d) { return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }

function buildMgLogHTML() {
  const header = `<div class="pd-pagehdr">
      <button type="button" class="pd-back" data-mgad-seats aria-label="Back to Admins">${PK_BACK_SVG}</button>
      <div class="pd-htitle">Activity log</div>
    </div>`;
  if (mgLog === null) {
    const line = mgLogError ? escapeHTML(mgLogError) : 'Loading the activity log…';
    return header + `<div class="pd-empty">${line}</div>`;
  }
  const rows = Array.isArray(mgLog) ? mgLog : [];
  if (!rows.length) return header + `<div class="pd-empty">Nothing logged yet.</div>`;
  let out = ''; let lastDay = null;
  rows.forEach((r) => {
    const actor = escapeHTML((r && r.actor) || 'Someone');
    const summary = escapeHTML((r && r.summary) || '');
    const dt = r && r.at ? new Date(r.at) : null;
    const valid = dt && !isNaN(dt.getTime());
    if (valid) {
      const day = mgLogDayLabel(dt);
      if (day !== lastDay) { out += `<div class="mgad-day">${escapeHTML(day)}</div>`; lastDay = day; }
    }
    const time = valid ? escapeHTML(mgLogTime(dt)) : '';
    out += `<div class="mgad-lg"><span class="mgad-lt">${time}</span>`
      + `<span class="mgad-lx"><b>${actor}</b> ${summary}</span></div>`;
  });
  return header + out;
}

// Make-them-an-admin (owner only): set_member_role(email,'organizer'), then refresh the seats.
async function mgAdminMakeOrganizer() {
  if (!state.masterAdminAuthenticated) return; // owner-only
  const el = document.getElementById('mgad-email');
  const msg = document.getElementById('mgad-msg');
  const email = el ? String(el.value || '').trim() : '';
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    if (msg) msg.textContent = 'Enter their account email first.'; return;
  }
  if (msg) msg.textContent = 'Adding…';
  try {
    await tdbSetMemberRole(email, 'organizer');
    mgAssignOpen = false;
    await loadAdminSeats(); // repaints the seats with the new admin
  } catch (err) {
    if (msg) msg.textContent = (err && err.message) ? err.message : 'Could not add them — check the email and try again.';
  }
}

// The quiet body-level Remove-admin sheet (owner only). Body-level = outside #tab-manage → poll-clobber-immune.
function closeMgAdminSheet() { const el = document.getElementById('mgad-sheet'); if (el) el.remove(); }
function openMgRemoveAdminSheet(email) {
  if (!state.masterAdminAuthenticated || !email) return;
  closeMgAdminSheet();
  const seat = (Array.isArray(mgSeats) ? mgSeats : []).find((s) => s && String(s.email) === String(email));
  const name = seat ? (seat.display_name || seat.email || 'this admin') : 'this admin';
  const scrim = document.createElement('div');
  scrim.id = 'mgad-sheet';
  scrim.className = 'pd-reg-scrim';
  scrim.setAttribute('role', 'dialog');
  scrim.setAttribute('aria-modal', 'true');
  scrim.setAttribute('aria-label', 'Remove admin');
  scrim.innerHTML = `<div class="pd-reg-sheet">`
    + `<div class="mgts-head"><div class="mgts-eyebrow">Admin</div>`
    + `<button type="button" class="mgts-done" data-mgad="close">Done</button></div>`
    + `<div class="mgad-shn">${escapeHTML(name)}</div>`
    + `<div class="mgad-she">${escapeHTML(seat ? (seat.email || '') : '')}</div>`
    + `<button type="button" class="pk-danger" data-mgad="remove">Remove admin</button>`
    + `<div class="mgr-fnote">They keep their account — this just turns off their admin access.</div>`
    + `</div>`;
  document.body.appendChild(scrim);
  scrim.addEventListener('click', (ev) => {
    if (ev.target === scrim) { closeMgAdminSheet(); return; } // backdrop tap dismisses
    const r = ev.target.closest('[data-mgad]');
    if (!r) return;
    const role = r.getAttribute('data-mgad');
    if (role === 'close') { closeMgAdminSheet(); return; }
    if (role === 'remove') { void mgAdminRemove(email); return; }
  });
}
async function mgAdminRemove(email) {
  if (!state.masterAdminAuthenticated || !email) return;
  try { await tdbSetMemberRole(email, 'player'); }
  catch (err) { console.warn('mgAdminRemove', err); }
  closeMgAdminSheet();
  await loadAdminSeats();
}

// Persist the pickup-day form (insert a new row or update the edited one), then return to the list.
async function savePickupDay() {
  const dateEl = document.getElementById('pk-date');
  const timeEl = document.getElementById('pk-time');
  const locEl = document.getElementById('pk-location');
  const msgEl = document.getElementById('pk-msg');
  const day = dateEl ? String(dateEl.value || '').trim() : '';
  const time_label = timeEl ? String(timeEl.value || '').trim() : '';
  const location = locEl ? String(locEl.value || '').trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) { if (msgEl) msgEl.textContent = 'Pick a date first.'; return; }
  if (!supabaseClient) { if (msgEl) msgEl.textContent = 'No connection — try again in a moment.'; return; }
  const payload = { day, time_label: time_label || null, location: location || null };
  try {
    const q = pickupEditId
      ? supabaseClient.from('pickup_days').update(payload).eq('id', pickupEditId)
      : supabaseClient.from('pickup_days').insert(payload);
    const { error } = await q;
    if (error) throw error;
    await loadPickupDays();
    pickupEditId = null;
    manageView = 'pickup';
    repaintManage();
  } catch (err) {
    console.warn('savePickupDay error', err);
    if (msgEl) msgEl.textContent = 'Could not save — check the connection and try again.';
  }
}

// Remove a pickup day (its date stops opening Check In). Confirm first (destructive).
async function removePickupDay(id) {
  if (!id) return;
  const ok = await appConfirm({
    title: 'Remove this pickup day?',
    message: 'Its date will no longer open the Check In tab.',
    confirmText: 'Remove',
    danger: true
  });
  if (!ok) return;
  if (supabaseClient) {
    try {
      const { error } = await supabaseClient.from('pickup_days').delete().eq('id', id);
      if (error) throw error;
    } catch (err) { console.warn('removePickupDay error', err); }
  }
  await loadPickupDays();
  pickupEditId = null;
  manageView = 'pickup';
  repaintManage();
}

// ── Task 3: Players directory (session-10 pick R4-B) — one A–Z directory ─────────────────────────────
// Mockup r10-manage/l-b. Reuses the manage-area chrome (pd-pagehdr/pd-back/pd-htitle) + MG_CHEV; the mgp-*
// kit carries the search box, meta line, A–Z rows, IN tag, admin-only skill, Select(bulk) bar + group
// manager. Tap a row → the EXISTING openPlayerEditPopup (body-level modal, poll-clobber-immune). Skill is
// ADMIN-ONLY data (never on a public surface). NO initials bubbles anywhere.
const MGP_SEARCH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>';
const MGP_CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

// Admin skill glyph: a positive rating renders one-decimal; unrated (0/blank) is a faint en-dash, never "0.0".
function mgpSkillText(skill) {
  const n = Number(skill);
  return (Number.isFinite(n) && n > 0) ? n.toFixed(1) : '–';
}

// The players currently selected in Select mode, resolved from mgSelected (identity keys) to live rows.
function mgSelectedPlayers() {
  return (state.players || []).filter((p) => mgSelected.has(playerIdentityKey(p)));
}

// The A–Z list body (id="mgp-list"): filtered by the live query, sorted, letter-anchored. A search MISS
// (query set, zero rows) shows the dashed "Add <typed> as a new player" row. Re-rendered on its own on every
// keystroke (the search input above it is never touched — no focus/caret loss). The IN tag is a LABEL, never
// a dot; skill is right-aligned accent; no initials bubbles.
function buildMgpListHTML() {
  const q = String(mgPlayerQuery || '').trim();
  const qLower = q.toLowerCase();
  const inSet = new Set(state.checkedIn || []);
  let list = (state.players || []).filter((p) => p && p.name);
  if (qLower) list = list.filter((p) => String(p.name).toLowerCase().includes(qLower));
  list = list.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' }));

  if (!list.length) {
    if (q) {
      return `<button type="button" class="mgp-add" data-mgp-add="${escapeHTMLText(q)}">`
        + `${PK_PLUS_SVG}Add &ldquo;${escapeHTML(q)}&rdquo; as a new player</button>`;
    }
    return `<div class="mgp-empty">No players on the roster yet.</div>`;
  }

  let lastLetter = '';
  return list.map((p) => {
    const key = playerIdentityKey(p);
    const nm = String(p.name);
    const first = (nm.trim()[0] || '').toUpperCase();
    const letter = /[A-Z]/.test(first) ? first : '#';
    const anchor = letter !== lastLetter ? letter : '';
    lastLetter = letter;
    const grp = getPlayerPrimaryGroup(p);
    const gpHTML = grp ? `<span class="mgp-gp">${escapeHTML(grp)}</span>` : '';
    const inHTML = inSet.has(key) ? `<span class="mgp-in">IN</span>` : '';
    const skPos = Number(p.skill) > 0;
    const skHTML = `<span class="mgp-sk${skPos ? '' : ' n'}">${mgpSkillText(p.skill)}</span>`;
    const cb = mgSelectMode ? `<span class="mgp-cb">${MGP_CHECK_SVG}</span>` : '';
    const on = (mgSelectMode && mgSelected.has(key)) ? ' on' : '';
    const nameHTML = qLower ? highlightMatch(nm, q) : escapeHTML(nm);
    return `<a class="mgp-row${on}" data-mgp-id="${escapeHTMLText(key)}">`
      + `${cb}<span class="mgp-al">${anchor}</span>`
      + `<span class="mgp-pn">${nameHTML}${gpHTML}</span>`
      + `${inHTML}${skHTML}</a>`;
  }).join('');
}

// The inline group manager (flat, under the meta) — opened from the meta group count. Reuses the group
// catalog helpers (ensure/rename/delete). Rename toggles a per-row inline input via mgRenameGroup.
function buildMgpGroupsHTML() {
  const groups = getAvailableGroups();
  const rows = groups.length
    ? groups.map((g) => {
        if (mgRenameGroup && normalizeGroupKey(mgRenameGroup) === normalizeGroupKey(g)) {
          return `<div class="mgp-grow"><input class="mgp-grn" id="mgp-grename-input" type="text" value="${escapeHTMLText(g)}" autocomplete="off" />`
            + `<button type="button" class="mgp-gact" data-mgp-grename-save="${escapeHTMLText(g)}">Save</button>`
            + `<button type="button" class="mgp-gact" data-mgp-grename-cancel>Cancel</button></div>`;
        }
        return `<div class="mgp-grow"><span class="mgp-gname">${escapeHTML(g)}</span>`
          + `<button type="button" class="mgp-gact" data-mgp-grename="${escapeHTMLText(g)}">Rename</button>`
          + `<button type="button" class="mgp-gact del" data-mgp-gdelete="${escapeHTMLText(g)}">Delete</button></div>`;
      }).join('')
    : `<div class="mgp-gempty">No groups yet.</div>`;
  return `<div class="mgp-grp"><div class="mgp-glabel">Groups</div>${rows}`
    + `<div class="mgp-gadd"><input id="mgp-gadd-input" type="text" placeholder="New group name" autocomplete="off" />`
    + `<button type="button" data-mgp-gadd>Add</button></div></div>`;
}

// The Players directory view (mockup l-b): header + Select toggle, search box, meta line, optional group
// manager, the A–Z list, and (in Select mode) the bottom action bar.
function buildManagePlayersHTML() {
  const roster = (state.players || []).length;
  const inNow = (state.checkedIn || []).length;
  const groupCount = getAvailableGroups().length;

  const header = `<div class="pd-pagehdr">`
    + `<button type="button" class="pd-back" data-mg-area="lead" aria-label="Back to Manage">${PK_BACK_SVG}</button>`
    + `<div class="pd-htitle">Players</div>`
    + `<button type="button" class="mgp-selbtn" data-mgp-select>${mgSelectMode ? 'Cancel' : 'Select'}</button>`
    + `</div>`;

  const search = `<div class="mgp-srch">${MGP_SEARCH_SVG}`
    + `<input id="mg-player-search" type="text" placeholder="Search or add a player" value="${escapeHTMLText(mgPlayerQuery)}" `
    + `autocomplete="off" autocapitalize="words" spellcheck="false" aria-label="Search players" /></div>`;

  const meta = `<div class="mgp-meta">`
    + `<span class="mgp-m"><b>${roster}</b> ${roster === 1 ? 'player' : 'players'}</span>`
    + `<span class="mgp-m"><b>${inNow}</b> checked in</span>`
    + `<button type="button" class="mgp-m mgp-mg${mgGroupsOpen ? ' on' : ''}" data-mgp-groups><b>${groupCount}</b> ${groupCount === 1 ? 'group' : 'groups'}</button>`
    + `</div>`;

  const groupsSection = mgGroupsOpen ? buildMgpGroupsHTML() : '';
  const listSection = `<div id="mgp-list">${buildMgpListHTML()}</div>`;

  // Select-mode bottom bar (fixed above the nav). "Move to group" reveals a chip row of destination groups.
  let bar = '';
  if (mgSelectMode) {
    const moveChips = mgMoveOpen
      ? (getAvailableGroups().length
          ? `<div class="mgp-movebar">${getAvailableGroups().map((g) => `<button type="button" class="mgp-movechip" data-mgp-movegrp="${escapeHTMLText(g)}">${escapeHTML(g)}</button>`).join('')}</div>`
          : `<div class="mgp-movebar mgp-movehint">Add a group first (tap the group count above)</div>`)
      : '';
    bar = moveChips + `<div class="mgp-bar">`
      + `<button type="button" class="pri" data-mgp-bulk="in">Check in</button>`
      + `<button type="button" data-mgp-bulk="out">Check out</button>`
      + `<button type="button" data-mgp-bulk="move">Move to group</button>`
      + `<button type="button" class="mut" data-mgp-bulk="cancel">Cancel</button>`
      + `</div>`;
  }

  return header + search + meta + groupsSection + listSection + bar;
}

// Bulk check-in / check-out over the Select-mode selection. Optimistic locally, then the per-id
// check_in/check_out SECURITY DEFINER RPC loop (the ONLY writer that maintains the check_ins history table —
// same contract as the kiosk + the old bulk bar). Check-OUT confirms first (the 44→0 footgun class).
async function mgpBulkAttendance(shouldCheckIn) {
  const targets = mgSelectedPlayers();
  if (!targets.length) return;
  if (!shouldCheckIn) {
    const ok = await appConfirm({
      title: `Check out ${targets.length} player${targets.length === 1 ? '' : 's'}?`,
      message: 'They drop off the checked-in list.',
      confirmText: 'Check out',
      danger: true
    });
    if (!ok) return;
  }
  const remoteIds = [];
  targets.forEach((p) => {
    if (shouldCheckIn) checkInPlayer(p); else checkOutPlayer(p);
    if (p.id) remoteIds.push(p.id);
  });
  saveLocal();
  mgSelectMode = false; mgSelected = new Set(); mgMoveOpen = false;
  repaintManage();
  if (supabaseClient && remoteIds.length) {
    try {
      for (const id of remoteIds) {
        const { error } = await supabaseClient.rpc(shouldCheckIn ? 'check_in' : 'check_out', { p_id: id });
        if (error) throw error;
      }
      queueSupabaseRefresh();
    } catch (err) {
      console.error(shouldCheckIn ? 'mgp bulk check-in error' : 'mgp bulk check-out error', err);
      await reconcileToSupabaseAuthority(shouldCheckIn ? 'mgp-bulk-check-in' : 'mgp-bulk-check-out');
    }
  }
}

// Bulk move the selection into a group (adds membership + promotes to primary), reusing
// updatePlayerFieldsSupabase per row + ensureGroupCatalogEntriesSupabase for the catalog.
async function mgpBulkGroup(dest) {
  const name = normalizeGroupName(dest);
  const targets = mgSelectedPlayers();
  if (!name || !targets.length) return;
  const idSet = new Set(targets.map((p) => playerIdentityKey(p)));
  const remoteUpdates = [];
  state.players = (state.players || []).map((p) => {
    if (!idSet.has(playerIdentityKey(p))) return p;
    const cur = getPlayerGroups(p);
    const next = normalizeGroupList([name, ...cur.filter((g) => g !== name)]);
    const primary = next[0] || '';
    const np = { ...p, group: primary, groups: next };
    if (np.id) remoteUpdates.push({ id: np.id, group: primary, groups: next });
    return np;
  });
  if (!(state.groups || []).includes(name)) state.groups = Array.from(new Set([...(state.groups || []), name]));
  saveLocal();
  mgSelectMode = false; mgSelected = new Set(); mgMoveOpen = false;
  repaintManage();
  if (supabaseClient) {
    let failed = false;
    try {
      await ensureGroupCatalogEntriesSupabase([name]);
      for (const u of remoteUpdates) {
        const ok = await updatePlayerFieldsSupabase(u.id, { group: u.group, groups: u.groups });
        if (!ok) failed = true;
      }
      const synced = await syncFromSupabase();
      if (!synced) failed = true;
    } catch (err) { failed = true; console.error('mgp bulk group error', err); }
    if (failed) await reconcileToSupabaseAuthority('mgp-bulk-group');
  }
}

// Add a brand-new player from the search-miss dashed row: a first+last name is required (mix-up prevention),
// duplicates are ignored, then the row is inserted (optimistic + Supabase) and the edit sheet opens to set
// skill/group. Mirrors the admin add insert (name + skill 0 + group).
async function mgpAddPlayer(rawName) {
  const name = String(rawName || '').trim();
  if (!name) return;
  if (!isValidFullName(name)) { appNotice({ title: 'Add a player', message: 'Enter a first and last name.' }); return; }
  const existing = (state.players || []).find((p) => normalize(p.name) === normalize(name));
  if (existing) { mgPlayerQuery = ''; repaintManage(); openPlayerEditPopup(playerIdentityKey(existing)); return; }
  const inserted = { name, skill: 0, group: '', groups: [], pending: true };
  state.players = [...(state.players || []), inserted];
  saveLocal();
  mgPlayerQuery = '';
  repaintManage();
  if (supabaseClient) {
    try {
      const insertRow = HAS_TAG ? { name, skill: 0, group: '', tag: '' } : { name, skill: 0, group: '' };
      const { data, error } = await supabaseClient.from('players').insert([insertRow]).select();
      if (error) throw error;
      if (Array.isArray(data) && data[0]) { inserted.id = data[0].id; inserted.pending = false; }
      queueSupabaseRefresh();
      repaintManage();
    } catch (err) {
      console.error('mgp add player error', err);
      await reconcileToSupabaseAuthority('mgp-add-player');
    }
  } else {
    inserted.pending = false;
  }
  const live = (state.players || []).find((p) => normalize(p.name) === normalize(name));
  if (live) openPlayerEditPopup(playerIdentityKey(live));
}

// Group manager writes (reuse the catalog helpers). Add reads the inline field; rename/delete operate on a
// named group and also fix player memberships locally so the roster stays consistent before the sync.
async function mgpAddGroup() {
  const inp = document.getElementById('mgp-gadd-input');
  const name = normalizeGroupName(inp ? inp.value : '');
  if (!name) return;
  if (!(state.groups || []).some((g) => normalizeGroupKey(g) === normalizeGroupKey(name))) {
    state.groups = ['All', ...normalizeGroupList([...(state.groups || []).filter((g) => g && g !== 'All'), name])];
  }
  saveLocal();
  if (inp) inp.value = '';
  repaintManage();
  if (supabaseClient) { try { await ensureGroupCatalogEntrySupabase(name); } catch (err) { console.error('mgp add group error', err); } }
}

async function mgpRenameGroupCommit(oldName) {
  const inp = document.getElementById('mgp-grename-input');
  const next = normalizeGroupName(inp ? inp.value : '');
  const old = normalizeGroupName(oldName);
  if (!old || !next) { mgRenameGroup = null; repaintManage(); return; }
  const oldKey = normalizeGroupKey(old);
  const nextKey = normalizeGroupKey(next);
  state.groups = ['All', ...normalizeGroupList((state.groups || [])
    .filter((g) => g && g !== 'All')
    .map((g) => (normalizeGroupKey(g) === oldKey ? next : g)))];
  state.players = (state.players || []).map((p) => {
    const gs = getPlayerGroups(p);
    if (!gs.some((g) => normalizeGroupKey(g) === oldKey)) return p;
    const ng = normalizeGroupList(gs.map((g) => (normalizeGroupKey(g) === oldKey ? next : g)));
    return { ...p, group: ng[0] || '', groups: ng };
  });
  saveLocal();
  mgRenameGroup = null;
  repaintManage();
  if (supabaseClient && oldKey !== nextKey) {
    try {
      await renameGroupCatalogEntrySupabase(old, next);
      const updates = (state.players || []).filter((p) => p.id).map((p) => ({ id: p.id, group: getPlayerPrimaryGroup(p), groups: getPlayerGroups(p) }));
      for (const u of updates) await updatePlayerFieldsSupabase(u.id, { group: u.group, groups: u.groups });
      await syncFromSupabase();
    } catch (err) { console.error('mgp rename group error', err); await reconcileToSupabaseAuthority('mgp-rename-group'); }
  }
}

async function mgpDeleteGroup(groupName) {
  const name = normalizeGroupName(groupName);
  if (!name) return;
  const ok = await appConfirm({
    title: `Delete group "${name}"?`,
    message: 'It is removed from every player. This cannot be auto-undone.',
    confirmText: 'Delete',
    danger: true
  });
  if (!ok) return;
  const key = normalizeGroupKey(name);
  state.groups = ['All', ...normalizeGroupList((state.groups || []).filter((g) => g && g !== 'All' && normalizeGroupKey(g) !== key))];
  state.players = (state.players || []).map((p) => {
    const gs = getPlayerGroups(p);
    if (!gs.some((g) => normalizeGroupKey(g) === key)) return p;
    const ng = gs.filter((g) => normalizeGroupKey(g) !== key);
    return { ...p, group: ng[0] || '', groups: ng };
  });
  saveLocal();
  repaintManage();
  if (supabaseClient) {
    try {
      await deleteGroupCatalogEntrySupabase(name);
      const updates = (state.players || []).filter((p) => p.id).map((p) => ({ id: p.id, group: getPlayerPrimaryGroup(p), groups: getPlayerGroups(p) }));
      for (const u of updates) await updatePlayerFieldsSupabase(u.id, { group: u.group, groups: u.groups });
      await syncFromSupabase();
    } catch (err) { console.error('mgp delete group error', err); await reconcileToSupabaseAuthority('mgp-delete-group'); }
  }
}

// ── Task 4: Teams page (session-10 pick R5 TRIMMED) — chips + generate + stacked teams ───────────────
// Mockup r10-manage/k-h1. Reuses the manage-area chrome (pd-pagehdr/pd-back/pd-htitle) + pl-sect labels +
// the pl-tab chip grammar; the mgt-* kit carries the CTA / stacked team rows / swap sheet. MAKE TEAMS ·
// N CHECKED IN (size chips 2/3/4/6, 4s default) → Generate balanced teams (reuses generateBalancedGroups) →
// TODAY'S TEAMS (TEAM n label + names STACKED one per line, faint hairlines). Tap a name → a swap sheet
// listing the OTHER teams; tapping one reuses the drag-drop mutation moveGeneratedPlayerBetweenTeams. The
// casual live-courts board is CUT (Mike): no net cards, no report/clear result, skills change by admin edit
// only. Team persistence rides the normal saveLocal → queueLiveStateSave path (courts stripped from it).
function buildManageTeamsHTML() {
  const inNow = (state.checkedIn || []).length;
  const teams = Array.isArray(state.generatedTeams) ? state.generatedTeams : [];

  const header = `<div class="pd-pagehdr">`
    + `<button type="button" class="pd-back" data-mg-area="lead" aria-label="Back to Manage">${PK_BACK_SVG}</button>`
    + `<div class="pd-htitle">Teams</div></div>`;

  // MAKE TEAMS — size chips (pl-tab grammar; 4s default) + the Generate CTA. Chip just SELECTS the size;
  // the CTA generates from the checked-in players.
  const chips = `<div class="pl-tabs mgt-chips">`
    + [2, 3, 4, 6].map((s) => `<button type="button" class="pl-tab${s === mgtSize ? ' pl-on' : ''}" data-mgt-size="${s}">${s}s</button>`).join('')
    + `</div>`;
  const makeSect = `<div class="pl-sect">Make teams · ${inNow} checked in</div>`
    + chips
    + `<button type="button" class="mgt-cta" data-mgt-generate>Generate balanced teams</button>`;

  // TODAY'S TEAMS — omitted entirely until teams exist. Names STACKED one per line; each name is tappable
  // (carries its identity key + current team index) to open the swap sheet. Never "tonight" (§ style rule).
  let teamsSect;
  if (teams.length) {
    const rows = teams.map((team, idx) => {
      const names = (Array.isArray(team) ? team : []).map((p) => {
        const key = playerIdentityKey(p);
        return `<div class="mgt-nm" data-mgt-swap="${escapeHTMLText(key)}" data-mgt-from="${idx}">${escapeHTML(String((p && p.name) || 'Player'))}</div>`;
      }).join('');
      return `<div class="mgt-trow"><span class="mgt-tt">TEAM ${idx + 1}</span><div class="mgt-names">${names}</div></div>`;
    }).join('');
    teamsSect = `<div class="pl-sect">Today's teams</div>${rows}`
      + `<div class="mgt-note">Tap a name to swap players between teams · regenerate any time</div>`;
  } else {
    teamsSect = `<div class="mgt-empty">No teams yet — pick a size and generate.</div>`;
  }

  return header + makeSect + teamsSect + buildMgtSwapSheetHTML();
}

// The swap sheet (module-var gated so it survives the container-swap repaint). Lists the OTHER teams as
// destinations; a tap reuses moveGeneratedPlayerBetweenTeams (simple move when uneven, auto-swap when even).
function buildMgtSwapSheetHTML() {
  if (mgtSwapKey == null || mgtSwapFrom == null) return '';
  const teams = Array.isArray(state.generatedTeams) ? state.generatedTeams : [];
  const from = Number(mgtSwapFrom);
  const fromTeam = teams[from];
  if (!Array.isArray(fromTeam)) return '';
  const player = fromTeam.find((p) => playerIdentityKey(p) === mgtSwapKey);
  const name = (player && player.name) ? String(player.name) : 'this player';
  const dests = teams.map((team, idx) => ({ team, idx }))
    .filter((x) => x.idx !== from)
    .map((x) => {
      const preview = (Array.isArray(x.team) ? x.team : [])
        .map((p) => escapeHTML(String((p && p.name) || ''))).filter(Boolean).join(', ');
      return `<button type="button" class="mgt-to" data-mgt-to="${x.idx}"><span class="mgt-to-t">TEAM ${x.idx + 1}</span><span class="mgt-to-r">${preview}</span></button>`;
    }).join('');
  return `<div class="mgt-sheet-backdrop" data-mgt-cancel></div>`
    + `<div class="mgt-sheet" role="dialog" aria-label="Swap player">`
    + `<div class="mgt-sheet-h">Move ${escapeHTML(name)}</div>`
    + `<div class="mgt-sheet-sub">Pick a team — even sizes swap the closest player back.</div>`
    + (dests || `<div class="mgt-empty">No other team to move to yet.</div>`)
    + `<button type="button" class="mgt-cancel" data-mgt-cancel>Cancel</button></div>`;
}

// Generate balanced teams from the checked-in players at the selected size (reuses generateBalancedGroups +
// the groupCount/lastTeamSize chip state). Team count = floor(checked-in / size), min 2; remainders ride
// along per the balancer. Persists via saveLocal (→ queueLiveStateSave, teams only) + a partial repaint.
function mgtGenerateTeams() {
  const size = Number(mgtSize) || 4;
  const inNow = (state.checkedIn || []).length;
  const numTeams = Math.max(2, Math.floor(inNow / size));
  const gen = generateBalancedGroups(state.players, state.checkedIn, numTeams, state.generatedTeams);
  state.generatedTeams = gen.teams;
  state.generatedTeamsSummary = gen.summary;
  state.groupCount = numTeams;
  state.lastTeamSize = size;
  state.liveCourtOrder = defaultLiveCourtOrder(gen.teams.length); // kept coherent for the dormant old shell
  state.liveMatchResults = {};
  state.liveMatchSkillSnapshots = {};
  mgtSwapKey = null; mgtSwapFrom = null;
  saveLocal();
  repaintManage();
}

// Apply the open swap: move the swapped player onto the tapped team (reuses the drag-drop mutation), persist,
// close the sheet, repaint.
function mgtApplySwap(toTeamIndex) {
  if (mgtSwapKey == null || mgtSwapFrom == null) return;
  const result = moveGeneratedPlayerBetweenTeams(Number(mgtSwapFrom), Number(toTeamIndex), mgtSwapKey);
  mgtSwapKey = null; mgtSwapFrom = null;
  if (result && result.changed) saveLocal();
  repaintManage();
}

// ── Task 5: Tournament sub-hub (session-10 pick R2) + Registration (pick R7) ─────────────────────────
// Mockups r10-manage/t-b (sub-hub) + r-b (registration). The sub-hub reuses the mg-row grammar (extend,
// don't duplicate) with a data-mgt-view delegate; the header + stage sub-line are the mgt-* additions. The
// Registration view leads with an EDITABLE announcement textarea, a Copy-for-GroupMe CTA, the Registration-
// open switch (mg-sw pill → the existing tv2-toggle-registration write path), and venmo/buy-in/team-size
// fields (pk-fld underline grammar, save-on-blur via tdbSetTournamentFields). The lead tournament is the T1
// resolver (manageLeadTournament); the announcement TOLERATES tournaments.announcement not existing yet.

// The default GroupMe announcement composed from the tournament's real fields (buy_in optional). Used when
// tournaments.announcement is null/undefined — INCLUDING before migration 0047 lands (the column simply
// reads as undefined), so the Registration view always renders a sensible editable draft.
function mgDefaultAnnouncement(t) {
  const name = (t && t.name && String(t.name).trim()) ? String(t.name).trim() : 'The tournament';
  const size = Number(t && t.team_size) || 4;
  const buyIn = (t && t.buy_in != null && String(t.buy_in).trim()) ? String(t.buy_in).trim() : '';
  const mid = buyIn ? `${buyIn}, ${size}s co-ed` : `${size}s co-ed`;
  return `${name} — registration is open! ${mid}. Register at athletic-specimen.com`;
}
// The announcement to prefill: the persisted value when set (post-0047), else the composed default. Tolerant
// of the column not existing yet (t.announcement === undefined → default; never renders the string "undefined").
function mgAnnouncementValue(t) {
  const a = t && t.announcement;
  return (typeof a === 'string' && a.trim()) ? a : mgDefaultAnnouncement(t);
}

// The muted stage sub-line under the sub-hub title, by tournament status.
const MGT_STAGE_SUBLINE = { setup: 'Setup · registration phase', pools: 'Pool play', bracket: 'Bracket', completed: 'Completed' };
const MGT_SUB_TITLES = { registration: 'Registration', teams: 'Teams & payment', pools: 'Pools & schedule', bracket: 'Bracket & scores', settings: 'Event settings', rules: 'Rules sheet', closeout: 'Close out' };

// One sub-hub row. Mirrors mgRowHTML but carries data-mgt-view (opens a tournament sub-view) instead of
// data-mg-area. subHTML is emitted RAW — callers pre-escape any user-derived content.
function mgtRowHTML(view, name, subHTML) {
  return `<a class="mg-row" data-mgt-view="${view}">
      <div class="mg-rb"><div class="mg-rn">${name}</div><div class="mg-rs">${subHTML}</div></div>
      ${MG_CHEV}
    </a>`;
}

// The plain sub-hub (mockup t-b): header (back-to-Manage + the active tournament name, Barlow 22 via
// pd-htitle) + a muted stage sub-line + SEVEN status-inline rows. No cards, no inline controls at this level.
function buildManageTournamentHTML() {
  const t = mgActiveTournament();
  const header = `<div class="pd-pagehdr">`
    + `<button type="button" class="pd-back" data-mg-area="lead" aria-label="Back to Manage">${PK_BACK_SVG}</button>`
    + `<div class="pd-htitle">${escapeHTML(t ? (t.name || 'Tournament') : 'Tournament')}</div></div>`;
  if (!t) {
    return header + `<div class="pd-empty">No tournament yet — create one from <b>Open the old admin</b> on the Manage screen. A create-tournament screen lands in a later slice.</div>`;
  }
  const teams = state.tournamentTeams || [];
  const nTeams = teams.length;
  const unpaid = teams.filter((x) => !x.paid).length;
  const stage = MGT_STAGE_SUBLINE[t.status] || MGT_STAGE_SUBLINE.setup;
  const regSub = t.registration_open
    ? `<span class="mgt-on">Open</span> · ${nTeams} team${nTeams === 1 ? '' : 's'} · close it when full`
    : 'Closed';
  const teamsSub = `${nTeams} registered · ${unpaid ? unpaid + ' unpaid' : 'all paid'}`;
  const poolsSub = t.status === 'setup' ? 'Not drawn yet' : (t.status === 'pools' ? 'Pool play underway' : 'Pools complete');
  const bracketSub = t.status === 'bracket' ? 'Bracket underway' : (t.status === 'completed' ? 'Complete' : 'After pool play');
  const size = Number(t.team_size) || 4;
  const buyIn = (t.buy_in != null && String(t.buy_in).trim()) ? String(t.buy_in).trim() : '';
  const settingsSub = `${size}s co-ed${buyIn ? ' · ' + escapeHTML(buyIn) : ''} · scoring targets &amp; caps`;
  const rows = mgtRowHTML('registration', 'Registration', regSub)
    + mgtRowHTML('teams', 'Teams &amp; payment', teamsSub)
    + mgtRowHTML('pools', 'Pools &amp; schedule', poolsSub)
    + mgtRowHTML('bracket', 'Bracket &amp; scores', bracketSub)
    + mgtRowHTML('settings', 'Event settings', settingsSub)
    + mgtRowHTML('rules', 'Rules sheet', 'Edit what players read on the Rules page')
    + mgtRowHTML('closeout', 'Close out', 'End the tournament · crown the champion');
  return header + `<div class="mgt-stage">${escapeHTML(stage)}</div>` + rows;
}

// The Registration view (mockup r-b): THE ANNOUNCEMENT (editable textarea prefilled from the persisted value
// or the composed default) + Copy for GroupMe + CONTROLS (the Registration-open switch + venmo/buy-in/team-
// size fields). The switch/copy act via the click delegate; the fields save on blur (focusout delegate).
function buildMgRegistrationHTML() {
  const t = mgActiveTournament();
  const header = `<div class="pd-pagehdr">`
    + `<button type="button" class="pd-back" data-mgt-back aria-label="Back to Tournament">${PK_BACK_SVG}</button>`
    + `<div class="pd-htitle">Registration</div></div>`;
  if (!t) {
    return header + `<div class="pd-empty">No tournament to manage registration for yet.</div>`;
  }
  const teams = state.tournamentTeams || [];
  const nTeams = teams.length;
  const paid = teams.filter((x) => x.paid).length;
  const ann = mgAnnouncementValue(t);
  const open = !!t.registration_open;
  const venmo = t.venmo_link == null ? '' : String(t.venmo_link);
  const buyin = t.buy_in == null ? '' : String(t.buy_in);
  const size = Number(t.team_size) || 4;
  const venmoNote = /^https?:\/\//i.test(venmo)
    ? 'Players pay on Venmo when they register'
    : 'Venmo missing — the pay button says "coming soon"';
  return header
    + `<div class="pl-sect">The announcement</div>`
    + `<textarea class="mgr-ann" id="mgr-ann" rows="4" data-mgr-initial="${escapeHTMLText(ann)}" aria-label="Registration announcement">${escapeHTML(ann)}</textarea>`
    + `<button type="button" class="mgr-cta" data-mgr-copy>Copy for GroupMe</button>`
    + `<p class="mgr-status" id="mgr-ann-status" role="status" aria-live="polite"></p>`
    + `<div class="pl-sect">Controls</div>`
    + `<div class="mgr-tog"><div class="mg-rb"><div class="mg-rn">Registration open</div>`
      + `<div class="mg-rs">${nTeams} team${nTeams === 1 ? '' : 's'} in · ${paid} paid</div></div>`
      + `<button type="button" class="mg-sw${open ? ' on' : ''}" data-mgr-regtoggle role="switch" aria-checked="${open ? 'true' : 'false'}" aria-label="Registration open"></button></div>`
    + `<div class="pk-fld"><label class="pk-fl" for="mgr-venmo">Venmo link</label>`
      + `<input class="pk-fv" id="mgr-venmo" type="text" inputmode="url" autocomplete="off" placeholder="https://venmo.com/u/yourname" value="${escapeHTMLText(venmo)}" /></div>`
    + `<div class="mgr-fnote">${escapeHTML(venmoNote)}</div>`
    + `<div class="pk-fld"><label class="pk-fl" for="mgr-buyin">Buy-in</label>`
      + `<input class="pk-fv" id="mgr-buyin" type="text" autocomplete="off" placeholder="$80 per team" value="${escapeHTMLText(buyin)}" /></div>`
    + `<div class="pk-fld"><label class="pk-fl" for="mgr-teamsize">Team size</label>`
      + `<input class="pk-fv" id="mgr-teamsize" type="number" min="1" inputmode="numeric" value="${escapeHTMLText(String(size))}" /></div>`;
}

// A tournament sub-view placeholder (Tasks 6-10 fill these). Its back button returns to the SUB-HUB
// (data-mgt-back), never straight to the Manage lead.
function mgtSubPlaceholderHTML(view) {
  const title = MGT_SUB_TITLES[view] || 'Tournament';
  return `<div class="pd-pagehdr">`
    + `<button type="button" class="pd-back" data-mgt-back aria-label="Back to Tournament">${PK_BACK_SVG}</button>`
    + `<div class="pd-htitle">${escapeHTML(title)}</div></div>`
    + `<div class="pd-empty">Coming in the next slices.</div>`;
}

// manageView==='tournament' dispatch: null mgtView → the sub-hub; 'registration' → the built view; any other
// sub-view id → an honest placeholder.
function buildManageTournamentContainerHTML() {
  if (mgtView === 'registration') return buildMgRegistrationHTML();
  if (mgtView === 'teams') return buildMgTeamsHTML();
  if (mgtView === 'pools') return buildMgPoolsHTML();
  if (mgtView === 'bracket') return buildMgBracketHTML();
  if (mgtView === 'settings') return buildMgSettingsHTML();
  if (mgtView === 'rules') return buildMgRulesHTML();
  if (mgtView === 'closeout') return buildMgCloseoutHTML();
  if (mgtView) return mgtSubPlaceholderHTML(mgtView);
  return buildManageTournamentHTML();
}

// The tournament the Registration view reads/writes (same resolver as the sub-hub header).
function mgRegTournament() { return mgActiveTournament(); }

// True when the Registration view has an in-progress edit the background poll must not clobber: a focused
// input/textarea inside #tab-manage, or an announcement textarea whose value differs from what was last
// rendered/saved (its data-mgr-initial). Extends the Task 2/3 dirty-guard pattern for manageView==='tournament'
// + mgtView==='registration'.
function manageRegDirty() {
  const panel = document.getElementById('tab-manage');
  if (!panel) return false;
  const ae = document.activeElement;
  if (ae && panel.contains(ae) && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT')) return true;
  const ta = document.getElementById('mgr-ann');
  if (ta && typeof ta.value === 'string' && ta.value !== (ta.getAttribute('data-mgr-initial') || '')) return true;
  return false;
}

// Copy the CURRENT announcement textarea value to the clipboard (mutating the CTA label as the confirm
// affordance — the house copy pattern, cf. tv2-share-registration + showCheckinToast's timed restore).
async function mgrCopyAnnouncement(btn) {
  const ta = document.getElementById('mgr-ann');
  const text = ta ? String(ta.value == null ? '' : ta.value) : '';
  try {
    await navigator.clipboard.writeText(text);
    if (btn) btn.textContent = 'Copied for GroupMe!';
  } catch (_) {
    if (btn) btn.textContent = 'Long-press the text to copy';
  }
  clearTimeout(mgrCopyAnnouncement._t);
  mgrCopyAnnouncement._t = setTimeout(() => {
    const b = document.querySelector('[data-mgr-copy]');
    if (b) b.textContent = 'Copy for GroupMe';
  }, 2200);
}

// Toggle registration open/closed — reuses the exact tv2-toggle-registration write (tdbSetTournamentFields +
// tdbRefreshTournaments), then a container-swap repaint (the switch is a button; no text input is focused).
async function mgrToggleRegistration() {
  const t = mgRegTournament();
  if (!t || !state.isAdmin) return;
  try {
    await tdbSetTournamentFields(t.id, { registration_open: !t.registration_open });
    await tdbRefreshTournaments();
    repaintManage();
  } catch (err) { console.warn('mgrToggleRegistration', err); }
}

// Save the announcement on blur — writes tournaments.announcement (0047) only when it actually changed from
// what we rendered. Tolerant of the column being absent pre-migration (the write throws → friendly status,
// no crash). Does NOT repaint (blur already left the field; a repaint would rebuild the textarea).
async function mgrSaveAnnouncement(ta) {
  const t = mgRegTournament();
  if (!t || !ta) return;
  const val = String(ta.value == null ? '' : ta.value);
  const status = document.getElementById('mgr-ann-status');
  if (val === (ta.getAttribute('data-mgr-initial') || '')) return; // unchanged → no write
  try {
    await tdbSetTournamentFields(t.id, { announcement: val });
    ta.setAttribute('data-mgr-initial', val);
    await tdbRefreshTournaments();
    if (status) status.textContent = 'Saved';
  } catch (err) {
    console.warn('mgrSaveAnnouncement', err);
    if (status) status.textContent = 'Could not save — check the connection and try again.';
  }
}

// Save a venmo/buy-in/team-size field on blur. venmo keeps the EXISTING behavior (store as-typed or null; the
// public pay button already guards to http(s)-only at render — rf-venmo — so no stricter validation is added,
// matching tv2-save-registration). team-size must be a positive integer or the field reverts (no write). No
// repaint (blur already left the field; the counts/switch don't depend on these values).
async function mgrSaveField(id) {
  const t = mgRegTournament();
  if (!t) return;
  const el = document.getElementById(id);
  if (!el) return;
  const raw = String(el.value == null ? '' : el.value).trim();
  let fields = null;
  if (id === 'mgr-venmo') {
    const cur = t.venmo_link == null ? '' : String(t.venmo_link);
    if (raw === cur) return;
    fields = { venmo_link: raw || null };
  } else if (id === 'mgr-buyin') {
    const cur = t.buy_in == null ? '' : String(t.buy_in);
    if (raw === cur) return;
    fields = { buy_in: raw || null };
  } else if (id === 'mgr-teamsize') {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1) { el.value = String(Number(t.team_size) || 4); return; } // invalid → revert
    if (n === (Number(t.team_size) || 4)) return;
    fields = { team_size: n };
  }
  if (!fields) return;
  try {
    await tdbSetTournamentFields(t.id, fields);
    await tdbRefreshTournaments();
  } catch (err) { console.warn('mgrSaveField', err); }
}

// ── Task 9: Event settings (session-10 pick R11) + Rules sheet (pick R11b) ───────────────────────────
// Mockups r10-manage/es-b (all-knobs-flat, two-across pairs) + ru-d (one-sheet rules editor). EVERY knob is
// flat and editable with NO locking (Mike declined guard rails — R11); the destructive redraw/reset live in
// the Pools/Bracket views, not here. Text/number fields save on BLUR through tdbSetTournamentFields (the
// focusout delegate → mgSaveSettingsField); the two booleans (win_by_2 / grand_final_reset) render as mg-sw
// switches and save on TOGGLE (mgToggleSettingsField). Numeric parses are defensive: a blank/NaN entry
// reverts the field + a quiet note, and leaves the column unchanged (no crash). Column names are the REAL
// tournaments.* columns (recon map §4): name, team_size, net_count, pool_target, pool_cap, bracket_target
// (+ match_cap kept in lockstep for NF-1 back-compat), bracket_cap, win_by_2, grand_final_reset, buy_in
// (TEXT). net_count is the ONE field that still routes through the ATOMIC re-net (migration 0031 /
// apply_net_count_change) when a tournament is mid pools/bracket — a plain write there would drift
// matches.net from net_count (the closed F7/F8 bug class); this keeps that invariant with no added lock.
function mgSettingsTournament() { return mgActiveTournament(); }

function buildMgSettingsHTML() {
  const t = mgSettingsTournament();
  const header = `<div class="pd-pagehdr">`
    + `<button type="button" class="pd-back" data-mgt-back aria-label="Back to Tournament">${PK_BACK_SVG}</button>`
    + `<div class="pd-htitle">Event settings</div></div>`;
  if (!t) return header + `<div class="pd-empty">No tournament to edit settings for yet.</div>`;
  const numFld = (id, label, val) =>
    `<div class="pk-fld"><label class="pk-fl" for="${id}">${label}</label>`
    + `<input class="pk-fv" id="${id}" type="number" min="1" inputmode="numeric" value="${escapeHTMLText(val == null ? '' : String(val))}" /></div>`;
  const swFld = (field, label, on) =>
    `<div class="pk-fld mges-swfield"><span class="pk-fl">${escapeHTML(label)}</span>`
    + `<button type="button" class="mg-sw${on ? ' on' : ''}" data-mges-toggle="${field}" role="switch" aria-checked="${on ? 'true' : 'false'}" aria-label="${escapeHTML(label)}"></button></div>`;
  const bracketTo = (t.bracket_target != null ? t.bracket_target : t.match_cap);
  const winBy2 = (t.win_by_2 == null || !!t.win_by_2); // default on (matches the create/modal contract)
  return header
    + `<div class="pk-fld"><label class="pk-fl" for="mges-name">Tournament name</label>`
      + `<input class="pk-fv" id="mges-name" type="text" autocomplete="off" autocapitalize="words" value="${escapeHTMLText(t.name == null ? '' : String(t.name))}" /></div>`
    + `<div class="mges-half">${numFld('mges-teamsize', 'Team size', t.team_size)}${numFld('mges-nets', 'Nets', t.net_count)}</div>`
    + `<div class="mges-half">${numFld('mges-pooltarget', 'Pool to', t.pool_target)}${numFld('mges-poolcap', 'Pool cap', t.pool_cap)}</div>`
    + `<div class="mges-half">${numFld('mges-brackettarget', 'Bracket to', bracketTo)}${numFld('mges-bracketcap', 'Bracket cap', t.bracket_cap)}</div>`
    + `<div class="mges-half">${swFld('win_by_2', 'Win by 2', winBy2)}${swFld('grand_final_reset', 'Grand final reset', !!t.grand_final_reset)}</div>`
    + `<div class="pk-fld"><label class="pk-fl" for="mges-buyin">Buy-in</label>`
      + `<input class="pk-fv" id="mges-buyin" type="text" autocomplete="off" placeholder="$80 a team" value="${escapeHTMLText(t.buy_in == null ? '' : String(t.buy_in))}" /></div>`
    + `<p class="mgr-status" id="mges-status" role="status" aria-live="polite"></p>`;
}

// The Rules sheet editor (mockup ru-d): ONE textarea prefilled from tournaments.rules (the exact markdown-
// lite text the public Rules page renders through rulesToHTML) + a Save CTA that writes it back so players
// see it immediately + a quiet Saved status + the grammar hint. Escape-first: the raw text is HTML-escaped
// into the textarea so it can never inject markup (mirrors mgr-ann). Saved on the explicit CTA (data-mgru-
// save → mgSaveRules), not on blur — the copy promises the change is live "right away" on that tap.
function buildMgRulesHTML() {
  const t = mgSettingsTournament();
  const header = `<div class="pd-pagehdr">`
    + `<button type="button" class="pd-back" data-mgt-back aria-label="Back to Tournament">${PK_BACK_SVG}</button>`
    + `<div class="pd-htitle">Rules sheet</div></div>`;
  if (!t) return header + `<div class="pd-empty">No tournament to edit rules for yet.</div>`;
  const rules = (typeof t.rules === 'string') ? t.rules : '';
  return header
    + `<textarea class="mgru-ta" id="mgru-ta" data-mgru-initial="${escapeHTMLText(rules)}" placeholder="## Format&#10;- 4s co-ed — 1 guy + 1 girl on the court&#10;- Pool play to 15, cap 20" aria-label="Rules sheet">${escapeHTML(rules)}</textarea>`
    + `<button type="button" class="mgr-cta" data-mgru-save>Save — players see it right away</button>`
    + `<p class="mgr-status" id="mgru-status" role="status" aria-live="polite"></p>`
    + `<p class="mgru-note">Same text players read on the Rules page · ## makes a heading · - makes a bullet</p>`;
}

// True when the Event settings view has an in-progress edit (a focused input in #tab-manage) the background
// poll must not clobber. Extends the Task 5 registration dirty-guard.
function manageSettingsDirty() {
  const panel = document.getElementById('tab-manage');
  if (!panel) return false;
  const ae = document.activeElement;
  return !!(ae && panel.contains(ae) && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA'));
}
// True when the Rules editor is focused OR has unsaved changes (value differs from data-mgru-initial).
function manageRulesDirty() {
  const panel = document.getElementById('tab-manage');
  if (!panel) return false;
  const ae = document.activeElement;
  if (ae && panel.contains(ae) && ae.tagName === 'TEXTAREA') return true;
  const ta = document.getElementById('mgru-ta');
  if (ta && typeof ta.value === 'string' && ta.value !== (ta.getAttribute('data-mgru-initial') || '')) return true;
  return false;
}

// Save one Event-settings field on blur. Numeric fields parse defensively (blank/NaN → revert the input +
// quiet note, no write); name must be non-empty; pool_cap/bracket_cap accept blank → null; buy_in is free
// text (as-typed or null); bracket_target keeps match_cap in lockstep. net_count routes through the atomic
// re-net during pools/bracket. Never repaints (blur already left the field).
async function mgSaveSettingsField(id) {
  const t = mgSettingsTournament();
  if (!t || !state.isAdmin) return;
  const el = document.getElementById(id);
  if (!el) return;
  const status = document.getElementById('mges-status');
  const note = (msg) => { if (status) status.textContent = msg; };
  const raw = String(el.value == null ? '' : el.value).trim();
  // Parse a positive-integer field. Returns null (= revert + note done) on a bad entry; { fields } to write,
  // or false when unchanged. `nullable` lets a blank clear the column.
  const intWrite = (col, curNum, nullable) => {
    if (raw === '') {
      if (nullable) return (curNum == null) ? false : { [col]: null };
      el.value = (curNum == null ? '' : String(curNum)); note('That needs to be a number — left it unchanged.'); return null;
    }
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1) { el.value = (curNum == null ? '' : String(curNum)); note('That needs to be a number — left it unchanged.'); return null; }
    return (n === curNum) ? false : { [col]: n };
  };
  try {
    let fields = null;
    if (id === 'mges-name') {
      if (!raw) { el.value = String(t.name == null ? '' : t.name); note('Name is required — left it unchanged.'); return; }
      if (raw === String(t.name == null ? '' : t.name)) return;
      fields = { name: raw };
    } else if (id === 'mges-buyin') {
      const cur = t.buy_in == null ? '' : String(t.buy_in);
      if (raw === cur) return;
      fields = { buy_in: raw || null };
    } else if (id === 'mges-teamsize') {
      const w = intWrite('team_size', (t.team_size == null ? null : Number(t.team_size)), false); if (!w) return; fields = w;
    } else if (id === 'mges-nets') {
      const cur = Number(t.net_count);
      const n = parseInt(raw, 10);
      if (raw === '' || !Number.isFinite(n) || n < 1) { el.value = (Number.isFinite(cur) ? String(cur) : ''); note('Nets needs to be a number — left it unchanged.'); return; }
      if (n === cur) return;
      // ATOMIC re-net mid-play so matches.net can never drift from net_count (migration 0031 / F7-F8).
      if (t.status === 'pools' || t.status === 'bracket') {
        const freshM = await tdbListMatches(t.id);
        await tdbApplyNetCountChange(t.id, n, computeNetAssignments(t.status, state.tournamentPools, freshM, n));
      } else {
        await tdbSetTournamentFields(t.id, { net_count: n });
      }
      await tdbRefreshTournaments(); note('Saved'); return;
    } else if (id === 'mges-pooltarget') {
      const w = intWrite('pool_target', (t.pool_target == null ? null : Number(t.pool_target)), false); if (!w) return; fields = w;
    } else if (id === 'mges-poolcap') {
      const w = intWrite('pool_cap', (t.pool_cap == null ? null : Number(t.pool_cap)), true); if (!w) return; fields = w;
    } else if (id === 'mges-brackettarget') {
      const cur = (t.bracket_target != null ? Number(t.bracket_target) : (t.match_cap != null ? Number(t.match_cap) : null));
      const n = parseInt(raw, 10);
      if (raw === '' || !Number.isFinite(n) || n < 1) { el.value = (cur == null ? '' : String(cur)); note('That needs to be a number — left it unchanged.'); return; }
      if (n === cur) return;
      fields = { bracket_target: n, match_cap: n }; // NF-1 back-compat: legacy readers use match_cap
    } else if (id === 'mges-bracketcap') {
      const w = intWrite('bracket_cap', (t.bracket_cap == null ? null : Number(t.bracket_cap)), true); if (!w) return; fields = w;
    } else {
      return;
    }
    if (!fields) return;
    await tdbSetTournamentFields(t.id, fields);
    await tdbRefreshTournaments();
    note('Saved');
  } catch (err) {
    console.warn('mgSaveSettingsField', err);
    note('Could not save — check the connection and try again.');
  }
}

// Toggle a boolean setting (win_by_2 / grand_final_reset). The switch is a button (no text field focused) so
// a repaint is safe and reflects the new state.
async function mgToggleSettingsField(field) {
  const t = mgSettingsTournament();
  if (!t || !state.isAdmin || (field !== 'win_by_2' && field !== 'grand_final_reset')) return;
  const cur = (field === 'win_by_2') ? (t.win_by_2 == null || !!t.win_by_2) : !!t.grand_final_reset;
  try {
    await tdbSetTournamentFields(t.id, { [field]: !cur });
    await tdbRefreshTournaments();
    repaintManage();
  } catch (err) { console.warn('mgToggleSettingsField', err); }
}

// Save the Rules sheet on the explicit CTA — writes tournaments.rules so the public Rules page updates
// immediately, resets the dirty-guard baseline, and shows the quiet Saved status. No repaint (the textarea
// keeps focus/scroll; a repaint would rebuild it).
async function mgSaveRules() {
  const t = mgSettingsTournament();
  if (!t || !state.isAdmin) return;
  const ta = document.getElementById('mgru-ta');
  if (!ta) return;
  const val = String(ta.value == null ? '' : ta.value);
  const status = document.getElementById('mgru-status');
  try {
    await tdbSetTournamentFields(t.id, { rules: val });
    ta.setAttribute('data-mgru-initial', val);
    await tdbRefreshTournaments();
    if (status) status.textContent = 'Saved — players see it now';
  } catch (err) {
    console.warn('mgSaveRules', err);
    if (status) status.textContent = 'Could not save — check the connection and try again.';
  }
}

// ── Task 10: Close out — champion + end/reopen (session-10 pick R12, THE June fix, mockup co-a) ─────────
// Closing a tournament used to be an accident of drift; here it's DELIBERATE. Active (pools/bracket): a matte-
// gold champion card seeded by computeChampion (or "PICK THE CHAMPION" when the bracket hasn't decided) with a
// CHANGE picker, then one primary "End the tournament" CTA + an honest note. Completed: the recorded champion
// (from the STORED champion_team_id) + a quiet "Reopen the tournament" row. Setup: honest empty. The writes go
// through the 0050 SECURITY DEFINER RPCs (tdbCloseTournament / tdbReopenTournament) — guarded for the pre-apply
// window (friendly notice, never a fallback status write). Gold values reuse the champions-strip tokens
// (--gold*, §51 matte). The picker is body-level (poll-clobber-immune). mgCloseoutChampId survives the swap.
const MGCO_TROPHY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M6 4h12v5a6 6 0 0 1-12 0z"/></svg>';

// The tournament's bracket (main-phase) matches — the input computeChampion needs for its suggestion.
function mgCloseoutMainMatches() {
  return (state.tournamentMatches || []).filter((m) => m && m.phase === 'main');
}

// The champion the admin will RECORD on close, plus how to label it. undefined mgCloseoutChampId follows the
// computed bracket suggestion; a team-id string is a manual CHANGE override; '' is an explicit "no champion".
// { teamId, name, eyebrow, explicit } — teamId null = none. Consumed by the card, the End confirm, and the
// picker's initial highlight.
function mgCloseoutChampionChoice(teams, mainMatches) {
  if (mgCloseoutChampId === '') return { teamId: null, name: '', eyebrow: 'NO CHAMPION', explicit: true };
  if (typeof mgCloseoutChampId === 'string' && mgCloseoutChampId) {
    const tm = (teams || []).find((x) => x && String(x.id) === String(mgCloseoutChampId));
    if (tm) return { teamId: tm.id, name: tm.name || '', eyebrow: 'YOUR PICK', explicit: true };
  }
  const c = computeChampion(mainMatches || [], teams || []);
  if (c && c.teamId) return { teamId: c.teamId, name: c.name || '', eyebrow: 'FROM THE BRACKET', explicit: false };
  return { teamId: null, name: '', eyebrow: 'PICK THE CHAMPION', explicit: false };
}

function buildMgCloseoutHTML() {
  const t = mgActiveTournament();
  const header = `<div class="pd-pagehdr">`
    + `<button type="button" class="pd-back" data-mgt-back aria-label="Back to Tournament">${PK_BACK_SVG}</button>`
    + `<div class="pd-htitle">Close out</div></div>`;
  if (!t) return header + `<div class="pd-empty">No tournament to close yet.</div>`;
  const status = t.status;
  // Setup — nothing has happened, so there is nothing to close (this is the June mistake, guarded honestly).
  if (status === 'setup') {
    return header + `<div class="pd-empty">Nothing to close yet — the tournament hasn't started.</div>`;
  }
  const teams = state.tournamentTeams || [];
  // Completed — show the recorded champion (stored champion_team_id) and offer a reopen.
  if (status === 'completed') {
    const stored = t.champion_team_id
      ? teams.find((x) => x && String(x.id) === String(t.champion_team_id))
      : null;
    const champName = stored ? (stored.name || '') : '';
    const card = `<div class="pl-sect">Champion</div>`
      + `<div class="mgco-card">`
        + `<span class="mgco-ic">${MGCO_TROPHY}</span>`
        + `<div class="mgco-cn"><div class="mgco-eyebrow">Champion</div>`
          + `<div class="mgco-name">${champName ? escapeHTML(champName) : 'No champion recorded'}</div></div>`
      + `</div>`;
    const reopen = `<div class="pl-sect">Reopen</div>`
      + `<button type="button" class="mgco-reopen" data-mgco-reopen>Reopen the tournament</button>`
      + `<div class="mgt-note">It's in Past tournaments now. Reopen to fix a score or re-crown — the recorded champion stays until you close again.</div>`;
    return header + card + reopen;
  }
  // Active (pools / bracket) — the champion card (bracket suggestion, your pick, or "pick one") + End CTA.
  const choice = mgCloseoutChampionChoice(teams, mgCloseoutMainMatches());
  const value = choice.teamId
    ? escapeHTML(choice.name)
    : (choice.explicit ? 'No champion recorded' : 'Choose the winning team');
  const card = `<div class="pl-sect">Champion</div>`
    + `<div class="mgco-card">`
      + `<span class="mgco-ic">${MGCO_TROPHY}</span>`
      + `<div class="mgco-cn"><div class="mgco-eyebrow">${choice.eyebrow}</div><div class="mgco-name">${value}</div></div>`
      + `<button type="button" class="mgco-change" data-mgco-change>CHANGE</button>`
    + `</div>`;
  const cta = `<button type="button" class="mgt-cta" data-mgco-end>End the tournament</button>`
    + `<div class="mgt-note">Moves it to Past tournaments · registration and scoring close · you can reopen from there</div>`;
  return header + card + cta;
}

// The CHANGE picker sheet CONTENT (pure string; openMgChampionPicker wraps it in the body-level scrim). Lists
// every team as a pickable row + a "No champion" option; the current pick carries mgco-pick-on.
function buildMgChampionPickerHTML(teams, selectedId) {
  const CHECK = '<svg class="mgco-pickck" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-9"/></svg>';
  const rows = (teams || []).map((tm) => {
    const on = String(selectedId) === String(tm.id);
    return `<button type="button" class="mgco-pickrow${on ? ' mgco-pick-on' : ''}" data-mgco-pick="${escapeHTMLText(String(tm.id))}">`
      + `<span class="mgco-pickname">${escapeHTML(tm.name || 'Team')}</span>${on ? CHECK : ''}</button>`;
  }).join('');
  const noneOn = selectedId === '' || selectedId == null;
  const noneRow = `<button type="button" class="mgco-pickrow mgco-pickrow-none${noneOn ? ' mgco-pick-on' : ''}" data-mgco-pick="">`
    + `<span class="mgco-pickname">No champion</span>${noneOn ? CHECK : ''}</button>`;
  return `<div class="pd-reg-grip"></div>`
    + `<div class="mgts-head"><div class="mgts-eyebrow">Pick the champion</div>`
    + `<button type="button" class="pd-reg-sheetx" data-mgco-pickclose aria-label="Close">`
    + `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>`
    + `<div class="mgco-picklist">${rows}${noneRow}</div>`;
}

function closeMgChampionPicker() { const el = document.getElementById('mgco-picker'); if (el) el.remove(); }

// Open the body-level champion picker. Initial highlight = the current effective choice (the computed
// suggestion when nothing has been overridden). Tapping a row sets mgCloseoutChampId and repaints the card.
function openMgChampionPicker() {
  if (!state.isAdmin) return;
  const teams = state.tournamentTeams || [];
  const choice = mgCloseoutChampionChoice(teams, mgCloseoutMainMatches());
  const sel = (mgCloseoutChampId === undefined) ? (choice.teamId || '') : mgCloseoutChampId;
  closeMgChampionPicker();
  const scrim = document.createElement('div');
  scrim.id = 'mgco-picker';
  scrim.className = 'pd-reg-scrim';
  scrim.setAttribute('role', 'dialog');
  scrim.setAttribute('aria-modal', 'true');
  scrim.setAttribute('aria-label', 'Pick the champion');
  scrim.innerHTML = `<div class="pd-reg-sheet">${buildMgChampionPickerHTML(teams, sel)}</div>`;
  document.body.appendChild(scrim);
  scrim.addEventListener('click', (ev) => {
    if (ev.target === scrim) { closeMgChampionPicker(); return; }           // backdrop dismiss (keeps current pick)
    if (ev.target.closest('[data-mgco-pickclose]')) { closeMgChampionPicker(); return; }
    const row = ev.target.closest('[data-mgco-pick]');
    if (!row) return;
    mgCloseoutChampId = row.getAttribute('data-mgco-pick'); // '' = explicit none; a team-id = a pick
    closeMgChampionPicker();
    repaintManage();
  });
}

// End the tournament: confirm (naming the champion when there is one) → close_tournament RPC → refresh + repaint
// (the sub-hub, the Manage lead, and the public pages all pick up 'completed' via the 15s poll). Resets the
// override so a future tournament starts from its own computed suggestion.
async function mgCloseoutEnd() {
  if (!state.isAdmin) return;
  const t = mgActiveTournament();
  if (!t) return;
  const teams = state.tournamentTeams || [];
  const choice = mgCloseoutChampionChoice(teams, mgCloseoutMainMatches());
  const champName = choice.teamId ? choice.name : null;
  const msg = champName
    ? `Crown ${champName} and end the tournament? It moves to Past tournaments — registration and scoring close. You can reopen it.`
    : 'End the tournament with no champion recorded? It moves to Past tournaments — registration and scoring close. You can reopen it.';
  const ok = await appConfirm({ title: 'End the tournament', message: msg, confirmText: 'End the tournament' });
  if (!ok) return;
  try {
    await tdbCloseTournament(t.id, choice.teamId || null);
    mgCloseoutChampId = undefined;
    await tdbRefreshTournaments();
  } catch (err) {
    appNotice({ title: 'Could not end the tournament', message: (err && err.message) || 'Try again.' });
  }
  repaintManage();
}

// Reopen a completed tournament: confirm → reopen_tournament RPC (restores bracket/pools, KEEPS the champion)
// → refresh + repaint.
async function mgCloseoutReopen() {
  if (!state.isAdmin) return;
  const t = mgActiveTournament();
  if (!t) return;
  const ok = await appConfirm({
    title: 'Reopen the tournament',
    message: 'Reopen it to fix a score or re-crown? It leaves Past tournaments and scoring opens back up. The recorded champion stays unless you close again with a different one.',
    confirmText: 'Reopen',
  });
  if (!ok) return;
  try {
    await tdbReopenTournament(t.id);
    await tdbRefreshTournaments();
  } catch (err) {
    appNotice({ title: 'Could not reopen', message: (err && err.message) || 'Try again.' });
  }
  repaintManage();
}

// ── Task 6: Teams & payment (session-10 pick R8) — the list + the body-level full-edit team sheet ─────
// Mockup r10-manage/tp-a. The list (mgtView==='teams') is one flat row per registered team: name + a
// first-names roster preview + a PAID / TAP-WHEN-PAID tag that IS the paid toggle (tap the tag, don't open
// the sheet) + a chevron; the ROW opens the sheet; a dashed "Add a team yourself" prompts for a name. The
// sheet (openMgTeamSheet) lives on document.body — OUTSIDE #tab-manage — so the 15s poll / partialRender can
// never wipe a half-typed roster (same discipline as openJoinSheet). It edits name (tdbRenameTeam), the full
// stacked roster (tdbSetTeamRoster), paid (tdbSetTeamPaid), pool when pools exist (tdbMoveTeamToPool),
// withdraw when mid-play (tdbWithdrawTeam), and a type-DELETE remove (tdbDeleteTeam).

// The team row from live state (string-id match — team ids are uuids, data attrs are strings).
function mgFindTeam(teamId) {
  return (state.tournamentTeams || []).find((t) => t && String(t.id) === String(teamId)) || null;
}
// A team's roster names for display. Prefer team_members (loaded for ANY signed-in account — admins too —
// carrying every team's members, so an edited-but-freshly-synced roster shows real linked players); fall
// back to the teams.roster jsonb when members aren't loaded or this team has none.
function mgTeamRosterNames(team) {
  if (!team) return [];
  const members = Array.isArray(state.teamMembers)
    ? state.teamMembers.filter((c) => c && String(c.teamId) === String(team.id)).map((c) => c.name)
    : [];
  const src = members.length ? members : (Array.isArray(team.roster) ? team.roster : []);
  return src.map((n) => String(n || '').trim()).filter(Boolean);
}
// First names only, for the compact list preview ("Riley · Sam · Jo · Casey").
function mgTeamFirstNames(team) {
  return mgTeamRosterNames(team).map((n) => n.split(/\s+/)[0]).filter(Boolean);
}

// The Teams & payment LIST (mockup tp-a). Header (back to the sub-hub) + "N in · N paid" + a row per team.
function buildMgTeamsHTML() {
  const teams = Array.isArray(state.tournamentTeams) ? state.tournamentTeams : [];
  const paidCt = teams.filter((x) => x && x.paid).length;
  const header = `<div class="pd-pagehdr">`
    + `<button type="button" class="pd-back" data-mgt-back aria-label="Back to Tournament">${PK_BACK_SVG}</button>`
    + `<div class="pd-htitle">${escapeHTML(MGT_SUB_TITLES.teams)}</div></div>`;
  const add = `<button type="button" class="pk-add" data-mgtp-add>${PK_PLUS_SVG}Add a team yourself</button>`;
  if (!teams.length) {
    return header + `<div class="pd-empty">No teams yet — teams land here as they register.</div>` + add;
  }
  const label = `<div class="pl-sect">${teams.length} in · ${paidCt} paid</div>`;
  const rows = teams.map((tm) => {
    const first = mgTeamFirstNames(tm);
    const preview = first.length ? escapeHTML(first.join(' · ')) : 'No players yet';
    const paid = !!tm.paid;
    const idAttr = escapeHTMLText(String(tm.id));
    return `<div class="mgtp-row" data-mgtp-team="${idAttr}">
        <div class="mgtp-tn"><div class="mgtp-nm">${escapeHTML(tm.name || 'Team')}</div><div class="mgtp-rs">${preview}</div></div>
        <button type="button" class="mgtp-tag ${paid ? 'paid' : 'unpaid'}" data-mgtp-paid="${idAttr}" aria-label="${paid ? 'Paid — tap to unmark' : 'Tap when this team has paid'}">${paid ? 'PAID' : 'TAP WHEN PAID'}</button>
        ${MG_CHEV}
      </div>`;
  }).join('');
  return header + label + rows + add;
}

// The full-edit team sheet CONTENT (pure string; openMgTeamSheet wraps it in the body-level scrim). Reads
// the lead tournament's status + pools from state so move-to-pool / withdraw only appear when they apply.
function buildMgTeamSheetHTML(team) {
  if (!team) return '';
  const t = mgActiveTournament();
  const status = t ? t.status : 'setup';
  const midPlay = status === 'pools' || status === 'bracket';
  const pools = Array.isArray(state.tournamentPools) ? state.tournamentPools : [];
  const paid = !!team.paid;
  const names = mgTeamRosterNames(team);
  const rosterInit = names.join('\n'); // change-detection snapshot (newline sep — never appears in a name)
  const rlines = names.concat(['']).map((n, i) =>
    `<input class="mgts-rline" type="text" autocomplete="off" autocapitalize="words" spellcheck="false"`
    + ` placeholder="${i >= names.length ? 'Add a player' : ''}" value="${escapeHTMLText(n)}" aria-label="Player ${i + 1}" />`).join('');
  const head = `<div class="pd-reg-grip"></div>`
    + `<div class="mgts-head"><div class="mgts-eyebrow">Edit team</div>`
    + `<button type="button" class="pd-reg-sheetx" data-mgts="close" aria-label="Close">`
    + `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>`;
  const nameFld = `<label class="pk-fl" for="mgts-name">Team name</label>`
    + `<input class="pk-fv mgts-name" id="mgts-name" type="text" autocomplete="off" autocapitalize="words" spellcheck="false"`
    + ` value="${escapeHTMLText(team.name || '')}" data-init="${escapeHTMLText(team.name || '')}" />`;
  const rosterBlock = `<div class="pl-sect">Roster</div>`
    + `<div class="mgts-roster" data-roster-init="${escapeHTMLText(rosterInit)}">${rlines}</div>`;
  const paidRow = `<div class="mgts-row"><div class="mg-rb"><div class="mg-rn">Paid</div>`
    + `<div class="mg-rs">Tap to mark the buy-in received</div></div>`
    + `<button type="button" class="mg-sw${paid ? ' on' : ''}" data-mgts="paid" role="switch" aria-checked="${paid ? 'true' : 'false'}" aria-label="Paid"></button></div>`;
  const poolRow = pools.length
    ? `<div class="pl-sect">Pool</div><div class="mgts-pools">`
      + pools.slice().sort((a, b) => (Number(a.display_order) || 0) - (Number(b.display_order) || 0)).map((p) =>
        `<button type="button" class="mgts-pchip${String(team.pool_id || '') === String(p.id) ? ' on' : ''}" data-mgts="pool" data-mgts-pool="${escapeHTMLText(String(p.id))}">Pool ${escapeHTML(String(p.label || ''))}</button>`).join('')
      + `<button type="button" class="mgts-pchip${team.pool_id ? '' : ' on'}" data-mgts="pool" data-mgts-pool="">No pool</button></div>`
    : '';
  const withdrawRow = midPlay
    ? `<button type="button" class="mgts-warn" data-mgts="withdraw">Withdraw from the tournament<span class="mgts-sub">Forfeits their remaining games</span></button>`
    : '';
  const removeRow = `<button type="button" class="mgts-danger" data-mgts="remove">Remove this team</button>`;
  const done = `<button type="button" class="mgts-done" data-mgts="close">Done</button>`;
  return head + nameFld + rosterBlock + paidRow + poolRow + withdrawRow + removeRow + done;
}

// ── Teams-list actions (delegated via #app-content when manageView==='tournament' && mgtView==='teams') ──
// Tapping the tag toggles paid without opening the sheet (optimistic in-place flip, then refresh + repaint).
async function mgTeamTogglePaid(teamId, tagEl) {
  if (!state.isAdmin || !teamId) return;
  const team = mgFindTeam(teamId);
  if (!team) return;
  const next = !team.paid;
  if (tagEl) {
    tagEl.classList.toggle('paid', next);
    tagEl.classList.toggle('unpaid', !next);
    tagEl.textContent = next ? 'PAID' : 'TAP WHEN PAID';
  }
  try { await tdbSetTeamPaid(teamId, next); await tdbRefreshTournaments(); } catch (err) { console.warn('mgTeamTogglePaid', err); }
  repaintManage();
}
// The dashed "Add a team yourself" — a house text-input dialog (never window.prompt), then tdbAddTeam.
async function mgTeamAddPrompt() {
  if (!state.isAdmin) return;
  const t = mgActiveTournament();
  if (!t) { appNotice({ title: 'No tournament', message: 'Create a tournament first, then add teams.' }); return; }
  const name = await appPrompt({ title: 'Add a team', message: 'Enter the team name.', confirmText: 'Add team', placeholder: 'Team name' });
  if (name == null) return;                       // cancelled
  const nm = String(name).trim();
  if (!nm) return;
  try {
    await tdbAddTeam(t.id, nm);
    await tdbRefreshTournaments();
    repaintManage();
  } catch (err) { appNotice({ title: 'Could not add team', message: (err && err.message) || 'Try again.' }); }
}

// ── The body-level team sheet ────────────────────────────────────────────────────────────────────────
function closeMgTeamSheet() { const el = document.getElementById('mgts-sheet'); if (el) el.remove(); }

// Run a sheet write, refresh state, repaint the list UNDER the sheet (the sheet is body-level → untouched).
async function mgtsWrite(fn) {
  if (!state.isAdmin) return;
  try { await fn(); await tdbRefreshTournaments(); } catch (err) { console.warn('mgts write', err); }
  repaintManage();
}
async function mgtsSaveName(teamId, el) {
  const val = String((el && el.value) || '').trim();
  if (!val || val === ((el && el.getAttribute('data-init')) || '')) return; // unchanged / empty → no write
  try {
    await tdbRenameTeam(teamId, val);
    if (el) el.setAttribute('data-init', val);
    await tdbRefreshTournaments();
    repaintManage();
  } catch (err) { console.warn('mgtsSaveName', err); }
}
async function mgtsSaveRoster(teamId, scrim) {
  const box = scrim && scrim.querySelector('.mgts-roster');
  const lines = Array.from((scrim || document).querySelectorAll('.mgts-rline'))
    .map((i) => String(i.value || '').trim()).filter(Boolean);
  const init = box ? (box.getAttribute('data-roster-init') || '') : '';
  if (lines.join('\n') === init) return; // unchanged → no write
  try {
    await tdbSetTeamRoster(teamId, lines);
    if (box) box.setAttribute('data-roster-init', lines.join('\n'));
    await tdbRefreshTournaments();
    repaintManage();
  } catch (err) { console.warn('mgtsSaveRoster', err); }
}
async function mgtsWithdraw(teamId) {
  if (!state.isAdmin) return;
  const t = mgActiveTournament();
  const team = mgFindTeam(teamId);
  const nm = team ? (team.name || 'This team') : 'This team';
  const ok = await appConfirm({ title: 'Withdraw team', message: `${nm} forfeits their remaining games (opponents win by the pool target). This can't be undone.`, confirmText: 'Withdraw', danger: true });
  if (!ok) return;
  try { await tdbWithdrawTeam(teamId, t); await tdbRefreshTournaments(); } catch (err) { console.warn('mgtsWithdraw', err); }
  closeMgTeamSheet();
  repaintManage();
}
// Type-DELETE remove — reuses the player-delete "type the word to confirm" pattern, but via the house
// appPrompt modal (the old confirmDangerousActionOrAbort uses window.prompt, which the shell has retired).
async function mgtsRemove(teamId) {
  if (!state.isAdmin) return;
  const team = mgFindTeam(teamId);
  const nm = team ? (team.name || 'this team') : 'this team';
  const typed = await appPrompt({ title: `Remove ${nm}?`, message: 'This permanently removes the team. Type DELETE to confirm.', confirmText: 'Remove team', placeholder: 'DELETE' });
  if (String(typed || '').trim().toUpperCase() !== 'DELETE') return;
  try { await tdbDeleteTeam(teamId); await tdbRefreshTournaments(); } catch (err) { console.warn('mgtsRemove', err); }
  closeMgTeamSheet();
  repaintManage();
}

function openMgTeamSheet(teamId) {
  const team = mgFindTeam(teamId);
  if (!team || !state.isAdmin) return;
  closeMgTeamSheet();
  const scrim = document.createElement('div');
  scrim.id = 'mgts-sheet';
  scrim.className = 'pd-reg-scrim';
  scrim.setAttribute('role', 'dialog');
  scrim.setAttribute('aria-modal', 'true');
  scrim.setAttribute('aria-label', 'Edit team');
  scrim.innerHTML = `<div class="pd-reg-sheet">${buildMgTeamSheetHTML(team)}</div>`;
  document.body.appendChild(scrim);
  // The sheet lives on document.body (outside #app-content's delegated listeners) → bind its own handlers.
  scrim.addEventListener('click', (ev) => {
    if (ev.target === scrim) { closeMgTeamSheet(); return; } // backdrop tap dismisses
    const r = ev.target.closest('[data-mgts]');
    if (!r) return;
    const role = r.getAttribute('data-mgts');
    if (role === 'close') { closeMgTeamSheet(); return; }
    if (role === 'paid') {
      const on = !r.classList.contains('on');
      r.classList.toggle('on', on);
      r.setAttribute('aria-checked', on ? 'true' : 'false');
      void mgtsWrite(() => tdbSetTeamPaid(teamId, on));
      return;
    }
    if (role === 'pool') {
      const pid = r.getAttribute('data-mgts-pool') || '';
      scrim.querySelectorAll('[data-mgts="pool"]').forEach((b) => b.classList.remove('on'));
      r.classList.add('on');
      void mgtsWrite(() => tdbMoveTeamToPool(teamId, pid || null));
      return;
    }
    if (role === 'withdraw') { void mgtsWithdraw(teamId); return; }
    if (role === 'remove') { void mgtsRemove(teamId); return; }
  });
  // Save name / roster on blur (the poll can't wipe them — the sheet is body-level).
  scrim.addEventListener('focusout', (ev) => {
    const el = ev.target;
    if (!el) return;
    if (el.id === 'mgts-name') { void mgtsSaveName(teamId, el); return; }
    if (el.classList && el.classList.contains('mgts-rline')) { void mgtsSaveRoster(teamId, scrim); return; }
  });
  setTimeout(() => { const n = document.getElementById('mgts-name'); if (n) { try { n.focus({ preventScroll: true }); } catch (_) { try { n.focus(); } catch (_e) {} } } }, 60);
}

// ── Task 7 (pick R9): Pools & schedule admin — score on the schedule ──────────────────────────────────
// The public Pools page grammar (pl-* tabs + Seeding, standings-lite, net-hairline games) reused inside
// #tab-manage with admin verbs: SCORE on unscored rows, tap-to-update on live, quiet EDIT on finals — all
// open the shared body-level openMgScoreSheet(matchId). Pre-draw = the two-step draw setup (Draw pools →
// Start pool play) through the atomic RPCs. Post-draw also carries a Pool controls panel (move teams via the
// T6 team sheet / edit nets / reset pools). §51 matte, Barlow display, single --accent, flat on stone.
function buildMgPoolsHTML() {
  const t = mgActiveTournament();
  const header = `<div class="pd-pagehdr">`
    + `<button type="button" class="pd-back" data-mgt-back aria-label="Back to Tournament">${PK_BACK_SVG}</button>`
    + `<div class="pd-htitle">Pools &amp; schedule</div></div>`;
  if (!t) return header + `<div class="pd-empty">No tournament to set up pools for yet.</div>`;
  const teams = Array.isArray(state.tournamentTeams) ? state.tournamentTeams : [];
  const pools = (Array.isArray(state.tournamentPools) ? state.tournamentPools : [])
    .slice().sort((a, b) => (Number(a.display_order) || 0) - (Number(b.display_order) || 0));
  const matches = Array.isArray(state.tournamentMatches) ? state.tournamentMatches : [];
  const poolMatches = matches.filter((m) => (m.phase ? m.phase === 'pool' : !!m.pool_id));
  if (!poolMatches.length) return header + mgPoolsSetupHTML(t, teams, pools);
  return header + mgPoolsScheduleHTML(t, teams, pools, matches) + mgPoolsControlsHTML(t, teams, pools, matches);
}

// Pre-draw setup (status setup, no pools) OR drawn-not-started (pools exist, no matches) — two steps like
// today's tv2 flow: Draw pools first (shows the drawn pools), then Start pool play once you're happy.
function mgPoolsSetupHTML(t, teams, pools) {
  if (!pools.length) {
    const teamCt = teams.length;
    const defPools = Number(t.pool_count) > 0 ? Number(t.pool_count) : Math.max(1, Math.round(teamCt / 6) || 1);
    const defNets = Number(t.net_count) > 0 ? Number(t.net_count) : 1;
    const size = Number(t.team_size) || 4;
    const pr = scoringRulesFor('pool', t);
    const br = scoringRulesFor('main', t);
    const rline = (r) => 'First to ' + r.target + (r.winBy2 ? ', win by 2' : '') + (r.cap != null ? ' (cap ' + r.cap + ')' : '');
    const preset = [`${size}s co-ed`, `Pool: ${rline(pr)}`, `Bracket: ${rline(br)}`];
    const enough = teamCt >= 2;
    return `<div class="pl-sect">Draw setup</div>`
      + `<div class="pk-fld"><label class="pk-fl" for="mgps-poolcount">Pools</label>`
        + `<input class="pk-fv" id="mgps-poolcount" type="number" min="1" inputmode="numeric" value="${escapeHTMLText(String(defPools))}" /></div>`
      + `<div class="pk-fld"><label class="pk-fl" for="mgps-nets">Nets</label>`
        + `<input class="pk-fv" id="mgps-nets" type="number" min="1" inputmode="numeric" value="${escapeHTMLText(String(defNets))}" /></div>`
      + `<div class="pl-sect">Format</div>`
      + preset.map((p) => `<div class="mgps-sub">${escapeHTML(p)}</div>`).join('')
      + `<div class="mgps-note">Edit these in Event settings.</div>`
      + `<button type="button" class="mgt-cta" data-mgps-draw${enough ? '' : ' disabled'}>Draw pools</button>`
      + (enough ? '' : `<div class="mgps-note">Add at least 2 teams first.</div>`);
  }
  return `<div class="pl-sect">Pools drawn</div>`
    + pools.map((p) => mgPoolTeamsBlockHTML(p, teams, null, false)).join('')
    + `<button type="button" class="mgt-cta" data-mgps-start>Start pool play</button>`
    + `<button type="button" class="mgps-quiet" data-mgps-redraw>Draw again</button>`;
}

// One pool's teams (each tappable → the T6 openMgTeamSheet for move/edit). Shared by the drawn-not-started
// step and the expanded Pool controls; `showEditNets` adds the Edit-nets action in the controls context.
function mgPoolTeamsBlockHTML(pool, teams, matches, showEditNets) {
  const label = pool.label || '';
  const mine = teams.filter((tm) => String(tm.pool_id || '') === String(pool.id));
  let sub = `Pool ${escapeHTML(label)}`;
  if (matches) {
    const nets = [...new Set(matches.filter((m) => m.pool_id === pool.id && m.net != null).map((m) => m.net))].sort((a, b) => a - b);
    if (nets.length) sub += ` · Net${nets.length > 1 ? 's' : ''} ${escapeHTML(formatNetList(nets))}`;
  }
  const rows = mine.length
    ? mine.map((tm) => `<button type="button" class="mgps-pteam" data-mgps-team="${escapeHTMLText(String(tm.id))}"><span class="mgps-ptn">${escapeHTML(tm.name || 'Team')}</span>${MG_CHEV}</button>`).join('')
    : `<div class="mgps-note">No teams in this pool.</div>`;
  const editNets = showEditNets
    ? `<button type="button" class="mgps-editnets" data-mgps-editnets="${escapeHTMLText(String(pool.id))}">Edit nets</button>`
    : '';
  return `<div class="pl-sect">${sub}</div>${rows}${editNets}`;
}

// The post-draw schedule — reuses the public buildPoolsSchedulePageHTML shape (pool + Seeding tabs,
// standings-lite via the shared poolStandRowHTML, per-net hairline games) with admin game rows.
function mgPoolsScheduleHTML(t, teams, pools, matches) {
  const EN = '–';
  const activePools = pools.filter((p) => matches.some((m) => m.pool_id === p.id));
  if (!activePools.length) return `<div class="pl-empty">No scheduled games yet.</div>`;
  const poolLabels = activePools.map((p) => p.label || '');
  const selected = mgpPoolFilter === 'seeding'
    ? 'seeding'
    : (poolLabels.includes(mgpPoolFilter) ? mgpPoolFilter : poolLabels[0]);
  const tab = (label, val) => `<button type="button" class="pl-tab${selected === val ? ' pl-on' : ''}" data-mgps-tab="${escapeHTMLText(val)}"${selected === val ? ' aria-current="true"' : ''}>${escapeHTML(label)}</button>`;
  const tabs = `<div class="pl-tabs" role="group" aria-label="Pools and seeding">${activePools.map((p) => tab('Pool ' + (p.label || ''), p.label || '')).join('')}${tab('Seeding', 'seeding')}</div>`;

  const poolGames = matches.filter((m) => m.pool_id && m.team_a_id && m.team_b_id && (m.phase ? m.phase === 'pool' : true));
  const total = poolGames.length;
  const done = poolGames.filter((m) => m.status === 'final').length;
  const maxRound = Math.max(1, ...poolGames.map((m) => m.queue_order || 0));
  const finalOrders = poolGames.filter((m) => m.status === 'final').map((m) => m.queue_order || 0);
  const curRound = Math.min(maxRound, (finalOrders.length ? Math.max(...finalOrders) : 0) + 1);
  const meta = `<p class="pl-meta">Round ${curRound} of ${maxRound} · ${done} of ${total} game${total === 1 ? '' : 's'} final</p>`;
  const colh = `<div class="pl-colh"><span class="c1">#</span><span class="c2">Team</span><span class="c3">W${EN}L</span><span class="c4">Diff</span></div>`;

  let body;
  if (selected === 'seeding') {
    const poolByTeam = {};
    teams.forEach((tm) => { const p = pools.find((pp) => pp.id === tm.pool_id); if (p) poolByTeam[tm.id] = p.label || ''; });
    const rows = computeSeeding(teams, matches).map((r) => {
      const badge = poolByTeam[r.teamId] ? `<span class="pl-pl">${escapeHTML(poolByTeam[r.teamId])}</span> ` : '';
      return poolStandRowHTML(r.seed, r.teamId, r.name, r.wins, r.losses, r.pointDiff, badge, null);
    }).join('');
    body = `<div class="pl-sect">Overall seeding</div>${colh}${rows}<p class="pl-foot">Seeded by win %, then point diff — this sets the bracket order.</p>`;
  } else {
    const pool = activePools.find((p) => (p.label || '') === selected) || activePools[0];
    const shaped = shapeStandingsByPool(pools, teams, matches).find((s) => s.poolLabel === (pool.label || ''));
    const standRows = (shaped ? shaped.rows : []).map((r) => poolStandRowHTML(r.rank, r.teamId, r.name, r.wins, r.losses, r.pointDiff, '', null)).join('');
    const poolMs = matches.filter((m) => m.pool_id === pool.id);
    const nets = [...new Set(poolMs.map((m) => m.net).filter((n) => n != null))].sort((a, b) => a - b);
    const netsLabel = nets.length ? ('Net' + (nets.length > 1 ? 's' : '') + ' ' + formatNetList(nets)) : '';
    const gsections = nets.map((net) => {
      const games = poolMs.filter((m) => m.net === net).sort((a, b) => (a.queue_order || 0) - (b.queue_order || 0));
      const rows = games.map((g, i) => mgPoolGameRowHTML(g, g.queue_order || (i + 1), teams)).join('');
      return `<div class="pl-net">NET ${escapeHTML(String(net))}</div>${rows}`;
    }).join('');
    body = `<div class="pl-sect">Pool ${escapeHTML(pool.label || '')} standings</div>${colh}${standRows}<div class="pl-sect">Games${netsLabel ? ' · ' + escapeHTML(netsLabel) : ''}</div>${gsections}`;
  }
  return `${meta}${tabs}${body}`;
}

// One admin game row: the whole row is tappable (data-mgps-score) → the score sheet. Unscored rows show a
// SCORE outline button, live rows a green score + LIVE pill, finals the winner-first line + a quiet EDIT tag.
// NO data-team-peek (that read-only public affordance is replaced by the admin score action).
function mgPoolGameRowHTML(g, order, teams) {
  const EN = '–';
  const idAttr = escapeHTMLText(String(g.id));
  const aN = escapeHTML(teamNameById(teams, g.team_a_id));
  const bN = escapeHTML(teamNameById(teams, g.team_b_id));
  const rd = `<span class="rd">R${escapeHTML(String(order))}</span>`;
  if (g.status === 'final') {
    const aWin = g.winner_team_id === g.team_a_id;
    const w = aWin ? aN : bN, l = aWin ? bN : aN;
    const ws = aWin ? g.score_a : g.score_b, ls = aWin ? g.score_b : g.score_a;
    return `<div class="pl-g" data-mgps-score="${idAttr}">${rd}<span class="gt"><b>${w}</b> <span class="def">def.</span> <span class="lose">${l}</span></span><span class="sc">${escapeHTML(String(ws))}${EN}${escapeHTML(String(ls))}</span><span class="ftag">EDIT</span></div>`;
  }
  if (g.status === 'live') {
    const sa = Number(g.score_a) || 0, sb = Number(g.score_b) || 0;
    return `<div class="pl-g live" data-mgps-score="${idAttr}">${rd}<span class="gt">${aN} <span class="vs">vs</span> ${bN}</span><span class="sc">${sa}${EN}${sb}</span><span class="pill">LIVE</span></div>`;
  }
  return `<div class="pl-g" data-mgps-score="${idAttr}">${rd}<span class="gt">${aN} <span class="vs">vs</span> ${bN}</span><button type="button" class="mgps-score" data-mgps-score="${idAttr}">SCORE</button></div>`;
}

// The Pool controls section — collapsed to one "careful stuff" row (mockup ps-a), expanded to per-pool team
// lists (tap → the T6 team sheet to move a team), Edit nets per pool, and a type-name Reset pools.
function mgPoolsControlsHTML(t, teams, pools, matches) {
  if (!mgpControlsOpen) {
    return `<div class="pl-sect">Pool controls</div>`
      + `<button type="button" class="mgps-ctrlrow" data-mgps-controls>`
        + `<div class="mg-rb"><div class="mg-rn">Move teams · edit nets · reset pools</div>`
        + `<div class="mg-rs">The careful stuff, one tap deeper</div></div>${MG_CHEV}</button>`;
  }
  return `<div class="pl-sect">Pool controls</div>`
    + `<button type="button" class="mgps-quiet" data-mgps-controls>Close controls</button>`
    + pools.map((p) => mgPoolTeamsBlockHTML(p, teams, matches, true)).join('')
    + `<button type="button" class="mgts-danger" data-mgps-reset>Reset pools</button>`
    + `<div class="mgps-note">Clears every pool result and re-draws — type the tournament name to confirm.</div>`;
}

// ── The shared body-level score sheet (Task 7 defines it; Task 8's bracket reuses openMgScoreSheet) ──────
// Match-generic: handles phase 'pool' | 'main'. Content builder is pure (like buildMgTeamSheetHTML); the
// interactive steppers + writes live in openMgScoreSheet. Writes: pool final → tdbSubmitResult, bracket
// final → tdbSubmitBracketResult, edit-final → tdbEditMatchScore, live → tdbSetLiveScore.
function buildMgScoreSheetHTML(match) {
  if (!match) return '';
  const teams = Array.isArray(state.tournamentTeams) ? state.tournamentTeams : [];
  const aName = teamNameById(teams, match.team_a_id) || 'Team A';
  const bName = teamNameById(teams, match.team_b_id) || 'Team B';
  const a = Math.max(0, Number(match.score_a) || 0);
  const b = Math.max(0, Number(match.score_b) || 0);
  const isFinal = match.status === 'final';
  const t = (Array.isArray(state.tournaments) ? state.tournaments : []).find((x) => x.id === match.tournament_id) || mgActiveTournament() || {};
  const rules = scoringRulesFor(match.phase, t);
  const ruleText = 'First to ' + rules.target + (rules.winBy2 ? ', win by 2' : '') + (rules.cap != null ? ' (cap ' + rules.cap + ')' : '');
  const bits = [];
  if (match.phase === 'main') {
    bits.push(bracketLabelPart(match));
  } else {
    const pool = (Array.isArray(state.tournamentPools) ? state.tournamentPools : []).find((p) => p.id === match.pool_id);
    if (pool) bits.push('Pool ' + (pool.label || ''));
    if (match.queue_order) bits.push('Round ' + match.queue_order);
  }
  if (match.net) bits.push('Net ' + match.net);
  bits.push(ruleText);
  const meta = bits.filter(Boolean).join(' · ');

  const head = `<div class="pd-reg-grip"></div>`
    + `<div class="mgts-head"><div class="mgts-eyebrow">${isFinal ? 'Edit result' : 'Score'}</div>`
    + `<button type="button" class="pd-reg-sheetx" data-mgss="close" aria-label="Close">`
    + `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>`;
  const title = `<div class="mgss-title">${escapeHTML(aName)} <span class="mgss-vs">vs</span> ${escapeHTML(bName)}</div>`;
  const metaLine = `<div class="mgss-meta">${escapeHTML(meta)}</div>`;
  const stepper = (side, name, val) => `<div class="mgss-step">`
    + `<div class="mgss-sname">${escapeHTML(name)}</div>`
    + `<div class="mgss-srow">`
      + `<button type="button" class="mgss-sbtn" data-mgss-step="${side}" data-mgss-d="-1" aria-label="${escapeHTMLText(name)} minus one">−</button>`
      + `<span class="mgss-sval" id="mgss-${side}">${val}</span>`
      + `<button type="button" class="mgss-sbtn" data-mgss-step="${side}" data-mgss-d="1" aria-label="${escapeHTMLText(name)} plus one">+</button>`
    + `</div></div>`;
  const steppers = `<div class="mgss-steps">${stepper('a', aName, a)}${stepper('b', bName, b)}</div>`;
  const err = `<div class="mgss-err" id="mgss-err" hidden></div>`;
  const leader = a > b ? aName : (b > a ? bName : null);
  const finalLabel = leader
    ? (isFinal ? 'Save — ' : 'Final — ') + escapeHTML(leader) + ' wins ' + Math.max(a, b) + '–' + Math.min(a, b)
    : (isFinal ? 'Enter a winning score' : 'Final — set the score to pick a winner');
  const primary = `<button type="button" class="mgt-cta mgss-final" data-mgss="${isFinal ? 'edit' : 'final'}"${leader ? '' : ' disabled'}>${finalLabel}</button>`;
  const quiet = isFinal
    ? `<p class="mgss-note">Fixing the score — same winner only. To change who won, clear the result first.</p>`
    : `<button type="button" class="mgss-quiet" data-mgss="live">Just update the live score</button>`;
  return head + title + metaLine + steppers + err + primary + quiet;
}

function closeMgScoreSheet() { const el = document.getElementById('mgss-sheet'); if (el) el.remove(); }

function openMgScoreSheet(matchId) {
  if (!state.isAdmin) return;
  const match = (Array.isArray(state.tournamentMatches) ? state.tournamentMatches : []).find((m) => m.id === matchId);
  if (!match || !match.team_a_id || !match.team_b_id) return;
  closeMgScoreSheet();
  const aName = teamNameById(state.tournamentTeams, match.team_a_id) || 'Team A';
  const bName = teamNameById(state.tournamentTeams, match.team_b_id) || 'Team B';
  const isFinal = match.status === 'final';
  let a = Math.max(0, Number(match.score_a) || 0);
  let b = Math.max(0, Number(match.score_b) || 0);
  let submitting = false;
  const scrim = document.createElement('div');
  scrim.id = 'mgss-sheet';
  scrim.className = 'pd-reg-scrim';
  scrim.setAttribute('role', 'dialog');
  scrim.setAttribute('aria-modal', 'true');
  scrim.setAttribute('aria-label', isFinal ? 'Edit result' : 'Enter score');
  scrim.innerHTML = `<div class="pd-reg-sheet">${buildMgScoreSheetHTML(match)}</div>`;
  document.body.appendChild(scrim);
  const errEl = () => document.getElementById('mgss-err');
  const fail = (msg) => { const e = errEl(); if (e) { e.textContent = msg; e.hidden = false; } };
  const sync = () => {
    const ea = document.getElementById('mgss-a'), eb = document.getElementById('mgss-b');
    if (ea) ea.textContent = String(a);
    if (eb) eb.textContent = String(b);
    const btn = scrim.querySelector('.mgss-final');
    if (btn) {
      const leader = a > b ? aName : (b > a ? bName : null);
      if (leader) {
        btn.removeAttribute('disabled');
        btn.textContent = (isFinal ? 'Save — ' : 'Final — ') + leader + ' wins ' + Math.max(a, b) + '–' + Math.min(a, b);
      } else {
        btn.setAttribute('disabled', 'true');
        btn.textContent = isFinal ? 'Enter a winning score' : 'Final — set the score to pick a winner';
      }
    }
  };
  const doFinal = async () => {
    if (submitting) return;
    if (a === b) { fail('A game can\'t end in a tie.'); return; }
    submitting = true;
    try {
      if (!(await confirmBigMargin(String(a), String(b)))) { submitting = false; return; }
      if (isFinal) await tdbEditMatchScore(match, String(a), String(b));
      else if (match.phase === 'main') await tdbSubmitBracketResult(match, a > b ? 'a' : 'b', String(a), String(b));
      else await tdbSubmitResult(match, String(a), String(b));
      await tdbRefreshTournaments();
      closeMgScoreSheet();
      repaintManage();
    } catch (e) { fail((e && e.message) || 'Could not save the result.'); submitting = false; }
  };
  const doLive = async () => {
    if (submitting) return;
    submitting = true;
    try {
      await tdbSetLiveScore(match, a, b);
      await tdbRefreshTournaments();
      closeMgScoreSheet();
      repaintManage();
    } catch (e) { fail((e && e.message) || 'Could not update the live score.'); submitting = false; }
  };
  scrim.addEventListener('click', (ev) => {
    if (ev.target === scrim) { closeMgScoreSheet(); return; }
    const step = ev.target.closest('[data-mgss-step]');
    if (step) {
      const side = step.getAttribute('data-mgss-step');
      const d = Number(step.getAttribute('data-mgss-d')) || 0;
      if (side === 'a') a = Math.max(0, a + d); else b = Math.max(0, b + d);
      const e = errEl(); if (e) e.hidden = true;
      sync();
      return;
    }
    const act = ev.target.closest('[data-mgss]');
    if (!act) return;
    const role = act.getAttribute('data-mgss');
    if (role === 'close') { closeMgScoreSheet(); return; }
    if (role === 'final' || role === 'edit') { void doFinal(); return; }
    if (role === 'live') { void doLive(); return; }
  });
}

// ── Task 7 pool-setup handlers (wired from the manage click delegate under mgtView==='pools') ────────────
async function mgPoolsDraw() {
  if (!state.isAdmin) return;
  const t = mgActiveTournament();
  if (!t) return;
  const teams = state.tournamentTeams || [];
  if (teams.length < 2) { appNotice({ title: 'Add teams first', message: 'You need at least 2 teams to draw pools.' }); return; }
  const pcEl = document.getElementById('mgps-poolcount');
  const ncEl = document.getElementById('mgps-nets');
  const pc = Math.max(1, Math.floor(Number(pcEl && pcEl.value) || Number(t.pool_count) || 1));
  const nc = Math.max(1, Math.floor(Number(ncEl && ncEl.value) || Number(t.net_count) || 1));
  try {
    await tdbSetTournamentFields(t.id, { pool_count: pc, net_count: nc });
    await tdbDrawPoolsAtomic({ ...t, pool_count: pc, net_count: nc });
    await tdbRefreshTournaments();
    repaintManage();
  } catch (err) { appNotice({ title: 'Could not draw pools', message: (err && err.message) || 'Try again.' }); }
}

async function mgPoolsStart() {
  if (!state.isAdmin) return;
  const t = mgActiveTournament();
  if (!t) return;
  const unpaid = (state.tournamentTeams || []).filter((tm) => !tm.paid).length;
  if (unpaid > 0 && !(await appConfirm({ title: 'Unpaid teams', message: `${unpaid} team${unpaid === 1 ? '' : 's'} not marked paid. Start pool play anyway?`, confirmText: 'Start anyway' }))) return;
  try {
    await tdbStartPoolPlayAtomic(t);
    await tdbRefreshTournaments();
    repaintManage();
  } catch (err) { appNotice({ title: 'Could not start pool play', message: (err && err.message) || 'Try again.' }); }
}

async function mgPoolsRedraw() {
  if (!state.isAdmin) return;
  const t = mgActiveTournament();
  if (!t) return;
  if (!(await appConfirm({ title: 'Draw again', message: 'Shuffle the teams into new pools?', confirmText: 'Draw again' }))) return;
  try {
    await tdbDrawPoolsAtomic(t);
    await tdbRefreshTournaments();
    repaintManage();
  } catch (err) { appNotice({ title: 'Could not draw pools', message: (err && err.message) || 'Try again.' }); }
}

async function mgPoolsEditNets(poolId) {
  if (!state.isAdmin) return;
  const pool = (state.tournamentPools || []).find((p) => p.id === poolId);
  if (!pool) return;
  const cur = [...new Set((state.tournamentMatches || []).filter((m) => m.pool_id === pool.id && m.net != null).map((m) => m.net))].sort((a, b) => a - b);
  const input = await appPrompt({ title: 'Pool ' + (pool.label || '') + ' nets', message: 'Which nets does this pool play on? Separate with commas. Re-assigns its unplayed games.', value: cur.join(', '), placeholder: 'e.g. 1, 2', confirmText: 'Save' });
  if (input == null) return;
  const nets = String(input).split(/[,\s]+/).map((s) => parseInt(s, 10)).filter((n) => !isNaN(n));
  try {
    await tdbSetPoolNets(pool, nets, state.tournamentMatches || []);
    await tdbRefreshTournaments();
    repaintManage();
  } catch (err) { appNotice({ title: 'Could not update nets', message: (err && err.message) || 'Try again.' }); }
}

async function mgPoolsResetPools() {
  if (!state.isAdmin) return;
  const t = mgActiveTournament();
  if (!t) return;
  const nm = (t.name || '').trim() || 'this tournament';
  const typed = await appPrompt({ title: 'Reset pools', message: `This clears every pool result and re-draws. Type the tournament name to confirm.`, placeholder: nm, confirmText: 'Reset pools' });
  if (String(typed || '').trim() !== nm) return;
  try {
    await tdbSetTournamentFields(t.id, { status: 'setup' });
    if (typeof _autoGenPrompted !== 'undefined' && _autoGenPrompted) delete _autoGenPrompted[t.id];
    await tdbDrawPoolsAtomic({ ...t, status: 'setup' });
    await tdbRefreshTournaments();
    mgpControlsOpen = false;
    repaintManage();
  } catch (err) { appNotice({ title: 'Could not reset pools', message: (err && err.message) || 'Try again.' }); }
}

// ── Task 8 (pick R10-C): Bracket admin — by-round tap-to-score rows + editor sheet + persisted seed ─────
// mgtView==='bracket'. Three states off tournament.status:
//   pre-bracket (setup / pools) → the seeding list (rank + team name + ▲/▼ reorder) + Generate the bracket
//     (mockup bk-c). Generate persists the FINAL order into tournaments.seed_override (0049) then runs the
//     existing tdbGenerateBracket → generate_bracket_atomic. Pre-0049 tolerant (see mgBracketGenerate).
//   live (bracket) → compact rows grouped BY ROUND (Winners / Losers / Grand Final, mockup bk2-c). Every
//     resolved row (live, up-next, final) opens the SHARED body-level openMgScoreSheet(matchId) from T7 —
//     match-generic on phase 'main', so there is NO second editor. Unresolved (TBD) rows render muted +
//     non-tappable. Rows repaint live via the poll (the manage container swap; the score sheet is body-level
//     → immune), so no partialRender exception is needed here.
//   completed → the final rows + a quiet "close-out lives in its own page" line.
// §51 matte, Barlow display, single --accent, flat on stone (mgbk-* kit per bk2-c/bk-c values).
const MGBK_UP_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>';
const MGBK_DN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';

// The tournament the Bracket view manages. Unlike the other sub-views, this one has a COMPLETED state
// (bk2-c) — and manageLeadTournament() deliberately excludes 'completed'. Resolve the ACTIVE tournament
// first (the one being managed, whose teams/matches are already loaded into state for activeTournamentId),
// falling back to the lead resolver when there is no active id.
function mgBracketTournament() {
  const byActive = state.activeTournamentId ? (state.tournaments || []).find((x) => x.id === state.activeTournamentId) : null;
  return byActive || manageLeadTournament();
}

function buildMgBracketHTML() {
  const t = mgBracketTournament();
  const header = `<div class="pd-pagehdr">`
    + `<button type="button" class="pd-back" data-mgt-back aria-label="Back to Tournament">${PK_BACK_SVG}</button>`
    + `<div class="pd-htitle">Bracket &amp; scores</div></div>`;
  if (!t) return header + `<div class="pd-empty">No tournament to build a bracket for yet.</div>`;
  const status = t.status || 'setup';
  if (status === 'bracket' || status === 'completed') {
    return header + mgBracketLiveHTML(t) + mgBracketControlsHTML(t, status === 'completed');
  }
  return header + mgBracketSeedingHTML(t);
}

// Pre-bracket seeding (mockup bk-c): the cross-pool seed order (computeSeeding — win% then point diff) with
// the admin's transient ▲/▼ override applied. REUSES the old shell's seed-override MUTATION (state.seedOverride
// shape + currentSeedOrder), rendered as the flat bk-c list. Generate is locked until every pool game is final
// (tdbGenerateBracket enforces it server-checked too).
function mgBracketSeedingHTML(t) {
  const teams = Array.isArray(state.tournamentTeams) ? state.tournamentTeams : [];
  const poolMatches = (Array.isArray(state.tournamentMatches) ? state.tournamentMatches : []).filter((m) => m.phase === 'pool');
  if (!poolMatches.length) {
    return `<div class="pl-sect">Seeding</div>`
      + `<div class="pd-empty">Draw pools and play them out first — the bracket seeds from the pool results. Set that up in Pools &amp; schedule.</div>`;
  }
  let rows = computeSeeding(teams, poolMatches);
  if (!rows.length) {
    return `<div class="pl-sect">Seeding</div>`
      + `<div class="pd-empty">Score a pool game to start the seeding — teams rank by win %, then point differential.</div>`;
  }
  let custom = false;
  if (state.seedOverride && state.seedOverride.id === state.activeTournamentId) {
    const ov = state.seedOverride.order || [];
    const byId = {}; rows.forEach((r) => { byId[r.teamId] = r; });
    if (ov.length === rows.length && ov.every((id) => byId[id])) { rows = ov.map((id, i) => ({ ...byId[id], seed: i + 1 })); custom = true; }
  }
  const allFinal = poolMatches.every((m) => m.status === 'final' || !m.team_a_id || !m.team_b_id);
  const last = rows.length - 1;
  const seedRows = rows.map((r, i) => `<div class="mgbk-seed">`
    + `<span class="mgbk-sd">${i + 1}</span>`
    + `<span class="mgbk-snm">${escapeHTML(r.name)}</span>`
    + `<span class="mgbk-arr">`
      + `<button type="button" class="mgbk-ab" data-mgbk-seedup="${escapeHTMLText(String(r.teamId))}"${i === 0 ? ' disabled' : ''} aria-label="Move ${escapeHTMLText(r.name)} up">${MGBK_UP_SVG}</button>`
      + `<button type="button" class="mgbk-ab" data-mgbk-seeddown="${escapeHTMLText(String(r.teamId))}"${i === last ? ' disabled' : ''} aria-label="Move ${escapeHTMLText(r.name)} down">${MGBK_DN_SVG}</button>`
    + `</span></div>`).join('');
  const resetLink = custom ? `<button type="button" class="mgbk-seedreset" data-mgbk-seedreset>Reset to the computed seeding</button>` : '';
  const cta = `<button type="button" class="mgt-cta" data-mgbk-generate${allFinal ? '' : ' disabled'}>Generate the bracket</button>`;
  const note = allFinal
    ? `<div class="mgbk-note">Double elimination · seeding saves with the bracket · after this, score on the tree.</div>`
    : `<div class="mgbk-note">Finish every pool game first — the seeding is provisional until then.</div>`;
  return `<div class="pl-sect">Seeding — from pool results</div>${seedRows}${resetLink}${cta}${note}`;
}

// Group the bracket's main matches by round (side + round) and order the groups ACTIVE-FIRST (mockup bk2-c
// leads with the live round, then up-next, then finished, then still-TBD) — not raw play order. Within a
// group, rows keep queue/net play order.
function mgBracketGroups(main) {
  const byKey = {};
  main.forEach((m) => {
    const key = m.side + ':' + m.round;
    (byKey[key] = byKey[key] || { side: m.side, round: m.round, matches: [] }).matches.push(m);
  });
  const groups = Object.keys(byKey).map((k) => {
    const g = byKey[k];
    g.matches.sort((a, b) => (a.queue_order || 0) - (b.queue_order || 0));
    g.minQ = Math.min(...g.matches.map((m) => m.queue_order || 0));
    const resolved = g.matches.filter((m) => m.team_a_id && m.team_b_id);
    const hasLive = g.matches.some((m) => m.status === 'live');
    const hasReady = resolved.some((m) => m.status !== 'final' && m.status !== 'live');
    const allFinal = resolved.length > 0 && resolved.every((m) => m.status === 'final');
    g.prio = hasLive ? 0 : (hasReady ? 1 : (allFinal ? 2 : 3));
    g.allFinal = allFinal;
    return g;
  });
  groups.sort((a, b) => a.prio - b.prio || a.minQ - b.minQ);
  return groups;
}

function mgBracketGroupLabel(g) {
  if (g.side === 'grand_final') { const m0 = g.matches[0]; return (m0 && m0.round_label) || 'Grand Final'; }
  const base = (g.side === 'winners' ? 'Winners' : 'Losers') + ' · Round ' + g.round;
  return g.allFinal ? base + ' · final' : base; // a fully-final round carries the · final suffix (bk2-c)
}

function mgBracketLiveHTML(t) {
  const teams = Array.isArray(state.tournamentTeams) ? state.tournamentTeams : [];
  const main = (Array.isArray(state.tournamentMatches) ? state.tournamentMatches : []).filter((m) => m.phase === 'main');
  if (!main.length) return `<div class="pd-empty">The bracket has no games yet.</div>`;
  return mgBracketGroups(main).map((g) => {
    const rows = g.matches.map((m) => mgBracketRowHTML(m, teams)).join('');
    return `<div class="mgbk-rnd">${escapeHTML(mgBracketGroupLabel(g))}</div>${rows}`;
  }).join('');
}

// One bracket game row. Resolved rows (both teams set) are the whole-row tap target (data-mgbk-score) → the
// shared openMgScoreSheet. A TBD row (a slot still fed by an unfinished game) is muted + non-tappable and
// shows the source labels ("Winner of …") instead of team names.
function mgBracketRowHTML(m, teams) {
  const EN = '–';
  const hasBoth = !!(m.team_a_id && m.team_b_id);
  if (!hasBoth) {
    const aLbl = m.team_a_id ? teamNameById(teams, m.team_a_id) : (m.source_a || 'TBD');
    const bLbl = m.team_b_id ? teamNameById(teams, m.team_b_id) : (m.source_b || 'TBD');
    return `<div class="mgbk-g mgbk-tbd"><div class="mgbk-gt">`
      + `<div class="mgbk-gn">${escapeHTML(aLbl)} <span class="mgbk-vs">vs</span> ${escapeHTML(bLbl)}</div>`
      + `<div class="mgbk-gm">Waiting on the feeding games</div></div></div>`;
  }
  const idAttr = escapeHTMLText(String(m.id));
  const aN = escapeHTML(teamNameById(teams, m.team_a_id));
  const bN = escapeHTML(teamNameById(teams, m.team_b_id));
  const net = m.net != null ? ('Net ' + m.net) : '';
  if (m.status === 'final') {
    const aWin = m.winner_team_id === m.team_a_id;
    const w = aWin ? aN : bN, l = aWin ? bN : aN;
    const ws = aWin ? m.score_a : m.score_b, ls = aWin ? m.score_b : m.score_a;
    const scr = (ws != null && ls != null) ? `<span class="mgbk-fsc">${escapeHTML(String(ws))}${EN}${escapeHTML(String(ls))}</span>` : '';
    return `<div class="mgbk-g" data-mgbk-score="${idAttr}"><div class="mgbk-gt">`
      + `<div class="mgbk-gn"><b>${w}</b> <span class="mgbk-def">def.</span> ${l}</div>`
      + `<div class="mgbk-gm">Tap to edit</div></div>${scr}</div>`;
  }
  if (m.status === 'live') {
    const sa = Number(m.score_a) || 0, sb = Number(m.score_b) || 0;
    return `<div class="mgbk-g mgbk-live" data-mgbk-score="${idAttr}"><div class="mgbk-gt">`
      + `<div class="mgbk-gn">${aN} <span class="mgbk-vs">vs</span> ${bN}</div>`
      + `<div class="mgbk-gm">${escapeHTML(net ? net + ' · tap to score' : 'Tap to score')}</div></div>`
      + `<span class="mgbk-sc">${sa}${EN}${sb}</span><span class="mgbk-pill">LIVE</span></div>`;
  }
  // scheduled / ready (both teams set) — up next, still tappable to score ahead
  return `<div class="mgbk-g" data-mgbk-score="${idAttr}"><div class="mgbk-gt">`
    + `<div class="mgbk-gn">${aN} <span class="mgbk-vs">vs</span> ${bN}</div>`
    + `<div class="mgbk-gm">${escapeHTML(net ? net + ' when it opens' : 'Up next')}</div></div>`
    + `<span class="mgbk-up">UP NEXT</span></div>`;
}

function mgBracketControlsHTML(t, completed) {
  const doneNote = completed ? `<div class="mgbk-done">Tournament completed — close-out lives in its own page.</div>` : '';
  return doneNote
    + `<div class="pl-sect">Bracket controls</div>`
    + `<button type="button" class="mgbk-players" data-mgbk-players>`
      + `<div class="mg-rb"><div class="mg-rn">Full bracket tree — the players' view</div>`
      + `<div class="mg-rs">Open the public bracket page</div></div>${MG_CHEV}</button>`
    + `<button type="button" class="mgts-danger" data-mgbk-reset>Reset the bracket</button>`
    + `<div class="mgbk-note">Clears the bracket and returns to pools — pool games and scores are kept. Type the tournament name to confirm.</div>`;
}

// Nudge a team up (dir -1) / down (dir +1) one seed. Reuses the old shell's mutation exactly (currentSeedOrder
// + state.seedOverride keyed on the active tournament), then a container-swap repaint (no in-panel input to
// clobber → no full render()).
function mgBracketReseed(id, dir) {
  if (!state.isAdmin) return;
  const order = currentSeedOrder();
  const i = order.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return;
  const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
  state.seedOverride = { id: state.activeTournamentId, order };
  repaintManage();
}

// Generate the bracket: persist the FINAL seed order into tournaments.seed_override (0049), THEN run the
// existing tdbGenerateBracket → generate_bracket_atomic. PRE-0049 TOLERANCE: if the column does not exist yet
// the persist write throws (undefined column) — we swallow it and generate anyway (the override still applies
// in-session via the seedOrder argument), telling the admin it will be saved permanently after the update.
async function mgBracketGenerate() {
  if (!state.isAdmin) return;
  const t = mgBracketTournament();
  if (!t) return;
  const seedOrder = currentSeedOrder(); // the final order (the admin's override, or the computed seeding)
  let persisted = true;
  try {
    await tdbSetTournamentFields(t.id, { seed_override: seedOrder });
  } catch (err) {
    persisted = false; // 0049 not applied yet — proceed; the override still applies this run
    console.warn('seed_override persist (pre-0049?)', err);
  }
  try {
    await tdbGenerateBracket(t, seedOrder);
    state.seedOverride = null;
    state.tournamentPickedTeamId = null; state.bracketSide = null; state.bracketRound = null;
    if (typeof _autoGenPrompted !== 'undefined' && _autoGenPrompted) delete _autoGenPrompted[t.id];
    await tdbRefreshTournaments();
    repaintManage();
    if (!persisted) appNotice({ title: 'Bracket is live', message: 'Your seed order applied for this run. It will be saved permanently after the next app update.' });
  } catch (err) {
    appNotice({ title: 'Could not generate the bracket', message: (err && err.message) || 'Try again.' });
  }
}

// Reset the bracket (type-name unlock, like T6/T7): the existing tdbResetBracket deletes the phase='main'
// matches and drops status back to 'pools' — pool games and scores are kept. Re-arms the auto-generate prompt.
async function mgBracketReset() {
  if (!state.isAdmin) return;
  const t = mgBracketTournament();
  if (!t) return;
  const nm = (t.name || '').trim() || 'this tournament';
  const typed = await appPrompt({ title: 'Reset the bracket', message: 'This clears the bracket and returns to pools. Pool games and scores are kept — you can re-generate. Type the tournament name to confirm.', placeholder: nm, confirmText: 'Reset the bracket' });
  if (String(typed || '').trim() !== nm) return;
  try {
    await tdbResetBracket(t);
    if (typeof _autoGenPrompted !== 'undefined' && _autoGenPrompted) delete _autoGenPrompted[t.id];
    state.tournamentPickedTeamId = null; state.bracketSide = null; state.bracketRound = null;
    await tdbRefreshTournaments();
    repaintManage();
  } catch (err) { appNotice({ title: 'Could not reset the bracket', message: (err && err.message) || 'Try again.' }); }
}


function renderPublicShell() {
  const sharedSyncNoticeHTML = buildSharedSyncNoticeHTML();
  return `
<div id="app-shell">
  <img class="pd-watermark" src="/logo-mark.png" alt="" aria-hidden="true" />
  <header id="app-header" class="pd-header">
    <span class="app-header-mode">PUBLIC</span>
    ${buildPublicHeaderHTML()}
    <div id="js-sync-notice">${sharedSyncNoticeHTML}</div>
  </header>
  <div id="app-content">
    <div id="tab-home" class="tab-panel">
      <div class="container">
        ${publicHomeHTML()}
      </div>
    </div>
    <div id="tab-players" class="tab-panel">
      <div class="container">
        <div id="js-checkin-stats">${buildCheckinStatsHTML()}</div>
        ${publicCheckinHTML()}
      </div>
    </div>
    <div id="tab-tournament" class="tab-panel">
      <div class="container">
        ${buildPublicTournamentRootHTML()}
      </div>
    </div>
    <div id="tab-myteam" class="tab-panel">
      <div class="container">
        ${buildMyTeamPageHTML()}
      </div>
    </div>
    <div id="tab-history" class="tab-panel">
      <div class="container">
        ${buildHistoryPageHTML()}
      </div>
    </div>
    ${state.isAdmin ? `<div id="tab-manage" class="tab-panel">
      <div class="container">
        ${manageContainerHTML()}
      </div>
    </div>` : ''}
  </div>
  ${copilotShellHTML()}
  <nav id="bottom-nav">${buildPublicNavInnerHTML()}</nav>
</div>
  `;
}

// C26 item 2: Admin surface shell — hardcodes the admin branch of every former interleaved
// `state.isAdmin ?` ternary. Returns the full #app-shell string.
// C26 item 3b: admin Dashboard ("run the night"), layout A — statcard + 2x2 quick-actions + Co-pilot teaser.
// Count + per-group reuse the SAME source as the Players stats card (state.checkedIn.length + computeCheckedInByGroup)
// so the Dashboard matches Supabase. NO skill, NO emoji, SVG icons only, Direction-A tokens only.
// Reliability fix (2026-06-20): the dashboard checked-in stat is refreshed by partialRender (like the
// Players-tab #js-checkin-stats) so it stays TRUE after a check-in instead of going stale at its login value.
function buildDashboardStatHTML() {
  const group = state.isAdmin ? computeCheckedInByGroup() : [];
  const grpLine = group.length
    ? `<div class="ad-grpline">${group.map((r) => `<span><b>${r.in}</b> ${escapeHTML(r.groupLabel)}</span>`).join('')}</div>`
    : '';
  return `<div class="ad-statbig"><span class="ad-statnum">${state.checkedIn.length}</span><span class="ad-statlab">checked in</span></div>${grpLine}`;
}


// C28 Slice 1: the admin AI co-pilot chat (layout A — chat thread; Mike picked it from 3 §38 options).
// READ-ONLY: it answers from the current state, never acts (acting is Slice 2). The thread renders from
// state.copilotMessages so a full render() rebuild preserves history; handleCopilotSend appends to both
// the array AND the DOM directly (no full re-render per message, so the input keeps focus). The context
// snapshot is built by buildCopilotContext (pure.js) and is skill-redacted before it ever leaves the
// browser; the copilot edge function holds the API key and is admin-JWT-gated.

// Render a co-pilot answer for a chat bubble: escape (XSS-safe) FIRST, then lightly format the
// markdown Haiku tends to emit — **bold** and "- "/"* " bullets — since a phone bubble can't show raw
// markdown. The <strong> tags wrap already-escaped text, so there's no injection surface.
function copilotFormat(text) {
  // Reliability (2026-06-24): strip emojis (no-emoji UI rule). Belt-and-suspenders with the edge-fn
  // system prompt — the model occasionally adds them (e.g. "🏐🏀") and a chat bubble must stay emoji-free.
  const noEmoji = String(text || '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}️‍]/gu, '');
  return escapeHTMLText(noEmoji)
    .split('\n')
    .map((line) => line
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/^\s*[-*]\s+/, '• ')
      .replace(/[ \t]+$/, ''))
    .join('<br>');
}

function copilotBubbleHTML(m) {
  let cls = 'cop-msg ' + (m.role === 'user' ? 'cop-user' : 'cop-bot');
  if (m.isError) cls += ' cop-error';
  if (m.loading) cls += ' cop-loading';
  const inner = m.loading
    ? '<span class="cop-dots"><span></span><span></span><span></span></span>'
    : (m.role === 'user'
        ? escapeHTMLText(String(m.text || '')).replace(/\n/g, '<br>')
        : copilotFormat(m.text));
  return `<div class="${cls}" data-cop-msg="${escapeHTMLText(m.id)}">${inner}</div>`;
}


// ===== Task 12 (session-10 §6): Co-pilot floating bubble + chat-on-stone (Mike's design) =====
// A small admin-only round bubble rides ABOVE the floating bottom nav on every public tab; tapping it
// opens a full-screen chat on the bare stone bg + the shell's own pd-watermark (NO card/panel chrome).
// This is NEW markup that REUSES the shipped copilot message flow verbatim by keeping the SAME element
// ids/roles the bound handlers target: #copilot-thread (copilotRenderBubble), #copilot-input
// (send/keydown/focus handlers → the copilot-typing nav hide), data-role="copilot-send". The old-shell
// copilot tab (adminCopilotHTML) was deleted in Task 14, so there is no duplicate-id collision.
// copilotOpen is a module flag so the view survives partialRender
// polls (they never repaint #cop-chat) and is re-applied by activateMainTab after a full render().
let copilotOpen = false;

function copilotFabHTML() {
  // §51 matte: soft shadow, no glow. White 4-point sparkle (same path as the co-pilot head — SVG, no emoji).
  return `<button type="button" class="cop-fab" data-cop-open aria-label="Open the co-pilot">
  <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22" aria-hidden="true"><path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9z"/></svg>
</button>`;
}

function buildCopilotChatHTML() {
  const msgs = Array.isArray(state.copilotMessages) ? state.copilotMessages : [];
  // Plain English, never "night/tonight" (spec §3). Empty thread → this greeting; otherwise rebuild from state.
  const greeting = `<div class="cop-msg cop-bot cop-greet">Ask what's happening, or to check players in, build teams, and record scores.</div>`;
  const thread = msgs.length ? msgs.map(copilotBubbleHTML).join('') : greeting;
  return `<div id="cop-chat" class="cop2" aria-hidden="true">
  <div class="cop2-head">
    <button type="button" class="cop2-back" data-cop-close aria-label="Back">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
    </button>
    <span class="cop2-title">Co-pilot</span>
  </div>
  <div id="copilot-thread" class="cop2-thread">${thread}</div>
  <div class="cop2-inbar">
    <input type="text" id="copilot-input" class="cop2-input" placeholder="Ask the co-pilot&hellip;" aria-label="Ask the co-pilot" autocomplete="off" />
    <button type="button" class="cop2-send" data-role="copilot-send" aria-label="Send">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
    </button>
  </div>
</div>`;
}

// Shell fragment: the fab + the (hidden-until-open) chat, admin-only, never on the old shell.
function copilotShellHTML() {
  if (!state.isAdmin) return '';
  return copilotFabHTML() + buildCopilotChatHTML();
}

// Assemble the active-tournament slice of the co-pilot snapshot (null when none is live).
function copilotTournamentInput() {
  const id = state.activeTournamentId;
  if (!id) return null;
  const active = (state.tournaments || []).find((t) => t.id === id);
  if (!active || !['pools', 'bracket', 'completed'].includes(active.status)) return null;
  return { name: active.name, status: active.status, teams: state.tournamentTeams || [], matches: state.tournamentMatches || [] };
}

// Tournaments OPEN for registration (status 'setup') — so the co-pilot can SEE where to register teams +
// each tournament's team_size (copilotTournamentInput only surfaces pools/bracket/completed). The active
// tournament's current team names are included; others list count only (their rosters aren't loaded).
function copilotOpenTournamentsInput() {
  return (state.tournaments || [])
    .filter((t) => t.status === 'setup')
    .map((t) => ({
      name: t.name || '',
      registration_open: !!t.registration_open,
      team_size: t.team_size || 4,
      teams: (state.activeTournamentId === t.id ? (state.tournamentTeams || []) : []).map((x) => x.name),
    }));
}

let copilotMsgSeq = 0;
function copilotNextId() { copilotMsgSeq += 1; return 'cm' + copilotMsgSeq; }

function copilotRenderBubble(m) {
  const thread = document.getElementById('copilot-thread');
  if (!thread) return;
  const greet = thread.querySelector('.cop-greet');
  if (greet) greet.remove();
  thread.insertAdjacentHTML('beforeend', copilotBubbleHTML(m));
  const last = thread.lastElementChild;
  if (last && last.scrollIntoView) last.scrollIntoView({ block: 'nearest' });
}

function appendCopilotMessage(role, text, opts) {
  const m = { id: copilotNextId(), role, text, loading: !!(opts && opts.loading), isError: !!(opts && opts.isError) };
  if (!Array.isArray(state.copilotMessages)) state.copilotMessages = [];
  state.copilotMessages.push(m);
  copilotRenderBubble(m);
  return m.id;
}

function replaceCopilotMessage(id, text, opts) {
  const m = (state.copilotMessages || []).find((x) => x.id === id);
  if (m) { m.text = text; m.loading = false; m.isError = !!(opts && opts.isError); }
  const el = document.querySelector(`[data-cop-msg="${id}"]`);
  if (el && m) {
    el.outerHTML = copilotBubbleHTML(m);
    const fresh = document.querySelector(`[data-cop-msg="${id}"]`);
    if (fresh && fresh.scrollIntoView) fresh.scrollIntoView({ block: 'nearest' });
  }
}

async function handleCopilotSend(question) {
  const q = String(question || '').trim();
  if (!q || !supabaseClient) return;
  appendCopilotMessage('user', q);
  const loadingId = appendCopilotMessage('copilot', '', { loading: true });
  try {
    const { text, undos } = await runCopilotTurn(q);   // C28 Slice 2: tool loop (answers AND acts)
    replaceCopilotMessage(loadingId, text);
    if (undos && undos.length) copilotAttachUndo(loadingId, undos);
  } catch (_e) {
    replaceCopilotMessage(loadingId, "Couldn't reach the co-pilot — try again.", { isError: true });
  }
}

// Co-pilot chat handlers — bound once, document-delegated (same pattern as the other admin handlers),
// so they survive every innerHTML swap.
(function ensureCopilotBound() {
  if (window.__copilotBound) return;
  window.__copilotBound = true;
  document.addEventListener('click', function onCopilotClick(e) {
    if (!(e.target instanceof Element)) return;
    // Task 12: open the chat from the floating bubble, close it from the back chevron. copilotOpen is the
    // module flag CSS keys the on-stone view off of; it persists across partialRender polls and full renders.
    if (e.target.closest('[data-cop-open]')) {
      e.preventDefault();
      copilotOpen = true;
      document.body.classList.add('copilot-open');
      const thread = document.getElementById('copilot-thread');
      if (thread) thread.scrollTop = thread.scrollHeight; // land on the newest message
      const input = document.getElementById('copilot-input');
      if (input && input.focus) input.focus();
      return;
    }
    if (e.target.closest('[data-cop-close]')) {
      e.preventDefault();
      copilotOpen = false;
      document.body.classList.remove('copilot-open');
      document.body.classList.remove('copilot-typing'); // drop the keyboard-up nav hide on the way out
      return;
    }
    const chip = e.target.closest('[data-cop-chip]');
    if (chip) {
      e.preventDefault();
      handleCopilotSend(chip.getAttribute('data-cop-chip'));
      return;
    }
    const send = e.target.closest('[data-role="copilot-send"]');
    if (send) {
      e.preventDefault();
      const input = document.getElementById('copilot-input');
      if (input) { handleCopilotSend(input.value); input.value = ''; input.focus(); }
    }
  });
  document.addEventListener('keydown', function onCopilotKey(e) {
    if (e.key !== 'Enter') return;
    const t = e.target;
    if (!(t instanceof Element) || t.id !== 'copilot-input') return;
    e.preventDefault();
    handleCopilotSend(t.value);
    t.value = '';
  });
  // Hide the bottom nav while typing (keyboard up) so it doesn't ride up above the keyboard with the
  // input — Mike: "the bottom nav shouldn't go up too." Toggled via a body class (CSS hides the nav).
  document.addEventListener('focusin', function onCopilotFocusIn(e) {
    if (e.target instanceof Element && e.target.id === 'copilot-input') document.body.classList.add('copilot-typing');
  });
  document.addEventListener('focusout', function onCopilotFocusOut(e) {
    if (e.target instanceof Element && e.target.id === 'copilot-input') document.body.classList.remove('copilot-typing');
  });
})();

// ===== C28 Slice 2 — co-pilot ACTING (browser-driven tool loop; instant actions) =====
// The browser holds the Claude conversation, asks the copilot edge fn (the key-holder) what to do, runs the
// matching local executor with the admin's OWN privileges + the per-tool safety policy (enforced HERE, not
// trusted to the model), logs to copilot_actions, and feeds the result back until Claude finishes.
// Task 4 ships the INSTANT actions (check-in/out, make-teams). Task 5 adds the CONFIRM-required actions
// (submit-score, setup-tournament, generate-bracket) — gated by copilotConfirmCard (the appConfirm modal).
const COPILOT_TOOLS = [
  { name: 'check_in', description: 'Check a player in for tonight, by name.',
    input_schema: { type: 'object', properties: { name: { type: 'string', description: "the player's name" } }, required: ['name'] } },
  { name: 'check_out', description: 'Check a player out, by name.',
    input_schema: { type: 'object', properties: { name: { type: 'string', description: "the player's name" } }, required: ['name'] } },
  { name: 'make_teams', description: 'Make N balanced teams from the players who are checked in, and set up the courts.',
    input_schema: { type: 'object', properties: { count: { type: 'integer', description: 'how many teams' } }, required: ['count'] } },
  { name: 'submit_score', description: 'Record the score of a tournament match (pool or bracket) between two teams. Confirms before saving.',
    input_schema: { type: 'object', properties: {
      team_a: { type: 'string', description: "one team's name" },
      team_b: { type: 'string', description: "the other team's name" },
      score_a: { type: 'integer', description: "team_a's score" },
      score_b: { type: 'integer', description: "team_b's score" } },
      required: ['team_a', 'team_b', 'score_a', 'score_b'] } },
  { name: 'setup_tournament', description: 'Create a tournament with the given team names, draw pools, and start pool play. Confirms first.',
    input_schema: { type: 'object', properties: {
      name: { type: 'string', description: 'tournament name' },
      teams: { type: 'array', items: { type: 'string' }, description: 'the team names (at least 2)' },
      pool_count: { type: 'integer', description: 'number of pools (optional; default 4, auto-clamped to teams)' },
      net_count: { type: 'integer', description: 'number of nets/courts (optional; default 10)' } },
      required: ['name', 'teams'] } },
  { name: 'generate_bracket', description: 'Generate the playoff bracket for the active tournament once every pool game is final. Confirms first.',
    input_schema: { type: 'object', properties: {}, required: [] } },
  { name: 'create_tournament', description: "Create a tournament that is OPEN for registration and does NOT start pool play (unlike setup_tournament). Optionally include teams with their players to register them right away. Use this when the admin wants to set up a tournament and enter teams/players. Each team must have exactly team_size players (default 4). Confirms first.",
    input_schema: { type: 'object', properties: {
      name: { type: 'string', description: 'tournament name' },
      team_size: { type: 'integer', description: 'players per team (optional; default 4)' },
      pool_count: { type: 'integer', description: 'number of pools (optional; default 4)' },
      net_count: { type: 'integer', description: 'number of nets/courts (optional; default 10)' },
      teams: { type: 'array', description: 'optional teams to register now',
        items: { type: 'object', properties: { name: { type: 'string' }, players: { type: 'array', items: { type: 'string' } } }, required: ['name', 'players'] } } },
      required: ['name'] } },
  { name: 'register_team', description: "Add ONE team and its players to a tournament that is open for registration. Use this to enter a team with its roster. The team must have exactly the tournament's team_size players. Targets the open tournament named, or the one currently open if only one. Confirms first.",
    input_schema: { type: 'object', properties: {
      team_name: { type: 'string', description: 'the team name' },
      players: { type: 'array', items: { type: 'string' }, description: "the team's player names (exactly team_size of them)" },
      tournament_name: { type: 'string', description: 'which open tournament (optional if only one is open)' } },
      required: ['team_name', 'players'] } },
];

// Persist a check-in/out the SAME way the kiosk does: local state already set optimistically; write via the
// C21 RPC, queue a refresh, fall back to the durable outbox on error.
async function copilotPersistCheck(kind, player) {
  if (!supabaseClient || !player.id) return;
  try {
    const { error } = await supabaseClient.rpc(kind, { p_id: player.id });
    if (error) throw error;
    queueSupabaseRefresh();
  } catch (err) {
    console.error('copilot ' + kind, err);
    outboxEnqueue({ key: 'att:' + player.id, kind, payload: { p_id: player.id }, ts: Date.now() });
  }
}

const copilotExecutors = {
  async check_in(args) {
    const r = resolvePlayerByName(state.players, args.name);
    if (!r.ok) return { is_error: true, args, result: r.reason === 'ambiguous'
      ? `More than one match for "${args.name}": ${r.matches.map((m) => m.name + (m.group ? ` (${m.group})` : '')).join(', ')}. Which one?`
      : `I couldn't find a player named "${args.name}".` };
    const player = (state.players || []).find((p) => p.id === r.player.id) || r.player;
    if (!checkInPlayer(player)) return { args: { name: r.player.name }, result: `${r.player.name} is already checked in.` };
    await copilotPersistCheck('check_in', player); render();
    return { args: { name: r.player.name }, result: `Checked in ${r.player.name}.`,
      undo: async () => { if (checkOutPlayer(player)) await copilotPersistCheck('check_out', player); render(); } };
  },
  async check_out(args) {
    const r = resolvePlayerByName(state.players, args.name);
    if (!r.ok) return { is_error: true, args, result: r.reason === 'ambiguous'
      ? `More than one match for "${args.name}": ${r.matches.map((m) => m.name).join(', ')}. Which one?`
      : `I couldn't find a player named "${args.name}".` };
    const player = (state.players || []).find((p) => p.id === r.player.id) || r.player;
    if (!checkOutPlayer(player)) return { args: { name: r.player.name }, result: `${r.player.name} isn't checked in.` };
    await copilotPersistCheck('check_out', player); render();
    return { args: { name: r.player.name }, result: `Checked out ${r.player.name}.`,
      undo: async () => { if (checkInPlayer(player)) await copilotPersistCheck('check_in', player); render(); } };
  },
  async make_teams(args) {
    const playerCount = (state.checkedIn || []).length;
    if (playerCount < 2) return { is_error: true, args, result: "Need at least 2 checked-in players to make teams." };
    const count = Math.max(2, Math.min(playerCount, Math.floor(Number(args.count)) || 2)); // CT1: clamp to player count so we never make empty "Team of 0" nets
    const prev = { teams: state.generatedTeams, order: state.liveCourtOrder, results: state.liveMatchResults,
      snaps: state.liveMatchSkillSnapshots, summary: state.generatedTeamsSummary, groupCount: state.groupCount, lastTeamSize: state.lastTeamSize };
    const gen = generateBalancedGroups(state.players, state.checkedIn, count, state.generatedTeams);
    state.lastTeamSize = null; state.groupCount = count;
    state.generatedTeams = gen.teams; state.generatedTeamsSummary = gen.summary;
    state.liveCourtOrder = defaultLiveCourtOrder(gen.teams.length);
    state.liveMatchResults = {}; state.liveMatchSkillSnapshots = {};
    saveLocal(); render();
    return { args: { count }, result: `Made ${gen.teams.length} teams from ${state.checkedIn.length} checked-in players.`,
      undo: () => { state.generatedTeams = prev.teams; state.liveCourtOrder = prev.order; state.liveMatchResults = prev.results;
        state.liveMatchSkillSnapshots = prev.snaps; state.generatedTeamsSummary = prev.summary; state.groupCount = prev.groupCount;
        state.lastTeamSize = prev.lastTeamSize; saveLocal(); render(); } };
  },
  // --- Task 5: CONFIRM-required actions (no undo — the confirm IS the safety). All mutate prod via the
  // same tdb* paths the admin tournament UI uses, then refresh state + render. ---
  async submit_score(args) {
    if (!state.activeTournamentId) return { is_error: true, args, result: 'No active tournament to score.' };
    const r = resolveTournamentMatch(state.tournamentTeams, state.tournamentMatches, args.team_a, args.team_b);
    if (!r.ok) {
      if (r.reason === 'team') return { is_error: true, args, result: `Couldn't match those team names. Teams: ${r.teams.join(', ')}.` };
      if (r.reason === 'same') return { is_error: true, args, result: 'Those are the same team.' };
      return { is_error: true, args, result: `No unplayed match between ${r.teamA} and ${r.teamB}.` };
    }
    const sa = Number(args.score_a), sb = Number(args.score_b);
    const [scoreA, scoreB] = r.orient === 'ab' ? [sa, sb] : [sb, sa];
    await tdbSubmitResult(r.match, scoreA, scoreB);
    await tdbRefreshTournaments(); render();
    return { args: { team_a: r.teamA, team_b: r.teamB, score_a: sa, score_b: sb }, result: `Recorded ${r.teamA} ${sa}–${sb} ${r.teamB}.` };
  },
  async setup_tournament(args) {
    const name = String(args.name || '').trim();
    const teamNames = (Array.isArray(args.teams) ? args.teams : []).map((t) => String(t || '').trim()).filter(Boolean);
    const t = await tdbCreateTournament({ name, pool_count: args.pool_count, net_count: args.net_count });
    for (const tn of teamNames) { await tdbAddTeam(t.id, tn); }
    await tdbDrawPools(t);
    await tdbStartPoolPlay(t);
    state.activeTournamentId = t.id;
    await tdbRefreshTournaments(); render();
    return { args: { name, teams: teamNames.length }, result: `Set up "${name}": ${teamNames.length} teams, pools drawn, pool play started.` };
  },
  async generate_bracket() {
    const t = (state.tournaments || []).find((x) => x.id === state.activeTournamentId);
    if (!t) return { is_error: true, args: {}, result: 'No active tournament.' };
    await tdbGenerateBracket(t);
    await tdbRefreshTournaments(); render();
    return { args: { tournament: t.name }, result: `Bracket generated for "${t.name}".` };
  },
  // Create a tournament OPEN for registration (does NOT start pools) + optionally register its teams with
  // players in one shot. Reuses tdbCreateTournament (registration_open=true) + tdbRegisterTeam (the same
  // RPC public self-registration uses — enforces team_size, stores the roster, dup-guard).
  async create_tournament(args) {
    const name = String(args.name || '').trim();
    if (!name) return { is_error: true, args, result: 'A tournament name is required.' };
    const teamSize = Number(args.team_size) > 0 ? Number(args.team_size) : 4;
    const t = await tdbCreateTournament({ name, pool_count: args.pool_count, net_count: args.net_count, preset: { team_size: teamSize } });
    const teams = Array.isArray(args.teams) ? args.teams : [];
    const done = [], failed = [];
    for (const tm of teams) {
      const tn = String((tm && tm.name) || '').trim();
      const roster = Array.isArray(tm && tm.players) ? tm.players : [];
      if (!tn) continue;
      try { await tdbRegisterTeam(t.id, tn, roster, null, false); done.push(tn); }
      catch (e) { failed.push(`${tn} (${(e && e.message) || 'error'})`); }
    }
    state.activeTournamentId = t.id;
    await tdbRefreshTournaments(); render();
    let result = `Created "${name}" — open for registration, ${teamSize} players/team.`;
    if (done.length) result += ` Registered ${done.length} team${done.length === 1 ? '' : 's'}: ${done.join(', ')}.`;
    if (failed.length) result += ` Could not register: ${failed.join('; ')}.`;
    return { args: { name, team_size: teamSize, registered: done.length }, result };
  },
  // Add ONE team + its players to a tournament that's open for registration (named, the active one if it's
  // open, or the only open one). tdbRegisterTeam enforces the team_size + roster rules server-side.
  async register_team(args) {
    const teamName = String(args.team_name || '').trim();
    const roster = Array.isArray(args.players) ? args.players : [];
    if (!teamName) return { is_error: true, args, result: 'A team name is required.' };
    const open = (state.tournaments || []).filter((t) => t.status === 'setup');
    const wanted = String(args.tournament_name || '').trim().toLowerCase();
    let target = null;
    if (wanted) target = open.find((t) => String(t.name || '').trim().toLowerCase() === wanted) || null;
    else target = (state.activeTournamentId && open.find((t) => t.id === state.activeTournamentId)) || (open.length === 1 ? open[0] : null);
    if (!target) {
      if (!open.length) return { is_error: true, args, result: 'No tournament is open for registration. Create one first.' };
      return { is_error: true, args, result: `Which tournament? Open for registration: ${open.map((t) => t.name).join(', ')}.` };
    }
    if (!target.registration_open) return { is_error: true, args, result: `Registration is closed for "${target.name}". Open it first.` };
    try { await tdbRegisterTeam(target.id, teamName, roster, null, false); }
    catch (e) { return { is_error: true, args, result: `Couldn't register "${teamName}": ${(e && e.message) || 'error'}.` }; }
    state.activeTournamentId = target.id;
    await tdbRefreshTournaments(); render();
    return { args: { team_name: teamName, players: roster.length, tournament: target.name },
      result: `Registered "${teamName}" (${roster.length} player${roster.length === 1 ? '' : 's'}) to "${target.name}".` };
  },
};

// Task 5 confirm card: reuse the existing styled appConfirm modal (C49) — a per-tool preview of exactly
// what will happen. Returns true to proceed, false to cancel. (§38-exempt: no new layout.)
async function copilotConfirmCard(tool, input) {
  let title = 'Confirm', message = 'Proceed?', confirmText = 'Do it';
  if (tool === 'submit_score') {
    title = 'Submit score'; confirmText = 'Submit';
    message = `Record ${input.team_a} ${input.score_a}–${input.score_b} ${input.team_b}?`;
  } else if (tool === 'setup_tournament') {
    title = 'Set up tournament'; confirmText = 'Set up';
    const n = Array.isArray(input.teams) ? input.teams.length : 0;
    message = `Create "${String(input.name || '').trim()}" with ${n} teams, draw pools, and start pool play?`;
  } else if (tool === 'generate_bracket') {
    title = 'Generate bracket'; confirmText = 'Generate';
    const t = (state.tournaments || []).find((x) => x.id === state.activeTournamentId);
    message = `Generate the bracket${t ? ` for "${t.name}"` : ''}? This seeds from the pool standings.`;
  } else if (tool === 'create_tournament') {
    title = 'Create tournament'; confirmText = 'Create';
    const n = Array.isArray(input.teams) ? input.teams.length : 0;
    const ts = Number(input.team_size) > 0 ? Number(input.team_size) : 4;
    message = `Create "${String(input.name || '').trim()}" open for registration (${ts} players/team)${n ? `, and register ${n} team${n === 1 ? '' : 's'}` : ''}? Pool play is NOT started.`;
  } else if (tool === 'register_team') {
    title = 'Register team'; confirmText = 'Register';
    const np = Array.isArray(input.players) ? input.players.length : 0;
    message = `Register "${String(input.team_name || '').trim()}" with ${np} player${np === 1 ? '' : 's'}${input.tournament_name ? ` to "${String(input.tournament_name).trim()}"` : ''}?`;
  }
  return await appConfirm({ title, message, confirmText });
}

// Apply the per-tool safety policy + audit around an executor. Returns { result, is_error, undo? }.
async function executeCopilotTool(name, input, requestText) {
  const v = validateCopilotToolArgs(name, input);
  if (!v.ok) return { result: `I can't do that: ${v.error}`, is_error: true };
  const exec = copilotExecutors[name];
  if (!exec) return { result: `That action ("${name}") isn't available yet.`, is_error: true };
  if ((COPILOT_TOOL_POLICY[name] || 'confirm') === 'confirm') {
    const ok = await copilotConfirmCard(name, input);
    if (!ok) return { result: 'Cancelled — nothing was changed.' };
  }
  let out;
  try { out = await exec(input); } catch (e) { return { result: `That action failed: ${(e && e.message) || 'error'}`, is_error: true }; }
  try {
    await supabaseClient.rpc('log_copilot_action', { p_request: requestText, p_tool: name, p_args: out.args || {}, p_result: out.result, p_undone: false });
  } catch (_e) { /* audit best-effort */ }
  return { result: out.result, is_error: !!out.is_error, undo: out.undo };
}

// Browser tool loop: ask Claude (via the edge relay), run any tool, feed the result back, until done.
// Returns the final text + any undo functions from instant actions this turn.
async function runCopilotTurn(userText) {
  const ctx = buildCopilotContext({ players: state.players, generatedTeams: state.generatedTeams,
    liveData: getPublicLiveData(), tournament: copilotTournamentInput() });
  ctx.openTournaments = copilotOpenTournamentsInput(); // so the co-pilot can target a tournament open for registration
  const messages = [{ role: 'user', content: `Current state:\n${JSON.stringify(ctx)}\n\n${userText}` }];
  const undos = [];
  for (let i = 0; i < 8; i++) {
    const { data, error } = await supabaseClient.functions.invoke('copilot', { body: { messages, tools: COPILOT_TOOLS } });
    if (error || !data) throw new Error('copilot failed');
    const content = Array.isArray(data.content) ? data.content : [];
    messages.push({ role: 'assistant', content });
    const toolUses = content.filter((b) => b && b.type === 'tool_use');
    if (data.stop_reason !== 'tool_use' || !toolUses.length) {
      const text = content.filter((b) => b && b.type === 'text').map((b) => b.text).join('').trim();
      return { text: text || 'Done.', undos };
    }
    const results = [];
    for (const tu of toolUses) {
      const out = await executeCopilotTool(tu.name, tu.input || {}, userText);
      if (out.undo) undos.push(out.undo);
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: out.result, is_error: !!out.is_error });
    }
    messages.push({ role: 'user', content: results });
  }
  return { text: 'I stopped after several steps — please check what happened.', undos };
}

// Minimal Undo affordance (instant actions): an Undo button on the co-pilot's final answer bubble.
function copilotAttachUndo(msgId, undos) {
  const el = document.querySelector(`[data-cop-msg="${msgId}"]`);
  if (!el) return;
  el.appendChild(document.createElement('br'));
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'cop-undo';
  btn.textContent = 'Undo';
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try { for (const u of undos) { await u(); } btn.textContent = 'Undone'; }
    catch (_e) { btn.textContent = 'Undo failed'; }
  });
  el.appendChild(btn);
}

// Admin bottom nav — normal (Home · Players · Courts · Co-pilot) or, in tournament mode (Mike, 2026-06-27),
// Home · Manage · Live · Co-pilot. Home + Co-pilot are shared; tapping Home exits tournament mode.


function render() {
  dismissTeamPeek(); // §13.2: a full render replaces the tapped anchor — never strand a floating peek
  const root = document.getElementById('root');
  if (!root) return;
  const existingPanel = document.getElementById('tab-' + activeMainTab);
  const savedScrollY = existingPanel ? existingPanel.scrollTop : 0;
  const interactionSnapshot = captureTransientInteractionState();


  // C26 item 2: per-surface active-tab memory (set just before activateMainTab below).
  // Task 14: the old admin shell is gone — every session (admin or not) boots on the PUBLIC shell.
  activeMainTab = sessionStorage.getItem(currentTabKey()) || 'home';
  // Old-admin-only tabs (dashboard/session/teams/live) and the removed public 'scores' tab have no panel
  // on the public shell — bounce them Home. (A non-admin never stores these; harmless.)
  if (['dashboard', 'session', 'teams', 'scores', 'live'].includes(activeMainTab)) activeMainTab = 'home';
  // Manage is admin-only: a non-admin's stale/forged 'manage' tab bounces Home (admins keep it).
  if (activeMainTab === 'manage' && !state.isAdmin) activeMainTab = 'home';
  // Check In rework (Mike 2026-07-10): a saved 'players' tab bounces to Home when the Check In nav button
  // is hidden (session deleted / date passed) — mirrors the retired-'scores' bounce.
  if (activeMainTab === 'players' && !checkinNavVisible()) activeMainTab = 'home';
  // Mike K (2026-07-10): the public Standings page folded into the Pools & schedule Seeding tab, so a saved
  // 'standings' tab has no panel — bounce it to the Tournament tab (the Seeding tab lives inside it). Runs
  // BEFORE the tournament→home guard below, so a standings-saved fan with no live tournament cascades to Home.
  if (activeMainTab === 'standings') activeMainTab = 'tournament';
  // Wave 1e: a fan last on the Bracket tab who returns after the tournament was deleted would land on
  // an empty 'tournament' panel with no nav button to highlight (the Bracket button is gone). Reset to
  // Home unless a tournament is actually live.
  if (activeMainTab === 'tournament' && !(state.tournaments || []).some((t) => t.registration_open || ['pools', 'bracket', 'completed'].includes(t.status))) activeMainTab = 'home';

  const shellHtml = renderPublicShell();
  root.innerHTML = shellHtml.replace(/\n?\]\s*$/, '');

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
  line-height: 1;
  color: var(--brand-dark, #2563eb);
  background: var(--accent-soft, #e0e7ff);
  border: none;
  border-radius: 8px;
  width: 38px;
  height: 38px;
  min-height: 38px;
  min-width: 38px;
  padding: 0;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition: background 0.2s ease, transform 0.1s ease;
}
.btn-actions svg { display: block; }
.btn-actions svg circle { fill: currentColor; }
.btn-actions:hover {
  background: color-mix(in oklch, var(--accent-soft, #c7d2fe) 70%, var(--accent) 14%);
  transform: translateY(-1px);
}

/* Dropdown box */
.card-menu {
  display: none;
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  min-width: 150px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  box-shadow: var(--shadow-md);
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
  color: var(--ink);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.menu-item:hover {
  background: var(--accent-soft);
  color: var(--accent);
}

.menu-item.danger {
  color: var(--danger);
  font-weight: 600;
}
.menu-item.danger:hover {
  background: var(--danger-soft);
  color: var(--danger-dark);
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
  color: var(--danger) !important;
  font-weight: 600;
  border-radius: var(--r-sm);
}
.card-menu .menu-item.danger:hover {
  background: var(--danger-soft) !important;
  color: var(--danger-dark) !important;
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
  box-shadow: 0 0 0 2px var(--success-border);
  background: var(--card);
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
  border-radius:var(--r-sm);
  background:var(--surface-3);            /* subtle background so it reads as an editor */
  box-shadow: inset 0 0 0 1px var(--border);
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
  border:1px solid var(--border);
  background:var(--card);
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
  border:1px solid var(--border);
  border-radius:6px;
  background:var(--card);
  text-align:left;
  padding:0 10px;
  color:var(--ink);
}
.player-card .edit-row .group-list{
  max-height:220px;
  overflow:auto;
}
.player-card .edit-row .group-list .group-item.is-member{
  font-weight:600;
}
.player-card .edit-row .group-list .group-item.is-primary{
  color:var(--live);
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
  border:1px solid var(--border);
  background:var(--card);
  border-radius:999px;
  padding:2px 6px;
}
.player-card .edit-row .group-chip.is-primary{
  border-color:var(--success-border);
  background:var(--live-soft);
}
.player-card .edit-row .group-chip-label{
  border:none;
  background:transparent;
  color:var(--ink);
  cursor:pointer;
  font-size:12px;
  line-height:1.2;
  padding:0;
}
.player-card .edit-row .group-chip-remove{
  border:none;
  background:transparent;
  color:var(--danger);
  cursor:pointer;
  font-size:14px;
  line-height:1;
  padding:0 2px;
}
.player-card .edit-row .group-chip-empty{
  color:var(--muted);
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
  border:1px solid var(--border);
  background:var(--card);
  color:var(--ink);
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
// Task 14: these mirror the pre-shell guards above (the old admin shell is gone — all sessions are on the public shell).
if (['dashboard', 'session', 'teams', 'scores', 'live'].includes(activeMainTab)) activeMainTab = 'home';
if (activeMainTab === 'manage' && !state.isAdmin) activeMainTab = 'home'; // Manage is admin-only
// Check In rework (Mike 2026-07-10): bounce a stranded 'players' tab to Home when the Check In nav button is hidden.
if (activeMainTab === 'players' && !checkinNavVisible()) activeMainTab = 'home';
// Mike K (2026-07-10): Standings folded into the Pools Seeding tab — a saved 'standings' tab has no panel; bounce it to Tournament (the guard below re-routes to Home if none is live).
if (activeMainTab === 'standings') activeMainTab = 'tournament';
// Wave 1e: reset a stale 'tournament' tab to Home when no tournament is live (else an empty panel + no nav button).
if (activeMainTab === 'tournament' && !(state.tournaments || []).some((t) => t.registration_open || ['pools', 'bracket', 'completed'].includes(t.status))) activeMainTab = 'home';
activateMainTab(activeMainTab);
restoreTransientInteractionState(interactionSnapshot);
refreshAzStripAvailability();
void root.offsetHeight;
const restoredPanel = document.getElementById('tab-' + activeMainTab);
if (savedScrollY > 0 && restoredPanel) restoredPanel.scrollTop = savedScrollY;
layoutBracketTree(); // C32 #9: connectors + fit/zoom the bracket tree after a full render
maybeAutoGenerateBracket(); // C54: also catch the case where the admin scored the last pool game
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
        const preset = (state.scoringPresets || []).find((p) => p.id === state.selectedFormatId);
        if (!preset) { state.tournamentTabError = 'Pick a saved format first.'; render(); return; }
        const created = await tdbCreateTournament({
          name: val('tv2-name'), pool_count: val('tv2-pools'), net_count: val('tv2-nets'), preset
        });
        state.activeTournamentId = created.id;
        state.manageView = 'hub';
        await tdbRefreshTournaments();
        render();
      } else if (role === 'tv2-pick-format') {
        // surgical: only restyle the rows so the typed tournament name + any open new-format form survive
        state.selectedFormatId = id;
        const picker = document.getElementById('tv2-format-picker');
        if (picker) picker.querySelectorAll('[data-role="tv2-pick-format"]').forEach((row) => {
          const sel = row.getAttribute('data-id') === id;
          row.style.border = sel ? '2px solid var(--accent)' : '1px solid var(--border)';
          row.style.background = sel ? 'var(--accent-soft)' : 'var(--surface)';
          const nm = row.querySelector('[data-fmt-name]'); if (nm) nm.style.color = sel ? 'var(--accent)' : 'var(--text)';
        });
      } else if (role === 'tv2-newformat-toggle') {
        state.newFormatOpen = !state.newFormatOpen;
        const picker = document.getElementById('tv2-format-picker');
        if (picker) picker.innerHTML = buildFormatPickerHTML();
      } else if (role === 'tv2-winby') {
        // surgical toggle (no re-render → the typed new-format fields survive); read at save time
        const on = el.getAttribute('data-on') === '1';
        el.setAttribute('data-on', on ? '0' : '1');
        el.setAttribute('aria-checked', on ? 'false' : 'true');
        const track = el.querySelector('span'); const knob = track && track.querySelector('span');
        if (track) track.style.background = on ? 'var(--border)' : 'var(--accent)';
        if (knob) knob.style.left = on ? '2px' : '18px';
      } else if (role === 'tv2-save-format') {
        const gv = (i) => ((document.getElementById(i) || {}).value || '').trim();
        const msg = document.getElementById('nf-msg');
        const fail = (t) => { if (msg) { msg.textContent = t; msg.style.display = 'block'; } };
        const name = gv('nf-name'); const bt = Number(gv('nf-btarget'));
        if (!name) { fail('Name the format.'); return; }
        if (!bt) { fail('Set the bracket target.'); return; }
        const winEl = document.getElementById('nf-winby');
        const win_by_2 = !winEl || winEl.getAttribute('data-on') === '1';
        el.setAttribute('disabled', 'true');
        try {
          const createdP = await tdbCreateScoringPreset({ name, pool_target: gv('nf-ptarget'), pool_cap: gv('nf-pcap'), bracket_target: bt, win_by_2, team_size: gv('nf-teamsize') });
          state.scoringPresets = [...(state.scoringPresets || []), createdP];
          state.selectedFormatId = createdP.id;
          state.newFormatOpen = false;
          const picker = document.getElementById('tv2-format-picker');
          if (picker) picker.innerHTML = buildFormatPickerHTML();
        } catch (err) {
          el.removeAttribute('disabled');
          fail((err && err.message) || 'Could not save the format.');
        }
      } else if (role === 'tv2-delete-format') {
        const preset = (state.scoringPresets || []).find((p) => p.id === id);
        if (!preset) return;
        if (!(await appConfirm({ message: `Delete the "${preset.name}" format?`, confirmText: 'Delete', danger: true }))) return;
        await tdbDeleteScoringPreset(id);
        state.scoringPresets = (state.scoringPresets || []).filter((p) => p.id !== id);
        if (state.selectedFormatId === id) state.selectedFormatId = state.scoringPresets[0] ? state.scoringPresets[0].id : null;
        const picker = document.getElementById('tv2-format-picker');
        if (picker) picker.innerHTML = buildFormatPickerHTML();
      } else if (role === 'tv2-register-team') {
        // PUBLIC: a team signs itself up (replaces the Google Form). Errors shown inline in #reg-msg.
        const fv = (fid) => ((document.getElementById(fid) || {}).value || '').trim();
        const teamName = fv('reg-team');
        const teamSize = Number((state.tournaments.find((x) => x.id === state.activeTournamentId) || {}).team_size) || 4;
        const roster = Array.from({ length: teamSize }, (_, i) => fv('reg-p' + (i + 1))).filter(Boolean);
        const paid = !!((document.getElementById('reg-paid') || {}).checked);
        const setMsg = (txt, ok) => { const m = document.getElementById('reg-msg'); if (m) { m.textContent = txt; m.style.color = ok ? 'var(--live, #16a34a)' : 'var(--danger)'; } };
        if (!teamName) { setMsg('Enter a team name.', false); return; }
        if (roster.length !== teamSize) { setMsg('Enter all ' + teamSize + ' players.', false); return; } // C68: exactly the format's team size (supersedes NF-3 >=2)
        el.setAttribute('disabled', 'true'); // in-flight guard (double-tap)
        try {
          await tdbRegisterTeam(state.activeTournamentId, teamName, roster, null, paid);
        } catch (err) {
          el.removeAttribute('disabled');
          setMsg((err && err.message) || 'Could not register — try again.', false);
          return;                   // the INSERT failed → real error
        }
        // Registered for real — a refresh/render hiccup must NOT claim it failed.
        try { await tdbRefreshTournaments(); render(); } catch (_) {} // rebuilds the screen: form clears, team + count update
        setMsg(teamName + ' is registered — you\'re in!', true);
        return;                     // handled inline (public has no admin error card)
      } else if (role === 'tv2-toggle-registration') {
        if (!state.isAdmin) return;
        const t = (state.tournaments || []).find((x) => x.id === state.activeTournamentId);
        if (!t) return;
        await tdbSetTournamentFields(t.id, { registration_open: !t.registration_open });
        await tdbRefreshTournaments();
        render();
      } else if (role === 'tv2-save-registration') {
        if (!state.isAdmin) return;
        const venmo = ((document.getElementById('tv2-venmo') || {}).value || '').trim();
        const buyin = ((document.getElementById('tv2-buyin') || {}).value || '').trim();
        await tdbSetTournamentFields(state.activeTournamentId, { venmo_link: venmo || null, buy_in: buyin || null });
        await tdbRefreshTournaments();
        render();
      } else if (role === 'tv2-share-registration') {
        if (!state.isAdmin) return;
        try { await navigator.clipboard.writeText(location.origin + '/'); el.textContent = 'Link copied!'; }
        catch (_) { el.textContent = location.origin; }
        return;
      } else if (role === 'tv2-toggle-paid') {
        if (!state.isAdmin) return;
        const tm = (state.tournamentTeams || []).find((x) => x.id === id);
        await tdbSetTeamPaid(id, !(tm && tm.paid));
        await tdbRefreshTournaments();
        render();
      } else if (role === 'tv2-rename-team') {
        // NF-3b: fix a typo'd self-registered team name (no raw DB). Dup-name guarded, like registration.
        if (!state.isAdmin) return;
        const next = await appPrompt({ title: 'Rename team', value: el.getAttribute('data-name') || '', confirmText: 'Save', placeholder: 'Team name' });
        if (next == null) return; // cancelled
        const nm = String(next).trim();
        if (!nm) throw new Error('Team name is required.');
        if ((state.tournamentTeams || []).some((t) => t.id !== id && normalize(t.name) === normalize(nm))) {
          throw new Error('A team named "' + nm + '" is already in this tournament.');
        }
        await tdbRenameTeam(id, nm);
        await tdbRefreshTournaments();
        render();
      } else if (role === 'tv2-withdraw-team') {
        // SC-7: withdraw mid-pool — forfeit the team's remaining pool games so standings/seeding stay fair.
        if (!state.isAdmin) return;
        const nm = el.getAttribute('data-name') || 'this team';
        if (!(await appConfirm({ title: 'Withdraw team', message: `Withdraw ${nm}? Their remaining pool games are forfeited (opponents win). This can't be undone.`, confirmText: 'Withdraw', danger: true }))) return;
        const t = state.tournaments.find((x) => x.id === state.activeTournamentId);
        await tdbWithdrawTeam(id, t);
        await tdbRefreshTournaments();
        render();
      } else if (role === 'tv2-select-tournament') {
        state.activeTournamentId = id;
        state.manageView = 'hub';
        await tdbRefreshTournaments();
        render();
      } else if (role === 'tv2-edit-settings') {
        if (!state.isAdmin) return;
        openTournamentSettingsModal(id); // NF-10: edit name/nets/scoring after create (no delete+rebuild)
      } else if (role === 'tv2-exit-mode') {
        exitTournamentMode(); // tournament-mode: explicit "Exit tournament view" → back to normal AS
        return;
      } else if (role === 'tv2-toggle-addteam') {
        const f = document.getElementById('tm-addform'); // tournament-mode Manage: expand/collapse the add-team form
        if (f) { f.hidden = !f.hidden; if (!f.hidden) { const n = document.getElementById('reg-team'); if (n) n.focus(); } }
        return;
      } else if (role === 'tv2-edit-roster') {
        if (!state.isAdmin) return; // tournament-mode Manage: edit a team's players in a per-player modal
        openEditRosterModal(id);
        return;
      } else if (role === 'tv2-manage-nav') {
        state.manageView = el.getAttribute('data-view') || 'hub'; // Manage hub → open a sub-page
        render();
        return;
      } else if (role === 'tv2-manage-back') {
        state.manageView = 'hub'; // sub-page → back to the Manage hub
        render();
        return;
      } else if (role === 'tv2-save-settings-page') {
        if (!state.isAdmin) return; // Settings page (NF-10 as a page, not a modal): save then back to hub
        const g = (i) => document.getElementById(i) || {};
        const name = (g('ts-name').value || '').trim();
        const nets = parseInt(g('ts-nets').value, 10);
        const pt = parseInt(g('ts-pt').value, 10);
        const pcRaw = (g('ts-pc').value || '').trim();
        const pc = pcRaw === '' ? null : parseInt(pcRaw, 10);
        const bt = parseInt(g('ts-bt').value, 10);
        const wb2 = !!g('ts-wb2').checked;
        const errEl = document.getElementById('ts-err');
        const fail = (m) => { if (errEl) { errEl.textContent = m; errEl.hidden = false; } };
        if (!name) return fail('Name is required.');
        if (!(nets >= 1) || !(pt >= 1) || !(bt >= 1)) return fail('Nets, pool target, and bracket target must each be at least 1.');
        if (pc != null && pc < pt) return fail('Pool cap cannot be less than the pool target.');
        const tBefore = (state.tournaments || []).find((x) => x.id === id);
        const oldNets = tBefore ? Number(tBefore.net_count) : null;
        // Data-integrity (2026-06-30): a net-count change during pools OR bracket re-nets the matches ATOMICALLY
        // (migration 0031) so net_count + matches.net never drift. Compute the new assignments client-side (same
        // pure scheme as draw/generate), apply net_count + all match nets in ONE transaction, then the other
        // fields. No change / setup phase -> a plain field write incl. net_count. Shared with the Edit modal.
        if (tBefore && nets !== oldNets && (tBefore.status === 'pools' || tBefore.status === 'bracket')) {
          const fresh = await tdbListMatches(id);
          await tdbApplyNetCountChange(id, nets, computeNetAssignments(tBefore.status, state.tournamentPools, fresh, nets));
          await tdbSetTournamentFields(id, { name, pool_target: pt, pool_cap: pc, bracket_target: bt, match_cap: bt, win_by_2: wb2 });
        } else {
          await tdbSetTournamentFields(id, { name, net_count: nets, pool_target: pt, pool_cap: pc, bracket_target: bt, match_cap: bt, win_by_2: wb2 });
        }
        await tdbRefreshTournaments();
        state.manageView = 'hub';
        render();
      } else if (role === 'tv2-back') {
        state.activeTournamentId = null;
        state.tournamentTeams = [];
        render();
      } else if (role === 'tv2-delete-tournament') {
        if (!state.isAdmin) return; // defense-in-depth re-check (real server gate = C21)
        if (!(await appConfirm({ title: 'Delete tournament', message: 'Delete this tournament and everything in it?', confirmText: 'Delete', danger: true }))) return;
        await tdbDeleteTournament(id);
        if (state.activeTournamentId === id) state.activeTournamentId = null;
        await tdbRefreshTournaments();
        render();
      } else if (role === 'tv2-add-team') {
        const nameEl = document.getElementById('tv2-team-name');
        const teamName = ((nameEl || {}).value || '').trim();
        // C49a: block a duplicate team name (case-insensitive) — two same-named teams are unreadable in the bracket.
        if (teamName && (state.tournamentTeams || []).some((t) => normalize(t.name) === normalize(teamName))) {
          throw new Error('A team named "' + teamName + '" is already in this tournament.');
        }
        await tdbAddTeam(state.activeTournamentId, teamName);
        await tdbRefreshTournaments();
        render();
      } else if (role === 'tv2-add-mode') {
        // Manage>Teams add card: switch Quick (name only) <-> Full roster WITHOUT a re-render (keeps the
        // typed name); the roster grid's visibility + the submit button's role follow the mode.
        const mode = el.getAttribute('data-mode');
        const card = document.getElementById('tm-addcard');
        if (card) {
          card.classList.toggle('is-quick', mode === 'quick');
          card.querySelectorAll('[data-role="tv2-add-mode"]').forEach((b) => b.classList.toggle('is-on', b.getAttribute('data-mode') === mode));
          const submit = card.querySelector('.tm-add-submit');
          if (submit) submit.setAttribute('data-role', mode === 'quick' ? 'tv2-quick-add-team' : 'tv2-register-team');
        }
        return;
      } else if (role === 'tv2-quick-add-team') {
        // Name-only quick-add (audit #3 day-of friction): a team with just a name (+ optional paid), reusing
        // tdbAddTeam; players can be filled in later via Edit roster. Admin-only; separate from the shared
        // (public) tv2-register-team so the public self-registration keeps its full-roster requirement.
        if (!state.isAdmin) return;
        const name = ((document.getElementById('reg-team') || {}).value || '').trim();
        const paid = !!((document.getElementById('reg-paid') || {}).checked);
        const setMsg = (txt, ok) => { const m = document.getElementById('reg-msg'); if (m) { m.textContent = txt; m.style.color = ok ? 'var(--live, #16a34a)' : 'var(--danger)'; } };
        if (!name) { setMsg('Enter a team name.', false); return; }
        if ((state.tournamentTeams || []).some((t) => normalize(t.name) === normalize(name))) { setMsg('A team named "' + name + '" is already in.', false); return; }
        el.setAttribute('disabled', 'true'); // in-flight guard (double-tap)
        let team;
        try { team = await tdbAddTeam(state.activeTournamentId, name); if (paid && team) await tdbSetTeamPaid(team.id, true); }
        catch (err) { el.removeAttribute('disabled'); setMsg((err && err.message) || 'Could not add — try again.', false); return; }
        try { await tdbRefreshTournaments(); render(); } catch (_) {} // rebuilds the page: form clears, team + count update
        return;
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
        // SC-2: warn before locking teams in if any haven't paid the buy-in (the operator's #1 concern).
        const unpaidCt = (state.tournamentTeams || []).filter((tm) => !tm.paid).length;
        if (unpaidCt > 0 && !(await appConfirm({ title: 'Unpaid teams', message: `${unpaidCt} team${unpaidCt === 1 ? '' : 's'} not marked paid. Start pool play anyway?`, confirmText: 'Start anyway' }))) return;
        await tdbStartPoolPlay(t);
        await tdbRefreshTournaments();
        render();
      } else if (role === 'tv2-reset-pools') {
        if (!state.isAdmin) return; // defense-in-depth re-check (real server gate = C21)
        if (!(await appConfirm({ title: 'Reset pools', message: 'Reset pools and clear all pool results?', confirmText: 'Reset', danger: true }))) return;
        const t = state.tournaments.find((x) => x.id === state.activeTournamentId);
        // C49 BUGFIX: drop to 'setup' BEFORE re-drawing. tdbDrawPools refuses to run while status==='pools'
        // (its own guard), so the old order (draw → then set setup) ALWAYS threw "Pool play already started"
        // — Reset Pools never worked. Set setup first, then re-draw (which clears pool results via cascade).
        // NF-2 (2026-06-26): route the status write through the guarded tdbSetTournamentFields (adds
        // updated_at + throws on {error}) instead of a bare, result-discarded update — a silent failure
        // here used to cascade into the misleading "Pool play already started" from tdbDrawPools; now the
        // real error surfaces via the outer catch (state.tournamentTabError).
        await tdbSetTournamentFields(t.id, { status: 'setup' });
        delete _autoGenPrompted[t.id]; // re-arm the auto-generate prompt for the re-played pools
        await tdbDrawPools(t);
        await tdbRefreshTournaments();
        render();
      } else if (role === 'tv2-reset-bracket') {
        // #6: clear the bracket and go back to pools (pool games + scores kept) so the admin can re-generate.
        if (!state.isAdmin) return;
        if (!(await appConfirm({ title: 'Reset bracket', message: 'Clear the bracket and go back to pools? Pool games and scores are kept — you can re-generate the bracket.', confirmText: 'Reset bracket', danger: true }))) return;
        const t = state.tournaments.find((x) => x.id === state.activeTournamentId);
        await tdbResetBracket(t);
        delete _autoGenPrompted[t.id]; // re-arm the auto-generate prompt (pools are already final)
        state.tournamentPickedTeamId = null; state.bracketSide = null; state.bracketRound = null;
        await tdbRefreshTournaments();
        render();
      } else if (role === 'tv2-seed-up' || role === 'tv2-seed-down') {
        // #7 seed override (transient): nudge a team up/down one seed in the pre-generate seeding list.
        if (!state.isAdmin) return;
        const order = currentSeedOrder();
        const i = order.indexOf(id);
        const j = role === 'tv2-seed-up' ? i - 1 : i + 1;
        if (i < 0 || j < 0 || j >= order.length) return;
        const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
        state.seedOverride = { id: state.activeTournamentId, order };
        render();
      } else if (role === 'tv2-seed-reset') {
        if (!state.isAdmin) return;
        state.seedOverride = null; // back to the computed seeding
        render();
      } else if (role === 'tv2-generate-bracket') {
        const t = state.tournaments.find((x) => x.id === state.activeTournamentId);
        const seedOrder = (state.seedOverride && state.seedOverride.id === t.id) ? state.seedOverride.order : null; // #7
        await tdbGenerateBracket(t, seedOrder);
        state.seedOverride = null; // clear the transient override after generating
        state.tournamentPickedTeamId = null;
        state.bracketSide = null; state.bracketRound = null;
        await tdbRefreshTournaments();
        render();
      } else if (role === 'tv2-bracket-side') {
        state.bracketSide = el.getAttribute('data-side');
        state.bracketRound = null;
        btResetView(); // C57: show the newly-selected side fit to screen
        partialRenderTournament();
      } else if (role === 'tv2-team-card') {
        openTeamRosterCard(id); // C69: tap a team -> popup card with its players
      } else if (role === 'tv2-bracket-open') {
        openMatchActionChooser(id); // C72: tap a game -> Score live / Enter final (a final goes straight to edit)
      } else if (role === 'tv2-bracket-clear') {
        const m = (state.tournamentMatches || []).find((x) => x.id === id);
        await tdbClearBracketResult(m);
        await tdbRefreshTournaments();
        render();
      } else if (role === 'tv2-clear-result') {
        const m = (state.tournamentMatches || []).find((x) => x.id === id);
        await tdbClearResult(m);
        await tdbRefreshTournaments();
        render();
      } else if (role === 'tv2-edit-pool-nets') {
        // C70: admin re-assigns a pool's nets (auto-split is the default; this is the "editable" half).
        if (!state.isAdmin) return; // defense-in-depth — the button only renders for admin
        const pool = (state.tournamentPools || []).find((p) => p.id === id);
        if (!pool) return;
        const cur = [...new Set((state.tournamentMatches || []).filter((m) => m.pool_id === pool.id && m.net != null).map((m) => m.net))].sort((a, b) => a - b);
        const input = await appPrompt({ title: 'Pool ' + pool.label + ' nets', message: 'Which nets does this pool play on? Separate with commas. Re-assigns its unplayed games.', value: cur.join(', '), placeholder: 'e.g. 1, 2', confirmText: 'Save' });
        if (input == null) return; // cancelled
        const nets = String(input).split(/[,\s]+/).map((s) => parseInt(s, 10)).filter((n) => !isNaN(n));
        await tdbSetPoolNets(pool, nets, state.tournamentMatches || []);
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

  // C32 #9: the bracket is one responsive connected tree now — re-fit it on resize (no width branch).
  // F4 (2026-06-30): dropped the `activeMainTab === 'tournament'` guard — that's the PUBLIC Bracket tab, so in
  // tournament MODE the Live-tab bracket + Manage>Bracket connectors never re-fit on rotate/resize/late-font.
  // layoutBracketTree is a no-op when no tree is present, so calling it unconditionally is safe on every surface.
  window.addEventListener('resize', debounce(() => { layoutBracketTree(); }, 150));
  // Connectors depend on text metrics: re-fit once fonts finish loading + after full page load.
  if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { layoutBracketTree(); });
  }
  window.addEventListener('load', () => { layoutBracketTree(); });
}

function activateMainTab(tab) {
  // Check In rework (Mike 2026-07-10): the public Check In tab only exists on the pickup-session day —
  // any stale route to it (saved tab, mid-visit nav rebuild after the session hides) bounces to Home.
  if (tab === 'players' && !checkinNavVisible()) tab = 'home';
  activeMainTab = tab;
  sessionStorage.setItem(currentTabKey(), tab);
  // e2e catch 2026-07-11: entering Manage glues the loaded tournament data to the resolved tournament
  // (activeTournamentId only ever followed the old shell's select flow before this).
  if (tab === 'manage' && state.isAdmin) mgSyncActiveTournament();
  // Slice 1: lazy-load completed-tournament history the first time History opens (read-only, cached on state).
  if (tab === 'history' && typeof state.tournamentHistory === 'undefined' && !state.tournamentHistoryLoading) {
    loadTournamentHistory().then(() => {
      if (activeMainTab === 'history') {
        const c = document.querySelector('#tab-history .container');
        if (c) c.innerHTML = buildHistoryPageHTML();
      }
    });
  }
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + tab));
  document.body.classList.add('pd-public-active'); // Mike (2026-07-09): the logo backdrop shows on EVERY public page (Task 14: every session is on the public shell)
  document.body.classList.toggle('copilot-open', copilotOpen); // Task 12: re-apply the chat-on-stone state after a full render() (a poll never repaints #cop-chat, so the view survives; render()s do)
  // Reliability fix (2026-06-20): expose the current tab to assistive tech, not just a visual .active
  // class (this is the single place nav active state is set — first paint via activateMainTab(activeMainTab)
  // and on click — so aria-current stays correct everywhere).
  // 2026-06-27: Tournament + Session are reached from Dashboard quick-actions and have NO bottom-nav button
  // of their own, so without this the nav goes fully blank when they open (no "you are here") — the root
  // cause of "Tournament feels missing". Anchor an orphan tab to its parent (dashboard) ONLY when it has no
  // own nav button, so surfaces where the tab DOES have a button (the public Bracket = 'tournament') are
  // unchanged and still highlight themselves.
  const navButtons = document.querySelectorAll('#bottom-nav .nav-btn');
  const hasOwnButton = Array.prototype.some.call(navButtons, (b) => b.dataset.navTab === tab);
  // Public tile-pages (Standings/My Team/History) have no bottom-nav button of their own -> anchor their
  // highlight to the Tournament nav button (they are Tournament content now). (Admin keeps
  // tournament/session -> dashboard; the public 'tournament' Bracket tab has its own nav button again.)
  const NAV_ANCHOR = { standings: 'tournament', history: 'tournament', myteam: 'tournament' };
  const navActive = hasOwnButton ? tab : (NAV_ANCHOR[tab] || tab);
  navButtons.forEach((b) => {
    const isActive = b.dataset.navTab === navActive;
    b.classList.toggle('active', isActive);
    if (isActive) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  window.dispatchEvent(new Event('as-tab-changed')); // C25 item 5: refresh back-to-top visibility for the new panel
  // C32 #9: fit the bracket tree when switching into a tab that shows one — the public/admin Bracket tab,
  // the tournament-mode Live tab, and the Manage > Bracket preview (the real tree, teamless, pre-pools).
  if (tab === 'tournament' || tab === 'live' || (tab === 'manage' && state.manageView === 'bracket')) layoutBracketTree();
}

// Tournament MODE enter/exit (Mike, 2026-06-27). Entering swaps the bottom nav (Home·Manage·Live·Co-pilot)
// and lands on Manage; exiting (Home or the explicit "Exit tournament view") returns to the normal admin
// shell + nav. render() rebuilds the shell with the right nav + panels, then re-activates the tab.
function enterTournamentMode() {
  state.tournamentMode = true;
  state.manageView = 'hub';  // always land on the hub
  render();                  // rebuild the shell first (creates the Manage/Live panels + swaps the nav)
  activateMainTab('manage'); // then show Manage (render re-derives the tab from storage, so set it after)
}
function exitTournamentMode() {
  state.tournamentMode = false;
  render();
  activateMainTab('dashboard');
}

// NF-13: count the "Won" results recorded in the current casual round. A re-roll (Generate / a team-size
// button) rebuilds the teams + court order and clears liveMatchResults — so if any result is recorded we
// confirm first instead of silently destroying the round's standings.
function recordedLiveResultCount() {
  const r = state.liveMatchResults || {};
  return Object.keys(r).filter((k) => Number(r[k]) > 0).length;
}
async function confirmReRollIfResultsRecorded() {
  const n = recordedLiveResultCount();
  if (n === 0) return true;
  return await appConfirm({
    title: 'Re-roll teams?',
    message: `This clears the ${n} game result${n === 1 ? '' : 's'} recorded this round.`,
    confirmText: 'Re-roll',
    danger: true,
  });
}

function attachHandlers() {
  // --- Bottom nav ---
  const bottomNav = document.getElementById('bottom-nav');
  if (bottomNav) {
    bottomNav.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-nav-tab]');
      if (!btn) return;
      const tab = btn.dataset.navTab;
      if (copilotOpen) { copilotOpen = false; document.body.classList.remove('copilot-open'); } // Task 12: leaving via the nav closes the co-pilot chat (activateMainTab re-toggles the class off)
      if (state.tournamentMode && tab === 'dashboard') { exitTournamentMode(); return; } // Home exits tournament mode
      activateMainTab(tab);
    });
  }
  // Public dashboard header (Slice 1): inert placeholders — Accounts + SportPack are later tracks.
  // Fresh #app-header each full render() so this binds once (mirrors the #bottom-nav pattern). The
  // pd-* buttons only exist on the public surface, so on the admin header this is a harmless no-op.
  const appHeaderEl = document.getElementById('app-header');
  if (appHeaderEl) {
    appHeaderEl.addEventListener('click', (e) => {
      if (e.target.closest('#pd-account')) {
        if (state.authSession) openAccountMenu(); else openAuthPage();
      }
      // §13.6: the sport pill is a static non-interactive badge now (SportPack lands later) — no handler.
    });
  }
  // C26 item 3a: in-content [data-nav-tab] navigation (e.g. the Home "Check In" CTA).
  // Scoped to #app-content + idempotent so re-renders don't stack listeners.
  const appContent = document.getElementById('app-content');
  if (appContent && !appContent.dataset.navTabBound) {
    appContent.dataset.navTabBound = '1';
    // Task 3: the Players directory search is a live filter. Delegated on the stable #app-content ancestor so
    // it survives the container-swap repaints (the input element is re-created on each swap). Re-renders ONLY
    // the #mgp-list sub-container — the input itself (and its focus/caret) is never touched.
    appContent.addEventListener('input', (e) => {
      if (!e.target || e.target.id !== 'mg-player-search') return;
      mgPlayerQuery = e.target.value || '';
      const listEl = document.getElementById('mgp-list');
      if (listEl) listEl.innerHTML = buildMgpListHTML();
    });
    // Task 5: the Registration view saves on blur. Delegated focusout on the stable #app-content ancestor so
    // it survives the container-swap repaints (the fields are re-created on each swap). Each helper writes only
    // when the value actually changed (no needless writes on a focus-through).
    appContent.addEventListener('focusout', (e) => {
      const t = e.target;
      if (!t || !t.id) return;
      if (t.id === 'mgr-ann') { void mgrSaveAnnouncement(t); return; }
      if (t.id === 'mgr-venmo' || t.id === 'mgr-buyin' || t.id === 'mgr-teamsize') { void mgrSaveField(t.id); return; }
      // Task 9: every Event-settings field (mges-*) saves on blur through tdbSetTournamentFields.
      if (t.id.indexOf('mges-') === 0) { void mgSaveSettingsField(t.id); return; }
    });
    appContent.addEventListener('click', (e) => {
      // Slice 3b: "claim your team" — signed-in → the claim page; signed-out → sign in first
      // (claimIntent re-opens the claim page automatically once SIGNED_IN lands).
      if (e.target.closest('#pd-claim')) {
        if (state.authSession) { openClaimPage(); }
        else { claimIntent = true; openAuthPage(); }
        return;
      }
      // Tournament atom-up (spec 2026-07-10 §1): the signed-out gate's "Sign in" CTA + "Create an account"
      // link both open the existing auth page (its create toggle handles the new-account path).
      if (e.target.closest('[data-role="tn-signin"]')) { openAuthPage(); return; }
      // C26 item 3b: Dashboard quick-actions wire to existing affordances (Tournament + Session
      // left the nav but their panels remain, reachable here).
      const qa = e.target.closest('[data-qa]');
      if (qa) {
        const a = qa.dataset.qa;
        if (a === 'checkin') openQrModal();
        else if (a === 'generate') activateMainTab('teams');
        else if (a === 'tournament') enterTournamentMode();
        else if (a === 'session') activateMainTab('session');
        return;
      }
      // Slice 1 (spec §13.2): tap-a-team peek — open on any tapped team name. Read-only, account-free;
      // opens on the Pools page AND the Home live board. Checked before nav so a tap on a team name never
      // falls through to navigation. (The peek's own X is bound in openTeamPeek — it lives on document.body.)
      const peekBtn = e.target.closest('[data-team-peek]');
      if (peekBtn) { openTeamPeek(peekBtn.getAttribute('data-team-peek'), peekBtn); return; }
      // Pools & schedule tab strip (Mike H): POOL + SEEDING tabs — client-side, pdPoolFilter survives
      // partialRender. Container-swap partial repaint only (never a full render() from a tab tap).
      const plTab = e.target.closest('[data-pl-tab]');
      if (plTab && !state.isAdmin) {
        dismissTeamPeek();
        pdPoolFilter = plTab.getAttribute('data-pl-tab') || '';
        const c = document.querySelector('#tab-tournament .container');
        if (c) c.innerHTML = buildPublicTournamentRootHTML();
        return;
      }
      // Round 2 (spec §12.4) / Slice 2 (§13.3): the public Tournament hub tiles/back toggle the hub<->sub-page
      // views (pools / bracket / register — the shared 'board' is retired from the public path).
      const tnBtn = e.target.closest('[data-tn-view]');
      if (tnBtn && !state.isAdmin) {
        dismissTeamPeek();
        const v = tnBtn.getAttribute('data-tn-view');
        regSubmittedTeam = null; // any explicit nav (open Register fresh / Back to hub) clears the payoff
        // Rules back-stack: remember where Rules was opened from so its back button returns there.
        if (v === 'rules') rulesReturnView = tnBtn.getAttribute('data-rules-from') === 'register' ? 'register' : 'hub';
        pdTournamentView = (v === 'pools' || v === 'bracket' || v === 'register' || v === 'rules') ? v : 'hub';
        // Mike K (2026-07-10): the hub "Seeding" row + the bracket seeding chip deep-link to the Pools &
        // schedule page's Seeding tab — honor data-pools-tab so the pools sub-page opens on Seeding, not a pool.
        if (tnBtn.getAttribute('data-pools-tab') === 'seeding') pdPoolFilter = 'seeding';
        // §13.4: a data-tn-view chip can live OUTSIDE the Tournament tab (e.g. the Home hero's "Watch the
        // bracket" terminal chip) — switch to the Tournament tab first so the sub-page is actually visible.
        if (activeMainTab !== 'tournament') activateMainTab('tournament');
        const c = document.querySelector('#tab-tournament .container');
        if (c) c.innerHTML = buildPublicTournamentRootHTML();
        if (pdTournamentView === 'bracket') layoutBracketTree(); // the Bracket page shows the real bt-* tree
        const panel = document.getElementById('tab-tournament');
        if (panel) panel.scrollTop = 0; // a sub-page open/back is an explicit user action — top is correct
        return;
      }
      // Pickup days (Task 2): list ⇄ form navigation + writes, all container-swap partial repaints. Checked
      // BEFORE data-mg-area so a row/Add tap opens the form instead of falling through. The form's back button
      // carries data-mg-area="pickup" (handled below) → returns to the list.
      const pkDayRow = e.target.closest('[data-pk-day]');
      if (pkDayRow) { pickupEditId = pkDayRow.getAttribute('data-pk-day') || null; manageView = 'pickup-form'; repaintManage(); const p = document.getElementById('tab-manage'); if (p) p.scrollTop = 0; return; }
      if (e.target.closest('[data-pk-add]')) { pickupEditId = null; manageView = 'pickup-form'; repaintManage(); const p = document.getElementById('tab-manage'); if (p) p.scrollTop = 0; return; }
      if (e.target.closest('[data-pk-save]')) { void savePickupDay(); return; }
      const pkRemove = e.target.closest('[data-pk-remove]');
      if (pkRemove) { void removePickupDay(pkRemove.getAttribute('data-pk-remove')); return; }
      if (e.target.closest('[data-pk-qr]')) { openQrModal(); return; }              // reuse the shared QR modal
      if (e.target.closest('[data-pk-fresh]')) { void startNewSessionFlow(); return; } // reuse start_new_session (no gate — all 4 admins)
      // Players directory (Task 3, pick R4): Select toggle, group manager, bulk bar, add-a-player, row taps.
      // All are container-swap partial repaints (the mg* players module vars survive); a normal row tap opens
      // the EXISTING body-level edit sheet. Checked BEFORE the generic data-mg-area so a row/button here never
      // falls through to navigation (the page's own back button carries data-mg-area="lead", handled below).
      if (manageView === 'players') {
        if (e.target.closest('[data-mgp-select]')) { mgSelectMode = !mgSelectMode; mgSelected = new Set(); mgMoveOpen = false; repaintManage(); return; }
        if (e.target.closest('[data-mgp-groups]')) { mgGroupsOpen = !mgGroupsOpen; mgRenameGroup = null; repaintManage(); return; }
        if (e.target.closest('[data-mgp-gadd]')) { void mgpAddGroup(); return; }
        const gRen = e.target.closest('[data-mgp-grename]'); if (gRen) { mgRenameGroup = gRen.getAttribute('data-mgp-grename'); repaintManage(); return; }
        const gRenSave = e.target.closest('[data-mgp-grename-save]'); if (gRenSave) { void mgpRenameGroupCommit(gRenSave.getAttribute('data-mgp-grename-save')); return; }
        if (e.target.closest('[data-mgp-grename-cancel]')) { mgRenameGroup = null; repaintManage(); return; }
        const gDel = e.target.closest('[data-mgp-gdelete]'); if (gDel) { void mgpDeleteGroup(gDel.getAttribute('data-mgp-gdelete')); return; }
        if (e.target.closest('[data-mgp-bulk="in"]')) { void mgpBulkAttendance(true); return; }
        if (e.target.closest('[data-mgp-bulk="out"]')) { void mgpBulkAttendance(false); return; }
        if (e.target.closest('[data-mgp-bulk="move"]')) { mgMoveOpen = !mgMoveOpen; repaintManage(); return; }
        if (e.target.closest('[data-mgp-bulk="cancel"]')) { mgSelectMode = false; mgSelected = new Set(); mgMoveOpen = false; repaintManage(); return; }
        const moveChip = e.target.closest('[data-mgp-movegrp]'); if (moveChip) { void mgpBulkGroup(moveChip.getAttribute('data-mgp-movegrp')); return; }
        const addRow = e.target.closest('[data-mgp-add]'); if (addRow) { void mgpAddPlayer(addRow.getAttribute('data-mgp-add') || ''); return; }
        const mgpRow = e.target.closest('[data-mgp-id]');
        if (mgpRow) {
          const key = mgpRow.getAttribute('data-mgp-id') || '';
          if (mgSelectMode) {
            if (mgSelected.has(key)) mgSelected.delete(key); else mgSelected.add(key);
            mgpRow.classList.toggle('on'); // targeted flip — no full repaint (keeps scroll + the rest of the list)
          } else {
            openPlayerEditPopup(key);
          }
          return;
        }
      }
      // Teams page (Task 4, pick R5): size chips select the size, Generate builds teams, tapping a name opens
      // the swap sheet, a destination tap moves the player. All container-swap partial repaints (the mgt*
      // module vars survive). Checked BEFORE the generic data-mg-area so these never fall through to nav; the
      // page's own back button carries data-mg-area="lead" (handled below).
      if (manageView === 'teams') {
        const sizeBtn = e.target.closest('[data-mgt-size]');
        if (sizeBtn) { mgtSize = Number(sizeBtn.getAttribute('data-mgt-size')) || 4; repaintManage(); return; }
        if (e.target.closest('[data-mgt-generate]')) { mgtGenerateTeams(); return; }
        const toBtn = e.target.closest('[data-mgt-to]');
        if (toBtn) { mgtApplySwap(Number(toBtn.getAttribute('data-mgt-to'))); return; }
        if (e.target.closest('[data-mgt-cancel]')) { mgtSwapKey = null; mgtSwapFrom = null; repaintManage(); return; }
        const swapName = e.target.closest('[data-mgt-swap]');
        if (swapName) { mgtSwapKey = swapName.getAttribute('data-mgt-swap') || null; mgtSwapFrom = Number(swapName.getAttribute('data-mgt-from')); repaintManage(); return; }
      }
      // Tournament sub-hub (Task 5, pick R2) + Registration view (pick R7). data-mgt-view opens a sub-view
      // from the hub; data-mgt-back returns to the hub; the reg switch (data-mgr-regtoggle) + Copy CTA
      // (data-mgr-copy) act inline. All container-swap repaints (mgtView survives). Checked BEFORE the generic
      // data-mg-area so these never fall through to nav; the hub's own back carries data-mg-area="lead".
      if (manageView === 'tournament') {
        // Teams & payment (Task 6, pick R8): the tag toggles paid WITHOUT opening the sheet (checked first,
        // even though it sits inside the row); the row opens the body-level edit sheet; the dashed row adds a
        // team by name. The sheet binds its own listeners (body-level → poll-clobber-immune). The teams-list
        // header's back button carries data-mgt-back (handled below → returns to the sub-hub).
        if (mgtView === 'teams') {
          const paidTag = e.target.closest('[data-mgtp-paid]');
          if (paidTag) { void mgTeamTogglePaid(paidTag.getAttribute('data-mgtp-paid'), paidTag); return; }
          if (e.target.closest('[data-mgtp-add]')) { void mgTeamAddPrompt(); return; }
          const teamRow = e.target.closest('[data-mgtp-team]');
          if (teamRow) { openMgTeamSheet(teamRow.getAttribute('data-mgtp-team')); return; }
        }
        // Pools & schedule (Task 7, pick R9): tab switch + score-sheet open + the two-step draw/start + Pool
        // controls (move team → the T6 sheet, edit nets, reset). Checked BEFORE the generic hub rows so a tab
        // or SCORE tap never falls through; the header back button carries data-mgt-back (handled below).
        if (mgtView === 'pools') {
          const psTab = e.target.closest('[data-mgps-tab]');
          if (psTab) { mgpPoolFilter = psTab.getAttribute('data-mgps-tab'); repaintManage(); return; }
          const psScore = e.target.closest('[data-mgps-score]');
          if (psScore) { openMgScoreSheet(psScore.getAttribute('data-mgps-score')); return; }
          if (e.target.closest('[data-mgps-draw]')) { void mgPoolsDraw(); return; }
          if (e.target.closest('[data-mgps-start]')) { void mgPoolsStart(); return; }
          if (e.target.closest('[data-mgps-redraw]')) { void mgPoolsRedraw(); return; }
          if (e.target.closest('[data-mgps-controls]')) { mgpControlsOpen = !mgpControlsOpen; repaintManage(); return; }
          const psTeam = e.target.closest('[data-mgps-team]');
          if (psTeam) { openMgTeamSheet(psTeam.getAttribute('data-mgps-team')); return; }
          const psNets = e.target.closest('[data-mgps-editnets]');
          if (psNets) { void mgPoolsEditNets(psNets.getAttribute('data-mgps-editnets')); return; }
          if (e.target.closest('[data-mgps-reset]')) { void mgPoolsResetPools(); return; }
        }
        // Bracket & scores (Task 8, pick R10-C): pre-bracket = ▲/▼ seed reorder + Generate; live/completed =
        // by-round rows where every resolved row opens the SHARED openMgScoreSheet (no second editor); plus
        // Reset the bracket (type-name unlock) and the players'-view link out to the public bracket page.
        // Checked BEFORE the generic hub rows so a seed nudge / score / generate never falls through.
        if (mgtView === 'bracket') {
          const bkScore = e.target.closest('[data-mgbk-score]');
          if (bkScore) { openMgScoreSheet(bkScore.getAttribute('data-mgbk-score')); return; }
          const seedUp = e.target.closest('[data-mgbk-seedup]');
          if (seedUp) { mgBracketReseed(seedUp.getAttribute('data-mgbk-seedup'), -1); return; }
          const seedDn = e.target.closest('[data-mgbk-seeddown]');
          if (seedDn) { mgBracketReseed(seedDn.getAttribute('data-mgbk-seeddown'), 1); return; }
          if (e.target.closest('[data-mgbk-seedreset]')) { state.seedOverride = null; repaintManage(); return; }
          if (e.target.closest('[data-mgbk-generate]')) { void mgBracketGenerate(); return; }
          if (e.target.closest('[data-mgbk-reset]')) { void mgBracketReset(); return; }
          if (e.target.closest('[data-mgbk-players]')) {
            // Route to the PUBLIC bracket page (the players' read-only tree): switch to the Tournament tab
            // and set its view to bracket (mirrors the tn-view nav, which is gated to non-admins).
            pdTournamentView = 'bracket';
            if (activeMainTab !== 'tournament') activateMainTab('tournament');
            const tc = document.querySelector('#tab-tournament .container');
            if (tc) tc.innerHTML = buildPublicTournamentRootHTML();
            layoutBracketTree();
            const tp = document.getElementById('tab-tournament');
            if (tp) tp.scrollTop = 0;
            return;
          }
        }
        // Event settings (Task 9, pick R11): the two boolean switches save on toggle; every text/number field
        // saves on blur (the focusout delegate). Checked before the generic hub rows so a toggle never falls
        // through; the header back button carries data-mgt-back (handled below).
        if (mgtView === 'settings') {
          const mgesToggle = e.target.closest('[data-mges-toggle]');
          if (mgesToggle) { void mgToggleSettingsField(mgesToggle.getAttribute('data-mges-toggle')); return; }
        }
        // Rules sheet (Task 9, pick R11b): the explicit Save CTA writes tournaments.rules (players see it
        // right away). Checked before the generic hub rows so the Save tap never falls through.
        if (mgtView === 'rules') {
          if (e.target.closest('[data-mgru-save]')) { void mgSaveRules(); return; }
        }
        // Close out (Task 10, pick R12, the June fix): CHANGE opens the body-level champion picker; End the
        // tournament (active) + Reopen (completed) run their confirm→RPC→refresh flows. Checked before the
        // generic hub rows so a tap never falls through; the header back button carries data-mgt-back (below).
        if (mgtView === 'closeout') {
          if (e.target.closest('[data-mgco-change]')) { openMgChampionPicker(); return; }
          if (e.target.closest('[data-mgco-end]')) { void mgCloseoutEnd(); return; }
          if (e.target.closest('[data-mgco-reopen]')) { void mgCloseoutReopen(); return; }
        }
        if (e.target.closest('[data-mgt-back]')) { mgtView = null; repaintManage(); const p = document.getElementById('tab-manage'); if (p) p.scrollTop = 0; return; }
        const mgtRow = e.target.closest('[data-mgt-view]');
        if (mgtRow) { mgtView = mgtRow.getAttribute('data-mgt-view') || null; repaintManage(); const p = document.getElementById('tab-manage'); if (p) p.scrollTop = 0; return; }
        if (e.target.closest('[data-mgr-regtoggle]')) { void mgrToggleRegistration(); return; }
        const copyBtn = e.target.closest('[data-mgr-copy]');
        if (copyBtn) { void mgrCopyAnnouncement(copyBtn); return; }
      }
      // Task 11 (R6) Admins-area actions. Checked BEFORE the generic data-mg-area so a seat/log/button tap
      // never falls through to nav; the seats page's own back button carries data-mg-area="lead" (handled
      // below), and the log's back carries data-mgad-seats (handled here). Owner-only actions are also
      // guarded server-side (set_member_role owner check) — this is the UI gate, not the security boundary.
      if (manageView === 'admins') {
        // Owner taps a WAITING seat → toggle the inline assign-by-email field (then focus it).
        if (e.target.closest('[data-mgad-seat]')) {
          mgAssignOpen = !mgAssignOpen; repaintManage();
          if (mgAssignOpen) { const f = document.getElementById('mgad-email'); if (f) { try { f.focus(); } catch (_) {} } }
          return;
        }
        if (e.target.closest('[data-mgad-make]')) { void mgAdminMakeOrganizer(); return; }
        const rm = e.target.closest('[data-mgad-remove]');
        if (rm) { openMgRemoveAdminSheet(rm.getAttribute('data-mgad-remove') || ''); return; }
        // Activity log row → the log sub-view (lazy-load on first open).
        if (e.target.closest('[data-mgad-log]')) {
          mgAdminsView = 'log';
          if (mgLog === null && !mgLogLoading) { void loadActionLog(); } else { repaintManage(); }
          const p = document.getElementById('tab-manage'); if (p) p.scrollTop = 0;
          return;
        }
        // Back from the log → the seats view.
        if (e.target.closest('[data-mgad-seats]')) {
          mgAdminsView = 'seats'; repaintManage();
          const p = document.getElementById('tab-manage'); if (p) p.scrollTop = 0;
          return;
        }
      }
      // Manage tab (session-10 R1): flat-row navigation is a container-swap partial repaint (module var
      // manageView survives; NO full render()). data-mg-area="lead" returns to the lead; an area id opens its page.
      const mgArea = e.target.closest('[data-mg-area]');
      if (mgArea) {
        const nextArea = mgArea.getAttribute('data-mg-area') || 'lead';
        mgSyncActiveTournament(); // keep the loaded tournament data glued to the resolved tournament
        // Entering the Players directory fresh: reset the search + Select state so a re-open starts clean.
        if (nextArea === 'players' && manageView !== 'players') {
          mgPlayerQuery = ''; mgSelectMode = false; mgSelected = new Set(); mgGroupsOpen = false; mgMoveOpen = false; mgRenameGroup = null;
        }
        // Entering the Teams page fresh: 4s default + no open swap sheet.
        if (nextArea === 'teams' && manageView !== 'teams') { mgtSize = 4; mgtSwapKey = null; mgtSwapFrom = null; }
        // Entering the Tournament area fresh: land on the sub-hub (not a stale sub-view).
        if (nextArea === 'tournament' && manageView !== 'tournament') { mgtView = null; }
        // Entering the Admins area fresh (Task 11): land on the seats view, clear stale seat/log data +
        // any half-open assign field so the first paint shows the honest loading line.
        if (nextArea === 'admins' && manageView !== 'admins') {
          mgAdminsView = 'seats'; mgAssignOpen = false;
          mgSeats = null; mgSeatsError = ''; mgLog = null; mgLogError = '';
        }
        manageView = nextArea;
        const c = document.querySelector('#tab-manage .container');
        if (c) c.innerHTML = manageContainerHTML();
        const mgPanel = document.getElementById('tab-manage');
        if (mgPanel) mgPanel.scrollTop = 0;
        // Kick off the lazy seats load AFTER the loading line is painted (Task 11).
        if (nextArea === 'admins') { void loadAdminSeats(); }
        return;
      }
      const navBtn = e.target.closest('[data-nav-tab]');
      if (navBtn) activateMainTab(navBtn.dataset.navTab);
    });
  }
  // --- Admin Players panel handlers ---
  // C48.3 (perf): the players-panel handlers (group filter, add-player form + save, the modal
  // close/overlay handlers, Group Manager, filter chips/select, search, skill sub-tab, select-all,
  // bulk bar) are extracted into bindPlayersPanelHandlers() so renderPlayersPanel() (a scoped
  // re-render of just #tab-players) can re-bind exactly them — without re-calling attachHandlers()
  // wholesale (which would DOUBLE-BIND the bottom nav, login/logout, kiosk, team-gen, etc., none of
  // which are guarded against re-binding). attachHandlers() runs this once per full render against a
  // fresh DOM; renderPlayersPanel() runs it against the freshly-rebuilt panel — neither double-binds,
  // because the previous panel elements (and their listeners) are discarded by the innerHTML swap.
  bindPlayersPanelHandlers();

  // C46 cleanup: the admin "Menu" dropdown (#admin-quick-open) was removed in C40 (Add = the + button,
// Show QR = the Dashboard tile, Check-in = the roster search + tap toggle — all duplicated). Its change
// handler is removed here as a dead orphan.

// C47 cleanup: the admin "Check In by name" modal (#admin-checkin-modal) was removed — it duplicated the
// roster search + per-row in/out toggle (and the public kiosk). Its markup, #admin-checkin-msg node, and
// handlers (#btn-check-in / #btn-check-out / runAdminModalCheck) are all deleted.

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

  // --- Admin logout ---
// Task 13 (2026-07-11): the code login is retired — email+password is the only sign-in,
// so logout just drops the real session + admin state.
const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    state.isAdmin = false;
    state.masterAdminAuthenticated = false;
    state.activeGroup = 'All';                   // reset view
    try { localStorage.setItem(LS_ACTIVE_GROUP_KEY, 'All'); } catch {}
    // C21: drop the real Supabase session too (local scope), so the JWT does not linger anywhere.
    if (supabaseClient) { try { await supabaseClient.auth.signOut({ scope: 'local' }); } catch {} }
    const synced = await syncFromSupabase();     // load public view dataset
    if (synced) saveLocal();
    render();
  });
}

// C21 + Identity (2026-07-08): follow the real session.
//  - An email+password account is recorded in state + its community role derived (best-effort),
//    and persists across reloads. Owner/organizer role sets isAdmin below — the ONLY admin source
//    since Task 13 (2026-07-11) retired the `.local` code login.
//  - Session loss drops admin state (an explicit signOut / failed refresh) and purges skill.
if (supabaseClient && supabaseClient.auth && typeof supabaseClient.auth.onAuthStateChange === 'function') {
  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    const email = (session && session.user && session.user.email) || '';

    // NOTE: supabase-js holds an internal lock during this callback — calling other supabase methods
    // (auth/rpc/from) INLINE here races/deadlocks (role came back null even though caller_role is fine).
    // So any supabase call below is deferred with setTimeout(0) per Supabase's own guidance.
    if (session) {
      // STORM GUARD (2026-07-09, found live on prod v09.1): this branch fires on EVERY auth event —
      // and the heavy work below (rpc + tournament reads) makes supabase-js re-validate/refresh the
      // token, which EMITS MORE auth events → a self-sustaining ~14/sec request storm
      // (ERR_INSUFFICIENT_RESOURCES). Only a GENUINE sign-in transition runs the heavy path; routine
      // TOKEN_REFRESHED / repeat events just keep the session object fresh and stop.
      const isNewSignIn = !state.authSession || !state.account || state.account.id !== session.user.id;
      state.authSession = session;
      state.account = { id: session.user.id, email };
      if (!isNewSignIn) return;
      closeAuthPage();
      if (state.loaded) { try { render(); } catch {} }   // show signed-in immediately
      // Slice 3b: a signed-out "claim your team" tap routed through sign-in — finish the journey.
      // Deferred: openClaimPage does a .from() read, and supabase calls inline in this callback deadlock.
      if (claimIntent) {
        claimIntent = false;
        setTimeout(() => { try { openClaimPage(); } catch (_) {} }, 0);
      }
      // Derive the community role out-of-band, then re-render (the account menu shows the role).
      // Retry a few times: a fresh SIGNED_IN can race the JWT propagation to PostgREST, so the first
      // caller_role may return null before the token attaches. Stop as soon as a role resolves or the
      // session is gone. A genuine no-membership spectator just falls through to null (a few cheap calls).
      setTimeout(async () => {
        try {
          for (let i = 0; i < 3; i++) {
            await deriveRole();
            if (state.role || !state.authSession) break;
            await new Promise((r) => setTimeout(r, 400));
          }
          // Auth Task 4 (2026-07-09) + Task 13 (2026-07-11): a signed-in owner/organizer gets the admin
          // surface from their SERVER role (caller_role) — the ONLY admin source now that the code login
          // is retired. A plain 'player' or null role never sets isAdmin here. Cleared on sign-out
          // (the SIGNED_OUT branch already resets isAdmin/masterAdminAuthenticated).
          if (state.role === 'owner' || state.role === 'organizer') {
            state.isAdmin = true;
            state.masterAdminAuthenticated = (state.role === 'owner');
          }
          // Slice 3c: load the personal layer (team_members) now instead of waiting for the next
          // 15s poll — the Home hero/My Team tile should light up right after sign-in.
          try { await tdbRefreshTournaments(); } catch (_) { /* the poll catches up */ }
          // Round 2 §12.3: resolve MY claimed player for the check-in hero. Storm-safe — this runs
          // ONLY inside the isNewSignIn-gated heavy block (genuine sign-in transition + initial
          // restore of a persisted real session), NEVER per auth event.
          void loadMyClaimedPlayer();
          if (state.loaded) { try { render(); } catch {} }
        } catch (err) { console.error('Role derive error', err); }
      }, 0);
      return;
    }

    // No session -> signed out.
    if (!session) {
      const wasSignedIn = !!state.authSession;
      state.authSession = null;
      state.account = null;
      state.role = null;
      state.teamMembers = null; // the personal layer signs out with the account (anon can't read claims)
      state.myClaimedPlayer = null; // Round 2 §12.3: clear the check-in hero on the SIGNED_OUT path too
      claimIntent = false;
      closeClaimPage(); // a claim page can't outlive its session (harmless no-op when not open)
      if (state.isAdmin) {
        state.isAdmin = false;
        state.masterAdminAuthenticated = false;
        state.activeGroup = 'All';
        // Reliability fix (2026-06-20): a SILENT session loss (JWT expiry / failed refresh) must purge
        // skill from memory + the localStorage cache the same way explicit logout does — re-fetch as anon
        // (the fetch omits the skill column when !isAdmin) and overwrite the cache before re-rendering.
        try {
          const synced = await syncFromSupabase();
          if (synced) saveLocal();
        } catch (err) { console.error('Post-logout anon re-sync error', err); }
        try { render(); } catch {}
      } else if (wasSignedIn && state.loaded) {
        try { render(); } catch {}
      }
    }
  });
}

// C47 cleanup: the manual "Save" button (#btn-save-supabase) was removed in C40 (the app auto-saves via
// realtime + the offline outbox). Its click handler is removed as a dead orphan. forceSaveAllToSupabase()
// stays — it's still used by the attendance write-through paths.

  // --- Public: Check In kiosk (C36 T1) — type your name -> tap it -> checked in ---
  const checkinSearch = document.getElementById('checkin-search');
  const checkinResults = document.getElementById('checkin-results');
  if (checkinSearch && checkinResults) {
    // Targeted DOM update — render the big name buttons from live state for the current query.
    // NEVER full-render on keystroke; this re-reads state so it also reflects in/out changes.
    // The pure helper's `checkedIn` is seeded from player.checked_in (the synced DB field); the
    // LIVE source of truth for the toggle is state.checkedIn (the key array checkInPlayer/
    // checkOutPlayer mutate instantly), so overlay it here so a just-tapped button flips at once,
    // before any Supabase round-trip.
    const renderCheckinResultsForQuery = () => {
      const html = buildKioskResultsHTML(checkinSearch.value);
      checkinResults.innerHTML = html;
      syncKioskIdleState(html); // C48.6: top-align the moment results appear; re-center when cleared
    };

    const showCheckinToast = (text) => {
      const toast = document.getElementById('checkin-toast');
      if (!toast) return;
      toast.textContent = text;
      toast.hidden = false;
      clearTimeout(showCheckinToast._t);
      showCheckinToast._t = setTimeout(() => { toast.hidden = true; }, 2600);
    };

    checkinSearch.addEventListener('input', renderCheckinResultsForQuery);

    // Toggle: tapping a NOT-checked-in name checks in; tapping a checked-in name checks out.
    // Both route through the SAME existing optimistic + rpc('check_in'|'check_out') + outbox path.
    // C47: tapping a name opens a confirm popup (Check in / Check out / Cancel) instead of toggling
    // immediately — so a mis-tap can't check the wrong person in or out. The toggle body is unchanged.
    const performKioskToggle = (player, isIn) => {
      if (!isIn) {
        if (checkInPlayer(player) && supabaseClient && player.id) {
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
        showCheckinToast(`${player.name} — you're checked in`);
      } else {
        if (checkOutPlayer(player) && supabaseClient && player.id) {
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
        showCheckinToast(`${player.name} — checked out`);
      }
      saveLocal();
      // Refresh just the stats + the result buttons (so the tapped button flips state) — no full render.
      const statsEl = document.getElementById('js-checkin-stats');
      if (statsEl) statsEl.innerHTML = buildCheckinStatsHTML();
      renderCheckinResultsForQuery();
    };

    checkinResults.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-checkin-id]');
      if (!btn) return;
      const id = btn.getAttribute('data-checkin-id');
      const player = state.players.find((p) => String(p.id) === String(id));
      if (!player) return;
      const isIn = (state.checkedIn || []).includes(playerIdentityKey(player));
      openKioskConfirm(player, isIn, () => performKioskToggle(player, isIn));
    });

    // Mike pick X (task-#10): the one-tap signed-in hero is retired ON THIS TAB (anon-only kiosk), so
    // there is no hero card to bind here anymore. state.myClaimedPlayer still feeds the account menu +
    // My team; the standalone checkin.html kiosk keeps its own hero + handler.

    // "I'm new — add me": reuse the EXACT register path, then check the new player in (kiosk intent).
    const newBtn = document.getElementById('btn-checkin-new');
    if (newBtn) {
      newBtn.addEventListener('click', async () => {
        const name = (checkinSearch.value || '').trim();
        if (!name) { showCheckinToast('Type your name first'); checkinSearch.focus(); return; }
        // C47: require a real first AND last name (each >= 2 chars) — single names cause "who is who" mix-ups.
        if (!isValidFullName(name)) { showCheckinToast('Enter your full first and last name'); checkinSearch.focus(); return; }
        // NF-8: don't register before the roster has loaded — state.players is empty pre-sync, so the
        // "already in history?" check below would miss an existing person and create a DUPLICATE.
        if (!state.loaded) { showCheckinToast('Still loading — one second, then tap again'); return; }

        // Already in history? Treat the kiosk "new" tap as a check-in for that existing player.
        const exists = state.players.find((p) => normalize(p.name) === normalize(name));
        if (exists) {
          if (checkInPlayer(exists) && supabaseClient && exists.id) {
            (async () => {
              try {
                const { error } = await supabaseClient.rpc('check_in', { p_id: exists.id });
                if (error) throw error;
                queueSupabaseRefresh();
              } catch (err) {
                console.error('Supabase update error', err);
                outboxEnqueue({ key: 'att:' + exists.id, kind: 'check_in', payload: { p_id: exists.id }, ts: Date.now() });
              }
            })();
          }
          showCheckinToast(`${exists.name} — you're checked in`);
          saveLocal();
          const statsEl = document.getElementById('js-checkin-stats');
          if (statsEl) statsEl.innerHTML = buildCheckinStatsHTML();
          renderCheckinResultsForQuery();
          return;
        }

        const activeGroupForRegister = normalizeActiveGroupSelection(state.activeGroup || 'All');
        // Wave 1d: a public-kiosk registration with no group selected defaults to CLUB_GROUP (the same
        // canonical group checkin.html uses) so the two doors don't create duplicate, mutually-invisible
        // people. An admin who has a real group selected still registers into THAT group.
        const group = (activeGroupForRegister && activeGroupForRegister !== 'All' && activeGroupForRegister !== UNGROUPED_FILTER_VALUE) ? activeGroupForRegister : CLUB_GROUP;
        const groups = group ? [group] : [];
        const skill = 0.0;
        // pending:true keeps this in-flight row alive through a racing sync (mergePlayersAfterSync).
        const inserted = { name, skill, group, groups, pending: true };
        state.players = [...state.players, inserted];
        // kiosk intent: a "new" player is here and checking in now — check them in optimistically too.
        checkInPlayer(inserted);
        showCheckinToast(`${name} — you're checked in`);
        saveLocal();
        const statsEl0 = document.getElementById('js-checkin-stats');
        if (statsEl0) statsEl0.innerHTML = buildCheckinStatsHTML();
        renderCheckinResultsForQuery();

        if (supabaseClient) {
          try {
            // C21: register through the SECURITY DEFINER RPC (the only anon write door under locked RLS).
            // Wave 1d (2026-06-25): register AND check in atomically (p_checked_in:true) in ONE call —
            // mirrors checkin.html. The old two-step (register, then a separate check_in) could leave the
            // server checked_in=false if the page closed/lost network between the calls, silently dropping
            // a first-timer who was told "you're checked in" from the count. Migration 0015's register_player
            // records the check_ins row when p_checked_in.
            const { data, error } = await supabaseClient.rpc('register_player', { p_name: name, p_group: group, p_checked_in: true });
            if (error) throw error;
            const row = Array.isArray(data) ? data[0] : data;
            if (row && row.id) inserted.id = row.id;
            await ensureGroupCatalogEntriesSupabase(group ? [group] : []);
            // Reliability (2026-06-24): only clear pending if we got an id (else the merge could drop this new player).
            if (inserted.id) inserted.pending = false;
            queueSupabaseRefresh();
          } catch (err) {
            console.error('Supabase insert error', err);
            inserted.pending = true;
            // Wave 1d: carry the checked-in intent so the offline retry registers atomically too.
            outboxEnqueue({ key: 'reg:' + normalize(name) + ':' + (group || ''), kind: 'register', payload: { name, group, checked_in: true }, ts: Date.now() });
            showCheckinToast('Saved on this device — will sync when online');
          }
          saveLocal();
          const statsEl1 = document.getElementById('js-checkin-stats');
          if (statsEl1) statsEl1.innerHTML = buildCheckinStatsHTML();
          renderCheckinResultsForQuery();
        }
      });
    }

    // Task 13 (2026-07-11): no admin affordance on this page — the code login is retired and
    // email+password (the sign-in page) is the admin sign-in.
  }

  // --- Player cards: inline actions ---
  function attachPlayerRowHandlers() {
    // Intentionally a no-op.
    // Player row actions are delegated globally for lower per-render overhead.
  }
  attachPlayerRowHandlers();

  // Task 14: the old-shell "Start new session" button (btn-reset-checkins) + the operator-action undo log
  // handler are gone — both were mounted only in the deleted admin shell. The new pickup-day form calls
  // startNewSessionFlow() directly (gate-free), and recordOperatorAction still logs actions for the DB.

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
    generateBtn.addEventListener('click', async () => {
      if (!(await confirmReRollIfResultsRecorded())) return; // NF-13: don't silently wipe recorded results
      state.lastTeamSize = null; // manual "Teams: N" = Auto / as-equal mode
      // C31 #1: pass the current teams so a re-roll moves the most players to new teammates (varied but fair).
      const generated = generateBalancedGroups(state.players, state.checkedIn, state.groupCount, state.generatedTeams);
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
    btn.addEventListener('click', async () => {
      const size = Number(btn.getAttribute('data-team-size'));
      if (!size) return;
      if (!(await confirmReRollIfResultsRecorded())) return; // NF-13: don't silently wipe recorded results
      const numTeams = Math.max(2, Math.floor(state.checkedIn.length / size));
      state.groupCount = numTeams;
      state.lastTeamSize = size;
      // C31 #1: pass the current teams so re-tapping a size re-rolls to a genuinely different fair split.
      const generated = generateBalancedGroups(state.players, state.checkedIn, numTeams, state.generatedTeams);
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
      if (caret) caret.innerHTML = liveNetsCaretHTML(nowCollapsed);
      liveNetsToggle.setAttribute('aria-expanded', nowCollapsed ? 'false' : 'true');
      saveLocal();
    });
  }

  // [Task 4 — R5 cut] the report-live-match-result + clear-live-match-result handlers were deleted with the
  // casual courts board. They recorded a casual net win/loss, nudged skills ±0.1, and advanced the court order
  // — all cut by Mike ("show the teams, not what court is playing"). Skills change by admin edit only now. The
  // old-shell Live-Nets card builder (adminTeamsHTML + render()'s casual-teams block) was deleted in Task 14.
  // Team generation + cross-device team persistence are unaffected.

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
      btnSaveSession.textContent = 'Save session';
      if (ok) {
        // 2026-06-27: render() rebuilds the whole shell (the preview / Clear / Share controls appear), which
        // would destroy this #session-save-msg node BEFORE the browser paints — so the green "Session saved"
        // was never actually seen. Render FIRST, then set the confirmation on the freshly-rendered element.
        render();
        const fresh = document.getElementById('session-save-msg');
        if (fresh) {
          fresh.style.color = 'var(--success)';
          fresh.textContent = 'Session saved';
          fresh.style.display = 'block';
          setTimeout(() => { const m = document.getElementById('session-save-msg'); if (m) m.style.display = 'none'; }, 2500);
        }
      } else {
        const msg = document.getElementById('session-save-msg');
        if (msg) { msg.style.color = 'var(--danger)'; msg.textContent = 'Save failed — check connection'; msg.style.display = 'block'; }
      }
    });
  }

  const btnShareSession = document.getElementById('btn-share-session');
  if (btnShareSession) {
    btnShareSession.addEventListener('click', () => openQrModal());
  }

  // NF-12: clear the scheduled session (hides the public "Next session" card until a new one is set).
  const btnClearSession = document.getElementById('btn-clear-session');
  if (btnClearSession) {
    btnClearSession.addEventListener('click', async () => {
      if (!(await appConfirm({
        title: 'Clear session',
        message: 'Remove the scheduled session? Players will stop seeing the "Next session" card until you set a new one.',
        confirmText: 'Clear',
        danger: true,
      }))) return;
      btnClearSession.disabled = true;
      const ok = await clearSession();
      btnClearSession.disabled = false;
      if (ok) {
        // render FIRST (it rebuilds the shell + drops the now-stale Clear button), then show the confirmation
        // on the freshly-rendered #session-save-msg (a render() afterwards would have destroyed it before paint).
        render();
        const fresh = document.getElementById('session-save-msg');
        if (fresh) {
          fresh.style.color = 'var(--success)';
          fresh.textContent = 'Session cleared';
          fresh.style.display = 'block';
          setTimeout(() => { const m = document.getElementById('session-save-msg'); if (m) m.style.display = 'none'; }, 2500);
        }
      } else {
        const msg = document.getElementById('session-save-msg');
        if (msg) { msg.style.color = 'var(--danger)'; msg.textContent = 'Clear failed — check connection'; msg.style.display = 'block'; }
      }
    });
  }
}

// C48.3 (perf): players-panel handlers extracted from attachHandlers() so the scoped
// renderPlayersPanel() can re-bind EXACTLY these after rebuilding only #tab-players, instead of
// re-running attachHandlers() (which would double-bind the bottom nav, login/logout, kiosk,
// team-gen, session, QR-modal handlers — none of which are idempotent). Called once per full
// render() by attachHandlers(), and once per scoped re-render by renderPlayersPanel(); each call
// binds to freshly-built panel elements, so there is no double-bind (the prior panel nodes and
// their listeners are discarded by the innerHTML swap). Every block below is MOVED VERBATIM from
// attachHandlers() — same querySelectors, same closures, same behavior. The only call-site change
// is sites 1-3 (group filter, filter chips, #player-tab-select) now invoke renderPlayersPanel()
// instead of render(); the rendered output is byte-identical.
function bindPlayersPanelHandlers() {
  // --- Group controls (Admin Players) ---
const groupSelect = document.getElementById('group-filter-select');
if (groupSelect) {
  groupSelect.addEventListener('change', () => {
    state.activeGroup = normalizeActiveGroupSelection(groupSelect.value || 'All');
    saveLocal();
    renderPlayersPanel();
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
void openPopup; // retained verbatim from attachHandlers (defined-but-unused there too; closePopup is the live one)

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
        return next;
      };
      if (Number.isNaN(skill)) skill = 0; // treat empty input as 0
      if (!name || skill < 0) return;

      const idx = state.players.findIndex((p) => normalize(p.name) === normalize(name));
      const isNew = idx === -1;
      // C47: a NEW player must have a real first AND last name (mix-up prevention). Updating an
      // existing player is exempt, so a legacy single-name entry can still be fixed/renamed.
      if (isNew && !isValidFullName(name)) {
        const t = makeSaveToast('Enter a first and last name');
        if (t) setTimeout(() => { try { t.remove(); } catch {} }, 1800);
        if (nameInput) nameInput.focus();
        return;
      }

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
        const defaultPrimary = (activeGroupForInsert && activeGroupForInsert !== 'All' && activeGroupForInsert !== UNGROUPED_FILTER_VALUE) ? activeGroupForInsert : '';
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
              // Reliability (2026-06-24): only clear pending once an id exists, so a no-id insert isn't dropped by the merge.
              if (inserted.id) inserted.pending = false;
              if (remoteOK) { ok = true; queueSupabaseRefresh(); }
              else await reconcileToSupabaseAuthority('admin-save-player-insert');
            } catch (err) {
              console.error('Supabase insert error', err);
              // Reliability (2026-06-24): insert failed (no id) — keep pending=true so the admin's new player survives the merge.
              if (inserted.id) inserted.pending = false;
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

  // --- Filters & search ---
  const tabSelect = document.getElementById('player-tab-select');
  if (tabSelect) {
    tabSelect.addEventListener('change', (ev) => {
      state.playerTab = ev.target.value;
      sessionStorage.setItem(LS_TAB_KEY, state.playerTab);
      state.skillSubTab = null;
      renderPlayersPanel(); // C48.3 (perf): scoped re-render — only #tab-players changes; output identical to render()
    });
  }

  // --- Filter chips (drive the SAME state.playerTab as #player-tab-select) ---
  document.querySelectorAll('[data-chip-tab]').forEach((chipEl) => {
    chipEl.addEventListener('click', () => {
      const value = String(chipEl.getAttribute('data-chip-tab') || 'all');
      if (state.playerTab === value) return;
      state.playerTab = value;
      sessionStorage.setItem(LS_TAB_KEY, state.playerTab);
      state.skillSubTab = null;
      renderPlayersPanel(); // C48.3 (perf): scoped re-render — only #tab-players changes; output identical to render()
    });
  });

  // --- Groups chip: reveal/hide the group filter sub-control (no state change) ---
  const groupsChip = document.querySelector('[data-chip-groups]');
  if (groupsChip) {
    groupsChip.addEventListener('click', () => {
      const sub = document.getElementById('group-filter-sub');
      const nextOpen = !groupsChip.classList.contains('on');
      groupsChip.classList.toggle('on', nextOpen);
      groupsChip.setAttribute('aria-pressed', String(nextOpen));
      if (sub) sub.classList.toggle('is-open', nextOpen);
    });
  }

  // --- Add (+) in the roster header: opens the Add/Update Player modal ---
  const rosterAddBtn = document.getElementById('roster-add-player');
  if (rosterAddBtn) {
    rosterAddBtn.addEventListener('click', () => {
      const modal = document.getElementById('admin-add-player-modal');
      if (!modal) return;
      modal.style.display = 'flex';
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
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
      renderPlayersPanel(); // C48.3 (perf): scoped re-render — same class of action as the filter chips/select; output identical to render()
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
          // C21 single-source contract (reliability fix 2026-06-20): route bulk attendance through the
          // SECURITY DEFINER check_in/check_out RPCs — the ONLY code that also maintains the check_ins
          // history table. A direct `.update({checked_in})` set the flag but never inserted/deleted the
          // check_ins row, silently under-counting attendance and leaving orphan rows on bulk check-out.
          const { error } = await supabaseClient.rpc(shouldCheckIn ? 'check_in' : 'check_out', { p_id: id });
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
    const dest = chosen;

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
    const targetGroup = chosen;
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
      // Reliability fix (2026-06-20): coalesce the two post-boot async renders into ONE. loadSession
      // (conditional) and tdbRefreshTournaments (unconditional) each fired their own render() within ~1s
      // of boot, on top of this immediate paint — up to 3 full renders. Keep the immediate paint for
      // first contentful render; render once more after both settle.
      Promise.allSettled([loadSession(), loadPickupDays(), tdbRefreshTournaments()]).then(() => render());

      if (!SyncManager.poll.interval) {
        // Keep multiple devices converged without requiring a full page refresh.
        SyncManager.poll.interval = setInterval(() => {
          if (document.hidden) return;
          void flushOutbox(); // C22 item 3: keep retrying queued offline writes
          queueSupabaseRefresh(800);
          queueTournamentRefresh(800);
          // Task 2: keep the pickup-day set fresh (day-of gate flips as a new day arrives / is added on
          // another device). Only repaint when the set actually changed, to avoid clobbering a half-typed form.
          void loadPickupDays().then((changed) => { if (changed && !tournamentTabIsDirty()) partialRender(); });
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
  // Perf (2026-06-22 smoothness reliability check): the old code read `p.scrollTop` SYNCHRONOUSLY
  // inside a capture-phase scroll handler. During a partialRender/render the `.players` innerHTML
  // swap resets the panel's scrollTop and fires a scroll event, so `update()` ran mid-DOM-mutation
  // and forced a synchronous layout of the whole (215-row) panel — a measured 439ms of forced
  // reflow on a SINGLE filter-chip tap at 4x CPU throttle (564ms total block). rAF-batch the read
  // so it runs at most once per frame, AFTER layout has settled, off the click->paint critical
  // path. Behavior is identical (button still shows when the active panel is scrolled >200, hides
  // at top, works on every panel, survives renders); it just updates one frame later (imperceptible).
  let _b2tRafPending = false;
  const scheduleUpdate = () => {
    if (_b2tRafPending) return;
    _b2tRafPending = true;
    requestAnimationFrame(() => { _b2tRafPending = false; update(); });
  };
  // C25 item 5: serve whichever tab-panel is active (Players, Teams, Tournament),
  // not just Players. Scroll events don't bubble, so capture on document — this
  // catches scroll from the active panel AND survives render() rebuilding the
  // panels (the old code bound the #tab-players element directly, so it broke
  // after the first full render() and never worked on Teams/Tournament).
  // passive: the handler never preventDefaults, so let the browser scroll without waiting on JS.
  document.addEventListener('scroll', (e) => {
    const t = e.target;
    if (t && t.classList && t.classList.contains('tab-panel') && t.classList.contains('active')) scheduleUpdate();
  }, { capture: true, passive: true });
  btn.addEventListener('click', () => {
    const p = activePanel();
    if (p) p.scrollTo({ top: 0, behavior: 'smooth' });
  });
  // A freshly-activated tab may be at top or already scrolled — re-evaluate on switch.
  window.addEventListener('as-tab-changed', scheduleUpdate);
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


