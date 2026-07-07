@echo off
setlocal EnableExtensions

title LevAV LLC TMS Health Check
set "PROJECT_DIR=%~dp0"
set "PG_BIN=%PROJECT_DIR%LOCAL_DB_RUNTIME\pgsql_full\pgsql\bin"
set "PG_DATA=C:\LevAV_DB\pgdata_localprod_utf8"
set "PG_PORT=5434"
set "NO_PAUSE=0"
if /I "%~1"=="--no-pause" set "NO_PAUSE=1"

set /a FAILS=0
set /a WARNS=0

cd /d "%PROJECT_DIR%"

echo ==========================================
echo LevAV LLC TMS - Health Check
echo ==========================================
echo Project: %PROJECT_DIR%
echo.

echo [1/10] Workspace identity...
if exist "%PROJECT_DIR%PRODUCTION_BASELINE_LOCK.md" (
  echo [OK] Production baseline marker found
) else (
  echo [FAIL] Production baseline marker missing
  set /a FAILS+=1
)

echo [2/10] .env and DATABASE_URL...
if not exist "%PROJECT_DIR%\.env" (
  echo [FAIL] .env is missing
  set /a FAILS+=1
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$envPath='%PROJECT_DIR%\.env'; $line=(Get-Content $envPath | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1); if ($line -and $line -match 'levav_prod_local') { exit 0 } else { exit 1 }"
  if errorlevel 1 (
    echo [WARN] DATABASE_URL is missing or not pointing to levav_prod_local
    set /a WARNS+=1
  ) else (
    echo [OK] DATABASE_URL points to levav_prod_local
  )
)

echo [3/10] Node.js...
node -v >nul 2>&1
if errorlevel 1 (
  echo [FAIL] Node.js unavailable
  set /a FAILS+=1
) else (
  for /f %%v in ('node -v') do echo [OK] Node.js %%v
)

echo [4/10] npm...
where npm >nul 2>&1
if errorlevel 1 (
  echo [FAIL] npm unavailable in PATH
  set /a FAILS+=1
) else (
  echo [OK] npm command found in PATH
)

echo [5/10] package/app...
if not exist "%PROJECT_DIR%\package.json" (
  echo [FAIL] package.json missing
  set /a FAILS+=1
) else (
  if not exist "%PROJECT_DIR%\app" (
    echo [FAIL] app folder missing
    set /a FAILS+=1
  ) else (
    echo [OK] package.json and app folder are present
  )
)

echo [6/10] PostgreSQL runtime...
if not exist "%PG_BIN%\pg_isready.exe" (
  echo [FAIL] pg_isready.exe missing in LOCAL_DB_RUNTIME
  set /a FAILS+=1
) else (
  if not exist "%PG_DATA%\PG_VERSION" (
    echo [FAIL] pgdata_localprod_utf8 is missing
    set /a FAILS+=1
  ) else (
    "%PG_BIN%\pg_isready.exe" -h localhost -p %PG_PORT% -d levav_prod_local >nul 2>&1
    if errorlevel 1 (
      echo [WARN] PostgreSQL is not ready on %PG_PORT%, launcher will try start
      set /a WARNS+=1
    ) else (
      echo [OK] PostgreSQL ready on %PG_PORT%
    )
  )
)

echo [7/10] Port 3000 scan...
set "PORT_PID="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":3000 .*LISTENING"') do set "PORT_PID=%%P"
if defined PORT_PID (
  echo [WARN] Port 3000 busy by PID %PORT_PID%
  set /a WARNS+=1
) else (
  echo [OK] Port 3000 is free
)

echo [8/10] Local storage folders...
set "STORAGE_ROOT=%PROJECT_DIR%storage"
if not exist "%STORAGE_ROOT%" (
  echo [FAIL] storage root is missing
  set /a FAILS+=1
) else (
  set "MISSING_STORAGE=0"
  if not exist "%STORAGE_ROOT%\uploads" (
    echo [FAIL] Missing storage folder: uploads
    set "MISSING_STORAGE=1"
  )
  for %%D in (contracts invoices acts signed other client-contracts) do (
    if not exist "%STORAGE_ROOT%\uploads\%%D" (
      echo [FAIL] Missing storage folder: uploads\%%D
      set "MISSING_STORAGE=1"
    )
  )
  if "%MISSING_STORAGE%"=="1" (
    set /a FAILS+=1
  ) else (
    echo [OK] All storage folders exist
  )
)

echo [9/10] Local uploads write access...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p='%PROJECT_DIR%storage\uploads\other\healthcheck_tmp.txt'; New-Item -ItemType Directory -Force -Path (Split-Path $p) | Out-Null; Set-Content -Path $p -Value 'ok' -Encoding UTF8; Remove-Item $p -Force"
if errorlevel 1 (
  echo [FAIL] Cannot write/delete in storage\uploads\other
  set /a FAILS+=1
) else (
  echo [OK] storage write/delete access works
)

echo [10/10] Local file API route presence...
if exist "%PROJECT_DIR%app\api\files\route.ts" (
  echo [OK] local file API route exists
) else (
  echo [FAIL] app\api\files\route.ts is missing
  set /a FAILS+=1
)

echo.
echo Health check summary: FAIL=%FAILS% WARN=%WARNS%
if %FAILS% GTR 0 (
  echo [RESULT] NOT READY
  set "EXIT_CODE=1"
) else (
  echo [RESULT] READY
  set "EXIT_CODE=0"
)

if "%NO_PAUSE%"=="0" (
  echo.
  pause
)

endlocal & exit /b %EXIT_CODE%
