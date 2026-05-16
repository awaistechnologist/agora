"""
Chamber API — /api/chamber
Deliberation submission, SSE streaming, session history.
"""

import json
import asyncio
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.session import SubmitRequest
from backend.services import chamber_service, auto_council

router = APIRouter(prefix="/api/chamber", tags=["chamber"])


@router.post("/submit")
def submit_statement(body: SubmitRequest, db: Session = Depends(get_db)):
    """Synchronous submit. Runs the whole deliberation, returns all events.
    Kept for backward compat (MCP server uses this). New UI uses /submit/stream."""
    events = chamber_service.submit_statement(db, body.council_id, body.statement, body.bypass_pre_check)
    return {"events": events}


class AutoDesignRequest(BaseModel):
    statement: str = Field(..., min_length=1)
    # Budget knob — the picker finds a working model in this tier and the
    # architect (and resulting deliberation) all run on it. Defaults to
    # "free" so users without paid credits get something useful out of the box.
    budget: str = Field(default="free", pattern="^(free|cheap|best)$")


@router.post("/auto-design")
def auto_design(body: AutoDesignRequest, db: Session = Depends(get_db)):
    """Architect-mode: given a statement and a budget, pick a working model,
    then return a proposal — either an existing council that fits, or a
    freshly-designed one tailored to the question. The proposal is a
    recommendation; nothing is written to the DB until the user confirms
    (frontend creates the council via /api/councils with the architect's
    payload, then submits via /submit/stream passing the chosen_model.id
    as model_override)."""
    result = auto_council.design_for_statement(db, body.statement.strip(), body.budget)
    if result.get("error"):
        # Pretest attempts (if any) are useful for debugging — surface them.
        raise HTTPException(
            status_code=400,
            detail={"message": result["error"], "attempts": result.get("attempts", [])},
        )
    return result


@router.post("/submit/stream")
async def submit_statement_stream(body: SubmitRequest, db: Session = Depends(get_db)):
    """Streaming submit. Returns SSE events as they happen — including
    `councillor_token` and `verdict_token` deltas, so the UI can render
    text live. Councillors run in parallel.

    Optional `model_override` (used by Auto-pick) forces every tier-resolved
    model in this deliberation to a specific model id."""
    async def event_generator():
        try:
            async for event in chamber_service.submit_statement_streaming(
                db, body.council_id, body.statement,
                bypass_pre_check=body.bypass_pre_check,
                model_override=body.model_override,
                force_web_search=body.force_web_search,
            ):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'data': {'message': str(e)[:200]}})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            # Disable proxy buffering (nginx etc.) so tokens arrive in real time
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/sessions/{session_id}/stream")
async def stream_session(session_id: str, db: Session = Depends(get_db)):
    """SSE stream for a deliberation session (replays stored events)."""
    detail = chamber_service.get_session_detail(db, session_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Session not found.")

    async def event_generator():
        # Stream councillor responses
        for r in detail.get("responses", []):
            event_data = json.dumps({
                "type": "councillor_response",
                "data": r,
            })
            yield f"data: {event_data}\n\n"
            await asyncio.sleep(0.1)

        # Stream verdict
        if detail.get("verdict"):
            event_data = json.dumps({
                "type": "verdict",
                "data": {
                    "verdict_text": detail["verdict"],
                    "confidence": detail.get("confidence"),
                    "total_cost_usd": detail.get("total_cost_usd", 0),
                    "total_tokens": detail.get("total_tokens", 0),
                    "model_summary": detail.get("model_summary"),
                    "duration_seconds": detail.get("duration_seconds"),
                },
            })
            yield f"data: {event_data}\n\n"

        # Complete
        yield f"data: {json.dumps({'type': 'complete'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@router.get("/sessions")
def list_sessions(db: Session = Depends(get_db)):
    """List past deliberation sessions."""
    return chamber_service.get_sessions(db)


@router.get("/sessions/{session_id}")
def get_session(session_id: str, db: Session = Depends(get_db)):
    """Get full session detail with all responses."""
    result = chamber_service.get_session_detail(db, session_id)
    if not result:
        raise HTTPException(status_code=404, detail="Session not found.")
    return result
