#!/bin/bash
# Launch backend and frontend together.
# Press Ctrl+C to stop both.

cd "$(dirname "$0")"

cleanup() {
  echo ""
  echo "Stopping servers..."
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
  wait $BACKEND_PID $FRONTEND_PID 2>/dev/null
  echo "Done."
}
trap cleanup EXIT INT TERM

# Backend
echo "Starting backend on :8000..."
cd backend
uv run uvicorn src.server:app --port 8000 --reload &
BACKEND_PID=$!
cd ..

# Frontend
echo "Starting frontend on :5173..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "  Backend:  http://localhost:8000"
echo "  Frontend: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop both."

wait
