@echo off
setlocal EnableExtensions

title LevAV TMS Start

set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"
set "LAN_URL_FILE=%PROJECT_DIR%LAN_CLIENT_WORKSTATION\LAN_SERVER_URL.txt"
set "LAN_HOST=%COMPUTERNAME%"

set "LAN_IP="
for /f "usebackq delims=" %%I in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$ip=(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notmatch '^(127|169\.254)\.' } | Select-Object -ExpandProperty IPAddress -First 1); if($ip){$ip}"`) do set "LAN_IP=%%I"
if defined LAN_IP (
  > "%LAN_URL_FILE%" (
    echo http://%LAN_HOST%:3000
    echo http://%LAN_IP%:3000
    echo.
    echo # Auto-updated by start.bat on main server PC.
    echo # First URL uses stable server host name, second uses current LAN IPv4.
    echo # If server IP changes, run start.bat again and copy LAN_CLIENT_WORKSTATION to other PCs.
  )
  echo [INFO] LAN URLs updated: http://%LAN_HOST%:3000 and http://%LAN_IP%:3000
)

echo ==========================================
echo LevAV LLC TMS - Start
echo ==========================================
echo Workspace: %PROJECT_DIR%
echo.

if not exist "%PROJECT_DIR%package.json" (
  echo [ERROR] package.json not found in project root.
  goto :fail
)

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js not found in PATH.
  goto :fail
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm not found in PATH.
  goto :fail
)

if not exist "%PROJECT_DIR%.next\BUILD_ID" (
  echo [INFO] Production build not found. Running npm run build...
  call npm run build
  if errorlevel 1 (
    echo [ERROR] Build failed.
    goto :fail
  )
)

echo [INFO] Starting server on http://localhost:3000 ...
echo [READY] When you see "Ready in ..." below, server is ready.
echo [READY] Open browser: http://localhost:3000
echo [READY] Stop server: Ctrl+C
echo [INFO] Browser window will open automatically when server is ready.
start /b powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%PROJECT_DIR%scripts\open-browser-when-ready.ps1" -Url "http://localhost:3000" -TimeoutSeconds 300

call npm run start
set "RC=%errorlevel%"
if not "%RC%"=="0" (
  echo.
  echo [ERROR] Server stopped with exit code %RC%.
  goto :fail_with_code
)

echo.
echo [INFO] Server stopped normally.
pause
endlocal & exit /b 0

:fail
echo.
echo [ERROR] Start aborted.
pause
endlocal & exit /b 1

:fail_with_code
pause
endlocal & exit /b %RC%
