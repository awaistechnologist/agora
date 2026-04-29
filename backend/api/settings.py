"""
Settings API — /api/settings
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.settings import SettingsResponse, SettingsUpdate, UsageStats
from backend.services import settings_service, model_service, cost_tracker

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("", response_model=SettingsResponse)
def get_settings(db: Session = Depends(get_db)):
    data = settings_service.get_settings(db)
    return SettingsResponse(**data)


@router.put("", response_model=SettingsResponse)
def update_settings(body: SettingsUpdate, db: Session = Depends(get_db)):
    data = settings_service.update_settings(
        db,
        openrouter_key=body.openrouter_key,
        default_model_fast=body.default_model_fast,
        default_model_balanced=body.default_model_balanced,
        default_model_powerful=body.default_model_powerful,
    )
    return SettingsResponse(**data)


@router.post("/test")
def test_key(body: SettingsUpdate, db: Session = Depends(get_db)):
    """Test an OpenRouter API key."""
    key = body.openrouter_key
    if not key:
        key = settings_service.get_api_key(db)
    if not key:
        return {"valid": False, "message": "No API key provided.", "model_count": 0}

    valid, count = model_service.test_api_key(key)
    if valid:
        return {"valid": True, "message": f"Key saved. {count} models available.", "model_count": count}
    return {"valid": False, "message": "This key doesn't seem to work.", "model_count": 0}


@router.get("/usage", response_model=UsageStats)
def get_usage(db: Session = Depends(get_db)):
    data = cost_tracker.get_usage_stats(db)
    return UsageStats(**data)
