@echo off
chcp 65001 >nul
title OpenReader Toolchain Check
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-apk.ps1" -CheckOnly
echo.
pause
