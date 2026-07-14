@echo off
setlocal EnableExtensions
cd /d "%~dp0"

call "%~dp0_hook_venv.bat"
if errorlevel 1 (
    pause
    exit /b 1
)

echo ===============================================
echo  AQOND Hook Factory - Run ALL slots today
echo ===============================================
echo.

"%HOOK_PY%" scripts\factory\hook_factory.py --all-today
set "RC=%ERRORLEVEL%"

pause
exit /b %RC%
