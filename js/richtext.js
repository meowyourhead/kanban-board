/*
 * richtext.js — a small, dependency-free rich-text editor for card notes.
 *
 * Stores clean HTML (allow-listed tags, no attributes). Supports bold, italic, underline,
 * strikethrough, heading, bullet / numbered lists, highlight and "clear formatting",
 * plus Markdown-style shortcuts ("- ", "1. ", "# ") and Ctrl/Cmd+B/I/U.
 */
(function (root, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') module.exports = factory();
  else root.KanbanRich = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAP = {
    b: 'b', strong: 'b', i: 'i', em: 'i', u: 'u', s: 's', strike: 's', del: 's',
    mark: 'mark', ul: 'ul', ol: 'ol', li: 'li', p: 'p', div: 'p',
    h1: 'h3', h2: 'h3', h3: 'h3', h4: 'h3', h5: 'h3', h6: 'h3', br: 'br'
  };
  var BLOCK = { p: 1, h3: 1, ul: 1, ol: 1 };
  var DROP = { script: 1, style: 1, iframe: 1, object: 1, embed: 1, template: 1, noscript: 1, svg: 1, head: 1 };

  function escText(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function isHTML(s) { return /^\s*<(p|h3|ul|ol)[\s>]/i.test(s); }

  // legacy plain-text notes -> paragraphs
  function fromPlain(text) {
    var t = String(text || '');
    if (!t.trim()) return '';
    return t.split(/\n{2,}/).map(function (para) {
      return '<p>' + escText(para).replace(/\n/g, '<br>') + '</p>';
    }).join('');
  }

  function sanitize(input, doc) {
    var html = String(input == null ? '' : input);
    if (!html.trim()) return '';
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return escText(html);
    var src = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html').body;
    var out = doc.implementation.createHTMLDocument('').body;
    var cur = null; // open <p> collecting loose inline content

    function closeP() {
      if (cur) {
        if (!cur.textContent.trim() && !cur.querySelector('br')) { /* empty */ }
        cur = null;
      }
    }
    function target(parent) {
      if (parent !== out) return parent;
      if (!cur) { cur = out.ownerDocument.createElement('p'); out.appendChild(cur); }
      return cur;
    }

    function walk(node, parent) {
      for (var n = node.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 3) {
          if (parent === out && !n.nodeValue.trim() && !cur) continue;
          target(parent).appendChild(out.ownerDocument.createTextNode(n.nodeValue.replace(/ /g, ' ')));
          continue;
        }
        if (n.nodeType !== 1) continue;
        var tag = n.tagName.toLowerCase();
        if (DROP[tag]) continue;
        // pasted styling from other editors (Word, web) -> semantic tags
        var st = (n.getAttribute('style') || '').toLowerCase();
        var wrap = [];
        if (tag === 'span' || tag === 'font') {
          if (/font-weight:\s*(bold|[6-9]00)/.test(st)) wrap.push('b');
          if (/font-style:\s*italic/.test(st)) wrap.push('i');
          if (/text-decoration[^;]*underline/.test(st)) wrap.push('u');
          if (/text-decoration[^;]*line-through/.test(st)) wrap.push('s');
          if (/background(-color)?:\s*(?!transparent|none|rgb\(255,\s*255,\s*255\)|#fff)/.test(st)) wrap.push('mark');
        }
        var t = MAP[tag];
        if (!t) {
          var holder = parent;
          var made = [];
          wrap.forEach(function (w) {
            var el = out.ownerDocument.createElement(w);
            target(holder).appendChild(el);
            holder = el; made.push(el);
          });
          walk(n, holder);
          continue;
        }
        if (t === 'br') { target(parent).appendChild(out.ownerDocument.createElement('br')); continue; }
        if (BLOCK[t]) {
          if (parent !== out) { // block inside li / inline: flatten
            if (t === 'ul' || t === 'ol') {
              var inner = out.ownerDocument.createElement(t);
              parent.appendChild(inner);
              walk(n, inner);
            } else {
              walk(n, parent);
              if (parent.lastChild && parent.lastChild.nodeName !== 'BR') parent.appendChild(out.ownerDocument.createElement('br'));
            }
            continue;
          }
          closeP();
          var blk = out.ownerDocument.createElement(t);
          out.appendChild(blk);
          walk(n, blk);
          if (!blk.textContent.trim() && !blk.querySelector('br,li')) out.removeChild(blk);
          continue;
        }
        if (t === 'li') {
          if (parent.nodeName !== 'UL' && parent.nodeName !== 'OL') { // stray li
            closeP();
            var ul = out.lastChild && out.lastChild.nodeName === 'UL' && !cur ? out.lastChild : out.appendChild(out.ownerDocument.createElement('ul'));
            var li0 = out.ownerDocument.createElement('li');
            ul.appendChild(li0);
            walk(n, li0);
            continue;
          }
          var li = out.ownerDocument.createElement('li');
          parent.appendChild(li);
          walk(n, li);
          continue;
        }
        // inline formatting
        var el2 = out.ownerDocument.createElement(t);
        target(parent).appendChild(el2);
        walk(n, el2);
        if (!el2.textContent && !el2.querySelector('br')) el2.parentNode.removeChild(el2);
      }
    }
    walk(src, out);

    // tidy: drop empty lists/items, trim trailing empty paragraphs
    Array.prototype.slice.call(out.querySelectorAll('li')).forEach(function (li) {
      if (!li.textContent.trim() && !li.querySelector('ul,ol')) li.parentNode.removeChild(li);
    });
    Array.prototype.slice.call(out.querySelectorAll('ul,ol')).forEach(function (l) {
      if (!l.children.length) l.parentNode.removeChild(l);
    });
    while (out.lastChild && out.lastChild.nodeName === 'P' && !out.lastChild.textContent.trim()) out.removeChild(out.lastChild);
    return out.innerHTML;
  }

  /** Convert whatever is stored (legacy text or html) to editor html. */
  function toEditorHTML(stored, doc) {
    var s = String(stored || '');
    if (!s.trim()) return '';
    return isHTML(s) ? sanitize(s, doc) : fromPlain(s);
  }

  // ---------------------------------------------------------------- editor
  var BUTTONS = [
    { cmd: 'bold', label: 'B', title: 'Bold (Ctrl+B)', cls: 'b' },
    { cmd: 'italic', label: 'I', title: 'Italic (Ctrl+I)', cls: 'i' },
    { cmd: 'underline', label: 'U', title: 'Underline (Ctrl+U)', cls: 'u' },
    { cmd: 'strikeThrough', label: 'S', title: 'Strikethrough', cls: 's' },
    { sep: true },
    { cmd: 'heading', label: 'H', title: 'Heading', cls: 'h' },
    { cmd: 'insertUnorderedList', title: 'Bulleted list',
      svg: '<path d="M6 4.5h7M6 8h7M6 11.5h7"/><circle cx="3" cy="4.5" r=".6" fill="currentColor"/><circle cx="3" cy="8" r=".6" fill="currentColor"/><circle cx="3" cy="11.5" r=".6" fill="currentColor"/>' },
    { cmd: 'insertOrderedList', title: 'Numbered list',
      svg: '<path d="M7 4.5h6M7 8h6M7 11.5h6"/><path d="M2.5 3.5l1-.6v3M2.3 9.6c0-1 1.6-.9 1.6 0 0 .6-1.6 1.3-1.6 1.9h1.7" stroke-width="1"/>' },
    { sep: true },
    { cmd: 'highlight', title: 'Highlight',
      svg: '<path d="M9.5 3l3.5 3.5-5.5 5.5H4V8.5z"/><path d="M3 14h10"/>' },
    { cmd: 'removeFormat', title: 'Clear formatting',
      svg: '<path d="M3.5 3.5h9M8 3.5l-2 9M5.5 12.5h5"/><path d="M11 9.5l3 3M14 9.5l-3 3"/>' }
  ];

  function mount(body, bar, opts) {
    opts = opts || {};
    var doc = body.ownerDocument;
    var buttons = {};

    try { doc.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) {}

    BUTTONS.forEach(function (b) {
      if (b.sep) {
        var sp = doc.createElement('span'); sp.className = 'rte-sep'; sp.setAttribute('aria-hidden', 'true');
        bar.appendChild(sp); return;
      }
      var btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'rte-btn' + (b.cls ? ' rte-' + b.cls : '');
      btn.title = b.title;
      btn.setAttribute('aria-label', b.title);
      btn.setAttribute('data-cmd', b.cmd);
      btn.tabIndex = -1;
      btn.innerHTML = b.svg
        ? '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + b.svg + '</svg>'
        : '<span>' + b.label + '</span>';
      btn.addEventListener('mousedown', function (e) { e.preventDefault(); }); // keep the selection
      btn.addEventListener('click', function () { run(b.cmd); });
      bar.appendChild(btn);
      buttons[b.cmd] = btn;
    });

    function emit() { if (opts.onChange) opts.onChange(); refresh(); }

    function selectionIn() {
      var sel = doc.getSelection && doc.getSelection();
      return sel && sel.rangeCount && body.contains(sel.anchorNode) ? sel : null;
    }

    function closest(node, names) {
      for (var n = node; n && n !== body; n = n.parentNode) {
        if (n.nodeType === 1 && names.indexOf(n.nodeName) !== -1) return n;
      }
      return null;
    }

    function run(cmd) {
      body.focus();
      var sel = selectionIn();
      if (!sel) {
        var r = doc.createRange(); r.selectNodeContents(body); r.collapse(false);
        var s2 = doc.getSelection(); s2.removeAllRanges(); s2.addRange(r);
        sel = s2;
      }
      if (cmd === 'heading') {
        var inH = closest(sel.anchorNode, ['H3']);
        doc.execCommand('formatBlock', false, inH ? 'p' : 'h3');
      } else if (cmd === 'highlight') {
        var m = closest(sel.anchorNode, ['MARK']);
        if (m) {
          while (m.firstChild) m.parentNode.insertBefore(m.firstChild, m);
          m.parentNode.removeChild(m);
        } else if (!sel.isCollapsed) {
          var tmp = doc.createElement('div');
          tmp.appendChild(sel.getRangeAt(0).cloneContents());
          doc.execCommand('insertHTML', false, '<mark>' + tmp.innerHTML + '</mark>');
        }
      } else if (cmd === 'removeFormat') {
        doc.execCommand('removeFormat');
        var mk = closest(sel.anchorNode, ['MARK']);
        if (mk) { while (mk.firstChild) mk.parentNode.insertBefore(mk.firstChild, mk); mk.parentNode.removeChild(mk); }
        if (closest(sel.anchorNode, ['H3'])) doc.execCommand('formatBlock', false, 'p');
      } else {
        doc.execCommand(cmd, false, null);
      }
      emit();
    }

    function refresh() {
      var sel = selectionIn();
      Object.keys(buttons).forEach(function (cmd) {
        var on = false;
        if (sel) {
          try {
            if (cmd === 'heading') on = !!closest(sel.anchorNode, ['H3']);
            else if (cmd === 'highlight') on = !!closest(sel.anchorNode, ['MARK']);
            else if (cmd !== 'removeFormat') on = doc.queryCommandState(cmd);
          } catch (e) {}
        }
        buttons[cmd].classList.toggle('on', on);
        buttons[cmd].setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }

    // Markdown-style shortcuts, applied when the trigger text is typed at the start of a line
    body.addEventListener('beforeinput', function (e) {
      if (e.inputType !== 'insertText' || e.data !== ' ') return;
      var sel = selectionIn();
      if (!sel || !sel.isCollapsed || sel.anchorNode.nodeType !== 3) return;
      var node = sel.anchorNode;
      var before = node.nodeValue.slice(0, sel.anchorOffset);
      if (closest(node, ['LI'])) return;
      var blk = node.parentNode;
      // only when the trigger is the first text of its block
      var first = blk === body ? body.firstChild === node : blk.firstChild === node;
      if (!first) return;
      var cmd = null;
      if (before === '-' || before === '*') cmd = 'insertUnorderedList';
      else if (before === '1.') cmd = 'insertOrderedList';
      else if (before === '#') cmd = 'heading';
      if (!cmd) return;
      e.preventDefault();
      node.nodeValue = node.nodeValue.slice(sel.anchorOffset);
      var r = doc.createRange(); r.setStart(node, 0); r.collapse(true);
      var s = doc.getSelection(); s.removeAllRanges(); s.addRange(r);
      if (cmd === 'heading') doc.execCommand('formatBlock', false, 'h3');
      else doc.execCommand(cmd, false, null);
      emit();
    });

    body.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'h') {
        e.preventDefault(); run('highlight');
      }
      // Backspace at the start of an empty heading returns it to a paragraph
      if (e.key === 'Backspace') {
        var sel = selectionIn();
        var h = sel && sel.isCollapsed ? closest(sel.anchorNode, ['H3']) : null;
        if (h && sel.anchorOffset === 0 && !h.textContent) { e.preventDefault(); doc.execCommand('formatBlock', false, 'p'); emit(); }
      }
    });

    // paste: keep structure, drop everything else
    body.addEventListener('paste', function (e) {
      var cd = e.clipboardData;
      if (!cd) return;
      var pics = Array.prototype.filter.call(cd.files || [], function (f) { return /^image\//.test(f.type); });
      if (pics.length && opts.onPasteImages) { e.preventDefault(); opts.onPasteImages(pics); return; }
      e.preventDefault();
      var html = cd.getData('text/html');
      var clean = html ? sanitize(html, doc) : fromPlain(cd.getData('text/plain'));
      if (!clean) return;
      // a single paragraph pastes inline, so it doesn't split the current line
      var one = clean.match(/^<p>((?:(?!<\/?p>)[\s\S])*)<\/p>$/);
      doc.execCommand('insertHTML', false, one ? one[1] : clean);
      emit();
    });

    body.addEventListener('input', emit);
    doc.addEventListener('selectionchange', function () { if (selectionIn()) refresh(); });
    body.addEventListener('blur', function () { refresh(); });

    return {
      get: function () { return sanitize(body.innerHTML, doc); },
      set: function (stored) {
        var h = toEditorHTML(stored, doc);
        if (body.innerHTML !== h) body.innerHTML = h;
      },
      focus: function () { body.focus(); },
      refresh: refresh
    };
  }

  return { sanitize: sanitize, fromPlain: fromPlain, toEditorHTML: toEditorHTML, isHTML: isHTML, mount: mount };
});
