@echo off
chcp 65001 > nul
cd /d "%~dp0"
rem 백그라운드 서버(시작프로그램 등록)가 이미 떠 있으면 브라우저만 엽니다.
netstat -ano | findstr /r /c:":8000 .*LISTENING" > nul
if %errorlevel%==0 (
  start "" http://localhost:8000
  exit /b
)
echo AI Agent Lab 서버를 시작합니다: http://localhost:8000
echo 종료하려면 이 창에서 Ctrl+C 를 누르세요.
start "" http://localhost:8000
python -m http.server 8000 --bind 127.0.0.1
