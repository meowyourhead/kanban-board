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
  var THEMES = ['light', 'dark', 'sticky', 'blueprint', 'factory', 'cyberpunk', 'claude', 'ios-glass'];

  var PRIORITIES = [
    { value: 0, label: 'Low' },
    { value: 1, label: 'Medium' },
    { value: 2, label: 'High' },
    { value: 3, label: 'Urgent' }
  ];
  var DEFAULT_PRIORITY = 1;

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

  function isStr(v) { return typeof v === 'string'; }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  function priorityLabel(p) {
    for (var i = 0; i < PRIORITIES.length; i++) if (PRIORITIES[i].value === p) return PRIORITIES[i].label;
    return '';
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
      theme: 'light',
      columns: [
        { id: uid(), name: cols[0], collapsed: false, wipLimit: null, cards: [] },
        { id: uid(), name: cols[1], collapsed: false, wipLimit: null, cards: [] },
        { id: uid(), name: cols[2], collapsed: false, wipLimit: null, cards: [] }
      ],
      cards: {},
      labels: labels
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
      theme: THEMES.indexOf(raw.theme) !== -1 ? raw.theme : 'light',
      columns: [],
      cards: {},
      labels: {}
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
  function totalCards(board) { return Object.keys(board.cards).length; }

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
    var hay = (card.title + ' ' + card.description + ' ' + card.assignee).toLowerCase();
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
      if (cardMatches(board.cards[id], board, query)) ids.push(id);
    });
    return ids;
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
    Object.keys(board.cards).forEach(function (id) {
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
    editChecklistItem: editChecklistItem,
    addLabel: addLabel,
    removeLabel: removeLabel,
    setCardLabels: setCardLabels,
    sortColumn: sortColumn,
    boardStats: boardStats
  };
});
