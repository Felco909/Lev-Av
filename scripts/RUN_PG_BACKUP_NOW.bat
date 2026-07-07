@echo off
setlocal EnableExtensions
REM ASCII only - avoid chcp and unicode in CMD output.
title LevAV PostgreSQL backup

set "PROJECT_DIR=%~dp0.."
cd /d "%PROJECT_DIR%"

echo ==========================================
echo LevAV TMS - manual PostgreSQL backup
echo ==========================================
echo Project: %CD%
echo Local dumps: see pg_backup.log under D: or %%USERPROFILE%%\LevAv_Postgres_Backups\db
echo Drive copy log: %%USERPROFILE%%\LevAv_Postgres_Backups\logs\google_drive_backup.log
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0pg-backup-daily.ps1" -ProjectDir "%CD%"

set "RC=%ERRORLEVEL%"
echo.
if "%RC%"=="0" (
  echo [OK] Backup finished successfully.
) else (
  echo [ERROR] Exit code: %RC% - see pg_backup.log
)
pause
exit /b %RC%
