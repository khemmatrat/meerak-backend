@echo off

chcp 65001 >nul 2>&1

setlocal EnableExtensions



REM AQOND — เปิด Stable Diffusion WebUI Forge + API (port 7860)

REM ติดตั้งไว้ที่ G:\stable-diffusion-webui-forge



set "WEBUI_DIR=G:\stable-diffusion-webui-forge"



if not "%~1"=="" set "WEBUI_DIR=%~1"

if defined WEBUI_DIR_OVERRIDE set "WEBUI_DIR=%WEBUI_DIR_OVERRIDE%"



if not exist "%WEBUI_DIR%\webui-user.bat" (

    echo ===============================================

    echo  ไม่พบ WebUI ที่: %WEBUI_DIR%

    echo ===============================================

    echo.

    echo  ถ้าติดตั้งคนละโฟลเดอร์ รันแบบนี้:

    echo    START_A1111.bat "D:\path\to\stable-diffusion-webui-forge"

    echo.

    echo  หรือ double-click ที่:

    echo    G:\stable-diffusion-webui-forge\webui-user.bat

    echo ===============================================

    pause

    exit /b 1

)



echo ===============================================

echo  AQOND — Stable Diffusion WebUI (API port 7860)

echo  โฟลเดอร์: %WEBUI_DIR%

echo  รอจนเห็น: Running on local URL: http://127.0.0.1:7860

echo  Media Studio เรียก /sdapi/v1/txt2img

echo  กด Ctrl+C เพื่อหยุด

echo ===============================================

echo.



cd /d "%WEBUI_DIR%"

call webui-user.bat


