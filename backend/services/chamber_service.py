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


def submit_statement(db: Session, council_id: str, statement: str) -> list[dict]:
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

    # Get API key
    api_key = settings_service.get_api_key(db)
    if not api_key:
        return [{"type": "error", "data": {"message": "Please add your OpenRouter API key in Settings before running a deliberation."}}]

    # Get default model
    settings_row = settings_service._ensure_settings(db)
    default_model = settings_row.default_model or "openai/gpt-4o"

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
            "model_override": c.model_override,
        }
        for c in councillors
    ]

    # Run engine
    start_time = time.time()
    os.environ["OPENROUTER_API_KEY"] = api_key
    engine = AgoraEngine()

    try:
        events = engine.run_deliberation(
            statement=statement,
            councillors=councillor_data,
            council_name=council.name,
            default_model=default_model,
            coordinator_instructions=council.coordinator_instructions or "",
            web_search_enabled=council.web_search_enabled or False,
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
