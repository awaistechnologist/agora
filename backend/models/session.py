"""Pydantic schemas for sessions and responses."""

from pydantic import BaseModel, Field
from typing import Optional


class SubmitRequest(BaseModel):
    council_id: str
    statement: str = Field(..., min_length=1)
    bypass_pre_check: bool = False


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
