@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "BUILT=%~dp0dist\child\win-unpacked\集計システム 子機.exe"
if exist "%BUILT%" (
    echo ビルド版の子機を起動します...
    start "" "%BUILT%"
    exit /b 0
)
echo ビルド版が無いため開発モードで起動します...
echo 先に ビルド.bat を実行すると dist の exe から起動できます。
call npm run electron:child
pause