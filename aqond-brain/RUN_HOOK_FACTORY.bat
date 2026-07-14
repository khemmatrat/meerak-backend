@echo off
setlocal EnableExtensions
cd /d "%~dp0"

call "%~dp0_hook_venv.bat"
if errorlevel 1 (
    pause
    exit /b 1
)

echo ===============================================
echo  AQOND Hook Factory - Test Single Hook
echo ===============================================
echo  Ensure TTS is running: app_voice_api.py on port 8000
echo.

"%HOOK_PY%" scripts\factory\hook_factory.py --topic "MatchJob กันคนโกงจ่ายค่าจ้าง"
set "RC=%ERRORLEVEL%"

echo.
if "%RC%"=="0" (
    echo Done. Check output\hook_factory\final\
) else (
    echo Failed. See logs\hook_factory.log
)
pause
exit /b %RC%
