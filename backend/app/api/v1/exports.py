from fastapi import APIRouter, HTTPException
from sqlalchemy.orm import Session
from fastapi import Depends
from app.core.database import get_db
from app.models.calculation import Calculation

router = APIRouter(prefix="/exports", tags=["exports"])

@router.get("/calculation/{calculation_id}/excel")
def export_calc_excel(calculation_id: str, db: Session = Depends(get_db)):
    calc = db.get(Calculation, calculation_id)
    if not calc:
        raise HTTPException(status_code=404, detail="Calculation not found")
    # TODO: générer un fichier Excel et le renvoyer (StreamingResponse)
    return {"ok": True, "message": "Export Excel non implémenté (TODO)"}
