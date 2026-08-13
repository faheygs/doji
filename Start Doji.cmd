@echo off
setlocal
cd /d "%~dp0"
title Doji Mobile

:start
npm.cmd run start -- --dev-client --lan --port 8081
echo.
echo Metro stopped. Retrying in 5 seconds; close this window to stop Doji.
timeout /t 5 /nobreak >nul
goto start
