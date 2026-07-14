@echo off
echo ===============================================
echo Aqond Factory - Pipeline Test
echo ===============================================
echo.
echo ตรวจสอบ Dashboard ที่ http://127.0.0.1:8765
echo.
echo ===============================================
echo.

cd /d G:\meerak\aqond-brain
python scripts\test_pipeline_simple.py

pause
