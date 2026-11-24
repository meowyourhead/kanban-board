@echo off
setlocal EnableExtensions
title Create Kanban desktop shortcut
cd /d "%~dp0"

if not exist "kanban-rust.exe" (
  echo.
  echo  kanban-rust.exe is missing. Run Build.cmd first.
  echo.
  pause
  exit /b 1
)

echo.
echo  Placing a "Kanban" shortcut on your desktop...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $exe=(Resolve-Path -LiteralPath '.\kanban-rust.exe').Path; $dir=(Get-Location).Path; $desk=[Environment]::GetFolderPath('Desktop'); $lnk=Join-Path $desk 'Kanban.lnk'; $ws=New-Object -ComObject WScript.Shell; $sc=$ws.CreateShortcut($lnk); $sc.TargetPath=$exe; $sc.WorkingDirectory=$dir; $sc.IconLocation=$exe + ',0'; $sc.Description='Kanban board'; $sc.Save(); Write-Host ''; Write-Host (' Shortcut created: ' + $lnk)"
if errorlevel 1 (
  echo.
  echo  The shortcut could not be created.
  echo.
  pause
  exit /b 1
)

echo.
echo  Done. Look for "Kanban" on your desktop.
echo.
pause
endlocal
exit /b 0
