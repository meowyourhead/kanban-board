use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

fn find_rc() -> Option<PathBuf> {
    if let Ok(rc) = env::var("RC") {
        let path = PathBuf::from(rc);
        if path.is_file() {
            return Some(path);
        }
    }

    let roots = [
        env::var_os("ProgramFiles(x86)")
            .map(PathBuf::from)
            .map(|p| p.join("Windows Kits").join("10").join("bin")),
        env::var_os("ProgramFiles")
            .map(PathBuf::from)
            .map(|p| p.join("Windows Kits").join("10").join("bin")),
    ];

    let mut versions = Vec::new();
    for root in roots.into_iter().flatten() {
        if let Ok(entries) = fs::read_dir(&root) {
            for entry in entries.flatten() {
                let rc = entry.path().join("x64").join("rc.exe");
                if rc.is_file() {
                    versions.push(rc);
                }
            }
        }
    }
    versions.sort();
    versions.pop()
}

/// Every file the page needs, as a sorted (path, bytes) table for src/assets.rs.
fn embed_assets(manifest: &Path, out: &Path) {
    // zh-cn.ttf is the user's own copy of a commercial font; the rest are faces no theme uses any more.
    const SKIP: [&str; 5] = ["zh-cn", "anton-", "baloo-", "barlow-", "press-start-"];

    fn walk(dir: &Path, files: &mut Vec<PathBuf>) {
        println!("cargo:rerun-if-changed={}", dir.display());
        let Ok(entries) = fs::read_dir(dir) else {
            return;
        };
        for path in entries.flatten().map(|e| e.path()) {
            if path.is_dir() {
                walk(&path, files);
            } else {
                files.push(path);
            }
        }
    }

    let mut files = vec![manifest.join("index.html"), manifest.join("build").join("icon.png")];
    for dir in ["css", "js", "vendor"] {
        walk(&manifest.join(dir), &mut files);
    }
    let mut rows: Vec<(String, PathBuf)> = files
        .into_iter()
        .filter(|path| {
            let name = path.file_name().unwrap().to_string_lossy().to_ascii_lowercase();
            !name.ends_with(".txt") && !SKIP.iter().any(|s| name.starts_with(s))
        })
        .map(|path| {
            let rel = path.strip_prefix(manifest).unwrap().to_string_lossy().replace('\\', "/");
            (rel, path)
        })
        .collect();
    rows.sort();
    let mut code = String::from("pub static ASSETS: &[(&str, &[u8])] = &[\n");
    for (rel, path) in rows {
        println!("cargo:rerun-if-changed={}", path.display());
        code.push_str(&format!("    ({:?}, include_bytes!({:?})),\n", rel, path.to_string_lossy()));
    }
    code.push_str("];\n");
    fs::write(out.join("assets.rs"), code).expect("write assets.rs");
}

/// The public half of the release key (update_pubkey.txt) as raw bytes; empty when there is none.
fn embed_pubkey(manifest: &Path, out: &Path) {
    let file = manifest.join("update_pubkey.txt");
    println!("cargo:rerun-if-changed={}", file.display());
    let hex = fs::read_to_string(&file).unwrap_or_default();
    let hex = hex.trim();
    let mut key = Vec::new();
    if hex.len() == 64 && hex.is_ascii() {
        key = (0..32)
            .map(|i| u8::from_str_radix(&hex[2 * i..2 * i + 2], 16).expect("update_pubkey.txt is not hex"))
            .collect();
    } else {
        println!("cargo:warning=no update_pubkey.txt; this build cannot check for updates");
    }
    fs::write(out.join("update_pubkey.bin"), key).expect("write update_pubkey.bin");
}

fn main() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
    embed_assets(&manifest_dir, &out_dir);
    embed_pubkey(&manifest_dir, &out_dir);

    println!("cargo:rerun-if-changed=build/icon.ico");
    println!("cargo:rerun-if-changed=build.rs");

    if env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("windows") {
        return;
    }

    let manifest = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let icon = manifest.join("build").join("icon.ico");
    if !icon.is_file() {
        println!("cargo:warning=build/icon.ico not found; the exe keeps the default icon");
        return;
    }

    let Some(rc) = find_rc() else {
        println!("cargo:warning=rc.exe not found; the exe keeps the default icon");
        return;
    };

    let out = PathBuf::from(env::var("OUT_DIR").unwrap());
    let script = out.join("kanban-icon.rc");
    let resource = out.join("kanban-icon.res");
    let icon_literal = format!("{:?}", icon.to_string_lossy());
    if fs::write(&script, format!("1 ICON {}\n", icon_literal)).is_err() {
        println!("cargo:warning=could not write the icon resource script");
        return;
    }

    let status = Command::new(&rc)
        .arg("/nologo")
        .arg("/fo")
        .arg(&resource)
        .arg(&script)
        .status();

    match status {
        Ok(s) if s.success() && resource.is_file() => {
            println!("cargo:rustc-link-arg={}", resource.display());
        }
        _ => println!("cargo:warning=rc.exe could not compile the icon resource"),
    }
}
