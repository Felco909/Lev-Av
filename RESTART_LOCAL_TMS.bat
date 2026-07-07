@echo off
setlocal EnableExtensions

title LevAV LLC TMS Restart Local

set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"

echo ==========================================
echo LevAV LLC TMS - Restart Local
echo ==========================================
echo Workspace: %PROJECT_DIR%
echo.

if not exist "SAFE_SHUTDOWN.bat" (
  echo [ERROR] SAFE_SHUTDOWN.bat not found.
  pause
  exit /b 1
)

if not exist "PRODUCTION_START.bat" (
  echo [ERROR] PRODUCTION_START.bat not found.
  pause
  exit /b 1
)

echo [INFO] Running safe shutdown...
call "SAFE_SHUTDOWN.bat"
timeout /t 2 /nobreak >nul
echo [INFO] Starting local production stack...
call "PRODUCTION_START.bat"
exit /b %errorlevel%
