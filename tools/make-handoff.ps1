[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$appDir = Split-Path -Parent $PSScriptRoot
$outZip = Join-Path $appDir 'kanban-rust-handoff.zip'
$stage  = Join-Path $env:TEMP ('kanban-rust-handoff-' + [guid]::NewGuid().ToString('N'))

# Everything a fresh AI needs to continue development, nothing else.
$files = @(
    'AGENTS.md',
    'README-RUST.md',
    'Cargo.toml',
    'Cargo.lock',
    'build.rs',
    'index.html',
    'Build.cmd',
    'Create-Desktop-Shortcut.cmd',
    'Enable-GPU-Rendering.cmd',
    'Copy-to-USB-Rust.cmd',
    'Make-AI-Handoff.cmd',
    'update_pubkey.txt'
)
$dirs = @('src', 'css', 'js', 'build', 'tools')

New-Item -ItemType Directory -Path $stage | Out-Null
$copied = 0

try {
    foreach ($rel in $files) {
        $src = Join-Path $appDir $rel
        if (-not (Test-Path -LiteralPath $src)) {
            Write-Host " WARNING: missing $rel, skipped" -ForegroundColor Yellow
            continue
        }
        Copy-Item -LiteralPath $src -Destination (Join-Path $stage $rel)
        $copied++
    }

    foreach ($dir in $dirs) {
        $root = Join-Path $appDir $dir
        if (-not (Test-Path -LiteralPath $root)) { continue }
        Get-ChildItem -LiteralPath $root -Recurse -File | ForEach-Object {
            $rel = $_.FullName.Substring($appDir.Length + 1)
            $dest = Join-Path $stage $rel
            New-Item -ItemType Directory -Path (Split-Path -Parent $dest) -Force | Out-Null
            Copy-Item -LiteralPath $_.FullName -Destination $dest
            $copied++
        }
    }

    # vendor\ is static third-party assets: keep the JS library, replace font
    # binaries with a manifest so the zip stays small.
    $vendorRoot = Join-Path $appDir 'vendor'
    if (Test-Path -LiteralPath $vendorRoot) {
        Get-ChildItem -LiteralPath $vendorRoot -Recurse -File | ForEach-Object {
            $rel = $_.FullName.Substring($appDir.Length + 1)
            if ($_.Extension -eq '.js') {
                $dest = Join-Path $stage $rel
                New-Item -ItemType Directory -Path (Split-Path -Parent $dest) -Force | Out-Null
                Copy-Item -LiteralPath $_.FullName -Destination $dest
                $copied++
            }
        }
        $manifest = @()
        $manifest += 'vendor\ file manifest (binary assets excluded from the handoff zip by design)'
        $manifest += 'These files exist in the real project folder; do not recreate them.'
        Get-ChildItem -LiteralPath $vendorRoot -Recurse -File | Sort-Object FullName | ForEach-Object {
            $rel = $_.FullName.Substring($appDir.Length + 1)
            $manifest += ('{0}`t{1} bytes' -f $rel, $_.Length)
        }
        Set-Content -LiteralPath (Join-Path $stage 'vendor-manifest.txt') -Value $manifest -Encoding ASCII
    }

    if (Test-Path -LiteralPath $outZip) { Remove-Item -LiteralPath $outZip -Force }
    Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $outZip -CompressionLevel Optimal

    $zip = Get-Item -LiteralPath $outZip
    $kb  = [math]::Round($zip.Length / 1KB, 1)
    Write-Host ''
    Write-Host ' AI handoff package ready' -ForegroundColor Green
    Write-Host (" Path: " + $zip.FullName)
    Write-Host (" Size: {0} KB ({1} files)" -f $kb, $copied)
    Write-Host ''
    Write-Host ' Upload that single zip to the new AI. AGENTS.md inside is its starting point.'
    Write-Host ''
}
finally {
    if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
}
