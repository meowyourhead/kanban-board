@echo off
setlocal EnableExtensions
title Build Kanban Board (Rust)
cd /d "%~dp0"

set "CARGO=%USERPROFILE%\.cargo\bin\cargo.exe"
if exist "%CARGO%" goto build

echo.
echo  Rust is not installed. Downloading the Rust toolchain now (one time, ~150 MB).
echo  The build itself needs internet access for the libraries it uses.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $url='https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe'; $out=Join-Path $env:TEMP 'rustup-init.exe'; Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing; Start-Process -FilePath $out -ArgumentList '-y','--default-toolchain','stable','--profile','minimal' -Wait -NoNewWindow"
if not exist "%CARGO%" (
  echo.
  echo  Rust installation did not finish. Install it from https://rustup.rs and run Build.cmd again.
  echo.
  pause
  exit /b 1
)
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

:build
echo.
echo  Building Kanban Board (Rust) - the first build takes several minutes...
echo.
"%CARGO%" build --release
if errorlevel 1 (
  echo.
  echo  Build failed - see the messages above.
  echo.
  pause
  exit /b 1
)

copy /y "target\release\kanban-rust.exe" "%~dp0kanban-rust.exe" >nul
if errorlevel 1 (
  echo.
  echo  The build finished but the program could not be copied next to this script.
  echo.
  pause
  exit /b 1
)

echo.
echo  Done.  Start the board with kanban-rust.exe in this folder.
echo         Optional: run Create-Desktop-Shortcut.cmd to put a shortcut on your desktop.
echo.
pause
endlocal
exit /b 0
