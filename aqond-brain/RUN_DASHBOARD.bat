@echo off
echo ===============================================
echo Aqond Factory - Production Control Center
echo ===============================================
echo.
echo Starting dashboard at http://127.0.0.1:8765
echo กด Ctrl+C เพื่อหยุด
echo.
echo ===============================================
echo.

cd /d G:\meerak\aqond-brain
python -m uvicorn factory_web_dashboard:app --host 127.0.0.1 --port 8765 --app-dir scripts

pause
