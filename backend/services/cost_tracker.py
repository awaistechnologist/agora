"""
Cost tracker service — aggregates cost data across sessions.
"""

import logging
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.database import SessionRow, ResponseRow, CouncilRow

logger = logging.getLogger("agora.costs")


def get_usage_stats(db: Session) -> dict:
    """Aggregate usage statistics."""
    completed = db.query(SessionRow).filter(SessionRow.status == "completed").all()

    total_spend = sum(s.total_cost_usd or 0 for s in completed)
    count = len(completed)
    avg_cost = total_spend / count if count > 0 else 0

    costs = [s.total_cost_usd for s in completed if s.total_cost_usd]
    most_expensive = max(costs) if costs else None
    cheapest = min(costs) if costs else None

    # Recent deliberations
    recent = (
        db.query(SessionRow)
        .filter(SessionRow.status == "completed")
        .order_by(SessionRow.created_at.desc())
        .limit(20)
        .all()
    )

    recent_list = []
    for s in recent:
        council = db.query(CouncilRow).filter(CouncilRow.id == s.council_id).first()
        recent_list.append({
            "id": s.id,
            "council_name": council.name if council else "Unknown",
            "statement": s.statement[:80] + "..." if len(s.statement) > 80 else s.statement,
            "model_summary": s.model_summary,
            "total_tokens": s.total_tokens,
            "cost_usd": s.total_cost_usd,
            "created_at": s.created_at,
        })

    return {
        "total_spend": round(total_spend, 6),
        "total_deliberations": count,
        "average_cost": round(avg_cost, 6),
        "most_expensive": round(most_expensive, 6) if most_expensive else None,
        "cheapest": round(cheapest, 6) if cheapest else None,
        "recent_deliberations": recent_list,
    }
