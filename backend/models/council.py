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
    model_override: Optional[str] = None
    sort_order: int = 0


class CouncillorCreate(CouncillorBase):
    pass


class CouncillorResponse(CouncillorBase):
    id: str
    council_id: str
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class CouncilBase(BaseModel):
    name: str = Field(..., max_length=60)
    description: str = Field(..., max_length=300)
    icon: str = Field(default="users")
    coordinator_instructions: Optional[str] = None


class CouncilCreate(CouncilBase):
    councillors: list[CouncillorCreate] = Field(..., min_length=2, max_length=10)


class CouncilUpdate(CouncilBase):
    councillors: list[CouncillorCreate] = Field(..., min_length=2, max_length=10)


class CouncilResponse(CouncilBase):
    id: str
    is_default: bool
    is_active: bool
    source_council_id: Optional[str] = None
    hocon_file_path: Optional[str] = None
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
