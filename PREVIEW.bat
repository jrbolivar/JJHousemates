@echo off
REM Preview J&J Housemates Online on this PC (demo mode until Firebase is set up).
cd /d "%~dp0public"
start "" http://localhost:8080
python -m http.server 8080
