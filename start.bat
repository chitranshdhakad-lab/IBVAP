@echo off
echo ===================================================
echo Starting IBVAP Surveillance Platform
echo ===================================================

echo [1/2] Launching FastAPI Backend on http://localhost:8000...
start cmd /k "cd backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"

echo [2/2] Launching Vite React Dashboard on http://localhost:5173...
start cmd /k "npm.cmd run dev"

echo System launched! Open http://localhost:5173 in your browser.
pause
