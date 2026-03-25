#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

echo ""
echo "    ╔═══════════════════════════════════════╗"
echo "    ║       🏛️  A G O R A  M C P           ║"
echo "    ║     Many voices. Better decisions.    ║"
echo "    ╚═══════════════════════════════════════╝"
echo ""

# ── Check venv exists ──────────────────────────────────────────────────────
if [ ! -d "venv" ]; then
    echo "❌ Virtual environment not found. Run ./install.sh first."
    exit 1
fi

PYTHON="$(pwd)/venv/bin/python"
SERVER="$(pwd)/mcp_server/server.py"

# ── Verify mcp package is available ───────────────────────────────────────
if ! "$PYTHON" -c "from mcp.server.fastmcp import FastMCP" 2>/dev/null; then
    echo "📦 Installing mcp package..."
    "$PYTHON" -m pip install -q "mcp>=1.0.0"
fi

echo "✅ MCP server is ready."
echo ""

# ── Build JSON config block ────────────────────────────────────────────────
CONFIG=$(cat <<EOF
{
  "mcpServers": {
    "agora": {
      "command": "$PYTHON",
      "args": ["$SERVER"]
    }
  }
}
EOF
)

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Add the following to your MCP client config:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "$CONFIG"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── Claude Desktop: offer to write config automatically ───────────────────
CLAUDE_CONFIG="$HOME/.claude/claude_desktop_config.json"

if command -v jq >/dev/null 2>&1; then
    # jq available — we can safely merge configs
    echo "🤖 Claude Desktop detected."
    echo ""
    read -p "   Auto-configure Claude Desktop? (y/N): " ANSWER
    if [[ "$ANSWER" =~ ^[Yy]$ ]]; then
        mkdir -p "$(dirname "$CLAUDE_CONFIG")"
        if [ -f "$CLAUDE_CONFIG" ]; then
            # Merge into existing config
            EXISTING=$(cat "$CLAUDE_CONFIG")
            echo "$EXISTING" | jq --arg py "$PYTHON" --arg srv "$SERVER" \
                '.mcpServers.agora = {"command": $py, "args": [$srv]}' \
                > "$CLAUDE_CONFIG"
        else
            # Create fresh config
            echo "$CONFIG" > "$CLAUDE_CONFIG"
        fi
        echo "   ✅ Written to $CLAUDE_CONFIG"
        echo "   Restart Claude Desktop to activate Agora tools."
    fi
else
    # No jq — just tell the user where to paste
    echo "📋 Claude Desktop config location:"
    echo "   $CLAUDE_CONFIG"
    echo ""
    echo "   Paste the config above into that file, then restart Claude Desktop."
fi

echo ""
echo "📖 Cursor / Windsurf: paste the config into .cursor/mcp.json or .windsurf/mcp.json"
echo ""
echo "💡 Make sure to configure your OpenRouter API key in the Agora web UI first:"
echo "   ./start.sh  →  Settings  →  Add your OpenRouter key"
echo ""
