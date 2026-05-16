"""Pydantic schemas for councils and councillors."""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class CouncillorBase(BaseModel):
    name: str = Field(..., max_length=100)
    role_description: str
    expertise_area: Optional[str] = None
    perspective: str = Field(default="neutral")
    instructions: Optional[str] = None
    # 'fast' | 'balanced' | 'powerful'. None = balanced.
    model_tier: Optional[str] = None
    model_override: Optional[str] = None
    sort_order: int = 0


class CouncillorCreate(CouncillorBase):
    pass


class CouncillorUpdate(CouncillorBase):
    id: Optional[str] = None


class CouncillorResponse(CouncillorBase):
    id: str
    council_id: str
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class CouncilBase(BaseModel):
    name: str = Field(..., max_length=60)
    description: str = Field(..., max_length=300)
    hocon_file_path: Optional[str] = None
    coordinator_instructions: Optional[str] = None
    web_search_enabled: bool = False
    web_search_provider: str = "openrouter"
    pre_check_enabled: bool = True
    # Coordinator tier: 'fast' | 'balanced' | 'powerful'. None = balanced.
    coordinator_model_tier: Optional[str] = None


class CouncilCreate(CouncilBase):
    # Pydantic strips undeclared fields, so councillors + icon must be on the
    # schema for POST /api/councils to actually receive them.
    icon: Optional[str] = "users"
    councillors: Optional[list[CouncillorCreate]] = None


class CouncilUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    is_active: Optional[bool] = None
    coordinator_instructions: Optional[str] = None
    web_search_enabled: Optional[bool] = None
    web_search_provider: Optional[str] = None
    pre_check_enabled: Optional[bool] = None
    coordinator_model_tier: Optional[str] = None
    councillors: Optional[list[CouncillorUpdate]] = None


class CouncilResponse(CouncilBase):
    id: str
    is_default: bool
    is_active: bool
    source_council_id: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    councillors: list[CouncillorResponse] = []

    class Config:
        from_attributes = True


class CouncilListItem(CouncilBase):
    id: str
    is_default: bool
    is_active: bool
    councillor_count: int = 0
    model_info: Optional[str] = None

    class Config:
        from_attributes = True
