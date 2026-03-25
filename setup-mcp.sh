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

# ── Build the agora JSON entry ─────────────────────────────────────────────
AGORA_ENTRY="{\"command\": \"$PYTHON\", \"args\": [\"$SERVER\"]}"

# ── Known MCP client configs ───────────────────────────────────────────────
# Format: "Label|config_path"
CLIENTS=(
    "Google Antigravity|$HOME/.gemini/antigravity/mcp_config.json"
    "Google Gemini CLI|$HOME/.gemini/settings.json"
    "Claude Desktop|$HOME/.claude/claude_desktop_config.json"
    "Cursor|$HOME/.cursor/mcp.json"
    "Windsurf|$HOME/.windsurf/mcp.json"
)

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Choose which apps to configure:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if command -v jq >/dev/null 2>&1; then
    # Interactive mode with jq available — write directly
    for CLIENT in "${CLIENTS[@]}"; do
        LABEL="${CLIENT%%|*}"
        CFG_PATH="${CLIENT##*|}"

        read -p "   Configure $LABEL? (y/N): " ANSWER
        if [[ "$ANSWER" =~ ^[Yy]$ ]]; then
            mkdir -p "$(dirname "$CFG_PATH")"
            if [ -f "$CFG_PATH" ]; then
                # Merge agora into existing config
                jq --argjson entry "$AGORA_ENTRY" \
                    '.mcpServers.agora = $entry' \
                    "$CFG_PATH" > "${CFG_PATH}.tmp" && mv "${CFG_PATH}.tmp" "$CFG_PATH"
            else
                # Create fresh config
                echo "{\"mcpServers\": {\"agora\": $AGORA_ENTRY}}" | jq . > "$CFG_PATH"
            fi
            echo "   ✅ Written to $CFG_PATH — restart $LABEL to activate."
        fi
        echo ""
    done

else
    # No jq — print snippet for manual paste
    echo "  Paste this into each app's MCP config:"
    echo ""
    cat <<EOF
{
  "mcpServers": {
    "agora": {
      "command": "$PYTHON",
      "args": ["$SERVER"]
    }
  }
}
EOF
    echo ""
    echo "  Config file locations:"
    for CLIENT in "${CLIENTS[@]}"; do
        LABEL="${CLIENT%%|*}"
        CFG_PATH="${CLIENT##*|}"
        echo "    $LABEL:  $CFG_PATH"
    done
    echo ""
    echo "  (Install jq for automatic configuration: brew install jq)"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💡 Make sure your OpenRouter API key is set first:"
echo "   ./start.sh  →  Settings  →  Add your OpenRouter key"
echo ""
