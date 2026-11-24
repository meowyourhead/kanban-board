use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_BYTES: usize = 40 * 1024 * 1024;
const WEEK_MS: u64 = 7 * 24 * 3600 * 1000;

pub fn valid_id(id: &str) -> bool {
    let Some((stem, ext)) = id.rsplit_once('.') else {
        return false;
    };
    if stem.is_empty() || stem.len() > 200 {
        return false;
    }
    if !stem
        .bytes()
        .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
    {
        return false;
    }
    matches!(ext, "webp" | "jpg" | "png" | "gif")
}

pub fn dir(data_dir: &Path) -> PathBuf {
    data_dir.join("images")
}

fn write_atomic(path: &Path, data: &[u8]) -> std::io::Result<()> {
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(".tmp");
    let tmp = PathBuf::from(tmp);
    fs::write(&tmp, data)?;
    match fs::rename(&tmp, path) {
        Ok(()) => Ok(()),
        Err(_) => {
            let _ = fs::remove_file(path);
            let res = fs::rename(&tmp, path);
            if res.is_err() {
                let _ = fs::remove_file(&tmp);
            }
            res
        }
    }
}

pub fn save(data_dir: &Path, id: &str, bytes: &[u8]) -> bool {
    if !valid_id(id) || bytes.is_empty() || bytes.len() > MAX_BYTES {
        return false;
    }
    let dir = dir(data_dir);
    if fs::create_dir_all(&dir).is_err() {
        return false;
    }
    write_atomic(&dir.join(id), bytes).is_ok()
}

pub fn read(data_dir: &Path, id: &str) -> Option<Vec<u8>> {
    if !valid_id(id) {
        return None;
    }
    fs::read(dir(data_dir).join(id)).ok()
}

fn mtime_ms(path: &Path) -> u64 {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or_else(|| {
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0)
        })
}

/// Housekeeping at start-up: images no card or event uses any more and that are over a week old are removed.
/// (An empty keep-list means "nothing known", so nothing is ever deleted then.)
pub fn gc(data_dir: &Path, keep: &[String]) -> usize {
    if keep.is_empty() {
        return 0;
    }
    let dir = dir(data_dir);
    let Ok(rd) = fs::read_dir(&dir) else {
        return 0;
    };
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let mut removed = 0;
    for entry in rd.filter_map(|e| e.ok()) {
        let Ok(name) = entry.file_name().into_string() else {
            continue;
        };
        if !valid_id(&name) || keep.iter().any(|k| k == &name) {
            continue;
        }
        let path = entry.path();
        if now.saturating_sub(mtime_ms(&path)) > WEEK_MS && fs::remove_file(&path).is_ok() {
            removed += 1;
        }
    }
    removed
}
