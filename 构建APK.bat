@echo off
chcp 65001 >nul
title OpenReader APK Builder
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-apk.ps1"
echo.
pause
