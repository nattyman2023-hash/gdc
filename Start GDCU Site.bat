@echo off
title GDCU Site - keep this window open
cd /d "%~dp0"
echo Starting the GDCU site...
echo.
echo Once you see "GDCU running at http://localhost:3000",
echo open your browser at:  http://localhost:3000
echo.
echo To STOP the site, just close this window.
echo ============================================================
echo.
call npm run dev
echo.
echo The server has stopped. Press any key to close this window.
pause >nul
