"""Pydantic schemas for sessions and responses."""

from pydantic import BaseModel, Field
from typing import Optional, Dict


class SubmitRequest(BaseModel):
    council_id: str
    statement: str = Field(..., min_length=1)
    bypass_pre_check: bool = False
    # Single model override — maps all tiers to one model id (legacy/Ollama).
    model_override: Optional[str] = None
    # Per-tier model overrides — {fast: id, balanced: id, powerful: id}.
    # Takes precedence over model_override when set. Used by Auto-pick for
    # OpenRouter deliberations so different councillor tiers use different LLMs.
    model_overrides: Optional[Dict[str, str]] = None
    # When True, forces web search ON for this deliberation regardless of the
    # council's saved setting. Used by Auto-pick when the architect detects a
    # time-sensitive statement but routes to an existing council that has
    # web search disabled. Always uses the "local" (DuckDuckGo) provider so
    # this works with Ollama models too.
    force_web_search: bool = False


class ResponseSchema(BaseModel):
    id: str
    councillor_id: str
    councillor_name: str = ""
    councillor_role: str = ""
    response_text: Optional[str] = None
    stance: Optional[str] = None
    model_used: Optional[str] = None
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    cost_usd: float = 0.0
    sort_order: int = 0

    class Config:
        from_attributes = True


class SessionResponse(BaseModel):
    id: str
    council_id: str
    council_name: str = ""
    statement: str
    verdict: Optional[str] = None
    confidence: Optional[str] = None
    status: str = "pending"
    total_cost_usd: float = 0.0
    total_tokens: int = 0
    duration_seconds: Optional[float] = None
    model_summary: Optional[str] = None
    created_at: Optional[str] = None
    completed_at: Optional[str] = None
    responses: list[ResponseSchema] = []

    class Config:
        from_attributes = True


class SessionListItem(BaseModel):
    id: str
    council_id: str
    council_name: str = ""
    statement: str
    status: str
    total_cost_usd: float = 0.0
    total_tokens: int = 0
    created_at: Optional[str] = None

    class Config:
        from_attributes = True
