# Kanban Board — Rust build: developer notes & session handover

This file is the starting point for a new opencode session working in this folder. It records
what was built, the contracts that must not break, how to verify changes, and what is left to do.

## 1. What this folder is

A standalone Windows desktop port of the Kanban board: the **unchanged** HTML/CSS/JS frontend
from the Electron app, hosted by a small native Rust program using **tao** (window/event loop)
and **wry** (WebView2). No Node, no Electron at runtime.

- Project root: `C:\Users\Admin\Downloads\Kanban_Board_Desktop\Kanban Board - Rust`
- Original Electron app (UI source of truth, do not modify unless asked):
  `C:\Users\Admin\Downloads\Kanban_Board_Desktop\Kanban Board`
- Status (2026-10-21): release build complete; save/restore, images, close snapshots,
  single-instance, window state, data-folder opening, localStorage persistence, frameless window
  behavior, the three-tab layout (Board / Calendar / Archive), unified search and tab animations
  verified. Runtime folders may exist after local use: `Kanban Auto-Backups` can hold the user's
  **real board**, `webview-data` holds their interface preferences, and `target\` is a build
  cache. Treat those as user data, not as artifacts to wipe.

The frontend files (`index.html`, `css/`, `js/`, `vendor/`, `build/`) started as a copy of the
Electron app's and now intentionally diverge (archive view, unified search, themes, frameless
window). They are duplicated, not shared: if you change the UI in one folder, mirror the change
deliberately and test both hosts.

## 2. Quick start

```powershell
# Build (toolchain already installed; full path avoids PATH issues)
& "$env:USERPROFILE\.cargo\bin\cargo.exe" build --release
Copy-Item -Force "target\release\kanban-rust.exe" "."

# Or just run:
.\Build.cmd          # installs Rust if missing, builds, copies exe next to it
.\kanban-rust.exe    # starts the app

# Optional: add a desktop shortcut once
.\Create-Desktop-Shortcut.cmd

# Optional on switchable-graphics laptops: Windows per-app High performance GPU + shortcut
# (WebView2 GPU flags are already on by default)
.\Enable-GPU-Rendering.cmd

# Pack the project into one small zip (~300 KB) for handing off to a fresh AI with no context.
# Includes AGENTS.md, all Rust source, frontend assets, build scripts and tools; font binaries
# become vendor-manifest.txt. Output: kanban-rust-handoff.zip next to this file (overwritten).
.\Make-AI-Handoff.cmd
```

`Build.cmd` is only for building from source. End users double-click `kanban-rust.exe`;
`Create-Desktop-Shortcut.cmd` adds a desktop link to this copy (rerun it after moving the folder).

Environment on this machine: Rust 1.99.1 (stable-x86_64-pc-windows-msvc), Node v24.18.0,
WebView2 runtime 155.0.4283.62, VS 2022 Build Tools with C++ tools at
`C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools`. `link.exe` is not on PATH but
rustc finds it automatically. Building needs internet the first time (crates).

Release profile: `opt-level = "s"`, `lto = true`, `codegen-units = 1`, `strip = true`.
`Cargo.lock` is committed — keep it (reproducible builds; deps are pinned by it).

## 3. Layout and responsibilities

| Path | Purpose |
| --- | --- |
| `src/main.rs` | Startup, frameless window/webview creation, IPC window controls, protocol router, lifecycle, 15-min snapshot timer, window-state on close, logging |
| `src/storage.rs` | Board backups, mirroring the Electron `store.js` byte-for-byte semantics |
| `src/images.rs` | Attached images under `<data folder>\images` (validated ids, 40 MB cap, 7-day GC) |
| `src/bridge.rs` | Initialization script that installs `window.kanbanDisk`, `KANBAN_LAST_SESSION`, desktop marker and window-control wiring |
| `src/assets.rs` + `build.rs` | The page is compiled into the exe (sorted table); `KANBAN_DEV=1` serves the files on disk instead |
| `src/updater.rs`, `src/signing.rs` | Update check/download/verify/swap (GitHub Releases of `meowyourhead/kanban-board`) |
| `src/bin/kanban_sign.rs`, `tools/release.ps1`, `update_pubkey.txt` | Release signing (Ed25519) and publishing |
| `src/winstate.rs` | `window-state.json` (physical pixels, maximized flag, last normal bounds; kept while minimized) |
| `src/single_instance.rs` | Named Win32 mutex `KanbanBoardRustInstance` |
| `build.rs` | Finds `rc.exe`, compiles `build/icon.ico`, links it into the exe |
| `js/pixelfarm.js` | Pixel theme background: draws the seasonal farm valley on a low-res canvas (`KanbanFarm.render(active, night)`) |
| `tools/make-pixel-font.mjs` | Builds `vendor/fonts/homestead-pixel-*.ttf`, the original Pixel-theme font, from bitmaps in the script |
| `js/notebook.js` | Hidden Tab-key notebook sheet (see section 6); hosted by `app.js` via `KanbanNotebook.init(host)` |
| `index.html`, `css/`, `js/`, `vendor/`, `build/` | Frontend copied from the Electron app; `build/icon*` are the app icon assets |
| `Build.cmd` | Bootstrap rustup if needed, `cargo build --release`, copy exe |
| `Create-Desktop-Shortcut.cmd` | Creates a `Kanban` desktop shortcut to this exe |
| `Enable-GPU-Rendering.cmd` | Optional Windows per-app High performance GPU preference + shortcut (the app already requests GPU rendering) |
| `Make-AI-Handoff.cmd` | Packs the project into one small zip (`kanban-rust-handoff.zip`) for a fresh AI: context doc, all source, frontend assets, scripts; font binaries replaced by `vendor-manifest.txt` |
| `Copy-to-USB-Rust.cmd` | Portable copy incl. optional board data and the GPU preference helper |
| `README-RUST.md` | User-facing docs |
| `tools/enable-gpu-rendering.ps1` | Registry/shortcut helper used by `Enable-GPU-Rendering.cmd` |
| `tools/make-handoff.ps1` | Staging/compression logic used by `Make-AI-Handoff.cmd` (whitelist copy + vendor manifest) |
| `tools/dev-run.cmd` | Starts the exe with the CDP debug port enabled |
| `tools/cdp.mjs` | Evaluate JS / screenshot a running app over the DevTools protocol |

### Embedded page, updates and releases (2026-11-24)

- **The exe is the whole program.** `build.rs` embeds `index.html`, `css`, `js`, `vendor` and
  `build/icon.png`; a page edit needs a rebuild to show, or `tools\dev-run.cmd` (sets `KANBAN_DEV=1`).
  Not embedded: `zh-cn.ttf` (commercial HYWenHei; never commit or ship it) and unused faces. Anything not
  embedded is still read from disk beside the exe.
- **Release:** bump `version` in `Cargo.toml`, commit, push, then
  `powershell -ExecutionPolicy Bypass -File tools\release.ps1 -Publish -NotesFile <file>`. Assets must be
  named `kanban-rust.exe` and `kanban-rust.exe.sig`. The signature covers version + SHA-256. The private
  key is `%APPDATA%\Kanban Board release\signing-key.dat` (DPAPI, this Windows user only). Losing it means
  installed copies can no longer update.
- **Update flow:** menu "Check for updates" -> `update:check` -> `window.__kanbanUpdate({state})` -> confirm
  dialog -> `update:install` -> download, verify, swap (exe -> `.old`, `.new` -> exe) -> `UserEvent::Restart`
  (save, start `--after-update`, which waits up to 20 s for the old process's mutex) -> `.old` cleaned up.
- **I/O thread:** every request that touches the disk is a `Job` handled in order off the UI thread.
- **Closing:** the window hides at once, Rust calls `window.KanbanFlush()` (newest board, or null), drains the
  I/O queue, writes the final snapshot and exits; 1 s limit if the page does not answer. Page saves are
  batched (`persist()` -> `flushSave()`, 250 ms / 1 s max), so never bypass this path.
- **Keyed rendering:** `renderBoard()` reuses card and column elements whose HTML is unchanged
  (`cardEls`, `columnEls`, `placeNodes`). Code that mutates a rendered card/column must leave it in a state the
  next render can detect (see the rename/quick-add checks in `columnEl`). It only runs when Board is showing.
  `.card` and `.sp-row` use `content-visibility: auto`; notes are capped with `24lh` in CSS and only
  `.card-note.long` is measured.
- **Motion override is on by default** (only a stored `off` disables it) and `data-idle="1"` pauses decorative
  layers while the window is unfocused.

## 4. Data and file format (hard compatibility requirement)

The Rust app must keep reading and writing the same files as the Electron and browser builds.

Default data folder: `<folder containing kanban-rust.exe>\Kanban Auto-Backups`.

Resolution order (`storage::resolve_dir`):
1. First line of `data-folder.txt` next to the exe (trimmed; blank = ignore).
2. The app folder itself.
3. If neither is writable: `%APPDATA%\Kanban Auto-Backups`.

Contents:

```
kanban-backup-latest.json               current board, rewritten after every change
kanban-backup-latest.js                 window.KANBAN_LAST_SESSION = {"savedAt":<ms>,"board":<json>};
kanban-backup-YYYY-MM-DD_HH-MM-SS.json  dated copy (newest 30 kept)
README.txt                              CRLF text, same wording as the Electron version
images\<id>                             attached pictures (inside the data folder)
```

Rules ported from `store.js`:
- Valid board = JSON object with an array `columns`.
- Writes are atomic (`*.tmp` + rename; remove-and-retry if rename fails).
- Load order: `latest.json` first, then newest valid dated copy. `savedAt` is the file mtime.
- Snapshot is skipped when it is byte-identical to the newest dated copy; prune to 30.
- Dated name stamp: `%Y-%m-%d_%H-%M-%S` in local time; ids are validated, never used as paths
  without checks.
- Images: id must match `^[A-Za-z0-9_-]+\.(webp|jpg|png|gif)$`; max 40 MB; GC deletes unused
  images older than 7 days but only when the keep list is non-empty.

Other runtime files next to the exe:
- `webview-data\` — WebView2 profile: localStorage prefs (theme/view/mode/sound/cursor/graphics),
  cookies; delete to reset preferences only. Fallback when app folder is not writable:
  `%APPDATA%\webview-data`.
- `window-state.json` — size/position/maximized.
- `kanban-rust.log` — startup, load, save failures, periodic/final snapshot, panics. Release
  build has no console, so this log is the diagnostics channel.

## 5. Runtime architecture

- Page URL: `kanban://localhost/index.html`; wry rewrites it on Windows to
  `http://kanban.localhost/index.html`. This gives a real origin, so `localStorage` and `fetch`
  work (a `file://` page would not). The origin's storage lives in `webview-data`.
- Custom protocol handler routes:

| Request | Behaviour |
| --- | --- |
| `POST /__save[?snapshot=1]` | Body = board JSON text. `storage::save`; 200 on success (and stores JSON for close snapshot), 500 with JSON error otherwise |
| `POST /__open-folder` | `explorer.exe <data folder>`; 200 |
| `POST /__img/<id>` | `images::save`; 200 or 400 |
| `GET /__img/<id>` | `images::read`; 200 with MIME or 404 |
| `POST /__img-gc` | Body = JSON array of ids; returns JSON number removed |
| `GET/HEAD` static | `Kanban Auto-Backups/...` (case-insensitive) served from the data folder; `/` → `index.html`; other paths from the app folder; `__*` → 404 |
| anything else | 404 |

  Static serving percent-decodes the path, rejects `..`, `:`, backslashes and NUL, and uses
  `Cache-Control: no-store`. Images are served only for validated ids.

- `bridge::init_script` runs before the page and defines a **non-writable** `window.kanbanDisk`:
  - `folder`: data folder path (string, shown in the UI tooltip).
  - `save(json, snapshot)`: synchronous return `{ok:true}` normally. It fires `fetch('/__save…')`
    and sets a failure flag when the response is not ok; the **next** save then returns
    `{ok:false,error:'WRITE'}`, which drives the page's existing retry/toast path. This keeps the
    page's synchronous API while writes are actually async.
  - `openFolder()`, and `images`: `base:'/__img/'`, `save(id, Uint8Array) -> Promise<bool>`,
    `read(id) -> Promise<Uint8Array|null>`, `gc(keep) -> Promise<number>`.
  - `window.KANBAN_LAST_SESSION` is also defined non-writable from the newest loaded board.
    The page's `<script src="Kanban%20Auto-Backups/kanban-backup-latest.js">` then attempts to
    assign it; in a sloppy-mode classic script that assignment silently fails, so a stale
    `latest.js` can never override the authoritative `latest.json` loaded by Rust.
  - `KANBAN_LAST_SESSION` is fixed at launch, so after a page reload it is stale. `rememberLive()` in
    `app.js` (every `persist()` and `pagehide`) sets sessionStorage `kanban.live.v1` = `1` (localStorage has
    the newest board) or `disk` (it did not fit); `liveBoard()` then uses localStorage, else `latest.json`,
    and re-saves. sessionStorage dies with the process, so a fresh start still trusts the disk.
  - At `DOMContentLoaded` it sets `html[data-desktop="1"]`, shows `.win-controls` / `#win-resize`
    (hidden by default for browser hosts and while maximized), and wires the window buttons,
    topbar drag exclude list and resize strips to `window.ipc.postMessage`. The topbar ignores
    drags starting on buttons/inputs/selects/links/search/theme/data/window controls.
- Single instance via `CreateMutexW`; a second launch exits silently (it does not focus the
  first window — see backlog).
- Window icon: `src/main.rs` loads `build/icon-64.rgba` (raw RGBA, 64x64) as `tao::window::Icon`;
  `build.rs` compiles the multi-size `build/icon.ico` into the exe resource.
- The window is frameless (`WindowBuilder::with_decorations(false)`). The topbar is the drag region
  (excluding buttons/inputs/search/theme/data and the window controls). `.win-controls` supplies
  full-height 46x60 minimize/maximize/close hit areas that reach the top/right monitor edges;
  `#win-resize` supplies seven edge/corner strips. The top-right (northeast) strip is deliberately
  absent so it cannot cover the close button. While maximized, `main.rs` mirrors the state to
  `html[data-maximized="1"]`, which hides `#win-resize`, and ignores resize IPC so edge cursors
  stay normal. It also removes the native `WS_THICKFRAME` style while maximized so the OS resize
  frame cannot swallow clicks at the screen edges; the style is restored before unmaximizing or
  drag-restoring. `main.rs` installs `with_ipc_handler` and maps
  `window:minimize|maximize|close|drag|resize:*` to a `UserEvent`; the event loop calls tao
  `set_minimized`, `set_maximized`, `drag_window` and `drag_resize_window`. Use
  `EventLoopBuilder::<UserEvent>::with_user_event().build()` and keep the `EventLoopProxy` in the
  IPC closure. Custom Close reuses the existing `CloseRequested` path so the final snapshot and
  window-state save still happen.
- `src/bridge.rs` starts a topbar drag only after 4 px of pointer movement, so clicking empty
  topbar space cannot accidentally restore a maximized window. If the window is maximized when a
  drag starts, `src/main.rs` reads the cursor with `GetCursorPos`, restores the window, positions
  its saved normal size under the cursor by the horizontal ratio, then calls `drag_window()`.
  `set_maximized(false)` and `set_outer_position()` are deferred by tao, so the Drag handler first
  calls Win32 `ShowWindow(hwnd, SW_RESTORE)` synchronously; without that the move is ignored while
  the window is still maximized.
- Lifecycle: window built hidden, bounds restored (physical pixels), webview built, maximize if
  saved, show. Store `last successful board JSON` in `Arc<Mutex<Option<String>>>`. A 15-minute
  `ControlFlow::WaitUntil` tick writes a dated snapshot when the board changed. `CloseRequested`
  saves window state, writes a final snapshot from `last_json`, then exits. Do **not** use
  `Stop-Process` when testing close behaviour — it skips this handler; send `WM_CLOSE` instead.
- `MainEventsCleared` compares `window.is_maximized()` with the last value and evaluates
  `document.documentElement.setAttribute('data-maximized', ...)` when it changes. This covers
  startup, custom maximize/restore and OS-driven maximize changes; do not rely on the page
  guessing maximize state from viewport size. A `PageLoadEvent::Finished` handler sends
  `UserEvent::SyncMaximized`, so reloading the page while maximized restores the attribute.
- Navigation allowlist: `kanban://`, `http(s)://kanban.localhost`, `about:blank`. New windows are
  denied. DevTools only in debug builds.
- GPU mode is on by default on Windows: the webview always calls
  `WebViewBuilderExtWindows::with_additional_browser_args`. It must repeat wry's defaults
  (`--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection` and
  `--autoplay-policy=no-user-gesture-required`) because supplying custom args replaces them, then
  adds `--ignore-gpu-blocklist --enable-gpu-rasterization --enable-zero-copy`. The legacy
  `--force-gpu` flag is accepted but no longer needed. `--no-gpu` skips these flags for
  troubleshooting and logs that GPU mode is disabled.
  `Enable-GPU-Rendering.cmd` only writes `GpuPreference=2;` for the exe path under
  `HKCU\Software\Microsoft\DirectX\UserGpuPreferences` and creates an optional shortcut; it is
  for switchable-graphics laptops, not for activating the app's GPU flags.

## 6. Frontend contract (verified in the copied assets)

- `html[data-desktop="1"]` is set only by the Rust bridge; CSS uses it to show `.win-controls`
  and `#win-resize`. Browser hosts leave both hidden. Window controls live at the end of
  `.topbar-right`; the topbar itself is the drag surface.
- `html[data-maximized="1"]` is set by `src/main.rs` while the window is maximized; CSS hides
  `#win-resize` so top/side edges keep the page's normal cursor. Restoring removes the state.

`js/app.js` (line numbers may drift):
- ~529 `columnHTML()` no longer renders the per-list `.count` badge; list headers show only the
  name and actions. The `over-wip` column outline still uses `wipLimit`.
- Cards are content-sized: `.card-note` has no fixed 4-line clamp. `fitCardNotes()` (called from
  `renderBoard()` and after a debounced window resize) clears each note's `max-height`, reads all
  `scrollHeight`s, then sets an inline `max-height` = clamp(content, 5 lines, 24 lines) and toggles
  `.clipped` only when the text still overflows the cap. CSS keeps a 7.3em fallback. Both fitters
  skip elements with `scrollHeight === 0` (board/modal hidden) so a Calendar/Archive render does not
  pin notes to the floor; `setView('board')` refits. The card panel's
  notes editor is sized by `fitNotes()` (from `renderModal()`, `openModal()`, the RTE `onChange` and
  resize): inline `height = min(scrollHeight, 60vh)` with `overflow-y:auto` only past the cap;
  `.cm-left .rte-body` has a 60vh CSS fallback. `.card-panel` is `max-width:1085px` (868 + 25%),
  leaving a ~785px notes column at 1280x800; the right column stays 256px.
- ~728 `fileSupported()` returns true when `window.kanbanDisk` exists.
- ~911 desktop save path: `window.kanbanDisk.save(json, needSnap)` and checks `{ok}`.
- ~1101 `restoreLatestBackup()` returns early on desktop.
- ~1112 file button calls `window.kanbanDisk.openFolder()` on desktop.
- ~1864 `loadLastSessionScript()` reads `window.KANBAN_LAST_SESSION` (desktop loads from disk,
  ignoring the unbacked-browser flag).
- ~2552 desktop init sets `fileStatus='ok'` and the tooltip.
- ~2582 image GC: `KanbanImages.gc(S.imageIds(App.board))`.
- `Ctrl+ArrowUp` / `Ctrl+ArrowDown` call `stepFontSize(+1/-1)`; the step stops at `large`/`small`
  and the existing `typing` guard suppresses it inside inputs. `#btn-font` advertises the
  shortcut with `aria-keyshortcuts`.
- `Ctrl+F` / `Cmd+F` is handled before the `typing` guard and focuses/selects `#search`; the
  browser Find dialog is suppressed and an existing query reopens the results popover.
  `Ctrl+Tab` / `Ctrl+Shift+Tab` call `cycleView(+1/-1)` and cycle Board -> Calendar -> Archive or
  reverse, even while an input is focused.
- Recurring events: `repeat` lives on the event as `{freq:'weekly'|'monthly', day:1..31}`;
  `S.eventsOn(board,date)` expands occurrences virtually (cloned with adjusted `date`/`endDate`
  and `occurrence=true`), so only the base event is persisted. Weekly uses the start weekday;
  monthly skips months without the chosen day. `S.repeatOf` / `S.repeatLabel` are exported.
- Search popover: `renderSearchPop()` is the single search surface for every tab.
  `searchMatches(q)` returns active board cards, calendar events, notebook pages (title + plain-text
  body) and archived cards; the panel groups rows under Board / Calendar / Notebook / Archive with
  per-group counts. Rows carry `data-sp-kind` (`board` / `calendar` / `notebook` / `archive`);
  clicking one switches to that view and opens the card/event, or opens the notebook sheet at the
  matched page (`KanbanNotebook.openPage`). Board rows show column, due date, checklist progress,
  assignee and labels; event rows show the next occurrence for repeating events; notebook rows show
  the word count and a "Page" excerpt; archive rows show the source column and archive date. Enter
  opens the first row, Esc/clear closes. Calendar cells still get `search-hit` / `search-miss` /
  `search-empty` from the same query.
  The popover is a sibling of `.search-box` (not a child) because themes apply `clip-path` to
  the field, which would clip (and disable hit-testing for) an absolutely positioned child. It is
  positioned as `fixed` under the field by `renderSearchPop()` so it also follows the search box
  when the topbar wraps at narrow widths. `.search-box .icon-btn` stays 24x24 with `flex:none`;
  Genshin's 36px topbar icon rule must not resize `#search-clear`, or the field grows when the
  clear button appears.
- Notebook (`js/notebook.js`, markup `#notebook` / `#nb-scrim` in `index.html`, styles at the end of
  `css/styles.css`): a hidden right-hand sheet toggled with **Tab anywhere in the app**. `app.js`
  `bindTabNotebook()` is a capture-phase `window` listener that `preventDefault()`s every plain Tab
  (and Shift+Tab), so Tab never moves focus between controls: if the sheet is open it closes,
  otherwise it opens unless a card/event/confirm/lightbox dialog, theme picker, column menu,
  quick-add, add-list, data menu or date/time picker is open (`tabBlocked()`), in which case the key
  is swallowed. Opening also closes the search popover and blurs a field so the caret is not left
  behind the sheet; the sheet itself has `tabindex="-1"` and search results focus it. While open,
  Esc closes it, `#board` is `inert`, `Ctrl+F` focuses the page filter, board
  undo/theme shortcuts are ignored, and `setView()` closes it. Pages are NOT cards:
  `board.notebook = { pages:[{id,title,body(rich-text HTML),pinned,cardIds[],createdAt,updatedAt}],
  activeId }`, normalized by `S.normalizeNotebook` (<=200 pages, bodies <=200k chars, dangling
  `cardIds` pruned), so it rides along in backups/export/import. Edits mutate `App.board.notebook`
  in place and save via a 450 ms debounced `persist()` (no board re-render, no sound). Undo restores
  the board but keeps the current notebook; Reset board keeps the notebook. Blank pages are removed
  when the sheet closes; the sheet creates a blank page on open if none exist. App links: attach cards
  to a page (chip opens the card), "Make card" (new card in the first list, page body as description,
  auto-linked), Copy as text. Page delete uses a toast Undo. Sheet shortcuts: `Alt+N` new page,
  `Alt+Up/Down` previous/next page, `Alt+P` pin. The sheet reuses `.drawer` so every theme's panel
  styling applies; new boards get a "Scratch pad" welcome page that advertises the shortcut.
- Top-left `.seg` has three tabs: Board, Calendar and Archive. The old topbar archive icon and
  the `#stats` card counter are gone. `setView()` accepts `board` / `calendar` / `archive`,
  persists `kanban.view.v1`, and toggles `#board`, `#calendar` and the main `#archive` section.
  Archive is no longer a fixed drawer: `#archive` reuses the `.drawer` theme classes but is a
  normal flex view, filtered by the shared `#search` through `App.query`. There is no separate
  archive search field. Restore/delete/open handlers are unchanged and `renderMain()` renders the
  archive only when it is the active view. `#btn-add-list` is hidden on Calendar and Archive.
  Active views animate in with the `view-in` keyframe (disabled by reduced motion). `#app` keeps
  `overflow: hidden` so the 6px `translateY` cannot create a document scrollbar and shift the
  topbar horizontally during a switch.
- Cyberpunk HUD: `#hud` in `index.html` is a pointer-events-none, z-index 2 edge overlay with
  vitals/quick slots, minimap, objective and weapon blocks. `bindReactiveBackground()` sets
  `--cp-mx` / `--cp-my` and `data-cp-live`; the frame and data blocks use them for a subtle
  parallax, and the minimap scanner blip is positioned from them. There is no cursor-following
  reticle and no pointer-tracked background halo. HUD is hidden at Low graphics, static at
  Medium and under `prefers-reduced-motion`, and hidden/reflowed at narrow widths.
- Retired themes: `mario`, `persona5`, `sticky` and `ffxvi` are gone from `S.THEMES` (11 left), the picker,
  `NATIVE_DARK`, sound kits and CSS. Unknown/retired theme names fall back to `claude`, which is
  also the theme new boards start with. Baloo/Anton face declarations are leftover but unused; the
  Barlow Condensed and Anton/Baloo font files in `vendor/fonts` are unused too.
- Genshin background: `#bg::before` stays the nebula haze; `bindGenshinStars()` fills
  `#genshin-stars` at runtime with about 82 random dot stars plus 14 four-point glints at 1280x800
  (scales with viewport, rebuilds on debounced resize). Coordinates come from `Math.random()`,
  never a repeating background tile. Stars use the active element palette and stay small
  (dots 2.2-3.6 px, glints 4.6-8.8 px). Light mode uses normal blending at .88 opacity so the
  white specks remain visible instead of being erased by multiply. CSS twinkles every star;
  about 70% drift leftward by 12-70px in one pass, fading out at the loop boundary before the
  reset, while the rest stay put. The single `#genshin-stars` layer gets a 7x5px cursor-parallax
  transform driven by `--gs-mx`/`--gs-my` (smoothed pointer tracking in `bindGenshinStars()`),
  and the glints slowly spin. `.gs-drift` wrappers stay transform-free. Medium graphics hides
  `#genshin-stars`, Low hides `#bg`, and reduced motion makes the stars static and disables the
  cursor parallax. Only one `#bg > span` remains — the other themes still use it.
- Genshin light mode uses a daily element: `GENSHIN_ELEMENTS` is anemo/geo/electro/dendro/hydro/
  pyro/cryo. `genshinElementForDate()` hashes the local date and bumps the result when it matches
  yesterday, so `html[data-genshin-element]` is stable all day and changes daily.
  `renderTheme()` refreshes it, writes the element into `#btn-theme`'s title, and
  `scheduleGenshinDay()` refreshes again at local midnight + 1s. The light
  `[data-theme="genshin"][data-alt="1"][data-genshin-element=...]` palettes set the element, glow,
  sky and panel tints; dark mode keeps the gold UI variables. Stars rebuild from the active element
  palette on `genshin-element-change`.
- Theme selection defaults to dark for `cyberpunk`, `genshin`, `fallout` and `nier`,
  and light for every other theme. `DARK_ON_SELECT` and `defaultModeFor()` are applied by
  `applyTheme()`, shared by the theme picker and `cycleTheme()`; both paths write
  `kanban.mode.v1` explicitly. When no mode preference exists, `effectiveMode()` uses the same
  per-theme default. The mode button can still switch any theme afterward. `nier` is native-light,
  so its default dark palette is the `[data-alt="1"]` variant; the native-dark ones use
  `data-alt="0"`. Blueprint is native-dark, so its default light palette uses `[data-alt="1"]`.
  Pixel is native-light since 2026-11-24 (day = `data-alt="0"`, night = `"1"`).
- Motion override is the explicit escape hatch for Windows' animation setting. The data menu row
  (`#btn-motion`, `Ctrl+Shift+M`) writes `kanban.motion.v1='on'|'off'` and sets
  `html[data-motion="on"]` when forced. The override only takes effect while the app window is
  focused: `motionSetting()` is the stored preference (drives the menu label/`aria-checked`),
  `MOTION_FOCUS` tracks `window` focus/blur + `visibilitychange`, and `syncMotionAttr()` writes
  `data-motion="on"` only when both are true (otherwise `"auto"`, so the OS setting applies again).
  `motionOverride()` reports the effective attribute. Every `@media (prefers-reduced-motion:
  reduce)` rule is gated with `html:not([data-motion="on"])`, and the Cyberpunk/Genshin pointer
  effects call `motionAllowed()`; Graphics Medium/Low still reduce effects regardless. Default is
  off, so the OS preference is respected until the user explicitly forces motion.
- The top-left `.seg` tabs are 30 px tall with 15 px side padding and 13 px text; the
  nier/fallout overrides use 12 px. This keeps the three view tabs easy to hit.
- Pixel theme (cosy farm; shown to users as **Stardew**, internal id stays `pixel` so saved boards and the
  Electron build keep working): every rule is written once under `[data-theme="pixel"]`; night mode only swaps
  the `--pf-*` / palette variables. Frames are a 16x16 SVG `border-image` (`--pf-frame`, slice 4, 8px),
  so framed panels need `background-clip: padding-box`. `#pixel-farm` (inside `#bg`) holds one static
  canvas (4px art pixels, repainted only on size/season/mode change) plus `.pf-cloud` / `.pf-bit`
  elements moved by CSS transforms: petals, leaves, snow, or fireflies at night. The season follows the
  real month (Mar-May Spring ... Dec-Feb Winter) and shows in `#btn-theme`'s title. Medium hides the
  movers, Low hides `#bg` (flat sky/grass from `--pf-sky`), reduced motion stops everything. All art and
  the Homestead Pixel font are original; do not add assets from any game.
- Reminders (`#reminders`, `js/app.js` "reminders"): events and due cards are announced 7 days before,
  3 days before and on the day. `S.reminderCandidates(board, today)` / `S.resolveReminders(board, today,
  saved)` are pure; shown/dismissed state is `kanban.reminders.v1` in localStorage, never in the board.
  A stage missed while the app was closed shows on the next start; it stays until dismissed, replaced by
  the next stage, or past. Weekly events skip the 7-day stage (it would land on the previous occurrence);
  multi-day events count from their first day; cards in a "done" list or archived are skipped. Checked at
  start, at midnight, on focus and every 5 minutes if the date changed. Items added during the session do
  not pop up immediately. "Later" hides until the next start/day, "Got it" dismisses all. Only works while
  the app is running (no OS notification).
- Checklist rows in the card panel (`#cm-checklist`, rendered by `renderModal()`) can be reordered
  and the order rides along in the card's `checklist` array (no format change). Each row is
  `<li class="cl-row" data-cl-id>` with a `.cl-grip` (draggable="true" — only the grip starts a
  drag, so label text selection and checkbox clicks still work), the `.cl-item` label, then
  `.cl-move` up/down buttons (`data-move-item`, `data-dir="-1|1"`, disabled at the ends), edit and
  delete. Buttons call `S.moveChecklistItem(board, cardId, itemId, toIndex)`; the grip uses native
  HTML5 drag events delegated on `#cm-checklist` with `App.checkDrag`, `.drop-before` / `.drop-after`
  markers and `S.moveChecklistItem` on drop (the item is removed before it is re-inserted, so the
  drop index is decremented when moving down). `S.setChecklistOrder(board, cardId, orderedIds)` is
  the array-order equivalent for future callers. Moves go through `commit()`, so the board card's
  checklist and the saved JSON follow immediately and the modal re-renders. Drag state is cleared
  in `closeModal()`; while a row is being edited (`.cl-editing`) the grip and arrows are hidden so a
  stray click cannot drop the typed text.

`js/images.js`:
- ~15 uses `window.kanbanDisk.images` only if `images.base` is truthy.
- ~68 image src is `base + encodeURIComponent(id)` — base must end with `/`.
- ~49/61/142 save/read/gc call the bridge promise APIs.

Board JSON is the source of truth for the UI theme; `lbl-*` labels and card/checklist ids are
generated by the frontend. `kanban.board.v1` and `kanban.view.v1` were observed in localStorage;
other keys in use: `kanban.mode.v1`, `kanban.cursor.v1`, `kanban.graphics.v1`, `kanban.sound.v1`,
`kanban.motion.v1`, `kanban.reminders.v1`, `kanban.unbacked.v1`, `kanban.calmode.v1` (calendar view: month|week|day|agenda).
Do not rename storage keys.

## 7. Verification playbook

Always verify in this order after a native change.

1. Build, copy the exe to the project root, start it:
   ```powershell
   & "$env:USERPROFILE\.cargo\bin\cargo.exe" build --release
   Copy-Item -Force "target\release\kanban-rust.exe" "."
   $p = Start-Process -FilePath ".\kanban-rust.exe" -PassThru
   Get-Content ".\kanban-rust.log" -Tail 10
   ```
   Expect `starting…`, `board loaded…`/`no saved board yet`, `window shown`.

2. Talk to the running page through DevTools (this machine blocks programmatic foreground
   switching, so CDP is the reliable route):
   ```powershell
   .\tools\dev-run.cmd                      # launches with --remote-debugging-port=9222
   node tools\cdp.mjs "document.title"
   node tools\cdp.mjs "JSON.stringify({theme: document.documentElement.dataset.theme, cards: document.querySelectorAll('.card').length})"
   node tools\cdp.mjs "$env:TEMP\kanban-page.png" --screenshot
   ```
   The env var must be set **before** the app starts; restart the app to enable/disable CDP.

3. Functional checklist:
   - **Save/restore:** toggle a welcome-card checkbox from the page, confirm
     `Kanban Auto-Backups\kanban-backup-latest.json` changes and contains `"done": true`.
     Close via `WM_CLOSE`, relaunch, confirm the checkbox and theme are restored.
   - **Frameless window:** no native title bar; `.win-controls` shows 46x60
     minimize/maximize/close hit areas at the right and `#win-resize` provides edge resizing.
     Check the top/right monitor-edge points resolve to the window buttons (not a resize strip).
     While maximized, `html[data-maximized="1"]` must hide `#win-resize`, top/side edges must show
     the page's normal cursor (not `ns-resize`/`ew-resize`), and resize IPC must be ignored.
     Reloading the page while maximized must restore the attribute and keep the handles hidden.
     At the absolute top-right pixel while maximized, Close must highlight and click; the native
     `WS_THICKFRAME` style must be absent while maximized and present after restore (including
     drag-restore and system restore).
     Drag empty topbar space, toggle maximize and restore, maximize then drag the topbar to
     restore under the cursor, minimize and restore, close from normal and from minimized.
     Closing while minimized must keep the previous normal bounds in `window-state.json`.
   - **Font size:** in the page, dispatch Ctrl+ArrowUp/ArrowDown and confirm `#btn-font` steps
     `small`..`large` without wrapping; the shortcut is ignored while an input is focused.
   - **Theme persistence:** dispatch a synthetic shortcut then check disk:
      ```js
      document.dispatchEvent(new KeyboardEvent('keydown', {key:'+', ctrlKey:true, bubbles:true}));
      ```
      Expect `html[data-theme]`, `kanban.board.v1` and `latest.json` to agree.
   - **Icon:** `Get-Item .\kanban-rust.exe` and
      `[System.Drawing.Icon]::ExtractAssociatedIcon((Resolve-Path .\kanban-rust.exe))` should
      return a 32x32 icon instead of the generic exe icon. The window/taskbar uses
      `build/icon-64.rgba`.
   - **Recurring events:** add an event, set Repeat to weekly/monthly, save, then inspect the
      board JSON (`repeat` should be persisted once) and `S.eventsOn(board, date)` for a later
      occurrence. Reload and confirm the occurrences still render; only the base event is stored.
   - **Search popover:** from every tab, type a title in the shared `#search`; the popover must
      appear under the field (not clipped), show highlighted matches, group results under
      Board / Calendar / Notebook / Archive, and mark matching days on the Calendar. Clicking a row
      switches to that result's view and opens the card/event; a Notebook row opens the sheet on
      that page. A word that appears only in a notebook page body (not its title) must still match.
      Enter opens the first result, Esc/clear closes it, clicking outside hides it, and no-match
      shows the empty state.
     `Ctrl+F`/`Cmd+F` (even from an input) focuses/selects `#search` instead of opening the
     browser Find dialog, and reopens the results popup when a query is already present.
   - **Tab / notebook:** press Tab with focus on the page, on a button, inside the search field and
      inside a card/checklist input. The notebook must open/close every time and
      `document.activeElement` must not move to another control (Tab never cycles focus). Shift+Tab
      behaves the same. With a card modal, event editor, confirm/lightbox, theme picker, column menu,
      quick-add, add-list, data menu or date/time picker open, Tab is swallowed (no focus move, no
      sheet). Opening from an active search closes the search popover; closing the sheet returns to
      the previous view. Reset board keeps notebook pages.
   - **Card sizing:** paste a long description into a card. The board card's `.card-note` must grow
      line by line with an inline `max-height` (24-line cap, `.clipped` only past it) and the card
      becomes taller; a short note keeps its natural height and no fade. In the card panel, the notes
      editor grows to the content up to 60% of the window, then scrolls; deleting text shrinks it.
      Repeat after a window resize and after switching theme/font size.
   - **Search sizing:** in Genshin dark and light, focusing and typing must not change the
     `.search-box` rect (380x32 at 1280x800); `#search-clear` stays 24x24 despite the theme's
     36px topbar icon buttons.
   - **Archive tab:** the top-left segmented control has exactly Board / Calendar / Archive, with
      no topbar archive icon and no `#stats` card counter. Clicking Archive hides Board and
      Calendar, shows `#archive`, and hides `#btn-add-list`; the choice survives a reload via
      `kanban.view.v1`. The shared search filters archived cards; there is no separate archive
      search field. Open/Restore/Delete still work. The archive fills the main area (not a fixed
      drawer), follows the active theme, and animates in with the other view tabs.
   - **View cycling/animations:** `Ctrl+Tab` cycles Board -> Calendar -> Archive; `Ctrl+Shift+Tab`
      reverses it, including while an input is focused. Each view fades/slides in on switch, and
      reduced motion disables the animation. During the switch, `document.documentElement.clientWidth`
      and the topbar/search x-position must stay constant (no scrollbar-driven left/right shake).
   - **View tabs / theme defaults:** the three `.seg` tabs must be 30 px tall and clickable at their
      edges. Set `kanban.mode.v1` to the opposite of a theme's default, then select Cyberpunk, Genshin,
      Fallout or NieR; each must end with `mode=dark` (NieR uses `data-alt="1"`, the others `"0"`).
      Every other theme ends `mode=light` (Blueprint with `data-alt="1"`). The mode button must still
      switch any theme afterward.
   - **Reminders:** with events today, +3, +5, +7 and +9 days and no `kanban.reminders.v1`, the panel lists
      the first four; set `{"last":"<yesterday>"}` and only 0/3/7 show. Dismiss, Later, Got it, relaunch,
      and a faked date + `focus` event must behave as described in section 6.
   - **Pixel farm:** day/night and all four seasons repaint `#pixel-farm canvas`; other themes empty it.
   - **Themes/cursors:** the picker must list 11 themes with no Mario/Persona 5/Sticky/FFXVI; a retired
      theme in an old board falls back to `claude`. Glass body cursors resolve to `data:image/svg+xml`
      URLs; Genshin uses the embedded `data:image/png;base64` white-and-gold star (32x32) with
     the old 16 gray crosshair pixels cleared. Decode the cursor and check no opaque `127,127,127`
     pixels remain. The Genshin background must show a runtime-random element-toned star field
     with non-gridded small four-point glints, not evenly spaced specks; most stars have a
     negative `--dx` (leftward) and a random subset have `--dx:0` (stationary), with no positive
     `--dx`. Moving stars must translate only toward `--dx` and fade to zero opacity before the
     loop resets, never return to the origin visibly. Pointer movement must shift the single
     `#genshin-stars` layer via `--gs-mx`/`--gs-my`; `.gs-drift` wrappers keep `translate:none`.
     Medium graphics hides the star layer, and reduced motion stops the twinkle, drift and cursor
     response.
   - **Motion override:** emulate `prefers-reduced-motion: reduce`; with the menu row Off,
     `data-motion="auto"`, `document.getAnimations()` must be 0 and `#genshin-stars` must have
     `transform:none`. Toggle `#btn-motion` (or `Ctrl+Shift+M`); `data-motion="on"`,
     `kanban.motion.v1="on"`, animations must restart, and Genshin/Cyberpunk pointer effects must
     work. Dispatch `window` `blur` (or focus another window): `data-motion` must fall back to
     `"auto"` while the menu still reads On and `aria-checked="true"`; dispatch `focus` and it must
     return to `"on"`. Reload while focused; the On state must persist. Set Graphics Medium with the
     override On and confirm the star/HUD layers remain hidden.
   - **Genshin daily element:** reload; `html[data-genshin-element]` must be stable for the day,
     differ from yesterday, and `#btn-theme` must name it (`genshin · <Element> day`). Light mode
     must recolor the background, panels and stars for all seven elements; dark mode keeps the gold
     UI. Dispatch `genshin-element-change` after setting a different attribute to verify the stars
     rebuild. The midnight timer calls the same refresh and re-renders the title.
   - **Cyberpunk HUD/GPU:** in Cyberpunk, dispatch a `pointermove`; `data-cp-live` and
      `--cp-mx`/`--cp-my` must change and the HUD data blocks must translate. Confirm there is no
     `.hud-reticle` and that `#bg` no longer uses a pointer position. Low graphics hides `#hud`;
     Medium disables the map blip/frame tilt. Start normally and expect
     `GPU rendering enabled with WebView2 flags` in the log, with the flags visible on the
     `msedgewebview2.exe` command line. Run `Enable-GPU-Rendering.cmd` only to check the optional
     `UserGpuPreferences` value and shortcut; `--no-gpu` must log that the GPU flags are disabled.
   - **USB copy:** run `Copy-to-USB-Rust.cmd <temp folder>`, answer N to the board prompt, and
     confirm `kanban-rust.exe`, `Enable-GPU-Rendering.cmd`, `tools\enable-gpu-rendering.ps1`,
     `VERSION.txt`, and the page assets are present; the GPU helper must work from the copy.
   - **Images:** from the page call `kanbanDisk.images.save('test.png', bytes)`, then `read`
     (byte length), `KanbanImages.load` (`/__img/test.png`), an aged unused file + `gc` should
     return 1 and delete only the aged file. Remove the test image afterwards.
   - **Data folder:** `fetch('/__open-folder',{method:'POST'})` opens Explorer at the data folder.
   - **Single instance:** start a second exe; it must exit and log
     `another instance is already running - exiting`.
   - **Close:** send `WM_CLOSE`; expect `final snapshot: ok=true`, `closing`, no process left,
     updated `window-state.json`, and no duplicate snapshot when nothing changed.
   - **LocalStorage:** survives a restart (prefs stored in `webview-data`).
   - **Traversal:** `fetch('/__img/..%2Findex.html',{method:'POST',body:'x'})` → 400 and
     `fetch('/..%2F..%2FWindows/win.ini')` → 404.

4. Close and clean up **only what the session created**. The folder may contain the user's live
   board, so never delete `Kanban Auto-Backups`, `webview-data`, `window-state.json` or
   `kanban-rust.log` blindly. For destructive or save/restore tests, isolate first: create
   `data-folder.txt` next to the exe containing a temp path (e.g.
   `%TEMP%\kanban-rust-test`), run the tests there, then delete that temporary folder and the
   `data-folder.txt` file. Otherwise, close the app gracefully and leave the user's files alone.

   Close gracefully (this runs the close handler and flushes the final snapshot):
   ```powershell
   Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class W { [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l); }'
   $p = Get-Process kanban-rust -ErrorAction SilentlyContinue
   if ($p) { [void][W]::SendMessage($p.MainWindowHandle, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) }
   ```
   Never use `Stop-Process` for close-behaviour tests: it skips the handler. Leave no test
   images or logs of your own in a folder that holds real data.

## 8. Gotchas learned this session

- `windows-sys` 0.59 `HANDLE` is `*mut c_void`: compare with `.is_null()`, not `0`.
  `CreateMutexW` needs features `Win32_Foundation`, `Win32_Security`, `Win32_System_Threading`.
- wry 0.57 handler signature:
  `Fn(WebViewId, http::Request<Vec<u8>>) -> http::Response<Cow<'static,[u8]>> + Send + Sync`.
  tao 0.37 `EventLoop::run` returns `!`; use `EventLoopBuilder::<UserEvent>::with_user_event()`
  and leave `run(...)` as the tail expression.
- The frameless window still has a small invisible Win32 outer frame; `window.inner_size()` is
  the reliable saved size. `winstate::capture` must keep the previous normal bounds when the
  window is minimized as well as maximized (minimized `inner_size`/position become placeholders).
- Resize/move updates are deferred to `Event::MainEventsCleared` and applied only when the window
  is neither maximized nor minimized. Capturing on the raw `Resized` event can store maximized
  bounds, so closing from maximized would incorrectly restore full-screen bounds as normal.
  Custom minimize also captures the current normal bounds before `set_minimized(true)`.
- Tao's `set_maximized(false)` and `set_outer_position()` are deferred through its thread executor.
  When unmaximizing for a drag, call Win32 `ShowWindow(hwnd, SW_RESTORE)` first; otherwise the
  `SetWindowPos` from `set_outer_position()` is ignored while the window is still maximized.
  `GetCursorPos`/`ShowWindow` need `windows-sys` feature `Win32_UI_WindowsAndMessaging`.
- `#app` has `z-index: 1`, so `.win-controls` cannot be raised above the fixed `#win-resize`
  layer (`z-index: 9000`) by its own z-index. Keep the northeast strip absent and start the top
  and right resize strips at `right: 140px` / `top: 60px` so they never cover the buttons.
- The topbar drag uses a 4 px movement threshold in `bridge.rs`; do not post `window:drag` on
  pointerdown, or a plain click can unmaximize the window.
- Hide the resize strips through the Rust-owned `data-maximized` attribute, not viewport-size
  guessing. The attribute is updated on `MainEventsCleared` when `is_maximized()` changes, and
  resize IPC is ignored while maximized. The same sync removes `WS_THICKFRAME` natively while
  maximized; re-add it before `set_maximized(false)` in the ToggleMaximize and Drag branches so
  the restored window keeps its expected client size.
- When testing minimize/close, `Process.MainWindowHandle` can select a helper/child window after
  minimizing. Find the real top-level by title (`FindWindow`/`EnumWindows`) or log `window.hwnd()`.
- `with_additional_browser_args` replaces wry's Windows defaults, so the default GPU mode must
  include the `msWebOOUI,msPdfOOUI,msSmartScreenProtection` disable list and the autoplay policy.
- The Cyberpunk HUD is z-index 2 above `#app`; keep `pointer-events: none`, or it will block cards
  and topbar controls. Data blocks intentionally fade at narrow widths via media queries.
- Keep both `WebContext` and `WebView` alive; keep `_webview` in `run()`'s stack frame (the event
  loop diverges, so the local is never dropped).
- `app_dir()` = exe folder when `index.html` is beside it, else `CARGO_MANIFEST_DIR` (so
  `cargo run` works).
- The release binary uses `windows_subsystem = "windows"`: failures are invisible without
  `kanban-rust.log`. `log()` must stay cheap and never panic.
- `window.KANBAN_LAST_SESSION` must stay non-writable or a stale `latest.js` can win.
- The page's save API is synchronous; never change the bridge to return a Promise.
- `explorer.exe <path>` is used instead of shell APIs; no extra Win32 dependencies.
- CMD files are CRLF; source/JS/HTML files are LF. Keep that when editing.
- Deleting `target\` is safe but the next build recompiles all crates (network needed only if the
  cargo registry cache is gone).
- Fallbacks are `%APPDATA%\Kanban Auto-Backups` and `%APPDATA%\webview-data` (no `Kanban Board`
  subfolder in the Rust build).
- Header `Cache-Control: no-store` is set for all responses.
- The title is fixed "Kanban" (the page never changes `document.title`).
- Icon pipeline: `build.rs` needs `rc.exe` (Windows Kits x64) and links `build/icon.ico` with
  `cargo:rustc-link-arg`; if `rc.exe` is missing the build succeeds with the default icon. The
  window icon comes from the raw `build/icon-64.rgba` included by `src/main.rs`, not the `.ico`.
- `#search-pop` must stay outside `.search-box`: theme CSS applies `clip-path` to the field, which
  clips (and disables hit-testing for) absolutely positioned children even with a high z-index.
- Theme CSS was removed with a brace-aware script; `Baloo 2` and `Anton` `@font-face` blocks are
  unused leftovers.
- Recurring occurrences are generated, never stored: editing/deleting acts on the base event.
  Monthly repeats deliberately skip months that lack the chosen day.
- Background pan/scan animations are now transform loops sized to the repeating tile (riso 20px,
  blueprint 40px, nier 30px). The short durations preserve the original pixel speed; the loop is
  seamless because the tile repeats.
- Genshin cursor parallax is applied to the single `#genshin-stars` layer, not each `.gs-drift`
  wrapper. `.gs-drift` must stay transform-free or 96+ per-star style updates return. Reduced
  motion must keep `#genshin-stars { transform:none !important; will-change:auto; }`.
- Windows "Animate controls and elements inside windows" is surfaced by WebView2 as
  `prefers-reduced-motion: reduce`; when off, the app intentionally stops theme animations unless
  the data menu's Motion override is On (`kanban.motion.v1="on"`, `html[data-motion="on"]`). Every
  reduced-motion CSS rule must keep the `html:not([data-motion="on"])` guard and both pointer
  handlers must use `motionAllowed()`. That is separate from the app's High/Medium/Low graphics
  setting; Medium/Low still win over the override. The override is focus-scoped: never write
  `data-motion` straight from `kanban.motion.v1`; go through `syncMotionAttr()` so a background
  window falls back to `auto`. The menu label must read `motionSetting()`, not the effective state.
- Tab is intercepted in the capture phase on `window` (`bindTabNotebook`) and `preventDefault()`ed
  unconditionally, so no default focus traversal remains anywhere in the app (including inside
  inputs, textareas and contenteditable). Do not add a second Tab handler expecting focus movement;
  notebook-internal keyboard shortcuts use Alt/arrow keys. `stopPropagation()` keeps other keydown
  handlers from acting on Tab; plain Ctrl+Tab is excluded and still cycles views.
- `#notebook` has `tabindex="-1"` so search results can focus the sheet without adding it to the
  tab order. Opening via Tab closes the search popover (z-index 400 would otherwise float over the
  sheet) and blurs a topbar field so typing does not land behind the scrim. Only `#board` is inert;
  notebook pages must keep working.
- Card note fitting must run *after* the card HTML is in the DOM (scrollHeight is needed). It is
  safe because `renderBoard()` rebuilds nodes, so no stale inline heights survive. Set a generous
  CSS fallback (7.3em) rather than the old 6.4em clamp, and keep the `.clipped` mask only for notes
  that still overflow the 24-line cap. `renderMain()` also calls `renderBoard()` while the board is
  hidden (Calendar/Archive), where every `scrollHeight` is 0: both `fitCardNotes()` and `fitNotes()`
  must skip that case (leave the CSS fallback) instead of writing a 5-line max-height, or a later
  visible render is required to undo the clamp. `setView('board')` does refit. The notes editor's
  inline height must be reset (`auto`) before measuring, or a shrunk note stays tall.

## 9. Known limitations / backlog

1. **Rust unit tests** for `storage` and `images` (port `tests/store.test.js`): id validation,
   load order, snapshot skip/prune, atomic write, GC age/keep rules. Use temp dirs; no extra
   crates needed (or add `tempfile`).
2. **Error paths** not exercised: read-only data folder, invalid board JSON, disk-full write,
   >40 MB image, second-instance focus behaviour, 15-minute timer end-to-end.
3. **Second launch focus:** currently exits silently; Electron restored/focused the window.
   A named event + `AllowSetForegroundWindow` or `FindWindowW`/`ShowWindow` would match it.
4. **Polish:** show the window on `PageLoadEvent::Finished` to avoid the brief blank flash.
5. **Build portability:** optional `-C target-feature=+crt-static`; already verified MSVC links
   without it here.
6. **Frontend drift check:** the Rust build now intentionally differs from `..\Kanban Board`
   (icon, themes, cursors, recurrence, search). Compare hashes only to find accidental changes:
   ```powershell
   foreach ($f in "index.html","css\styles.css","js\app.js","js\state.js","js\images.js","js\richtext.js","js\sfx.js") {
     $a = (Get-FileHash "..\Kanban Board\$f").Hash; $b = (Get-FileHash ".\$f").Hash
     if ($a -ne $b) { "DIFF $f" }
   }
   ```

## 10. Guardrails for the next session

- Read this file, `Cargo.toml` and the relevant `src/*.rs` before editing.
- Do not modify the sibling Electron project unless the user asks; it holds the reference UI and
  possibly the user's real board data.
- Keep the board/image file formats and storage keys byte-compatible with the Electron/browser
  versions. Interchangeability is a product requirement, not an implementation detail.
- Do not write application data into the app folder (only `webview-data`, `window-state.json`,
  `kanban-rust.log`, and `Kanban Auto-Backups` when the data-folder override points there).
- Never delete the user's `Kanban Auto-Backups` or `webview-data` unless they explicitly ask.
  Use a temporary `data-folder.txt` target for disruptive tests.
- No telemetry, no extra services. The only network access is the updater, and only after the user presses
  "Check for updates" (check) and approves the version (download). Never make it automatic or silent.
- After any change: build, run the checklist above, then clean the generated data and log.
- If you add a dependency, justify it against the tiny-binary goal and update `Cargo.lock`.

## 11. Session history (2026-10-20)

- Chose a Rust host (tao + wry) rather than Tauri or a full native UI: the UI/CSS/JS stays
  identical, gains are disk size, startup and no Node/Electron runtime. Electron vs wry is
  perf-neutral for rendering.
- Chose a custom protocol (`kanban://`) instead of `file://` so localStorage/fetch work with a
  persistent origin; user-data folder is portable next to the exe.
- Ported `store.js`, preload bridge, window bounds, single-instance, 15-min snapshot and close
  snapshot. Wrote the optimistic sync save shim and the `/__img/` fetch bridge.
- Built and verified release `kanban-rust.exe` (875,520 bytes). Tests covered: first run,
  save/restore, theme change persistence, images save/read/load/GC, open-folder, single
  instance, window bounds restore, close snapshot (including skip-when-identical) and path
  traversal rejection. The build cache (`target\`), test board, webview profile and logs were
  removed; the folder ships at ~8.8 MB.

### Later changes (same day)

- New minimalist blue rounded-square app icon (three kanban bars); `build.rs` links it into the
  exe and `src/main.rs` sets the tao window icon. `index.html` favicon points at `build/icon.png`.
- Added `Create-Desktop-Shortcut.cmd`; removed the redundant `Kanban-Rust.cmd` (the exe starts
  directly). `Build.cmd` remains the from-source build helper.
- Added virtual recurring events (weekly/monthly with optional day of month) in `js/state.js`,
  the event editor UI and the calendar pills.
- Board and Calendar search now share a Finder-style popover; calendar adds grid hit/miss
  indicators and a result count.
- Removed the Mario and Persona 5 themes and their sound kits; unknown themes fall back to
  `claude`. Glass uses macOS-style cursors; Genshin embeds the fegrifo "Genshin Impact Cursor Set" (public domain; gi_arrow.cur / gi_link.cur converted to 32px PNG data URIs, hotspot 1,1).
- Verified by CDP in an isolated `data-folder.txt` target: icon resource, 13 themes, repeat
  save/restore and monthly day skipping, search popover/hit badges/no-results/Enter/Esc, cursor
  data URIs, and graceful close. Test data folder and override file were removed afterwards.
  Release exe is now 937,984 bytes.
- Cyberpunk HUD rebuilt as a CP2077-inspired perimeter overlay: vitals/level/quick slots, minimap
  with route and pointer-driven scanner blip, objective panel, weapon/ammo block, angular corners
  and edge telemetry. Removed the cursor-following crosshair reticle and pointer-tracked
  background halo; the frame and HUD blocks now provide the cursor parallax. HUD hides at Low,
  freezes at Medium/reduced motion, and drops minimap/objective at narrow widths.
- Added `Enable-GPU-Rendering.cmd` + `tools/enable-gpu-rendering.ps1` (per-app HKCU GPU preference
  and `Kanban (High Performance)` shortcut) and `--force-gpu` WebView2 flags in `src/main.rs`.
  Verified registry value `GpuPreference=2;`, shortcut args, log line, and GPU process flags.
  Release exe is now 942,592 bytes.
- Removed the native Windows title bar: frameless topbar with custom minimize/maximize/close,
  topbar drag region and eight edge/corner resize strips. Verified at 1280x800,
  minimize/maximize/restore, closing from maximized keeps 1280x800 normal bounds, closing from
  minimized after an 1100x700 resize keeps 1084x691, and browser hosts keep the controls hidden.
  Release exe is now 958,976 bytes.
- Enlarged the window controls to full-height 46x60 hit areas and removed the top-right resize
  overlap (seven strips remain). Added `Ctrl+ArrowUp/Down` font sizing, removed the gray Genshin
  cursor crosshair, and made a maximized topbar drag restore under the pointer before moving.
  Verified button edge hits, no-move click keeps maximize, 4 px drag unmaximizes and lands at the
  cursor, and the clean Genshin cursor decodes with zero `127,127,127` pixels. Release exe is now
  961,536 bytes.
- Replaced the Genshin theme's evenly spaced white specks with runtime-generated random dot stars
  and small, twinkling warm white/gold glints in `#genshin-stars`, plus global `Ctrl+F` search
  focus. Verified star randomness and animation at 1280x800 and 2560x1392; Medium graphics and
  reduced motion retain their existing fallbacks.
- Made GPU rendering the default on Windows: the app always passes the WebView2 GPU flags, with
  `--no-gpu` as a troubleshooting escape hatch; the legacy `--force-gpu` argument is now a no-op.
  `Enable-GPU-Rendering.cmd` now only sets the optional Windows per-app High performance
  preference. `Copy-to-USB-Rust.cmd` copies that helper plus its PowerShell script, and a latent
  batch `echo (...)` parsing bug in the board-copy path was fixed. Verified default flags on the
  `msedgewebview2.exe` command line, their absence under `--no-gpu`, the registry helper from a
  copied folder, and a successful USB copy. Release exe remains 961,536 bytes.
- Hid the edge-resize handles while the window is maximized: `main.rs` mirrors
  `is_maximized()` to `html[data-maximized="1"]` on `MainEventsCleared`, CSS hides `#win-resize`,
  and resize IPC is ignored. A page-load handler re-syncs the state after a reload. Removed the
  per-list card-count badge while keeping the WIP outline. Verified normal edge cursors when
  maximized (including startup maximized and reload), restored resize handles, and no `.count`
  elements in list headers. Release exe is now 968,192 bytes.
- Turned the archive drawer into a third top-left tab to the right of Calendar. Removed the
  topbar archive icon and the `#stats` card counter, added `#view-archive`, and made `#archive`
  a normal themed main view (initially with its own search, later replaced by the shared top
  search). `setView()` / `initView()` now persist and restore `board` / `calendar` / `archive`.
  Verified tab switching, `#btn-add-list` hiding, archive filtering, open/restore/delete,
  `kanban.view.v1` reload persistence, and theme styling in an isolated copy. Asset-only change;
  release exe unchanged at 968,192 bytes.
- Unified search and tab navigation: the top `#search` is now the only search field for all three
  views. Removed `#archive-search`, `App.archiveQuery` and the separate archive binding;
  `renderArchive()` filters through `App.query`. `searchMatches(q)` returns board cards, calendar
  events and archived cards; `renderSearchPop()` groups results under Board / Calendar / Archive
  with counts, and clicking a row switches to that view and opens the card/event. Added
  `Ctrl+Tab` / `Ctrl+Shift+Tab` (`cycleView`) and a `view-in` fade/slide animation on active
  views (reduced motion disables it). Verified grouped results and navigation from every view,
  archive filtering, shortcut cycling, animation, syntax/CSS integrity and graceful close in an
  isolated copy. Asset-only change; release exe remains 968,192 bytes.
- Made the maximized top-right corner reachable: `main.rs` now removes `WS_THICKFRAME` while
  maximized and restores it before any unmaximize (custom toggle, topbar drag, or OS restore) so
  the native resize frame cannot intercept clicks aimed at Close. Verified at 2560x1392 with the
  app topmost: `#win-close` hit-tests and hovers at `(2559,0)`, the style is `0x15CB0000` while
  maximized and `0x14CF0000` after restore, and close-from-maximized still saves the maximized
  window state. Release exe is now 968,704 bytes.
- Genshin light mode now picks one of seven elements per local day: a date hash keeps it stable
  until midnight and the previous-day check forces a visible change. The element recolors the sky,
  glows, panels and star field; `#btn-theme` names the current element, and dark mode keeps the
  gold UI. Verified all seven palettes resolve and rebuild stars via CDP, the daily title for
  2026-10-21, JS syntax, and light Geo/Electro plus dark screenshots at 1280x800 in an isolated
  copy. The dark background was rebalanced toward warm slate to reduce the olive cast. Asset-only
  change; release exe remains 968,704 bytes.
- Genshin light-mode legibility pass: enlarged star dots/glints, raised star opacity to .88 and
  switched from multiply to normal blending, and muted the light sky/panel palette to cut glare.
  Verified all seven palettes and star sizes via CDP plus Geo/Electro screenshots at 1280x800 in an
  isolated copy. Asset-only change; release exe remains 968,704 bytes.
- Enlarged the Board/Calendar/Archive tabs to 30 px tall with 15 px side padding and 13 px text
  (12 px in pixel/nier/fallout/ffxvi), verified their rects and edge hit-testing via CDP.
- Selecting Cyberpunk, Genshin, Fallout, NieR or FFXVI now writes `kanban.mode.v1='dark'` through
  the shared `applyTheme()` used by both the picker and `Ctrl +/-` cycling. The mode button still
  toggles light afterward. Verified all five selections start dark; NieR resolves to its
  `[data-alt="1"]` dark palette and the other four to `data-alt="0"`.
- Replaced FFXVI's fixed four-color repeating tile with `#ffxvi-particles`: about 135 randomly
  placed/sized/timed embers and sparks at 1280x800, five weighted colors and random drift/rotation.
  Verified unique positions/durations, animation name `ff-ember-rise`, Medium/Low hiding and a
  1280x800 screenshot in an isolated copy. Asset-only change; release exe remains 968,704 bytes.
- Theme defaults are now explicit: only Cyberpunk, Genshin, Fallout, NieR and FFXVI switch to dark;
  every other theme switches to light, including native-dark Blueprint and Pixel (their light
  `data-alt="1"` palettes). `effectiveMode()` uses the same default when no mode preference is
  stored, and the mode button still toggles either way. Verified all 13 picker themes from the
  opposite mode via CDP. Asset-only change; release exe remains 968,704 bytes.
- Fixed the Genshin search field growing when typing: the theme's 36px topbar `.icon-btn` rule
  also applied to `#search-clear`, so the 24px field grew to 44px tall when the clear button
  appeared. Added 24px Genshin dark/light search-clear overrides and `flex:none` on the base
  search icon button. Verified the field stays 380x32 before focus, after focus and while typing
  in both modes at 1280x800. Asset-only change; release exe remains 968,704 bytes.
- Fixed the left/right shake when switching Board/Calendar tabs: the `view-in` animation's
  `translateY(6px)` briefly overflowed the document, toggling the vertical scrollbar and moving
  the centered topbar/search. Added `overflow: hidden` to `#app`; verified client width stays
  1280 and the search x stays 450 across Board/Calendar/Archive switches, while board and archive
  inner scrolling still works. Asset-only change; release exe remains 968,704 bytes.
- Moved Cyberpunk to immediately before Genshin in both `S.THEMES` and the picker, so cycling
  goes Pixel -> Cyberpunk -> Genshin. Increased Genshin star drift: about 70% now move leftward
  12-70px with random vertical offsets, while a random 30% stay put; glints keep their spin.
  Verified picker/cycle order and leftward/stationary `--dx` values plus visible motion via CDP.
  Asset-only change; release exe remains 968,704 bytes.
- Made Genshin stars drift one way only: each moving star is wrapped in `.gs-drift`, the linear
  `genshin-drift` animation runs from the origin to `--dx`/`--dy`, and the wrapper fades out at
  the loop boundary before resetting; stationary stars keep no drift. Added subtle per-star
  cursor parallax (`--gs-mx`/`--gs-my`, 2.5-7.5px `--depth`) with rAF smoothing, cleared on
  theme switch and disabled under reduced motion/Medium graphics. Verified one-way samples,
  fade-before-reset, cursor sign flips, stationary `translate:none`, theme-switch reset,
  reduced-motion emulation, the 380x32 search box and stable 1280 client width. Asset-only
  change; release exe remains 968,704 bytes.
- Removed the Cyberpunk 40x40 dot-grid layer from both dark and light `body` backgrounds while
  keeping the vertical red rails, top glow, scanlines and HUD grid. Verified the computed
  backgrounds no longer contain the dot radial and checked screenshots in both modes. Asset-only
  change; release exe remains 968,704 bytes.
- Increased Cyberpunk surface contrast: dark columns now use a brighter red-tinted `--cp-well`
  and cards a brighter `--cp-well-2`, while the body gradient and `--bg` are slightly darker;
  light mode uses brighter white column/card surfaces over a slightly deeper rose-grey
  background. Verified computed surfaces and screenshots in dark and light modes. Asset-only
  change; release exe remains 968,704 bytes.
- Widened the Archive view: `#archive` now uses `min(1400px, calc(100% - 40px))` instead of
  1100px, so it fills 1240px at 1280x800 with 20px side margins and keeps the auto-fill
  `minmax(260px, 1fr)` grid. Verified its rect, eight-card layout, no horizontal scroll and a
  1280x800 screenshot. Asset-only change; release exe remains 968,704 bytes.
- Performance pass for integrated GPUs: Genshin loses the full-screen `body::before` backdrop
  blur, star count drops to 96 at 1280x800 with cursor parallax moved to one `#genshin-stars`
  layer, FFXVI embers drop to 98 and no longer use per-particle `will-change`, background
  pan/scan loops now animate compositor transforms (same pixel speed, seamless tile-length
  loops), `#bg`/`#hud`/star/ember hosts use containment, Cyberpunk's minimap blip moves by
  transform and the route loses its drop-shadow filter, and iOS Glass card/panel blur drops to
  14/20px (calendar 10px). Verified Genshin 181 animations/96 stars, FFXVI 98, riso transform
  loop, all converted theme backgrounds, Cyberpunk transform/no filter, iOS blur,
  reduced-motion reset, syntax, screenshots and graceful close in an isolated copy. Asset-only
  change; release exe remains 968,704 bytes.
- Added an explicit Motion override in the data menu (`#btn-motion`, `Ctrl+Shift+M`). It stores
  `kanban.motion.v1='on'|'off'`, sets `html[data-motion="on"]`, and makes the reduced-motion CSS
  and the Cyberpunk/Genshin pointer handlers bypass Windows' animation setting while leaving
  Graphics Medium/Low restrictions in place. Verified under emulated `prefers-reduced-motion:
  reduce`: Off gave 0 animations; On restarted Genshin/Cyberpunk effects, enabled pointer
  parallax, persisted across reload, and Medium still hid the star/HUD layers. Asset-only change;
  release exe remains 968,704 bytes.
- Smoothness pass for "Animate controls and elements" ON on a low-power laptop (integrated graphics, 8 GB,
  likely 1080p). Measured with a headless Chromium trace (tools not shipped): idle main-thread
  cost fell from ~190 ms/s to ~2 ms/s on Cyberpunk and ~310 to ~2 on Fallout; Cyberpunk pointer
  style-recalc cost fell ~5x; Fallout layouts 89/s -> 5/s. Changes:
  - Cyberpunk parallax writes `--cp-mx/--cp-my` on `#hud`, not `<html>` (a root custom property
    restyles the whole board every frame); `data-cp-live` is only touched on change.
  - Genshin parallax writes one inline `transform` on `#genshin-stars` (no `--gs-*` variables).
  - Main-thread animations moved to the compositor: HUD `cp-edge`/`cp-spine` now translate a
    `::after` tick layer (parent uses `clip-path: inset(...)`), Fallout `fo-sweep` animates
    `transform` instead of `top`, the minimap route no longer animates `stroke-dashoffset`.
    Pseudo-elements are invalid inside `:is()`, so their kill-switches are separate rules.
  - Star/ember counts are capped (dots 52-76, glints 10-14, embers 56-84) instead of scaling with
    the window (a 1080p screen used to get ~195 stars / ~200 embers).
  - iOS Glass: no `backdrop-filter` on `.card`/`.cal-cell` (nested inside a blurred parent it only
    sampled the parent's own surface); `filter: blur()` removed from the animated orbs; Brutal
    stripe layers `inset: -12%` instead of -30%.
  - Automatic guard (`perfLite()` / `runPerfCheck()` in app.js): ~3 s of rAF timing after start,
    theme change, Graphics or Motion change; median > 22 ms or p80 > 30 ms sets
    `kanban.perf.v1='lite'` -> `html[data-perf="lite"]` (half the particles, no parallax, no
    full-screen pulse/sway, no glass blur, no view-in) and shows a toast. Changing Graphics or
    Motion clears it. Visual output at normal speed is unchanged. Asset-only change (no rebuild).
- UI pass (2026-10-25): Riso/Blueprint cursors are now arrows (default) plus a hand for
  clickable things, in each theme's colours. All user-visible times are 12-hour with AM/PM
  (`S.fmtTime12`, `S.eventTimeLabel`; stored values stay 24-hour `HH:MM`, file format unchanged).
  New `js/picker.js` (loaded after state.js) replaces the browser's date/time inputs: the native
  `input[type=date|time]` stay in the DOM hidden (`.pk-native`) and remain the source of truth;
  their `value`/`min`/`disabled` are wrapped so a read-only text input (`.pk-field`, picks up every
  theme's input styling) stays in sync, and picking dispatches `input` + `change`. Date popover:
  Monday-first grid, `min` respected, Today/Clear. Time popover: typed entry ("2:30 pm", "1430"),
  hour/minute/AM-PM, Set time validates against `min` (end time after start). Esc closes only the
  picker (capture-phase listener). Search: every occurrence is highlighted (`mark.sk`) in the
  results popup, board cards, archive and calendar pills (`applySearchMarks()` runs from
  `renderSearchPop()`), and each result shows which field matched (Description / Assignee / Label
  / Notes) with an excerpt. Asset-only change (no rebuild).
- Card panel pass (2026-10-25): `.card-panel` max-width 620 -> 868px (+40%). The title `#cm-title` is
  `readOnly` on open (focus goes to the panel, not the title); the pencil `#cm-edit-title` (left of
  close) toggles `setTitleEditing()`; Enter/Esc in the title ends the edit without closing the card;
  an untitled card opens in edit mode. Priority `#cm-priority` and due date `#cm-due` moved into
  `.modal-head` (left of the pencil; the date still goes through `picker.js`). The assignee input
  (`#cm-assignee`) and the `.cm-grid` are gone; `card.assignee` data is untouched and still shows on
  board cards and in search, it just has no editor now. Labels and Checklist sit side by side in
  `.cm-cols` (stacks under 700px). Notebook toggle key changed from Space to **Tab** (`bindKeyboard`,
  `notebookAllowed`, hint in `#notebook`, README, welcome page text in `state.js`). Existing boards keep
  their saved "Scratch pad" page text, which still says Space. Asset-only change (no rebuild).
- Card panel follow-up (2026-10-25): locked title is now truly inert (`pointer-events:none`, `tabindex=-1`,
  `!important` transparent box so no theme shows an input look); the pencil restores both. Priority and
  due date left the header: `.cm-cols` is a grid with Labels / Images / Priority+Due date in column 1 and
  Checklist in column 2 starting on the Images row (single column under 700px). Priority is a
  Low/Medium/High `.seg` toggle (`#cm-priority` buttons with `data-priority`, `syncPriority()`); stored
  priority 3 ("urgent") still exists in data/board badges and shows as High in the toggle until changed.
  While the notebook is open, any Tab (no Ctrl/Meta/Alt) closes it, even inside its text fields
  (handled in `bindKeyboard` before the `typing` guard). Asset-only change (no rebuild).
- Card panel two-panel layout (2026-10-25): `.cm-cols` is now a two-column grid (1fr + 256px, stacks under
  700px). Left `.cm-left`: notes editor, then Checklist. Right `.cm-right` (divider line on its left): Labels,
  Images, then the combined "Priority & due date" section (`.cm-prio-sec`; the `#cm-priority` toggle and
  the full-width `#cm-due` picker stack in `.cm-prio-row`). Spacing, chip size,
  thumbnail size (54px min), checklist row padding and notes min-height were tightened. All element ids are
  unchanged, so no JS changes. Asset-only change (no rebuild).
- Calendar views (2026-10-26): the calendar bar has only Month / Year (`#cal-modes`, `data-cal-mode`; `App.calMode`,
  persisted in `kanban.calmode.v1`; stale week/day/agenda values fall back to month). Year = 12 compact months
  (`yearViewHtml`); click a day to select it, double-click a day or click a month name to open that month
  (`openCalMonth`). Mouse wheel / trackpad over `.cal-main`: one step up = previous month (previous year in Year
  view), down = next, throttled with a short lock (`bindCalendar`). Prev/Next/Today buttons step the same way.
- Motion override shortcut fix (2026-10-26): Ctrl/Cmd+Shift+M now has its own capture-phase `window` listener
  (`bindMotionShortcut`), uses the physical key (`e.code === 'KeyM'`) and works from inside text fields and the
  notebook (the old branch sat after the `typing` guard, so it never fired with focus in an input).
- Window controls (2026-10-26): `.win-ctrl` is 54px wide (was 46px).
- Notebook pages are view-only by default (2026-10-26): `#nb-edit` (Edit / Done, Alt+E) toggles
  `.notebook.nb-editing`. In view mode the title is read-only, `#nb-body` has `contenteditable=false`, and the
  formatting bar, Link card, unlink x and Delete are hidden (Pin, Copy and Make card stay). Opening the sheet,
  selecting a page, undoing a delete and closing all reset to view mode; a brand-new or blank page opens in edit
  mode. Pages that are still blank on close are discarded as before. No data change.
- Sticky notes theme retired (2026-10-28): removed from `S.THEMES`, the theme picker (12 themes now),
  the `sticky` sound kit and its `KITS.sticky` fallbacks, every `[data-theme="sticky"]` /
  `[data-theme="sticky"][data-alt="1"]` CSS rule, the sticky cursors, the sticky `#bg` layers and the
  now-unused `bg-scroll-y-25` keyframe. `claude` is now the fallback for retired/unknown theme names and
  the starting theme for new boards (`js/state.js` `themeOf()` / `defaultBoard()`, `index.html`
  `data-theme`). The dead `data-note`/`data-tilt` card attributes and `hashStr()` are gone; boards saved
  with `theme:"sticky"` normalize to `claude` on load and rewrite that way. Verified in an isolated copy:
  old sticky board opens as Claude light + dark, 12 picker options, no Sticky entry, 12 sound kits, all
  themes cycle both directions with no console errors, and a fresh board starts on Claude. Asset-only
  change; release exe remains 968,704 bytes.
- Handover feature pass (2026-10-28): four requests implemented together.
  - Search now covers notebook pages: `searchMatches()` adds `out.notebook` (matched on page title +
    `S.plainText(body)`, pinned/updated order), `matchHits()` shows a "Page" excerpt, `searchRow()`
    adds the Note kind/word count, the popover groups Board / Calendar / Notebook / Archive, and
    clicking a row calls the new `KanbanNotebook.openPage(id)` (opens the sheet, selects the page,
    focuses `#notebook`).
  - Motion override is focus-scoped: `motionSetting()` is the stored pref; `MOTION_FOCUS` +
    `bindMotionFocus()` track `window` focus/blur and `visibilitychange`; `syncMotionAttr()` writes
    `on` only when both are true, else `auto`; the menu still shows the stored setting.
  - Cards grow with content: `fitCardNotes()` clamp(5..24 lines) replaces the fixed 6.4em clamp
    (CSS fallback 7.3em), and `fitNotes()` auto-sizes `#cm-desc` to `min(scrollHeight, 60vh)`
    (`.cm-left .rte-body` fallback 60vh).
  - Tab no longer traverses focus: `bindTabNotebook()` (capture-phase `window`, all plain/shift Tabs
    `preventDefault`ed) replaces `notebookAllowed()` and the old `bindKeyboard` Tab branches; it
    toggles the sheet from every view, is swallowed while a dialog/menu/picker is open, closes the
    search popover and blurs a field on open. `#notebook` gained `tabindex="-1"`.
  Verified in an isolated copy by CDP at 1280x800: Tab opens/closes from body, search field, notebook
  fields and Calendar view without moving focus; card modal blocks it; Ctrl+Tab still cycles views;
  notebook body-only search returns the page and opens it; blur -> `data-motion="auto"` with the menu
  still On, focus -> `on`, persists across reload; a long note grew to the 418px cap with `.clipped`,
  a medium note showed fully at 223px, and `#cm-desc` grew 88 -> 398 -> 480px (scroll); board state
  survived reload; a Calendar-start/reload kept notes on the CSS fallback (no pinned 5-line clamp) and
  the board refit them on view switch; `node --check` clean. Asset-only change; release exe remains
  968,704 bytes.
- Card body width (2026-10-28): `.card-panel` max-width 868 -> 1085px (+25%). The right column stays
  256px, so the notes column goes 570 -> 785px at 1280x800 and the notes editor auto-size (60vh cap)
  still measures correctly in the wider box. Verified by CDP at 1280x800 (panel 1085, body 1083,
  notes 783) plus a screenshot and a 12-paragraph auto-size pass; asset-only, exe stays 968,704 bytes.
- Checklist reordering (2026-11-01): checklist items in the card panel can be reordered by dragging
  the grip that now sits left of each row, or with the up/down arrow buttons that appear on row
  hover (disabled at the two ends). The order is just the card's existing `checklist` array, so
  backups, imports and the board-card checklist need no format change; new state helpers are
  `S.moveChecklistItem(board, cardId, itemId, toIndex)` and `S.setChecklistOrder(board, cardId,
  orderedIds)`. Verified by CDP in an isolated `data-folder.txt` target: button down/up moved items
  and rewrote `kanban-backup-latest.json` in the new order, the end buttons reported `disabled`,
  synthetic grip drags moved items both down (dropped on a lower row's lower half) and up (upper
  half, `drop-before` marker on the target, `.cl-dragging`/markers cleaned up, `App.checkDrag`
  reset), the order survived a page reload, the board card listed the same order, and checkbox
  toggle / edit / add / delete still work. Screenshots at 1280x800 in Claude (light) and Genshin
  (dark, round icon buttons). Asset-only change (no rebuild); release exe remains 968,704 bytes.

- Reminders, FFXVI removal, Pixel revamp (2026-11-24): added the 7/3/0-day reminder panel (section 6), removed
  the FFXVI theme with its particles, sounds, cursors and Barlow font-face, and rebuilt Pixel as a cosy farm
  theme (wooden frames, paper cards, crop icons, seasonal day/night valley, original pixel font, cursors and
  sound kit; now native-light). Verified in an isolated copy at 1280x800: 8 Node tests for the reminder logic,
  dismiss/Later/Got it/relaunch/day-change, all 11 themes with the panel visible, Pixel day/night/four
  seasons, Medium/Low/reduced motion, 60 fps with 27 animations, no console errors. Asset-only change (no
  rebuild); release exe remains 968,704 bytes.
- Reload + sound fixes (2026-11-24): a page reload (F5) no longer brings back the launch-time board (see
  section 5, `kanban.live.v1`), and `sfxStats()` reads `c.cards` instead of the missing `c.cardIds`, so the
  add/check/uncheck/move/archive/restore/delete sounds play again. Verified in an isolated copy: reload,
  edit + reload in the same tick, notebook typing inside the debounce, full and damaged localStorage, and
  disk-wins on relaunch. Asset-only change (no rebuild).
- v1.1 (2026-11-24): motion override on by default; smoothness pass (keyed rendering, content-visibility, batched
  saves, I/O thread, capped search rows, background rests when unfocused, fewer Genshin animations, no blank
  flash at start); signed updater; page embedded in the exe; published to GitHub. Measured with 300 cards on a
  9800X3D: checkbox 111 -> 4 ms, note keystroke 104 -> 4, list menu 103 -> 1, theme switch 109 -> 22, back to
  Board 109 -> 7, search keystroke 215 -> 30. Idle cost per theme was already within measurement noise.
- Pixel scale-down (2026-11-25): text about 14% smaller (card title 15.5 -> 13.5px, notes 14 -> 12.5, list title 18 -> 16),
  8px frames (4 rings), lists 294px, tighter padding/gaps, so Pixel matches the other themes' density (same test list
  733 -> 617px tall; others 565-641). Bold W reshaped in the pixel font. Page-only, but needs a rebuild to show.
- Stardew rename + farm coverage (2026-11-26): the Pixel theme is labelled "Stardew" in the picker and the
  theme button tooltip (id unchanged). The farm canvas now has `min-width/min-height: 100%` and repaints from a
  `ResizeObserver` on `#pixel-farm` (plus `visibilitychange`), so a hidden-then-maximized window no longer leaves
  the flat `--pf-sky` showing at the right/bottom when a `resize` event is missed. Page-only, needs a rebuild.
