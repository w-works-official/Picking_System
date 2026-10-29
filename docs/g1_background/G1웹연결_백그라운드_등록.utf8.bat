@echo off
chcp 949 >nul
title G1 웹연결 - 창 없이 자동시작 등록
cd /d "%~dp0"
set "DIR=%~dp0"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "VBS=%STARTUP%\G1웹연결_백그라운드.vbs"
rem 중지 표시 파일은 드라이브 동기화 폴더 밖(%TEMP%)에 둔다 (원격보드 러너와 같은 방식)
set "FLAG=%TEMP%\G1_weblink_stop.flag"
set "ERR=%APPDATA%\G1CS\v3link_err.txt"
set "CONF=%APPDATA%\G1CS\v3link.json"

if not exist "%DIR%g1_v3_link.py" ( echo [오류] g1_v3_link.py 가 없습니다: %DIR% & pause & exit /b 1 )
if not exist "%CONF%" (
  echo [먼저 할 일] 웹연결 처음 설정이 아직 없습니다.
  echo   ▶G1수집기_5_웹연결.bat 을 한 번 실행해 웹앱 주소와 COLLECTOR_TOKEN 을 넣은 뒤
  echo   이 파일을 다시 실행하세요.
  pause & exit /b 1
)

rem ── 실제 파이썬 위치 찾기 (원격보드 러너와 같은 방식 + 수집기 실행.bat 과 같은 후보) ──
set "PY_EXE="
for %%V in (314 313 312 311) do if not defined PY_EXE if exist "%LocalAppData%\Programs\Python\Python%%V\python.exe" set "PY_EXE=%LocalAppData%\Programs\Python\Python%%V\python.exe"
if not defined PY_EXE for /f "delims=" %%p in ('python -c "import sys;print(sys.executable)" 2^>nul') do set "PY_EXE=%%p"
if not defined PY_EXE ( echo [오류] python 을 찾을 수 없습니다. ▶G1수집기_1_설치 를 먼저 실행하세요. & pause & exit /b 1 )
for %%p in ("%PY_EXE%") do set "PY_DIR=%%~dpp"
set "PYW_EXE=%PY_DIR%pythonw.exe"
if not exist "%PYW_EXE%" ( echo [오류] %PY_DIR% 에 pythonw.exe 가 없습니다. & pause & exit /b 1 )
"%PY_EXE%" -c "import requests" 2>nul || (
  echo [설치] requests 패키지를 설치합니다...
  "%PY_EXE%" -m pip install --quiet requests
)

echo ============================================================
echo   G1 웹연결을 창 없이(백그라운드) 돌리고, Windows 로그인 때 자동 시작하도록 등록합니다
echo   도중에 멈추면 감시 루프가 30초 뒤 스스로 다시 띄웁니다
echo   상태 : 시계 옆 원격보드 러너 아이콘의 오른쪽 반쪽 색
echo   폴더 : %DIR%
echo   파이썬 : %PYW_EXE%
echo   등록 : %VBS%
echo ============================================================

rem 시작프로그램 VBS: 로그인 30초 후(인자 now 면 바로), 창 없이 pythonw g1_v3_link.py --bg 를 감시 루프로 실행
rem   끝나면(죽으면) 30초 뒤 다시. G1_weblink_stop.flag 가 있으면 루프 종료
rem   파이썬이 시작도 못 하고 죽는 경우를 볼 수 있게 오류 출력은 %APPDATA%\G1CS\v3link_err.txt 에 모은다
> "%VBS%" echo If WScript.Arguments.Count = 0 Then WScript.Sleep 30000
>>"%VBS%" echo Set sh = CreateObject("WScript.Shell")
>>"%VBS%" echo Set fso = CreateObject("Scripting.FileSystemObject")
>>"%VBS%" echo dir = "%DIR:~0,-1%"
>>"%VBS%" echo flag = sh.ExpandEnvironmentStrings("%%TEMP%%") ^& "\G1_weblink_stop.flag"
>>"%VBS%" echo sh.CurrentDirectory = dir
>>"%VBS%" echo sh.Environment("Process")("PYTHONUTF8") = "1"
>>"%VBS%" echo Do
>>"%VBS%" echo   If fso.FileExists(flag) Then Exit Do
>>"%VBS%" echo   sh.Run "cmd /c """"%PYW_EXE%"" g1_v3_link.py --bg 2>>""%ERR%""""", 0, True
>>"%VBS%" echo   If fso.FileExists(flag) Then Exit Do
>>"%VBS%" echo   WScript.Sleep 30000
>>"%VBS%" echo Loop
if not exist "%VBS%" ( echo [오류] 등록 파일을 만들지 못했습니다. & pause & exit /b 1 )
echo [완료] 자동시작 등록됨. 다음 로그인부터 창 없이 자동으로 돌아갑니다.
echo.

rem ── 이미 켜져 있으면 그대로 둔다 (요청 실행 중에 끊기지 않게) ──
set "OLDPID="
if exist "%APPDATA%\G1CS\v3link.pid" set /p OLDPID=<"%APPDATA%\G1CS\v3link.pid"
if not defined OLDPID goto do_start
tasklist /FI "PID eq %OLDPID%" 2>nul | find "%OLDPID%" >nul || goto do_start
if /i "%~1"=="/restart" goto do_start
echo [알림] G1 웹연결이 이미 켜져 있습니다 (PID %OLDPID%). 그대로 둡니다.
echo        검은 창(▶G1수집기_5_웹연결)으로 켜져 있다면 그 창을 닫으세요 - 30초 안에 창 없이 이어받습니다.
echo.
del /f /q "%FLAG%" >nul 2>nul
start "" wscript.exe "%VBS%" now
timeout /t 10
exit /b 0
:do_start

call "%DIR%G1웹연결_중지.bat" /quiet
timeout /t 2 /nobreak >nul
for /L %%i in (1,1,10) do (
  if exist "%FLAG%" del /f /q "%FLAG%" >nul 2>nul
  if not exist "%FLAG%" goto flag_ok
  timeout /t 1 /nobreak >nul
)
echo [오류] 중지 표시 파일을 지우지 못했습니다. 직접 지운 뒤 다시 실행하세요: %FLAG%
pause & exit /b 1
:flag_ok

start "" wscript.exe "%VBS%" now
timeout /t 8 /nobreak >nul
if exist "%APPDATA%\G1CS\v3link.pid" (
  set /p PID=<"%APPDATA%\G1CS\v3link.pid"
  echo [시작] G1 웹연결이 창 없이 실행 중입니다. 창은 뜨지 않습니다.
) else (
  echo [확인 필요] v3link.pid 가 생기지 않았습니다.
  if exist "%ERR%" (
    echo   파이썬 오류 출력 마지막 부분:
    powershell -NoProfile -Command "Get-Content -LiteralPath '%ERR%' -Tail 15"
  ) else (
    echo   오류 파일도 없습니다. ▶G1수집기_5_웹연결.bat 으로 직접 띄워 확인하세요.
  )
)
echo.
echo  상태 확인 : 시계 옆 원격보드 러너 아이콘 - 오른쪽 반쪽 (초록=대기, 파랑=요청 실행, 주황=시트 연결 안 됨, 회색=꺼짐)
echo  기록 보기 : 아이콘 오른쪽 클릭 - G1 웹연결 기록 보기   (%APPDATA%\G1CS\v3link_log.txt)
echo  중지 : 아이콘 오른쪽 클릭 - G1 웹연결 중지  /  G1웹연결_중지.bat
echo  자동시작 해제 : 아래 파일을 _to_delete 로 옮기면 됩니다
echo    %VBS%
echo.
pause
