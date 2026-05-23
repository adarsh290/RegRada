@echo off
echo ==================================================
echo           Starting RegRadar Services
echo ==================================================
echo.

echo [1/5] Seeding default users to MongoDB (will skip if already seeded)...
cd backend
call npm run seed
cd ..

echo [2/5] Starting Ollama (llama3.1)...
start /B "" ollama run llama3.1

echo [3/5] Starting Node Backend...
start /B "" cmd /c "cd backend && npm run dev"

echo [4/5] Starting Python AI Service...
start /B "" cmd /c "cd ai_service && uvicorn main:app --reload --port 8000"

echo [5/5] Starting React Frontend...
start /B "" cmd /c "cd frontend && npm run dev"

echo.
echo All services are running in THIS window! Press CTRL+C to stop all.
echo - Backend running on http://localhost:5000
echo - AI Service running on http://localhost:8000
echo - Frontend running on http://localhost:5173
echo.
pause
