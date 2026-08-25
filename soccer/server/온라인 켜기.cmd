@echo off
chcp 65001 > nul
title 반대항축구 온라인
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-online.ps1"
echo.
echo 창을 닫으면 접속이 끊깁니다.
pause
