"""
Councils API — /api/councils
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.council import CouncilCreate, CouncilUpdate, CouncilResponse, CouncilListItem
from backend.services import council_service

router = APIRouter(prefix="/api/councils", tags=["councils"])


@router.get("")
def list_councils(db: Session = Depends(get_db)):
    """List all councils."""
    return council_service.list_councils(db)


@router.get("/{council_id}")
def get_council(council_id: str, db: Session = Depends(get_db)):
    """Get council detail with councillors."""
    result = council_service.get_council(db, council_id)
    if not result:
        raise HTTPException(status_code=404, detail="Council not found.")
    return result


@router.post("")
def create_council(body: CouncilCreate, db: Session = Depends(get_db)):
    """Create a new custom council."""
    data = body.model_dump()
    return council_service.create_council(db, data)


@router.put("/{council_id}")
def update_council(council_id: str, body: CouncilUpdate, db: Session = Depends(get_db)):
    """Update a custom council (not defaults)."""
    data = body.model_dump()
    try:
        result = council_service.update_council(db, council_id, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not result:
        raise HTTPException(status_code=404, detail="Council not found.")
    return result


@router.post("/{council_id}/duplicate")
def duplicate_council(council_id: str, db: Session = Depends(get_db)):
    """Duplicate any council."""
    result = council_service.duplicate_council(db, council_id)
    if not result:
        raise HTTPException(status_code=404, detail="Council not found.")
    return result


@router.patch("/{council_id}/toggle")
def toggle_council(council_id: str, db: Session = Depends(get_db)):
    """Activate/deactivate a council."""
    result = council_service.toggle_council(db, council_id)
    if not result:
        raise HTTPException(status_code=404, detail="Council not found.")
    return result


@router.post("/{council_id}/reset")
def reset_council(council_id: str, db: Session = Depends(get_db)):
    """Reset a default council to its original configuration."""
    try:
        result = council_service.reset_council(db, council_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not result:
        raise HTTPException(status_code=400, detail="Only default councils can be reset.")
    return result
