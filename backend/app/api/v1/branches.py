from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.schemas.branch import BranchOut
from app.services.branches import compute_branches
from app.db.session import get_db  # ton dependency DB

router = APIRouter(prefix="/api/v1/branches", tags=["branches"])

@router.get("", response_model=List[BranchOut])
def list_branches(db: Session = Depends(get_db)):
    return compute_branches(db)