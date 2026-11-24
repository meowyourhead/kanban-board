/*
 * images.js — attached pictures for cards and events.
 *
 * Pictures never live inside the board JSON (that would make every save huge); the board only holds
 * their file names. Storage:
 *   desktop app : files in <data folder>/images (through window.kanbanDisk.images)
 *   browser     : IndexedDB
 * Pictures are shrunk to at most 1920 px and stored as WebP (GIFs are kept as they are).
 */
(function () {
  'use strict';

  var MAX_DIM = 1920;
  var MAX_GIF = 8 * 1024 * 1024;
  var disk = window.kanbanDisk && window.kanbanDisk.images && window.kanbanDisk.images.base ? window.kanbanDisk.images : null;
  var urls = {};            // id -> usable src (browser: object URLs)
  var pending = {};         // id -> Promise while loading
  var dbp = null;

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  // ---------- IndexedDB (browser build) ----------
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve, reject) {
      try {
        var req = indexedDB.open('kanban-images', 1);
        req.onupgradeneeded = function () { req.result.createObjectStore('img'); };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      } catch (e) { reject(e); }
    });
    return dbp;
  }
  function tx(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (resolve, reject) {
        var t = d.transaction('img', mode);
        var r = fn(t.objectStore('img'));
        t.oncomplete = function () { resolve(r && r.result); };
        t.onerror = t.onabort = function () { reject(t.error); };
      });
    });
  }

  // ---------- read / write ----------
  function putBlob(id, blob) {
    if (disk) {
      return blob.arrayBuffer().then(function (buf) { return disk.save(id, new Uint8Array(buf)); })
        .then(function (ok) { if (!ok) throw new Error('save failed'); });
    }
    return tx('readwrite', function (s) { return s.put({ blob: blob, t: Date.now() }, id); }).then(function () {
      urls[id] = URL.createObjectURL(blob);
    });
  }

  function readBlob(id) {
    var ext = (id.split('.').pop() || '').toLowerCase();
    var type = { webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif' }[ext] || 'application/octet-stream';
    if (disk) {
      return disk.read(id).then(function (bytes) { return bytes ? new Blob([bytes], { type: type }) : null; });
    }
    return tx('readonly', function (s) { return s.get(id); }).then(function (rec) { return rec ? rec.blob : null; });
  }

  // synchronous src if known
  function url(id) {
    if (disk) return disk.base + encodeURIComponent(id);
    return urls[id] || null;
  }

  function load(id) {
    if (url(id)) return Promise.resolve(url(id));
    if (pending[id]) return pending[id];
    pending[id] = readBlob(id).then(function (b) {
      delete pending[id];
      if (!b) return null;
      urls[id] = URL.createObjectURL(b);
      return urls[id];
    }).catch(function () { delete pending[id]; return null; });
    return pending[id];
  }

  // fill every <img data-img="id"> under root
  function hydrate(root) {
    var list = root.querySelectorAll('img[data-img]');
    Array.prototype.forEach.call(list, function (img) {
      var id = img.getAttribute('data-img');
      var u = url(id);
      if (u) { if (img.getAttribute('src') !== u) img.src = u; return; }
      load(id).then(function (src) {
        if (src && img.isConnected && img.getAttribute('data-img') === id) img.src = src;
        else if (!src && img.isConnected) img.classList.add('missing');
      });
    });
  }

  // ---------- turning a picked file into a stored picture ----------
  function decode(file) {
    return new Promise(function (resolve, reject) {
      var u = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(u); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(u); reject(new Error('unsupported')); };
      img.src = u;
    });
  }

  function canvasBlob(canvas, type, q) {
    return new Promise(function (resolve) { canvas.toBlob(resolve, type, q); });
  }

  // -> { blob, ext }
  function process(file) {
    if (!file || !/^image\//.test(file.type || '')) return Promise.reject(new Error('not an image'));
    if (file.type === 'image/gif' && file.size <= MAX_GIF) return Promise.resolve({ blob: file, ext: 'gif' });
    return decode(file).then(function (img) {
      var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      if (!w || !h) throw new Error('empty image');
      var k = Math.min(1, MAX_DIM / Math.max(w, h));
      var c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * k));
      c.height = Math.max(1, Math.round(h * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return canvasBlob(c, 'image/webp', 0.86).then(function (b) {
        if (b && b.type === 'image/webp') return { blob: b, ext: 'webp' };
        return canvasBlob(c, 'image/jpeg', 0.88).then(function (j) { return { blob: j, ext: 'jpg' }; });
      });
    });
  }

  function add(file) {
    return process(file).then(function (r) {
      var id = uid() + '.' + r.ext;
      return putBlob(id, r.blob).then(function () { return id; });
    });
  }

  // ---------- housekeeping ----------
  function gc(keep) {
    if (!keep || !keep.length) return Promise.resolve(0);
    if (disk) return disk.gc(keep);
    var ok = {};
    keep.forEach(function (k) { ok[k] = 1; });
    var week = 7 * 24 * 3600 * 1000;
    return db().then(function (d) {
      return new Promise(function (resolve) {
        var t = d.transaction('img', 'readwrite');
        var s = t.objectStore('img');
        var n = 0;
        s.openCursor().onsuccess = function (e) {
          var cur = e.target.result;
          if (!cur) return;
          if (!ok[cur.key] && Date.now() - ((cur.value && cur.value.t) || 0) > week) { cur.delete(); n++; }
          cur.continue();
        };
        t.oncomplete = function () { resolve(n); };
        t.onerror = t.onabort = function () { resolve(0); };
      });
    }).catch(function () { return 0; });
  }

  function blobToDataURL(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
      r.readAsDataURL(blob);
    });
  }

  // for export: { id: dataURL }
  function exportMap(ids) {
    var out = {};
    return Promise.all(ids.map(function (id) {
      return readBlob(id).then(function (b) { return b ? blobToDataURL(b) : null; }).then(function (d) { if (d) out[id] = d; }).catch(function () {});
    })).then(function () { return out; });
  }

  // for import: store { id: dataURL }
  function importMap(map) {
    var ids = Object.keys(map || {}).filter(function (id) { return /^[A-Za-z0-9_-]+\.(webp|jpg|png|gif)$/.test(id) && /^data:image\//.test(map[id]); });
    return Promise.all(ids.map(function (id) {
      return fetch(map[id]).then(function (r) { return r.blob(); }).then(function (b) { return putBlob(id, b); }).catch(function () {});
    })).then(function () { return ids.length; });
  }

  window.KanbanImages = {
    available: !!(disk || window.indexedDB),
    url: url, load: load, hydrate: hydrate, add: add, gc: gc,
    exportMap: exportMap, importMap: importMap, process: process
  };
})();
