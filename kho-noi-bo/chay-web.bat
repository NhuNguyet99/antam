@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Dang khoi dong web kho noi bo...
start "" http://localhost:8000
python server.py
if errorlevel 1 py server.py
pause
