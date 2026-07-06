@echo off
cd /d "%~dp0"
echo Iniciando sistema de asistencia...
echo.
"C:\Program Files\nodejs\npm.cmd" run dev
echo.
echo El servidor se detuvo. Presiona una tecla para cerrar esta ventana.
pause > nul
