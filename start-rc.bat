@echo off
REM Claude Code Remote Control for this PC (session name PC1-TMS).
REM Restarts automatically 30 s after any exit (network drop, update, crash).
REM Stop: close this window or press Ctrl+C, then answer Y.
setlocal
title Claude Remote Control - PC1-TMS
cd /d "%~dp0"
if not exist ".runtime" mkdir ".runtime"

:loop
echo %date% %time% [INFO] starting claude remote-control>> ".runtime\remote_control.log"
echo [INFO] %date% %time% starting claude remote-control --name "PC1-TMS"
call claude remote-control --name "PC1-TMS"
echo %date% %time% [INFO] remote-control exited, code %ERRORLEVEL%>> ".runtime\remote_control.log"
echo [INFO] remote-control exited (code %ERRORLEVEL%). Restart in 30 s...
timeout /t 30 /nobreak >nul
goto loop
