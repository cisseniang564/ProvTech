# backend/app/routers/api_management.py - Router FastAPI pour la gestion des APIs
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from fastapi.responses import JSONResponse
from typing import List, Dict, Any, Optional
import logging
from datetime import datetime

# Import conditionnel pour éviter les erreurs si le service n'est pas disponible
try:
    from ..services.api_connectors import (
        actuarial_api_service,
        APIProvider,
        DataType,
        APIConfigurationRequest,
        DataFetchRequest,
        EndpointRequest,
        APIConfiguration,
        APIEndpoint
    )
    API_SERVICE_AVAILABLE = True
except ImportError as e:
    print(f"Service API non disponible: {e}")
    API_SERVICE_AVAILABLE = False
    # Créer des classes mock pour éviter les erreurs
    class APIProvider:
        EIOPA = "eiopa"
        CUSTOM = "custom"
    
    class DataType:
        LOSS_TRIANGLES = "loss_triangles"
        REGULATORY_DATA = "regulatory_data"

logger = logging.getLogger(__name__)

# Créer le router
router = APIRouter(prefix="/api/v1/external-apis", tags=["External APIs Management"])

# Import conditionnel de verify_token depuis le main
try:
    from ..main import verify_token, find_user_by_id, log_audit
except ImportError:
    # Fallback functions si les imports ne marchent pas
    def verify_token():
        return {"user_id": 1, "email": "admin@provtech.com"}
    
    def find_user_by_id(user_id):
        return {"id": user_id, "role": "ADMIN"}
    
    def log_audit(user_id, action, details, ip):
        logger.info(f"AUDIT: {action} - {details}")

# ===== FONCTIONS UTILITAIRES =====

def _get_provider_description(provider) -> str:
    """Retourne la description d'un fournisseur"""
    descriptions = {
        "eiopa": "Autorité européenne des assurances et des pensions professionnelles",
        "willis_towers_watson": "Conseil en actuariat et gestion des risques",
        "milliman": "Cabinet de conseil actuariel international",
        "aon": "Solutions de gestion des risques et conseil RH",
        "moody_analytics": "Analyses de risque et intelligence économique",
        "sas": "Solutions analytiques pour l'assurance",
        "naic": "Association nationale des commissaires d'assurance (US)",
        "custom": "API personnalisée"
    }
    provider_key = provider.value if hasattr(provider, 'value') else str(provider)
    return descriptions.get(provider_key, "Fournisseur de données actuarielles")

def _get_data_type_description(data_type) -> str:
    """Retourne la description d'un type de données"""
    descriptions = {
        "loss_triangles": "Triangles de développement des sinistres",
        "mortality_tables": "Tables de mortalité",
        "interest_rates": "Courbes de taux d'intérêt",
        "economic_scenarios": "Scénarios économiques",
        "regulatory_data": "Données réglementaires (QRT, Solvency II)",
        "market_data": "Données de marché",
        "claims_data": "Données de sinistres",
        "premium_data": "Données de primes"
    }
    data_type_key = data_type.value if hasattr(data_type, 'value') else str(data_type)
    return descriptions.get(data_type_key, "Type de données actuarielles")

def _check_data_access_permission(user: dict, data_type) -> bool:
    """Vérifie les permissions d'accès aux données"""
    if not API_SERVICE_AVAILABLE:
        return True
        
    data_type_str = data_type.value if hasattr(data_type, 'value') else str(data_type)
    sensitive_data_types = {"regulatory_data", "claims_data"}
    
    if data_type_str in sensitive_data_types:
        return user.get("role") in ["ADMIN", "COMPLIANCE_OFFICER", "ACTUAIRE_SENIOR"]
    
    return True

async def log_data_access(user_id: int, provider: str, data_type: str):
    """Log l'accès aux données externes"""
    logger.info(f"User {user_id} accessed {data_type} from {provider}")

# ===== ENDPOINT DE VÉRIFICATION =====

@router.get("/health", summary="Vérification du service APIs")
async def health_check():
    """Vérifie si le service de gestion des APIs est disponible"""
    return {
        "service": "api_management",
        "status": "available" if API_SERVICE_AVAILABLE else "service_unavailable",
        "timestamp": datetime.utcnow().isoformat(),
        "message": "Service de gestion des APIs externes" + (" opérationnel" if API_SERVICE_AVAILABLE else " limité")
    }

# ===== ENDPOINTS PRINCIPAUX =====

@router.get("/providers", summary="Liste des fournisseurs d'APIs disponibles")
async def get_api_providers(current_user: dict = Depends(verify_token)):
    """Retourne la liste de tous les fournisseurs d'APIs supportés"""
    if not API_SERVICE_AVAILABLE:
        return {
            "providers": [
                {
                    "id": "eiopa",
                    "name": "EIOPA",
                    "description": "Autorité européenne (mode limité)"
                },
                {
                    "id": "custom",
                    "name": "API Personnalisée",
                    "description": "Configuration personnalisée (mode limité)"
                }
            ],
            "warning": "Service API limité - module complet non disponible"
        }
    
    try:
        return {
            "providers": [
                {
                    "id": provider.value,
                    "name": provider.value.replace("_", " ").title(),
                    "description": _get_provider_description(provider)
                }
                for provider in APIProvider
            ]
        }
    except Exception as e:
        logger.error(f"Erreur providers: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/data-types", summary="Types de données disponibles")
async def get_data_types(current_user: dict = Depends(verify_token)):
    """Retourne la liste des types de données actuarielles supportés"""
    if not API_SERVICE_AVAILABLE:
        return {
            "data_types": [
                {
                    "id": "loss_triangles",
                    "name": "Triangles de Développement",
                    "description": "Triangles de développement des sinistres (mode limité)"
                },
                {
                    "id": "regulatory_data",
                    "name": "Données Réglementaires",
                    "description": "Données réglementaires de base (mode limité)"
                }
            ],
            "warning": "Service API limité - types de données restreints"
        }
    
    try:
        return {
            "data_types": [
                {
                    "id": data_type.value,
                    "name": data_type.value.replace("_", " ").title(),
                    "description": _get_data_type_description(data_type)
                }
                for data_type in DataType
            ]
        }
    except Exception as e:
        logger.error(f"Erreur data types: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/status", summary="Statut de toutes les APIs")
async def get_apis_status(current_user: dict = Depends(verify_token)):
    """Retourne le statut de connexion de toutes les APIs configurées"""
    if not API_SERVICE_AVAILABLE:
        return {
            "success": False,
            "timestamp": datetime.utcnow().isoformat(),
            "apis": {},
            "warning": "Service API non disponible - aucune API configurée"
        }
    
    try:
        status = await actuarial_api_service.get_api_status()
        return {
            "success": True,
            "timestamp": datetime.utcnow().isoformat(),
            "apis": status
        }
    except Exception as e:
        logger.error(f"Erreur lors de la récupération du statut: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/configure", summary="Configuration d'une nouvelle API")
async def configure_api(
    config_data: dict,  # Utilisé dict au lieu de APIConfigurationRequest pour compatibilité
    current_user: dict = Depends(verify_token)
):
    """Configure une nouvelle API externe"""
    if not API_SERVICE_AVAILABLE:
        return {
            "success": False,
            "message": "Service API non disponible - configuration impossible",
            "warning": "Module de gestion des APIs externes non configuré"
        }
    
    try:
        # Validation des permissions
        user = find_user_by_id(current_user["user_id"])
        if not user or user["role"] not in ["ADMIN", "API_MANAGER"]:
            raise HTTPException(status_code=403, detail="Permissions insuffisantes")
        
        # Création de la configuration
        config = APIConfiguration(
            provider=APIProvider(config_data.get("provider")),
            name=config_data.get("name"),
            base_url=config_data.get("base_url"),
            api_key=config_data.get("api_key"),
            username=config_data.get("username"),
            password=config_data.get("password"),
            headers=config_data.get("headers", {}),
            timeout=config_data.get("timeout", 30),
            rate_limit=config_data.get("rate_limit", 100),
            enabled=config_data.get("enabled", True)
        )
        
        # Enregistrement
        actuarial_api_service.register_api(config)
        
        # Test de connexion
        connection_test = await actuarial_api_service.test_connection(config.provider)
        
        # Log d'audit
        log_audit(
            current_user["user_id"],
            "API_CONFIGURED",
            f"API {config.provider.value} configurée",
            ""
        )
        
        return {
            "success": True,
            "message": f"API {config.provider.value} configurée avec succès",
            "connection_test": connection_test
        }
        
    except Exception as e:
        logger.error(f"Erreur configuration API: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/fetch", summary="Récupération de données depuis une API")
async def fetch_data(
    fetch_data: dict,  # Utilisé dict au lieu de DataFetchRequest pour compatibilité
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(verify_token)
):
    """Récupère des données depuis une API externe"""
    if not API_SERVICE_AVAILABLE:
        return {
            "success": False,
            "message": "Service API non disponible - récupération impossible",
            "warning": "Module de gestion des APIs externes non configuré"
        }
    
    try:
        provider = APIProvider(fetch_data.get("provider"))
        data_type = DataType(fetch_data.get("data_type"))
        
        # Vérification des permissions
        if not _check_data_access_permission(current_user, data_type):
            raise HTTPException(status_code=403, detail="Accès non autorisé à ce type de données")
        
        # Récupération des données
        response = await actuarial_api_service.fetch_data(
            provider=provider,
            data_type=data_type,
            params=fetch_data.get("params", {}),
            use_cache=fetch_data.get("use_cache", True)
        )
        
        # Log de l'accès aux données en arrière-plan
        background_tasks.add_task(
            log_data_access,
            current_user["user_id"],
            provider.value,
            data_type.value
        )
        
        return {
            "success": True,
            "provider": response.provider.value,
            "data_type": response.data_type.value,
            "timestamp": response.timestamp.isoformat(),
            "data": response.data,
            "metadata": response.metadata
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur récupération données: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/test-connection/{provider_id}", summary="Test de connexion")
async def test_api_connection(
    provider_id: str,
    current_user: dict = Depends(verify_token)
):
    """Teste la connexion à une API spécifique"""
    if not API_SERVICE_AVAILABLE:
        return {
            "success": False,
            "test_result": {
                "provider": provider_id,
                "status": "unavailable",
                "message": "Service API non disponible"
            }
        }
    
    try:
        provider = APIProvider(provider_id)
        result = await actuarial_api_service.test_connection(provider)
        return {
            "success": True,
            "test_result": result
        }
    except Exception as e:
        logger.error(f"Erreur test connexion: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/cache", summary="Vider le cache")
async def clear_api_cache(
    provider_id: Optional[str] = None,
    current_user: dict = Depends(verify_token)
):
    """Vide le cache des APIs (toutes ou une spécifique)"""
    if not API_SERVICE_AVAILABLE:
        return {
            "success": False,
            "message": "Service API non disponible - pas de cache à vider"
        }
    
    try:
        # Vérification des permissions admin
        user = find_user_by_id(current_user["user_id"])
        if not user or user["role"] != "ADMIN":
            raise HTTPException(status_code=403, detail="Permissions administrateur requises")
        
        provider = APIProvider(provider_id) if provider_id else None
        actuarial_api_service.clear_cache(provider)
        
        return {
            "success": True,
            "message": f"Cache vidé" + (f" pour {provider_id}" if provider_id else " pour toutes les APIs")
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur vidage cache: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ===== ENDPOINTS DE CONFIGURATION =====

@router.get("/providers", summary="Liste des fournisseurs d'APIs disponibles")
async def get_api_providers(current_user: dict = Depends(verify_token)):
    """Retourne la liste de tous les fournisseurs d'APIs supportés"""
    return {
        "providers": [
            {
                "id": provider.value,
                "name": provider.value.replace("_", " ").title(),
                "description": _get_provider_description(provider)
            }
            for provider in APIProvider
        ]
    }

@router.get("/data-types", summary="Types de données disponibles")
async def get_data_types(current_user: dict = Depends(verify_token)):
    """Retourne la liste des types de données actuarielles supportés"""
    return {
        "data_types": [
            {
                "id": data_type.value,
                "name": data_type.value.replace("_", " ").title(),
                "description": _get_data_type_description(data_type)
            }
            for data_type in DataType
        ]
    }

@router.get("/status", summary="Statut de toutes les APIs")
async def get_apis_status(current_user: dict = Depends(verify_token)):
    """Retourne le statut de connexion de toutes les APIs configurées"""
    try:
        status = await actuarial_api_service.get_api_status()
        return {
            "success": True,
            "timestamp": datetime.utcnow().isoformat(),
            "apis": status
        }
    except Exception as e:
        logger.error(f"Erreur lors de la récupération du statut: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/configure", summary="Configuration d'une nouvelle API")
async def configure_api(
    config_request: APIConfigurationRequest,
    current_user: dict = Depends(verify_token)
):
    """Configure une nouvelle API externe"""
    try:
        # Validation des permissions (admin requis pour la configuration)
        user = find_user_by_id(current_user["user_id"])  # À adapter selon votre système
        if not user or user["role"] not in ["ADMIN", "API_MANAGER"]:
            raise HTTPException(status_code=403, detail="Permissions insuffisantes")
        
        # Création de la configuration
        config = APIConfiguration(
            provider=config_request.provider,
            name=config_request.name,
            base_url=config_request.base_url,
            api_key=config_request.api_key,
            username=config_request.username,
            password=config_request.password,
            headers=config_request.headers or {},
            timeout=config_request.timeout,
            rate_limit=config_request.rate_limit,
            enabled=config_request.enabled
        )
        
        # Enregistrement
        actuarial_api_service.register_api(config)
        
        # Test de connexion
        connection_test = await actuarial_api_service.test_connection(config.provider)
        
        # Log d'audit
        log_audit(
            current_user["user_id"],
            "API_CONFIGURED",
            f"API {config.provider.value} configurée",
            ""
        )
        
        return {
            "success": True,
            "message": f"API {config.provider.value} configurée avec succès",
            "connection_test": connection_test
        }
        
    except Exception as e:
        logger.error(f"Erreur configuration API: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/endpoints", summary="Ajouter un endpoint personnalisé")
async def add_endpoint(
    endpoint_request: EndpointRequest,
    current_user: dict = Depends(verify_token)
):
    """Ajoute un endpoint personnalisé à un fournisseur d'API"""
    try:
        # Validation des permissions
        user = find_user_by_id(current_user["user_id"])
        if not user or user["role"] not in ["ADMIN", "API_MANAGER"]:
            raise HTTPException(status_code=403, detail="Permissions insuffisantes")
        
        # Création de l'endpoint
        endpoint = APIEndpoint(
            path=endpoint_request.path,
            method=endpoint_request.method,
            data_type=endpoint_request.data_type,
            params=endpoint_request.params or {},
            response_format=endpoint_request.response_format,
            transform_function=endpoint_request.transform_function
        )
        
        # Enregistrement
        actuarial_api_service.register_endpoint(endpoint_request.provider, endpoint)
        
        return {
            "success": True,
            "message": f"Endpoint ajouté pour {endpoint_request.provider.value}",
            "endpoint": {
                "path": endpoint.path,
                "method": endpoint.method,
                "data_type": endpoint.data_type.value
            }
        }
        
    except Exception as e:
        logger.error(f"Erreur ajout endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ===== ENDPOINTS DE RÉCUPÉRATION DE DONNÉES =====

@router.post("/fetch", summary="Récupération de données depuis une API")
async def fetch_data(
    fetch_request: DataFetchRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(verify_token)
):
    """Récupère des données depuis une API externe"""
    try:
        # Vérification des permissions pour le type de données
        if not _check_data_access_permission(current_user, fetch_request.data_type):
            raise HTTPException(status_code=403, detail="Accès non autorisé à ce type de données")
        
        # Récupération des données
        response = await actuarial_api_service.fetch_data(
            provider=fetch_request.provider,
            data_type=fetch_request.data_type,
            params=fetch_request.params,
            use_cache=fetch_request.use_cache
        )
        
        # Log de l'accès aux données en arrière-plan
        background_tasks.add_task(
            log_data_access,
            current_user["user_id"],
            fetch_request.provider.value,
            fetch_request.data_type.value
        )
        
        return {
            "success": True,
            "provider": response.provider.value,
            "data_type": response.data_type.value,
            "timestamp": response.timestamp.isoformat(),
            "data": response.data,
            "metadata": response.metadata
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur récupération données: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/triangles/{provider}", summary="Récupération de triangles depuis une API")
async def fetch_triangles(
    provider: APIProvider,
    line_of_business: str,
    period: Optional[str] = None,
    use_cache: bool = True,
    current_user: dict = Depends(verify_token)
):
    """Endpoint spécialisé pour récupérer des triangles de développement"""
    try:
        params = {"lob": line_of_business}
        if period:
            params["period"] = period
        
        response = await actuarial_api_service.fetch_data(
            provider=provider,
            data_type=DataType.LOSS_TRIANGLES,
            params=params,
            use_cache=use_cache
        )
        
        # Format spécial pour les triangles
        triangle_data = response.data
        
        return {
            "success": True,
            "triangle_id": f"{provider.value}_{line_of_business}_{period or 'latest'}",
            "triangle_name": f"Triangle {line_of_business} - {provider.value}",
            "data": triangle_data.get("triangle", []),
            "metadata": {
                "currency": triangle_data.get("currency", "EUR"),
                "line_of_business": triangle_data.get("line_of_business", line_of_business),
                "source": provider.value,
                "api_timestamp": response.timestamp.isoformat(),
                **response.metadata
            }
        }
        
    except Exception as e:
        logger.error(f"Erreur récupération triangles: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/regulatory-data/{provider}", summary="Données réglementaires")
async def fetch_regulatory_data(
    provider: APIProvider,
    country: str = "FR",
    reporting_date: Optional[str] = None,
    template_id: Optional[str] = None,
    current_user: dict = Depends(verify_token)
):
    """Récupère des données réglementaires (EIOPA, QRT, etc.)"""
    try:
        # Vérification des permissions réglementaires
        user = find_user_by_id(current_user["user_id"])
        if not user or user["role"] not in ["ADMIN", "COMPLIANCE_OFFICER", "ACTUAIRE_SENIOR"]:
            raise HTTPException(status_code=403, detail="Accès réglementaire non autorisé")
        
        params = {"country": country}
        if reporting_date:
            params["date"] = reporting_date
        if template_id:
            params["template"] = template_id
        
        response = await actuarial_api_service.fetch_data(
            provider=provider,
            data_type=DataType.REGULATORY_DATA,
            params=params,
            use_cache=True
        )
        
        return {
            "success": True,
            "provider": provider.value,
            "country": country,
            "reporting_date": reporting_date,
            "data": response.data,
            "compliance_metadata": {
                "data_source": "external_api",
                "provider": provider.value,
                "timestamp": response.timestamp.isoformat(),
                "validation_required": True
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur données réglementaires: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ===== ENDPOINTS DE GESTION =====

@router.get("/endpoints/{provider}", summary="Liste des endpoints d'un fournisseur")
async def get_provider_endpoints(
    provider: APIProvider,
    current_user: dict = Depends(verify_token)
):
    """Retourne la liste des endpoints disponibles pour un fournisseur"""
    try:
        endpoints = await actuarial_api_service.get_available_endpoints(provider)
        return {
            "success": True,
            "provider": provider.value,
            "endpoints": endpoints
        }
    except Exception as e:
        logger.error(f"Erreur récupération endpoints: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/test-connection/{provider}", summary="Test de connexion")
async def test_api_connection(
    provider: APIProvider,
    current_user: dict = Depends(verify_token)
):
    """Teste la connexion à une API spécifique"""
    try:
        result = await actuarial_api_service.test_connection(provider)
        return {
            "success": True,
            "test_result": result
        }
    except Exception as e:
        logger.error(f"Erreur test connexion: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/cache", summary="Vider le cache")
async def clear_api_cache(
    provider: Optional[APIProvider] = None,
    current_user: dict = Depends(verify_token)
):
    """Vide le cache des APIs (toutes ou une spécifique)"""
    try:
        # Vérification des permissions admin
        user = find_user_by_id(current_user["user_id"])
        if not user or user["role"] != "ADMIN":
            raise HTTPException(status_code=403, detail="Permissions administrateur requises")
        
        actuarial_api_service.clear_cache(provider)
        
        return {
            "success": True,
            "message": f"Cache vidé" + (f" pour {provider.value}" if provider else " pour toutes les APIs")
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur vidage cache: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/usage-stats", summary="Statistiques d'utilisation des APIs")
async def get_api_usage_stats(current_user: dict = Depends(verify_token)):
    """Retourne les statistiques d'utilisation des APIs externes"""
    try:
        # Récupération des statistiques depuis les logs d'audit
        # (à adapter selon votre système de logs)
        
        stats = {
            "total_requests": 0,
            "requests_by_provider": {},
            "requests_by_data_type": {},
            "cache_hit_rate": 0,
            "average_response_time": 0,
            "error_rate": 0
        }
        
        # Calcul des statistiques depuis la base d'audit
        # TODO: Implémenter la logique de récupération des stats
        
        return {
            "success": True,
            "stats": stats,
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Erreur statistiques APIs: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ===== ENDPOINTS D'INTÉGRATION AVEC LES TRIANGLES =====

@router.post("/import-triangle-from-api", summary="Import direct triangle vers système")
async def import_triangle_from_api(
    provider: APIProvider,
    line_of_business: str,
    triangle_name: Optional[str] = None,
    period: Optional[str] = None,
    current_user: dict = Depends(verify_token)
):
    """Importe directement un triangle depuis une API vers le système interne"""
    try:
        # Récupération du triangle
        triangle_response = await fetch_triangles(
            provider=provider,
            line_of_business=line_of_business,
            period=period,
            current_user=current_user
        )
        
        if not triangle_response["success"]:
            raise HTTPException(status_code=400, detail="Erreur récupération triangle")
        
        # Préparation pour l'import dans le système
        triangle_data = {
            "name": triangle_name or triangle_response["triangle_name"],
            "data": triangle_response["data"],
            "metadata": {
                **triangle_response["metadata"],
                "import_source": "external_api",
                "api_provider": provider.value,
                "imported_by": current_user["user_id"],
                "import_timestamp": datetime.utcnow().isoformat()
            }
        }
        
        # TODO: Intégrer avec votre système d'import de triangles existant
        # Par exemple, appeler un service qui sauvegarde le triangle
        
        # Log de l'import
        log_audit(
            current_user["user_id"],
            "TRIANGLE_IMPORTED_FROM_API",
            f"Triangle {line_of_business} importé depuis {provider.value}",
            ""
        )
        
        return {
            "success": True,
            "message": "Triangle importé avec succès",
            "triangle_id": triangle_response["triangle_id"],
            "triangle_name": triangle_data["name"],
            "data_points": len(triangle_response["data"])
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur import triangle API: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ===== FONCTIONS UTILITAIRES =====

def _get_provider_description(provider: APIProvider) -> str:
    """Retourne la description d'un fournisseur"""
    descriptions = {
        APIProvider.EIOPA: "Autorité européenne des assurances et des pensions professionnelles",
        APIProvider.WILLIS_TOWERS_WATSON: "Conseil en actuariat et gestion des risques",
        APIProvider.MILLIMAN: "Cabinet de conseil actuariel international",
        APIProvider.AON: "Solutions de gestion des risques et conseil RH",
        APIProvider.MOODY_ANALYTICS: "Analyses de risque et intelligence économique",
        APIProvider.SAS: "Solutions analytiques pour l'assurance",
        APIProvider.NAIC: "Association nationale des commissaires d'assurance (US)",
        APIProvider.CUSTOM: "API personnalisée"
    }
    return descriptions.get(provider, "Fournisseur de données actuarielles")

def _get_data_type_description(data_type: DataType) -> str:
    """Retourne la description d'un type de données"""
    descriptions = {
        DataType.LOSS_TRIANGLES: "Triangles de développement des sinistres",
        DataType.MORTALITY_TABLES: "Tables de mortalité",
        DataType.INTEREST_RATES: "Courbes de taux d'intérêt",
        DataType.ECONOMIC_SCENARIOS: "Scénarios économiques",
        DataType.REGULATORY_DATA: "Données réglementaires (QRT, Solvency II)",
        DataType.MARKET_DATA: "Données de marché",
        DataType.CLAIMS_DATA: "Données de sinistres",
        DataType.PREMIUM_DATA: "Données de primes"
    }
    return descriptions.get(data_type, "Type de données actuarielles")

def _check_data_access_permission(user: dict, data_type: DataType) -> bool:
    """Vérifie les permissions d'accès aux données"""
    # Logique de permissions selon le type de données
    sensitive_data_types = {DataType.REGULATORY_DATA, DataType.CLAIMS_DATA}
    
    if data_type in sensitive_data_types:
        # Vérifier si l'utilisateur a les permissions pour les données sensibles
        return user.get("role") in ["ADMIN", "COMPLIANCE_OFFICER", "ACTUAIRE_SENIOR"]
    
    return True  # Autres types accessibles à tous les utilisateurs authentifiés

async def log_data_access(user_id: int, provider: str, data_type: str):
    """Log l'accès aux données externes"""
    # TODO: Intégrer avec votre système de logs d'audit
    logger.info(f"User {user_id} accessed {data_type} from {provider}")

# Import de la fonction log_audit depuis votre système principal
def log_audit(user_id: int, action: str, details: str, ip_address: str):
    """Fonction de log d'audit (à adapter selon votre système)"""
    # TODO: Utiliser votre système d'audit existant
    logger.info(f"AUDIT: User {user_id} - {action} - {details}")

def find_user_by_id(user_id: int):
    """Fonction pour récupérer un utilisateur (à adapter selon votre système)"""
    # TODO: Intégrer avec votre système d'authentification
    return {"id": user_id, "role": "ADMIN"}  # Exemple