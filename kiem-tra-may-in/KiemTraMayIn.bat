@echo off
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0kiem-tra-may-in.ps1"
echo.
pause
