"""Pydantic schemas for OpenRouter models and pricing."""

from pydantic import BaseModel
from typing import Optional


class ModelPricing(BaseModel):
    prompt: str = "0"        # USD per token (string for precision)
    completion: str = "0"
    image: str = "0"
    request: str = "0"


class ModelInfo(BaseModel):
    id: str
    name: str = ""
    provider: str = ""
    context_length: int = 0
    pricing: ModelPricing = ModelPricing()
    supports_tools: bool = True
    is_free: bool = False

    # Computed display prices (per 1M tokens)
    prompt_price_per_million: float = 0.0
    completion_price_per_million: float = 0.0


class ModelListResponse(BaseModel):
    models: list[ModelInfo] = []
    total: int = 0
    last_refreshed: Optional[str] = None
