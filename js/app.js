/*
 * app.js — UI layer for the Kanban board.
 * Depends on window.KanbanState (js/state.js) and window.Sortable (vendor/Sortable.min.js).
 * Classic script (no ES modules) so it works from file:// in Chrome/Edge.
 */
(function () {
  'use strict';

  var S = window.KanbanState;
  if (!S) {
    window.console && console.error('KanbanState is not loaded — include js/state.js before js/app.js');
    return;
  }

  // ---------- tiny DOM helpers ----------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }

  function formatDue(dateStr) {
    var p = String(dateStr).split('-');
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    if (isNaN(d.getTime())) return dateStr;
    var out = MONTHS[d.getMonth()] + ' ' + d.getDate();
    if (d.getFullYear() !== new Date().getFullYear()) out += ' ' + d.getFullYear();
    return out;
  }

  // ---------- inline SVG icons (no icon fonts, no network) ----------
  var ICONS = {
    chevron: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>',
    dots: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="3" cy="8" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="13" cy="8" r="1.4"/></svg>',
    menu: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M2.5 4h11M2.5 8h11M2.5 12h11"/></svg>',
    cursor: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 2.5l8.6 4.6-3.7 1.2-1.3 3.7z"/></svg>',
    speaker: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 6v4h2.6L8.5 12.6V3.4L5.1 6z"/><path d="M11 5.6a3.4 3.4 0 0 1 0 4.8M12.8 3.8a6 6 0 0 1 0 8.4"/></svg>',
    speakerOff: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 6v4h2.6L8.5 12.6V3.4L5.1 6z"/><path d="M11.2 6l3 4M14.2 6l-3 4"/></svg>',
    graphics: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M3 13V9.5M6.6 13V7M10.2 13V9M13.8 13V4"/></svg>',
    motion: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 8h2.1l1.4-3.8 2.8 7.6 1.4-3.8h3.3"/></svg>',
    font: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 13 5.9 4l3.4 9M3.7 10h4.4"/><path d="M12.4 3.2v9.6M10.3 5.3l2.1-2.1 2.1 2.1M10.3 10.7l2.1 2.1 2.1-2.1"/></svg>',
    update: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.2 8a5.2 5.2 0 1 1-1.5-3.7l1.5 1.6"/><path d="M13.2 2.6v3.3H9.9M8 5.2v3.4M6.4 7.4 8 9l1.6-1.6"/></svg>',
    sun: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"/></svg>',
    moon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.5 9.6A5.7 5.7 0 0 1 6.4 2.5a5.7 5.7 0 1 0 7.1 7.1z"/></svg>',
    palette: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 1.8C4.5 1.8 1.8 4.4 1.8 7.8c0 3.3 2.6 6.1 6 6.1 1.1 0 1.6-.7 1.6-1.4 0-1-.9-1.2-.9-2.1 0-.8.7-1.3 1.5-1.3h1.6c1.4 0 2.6-1 2.6-2.4C14.2 3.9 11.6 1.8 8 1.8z"/><circle cx="5" cy="7" r=".8" fill="currentColor" stroke="none"/><circle cx="7.9" cy="4.8" r=".8" fill="currentColor" stroke="none"/><circle cx="11" cy="6" r=".8" fill="currentColor" stroke="none"/><circle cx="5" cy="10.2" r=".8" fill="currentColor" stroke="none"/></svg>',
    download: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2v8M5 7.5L8 10.5l3-3M3 13.5h10"/></svg>',
    upload: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 10.5V2.5M5 5l3-3 3 3M3 13.5h10"/></svg>',
    reset: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.8 8a5.2 5.2 0 1 0 1.5-3.7L2.8 5.9"/><path d="M2.8 2.6v3.3h3.3"/></svg>',
    search: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>',
    close: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
    calendar: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3"/></svg>',
    flag: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 14V2.5M4 2.5h8L10.5 5 12 7.5H4"/></svg>',
    user: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="5" r="2.5"/><path d="M3 14a5 5 0 0 1 10 0"/></svg>',
    check: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5l3.5 3.5L13 4.5"/></svg>',
    pencil: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11.3 2.7l2 2L5.5 12.5 3 14l.5-2.5z"/></svg>',
    grip: '<svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor" aria-hidden="true"><circle cx="3" cy="2.5" r="1.05"/><circle cx="7" cy="2.5" r="1.05"/><circle cx="3" cy="6" r="1.05"/><circle cx="7" cy="6" r="1.05"/><circle cx="3" cy="9.5" r="1.05"/><circle cx="7" cy="9.5" r="1.05"/></svg>',
    up: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10l4-4 4 4"/></svg>',
    down: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>',
    plus: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>',
    archive: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="12" height="3.2" rx="1"/><path d="M3.2 6.2V12a1 1 0 0 0 1 1h7.6a1 1 0 0 0 1-1V6.2M6.5 9h3"/></svg>',
    note: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M3 4.5h10M3 8h10M3 11.5h6"/></svg>',
    file: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h3L8 4.8h4.5A1.5 1.5 0 0 1 14 6.3v5.2a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5z"/></svg>'
  };

  // ---------- app state ----------
  var App = {
    board: null,
    query: '',
    searchPopOpen: false,
    activeCardId: null,
    quickAddColumnId: null,
    addingList: false,
    menuColumnId: null,
    themePickerOpen: false,
    view: 'board',
    calYear: null,
    calMonth: null,
    calMode: 'month', // month | year
    selectedDay: null,
    activeEventId: null,
    eventDraft: null,
    rte: null,
    focusComposer: null, // 'quick' | 'list' | null — consumed by renderBoard
    undoSnapshot: null,
    sortable: [],
    justDragged: false,
    checkDrag: null, // checklist item id while its grip is being dragged
    toastTimer: null,
    confirmCb: null,
    confirmNoCb: null,
    backupDir: null,
    editedThisSession: false,
    restoredFrom: null,
    reloaded: false, // this page load is a reload, not a fresh start
    hadBackupScript: false,
    fileName: null,
    fileStatus: 'none' // none | prompt | ok | readonly | error
  };
  window.Kanban = App; // debug / testing hook

  var BACKUP_HANDLE_KEY = 'kanban.backupdir.v1';

  var storage = {
    getItem: function (k) { return window.localStorage.getItem(k); },
    setItem: function (k, v) { window.localStorage.setItem(k, v); },
    removeItem: function (k) { window.localStorage.removeItem(k); }
  };

  // ---------- commit + render ----------
  // Changes are saved in batches: a burst of edits (typing in a note) becomes one write, at most
  // SAVE_WAIT after the last edit and never later than SAVE_MAX after the first. Closing, hiding or
  // reloading the window saves immediately (flushSave / KanbanFlush).
  var SAVE_WAIT = 250, SAVE_MAX = 1000, saveTimer = 0, saveBy = 0, saveDirty = false;
  function persist() {
    App.editedThisSession = true;
    lsSet(UNBACKED_KEY, '1');
    var now = Date.now();
    if (!saveDirty) { saveDirty = true; saveBy = now + SAVE_MAX; }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, Math.max(0, Math.min(SAVE_WAIT, saveBy - now)));
  }
  function flushSave() {
    clearTimeout(saveTimer);
    if (!saveDirty) return;
    saveDirty = false;
    if (!rememberLive(App.board)) toast('Could not save — browser storage may be full', null);
    writeBackup(false);
  }
  // The desktop program asks for this when the window closes, so the newest edit is never lost.
  window.KanbanFlush = function () {
    if (!App.board || !App.editedThisSession) return null;
    flushSave();
    return JSON.stringify(App.board, null, 2);
  };

  // Reload safety (desktop). KANBAN_LAST_SESSION is a snapshot from when the program started, so after a
  // page reload it is out of date. This marker lives in sessionStorage: it survives a reload but not a
  // restart, so a reload uses the copy from this run and a fresh start still trusts the disk.
  // '1' = localStorage holds the newest board; 'disk' = it would not fit, the newest is latest.json.
  var LIVE_KEY = 'kanban.live.v1';
  function rememberLive(board) {
    var ok = S.saveBoard(storage, board);
    try { window.sessionStorage.setItem(LIVE_KEY, ok ? '1' : 'disk'); } catch (e) { /* optional */ }
    return ok;
  }
  // The board from before a reload in this run, or null on a fresh start.
  function liveBoard() {
    var mark = null;
    try { mark = window.sessionStorage.getItem(LIVE_KEY); } catch (e) { /* optional */ }
    if (!window.kanbanDisk || !mark) return null;
    function parse(raw) {
      var b = null;
      try { b = JSON.parse(raw || 'null'); } catch (e) { /* damaged */ }
      return b && Array.isArray(b.columns) ? S.normalizeBoard(b) : null;
    }
    var live = mark === '1' ? parse(lsGet(S.STORAGE_KEY)) : null;
    if (live) return live;
    try {
      var x = new XMLHttpRequest();
      x.open('GET', 'Kanban%20Auto-Backups/' + LATEST_NAME, false);
      x.send();
      return x.status === 200 ? parse(x.responseText) : null;
    } catch (e) { return null; } // fall back to the launch copy
  }

  // Sound effects are chosen by what actually changed between the old and the new board.
  function sfxStats(b) {
    var st = { cards: 0, arch: 0, items: 0, done: 0, cols: b.columns.length, events: (b.events || []).length, place: '' };
    Object.keys(b.cards).forEach(function (id) {
      var c = b.cards[id];
      st.cards++;
      if (c.archivedAt) st.arch++;
      (c.checklist || []).forEach(function (i) { st.items++; if (i.done) st.done++; });
    });
    st.place = b.columns.map(function (c) { return c.id + ':' + c.cards.join(','); }).join('|');
    return st;
  }
  function sfxFor(a, b) {
    var x = sfxStats(a), y = sfxStats(b);
    if (y.cards < x.cards || y.cols < x.cols || y.events < x.events || y.items < x.items) return 'delete';
    if (y.cards > x.cards || y.cols > x.cols || y.events > x.events || y.items > x.items) return 'add';
    if (y.arch > x.arch) return 'archive';
    if (y.arch < x.arch) return 'restore';
    if (y.done > x.done) return 'check';
    if (y.done < x.done) return 'uncheck';
    if (y.place !== x.place) return 'move';
    return null;
  }

  function commit(board, opts) {
    if (window.KanbanSfx && App.board) { try { var snd = sfxFor(App.board, board); if (snd) window.KanbanSfx.play(snd); } catch (e) { /* sound is optional */ } }
    App.board = board;
    render(opts && opts.skipModal ? { skipModal: true } : null);
    persist(App.board);
  }

  function render(opts) {
    opts = opts || {};
    renderTheme();
    renderTopbar();
    renderMain();
    if (App.activeCardId && !opts.skipModal) renderModal();
    if (NB) NB.refresh();
    refreshReminders();
  }

  function renderMain() {
    if (App.view === 'board') renderBoard(); // hidden otherwise; setView('board') renders it
    if (App.view === 'calendar') renderCalendar();
    else if (App.view === 'archive') { renderArchive(); renderSearchPop(); }
    else renderSearchPop();
  }

  // Light / dark: every theme has a native mode; the other one is a hand-made palette per theme (css, "light / dark mode").
  var NATIVE_DARK = ['blueprint', 'cyberpunk', 'genshin', 'fallout'];
  var DARK_ON_SELECT = ['cyberpunk', 'genshin', 'fallout', 'nier'];
  var GENSHIN_ELEMENTS = ['anemo', 'geo', 'electro', 'dendro', 'hydro', 'pyro', 'cryo'];
  var GENSHIN_ELEMENT_LABELS = {
    anemo: 'Anemo', geo: 'Geo', electro: 'Electro', dendro: 'Dendro',
    hydro: 'Hydro', pyro: 'Pyro', cryo: 'Cryo'
  };
  var MODE_KEY = 'kanban.mode.v1';
  var CURSOR_KEY = 'kanban.cursor.v1';
  var GRAPHICS_KEY = 'kanban.graphics.v1';
  var GRAPHICS_LEVELS = ['low', 'medium', 'high'];
  var GRAPHICS_LABELS = { low: 'Low', medium: 'Medium', high: 'High' };
  var MOTION_KEY = 'kanban.motion.v1';
  var MOTION_FOCUS = true; // the override is only active while the app window has focus
  var PERF_KEY = 'kanban.perf.v1';
  var MOTION_REDUCE = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var FONT_KEY = 'kanban.fontsize.v1';
  var FONT_SIZES = ['small', 'medium', 'large'];
  var FONT_LABELS = { small: 'Small', medium: 'Medium', large: 'Large' };
  function cursorsOn() { return lsGet(CURSOR_KEY) !== '0'; }
  function nativeMode() { return NATIVE_DARK.indexOf(App.board.theme) !== -1 ? 'dark' : 'light'; }
  function defaultModeFor(name) { return DARK_ON_SELECT.indexOf(name) !== -1 ? 'dark' : 'light'; }
  function effectiveMode() {
    var pref = lsGet(MODE_KEY);
    return pref === 'light' || pref === 'dark' ? pref : defaultModeFor(App.board.theme);
  }

  // One element per local day. The date hash keeps the choice stable all day and
  // looks random, while the previous-day check guarantees a visible daily change.
  function genshinDayIndex(d) {
    var key = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    var h = 2166136261;
    for (var i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) % GENSHIN_ELEMENTS.length;
  }

  function genshinElementForDate(d) {
    var today = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var yesterday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
    var i = genshinDayIndex(today);
    if (i === genshinDayIndex(yesterday)) i = (i + 1) % GENSHIN_ELEMENTS.length;
    return GENSHIN_ELEMENTS[i];
  }

  function refreshGenshinElement() {
    var root = document.documentElement;
    var next = genshinElementForDate(new Date());
    if (root.getAttribute('data-genshin-element') !== next) {
      root.setAttribute('data-genshin-element', next);
      document.dispatchEvent(new CustomEvent('genshin-element-change', { detail: next }));
    }
    return next;
  }

  var genshinDayTimer = 0;
  function scheduleGenshinDay() {
    clearTimeout(genshinDayTimer);
    var now = new Date();
    var next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    genshinDayTimer = setTimeout(function () {
      refreshGenshinElement();
      renderTheme();
      checkReminders();
      scheduleGenshinDay();
    }, Math.max(1000, next.getTime() - now.getTime()));
  }

  // Only touch <html> when something changed: every write there can restyle the whole page.
  function setRoot(name, value) {
    var root = document.documentElement;
    if (root.getAttribute(name) !== value) root.setAttribute(name, value);
  }

  function renderTheme() {
    var genEl = refreshGenshinElement();
    setRoot('data-theme', App.board.theme);
    if (window.KanbanSfx) window.KanbanSfx.setTheme(App.board.theme);
    setRoot('data-cursors', cursorsOn() ? 'on' : 'off');
    setRoot('data-graphics', graphicsLevel());
    syncMotionAttr();
    syncPerfAttr();
    setRoot('data-font-size', fontSizeLevel());
    var mode = effectiveMode();
    setRoot('data-alt', mode !== nativeMode() ? '1' : '0');
    var farmSeason = window.KanbanFarm ? window.KanbanFarm.render(App.board.theme === 'pixel', mode === 'dark') : '';
    if (App.board.theme !== 'cyberpunk') document.documentElement.removeAttribute('data-cp-live');
    var gsHost = $('#genshin-stars');
    if (gsHost && App.board.theme !== 'genshin') {
      gsHost.style.removeProperty('--gs-mx');
      gsHost.style.removeProperty('--gs-my');
    }
    var mbtn = $('#btn-mode');
    if (mbtn) {
      if (!mbtn.getAttribute('data-ready')) {
        mbtn.querySelector('.sun').innerHTML = ICONS.sun;
        mbtn.querySelector('.moon').innerHTML = ICONS.moon;
        mbtn.setAttribute('data-ready', '1');
      }
      mbtn.setAttribute('aria-checked', mode === 'dark' ? 'true' : 'false');
      mbtn.title = mode === 'dark' ? 'Dark mode on (click for light)' : 'Light mode on (click for dark)';
    }

    var btn = $('#btn-theme');
    if (btn) {
      var themeName = themeLabel(App.board.theme);
      if (App.board.theme === 'genshin') themeName += ' · ' + GENSHIN_ELEMENT_LABELS[genEl] + ' day';
      if (App.board.theme === 'pixel' && farmSeason) themeName += ' · ' + farmSeason;
      btn.title = 'Change theme (current: ' + themeName + ')';
      btn.setAttribute('aria-label', btn.title);
      btn.setAttribute('aria-expanded', App.themePickerOpen ? 'true' : 'false');
    }

    var picker = $('#theme-picker');
    if (picker) {
      picker.hidden = !App.themePickerOpen;
      $$('#theme-picker .theme-option').forEach(function (opt) {
        var on = opt.getAttribute('data-theme-name') === App.board.theme;
        opt.classList.toggle('active', on);
        opt.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }
  }

  function openThemePicker() {
    App.themePickerOpen = true;
    renderTheme();
    var active = $('#theme-picker .theme-option.active') || $('#theme-picker .theme-option');
    if (active) active.focus();
  }

  function closeThemePicker(focusBtn) {
    if (!App.themePickerOpen) return;
    App.themePickerOpen = false;
    renderTheme();
    if (focusBtn !== false) { var b = $('#btn-theme'); if (b) b.focus(); }
  }

  // ---------- theme cycling + mode / sound / cursors (shared by the menu and keyboard) ----------
  function themeLabel(name) {
    var el = $('#theme-picker .theme-option[data-theme-name="' + name + '"] .theme-name');
    return el ? el.textContent : name;
  }

  function applyTheme(name) {
    App.board = S.setTheme(App.board, name);
    lsSet(MODE_KEY, defaultModeFor(name));
    renderTheme();
    schedulePerfCheck(1500);
  }

  function cycleTheme(dir) {
    var themes = (S.THEMES || []).slice();
    if (themes.length < 2) return;
    var i = themes.indexOf(App.board.theme);
    if (i === -1) i = 0;
    var next = themes[(i + dir + themes.length) % themes.length];
    applyTheme(next);
    if (window.KanbanSfx) window.KanbanSfx.play('theme');
    persist(App.board);
    toast('Theme: ' + themeLabel(next));
  }

  function toggleMode() {
    var dark = effectiveMode() === 'dark';
    lsSet(MODE_KEY, dark ? 'light' : 'dark');
    renderTheme();
    if (window.KanbanSfx) window.KanbanSfx.play('theme');
    toast(dark ? 'Light mode on' : 'Dark mode on');
  }

  function renderCursorToggle() {
    var on = cursorsOn();
    document.documentElement.setAttribute('data-cursors', on ? 'on' : 'off');
    var btn = $('#btn-cursor');
    if (!btn) return;
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
    var ico = btn.querySelector('.mi-ico'), st = btn.querySelector('.mi-state');
    if (ico) ico.innerHTML = ICONS.cursor;
    if (st) st.textContent = on ? 'On' : 'Off';
  }

  function toggleCursors() {
    var on = !cursorsOn();
    lsSet(CURSOR_KEY, on ? '1' : '0');
    renderCursorToggle();
    if (window.KanbanSfx) window.KanbanSfx.play('check');
    toast('Theme cursors ' + (on ? 'on' : 'off'));
  }

  function renderSoundToggle() {
    var btn = $('#btn-sound');
    if (!btn) return;
    var on = !window.KanbanSfx || window.KanbanSfx.enabled();
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
    var ico = btn.querySelector('.mi-ico'), st = btn.querySelector('.mi-state');
    if (ico) ico.innerHTML = on ? ICONS.speaker : ICONS.speakerOff;
    if (st) st.textContent = on ? 'On' : 'Off';
  }

  function toggleSound() {
    if (!window.KanbanSfx) return;
    var on = !window.KanbanSfx.enabled();
    window.KanbanSfx.setEnabled(on);
    renderSoundToggle();
    if (on) window.KanbanSfx.play('check');
    toast('Sound effects ' + (on ? 'on' : 'off'));
  }

  // How much of the animated theme background to draw: low, medium or high.
  function graphicsLevel() {
    var v = lsGet(GRAPHICS_KEY);
    return GRAPHICS_LEVELS.indexOf(v) !== -1 ? v : 'high';
  }

  // The stored preference: 'on' or 'off'. It only *takes effect* while the app is focused,
  // so a background window never keeps forcing animations past the OS setting.
  function motionSetting() {
    return lsGet(MOTION_KEY) !== 'off'; // on unless the user turned it off
  }

  // Effective state; data-motion is only "on" when the user enabled it AND the window is focused.
  function motionOverride() {
    return document.documentElement.getAttribute('data-motion') === 'on';
  }

  // Windows' animation setting reaches WebView2 as prefers-reduced-motion.
  // The explicit override is for users who want the full theme motion anyway.
  function motionAllowed() {
    return motionOverride() || !(MOTION_REDUCE && MOTION_REDUCE.matches);
  }

  // ---- automatic performance guard ----
  // Some PCs (integrated GPUs, big monitors) cannot hold 60 fps with every theme effect running.
  // After start-up and after theme/graphics/motion changes the app times ~3 s of animation frames;
  // if they are consistently slow it switches to "lite" (html[data-perf="lite"]): half the
  // particles, no pointer parallax, no full-screen pulse/sway layers, no glass blur. It is saved in
  // kanban.perf.v1 and cleared again whenever the user changes Graphics or Motion on purpose.
  function perfLite() { return document.documentElement.getAttribute('data-perf') === 'lite'; }
  function syncPerfAttr() {
    setRoot('data-perf', lsGet(PERF_KEY) === 'lite' ? 'lite' : 'full');
  }
  function resetPerf() {
    if (lsGet(PERF_KEY) !== 'lite') return;
    try { window.localStorage.removeItem(PERF_KEY); } catch (e) {}
    syncPerfAttr();
  }
  var perfTimer = 0, perfRun = 0;
  function schedulePerfCheck(delay) {
    clearTimeout(perfTimer);
    if (perfLite()) return;
    perfTimer = setTimeout(runPerfCheck, delay == null ? 1200 : delay);
  }
  function runPerfCheck() {
    var root = document.documentElement;
    if (perfLite() || !window.requestAnimationFrame) return;
    var animated = root.getAttribute('data-graphics') !== 'low' && motionAllowed();
    if (!animated || document.hidden || !document.hasFocus()) { schedulePerfCheck(6000); return; }
    var run = ++perfRun, last = 0, gaps = [], t0 = performance.now(), spoiled = false;
    function tick(now) {
      if (run !== perfRun) return; // superseded
      if (document.hidden || !document.hasFocus()) spoiled = true;
      if (last) { var d = now - last; if (d < 250) gaps.push(d); else spoiled = true; } // long stalls = user/OS, not rendering
      last = now;
      if (now - t0 < 3000) { requestAnimationFrame(tick); return; }
      if (spoiled || gaps.length < 45) { schedulePerfCheck(8000); return; }
      gaps.sort(function (a, b) { return a - b; });
      var median = gaps[gaps.length >> 1], p80 = gaps[Math.floor(gaps.length * 0.8)];
      if (median > 22 || p80 > 30) { // clearly under ~45 fps on a 60 Hz panel
        lsSet(PERF_KEY, 'lite');
        syncPerfAttr();
        toast('Eased background effects to keep the board smooth. Changing Graphics or Motion in the data menu resets this.');
      }
    }
    requestAnimationFrame(tick);
  }

  function syncMotionAttr() {
    var on = motionSetting() && MOTION_FOCUS;
    setRoot('data-motion', on ? 'on' : 'auto');
    setRoot('data-idle', MOTION_FOCUS ? '0' : '1'); // css pauses the decorative layers
  }

  function setMotionFocus(focused) {
    focused = !!focused;
    if (focused === MOTION_FOCUS) return;
    MOTION_FOCUS = focused;
    syncMotionAttr();
  }

  // Window focus, not element focus: switching tabs or blurring an input must not count.
  function bindMotionFocus() {
    MOTION_FOCUS = document.hasFocus ? document.hasFocus() : true;
    syncMotionAttr();
    window.addEventListener('focus', function () { setMotionFocus(true); });
    window.addEventListener('blur', function () { setMotionFocus(false); });
    document.addEventListener('visibilitychange', function () {
      setMotionFocus(!document.hidden && (document.hasFocus ? document.hasFocus() : true));
    });
  }

  function renderMotionToggle() {
    syncMotionAttr();
    var btn = $('#btn-motion');
    if (!btn) return;
    var on = motionSetting();
    var ico = btn.querySelector('.mi-ico'), st = btn.querySelector('.mi-state');
    if (ico) ico.innerHTML = ICONS.motion;
    if (st) st.textContent = on ? 'On' : 'Off';
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
    btn.setAttribute('aria-label', 'Motion override: ' + (on ? 'on (active while the app is focused)' : 'off'));
  }

  function toggleMotion() {
    var next = motionSetting() ? 'off' : 'on';
    lsSet(MOTION_KEY, next);
    resetPerf();
    renderMotionToggle();
    schedulePerfCheck(1500);
    if (window.KanbanSfx) window.KanbanSfx.play('theme');
    toast('Motion override ' + next);
  }

  function renderGraphicsToggle() {
    document.documentElement.setAttribute('data-graphics', graphicsLevel());
    var btn = $('#btn-graphics');
    if (!btn) return;
    var lvl = graphicsLevel();
    var ico = btn.querySelector('.mi-ico'), st = btn.querySelector('.mi-state');
    if (ico) ico.innerHTML = ICONS.graphics;
    if (st) st.textContent = GRAPHICS_LABELS[lvl];
    btn.setAttribute('aria-label', 'Background detail: ' + GRAPHICS_LABELS[lvl]);
  }

  function applyGraphicsLevel(next) {
    lsSet(GRAPHICS_KEY, next);
    resetPerf();
    schedulePerfCheck(1500);
    renderGraphicsToggle();
    if (window.KanbanSfx) window.KanbanSfx.play('theme');
    toast('Background detail: ' + GRAPHICS_LABELS[next]);
  }

  // Cycle forward, wrapping low -> medium -> high -> low (menu row / Ctrl + G).
  function cycleGraphics() {
    var i = GRAPHICS_LEVELS.indexOf(graphicsLevel());
    var next = GRAPHICS_LEVELS[(i + 1) % GRAPHICS_LEVELS.length];
    applyGraphicsLevel(next);
  }

  // Step one level up/down, stopping at high / low (never wraps). Ctrl + ] / Ctrl + [.
  function stepGraphics(dir) {
    var i = GRAPHICS_LEVELS.indexOf(graphicsLevel());
    var j = Math.max(0, Math.min(GRAPHICS_LEVELS.length - 1, i + (dir < 0 ? -1 : 1)));
    if (j === i) return;
    applyGraphicsLevel(GRAPHICS_LEVELS[j]);
  }

  // Interface font size: small, medium or large, applied as a scale on <html>.
  function fontSizeLevel() {
    var v = lsGet(FONT_KEY);
    return FONT_SIZES.indexOf(v) !== -1 ? v : 'medium';
  }

  function renderFontSize() {
    document.documentElement.setAttribute('data-font-size', fontSizeLevel());
    var btn = $('#btn-font');
    if (!btn) return;
    var lvl = fontSizeLevel();
    var ico = btn.querySelector('.mi-ico'), st = btn.querySelector('.mi-state');
    if (ico) ico.innerHTML = ICONS.font;
    if (st) st.textContent = FONT_LABELS[lvl];
    btn.setAttribute('aria-label', 'Font size: ' + FONT_LABELS[lvl]);
  }

  function applyFontSize(next) {
    lsSet(FONT_KEY, next);
    renderFontSize();
    if (window.KanbanSfx) window.KanbanSfx.play('theme');
    toast('Font size: ' + FONT_LABELS[next]);
  }

  // Cycle small -> medium -> large -> small (menu row).
  function cycleFontSize() {
    var i = FONT_SIZES.indexOf(fontSizeLevel());
    applyFontSize(FONT_SIZES[(i + 1) % FONT_SIZES.length]);
  }

  // Step one level up/down, stopping at large / small (never wraps). Ctrl + Up / Down.
  function stepFontSize(dir) {
    var i = FONT_SIZES.indexOf(fontSizeLevel());
    var j = Math.max(0, Math.min(FONT_SIZES.length - 1, i + (dir < 0 ? -1 : 1)));
    if (j === i) return;
    applyFontSize(FONT_SIZES[j]);
  }

  function renderTopbar() {
    var nameInput = $('#board-name');
    if (nameInput && document.activeElement !== nameInput) nameInput.value = App.board.name;

    var clear = $('#search-clear');
    if (clear) clear.style.display = $('#search').value ? '' : 'none';
  }

  // ---------- board rendering ----------
  function visibleCardIds(col) {
    if (!App.query) return col.cards;
    return col.cards.filter(function (cid) {
      var c = S.getCard(App.board, cid);
      return c && S.cardMatches(c, App.board, App.query);
    });
  }

  // description -> { html, text?, long? }: cards are re-rendered to text on every change, descriptions rarely differ
  var noteCache = {}, noteCount = 0;
  function noteOf(desc) {
    var c = noteCache[desc];
    if (c) return c;
    if (++noteCount > 800) { noteCache = {}; noteCount = 1; }
    var text = S.plainText(desc);
    c = { text: text, html: text ? window.KanbanRich.toEditorHTML(desc) : '' };
    // only a note this long can pass the 24-line cap, so only these are ever measured
    c.long = text.length > 380 || (c.html.match(/<(p|li|br|div|h[1-6])\b/gi) || []).length > 18;
    noteCache[desc] = c;
    return c;
  }

  function cardHTML(card) {
    var prog = S.checklistProgress(card);
    var overdue = S.isOverdue(card);
    var labels = card.labelIds.map(function (lid) {
      var l = S.getLabel(App.board, lid);
      return l ? '<span class="chip" style="--chip-color:' + esc(l.color) + '">' + esc(l.name) + '</span>' : '';
    }).join('');

    var meta = '';
    if (card.priority >= 2) {
      meta += '<span class="meta p' + card.priority + '" title="Priority: ' + S.priorityLabel(card.priority) + '">' + ICONS.flag + ' ' + S.priorityLabel(card.priority) + '</span>';
    }
    if (card.dueDate) {
      meta += '<span class="meta due' + (overdue ? ' overdue' : '') + '" title="Due ' + esc(card.dueDate) + '">' + ICONS.calendar + ' ' + esc(formatDue(card.dueDate)) + (overdue ? ' · overdue' : '') + '</span>';
    }
    if (card.assignee) meta += '<span class="meta assignee" title="Assignee">' + ICONS.user + ' ' + esc(card.assignee) + '</span>';

    var checklist = '';
    if (prog.total > 0) {
      var items = card.checklist.map(function (i) {
        return '<li class="cl-row' + (i.done ? ' done' : '') + '" data-item="' + i.id + '">' +
          '<input type="checkbox" data-item="' + i.id + '"' + (i.done ? ' checked' : '') + ' aria-label="' + esc(i.text) + '">' +
          '<span class="cl-text">' + esc(i.text) + '</span></li>';
      }).join('');
      checklist = '<div class="card-checklist' + (prog.pct === 100 ? ' complete' : '') + '" aria-label="Checklist: ' + prog.done + ' of ' + prog.total + ' done">' +
        '<div class="cl-head">' + ICONS.check + '<span class="cl-count">' + prog.done + '/' + prog.total + '</span>' +
        '<span class="cl-bar"><i style="width:' + prog.pct + '%"></i></span></div>' +
        '<ul class="cl-items">' + items + '</ul></div>';
    }

    var note = '';
    var n = noteOf(card.description);
    if (n.text) note = '<div class="card-note' + (n.long ? ' long' : '') + '">' + n.html + '</div>';
    var imgs = card.images || [];
    var strip = '';
    if (imgs.length) {
      strip = '<div class="card-imgs n' + Math.min(imgs.length, 3) + '">' + imgs.slice(0, 3).map(function (id) {
        return '<img data-img="' + id + '" alt="" draggable="false" loading="lazy">';
      }).join('') + (imgs.length > 3 ? '<span class="card-imgs-more">+' + (imgs.length - 3) + '</span>' : '') + '</div>';
    }
    return '<li class="card" data-card-id="' + card.id + '" tabindex="0" aria-label="Open card: ' + esc(card.title) + '">' +
      (labels ? '<div class="card-labels">' + labels + '</div>' : '') +
      '<h3 class="card-title">' + esc(card.title) + '</h3>' +
      note +
      strip +
      (meta ? '<div class="card-meta">' + meta + '</div>' : '') +
      checklist +
      '</li>';
  }

  function quickAddHTML(colId) {
    return '<div class="quick-add">' +
      '<textarea id="quick-add-text" rows="2" maxlength="300" placeholder="Card title, then press Enter"></textarea>' +
      '<div class="quick-add-actions">' +
        '<button class="btn primary" data-action="add-card" data-column="' + colId + '">Add card</button>' +
        '<button class="btn" data-action="cancel-quickadd">Cancel</button>' +
      '</div>' +
    '</div>';
  }

  function columnMenuHTML(col) {
    var items = [
      { action: 'rename', label: 'Rename list' },
      { action: 'collapse', label: col.collapsed ? 'Expand list' : 'Collapse list' },
      { action: 'wip', label: 'WIP limit…' },
      { sep: true },
      { action: 'sort-priority', label: 'Sort by: Priority' },
      { action: 'sort-due', label: 'Sort by: Due date' },
      { action: 'sort-created', label: 'Sort by: Created' },
      { sep: true },
      { action: 'archive-cards', label: 'Archive all cards', disabled: col.cards.length === 0 },
      { action: 'clear-cards', label: 'Delete all cards', danger: col.cards.length > 0 },
      { action: 'delete-column', label: 'Delete list', danger: true }
    ];
    return '<div class="column-menu" role="menu" aria-label="List actions">' + items.map(function (it) {
      if (it.sep) return '<div class="menu-sep" role="separator"></div>';
      return '<button class="menu-item' + (it.danger ? ' danger' : '') + '"' + (it.disabled ? ' disabled' : '') + ' role="menuitem" data-action="' + it.action + '" data-column="' + col.id + '">' + it.label + '</button>';
    }).join('') + '</div>';
  }

  function columnParts(col) {
    var label = col.collapsed ? 'Expand list' : 'Collapse list';
    return {
      cls: 'column' + (col.collapsed ? ' collapsed' : '') +
        (col.wipLimit != null && col.cards.length > col.wipLimit ? ' over-wip' : '') + (App.menuColumnId === col.id ? ' menu-open' : ''),
      head: '<header class="column-header">' +
        '<button class="icon-btn collapse-btn" data-action="collapse" data-column="' + col.id + '" title="' + label + '" aria-label="' + label + '">' + ICONS.chevron + '</button>' +
        '<h2 class="column-title" data-action="rename" data-column="' + col.id + '" title="Click to rename">' + esc(col.name) + '</h2>' +
        '<button class="icon-btn menu-btn" data-action="column-menu" data-column="' + col.id + '" title="List actions" aria-label="List actions">' + ICONS.dots + '</button>' +
        '</header>',
      menu: App.menuColumnId === col.id ? columnMenuHTML(col) : '',
      list: col.collapsed ? '' : '<ul class="card-list" data-column="' + col.id + '"></ul>',
      foot: col.collapsed ? '' : '<footer class="column-footer">' +
        (App.quickAddColumnId === col.id ? quickAddHTML(col.id) :
          '<button class="link-btn add-card-btn" data-action="quick-add" data-column="' + col.id + '">' + ICONS.plus + ' Add a card</button>') +
        '</footer>'
    };
  }

  function listComposerHTML() {
    return '<section class="column list-composer">' +
      '<div class="composer">' +
        '<input id="new-list-name" type="text" class="composer-input" placeholder="List name" maxlength="80">' +
        '<div class="composer-actions">' +
          '<button class="btn primary" data-action="submit-list">Add list</button>' +
          '<button class="btn" data-action="cancel-add-list">Cancel</button>' +
        '</div>' +
      '</div>' +
    '</section>';
  }

  // Board cards grow with their notes, up to 24 lines (css: .card-note max-height). Only notes that could
  // be longer are measured, to fade out the cut-off end.
  function fitCardNotes(root) {
    var notes = $$('.card-note.long', root || $('#columns'));
    var over = notes.map(function (n) { return n.scrollHeight > n.clientHeight + 1; }); // reads before writes
    notes.forEach(function (n, i) { n.classList.toggle('clipped', over[i]); });
  }

  // Keyed rendering: elements are reused when their markup is unchanged, so one edit touches one card
  // instead of rebuilding the board (which also keeps scroll positions, focus and loaded images).
  var cardEls = {};   // card id -> <li>
  var columnEls = {}; // column id -> <section>
  var SLOTS = ['head', 'menu', 'list', 'foot'];

  function makeEl(html) {
    var tpl = document.createElement('template');
    tpl.innerHTML = html;
    return tpl.content.firstElementChild;
  }

  // Make parent's children exactly `nodes`, in order, moving as little as possible.
  function placeNodes(parent, nodes) {
    var keep = new Set(nodes), cur = parent.firstChild, next;
    while (cur) { next = cur.nextSibling; if (!keep.has(cur)) parent.removeChild(cur); cur = next; }
    cur = parent.firstChild;
    nodes.forEach(function (n) {
      if (n === cur) cur = cur.nextSibling;
      else parent.insertBefore(n, cur);
    });
  }

  function cardEl(id, fresh) {
    var html = cardHTML(S.getCard(App.board, id)), el = cardEls[id];
    if (!el || el.__html !== html) {
      el = cardEls[id] = makeEl(html);
      el.__html = html;
      fresh.push(el);
    }
    return el;
  }

  function columnEl(col, fresh) {
    var sec = columnEls[col.id], parts = columnParts(col);
    if (!sec) {
      sec = columnEls[col.id] = document.createElement('section');
      sec.setAttribute('data-column-id', col.id);
      sec.__html = {}; sec.__el = {};
    }
    if (sec.className !== parts.cls) sec.className = parts.cls;
    var nodes = [];
    SLOTS.forEach(function (k) {
      var el = sec.__el[k], dirty = sec.__html[k] !== parts[k];
      // a title being renamed or a quick-add box in use always starts over, as it did before
      if (el && k === 'head' && el.querySelector('.rename-input')) dirty = true;
      if (el && k === 'foot' && el.querySelector('.quick-add')) dirty = true;
      if (dirty) {
        if (k === 'list' && el) dropSortable(el);
        el = sec.__el[k] = parts[k] ? makeEl(parts[k]) : null;
        sec.__html[k] = parts[k];
      }
      if (el) nodes.push(el);
    });
    placeNodes(sec, nodes);
    var list = sec.__el.list;
    if (list) {
      var ids = visibleCardIds(col);
      if (ids.length) placeNodes(list, ids.map(function (id) { return cardEl(id, fresh); }));
      else list.innerHTML = '<div class="empty">' + (col.cards.length ? 'No matches' : 'No cards') + '</div>';
    }
    return sec;
  }

  function renderBoard() {
    var host = $('#columns'), fresh = [], live = {};
    var nodes = App.board.columns.map(function (col) { live[col.id] = 1; return columnEl(col, fresh); });
    if (App.board.columns.length === 0 && !App.addingList) {
      nodes.push(makeEl('<div class="board-empty"><p>No lists yet — add one to get started.</p>' +
        '<button class="btn primary" data-action="add-list">' + ICONS.plus + ' Add a list</button></div>'));
    }
    if (App.addingList) nodes.push(makeEl(listComposerHTML()));
    placeNodes(host, nodes);
    Object.keys(columnEls).forEach(function (id) {
      if (live[id]) return;
      if (columnEls[id].__el.list) dropSortable(columnEls[id].__el.list);
      delete columnEls[id];
    });
    Object.keys(cardEls).forEach(function (id) { if (!App.board.cards[id]) delete cardEls[id]; });
    fresh.forEach(function (el) {
      if (window.KanbanImages && el.querySelector('img[data-img]')) window.KanbanImages.hydrate(el);
    });
    fitCardNotes();
    setupSortable();

    if (App.focusComposer === 'quick') {
      var q = $('#quick-add-text');
      if (q) q.focus();
    } else if (App.focusComposer === 'list') {
      var nl = $('#new-list-name');
      if (nl) nl.focus();
    }
    App.focusComposer = null;
  }

  // ---------- drag & drop (Sortable) ----------
  var boardSort = null;

  function dropSortable(list) {
    if (!list.__sort) return;
    var s = list.__sort;
    list.__sort = null;
    App.sortable = App.sortable.filter(function (x) { return x !== s; });
    try { s.destroy(); } catch (e) { /* already gone */ }
  }

  // Lists live as long as their column, so each one is wired once. Dragging is off while searching.
  function setupSortable() {
    if (typeof window.Sortable === 'undefined') return;
    var off = !!App.query;
    function make(el, opts) {
      var o = { animation: 150, ghostClass: 'drag-ghost', chosenClass: 'drag-chosen', dragClass: 'dragging', onEnd: syncFromDOM, disabled: off };
      Object.keys(opts).forEach(function (k) { o[k] = opts[k]; });
      var s = new window.Sortable(el, o);
      App.sortable.push(s);
      return s;
    }
    function toggle(s) { if (s.option('disabled') !== off) s.option('disabled', off); }
    if (!boardSort) boardSort = make($('#columns'), { group: 'columns', handle: '.column-header' });
    else toggle(boardSort);
    $$('#columns .card-list').forEach(function (list) {
      if (!list.__sort) list.__sort = make(list, { group: 'cards', filter: '.card-checklist' });
      else toggle(list.__sort);
    });
  }

  // Rebuild state from the final DOM order. moveCard handles cross-column
  // transfers (setCardOrder alone cannot express a card leaving a column),
  // then setCardOrder applies the exact within-column order.
  function syncFromDOM(evt) {
    var b = App.board;
    if (evt && evt.item && evt.to && evt.item.getAttribute('data-card-id')) {
      var cardId = evt.item.getAttribute('data-card-id');
      var toColId = evt.to.getAttribute('data-column');
      if (toColId) {
        var items = $$('.card-list [data-card-id]', evt.to);
        var idx = -1;
        for (var i = 0; i < items.length; i++) if (items[i] === evt.item) { idx = i; break; }
        if (idx >= 0) b = S.moveCard(b, cardId, toColId, idx);
      }
    }

    var colIds = $$('#columns > .column').map(function (el) { return el.getAttribute('data-column-id'); });
    if (colIds.length) b = S.setColumnOrder(b, colIds);

    $$('#columns > .column').forEach(function (colEl) {
      var cid = colEl.getAttribute('data-column-id');
      var list = $$('.card-list [data-card-id]', colEl).map(function (el) { return el.getAttribute('data-card-id'); });
      if (list.length) b = S.setCardOrder(b, cid, list);
    });

    App.justDragged = true;
    setTimeout(function () { App.justDragged = false; }, 120);
    commit(b);
  }

  // ---------- toast ----------
  function toast(msg, action) {
    var t = $('#toast');
    if (!t) return;
    $('#toast-msg').textContent = msg;
    var btn = $('#toast-action');
    if (action) {
      btn.hidden = false;
      btn.textContent = action.label;
      btn.onclick = function () { action.fn(); hideToast(); };
    } else {
      btn.hidden = true;
      btn.onclick = null;
    }
    t.hidden = false;
    clearTimeout(App.toastTimer);
    App.toastTimer = setTimeout(hideToast, action ? 6000 : 3200);
  }

  function hideToast() {
    var t = $('#toast');
    if (t) t.hidden = true;
    clearTimeout(App.toastTimer);
  }

  // ---------- confirm dialog ----------
  function confirmDialog(opts, onYes, onNo) {
    $('#confirm-title').textContent = opts.title || 'Are you sure?';
    $('#confirm-message').textContent = opts.message || '';
    var yes = $('#confirm-yes');
    yes.textContent = opts.yesLabel || 'Yes, do it';
    yes.classList.toggle('danger', !opts.input && !opts.primary);
    yes.classList.toggle('primary', !!(opts.input || opts.primary));
    $('#confirm-cancel').textContent = opts.noLabel || 'Cancel';
    var inp = $('#confirm-input');
    inp.hidden = !opts.input;
    if (opts.input) {
      inp.type = opts.input.type || 'text';
      inp.value = opts.input.value || '';
      inp.placeholder = opts.input.placeholder || '';
    }
    App.confirmCb = onYes;
    App.confirmNoCb = onNo || null;
    $('#confirm-modal').hidden = false;
    if (opts.input) { inp.focus(); inp.select(); } else yes.focus();
  }

  function closeConfirm(fireNo) {
    var noCb = App.confirmNoCb;
    $('#confirm-modal').hidden = true;
    App.confirmCb = null;
    App.confirmNoCb = null;
    if (fireNo && noCb) noCb();
  }

  // ---------- automatic backups (File System Access API) ----------
  // The board keeps its backups in a clearly labelled folder inside the application folder:
  //
  //   <application folder>/Kanban Auto-Backups/
  //       kanban-backup-latest.json              rewritten after every change
  //       kanban-backup-YYYY-MM-DD_HH-MM-SS.json  a dated copy each time the board is closed
  //       README.txt
  //
  // When the board starts it loads the newest valid backup in that folder automatically.
  // (A web page cannot see its own location, so the folder is chosen once with the button in
  // the toolbar; the choice is remembered. Browsers without the API fall back to a read-only load.)
  var BACKUP_DIR_NAME = 'Kanban Auto-Backups';
  var LATEST_NAME = 'kanban-backup-latest.json';
  var BACKUP_RE = /^kanban-backup-.*\.json$/;
  var LATEST_JS_NAME = 'kanban-backup-latest.js'; // same data as latest.json, loadable by index.html with no permission
  var UNBACKED_KEY = 'kanban.unbacked.v1';        // '1' = changes in this browser not yet written to the backup folder
  var KEEP_COPIES = 30; // dated copies to keep; older ones are removed
  var README_TEXT = 'Automatic backups of your Kanban board\r\n\r\n' +
    '- kanban-backup-latest.json (and the matching kanban-backup-latest.js, which index.html loads when the board starts) is rewritten after every change.\r\n' +
    '- kanban-backup-<date>_<time>.json is a dated copy saved each time the board is closed (the newest ' + KEEP_COPIES + ' are kept).\r\n' +
    '- To go back to an older copy, open the board and use Import in the toolbar.\r\n\r\n' +
    'This folder is managed by the board. Copying it is safe; please do not edit the files while the board is open.\r\n';

  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { window.localStorage.removeItem(k); } catch (e) {} }

  function fileSupported() {
    if (window.kanbanDisk) return true; // desktop app: saves straight to disk
    return typeof window.showDirectoryPicker === 'function' && typeof window.indexedDB !== 'undefined';
  }

  function idbOpen() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open('kanban', 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('handles'); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('indexeddb open failed')); };
    });
  }

  function idbPut(key, value) {
    return idbOpen().then(function (db) {
      var done = new Promise(function (resolve, reject) {
        var tx = db.transaction('handles', 'readwrite');
        tx.objectStore('handles').put(value, key);
        tx.oncomplete = resolve;
        tx.onerror = function () { reject(tx.error || new Error('indexeddb put failed')); };
      });
      return done.then(function (v) { db.close(); return v; }, function (e) { db.close(); throw e; });
    });
  }

  function idbGet(key) {
    return idbOpen().then(function (db) {
      var done = new Promise(function (resolve, reject) {
        var req = db.transaction('handles').objectStore('handles').get(key);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error || new Error('indexeddb get failed')); };
      });
      return done.then(function (v) { db.close(); return v; }, function (e) { db.close(); throw e; });
    });
  }

  var bkWriting = false, bkQueued = false, bkQueuedSnap = false;
  var lastLatest = null, lastSnapshot = null; // JSON last written to latest.json / newest dated copy
  var retryDelay = 0, retryTimer = null, errToasted = false, regrantArmed = false;

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function stamp() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + '_' +
      pad2(d.getHours()) + '-' + pad2(d.getMinutes()) + '-' + pad2(d.getSeconds());
  }
  function formatWhen(ms) {
    try { return new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short', hour12: true }); }
    catch (e) { return new Date(ms).toString(); }
  }

  function renderFileStatus() {
    var btn = $('#btn-file');
    if (!btn) return;
    btn.classList.toggle('connected', App.fileStatus === 'ok');
    btn.classList.toggle('readonly', App.fileStatus === 'readonly');
    btn.classList.toggle('attn', App.fileStatus === 'prompt' || App.fileStatus === 'error');
    btn.title = (App.fileStatus === 'prompt' && !App.backupDir) ? 'Auto-backup is NOT connected in this browser session — click to choose the application folder again. Your last session was already restored from its backup.'
      : App.fileStatus === 'ok' ? 'Auto-backup is on — saving to the "' + (App.fileName || BACKUP_DIR_NAME) + '" folder. Click to open the folder picker there.'
      : App.fileStatus === 'prompt' ? 'Auto-backup is PAUSED — click here (or anywhere on the page) to allow access to the backup folder again'
      : App.fileStatus === 'error' ? 'Could not write the backup — retrying automatically. Click to reconnect.'
      : App.fileStatus === 'readonly' ? 'Loaded from ' + (App.fileName || 'file') + ' — read-only, this browser cannot write backups. Use Export to save changes. Click to choose another file.'
      : 'Turn on automatic backups: choose the application folder (the one containing index.html). A "' + BACKUP_DIR_NAME + '" folder is created there.';
    if (window.kanbanDisk) {
      btn.title = App.fileStatus === 'error' ? 'Could not write the backup — retrying automatically. Click to open the backup folder.'
        : 'Auto-backup is on — saving to "' + window.kanbanDisk.folder + '". Click to open that folder.';
    }
    btn.setAttribute('aria-label', btn.title);
    var st = btn.querySelector('.mi-state');
    if (st) st.textContent = window.kanbanDisk ? (App.fileStatus === 'error' ? 'Error' : 'On')
      : App.fileStatus === 'ok' ? 'On' : App.fileStatus === 'prompt' ? 'Paused' : App.fileStatus === 'error' ? 'Error' : App.fileStatus === 'readonly' ? 'Read-only' : 'Off';
    var dbtn = $('#btn-data');
    if (dbtn) dbtn.classList.toggle('attn', App.fileStatus === 'prompt' || App.fileStatus === 'error');
  }

  function resetWriteState() {
    bkWriting = false; bkQueued = false; bkQueuedSnap = false;
    lastLatest = null; lastSnapshot = null;
    retryDelay = 0; errToasted = false; clearTimeout(retryTimer);
  }

  function writeText(dir, name, text) {
    return dir.getFileHandle(name, { create: true }).then(function (fh) {
      return fh.createWritable();
    }).then(function (w) {
      return w.write(text).then(function () { return w.close(); });
    });
  }

  function parseBackup(text) {
    var p = null;
    try { p = JSON.parse(text); } catch (e) { return null; }
    if (p && p.board && Array.isArray(p.board.columns)) p = p.board; // also accept Export files
    if (!p || typeof p !== 'object' || !Array.isArray(p.columns)) return null;
    return S.normalizeBoard(p);
  }

  // Every backup file in the folder, newest first (latest.json wins a tie).
  function listBackups(dir) {
    var out = [], it = dir.entries();
    function step() {
      return it.next().then(function (r) {
        if (r.done) return out;
        var name = r.value[0], h = r.value[1];
        if (h.kind === 'file' && BACKUP_RE.test(name)) {
          return h.getFile().then(function (f) { out.push({ name: name, file: f }); }, function () {}).then(step);
        }
        return step();
      });
    }
    return step().then(function (items) {
      items.sort(function (x, y) {
        return (y.file.lastModified - x.file.lastModified) || (x.name === LATEST_NAME ? -1 : 1);
      });
      return items;
    });
  }

  function newestValid(items) {
    var i = 0;
    function next() {
      if (i >= items.length) return Promise.resolve(null);
      var it = items[i++];
      return it.file.text().then(function (t) {
        var b = parseBackup(t);
        return b ? { board: b, name: it.name, modified: it.file.lastModified } : next();
      }, next);
    }
    return next();
  }

  function pruneBackups(dir) {
    return listBackups(dir).then(function (items) {
      var copies = items.filter(function (i) { return i.name !== LATEST_NAME; });
      return copies.slice(KEEP_COPIES).reduce(function (p, i) {
        return p.then(function () { return dir.removeEntry(i.name); });
      }, Promise.resolve());
    });
  }

  // Permission is forgotten between browser sessions (and always for file:// pages), so the first
  // launch of the day lands here. Any click re-requests it (needs a user gesture).
  function setPrompt() {
    App.fileStatus = 'prompt';
    renderFileStatus();
    toast('Auto-backup paused — click anywhere to reconnect and load the latest backup', null);
    if (regrantArmed) return;
    regrantArmed = true;
    var h = function (e) {
      if (e.target && e.target.closest && e.target.closest('#btn-file')) return; // its own handler runs
      document.removeEventListener('pointerdown', h, true);
      regrantArmed = false;
      var dir = App.backupDir;
      if (dir && App.fileStatus === 'prompt' && dir.requestPermission) {
        dir.requestPermission({ mode: 'readwrite' }).then(function (p) { if (p === 'granted') adoptBackupDir(dir, true); }).catch(function () {});
      }
    };
    document.addEventListener('pointerdown', h, true);
  }

  function handleWriteFailure(err) {
    if (err && err.name === 'NotAllowedError') { setPrompt(); return; }
    App.fileStatus = 'error';
    renderFileStatus();
    if (!errToasted) {
      errToasted = true;
      toast('Could not write the backup (' + ((err && err.name) || 'error') + ') — retrying. Changes are still kept in this browser.', null);
    }
    clearTimeout(retryTimer);
    retryDelay = Math.min((retryDelay || 2000) * 2, 60000);
    retryTimer = setTimeout(function () {
      if (App.fileStatus === 'error') { App.fileStatus = 'ok'; writeBackup(false); }
    }, retryDelay);
  }

  // Rewrites latest.json when the board changed; with `snapshot` also saves a dated copy
  // (used when the board is closed or hidden). Writes are coalesced: one in flight at a time.
  function writeBackup(snapshot) {
    if (!fileSupported() || !App.backupDir || App.fileStatus !== 'ok') return;
    var json = JSON.stringify(App.board, null, 2);
    var needLatest = json !== lastLatest;
    var needSnap = !!snapshot && json !== lastSnapshot;
    if (!needLatest && !needSnap) return;
    if (window.kanbanDisk) { // desktop app: synchronous, atomic write by the main process
      var res = window.kanbanDisk.save(json, needSnap);
      if (res && res.ok) {
        lastLatest = json; if (needSnap) lastSnapshot = json;
        lsDel(UNBACKED_KEY); retryDelay = 0; errToasted = false;
        if (App.fileStatus === 'error') { App.fileStatus = 'ok'; renderFileStatus(); }
      } else {
        handleWriteFailure({ name: (res && res.error) || 'error' });
      }
      return;
    }
    if (bkWriting) { bkQueued = true; if (needSnap) bkQueuedSnap = true; return; }
    bkWriting = true;
    var dir = App.backupDir, failure = null, p = Promise.resolve();
    if (needLatest) {
      var wrapper = 'window.KANBAN_LAST_SESSION = ' + JSON.stringify({ savedAt: Date.now(), board: JSON.parse(json) }) + ';\n';
      p = p.then(function () { return writeText(dir, LATEST_NAME, json); })
        .then(function () { return writeText(dir, LATEST_JS_NAME, wrapper); })
        .then(function () {
          lastLatest = json;
          if (JSON.stringify(App.board, null, 2) === json) lsDel(UNBACKED_KEY); // nothing newer is waiting
        });
    }
    if (needSnap) {
      p = p.then(function () { return writeText(dir, 'kanban-backup-' + stamp() + '.json', json); })
        .then(function () { lastSnapshot = json; return pruneBackups(dir).catch(function () {}); });
    }
    p.catch(function (e) { failure = e; }).then(function () {
      bkWriting = false;
      if (failure) { bkQueued = false; bkQueuedSnap = false; handleWriteFailure(failure); return; }
      retryDelay = 0; errToasted = false;
      if (App.fileStatus === 'error') { App.fileStatus = 'ok'; renderFileStatus(); }
      if (bkQueued) { var again = bkQueuedSnap; bkQueued = false; bkQueuedSnap = false; writeBackup(again); }
    });
  }

  // The board is being closed or hidden: save a dated copy (latest.json is already current,
  // because every change writes it immediately).
  function flushBackup() { flushSave(); writeBackup(true); }

  function disconnectBackup() {
    App.backupDir = null; App.fileName = null; App.fileStatus = 'none';
    resetWriteState();
    renderFileStatus();
  }

  // Connect to a backup folder and load the newest backup from it.
  // isStartup: automatic reconnect when the board opens (restores without asking unless the
  // board was edited before the folder could be reached).
  function adoptBackupDir(dir, isStartup) {
    if (!dir) return;
    App.backupDir = dir;
    App.fileName = dir.name || BACKUP_DIR_NAME;
    resetWriteState();

    function ready(msg) {
      App.fileStatus = 'ok';
      renderFileStatus();
      writeText(dir, 'README.txt', README_TEXT).catch(function () {});
      writeBackup(!!isStartup); // on start-up also keeps a dated copy if the board differs from the newest one
      if (msg) toast(msg, null);
    }

    Promise.resolve(dir.queryPermission ? dir.queryPermission({ mode: 'readwrite' }) : 'granted')
      .catch(function () { return 'prompt'; })
      .then(function (perm) {
        if (perm !== 'granted') { setPrompt(); return; }
        return listBackups(dir).then(function (items) {
          var newestCopy = items.filter(function (i) { return i.name !== LATEST_NAME; })[0];
          var noteCopy = newestCopy ? newestCopy.file.text().then(function (t) {
            var b = parseBackup(t);
            lastSnapshot = b ? JSON.stringify(b, null, 2) : null;
          }, function () {}) : Promise.resolve();
          return noteCopy.then(function () { return newestValid(items); }).then(function (newest) {
            if (!newest) { ready('Auto-backup on — copies are saved in "' + App.fileName + '"'); return; }
            if (JSON.stringify(newest.board) === JSON.stringify(App.board)) { ready(isStartup ? '' : 'Auto-backup on — copies are saved in "' + App.fileName + '"'); return; }
            function apply() {
              App.board = newest.board;
              render();
              S.saveBoard(storage, App.board);
              ready('Restored the latest backup (' + formatWhen(newest.modified) + ')');
            }
            if (isStartup && !App.editedThisSession) { apply(); return; }
            confirmDialog({
              title: 'Restore the latest backup?',
              message: (isStartup
                ? 'You changed the board before the backup folder could be reached. '
                : 'This folder holds a different board (saved ' + formatWhen(newest.modified) + '). ') +
                'Restore the backup and replace the current board, or keep the current board (it will replace the saved backup)?',
              yesLabel: 'Restore backup'
            }, apply, function () {
              ready('Kept the current board — it is now backed up');
            });
          });
        });
      })
      .catch(function (err) {
        if (!(err && err.name === 'AbortError')) handleWriteFailure(err);
      });
  }

  // Fallback for browsers without the File System Access API (e.g. Brave):
  // load a board file read-only via a plain <input type="file">; saving is done with Export.
  function openBoardFileFallback() {
    var input = $('#board-file-input');
    if (!input) return;
    input.value = '';
    input.onchange = function () {
      var file = input.files && input.files[0];
      input.value = '';
      if (file) loadBoardFileFallback(file);
    };
    input.click();
  }

  function loadBoardFileFallback(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var raw = null;
      try { raw = JSON.parse(String(reader.result)); } catch (e) { raw = null; }
      var src = raw && typeof raw === 'object' ? (raw.board || raw) : null;
      if (!src || !Array.isArray(src.columns)) {
        toast('That file is not a valid board — nothing loaded', null);
        return;
      }
      var incoming = S.normalizeBoard(src);
      function connectReadonly() {
        App.fileStatus = 'readonly';
        App.fileName = file.name;
        renderFileStatus();
        toast('Loaded ' + file.name + ' — this browser cannot write to files, so use Export to save changes', null);
      }
      if (JSON.stringify(incoming) === JSON.stringify(App.board)) { connectReadonly(); return; }
      confirmDialog({
        title: 'Load board from file?',
        message: '"' + file.name + '" contains a different board than the one currently open. Load it and replace the current board?'
      }, function () {
        App.board = incoming;
        render();
        S.saveBoard(storage, App.board);
        connectReadonly();
      });
    };
    reader.onerror = function () { toast('Could not read that file', null); };
    reader.readAsText(file);
  }

  App._loadBoardFileFallback = loadBoardFileFallback; // testing hook

  // Folder picker. Opens at the folder where the backups are stored. Choosing the application
  // folder creates "Kanban Auto-Backups" inside it; choosing that folder itself works too.
  function pickBackupFolder() {
    if (!fileSupported()) {
      openBoardFileFallback();
      return;
    }
    function open(withStart) {
      var opts = { id: 'kanban-backup', mode: 'readwrite' };
      if (withStart) opts.startIn = App.backupDir || 'documents';
      return window.showDirectoryPicker(opts);
    }
    open(true).catch(function (err) {
      if (err && err.name === 'TypeError') return open(false); // start location not usable
      throw err;
    }).then(function (picked) {
      if (picked.name === BACKUP_DIR_NAME) return picked;
      return picked.getDirectoryHandle(BACKUP_DIR_NAME, { create: true });
    }).then(function (dir) {
      return idbPut(BACKUP_HANDLE_KEY, dir).catch(function () {}).then(function () {
        adoptBackupDir(dir, false);
      });
    }).catch(function (err) {
      if (!(err && err.name === 'AbortError')) {
        toast('Could not use that folder: ' + ((err && err.message) || String(err)) + ' — choose the folder that contains index.html.', null);
      }
    });
  }

  // The browser forgot the folder (site data is cleared when it closes, on some PCs). The last session
  // is still restored from kanban-backup-latest.js; only *writing* needs the folder chosen again.
  function noRememberedFolder() {
    if (App.fileStatus === 'ok' || App.backupDir) return;
    if (!App.restoredFrom && !App.hadBackupScript) return; // never set up: stay quiet
    App.fileStatus = 'prompt';
    renderFileStatus();
    toast((App.restoredFrom ? 'Last session restored. ' : '') + 'To keep saving backups, click the folder button and choose the application folder again.', null);
  }

  // Start-up: reconnect to the remembered backup folder and load its newest backup.
  function restoreLatestBackup() {
    if (window.kanbanDisk) return; // desktop app: the board is loaded from disk before the page starts
    if (!fileSupported()) return;
    idbGet(BACKUP_HANDLE_KEY).then(function (dir) {
      if (dir && dir.queryPermission) { adoptBackupDir(dir, true); return; }
      noRememberedFolder();
    }).catch(noRememberedFolder);
  }

  App._restoreBackup = restoreLatestBackup; // testing hook

  function onFileButtonClick() {
    if (window.kanbanDisk) { window.kanbanDisk.openFolder(); return; }
    if (!fileSupported()) {
      openBoardFileFallback();
      return;
    }
    if (App.backupDir && App.fileStatus === 'prompt') { // permission lapsed: ask again first
      var dir = App.backupDir;
      Promise.resolve(dir.requestPermission ? dir.requestPermission({ mode: 'readwrite' }) : 'granted')
        .catch(function () { return 'denied'; })
        .then(function (perm) {
          if (perm === 'granted') adoptBackupDir(dir, true);
          else pickBackupFolder();
        });
      return;
    }
    pickBackupFolder();
  }

  // ---------- undo (single level, for destructive ops) ----------
  function doUndo() {
    if (!App.undoSnapshot) return;
    var snap = App.undoSnapshot;
    App.undoSnapshot = null;
    if (App.activeCardId && !S.getCard(snap.board, App.activeCardId)) closeModal();
    var restored = S.clone(snap.board);
    restored.notebook = S.clone(App.board.notebook); // undo is about the board; never roll the notebook back
    restored.notebook.pages.forEach(function (pg) {
      pg.cardIds = pg.cardIds.filter(function (cid) { return restored.cards[cid]; });
    });
    commit(restored);
  }

  function withUndo(message, fn) {
    App.undoSnapshot = { board: S.clone(App.board) };
    commit(fn());
    toast(message, { label: 'Undo', fn: doUndo });
  }

  // ---------- card modal ----------
  function openModal(cardId) {
    var card = S.getCard(App.board, cardId);
    if (!card) return;
    App.activeCardId = cardId;
    renderModal();
    if (window.KanbanSfx) window.KanbanSfx.play('open');
    $('#card-modal').hidden = false;
    fitNotes();
    // the title is read-only until the pencil button is used (a brand-new, untitled card starts in edit mode)
    setTitleEditing(!card.title);
    var panel = $('#card-modal .card-panel');
    if (panel) { panel.tabIndex = -1; try { panel.focus({ preventScroll: true }); } catch (e) { /* optional */ } }
  }

  // Low / Medium / High toggle (the old "urgent" level, 3, is shown as High until the card is changed)
  function syncPriority(p) {
    var cur = Math.min(2, Number(p));
    Array.prototype.forEach.call(document.querySelectorAll('#cm-priority [data-priority]'), function (b) {
      b.setAttribute('aria-pressed', Number(b.getAttribute('data-priority')) === cur ? 'true' : 'false');
    });
  }

  function setTitleEditing(on, opts) {
    var t = $('#cm-title'), b = $('#cm-edit-title');
    if (!t || !b) return;
    t.readOnly = !on;
    t.tabIndex = on ? 0 : -1; // a locked title can't take focus, so no caret or focus ring
    t.classList.toggle('editing', !!on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.title = on ? 'Done editing title' : 'Edit title';
    b.setAttribute('aria-label', b.title);
    if (on && !(opts && opts.noFocus)) { t.focus(); t.select(); }
  }

  function closeModal() {
    if (window.KanbanSfx && App.activeCardId) window.KanbanSfx.play('close');
    App.activeCardId = null;
    App.checkDrag = null;
    setTitleEditing(false, { noFocus: true });
    $('#card-modal').hidden = true;
  }

  function setVal(sel, v) {
    var el = $(sel);
    if (el && document.activeElement !== el) el.value = v;
  }

  // The notes editor in the card panel grows with its content (up to 60% of the window, then scrolls).
  function fitNotes() {
    var el = $('#cm-desc');
    if (!el) return;
    var cap = Math.max(140, Math.round(window.innerHeight * 0.6));
    el.style.maxHeight = 'none';
    el.style.height = 'auto';
    var h = el.scrollHeight;
    if (!h) { el.style.maxHeight = ''; el.style.height = ''; el.style.overflowY = ''; return; } // panel hidden: CSS fallback
    el.style.maxHeight = cap + 'px';
    el.style.height = Math.min(h, cap) + 'px';
    el.style.overflowY = h > cap ? 'auto' : 'hidden';
  }

  function renderModal() {
    var card = S.getCard(App.board, App.activeCardId);
    if (!card) { closeModal(); return; }

    setVal('#cm-title', card.title);
    var descEl = $('#cm-desc');
    if (App.rte && document.activeElement !== descEl) App.rte.set(card.description);
    var arch = S.isArchived(card);
    $('#cm-archive').textContent = arch ? 'Restore' : 'Archive';
    $('#card-modal .card-panel').classList.toggle('is-archived', arch);
    if (window.KanbanImages) renderImages('card');
    syncPriority(card.priority);
    $('#cm-due').value = card.dueDate || '';
    fitNotes();

    var labelIds = Object.keys(App.board.labels);
    var labelsHtml = labelIds.map(function (lid) {
      var l = App.board.labels[lid];
      var on = card.labelIds.indexOf(lid) !== -1;
      return '<span class="chip' + (on ? ' on' : '') + '" role="button" tabindex="0" data-label-id="' + lid + '" style="--chip-color:' + esc(l.color) + '" title="' + (on ? 'Click to remove label' : 'Click to add label') + '">' +
        '<span class="chip-dot" style="background:' + esc(l.color) + '"></span>' + esc(l.name) +
        '<button class="chip-x" type="button" data-remove-label="' + lid + '" title="Delete label ' + esc(l.name) + ' permanently">' + ICONS.close + '</button>' +
      '</span>';
    }).join('');
    $('#cm-labels').innerHTML = labelsHtml || '<span class="muted">No labels yet — add one below.</span>';

    var prog = S.checklistProgress(card);
    $('#cm-progress-bar').classList.toggle('hidden', prog.total === 0);
    $('#cm-progress-bar span').style.width = prog.pct + '%';
    $('#cm-progress-text').textContent = prog.total ? prog.done + ' / ' + prog.total + ' done' : '';
    $('#cm-checklist').innerHTML = card.checklist.map(function (i, ix) {
      var last = card.checklist.length - 1;
      return '<li class="cl-row" data-cl-id="' + i.id + '">' +
        '<span class="cl-grip" draggable="true" title="Drag to reorder" aria-hidden="true">' + ICONS.grip + '</span>' +
        '<label class="cl-item' + (i.done ? ' done' : '') + '">' +
          '<input type="checkbox" data-item="' + i.id + '"' + (i.done ? ' checked' : '') + '>' +
          '<span>' + esc(i.text) + '</span>' +
        '</label>' +
        '<button class="icon-btn cl-move" type="button" data-move-item="' + i.id + '" data-dir="-1" title="Move item up" aria-label="Move item up"' + (ix === 0 ? ' disabled' : '') + '>' + ICONS.up + '</button>' +
        '<button class="icon-btn cl-move" type="button" data-move-item="' + i.id + '" data-dir="1" title="Move item down" aria-label="Move item down"' + (ix === last ? ' disabled' : '') + '>' + ICONS.down + '</button>' +
        '<button class="icon-btn cl-edit" type="button" data-edit-item="' + i.id + '" title="Edit item">' + ICONS.pencil + '</button>' +
        '<button class="icon-btn cl-del" type="button" data-del-item="' + i.id + '" title="Remove item">' + ICONS.close + '</button>' +
      '</li>';
    }).join('');

    $('#cm-meta').textContent = 'Created ' + formatDate(card.createdAt) + '  ·  Updated ' + formatDate(card.updatedAt);
  }

  function patchCard(patch) {
    commit(S.updateCard(App.board, App.activeCardId, patch), { skipModal: true });
  }

  function bindModal() {
    $('#cm-close').addEventListener('click', closeModal);
    $('#card-modal .modal-backdrop').addEventListener('click', closeModal);

    $('#cm-title').addEventListener('input', function () { patchCard({ title: this.value }); });
    $('#cm-title').addEventListener('keydown', function (e) {
      // Enter / Esc finish a title edit without closing the card
      if ((e.key === 'Enter' || e.key === 'Escape') && !this.readOnly) {
        e.preventDefault(); e.stopPropagation();
        setTitleEditing(false, { noFocus: true });
        this.blur();
      }
    });
    $('#cm-edit-title').addEventListener('click', function () {
      setTitleEditing($('#cm-title').readOnly);
    });
    App.rte = window.KanbanRich.mount($('#cm-desc'), $('#cm-bar'), {
      onChange: function () { if (App.activeCardId) patchCard({ description: App.rte.get() }); fitNotes(); },
      onPasteImages: function (files) { addImageFiles('card', files); }
    });
    $('#cm-archive').addEventListener('click', function () {
      var id = App.activeCardId;
      var c = S.getCard(App.board, id);
      if (!c) return;
      if (S.isArchived(c)) {
        commit(S.restoreCard(App.board, id));
        toast('Card restored to the board', null);
      } else {
        closeModal();
        withUndo('Card archived', function () { return S.archiveCard(App.board, id); });
      }
    });
    $('#cm-priority').addEventListener('click', function (e) {
      var b = e.target.closest('[data-priority]');
      if (!b) return;
      var p = Number(b.getAttribute('data-priority'));
      patchCard({ priority: p });
      syncPriority(p);
    });
    $('#cm-due').addEventListener('change', function () { patchCard({ dueDate: this.value || null }); });

    // labels: toggle + delete (delegated, since chips re-render)
    var labelsBox = $('#cm-labels');
    labelsBox.addEventListener('click', function (e) {
      var rm = e.target.closest('[data-remove-label]');
      if (rm) {
        e.stopPropagation();
        var lid = rm.getAttribute('data-remove-label');
        var l = S.getLabel(App.board, lid);
        confirmDialog({
          title: 'Delete label?',
          message: '"' + (l ? l.name : '') + '" will be removed from every card on this board.',
          yesLabel: 'Delete label'
        }, function () {
          commit(S.removeLabel(App.board, lid));
        });
        return;
      }
      var chip = e.target.closest('[data-label-id]');
      if (chip) toggleCardLabel(chip.getAttribute('data-label-id'));
    });
    labelsBox.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var chip = e.target.closest('[data-label-id]');
      if (chip && e.target === chip) { e.preventDefault(); toggleCardLabel(chip.getAttribute('data-label-id')); }
    });

    function toggleCardLabel(lid) {
      var card = S.getCard(App.board, App.activeCardId);
      if (!card) return;
      var ids = card.labelIds.slice();
      var ix = ids.indexOf(lid);
      if (ix === -1) ids.push(lid); else ids.splice(ix, 1);
      commit(S.setCardLabels(App.board, App.activeCardId, ids));
    }

    function addLabel() {
      var nameEl = $('#cm-new-label-name');
      var name = nameEl.value.trim();
      if (!name) { nameEl.focus(); return; }
      var color = $('#cm-new-label-color').value || S.PALETTE[0];
      var b = S.addLabel(App.board, { name: name, color: color });
      var newIds = Object.keys(b.labels).filter(function (lid) { return b.labels[lid].name === name; });
      var card = S.getCard(b, App.activeCardId);
      var ids = card.labelIds.concat(newIds);
      b = S.setCardLabels(b, App.activeCardId, ids);
      nameEl.value = '';
      commit(b);
      nameEl.focus();
    }
    $('#cm-add-label').addEventListener('click', addLabel);
    $('#cm-new-label-name').addEventListener('keydown', function (e) { if (e.key === 'Enter') addLabel(); });

    // checklist (delegated, since items re-render)
    $('#cm-checklist').addEventListener('change', function (e) {
      var cb = e.target.closest('input[data-item]');
      if (cb) commit(S.toggleChecklistItem(App.board, App.activeCardId, cb.getAttribute('data-item')));
    });
    $('#cm-checklist').addEventListener('click', function (e) {
      var mv = e.target.closest('[data-move-item]');
      if (mv) {
        var itemId = mv.getAttribute('data-move-item');
        var card = S.getCard(App.board, App.activeCardId);
        if (!card) return;
        var ix = -1;
        for (var i = 0; i < card.checklist.length; i++) if (card.checklist[i].id === itemId) { ix = i; break; }
        if (ix < 0) return;
        var to = ix + Number(mv.getAttribute('data-dir'));
        if (to < 0 || to >= card.checklist.length) return;
        commit(S.moveChecklistItem(App.board, App.activeCardId, itemId, to));
        return;
      }
      var edit = e.target.closest('[data-edit-item]');
      if (edit) { startEditItem(edit); return; }
      var del = e.target.closest('[data-del-item]');
      if (del) commit(S.removeChecklistItem(App.board, App.activeCardId, del.getAttribute('data-del-item')));
    });

    // checklist reorder by dragging the grip (buttons above work too; clicks are unaffected)
    var clList = $('#cm-checklist');
    function clRowOf(el) { return el && el.closest ? el.closest('.cl-row') : null; }
    function clearClDrop() {
      $$('.cl-row', clList).forEach(function (r) { r.classList.remove('drop-before', 'drop-after'); });
    }
    clList.addEventListener('dragstart', function (e) {
      var grip = e.target.closest('.cl-grip');
      var row = grip ? clRowOf(grip) : null;
      if (!row || !e.dataTransfer) return;
      App.checkDrag = row.getAttribute('data-cl-id');
      row.classList.add('cl-dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', App.checkDrag); } catch (err) { /* optional */ }
      try { e.dataTransfer.setDragImage(row, 16, 14); } catch (err) { /* optional */ }
    });
    clList.addEventListener('dragover', function (e) {
      if (!App.checkDrag || !e.dataTransfer) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      clearClDrop();
      var row = clRowOf(e.target);
      if (!row || row.getAttribute('data-cl-id') === App.checkDrag) return;
      var r = row.getBoundingClientRect();
      row.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
    });
    clList.addEventListener('dragleave', function (e) {
      if (!clList.contains(e.relatedTarget)) clearClDrop();
    });
    clList.addEventListener('drop', function (e) {
      var dragId = App.checkDrag;
      App.checkDrag = null;
      if (!dragId) return;
      e.preventDefault();
      var row = clRowOf(e.target);
      clearClDrop();
      $$('.cl-row.cl-dragging', clList).forEach(function (r) { r.classList.remove('cl-dragging'); });
      var card = S.getCard(App.board, App.activeCardId);
      if (!card || !row) return;
      var ids = card.checklist.map(function (i) { return i.id; });
      var from = ids.indexOf(dragId);
      var target = ids.indexOf(row.getAttribute('data-cl-id'));
      if (from < 0 || target < 0 || target === from) return;
      var r = row.getBoundingClientRect();
      var to = target + (e.clientY >= r.top + r.height / 2 ? 1 : 0);
      if (from < to) to--; // the item is removed before it is re-inserted
      if (to !== from) commit(S.moveChecklistItem(App.board, App.activeCardId, dragId, to));
    });
    clList.addEventListener('dragend', function () {
      App.checkDrag = null;
      clearClDrop();
      $$('.cl-row.cl-dragging', clList).forEach(function (r) { r.classList.remove('cl-dragging'); });
    });

    function startEditItem(btnEl) {
      var itemId = btnEl.getAttribute('data-edit-item');
      var card = S.getCard(App.board, App.activeCardId);
      if (!card) return;
      var item = null;
      for (var i = 0; i < card.checklist.length; i++) if (card.checklist[i].id === itemId) { item = card.checklist[i]; break; }
      if (!item) return;

      var rowEl = btnEl.closest('.cl-row');
      var span = $('.cl-item span', rowEl);
      if (!span) return; // already editing this row

      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'cl-edit-input';
      input.maxLength = 300;
      input.value = item.text;
      input.setAttribute('aria-label', 'Edit checklist item');
      span.replaceWith(input);
      rowEl.classList.add('cl-editing'); // no reorder controls while typing
      btnEl.hidden = true;
      input.focus();
      input.select();

      var done = false;
      function finish(save) {
        if (done) return;
        done = true;
        if (save && input.value.trim()) commit(S.editChecklistItem(App.board, App.activeCardId, itemId, input.value.trim()));
        else renderModal();
      }
      input.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter') finish(true);
        else if (e.key === 'Escape') finish(false);
      });
      input.addEventListener('blur', function () { finish(true); });
    }

    function addCheckItem() {
      var el = $('#cm-new-item');
      var v = el.value.trim();
      if (!v) { el.focus(); return; }
      el.value = '';
      commit(S.addChecklistItem(App.board, App.activeCardId, { text: v }));
      el.focus();
    }
    $('#cm-add-item').addEventListener('click', addCheckItem);
    $('#cm-new-item').addEventListener('keydown', function (e) { if (e.key === 'Enter') addCheckItem(); });

    $('#cm-delete').addEventListener('click', function () {
      var id = App.activeCardId;
      var card = S.getCard(App.board, id);
      confirmDialog({
        title: 'Delete card?',
        message: '"' + (card ? card.title : '') + '" will be deleted. You can undo right after.',
        yesLabel: 'Delete card'
      }, function () {
        withUndo('Card deleted', function () { return S.removeCard(App.board, id); });
        closeModal();
      });
    });
  }

  // ---------- inline column rename ----------
  function startRename(colEl) {
    var colId = colEl.getAttribute('data-column-id');
    var col = S.getColumn(App.board, colId);
    if (!col) return;
    var titleEl = $('.column-title', colEl);
    var input = document.createElement('input');
    input.className = 'rename-input';
    input.type = 'text';
    input.maxLength = 80;
    input.value = col.name;
    titleEl.replaceWith(input);
    input.focus();
    input.select();

    var done = false;
    function finish(save) {
      if (done) return;
      done = true;
      if (save && input.value.trim()) commit(S.renameColumn(App.board, colId, input.value.trim()));
      else render();
    }
    input.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Enter') finish(true);
      else if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', function () { finish(true); });
  }

  // ---------- board interactions (event delegation, bound once) ----------
  function focusQuickAdd() {
    var ta = $('#quick-add-text');
    if (ta) ta.focus();
  }

  function closeMenuIfOpen() {
    if (App.menuColumnId) { App.menuColumnId = null; return true; }
    return false;
  }

  function handleBoardClick(e) {
    if (App.justDragged) return;
    var clRow = e.target.closest('.card-checklist [data-item]');
    if (clRow) {
      var hostCard = clRow.closest('[data-card-id]');
      if (hostCard) commit(S.toggleChecklistItem(App.board, hostCard.getAttribute('data-card-id'), clRow.getAttribute('data-item')));
      return;
    }
    var actionEl = e.target.closest('[data-action]');

    if (!actionEl) {
      // plain click: open card, or just dismiss open menu
      var cardEl = e.target.closest('[data-card-id]');
      if (cardEl) {
        var wasMenu = closeMenuIfOpen();
        openModal(cardEl.getAttribute('data-card-id'));
        if (wasMenu) renderBoard();
      } else if (App.menuColumnId) {
        App.menuColumnId = null;
        renderBoard();
      }
      return;
    }

    var action = actionEl.getAttribute('data-action');
    var colId = actionEl.getAttribute('data-column');
    if (!colId) {
      var colWrap = e.target.closest('[data-column-id]');
      if (colWrap) colId = colWrap.getAttribute('data-column-id');
    }
    var colEl = e.target.closest('[data-column-id]');

    switch (action) {
      case 'add-list':
        App.addingList = true;
        App.quickAddColumnId = null;
        App.menuColumnId = null;
        App.focusComposer = 'list';
        renderBoard();
        break;

      case 'cancel-add-list':
        App.addingList = false;
        renderBoard();
        break;

      case 'submit-list': {
        var input = $('#new-list-name');
        var v = input ? input.value.trim() : '';
        if (!v) { App.addingList = false; renderBoard(); break; }
        App.addingList = false;
        commit(S.addColumn(App.board, { name: v }));
        break;
      }

      case 'quick-add':
        App.quickAddColumnId = colId;
        App.menuColumnId = null;
        App.focusComposer = 'quick';
        renderBoard();
        break;

      case 'cancel-quickadd':
        App.quickAddColumnId = null;
        renderBoard();
        break;

      case 'add-card': {
        var ta = $('#quick-add-text');
        var title = ta ? ta.value.trim() : '';
        if (!title) { App.quickAddColumnId = null; renderBoard(); break; }
        App.quickAddColumnId = null;
        commit(S.addCard(App.board, colId, { title: title }));
        break;
      }

      case 'rename':
        App.menuColumnId = null;
        if (colEl) startRename(colEl);
        else renderBoard();
        break;

      case 'collapse':
        App.menuColumnId = null;
        commit(S.toggleColumn(App.board, colId));
        break;

      case 'column-menu':
        App.menuColumnId = App.menuColumnId === colId ? null : colId;
        renderBoard();
        break;

      case 'wip': {
        App.menuColumnId = null;
        var cur = S.getColumn(App.board, colId);
        renderBoard();
        confirmDialog({
          title: 'WIP limit',
          message: 'The most cards this list should hold at once. Leave empty for no limit.',
          yesLabel: 'Save',
          input: { type: 'number', value: cur && cur.wipLimit != null ? String(cur.wipLimit) : '', placeholder: 'No limit' }
        }, function (raw) {
          var n = parseInt(raw, 10);
          commit(S.setWipLimit(App.board, colId, isNaN(n) ? null : n));
        });
        break;
      }

      case 'sort-priority':
      case 'sort-due':
      case 'sort-created': {
        var key = action === 'sort-priority' ? 'priority' : (action === 'sort-due' ? 'dueDate' : 'created');
        App.menuColumnId = null;
        commit(S.sortColumn(App.board, colId, key));
        break;
      }

      case 'archive-cards': {
        var acol = S.getColumn(App.board, colId);
        App.menuColumnId = null;
        if (!acol || !acol.cards.length) { renderBoard(); break; }
        withUndo(acol.cards.length + ' card' + (acol.cards.length === 1 ? '' : 's') + ' archived', function () {
          return S.archiveColumnCards(App.board, colId);
        });
        break;
      }

      case 'clear-cards': {
        var col = S.getColumn(App.board, colId);
        App.menuColumnId = null;
        if (!col || col.cards.length === 0) { renderBoard(); break; }
        confirmDialog({
          title: 'Clear list?',
          message: 'All ' + col.cards.length + ' card' + (col.cards.length === 1 ? '' : 's') + ' in "' + col.name + '" will be deleted. You can undo right after.',
          yesLabel: 'Clear cards'
        }, function () {
          withUndo('List cleared', function () {
            var b = App.board;
            (S.getColumn(b, colId) || { cards: [] }).cards.forEach(function (cid) { b = S.removeCard(b, cid); });
            return b;
          });
          renderBoard();
        });
        break;
      }

      case 'delete-column':
        App.menuColumnId = null;
        confirmDialog({
          title: 'Delete list?',
          message: '"' + (S.getColumn(App.board, colId) || {}).name + '" and all of its cards will be deleted. You can undo right after.',
          yesLabel: 'Delete list'
        }, function () {
          withUndo('List deleted', function () { return S.removeColumn(App.board, colId); });
        });
        break;
    }
  }

  function handleBoardKeydown(e) {
    var t = e.target;
    if (t && t.closest && t !== $('#board') && t !== $('#columns')) {
      var cardEl = t.closest('[data-card-id]');
      if (cardEl && cardEl.classList.contains('card') && !t.closest('.card-checklist') && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        openModal(cardEl.getAttribute('data-card-id'));
        return;
      }
    }
    // quick-add textarea: Enter adds, Shift+Enter newline
    if (e.target.id === 'quick-add-text' && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      var btn = e.target.closest('.quick-add') && $('.quick-add .btn.primary', e.target.closest('.quick-add'));
      if (btn) btn.click();
    }
    if (e.target.id === 'new-list-name' && e.key === 'Enter') {
      e.preventDefault();
      var b2 = $('[data-action="submit-list"]');
      if (b2) b2.click();
    }
  }

  // ---------- toolbar ----------
  function exportBoard() {
    var data = {
      app: 'kanban-board',
      version: S.VERSION,
      exportedAt: S.nowISO(),
      board: App.board
    };
    var ids = S.imageIds(App.board);
    var pics = window.KanbanImages && ids.length ? window.KanbanImages.exportMap(ids) : Promise.resolve({});
    pics.then(function (map) {
    if (Object.keys(map).length) data.images = map;
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    var slug = (App.board.name || 'kanban').replace(/[^\w\-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'kanban';
    a.download = slug + '-' + todayStr() + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    toast('Board exported as JSON', null);
    });
  }

  function importBoard(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var board = null, imgMap = null;
      try {
        var raw = JSON.parse(String(reader.result));
        board = S.normalizeBoard(raw && raw.board ? raw.board : raw);
        imgMap = raw && raw.images && typeof raw.images === 'object' ? raw.images : null;
      } catch (err) {
        toast('Import failed — that file is not a valid board export', null);
        return;
      }
      confirmDialog({
        title: 'Import board?',
        message: 'The current board will be replaced with "' + board.name + '" (' + S.totalCards(board) + ' cards, ' + board.columns.length + ' lists).',
        yesLabel: 'Import'
      }, function () {
        var done = function () { commit(board); toast('Board imported', null); };
        if (imgMap && window.KanbanImages) window.KanbanImages.importMap(imgMap).then(done, done); else done();
      });
    };
    reader.onerror = function () { toast('Import failed — could not read file', null); };
    reader.readAsText(file);
  }

  function resetBoard() {
    confirmDialog({
      title: 'Reset board?',
      message: 'Every list and card on this computer will be deleted and the board returns to its default state.',
      yesLabel: 'Reset board'
    }, function () {
      withUndo('Board reset', function () {
        S.clearBoard(storage);
        var fresh = S.defaultBoard();
        fresh.theme = App.board.theme; // keep the theme preference
        fresh.notebook = S.clone(App.board.notebook); // notes are not board content: keep them
        return fresh;
      });
      closeModal();
    });
  }

  function bindTopbar() {
    var nameEl = $('#board-name');
    if (nameEl) nameEl.addEventListener('input', function () {
      commit(S.setBoardName(App.board, this.value), { skipModal: true });
    });

    var search = $('#search');
    var searchRaf = 0;
    function renderSearch() {
      if (searchRaf) cancelAnimationFrame(searchRaf);
      searchRaf = 0;
      renderMain();
      renderTopbar();
    }
    search.addEventListener('input', function () {
      App.query = this.value.trim();
      App.searchPopOpen = !!App.query;
      App.menuColumnId = null;
      if (!searchRaf) searchRaf = requestAnimationFrame(renderSearch);
    });
    search.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && this.value) {
        this.value = '';
        App.query = '';
        App.searchPopOpen = false;
        renderMain();
        renderTopbar();
      } else if (e.key === 'Enter' && App.query) {
        if (searchRaf) renderSearch(); // typed and pressed Enter within one frame
        var first = $('#search-pop .sp-row');
        if (first) { e.preventDefault(); first.click(); }
      }
    });
    $('#search-clear').addEventListener('click', function () {
      search.value = '';
      App.query = '';
      App.searchPopOpen = false;
      renderMain();
      renderTopbar();
      search.focus();
    });
    var pop = $('#search-pop');
    if (pop) {
      pop.addEventListener('click', function (e) {
        var row = e.target.closest('.sp-row');
        if (!row) return;
        e.stopPropagation();
        var kind = row.getAttribute('data-sp-kind'), id = row.getAttribute('data-sp-id');
        var date = row.getAttribute('data-sp-date');
        if (kind === 'calendar') {
          setView('calendar');
          if (date) selectDay(date);
          openEventModal(id);
        } else if (kind === 'notebook') {
          if (NB) NB.openPage(id);
        } else if (kind === 'archive') {
          setView('archive');
          openModal(id);
        } else {
          setView('board');
          openModal(id);
        }
        App.searchPopOpen = false;
        renderSearchPop();
      });
      document.addEventListener('click', function (e) {
        if (!e.target.closest('.search-box') && !e.target.closest('#search-pop')) {
          App.searchPopOpen = false;
          renderSearchPop();
        }
      });
      window.addEventListener('resize', function () { if (App.searchPopOpen) renderSearchPop(); });
    }

    $('#btn-add-list').addEventListener('click', function () {
      App.addingList = true;
      App.quickAddColumnId = null;
      App.menuColumnId = null;
      App.focusComposer = 'list';
      renderBoard();
    });

    var btnMode = $('#btn-mode');
    if (btnMode) btnMode.addEventListener('click', toggleMode);

    var btnTheme = $('#btn-theme');
    // Inject the icon once at init. Re-setting innerHTML on every render would
    // detach the <svg> that is e.target of an in-flight click, which makes the
    // outside-click check (wrap.contains(e.target)) fail and instantly closes
    // the picker — so clicks only registered on the button's corners.
    btnTheme.innerHTML = ICONS.palette;
    btnTheme.addEventListener('click', function () {
      if (App.themePickerOpen) closeThemePicker(false);
      else openThemePicker();
    });

    $$('#theme-picker .theme-option').forEach(function (opt) {
      opt.addEventListener('click', function () {
        var name = this.getAttribute('data-theme-name');
        App.themePickerOpen = false;
        // Theme is pure CSS - swap it without rebuilding the board DOM.
        applyTheme(name);
        if (window.KanbanSfx) window.KanbanSfx.play('theme');
        persist(App.board);
        btnTheme.focus();
      });
    });

    document.addEventListener('click', function (e) {
      if (!App.themePickerOpen) return;
      var wrap = $('.theme-wrap');
      if (wrap && e.target && !wrap.contains(e.target)) closeThemePicker(false);
    });

    // one dropdown for export / import / backup folder / sound / reset
    var btnData = $('#btn-data'), dataMenu = $('#data-menu');
    if (btnData && dataMenu) {
      btnData.innerHTML = ICONS.menu;
      var setDataMenu = function (open) {
        dataMenu.hidden = !open;
        btnData.setAttribute('aria-expanded', open ? 'true' : 'false');
      };
      btnData.addEventListener('click', function () { setDataMenu(dataMenu.hidden); });
      dataMenu.addEventListener('click', function (e) {
        var it = e.target.closest('.menu-item');
        if (it && it.id !== 'btn-sound' && it.id !== 'btn-cursor' && it.id !== 'btn-graphics' && it.id !== 'btn-motion' && it.id !== 'btn-font') setDataMenu(false);
      });
      document.addEventListener('click', function (e) {
        if (!dataMenu.hidden && !e.target.closest('.data-wrap')) setDataMenu(false);
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !dataMenu.hidden) { setDataMenu(false); btnData.focus(); }
      });
    }
    var btnCursor = $('#btn-cursor');
    if (btnCursor) {
      renderCursorToggle();
      btnCursor.addEventListener('click', toggleCursors);
    }
    var btnSound = $('#btn-sound');
    if (btnSound) {
      renderSoundToggle();
      btnSound.addEventListener('click', toggleSound);
    }
    var btnGraphics = $('#btn-graphics');
    if (btnGraphics) {
      renderGraphicsToggle();
      btnGraphics.addEventListener('click', cycleGraphics);
    }
    var btnMotion = $('#btn-motion');
    if (btnMotion) {
      renderMotionToggle();
      btnMotion.addEventListener('click', toggleMotion);
    }
    var btnFont = $('#btn-font');
    if (btnFont) {
      renderFontSize();
      btnFont.addEventListener('click', cycleFontSize);
    }

    var btnFile = $('#btn-file');
    if (btnFile) {
      var fico = btnFile.querySelector('.mi-ico');
      if (fico) fico.innerHTML = ICONS.file; else btnFile.innerHTML = ICONS.file;
      btnFile.addEventListener('click', onFileButtonClick);
      renderFileStatus();
    }

    $('#btn-export').addEventListener('click', exportBoard);
    $('#btn-import').addEventListener('click', function () { $('#import-file').click(); });
    $('#import-file').addEventListener('change', function () {
      importBoard(this.files && this.files[0]);
      this.value = '';
    });
    $('#btn-reset').addEventListener('click', resetBoard);

    $('#view-board').addEventListener('click', function () { setView('board'); });
    $('#view-calendar').addEventListener('click', function () { setView('calendar'); });
    $('#view-archive').addEventListener('click', function () { setView('archive'); });
  }

  function bindConfirm() {
    $('#confirm-yes').addEventListener('click', function () {
      var cb = App.confirmCb;
      var val = $('#confirm-input').value;
      closeConfirm();
      if (cb) cb(val);
    });
    $('#confirm-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); $('#confirm-yes').click(); }
    });
    $('#confirm-cancel').addEventListener('click', function () { closeConfirm(true); });
    $('#confirm-modal .modal-backdrop').addEventListener('click', function () { closeConfirm(true); });
  }

  // ---------- notebook (js/notebook.js) ----------
  var NB = window.KanbanNotebook || null;

  // Something modal/popover is in the way: Tab must not move focus there either, but it should not
  // open the notebook on top of a dialog the user is working in.
  function tabBlocked() {
    if (!$('#confirm-modal').hidden || !$('#lightbox').hidden || !$('#card-modal').hidden) return true;
    if (App.activeCardId || App.activeEventId || App.themePickerOpen || App.menuColumnId || App.quickAddColumnId || App.addingList) return true;
    var menu = $('#data-menu');
    if (menu && !menu.hidden) return true;
    if (document.querySelector('.pk-pop')) return true;
    return false;
  }

  // A single Tab (or Shift+Tab) anywhere opens or closes the notebook and never moves focus.
  // Capture phase on window: it runs before any focused control can act on Tab.
  function bindTabNotebook() {
    window.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab' || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat || !NB) return;
      if (NB.isOpen()) { NB.close(); return; }
      if (tabBlocked()) return;
      NB.open();
      if (App.searchPopOpen) { App.searchPopOpen = false; renderSearchPop(); }
      // don't leave the caret in the topbar search (or any field) behind the sheet
      var a = document.activeElement;
      if (a && a !== document.body && !(a.closest && a.closest('#notebook'))) {
        try { a.blur(); } catch (err) { /* optional */ }
      }
    }, true);
  }

  function addCardFromNotebook(info) {
    var col = App.board.columns[0];
    if (!col) return null;
    var id = S.uid();
    commit(S.addCard(App.board, col.id, { id: id, title: info.title, description: info.description }), { skipModal: true });
    return { id: id, columnName: col.name };
  }

  function bindNotebook() {
    if (!NB) return;
    NB.init({
      board: function () { return App.board; },
      persist: function () { persist(App.board); },
      toast: toast,
      addCard: addCardFromNotebook,
      openCard: openModal,
      sfx: function (n) { if (window.KanbanSfx) { try { window.KanbanSfx.play(n); } catch (e) { /* optional */ } } }
    });
  }

  // ---------- keyboard (Esc closes things; Ctrl/Cmd+F focuses search; Ctrl/Cmd+Tab cycles views; Ctrl/Cmd+Z undoes; Ctrl/Cmd +/- cycles themes; Ctrl/Cmd+Up/Down steps font size; Ctrl/Cmd+M/N/L/G toggle sound/cursors/mode/graphics; Ctrl/Cmd+Shift+M toggles the motion override) ----------
  function bindMotionShortcut() {
    // Ctrl/Cmd+Shift+M. Handled in the capture phase on window so it works wherever focus is (including
    // text fields and the notebook), on any keyboard layout (physical key), and before anything else
    // can swallow it.
    window.addEventListener('keydown', function (e) {
      if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.altKey) return;
      if (e.code !== 'KeyM' && String(e.key).toLowerCase() !== 'm') return;
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) toggleMotion();
    }, true);
  }

  function bindKeyboard() {
    bindMotionShortcut();
    bindTabNotebook();
    document.addEventListener('keydown', function (e) {
      var t = e.target;
      var tag = t && t.tagName ? t.tagName.toLowerCase() : '';
      var typing = tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable);

      if (e.key === 'Escape') {
        if (NB && NB.escape()) { e.preventDefault(); return; }
        if (!$('#confirm-modal').hidden) { closeConfirm(true); return; }
        if (!$('#lightbox').hidden) { closeLightbox(); return; }
        if (App.activeEventId) { closeEventModal(); return; }
        if (!$('#card-modal').hidden) { closeModal(); return; }
        if (App.themePickerOpen) { closeThemePicker(true); return; }
        if (App.menuColumnId) { App.menuColumnId = null; renderBoard(); return; }
        if (App.quickAddColumnId) { App.quickAddColumnId = null; renderBoard(); return; }
        if (App.addingList) { App.addingList = false; renderBoard(); return; }
        if (typing) t.blur();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        if (NB && NB.isOpen()) { NB.focusSearch(); return; }
        var find = $('#search');
        if (find) {
          find.focus();
          find.select();
          if (App.query) { App.searchPopOpen = true; renderSearchPop(); }
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key === 'Tab') {
        e.preventDefault();
        cycleView(e.shiftKey ? -1 : 1);
        return;
      }

      // Tab is handled entirely by bindTabNotebook() (capture phase): it never moves focus.
      if (typing) return;

      if (NB && NB.isOpen()) { // the board is behind the notebook: no undo / theme shortcuts
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') e.preventDefault(); // and no stray native undo
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        if (!e.altKey) {
          if (e.key === '-' || e.key === '_') { e.preventDefault(); cycleTheme(-1); return; }
          if (e.key === '+' || e.key === '=') { e.preventDefault(); cycleTheme(1); return; }
          if (e.key === '[' || e.key === '{') { e.preventDefault(); stepGraphics(-1); return; }
          if (e.key === ']' || e.key === '}') { e.preventDefault(); stepGraphics(1); return; }
          if (e.key === 'ArrowUp') { e.preventDefault(); stepFontSize(1); return; }
          if (e.key === 'ArrowDown') { e.preventDefault(); stepFontSize(-1); return; }
          if (!e.shiftKey) {
            var lk = e.key.toLowerCase();
            if (lk === 'm') { e.preventDefault(); toggleSound(); return; }
            if (lk === 'n') { e.preventDefault(); toggleCursors(); return; }
            if (lk === 'l') { e.preventDefault(); toggleMode(); return; }
            if (lk === 'g') { e.preventDefault(); cycleGraphics(); return; }
          }
        }
      }

      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        doUndo();
        return;
      }
    });
  }

  // ---------- last session (loaded by <script src="Kanban Auto-Backups/kanban-backup-latest.js">) ----------
  // This needs no stored permission or folder handle, so it still works when the browser has wiped
  // its site data. Local edits that never reached the folder (UNBACKED) win over the file.
  function loadLastSessionScript() {
    var live = liveBoard();
    if (live) { App.board = live; App.reloaded = true; return; }
    var last = window.KANBAN_LAST_SESSION;
    if (!last || !last.board || !Array.isArray(last.board.columns)) return;
    App.hadBackupScript = true;
    if (lsGet(UNBACKED_KEY) === '1' && !window.kanbanDisk) return; // on desktop the disk copy is the truth
    var incoming = S.normalizeBoard(last.board);
    if (JSON.stringify(incoming) === JSON.stringify(App.board)) return;
    App.board = incoming;
    S.saveBoard(storage, App.board);
    App.restoredFrom = last.savedAt || true;
  }

  // Leaving with changes that could not be written to the backup folder would lose them if the
  // browser wipes its site data on exit — so ask first.
  function guardUnload(e) {
    if (fileSupported() && lsGet(UNBACKED_KEY) === '1' && App.fileStatus !== 'ok') {
      e.preventDefault();
      e.returnValue = '';
    }
  }

  // ---------- archive view ----------
  function renderArchive() {
    var box = $('#archive-list');
    if (!box) return;
    var q = App.query;
    var ids = q ? S.searchArchivedIds(App.board, q) : S.archivedIds(App.board);
    if (!ids.length) {
      box.innerHTML = '<p class="drawer-empty">' + (q ? 'No archived cards match.' : 'Nothing archived yet.<br>Archived cards leave the board but stay searchable here.') + '</p>';
      return;
    }
    box.innerHTML = ids.map(function (id) {
      var c = App.board.cards[id];
      var from = S.getColumn(App.board, c.archivedFrom);
      var note = S.plainText(c.description);
      return '<div class="arch-item" data-arch="' + id + '">' +
        '<button class="arch-main" type="button" data-arch-open="' + id + '">' +
          '<span class="arch-title">' + esc(c.title) + '</span>' +
          (note ? '<span class="arch-note">' + esc(q && note.toLowerCase().indexOf(q.toLowerCase()) > 60 ? excerptPlain(note, q) : note.slice(0, 90)) + '</span>' : '') +
          '<span class="arch-sub">' + (from ? esc(from.name) + ' · ' : '') + 'archived ' + esc(formatDate(c.archivedAt)) + '</span>' +
        '</button>' +
        '<span class="arch-actions">' +
          '<button class="btn" type="button" data-arch-restore="' + id + '">Restore</button>' +
          '<button class="icon-btn" type="button" data-arch-delete="' + id + '" title="Delete forever" aria-label="Delete forever">' + ICONS.close + '</button>' +
        '</span></div>';
    }).join('');
  }

  function bindArchive() {
    $('#archive-list').addEventListener('click', function (e) {
      var open = e.target.closest('[data-arch-open]');
      if (open) { openModal(open.getAttribute('data-arch-open')); return; }
      var rs = e.target.closest('[data-arch-restore]');
      if (rs) {
        commit(S.restoreCard(App.board, rs.getAttribute('data-arch-restore')));
        toast('Card restored to the board', null);
        return;
      }
      var del = e.target.closest('[data-arch-delete]');
      if (del) {
        var id = del.getAttribute('data-arch-delete');
        var c = S.getCard(App.board, id);
        confirmDialog({
          title: 'Delete forever?',
          message: '"' + (c ? c.title : '') + '" will be permanently deleted. You can undo right after.',
          yesLabel: 'Delete card'
        }, function () {
          withUndo('Card deleted', function () { return S.removeCard(App.board, id); });
        });
      }
    });
  }

  // ---------- calendar ----------
  var DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var VIEW_KEY = 'kanban.view.v1';
  var CALMODE_KEY = 'kanban.calmode.v1';
  var CAL_MODES = ['month', 'year'];
  var DOW_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  function parseDay(str) {
    var p = String(str).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12);
  }

  function dayLabel(str, long) {
    var d = parseDay(str);
    var t = todayStr();
    if (str === t) return 'Today';
    var tm = parseDay(t); tm.setDate(tm.getDate() + 1);
    if (str === S.dateStr(tm)) return 'Tomorrow';
    var w = DOW[(d.getDay() + 6) % 7];
    return w + (long ? 'day'.slice(0, 0) : '') + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
  }

  function isDoneCard(card) {
    var col = S.columnOfCard(App.board, card.id);
    return !!(col && col.name.toLowerCase().indexOf('done') !== -1);
  }

  function itemsFor(dueMap, date) {
    var q = App.query.toLowerCase();
    var evs = S.eventsOn(App.board, date).filter(function (e) {
      return !q || (e.title + ' ' + e.notes).toLowerCase().indexOf(q) !== -1;
    });
    var cards = (dueMap[date] || []).filter(function (c) { return !q || S.cardMatches(c, App.board, q); });
    return { events: evs, cards: cards };
  }

  function dueMapOf() {
    var m = {};
    Object.keys(App.board.cards).forEach(function (id) {
      var c = App.board.cards[id];
      if (c.dueDate && !c.archivedAt) (m[c.dueDate] = m[c.dueDate] || []).push(c);
    });
    return m;
  }

  function eventMatches(e, q) {
    return (e.title + ' ' + e.notes).toLowerCase().indexOf(q) !== -1;
  }

  function notebookPages() {
    var n = App.board.notebook;
    return (n && Array.isArray(n.pages)) ? n.pages : [];
  }

  function searchMatches(q) {
    var needle = String(q || '').toLowerCase();
    var out = { board: [], calendar: [], notebook: [], archive: [], total: 0 };
    if (!needle) return out;
    App.board.columns.forEach(function (col) {
      col.cards.forEach(function (id) {
        var c = S.getCard(App.board, id);
        if (c && !c.archivedAt && S.cardMatches(c, App.board, q)) out.board.push(c);
      });
    });
    App.board.events.forEach(function (e) { if (eventMatches(e, needle)) out.calendar.push(e); });
    var when = {};
    out.calendar.forEach(function (e) { when[e.id] = nextOccurrence(e); });
    out.calendar.sort(function (a, b) { var x = when[a.id], y = when[b.id]; return x < y ? -1 : x > y ? 1 : 0; });
    notebookPages().forEach(function (p) {
      var text = (p.title + ' ' + S.plainText(p.body)).toLowerCase();
      if (text.indexOf(needle) !== -1) out.notebook.push(p);
    });
    out.notebook.sort(function (a, b) {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
    S.searchArchivedIds(App.board, q).forEach(function (id) {
      var c = S.getCard(App.board, id);
      if (c) out.archive.push(c);
    });
    out.total = out.board.length + out.calendar.length + out.notebook.length + out.archive.length;
    return out;
  }

  // Wraps every (case-insensitive) occurrence of q in <mark class="sk">; everything else is escaped.
  function highlightMatch(text, q) {
    var t = String(text == null ? '' : text), needle = String(q || '').toLowerCase();
    if (!needle) return esc(t);
    var low = t.toLowerCase(), out = '', pos = 0, i;
    while ((i = low.indexOf(needle, pos)) !== -1) {
      out += esc(t.slice(pos, i)) + '<mark class="sk">' + esc(t.slice(i, i + needle.length)) + '</mark>';
      pos = i + needle.length;
    }
    return out + esc(t.slice(pos));
  }

  // A short stretch of `text` around the first occurrence of q (plain text, with ellipses), or null.
  function excerptPlain(text, q) {
    var t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim(), needle = String(q || '').toLowerCase();
    var i = needle ? t.toLowerCase().indexOf(needle) : -1;
    if (i === -1) return null;
    var from = Math.max(0, i - 36), to = Math.min(t.length, i + needle.length + 70);
    if (from > 0) { var sp = t.indexOf(' ', from); if (sp !== -1 && sp < i) from = sp + 1; }
    return (from > 0 ? '…' : '') + t.slice(from, to) + (to < t.length ? '…' : '');
  }
  function excerptMatch(text, q) {
    var x = excerptPlain(text, q);
    return x == null ? null : highlightMatch(x, q);
  }

  // Which non-title fields matched? -> [{ label, html }]. The title is highlighted in place.
  function matchHits(kind, item, q) {
    var hits = [], needle = String(q || '').toLowerCase();
    function add(label, text) {
      var html = excerptMatch(text, q);
      if (html) hits.push({ label: label, html: html });
    }
    if (kind === 'calendar') {
      add('Notes', item.notes);
      return hits;
    }
    if (kind === 'notebook') {
      add('Page', S.plainText(item.body));
      return hits;
    }
    add('Description', S.plainText(item.description));
    if (item.assignee && item.assignee.toLowerCase().indexOf(needle) !== -1) add('Assignee', item.assignee);
    (item.labelIds || []).forEach(function (id) {
      var l = S.getLabel(App.board, id);
      if (l && l.name.toLowerCase().indexOf(needle) !== -1) add('Label', l.name);
    });
    return hits;
  }

  // Marks the query inside already-rendered board / archive / calendar text (text nodes only, so
  // markup, handlers and drag state are untouched). Safe to call repeatedly.
  var MARK_SELECTORS = '#board .card-title, #board .card-note, #board .meta.assignee, #board .chip, #board .cl-text, ' +
    '#archive .arch-title, #archive .arch-note, #archive .arch-sub, #calendar .cal-pill > span:not(.cal-rep)';
  function applySearchMarks() {
    $$('mark.sk').forEach(function (m) {
      if (m.closest('#search-pop')) return;
      var p = m.parentNode; p.replaceChild(document.createTextNode(m.textContent), m); p.normalize();
    });
    var q = App.query;
    if (!q) return;
    var needle = q.toLowerCase();
    $$(MARK_SELECTORS).forEach(function (root) {
      var nodes = [], w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
      while (w.nextNode()) { if (w.currentNode.nodeValue.toLowerCase().indexOf(needle) !== -1) nodes.push(w.currentNode); }
      nodes.forEach(function (n) {
        var span = document.createElement('span');
        span.innerHTML = highlightMatch(n.nodeValue, q);
        var frag = document.createDocumentFragment();
        while (span.firstChild) frag.appendChild(span.firstChild);
        n.parentNode.replaceChild(frag, n);
      });
    });
  }

  function nextOccurrence(e) {
    if (!S.repeatOf(e)) return e.date;
    var d = new Date();
    d.setHours(12, 0, 0, 0);
    for (var i = 0; i < 400; i++) {
      var ds = S.dateStr(d);
      if (S.eventsOn({ events: [e] }, ds).length) return ds;
      d.setDate(d.getDate() + 1);
    }
    return e.date;
  }

  function boardCardSub(c) {
    var col = S.columnOfCard(App.board, c.id);
    var bits = [col ? col.name : 'No column'];
    bits.push(c.dueDate ? 'Due ' + dayLabel(c.dueDate) : 'No due date');
    var prog = S.checklistProgress(c);
    if (prog.total) bits.push(prog.done + '/' + prog.total + ' done');
    if (c.assignee) bits.push(c.assignee);
    var labels = (c.labelIds || []).map(function (id) { return S.getLabel(App.board, id); })
      .filter(Boolean).map(function (l) { return l.name; });
    if (labels.length) bits.push(labels.slice(0, 3).join(', '));
    return bits.join(' · ');
  }

  function searchRow(kind, item, q) {
    var isEvent = kind === 'calendar';
    var isArchived = kind === 'archive';
    var isPage = kind === 'notebook';
    var date = isEvent ? nextOccurrence(item) : '';
    var time = isEvent ? S.eventTimeLabel(item) : '';
    var rep = isEvent ? S.repeatLabel(item) : '';
    var sub, title = item.title;
    if (isEvent) sub = date ? (dayLabel(date) + (time ? ' · ' + time : '') + (rep ? ' · ' + rep : '')) : 'No due date';
    else if (isArchived) {
      var from = S.getColumn(App.board, item.archivedFrom);
      sub = (from ? from.name + ' · ' : '') + 'Archived ' + formatDate(item.archivedAt);
    } else if (isPage) {
      var text = S.plainText(item.body).trim();
      var words = text ? text.split(/\s+/).length : 0;
      sub = 'Notebook · ' + words + (words === 1 ? ' word' : ' words') + (item.pinned ? ' · Pinned' : '');
      if (!String(title || '').trim()) title = 'Untitled page';
    } else sub = boardCardSub(item);
    var kindLabel = isEvent ? 'Event' : (isArchived ? 'Archived' : (isPage ? 'Note' : 'Card'));
    var ico = isEvent ? ICONS.calendar : (isArchived ? ICONS.archive : (isPage ? ICONS.note : ICONS.flag));
    var icoClass = isEvent ? 'ev' : (isArchived ? 'arch' : (isPage ? 'nb' : 'due'));
    return '<button class="sp-row" type="button" data-sp-kind="' + kind + '" data-sp-id="' + esc(item.id) + '" data-sp-date="' + esc(date) + '">' +
      '<span class="sp-ico ' + icoClass + '" aria-hidden="true">' + ico + '</span>' +
      '<span class="sp-main"><span class="sp-name">' + highlightMatch(title, q) + '</span>' +
      matchHits(kind, item, q).map(function (h) {
        return '<span class="sp-hit"><b>' + h.label + '</b><span>' + h.html + '</span></span>';
      }).join('') +
      '<span class="sp-sub">' + highlightMatch(sub, q) + '</span></span>' +
      '<span class="sp-kind">' + kindLabel + '</span></button>';
  }

  var SEARCH_ROWS = 30; // shown per group; the counts are always complete
  function renderSearchPop() {
    var pop = $('#search-pop');
    applySearchMarks();
    if (!pop) return;
    var q = App.query;
    if (!q || !App.searchPopOpen) { pop.hidden = true; pop.innerHTML = ''; return; }
    var m = searchMatches(q);
    var groups = [
      { label: 'Board', kind: 'board', items: m.board },
      { label: 'Calendar', kind: 'calendar', items: m.calendar },
      { label: 'Notebook', kind: 'notebook', items: m.notebook },
      { label: 'Archive', kind: 'archive', items: m.archive }
    ].filter(function (g) { return g.items.length; });
    var head = '<div class="sp-head"><span class="sp-title">Search everything</span><span class="sp-count">' +
      (m.total ? m.total + ' result' + (m.total === 1 ? '' : 's') : 'No results') + '</span></div>';
    var body = m.total
      ? '<div class="sp-list">' + groups.map(function (g) {
          return '<div class="sp-group"><div class="sp-group-head"><span>' + g.label + '</span><span>' + g.items.length + '</span></div>' +
            g.items.slice(0, SEARCH_ROWS).map(function (it) { return searchRow(g.kind, it, q); }).join('') +
            (g.items.length > SEARCH_ROWS ? '<div class="sp-more">+' + (g.items.length - SEARCH_ROWS) + ' more. Keep typing to narrow it down.</div>' : '') + '</div>';
        }).join('') + '</div>'
      : '<div class="sp-empty">' + ICONS.search + '<strong>No matches for “' + esc(q) + '”</strong><span>' +
        'Try a card title, label, assignee, event title, note or notebook page.</span></div>';
    var foot = '<div class="sp-foot">Enter opens the first result · Esc clears</div>';
    pop.innerHTML = head + body + foot;
    pop.hidden = false;
    var sb = $('.search-box').getBoundingClientRect();
    pop.style.width = Math.min(480, window.innerWidth - 24) + 'px';
    pop.style.left = (sb.left + sb.width / 2) + 'px';
    pop.style.top = (sb.bottom + 10) + 'px';
  }

  function evPill(e, date) {
    var multi = !!e.endDate, cont = multi && date && date !== e.date, last = multi && date === e.endDate;
    var cls = 'cal-pill ev' + (e.allDay ? ' allday' : '') + (multi ? ' multi' : '') + (cont ? ' cont' : '') + (last ? ' last' : '');
    var label = cont ? '' : S.eventTimeLabel(e);
    var span = multi ? ' · ' + e.date.slice(5).replace('-', '/') + '→' + e.endDate.slice(5).replace('-', '/') : '';
    var rep = S.repeatLabel(e);
    var tip = e.title + (e.allDay ? ' (all day)' : '') + span + (rep ? ' · ' + rep : '');
    return '<button class="' + cls + '" type="button" draggable="true" data-ev="' + e.id + '" style="--c:' + esc(e.color) + '" title="' + esc(tip) + '">' +
      '<i></i>' + (rep ? '<span class="cal-rep" aria-label="Repeats">↻</span>' : '') + (label ? '<b>' + esc(label) + '</b>' : '') + '<span>' + (cont ? '↳ ' : '') + esc(e.title) + '</span></button>';
  }

  function duePill(c) {
    return '<button class="cal-pill due' + (isDoneCard(c) ? ' done' : '') + '" type="button" draggable="true" data-due-card="' + c.id + '" title="Card due: ' + esc(c.title) + '">' +
      ICONS.flag + '<span>' + esc(c.title) + '</span></button>';
  }

  var CHEV_L = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3L5 8l5 5"/></svg>';
  var CHEV_R = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3l5 5-5 5"/></svg>';

  function ensureCalendar() {
    var el = $('#calendar');
    if (el.firstChild) return;
    var saved = lsGet(CALMODE_KEY);
    if (CAL_MODES.indexOf(saved) !== -1) App.calMode = saved;
    el.innerHTML =
      '<div class="cal-main">' +
        '<div class="cal-bar">' +
          '<h2 id="cal-title" class="cal-title"></h2>' +
          '<div class="cal-tools">' +
            '<div id="cal-modes" class="seg cal-modes" role="group" aria-label="Calendar view">' +
              '<button class="seg-btn" type="button" data-cal-mode="month" aria-pressed="false">Month</button>' +
              '<button class="seg-btn" type="button" data-cal-mode="year" aria-pressed="false">Year</button>' +
            '</div>' +
            '<div class="cal-nav">' +
              '<button id="cal-prev" class="icon-btn" type="button" data-cal="prev">' + CHEV_L + '</button>' +
              '<button class="btn" type="button" data-cal="today">Today</button>' +
              '<button id="cal-next" class="icon-btn" type="button" data-cal="next">' + CHEV_R + '</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div id="cal-dow" class="cal-dow">' + DOW.map(function (d) { return '<span>' + d + '</span>'; }).join('') + '</div>' +
        '<div id="cal-grid" class="cal-grid"></div>' +
      '</div>' +
      '<aside class="cal-side">' +
        '<div id="cal-side-body" class="cal-side-body"></div>' +
      '</aside>';
    // the event editor lives at the top of the right panel
    var side = el.querySelector('.cal-side');
    side.insertBefore($('#event-modal'), side.firstChild);
    $('#event-modal').classList.add('in-cal');
  }

  function addDays(ds, n) {
    var d = parseDay(ds);
    d.setDate(d.getDate() + n);
    return S.dateStr(d);
  }

  function shortDay(ds) {
    var d = parseDay(ds);
    return d.getDate() + ' ' + MONTHS[d.getMonth()];
  }

  function calTitleHtml() {
    if (App.calMode === 'year') return '<strong>' + App.calYear + '</strong>';
    return '<strong>' + MONTH_LONG[App.calMonth] + '</strong> ' + App.calYear;
  }

  // one day cell (month grid); limit caps the visible items
  function dayCellHtml(ds, dueMap, today, limit, dim, extraCls) {
    var d = parseDay(ds);
    var it = itemsFor(dueMap, ds);
    var all = it.events.map(function (e) { return evPill(e, ds); }).concat(it.cards.map(duePill));
    var shown = all.slice(0, limit).join('');
    var more = all.length > limit ? '<button class="cal-more" type="button" data-cal-day="' + ds + '">+' + (all.length - limit) + ' more</button>' : '';
    var rawCount = S.eventsOn(App.board, ds).length + (dueMap[ds] || []).length;
    var searchState = App.query ? (all.length ? ' search-hit' : (rawCount ? ' search-miss' : ' search-empty')) : '';
    var hitBadge = App.query && all.length ? '<span class="cal-hits" title="' + all.length + ' match' + (all.length === 1 ? '' : 'es') + '">' + all.length + '</span>' : '';
    return '<div class="cal-cell' + (extraCls || '') + (dim ? ' other' : '') + (ds === today ? ' today' : '') + (ds === App.selectedDay ? ' sel' : '') + searchState + '" data-date="' + ds + '">' +
      '<div class="cal-dhead"><button class="cal-dnum" type="button" data-cal-day="' + ds + '" aria-label="' + esc(dayLabel(ds)) + '">' + d.getDate() + '</button>' +
      hitBadge + '<button class="cal-add" type="button" data-cal-add="' + ds + '" title="Add event" aria-label="Add event on ' + ds + '">' + ICONS.plus + '</button></div>' +
      '<div class="cal-items">' + shown + more + '</div></div>';
  }

  // the Year view: twelve compact months; a dot marks days with events / due cards
  function yearViewHtml(dueMap, today) {
    var y = App.calYear, html = '';
    for (var m = 0; m < 12; m++) {
      var offset = (new Date(y, m, 1, 12).getDay() + 6) % 7;
      var dim = new Date(y, m + 1, 0).getDate();
      var cells = '';
      for (var i = 0; i < 42; i++) {
        var dn = i - offset + 1;
        if (dn < 1 || dn > dim) { cells += '<span class="cal-yd blank"></span>'; continue; }
        var ds = S.dateStr(new Date(y, m, dn, 12));
        var it = itemsFor(dueMap, ds);
        var n = it.events.length + it.cards.length;
        var cls = 'cal-yd' + (n ? ' has' : '') + (ds === today ? ' today' : '') + (ds === App.selectedDay ? ' sel' : '') +
          (App.query ? (n ? ' search-hit' : ' search-miss') : '');
        cells += '<button type="button" class="' + cls + '" data-cal-yday="' + ds + '" title="' + esc(dayLabel(ds)) + (n ? ' · ' + n + ' item' + (n === 1 ? '' : 's') : '') + '">' + dn + '</button>';
      }
      html += '<div class="cal-ymonth' + (y === new Date().getFullYear() && m === new Date().getMonth() ? ' cur' : '') + '">' +
        '<button type="button" class="cal-yname" data-cal-ymonth="' + m + '">' + MONTH_LONG[m] + '</button>' +
        '<div class="cal-ydow">' + DOW.map(function (d) { return '<span>' + d.charAt(0) + '</span>'; }).join('') + '</div>' +
        '<div class="cal-ydays">' + cells + '</div></div>';
    }
    return html;
  }

  function renderCalendar() {
    ensureCalendar();
    var now = new Date();
    if (App.calYear == null) { App.calYear = now.getFullYear(); App.calMonth = now.getMonth(); }
    if (!App.selectedDay) App.selectedDay = todayStr();
    var mode = App.calMode;
    if (CAL_MODES.indexOf(mode) === -1) mode = App.calMode = 'month';

    $('#cal-title').innerHTML = calTitleHtml();
    $$('#cal-modes [data-cal-mode]').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-cal-mode') === mode ? 'true' : 'false');
    });
    var unit = mode;
    $('#cal-prev').title = 'Previous ' + unit;
    $('#cal-prev').setAttribute('aria-label', 'Previous ' + unit);
    $('#cal-next').title = 'Next ' + unit;
    $('#cal-next').setAttribute('aria-label', 'Next ' + unit);
    $('#cal-dow').hidden = mode === 'year';

    var dueMap = dueMapOf();
    var today = todayStr();
    var grid = $('#cal-grid');
    grid.setAttribute('data-mode', mode);
    var html = '';
    if (mode === 'month') {
      var first = new Date(App.calYear, App.calMonth, 1, 12);
      var offset = (first.getDay() + 6) % 7;
      var dim = new Date(App.calYear, App.calMonth + 1, 0).getDate();
      var rows = Math.ceil((offset + dim) / 7);
      for (var i = 0; i < rows * 7; i++) {
        var d = new Date(App.calYear, App.calMonth, 1 - offset + i, 12);
        html += dayCellHtml(S.dateStr(d), dueMap, today, 3, d.getMonth() !== App.calMonth, '');
      }
      grid.style.gridTemplateRows = 'repeat(' + rows + ', minmax(0, 1fr))';
    } else {
      html = yearViewHtml(dueMap, today);
      grid.style.gridTemplateRows = '';
    }
    grid.innerHTML = html;

    // side panel
    var side = '';
    var sel = itemsFor(dueMap, App.selectedDay);
    side += '<h4 class="cal-h">' + esc(dayLabel(App.selectedDay)) + '</h4>';
    if (!sel.events.length && !sel.cards.length) {
      side += App.query
        ? '<p class="cal-empty cal-empty-search">No matches on this day for “' + esc(App.query) + '”.</p>'
        : '<p class="cal-empty">Nothing planned.</p>';
    } else side += '<div class="cal-list">' + sel.events.map(function (e) { return evPill(e, App.selectedDay); }).concat(sel.cards.map(duePill)).join('') + '</div>';

    // upcoming 14 days (after the selected day is shown above, still list all)
    var up = '';
    var base = parseDay(today);
    for (var k2 = 0; k2 < 14; k2++) {
      var dd = new Date(base); dd.setDate(base.getDate() + k2);
      var dstr = S.dateStr(dd);
      var u = itemsFor(dueMap, dstr);
      if (!u.events.length && !u.cards.length) continue;
      up += '<div class="cal-group"><span class="cal-gl">' + esc(dayLabel(dstr)) + '</span>' +
        u.events.map(function (e) { return evPill(e, dstr); }).concat(u.cards.filter(function (c) { return !isDoneCard(c); }).map(duePill)).join('') + '</div>';
    }
    side += '<h4 class="cal-h">Coming up</h4>' + (up || '<p class="cal-empty">The next two weeks are clear.</p>');

    var overdue = [];
    Object.keys(dueMap).forEach(function (ds2) {
      if (ds2 < today) dueMap[ds2].forEach(function (c) { if (!isDoneCard(c)) overdue.push(c); });
    });
    if (overdue.length) {
      side += '<h4 class="cal-h warn">Overdue</h4><div class="cal-list">' + overdue.slice(0, 6).map(duePill).join('') + '</div>';
    }
    $('#cal-side-body').innerHTML = side;
    renderEventModal();
    renderSearchPop();
  }

  // switching between Month and Year keeps you where you are (the month shown stays the month in view)
  function setCalMode(m) {
    if (CAL_MODES.indexOf(m) === -1 || m === App.calMode) return;
    App.calMode = m;
    lsSet(CALMODE_KEY, m);
    renderCalendar();
  }

  function shiftCalendar(n) {
    if (App.calMode === 'year') { App.calYear += n; renderCalendar(); return; }
    shiftMonth(n);
  }

  // open the Month view on a given month of the year being shown
  function openCalMonth(m, ds) {
    App.calMonth = m;
    App.calMode = 'month';
    lsSet(CALMODE_KEY, 'month');
    if (ds) { selectDay(ds); return; }
    renderCalendar();
  }

  function setView(v) {
    if (NB && NB.isOpen()) NB.close();
    App.view = v === 'calendar' || v === 'archive' ? v : 'board';
    lsSet(VIEW_KEY, App.view);
    var board = App.view === 'board';
    var cal = App.view === 'calendar';
    var archive = App.view === 'archive';
    $('#board').hidden = !board;
    $('#calendar').hidden = !cal;
    $('#archive').hidden = !archive;
    document.body.setAttribute('data-view', App.view);
    $('#view-board').setAttribute('aria-pressed', board ? 'true' : 'false');
    $('#view-calendar').setAttribute('aria-pressed', cal ? 'true' : 'false');
    $('#view-archive').setAttribute('aria-pressed', archive ? 'true' : 'false');
    if (App.query) App.searchPopOpen = true;
    if (archive) { renderArchive(); renderSearchPop(); return; }
    if (cal) renderCalendar();
    else { renderBoard(); renderSearchPop(); }
  }

  var VIEW_ORDER = ['board', 'calendar', 'archive'];

  function cycleView(dir) {
    var i = VIEW_ORDER.indexOf(App.view);
    if (i === -1) i = 0;
    setView(VIEW_ORDER[(i + dir + VIEW_ORDER.length) % VIEW_ORDER.length]);
  }

  function initView() {
    var saved = lsGet(VIEW_KEY);
    setView(saved === 'calendar' || saved === 'archive' ? saved : 'board');
  }

  function selectDay(ds, focusInput) {
    App.selectedDay = ds;
    var d = parseDay(ds);
    App.calYear = d.getFullYear(); App.calMonth = d.getMonth();
    if (!App.activeEventId) setDraft({ date: ds });
    renderCalendar();
    if (focusInput) { $('#ev-title').focus(); }
  }

  function shiftMonth(n) {
    var d = new Date(App.calYear, App.calMonth + n, 1, 12);
    App.calYear = d.getFullYear(); App.calMonth = d.getMonth();
    renderCalendar();
  }

  // ---- event editor: "new event" draft, or an existing event being edited ----
  function newDraft(date) {
    return { id: 'draft', title: '', date: date, endDate: '', time: '', endTime: '', allDay: false, color: S.EVENT_COLORS[0], notes: '', images: [], repeat: null };
  }
  function setDraft(patch) {
    if (!App.eventDraft) App.eventDraft = newDraft(App.selectedDay || todayStr());
    var keepTitle = App.eventDraft.title;
    var tmp = S.updateEvent({ events: [App.eventDraft] }, 'draft', patch);
    App.eventDraft = tmp.events[0];
    App.eventDraft.title = patch && typeof patch.title === 'string' ? patch.title : keepTitle;
  }
  function currentEv() {
    if (App.activeEventId) return eventById(App.activeEventId);
    if (!App.eventDraft) App.eventDraft = newDraft(App.selectedDay || todayStr());
    return App.eventDraft;
  }

  function openEventModal(id) {
    var e = eventById(id);
    if (!e) return;
    App.activeEventId = id;
    if (window.KanbanSfx) window.KanbanSfx.play('open');
    renderEventModal();
    var t = $('#ev-title'); if (t) t.focus();
  }

  function closeEventModal() {
    if (window.KanbanSfx && App.activeEventId) window.KanbanSfx.play('close');
    App.activeEventId = null;
    renderEventModal();
  }

  function renderEventModal() {
    if (!$('#ev-title')) return;
    var editing = !!App.activeEventId, e = currentEv();
    if (!e) { App.activeEventId = null; e = currentEv(); editing = false; }
    $('#event-modal').classList.toggle('editing', editing);
    $('#ev-heading').textContent = editing ? 'Edit event' : 'Add event';
    $('#ev-close').hidden = !editing;
    $('#ev-delete').hidden = !editing;
    $('#ev-img-sec').hidden = !editing;
    $('#ev-done').textContent = editing ? 'Done' : 'Add event';
    setVal('#ev-title', e.title);
    setVal('#ev-date', e.date);
    setVal('#ev-time', e.time);
    setVal('#ev-end-date', e.endDate || e.date);
    setVal('#ev-end-time', e.endTime);
    $('#ev-end-date').min = e.date;
    $('#ev-end-time').min = !e.endDate && e.time ? e.time : '';
    $('#ev-allday').setAttribute('aria-checked', e.allDay ? 'true' : 'false');
    $$('#event-modal .ev-time').forEach(function (i) { i.disabled = !!e.allDay; i.closest('.ev-when-row').classList.toggle('no-time', !!e.allDay); });
    $$('#ev-quick .ev-dur').forEach(function (i) { i.disabled = !!e.allDay; });
    renderRepeat(e);
    setVal('#ev-notes', e.notes);
    if (editing && window.KanbanImages) renderImages('event');
    $('#ev-colors').innerHTML = S.EVENT_COLORS.map(function (c) {
      return '<button type="button" class="ev-color' + (c === e.color ? ' on' : '') + '" data-color="' + c + '" style="--c:' + c + '" aria-label="Colour ' + c + '" aria-pressed="' + (c === e.color) + '"></button>';
    }).join('');
  }

  function renderRepeat(e) {
    var rep = S.repeatOf(e);
    var sel = $('#ev-repeat');
    if (sel) sel.value = rep ? rep.freq : '';
    var detail = $('#ev-repeat-detail'), note = $('#ev-repeat-note'), dayWrap = $('#ev-repeat-day-wrap'), dayInput = $('#ev-repeat-day');
    if (!detail) return;
    detail.hidden = !rep;
    if (!rep) return;
    if (note) note.textContent = S.repeatLabel(e);
    var monthly = rep.freq === 'monthly';
    if (dayWrap) dayWrap.hidden = !monthly;
    if (dayInput) dayInput.value = monthly ? rep.day : '';
  }

  function patchEvent(patch) {
    if (App.activeEventId) {
      commit(S.updateEvent(App.board, App.activeEventId, patch), { skipModal: true });
      if (App.activeEventId) renderEventModal();
    } else {
      setDraft(patch);
      renderEventModal();
    }
  }

  // "Add event": turns the draft into a real event. Quick words in the title (fri, 3pm, 2026-11-05) fill in gaps.
  function addEventFromDraft() {
    var d = currentEv();
    var raw = (d.title || '').trim();
    var p = S.parseQuickEvent(raw, todayStr());
    var title = (p.title || raw).trim();
    if (!title) { var t = $('#ev-title'); t.focus(); t.classList.add('shake'); setTimeout(function () { t.classList.remove('shake'); }, 400); return; }
    var date = d.date, time = d.time;
    if (p.date && d.date === App.selectedDay) date = p.date;
    var endDate = d.endDate;
    if (endDate && date !== d.date) endDate = S.shiftDate(endDate, S.daysBetween(d.date, date));
    if (p.time && !d.allDay && !d.time) time = p.time;
    var repeat = d.repeat;
    if (repeat && repeat.freq === 'monthly' && repeat.day === Number(String(d.date).slice(8, 10))) {
      repeat = { freq: 'monthly', day: Number(date.slice(8, 10)) || repeat.day };
    }
    var b = S.addEvent(App.board, { title: title, date: date, endDate: endDate, time: time, endTime: d.endTime, allDay: d.allDay, color: d.color, notes: d.notes, repeat: repeat });
    App.selectedDay = date;
    var dd = parseDay(date);
    App.calYear = dd.getFullYear(); App.calMonth = dd.getMonth();
    App.eventDraft = newDraft(date);
    App.eventDraft.color = d.color;
    commit(b);
    renderEventModal();
    $('#ev-title').focus();
    toast('Added “' + title + '” · ' + dayLabel(date) + (time ? ' ' + time : ''), null);
  }

  function moveItem(kind, id, date) {
    if (kind === 'ev') commit(S.updateEvent(App.board, id, { date: date }));
    else if (kind === 'card') commit(S.updateCard(App.board, id, { dueDate: date }));
  }

  function bindCalendar() {
    $('#ev-close').innerHTML = ICONS.close;
    var cal = $('#calendar');

    cal.addEventListener('click', function (e) {
      var nav = e.target.closest('[data-cal]');
      if (nav) {
        var a = nav.getAttribute('data-cal');
        if (a === 'prev') shiftCalendar(-1);
        else if (a === 'next') shiftCalendar(1);
        else if (a === 'today') selectDay(todayStr());
        return;
      }
      var ym = e.target.closest('[data-cal-ymonth]');
      if (ym) { openCalMonth(parseInt(ym.getAttribute('data-cal-ymonth'), 10)); return; }
      var yd = e.target.closest('[data-cal-yday]');
      if (yd) { selectDay(yd.getAttribute('data-cal-yday')); return; }
      var modeBtn = e.target.closest('[data-cal-mode]');
      if (modeBtn) { setCalMode(modeBtn.getAttribute('data-cal-mode')); return; }
      var ev = e.target.closest('[data-ev]');
      if (ev) { openEventModal(ev.getAttribute('data-ev')); return; }
      var due = e.target.closest('[data-due-card]');
      if (due) { openModal(due.getAttribute('data-due-card')); return; }
      var add = e.target.closest('[data-cal-add]');
      if (add) { selectDay(add.getAttribute('data-cal-add'), true); return; }
      var day = e.target.closest('[data-cal-day]');
      if (day) { selectDay(day.getAttribute('data-cal-day')); return; }
      var cell = e.target.closest('.cal-cell');
      if (cell) selectDay(cell.getAttribute('data-date'));
    });
    // double-click a day in the Year view to open its month
    cal.addEventListener('dblclick', function (e) {
      var yd = e.target.closest('[data-cal-yday]');
      if (yd) { var ds = yd.getAttribute('data-cal-yday'); openCalMonth(parseDay(ds).getMonth(), ds); }
    });
    // mouse wheel / trackpad: one scroll step up = previous month (year in Year view), down = next
    var wheelLock = 0, wheelLast = 0;
    cal.addEventListener('wheel', function (e) {
      if (!e.target.closest('.cal-main')) return;
      if (e.ctrlKey || !e.deltaY || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
      e.preventDefault();
      var now = Date.now(), gap = now - wheelLast;
      wheelLast = now;
      if (now < wheelLock || gap < 80) { if (now < wheelLock) wheelLock = Math.max(wheelLock, now + 120); return; }
      wheelLock = now + 320;
      shiftCalendar(e.deltaY < 0 ? -1 : 1);
    }, { passive: false });
    cal.addEventListener('dblclick', function (e) {
      var cell = e.target.closest('.cal-cell');
      if (cell && !e.target.closest('.cal-pill')) selectDay(cell.getAttribute('data-date'), true);
    });

    // drag an event or a due-date card onto another day to reschedule it
    var drag = null;
    cal.addEventListener('dragstart', function (e) {
      var pill = e.target.closest ? e.target.closest('.cal-pill') : null;
      if (!pill) return;
      drag = pill.hasAttribute('data-ev')
        ? { kind: 'ev', id: pill.getAttribute('data-ev') }
        : { kind: 'card', id: pill.getAttribute('data-due-card') };
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', drag.id); } catch (x) {}
      pill.classList.add('dragging');
    });
    cal.addEventListener('dragend', function () {
      drag = null;
      $$('.cal-cell.drop').forEach(function (c) { c.classList.remove('drop'); });
      $$('.cal-pill.dragging').forEach(function (c) { c.classList.remove('dragging'); });
    });
    cal.addEventListener('dragover', function (e) {
      var cell = e.target.closest('.cal-cell');
      if (!drag || !cell) return;
      e.preventDefault();
      $$('.cal-cell.drop').forEach(function (c) { if (c !== cell) c.classList.remove('drop'); });
      cell.classList.add('drop');
    });
    cal.addEventListener('drop', function (e) {
      var cell = e.target.closest('.cal-cell');
      if (!drag || !cell) return;
      e.preventDefault();
      var d = drag; drag = null;
      moveItem(d.kind, d.id, cell.getAttribute('data-date'));
    });

    // event editor
    $('#ev-close').addEventListener('click', closeEventModal);
    $('#ev-done').addEventListener('click', function () { if (App.activeEventId) closeEventModal(); else addEventFromDraft(); });
    $('#ev-title').addEventListener('input', function () {
      if (App.activeEventId) { if (this.value.trim()) patchEvent({ title: this.value }); }
      else currentEv().title = this.value;
    });
    $('#ev-title').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (App.activeEventId) closeEventModal(); else addEventFromDraft();
    });
    $('#ev-date').addEventListener('change', function () {
      if (!this.value) return;
      var e = currentEv();
      var oldDay = e ? Number(String(e.date).slice(8, 10)) : 0;
      var rep = e ? S.repeatOf(e) : null;
      var patch = { date: this.value };
      if (rep && rep.freq === 'monthly' && rep.day === oldDay) {
        patch.repeat = { freq: 'monthly', day: Number(this.value.slice(8, 10)) };
      }
      patchEvent(patch);
      if (!App.activeEventId) { App.selectedDay = this.value; var d = parseDay(this.value); App.calYear = d.getFullYear(); App.calMonth = d.getMonth(); renderCalendar(); }
    });
    $('#ev-time').addEventListener('change', function () { patchEvent({ time: this.value }); });
    $('#ev-end-date').addEventListener('change', function () {
      var e = currentEv(); if (!e) return;
      var v = this.value;
      patchEvent({ endDate: !v || v <= e.date ? '' : v });
    });
    $('#ev-end-time').addEventListener('change', function () { patchEvent({ endTime: this.value }); });
    $('#ev-allday').addEventListener('click', function () {
      var e = currentEv(); if (!e) return;
      var was = e.allDay;
      patchEvent({ allDay: !was });
      if (window.KanbanSfx) window.KanbanSfx.play(was ? 'uncheck' : 'check');
    });
    $('#ev-repeat').addEventListener('change', function () {
      var e = currentEv(); if (!e) return;
      if (!this.value) { patchEvent({ repeat: null }); return; }
      var day = Number(String(e.date || todayStr()).slice(8, 10)) || 1;
      patchEvent({ repeat: { freq: this.value, day: day } });
      if (window.KanbanSfx) window.KanbanSfx.play('check');
    });
    $('#ev-repeat-day').addEventListener('change', function () {
      var n = parseInt(this.value, 10);
      if (!(n >= 1 && n <= 31)) { renderEventModal(); return; }
      patchEvent({ repeat: { freq: 'monthly', day: n } });
    });
    $('#ev-quick').addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b || b.disabled) return;
      var e = currentEv(); if (!e) return;
      if (b.hasAttribute('data-min')) {
        var start = e.time || '09:00', m = parseInt(start.slice(0, 2), 10) * 60 + parseInt(start.slice(3), 10) + parseInt(b.getAttribute('data-min'), 10);
        var endDay = e.endDate || e.date;
        if (m >= 1440) { endDay = S.shiftDate(e.date, 1); m -= 1440; }
        var hh = ('0' + Math.floor(m / 60)).slice(-2), mm = ('0' + (m % 60)).slice(-2);
        patchEvent({ time: start, endDate: endDay === e.date ? '' : endDay, endTime: hh + ':' + mm });
      } else {
        var n = parseInt(b.getAttribute('data-days'), 10);
        patchEvent({ endDate: n ? S.shiftDate(e.date, n) : '', endTime: n ? e.endTime : '' });
      }
    });
    $('#ev-notes').addEventListener('input', function () { patchEvent({ notes: this.value }); });
    $('#ev-colors').addEventListener('click', function (e) {
      var b = e.target.closest('[data-color]');
      if (b) patchEvent({ color: b.getAttribute('data-color') });
    });
    $('#ev-delete').addEventListener('click', function () {
      var id = App.activeEventId;
      closeEventModal();
      withUndo('Event deleted', function () { return S.removeEvent(App.board, id); });
    });
  }

  // ---------- images (cards and events) ----------
  var KI = window.KanbanImages;
  var IMG_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|avif|svg)$/i;

  function imgGridHTML(ids) {
    return ids.map(function (id) {
      return '<div class="img-thumb" data-img-open="' + id + '" role="button" tabindex="0" aria-label="View image">' +
        '<img data-img="' + id + '" alt="" draggable="false">' +
        '<button class="img-x" type="button" data-img-del="' + id + '" title="Remove image" aria-label="Remove image">' + ICONS.close + '</button></div>';
    }).join('');
  }

  function eventById(id) {
    var e = null;
    App.board.events.forEach(function (x) { if (x.id === id) e = x; });
    return e;
  }

  function ownerOf(kind, id) { return kind === 'card' ? S.getCard(App.board, id) : eventById(id); }
  function activeIdOf(kind) { return kind === 'card' ? App.activeCardId : App.activeEventId; }

  function renderImages(kind) {
    var p = kind === 'card' ? 'cm' : 'ev';
    var o = ownerOf(kind, activeIdOf(kind));
    var ids = (o && o.images) || [];
    var grid = $('#' + p + '-images');
    grid.innerHTML = imgGridHTML(ids);
    grid.hidden = ids.length === 0;
    $('#' + p + '-img-count').textContent = ids.length ? String(ids.length) : '';
    $('#' + p + '-add-image').disabled = ids.length >= S.MAX_IMAGES;
    if (KI) KI.hydrate(grid);
  }

  function addImageFiles(kind, fileList) {
    var files = Array.prototype.filter.call(fileList || [], function (f) {
      return /^image\//.test(f.type || '') || IMG_EXT_RE.test(f.name || '');
    });
    var ownerId = activeIdOf(kind);
    var o = ownerOf(kind, ownerId);
    if (!o) return;
    if (!files.length) { toast('Only picture files can be attached (PNG, JPG, GIF, WebP, BMP, AVIF, SVG)', null); return; }
    var room = S.MAX_IMAGES - (o.images || []).length;
    if (room <= 0) { toast('Up to ' + S.MAX_IMAGES + ' images each', null); return; }
    files = files.slice(0, room);
    toast('Adding ' + files.length + ' image' + (files.length === 1 ? '' : 's') + '…', null);
    var ok = 0, bad = 0, chain = Promise.resolve();
    files.forEach(function (f) {
      chain = chain.then(function () { return KI.add(f); }).then(function (id) {
        commit(S.attachImage(App.board, kind, ownerId, id));
        if (kind === 'event' && App.activeEventId === ownerId) renderEventModal();
        ok++;
      }).catch(function () { bad++; });
    });
    chain.then(function () {
      toast((ok ? ok + ' image' + (ok === 1 ? '' : 's') + ' added' : 'No images added') + (bad ? ' · ' + bad + ' could not be read' : ''), null);
    });
  }

  // ----- full-size viewer -----
  function openLightbox(ids, index) {
    if (!ids.length) return;
    App.lb = { ids: ids, i: Math.max(0, Math.min(index, ids.length - 1)) };
    $('#lightbox').hidden = false;
    showLightbox();
    $('#lb-close').focus();
  }
  function showLightbox() {
    var lb = App.lb;
    if (!lb) return;
    var id = lb.ids[lb.i];
    var img = $('#lb-img');
    img.removeAttribute('src');
    KI.load(id).then(function (src) { if (App.lb && App.lb.ids[App.lb.i] === id && src) img.src = src; });
    $('#lb-count').textContent = lb.ids.length > 1 ? (lb.i + 1) + ' / ' + lb.ids.length : '';
    $('#lb-prev').hidden = $('#lb-next').hidden = lb.ids.length < 2;
  }
  function stepLightbox(d) {
    if (!App.lb) return;
    var n = App.lb.ids.length;
    App.lb.i = (App.lb.i + d + n) % n;
    showLightbox();
  }
  function closeLightbox() {
    App.lb = null;
    $('#lightbox').hidden = true;
    $('#lb-img').removeAttribute('src');
  }

  function bindImages() {
    if (!KI) return;
    $('#lb-close').innerHTML = ICONS.close;
    $('#lb-prev').innerHTML = '<svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3L5 8l5 5"/></svg>';
    $('#lb-next').innerHTML = '<svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3l5 5-5 5"/></svg>';
    $('#lb-close').addEventListener('click', closeLightbox);
    $('#lb-prev').addEventListener('click', function () { stepLightbox(-1); });
    $('#lb-next').addEventListener('click', function () { stepLightbox(1); });
    $('#lightbox').addEventListener('click', function (e) { if (e.target === this || e.target.id === 'lb-img') closeLightbox(); });
    document.addEventListener('keydown', function (e) {
      if ($('#lightbox').hidden) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); stepLightbox(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); stepLightbox(1); }
    });

    // a missing file shouldn't leave a broken-image icon
    document.addEventListener('error', function (e) {
      var t = e.target;
      if (t && t.tagName === 'IMG' && t.hasAttribute('data-img')) t.classList.add('missing');
    }, true);

    [['card', 'cm', '#card-modal .card-panel'], ['event', 'ev', '#event-modal .event-panel']].forEach(function (c) {
      var kind = c[0], p = c[1], panel = $(c[2]);
      $('#' + p + '-add-image').addEventListener('click', function () { $('#' + p + '-image-input').click(); });
      $('#' + p + '-image-input').addEventListener('change', function () {
        addImageFiles(kind, this.files);
        this.value = '';
      });
      $('#' + p + '-images').addEventListener('click', function (e) {
        var del = e.target.closest('[data-img-del]');
        if (del) {
          e.stopPropagation();
          var id = activeIdOf(kind);
          commit(S.detachImage(App.board, kind, id, del.getAttribute('data-img-del')));
          if (kind === 'event') renderEventModal();
          return;
        }
        var th = e.target.closest('[data-img-open]');
        if (th) {
          var o = ownerOf(kind, activeIdOf(kind));
          var ids = (o && o.images) || [];
          openLightbox(ids, ids.indexOf(th.getAttribute('data-img-open')));
        }
      });
      $('#' + p + '-images').addEventListener('keydown', function (e) {
        var th = e.target.closest('[data-img-open]');
        if (th && e.target === th && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); th.click(); }
      });
      // drop files anywhere on the dialog
      panel.addEventListener('dragover', function (e) {
        if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') !== -1) {
          e.preventDefault();
          panel.classList.add('drop-files');
        }
      });
      panel.addEventListener('dragleave', function (e) { if (!panel.contains(e.relatedTarget)) panel.classList.remove('drop-files'); });
      panel.addEventListener('drop', function (e) {
        panel.classList.remove('drop-files');
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
          e.preventDefault();
          addImageFiles(kind, e.dataTransfer.files);
        }
      });
    });
    // pasting a picture into the event dialog (the notes editor handles its own paste)
    $('#event-modal .event-panel').addEventListener('paste', function (e) {
      var files = Array.prototype.filter.call((e.clipboardData && e.clipboardData.files) || [], function (f) { return /^image\//.test(f.type); });
      if (files.length && App.activeEventId) { e.preventDefault(); addImageFiles('event', files); }
    });
    // a file dropped outside a dialog must never navigate the window away
    window.addEventListener('dragover', function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') !== -1) e.preventDefault(); });
    window.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) e.preventDefault(); });
  }

  // ---------- init ----------
  function bindReactiveBackground() {
    var root = document.documentElement;
    var hud = $('#hud');
    if (!$('#bg') || !hud) return;
    var reduce = MOTION_REDUCE;
    var tx = 0, ty = 0, cx = 0, cy = 0, raf = 0, live = false;
    function on() {
      return root.getAttribute('data-theme') === 'cyberpunk'
        && root.getAttribute('data-graphics') !== 'low'
        && !perfLite()
        && motionAllowed();
    }
    // The vars live on #hud (every consumer is inside it), not on <html>: setting an inherited
    // custom property on the root forces a style recalc of the whole board on every frame.
    function clear() {
      ['--cp-mx', '--cp-my'].forEach(function (p) { hud.style.removeProperty(p); });
    }
    function setLive(v) {
      if (v === live) return;
      live = v;
      if (v) root.setAttribute('data-cp-live', '1'); else root.removeAttribute('data-cp-live');
    }
    function frame() {
      raf = 0;
      if (!on()) { setLive(false); clear(); cx = cy = tx = ty = 0; return; }
      cx += (tx - cx) * 0.14;
      cy += (ty - cy) * 0.14;
      if (Math.abs(tx - cx) < 0.002 && Math.abs(ty - cy) < 0.002) { cx = tx; cy = ty; }
      hud.style.setProperty('--cp-mx', cx.toFixed(3));
      hud.style.setProperty('--cp-my', cy.toFixed(3));
      if (cx !== tx || cy !== ty) schedule();
      else if (tx === 0 && ty === 0 && !pointerIn) { setLive(false); clear(); }
    }
    var pointerIn = false;
    function schedule() { if (!raf) raf = requestAnimationFrame(frame); }
    function move(e) {
      if (!on()) return;
      pointerIn = true;
      tx = Math.max(-1, Math.min(1, (e.clientX / window.innerWidth) * 2 - 1));
      ty = Math.max(-1, Math.min(1, (e.clientY / window.innerHeight) * 2 - 1));
      setLive(true);
      schedule();
    }
    function away() {
      pointerIn = false;
      if (!live) return;
      tx = 0; ty = 0; schedule();
    }
    document.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('mouseleave', away);
    window.addEventListener('blur', away);
    if (reduce && reduce.addEventListener) reduce.addEventListener('change', function () { if (!motionOverride()) away(); });
  }

  function bindGenshinStars() {
    var host = $('#genshin-stars');
    if (!host) return;
    refreshGenshinElement();
    var palettes = {
      anemo: [
        ['#ffffff', 'rgba(255,255,255,.55)'],
        ['#eafff9', 'rgba(234,255,249,.55)'],
        ['#b8f5e5', 'rgba(184,245,229,.52)'],
        ['#73dfc8', 'rgba(115,223,200,.48)']
      ],
      geo: [
        ['#ffffff', 'rgba(255,255,255,.55)'],
        ['#fff6df', 'rgba(255,246,223,.55)'],
        ['#ffe9a8', 'rgba(255,233,168,.52)'],
        ['#f2cf72', 'rgba(242,207,114,.48)']
      ],
      electro: [
        ['#ffffff', 'rgba(255,255,255,.55)'],
        ['#f6efff', 'rgba(246,239,255,.55)'],
        ['#ddc4ff', 'rgba(221,196,255,.52)'],
        ['#b58ae8', 'rgba(181,138,232,.48)']
      ],
      dendro: [
        ['#ffffff', 'rgba(255,255,255,.55)'],
        ['#f7ffe9', 'rgba(247,255,233,.55)'],
        ['#dcf3a8', 'rgba(220,243,168,.52)'],
        ['#a6cf3a', 'rgba(166,207,58,.48)']
      ],
      hydro: [
        ['#ffffff', 'rgba(255,255,255,.55)'],
        ['#eefaff', 'rgba(238,250,255,.55)'],
        ['#c4ecff', 'rgba(196,236,255,.52)'],
        ['#6cc7f0', 'rgba(108,199,240,.48)']
      ],
      pyro: [
        ['#ffffff', 'rgba(255,255,255,.55)'],
        ['#fff0e6', 'rgba(255,240,230,.55)'],
        ['#ffd0ad', 'rgba(255,208,173,.52)'],
        ['#f28a4f', 'rgba(242,138,79,.48)']
      ],
      cryo: [
        ['#ffffff', 'rgba(255,255,255,.55)'],
        ['#f2feff', 'rgba(242,254,255,.55)'],
        ['#ccf5fc', 'rgba(204,245,252,.52)'],
        ['#8bdce9', 'rgba(139,220,233,.48)']
      ]
    };
    var resizeTimer = 0;
    function build() {
      var element = document.documentElement.getAttribute('data-genshin-element') || 'geo';
      var colors = palettes[element] || palettes.geo;
      var area = Math.max(1, window.innerWidth * window.innerHeight);
      // capped: counts used to scale with the window (190+ animated layers at 1080p), which is what
      // integrated GPUs choke on; the sky looks the same density-wise at ~85 specks
      var dots = Math.max(40, Math.min(56, Math.round(area / 17000)));
      var glints = Math.max(8, Math.min(10, Math.round(area / 105000)));
      var html = [];
      function add(glint) {
        var c = colors[(Math.random() * colors.length) | 0];
        var size = glint ? 4.6 + Math.random() * 4.2 : 2.2 + Math.random() * 1.4;
        var lo = glint ? .34 + Math.random() * .26 : .2 + Math.random() * .35;
        var hi = glint ? .76 + Math.random() * .18 : .58 + Math.random() * .32;
        var tw = glint ? 3 + Math.random() * 4.5 : 2.4 + Math.random() * 3.6;
        var still = Math.random() < .3;
        var dr = still ? 6 + Math.random() * 6 : 4.5 + Math.random() * 6.5;
        var dx = still ? 0 : -(12 + Math.random() * 58);
        var dy = still ? 0 : Math.random() * 30 - 15;
        var rot = -14 + Math.random() * 28;
        html.push('<span class="gs-drift' + (still ? ' gs-still' : '') + '" style="' +
          '--x:' + (Math.random() * 99.4 + .3).toFixed(2) + '%;' +
          '--y:' + (Math.random() * 99.4 + .3).toFixed(2) + '%;' +
          '--dx:' + dx.toFixed(1) + 'px;' +
          '--dy:' + dy.toFixed(1) + 'px;' +
          '--dr:' + dr.toFixed(1) + 's;' +
          '--tdelay:' + (-Math.random() * 12).toFixed(2) + 's;">' +
          '<i class="gs-star ' + (glint ? 'gs-glint' : 'gs-dot') + (!glint && !still && i % 2 ? ' gs-calm' : '') + '" style="' +
          '--size:' + size.toFixed(1) + 'px;' +
          '--c:' + c[0] + ';--h:' + c[1] + ';' +
          '--lo:' + lo.toFixed(2) + ';--hi:' + hi.toFixed(2) + ';' +
          '--tw:' + tw.toFixed(1) + 's;' +
          '--rot:' + rot.toFixed(0) + 'deg;' +
          '--spin:' + (14 + Math.random() * 24).toFixed(0) + 's"></i></span>');
      }
      for (var i = 0; i < dots; i++) add(false);
      for (var j = 0; j < glints; j++) add(true);
      host.innerHTML = html.join('');
      host.dataset.count = String(html.length);
    }
    build();
    document.addEventListener('genshin-element-change', build);
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(build, 180);
    });

    var gsReduce = MOTION_REDUCE;
    var gx = 0, gy = 0, tx = 0, ty = 0, raf = 0;
    function gsOn() {
      var root = document.documentElement;
      return root.getAttribute('data-theme') === 'genshin'
        && root.getAttribute('data-graphics') === 'high'
        && !perfLite()
        && motionAllowed();
    }
    function gsFrame() {
      raf = 0;
      if (!gsOn()) {
        gx = gy = tx = ty = 0;
        host.style.removeProperty('transform');
        return;
      }
      gx += (tx - gx) * .12;
      gy += (ty - gy) * .12;
      if (Math.abs(tx - gx) < .004) gx = tx;
      if (Math.abs(ty - gy) < .004) gy = ty;
      // One inline transform on the single star layer: no custom property, so the 100+ stars
      // underneath are never restyled while the pointer moves.
      host.style.transform = 'translate3d(' + (gx * 7).toFixed(2) + 'px,' + (gy * 5).toFixed(2) + 'px,0)';
      if (gx !== tx || gy !== ty) gsSchedule();
    }
    function gsSchedule() {
      if (!raf) raf = requestAnimationFrame(gsFrame);
    }
    function gsMove(e) {
      if (!gsOn()) return;
      tx = Math.max(-1, Math.min(1, (e.clientX / window.innerWidth) * 2 - 1));
      ty = Math.max(-1, Math.min(1, (e.clientY / window.innerHeight) * 2 - 1));
      gsSchedule();
    }
    function gsAway() {
      tx = 0; ty = 0; gsSchedule();
    }
    document.addEventListener('pointermove', gsMove, { passive: true });
    document.addEventListener('mouseleave', gsAway);
    window.addEventListener('blur', gsAway);
    if (gsReduce && gsReduce.addEventListener) gsReduce.addEventListener('change', function () { if (!motionOverride()) gsAway(); });
  }

  // ---------- reminders (7 days before, 3 days before, on the day) ----------
  // What is due is worked out from the board (S.resolveReminders); which reminders were already shown or
  // dismissed is an interface preference, so the board file format is untouched.
  var REMIND_KEY = 'kanban.reminders.v1';
  var REMIND = { items: [], day: '', later: false };

  function remindState() {
    try { return JSON.parse(lsGet(REMIND_KEY) || 'null'); } catch (e) { return null; }
  }

  // Start of the app, or a new day: work out everything that should be announced now.
  function checkReminders() {
    var today = todayStr();
    var r = S.resolveReminders(App.board, today, remindState());
    lsSet(REMIND_KEY, JSON.stringify(r.state));
    REMIND = { items: r.items, day: today, later: false };
    renderReminders();
  }

  // The board changed: drop reminders whose item was edited away, completed or removed and refresh titles.
  // New items never pop up here - the user has only just typed them in.
  function refreshReminders() {
    if (!REMIND.items.length) return;
    var now = {};
    S.resolveReminders(App.board, REMIND.day, remindState()).items.forEach(function (r) { now[r.key] = r; });
    REMIND.items = REMIND.items.map(function (r) { return now[r.key]; }).filter(Boolean);
    renderReminders();
  }

  function dismissReminders(keys) {
    var st = remindState() || {};
    st.done = st.done || {}; st.open = st.open || {};
    REMIND.items.forEach(function (r) {
      if (keys.indexOf(r.key) === -1) return;
      st.done[r.key] = r.due;
      delete st.open[r.key];
    });
    lsSet(REMIND_KEY, JSON.stringify(st));
    REMIND.items = REMIND.items.filter(function (r) { return keys.indexOf(r.key) === -1; });
    renderReminders();
  }

  function remindWhen(days) {
    return days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days === 7 ? 'In 1 week' : 'In ' + days + ' days';
  }

  function remindDate(ds) {
    var d = parseDay(ds);
    return DOW[(d.getDay() + 6) % 7] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
  }

  function renderReminders() {
    var el = $('#reminders');
    if (!el) return;
    var items = REMIND.items;
    el.hidden = !items.length || REMIND.later;
    if (el.hidden) { $('#rem-list').innerHTML = ''; return; }
    $('#rem-count').textContent = items.length;
    var html = '', last = null;
    items.forEach(function (r) {
      if (r.days !== last) {
        html += '<div class="rem-when' + (r.days === 0 ? ' now' : '') + '"><b>' + remindWhen(r.days) + '</b><span>' + esc(remindDate(r.due)) + '</span></div>';
        last = r.days;
      }
      var sub = r.kind === 'event' ? (r.time || 'All day') : 'Card due · ' + r.column;
      html += '<div class="rem-row">' +
        '<button class="rem-open" type="button" data-rem-open="' + esc(r.key) + '" title="Open">' +
        (r.kind === 'event' ? '<i style="--c:' + esc(r.color) + '"></i>' : '<i class="flag">' + ICONS.flag + '</i>') +
        '<span class="rem-text"><span class="rem-title">' + esc(r.title) + '</span><span class="rem-sub">' + esc(sub) + '</span></span></button>' +
        '<button class="icon-btn rem-x" type="button" data-rem-x="' + esc(r.key) + '" title="Dismiss" aria-label="Dismiss reminder for ' + esc(r.title) + '">' + ICONS.close + '</button></div>';
    });
    $('#rem-list').innerHTML = html;
  }

  function bindReminders() {
    var el = $('#reminders');
    if (!el) return;
    el.addEventListener('click', function (e) {
      var x = e.target.closest('[data-rem-x]');
      if (x) { dismissReminders([x.getAttribute('data-rem-x')]); return; }
      var o = e.target.closest('[data-rem-open]');
      if (!o) return;
      var key = o.getAttribute('data-rem-open');
      var r = REMIND.items.filter(function (i) { return i.key === key; })[0];
      if (!r) return;
      if (r.kind === 'card') { setView('board'); openModal(r.id); return; }
      setView('calendar');
      selectDay(r.due);
      openEventModal(r.id);
    });
    $('#rem-later').addEventListener('click', function () { REMIND.later = true; renderReminders(); });
    $('#rem-done').addEventListener('click', function () {
      dismissReminders(REMIND.items.map(function (r) { return r.key; }));
    });
    // The midnight timer can run late (sleep, hibernate), so a new day is also noticed on focus and hourly-ish.
    function newDay() { if (REMIND.day !== todayStr()) { checkReminders(); renderTheme(); } }
    window.addEventListener('focus', newDay);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) newDay(); });
    setInterval(newDay, 5 * 60 * 1000);
  }

  // ---------- updates (desktop only; src/updater.rs does the work) ----------
  // Nothing is contacted until the user asks, and nothing is downloaded until they approve the version.
  function bindUpdates() {
    var btn = $('#btn-update'), appInfo = window.kanbanApp;
    if (!btn || !appInfo || !appInfo.updates) return;
    btn.hidden = false;
    var st = btn.querySelector('.mi-state'), busy = false;
    btn.querySelector('.mi-ico').innerHTML = ICONS.update;
    function state(text) { st.textContent = text || 'v' + appInfo.version; }
    function sticky(text) { toast(text); clearTimeout(App.toastTimer); }
    state();
    btn.addEventListener('click', function () {
      if (busy) return;
      busy = true;
      state('Checking…');
      appInfo.checkUpdate();
    });
    window.__kanbanUpdate = function (r) {
      if (r.state === 'installing') { state('Updating…'); sticky(r.message); return; }
      busy = false;
      state();
      if (r.state === 'latest') toast('You have the latest version (v' + appInfo.version + ')');
      else if (r.state === 'error') toast(r.message);
      else if (r.state === 'available') {
        var menu = $('#data-menu');
        if (menu && !menu.hidden) $('#btn-data').click();
        confirmDialog({
          title: 'Update to v' + r.version + '?',
          message: 'You have v' + appInfo.version + '.' + (r.notes ? '\n\n' + r.notes : '') +
            '\n\nThe update is downloaded from GitHub, its signature is checked, and the app restarts. Your board is saved first.',
          yesLabel: 'Update and restart', noLabel: 'Not now', primary: true
        }, function () {
          busy = true;
          state('Updating…');
          sticky('Downloading v' + r.version + '…');
          flushSave();
          appInfo.installUpdate();
        });
      }
    };
  }

  function init() {
    App.board = S.loadBoard(storage);
    if (window.kanbanDisk) { // desktop app: always connected, nothing to pick or re-allow
      App.backupDir = { desktop: true, name: window.kanbanDisk.folder };
      App.fileName = window.kanbanDisk.folder;
      App.fileStatus = 'ok';
    }
    App.editedThisSession = !window.kanbanDisk && lsGet(UNBACKED_KEY) === '1'; // edits from a session that never reached the folder
    loadLastSessionScript();
    if (navigator.storage && navigator.storage.persist) { try { navigator.storage.persist(); } catch (e) {} }
    restoreLatestBackup();
    bindTopbar();
    bindModal();
    bindConfirm();
    bindNotebook();
    bindKeyboard();
    bindMotionFocus();
    bindCalendar();
    bindImages();
    bindArchive();
    bindReactiveBackground();
    bindGenshinStars();
    bindReminders();
    bindUpdates();

    // Content-sized cards and notes have to re-measure when the window (and thus line wrapping) changes.
    var fitTimer = 0;
    window.addEventListener('resize', function () {
      clearTimeout(fitTimer);
      fitTimer = setTimeout(function () { fitCardNotes(); fitNotes(); }, 120);
    });
    initView();

    var board = $('#board');
    board.addEventListener('click', handleBoardClick);
    board.addEventListener('keydown', handleBoardKeydown);

    // Save a dated backup copy when the board is closed or hidden (pagehide also covers bfcache).
    window.addEventListener('pagehide', function () {
      if (window.kanbanDisk) rememberLive(App.board); // includes notebook typing that has not been saved yet
      flushBackup();
    });
    window.addEventListener('beforeunload', flushBackup);
    window.addEventListener('beforeunload', guardUnload);
    document.addEventListener('visibilitychange', function () { if (document.hidden) flushBackup(); });

    render();
    if (App.reloaded) writeBackup(false); // in case the reload cut off the last save
    schedulePerfCheck(2500);
    scheduleGenshinDay();
    checkReminders();
    if (window.KanbanImages) window.KanbanImages.gc(S.imageIds(App.board));
    if (App.restoredFrom && !window.kanbanDisk) toast('Restored your last session' + (App.restoredFrom !== true ? ' (saved ' + formatWhen(App.restoredFrom) + ')' : ''), null);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
