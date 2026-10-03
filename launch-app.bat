@echo off
echo Starting The Thinking Room...
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo Failed to install dependencies.
        pause
        exit /b 1
    )
)

REM Start the development server in background
echo Starting development server...
start /B npm run dev

REM Wait a moment for the server to start
timeout /t 3 /nobreak >nul

REM Open the browser
echo Opening browser...
start http://localhost:3000

echo.
echo The Thinking Room is running at http://localhost:3000
echo Press Ctrl+C in this window to stop the server.
echo.

REM Keep the window open
npm run dev
