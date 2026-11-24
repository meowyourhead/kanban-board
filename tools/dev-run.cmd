@echo off
setlocal
cd /d "%~dp0.."

if not exist "kanban-rust.exe" (
  echo.
  echo  kanban-rust.exe is missing. Run Build.cmd first.
  echo.
  pause
  exit /b 1
)

rem Enables the DevTools protocol on http://127.0.0.1:9222 for tools\cdp.mjs.
set "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222"
rem Serve the page from the files on disk, so UI edits show after a restart without rebuilding.
set "KANBAN_DEV=1"
start "" "kanban-rust.exe"
exit /b 0
