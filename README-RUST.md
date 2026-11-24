# Kanban Board — standalone Rust build

The same offline Kanban board, with the identical HTML/CSS/JS interface, hosted by a small
native program instead of Electron. It uses **WebView2**, the browser engine that ships with
Windows 10 and 11 — no Node, no Electron, and nothing to install on the target PC.

## Requirements

- Windows 10 or 11, 64-bit.
- The Microsoft Edge **WebView2 runtime**. It is included with Windows 10/11 by default; if the
  app reports that the webview could not be created, install the free Evergreen runtime from
  Microsoft.

## Build it

**Build.cmd** is only needed when you change the program and want a new `kanban-rust.exe`. It
checks for Rust (installing a minimal stable toolchain if needed), runs the release build, copies
the finished program next to itself and pauses so you can read any errors. If you only use the app,
you never need to run it.

1. Double-click **Build.cmd**.
   - If Rust is not installed, it downloads and installs the stable toolchain first (one time,
     needs internet).
   - The first build downloads the libraries it uses and takes a few minutes.
2. The finished program is copied next to the script as **kanban-rust.exe**.

Building also needs the Microsoft C++ build tools (the linker). Visual Studio 2022 Build Tools
with "Desktop development with C++" is enough; if the build stops because `link.exe` is missing,
install that component (or let the Rust installer at <https://rustup.rs> add it).

Command line, if you prefer:

    cargo build --release
    copy target\release\kanban-rust.exe .

The build embeds the app icon (`build\icon.ico`) in the executable and in the window.

## Run it

Double-click **kanban-rust.exe**. Closing the window is enough to quit. Starting it a second time
does nothing while the first copy is running.

The app uses a frameless top bar: drag any empty part of it to move the window, use the controls at
the right to minimize, maximize or close, and resize from the window edges. While maximized, edge
resizing is disabled and the top/side edges keep the normal cursor; the controls still reach the
screen corners, so you can throw the pointer into the top-right corner to close. Dragging the top bar
while maximized restores the window first and keeps it under the pointer. Press **Ctrl+Up** or
**Ctrl+Down** to change the text size, **Ctrl+F** to jump straight into search, and **Ctrl+Tab**
(or **Ctrl+Shift+Tab**) to cycle Board, Calendar and Archive. **Tab** opens or closes the Notebook
from anywhere in the app and no longer steps focus between controls. Browsers use the same page
without the custom window controls.

To add a shortcut to your desktop, run **Create-Desktop-Shortcut.cmd** once. It points at this
copy of `kanban-rust.exe`, so keep the folder where it is or run the script again after moving it.

## GPU rendering

The app asks WebView2 to use GPU rendering by default: it ignores the software blocklist and
enables GPU rasterization and zero-copy. No script or special shortcut is needed. Start
`kanban-rust.exe` normally. If you need to troubleshoot a graphics problem, start it with
`--no-gpu` to use WebView2's standard defaults.

On laptops with switchable graphics, Windows may still choose the integrated GPU. In that case,
run **Enable-GPU-Rendering.cmd** once. It does not need administrator rights and:

- Sets Windows' per-app GPU preference for this copy of `kanban-rust.exe` to **High performance**.
- Creates an optional **Kanban (High Performance)** desktop shortcut.
- Leaves other applications and Windows' global visual-effects settings unchanged.

Run the script again if you move the folder. The Windows setting is stored under
`HKCU\Software\Microsoft\DirectX\UserGpuPreferences`. Updating the graphics driver and the
WebView2 Runtime is still recommended on older PCs.

## Where your board is kept

Everything sits next to the program, so the whole folder can be moved or copied:

    Kanban Auto-Backups\                 your board and its backups
        kanban-backup-latest.json        current board, rewritten after every change
        kanban-backup-latest.js          same data in a form the page loads at start-up
        kanban-backup-<date>_<time>.json dated copies, newest 30 kept
        README.txt
    images\                              pictures attached to cards (inside Kanban Auto-Backups)
    webview-data\                        interface preferences (theme, light/dark, sound, …)
    window-state.json                    window size and position
    kanban-rust.log                      start-up and error notes

- The backup format is identical to the Electron and browser versions, so boards can be moved
  between them by copying `Kanban Auto-Backups`.
- To keep the board somewhere else, create a file called `data-folder.txt` next to
  `kanban-rust.exe` and put that folder's path on the first line. If the folder is not
  writable, the app falls back to `%APPDATA%\Kanban Auto-Backups`.
- Deleting `webview-data` resets interface preferences only; your board is untouched.

## Copy it to a USB drive

Run **Copy-to-USB-Rust.cmd** and follow the prompts. You can also pass the destination directly:

    Copy-to-USB-Rust.cmd E:

The copy includes the program, the page and its assets, plus the optional
**Enable-GPU-Rendering.cmd** helper for the other PC. GPU rendering is already enabled by default;
run the helper only if a switchable-graphics laptop still selects its integrated GPU. It can also
copy your current board. On the other PC, double-click **kanban-rust.exe** inside the copied
folder.

## Differences from the Electron version

- **Notebook:** press **Tab** anywhere (even while typing in a field) to slide out a hidden
  notebook of free-form pages for quick notes. **Esc** or **Tab** closes it. Tab no longer moves
  focus between buttons and fields. Pages autosave with your board, can be pinned, linked to cards,
  copied as text or turned into a card. It is separate from the cards on the board.
- Cards grow with their content: a card's note uses up to 24 lines before fading out, and the notes
  editor in the card panel expands as you type (up to 60% of the window, then scrolls).
- No menu bar and no Chromium/Electron runtime folder; the whole build is a few MB plus assets.
- List headers no longer show a card-count badge; the WIP-limit outline still works.
- The top-left switch has three views: Board, Calendar and Archive. Archive is a normal tab, and
  the old topbar card counter is gone. Views fade in when switched, and **Ctrl+Tab** cycles them
  in order (**Ctrl+Shift+Tab** reverses).
- The window uses the system WebView2 engine, so rendering matches Microsoft Edge.
- Window size/position and interface preferences are stored next to the program (the Electron
  app kept them in the user profile).
- A custom app icon is embedded in the executable and shown in the taskbar.
- Calendar events can repeat every week or every month (optionally on a chosen day of the month).
  Older versions keep reading the board normally and simply show recurring events on their first
  date.
- The top search covers Board cards, Calendar events, Notebook pages and Archive cards in one
  Finder-style popover, grouped by view; clicking a result opens that view and the card/event, or
  opens the Notebook at the matched page. The calendar also marks matching days on the grid, and
  Archive uses the same field. **Ctrl+F** moves focus into the search field.
- **Updates:** **Check for updates** in the settings menu asks GitHub for a newer version, shows what changed
  and only installs it if you agree. Updates are signed; the app saves your board and restarts. Nothing is
  contacted until you press the button.
- The exe is self-contained: it needs no other files beside it (your board, preferences and log are still kept
  next to it).
- **Reminders:** calendar events and cards with a due date are announced a week before, 3 days before and
  on the day, in a panel at the bottom of the window (while the program is open). If it was closed on the
  day a reminder was due, it shows the next time you start it. **Got it** dismisses, **Later** hides until
  the next start or day. Weekly events skip the week-before reminder.
- The Pixel theme is a cosy farm: wooden frames, paper cards and a valley that follows the real season,
  with a night version in dark mode.
- The Mario, Persona 5, Sticky notes and FFXVI themes are retired. Boards that used them open with Claude.
- The Glass theme uses macOS-style cursors, and the Genshin theme uses the white-and-gold
  four-point star cursor. Its light mode picks one of seven elements each day and tints the sky,
  panels and a randomly drifting star field that leans subtly toward the pointer; the theme
  button names the current element. Dark mode keeps the gold interface.
- Selecting Cyberpunk, Genshin, Fallout or NieR switches the board to dark mode
  automatically; every other theme switches to light. The mode button can still switch any theme
  afterward.
- The Cyberpunk theme has a Night City edge HUD with vitals, quick slots, a minimap, an objective
  readout and weapon status. The HUD follows the pointer with a slight parallax and scanner blip;
  it is static at Medium graphics and hidden at Low graphics. The old cursor-following crosshair
  reticle is gone.

## Troubleshooting

- **Nothing appears:** read `kanban-rust.log` next to the program. A message about the webview
  means the WebView2 runtime is missing.
- **A crash or a blank window:** delete `webview-data` and start again. If that does not help,
  keep the log and the board folder for diagnosis.
- **Rendering is slow or effects are missing:** check the app's Graphics level first (graph icon,
  `Ctrl+G`, or `Ctrl+[` / `Ctrl+]`). On a switchable-graphics laptop, run
  `Enable-GPU-Rendering.cmd` once and restart the app. Windows' "Adjust for best performance"
  profile, or disabling "Animate controls and elements inside windows" under Performance Options,
  makes the webview report reduced motion; the app then intentionally stops theme animations.
  **Motion override** in the backup/settings menu (**Ctrl+Shift+M**) keeps them running anyway and is
  **On** by default; turn it off to follow Windows. The override applies only while the app window is focused;
  when you switch to another program the app goes back to following Windows' setting. Graphics
  Medium/Low still reduce the effects.
  Background movement, Genshin stars and the Pixel farm use compositor-friendly transforms, and
  blur/particle counts are reduced for integrated GPUs.
- **Build errors:** run `cargo build --release` in this folder to see the full messages.

## Development

Developer notes, file-format contracts, the verification checklist and the session handover
live in **AGENTS.md** (opencode reads it automatically when this folder is the working
directory). `tools\dev-run.cmd` starts the app with the DevTools port enabled, and
`tools\cdp.mjs` evaluates JavaScript or captures a screenshot from the running page.
