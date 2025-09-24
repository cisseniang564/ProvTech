# backend/app/routers/calculations.py
from fastapi import APIRouter, HTTPException, BackgroundTasks
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from datetime import datetime
import uuid

router = APIRouter(prefix="/api/v1/calculations", tags=["calculations"])

# ===== MODÈLES PYDANTIC =====
class CalculationMethod(BaseModel):
    id: str
    name: str
    description: str
    category: str  # 'deterministic', 'stochastic', 'machine_learning'
    recommended: bool = False
    processing_time: str
    accuracy: int
    parameters: List[Dict[str, Any]] = []

class CalculationRequest(BaseModel):
    triangle_id: str
    methods: List[str]
    parameters: Optional[Dict[str, Dict[str, Any]]] = {}
    options: Optional[Dict[str, Any]] = {}

class MethodResult(BaseModel):
    id: str
    name: str
    status: str  # 'success', 'failed', 'warning'
    ultimate: float
    reserves: float
    paid_to_date: float
    development_factors: List[float]
    projected_triangle: Optional[List[List[float]]] = None
    confidence_intervals: Optional[List[Dict[str, Any]]] = None
    diagnostics: Dict[str, float]
    warnings: Optional[List[str]] = []
    parameters: Dict[str, Any]

class CalculationResult(BaseModel):
    id: str
    triangle_id: str
    triangle_name: str
    status: str  # 'pending', 'running', 'completed', 'failed'
    started_at: str
    completed_at: Optional[str] = None
    duration: Optional[int] = None
    methods: List[MethodResult]
    summary: Dict[str, Any]
    metadata: Dict[str, Any]

class CalculationResponse(BaseModel):
    calculation_id: str
    estimated_time: int

# ===== STOCKAGE TEMPORAIRE (remplacer par DB) =====
calculations_store = {}
methods_store = [
    CalculationMethod(
        id="chain_ladder",
        name="Chain Ladder",
        description="Méthode déterministe classique basée sur les facteurs de développement",
        category="deterministic",
        recommended=True,
        processing_time="< 1s",
        accuracy=85,
        parameters=[
            {
                "key": "tail_factor",
                "label": "Facteur de queue",
                "type": "number",
                "default": 1.0,
                "min": 0.9,
                "max": 1.5
            }
        ]
    ),
    CalculationMethod(
        id="bornhuetter_ferguson", 
        name="Bornhuetter-Ferguson",
        description="Combine l'expérience historique avec une estimation a priori",
        category="deterministic",
        recommended=True,
        processing_time="< 2s",
        accuracy=88,
        parameters=[
            {
                "key": "apriori_loss_ratio",
                "label": "Ratio de sinistralité a priori",
                "type": "number", 
                "default": 0.75
            }
        ]
    ),
    CalculationMethod(
        id="mack_chain_ladder",
        name="Mack",
        description="Extension stochastique du Chain Ladder avec intervalles de confiance",
        category="stochastic",
        recommended=False,
        processing_time="5-10s",
        accuracy=92,
        parameters=[
            {
                "key": "confidence_level",
                "label": "Niveau de confiance",
                "type": "select",
                "default": 0.95,
                "options": [
                    {"value": 0.9, "label": "90%"},
                    {"value": 0.95, "label": "95%"},
                    {"value": 0.99, "label": "99%"}
                ]
            }
        ]
    )
]

# ===== ENDPOINTS PRIORITÉ 2 =====

@router.get("/methods", response_model=List[CalculationMethod])
async def get_available_methods():
    """
    Récupérer toutes les méthodes de calcul disponibles
    """
    return methods_store

@router.get("/", response_model=List[CalculationResult])
async def get_calculations(
    status: Optional[str] = None,
    triangle_id: Optional[str] = None,
    limit: int = 10
):
    """
    Récupérer la liste des calculs
    """
    calculations = list(calculations_store.values())
    
    # Appliquer les filtres
    if status:
        calculations = [c for c in calculations if c.status == status]
    if triangle_id:
        calculations = [c for c in calculations if c.triangle_id == triangle_id]
    
    # Limiter les résultats
    return calculations[:limit]

@router.post("/run", response_model=CalculationResponse)
async def run_calculation(
    request: CalculationRequest,
    background_tasks: BackgroundTasks
):
    """
    Lancer un calcul actuariel
    """
    # Générer un ID unique pour le calcul
    calculation_id = str(uuid.uuid4())
    
    # Créer l'objet calcul initial
    calculation = CalculationResult(
        id=calculation_id,
        triangle_id=request.triangle_id,
        triangle_name=f"Triangle {request.triangle_id}",  # TODO: récupérer le vrai nom
        status="pending",
        started_at=datetime.utcnow().isoformat() + "Z",
        methods=[],
        summary={},
        metadata={
            "currency": "EUR",
            "business_line": "Auto",
            "data_points": 45,
            "last_updated": datetime.utcnow().isoformat() + "Z"
        }
    )
    
    # Stocker le calcul
    calculations_store[calculation_id] = calculation
    
    # Lancer le calcul en arrière-plan
    background_tasks.add_task(process_calculation, calculation_id, request)
    
    # Estimer le temps de traitement
    estimated_time = len(request.methods) * 5  # 5 secondes par méthode
    
    return CalculationResponse(
        calculation_id=calculation_id,
        estimated_time=estimated_time
    )

@router.get("/{calculation_id}", response_model=CalculationResult)
async def get_calculation_result(calculation_id: str):
    """
    Récupérer les résultats d'un calcul
    """
    if calculation_id not in calculations_store:
        raise HTTPException(status_code=404, detail="Calcul introuvable")
    
    return calculations_store[calculation_id]

@router.delete("/{calculation_id}")
async def cancel_calculation(calculation_id: str):
    """
    Annuler un calcul en cours
    """
    if calculation_id not in calculations_store:
        raise HTTPException(status_code=404, detail="Calcul introuvable")
    
    calculation = calculations_store[calculation_id]
    if calculation.status in ["pending", "running"]:
        calculation.status = "cancelled"
        return {"message": "Calcul annulé avec succès"}
    else:
        raise HTTPException(status_code=400, detail="Le calcul ne peut pas être annulé")

# ===== FONCTIONS DE TRAITEMENT =====

async def process_calculation(calculation_id: str, request: CalculationRequest):
    """
    Traiter le calcul en arrière-plan
    """
    import asyncio
    import random
    
    calculation = calculations_store[calculation_id]
    calculation.status = "running"
    
    try:
        methods_results = []
        
        for method_id in request.methods:
            # Simuler le calcul (remplacer par vraie logique)
            await asyncio.sleep(2)  # Simuler du temps de calcul
            
            # Données mockées pour la démo
            mock_result = MethodResult(
                id=method_id,
                name=get_method_name(method_id),
                status="success",
                ultimate=random.uniform(14_000_000, 16_000_000),
                reserves=random.uniform(3_000_000, 4_000_000),
                paid_to_date=11_777_778,
                development_factors=[1.456, 1.234, 1.123, 1.067, 1.023, 1.011, 1.005],
                projected_triangle=generate_mock_triangle(8),
                confidence_intervals=[
                    {"level": 75, "lower": 14_500_000, "upper": 15_900_000},
                    {"level": 95, "lower": 14_100_000, "upper": 16_400_000}
                ] if method_id == "mack_chain_ladder" else None,
                diagnostics={
                    "rmse": round(random.uniform(0.02, 0.03), 4),
                    "mape": round(random.uniform(2.0, 3.0), 2),
                    "r2": round(random.uniform(0.98, 0.99), 4)
                },
                warnings=["Ratio de sinistralité élevé détecté"] if random.random() > 0.7 else [],
                parameters=request.parameters.get(method_id, {})
            )
            
            methods_results.append(mock_result)
        
        # Calculer le résumé
        if methods_results:
            ultimates = [m.ultimate for m in methods_results]
            best_estimate = sum(ultimates) / len(ultimates)
            
            calculation.summary = {
                "best_estimate": best_estimate,
                "range": {"min": min(ultimates), "max": max(ultimates)},
                "confidence": 92.5,
                "convergence": True
            }
        
        calculation.methods = methods_results
        calculation.status = "completed"
        calculation.completed_at = datetime.utcnow().isoformat() + "Z"
        calculation.duration = 45  # secondes
        
    except Exception as e:
        calculation.status = "failed"
        calculation.completed_at = datetime.utcnow().isoformat() + "Z"
        # TODO: Log l'erreur

def get_method_name(method_id: str) -> str:
    """Récupérer le nom d'une méthode"""
    method_names = {
        "chain_ladder": "Chain Ladder",
        "bornhuetter_ferguson": "Bornhuetter-Ferguson", 
        "mack_chain_ladder": "Mack"
    }
    return method_names.get(method_id, method_id)

def generate_mock_triangle(size: int) -> List[List[float]]:
    """Générer un triangle mock pour les tests"""
    import random
    triangle = []
    for i in range(size):
        row = []
        for j in range(i + 1):
            row.append(random.uniform(500_000, 1_500_000))
        triangle.append(row)
    return triangle