"""
Chamber service — orchestrates deliberations via the engine.
"""

import os
import uuid
import time
import json
import logging
from datetime import datetime
from sqlalchemy.orm import Session

from backend.database import SessionRow, ResponseRow, CouncilRow, CouncillorRow
from backend.services import settings_service
from engine.interface import AgoraEngine

logger = logging.getLogger("agora.chamber")


def submit_statement(db: Session, council_id: str, statement: str, bypass_pre_check: bool = False) -> list[dict]:
    """
    Run a deliberation: submit a statement to a council and get responses.
    Returns a list of events (synchronous for now, SSE wraps this).
    """
    # Validate council exists and is active
    council = db.query(CouncilRow).filter(CouncilRow.id == council_id).first()
    if not council:
        return [{"type": "error", "data": {"message": "Council not found."}}]
    if not council.is_active:
        return [{"type": "error", "data": {"message": "This council is currently inactive."}}]

    # Get the three tier models (Fast / Balanced / Powerful)
    tier_models = settings_service.get_models_by_tier(db)

    # An OpenRouter API key is only required if this deliberation will hit
    # OpenRouter at all. If every model that could be used (the three slots
    # plus any per-councillor explicit override) is an `ollama/*` id, we can
    # run entirely locally without a key.
    needs_openrouter = any(not (m or "").startswith("ollama/") for m in tier_models.values())
    if not needs_openrouter:
        # Check councillor-specific overrides too
        overrides = [c.model_override for c in db.query(CouncillorRow).filter(CouncillorRow.council_id == council_id).all()]
        needs_openrouter = any(o and not o.startswith("ollama/") for o in overrides)
    api_key = settings_service.get_api_key(db) if needs_openrouter else None
    if needs_openrouter and not api_key:
        return [{"type": "error", "data": {"message": "Please add your OpenRouter API key in Settings before running a deliberation. (Or assign Ollama models to all three tiers to run fully local.)"}}]

    # Create session
    session_id = str(uuid.uuid4())
    session = SessionRow(
        id=session_id,
        council_id=council_id,
        statement=statement,
        status="in_progress",
    )
    db.add(session)
    db.commit()

    # Prepare councillor data
    councillors = (
        db.query(CouncillorRow)
        .filter(CouncillorRow.council_id == council_id)
        .order_by(CouncillorRow.sort_order)
        .all()
    )
    councillor_data = [
        {
            "id": c.id,
            "name": c.name,
            "role_description": c.role_description,
            "expertise_area": c.expertise_area or "",
            "perspective": c.perspective or "neutral",
            "instructions": c.instructions,
            "model_tier": c.model_tier,
            "model_override": c.model_override,
        }
        for c in councillors
    ]

    # Run engine
    start_time = time.time()
    if api_key:
        os.environ["OPENROUTER_API_KEY"] = api_key
    engine = AgoraEngine()

    try:
        events = engine.run_deliberation(
            statement=statement,
            councillors=councillor_data,
            council_name=council.name,
            default_models=tier_models,
            coordinator_instructions=council.coordinator_instructions or "",

            web_search_enabled=council.web_search_enabled or False,
            web_search_provider=council.web_search_provider or "openrouter",
            bypass_pre_check=bypass_pre_check,
            pre_check_enabled=council.pre_check_enabled if council.pre_check_enabled is not None else True,
            coordinator_model_tier=council.coordinator_model_tier,
        )
    except Exception as e:
        session.status = "error"
        db.commit()
        return [{"type": "error", "data": {"message": f"Deliberation failed: {str(e)[:200]}"}}]

    duration = time.time() - start_time

    # Process events and store responses
    total_cost = 0.0
    total_tokens = 0
    model_summary = ""

    for event in events:
        if event.type == "councillor_response" and not event.data.get("error"):
            # Store response in DB
            resp = ResponseRow(
                id=str(uuid.uuid4()),
                session_id=session_id,
                councillor_id=event.data["councillor_id"],
                response_text=event.data.get("response_text", ""),
                stance=event.data.get("stance", "mixed"),
                model_used=event.data.get("model_used", ""),
                prompt_tokens=event.data.get("prompt_tokens", 0),
                completion_tokens=event.data.get("completion_tokens", 0),
                total_tokens=event.data.get("total_tokens", 0),
                cost_usd=event.data.get("cost_usd", 0.0),
                sort_order=len(db.query(ResponseRow).filter(ResponseRow.session_id == session_id).all()),
            )
            db.add(resp)

        elif event.type == "verdict":
            session.verdict = event.data.get("verdict_text", "")
            session.confidence = event.data.get("confidence", "medium")
            total_cost = event.data.get("total_cost_usd", 0.0)
            total_tokens = event.data.get("total_tokens", 0)
            model_summary = event.data.get("model_summary", "")

        elif event.type == "complete":
            total_cost = event.data.get("total_cost_usd", total_cost)
            total_tokens = event.data.get("total_tokens", total_tokens)

    # Update session
    session.status = "completed"
    session.total_cost_usd = total_cost
    session.total_tokens = total_tokens
    session.duration_seconds = round(duration, 2)
    session.model_summary = model_summary
    session.completed_at = datetime.utcnow().isoformat()
    db.commit()

    # Return events as dicts for SSE serialization
    return [{"type": e.type, "data": e.data} for e in events]


async def submit_statement_streaming(
    db: Session,
    council_id: str,
    statement: str,
    bypass_pre_check: bool = False,
    model_override: str | None = None,
    force_web_search: bool = False,
):
    """Async generator. Streams events from the engine to the API layer (and
    out to the user) as they happen, while persisting completed councillor
    responses + the final verdict to the database. Mirrors the sync
    `submit_statement` flow but emits events live."""
    council = db.query(CouncilRow).filter(CouncilRow.id == council_id).first()
    if not council:
        yield {"type": "error", "data": {"message": "Council not found."}}
        return
    if not council.is_active:
        yield {"type": "error", "data": {"message": "This council is currently inactive."}}
        return

    tier_models = settings_service.get_models_by_tier(db)

    # If a model_override is provided (Auto-pick), it overrides every tier
    # for this deliberation. We still leave per-councillor explicit overrides
    # in place — those are the user's hard pin and win over Auto-pick.
    if model_override:
        tier_models = {"fast": model_override, "balanced": model_override, "powerful": model_override}

    needs_openrouter = any(not (m or "").startswith("ollama/") for m in tier_models.values())
    if not needs_openrouter:
        overrides = [c.model_override for c in db.query(CouncillorRow).filter(CouncillorRow.council_id == council_id).all()]
        needs_openrouter = any(o and not o.startswith("ollama/") for o in overrides)
    api_key = settings_service.get_api_key(db) if needs_openrouter else None
    if needs_openrouter and not api_key:
        yield {"type": "error", "data": {"message": "Please add your OpenRouter API key in Settings before running a deliberation. (Or assign Ollama models to all three tiers to run fully local.)"}}
        return

    session_id = str(uuid.uuid4())
    session = SessionRow(
        id=session_id,
        council_id=council_id,
        statement=statement,
        status="in_progress",
    )
    db.add(session)
    db.commit()

    councillors = (
        db.query(CouncillorRow)
        .filter(CouncillorRow.council_id == council_id)
        .order_by(CouncillorRow.sort_order)
        .all()
    )
    councillor_data = [
        {
            "id": c.id,
            "name": c.name,
            "role_description": c.role_description,
            "expertise_area": c.expertise_area or "",
            "perspective": c.perspective or "neutral",
            "instructions": c.instructions,
            "model_tier": c.model_tier,
            "model_override": c.model_override,
        }
        for c in councillors
    ]

    if api_key:
        os.environ["OPENROUTER_API_KEY"] = api_key
    engine = AgoraEngine()

    start_time = time.time()
    total_cost = 0.0
    total_tokens = 0
    model_summary = ""
    sort_idx = 0
    saw_error = False

    try:
        # Force-on always uses 'local' (DuckDuckGo) so it works with any
        # model — the OpenRouter ':online' route is a no-op for Ollama, and
        # this override exists precisely so Auto-pick can ensure web search
        # actually happens for time-sensitive statements.
        eff_web_search_enabled = True if force_web_search else (council.web_search_enabled or False)
        eff_web_search_provider = "local" if force_web_search else (council.web_search_provider or "openrouter")

        async for ev in engine.run_deliberation_streaming(
            statement=statement,
            councillors=councillor_data,
            council_name=council.name,
            default_models=tier_models,
            coordinator_instructions=council.coordinator_instructions or "",
            web_search_enabled=eff_web_search_enabled,
            web_search_provider=eff_web_search_provider,
            bypass_pre_check=bypass_pre_check,
            pre_check_enabled=council.pre_check_enabled if council.pre_check_enabled is not None else True,
            coordinator_model_tier=council.coordinator_model_tier,
        ):
            etype = ev.type
            data = ev.data

            if etype == "councillor_response" and not data.get("error"):
                resp = ResponseRow(
                    id=str(uuid.uuid4()),
                    session_id=session_id,
                    councillor_id=data["councillor_id"],
                    response_text=data.get("response_text", ""),
                    stance=data.get("stance", "mixed"),
                    model_used=data.get("model_used", ""),
                    prompt_tokens=data.get("prompt_tokens", 0),
                    completion_tokens=data.get("completion_tokens", 0),
                    total_tokens=data.get("total_tokens", 0),
                    cost_usd=data.get("cost_usd", 0.0),
                    sort_order=sort_idx,
                )
                sort_idx += 1
                db.add(resp)
                db.commit()
            elif etype == "verdict":
                session.verdict = data.get("verdict_text", "")
                session.confidence = data.get("confidence", "medium")
                total_cost = data.get("total_cost_usd", total_cost)
                total_tokens = data.get("total_tokens", total_tokens)
                model_summary = data.get("model_summary", "")
                db.commit()
            elif etype == "complete":
                total_cost = data.get("total_cost_usd", total_cost)
                total_tokens = data.get("total_tokens", total_tokens)
            elif etype == "error":
                saw_error = True

            yield {"type": etype, "data": data}
    except Exception as e:
        logger.error(f"Streaming deliberation crashed: {e}")
        session.status = "error"
        db.commit()
        yield {"type": "error", "data": {"message": f"Deliberation failed: {str(e)[:200]}"}}
        return

    duration = time.time() - start_time
    session.status = "error" if saw_error and not session.verdict else "completed"
    session.total_cost_usd = total_cost
    session.total_tokens = total_tokens
    session.duration_seconds = round(duration, 2)
    session.model_summary = model_summary
    session.completed_at = datetime.utcnow().isoformat()
    db.commit()


def get_sessions(db: Session, limit: int = 50) -> list[dict]:
    """List recent sessions."""
    sessions = (
        db.query(SessionRow)
        .order_by(SessionRow.created_at.desc())
        .limit(limit)
        .all()
    )
    result = []
    for s in sessions:
        council = db.query(CouncilRow).filter(CouncilRow.id == s.council_id).first()
        result.append({
            "id": s.id,
            "council_id": s.council_id,
            "council_name": council.name if council else "Unknown",
            "statement": s.statement,
            "status": s.status,
            "total_cost_usd": s.total_cost_usd or 0,
            "total_tokens": s.total_tokens or 0,
            "created_at": s.created_at,
        })
    return result


def get_session_detail(db: Session, session_id: str) -> dict | None:
    """Get full session detail with all responses."""
    session = db.query(SessionRow).filter(SessionRow.id == session_id).first()
    if not session:
        return None

    council = db.query(CouncilRow).filter(CouncilRow.id == session.council_id).first()
    responses = (
        db.query(ResponseRow)
        .filter(ResponseRow.session_id == session_id)
        .order_by(ResponseRow.sort_order)
        .all()
    )

    response_list = []
    for r in responses:
        councillor = db.query(CouncillorRow).filter(CouncillorRow.id == r.councillor_id).first()
        response_list.append({
            "id": r.id,
            "councillor_id": r.councillor_id,
            "councillor_name": councillor.name if councillor else "Unknown",
            "councillor_role": councillor.expertise_area if councillor else "",
            "response_text": r.response_text,
            "stance": r.stance,
            "model_used": r.model_used,
            "prompt_tokens": r.prompt_tokens or 0,
            "completion_tokens": r.completion_tokens or 0,
            "total_tokens": r.total_tokens or 0,
            "cost_usd": r.cost_usd or 0,
            "sort_order": r.sort_order,
        })

    return {
        "id": session.id,
        "council_id": session.council_id,
        "council_name": council.name if council else "Unknown",
        "statement": session.statement,
        "verdict": session.verdict,
        "confidence": session.confidence,
        "status": session.status,
        "total_cost_usd": session.total_cost_usd or 0,
        "total_tokens": session.total_tokens or 0,
        "duration_seconds": session.duration_seconds,
        "model_summary": session.model_summary,
        "created_at": session.created_at,
        "completed_at": session.completed_at,
        "responses": response_list,
    }
