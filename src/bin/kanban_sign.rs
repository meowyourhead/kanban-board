//! Release signing tool, run by tools/release.ps1. Not part of the app.
//!
//!   kanban_sign keygen                 -> stdout: "<secret hex>\n<public hex>\n"
//!   kanban_sign pubkey                 -> reads the secret hex from stdin, prints the public hex
//!   kanban_sign sign <exe> <version>   -> reads the secret hex from stdin, prints the signature hex
//!
//! The secret key only travels through stdin/stdout; the release script keeps it encrypted at rest
//! with Windows DPAPI.

#[path = "../signing.rs"]
mod signing;

use ed25519_dalek::{Signer, SigningKey};
use std::io::Read;
use zeroize::Zeroizing;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("keygen") => {
            let mut seed = Zeroizing::new([0u8; 32]);
            getrandom::getrandom(&mut *seed).unwrap_or_else(|_| fail("no system randomness"));
            let key = SigningKey::from_bytes(&seed);
            println!("{}", signing::to_hex(&*seed));
            println!("{}", signing::to_hex(key.verifying_key().as_bytes()));
        }
        Some("pubkey") => {
            let key = SigningKey::from_bytes(&read_secret());
            println!("{}", signing::to_hex(key.verifying_key().as_bytes()));
        }
        Some("sign") if args.len() == 3 => {
            let version = signing::parse_version(&args[2]).unwrap_or_else(|| fail("bad version"));
            let exe = std::fs::read(&args[1]).unwrap_or_else(|_| fail("can't read exe"));
            let key = SigningKey::from_bytes(&read_secret());
            let sig = key.sign(&signing::message(version, &exe));
            println!("{}", signing::to_hex(&sig.to_bytes()));
        }
        _ => fail("usage: kanban_sign keygen | pubkey | sign <exe> <version>"),
    }
}

/// The 32-byte secret seed, as hex on stdin.
fn read_secret() -> Zeroizing<[u8; 32]> {
    let mut input = Zeroizing::new(String::new());
    std::io::stdin()
        .read_to_string(&mut input)
        .unwrap_or_else(|_| fail("can't read key"));
    // PowerShell may prefix piped text with a byte-order mark.
    let hex = input.trim().trim_start_matches('\u{feff}');
    let bytes = Zeroizing::new(signing::from_hex(hex).unwrap_or_else(|| fail("bad key")));
    let mut seed = Zeroizing::new([0u8; 32]);
    if bytes.len() != 32 {
        fail("bad key");
    }
    seed.copy_from_slice(&bytes);
    seed
}

fn fail(msg: &str) -> ! {
    eprintln!("kanban_sign: {}", msg);
    std::process::exit(2);
}
