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

python run.py
