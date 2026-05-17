@echo off
setlocal EnableExtensions EnableDelayedExpansion
REM LevAV LLC TMS production stack: PostgreSQL local, Next.js on port 3000.
REM All user-visible messages in ASCII to avoid CMD encoding errors.

title LevAV LLC TMS Production Start

set "PROJECT_DIR=%~dp0"
set "RUNTIME_DIR=%PROJECT_DIR%.runtime"
set "PG_BIN=%PROJECT_DIR%LOCAL_DB_RUNTIME\pgsql_full\pgsql\bin"
set "PG_DATA=%PROJECT_DIR%LOCAL_DB_RUNTIME\pgdata_localprod_utf8"
set "PG_LOG=%PROJECT_DIR%LOCAL_DB_RUNTIME\pg_local_utf8.log"
set "PG_PORT=5434"
if not exist "%RUNTIME_DIR%" mkdir "%RUNTIME_DIR%" >nul 2>&1
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set "STAMP=%%i"
set "LOG_FILE=%RUNTIME_DIR%\production_start_%STAMP%.log"
set "DEBUG_LOG=%RUNTIME_DIR%\startup_debug.log"

cd /d "%PROJECT_DIR%"

echo %PROJECT_DIR% | findstr /I "DAILY_BACKUP BACKUP_RESTORE_POINT LAUNCHER_ARCHIVE BACKUP_RESTORE SYSTEM_BACKUP PREVIOUS_COPIES __MACOSX" >nul 2>&1
if not errorlevel 1 (
  echo [ERROR] Launch blocked: backup or archive path. Run only from LevAV_MAIN_SYSTEM root ^(start.bat^).
  echo Path: %PROJECT_DIR%
  pause
  exit /b 1
)

echo ==========================================
echo LevAV LLC TMS - Production Start
echo ==========================================
echo Workspace: %PROJECT_DIR%
echo.

>> "%LOG_FILE%" echo %date% %time% [INFO] Start requested in %PROJECT_DIR%
>> "%DEBUG_LOG%" echo.
>> "%DEBUG_LOG%" echo ===== START %date% %time% =====
>> "%DEBUG_LOG%" echo [STEP] Workspace=%PROJECT_DIR%

>> "%DEBUG_LOG%" echo [STEP] Check production marker
if not exist "%PROJECT_DIR%\PRODUCTION_BASELINE_LOCK.md" goto :ERR_EXPECTED_WORKSPACE
>> "%DEBUG_LOG%" echo [OK] production marker found
>> "%DEBUG_LOG%" echo [STEP] Check package.json
if not exist "%PROJECT_DIR%\package.json" goto :ERR_PACKAGE
>> "%DEBUG_LOG%" echo [OK] package.json found
>> "%DEBUG_LOG%" echo [STEP] Check app folder
if not exist "%PROJECT_DIR%\app" goto :ERR_WORKSPACE
>> "%DEBUG_LOG%" echo [OK] app folder found
>> "%DEBUG_LOG%" echo [STEP] Check .env
if not exist "%PROJECT_DIR%\.env" goto :ERR_ENV
>> "%DEBUG_LOG%" echo [OK] .env found

findstr /I /C:"levav_prod_local" "%PROJECT_DIR%\.env" >nul 2>&1
if errorlevel 1 (
  echo [ERROR] DATABASE_URL must point to levav_prod_local in .env
  >> "%LOG_FILE%" echo %date% %time% [ERROR] DATABASE_URL not levav_prod_local
  >> "%DEBUG_LOG%" echo [ERROR] DATABASE_URL not levav_prod_local
  pause
  exit /b 1
)
>> "%DEBUG_LOG%" echo [OK] DATABASE_URL levav_prod_local

>> "%DEBUG_LOG%" echo [STEP] Check node
node -v >nul 2>&1
if errorlevel 1 goto :ERR_NODE
>> "%DEBUG_LOG%" echo [OK] node available
>> "%DEBUG_LOG%" echo [STEP] Check npm
call npm -v >nul 2>&1
if errorlevel 1 goto :ERR_NPM
>> "%DEBUG_LOG%" echo [OK] npm available

echo [OK] Node/npm/.env/package checks passed.
>> "%LOG_FILE%" echo %date% %time% [OK] Node/npm/.env/package checks passed.

>> "%DEBUG_LOG%" echo [STEP] Run startup health check
if exist "%PROJECT_DIR%\HEALTH_CHECK.bat" (
  call "%PROJECT_DIR%\HEALTH_CHECK.bat" --no-pause
  if errorlevel 1 (
    echo [ERROR] Health check failed. Startup aborted.
    >> "%LOG_FILE%" echo %date% %time% [ERROR] Health check failed.
    >> "%DEBUG_LOG%" echo [ERROR] Health check failed
    pause
    exit /b 1
  )
  >> "%DEBUG_LOG%" echo [OK] Health check passed
) else (
  echo [WARN] HEALTH_CHECK.bat not found, skipping.
  >> "%DEBUG_LOG%" echo [WARN] HEALTH_CHECK.bat missing
)

>> "%DEBUG_LOG%" echo [STEP] Ensure local PostgreSQL runtime files
if not exist "%PG_BIN%\pg_ctl.exe" goto :ERR_PG_RUNTIME
if not exist "%PG_BIN%\pg_isready.exe" goto :ERR_PG_RUNTIME
if not exist "%PG_DATA%\PG_VERSION" goto :ERR_PG_DATA

>> "%DEBUG_LOG%" echo [STEP] Check local PostgreSQL on port %PG_PORT%
"%PG_BIN%\pg_isready.exe" -h localhost -p %PG_PORT% -d levav_prod_local >nul 2>&1
if errorlevel 1 (
  echo [INFO] Local PostgreSQL is not running. Starting...
  >> "%LOG_FILE%" echo %date% %time% [INFO] Starting local PostgreSQL on %PG_PORT%
  "%PG_BIN%\pg_ctl.exe" -D "%PG_DATA%" -l "%PG_LOG%" -o "-p %PG_PORT%" start >nul 2>&1
  timeout /t 2 /nobreak >nul
  "%PG_BIN%\pg_isready.exe" -h localhost -p %PG_PORT% -d levav_prod_local >nul 2>&1
  if errorlevel 1 goto :ERR_PG_START
)
echo [OK] PostgreSQL running on port %PG_PORT%.
>> "%DEBUG_LOG%" echo [OK] Local PostgreSQL ready on %PG_PORT%

>> "%DEBUG_LOG%" echo [STEP] Port 3000 auto recovery
set "PORT_STATE="
set "PORT_PID="
set "PORT_NAME="
set "PORT_STATE_FILE=%RUNTIME_DIR%\port3000_state.txt"
REM NOTE: use %%CD%% not %%PROJECT_DIR%% for -ProjectDir - trailing backslash in quoted path breaks CMD quoting.
powershell -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_DIR%scripts\port-3000-recovery.ps1" -ProjectDir "%CD%" -StateFile "%PORT_STATE_FILE%" >nul 2>&1
set "PORT_RECOVERY_RC=%errorlevel%"
if exist "%PORT_STATE_FILE%" (
  for /f "usebackq tokens=1,2 delims==" %%A in ("%PORT_STATE_FILE%") do (
    if /I "%%A"=="PORT_STATE" set "PORT_STATE=%%B"
    if /I "%%A"=="PORT_PID" set "PORT_PID=%%B"
    if /I "%%A"=="PORT_NAME" set "PORT_NAME=%%B"
  )
)

REM Port 3000: previous behaviour was exit 10 = "already running, skip start".
REM Now port-3000-recovery.ps1 stops same-project Next.js and returns 0 so we always get a clean npm run start.

if "%PORT_RECOVERY_RC%"=="3" (
  echo [ERROR] Port 3000 is used by foreign process. PID=%PORT_PID%
  >> "%LOG_FILE%" echo %date% %time% [ERROR] Foreign process on port 3000 PID %PORT_PID%
  goto :ERR_PORT_BUSY
)

if "%PORT_RECOVERY_RC%"=="4" (
  echo [ERROR] Could not recover stale MAIN_SYSTEM process on port 3000.
  >> "%LOG_FILE%" echo %date% %time% [ERROR] Stale process recovery failed PID %PORT_PID%
  goto :ERR_PORT_BUSY
)

if /I "%PORT_STATE%"=="KILLED_PREVIOUS" (
  echo [INFO] Previous LevAV listener on port 3000 was stopped (PID %PORT_PID%^).
  >> "%LOG_FILE%" echo %date% %time% [INFO] Killed previous listener PID %PORT_PID%
)

>> "%DEBUG_LOG%" echo [OK] Port 3000 free
echo [OK] Port 3000 is free / ready for Next.js.
"%PG_BIN%\pg_isready.exe" -h localhost -p %PG_PORT% -d levav_prod_local >nul 2>&1
if errorlevel 1 (
  echo [WARN] PostgreSQL pg_isready failed - check port %PG_PORT%.
) else (
  echo [OK] Database levav_prod_local: pg_isready OK.
)
call :SHOW_LAN_URLS
echo [INFO] Firewall: allow inbound TCP 3000 for LAN...
powershell -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_DIR%scripts\open-lan-firewall-3000.ps1"
set "AUTH_TRUST_HOST=true"
echo [INFO] NextAuth: AUTH_TRUST_HOST=true for LAN login.
echo [INFO] Next.js listen 0.0.0.0:3000.
set "SKIP_FULL_BUILD=0"
if exist ".next\BUILD_ID" if exist ".next\server\pages-manifest.json" set "SKIP_FULL_BUILD=1"
if /I "%FORCE_FULL_BUILD%"=="1" set "SKIP_FULL_BUILD=0"
if "%SKIP_FULL_BUILD%"=="1" (
  echo [INFO] Existing production build ^(.next complete^) — skipping npm run build.
  echo [INFO] To force full rebuild after code changes: set FORCE_FULL_BUILD=1 then start again.
  >> "%LOG_FILE%" echo %date% %time% [INFO] Skip npm run build (.next complete^)
  >> "%DEBUG_LOG%" echo [STEP] npm run build SKIPPED (.next complete^)
) else (
  if exist ".next" if not exist ".next\BUILD_ID" (
    echo [INFO] Removing incomplete .next folder before build...
    >> "%DEBUG_LOG%" echo [STEP] rmdir incomplete .next
    rmdir /s /q ".next" 2>nul
  )
  if /I "%FORCE_FULL_BUILD%"=="1" if exist ".next" (
    echo [INFO] FORCE_FULL_BUILD=1 — removing .next ...
    rmdir /s /q ".next" 2>nul
  )
  echo [INFO] Running production build: npm run build ...
  >> "%LOG_FILE%" echo %date% %time% [INFO] npm run build started
  >> "%DEBUG_LOG%" echo [STEP] npm run build
  call npm run build > "%RUNTIME_DIR%\npm_build_last.log" 2>&1
  set "BUILD_RC=!ERRORLEVEL!"
  if not exist ".next\BUILD_ID" set "BUILD_RC=1"
  >> "%DEBUG_LOG%" echo [INFO] npm run build exit code=!BUILD_RC!
  if not "!BUILD_RC!"=="0" (
    echo [WARN] Build failed ^(code !BUILD_RC!^). Cleaning .next and retrying once...
    >> "%DEBUG_LOG%" echo [WARN] npm run build failed, retry after rmdir .next
    rmdir /s /q ".next" 2>nul
    timeout /t 2 /nobreak >nul
    call npm run build >> "%RUNTIME_DIR%\npm_build_last.log" 2>&1
    set "BUILD_RC=!ERRORLEVEL!"
    if not exist ".next\BUILD_ID" set "BUILD_RC=1"
    >> "%DEBUG_LOG%" echo [INFO] npm run build retry exit code=!BUILD_RC!
  )
  if not "!BUILD_RC!"=="0" (
    echo [ERROR] npm run build failed, exit code !BUILD_RC!
    echo [HINT] Full log: %RUNTIME_DIR%\npm_build_last.log
    >> "%LOG_FILE%" echo %date% %time% [ERROR] npm run build exit !BUILD_RC!
    >> "%DEBUG_LOG%" echo [ERROR] npm run build failed
    pause
    exit /b !BUILD_RC!
  )
  echo [OK] Production build OK.
)
call :SHOW_LAN_URLS
echo [INFO] Browser opens when http://localhost:3000 responds (background script).
start /b powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%PROJECT_DIR%scripts\open-browser-when-ready.ps1" -Url "http://localhost:3000" -TimeoutSeconds 300
echo [INFO] Starting server: npm run start (stop: Ctrl+C in this window).
>> "%LOG_FILE%" echo %date% %time% [INFO] npm run start
>> "%DEBUG_LOG%" echo [STEP] npm run start
call npm run start
set "NPM_EXIT=!ERRORLEVEL!"
>> "%DEBUG_LOG%" echo [INFO] npm run start exit code=!NPM_EXIT!
if not "!NPM_EXIT!"=="0" (
  echo [INFO] Next.js exited, code !NPM_EXIT! (Ctrl+C is normal).
  >> "%LOG_FILE%" echo %date% %time% [INFO] npm run start ended !NPM_EXIT!
)
>> "%DEBUG_LOG%" echo [OK] launcher finished
echo.
echo Close this window after stopping the server (Ctrl+C).
exit /b 0

:ERR_EXPECTED_WORKSPACE
echo [ERROR] Production workspace marker missing.
echo [ERROR] Start is blocked to prevent old workspace launch.
>> "%LOG_FILE%" echo %date% %time% [ERROR] Production workspace marker missing.
>> "%DEBUG_LOG%" echo [ERROR] Production marker missing
pause
exit /b 1

:ERR_PACKAGE
echo [ERROR] package.json not found. Wrong workspace.
>> "%LOG_FILE%" echo %date% %time% [ERROR] package.json missing.
>> "%DEBUG_LOG%" echo [ERROR] package.json missing
pause
exit /b 1

:ERR_WORKSPACE
echo [ERROR] app folder not found. Wrong workspace.
>> "%LOG_FILE%" echo %date% %time% [ERROR] app folder missing.
>> "%DEBUG_LOG%" echo [ERROR] app folder missing
pause
exit /b 1

:ERR_ENV
echo [ERROR] .env not found. Start aborted.
>> "%LOG_FILE%" echo %date% %time% [ERROR] .env missing.
>> "%DEBUG_LOG%" echo [ERROR] .env missing
pause
exit /b 1

:ERR_NODE
echo [ERROR] Node.js is not available in PATH.
>> "%LOG_FILE%" echo %date% %time% [ERROR] Node.js unavailable.
>> "%DEBUG_LOG%" echo [ERROR] Node unavailable
pause
exit /b 1

:ERR_NPM
echo [ERROR] npm is not available in PATH.
>> "%LOG_FILE%" echo %date% %time% [ERROR] npm unavailable.
>> "%DEBUG_LOG%" echo [ERROR] npm unavailable
pause
exit /b 1

:ERR_PG_RUNTIME
echo [ERROR] Local PostgreSQL binaries are missing.
echo [ERROR] Expected: %PG_BIN%
>> "%LOG_FILE%" echo %date% %time% [ERROR] Local PostgreSQL binaries missing.
>> "%DEBUG_LOG%" echo [ERROR] Local PostgreSQL binaries missing.
pause
exit /b 1

:ERR_PG_DATA
echo [ERROR] Local PostgreSQL data directory is missing.
echo [ERROR] Expected: %PG_DATA%
>> "%LOG_FILE%" echo %date% %time% [ERROR] Local PostgreSQL data directory missing.
>> "%DEBUG_LOG%" echo [ERROR] Local PostgreSQL data directory missing.
pause
exit /b 1

:ERR_PG_START
echo [ERROR] Failed to start local PostgreSQL on port %PG_PORT%.
echo [HINT] Check log: %PG_LOG%
>> "%LOG_FILE%" echo %date% %time% [ERROR] Failed to start local PostgreSQL.
>> "%DEBUG_LOG%" echo [ERROR] Failed to start local PostgreSQL.
pause
exit /b 1

:ERR_PORT_BUSY
echo [ERROR] Port 3000 is busy and cannot be safely reused.
if defined PORT_PID tasklist /FI "PID eq %PORT_PID%"
echo.
echo TCP port 3000 listeners:
powershell -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_DIR%scripts\show-tcp-port-process.ps1" -Port 3000
echo.
>> "%LOG_FILE%" echo %date% %time% [ERROR] Port 3000 busy. PID: %PORT_PID%
>> "%DEBUG_LOG%" echo [ERROR] Port 3000 busy PID=%PORT_PID%
echo START FAILED
pause
exit /b 1

:SHOW_LAN_URLS
powershell -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_DIR%scripts\print-lan-server-info.ps1" -Port 3000
goto :eof
