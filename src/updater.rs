//! Update channel: GitHub Releases of the public repo.
//!
//!  - Nothing happens until the user presses "Check for updates", and nothing is downloaded until
//!    they approve the version that was found.
//!  - Only this side talks to GitHub. The page can ask for "check" and "install" and gets a status
//!    back; it cannot point a download anywhere.
//!  - No credentials: the repo is public, so the app holds no token to leak.
//!  - HTTPS only (redirects included), TLS 1.2+, through Windows' own TLS. Download links must be
//!    this repo's own release downloads.
//!  - Every release exe carries an Ed25519 signature over its version and SHA-256, made with a key
//!    that never leaves the developer's machine. Unsigned, altered or re-labelled files are
//!    rejected, and only newer versions install.

use crate::signing;
use ed25519_dalek::{Signature, VerifyingKey};
use serde_json::{json, Value};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

const REPO: &str = "meowyourhead/kanban-board";
const ASSET_EXE: &str = "kanban-rust.exe";
const ASSET_SIG: &str = "kanban-rust.exe.sig";
const MAX_EXE: u64 = 64 * 1024 * 1024;
const MAX_REPLY: u64 = 2 * 1024 * 1024;
const MAX_NOTES: usize = 900;

static PUBKEY: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/update_pubkey.bin"));

pub fn current_version() -> [u32; 3] {
    signing::parse_version(env!("CARGO_PKG_VERSION")).unwrap_or([0, 0, 0])
}

/// A build without the public key cannot verify anything, so it does not offer updates.
pub fn configured() -> bool {
    PUBKEY.len() == 32
}

/// Version info for the page (see bridge.rs).
pub fn page_info() -> String {
    json!({ "version": signing::display_version(current_version()), "updates": configured() })
        .to_string()
}

#[derive(Clone)]
struct Release {
    version: [u32; 3],
    exe_url: String,
    exe_size: u64,
    sig_url: String,
}

#[derive(Default)]
pub struct Updater {
    pending: Mutex<Option<Release>>,
    busy: Mutex<bool>,
}

pub enum Outcome {
    /// Send this JSON to the page.
    Reply(String),
    /// The new exe is in place; save everything, start it and quit.
    Restart,
}

fn error(msg: &str) -> Outcome {
    Outcome::Reply(json!({ "state": "error", "message": msg }).to_string())
}

impl Updater {
    fn exclusive(&self, work: impl FnOnce() -> Result<Outcome, String>) -> Outcome {
        if !configured() {
            return error("Updates are not set up in this build");
        }
        {
            let mut busy = self.busy.lock().unwrap_or_else(|e| e.into_inner());
            if *busy {
                return error("An update is already in progress");
            }
            *busy = true;
        }
        let result = work();
        *self.busy.lock().unwrap_or_else(|e| e.into_inner()) = false;
        result.unwrap_or_else(|e| error(&e))
    }

    fn set_pending(&self, release: Option<Release>) {
        *self.pending.lock().unwrap_or_else(|e| e.into_inner()) = release;
    }

    pub fn check(&self) -> Outcome {
        self.exclusive(|| {
            self.set_pending(None);
            let response = agent()?
                .get(&format!("https://api.github.com/repos/{}/releases/latest", REPO))
                .set("Accept", "application/vnd.github+json")
                .set("X-GitHub-Api-Version", "2022-11-28")
                .call()
                .map_err(describe)?;
            let body = read_limited(response, MAX_REPLY)?;
            let reply: Value = serde_json::from_slice(&body)
                .map_err(|_| "GitHub sent an unexpected reply".to_string())?;
            let Some((release, notes)) = newer_release(&reply, current_version())? else {
                return Ok(Outcome::Reply(json!({ "state": "latest" }).to_string()));
            };
            let version = signing::display_version(release.version);
            self.set_pending(Some(release));
            Ok(Outcome::Reply(
                json!({ "state": "available", "version": version, "notes": notes }).to_string(),
            ))
        })
    }

    /// Installs the release found by the last check. `progress` forwards status lines to the page.
    pub fn install(&self, progress: impl Fn(String)) -> Outcome {
        self.exclusive(|| {
            let release = self
                .pending
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .clone()
                .ok_or("Check for updates first")?;
            let agent = agent()?;
            let sig = fetch(&agent, &release.sig_url, 4096)?;
            let exe = fetch(&agent, &release.exe_url, release.exe_size)?;
            if exe.len() as u64 != release.exe_size {
                return Err("The download was incomplete. Try again.".into());
            }
            verify(PUBKEY, release.version, &exe, &sig)?;
            if !exe.starts_with(b"MZ") {
                return Err("The update file is not a Windows program".into());
            }
            progress(json!({ "state": "installing", "message": "Restarting…" }).to_string());
            let current = std::env::current_exe().map_err(|_| "Can't find the app's own file")?;
            swap_exe(&current, &exe)?;
            Ok(Outcome::Restart)
        })
    }
}

/// The release in a GitHub reply, if it is newer than `current` and looks exactly as expected.
fn newer_release(reply: &Value, current: [u32; 3]) -> Result<Option<(Release, String)>, String> {
    let tag = reply["tag_name"].as_str().unwrap_or_default();
    let version =
        signing::parse_version(tag).ok_or("The latest release has an unreadable version")?;
    if version <= current {
        return Ok(None);
    }
    let assets = reply["assets"]
        .as_array()
        .ok_or("The latest release has no files")?;
    let prefix = format!("https://github.com/{}/releases/download/", REPO);
    let find = |name: &str| -> Result<(String, u64), String> {
        let asset = assets
            .iter()
            .find(|a| a["name"].as_str() == Some(name))
            .ok_or_else(|| format!("The latest release is missing {}", name))?;
        let url = asset["browser_download_url"].as_str().unwrap_or_default();
        if !url.starts_with(&prefix) || !url.ends_with(&format!("/{}", name)) || url.contains("..") {
            return Err("The latest release has an unexpected download link".into());
        }
        Ok((url.to_string(), asset["size"].as_u64().unwrap_or(0)))
    };
    let (exe_url, exe_size) = find(ASSET_EXE)?;
    let (sig_url, _) = find(ASSET_SIG)?;
    if exe_size == 0 || exe_size > MAX_EXE {
        return Err("The update file has an unexpected size".into());
    }
    let notes: String = reply["body"]
        .as_str()
        .unwrap_or_default()
        .replace('\r', "")
        .trim()
        .chars()
        .take(MAX_NOTES)
        .collect();
    let release = Release { version, exe_url, exe_size, sig_url };
    Ok(Some((release, notes)))
}

fn verify(pubkey: &[u8], version: [u32; 3], exe: &[u8], sig_file: &[u8]) -> Result<(), String> {
    let check = || -> Option<()> {
        let key = VerifyingKey::from_bytes(pubkey.try_into().ok()?).ok()?;
        let hex = std::str::from_utf8(sig_file).ok()?;
        let bytes = signing::from_hex(hex.trim_start_matches('\u{feff}'))?;
        let sig = Signature::from_bytes(bytes.as_slice().try_into().ok()?);
        key.verify_strict(&signing::message(version, exe), &sig).ok()
    };
    check().ok_or_else(|| {
        "The update's signature is not valid, so it was not installed".to_string()
    })
}

fn side_files(exe: &Path) -> (PathBuf, PathBuf) {
    let name = exe
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    (
        exe.with_file_name(format!("{}.new", name)),
        exe.with_file_name(format!("{}.old", name)),
    )
}

/// Windows lets a running exe be renamed (not overwritten): current -> .old, new -> current.
/// Any failure puts the original back.
fn swap_exe(exe: &Path, bytes: &[u8]) -> Result<(), String> {
    let (new, old) = side_files(exe);
    let denied = || {
        "Can't write next to the app. Move it to a folder you can write to and try again.".to_string()
    };
    let _ = std::fs::remove_file(&new);
    let _ = std::fs::remove_file(&old);
    if std::fs::write(&new, bytes).is_err() {
        let _ = std::fs::remove_file(&new);
        return Err(denied());
    }
    if std::fs::rename(exe, &old).is_err() {
        let _ = std::fs::remove_file(&new);
        return Err(denied());
    }
    if std::fs::rename(&new, exe).is_err() {
        let _ = std::fs::rename(&old, exe);
        let _ = std::fs::remove_file(&new);
        return Err(denied());
    }
    Ok(())
}

/// Starts the freshly installed exe. It waits for this process to finish (see single_instance.rs).
pub fn relaunch() -> std::io::Result<()> {
    std::process::Command::new(std::env::current_exe()?)
        .arg(AFTER_UPDATE)
        .spawn()
        .map(|_| ())
}

pub const AFTER_UPDATE: &str = "--after-update";

/// Removes what an update left behind (the previous exe may still be closing).
pub fn clean_up() {
    let Ok(exe) = std::env::current_exe() else {
        return;
    };
    let (new, old) = side_files(&exe);
    if !new.exists() && !old.exists() {
        return;
    }
    std::thread::spawn(move || {
        for _ in 0..40 {
            let _ = std::fs::remove_file(&new);
            let _ = std::fs::remove_file(&old);
            if !new.exists() && !old.exists() {
                break;
            }
            std::thread::sleep(Duration::from_millis(500));
        }
    });
}

fn agent() -> Result<ureq::Agent, String> {
    let tls = native_tls::TlsConnector::builder()
        .min_protocol_version(Some(native_tls::Protocol::Tlsv12))
        .build()
        .map_err(|_| "Couldn't set up a secure connection".to_string())?;
    Ok(ureq::AgentBuilder::new()
        .tls_connector(Arc::new(tls))
        .https_only(true)
        .redirects(5)
        .timeout_connect(Duration::from_secs(10))
        .timeout(Duration::from_secs(180))
        .user_agent(concat!("Kanban-Board-Updater/", env!("CARGO_PKG_VERSION")))
        .build())
}

fn fetch(agent: &ureq::Agent, url: &str, limit: u64) -> Result<Vec<u8>, String> {
    let response = agent
        .get(url)
        .set("Accept", "application/octet-stream")
        .call()
        .map_err(describe)?;
    if response.status() != 200 {
        return Err("The download failed. Try again.".into());
    }
    read_limited(response, limit)
}

fn read_limited(response: ureq::Response, limit: u64) -> Result<Vec<u8>, String> {
    let mut buf = Vec::new();
    response
        .into_reader()
        .take(limit + 1)
        .read_to_end(&mut buf)
        .map_err(|_| "The connection dropped. Try again.".to_string())?;
    if buf.len() as u64 > limit {
        return Err("GitHub sent more data than expected".into());
    }
    Ok(buf)
}

fn describe(e: ureq::Error) -> String {
    match e {
        ureq::Error::Status(403 | 429, _) => {
            "GitHub is limiting requests right now. Try again later.".into()
        }
        ureq::Error::Status(404, _) => "No release found on GitHub".into(),
        ureq::Error::Status(code, _) => format!("GitHub returned an error ({})", code),
        ureq::Error::Transport(_) => {
            "Couldn't reach GitHub. Check your internet connection.".into()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    fn reply(tag: &str, base: &str) -> Value {
        json!({ "tag_name": tag, "body": "  Notes\r\nhere ", "assets": [
            { "name": ASSET_EXE, "size": 1000, "browser_download_url": format!("{base}{ASSET_EXE}") },
            { "name": ASSET_SIG, "size": 128, "browser_download_url": format!("{base}{ASSET_SIG}") }
        ]})
    }

    #[test]
    fn only_newer_releases_from_this_repo() {
        let base = format!("https://github.com/{REPO}/releases/download/v1.2/");
        let (r, notes) = newer_release(&reply("v1.2", &base), [1, 1, 0]).unwrap().unwrap();
        assert_eq!((r.version, r.exe_size, notes.as_str()), ([1, 2, 0], 1000, "Notes\nhere"));
        assert!(newer_release(&reply("v1.1", &base), [1, 1, 0]).unwrap().is_none());
        assert!(newer_release(&reply("v1.0.9", &base), [1, 1, 0]).unwrap().is_none());
        assert!(newer_release(&reply("nightly", &base), [1, 1, 0]).is_err());
        for bad in [
            "https://github.com/someone/else/releases/download/v1.2/".to_string(),
            "http://github.com/meowyourhead/kanban-board/releases/download/v1.2/".to_string(),
            format!("https://github.com/{REPO}/releases/download/../../../evil/"),
        ] {
            assert!(newer_release(&reply("v1.2", &bad), [1, 1, 0]).is_err(), "{bad}");
        }
        let mut missing = reply("v1.2", &base);
        missing["assets"].as_array_mut().unwrap().pop();
        assert!(newer_release(&missing, [1, 1, 0]).is_err());
        let mut huge = reply("v1.2", &base);
        huge["assets"][0]["size"] = json!(MAX_EXE + 1);
        assert!(newer_release(&huge, [1, 1, 0]).is_err());
    }

    #[test]
    fn signatures() {
        let key = SigningKey::from_bytes(&[7u8; 32]);
        let public = key.verifying_key().to_bytes();
        let exe = b"MZ program".to_vec();
        let sig = signing::to_hex(&key.sign(&signing::message([1, 2, 0], &exe)).to_bytes());
        assert!(verify(&public, [1, 2, 0], &exe, sig.as_bytes()).is_ok());
        assert!(verify(&public, [1, 2, 0], &exe, format!("\u{feff}{sig}\n").as_bytes()).is_ok());
        assert!(verify(&public, [1, 3, 0], &exe, sig.as_bytes()).is_err()); // re-labelled
        assert!(verify(&public, [1, 2, 0], b"MZ prograM", sig.as_bytes()).is_err()); // altered
        assert!(verify(&public, [1, 2, 0], &exe, b"00").is_err());
        assert!(verify(&public, [1, 2, 0], &exe, b"").is_err());
        assert!(verify(b"", [1, 2, 0], &exe, sig.as_bytes()).is_err());
        let other = SigningKey::from_bytes(&[8u8; 32]).verifying_key().to_bytes();
        assert!(verify(&other, [1, 2, 0], &exe, sig.as_bytes()).is_err());
    }

    #[test]
    fn swap_keeps_a_working_exe() {
        let dir = std::env::temp_dir().join(format!("kanban-swap-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let exe = dir.join("app.exe");
        std::fs::write(&exe, b"old").unwrap();
        swap_exe(&exe, b"new").unwrap();
        assert_eq!(std::fs::read(&exe).unwrap(), b"new");
        assert_eq!(std::fs::read(dir.join("app.exe.old")).unwrap(), b"old");
        assert!(!dir.join("app.exe.new").exists());
        // no running exe to move aside: nothing is left half-done
        let missing = dir.join("gone.exe");
        assert!(swap_exe(&missing, b"new").is_err());
        assert!(!missing.exists() && !dir.join("gone.exe.new").exists());
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
