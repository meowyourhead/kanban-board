/* Date & time pickers.
 *
 * Replaces the browser's <input type="date"> / <input type="time"> UI (which follows the Windows
 * region settings and so shows 24-hour clocks) with a themed button + popover:
 *   - date: month grid (Monday first), Today / Clear, honours the input's `min`
 *   - time: typed entry plus hour / minute / AM-PM columns, always 12-hour
 *
 * The native inputs stay in the DOM (hidden) and remain the source of truth: the app keeps reading
 * `.value` ("YYYY-MM-DD" / "HH:MM", 24-hour, unchanged file format) and listening for `change`.
 * Programmatic writes to value / min / disabled are wrapped so the visible button stays in sync.
 */
(function () {
  'use strict';

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var MON3 = MONTHS.map(function (m) { return m.slice(0, 3); });
  var DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var DOW_FULL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  var ICON_CAL = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="3.5" width="11" height="10" rx="2"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3"/></svg>';
  var ICON_CLOCK = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="5.8"/><path d="M8 4.6V8l2.3 1.4"/></svg>';
  var ICON_PREV = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3L5 8l5 5"/></svg>';
  var ICON_NEXT = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3l5 5-5 5"/></svg>';

  var valueDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  var minDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'min');
  var disabledDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'disabled');

  var open = null; // { input, kind, pop, btn, close() }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); }
  function today() { var n = new Date(); return ymd(n.getFullYear(), n.getMonth(), n.getDate()); }
  function parseYmd(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null;
  }
  function dateLabel(s) {
    var p = parseYmd(s);
    if (!p) return '';
    var dow = DOW_FULL[new Date(p.y, p.m, p.d).getDay()];
    return dow + ', ' + p.d + ' ' + MON3[p.m] + ' ' + p.y;
  }
  function shortDate(s) {
    var p = parseYmd(s);
    return p ? p.d + ' ' + MON3[p.m] + ' ' + p.y : '';
  }
  function parseHm(s) {
    var m = /^(\d{1,2}):(\d{2})/.exec(s || '');
    if (!m) return null;
    var h = +m[1], mi = +m[2];
    return h > 23 || mi > 59 ? null : { h: h, m: mi };
  }
  function to12(h) { return h % 12 === 0 ? 12 : h % 12; }
  function timeLabel(s) {
    var t = parseHm(s);
    return t ? to12(t.h) + ':' + pad(t.m) + ' ' + (t.h >= 12 ? 'PM' : 'AM') : '';
  }
  function to24(h12, mer) { return (h12 % 12) + (mer === 'PM' ? 12 : 0); }

  // "9", "930", "9:30", "9:30 pm", "930p", "21:15" -> { h, m } (24-hour) or null
  function parseTyped(txt, fallbackMer) {
    var s = String(txt || '').trim().toLowerCase().replace(/\./g, '');
    var m = /^(\d{1,2})(?::?(\d{2}))?\s*([ap])?m?$/.exec(s);
    if (!m) return null;
    var h = +m[1], mi = m[2] ? +m[2] : 0, mer = m[3] ? (m[3] === 'p' ? 'PM' : 'AM') : null;
    if (mi > 59) return null;
    if (mer) { if (h < 1 || h > 12) return null; return { h: to24(h, mer), m: mi }; }
    if (h > 23) return null;
    if (h >= 13 || h === 0 || String(m[1]).length === 2 && m[1][0] === '0') return { h: h, m: mi }; // clearly 24-hour
    return { h: to24(h, fallbackMer || 'AM'), m: mi };
  }

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  // ---------- field enhancement ----------
  function enhance(input) {
    if (!input || input.__pk) return;
    var kind = input.type === 'time' ? 'time' : 'date';
    input.__pk = kind;
    // The visible control is a read-only text input, so every theme's own input styling applies to it.
    var wrapEl = el('span', 'pk-wrap pk-wrap-' + kind);
    var ico = el('span', 'pk-ico', kind === 'time' ? ICON_CLOCK : ICON_CAL);
    var btn = el('input', 'pk-field pk-' + kind);
    btn.type = 'text';
    btn.readOnly = true;
    btn.autocomplete = 'off';
    btn.setAttribute('role', 'combobox');
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('aria-expanded', 'false');
    var label = input.getAttribute('aria-label') || (kind === 'time' ? 'Time' : 'Date');
    input.classList.add('pk-native');
    input.tabIndex = -1;
    input.setAttribute('aria-hidden', 'true');
    wrapEl.appendChild(ico); wrapEl.appendChild(btn);
    input.parentNode.insertBefore(wrapEl, input.nextSibling);

    function refresh() {
      var v = valueDesc.get.call(input);
      var txt = kind === 'time' ? timeLabel(v) : shortDate(v);
      btn.value = txt;
      btn.placeholder = kind === 'time' ? 'Add time' : 'No date';
      btn.setAttribute('aria-label', label + ': ' + (txt || 'not set'));
      var off = disabledDesc.get.call(input);
      btn.disabled = off;
      wrapEl.classList.toggle('disabled', off);
    }
    Object.defineProperty(input, 'value', {
      configurable: true,
      get: function () { return valueDesc.get.call(this); },
      set: function (v) { valueDesc.set.call(this, v); refresh(); if (open && open.input === this) open.sync(); }
    });
    Object.defineProperty(input, 'min', {
      configurable: true,
      get: function () { return minDesc.get.call(this); },
      set: function (v) { minDesc.set.call(this, v); if (open && open.input === this) open.sync(); }
    });
    Object.defineProperty(input, 'disabled', {
      configurable: true,
      get: function () { return disabledDesc.get.call(this); },
      set: function (v) { disabledDesc.set.call(this, v); refresh(); if (v && open && open.input === this) closePop(); }
    });
    // clicking the <label> that wraps the input should open the picker, not do nothing
    var wrap = input.closest('label');
    if (wrap) wrap.addEventListener('click', function (e) { if (e.target !== btn && !wrapEl.contains(e.target)) { e.preventDefault(); btn.focus(); toggle(); } });

    function toggle() {
      if (btn.disabled) return;
      if (open && open.btn === btn) { closePop(); return; }
      openPop(input, kind, btn);
    }
    btn.addEventListener('click', function (e) { e.preventDefault(); toggle(); });
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); if (!(open && open.btn === btn)) toggle(); }
      else if ((e.key === 'Backspace' || e.key === 'Delete') && !btn.disabled) { e.preventDefault(); commit(input, ''); }
    });
    ico.addEventListener('click', toggle);
    refresh();
  }

  function commit(input, value) {
    valueDesc.set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    // re-run the wrapper so the visible label refreshes even if the app ignored the change
    input.value = valueDesc.get.call(input);
  }

  // ---------- popover shell ----------
  function closePop(restoreFocus) {
    if (!open) return;
    var o = open;
    open = null;
    document.removeEventListener('mousedown', onDocDown, true);
    document.removeEventListener('keydown', onDocKey, true);
    window.removeEventListener('resize', closeOnResize);
    window.removeEventListener('scroll', closeOnScroll, true);
    if (o.pop.parentNode) o.pop.parentNode.removeChild(o.pop);
    o.btn.setAttribute('aria-expanded', 'false');
    o.btn.classList.remove('open');
    if (restoreFocus !== false) { try { o.btn.focus({ preventScroll: true }); } catch (e) {} }
  }
  function onDocDown(e) {
    if (!open) return;
    if (open.pop.contains(e.target) || open.btn.contains(e.target)) return;
    closePop(false);
  }
  function onDocKey(e) {
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePop(); }
  }
  function closeOnResize() { closePop(false); }
  function closeOnScroll(e) { if (open && !open.pop.contains(e.target)) closePop(false); }

  function place(pop, btn) {
    var r = btn.getBoundingClientRect();
    pop.style.visibility = 'hidden';
    pop.style.left = '0px'; pop.style.top = '0px';
    var w = pop.offsetWidth, h = pop.offsetHeight;
    var vw = window.innerWidth, vh = window.innerHeight;
    var left = Math.max(8, Math.min(r.left, vw - w - 8));
    var top = r.bottom + 6;
    if (top + h > vh - 8) top = Math.max(8, r.top - h - 6);
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
    pop.style.visibility = '';
  }

  function openPop(input, kind, btn) {
    closePop(false);
    var pop = el('div', 'pk-pop pk-pop-' + kind);
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', kind === 'time' ? 'Choose a time' : 'Choose a date');
    document.body.appendChild(pop);
    btn.setAttribute('aria-expanded', 'true');
    btn.classList.add('open');
    var api = { input: input, kind: kind, pop: pop, btn: btn, sync: function () {} };
    open = api;
    if (kind === 'date') buildDate(api); else buildTime(api);
    place(pop, btn);
    document.addEventListener('mousedown', onDocDown, true);
    document.addEventListener('keydown', onDocKey, true);
    window.addEventListener('resize', closeOnResize);
    window.addEventListener('scroll', closeOnScroll, true);
  }

  // ---------- date popover ----------
  function buildDate(api) {
    var input = api.input, pop = api.pop;
    var cur = parseYmd(valueDesc.get.call(input)) || parseYmd(today());
    var view = { y: cur.y, m: cur.m };
    var focusDay = ymd(cur.y, cur.m, cur.d);

    function minVal() { return minDesc.get.call(input) || ''; }

    function draw(keepFocus) {
      var sel = valueDesc.get.call(input), min = minVal(), t = today();
      var first = new Date(view.y, view.m, 1);
      var offset = (first.getDay() + 6) % 7; // Monday first
      var dim = new Date(view.y, view.m + 1, 0).getDate();
      var html = '<div class="pk-head">' +
        '<button type="button" class="pk-nav" data-nav="-12" aria-label="Previous year" title="Previous year">«</button>' +
        '<button type="button" class="pk-nav" data-nav="-1" aria-label="Previous month" title="Previous month">' + ICON_PREV + '</button>' +
        '<div class="pk-title" aria-live="polite">' + MONTHS[view.m] + ' ' + view.y + '</div>' +
        '<button type="button" class="pk-nav" data-nav="1" aria-label="Next month" title="Next month">' + ICON_NEXT + '</button>' +
        '<button type="button" class="pk-nav" data-nav="12" aria-label="Next year" title="Next year">»</button></div>';
      html += '<div class="pk-dow">' + DOW.map(function (d) { return '<span>' + d + '</span>'; }).join('') + '</div><div class="pk-grid" role="grid">';
      for (var i = 0; i < 42; i++) {
        var d = new Date(view.y, view.m, 1 - offset + i);
        var s = ymd(d.getFullYear(), d.getMonth(), d.getDate());
        var out = d.getMonth() !== view.m;
        var dis = !!min && s < min;
        var cls = 'pk-day' + (out ? ' out' : '') + (s === t ? ' today' : '') + (s === sel ? ' sel' : '') + (dis ? ' dis' : '') + ((d.getDay() === 0 || d.getDay() === 6) ? ' we' : '');
        html += '<button type="button" class="' + cls + '" data-d="' + s + '" tabindex="' + (s === focusDay ? 0 : -1) + '"' + (dis ? ' disabled' : '') +
          ' aria-label="' + dateLabel(s) + '"' + (s === sel ? ' aria-pressed="true"' : '') + '>' + d.getDate() + '</button>';
      }
      html += '</div><div class="pk-foot"><button type="button" class="pk-link" data-act="today"' + (min && t < min ? ' disabled' : '') + '>Today</button>' +
        '<span class="pk-sel">' + (sel ? dateLabel(sel) : 'No date') + '</span>' +
        '<button type="button" class="pk-link" data-act="clear">Clear</button></div>';
      pop.innerHTML = html;
      if (keepFocus) { var f = pop.querySelector('.pk-day[tabindex="0"]'); if (f) f.focus(); }
    }
    api.sync = function () { draw(false); };
    draw(false);

    function moveView(n) { var d = new Date(view.y, view.m + n, 1); view.y = d.getFullYear(); view.m = d.getMonth(); }
    function pick(s) { commit(input, s); closePop(); }

    pop.addEventListener('click', function (e) {
      var nav = e.target.closest('[data-nav]');
      if (nav) { moveView(+nav.getAttribute('data-nav')); draw(false); return; }
      var day = e.target.closest('[data-d]');
      if (day && !day.disabled) { pick(day.getAttribute('data-d')); return; }
      var act = e.target.closest('[data-act]');
      if (!act || act.disabled) return;
      if (act.getAttribute('data-act') === 'today') pick(today());
      else { commit(input, ''); closePop(); }
    });
    pop.addEventListener('keydown', function (e) {
      var day = e.target.closest && e.target.closest('.pk-day');
      if (!day) return;
      var step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
      if (step == null && e.key !== 'PageUp' && e.key !== 'PageDown') return;
      e.preventDefault();
      var p = parseYmd(day.getAttribute('data-d'));
      var d = step != null ? new Date(p.y, p.m, p.d + step) : new Date(p.y, p.m + (e.key === 'PageUp' ? -1 : 1), p.d);
      focusDay = ymd(d.getFullYear(), d.getMonth(), d.getDate());
      view.y = d.getFullYear(); view.m = d.getMonth();
      draw(true);
    });
    setTimeout(function () { var f = pop.querySelector('.pk-day.sel') || pop.querySelector('.pk-day.today') || pop.querySelector('.pk-day[tabindex="0"]'); if (f && open === api) f.focus({ preventScroll: true }); }, 0);
  }

  // ---------- time popover ----------
  function buildTime(api) {
    var input = api.input, pop = api.pop;
    var t0 = parseHm(valueDesc.get.call(input));
    var draft = t0 ? { h12: to12(t0.h), m: t0.m, mer: t0.h >= 12 ? 'PM' : 'AM' } : { h12: 9, m: 0, mer: 'AM', blank: true };
    var minHm = '';

    function draftHm() { return pad(to24(draft.h12, draft.mer)) + ':' + pad(draft.m); }
    function draftText() { return draft.h12 + ':' + pad(draft.m) + ' ' + draft.mer; }

    pop.innerHTML =
      '<div class="pk-time-top"><input class="pk-time-input" type="text" inputmode="text" autocomplete="off" spellcheck="false" aria-label="Type a time, for example 2:30 pm" placeholder="e.g. 2:30 pm">' +
      '<div class="pk-mer" role="group" aria-label="AM or PM"><button type="button" data-mer="AM">AM</button><button type="button" data-mer="PM">PM</button></div></div>' +
      '<div class="pk-cols"><div class="pk-col pk-hours" role="listbox" aria-label="Hour"></div><div class="pk-col pk-mins" role="listbox" aria-label="Minute"></div></div>' +
      '<div class="pk-msg" role="alert" hidden></div>' +
      '<div class="pk-foot"><button type="button" class="pk-link" data-act="clear">Clear</button><button type="button" class="pk-link" data-act="now">Now</button>' +
      '<button type="button" class="pk-ok" data-act="ok">Set time</button></div>';
    var typed = pop.querySelector('.pk-time-input');
    var hoursBox = pop.querySelector('.pk-hours'), minsBox = pop.querySelector('.pk-mins'), msg = pop.querySelector('.pk-msg');

    function showMsg(t) { msg.textContent = t || ''; msg.hidden = !t; }

    function drawCols(scroll) {
      var h = '';
      for (var i = 1; i <= 12; i++) h += '<button type="button" role="option" class="pk-opt' + (draft.h12 === i ? ' sel' : '') + '" data-h="' + i + '" aria-selected="' + (draft.h12 === i) + '">' + i + '</button>';
      hoursBox.innerHTML = h;
      var mins = [];
      for (var m = 0; m < 60; m += 5) mins.push(m);
      if (mins.indexOf(draft.m) === -1) { mins.push(draft.m); mins.sort(function (a, b) { return a - b; }); }
      minsBox.innerHTML = mins.map(function (m) {
        return '<button type="button" role="option" class="pk-opt' + (draft.m === m ? ' sel' : '') + '" data-m="' + m + '" aria-selected="' + (draft.m === m) + '">' + pad(m) + '</button>';
      }).join('');
      Array.prototype.forEach.call(pop.querySelectorAll('.pk-mer button'), function (b) {
        var on = b.getAttribute('data-mer') === draft.mer;
        b.classList.toggle('sel', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      if (scroll) [hoursBox, minsBox].forEach(function (c) {
        var s = c.querySelector('.sel');
        if (s) c.scrollTop = s.offsetTop - c.clientHeight / 2 + s.offsetHeight / 2;
      });
    }
    function drawTyped() { if (document.activeElement !== typed) typed.value = draft.blank ? '' : draftText(); }

    api.sync = function () { minHm = minDesc.get.call(input) || ''; };
    api.sync();
    drawCols(false); drawTyped();
    // scroll the selected hour/minute into view once the popover has a layout
    setTimeout(function () { if (open === api) { drawCols(true); typed.focus({ preventScroll: true }); typed.select(); } }, 0);

    function apply() {
      var hm = draftHm();
      if (minHm && hm <= minHm) { showMsg('End time must be after ' + timeLabel(minHm) + '.'); return; }
      commit(input, hm);
      closePop();
    }

    pop.addEventListener('click', function (e) {
      var h = e.target.closest('[data-h]'), m = e.target.closest('[data-m]'), mer = e.target.closest('[data-mer]'), act = e.target.closest('[data-act]');
      if (h) { draft.h12 = +h.getAttribute('data-h'); draft.blank = false; }
      else if (m) { draft.m = +m.getAttribute('data-m'); draft.blank = false; }
      else if (mer) { draft.mer = mer.getAttribute('data-mer'); draft.blank = false; }
      else if (act) {
        var a = act.getAttribute('data-act');
        if (a === 'ok') { apply(); return; }
        if (a === 'clear') { commit(input, ''); closePop(); return; }
        if (a === 'now') {
          var n = new Date(); draft.h12 = to12(n.getHours()); draft.mer = n.getHours() >= 12 ? 'PM' : 'AM';
          draft.m = Math.round(n.getMinutes() / 5) * 5; if (draft.m === 60) { draft.m = 55; }
          draft.blank = false;
        }
      } else return;
      showMsg(''); drawCols(!!h || !!m || (act && act.getAttribute('data-act') === 'now')); drawTyped();
    });
    typed.addEventListener('input', function () {
      var p = parseTyped(typed.value, draft.mer);
      if (!p) return;
      draft.h12 = to12(p.h); draft.m = p.m; draft.mer = p.h >= 12 ? 'PM' : 'AM'; draft.blank = false;
      showMsg(''); drawCols(true);
    });
    typed.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var p = parseTyped(typed.value, draft.mer);
        if (typed.value.trim() && !p) { showMsg('Try a time like 2:30 pm or 14:30.'); return; }
        if (p) { draft.h12 = to12(p.h); draft.m = p.m; draft.mer = p.h >= 12 ? 'PM' : 'AM'; draft.blank = false; }
        apply();
      }
    });
    typed.addEventListener('blur', function () { drawTyped(); });
  }

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll('input[type="date"], input[type="time"]'), enhance);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.KanbanPicker = { enhance: enhance, close: closePop, timeLabel: timeLabel, dateLabel: dateLabel };
})();
