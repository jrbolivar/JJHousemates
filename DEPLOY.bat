@echo off
REM Publish J&J Housemates Online to Firebase Hosting (free Spark plan).
REM Uploads the public folder and the Firestore security rules. See SETUP.md.
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Opening the download page - install the LTS version,
  echo then double-click DEPLOY.bat again.
  start "" https://nodejs.org/
  pause
  exit /b 1
)

if not exist .firebaserc (
  echo Enter your Firebase project ID. It is shown in the Firebase console under
  echo Project settings - General - Project ID, for example jj-housemates-1a2b3
  set /p PROJECT=Project ID:
  call :saveProject
)

echo.
echo Signing in to Firebase (a browser window opens the first time)...
call npx --yes firebase-tools login
if errorlevel 1 goto failed

echo.
echo Publishing...
call npx --yes firebase-tools deploy
if errorlevel 1 goto failed

echo.
echo Done. Your app is live at the Hosting URL shown above (https://PROJECT-ID.web.app).
pause
exit /b 0

:saveProject
> .firebaserc echo {"projects":{"default":"%PROJECT%"}}
exit /b 0

:failed
echo.
echo Publishing failed - read the message above. To change the project ID,
echo delete the .firebaserc file in this folder and run DEPLOY.bat again.
pause
exit /b 1
