#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

# Check venv exists
if [ ! -d "venv" ]; then
    echo "❌ Virtual environment not found. Run ./install.sh first."
    exit 1
fi

# Activate and run
source venv/bin/activate

# Check python version inside venv
python3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "❌ Error: The virtual environment's Python version is too old (< 3.12)."
    echo "   Please remove the 'venv' directory and run ./install.sh again."
    exit 1
fi

# Always rebuild frontend to pick up any code changes
echo "📦 Building frontend..."
cd frontend && npm run build --silent && cd ..
echo "✅ Frontend built."


echo ""
echo "    ╔═══════════════════════════════════════╗"
echo "    ║          🏛️  A G O R A               ║"
echo "    ║     Many voices. Better decisions.    ║"
echo "    ╚═══════════════════════════════════════╝"
echo ""

# Check if port 8080 is busy and clear it
if lsof -Pi :8080 -sTCP:LISTEN -t >/dev/null ; then
    echo "⚠️  Port 8080 is currently in use. Stopping existing process to free up path for Agora..."
    lsof -ti:8080 | xargs kill -9
    sleep 1
    echo "✅ Port 8080 freed."
fi

python run.py
