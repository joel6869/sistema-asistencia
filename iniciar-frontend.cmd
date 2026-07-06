@echo off
cd /d "%~dp0frontend"
"C:\Program Files\nodejs\npm.cmd" run dev -- --host 0.0.0.0
pause
