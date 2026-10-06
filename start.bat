@echo off
cd /d "%~dp0"
title Jungcheogi Trainer (Server + Client + Tunnel)

echo ========================================================
echo   Jungcheogi PC Server and Cloudflare Tunnel Launcher
echo ========================================================
echo.
echo [1/2] Checking and pulling latest updates from GitHub...
git pull origin master

echo.
echo [2/2] Starting server, client, and tunnel in single window...
echo --------------------------------------------------------
echo   - Local PC access:   http://localhost:5173
echo   - Mobile/Out access: Syncing with GitHub README...
echo   - Exit shortcut:     Press Ctrl+C to stop all services
echo   - Tray mode:         Run 'start_tray.bat' to minimize to tray
echo ========================================================
echo.

call npm run dev:all
