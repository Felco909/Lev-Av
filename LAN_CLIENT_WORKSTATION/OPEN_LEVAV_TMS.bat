@echo off
setlocal EnableExtensions
REM Open TMS in browser using URL from LAN_SERVER_URL.txt (ASCII only).

title LevAV TMS LAN Browser

set "PS1=%~dp0read-lan-url.ps1"
set "CFG=%~dp0LAN_SERVER_URL.txt"

if not exist "%CFG%" (
  echo [ERROR] LAN_SERVER_URL.txt not found next to this script.
  pause
  exit /b 1
)

set "SERVER_URL="
for /f "usebackq delims=" %%U in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%"`) do set "SERVER_URL=%%U"

if not defined SERVER_URL (
  echo [ERROR] No URL in LAN_SERVER_URL.txt (need http://IP:3000).
  echo Edit the file and set server URL, example: http://192.168.1.10:3000
  notepad "%CFG%"
  pause
  exit /b 1
)

echo Opening: %SERVER_URL%
start "" "%SERVER_URL%"
exit /b 0
