@echo off
setlocal EnableExtensions

title LevAV LLC TMS Daily Backup

set "PROJECT_DIR=%~dp0"
set "BACKUP_ROOT=%PROJECT_DIR%DAILY_BACKUP"
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set "STAMP=%%i"
set "DEST=%BACKUP_ROOT%\%STAMP%"

cd /d "%PROJECT_DIR%"

if not exist "%BACKUP_ROOT%" mkdir "%BACKUP_ROOT%" >nul 2>&1
mkdir "%DEST%" >nul 2>&1

echo ==========================================
echo LevAV LLC TMS - Daily Backup
echo ==========================================
echo Source: %PROJECT_DIR%
echo Target: %DEST%
echo.

copy /Y "package.json" "%DEST%\package.json" >nul
copy /Y "package-lock.json" "%DEST%\package-lock.json" >nul
copy /Y "prisma\schema.prisma" "%DEST%\schema.prisma" >nul
copy /Y "start.bat" "%DEST%\start.bat" >nul
copy /Y "PRODUCTION_START.bat" "%DEST%\PRODUCTION_START.bat" >nul
copy /Y "SAFE_SHUTDOWN.bat" "%DEST%\SAFE_SHUTDOWN.bat" >nul
copy /Y "TECHNICAL_BASELINE.md" "%DEST%\TECHNICAL_BASELINE.md" >nul
copy /Y "SAFE_UPDATE_RULES.md" "%DEST%\SAFE_UPDATE_RULES.md" >nul
copy /Y "HEALTH_CHECK.bat" "%DEST%\HEALTH_CHECK.bat" >nul

echo [INFO] Exporting project tree...
tree /F /A "%PROJECT_DIR%" > "%DEST%\project-tree.txt"

if exist "%PROJECT_DIR%storage" (
  echo [INFO] Backing up local storage files...
  robocopy "%PROJECT_DIR%storage" "%DEST%\storage" /E /R:1 /W:1 /NFL /NDL /NJH /NJS /NP >nul
)

echo [OK] Daily backup completed: %DEST%
echo [NOTE] Database is NOT archived by this script.
echo [INFO] PostgreSQL: use scripts\pg-backup-daily.ps1 + Task Scheduler - see SYSTEM_BACKUP_INFO\POSTGRES_BACKUP_RESTORE.md

endlocal
exit /b 0
