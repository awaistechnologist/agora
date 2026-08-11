"""
Agora MCP Server

Exposes Agora's council deliberation system as a local MCP server.
Uses stdio transport — compatible with Claude Desktop, Cursor, Windsurf, etc.

Tools:
  - list_councils         — list all active councils
  - get_council_details   — details + councillors for a given council
  - run_deliberation      — submit a statement, get a full verdict

Usage (Claude Desktop config):
  {
    "mcpServers": {
      "agora": {
        "command": "/path/to/agora/venv/bin/python",
        "args": ["/path/to/agora/mcp_server/server.py"]
      }
    }
  }
"""

import sys
import os
import logging

# ── path setup ────────────────────────────────────────────────────────────────
# Ensure the repo root is on sys.path so backend/engine imports work
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from dotenv import load_dotenv
load_dotenv(os.path.join(_REPO_ROOT, ".env"))

# ── silence noisy logs so they don't pollute stdio ────────────────────────────
logging.basicConfig(level=logging.WARNING)
logging.getLogger("agora").setLevel(logging.WARNING)
logging.getLogger("sqlalchemy").setLevel(logging.WARNING)

# ── imports ───────────────────────────────────────────────────────────────────
from mcp.server.fastmcp import FastMCP
from backend.database import get_db, SessionLocal
from backend.services import council_service, chamber_service, settings_service

mcp = FastMCP(
    name="agora",
    instructions=(
        "Agora is a multi-perspective AI council system. "
        "Use list_councils to see available councils, then run_deliberation to "
        "get structured multi-perspective analysis of any statement, idea, or question. "
        "Each council has specialist councillors that debate the topic, followed by a coordinator verdict."
    ),
)


# ── helpers ───────────────────────────────────────────────────────────────────

def _get_db():
    """Return a database session. Caller must close it."""
    return SessionLocal()


def _find_council(db, council_id_or_name: str):
    """Find a council by exact id, or by case-insensitive name match."""
    from backend.database import CouncilRow
    # try exact id first
    council = db.query(CouncilRow).filter(CouncilRow.id == council_id_or_name).first()
    if council:
        return council
    # then case-insensitive name
    councils = db.query(CouncilRow).filter(CouncilRow.is_active == True).all()
    q = council_id_or_name.lower()
    for c in councils:
        if c.name.lower() == q or q in c.name.lower():
            return c
    return None


# ── tools ─────────────────────────────────────────────────────────────────────

@mcp.tool()
def list_councils() -> list[dict]:
    """
    List all active Agora councils.

    Returns a list of councils with their id, name, description, and councillor count.
    Use the council id or name with run_deliberation or get_council_details.
    """
    db = _get_db()
    try:
        councils = council_service.list_councils(db)
        return [
            {
                "id": c["id"],
                "name": c["name"],
                "description": c["description"],
                "councillor_count": c.get("councillor_count", 0),
                "web_search_enabled": c.get("web_search_enabled", False),
            }
            for c in councils
            if c.get("is_active", True)
        ]
    finally:
        db.close()


@mcp.tool()
def get_council_details(council: str) -> dict:
    """
    Get full details for a specific council, including all councillors.

    Args:
        council: The council id (e.g. "default-idea-validator") or name (e.g. "Idea Validator").

    Returns a dict with council metadata and a list of councillors (name, role, expertise, perspective).
    """
    db = _get_db()
    try:
        row = _find_council(db, council)
        if not row:
            return {"error": f"No active council found matching '{council}'. Use list_councils to see available councils."}
        data = council_service.get_council(db, row.id)
        if not data:
            return {"error": "Council not found."}
        return {
            "id": data["id"],
            "name": data["name"],
            "description": data["description"],
            "web_search_enabled": data.get("web_search_enabled", False),
            "pre_check_enabled": data.get("pre_check_enabled", True),
            "councillors": [
                {
                    "name": c["name"],
                    "expertise_area": c.get("expertise_area", ""),
                    "perspective": c.get("perspective", "neutral"),
                    "role_description": c.get("role_description", ""),
                    "model_override": c.get("model_override"),
                }
                for c in data.get("councillors", [])
            ],
        }
    finally:
        db.close()


@mcp.tool()
def run_deliberation(
    statement: str,
    council: str = "default-general",
    bypass_pre_check: bool = False,
) -> dict:
    """
    Submit a statement to an Agora council for multi-perspective deliberation.

    The council's AI councillors each analyse the statement from their specialist
    perspective, then a coordinator synthesises a verdict.

    Args:
        statement:        The question, idea, decision, or topic to deliberate on.
                          Be as specific as possible for better results.
        council:          Council id or name. Defaults to the General Council.
                          Use list_councils to see all options.
        bypass_pre_check: Skip the pre-check that asks clarifying questions.
                          Set to True if you've already provided full context.

    Returns a dict with:
      - verdict:      The coordinator's final synthesis
      - confidence:   Low / Medium / High
      - responses:    List of individual councillor responses
      - total_cost_usd, total_tokens
      - error (if something went wrong)
    """
    db = _get_db()
    try:
        # Resolve council
        row = _find_council(db, council)
        if not row:
            return {
                "error": f"No active council found matching '{council}'. Use list_councils() to see available councils."
            }

        # Check API key is configured
        api_key = settings_service.get_api_key(db)
        if not api_key:
            return {
                "error": (
                    "No OpenRouter API key configured. "
                    "Please open the Agora web UI (http://localhost:8080) and add your key in Settings."
                )
            }

        # Run the deliberation (synchronous — blocks until complete)
        events = chamber_service.submit_statement(
            db,
            council_id=row.id,
            statement=statement,
            bypass_pre_check=bypass_pre_check,
        )

        # Parse events into a clean response
        verdict_text = None
        confidence = "medium"
        responses = []
        total_cost = 0.0
        total_tokens = 0
        pre_check = None
        errors = []

        for ev in events:
            t = ev.get("type")
            d = ev.get("data", {})

            if t == "councillor_response" and not d.get("error"):
                responses.append({
                    "councillor": d.get("councillor_name", ""),
                    "role": d.get("councillor_role", ""),
                    "response": d.get("response_text", ""),
                    "stance": d.get("stance", "neutral"),
                    "model": d.get("model_used", ""),
                    "cost_usd": d.get("cost_usd", 0),
                })
            elif t == "verdict":
                verdict_text = d.get("verdict_text", "")
                confidence = d.get("confidence", "medium")
                total_cost = d.get("total_cost_usd", 0)
                total_tokens = d.get("total_tokens", 0)
            elif t == "complete":
                total_cost = d.get("total_cost_usd", total_cost)
                total_tokens = d.get("total_tokens", total_tokens)
            elif t == "pre_check":
                pre_check = {
                    "needs_clarification": True,
                    "understood": d.get("understood", ""),
                    "questions": d.get("questions", []),
                    "tip": (
                        "Your statement needs more context. Re-run with additional details, "
                        "or set bypass_pre_check=True to proceed anyway."
                    ),
                }
            elif t == "error":
                errors.append(d.get("message", "Unknown error"))

        # Return pre-check result early if triggered
        if pre_check:
            return pre_check

        if errors and not verdict_text:
            return {"error": " | ".join(errors)}

        return {
            "council": row.name,
            "statement": statement,
            "verdict": verdict_text or "(no verdict generated)",
            "confidence": confidence,
            "councillor_count": len(responses),
            "responses": responses,
            "total_cost_usd": round(total_cost, 6),
            "total_tokens": total_tokens,
        }

    except Exception as e:
        return {"error": f"Deliberation failed: {str(e)}"}
    finally:
        db.close()


@mcp.tool()
def verify_claims(claims: list[str], model: str = "") -> dict:
    """
    Fact-check factual claims against fresh web evidence (free DuckDuckGo search).

    Each claim gets its own targeted search; a judge model then grades every claim
    strictly against the evidence found. Much lighter than run_deliberation — use
    this for "is this true?" checks, and a council for contested/nuanced questions.

    Args:
        claims: Plain-language factual statements to verify (max 40). Make each
                claim self-contained, e.g. "The Great Wall of China is visible
                from space with the naked eye".
        model:  Optional judge model override (e.g. "ollama/qwen2.5:32b" for
                fully-local). Defaults to the "fast" tier model from settings,
                falling back to a local Ollama model when no API key is set.

    Returns {"model": ..., "results": [{claim, verdict, note, sources}]}
    where verdict is "supported" | "contradicted" | "unverified".
    """
    from backend.services import verify_service

    db = _get_db()
    try:
        return verify_service.verify_claims(db, claims, model or None)
    except ValueError as e:
        return {"error": str(e)}
    except Exception as e:
        return {"error": f"Verification failed: {e}"}
    finally:
        db.close()


@mcp.tool()
def search_web(query: str, max_results: int = 5) -> dict:
    """
    Free web search (DuckDuckGo news + text, no API key) — the same search
    Agora councils use. Returns formatted markdown results with links.
    """
    from engine.search import search_web as _search

    try:
        return {"query": query, "results": _search(query, max_results=max_results)}
    except Exception as e:
        return {"error": f"Search failed: {e}"}


# ── entrypoint ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    mcp.run(transport="stdio")
