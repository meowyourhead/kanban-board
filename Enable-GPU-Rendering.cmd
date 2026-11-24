@echo off
setlocal EnableExtensions
title Enable Kanban GPU rendering
cd /d "%~dp0"

if not exist "kanban-rust.exe" (
  echo.
  echo  kanban-rust.exe is missing. Run Build.cmd first.
  echo.
  pause
  exit /b 1
)

echo.
echo  The app already requests GPU rendering by default.
echo  This sets Windows' per-app High performance preference for this copy,
echo  which matters on laptops with switchable graphics.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\enable-gpu-rendering.ps1"
if errorlevel 1 (
  echo.
  echo  GPU preference setup failed.
  echo.
  pause
  exit /b 1
)

echo  Optional: Settings ^> System ^> Display ^> Graphics also exposes a High performance option.
echo.
pause
endlocal
exit /b 0
