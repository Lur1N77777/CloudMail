@echo off
pushd "%~dp0\.."

echo.
echo ==========================================
echo   CloudMail APK builder (EAS Cloud)
echo ==========================================
echo.

REM Check eas-cli
where eas >nul 2>nul
if errorlevel 1 (
  echo Installing eas-cli globally...
  call npm install -g eas-cli
  if errorlevel 1 goto :fail
)

echo.
echo Step 1/2: Checking Expo login...
call eas whoami >nul 2>nul
if errorlevel 1 (
  echo Not logged in. Opening browser login...
  echo.
  echo   If you dont have an account yet, sign up at https://expo.dev first.
  echo.
  pause
  call eas login
  if errorlevel 1 goto :fail
)
echo Logged in as:
call eas whoami
echo.

echo Step 2/2: Starting cloud build (10-20 min)...
echo When asked to create project, answer Y.
echo.
call eas build --platform android --profile apk
if errorlevel 1 goto :fail

echo.
echo ==========================================
echo   Done. The APK download link is above.
echo   Builds: https://expo.dev/accounts
echo ==========================================
echo.
pause
popd
exit /b 0

:fail
echo.
echo ==========================================
echo   FAILED. See error above.
echo ==========================================
echo.
pause
popd
exit /b 1

