#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

echo "🏛️  Agora — Install"
echo "==================="
echo ""

# Python venv
if [ ! -d "venv" ]; then
    echo "📦 Creating Python virtual environment..."
    python3 -m venv venv
else
    echo "✅ Virtual environment already exists."
fi

echo "📦 Installing Python dependencies..."
source venv/bin/activate
pip install -q --upgrade pip
pip install -q -r requirements.txt
echo "✅ Python dependencies installed."

# Frontend
echo "📦 Installing frontend dependencies..."
cd frontend
npm install --silent
echo "📦 Building frontend..."
npm run build
cd ..
echo "✅ Frontend built."

echo ""
echo "🎉 All done! Run ./start.sh to launch Agora."
