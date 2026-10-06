@echo off
cd /d "%~dp0"
echo ========================================================
echo   Jungcheogi Trainer Desktop Shortcut Generator
echo ========================================================
echo.
cscript //nologo "%~dp0scripts\create_shortcuts.vbs"
echo.
echo Desktop shortcuts created:
echo   - Jungcheogi_Trainer_Tray.lnk (Tray Mode)
echo   - Jungcheogi_Trainer_Window.lnk (Single Window Mode)
echo ========================================================
pause
