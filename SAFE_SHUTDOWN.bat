@echo off
setlocal EnableExtensions

title LevAV LLC TMS Safe Shutdown

set "PROJECT_DIR=%~dp0"
set "PG_BIN=%PROJECT_DIR%LOCAL_DB_RUNTIME\pgsql_full\pgsql\bin"
set "PG_DATA=%PROJECT_DIR%LOCAL_DB_RUNTIME\pgdata_localprod_utf8"
set "PG_PORT=5434"

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

if exist "%PG_BIN%\pg_isready.exe" (
  "%PG_BIN%\pg_isready.exe" -h localhost -p %PG_PORT% -d levav_prod_local >nul 2>&1
  if not errorlevel 1 (
    echo [INFO] Stopping local PostgreSQL on port %PG_PORT%...
    if exist "%PG_BIN%\pg_ctl.exe" if exist "%PG_DATA%\PG_VERSION" (
      "%PG_BIN%\pg_ctl.exe" -D "%PG_DATA%" stop >nul 2>&1
      timeout /t 1 /nobreak >nul
      "%PG_BIN%\pg_isready.exe" -h localhost -p %PG_PORT% -d levav_prod_local >nul 2>&1
      if not errorlevel 1 (
        echo [WARN] PostgreSQL graceful stop failed, forcing postgres.exe for this cluster...
        for /f %%P in ('powershell -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_DIR%scripts\stop-postgres-for-datadir.ps1" -PgDataPath "%PG_DATA%"') do taskkill /PID %%P /T /F >nul 2>&1
      ) else (
        echo [OK] Local PostgreSQL stopped.
      )
    )
  ) else (
    echo [INFO] Local PostgreSQL is already stopped.
  )
)

endlocal
exit /b 0
