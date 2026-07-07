@echo off
setlocal
cd /d "%~dp0"

REM Double-click guard: if TMS already runs, only open browser.
netstat -ano | findstr /C:":3000" | findstr /C:"LISTENING" >nul
if not errorlevel 1 (
  echo [INFO] LevAV TMS is already running on port 3000.
  echo [INFO] Opening http://localhost:3000 ...
  start "" "http://localhost:3000"
  endlocal
  exit /b 0
)

call "%~dp0PRODUCTION_START.bat"
endlocal
