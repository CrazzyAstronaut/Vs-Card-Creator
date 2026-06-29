@echo off
REM ============================================================
REM  Lanzador de un solo clic para Windows.
REM  Ejecuta iniciar.bash usando Git Bash.
REM ============================================================
setlocal
cd /d "%~dp0"

set "BASH=%ProgramFiles%\Git\bin\bash.exe"
if not exist "%BASH%" set "BASH=%ProgramFiles(x86)%\Git\bin\bash.exe"
if not exist "%BASH%" set "BASH=%LOCALAPPDATA%\Programs\Git\bin\bash.exe"

if not exist "%BASH%" (
  echo No se encontro Git Bash.
  echo Instala Git para Windows desde: https://git-scm.com/download/win
  echo (incluye Git Bash, necesario para ejecutar iniciar.bash^)
  pause
  exit /b 1
)

"%BASH%" "%~dp0iniciar.bash"
pause
