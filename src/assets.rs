//! The page (html, css, js, fonts) is compiled into the exe, so one file is the whole program and an
//! update replaces everything at once. build.rs writes the table.
//!
//! KANBAN_DEV=1 (set by tools\dev-run.cmd) serves the files on disk instead, for working on the UI
//! without rebuilding. Files that are not embedded (a font too large or not ours to ship) are still
//! read from disk when they are there.

use std::sync::OnceLock;

include!(concat!(env!("OUT_DIR"), "/assets.rs"));

fn dev() -> bool {
    static DEV: OnceLock<bool> = OnceLock::new();
    *DEV.get_or_init(|| {
        cfg!(debug_assertions) || std::env::var_os("KANBAN_DEV").is_some_and(|v| v == "1")
    })
}

/// `path` is relative with forward slashes, e.g. "js/app.js".
pub fn get(path: &str) -> Option<&'static [u8]> {
    if dev() {
        return None;
    }
    ASSETS
        .binary_search_by(|(name, _)| (*name).cmp(path))
        .ok()
        .map(|i| ASSETS[i].1)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn table_is_sorted_and_complete() {
        assert!(ASSETS.windows(2).all(|w| w[0].0 < w[1].0));
        for path in ["index.html", "css/styles.css", "js/app.js", "js/state.js", "js/pixelfarm.js"] {
            let found = ASSETS.iter().find(|(name, _)| *name == path);
            assert!(found.is_some_and(|(_, bytes)| !bytes.is_empty()), "{path}");
        }
        // every local script and stylesheet the page loads is inside the exe
        let html = std::str::from_utf8(ASSETS.iter().find(|a| a.0 == "index.html").unwrap().1).unwrap();
        for part in html.split("src=\"").skip(1) {
            let src = part.split('"').next().unwrap();
            if src.ends_with(".js") && !src.starts_with("Kanban") {
                assert!(ASSETS.iter().any(|(name, _)| *name == src), "{src}");
            }
        }
    }
}
