@echo off
chcp 65001 >nul
cd /d "%~dp0"
set GOT_PORT=8090
"%~dp0runtime\node.exe" tools/start-local.mjs
if errorlevel 1 pause
exit /b
