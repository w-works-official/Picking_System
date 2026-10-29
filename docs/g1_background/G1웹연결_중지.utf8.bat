@echo off
chcp 949 >nul
title G1 웹연결 - 중지
rem 감시 루프(VBS)와 g1_v3_link.py 를 함께 멈춘다. /quiet 이면 pause 없이
set "FLAG=%TEMP%\G1_weblink_stop.flag"
set "PIDF=%APPDATA%\G1CS\v3link.pid"
echo stop> "%FLAG%"
set "PID="
if exist "%PIDF%" set /p PID=<"%PIDF%"
if not defined PID goto done
rem 대기 중이면 1~2초 안에 스스로 끝남. 요청 실행 중이면 최대 20초 기다린 뒤 강제 종료
for /L %%i in (1,1,20) do (
  tasklist /FI "PID eq %PID%" 2>nul | find "%PID%" >nul || goto done
  timeout /t 1 /nobreak >nul
)
taskkill /PID %PID% /F >nul 2>nul
:done
if /i not "%~1"=="/quiet" (
  echo [중지] G1 웹연결을 멈췄습니다. 다시 켜기: G1웹연결_백그라운드_등록.bat  또는 트레이 아이콘 - G1 웹연결 시작
  echo        다음 로그인 때는 다시 자동으로 켜집니다 (자동시작 해제는 등록 bat 안내 참고)
  timeout /t 8
)
