@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ===============================================
echo  AQOND Hook Factory - One-Click Setup
echo ===============================================
echo.

where python >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Install Python 3.10+ and add to PATH.
    pause
    exit /b 1
)

where ffmpeg >nul 2>&1
if errorlevel 1 (
    echo [WARN] ffmpeg not found in PATH — video compile will fail until installed.
    echo        Download: https://ffmpeg.org/download.html
    echo.
)

if not exist ".venv\Scripts\python.exe" (
    echo [1/4] Creating virtual environment .venv ...
    python -m venv .venv
    if errorlevel 1 (
        echo       Retrying with py launcher ...
        py -3 -m venv .venv
    )
    if not exist ".venv\Scripts\python.exe" (
        echo [ERROR] Failed to create venv. Delete folder .venv and try again.
        pause
        exit /b 1
    )
) else (
    echo [1/4] Virtual environment .venv already exists — skipping create.
)

echo [2/4] Upgrading pip ...
call ".venv\Scripts\activate.bat"
python -m pip install --upgrade pip

echo [3/4] Installing requirements-factory.txt ...
pip install -r requirements-factory.txt
if errorlevel 1 (
    echo [ERROR] pip install failed.
    pause
    exit /b 1
)

if not exist ".env" (
    if exist ".env.factory.example" (
        echo [4/4] Creating .env from .env.factory.example ...
        copy /Y ".env.factory.example" ".env" >nul
        echo       Edit .env and set AQOND_TTS_URL / API keys before running.
    ) else (
        echo [4/4] No .env.factory.example found — create .env manually.
    )
) else (
    echo [4/4] .env already exists — kept as-is.
)

echo.
echo ===============================================
echo  Setup complete!
echo ===============================================
echo.
echo  Next steps:
echo    1. Edit .env — set AQOND_TTS_URL and optional GEMINI/OPENAI keys
echo    2. Start TTS:  cd G:\aqond-ai-studio\MeloTTS ^& python app_voice_api.py
echo    3. Test hook:  RUN_HOOK_FACTORY.bat
echo    4. Scheduler:  RUN_HOOK_SCHEDULER.bat
echo.
echo  Python: .venv\Scripts\python.exe
echo ===============================================
pause
endlocal
