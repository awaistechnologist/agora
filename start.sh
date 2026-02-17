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

# Build frontend if dist is missing
if [ ! -d "frontend/dist" ]; then
    echo "📦 Building frontend..."
    cd frontend && npm run build && cd ..
fi

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
