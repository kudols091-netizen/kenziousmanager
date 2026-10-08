@echo off
title Kenzious Reel v2 - AI Video Studio
cd /d "%~dp0"
echo ========================================================
echo        KENZIOUS REEL V2 - AI VIDEO STUDIO
echo ========================================================
echo Dang khoi chay ung dung Kenzious Reel Studio v2...
rem Server Kenzious-Instagram (cong 5055) do app tu bat: src/core/ig-server.js

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
