@echo off
title Kenzious Reel v2 - Tao Ban Portable (Chay Ngay Khong Can Cai)
cd /d "%~dp0"

echo ========================================================
echo   KENZIOUS REEL V2 - DONG GOI BAN PORTABLE (ZIP)
echo ========================================================
echo.
echo [1/2] Dang dong goi ung dung (Tao thu muc chay truc tiep)...
call npx electron-builder --dir
if errorlevel 1 (
    echo.
    echo [LOI] Dong goi that bai. Vui long kiem tra lai console.
    pause
    exit /b 1
)

echo.
echo [2/2] Dang nen thu muc win-unpacked thanh file ZIP...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\make-zip.ps1"
if errorlevel 1 (
    echo.
    echo [LOI] Nen file ZIP that bai.
    pause
    exit /b 1
)

echo.
echo ========================================================
echo [XONG!] 
echo File Portable da san sang tai: dist\Kenzious-Reel-v2-Portable.zip
echo.
echo Ban chi can gui file ZIP nay cho ong anh hoac khach hang:
echo Ho chi can giai nen ra va click dup vao:
echo     "Kenzious Reel Studio v2.exe"
echo la ung dung se tu mo va chay ngay lap tuc, khong can cai dat!
echo ========================================================
powershell -NoProfile -Command "explorer.exe /select,'dist\Kenzious-Reel-v2-Portable.zip'"
pause
