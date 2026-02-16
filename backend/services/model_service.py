"""
Model service — OpenRouter model discovery, caching, and pricing.
"""

import os
import logging
from datetime import datetime, timedelta
import httpx
from sqlalchemy.orm import Session

from backend.database import CachedModelRow
from backend.models.openrouter import ModelInfo, ModelPricing, ModelListResponse

logger = logging.getLogger("agora.models")

OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models"
CACHE_TTL_MINUTES = 30


def _extract_provider(model_id: str) -> str:
    """Extract provider name from model ID (e.g., 'openai/gpt-4o' → 'OpenAI')."""
    if "/" in model_id:
        provider = model_id.split("/")[0]
        return provider.replace("-", " ").title()
    return "Unknown"


def fetch_models_from_openrouter(api_key: str) -> list[dict]:
    """Fetch tool-capable models from OpenRouter API."""
    try:
        resp = httpx.get(
            OPENROUTER_MODELS_URL,
            params={"supported_parameters": "tools"},
            headers={
                "Authorization": f"Bearer {api_key}",
                "HTTP-Referer": "http://localhost:8080",
                "X-Title": "Agora",
            },
            timeout=30.0,
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("data", [])
    except Exception as e:
        logger.error(f"Failed to fetch models from OpenRouter: {e}")
        return []


def cache_models(db: Session, models: list[dict]):
    """Store fetched models in the cache table."""
    # Clear old cache
    db.query(CachedModelRow).delete()
    now = datetime.utcnow().isoformat()

    for m in models:
        pricing = m.get("pricing", {})
        row = CachedModelRow(
            id=m.get("id", ""),
            name=m.get("name", ""),
            provider=_extract_provider(m.get("id", "")),
            context_length=m.get("context_length", 0),
            pricing_prompt=pricing.get("prompt", "0"),
            pricing_completion=pricing.get("completion", "0"),
            pricing_image=pricing.get("image", "0"),
            pricing_request=pricing.get("request", "0"),
            supports_tools=True,
            last_fetched=now,
        )
        db.add(row)
    db.commit()


def get_cached_models(db: Session) -> list[ModelInfo]:
    """Return cached models as ModelInfo list."""
    rows = db.query(CachedModelRow).order_by(CachedModelRow.provider, CachedModelRow.name).all()
    result = []
    for r in rows:
        prompt_per_token = float(r.pricing_prompt or 0)
        completion_per_token = float(r.pricing_completion or 0)
        is_free = prompt_per_token == 0 and completion_per_token == 0

        result.append(ModelInfo(
            id=r.id,
            name=r.name or r.id,
            provider=r.provider or "",
            context_length=r.context_length or 0,
            pricing=ModelPricing(
                prompt=r.pricing_prompt or "0",
                completion=r.pricing_completion or "0",
                image=r.pricing_image or "0",
                request=r.pricing_request or "0",
            ),
            supports_tools=True,
            is_free=is_free,
            prompt_price_per_million=prompt_per_token * 1_000_000,
            completion_price_per_million=completion_per_token * 1_000_000,
        ))
    return result


def is_cache_fresh(db: Session) -> bool:
    """Check if cache is within TTL."""
    row = db.query(CachedModelRow).first()
    if not row or not row.last_fetched:
        return False
    try:
        fetched = datetime.fromisoformat(row.last_fetched)
        return datetime.utcnow() - fetched < timedelta(minutes=CACHE_TTL_MINUTES)
    except Exception:
        return False


def get_models(db: Session, api_key: str, force_refresh: bool = False) -> ModelListResponse:
    """Get models — from cache if fresh, else fetch from OpenRouter."""
    if not force_refresh and is_cache_fresh(db):
        models = get_cached_models(db)
        row = db.query(CachedModelRow).first()
        return ModelListResponse(
            models=models,
            total=len(models),
            last_refreshed=row.last_fetched if row else None,
        )

    # Fetch fresh
    raw_models = fetch_models_from_openrouter(api_key)
    if raw_models:
        cache_models(db, raw_models)

    models = get_cached_models(db)
    row = db.query(CachedModelRow).first()
    return ModelListResponse(
        models=models,
        total=len(models),
        last_refreshed=row.last_fetched if row else None,
    )


def test_api_key(api_key: str) -> tuple[bool, int]:
    """Test if an API key is valid by calling models endpoint. Returns (success, model_count)."""
    try:
        resp = httpx.get(
            OPENROUTER_MODELS_URL,
            params={"supported_parameters": "tools"},
            headers={
                "Authorization": f"Bearer {api_key}",
                "HTTP-Referer": "http://localhost:8080",
                "X-Title": "Agora",
            },
            timeout=15.0,
        )
        if resp.status_code == 401:
            return False, 0
        resp.raise_for_status()
        data = resp.json()
        count = len(data.get("data", []))
        return True, count
    except Exception:
        return False, 0
