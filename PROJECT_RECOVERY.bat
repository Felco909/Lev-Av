@echo off
setlocal EnableExtensions

title LevAV LLC TMS Project Recovery Check

set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"

set /a WARNINGS=0
set /a PASSED=0
set "STATUS=READY"

echo ==========================================
echo LevAV LLC TMS - Project Recovery Check
echo ==========================================
echo Workspace: %PROJECT_DIR%
echo.

echo [1/8] Node.js check...
node -v >nul 2>&1
if errorlevel 1 (
  echo [WARNING] Node.js not found in PATH.
  set /a WARNINGS+=1
) else (
  for /f %%v in ('node -v') do echo [OK] Node.js %%v
  set /a PASSED+=1
)

echo [2/8] npm check...
npm -v >nul 2>&1
if errorlevel 1 (
  echo [WARNING] npm not found in PATH.
  set /a WARNINGS+=1
) else (
  for /f %%v in ('npm -v') do echo [OK] npm %%v
  set /a PASSED+=1
)

echo [3/8] .env check...
if exist ".env" (
  echo [OK] .env found
  set /a PASSED+=1
) else (
  echo [WARNING] .env missing
  set /a WARNINGS+=1
)

echo [4/8] package.json check...
if exist "package.json" (
  echo [OK] package.json found
  set /a PASSED+=1
) else (
  echo [WARNING] package.json missing
  set /a WARNINGS+=1
)

echo [5/8] Prisma schema check...
if exist "prisma\schema.prisma" (
  echo [OK] prisma\schema.prisma found
  set /a PASSED+=1
) else (
  echo [WARNING] prisma\schema.prisma missing
  set /a WARNINGS+=1
)

echo [6/8] Port 3000 check...
set "PORT_PID="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":3000 .*LISTENING"') do set "PORT_PID=%%P"
if defined PORT_PID (
  echo [WARNING] Port 3000 is busy by PID %PORT_PID%
  tasklist /FI "PID eq %PORT_PID%"
  set /a WARNINGS+=1
) else (
  echo [OK] Port 3000 is free
  set /a PASSED+=1
)

echo [7/8] Launcher BAT files check...
set /a BAT_COUNT=0
for %%F in ("start.bat" "PRODUCTION_START.bat" "SAFE_SHUTDOWN.bat" "HEALTH_CHECK.bat" "DAILY_BACKUP.bat") do (
  if exist "%%~F" (
    echo [OK] %%~F found
  ) else (
    echo [WARNING] %%~F missing
    set /a WARNINGS+=1
  )
  set /a BAT_COUNT+=1
)
set /a PASSED+=1

echo [8/8] Main workspace identity check...
if exist "app" (
  echo [OK] app folder found
  set /a PASSED+=1
) else (
  echo [WARNING] app folder missing
  set /a WARNINGS+=1
)

echo.
if %WARNINGS% GTR 0 set "STATUS=WARNING"
echo Recovery status: %STATUS%
echo Passed checks: %PASSED%
echo Warnings: %WARNINGS%
echo.
echo Use PRODUCTION_START.bat for normal startup.
echo Use SAFE_SHUTDOWN.bat for controlled stop.

pause
endlocal
exit /b 0
