use crate::storage::Loaded;

/// JavaScript injected before the page starts. It gives the unchanged frontend the same
/// `window.kanbanDisk` API the Electron preload used, but talks to this process over the
/// `kanban://` protocol instead of IPC. Saves are optimistic and synchronous (the page expects
/// `{ ok }` immediately); a failed write is reported on the next save, which drives the page's
/// existing retry path.
pub fn init_script(data_dir: &str, loaded: Option<&Loaded>, app_info: &str) -> String {
    let folder = serde_json::to_string(data_dir).unwrap_or_else(|_| "\"\"".to_string());
    let last = match loaded {
        Some(l) => format!(
            "{{\"savedAt\":{},\"board\":{}}}",
            l.saved_at,
            serde_json::to_string(&l.board).unwrap_or_else(|_| "null".to_string())
        ),
        None => "null".to_string(),
    };

    let script = r#"(function () {
  if (window.kanbanDisk) return;
  var FOLDER = __FOLDER__;
  var LAST = __LAST__;
  var failing = false;

  function post(url, body) {
    return fetch(url, { method: 'POST', body: body }).then(function (r) {
      return !!r.ok;
    }, function () { return false; });
  }

  var api = {
    folder: FOLDER,
    save: function (json, snapshot) {
      var bad = failing;
      failing = false;
      post('/__save' + (snapshot ? '?snapshot=1' : ''), String(json)).then(function (ok) {
        failing = !ok;
      });
      if (bad) return { ok: false, error: 'WRITE' };
      return { ok: true };
    },
    openFolder: function () {
      post('/__open-folder', '').catch(function () {});
    },
    images: {
      base: '/__img/',
      save: function (id, bytes) {
        return fetch('/__img/' + encodeURIComponent(String(id)), { method: 'POST', body: bytes })
          .then(function (r) { return !!r.ok; }, function () { return false; });
      },
      read: function (id) {
        return fetch('/__img/' + encodeURIComponent(String(id)))
          .then(function (r) { return r.ok ? r.arrayBuffer() : null; })
          .then(function (buf) { return buf ? new Uint8Array(buf) : null; })
          .catch(function () { return null; });
      },
      gc: function (keep) {
        return fetch('/__img-gc', { method: 'POST', body: JSON.stringify(keep || []) })
          .then(function (r) { return r.ok ? r.json() : 0; })
          .then(function (n) { return typeof n === 'number' ? n : 0; })
          .catch(function () { return 0; });
      }
    }
  };

  Object.defineProperty(window, 'kanbanDisk', {
    value: api, writable: false, configurable: false, enumerable: true
  });

  if (LAST && LAST.board) {
    try {
      Object.defineProperty(window, 'KANBAN_LAST_SESSION', {
        value: LAST, writable: false, configurable: false, enumerable: true
      });
    } catch (e) { window.KANBAN_LAST_SESSION = LAST; }
  }

  function postWindow(message) {
    if (window.ipc && window.ipc.postMessage) window.ipc.postMessage(message);
  }

  // Updates: the page can only ask; replies arrive through window.__kanbanUpdate(status).
  var info = __APP__;
  Object.defineProperty(window, 'kanbanApp', {
    value: Object.freeze({
      version: info.version,
      updates: info.updates,
      checkUpdate: function () { postWindow('update:check'); },
      installUpdate: function () { postWindow('update:install'); }
    }), writable: false, configurable: false, enumerable: true
  });

  function wireWindowFrame() {
    if (!window.ipc || !window.ipc.postMessage) return;
    document.documentElement.setAttribute('data-desktop', '1');

    var bar = document.querySelector('.topbar');
    var ignore = 'button,input,select,textarea,a,label,[role="button"],[role="switch"],[role="menuitem"],[contenteditable="true"],.search-box,.theme-wrap,.data-wrap,.win-controls';
    if (bar) {
      bar.addEventListener('pointerdown', function (e) {
        if (e.button !== 0 || !e.target || !e.target.closest) return;
        if (e.target.closest(ignore)) return;
        e.preventDefault();

        var sx = e.screenX, sy = e.screenY, dragging = false;

        function stop() {
          document.removeEventListener('pointermove', move, true);
          document.removeEventListener('pointerup', stop, true);
          document.removeEventListener('pointercancel', stop, true);
        }

        function move(ev) {
          if (!(ev.buttons & 1)) { stop(); return; }
          if (dragging) return;
          if (Math.abs(ev.screenX - sx) < 4 && Math.abs(ev.screenY - sy) < 4) return;
          dragging = true;
          stop();
          postWindow('window:drag');
        }

        document.addEventListener('pointermove', move, true);
        document.addEventListener('pointerup', stop, true);
        document.addEventListener('pointercancel', stop, true);
      });
    }

    [
      ['win-min', 'window:minimize'],
      ['win-max', 'window:maximize'],
      ['win-close', 'window:close']
    ].forEach(function (pair) {
      var el = document.getElementById(pair[0]);
      if (!el) return;
      el.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        postWindow(pair[1]);
      });
    });

    var handles = document.querySelectorAll('[data-win-resize]');
    Array.prototype.forEach.call(handles, function (el) {
      el.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        postWindow('window:resize:' + el.getAttribute('data-win-resize'));
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireWindowFrame);
  } else {
    wireWindowFrame();
  }
})();
"#;

    script
        .replace("__APP__", app_info)
        .replace("__FOLDER__", &folder)
        .replace("__LAST__", &last)
}
