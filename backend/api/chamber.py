"""
Chamber API — /api/chamber
Deliberation submission, SSE streaming, session history.
"""

import json
import asyncio
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.session import SubmitRequest
from backend.services import chamber_service

router = APIRouter(prefix="/api/chamber", tags=["chamber"])


@router.post("/submit")
def submit_statement(body: SubmitRequest, db: Session = Depends(get_db)):
    """Submit a statement to a council for deliberation. Returns all events."""
    events = chamber_service.submit_statement(db, body.council_id, body.statement, body.bypass_pre_check)
    return {"events": events}


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
