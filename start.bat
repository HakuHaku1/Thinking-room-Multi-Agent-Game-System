@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title The Thinking Room setup

echo.
echo  THE THINKING ROOM - Windows setup
echo  ---------------------------------
echo.

where node >nul 2>&1
if errorlevel 1 goto NODE_MISSING
node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major > 20 || (major === 20 && minor >= 9) ? 0 : 1)"
if errorlevel 1 goto NODE_TOO_OLD
where npm >nul 2>&1
if errorlevel 1 goto NPM_MISSING

if not exist ".env.local" (
    if exist ".env.example" (
        copy ".env.example" ".env.local" >nul
        echo Created .env.local from .env.example.
    )
)

set "OLLAMA_MODEL=llama3.2:3b"
if exist ".env.local" (
    for /f "tokens=1,* delims==" %%A in ('findstr /B /C:"OLLAMA_MODEL=" ".env.local" 2^>nul') do set "OLLAMA_MODEL=%%B"
)
if not defined OLLAMA_MODEL set "OLLAMA_MODEL=llama3.2:3b"

call :FIND_OLLAMA
if not defined OLLAMA_EXE (
    where winget >nul 2>&1
    if errorlevel 1 goto OLLAMA_MISSING
    echo Ollama is not installed.
    choice /M "Install Ollama now with Windows Package Manager"
    if errorlevel 2 goto OLLAMA_MISSING
    winget install --id Ollama.Ollama --exact --accept-source-agreements --accept-package-agreements
    if errorlevel 1 goto OLLAMA_INSTALL_FAILED
    call :FIND_OLLAMA
)
if not defined OLLAMA_EXE goto OLLAMA_MISSING

powershell -NoProfile -Command "try { $null = Invoke-RestMethod 'http://localhost:11434/api/tags' -TimeoutSec 2; exit 0 } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
    echo Starting the local Ollama service...
    start "Ollama local service" /min "%OLLAMA_EXE%" serve
)

set /a WAIT_COUNT=0
:WAIT_FOR_OLLAMA
powershell -NoProfile -Command "try { $null = Invoke-RestMethod 'http://localhost:11434/api/tags' -TimeoutSec 2; exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 goto OLLAMA_READY
set /a WAIT_COUNT+=1
if %WAIT_COUNT% GEQ 20 goto OLLAMA_START_FAILED
timeout /t 2 /nobreak >nul
goto WAIT_FOR_OLLAMA

:OLLAMA_READY
"%OLLAMA_EXE%" list 2>nul | findstr /I /B /C:"%OLLAMA_MODEL%" >nul
if not errorlevel 1 goto MODEL_READY
echo.
echo Downloading model %OLLAMA_MODEL% (first download is about 2 GB)...
"%OLLAMA_EXE%" pull "%OLLAMA_MODEL%"
if errorlevel 1 goto MODEL_PULL_FAILED

:MODEL_READY
if not exist "node_modules\next" (
    echo.
    echo Installing application packages...
    call npm install
    if errorlevel 1 goto NPM_INSTALL_FAILED
)

echo.
echo Ollama and the game are ready.
echo When Next.js says it is ready, open the Local URL it prints (normally http://localhost:3000)
echo Keep this window open while you play.
echo.
call npm run dev
goto END

:FIND_OLLAMA
set "OLLAMA_EXE="
for /f "delims=" %%I in ('where ollama 2^>nul') do if not defined OLLAMA_EXE set "OLLAMA_EXE=%%I"
if not defined OLLAMA_EXE if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" set "OLLAMA_EXE=%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
exit /b 0

:NODE_MISSING
echo Node.js is required. Install Node.js 20.9 or newer, then run start.bat again.
goto FAILED

:NPM_MISSING
echo npm was not found. Reinstall Node.js with npm included, then run start.bat again.
goto FAILED

:NODE_TOO_OLD
echo Your Node.js version is too old. Install Node.js 20.9 or newer, then run start.bat again.
goto FAILED

:OLLAMA_MISSING
echo Ollama is required for the multi-agent opponent.
echo Install it from https://ollama.com/download/windows, then run start.bat again.
goto FAILED

:OLLAMA_INSTALL_FAILED
echo Ollama installation did not complete. Install it from https://ollama.com/download/windows.
goto FAILED

:OLLAMA_START_FAILED
echo Could not start Ollama. Open the Ollama app and run start.bat again.
goto FAILED

:MODEL_PULL_FAILED
echo Could not download %OLLAMA_MODEL%. Check your internet connection and run start.bat again.
goto FAILED

:NPM_INSTALL_FAILED
echo npm install failed. Check your internet connection, then run start.bat again.
goto FAILED

:FAILED
echo.
pause
exit /b 1

:END
endlocal