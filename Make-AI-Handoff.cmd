@echo off
setlocal EnableExtensions
title Make Kanban AI handoff package
cd /d "%~dp0"

echo.
echo  Packs this project into one small zip for a fresh AI with no prior context:
echo  AGENTS.md, all Rust source, the frontend (html/css/js), build scripts and tools.
echo  Static font binaries are replaced by vendor-manifest.txt to keep it tiny.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\make-handoff.ps1"
if errorlevel 1 (
  echo.
  echo  Handoff package failed.
  echo.
  pause
  exit /b 1
)

pause
endlocal
exit /b 0
