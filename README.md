# Kanban Board

A lightweight, fully offline Kanban board that runs straight from your file system.
No server, no build step, no account — double-click `index.html` and work.

Built for low-end machines: ~55 KB of JavaScript total (including the vendored
drag-and-drop library), system fonts, inline SVG icons, zero network requests.

## Run it

Double-click **`index.html`** (Chrome or Edge recommended). That's it.

## Features

- **Columns (lists)** — add, rename (click the title), collapse/expand, reorder by
  dragging the header, per-list **WIP limits** (count badge warns when exceeded),
  sort by priority / due date / created, clear all cards, delete list
- **Cards** — drag within or between columns, title, description, **priority**
  (Low / Medium / High / Urgent), **due date** with **overdue highlighting**,
  assignee, **labels** (create, color, delete), **checklists** with progress bar
- **Search** — filter cards by title, description, assignee, or label name
  (press `/`)
- **Stats** — live card count, overdue count, and search match count in the toolbar
- **Five themes** — Light, Dark, Sticky notes, Blueprint, and Factory; pick one
  from the toolbar picker, preference is saved
- **Import / export** — board as a portable JSON file; import replaces the current
  board (with confirmation)
- **Undo** — delete card / clear list / delete list / reset board can all be undone
  with **Ctrl+Z** or the toast button
- **Keyboard shortcuts**

| Shortcut       | Action                          |
| -------------- | ------------------------------- |
| `/` or `Ctrl+K`| Focus search                    |
| `N`            | New card (first list)           |
| `L`            | Add a new list                  |
| `Ctrl+Z`       | Undo last destructive action    |
| `Esc`          | Close dialogs / cancel composers|

## Data & privacy

Everything is stored in your browser's `localStorage` under the key
`kanban.board.v1` — per browser profile, per machine. Nothing is ever sent over
the network. To back up or move your board, use **Export** in the toolbar; to
restore, use **Import**.

> Note: clearing site data in the browser (or using a private window) removes the
> board. Keep a JSON export if it matters.

## Project layout

```
index.html              app shell (toolbar, board, modals)
css/styles.css          design system, five themes (light / dark / sticky / blueprint / factory)
js/state.js             pure data model + operations (no DOM) — the tested core
js/app.js               UI layer: rendering, drag & drop, modals, shortcuts
vendor/Sortable.min.js  vendored drag-and-drop library (Sortable.js)
tests/state.test.js     Node.js test suite for the core data model
package.json            dev scripts (test + re-vendoring)
```

## Development

Requires only Node.js (no other dependencies at runtime).

```sh
npm install        # installs sortablejs (dev only)
npm test           # runs the core test suite (node --test)
npm run vendor     # re-copies Sortable.min.js into vendor/
```

`state.js` is a UMD module: it attaches to `window.KanbanState` in the browser
and to `module.exports` in Node, so the whole data model is testable headlessly.

### Why classic scripts instead of ES modules?

Chrome/Edge block `import` statements on `file://` pages (CORS), which would
break the double-click launch. Classic scripts + global namespaces keep the app
usable with zero tooling.
