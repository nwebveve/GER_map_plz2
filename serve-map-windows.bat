@echo off
setlocal

if not exist caddy.exe (
  echo [FEHLER] caddy.exe nicht gefunden.
  echo Lege caddy.exe in diesen Ordner und starte die Datei erneut.
  exit /b 1
)

echo Starte lokalen Server auf http://localhost:8080
caddy.exe file-server --root . --listen :8080
