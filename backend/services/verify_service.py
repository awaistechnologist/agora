"""
Claim-verification service: resolves a judge model and runs engine.verify
through llm-sidecar. Shared by the MCP tools and the REST endpoint.

Judge resolution:
  1. an explicit `model` argument is used as given
  2. otherwise llm-sidecar picks a "fast" model it has just verified is
     answering — local Ollama, or OpenRouter when a key is configured.
     This replaces the old "configured default, then fall back to the first
     Ollama model on 400/404" dance: stale free models never get chosen.
"""

from __future__ import annotations

import logging
import os

from sqlalchemy.orm import Session

from backend.services import settings_service
from engine import verify as verify_engine
from engine.llm import get_sidecar

logger = logging.getLogger("agora.verify_service")


def _sidecar(db: Session):
    key = settings_service.get_api_key(db) or os.getenv("OPENROUTER_API_KEY", "")
    return get_sidecar(key or None)


def resolve_judge_model(db: Session, model: str | None = None) -> str:
    if model:
        return model
    try:
        return _sidecar(db).model_for("fast")
    except Exception as e:
        raise ValueError(
            "Claim verification needs a judge model: configure an OpenRouter "
            "API key in Agora settings, or have Ollama running with a model. "
            f"({str(e)[:160]})"
        ) from e


def verify_claims(db: Session, claims: list[str], model: str | None = None) -> dict:
    """Returns {"model": ..., "results": [{claim, verdict, note, sources}]}."""
    judge = resolve_judge_model(db, model)
    results = verify_engine.verify_claims(claims, judge, _sidecar(db))
    return {"model": judge, "results": results}
