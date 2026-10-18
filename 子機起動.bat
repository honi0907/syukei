@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 集計システム 子機（Electron）を起動しています...
call npx electron electron/koki/main.js
pause
