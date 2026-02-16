"""
Models API — /api/models (OpenRouter proxy)
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.openrouter import ModelListResponse
from backend.services import settings_service, model_service

router = APIRouter(prefix="/api/models", tags=["models"])


@router.get("", response_model=ModelListResponse)
def list_models(db: Session = Depends(get_db)):
    """List tool-capable models with pricing (cached)."""
    api_key = settings_service.get_api_key(db)
    if not api_key:
        return ModelListResponse(models=[], total=0)
    return model_service.get_models(db, api_key)


@router.get("/refresh", response_model=ModelListResponse)
def refresh_models(db: Session = Depends(get_db)):
    """Force-refresh model list from OpenRouter."""
    api_key = settings_service.get_api_key(db)
    if not api_key:
        return ModelListResponse(models=[], total=0)
    return model_service.get_models(db, api_key, force_refresh=True)
