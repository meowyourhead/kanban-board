use serde_json::Value;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub const FOLDER_NAME: &str = "Kanban Auto-Backups";
pub const LATEST: &str = "kanban-backup-latest.json";
pub const LATEST_JS: &str = "kanban-backup-latest.js";
pub const KEEP: usize = 30;

pub const README: &str = concat!(
    "Automatic backups of your Kanban board\r\n\r\n",
    "- kanban-backup-latest.json is rewritten after every change and is loaded when the board starts.\r\n",
    "- kanban-backup-<date>_<time>.json is a dated copy saved when the board is closed (the newest 30 are kept).\r\n",
    "- To go back to an older copy: close the board, copy that file over kanban-backup-latest.json, start the board.\r\n\r\n",
    "This folder is managed by the board. Copying it is safe; please do not edit files while the board is open.\r\n"
);

pub struct Loaded {
    pub board: Value,
    pub saved_at: u64,
    pub json: String,
    pub from: String,
}

pub struct SaveResult {
    pub ok: bool,
    pub error: Option<String>,
}

impl SaveResult {
    fn ok() -> Self {
        SaveResult { ok: true, error: None }
    }

    fn err(code: impl Into<String>) -> Self {
        SaveResult { ok: false, error: Some(code.into()) }
    }
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn stamp() -> String {
    chrono::Local::now().format("%Y-%m-%d_%H-%M-%S").to_string()
}

pub fn is_copy(name: &str) -> bool {
    let Some(rest) = name.strip_prefix("kanban-backup-") else {
        return false;
    };
    let Some(rest) = rest.strip_suffix(".json") else {
        return false;
    };
    let b = rest.as_bytes();
    if b.len() != 19 {
        return false;
    }
    for (i, c) in b.iter().enumerate() {
        let sep = matches!(i, 4 | 7 | 10 | 13 | 16);
        let sep_ok = match i {
            4 | 7 | 13 | 16 => *c == b'-',
            10 => *c == b'_',
            _ => false,
        };
        if sep {
            if !sep_ok {
                return false;
            }
        } else if !c.is_ascii_digit() {
            return false;
        }
    }
    true
}

/// Dated copies, newest first (the names sort by date).
pub fn copies(dir: &Path) -> Vec<String> {
    let mut names: Vec<String> = match fs::read_dir(dir) {
        Ok(rd) => rd
            .filter_map(|e| e.ok())
            .filter_map(|e| e.file_name().into_string().ok())
            .filter(|n| is_copy(n))
            .collect(),
        Err(_) => Vec::new(),
    };
    names.sort();
    names.reverse();
    names
}

pub fn valid_board(text: &str) -> Option<Value> {
    match serde_json::from_str::<Value>(text) {
        Ok(v) if v.is_object() && v.get("columns").map(|c| c.is_array()).unwrap_or(false) => Some(v),
        _ => None,
    }
}

fn mtime_ms(path: &Path) -> u64 {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or_else(now_ms)
}

/// Newest readable board: latest.json first, then the newest valid dated copy.
pub fn load(dir: &Path) -> Option<Loaded> {
    let mut candidates = vec![LATEST.to_string()];
    candidates.extend(copies(dir));
    for name in candidates {
        let path = dir.join(&name);
        let Ok(text) = fs::read_to_string(&path) else {
            continue;
        };
        if let Some(board) = valid_board(&text) {
            return Some(Loaded {
                board,
                saved_at: mtime_ms(&path),
                json: text,
                from: name,
            });
        }
    }
    None
}

pub fn writable(dir: &Path) -> bool {
    if fs::create_dir_all(dir).is_err() {
        return false;
    }
    let probe = dir.join(".write-test");
    if fs::write(&probe, b"x").is_err() {
        return false;
    }
    let _ = fs::remove_file(&probe);
    true
}

/// Where the backup folder lives: data-folder.txt (first line) > next to the app > the user profile.
pub fn resolve_dir(app_dir: &Path, fallback_base: &Path) -> PathBuf {
    let mut base = app_dir.to_path_buf();
    if let Ok(text) = fs::read_to_string(app_dir.join("data-folder.txt")) {
        if let Some(line) = text.lines().next() {
            let custom = line.trim();
            if !custom.is_empty() {
                base = PathBuf::from(custom);
            }
        }
    }
    let dir = if base.file_name().map(|n| n == FOLDER_NAME).unwrap_or(false) {
        base
    } else {
        base.join(FOLDER_NAME)
    };
    if writable(&dir) {
        return dir;
    }
    let fallback = fallback_base.join(FOLDER_NAME);
    let _ = fs::create_dir_all(&fallback);
    fallback
}

pub fn write_atomic(path: &Path, data: &[u8]) -> io::Result<()> {
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(".tmp");
    let tmp = PathBuf::from(tmp);
    fs::write(&tmp, data)?;
    match fs::rename(&tmp, path) {
        Ok(()) => Ok(()),
        Err(first) => {
            let _ = fs::remove_file(path);
            match fs::rename(&tmp, path) {
                Ok(()) => Ok(()),
                Err(second) => {
                    let _ = fs::remove_file(&tmp);
                    Err(if second.raw_os_error().is_some() { second } else { first })
                }
            }
        }
    }
}

fn error_code(e: &io::Error) -> String {
    match e.raw_os_error() {
        Some(n) => format!("OS{}", n),
        None => format!("{:?}", e.kind()),
    }
}

/// json: the board as JSON text. snapshot: also keep a dated copy (skipped if identical to the newest one).
pub fn save(dir: &Path, json: &str, snapshot: bool) -> SaveResult {
    if valid_board(json).is_none() {
        return SaveResult::err("INVALID");
    }
    if fs::create_dir_all(dir).is_err() {
        return SaveResult::err("ENOENT");
    }
    if let Err(e) = write_atomic(&dir.join(LATEST), json.as_bytes()) {
        return SaveResult::err(error_code(&e));
    }
    let wrapper = format!(
        "window.KANBAN_LAST_SESSION = {{\"savedAt\":{},\"board\":{}}};\n",
        now_ms(),
        json
    );
    if let Err(e) = write_atomic(&dir.join(LATEST_JS), wrapper.as_bytes()) {
        return SaveResult::err(error_code(&e));
    }
    let readme = dir.join("README.txt");
    if !readme.exists() {
        let _ = fs::write(&readme, README.as_bytes());
    }
    if snapshot {
        let names = copies(dir);
        let mut same = false;
        if let Some(newest) = names.first() {
            if let Ok(text) = fs::read_to_string(dir.join(newest)) {
                same = text == json;
            }
        }
        if !same {
            let file = dir.join(format!("kanban-backup-{}.json", stamp()));
            if let Err(e) = write_atomic(&file, json.as_bytes()) {
                return SaveResult::err(error_code(&e));
            }
            for old in copies(dir).into_iter().skip(KEEP) {
                let _ = fs::remove_file(dir.join(old));
            }
        }
    }
    SaveResult::ok()
}
