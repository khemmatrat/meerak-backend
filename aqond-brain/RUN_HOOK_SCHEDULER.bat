@echo off
setlocal EnableExtensions
cd /d "%~dp0"

call "%~dp0_hook_venv.bat"
if errorlevel 1 (
    pause
    exit /b 1
)

echo ===============================================
echo  AQOND Hook Factory Scheduler
echo  Ctrl+C to stop
echo ===============================================
echo.

"%HOOK_PY%" scripts\factory\app_scheduler.py
pause
