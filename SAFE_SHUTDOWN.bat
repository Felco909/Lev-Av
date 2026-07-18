@echo off
setlocal EnableExtensions

title LevAV LLC TMS Safe Shutdown

set "PROJECT_DIR=%~dp0"

cd /d "%PROJECT_DIR%"

echo %PROJECT_DIR% | findstr /I "DAILY_BACKUP BACKUP_RESTORE_POINT LAUNCHER_ARCHIVE BACKUP_RESTORE SYSTEM_BACKUP PREVIOUS_COPIES __MACOSX" >nul 2>&1
if not errorlevel 1 (
  echo [ERROR] SAFE_SHUTDOWN must run from LevAV_MAIN_SYSTEM root, not a backup path.
  echo Path: %PROJECT_DIR%
  pause
  exit /b 1
)

echo ==========================================
echo LevAV LLC TMS - Safe Shutdown
echo ==========================================
echo Workspace: %PROJECT_DIR%
echo.

set "FOUND=0"
for /f %%P in ('powershell -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_DIR%scripts\stop-next-for-project.ps1" -ProjectRoot "%CD%"') do (
  set "FOUND=1"
  echo [INFO] Stopping Next.js node PID %%P ^(this workspace only^)...
  taskkill /PID %%P /T >nul 2>&1
  timeout /t 1 /nobreak >nul
  tasklist /FI "PID eq %%P" | findstr /I "%%P" >nul
  if not errorlevel 1 (
    echo [WARN] Graceful stop failed, forcing PID %%P...
    taskkill /PID %%P /T /F >nul 2>&1
  )
)

if "%FOUND%"=="0" (
  echo [INFO] No LevAV Node/Next processes found for this workspace.
) else (
  echo [OK] Shutdown completed for current workspace Node/Next runtime.
)

echo [INFO] PostgreSQL runs as the Windows service LevAV_Postgres and is left running.
echo [INFO] To stop it manually if ever needed: net stop LevAV_Postgres

endlocal
exit /b 0
