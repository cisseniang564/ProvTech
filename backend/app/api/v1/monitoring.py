# app/api/v1/monitoring.py
from fastapi import APIRouter
from app.core.database import health_check_db, get_performance_metrics, db_manager

router = APIRouter(prefix="/monitoring", tags=["Monitoring"])

@router.get("/health")
async def health_check():
    return health_check_db()

@router.get("/metrics")
async def metrics():
    return get_performance_metrics()

@router.post("/optimize")
async def optimize_database():
    db_manager.optimize_tables()
    return {"status": "optimized"}

@router.post("/cleanup")
async def cleanup(days: int = 90):
    result = db_manager.cleanup_old_data(days)
    return result