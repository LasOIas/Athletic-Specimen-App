// Explicit Save on the tournament-edit screens (2026-08-04) — Mike: "with everything that edits the
// tournament there needs to be a save button that instantly applies the changes."
//
// WHY THIS FILE EXISTS. Registration and Event settings had no Save at all: every field wrote on FOCUSOUT,
// and mgrSaveField swallowed its error whole (`catch (err) { console.warn(...) }`) with no success feedback
// and NO failure feedback. Type a Venmo link, tap away, and a refused write looked exactly like a saved one —
// the failure this project's canon rates worst ("being told it's fixed when it isn't"), discovered at a live
// event when players cannot pay. mgSaveSettingsField said 'Saved' on a bare `error: null`, which is not the
// same claim: the RLS policies on `tournaments` are USING row FILTERS, not RAISE guards, so a session that
// has drifted to anon or off its organizer membership gets an UPDATE matching ZERO rows and `error: null`.
//
// So the thing these tests actually pin is the READ-BACK. `applyWrites: false` below is that exact silent
// denial — the UPDATE "succeeds", the stored row never moves — and every save path must report failure and
// keep the organizer's typed text on screen. A future edit that drops mgVerifyTournamentFields and trusts
// `error: null` fails this file.
//
// Harness: the vm-sandbox + Supabase recorder from tournament-reset.test.js / tournament-end-unplayed.test.js
// (app.js is a browser classic script), extended with a small element REGISTRY so getElementById/querySelector
// return real stubs with .value / .textContent / .disabled — enough to drive the field collectors, the Save
// button state and partialRender's poll guard. It is not a DOM: a repaint does not re-create elements, so the
// status stub survives repaintManage() and can be asserted after it.
//
// WHAT THIS DOES NOT PROVE (§17): that the server accepts the UPDATE, or which RLS policy set is live on
// `tournaments`. The read-back is precisely what makes the screen honest either way.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const JULY = '0f37a9dc-0a62-473b-8096-f74234affc48';
const JUNE = 'cee5b605-587c-449b-87a6-3e7e3a0c557a';

const FAILED = 'That did not save. Check you are signed in as an admin, then try again.';
const OFFLINE = 'Could not save. Check the connection and try again.';

const noop = () => {};
const emptyList = { forEach: noop, length: 0, item: () => null };

// A stub element with the surface the save paths touch. `attrs` backs getAttribute so the Save button's
// data-mg-save round-trips.
function makeEl(tagName, id) {
  const classes = new Set();
  const el = {
    tagName: tagName || 'DIV', id: id || '', value: '', textContent: '', innerHTML: '',
    disabled: false, style: {}, dataset: {}, scrollTop: 0, attrs: {},
    classList: {
      add: (c) => classes.add(c), remove: (c) => classes.delete(c),
      toggle: (c) => (classes.has(c) ? classes.delete(c) : classes.add(c)),
      contains: (c) => classes.has(c),
    },
    setAttribute(k, v) { el.attrs[k] = String(v); },
    getAttribute(k) { return el.attrs[k] == null ? null : el.attrs[k]; },
    removeAttribute(k) { delete el.attrs[k]; },
    appendChild: noop, removeChild: noop, remove: noop, focus: noop, blur: noop,
    addEventListener: noop, removeEventListener: noop,
    querySelector: () => null, querySelectorAll: () => emptyList,
    closest: () => null, contains: () => false, hasChildNodes: () => true,
  };
  return el;
}

// `applyWrites: false` is the SILENT RLS DENIAL: the UPDATE resolves with error:null and the stored row is
// never touched, so the read-back finds the old values. `rowGone` drops the row from the refreshed list.
// `failOn(rec)` makes one statement reject outright (the thrown-error branch).
function makeRecorder(server, failOn) {
  const calls = [];
  const client = {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: noop } } }),
      getSession: async () => ({ data: { session: null } }),
      getUser: async () => ({ data: { user: null } }),
    },
    channel: () => ({ on: () => ({ subscribe: noop }) }),
    removeChannel: noop,
    rpc: async (name, args) => { calls.push({ table: 'rpc:' + name, op: 'rpc', payload: args, filters: [] }); return { data: null, error: null }; },
    from(table) {
      const rec = { table, op: 'select', payload: null, filters: [] };
      let pushed = false;
      const push = () => { if (!pushed) { pushed = true; calls.push(rec); } };
      const chain = {
        delete() { rec.op = 'delete'; push(); return chain; },
        update(payload) { rec.op = 'update'; rec.payload = payload; push(); return chain; },
        insert(payload) { rec.op = 'insert'; rec.payload = payload; push(); return chain; },
        upsert(payload) { rec.op = 'upsert'; rec.payload = payload; push(); return chain; },
        select() { push(); return chain; },
        eq(col, val) { rec.filters.push([col, val]); return chain; },
        in(col, val) { rec.filters.push([col, val]); return chain; },
        order() { return chain; }, limit() { return chain; },
        single() { return chain; }, maybeSingle() { return chain; },
        then(resolve) {
          if (failOn && failOn(rec)) return Promise.resolve({ data: null, error: { message: 'simulated ' + rec.table + ' failure' } }).then(resolve);
          if (rec.table === 'tournaments' && rec.op === 'update' && server.applyWrites) Object.assign(server.row, rec.payload);
          const data = (rec.table === 'tournaments' && rec.op === 'select')
            ? (server.rowGone ? [] : [Object.assign({}, server.row)])
            : [];
          return Promise.resolve({ data, error: null, count: 0 }).then(resolve);
        },
      };
      return chain;
    },
  };
  return { client, calls };
}

function loadApp(opts) {
  const o = opts || {};
  const server = {
    row: Object.assign({
      id: JULY, name: 'July 2026 tournament', status: 'setup', registration_open: false,
      venmo_link: null, buy_in: null, team_size: 4, net_count: 3,
      pool_target: 15, pool_cap: 20, bracket_target: 21, match_cap: 21, bracket_cap: null,
      win_by_2: true, grand_final_reset: false, rules: '', announcement: null,
    }, o.row || {}),
    applyWrites: o.applyWrites !== false,
    rowGone: !!o.rowGone,
  };
  const { client, calls } = makeRecorder(server, o.failOn);

  // The element registry. Inputs are registered by the bridge's `field()`; everything else is created here.
  const els = new Map();
  const container = makeEl('DIV', 'mg-container');
  const panel = makeEl('DIV', 'tab-manage');
  panel.querySelector = (sel) => (sel === '.container' ? container : null);
  panel.contains = (el) => !!el && (el === panel || Array.from(els.values()).indexOf(el) >= 0);
  els.set('tab-manage', panel);
  els.set('root', makeEl('DIV', 'root'));
  const saveBtn = makeEl('BUTTON', 'mg-save-btn');
  saveBtn.disabled = true;

  const documentStub = {
    readyState: 'loading', // keeps the bottom bootstrap from calling init() at load
    activeElement: null,
    getElementById: (id) => els.get(id) || null,
    querySelector: (sel) => {
      if (sel === '#tab-manage .container') return container;
      if (sel === '[data-mg-save]') return saveBtn.attrs['data-mg-save'] ? saveBtn : null;
      if (sel === '[data-mg-save="registration"]') return saveBtn.attrs['data-mg-save'] === 'registration' ? saveBtn : null;
      if (sel === '[data-mg-save="settings"]') return saveBtn.attrs['data-mg-save'] === 'settings' ? saveBtn : null;
      return null;
    },
    querySelectorAll: () => emptyList,
    createElement: (tag) => makeEl(String(tag || 'div').toUpperCase()),
    createDocumentFragment: () => makeEl('DIV'),
    addEventListener: noop, removeEventListener: noop,
    head: makeEl('HEAD'), body: makeEl('BODY'), documentElement: makeEl('HTML'),
  };
  const windowStub = {
    supabase: { createClient: () => client },
    addEventListener: noop, removeEventListener: noop,
    matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop, removeEventListener: noop }),
    location: { href: 'http://localhost/', search: '', hash: '', pathname: '/', reload: noop },
    navigator: { onLine: true, userAgent: 'node', serviceWorker: { register: async () => ({}) } },
    requestAnimationFrame: noop, cancelAnimationFrame: noop,
    setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop, scrollTo: noop,
  };
  windowStub.window = windowStub;
  const localStorageStub = { getItem: () => null, setItem: noop, removeItem: noop, clear: noop, key: () => null, length: 0 };
  const sandbox = {
    window: windowStub, document: documentStub, localStorage: localStorageStub,
    navigator: windowStub.navigator, location: windowStub.location,
    requestAnimationFrame: noop, cancelAnimationFrame: noop,
    setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop,
    console, SUPABASE_URL: 'http://localhost', SUPABASE_KEY: 'anon',
  };
  sandbox.globalThis = sandbox; sandbox.self = sandbox;

  const epilogue = `
    ;globalThis.__bridge = {
      open: (screen) => {
        state.isAdmin = true;
        state.tournaments = [globalThis.__server.row];
        state.activeTournamentId = globalThis.__server.row.id;
        state.tournamentTeams = []; state.tournamentPools = []; state.tournamentMatches = [];
        activeMainTab = 'manage';
        manageView = 'tournament';
        mgtView = (screen === 'settings') ? 'settings' : 'registration';
        bootPaintDone = true;
        return (screen === 'settings') ? buildMgSettingsHTML() : buildMgRegistrationHTML();
      },
      setAdmin: (v) => { state.isAdmin = !!v; },
      saveAll: (screen) => mgSaveScreenFields(screen),
      blurReg: (id) => mgrSaveField(id),
      blurSettings: (id) => mgSaveSettingsField(id),
      toggleReg: () => mgrToggleRegistration(),
      toggleSetting: (f) => mgToggleSettingsField(f),
      syncBtn: () => mgSyncSaveButton(),
      dirtyIds: (screen) => mgDirtyFieldIds(screen === 'settings' ? MGES_FIELD_IDS : MGR_FIELD_IDS, mgActiveTournament()),
      regDirty: () => manageRegDirty(),
      settingsDirty: () => manageSettingsDirty(),
      poll: () => partialRender(),
      sameSaved: (a, b) => mgSameSavedValue(a, b),
      tournament: () => mgActiveTournament(),
    };`;

  const pureSrc = readFileSync(new URL('../public/pure.js', import.meta.url), 'utf8');
  const appSrc = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const context = vm.createContext(sandbox);
  sandbox.__server = server;
  vm.runInContext(pureSrc, context, { filename: 'pure.js' });
  vm.runInContext(appSrc + epilogue, context, { filename: 'app.js' });

  const bridge = sandbox.__bridge;
  // Register one input by id, seeded with what the screen would render (so it starts CLEAN).
  const field = (id, value) => {
    const el = makeEl('INPUT', id);
    el.value = value == null ? '' : String(value);
    els.set(id, el);
    return el;
  };
  const status = (id) => { const el = makeEl('P', id); els.set(id, el); return el; };
  const armSave = (screen) => { saveBtn.attrs['data-mg-save'] = screen; return saveBtn; };
  const writes = () => calls.filter((c) => c.table === 'tournaments' && c.op === 'update');
  return { bridge, calls, writes, server, field, status, armSave, saveBtn, container, panel, els, documentStub };
}

// Open the Registration screen with its three fields seeded clean + the Save button + the status line.
function openRegistration(opts) {
  const h = loadApp(opts);
  h.bridge.open('registration');
  const t = h.server.row;
  h.venmo = h.field('mgr-venmo', t.venmo_link == null ? '' : t.venmo_link);
  h.buyin = h.field('mgr-buyin', t.buy_in == null ? '' : t.buy_in);
  h.teamsize = h.field('mgr-teamsize', String(Number(t.team_size) || 4));
  h.fnote = h.field('mgr-fnote', '');
  h.st = h.status('mgr-status');
  h.armSave('registration');
  return h;
}

function openSettings(opts) {
  const h = loadApp(opts);
  h.bridge.open('settings');
  const t = h.server.row;
  const s = (v) => (v == null ? '' : String(v));
  h.name = h.field('mges-name', s(t.name));
  h.teamsize = h.field('mges-teamsize', s(t.team_size));
  h.nets = h.field('mges-nets', s(t.net_count));
  h.pooltarget = h.field('mges-pooltarget', s(t.pool_target));
  h.poolcap = h.field('mges-poolcap', s(t.pool_cap));
  h.brackettarget = h.field('mges-brackettarget', s(t.bracket_target != null ? t.bracket_target : t.match_cap));
  h.bracketcap = h.field('mges-bracketcap', s(t.bracket_cap));
  h.buyin = h.field('mges-buyin', s(t.buy_in));
  h.st = h.status('mges-status');
  h.armSave('settings');
  return h;
}

describe('the Save button writes every dirty field in ONE call', () => {
  it('batches all three Registration fields into a single tournaments UPDATE', async () => {
    const h = openRegistration();
    h.venmo.value = 'https://venmo.com/u/athleticspecimen';
    h.buyin.value = '$80 a team';
    h.teamsize.value = '6';
    await h.bridge.saveAll('registration');
    const w = h.writes();
    expect(w.length).toBe(1);
    expect(w[0].payload.venmo_link).toBe('https://venmo.com/u/athleticspecimen');
    expect(w[0].payload.buy_in).toBe('$80 a team');
    expect(w[0].payload.team_size).toBe(6);
    // Scoped to the one tournament — the June event lives in the same table and is irreplaceable.
    expect(w[0].filters).toEqual([['id', JULY]]);
    expect(JSON.stringify(w)).not.toContain(JUNE);
  });

  it('sends ONLY the fields that changed, never the untouched ones', async () => {
    const h = openRegistration();
    h.buyin.value = '$100 a team';
    await h.bridge.saveAll('registration');
    const payload = h.writes()[0].payload;
    expect(payload.buy_in).toBe('$100 a team');
    expect(payload).not.toHaveProperty('venmo_link');
    expect(payload).not.toHaveProperty('team_size');
  });

  it('batches every dirty Event-settings knob into a single UPDATE, match_cap in lockstep', async () => {
    const h = openSettings({ row: { bracket_cap: 30 } }); // a real cap, so emptying the field is a real change
    h.name.value = 'August 2026 tournament';
    h.pooltarget.value = '11';
    h.brackettarget.value = '25';
    h.bracketcap.value = '';            // blank clears a nullable cap
    await h.bridge.saveAll('settings');
    const w = h.writes();
    expect(w.length).toBe(1);
    expect(w[0].payload.name).toBe('August 2026 tournament');
    expect(w[0].payload.pool_target).toBe(11);
    expect(w[0].payload.bracket_target).toBe(25);
    expect(w[0].payload.match_cap).toBe(25);   // NF-1 back-compat: legacy readers use match_cap
    expect(w[0].payload.bracket_cap).toBeNull();
  });

  it('clears a text column with null (not an empty string) when the field is emptied', async () => {
    const h = openRegistration({ row: { venmo_link: 'https://venmo.com/u/old' } });
    h.venmo.value = '   ';
    await h.bridge.saveAll('registration');
    expect(h.writes()[0].payload.venmo_link).toBeNull();
  });
});

describe('the Save button is inert until something changed', () => {
  it('issues NO write and claims nothing new when every field still matches the tournament', async () => {
    const h = openRegistration({ row: { venmo_link: 'https://venmo.com/u/as', buy_in: '$80 a team' } });
    const ok = await h.bridge.saveAll('registration');
    expect(ok).toBe(false);
    expect(h.writes().length).toBe(0);
    // (2026-08-25) The status line is the screen's RESTING state now, seeded "Saved" in the builder and
    // flipped to "Unsaved changes" by mgSyncSaveButton the moment a value differs. Nothing was written, so
    // it stays exactly where it was — a clean screen says "Saved", not "Saving…" and not an error.
    expect(h.st.textContent).toBe('Saved');
    expect(h.st.classList.contains('is-bad')).toBe(false);
  });

  it('the status line says Unsaved changes the moment a value differs, and Saved when it matches again', () => {
    const h = openRegistration();
    h.venmo.value = 'https://venmo.com/u/as';
    h.bridge.syncBtn();
    expect(h.st.textContent).toBe('Unsaved changes');
    h.venmo.value = '';
    h.bridge.syncBtn();
    expect(h.st.textContent).toBe('Saved');
  });

  it('never talks over an error line: a refused write stays on screen through the next sync', async () => {
    const h = openRegistration({ applyWrites: false });
    h.venmo.value = 'https://venmo.com/u/as';
    await h.bridge.saveAll('registration');
    expect(h.st.textContent).toBe(FAILED);
    h.bridge.syncBtn();                      // the value is still dirty — but the failure outranks it
    expect(h.st.textContent).toBe(FAILED);
    expect(h.st.classList.contains('is-bad')).toBe(true);
  });

  it('renders disabled and wakes only when a value differs from the LOADED tournament', () => {
    const h = openRegistration();
    h.bridge.syncBtn();
    expect(h.saveBtn.disabled).toBe(true);
    h.venmo.value = 'https://venmo.com/u/as';
    h.bridge.syncBtn();
    expect(h.saveBtn.disabled).toBe(false);
    // Typed back to the loaded value → quiet again (dirtiness is measured against the tournament, not a
    // snapshot taken on the first keystroke).
    h.venmo.value = '';
    h.bridge.syncBtn();
    expect(h.saveBtn.disabled).toBe(true);
  });

  it('treats whitespace-only retyping of an empty column as clean', () => {
    const h = openRegistration();
    h.buyin.value = '   ';
    expect(h.bridge.dirtyIds('registration')).toEqual([]);
  });

  it('renders the Save control disabled in the built HTML of both screens', () => {
    const reg = loadApp().bridge.open('registration');
    expect(reg).toContain('data-mg-save="registration"');
    expect(reg).toMatch(/data-mg-save="registration"[^>]*disabled/);
    expect(reg).toContain('id="mgr-status"');
    const set = loadApp().bridge.open('settings');
    expect(set).toContain('data-mg-save="settings"');
    expect(set).toMatch(/data-mg-save="settings"[^>]*disabled/);
  });
});

describe('the READ-BACK — "no error" is not "saved"', () => {
  it('reports failure when the refreshed row does not carry the value (silent RLS denial)', async () => {
    // The UPDATE resolves with error:null and matches ZERO rows: `tournaments` RLS is a USING row filter,
    // not a RAISE. Without the read-back this is the case that prints "Saved" over an unchanged event.
    const h = openRegistration({ applyWrites: false });
    h.venmo.value = 'https://venmo.com/u/athleticspecimen';
    const ok = await h.bridge.saveAll('registration');
    expect(ok).toBe(false);
    expect(h.writes().length).toBe(1);          // it really did try
    expect(h.st.textContent).toBe(FAILED);
    expect(h.st.classList.contains('is-bad')).toBe(true);
  });

  it('leaves the typed text in the field and Save lit after a refused write, so nothing is lost', async () => {
    const h = openRegistration({ applyWrites: false });
    h.venmo.value = 'https://venmo.com/u/athleticspecimen';
    await h.bridge.saveAll('registration');
    expect(h.venmo.value).toBe('https://venmo.com/u/athleticspecimen');
    expect(h.saveBtn.disabled).toBe(false);
    expect(h.bridge.dirtyIds('registration')).toEqual(['mgr-venmo']);
  });

  it('says Saved and quiets the button only once the refreshed row carries every value', async () => {
    const h = openRegistration();
    h.venmo.value = 'https://venmo.com/u/athleticspecimen';
    h.teamsize.value = '6';
    const ok = await h.bridge.saveAll('registration');
    expect(ok).toBe(true);
    expect(h.st.textContent).toBe('Saved');
    expect(h.st.classList.contains('is-bad')).toBe(false);
    expect(h.saveBtn.disabled).toBe(true);
    // and the derived note under the field is re-stated from the value that just saved
    expect(h.fnote.textContent).toBe('Players pay on Venmo when they register');
  });

  it('treats a row missing from the refreshed list as unproven, never as saved', async () => {
    const h = openRegistration({ rowGone: true });
    h.buyin.value = '$80 a team';
    const ok = await h.bridge.saveAll('registration');
    expect(ok).toBe(false);
    expect(h.st.textContent).toBe(FAILED);
  });

  it('re-reads the row from the server after every write (the proof is a real select)', async () => {
    const h = openRegistration();
    h.buyin.value = '$80 a team';
    await h.bridge.saveAll('registration');
    const seq = h.calls.filter((c) => c.table === 'tournaments').map((c) => c.op);
    expect(seq).toContain('update');
    expect(seq.indexOf('select')).toBeGreaterThan(seq.indexOf('update')); // read-back comes AFTER the write
  });

  it('compares read-back values type-tolerantly (PostgREST JSON) but never calls a miss a match', () => {
    const h = loadApp();
    expect(h.bridge.sameSaved(6, '6')).toBe(true);        // a number can come back as a numeric string
    expect(h.bridge.sameSaved(null, null)).toBe(true);
    expect(h.bridge.sameSaved(true, true)).toBe(true);
    expect(h.bridge.sameSaved(false, false)).toBe(true);
    expect(h.bridge.sameSaved(6, 4)).toBe(false);
    expect(h.bridge.sameSaved(null, 'x')).toBe(false);
    expect(h.bridge.sameSaved('x', null)).toBe(false);    // the column stayed empty — NOT saved
    expect(h.bridge.sameSaved(true, false)).toBe(false);
  });

  it('reports the connection failure honestly when the write throws', async () => {
    const h = openRegistration({ failOn: (rec) => rec.table === 'tournaments' && rec.op === 'update' });
    h.buyin.value = '$80 a team';
    const ok = await h.bridge.saveAll('registration');
    expect(ok).toBe(false);
    expect(h.st.textContent).toBe(OFFLINE);
    expect(h.st.classList.contains('is-bad')).toBe(true);
  });

  it('will not claim a save for a session that is not an admin', async () => {
    const h = openRegistration();
    h.bridge.setAdmin(false);
    h.venmo.value = 'https://venmo.com/u/as';
    const ok = await h.bridge.saveAll('registration');
    expect(ok).toBe(false);
    expect(h.writes().length).toBe(0);
    expect(h.st.textContent).toBe(FAILED);   // not a silent no-op
  });
});

describe('focusout-save no longer swallows a failure', () => {
  it('surfaces a silently-refused blur write on the Registration screen', async () => {
    // The exact bug: `catch (err) { console.warn('mgrSaveField', err); }` reported nothing at all, and a
    // zero-row UPDATE never even reached the catch.
    const h = openRegistration({ applyWrites: false });
    h.venmo.value = 'https://venmo.com/u/athleticspecimen';
    await h.bridge.blurReg('mgr-venmo');
    expect(h.writes().length).toBe(1);
    expect(h.st.textContent).toBe(FAILED);
    expect(h.venmo.value).toBe('https://venmo.com/u/athleticspecimen'); // the typed text stays put
  });

  it('confirms a blur write that DID land, on the screen that never had feedback at all', async () => {
    const h = openRegistration();
    h.buyin.value = '$80 a team';
    await h.bridge.blurReg('mgr-buyin');
    expect(h.st.textContent).toBe('Saved');
    expect(h.server.row.buy_in).toBe('$80 a team');
  });

  it('surfaces a silently-refused blur write on Event settings, which used to print Saved', async () => {
    const h = openSettings({ applyWrites: false });
    h.pooltarget.value = '11';
    await h.bridge.blurSettings('mges-pooltarget');
    expect(h.st.textContent).toBe(FAILED);
    expect(h.st.textContent).not.toBe('Saved');
  });

  it('writes ONLY the blurred field, leaving another dirty field for the Save button', async () => {
    const h = openSettings();
    h.pooltarget.value = '11';
    h.poolcap.value = '18';
    await h.bridge.blurSettings('mges-pooltarget');
    const payload = h.writes()[0].payload;
    expect(payload.pool_target).toBe(11);
    expect(payload).not.toHaveProperty('pool_cap');
    expect(h.bridge.dirtyIds('settings')).toEqual(['mges-poolcap']);
  });

  it('reverts a bad number, says why, and issues NO write', async () => {
    const h = openSettings();
    h.pooltarget.value = 'abc';
    await h.bridge.blurSettings('mges-pooltarget');
    expect(h.writes().length).toBe(0);
    expect(h.pooltarget.value).toBe('15');
    expect(h.st.textContent).toBe('That needs to be a number. Left it unchanged.');
  });

  it('refuses to blank the tournament name and stops the whole batch on a bad entry', async () => {
    const h = openSettings();
    h.name.value = '   ';
    h.pooltarget.value = '11';        // a perfectly good change alongside the bad one
    const ok = await h.bridge.saveAll('settings');
    expect(ok).toBe(false);
    expect(h.writes().length).toBe(0); // never half-writes on the strength of a value that must be retyped
    expect(h.name.value).toBe('July 2026 tournament');
    expect(h.st.textContent).toBe('Name is required. Left it unchanged.');
  });
});

describe('net_count keeps its atomic re-net inside the batch', () => {
  it('routes nets through apply_net_count_change mid-play and keeps it OUT of the plain UPDATE', async () => {
    const h = openSettings({ row: { status: 'pools' } });
    h.nets.value = '5';
    h.pooltarget.value = '11';
    await h.bridge.saveAll('settings');
    // the atomic RPC carried net_count (migration 0031 / the closed F7-F8 drift bug)
    expect(h.calls.some((c) => c.table === 'rpc:apply_net_count_change')).toBe(true);
    const w = h.writes();
    expect(w.length).toBe(1);
    expect(w[0].payload).not.toHaveProperty('net_count');
    expect(w[0].payload.pool_target).toBe(11);
  });

  it('writes net_count as a plain column before play, with no RPC', async () => {
    const h = openSettings({ row: { status: 'setup' } });
    h.nets.value = '5';
    await h.bridge.saveAll('settings');
    expect(h.calls.some((c) => c.table === 'rpc:apply_net_count_change')).toBe(false);
    expect(h.writes()[0].payload.net_count).toBe(5);
  });
});

describe('the switches apply on tap, and report a failure instead of silently springing back', () => {
  it('surfaces a refused registration toggle', async () => {
    const h = openRegistration({ applyWrites: false });
    await h.bridge.toggleReg();
    expect(h.writes()[0].payload.registration_open).toBe(true);
    expect(h.server.row.registration_open).toBe(false);   // the row never moved
    expect(h.st.textContent).toBe(FAILED);
    expect(h.st.classList.contains('is-bad')).toBe(true);
  });

  it('stays silent and applies when the registration toggle really lands', async () => {
    const h = openRegistration();
    await h.bridge.toggleReg();
    expect(h.server.row.registration_open).toBe(true);
    expect(h.st.textContent).toBe('');
    expect(h.st.classList.contains('is-bad')).toBe(false);
  });

  it('surfaces a refused win_by_2 / grand_final_reset toggle', async () => {
    const h = openSettings({ applyWrites: false });
    await h.bridge.toggleSetting('win_by_2');
    expect(h.writes()[0].payload.win_by_2).toBe(false);
    expect(h.st.textContent).toBe(FAILED);
    const h2 = openSettings({ applyWrites: false });
    await h2.bridge.toggleSetting('grand_final_reset');
    expect(h2.writes()[0].payload.grand_final_reset).toBe(true);
    expect(h2.st.textContent).toBe(FAILED);
  });

  it('surfaces a thrown toggle failure too', async () => {
    const h = openRegistration({ failOn: (rec) => rec.table === 'tournaments' && rec.op === 'update' });
    await h.bridge.toggleReg();
    expect(h.st.textContent).toBe(OFFLINE);
  });
});

describe('a background poll never clobbers an edit in progress', () => {
  it('bails the repaint while a field is FOCUSED (the existing guard)', () => {
    const h = openRegistration();
    h.documentStub.activeElement = h.venmo;
    expect(h.bridge.regDirty()).toBe(true);
    h.container.innerHTML = 'SENTINEL';
    h.bridge.poll();
    expect(h.container.innerHTML).toBe('SENTINEL');
  });

  it('bails the repaint for a DIRTY but UNFOCUSED field — the window a Save tap opens', () => {
    // Tapping Save blurs the field a beat before the write goes out, and an abandoned tap leaves it blurred
    // and unsaved. Focus alone would have let the poll throw the typed value away.
    const h = openRegistration();
    h.documentStub.activeElement = null;
    h.venmo.value = 'https://venmo.com/u/athleticspecimen';
    expect(h.bridge.regDirty()).toBe(true);
    h.container.innerHTML = 'SENTINEL';
    h.bridge.poll();
    expect(h.container.innerHTML).toBe('SENTINEL');
  });

  it('repaints normally when the screen is idle, so counts stay live', () => {
    const h = openRegistration();
    h.documentStub.activeElement = null;
    expect(h.bridge.regDirty()).toBe(false);
    h.container.innerHTML = 'SENTINEL';
    h.bridge.poll();
    expect(h.container.innerHTML).not.toBe('SENTINEL');
    expect(h.container.innerHTML).toContain('mgr-venmo');
  });

  it('protects a dirty unfocused Event-settings field the same way', () => {
    const h = openSettings();
    h.documentStub.activeElement = null;
    h.pooltarget.value = '11';
    expect(h.bridge.settingsDirty()).toBe(true);
    h.container.innerHTML = 'SENTINEL';
    h.bridge.poll();
    expect(h.container.innerHTML).toBe('SENTINEL');
  });

  it('lets the poll through on Event settings once the edit is saved', async () => {
    const h = openSettings();
    h.documentStub.activeElement = null;
    h.pooltarget.value = '11';
    await h.bridge.saveAll('settings');
    h.pooltarget.value = '11';           // the field now matches the saved row
    expect(h.bridge.settingsDirty()).toBe(false);
    h.container.innerHTML = 'SENTINEL';
    h.bridge.poll();
    expect(h.container.innerHTML).not.toBe('SENTINEL');
  });
});
