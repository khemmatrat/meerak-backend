@echo off
REM Internal helper — ensures .venv exists and returns python path via HOOK_PY
set "HOOK_ROOT=%~dp0"
cd /d "%HOOK_ROOT%"

if not exist ".venv\Scripts\python.exe" (
    echo.
    echo [ERROR] .venv not found. Run SETUP_HOOK_FACTORY.bat first.
    echo.
    exit /b 1
)

set "HOOK_PY=%HOOK_ROOT%.venv\Scripts\python.exe"
exit /b 0
