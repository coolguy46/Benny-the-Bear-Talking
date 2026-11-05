@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Install Node.js 22 or newer from https://nodejs.org then try again.
 pause
 exit /b 1
)
if exist "%~dp0.venv\Scripts\python.exe" set "BENNY_PYTHON=%~dp0.venv\Scripts\python.exe"
if exist "%~dp0models\vosk-model-small-en-us-0.15\am\final.mdl" set "BENNY_VOSK_MODEL=%~dp0models\vosk-model-small-en-us-0.15"
if exist "%~dp0models\en_US-lessac-medium.onnx" set "BENNY_PIPER_MODEL=%~dp0models\en_US-lessac-medium.onnx"
start "" "http://127.0.0.1:8787"
node server.mjs
pause
