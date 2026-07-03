"""
Claim-verification service: resolves a judge model from settings and runs
engine.verify. Shared by the MCP tools and the REST endpoint.

Model resolution order:
  1. explicit `model` argument
  2. the "fast" tier default from settings
  3. if that needs OpenRouter but no API key is configured, fall back to the
     first installed Ollama model (fully local, keyless)
"""

from __future__ import annotations

import logging
import os

import httpx
from sqlalchemy.orm import Session

from backend.services import settings_service
from engine import verify as verify_engine
from engine.interface import AgoraEngine, OLLAMA_HOST, OLLAMA_PREFIX

logger = logging.getLogger("agora.verify_service")


def _installed_ollama_models() -> list[str]:
    try:
        r = httpx.get(f"{OLLAMA_HOST}/api/tags", timeout=5)
        return [m["name"] for m in r.json().get("models", [])]
    except Exception:
        return []


def resolve_judge_model(db: Session, model: str | None = None) -> str:
    api_key = settings_service.get_api_key(db) or os.getenv("OPENROUTER_API_KEY", "")
    if model:
        chosen = model
    else:
        chosen = settings_service.get_models_by_tier(db)["fast"]

    if not chosen.startswith(OLLAMA_PREFIX) and not api_key:
        local = _installed_ollama_models()
        if not local:
            raise ValueError(
                "Claim verification needs a judge model: configure an OpenRouter "
                "API key in Agora settings, or have Ollama running with a model."
            )
        fallback = f"{OLLAMA_PREFIX}{local[0]}"
        logger.info("no OpenRouter key — using local judge %s", fallback)
        chosen = fallback
    return chosen


def verify_claims(db: Session, claims: list[str], model: str | None = None) -> dict:
    """Returns {"model": ..., "results": [{claim, verdict, note, sources}]}."""
    judge = resolve_judge_model(db, model)
    engine = AgoraEngine()
    key = settings_service.get_api_key(db)
    if key:
        engine.api_key = key
    try:
        results = verify_engine.verify_claims(claims, judge, engine._call_llm)
    except httpx.HTTPStatusError as e:
        # Configured free models go stale (404/400). Retry once on a local judge.
        status = e.response.status_code if e.response is not None else 0
        local = _installed_ollama_models()
        if judge.startswith(OLLAMA_PREFIX) or status not in (400, 404) or not local:
            raise
        fallback = f"{OLLAMA_PREFIX}{local[0]}"
        logger.warning("judge %s failed (HTTP %d), retrying with %s", judge, status, fallback)
        judge = fallback
        results = verify_engine.verify_claims(claims, judge, engine._call_llm)
    return {"model": judge, "results": results}
