[CmdletBinding()]
param(
    [switch]$NoShortcut
)

$ErrorActionPreference = 'Stop'
$appDir = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $appDir 'kanban-rust.exe'

if (-not (Test-Path -LiteralPath $exe)) {
    Write-Host ''
    Write-Host ' kanban-rust.exe is missing. Run Build.cmd first.' -ForegroundColor Red
    Write-Host ''
    exit 1
}

$exe = (Resolve-Path -LiteralPath $exe).Path
$gpuKey = 'HKCU:\Software\Microsoft\DirectX\UserGpuPreferences'

if (-not (Test-Path -LiteralPath $gpuKey)) {
    New-Item -Path $gpuKey -Force | Out-Null
}
New-ItemProperty -Path $gpuKey -Name $exe -Value 'GpuPreference=2;' -PropertyType String -Force | Out-Null

$saved = Get-ItemPropertyValue -Path $gpuKey -Name $exe
if ($saved -ne 'GpuPreference=2;') {
    Write-Host ''
    Write-Host ' Could not set the Windows per-app GPU preference.' -ForegroundColor Red
    Write-Host ''
    exit 1
}

Write-Host ''
Write-Host ' Windows GPU preference: High performance' -ForegroundColor Green
Write-Host (" App: " + $exe)
Write-Host ''

if (-not $NoShortcut) {
    try {
        $desktop = [Environment]::GetFolderPath('Desktop')
        $lnk = Join-Path $desktop 'Kanban (High Performance).lnk'
        $shell = New-Object -ComObject WScript.Shell
        $shortcut = $shell.CreateShortcut($lnk)
        $shortcut.TargetPath = $exe
        $shortcut.Arguments = ''
        $shortcut.WorkingDirectory = $appDir
        $shortcut.IconLocation = $exe + ',0'
        $shortcut.Description = 'Kanban board with the Windows high-performance GPU preference'
        $shortcut.Save()
        Write-Host ' Desktop shortcut: Kanban (High Performance)' -ForegroundColor Green
        Write-Host ' It launches the normal GPU-enabled app.'
    }
    catch {
        Write-Host ' The GPU preference was saved, but the desktop shortcut could not be created.' -ForegroundColor Yellow
    }
    Write-Host ''
}

$running = Get-Process -Name 'kanban-rust' -ErrorAction SilentlyContinue
if ($running) {
    Write-Host ' Kanban is running. Close it and start it again for the new setting to take effect.' -ForegroundColor Yellow
}
else {
    Write-Host ' Start kanban-rust.exe normally; GPU rendering is already enabled by the app.' -ForegroundColor Cyan
}

Write-Host ''
Write-Host ' If rendering still falls back to software, update the graphics driver and WebView2 Runtime.'
Write-Host ''
exit 0
