# backend/app/routers/api_data_integration.py - Router pour l'intégration des données API
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from typing import Dict, List, Optional, Any
from datetime import datetime
import logging
from pydantic import BaseModel

# Import du service d'intégration
try:
    from app.services.api_data_integration import (
        api_data_integration_service,
        APIDataRequest,
        TriangleData,
        DataSourceType,
        DataQuality,
        create_triangle_from_api,
        get_available_api_sources,
        convert_triangle_to_calculation_format
    )
    INTEGRATION_SERVICE_AVAILABLE = True
except ImportError as e:
    print(f"Service d'intégration non disponible: {e}")
    INTEGRATION_SERVICE_AVAILABLE = False

# Import du service API Connectors
try:
    from app.services.api_connectors import APIProvider, DataType
    API_CONNECTORS_AVAILABLE = True
except ImportError:
    API_CONNECTORS_AVAILABLE = False

logger = logging.getLogger(__name__)

# ===== CRÉATION DU ROUTER =====
router = APIRouter(
    prefix="/api/v1/data-integration",
    tags=["API Data Integration"]
)

# ===== MODÈLES PYDANTIC =====

class CreateTriangleFromAPIRequest(BaseModel):
    """Requête pour créer un triangle depuis une API"""
    provider: str
    data_type: str
    line_of_business: str
    parameters: Optional[Dict[str, Any]] = {}
    triangle_name: Optional[str] = None
    transformation_options: Optional[Dict[str, Any]] = {}

class TriangleResponse(BaseModel):
    """Réponse avec les détails du triangle créé"""
    success: bool
    triangle_id: str
    name: str
    source: str
    line_of_business: str
    data_quality: str
    completeness: float
    size: str
    metadata: Dict[str, Any]

class APISourcesResponse(BaseModel):
    """Réponse avec les sources API disponibles"""
    success: bool
    sources: List[Dict[str, Any]]

class CachedTrianglesResponse(BaseModel):
    """Réponse avec les triangles en cache"""
    success: bool
    triangles: List[Dict[str, Any]]
    total: int

# ===== DONNÉES SIMULÉES (FALLBACK) =====

MOCK_API_SOURCES = [
    {
        "id": "eiopa_loss_triangles",
        "name": "EIOPA - Triangles de Développement",
        "description": "Triangles standardisés EIOPA pour les calculs réglementaires",
        "provider": "eiopa",
        "data_type": "loss_triangles",
        "data_quality": "excellent",
        "update_frequency": "quarterly",
        "supported_lobs": ["auto", "property", "liability", "marine"]
    },
    {
        "id": "wtw_benchmarks",
        "name": "Willis Towers Watson - Benchmarks",
        "description": "Données de marché et triangles de référence",
        "provider": "willis_towers_watson", 
        "data_type": "loss_triangles",
        "data_quality": "good",
        "update_frequency": "monthly",
        "supported_lobs": ["auto", "property", "liability", "marine", "aviation"]
    },
    {
        "id": "milliman_intelligence",
        "name": "Milliman - Intelligence Actuarielle",
        "description": "Données enrichies et analyses prédictives",
        "provider": "milliman",
        "data_type": "loss_triangles", 
        "data_quality": "excellent",
        "update_frequency": "quarterly",
        "supported_lobs": ["auto", "property", "construction"]
    },
    {
        "id": "eiopa_regulatory",
        "name": "EIOPA - Données Réglementaires",
        "description": "Templates QRT et données Solvabilité II",
        "provider": "eiopa",
        "data_type": "regulatory_data",
        "data_quality": "excellent", 
        "update_frequency": "quarterly",
        "supported_lobs": ["auto", "property", "liability", "life"]
    }
]

# ===== ENDPOINTS =====

@router.get("/sources", response_model=APISourcesResponse)
async def get_api_sources(line_of_business: Optional[str] = None):
    """Récupérer les sources API disponibles pour l'intégration"""
    try:
        logger.info(f"Récupération des sources API pour LOB: {line_of_business}")
        
        if INTEGRATION_SERVICE_AVAILABLE:
            sources = await get_available_api_sources(line_of_business)
        else:
            # Utiliser les données simulées
            sources = MOCK_API_SOURCES
            if line_of_business:
                sources = [
                    source for source in sources 
                    if line_of_business in source.get("supported_lobs", [])
                ]
        
        logger.info(f"✅ {len(sources)} sources disponibles")
        return APISourcesResponse(success=True, sources=sources)
        
    except Exception as e:
        logger.error(f"❌ Erreur lors de la récupération des sources: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@router.post("/create-triangle", response_model=TriangleResponse)
async def create_triangle_from_api_endpoint(
    request: CreateTriangleFromAPIRequest,
    background_tasks: BackgroundTasks
):
    """Créer un triangle de calcul depuis une source API externe"""
    try:
        logger.info(f"🔄 Création triangle API: {request.provider} - {request.data_type} - {request.line_of_business}")
        
        if not INTEGRATION_SERVICE_AVAILABLE:
            # Mode simulation
            triangle_id = f"api_{request.provider}_{request.line_of_business}_{int(datetime.utcnow().timestamp())}"
            triangle_name = request.triangle_name or f"{request.provider}_{request.line_of_business}_{datetime.now().strftime('%Y%m%d')}"
            
            # Triangle simulé
            simulated_triangle = [
                [1000000, 850000, 720000, 650000, 620000, 610000],
                [1200000, 980000, 830000, 760000, 720000, None],
                [1100000, 920000, 780000, 720000, None, None],
                [1300000, 1050000, 890000, None, None, None],
                [1150000, 950000, None, None, None, None]
            ]
            
            return TriangleResponse(
                success=True,
                triangle_id=triangle_id,
                name=triangle_name,
                source=f"{request.provider}_{request.data_type}",
                line_of_business=request.line_of_business,
                data_quality="good",
                completeness=85.0,
                size="5x6",
                metadata={
                    "provider": request.provider,
                    "data_type": request.data_type,
                    "simulated": True,
                    "created_at": datetime.utcnow().isoformat(),
                    "parameters": request.parameters
                }
            )
        
        # Service réel disponible
        triangle_data = await create_triangle_from_api(
            provider=request.provider,
            data_type=request.data_type,
            line_of_business=request.line_of_business,
            parameters=request.parameters,
            triangle_name=request.triangle_name
        )
        
        # Enregistrer en arrière-plan pour utilisation dans les calculs
        background_tasks.add_task(
            register_triangle_for_calculations,
            triangle_data
        )
        
        logger.info(f"✅ Triangle créé: {triangle_data.name} ({triangle_data.triangle_id})")
        
        return TriangleResponse(
            success=True,
            triangle_id=triangle_data.triangle_id,
            name=triangle_data.name,
            source=triangle_data.metadata.source_name,
            line_of_business=triangle_data.metadata.line_of_business,
            data_quality=triangle_data.metadata.data_quality.value,
            completeness=triangle_data.metadata.completeness,
            size=f"{len(triangle_data.triangle)}x{len(triangle_data.triangle[0]) if triangle_data.triangle else 0}",
            metadata={
                "provider": triangle_data.metadata.provider,
                "currency": triangle_data.metadata.currency,
                "reporting_date": triangle_data.metadata.reporting_date,
                "last_updated": triangle_data.metadata.last_updated.isoformat(),
                "validation_passed": triangle_data.metadata.validation_passed
            }
        )
        
    except ValueError as e:
        logger.error(f"❌ Erreur de validation: {e}")
        raise HTTPException(status_code=400, detail=f"Paramètres invalides: {str(e)}")
    except Exception as e:
        logger.error(f"❌ Erreur lors de la création du triangle: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@router.get("/triangles/cached", response_model=CachedTrianglesResponse)
async def get_cached_triangles():
    """Récupérer la liste des triangles API en cache"""
    try:
        logger.info("📋 Récupération des triangles en cache")
        
        if INTEGRATION_SERVICE_AVAILABLE:
            triangles = await api_data_integration_service.list_cached_triangles()
        else:
            # Données simulées
            triangles = [
                {
                    "id": "api_eiopa_auto_1734567890",
                    "name": "EIOPA_Auto_20241218",
                    "source": "eiopa_loss_triangles",
                    "line_of_business": "auto",
                    "data_quality": "excellent",
                    "completeness": 95.0,
                    "last_updated": datetime.utcnow().isoformat(),
                    "size": "5x6"
                },
                {
                    "id": "api_wtw_property_1734567891",
                    "name": "WTW_Property_20241218",
                    "source": "wtw_benchmarks",
                    "line_of_business": "property",
                    "data_quality": "good",
                    "completeness": 88.0,
                    "last_updated": datetime.utcnow().isoformat(),
                    "size": "5x6"
                }
            ]
        
        logger.info(f"✅ {len(triangles)} triangles en cache")
        return CachedTrianglesResponse(
            success=True,
            triangles=triangles,
            total=len(triangles)
        )
        
    except Exception as e:
        logger.error(f"❌ Erreur lors de la récupération des triangles: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@router.get("/triangles/{triangle_id}")
async def get_triangle_details(triangle_id: str):
    """Récupérer les détails d'un triangle spécifique"""
    try:
        logger.info(f"🔍 Récupération triangle: {triangle_id}")
        
        if INTEGRATION_SERVICE_AVAILABLE:
            triangle_data = api_data_integration_service.get_cached_triangle(triangle_id)
            if not triangle_data:
                raise HTTPException(status_code=404, detail="Triangle non trouvé")
            
            return {
                "success": True,
                "triangle": convert_triangle_to_calculation_format(triangle_data)
            }
        else:
            # Simulation
            return {
                "success": True,
                "triangle": {
                    "id": triangle_id,
                    "name": "Triangle Simulé",
                    "triangle": [
                        [1000000, 850000, 720000, 650000, 620000, 610000],
                        [1200000, 980000, 830000, 760000, 720000, None],
                        [1100000, 920000, 780000, 720000, None, None],
                        [1300000, 1050000, 890000, None, None, None],
                        [1150000, 950000, None, None, None, None]
                    ],
                    "accident_years": [2019, 2020, 2021, 2022, 2023],
                    "development_periods": [1, 2, 3, 4, 5, 6],
                    "metadata": {
                        "source": "api_simulation",
                        "line_of_business": "auto",
                        "currency": "EUR",
                        "data_quality": "good"
                    },
                    "data_source": "api_external"
                }
            }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Erreur lors de la récupération du triangle: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@router.post("/triangles/{triangle_id}/use-for-calculation")
async def prepare_triangle_for_calculation(triangle_id: str):
    """Préparer un triangle API pour utilisation dans les calculs"""
    try:
        logger.info(f"📊 Préparation triangle pour calculs: {triangle_id}")
        
        if INTEGRATION_SERVICE_AVAILABLE:
            triangle_data = api_data_integration_service.get_cached_triangle(triangle_id)
            if not triangle_data:
                raise HTTPException(status_code=404, detail="Triangle non trouvé")
            
            # Convertir au format de calcul
            calculation_format = convert_triangle_to_calculation_format(triangle_data)
            
            # Enregistrer dans le système de calculs
            # (À intégrer avec votre système de triangles existant)
            
            return {
                "success": True,
                "message": "Triangle prêt pour les calculs",
                "triangle_id": triangle_id,
                "calculation_ready": True,
                "triangle_data": calculation_format
            }
        else:
            # Simulation
            return {
                "success": True,
                "message": "Triangle simulé prêt pour les calculs",
                "triangle_id": triangle_id,
                "calculation_ready": True,
                "triangle_data": {
                    "id": triangle_id,
                    "name": "Triangle API Simulé",
                    "data_source": "api_external"
                }
            }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Erreur lors de la préparation: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@router.delete("/triangles/{triangle_id}")
async def delete_cached_triangle(triangle_id: str):
    """Supprimer un triangle du cache"""
    try:
        logger.info(f"🗑️ Suppression triangle: {triangle_id}")
        
        if INTEGRATION_SERVICE_AVAILABLE:
            if triangle_id in api_data_integration_service.cached_triangles:
                del api_data_integration_service.cached_triangles[triangle_id]
                message = "Triangle supprimé du cache"
            else:
                raise HTTPException(status_code=404, detail="Triangle non trouvé")
        else:
            message = "Triangle simulé supprimé"
        
        return {
            "success": True,
            "message": message,
            "triangle_id": triangle_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Erreur lors de la suppression: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@router.delete("/cache/clear")
async def clear_triangle_cache():
    """Vider le cache des triangles API"""
    try:
        logger.info("🧹 Vidage du cache des triangles")
        
        if INTEGRATION_SERVICE_AVAILABLE:
            api_data_integration_service.clear_cache()
        
        return {
            "success": True,
            "message": "Cache vidé avec succès"
        }
        
    except Exception as e:
        logger.error(f"❌ Erreur lors du vidage du cache: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@router.get("/providers/supported")
async def get_supported_providers():
    """Récupérer les fournisseurs API supportés"""
    try:
        if API_CONNECTORS_AVAILABLE:
            providers = [
                {
                    "id": provider.value,
                    "name": provider.value.replace("_", " ").title(),
                    "data_types": [dt.value for dt in DataType]
                }
                for provider in APIProvider
            ]
        else:
            providers = [
                {"id": "eiopa", "name": "EIOPA", "data_types": ["loss_triangles", "regulatory_data"]},
                {"id": "willis_towers_watson", "name": "Willis Towers Watson", "data_types": ["loss_triangles"]},
                {"id": "milliman", "name": "Milliman", "data_types": ["loss_triangles"]},
                {"id": "sas", "name": "SAS", "data_types": ["loss_triangles"]}
            ]
        
        return {
            "success": True,
            "providers": providers
        }
        
    except Exception as e:
        logger.error(f"❌ Erreur lors de la récupération des fournisseurs: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@router.get("/data-types/supported")
async def get_supported_data_types():
    """Récupérer les types de données supportés"""
    try:
        if API_CONNECTORS_AVAILABLE:
            data_types = [
                {
                    "id": dt.value,
                    "name": dt.value.replace("_", " ").title(),
                    "description": f"Données de type {dt.value.replace('_', ' ')}"
                }
                for dt in DataType
            ]
        else:
            data_types = [
                {"id": "loss_triangles", "name": "Triangles de Développement", "description": "Triangles de développement des sinistres"},
                {"id": "regulatory_data", "name": "Données Réglementaires", "description": "Données de conformité réglementaire"},
                {"id": "mortality_tables", "name": "Tables de Mortalité", "description": "Tables actuarielles de mortalité"},
                {"id": "interest_rates", "name": "Courbes de Taux", "description": "Taux d'intérêt sans risque"}
            ]
        
        return {
            "success": True,
            "data_types": data_types
        }
        
    except Exception as e:
        logger.error(f"❌ Erreur lors de la récupération des types: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

# ===== TÂCHES EN ARRIÈRE-PLAN =====

async def register_triangle_for_calculations(triangle_data):
    """Enregistre le triangle dans le système de calculs (tâche en arrière-plan)"""
    try:
        # Ici vous pouvez intégrer avec votre système de triangles existant
        # Par exemple, sauvegarder en base de données, notifier les utilisateurs, etc.
        
        logger.info(f"📝 Triangle {triangle_data.triangle_id} enregistré pour les calculs")
        
        # Exemple d'intégration (à adapter selon votre architecture)
        # await save_triangle_to_database(triangle_data)
        # await notify_users_new_triangle(triangle_data)
        
    except Exception as e:
        logger.error(f"❌ Erreur lors de l'enregistrement du triangle: {e}")

# ===== ENDPOINT DE DEBUG =====

@router.get("/debug/status")
async def debug_integration_status():
    """Debug du statut du service d'intégration"""
    return {
        "integration_service": INTEGRATION_SERVICE_AVAILABLE,
        "api_connectors_service": API_CONNECTORS_AVAILABLE,
        "cached_triangles_count": len(api_data_integration_service.cached_triangles) if INTEGRATION_SERVICE_AVAILABLE else 0,
        "available_sources_count": len(MOCK_API_SOURCES),
        "endpoints": [
            "GET /sources",
            "POST /create-triangle",
            "GET /triangles/cached",
            "GET /triangles/{triangle_id}",
            "POST /triangles/{triangle_id}/use-for-calculation",
            "DELETE /triangles/{triangle_id}",
            "DELETE /cache/clear"
        ]
    }