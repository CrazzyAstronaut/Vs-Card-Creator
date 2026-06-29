@echo off
REM ============================================================
REM  V's Card Creator - Arranque con un solo clic (Windows)
REM  - Instala dependencias (solo la primera vez)
REM  - Construye la app
REM  - Arranca el servidor (frontend + API en el mismo puerto)
REM  - Muestra la URL de acceso por Tailscale (IP del tailnet)
REM ============================================================
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "PORT=3001"
set "NODE_ENV=production"

echo ==================================================
echo    V's Card Creator
echo ==================================================

REM 1) Comprobar Node.js
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js no esta instalado.
  echo         Descargalo de https://nodejs.org ^(version 18 o superior^).
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do echo [OK] Node %%v

REM 2) Instalar dependencias si faltan
if not exist "node_modules" (
  echo [..] Instalando dependencias por primera vez ^(puede tardar^)...
  call npm install
  if errorlevel 1 (
    echo [ERROR] Fallo la instalacion de dependencias.
    pause
    exit /b 1
  )
) else (
  echo [OK] Dependencias ya instaladas
)

REM 3) Construir el frontend
echo [..] Construyendo la aplicacion...
call npm run build
if errorlevel 1 (
  echo [ERROR] Fallo la construccion de la aplicacion.
  pause
  exit /b 1
)

REM 4) Detectar Tailscale y dejar activo el acceso remoto
set "TS="
if exist "%ProgramFiles%\Tailscale\tailscale.exe" set "TS=%ProgramFiles%\Tailscale\tailscale.exe"
if not defined TS if exist "%ProgramFiles(x86)%\Tailscale\tailscale.exe" set "TS=%ProgramFiles(x86)%\Tailscale\tailscale.exe"
if not defined TS (
  where tailscale >nul 2>nul && set "TS=tailscale"
)

set "TSIP="
if defined TS (
  echo [OK] Tailscale detectado
  for /f "usebackq tokens=1" %%i in (`"%TS%" ip -4`) do if not defined TSIP set "TSIP=%%i"
) else (
  echo [i] Tailscale no detectado. La app estara disponible en tu red local.
  echo     Instalalo desde https://tailscale.com/download para acceso remoto.
)

echo.
echo ==================================================
echo   La aplicacion esta corriendo. Abrela en:
echo     - Local:          http://localhost:%PORT%
if defined TSIP echo     - Tailscale ^(IP^): http://%TSIP%:%PORT%
echo.
echo   Deja esta ventana abierta. Pulsa Ctrl+C para detener.
echo ==================================================
echo.

REM 5) Arrancar el servidor (sirve frontend + API en 0.0.0.0:PORT)
call node server/index.js

pause
