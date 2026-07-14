@echo off
chcp 65001 >nul 2>&1
setlocal EnableExtensions
cd /d "%~dp0"

REM ปิด server เก่าที่ค้าง port 8780
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8780" ^| findstr LISTENING') do (
    echo ปิด process เก่า PID %%a บน port 8780...
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 2 /nobreak >nul

REM ใช้ Python ระบบโดยตรง (.venv บนเครื่องนี้มักพังเพราะ path มีช่องว่าง)
set "STUDIO_PY=C:\Users\Windows 10\AppData\Local\Programs\Python\Python310\python.exe"

if not exist "%STUDIO_PY%" (
    for /f "delims=" %%P in ('where python 2^>nul') do (
        set "STUDIO_PY=%%P"
        goto :found_py
    )
    echo [ERROR] ไม่พบ Python — ติดตั้ง Python 3.10+ ก่อน
    pause
    exit /b 1
)
:found_py

echo ===============================================
echo  AQOND Media Studio - 3 Flows
echo ===============================================
echo  URL: http://127.0.0.1:8780
echo  Python: %STUDIO_PY%
echo.
echo  TTS:  python app_voice_api.py  (port 8000)
echo  Qwen: ollama pull qwen2.5vl:3b
echo  Image: START_A1111.bat  (SD WebUI API port 7860)
echo  Studio: RUN_MEDIA_STUDIO.bat  (port 8780)
echo  กด Ctrl+C เพื่อหยุด
echo ===============================================
echo.

"%STUDIO_PY%" "%~dp0scripts\media_studio_server.py"
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" (
    echo.
    echo [ERROR] Server หยุดทำงาน (code %RC%)
)
pause
exit /b %RC%

