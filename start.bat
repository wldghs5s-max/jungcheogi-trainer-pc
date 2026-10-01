@echo off
cd /d "%~dp0"
title Jungcheogi Trainer Launcher

echo ========================================================
echo   Jungcheogi PC Server and Cloudflare Tunnel Launcher
echo ========================================================
echo.
echo [1/4] Checking and pulling latest updates from GitHub...
git pull origin master

echo.
echo [2/4] Starting backend and frontend dev server...
start "Jungcheogi-Server" cmd /k "npm run dev"

echo [3/4] Waiting 5 seconds for server initialization...
powershell -NoProfile -Command "Start-Sleep -Seconds 5"

echo [4/4] Starting Cloudflare external tunnel and syncing README...
start "Jungcheogi-Tunnel" cmd /k "npm run tunnel"

echo.
echo ========================================================
echo   [Status: SUCCESS]
echo   - Local PC access:   http://localhost:5173
echo   - Mobile/Out access: Check GitHub README or Tunnel window!
echo ========================================================
echo.
pause
