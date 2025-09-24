# backend/app/routers/results.py - ROUTER POUR LES RÉSULTATS
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from datetime import datetime
import uuid
import json

router = APIRouter(prefix="/api/v1/results", tags=["results"])

# ===== MODÈLES POUR LES RÉSULTATS =====
class MethodResult(BaseModel):
    id: str
    name: str
    status: str
    ultimate: float
    reserves: float
    paid_to_date: float
    development_factors: List[float]
    projected_triangle: Optional[List[List[float]]] = None
    confidence_intervals: Optional[List[Dict[str, Any]]] = None
    diagnostics: Dict[str, float]
    warnings: Optional[List[str]] = []
    parameters: Dict[str, Any]

class ResultSummary(BaseModel):
    best_estimate: float
    range: Dict[str, float]
    confidence: float
    convergence: bool

class ResultMetadata(BaseModel):
    currency: str
    business_line: str
    data_points: int
    last_updated: str

class CalculationResultResponse(BaseModel):
    id: str
    triangle_id: str
    triangle_name: str
    status: str
    started_at: str
    completed_at: Optional[str] = None
    duration: Optional[int] = None
    methods: List[MethodResult]
    summary: ResultSummary
    metadata: ResultMetadata

class ResultsListResponse(BaseModel):
    data: List[CalculationResultResponse]
    total: int
    page: int
    limit: int

class ExportRequest(BaseModel):
    format: str = "json"
    include_raw_data: bool = True
    include_charts: bool = False

# ===== STOCKAGE TEMPORAIRE =====
results_store: Dict[str, CalculationResultResponse] = {}

# ===== DONNÉES MOCK =====
def generate_mock_triangle(size: int = 7) -> List[List[float]]:
    """Générer un triangle mock pour les tests"""
    triangle = []
    for i in range(size):
        row = []
        for j in range(i + 1):
            base_value = 800000 + (i * 100000)
            decay_factor = (0.8) ** j
            value = base_value * decay_factor
            row.append(round(value, 2))
        triangle.append(row)
    return triangle

def create_mock_result(triangle_id: str = "1", result_id: str = None) -> CalculationResultResponse:
    """Créer un résultat mock"""
    if result_id is None:
        result_id = str(uuid.uuid4())
    
    # Données différentes selon l'ID du triangle
    triangle_data = {
        "1": {"name": "Auto 2024", "business_line": "Automobile", "ultimate_base": 15234567},
        "2": {"name": "RC 2023", "business_line": "Responsabilité Civile", "ultimate_base": 18567890},
    }
    
    data = triangle_data.get(triangle_id, triangle_data["1"])
    
    return CalculationResultResponse(
        id=result_id,
        triangle_id=triangle_id,
        triangle_name=data["name"],
        status="completed",
        started_at=(datetime.utcnow().replace(microsecond=0) - 
                   datetime.timedelta(minutes=5)).isoformat() + "Z",
        completed_at=datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        duration=45,
        methods=[
            MethodResult(
                id="chain_ladder",
                name="Chain Ladder",
                status="success",
                ultimate=data["ultimate_base"],
                reserves=data["ultimate_base"] - 11777778,
                paid_to_date=11777778,
                development_factors=[1.456, 1.234, 1.123, 1.067, 1.023, 1.011, 1.005],
                projected_triangle=generate_mock_triangle(7),
                confidence_intervals=[
                    {"level": 75, "lower": data["ultimate_base"] * 0.95, "upper": data["ultimate_base"] * 1.05},
                    {"level": 95, "lower": data["ultimate_base"] * 0.90, "upper": data["ultimate_base"] * 1.10},
                    {"level": 99, "lower": data["ultimate_base"] * 0.85, "upper": data["ultimate_base"] * 1.15}
                ],
                diagnostics={
                    "rmse": 0.0234,
                    "mape": 2.45,
                    "r2": 0.9856
                },
                warnings=[],
                parameters={
                    "tail_factor": 1.0,
                    "exclude_outliers": True,
                    "smoothing": "none"
                }
            ),
            MethodResult(
                id="bornhuetter_ferguson",
                name="Bornhuetter-Ferguson",
                status="success",
                ultimate=data["ultimate_base"] * 1.02,
                reserves=(data["ultimate_base"] * 1.02) - 11777778,
                paid_to_date=11777778,
                development_factors=[1.478, 1.245, 1.134, 1.078, 1.034, 1.015, 1.007],
                confidence_intervals=[
                    {"level": 75, "lower": data["ultimate_base"] * 0.97, "upper": data["ultimate_base"] * 1.07},
                    {"level": 95, "lower": data["ultimate_base"] * 0.92, "upper": data["ultimate_base"] * 1.12}
                ],
                diagnostics={
                    "rmse": 0.0256,
                    "mape": 2.67,
                    "r2": 0.9823
                },
                warnings=["Ratio de sinistralité élevé détecté pour l'année 2022"],
                parameters={
                    "apriori_loss_ratio": 0.75,
                    "credibility_weight": 0.5,
                    "adjust_for_inflation": True
                }
            )
        ],
        summary=ResultSummary(
            best_estimate=(data["ultimate_base"] + data["ultimate_base"] * 1.02) / 2,
            range={
                "min": data["ultimate_base"] * 0.90,
                "max": data["ultimate_base"] * 1.12
            },
            confidence=92.5,
            convergence=True
        ),
        metadata=ResultMetadata(
            currency="EUR",
            business_line=data["business_line"],
            data_points=45,
            last_updated=datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
        )
    )

# ===== ENDPOINTS =====

@router.get("/", response_model=ResultsListResponse)
async def get_results(
    triangle_id: Optional[str] = Query(None, alias="triangleId"),
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    status: Optional[str] = None
):
    """Récupérer la liste des résultats"""
    
    # Créer quelques résultats mock si le store est vide
    if not results_store:
        for i in range(1, 4):
            triangle_id_mock = str(i)
            result_id = f"result_{i}"
            results_store[result_id] = create_mock_result(triangle_id_mock, result_id)
    
    # Filtrer les résultats
    filtered_results = list(results_store.values())
    
    if triangle_id:
        filtered_results = [r for r in filtered_results if r.triangle_id == triangle_id]
    
    if status:
        filtered_results = [r for r in filtered_results if r.status == status]
    
    # Pagination
    total = len(filtered_results)
    start = (page - 1) * limit
    end = start + limit
    paginated_results = filtered_results[start:end]
    
    return ResultsListResponse(
        data=paginated_results,
        total=total,
        page=page,
        limit=limit
    )

@router.get("/{result_id}", response_model=CalculationResultResponse)
async def get_result_by_id(result_id: str):
    """Récupérer un résultat spécifique par ID"""
    
    # Vérifier si le résultat existe dans le store
    if result_id in results_store:
        return results_store[result_id]
    
    # Sinon, créer un résultat mock pour cet ID
    # Essayer de déduire le triangle_id à partir du result_id
    triangle_id = "1"  # Par défaut
    if "triangle" in result_id:
        # Si l'ID contient "triangle", essayer d'extraire l'ID
        parts = result_id.split("_")
        for part in parts:
            if part.isdigit():
                triangle_id = part
                break
    
    mock_result = create_mock_result(triangle_id, result_id)
    results_store[result_id] = mock_result
    
    return mock_result

@router.get("/{result_id}/export")
async def export_result(
    result_id: str,
    format: str = Query("json", regex="^(json|csv|excel|pdf)$")
):
    """Exporter un résultat dans différents formats"""
    
    if result_id not in results_store:
        # Créer un résultat mock si n'existe pas
        mock_result = create_mock_result("1", result_id)
        results_store[result_id] = mock_result
    
    result = results_store[result_id]
    
    if format == "json":
        return JSONResponse(
            content=result.dict(),
            headers={
                "Content-Disposition": f"attachment; filename=result_{result_id}.json"
            }
        )
    
    elif format == "csv":
        # Simuler un CSV simple
        csv_content = f"Triangle,{result.triangle_name}\n"
        csv_content += f"Status,{result.status}\n"
        csv_content += f"Best Estimate,{result.summary.best_estimate}\n"
        
        for method in result.methods:
            csv_content += f"Method,{method.name}\n"
            csv_content += f"Ultimate,{method.ultimate}\n"
            csv_content += f"Reserves,{method.reserves}\n"
        
        return JSONResponse(
            content={"data": csv_content, "filename": f"result_{result_id}.csv"},
            headers={
                "Content-Disposition": f"attachment; filename=result_{result_id}.csv"
            }
        )
    
    else:
        return {
            "message": f"Export {format} simulé",
            "result_id": result_id,
            "format": format,
            "filename": f"result_{result_id}.{format}"
        }

@router.post("/compare")
async def compare_results(result_ids: List[str]):
    """Comparer plusieurs résultats"""
    
    if len(result_ids) < 2:
        raise HTTPException(status_code=400, detail="Au moins 2 résultats requis pour la comparaison")
    
    compared_results = []
    
    for result_id in result_ids:
        if result_id not in results_store:
            # Créer un résultat mock si n'existe pas
            mock_result = create_mock_result("1", result_id)
            results_store[result_id] = mock_result
        
        result = results_store[result_id]
        compared_results.append({
            "id": result.id,
            "triangle_name": result.triangle_name,
            "best_estimate": result.summary.best_estimate,
            "confidence": result.summary.confidence,
            "method_count": len(result.methods),
            "status": result.status
        })
    
    # Calculer quelques métriques de comparaison
    estimates = [r["best_estimate"] for r in compared_results]
    comparison_stats = {
        "mean_estimate": sum(estimates) / len(estimates),
        "min_estimate": min(estimates),
        "max_estimate": max(estimates),
        "variance": sum((x - sum(estimates) / len(estimates)) ** 2 for x in estimates) / len(estimates)
    }
    
    return {
        "results": compared_results,
        "comparison_stats": comparison_stats,
        "total_compared": len(result_ids)
    }

@router.delete("/{result_id}")
async def delete_result(result_id: str):
    """Supprimer un résultat"""
    
    if result_id not in results_store:
        raise HTTPException(status_code=404, detail="Résultat introuvable")
    
    del results_store[result_id]
    
    return {"message": f"Résultat {result_id} supprimé avec succès"}

# Endpoint de test
@router.get("/test/ping")
async def ping():
    """Test simple pour vérifier que le router fonctionne"""
    return {
        "message": "Results router is working!",
        "timestamp": datetime.utcnow().isoformat(),
        "results_count": len(results_store)
    }