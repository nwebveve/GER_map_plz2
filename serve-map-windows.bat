@echo off
setlocal

echo Starte lokalen Server auf http://localhost:8080
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve-map-windows.ps1" -Port 8080 -Root "%~dp0"
