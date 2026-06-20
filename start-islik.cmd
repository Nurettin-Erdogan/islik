@echo off
cd /d "%~dp0"
set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=node"
start "Islik Server" /min cmd /k ""%NODE_EXE%" server.mjs"
timeout /t 1 /nobreak >nul
start "" "http://127.0.0.1:4173"
