@echo off
REM Preview StepMates on this PC (demo mode until Firebase is set up).
cd /d "%~dp0public"
start "" http://localhost:8080
python -m http.server 8080
