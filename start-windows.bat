@echo off
title DUSKHOLD server
cd /d "%~dp0"
if not exist server.js (
  echo Du skal pakke zip-filen ud foerst: hoejreklik paa duskhold-online.zip og vaelg "Udpak alle".
  echo Aabn derefter den udpakkede mappe og dobbeltklik paa start-windows.bat igen.
  pause
  exit /b
)
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js er ikke installeret. Hent "LTS" fra https://nodejs.org og dobbeltklik paa denne fil igen.
  echo Har du lige installeret det, saa genstart computeren foerst.
  start "" https://nodejs.org
  pause
  exit /b
)
if not exist node_modules\ws (
  echo Installerer spillet - det tager under et minut foerste gang...
  call npm install --omit=dev
  if not exist node_modules\ws (
    echo.
    echo Installationen gik galt. Tjek at du er paa internettet, og proev igen.
    pause
    exit /b
  )
)
echo.
echo DUSKHOLD starter. Spillet aabner i din browser om et oejeblik.
echo Luk dette vindue for at stoppe serveren.
set OPEN_BROWSER=1
node server.js
pause
