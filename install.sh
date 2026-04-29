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

# jq (used by setup-mcp.sh for automatic MCP client configuration)
if ! command -v jq >/dev/null 2>&1; then
    echo "📦 Installing jq..."
    if command -v brew >/dev/null 2>&1; then
        brew install jq --quiet
    elif command -v apt-get >/dev/null 2>&1; then
        sudo apt-get install -y -q jq
    else
        echo "⚠️  Could not install jq automatically. Install it manually (brew install jq) for automatic MCP setup."
    fi
else
    echo "✅ jq already installed."
fi

# ── Ollama (optional — for free local models) ─────────────────────────────
echo ""
if command -v ollama >/dev/null 2>&1; then
    echo "✅ Ollama detected ($(ollama --version 2>&1 | head -1))."
else
    echo "🤖 Ollama is not installed. It lets Agora run councils on your own"
    echo "   machine — free, private, offline. You can mix Ollama models with"
    echo "   OpenRouter ones per-councillor."
    read -p "   Install Ollama now? (y/N): " OLLAMA_ANS
    if [[ "$OLLAMA_ANS" =~ ^[Yy]$ ]]; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            if command -v brew >/dev/null 2>&1; then
                echo "📦 Installing Ollama via Homebrew (cask) ..."
                brew install --cask ollama || brew install ollama
                echo "✅ Ollama installed. Open the Ollama.app once to start it,"
                echo "   or run:  ollama serve"
            else
                echo "❌ Homebrew not found. Download Ollama manually from:"
                echo "   https://ollama.com/download"
            fi
        elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
            echo "📦 Ollama's official install command is:"
            echo "     curl -fsSL https://ollama.com/install.sh | sh"
            read -p "   Run it now? (y/N): " CONFIRM
            if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
                curl -fsSL https://ollama.com/install.sh | sh
                echo "✅ Ollama installed. To start it manually:  ollama serve"
            else
                echo "   Skipped. Install later from https://ollama.com/download"
            fi
        else
            echo "❓ Unknown OS ($OSTYPE). Install manually from https://ollama.com/download"
        fi
    else
        echo "   Skipped. You can install Ollama later from https://ollama.com/download"
        echo "   (Agora's Settings page will detect it automatically once it's running.)"
    fi
fi

echo ""
echo "🎉 All done! Run ./start.sh to launch Agora."
echo "   Then run ./setup-mcp.sh to connect your AI apps."
