"""REST surface for claim verification, so non-MCP clients (scripts, other
local apps) can use Agora's grounded fact-checking."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.services import verify_service
from engine.search import search_web

router = APIRouter(prefix="/api/verify", tags=["verify"])


class VerifyRequest(BaseModel):
    claims: list[str] = Field(..., min_length=1, max_length=40)
    model: str | None = None  # judge model override (e.g. "ollama/qwen2.5:32b")


@router.post("/claims")
def verify_claims(req: VerifyRequest, db: Session = Depends(get_db)):
    try:
        return verify_service.verify_claims(db, req.claims, req.model)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"verification failed: {e}")


@router.get("/search")
def web_search(q: str, max_results: int = 5):
    """Raw free web search (DuckDuckGo) — evidence gathering for any client."""
    return {"query": q, "results": search_web(q, max_results=max_results)}
