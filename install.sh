#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

echo "🏛️  Agora — Install"
echo "==================="
echo ""

# Python Detection & Venv Creation
echo "🔍 Checking for Python 3.12+ ..."

PYTHON_CMD=""

# Helper function to check version
check_version() {
    $1 -c "import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)" 2>/dev/null
}

if command -v python3.13 >/dev/null 2>&1; then
    PYTHON_CMD="python3.13"
elif command -v python3.12 >/dev/null 2>&1; then
    PYTHON_CMD="python3.12"
elif command -v python3 >/dev/null 2>&1 && check_version python3; then
    PYTHON_CMD="python3"
elif command -v python >/dev/null 2>&1 && check_version python; then
    PYTHON_CMD="python"
fi

if [ -z "$PYTHON_CMD" ]; then
    echo "❌ Error: Python 3.12 or newer is required."
    echo "   Please install python3.12 or python3.13."
    echo "   On Ubuntu: sudo apt install python3.12 python3.12-venv"
    exit 1
fi

echo "✅ Found compatible Python: $($PYTHON_CMD --version)"

if [ ! -d "venv" ]; then
    echo "📦 Creating Python virtual environment using $PYTHON_CMD..."
    $PYTHON_CMD -m venv venv
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
