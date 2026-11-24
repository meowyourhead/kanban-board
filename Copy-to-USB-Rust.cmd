@echo off
setlocal EnableExtensions
title Copy Kanban Board (Rust) to USB

rem ===========================================================================
rem  Copies the standalone Rust build of Kanban Board to a USB drive you
rem  choose. Nothing is installed on the other PC; Windows 10/11 already has
rem  the WebView2 runtime the app uses. GPU rendering is built into the app;
rem  the optional per-PC High performance preference helper is copied too.
rem
rem  Usage:
rem    - Double-click it, then type the USB drive letter (e.g. E)
rem    - or:  Copy-to-USB-Rust.cmd E:
rem    - or:  Copy-to-USB-Rust.cmd D:\some\folder
rem ===========================================================================

set "SRC=%~dp0"

echo.
echo  ================================================
echo    Kanban Board (Rust)  -  copy to a USB drive
echo  ================================================
echo.
echo  Source: %SRC%
echo.

if not exist "%SRC%kanban-rust.exe" (
  echo  kanban-rust.exe is missing. Run Build.cmd first.
  echo.
  pause
  exit /b 1
)

set "ARG=%~1"
if not defined ARG goto askDrive
set "ROOT=%ARG%"
if "%ROOT:~-1%"=="\" goto haveRoot
set "ROOT=%ROOT%\"
goto haveRoot

:askDrive
echo  Removable drives found:
powershell -NoProfile -Command "Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DriveType -eq 2 } | ForEach-Object { '    {0}   {1}   {2:N1} GB free' -f $_.DeviceID, $_.VolumeName, ($_.FreeSpace/1GB) }" 2>nul
echo.
set "DRIVE="
set /p "DRIVE=Enter the USB drive letter (e.g. E) and press Enter: "
if not defined DRIVE goto cancelled
set "DRIVE=%DRIVE: =%"
set "DRIVE=%DRIVE::=%"
set "DRIVE=%DRIVE:\=%"
set "DRIVE=%DRIVE:/=%"
set "ROOT=%DRIVE%:\"

:haveRoot
if not exist "%ROOT%" goto badRoot

set "STAMP="
for /f "delims=" %%T in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH-mm-ss"') do set "STAMP=%%T"
if not defined STAMP set "STAMP=copy"
set "OUT=%ROOT%Kanban Board (Rust) %STAMP%"

echo.
echo  Destination: "%OUT%"
echo.
set "COPYBACK=0"
choice /c YN /n /m "Also copy your current board folder (Kanban Auto-Backups)? [Y/N] "
if errorlevel 2 goto asked
set "COPYBACK=1"
:asked
echo.
pause

echo.
echo  Creating folder...
md "%OUT%" >nul 2>nul

set "FAIL=0"

echo  Copying program files...
for %%F in (kanban-rust.exe index.html Create-Desktop-Shortcut.cmd Enable-GPU-Rendering.cmd README-RUST.md) do (
  if exist "%SRC%%%F" (
    copy /y "%SRC%%%F" "%OUT%\" >nul
  ) else (
    echo    - MISSING: %%F
    set "FAIL=1"
  )
)

echo  Copying css / js / vendor / build...
call :rcopy "css"
call :rcopy "js"
call :rcopy "vendor"
call :rcopy "build"
call :copy_gpu

if "%COPYBACK%"=="1" (
  if exist "%SRC%Kanban Auto-Backups" (
    echo  Copying your board folder...
    call :rcopy "Kanban Auto-Backups"
  ) else (
    echo  No backup folder here yet - the board will start empty on the USB.
  )
)

rem ---- a tiny placeholder so index.html's starter script is never a 404 ----
if not exist "%OUT%\Kanban Auto-Backups\kanban-backup-latest.js" (
  md "%OUT%\Kanban Auto-Backups" >nul 2>nul
  > "%OUT%\Kanban Auto-Backups\kanban-backup-latest.js" echo window.KANBAN_LAST_SESSION = null;
)

>  "%OUT%\VERSION.txt" echo Kanban Board (standalone Rust build) - offline copy
>> "%OUT%\VERSION.txt" echo Copied: %DATE% %TIME%
>> "%OUT%\VERSION.txt" echo From:   %SRC%
>> "%OUT%\VERSION.txt" echo GPU:    enabled by default (WebView2 flags)
>> "%OUT%\VERSION.txt" echo Needs:  Windows 10/11 with the Microsoft Edge WebView2 runtime (included by default)

echo.
if "%FAIL%"=="0" (
  echo  Done. Everything the app needs is in:
) else (
  echo  Finished, but something was missing - see the notes above.
  echo  Output folder:
)
echo    "%OUT%"
echo.
echo  On the other PC: open that folder and double-click  kanban-rust.exe
echo  GPU rendering is already on. On hybrid-GPU laptops, run
echo  Enable-GPU-Rendering.cmd once to set Windows' High performance preference.
echo.
pause
endlocal
exit /b 0

rem ---------------------------------------------------------------------------
:copy_gpu
if not exist "%SRC%tools\enable-gpu-rendering.ps1" (
  echo    - MISSING: tools\enable-gpu-rendering.ps1
  set "FAIL=1"
  exit /b
)
echo  Copying optional GPU preference helper...
if not exist "%OUT%\tools" md "%OUT%\tools" >nul 2>nul
copy /y "%SRC%tools\enable-gpu-rendering.ps1" "%OUT%\tools\" >nul
exit /b

rem ---------------------------------------------------------------------------
:rcopy
robocopy "%SRC%%~1" "%OUT%\%~1" /E /MT:8 /R:1 /W:1 /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 (
  echo    - FAILED copying %~1
  set "FAIL=1"
)
exit /b

:badRoot
echo.
echo  That drive or folder does not exist: "%ROOT%"
echo  Nothing was copied.
pause
endlocal
exit /b 1

:cancelled
echo.
echo  Cancelled - nothing was copied.
pause
endlocal
exit /b 0
