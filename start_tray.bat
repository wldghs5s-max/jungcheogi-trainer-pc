@echo off
cd /d "%~dp0"
echo Starting Jungcheogi Trainer in System Tray mode...
start "" wscript.exe "%~dp0scripts\run_tray.vbs"
exit
