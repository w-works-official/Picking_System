@echo off
chcp 65001 >nul
title G1 - System V3 web link
pushd "%~dp0"
python g1_v3_link.py
if errorlevel 1 (
  echo.
  echo [오류] 연결 프로그램이 실행되지 않았습니다. 위 메시지를 복사해서 알려주세요.
)
pause
