# Builds the app, signs it, and (with -Publish) uploads it as a GitHub release.
#
#   powershell -ExecutionPolicy Bypass -File tools\release.ps1             # build + sign only
#   powershell -ExecutionPolicy Bypass -File tools\release.ps1 -Publish -NotesFile notes.txt
#
# Bump `version` in Cargo.toml first; the tag comes from it (1.1.0 -> v1.1).
#
# The Ed25519 release key lives outside the repo, DPAPI-encrypted for this Windows user, in
# %APPDATA%\Kanban Board release\signing-key.dat (made on the first run). Back it up somewhere safe:
# without it, installed copies will not accept new updates and need a manual reinstall.

param(
    [switch]$Publish,
    [switch]$KeyOnly,   # only create the signing key (first-time setup)
    [string]$NotesFile = ''
)
$ErrorActionPreference = 'Stop'
$repo = 'meowyourhead/kanban-board'
$root = Split-Path -Parent $PSScriptRoot
$secrets = Join-Path $env:APPDATA 'Kanban Board release'
$keyFile = Join-Path $secrets 'signing-key.dat'
$pubFile = Join-Path $root 'update_pubkey.txt'
$cargo = Join-Path $env:USERPROFILE '.cargo\bin\cargo.exe'
New-Item -ItemType Directory -Force $secrets | Out-Null

function Read-Dpapi($path) {
    $s = Get-Content $path | ConvertTo-SecureString
    $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
    try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}
# cargo reports progress on stderr, which Windows PowerShell must not treat as a failure
function Invoke-Cargo {
    $ErrorActionPreference = 'Continue'
    & $cargo @args 2>&1 | ForEach-Object { "$_" } | Out-Host
    if ($LASTEXITCODE) { throw "cargo $args failed" }
}

$version = (Select-String -Path (Join-Path $root 'Cargo.toml') -Pattern '^version\s*=\s*"([0-9.]+)"' | Select-Object -First 1).Matches[0].Groups[1].Value
$parts = $version.Split('.')
$tag = if ($parts[2] -eq '0') { "v$($parts[0]).$($parts[1])" } else { "v$version" }

Push-Location $root
try {
    # ---- signing key ----
    Invoke-Cargo build --release --locked --bin kanban_sign
    $signer = Join-Path $root 'target\release\kanban_sign.exe'
    if (-not (Test-Path $keyFile)) {
        if (Test-Path $pubFile) { throw "update_pubkey.txt exists but $keyFile is missing. Restore the key from your backup; making a new one would lock out installed copies." }
        $out = & $signer keygen
        if ($LASTEXITCODE -or $out.Count -ne 2) { throw 'keygen failed' }
        ConvertTo-SecureString $out[0] -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -Encoding ascii $keyFile
        $out = $null
        Write-Host "New signing key saved to $keyFile -- back it up."
    }
    # The public half is derived from the key every run, so it always matches.
    $key = Read-Dpapi $keyFile
    try { $pub = $key | & $signer pubkey } finally { $key = $null }
    if ($LASTEXITCODE -or "$pub".Length -ne 64) { throw 'could not read the signing key' }
    if (-not (Test-Path $pubFile) -or ([IO.File]::ReadAllText($pubFile)).Trim() -ne $pub) {
        [IO.File]::WriteAllText($pubFile, "$pub`n")
        Write-Host 'Public key written to update_pubkey.txt (commit it).'
    }
    if ($KeyOnly) { return }

    # ---- build, stage, sign ----
    Invoke-Cargo build --release --locked
    $dist = Join-Path $root 'target\dist'
    New-Item -ItemType Directory -Force $dist | Out-Null
    $exe = Join-Path $dist 'kanban-rust.exe'
    Copy-Item '.\target\release\kanban-rust.exe' $exe -Force
    $key = Read-Dpapi $keyFile
    try { $sig = $key | & $signer sign $exe $version } finally { $key = $null }
    if ($LASTEXITCODE -or -not $sig) { throw 'signing failed' }
    [IO.File]::WriteAllText("$exe.sig", "$sig")
    Write-Host "Built and signed $tag -> $dist"

    # ---- publish ----
    if ($Publish) {
        if (-not $NotesFile) { throw 'Pass -NotesFile <file> with the release notes (shown in the update prompt).' }
        gh release create $tag --repo $repo --title "Kanban Board $tag" --notes-file $NotesFile $exe "$exe.sig"
        if ($LASTEXITCODE) { throw 'gh release create failed' }
        Write-Host "Published $tag to $repo"
    }
} finally {
    Pop-Location
}
