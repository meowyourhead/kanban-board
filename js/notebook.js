/*
 * notebook.js — the quick-access Notebook.
 *
 * A hidden sheet that slides in over the board when Tab is pressed anywhere in the app (except
 * over an open dialog/picker; app.js decides). It holds free-form pages — scratch notes, reference
 * snippets, phone numbers — and is deliberately NOT a to-do list: pages are not cards and never
 * appear on the board.
 *
 *   - pages live in `board.notebook = { pages: [...], activeId }` so they ride along with the
 *     auto-backups, export and import (see state.js `normalizeNotebook`)
 *   - edits autosave (debounced) without re-rendering the board
 *   - optional links to the rest of the app: attach cards to a page (one click opens the card),
 *     or turn a page into a card
 *
 * Classic script; app.js calls KanbanNotebook.init(host) once the DOM and board exist.
 */
(function () {
  'use strict';

  var S = window.KanbanState;
  var host = null;
  var els = {};
  var rte = null;
  var open = false;
  var closing = 0;
  var saveTimer = 0;
  var filter = '';
  var linkerOpen = false;
  var removed = null; // last deleted page, for Undo
  var editing = false; // pages are view-only until Edit is pressed

  function $(sel) { return document.querySelector(sel); }
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var ICON = {
    pin: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.8 2.2l4 4-1.6.7-2.1 2.1.3 3-1 1L6.2 9.8 2.8 13.2M6.2 9.8 3.8 8.8l1-1 3-.3L9.9 5.4z"/></svg>',
    close: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
    link: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.8 9.2a3 3 0 0 0 4.2 0l2-2a3 3 0 0 0-4.2-4.2l-.8.8M9.2 6.8a3 3 0 0 0-4.2 0l-2 2a3 3 0 0 0 4.2 4.2l.8-.8"/></svg>',
    card: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="3" width="11" height="10" rx="1.8"/><path d="M5.5 6.5h5M5.5 9.5h3"/></svg>',
    copy: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.6"/><path d="M10.5 5.5V4a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5"/></svg>',
    trash: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"/></svg>',
    plus: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>'
  };

  // ---------- data helpers ----------
  function nb() {
    var b = host.board();
    if (!b.notebook || !Array.isArray(b.notebook.pages)) b.notebook = { pages: [], activeId: null };
    return b.notebook;
  }
  function pageById(id) {
    var pages = nb().pages;
    for (var i = 0; i < pages.length; i++) if (pages[i].id === id) return pages[i];
    return null;
  }
  function active() { return pageById(nb().activeId); }

  function isBlank(p) { return !p.title.trim() && !S.plainText(p.body) && !p.cardIds.length; }

  function sortedPages() {
    var pages = nb().pages.slice();
    pages.sort(function (a, b) {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0;
    });
    return pages;
  }

  function visiblePages() {
    var all = sortedPages();
    var q = filter.trim().toLowerCase();
    if (!q) return all;
    return all.filter(function (p) {
      return (p.title + ' ' + S.plainText(p.body)).toLowerCase().indexOf(q) !== -1;
    });
  }

  function save(now) {
    clearTimeout(saveTimer);
    saveTimer = 0;
    if (now) host.persist();
    else saveTimer = setTimeout(function () { saveTimer = 0; host.persist(); }, 450);
  }
  function flush() { if (saveTimer) save(true); }

  function touch(p) { p.updatedAt = S.nowISO(); }

  function ago(iso) {
    var t = Date.parse(iso);
    if (isNaN(t)) return '';
    var s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 45) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    var d = new Date(t), n = new Date();
    var time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
    if (d.toDateString() === n.toDateString()) return 'today ' + time;
    var y = new Date(n); y.setDate(n.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return 'yesterday ' + time;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() === n.getFullYear() ? undefined : 'numeric' });
  }

  function words(p) {
    var t = S.plainText(p.body);
    return t ? t.split(' ').length : 0;
  }

  // ---------- view / edit mode ----------
  function setEditing(on, focus) {
    on = !!on;
    if (!on) { flush(); linkerOpen = false; }
    editing = on;
    els.sheet.classList.toggle('nb-editing', on);
    els.title.readOnly = !on;
    els.title.tabIndex = on ? 0 : -1;
    els.body.setAttribute('contenteditable', on ? 'true' : 'false');
    els.edit.setAttribute('aria-pressed', on ? 'true' : 'false');
    els.editLabel.textContent = on ? 'Done' : 'Edit';
    els.edit.title = (on ? 'Finish editing' : 'Edit this page') + ' (Alt + E)';
    if (!on) {
      var ae = document.activeElement;
      if (ae && (ae === els.title || els.body.contains(ae) || ae === els.body || els.linkerInput === ae)) ae.blur();
      var p = active();
      if (p) { renderLinks(p); renderMeta(p); }
    } else if (focus !== false) {
      var cur = active();
      if (cur && !cur.title.trim() && !S.plainText(cur.body)) els.title.focus();
      else if (rte) { rte.focus(); placeCaretAtEnd(); }
    }
  }

  // ---------- rendering ----------
  function renderList() {
    var pages = visiblePages();
    var cur = nb().activeId;
    if (!pages.length) {
      els.list.innerHTML = '<p class="nb-none">' + (filter ? 'No pages match.' : 'No pages yet.') + '</p>';
      return;
    }
    var html = '', sawPinned = false, sawRest = false;
    pages.forEach(function (p) {
      if (p.pinned && !sawPinned) { html += '<div class="nb-group">Pinned</div>'; sawPinned = true; }
      if (!p.pinned && sawPinned && !sawRest) { html += '<div class="nb-group">Pages</div>'; sawRest = true; }
      var snip = S.plainText(p.body);
      html += '<button type="button" class="nb-item' + (p.id === cur ? ' on' : '') + '" role="option" aria-selected="' + (p.id === cur ? 'true' : 'false') + '" data-nb-page="' + esc(p.id) + '">' +
        '<span class="nb-item-title">' + (p.pinned ? '<span class="nb-item-pin" aria-hidden="true"></span>' : '') + esc(p.title.trim() || 'Untitled page') + '</span>' +
        '<span class="nb-item-snip">' + esc(snip ? snip.slice(0, 90) : 'Empty') + '</span>' +
        '<span class="nb-item-when">' + esc(ago(p.updatedAt)) + '</span>' +
        '</button>';
    });
    els.list.innerHTML = html;
  }

  function renderLinks(p) {
    var b = host.board();
    var live = p.cardIds.filter(function (id) { return b.cards[id]; });
    if (live.length !== p.cardIds.length) p.cardIds = live;
    var chips = live.map(function (id) {
      var c = b.cards[id];
      return '<span class="nb-chip' + (c.archivedAt ? ' arch' : '') + '">' +
        '<button type="button" class="nb-chip-open" data-nb-open="' + esc(id) + '" title="Open card' + (c.archivedAt ? ' (archived)' : '') + '">' + ICON.card + '<span>' + esc(c.title || 'Untitled') + '</span></button>' +
        '<button type="button" class="nb-chip-x" data-nb-unlink="' + esc(id) + '" title="Unlink card" aria-label="Unlink card">' + ICON.close + '</button>' +
        '</span>';
    }).join('');
    els.chips.innerHTML = chips;
    els.linkBtn.setAttribute('aria-expanded', linkerOpen ? 'true' : 'false');
    els.linker.hidden = !linkerOpen;
  }

  function renderLinkerResults() {
    var p = active();
    if (!p || !linkerOpen) return;
    var b = host.board();
    var q = els.linkerInput.value.trim().toLowerCase();
    var ids = Object.keys(b.cards).filter(function (id) {
      var c = b.cards[id];
      if (p.cardIds.indexOf(id) !== -1) return false;
      return !q || c.title.toLowerCase().indexOf(q) !== -1;
    });
    ids.sort(function (a, c) { return (b.cards[a].archivedAt ? 1 : 0) - (b.cards[c].archivedAt ? 1 : 0); });
    ids = ids.slice(0, 8);
    if (!ids.length) { els.linkerList.innerHTML = '<p class="nb-none">' + (q ? 'No cards match.' : 'No other cards to link.') + '</p>'; return; }
    els.linkerList.innerHTML = ids.map(function (id) {
      var c = b.cards[id], col = null;
      b.columns.forEach(function (x) { if (x.cards.indexOf(id) !== -1) col = x; });
      return '<button type="button" class="nb-pick" data-nb-link="' + esc(id) + '"><span class="nb-pick-t">' + esc(c.title || 'Untitled') + '</span><span class="nb-pick-c">' + esc(c.archivedAt ? 'Archived' : col ? col.name : '') + '</span></button>';
    }).join('');
  }

  function renderMeta(p) {
    var w = words(p);
    els.meta.textContent = w + (w === 1 ? ' word' : ' words') + ' · edited ' + ago(p.updatedAt);
  }

  function renderPage() {
    var p = active();
    els.main.hidden = !p;
    els.empty.hidden = !!p;
    if (!p) { els.pin.hidden = true; els.edit.hidden = true; return; }
    els.pin.hidden = false;
    els.edit.hidden = false;
    if (document.activeElement !== els.title) els.title.value = p.title;
    if (rte && document.activeElement !== els.body) rte.set(p.body);
    els.pin.setAttribute('aria-pressed', p.pinned ? 'true' : 'false');
    els.pin.title = p.pinned ? 'Unpin page' : 'Pin page to the top';
    renderLinks(p);
    renderLinkerResults();
    renderMeta(p);
  }

  function renderAll() { renderList(); renderPage(); }

  // ---------- actions ----------
  function select(id, focusBody) {
    flush();
    var p = pageById(id);
    if (!p) return;
    nb().activeId = id;
    linkerOpen = false;
    setEditing(false);
    renderAll();
    save();
  }

  function newPage(focusTitle) {
    flush();
    var cur = active();
    // re-use the page the user is already looking at if it is still untouched
    if (cur && isBlank(cur)) { setEditing(true); els.title.focus(); return; }
    var p = S.newPage({});
    nb().pages.push(p);
    nb().activeId = p.id;
    filter = '';
    els.search.value = '';
    linkerOpen = false;
    setEditing(true, false);
    renderAll();
    save(true);
    if (focusTitle !== false) els.title.focus();
  }

  function removePage(id) {
    var pages = nb().pages;
    var i = pages.map(function (p) { return p.id; }).indexOf(id);
    if (i === -1) return;
    var p = pages[i];
    var blank = isBlank(p);
    pages.splice(i, 1);
    if (nb().activeId === id) {
      var next = sortedPages()[0];
      nb().activeId = next ? next.id : null;
    }
    linkerOpen = false;
    setEditing(false);
    renderAll();
    save(true);
    if (blank) return;
    removed = { page: p, index: i };
    host.toast('Page deleted', { label: 'Undo', fn: restoreRemoved });
  }

  function restoreRemoved() {
    if (!removed) return;
    var r = removed; removed = null;
    var pages = nb().pages;
    pages.splice(Math.min(r.index, pages.length), 0, r.page);
    nb().activeId = r.page.id;
    if (!open) openSheet();
    setEditing(false);
    renderAll();
    save(true);
  }

  function togglePin() {
    var p = active();
    if (!p) return;
    p.pinned = !p.pinned;
    renderAll();
    save(true);
  }

  function linkCard(id) {
    var p = active();
    if (!p || p.cardIds.indexOf(id) !== -1) return;
    p.cardIds.push(id);
    touch(p);
    els.linkerInput.value = '';
    linkerOpen = false;
    renderAll();
    save(true);
  }

  function unlinkCard(id) {
    var p = active();
    if (!p) return;
    p.cardIds = p.cardIds.filter(function (c) { return c !== id; });
    touch(p);
    renderAll();
    save(true);
  }

  function makeCard() {
    var p = active();
    if (!p) return;
    var title = p.title.trim() || S.plainText(p.body).slice(0, 80) || 'Untitled';
    var res = host.addCard({ title: title, description: p.body });
    if (!res) { host.toast('Add a list to the board first', null); return; }
    p = pageById(p.id); // the board was cloned by the commit: re-fetch the live page
    if (!p) return;
    if (p.cardIds.indexOf(res.id) === -1) p.cardIds.push(res.id);
    touch(p);
    renderAll();
    save(true);
    host.toast('Card created in "' + res.columnName + '"', { label: 'Open', fn: function () { closeSheet(); host.openCard(res.id); } });
  }

  function copyPage() {
    var p = active();
    if (!p) return;
    var text = (p.title.trim() ? p.title.trim() + '\n\n' : '') + bodyAsText(p.body);
    var done = function () { host.toast('Page copied as text', null); };
    var fail = function () { host.toast('Could not copy — select the text and press Ctrl + C', null); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fail);
    else fail();
  }

  // keep line structure when exporting as text
  function bodyAsText(html) {
    var out = String(html || '')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<\/(p|h3|li)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(ul|ol)>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
    return out.replace(/\n{3,}/g, '\n\n').trim();
  }

  function step(dir) {
    var pages = visiblePages();
    if (!pages.length) return;
    var i = pages.map(function (p) { return p.id; }).indexOf(nb().activeId);
    i = i === -1 ? 0 : (i + dir + pages.length) % pages.length;
    select(pages[i].id, false);
    var it = els.list.querySelector('.nb-item.on');
    if (it && it.scrollIntoView) it.scrollIntoView({ block: 'nearest' });
  }

  // ---------- open / close ----------
  function openSheet() {
    if (open) return;
    clearTimeout(closing);
    open = true;
    var n = nb();
    if (!n.pages.length) {
      var p = S.newPage({});
      n.pages.push(p);
      n.activeId = p.id;
    } else if (!pageById(n.activeId)) {
      n.activeId = sortedPages()[0].id;
    }
    filter = '';
    els.search.value = '';
    linkerOpen = false;
    renderAll();
    els.sheet.hidden = false;
    els.scrim.hidden = false;
    $('#board').setAttribute('inert', '');
    // next frame so the slide-in transition runs
    requestAnimationFrame(function () {
      els.sheet.classList.add('open');
      els.scrim.classList.add('open');
    });
    document.documentElement.setAttribute('data-notebook', 'open');
    if (host.sfx) host.sfx('open');
    var p0 = active();
    // a fresh blank page opens ready to write; existing pages open for reading
    if (p0 && isBlank(p0)) { setEditing(true, false); els.title.focus(); }
    else setEditing(false);
  }

  function placeCaretAtEnd() {
    if (document.activeElement !== els.body) return;
    try {
      var r = document.createRange();
      r.selectNodeContents(els.body);
      r.collapse(false);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    } catch (e) { /* caret placement is cosmetic */ }
  }

  function closeSheet() {
    if (!open) return;
    open = false;
    linkerOpen = false;
    editing = false;
    clearTimeout(saveTimer); saveTimer = 0;
    // blank pages are scratch space nobody used — don't keep them around
    var n = nb();
    var before = n.pages.length;
    n.pages = n.pages.filter(function (p) { return !isBlank(p); });
    if (n.pages.length !== before && !pageById(n.activeId)) {
      var next = sortedPages()[0];
      n.activeId = next ? next.id : null;
    }
    host.persist();
    if (host.sfx) host.sfx('close');
    if (document.activeElement && els.sheet.contains(document.activeElement)) document.activeElement.blur();
    els.sheet.classList.remove('open');
    els.scrim.classList.remove('open');
    $('#board').removeAttribute('inert');
    document.documentElement.removeAttribute('data-notebook');
    els.sheet.classList.remove('nb-editing');
    closing = setTimeout(function () { els.sheet.hidden = true; els.scrim.hidden = true; }, 190);
  }

  function toggle() { if (open) closeSheet(); else openSheet(); }

  // Open the sheet at a specific page (used by search results).
  function openPage(id) {
    if (!pageById(id)) return false;
    flush();
    nb().activeId = id;
    if (!open) openSheet();
    else { select(id, false); }
    // opened from a search result: move focus off the search field and into the sheet
    if (els.sheet && document.activeElement !== els.sheet) {
      try { els.sheet.focus({ preventScroll: true }); } catch (e) { /* optional */ }
    }
    return true;
  }

  // Esc peels back one layer; returns true when it consumed the key
  function escape() {
    if (!open) return false;
    if (linkerOpen) { linkerOpen = false; renderLinks(active()); els.linkBtn.focus(); return true; }
    if (document.activeElement === els.search && filter) { filter = ''; els.search.value = ''; renderList(); return true; }
    closeSheet();
    return true;
  }

  // ---------- wiring ----------
  function bind() {
    els.scrim.addEventListener('mousedown', closeSheet);
    $('#nb-close').addEventListener('click', closeSheet);
    $('#nb-new').addEventListener('click', function () { newPage(true); });
    els.pin.addEventListener('click', togglePin);
    els.edit.addEventListener('click', function () { setEditing(!editing); });
    $('#nb-make-card').addEventListener('click', makeCard);
    $('#nb-copy').addEventListener('click', copyPage);
    $('#nb-delete').addEventListener('click', function () { var p = active(); if (p) removePage(p.id); });
    $('#nb-empty-new').addEventListener('click', function () { newPage(true); });

    els.search.addEventListener('input', function () {
      filter = this.value;
      renderList();
    });
    els.search.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var first = visiblePages()[0];
        if (first) { e.preventDefault(); select(first.id, true); }
      } else if (e.key === 'ArrowDown') {
        var it = els.list.querySelector('.nb-item');
        if (it) { e.preventDefault(); it.focus(); }
      }
    });

    els.list.addEventListener('click', function (e) {
      var it = e.target.closest('[data-nb-page]');
      if (it) select(it.getAttribute('data-nb-page'), true);
    });
    els.list.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      var items = Array.prototype.slice.call(els.list.querySelectorAll('.nb-item'));
      var i = items.indexOf(document.activeElement);
      if (i === -1) return;
      e.preventDefault();
      var nx = items[i + (e.key === 'ArrowDown' ? 1 : -1)];
      if (nx) nx.focus(); else if (e.key === 'ArrowUp') els.search.focus();
    });

    els.title.addEventListener('input', function () {
      var p = active();
      if (!p) return;
      p.title = this.value.slice(0, 200);
      touch(p);
      renderList();
      renderMeta(p);
      save();
    });
    els.title.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); if (rte) rte.focus(); }
    });

    rte = window.KanbanRich.mount(els.body, $('#nb-bar'), {
      onChange: function () {
        var p = active();
        if (!p) return;
        var html = rte.get();
        if (html === p.body) return;
        p.body = html.slice(0, 200000);
        touch(p);
        renderList();
        renderMeta(p);
        save();
      },
      onPasteImages: function () { host.toast('The notebook holds text only — attach images to a card', null); }
    });

    els.linkBtn.addEventListener('click', function () {
      linkerOpen = !linkerOpen;
      renderLinks(active());
      renderLinkerResults();
      if (linkerOpen) els.linkerInput.focus();
    });
    els.linkerInput.addEventListener('input', renderLinkerResults);
    els.linkerInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var first = els.linkerList.querySelector('[data-nb-link]');
        if (first) { e.preventDefault(); linkCard(first.getAttribute('data-nb-link')); }
      }
    });
    els.linkerList.addEventListener('click', function (e) {
      var b = e.target.closest('[data-nb-link]');
      if (b) linkCard(b.getAttribute('data-nb-link'));
    });
    els.chips.addEventListener('click', function (e) {
      var x = e.target.closest('[data-nb-unlink]');
      if (x) { unlinkCard(x.getAttribute('data-nb-unlink')); return; }
      var o = e.target.closest('[data-nb-open]');
      if (o) { var id = o.getAttribute('data-nb-open'); closeSheet(); host.openCard(id); }
    });

    // sheet-local shortcuts
    els.sheet.addEventListener('keydown', function (e) {
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        var k = e.key.toLowerCase();
        if (k === 'n') { e.preventDefault(); newPage(true); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); step(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
        else if (k === 'p') { e.preventDefault(); togglePin(); }
        else if (k === 'e') { e.preventDefault(); if (active()) setEditing(!editing); }
      }
    });

    // keep "edited 3 min ago" honest while the sheet stays open
    setInterval(function () { if (open) { var p = active(); if (p) renderMeta(p); renderList(); } }, 60000);

    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', function () { if (document.hidden) flush(); });
  }

  function init(h) {
    host = h;
    els.sheet = $('#notebook');
    if (!els.sheet || !window.KanbanRich) return;
    els.scrim = $('#nb-scrim');
    els.list = $('#nb-list');
    els.search = $('#nb-search');
    els.main = $('#nb-main');
    els.empty = $('#nb-empty');
    els.title = $('#nb-title');
    els.body = $('#nb-body');
    els.pin = $('#nb-pin');
    els.edit = $('#nb-edit');
    els.editLabel = $('#nb-edit-label');
    els.chips = $('#nb-chips');
    els.linkBtn = $('#nb-link-btn');
    els.linker = $('#nb-linker');
    els.linkerInput = $('#nb-linker-input');
    els.linkerList = $('#nb-linker-list');
    els.meta = $('#nb-meta');
    bind();
  }

  // the board was replaced from outside (undo, import, restore) — repaint if showing
  function refresh() {
    if (!open) return;
    if (!pageById(nb().activeId)) {
      var n = sortedPages()[0];
      nb().activeId = n ? n.id : null;
    }
    renderAll();
  }

  window.KanbanNotebook = {
    init: init,
    toggle: toggle,
    open: openSheet,
    close: closeSheet,
    openPage: openPage,
    escape: escape,
    refresh: refresh,
    isOpen: function () { return open; },
    focusSearch: function () { if (open) { els.search.focus(); els.search.select(); } }
  };
})();
