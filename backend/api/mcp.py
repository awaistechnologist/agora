"""
MCP integration API — /api/mcp

Lets the user wire Agora's stdio MCP server into supported MCP clients
(Claude Desktop, Cursor, Windsurf, Gemini CLI, …) directly from the web UI,
instead of editing JSON config files by hand.

The MCP server itself is launched by the client process (not by Agora) — so
"install" here just means writing the agora entry into the client's config
file. "uninstall" removes it. We never run the MCP script from the backend.

Safety:
- We only mutate `mcpServers.agora` — never touch other entries.
- We refuse to overwrite a file that already contains invalid JSON.
- Each write makes a `.agora.bak` backup of the previous file.
- Writes are atomic (write to tmp + rename).
"""

import os
import json
import shutil
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/mcp", tags=["mcp"])


# ── Paths ─────────────────────────────────────────────────────────────────────
# This file lives at backend/api/mcp.py — repo root is three dirs up.
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PYTHON_PATH = os.path.join(REPO_ROOT, "venv", "bin", "python")
SERVER_PATH = os.path.join(REPO_ROOT, "mcp_server", "server.py")


# ── Known clients ────────────────────────────────────────────────────────────
# Paths use ~ which we expand at read time. `extras` is merged into the
# `mcpServers.agora` entry on install — Claude Code expects `type` and `env`
# fields alongside `command`/`args`; the others are happy without.
CLIENTS = [
    {"key": "claude_code",     "label": "Claude Code",     "raw_path": "~/.claude.json",
     "extras": {"type": "stdio", "env": {}}},
    {"key": "claude_desktop",  "label": "Claude Desktop",  "raw_path": "~/Library/Application Support/Claude/claude_desktop_config.json"},
    {"key": "cursor",          "label": "Cursor",          "raw_path": "~/.cursor/mcp.json"},
    {"key": "windsurf",        "label": "Windsurf",        "raw_path": "~/.windsurf/mcp.json"},
    {"key": "gemini_cli",      "label": "Google Gemini CLI", "raw_path": "~/.gemini/settings.json"},
    {"key": "antigravity",     "label": "Google Antigravity", "raw_path": "~/.gemini/antigravity/mcp_config.json"},
]


def _client_by_key(key: str) -> dict | None:
    for c in CLIENTS:
        if c["key"] == key:
            return c
    return None


def _expand(raw_path: str) -> str:
    return os.path.expanduser(raw_path)


# ── Config IO ────────────────────────────────────────────────────────────────
# Sentinel returned when an existing config file is present but unparseable.
_INVALID = object()


def _read_config(path: str):
    """Return parsed JSON, None if the file does not exist, or _INVALID if it
    exists but is not valid JSON."""
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return _INVALID


def _is_agora_configured(cfg) -> bool:
    """True iff the config has an `mcpServers.agora` entry pointing at this
    repo's venv python and server.py."""
    if cfg is None or cfg is _INVALID:
        return False
    servers = cfg.get("mcpServers") or {}
    agora = servers.get("agora")
    if not isinstance(agora, dict):
        return False
    args = agora.get("args") or []
    return agora.get("command") == PYTHON_PATH and SERVER_PATH in args


def _atomic_write(path: str, data: dict) -> None:
    """Backup the existing file, then write the new content via tmp + rename."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if os.path.exists(path):
        shutil.copy2(path, path + ".agora.bak")
    tmp = path + ".agora.tmp"
    with open(tmp, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    os.replace(tmp, path)


def _mcp_package_installed() -> bool:
    try:
        import mcp.server.fastmcp  # noqa: F401
        return True
    except ImportError:
        return False


def _client_status(client: dict) -> dict:
    path = _expand(client["raw_path"])
    cfg = _read_config(path)
    return {
        "key": client["key"],
        "label": client["label"],
        "path": path,
        "config_present": cfg is not None,
        "valid_json": cfg is not _INVALID,
        "configured": _is_agora_configured(cfg),
    }


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/status")
def status():
    """Return everything the UI needs to render the MCP section."""
    return {
        "python_path": PYTHON_PATH,
        "server_path": SERVER_PATH,
        "python_exists": os.path.exists(PYTHON_PATH),
        "server_exists": os.path.exists(SERVER_PATH),
        "mcp_package_installed": _mcp_package_installed(),
        "snippet": {
            "mcpServers": {
                "agora": {"command": PYTHON_PATH, "args": [SERVER_PATH]}
            }
        },
        "clients": [_client_status(c) for c in CLIENTS],
    }


class ClientBody(BaseModel):
    client: str


@router.post("/install")
def install(body: ClientBody):
    client = _client_by_key(body.client)
    if not client:
        raise HTTPException(status_code=404, detail="Unknown MCP client.")
    if not os.path.exists(SERVER_PATH):
        raise HTTPException(status_code=500, detail=f"MCP server script missing at {SERVER_PATH}.")
    if not os.path.exists(PYTHON_PATH):
        raise HTTPException(status_code=500, detail=f"venv Python missing at {PYTHON_PATH}. Run ./install.sh.")

    path = _expand(client["raw_path"])
    cfg = _read_config(path)
    if cfg is _INVALID:
        raise HTTPException(
            status_code=400,
            detail=f"The existing config at {path} is not valid JSON. Please fix it (or move it aside) and try again.",
        )
    if cfg is None:
        cfg = {}
    if not isinstance(cfg, dict):
        raise HTTPException(status_code=400, detail=f"Config at {path} is not a JSON object — refusing to overwrite.")

    servers = cfg.get("mcpServers")
    if not isinstance(servers, dict):
        servers = {}
        cfg["mcpServers"] = servers
    entry = {"command": PYTHON_PATH, "args": [SERVER_PATH]}
    extras = client.get("extras") or {}
    entry.update(extras)
    servers["agora"] = entry

    _atomic_write(path, cfg)
    return {"ok": True, "client": _client_status(client)}


@router.post("/uninstall")
def uninstall(body: ClientBody):
    client = _client_by_key(body.client)
    if not client:
        raise HTTPException(status_code=404, detail="Unknown MCP client.")

    path = _expand(client["raw_path"])
    cfg = _read_config(path)
    if cfg is _INVALID:
        raise HTTPException(
            status_code=400,
            detail=f"The existing config at {path} is not valid JSON.",
        )
    if cfg is None or not isinstance(cfg, dict):
        return {"ok": True, "client": _client_status(client)}

    servers = cfg.get("mcpServers")
    if isinstance(servers, dict) and "agora" in servers:
        del servers["agora"]
        if not servers:
            # leave an empty mcpServers key out — keeps the user's file tidy
            del cfg["mcpServers"]
        _atomic_write(path, cfg)

    return {"ok": True, "client": _client_status(client)}
