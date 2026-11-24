# Kanban Board

A lightweight, offline Kanban board for Windows: a small native Rust program (tao + WebView2) around a
plain HTML/CSS/JS page. Board, calendar with reminders, archive, notebook, search and eleven themes.

**Download:** get `kanban-rust.exe` from the [latest release](https://github.com/meowyourhead/kanban-board/releases/latest),
put it in a folder you can write to and run it. Your board is kept in a `Kanban Auto-Backups` folder beside it.
Needs the WebView2 runtime (already part of Windows 11).

**Updates:** settings menu > *Check for updates*. The app only contacts GitHub when you press it, and only
installs a version you approve. Releases are signed (Ed25519) and checked before installing.

**Build:** run `Build.cmd`, or `cargo build --release`.

More: [README-RUST.md](README-RUST.md) (user guide), [AGENTS.md](AGENTS.md) (developer notes).

Some themes are fan-made tributes; this project is not affiliated with any game or company. Bundled fonts are
under the SIL Open Font License (see `vendor/fonts`).
