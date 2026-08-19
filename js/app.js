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
    sun: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.2 3.2l1.4 1.4M11.4 11.4l1.4 1.4M12.8 3.2l-1.4 1.4M4.6 11.4l-1.4 1.4"/></svg>',
    moon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.5 9.8A5.5 5.5 0 0 1 6.2 2.5a5.5 5.5 0 1 0 7.3 7.3z"/></svg>',
    download: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2v8M5 7.5L8 10.5l3-3M3 13.5h10"/></svg>',
    upload: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 10.5V2.5M5 5l3-3 3 3M3 13.5h10"/></svg>',
    reset: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.8 8a5.2 5.2 0 1 0 1.5-3.7L2.8 5.9"/><path d="M2.8 2.6v3.3h3.3"/></svg>',
    search: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>',
    close: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
    calendar: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3"/></svg>',
    flag: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 14V2.5M4 2.5h8L10.5 5 12 7.5H4"/></svg>',
    user: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="5" r="2.5"/><path d="M3 14a5 5 0 0 1 10 0"/></svg>',
    check: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5l3.5 3.5L13 4.5"/></svg>',
    plus: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>'
  };

  // ---------- app state ----------
  var App = {
    board: null,
    query: '',
    activeCardId: null,
    quickAddColumnId: null,
    addingList: false,
    menuColumnId: null,
    focusComposer: null, // 'quick' | 'list' | null — consumed by renderBoard
    undoSnapshot: null,
    sortable: [],
    justDragged: false,
    toastTimer: null,
    confirmCb: null
  };
  window.Kanban = App; // debug / testing hook

  var storage = {
    getItem: function (k) { return window.localStorage.getItem(k); },
    setItem: function (k, v) { window.localStorage.setItem(k, v); },
    removeItem: function (k) { window.localStorage.removeItem(k); }
  };

  // ---------- commit + render ----------
  function commit(board, opts) {
    App.board = board;
    render(opts && opts.skipModal ? { skipModal: true } : null);
    var ok = S.saveBoard(storage, board);
    if (!ok) toast('Could not save — browser storage may be full', null);
  }

  function render(opts) {
    opts = opts || {};
    renderTheme();
    renderTopbar();
    renderBoard();
    if (App.activeCardId && !opts.skipModal) renderModal();
  }

  function renderTheme() {
    document.documentElement.setAttribute('data-theme', App.board.theme);
    var btn = $('#btn-theme');
    if (btn) {
      btn.innerHTML = App.board.theme === 'dark' ? ICONS.sun : ICONS.moon;
      btn.title = App.board.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
      btn.setAttribute('aria-label', btn.title);
    }
  }

  function renderTopbar() {
    var nameInput = $('#board-name');
    if (nameInput && document.activeElement !== nameInput) nameInput.value = App.board.name;

    var stats = $('#stats');
    if (stats) {
      if (App.query) {
        var n = S.searchCardIds(App.board, App.query).length;
        stats.textContent = n + ' match' + (n === 1 ? '' : 'es');
      } else {
        var st = S.boardStats(App.board);
        stats.textContent = st.total + ' card' + (st.total === 1 ? '' : 's') +
          (st.overdue ? ' · ' + st.overdue + ' overdue' : '');
      }
    }

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
    if (prog.total > 0) meta += '<span class="meta checklist' + (prog.pct === 100 ? ' complete' : '') + '">' + ICONS.check + ' ' + prog.done + '/' + prog.total + '</span>';

    return '<li class="card" data-card-id="' + card.id + '" tabindex="0" role="button" aria-label="Open card: ' + esc(card.title) + '">' +
      (labels ? '<div class="card-labels">' + labels + '</div>' : '') +
      '<h3 class="card-title">' + esc(card.title) + '</h3>' +
      (meta ? '<div class="card-meta">' + meta + '</div>' : '') +
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
      { action: 'clear-cards', label: 'Clear all cards', danger: col.cards.length > 0 },
      { action: 'delete-column', label: 'Delete list', danger: true }
    ];
    return '<div class="column-menu" role="menu" aria-label="List actions">' + items.map(function (it) {
      if (it.sep) return '<div class="menu-sep" role="separator"></div>';
      return '<button class="menu-item' + (it.danger ? ' danger' : '') + '" role="menuitem" data-action="' + it.action + '" data-column="' + col.id + '">' + it.label + '</button>';
    }).join('') + '</div>';
  }

  function columnHTML(col) {
    var visible = visibleCardIds(col);
    var overWip = col.wipLimit != null && col.cards.length > col.wipLimit;

    var menu = App.menuColumnId === col.id ? columnMenuHTML(col) : '';
    var body = '';
    if (!col.collapsed) {
      var cardsHtml;
      if (col.cards.length === 0) cardsHtml = '<div class="empty">No cards</div>';
      else if (visible.length === 0) cardsHtml = '<div class="empty">No matches</div>';
      else cardsHtml = visible.map(function (cid) { return cardHTML(S.getCard(App.board, cid)); }).join('');

      body = '<ul class="card-list" data-column="' + col.id + '">' + cardsHtml + '</ul>' +
        '<footer class="column-footer">' +
          (App.quickAddColumnId === col.id ? quickAddHTML(col.id) :
            '<button class="link-btn add-card-btn" data-action="quick-add" data-column="' + col.id + '">' + ICONS.plus + ' Add a card</button>') +
        '</footer>';
    }

    return '<section class="column' + (col.collapsed ? ' collapsed' : '') + (overWip ? ' over-wip' : '') + (App.menuColumnId === col.id ? ' menu-open' : '') + '" data-column-id="' + col.id + '">' +
      '<header class="column-header">' +
        '<button class="icon-btn collapse-btn" data-action="collapse" data-column="' + col.id + '" title="' + (col.collapsed ? 'Expand list' : 'Collapse list') + '" aria-label="' + (col.collapsed ? 'Expand list' : 'Collapse list') + '">' + ICONS.chevron + '</button>' +
        '<h2 class="column-title" data-action="rename" data-column="' + col.id + '" title="Click to rename">' + esc(col.name) + '</h2>' +
        '<span class="count' + (overWip ? ' over' : '') + '" title="' + (col.wipLimit != null ? 'WIP limit: ' + col.wipLimit : 'Card count') + '">' +
          col.cards.length + (col.wipLimit != null ? ' / ' + col.wipLimit : '') +
        '</span>' +
        '<button class="icon-btn menu-btn" data-action="column-menu" data-column="' + col.id + '" title="List actions" aria-label="List actions">' + ICONS.dots + '</button>' +
      '</header>' +
      menu + body +
      '</section>';
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

  function renderBoard() {
    var html = App.board.columns.map(columnHTML).join('');
    if (App.board.columns.length === 0 && !App.addingList) {
      html += '<div class="board-empty"><p>No lists yet — add one to get started.</p>' +
        '<button class="btn primary" data-action="add-list">' + ICONS.plus + ' Add a list</button></div>';
    }
    if (App.addingList) html += listComposerHTML();
    $('#columns').innerHTML = html;
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
  function destroySortable() {
    App.sortable.forEach(function (s) { try { s.destroy(); } catch (e) {} });
    App.sortable = [];
  }

  function setupSortable() {
    if (typeof window.Sortable === 'undefined') return;
    destroySortable();
    if (App.query) return; // dragging disabled while searching
    if (App.board.columns.length === 0) return;

    App.sortable.push(new window.Sortable($('#columns'), {
      group: 'columns',
      handle: '.column-header',
      animation: 150,
      ghostClass: 'drag-ghost',
      chosenClass: 'drag-chosen',
      dragClass: 'dragging',
      onEnd: syncFromDOM
    }));

    $$('.card-list').forEach(function (list) {
      App.sortable.push(new window.Sortable(list, {
        group: 'cards',
        animation: 150,
        ghostClass: 'drag-ghost',
        chosenClass: 'drag-chosen',
        dragClass: 'dragging',
        onEnd: syncFromDOM
      }));
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
  function confirmDialog(opts, onYes) {
    $('#confirm-title').textContent = opts.title || 'Are you sure?';
    $('#confirm-message').textContent = opts.message || '';
    var yes = $('#confirm-yes');
    yes.textContent = opts.yesLabel || 'Yes, do it';
    App.confirmCb = onYes;
    $('#confirm-modal').hidden = false;
    yes.focus();
  }

  function closeConfirm() {
    $('#confirm-modal').hidden = true;
    App.confirmCb = null;
  }

  // ---------- undo (single level, for destructive ops) ----------
  function doUndo() {
    if (!App.undoSnapshot) return;
    var snap = App.undoSnapshot;
    App.undoSnapshot = null;
    if (App.activeCardId && !S.getCard(snap.board, App.activeCardId)) closeModal();
    commit(S.clone(snap.board));
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
    $('#card-modal').hidden = false;
    var t = $('#cm-title');
    if (t) t.focus();
  }

  function closeModal() {
    App.activeCardId = null;
    $('#card-modal').hidden = true;
  }

  function setVal(sel, v) {
    var el = $(sel);
    if (el && document.activeElement !== el) el.value = v;
  }

  function renderModal() {
    var card = S.getCard(App.board, App.activeCardId);
    if (!card) { closeModal(); return; }

    setVal('#cm-title', card.title);
    setVal('#cm-desc', card.description);
    $('#cm-priority').value = String(card.priority);
    $('#cm-due').value = card.dueDate || '';
    setVal('#cm-assignee', card.assignee);

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
    $('#cm-checklist').innerHTML = card.checklist.map(function (i) {
      return '<li class="cl-row">' +
        '<label class="cl-item' + (i.done ? ' done' : '') + '">' +
          '<input type="checkbox" data-item="' + i.id + '"' + (i.done ? ' checked' : '') + '>' +
          '<span>' + esc(i.text) + '</span>' +
        '</label>' +
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
    $('#cm-desc').addEventListener('input', function () { patchCard({ description: this.value }); });
    $('#cm-priority').addEventListener('change', function () { patchCard({ priority: Number(this.value) }); });
    $('#cm-due').addEventListener('change', function () { patchCard({ dueDate: this.value || null }); });
    $('#cm-assignee').addEventListener('change', function () { patchCard({ assignee: this.value.trim() }); });
    $('#cm-assignee').addEventListener('keydown', function (e) { if (e.key === 'Enter') this.blur(); });

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
      commit(S.setCardLabels(App.board, App.activeCardId, ids), { skipModal: true });
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
      commit(b, { skipModal: true });
      nameEl.focus();
    }
    $('#cm-add-label').addEventListener('click', addLabel);
    $('#cm-new-label-name').addEventListener('keydown', function (e) { if (e.key === 'Enter') addLabel(); });

    // checklist (delegated, since items re-render)
    $('#cm-checklist').addEventListener('change', function (e) {
      var cb = e.target.closest('input[data-item]');
      if (cb) commit(S.toggleChecklistItem(App.board, App.activeCardId, cb.getAttribute('data-item')), { skipModal: true });
    });
    $('#cm-checklist').addEventListener('click', function (e) {
      var del = e.target.closest('[data-del-item]');
      if (del) commit(S.removeChecklistItem(App.board, App.activeCardId, del.getAttribute('data-del-item')), { skipModal: true });
    });

    function addCheckItem() {
      var el = $('#cm-new-item');
      var v = el.value.trim();
      if (!v) { el.focus(); return; }
      el.value = '';
      commit(S.addChecklistItem(App.board, App.activeCardId, { text: v }), { skipModal: true });
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
        commit(S.addCard(App.board, colId, { title: title }));
        focusQuickAdd();
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
        var raw = window.prompt('WIP limit for this list (max in-progress cards). Leave empty to remove.', cur && cur.wipLimit != null ? String(cur.wipLimit) : '');
        if (raw !== null) {
          var n = parseInt(raw, 10);
          commit(S.setWipLimit(App.board, colId, isNaN(n) ? null : n));
        }
        renderBoard();
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
      if (cardEl && cardEl.classList.contains('card') && (e.key === 'Enter' || e.key === ' ')) {
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
  }

  function importBoard(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var board = null;
      try {
        var raw = JSON.parse(String(reader.result));
        board = S.normalizeBoard(raw && raw.board ? raw.board : raw);
      } catch (err) {
        toast('Import failed — that file is not a valid board export', null);
        return;
      }
      confirmDialog({
        title: 'Import board?',
        message: 'The current board will be replaced with "' + board.name + '" (' + S.totalCards(board) + ' cards, ' + board.columns.length + ' lists).',
        yesLabel: 'Import'
      }, function () {
        commit(board);
        toast('Board imported', null);
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
        fresh.theme = App.board.theme; // keep the light/dark preference
        return fresh;
      });
      closeModal();
    });
  }

  function bindTopbar() {
    $('#board-name').addEventListener('input', function () {
      commit(S.setBoardName(App.board, this.value), { skipModal: true });
    });

    var search = $('#search');
    search.addEventListener('input', function () {
      App.query = this.value.trim();
      App.menuColumnId = null;
      renderBoard();
      renderTopbar();
    });
    search.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && this.value) {
        this.value = '';
        App.query = '';
        renderBoard();
        renderTopbar();
      }
    });
    $('#search-clear').addEventListener('click', function () {
      search.value = '';
      App.query = '';
      renderBoard();
      renderTopbar();
      search.focus();
    });

    $('#btn-add-list').addEventListener('click', function () {
      App.addingList = true;
      App.quickAddColumnId = null;
      App.menuColumnId = null;
      App.focusComposer = 'list';
      renderBoard();
    });

    $('#btn-theme').addEventListener('click', function () {
      commit(S.setTheme(App.board, App.board.theme === 'dark' ? 'light' : 'dark'), { skipModal: true });
    });

    $('#btn-export').addEventListener('click', exportBoard);
    $('#btn-import').addEventListener('click', function () { $('#import-file').click(); });
    $('#import-file').addEventListener('change', function () {
      importBoard(this.files && this.files[0]);
      this.value = '';
    });
    $('#btn-reset').addEventListener('click', resetBoard);
    $('#btn-help').addEventListener('click', function () { $('#help-modal').hidden = false; });
  }

  function bindConfirm() {
    $('#confirm-yes').addEventListener('click', function () {
      var cb = App.confirmCb;
      closeConfirm();
      if (cb) cb();
    });
    $('#confirm-cancel').addEventListener('click', closeConfirm);
    $('#confirm-modal .modal-backdrop').addEventListener('click', closeConfirm);
  }

  function bindHelp() {
    $$('#help-modal [data-close-help]').forEach(function (el) {
      el.addEventListener('click', function () { $('#help-modal').hidden = true; });
    });
  }

  // ---------- keyboard shortcuts ----------
  function bindKeyboard() {
    document.addEventListener('keydown', function (e) {
      var t = e.target;
      var tag = t && t.tagName ? t.tagName.toLowerCase() : '';
      var typing = tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable);

      if (e.key === 'Escape') {
        if (!$('#help-modal').hidden) { $('#help-modal').hidden = true; return; }
        if (!$('#confirm-modal').hidden) { closeConfirm(); return; }
        if (!$('#card-modal').hidden) { closeModal(); return; }
        if (App.menuColumnId) { App.menuColumnId = null; renderBoard(); return; }
        if (App.quickAddColumnId) { App.quickAddColumnId = null; renderBoard(); return; }
        if (App.addingList) { App.addingList = false; renderBoard(); return; }
        if (typing) t.blur();
        return;
      }

      if (typing) return;

      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        $('#search').focus();
        $('#search').select();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        doUndo();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === '/') {
        e.preventDefault();
        $('#search').focus();
      } else if (e.key === 'n' || e.key === 'N') {
        var col = null;
        for (var i = 0; i < App.board.columns.length; i++) {
          if (!App.board.columns[i].collapsed) { col = App.board.columns[i]; break; }
        }
        if (!col && App.board.columns.length) col = App.board.columns[0];
        if (col) {
          App.quickAddColumnId = col.id;
          App.menuColumnId = null;
          App.focusComposer = 'quick';
          renderBoard();
        }
      } else if (e.key === 'l' || e.key === 'L') {
        App.addingList = true;
        App.quickAddColumnId = null;
        App.menuColumnId = null;
        App.focusComposer = 'list';
        renderBoard();
      }
    });
  }

  // ---------- init ----------
  function init() {
    App.board = S.loadBoard(storage);
    bindTopbar();
    bindModal();
    bindConfirm();
    bindHelp();
    bindKeyboard();

    var board = $('#board');
    board.addEventListener('click', handleBoardClick);
    board.addEventListener('keydown', handleBoardKeydown);

    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
