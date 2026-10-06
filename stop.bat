@echo off
cd /d "%~dp0"
echo ========================================================
echo   Stopping Jungcheogi Trainer Background Services
echo ========================================================
echo.

taskkill /F /IM cloudflared.exe 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173 ^| findstr LISTENING') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8765 ^| findstr LISTENING') do taskkill /F /PID %%a 2>nul

echo All Jungcheogi server, client, and tunnel processes stopped.
timeout /t 2 >nul
exit
