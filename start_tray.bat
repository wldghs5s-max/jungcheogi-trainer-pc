@echo off
cd /d "%~dp0"
title Jungcheogi Trainer (Tray Mode)

echo ========================================================
echo   Jungcheogi PC Server - Starting System Tray Mode...
echo ========================================================
echo.
echo [1/2] Checking latest updates from GitHub...
git pull origin master
echo.
echo [2/2] Launching background server and system tray icon...
start "" powershell.exe -STA -NoProfile -ExecutionPolicy Bypass -EncodedCommand UwBlAHQALQBMAG8AYwBhAHQAaQBvAG4AIAAtAEwAaQB0AGUAcgBhAGwAUABhAHQAaAAgACgARwBlAHQALQBMAG8AYwBhAHQAaQBvAG4AKQAuAFAAYQB0AGgAOwAgACYAIAAuAFwAcwBjAHIAaQBwAHQAcwBcAHQAcgBhAHkAXwBsAGEAdQBuAGMAaABlAHIALgBwAHMAMQA=

echo.
echo [SUCCESS] Platform is now running in the system tray!
echo   - Check Windows taskbar tray (click '^' near the clock)
echo   - Local browser (http://localhost:5173) opens in 3s
echo   - To stop anytime, right-click tray icon or run stop.bat
echo ========================================================
timeout /t 3 >nul
exit
