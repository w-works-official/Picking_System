@echo off
rem System V3 - messenger window helper for any PC (2026-11-05)
rem  - Installs to C:\SystemV3 and runs WITHOUT a black window (pythonw, --msn = helper only).
rem  - --msn never takes CS sheet jobs: collecting/posting stay on the office collector PC.
rem  - First run: desktop icon + start with Windows + v3msn:// link for the System V3 [start helper] button.
rem  - Stop:  msn_helper.bat stop      (ASCII only on purpose: Korean text breaks cmd parsing)
setlocal
set "MODE=%~1"
set "D=C:\SystemV3"
if not exist "%D%" mkdir "%D%" >nul 2>nul
if not exist "%D%" set "D=%LOCALAPPDATA%\SystemV3"
if not exist "%D%" mkdir "%D%" >nul 2>nul
title System V3 messenger helper
if /i "%MODE%"=="stop" goto stop

rem ---- install / refresh: launcher copy, hidden starter, icons, v3msn:// link ----
if /i not "%~f0"=="%D%\msn_helper.bat" copy /y "%~f0" "%D%\msn_helper.bat" >nul 2>nul
> "%D%\msn_start.vbs" echo CreateObject("WScript.Shell").Run "cmd /c ""%D%\msn_helper.bat"" run", 0, False
powershell -NoProfile -ExecutionPolicy Bypass -Command "$q=[char]34; $w=New-Object -ComObject WScript.Shell; foreach($f in @([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('Startup'))){ $s=$w.CreateShortcut((Join-Path $f 'V3 Messenger Helper.lnk')); $s.TargetPath='wscript.exe'; $s.Arguments=$q+'%D%\msn_start.vbs'+$q; $s.WorkingDirectory='%D%'; $s.IconLocation='shell32.dll,15'; $s.Save() }" >nul 2>nul
reg add "HKCU\Software\Classes\v3msn" /ve /d "URL:System V3 messenger helper" /f >nul 2>nul
reg add "HKCU\Software\Classes\v3msn" /v "URL Protocol" /d "" /f >nul 2>nul
reg add "HKCU\Software\Classes\v3msn\shell\open\command" /ve /d "wscript.exe \"%D%\msn_start.vbs\"" /f >nul 2>nul

rem ---- already running? ----
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://127.0.0.1:47811/msn/ping' | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 (
  if /i not "%MODE%"=="run" echo The messenger helper is already running. You can close this window.
  if /i not "%MODE%"=="run" timeout /t 5 >nul
  exit /b 0
)

rem ---- python ----
set "PY="
python -c "import sys" >nul 2>nul && set "PY=python"
if not defined PY py -3 -c "import sys" >nul 2>nul && set "PY=py -3"
if not defined PY goto nopython
%PY% -c "import sys,os;print(os.path.join(os.path.dirname(sys.executable),'pythonw.exe'))" > "%D%\pyw.txt" 2>nul
set "PYW="
set /p PYW=<"%D%\pyw.txt"
if not exist "%PYW%" set "PYW="

rem ---- latest helper (kept only if it parses) ----
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { [Net.ServicePointManager]::SecurityProtocol='Tls12'; Invoke-WebRequest -UseBasicParsing 'https://raw.githubusercontent.com/w-works-official/Picking_System/main/docs/g1_v3_link.py' -OutFile '%D%\g1_v3_link.new'; exit 0 } catch { exit 1 }" >nul 2>nul
if exist "%D%\g1_v3_link.new" %PY% -c "import ast,sys;ast.parse(open(sys.argv[1],encoding='utf-8').read())" "%D%\g1_v3_link.new" >nul 2>nul && move /y "%D%\g1_v3_link.new" "%D%\g1_v3_link.py" >nul
if exist "%D%\g1_v3_link.new" del "%D%\g1_v3_link.new" >nul 2>nul
if not exist "%D%\g1_v3_link.py" goto nodownload

rem ---- start without a window ----
if defined PYW (start "" "%PYW%" "%D%\g1_v3_link.py" --msn) else (start "" /min %PY% "%D%\g1_v3_link.py" --msn)
if /i "%MODE%"=="run" exit /b 0
echo.
echo Installed to %D% and started in the background (no black window needed).
echo  - Desktop icon "V3 Messenger Helper" and auto start with Windows are ready.
echo  - In System V3 CS - Messenger tab, the helper connects in a few seconds.
echo  - To stop it: run  "%D%\msn_helper.bat" stop
timeout /t 10 >nul
exit /b 0

:stop
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*g1_v3_link.py*--msn*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>nul
echo The messenger helper is stopped.
timeout /t 3 >nul
exit /b 0

:nopython
if /i "%MODE%"=="run" exit /b 1
echo.
echo [!] Python is not installed.
echo     1. Install from https://www.python.org/downloads/
echo     2. On the first screen check "Add python.exe to PATH"
echo     3. Run this file again
start "" "https://www.python.org/downloads/"
pause
exit /b 1

:nodownload
if /i "%MODE%"=="run" exit /b 1
echo [!] Download failed. Check the internet connection and run again.
pause
exit /b 1
