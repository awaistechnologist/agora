"""Pydantic schemas for settings."""

from pydantic import BaseModel
from typing import Optional


class SettingsResponse(BaseModel):
    openrouter_key_set: bool = False
    openrouter_key_preview: str = ""  # last 4 chars only
    # Three named default-model slots. "Balanced" is the everyday default;
    # councils and councillors can opt into Fast or Powerful per role.
    default_model_fast: str = "openai/gpt-4o"
    default_model_balanced: str = "openai/gpt-4o"
    default_model_powerful: str = "openai/gpt-4o"
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class SettingsUpdate(BaseModel):
    openrouter_key: Optional[str] = None
    default_model_fast: Optional[str] = None
    default_model_balanced: Optional[str] = None
    default_model_powerful: Optional[str] = None


class UsageStats(BaseModel):
    total_spend: float = 0.0
    total_deliberations: int = 0
    average_cost: float = 0.0
    most_expensive: Optional[float] = None
    cheapest: Optional[float] = None
    recent_deliberations: list = []
