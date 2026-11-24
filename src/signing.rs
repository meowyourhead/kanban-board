//! Shared by the app (verify) and `kanban_sign` (sign): what exactly gets signed.
//!
//! A release signature covers the version *and* the exe's SHA-256, so an old signed exe cannot be
//! re-published under a newer version number.

use sha2::{Digest, Sha256};

/// "v1.1", "1.1.2" -> [1, 1, 0] / [1, 1, 2]. Up to three numeric parts.
pub fn parse_version(s: &str) -> Option<[u32; 3]> {
    let s = s.trim();
    let s = s.strip_prefix(['v', 'V']).unwrap_or(s);
    let parts: Vec<&str> = s.split('.').collect();
    if parts.len() > 3 {
        return None;
    }
    let mut version = [0u32; 3];
    for (i, part) in parts.iter().enumerate() {
        if part.is_empty() || part.len() > 6 || !part.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
        version[i] = part.parse().ok()?;
    }
    Some(version)
}

/// "1.1" when the patch number is 0, else "1.1.2".
#[allow(dead_code)]
pub fn display_version(v: [u32; 3]) -> String {
    if v[2] == 0 {
        format!("{}.{}", v[0], v[1])
    } else {
        format!("{}.{}.{}", v[0], v[1], v[2])
    }
}

pub fn message(version: [u32; 3], exe: &[u8]) -> Vec<u8> {
    let mut m = format!(
        "Kanban Board release\n{}.{}.{}\n",
        version[0], version[1], version[2]
    );
    m.push_str(&to_hex(&Sha256::digest(exe)));
    m.into_bytes()
}

pub fn to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

pub fn from_hex(s: &str) -> Option<Vec<u8>> {
    let s = s.trim();
    if s.len() % 2 != 0 || !s.is_ascii() {
        return None;
    }
    (0..s.len() / 2)
        .map(|i| u8::from_str_radix(&s[2 * i..2 * i + 2], 16).ok())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn versions() {
        assert_eq!(parse_version("v1.1"), Some([1, 1, 0]));
        assert_eq!(parse_version("1.10.2"), Some([1, 10, 2]));
        assert!(parse_version("v1.10") > parse_version("v1.9.9"));
        for bad in ["", "v", "1..2", "1.2.3.4", "1.x", "-1", "1.2-beta"] {
            assert_eq!(parse_version(bad), None, "{bad}");
        }
        assert_eq!(display_version([1, 1, 0]), "1.1");
        assert_eq!(display_version([1, 1, 3]), "1.1.3");
    }

    #[test]
    fn hex_round_trip() {
        assert_eq!(from_hex(&to_hex(&[0, 15, 255])), Some(vec![0, 15, 255]));
        assert_eq!(from_hex("0"), None);
        assert_eq!(from_hex("zz"), None);
        assert_eq!(from_hex("é"), None);
    }
}
