@echo off
rem One-time: switch LevAV_Postgres service to binaries in C:\LevAV_DB\pgsql.
rem Double-click, then press "Yes" in the Windows UAC prompt.
echo Requesting administrator rights (press "Yes" in the Windows prompt)...
powershell -NoProfile -Command "Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','%~dp0scripts\Move-PgBinaries-Out-Of-OneDrive.ps1'"
echo.
echo Result (logs\pg-binaries-move.log):
type "%~dp0logs\pg-binaries-move.log"
echo.
pause
