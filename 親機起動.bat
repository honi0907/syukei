@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 集計システム（Electron）を起動しています...
call npm run electron
pause
