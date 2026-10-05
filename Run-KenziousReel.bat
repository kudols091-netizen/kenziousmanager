@echo off
title Kenzious Reel v2 - AI Video Studio
cd /d "%~dp0"
echo ========================================================
echo        KENZIOUS REEL V2 - AI VIDEO STUDIO
echo ========================================================
echo Dang khoi chay ung dung Kenzious Reel Studio v2...
rem Tu dong khoi chay Kenzious-Instagram Server neu ton tai thu muc
powershell -NoProfile -Command "if ((Test-Path 'D:\KOAL\Kenzious-instagram\ui\server.py') -and (-not (Get-NetTCPConnection -LocalPort 5055 -ErrorAction SilentlyContinue))) { Start-Process python -ArgumentList 'D:\KOAL\Kenzious-instagram\ui\server.py' -WorkingDirectory 'D:\KOAL\Kenzious-instagram' -WindowStyle Hidden }"


if exist "%~dp0node_modules\electron\dist\electron.exe" (
    start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
    goto done
)

if exist "%~dp0node_modules\.bin\electron.cmd" (
    start "" "%~dp0node_modules\.bin\electron.cmd" "%~dp0."
    goto done
)

call npm.cmd start

:done
exit
