@echo off
echo Starting PlasticDB servers...
start "Backend" cmd /k "cd /d D:\plasticdatabase\backend && node server.js"
timeout /t 3 /nobreak >nul
start "Frontend" cmd /k "cd /d D:\plasticdatabase\frontend && npm run dev"
echo Waiting for frontend to start...
timeout /t 15 /nobreak >nul
start "" "http://localhost:5173"
