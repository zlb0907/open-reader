@echo off
chcp 65001 >nul
title OpenReader - Upload APK to Gitee
cd /d "%~dp0"
set "NOPAUSE=%~1"

echo ============================================
echo   Upload publish\OpenReader.apk to Gitee (fixed Release)
echo ============================================
echo.
if not exist ".gitee-token" (
    echo [ERROR] .gitee-token missing.
    if /i "%NOPAUSE%"=="--no-pause" exit /b 1
    pause
    exit /b 1
)
if not exist "publish\OpenReader.apk" (
    echo [ERROR] publish\OpenReader.apk not found. Run the build first.
    if /i "%NOPAUSE%"=="--no-pause" exit /b 1
    pause
    exit /b 1
)

call node publish-gitee.mjs
if errorlevel 1 (
    echo [ERROR] Upload or SHA check failed. Online asset may still be old.
    if /i "%NOPAUSE%"=="--no-pause" exit /b 1
    pause
    exit /b 1
)

echo.
echo Done. Now upload publish\update.json to PythonAnywhere ~/or_update/
echo.
if /i "%NOPAUSE%"=="--no-pause" exit /b 0
pause
exit /b 0
