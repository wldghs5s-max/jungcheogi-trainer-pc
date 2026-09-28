@echo off
cd /d "%~dp0"
title Jungcheogi Trainer Launcher

echo ========================================================
echo   Jungcheogi PC Server and Cloudflare Tunnel Launcher
echo ========================================================
echo.
echo [1/3] Starting backend and frontend dev server...
start "Jungcheogi-Server" cmd /k "npm run dev"

echo [2/3] Waiting 5 seconds for server initialization...
powershell -NoProfile -Command "Start-Sleep -Seconds 5"

echo [3/3] Starting Cloudflare external tunnel and syncing README...
start "Jungcheogi-Tunnel" cmd /k "npm run tunnel"

echo.
echo ========================================================
echo   [Status: SUCCESS]
echo   - Local PC access:   http://localhost:5173
echo   - Mobile/Out access: Check GitHub README or Tunnel window!
echo ========================================================
echo.
pause
