/*
 * state.js — pure data model + operations for the Kanban board.
 * No DOM, no localStorage access (storage is injected), fully testable in Node.
 * UMD: attaches to window.KanbanState in the browser, module.exports in Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory();
  } else {
    root.KanbanState = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STORAGE_KEY = 'kanban.board.v1';
  var VERSION = 1;
  var THEMES = ['brutal', 'riso', 'blueprint', 'claude', 'ios-glass', 'swiss', 'pixel', 'cyberpunk', 'genshin', 'nier', 'fallout'];

  var PRIORITIES = [
    { value: 0, label: 'Low' },
    { value: 1, label: 'Medium' },
    { value: 2, label: 'High' },
    { value: 3, label: 'Urgent' }
  ];
  var DEFAULT_PRIORITY = 1;
  var IMG_RE = /^[A-Za-z0-9_-]+\.(webp|jpg|png|gif)$/;
  var MAX_IMAGES = 40;
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  var TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  var EVENT_COLORS = ['#3e63dd', '#46a758', '#f76b15', '#e5484d', '#8e4ec6', '#0091ff'];
  var REPEAT_FREQS = ['weekly', 'monthly'];
  var DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  var PALETTE = ['#e5484d', '#f76b15', '#ffcb2e', '#46a758', '#0091ff', '#3e63dd', '#8e4ec6', '#e93d82', '#6e56cf', '#446850'];

  function uid() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function cleanImages(list) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (id) {
      if (typeof id === 'string' && IMG_RE.test(id) && out.indexOf(id) === -1 && out.length < MAX_IMAGES) out.push(id);
    });
    return out;
  }

  function isStr(v) { return typeof v === 'string'; }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  function priorityLabel(p) {
    for (var i = 0; i < PRIORITIES.length; i++) if (PRIORITIES[i].value === p) return PRIORITIES[i].label;
    return '';
  }

  // older boards may name retired themes; unknown themes fall back to the default warm light theme
  function themeOf(t) {
    return THEMES.indexOf(t) !== -1 ? t : 'claude';
  }

  // ---- notebook (quick-access scratch pages, separate from cards) ----
  var NB_MAX_PAGES = 200;
  var NB_MAX_BODY = 200000;

  function newPage(p) {
    var now = nowISO();
    p = p || {};
    return {
      id: isStr(p.id) && p.id ? p.id : uid(),
      title: isStr(p.title) ? p.title.slice(0, 200) : '',
      body: isStr(p.body) ? p.body.slice(0, NB_MAX_BODY) : '',
      pinned: p.pinned === true,
      cardIds: Array.isArray(p.cardIds) ? p.cardIds.filter(function (c, i, a) { return isStr(c) && a.indexOf(c) === i; }).slice(0, 30) : [],
      createdAt: isStr(p.createdAt) ? p.createdAt : now,
      updatedAt: isStr(p.updatedAt) ? p.updatedAt : now
    };
  }

  function welcomeNotebook() {
    var page = newPage({
      title: 'Scratch pad',
      body: '<p>Press <b>Tab</b> anywhere in the app to open this notebook, <b>Esc</b> to close it.</p>' +
        '<ul><li>Pages save as you type and travel with your board backups.</li>' +
        '<li>Pin a page to keep it at the top of the list.</li>' +
        '<li>Link a card to a page for one-click access, or turn a page into a card.</li></ul>'
    });
    return { pages: [page], activeId: page.id };
  }

  function normalizeNotebook(raw) {
    var nb = { pages: [], activeId: null };
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.pages)) return nb;
    var seen = {};
    raw.pages.forEach(function (p) {
      if (!p || typeof p !== 'object' || nb.pages.length >= NB_MAX_PAGES) return;
      var pg = newPage(p);
      if (seen[pg.id]) return;
      seen[pg.id] = true;
      pg.pinned = p.pinned === true;
      nb.pages.push(pg);
    });
    nb.activeId = isStr(raw.activeId) && seen[raw.activeId] ? raw.activeId : (nb.pages[0] ? nb.pages[0].id : null);
    return nb;
  }

  function defaultBoard() {
    var now = nowISO();
    var cols = ['To Do', 'In Progress', 'Done'];
    var labels = {
      'lbl-design': { id: 'lbl-design', name: 'Design', color: '#3e63dd' },
      'lbl-dev':    { id: 'lbl-dev',    name: 'Development', color: '#0091ff' },
      'lbl-bug':    { id: 'lbl-bug',    name: 'Bug', color: '#e5484d' },
      'lbl-idea':   { id: 'lbl-idea',   name: 'Idea', color: '#46a758' }
    };
    var board = {
      version: VERSION,
      name: 'My Board',
      theme: 'claude',
      columns: [
        { id: uid(), name: cols[0], collapsed: false, wipLimit: null, cards: [] },
        { id: uid(), name: cols[1], collapsed: false, wipLimit: null, cards: [] },
        { id: uid(), name: cols[2], collapsed: false, wipLimit: null, cards: [] }
      ],
      cards: {},
      labels: labels,
      events: [],
      notebook: welcomeNotebook()
    };
    var sample = {
      id: uid(),
      title: 'Welcome to your Kanban board 👋',
      description: 'Drag me between columns, or click to edit. Everything is saved locally on this computer.',
      labelIds: ['lbl-idea'],
      dueDate: null,
      priority: 1,
      assignee: '',
      checklist: [
        { id: uid(), text: 'Add a card', done: true },
        { id: uid(), text: 'Drag a card to another column', done: false },
        { id: uid(), text: 'Open a card to add labels & a checklist', done: false }
      ],
      createdAt: now,
      updatedAt: now
    };
    board.cards[sample.id] = sample;
    board.columns[0].cards.push(sample.id);
    return board;
  }

  // ---- validation / normalization (defensive, used for import + load) ----
  function normalizeBoard(raw) {
    if (!raw || typeof raw !== 'object') return defaultBoard();
    var b = {
      version: VERSION,
      name: isStr(raw.name) ? raw.name : 'My Board',
      theme: themeOf(raw.theme),
      columns: [],
      cards: {},
      labels: {},
      events: [],
      notebook: normalizeNotebook(raw.notebook)
    };

    // labels first
    if (raw.labels && typeof raw.labels === 'object') {
      Object.keys(raw.labels).forEach(function (id) {
        var l = raw.labels[id];
        if (l && isStr(l.name)) {
          b.labels[id] = { id: id, name: l.name, color: isStr(l.color) ? l.color : PALETTE[0] };
        }
      });
    }

    // cards
    if (raw.cards && typeof raw.cards === 'object') {
      Object.keys(raw.cards).forEach(function (id) {
        var c = raw.cards[id];
        if (!c || !isStr(c.title)) return;
        var checklist = Array.isArray(c.checklist) ? c.checklist.filter(function (i) {
          return i && isStr(i.text);
        }).map(function (i) { return { id: isStr(i.id) ? i.id : uid(), text: i.text, done: !!i.done }; }) : [];
        var labelIds = Array.isArray(c.labelIds) ? c.labelIds.filter(function (lid) { return b.labels[lid]; }) : [];
        var priority = isNum(c.priority) ? Math.max(0, Math.min(3, Math.round(c.priority))) : DEFAULT_PRIORITY;
        b.cards[id] = {
          id: id,
          title: c.title,
          description: isStr(c.description) ? c.description : '',
          labelIds: labelIds,
          dueDate: isStr(c.dueDate) && /^\d{4}-\d{2}-\d{2}$/.test(c.dueDate) ? c.dueDate : null,
          priority: priority,
          assignee: isStr(c.assignee) ? c.assignee : '',
          checklist: checklist,
          images: cleanImages(c.images),
          archivedAt: isStr(c.archivedAt) ? c.archivedAt : null,
          archivedFrom: isStr(c.archivedFrom) ? c.archivedFrom : null,
          createdAt: isStr(c.createdAt) ? c.createdAt : nowISO(),
          updatedAt: isStr(c.updatedAt) ? c.updatedAt : nowISO()
        };
      });
    }

    // columns
    if (Array.isArray(raw.columns)) {
      raw.columns.forEach(function (col, idx) {
        if (!col || !isStr(col.id) || !isStr(col.name)) return;
        var cards = Array.isArray(col.cards) ? col.cards.filter(function (cid) { return b.cards[cid]; }) : [];
        b.columns.push({
          id: col.id,
          name: col.name,
          collapsed: !!col.collapsed,
          wipLimit: isNum(col.wipLimit) && col.wipLimit > 0 ? Math.round(col.wipLimit) : null,
          cards: cards
        });
      });
    }

    // events
    if (Array.isArray(raw.events)) {
      raw.events.forEach(function (e) {
        if (!e || !isStr(e.title) || !isStr(e.date) || !DATE_RE.test(e.date)) return;
        b.events.push({
          id: isStr(e.id) ? e.id : uid(),
          title: e.title.slice(0, 200),
          date: e.date,
          time: isStr(e.time) && TIME_RE.test(e.time) ? e.time : '',
          endDate: isStr(e.endDate) && DATE_RE.test(e.endDate) ? e.endDate : '',
          endTime: isStr(e.endTime) && TIME_RE.test(e.endTime) ? e.endTime : '',
          allDay: e.allDay === true,
          color: isStr(e.color) ? e.color : EVENT_COLORS[0],
          notes: isStr(e.notes) ? e.notes : '',
          images: cleanImages(e.images),
          repeat: normRepeat(e.repeat, e.date)
        });
        normEvent(b.events[b.events.length - 1]);
      });
    }

    // archived cards live in board.cards but in no column
    Object.keys(b.cards).forEach(function (id) {
      if (b.cards[id].archivedAt) {
        b.columns.forEach(function (col) { col.cards = col.cards.filter(function (cid) { return cid !== id; }); });
      }
    });

    // dedupe card ids across columns (a card may only live in one column)
    var seen = {};
    b.columns.forEach(function (col) {
      col.cards = col.cards.filter(function (cid) {
        if (seen[cid]) return false;
        seen[cid] = true;
        return true;
      });
    });

    if (b.columns.length === 0) {
      b.columns.push({ id: uid(), name: 'To Do', collapsed: false, wipLimit: null, cards: [] });
    }
    b.notebook.pages.forEach(function (pg) {
      pg.cardIds = pg.cardIds.filter(function (cid) { return b.cards[cid]; });
    });
    return b;
  }

  // ---- storage (injected to stay pure) ----
  function loadBoard(storage) {
    try {
      var raw = storage.getItem(STORAGE_KEY);
      if (!raw) return defaultBoard();
      return normalizeBoard(JSON.parse(raw));
    } catch (e) {
      return defaultBoard();
    }
  }

  function saveBoard(storage, board) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(board));
      return true;
    } catch (e) {
      return false; // quota exceeded / unavailable
    }
  }

  function clearBoard(storage) {
    try { storage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  // ---- accessors ----
  function getCard(board, id) { return board.cards[id] || null; }
  function getColumn(board, id) {
    for (var i = 0; i < board.columns.length; i++) if (board.columns[i].id === id) return board.columns[i];
    return null;
  }
  function getLabel(board, id) { return board.labels[id] || null; }
  function columnOfCard(board, cardId) {
    for (var i = 0; i < board.columns.length; i++) {
      if (board.columns[i].cards.indexOf(cardId) !== -1) return board.columns[i];
    }
    return null;
  }
  function isArchived(card) { return !!(card && card.archivedAt); }
  function activeIds(board) {
    return Object.keys(board.cards).filter(function (id) { return !board.cards[id].archivedAt; });
  }
  function archivedIds(board) {
    return Object.keys(board.cards).filter(function (id) { return !!board.cards[id].archivedAt; })
      .sort(function (a, b) { return board.cards[b].archivedAt < board.cards[a].archivedAt ? -1 : 1; });
  }
  function totalCards(board) { return activeIds(board).length; }

  // strip formatting HTML to plain text (for search and previews)
  function plainText(html) {
    if (!isStr(html) || !html) return '';
    return html
      .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, ' ')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ').trim();
  }

  function checklistProgress(card) {
    var total = card.checklist.length;
    var done = 0;
    for (var i = 0; i < total; i++) if (card.checklist[i].done) done++;
    var pct = total === 0 ? 0 : Math.round((done / total) * 100);
    return { done: done, total: total, pct: pct };
  }

  function isOverdue(card) {
    if (!card.dueDate) return false;
    var today = new Date();
    var y = today.getFullYear();
    var m = String(today.getMonth() + 1).padStart(2, '0');
    var d = String(today.getDate()).padStart(2, '0');
    var todayStr = y + '-' + m + '-' + d;
    return card.dueDate < todayStr;
  }

  function cardMatches(card, board, query) {
    if (!query) return true;
    var q = query.toLowerCase();
    var hay = (card.title + ' ' + plainText(card.description) + ' ' + card.assignee).toLowerCase();
    if (hay.indexOf(q) !== -1) return true;
    for (var i = 0; i < card.labelIds.length; i++) {
      var l = board.labels[card.labelIds[i]];
      if (l && l.name.toLowerCase().indexOf(q) !== -1) return true;
    }
    return false;
  }

  function searchCardIds(board, query) {
    var ids = [];
    Object.keys(board.cards).forEach(function (id) {
      if (!board.cards[id].archivedAt && cardMatches(board.cards[id], board, query)) ids.push(id);
    });
    return ids;
  }

  function searchArchivedIds(board, query) {
    return archivedIds(board).filter(function (id) { return cardMatches(board.cards[id], board, query); });
  }

  // ---- archive ----
  function archiveCard(board, cardId) {
    var b = clone(board);
    var c = b.cards[cardId];
    if (!c || c.archivedAt) return b;
    var from = null;
    b.columns.forEach(function (col) {
      if (col.cards.indexOf(cardId) !== -1) from = col.id;
      col.cards = col.cards.filter(function (cid) { return cid !== cardId; });
    });
    c.archivedAt = nowISO();
    c.archivedFrom = from;
    return b;
  }

  function restoreCard(board, cardId) {
    var b = clone(board);
    var c = b.cards[cardId];
    if (!c || !c.archivedAt) return b;
    var col = null;
    b.columns.forEach(function (x) { if (x.id === c.archivedFrom) col = x; });
    if (!col) col = b.columns[0];
    col.cards.push(cardId);
    c.archivedAt = null;
    c.archivedFrom = null;
    c.updatedAt = nowISO();
    return b;
  }

  function archiveColumnCards(board, columnId) {
    var col = getColumn(board, columnId);
    var b = board;
    if (!col) return clone(board);
    col.cards.slice().forEach(function (cid) { b = archiveCard(b, cid); });
    return b === board ? clone(board) : b;
  }

  // ---- events ----
  function addEvent(board, ev) {
    var b = clone(board);
    if (!ev || !isStr(ev.title) || !ev.title.trim() || !isStr(ev.date) || !DATE_RE.test(ev.date)) return b;
    var e = {
      id: uid(),
      title: ev.title.trim().slice(0, 200),
      date: ev.date,
      time: isStr(ev.time) && TIME_RE.test(ev.time) ? ev.time : '',
      endDate: isStr(ev.endDate) && DATE_RE.test(ev.endDate) ? ev.endDate : '',
      endTime: isStr(ev.endTime) && TIME_RE.test(ev.endTime) ? ev.endTime : '',
      allDay: ev.allDay === true,
      color: isStr(ev.color) ? ev.color : EVENT_COLORS[0],
      notes: isStr(ev.notes) ? ev.notes : '',
      images: cleanImages(ev.images),
      repeat: normRepeat(ev.repeat, ev.date)
    };
    normEvent(e);
    b.events.push(e);
    return b;
  }

  function updateEvent(board, id, patch) {
    var b = clone(board);
    b.events.forEach(function (e) {
      if (e.id !== id || !patch) return;
      if (isStr(patch.title) && patch.title.trim()) e.title = patch.title.trim().slice(0, 200);
      if (isStr(patch.date) && DATE_RE.test(patch.date)) {
        // moving the start moves the end with it, so a multi-day event keeps its length
        if (e.endDate && !(isStr(patch.endDate))) e.endDate = shiftDate(e.endDate, daysBetween(e.date, patch.date));
        e.date = patch.date;
      }
      if (isStr(patch.endDate) && (patch.endDate === '' || DATE_RE.test(patch.endDate))) e.endDate = patch.endDate;
      if (isStr(patch.time) && (patch.time === '' || TIME_RE.test(patch.time))) e.time = patch.time;
      if (isStr(patch.endTime) && (patch.endTime === '' || TIME_RE.test(patch.endTime))) e.endTime = patch.endTime;
      if (typeof patch.allDay === 'boolean') e.allDay = patch.allDay;
      if (isStr(patch.color)) e.color = patch.color;
      if (isStr(patch.notes)) e.notes = patch.notes;
      if (Object.prototype.hasOwnProperty.call(patch, 'repeat')) e.repeat = normRepeat(patch.repeat, e.date);
      normEvent(e);
    });
    return b;
  }

  // ---- event date helpers ----
  function dayNum(str) { var p = str.split('-'); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000); }
  function daysBetween(a, b) { return dayNum(b) - dayNum(a); }
  function shiftDate(str, n) {
    var d = new Date(dayNum(str) * 86400000 + n * 86400000);
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
  }
  function daysInMonth(year, month) { return new Date(Date.UTC(year, month, 0)).getUTCDate(); }
  function normRepeat(raw, date) {
    if (!raw) return null;
    var freq = isStr(raw) ? raw : raw.freq;
    if (REPEAT_FREQS.indexOf(freq) === -1) return null;
    var fallback = Number(String(date || '').slice(8, 10));
    var day = raw && isNum(raw.day) ? Math.round(raw.day) : fallback;
    if (day < 1 || day > 31) day = fallback >= 1 && fallback <= 31 ? fallback : 1;
    return { freq: freq, day: day };
  }
  function repeatOf(e) { return normRepeat(e && e.repeat, e && e.date); }
  // keeps an event self-consistent: end never before start, no times on all-day events
  function normEvent(e) {
    if (e.endDate && e.endDate <= e.date) e.endDate = '';
    e.repeat = normRepeat(e.repeat, e.date);
    if (e.allDay) { e.time = ''; e.endTime = ''; return e; }
    if (!e.time) e.endTime = '';
    else if (!e.endDate && e.endTime && e.endTime <= e.time) e.endTime = '';
    return e;
  }
  function eventLastDay(e) { return e.endDate || e.date; }
  // the start date of the occurrence that covers `date`, or null when the event does not occur then
  function occurrenceStart(e, date) {
    var d0 = dayNum(e.date), target = dayNum(date);
    var duration = daysBetween(e.date, eventLastDay(e));
    if (target < d0) return null;
    var rep = repeatOf(e);
    if (!rep) return target <= d0 + duration ? e.date : null;

    if (rep.freq === 'weekly') {
      var latest = target - ((target - d0) % 7);
      if (latest >= d0 && latest + duration >= target) return shiftDate(e.date, latest - d0);
      return null;
    }

    // monthly: look back through the months an occurrence could still cover
    var floor = Math.max(d0, target - duration);
    var ref = new Date(target * 86400000);
    var year = ref.getUTCFullYear(), month = ref.getUTCMonth();
    var startYear = +e.date.slice(0, 4), startMonth = +e.date.slice(5, 7) - 1;
    for (var k = 0; k < 1200; k++) {
      var m = month - k;
      var y = year + Math.floor(m / 12);
      m = ((m % 12) + 12) % 12;
      if (y < startYear || (y === startYear && m < startMonth)) break;
      if (rep.day <= daysInMonth(y, m + 1)) {
        var cand = Math.round(Date.UTC(y, m, rep.day) / 86400000);
        if (cand >= floor && cand <= target && cand >= d0) return shiftDate(e.date, cand - d0);
        if (cand < floor) break;
      }
    }
    return null;
  }
  function repeatLabel(e) {
    var rep = repeatOf(e);
    if (!rep) return '';
    if (rep.freq === 'weekly') {
      var dow = new Date(dayNum(e.date) * 86400000).getUTCDay();
      return 'Every ' + DAY_NAMES[dow];
    }
    var n = rep.day, suffix = (n % 100 >= 11 && n % 100 <= 13) ? 'th' : (n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th');
    return 'Monthly on the ' + n + suffix;
  }
  // Times are stored as 24-hour "HH:MM" (file format); everything the user reads is 12-hour.
  // fmtTime12('13:05') -> '1:05 PM'; withMeridiem=false gives '1:05' (used to shorten ranges).
  function fmtTime12(t, withMeridiem) {
    var m = isStr(t) && /^(\d{1,2}):(\d{2})/.exec(t);
    if (!m) return '';
    var h = parseInt(m[1], 10), pm = h >= 12, h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ':' + m[2] + (withMeridiem === false ? '' : ' ' + (pm ? 'PM' : 'AM'));
  }
  // "9:00–10:30 AM", "9:00 AM–1:00 PM", "9:00 AM", "" — used on pills
  function eventTimeLabel(e) {
    if (e.allDay) return '';
    if (e.time && e.endTime && !e.endDate) {
      var sameHalf = (parseInt(e.time, 10) >= 12) === (parseInt(e.endTime, 10) >= 12);
      return fmtTime12(e.time, !sameHalf) + '–' + fmtTime12(e.endTime);
    }
    return fmtTime12(e.time);
  }

  function removeEvent(board, id) {
    var b = clone(board);
    b.events = b.events.filter(function (e) { return e.id !== id; });
    return b;
  }

  // ---- images (ids are file names kept by the image store; cards and events only reference them) ----
  function findOwner(b, kind, id) {
    if (kind === 'card') return b.cards[id] || null;
    for (var i = 0; i < b.events.length; i++) if (b.events[i].id === id) return b.events[i];
    return null;
  }

  function attachImage(board, kind, id, imgId) {
    var b = clone(board);
    var o = findOwner(b, kind, id);
    if (!o || !IMG_RE.test(imgId || '')) return b;
    o.images = cleanImages((o.images || []).concat([imgId]));
    if (kind === 'card') o.updatedAt = nowISO();
    return b;
  }

  function detachImage(board, kind, id, imgId) {
    var b = clone(board);
    var o = findOwner(b, kind, id);
    if (!o) return b;
    o.images = (o.images || []).filter(function (x) { return x !== imgId; });
    if (kind === 'card') o.updatedAt = nowISO();
    return b;
  }

  function imageIds(board) {
    var seen = {};
    Object.keys(board.cards).forEach(function (cid) { (board.cards[cid].images || []).forEach(function (i) { seen[i] = 1; }); });
    board.events.forEach(function (e) { (e.images || []).forEach(function (i) { seen[i] = 1; }); });
    return Object.keys(seen);
  }

  function eventsOn(board, date) {
    function key(e) { return e.allDay || e.date !== date ? '00:00' : (e.time || '99:99'); }
    var out = [];
    board.events.forEach(function (e) {
      var start = occurrenceStart(e, date);
      if (!start) return;
      if (!repeatOf(e)) { out.push(e); return; }
      var occ = {};
      Object.keys(e).forEach(function (k) { occ[k] = e[k]; });
      var offset = daysBetween(e.date, start);
      occ.date = start;
      occ.endDate = e.endDate ? shiftDate(e.endDate, offset) : '';
      occ.occurrence = true;
      out.push(occ);
    });
    return out.sort(function (a, b) { return key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0; });
  }

  // ---- reminders ----
  // Everything on the calendar is announced a week before, 3 days before and on the day itself.
  // `stage` is the reminder an item is currently in: 7 (4-7 days away), 3 (1-3 days away) or 0 (today).
  // `fire` is the exact day that stage starts, so a reminder missed while the app was closed is still shown.
  function reminderCandidates(board, today) {
    var out = [];
    function add(kind, id, title, due, days, stage, extra) {
      var r = { key: kind + ':' + id + ':' + due + ':' + stage, kind: kind, id: id, title: title, due: due, days: days, stage: stage, fire: shiftDate(due, -stage) };
      Object.keys(extra).forEach(function (k) { r[k] = extra[k]; });
      out.push(r);
    }
    for (var i = 0; i <= 7; i++) {
      var ds = shiftDate(today, i), stage = i === 0 ? 0 : i <= 3 ? 3 : 7;
      eventsOn(board, ds).forEach(function (e) {
        if (e.date !== ds) return; // later days of a multi-day event
        var rep = repeatOf(e);
        // a weekly event's "in a week" reminder would land on the previous occurrence, every single week
        if (rep && rep.freq === 'weekly' && stage === 7) return;
        add('event', e.id, e.title, ds, i, stage, { color: e.color, time: eventTimeLabel(e) });
      });
      Object.keys(board.cards).forEach(function (id) {
        var c = board.cards[id];
        if (c.dueDate !== ds || c.archivedAt) return;
        var col = columnOfCard(board, id);
        if (!col || col.name.toLowerCase().indexOf('done') !== -1) return;
        add('card', id, c.title, ds, i, stage, { color: '', time: '', column: col.name });
      });
    }
    return out;
  }

  // saved = { last: 'YYYY-MM-DD', open: {key: due}, done: {key: due} } (preferences, not board data).
  // -> { items, state }: what to show now, and the state to remember. A reminder keeps showing until it
  // is dismissed (done), replaced by the next stage, or the day has passed.
  function resolveReminders(board, today, saved) {
    var prev = saved && typeof saved === 'object' ? saved : {};
    var open = prev.open && typeof prev.open === 'object' ? prev.open : {};
    var done = prev.done && typeof prev.done === 'object' ? prev.done : {};
    var since = isStr(prev.last) && DATE_RE.test(prev.last) ? prev.last : shiftDate(today, -8);
    var state = { last: today, open: {}, done: {} };
    Object.keys(done).forEach(function (k) { if (isStr(done[k]) && done[k] >= today) state.done[k] = done[k]; });
    var items = reminderCandidates(board, today).filter(function (r) {
      if (state.done[r.key]) return false;
      return r.fire === today || r.fire > since || !!open[r.key];
    });
    items.forEach(function (r) { state.open[r.key] = r.due; });
    return { items: items, state: state };
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function dateStr(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }

  // "Dentist fri 3pm", "Lab audit 2026-11-05 14:30", "Standup tomorrow 9:15"
  function parseQuickEvent(text, baseDate) {
    var t = String(text || '').trim();
    var base = baseDate ? new Date(baseDate + 'T00:00:00') : new Date();
    var date = null, time = '';
    var m;
    if ((m = t.match(/\b(\d{4}-\d{2}-\d{2})\b/))) { date = m[1]; t = t.replace(m[0], ' '); }
    if ((m = t.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/i))) {
      var h = +m[1]; var ap = (m[3] || '').toLowerCase();
      if (ap === 'pm' && h < 12) h += 12;
      if (ap === 'am' && h === 12) h = 0;
      if (h < 24) { time = pad2(h) + ':' + m[2]; t = t.replace(m[0], ' '); }
    } else if ((m = t.match(/\b(\d{1,2})\s*(am|pm)\b/i))) {
      var h2 = +m[1]; var ap2 = m[2].toLowerCase();
      if (h2 >= 1 && h2 <= 12) {
        if (ap2 === 'pm' && h2 < 12) h2 += 12;
        if (ap2 === 'am' && h2 === 12) h2 = 0;
        time = pad2(h2) + ':00'; t = t.replace(m[0], ' ');
      }
    }
    if (!date) {
      var days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
      if ((m = t.match(/\b(today|tomorrow|tmr)\b/i))) {
        var d0 = new Date(base); if (/^t(omorrow|mr)$/i.test(m[1])) d0.setDate(d0.getDate() + 1);
        date = dateStr(d0); t = t.replace(m[0], ' ');
      } else if ((m = t.match(/\b(?:next\s+)?(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/i))) {
        var want = days.indexOf(m[1].toLowerCase());
        var d1 = new Date(base);
        var diff = (want - d1.getDay() + 7) % 7;
        if (diff === 0 || /next/i.test(m[0])) diff = diff === 0 ? 7 : diff + (diff < 7 && /next/i.test(m[0]) ? 7 : 0);
        d1.setDate(d1.getDate() + diff);
        date = dateStr(d1); t = t.replace(m[0], ' ');
      }
    }
    t = t.replace(/\s+/g, ' ').trim();
    return { title: t, date: date, time: time };
  }

  // ---- board ops (each returns a NEW board; input is not mutated) ----
  function setBoardName(board, name) {
    var b = clone(board);
    b.name = isStr(name) ? name.slice(0, 120) : b.name;
    return b;
  }

  function setTheme(board, theme) {
    if (THEMES.indexOf(theme) === -1) return board;
    var b = clone(board);
    b.theme = theme;
    return b;
  }

  function addColumn(board, column) {
    var b = clone(board);
    var col = {
      id: isStr(column.id) ? column.id : uid(),
      name: isStr(column.name) ? column.name.slice(0, 80) : 'New List',
      collapsed: false,
      wipLimit: null,
      cards: []
    };
    b.columns.push(col);
    return b;
  }

  function renameColumn(board, columnId, name) {
    var b = clone(board);
    var col = getColumn(b, columnId);
    if (col && isStr(name)) col.name = name.slice(0, 80);
    return b;
  }

  function removeColumn(board, columnId) {
    var b = clone(board);
    var col = getColumn(b, columnId);
    if (!col) return b;
    col.cards.forEach(function (cid) { delete b.cards[cid]; });
    b.columns = b.columns.filter(function (c) { return c.id !== columnId; });
    return b;
  }

  function setColumnOrder(board, orderedIds) {
    var b = clone(board);
    var map = {};
    b.columns.forEach(function (c) { map[c.id] = c; });
    var next = [];
    (orderedIds || []).forEach(function (id) {
      if (map[id]) { next.push(map[id]); delete map[id]; }
    });
    // append any columns not in the order (safety)
    Object.keys(map).forEach(function (id) { next.push(map[id]); });
    if (next.length === b.columns.length) b.columns = next;
    return b;
  }

  function toggleColumn(board, columnId) {
    var b = clone(board);
    var col = getColumn(b, columnId);
    if (col) col.collapsed = !col.collapsed;
    return b;
  }

  function setWipLimit(board, columnId, limit) {
    var b = clone(board);
    var col = getColumn(b, columnId);
    if (col) col.wipLimit = (isNum(limit) && limit > 0) ? Math.round(limit) : null;
    return b;
  }

  // ---- card ops ----
  function addCard(board, columnId, card) {
    var b = clone(board);
    var col = getColumn(b, columnId);
    if (!col) return b;
    var now = nowISO();
    var c = {
      id: isStr(card.id) ? card.id : uid(),
      title: isStr(card.title) ? card.title.slice(0, 300) : 'Untitled',
      description: isStr(card.description) ? card.description : '',
      labelIds: Array.isArray(card.labelIds) ? card.labelIds.filter(function (lid) { return b.labels[lid]; }) : [],
      dueDate: isStr(card.dueDate) && /^\d{4}-\d{2}-\d{2}$/.test(card.dueDate) ? card.dueDate : null,
      priority: isNum(card.priority) ? Math.max(0, Math.min(3, Math.round(card.priority))) : DEFAULT_PRIORITY,
      assignee: isStr(card.assignee) ? card.assignee : '',
      checklist: [],
      images: [],
      createdAt: now,
      updatedAt: now
    };
    b.cards[c.id] = c;
    col.cards.push(c.id);
    return b;
  }

  function updateCard(board, cardId, patch) {
    var b = clone(board);
    var c = b.cards[cardId];
    if (!c || !patch || typeof patch !== 'object') return b;
    if (isStr(patch.title)) c.title = patch.title.slice(0, 300);
    if (isStr(patch.description)) c.description = patch.description;
    if (isStr(patch.assignee)) c.assignee = patch.assignee;
    if (patch.dueDate === null || (isStr(patch.dueDate) && /^\d{4}-\d{2}-\d{2}$/.test(patch.dueDate))) c.dueDate = patch.dueDate || null;
    if (isNum(patch.priority)) c.priority = Math.max(0, Math.min(3, Math.round(patch.priority)));
    if (Array.isArray(patch.labelIds)) c.labelIds = patch.labelIds.filter(function (lid) { return b.labels[lid]; });
    c.updatedAt = nowISO();
    return b;
  }

  function removeCard(board, cardId) {
    var b = clone(board);
    if (!b.cards[cardId]) return b;
    delete b.cards[cardId];
    b.columns.forEach(function (col) {
      col.cards = col.cards.filter(function (cid) { return cid !== cardId; });
    });
    return b;
  }

  function setCardOrder(board, columnId, orderedCardIds) {
    var b = clone(board);
    var col = getColumn(b, columnId);
    if (!col) return b;
    var map = {};
    col.cards.forEach(function (cid) { map[cid] = true; });
    var next = [];
    (orderedCardIds || []).forEach(function (cid) {
      if (map[cid]) { next.push(cid); delete map[cid]; }
    });
    Object.keys(map).forEach(function (cid) { next.push(cid); });
    if (next.length === col.cards.length) col.cards = next;
    return b;
  }

  function moveCard(board, cardId, toColumnId, toIndex) {
    var b = clone(board);
    var c = b.cards[cardId];
    var toCol = getColumn(b, toColumnId);
    if (!c || !toCol) return b;
    // remove from wherever it is
    b.columns.forEach(function (col) {
      col.cards = col.cards.filter(function (cid) { return cid !== cardId; });
    });
    var idx = isNum(toIndex) ? Math.max(0, Math.min(toCol.cards.length, toIndex)) : toCol.cards.length;
    toCol.cards.splice(idx, 0, cardId);
    c.updatedAt = nowISO();
    return b;
  }

  function setCardColumn(board, cardId, toColumnId) {
    return moveCard(board, cardId, toColumnId, -1);
  }

  function addChecklistItem(board, cardId, item) {
    var b = clone(board);
    var c = b.cards[cardId];
    if (!c) return b;
    c.checklist.push({ id: isStr(item.id) ? item.id : uid(), text: isStr(item.text) ? item.text.slice(0, 300) : '', done: false });
    c.updatedAt = nowISO();
    return b;
  }

  function toggleChecklistItem(board, cardId, itemId) {
    var b = clone(board);
    var c = b.cards[cardId];
    if (!c) return b;
    for (var i = 0; i < c.checklist.length; i++) {
      if (c.checklist[i].id === itemId) { c.checklist[i].done = !c.checklist[i].done; break; }
    }
    c.updatedAt = nowISO();
    return b;
  }

  function removeChecklistItem(board, cardId, itemId) {
    var b = clone(board);
    var c = b.cards[cardId];
    if (!c) return b;
    c.checklist = c.checklist.filter(function (i) { return i.id !== itemId; });
    c.updatedAt = nowISO();
    return b;
  }

  function moveChecklistItem(board, cardId, itemId, toIndex) {
    var b = clone(board);
    var c = b.cards[cardId];
    if (!c) return b;
    var from = -1;
    for (var i = 0; i < c.checklist.length; i++) {
      if (c.checklist[i].id === itemId) { from = i; break; }
    }
    if (from < 0) return b;
    var item = c.checklist.splice(from, 1)[0];
    var idx = isNum(toIndex) ? Math.max(0, Math.min(c.checklist.length, toIndex)) : c.checklist.length;
    if (idx === from) return board;
    c.checklist.splice(idx, 0, item);
    c.updatedAt = nowISO();
    return b;
  }

  function setChecklistOrder(board, cardId, orderedItemIds) {
    var b = clone(board);
    var c = b.cards[cardId];
    if (!c) return b;
    var map = {};
    c.checklist.forEach(function (i) { map[i.id] = i; });
    var next = [];
    (orderedItemIds || []).forEach(function (iid) {
      if (map[iid]) { next.push(map[iid]); delete map[iid]; }
    });
    Object.keys(map).forEach(function (iid) { next.push(map[iid]); });
    if (next.length !== c.checklist.length) return b;
    var same = true;
    for (var k = 0; k < next.length; k++) { if (next[k] !== c.checklist[k]) { same = false; break; } }
    if (same) return board;
    c.checklist = next;
    c.updatedAt = nowISO();
    return b;
  }

  function editChecklistItem(board, cardId, itemId, text) {
    var b = clone(board);
    var c = b.cards[cardId];
    if (!c || !isStr(text)) return b;
    for (var i = 0; i < c.checklist.length; i++) {
      if (c.checklist[i].id === itemId) { c.checklist[i].text = text.slice(0, 300); break; }
    }
    c.updatedAt = nowISO();
    return b;
  }

  // ---- labels ----
  function addLabel(board, label) {
    var b = clone(board);
    var id = isStr(label.id) ? label.id : uid();
    b.labels[id] = { id: id, name: isStr(label.name) ? label.name.slice(0, 40) : 'Label', color: isStr(label.color) ? label.color : PALETTE[0] };
    return b;
  }

  function removeLabel(board, labelId) {
    var b = clone(board);
    if (!b.labels[labelId]) return b;
    delete b.labels[labelId];
    Object.keys(b.cards).forEach(function (cid) {
      b.cards[cid].labelIds = b.cards[cid].labelIds.filter(function (lid) { return lid !== labelId; });
    });
    return b;
  }

  function setCardLabels(board, cardId, labelIds) {
    var b = clone(board);
    var c = b.cards[cardId];
    if (!c) return b;
    c.labelIds = (labelIds || []).filter(function (lid) { return b.labels[lid]; });
    c.updatedAt = nowISO();
    return b;
  }

  // ---- sorting ----
  function sortByKey(a, bCard, key) {
    var cmp;
    if (key === 'priority') cmp = a.priority - bCard.priority;
    else if (key === 'dueDate') {
      if (!a.dueDate && !bCard.dueDate) cmp = 0;
      else if (!a.dueDate) cmp = 1;
      else if (!bCard.dueDate) cmp = -1;
      else cmp = a.dueDate < bCard.dueDate ? -1 : (a.dueDate > bCard.dueDate ? 1 : 0);
    } else if (key === 'created') {
      cmp = a.createdAt < bCard.createdAt ? -1 : (a.createdAt > bCard.createdAt ? 1 : 0);
    } else return 0;
    return cmp;
  }

  function sortColumn(board, columnId, key) {
    var b = clone(board);
    var col = getColumn(b, columnId);
    if (!col) return b;
    var cards = col.cards.map(function (cid) { return b.cards[cid]; });
    cards.sort(function (a, bCard) { return sortByKey(a, bCard, key); });
    col.cards = cards.map(function (c) { return c.id; });
    return b;
  }

  // ---- stats ----
  function boardStats(board) {
    var total = totalCards(board);
    var overdue = 0;
    var doneCol = 0;
    activeIds(board).forEach(function (id) {
      var c = board.cards[id];
      if (isOverdue(c)) overdue++;
      var col = columnOfCard(board, id);
      if (col && col.name.toLowerCase().indexOf('done') !== -1) doneCol++;
    });
    return { total: total, overdue: overdue, done: doneCol, columns: board.columns.length };
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    VERSION: VERSION,
    THEMES: THEMES,
    PRIORITIES: PRIORITIES,
    PALETTE: PALETTE,
    DEFAULT_PRIORITY: DEFAULT_PRIORITY,
    uid: uid,
    nowISO: nowISO,
    clone: clone,
    priorityLabel: priorityLabel,
    defaultBoard: defaultBoard,
    normalizeBoard: normalizeBoard,
    loadBoard: loadBoard,
    saveBoard: saveBoard,
    clearBoard: clearBoard,
    getCard: getCard,
    getColumn: getColumn,
    getLabel: getLabel,
    columnOfCard: columnOfCard,
    totalCards: totalCards,
    checklistProgress: checklistProgress,
    isOverdue: isOverdue,
    cardMatches: cardMatches,
    searchCardIds: searchCardIds,
    setBoardName: setBoardName,
    setTheme: setTheme,
    addColumn: addColumn,
    renameColumn: renameColumn,
    removeColumn: removeColumn,
    setColumnOrder: setColumnOrder,
    toggleColumn: toggleColumn,
    setWipLimit: setWipLimit,
    addCard: addCard,
    updateCard: updateCard,
    removeCard: removeCard,
    setCardOrder: setCardOrder,
    moveCard: moveCard,
    setCardColumn: setCardColumn,
    addChecklistItem: addChecklistItem,
    toggleChecklistItem: toggleChecklistItem,
    removeChecklistItem: removeChecklistItem,
    moveChecklistItem: moveChecklistItem,
    setChecklistOrder: setChecklistOrder,
    editChecklistItem: editChecklistItem,
    addLabel: addLabel,
    removeLabel: removeLabel,
    setCardLabels: setCardLabels,
    sortColumn: sortColumn,
    boardStats: boardStats,
    EVENT_COLORS: EVENT_COLORS,
    newPage: newPage,
    normalizeNotebook: normalizeNotebook,
    IMG_RE: IMG_RE,
    MAX_IMAGES: MAX_IMAGES,
    attachImage: attachImage,
    detachImage: detachImage,
    imageIds: imageIds,
    plainText: plainText,
    isArchived: isArchived,
    archivedIds: archivedIds,
    searchArchivedIds: searchArchivedIds,
    archiveCard: archiveCard,
    restoreCard: restoreCard,
    archiveColumnCards: archiveColumnCards,
    addEvent: addEvent,
    updateEvent: updateEvent,
    removeEvent: removeEvent,
    eventsOn: eventsOn,
    reminderCandidates: reminderCandidates,
    resolveReminders: resolveReminders,
    eventLastDay: eventLastDay,
    eventTimeLabel: eventTimeLabel,
    fmtTime12: fmtTime12,
    repeatOf: repeatOf,
    repeatLabel: repeatLabel,
    daysBetween: daysBetween,
    shiftDate: shiftDate,
    parseQuickEvent: parseQuickEvent,
    dateStr: dateStr
  };
});
