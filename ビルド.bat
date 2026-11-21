@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 実行中の集計システムを終了しています...
call node scripts\stop-syukei-for-build.js
echo.
echo 親機・子機インストーラをビルドしています（数分かかります）...
set CSC_IDENTITY_AUTO_DISCOVERY=false
call npm run dist:all
if errorlevel 1 (
    echo.
    echo ビルドに失敗しました。
    pause
    exit /b 1
)
echo.
echo 完了:
echo   dist\parent\win-unpacked\集計システム 親機.exe
echo   dist\child\win-unpacked\集計システム 子機.exe
echo   dist\parent\syukei-parent-setup-*.exe
echo   dist\child\syukei-child-setup-*.exe
echo.
pause