@echo off
setlocal EnableExtensions
REM Creates desktop shortcut "Lev&AV LLC TMS.lnk" via PowerShell script.

title LevAV TMS Desktop Shortcut

set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"

echo ==========================================
echo LevAV LLC TMS - Create desktop shortcut
echo ==========================================
echo Project:
echo %PROJECT_DIR%
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_DIR%scripts\Create-LevavDesktopShortcut.ps1" -ProjectRoot "%CD%"
if errorlevel 1 (
  echo [ERROR] Shortcut creation failed.
  pause
  exit /b 1
)

echo [OK] Done. Remove old shortcuts manually if they point to other folders.
pause
exit /b 0
